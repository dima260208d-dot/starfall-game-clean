import { memo, useMemo, type CSSProperties, type RefObject } from "react";
import { TrophyIcon, CoinIcon, GemIcon, PowerIcon } from "./GameIcons";
import ChestVisual from "./ChestVisual";
import { getTrophyRoadSegment } from "../utils/trophyRoadProgress";
import type { TrophyRoadReward } from "../utils/localStorageAPI";

function NextRewardIcon({ reward, size = 22 }: { reward: TrophyRoadReward; size?: number }) {
  if (reward.type === "chest" && reward.chestRarity) {
    return (
      <div style={{ width: size + 6, height: size + 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <ChestVisual rarity={reward.chestRarity} size={size + 4} animated={false} />
      </div>
    );
  }
  if (reward.type === "gems") return <GemIcon size={size} lite static />;
  if (reward.type === "powerPoints") return <PowerIcon size={size} lite static />;
  return <CoinIcon size={size} lite static />;
}

interface Props {
  trophies: number;
  badgeCount?: number;
  onClick: () => void;
  style?: CSSProperties;
  displayTrophies?: number;
  barFillOverride?: number;
  barTargetRef?: RefObject<HTMLDivElement | null>;
}

function TrophyRoadMenuButton({
  trophies,
  badgeCount = 0,
  onClick,
  style,
  displayTrophies,
  barFillOverride,
  barTargetRef,
}: Props) {
  const shown = displayTrophies ?? trophies;
  const segment = useMemo(() => getTrophyRoadSegment(trophies), [trophies]);
  const fill = barFillOverride ?? segment.fill;

  const shearVars: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 0,
    padding: "3px 12px 6px",
    minWidth: 158,
    minHeight: 52,
    maxHeight: 52,
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
    letterSpacing: "0.04em",
    overflow: "visible",
    fontFamily: "inherit",
    ["--ui-shear-text" as string]: "#ffffff",
    ["--ui-shear-text-shadow" as string]: "0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.9)",
    ["--ui-shear-fill" as string]: "linear-gradient(135deg, rgba(255,213,79,0.22), rgba(255,138,0,0.18))",
    ["--ui-shear-border" as string]: "var(--bd-gold)",
    ["--ui-shear-shadow" as string]: "var(--sh-glow-gold), var(--sh-sm)",
    ["--ui-shear-blur" as string]: "blur(10px)",
    ...style,
  };

  return (
    <button type="button" onClick={onClick} className="ui-btn ui-btn--shear" style={shearVars}>
      <div
        style={{
          textAlign: "center",
          fontSize: 17,
          fontWeight: 900,
          color: "#FFD700",
          textShadow: "0 1px 0 #000, 0 0 8px rgba(255,215,0,0.35)",
          lineHeight: 1,
          letterSpacing: 0.5,
          marginTop: 3,
          marginBottom: 0,
        }}
      >
        {shown.toLocaleString("ru-RU")}
      </div>

      <div
        ref={barTargetRef}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          marginTop: -5,
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 30 }}>
          <TrophyIcon size={28} lite />
        </div>
        <div
          style={{
            flex: 1,
            height: 16,
            borderRadius: 8,
            background: "rgba(0,0,0,0.55)",
            border: "1px solid rgba(255,255,255,0.12)",
            overflow: "hidden",
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.45)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${fill * 100}%`,
              borderRadius: 6,
              background: "linear-gradient(90deg, #E65100 0%, #FFB300 55%, #FFE082 100%)",
              transition: barFillOverride != null ? "width 0.35s ease" : "none",
            }}
          />
        </div>
        <div
          style={{
            flexShrink: 0,
            width: 38,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {segment.next ? <NextRewardIcon reward={segment.next} size={30} /> : <TrophyIcon size={26} lite />}
        </div>
      </div>

      {badgeCount > 0 && (
        <span
          className="no-ui-shear"
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            minWidth: 20,
            height: 20,
            padding: "0 6px",
            borderRadius: 10,
            background: "linear-gradient(135deg, #FF1744, #D50000)",
            border: "2px solid #160048",
            color: "white",
            fontSize: 11,
            fontWeight: 900,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 12px rgba(255,23,68,0.85)",
            pointerEvents: "none",
            zIndex: 12,
            lineHeight: 1,
          }}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </button>
  );
}

export default memo(
  TrophyRoadMenuButton,
  (prev, next) =>
    prev.trophies === next.trophies
    && prev.badgeCount === next.badgeCount
    && prev.displayTrophies === next.displayTrophies
    && prev.barFillOverride === next.barFillOverride,
);
