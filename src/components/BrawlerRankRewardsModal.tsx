import { useState, type ReactNode } from "react";
import { BRAWLERS } from "../entities/BrawlerData";
import {
  getCurrentProfile,
  getBrawlerTrophies,
  getBrawlerRank,
  getBrawlerRankClaimed,
  claimBrawlerRankReward,
  BRAWLER_RANK_TABLE,
  MAX_BRAWLER_RANK,
} from "../utils/localStorageAPI";
import { CoinIcon, GemIcon, PowerIcon, TrophyIcon } from "./GameIcons";
import RewardDropModal, { type RewardInfo } from "./RewardDropModal";

interface Props {
  brawlerId: string;
  onClose: () => void;
}

const rewardIcon = (type: string): ReactNode =>
  type === "coins" ? <CoinIcon size={22} /> :
  type === "gems" ? <GemIcon size={22} /> :
  type === "powerPoints" ? <PowerIcon size={22} /> : "🎁";

export default function BrawlerRankRewardsModal({ brawlerId, onClose }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [msg, setMsg] = useState("");
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);
  if (!profile) return null;
  const brawler = BRAWLERS.find(b => b.id === brawlerId) || BRAWLERS[0];
  const trophies = getBrawlerTrophies(profile, brawler.id);
  const rank = getBrawlerRank(trophies);
  const claimedSet = new Set(getBrawlerRankClaimed(profile, brawler.id));
  const level = profile.brawlerLevels[brawler.id] || 1;

  const handleClaim = (r: number) => {
    const result = claimBrawlerRankReward(brawler.id, r);
    setProfile(getCurrentProfile());
    if (result.success && result.reward) {
      setPendingReward({
        type: result.reward.type as RewardInfo["type"],
        amount: result.reward.amount,
        label: result.reward.label,
      });
    } else {
      setMsg(result.error || "Не удалось получить");
      setTimeout(() => setMsg(""), 2500);
    }
  };

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)",
          maxHeight: "min(80vh, 720px)",
          background: "linear-gradient(135deg, #0f0050, #1a0078)",
          border: "1px solid rgba(255,215,0,0.4)",
          borderRadius: 18,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 18px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: brawler.color }}>{brawler.name} — Награды за ранги</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>
              <TrophyIcon size={14} style={{ verticalAlign: "middle" }} /> {trophies} кубков • Ранг {rank} / {MAX_BRAWLER_RANK} • ⚡ Сила {level}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", cursor: "pointer", fontWeight: 700 }}
          >Закрыть</button>
        </div>
        {msg && (
          <div style={{
            padding: "8px 22px",
            background: "rgba(76,175,80,0.15)",
            color: "#A5D6A7",
            fontSize: 12, fontWeight: 700,
            borderBottom: "1px solid rgba(76,175,80,0.3)",
          }}>{msg}</div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
          {BRAWLER_RANK_TABLE.map((row) => {
            const reached = trophies >= row.trophies;
            const claimed = claimedSet.has(row.rank);
            const canClaim = reached && !claimed;
            return (
              <div
                key={row.rank}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  marginBottom: 6,
                  borderRadius: 10,
                  background: claimed
                    ? "rgba(76,175,80,0.10)"
                    : canClaim
                      ? "rgba(255,215,0,0.12)"
                      : "rgba(255,255,255,0.04)",
                  border: `1px solid ${claimed ? "rgba(76,175,80,0.35)" : canClaim ? "rgba(255,215,0,0.5)" : "rgba(255,255,255,0.06)"}`,
                  opacity: reached || canClaim ? 1 : 0.55,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: "rgba(0,0,0,0.35)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 800, color: "#FFD700",
                }}>{row.rank}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "white", display: "flex", alignItems: "center", gap: 5 }}>
                    {rewardIcon(row.type)} {row.label}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", gap: 4 }}>
                    <TrophyIcon size={12} /> {row.trophies} кубков
                  </div>
                </div>
                {claimed ? (
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#A5D6A7", letterSpacing: 1 }}>ПОЛУЧЕНО</div>
                ) : (
                  <button
                    disabled={!canClaim}
                    onClick={() => handleClaim(row.rank)}
                    style={{
                      background: canClaim ? "linear-gradient(135deg, #F9A825, #FFD700)" : "rgba(255,255,255,0.08)",
                      border: "none",
                      borderRadius: 8,
                      padding: "7px 14px",
                      color: canClaim ? "#000" : "rgba(255,255,255,0.4)",
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: canClaim ? "pointer" : "not-allowed",
                      letterSpacing: 1,
                    }}
                  >{canClaim ? "ЗАБРАТЬ" : "ЗАБЛОКИРОВАНО"}</button>
                )}
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
