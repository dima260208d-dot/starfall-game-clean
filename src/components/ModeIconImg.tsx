import type { CSSProperties } from "react";
import { getModeIconUrl } from "../utils/modeAssets";

interface ModeIconImgProps {
  modeId: string;
  alt?: string;
  size?: number;
  color?: string;
  /** PNG с прозрачностью — без цветного ореола и без подложки */
  bare?: boolean;
  style?: CSSProperties;
}

export default function ModeIconImg({ modeId, alt = "", size = 72, color, bare = false, style }: ModeIconImgProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
        background: "transparent",
        ...style,
      }}
    >
      <img
        src={getModeIconUrl(modeId)}
        alt={alt}
        className="ui-game-icon"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          background: "transparent",
          filter: !bare && color ? `drop-shadow(0 0 12px ${color}88)` : undefined,
        }}
      />
    </div>
  );
}
