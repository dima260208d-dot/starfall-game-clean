// ─── Pet Renderer ───────────────────────────────────────────────────────────
// Hand-drawn, cartoon-style canvas renderer for the in-battle pet companion.
// Each pet `kind` has its own dedicated draw function with independently
// animated limbs, ears, tail, wings and eyes. Walking, idle, joy and
// frustration moods are blended in at runtime.
//
// All draw functions assume the caller has translated the canvas so (0,0)
// is the pet's centre point. The pet is roughly 36 px tall and 38 px wide.

import type { PetDef } from "./PetData";

export interface PetRenderOpts {
  walkPhase: number;     // monotonic phase counter for walk cycle (radians-ish)
  moveStrength: number;  // 0 = perfectly still, 1 = running
  t: number;             // global time in seconds (for blink, idle wiggle)
  joy: boolean;          // brief celebratory pop after a heal pulse
  sad: boolean;          // owner is on low HP — droopy ears, eyes look down
  facing: number;        // angle toward the owner (radians)
}

const STROKE = "rgba(0,0,0,0.55)";

function setupStroke(ctx: CanvasRenderingContext2D, w = 1.4): void {
  ctx.strokeStyle = STROKE;
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
}

/** Returns 0..1 — value squashes briefly to ~0.05 every ~3 seconds for a blink. */
function blink(t: number, offset = 0): number {
  const phase = (t + offset) % 3.2;
  if (phase > 3.0) return Math.max(0.05, 1 - (3.2 - phase) * 8);
  return 1;
}

/** Draw twin eyes with optional look offset and lid squash. */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  spacing: number, r: number,
  eyeColor: string,
  blinkAmt = 1,
  lookX = 0, lookY = 0,
): void {
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(cx - spacing, cy, r, r * blinkAmt, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + spacing, cy, r, r * blinkAmt, 0, 0, Math.PI * 2);
  ctx.fill();
  setupStroke(ctx, 0.9);
  ctx.stroke();

  ctx.fillStyle = eyeColor;
  const pr = r * 0.55;
  ctx.beginPath();
  ctx.ellipse(cx - spacing + lookX, cy + lookY, pr, pr * Math.max(0.2, blinkAmt), 0, 0, Math.PI * 2);
  ctx.ellipse(cx + spacing + lookX, cy + lookY, pr, pr * Math.max(0.2, blinkAmt), 0, 0, Math.PI * 2);
  ctx.fill();

  // Tiny white shine
  if (blinkAmt > 0.5) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(cx - spacing + lookX + pr * 0.3, cy + lookY - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
    ctx.arc(cx + spacing + lookX + pr * 0.3, cy + lookY - pr * 0.3, pr * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ─── Per-kind drawers ──────────────────────────────────────────────────────

function drawCat(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // Walk cycle — independent diagonal pairs
  const fl = Math.sin(o.walkPhase) * 3 * o.moveStrength;
  const fr = Math.sin(o.walkPhase + Math.PI) * 3 * o.moveStrength;
  // Tail swishes constantly even when idle
  const tailWag = Math.sin(o.t * 4 + o.walkPhase * 0.4) * (0.4 + 0.5 * o.moveStrength);
  // Ear twitch — random little jolt every couple seconds
  const earTwitch = Math.sin(o.t * 1.3) > 0.92 ? Math.sin(o.t * 12) * 0.25 : 0;

  // Tail (drawn first, behind body)
  ctx.save();
  ctx.translate(-12, 2);
  ctx.rotate(-0.4 + tailWag);
  setupStroke(ctx, 3);
  ctx.strokeStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-8, -4, -12, -10);
  ctx.stroke();
  // Tail tip accent
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-12, -10, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Back legs
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-7, 11 + fl, 3, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(7,  11 + fr, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Belly
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, 7, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Front legs
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-5, 12 + fr, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(5,  12 + fl, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -7, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Ears (independent twitches; droop when sad)
  const droop = o.sad ? 0.6 : 0;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.save(); ctx.translate(-6, -13); ctx.rotate(-0.3 - earTwitch + droop);
  ctx.moveTo(0, 0); ctx.lineTo(2, -7); ctx.lineTo(5, -1); ctx.closePath();
  ctx.restore();
  ctx.save(); ctx.translate(6, -13); ctx.rotate(0.3 + earTwitch - droop);
  ctx.moveTo(0, 0); ctx.lineTo(-2, -7); ctx.lineTo(-5, -1); ctx.closePath();
  ctx.restore();
  ctx.fill(); ctx.stroke();

  // Inner ears
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.save(); ctx.translate(-6, -13); ctx.rotate(-0.3 - earTwitch + droop);
  ctx.moveTo(1, -1); ctx.lineTo(2.5, -5); ctx.lineTo(4, -1.5); ctx.closePath();
  ctx.restore();
  ctx.save(); ctx.translate(6, -13); ctx.rotate(0.3 + earTwitch - droop);
  ctx.moveTo(-1, -1); ctx.lineTo(-2.5, -5); ctx.lineTo(-4, -1.5); ctx.closePath();
  ctx.restore();
  ctx.fill();

  // Eyes
  drawEyes(ctx, 0, -7, 3, 2.2, eye, blink(o.t), o.sad ? 0 : 0.3, o.sad ? 0.6 : 0);

  // Nose + mouth
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(1, -2); ctx.lineTo(0, -0.8); ctx.closePath(); ctx.fill();
  setupStroke(ctx, 0.8);
  ctx.beginPath();
  ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(-2, 0.5, -3, -0.3);
  ctx.moveTo(0, -0.8); ctx.quadraticCurveTo(2, 0.5, 3, -0.3);
  ctx.stroke();

  // Whiskers
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 0.6;
  for (const sx of [-1, 1]) {
    for (const yo of [-1.5, 0, 1.5]) {
      ctx.beginPath();
      ctx.moveTo(sx * 4, -2 + yo * 0.4);
      ctx.lineTo(sx * 11, -2 + yo);
      ctx.stroke();
    }
  }
}

function drawFox(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  // Fox = cat-shaped but with bigger fluffy tail + pointier muzzle
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  const fl = Math.sin(o.walkPhase) * 3 * o.moveStrength;
  const fr = Math.sin(o.walkPhase + Math.PI) * 3 * o.moveStrength;
  const tailWag = Math.sin(o.t * 3.5 + o.walkPhase * 0.3) * (0.3 + 0.4 * o.moveStrength);

  // Big bushy tail (drawn behind)
  ctx.save();
  ctx.translate(-10, 3);
  ctx.rotate(-0.7 + tailWag);
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-8, -2, 9, 5, -0.3, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // White tail tip
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(-15, -5, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Legs
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-7, 11 + fl, 3, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(7,  11 + fr, 3, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(-5, 12 + fr, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.ellipse(5,  12 + fl, 2.5, 4, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // White socks
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(-7, 14 + fl, 2.5, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(7,  14 + fr, 2.5, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(-5, 15 + fr, 2, 1.4, 0, 0, Math.PI * 2);
  ctx.ellipse(5,  15 + fl, 2, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 12, 8, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // White belly
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(0, 7, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head (slightly pointy)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-9, -7);
  ctx.quadraticCurveTo(-9, -14, 0, -14);
  ctx.quadraticCurveTo(9, -14, 9, -7);
  ctx.quadraticCurveTo(9, -2, 4, 0);
  ctx.lineTo(0, 2);
  ctx.lineTo(-4, 0);
  ctx.quadraticCurveTo(-9, -2, -9, -7);
  ctx.fill(); ctx.stroke();

  // Pointy ears with droop on sad
  const droop = o.sad ? 0.5 : 0;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.save(); ctx.translate(-6, -13); ctx.rotate(-0.4 + droop);
  ctx.moveTo(0, 0); ctx.lineTo(2, -9); ctx.lineTo(6, -1); ctx.closePath();
  ctx.restore();
  ctx.save(); ctx.translate(6, -13); ctx.rotate(0.4 - droop);
  ctx.moveTo(0, 0); ctx.lineTo(-2, -9); ctx.lineTo(-6, -1); ctx.closePath();
  ctx.restore();
  ctx.fill(); ctx.stroke();
  // Inner ear
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.save(); ctx.translate(-6, -13); ctx.rotate(-0.4 + droop);
  ctx.moveTo(1, -1); ctx.lineTo(2.5, -7); ctx.lineTo(5, -2); ctx.closePath();
  ctx.restore();
  ctx.save(); ctx.translate(6, -13); ctx.rotate(0.4 - droop);
  ctx.moveTo(-1, -1); ctx.lineTo(-2.5, -7); ctx.lineTo(-5, -2); ctx.closePath();
  ctx.restore();
  ctx.fill();

  // White muzzle
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(0, -1, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  drawEyes(ctx, 0, -7, 3.2, 2.2, eye, blink(o.t, 0.7), o.sad ? 0 : 0.3, o.sad ? 0.6 : 0);

  // Nose
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(0, -2, 1.4, 1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawWolf(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  const fl = Math.sin(o.walkPhase) * 3.4 * o.moveStrength;
  const fr = Math.sin(o.walkPhase + Math.PI) * 3.4 * o.moveStrength;
  const tailWag = Math.sin(o.t * 2.5 + o.walkPhase * 0.3) * (0.3 + 0.5 * o.moveStrength);

  // Big bushy tail
  ctx.save();
  ctx.translate(-12, 2);
  ctx.rotate(-0.6 + tailWag);
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-7, -3, 8, 5, -0.4, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(-13, -6, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Legs (longer than fox)
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-7, 12 + fl, 3, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(7,  12 + fr, 3, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(-5, 13 + fr, 2.7, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(5,  13 + fl, 2.7, 5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Body (sleek, bigger than cat)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 14, 9, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Fur ruff around neck
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, -1, 11, 5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Head + snout
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -7, 9, 8, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Snout (forward bulge)
  ctx.beginPath();
  ctx.ellipse(0, -2, 5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Sharp ears
  const droop = o.sad ? 0.6 : 0;
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.save(); ctx.translate(-6, -13); ctx.rotate(-0.3 + droop);
  ctx.moveTo(0, 0); ctx.lineTo(1, -8); ctx.lineTo(5, 0); ctx.closePath();
  ctx.restore();
  ctx.save(); ctx.translate(6, -13); ctx.rotate(0.3 - droop);
  ctx.moveTo(0, 0); ctx.lineTo(-1, -8); ctx.lineTo(-5, 0); ctx.closePath();
  ctx.restore();
  ctx.fill(); ctx.stroke();

  drawEyes(ctx, 0, -7, 3, 2, eye, blink(o.t, 1.2), 0, o.sad ? 0.6 : 0);

  // Nose
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(0, -3, 1.5, 1.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Fang hint
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(-1.5, -1); ctx.lineTo(-1, 1); ctx.lineTo(-0.5, -1); ctx.closePath();
  ctx.moveTo(1.5, -1); ctx.lineTo(1, 1); ctx.lineTo(0.5, -1); ctx.closePath();
  ctx.fill();
}

function drawRabbit(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // Hop-style locomotion: vertical bounce
  const hop = Math.abs(Math.sin(o.walkPhase * 0.8)) * 4 * o.moveStrength;
  const earSwayL = Math.sin(o.t * 3) * 0.2 + Math.sin(o.walkPhase * 0.8) * 0.3 * o.moveStrength;
  const earSwayR = Math.sin(o.t * 3 + 0.5) * 0.2 - Math.sin(o.walkPhase * 0.8) * 0.3 * o.moveStrength;
  const noseTwitch = Math.sin(o.t * 6) > 0.7 ? Math.sin(o.t * 30) * 0.3 : 0;
  const droop = o.sad ? 0.7 : 0;

  ctx.save();
  ctx.translate(0, -hop);

  // Round fluffy tail
  ctx.fillStyle = "#FFFFFF";
  setupStroke(ctx);
  ctx.beginPath();
  ctx.arc(-12, 5, 4, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Big back legs (folded)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-7, 11, 4, 6, -0.3, 0, Math.PI * 2);
  ctx.ellipse(7,  11, 4, 6,  0.3, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Body — rounder than the cats
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 11, 10, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // White belly
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.ellipse(0, 8, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Front paws (small)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-4, 12, 2, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(4,  12, 2, 3, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -6, 8, 7.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // LONG ears
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.save(); ctx.translate(-3, -12); ctx.rotate(earSwayL - 0.1 + droop);
  ctx.ellipse(0, -8, 2.5, 9, 0, 0, Math.PI * 2);
  ctx.restore();
  ctx.save(); ctx.translate(3, -12); ctx.rotate(earSwayR + 0.1 - droop);
  ctx.ellipse(0, -8, 2.5, 9, 0, 0, Math.PI * 2);
  ctx.restore();
  ctx.fill(); ctx.stroke();
  // Inner ear
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.save(); ctx.translate(-3, -12); ctx.rotate(earSwayL - 0.1 + droop);
  ctx.ellipse(0, -8, 1.2, 6, 0, 0, Math.PI * 2);
  ctx.restore();
  ctx.save(); ctx.translate(3, -12); ctx.rotate(earSwayR + 0.1 - droop);
  ctx.ellipse(0, -8, 1.2, 6, 0, 0, Math.PI * 2);
  ctx.restore();
  ctx.fill();

  drawEyes(ctx, 0, -6, 3, 2.2, eye, blink(o.t, 0.3), 0, o.sad ? 0.5 : 0);

  // Twitching nose + mouth
  ctx.fillStyle = "#FF8A80";
  ctx.beginPath();
  ctx.ellipse(noseTwitch, -2, 1.4, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  setupStroke(ctx, 0.8);
  ctx.beginPath();
  ctx.moveTo(noseTwitch, -1);
  ctx.lineTo(noseTwitch, 0.5);
  ctx.moveTo(noseTwitch, 0.5);
  ctx.quadraticCurveTo(-2, 1.5, -3, 0.5);
  ctx.moveTo(noseTwitch, 0.5);
  ctx.quadraticCurveTo(2, 1.5, 3, 0.5);
  ctx.stroke();

  // Tooth peeking out
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.rect(-1, 1.5, 2, 1.6);
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function drawOwl(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // Owl flies — wings flap independently with phase offset
  const flap = Math.sin(o.walkPhase * 1.3) * (0.4 + 0.6 * o.moveStrength);
  const headTilt = Math.sin(o.t * 0.7) * 0.15;
  const droop = o.sad ? 0.4 : 0;

  // Wings (drawn before body)
  ctx.fillStyle = body;
  setupStroke(ctx);
  ctx.save();
  ctx.translate(-9, 0);
  ctx.rotate(-0.2 - flap);
  ctx.beginPath();
  ctx.ellipse(-4, 2, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Feather lines
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(-7, 4, 4, 2, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(9, 0);
  ctx.rotate(0.2 + flap);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(4, 2, 8, 5, 0.3, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(7, 4, 4, 2, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Egg-shaped body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 2, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Belly with feather pattern
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, 5, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Feather chevrons
  ctx.strokeStyle = body;
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 3; i++) {
    const yy = -1 + i * 4;
    ctx.beginPath();
    ctx.moveTo(-4, yy); ctx.lineTo(0, yy + 2); ctx.lineTo(4, yy);
    ctx.stroke();
  }

  // Talons
  ctx.fillStyle = "#FFE082";
  setupStroke(ctx, 0.9);
  ctx.beginPath();
  ctx.moveTo(-3, 14); ctx.lineTo(-4, 17); ctx.lineTo(-2, 16); ctx.lineTo(-2, 14); ctx.closePath();
  ctx.moveTo(3, 14);  ctx.lineTo(4, 17);  ctx.lineTo(2, 16);  ctx.lineTo(2, 14); ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Head — slight tilt
  ctx.save();
  ctx.translate(0, -8);
  ctx.rotate(headTilt);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Ear tufts
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-7, -6); ctx.lineTo(-5, -11); ctx.lineTo(-3, -7); ctx.closePath();
  ctx.moveTo(7, -6);  ctx.lineTo(5, -11);  ctx.lineTo(3, -7);  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Big eye discs
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-3.5, -1, 4, 0, Math.PI * 2);
  ctx.arc(3.5, -1, 4, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  const blnk = blink(o.t, 0.5);
  ctx.fillStyle = eye;
  ctx.beginPath();
  ctx.ellipse(-3.5, -1 + (o.sad ? 0.8 : 0), 2.4, 2.4 * blnk, 0, 0, Math.PI * 2);
  ctx.ellipse(3.5,  -1 + (o.sad ? 0.8 : 0), 2.4, 2.4 * blnk, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(-3.5, -1, 1.2 * blnk, 0, Math.PI * 2);
  ctx.arc(3.5, -1, 1.2 * blnk, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#FFB300";
  setupStroke(ctx, 0.8);
  ctx.beginPath();
  ctx.moveTo(0, 2); ctx.lineTo(-2, 4 + droop); ctx.lineTo(2, 4 + droop); ctx.closePath();
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function drawDragon(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  const flap = Math.sin(o.walkPhase * 1.4) * (0.5 + 0.4 * o.moveStrength);
  const tailWag = Math.sin(o.t * 3 + o.walkPhase * 0.4) * 0.5;

  // Tail with arrow tip
  ctx.save();
  ctx.translate(-10, 4);
  ctx.rotate(-0.4 + tailWag);
  setupStroke(ctx, 2.2);
  ctx.strokeStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-7, -3, -11, -8);
  ctx.stroke();
  // Arrow
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-11, -8); ctx.lineTo(-15, -6); ctx.lineTo(-13, -11); ctx.closePath();
  ctx.fill(); setupStroke(ctx); ctx.stroke();
  ctx.restore();

  // Wings (membranous)
  setupStroke(ctx);
  ctx.fillStyle = accent;
  ctx.save();
  ctx.translate(-6, -2);
  ctx.rotate(-0.3 - flap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-10, -8, -14, -2);
  ctx.lineTo(-8, 1);
  ctx.lineTo(-3, 4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(6, -2);
  ctx.rotate(0.3 + flap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(10, -8, 14, -2);
  ctx.lineTo(8, 1);
  ctx.lineTo(3, 4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // Legs (small)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-5, 11, 2.5, 3.5, 0, 0, Math.PI * 2);
  ctx.ellipse(5,  11, 2.5, 3.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 4, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Belly scales
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, 7, 6, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Spine ridges along back
  ctx.fillStyle = accent;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 3, -3); ctx.lineTo(i * 3 + 1.5, -6); ctx.lineTo(i * 3 + 3, -3); ctx.closePath();
    ctx.fill();
  }

  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -6, 8, 7, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Horns
  ctx.fillStyle = "#FFE082";
  ctx.beginPath();
  ctx.moveTo(-4, -11); ctx.lineTo(-2, -16); ctx.lineTo(0, -12); ctx.closePath();
  ctx.moveTo(4, -11);  ctx.lineTo(2, -16);  ctx.lineTo(0, -12); ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Snout
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -2, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Nostrils
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(-1.5, -2, 0.5, 0, Math.PI * 2);
  ctx.arc(1.5, -2, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Eyes (slit pupils)
  drawEyes(ctx, 0, -7, 3, 2.2, eye, blink(o.t, 1.5), 0, o.sad ? 0.5 : 0);

  // Tiny fang
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(-1, 0.5); ctx.lineTo(-0.5, 2); ctx.lineTo(0, 0.5); ctx.closePath();
  ctx.fill();
}

function drawPhoenix(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  const flap = Math.sin(o.walkPhase * 1.5) * (0.5 + 0.4 * o.moveStrength);

  // Flame trail (drawn behind, multiple layers fading)
  for (let i = 0; i < 4; i++) {
    const alpha = (1 - i / 5);
    const wob = Math.sin(o.t * 8 + i) * 1.5;
    ctx.fillStyle = (i % 2 === 0 ? body : accent) + Math.floor(alpha * 200).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.ellipse(-8 - i * 3, 4 + wob, 5 - i * 0.6, 4 - i * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tail feathers (3 long)
  setupStroke(ctx);
  for (let i = -1; i <= 1; i++) {
    ctx.save();
    ctx.translate(-10, 4);
    ctx.rotate(i * 0.4 + Math.sin(o.t * 4 + i) * 0.1);
    ctx.fillStyle = i === 0 ? body : accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-6, -2, -12, -4 + i * 2);
    ctx.quadraticCurveTo(-8, 0, 0, 1);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Wings (flame-touched)
  ctx.fillStyle = body;
  ctx.save();
  ctx.translate(-6, -1);
  ctx.rotate(-0.3 - flap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-9, -10, -13, -4);
  ctx.quadraticCurveTo(-7, 0, -3, 4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // Inner accent
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(-7, -2, 4, 2, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(6, -1);
  ctx.rotate(0.3 + flap);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(9, -10, 13, -4);
  ctx.quadraticCurveTo(7, 0, 3, 4);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(7, -2, 4, 2, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 3, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // Belly
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.ellipse(0, 6, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -7, 7, 7, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Crest of fire feathers
  ctx.fillStyle = accent;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.5, -10);
    ctx.lineTo(i * 3, -16 + Math.sin(o.t * 6 + i) * 1);
    ctx.lineTo(i * 2.5 + 2, -10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // Beak
  ctx.fillStyle = "#FFB300";
  setupStroke(ctx, 0.8);
  ctx.beginPath();
  ctx.moveTo(0, -3); ctx.lineTo(-2, -1); ctx.lineTo(2, -1); ctx.closePath();
  ctx.fill(); ctx.stroke();

  drawEyes(ctx, 0, -7, 2.6, 1.8, eye, blink(o.t, 2.0), 0, o.sad ? 0.4 : 0);
}

function drawBeetle(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // 6 legs cycling in 2 groups of 3
  const lA = Math.sin(o.walkPhase) * 2.5 * o.moveStrength;
  const lB = Math.sin(o.walkPhase + Math.PI) * 2.5 * o.moveStrength;
  const antWiggle = Math.sin(o.t * 6) * 0.3;
  const droop = o.sad ? 0.5 : 0;

  setupStroke(ctx, 1.2);
  // 6 legs (3 each side)
  ctx.strokeStyle = "#222";
  for (let i = 0; i < 3; i++) {
    const yo = -3 + i * 4;
    const offA = i % 2 === 0 ? lA : lB;
    const offB = i % 2 === 0 ? lB : lA;
    ctx.beginPath();
    ctx.moveTo(-9, yo); ctx.lineTo(-15, yo + 4 + offA);
    ctx.moveTo(9, yo); ctx.lineTo(15, yo + 4 + offB);
    ctx.stroke();
  }

  // Round dome shell
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 2, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  setupStroke(ctx);
  ctx.stroke();

  // Center seam (split for wing covers)
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -7); ctx.lineTo(0, 11);
  ctx.stroke();

  // Glossy highlight
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.ellipse(-4, -3, 4, 2.5, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Spots (3 per side)
  ctx.fillStyle = accent;
  for (let i = 0; i < 3; i++) {
    const yo = -3 + i * 4;
    ctx.beginPath();
    ctx.arc(-5, yo, 1.5, 0, Math.PI * 2);
    ctx.arc(5, yo, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head (smaller, in front)
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(0, -9, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  setupStroke(ctx); ctx.stroke();

  // Antennae
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-3, -12); ctx.quadraticCurveTo(-6, -16, -7 + antWiggle, -19 + droop);
  ctx.moveTo(3, -12); ctx.quadraticCurveTo(6, -16, 7 - antWiggle, -19 + droop);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(-7 + antWiggle, -19 + droop, 1.3, 0, Math.PI * 2);
  ctx.arc(7 - antWiggle, -19 + droop, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // Eyes on the head
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(-2.5, -9, 1.6, 0, Math.PI * 2);
  ctx.arc(2.5, -9, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = eye;
  const bk = blink(o.t, 0.9);
  ctx.beginPath();
  ctx.ellipse(-2.5, -9, 0.9, 0.9 * bk, 0, 0, Math.PI * 2);
  ctx.ellipse(2.5, -9, 0.9, 0.9 * bk, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawTurtle(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // Slow waddle
  const fl = Math.sin(o.walkPhase * 0.7) * 1.6 * o.moveStrength;
  const fr = Math.sin(o.walkPhase * 0.7 + Math.PI) * 1.6 * o.moveStrength;
  // Head bob — peeks out further when moving
  const headOut = (1 + Math.sin(o.t * 1.5)) * 1.5 + o.moveStrength * 2;
  const tailWag = Math.sin(o.t * 2.5) * 0.4;

  // Tail
  ctx.save();
  ctx.translate(-10, 4);
  ctx.rotate(-0.4 + tailWag * 0.5);
  ctx.fillStyle = accent;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(-5, -2); ctx.lineTo(0, 2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();

  // 4 stubby legs
  ctx.fillStyle = accent;
  setupStroke(ctx);
  ctx.beginPath();
  ctx.ellipse(-8, 8 + fl, 3, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(8,  8 + fr, 3, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(-7, 13 + fr, 3, 2.5, 0, 0, Math.PI * 2);
  ctx.ellipse(7,  13 + fl, 3, 2.5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // Head (poking forward)
  ctx.fillStyle = accent;
  ctx.save();
  ctx.translate(0, -6 - headOut * 0.3);
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  drawEyes(ctx, 0, -1, 2.2, 1.6, eye, blink(o.t, 0.4), 0, o.sad ? 0.5 : 0);

  // Mouth
  setupStroke(ctx, 0.8);
  ctx.beginPath();
  ctx.arc(0, 2.5, 1.5, 0.1, Math.PI - 0.1);
  ctx.stroke();
  ctx.restore();

  // Shell (drawn LAST, on top, so it covers head/leg attachment seams nicely)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 3, 13, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  setupStroke(ctx); ctx.stroke();

  // Hexagon plates
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  const plates: Array<[number, number]> = [
    [0, -2], [-5, 1], [5, 1], [0, 5], [-5, 8], [5, 8], [0, 11],
  ];
  for (const [px, py] of plates) {
    ctx.beginPath();
    ctx.moveTo(px - 3, py);
    ctx.lineTo(px - 1.5, py - 2.5);
    ctx.lineTo(px + 1.5, py - 2.5);
    ctx.lineTo(px + 3, py);
    ctx.lineTo(px + 1.5, py + 2.5);
    ctx.lineTo(px - 1.5, py + 2.5);
    ctx.closePath();
    ctx.stroke();
  }

  // Shell highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(-4, -2, 5, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawSpirit(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  const body = pet.visual.bodyColor;
  const accent = pet.visual.accentColor;
  const eye = pet.visual.eyeColor;
  // Floats — no legs. Wisps trail.
  const sway = Math.sin(o.t * 2.5) * 1.5 + o.moveStrength * Math.sin(o.walkPhase) * 2;
  const tailWisp = Math.sin(o.t * 3) * 1.2;

  // Trailing wisps (drawn behind)
  for (let i = 0; i < 3; i++) {
    const alpha = 0.5 - i * 0.15;
    ctx.fillStyle = body + Math.floor(alpha * 255).toString(16).padStart(2, "0");
    ctx.beginPath();
    ctx.ellipse(-8 - i * 4 + tailWisp, 6 + i * 3 + Math.sin(o.t * 4 + i) * 1.5, 5 - i, 3 - i * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Soft body (translucent)
  setupStroke(ctx);
  ctx.fillStyle = body + "DD";
  ctx.beginPath();
  ctx.moveTo(-10, 6 + sway * 0.2);
  ctx.quadraticCurveTo(-12, -2, -8, -10);
  ctx.quadraticCurveTo(0, -16, 8, -10);
  ctx.quadraticCurveTo(12, -2, 10, 6 + sway * 0.2);
  // Wisp tail bottom
  ctx.quadraticCurveTo(6, 10, 4, 6);
  ctx.quadraticCurveTo(2, 11, 0, 7);
  ctx.quadraticCurveTo(-2, 11, -4, 6);
  ctx.quadraticCurveTo(-6, 10, -10, 6 + sway * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Inner halo
  const grad = ctx.createRadialGradient(0, -3, 1, 0, -3, 12);
  grad.addColorStop(0, accent + "FF");
  grad.addColorStop(1, accent + "00");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, -3, 12, 0, Math.PI * 2);
  ctx.fill();

  // Glowing eyes
  ctx.fillStyle = eye;
  const blnk = blink(o.t, 0.6);
  ctx.beginPath();
  ctx.ellipse(-3, -6, 1.8, 1.8 * blnk, 0, 0, Math.PI * 2);
  ctx.ellipse(3, -6, 1.8, 1.8 * blnk, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(-3, -6.5, 0.6, 0, Math.PI * 2);
  ctx.arc(3, -6.5, 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Smile (or frown when sad)
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (o.sad) {
    ctx.arc(0, 0, 2.5, Math.PI + 0.2, -0.2);
  } else {
    ctx.arc(0, -2, 2.5, 0.2, Math.PI - 0.2);
  }
  ctx.stroke();
}

// ─── Public dispatch ───────────────────────────────────────────────────────

export function renderPet(ctx: CanvasRenderingContext2D, pet: PetDef, o: PetRenderOpts): void {
  switch (pet.visual.kind) {
    case "cat":     return drawCat(ctx, pet, o);
    case "fox":     return drawFox(ctx, pet, o);
    case "wolf":    return drawWolf(ctx, pet, o);
    case "rabbit":  return drawRabbit(ctx, pet, o);
    case "owl":     return drawOwl(ctx, pet, o);
    case "dragon":  return drawDragon(ctx, pet, o);
    case "phoenix": return drawPhoenix(ctx, pet, o);
    case "beetle":  return drawBeetle(ctx, pet, o);
    case "turtle":  return drawTurtle(ctx, pet, o);
    case "spirit":  return drawSpirit(ctx, pet, o);
    default:        return drawCat(ctx, pet, o);
  }
}
