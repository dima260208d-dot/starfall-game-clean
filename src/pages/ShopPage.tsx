import { useState, useEffect } from "react";
import { getCurrentProfile, addGems, addCoins, updateProfile, claimDailyLadderReward, buyChest, openChest, canClaimDailyLadder, unlockBrawlerWithGems, unlockPetWithGems } from "../utils/localStorageAPI";
import { PETS, PET_GEM_COST, PET_RARITY_LABEL } from "../entities/PetData";
import PetSvg from "../components/PetSvg";
import PetRevealModal from "../components/PetRevealModal";
import RewardDropModal, { type RewardInfo } from "../components/RewardDropModal";
import { CHESTS, CHEST_RARITY_ORDER, type ChestRarity, type ChestRoll } from "../utils/chests";
import { BRAWLERS, BRAWLER_GEM_COST, BRAWLER_RARITY_LABEL } from "../entities/BrawlerData";
import Chest3DViewer from "../components/Chest3DViewer";
import ChestOpenAnimation from "../components/ChestOpenAnimation";
import ChestOpenModal from "../components/ChestOpenModal";
import BrawlerRevealModal from "../components/BrawlerRevealModal";
import { CoinBadge, GemBadge, PowerBadge, CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import DailyDealsSection from "../components/DailyDealsSection";
import StarGuardianBuyCard from "../components/StarGuardianBuyCard";
import DonateTabContent from "../components/DonateTabContent";
import { getBrawlerStarsCount, buyBrawlerStarWithGems, buyBrawlerStarsPackWithGems } from "../utils/localStorageAPI";
import { BRAWLER_CONSTELLATIONS, STAR_COST_GEMS, STAR_PACK3_COST_GEMS, STAR_COST_RUB, STAR_PACK3_COST_RUB } from "../utils/constellations";
import { DAILY_GIFT_FREE_KEY, DAILY_GIFT_SG_KEY, getTodayStamp, isAnyDealsGiftAvailable } from "../utils/shopDailyGifts";
import { getRewardForDay } from "../utils/dailyLadder";

interface ShopPageProps {
  onBack: () => void;
  onOpenStarGuardianRewards?: () => void;
}

type ShopTab = "brawlers" | "pets" | "chests" | "deals" | "stars" | "donate";

const TABS: { id: ShopTab; label: string; icon: string; color: string }[] = [
  { id: "brawlers", label: "Бойцы",   icon: "⚔️", color: "#40C4FF" },
  { id: "pets",     label: "Питомцы", icon: "🐾", color: "#69F0AE" },
  { id: "chests",   label: "Сундуки", icon: "📦", color: "#FFD740" },
  { id: "deals",    label: "Акции",   icon: "🔥", color: "#FF6E40" },
  { id: "stars",    label: "Звёзды",  icon: "✨", color: "#FFD740" },
  { id: "donate",   label: "Донат",   icon: "💎", color: "#E91E63" },
];

export default function ShopPage({ onBack, onOpenStarGuardianRewards }: ShopPageProps) {
  const dayStamp = getTodayStamp();
  const [profile, setProfile] = useState(getCurrentProfile());
  const [activeTab, setActiveTab] = useState<ShopTab>("brawlers");
  const [msg, setMsg] = useState("");
  const [chestAnimating, setChestAnimating] = useState<{ rarity: ChestRarity; rolls: ChestRoll[] } | null>(null);
  const [chestOpening, setChestOpening] = useState<{ rarity: ChestRarity; rolls: ChestRoll[] } | null>(null);
  const [purchasedBrawler, setPurchasedBrawler] = useState<string | null>(null);
  const [purchasedPet, setPurchasedPet] = useState<string | null>(null);
  const [pendingReward, setPendingReward] = useState<RewardInfo | null>(null);

  const refresh = () => setProfile(getCurrentProfile());

  const handleUnlockPet = (petId: string) => {
    const r = unlockPetWithGems(petId);
    if (r.success) { refresh(); setPurchasedPet(petId); }
    else { setMsg(r.error || "Ошибка"); setTimeout(() => setMsg(""), 2200); }
  };

  const handleUnlockBrawler = (brawlerId: string) => {
    const r = unlockBrawlerWithGems(brawlerId);
    if (r.success) { refresh(); setPurchasedBrawler(brawlerId); }
    else { setMsg(r.error || "Ошибка"); setTimeout(() => setMsg(""), 2200); }
  };

  const handleBuyChest = (rarity: ChestRarity, currency: "coins" | "gems") => {
    const r = buyChest(rarity, currency);
    setMsg(r.success ? `Куплен ${CHESTS[rarity].name}` : (r.error || "Ошибка"));
    refresh();
    setTimeout(() => setMsg(""), 2000);
  };

  const handleOpenChestRarity = (rarity: ChestRarity) => {
    const r = openChest(rarity);
    if (!r.success) { setMsg(r.error || "Ошибка"); setTimeout(() => setMsg(""), 2000); return; }
    refresh();
    setChestAnimating({ rarity, rolls: r.rolls! });
  };

  const handleChestAnimationDone = () => {
    if (!chestAnimating) return;
    const data = { ...chestAnimating };
    setChestAnimating(null);
    setChestOpening(data);
  };

  useEffect(() => {
    const interval = setInterval(refresh, 500);
    return () => clearInterval(interval);
  }, []);

  const handleDailyBonus = () => {
    const r = claimDailyLadderReward();
    if (r.success && r.reward) {
      refresh();
      setPendingReward({
        type: r.reward.type as RewardInfo["type"],
        amount: r.reward.amount,
        chestRarity: r.reward.chestRarity,
        label: r.reward.label,
      });
    } else {
      setMsg("Ежедневный бонус уже получен. Возвращайтесь завтра!");
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const canClaimDaily = !!profile && canClaimDailyLadder(profile);
  const dailyReward = profile ? getRewardForDay(profile.dailyLadderDay) : null;
  const canClaimDealGift = localStorage.getItem(DAILY_GIFT_FREE_KEY) !== dayStamp;
  const sgActive = !!profile?.starGuardian && (profile.starGuardian as any)?.expiresAt > Date.now();
  const canClaimDealGiftSg = sgActive && localStorage.getItem(DAILY_GIFT_SG_KEY) !== dayStamp;
  const hasDealsGift = isAnyDealsGiftAvailable();
  const [starsBrawlerId, setStarsBrawlerId] = useState<string>(() => getCurrentProfile()?.unlockedBrawlers?.[0] || "hana");

  const handleClaimDealsGift = () => {
    if (!canClaimDealGift) return;
    addCoins(75);
    addGems(5);
    localStorage.setItem(DAILY_GIFT_FREE_KEY, dayStamp);
    refresh();
    setMsg("🎁 Получен подарок акций: +75 монет и +5 кристаллов");
    setTimeout(() => setMsg(""), 3000);
  };

  const handleClaimDealsGiftSg = () => {
    if (!canClaimDealGiftSg) return;
    const p = getCurrentProfile();
    if (!p) return;
    updateProfile({ powerPoints: (p.powerPoints || 0) + 120 });
    addCoins(150);
    localStorage.setItem(DAILY_GIFT_SG_KEY, dayStamp);
    refresh();
    setMsg("✨ Star Guardian подарок: +150 монет и +120 очков силы");
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #11284a 0%, #1b3f6e 50%, #20598f 100%)",
        display: "flex", flexDirection: "column",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: "white", position: "relative",
      }}
    >
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        background: "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%)",
        backgroundSize: "200% 100%",
        animation: "shopShimmer 6s linear infinite",
      }} />
      <style>{`
        @keyframes shopShimmer { 0% { background-position: -100% 0; } 100% { background-position: 200% 0; } }
        @keyframes shake { 0%,100% { transform: translateX(0) rotate(0deg); }
                           10%,50% { transform: translateX(-5px) rotate(-3deg); }
                           30%,70% { transform: translateX(5px) rotate(3deg); } }
        @keyframes pop { 0% { transform: scale(0.5); opacity: 0; }
                         70% { transform: scale(1.2); }
                         100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={onBack}
          style={{ background: "rgba(255,255,255,0.11)", border: "1px solid rgba(255,255,255,0.24)", borderRadius: 12, padding: "7px 16px", color: "rgba(255,255,255,0.88)", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
        >← Назад</button>
        <h2 style={{ flex: 1, textAlign: "center", margin: 0, fontSize: 22, fontWeight: 800, color: "#FFD700" }}>Магазин</h2>
        <div style={{ display: "flex", gap: 14, fontSize: 14 }}>
          <CoinBadge value={profile?.coins || 0} />
          <GemBadge value={profile?.gems || 0} />
          <PowerBadge value={profile?.powerPoints || 0} />
        </div>
      </div>

      {/* TABS */}
      <div style={{
        position: "sticky", top: 0, zIndex: 4,
        display: "flex", justifyContent: "center", gap: 6, padding: "12px 12px 6px",
        background: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.18))",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexWrap: "wrap",
      }}>
        {TABS.map(t => {
          const active = activeTab === t.id;
          const showGiftTag = t.id === "deals" && hasDealsGift;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                background: active
                  ? `linear-gradient(135deg, ${t.color}, ${t.color}aa)`
                  : "rgba(0,0,0,0.35)",
                border: `1.5px solid ${active ? t.color : "rgba(255,255,255,0.12)"}`,
                borderRadius: 12,
                padding: "9px 16px",
                color: active ? "#1A1A1A" : "white",
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: 0.5,
                cursor: "pointer",
                boxShadow: active ? `0 4px 14px ${t.color}66` : "0 2px 6px rgba(0,0,0,0.3)",
                transition: "all 150ms",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
              {showGiftTag && (
                <span style={{
                  marginLeft: 4,
                  background: "linear-gradient(135deg, #00C853, #69F0AE)",
                  color: "#003b1b",
                  fontWeight: 900,
                  fontSize: 10,
                  borderRadius: 999,
                  padding: "2px 7px",
                  border: "1px solid rgba(255,255,255,0.45)",
                  boxShadow: "0 0 10px rgba(105,240,174,0.75)",
                }}>ПОДАРОК</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, padding: "24px 20px 40px", maxWidth: 1100, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>

        {/* ── BRAWLERS TAB ── */}
        {activeTab === "brawlers" && profile && (() => {
          const locked = BRAWLERS.filter(b => !profile.unlockedBrawlers.includes(b.id));
          if (locked.length === 0) {
            return <EmptyState title="Все бойцы открыты!" subtitle="Загляни в коллекцию, чтобы прокачивать любимых героев." />;
          }
          return (
            <>
              <TabHeader title="Разблокировка бойцов" subtitle="Покупай новых героев за кристаллы" />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: 14,
              }}>
                {locked.map(b => {
                  const cost = BRAWLER_GEM_COST[b.rarity];
                  const rarityColor = CHESTS[b.rarity].borderColor;
                  const canAfford = profile.gems >= cost;
                  return (
                    <div key={b.id} style={{
                      background: `linear-gradient(180deg, ${rarityColor}22 0%, rgba(0,0,0,0.45) 100%)`,
                      border: `1.5px solid ${rarityColor}66`,
                      borderRadius: 16, padding: 12,
                      display: "flex", flexDirection: "column", alignItems: "center",
                      boxShadow: `0 0 14px ${rarityColor}33`, position: "relative",
                    }}>
                      <div style={{
                        position: "absolute", top: 8, left: 10,
                        background: rarityColor, color: "white",
                        fontSize: 9, fontWeight: 900, letterSpacing: 1,
                        borderRadius: 6, padding: "2px 7px",
                        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                      }}>{BRAWLER_RARITY_LABEL[b.rarity]}</div>
                      <div style={{
                        width: 90, height: 90, marginTop: 14,
                        background: `radial-gradient(circle at 50% 60%, ${rarityColor}55, transparent 70%)`,
                        borderRadius: 12,
                        display: "flex", alignItems: "flex-end", justifyContent: "center",
                        position: "relative",
                      }}>
                        <img
                          src={`${import.meta.env.BASE_URL}brawlers/${b.id}_front.png`}
                          alt={b.name}
                          style={{ maxWidth: "100%", maxHeight: "100%", filter: "grayscale(0.85) brightness(0.6) drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
                        />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 36, textShadow: "0 2px 6px rgba(0,0,0,0.8)", pointerEvents: "none",
                        }}>🔒</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: b.color, marginTop: 8, letterSpacing: 1 }}>{b.name}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1, fontWeight: 600, letterSpacing: 1 }}>{b.role.toUpperCase()}</div>
                      <button
                        onClick={() => handleUnlockBrawler(b.id)}
                        disabled={!canAfford}
                        style={{
                          marginTop: 10, width: "100%",
                          background: canAfford ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                          border: canAfford ? "none" : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 8, padding: "8px 0",
                          color: canAfford ? "white" : "rgba(255,255,255,0.4)",
                          fontWeight: 900, fontSize: 12, letterSpacing: 1,
                          cursor: canAfford ? "pointer" : "default",
                        }}
                      ><GemIcon size={12} /> {cost}</button>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── PETS TAB ── */}
        {activeTab === "pets" && profile && (() => {
          const lockedPets = PETS.filter(p => !profile.unlockedPets?.includes(p.id));
          if (lockedPets.length === 0) {
            return <EmptyState title="Все питомцы открыты!" subtitle="Открой страницу «Питомцы», чтобы выбрать спутника в бой." />;
          }
          return (
            <>
              <TabHeader title="Разблокировка питомцев" subtitle="Каждый питомец даёт пассивный эффект в бою" />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 14,
              }}>
                {lockedPets.map(p => {
                  const cost = PET_GEM_COST[p.rarity];
                  const canAfford = profile.gems >= cost;
                  return (
                    <div key={p.id} style={{
                      background: `linear-gradient(180deg, ${p.color}22 0%, rgba(0,0,0,0.45) 100%)`,
                      border: `1.5px solid ${p.color}66`,
                      borderRadius: 16, padding: 12,
                      display: "flex", flexDirection: "column", alignItems: "center",
                      boxShadow: `0 0 14px ${p.color}33`, position: "relative",
                    }}>
                      <div style={{
                        position: "absolute", top: 8, left: 10,
                        background: p.color, color: "white",
                        fontSize: 9, fontWeight: 900, letterSpacing: 1,
                        borderRadius: 6, padding: "2px 7px",
                        textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                      }}>{PET_RARITY_LABEL[p.rarity]}</div>
                      <div style={{
                        width: 96, height: 96, marginTop: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        filter: "grayscale(0.6) brightness(0.65)",
                      }}>
                        <PetSvg pet={p} size={88} animated={false} haloPulse={false} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: p.color, marginTop: 8, letterSpacing: 1, textAlign: "center" }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, textAlign: "center", minHeight: 26 }}>{p.effectLabel}</div>
                      <button
                        onClick={() => handleUnlockPet(p.id)}
                        disabled={!canAfford}
                        style={{
                          marginTop: 10, width: "100%",
                          background: canAfford ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                          border: canAfford ? "none" : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 8, padding: "8px 0",
                          color: canAfford ? "white" : "rgba(255,255,255,0.4)",
                          fontWeight: 900, fontSize: 12, letterSpacing: 1,
                          cursor: canAfford ? "pointer" : "default",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                        }}
                      ><GemIcon size={12} /> {cost}</button>
                    </div>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* ── CHESTS TAB ── */}
        {activeTab === "chests" && (
          <>
            <TabHeader title="Сундуки с наградами" subtitle="Покупай и открывай сундуки разной редкости" />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 14,
            }}>
              {CHEST_RARITY_ORDER.map(rarity => {
                const def = CHESTS[rarity];
                const owned = profile?.chestInventory?.[rarity] || 0;
                const canCoin = !!profile && profile.coins >= def.priceCoins;
                const canGem  = !!profile && profile.gems >= def.priceGems;
                return (
                  <div key={rarity} style={{
                    background: `linear-gradient(180deg, ${def.color}1A 0%, rgba(0,0,0,0.4) 100%)`,
                    border: `1.5px solid ${def.borderColor}55`,
                    borderRadius: 16, padding: 12,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    boxShadow: `0 0 16px ${def.color}22`,
                  }}>
                    <div
                      style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", cursor: owned > 0 ? "pointer" : "default" }}
                      onClick={() => owned > 0 && handleOpenChestRarity(rarity)}
                      title={owned > 0 ? "Нажмите, чтобы открыть" : undefined}
                    >
                      <Chest3DViewer rarity={rarity} size={84} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: def.color, marginTop: 4, textAlign: "center" }}>{def.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 2 }}>
                      {def.drops.rolls} наград · ★{def.tier}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: def.color, fontWeight: 800 }}>В инвентаре: {owned}</div>
                    <button
                      onClick={() => handleOpenChestRarity(rarity)}
                      disabled={owned < 1}
                      style={{
                        marginTop: 8, width: "100%",
                        background: owned > 0 ? `linear-gradient(135deg, ${def.color}, ${def.secondaryColor})` : "rgba(255,255,255,0.05)",
                        border: "none", borderRadius: 8, padding: "7px 0",
                        color: owned > 0 ? "white" : "rgba(255,255,255,0.4)",
                        fontWeight: 900, fontSize: 11, letterSpacing: 1,
                        cursor: owned > 0 ? "pointer" : "default",
                      }}
                    >ОТКРЫТЬ</button>
                    <div style={{ marginTop: 6, width: "100%", display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleBuyChest(rarity, "coins")}
                        disabled={!canCoin}
                        style={{
                          flex: 1, background: canCoin ? "linear-gradient(135deg, #F9A825, #FFD700)" : "rgba(255,255,255,0.05)",
                          border: "none", borderRadius: 7, padding: "6px 0",
                          color: canCoin ? "#000" : "rgba(255,255,255,0.4)",
                          fontWeight: 800, fontSize: 11, cursor: canCoin ? "pointer" : "default",
                        }}
                      ><CoinIcon size={11} /> {def.priceCoins}</button>
                      <button
                        onClick={() => handleBuyChest(rarity, "gems")}
                        disabled={!canGem}
                        style={{
                          flex: 1, background: canGem ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                          border: "none", borderRadius: 7, padding: "6px 0",
                          color: canGem ? "white" : "rgba(255,255,255,0.4)",
                          fontWeight: 800, fontSize: 11, cursor: canGem ? "pointer" : "default",
                        }}
                      ><GemIcon size={11} /> {def.priceGems}</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── DEALS / PROMOS TAB ── */}
        {activeTab === "deals" && (
          <>
            <TabHeader title="Акции и подарки" subtitle="Star Guardian, ежедневные сделки, секретный сундук и бонус дня" />

            <StarGuardianBuyCard onPurchased={refresh} onOpenRewards={onOpenStarGuardianRewards} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16, alignItems: "stretch" }}>
              <div style={{
                background: canClaimDealGift ? "rgba(105,240,174,0.09)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDealGift ? "rgba(105,240,174,0.42)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDealGift ? "#69F0AE" : "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                  Ежедневный подарок (Акции)
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>Для всех игроков: +75 монет и +5 кристаллов</div>
                <button
                  onClick={handleClaimDealsGift}
                  disabled={!canClaimDealGift}
                  style={{
                    background: canClaimDealGift ? "linear-gradient(135deg, #2E7D32, #69F0AE)" : "rgba(255,255,255,0.1)",
                    border: "none", borderRadius: 10, padding: "10px 24px",
                    color: canClaimDealGift ? "white" : "rgba(255,255,255,0.3)",
                    fontWeight: 800, fontSize: 14,
                    cursor: canClaimDealGift ? "pointer" : "not-allowed",
                  }}
                >{canClaimDealGift ? "Получить подарок" : "Уже получено сегодня"}</button>
              </div>

              <div style={{
                background: canClaimDealGiftSg ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDealGiftSg ? "rgba(255,215,0,0.42)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}>✨</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDealGiftSg ? "#FFD740" : "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                  Ежедневный подарок Star Guardian
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>Только по подписке: +150 монет и +120 очков силы</div>
                <button
                  onClick={handleClaimDealsGiftSg}
                  disabled={!canClaimDealGiftSg}
                  style={{
                    background: canClaimDealGiftSg ? "linear-gradient(135deg, #F9A825, #FFD740)" : "rgba(255,255,255,0.1)",
                    border: "none", borderRadius: 10, padding: "10px 24px",
                    color: canClaimDealGiftSg ? "#3E2723" : "rgba(255,255,255,0.3)",
                    fontWeight: 800, fontSize: 14,
                    cursor: canClaimDealGiftSg ? "pointer" : "not-allowed",
                  }}
                >{canClaimDealGiftSg ? "Получить SG подарок" : (sgActive ? "Уже получено сегодня" : "Нужна подписка")}</button>
              </div>

              <div style={{
                background: canClaimDaily ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDaily ? "rgba(76,175,80,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}><CoinIcon size={44} /></div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDaily ? "#4CAF50" : "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                  Ежедневный бонус
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
                  {dailyReward
                    ? `${canClaimDaily ? "Сегодня" : "Следующая"} награда: ${dailyReward.label}`
                    : "Ежедневная награда"}
                </div>
                <button
                  onClick={handleDailyBonus}
                  disabled={!canClaimDaily}
                  style={{
                    background: canClaimDaily ? "linear-gradient(135deg, #2E7D32, #4CAF50)" : "rgba(255,255,255,0.1)",
                    border: "none", borderRadius: 10, padding: "10px 24px",
                    color: canClaimDaily ? "white" : "rgba(255,255,255,0.3)",
                    fontWeight: 800, fontSize: 14,
                    cursor: canClaimDaily ? "pointer" : "not-allowed",
                  }}
                >{canClaimDaily ? "Получить!" : "Уже получено"}</button>
              </div>

            </div>

            <div style={{ marginTop: 16 }}>
              <DailyDealsSection onPurchased={refresh} />
            </div>
          </>
        )}

        {activeTab === "stars" && (
          <>
            <TabHeader title="Звёзды персонажей" subtitle="6 уникальных звёзд на каждого бойца: пассивные усиления и эффекты." />
            {!profile?.unlockedBrawlers?.length && (
              <EmptyState title="Сначала открой бойца" subtitle="Звезды покупаются только для уже открытых персонажей." />
            )}
            {(() => {
              const stars = profile?.brawlerStars?.[starsBrawlerId] || [];
              const missing = Math.max(0, 6 - stars.length);
              return (
                <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {BRAWLERS.filter(b => profile?.unlockedBrawlers?.includes(b.id)).map(b => (
                <button
                  key={b.id}
                  onClick={() => setStarsBrawlerId(b.id)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${starsBrawlerId === b.id ? b.color : "rgba(255,255,255,0.2)"}`,
                    background: starsBrawlerId === b.id ? `${b.color}33` : "rgba(0,0,0,0.35)",
                    color: "white",
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {b.name} · {getBrawlerStarsCount(profile, b.id)}/6
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {(BRAWLER_CONSTELLATIONS[starsBrawlerId] || []).map(star => {
                const opened = (profile?.brawlerStars?.[starsBrawlerId] || []).includes(star.index);
                return (
                  <div key={star.index} style={{
                    background: opened ? "linear-gradient(180deg, rgba(255,215,0,0.18), rgba(0,0,0,0.48))" : "rgba(0,0,0,0.42)",
                    border: `1px solid ${opened ? "rgba(255,215,0,0.6)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius: 14,
                    padding: 12,
                  }}>
                    <div style={{ fontSize: 18 }}>{star.icon} {star.name}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.74)", minHeight: 36 }}>{star.effect}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: opened ? "#FFD740" : "rgba(255,255,255,0.45)" }}>
                      {opened ? "Открыто" : "Не открыто"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {missing > 0 && <button
                onClick={() => {
                  if (!profile?.unlockedBrawlers?.includes(starsBrawlerId)) {
                    setMsg("Можно купить только для открытого бойца");
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }
                  const stars = profile?.brawlerStars?.[starsBrawlerId] || [];
                  const next = [1, 2, 3, 4, 5, 6].find(i => !stars.includes(i));
                  if (!next) { setMsg("Все звезды уже открыты"); setTimeout(() => setMsg(""), 2200); return; }
                  const r = buyBrawlerStarWithGems(starsBrawlerId, next);
                  setMsg(r.success ? "Звезда куплена за гемы" : (r.error || "Ошибка"));
                  refresh();
                  setTimeout(() => setMsg(""), 2200);
                }}
                style={{ background: "linear-gradient(135deg, #0288D1, #40C4FF)", border: "none", borderRadius: 10, padding: "10px 16px", color: "white", fontWeight: 800, cursor: "pointer" }}
              >
                Купить 1 звезду за {STAR_COST_GEMS} 💎
              </button>}
              {missing >= 3 && <button
                onClick={() => {
                  if (!profile?.unlockedBrawlers?.includes(starsBrawlerId)) {
                    setMsg("Можно купить только для открытого бойца");
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }
                  const r = buyBrawlerStarsPackWithGems(starsBrawlerId);
                  setMsg(r.success ? "Пакет из 3 звезд куплен" : (r.error || "Ошибка"));
                  refresh();
                  setTimeout(() => setMsg(""), 2200);
                }}
                style={{ background: "linear-gradient(135deg, #F9A825, #FFD740)", border: "none", borderRadius: 10, padding: "10px 16px", color: "#3E2723", fontWeight: 800, cursor: "pointer" }}
              >
                Пакет 3 звезды за {STAR_PACK3_COST_GEMS} 💎
              </button>}
              {missing === 0 && (
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                  Все звёзды уже куплены
                </div>
              )}
              <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                Цена за ₽: 1 звезда — {STAR_COST_RUB} ₽, пакет — {STAR_PACK3_COST_RUB} ₽ (UI)
              </div>
            </div>
                </>
              );
            })()}
          </>
        )}

        {/* ── DONATE TAB ── */}
        {activeTab === "donate" && (
          <>
            <TabHeader title="Донат" subtitle="Покупка кристаллов, монет и очков силы за рубли. Конвертация кристаллов." />
            <DonateTabContent onPurchased={refresh} />
          </>
        )}

        {msg && (
          <div style={{
            marginTop: 18, textAlign: "center", background: "rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "14px",
            color: "#FFD700", fontWeight: 700, fontSize: 16,
          }}>{msg}</div>
        )}
      </div>

      {chestAnimating && <ChestOpenAnimation rarity={chestAnimating.rarity} onDone={handleChestAnimationDone} />}
      {chestOpening && <ChestOpenModal rarity={chestOpening.rarity} rolls={chestOpening.rolls} onClose={() => setChestOpening(null)} />}
      {purchasedBrawler && <BrawlerRevealModal brawlerId={purchasedBrawler} onDone={() => setPurchasedBrawler(null)} />}
      {purchasedPet && <PetRevealModal petId={purchasedPet} onDone={() => setPurchasedPet(null)} />}
      {pendingReward && <RewardDropModal reward={pendingReward} onDone={() => setPendingReward(null)} />}
    </div>
  );
}

function TabHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: 16, paddingLeft: 4 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: "white", letterSpacing: 0.5 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>{subtitle}</div>
      )}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{
      padding: "48px 20px", textAlign: "center",
      background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
    }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#FFD700", marginBottom: 8 }}>✨ {title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{subtitle}</div>}
    </div>
  );
}
