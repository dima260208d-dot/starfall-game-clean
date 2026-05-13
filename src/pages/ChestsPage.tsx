import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  getCurrentProfile,
  buyChest,
  openChest,
} from "../utils/localStorageAPI";
import { CHESTS, CHEST_RARITY_ORDER, type ChestRarity, type ChestRoll } from "../utils/chests";
import { CHEST_BRAWLER_DROP_CHANCE } from "../entities/BrawlerData";
import Chest3DViewer from "../components/Chest3DViewer";
import ChestOpenAnimation from "../components/ChestOpenAnimation";
import ChestOpenModal from "../components/ChestOpenModal";
import { CoinBadge, GemBadge, PowerBadge, CoinIcon, GemIcon } from "../components/GameIcons";

interface Props {
  onBack: () => void;
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function ChestInfoModal({ rarity, onClose }: { rarity: ChestRarity; onClose: () => void }) {
  const def = CHESTS[rarity];
  const d = def.drops;
  const brawlerChance = CHEST_BRAWLER_DROP_CHANCE[rarity];

  const rollTotal = d.gemsChance + d.powerPointsChance;
  const coinsChance = Math.max(0, 1 - rollTotal);

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,5,0.88)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: `linear-gradient(180deg, ${def.color}22 0%, #0a0020 100%)`,
          border: `2px solid ${def.borderColor}88`,
          borderRadius: 24,
          padding: "28px 32px",
          maxWidth: 440,
          width: "90%",
          boxShadow: `0 0 60px ${def.color}44`,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: def.color, letterSpacing: 2 }}>
            {def.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            {"★".repeat(def.tier)}{"☆".repeat(6 - def.tier)} · {d.rolls} наград за открытие
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Row label="Шанс бойца" value={pct(brawlerChance)} color={def.color} highlight />
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
            За каждый из {d.rolls} бросков:
          </div>
          <Row label="💎 Кристаллы" value={`${pct(d.gemsChance)}  (${d.gemsRange[0]}–${d.gemsRange[1]})`} color="#40C4FF" />
          <Row label="⚡ Очки прокачки" value={`${pct(d.powerPointsChance)}  (${d.powerPointsRange[0]}–${d.powerPointsRange[1]})`} color="#CE93D8" />
          <Row label="🪙 Монеты" value={`~${pct(coinsChance)}  (${d.coinsRange[0]}–${d.coinsRange[1]})`} color="#FFD700" />
          {(d.bonusGems || d.bonusPowerPoints || d.bonusCoins) && (
            <>
              <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                Гарантированные бонусы:
              </div>
              {d.bonusGems ? <Row label="💎 Бонус кристаллы" value={`+${d.bonusGems}`} color="#40C4FF" /> : null}
              {d.bonusPowerPoints ? <Row label="⚡ Бонус ОП" value={`+${d.bonusPowerPoints}`} color="#CE93D8" /> : null}
              {d.bonusCoins ? <Row label="🪙 Бонус монеты" value={`+${d.bonusCoins}`} color="#FFD700" /> : null}
              {d.xp ? <Row label="⭐ Опыт Star Pass" value={`+${d.xp}`} color="#FFD700" /> : null}
            </>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 24, width: "100%",
            background: `linear-gradient(135deg, ${def.color}, ${def.secondaryColor})`,
            border: "none", borderRadius: 12, padding: "12px 0",
            color: "white", fontWeight: 900, fontSize: 14, letterSpacing: 2,
            cursor: "pointer",
          }}
        >
          ЗАКРЫТЬ
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Row({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: highlight ? `${color}18` : "rgba(255,255,255,0.04)",
      borderRadius: 8, padding: "7px 12px",
      border: highlight ? `1px solid ${color}44` : "1px solid rgba(255,255,255,0.06)",
    }}>
      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 900, color }}>{value}</span>
    </div>
  );
}

export default function ChestsPage({ onBack }: Props) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [msg, setMsg] = useState<string | null>(null);
  const [animating, setAnimating] = useState<{ rarity: ChestRarity; rolls: ChestRoll[] } | null>(null);
  const [opening, setOpening] = useState<{ rarity: ChestRarity; rolls: ChestRoll[] } | null>(null);
  const [infoRarity, setInfoRarity] = useState<ChestRarity | null>(null);

  useEffect(() => {
    const id = setInterval(() => setProfile(getCurrentProfile()), 500);
    return () => clearInterval(id);
  }, []);

  if (!profile) return null;

  const handleBuy = (rarity: ChestRarity, currency: "coins" | "gems") => {
    const r = buyChest(rarity, currency);
    setMsg(r.success ? `Куплен ${CHESTS[rarity].name}` : (r.error || "Ошибка"));
    setProfile(getCurrentProfile());
    setTimeout(() => setMsg(null), 2000);
  };

  const handleOpen = (rarity: ChestRarity) => {
    const r = openChest(rarity);
    if (!r.success) {
      setMsg(r.error || "Ошибка");
      setTimeout(() => setMsg(null), 2000);
      return;
    }
    setProfile(getCurrentProfile());
    setAnimating({ rarity, rolls: r.rolls! });
  };

  const handleAnimationDone = () => {
    if (!animating) return;
    const data = { ...animating };
    setAnimating(null);
    setOpening(data);
  };

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #5C2A00 0%, #A04000 50%, #D35400 100%)",
      padding: "24px 18px 60px",
      color: "white",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      position: "relative",
    }}>
      <style>{`
        @keyframes chestSparkle {
          0%,100% { opacity: 0.3; transform: scale(0.85); }
          50%     { opacity: 1;   transform: scale(1.2);  }
        }
      `}</style>
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        {Array.from({ length: 30 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${(i * 7919) % 100}%`,
            top: `${(i * 4091) % 100}%`,
            width: 4 + (i % 3) * 2, height: 4 + (i % 3) * 2,
            borderRadius: "50%",
            background: ["#FFD700", "#FFFFFF", "#FFEB3B"][i % 3],
            boxShadow: "0 0 8px rgba(255,255,255,0.7)",
            animation: `chestSparkle ${2 + (i % 4) * 0.7}s ease-in-out infinite`,
            animationDelay: `${(i % 5) * 0.4}s`,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 18, maxWidth: 1100, margin: "0 auto 18px" }}>
        <button
          onClick={onBack}
          style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10, padding: "8px 18px", color: "rgba(255,255,255,0.7)",
            cursor: "pointer", fontSize: 14, fontWeight: 600,
          }}
        >← Назад</button>
        <h1 style={{
          flex: 1, textAlign: "center", margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: 3,
          background: "linear-gradient(135deg, #FFD700, #FF6E40, #FF1744)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          СУНДУКИ
        </h1>
        <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <CoinBadge value={profile.coins} />
          <GemBadge value={profile.gems} />
          <PowerBadge value={profile.powerPoints} />
        </div>
      </div>

      {msg && (
        <div style={{
          maxWidth: 600, margin: "0 auto 14px",
          background: "rgba(255,215,0,0.15)", color: "#FFD700",
          border: "1px solid rgba(255,215,0,0.4)",
          borderRadius: 10, padding: "8px 14px",
          textAlign: "center", fontWeight: 700, fontSize: 14,
        }}>{msg}</div>
      )}

      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 16,
      }}>
        {CHEST_RARITY_ORDER.map(rarity => {
          const def = CHESTS[rarity];
          const owned = profile.chestInventory[rarity] || 0;
          const canBuyCoins = profile.coins >= def.priceCoins;
          const canBuyGems = profile.gems >= def.priceGems;
          const brawlerPct = Math.round(CHEST_BRAWLER_DROP_CHANCE[rarity] * 100);
          return (
            <div key={rarity} style={{
              background: `linear-gradient(180deg, ${def.color}1A 0%, rgba(0,0,0,0.45) 100%)`,
              border: `2px solid ${def.borderColor}55`,
              borderRadius: 18,
              padding: 16,
              display: "flex", flexDirection: "column", alignItems: "center",
              boxShadow: `0 0 30px ${def.color}33`,
              position: "relative",
            }}>
              <button
                onClick={() => setInfoRarity(rarity)}
                title="Шансы выпадения"
                style={{
                  position: "absolute", top: 10, right: 10,
                  width: 26, height: 26, borderRadius: "50%",
                  background: `${def.color}33`,
                  border: `1px solid ${def.color}88`,
                  color: def.color, fontWeight: 900, fontSize: 13,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  lineHeight: 1,
                }}
              >?</button>

              {/* 3D Chest model replacing flat ChestVisual */}
              <div
                style={{
                  height: 160,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: owned > 0 ? "pointer" : "default",
                }}
                onClick={() => owned > 0 && handleOpen(rarity)}
                title={owned > 0 ? "Нажмите, чтобы открыть" : undefined}
              >
                <Chest3DViewer rarity={rarity} size={150} />
              </div>

              <div style={{
                fontSize: 17, fontWeight: 900, color: def.color, marginTop: 8,
                letterSpacing: 1, textAlign: "center",
              }}>
                {def.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4, textAlign: "center", minHeight: 30 }}>
                {def.description}
              </div>
              <div style={{
                marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.65)",
                background: "rgba(0,0,0,0.35)", border: `1px solid ${def.color}33`,
                borderRadius: 8, padding: "4px 10px",
                display: "flex", gap: 10, alignItems: "center",
              }}>
                <span>{def.drops.rolls} наград · ★{def.tier}</span>
                {brawlerPct > 0 && (
                  <span style={{ color: def.color, fontWeight: 800 }}>🦸 {brawlerPct}%</span>
                )}
              </div>

              <div style={{ marginTop: 12, width: "100%" }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 6,
                }}>
                  <span>В инвентаре:</span>
                  <span style={{ color: def.color, fontWeight: 900, fontSize: 14 }}>{owned}</span>
                </div>
                <button
                  onClick={() => handleOpen(rarity)}
                  disabled={owned < 1}
                  style={{
                    width: "100%",
                    background: owned > 0
                      ? `linear-gradient(135deg, ${def.color}, ${def.secondaryColor})`
                      : "rgba(255,255,255,0.05)",
                    border: "none", borderRadius: 10, padding: "10px 0",
                    color: owned > 0 ? "white" : "rgba(255,255,255,0.4)",
                    fontWeight: 900, letterSpacing: 1, fontSize: 13,
                    cursor: owned > 0 ? "pointer" : "default",
                  }}
                >
                  ОТКРЫТЬ
                </button>
              </div>

              <div style={{ marginTop: 10, width: "100%", display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleBuy(rarity, "coins")}
                  disabled={!canBuyCoins}
                  style={{
                    flex: 1,
                    background: canBuyCoins ? "linear-gradient(135deg, #F9A825, #FFD700)" : "rgba(255,255,255,0.05)",
                    border: "none", borderRadius: 8, padding: "8px 0",
                    color: canBuyCoins ? "#000" : "rgba(255,255,255,0.4)",
                    fontWeight: 800, fontSize: 12,
                    cursor: canBuyCoins ? "pointer" : "default",
                  }}
                >
                  <CoinIcon size={13} /> {def.priceCoins}
                </button>
                <button
                  onClick={() => handleBuy(rarity, "gems")}
                  disabled={!canBuyGems}
                  style={{
                    flex: 1,
                    background: canBuyGems ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                    border: "none", borderRadius: 8, padding: "8px 0",
                    color: canBuyGems ? "white" : "rgba(255,255,255,0.4)",
                    fontWeight: 800, fontSize: 12,
                    cursor: canBuyGems ? "pointer" : "default",
                  }}
                >
                  <GemIcon size={13} /> {def.priceGems}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3D spin+glow animation before the drop reveal */}
      {animating && (
        <ChestOpenAnimation
          rarity={animating.rarity}
          onDone={handleAnimationDone}
        />
      )}

      {opening && (
        <ChestOpenModal
          rarity={opening.rarity}
          rolls={opening.rolls}
          onClose={() => setOpening(null)}
        />
      )}

      {infoRarity && (
        <ChestInfoModal rarity={infoRarity} onClose={() => setInfoRarity(null)} />
      )}
    </div>
  );
}
