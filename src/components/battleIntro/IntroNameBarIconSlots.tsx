import { getProfileIconImage } from "../../utils/profileIconUtils";

interface Props {
  iconIds: [string, string];
  scale: number;
  base: string;
  /** Smaller icons for compact profile bar. */
  compact?: boolean;
  editable?: boolean;
  onEditSlot?: (slot: 0 | 1) => void;
}

export default function IntroNameBarIconSlots({
  iconIds,
  scale,
  base,
  compact = false,
  editable = false,
  onEditSlot,
}: Props) {
  const iconSize = Math.round((compact ? 17 : 20) * scale);
  const gap = Math.max(1, Math.round(2 * scale));

  return (
    <div style={{
      display: "flex",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap,
      height: "100%",
    }}>
      {iconIds.map((id, slot) => {
        const img = (
          <img
            src={getProfileIconImage(id, base)}
            alt=""
            loading="eager"
            decoding="async"
            style={{
              width: iconSize,
              height: iconSize,
              borderRadius: Math.max(2, Math.round(3 * scale)),
              objectFit: "cover",
              display: "block",
            }}
          />
        );
        if (editable && onEditSlot) {
          return (
            <button
              key={slot}
              type="button"
              onClick={e => { e.stopPropagation(); onEditSlot(slot as 0 | 1); }}
              style={{
                border: "none",
                padding: 0,
                margin: 0,
                background: "transparent",
                cursor: "pointer",
                lineHeight: 0,
              }}
            >
              {img}
            </button>
          );
        }
        return <div key={slot} style={{ lineHeight: 0 }}>{img}</div>;
      })}
    </div>
  );
}

export function introNameBarIconColWidth(scale: number, compact = false): number {
  const iconSize = Math.round((compact ? 17 : 20) * scale);
  const gap = Math.max(1, Math.round(2 * scale));
  return iconSize * 2 + gap + Math.round(6 * scale);
}
