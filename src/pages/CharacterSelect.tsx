import { forwardRef, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BRAWLERS, BRAWLER_RARITY_LABEL, getBrawlerById, getScaledStats } from "../entities/BrawlerData";
import { getEffectiveBrawlerGemCost, getEffectiveBrawlerLore, getEffectiveConstellation, subscribeCharacterBalanceChanges } from "../utils/characterBalance";
import { PREVIEW_BRAWLERS, isPreviewBrawler } from "../entities/PreviewBrawlers";
import { CHESTS, CHEST_RARITY_ORDER } from "../utils/chests";
import {
  getCurrentProfile,
  upgradeBrawler,
  upgradeBrawlerCost,
  unlockBrawlerWithGems,
  isBrawlerUnlocked,
  MAX_BRAWLER_LEVEL,
  getBrawlerTrophies,
  getBrawlerRank,
  MAX_BRAWLER_RANK,
  markBrawlerSeen,
  getBrawlerStarsCount,
  getBrawlerStars,
  getUnclaimedBrawlerRankCount,
  getUnclaimedBrawlerMasteryCount,
  setEquippedMasteryTitle,
} from "../utils/localStorageAPI";
import BrawlerViewer3D from "../components/BrawlerViewer3D";
import BrawlerRankRewardsModal from "../components/BrawlerRankRewardsModal";
import BrawlerRankBar, { RankBadgeIcon } from "../components/BrawlerRankBar";
import { computeBrawlerRankBarState, MENU_RANK_BADGE_SCALE, rankBadgePixelSize } from "../utils/brawlerRankUI";
import WinStreakFlame from "../components/WinStreakFlame";
import { getBrawlerWinStreak, isWinStreakVisible } from "../utils/winStreak";
import PinSelectModal from "../components/PinSelectModal";
import { CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import BrawlerConstellationView from "../components/BrawlerConstellationView";
import GlowingStar, { GlowingStarStyles } from "../components/GlowingStar";
import { PageBody } from "../components/PageChrome";
import {
  useI18n,
  brawlerLore,
  brawlerDescription,
  brawlerAttackDesc,
  brawlerSuperDesc,
  brawlerName,
  brawlerRole,
  brawlerAttackName,
  brawlerSuperName,
  brawlerRarityLabel,
  starName,
  starEffect,
} from "../i18n";

import { getBrawlerDisplayName } from "../utils/brawlerDisplay";

// Per-rarity card background (the avatar tile) — matches Brawl Stars colour code:
// Legendary = yellow, Ultralegendary = rainbow, Mythic = red, Mega = orange,
// Epic = purple, Rare = green.
export const RARITY_AVATAR_BG: Record<string, string> = {
  rare:           "linear-gradient(180deg, #66BB6A 0%, #2E7D32 100%)",
  epic:           "linear-gradient(180deg, #AB47BC 0%, #4A148C 100%)",
  mega:           "linear-gradient(180deg, #FFA726 0%, #E65100 100%)",
  mythic:         "linear-gradient(180deg, #EF5350 0%, #B71C1C 100%)",
  legendary:      "linear-gradient(180deg, #FFEB3B 0%, #FBC02D 100%)",
  ultralegendary: "linear-gradient(180deg, #FF1744 0%, #FFEA00 25%, #00E676 50%, #00B0FF 75%, #D500F9 100%)",
};

/** Name plate in character detail — rarity-colored like reference banners. */
const RARITY_NAME_PLATE: Record<string, { background: string; border: string; rarityColor: string }> = {
  rare: {
    background: "linear-gradient(160deg, rgba(46,125,50,0.92) 0%, rgba(27,94,32,0.96) 100%)",
    border: "2px solid #81C784",
    rarityColor: "#C8E6C9",
  },
  epic: {
    background: "linear-gradient(160deg, rgba(106,27,154,0.92) 0%, rgba(74,20,140,0.96) 100%)",
    border: "2px solid #CE93D8",
    rarityColor: "#E1BEE7",
  },
  mega: {
    background: "linear-gradient(160deg, rgba(239,108,0,0.92) 0%, rgba(191,54,12,0.96) 100%)",
    border: "2px solid #FFB74D",
    rarityColor: "#FFE0B2",
  },
  mythic: {
    background: "linear-gradient(160deg, rgba(198,40,40,0.92) 0%, rgba(136,14,14,0.96) 100%)",
    border: "2px solid #EF9A9A",
    rarityColor: "#FFCDD2",
  },
  legendary: {
    background: "linear-gradient(160deg, rgba(255,235,59,0.94) 0%, rgba(251,192,45,0.98) 100%)",
    border: "2px solid #FFEB3B",
    rarityColor: "#FFFDE7",
  },
  ultralegendary: {
    background: "linear-gradient(135deg, #1a0a2e 0%, #6a1b9a 22%, #c2185b 42%, #f9a825 58%, #00838f 74%, #4527a0 100%)",
    border: "2px solid #E8C547",
    rarityColor: "#FFE082",
  },
};

const GRID_RANK_BADGE_SIZE = rankBadgePixelSize(MENU_RANK_BADGE_SCALE, "compact");

export type BrawlerSortKey = "rarity" | "name" | "level" | "hp" | "damage" | "speed" | "range";

const SORT_KEYS: BrawlerSortKey[] = ["rarity", "name", "level", "hp", "damage", "speed", "range"];

export function sortBrawlers(
  list: typeof BRAWLERS,
  key: BrawlerSortKey,
  brawlerLevels: Record<string, number>,
): typeof BRAWLERS {
  const arr = [...list];
  arr.sort((a, b) => {
    switch (key) {
      case "rarity": {
        const da = CHEST_RARITY_ORDER.indexOf(b.rarity) - CHEST_RARITY_ORDER.indexOf(a.rarity);
        return da !== 0 ? da : a.name.localeCompare(b.name);
      }
      case "name":   return a.name.localeCompare(b.name);
      case "level":  return (brawlerLevels[b.id] || 1) - (brawlerLevels[a.id] || 1);
      case "hp":     return b.hp - a.hp;
      case "damage": return b.attackDamage - a.attackDamage;
      case "speed":  return b.speed - a.speed;
      case "range":  return b.attackRange - a.attackRange;
    }
  });
  return arr;
}

/** Unlocked fighters first; locked + coming-soon preview roster at the bottom. */
export function partitionCharacterRoster(
  profile: { unlockedBrawlers: string[]; brawlerLevels: Record<string, number> },
  sortKey: BrawlerSortKey,
): { main: typeof BRAWLERS; locked: typeof BRAWLERS } {
  const unlockedSet = new Set(profile.unlockedBrawlers);
  const main = BRAWLERS.filter(b => unlockedSet.has(b.id));
  const locked = [
    ...BRAWLERS.filter(b => !unlockedSet.has(b.id)),
    ...PREVIEW_BRAWLERS,
  ];
  return {
    main: sortBrawlers(main, sortKey, profile.brawlerLevels),
    locked: sortBrawlers(locked, sortKey, profile.brawlerLevels),
  };
}

interface CharacterSelectProps {
  onPickAsActive: (brawlerId: string) => void;
  onTraining: (brawlerId: string) => void;
  onOpenMastery: (brawlerId: string) => void;
  onOpenComic: (brawlerId: string) => void;
  onBack: () => void;
}

export default function CharacterSelect({ onPickAsActive, onTraining, onOpenMastery, onOpenComic, onBack }: CharacterSelectProps) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastViewedId, setLastViewedId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [sortKey, setSortKey] = useState<BrawlerSortKey>("rarity");
  const [rankModalBrawlerId, setRankModalBrawlerId] = useState<string | null>(null);
  const [purchasedBrawler, setPurchasedBrawler] = useState<string | null>(null);
  const [, setBalanceVersion] = useState(0);
  const scrollToCardRef = useRef<(id: string, behavior?: ScrollBehavior) => void>(() => {});

  useEffect(() => {
    const t = setInterval(() => setProfile(getCurrentProfile()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => subscribeCharacterBalanceChanges(() => {
    setBalanceVersion(v => v + 1);
  }), []);

  if (!profile) return null;

  const newBrawlers = profile.newBrawlers || [];
  const detailBrawler = openId ? getBrawlerById(openId) ?? null : null;

  const handleOpenDetail = (id: string, rect: DOMRect | null) => {
    setLastViewedId(id);
    setAnchorRect(rect);
    setOpenId(id);
    if (newBrawlers.includes(id)) {
      markBrawlerSeen(id);
      setProfile(getCurrentProfile());
    }
  };

  const handleCloseDetail = () => {
    setOpenId(null);
    setAnchorRect(null);
    const id = lastViewedId ?? openId;
    if (id) {
      requestAnimationFrame(() => {
        scrollToCardRef.current(id, "smooth");
      });
    }
  };

  return (
    <>
      <GlowingStarStyles />
      <CharacterGrid
        profile={profile}
        sortKey={sortKey}
        onChangeSort={setSortKey}
        onBack={onBack}
        onOpen={handleOpenDetail}
        onOpenRankModal={(id) => setRankModalBrawlerId(id)}
        newBrawlers={newBrawlers}
        dimmed={!!openId}
        initialScrollId={profile.selectedBrawlerId}
        scrollToCardRef={scrollToCardRef}
      />
      {detailBrawler && (
        <CharacterDetail
          brawler={detailBrawler}
          anchorRect={anchorRect}
          level={profile.brawlerLevels[detailBrawler.id] || 1}
          coins={profile.coins}
          gems={profile.gems}
          powerPoints={profile.powerPoints}
          isActive={profile.selectedBrawlerId === detailBrawler.id}
          isUnlocked={isBrawlerUnlocked(profile, detailBrawler.id)}
          onClose={handleCloseDetail}
          onHome={onBack}
          onPickAsActive={() => { onPickAsActive(detailBrawler.id); }}
          onTraining={() => onTraining(detailBrawler.id)}
          onOpenRankModal={() => setRankModalBrawlerId(detailBrawler.id)}
          onOpenMastery={() => onOpenMastery(detailBrawler.id)}
          onOpenComic={() => onOpenComic(detailBrawler.id)}
          rankModalOpen={!!rankModalBrawlerId}
          onUpgrade={() => {
            const r = upgradeBrawler(detailBrawler.id);
            if (r.success) setProfile(getCurrentProfile());
            return r;
          }}
          onUnlock={() => {
            const r = unlockBrawlerWithGems(detailBrawler.id);
            if (r.success) {
              setProfile(getCurrentProfile());
              setPurchasedBrawler(detailBrawler.id);
            }
            return r;
          }}
        />
      )}
      {rankModalBrawlerId && typeof document !== "undefined" && createPortal(
        <BrawlerRankRewardsModal
          brawlerId={rankModalBrawlerId}
          onClose={() => { setRankModalBrawlerId(null); setProfile(getCurrentProfile()); }}
        />,
        document.body,
      )}
      {purchasedBrawler && (
        <BrawlerRevealModal
          brawlerId={purchasedBrawler}
          onDone={() => setPurchasedBrawler(null)}
        />
      )}
    </>
  );
}

// =========================================================================
// GRID VIEW
// =========================================================================

interface CharacterGridProps {
  profile: ReturnType<typeof getCurrentProfile>;
  sortKey: BrawlerSortKey;
  onChangeSort: (key: BrawlerSortKey) => void;
  onBack: () => void;
  onOpen: (id: string, rect: DOMRect | null) => void;
  onOpenRankModal: (id: string) => void;
  newBrawlers?: string[];
  dimmed?: boolean;
  initialScrollId?: string;
  scrollToCardRef: React.MutableRefObject<(id: string, behavior?: ScrollBehavior) => void>;
}

function scrollCardIntoView(
  container: HTMLElement,
  card: HTMLElement,
  behavior: ScrollBehavior = "smooth",
) {
  const cRect = container.getBoundingClientRect();
  const eRect = card.getBoundingClientRect();
  const targetTop =
    eRect.top - cRect.top + container.scrollTop - (cRect.height - eRect.height) / 2;
  container.scrollTo({ top: Math.max(0, targetTop), behavior });
}

function CharacterGrid({
  profile, sortKey, onChangeSort, onBack, onOpen, onOpenRankModal, newBrawlers = [],
  dimmed = false, initialScrollId, scrollToCardRef,
}: CharacterGridProps) {
  if (!profile) return null;
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const { main, locked } = partitionCharacterRoster(profile, sortKey);
  const rosterBrawlers = [...main, ...locked];
  const unlockedCount = main.length;
  const scrollRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialScroll = useRef(false);

  const scrollToId = useCallback((id: string, behavior: ScrollBehavior = "smooth") => {
    const container = scrollRef.current;
    const card = cardRefs.current.get(id);
    if (!container || !card) return;
    scrollCardIntoView(container, card, behavior);
  }, []);

  useEffect(() => {
    scrollToCardRef.current = scrollToId;
  }, [scrollToId, scrollToCardRef]);

  useEffect(() => {
    if (!initialScrollId || didInitialScroll.current) return;
    const t = requestAnimationFrame(() => {
      scrollToId(initialScrollId, "instant");
      didInitialScroll.current = true;
    });
    return () => cancelAnimationFrame(t);
  }, [initialScrollId, main, locked, scrollToId]);

  const registerCard = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  const openFromCard = (id: string) => {
    scrollToId(id, "instant");
    requestAnimationFrame(() => {
      const el = cardRefs.current.get(id);
      onOpen(id, el?.getBoundingClientRect() ?? null);
    });
  };

  const { t } = useI18n();

  const renderGridCard = (b: typeof BRAWLERS[number]) => {
    const isPreview = isPreviewBrawler(b.id);
    const lv = profile.brawlerLevels[b.id] || 1;
    const isActive = !isPreview && profile.selectedBrawlerId === b.id;
    const unlocked = !isPreview && profile.unlockedBrawlers.includes(b.id);
    const isNew = !isPreview && newBrawlers.includes(b.id);
    const rarityColor = CHESTS[b.rarity].borderColor;
    const bTrophies = unlocked ? getBrawlerTrophies(profile, b.id) : 0;
    const bPeak = profile.brawlerTrophyPeak?.[b.id] ?? bTrophies;
    const bRank = unlocked ? computeBrawlerRankBarState(bTrophies, bPeak).badgeRank : 0;
    const stars = unlocked ? getBrawlerStarsCount(profile, b.id) : 0;
    const bWinStreak = unlocked ? getBrawlerWinStreak(profile, b.id) : 0;
    const borderColor = isNew
      ? "#FF4500"
      : unlocked
        ? (isActive ? b.color : rarityColor)
        : "rgba(255,255,255,0.18)";

    return (
      <BrawlerGridCard
        key={b.id}
        ref={(el) => registerCard(b.id, el)}
        brawler={b}
        base={base}
        level={lv}
        isActive={isActive}
        unlocked={unlocked}
        isPreview={isPreview}
        isNew={isNew}
        trophies={bTrophies}
        rank={bRank}
        stars={stars}
        winStreak={bWinStreak}
        rarityColor={rarityColor}
        borderColor={borderColor}
        onOpen={isPreview ? () => {} : () => openFromCard(b.id)}
        onOpenRankModal={() => onOpenRankModal(b.id)}
      />
    );
  };

  return (
    <div
      className="ui-page-bg"
      style={{
        height: "100%",
        backgroundImage:
          "radial-gradient(ellipse at 50% 0%, rgba(123,47,190,0.35) 0%, transparent 55%), linear-gradient(180deg, #060119 0%, #0a062d 50%, #050015 100%)",
        fontFamily: "var(--app-font-sans)",
        color: "var(--t-1)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        opacity: dimmed ? 0.35 : 1,
        transition: "opacity 0.25s ease",
        pointerEvents: dimmed ? "none" : "auto",
      }}
    >
      <div style={{
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px 12px",
        borderBottom: "1px solid var(--bd-1)",
        gap: 12,
      }}>
        <button onClick={onBack} className="ui-back-btn">← {t("common.back")}</button>
        <div style={{ textAlign: "center" }}>
          <h2 className="ui-page-title" style={{ margin: 0, fontSize: 26, letterSpacing: "0.12em" }}>
            {t("char.title")}
          </h2>
          <div className="ui-eyebrow" style={{ marginTop: 4 }}>
            {t("char.unlocked", { count: String(unlockedCount), total: String(rosterBrawlers.length) })}
          </div>
        </div>
        <ResourcesBar coins={profile.coins} gems={profile.gems} powerPoints={profile.powerPoints} />
      </div>

      <div style={{
        flexShrink: 0,
        maxWidth: 1100, margin: "0 auto", width: "100%",
        padding: "0 20px 12px",
        display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8,
      }}>
        <span className="ui-eyebrow">{t("char.sort")}</span>
        <select
          value={sortKey}
          onChange={(e) => onChangeSort(e.target.value as BrawlerSortKey)}
          className="ui-input"
          style={{ width: "auto", padding: "6px 12px", fontSize: 12, fontWeight: 700 }}
        >
          {SORT_KEYS.map(key => (
            <option key={key} value={key} style={{ background: "#0a0040" }}>{t(`char.sort.${key}`)}</option>
          ))}
        </select>
      </div>

      <PageBody ref={scrollRef} style={{ padding: "8px 20px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          {main.map((b) => renderGridCard(b))}
        </div>

        {locked.length > 0 && (
          <>
            <div style={{
              margin: "28px 0 20px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
              <div className="ui-eyebrow" style={{ letterSpacing: "0.14em", whiteSpace: "nowrap" }}>
                {t("char.sectionLockedSoon")}
              </div>
              <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
              {locked.map((b) => renderGridCard(b))}
            </div>
          </>
        )}
      </div>
      </PageBody>
    </div>
  );
}

// =========================================================================
// Brawl Stars–style avatar card used in the character selection grid
// =========================================================================

function BrawlerCardStarSlot({ filled }: { filled: boolean }) {
  return <GlowingStar filled={filled} size="100%" />;
}

interface BrawlerGridCardProps {
  brawler: typeof BRAWLERS[number];
  base: string;
  level: number;
  isActive: boolean;
  unlocked: boolean;
  isPreview?: boolean;
  isNew: boolean;
  trophies: number;
  rank: number;
  stars: number;
  winStreak?: number;
  rarityColor: string;
  borderColor: string;
  onOpen: () => void;
  onOpenRankModal: () => void;
}

const BrawlerGridCard = forwardRef<HTMLDivElement, BrawlerGridCardProps>(function BrawlerGridCard({
  brawler: b, base, level, isActive, unlocked, isPreview = false, isNew,
  trophies, rank, stars, winStreak = 0, rarityColor, borderColor, onOpen, onOpenRankModal,
}, ref) {
  const { t } = useI18n();
  const avatarBg = RARITY_AVATAR_BG[b.rarity] ?? `linear-gradient(180deg, ${b.color} 0%, rgba(0,0,0,0.6) 100%)`;
  const russianName = getBrawlerDisplayName(b);
  // The big star is shown for each of the 6 constellation slots; only owned ones glow.
  const starSlots = [0, 1, 2, 3, 4, 5];

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1.18",
        borderRadius: 18,
        overflow: "hidden",
        border: `2.5px solid ${borderColor}`,
        background: avatarBg,
        cursor: isPreview ? "default" : "pointer",
        boxShadow: isActive
          ? `0 0 25px ${b.color}aa, 0 0 0 2px ${b.color} inset`
          : unlocked ? `0 6px 20px ${rarityColor}55` : "0 4px 14px rgba(0,0,0,0.4)",
        transition: "transform 0.15s, box-shadow 0.15s",
        userSelect: "none",
        opacity: isPreview ? 0.92 : 1,
      }}
      onMouseOver={(e) => { if (!isPreview) e.currentTarget.style.transform = "translateY(-4px)"; }}
      onMouseOut={(e) => { if (!isPreview) e.currentTarget.style.transform = ""; }}
    >
      {/* Avatar artwork — Brawl Stars-style head & shoulders portrait */}
      <img
        src={`${base}brawlers/avatars/${b.id}.png`}
        alt={getBrawlerDisplayName(b)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "calc(100% - 56px)", // leave room for the gold bar
          objectFit: "cover",
          objectPosition: "center top",
          display: "block",
          filter: isPreview ? "none" : (unlocked ? "none" : "grayscale(0.9) brightness(0.5)"),
        }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />

      {/* Preview / coming soon badge */}
      {isPreview && (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "linear-gradient(135deg, #455A64, #263238)",
          color: "white", fontSize: 10, fontWeight: 900,
          borderRadius: 8, padding: "3px 8px",
          letterSpacing: 1,
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}>СКОРО</div>
      )}

      {/* Locked overlay */}
      {!unlocked && !isPreview && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 58, textShadow: "0 4px 12px rgba(0,0,0,0.9)",
          pointerEvents: "none",
        }}>🔒</div>
      )}

      <style>{`
        @keyframes brawlerPowerBurn {
          0%, 100% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 5px rgba(0,0,0,0.45), 0 0 8px rgba(255,193,7,0.45);
          }
          50% {
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.65), 0 2px 6px rgba(0,0,0,0.5), 0 0 14px rgba(255,152,0,0.75), 0 0 22px rgba(255,193,7,0.35);
          }
        }
      `}</style>

      {/* TOP-LEFT: rank above trophies */}
      <div style={{
        position: "absolute", top: 8, left: 8,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4,
        pointerEvents: "none",
      }}>
        {unlocked && (
          <button
            type="button"
            className="no-ui-shear"
            onClick={(e) => { e.stopPropagation(); onOpenRankModal(); }}
            title={t("char.rankRewards")}
            style={{
              pointerEvents: "auto",
              position: "relative",
              border: "none",
              background: "transparent",
              padding: 0,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <RankBadgeIcon rank={rank} size={GRID_RANK_BADGE_SIZE} />
            {(() => {
              const n = getUnclaimedBrawlerRankCount(getCurrentProfile(), b.id);
              if (n <= 0) return null;
              return (
                <span className="no-ui-shear" style={{
                  position: "absolute", top: -4, right: -8,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: "#FF3D00", color: "#fff",
                  fontSize: 9, fontWeight: 800,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "0 4px",
                }}>{n}</span>
              );
            })()}
          </button>
        )}
        {!isPreview && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3,
        }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            background: "rgba(0,0,0,0.62)",
            backdropFilter: "blur(3px)",
            WebkitBackdropFilter: "blur(3px)",
            borderRadius: 999, padding: "3px 9px 3px 6px",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
          }}>
            <span style={{ fontSize: 14, lineHeight: 1, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}>
              {unlocked ? "🏆" : "💎"}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 900, color: unlocked ? "#FFD740" : "#80DEEA",
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}>
              {unlocked ? trophies : getEffectiveBrawlerGemCost(b.rarity)}
            </span>
          </div>
          {unlocked && isWinStreakVisible(winStreak) && (
            <WinStreakFlame streak={winStreak} size={28} />
          )}
        </div>
        )}
      </div>

      {/* TOP-RIGHT: NEW / SELECTED badge */}
      {isNew ? (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: "linear-gradient(135deg, #FF4500, #FF6B00)",
          color: "white", fontSize: 10, fontWeight: 900,
          borderRadius: 8, padding: "3px 8px",
          letterSpacing: 1,
          boxShadow: "0 0 12px rgba(255,69,0,0.8)",
          animation: "pulse 1.4s ease-in-out infinite",
        }}>{t("common.new")}</div>
      ) : isActive ? (
        <div style={{
          position: "absolute", top: 8, right: 8,
          background: b.color, color: "white",
          fontSize: 10, fontWeight: 900,
          borderRadius: 8, padding: "3px 8px",
          letterSpacing: 1,
          boxShadow: `0 0 12px ${b.color}cc`,
        }}>{t("char.selectedBadge")}</div>
      ) : null}

      {/* Russian name in the bottom-right of the avatar area (NOT obscuring the face) */}
      <div style={{
        position: "absolute",
        right: 8,
        bottom: 64, // sits just above the gold bar
        maxWidth: "62%",
        textAlign: "right",
        padding: "4px 8px",
        background: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.55) 100%)",
        borderRadius: 8,
        fontSize: 16, fontWeight: 900,
        letterSpacing: 0.5,
        color: "white",
        textShadow: "0 2px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)",
        pointerEvents: "none",
        lineHeight: 1.1,
      }}>{russianName}</div>

      {/* BOTTOM GOLD BAR: power level + constellation star slots */}
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        height: 56,
        background: "linear-gradient(180deg, #FFD54F 0%, #F9A825 55%, #C77800 100%)",
        borderTop: "2px solid rgba(0,0,0,0.35)",
        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -3px 0 rgba(0,0,0,0.25)",
        display: "flex", alignItems: "stretch",
        padding: "0 6px 0 8px",
        gap: 4,
      }}>
        <div
          title={t("char.powerLevel")}
          style={{
            flexShrink: 0,
            alignSelf: "center",
            width: 40, height: 40, borderRadius: 999,
            background: "radial-gradient(circle at 35% 28%, #FFFDE7 0%, #FFD54F 38%, #FF8F00 72%, #E65100 100%)",
            border: "2px solid rgba(0,0,0,0.55)",
            animation: unlocked ? "brawlerPowerBurn 1.8s ease-in-out infinite" : "none",
            color: "#3E2723", fontWeight: 900, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            textShadow: "0 1px 0 rgba(255,255,255,0.55)",
          }}
        >
          {unlocked ? level : "-"}
        </div>

        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "stretch",
          gap: 2,
          minWidth: 0,
          padding: "4px 2px 4px 0",
        }}>
          {starSlots.map(i => (
            <div
              key={i}
              style={{
                flex: 1,
                minWidth: 0,
                height: "100%",
                maxHeight: 46,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <BrawlerCardStarSlot filled={i < stars} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// =========================================================================
// DETAIL VIEW
// =========================================================================

interface CharacterDetailProps {
  brawler: typeof BRAWLERS[number];
  anchorRect: DOMRect | null;
  level: number;
  coins: number;
  gems: number;
  powerPoints: number;
  isActive: boolean;
  isUnlocked: boolean;
  onClose: () => void;
  onHome: () => void;
  onPickAsActive: () => void;
  onTraining: () => void;
  onOpenRankModal: () => void;
  onOpenMastery: () => void;
  onOpenComic: () => void;
  rankModalOpen?: boolean;
  onUpgrade: () => { success: boolean; error?: string };
  onUnlock: () => { success: boolean; error?: string };
}

function CharacterDetail({
  brawler, level, coins, gems, powerPoints, isActive, isUnlocked,
  onClose, onHome, onPickAsActive, onTraining, onOpenRankModal, onOpenMastery, onOpenComic, rankModalOpen = false,
  onUpgrade, onUnlock,
}: CharacterDetailProps) {
  const { t } = useI18n();
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const unlockCost = getEffectiveBrawlerGemCost(brawler.rarity);
  const canAffordUnlock = gems >= unlockCost;
  const rarityColor = CHESTS[brawler.rarity].borderColor;
  const namePlate = RARITY_NAME_PLATE[brawler.rarity] ?? RARITY_NAME_PLATE.rare;
  const lore = brawlerLore(brawler.id, getEffectiveBrawlerLore(brawler.id) || brawler.description);
  const profile = getCurrentProfile();
  const detailTrophies = profile && isUnlocked ? getBrawlerTrophies(profile, brawler.id) : 0;
  const detailWinStreak = profile && isUnlocked ? getBrawlerWinStreak(profile, brawler.id) : 0;
  const scaled = getScaledStats(brawler, level);
  const isMax = level >= MAX_BRAWLER_LEVEL;
  const cost = upgradeBrawlerCost(level);
  const canAfford = coins >= cost.coins && powerPoints >= cost.powerPoints;
  const [msg, setMsg] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [pickedStar, setPickedStar] = useState<number | null>(null);
  const [showPinsModal, setShowPinsModal] = useState(false);
  const starsOwned = getBrawlerStars(profile, brawler.id);

  const handleUpgrade = () => {
    if (!isUnlocked) { flash(t("char.unlockFirst")); return; }
    if (isMax) { flash(t("char.maxLevel")); return; }
    if (!canAfford) { flash(t("char.notEnough")); return; }
    const r = onUpgrade();
    flash(r.success ? t("char.upgraded") : (r.error || t("common.error")));
  };
  const handleUnlock = () => {
    if (!canAffordUnlock) { flash(t("char.needGems", { cost: String(unlockCost) })); return; }
    const r = onUnlock();
    flash(r.success ? t("char.unlockedMsg", { name: brawlerName(brawler.id, brawler.name) }) : (r.error || t("common.error")));
  };
  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const bgUrl = `${base}brawlers/backgrounds/${brawler.id}.png`;

  const modal = (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        boxSizing: "border-box",
      }}
      onClick={onClose}
    >
      <div style={{
        position: "absolute", inset: 0,
        background: "rgba(3,0,26,0.55)",
        backdropFilter: "blur(5px)",
        WebkitBackdropFilter: "blur(5px)",
      }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          backgroundImage: `url("${bgUrl}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: "#03001a",
          fontFamily: "'Segoe UI', Arial, sans-serif",
          color: "white",
          borderRadius: 0,
          overflow: "hidden",
          boxShadow: `inset 0 0 0 2px ${brawler.color}66`,
        }}
      >
      <style>{`
        @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>

      {/* Top-left: Class badge + name */}
      <div style={{
        position: "absolute", top: 18, left: 18, zIndex: 5,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
        maxWidth: 360,
      }}>
        <button onClick={onClose} style={{ ...pillBtn, fontSize: 12 }}>{t("char.backToList")}</button>
        <div style={{
          background: namePlate.background,
          border: namePlate.border,
          padding: "10px 16px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
          backdropFilter: "blur(6px)",
        }}>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 2, lineHeight: 1, color: "#fff" }}>
            {brawlerName(brawler.id, brawler.name).toUpperCase()}
          </div>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 1.8, marginTop: 4,
            color: namePlate.rarityColor,
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}>
            {brawlerRarityLabel(brawler.rarity, BRAWLER_RARITY_LABEL[brawler.rarity]).toUpperCase()}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2.5, color: "rgba(255,255,255,0.92)", marginTop: 3 }}>
            {brawlerRole(brawler.id, brawler.role).toUpperCase()}{!isUnlocked ? t("char.locked") : ""}
          </div>
        </div>

        {isUnlocked && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
            <BrawlerRankBar
              brawlerId={brawler.id}
              trophies={detailTrophies}
              onClick={onOpenRankModal}
              badgeScale={MENU_RANK_BADGE_SCALE}
            />
            {isWinStreakVisible(detailWinStreak) && (
              <WinStreakFlame streak={detailWinStreak} size={40} />
            )}
          </div>
        )}

        {!isUnlocked && (
          <div style={{
            background: "rgba(0,0,0,0.55)",
            border: `1px solid ${rarityColor}`,
            borderRadius: 12, padding: "10px 14px",
            fontSize: 12, lineHeight: 1.5,
            color: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(8px)",
            maxWidth: 320,
          }}>
            <div style={{ fontSize: 10, color: rarityColor, fontWeight: 800, letterSpacing: 2, marginBottom: 6 }}>
              {t("char.howToUnlock")}
            </div>
            {t("char.howToUnlockDesc", { cost: String(unlockCost), rarity: brawlerRarityLabel(brawler.rarity, BRAWLER_RARITY_LABEL[brawler.rarity]) })}
          </div>
        )}

        {/* Lore block */}
        <div style={{
          marginTop: 6,
          background: "rgba(0,0,0,0.45)",
          border: `1px solid ${brawler.color}55`,
          borderRadius: 12, padding: "12px 14px",
          fontSize: 13, lineHeight: 1.5,
          color: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(8px)",
        }}>
          <div style={{ fontSize: 10, color: brawler.color, fontWeight: 800, letterSpacing: 2, marginBottom: 6 }}>
            {t("char.history")}
          </div>
          {lore}
        </div>

        {isUnlocked && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onOpenMastery}
              style={{
                width: 60,
                minWidth: 60,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 0,
                padding: "0 2px 3px",
                background: "linear-gradient(160deg, rgba(15,8,42,0.72), rgba(8,4,24,0.86))",
                border: "1px solid rgba(186,104,255,0.45)",
                borderRadius: 12,
                cursor: "pointer",
                boxShadow: "var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)",
                position: "relative",
                overflow: "visible",
              }}
            >
              <div style={{
                width: 60,
                height: 52,
                position: "relative",
                flexShrink: 0,
                overflow: "visible",
              }}>
                <img
                  src={`${base}ui/nav-mastery.png`}
                  alt=""
                  className="ui-game-icon"
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -5,
                    width: 64,
                    height: 64,
                    maxWidth: "none",
                    transform: "translateX(-50%) scale(1.2)",
                    transformOrigin: "50% 100%",
                    pointerEvents: "none",
                    zIndex: 2,
                    filter: "drop-shadow(0 4px 12px rgba(186,104,255,0.75))",
                  }}
                />
              </div>
              <span style={{
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 0.15,
                color: "#fff",
                whiteSpace: "nowrap",
                lineHeight: 1.1,
                textAlign: "center",
                position: "relative",
                zIndex: 1,
                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                WebkitFontSmoothing: "antialiased",
              }}>
                {t("nav.mastery")}
              </span>
              {profile && getUnclaimedBrawlerMasteryCount(profile, brawler.id) > 0 && (
                <span style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  background: "#FF1744",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 900,
                  lineHeight: "16px",
                  textAlign: "center",
                }}>
                  {getUnclaimedBrawlerMasteryCount(profile, brawler.id)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onOpenComic}
              style={{
                width: 60,
                minWidth: 60,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 0,
                padding: "0 2px 3px",
                background: `linear-gradient(160deg, ${brawler.color}88, rgba(8,4,24,0.88))`,
                border: `1px solid ${brawler.accentColor}88`,
                borderRadius: 12,
                cursor: "pointer",
                boxShadow: `var(--sh-sm), 0 0 16px ${brawler.color}66, inset 0 1px 0 rgba(255,255,255,0.08)`,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{
                width: 60,
                height: 52,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                textShadow: `0 4px 14px ${brawler.accentColor}`,
              }}>
                📖
              </div>
              <span style={{
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 0.15,
                color: "#fff",
                whiteSpace: "nowrap",
                lineHeight: 1.1,
                textAlign: "center",
                position: "relative",
                zIndex: 1,
                textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                WebkitFontSmoothing: "antialiased",
              }}>
                {t("nav.comic")}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Top-right: resources + home button */}
      <div style={{
        position: "absolute", top: 18, right: 18, zIndex: 5,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <ResourcesBar coins={coins} gems={gems} powerPoints={powerPoints} />
        <button onClick={onHome} style={{
          ...pillBtn,
          background: "rgba(255,82,82,0.15)",
          border: "1px solid rgba(255,82,82,0.4)",
          color: "#FF8A80",
        }}>{t("char.home")}</button>
      </div>

      {/* Center: brawler showcase */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: Math.min(480, vw * 0.42),
          height: Math.min(520, vh * 0.55),
          animation: rankModalOpen ? undefined : "floatY 4s ease-in-out infinite",
          pointerEvents: "auto",
        }}>
          <BrawlerViewer3D
            brawlerId={brawler.id}
            color={brawler.color}
            size={Math.min(380, vw * 0.34)}
            paused={rankModalOpen}
          />
        </div>
      </div>

      {/* Right side: stats + upgrade button */}
      <div style={{
        position: "absolute", right: 18, top: "54%", transform: "translateY(-50%)",
        zIndex: 5, width: 300,
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <button
          onClick={() => setShowStatsModal(true)}
          className="ui-card is-interactive"
          style={{
            background: `linear-gradient(160deg, ${brawler.color}1f, rgba(8,4,24,0.78))`,
            border: `1px solid ${brawler.color}66`,
            borderRadius: "var(--r-lg)", padding: "14px 16px",
            backdropFilter: "blur(12px) saturate(1.18)",
            WebkitBackdropFilter: "blur(12px) saturate(1.18)",
            color: "var(--t-1)", cursor: "pointer", textAlign: "left",
            fontFamily: "inherit",
            boxShadow: `var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = `0 8px 28px ${brawler.color}66, var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.10)`;
            e.currentTarget.style.borderColor = brawler.color;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.boxShadow = `var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)`;
            e.currentTarget.style.borderColor = `${brawler.color}66`;
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, color: brawler.color, fontWeight: 800, letterSpacing: 2 }}>
              {t("char.stats")}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1 }}>
              {t("char.details")}
            </div>
          </div>
          <Stat label={t("char.stat.hp")} value={scaled.hp.toString()} icon="❤️" color="#4CAF50" />
          <Stat label={t("char.stat.damage")} value={scaled.attackDamage.toString()} icon="⚔️" color="#FF5252" />
          <Stat label={t("char.stat.speed")} value={brawler.speed.toFixed(1)} icon="👟" color="#40C4FF" />
          <Stat label={t("char.stat.range")} value={brawler.attackRange.toString()} icon="🎯" color="#CE93D8" />
          <Stat label={t("char.stat.regen")} value={`${brawler.regenRate}/c`} icon="✨" color="#69F0AE" />
          <Stat label={t("char.stat.charges")} value={brawler.attackCharges.toString()} icon="🔋" color="#FFD700" />
        </button>

        <button
          onClick={handleUpgrade}
          disabled={isMax || !isUnlocked}
          className={`ui-btn ui-btn--block ${
            !isUnlocked || isMax
              ? "ui-btn--ghost"
              : canAfford
                ? "ui-btn--success"
                : "ui-btn--danger"
          }`}
          style={{
            padding: "14px 16px",
            fontSize: 14,
            letterSpacing: "0.08em",
            display: "flex", flexDirection: "column", gap: 2,
          }}
        >
          <span>{!isUnlocked ? t("char.lockedBtn") : isMax ? t("char.maxLevelBtn") : t("char.upgradeTo", { level: String(level + 1) })}</span>
          {isUnlocked && !isMax && (
            <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
              <CoinIcon size={14} /> {cost.coins} • <PowerIcon size={14} /> {cost.powerPoints}
            </span>
          )}
        </button>
        {isUnlocked && (
          <div className="ui-card" style={{
            background: `linear-gradient(160deg, rgba(255,213,79,0.12), rgba(8,4,24,0.78))`,
            border: `1px solid ${brawler.color}66`,
            borderRadius: "var(--r-lg)", padding: "12px 14px",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            boxShadow: "var(--sh-glow-gold), var(--sh-sm)",
          }}>
            <div className="ui-eyebrow" style={{ color: "var(--c-gold-3)", marginBottom: 8 }}>
              {t("char.constellation", { count: String(starsOwned.length) })}
            </div>
            <BrawlerConstellationView brawlerId={brawler.id} ownedStars={starsOwned} onPick={setPickedStar} />
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--t-3)" }}>
              {t("char.starsOwned", { list: starsOwned.length ? starsOwned.map(i => `#${i}`).join(", ") : t("char.starsNone") })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-left: Select + Training */}
      <div style={{
        position: "absolute", left: 18, bottom: 18, zIndex: 5,
        display: "flex", gap: 10,
      }}>
        {isUnlocked ? (
          <button
            onClick={onPickAsActive}
            disabled={isActive}
            className={`ui-btn ui-btn--xl ${isActive ? "ui-btn--ghost" : ""}`}
            style={{
              ...(isActive ? {
                ["--ui-shear-fill" as string]: "rgba(0,0,0,0.35)",
                ["--ui-shear-border" as string]: "var(--bd-2)",
                ["--ui-shear-text" as string]: "#FFFFFF",
                ["--ui-shear-text-shadow" as string]: "0 0 12px rgba(255,255,255,0.85), 0 2px 6px rgba(0,0,0,0.9)",
              } : {
                ["--ui-shear-fill" as string]: `linear-gradient(135deg, ${brawler.color}, ${brawler.secondaryColor})`,
                ["--ui-shear-border" as string]: brawler.color,
                ["--ui-shear-shadow" as string]: `0 12px 32px ${brawler.color}aa, inset 0 1px 0 rgba(255,255,255,0.32)`,
                ["--ui-shear-blur" as string]: "none",
                ["--ui-shear-text" as string]: "#ffffff",
                ["--ui-shear-text-shadow" as string]: "0 1px 3px rgba(0,0,0,0.65)",
              }),
              letterSpacing: "0.18em",
            }}
          >
            {isActive ? t("char.alreadySelected") : t("char.select")}
          </button>
        ) : (
          <button
            onClick={handleUnlock}
            disabled={!canAffordUnlock}
            className={`ui-btn ui-btn--xl ${canAffordUnlock ? "ui-btn--cyan" : "ui-btn--danger"}`}
            style={{ letterSpacing: "0.18em" }}
          >
            {t("char.unlockBtn", { cost: String(unlockCost) })}
          </button>
        )}
        {isUnlocked && (
          <button
            onClick={() => setShowPinsModal(true)}
            className="ui-btn ui-btn--xl"
            style={{
              letterSpacing: "0.14em",
              display: "inline-flex", alignItems: "center", gap: 8,
              ["--ui-shear-text" as string]: "#ffffff",
              ["--ui-shear-fill" as string]: "linear-gradient(135deg, #5C6BC0, #283593)",
              ["--ui-shear-border" as string]: "#7E57C2",
              ["--ui-shear-shadow" as string]: "0 4px 22px rgba(94,107,192,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
              ["--ui-shear-blur" as string]: "none",
            }}
            title={t("char.pinsTitle")}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>💬</span>
            {t("char.pins")}
          </button>
        )}
        <button
          onClick={onTraining}
          className="ui-btn ui-btn--primary ui-btn--xl"
          style={{
            letterSpacing: "0.18em",
            ["--ui-shear-shadow" as string]: "0 4px 25px rgba(255,171,64,0.5)",
          }}
        >
          {t("char.try")}
        </button>
      </div>

      {showPinsModal && (
        <PinSelectModal
          brawlerId={brawler.id}
          onClose={() => setShowPinsModal(false)}
        />
      )}

      {msg && (
        <div className="ui-glass-strong" style={{
          position: "absolute", bottom: 96, left: "50%", transform: "translateX(-50%)",
          border: `1px solid ${brawler.color}`,
          padding: "10px 22px",
          color: "var(--t-1)",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.04em",
          zIndex: 6,
          boxShadow: `0 0 22px ${brawler.color}aa, var(--sh-md)`,
        }}>
          {msg}
        </div>
      )}

      {showStatsModal && (
        <StatsModal
          brawler={brawler}
          level={level}
          scaled={scaled}
          onClose={() => setShowStatsModal(false)}
        />
      )}
      {pickedStar && (() => {
        const star = getEffectiveConstellation(brawler.id).find(s => s.index === pickedStar);
        if (!star) return null;
        return (
        <div onClick={() => setPickedStar(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "95vw", borderRadius: 14, border: "1px solid rgba(255,255,255,0.22)", background: "linear-gradient(180deg, rgba(23,7,44,0.95), rgba(9,3,20,0.95))", padding: 14 }}>
            <div style={{ fontSize: 18, color: "#FFD740", fontWeight: 900 }}>
              {star.icon} {starName(brawler.id, star.index, star.name)}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.45 }}>
              {starEffect(brawler.id, star.index, star.effect)}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: starsOwned.includes(pickedStar) ? "#FFD740" : "rgba(255,255,255,0.65)" }}>
              {starsOwned.includes(pickedStar) ? t("char.starActive") : t("char.starNotOwned")}
            </div>
          </div>
        </div>
        );
      })()}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// =========================================================================
// FULL STATS MODAL
// =========================================================================

interface StatsModalProps {
  brawler: typeof BRAWLERS[number];
  level: number;
  scaled: ReturnType<typeof getScaledStats>;
  onClose: () => void;
}

function StatsModal({ brawler, level, scaled, onClose }: StatsModalProps) {
  const { t } = useI18n();
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const hits = Math.ceil(100 / brawler.superChargePerHit);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop { from { transform: scale(0.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="ui-glass-strong"
        style={{
          position: "relative",
          width: "min(680px, 95vw)",
          maxHeight: "min(760px, 92vh)",
          overflowY: "auto",
          background: `linear-gradient(160deg, ${brawler.color}33 0%, rgba(10,0,40,0.95) 60%, rgba(5,0,24,0.95) 100%)`,
          border: `1px solid ${brawler.color}`,
          borderRadius: "var(--r-xl)",
          boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 80px ${brawler.color}66, inset 0 1px 0 rgba(255,255,255,0.1)`,
          animation: "pop 0.25s ease",
          color: "var(--t-1)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16,
          padding: "20px 24px",
          background: `linear-gradient(135deg, ${brawler.color}, ${brawler.secondaryColor})`,
          borderRadius: "18px 18px 0 0",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 14,
              overflow: "hidden",
              flexShrink: 0,
              background: RARITY_AVATAR_BG[brawler.rarity] ?? `linear-gradient(180deg, ${brawler.color} 0%, rgba(0,0,0,0.6) 100%)`,
              boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              border: "2px solid rgba(255,255,255,0.35)",
            }}
          >
            <img
              src={`${base}brawlers/avatars/${brawler.id}.png`}
              alt={brawlerName(brawler.id, brawler.name)}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center top",
                display: "block",
              }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>
              {brawlerName(brawler.id, brawler.name).toUpperCase()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, opacity: 0.9, marginTop: 6 }}>
              {brawlerRole(brawler.id, brawler.role).toUpperCase()} • {t("char.levelLine", { level: String(level), max: String(MAX_BRAWLER_LEVEL) })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="ui-back-btn"
            style={{ padding: "6px 12px", fontSize: 14 }}
          >✕</button>
        </div>

        {/* Stats grid */}
        <div style={{ padding: "14px 18px" }}>
          <SectionTitle color={brawler.color}>{t("char.combatStats")}</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <FullStat icon="❤️"  label={t("char.stat.hp")}          value={`${scaled.hp}`}                  base={t("char.baseHp", { value: String(brawler.hp) })} color="#4CAF50" />
            <FullStat icon="⚔️"  label={t("char.attackDamage")}        value={`${scaled.attackDamage}`}        base={t("char.baseHp", { value: String(brawler.attackDamage) })} color="#FF5252" />
            <FullStat icon="👟"  label={t("char.stat.speed")}           value={brawler.speed.toFixed(1)}         base={t("char.cellsPerSec")} color="#40C4FF" />
            <FullStat icon="🎯"  label={t("char.rangeFull")}          value={`${brawler.attackRange}`}         base={t("char.shotRadius")}  color="#CE93D8" />
            <FullStat icon="✨"  label={t("char.stat.regenFull")}        value={`${brawler.regenRate}/c`}         base={t("char.baseRegen")}     color="#69F0AE" />
            <FullStat icon="🔋"  label={t("char.stat.attackChargesFull")}       value={`${brawler.attackCharges}`}       base={t("char.baseMaxCharges")} color="#FFD700" />
            <FullStat icon="⏱"  label={t("char.stat.cooldown")}        value={`${brawler.attackCooldown.toFixed(1)}c`} base={t("char.baseBetweenShots")} color="#FFAB40" />
            <FullStat icon="⚡"  label={t("char.stat.superCooldown")}       value={`${brawler.superCooldown}c`}      base={t("char.baseMax")}         color="#E040FB" />
            <FullStat icon="🔆"  label={t("char.stat.superCharge")}       value={`+${brawler.superChargePerHit}%`} base={t("char.basePerHit", { hits: String(hits) })} color="#FFD740" />
          </div>

          <SectionTitle color="#40C4FF">{t("char.attackSection", { name: brawlerAttackName(brawler.id, brawler.attackName) })}</SectionTitle>
          <div style={{ background: "rgba(64,196,255,0.08)", border: "1px solid rgba(64,196,255,0.3)", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            {brawlerAttackDesc(brawler.id, brawler.attackDesc)}
          </div>

          <SectionTitle color="#FFD700">{t("char.superSection", { name: brawlerSuperName(brawler.id, brawler.superName) })}</SectionTitle>
          <div style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            {brawlerSuperDesc(brawler.id, brawler.superDesc)}
          </div>

          <SectionTitle color={brawler.color}>{t("char.descriptionSection")}</SectionTitle>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", fontSize: 11, lineHeight: 1.35, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
            {brawlerDescription(brawler.id, brawler.description)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <div style={{
      fontSize: 11, color, fontWeight: 800, letterSpacing: 2,
      marginBottom: 10, marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function FullStat({ icon, label, value, base, color }: { icon: string; label: string; value: string; base: string; color: string }) {
  return (
    <div style={{
      background: "rgba(0,0,0,0.4)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      padding: "8px 10px",
    }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 18, color, fontWeight: 900, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>
        {base}
      </div>
    </div>
  );
}

// =========================================================================
// SHARED COMPONENTS
// =========================================================================

function ResourcesBar({ coins, gems, powerPoints }: { coins: number; gems: number; powerPoints: number }) {
  return (
    <div style={{
      display: "flex", gap: 6,
      background: "rgba(0,0,0,0.4)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "6px 10px",
      backdropFilter: "blur(10px)",
    }}>
      <ResourceItem icon={<CoinIcon size={20} />} value={coins} color="#FFD700" />
      <ResourceItem icon={<GemIcon size={20} />} value={gems} color="#40C4FF" />
      <ResourceItem icon={<PowerIcon size={20} />} value={powerPoints} color="#CE93D8" />
    </div>
  );
}

function ResourceItem({ icon, value, color }: { icon: ReactNode; value: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 6px", fontSize: 14 }}>
      {icon}
      <span style={{ color, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

function Stat({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "5px 0",
      borderBottom: "1px dashed rgba(255,255,255,0.06)",
    }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1 }}>
        {icon} {label}
      </span>
      <span style={{ fontSize: 14, color, fontWeight: 800 }}>{value}</span>
    </div>
  );
}

const pillBtn: React.CSSProperties = {
  ["--ui-shear-fill" as string]: "rgba(255,255,255,0.07)",
  ["--ui-shear-border" as string]: "rgba(255,255,255,0.15)",
  ["--ui-shear-blur" as string]: "blur(8px)",
  padding: "7px 16px",
  color: "rgba(255,255,255,0.85)",
  cursor: "pointer", fontSize: 13, fontWeight: 600,
};
