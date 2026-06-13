import type { Brawler } from "../entities/Brawler";
import { TILE_CELL_SIZE } from "../game/TileMap";
import { clamp, distance } from "./helpers";
import { spawnEffect } from "./effects";
import { damageCratesInRadius, type CrateDamageOpts } from "./crateDamage";
import { groundEllipsePath } from "../game/battleVisualScale";

export const ZEPHYRIN_AIM_MIN = TILE_CELL_SIZE;
export const ZEPHYRIN_AIM_MAX = TILE_CELL_SIZE * 5;

const TORNADO_SPEED = 360;
const TORNADO_RADIUS = 44;
const TORNADO_DAMAGE = 900;
const TORNADO_PUSH = TILE_CELL_SIZE * 2;
const TORNADO_PUSH_STAR1 = TILE_CELL_SIZE * 3;
const GALE_BASE = 4;
const GALE_STAR5 = 6;
const GALE_SPEED = 0.5;
const GALE_SPEED_STAR2 = 0.15;
const HEAL_STAR3 = 700;
const SLOW_DURATION = 1;
const SLOW_AMOUNT = 0.3;
const TAU = Math.PI * 2;

interface ZephyrinTornado {
  id: string;
  x: number;
  y: number;
  angle: number;
  traveled: number;
  maxDist: number;
  ownerId: string;
  ownerTeam: string;
  stars: number[];
  hit: Set<string>;
  alive: boolean;
}

const activeGale = new Map<string, number[]>();
let tornados: ZephyrinTornado[] = [];
let nextId = 0;

export function clearZephyrinMechanics(): void {
  tornados = [];
  activeGale.clear();
}

export function isZephyrinInGale(b: Brawler): boolean {
  return b.statusEffects.some(e => e.type === "zephyrinGale");
}

function ownerOf(all: Brawler[], id: string): Brawler | null {
  return all.find(b => b.id === id) ?? null;
}

function tornadoValues(stars: Set<number>) {
  return {
    damage: TORNADO_DAMAGE + (stars.has(1) ? 300 : 0),
    push: stars.has(1) ? TORNADO_PUSH_STAR1 : TORNADO_PUSH,
    slow: stars.has(4),
  };
}

function galeValues(stars: Set<number>) {
  return {
    duration: stars.has(5) ? GALE_STAR5 : GALE_BASE,
    speed: GALE_SPEED + (stars.has(2) ? GALE_SPEED_STAR2 : 0),
  };
}

function landingPoint(
  owner: Brawler,
  angle: number,
  targetX?: number,
  targetY?: number,
  maxDist = ZEPHYRIN_AIM_MAX,
  mapW = 3600,
  mapH = 3600,
): { x: number; y: number; angle: number; dist: number } {
  let ex = owner.x + Math.cos(angle) * maxDist;
  let ey = owner.y + Math.sin(angle) * maxDist;
  let a = angle;
  if (typeof targetX === "number" && typeof targetY === "number") {
    const dx = targetX - owner.x;
    const dy = targetY - owner.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      a = Math.atan2(dy, dx);
      const dist = clamp(d, ZEPHYRIN_AIM_MIN, maxDist);
      ex = owner.x + (dx / d) * dist;
      ey = owner.y + (dy / d) * dist;
    }
  }
  const dist = Math.hypot(ex - owner.x, ey - owner.y);
  return {
    x: clamp(ex, owner.radius, mapW - owner.radius),
    y: clamp(ey, owner.radius, mapH - owner.radius),
    angle: a,
    dist: clamp(dist, ZEPHYRIN_AIM_MIN, maxDist),
  };
}

export function resolveZephyrinAimFromTarget(
  owner: { x: number; y: number; angle: number },
  targetX: number,
  targetY: number,
  maxDist = ZEPHYRIN_AIM_MAX,
): { x: number; y: number; angle: number } {
  const dx = targetX - owner.x;
  const dy = targetY - owner.y;
  const d = Math.hypot(dx, dy);
  const angle = d > 0.01 ? Math.atan2(dy, dx) : owner.angle;
  const dist = d > 0.01 ? clamp(d, ZEPHYRIN_AIM_MIN, maxDist) : maxDist;
  return {
    x: owner.x + Math.cos(angle) * dist,
    y: owner.y + Math.sin(angle) * dist,
    angle,
  };
}

export function resolveZephyrinAutoAimFromUnits(
  owner: Brawler,
  units: Brawler[],
): { x: number; y: number; angle: number } | null {
  let best: Brawler | null = null;
  let bestD = Infinity;
  for (const u of units) {
    if (!u.alive || u.team === owner.team) continue;
    const d = distance(owner.x, owner.y, u.x, u.y);
    if (d <= ZEPHYRIN_AIM_MAX + u.radius && d < bestD) {
      bestD = d;
      best = u;
    }
  }
  if (!best) return null;
  return resolveZephyrinAimFromTarget(owner, best.x, best.y);
}

function pushEnemy(b: Brawler, angle: number, pushDist: number, mapW: number, mapH: number): void {
  b.x = clamp(b.x + Math.cos(angle) * pushDist, b.radius, mapW - b.radius);
  b.y = clamp(b.y + Math.sin(angle) * pushDist, b.radius, mapH - b.radius);
}

function spawnTornado(
  owner: Brawler,
  angle: number,
  startX: number,
  startY: number,
  maxDist: number,
): void {
  tornados.push({
    id: `zephyrin_tornado_${nextId++}`,
    x: startX,
    y: startY,
    angle,
    traveled: 0,
    maxDist,
    ownerId: owner.id,
    ownerTeam: owner.team,
    stars: owner.constellationStars || [],
    hit: new Set(),
    alive: true,
  });

  spawnEffect({
    kind: "zephyrinTornadoLaunch",
    x: startX,
    y: startY,
    angle,
    radius: TORNADO_RADIUS,
    color: "#CFD8DC",
    secondary: "#FFFFFF",
    timer: 0.35,
    maxTimer: 0.35,
  });
  spawnEffect({
    kind: "zephyrinWhirlwindCast",
    x: owner.x,
    y: owner.y,
    angle,
    radius: owner.radius + 18,
    color: "#ECEFF1",
    secondary: "#FFFFFF",
    timer: 0.42,
    maxTimer: 0.42,
  });
}

export function launchZephyrinTornado(
  owner: Brawler,
  angle: number,
  targetX?: number,
  targetY?: number,
  mapW = 3600,
  mapH = 3600,
): void {
  const land = landingPoint(owner, angle, targetX, targetY, ZEPHYRIN_AIM_MAX, mapW, mapH);
  const sx = owner.x + Math.cos(land.angle) * (owner.radius + 8);
  const sy = owner.y + Math.sin(land.angle) * (owner.radius + 8);
  spawnTornado(owner, land.angle, sx, sy, land.dist);
}

function launchStormBurst(owner: Brawler, mapW: number, mapH: number): void {
  for (let i = 0; i < 3; i++) {
    const angle = owner.angle + (i * TAU) / 3;
    spawnTornado(owner, angle, owner.x, owner.y, ZEPHYRIN_AIM_MAX);
  }
  spawnEffect({
    kind: "zephyrinStormBurst",
    x: owner.x,
    y: owner.y,
    radius: owner.radius * 2.8,
    color: "#E1BEE7",
    secondary: "#FFFFFF",
    timer: 0.85,
    maxTimer: 0.85,
  });
}

function onGaleEnd(owner: Brawler, stars: Set<number>, mapW: number, mapH: number): void {
  if (stars.has(3)) owner.heal(HEAL_STAR3);
  if (stars.has(6)) launchStormBurst(owner, mapW, mapH);
}

export function activateZephyrinGale(owner: Brawler): void {
  const stars = new Set(owner.constellationStars ?? []);
  const vals = galeValues(stars);

  owner.statusEffects = owner.statusEffects.filter(e =>
    e.type !== "speedBoost" &&
    e.type !== "bloodMoon" &&
    e.type !== "vampireNight" &&
    e.type !== "berserker",
  );
  owner.grantSpawnShield(vals.duration);
  owner.addStatus("speedBoost", vals.duration, vals.speed);
  owner.addStatus("zephyrinGale", vals.duration, 0);
  owner.inZephyrinGale = true;
  activeGale.set(owner.id, owner.constellationStars ?? []);

  spawnEffect({
    kind: "zephyrinGaleAura",
    x: owner.x,
    y: owner.y,
    radius: owner.radius + 26,
    color: "#E1BEE7",
    secondary: "#FFFFFF",
    timer: vals.duration,
    maxTimer: vals.duration,
    followBrawler: owner,
    linkedStatus: "zephyrinGale",
  });
  spawnEffect({
    kind: "zephyrinSuperCast",
    x: owner.x,
    y: owner.y,
    radius: owner.radius * 2.4,
    color: "#AB47BC",
    secondary: "#FFFFFF",
    timer: 1.05,
    maxTimer: 1.05,
  });
}

function tickTornado(
  t: ZephyrinTornado,
  all: Brawler[],
  dt: number,
  mapW: number,
  mapH: number,
  crateOpts?: CrateDamageOpts,
): void {
  const step = TORNADO_SPEED * dt;
  t.x += Math.cos(t.angle) * step;
  t.y += Math.sin(t.angle) * step;
  t.traveled += step;
  if (t.traveled >= t.maxDist) {
    t.alive = false;
    spawnEffect({
      kind: "zephyrinTornadoFade",
      x: t.x,
      y: t.y,
      radius: TORNADO_RADIUS,
      color: "#B0BEC5",
      secondary: "#FFFFFF",
      timer: 0.35,
      maxTimer: 0.35,
    });
    return;
  }

  const owner = ownerOf(all, t.ownerId);
  const stars = new Set(t.stars);
  const vals = tornadoValues(stars);

  damageCratesInRadius(t.x, t.y, TORNADO_RADIUS, vals.damage, crateOpts);

  for (const b of all) {
    if (!b.alive || b.team === t.ownerTeam) continue;
    if (t.hit.has(b.id)) continue;
    if (distance(t.x, t.y, b.x, b.y) > TORNADO_RADIUS + b.radius) continue;
    t.hit.add(b.id);
    b.takeDamage(vals.damage, owner);
    pushEnemy(b, t.angle, vals.push, mapW, mapH);
    if (vals.slow) b.addStatus("slow", SLOW_DURATION, SLOW_AMOUNT);
    spawnEffect({
      kind: "zephyrinTornadoHit",
      x: b.x,
      y: b.y,
      radius: b.radius + 12,
      color: "#CFD8DC",
      secondary: "#FFFFFF",
      timer: 0.4,
      maxTimer: 0.4,
    });
  }
}

function syncGales(all: Brawler[], mapW: number, mapH: number): void {
  for (const b of all) {
    b.inZephyrinGale = isZephyrinInGale(b);
  }
  for (const [id, stars] of activeGale) {
    const b = ownerOf(all, id);
    if (!b || !b.alive || !isZephyrinInGale(b)) {
      if (b && b.alive) {
        b.inZephyrinGale = false;
        onGaleEnd(b, new Set(stars), mapW, mapH);
      }
      activeGale.delete(id);
    }
  }
}

export function updateZephyrinMechanics(
  all: Brawler[],
  dt: number,
  mapW = 3600,
  mapH = 3600,
  crateOpts?: CrateDamageOpts,
): void {
  for (let i = tornados.length - 1; i >= 0; i--) {
    const t = tornados[i];
    if (!t.alive) {
      tornados.splice(i, 1);
      continue;
    }
    tickTornado(t, all, dt, mapW, mapH, crateOpts);
  }
  syncGales(all, mapW, mapH);
}

export function renderZephyrinTornados(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  frame: number,
): void {
  for (const t of tornados) {
    if (!t.alive) continue;
    const x = t.x - camX;
    const y = t.y - camY;
    const spin = frame * 0.24 + t.traveled * 0.028;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";

    for (let ring = 0; ring < 4; ring++) {
      const rr = TORNADO_RADIUS * (0.28 + ring * 0.2);
      const rot = spin + ring * 0.85;
      ctx.save();
      ctx.rotate(rot);
      ctx.globalAlpha = 0.72 - ring * 0.08;
      for (let arm = 0; arm < 4; arm++) {
        const a = (arm / 4) * TAU;
        ctx.strokeStyle = arm % 2 === 0 ? "#FFFFFF" : "#CFD8DC";
        ctx.lineWidth = arm === 0 ? 3.5 : 2.2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
          Math.cos(a) * rr * 0.42,
          Math.sin(a) * rr * 0.18,
          Math.cos(a + 0.55) * rr,
          Math.sin(a + 0.55) * rr * 0.34,
        );
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.globalAlpha = 0.38;
    ctx.fillStyle = "#ECEFF1";
    groundEllipsePath(ctx, 0, 0, TORNADO_RADIUS * 0.62);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2;
    groundEllipsePath(ctx, 0, 0, TORNADO_RADIUS * 0.78);
    ctx.stroke();
    ctx.restore();
  }
}

export type ZephyrinMechanicsSnapshot = {
  tornados: Array<Omit<ZephyrinTornado, "hit"> & { hit: string[] }>;
};

export function snapshotZephyrinMechanics(): ZephyrinMechanicsSnapshot {
  return {
    tornados: tornados.map(t => ({ ...t, hit: [...t.hit] })),
  };
}

export function restoreZephyrinMechanicsSnapshot(snapshot: ZephyrinMechanicsSnapshot | undefined): void {
  if (!snapshot) {
    clearZephyrinMechanics();
    return;
  }
  tornados = snapshot.tornados.map(t => ({ ...t, hit: new Set(t.hit) }));
}
