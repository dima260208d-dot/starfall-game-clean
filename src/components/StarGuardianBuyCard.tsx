import { useState, useEffect } from "react";
import {
  isStarGuardianActive, getStarGuardianDaysRemaining,
  purchaseStarGuardian, STAR_GUARDIAN_PRICE_RUB,
  MAIN_DAILY_COINS, MAIN_DAILY_GEMS, MAIN_DAILY_POWER,
  SPECIAL_REWARD_INTERVAL_DAYS,
} from "../utils/subscription";

interface Props {
  /** Called after a purchase succeeds so the parent can re-fetch profile state. */
  onPurchased?: () => void;
  /** Called when the user clicks "Открыть награды" on an active subscription. */
  onOpenRewards?: () => void;
}

export default function StarGuardianBuyCard({ onPurchased, onOpenRewards }: Props) {
  const [active, setActive] = useState(isStarGuardianActive());
  const [days, setDays] = useState(getStarGuardianDaysRemaining());
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setInterval(() => {
      setActive(isStarGuardianActive());
      setDays(getStarGuardianDaysRemaining());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const handleBuy = () => {
    if (!confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return; }
    setConfirming(false);
    purchaseStarGuardian();
    setActive(true);
    setDays(getStarGuardianDaysRemaining());
    setMsg(`✅ Подписка активна! +30 дней наград и помощник Астрал.`);
    setTimeout(() => setMsg(""), 4000);
    onPurchased?.();
  };

  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(160deg, rgba(255,215,64,0.18), rgba(74,20,140,0.4))",
      border: "2px solid #FFD740",
      borderRadius: 18,
      padding: 18,
      marginBottom: 24,
      boxShadow: "0 0 30px rgba(255,215,64,0.30)",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(circle at 80% 20%, rgba(255,215,64,0.2), transparent 60%)",
      }} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, position: "relative" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "radial-gradient(circle at 35% 30%, #B388FF, #4A148C)",
          border: "2px solid #FFD740",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, boxShadow: "0 0 18px rgba(255,215,64,0.5)",
        }}>⭐</div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 20, fontWeight: 900, color: "#FFD740",
            letterSpacing: 1, lineHeight: 1.1,
          }}>STAR GUARDIAN</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>
            Премиум-подписка на 30 дней
          </div>
        </div>
        {active && (
          <div style={{
            background: "linear-gradient(135deg, #4CAF50, #2E7D32)",
            color: "white", fontWeight: 800,
            borderRadius: 10, padding: "5px 10px",
            fontSize: 11, letterSpacing: 0.5,
          }}>АКТИВНА · {days} дн.</div>
        )}
      </div>

      <ul style={{
        listStyle: "none", padding: 0, margin: 0,
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 8, position: "relative",
      }}>
        <Bullet icon="🎁">Каждый день: <b>{MAIN_DAILY_COINS}</b> монет + <b>{MAIN_DAILY_GEMS}</b> кристаллов + <b>{MAIN_DAILY_POWER}</b> поинтов</Bullet>
        <Bullet icon="🎯">Доп.награда дня — выбор из 3 (монеты / кристаллы / поинты)</Bullet>
        <Bullet icon="⚡">Раз в {SPECIAL_REWARD_INTERVAL_DAYS} дня — токен прокачки бойца</Bullet>
        <Bullet icon="🤖">Все функции <b>Астрала</b>: автобой, подсказки, выполнение команд</Bullet>
      </ul>

      <div style={{
        marginTop: 14, display: "flex", gap: 10, alignItems: "center",
        flexWrap: "wrap", position: "relative",
      }}>
        {active ? (
          <button onClick={onOpenRewards} style={{
            background: "linear-gradient(135deg, #FFD740, #FFA000)",
            border: "none", borderRadius: 12,
            padding: "10px 18px", fontWeight: 800,
            color: "#3E2723", cursor: "pointer", fontSize: 14,
            boxShadow: "0 4px 14px rgba(255,160,0,0.5)",
          }}>🎁 Открыть награды</button>
        ) : (
          <button onClick={handleBuy} style={{
            background: confirming
              ? "linear-gradient(135deg, #FF5252, #C62828)"
              : "linear-gradient(135deg, #FFD740, #FFA000)",
            border: "none", borderRadius: 12,
            padding: "10px 18px", fontWeight: 800,
            color: confirming ? "white" : "#3E2723", cursor: "pointer", fontSize: 14,
            boxShadow: "0 4px 14px rgba(255,160,0,0.5)",
            transition: "all 200ms",
          }}>
            {confirming
              ? `Нажми ещё раз: ${STAR_GUARDIAN_PRICE_RUB} ₽ за 30 дней`
              : `Оформить подписку — ${STAR_GUARDIAN_PRICE_RUB} ₽`}
          </button>
        )}
        {active && (
          <button onClick={handleBuy} style={{
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,215,64,0.5)",
            borderRadius: 12, padding: "10px 14px", color: "#FFD740",
            cursor: "pointer", fontSize: 12, fontWeight: 700,
          }}>
            {confirming ? `Подтвердить: +30 дней (${STAR_GUARDIAN_PRICE_RUB}₽)` : "Продлить ещё на 30 дней"}
          </button>
        )}
        {msg && <span style={{ color: "#69F0AE", fontSize: 12, fontWeight: 600 }}>{msg}</span>}
      </div>
    </div>
  );
}

function Bullet({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <li style={{
      display: "flex", alignItems: "flex-start", gap: 8,
      background: "rgba(0,0,0,0.25)",
      borderRadius: 10, padding: "8px 10px",
      fontSize: 12, lineHeight: 1.4, color: "white",
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
      <span>{children}</span>
    </li>
  );
}
