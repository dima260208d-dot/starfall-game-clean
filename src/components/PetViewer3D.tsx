import { memo, useEffect, useState } from "react";
import Brawler3DModel from "./Brawler3DModel";
import { subscribeWebGLRemount, registerWebGLCleanup } from "../utils/devWebGLRecovery";
import { PET_3D_IDS, PET_UI_MODEL_URLS, getPetPreviewAnim } from "../game/pet3DRenderer";
import { DEFAULT_SNAP_BACK_MS, resetWebGLAvailabilityProbe } from "./BrawlerViewer3D";

interface PetViewer3DProps {
  petId: string;
  color: string;
  size?: number;
  autoRotateInitial?: boolean;
  pixelRatioCap?: number;
  efficientPreview?: boolean;
  paused?: boolean;
  showBackdrop?: boolean;
  /** Loop locomotion clip (menu companion). */
  animated?: boolean;
  /** После ручного вращения — через N мс вернуть в исходный угол (как у бойцов). */
  snapBackAfterDragMs?: number;
  /** Запас canvas по краям (модель того же размера). */
  clipPadding?: number;
  /** Клик без перетаскивания. */
  onTap?: () => void;
}

function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

registerWebGLCleanup(() => {});

function PetViewer3D({
  petId,
  color,
  size = 120,
  autoRotateInitial = false,
  pixelRatioCap,
  efficientPreview,
  paused,
  showBackdrop = true,
  animated = false,
  snapBackAfterDragMs = DEFAULT_SNAP_BACK_MS,
  clipPadding,
  onTap,
}: PetViewer3DProps) {
  const pad = clipPadding ?? (size >= 100 ? 1.3 : 1);
  const [, setRemountEpoch] = useState(0);
  useEffect(() => subscribeWebGLRemount(() => {
    resetWebGLAvailabilityProbe();
    setRemountEpoch(e => e + 1);
  }), []);

  if (!PET_3D_IDS.has(petId) || !isWebGLAvailable()) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `${color}33`, border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.35,
      }}>🐾</div>
    );
  }

  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const url = PET_UI_MODEL_URLS[petId];
  const preview = getPetPreviewAnim(petId);

  return (
    <Brawler3DModel
      modelUrl={`${base}${url}`}
      animation={preview.anim}
      animationIdx={preview.idx}
      color={color}
      size={size}
      autoRotateInitial={autoRotateInitial}
      pixelRatioCap={pixelRatioCap}
      efficientPreview={efficientPreview}
      paused={paused}
      animationActive={animated}
      showBackdrop={showBackdrop}
      snapBackAfterDragMs={snapBackAfterDragMs}
      clipPadding={pad}
      onTap={onTap}
    />
  );
}

const MemoPetViewer3D = memo(PetViewer3D, (a, b) =>
  a.petId === b.petId
  && a.size === b.size
  && a.color === b.color
  && a.animated === b.animated
  && a.paused === b.paused
  && a.showBackdrop === b.showBackdrop
  && a.efficientPreview === b.efficientPreview
  && a.pixelRatioCap === b.pixelRatioCap
  && a.clipPadding === b.clipPadding
  && a.onTap === b.onTap
);

export default MemoPetViewer3D;
