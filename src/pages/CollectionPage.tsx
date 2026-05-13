import { useState, useMemo } from "react";
import { BRAWLERS, BRAWLER_RARITY_LABEL, getScaledStats } from "../entities/BrawlerData";
import { CHESTS } from "../utils/chests";
import {
  getCurrentProfile, upgradeBrawler,
  getBrawlerTrophies, getBrawlerRank,
  getUnclaimedBrawlerRankCount,
  BRAWLER_RANK_TABLE, MAX_BRAWLER_RANK,
  markBrawlerSeen,
  getBrawlerStars,
  buyBrawlerStarWithGems,
  buyBrawlerStarsPackWithGems,
} from "../utils/localStorageAPI";
import BrawlerViewer3D from "../components/BrawlerViewer3D";
import BrawlerRankRewardsModal from "../components/BrawlerRankRewardsModal";
import { sortBrawlers, type BrawlerSortKey } from "./CharacterSelect";
import { CoinIcon, PowerIcon, GemIcon } from "../components/GameIcons";
import { PETS, PET_RARITY_LABEL, PET_RARITY_ORDER, PET_GEM_COST } from "../entities/PetData";
import PetSvg from "../components/PetSvg";
import { BRAWLER_CONSTELLATIONS, STAR_COST_GEMS, STAR_PACK3_COST_GEMS } from "../utils/constellations";
import BrawlerConstellationView from "../components/BrawlerConstellationView";

interface CollectionPageProps {
  onBack: () => void;
}

const COLLECTION_SORT_OPTIONS: { key: BrawlerSortKey; label: string }[] = [
  { key: "rarity", label: "По редкости" },
  { key: "level",  label: "По уровню" },
  { key: "name",   label: "По имени" },
  { key: "hp",     label: "По здоровью" },
  { key: "damage", label: "По урону" },
  { key: "speed",  label: "По скорости" },
  { key: "range",  label: "По дальности" },
];

export default function CollectionPage({ onBack }: CollectionPageProps) {
  const [profile, setProfile] = useState(getCurrentProfile());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<BrawlerSortKey>("rarity");
  const [msg, setMsg] = useState("");
  const [rankModalBrawlerId, setRankModalBrawlerId] = useState<string | null>(null);
  const [tab, setTab] = useState<"brawlers" | "pets" | "stars">("brawlers");
  const [pickedStar, setPickedStar] = useState<number | null>(null);

  const ownedSorted = useMemo(() => {
    if (!profile) return [];
    const owned = BRAWLERS.filter(b => profile.unlockedBrawlers.includes(b.id));
    return sortBrawlers(owned, sortKey, profile.brawlerLevels);
  }, [profile, sortKey]);

  // Default selection: first in sorted list, or keep current if still owned.
  const activeId = selectedId && ownedSorted.some(b => b.id === selectedId)
    ? selectedId
    : (ownedSorted[0]?.id ?? null);

  if (!profile || ownedSorted.length === 0 || !activeId) {
    return (
      <div style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #013A40 0%, #02575C 50%, #0CA4A5 100%)",
        color: "white", display: "flex", flexDirection: "column",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "7px 16px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>← Назад</button>
          <h2 style={{ flex: 1, textAlign: "center", margin: 0, fontSize: 22, fontWeight: 800, color: "#CE93D8" }}>Коллекция</h2>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 72 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>В коллекции пока никого нет</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", maxWidth: 420 }}>
            Открывайте сундуки и покупайте бойцов в магазине, чтобы пополнить коллекцию.
          </div>
        </div>
      </div>
    );
  }

  const brawler = BRAWLERS.find(b => b.id === activeId)!;

  const handleUpgrade = () => {
    const result = upgradeBrawler(brawler.id);
    if (result.success) {
      setProfile(getCurrentProfile());
      setMsg("Уровень повышен!");
    } else {
      setMsg(result.error || "Невозможно улучшить");
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const level = profile.brawlerLevels[brawler.id] || 1;
  const scaled = getScaledStats(brawler, level);
  const nextScaled = level < 10 ? getScaledStats(brawler, level + 1) : null;
  const upgradeCost = { coins: 100 * level, pp: 5 * level };
  const canUpgrade = level < 10 && profile.coins >= upgradeCost.coins && profile.powerPoints >= upgradeCost.pp;

  const trophies = getBrawlerTrophies(profile, brawler.id);
  const rank = getBrawlerRank(trophies);
  const unclaimed = getUnclaimedBrawlerRankCount(profile, brawler.id);
  const nextReward = rank < MAX_BRAWLER_RANK ? BRAWLER_RANK_TABLE[rank] : null;
  const trophiesIntoNext = nextReward
    ? Math.max(0, trophies - (rank > 0 ? BRAWLER_RANK_TABLE[rank - 1].trophies : 0))
    : 0;
  const trophiesNeededForNext = nextReward
    ? nextReward.trophies - (rank > 0 ? BRAWLER_RANK_TABLE[rank - 1].trophies : 0)
    : 0;

  return (
    <div
      style={{
        height: "100%",
        background: "linear-gradient(135deg, #013A40 0%, #02575C 50%, #0CA4A5 100%)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        color: "white",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button
          onClick={onBack}
          style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "7px 16px", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          ← Назад
        </button>
        <h2 style={{ flex: 1, textAlign: "center", margin: 0, fontSize: 22, fontWeight: 800, color: "#CE93D8" }}>
Коллекция
        </h2>
        <div style={{ display: "flex", gap: 14, fontSize: 14, alignItems: "center" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#FFD700" }}><CoinIcon size={18} /> {profile?.coins || 0}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#CE93D8" }}><PowerIcon size={18} /> {profile?.powerPoints || 0}</span>
        </div>
      </div>

      {/* Tab toggle: Brawlers / Pets */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(0,0,0,0.18)",
      }}>
        {(["brawlers", "pets", "stars"] as const).map(t => {
          const active = tab === t;
          const label = t === "brawlers" ? "🦸 БОЙЦЫ" : (t === "pets" ? "🐾 ПИТОМЦЫ" : "✨ СОЗВЕЗДИЕ");
          const colors = t === "brawlers"
            ? { fg: "#CE93D8", bg: "rgba(206,147,216,0.18)", border: "#CE93D8" }
            : t === "pets"
              ? { fg: "#B2FF59", bg: "rgba(118,255,3,0.18)",  border: "#76FF03" }
              : { fg: "#FFD740", bg: "rgba(255,215,64,0.18)", border: "#FFD740" };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 22px",
                background: active ? colors.bg : "rgba(255,255,255,0.04)",
                border: `1.5px solid ${active ? colors.border : "rgba(255,255,255,0.10)"}`,
                borderRadius: 10,
                color: active ? colors.fg : "rgba(255,255,255,0.55)",
                fontWeight: 800, fontSize: 12, letterSpacing: 1.5,
                cursor: "pointer",
                boxShadow: active ? `0 0 12px ${colors.border}55` : "none",
              }}
            >{label}</button>
          );
        })}
      </div>

      {tab === "pets" ? (
        <PetsCollectionTab profile={profile} />
      ) : tab === "stars" ? (
        <StarsCollectionTab
          profile={profile}
          brawlerId={activeId}
          onChanged={() => setProfile(getCurrentProfile())}
          onMsg={(m) => { setMsg(m); setTimeout(() => setMsg(""), 2200); }}
          pickedStar={pickedStar}
          onPickStar={setPickedStar}
        />
      ) : (
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{ width: 280, display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.06)", minHeight: 0 }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: 2, display: "block", marginBottom: 5 }}>
              СОРТИРОВКА ({ownedSorted.length})
            </label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as BrawlerSortKey)}
              style={{
                width: "100%", background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8, padding: "7px 10px",
                color: "white", fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              {COLLECTION_SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key} style={{ background: "#0a0040" }}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 14, minHeight: 0 }}>
            {ownedSorted.map((b) => {
              const lv = profile.brawlerLevels[b.id] || 1;
              const isSelected = b.id === activeId;
              const isNew = (profile.newBrawlers || []).includes(b.id);
              const rarityColor = CHESTS[b.rarity].borderColor;
              const bTrophies = getBrawlerTrophies(profile, b.id);
              const bRank = getBrawlerRank(bTrophies);
              return (
                <div
                  key={b.id}
                  onClick={() => {
                    setSelectedId(b.id);
                    if (isNew) {
                      markBrawlerSeen(b.id);
                      setProfile(getCurrentProfile());
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    cursor: "pointer",
                    marginBottom: 6,
                    background: isSelected ? `${b.color}20` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${isNew ? "#FF4500" : isSelected ? b.color + "60" : "rgba(255,255,255,0.05)"}`,
                    boxShadow: isNew ? "0 0 8px rgba(255,69,0,0.5)" : undefined,
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ position: "relative", flexShrink: 0, width: 48, height: 48 }}>
                    <img
                      src={`${import.meta.env.BASE_URL}brawlers/${b.id}_front.png`}
                      alt={b.name}
                      width={48}
                      height={48}
                      style={{
                        borderRadius: 8,
                        background: `radial-gradient(circle at 50% 60%, ${b.color}40, ${b.color}10 70%, transparent)`,
                        objectFit: "contain",
                        objectPosition: "center bottom",
                        filter: `drop-shadow(0 2px 4px ${b.color}80)`,
                      }}
                    />
                    <div
                      onClick={(e) => { e.stopPropagation(); setRankModalBrawlerId(b.id); }}
                      title="Награды за ранги"
                      style={{
                        position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)",
                        background: "linear-gradient(135deg, #F9A825, #FFD700)",
                        color: "#000",
                        fontSize: 9, fontWeight: 900, letterSpacing: 0.5,
                        borderRadius: 6, padding: "1px 6px",
                        border: "1px solid rgba(0,0,0,0.4)",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                        minWidth: 16, textAlign: "center", whiteSpace: "nowrap",
                        cursor: "pointer",
                      }}
                    >Р{bRank}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isNew ? "#FF6B00" : isSelected ? b.color : "white", display: "flex", alignItems: "center", gap: 4 }}>
                      {b.name}
                      {isNew && <span style={{ fontSize: 9, fontWeight: 900, background: "linear-gradient(135deg,#FF4500,#FF6B00)", color: "white", borderRadius: 5, padding: "1px 5px", letterSpacing: 0.5 }}>НОВОЕ</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>УР {lv} • 🏆 {bTrophies}</div>
                  </div>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 1,
                    background: rarityColor, color: "white",
                    borderRadius: 6, padding: "2px 6px",
                    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  }}>{BRAWLER_RARITY_LABEL[b.rarity]}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "row", alignItems: "stretch", padding: "14px 18px", overflowY: "hidden", minHeight: 0, gap: 14 }}>
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <BrawlerViewer3D brawlerId={brawler.id} color={brawler.color} size={320} />
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: brawler.color }}>{brawler.name}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", letterSpacing: 2 }}>{brawler.role.toUpperCase()} • УРОВЕНЬ {level} / 10</div>
              <button
                onClick={() => setRankModalBrawlerId(brawler.id)}
                style={{
                  marginTop: 12,
                  position: "relative",
                  background: "linear-gradient(135deg, rgba(255,215,0,0.18), rgba(206,147,216,0.18))",
                  border: "1px solid rgba(255,215,0,0.5)",
                  borderRadius: 12,
                  padding: "10px 18px",
                  color: "white",
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ color: "#FFD700", fontSize: 18 }}>🏆</span>
                <span>{trophies} кубков</span>
                <span style={{
                  background: "rgba(255,255,255,0.12)",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 11,
                  letterSpacing: 1,
                }}>РАНГ {rank} / {MAX_BRAWLER_RANK}</span>
                {unclaimed > 0 && (
                  <span style={{
                    position: "absolute",
                    top: -8, right: -8,
                    minWidth: 22, height: 22,
                    borderRadius: 11,
                    background: "#FF3D00",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 6px",
                    boxShadow: "0 0 0 2px rgba(255,61,0,0.35), 0 0 14px 2px rgba(255,61,0,0.85)",
                    animation: "rankBadgePulse 1.4s ease-in-out infinite",
                  }}>{unclaimed}</span>
                )}
              </button>
              {nextReward && (
                <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.55)" }}>
                  До ранга {rank + 1}: {Math.min(trophiesIntoNext, trophiesNeededForNext)} / {trophiesNeededForNext}
                </div>
              )}
            </div>
          </div>
          <style>{`
            @keyframes rankBadgePulse {
              0%, 100% { transform: scale(1); box-shadow: 0 0 0 2px rgba(255,61,0,0.35), 0 0 14px 2px rgba(255,61,0,0.85); }
              50% { transform: scale(1.12); box-shadow: 0 0 0 3px rgba(255,61,0,0.45), 0 0 22px 4px rgba(255,61,0,1); }
            }
          `}</style>

          <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 16, padding: 12, minWidth: 250, maxWidth: 410, alignSelf: "stretch", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {[
                { label: "ЗДОРОВЬЕ", base: brawler.hp, current: scaled.hp, color: "#4CAF50" },
                { label: "УРОН", base: brawler.attackDamage, current: scaled.attackDamage, color: "#FF5252" },
                { label: "СКОРОСТЬ", base: brawler.speed, current: scaled.speed, color: "#40C4FF" },
                { label: "РЕГЕН", base: brawler.regenRate, current: brawler.regenRate, color: "#CE93D8" },
              ].map(stat => (
                <div key={stat.label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "7px 9px" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", fontWeight: 700, letterSpacing: 1 }}>{stat.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: stat.color }}>{stat.current}</div>
                  {nextScaled && stat.label === "ЗДОРОВЬЕ" && <div style={{ fontSize: 10, color: "#4CAF50" }}>→ {nextScaled.hp}</div>}
                  {nextScaled && stat.label === "УРОН" && <div style={{ fontSize: 10, color: "#FF5252" }}>→ {nextScaled.attackDamage}</div>}
                </div>
              ))}
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                borderRadius: 12,
                padding: "8px 10px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 10, color: "#40C4FF", fontWeight: 700, marginBottom: 2 }}>АТАКА: {brawler.attackName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>{brawler.attackDesc}</div>
              <div style={{ fontSize: 10, color: "#FFD700", fontWeight: 700, marginBottom: 2, marginTop: 6 }}>СУПЕР: {brawler.superName}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", lineHeight: 1.3 }}>{brawler.superDesc}</div>
            </div>

            {level < 10 ? (
              <div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
                  Улучшить до ур. {level + 1}: <CoinIcon size={14} /> {upgradeCost.coins} + <PowerIcon size={14} /> {upgradeCost.pp}
                </div>
                <button
                  onClick={handleUpgrade}
                  disabled={!canUpgrade}
                  style={{
                    width: "100%",
                    background: canUpgrade ? "linear-gradient(135deg, #F9A825, #FFD700)" : "rgba(255,255,255,0.1)",
                    border: "none",
                    borderRadius: 12,
                    padding: "10px 0",
                    color: canUpgrade ? "#000" : "rgba(255,255,255,0.3)",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: canUpgrade ? "pointer" : "not-allowed",
                    letterSpacing: 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {canUpgrade ? <>УЛУЧШИТЬ</> : <><CoinIcon size={14} /> {upgradeCost.coins} + <PowerIcon size={14} /> {upgradeCost.pp}</>}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "#FFD700", fontWeight: 700, fontSize: 14 }}>МАКСИМАЛЬНЫЙ УРОВЕНЬ!</div>
            )}

            {msg && (
              <div style={{ textAlign: "center", marginTop: 10, color: msg === "Уровень повышен!" ? "#4CAF50" : "#FF5252", fontWeight: 700 }}>
                {msg}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {rankModalBrawlerId && (
        <BrawlerRankRewardsModal
          brawlerId={rankModalBrawlerId}
          onClose={() => { setRankModalBrawlerId(null); setProfile(getCurrentProfile()); }}
        />
      )}
      
    </div>
  );
}

function StarsCollectionTab({
  profile, brawlerId, onChanged, onMsg, pickedStar, onPickStar,
}: {
  profile: NonNullable<ReturnType<typeof getCurrentProfile>>;
  brawlerId: string;
  onChanged: () => void;
  onMsg: (m: string) => void;
  pickedStar: number | null;
  onPickStar: (s: number) => void;
}) {
  const brawler = BRAWLERS.find(b => b.id === brawlerId) || BRAWLERS[0];
  const defs = BRAWLER_CONSTELLATIONS[brawler.id] || [];
  const owned = new Set(getBrawlerStars(profile, brawler.id));
  const missingCount = defs.length - owned.size;
  const activeStar = pickedStar ? defs.find(s => s.index === pickedStar) : null;
  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 22, minHeight: 0 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: "#FFD740", marginBottom: 6 }}>
        ✨ Созвездие: {brawler.name}
      </div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginBottom: 12 }}>
        Открыто {owned.size}/6 звёзд
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr minmax(260px, 340px)", gap: 14, alignItems: "start" }}>
        <div style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.16)", borderRadius: 14, padding: 14 }}>
          <BrawlerConstellationView brawlerId={brawler.id} ownedStars={Array.from(owned)} onPick={onPickStar} />
        </div>
        <div style={{ borderRadius: 12, padding: 12, background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.16)" }}>
          {activeStar ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: owned.has(activeStar.index) ? "#FFD740" : "rgba(255,255,255,0.9)" }}>
                {activeStar.icon} {activeStar.name}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.8)" }}>
                {activeStar.effect}
              </div>
              <div style={{ marginTop: 10, fontSize: 11, color: owned.has(activeStar.index) ? "#FFD740" : "rgba(255,255,255,0.6)" }}>
                {owned.has(activeStar.index) ? "Куплено" : "Не куплено"}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
              Выберите звезду на созвездии, чтобы увидеть описание справа.
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        {missingCount > 0 && (
          <button
            onClick={() => {
              const next = defs.find(s => !owned.has(s.index));
              if (!next) return onMsg("Все 6 звёзд уже открыты");
              const r = buyBrawlerStarWithGems(brawler.id, next.index);
              onMsg(r.success ? "Звезда куплена" : (r.error || "Ошибка"));
              onChanged();
            }}
            style={{ border: "none", borderRadius: 10, padding: "10px 14px", background: "linear-gradient(135deg,#0288D1,#40C4FF)", color: "white", fontWeight: 800, cursor: "pointer" }}
          >
            Купить 1 звезду ({STAR_COST_GEMS} 💎)
          </button>
        )}
        {missingCount >= 3 && (
          <button
            onClick={() => {
              const r = buyBrawlerStarsPackWithGems(brawler.id);
              onMsg(r.success ? `Куплен пакет: +${r.gained?.length || 0} звезды` : (r.error || "Ошибка"));
              onChanged();
            }}
            style={{ border: "none", borderRadius: 10, padding: "10px 14px", background: "linear-gradient(135deg,#F9A825,#FFD740)", color: "#3E2723", fontWeight: 800, cursor: "pointer" }}
          >
            Пакет 3 звезды ({STAR_PACK3_COST_GEMS} 💎)
          </button>
        )}
        {missingCount === 0 && (
          <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(0,0,0,0.25)", color: "rgba(255,255,255,0.82)", fontSize: 12 }}>
            Все 6 звёзд для этого бойца уже куплены
          </div>
        )}
      </div>
    </div>
  );
}

function StarInfoModal({
  brawlerId, starIndex, onClose, onChanged, onMsg,
}: {
  brawlerId: string;
  starIndex: number;
  onClose: () => void;
  onChanged: () => void;
  onMsg: (m: string) => void;
}) {
  const profile = getCurrentProfile();
  if (!profile) return null;
  const defs = BRAWLER_CONSTELLATIONS[brawlerId] || [];
  const star = defs.find(s => s.index === starIndex);
  if (!star) return null;
  const owned = new Set(getBrawlerStars(profile, brawlerId));
  const isOpen = owned.has(starIndex);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 460, maxWidth: "95vw", borderRadius: 14, background: "linear-gradient(180deg, rgba(26,10,51,0.95), rgba(8,2,20,0.95))", border: "1px solid rgba(255,255,255,0.2)", padding: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#FFD740" }}>{star.icon} {star.name}</div>
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.82)" }}>{star.effect}</div>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <button
            onClick={() => {
              const r = buyBrawlerStarWithGems(brawlerId, starIndex);
              onMsg(r.success ? "Звезда куплена" : (r.error || "Ошибка"));
              onChanged();
            }}
            disabled={isOpen}
            style={{ border: "none", borderRadius: 10, padding: "9px 12px", background: isOpen ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#0288D1,#40C4FF)", color: isOpen ? "rgba(255,255,255,0.5)" : "white", fontWeight: 800, cursor: isOpen ? "default" : "pointer" }}
          >
            {isOpen ? "Уже куплено" : `Купить за ${STAR_COST_GEMS} 💎`}
          </button>
          <button onClick={onClose} style={{ border: "1px solid rgba(255,255,255,0.25)", borderRadius: 10, padding: "9px 12px", background: "rgba(255,255,255,0.06)", color: "white", fontWeight: 700, cursor: "pointer" }}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pets sub-tab ──────────────────────────────────────────────────────────
const PET_RARITY_TINT: Record<string, string> = {
  common: "#9E9E9E", rare: "#42A5F5", epic: "#AB47BC",
  mythic: "#FF7043", legendary: "#FFD54F",
};

function PetsCollectionTab({ profile }: { profile: ReturnType<typeof getCurrentProfile> }) {
  if (!profile) return null;
  const owned = new Set(profile.unlockedPets || []);
  const ownedPets = PETS
    .filter(p => owned.has(p.id))
    .sort((a, b) =>
      PET_RARITY_ORDER.indexOf(b.rarity) - PET_RARITY_ORDER.indexOf(a.rarity)
      || a.name.localeCompare(b.name));
  const lockedPets = PETS
    .filter(p => !owned.has(p.id))
    .sort((a, b) => PET_RARITY_ORDER.indexOf(a.rarity) - PET_RARITY_ORDER.indexOf(b.rarity));

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 22, minHeight: 0 }}>
      <div style={{
        fontSize: 11, color: "rgba(178,255,89,0.85)",
        letterSpacing: 3, fontWeight: 800, marginBottom: 10, paddingLeft: 4,
      }}>МОИ ПИТОМЦЫ <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 6 }}>{ownedPets.length}/{PETS.length}</span></div>
      {ownedPets.length === 0 ? (
        <div style={{
          padding: 26, textAlign: "center",
          color: "rgba(255,255,255,0.55)", fontSize: 13,
          background: "rgba(0,0,0,0.25)", borderRadius: 12,
          border: "1px dashed rgba(255,255,255,0.10)",
          marginBottom: 18,
        }}>Питомцы пока не пойманы — открывайте сундуки или покупайте за кристаллы.</div>
      ) : (
        <CollectionPetGrid pets={ownedPets} owned profile={profile} />
      )}

      <div style={{
        fontSize: 11, color: "rgba(255,255,255,0.4)",
        letterSpacing: 3, fontWeight: 800, marginBottom: 10, marginTop: 18, paddingLeft: 4,
      }}>ЗАБЛОКИРОВАНЫ <span style={{ marginLeft: 6 }}>{lockedPets.length}</span></div>
      <CollectionPetGrid pets={lockedPets} owned={false} profile={profile} />
    </div>
  );
}

function CollectionPetGrid({
  pets, owned, profile,
}: {
  pets: typeof PETS;
  owned: boolean;
  profile: ReturnType<typeof getCurrentProfile>;
}) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      gap: 12,
    }}>
      {pets.map(p => {
        const isEquipped = owned && profile?.equippedPetId === p.id;
        const isNew = owned && (profile?.newPets || []).includes(p.id);
        return (
          <div key={p.id} style={{
            position: "relative",
            background: owned
              ? `linear-gradient(180deg, ${p.color}26 0%, rgba(0,0,0,0.55) 100%)`
              : "rgba(0,0,0,0.45)",
            border: owned ? `1.5px solid ${p.color}55` : "1.5px solid rgba(255,255,255,0.10)",
            borderRadius: 14, padding: "12px 8px 10px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
          }}>
            <div style={{
              position: "absolute", top: 6, left: 6,
              width: 8, height: 8, borderRadius: 999,
              background: PET_RARITY_TINT[p.rarity],
              boxShadow: `0 0 6px ${PET_RARITY_TINT[p.rarity]}`,
            }} />
            {isEquipped && (
              <div style={{
                position: "absolute", top: 4, right: 4,
                fontSize: 8, fontWeight: 900, letterSpacing: 1,
                background: "#76FF03", color: "#1B5E20",
                borderRadius: 6, padding: "2px 5px",
              }}>ЭКИП</div>
            )}
            {isNew && !isEquipped && (
              <div style={{
                position: "absolute", top: 4, right: 4,
                fontSize: 8, fontWeight: 900, letterSpacing: 1,
                background: "#FF1744", color: "white",
                borderRadius: 6, padding: "2px 5px",
              }}>NEW</div>
            )}
            <div style={{
              width: 84, height: 84,
              display: "flex", alignItems: "center", justifyContent: "center",
              filter: owned ? "none" : "grayscale(0.85) brightness(0.55)",
            }}>
              <PetSvg pet={p} size={78} animated={owned} haloPulse={false} />
            </div>
            <div style={{
              fontSize: 11, fontWeight: 800,
              color: owned ? p.color : "rgba(255,255,255,0.5)",
              textAlign: "center",
            }}>{owned ? p.name : "???"}</div>
            <div style={{
              fontSize: 9, color: "rgba(255,255,255,0.55)",
              textAlign: "center", lineHeight: 1.2, minHeight: 22,
            }}>{owned ? p.effectLabel : PET_RARITY_LABEL[p.rarity]}</div>
            {!owned && (
              <div style={{
                fontSize: 10, fontWeight: 800,
                color: "#40C4FF", marginTop: 2,
                display: "inline-flex", alignItems: "center", gap: 3,
              }}><GemIcon size={10} /> {PET_GEM_COST[p.rarity]}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
