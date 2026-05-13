// ─── Astral Autoplay ───────────────────────────────────────────────────────
// Drives the player's input each frame using a small state machine. Reads
// public fields off the active game instance (player/bots/drops/gas/map.crates)
// and writes to InputHandler joysticks + triggerAttack/triggerSuper, so it
// looks identical to a human pressing buttons. No structural changes to the
// game classes required.

import type { InputHandler } from "../game/InputHandler";

interface BrawlerLike {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ammo?: number;
  superCharge?: number;
  maxAmmo?: number;
  isAlive?: boolean;
  isDead?: boolean;
  team?: string;
  gemsCarried?: number;
  stats: { id: string; attackRange: number; speed?: number };
}

interface DropLike {
  x: number;
  y: number;
  type: "health" | "coins" | "powerup" | string;
  collected?: boolean;
}

interface CrateLike { x: number; y: number; w: number; h: number; destroyed?: boolean }

interface GameLike {
  input: InputHandler;
  player: BrawlerLike | null;
  bots?: BrawlerLike[];
  allies?: BrawlerLike[];
  enemies?: BrawlerLike[];
  drops?: DropLike[];
  crystals?: Array<{ x: number; y: number; carrier?: { id: string } | null }>;
  gems?: Array<{ x: number; y: number; carrier?: { id: string } | null }>;
  map?: { crates?: CrateLike[]; width?: number; height?: number };
  gas?: { centerX: number; centerY: number; radius: number };
}

type BotState = "move" | "attack" | "evade" | "pickup";

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function isAlive(b: BrawlerLike | null | undefined): b is BrawlerLike {
  if (!b) return false;
  if (typeof b.isDead === "boolean" && b.isDead) return false;
  if (typeof b.isAlive === "boolean" && !b.isAlive) return false;
  return b.hp > 0;
}

function listEnemies(game: GameLike, p: BrawlerLike): BrawlerLike[] {
  const fromBots = (game.bots ?? []).filter(b => isAlive(b) && b.team !== p.team);
  const fromEnemies = (game.enemies ?? []).filter(b => isAlive(b) && b.team !== p.team);
  if (fromBots.length === 0) return fromEnemies;
  if (fromEnemies.length === 0) return fromBots;
  const ids = new Set<string>();
  const out: BrawlerLike[] = [];
  for (const b of [...fromBots, ...fromEnemies]) {
    const id = (b as any).id ?? `${b.x}:${b.y}:${b.stats.id}`;
    if (ids.has(id)) continue;
    ids.add(id);
    out.push(b);
  }
  return out;
}

function listObjectiveDrops(game: GameLike): DropLike[] {
  const base = [...(game.drops ?? [])];
  const crystals = (game.crystals ?? [])
    .filter(c => !c.carrier)
    .map(c => ({ x: c.x, y: c.y, type: "coins" as const, collected: false }));
  const gems = (game.gems ?? [])
    .filter(g => !g.carrier)
    .map(g => ({ x: g.x, y: g.y, type: "coins" as const, collected: false }));
  return [...base, ...crystals, ...gems];
}

function carriedObjectiveCount(game: GameLike, player: BrawlerLike): number {
  const explicit = (player.gemsCarried ?? (player as any).crystalCount ?? 0);
  if (explicit > 0) return explicit;
  const pid = (player as any).id;
  if (!pid) return explicit;
  const crystalCarry = (game.crystals ?? []).filter(c => c.carrier && c.carrier.id === pid).length;
  const gemCarry = (game.gems ?? []).filter(g => g.carrier && g.carrier.id === pid).length;
  return crystalCarry + gemCarry;
}

export class AstralAutoplay {
  private game: GameLike;
  private mode: string;
  private active = true;
  private lastSuperTry = 0;
  private lastAttackTry = 0;
  private state: BotState = "move";
  private stateUntil = 0;
  private superReadySince = 0;
  private moveX = 0;
  private moveY = 0;
  private lastPosCheckAt = 0;
  private lastPosX = 0;
  private lastPosY = 0;
  private stuckTicks = 0;
  private sidestepUntil = 0;
  private sidestepAngle = 0;

  constructor(game: GameLike, mode: string) {
    this.game = game;
    this.mode = mode;
  }

  destroy(): void {
    this.active = false;
    // Release any joystick state we were holding so manual input resumes cleanly.
    try {
      this.game.input.setMovementJoystick(0, 0);
      this.game.input.setAttackJoystick(false, 0);
      this.game.input.setSuperJoystick(false, 0);
    } catch { /* game may already be disposed */ }
  }

  setActive(v: boolean): void {
    this.active = v;
    if (!v) this.destroy();
  }

  tick(now: number): void {
    if (!this.active) return;
    const g = this.game;
    const p = g.player;
    if (!isAlive(p)) {
      try { g.input.setMovementJoystick(0, 0); } catch { /* noop */ }
      return;
    }

    const enemies = listEnemies(g, p);
    let target: BrawlerLike | null = null;
    let targetDist = Infinity;
    let bestTargetScore = -Infinity;
    let enemyCloseCount = 0;
    const carrying = carriedObjectiveCount(g, p);
    for (const e of enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < 340) enemyCloseCount++;
      const enemyHpPct = e.hp / Math.max(1, e.maxHp);
      const enemyCarry = ((e as any).gemsCarried ?? (e as any).crystalCount ?? 0) as number;
      let score = Math.max(0, 520 - d);
      score += (1 - enemyHpPct) * 190;
      score += enemyCarry * 70;
      if (this.mode === "gemgrab" || this.mode === "crystals") score += enemyCarry * 55;
      if (this.mode === "heist" || this.mode === "siege") score += (1 - enemyHpPct) * 80;
      if (score > bestTargetScore) {
        bestTargetScore = score;
        target = e;
        targetDist = d;
      }
    }

    const drops = listObjectiveDrops(g).filter(d => !d.collected);
    let bestDrop: DropLike | null = null;
    let bestDropScore = -Infinity;
    for (const d of drops) {
      const dd = dist(p.x, p.y, d.x, d.y);
      if (dd > 500) continue;
      let weight = 0;
      if (d.type === "health" && p.hp / p.maxHp < 0.7) weight = 1.5;
      if (d.type === "powerup") weight = 1.2;
      if (d.type === "coins") weight = 0.4;
      if (weight === 0) continue;
      const score = weight * 600 - dd;
      if (score > bestDropScore) { bestDropScore = score; bestDrop = d; }
    }

    let goalX = p.x;
    let goalY = p.y;
    let attackAngle: number | null = null;
    let mode: "engage" | "flee" | "pickup" | "regroup" = "regroup";

    const hpPct = p.hp / Math.max(1, p.maxHp);
    const maxAmmo = (p.maxAmmo ?? (p as any).attackCharges ?? 3);
    const ammoPct = maxAmmo > 0 ? ((p.ammo ?? 0) / maxAmmo) : 1;

    if ((p.superCharge ?? 0) >= 0.99) {
      if (!this.superReadySince) this.superReadySince = now;
    } else {
      this.superReadySince = 0;
    }

    if (g.gas && g.gas.radius > 0) {
      const cd = dist(p.x, p.y, g.gas.centerX, g.gas.centerY);
      if (cd > g.gas.radius * 0.85) {
        goalX = g.gas.centerX;
        goalY = g.gas.centerY;
        mode = "flee";
      }
    }

    if (mode !== "flee" && p.hp / p.maxHp < 0.30 && target && targetDist < 350) {
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      const len = Math.hypot(dx, dy) || 1;
      goalX = p.x + (dx / len) * 400;
      goalY = p.y + (dy / len) * 400;
      mode = "flee";
    }

    if (mode !== "flee" && enemyCloseCount >= 2 && hpPct < 0.75) {
      mode = "flee";
      if (target) {
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const len = Math.hypot(dx, dy) || 1;
        goalX = p.x + (dx / len) * 420;
        goalY = p.y + (dy / len) * 420;
      }
    }

    // Mode-specific objective bias.
    if (this.mode === "crystals" || this.mode === "gemgrab") {
      let nearestCrystal: DropLike | null = null;
      let crystalDist = Infinity;
      for (const d of drops) {
        if (d.type !== "coins") continue;
        const dd = dist(p.x, p.y, d.x, d.y);
        if (dd < crystalDist) { crystalDist = dd; nearestCrystal = d; }
      }
      if (nearestCrystal && mode !== "flee") {
        goalX = nearestCrystal.x;
        goalY = nearestCrystal.y;
        mode = "pickup";
      }
      if (carrying >= 8 && target && mode !== "flee") {
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const len = Math.hypot(dx, dy) || 1;
        goalX = p.x + (dx / len) * 520;
        goalY = p.y + (dy / len) * 520;
        mode = "flee";
      }
    }

    if (mode === "regroup" && bestDrop) {
      goalX = bestDrop.x; goalY = bestDrop.y; mode = "pickup";
    }

    if (mode === "regroup" && target) {
      const range = p.stats.attackRange ?? 200;
      const ideal = Math.max(60, range * 0.75);
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const canFight = hpPct > 0.35 && (ammoPct > 0.3 || d <= range * 0.8);
      if (!canFight && d < range * 1.2) {
        const rx = p.x - target.x;
        const ry = p.y - target.y;
        const rl = Math.hypot(rx, ry) || 1;
        goalX = p.x + (rx / rl) * 340;
        goalY = p.y + (ry / rl) * 340;
        mode = "flee";
      } else if (d > ideal) {
        goalX = p.x + (dx / d) * (d - ideal);
        goalY = p.y + (dy / d) * (d - ideal);
      } else {
        goalX = p.x + (-dy / d) * 60 * (Math.sin(now / 600) > 0 ? 1 : -1);
        goalY = p.y + ( dx / d) * 60 * (Math.sin(now / 600) > 0 ? 1 : -1);
      }
      attackAngle = Math.atan2(target.y - p.y, target.x - p.x);
      if (mode !== "flee") mode = "engage";
    }

    if (mode === "regroup" && !target) {
      const mw = g.map?.width ?? 2000;
      const mh = g.map?.height ?? 2000;
      goalX = mw / 2 + Math.cos(now / 1500) * 250;
      goalY = mh / 2 + Math.sin(now / 1500) * 250;
    }

    let mvDx = goalX - p.x;
    let mvDy = goalY - p.y;
    let mvLen = Math.hypot(mvDx, mvDy);
    if (!this.lastPosCheckAt) {
      this.lastPosCheckAt = now;
      this.lastPosX = p.x;
      this.lastPosY = p.y;
    } else if (now - this.lastPosCheckAt >= 350) {
      const moved = dist(this.lastPosX, this.lastPosY, p.x, p.y);
      const wantsMove = mvLen > 28;
      if (wantsMove && moved < 9) this.stuckTicks++;
      else this.stuckTicks = Math.max(0, this.stuckTicks - 1);
      if (this.stuckTicks >= 3) {
        this.sidestepUntil = now + 650;
        this.sidestepAngle = Math.random() * Math.PI * 2;
        this.stuckTicks = 0;
      }
      this.lastPosCheckAt = now;
      this.lastPosX = p.x;
      this.lastPosY = p.y;
    }
    if (this.sidestepUntil > now) {
      goalX = p.x + Math.cos(this.sidestepAngle) * 220;
      goalY = p.y + Math.sin(this.sidestepAngle) * 220;
      mvDx = goalX - p.x;
      mvDy = goalY - p.y;
      mvLen = Math.hypot(mvDx, mvDy);
    }
    const targetMoveX = mvLen > 12 ? mvDx / mvLen : 0;
    const targetMoveY = mvLen > 12 ? mvDy / mvLen : 0;
    // Smooth joystick updates to avoid jitter/stutter.
    this.moveX += (targetMoveX - this.moveX) * 0.28;
    this.moveY += (targetMoveY - this.moveY) * 0.28;
    if (Math.hypot(this.moveX, this.moveY) < 0.06) {
      this.moveX = 0;
      this.moveY = 0;
    }
    g.input.setMovementJoystick(this.moveX, this.moveY);

    if (target && attackAngle !== null) {
      // Let game-side auto-aim refine final direction for stable hits.
      g.input.setAttackJoystick(false, attackAngle);
      const range = p.stats.attackRange ?? 200;
      const inRange = targetDist <= range * 1.05;
      const desiredAttackCd = targetDist < range * 0.65 ? 290 : 360;
      if (inRange && (p.ammo ?? 1) > 0 && now - this.lastAttackTry > desiredAttackCd) {
        this.lastAttackTry = now;
        g.input.triggerAttack(p.x, p.y);
      }
      const shouldSuper = (p.superCharge ?? 0) >= 0.99 && (
        targetDist <= range * 1.4 ||
        enemyCloseCount >= 2 ||
        (((target as any)?.gemsCarried ?? 0) >= 5)
      );
      if (shouldSuper && now - this.lastSuperTry > 1050) {
        this.lastSuperTry = now;
        g.input.setSuperJoystick(true, attackAngle);
        g.input.triggerSuper(p.x, p.y);
      }

      // In mega mode preserve units: if current is very low HP, prioritize evasive
      // movement while still firing if the target can be finished quickly.
      if (this.mode === "megashowdown" && hpPct < 0.25) {
        const dx = p.x - target.x;
        const dy = p.y - target.y;
        const len = Math.hypot(dx, dy) || 1;
        g.input.setMovementJoystick(dx / len, dy / len);
      }
    } else {
      g.input.setAttackJoystick(false, 0);
      g.input.setSuperJoystick(false, 0);
      const crates = g.map?.crates ?? [];
      let nearestCrate: CrateLike | null = null;
      let nearestCrateDist = Infinity;
      for (const c of crates) {
        if (c.destroyed) continue;
        const cx = c.x + c.w / 2;
        const cy = c.y + c.h / 2;
        const d = dist(p.x, p.y, cx, cy);
        if (d < nearestCrateDist) { nearestCrateDist = d; nearestCrate = c; }
      }
      const range = p.stats.attackRange ?? 200;
      if (nearestCrate && nearestCrateDist < range * 0.9 && now - this.lastAttackTry > 600) {
        this.lastAttackTry = now;
        const angle = Math.atan2(
          (nearestCrate.y + nearestCrate.h / 2) - p.y,
          (nearestCrate.x + nearestCrate.w / 2) - p.x,
        );
        g.input.setAttackJoystick(true, angle);
        g.input.triggerAttack(p.x, p.y);
      }
      // If super is ready but we have no explicit target, still cast it —
      // game-side auto-aim will choose the nearest valid enemy.
      if ((p.superCharge ?? 0) >= 0.99 && now - this.lastSuperTry > 1500) {
        this.lastSuperTry = now;
        g.input.setSuperJoystick(false, 0);
        g.input.triggerSuper(p.x, p.y);
      }
    }
  }
}

export function buildBattleSnapshot(game: GameLike, mode: string, durationSec: number, petEffect: string | null): import("./AstralAssistant").BattleSnapshot {
  const p = game.player;
  let playerInfo: import("./AstralAssistant").BattleSnapshot["player"] = null;
  if (isAlive(p)) {
    playerInfo = {
      brawlerId: p.stats.id,
      brawlerName: p.stats.id,
      hp: Math.round(p.hp),
      maxHp: Math.round(p.maxHp),
      ammo: (p as any).ammo ?? 0,
      maxAmmo: (p as any).maxAmmo ?? (p as any).attackCharges ?? 3,
      superCharge: (p as any).superCharge ?? 0,
      superReadyForSec: (p as any).__astralSuperReadyForSec ?? (((p as any).superCharge ?? 0) >= 0.99 ? 2 : 0),
      speed: p.stats.speed ?? 0,
      attackRange: p.stats.attackRange ?? 200,
      buffs: [],
      debuffs: [],
      x: p.x, y: p.y,
    };
  }

  let nearest: import("./AstralAssistant").BattleSnapshot["nearestEnemy"] = null;
  let enemyCount = 0;
  let enemyCloseCount = 0;
  const allies: Array<{ hpPct: number; carryingObjective: number }> = [];
  if (p) {
    const merged = listEnemies(game, p);
    const alliesFromGame = (game.allies ?? []).filter(b => isAlive(b) && b.team === p.team);
    for (const b of alliesFromGame) {
      allies.push({
        hpPct: b.hp / Math.max(1, b.maxHp),
        carryingObjective: (b as any).gemsCarried ?? (b as any).crystalCount ?? 0,
      });
    }
    for (const b of merged) {
      enemyCount++;
      const d = dist(p.x, p.y, b.x, b.y);
      if (d < 340) enemyCloseCount++;
      if (!nearest || d < nearest.distance) {
        nearest = {
          distance: d,
          hpPct: b.hp / Math.max(1, b.maxHp),
          brawlerId: b.stats.id,
          brawlerName: b.stats.id,
          hasSuperReady: ((b as any).superCharge ?? 0) >= 0.98,
          x: b.x,
          y: b.y,
        };
      }
    }
    // If bots is used for all entities in this mode, still capture allies.
    for (const b of game.bots ?? []) {
      if (!isAlive(b)) continue;
      if (b.team === p.team) {
        allies.push({
          hpPct: b.hp / Math.max(1, b.maxHp),
          carryingObjective: (b as any).gemsCarried ?? 0,
        });
        continue;
      }
      // Enemies from game.bots are already added via listEnemies().
    }
  }

  let nearestPowerup: { distance: number; x: number; y: number; kind: string } | null = null;
  let nearestHealth:  { distance: number; x: number; y: number; kind: string } | null = null;
  let nearestCoin:    { distance: number; x: number; y: number; kind: string } | null = null;
  let objectiveItemsNearby = 0;
  if (p) {
    for (const d of listObjectiveDrops(game)) {
      if (d.collected) continue;
      const dd = dist(p.x, p.y, d.x, d.y);
      if (dd < 220) objectiveItemsNearby++;
      if (d.type === "powerup" && (!nearestPowerup || dd < nearestPowerup.distance)) nearestPowerup = { distance: dd, x: d.x, y: d.y, kind: d.type };
      if (d.type === "health"  && (!nearestHealth  || dd < nearestHealth.distance))  nearestHealth  = { distance: dd, x: d.x, y: d.y, kind: d.type };
      if (d.type === "coins"   && (!nearestCoin    || dd < nearestCoin.distance))    nearestCoin    = { distance: dd, x: d.x, y: d.y, kind: d.type };
    }
  }

  let nearestCrate: { distance: number; x: number; y: number } | null = null;
  if (p) {
    for (const c of game.map?.crates ?? []) {
      if (c.destroyed) continue;
      const cx = c.x + c.w / 2;
      const cy = c.y + c.h / 2;
      const cd = dist(p.x, p.y, cx, cy);
      if (!nearestCrate || cd < nearestCrate.distance) nearestCrate = { distance: cd, x: cx, y: cy };
    }
  }

  let gasDistance: number | null = null;
  if (p && game.gas && game.gas.radius > 0) {
    const cd = dist(p.x, p.y, game.gas.centerX, game.gas.centerY);
    // Positive = inside gas (outside safe radius), negative = inside safe ring.
    gasDistance = cd - game.gas.radius;
  }

  const carryingGems = p ? carriedObjectiveCount(game, p) : null;
  let enemyGems: number | null = null;
  if (carryingGems !== null) {
    let max = 0;
    for (const b of (p ? listEnemies(game, p) : [])) {
      const g = (b as any).gemsCarried ?? 0;
      if (g > max) max = g;
    }
    enemyGems = max;
  }

  const carryingObjective = (p as any)?.gemsCarried ?? null;
  const enemyObjective = enemyGems;

  return {
    mode, durationSec,
    player: playerInfo,
    nearestEnemy: nearest,
    enemyCount, enemyCloseCount, allies,
    nearestPowerup, nearestHealth, nearestCoin,
    nearestCrate, objectiveItemsNearby,
    gasDistance,
    carryingGems, enemyGems, carryingObjective, enemyObjective,
    petEffect,
  };
}
