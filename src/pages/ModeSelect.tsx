import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameMode, ShowdownFormat, StarStrikeFormat } from "../App";
import { useI18n, modeName } from "../i18n";
import { getCurrentProfile, grantClashPassXp } from "../utils/localStorageAPI";
import BossRaidLobbyCarousel from "../components/BossRaidLobbyCarousel";
import SiegeLevelPanel from "../components/SiegeLevelPanel";
import { PageBg, PageBody } from "../components/PageChrome";
import MapThumbCanvas from "../components/MapThumbCanvas";
import ModeIconImg from "../components/ModeIconImg";
import PassXpFlyBurst from "../components/PassXpFlyBurst";
import type { EditorMode } from "../utils/mapEditorAPI";
import {
  editorModeForGameMode,
  formatCountdown,
  getActiveMap,
  getNextMapChange,
  hasUnseenMap,
  markMapSeen,
} from "../utils/mapSchedule";
import { publicAssetBase, getModeIconUrl } from "../utils/modeAssets";
import {
  getProfileRankedCups,
  rankedLeagueIconUrl,
  rankedStandingFromTotalCups,
} from "../utils/rankedProgress";

/** Отдельные иллюстрации только для боковых вкладок (не режимные превью карт). */
const TAB_DECOR = {
  regular: `${publicAssetBase}images/mode-select-tab-regular.png`,
  ranked: `${publicAssetBase}images/mode-select-tab-ranked.png`,
  boss: `${publicAssetBase}images/mode-select-tab-boss.png`,
  monsters: `${publicAssetBase}images/mode-select-tab-monsters.png`,
} as const;

const RANKED_MODE_CARD_W = 360;

const BARE_MODE_ICON_IDS = new Set<GameMode>(["monsterhide", "monsterInvasion", "teamHunt"]);

const NEW_MAP_PASS_XP = 10;

const REGULAR_MODE_CARD_W = 280;
const REGULAR_MODE_CARD_H = 440;

type ModeCategory = "regular" | "ranked" | "monsters" | "boss";

function categoryForMode(modeId: string): ModeCategory {
  if (modeId === "bossraid") return "boss";
  if (modeId === "ranked") return "ranked";
  if (modeId === "monsterhide" || modeId === "monsterInvasion" || modeId === "teamHunt") return "monsters";
  return "regular";
}

interface ModeSelectProps {
  onSelect: (mode: GameMode, showdownFormat?: ShowdownFormat, starStrikeFormat?: StarStrikeFormat) => void;
  selectedMode?: GameMode;
  selectedShowdownFormat: ShowdownFormat;
  selectedStarStrikeFormat: StarStrikeFormat;
  onBack: () => void;
  /** Выбор босса в ленте: возврат в лобби с режимом bossraid и выбранным боссом */
  onBossRaidLobbyPick?: (bossId: string) => void;
  /** Редактор карт: выбор режима для создания карты */
  mapEditorPick?: (mode: GameMode) => void;
  onClashPass?: () => void;
}

const MODE_DEFS: Array<{
  id: GameMode;
  name: string;
  subtitleKey: string;
  descKey: string;
  playersKey: string;
  color: string;
  gradient: string;
}> = [
  {
    id: "starstrike",
    name: "Star Strike",
    subtitleKey: "mode.starstrike.subtitle",
    descKey: "mode.starstrike.desc",
    playersKey: "mode.starstrike.players",
    color: "#66BB6A",
    gradient: "linear-gradient(135deg, #1B5E20, #66BB6A)",
  },
  {
    id: "showdown",
    name: "Star Battle",
    subtitleKey: "mode.showdown.subtitle",
    descKey: "mode.showdown.desc",
    playersKey: "mode.showdown.players",
    color: "#FF5252",
    gradient: "linear-gradient(135deg, #B71C1C, #FF5252)",
  },
  {
    id: "crystals",
    name: "Crystal Carry",
    subtitleKey: "mode.crystals.subtitle",
    descKey: "mode.crystals.desc",
    playersKey: "mode.crystals.players",
    color: "#40C4FF",
    gradient: "linear-gradient(135deg, #0D47A1, #40C4FF)",
  },
  {
    id: "siege",
    name: "Star Siege",
    subtitleKey: "mode.siege.subtitle",
    descKey: "mode.siege.desc",
    playersKey: "mode.siege.players",
    color: "#69F0AE",
    gradient: "linear-gradient(135deg, #1B5E20, #69F0AE)",
  },
  {
    id: "heist",
    name: "Fallen Crown",
    subtitleKey: "mode.heist.subtitle",
    descKey: "mode.heist.desc",
    playersKey: "mode.heist.players",
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #F57F17, #FFD700)",
  },
  {
    id: "gemgrab",
    name: "Crystal Void",
    subtitleKey: "mode.gemgrab.subtitle",
    descKey: "mode.gemgrab.desc",
    playersKey: "mode.gemgrab.players",
    color: "#CE93D8",
    gradient: "linear-gradient(135deg, #4A148C, #CE93D8)",
  },
  {
    id: "megashowdown",
    name: "Mega Star Battle",
    subtitleKey: "mode.megashowdown.subtitle",
    descKey: "mode.megashowdown.desc",
    playersKey: "mode.megashowdown.players",
    color: "#FFD54F",
    gradient: "linear-gradient(135deg, #B71C1C, #FFD54F)",
  },
  {
    id: "bounty",
    name: "Star Hunt",
    subtitleKey: "mode.bounty.subtitle",
    descKey: "mode.bounty.desc",
    playersKey: "mode.bounty.players",
    color: "#FFE082",
    gradient: "linear-gradient(135deg, #311B92, #FFE082)",
  },
];

const MONSTER_MODE_DEFS: Array<{
  id: GameMode;
  name: string;
  subtitleKey: string;
  descKey: string;
  playersKey: string;
  color: string;
  gradient: string;
}> = [
  {
    id: "monsterhide",
    name: "Monster Hide",
    subtitleKey: "mode.monsterhide.subtitle",
    descKey: "mode.monsterhide.desc",
    playersKey: "mode.monsterhide.players",
    color: "#AB47BC",
    gradient: "linear-gradient(135deg, #4A148C, #AB47BC)",
  },
  {
    id: "monsterInvasion",
    name: "Monster Invasion",
    subtitleKey: "mode.monsterInvasion.subtitle",
    descKey: "mode.monsterInvasion.desc",
    playersKey: "mode.monsterInvasion.players",
    color: "#FF7043",
    gradient: "linear-gradient(135deg, #BF360C, #FF7043)",
  },
  {
    id: "teamHunt",
    name: "Team Hunt",
    subtitleKey: "mode.teamHunt.subtitle",
    descKey: "mode.teamHunt.desc",
    playersKey: "mode.teamHunt.players",
    color: "#26C6DA",
    gradient: "linear-gradient(135deg, #006064, #26C6DA)",
  },
];

export default function ModeSelect({ onSelect, selectedMode, selectedShowdownFormat, selectedStarStrikeFormat, onBack, onBossRaidLobbyPick, mapEditorPick, onClashPass }: ModeSelectProps) {
  const { t } = useI18n();
  const regularModes = useMemo(
    () =>
      MODE_DEFS.map((m) => ({
        ...m,
        name: modeName(m.id, m.name),
        subtitle: t(m.subtitleKey),
        desc: t(m.descKey),
        players: t(m.playersKey),
      })),
    [t],
  );
  const monsterModes = useMemo(
    () =>
      MONSTER_MODE_DEFS.map((m) => ({
        ...m,
        name: modeName(m.id, m.name),
        subtitle: t(m.subtitleKey),
        desc: t(m.descKey),
        players: t(m.playersKey),
      })),
    [t],
  );
  const [category, setCategory] = useState<ModeCategory>(() => {
    const modeId = selectedMode ?? getCurrentProfile()?.selectedMode ?? "showdown";
    return categoryForMode(modeId);
  });
  const visibleModes = category === "monsters" ? monsterModes : regularModes;
  const [hovered, setHovered] = useState<number | null>(null);
  const [showdownFormat, setShowdownFormat] = useState<ShowdownFormat>(selectedShowdownFormat);
  const [starStrikeFormat, setStarStrikeFormat] = useState<StarStrikeFormat>(selectedStarStrikeFormat);
  const [tabHover, setTabHover] = useState<ModeCategory | null>(null);
  const [tabPressed, setTabPressed] = useState<ModeCategory | null>(null);
  const [revealedNew, setRevealedNew] = useState<Record<string, boolean>>({});
  const [passFlyJobs, setPassFlyJobs] = useState<Array<{ id: number; count: number; modeId: string }>>([]);
  const passFlyIdRef = useRef(0);
  const [, setTick] = useState(0);
  const passTargetRef = useRef<HTMLButtonElement>(null);
  const modeCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const profile = getCurrentProfile();

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const handleNewMap = (modeId: string, editorMode: EditorMode) => {
    const active = getActiveMap(editorMode);
    if (active) markMapSeen(editorMode, active.id);
    grantClashPassXp(NEW_MAP_PASS_XP);
    setRevealedNew(prev => ({ ...prev, [modeId]: true }));
    const id = passFlyIdRef.current++;
    setPassFlyJobs(jobs => [...jobs, { id, count: NEW_MAP_PASS_XP, modeId }]);
  };
  const ownedCount = profile?.unlockedBrawlers?.length ?? 0;
  const effectiveShowdownFormat = showdownFormat;

  const pickRegularMode = (modeId: GameMode) => {
    if (mapEditorPick) {
      if (!editorModeForGameMode(modeId)) return;
      mapEditorPick(modeId);
      return;
    }
    const editorMode = editorModeForGameMode(modeId);
    if (editorMode) {
      const active = getActiveMap(editorMode);
      if (active) markMapSeen(editorMode, active.id);
    }
    if (modeId === "showdown") onSelect(modeId, effectiveShowdownFormat);
    else if (modeId === "starstrike") onSelect(modeId, undefined, starStrikeFormat);
    else onSelect(modeId);
  };

  const showBossTab = Boolean(onBossRaidLobbyPick || mapEditorPick);

  const tabIconStyle = (key: ModeCategory): CSSProperties => ({
    width: "100%",
    height: 36,
    display: "block",
    objectFit: "contain",
    background: "transparent",
    transform: tabHover === key ? "scale(1.05)" : "scale(1)",
    transition: "transform 0.28s ease",
  });

  const tabLabelStyle = (key: ModeCategory): CSSProperties => {
    const activeColors: Record<ModeCategory, string> = {
      regular: "#e1f5fe",
      ranked: "#f8bbd0",
      monsters: "#e1bee7",
      boss: "#ffe082",
    };
    return {
      fontSize: 9,
      fontWeight: 800,
      color: category === key ? activeColors[key] : "rgba(255,255,255,0.78)",
      letterSpacing: 0.2,
      lineHeight: 1.15,
      textAlign: "center",
    };
  };

  const tabBase = (key: ModeCategory) => {
    const active = category === key;
    const hover = tabHover === key;
    const pressed = tabPressed === key;
    return {
      borderRadius: 11,
      padding: "6px 5px 7px",
      cursor: "pointer",
      width: "100%",
      border: active
        ? "1.5px solid rgba(255,213,79,0.75)"
        : hover
          ? "1.5px solid rgba(255,255,255,0.28)"
          : "1px solid rgba(255,255,255,0.1)",
      background: active
        ? "linear-gradient(165deg, rgba(40,55,95,0.92), rgba(16,22,42,0.98))"
        : hover
          ? "linear-gradient(165deg, rgba(34,46,78,0.9), rgba(14,18,34,0.96))"
          : "linear-gradient(165deg, rgba(26,36,62,0.82), rgba(12,14,28,0.94))",
      boxShadow: active
        ? "0 0 14px rgba(255,213,79,0.2), inset 0 1px 0 rgba(255,255,255,0.06)"
        : hover
          ? "0 6px 16px rgba(0,0,0,0.4), 0 0 12px rgba(100,180,255,0.1)"
          : "0 2px 8px rgba(0,0,0,0.28)",
      transform: pressed ? "scale(0.96)" : hover ? "scale(1.04)" : "scale(1)",
      transition: "transform 0.16s ease, box-shadow 0.22s ease, border-color 0.18s ease, background 0.22s ease",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "stretch",
      gap: 5,
      position: "relative" as const,
      overflow: "hidden" as const,
      animation: active ? "modeTabGlow 2.4s ease-in-out infinite" : undefined,
    };
  };

  return (
    <PageBg
      variant="modeselect"
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        fontFamily: "var(--app-font-sans)",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes modeTabGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(255,213,79,0.16), inset 0 1px 0 rgba(255,255,255,0.06); }
          50% { box-shadow: 0 0 16px rgba(255,213,79,0.26), inset 0 1px 0 rgba(255,255,255,0.08); }
        }
        @keyframes newMapPulse {
          0%, 100% { box-shadow: inset 0 0 0 2px rgba(255,255,255,0.5), 0 0 24px rgba(255,235,59,0.65); }
          50% { box-shadow: inset 0 0 0 3px rgba(255,255,255,0.75), 0 0 40px rgba(255,235,59,0.95); }
        }
      `}</style>

      {/* Боковая колонка с вкладками */}
      <aside
        style={{
          width: 92,
          flexShrink: 0,
          padding: "52px 8px 14px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "linear-gradient(180deg, rgba(6,10,24,0.55) 0%, rgba(10,16,36,0.75) 100%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset -4px 0 14px rgba(0,0,0,0.2)",
        }}
      >
        <button
          type="button"
          onClick={() => setCategory("regular")}
          onMouseEnter={() => setTabHover("regular")}
          onMouseLeave={() => {
            setTabHover(null);
            setTabPressed(null);
          }}
          onMouseDown={() => setTabPressed("regular")}
          onMouseUp={() => setTabPressed(null)}
          style={tabBase("regular")}
        >
          <img
            src={TAB_DECOR.regular}
            alt=""
            className="ui-game-icon"
            style={tabIconStyle("regular")}
          />
          <div style={tabLabelStyle("regular")}>
            {t("mode.category.regular")}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setCategory("ranked")}
          onMouseEnter={() => setTabHover("ranked")}
          onMouseLeave={() => {
            setTabHover(null);
            setTabPressed(null);
          }}
          onMouseDown={() => setTabPressed("ranked")}
          onMouseUp={() => setTabPressed(null)}
          style={tabBase("ranked")}
        >
          <img src={TAB_DECOR.ranked} alt="" className="ui-game-icon" style={tabIconStyle("ranked")} />
          <div style={tabLabelStyle("ranked")}>{t("ranked.tab")}</div>
        </button>

        <button
          type="button"
          onClick={() => setCategory("monsters")}
          onMouseEnter={() => setTabHover("monsters")}
          onMouseLeave={() => {
            setTabHover(null);
            setTabPressed(null);
          }}
          onMouseDown={() => setTabPressed("monsters")}
          onMouseUp={() => setTabPressed(null)}
          style={tabBase("monsters")}
        >
          <img
            src={TAB_DECOR.monsters}
            alt=""
            className="ui-game-icon"
            style={tabIconStyle("monsters")}
          />
          <div style={tabLabelStyle("monsters")}>
            {t("mode.category.monsters")}
          </div>
        </button>

        {showBossTab ? (
          <button
            type="button"
            onClick={() => setCategory("boss")}
            onMouseEnter={() => setTabHover("boss")}
            onMouseLeave={() => {
              setTabHover(null);
              setTabPressed(null);
            }}
            onMouseDown={() => setTabPressed("boss")}
            onMouseUp={() => setTabPressed(null)}
            style={tabBase("boss")}
          >
            <img
              src={TAB_DECOR.boss}
              alt=""
              className="ui-game-icon"
              style={tabIconStyle("boss")}
            />
            <div style={tabLabelStyle("boss")}>
              {t("mode.category.boss")}
            </div>
          </button>
        ) : null}
      </aside>

      {/* Основная область */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: category === "boss" ? "14px 20px 8px" : "16px 24px 10px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.12) 100%)",
          }}
        >
          <button onClick={onBack} className="ui-back-btn">← {t("common.back")}</button>
          <div style={{ flex: 1, textAlign: "center" }}>
          <h1
            style={{
              fontSize: category === "boss" ? 30 : 42,
              fontWeight: 900,
              background: "linear-gradient(135deg, #CE93D8, #FFD700)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundSize: "200% auto",
              animation: "shimmer 3s linear infinite",
              margin: 0,
            }}
          >
            {category === "boss" ? t("mode.boss.title") : category === "monsters" ? t("mode.monsters.title") : mapEditorPick ? t("drawer.mapEditor") : t("mode.select.title")}
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              marginTop: category === "boss" ? 4 : 8,
              fontSize: category === "boss" ? 11 : 14,
              lineHeight: category === "boss" ? 1.35 : undefined,
              maxWidth: category === "boss" ? 520 : undefined,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {category === "boss" ? t("mode.boss.subtitle") : category === "monsters" ? t("mode.monsters.subtitle") : mapEditorPick ? t("drawer.mapEditor.sub") : t("mode.select.subtitle")}
          </p>
          </div>
          {onClashPass && (
            <button
              ref={passTargetRef}
              type="button"
              onClick={onClashPass}
              className="ui-btn ui-btn--ghost"
              style={{
                letterSpacing: "0.08em",
                fontSize: 11,
                padding: "8px 12px",
                borderColor: "rgba(206,147,216,0.45)",
                color: "#CE93D8",
              }}
            >
              ⭐ STAR PASS
            </button>
          )}
        </div>

        <PageBody style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: category === "regular" || category === "monsters" ? "stretch" : "center",
          padding: category === "boss" ? "12px 12px 16px" : category === "regular" || category === "monsters" ? "16px 12px 20px" : "24px 24px 48px",
          width: "100%",
          minHeight: 0,
          overflow: category === "regular" || category === "monsters" ? "hidden" : undefined,
        }}>
        {category === "ranked" ? (
          <RankedModeCard
            profile={profile}
            onSelect={() => {
              if (mapEditorPick) return;
              onSelect("ranked");
            }}
          />
        ) : category === "regular" || category === "monsters" ? (
          <div
            className="ui-scroll-hidden"
            style={{
              width: "100%",
              flex: 1,
              minHeight: 0,
              overflowX: "auto",
              overflowY: "hidden",
              padding: "4px 4px 8px",
              scrollSnapType: "x mandatory",
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 16,
                width: "max-content",
                height: REGULAR_MODE_CARD_H,
                padding: "0 4px",
              }}
            >
            {visibleModes.map((mode, i) => {
              const locked = !mapEditorPick && mode.id === "megashowdown" && ownedCount < 3;
              const editorMode = editorModeForGameMode(mode.id);
              const nextChange = editorMode ? getNextMapChange(editorMode) : null;
              const showNew = Boolean(editorMode && hasUnseenMap(editorMode) && !revealedNew[mode.id]);
              const activeMap = editorMode ? getActiveMap(editorMode) : null;
              return (
                <div
                  key={mode.id}
                  ref={el => { modeCardRefs.current[mode.id] = el; }}
                  onMouseOver={() => setHovered(i)}
                  onMouseOut={() => setHovered(null)}
                  className="ui-card"
                  style={{
                    flex: `0 0 ${REGULAR_MODE_CARD_W}px`,
                    width: REGULAR_MODE_CARD_W,
                    height: REGULAR_MODE_CARD_H,
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    scrollSnapAlign: "start",
                    background: hovered === i
                      ? `linear-gradient(160deg, ${mode.color}30, rgba(8,4,24,0.78))`
                      : "linear-gradient(160deg, rgba(255,255,255,0.06), rgba(8,4,24,0.55))",
                    border: `1px solid ${showNew ? "#FFEB3B" : hovered === i ? mode.color : "var(--bd-1)"}`,
                    borderRadius: "var(--r-xl)",
                    padding: 20,
                    cursor: locked ? "not-allowed" : "pointer",
                    transform: hovered === i && !locked ? "translateY(-4px)" : "none",
                    transition: "all var(--ease-mid)",
                    boxShadow: showNew
                      ? "0 0 28px rgba(255,235,59,0.5), var(--sh-sm)"
                      : hovered === i && !locked
                        ? `0 14px 44px ${mode.color}66, var(--sh-md), inset 0 1px 0 rgba(255,255,255,0.10)`
                        : "var(--sh-sm), inset 0 1px 0 rgba(255,255,255,0.06)",
                    position: "relative",
                    overflow: "hidden",
                    opacity: locked ? 0.55 : 1,
                    backdropFilter: "blur(12px) saturate(1.15)",
                    WebkitBackdropFilter: "blur(12px) saturate(1.15)",
                  }}
                  onClick={() => {
                    if (locked) return;
                    if (mapEditorPick) {
                      if (!editorModeForGameMode(mode.id)) return;
                      mapEditorPick(mode.id);
                      return;
                    }
                    if (showNew && editorMode) {
                      handleNewMap(mode.id, editorMode);
                      return;
                    }
                    pickRegularMode(mode.id);
                  }}
                >
                  {nextChange && (
                    <div style={{
                      flexShrink: 0,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 800,
                      color: "#FFD54F",
                      marginBottom: 8,
                    }}>
                      {t("mode.newMapIn", { time: formatCountdown(nextChange.ms) })}
                    </div>
                  )}
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ marginBottom: 10, position: "relative", flexShrink: 0 }}>
                    <ModeIconImg
                      modeId={mode.id}
                      alt={mode.name}
                      size={108}
                      color={mode.color}
                      bare={BARE_MODE_ICON_IDS.has(mode.id)}
                    />
                    {mode.id === "megashowdown" && (
                      <div
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -4,
                          fontSize: 24,
                          lineHeight: 1,
                          filter: `drop-shadow(0 0 8px ${mode.color})`,
                          pointerEvents: "none",
                        }}
                      >
                        ✨✨✨
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      color: "#fff",
                      marginBottom: 2,
                      letterSpacing: 1,
                      flexShrink: 0,
                    }}
                  >
                    {mode.name}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2, fontWeight: 700, flexShrink: 0 }}>
                    {mode.subtitle}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 8, letterSpacing: 1, flexShrink: 0 }}>
                    {mode.players}
                  </div>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 13,
                      margin: 0,
                      lineHeight: 1.45,
                      flexShrink: 0,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {mode.desc}
                  </p>
                  {(!mapEditorPick && mode.id === "showdown") && (
                    <div style={{ marginTop: 10, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1.2, fontWeight: 700 }}>
                        {t("mode.format.battle")}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(
                          [
                            { id: "solo", label: t("mode.format.solo"), players: t("mode.format.soloPlayers") },
                            { id: "duo", label: t("mode.format.duo"), players: t("mode.format.duoPlayers") },
                            { id: "trio", label: t("mode.format.trio"), players: t("mode.format.trioPlayers") },
                          ] as const
                        ).map((f) => {
                          const active = effectiveShowdownFormat === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowdownFormat(f.id);
                              }}
                              style={{
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                                ["--ui-shear-fill" as string]: active ? "rgba(255,82,82,0.28)" : "rgba(255,255,255,0.06)",
                                ["--ui-shear-border" as string]: active ? "#FF5252" : "rgba(255,255,255,0.16)",
                                ["--ui-shear-text" as string]: active ? "#ffffff" : "rgba(255,255,255,0.85)",
                              }}
                              title={f.players}
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(!mapEditorPick && mode.id === "starstrike") && (
                    <div style={{ marginTop: 10, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1.2, fontWeight: 700 }}>
                        {t("mode.format.team")}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(
                          [
                            { id: "3v3", label: t("mode.format.3v3") },
                            { id: "5v5", label: t("mode.format.5v5") },
                          ] as const
                        ).map((f) => {
                          const active = starStrikeFormat === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStarStrikeFormat(f.id);
                              }}
                              style={{
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                                ["--ui-shear-fill" as string]: active ? "rgba(102,187,106,0.28)" : "rgba(255,255,255,0.06)",
                                ["--ui-shear-border" as string]: active ? "#66BB6A" : "rgba(255,255,255,0.16)",
                                ["--ui-shear-text" as string]: active ? "#ffffff" : "rgba(255,255,255,0.85)",
                              }}
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(!mapEditorPick && mode.id === "siege") && (
                    <div style={{ marginTop: 8, flex: 1, minHeight: 0, overflow: "hidden" }}>
                      <SiegeLevelPanel compact />
                    </div>
                  )}

                  {locked && (
                    <div
                      style={{
                        marginTop: "auto",
                        flexShrink: 0,
                        background: "rgba(0,0,0,0.45)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: 10,
                        padding: "8px 12px",
                        color: "#FFD54F",
                        fontWeight: 800,
                        fontSize: 11,
                        letterSpacing: 0.5,
                        textAlign: "center",
                      }}
                    >
                      {t("mode.locked", { count: ownedCount })}
                    </div>
                  )}
                  </div>
                  {showNew && editorMode && (
                    <div
                      role="presentation"
                      onClick={(e) => { e.stopPropagation(); handleNewMap(mode.id, editorMode); }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "var(--r-xl)",
                        background: "linear-gradient(155deg, rgba(255,244,117,0.96) 0%, rgba(255,213,0,0.98) 45%, rgba(255,193,7,0.96) 100%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        cursor: "pointer",
                        zIndex: 5,
                        animation: "newMapPulse 2.2s ease-in-out infinite",
                      }}
                    >
                      <span style={{
                        fontSize: 32,
                        fontWeight: 900,
                        letterSpacing: 4,
                        color: "#fff",
                        textShadow: "0 2px 10px rgba(255,152,0,0.85), 0 0 20px rgba(255,255,255,0.5)",
                      }}>
                        {t("common.new")}
                      </span>
                      <span style={{ fontSize: 22, lineHeight: 1, filter: "drop-shadow(0 0 8px rgba(255,255,255,0.9))" }}>✨✨✨</span>
                      {activeMap && (
                        <MapThumbCanvas map={activeMap} size={88} borderColor="rgba(255,255,255,0.55)" />
                      )}
                      {activeMap && (
                        <span style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#fff",
                          textShadow: "0 1px 6px rgba(255,120,0,0.7)",
                        }}>
                          {activeMap.name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        ) : (onBossRaidLobbyPick || mapEditorPick) ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <BossRaidLobbyCarousel
              onSelectBoss={(bossId) => {
                if (mapEditorPick) mapEditorPick("bossraid");
                else onBossRaidLobbyPick?.(bossId);
              }}
            />
          </div>
        ) : null}
        </PageBody>
      </div>

      {passFlyJobs.map(job => (
        <PassXpFlyBurst
          key={job.id}
          count={job.count}
          fromEl={modeCardRefs.current[job.modeId]}
          toEl={passTargetRef.current}
          spawnDurationMs={1200}
          onComplete={() => setPassFlyJobs(jobs => jobs.filter(j => j.id !== job.id))}
        />
      ))}
    </PageBg>
  );
}

function RankedModeCard({
  profile,
  onSelect,
}: {
  profile: ReturnType<typeof getCurrentProfile>;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const cups = profile ? getProfileRankedCups(profile) : 0;
  const standing = rankedStandingFromTotalCups(cups);
  const league = standing.leagueId;
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={e => { if (e.key === "Enter") onSelect(); }}
        className="ui-card"
        style={{
          width: RANKED_MODE_CARD_W,
          height: REGULAR_MODE_CARD_H,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          padding: 0,
          overflow: "hidden",
          cursor: "pointer",
          border: "2px solid rgba(206,147,216,0.55)",
          borderRadius: "var(--r-xl)",
          background: "linear-gradient(160deg, rgba(126,87,194,0.35), rgba(8,4,24,0.82))",
          boxShadow: "0 16px 48px rgba(126,87,194,0.35)",
        }}
      >
        <div style={{ flex: 1, padding: 20, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <img src={getModeIconUrl("ranked")} alt="" className="ui-game-icon" style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 12 }} />
          <div style={{ fontSize: 22, fontWeight: 900, color: "#CE93D8" }}>{t("ranked.modeName")}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 8, lineHeight: 1.35 }}>{t("ranked.modeDesc")}</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#FFD54F", marginTop: 12 }}>{t("ranked.tapToSelect")}</div>
        </div>
        <div style={{
          width: 120,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          borderLeft: "1px solid rgba(255,255,255,0.1)",
        }}>
          <img
            src={rankedLeagueIconUrl(league)}
            alt=""
            className="ui-game-icon ranked-league-icon"
            style={{ width: 96, height: 96, objectFit: "contain", filter: "none" }}
          />
        </div>
      </div>
    </div>
  );
}
