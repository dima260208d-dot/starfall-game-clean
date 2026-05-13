import { Brawler } from "../../entities/Brawler";
import { createProjectile, Projectile } from "../../entities/Projectile";
import { GameMap } from "../../game/MapRenderer";
import { angleTo, distance, randomInt, randomFloat } from "../../utils/helpers";
import { spawnEffect } from "../../utils/effects";
import type { BossRaidOverlayPhase } from "./bossRaidPhases";
import { phaseDamageMul, phaseAttackSpeedMul } from "./bossRaidPhases";

export interface RaidBossAiCtx {
  dt: number;
  frame: number;
  raidLevel: number;
  boss: Brawler;
  blues: Brawler[];
  map: GameMap;
  projectiles: Projectile[];
  overlayPhase: BossRaidOverlayPhase;
  attackCd: { current: number };
  patternT: { current: number };
  /** Extra projectile radius for boss shots (gameplay hitbox). */
  projRadiusMul: number;
}

const spd = 420;

function nearestBlue(ctx: RaidBossAiCtx): Brawler | null {
  let best: Brawler | null = null;
  let d0 = 1e9;
  for (const b of ctx.blues) {
    if (!b.alive) continue;
    const d = distance(ctx.boss.x, ctx.boss.y, b.x, b.y);
    if (d < d0) {
      d0 = d;
      best = b;
    }
  }
  return best;
}

function shoot(ctx: RaidBossAiCtx, a: number, dmg: number, r = 10, pierce = false, rangeMul = 1.8): void {
  const rm = ctx.projRadiusMul;
  ctx.projectiles.push(
    createProjectile({
      x: ctx.boss.x,
      y: ctx.boss.y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      radius: r * rm,
      damage: dmg,
      speed: spd,
      range: ctx.boss.stats.attackRange * rangeMul,
      ownerId: ctx.boss.id,
      ownerTeam: ctx.boss.team,
      color: ctx.boss.stats.accentColor || "#fff",
      type: "bullet",
      piercing: pierce,
    }),
  );
}

/** Miya: L1 baseline shot; L2 fan; L3 ring volley; L4 shadow zones; L5 rapid triple + ring. */
function tickMiyaBossAttacks(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  const L = ctx.raidLevel;
  shoot(ctx, ang, dmg, 9, true);
  if (L >= 2) {
    shoot(ctx, ang + 0.18, Math.floor(dmg * 0.85), 8, false);
    shoot(ctx, ang - 0.18, Math.floor(dmg * 0.85), 8, false);
  }
  if (L >= 3 && ctx.frame % 45 === 0) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      shoot(ctx, a, Math.floor(dmg * 0.55), 7, false, 2.2);
    }
  }
  if (L >= 4 && ctx.frame % 90 === 0) {
    const t = nearestBlue(ctx);
    if (t) {
      spawnEffect({
        kind: "poisonZone",
        x: t.x + randomInt(-40, 40),
        y: t.y + randomInt(-40, 40),
        timer: 3.2,
        maxTimer: 3.2,
        radius: 100,
        color: "#7c4dff",
        ownerId: ctx.boss.id,
        ownerTeam: "red",
        damagePerTick: Math.max(40, Math.floor(dmg * 0.2)),
        tickInterval: 0.4,
        tickRange: 95,
        tickTimer: 0.15,
        particleCount: 10,
      });
    }
  }
  if (L >= 5) {
    if (ctx.frame % 20 === 0) {
      shoot(ctx, ang + Math.PI / 2, Math.floor(dmg * 0.75), 8, true);
      shoot(ctx, ang - Math.PI / 2, Math.floor(dmg * 0.75), 8, true);
    }
    if (ctx.frame % 55 === 0) {
      for (let k = 0; k < 5; k++) {
        const a = ang + (k - 2) * 0.35;
        shoot(ctx, a, Math.floor(dmg * 0.7), 8, false);
      }
    }
  }
}

function tickYukiBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 11, false);
  if (ctx.raidLevel >= 3 && ctx.frame % 110 === 0) {
    spawnEffect({
      kind: "snowZone",
      x: ctx.boss.x + Math.cos(ang) * 140,
      y: ctx.boss.y + Math.sin(ang) * 140,
      timer: 4,
      maxTimer: 4,
      radius: 130,
      color: "#b3e5fc",
      ownerId: ctx.boss.id,
      ownerTeam: "red",
      damagePerTick: Math.max(35, Math.floor(dmg * 0.18)),
      tickInterval: 0.45,
      tickRange: 125,
      tickTimer: 0.2,
      particleCount: 14,
    });
  }
  if (ctx.raidLevel >= 4) shoot(ctx, ang + 0.35, Math.floor(dmg * 0.9), 9, false);
}

function tickKenjiBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 10, false);
  if (ctx.raidLevel >= 2) {
    spawnEffect({
      kind: "lightningBolt",
      x: ctx.boss.x,
      y: ctx.boss.y,
      toX: ctx.boss.x + Math.cos(ang) * 420,
      toY: ctx.boss.y + Math.sin(ang) * 420,
      timer: 0.35,
      maxTimer: 0.35,
      radius: 22,
      color: "#ffeb3b",
    });
  }
  if (ctx.raidLevel >= 4 && ctx.frame % 100 === 0) {
    spawnEffect({
      kind: "lightCage",
      x: ctx.boss.x,
      y: ctx.boss.y,
      timer: 2.8,
      maxTimer: 2.8,
      radius: 160,
      color: "#ffd740",
      ownerId: ctx.boss.id,
      ownerTeam: "red",
      damagePerTick: Math.max(45, Math.floor(dmg * 0.22)),
      tickInterval: 0.5,
      tickRange: 150,
      tickTimer: 0.25,
    });
  }
}

function tickHanaBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 10, false);
  if (ctx.raidLevel >= 3 && ctx.frame % 95 === 0) {
    spawnEffect({
      kind: "petalZone",
      x: ctx.boss.x,
      y: ctx.boss.y,
      timer: 3.5,
      maxTimer: 3.5,
      radius: 140,
      color: "#f48fb1",
      ownerId: ctx.boss.id,
      ownerTeam: "red",
      damagePerTick: Math.max(30, Math.floor(dmg * 0.16)),
      tickInterval: 0.55,
      tickRange: 135,
      tickTimer: 0.2,
      particleCount: 16,
    });
  }
}

function tickGoroBoss(ctx: RaidBossAiCtx, dmg: number): void {
  const br = [...ctx.blues].filter((b) => b.alive);
  ctx.boss.meleeAttack(br);
  if (ctx.raidLevel >= 3 && ctx.frame % 80 === 0) {
    spawnEffect({
      kind: "berserkAura",
      x: ctx.boss.x,
      y: ctx.boss.y,
      timer: 2.5,
      maxTimer: 2.5,
      radius: ctx.boss.radius + 40,
      color: "#ff5722",
      followBrawler: ctx.boss,
      ownerId: ctx.boss.id,
      ownerTeam: "red",
      damagePerTick: Math.max(50, Math.floor(dmg * 0.25)),
      tickInterval: 0.45,
      tickRange: ctx.boss.radius + 55,
      tickTimer: 0.2,
    });
  }
}

function tickSoraBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 12, false);
  if (ctx.raidLevel >= 4 && ctx.frame % 130 === 0) {
    const t = nearestBlue(ctx);
    if (t) {
      spawnEffect({
        kind: "meteor",
        x: t.x,
        y: t.y,
        timer: 2.2,
        maxTimer: 2.2,
        radius: 28,
        color: "#ff7043",
        delay: 0.9,
        damagePerTick: Math.floor(dmg * 2.2),
        tickRange: 95,
        ownerTeam: "red",
      });
    }
  }
}

function tickRinBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 10, true);
  if (ctx.raidLevel >= 3 && ctx.frame % 75 === 0) {
    spawnEffect({
      kind: "poisonZone",
      x: ctx.boss.x + Math.cos(ang) * 100,
      y: ctx.boss.y + Math.sin(ang) * 100,
      timer: 3,
      maxTimer: 3,
      radius: 110,
      color: "#69f0ae",
      ownerId: ctx.boss.id,
      ownerTeam: "red",
      damagePerTick: Math.max(38, Math.floor(dmg * 0.19)),
      tickInterval: 0.42,
      tickRange: 105,
      tickTimer: 0.15,
      particleCount: 12,
    });
  }
}

function tickTaroBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  const br = [...ctx.blues].filter((b) => b.alive);
  ctx.boss.meleeAttack(br);
  if (ctx.raidLevel >= 4 && ctx.frame % 140 === 0) {
    spawnEffect({
      kind: "turret",
      x: ctx.boss.x + Math.cos(ang + randomFloat(-0.4, 0.4)) * 80,
      y: ctx.boss.y + Math.sin(ang + randomFloat(-0.4, 0.4)) * 80,
      timer: 8,
      maxTimer: 8,
      radius: 22,
      color: "#90a4ae",
      ownerId: `${ctx.boss.id}_t_${ctx.frame}`,
      ownerTeam: "red",
      damagePerTick: Math.max(55, Math.floor(dmg * 0.35)),
      tickInterval: 0.55,
      tickRange: 260,
      tickTimer: 0.3,
    });
  }
}

function tickRoninBoss(ctx: RaidBossAiCtx, dmg: number): void {
  const br = [...ctx.blues].filter((b) => b.alive);
  ctx.boss.meleeAttack(br);
  if (ctx.raidLevel >= 3 && ctx.frame % 100 === 0) {
    spawnEffect({
      kind: "shieldDome",
      x: ctx.boss.x,
      y: ctx.boss.y,
      timer: 2.2,
      maxTimer: 2.2,
      radius: ctx.boss.radius + 30,
      color: "#b0bec5",
      followBrawler: ctx.boss,
    });
  }
}

function tickZafkielBoss(ctx: RaidBossAiCtx, ang: number, dmg: number): void {
  shoot(ctx, ang, dmg, 13, false);
  if (ctx.raidLevel >= 2) shoot(ctx, ang + 0.12, Math.floor(dmg * 0.92), 12, false);
  if (ctx.raidLevel >= 4) {
    shoot(ctx, ang - 0.22, Math.floor(dmg * 0.88), 11, false);
    shoot(ctx, ang + 0.28, Math.floor(dmg * 0.88), 11, false);
  }
  if (ctx.raidLevel >= 5 && ctx.frame % 50 === 0) {
    for (let i = 0; i < 3; i++) {
      const a = ang + (i - 1) * 0.5;
      shoot(ctx, a, Math.floor(dmg * 0.65), 9, false, 2.4);
    }
  }
}

export function tickRaidBossAI(ctx: RaidBossAiCtx): void {
  ctx.patternT.current += ctx.dt;
  const mul = phaseDamageMul(ctx.overlayPhase);
  const scaled = () =>
    Math.round(ctx.boss.scaledDamage * mul * (1 + Math.max(0, ctx.raidLevel - 5) * 0.05));

  ctx.attackCd.current -= ctx.dt;
  if (ctx.attackCd.current > 0) return;
  const baseCd = Math.max(0.35, ctx.boss.stats.attackCooldown / phaseAttackSpeedMul(ctx.overlayPhase));
  ctx.attackCd.current = baseCd * (ctx.raidLevel >= 5 ? 0.92 : 1);

  const tgt = nearestBlue(ctx);
  if (!tgt) return;
  const ang = angleTo(ctx.boss.x, ctx.boss.y, tgt.x, tgt.y);
  ctx.boss.angle = ang;
  const dmg = scaled();
  const id = ctx.boss.stats.id;

  if (id === "miya") {
    tickMiyaBossAttacks(ctx, ang, dmg);
  } else if (id === "yuki") {
    tickYukiBoss(ctx, ang, dmg);
  } else if (id === "kenji") {
    tickKenjiBoss(ctx, ang, dmg);
  } else if (id === "hana") {
    tickHanaBoss(ctx, ang, dmg);
  } else if (id === "goro") {
    tickGoroBoss(ctx, dmg);
  } else if (id === "sora") {
    tickSoraBoss(ctx, ang, dmg);
  } else if (id === "rin") {
    tickRinBoss(ctx, ang, dmg);
  } else if (id === "taro") {
    tickTaroBoss(ctx, ang, dmg);
  } else if (id === "ronin") {
    tickRoninBoss(ctx, dmg);
  } else if (id === "zafkiel") {
    tickZafkielBoss(ctx, ang, dmg);
  } else {
    shoot(ctx, ang, dmg, 11, false);
  }

  if (ctx.raidLevel >= 2 && !["goro", "ronin", "taro"].includes(id)) {
    shoot(ctx, ang + 0.22, Math.floor(dmg * 0.75), 8, false);
  }
}

export function pickAllyBrawlers(bossId: string, playerId: string): string[] {
  const pool = ["miya", "ronin", "yuki", "kenji", "hana", "goro", "sora", "rin", "taro", "zafkiel"].filter(
    (id) => id !== bossId && id !== playerId,
  );
  const out: string[] = [];
  while (out.length < 4 && pool.length > 0) {
    const i = randomInt(0, pool.length - 1);
    out.push(pool[i]);
    pool.splice(i, 1);
  }
  while (out.length < 4) out.push("hana");
  return out;
}
