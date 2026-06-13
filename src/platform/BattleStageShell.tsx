import type { CSSProperties, ReactNode } from "react";
import { STAGE_ASPECT, STAGE_H, STAGE_W } from "./types";

interface BattleStageShellProps {
  children: ReactNode;
  /** Overlays rendered inside the letterboxed stage (HUD, sticks, minimap). */
  overlay?: ReactNode;
  outerStyle?: CSSProperties;
}

/**
 * Letterboxed 1200×800 battle viewport. All battle HUD must live inside `overlay`
 * so controls align with the canvas on phones.
 */
export function BattleStageShell({ children, overlay, outerStyle }: BattleStageShellProps) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#050508",
        position: "relative",
        ...outerStyle,
      }}
    >
      <div
        style={{
          position: "relative",
          width: `min(100vw, calc(100vh * ${STAGE_W} / ${STAGE_H}))`,
          height: `min(100vh, calc(100vw * ${STAGE_H} / ${STAGE_W}))`,
          maxWidth: "100vw",
          maxHeight: "100dvh",
          aspectRatio: `${STAGE_W} / ${STAGE_H}`,
          overflow: "hidden",
          background: "#050508",
          isolation: "isolate",
        }}
      >
        {children}
        {overlay}
      </div>
    </div>
  );
}

export { STAGE_W, STAGE_H, STAGE_ASPECT };
