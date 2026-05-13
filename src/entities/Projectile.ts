import { GameMap, collidesWithWalls } from "../game/MapRenderer";
import { WORLD_VFX_CANVAS_SCALE } from "../game/battleVisualScale";

export interface Projectile {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  speed: number;
  range: number;
  distanceTraveled: number;
  ownerId: string;
  ownerTeam: string;
  color: string;
  type: "bullet" | "shuriken" | "snowball" | "fireball" | "dagger" | "chain" | "beam";
  active: boolean;
  piercing: boolean;
  hitIds: Set<string>;
  poison?: boolean;
  slow?: boolean;
  stunDuration?: number;       // stun effect on hit (seconds)
  homing?: boolean;            // soft-lock on nearest enemy
  temporalRewind?: number;     // seconds to rewind target position
  explosionRadius?: number;
}

let projIdCounter = 0;

export function createProjectile(params: Omit<Projectile, "id" | "active" | "hitIds" | "distanceTraveled">): Projectile {
  return {
    ...params,
    id: `proj_${projIdCounter++}`,
    active: true,
    hitIds: new Set(),
    distanceTraveled: 0,
  };
}

export interface HomingTarget {
  id: string;
  x: number;
  y: number;
  team: string;
}

export function updateProjectiles(
  projectiles: Projectile[],
  dt: number,
  map: GameMap,
  homingTargets?: HomingTarget[]
): void {
  for (const proj of projectiles) {
    if (!proj.active) continue;

    // Homing steering (Zafkiel Yud charge)
    if (proj.homing && homingTargets && homingTargets.length > 0) {
      let nearest: HomingTarget | null = null;
      let nearestDist = Infinity;
      for (const t of homingTargets) {
        if (t.team === proj.ownerTeam || t.id === proj.ownerId) continue;
        const dx = t.x - proj.x;
        const dy = t.y - proj.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < nearestDist) { nearestDist = d; nearest = t; }
      }
      if (nearest && nearestDist < proj.range * 0.9) {
        const targetAngle = Math.atan2(nearest.y - proj.y, nearest.x - proj.x);
        const currentAngle = Math.atan2(proj.vy, proj.vx);
        // Max turn: 15° per 0.1 sec
        const maxTurn = (15 * Math.PI / 180) * (dt / 0.1);
        let diff = targetAngle - currentAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
        const newAngle = currentAngle + turn;
        const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
        proj.vx = Math.cos(newAngle) * speed;
        proj.vy = Math.sin(newAngle) * speed;
      }
    }

    const prevX = proj.x;
    const prevY = proj.y;
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    const dx = proj.x - prevX;
    const dy = proj.y - prevY;
    proj.distanceTraveled += Math.sqrt(dx * dx + dy * dy);

    if (proj.distanceTraveled >= proj.range) {
      proj.active = false;
      continue;
    }

    if (proj.x < 0 || proj.x > map.width || proj.y < 0 || proj.y > map.height) {
      proj.active = false;
      continue;
    }

    const col = collidesWithWalls(proj.x, proj.y, Math.max(proj.radius, 4), map.walls);
    if (col.collides) {
      proj.active = false;
      continue;
    }
  }
}

export function renderProjectiles(
  ctx: CanvasRenderingContext2D,
  projectiles: Projectile[],
  camX: number,
  camY: number,
  frame: number
): void {
  for (const proj of projectiles) {
    if (!proj.active) continue;

    const pr = proj.radius * WORLD_VFX_CANVAS_SCALE;
    const sx = proj.x - camX;
    const sy = proj.y - camY;
    const angle = Math.atan2(proj.vy, proj.vx);
    const speed = Math.hypot(proj.vx, proj.vy);

    ctx.save();

    // ── Long motion trail (every projectile type) ─────────────────────────
    if (speed > 1) {
      const trailLen = Math.min(56, speed * 0.11) * WORLD_VFX_CANVAS_SCALE;
      const segments = 5;
      for (let s = segments; s >= 1; s--) {
        const t = s / segments;
        const tx = sx - Math.cos(angle) * trailLen * t;
        const ty = sy - Math.sin(angle) * trailLen * t;
        const alpha = (1 - t) * 0.55;
        const w = Math.max(1.5, pr * (1 - t * 0.6));
        ctx.strokeStyle = proj.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        const t2 = (s - 1) / segments;
        const tx2 = sx - Math.cos(angle) * trailLen * t2;
        const ty2 = sy - Math.sin(angle) * trailLen * t2;
        ctx.moveTo(tx2, ty2); ctx.lineTo(tx, ty); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    switch (proj.type) {
      // ── SHURIKEN ────────────────────────────────────────────────────────
      case "shuriken": {
        ctx.translate(sx, sy);
        ctx.rotate(frame * 0.35);
        // Outer glow
        ctx.shadowColor = proj.color; ctx.shadowBlur = 22;
        // 4-blade star
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 2);
          const bladeGrad = ctx.createLinearGradient(0, -pr * 1.8, 0, pr * 1.8);
          bladeGrad.addColorStop(0, "#FFFFFF");
          bladeGrad.addColorStop(0.3, proj.color);
          bladeGrad.addColorStop(1, "rgba(80,80,120,0.5)");
          ctx.fillStyle = bladeGrad;
          ctx.beginPath();
          ctx.moveTo(0, -pr * 1.8);
          ctx.quadraticCurveTo(pr * 0.7, -pr * 0.3, pr * 0.55, 0);
          ctx.quadraticCurveTo(pr * 0.7, pr * 0.3, 0, pr * 1.8);
          ctx.quadraticCurveTo(-pr * 0.7, pr * 0.3, -pr * 0.55, 0);
          ctx.quadraticCurveTo(-pr * 0.7, -pr * 0.3, 0, -pr * 1.8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        // Centre gem
        const cGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 0.45);
        cGrad.addColorStop(0, "#FFFFFF");
        cGrad.addColorStop(1, proj.color);
        ctx.fillStyle = cGrad;
        ctx.beginPath(); ctx.arc(0, 0, pr * 0.45, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── SNOWBALL ─────────────────────────────────────────────────────────
      case "snowball": {
        ctx.shadowColor = "#80D8FF"; ctx.shadowBlur = 20;
        // Outer glow shell
        const glow = ctx.createRadialGradient(sx, sy, pr * 0.5, sx, sy, pr * 2.2);
        glow.addColorStop(0, "rgba(179,229,252,0.35)");
        glow.addColorStop(1, "rgba(2,136,209,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sx, sy, pr * 2.2, 0, Math.PI * 2); ctx.fill();
        // Main ball gradient
        const ballGrad = ctx.createRadialGradient(sx - pr * 0.32, sy - pr * 0.32, pr * 0.05, sx, sy, pr);
        ballGrad.addColorStop(0, "#FFFFFF");
        ballGrad.addColorStop(0.35, "#B3E5FC");
        ballGrad.addColorStop(1, "#0288D1");
        ctx.fillStyle = ballGrad;
        ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2); ctx.fill();
        // Sparkle crystal accents
        ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + frame * 0.04;
          const rx = sx + Math.cos(a) * pr * 0.55;
          const ry = sy + Math.sin(a) * pr * 0.55;
          ctx.beginPath();
          ctx.moveTo(rx - 2, ry); ctx.lineTo(rx + 2, ry);
          ctx.moveTo(rx, ry - 2); ctx.lineTo(rx, ry + 2);
          ctx.stroke();
        }
        // Specular highlight
        const spec = ctx.createRadialGradient(sx - pr * 0.38, sy - pr * 0.38, 0, sx - pr * 0.38, sy - pr * 0.38, pr * 0.42);
        spec.addColorStop(0, "rgba(255,255,255,0.85)");
        spec.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = spec;
        ctx.beginPath(); ctx.arc(sx - pr * 0.38, sy - pr * 0.38, pr * 0.42, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── FIREBALL ─────────────────────────────────────────────────────────
      case "fireball": {
        ctx.shadowColor = "#FF6D00"; ctx.shadowBlur = 30;
        // Outer haze
        const haze = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 3.2);
        haze.addColorStop(0, "rgba(255,87,34,0.28)");
        haze.addColorStop(1, "rgba(255,0,0,0)");
        ctx.fillStyle = haze;
        ctx.beginPath(); ctx.arc(sx, sy, pr * 3.2, 0, Math.PI * 2); ctx.fill();
        // Flame body — 3 overlapping radial gradients offset slightly for flicker
        const offsets = [
          { ox: Math.cos(frame * 0.22) * 3, oy: Math.sin(frame * 0.33) * 3, sc: 1.7 },
          { ox: Math.cos(frame * 0.31 + 2) * 2, oy: Math.sin(frame * 0.25 + 1) * 2, sc: 1.3 },
          { ox: 0, oy: 0, sc: 1.0 },
        ];
        for (const o of offsets) {
          const fg = ctx.createRadialGradient(sx + o.ox, sy + o.oy, 0, sx + o.ox, sy + o.oy, pr * o.sc);
          fg.addColorStop(0, "#FFFFFF");
          fg.addColorStop(0.18, "#FFF176");
          fg.addColorStop(0.45, "#FF6D00");
          fg.addColorStop(1, "rgba(183,28,28,0)");
          ctx.fillStyle = fg;
          ctx.beginPath(); ctx.arc(sx + o.ox, sy + o.oy, pr * o.sc, 0, Math.PI * 2); ctx.fill();
        }
        // Ember sparks orbiting
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + frame * 0.14;
          const er = pr * (0.8 + Math.sin(frame * 0.3 + i) * 0.25);
          const ex = sx + Math.cos(a) * er;
          const ey = sy + Math.sin(a) * er;
          ctx.fillStyle = i % 2 === 0 ? "#FFD740" : "#FF6D00";
          ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }

      // ── DAGGER ───────────────────────────────────────────────────────────
      case "dagger": {
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.shadowColor = proj.color; ctx.shadowBlur = 18;
        const dLen = pr * 2.8;
        // Shadow/depth layer
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.moveTo(dLen, 2);
        ctx.lineTo(-pr * 0.8, -pr * 0.55 + 2);
        ctx.lineTo(-pr * 0.8, pr * 0.55 + 2);
        ctx.closePath(); ctx.fill();
        // Blade gradient
        const bladeGrad = ctx.createLinearGradient(-pr, 0, dLen, 0);
        bladeGrad.addColorStop(0, "#90CAF9");
        bladeGrad.addColorStop(0.4, "#E3F2FD");
        bladeGrad.addColorStop(0.7, proj.color);
        bladeGrad.addColorStop(1, "#FFFFFF");
        ctx.fillStyle = bladeGrad;
        ctx.beginPath();
        ctx.moveTo(dLen, 0);
        ctx.lineTo(-pr * 0.8, -pr * 0.52);
        ctx.lineTo(-pr * 0.8, pr * 0.52);
        ctx.closePath(); ctx.fill();
        // Edge highlight
        ctx.strokeStyle = "rgba(255,255,255,0.75)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(dLen, 0);
        ctx.lineTo(-pr * 0.8, -pr * 0.52);
        ctx.stroke();
        // Guard
        ctx.fillStyle = "#78909C";
        ctx.fillRect(-pr * 0.9, -pr * 0.7, pr * 0.28, pr * 1.4);
        ctx.fillStyle = "#B0BEC5";
        ctx.fillRect(-pr * 0.88, -pr * 0.68, pr * 0.12, pr * 0.55);
        break;
      }

      // ── BEAM ─────────────────────────────────────────────────────────────
      case "beam": {
        const bLen = proj.range * 0.9;
        const ex = sx + Math.cos(angle) * bLen;
        const ey = sy + Math.sin(angle) * bLen;
        // Outer wide soft glow
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = pr * 2.8;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.18;
        ctx.shadowColor = proj.color; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Mid beam
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = pr * 1.4;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Core
        ctx.globalAlpha = 1;
        ctx.lineWidth = pr * 0.55;
        ctx.strokeStyle = "#FFFFFF";
        ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Edge detail line
        ctx.strokeStyle = proj.color;
        ctx.lineWidth = pr * 0.22;
        ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        // Muzzle flash at origin
        const mFlash = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 2.5);
        mFlash.addColorStop(0, "rgba(255,255,255,0.9)");
        mFlash.addColorStop(0.5, proj.color.replace(")", ",0.6)").replace("rgb", "rgba"));
        mFlash.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = mFlash;
        ctx.beginPath(); ctx.arc(sx, sy, pr * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }

      // ── CHAIN ────────────────────────────────────────────────────────────
      case "chain": {
        ctx.shadowColor = proj.color; ctx.shadowBlur = 22;
        // Outer lightning aura
        const chainGlow = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 2.5);
        chainGlow.addColorStop(0, "rgba(255,235,59,0.5)");
        chainGlow.addColorStop(1, "rgba(255,193,7,0)");
        ctx.fillStyle = chainGlow;
        ctx.beginPath(); ctx.arc(sx, sy, pr * 2.5, 0, Math.PI * 2); ctx.fill();
        // Rotating hex / clock arcs
        ctx.translate(sx, sy);
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2 + frame * 0.2;
          ctx.strokeStyle = i % 2 === 0 ? proj.color : "#FFFFFF";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, pr * (0.85 + i * 0.2), a, a + Math.PI * 0.4);
          ctx.stroke();
        }
        // Core
        const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, pr * 0.6);
        coreG.addColorStop(0, "#FFFFFF");
        coreG.addColorStop(1, proj.color);
        ctx.fillStyle = coreG;
        ctx.beginPath(); ctx.arc(0, 0, pr * 0.6, 0, Math.PI * 2); ctx.fill();
        break;
      }

      // ── BULLET (default) ──────────────────────────────────────────────────
      default: {
        ctx.shadowColor = proj.color; ctx.shadowBlur = 22;
        // Outer glow corona
        const corona = ctx.createRadialGradient(sx, sy, 0, sx, sy, pr * 2.8);
        corona.addColorStop(0, proj.color.replace(")", ",0.4)").replace("rgb", "rgba"));
        corona.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = corona;
        ctx.beginPath(); ctx.arc(sx, sy, pr * 2.8, 0, Math.PI * 2); ctx.fill();
        // Main bullet body (slightly stretched along velocity for cleaner look)
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        const bGrad = ctx.createRadialGradient(-pr * 0.35, -pr * 0.28, 0, 0, 0, pr * 1.2);
        bGrad.addColorStop(0, "#FFFFFF");
        bGrad.addColorStop(0.4, proj.color);
        bGrad.addColorStop(1, "rgba(0,0,0,0.3)");
        ctx.fillStyle = bGrad;
        ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.25, pr * 0.92, 0, 0, Math.PI * 2); ctx.fill();
        // Rim
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.ellipse(0, 0, pr * 1.05, pr * 0.76, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // ── Homing targeting ring ──────────────────────────────────────────────
    if (proj.homing) {
      ctx.globalAlpha = 0.7 + Math.sin(frame * 0.25) * 0.2;
      ctx.strokeStyle = "#FFA726";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#FFA726"; ctx.shadowBlur = 12;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(sx, sy, pr * 2.0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }
}
