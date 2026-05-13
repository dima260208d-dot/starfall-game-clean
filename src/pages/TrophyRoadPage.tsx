import { useState } from "react";
import {
  getCurrentProfile,
  TROPHY_ROAD,
  claimTrophyRoadReward,
  MAX_TROPHIES,
} from "../utils/localStorageAPI";
import ChestVisual from "../components/ChestVisual";
import { CHESTS } from "../utils/chests";
import { TrophyIcon, CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import RewardDropModal, { type RewardInfo } from "../components/RewardDropModal";

interface Props {
  onBack: () => void;
}

export default function TrophyRoadPage({ onBack }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [msg, setMsg] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);
  if (!profile) return null;
  const refresh = () => setProfile(getCurrentProfile());

  const handleClaim = (idx: number) => {
    const r = claimTrophyRoadReward(idx);
    refresh();
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
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #003566 0%, #0353A4 50%, #1E88E5 100%)",
      padding: "30px 20px",
      color: "white",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      position: "relative",
    }}>
      <button onClick={onBack} style={backBtn}>← Назад</button>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{
          fontSize: 36, fontWeight: 900, margin: 0, textAlign: "center",
          background: "linear-gradient(135deg, #FFD700, #FFAB40)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          <TrophyIcon size={36} style={{ verticalAlign: "middle", marginRight: 8, marginBottom: 4 }} /> Трофейная дорога
        </h1>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
          Текущие кубки: <span style={{ color: "#FFD700", fontWeight: 800 }}>{profile.trophies}</span> / {MAX_TROPHIES}
        </p>

        {msg && (
          <div style={{ marginTop: 12, color: "#FFD700", fontWeight: 700, textAlign: "center" }}>{msg}</div>
        )}

        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          {TROPHY_ROAD.map((reward, idx) => {
            const reached = profile.trophies >= reward.trophies;
            const claimed = profile.trophyRoadClaimed.includes(reward.trophies);
            const isChest = reward.type === "chest" && reward.chestRarity;
            const chestColor = isChest ? CHESTS[reward.chestRarity!].color : "#FFD700";
            const TierIcon = reward.type === "gems" ? GemIcon : reward.type === "powerPoints" ? PowerIcon : CoinIcon;
            const tierColor = reward.type === "gems" ? "#40C4FF" : reward.type === "powerPoints" ? "#CE93D8" : reward.type === "chest" ? chestColor : "#FFD700";
            const progress = Math.min(100, Math.round((profile.trophies / reward.trophies) * 100));
            return (
              <div key={idx} style={{
                background: isChest ? `${chestColor}11` : "rgba(255,255,255,0.05)",
                border: `1.5px solid ${reached ? tierColor + (isChest ? "AA" : "55") : "rgba(255,255,255,0.08)"}`,
                borderRadius: 14, padding: 16,
                display: "grid", gridTemplateColumns: "100px 1fr 160px", gap: 16, alignItems: "center",
                opacity: reached ? 1 : 0.7,
                boxShadow: isChest && reached ? `0 0 25px ${chestColor}55` : undefined,
              }}>
                <div style={{ textAlign: "center" }}>
                  <TrophyIcon size={18} style={{ opacity: 0.55 }} />
                  <div style={{ fontSize: 22, fontWeight: 800, color: "#FFD700" }}>{reward.trophies}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {isChest && (
                    <ChestVisual rarity={reward.chestRarity!} size={56} animated={reached} />
                  )}
                  <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: tierColor, display: "flex", alignItems: "center", gap: 6 }}>
                    {!isChest && <TierIcon size={18} />} {reward.label}
                  </div>
                  <div style={{
                    marginTop: 8, height: 8, borderRadius: 4,
                    background: "rgba(0,0,0,0.4)", overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", width: `${progress}%`,
                      background: `linear-gradient(90deg, ${tierColor}, #FFD700)`,
                    }} />
                  </div>
                  </div>
                </div>
                <button
                  onClick={() => handleClaim(idx)}
                  disabled={!reached || claimed}
                  style={{
                    background: claimed ? "rgba(255,255,255,0.05)" : reached ? "linear-gradient(135deg, #2E7D32, #69F0AE)" : "rgba(255,255,255,0.04)",
                    border: "none", borderRadius: 10, padding: "10px 0",
                    color: claimed ? "rgba(255,255,255,0.4)" : "white",
                    fontSize: 13, fontWeight: 700,
                    cursor: reached && !claimed ? "pointer" : "default",
                  }}
                >
                  {claimed ? "✓ ПОЛУЧЕНО" : reached ? "ЗАБРАТЬ" : "🔒 ЗАБЛОКИРОВАНО"}
                </button>
              </div>
            );
          })}
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

const backBtn: React.CSSProperties = {
  position: "absolute", top: 20, left: 20,
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "8px 18px", color: "rgba(255,255,255,0.7)",
  cursor: "pointer", fontSize: 14, fontWeight: 600,
};
