import { useMemo, useState } from "react";
import {
  getCurrentProfile,
  clashPassXpForLevel,
  clashPassRewardForLevel,
  paidClashPassRewardForLevel,
  claimClashPassReward,
  claimPaidClashPassReward,
  buyClashPass,
  buyXp,
  getClaimableQuestCount,
  getQuestPool,
  MAX_CLASHPASS_LEVEL,
  CLASH_PASS_PRICE_RUB,
  type ClashPassReward,
} from "../utils/localStorageAPI";
import QuestsModal from "../components/QuestsModal";
import ChestVisual from "../components/ChestVisual";
import { CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import RewardDropModal, { type RewardInfo } from "../components/RewardDropModal";

interface Props {
  onBack: () => void;
}

const XP_BUNDLES = [
  { xp: 200, gems: 10 },
  { xp: 600, gems: 25 },
  { xp: 1500, gems: 50 },
];

// ── Visual helpers for a reward (icon + color) ───────────────────────────────
function rewardColor(r: ClashPassReward): string {
  if (r.type === "gems") return "#40C4FF";
  if (r.type === "powerPoints") return "#CE93D8";
  if (r.type === "chest") return "#FF7043";
  return "#FFD700";
}
function RewardIcon({ r, size = 36, animated = false }: { r: ClashPassReward; size?: number; animated?: boolean }) {
  if (r.type === "chest" && r.chestRarity) {
    return <ChestVisual rarity={r.chestRarity} size={size + 16} animated={animated} />;
  }
  if (r.type === "gems") return <GemIcon size={size} />;
  if (r.type === "powerPoints") return <PowerIcon size={size} />;
  return <CoinIcon size={size} />;
}

// ── Single reward "tile" used on either side of the row ──────────────────────
function RewardTile({
  reward,
  reached,
  claimed,
  locked,
  premium,
  onClaim,
}: {
  reward: ClashPassReward;
  reached: boolean;
  claimed: boolean;
  locked: boolean;        // true = paid pass not bought yet
  premium: boolean;       // true = right (paid) side, used for visual styling
  onClaim: () => void;
}) {
  const color = rewardColor(reward);
  const ringColor = premium ? "#FFD700" : "rgba(255,255,255,0.18)";
  const bg = premium
    ? "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(184,134,11,0.18))"
    : "rgba(255,255,255,0.05)";
  const canClaim = reached && !claimed && !locked;
  return (
    <div style={{
      position: "relative",
      background: reached ? bg : "rgba(255,255,255,0.03)",
      border: `1.5px solid ${reached ? (premium ? "#FFD700" : color + "55") : "rgba(255,255,255,0.08)"}`,
      borderRadius: 14,
      padding: "10px 12px",
      display: "flex",
      alignItems: "center",
      gap: 12,
      opacity: reached ? 1 : 0.55,
      boxShadow: undefined,
      minHeight: 78,
      flexDirection: premium ? "row-reverse" : "row",
    }}>
      <div style={{ width: 56, display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0 }}>
        <RewardIcon r={reward} size={36} animated={false} />
      </div>
      <div style={{ flex: 1, minWidth: 0, textAlign: premium ? "right" : "left" }}>
        <div style={{
          fontSize: 11, color: premium ? "#FFD700" : "rgba(255,255,255,0.55)",
          letterSpacing: 1, fontWeight: 800, marginBottom: 2,
        }}>
          {premium ? "★ STAR PASS" : "БЕСПЛАТНО"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color, lineHeight: 1.2 }}>
          {reward.type === "chest" ? reward.label : reward.label}
        </div>
        <button
          onClick={onClaim}
          disabled={!canClaim}
          style={{
            marginTop: 6,
            background: claimed
              ? "rgba(255,255,255,0.05)"
              : canClaim
                ? (premium
                    ? "linear-gradient(135deg, #FFD700, #FF8A00)"
                    : "linear-gradient(135deg, #2E7D32, #69F0AE)")
                : "rgba(255,255,255,0.04)",
            color: claimed ? "rgba(255,255,255,0.4)" : (premium && canClaim ? "#1a0a3a" : "white"),
            border: "none", borderRadius: 8, padding: "4px 14px",
            fontSize: 11, fontWeight: 800, letterSpacing: 0.5,
            cursor: canClaim ? "pointer" : "default",
            width: "100%",
          }}
        >
          {claimed ? "✓ ПОЛУЧЕНО" : locked ? "🔒" : reached ? "ЗАБРАТЬ" : "🔒"}
        </button>
      </div>

      {/* Lock overlay covering the whole tile when paid pass not bought */}
      {locked && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14,
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, color: "#FFD700",
          textShadow: "0 2px 6px rgba(0,0,0,0.7)",
          pointerEvents: "none",
        }}>
          🔒
        </div>
      )}
    </div>
  );
}

export default function ClashPassPage({ onBack }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [msg, setMsg] = useState<string | null>(null);
  const [showQuests, setShowQuests] = useState(false);
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);
  const refresh = () => setProfile(getCurrentProfile());
  if (!profile) return null;
  const pool = getQuestPool();
  const questClaimBadge = getClaimableQuestCount({ ...profile, questPool: pool ?? profile.questPool });

  const hasPaid = !!profile.clashPassPaid;
  const claimedFree = profile.clashPassClaimed;
  const claimedPaid = profile.clashPassClaimedPaid || [];
  const passLevels = useMemo(
    () => Array.from({ length: MAX_CLASHPASS_LEVEL }, (_, i) => i + 1),
    [],
  );

  const levelXpNeed = clashPassXpForLevel(profile.clashPassLevel);
  const xpProgress = profile.clashPassLevel >= MAX_CLASHPASS_LEVEL
    ? 100
    : Math.min(100, Math.round((profile.xp / levelXpNeed) * 100));

  // Vertical center-bar fill: % of MAX levels currently completed.
  const verticalFillPct = Math.min(100, ((profile.clashPassLevel - 1) / (MAX_CLASHPASS_LEVEL - 1)) * 100);

  const handleClaimFree = (lvl: number) => {
    const r = claimClashPassReward(lvl);
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

  const handleClaimPaid = (lvl: number) => {
    const r = claimPaidClashPassReward(lvl);
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

  const handleBuyXp = (xp: number, gems: number) => {
    const r = buyXp(xp, gems);
    setMsg(r.success ? `+${xp} опыта` : (r.error || "Ошибка"));
    refresh();
    setTimeout(() => setMsg(null), 2200);
  };

  const handleBuyPass = () => {
    const r = buyClashPass();
    refresh();
    setMsg(r.success ? "Star Pass успешно приобретён!" : (r.error || "Ошибка"));
    setTimeout(() => setMsg(null), 2600);
  };

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #3D0814 0%, #8B0000 50%, #B8860B 100%)",
      padding: "30px 20px",
      color: "white",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      position: "relative",
    }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }} />
      <button onClick={onBack} style={backBtn}>← Назад</button>
      <button
        onClick={() => setShowQuests(true)}
        style={{
          position: "absolute", top: 20, right: 20,
          background: "linear-gradient(135deg, #FFD700, #FF8A00)",
          border: "none", borderRadius: 12, padding: "9px 18px",
          color: "#1a0a3a", cursor: "pointer", fontSize: 14, fontWeight: 900,
          letterSpacing: 1.5, boxShadow: "0 4px 18px rgba(255,215,0,0.4)",
          display: "flex", alignItems: "center", gap: 8,
          zIndex: 5,
        }}
      >
        📋 КВЕСТЫ
        {questClaimBadge > 0 && (
          <span style={{
            minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10,
            background: "linear-gradient(135deg, #FF1744, #D50000)",
            color: "white", fontSize: 11, fontWeight: 900,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 10px rgba(255,23,68,0.7)",
          }}>
            {questClaimBadge > 99 ? "99+" : questClaimBadge}
          </span>
        )}
      </button>
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <h1 style={{
          fontSize: 36, fontWeight: 900, margin: 0, textAlign: "center",
          background: "linear-gradient(135deg, #FFD700, #FF8A00)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Star Pass
        </h1>
        <p style={{ textAlign: "center", color: "rgba(255,255,255,0.55)", marginTop: 6 }}>
          Выполняйте задания, прокачивайте уровень и забирайте награды на двух дорожках.
        </p>

        {/* Progress card */}
        <div style={{ ...card, marginTop: 20, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#FFD700" }}>Уровень {profile.clashPassLevel}</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 4 }}>
                {profile.clashPassLevel >= MAX_CLASHPASS_LEVEL
                  ? "Максимальный уровень!"
                  : `${profile.xp} / ${levelXpNeed} опыта до следующего уровня`}
              </div>
            </div>
            <div style={{ color: "#40C4FF", fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
              <GemIcon size={22} /> {profile.gems}
            </div>
          </div>
          <div style={{
            marginTop: 14, height: 14, borderRadius: 7,
            background: "rgba(0,0,0,0.4)", overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{
              height: "100%", width: `${xpProgress}%`,
              background: "linear-gradient(90deg, #FFD700, #FF8A00)",
              transition: "width 0.4s",
            }} />
          </div>

          {/* XP shop */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1 }}>
              КУПИТЬ ОПЫТ ЗА КРИСТАЛЛЫ
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {XP_BUNDLES.map(b => (
                <button
                  key={b.xp}
                  onClick={() => handleBuyXp(b.xp, b.gems)}
                  disabled={profile.gems < b.gems}
                  style={{
                    flex: 1, minWidth: 140,
                    background: profile.gems >= b.gems ? "linear-gradient(135deg, #8B0000, #DC2F02)" : "rgba(255,255,255,0.04)",
                    border: "none", borderRadius: 12, padding: "12px 14px",
                    color: "white", cursor: profile.gems >= b.gems ? "pointer" : "not-allowed",
                    fontWeight: 700, opacity: profile.gems >= b.gems ? 1 : 0.4,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    +{b.xp} ⭐ <span style={{ opacity: 0.8 }}>за</span> <GemIcon size={16} /> {b.gems}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {msg && (
            <div style={{ marginTop: 12, color: "#FFD700", fontWeight: 700, textAlign: "center" }}>{msg}</div>
          )}
        </div>

        {/* Buy banner — only when paid pass NOT yet purchased */}
        {!hasPaid && (
          <div style={{
            marginTop: 18,
            padding: "18px 22px",
            borderRadius: 18,
            background: "linear-gradient(135deg, #B8860B 0%, #FFD700 50%, #FF8A00 100%)",
            color: "#1a0a3a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            border: "2px solid rgba(255,255,255,0.3)",
          }}>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 0.5 }}>
                ★ ПРЕМИУМ STAR PASS
              </div>
              <div style={{ fontSize: 13, marginTop: 4, opacity: 0.85 }}>
                Все награды в 2 раза больше, ускорители прогрессии,
                премиум-сундуки и больше кристаллов на каждом уровне.
                После покупки доступны награды за уже пройденные уровни.
              </div>
            </div>
            <button
              onClick={handleBuyPass}
              style={{
                background: "#1a0a3a",
                color: "#FFD700",
                padding: "14px 26px",
                borderRadius: 12,
                border: "none",
                fontWeight: 900,
                fontSize: 17,
                letterSpacing: 0.5,
                cursor: "pointer",
                animation: "none",
              }}
            >
              Купить за {CLASH_PASS_PRICE_RUB}₽
            </button>
          </div>
        )}
        {hasPaid && (
          <div style={{
            marginTop: 18, padding: "12px 18px", borderRadius: 14,
            background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(255,138,0,0.18))",
            border: "1.5px solid #FFD700",
            color: "#FFD700", fontWeight: 900, textAlign: "center", letterSpacing: 0.5,
          }}>
            ★ STAR PASS АКТИВЕН — забирайте премиум-награды на каждом уровне
          </div>
        )}

        {/* Tracks header */}
        <div style={{
          marginTop: 22,
          display: "grid",
          gridTemplateColumns: "1fr 70px 1fr",
          gap: 10,
          alignItems: "center",
        }}>
          <div style={{
            textAlign: "center", fontWeight: 900, letterSpacing: 1.5, fontSize: 13,
            padding: "10px 0", borderRadius: 10,
            background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(255,255,255,0.12)",
          }}>
            БЕСПЛАТНО
          </div>
          <div style={{
            textAlign: "center", fontWeight: 900, fontSize: 13,
            color: "rgba(255,255,255,0.7)", letterSpacing: 1,
          }}>
            УР.
          </div>
          <div style={{
            textAlign: "center", fontWeight: 900, letterSpacing: 1.5, fontSize: 13,
            padding: "10px 0", borderRadius: 10,
            background: "linear-gradient(135deg, #FFD700, #FF8A00)",
            color: "#1a0a3a",
            border: "1px solid rgba(255,255,255,0.3)",
          }}>
            ★ STAR PASS
          </div>
        </div>

        {/* Vertical track with center bar that fills by level */}
        <div style={{ position: "relative", marginTop: 10 }}>
          {/* Background line for the entire vertical center column */}
          <div style={{
            position: "absolute",
            left: "50%", transform: "translateX(-50%)",
            top: 22, bottom: 22,
            width: 8, borderRadius: 4,
            background: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.06)",
            zIndex: 0,
          }} />
          {/* Filled portion of the line, scaling with current level */}
          <div style={{
            position: "absolute",
            left: "50%", transform: "translateX(-50%)",
            top: 22, height: `calc((100% - 44px) * ${verticalFillPct / 100})`,
            width: 8, borderRadius: 4,
            background: "linear-gradient(180deg, #FFD700 0%, #FF8A00 50%, #B8860B 100%)",
            backgroundSize: "100% 100%",
            animation: "none",
            boxShadow: "none",
            transition: "height 0.6s ease-out",
            zIndex: 0,
          }} />

          {passLevels.map(lvl => {
            const free = clashPassRewardForLevel(lvl);
            const paid = paidClashPassRewardForLevel(lvl);
            const reached = profile.clashPassLevel >= lvl;
            const freeClaimed = claimedFree.includes(lvl);
            const paidClaimed = claimedPaid.includes(lvl);
            const isMilestone = lvl % 10 === 0;
            return (
              <div
                key={lvl}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 70px 1fr",
                  gap: 10,
                  alignItems: "stretch",
                  marginBottom: 10,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <RewardTile
                  reward={free}
                  reached={reached}
                  claimed={freeClaimed}
                  locked={false}
                  premium={false}
                  onClaim={() => handleClaimFree(lvl)}
                />

                {/* Center node (level circle) */}
                <div style={{
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  position: "relative",
                }}>
                  <div style={{
                    width: isMilestone ? 50 : 42,
                    height: isMilestone ? 50 : 42,
                    borderRadius: "50%",
                    background: reached
                      ? "linear-gradient(135deg, #FFD700, #FF8A00)"
                      : "linear-gradient(135deg, #1a1a2e, #0d0d1a)",
                    border: `3px solid ${reached ? "#FFD700" : "rgba(255,255,255,0.18)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900,
                    fontSize: isMilestone ? 16 : 14,
                    color: reached ? "#1a0a3a" : "rgba(255,255,255,0.55)",
                    boxShadow: reached ? "0 1px 4px rgba(0,0,0,0.35)" : "0 1px 3px rgba(0,0,0,0.45)",
                    position: "relative",
                    zIndex: 2,
                  }}>
                    {reached && (freeClaimed && (paidClaimed || !hasPaid)) ? "✓" : lvl}
                  </div>
                </div>

                <RewardTile
                  reward={paid}
                  reached={reached}
                  claimed={paidClaimed}
                  locked={!hasPaid}
                  premium={true}
                  onClaim={() => handleClaimPaid(lvl)}
                />
              </div>
            );
          })}
        </div>
      </div>
      {showQuests && <QuestsModal onClose={() => { setShowQuests(false); refresh(); }} />}
      {pendingReward && (
        <RewardDropModal
          reward={pendingReward}
          onDone={() => setPendingReward(null)}
        />
      )}
    </div>
  );
}

const backBtn: React.CSSProperties = {
  position: "absolute", top: 20, left: 20,
  background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "8px 18px", color: "rgba(255,255,255,0.7)",
  cursor: "pointer", fontSize: 14, fontWeight: 600,
  zIndex: 2,
};
const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 18,
};
