import { memo } from "react";
import { getBrawlerById } from "../../entities/BrawlerData";
import { getMasteryTitleText } from "../../data/brawlerMastery";
import IntroSharedBrawler3D from "./IntroSharedBrawler3D";
import PinIcon from "../PinIcon";
import PlayerMasteryTitle from "../PlayerMasteryTitle";
import type { BattleIntroParticipant } from "../../utils/battleIntro/battleIntroParticipants";
import { getStarFeatBadgeUrl } from "../../utils/battleIntro/battleIntroParticipants";
import type { IntroCardMetrics } from "../../utils/battleIntro/battleIntroSizing";
import { IntroMasteryBadge, IntroRankBadge, fitLabelFontSize } from "./IntroCardBadges";
import IntroNameBarIconSlots, { introNameBarIconColWidth } from "./IntroNameBarIconSlots";

interface Props {
  p: BattleIntroParticipant;
  metrics: IntroCardMetrics;
  revealed: boolean;
  exiting: boolean;
  slideFrom: "left" | "right" | "top" | "bottom";
  teamTint?: "blue" | "red" | "neutral";
}

function slideOffset(from: Props["slideFrom"], out: boolean): string {
  const m = out ? 1 : -1;
  switch (from) {
    case "left": return `translateX(${m * 115}%)`;
    case "right": return `translateX(${-m * 115}%)`;
    case "top": return `translateY(${m * 115}%)`;
    case "bottom": return `translateY(${-m * 115}%)`;
    default: return `translateX(${m * 115}%)`;
  }
}

function BattleIntroCard({ p, metrics, revealed, exiting, slideFrom, teamTint = "neutral" }: Props) {
  const { cardW, modelH, barH, model3dSize, uiScale } = metrics;
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const brColor = getBrawlerById(p.brawlerId)?.color ?? "#546E7A";
  const scale = uiScale;
  const pinSize = Math.round(28 * scale);
  const badgeSize = Math.round(22 * scale);
  const featSize = Math.round(20 * scale);
  const rankSize = Math.round(24 * scale);
  const profileColW = introNameBarIconColWidth(scale);
  const nameFsBase = Math.max(9, Math.round(10.5 * scale));
  const titleFsBase = Math.max(6, Math.round(7 * scale));
  const textColW = Math.max(40, cardW - profileColW - Math.round(14 * scale));
  const nameFs = fitLabelFontSize(p.displayName, nameFsBase, textColW, 7);
  const titleText = p.masteryTitleId ? getMasteryTitleText(p.masteryTitleId) : "";
  const titleFs = titleText
    ? fitLabelFontSize(titleText, titleFsBase, textColW, 6)
    : titleFsBase;

  const border =
    p.highlight
      ? `${Math.max(2, Math.round(3 * scale))}px solid #FFFFFF`
      : teamTint === "blue"
        ? "2px solid #64B5F6"
        : teamTint === "red"
          ? "2px solid #EF5350"
          : "2px solid rgba(0,0,0,0.85)";
  const boxShadow = p.highlight
    ? "0 0 18px rgba(255,255,255,0.55), 0 6px 16px rgba(0,0,0,0.45)"
    : "0 4px 12px rgba(0,0,0,0.5)";

  const visible = revealed && !exiting;

  return (
    <div
      style={{
        width: cardW,
        flexShrink: 0,
        transform: visible ? "none" : slideOffset(slideFrom, exiting),
        opacity: visible ? 1 : 0,
        transition: "transform 0.55s cubic-bezier(0.22, 0.85, 0.25, 1), opacity 0.45s ease",
      }}
    >
      <div
        style={{
          position: "relative",
          width: cardW,
          height: modelH,
          background: `linear-gradient(180deg, ${brColor}55 0%, rgba(8,12,24,0.92) 100%)`,
          border,
          borderBottom: "none",
          boxShadow,
          overflow: "hidden",
        }}
      >
        <div style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "6%",
          bottom: 0,
          zIndex: 1,
          overflow: "hidden",
          pointerEvents: "none",
        }}>
          <div style={{
            position: "absolute",
            left: "43%",
            bottom: "-45%",
            transform: "translateX(-50%)",
          }}>
            <IntroSharedBrawler3D
              brawlerId={p.brawlerId}
              color={brColor}
              size={model3dSize}
              active={visible}
            />
          </div>
        </div>

        <div style={{
          position: "absolute",
          top: 4,
          right: 3,
          zIndex: 4,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          lineHeight: 0,
          pointerEvents: "none",
        }}>
          <PinIcon pinId={p.pinId} size={pinSize} bare animated={false} loading="eager" />
          <IntroMasteryBadge level={p.masteryLevel} tier={p.masteryTier} size={badgeSize} />
          <img
            src={`${base}${getStarFeatBadgeUrl(p.featTierBadge)}`}
            alt=""
            loading="eager"
            decoding="async"
            style={{
              width: featSize,
              height: featSize,
              objectFit: "contain",
              flexShrink: 0,
            }}
          />
          <IntroRankBadge rank={p.brawlerRank} size={rankSize} />
        </div>
      </div>

      <div style={{
        width: cardW,
        minHeight: barH,
        background: "rgba(0,0,0,0.92)",
        border,
        borderTop: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "stretch",
        boxSizing: "border-box",
        boxShadow,
      }}>
        <div style={{
          flex: 1,
          minWidth: 0,
          padding: `${Math.round(5 * scale)}px ${Math.round(7 * scale)}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 0,
        }}>
          <div style={{
            fontSize: nameFs,
            fontWeight: 900,
            color: p.usernameColor,
            whiteSpace: "nowrap",
            lineHeight: 1.12,
            textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          }}>
            {p.displayName}
          </div>
          <div style={{
            minHeight: Math.round(titleFs * 1.3),
            display: "flex",
            alignItems: "center",
          }}>
            {p.masteryTitleId ? (
              <PlayerMasteryTitle
                titleId={p.masteryTitleId}
                fontSize={titleFs}
                style={{
                  textAlign: "left",
                  lineHeight: 1.08,
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                }}
              />
            ) : (
              <div style={{ height: Math.round(titleFs * 1.1) }} />
            )}
          </div>
        </div>
        <div style={{
          width: profileColW,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderLeft: "1px solid rgba(255,255,255,0.12)",
          padding: `${Math.round(2 * scale)}px ${Math.round(3 * scale)}px`,
        }}>
          <IntroNameBarIconSlots
            iconIds={p.profileIconIds}
            scale={scale}
            base={base}
          />
        </div>
      </div>
    </div>
  );
}

export default memo(BattleIntroCard, (prev, next) =>
  prev.p === next.p
  && prev.metrics === next.metrics
  && prev.revealed === next.revealed
  && prev.exiting === next.exiting
  && prev.slideFrom === next.slideFrom
  && prev.teamTint === next.teamTint
);
