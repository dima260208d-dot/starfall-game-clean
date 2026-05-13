import { useState, useEffect } from "react";
import AstralChatModal from "./AstralChatModal";
import { getAstralSettings, isStarGuardianActive } from "../utils/subscription";

interface Props {
  size?: number;
  /** Optional custom positioning — if omitted floats top-left of menu. */
  style?: React.CSSProperties;
}

export default function AstralFloatingIcon({ size = 56, style }: Props) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(getAstralSettings());
  const [active, setActive] = useState(isStarGuardianActive());

  useEffect(() => {
    const t = setInterval(() => {
      setSettings(getAstralSettings());
      setActive(isStarGuardianActive());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  if (!settings.enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Открыть чат с Астралом"
        style={{
          position: "absolute",
          top: 80,
          left: 16,
          width: size, height: size,
          borderRadius: "50%",
          background: "radial-gradient(circle at 35% 30%, #B388FF, #4A148C 70%, #1A0033)",
          border: `2px solid ${active ? "#FFD740" : "rgba(206,147,216,0.7)"}`,
          boxShadow: active
            ? "0 0 24px rgba(255,215,64,0.65), 0 0 6px rgba(255,255,255,0.4) inset"
            : "0 0 18px rgba(206,147,216,0.55)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.5,
          color: "white",
          zIndex: 6,
          animation: "astralPulse 2.5s ease-in-out infinite",
          ...style,
        }}
      >
        <span style={{ filter: "drop-shadow(0 0 4px white)" }}>✨</span>
        <style>{`
          @keyframes astralPulse {
            0%,100% { transform: scale(1); }
            50%     { transform: scale(1.06); }
          }
        `}</style>
      </button>
      {open && <AstralChatModal onClose={() => setOpen(false)} />}
    </>
  );
}
