import { friendshipProgress } from "../../data/friendshipLevels";
import { getFriendshipBond } from "../../utils/social/friendship";
import { useI18n } from "../../i18n";

export default function FriendshipBondBar({ friendPlayerId }: { friendPlayerId: string }) {
  const { t } = useI18n();
  const bond = getFriendshipBond(friendPlayerId);
  const { level, pct, currentXp, nextLevelXp } = friendshipProgress(bond.xp);

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 900, color: "#FFD740" }}>
          {t("friendship.levelShort", { level: String(level) })}
        </span>
        {nextLevelXp != null && (
          <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.45)" }}>
            {currentXp}/{nextLevelXp} {t("friendship.xp")}
          </span>
        )}
      </div>
      <div
        style={{
          marginTop: 4,
          height: 6,
          borderRadius: 4,
          background: "rgba(0,0,0,0.45)",
          overflow: "hidden",
          border: "1px solid rgba(255,215,64,0.25)",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #FFD740, #FF8F00)",
            borderRadius: 3,
            transition: "width 0.35s ease",
          }}
        />
      </div>
    </div>
  );
}
