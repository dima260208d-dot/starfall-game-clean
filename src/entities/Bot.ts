import { Brawler, Team } from "./Brawler";
import { BrawlerStats } from "./BrawlerData";
import { Projectile } from "./Projectile";
import { GameMap, collidesWithWalls } from "../game/MapRenderer";
import { distance, angleTo, randomFloat, lineBlockedByWalls } from "../utils/helpers";
import { pickBotName } from "../utils/botNames";
import { PETS } from "./PetData";
import { BRAWLER_CONSTELLATIONS } from "../utils/constellations";
import {
  TileGrid, TileType, TILE_PROPS, TILE_CELL_SIZE,
  getTile, collidesWithTileGrid, isTileInBush,
} from "../game/TileMap";

type BotState = "idle" | "chase" | "attack" | "retreat" | "wander" | "forced";

// Bots whose pets draw from a curated pool (excludes phoenix-revive, which
// only triggers for the local player anyway, so it would be wasted on a bot).
const BOT_PET_POOL = PETS.filter(p => p.effect.kind !== "revive");

// Probability that a freshly-spawned bot will trot in with a companion pet.
// Around half of all bots end up with one, the rest are pet-free for variety.
const BOT_PET_CHANCE = 0.5;

function pickRandomConstellationStars(brawlerId: string): number[] {
  const defs = BRAWLER_CONSTELLATIONS[brawlerId] || [];
  if (defs.length === 0) return [];
  const pool = defs.map(d => d.index);
  const count = Math.floor(Math.random() * 7); // 0..6
  const out: number[] = [];
  while (out.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  out.sort((a, b) => a - b);
  return out;
}

export class Bot extends Brawler {
  state: BotState = "idle";
  target: Brawler | null = null;
  wanderAngle = Math.random() * Math.PI * 2;
  wanderTimer = randomFloat(1, 3);
  attackTimer = 0;
  stateTimer = 0;
  crystalTarget?: { x: number; y: number };
  forcedTarget?: { x: number; y: number };

  constructor(stats: BrawlerStats, level: number, x: number, y: number, team: Team) {
    super(stats, level, x, y, team, false);
    this.setIdentity(pickBotName(), true);
    // Bots get random constellation progression (0..6 stars) per spawn.
    this.constellationStars = pickRandomConstellationStars(stats.id);
    // Roughly half of all bots arrive with a random companion pet, picked
    // independently of the player's choice. The rest run pet-free so the
    // arena keeps some variety.
    if (Math.random() < BOT_PET_CHANCE && BOT_PET_POOL.length > 0) {
      const pet = BOT_PET_POOL[Math.floor(Math.random() * BOT_PET_POOL.length)];
      this.setEquippedPet(pet);
    }
  }

  updateAI(dt: number, allBrawlers: Brawler[], map: GameMap, projectiles: Projectile[], tileGrid?: TileGrid): void {
    if (!this.alive) return;
    if (tileGrid) this.tileGrid = tileGrid;

    this.stateTimer -= dt;
    this.attackTimer -= dt;
    this.wanderTimer -= dt;

    const enemies = allBrawlers.filter(b => b.alive && b.team !== this.team);

    let nearestEnemy: Brawler | null = null;
    let nearestDist = 9999;
    for (const e of enemies) {
      const d = distance(this.x, this.y, e.x, e.y);
      if (e.inBush && d > 180) continue;
      if (d < nearestDist) { nearestDist = d; nearestEnemy = e; }
    }

    const hpRatio = this.hp / this.maxHp;

    // ── Tile-aware: seek HEAL pad when critically low HP ──
    if (tileGrid && hpRatio < 0.30 && !this.inBush) {
      const healPad = this.findNearestTile(TileType.HEAL, tileGrid);
      if (healPad && distance(this.x, this.y, healPad.x, healPad.y) < 600) {
        const dxh = healPad.x - this.x;
        const dyh = healPad.y - this.y;
        const steered = this.steerAroundWalls(dxh, dyh, map, tileGrid);
        this.move(steered.x, steered.y, dt * 0.85);
        return;
      }
    }

    // ── Tile-aware: retreat into bush when low HP ──
    if (tileGrid && hpRatio < 0.45 && !this.inBush) {
      const bushSpot = this.findNearestTile(TileType.BUSH, tileGrid);
      if (bushSpot && distance(this.x, this.y, bushSpot.x, bushSpot.y) < 400) {
        const dxb = bushSpot.x - this.x;
        const dyb = bushSpot.y - this.y;
        const steered = this.steerAroundWalls(dxb, dyb, map, tileGrid);
        this.move(steered.x, steered.y, dt * 0.75);
        // Still shoot at enemies while retreating
        if (nearestEnemy && nearestDist < this.stats.attackRange * 0.85) {
          this.angle = angleTo(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
          if (this.attackTimer <= 0 && this.canAttack()) {
            const projs = this.shoot(this.angle);
            projectiles.push(...projs);
            this.attackTimer = this.stats.attackCooldown;
          }
        }
        return;
      }
    }
    
    // Use super whenever ready: low HP for escape, OR any enemy within reasonable range
    if (this.canUseSuper()) {
      const superRange = this.stats.attackRange * 1.3;
      const hasTargetInRange = nearestEnemy !== null && nearestDist < superRange;
      if (hpRatio < 0.4 || hasTargetInRange) {
        if (nearestEnemy) {
          this.angle = angleTo(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        }
        this.activateSuper(allBrawlers, map, projectiles);
      }
    }

    const attackRange = this.stats.attackRange;
    const hasObjective = !!this.forcedTarget || !!this.crystalTarget;
    // With an objective: only engage when threats are close. Without: full 600px detection.
    const detectionRange = hasObjective ? attackRange * 1.25 : 600;

    if (this.forcedTarget) {
      const fd = distance(this.x, this.y, this.forcedTarget.x, this.forcedTarget.y);
      // Always shoot back when an enemy is in attack range, even at the destination
      if (nearestEnemy && nearestDist < attackRange) {
        this.target = nearestEnemy;
        this.angle = angleTo(this.x, this.y, nearestEnemy.x, nearestEnemy.y);
        this.state = "attack";
      } else if (fd > 60) {
        this.target = null;
        this.state = "forced";
      } else {
        this.forcedTarget = undefined;
        this.state = "wander";
        this.target = null;
      }
    } else if (nearestEnemy && nearestDist < detectionRange) {
      this.target = nearestEnemy;
      this.angle = angleTo(this.x, this.y, nearestEnemy.x, nearestEnemy.y);

      if (nearestDist < attackRange * 0.8) {
        this.state = "attack";
      } else {
        this.state = "chase";
      }
    } else {
      this.state = "wander";
      this.target = null;
    }

    switch (this.state) {
      case "chase":
        if (this.target) {
          const dx = this.target.x - this.x;
          const dy = this.target.y - this.y;
          const jitterX = randomFloat(-0.2, 0.2);
          const jitterY = randomFloat(-0.2, 0.2);
          const steered = this.steerAroundWalls(dx + jitterX, dy + jitterY, map, tileGrid);
          this.move(steered.x, steered.y, dt);
        }
        break;

      case "attack":
        if (this.target && this.target.alive) {
          const isMelee = ["goro", "ronin", "taro"].includes(this.stats.id);
          const wallsBlocked = !isMelee && lineBlockedByWalls(this.x, this.y, this.target.x, this.target.y, map.walls);
          const tilesBlocked = !isMelee && tileGrid ? this.lineTileBlocked(this.x, this.y, this.target.x, this.target.y, tileGrid) : false;
          const losBlocked = wallsBlocked || tilesBlocked;
          let friendlyInLine = false;
          if (!isMelee) {
            for (const ally of allBrawlers) {
              if (!ally.alive || ally.team !== this.team || ally.id === this.id) continue;
              const tx = this.target.x - this.x, ty = this.target.y - this.y;
              const len2 = tx * tx + ty * ty || 1;
              const ax = ally.x - this.x, ay = ally.y - this.y;
              const t = (ax * tx + ay * ty) / len2;
              if (t <= 0 || t >= 1) continue;
              const px = ax - t * tx, py = ay - t * ty;
              if (px * px + py * py < (ally.radius + 8) ** 2) { friendlyInLine = true; break; }
            }
          }

          if (this.attackTimer <= 0 && this.canAttack() && !losBlocked && !friendlyInLine) {
            const missChance = Math.random() < 0.15;
            const targetAngle = angleTo(this.x, this.y, this.target.x, this.target.y);
            const fireAngle = missChance ? targetAngle + randomFloat(-0.3, 0.3) : targetAngle;
            this.angle = fireAngle;

            if (isMelee) {
              this.meleeAttack(allBrawlers);
            } else {
              const newProjs = this.shoot(fireAngle);
              projectiles.push(...newProjs);
            }
            this.attackTimer = this.stats.attackCooldown * (0.8 + Math.random() * 0.6);
          } else if (losBlocked || friendlyInLine) {
            const toTarget2 = angleTo(this.x, this.y, this.target.x, this.target.y);
            const flankDir = (this.id.charCodeAt(0) % 2 === 0) ? 1 : -1;
            const flankAngle = toTarget2 + Math.PI / 2 * flankDir;
            const steered = this.steerAroundWalls(Math.cos(flankAngle), Math.sin(flankAngle), map, tileGrid);
            this.move(steered.x, steered.y, dt * 0.85);
            break;
          }
          
          const toTarget = angleTo(this.x, this.y, this.target.x, this.target.y);
          const strafeDir = Math.sin(performance.now() * 0.003 + (this.wanderAngle || 0)) > 0 ? 1 : -1;
          const perp = toTarget + Math.PI / 2 * strafeDir;

          if (this.forcedTarget) {
            const fd = distance(this.x, this.y, this.forcedTarget.x, this.forcedTarget.y);
            if (fd > 90) {
              const dx = this.forcedTarget.x - this.x;
              const dy = this.forcedTarget.y - this.y;
              const steered = this.steerAroundWalls(dx, dy, map, tileGrid);
              this.move(steered.x, steered.y, dt * 0.7);
            } else {
              const steered = this.steerAroundWalls(Math.cos(perp), Math.sin(perp), map, tileGrid);
              this.move(steered.x, steered.y, dt * 0.5);
            }
          } else if (nearestDist < attackRange * 0.5) {
            const awayAngle = angleTo(this.target.x, this.target.y, this.x, this.y) + randomFloat(-0.3, 0.3);
            this.move(Math.cos(awayAngle), Math.sin(awayAngle), dt * 0.6);
          } else if (nearestDist > attackRange * 0.85) {
            const dx = this.target.x - this.x;
            const dy = this.target.y - this.y;
            this.move(dx, dy, dt * 0.5);
          } else {
            const steered = this.steerAroundWalls(Math.cos(perp), Math.sin(perp), map, tileGrid);
            this.move(steered.x, steered.y, dt * 0.45);
          }
        }
        break;

      case "wander": {
        if (this.crystalTarget) {
          const d = distance(this.x, this.y, this.crystalTarget.x, this.crystalTarget.y);
          if (d > 30) {
            const dx = this.crystalTarget.x - this.x;
            const dy = this.crystalTarget.y - this.y;
            const steered = this.steerAroundWalls(dx, dy, map, tileGrid);
            this.move(steered.x, steered.y, dt);
          }
          break;
        }
        if (this.wanderTimer <= 0) {
          this.wanderAngle += randomFloat(-Math.PI / 2, Math.PI / 2);
          this.wanderTimer = randomFloat(1.5, 4);
        }
        const wx = Math.cos(this.wanderAngle);
        const wy = Math.sin(this.wanderAngle);
        const steered = this.steerAroundWalls(wx, wy, map, tileGrid);
        if (steered.x === 0 && steered.y === 0) {
          // Completely blocked — pick a new random direction immediately and skip movement
          this.wanderAngle = Math.random() * Math.PI * 2;
          this.wanderTimer = randomFloat(0.5, 1.5);
          break;
        }
        this.move(steered.x, steered.y, dt * 0.6);
        break;
      }

      case "forced":
        if (this.forcedTarget) {
          const fd = distance(this.x, this.y, this.forcedTarget.x, this.forcedTarget.y);
          if (fd < 65) {
            this.forcedTarget = undefined;
            this.state = "wander";
            break;
          }
          const dx = this.forcedTarget.x - this.x;
          const dy = this.forcedTarget.y - this.y;
          const steered = this.steerAroundWalls(dx, dy, map, tileGrid);
          this.move(steered.x, steered.y, dt);
        }
        break;
    }

  }

  private tileGrid?: TileGrid;

  setTileGrid(grid: TileGrid): void {
    this.tileGrid = grid;
  }

  private steerAroundWalls(dx: number, dy: number, map: GameMap, grid?: TileGrid): { x: number; y: number } {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const lookahead = 70;
    const probeR = this.radius + 6;

    const test = (ax: number, ay: number) => {
      const px = this.x + ax * lookahead;
      const py = this.y + ay * lookahead;
      if (collidesWithWalls(px, py, probeR, map.walls).collides) return true;
      if (grid && collidesWithTileGrid(px, py, probeR, grid).collides) return true;
      return false;
    };

    if (!test(nx, ny)) return { x: nx, y: ny };

    const deltas = [Math.PI / 6, -Math.PI / 6, Math.PI / 3, -Math.PI / 3, Math.PI / 2, -Math.PI / 2];
    const baseAngle = Math.atan2(ny, nx);
    for (const d of deltas) {
      const a = baseAngle + d;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      if (!test(cx, cy)) return { x: cx, y: cy };
    }
    return { x: 0, y: 0 };
  }

  private findNearestTile(type: number, grid: TileGrid): { x: number; y: number } | null {
    const C = TILE_CELL_SIZE;
    const myTX = Math.floor(this.x / C);
    const myTY = Math.floor(this.y / C);
    let bestDist = 9999;
    let best: { x: number; y: number } | null = null;
    const searchR = 20;
    for (let dx = -searchR; dx <= searchR; dx++) {
      for (let dy = -searchR; dy <= searchR; dy++) {
        const tx = myTX + dx, ty = myTY + dy;
        if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) continue;
        if (getTile(grid, tx, ty) !== type) continue;
        const wx = (tx + 0.5) * C, wy = (ty + 0.5) * C;
        const d = distance(this.x, this.y, wx, wy);
        if (d < bestDist) { bestDist = d; best = { x: wx, y: wy }; }
      }
    }
    return best;
  }

  private lineTileBlocked(x1: number, y1: number, x2: number, y2: number, grid: TileGrid): boolean {
    const steps = Math.ceil(distance(x1, y1, x2, y2) / TILE_CELL_SIZE) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const sx = x1 + (x2 - x1) * t;
      const sy = y1 + (y2 - y1) * t;
      const tx = Math.floor(sx / TILE_CELL_SIZE);
      const ty = Math.floor(sy / TILE_CELL_SIZE);
      const type = getTile(grid, tx, ty);
      const props = TILE_PROPS[type];
      if (props && !props.shootThrough && !props.walkable) return true;
    }
    return false;
  }
}
