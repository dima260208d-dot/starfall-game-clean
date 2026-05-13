import { useEffect, useState } from "react";
import {
  getCurrentProfile,
  canClaimDailyLadder,
  dailyLadderTimeLeft,
  claimDailyLadderReward,
} from "../utils/localStorageAPI";
import { getRewardForDay, type DailyReward } from "../utils/dailyLadder";
import { formatHmsShort } from "../utils/quests";
import ChestVisual from "./ChestVisual";
import RewardDropModal, { type RewardInfo } from "./RewardDropModal";

interface Props {
  onClose: () => void;
}

export default function DailyRewardModal({ onClose }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [, setTick] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!profile) return null;
  const canClaim = canClaimDailyLadder(profile);
  const left = dailyLadderTimeLeft(profile);
  const todayDay = profile.dailyLadderDay;

  const todayReward = getRewardForDay(todayDay);
  const upcoming: { day: number; reward: DailyReward }[] = [];
  for (let i = 1; i <= 5; i++) {
    upcoming.push({ day: todayDay + i, reward: getRewardForDay(todayDay + i) });
  }

  const handleClaim = () => {
    const r = claimDailyLadderReward();
    setProfile(getCurrentProfile());
    if (r.success && r.reward) {
      setPendingReward({
        type: r.reward.type as RewardInfo["type"],
        amount: r.reward.amount,
        chestRarity: r.reward.chestRarity,
        label: r.reward.label,
      });
    } else {
      setMsg(r.error || "Ошибка");
      setTimeout(() => setMsg(null), 2200);
    }
  };

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { transform: scale(0.94); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes bonusGlow {
          0%, 100% { box-shadow: 0 0 25px rgba(255,215,0,0.4); }
          50%      { box-shadow: 0 0 55px rgba(255,215,0,0.85); }
        }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #1a0a3a 0%, #050020 100%)",
          border: "2px solid #FFD700",
          borderRadius: 22,
          padding: 24,
          color: "white",
          boxShadow: "0 30px 80px rgba(0,0,0,0.7), 0 0 80px rgba(255,215,0,0.4)",
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
            borderRadius: 10, padding: "5px 11px",
            color: "white", cursor: "pointer", fontWeight: 800, fontSize: 14,
          }}
        >✕</button>

        <div style={{
          fontSize: 26, fontWeight: 900, letterSpacing: 2,
          background: "linear-gradient(135deg, #FFD700, #FF8A00)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          marginBottom: 4,
        }}>
          🎁 ЕЖЕДНЕВНЫЕ ПРИЗЫ
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>
          Заходите каждый день и забирайте награды по нарастающей.
        </div>

        {/* Today block */}
        <div style={{
          background: `linear-gradient(135deg, ${todayReward.color}33, rgba(0,0,0,0.4))`,
          border: `2px solid ${canClaim ? "#FFD700" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 18,
          padding: 18,
          display: "grid",
          gridTemplateColumns: "120px 1fr 150px",
          gap: 16, alignItems: "center",
          animation: canClaim ? "bonusGlow 2s ease-in-out infinite" : undefined,
        }}>
          <div style={{ display: "flex", justifyContent: "center" }}>
            {todayReward.type === "chest" && todayReward.chestRarity ? (
              <ChestVisual rarity={todayReward.chestRarity} size={100} animated />
            ) : (
              <div style={{
                fontSize: 64, lineHeight: 1,
                filter: `drop-shadow(0 6px 18px ${todayReward.color}88)`,
              }}>
                {todayReward.icon}
              </div>
            )}
          </div>
          <div>
            <div style={{
              fontSize: 11, color: canClaim ? "#FFD700" : "rgba(255,255,255,0.5)",
              fontWeight: 800, letterSpacing: 2, marginBottom: 4,
            }}>
              {canClaim ? "✦ СЕГОДНЯ — НАГРАДА ЖДЁТ" : "СЕГОДНЯ"}  · ДЕНЬ {todayDay}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: todayReward.color, lineHeight: 1.1 }}>
              {todayReward.label}
            </div>
            {!canClaim && (
              <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Следующая награда через <span style={{ color: "#FFD700", fontWeight: 700 }}>{formatHmsShort(left)}</span>
              </div>
            )}
          </div>
          <button
            onClick={handleClaim}
            disabled={!canClaim}
            style={{
              background: canClaim
                ? "linear-gradient(135deg, #FF9800, #FFD700)"
                : "rgba(255,255,255,0.06)",
              border: "none", borderRadius: 12,
              padding: "12px 0",
              color: canClaim ? "#000" : "rgba(255,255,255,0.4)",
              fontWeight: 900, fontSize: 13, letterSpacing: 2,
              cursor: canClaim ? "pointer" : "default",
            }}
          >
            {canClaim ? "ЗАБРАТЬ" : "ПОЛУЧЕНО"}
          </button>
        </div>

        {msg && (
          <div style={{
            margin: "12px 0 0", padding: "8px 14px",
            background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.4)",
            borderRadius: 10, color: "#FFD700", textAlign: "center",
            fontWeight: 700, fontSize: 13,
          }}>{msg}</div>
        )}

        {/* Upcoming 5 days */}
        <div style={{ marginTop: 22, fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 2, fontWeight: 800 }}>
          СЛЕДУЮЩИЕ 5 ДНЕЙ
        </div>
        <div style={{
          marginTop: 10,
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 10,
        }}>
          {upcoming.map(({ day, reward }, i) => (
            <div key={day} style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${reward.color}44`,
              borderRadius: 12, padding: "10px 8px",
              textAlign: "center",
              opacity: 1 - i * 0.08,
            }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 1, fontWeight: 800 }}>
                +{i + 1} ДН.
              </div>
              <div style={{
                fontSize: 11, color: reward.color, fontWeight: 700, marginTop: 2,
              }}>
                ДЕНЬ {((day - 1) % 30) + 1}
              </div>
              <div style={{
                margin: "8px auto 6px", height: 60,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {reward.type === "chest" && reward.chestRarity ? (
                  <ChestVisual rarity={reward.chestRarity} size={50} animated={false} />
                ) : (
                  <div style={{ fontSize: 32, filter: `drop-shadow(0 2px 6px ${reward.color}88)` }}>
                    {reward.icon}
                  </div>
                )}
              </div>
              <div style={{
                fontSize: 11, color: reward.color, fontWeight: 800, lineHeight: 1.2,
              }}>
                {reward.label.replace("кристаллов", "крист.").replace("очков прокачки", "ОП").replace("опыта Star Pass", "опыта")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {pendingReward && (
      <RewardDropModal
        reward={pendingReward}
        onDone={() => setPendingReward(null)}
      />
    )}
    </>
  );
}
