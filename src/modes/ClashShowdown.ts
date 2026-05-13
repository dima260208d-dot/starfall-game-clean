import { Brawler } from "../entities/Brawler";
import { applyZafkielStarEffectsOnHit } from "../utils/zafkielStars";
import { Bot } from "../entities/Bot";
import { BRAWLERS, getBrawlerById, getScaledStats, pickBotStats } from "../entities/BrawlerData";
import {
  createShowdownMap, GameMap, renderTileGrid,
  paintTileGridPass2Cell, tallTileDepthSortY,
  collectPowerCratesFromOverlays,
} from "../game/MapRenderer";
import { Projectile, updateProjectiles, renderProjectiles } from "../entities/Projectile";
import { Camera } from "../game/Camera";
import { InputHandler } from "../game/InputHandler";
import { updateDamageNumbers, renderDamageNumbers, clearDamageNumbers } from "../utils/damageNumbers";
import { updateEffects, renderEffects, clearEffects } from "../utils/effects";
import { renderMap } from "../game/MapRenderer";
import { angleTo, autoAimAngle, autoAimTarget, distance, randomInt } from "../utils/helpers";
import { recordGameResult, getCurrentUsername, getCurrentProfile } from "../utils/localStorageAPI";
import { getPetById } from "../entities/PetData";
import { resetMatchStats, getMatchStats, addMatchStat } from "../utils/matchStats";
import {
  TileGrid, TILE_CELL_SIZE, generateShowdownTileGrid,
  collidesWithTileGrid, projectileBlockedByTile,
  getTileHealRate, isTileInBush,
  destroyTile, nearestGrassTile, getTile,
  snapWorldPosToFlatPickupCenter,
} from "../game/TileMap";
import { TALL_TILE_TYPES } from "../utils/tileModelCache";
import { getPublishedMap, OV } from "../utils/mapEditorAPI";
import { isDevBattleWorldFrozen } from "../game/battleDevPause";
import { getPowerJarCanvas } from "../utils/powerModelCache";
import { fillBattleCanvasBg, renderBattleScreenFX } from "../game/battleScreenFX";

export interface DropItem {
  x: number;
  y: number;
  type: "health" | "coins" | "powerup";
  radius: number;
}

export interface GasZone {
  centerX: number;
  centerY: number;
  safeRadius: number;
}

/** Base gas damage per second (before per-fighter ramp). */
export const SHOWDOWN_GAS_BASE_DPS = 270;
/** How often gas damage steps up while a fighter stays in smoke. */
export const SHOWDOWN_GAS_RAMP_EVERY_SEC = 1;
/** Each step multiplies gas DPS by this (1.2 = +20% per step). */
export const SHOWDOWN_GAS_RAMP_FACTOR = 1.2;

export function showdownGasDamageMultiplier(secondsInGas: number): number {
  if (secondsInGas <= 0) return 1;
  return Math.pow(SHOWDOWN_GAS_RAMP_FACTOR, Math.floor(secondsInGas / SHOWDOWN_GAS_RAMP_EVERY_SEC));
}

/** +20% tile heal (barrel etc.) per collected power jar — does not affect gas damage. */
export function healRateWithJarBonus(baseHealPerSec: number, powerCubes: number): number {
  return baseHealPerSec * (1 + powerCubes * 0.2);
}

const GAME_ZOOM = 1.4;
const CAM_W = Math.round(1200 / GAME_ZOOM);
const CAM_H = Math.round(800 / GAME_ZOOM);
type ShowdownFormat = "solo" | "duo" | "trio";

export class ClashShowdown {
  map: GameMap;
  tileGrid: TileGrid;
  player: Brawler;
  bots: Bot[] = [];
  projectiles: Projectile[] = [];
  drops: DropItem[] = [];
  camera: Camera;
  input: InputHandler;
  
  gas: GasZone;
  /** Seconds continuously spent in gas this visit, per brawler id (cleared on exit / death). */
  private gasTimeInSmoke = new Map<string, number>();
  
  over = false;
  won = false;
  frame = 0;
  spriteLoaded: boolean;
  
  private resultRecorded = false;
  private playerDropsSpawned = false;
  private totalParticipants = 10;
  private teamSize = 1;
  private teamSpawnCenters = new Map<string, { x: number; y: number }>();
  private respawnTimers = new Map<string, number>();
  private respawnPoints = new Map<string, { x: number; y: number }>();
  allies: Brawler[] = [];
  enemies: Brawler[] = [];

  constructor(
    canvas: HTMLCanvasElement,
    playerBrawlerId: string,
    playerLevel: number,
    format: ShowdownFormat,
    onAttack: () => void,
    onSuper: () => void,
    spriteLoaded: boolean
  ) {
    this.teamSize = format === "trio" ? 3 : format === "duo" ? 2 : 1;
    this.totalParticipants = format === "trio" ? 12 : 10;
    this.tileGrid = generateShowdownTileGrid();
    this.map = createShowdownMap(this.tileGrid);
    this.map.tileGrid = this.tileGrid;
    this.spriteLoaded = spriteLoaded;

    // ── Load published map if one exists ──────────────────────────────────
    const pubMap = getPublishedMap("showdown");
    if (pubMap && pubMap.cells && pubMap.cells.length === 60 * 60) {
      for (let i = 0; i < pubMap.cells.length; i++) {
        this.tileGrid.cells[i] = pubMap.cells[i];
      }
      this.map.name = pubMap.name;
    }

    const playerStats = getBrawlerById(playerBrawlerId) || BRAWLERS[0];

    // ── Collect spawn positions from SPAWN_SD overlays (published map) ────
    let overlaySpawns: Array<{ x: number; y: number }> = [];
    if (pubMap && pubMap.overlays && pubMap.overlays.length === 60 * 60) {
      for (let i = 0; i < pubMap.overlays.length; i++) {
        if (pubMap.overlays[i] === OV.SPAWN_SD) {
          const tx = i % 60;
          const ty = Math.floor(i / 60);
          overlaySpawns.push({ x: (tx + 0.5) * TILE_CELL_SIZE, y: (ty + 0.5) * TILE_CELL_SIZE });
        }
      }
      // Shuffle so every game picks a random subset of spawn points
      overlaySpawns = overlaySpawns.sort(() => Math.random() - 0.5);

      // ── Power boxes from overlays: snap to clear 3×3 grass (no overlap under bush/tall art) ──
      const fromEditor = collectPowerCratesFromOverlays(this.tileGrid, pubMap.overlays, OV.POWER_BOX);
      if (fromEditor.length > 0) this.map.crates = fromEditor;
    }

    const totalSlots = this.totalParticipants;
    const teamCount = Math.max(1, Math.floor(totalSlots / this.teamSize));
    const teamCenters: Array<{ x: number; y: number }> = [];
    const allPositions: Array<{ x: number; y: number }> = [];

    if (overlaySpawns.length >= teamCount) {
      for (let i = 0; i < teamCount; i++) {
        const c = overlaySpawns[i % overlaySpawns.length];
        teamCenters.push({ x: c.x, y: c.y });
      }
    } else {
      const spawnPadding = 420;
      const usedPositions: Array<{ x: number; y: number }> = [];
      const slotOffset = Math.random() * Math.PI * 2;
      for (let i = 0; i < teamCount; i++) {
        let sx = 0, sy = 0;
        let attempts = 0;
        do {
          const angle = (i / teamCount) * Math.PI * 2 + slotOffset + (Math.random() - 0.5) * 0.35;
          const ringDist = 780 + Math.random() * 380;
          sx = Math.round(1500 + Math.cos(angle) * ringDist);
          sy = Math.round(1500 + Math.sin(angle) * ringDist);
          sx = Math.max(220, Math.min(this.map.width - 220, sx));
          sy = Math.max(220, Math.min(this.map.height - 220, sy));
          attempts++;
        } while (
          usedPositions.some(p => Math.abs(p.x - sx) < spawnPadding && Math.abs(p.y - sy) < spawnPadding) &&
          attempts < 60
        );
        const snapped = nearestGrassTile(this.tileGrid, sx, sy);
        teamCenters.push({ x: snapped.x, y: snapped.y });
        usedPositions.push({ x: snapped.x, y: snapped.y });
      }
    }

    for (let t = 0; t < teamCount; t++) {
      const center = teamCenters[t];
      const teamId = `team-${t}`;
      this.teamSpawnCenters.set(teamId, center);
      for (let k = 0; k < this.teamSize; k++) {
        const memberAngle = (k / Math.max(1, this.teamSize)) * Math.PI * 2 + Math.random() * 0.35;
        const memberDist = this.teamSize === 1 ? 0 : 54 + Math.random() * 24;
        const mx = center.x + Math.cos(memberAngle) * memberDist;
        const my = center.y + Math.sin(memberAngle) * memberDist;
        const snapped = nearestGrassTile(this.tileGrid, mx, my);
        allPositions.push({ x: snapped.x, y: snapped.y });
      }
    }

    const playerTeamIdx = randomInt(0, teamCount - 1);
    const playerSlotInTeam = randomInt(0, this.teamSize - 1);
    const playerSlot = playerTeamIdx * this.teamSize + playerSlotInTeam;
    const playerTeamId = `team-${playerTeamIdx}`;
    const playerSpawn = allPositions[playerSlot];
    this.player = new Brawler(playerStats, playerLevel, playerSpawn.x, playerSpawn.y, playerTeamId, true);
    this.player.setIdentity(getCurrentUsername() ?? "Игрок", false);
    this.player.setEquippedPet(getPetById(getCurrentProfile()?.equippedPetId) ?? null);
    resetMatchStats();

    const botPicks = pickBotStats(playerBrawlerId, totalSlots - 1);
    let botIdx = 0;
    for (let i = 0; i < totalSlots; i++) {
      if (i === playerSlot) continue;
      const botStats = botPicks[botIdx];
      const level = randomInt(1, 5);
      const pos = allPositions[i];
      const botTeamId = `team-${Math.floor(i / this.teamSize)}`;
      this.bots.push(new Bot(botStats, level, pos.x, pos.y, botTeamId));
      botIdx++;
    }
    
    this.gas = {
      centerX: 1500,
      centerY: 1500,
      safeRadius: 2000,
    };

    this.camera = new Camera(CAM_W, CAM_H, this.map.width, this.map.height);
    this.input = new InputHandler(canvas, onAttack, onSuper);
  }

  handleAttack(): void {
    if (!this.player.canAttack()) return;
    const mouseAngle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    const angle = this.input.attackJoystick.active ? mouseAngle : autoAimAngle(this.player, this.bots, mouseAngle);
    this.player.angle = angle;
    
    const isMelee = ["goro", "ronin", "taro"].includes(this.player.stats.id);
    if (isMelee) {
      const allBrawlers = [this.player, ...this.bots];
      this.player.meleeAttack(allBrawlers);
      // Melee brawlers also smash nearby power boxes
      for (const crate of this.map.crates) {
        if (crate.destroyed) continue;
        const cx = crate.x + crate.w / 2;
        const cy = crate.y + crate.h / 2;
        if (distance(this.player.x, this.player.y, cx, cy) < this.player.radius + 35) {
          crate.hp -= this.player.scaledDamage;
          if (crate.hp <= 0) {
            crate.destroyed = true;
            const p = snapWorldPosToFlatPickupCenter(this.tileGrid, cx, cy);
            this.drops.push({ x: p.x, y: p.y, type: "powerup", radius: 16 });
          }
        }
      }
    } else {
      const projs = this.player.shoot(angle);
      this.projectiles.push(...projs);
    }
  }

  handleSuper(): void {
    if (!this.player.canUseSuper()) return;
    const allBrawlers = [this.player, ...this.bots];
    const autoTarget = this.input.superJoystick.active
      ? null
      : autoAimTarget(this.player, this.bots, 1.0);
    const aimX = autoTarget ? autoTarget.x : this.input.state.mouseWorldX;
    const aimY = autoTarget ? autoTarget.y : this.input.state.mouseWorldY;
    const mouseAngle = angleTo(this.player.x, this.player.y, aimX, aimY);
    this.player.angle = this.input.superJoystick.active
      ? mouseAngle
      : autoAimAngle(this.player, this.bots, mouseAngle, 1.0);
    this.player.activateSuper(allBrawlers, this.map, this.projectiles, aimX, aimY);
  }

  update(dt: number): void {
    if (this.over) return;
    const fr = isDevBattleWorldFrozen();
    const sim = fr ? 0 : dt;
    if (!fr) this.frame++;
    const frameAliveBefore = new Set([this.player, ...this.bots].filter(b => b.alive).map(b => b.id));
    
    const { up, down, left, right } = this.input.state;
    let dx = 0, dy = 0;
    if (up) dy -= 1;
    if (down) dy += 1;
    if (left) dx -= 1;
    if (right) dx += 1;
    
    if (dx !== 0 || dy !== 0) {
      this.player.move(dx, dy, dt);
    }
    
    const focus = this.player.alive
      ? this.player
      : [this.player, ...this.bots].find(b => b.alive && b.team === this.player.team) || this.player;
    this.camera.follow(focus.x, focus.y);
    this.input.updateWorldMouse(this.camera.x, this.camera.y, this.player.x, this.player.y, GAME_ZOOM);
    
    const mouseAngle = angleTo(this.player.x, this.player.y, this.input.state.mouseWorldX, this.input.state.mouseWorldY);
    this.player.angle = mouseAngle;
    
    const allBrawlers = [this.player, ...this.bots];
    
    this.player.update(dt, this.map);
    // Tile-based collision correction
    {
      const tc = collidesWithTileGrid(this.player.x, this.player.y, this.player.radius, this.tileGrid);
      if (tc.collides) { this.player.x = tc.nx; this.player.y = tc.ny; }
    }
    // Heal platform
    {
      const healRate = getTileHealRate(this.player.x, this.player.y, this.tileGrid);
      if (healRate > 0) {
        const hr = healRateWithJarBonus(healRate, this.player.powerCubes);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + hr * dt);
      }
    }
    // Bush detection via tile grid
    this.player.inBush = isTileInBush(this.player.x, this.player.y, this.tileGrid);
    
    for (const bot of this.bots) {
      const wasAlive = bot.alive;
      if (bot.alive) {
        // Gas-avoidance intelligence: flee inward if outside or near gas edge
        const dToCenter = distance(bot.x, bot.y, this.gas.centerX, this.gas.centerY);
        const safeBuffer = 200;
        if (dToCenter > this.gas.safeRadius - safeBuffer) {
          // Pick a point well inside the safe zone (not the exact center, spread bots out)
          const targetR = Math.max(0, this.gas.safeRadius - safeBuffer - 100);
          const angleFromCenter = Math.atan2(bot.y - this.gas.centerY, bot.x - this.gas.centerX);
          bot.forcedTarget = {
            x: this.gas.centerX + Math.cos(angleFromCenter) * targetR,
            y: this.gas.centerY + Math.sin(angleFromCenter) * targetR,
          };
        } else {
          // No gas threat — let the bot hunt power cubes when no enemy is in
          // sight. Bots head toward the nearest dropped powerup or, failing
          // that, the nearest unbroken crate (which yields cubes when smashed).
          let nearestEnemyDist = 9999;
          for (const other of allBrawlers) {
            if (!other.alive || other === bot) continue;
            const d = distance(bot.x, bot.y, other.x, other.y);
            if (d < nearestEnemyDist) nearestEnemyDist = d;
          }
          // Only seek cubes when not already busy fighting nearby
          if (nearestEnemyDist > 500) {
            let bestX = 0, bestY = 0, bestD = 1200;
            for (const drop of this.drops) {
              if (drop.type !== "powerup") continue;
              const d = distance(bot.x, bot.y, drop.x, drop.y);
              if (d < bestD) { bestD = d; bestX = drop.x; bestY = drop.y; }
            }
            if (bestD === 1200) {
              for (const crate of this.map.crates) {
                if (crate.destroyed) continue;
                const cx = crate.x + crate.w / 2;
                const cy = crate.y + crate.h / 2;
                const d = distance(bot.x, bot.y, cx, cy);
                // Stop short of the crate so the bot has room to shoot it.
                if (d < bestD) { bestD = d; bestX = cx; bestY = cy; }
              }
            }
            if (bestD < 1200) {
              bot.forcedTarget = { x: bestX, y: bestY };
            } else if (bot.forcedTarget) {
              bot.forcedTarget = undefined;
            }
          } else if (bot.forcedTarget) {
            bot.forcedTarget = undefined;
          }
        }
        bot.update(sim, this.map);
        const bc = collidesWithTileGrid(bot.x, bot.y, bot.radius, this.tileGrid);
        if (bc.collides) { bot.x = bc.nx; bot.y = bc.ny; }
        const bHeal = getTileHealRate(bot.x, bot.y, this.tileGrid);
        if (bHeal > 0) {
          const hr = healRateWithJarBonus(bHeal, bot.powerCubes);
          bot.hp = Math.min(bot.maxHp, bot.hp + hr * sim);
        }
        bot.inBush = isTileInBush(bot.x, bot.y, this.tileGrid);
        bot.updateAI(sim, allBrawlers, this.map, this.projectiles, this.tileGrid);
      }
      if (wasAlive && !bot.alive) {
        // handled in a centralized death pass later in the frame
      }
    }
    
    const homingTargets = allBrawlers
      .filter(b => b.alive)
      .map(b => ({ id: b.id, x: b.x, y: b.y, team: b.team }));
    updateProjectiles(this.projectiles, sim, this.map, homingTargets);
    this.handleTileHits();

    this.handleProjectileHits(allBrawlers);
    this.projectiles = this.projectiles.filter(p => p.active);

    // Kills are resolved in a single centralized pass below.
    
    // Continuous shrink at 70% of original speed, fixed center — never disappears
    if (this.gas.safeRadius > 150) {
      this.gas.safeRadius = Math.max(150, this.gas.safeRadius - 6.6 * sim);
    }

    for (const b of allBrawlers) {
      if (!b.alive) {
        this.gasTimeInSmoke.delete(b.id);
        continue;
      }
      const d = distance(b.x, b.y, this.gas.centerX, this.gas.centerY);
      if (d > this.gas.safeRadius) {
        const prev = this.gasTimeInSmoke.get(b.id) ?? 0;
        const t = prev + sim;
        this.gasTimeInSmoke.set(b.id, t);
        const mult = showdownGasDamageMultiplier(t);
        b.takeDamage(SHOWDOWN_GAS_BASE_DPS * mult * sim, null, { suppressScreenFlash: true });
      } else {
        this.gasTimeInSmoke.delete(b.id);
      }
    }
    
    this.handleCrateHits(allBrawlers);
    this.handleDropPickups();
    this.updateRespawns(sim);
    this.allies = this.bots.filter(b => b.alive && b.team === this.player.team);
    this.enemies = this.bots.filter(b => b.alive && b.team !== this.player.team);
    
    updateDamageNumbers(sim);
    updateEffects(sim, [this.player, ...this.bots]);
    for (const fighter of [this.player, ...this.bots]) {
      if (frameAliveBefore.has(fighter.id) && !fighter.alive) {
        this.onFighterDeath(fighter);
      }
    }

    const allFighters = [this.player, ...this.bots];
    const aliveByTeam = new Map<string, number>();
    for (const fighter of allFighters) {
      if (!fighter.alive) continue;
      aliveByTeam.set(fighter.team, (aliveByTeam.get(fighter.team) || 0) + 1);
    }
    const aliveTeams = aliveByTeam.size;
    const playerTeamAlive = (aliveByTeam.get(this.player.team) || 0) > 0;

    if (!playerTeamAlive) {
      // Drop the player's stash of power cubes (+1) where they fell, just like bots do.
      if (!this.playerDropsSpawned) {
        const cubeCount = Math.max(1, this.player.powerCubes);
        for (let i = 0; i < cubeCount; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 40;
          const rawX = this.player.x + Math.cos(a) * r;
          const rawY = this.player.y + Math.sin(a) * r;
          const p = snapWorldPosToFlatPickupCenter(this.tileGrid, rawX, rawY);
          this.drops.push({ x: p.x, y: p.y, type: "powerup", radius: 14 });
        }
        this.playerDropsSpawned = true;
      }
      const place = Math.min(Math.max(2, aliveTeams + 1), Math.max(2, Math.floor(this.totalParticipants / this.teamSize)));
      const isTopFour = place <= 4;
      this.over = true;
      this.won = isTopFour;
      if (!this.resultRecorded) {
        const ms = getMatchStats();
        recordGameResult({ won: isTopFour, mode: "showdown", brawlerId: this.player.stats.id, place, totalPlayers: this.totalParticipants, ...ms });
        this.resultRecorded = true;
      }
    }

    if (aliveTeams === 1 && playerTeamAlive) {
      this.over = true;
      this.won = true;
      if (!this.resultRecorded) {
        const ms = getMatchStats();
        recordGameResult({ won: true, mode: "showdown", brawlerId: this.player.stats.id, place: 1, totalPlayers: this.totalParticipants, ...ms });
        this.resultRecorded = true;
      }
    }
  }

  private handleTileHits(): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      const { blocked, tx, ty } = projectileBlockedByTile(proj.x, proj.y, this.tileGrid);
      if (blocked) {
        destroyTile(this.tileGrid, tx, ty);
        if (!proj.piercing) proj.active = false;
      }
    }
  }

  private handleProjectileHits(allBrawlers: Brawler[]): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      
      for (const b of allBrawlers) {
        if (!b.alive) continue;
        if (b.id === proj.ownerId) continue;
        if (proj.hitIds.has(b.id)) continue;
        
        if (proj.ownerTeam === b.team) continue;
        
        const d = distance(proj.x, proj.y, b.x, b.y);
        if (d < proj.radius + b.radius) {
          const attacker = allBrawlers.find(bw => bw.id === proj.ownerId) || null;
          b.takeDamage(proj.damage, attacker);
          
          if (proj.slow) b.addStatus("slow", 1.5, 0.4);
          if (proj.poison) b.addStatus("poison", 3, 100);
          if (proj.stunDuration) b.addStatus("stun", proj.stunDuration, 0);
          if (proj.temporalRewind && b.posHistory.length >= 2) {
            // Rewind target to ~1s ago
            const pastIdx = Math.max(0, b.posHistory.length - 6); // ~1.2s ago at 200ms interval
            const pastPos = b.posHistory[pastIdx];
            b.x = Math.max(b.radius, Math.min(this.map.width - b.radius, pastPos.x));
            b.y = Math.max(b.radius, Math.min(this.map.height - b.radius, pastPos.y));
          }
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

  private handleCrateHits(_allBrawlers: Brawler[]): void {
    for (const proj of this.projectiles) {
      if (!proj.active) continue;
      for (const crate of this.map.crates) {
        if (crate.destroyed) continue;
        if (
          proj.x > crate.x && proj.x < crate.x + crate.w &&
          proj.y > crate.y && proj.y < crate.y + crate.h
        ) {
          crate.hp -= proj.damage;
          if (!proj.piercing) proj.active = false;
          if (crate.hp <= 0) {
            crate.destroyed = true;
            const cx = crate.x + crate.w / 2;
            const cy = crate.y + crate.h / 2;
            const p = snapWorldPosToFlatPickupCenter(this.tileGrid, cx, cy);
            this.drops.push({ x: p.x, y: p.y, type: "powerup", radius: 16 });
          }
          break;
        }
      }
    }
  }

  private handleDropPickups(): void {
    // Anyone alive — player or bot — can grab dropped items by walking over
    // them. This lets bots collect power cubes from crates or fallen rivals.
    const pickers: Brawler[] = isDevBattleWorldFrozen() ? [this.player] : [this.player, ...this.bots];
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      let claimed = false;
      for (const b of pickers) {
        if (!b.alive) continue;
        const d = distance(b.x, b.y, drop.x, drop.y);
        if (d < drop.radius + b.radius) {
          if (drop.type === "health") {
            b.heal(300);
          } else if (drop.type === "powerup") {
            if (this.teamSize > 1) {
              const teamMates = pickers.filter(m => m.team === b.team && m.alive);
              for (const mate of teamMates) {
                mate.collectPowerCube();
              }
              if (b.team === this.player.team) addMatchStat("powerCubesCollected", 1);
            } else {
              b.collectPowerCube();
              if (b.isPlayer) addMatchStat("powerCubesCollected", 1);
            }
          }
          claimed = true;
          break;
        }
      }
      if (claimed) this.drops.splice(i, 1);
    }
  }

  private onFighterDeath(fighter: Brawler): void {
    this.respawnPoints.delete(fighter.id);
    const cubeCount = Math.max(1, fighter.powerCubes);
    for (let i = 0; i < cubeCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 20 + Math.random() * 40;
      const rawX = fighter.x + Math.cos(a) * r;
      const rawY = fighter.y + Math.sin(a) * r;
      const p = snapWorldPosToFlatPickupCenter(this.tileGrid, rawX, rawY);
      this.drops.push({ x: p.x, y: p.y, type: "powerup", radius: 14 });
    }
    fighter.powerCubes = 0;
    const base = getScaledStats(fighter.stats, fighter.level);
    fighter.maxHp = base.hp;
    if (fighter === this.player) this.playerDropsSpawned = true;

    if (this.teamSize > 1) {
      const teamAliveExcluding = [this.player, ...this.bots].some(
        b => b.alive && b.team === fighter.team && b.id !== fighter.id,
      );
      if (teamAliveExcluding) {
        this.respawnTimers.set(fighter.id, 10);
      }
    }
  }

  private updateRespawns(dt: number): void {
    if (this.respawnTimers.size === 0) return;
    const all = [this.player, ...this.bots];
    const PRESPAWN_ANIM = 1.1;
    for (const [id, t] of Array.from(this.respawnTimers.entries())) {
      const fighter = all.find(b => b.id === id);
      if (!fighter || fighter.alive) {
        this.respawnTimers.delete(id);
        this.respawnPoints.delete(id);
        continue;
      }
      const teamAlive = all.some(b => b.alive && b.team === fighter.team);
      if (!teamAlive) {
        this.respawnTimers.delete(id);
        this.respawnPoints.delete(id);
        continue;
      }
      const next = t - dt;
      if (next <= PRESPAWN_ANIM && !this.respawnPoints.has(id)) {
        const aliveMate = all.find(b => b.alive && b.team === fighter.team) || null;
        const base = this.teamSpawnCenters.get(fighter.team);
        const rx = aliveMate ? aliveMate.x + randomInt(-80, 80) : (base?.x ?? fighter.x);
        const ry = aliveMate ? aliveMate.y + randomInt(-80, 80) : (base?.y ?? fighter.y);
        const snapped = nearestGrassTile(this.tileGrid, rx, ry);
        this.respawnPoints.set(id, snapped);
      }
      if (next > 0) {
        this.respawnTimers.set(id, next);
        continue;
      }
      const point = this.respawnPoints.get(id);
      if (point) fighter.respawn(point.x, point.y);
      this.respawnTimers.delete(id);
      this.respawnPoints.delete(id);
      if (fighter === this.player) this.playerDropsSpawned = false;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    fillBattleCanvasBg(ctx);

    // ── Scale everything up by GAME_ZOOM so tiles fill ~17 cells across the screen ──
    ctx.save();
    ctx.scale(GAME_ZOOM, GAME_ZOOM);

    // ── 45° isometric view: compress Y axis by 0.65 for all world elements ──
    const ISO = 0.65;
    // Fit tile column height exactly into CAM_H so ISO layer fills the zoomed viewport
    // (ceil + old shift left a band ~56px empty at top and clipped bottom → “white line” + black bar).
    const tileCanvasH = Math.floor(CAM_H / ISO);
    const ISO_SHIFT = CAM_H - ISO * tileCanvasH;

    // ─── ISO layer: map tiles + drops + gas + projectiles + effects ───
    ctx.save();
    ctx.transform(1, 0, 0, ISO, 0, ISO_SHIFT);
    // Clip world draw so gas / strokes cannot spill into letterboxed margins as bright artifacts.
    {
      const pad = this.tileGrid.cellSize * 2;
      ctx.beginPath();
      ctx.rect(-pad, -pad, CAM_W + pad * 2, tileCanvasH + pad * 2);
      ctx.clip();
    }

    renderMap(ctx, this.map, this.camera.x, this.camera.y, CAM_W, tileCanvasH, this.frame);

    renderTileGrid(ctx, this.tileGrid, this.camera.x, this.camera.y, CAM_W, tileCanvasH,
      this.player.x, this.player.y, false, "deferTallNonBush");

    const C = this.tileGrid.cellSize;
    type DepthKind = "tile" | "brawler";
    const depthItems: { kind: DepthKind; sortY: number; tx?: number; ty?: number; b?: Brawler }[] = [];
    const EDGE_PAD = 6;
    const startTX = Math.max(-EDGE_PAD, Math.floor(this.camera.x / C) - EDGE_PAD);
    const endTX = Math.min(this.tileGrid.width - 1 + EDGE_PAD, Math.ceil((this.camera.x + CAM_W) / C) + EDGE_PAD);
    const startTY = Math.max(-EDGE_PAD, Math.floor(this.camera.y / C) - 4 - EDGE_PAD);
    const endTY = Math.min(this.tileGrid.height - 1 + EDGE_PAD, Math.ceil((this.camera.y + tileCanvasH) / C) + EDGE_PAD);
    for (let tx = startTX; tx <= endTX; tx++) {
      for (let ty = startTY; ty <= endTY; ty++) {
        const t = getTile(this.tileGrid, tx, ty);
        if (TALL_TILE_TYPES.has(t)) {
          depthItems.push({ kind: "tile", sortY: tallTileDepthSortY(ty, C), tx, ty });
        }
      }
    }
    const allFighters = [this.player, ...this.bots];
    for (const b of allFighters) {
      if (!b.alive) continue;
      depthItems.push({ kind: "brawler", sortY: b.y + b.radius, b });
    }
    depthItems.sort((a, b) => {
      if (a.sortY !== b.sortY) return a.sortY - b.sortY;
      if (a.kind === b.kind) return 0;
      return a.kind === "tile" ? -1 : 1;
    });
    const friendliesWorld = allFighters
      .filter(br => br.alive && br.team === this.player.team)
      .map(br => ({ x: br.x, y: br.y }));
    for (const it of depthItems) {
      if (it.kind === "tile" && it.tx !== undefined && it.ty !== undefined) {
        paintTileGridPass2Cell(
          ctx, this.tileGrid, it.tx, it.ty, this.camera.x, this.camera.y,
          this.player.x, this.player.y, false, "tallNonBushOnly",
        );
      } else if (it.kind === "brawler" && it.b) {
        it.b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friendliesWorld, undefined, "world");
      }
    }

    this.renderDrops(ctx);
    this.renderRespawnShields(ctx);
    this.renderGas(ctx, ISO, tileCanvasH);
    
    renderProjectiles(ctx, this.projectiles, this.camera.x, this.camera.y, this.frame);
    renderEffects(ctx, this.camera.x, this.camera.y, this.frame);

    renderTileGrid(ctx, this.tileGrid, this.camera.x, this.camera.y, CAM_W, tileCanvasH,
      this.player.x, this.player.y, true);

    renderDamageNumbers(ctx, this.camera.x, this.camera.y);

    ctx.restore(); // remove ISO, keep GAME_ZOOM

    const friendlies = allFighters
      .filter(b => b.alive && b.team === this.player.team)
      .map(b => ({ x: b.x, y: b.y }));
    allFighters.sort((a, b) => a.y - b.y);
    for (const b of allFighters) {
      const projSY = (b.y - this.camera.y) * ISO + ISO_SHIFT;
      b.render(ctx, this.camera.x, this.camera.y, this.spriteLoaded, this.player.team, friendlies, projSY, "hud");
    }

    ctx.restore(); // remove GAME_ZOOM

    renderBattleScreenFX(ctx, 1200, 800, this.frame, this.player);
    // ── HUD rendered flat at full screen resolution (no zoom) ──
    this.renderHUD(ctx);
  }

  private renderDrops(ctx: CanvasRenderingContext2D): void {
    for (const drop of this.drops) {
      const sx = drop.x - this.camera.x;
      const sy = drop.y - this.camera.y;

      if (drop.type === "powerup") {
        // Spinning power jar — use GLB-rendered sprite with rotation
        const spin = (this.frame * 0.04) % (Math.PI * 2);
        const R = drop.radius;
        const jarSprite = getPowerJarCanvas();

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(spin);
        ctx.shadowColor = "#E040FB";
        ctx.shadowBlur = 22;

        if (jarSprite) {
          const D = R * 3.0;
          ctx.drawImage(jarSprite, -D / 2, -D / 2, D, D);
        } else {
          // Canvas fallback until GLB loads
          const jW = R * 1.3, jH = R * 1.8;
          const jX = -jW / 2, jY = -jH / 2;
          const jGrad = ctx.createLinearGradient(jX, jY, jX + jW, jY + jH);
          jGrad.addColorStop(0, "#CE93D8");
          jGrad.addColorStop(0.35, "#9C27B0");
          jGrad.addColorStop(1, "#4A148C");
          ctx.fillStyle = jGrad;
          ctx.beginPath();
          ctx.roundRect(jX, jY, jW, jH, R * 0.35);
          ctx.fill();
          ctx.fillStyle = "#FFD700";
          ctx.fillRect(-jW * 0.3, jY - R * 0.18, jW * 0.6, R * 0.22);
        }

        ctx.restore();

        // Floating label above
        ctx.save();
        ctx.fillStyle = "#FFD700";
        ctx.font = "bold 9px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "#000";
        ctx.shadowBlur = 3;
        ctx.fillText("БАНКА", sx, sy - R * 1.6);
        ctx.restore();
      } else {
        // Health / coins — colored circles
        const color = drop.type === "health" ? "#4CAF50" : "#FFD700";
        const glowColor = drop.type === "health" ? "#4CAF50" : "#FFD700";
        const label = drop.type === "health" ? "+" : "$";
        const r0 = drop.radius * 0.72;
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, r0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.beginPath();
        ctx.arc(sx - r0 * 0.28, sy - r0 * 0.28, r0 * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "white";
        ctx.font = `bold ${Math.round(r0 * 0.9)}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, sx, sy);
        ctx.restore();
      }
    }
  }

  private renderRespawnShields(ctx: CanvasRenderingContext2D): void {
    if (this.teamSize <= 1 || this.respawnPoints.size === 0) return;
    const PRESPAWN_ANIM = 1.1;
    for (const [id, point] of this.respawnPoints.entries()) {
      const timer = this.respawnTimers.get(id);
      if (timer === undefined) continue;
      const phase = Math.max(0, Math.min(1, (PRESPAWN_ANIM - timer) / PRESPAWN_ANIM));
      const sx = point.x - this.camera.x;
      const sy = point.y - this.camera.y;
      const radius = 10 + phase * 34;
      ctx.save();
      ctx.globalAlpha = 0.18 + phase * 0.4;
      ctx.fillStyle = "rgba(80,180,255,0.25)";
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.4 + phase * 0.5;
      ctx.strokeStyle = "#80D8FF";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderGas(ctx: CanvasRenderingContext2D, _iso: number, viewH: number): void {
    ctx.save();
    const gsx = this.gas.centerX - this.camera.x;
    const gsy = this.gas.centerY - this.camera.y;
    // Mask to visible world slab (same height as tile pass) — avoids huge evenodd rect + stroke in empty margins.
    const worldH = viewH + 120;

    ctx.beginPath();
    ctx.rect(-120, -120, CAM_W + 240, worldH);
    ctx.arc(gsx, gsy, this.gas.safeRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = "rgba(0, 200, 0, 0.13)";
    ctx.fill("evenodd");
    
    ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.arc(gsx, gsy, this.gas.safeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private renderHUD(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Enemy count shown in minimap panel — no separate top-right overlay needed
    
    // Ammo dots are now drawn above the brawler (under the HP bar) by Brawler.render().

    if (this.teamSize > 1) {
      const teamRoster = [this.player, ...this.bots].filter(b => b.team === this.player.team);
      const deadRoster = teamRoster.filter(b => !b.alive && this.respawnTimers.has(b.id));
      deadRoster.forEach((b, idx) => {
        const remaining = Math.max(0, Math.ceil(this.respawnTimers.get(b.id) || 0));
        const bx = 420 + idx * 230;
        const by = 12;
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(bx, by, 210, 34);
        ctx.strokeStyle = "rgba(255,255,255,0.22)";
        ctx.strokeRect(bx, by, 210, 34);
        ctx.fillStyle = b.isPlayer ? "#FFD740" : "#90CAF9";
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "left";
        ctx.fillText(`${b.displayName || (b.isPlayer ? "Вы" : "Союзник")}: возр. через ${remaining}s`, bx + 8, by + 21);
      });
    }

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText("WASD: движение | ЛКМ: атака | ПКМ/E: супер", 600, 760);
    
    ctx.restore();
  }

  getParticipants(): import("../types/gameResult").GameParticipant[] {
    const fakeTrophies = (name: string) => 300 + ((name.charCodeAt(0) * 37 + (name.charCodeAt(1) || 5) * 13) % 1700);
    const profile = getCurrentProfile();
    return [
      { brawlerId: this.player.stats.id, displayName: this.player.displayName || "Игрок", team: this.player.team, isPlayer: true, level: this.player.level, trophies: profile?.trophies ?? 0 },
      ...this.bots.slice(0, this.totalParticipants - 1).map(b => ({ brawlerId: b.stats.id, displayName: b.displayName || "Бот", team: b.team, isPlayer: false, level: b.level, trophies: fakeTrophies(b.displayName || "B") })),
    ];
  }

  destroy(): void {
    this.input.destroy();
    clearDamageNumbers();
    clearEffects();
  }
}
