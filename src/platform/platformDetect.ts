import type { BattleUiConfig, PlatformLayout, PlatformTier } from "./types";

export function hasTouchInput(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
  );
}

function computeTier(shortSide: number, touch: boolean): PlatformTier {
  if (shortSide <= 520) return "mobile";
  if (shortSide <= 900 || (touch && shortSide <= 1024)) return "tablet";
  return "desktop";
}

function battleUiForTier(tier: PlatformTier, shortSide: number): BattleUiConfig {
  if (tier === "mobile") {
    const uiScale = Math.max(0.72, Math.min(1, shortSide / 390));
    const stickBase = Math.round(44 * uiScale);
    return {
      stickBase,
      stickThumb: Math.round(22 * uiScale),
      edgeInset: Math.max(8, Math.round(12 * uiScale)),
      superStickSize: Math.round(36 * uiScale),
      minimapScale: Math.max(0.78, uiScale),
      hudTop: Math.round(200 * uiScale),
      hudRight: Math.max(8, Math.round(10 * uiScale)),
    };
  }
  if (tier === "tablet") {
    return {
      stickBase: 50,
      stickThumb: 25,
      edgeInset: 16,
      superStickSize: 38,
      minimapScale: 0.92,
      hudTop: 230,
      hudRight: 12,
    };
  }
  return {
    stickBase: 56,
    stickThumb: 28,
    edgeInset: 28,
    superStickSize: 42,
    minimapScale: 1,
    hudTop: 262,
    hudRight: 14,
  };
}

export function detectPlatformLayout(
  width = typeof window !== "undefined" ? window.innerWidth : 1280,
  height = typeof window !== "undefined" ? window.innerHeight : 720,
): PlatformLayout {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const touch = hasTouchInput();
  const tier = computeTier(shortSide, touch);
  const isPortrait = height > width;
  const compact = tier !== "desktop" || width < 900 || height < 500;
  const uiScale = tier === "mobile"
    ? Math.max(0.72, Math.min(1, shortSide / 390))
    : tier === "tablet"
      ? 0.92
      : 1;

  // Legacy menu zoom (1.3×) applied to PC/laptop viewports. Laptops are often
  // classified as "tablet" by shortSide alone — keep zoom when the window is
  // wide enough to be a desktop session, not a phone/tablet portrait layout.
  const useDesktopMenuZoom =
    tier === "desktop" || (width >= 1024 && shortSide > 520);

  return {
    tier,
    compact,
    isTouch: touch,
    isPortrait,
    width,
    height,
    shortSide,
    longSide,
    useDesktopMenuZoom,
    uiScale,
    battle: battleUiForTier(tier, shortSide),
  };
}

/** Auto control scheme before user override in profile settings. */
export function detectAutoControlScheme(layout: PlatformLayout): "pc" | "mobile" {
  if (layout.tier === "desktop" && !layout.isTouch) return "pc";
  if (layout.tier === "mobile" || layout.tier === "tablet") return "mobile";
  return layout.isTouch && layout.shortSide <= 900 ? "mobile" : "pc";
}
