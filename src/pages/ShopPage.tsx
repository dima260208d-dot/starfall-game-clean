import { useState, useEffect, useRef } from "react";
import { getCurrentProfile, addGems, addCoins, updateProfile, claimDailyLadderReward, buyChest, openChest, canClaimDailyLadder, unlockBrawlerWithGems, unlockPetWithGems } from "../utils/localStorageAPI";
import { PETS, PET_RARITY_LABEL } from "../entities/PetData";
import PetSvg from "../components/PetSvg";
import PetRevealModal from "../components/PetRevealModal";
import RewardDropModal, { type RewardInfo } from "../components/RewardDropModal";
import { CHESTS, CHEST_RARITY_ORDER, CHEST_CARD_TINT, type ChestRarity, type ChestRoll } from "../utils/chests";
import { getEffectiveBrawlerGemCost, getEffectivePetGemCost, getEffectiveStarCosts, getEffectiveConstellation } from "../utils/characterBalance";
import { BRAWLERS, BRAWLER_RARITY_LABEL } from "../entities/BrawlerData";
import Chest3DViewer from "../components/Chest3DViewer";
import ChestOpenAnimation from "../components/ChestOpenAnimation";
import ChestOpenModal from "../components/ChestOpenModal";
import BrawlerRevealModal from "../components/BrawlerRevealModal";
import { CoinBadge, GemBadge, PowerBadge, CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import DailyDealsSection from "../components/DailyDealsSection";
import StarGuardianBuyCard from "../components/StarGuardianBuyCard";
import DonateTabContent from "../components/DonateTabContent";
import { getBrawlerStarsCount, buyBrawlerStarWithGems, buyBrawlerStarsPackWithGems } from "../utils/localStorageAPI";
import { DAILY_GIFT_FREE_KEY, getTodayStamp, isAnyDealsGiftAvailable, isShopDealsNew } from "../utils/shopDailyGifts";
import { bumpDealsPreviewIfNeeded } from "../utils/dailyDealsSeen";
import { isStarGuardianActive, claimMainDaily, isMainDailyAvailable, MAIN_DAILY_COINS, MAIN_DAILY_GEMS, MAIN_DAILY_POWER } from "../utils/subscription";
import { formatGameDayCountdown } from "../utils/gameDay";
import { dailyLadderTimeLeft } from "../utils/localStorageAPI";
import { getRewardForDay } from "../utils/dailyLadder";
import { PageBg } from "../components/PageChrome";
import {
  useI18n,
  chestName,
  brawlerRarityLabel,
  petRarityLabel,
  brawlerName,
  petName,
  starName,
  starEffect,
} from "../i18n";
import { shopBtnLabel, shopLabelOnFill } from "../components/shop/shopButtonStyles";

interface ShopPageProps {
  onBack: () => void;
  onOpenStarGuardianRewards?: () => void;
}

type ShopTab = "brawlers" | "pets" | "chests" | "deals" | "stars" | "donate";

const TABS: { id: ShopTab; labelKey: string; icon: string; color: string }[] = [
  { id: "brawlers", labelKey: "shop.tab.brawlers", icon: "⚔️", color: "#40C4FF" },
  { id: "pets",     labelKey: "shop.tab.pets",     icon: "🐾", color: "#69F0AE" },
  { id: "chests",   labelKey: "shop.tab.chests",   icon: "📦", color: "#FFD740" },
  { id: "deals",    labelKey: "shop.tab.deals",    icon: "🔥", color: "#FF6E40" },
  { id: "stars",    labelKey: "shop.tab.stars",    icon: "✨", color: "#FFD740" },
  { id: "donate",   labelKey: "shop.tab.donate",   icon: "💎", color: "#E91E63" },
];

export default function ShopPage({ onBack, onOpenStarGuardianRewards }: ShopPageProps) {
  const { t } = useI18n();
  useState(() => {
    bumpDealsPreviewIfNeeded();
    return 0;
  });
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
    else { setMsg(r.error || t("common.error")); setTimeout(() => setMsg(""), 2200); }
  };

  const handleUnlockBrawler = (brawlerId: string) => {
    const r = unlockBrawlerWithGems(brawlerId);
    if (r.success) { refresh(); setPurchasedBrawler(brawlerId); }
    else { setMsg(r.error || t("common.error")); setTimeout(() => setMsg(""), 2200); }
  };

  const handleBuyChest = (rarity: ChestRarity) => {
    const r = buyChest(rarity, "gems");
    setMsg(r.success ? t("common.chestPurchased", { name: chestName(rarity) }) : (r.error || t("common.error")));
    refresh();
    setTimeout(() => setMsg(""), 2000);
  };

  const handleOpenChestRarity = (rarity: ChestRarity) => {
    const r = openChest(rarity);
    if (!r.success) { setMsg(r.error || t("common.error")); setTimeout(() => setMsg(""), 2000); return; }
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
    const interval = setInterval(() => {
      refresh();
      setBonusResetMs(dailyLadderTimeLeft(getCurrentProfile()));
    }, 1000);
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
      setMsg(t("shop.deals.bonusAlreadyClaimed"));
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const passXpTargetRef = useRef<HTMLDivElement>(null);
  const [bonusResetMs, setBonusResetMs] = useState(dailyLadderTimeLeft(profile));
  const canClaimDaily = !!profile && canClaimDailyLadder(profile);
  const dailyReward = profile ? getRewardForDay(profile.dailyLadderDay) : null;
  const canClaimDealGift = localStorage.getItem(DAILY_GIFT_FREE_KEY) !== dayStamp;
  const sgActive = isStarGuardianActive();
  const canClaimDealGiftSg = sgActive && isMainDailyAvailable();
  const hasDealsGift = isAnyDealsGiftAvailable();
  const hasDealsNew = isShopDealsNew();
  const [starsBrawlerId, setStarsBrawlerId] = useState<string>(() => getCurrentProfile()?.unlockedBrawlers?.[0] || "hana");

  const handleClaimDealsGift = () => {
    if (!canClaimDealGift) return;
    addCoins(75);
    addGems(5);
    localStorage.setItem(DAILY_GIFT_FREE_KEY, dayStamp);
    refresh();
    setMsg(t("shop.deals.giftClaimedMsg"));
    setTimeout(() => setMsg(""), 3000);
  };

  const handleClaimDealsGiftSg = () => {
    if (!canClaimDealGiftSg) return;
    const r = claimMainDaily();
    if (!r.claimed) return;
    refresh();
    setMsg(t("shop.deals.sgGiftClaimedMsg", {
      coins: MAIN_DAILY_COINS,
      gems: MAIN_DAILY_GEMS,
      power: MAIN_DAILY_POWER,
    }));
    setTimeout(() => setMsg(""), 3000);
  };

  return (
    <PageBg
      variant="shop"
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: "white",
        overflow: "hidden",
        minHeight: "100%",
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
        @keyframes newMapPulse {
          0%, 100% { box-shadow: 0 0 18px rgba(255,235,59,0.45); }
          50% { box-shadow: 0 0 32px rgba(255,193,7,0.85); }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          type="button"
          onClick={onBack}
          style={shopBtnLabel(
            "rgba(255,255,255,0.14)",
            "rgba(255,255,255,0.95)",
            { borderRadius: 12, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700 },
          )}
        >{t("common.back")}</button>
        <h2 style={{ flex: 1, textAlign: "center", margin: 0, fontSize: 22, fontWeight: 800, color: "#FFD700" }}>{t("shop.title")}</h2>
        <div style={{ display: "flex", gap: 14, fontSize: 14, alignItems: "center" }}>
          <div ref={passXpTargetRef} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 10, fontWeight: 800, color: "rgba(255,213,79,0.85)",
            letterSpacing: 0.5,
          }}>
            {t("shop.starPassBadge")}
          </div>
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
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const showGiftTag = tab.id === "deals" && hasDealsGift;
          const showDealsNewTag = tab.id === "deals" && hasDealsNew;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={shopBtnLabel(
                active ? `linear-gradient(135deg, ${tab.color}, ${tab.color}aa)` : "rgba(0,0,0,0.35)",
                active ? shopLabelOnFill(tab.color) : "#ffffff",
                {
                  borderRadius: 12,
                  padding: "9px 16px",
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: 0.5,
                  cursor: "pointer",
                  boxShadow: active ? `0 4px 14px ${tab.color}66` : "0 2px 6px rgba(0,0,0,0.3)",
                  transition: "all 150ms",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                },
                active ? tab.color : "rgba(255,255,255,0.12)",
              )}
            >
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              {t(tab.labelKey)}
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
                }}>{t("common.gift")}</span>
              )}
              {showDealsNewTag && (
                <span style={{
                  marginLeft: 4,
                  background: "linear-gradient(135deg, #FF1744, #D50000)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 10,
                  borderRadius: 999,
                  padding: "2px 7px",
                  border: "1px solid rgba(255,255,255,0.45)",
                  boxShadow: "0 0 10px rgba(255,23,68,0.75)",
                }}>{t("common.new")}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",
        padding: "24px 20px 40px",
        maxWidth: 1100,
        margin: "0 auto",
        width: "100%",
        position: "relative",
        zIndex: 1,
      }}>

        {/* ── BRAWLERS TAB ── */}
        {activeTab === "brawlers" && profile && (() => {
          const locked = BRAWLERS.filter(b => !profile.unlockedBrawlers.includes(b.id));
          if (locked.length === 0) {
            return <EmptyState title={t("shop.brawlers.emptyTitle")} subtitle={t("shop.brawlers.emptySubtitle")} />;
          }
          return (
            <>
              <TabHeader title={t("shop.brawlers.header")} subtitle={t("shop.brawlers.subtitle")} />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
                gap: 14,
              }}>
                {locked.map(b => {
                  const cost = getEffectiveBrawlerGemCost(b.rarity);
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
                      }}>{brawlerRarityLabel(b.rarity, BRAWLER_RARITY_LABEL[b.rarity])}</div>
                      <div style={{
                        width: 90, height: 90, marginTop: 14,
                        background: `radial-gradient(circle at 50% 60%, ${rarityColor}55, transparent 70%)`,
                        borderRadius: 12,
                        display: "flex", alignItems: "flex-end", justifyContent: "center",
                        position: "relative",
                      }}>
                        <img
                          src={`${import.meta.env.BASE_URL}brawlers/${b.id}_front.png`}
                          alt={brawlerName(b.id, b.name)}
                          style={{ maxWidth: "100%", maxHeight: "100%", filter: "grayscale(0.85) brightness(0.6) drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
                        />
                        <div style={{
                          position: "absolute", inset: 0,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 36, textShadow: "0 2px 6px rgba(0,0,0,0.8)", pointerEvents: "none",
                        }}>🔒</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: b.color, marginTop: 8, letterSpacing: 1 }}>{brawlerName(b.id, b.name)}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1, fontWeight: 600, letterSpacing: 1 }}>{b.role.toUpperCase()}</div>
                      <button
                        type="button"
                        onClick={() => handleUnlockBrawler(b.id)}
                        disabled={!canAfford}
                        style={shopBtnLabel(
                          canAfford ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                          canAfford ? "#ffffff" : "rgba(255,255,255,0.55)",
                          {
                            marginTop: 10, width: "100%", borderRadius: 8, padding: "8px 0",
                            fontWeight: 900, fontSize: 12, letterSpacing: 1,
                            cursor: canAfford ? "pointer" : "default",
                            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                          },
                        )}
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
            return <EmptyState title={t("shop.pets.emptyTitle")} subtitle={t("shop.pets.emptySubtitle")} />;
          }
          return (
            <>
              <TabHeader title={t("shop.pets.header")} subtitle={t("shop.pets.subtitle")} />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                gap: 14,
              }}>
                {lockedPets.map(p => {
                  const cost = getEffectivePetGemCost(p.rarity);
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
                      }}>{petRarityLabel(p.rarity, PET_RARITY_LABEL[p.rarity])}</div>
                      <div style={{
                        width: 96, height: 96, marginTop: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        filter: "grayscale(0.6) brightness(0.65)",
                      }}>
                        <PetSvg pet={p} size={88} animated={false} haloPulse={false} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: p.color, marginTop: 8, letterSpacing: 1, textAlign: "center" }}>{petName(p.id, p.name)}</div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 2, textAlign: "center", minHeight: 26 }}>{p.effectLabel}</div>
                      <button
                        type="button"
                        onClick={() => handleUnlockPet(p.id)}
                        disabled={!canAfford}
                        style={shopBtnLabel(
                          canAfford ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                          canAfford ? "#ffffff" : "rgba(255,255,255,0.55)",
                          {
                            marginTop: 10, width: "100%", borderRadius: 8, padding: "8px 0",
                            fontWeight: 900, fontSize: 12, letterSpacing: 1,
                            cursor: canAfford ? "pointer" : "default",
                            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                          },
                        )}
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
            <TabHeader title={t("shop.chests.header")} subtitle={t("shop.chests.subtitle")} />
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 14,
            }}>
              {CHEST_RARITY_ORDER.map(rarity => {
                const def = CHESTS[rarity];
                const owned = profile?.chestInventory?.[rarity] || 0;
                const canGem  = !!profile && profile.gems >= def.priceGems;
                return (
                  <div key={rarity} style={{
                    background: CHEST_CARD_TINT[rarity],
                    border: `1.5px solid ${def.borderColor}55`,
                    borderRadius: 16, padding: 12,
                    display: "flex", flexDirection: "column", alignItems: "center",
                    boxShadow: `0 0 16px ${def.color}22`,
                  }}>
                    <div
                      style={{ height: 90, display: "flex", alignItems: "center", justifyContent: "center", cursor: owned > 0 ? "pointer" : "default" }}
                      onClick={() => owned > 0 && handleOpenChestRarity(rarity)}
                      title={owned > 0 ? t("common.tapToOpen") : undefined}
                    >
                      <Chest3DViewer rarity={rarity} size={84} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 900, color: def.color, marginTop: 4, textAlign: "center" }}>{chestName(rarity)}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textAlign: "center", marginTop: 2 }}>
                      {t("common.resourcesRolls", { rolls: def.drops.rolls, tier: def.tier })}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: def.color, fontWeight: 800 }}>{t("shop.chests.inInventory", { count: owned })}</div>
                    <button
                      type="button"
                      onClick={() => handleOpenChestRarity(rarity)}
                      disabled={owned < 1}
                      style={shopBtnLabel(
                        owned > 0 ? `linear-gradient(135deg, ${def.color}, ${def.secondaryColor})` : "rgba(255,255,255,0.05)",
                        owned > 0 ? "#ffffff" : "rgba(255,255,255,0.55)",
                        {
                          marginTop: 8, width: "100%", borderRadius: 8, padding: "7px 0",
                          fontWeight: 900, fontSize: 11, letterSpacing: 1,
                          cursor: owned > 0 ? "pointer" : "default",
                        },
                      )}
                    >{t("common.open")}</button>
                    <button
                      type="button"
                      onClick={() => handleBuyChest(rarity)}
                      disabled={!canGem}
                      style={shopBtnLabel(
                        canGem ? "linear-gradient(135deg, #0288D1, #40C4FF)" : "rgba(255,255,255,0.05)",
                        canGem ? "#ffffff" : "rgba(255,255,255,0.55)",
                        {
                          marginTop: 6, width: "100%", borderRadius: 7, padding: "6px 0",
                          fontWeight: 800, fontSize: 11, cursor: canGem ? "pointer" : "default",
                          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4,
                        },
                      )}
                    ><GemIcon size={11} /> {def.priceGems}</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ── DEALS / PROMOS TAB ── */}
        {activeTab === "deals" && (
          <>
            <TabHeader title={t("shop.deals.header")} subtitle={t("shop.deals.subtitle")} />

            <StarGuardianBuyCard onPurchased={refresh} onOpenRewards={onOpenStarGuardianRewards} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginTop: 16, alignItems: "stretch" }}>
              <div style={{
                background: canClaimDealGift ? "rgba(105,240,174,0.09)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDealGift ? "rgba(105,240,174,0.42)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}>🎁</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDealGift ? "#69F0AE" : "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                  {t("shop.deals.dailyGift")}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>{t("shop.deals.dailyGiftDesc")}</div>
                <button
                  type="button"
                  onClick={handleClaimDealsGift}
                  disabled={!canClaimDealGift}
                  style={shopBtnLabel(
                    canClaimDealGift ? "linear-gradient(135deg, #2E7D32, #69F0AE)" : "rgba(255,255,255,0.1)",
                    canClaimDealGift ? "#ffffff" : "rgba(255,255,255,0.45)",
                    {
                      borderRadius: 10, padding: "10px 24px",
                      fontWeight: 800, fontSize: 14,
                      cursor: canClaimDealGift ? "pointer" : "not-allowed",
                    },
                  )}
                >{canClaimDealGift ? t("shop.deals.claimGift") : t("shop.deals.giftClaimed")}</button>
              </div>

              <div style={{
                background: canClaimDealGiftSg ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDealGiftSg ? "rgba(255,215,0,0.42)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}>✨</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDealGiftSg ? "#FFD740" : "rgba(255,255,255,0.45)", marginBottom: 6 }}>
                  {t("shop.deals.sgGift")}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 14 }}>{t("shop.deals.sgGiftDesc")}</div>
                <button
                  type="button"
                  onClick={handleClaimDealsGiftSg}
                  disabled={!canClaimDealGiftSg}
                  style={shopBtnLabel(
                    canClaimDealGiftSg ? "linear-gradient(135deg, #F9A825, #FFD740)" : "rgba(255,255,255,0.1)",
                    canClaimDealGiftSg ? shopLabelOnFill("#FFD740") : "rgba(255,255,255,0.45)",
                    {
                      borderRadius: 10, padding: "10px 24px",
                      fontWeight: 800, fontSize: 14,
                      cursor: canClaimDealGiftSg ? "pointer" : "not-allowed",
                    },
                  )}
                >{canClaimDealGiftSg ? t("shop.deals.claimSgGift") : (sgActive ? t("shop.deals.giftClaimed") : t("shop.deals.needSubscription"))}</button>
              </div>

              <div style={{
                background: canClaimDaily ? "rgba(76,175,80,0.1)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canClaimDaily ? "rgba(76,175,80,0.4)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 20, padding: 24,
              }}>
                <div style={{ marginBottom: 8 }}><CoinIcon size={44} /></div>
                <div style={{ fontSize: 18, fontWeight: 800, color: canClaimDaily ? "#4CAF50" : "rgba(255,255,255,0.4)", marginBottom: 6 }}>
                  {t("shop.deals.dailyBonus")}
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>
                  {dailyReward
                    ? t("shop.deals.dailyRewardLabel", {
                      when: canClaimDaily ? t("shop.deals.dailyRewardToday") : t("shop.deals.dailyRewardNext"),
                      label: dailyReward.label,
                    })
                    : t("shop.deals.dailyRewardFallback")}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 14 }}>
                  {t("shop.deals.resetsIn", { time: formatGameDayCountdown(bonusResetMs) })}
                </div>
                <button
                  type="button"
                  onClick={handleDailyBonus}
                  disabled={!canClaimDaily}
                  style={shopBtnLabel(
                    canClaimDaily ? "linear-gradient(135deg, #2E7D32, #4CAF50)" : "rgba(255,255,255,0.1)",
                    canClaimDaily ? "#ffffff" : "rgba(255,255,255,0.45)",
                    {
                      borderRadius: 10, padding: "10px 24px",
                      fontWeight: 800, fontSize: 14,
                      cursor: canClaimDaily ? "pointer" : "not-allowed",
                    },
                  )}
                >{canClaimDaily ? t("shop.deals.claimBonus") : t("shop.deals.bonusClaimed")}</button>
              </div>

            </div>

            <div style={{ marginTop: 16 }}>
              <DailyDealsSection onPurchased={refresh} passXpTargetRef={passXpTargetRef} />
            </div>
          </>
        )}

        {activeTab === "stars" && (
          <>
            <TabHeader title={t("shop.stars.header")} subtitle={t("shop.stars.subtitle")} />
            {!profile?.unlockedBrawlers?.length && (
              <EmptyState title={t("shop.stars.needBrawlerTitle")} subtitle={t("shop.stars.needBrawlerSubtitle")} />
            )}
            {(() => {
              const starCosts = getEffectiveStarCosts();
              const stars = profile?.brawlerStars?.[starsBrawlerId] || [];
              const missing = Math.max(0, 6 - stars.length);
              return (
                <>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
              {BRAWLERS.filter(b => profile?.unlockedBrawlers?.includes(b.id)).map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setStarsBrawlerId(b.id)}
                  style={shopBtnLabel(
                    starsBrawlerId === b.id ? `${b.color}55` : "rgba(0,0,0,0.35)",
                    "#ffffff",
                    {
                      borderRadius: 999,
                      padding: "6px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    },
                    starsBrawlerId === b.id ? b.color : "rgba(255,255,255,0.2)",
                  )}
                >
                  {brawlerName(b.id, b.name)} · {getBrawlerStarsCount(profile, b.id)}/6
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
              {(getEffectiveConstellation(starsBrawlerId)).map(star => {
                const opened = (profile?.brawlerStars?.[starsBrawlerId] || []).includes(star.index);
                return (
                  <div key={star.index} style={{
                    background: opened ? "linear-gradient(180deg, rgba(255,215,0,0.18), rgba(0,0,0,0.48))" : "rgba(0,0,0,0.42)",
                    border: `1px solid ${opened ? "rgba(255,215,0,0.6)" : "rgba(255,255,255,0.12)"}`,
                    borderRadius: 14,
                    padding: 12,
                  }}>
                    <div style={{ fontSize: 18 }}>{star.icon} {starName(starsBrawlerId, star.index, star.name)}</div>
                    <div style={{ marginTop: 6, fontSize: 12, color: "rgba(255,255,255,0.74)", minHeight: 36 }}>{starEffect(starsBrawlerId, star.index, star.effect)}</div>
                    <div style={{ marginTop: 8, fontSize: 11, color: opened ? "#FFD740" : "rgba(255,255,255,0.45)" }}>
                      {opened ? t("shop.stars.opened") : t("shop.stars.notOpened")}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {missing > 0 && <button
                onClick={() => {
                  if (!profile?.unlockedBrawlers?.includes(starsBrawlerId)) {
                    setMsg(t("shop.stars.onlyUnlocked"));
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }
                  const stars = profile?.brawlerStars?.[starsBrawlerId] || [];
                  const next = [1, 2, 3, 4, 5, 6].find(i => !stars.includes(i));
                  if (!next) { setMsg(t("shop.stars.allUnlocked")); setTimeout(() => setMsg(""), 2200); return; }
                  const r = buyBrawlerStarWithGems(starsBrawlerId, next);
                  setMsg(r.success ? t("shop.stars.purchased") : (r.error || t("common.error")));
                  refresh();
                  setTimeout(() => setMsg(""), 2200);
                }}
                style={shopBtnLabel(
                  "linear-gradient(135deg, #0288D1, #40C4FF)",
                  "#ffffff",
                  { borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer" },
                )}
              >
                {t("shop.stars.buyOne", { cost: starCosts.singleGems })}
              </button>}
              {missing >= 3 && <button
                onClick={() => {
                  if (!profile?.unlockedBrawlers?.includes(starsBrawlerId)) {
                    setMsg(t("shop.stars.onlyUnlocked"));
                    setTimeout(() => setMsg(""), 2200);
                    return;
                  }
                  const r = buyBrawlerStarsPackWithGems(starsBrawlerId);
                  setMsg(r.success ? t("shop.stars.packPurchased") : (r.error || t("common.error")));
                  refresh();
                  setTimeout(() => setMsg(""), 2200);
                }}
                style={shopBtnLabel(
                  "linear-gradient(135deg, #F9A825, #FFD740)",
                  shopLabelOnFill("#FFD740"),
                  { borderRadius: 10, padding: "10px 16px", fontWeight: 800, cursor: "pointer" },
                )}
              >
                {t("shop.stars.buyPack", { cost: starCosts.pack3Gems })}
              </button>}
              {missing === 0 && (
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                  {t("shop.stars.allOwned")}
                </div>
              )}
              <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
                {t("shop.stars.rubPriceNote", { single: starCosts.singleRub, pack: starCosts.pack3Rub })}
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
            <TabHeader title={t("shop.donate.header")} subtitle={t("shop.donate.subtitle")} />
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
    </PageBg>
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
