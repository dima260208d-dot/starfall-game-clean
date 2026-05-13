import { useEffect, useState } from "react";
import type { BattleSnapshot } from "../ai/AstralAssistant";
import { generateBattleTip } from "../ai/AstralAssistant";
import { getAstralSettings, isStarGuardianActive } from "../utils/subscription";

interface Props {
  /** A function that returns the live snapshot (or null while not playing). */
  getSnapshot: () => BattleSnapshot | null;
}

interface Tip { text: string; appearedAt: number }

const TIP_HOLD_MS = 12000;
const POLL_MS = 900;
const COOLDOWN_BETWEEN_TIPS_MS = 6500;

export default function AstralBattleTip({ getSnapshot }: Props) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [enabled, setEnabled] = useState(isStarGuardianActive() && getAstralSettings().battleTipsEnabled);

  useEffect(() => {
    const settingsTimer = setInterval(() => {
      setEnabled(isStarGuardianActive() && getAstralSettings().battleTipsEnabled);
    }, 1500);
    return () => clearInterval(settingsTimer);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let lastEmitted = 0;
    let lastText = "";
    const id = setInterval(() => {
      const now = performance.now();
      if (now - lastEmitted < COOLDOWN_BETWEEN_TIPS_MS) return;
      const snap = getSnapshot();
      if (!snap) return;
      const t = generateBattleTip(snap);
      if (!t) return;
      if (t === lastText) return;
      lastEmitted = now;
      lastText = t;
      setTip({ text: t, appearedAt: Date.now() });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [enabled, getSnapshot]);

  // Auto-dismiss after TIP_HOLD_MS
  useEffect(() => {
    if (!tip) return;
    const id = setTimeout(() => setTip(null), TIP_HOLD_MS);
    return () => clearTimeout(id);
  }, [tip]);

  if (!enabled || !tip) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 14, left: 14,
        zIndex: 12,
        maxWidth: 320,
        background: "linear-gradient(135deg, rgba(74,20,140,0.92), rgba(26,0,51,0.92))",
        border: "1.5px solid #CE93D8",
        borderRadius: 14,
        boxShadow: "0 0 22px rgba(206,147,216,0.45)",
        color: "white",
        padding: "8px 12px 8px 8px",
        display: "flex", alignItems: "center", gap: 10,
        animation: "astralTipIn 240ms ease-out",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        pointerEvents: "none",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: "radial-gradient(circle at 35% 30%, #B388FF, #4A148C)",
        border: "2px solid #FFD740", display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 20,
      }}>✨</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#FFD740", letterSpacing: 1 }}>АСТРАЛ</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{tip.text}</div>
      </div>
      <style>{`
        @keyframes astralTipIn {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  );
}
