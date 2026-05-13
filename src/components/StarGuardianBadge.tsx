import { useEffect, useState } from "react";
import {
  getStarGuardianDaysRemaining, isStarGuardianActive,
  isMainDailyAvailable, isSecondaryDailyAvailable, isSpecialDailyAvailable,
} from "../utils/subscription";

interface Props {
  onClick: () => void;
  compact?: boolean;
}

export default function StarGuardianBadge({ onClick, compact = false }: Props) {
  const [active, setActive] = useState(isStarGuardianActive());
  const [days, setDays] = useState(getStarGuardianDaysRemaining());
  const [hasReward, setHasReward] = useState(
    isMainDailyAvailable() || isSecondaryDailyAvailable() || isSpecialDailyAvailable()
  );

  useEffect(() => {
    const t = setInterval(() => {
      setActive(isStarGuardianActive());
      setDays(getStarGuardianDaysRemaining());
      setHasReward(
        isMainDailyAvailable() || isSecondaryDailyAvailable() || isSpecialDailyAvailable()
      );
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!active) return null;

  return (
    <button
      onClick={onClick}
      title="Star Guardian — забрать ежедневные награды"
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
        animation: hasReward ? "starGuardianPulse 1.4s ease-in-out infinite" : undefined,
      }}
    >
      <span style={{ fontSize: compact ? 14 : 16 }}>⭐</span>
      <span style={{ letterSpacing: 0.6 }}>{compact ? `${days}д` : `STAR GUARDIAN ${days}д`}</span>
      {hasReward && (
        <span style={{
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
