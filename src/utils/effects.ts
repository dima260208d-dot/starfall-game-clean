import type { Brawler } from "../entities/Brawler";
import { updateBattleScreenFX } from "../game/battleScreenFX";
import { WORLD_VFX_CANVAS_SCALE } from "../game/battleVisualScale";

export type EffectKind =
  | "burst"        // Quick expanding ring + radial sparks (muzzle / impact)
  | "shockwave"    // Larger expanding ring (e.g. Sora meteor impact)
  | "spark"        // Tiny short-lived particle (gun smoke / trail dust)
  | "trail"        // Fading line segment (teleport line, dagger trace)
  | "snowZone"     // Yuki super: swirling snowflakes inside an ice circle
  | "lightCage"    // Kenji super: rotating electric arcs around a fixed area
  | "petalZone"    // Hana super: floating pink petals inside a heal circle
  | "poisonZone"   // Rin super: bubbling green fog
  | "meteor"       // Sora super: warning marker, falling rock, big impact
  | "lightningBolt"// Kenji single chain segment, also generic zigzag bolt
  | "turret"       // Taro super: stationary mech turret that fires at enemies
  | "berserkAura"  // Goro super: spinning fire ring around a brawler
  | "shieldDome"   // Ronin super: shimmering shield disc around a brawler
  | "teleportFlash"; // Miya super: shadow swirl at depart + arrival

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  // Persisted-target follow: when set, x/y are refreshed each frame from the brawler.
  followBrawler?: Brawler | null;

  timer: number;
  maxTimer: number;

  radius: number;
  color: string;
  secondary?: string;

  // For trail/lightning bolts and one-shot beams.
  toX?: number;
  toY?: number;

  // Meteor: time before it actually lands (countdown inside its own life).
  delay?: number;
  exploded?: boolean;
  fallHeight?: number;

  // Damage-tick for turrets and tickable zones.
  ownerId?: string;
  ownerTeam?: string;
  damagePerTick?: number;
  tickInterval?: number;
  tickTimer?: number;
  tickRange?: number;

  // Pre-baked random seeds so particles look stable over time, not jittery.
  seed: number;
  // Number of decorative sub-particles (snowflakes, petals, bubbles).
  particleCount?: number;
  // Cached zigzag points for a lightning bolt.
  zigzag?: { x: number; y: number }[];

  // For followBrawler shields/auras: if set, the effect is removed when the
  // brawler no longer has the named status. If unset, the effect simply runs
  // its timer (used by the spawn shield, which has no underlying status).
  linkedStatus?: "stun" | "berserker";
}

const effects: Effect[] = [];
let seedCounter = 0;
const nextSeed = () => (seedCounter = (seedCounter + 1) >>> 0);

export function spawnEffect(eff: Omit<Effect, "seed"> & { seed?: number }): Effect {
  const e: Effect = { seed: eff.seed ?? nextSeed(), ...eff } as Effect;
  effects.push(e);
  return e;
}

export function clearEffects(): void {
  effects.length = 0;
}

/** Taro: remove every active turret owned by this placement key (see Brawler.turretPlacementId). */
export function removeTurretsForOwner(ownerKey: string): void {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    if (e.kind === "turret" && e.ownerId === ownerKey) effects.splice(i, 1);
  }
}

/** One turret per owner key: strip old, then add the new effect. */
export function spawnTaroTurretEffect(
  ownerKey: string,
  ownerTeam: string,
  eff: Omit<Effect, "seed" | "kind" | "ownerId" | "ownerTeam"> & { seed?: number },
): Effect {
  removeTurretsForOwner(ownerKey);
  return spawnEffect({
    kind: "turret",
    ownerId: ownerKey,
    ownerTeam,
    ...eff,
  } as Omit<Effect, "seed"> & { seed?: number });
}

// Build a sequence of zigzag points between two endpoints. Used for lightning bolts.
export function makeZigzag(x1: number, y1: number, x2: number, y2: number, segments = 6, jitter = 18): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [{ x: x1, y: y1 }];
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Perpendicular unit vector for jitter.
  const len = Math.max(1, Math.hypot(dx, dy));
  const px = -dy / len;
  const py = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    const j = (Math.random() * 2 - 1) * jitter;
    pts.push({ x: cx + px * j, y: cy + py * j });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

// ───────────────────────────────────────────────────────────────────────────
// UPDATE
// ───────────────────────────────────────────────────────────────────────────

export function updateEffects(dt: number, allBrawlers: Brawler[]): void {
  updateBattleScreenFX(dt);
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.timer -= dt;

    // Follow a moving brawler if attached. Aura/shield should disappear the
    // instant the brawler dies or the underlying status wears off — never
    // render lingering buffs over a corpse.
    if (e.followBrawler) {
      if (!e.followBrawler.alive) { effects.splice(i, 1); continue; }
      e.x = e.followBrawler.x;
      e.y = e.followBrawler.y;
      if (e.linkedStatus && !e.followBrawler.statusEffects.some(s => s.type === e.linkedStatus)) {
        effects.splice(i, 1); continue;
      }
    }

    // Meteor: warning → impact.
    if (e.kind === "meteor") {
      if (e.delay !== undefined && !e.exploded) {
        e.delay -= dt;
        if (e.delay <= 0) {
          e.exploded = true;
          // Apply damage on impact.
          if (e.damagePerTick && e.tickRange && e.ownerTeam) {
            for (const b of allBrawlers) {
              if (!b.alive || b.team === e.ownerTeam) continue;
              const dx = b.x - e.x, dy = b.y - e.y;
              if (dx * dx + dy * dy <= e.tickRange * e.tickRange) {
                b.takeDamage(e.damagePerTick, null);
              }
            }
          }
          // Spawn a shockwave + sparks at the impact point.
          spawnEffect({
            kind: "shockwave", x: e.x, y: e.y,
            radius: e.tickRange ?? 60, color: e.color,
            timer: 0.55, maxTimer: 0.55,
          });
          for (let s = 0; s < 8; s++) {
            const a = (s / 8) * Math.PI * 2;
            spawnEffect({
              kind: "spark", x: e.x, y: e.y, toX: e.x + Math.cos(a) * 40, toY: e.y + Math.sin(a) * 40,
              radius: 4, color: e.color,
              timer: 0.4, maxTimer: 0.4,
            });
          }
        }
      }
    }

    // Damage-ticking zones (poison, electric cage, garden friendly heals not done here).
    if (e.damagePerTick && e.tickInterval && e.tickRange && e.ownerTeam && e.kind !== "meteor") {
      e.tickTimer = (e.tickTimer ?? 0) - dt;
      if (e.tickTimer <= 0) {
        e.tickTimer = e.tickInterval;
        for (const b of allBrawlers) {
          if (!b.alive || b.team === e.ownerTeam) continue;
          const dx = b.x - e.x, dy = b.y - e.y;
          if (dx * dx + dy * dy <= e.tickRange * e.tickRange) {
            b.takeDamage(e.damagePerTick, null, { suppressScreenFlash: true });
          }
        }
      }
    }

    // Turret behaviour: shoot at the nearest enemy on a fixed cadence.
    if (e.kind === "turret" && e.tickInterval && e.ownerTeam) {
      e.tickTimer = (e.tickTimer ?? 0) - dt;
      if (e.tickTimer <= 0) {
        e.tickTimer = e.tickInterval;
        // Find nearest live enemy in range.
        let best: Brawler | null = null;
        let bestD2 = (e.tickRange ?? 250) ** 2;
        for (const b of allBrawlers) {
          if (!b.alive || b.team === e.ownerTeam) continue;
          const dx = b.x - e.x, dy = b.y - e.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD2) { bestD2 = d2; best = b; }
        }
        if (best && e.damagePerTick) {
          best.takeDamage(e.damagePerTick, null, { suppressScreenFlash: true });
          // Spawn a quick beam / spark from the turret to the target.
          spawnEffect({
            kind: "trail", x: e.x, y: e.y, toX: best.x, toY: best.y,
            radius: 3, color: "#FFEB3B", secondary: "#FF6F00",
            timer: 0.18, maxTimer: 0.18,
          });
          spawnEffect({
            kind: "burst", x: best.x, y: best.y,
            radius: 14, color: "#FFEB3B",
            timer: 0.25, maxTimer: 0.25,
          });
        }
      }
    }

    if (e.timer <= 0) effects.splice(i, 1);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// RENDER
// ───────────────────────────────────────────────────────────────────────────

export function renderEffects(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  frame: number,
): void {
  for (const e of effects) {
    const sx = e.x - camX;
    const sy = e.y - camY;
    const lifeT = 1 - e.timer / e.maxTimer;
    const fade = Math.max(0, Math.min(1, e.timer / e.maxTimer));
    const R = e.radius * WORLD_VFX_CANVAS_SCALE;

    ctx.save();
    switch (e.kind) {

      // ── BURST ─────────────────────────────────────────────────────────────
      case "burst": {
        const breath = 1 + 0.1 * Math.sin(frame * 0.14 + e.seed * 0.02);
        const r = R * (0.3 + lifeT * 1.4) * breath;
        ctx.shadowColor = e.color; ctx.shadowBlur = 28;
        // Outer expanding ring
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = e.color; ctx.lineWidth = 4 * fade + 1;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        // Second thinner ring slightly behind
        ctx.globalAlpha = fade * 0.5;
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
        // Flash fill
        ctx.globalAlpha = fade * (1 - lifeT) * 0.8;
        const flashG = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
        flashG.addColorStop(0, "rgba(255,255,255,0.95)");
        flashG.addColorStop(0.4, e.color.replace(")", ",0.55)").replace("rgb(", "rgba("));
        flashG.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = flashG;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
        // Radial spark lines
        ctx.globalAlpha = fade * 0.75;
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 1.5;
        const nSpk = 8;
        for (let i = 0; i < nSpk; i++) {
          const a = (i / nSpk) * Math.PI * 2 + e.seed + frame * 0.04;
          const r0 = r * 0.5;
          const r1 = r * (0.9 + (i % 3) * 0.12);
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
          ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
          ctx.stroke();
        }
        break;
      }

      // ── SHOCKWAVE ─────────────────────────────────────────────────────────
      case "shockwave": {
        const breath = 1 + 0.06 * Math.sin(frame * 0.1 + e.seed * 0.03);
        const r = R * (0.4 + lifeT * 1.8) * breath;
        ctx.shadowColor = e.color; ctx.shadowBlur = 30;
        // Ground ring
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = e.color; ctx.lineWidth = 7 * fade + 1;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.88, 0, Math.PI * 2); ctx.stroke();
        // Secondary outer ripple
        ctx.globalAlpha = fade * 0.45;
        ctx.strokeStyle = e.color; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.2, 0, Math.PI * 2); ctx.stroke();
        // Fill haze
        ctx.globalAlpha = fade * 0.15;
        const hazeG = ctx.createRadialGradient(sx, sy, r * 0.3, sx, sy, r * 1.1);
        hazeG.addColorStop(0, e.color.replace(")", ",0)").replace("rgb(", "rgba("));
        hazeG.addColorStop(0.5, e.color.replace(")", ",0.35)").replace("rgb(", "rgba("));
        hazeG.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = hazeG;
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.1, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── SPARK ─────────────────────────────────────────────────────────────
      case "spark": {
        const tx = (e.toX ?? e.x) - camX;
        const ty = (e.toY ?? e.y) - camY;
        const px = sx + (tx - sx) * lifeT;
        const py = sy + (ty - sy) * lifeT;
        ctx.globalAlpha = fade;
        ctx.shadowColor = e.color; ctx.shadowBlur = 12;
        // Glow corona
        const cg = ctx.createRadialGradient(px, py, 0, px, py, R * 2.5 * fade);
        cg.addColorStop(0, e.color.replace(")", ",0.5)").replace("rgb(", "rgba("));
        cg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(px, py, R * 2.5 * fade, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath(); ctx.arc(px, py, R * fade * 0.6, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── TRAIL ─────────────────────────────────────────────────────────────
      case "trail": {
        const tx = (e.toX ?? e.x) - camX;
        const ty = (e.toY ?? e.y) - camY;
        ctx.globalAlpha = fade;
        ctx.lineCap = "round";
        ctx.shadowColor = e.color; ctx.shadowBlur = 18;
        // Outer soft glow — dashed “speed” readout
        ctx.strokeStyle = e.color; ctx.lineWidth = R * 2.2;
        ctx.globalAlpha = fade * 0.28;
        ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = -frame * 2.2 - lifeT * 18;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        // Core
        ctx.globalAlpha = fade;
        ctx.lineWidth = R;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        if (e.secondary) {
          ctx.strokeStyle = e.secondary;
          ctx.lineWidth = Math.max(1, R * 0.38);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        }
        // Bright centre line
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = Math.max(0.8, R * 0.18);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx, ty); ctx.stroke();
        break;
      }

      // ── TELEPORT FLASH ────────────────────────────────────────────────────
      case "teleportFlash": {
        const warp = 1 + 0.14 * Math.sin(frame * 0.22 + e.seed) * (1 - lifeT);
        const r = R * (0.2 + lifeT * 1.2) * warp;
        ctx.shadowColor = e.color; ctx.shadowBlur = 36;
        // Dark void background
        ctx.globalAlpha = fade * 0.55;
        const voidG = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 1.2);
        voidG.addColorStop(0, "rgba(20,0,40,0.9)");
        voidG.addColorStop(0.6, "rgba(100,0,180,0.4)");
        voidG.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = voidG;
        ctx.beginPath(); ctx.arc(sx, sy, r * 1.2, 0, Math.PI * 2); ctx.fill();
        // Rotating spiral arms
        ctx.globalAlpha = fade;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + frame * 0.15 + e.seed * 0.4;
          const r0 = r * 0.18;
          const r1 = r * (0.75 + (i % 2) * 0.2);
          ctx.strokeStyle = i % 3 === 0 ? "#FFFFFF" : (i % 3 === 1 ? e.color : "rgba(180,80,255,0.9)");
          ctx.lineWidth = i % 2 === 0 ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, r * 0.8, a, a + Math.PI * (0.28 + (i % 3) * 0.08));
          ctx.stroke();
          // Spoke
          ctx.globalAlpha = fade * 0.6;
          ctx.lineWidth = 1;
          ctx.strokeStyle = e.color;
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
          ctx.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1);
          ctx.stroke();
          ctx.globalAlpha = fade;
        }
        // Outer ring pulse
        ctx.strokeStyle = "#FFFFFF"; ctx.lineWidth = 2;
        ctx.globalAlpha = fade * (0.5 + Math.sin(frame * 0.4) * 0.3);
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.stroke();
        // Bright core
        ctx.globalAlpha = fade * (1 - lifeT * 0.7);
        const coreG = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.45);
        coreG.addColorStop(0, "rgba(255,255,255,1)");
        coreG.addColorStop(0.35, "rgba(220,130,255,0.85)");
        coreG.addColorStop(1, "rgba(100,0,200,0)");
        ctx.fillStyle = coreG;
        ctx.beginPath(); ctx.arc(sx, sy, r * 0.45, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── SNOW ZONE ─────────────────────────────────────────────────────────
      case "snowZone": {
        // Ground fill
        ctx.globalAlpha = fade * 0.45;
        const snowFloor = ctx.createRadialGradient(sx, sy, R * 0.25, sx, sy, R);
        snowFloor.addColorStop(0, "rgba(225,245,254,0.65)");
        snowFloor.addColorStop(0.7, "rgba(79,195,247,0.25)");
        snowFloor.addColorStop(1, "rgba(2,136,209,0)");
        ctx.fillStyle = snowFloor;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        // Concentric ice rings
        ctx.shadowColor = "#80D8FF"; ctx.shadowBlur = 14;
        for (let ring = 0; ring < 3; ring++) {
          const rr = R * (0.45 + ring * 0.27);
          ctx.globalAlpha = fade * (0.7 - ring * 0.15);
          ctx.strokeStyle = ring === 0 ? "#B3E5FC" : ring === 1 ? "rgba(129,212,250,0.75)" : "rgba(79,195,247,0.5)";
          ctx.lineWidth = 2.5 - ring * 0.5;
          ctx.setLineDash(ring === 1 ? [8, 5] : []);
          ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        // Snowflakes — now with 6-arm star shape
        ctx.globalAlpha = fade;
        const count = e.particleCount ?? 18;
        for (let i = 0; i < count; i++) {
          const drift = frame * 0.018 + e.seed;
          const orbit = (i / count) * Math.PI * 2;
          const spin = orbit + drift * (1 + (i % 3) * 0.3);
          const radOff = R * (0.12 + ((i * 41 + e.seed) % 100) / 130);
          const px = sx + Math.cos(spin) * radOff;
          const py = sy + Math.sin(spin) * radOff;
          const fs = 1.8 + (i % 3) * 0.7;
          ctx.fillStyle = "#FFFFFF"; ctx.strokeStyle = "#B3E5FC";
          ctx.shadowColor = "#B3E5FC"; ctx.shadowBlur = 8;
          // 6-arm star
          ctx.save(); ctx.translate(px, py);
          ctx.rotate(frame * 0.03 + i);
          ctx.lineWidth = 1;
          for (let arm = 0; arm < 6; arm++) {
            const aa = (arm / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(aa) * fs * 2.2, Math.sin(aa) * fs * 2.2);
            ctx.stroke();
          }
          ctx.beginPath(); ctx.arc(0, 0, fs * 0.65, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        break;
      }

      // ── PETAL ZONE ────────────────────────────────────────────────────────
      case "petalZone": {
        // Soft blossom floor
        ctx.globalAlpha = fade * 0.5;
        const petalFloor = ctx.createRadialGradient(sx, sy, R * 0.2, sx, sy, R);
        petalFloor.addColorStop(0, "rgba(255,138,171,0.65)");
        petalFloor.addColorStop(0.6, "rgba(233,30,140,0.25)");
        petalFloor.addColorStop(1, "rgba(194,24,91,0)");
        ctx.fillStyle = petalFloor;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        // Pulsing boundary ring
        ctx.shadowColor = "#FF80AB"; ctx.shadowBlur = 18;
        ctx.globalAlpha = fade * (0.6 + Math.sin(frame * 0.18) * 0.2);
        ctx.strokeStyle = "#FF80AB"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = fade * 0.4;
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.82, 0, Math.PI * 2); ctx.stroke();
        // Petals — teardrop shape
        ctx.globalAlpha = fade;
        const count = e.particleCount ?? 20;
        for (let i = 0; i < count; i++) {
          const drift = frame * 0.011;
          const orbit = (i / count) * Math.PI * 2 + drift + e.seed;
          const radOff = R * (0.2 + ((i * 53 + e.seed) % 100) / 145);
          const bob = Math.sin(frame * 0.055 + i * 1.3) * 5;
          const px = sx + Math.cos(orbit) * radOff;
          const py = sy + Math.sin(orbit) * radOff + bob;
          const petalAngle = orbit * 1.6 + frame * 0.04;
          ctx.save(); ctx.translate(px, py); ctx.rotate(petalAngle);
          const pc = [
            "rgba(255,128,171,0.95)", "rgba(252,228,236,0.9)",
            "rgba(255,64,129,0.85)", "rgba(255,182,193,0.95)",
          ][i % 4];
          ctx.fillStyle = pc;
          ctx.shadowColor = "#FF80AB"; ctx.shadowBlur = 6;
          const pw = 5 + (i % 3), ph = 3 + (i % 2);
          ctx.beginPath(); ctx.ellipse(0, 0, pw, ph, 0, 0, Math.PI * 2); ctx.fill();
          // Vein
          ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(-pw * 0.7, 0); ctx.lineTo(pw * 0.7, 0); ctx.stroke();
          ctx.restore();
        }
        break;
      }

      // ── POISON ZONE ───────────────────────────────────────────────────────
      case "poisonZone": {
        // Miasma floor
        ctx.globalAlpha = fade * 0.55;
        const fogG = ctx.createRadialGradient(sx, sy, R * 0.1, sx, sy, R);
        fogG.addColorStop(0, "rgba(105,240,174,0.65)");
        fogG.addColorStop(0.55, "rgba(76,175,80,0.35)");
        fogG.addColorStop(1, "rgba(27,94,32,0)");
        ctx.fillStyle = fogG;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        // Swirling fog layers (3 ellipses rotating)
        for (let layer = 0; layer < 3; layer++) {
          const la = frame * (0.012 + layer * 0.005) + e.seed + layer * 1.2;
          const lw = R * (0.6 + layer * 0.22);
          const lh = R * (0.3 + layer * 0.11);
          ctx.globalAlpha = fade * (0.22 - layer * 0.05);
          ctx.save(); ctx.translate(sx, sy); ctx.rotate(la);
          ctx.fillStyle = `rgba(100,240,150,0.4)`;
          ctx.beginPath(); ctx.ellipse(0, 0, lw, lh, 0, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        // Boundary ring
        ctx.globalAlpha = fade * 0.9;
        ctx.shadowColor = "#69F0AE"; ctx.shadowBlur = 16;
        ctx.strokeStyle = "rgba(139,195,74,0.95)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(200,255,200,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.8, 0, Math.PI * 2); ctx.stroke();
        // Rising bubbles
        ctx.globalAlpha = fade;
        const count = e.particleCount ?? 16;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + e.seed;
          const baseRad = R * (0.12 + ((i * 73 + e.seed) % 100) / 115);
          const rise = (frame * 0.04 + i * 0.7) % 1;
          const bx = sx + Math.cos(a) * baseRad;
          const by = sy + Math.sin(a) * baseRad - rise * R * 0.9;
          const bs = 2.5 + (i % 4);
          ctx.globalAlpha = fade * (1 - rise) * 0.85;
          // Bubble body
          const bubG = ctx.createRadialGradient(bx - bs * 0.3, by - bs * 0.3, 0, bx, by, bs);
          bubG.addColorStop(0, "rgba(255,255,255,0.8)");
          bubG.addColorStop(0.5, "rgba(105,240,174,0.65)");
          bubG.addColorStop(1, "rgba(46,125,50,0.2)");
          ctx.fillStyle = bubG;
          ctx.beginPath(); ctx.arc(bx, by, bs, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(200,255,200,0.6)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(bx, by, bs, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }

      // ── LIGHT CAGE ────────────────────────────────────────────────────────
      case "lightCage": {
        ctx.shadowColor = "#FFEB3B"; ctx.shadowBlur = 24;
        // Ground hazard fill
        ctx.globalAlpha = fade * 0.3;
        const cageG = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        cageG.addColorStop(0, "rgba(255,235,59,0.4)");
        cageG.addColorStop(0.6, "rgba(255,193,7,0.15)");
        cageG.addColorStop(1, "rgba(255,111,0,0)");
        ctx.fillStyle = cageG;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.fill();
        // Outer ring
        ctx.globalAlpha = fade * 0.9;
        ctx.strokeStyle = "#FFEB3B"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.9, 0, Math.PI * 2); ctx.stroke();
        // Rotating plasma arcs (6 arcs, alternating colour)
        ctx.globalAlpha = fade;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + frame * (0.1 + (i % 2) * 0.04) + e.seed;
          ctx.strokeStyle = i % 3 === 0 ? "#FFEB3B" : i % 3 === 1 ? "#40C4FF" : "#FFFFFF";
          ctx.lineWidth = 2.5 - (i % 2) * 0.5;
          ctx.beginPath();
          ctx.arc(sx, sy, R * (0.7 + (i % 3) * 0.1), a, a + Math.PI * (0.3 + (i % 2) * 0.1));
          ctx.stroke();
        }
        // Bolt spines from centre to ring
        const phase = Math.floor(frame * 0.12 + e.seed) % 6;
        for (let i = 0; i < 4; i++) {
          const a = ((i / 4) + phase * 0.07) * Math.PI * 2;
          const ex = sx + Math.cos(a) * R;
          const ey = sy + Math.sin(a) * R;
          // Jagged 3-point bolt
          const mid1x = sx + Math.cos(a) * R * 0.35 + (Math.random() - 0.5) * 12;
          const mid1y = sy + Math.sin(a) * R * 0.35 + (Math.random() - 0.5) * 12;
          const mid2x = sx + Math.cos(a) * R * 0.68 + (Math.random() - 0.5) * 10;
          const mid2y = sy + Math.sin(a) * R * 0.68 + (Math.random() - 0.5) * 10;
          ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5;
          ctx.globalAlpha = fade * (0.5 + Math.sin(frame * 0.3 + i) * 0.3);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(mid1x, mid1y);
          ctx.lineTo(mid2x, mid2y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
        }
        break;
      }

      // ── LIGHTNING BOLT ────────────────────────────────────────────────────
      case "lightningBolt": {
        ctx.globalAlpha = fade;
        ctx.shadowColor = e.color; ctx.shadowBlur = 20;
        const pts = e.zigzag ?? [];
        if (pts.length > 1) {
          const jx: number[] = [];
          const jy: number[] = [];
          const amp = 5 * fade;
          for (let i = 0; i < pts.length; i++) {
            if (i === 0 || i === pts.length - 1) {
              jx.push(pts[i].x - camX);
              jy.push(pts[i].y - camY);
            } else {
              const t = frame * 0.55 + e.seed * 0.15 + i * 1.37;
              jx.push(pts[i].x - camX + Math.sin(t) * amp + Math.sin(t * 2.1) * amp * 0.35);
              jy.push(pts[i].y - camY + Math.cos(t * 0.88) * amp * 0.75);
            }
          }
          const strokeBolt = (style: string, lw: number, a: number) => {
            ctx.strokeStyle = style;
            ctx.lineWidth = lw;
            ctx.globalAlpha = a;
            ctx.lineCap = "round"; ctx.lineJoin = "round";
            ctx.beginPath();
            ctx.moveTo(jx[0], jy[0]);
            for (let i = 1; i < jx.length; i++) ctx.lineTo(jx[i], jy[i]);
            ctx.stroke();
          };
          strokeBolt(e.color, 7, fade * 0.35);
          strokeBolt("rgba(255,255,255,0.98)", 3.2 + Math.sin(frame * 0.6) * 0.5, fade);
          strokeBolt(e.color, 1.8, fade * 0.95);
        }
        break;
      }

      // ── METEOR ────────────────────────────────────────────────────────────
      case "meteor": {
        if (!e.exploded) {
          const impactR = e.tickRange ?? 60;
          // Warning ground ring — animated dashes
          ctx.globalAlpha = 0.45 + Math.sin(frame * 0.35) * 0.35;
          ctx.strokeStyle = e.color; ctx.lineWidth = 3;
          ctx.shadowColor = e.color; ctx.shadowBlur = 18;
          ctx.setLineDash([12, 7]); ctx.lineDashOffset = -frame * 1.5;
          ctx.beginPath(); ctx.arc(sx, sy, impactR, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
          // Inner danger fill
          ctx.globalAlpha = (0.12 + Math.sin(frame * 0.35) * 0.08);
          const warnG = ctx.createRadialGradient(sx, sy, 0, sx, sy, impactR);
          warnG.addColorStop(0, "rgba(255,100,0,0.5)");
          warnG.addColorStop(1, "rgba(255,0,0,0)");
          ctx.fillStyle = warnG;
          ctx.beginPath(); ctx.arc(sx, sy, impactR, 0, Math.PI * 2); ctx.fill();
          // Crosshair lines
          ctx.globalAlpha = 0.45 + Math.sin(frame * 0.35) * 0.25;
          ctx.strokeStyle = e.color; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(sx - impactR * 1.2, sy); ctx.lineTo(sx + impactR * 1.2, sy);
          ctx.moveTo(sx, sy - impactR * 1.2); ctx.lineTo(sx, sy + impactR * 1.2);
          ctx.stroke();
          // Falling rock
          const fall = Math.max(0, e.delay ?? 0) / 0.65;
          const fh = e.fallHeight ?? 340;
          const my = sy - fall * fh;
          ctx.globalAlpha = 1;
          ctx.shadowColor = "#FF6D00"; ctx.shadowBlur = 35;
          // Thick fire tail — multiple gradient segments
          for (let seg = 8; seg >= 1; seg--) {
            const t = seg / 8;
            const tailY = my + (sy - my) * (1 - t * 0.8);
            const tailAlpha = (1 - t) * 0.65;
            const tailW = 6 + (1 - t) * 10;
            ctx.globalAlpha = tailAlpha;
            ctx.strokeStyle = t < 0.4 ? "#FFD740" : t < 0.7 ? "#FF6D00" : "rgba(180,0,0,0.5)";
            ctx.lineWidth = tailW; ctx.lineCap = "round";
            const nextY = my + (sy - my) * (1 - (seg - 1) / 8 * 0.8);
            ctx.beginPath(); ctx.moveTo(sx, tailY); ctx.lineTo(sx, nextY); ctx.stroke();
          }
          ctx.globalAlpha = 1;
          // Rock itself — layered circles
          const rockG = ctx.createRadialGradient(sx - 4, my - 5, 0, sx, my, 17);
          rockG.addColorStop(0, "#FFF9C4");
          rockG.addColorStop(0.25, "#FFCA28");
          rockG.addColorStop(0.55, e.color);
          rockG.addColorStop(1, "#7B1FA2");
          ctx.fillStyle = rockG;
          ctx.beginPath(); ctx.arc(sx, my, 17, 0, Math.PI * 2); ctx.fill();
          // Crack lines on rock
          ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - 5, my - 8); ctx.lineTo(sx + 3, my + 6);
          ctx.moveTo(sx + 6, my - 6); ctx.lineTo(sx - 2, my + 7);
          ctx.stroke();
        } else {
          // Impact crater — expanding glow + ground scorch
          ctx.globalAlpha = fade * 0.8;
          ctx.shadowColor = e.color; ctx.shadowBlur = 40;
          const impactR = e.tickRange ?? 60;
          const scorchG = ctx.createRadialGradient(sx, sy, 0, sx, sy, impactR * 1.2);
          scorchG.addColorStop(0, "rgba(255,255,200,0.9)");
          scorchG.addColorStop(0.25, e.color.replace(")", ",0.7)").replace("rgb(", "rgba("));
          scorchG.addColorStop(0.7, "rgba(80,0,0,0.5)");
          scorchG.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = scorchG;
          ctx.beginPath(); ctx.arc(sx, sy, impactR * 1.2, 0, Math.PI * 2); ctx.fill();
          // Shockwave ring
          ctx.strokeStyle = "#FF6D00"; ctx.lineWidth = 4 * fade;
          ctx.beginPath(); ctx.arc(sx, sy, impactR * (1.4 + lifeT * 0.5), 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }

      // ── BERSERK AURA ──────────────────────────────────────────────────────
      case "berserkAura": {
        ctx.shadowColor = "#FF3D00"; ctx.shadowBlur = 28;
        // Ground scorch ellipse
        ctx.globalAlpha = 0.55;
        const groundG = ctx.createRadialGradient(sx, sy + 16, 0, sx, sy + 16, R * 1.3);
        groundG.addColorStop(0, "rgba(255,87,34,0.6)");
        groundG.addColorStop(0.6, "rgba(255,30,0,0.2)");
        groundG.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = groundG;
        ctx.save(); ctx.translate(sx, sy + 16);
        ctx.scale(1, 0.38);
        ctx.beginPath(); ctx.arc(0, 0, R * 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Ground ring
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = "rgba(255,87,34,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 18, R * 1.1, R * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
        // Flame particles (12 of them)
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + frame * 0.2;
          const rr = R * (0.75 + Math.sin(frame * 0.3 + i * 1.1) * 0.22);
          const fx = sx + Math.cos(a) * rr;
          const fy = sy + 8 + Math.sin(a) * rr * 0.42;
          const fh = 10 + (i % 4) * 3;
          ctx.globalAlpha = 0.9;
          // Flame teardrop
          ctx.save(); ctx.translate(fx, fy);
          ctx.rotate(a + Math.PI * 1.5);
          const flameG = ctx.createLinearGradient(0, 0, 0, -fh);
          flameG.addColorStop(0, i % 2 === 0 ? "#FF3D00" : "#FF6D00");
          flameG.addColorStop(0.5, "#FF9800");
          flameG.addColorStop(1, "rgba(255,235,59,0.5)");
          ctx.fillStyle = flameG;
          ctx.shadowColor = "#FF6D00"; ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(fh * 0.4, -fh * 0.5, 0, -fh);
          ctx.quadraticCurveTo(-fh * 0.4, -fh * 0.5, 0, 0);
          ctx.fill(); ctx.restore();
        }
        // Inner bright ring
        ctx.globalAlpha = 0.6 + Math.sin(frame * 0.35) * 0.2;
        ctx.strokeStyle = "#FFCA28"; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(sx, sy + 14, R * 0.65, R * 0.27, 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      // ── SHIELD DOME ───────────────────────────────────────────────────────
      case "shieldDome": {
        const cy = sy - 8;
        ctx.shadowColor = "#FFD700"; ctx.shadowBlur = 28;
        // Dome interior fill
        ctx.globalAlpha = 0.7;
        const domeG = ctx.createRadialGradient(sx, cy - R * 0.3, R * 0.05, sx, cy, R);
        domeG.addColorStop(0, "rgba(255,245,100,0.08)");
        domeG.addColorStop(0.65, "rgba(255,215,0,0.18)");
        domeG.addColorStop(0.88, "rgba(255,215,0,0.4)");
        domeG.addColorStop(1, "rgba(255,180,0,0.65)");
        ctx.fillStyle = domeG;
        ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.fill();
        // Outer rim
        ctx.strokeStyle = "#FFD700"; ctx.lineWidth = 3;
        ctx.globalAlpha = 0.9 + Math.sin(frame * 0.2) * 0.05;
        ctx.beginPath(); ctx.arc(sx, cy, R, 0, Math.PI * 2); ctx.stroke();
        // Hex facet arcs — 6 arcs rotating at different rates
        ctx.globalAlpha = 0.8;
        for (let i = 0; i < 6; i++) {
          const a = frame * (0.06 + (i % 2) * 0.02) + (i / 6) * Math.PI * 2 + e.seed * 0.5;
          const arcR = R * (0.55 + (i % 3) * 0.15);
          ctx.strokeStyle = i % 3 === 0 ? "rgba(255,215,0,0.85)" : i % 3 === 1 ? "rgba(255,255,150,0.65)" : "rgba(255,165,0,0.5)";
          ctx.lineWidth = 1.8 - (i % 3) * 0.4;
          ctx.beginPath(); ctx.arc(sx, cy, arcR, a, a + Math.PI * (0.35 + (i % 2) * 0.15)); ctx.stroke();
        }
        // Specular top highlight
        ctx.globalAlpha = 0.35 - lifeT * 0.15;
        const topSpec = ctx.createRadialGradient(sx - R * 0.22, cy - R * 0.38, 0, sx, cy, R * 0.55);
        topSpec.addColorStop(0, "rgba(255,255,255,0.7)");
        topSpec.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = topSpec;
        ctx.beginPath(); ctx.arc(sx, cy, R * 0.55, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── TURRET ────────────────────────────────────────────────────────────
      case "turret": {
        const lifeFrac = Math.max(0, e.timer / e.maxTimer);
        ctx.shadowColor = "#FFEB3B"; ctx.shadowBlur = 14;
        // Shadow
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath(); ctx.ellipse(sx, sy + R * 0.62, R * 0.72, R * 0.28, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        // Platform / base plate
        ctx.fillStyle = "#3E2723"; ctx.strokeStyle = "#5D4037"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.62, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        // Armour ring
        ctx.strokeStyle = "#BF8A30"; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.55, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = "#FFD54F"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.46, 0, Math.PI * 2); ctx.stroke();
        // Rotating cannon body
        const ang = frame * 0.06;
        ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
        // Cannon barrel
        const barrelG = ctx.createLinearGradient(-4, 0, 4, 0);
        barrelG.addColorStop(0, "#546E7A");
        barrelG.addColorStop(0.5, "#B0BEC5");
        barrelG.addColorStop(1, "#546E7A");
        ctx.fillStyle = barrelG;
        ctx.fillRect(-4, -R * 0.9, 8, R * 0.9);
        // Muzzle ring
        ctx.fillStyle = "#FFEB3B";
        ctx.shadowColor = "#FFEB3B"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(0, -R * 0.9, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#FF6F00";
        ctx.beginPath(); ctx.arc(0, -R * 0.9, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // Centre hub
        const hubG = ctx.createRadialGradient(sx - 2, sy - 2, 0, sx, sy, R * 0.22);
        hubG.addColorStop(0, "#FFECB3");
        hubG.addColorStop(0.5, "#CD9B39");
        hubG.addColorStop(1, "#3E2723");
        ctx.fillStyle = hubG;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.22, 0, Math.PI * 2); ctx.fill();
        // Range hint ring
        ctx.globalAlpha = 0.14 + Math.sin(frame * 0.09) * 0.04;
        ctx.strokeStyle = "#FFEB3B"; ctx.lineWidth = 1;
        ctx.setLineDash([5, 7]);
        ctx.beginPath(); ctx.arc(sx, sy, e.tickRange ?? 250, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        // Lifetime sweep arc (countdown)
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "#FFEB3B"; ctx.lineWidth = 3.5;
        ctx.shadowColor = "#FFEB3B"; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(sx, sy, R * 0.74, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * lifeFrac); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
}
