import { useEffect, useState } from "react";
import {
  getStarGuardianDaysRemaining, isStarGuardianActive,
  isMainDailyAvailable, isSecondaryDailyAvailable, isSpecialDailyAvailable,
} from "../utils/subscription";
import { useI18n } from "../i18n";
import StarGuardianIcon from "./StarGuardianIcon";

interface Props {
  onClick: () => void;
  compact?: boolean;
}

export default function StarGuardianBadge({ onClick, compact = false }: Props) {
  const { t } = useI18n();
  const [active, setActive] = useState(isStarGuardianActive());
  const [days, setDays] = useState(getStarGuardianDaysRemaining());
  const [hasReward, setHasReward] = useState(
    isMainDailyAvailable() || isSecondaryDailyAvailable() || isSpecialDailyAvailable()
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setActive(isStarGuardianActive());
      setDays(getStarGuardianDaysRemaining());
      setHasReward(
        isMainDailyAvailable() || isSecondaryDailyAvailable() || isSpecialDailyAvailable()
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!active) return null;

  return (
    <button
      onClick={onClick}
      title={t("sg.badgeTitle")}
      style={{
        position: "relative",
        display: "inline-flex", alignItems: "center", gap: compact ? 5 : 8,
        background: "linear-gradient(135deg, rgba(255,215,64,0.25), rgba(74,20,140,0.6))",
        border: "1.5px solid #FFD740",
        borderRadius: 12,
        padding: compact ? "5px 10px" : "8px 14px",
        color: "#FFD740",
        fontWeight: 800,
        fontSize: compact ? 11 : 13,
        cursor: "pointer",
        boxShadow: "0 0 18px rgba(255,215,64,0.35)",
        overflow: "visible",
        animation: hasReward ? "starGuardianPulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          width: compact ? 18 : 22,
          height: compact ? 18 : 22,
          flexShrink: 0,
          overflow: "visible",
          display: "inline-block",
        }}
      >
        <StarGuardianIcon
          size={compact ? 72 : 88}
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </span>
      <span style={{ letterSpacing: 0.6 }}>{compact ? t("sg.badgeDaysCompact", { days }) : t("sg.badgeDaysFull", { days })}</span>
      {hasReward && (
        <span className="no-ui-shear" style={{
          position: "absolute", top: -5, right: -5,
          width: 14, height: 14, borderRadius: "50%",
          background: "#FF1744",
          border: "2px solid white",
          boxShadow: "0 0 6px rgba(255,23,68,0.8)",
        }} />
      )}
      <style>{`
        @keyframes starGuardianPulse {
          0%,100% { transform: scale(1); box-shadow: 0 0 18px rgba(255,215,64,0.35); }
          50%     { transform: scale(1.05); box-shadow: 0 0 28px rgba(255,215,64,0.65); }
        }
      `}</style>
    </button>
  );
}
