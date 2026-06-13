import type { ReactNode } from "react";
import { usePlatformLayout } from "./usePlatformLayout";

/**
 * Menu / lobby shell. Desktop keeps the legacy 1.3× zoom; phone/tablet use the
 * full viewport without that transform so compact layout can breathe.
 */
export function MenuStageShell({ children }: { children: ReactNode }) {
  const { useDesktopMenuZoom } = usePlatformLayout();

  if (useDesktopMenuZoom) {
    return (
      <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            width: "calc(100% / 1.3)",
            height: "calc(100% / 1.3)",
            transform: "scale(1.3)",
            transformOrigin: "top left",
            overflowX: "hidden",
            overflowY: "hidden",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        width: "100vw",
        height: "100vh",
        maxWidth: "100vw",
        maxHeight: "100dvh",
      }}
    >
      {children}
    </div>
  );
}
