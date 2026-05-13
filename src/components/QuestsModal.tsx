import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  getQuestPool,
  claimQuestReward,
} from "../utils/localStorageAPI";
import {
  timeUntilDaily, timeUntilWeekly,
  formatHmsShort, MAX_ACTIVE_QUESTS,
  type QuestPool, type QuestState,
} from "../utils/quests";
import ChestVisual from "./ChestVisual";
import RewardDropModal, { type RewardInfo } from "./RewardDropModal";

interface Props { onClose: () => void }

const DIFF_COLORS = ["#69F0AE", "#FFD740", "#FF7043"];
const DIFF_LABELS = ["Лёгкий", "Средний", "Сложный"];

function diffOf(q: QuestState): 0 | 1 | 2 {
  // rough estimate: easy if target ≤ small values
  if (q.isWeekly) return 2;
  if (q.target <= 3 || (q.kind.startsWith("play_") && q.target <= 3)) return 0;
  return 1;
}

function QuestCard({
  q, onClaim,
}: { q: QuestState; onClaim: (q: QuestState) => void }) {
  const pct = Math.min(100, Math.round((q.progress / q.target) * 100));
  const ready = q.progress >= q.target && !q.claimed;
  const diff = diffOf(q);
  return (
    <div style={{
      background: q.claimed ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
      border: `1.5px solid ${q.claimed ? "rgba(76,175,80,0.35)" : ready ? "#FFD700" : "rgba(255,255,255,0.12)"}`,
      borderRadius: 14,
      padding: "13px 15px",
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 12,
      alignItems: "center",
      opacity: q.claimed ? 0.5 : 1,
      boxShadow: ready ? "0 0 20px rgba(255,215,0,0.25)" : undefined,
      position: "relative",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      {/* weekly glow strip */}
      {q.isWeekly && !q.claimed && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14,
          background: "linear-gradient(135deg, rgba(138,43,226,0.08) 0%, transparent 60%)",
          pointerEvents: "none",
        }} />
      )}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          <span style={{
            fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "2px 7px",
            borderRadius: 6, background: `${DIFF_COLORS[diff]}22`,
            color: DIFF_COLORS[diff], border: `1px solid ${DIFF_COLORS[diff]}55`,
          }}>{DIFF_LABELS[diff]}</span>
          {q.isWeekly && (
            <span style={{
              fontSize: 10, fontWeight: 900, letterSpacing: 0.8, padding: "2px 7px",
              borderRadius: 6, background: "rgba(138,43,226,0.18)",
              color: "#CE93D8", border: "1px solid rgba(138,43,226,0.4)",
            }}>ЕЖЕНЕДЕЛЬНЫЙ</span>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: "white", marginBottom: 5, lineHeight: 1.35 }}>
          {q.description}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            flex: 1, height: 8, borderRadius: 4,
            background: "rgba(0,0,0,0.45)", overflow: "hidden", position: "relative",
          }}>
            <div style={{
              height: "100%", width: `${pct}%`,
              background: ready
                ? "linear-gradient(90deg, #FFD700, #FFAB40)"
                : q.isWeekly
                  ? "linear-gradient(90deg, #FFD700, #FF6E40)"
                  : "linear-gradient(90deg, #4DD0E1, #0097A7)",
              transition: "width 0.6s cubic-bezier(.2,.8,.2,1)",
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
                animation: "questFill 2.2s linear infinite",
              }} />
            </div>
          </div>
          <span style={{
            fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700,
            fontVariantNumeric: "tabular-nums", minWidth: 54, textAlign: "right",
          }}>
            {q.progress} / {q.target}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "#FFD700", fontWeight: 700 }}>
          🎁 {q.reward.label}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        {q.reward.type === "chest" && q.reward.chestRarity ? (
          <ChestVisual rarity={q.reward.chestRarity} size={50} animated={!q.claimed} />
        ) : null}
        <button
          onClick={() => onClaim(q)}
          disabled={!ready}
          style={{
            width: 90,
            background: q.claimed
              ? "rgba(76,175,80,0.2)"
              : ready
              ? "linear-gradient(135deg, #FF9800, #FFD700)"
              : "rgba(255,255,255,0.08)",
            border: "none", borderRadius: 9, padding: "7px 0",
            color: q.claimed ? "#69F0AE" : ready ? "#000" : "rgba(255,255,255,0.35)",
            fontSize: 11, fontWeight: 900, letterSpacing: 0.8,
            cursor: ready ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          {q.claimed ? "✓ ВЗЯТО" : ready ? "ЗАБРАТЬ" : "В ПРОЦЕССЕ"}
        </button>
      </div>
    </div>
  );
}

export default function QuestsModal({ onClose }: Props) {
  const [pool, setPool] = useState<QuestPool | null>(null);
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);
  const [tab, setTab] = useState<"daily" | "weekly" | "all">("all");

  useEffect(() => {
    setPool(getQuestPool());
    getCurrentProfile();
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!pool) return null;

  const allQuests = pool.activeQuests.filter(q => !q.claimed);
  const dailyQuests  = allQuests.filter(q => !q.isWeekly);
  const weeklyQuests = allQuests.filter(q => q.isWeekly);
  const activeCount  = allQuests.filter(q => !q.claimed).length;

  const tabQuests =
    tab === "daily"  ? dailyQuests  :
    tab === "weekly" ? weeklyQuests :
    allQuests;

  const nextDaily  = timeUntilDaily(pool);
  const nextWeekly = timeUntilWeekly(pool);

  const handleClaim = (q: QuestState) => {
    const r = claimQuestReward(q.id);
    setPool(getQuestPool());
    if (r.success) {
      setPendingReward({
        type: q.reward.type as RewardInfo["type"],
        amount: q.reward.amount,
        chestRarity: q.reward.chestRarity,
        label: q.reward.label,
      });
    } else {
      setMsg(r.error || "Ошибка");
      setTimeout(() => setMsg(null), 1800);
    }
  };

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { transform: scale(0.93); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes questFill {
          0%   { background-position: -100% 0; }
          100% { background-position:  200% 0; }
        }
        .quest-scroll::-webkit-scrollbar { width: 5px }
        .quest-scroll::-webkit-scrollbar-track { background: transparent }
        .quest-scroll::-webkit-scrollbar-thumb { background: rgba(255,215,0,0.35); border-radius: 10px }
      `}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(660px, 97vw)",
          maxHeight: "94vh",
          display: "flex", flexDirection: "column",
          background: "linear-gradient(180deg, #1a0a3a 0%, #060018 100%)",
          border: "2px solid #CE93D8",
          borderRadius: 22, padding: "20px 20px 16px",
          color: "white",
          boxShadow: "0 30px 80px rgba(0,0,0,0.75), 0 0 80px rgba(138,43,226,0.35)",
          animation: "pop 0.2s ease",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 14, right: 14,
            background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 10, padding: "5px 12px",
            color: "white", cursor: "pointer", fontWeight: 800, fontSize: 14, zIndex: 1,
          }}
        >✕</button>

        {/* ── Header ── */}
        <div style={{ marginBottom: 12, paddingRight: 36 }}>
          <div style={{
            fontSize: 24, fontWeight: 900, letterSpacing: 2,
            background: "linear-gradient(135deg, #FFD700, #CE93D8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            📋 КВЕСТЫ
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>
            Выполняйте задания за крутые награды. Квесты накапливаются (макс. {MAX_ACTIVE_QUESTS}).
          </div>
        </div>

        {/* ── Timer row ── */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{
            background: "rgba(77,208,225,0.1)", border: "1px solid rgba(77,208,225,0.4)",
            borderRadius: 9, padding: "5px 12px",
            color: "#4DD0E1", fontSize: 11, fontWeight: 800,
          }}>
            ☀️ Ежедневные через: {nextDaily > 0 ? formatHmsShort(nextDaily) : "СЕЙЧАС"}
          </div>
          <div style={{
            background: "rgba(138,43,226,0.12)", border: "1px solid rgba(138,43,226,0.4)",
            borderRadius: 9, padding: "5px 12px",
            color: "#CE93D8", fontSize: 11, fontWeight: 800,
          }}>
            🌙 Еженедельные через: {nextWeekly > 0 ? formatHmsShort(nextWeekly) : "СЕЙЧАС"}
          </div>
          <div style={{
            marginLeft: "auto",
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 9, padding: "5px 12px",
            color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 800,
          }}>
            {activeCount}/{MAX_ACTIVE_QUESTS} активных
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["all", "daily", "weekly"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 10, border: "none",
                background: tab === t
                  ? (t === "weekly" ? "linear-gradient(135deg,#7B2FBE,#CE93D8)" : "linear-gradient(135deg,#0097A7,#4DD0E1)")
                  : "rgba(255,255,255,0.07)",
                color: tab === t ? "white" : "rgba(255,255,255,0.5)",
                fontWeight: 900, fontSize: 12, letterSpacing: 0.8, cursor: "pointer",
              }}
            >
              {t === "all" ? `ВСЕ (${allQuests.length})` :
               t === "daily" ? `☀️ ДНЕВНЫЕ (${dailyQuests.length})` :
               `🌙 НЕДЕЛЬНЫЕ (${weeklyQuests.length})`}
            </button>
          ))}
        </div>

        {msg && (
          <div style={{
            marginBottom: 10, padding: "7px 14px",
            background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.4)",
            borderRadius: 9, color: "#FFD700", textAlign: "center",
            fontWeight: 700, fontSize: 13,
          }}>{msg}</div>
        )}

        {/* ── Quest list ── */}
        <div
          className="quest-scroll"
          style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}
        >
          {tabQuests.length === 0 ? (
            <div style={{
              textAlign: "center", color: "rgba(255,255,255,0.4)",
              padding: "40px 20px", fontSize: 14,
            }}>
              {tab === "daily"  ? "Нет активных дневных квестов" :
               tab === "weekly" ? "Нет активных еженедельных квестов" :
               "Нет квестов"}
            </div>
          ) : (
            tabQuests.map(q => (
              <QuestCard key={q.id} q={q} onClaim={handleClaim} />
            ))
          )}
        </div>
      </div>
    </div>

    {pendingReward && (
      <RewardDropModal
        reward={pendingReward}
        onDone={() => { setPendingReward(null); setPool(getQuestPool()); }}
      />
    )}
    </>
  );
}
