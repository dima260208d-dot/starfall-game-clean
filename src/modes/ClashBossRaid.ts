import { Brawler } from "../entities/Brawler";
import { applyZafkielStarEffectsOnHit } from "../utils/zafkielStars";
import { Bot } from "../entities/Bot";
import { BRAWLERS, getBrawlerById } from "../entities/BrawlerData";
import { createCrystalsMap, GameMap, renderMap, renderTileGrid } from "../game/MapRenderer";
import { Projectile, updateProjectiles, renderProjectiles } from "../entities/Projectile";
import { Camera } from "../game/Camera";
import { InputHandler } from "../game/InputHandler";
import { updateDamageNumbers, renderDamageNumbers } from "../utils/damageNumbers";
import { updateEffects, renderEffects } from "../utils/effects";
import { angleTo, autoAimAngle, autoAimTarget, distance, randomInt } from "../utils/helpers";
import { recordGameResult, getCurrentUsername, getCurrentProfile } from "../utils/localStorageAPI";
import { getPetById } from "../entities/PetData";
import { resetMatchStats, getMatchStats } from "../utils/matchStats";
import { fillBattleCanvasBg, renderBattleScreenFX } from "../game/battleScreenFX";
import { isDevBattleWorldFrozen } from "../game/battleDevPause";
import { renderPlayerHUD } from "./sharedHUD";
import { bossIgnoresCc, cameraShakePx, computeBossOverlay, phaseMoveSpeedMul, type BossRaidOverlayPhase } from "./bossRaid/bossRaidPhases";
import { pickAllyBrawlers, tickRaidBossAI } from "./bossRaid/bossRaidAttacks";
import type { GameParticipant } from "../types/gameResult";

const GAME_ZOOM = 1.4;
const CAM_W = Math.round(1200 / GAME_ZOOM);
const CAM_H = Math.round(800 / GAME_ZOOM);

export class ClashBossRaid {
  map: GameMap;
  player: Brawler;
  allies: Bot[] = [];
  boss: Brawler;
  /** Minimap / counters: single boss as red team. */
  enemies: Brawler[] = [];
  projectiles: Projectile[] = [];
  camera: Camera;
  input: InputHandler;

  over = false;
  won = false;
  frame = 0;
  spriteLoaded: boolean;

  raidLevel: number;
  bossBrawlerId: string;
  private resultRecorded = false;
  private respawnTimers = new Map<string, number>();
  private playerSpawnX = 600;
  private playerSpawnY = 1750;
  private allySpawns: Array<{ id: string; x: number; y: number }> = [];
  private matchTime = 0;
  rage = 0;
  private prevBossHp: number;
  private attackCdRef = { current: 0 };
  private patternTRef = { current: 0 };
  private bossBaseSpeed: number;
  private overlayPhase: BossRaidOverlayPhase = "none";
  private bannerText: string | null = null;
  private bannerTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    playerBrawlerId: string,
    playerLevel: number,
    bossBrawlerId: string,
    raidLevel: number,
    onAttack: () => void,
    onSuper: () => void,
    spriteLoaded: boolean,
  ) {
    this.raidLevel = Math.max(1, raidLevel);
    this.bossBrawlerId = bossBrawlerId;
    this.map = createCrystalsMap();
    this.spriteLoaded = spriteLoaded;
    resetMatchStats();

    const playerStats = getBrawlerById(playerBrawlerId) || BRAWLERS[0];
    this.player = new Brawler(playerStats, playerLevel, 600, 1750, "blue", true);
    this.player.setIdentity(getCurrentUsername() ?? "Игрок", false);
    this.player.setEquippedPet(getPetById(getCurrentProfile()?.equippedPetId) ?? null);
    this.playerSpawnX = this.player.x;
    this.playerSpawnY = this.player.y;

    const allyIds = pickAllyBrawlers(bossBrawlerId, playerBrawlerId);
    const allyStats = allyIds.map((id) => getBrawlerById(id) || BRAWLERS[0]);
    const ring = [
      { x: this.player.x - 120, y: this.player.y - 40 },
      { x: this.player.x + 120, y: this.player.y - 40 },
      { x: this.player.x - 80, y: this.player.y + 100 },
      { x: this.player.x + 80, y: this.player.y + 100 },
    ];
    for (let i = 0; i < 4; i++) {
      const st = allyStats[i];
      const lv = randomInt(1, Math.min(9, playerLevel + 2));
      const p = ring[i];
      const bot = new Bot(st, lv, p.x, p.y, "blue");
      this.allies.push(bot);
      this.allySpawns.push({ id: bot.id, x: p.x, y: p.y });
    }

    const bossStatsTemplate = getBrawlerById(bossBrawlerId) || BRAWLERS[0];
    const bossStats = { ...bossStatsTemplate, regenRate: 0 };
    const bossLv = Math.min(10, 4 + Math.min(this.raidLevel, 10));
    const bx = this.map.width * 0.72;
    const by = this.map.height * 0.48;
    this.boss = new Brawler(bossStats, bossLv, bx, by, "red", false);
    this.boss.setIdentity("БОСС", true);
    this.boss.suppressPassiveRegen = true;
    this.boss.stats = { ...this.boss.stats, regenRate: 0 };

    const hpScale = 18 * (1 + Math.max(0, this.raidLevel - 1) * 0.12) * (1 + Math.max(0, this.raidLevel - 5) * 0.05);
    this.boss.maxHp = Math.floor(this.boss.maxHp * hpScale);
    this.boss.hp = this.boss.maxHp;
    this.boss.radius = 24 * 5;
    this.boss.stats = {
      ...this.boss.stats,
      attackDamage: Math.floor(this.boss.stats.attackDamage * 4.5),
      attackRange: this.boss.stats.attackRange * 1.35,
      speed: this.boss.stats.speed * 0.92,
    };
    this.boss.speed *= 0.92;
    this.bossBaseSpeed = this.boss.speed;

    this.enemies = [this.boss];
    this.prevBossHp = this.boss.hp;

    this.camera = new Camera(CAM_W, CAM_H, this.map.width, this.map.height);
    this.input = new InputHandler(canvas, onAttack, onSuper);
  }

  get bots(): Bot[] {
    return this.allies;
  }

  destroy(): void {
    this.input.destroy();
  }

  getParticipants(): GameParticipant[] {
    const prof = getCurrentProfile();
    const uname = prof?.username || "Игрок";
    const out: GameParticipant[] = [
      {
        brawlerId: this.player.stats.id,
        displayName: uname,
        team: "blue",
        isPlayer: true,
        level: this.player.level,
        trophies: prof?.trophies ?? 0,
      },
    ];
    for (const a of this.allies) {
      out.push({
        brawlerId: a.stats.id,
        displayName: a.displayName || "Союзник",
        team: "blue",
        isPlayer: false,
        level: a.level,
        trophies: prof?.brawlerTrophies?.[a.stats.id] ?? 0,
      });
    }
    return out;
  }

  handleAttack(): void {
    if (!this.player.canAttack()) return;
    const foes = [this.boss];
    const mouseAngle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    const angle = this.input.attackJoystick.active ? mouseAngle : autoAimAngle(this.player, foes, mouseAngle);
    this.player.angle = angle;
    const isMelee = ["goro", "ronin", "taro"].includes(this.player.stats.id);
    const allBrawlers = [this.player, ...this.allies, this.boss];
    if (isMelee) {
      this.player.meleeAttack(allBrawlers);
    } else {
      this.projectiles.push(...this.player.shoot(angle));
    }
  }

  handleSuper(): void {
    if (!this.player.canUseSuper()) return;
    const foes = [this.boss];
    const allBrawlers = [this.player, ...this.allies, this.boss];
    const autoTarget = this.input.superJoystick.active ? null : autoAimTarget(this.player, foes, 1.0);
    const aimX = autoTarget ? autoTarget.x : this.input.state.mouseWorldX;
    const aimY = autoTarget ? autoTarget.y : this.input.state.mouseWorldY;
    const mouseAngle = angleTo(this.player.x, this.player.y, aimX, aimY);
    this.player.angle = this.input.superJoystick.active ? mouseAngle : autoAimAngle(this.player, foes, mouseAngle, 1.0);
    this.player.activateSuper(allBrawlers, this.map, this.projectiles, aimX, aimY);
  }

  private blues(): Brawler[] {
    return [this.player, ...this.allies];
  }

  private updateBossPhaseVisual(dt: number): void {
    const ov = computeBossOverlay(this.raidLevel, this.matchTime);
    this.overlayPhase = ov.phase;
    if (ov.banner) {
      this.bannerText = ov.banner;
      this.bannerTimer = 3;
    }
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.bannerTimer <= 0) this.bannerText = null;
  }

  private moveBossChase(sim: number): void {
    if (!this.boss.alive) return;
    const tgt = this.blues()
      .filter((b) => b.alive)
      .sort((a, b) => distance(this.boss.x, this.boss.y, a.x, a.y) - distance(this.boss.x, this.boss.y, b.x, b.y))[0];
    if (!tgt) return;
    const mul = phaseMoveSpeedMul(this.overlayPhase);
    this.boss.speed = this.bossBaseSpeed * mul;
    const dx = tgt.x - this.boss.x;
    const dy = tgt.y - this.boss.y;
    this.boss.move(dx, dy, sim);
    this.boss.angle = angleTo(this.boss.x, this.boss.y, tgt.x, tgt.y);
  }

  private applyBossCcImmunity(): void {
    if (!bossIgnoresCc(this.overlayPhase)) return;
    this.boss.statusEffects = this.boss.statusEffects.filter((e) => e.type !== "stun" && e.type !== "slow");
  }

  update(dt: number): void {
    if (this.over) return;
    const fr = isDevBattleWorldFrozen();
    const sim = fr ? 0 : dt;
    if (!fr) {
      this.frame++;
      this.matchTime += sim;
    }

    this.updateBossPhaseVisual(sim);

    const { up, down, left, right } = this.input.state;
    let dx = 0;
    let dy = 0;
    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;
    if (dx !== 0 || dy !== 0) this.player.move(dx, dy, dt);

    const shake = cameraShakePx(this.overlayPhase, this.frame);
    this.camera.follow(this.player.x + shake.dx, this.player.y + shake.dy);
    this.input.updateWorldMouse(this.camera.x, this.camera.y, this.player.x, this.player.y, GAME_ZOOM);
    this.player.angle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);

    const allBrawlers = [this.player, ...this.allies, this.boss];
    this.player.update(dt, this.map);

    for (const bot of this.allies) {
      if (bot.alive) {
        bot.update(sim, this.map);
        bot.updateAI(sim, allBrawlers, this.map, this.projectiles, this.map.tileGrid ?? undefined);
      }
    }

    if (this.boss.alive) {
      this.boss.update(sim, this.map);
      this.applyBossCcImmunity();
    }

    this.moveBossChase(sim);

    if (this.boss.alive) {
      const projMul = 1.85 + this.raidLevel * 0.12;
      tickRaidBossAI({
        dt: sim,
        frame: this.frame,
        raidLevel: this.raidLevel,
        boss: this.boss,
        blues: this.blues().filter((b) => b.alive),
        map: this.map,
        projectiles: this.projectiles,
        overlayPhase: this.overlayPhase,
        attackCd: this.attackCdRef,
        patternT: this.patternTRef,
        projRadiusMul: projMul,
      });
    }

    updateProjectiles(this.projectiles, sim, this.map);
    this.handleProjectileHits(allBrawlers, fr);
    this.projectiles = this.projectiles.filter((p) => p.active);

    if (this.boss.alive && this.boss.hp < this.prevBossHp) {
      const lost = this.prevBossHp - this.boss.hp;
      this.rage = Math.min(100, this.rage + (lost / this.boss.maxHp) * 55 + sim * 1.2);
    }
    if (this.boss.alive) this.prevBossHp = this.boss.hp;

    this.updateRespawns(sim);

    for (const b of this.blues()) {
      if (!b.alive && !this.respawnTimers.has(b.id)) {
        const othersAlive = this.blues().some((o) => o.id !== b.id && o.alive);
        if (othersAlive) this.respawnTimers.set(b.id, 10);
      }
    }

    const bluesAlive = this.blues().some((b) => b.alive);
    if (!this.boss.alive) {
      this.endBattle(true);
    } else if (!bluesAlive && this.respawnTimers.size === 0) {
      this.endBattle(false);
    }

    updateDamageNumbers(sim);
    updateEffects(sim, allBrawlers);
  }

  private endBattle(won: boolean): void {
    if (this.over) return;
    this.over = true;
    this.won = won;
    if (!this.resultRecorded) {
      const ms = getMatchStats();
      recordGameResult({
        won,
        mode: "bossraid",
        brawlerId: this.player.stats.id,
        place: won ? 1 : 2,
        totalPlayers: 6,
        ...ms,
      });
      this.resultRecorded = true;
    }
  }

  private updateRespawns(sim: number): void {
    for (const [id, t] of Array.from(this.respawnTimers.entries())) {
      const next = t - sim;
      if (next <= 0) {
        this.respawnTimers.delete(id);
        const br = this.blues().find((b) => b.id === id);
        if (br) {
          if (br === this.player) {
            br.respawn(this.playerSpawnX, this.playerSpawnY);
          } else {
            const sp = this.allySpawns.find((s) => s.id === id);
            br.respawn(sp?.x ?? this.playerSpawnX, sp?.y ?? this.playerSpawnY);
          }
        }
      } else {
        this.respawnTimers.set(id, next);
      }
    }
  }

  private handleProjectileHits(allBrawlers: Brawler[], fr: boolean): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      if (fr && proj.ownerId !== this.player.id) continue;
      for (const b of allBrawlers) {
        if (!b.alive) continue;
        if (b.id === proj.ownerId) continue;
        if (proj.hitIds.has(b.id)) continue;
        const projOwner = allBrawlers.find((bw) => bw.id === proj.ownerId);
        if (!projOwner) continue;
        const isEnemy = projOwner.team !== b.team;
        if (!isEnemy) continue;
        const d = distance(proj.x, proj.y, b.x, b.y);
        if (d < proj.radius + b.radius) {
          const attacker = projOwner;
          b.takeDamage(proj.damage, attacker);
          if (proj.slow) b.addStatus("slow", 1, 0.3);
          if (proj.poison) b.addStatus("poison", 3, 100);
          applyZafkielStarEffectsOnHit(attacker as any, b as any, proj, { width: this.map.width, height: this.map.height });
          proj.hitIds.add(b.id);
          if (!proj.piercing) {
            proj.active = false;
            break;
          }
        }
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    fillBattleCanvasBg(ctx);
    ctx.save();
    ctx.scale(GAME_ZOOM, GAME_ZOOM);

    renderMap(ctx, this.map, this.camera.x, this.camera.y, CAM_W, CAM_H, this.frame);
    if (this.map.tileGrid) {
      renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, false);
    }

    const allBrawlers = [this.player, ...this.allies, this.boss];
    const friendlies = this.blues()
      .filter((b) => b.alive)
      .map((b) => ({ x: b.x, y: b.y }));
    for (const b of allBrawlers) {
      b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friendlies);
    }

    if (this.map.tileGrid) {
      renderTileGrid(ctx, this.map.tileGrid, this.camera.x, this.camera.y, CAM_W, CAM_H, this.player.x, this.player.y, true);
    }
    renderProjectiles(ctx, this.projectiles, this.camera.x, this.camera.y, this.frame);
    renderEffects(ctx, this.camera.x, this.camera.y, this.frame);
    renderDamageNumbers(ctx, this.camera.x, this.camera.y);

    ctx.restore();

    this.drawVignette(ctx);
    this.drawBossHud(ctx);
    if (this.bannerText && this.bannerTimer > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 1200, 120);
      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold 42px Arial";
      ctx.textAlign = "center";
      ctx.fillText(this.bannerText, 600, 78);
      ctx.restore();
    }

    renderBattleScreenFX(ctx, 1200, 800, this.frame, this.player);
    renderPlayerHUD(ctx, this.player);
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const p = this.overlayPhase;
    if (p === "none") return;
    const a = p === "anger" ? 0.22 : p === "fury" ? 0.35 : 0.48;
    const g = ctx.createRadialGradient(600, 400, 180, 600, 400, 620);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(20,0,40,${a})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1200, 800);
    ctx.restore();
  }

  private drawBossHud(ctx: CanvasRenderingContext2D): void {
    if (!this.boss.alive) return;
    const x = 320;
    const y = 18;
    const w = 560;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(x, y, w, 72);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`БОСС · ур. ${this.raidLevel}`, x + 12, y + 22);
    const hpw = w - 24;
    const ratio = this.boss.hp / this.boss.maxHp;
    ctx.fillStyle = "#37474f";
    ctx.fillRect(x + 12, y + 32, hpw, 12);
    ctx.fillStyle = "#e53935";
    ctx.fillRect(x + 12, y + 32, hpw * Math.max(0, ratio), 12);
    ctx.fillStyle = "#ff9800";
    ctx.fillRect(x + 12, y + 50, hpw * (this.rage / 100), 6);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(x + 12, y + 32, hpw, 12);
    ctx.strokeRect(x + 12, y + 50, hpw, 6);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px Arial";
    ctx.fillText("Ярость", x + 12, y + 48);
    if (this.overlayPhase !== "none") {
      ctx.fillStyle = "#ffd54f";
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "right";
      ctx.fillText(this.overlayPhase.toUpperCase(), x + w - 12, y + 22);
    }
    ctx.restore();
  }
}
