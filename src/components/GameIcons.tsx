/**
 * Shared 3D spinning icon helpers used across all menu pages.
 * Coin/Gem/Power/Trophy use GLB models; Box uses a fallback image.
 */
import SpinningModel3D from "./SpinningModel3D";

const BASE = (import.meta as any).env?.BASE_URL ?? "/";

export const ICONS = {
  box:   `${BASE}images/icon-box.png`,
};

interface IconProps {
  size?: number;
  style?: React.CSSProperties;
  alt?: string;
}

export function CoinIcon({ size = 18, style }: IconProps) {
  return (
    <SpinningModel3D
      modelPath="models/coin.glb"
      size={Math.round(size * 1.3)}
      color="#FFD700"
      ambientMult={3.5}
      dirMult={3.5}
      style={style}
    />
  );
}

export function GemIcon({ size = 18, style }: IconProps) {
  return (
    <SpinningModel3D
      modelPath="models/gem.glb"
      size={Math.round(size * 1.3)}
      color="#40C4FF"
      ambientMult={2.5}
      dirMult={2.5}
      style={style}
    />
  );
}

export function PowerIcon({ size = 18, style }: IconProps) {
  return (
    <SpinningModel3D
      modelPath="models/powerpoint.glb"
      size={Math.round(size * 1.3)}
      color="#CE93D8"
      ambientMult={3.0}
      dirMult={3.0}
      style={style}
    />
  );
}

export function TrophyIcon({ size = 18, style }: IconProps) {
  return (
    <SpinningModel3D
      modelPath="models/trophy.glb"
      size={Math.round(size * 1.3)}
      color="#FFD700"
      ambientMult={3.5}
      dirMult={3.5}
      style={style}
    />
  );
}

export function BoxIcon({ size = 18, style }: IconProps) {
  return (
    <img
      src={ICONS.box}
      alt="сундук"
      style={{ width: size, height: size, objectFit: "contain", verticalAlign: "middle", display: "inline-block", ...style }}
    />
  );
}

export function CoinBadge({ value, size = 16 }: { value: number | string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#FFD700" }}>
      <CoinIcon size={size} /> {value}
    </span>
  );
}

export function GemBadge({ value, size = 16 }: { value: number | string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#40C4FF" }}>
      <GemIcon size={size} /> {value}
    </span>
  );
}

export function PowerBadge({ value, size = 16 }: { value: number | string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#CE93D8" }}>
      <PowerIcon size={size} /> {value}
    </span>
  );
}
