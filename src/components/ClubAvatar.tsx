import { CLUB_AVATAR_PRESETS, type Club } from "../utils/clubs";

interface Props {
  club: Pick<Club, "name" | "avatarDataUrl" | "avatarPreset">;
  size?: number;
  showBorder?: boolean;
}

/**
 * Visual avatar for a club. Falls back to a procedural gradient + emoji if
 * no uploaded image exists. The preset is matched by id; if missing we hash
 * the club name into the preset list so every club still gets a stable look.
 */
export default function ClubAvatar({ club, size = 56, showBorder = true }: Props) {
  if (club.avatarDataUrl) {
    return (
      <img
        src={club.avatarDataUrl}
        alt={club.name}
        style={{
          width: size, height: size,
          borderRadius: size * 0.22,
          objectFit: "cover",
          border: showBorder ? "2px solid rgba(255,255,255,0.25)" : "none",
          boxShadow: showBorder ? "0 4px 12px rgba(0,0,0,0.4)" : "none",
        }}
      />
    );
  }
  const preset = pickPreset(club.avatarPreset, club.name);
  const [a, b] = preset.gradient;
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size * 0.22,
      background: `linear-gradient(135deg, ${a}, ${b})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: showBorder ? "2px solid rgba(255,255,255,0.25)" : "none",
      boxShadow: showBorder ? `0 4px 12px ${a}55, inset 0 0 12px rgba(255,255,255,0.18)` : "none",
      fontSize: size * 0.55,
      lineHeight: 1,
      textShadow: "0 2px 6px rgba(0,0,0,0.45)",
    }}>{preset.emoji}</div>
  );
}

function pickPreset(id: string | undefined, name: string) {
  if (id) {
    const found = CLUB_AVATAR_PRESETS.find(p => p.id === id);
    if (found) return found;
  }
  // Stable hash based on name so the same club always renders the same.
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return CLUB_AVATAR_PRESETS[h % CLUB_AVATAR_PRESETS.length];
}
