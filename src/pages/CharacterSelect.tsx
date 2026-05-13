import { useEffect, useState, type ReactNode } from "react";
import { BRAWLERS, BRAWLER_LORE, BRAWLER_GEM_COST, BRAWLER_RARITY_LABEL, getScaledStats } from "../entities/BrawlerData";
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
} from "../utils/localStorageAPI";
import BrawlerViewer3D from "../components/BrawlerViewer3D";
import BrawlerRankRewardsModal from "../components/BrawlerRankRewardsModal";
import BrawlerRevealModal from "../components/BrawlerRevealModal";
import { CoinIcon, GemIcon, PowerIcon } from "../components/GameIcons";
import { BRAWLER_CONSTELLATIONS } from "../utils/constellations";
import BrawlerConstellationView from "../components/BrawlerConstellationView";

export type BrawlerSortKey = "rarity" | "name" | "level" | "hp" | "damage" | "speed" | "range";

const SORT_OPTIONS: { key: BrawlerSortKey; label: string }[] = [
  { key: "rarity", label: "По редкости" },
  { key: "name",   label: "По имени" },
  { key: "level",  label: "По уровню" },
  { key: "hp",     label: "По здоровью" },
  { key: "damage", label: "По урону" },
  { key: "speed",  label: "По скорости" },
  { key: "range",  label: "По дальности" },
];

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

interface CharacterSelectProps {
  onPickAsActive: (brawlerId: string) => void;
  onTraining: (brawlerId: string) => void;
  onBack: () => void;
}

export default function CharacterSelect({ onPickAsActive, onTraining, onBack }: CharacterSelectProps) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [openId, setOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<BrawlerSortKey>("rarity");
  const [rankModalBrawlerId, setRankModalBrawlerId] = useState<string | null>(null);
  const [purchasedBrawler, setPurchasedBrawler] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setProfile(getCurrentProfile()), 500);
    return () => clearInterval(t);
  }, []);

  if (!profile) return null;

  const newBrawlers = profile.newBrawlers || [];
  const detailBrawler = openId ? BRAWLERS.find(b => b.id === openId) || null : null;

  const handleOpenDetail = (id: string) => {
    setOpenId(id);
    if (newBrawlers.includes(id)) {
      markBrawlerSeen(id);
      setProfile(getCurrentProfile());
    }
  };

  return (
    <>
      {detailBrawler ? (
        <CharacterDetail
          brawler={detailBrawler}
          level={profile.brawlerLevels[detailBrawler.id] || 1}
          coins={profile.coins}
          gems={profile.gems}
          powerPoints={profile.powerPoints}
          isActive={profile.selectedBrawlerId === detailBrawler.id}
          isUnlocked={isBrawlerUnlocked(profile, detailBrawler.id)}
          onClose={() => setOpenId(null)}
          onHome={onBack}
          onPickAsActive={() => { onPickAsActive(detailBrawler.id); }}
          onTraining={() => onTraining(detailBrawler.id)}
          onOpenRankModal={() => setRankModalBrawlerId(detailBrawler.id)}
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
      ) : (
        <CharacterGrid
          profile={profile}
          sortKey={sortKey}
          onChangeSort={setSortKey}
          onBack={onBack}
          onOpen={handleOpenDetail}
          onOpenRankModal={(id) => setRankModalBrawlerId(id)}
          newBrawlers={newBrawlers}
        />
      )}
      {rankModalBrawlerId && (
        <BrawlerRankRewardsModal
          brawlerId={rankModalBrawlerId}
          onClose={() => { setRankModalBrawlerId(null); setProfile(getCurrentProfile()); }}
        />
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
  onOpen: (id: string) => void;
  onOpenRankModal: (id: string) => void;
  newBrawlers?: string[];
}

function CharacterGrid({ profile, sortKey, onChangeSort, onBack, onOpen, onOpenRankModal, newBrawlers = [] }: CharacterGridProps) {
  if (!profile) return null;
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const sorted = sortBrawlers(BRAWLERS, sortKey, profile.brawlerLevels);
  const unlockedCount = BRAWLERS.filter(b => profile.unlockedBrawlers.includes(b.id)).length;

  return (
    <div style={{
      minHeight: "100%",
      background: "linear-gradient(135deg, #112747 0%, #1b3f6e 50%, #2b5a92 100%)",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: "white",
      padding: 20,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        marginBottom: 18,
      }}>
        <button onClick={onBack} style={pillBtn}>← Назад</button>
        <div style={{ textAlign: "center" }}>
          <h2 style={{
            margin: 0, fontSize: 26, fontWeight: 900,
            background: "linear-gradient(135deg, #CE93D8, #FFD700)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: 2,
          }}>
            ПЕРСОНАЖИ
          </h2>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2, fontWeight: 700, letterSpacing: 2 }}>
            ОТКРЫТО {unlockedCount} / {BRAWLERS.length}
          </div>
        </div>
        <ResourcesBar coins={profile.coins} gems={profile.gems} powerPoints={profile.powerPoints} />
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto 16px", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 700, letterSpacing: 1 }}>СОРТИРОВКА:</span>
        <select
          value={sortKey}
          onChange={(e) => onChangeSort(e.target.value as BrawlerSortKey)}
          style={{
            background: "rgba(0,0,0,0.5)",
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 8, padding: "6px 10px",
            color: "white", fontSize: 12, fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key} style={{ background: "#0a0040" }}>{o.label}</option>
          ))}
        </select>
      </div>

      <div style={{
        maxWidth: 1100, margin: "0 auto",
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18,
      }}>
        {sorted.map((b) => {
          const lv = profile.brawlerLevels[b.id] || 1;
          const isActive = profile.selectedBrawlerId === b.id;
          const unlocked = profile.unlockedBrawlers.includes(b.id);
          const isNew = newBrawlers.includes(b.id);
          const rarityColor = CHESTS[b.rarity].borderColor;
          const bTrophies = unlocked ? getBrawlerTrophies(profile, b.id) : 0;
          const bRank = unlocked ? getBrawlerRank(bTrophies) : 0;
          const stars = unlocked ? getBrawlerStarsCount(profile, b.id) : 0;
          const borderColor = isNew
            ? "#FF4500"
            : unlocked
              ? (isActive ? b.color : rarityColor)
              : "rgba(255,255,255,0.18)";

          return (
            <div
              key={b.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(b.id)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(b.id); } }}
              style={{
                background: `linear-gradient(180deg, ${rarityColor}22 0%, rgba(0,0,0,0.5) 80%)`,
                border: `2px solid ${borderColor}`,
                borderRadius: 18,
                padding: "18px 14px",
                cursor: "pointer",
                color: "white",
                textAlign: "center",
                position: "relative",
                transition: "transform 0.15s, box-shadow 0.15s",
                boxShadow: isActive
                  ? `0 0 25px ${b.color}aa`
                  : unlocked ? `0 0 14px ${rarityColor}55` : "none",
                opacity: unlocked ? 1 : 0.85,
              }}
              onMouseOver={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 6px 25px ${rarityColor}cc`; }}
              onMouseOut={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = isActive ? `0 0 25px ${b.color}aa` : (unlocked ? `0 0 14px ${rarityColor}55` : "none"); }}
            >
              {/* Rarity badge top-left */}
              <div style={{
                position: "absolute", top: 8, left: 10,
                background: rarityColor, color: "white",
                fontSize: 9, fontWeight: 900,
                borderRadius: 6, padding: "2px 7px",
                letterSpacing: 1,
                textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              }}>{BRAWLER_RARITY_LABEL[b.rarity]}</div>

              {isNew && (
                <div style={{
                  position: "absolute", top: 8, right: 10,
                  background: "linear-gradient(135deg, #FF4500, #FF6B00)",
                  color: "white",
                  fontSize: 10, fontWeight: 900,
                  borderRadius: 8, padding: "2px 8px",
                  letterSpacing: 1,
                  boxShadow: "0 0 12px rgba(255,69,0,0.8)",
                  animation: "pulse 1.4s ease-in-out infinite",
                }}>НОВОЕ</div>
              )}

              {isActive && !isNew && (
                <div style={{
                  position: "absolute", top: 8, right: 10,
                  background: b.color, color: "white",
                  fontSize: 10, fontWeight: 800,
                  borderRadius: 8, padding: "2px 8px",
                  letterSpacing: 1,
                }}>ВЫБРАН</div>
              )}

              {unlocked && (
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenRankModal(b.id); }}
                  title="Награды за ранги"
                  style={{
                    position: "absolute", top: isActive ? 32 : 8, right: 10,
                    background: "linear-gradient(135deg, #F9A825, #FFD700)",
                    color: "#000",
                    fontSize: 10, fontWeight: 900, letterSpacing: 0.5,
                    borderRadius: 8, padding: "2px 8px",
                    border: "1px solid rgba(0,0,0,0.4)",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >РАНГ {bRank}/{MAX_BRAWLER_RANK}</button>
              )}

              <div style={{
                width: 130, height: 130, margin: "0 auto",
                marginTop: 6,
                background: `radial-gradient(circle at 50% 60%, ${unlocked ? b.color : rarityColor}55, transparent 70%)`,
                borderRadius: 14,
                display: "flex", alignItems: "flex-end", justifyContent: "center",
                position: "relative",
              }}>
                <img
                  src={`${base}brawlers/${b.id}_front.png`}
                  alt={b.name}
                  style={{
                    maxWidth: "100%", maxHeight: "100%",
                    filter: unlocked
                      ? `drop-shadow(0 4px 10px ${b.color})`
                      : "grayscale(0.85) brightness(0.55) drop-shadow(0 4px 8px rgba(0,0,0,0.6))",
                  }}
                />
                {!unlocked && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 50,
                    textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                    pointerEvents: "none",
                  }}>🔒</div>
                )}
              </div>
              <div style={{
                marginTop: 10, fontSize: 18, fontWeight: 800,
                color: unlocked ? b.color : "rgba(255,255,255,0.7)",
                letterSpacing: 1,
              }}>
                {b.name}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 2, fontWeight: 600, letterSpacing: 1 }}>
                {b.role.toUpperCase()}
              </div>
              <div style={{
                marginTop: 10,
                display: "inline-block",
                background: "rgba(0,0,0,0.5)",
                border: `1px solid ${unlocked ? b.color : "rgba(255,255,255,0.2)"}`,
                borderRadius: 8, padding: "3px 12px",
                fontSize: 12, fontWeight: 800,
                color: unlocked ? "#FFD700" : "rgba(255,255,255,0.5)",
                letterSpacing: 1,
              }}>
                {unlocked ? `УР ${lv} • 🏆 ${bTrophies}` : `💎 ${BRAWLER_GEM_COST[b.rarity]}`}
              </div>
              {unlocked && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 800, color: "#FFD740" }}>
                  ✨ {stars}/6
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =========================================================================
// DETAIL VIEW
// =========================================================================

interface CharacterDetailProps {
  brawler: typeof BRAWLERS[number];
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
  onUpgrade: () => { success: boolean; error?: string };
  onUnlock: () => { success: boolean; error?: string };
}

function CharacterDetail({
  brawler, level, coins, gems, powerPoints, isActive, isUnlocked,
  onClose, onHome, onPickAsActive, onTraining, onOpenRankModal, onUpgrade, onUnlock,
}: CharacterDetailProps) {
  const unlockCost = BRAWLER_GEM_COST[brawler.rarity];
  const canAffordUnlock = gems >= unlockCost;
  const rarityColor = CHESTS[brawler.rarity].borderColor;
  const lore = BRAWLER_LORE[brawler.id] || brawler.description;
  const profile = getCurrentProfile();
  const detailTrophies = profile && isUnlocked ? getBrawlerTrophies(profile, brawler.id) : 0;
  const detailRank = isUnlocked ? getBrawlerRank(detailTrophies) : 0;
  const scaled = getScaledStats(brawler, level);
  const isMax = level >= MAX_BRAWLER_LEVEL;
  const cost = upgradeBrawlerCost(level);
  const canAfford = coins >= cost.coins && powerPoints >= cost.powerPoints;
  const [msg, setMsg] = useState<string | null>(null);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [pickedStar, setPickedStar] = useState<number | null>(null);
  const starsOwned = getBrawlerStars(profile, brawler.id);

  const handleUpgrade = () => {
    if (!isUnlocked) { flash("Сначала разблокируйте бойца"); return; }
    if (isMax) { flash("Максимальный уровень!"); return; }
    if (!canAfford) { flash("Недостаточно ресурсов"); return; }
    const r = onUpgrade();
    flash(r.success ? "Боец прокачан!" : (r.error || "Ошибка"));
  };
  const handleUnlock = () => {
    if (!canAffordUnlock) { flash(`Нужно ${unlockCost} 💎`); return; }
    const r = onUnlock();
    flash(r.success ? `${brawler.name} разблокирован!` : (r.error || "Ошибка"));
  };
  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  return (
    <div style={{
      minHeight: "100%",
      background: `radial-gradient(ellipse at center, ${brawler.color}22 0%, #060025 60%, #03001a 100%)`,
      fontFamily: "'Segoe UI', Arial, sans-serif",
      color: "white",
      position: "relative",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes floatY { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>

      {/* Top-left: Class badge + name */}
      <div style={{
        position: "absolute", top: 18, left: 18, zIndex: 5,
        display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8,
        maxWidth: 360,
      }}>
        <button onClick={onClose} style={{ ...pillBtn, fontSize: 12 }}>← К списку</button>
        <div style={{
          background: `linear-gradient(135deg, ${brawler.color}, ${brawler.secondaryColor})`,
          borderRadius: 14,
          padding: "10px 18px",
          boxShadow: `0 4px 20px ${brawler.color}88`,
        }}>
          <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>
            {brawler.name.toUpperCase()}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, opacity: 0.9, marginTop: 4 }}>
            {brawler.role.toUpperCase()} • {isUnlocked ? `УР ${level}` : "ЗАБЛОКИРОВАН"}
          </div>
        </div>

        {/* Rarity badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: rarityColor, color: "white",
          fontSize: 11, fontWeight: 900, letterSpacing: 2,
          borderRadius: 10, padding: "5px 12px",
          boxShadow: `0 2px 12px ${rarityColor}88`,
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }}>
          ★ {BRAWLER_RARITY_LABEL[brawler.rarity]}
        </div>

        {isUnlocked && (
          <button
            onClick={onOpenRankModal}
            title="Награды за ранги"
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              background: "rgba(0,0,0,0.55)",
              border: "1px solid rgba(255,215,0,0.5)",
              borderRadius: 12, padding: "8px 14px",
              backdropFilter: "blur(8px)",
              boxShadow: "0 0 16px rgba(255,215,0,0.25)",
              cursor: "pointer", fontFamily: "inherit", color: "white",
            }}
          >
            <span style={{
              background: "linear-gradient(135deg, #F9A825, #FFD700)",
              color: "#000",
              fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
              borderRadius: 6, padding: "2px 8px",
            }}>РАНГ {detailRank}/{MAX_BRAWLER_RANK}</span>
            <span style={{
              background: "linear-gradient(135deg, #311B92, #7B2FBE)",
              color: "white",
              fontSize: 11, fontWeight: 900, letterSpacing: 0.5,
              borderRadius: 6, padding: "2px 8px",
              border: "1px solid rgba(206,147,216,0.6)",
            }}>⚡ СИЛА {level}</span>
            <span style={{ color: "#FFD700", fontSize: 12, fontWeight: 800 }}>
              🏆 {detailTrophies}
            </span>
          </button>
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
              🔒 КАК ОТКРЫТЬ
            </div>
            Купите за 💎 {unlockCost} в магазине, выбейте из сундуков «{BRAWLER_RARITY_LABEL[brawler.rarity]}» или выше, либо тренируйтесь без выбора в активный слот.
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
            ИСТОРИЯ БОЙЦА
          </div>
          {lore}
        </div>
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
        }}>🏠 Домой</button>
      </div>

      {/* Center: brawler showcase */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        <div style={{
          width: 540, height: 540,
          animation: "floatY 4s ease-in-out infinite",
          pointerEvents: "auto",
        }}>
          <BrawlerViewer3D brawlerId={brawler.id} color={brawler.color} size={400} />
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
          style={{
            background: "rgba(0,0,0,0.55)",
            border: `1px solid ${brawler.color}55`,
            borderRadius: 14, padding: "14px 16px",
            backdropFilter: "blur(8px)",
            color: "white", cursor: "pointer", textAlign: "left",
            fontFamily: "inherit",
            transition: "transform 0.15s, box-shadow 0.15s, border-color 0.15s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = `0 6px 25px ${brawler.color}66`;
            e.currentTarget.style.borderColor = brawler.color;
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "";
            e.currentTarget.style.boxShadow = "";
            e.currentTarget.style.borderColor = `${brawler.color}55`;
          }}
        >
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, color: brawler.color, fontWeight: 800, letterSpacing: 2 }}>
              ХАРАКТЕРИСТИКИ
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1 }}>
              ПОДРОБНЕЕ ▸
            </div>
          </div>
          <Stat label="ЗДОРОВЬЕ" value={scaled.hp.toString()} icon="❤️" color="#4CAF50" />
          <Stat label="УРОН"     value={scaled.attackDamage.toString()} icon="⚔️" color="#FF5252" />
          <Stat label="СКОРОСТЬ" value={brawler.speed.toFixed(1)} icon="👟" color="#40C4FF" />
          <Stat label="ДАЛЬН-ТЬ" value={brawler.attackRange.toString()} icon="🎯" color="#CE93D8" />
          <Stat label="РЕГЕН"    value={`${brawler.regenRate}/c`} icon="✨" color="#69F0AE" />
          <Stat label="ЗАРЯДЫ"   value={brawler.attackCharges.toString()} icon="🔋" color="#FFD700" />
        </button>

        <button
          onClick={handleUpgrade}
          disabled={isMax || !isUnlocked}
          style={{
            background: !isUnlocked
              ? "rgba(255,255,255,0.05)"
              : isMax
                ? "rgba(255,255,255,0.06)"
                : canAfford
                  ? "linear-gradient(135deg, #2E7D32, #69F0AE)"
                  : "rgba(255,82,82,0.15)",
            border: !isUnlocked
              ? "1px solid rgba(255,255,255,0.08)"
              : isMax ? "1px solid rgba(255,255,255,0.1)" : `1px solid ${canAfford ? "#69F0AE" : "rgba(255,82,82,0.4)"}`,
            borderRadius: 12, padding: "12px 14px",
            color: !isUnlocked ? "rgba(255,255,255,0.35)" : "white",
            fontWeight: 800, fontSize: 14, letterSpacing: 1,
            cursor: (isMax || !isUnlocked) ? "default" : "pointer",
            display: "flex", flexDirection: "column", gap: 2,
          }}
        >
          <span>{!isUnlocked ? "🔒 НЕДОСТУПНО" : isMax ? "✓ МАКС. УРОВЕНЬ" : `▲ УЛУЧШИТЬ ДО УР. ${level + 1}`}</span>
          {isUnlocked && !isMax && (
            <span style={{ fontSize: 11, opacity: 0.8, fontWeight: 700, display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
              <CoinIcon size={14} /> {cost.coins} • <PowerIcon size={14} /> {cost.powerPoints}
            </span>
          )}
        </button>
        {isUnlocked && (
          <div style={{
            background: "rgba(0,0,0,0.55)",
            border: `1px solid ${brawler.color}55`,
            borderRadius: 14, padding: "10px 12px",
            backdropFilter: "blur(8px)",
          }}>
            <div style={{ fontSize: 11, color: "#FFD740", fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
              ✨ СОЗВЕЗДИЕ {starsOwned.length}/6
            </div>
            <BrawlerConstellationView brawlerId={brawler.id} ownedStars={starsOwned} onPick={setPickedStar} />
            <div style={{ marginTop: 6, fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
              Купленные: {starsOwned.length ? starsOwned.map(i => `#${i}`).join(", ") : "нет"}
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
            style={{
              background: isActive
                ? "rgba(255,255,255,0.06)"
                : `linear-gradient(135deg, ${brawler.color}, ${brawler.secondaryColor})`,
              border: "none", borderRadius: 14,
              padding: "14px 32px",
              color: "white", fontWeight: 900, fontSize: 16, letterSpacing: 2,
              cursor: isActive ? "default" : "pointer",
              boxShadow: isActive ? "none" : `0 4px 25px ${brawler.color}aa`,
            }}
          >
            {isActive ? "✓ УЖЕ ВЫБРАН" : "ВЫБРАТЬ"}
          </button>
        ) : (
          <button
            onClick={handleUnlock}
            disabled={!canAffordUnlock}
            style={{
              background: canAffordUnlock
                ? `linear-gradient(135deg, #1976D2, #40C4FF)`
                : "rgba(255,82,82,0.18)",
              border: canAffordUnlock ? "none" : "1px solid rgba(255,82,82,0.45)",
              borderRadius: 14, padding: "14px 28px",
              color: "white", fontWeight: 900, fontSize: 16, letterSpacing: 2,
              cursor: canAffordUnlock ? "pointer" : "default",
              boxShadow: canAffordUnlock ? "0 4px 25px rgba(64,196,255,0.6)" : "none",
              display: "flex", alignItems: "center", gap: 8,
            }}
          >
            💎 РАЗБЛОКИРОВАТЬ • {unlockCost}
          </button>
        )}
        <button
          onClick={onTraining}
          style={{
            background: "linear-gradient(135deg, #FFAB40, #FFD700)",
            border: "none", borderRadius: 14,
            padding: "14px 32px",
            color: "#3E2723", fontWeight: 900, fontSize: 16, letterSpacing: 2,
            cursor: "pointer",
            boxShadow: "0 4px 25px rgba(255,171,64,0.5)",
          }}
        >
          🎯 ИСПЫТАТЬ
        </button>
      </div>

      {msg && (
        <div style={{
          position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.85)", border: `1px solid ${brawler.color}`,
          borderRadius: 10, padding: "10px 18px", color: "white", fontWeight: 700, fontSize: 14,
          backdropFilter: "blur(10px)", zIndex: 6,
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
      {pickedStar && (
        <div onClick={() => setPickedStar(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 440, maxWidth: "95vw", borderRadius: 14, border: "1px solid rgba(255,255,255,0.22)", background: "linear-gradient(180deg, rgba(23,7,44,0.95), rgba(9,3,20,0.95))", padding: 14 }}>
            <div style={{ fontSize: 18, color: "#FFD740", fontWeight: 900 }}>
              {(BRAWLER_CONSTELLATIONS[brawler.id] || []).find(s => s.index === pickedStar)?.icon} {(BRAWLER_CONSTELLATIONS[brawler.id] || []).find(s => s.index === pickedStar)?.name}
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.45 }}>
              {(BRAWLER_CONSTELLATIONS[brawler.id] || []).find(s => s.index === pickedStar)?.effect}
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: starsOwned.includes(pickedStar) ? "#FFD740" : "rgba(255,255,255,0.65)" }}>
              {starsOwned.includes(pickedStar) ? "Звезда активна в бою" : "Звезда не куплена"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  const base = (import.meta as any).env?.BASE_URL ?? "/";
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
        style={{
          position: "relative",
          width: "min(680px, 95vw)",
          maxHeight: "min(760px, 92vh)",
          overflowY: "auto",
          background: `linear-gradient(180deg, ${brawler.color}22 0%, #0a0028 60%, #050018 100%)`,
          border: `2px solid ${brawler.color}`,
          borderRadius: 20,
          boxShadow: `0 30px 80px rgba(0,0,0,0.7), 0 0 80px ${brawler.color}55`,
          animation: "pop 0.25s ease",
          color: "white",
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
          <img
            src={`${base}brawlers/${brawler.id}_front.png`}
            alt={brawler.name}
            style={{ width: 90, height: 90, objectFit: "contain", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.4))" }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2, lineHeight: 1 }}>
              {brawler.name.toUpperCase()}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, opacity: 0.9, marginTop: 6 }}>
              {brawler.role.toUpperCase()} • УРОВЕНЬ {level}/{MAX_BRAWLER_LEVEL}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 10, padding: "6px 12px",
              color: "white", fontWeight: 800, cursor: "pointer", fontSize: 14,
            }}
          >✕</button>
        </div>

        {/* Stats grid */}
        <div style={{ padding: "14px 18px" }}>
          <SectionTitle color={brawler.color}>БОЕВЫЕ ХАРАКТЕРИСТИКИ</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <FullStat icon="❤️"  label="ЗДОРОВЬЕ"          value={`${scaled.hp}`}                  base={`${brawler.hp} базовый`} color="#4CAF50" />
            <FullStat icon="⚔️"  label="УРОН АТАКИ"        value={`${scaled.attackDamage}`}        base={`${brawler.attackDamage} базовый`} color="#FF5252" />
            <FullStat icon="👟"  label="СКОРОСТЬ"           value={brawler.speed.toFixed(1)}         base="клеток в секунду" color="#40C4FF" />
            <FullStat icon="🎯"  label="ДАЛЬНОСТЬ"          value={`${brawler.attackRange}`}         base="радиус выстрела"  color="#CE93D8" />
            <FullStat icon="✨"  label="РЕГЕНЕРАЦИЯ"        value={`${brawler.regenRate}/c`}         base="HP в секунду"     color="#69F0AE" />
            <FullStat icon="🔋"  label="ЗАРЯДЫ АТАКИ"       value={`${brawler.attackCharges}`}       base="макс. одновременно" color="#FFD700" />
            <FullStat icon="⏱"  label="ПЕРЕЗАРЯДКА"        value={`${brawler.attackCooldown.toFixed(1)}c`} base="между выстрелами" color="#FFAB40" />
            <FullStat icon="⚡"  label="ОТКАТ СУПЕРА"       value={`${brawler.superCooldown}c`}      base="максимум"         color="#E040FB" />
            <FullStat icon="🔆"  label="ЗАРЯД СУПЕРА"       value={`+${brawler.superChargePerHit}%`} base={`за попадание (≈${Math.ceil(100 / brawler.superChargePerHit)} попад.)`} color="#FFD740" />
          </div>

          <SectionTitle color="#40C4FF">⚔️ ОСНОВНАЯ АТАКА — {brawler.attackName}</SectionTitle>
          <div style={{ background: "rgba(64,196,255,0.08)", border: "1px solid rgba(64,196,255,0.3)", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            {brawler.attackDesc}
          </div>

          <SectionTitle color="#FFD700">⚡ СУПЕРСПОСОБНОСТЬ — {brawler.superName}</SectionTitle>
          <div style={{ background: "rgba(255,215,0,0.08)", border: "1px solid rgba(255,215,0,0.3)", borderRadius: 12, padding: "10px 12px", fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.85)", marginBottom: 10 }}>
            {brawler.superDesc}
          </div>

          <SectionTitle color={brawler.color}>📜 ОПИСАНИЕ</SectionTitle>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px 12px", fontSize: 11, lineHeight: 1.35, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>
            {brawler.description}
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
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10, padding: "7px 16px",
  color: "rgba(255,255,255,0.85)",
  cursor: "pointer", fontSize: 13, fontWeight: 600,
};
