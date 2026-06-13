import type { ControlMode } from "../utils/localStorageAPI";
import { getCurrentProfile } from "../utils/localStorageAPI";
import type { PlatformLayout } from "./types";
import { detectAutoControlScheme } from "./platformDetect";

/** Profile override wins; otherwise platform auto-detection (updates on resize). */
export function resolveEffectiveControlScheme(layout: PlatformLayout): ControlMode {
  const saved = getCurrentProfile()?.controlMode;
  if (saved) return saved;
  return detectAutoControlScheme(layout);
}
