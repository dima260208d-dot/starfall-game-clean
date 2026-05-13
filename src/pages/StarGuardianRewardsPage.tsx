import { useEffect, useState } from "react";
import {
  isStarGuardianActive, getStarGuardianDaysRemaining,
  isMainDailyAvailable, claimMainDaily,
  isSecondaryDailyAvailable, getDailySecondaryOptions, claimSecondaryDaily,
  isSpecialDailyAvailable, claimSpecialDaily,
  consumePowerUpToken, getStarGuardian,
  MAIN_DAILY_COINS, MAIN_DAILY_GEMS, MAIN_DAILY_POWER,
  SPECIAL_REWARD_INTERVAL_DAYS,
  type SecondaryRewardOption,
} from "../utils/subscription";
import { getCurrentProfile } from "../utils/localStorageAPI";
import { CoinBadge, GemBadge, PowerBadge, CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import { BRAWLERS } from "../entities/BrawlerData";

interface Props { onBack: () => void }

export default function StarGuardianRewardsPage({ onBack }: Props) {
  const [, setRefreshTick] = useState(0);
  const refresh = () => setRefreshTick(x => x + 1);

  // Auto-refresh every 1 sec so timers/badges update.
  useEffect(() => {
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-claim main daily on first visit ──
  const [mainFlash, setMainFlash] = useState<string | null>(null);
  useEffect(() => {
    if (isMainDailyAvailable()) {
      const r = claimMainDaily();
      if (r.claimed) {
        setMainFlash(`+${r.coins} монет, +${r.gems} кристаллов, +${r.powerPoints} поинтов`);
        setTimeout(() => setMainFlash(null), 5000);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const profile = getCurrentProfile();
  const sg = getStarGuardian();
  const active = isStarGuardianActive();
  const daysLeft = getStarGuardianDaysRemaining();

  const secondaryOptions = active ? getDailySecondaryOptions() : [];
  const secondaryAvailable = isSecondaryDailyAvailable();
  const specialAvailable = isSpecialDailyAvailable();
  const tokens = sg.powerUpTokens;

  const [chosen, setChosen] = useState<SecondaryRewardOption | null>(null);
  const handleSecondary = (i: 0 | 1 | 2) => {
    const r = claimSecondaryDaily(i);
    if (r.claimed && r.option) {
      setChosen(r.option);
      setTimeout(() => setChosen(null), 5000);
      refresh();
    }
  };

  const handleSpecial = () => {
    const r = claimSpecialDaily();
    if (r.claimed) refresh();
  };

  const [pickingFor, setPickingFor] = useState(false);
  const [tokenMsg, setTokenMsg] = useState("");
  const handleSpendToken = (brawlerId: string) => {
    const r = consumePowerUpToken(brawlerId);
    if (!r.success) {
      setTokenMsg(`❌ ${r.error}`);
    } else {
      const b = BRAWLERS.find(x => x.id === brawlerId);
      setTokenMsg(`✅ ${b?.name ?? brawlerId} → уровень ${r.newLevel}`);
      setPickingFor(false);
    }
    setTimeout(() => setTokenMsg(""), 4000);
    refresh();
  };

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(160deg, #1A0033 0%, #2D0050 50%, #4A148C 100%)",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: "white",
    }}>
      <div style={{
        display: "flex", alignItems: "center",
        padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10, padding: "7px 16px", color: "rgba(255,255,255,0.7)",
          cursor: "pointer", fontSize: 13, fontWeight: 600,
        }}>← Назад</button>
        <h2 style={{
          flex: 1, textAlign: "center", margin: 0, fontSize: 22, fontWeight: 800,
          color: "#FFD740", letterSpacing: 1,
        }}>⭐ STAR GUARDIAN</h2>
        <div style={{ display: "flex", gap: 10, fontSize: 14 }}>
          <CoinBadge value={profile?.coins ?? 0} />
          <GemBadge value={profile?.gems ?? 0} />
          <PowerBadge value={profile?.powerPoints ?? 0} />
        </div>
      </div>

      <div style={{ padding: "24px", maxWidth: 880, margin: "0 auto", width: "100%" }}>
        {!active ? (
          <div style={{
            background: "rgba(255,87,34,0.18)",
            border: "1.5px solid rgba(255,87,34,0.6)",
            borderRadius: 14, padding: 20, textAlign: "center",
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: "#FF8A65" }}>
              Подписка не активна
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>
              Открой магазин и оформи Star Guardian, чтобы получать ежедневные награды и пользоваться всеми функциями Астрала.
            </div>
          </div>
        ) : (
          <>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 18,
              background: "rgba(255,215,64,0.12)",
              border: "1.5px solid rgba(255,215,64,0.5)",
              borderRadius: 12, padding: "10px 16px",
            }}>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>До конца подписки:</span>
              <span style={{ fontSize: 18, fontWeight: 900, color: "#FFD740" }}>{daysLeft} дней</span>
            </div>

            {/* MAIN DAILY */}
            <Card title="🎁 Главная награда дня" subtitle="Зачисляется автоматически каждый день">
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <RewardChip icon={<CoinIcon size={28} />} amount={MAIN_DAILY_COINS} />
                <RewardChip icon={<GemIcon size={28} />} amount={MAIN_DAILY_GEMS} />
                <RewardChip icon={<PowerIcon size={28} />} amount={MAIN_DAILY_POWER} />
                <div style={{ flex: 1 }} />
                {isMainDailyAvailable() ? (
                  <button onClick={() => { claimMainDaily(); refresh(); }} style={primaryBtn}>
                    Забрать
                  </button>
                ) : (
                  <span style={{ color: "#69F0AE", fontWeight: 700, fontSize: 13 }}>✓ Получено сегодня</span>
                )}
              </div>
              {mainFlash && <div style={{ marginTop: 10, color: "#69F0AE", fontWeight: 700 }}>+{mainFlash}</div>}
            </Card>

            {/* SECONDARY DAILY */}
            <Card title="🎯 Дополнительная награда дня" subtitle="Выбери один из трёх вариантов">
              {!secondaryAvailable ? (
                <div style={{ color: "#69F0AE", fontWeight: 700, fontSize: 14 }}>
                  ✓ Уже выбрана сегодня. Возвращайся завтра!
                </div>
              ) : (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                }}>
                  {secondaryOptions.map((opt, i) => (
                    <button key={i} onClick={() => handleSecondary(i as 0 | 1 | 2)} style={{
                      background: "linear-gradient(160deg, rgba(255,255,255,0.08), rgba(74,20,140,0.4))",
                      border: "1.5px solid rgba(206,147,216,0.6)",
                      borderRadius: 14, padding: 16,
                      color: "white", cursor: "pointer",
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      transition: "transform 150ms",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-3px)")}
                    onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                    >
                      {opt.type === "coins"       && <CoinIcon size={48} />}
                      {opt.type === "gems"        && <GemIcon size={48} />}
                      {opt.type === "powerPoints" && <PowerIcon size={48} />}
                      <div style={{ fontSize: 18, fontWeight: 900, color: "#FFD740" }}>+{opt.amount}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                        {opt.type === "coins" ? "монет" : opt.type === "gems" ? "кристаллов" : "поинтов"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {chosen && (
                <div style={{ marginTop: 10, color: "#69F0AE", fontWeight: 700 }}>
                  ✓ Получено: +{chosen.amount} {chosen.type === "coins" ? "монет" : chosen.type === "gems" ? "кристаллов" : "поинтов"}
                </div>
              )}
            </Card>

            {/* SPECIAL — every 3 days */}
            <Card title="⚡ Сила прокачки" subtitle={`Раз в ${SPECIAL_REWARD_INTERVAL_DAYS} дня — токен моментальной прокачки бойца`}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{
                  width: 56, height: 56, borderRadius: 14,
                  background: "radial-gradient(circle at 35% 30%, #FFD740, #B71C1C)",
                  border: "2px solid #FFD740",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28, boxShadow: "0 0 18px rgba(255,215,64,0.5)",
                }}>⚡</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>Токены прокачки: {tokens}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                    1 токен = +1 уровень любому открытому бойцу (без расхода монет/поинтов).
                  </div>
                </div>
                {specialAvailable ? (
                  <button onClick={handleSpecial} style={primaryBtn}>Забрать токен</button>
                ) : (
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>Следующий через ~3 дня</span>
                )}
                {tokens > 0 && (
                  <button
                    onClick={() => setPickingFor(v => !v)}
                    style={{
                      background: "rgba(206,147,216,0.2)",
                      border: "1.5px solid #CE93D8",
                      borderRadius: 10, padding: "8px 14px",
                      color: "#CE93D8", cursor: "pointer",
                      fontWeight: 700, fontSize: 12,
                    }}>{pickingFor ? "Отмена" : "Применить"}</button>
                )}
              </div>
              {tokenMsg && <div style={{ marginTop: 10, color: tokenMsg.startsWith("✅") ? "#69F0AE" : "#FF8A65", fontWeight: 700 }}>{tokenMsg}</div>}
              {pickingFor && profile && (
                <div style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                  gap: 8,
                }}>
                  {profile.unlockedBrawlers.map(id => {
                    const b = BRAWLERS.find(x => x.id === id);
                    if (!b) return null;
                    const lvl = profile.brawlerLevels[id] || 1;
                    const maxed = lvl >= 11;
                    return (
                      <button key={id} disabled={maxed} onClick={() => handleSpendToken(id)} style={{
                        background: maxed ? "rgba(0,0,0,0.3)" : `linear-gradient(160deg, ${b.color}33, rgba(0,0,0,0.4))`,
                        border: `1.5px solid ${b.color}88`,
                        borderRadius: 10, padding: "8px 6px",
                        color: maxed ? "rgba(255,255,255,0.4)" : "white",
                        cursor: maxed ? "not-allowed" : "pointer",
                        fontWeight: 700, fontSize: 12,
                      }}>
                        {b.name}<br /><span style={{ color: maxed ? "rgba(255,255,255,0.4)" : "#FFD740", fontSize: 10 }}>ур. {lvl}{maxed ? " (макс)" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>

            <div style={{
              marginTop: 18, padding: 14, fontSize: 12, lineHeight: 1.6,
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              color: "rgba(255,255,255,0.6)",
            }}>
              💫 Star Guardian также активирует все функции Астрала: автобой во всех режимах, ситуативные подсказки в бою, ежедневные напоминания и выполнение команд через чат («открой ящик», «прокачай Мию», «поставь Феникса»).
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, rgba(255,255,255,0.05), rgba(74,20,140,0.25))",
      border: "1.5px solid rgba(206,147,216,0.4)",
      borderRadius: 16, padding: 16, marginBottom: 14,
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#FFD740" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>{subtitle}</div>}
      {children}
    </div>
  );
}

function RewardChip({ icon, amount }: { icon: React.ReactNode; amount: number }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      background: "rgba(0,0,0,0.3)", borderRadius: 10,
      padding: "6px 10px",
    }}>
      {icon}
      <span style={{ fontWeight: 800, color: "#FFD740" }}>+{amount}</span>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg, #FFD740, #FFA000)",
  border: "none", borderRadius: 10, padding: "10px 18px",
  fontWeight: 800, color: "#3E2723", cursor: "pointer",
  fontSize: 13, boxShadow: "0 4px 12px rgba(255,160,0,0.4)",
};
