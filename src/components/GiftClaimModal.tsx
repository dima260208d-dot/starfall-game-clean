import { useState } from "react";
import { getPendingGifts, claimGift, describeGiftItem, type PendingGift } from "../utils/gifts";
import { CHESTS } from "../utils/chests";
import { PETS } from "../entities/PetData";
import { BRAWLERS } from "../entities/BrawlerData";
import { CoinIcon, GemIcon, PowerIcon } from "./GameIcons";
import PetSvg from "./PetSvg";

interface Props {
  onAllClaimed: () => void;
}

export default function GiftClaimModal({ onAllClaimed }: Props) {
  const [queue, setQueue] = useState<PendingGift[]>(() => getPendingGifts());
  const [busy, setBusy] = useState(false);

  if (queue.length === 0) return null;
  const gift = queue[0];

  const handleClaim = () => {
    if (busy) return;
    setBusy(true);
    const r = claimGift(gift.id);
    if (r.success) {
      const remaining = getPendingGifts();
      setQueue(remaining);
      if (remaining.length === 0) onAllClaimed();
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(circle at 50% 35%, rgba(255,213,79,0.18), rgba(0,0,0,0.85))",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 9999, padding: 16,
      animation: "fadeIn 0.25s ease",
    }}>
      <div style={{
        width: "100%", maxWidth: 460,
        background: "linear-gradient(180deg, #1a2a44 0%, #0a1428 100%)",
        border: "2px solid #FFD54F",
        borderRadius: 18, padding: 20,
        boxShadow: "0 0 40px rgba(255,213,79,0.45), 0 8px 30px rgba(0,0,0,0.6)",
        animation: "popIn 0.4s cubic-bezier(.2,.9,.4,1.4)",
      }}>
        <div style={{
          display: "flex", justifyContent: "center", marginBottom: 4, fontSize: 44,
        }}>🎁</div>
        <h2 style={{
          margin: 0, textAlign: "center",
          fontSize: 22, fontWeight: 900, color: "#FFD54F",
          letterSpacing: 1.5, textShadow: "0 0 14px rgba(255,213,79,0.55)",
        }}>ПОДАРОК ОТ РАЗРАБОТЧИКОВ!</h2>
        <div style={{
          marginTop: 4, textAlign: "center",
          fontSize: 11, color: "rgba(255,255,255,0.55)", letterSpacing: 1.2,
        }}>
          {new Date(gift.sentAt).toLocaleDateString()}
          {queue.length > 1 && ` · Ещё подарков: ${queue.length - 1}`}
        </div>
        {gift.message && (
          <div style={{
            marginTop: 14, padding: "12px 14px",
            background: "rgba(255,213,79,0.08)",
            border: "1px solid rgba(255,213,79,0.25)",
            borderRadius: 10,
            fontSize: 13, color: "rgba(255,255,255,0.85)",
            fontStyle: "italic", lineHeight: 1.4, textAlign: "center",
          }}>«{gift.message}»</div>
        )}
        <div style={{
          marginTop: 14, display: "flex", flexDirection: "column", gap: 8,
        }}>
          {gift.items.map((it, i) => (
            <GiftItemRow key={i} item={it} />
          ))}
        </div>
        <button
          onClick={handleClaim}
          disabled={busy}
          style={{
            marginTop: 20, width: "100%",
            background: "linear-gradient(135deg, #FFD54F, #FFB300)",
            color: "#1B1B1B", border: "none",
            borderRadius: 12, padding: "12px 0",
            fontSize: 14, fontWeight: 900, letterSpacing: 2,
            cursor: busy ? "default" : "pointer",
            boxShadow: "0 4px 16px rgba(255,213,79,0.5)",
          }}
        >ЗАБРАТЬ</button>
      </div>
    </div>
  );
}

function GiftItemRow({ item }: { item: ReturnType<typeof getPendingGifts>[number]["items"][number] }) {
  // Visual: icon + label
  let icon: React.ReactNode = "🎁";
  let color = "#FFD54F";
  if (item.kind === "coins")        { icon = <CoinIcon size={22} />;  color = "#FFD700"; }
  else if (item.kind === "gems")    { icon = <GemIcon size={22} />;   color = "#40C4FF"; }
  else if (item.kind === "powerPoints") { icon = <PowerIcon size={22} />; color = "#CE93D8"; }
  else if (item.kind === "chest")   { icon = <span style={{ fontSize: 22 }}>{CHESTS[item.rarity].emoji}</span>; color = CHESTS[item.rarity].color; }
  else if (item.kind === "pet")     {
    const p = PETS.find(x => x.id === item.petId);
    if (p) {
      icon = <PetSvg pet={p} size={28} animated={false} haloPulse={false} />;
      color = p.color;
    }
  }
  else if (item.kind === "brawler") {
    const b = BRAWLERS.find(x => x.id === item.brawlerId);
    if (b) color = b.color;
    icon = <span style={{ fontSize: 22 }}>🦸</span>;
  }
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "8px 12px",
      background: `${color}14`, border: `1px solid ${color}44`,
      borderRadius: 10,
    }}>
      <div style={{
        width: 32, height: 32,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: `${color}26`, borderRadius: 8,
      }}>{icon}</div>
      <div style={{
        flex: 1, fontSize: 13, fontWeight: 800, color: "white",
      }}>{describeGiftItem(item)}</div>
    </div>
  );
}
