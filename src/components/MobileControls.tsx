import { useEffect, useRef } from "react";
import type { InputHandler } from "../game/InputHandler";

interface PlayerInfo {
  attackRange: number;
  canvas: HTMLCanvasElement | null;
  brawlerId: string;
  playerX?: number;
  playerY?: number;
}

interface MobileControlsProps {
  /** Lazy resolver for the InputHandler — created when the game starts. */
  getInput: () => InputHandler | null;
  /** Lazy lookup for player + brawler stats so the indicator can match the
   *  selected brawler's attack/super shape. */
  getPlayerInfo: () => PlayerInfo | null;
}

const STICK_BASE = 56;          // base ring radius (px) → 112px diameter (≈20% smaller)
const STICK_THUMB = 28;         // thumb radius (px)
const TAP_THRESHOLD = 0.15;     // normalized distance below which a release is a "tap" (auto-aim)
const PLACED_AREA_MAX_WORLD = 300; // max world distance to drop a placed-area super

interface JoystickState {
  pointerId: number | null;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  magnitude: number;
}

function emptyStick(): JoystickState {
  return { pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0, magnitude: 0 };
}

export default function MobileControls({ getInput, getPlayerInfo }: MobileControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const moveStick = useRef<JoystickState>(emptyStick());
  const attackStick = useRef<JoystickState>(emptyStick());
  const superStick = useRef<JoystickState>(emptyStick());
  const rafRef = useRef(0);

  // ----------------------- Aim-preview render loop -----------------------
  useEffect(() => {
    const renderPreview = () => {
      const cv = previewCanvasRef.current;
      const info = getPlayerInfo();
      if (cv && info?.canvas) {
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const cssW = cv.clientWidth;
        const cssH = cv.clientHeight;
        if (cv.width !== cssW * dpr || cv.height !== cssH * dpr) {
          cv.width = Math.max(1, Math.floor(cssW * dpr));
          cv.height = Math.max(1, Math.floor(cssH * dpr));
        }
        const ctx = cv.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, cssW, cssH);

          // object-fit: cover — uniform scale max(cssW/canvasW, cssH/canvasH).
          const gameRect = info.canvas.getBoundingClientRect();
          const scale = Math.max(
            gameRect.width / info.canvas.width,
            gameRect.height / info.canvas.height,
          );
          const screenX = gameRect.left + gameRect.width / 2;
          const screenY = gameRect.top + gameRect.height / 2;

          if (
            attackStick.current.pointerId !== null &&
            attackStick.current.magnitude > TAP_THRESHOLD
          ) {
            const ang = Math.atan2(attackStick.current.dy, attackStick.current.dx);
            drawAttackIndicator(
              ctx, screenX, screenY, ang,
              info.brawlerId, scale, info.attackRange,
            );
          }
          // Super indicator appears the moment the button is touched (not
          // only on drag) so the player can preview the zone before deciding
          // to release vs slide-aim.
          if (superStick.current.pointerId !== null) {
            const m = superStick.current.magnitude;
            const ang = m > 0.01
              ? Math.atan2(superStick.current.dy, superStick.current.dx)
              : 0;
            drawSuperIndicator(
              ctx, screenX, screenY, ang,
              info.brawlerId, scale, m,
              cssW, cssH,
            );
          }
        }
      }
      rafRef.current = requestAnimationFrame(renderPreview);
    };
    rafRef.current = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getPlayerInfo]);

  // ----------------------- DOM thumb position update ---------------------
  const refreshThumbs = () => {
    if (!rootRef.current) return;
    const thumbs = rootRef.current.querySelectorAll<HTMLDivElement>("[data-thumb]");
    thumbs.forEach((el) => {
      const which = el.dataset.thumb!;
      const stick = which === "move" ? moveStick.current
        : which === "attack" ? attackStick.current
        : superStick.current;
      const offsetX = stick.dx * (STICK_BASE - STICK_THUMB / 2);
      const offsetY = stick.dy * (STICK_BASE - STICK_THUMB / 2);
      el.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    });
  };

  // ----------------------- Pointer handlers ------------------------------
  const beginStick = (which: "move" | "attack" | "super", e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const stick = which === "move" ? moveStick.current
      : which === "attack" ? attackStick.current
      : superStick.current;
    if (stick.pointerId !== null) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    stick.pointerId = e.pointerId;
    stick.originX = rect.left + rect.width / 2;
    stick.originY = rect.top + rect.height / 2;
    stick.dx = 0;
    stick.dy = 0;
    stick.magnitude = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    refreshThumbs();
  };

  const moveStickPointer = (
    which: "move" | "attack" | "super", e: React.PointerEvent<HTMLDivElement>,
  ) => {
    const stick = which === "move" ? moveStick.current
      : which === "attack" ? attackStick.current
      : superStick.current;
    if (stick.pointerId !== e.pointerId) return;
    e.preventDefault();
    const rawDx = e.clientX - stick.originX;
    const rawDy = e.clientY - stick.originY;
    const mag = Math.hypot(rawDx, rawDy);
    const norm = Math.min(1, mag / STICK_BASE);
    const dx = mag === 0 ? 0 : (rawDx / mag) * norm;
    const dy = mag === 0 ? 0 : (rawDy / mag) * norm;
    stick.dx = dx;
    stick.dy = dy;
    stick.magnitude = norm;

    const input = getInput();
    if (input) {
      if (which === "move") {
        input.setMovementJoystick(dx, dy);
      } else if (which === "attack") {
        input.setAttackJoystick(true, Math.atan2(dy, dx));
      } else {
        input.setSuperJoystick(true, Math.atan2(dy, dx));
      }
    }
    refreshThumbs();
  };

  const endStick = (
    which: "move" | "attack" | "super", e: React.PointerEvent<HTMLDivElement>,
  ) => {
    const stick = which === "move" ? moveStick.current
      : which === "attack" ? attackStick.current
      : superStick.current;
    if (stick.pointerId !== e.pointerId) return;
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    stick.pointerId = null;

    const input = getInput();
    if (input) {
      if (which === "move") {
        input.setMovementJoystick(0, 0);
      } else if (which === "attack") {
        const info = getPlayerInfo();
        if (stick.magnitude > TAP_THRESHOLD) {
          input.setAttackJoystick(true, Math.atan2(stick.dy, stick.dx));
          input.triggerAttack(info?.playerX, info?.playerY);
          requestAnimationFrame(() => input.setAttackJoystick(false, 0));
        } else {
          input.setAttackJoystick(false, 0);
          input.triggerAttack();
        }
      } else {
        const info = getPlayerInfo();
        if (stick.magnitude > TAP_THRESHOLD) {
          input.setSuperJoystick(true, Math.atan2(stick.dy, stick.dx));
          input.triggerSuper(info?.playerX, info?.playerY);
          requestAnimationFrame(() => input.setSuperJoystick(false, 0));
        } else {
          input.setSuperJoystick(false, 0);
          input.triggerSuper();
        }
      }
    }

    stick.dx = 0;
    stick.dy = 0;
    stick.magnitude = 0;
    refreshThumbs();
  };

  // ----------------------- Joystick element factory ----------------------
  const stickEl = (
    which: "move" | "attack" | "super",
    label: string,
    icon: string,
    baseColor: string,
    glow: string,
    thumbColor: string,
    posStyle: React.CSSProperties,
    sizeOverride?: number,
  ) => {
    const radius = sizeOverride ?? STICK_BASE;
    return (
      <div
        key={which}
        onPointerDown={(e) => beginStick(which, e)}
        onPointerMove={(e) => moveStickPointer(which, e)}
        onPointerUp={(e) => endStick(which, e)}
        onPointerCancel={(e) => endStick(which, e)}
        style={{
          position: "absolute",
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          background: `radial-gradient(circle at 30% 30%, ${baseColor}cc, ${baseColor}66 60%, ${baseColor}22 100%)`,
          border: `3px solid ${glow}`,
          boxShadow: `0 0 22px ${glow}aa, inset 0 0 18px ${glow}66`,
          touchAction: "none",
          userSelect: "none",
          WebkitTouchCallout: "none",
          cursor: "pointer",
          ...posStyle,
        }}
        title={label}
        aria-label={label}
      >
        <div
          data-thumb={which}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: STICK_THUMB * 2,
            height: STICK_THUMB * 2,
            borderRadius: "50%",
            background: `radial-gradient(circle at 35% 30%, ${thumbColor}, ${baseColor})`,
            border: `2px solid ${glow}`,
            boxShadow: `0 4px 14px ${glow}, inset 0 2px 6px rgba(255,255,255,0.4)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            color: "white",
            textShadow: "0 2px 4px rgba(0,0,0,0.7)",
            pointerEvents: "none",
          }}
        >{icon}</div>
      </div>
    );
  };

  // Layout (per spec):
  //   movement (blue)  → bottom-LEFT
  //   attack   (red)   → bottom-RIGHT
  //   super    (yellow)→ above-and-slightly-left of the attack stick
  return (
    <div
      ref={rootRef}
      style={{ position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none" }}
    >
      <canvas
        ref={previewCanvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />

      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {stickEl(
          "move", "Движение", "🏃", "#1565C0", "#42A5F5", "#90CAF9",
          { left: 28, bottom: 36, pointerEvents: "auto" },
        )}
        {stickEl(
          "attack", "Атака", "🎯", "#B71C1C", "#FF5252", "#FFCDD2",
          { right: 28, bottom: 36, pointerEvents: "auto" },
        )}
        {stickEl(
          "super", "Супер", "⚡", "#F9A825", "#FFD54F", "#FFF59D",
          // Lowered: was at full STICK_BASE * 2 above the attack stick;
          // now sits roughly one stick height above (closer to the attack stick).
          { right: 28 + STICK_BASE * 2 + 10, bottom: 36 + STICK_BASE + 6, pointerEvents: "auto" },
          42, // super button is noticeably smaller than the analog sticks
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Aim indicator drawing
// ============================================================================
//
// All indicators are drawn in screen-space, anchored to the player which is
// always rendered at the center of the game canvas (camera follows player).
// World-unit dimensions are multiplied by `scale` (CSS-px-per-world-unit) so
// the indicator visually matches the in-game projectile range.
//
// Visual language (per spec):
//   - translucent gray fill at ~0.4 alpha
//   - white / pale-blue stroke for the outline
//   - shape mirrors the actual attack hitbox (line, cone, triple-fan, circle…)
// ============================================================================

const STROKE = "rgba(255, 255, 255, 0.85)";
const FILL = "rgba(200, 200, 210, 0.4)";
const FILL_SOFT = "rgba(200, 200, 210, 0.28)";

// =====================================================================
// Per-brawler attack indicator. Strict rules:
//   miya   — center straight shot + two curved side arcs (Bezier), ±15°.
//   ronin  — 60° cone (filled sector), radius 160.
//   yuki   — straight line, width 20, length 350.
//   kenji  — straight line + small circle at tip + dashed circle r=200.
//   hana   — straight line, width 20, length 400, pink/gray tint.
//   goro   — circle around player (radius 90), aim direction ignored.
//   sora   — straight line + dashed explosion circle r=60 at tip.
//   rin    — straight line, width 15, length 300, greenish gray.
//   taro   — 90° cone (filled sector), radius 80.
// =====================================================================
function drawAttackIndicator(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, angle: number,
  brawlerId: string, scale: number, attackRangeWorld: number,
) {
  const range = attackRangeWorld * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);

  switch (brawlerId) {
    case "miya": {
      // Three projectiles: straight center + two curved Bezier arcs at ±15°.
      ctx.strokeStyle = "rgba(186, 104, 200, 0.95)";
      ctx.fillStyle = "rgba(186, 104, 200, 0.55)";
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(range, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(186, 104, 200, 0.95)";
      ctx.setLineDash([10, 6]);
      for (const sign of [-1, 1]) {
        // End-point along the symmetric ±15° splay.
        const endAng = sign * (Math.PI / 12);
        const ex = Math.cos(endAng) * range;
        const ey = Math.sin(endAng) * range;
        // Control point pushed sideways from the midpoint to bend the curve.
        const midX = ex / 2;
        const midY = ey / 2;
        const bend = sign * range * 0.35;
        const ctrlX = midX - Math.sin(endAng) * bend;
        const ctrlY = midY + Math.cos(endAng) * bend;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(ctrlX, ctrlY, ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(ex, ey, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([10, 6]);
      }
      ctx.setLineDash([]);
      break;
    }
    case "ronin": {
      const halfArc = Math.PI / 6; // ±30° → 60° total
      ctx.fillStyle = FILL;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, range, -halfArc, halfArc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "goro": {
      // Spin attack — circle around the player. Direction-agnostic.
      ctx.rotate(-angle);
      const r = 90 * scale;
      ctx.fillStyle = FILL_SOFT;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "taro": {
      // 90° melee cone, radius 80.
      const halfArc = Math.PI / 4; // ±45° → 90° total
      const r = 80 * scale;
      ctx.fillStyle = FILL;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -halfArc, halfArc);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "kenji": {
      // Pointer line + small circle at tip + dashed jump-radius circle 200.
      ctx.strokeStyle = "rgba(255, 245, 157, 0.95)";
      ctx.fillStyle = "rgba(255, 213, 79, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(range, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(range, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const chainR = 200 * scale;
      ctx.strokeStyle = "rgba(64, 196, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(range, 0, chainR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "sora": {
      // Linear fireball + dashed explosion radius 60 at the tip.
      drawLineProjectile(ctx, range, 20 * scale, FILL, STROKE);
      const blastR = 60 * scale;
      ctx.strokeStyle = "rgba(255, 152, 0, 0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(range, 0, blastR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "yuki": {
      drawLineProjectile(ctx, range, 20 * scale, "rgba(225, 245, 254, 0.42)", STROKE);
      break;
    }
    case "hana": {
      drawLineProjectile(ctx, range, 20 * scale, "rgba(252, 228, 236, 0.45)", "rgba(255, 128, 171, 0.9)");
      break;
    }
    case "rin": {
      drawLineProjectile(ctx, range, 15 * scale, "rgba(165, 214, 167, 0.45)", "rgba(76, 175, 80, 0.9)");
      break;
    }
    default: {
      drawLineProjectile(ctx, range, 18 * scale, FILL, STROKE);
      break;
    }
  }
  ctx.restore();
}

function drawLineProjectile(
  ctx: CanvasRenderingContext2D,
  length: number, width: number,
  fill: string, stroke: string,
) {
  const w = Math.max(8, width);
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(0, -w / 2, length, w);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(length, 0, Math.max(6, w * 0.55), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// =====================================================================
// Per-brawler super indicator. Strict rules:
//   miya   — circle r=350 around player (search zone). Direction ignored.
//   ronin  — NO indicator (instant self-buff). Renderer returns null.
//   yuki   — placed circle r=140, max 300 world units from player.
//   kenji  — placed circle r=110, max 300.
//   hana   — placed circle r=160, max 300.
//   goro   — NO indicator (instant self-buff).
//   sora   — placed circle r=200, max 400, with meteor dots inside.
//   rin    — placed circle r=100, max 300.
//   taro   — placed turret outline 40x40 (max 200 from player).
// =====================================================================
function drawSuperIndicator(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, angle: number,
  brawlerId: string, scale: number,
  magnitude: number,
  cssW: number, cssH: number,
) {
  // Self-buff supers: never draw a preview at all.
  if (brawlerId === "ronin" || brawlerId === "goro") return;

  ctx.save();
  ctx.translate(px, py);

  switch (brawlerId) {
    case "miya": {
      const r = 350 * scale;
      ctx.fillStyle = "rgba(255, 23, 68, 0.12)";
      ctx.strokeStyle = "rgba(255, 23, 68, 0.85)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "taro": {
      ctx.rotate(angle);
      const dist = Math.min(1, magnitude) * 200 * scale;
      const size = 40 * scale;
      drawAimLine(ctx, dist);
      ctx.translate(dist, 0);
      ctx.rotate(-angle);
      ctx.fillStyle = FILL;
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.rect(-size / 2, -size / 2, size, size);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      // Tiny turret silhouette.
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-2, 0, 4, size * 0.4);
      break;
    }
    case "yuki":
    case "kenji":
    case "hana":
    case "sora":
    case "rin": {
      const radiusByBrawler: Record<string, number> = {
        yuki: 140, kenji: 110, hana: 160, sora: 200, rin: 100,
      };
      const maxDistByBrawler: Record<string, number> = {
        yuki: 300, kenji: 300, hana: 300, sora: 400, rin: 300,
      };
      const r = radiusByBrawler[brawlerId] * scale;
      const maxDist = maxDistByBrawler[brawlerId] * scale;
      const dist = Math.min(1, magnitude) * maxDist;
      ctx.rotate(angle);
      drawAimLine(ctx, dist);
      ctx.translate(dist, 0);
      ctx.rotate(-angle);
      ctx.fillStyle = "rgba(200, 210, 220, 0.4)";
      ctx.strokeStyle = STROKE;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);

      if (brawlerId === "sora") {
        // 5 meteor impact dots scattered inside the circle.
        ctx.fillStyle = "rgba(255, 152, 0, 0.85)";
        const offsets = [
          [0, 0], [r * 0.55, r * 0.2], [-r * 0.5, r * 0.45],
          [r * 0.2, -r * 0.55], [-r * 0.4, -r * 0.3],
        ];
        for (const [dx, dy] of offsets) {
          ctx.beginPath();
          ctx.arc(dx, dy, Math.max(3, r * 0.05), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
  }
  ctx.restore();
}

/** Dashed guide-line from the player out to the placed-area center. */
function drawAimLine(ctx: CanvasRenderingContext2D, length: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
