/**
 * PetSvg — 3D GLB для питомцев с моделями; иначе SVG-заглушка.
 */
import type { PetDef } from "../entities/PetData";
import { getPetById } from "../entities/PetData";
import { PET_3D_IDS } from "../game/pet3DRenderer";
import PetViewer3D from "./PetViewer3D";
import PetThumb from "./PetThumb";

interface PetSvgProps {
  pet?: PetDef;
  petId?: string;
  size?: number;
  animated?: boolean;
  haloPulse?: boolean;
  /** Force WebGL even for small sizes (main menu companion). */
  force3D?: boolean;
  /** Custom nickname rendered above the pet model. */
  nameLabel?: string | null;
  /** Запас canvas по краям при вращении (только крупные 3D-превью). */
  clipPadding?: number;
  /** Клик без перетаскивания. */
  onTap?: () => void;
}

export default function PetSvg({
  pet, petId, size = 80, haloPulse = true, force3D = false, animated = false, nameLabel,
  clipPadding, onTap,
}: PetSvgProps) {
  const p = pet ?? getPetById(petId);
  if (!p) return null;

  const use3D = force3D || size >= 110 || PET_3D_IDS.has(p.id);
  const label = nameLabel?.trim() || null;
  const isSmallPreview = size < 110;

  const model = !use3D ? (
    <PetThumb pet={p} size={size} />
  ) : (
    <PetViewer3D
      petId={p.id}
      color={p.color}
      size={size}
      showBackdrop={haloPulse}
      efficientPreview={isSmallPreview}
      pixelRatioCap={isSmallPreview ? 1 : (animated ? 1.5 : 1)}
      animated={animated}
      clipPadding={clipPadding}
      onTap={onTap}
    />
  );

  if (!label) return model;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: Math.max(2, size * 0.04),
    }}>
      <div style={{
        fontSize: Math.max(9, size * 0.11),
        fontWeight: 900,
        color: "#fff",
        letterSpacing: 0.5,
        textAlign: "center",
        maxWidth: size * 1.35,
        lineHeight: 1.15,
        wordBreak: "break-word",
        textShadow: `0 0 8px ${p.color}, 0 2px 4px rgba(0,0,0,0.85)`,
        pointerEvents: "none",
      }}>{label}</div>
      {model}
    </div>
  );
}
