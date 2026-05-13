/**
 * ChestVisual — renders the chest 3D model via the singleton SpinningModel3D
 * renderer (no extra WebGL context created per instance).
 * CSS animations are applied to the container div for float/glow/shake effects.
 */
import SpinningModel3D from "./SpinningModel3D";
import { CHEST_MODELS } from "./Chest3DViewer";
import { CHESTS, type ChestRarity } from "../utils/chests";

interface Props {
  rarity: ChestRarity;
  size?: number;
  animated?: boolean;
  shake?: boolean;
  exploding?: boolean;
  onClick?: () => void;
}

export default function ChestVisual({
  rarity, size = 120, animated = true, shake = false, exploding = false, onClick,
}: Props) {
  const def = CHESTS[rarity];

  const animName =
    exploding ? "chestExplode 0.7s ease-out forwards" :
    shake     ? "chestShake 0.25s ease-in-out 5"      :
    animated  ? `chestFloat ${3 + def.tier * 0.3}s ease-in-out infinite` :
                undefined;

  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size,
        position: "relative",
        cursor: onClick ? "pointer" : "default",
        animation: animName,
        filter: `drop-shadow(0 ${size * 0.05}px ${size * 0.18}px ${def.color}99)`,
        flexShrink: 0,
      }}
    >
      <ChestStyles />

      {/* Outer aura glow */}
      <div style={{
        position: "absolute", inset: -size * 0.12,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${def.color}55 0%, transparent 68%)`,
        animation: animated ? `chestPulse ${2 + def.tier * 0.2}s ease-in-out infinite` : undefined,
        pointerEvents: "none",
        zIndex: 0,
      }} />

      {/* 3D chest model — singleton renderer, safe to use in long lists */}
      <SpinningModel3D
        modelPath={CHEST_MODELS[rarity]}
        size={size}
        color={def.color}
        ambientMult={1.8}
        dirMult={2.2}
        cameraPos={[0, 1.0, 3.8]}
        lookAtPos={[0, 0.45, 0]}
        rotSpeed={0.018}
        style={{ display: "block", position: "relative", zIndex: 1 }}
      />

      {/* High-tier sparkle particles */}
      {def.tier >= 4 && animated && (
        <>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute",
              left: `${15 + (i * 15)}%`,
              top: `${10 + ((i * 23) % 70)}%`,
              width: size * 0.05, height: size * 0.05,
              borderRadius: "50%",
              background: i % 2 === 0 ? "#FFFFFF" : def.color,
              boxShadow: `0 0 ${size * 0.04}px ${def.color}`,
              animation: `chestSparkle ${1.5 + i * 0.2}s ease-in-out infinite`,
              animationDelay: `${i * 0.25}s`,
              opacity: 0,
              zIndex: 2,
              pointerEvents: "none",
            }} />
          ))}
        </>
      )}

      {/* Legendary+ crown of light */}
      {def.tier >= 6 && animated && (
        <div style={{
          position: "absolute", left: "50%", top: -size * 0.18,
          transform: "translateX(-50%)",
          width: size * (def.tier === 7 ? 0.95 : 0.7),
          height: size * 0.18,
          background: `radial-gradient(ellipse, ${def.color}AA 0%, transparent 70%)`,
          animation: `chestPulse ${def.tier === 7 ? 1.0 : 1.5}s ease-in-out infinite`,
          pointerEvents: "none", zIndex: 2,
        }} />
      )}
      {def.tier === 7 && animated && (
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)",
          width: size * 1.15, height: size * 1.15,
          borderRadius: "50%",
          border: `${Math.max(1, size * 0.015)}px solid ${def.borderColor}88`,
          boxShadow: `0 0 ${size * 0.08}px ${def.borderColor}, inset 0 0 ${size * 0.08}px ${def.color}55`,
          animation: `chestPulse 1.2s ease-in-out infinite`,
          pointerEvents: "none", zIndex: 2,
        }} />
      )}
    </div>
  );
}

export function ChestStyles() {
  return (
    <style>{`
      @keyframes chestFloat {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-6%); }
      }
      @keyframes chestPulse {
        0%, 100% { transform: scale(1); opacity: 0.6; }
        50% { transform: scale(1.18); opacity: 1; }
      }
      @keyframes chestGlow {
        from { filter: brightness(1); }
        to { filter: brightness(1.18); }
      }
      @keyframes chestSparkle {
        0%, 100% { opacity: 0; transform: scale(0.4) rotate(0deg); }
        50% { opacity: 1; transform: scale(1.1) rotate(180deg); }
      }
      @keyframes chestShake {
        0%, 100% { transform: translateX(0) rotate(0); }
        20% { transform: translateX(-6%) rotate(-4deg); }
        40% { transform: translateX(5%) rotate(4deg); }
        60% { transform: translateX(-4%) rotate(-3deg); }
        80% { transform: translateX(4%) rotate(3deg); }
      }
      @keyframes chestExplode {
        0%   { transform: scale(1); opacity: 1; }
        50%  { transform: scale(1.4); opacity: 1; filter: brightness(2.5); }
        100% { transform: scale(1.2); opacity: 0; filter: brightness(3); }
      }
    `}</style>
  );
}
