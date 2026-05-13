import { useEffect, useRef, useState } from "react";
import Brawler3DModel from "./Brawler3DModel";

interface BrawlerViewer3DProps {
  brawlerId: string;
  color: string;
  /** Canvas / viewer square side length in CSS pixels (e.g. 320). Not a 3D world scale. */
  size?: number;
  autoRotateInitial?: boolean;
}

// Brawlers that have a real 3D GLB model in /public/models. Anyone listed here
// renders via the GLTF viewer instead of the 2D billboard fallback.
// idleIdx = direct clip index inside the GLB (most reliable selector)
// Extracted from the binary GLB files; animation order confirmed from raw GLTF JSON.
const MODEL_URLS: Record<string, { url: string; idleAnim: string; idleIdx?: number }> = {
  miya:    { url: "models/miya.glb",    idleAnim: "Walking",  idleIdx: 3 },
  ronin:   { url: "models/ronin.glb",   idleAnim: "Walking",  idleIdx: 2 },
  yuki:    { url: "models/yuki.glb",    idleAnim: "Walking",  idleIdx: 2 },
  kenji:   { url: "models/kenji.glb",   idleAnim: "Walking",  idleIdx: 2 },
  hana:    { url: "models/hana.glb",    idleAnim: "Walking",  idleIdx: 2 },
  goro:    { url: "models/goro.glb",    idleAnim: "Running"             },
  sora:    { url: "models/sora.glb",    idleAnim: "Walking",  idleIdx: 1 },
  rin:     { url: "models/rin.glb",     idleAnim: "Running"             },
  taro:    { url: "models/taro.glb",    idleAnim: "Walking",  idleIdx: 2 },
  zafkiel: { url: "models/zafkiel.glb", idleAnim: "Walking",  idleIdx: 2 },
};

// Cached one-shot WebGL availability check. We try to create a tiny WebGL
// context once; if it fails (e.g. headless preview, hardware blocklisted),
// we treat 3D-model brawlers as if they had no GLB and render their 2D
// billboard fallback so the user always sees the character.
let _webglOk: boolean | null = null;
function isWebGLAvailable(): boolean {
  if (_webglOk !== null) return _webglOk;
  if (typeof document === "undefined") return (_webglOk = false);
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    _webglOk = !!gl;
  } catch {
    _webglOk = false;
  }
  return _webglOk;
}

export default function BrawlerViewer3D({ brawlerId, color, size = 320, autoRotateInitial = false }: BrawlerViewer3DProps) {
  const model = MODEL_URLS[brawlerId];
  if (model && isWebGLAvailable()) {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    return (
      <Brawler3DModel
        modelUrl={`${base}${model.url}`}
        animation={model.idleAnim}
        animationIdx={model.idleIdx}
        color={color}
        size={size}
        autoRotateInitial={autoRotateInitial}
      />
    );
  }
  return <BrawlerViewer3DBillboard brawlerId={brawlerId} color={color} size={size} autoRotateInitial={autoRotateInitial} />;
}

function BrawlerViewer3DBillboard({ brawlerId, color, size = 320, autoRotateInitial = false }: BrawlerViewer3DProps) {
  const [angle, setAngle] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [autoRotate, setAutoRotate] = useState(autoRotateInitial);
  const dragRef = useRef<{ startX: number; startAngle: number } | null>(null);
  const rafRef = useRef<number>(0);
  const tRef = useRef(0);

  useEffect(() => {
    setAngle(0);
  }, [brawlerId]);

  useEffect(() => {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current += dt;
      if (autoRotate && !dragging) {
        setAngle((a) => (a + dt * 35) % 360);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [autoRotate, dragging]);

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setAutoRotate(false);
    dragRef.current = { startX: e.clientX, startAngle: angle };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    setAngle(((dragRef.current.startAngle + dx * 0.6) % 360 + 360) % 360);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Determine which face to show. 0° = front facing camera. 180° = back.
  // Both images share same Y rotation; we flip the back image's local rotation
  // so as the model "spins" we see continuous side-to-side motion.
  const a = angle;
  const frontVisible = a < 90 || a > 270;
  const bob = Math.sin(tRef.current * 2) * 4;

  // base path for vite (handles subpath deployments)
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const frontSrc = `${base}brawlers/${brawlerId}_front.png`;
  const backSrc = `${base}brawlers/${brawlerId}_back.png`;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        perspective: "1200px",
        userSelect: "none",
        cursor: dragging ? "grabbing" : "grab",
        touchAction: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setAutoRotate((v) => !v)}
      title=""
    >
      {/* radial glow backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 55%, ${color}40 0%, ${color}10 35%, transparent 70%)`,
          filter: "blur(2px)",
        }}
      />
      {/* rotating ground ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "82%",
          width: size * 0.8,
          height: size * 0.18,
          marginLeft: -(size * 0.4),
          borderRadius: "50%",
          background: `conic-gradient(from ${a * 2}deg, ${color}80, transparent 30%, ${color}40 60%, transparent 90%, ${color}80)`,
          opacity: 0.55,
          filter: "blur(1px)",
          transform: "rotateX(70deg)",
          transformStyle: "preserve-3d",
        }}
      />
      {/* contact shadow */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "84%",
          width: size * 0.5,
          height: size * 0.08,
          marginLeft: -(size * 0.25),
          borderRadius: "50%",
          background: "rgba(0,0,0,0.55)",
          filter: "blur(8px)",
          transform: `scaleX(${0.85 + Math.abs(Math.sin((a * Math.PI) / 180)) * 0.3})`,
        }}
      />

      {/* the 3D model: two billboards rotated 180° apart so user always sees correct face */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transformStyle: "preserve-3d",
          transform: `translateY(${bob}px) scale(1.0)`,
          transformOrigin: "center 82%",
        }}
      >
        <img
          src={frontSrc}
          alt=""
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center bottom",
            transform: `rotateY(${a}deg)`,
            transition: "none",
            backfaceVisibility: "hidden",
            filter: `drop-shadow(0 12px 18px rgba(0,0,0,0.5)) drop-shadow(0 0 24px ${color}60)`,
            opacity: frontVisible ? 1 : 0,
          }}
        />
        <img
          src={backSrc}
          alt=""
          draggable={false}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            objectPosition: "center bottom",
            transform: `rotateY(${a + 180}deg)`,
            transition: "none",
            backfaceVisibility: "hidden",
            filter: `drop-shadow(0 12px 18px rgba(0,0,0,0.5)) drop-shadow(0 0 24px ${color}60)`,
            opacity: frontVisible ? 0 : 1,
          }}
        />
      </div>

      {/* hint label */}
    </div>
  );
}
