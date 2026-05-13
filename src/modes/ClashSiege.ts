import { Brawler } from "../entities/Brawler";
import { applyZafkielStarEffectsOnHit } from "../utils/zafkielStars";
import { Bot } from "../entities/Bot";
import { BRAWLERS, getBrawlerById, pickBotStats } from "../entities/BrawlerData";
import { createCrystalsMap, createTileGridMap, GameMap, renderMap, renderTileGrid } from "../game/MapRenderer";
import { getPublishedMap, OV } from "../utils/mapEditorAPI";
import { TileGrid, TILE_CELL_SIZE, GRID_SIZE, paintMountainBorderRing } from "../game/TileMap";
import { Projectile, updateProjectiles, renderProjectiles } from "../entities/Projectile";
import { Camera } from "../game/Camera";
import { InputHandler } from "../game/InputHandler";
import { updateDamageNumbers, renderDamageNumbers, clearDamageNumbers, spawnDamageNumber } from "../utils/damageNumbers";
import { updateEffects, renderEffects, clearEffects } from "../utils/effects";
import { angleTo, autoAimAngle, autoAimTarget, distance, randomInt } from "../utils/helpers";
import { recordGameResult, getCurrentUsername, getCurrentProfile } from "../utils/localStorageAPI";
import { getPetById } from "../entities/PetData";
import { resetMatchStats, getMatchStats } from "../utils/matchStats";
import { renderPlayerHUD } from "./sharedHUD";
import { getSafeCanvas } from "../utils/powerModelCache";
import { fillBattleCanvasBg, renderBattleScreenFX } from "../game/battleScreenFX";
import { isDevBattleWorldFrozen } from "../game/battleDevPause";

interface CrystalParticle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; angle: number; spin: number;
  color: string;
}

const GAME_ZOOM = 1.4;
const CAM_W = Math.round(1200 / GAME_ZOOM);
const CAM_H = Math.round(800 / GAME_ZOOM);

export class ClashSiege {
  map: GameMap;
  player: Brawler;
  allies: Bot[] = [];
  enemies: Bot[] = [];
  projectiles: Projectile[] = [];
  crystalParticles: CrystalParticle[] = [];
  baseExploded = false;
  respawnTimers: Map<string, number> = new Map();
  playerRespawnTimer = 0;
  camera: Camera;
  input: InputHandler;

  baseHp = 100000;
  baseMaxHp = 100000;
  baseX = 1750;
  baseY = 1750;

  wave = 1;
  maxWaves = 3;
  waveSpawnTimer = 3;
  enemiesToSpawn = 3;
  waveCleared = false;

  over = false;
  won = false;
  frame = 0;
  spriteLoaded: boolean;
  private resultRecorded = false;

  constructor(canvas: HTMLCanvasElement, playerBrawlerId: string, playerLevel: number, onAttack: () => void, onSuper: () => void, spriteLoaded: boolean) {
    this.map = createCrystalsMap();
    this.spriteLoaded = spriteLoaded;
    const playerStats = getBrawlerById(playerBrawlerId) || BRAWLERS[0];
    this.player = new Brawler(playerStats, playerLevel, 1750, 1900, "blue", true);
    this.player.setIdentity(getCurrentUsername() ?? "Игрок", false);
    this.player.setEquippedPet(getPetById(getCurrentProfile()?.equippedPetId) ?? null);
    resetMatchStats();
    // Spawn 3 allied bots to defend the base together with the player
    const allyStats = BRAWLERS.filter(b => b.id !== playerBrawlerId);
    const allyPos: Array<{ x: number; y: number }> = [
      { x: 1500, y: 1900 },
      { x: 2000, y: 1900 },
      { x: 1750, y: 2150 },
    ];
    for (let i = 0; i < 3; i++) {
      const stats = allyStats[i % allyStats.length];
      this.allies.push(new Bot(stats, Math.max(1, playerLevel - 1), allyPos[i].x, allyPos[i].y, "blue"));
    }
    this.camera = new Camera(CAM_W, CAM_H, this.map.width, this.map.height);
    this.input = new InputHandler(canvas, onAttack, onSuper);

    // ── Load published map if one exists ──────────────────────────────────
    const pubMap = getPublishedMap("siege");
    if (pubMap && pubMap.cells && pubMap.cells.length === GRID_SIZE * GRID_SIZE) {
      const tileGrid: TileGrid = {
        cells: new Uint8Array(GRID_SIZE * GRID_SIZE),
        destroyed: new Uint8Array(GRID_SIZE * GRID_SIZE),
        width: GRID_SIZE, height: GRID_SIZE, cellSize: TILE_CELL_SIZE,
      };
      for (let i = 0; i < pubMap.cells.length; i++) tileGrid.cells[i] = pubMap.cells[i];
      paintMountainBorderRing(tileGrid, 10);
      this.map = createTileGridMap(tileGrid, pubMap.name);
      this.camera = new Camera(CAM_W, CAM_H, this.map.width, this.map.height);
      if (pubMap.overlays && pubMap.overlays.length === GRID_SIZE * GRID_SIZE) {
        const C = TILE_CELL_SIZE, ovs = pubMap.overlays;
        let blueSpawns: Array<{x:number;y:number}> = [];
        for (let i = 0; i < ovs.length; i++) {
          const tx = i % GRID_SIZE, ty = Math.floor(i / GRID_SIZE);
          const wx = (tx + 0.5) * C, wy = (ty + 0.5) * C;
          if (ovs[i] === OV.SPAWN_BLUE)  blueSpawns.push({x: wx, y: wy});
          else if (ovs[i] === OV.BASE_BLUE) { this.baseX = wx; this.baseY = wy; }
        }
        blueSpawns = blueSpawns.sort(() => Math.random() - 0.5);
        if (blueSpawns[0]) { this.player.x = blueSpawns[0].x; this.player.y = blueSpawns[0].y; }
        if (blueSpawns[1]) { this.allies[0].x = blueSpawns[1].x; this.allies[0].y = blueSpawns[1].y; }
        if (blueSpawns[2]) { this.allies[1].x = blueSpawns[2].x; this.allies[1].y = blueSpawns[2].y; }
        if (blueSpawns[3]) { this.allies[2].x = blueSpawns[3].x; this.allies[2].y = blueSpawns[3].y; }
      }
    }
  }

  handleAttack(): void {
    if (!this.player.canAttack()) return;
    const mouseAngle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    const angle = this.input.attackJoystick.active ? mouseAngle : autoAimAngle(this.player, this.enemies, mouseAngle);
    this.player.angle = angle;
    const isMelee = ["goro", "ronin", "taro"].includes(this.player.stats.id);
    const all = [this.player, ...this.allies, ...this.enemies];
    if (isMelee) this.player.meleeAttack(all);
    else this.projectiles.push(...this.player.shoot(angle));
  }
  handleSuper(): void {
    if (!this.player.canUseSuper()) return;
    const autoTarget = this.input.superJoystick.active
      ? null
      : autoAimTarget(this.player, this.enemies, 1.0);
    const aimX = autoTarget ? autoTarget.x : this.input.state.mouseWorldX;
    const aimY = autoTarget ? autoTarget.y : this.input.state.mouseWorldY;
    const mouseAngle = angleTo(this.player.x, this.player.y, aimX, aimY);
    this.player.angle = this.input.superJoystick.active
      ? mouseAngle
      : autoAimAngle(this.player, this.enemies, mouseAngle, 1.0);
    this.player.activateSuper([this.player, ...this.allies, ...this.enemies], this.map, this.projectiles, aimX, aimY);
  }

  private spawnWave(): void {
    const enemyCount = 2 + this.wave;
    const enemyLevel = Math.min(10, this.wave * 2);
    const allStats = BRAWLERS.filter(b => b.id !== this.player.stats.id);
    for (let i = 0; i < enemyCount; i++) {
      const stats = allStats[randomInt(0, allStats.length - 1)];
      const angle = (i / enemyCount) * Math.PI * 2;
      const r = 1400;
      const ex = this.baseX + Math.cos(angle) * r;
      const ey = this.baseY + Math.sin(angle) * r;
      const ecx = Math.max(200, Math.min(this.map.width - 200, ex));
      const ecy = Math.max(200, Math.min(this.map.height - 200, ey));
      this.enemies.push(new Bot(stats, enemyLevel, ecx, ecy, "red"));
    }
    this.enemiesToSpawn = enemyCount;
    this.waveCleared = false;
  }

  update(dt: number): void {
    if (this.over) return;
    const fr = isDevBattleWorldFrozen();
    const sim = fr ? 0 : dt;
    if (!fr) this.frame++;
    const { up, down, left, right } = this.input.state;
    let dx = 0, dy = 0;
    if (up) dy -= 1; if (down) dy += 1; if (left) dx -= 1; if (right) dx += 1;
    if (dx !== 0 || dy !== 0) this.player.move(dx, dy, dt);

    this.camera.follow(this.player.x, this.player.y);
    this.input.updateWorldMouse(this.camera.x, this.camera.y, this.player.x, this.player.y, GAME_ZOOM);
    this.player.angle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);

    const all = [this.player, ...this.allies, ...this.enemies];
    this.player.update(dt, this.map);

    // Spawn waves
    if (this.waveCleared || this.enemies.length === 0) {
      this.waveSpawnTimer -= sim;
      if (this.waveSpawnTimer <= 0) {
        if (this.wave > this.maxWaves) {
          this.over = true; this.won = true;
          if (!this.resultRecorded) { const ms = getMatchStats(); recordGameResult({ won: true, mode: "siege", brawlerId: this.player.stats.id, place: 1, ...ms }); this.resultRecorded = true; }
          return;
        }
        this.spawnWave();
        this.waveSpawnTimer = 3;
      }
    }

    if (!fr) {
      // Allies defend the base — patrol around it and engage enemies that come close
      for (const ally of this.allies) {
        if (!ally.alive) continue;
        // Pick the nearest enemy as a roaming target if any are reasonably close to base
        let bestEnemy: Bot | null = null;
        let bestDist = 99999;
        for (const en of this.enemies) {
          if (!en.alive) continue;
          const d = distance(en.x, en.y, this.baseX, this.baseY);
          if (d < 700 && d < bestDist) { bestDist = d; bestEnemy = en; }
        }
        if (bestEnemy) {
          ally.forcedTarget = { x: bestEnemy.x, y: bestEnemy.y };
        } else {
          // Stay near base
          ally.forcedTarget = { x: this.baseX + Math.cos(ally.id.charCodeAt(0)) * 200, y: this.baseY + Math.sin(ally.id.charCodeAt(0)) * 200 };
        }
        ally.update(sim, this.map);
        ally.updateAI(sim, all, this.map, this.projectiles);
      }

      // Bots target nearby defenders if any are close, otherwise march on the base
      const defenders: Brawler[] = [this.player, ...this.allies].filter(b => b.alive);
      for (const bot of this.enemies) {
        if (!bot.alive) continue;
        let nearestDef: Brawler | null = null;
        let nd = 99999;
        for (const def of defenders) {
          const d = distance(bot.x, bot.y, def.x, def.y);
          if (d < nd) { nd = d; nearestDef = def; }
        }
        if (nearestDef && nd < 600) {
          // Engage the defender (they will path toward it and attack via normal AI)
          bot.forcedTarget = { x: nearestDef.x, y: nearestDef.y };
        } else {
          bot.forcedTarget = { x: this.baseX, y: this.baseY };
        }
        bot.update(sim, this.map);
        bot.updateAI(sim, all, this.map, this.projectiles);

        // Always damage the base when in melee range
        const dBase = distance(bot.x, bot.y, this.baseX, this.baseY);
        if (dBase < 110 && bot.attackTimer <= 0 && bot.canAttack()) {
          const dmg = bot.scaledDamage * 0.4;
          this.baseHp -= dmg;
          spawnDamageNumber(this.baseX, this.baseY - 50, Math.floor(dmg), "damage");
          bot.attackTimer = bot.stats.attackCooldown;
        }
      }
    }

    // Respawn fallen allies after a delay so the team stays alive
    for (const ally of this.allies) {
      if (!ally.alive && !this.respawnTimers.has(ally.id)) {
        this.respawnTimers.set(ally.id, 6);
      }
    }
    for (const [id, timer] of this.respawnTimers) {
      const nt = timer - sim;
      this.respawnTimers.set(id, nt);
      if (nt <= 0) {
        this.respawnTimers.delete(id);
        const ally = this.allies.find(a => a.id === id);
        if (ally) {
          ally.alive = true;
          ally.hp = ally.maxHp;
          ally.x = this.baseX + randomInt(-200, 200);
          ally.y = this.baseY + randomInt(150, 280);
        }
      }
    }

    updateProjectiles(this.projectiles, sim, this.map);
    this.handleProjectileHits(all, fr);
    this.projectiles = this.projectiles.filter(p => p.active);

    // Remove dead enemies, advance wave when all dead
    const aliveEnemies = this.enemies.filter(e => e.alive);
    if (aliveEnemies.length === 0 && !this.waveCleared && this.enemies.length > 0) {
      this.waveCleared = true;
      this.wave++;
      this.waveSpawnTimer = 4;
      this.enemies = [];
      // Heal player a bit between waves
      this.player.heal(this.player.maxHp * 0.3);
      this.baseHp = Math.min(this.baseMaxHp, this.baseHp + 300);
    }

    // Player respawn (team mode): death does NOT end the match
    if (!this.player.alive) {
      if (this.playerRespawnTimer <= 0) {
        this.playerRespawnTimer = 5;
      } else {
        this.playerRespawnTimer -= sim;
        if (this.playerRespawnTimer <= 0) {
          this.player.respawn(1750, 1900);
        }
      }
    }
    // Loss only if the base falls
    if (this.baseHp <= 0 && !this.baseExploded) {
      this.baseExploded = true;
      this.spawnCrystalExplosion(this.baseX, this.baseY);
    }
    if (this.baseHp <= 0) {
      this.over = true; this.won = false;
      if (!this.resultRecorded) { const ms = getMatchStats(); recordGameResult({ won: false, mode: "siege", brawlerId: this.player.stats.id, place: 2, ...ms }); this.resultRecorded = true; }
    }
    // Update crystal particles
    for (let i = this.crystalParticles.length - 1; i >= 0; i--) {
      const p = this.crystalParticles[i];
      p.x += p.vx * sim * 60;
      p.y += p.vy * sim * 60;
      p.vy += 0.18 * sim * 60;
      p.angle += p.spin * sim * 60;
      p.life -= sim;
      if (p.life <= 0) this.crystalParticles.splice(i, 1);
    }
    updateDamageNumbers(sim);
    updateEffects(sim, [this.player, ...this.allies, ...this.enemies]);
  }

  private spawnCrystalExplosion(x: number, y: number): void {
    const colors = ["#00BCD4", "#26C6DA", "#4DD0E1", "#80DEEA", "#B2EBF2", "#00ACC1", "#006064"];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      this.crystalParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2.5,
        life: 1.5 + Math.random() * 2,
        maxLife: 3.5,
        size: 5 + Math.random() * 10,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.18,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  private handleProjectileHits(all: Brawler[], fr: boolean): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      if (fr && proj.ownerId !== this.player.id) continue;
      for (const b of all) {
        if (!b.alive) continue;
        if (b.id === proj.ownerId) continue;
        if (proj.hitIds.has(b.id)) continue;
        if (proj.ownerTeam === b.team) continue;
        const d = distance(proj.x, proj.y, b.x, b.y);
        if (d < proj.radius + b.radius) {
          const attacker = all.find(bw => bw.id === proj.ownerId) || null;
          b.takeDamage(proj.damage, attacker);
          if (proj.slow) b.addStatus("slow", 1, 0.3);
          if (proj.poison) b.addStatus("poison", 3, 100);
          applyZafkielStarEffectsOnHit(attacker as any, b as any, proj, { width: this.map.width, height: this.map.height });
          proj.hitIds.add(b.id);
          if (!proj.piercing) { proj.active = false; break; }
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    fillBattleCanvasBg(ctx);
    ctx.save();
    ctx.scale(GAME_ZOOM, GAME_ZOOM);
    renderMap(ctx, this.map, this.camera.x, this.camera.y, CAM_W, CAM_H, this.frame);
    if (this.map.tileGrid) renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, false);

    // Render base as a vault safe
    if (this.baseHp > 0) {
      this.renderBase(ctx);
    }
    this.renderCrystalParticles(ctx);

    const all = [this.player, ...this.allies, ...this.enemies];
    const _friendlies = [this.player, ...this.allies].filter(b => b.alive).map(b => ({ x: b.x, y: b.y }));
    for (const b of all) b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, _friendlies);
    if (this.map.tileGrid) renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, true);
    renderProjectiles(ctx, this.projectiles, this.camera.x, this.camera.y, this.frame);
    renderEffects(ctx, this.camera.x, this.camera.y, this.frame);
    renderDamageNumbers(ctx, this.camera.x, this.camera.y);
    ctx.restore();
    renderBattleScreenFX(ctx, 1200, 800, this.frame, this.player);
    this.renderHUD(ctx);
  }

  private renderCrystalParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.crystalParticles) {
      const sx = p.x - this.camera.x;
      const sy = p.y - this.camera.y;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.angle);
      ctx.globalAlpha = alpha;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.5, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s * 0.5, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(s * 0.2, 0);
      ctx.lineTo(0, s * 0.25);
      ctx.lineTo(-s * 0.2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderBase(ctx: CanvasRenderingContext2D): void {
    const sx = this.baseX - this.camera.x;
    const sy = this.baseY - this.camera.y;
    const hpRatio = Math.max(0, this.baseHp / this.baseMaxHp);
    const W = 120, H = 120;
    const safeSprite = getSafeCanvas();

    ctx.save();

    // Drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(sx + 6, sy + H / 2 + 12, 70, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = "#4CAF50";
    ctx.shadowBlur = 28;

    if (safeSprite) {
      const D = W * 2.2;
      ctx.globalAlpha = hpRatio < 0.25 ? 0.55 : 1;
      ctx.drawImage(safeSprite, sx - D / 2, sy - D / 2, D, D);
      ctx.globalAlpha = 1;
      // Green allied tint
      ctx.fillStyle = "rgba(50,180,80,0.18)";
      ctx.fillRect(sx - D / 2, sy - D / 2, D, D);
    } else {
      // Canvas 2D fallback while GLB loads
      ctx.shadowBlur = 0;
      const bodyGrad = ctx.createLinearGradient(sx - W/2, sy - H/2, sx + W/2, sy + H/2);
      bodyGrad.addColorStop(0, "#546E7A");
      bodyGrad.addColorStop(1, "#263238");
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(sx - W/2, sy - H/2, W, H);
      ctx.fillStyle = "#FFD700";
      ctx.font = `bold ${Math.round(W * 0.44)}px Arial`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("🔒", sx, sy);
    }

    ctx.shadowBlur = 0;

    // Damage cracks
    if (hpRatio < 0.6) {
      ctx.strokeStyle = "rgba(255,100,0,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - W * 0.3, sy - H * 0.2);
      ctx.lineTo(sx, sy + H * 0.05);
      ctx.lineTo(sx - W * 0.15, sy + H * 0.3);
      ctx.stroke();
      if (hpRatio < 0.3) {
        ctx.beginPath();
        ctx.moveTo(sx + W * 0.2, sy - H * 0.3);
        ctx.lineTo(sx + W * 0.05, sy + H * 0.1);
        ctx.lineTo(sx + W * 0.3, sy + H * 0.35);
        ctx.stroke();
      }
    }

    // HP bar
    const barW = W * 1.25;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(sx - barW / 2 - 1, sy - H / 2 - 20, barW + 2, 13);
    ctx.fillStyle = hpRatio > 0.5 ? "#4CAF50" : hpRatio > 0.25 ? "#FFB300" : "#F44336";
    ctx.fillRect(sx - barW / 2, sy - H / 2 - 19, barW * hpRatio, 11);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 0.5;
    ctx.strokeRect(sx - barW / 2, sy - H / 2 - 19, barW, 11);
    // HP percentage text (top style)
    const basePct = Math.round(hpRatio * 100);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
    ctx.fillText(`${basePct}%`, sx, sy - H / 2 - 13);
    ctx.shadowBlur = 0;
    // Exact HP on the safe itself
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 5;
    ctx.fillText(`${Math.max(0, Math.round(this.baseHp))} HP`, sx, sy + H * 0.34);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  private renderHUD(ctx: CanvasRenderingContext2D): void {
    renderPlayerHUD(ctx, this.player);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(490, 5, 220, 60);
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    const wDisp = Math.min(this.wave, this.maxWaves);
    ctx.fillText(`Волна ${wDisp} / ${this.maxWaves}`, 600, 28);
    ctx.fillStyle = "white";
    ctx.font = "bold 13px Arial";
    const aliveCount = this.enemies.filter(e => e.alive).length;
    if (aliveCount > 0) {
      ctx.fillText(`Врагов: ${aliveCount}`, 600, 50);
    } else if (this.wave <= this.maxWaves) {
      ctx.fillStyle = "#69F0AE";
      ctx.fillText(`Следующая волна через ${Math.max(0, this.waveSpawnTimer).toFixed(1)}с`, 600, 50);
    }

    ctx.fillStyle = "rgba(50,180,80,0.55)";
    ctx.fillRect(1045, 8, 150, 50);
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(1045, 8, 150, 50);
    ctx.fillStyle = "#4CAF50";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText("БАЗА", 1120, 22);
    const hpRatio = Math.max(0, this.baseHp / this.baseMaxHp);
    const hudBarColor = hpRatio > 0.5 ? "#4CAF50" : hpRatio > 0.25 ? "#FFB300" : "#F44336";
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(1055, 28, 130, 13);
    ctx.fillStyle = hudBarColor;
    ctx.fillRect(1055, 28, 130 * hpRatio, 13);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(1055, 28, 130, 13);
    ctx.fillStyle = "white";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(`${Math.round(hpRatio * 100)}%`, 1120, 50);
    ctx.restore();
  }

  getParticipants(): import("../types/gameResult").GameParticipant[] {
    const fakeTrophies = (name: string) => 300 + ((name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 5) * 13) % 1700);
    const profile = getCurrentProfile();
    const uniqueEnemies = this.enemies.slice(0, 3);
    return [
      { brawlerId: this.player.stats.id, displayName: this.player.displayName || "Игрок", team: "blue", isPlayer: true, level: this.player.level, trophies: profile?.trophies ?? 0 },
      ...this.allies.map(b => ({ brawlerId: b.stats.id, displayName: b.displayName || "Бот", team: "blue", isPlayer: false, level: b.level, trophies: fakeTrophies(b.displayName || "B") })),
      ...uniqueEnemies.map(b => ({ brawlerId: b.stats.id, displayName: b.displayName || "Бот", team: "red", isPlayer: false, level: b.level, trophies: fakeTrophies(b.displayName || "B") })),
    ];
  }

  destroy(): void { this.input.destroy(); clearDamageNumbers(); clearEffects(); }
}
