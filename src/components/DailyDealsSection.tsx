import { useEffect, useMemo, useState } from "react";
import {
  getTodaysDeals, getMsUntilDealsReset, isDealBought, purchaseDeal,
  type ActiveDeal, type DealItem,
} from "../utils/dailyDeals";
import { getCurrentProfile } from "../utils/localStorageAPI";
import { CHESTS } from "../utils/chests";
import { PETS } from "../entities/PetData";
import { CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import PetSvg from "./PetSvg";
import Chest3DViewer from "./Chest3DViewer";

interface Props {
  onPurchased?: () => void;
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function DailyDealsSection({ onPurchased }: Props) {
  const [deals, setDeals] = useState<ActiveDeal[]>(() => getTodaysDeals());
  const [, force] = useState(0);
  const [resetMs, setResetMs] = useState(getMsUntilDealsReset());
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const t = setInterval(() => {
      const next = getMsUntilDealsReset();
      setResetMs(next);
      if (next <= 0) setDeals(getTodaysDeals());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const profile = getCurrentProfile();

  const handleBuy = (deal: ActiveDeal) => {
    const r = purchaseDeal(deal);
    if (r.success) {
      setMsg("Покупка успешна!");
      onPurchased?.();
      force(x => x + 1);
    } else {
      setMsg(r.error || "Ошибка");
    }
    setTimeout(() => setMsg(""), 2200);
  };

  const cards = useMemo(() => deals, [deals]);

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 10, paddingLeft: 4,
      }}>
        <div style={{ fontSize: 11, color: "#FFD54F", letterSpacing: 3, fontWeight: 800 }}>
          🔥 АКЦИИ ДНЯ
        </div>
        <div style={{
          fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.65)",
          letterSpacing: 1.5,
        }}>
          Обновятся через <span style={{ color: "#FFD54F" }}>{fmtCountdown(resetMs)}</span>
        </div>
      </div>
      {msg && (
        <div style={{
          marginBottom: 8, padding: "6px 12px",
          background: "rgba(255,213,79,0.12)",
          border: "1px solid rgba(255,213,79,0.3)",
          borderRadius: 8,
          fontSize: 12, color: "#FFD54F", fontWeight: 700, textAlign: "center",
        }}>{msg}</div>
      )}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 12,
      }}>
        {cards.map(deal => (
          <DealCard
            key={deal.instanceId}
            deal={deal}
            bought={isDealBought(deal.instanceId)}
            canAfford={profile != null && (
              deal.priceCurrency === "coins"
                ? profile.coins >= deal.priceAmount
                : profile.gems >= deal.priceAmount
            )}
            onBuy={() => handleBuy(deal)}
          />
        ))}
      </div>
    </div>
  );
}

function DealCard({
  deal, bought, canAfford, onBuy,
}: {
  deal: ActiveDeal;
  bought: boolean;
  canAfford: boolean;
  onBuy: () => void;
}) {
  const accent = deal.iconColor || "#FFD54F";
  const struck = deal.baselineAmount && deal.baselineAmount > deal.priceAmount;
  const discountPct = struck
    ? Math.round((1 - deal.priceAmount / deal.baselineAmount!) * 100)
    : 0;

  return (
    <div style={{
      position: "relative",
      background: `linear-gradient(180deg, ${accent}26 0%, rgba(0,0,0,0.55) 100%)`,
      border: `1.5px solid ${accent}66`,
      borderRadius: 14, padding: "12px 12px 10px",
      display: "flex", flexDirection: "column", gap: 8,
      boxShadow: `0 0 14px ${accent}33`,
      opacity: bought ? 0.5 : 1,
      filter: bought ? "grayscale(0.5)" : "none",
    }}>
      {/* discount ribbon */}
      {discountPct > 0 && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "#FF1744", color: "white",
          fontSize: 10, fontWeight: 900, letterSpacing: 1,
          borderRadius: 6, padding: "2px 6px",
          boxShadow: "0 2px 6px rgba(255,23,68,0.5)",
        }}>−{discountPct}%</div>
      )}
      {deal.special && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          background: "linear-gradient(135deg, #FFD700, #FF7043)",
          color: "white",
          fontSize: 9, fontWeight: 900, letterSpacing: 1,
          borderRadius: 6, padding: "2px 6px",
          textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}>★ HOT</div>
      )}

      <div style={{
        fontSize: 13, fontWeight: 900, color: accent,
        textAlign: "center", marginTop: 16,
        textShadow: "0 2px 4px rgba(0,0,0,0.5)",
      }}>{deal.title}</div>

      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center",
        minHeight: 0, padding: "4px 0",
      }}>
        {deal.items.map((it, i) => (
          <DealItemBadge key={i} item={it} />
        ))}
      </div>

      {/* Price */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        fontSize: 14, fontWeight: 900, color: "white",
        background: "rgba(0,0,0,0.35)", borderRadius: 10, padding: "6px 0",
      }}>
        {deal.priceCurrency === "coins" ? <CoinIcon size={14} /> : <GemIcon size={14} />}
        <span>{deal.priceAmount}</span>
        {struck && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)",
            textDecoration: "line-through", marginLeft: 4,
          }}>{deal.baselineAmount}</span>
        )}
      </div>

      <button
        onClick={onBuy}
        disabled={bought || !canAfford}
        style={{
          background: bought
            ? "rgba(255,255,255,0.06)"
            : canAfford
              ? `linear-gradient(135deg, ${accent}, ${accent}dd)`
              : "rgba(255,255,255,0.05)",
          color: bought ? "rgba(255,255,255,0.45)" : "white",
          border: "none", borderRadius: 10,
          padding: "8px 0", fontWeight: 900, fontSize: 12, letterSpacing: 1.5,
          cursor: bought || !canAfford ? "default" : "pointer",
          boxShadow: bought ? "none" : `0 3px 10px ${accent}55`,
        }}
      >
        {bought ? "✓ КУПЛЕНО" : canAfford ? "КУПИТЬ" : "НЕДОСТАТОЧНО"}
      </button>
    </div>
  );
}

function DealItemBadge({ item }: { item: DealItem }) {
  if (item.kind === "coins") {
    return (
      <span style={chip("#FFD700")}>
        <CoinIcon size={12} /> +{item.amount}
      </span>
    );
  }
  if (item.kind === "gems") {
    return (
      <span style={chip("#40C4FF")}>
        <GemIcon size={12} /> +{item.amount}
      </span>
    );
  }
  if (item.kind === "powerPoints") {
    return (
      <span style={chip("#CE93D8")}>
        <PowerIcon size={12} /> +{item.amount}
      </span>
    );
  }
  if (item.kind === "chest") {
    const c = CHESTS[item.rarity];
    return (
      <span style={{ ...chip(c.color), padding: "4px 8px" }}>
        <span style={{ width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <Chest3DViewer rarity={item.rarity} size={22} />
        </span>
        {c.shortName} ×{item.count}
      </span>
    );
  }
  if (item.kind === "pet") {
    const p = PETS.find(x => x.id === item.petId);
    if (!p) return null;
    return (
      <span style={{ ...chip(p.color), padding: "2px 8px 2px 4px" }}>
        <PetSvg pet={p} size={20} animated={false} haloPulse={false} /> {p.name}
      </span>
    );
  }
  if (item.kind === "upgradeDiscount") {
    return (
      <span style={chip("#FFAB00")}>
        🎟️ −{item.percent}% (×{item.uses})
      </span>
    );
  }
  return null;
}

function chip(color: string): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 4,
    background: `${color}1A`,
    border: `1px solid ${color}55`,
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10, fontWeight: 800, color, letterSpacing: 0.5,
  };
}
