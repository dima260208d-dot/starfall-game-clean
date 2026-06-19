import { useState, useEffect, useRef, useCallback } from "react";
import {
  getCurrentUsername,
  getCurrentProfile,
  getControlMode,
  setSelectedBrawler as persistBrawler,
  setSelectedMode as persistMode,
  setSelectedShowdownFormat as persistShowdownFormat,
  setSelectedStarStrikeFormat as persistStarStrikeFormat,
  logout,
} from "./utils/localStorageAPI";
import AuthPage from "./pages/AuthPage";
import MainMenu from "./pages/MainMenu";
import ModeSelect from "./pages/ModeSelect";
import CharacterSelect from "./pages/CharacterSelect";
import GameScreen from "./pages/GameScreen";
import CollectionPage from "./pages/CollectionPage";
import ShopPage from "./pages/ShopPage";
import CustomizationPage from "./pages/CustomizationPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import ClashPassPage from "./pages/ClashPassPage";
import ProStarPassPage from "./pages/ProStarPassPage";
import TrophyRoadPage from "./pages/TrophyRoadPage";
import ChestsPage from "./pages/ChestsPage";
import PetsPage from "./pages/PetsPage";
import LoadingScreen from "./pages/LoadingScreen";
import MapEditorPage from "./pages/MapEditorPage";
import NewsPage from "./pages/NewsPage";
import MessagesPage from "./pages/MessagesPage";
import AdminPanel from "./pages/AdminPanel";
import ClubsPage from "./pages/ClubsPage";
import FriendsPage from "./pages/FriendsPage";
import PlayerProfilePage from "./pages/PlayerProfilePage";
import { setMyPresence } from "./utils/social/presence";
import { screenToMenuActivity, setMyMenuActivity } from "./utils/social/presence";
import { clearPartyBattleRoster, readPartyBattleRoster, stashPartyBattleRoster } from "./utils/social/partyBattle";
import { clearAllPlayAgainState } from "./utils/social/battleTeamPlayAgain";
import MatchmakingScreen from "./pages/MatchmakingScreen";
import {
  getMatchmakingInitialFound,
  getMatchmakingTotalPlayers,
  matchmakingModeLabel,
} from "./utils/matchmaking/matchmakingConfig";
import {
  clearPartyMatchmaking,
  clearPartyPlayReady,
  getPartyMemberCount,
} from "./utils/social/party";
import { getPartyCount, canPlayWithParty, partyModeFromProfile } from "./utils/social/partyConfig";
import { checkMyPartyRankedLeague } from "./utils/social/party";
import MegaSquadPickerPage from "./pages/MegaSquadPickerPage";
import StarGuardianRewardsPage from "./pages/StarGuardianRewardsPage";
import BattleHistoryPage from "./pages/BattleHistoryPage";
import BattleFeedPage from "./pages/BattleFeedPage";
import RecordsPage from "./pages/RecordsPage";
import RegisterPage from "./pages/RegisterPage";
import AccountsPage from "./pages/AccountsPage";
import AccountDetailPage from "./pages/AccountDetailPage";
import BrawlerMasteryPage from "./pages/BrawlerMasteryPage";
import BrawlerComicPage from "./pages/BrawlerComicPage";
import BrawlerTrailPage from "./pages/BrawlerTrailPage";
import StarFeatsPage from "./pages/StarFeatsPage";
import RankedMenuPage, { RankedMatchFlowPage } from "./pages/RankedMenuPage";
import { clearRankedBattleSession } from "./utils/rankedMapPick";
import {
  beginPlayerMapBattle,
  clearMapSourceCategory,
  clearPlayerMapBattleSession,
  isPlayerMapsModeSelected,
} from "./utils/playerMaps/playerMapSession";
import { tickPlayerMapMaintenance } from "./utils/playerMaps/playerMapRegistry";
import { syncProfileWithCloud, ensureAutoCloudSyncRunning } from "./utils/cloud/profileCloud";
import LiveBattleSpectator from "./components/LiveBattleSpectator";
import BackgroundBattleRejoinBanner from "./components/BackgroundBattleRejoinBanner";
import { ensureBotLiveBattleSim } from "./utils/social/botLiveBattleSim";
import {
  hasActiveBackgroundBattle,
  BACKGROUND_BATTLE_CHANGED,
  BACKGROUND_BATTLE_FINISHED,
  getBackgroundBattleMeta,
} from "./game/backgroundBattleSession";
import { syncAiBattleTrainingFromControl, stopAiBattleTraining } from "./ai/aiTrainingRuntime";
import { ensureAdminScheduleTicker } from "./utils/adminScheduler";
import { isAdminUnlocked } from "./utils/mapEditorAPI";
import { editorModeForGameMode } from "./utils/mapSchedule";
import type { EditorMode } from "./utils/mapEditorAPI";
import { isTechBreakActive, subscribeTechBreakChanges, isBattleEntryBlockedByTechBreak, ensureTechBreakTicker } from "./utils/techBreak";
import TechBreakScreen from "./components/TechBreakScreen";
// Side-effect import: installs the battle-finished listener so the club battle
// counter starts ticking the moment the app boots, even before the player ever
// opens the Clubs page.
import "./utils/clubs";
import RotateDeviceOverlay from "./components/RotateDeviceOverlay";
import { MenuStageShell, PlatformLayoutProvider } from "./platform";
import { translate } from "./i18n";
import { preloadAllModels } from "./utils/modelPreloader";
import { preloadBattleAssets } from "./utils/battleAssetPreloader";
import { BOSS_RAID_MAX_LEVEL } from "./utils/bossRaidProgress";
import { resolvePartyBossRaidLevel } from "./utils/partyRaidLevel";
import { resolvePartySiegeLevel } from "./utils/siegeProgress";

type Screen =
  | "auth"
  | "menu"
  | "modeSelect"
  | "characterSelect"
  | "game"
  | "collection"
  | "shop"
  | "customization"
  | "settings"
  | "profile"
  | "clashpass"
  | "trophyroad"
  | "chests"
  | "pets"
  | "mapeditor"
  | "mapEditorModeSelect"
  | "playerMapEditor"
  | "playerMapEditorModeSelect"
  | "news"
  | "messages"
  | "admin"
  | "clubs"
  | "friends"
  | "playerProfile"
  | "megaSquad"
  | "starGuardianRewards"
  | "battleHistory"
  | "records"
  | "techBreakPreview"
  | "register"
  | "accounts"
  | "accountDetail"
  | "battleFeed"
  | "mastery"
  | "comic"
  | "brawlerTrail"
  | "starFeats"
  | "rankedMenu"
  | "rankedMatch"
  | "matchmaking"
  | "proStarPass";

export type GameMode = "showdown" | "crystals" | "siege" | "heist" | "gemgrab" | "training" | "megashowdown" | "starstrike" | "bossraid" | "bounty" | "monsterhide" | "monsterInvasion" | "teamHunt" | "ranked";
export type ShowdownFormat = "solo" | "duo" | "trio";
export type StarStrikeFormat = "3v3" | "5v5";

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => {
    return getCurrentUsername() ? "menu" : "auth";
  });
  const initial = getCurrentProfile();
  const [selectedMode, setSelectedMode] = useState<GameMode>((initial?.selectedMode as GameMode) || "showdown");
  const [selectedShowdownFormat, setSelectedShowdownFormat] = useState<ShowdownFormat>((initial?.selectedShowdownFormat as ShowdownFormat) || "solo");
  const [selectedStarStrikeFormat, setSelectedStarStrikeFormat] = useState<StarStrikeFormat>((initial?.selectedStarStrikeFormat as StarStrikeFormat) || "3v3");
  const [selectedBrawler, setSelectedBrawler] = useState(initial?.selectedBrawlerId || "miya");
  const [masteryBrawlerId, setMasteryBrawlerId] = useState(initial?.selectedBrawlerId || "hana");
  const [comicBrawlerId, setComicBrawlerId] = useState(initial?.selectedBrawlerId || "hana");
  const [trailBrawlerId, setTrailBrawlerId] = useState(initial?.selectedBrawlerId || "hana");
  const [customizationTab, setCustomizationTab] = useState<"pins" | "icons" | "gifts" | "backgrounds" | "trails">("pins");

  // Always rehydrate selections from the active profile when entering the menu/game,
  // so a profile switch never carries stale picks across accounts.
  const hydrateFromProfile = () => {
    const p = getCurrentProfile();
    if (!p) return { mode: "showdown" as GameMode, brawler: "miya" };
    const m = (p.selectedMode as GameMode) || "showdown";
    const b = p.selectedBrawlerId || "miya";
    setSelectedMode(m);
    setSelectedBrawler(b);
    const f = (p.selectedShowdownFormat as ShowdownFormat) || "solo";
    const sf = (p.selectedStarStrikeFormat as StarStrikeFormat) || "3v3";
    setSelectedShowdownFormat(f);
    setSelectedStarStrikeFormat(sf);
    return { mode: m, brawler: b };
  };
  const [bootLoading, setBootLoading] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [techBreakActive, setTechBreakActive] = useState(() => isTechBreakActive());
  const [transitionTo, setTransitionTo] = useState<Screen | null>(null);
  const [transitionLabel, setTransitionLabel] = useState(() => translate("loading.default"));
  const [transitionProgress, setTransitionProgress] = useState(0);
  // Transient one-shot mode override (used by "Испытать" → training).
  // Cleared automatically as soon as the player exits the game so the
  // persisted lobby mode is restored on the next "Играть".
  const [forceMode, setForceMode] = useState<GameMode | null>(null);
  /** Actual 3v3 mode picked in ranked match flow (gemgrab, crystals, …). */
  const [rankedBattleMode, setRankedBattleMode] = useState<GameMode | null>(null);
  const [mapEditorMode, setMapEditorMode] = useState<EditorMode | null>(null);
  // Mega Star Battle squad picked on the squad-picker page; consumed by GameScreen.
  const [megaSquad, setMegaSquad] = useState<{ ids: string[]; levels: number[] } | null>(null);
  /** Активный бой с боссом (id + уровень). Если задан — `GameScreen` в режиме `bossraid`. */
  const [bossRaidBattle, setBossRaidBattle] = useState<{ bossId: string; level: number } | null>(null);
  const [siegeBattle, setSiegeBattle] = useState<{ level: number } | null>(null);
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);
  const [viewClubId, setViewClubId] = useState<string | null>(null);
  const [profileBackScreen, setProfileBackScreen] = useState<Screen>("menu");
  const [spectateTargetId, setSpectateTargetId] = useState<string | null>(null);
  const [reattachBackgroundBattle, setReattachBackgroundBattle] = useState(false);
  const [backgroundBattleActive, setBackgroundBattleActive] = useState(() => hasActiveBackgroundBattle());
  /** Босс, выбранный в ленте режимов; «Играть» в лобби запускает bossraid с этим id */
  // Сохраняется между сессиями, чтобы при перезаходе в игру выбранный босс
  // (а вместе с ним — корректный «текущий уровень» из профиля) восстанавливался,
  // а не сбрасывался на первого/первый уровень.
  const LOBBY_BOSS_KEY = "lobby_bossraid_boss_v1";
  const [lobbyBossRaidBossId, _setLobbyBossRaidBossIdRaw] = useState<string | null>(() => {
    try { return localStorage.getItem(LOBBY_BOSS_KEY) || null; } catch { return null; }
  });
  const setLobbyBossRaidBossId = (id: string | null) => {
    _setLobbyBossRaidBossIdRaw(id);
    try {
      if (id) localStorage.setItem(LOBBY_BOSS_KEY, id);
      else localStorage.removeItem(LOBBY_BOSS_KEY);
    } catch { /* localStorage disabled */ }
  };

  const matchmakingCompleteRef = useRef<() => void>(() => {});
  const [matchmakingUi, setMatchmakingUi] = useState<{
    totalPlayers: number;
    initialFound: number;
    ranked?: boolean;
    modeHint?: string;
  } | null>(null);

  const startMatchmaking = useCallback((
    onComplete: () => void,
    opts?: { ranked?: boolean; modeHint?: string; totalPlayers?: number; initialFound?: number },
  ) => {
    const p = getCurrentProfile();
    const sel = partyModeFromProfile(p);
    const partyCount = getPartyCount(getPartyMemberCount());
    const total = opts?.totalPlayers ?? getMatchmakingTotalPlayers(sel);
    const initial = opts?.initialFound ?? getMatchmakingInitialFound(partyCount, total);
    matchmakingCompleteRef.current = () => {
      setMatchmakingUi(null);
      clearPartyMatchmaking();
      onComplete();
    };
    setMatchmakingUi({
      totalPlayers: total,
      initialFound: initial,
      ranked: opts?.ranked,
      modeHint: opts?.modeHint ?? (opts?.ranked ? undefined : matchmakingModeLabel(sel)),
    });
    setScreen("matchmaking");
  }, []);

  const cancelMatchmakingToMenu = useCallback(() => {
    setMatchmakingUi(null);
    clearPartyMatchmaking();
    clearPartyPlayReady();
    setScreen("menu");
  }, []);

  useEffect(() => {
    if (screen === "mapeditor" && !mapEditorMode) {
      go("mapEditorModeSelect");
    }
  }, [screen, mapEditorMode]);

  useEffect(() => {
    if (screen === "auth" || screen === "game") return;
    setMyPresence("menu");
    setMyMenuActivity(screenToMenuActivity(screen));
  }, [screen]);

  useEffect(() => {
    tickPlayerMapMaintenance();
    ensureAdminScheduleTicker();
    ensureTechBreakTicker();
  }, []);

  useEffect(() => {
    if (bootLoading) return;
    if (!getCurrentUsername()) return;
    void syncProfileWithCloud().finally(() => ensureAutoCloudSyncRunning());
  }, [bootLoading]);

  useEffect(() => subscribeTechBreakChanges(() => {
    setTechBreakActive(isTechBreakActive());
  }), []);

  useEffect(() => {
    try {
      const migrated = localStorage.getItem("ai_training_manual_control_v1");
      if (!migrated) {
        stopAiBattleTraining();
        localStorage.setItem("ai_training_manual_control_v1", "1");
        return;
      }
    } catch { /* ignore */ }
    syncAiBattleTrainingFromControl();
  }, []);

  useEffect(() => {
    if (bootLoading) return;
    // Bot battle sim + localStorage writes pause during live gameplay.
    if (screen === "game") return;
    return ensureBotLiveBattleSim();
  }, [bootLoading, screen]);

  useEffect(() => {
    const syncBg = () => setBackgroundBattleActive(hasActiveBackgroundBattle());
    syncBg();
    window.addEventListener(BACKGROUND_BATTLE_CHANGED, syncBg);
    window.addEventListener(BACKGROUND_BATTLE_FINISHED, syncBg);
    return () => {
      window.removeEventListener(BACKGROUND_BATTLE_CHANGED, syncBg);
      window.removeEventListener(BACKGROUND_BATTLE_FINISHED, syncBg);
    };
  }, []);

  useEffect(() => {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    preloadAllModels(base, (p) => setBootProgress(p)).catch(() => setBootProgress(1));
  }, []);

  useEffect(() => {
    const listenerOpts: AddEventListenerOptions = { capture: true };
    const onKeyDown = async (e: KeyboardEvent) => {
      if (getControlMode() !== "pc") return;
      const shiftOne =
        e.shiftKey &&
        (e.code === "Digit1" || e.key === "!" || e.key === "1" || e.key === "№");
      if (!shiftOne) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      try {
        if (document.fullscreenElement) {
          if (typeof document.exitFullscreen === "function") await document.exitFullscreen();
        } else if (typeof document.documentElement?.requestFullscreen === "function") {
          await document.documentElement.requestFullscreen();
        }
      } catch {
        // Ignore browser/sandbox fullscreen rejections.
      }
    };
    window.addEventListener("keydown", onKeyDown, listenerOpts);
    return () => window.removeEventListener("keydown", onKeyDown, listenerOpts);
  }, []);

  const go = (s: Screen) => setScreen(s);

  // Animated transition with a loading screen (real asset progress for battles).
  const goWithLoad = (s: Screen, label?: string) => {
    if (s === "game" && isBattleEntryBlockedByTechBreak()) {
      return;
    }
    setTransitionLabel(label ?? translate("loading.default"));
    setTransitionTo(s);

    if (s !== "game") {
      setTransitionProgress(1);
      return;
    }

    setTransitionProgress(0);
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    const mode = forceMode ?? selectedMode;
    preloadBattleAssets(base, (p) => setTransitionProgress(p), { mode }).catch(() => {
      setTransitionProgress(1);
    });
  };

  const rejoinBackgroundBattle = useCallback(() => {
    const meta = getBackgroundBattleMeta();
    if (!meta) return;
    setSelectedMode(meta.mode);
    setSelectedBrawler(meta.brawlerId);
    if (meta.showdownFormat) setSelectedShowdownFormat(meta.showdownFormat);
    if (meta.starStrikeFormat) setSelectedStarStrikeFormat(meta.starStrikeFormat);
    setBossRaidBattle(meta.bossRaid ?? null);
    setSiegeBattle(meta.siege ?? null);
    setMegaSquad(meta.megaSquad ?? null);
    setReattachBackgroundBattle(true);
    goWithLoad("game", translate("loading.rejoinBattle"));
  }, []);

  const content = renderContent();
  const isGame = screen === "game";
  return (
    <PlatformLayoutProvider>
      {isGame ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
          {content}
        </div>
      ) : (
        <MenuStageShell>
          {content}
          {screen === "menu" && backgroundBattleActive && (
            <BackgroundBattleRejoinBanner onRejoin={rejoinBackgroundBattle} />
          )}
        </MenuStageShell>
      )}
      <RotateDeviceOverlay />
      {spectateTargetId && (
        <LiveBattleSpectator
          targetPlayerId={spectateTargetId}
          onClose={() => setSpectateTargetId(null)}
          onExitToMenu={() => {
            setSpectateTargetId(null);
            go("menu");
          }}
        />
      )}
    </PlatformLayoutProvider>
  );

  function renderContent() {
  if (bootLoading) {
    return (
      <LoadingScreen
        onDone={() => setBootLoading(false)}
        duration={1500}
        label={translate("loading.welcome")}
        progress={bootProgress}
      />
    );
  }

  if (screen === "techBreakPreview") {
    return (
      <TechBreakScreen
        showDevExit
        onDevExit={() => go("admin")}
      />
    );
  }

  if (techBreakActive && !isAdminUnlocked()) {
    return <TechBreakScreen />;
  }

  if (transitionTo) {
    return (
      <LoadingScreen
        label={transitionLabel}
        duration={1200}
        progress={transitionProgress}
        onDone={() => {
          const target = transitionTo;
          setTransitionTo(null);
          setTransitionProgress(0);
          if (target) go(target);
        }}
      />
    );
  }

  if (screen === "auth") {
    return <AuthPage onAuth={() => { hydrateFromProfile(); go("menu"); }} />;
  }

  if (screen === "menu") {
    return (
      <MainMenu
        lobbyBossRaidBossId={lobbyBossRaidBossId}
        onPlay={() => {
          const p = getCurrentProfile();
          if (p) {
            const sel = partyModeFromProfile(p);
            const n = getPartyMemberCount();
            if (!canPlayWithParty(n, sel)) {
              return;
            }
            if (sel.mode === "ranked" && n > 1 && !checkMyPartyRankedLeague().ok) {
              return;
            }
          }
          stashPartyBattleRoster();
          clearAllPlayAgainState();
          if (isPlayerMapsModeSelected()) {
            const prof = getCurrentProfile();
            const playMode = (prof?.selectedMode as GameMode) || selectedMode;
            if (playMode !== "ranked") {
              const picked = beginPlayerMapBattle(playMode);
              if (!picked) {
                window.alert(translate("playerMaps.noMapsAvailable"));
                return;
              }
            }
          } else {
            clearPlayerMapBattleSession();
          }
          if (lobbyBossRaidBossId) {
            startMatchmaking(() => {
              hydrateFromProfile();
              const lv = resolvePartyBossRaidLevel(lobbyBossRaidBossId);
              setBossRaidBattle({ bossId: lobbyBossRaidBossId, level: lv });
              setSiegeBattle(null);
              goWithLoad("game", translate("loading.bossBattle"));
            });
            return;
          }
          setBossRaidBattle(null);
          const { mode } = hydrateFromProfile();
          if (mode === "siege") {
            setSiegeBattle({ level: resolvePartySiegeLevel() });
          } else {
            setSiegeBattle(null);
          }
          if (mode === "megashowdown") {
            go("megaSquad");
            return;
          }
          if (mode === "ranked") {
            go("rankedMatch");
            return;
          }
          startMatchmaking(() => goWithLoad("game", translate("loading.arena")));
        }}
        onRanked={() => go("rankedMenu")}
        onProStarPass={() => go("proStarPass")}
        onCollection={() => go("collection")}
        onShop={() => go("shop")}
        onCustomization={() => go("customization")}
        onSettings={() => go("settings")}
        onProfile={() => go("profile")}
        onBattleFeed={() => go("battleFeed")}
        onClashPass={() => go("clashpass")}
        onTrophyRoad={() => go("trophyroad")}
        onChests={() => go("chests")}
        onPets={() => go("pets")}
        onStarFeats={() => go("starFeats")}
        onModeSelect={() => go("modeSelect")}
        onBrawlerSelect={() => go("characterSelect")}
        onMastery={(id) => { setMasteryBrawlerId(id); go("mastery"); }}
        onComic={(id) => { setComicBrawlerId(id); go("comic"); }}
        onTrails={(id) => { setTrailBrawlerId(id); go("brawlerTrail"); }}
        onLogout={() => { logout(); go("auth"); }}
        onRegister={() => go("register")}
        onAccounts={() => go("accounts")}
        onMapEditor={() => go("mapEditorModeSelect")}
        onPlayerMapEditor={() => go("playerMapEditorModeSelect")}
        onNews={() => go("news")}
        onMessages={() => go("messages")}
        onClubs={() => { setViewClubId(null); go("clubs"); }}
        onFriends={() => go("friends")}
        onBattleHistory={() => go("battleHistory")}
        onRecords={() => go("records")}
        onViewPlayerProfile={(id) => {
          setViewPlayerId(id);
          setProfileBackScreen("menu");
          go("playerProfile");
        }}
        onAdmin={() => go("admin")}
        onStarGuardianRewards={() => go("starGuardianRewards")}
        onSpectate={(playerId) => setSpectateTargetId(playerId)}
      />
    );
  }

  if (screen === "battleHistory") {
    return (
      <BattleHistoryPage
        onBack={() => go("menu")}
        onViewProfile={(id) => {
          setViewPlayerId(id);
          setProfileBackScreen("battleHistory");
          go("playerProfile");
        }}
      />
    );
  }

  if (screen === "records") {
    return (
      <RecordsPage
        onBack={() => go("menu")}
        onViewProfile={(id) => {
          setViewPlayerId(id);
          setProfileBackScreen("records");
          go("playerProfile");
        }}
        onViewClub={(clubId) => {
          setViewClubId(clubId);
          go("clubs");
        }}
      />
    );
  }

  if (screen === "friends") {
    return (
      <FriendsPage
        onBack={() => go("menu")}
        onViewProfile={(id) => {
          setViewPlayerId(id);
          setProfileBackScreen("friends");
          go("playerProfile");
        }}
        onGiftShop={() => go("customization")}
      />
    );
  }

  if (screen === "playerProfile" && viewPlayerId) {
    return (
      <PlayerProfilePage
        playerId={viewPlayerId}
        onBack={() => go(profileBackScreen)}
        onViewClub={(clubId) => {
          setViewClubId(clubId);
          go("clubs");
        }}
      />
    );
  }

  if (screen === "starGuardianRewards") {
    return <StarGuardianRewardsPage onBack={() => go("menu")} />;
  }

  if (screen === "playerMapEditorModeSelect") {
    return (
      <ModeSelect
        mapEditorPick={(gameMode) => {
          const editorMode = editorModeForGameMode(gameMode);
          if (!editorMode) return;
          setMapEditorMode(editorMode);
          go("playerMapEditor");
        }}
        onSelect={() => {}}
        selectedShowdownFormat={selectedShowdownFormat}
        selectedStarStrikeFormat={selectedStarStrikeFormat}
        onBack={() => go("menu")}
        playerMapEditorPick
      />
    );
  }

  if (screen === "playerMapEditor") {
    if (!mapEditorMode) return null;
    return (
      <MapEditorPage
        variant="player"
        initialMode={mapEditorMode}
        onBack={() => {
          setMapEditorMode(null);
          go("playerMapEditorModeSelect");
        }}
      />
    );
  }

  if (screen === "mapEditorModeSelect") {
    return (
      <ModeSelect
        mapEditorPick={(gameMode) => {
          const editorMode = editorModeForGameMode(gameMode);
          if (!editorMode) return;
          setMapEditorMode(editorMode);
          go("mapeditor");
        }}
        onSelect={() => {}}
        selectedShowdownFormat={selectedShowdownFormat}
        selectedStarStrikeFormat={selectedStarStrikeFormat}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "mapeditor") {
    if (!mapEditorMode) return null;
    return (
      <MapEditorPage
        initialMode={mapEditorMode}
        onBack={() => {
          setMapEditorMode(null);
          go("mapEditorModeSelect");
        }}
      />
    );
  }

  if (screen === "news") {
    return <NewsPage onBack={() => go("menu")} />;
  }

  if (screen === "messages") {
    return <MessagesPage onBack={() => go("menu")} />;
  }

  if (screen === "clubs") {
    return (
      <ClubsPage
        onBack={() => { setViewClubId(null); go("menu"); }}
        viewClubId={viewClubId}
        onGoToMainMenu={(bossId) => {
          setSelectedMode("bossraid");
          persistMode("bossraid");
          setLobbyBossRaidBossId(bossId);
          go("menu");
        }}
      />
    );
  }

  if (screen === "matchmaking" && matchmakingUi) {
    return (
      <MatchmakingScreen
        totalPlayers={matchmakingUi.totalPlayers}
        initialFound={matchmakingUi.initialFound}
        ranked={matchmakingUi.ranked}
        modeHint={matchmakingUi.modeHint}
        onComplete={() => matchmakingCompleteRef.current()}
        onCancel={cancelMatchmakingToMenu}
      />
    );
  }

  if (screen === "megaSquad") {
    return (
      <MegaSquadPickerPage
        onConfirm={(ids, levels) => {
          setMegaSquad({ ids, levels });
          startMatchmaking(() => goWithLoad("game", translate("loading.squad")));
        }}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "admin") {
    return (
      <AdminPanel
        onBack={() => go("menu")}
        onPreviewTechBreak={() => go("techBreakPreview")}
      />
    );
  }

  if (screen === "modeSelect") {
    return (
      <ModeSelect
        selectedMode={selectedMode}
        onSelect={(mode, showdownFormat, starStrikeFormat) => {
          setLobbyBossRaidBossId(null);
          setSelectedMode(mode);
          persistMode(mode);
          if (showdownFormat) {
            setSelectedShowdownFormat(showdownFormat);
            persistShowdownFormat(showdownFormat);
          }
          if (starStrikeFormat) {
            setSelectedStarStrikeFormat(starStrikeFormat);
            persistStarStrikeFormat(starStrikeFormat);
          }
          go("menu");
        }}
        selectedShowdownFormat={selectedShowdownFormat}
        selectedStarStrikeFormat={selectedStarStrikeFormat}
        onBack={() => go("menu")}
        onClashPass={() => go("clashpass")}
        onBossRaidLobbyPick={(bossId) => {
          setLobbyBossRaidBossId(bossId);
          setSelectedMode("bossraid");
          persistMode("bossraid");
          go("menu");
        }}
      />
    );
  }

  if (screen === "characterSelect") {
    return (
      <CharacterSelect
        onPickAsActive={(id) => {
          // persistBrawler is gated on unlocked status; if it fails, keep the
          // currently active brawler as the menu selection.
          const r = persistBrawler(id);
          if (r.success) {
            setSelectedBrawler(id);
            go("menu");
          }
        }}
        onOpenMastery={(id) => { setMasteryBrawlerId(id); go("mastery"); }}
        onOpenComic={(id) => { setComicBrawlerId(id); go("comic"); }}
        onOpenTrails={(id) => { setTrailBrawlerId(id); go("brawlerTrail"); }}
        onTraining={(id) => {
          // For training we use the brawler locally without persisting it as
          // the player's active pick — locked brawlers are testable but
          // cannot become the lobby selection. We also use a transient mode
          // override instead of touching the persisted lobby mode, so the
          // main-menu "Играть" button keeps launching the user's chosen mode.
          setSelectedBrawler(id);
          setForceMode("training");
          goWithLoad("game", translate("loading.training"));
        }}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "profile") {
    return (
      <ProfilePage
        onBack={() => go("menu")}
        onViewClub={(clubId) => {
          setViewClubId(clubId);
          go("clubs");
        }}
      />
    );
  }
  if (screen === "clashpass") {
    return <ClashPassPage onBack={() => go("menu")} />;
  }
  if (screen === "trophyroad") {
    return <TrophyRoadPage onBack={() => go("menu")} />;
  }

  if (screen === "rankedMenu") {
    return (
      <RankedMenuPage
        onBack={() => go("menu")}
        onProStarPass={() => go("proStarPass")}
        onGoToLobby={() => {
          setSelectedMode("ranked");
          persistMode("ranked");
          go("menu");
        }}
      />
    );
  }

  if (screen === "proStarPass") {
    return <ProStarPassPage onBack={() => go("rankedMenu")} />;
  }

  if (screen === "rankedMatch") {
    return (
      <RankedMatchFlowPage
        onBack={() => go("rankedMenu")}
        onStartBattle={(mode, brawlerId, _pet) => {
          setRankedBattleMode(mode);
          setSelectedBrawler(brawlerId);
          persistBrawler(brawlerId);
          goWithLoad("game", translate("loading.ranked"));
        }}
      />
    );
  }
  if (screen === "chests") {
    return <ChestsPage onBack={() => go("menu")} />;
  }
  if (screen === "pets") {
    return <PetsPage onBack={() => go("menu")} />;
  }

  if (screen === "game") {
    const activeMode: GameMode = bossRaidBattle
      ? "bossraid"
      : (rankedBattleMode ?? forceMode ?? selectedMode);
    return (
      <GameScreen
        mode={activeMode}
        showdownFormat={selectedShowdownFormat}
        starStrikeFormat={rankedBattleMode ? "3v3" : selectedStarStrikeFormat}
        brawlerId={selectedBrawler}
        megaSquad={activeMode === "megashowdown" ? megaSquad : null}
        bossRaid={bossRaidBattle}
        siege={siegeBattle}
        reattachFromBackground={reattachBackgroundBattle}
        onReattachStarted={() => setReattachBackgroundBattle(false)}
        onAfkKicked={() => {
          setMyPresence("menu");
          goWithLoad("menu", translate("loading.lobbyReturn"));
        }}
        onExit={() => {
          clearAllPlayAgainState();
          setForceMode(null);
          setRankedBattleMode(null);
          clearRankedBattleSession();
          clearPlayerMapBattleSession();
          clearMapSourceCategory();
          setMegaSquad(null);
          setBossRaidBattle(null);
          setSiegeBattle(null);
          goWithLoad("menu", translate("loading.lobbyReturn"));
        }}
        onResultPlayAgain={(won) => {
          const partyRematch = readPartyBattleRoster().length > 1;
          if (rankedBattleMode !== null && !partyRematch) {
            clearRankedBattleSession();
          clearPlayerMapBattleSession();
          clearMapSourceCategory();
            setRankedBattleMode(null);
            go("menu");
            return;
          }
          if (activeMode === "megashowdown" && !partyRematch) {
            setMegaSquad(null);
            go("megaSquad");
            return;
          }
          const launchRematch = () => {
            if (activeMode === "bossraid" && bossRaidBattle && !partyRematch) {
              if (won && bossRaidBattle.level < BOSS_RAID_MAX_LEVEL) {
                setBossRaidBattle({ ...bossRaidBattle, level: bossRaidBattle.level + 1 });
                goWithLoad("game", translate("loading.nextLevel"));
                return;
              }
              goWithLoad("game", translate("loading.restart"));
              return;
            }
            if (!partyRematch) stashPartyBattleRoster();
            goWithLoad("game", partyRematch ? translate("loading.rematch") : translate("loading.restart"));
          };
          startMatchmaking(launchRematch);
        }}
      />
    );
  }

  if (screen === "collection") {
    return <CollectionPage onBack={() => go("menu")} />;
  }

  if (screen === "shop") {
    return (
      <ShopPage
        onBack={() => go("menu")}
        onOpenStarGuardianRewards={() => go("starGuardianRewards")}
      />
    );
  }

  if (screen === "customization") {
    return (
      <CustomizationPage
        initialTab={customizationTab}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "settings") {
    return (
      <SettingsPage
        onBack={() => go("menu")}
        onSwitchProfile={() => go("accounts")}
        onOpenAccount={() => go("accountDetail")}
        onRegister={() => go("register")}
      />
    );
  }

  if (screen === "register") {
    return (
      <RegisterPage
        onBack={() => go("menu")}
        onDone={() => { hydrateFromProfile(); go("menu"); }}
      />
    );
  }

  if (screen === "accounts") {
    return (
      <AccountsPage
        onBack={() => go("menu")}
        onOpenAccount={() => go("accountDetail")}
        onRegister={() => go("register")}
        onAuth={() => { logout(); go("auth"); }}
      />
    );
  }

  if (screen === "accountDetail") {
    return (
      <AccountDetailPage
        onBack={() => go("accounts")}
        onDeleted={() => {
          if (getCurrentUsername()) go("menu");
          else go("auth");
        }}
        onLogout={() => { logout(); go("auth"); }}
        onOpenAppSettings={() => go("settings")}
        onSwitchAccounts={() => go("accounts")}
        onRegister={() => go("register")}
      />
    );
  }

  if (screen === "battleFeed") {
    return (
      <BattleFeedPage
        onBack={() => go("menu")}
        onViewProfile={(id) => {
          setViewPlayerId(id);
          setProfileBackScreen("battleFeed");
          go("playerProfile");
        }}
      />
    );
  }

  if (screen === "mastery") {
    return (
      <BrawlerMasteryPage
        brawlerId={masteryBrawlerId}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "comic") {
    return (
      <BrawlerComicPage
        brawlerId={comicBrawlerId}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "brawlerTrail") {
    return (
      <BrawlerTrailPage
        brawlerId={trailBrawlerId}
        onBack={() => go("menu")}
        onOpenShop={() => {
          setCustomizationTab("trails");
          go("customization");
        }}
      />
    );
  }

  if (screen === "starFeats") {
    return <StarFeatsPage onBack={() => go("menu")} />;
  }

  return null;
  }
}
