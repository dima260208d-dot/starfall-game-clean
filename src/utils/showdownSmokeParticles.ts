/**
 * Showdown gas smoke — generated entirely in-code. No external textures.
 *
 * On first use we bake a small set of "smoke puff" sprites onto offscreen
 * canvases: radial gradient + speckle noise + irregular mask. Many short-lived
 * particles spawn each frame across the gas region; each rotates and fades
 * (sin curve), then gets recycled. The cloud is dense and gap-free.
 */

export interface ShowdownSmokeArea {
  cx: number;
  cy: number;
  halfX: number;
  halfY: number;
  viewW: number;
  viewH: number;
}

interface SmokeParticle {
  x: number;
  y: number;
  size: number;
  life: number;
  lifetime: number;
  rot: number;
  rotSpeed: number;
  alphaPeak: number;
  spriteIdx: number;
  tint: 0 | 1 | 2;
}

const PARTICLE_TARGET_DENSITY = 1 / (22 * 22);
const PARTICLE_LIFETIME_MIN = 0.55;
const PARTICLE_LIFETIME_MAX = 1.15;
const SIZE_MIN = 70;
const SIZE_MAX = 160;
const MAX_PARTICLES = 2000;
const MAX_SPAWN_PER_FRAME = 220;

const SPRITE_COUNT = 4;
const SPRITE_SIZE = 256;

const sprites: HTMLCanvasElement[] = [];
let spritesReady = false;

// Tints — light/mid/dark smoke. Particles pick one at spawn.
const TINTS: [number, number, number][] = [
  [230, 230, 235],
  [170, 165, 180],
  [90, 85, 100],
];

function makeSprite(seed: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext("2d")!;
  const cx = SPRITE_SIZE / 2;
  const cy = SPRITE_SIZE / 2;

  // 1. Radial alpha falloff — soft cloud edge.
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, SPRITE_SIZE * 0.5);
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.35)");
  grad.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);

  // 2. Punch out random "blobs" near the edge to make the silhouette irregular.
  const rnd = mulberry32(seed * 9301 + 49297);
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 22; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = SPRITE_SIZE * (0.30 + rnd() * 0.22);
    const blobR = SPRITE_SIZE * (0.05 + rnd() * 0.10);
    const bx = cx + Math.cos(ang) * r;
    const by = cy + Math.sin(ang) * r;
    const g2 = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
    g2.addColorStop(0, "rgba(0,0,0,1)");
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(bx - blobR, by - blobR, blobR * 2, blobR * 2);
  }

  // 3. Internal "billow" highlights so the puff has volume detail.
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 14; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = SPRITE_SIZE * (0.05 + rnd() * 0.25);
    const billowR = SPRITE_SIZE * (0.06 + rnd() * 0.09);
    const bx = cx + Math.cos(ang) * r;
    const by = cy + Math.sin(ang) * r;
    const g3 = ctx.createRadialGradient(bx, by, 0, bx, by, billowR);
    const a = 0.10 + rnd() * 0.15;
    g3.addColorStop(0, `rgba(255,255,255,${a})`);
    g3.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g3;
    ctx.fillRect(bx - billowR, by - billowR, billowR * 2, billowR * 2);
  }

  // 4. Fine speckle noise to read as smoke not a flat blob.
  ctx.globalCompositeOperation = "source-atop";
  const img = ctx.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const n = (rnd() - 0.5) * 38;
    data[i]     = clamp255(data[i]     + n);
    data[i + 1] = clamp255(data[i + 1] + n);
    data[i + 2] = clamp255(data[i + 2] + n);
  }
  ctx.putImageData(img, 0, 0);

  ctx.globalCompositeOperation = "source-over";
  return c;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Simple seeded RNG so sprites are stable but vary between indices.
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureSprites(): void {
  if (spritesReady) return;
  if (typeof document === "undefined") return;
  for (let i = 0; i < SPRITE_COUNT; i++) sprites.push(makeSprite(i + 1));
  spritesReady = true;
}

// Per-tint cache of recolored sprites (sprite × tint) so we draw without filters.
const tintedCache = new Map<string, HTMLCanvasElement>();

function getTintedSprite(spriteIdx: number, tintIdx: number): HTMLCanvasElement | null {
  if (!spritesReady) return null;
  const key = `${spriteIdx}-${tintIdx}`;
  let c = tintedCache.get(key);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = SPRITE_SIZE;
  c.height = SPRITE_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(sprites[spriteIdx], 0, 0);
  ctx.globalCompositeOperation = "source-in";
  const [r, g, b] = TINTS[tintIdx];
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  // Reapply original luminance via multiply so the speckle texture survives.
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(sprites[spriteIdx], 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(sprites[spriteIdx], 0, 0);
  ctx.globalCompositeOperation = "source-over";
  tintedCache.set(key, c);
  return c;
}

const particles: SmokeParticle[] = [];
let lastFrameMs = 0;

function isInGas(x: number, y: number, area: ShowdownSmokeArea): boolean {
  return Math.abs(x - area.cx) > area.halfX || Math.abs(y - area.cy) > area.halfY;
}

function spawnInGas(area: ShowdownSmokeArea): SmokeParticle | null {
  const left   = -100;
  const right  = area.viewW + 100;
  const top    = -100;
  const bottom = area.viewH + 100;
  const sx  = area.cx - area.halfX;
  const sxR = area.cx + area.halfX;
  const sy  = area.cy - area.halfY;
  const syB = area.cy + area.halfY;

  const strips = [
    { x0: left, x1: right, y0: top, y1: Math.max(top, sy) },
    { x0: left, x1: right, y0: Math.min(bottom, syB), y1: bottom },
    { x0: left, x1: Math.max(left, sx), y0: Math.max(top, sy), y1: Math.min(bottom, syB) },
    { x0: Math.min(right, sxR), x1: right, y0: Math.max(top, sy), y1: Math.min(bottom, syB) },
  ].filter(s => s.x1 > s.x0 && s.y1 > s.y0);

  if (strips.length === 0) return null;

  let total = 0;
  for (const s of strips) total += (s.x1 - s.x0) * (s.y1 - s.y0);
  let r = Math.random() * total;
  let chosen = strips[0];
  for (const s of strips) {
    const a = (s.x1 - s.x0) * (s.y1 - s.y0);
    if (r < a) { chosen = s; break; }
    r -= a;
  }

  const x = chosen.x0 + Math.random() * (chosen.x1 - chosen.x0);
  const y = chosen.y0 + Math.random() * (chosen.y1 - chosen.y0);
  if (!isInGas(x, y, area)) return null;

  const lifetime = PARTICLE_LIFETIME_MIN + Math.random() * (PARTICLE_LIFETIME_MAX - PARTICLE_LIFETIME_MIN);
  const tintRoll = Math.random();
  const tint: 0 | 1 | 2 = tintRoll < 0.45 ? 0 : tintRoll < 0.85 ? 1 : 2;
  return {
    x,
    y,
    size: SIZE_MIN + Math.random() * (SIZE_MAX - SIZE_MIN),
    life: Math.random() * lifetime,
    lifetime,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.6,
    alphaPeak: 0.78 + Math.random() * 0.2,
    spriteIdx: (Math.random() * SPRITE_COUNT) | 0,
    tint,
  };
}

export function drawShowdownSmokeParticles(
  ctx: CanvasRenderingContext2D,
  area: ShowdownSmokeArea,
): void {
  ensureSprites();

  const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
  const dt = lastFrameMs === 0 ? 0.016 : Math.min(0.1, (now - lastFrameMs) / 1000);
  lastFrameMs = now;

  const totalArea = area.viewW * area.viewH;
  const safeArea = Math.max(0, area.halfX * 2 * area.halfY * 2);
  const gasArea = Math.max(0, totalArea - safeArea);
  const target = Math.max(0, Math.min(MAX_PARTICLES, Math.floor(gasArea * PARTICLE_TARGET_DENSITY)));

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    p.rot += p.rotSpeed * dt;
    if (p.life > p.lifetime || !isInGas(p.x, p.y, area)) {
      particles.splice(i, 1);
    }
  }

  const need = target - particles.length;
  const maxSpawn = Math.max(0, Math.min(MAX_SPAWN_PER_FRAME, need));
  for (let i = 0; i < maxSpawn; i++) {
    const p = spawnInGas(area);
    if (p) particles.push(p);
  }

  ctx.save();
  for (const p of particles) {
    const k = p.life / p.lifetime;
    const fade = Math.sin(Math.min(1, Math.max(0, k)) * Math.PI);
    const a = fade * p.alphaPeak;
    if (a < 0.01) continue;
    const tinted = getTintedSprite(p.spriteIdx, p.tint);
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    const s = p.size;
    if (tinted) {
      ctx.drawImage(tinted, -s * 0.5, -s * 0.5, s, s);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function resetShowdownSmokeParticles(): void {
  particles.length = 0;
  lastFrameMs = 0;
}