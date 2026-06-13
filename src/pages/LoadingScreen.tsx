import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

interface Props {
  onDone: () => void;
  duration?: number;
  label?: string;
  progress?: number;
  /** Если false — только фон и шапка, без полосы и процентов (например первый запуск). */
  showProgressBar?: boolean;
}

export default function LoadingScreen({
  onDone,
  duration,
  label,
  progress: externalProgress,
  showProgressBar = true,
}: Props) {
  const { t } = useI18n();
  const displayLabel = label ?? t("loading.default");
  const hasExternal = externalProgress !== undefined;
  const minDuration = duration ?? (hasExternal ? 1500 : 4500);
  const [timerProgress, setTimerProgress] = useState(0);
  const startRef = useRef(performance.now());
  const doneCalledRef = useRef(false);

  useEffect(() => {
    startRef.current = performance.now();
    doneCalledRef.current = false;
    if (!hasExternal) {
      let raf = 0;
      const tick = (t: number) => {
        const p = Math.min(1, (t - startRef.current) / minDuration);
        setTimerProgress(p);
        if (p < 1) { raf = requestAnimationFrame(tick); }
        else if (!doneCalledRef.current) { doneCalledRef.current = true; setTimeout(onDone, 150); }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }
    const timer = setTimeout(() => setTimerProgress(1), minDuration);
    return () => clearTimeout(timer);
  }, [hasExternal, minDuration, onDone]);

  useEffect(() => {
    if (!hasExternal) return;
    if ((externalProgress ?? 0) >= 1 && timerProgress >= 1 && !doneCalledRef.current) {
      doneCalledRef.current = true;
      setTimeout(onDone, 300);
    }
  }, [hasExternal, externalProgress, timerProgress, onDone]);

  const displayProgress = hasExternal ? (externalProgress ?? 0) : timerProgress;
  const percent = Math.floor(displayProgress * 100);
  const base = (import.meta as any).env?.BASE_URL ?? "/";

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#06031a",
      overflow: "hidden", zIndex: 1000,
      fontFamily: "var(--app-font-sans)",
    }}>
      {/* Battle scene — full-screen generated artwork */}
      <img
        src={`${base}loading-battle.png`}
        alt=""
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      {/* Subtle dark vignette so UI elements stay readable */}
      <div style={{
        position: "absolute", inset: 0,
        background: [
          "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 20%, transparent 65%, rgba(0,0,10,0.88) 100%)",
          "linear-gradient(90deg,  rgba(0,0,0,0.2)  0%, transparent 15%, transparent 85%, rgba(0,0,0,0.2)  100%)",
        ].join(", "),
        pointerEvents: "none",
      }} />

      {/* STARFALL — top-right, bare glowing text only */}
      <div style={{
        position: "absolute", top: 28, right: 32, zIndex: 5,
        lineHeight: 1, userSelect: "none", textAlign: "right",
      }}>
        <div style={{
          fontSize: 52, fontWeight: 900, letterSpacing: 6, color: "white",
          textShadow: [
            "0 0 22px rgba(255,210,0,0.95)",
            "0 0 60px rgba(200,80,255,0.75)",
            "0 3px 0 rgba(0,0,0,1)",
            "0 5px 20px rgba(0,0,0,0.95)",
          ].join(", "),
          animation: "titleGlow 2.6s ease-in-out infinite alternate",
        }}>
          STARFALL
        </div>
        <div style={{
          fontSize: 12, letterSpacing: 7, color: "rgba(255,225,100,0.9)",
          marginTop: 4, textShadow: "0 0 12px rgba(255,200,0,0.8)", fontWeight: 700,
        }}>
          BATTLE ARENA
        </div>
      </div>

      {/* Progress bar — bottom center (optional) */}
      {showProgressBar && (
        <div style={{
          position: "absolute", left: "50%", bottom: 36,
          transform: "translateX(-50%)",
          width: "min(620px, 80vw)", textAlign: "center", zIndex: 5,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12,
          }}>
            <span style={{ fontSize: 13, letterSpacing: 5, color: "rgba(255,255,255,0.88)", fontWeight: 800 }}>
              {displayLabel}
            </span>
            <span style={{
              fontSize: 32, fontWeight: 900,
              background: "linear-gradient(135deg, #ffe57f 0%, #ffb300 35%, #d500f9 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              letterSpacing: "0.06em", fontVariantNumeric: "tabular-nums",
              filter: "drop-shadow(0 4px 18px rgba(213,0,249,0.5))",
            }}>
              {percent}%
            </span>
          </div>
          <div style={{
            width: "100%", height: 24, borderRadius: 999,
            background: "rgba(10,4,25,0.85)", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.32)",
            boxShadow: "0 0 28px rgba(123,47,190,0.55), inset 0 2px 10px rgba(0,0,0,0.85)",
          }}>
            <div style={{
              width: `${percent}%`, height: "100%",
              background: "linear-gradient(90deg, #7B2FBE 0%, #d500f9 50%, #ffd54f 100%)",
              boxShadow: "0 0 24px rgba(255,213,79,0.85)",
              position: "relative",
              transition: hasExternal ? "width 0.3s ease" : undefined,
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)",
                animation: "shimmer 1.4s linear infinite",
              }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes titleGlow {
          0%   { text-shadow: 0 0 18px rgba(255,210,0,0.85), 0 0 50px rgba(200,80,255,0.55), 0 3px 0 #000, 0 5px 20px rgba(0,0,0,0.95); }
          100% { text-shadow: 0 0 34px rgba(255,225,0,1),    0 0 80px rgba(220,100,255,0.9), 0 3px 0 #000, 0 5px 20px rgba(0,0,0,0.95); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
