import { useState, useEffect } from "react";
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
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import ClashPassPage from "./pages/ClashPassPage";
import TrophyRoadPage from "./pages/TrophyRoadPage";
import ChestsPage from "./pages/ChestsPage";
import PetsPage from "./pages/PetsPage";
import LoadingScreen from "./pages/LoadingScreen";
import MapEditorPage from "./pages/MapEditorPage";
import NewsPage from "./pages/NewsPage";
import AdminPanel from "./pages/AdminPanel";
import ClubsPage from "./pages/ClubsPage";
import MegaSquadPickerPage from "./pages/MegaSquadPickerPage";
import StarGuardianRewardsPage from "./pages/StarGuardianRewardsPage";
// Side-effect import: installs the battle-finished listener so the club battle
// counter starts ticking the moment the app boots, even before the player ever
// opens the Clubs page.
import "./utils/clubs";
import RotateDeviceOverlay from "./components/RotateDeviceOverlay";
import { preloadCharRenderers } from "./game/miyaTopDownRenderer";
import { preloadAllModels } from "./utils/modelPreloader";
import { loadPlatformTile } from "./utils/platformTile";
import { getBossRaidCurrentLevel } from "./utils/bossRaidProgress";

type Screen =
  | "auth"
  | "menu"
  | "modeSelect"
  | "characterSelect"
  | "game"
  | "collection"
  | "shop"
  | "settings"
  | "profile"
  | "clashpass"
  | "trophyroad"
  | "chests"
  | "pets"
  | "mapeditor"
  | "news"
  | "admin"
  | "clubs"
  | "megaSquad"
  | "starGuardianRewards";

export type GameMode = "showdown" | "crystals" | "siege" | "heist" | "gemgrab" | "training" | "megashowdown" | "starstrike" | "bossraid";
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
  const [transitionTo, setTransitionTo] = useState<Screen | null>(null);
  const [transitionLabel, setTransitionLabel] = useState("ЗАГРУЗКА");
  // Transient one-shot mode override (used by "Испытать" → training).
  // Cleared automatically as soon as the player exits the game so the
  // persisted lobby mode is restored on the next "Играть".
  const [forceMode, setForceMode] = useState<GameMode | null>(null);
  // Mega Star Battle squad picked on the squad-picker page; consumed by GameScreen.
  const [megaSquad, setMegaSquad] = useState<{ ids: string[]; levels: number[] } | null>(null);
  /** Active boss raid battle target (boss id + difficulty). When set, `GameScreen` runs in `bossraid` mode. */
  /** Босс, выбранный в ленте режимов; «Играть» в лобби запускает bossraid с этим id */
  const [lobbyBossRaidBossId, setLobbyBossRaidBossId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Starfall";
    // Kick off parallel preloading of all GLB models immediately on boot.
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    preloadAllModels(base, (p) => setBootProgress(p)).catch(() => setBootProgress(1));
    loadPlatformTile().catch(() => {});
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

  // Animated transition with a loading screen
  const goWithLoad = (s: Screen, label = "ЗАГРУЗКА") => {
    // When heading into battle, start downloading all 3D models immediately so
    // they finish during the 4.5 s loading screen — not during gameplay.
    if (s === "game") {
      const base = (import.meta as any).env?.BASE_URL ?? "/";
      preloadCharRenderers(base); // fire-and-forget; GameScreen awaits completion
    }
    setTransitionLabel(label);
    setTransitionTo(s);
  };

  const content = renderContent();
  const isGame = screen === "game";
  return (
    <>
      {isGame ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}>
          {content}
        </div>
      ) : (
        <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>
          <div style={{
            width: "calc(100% / 1.3)",
            height: "calc(100% / 1.3)",
            transform: "scale(1.3)",
            transformOrigin: "top left",
            overflowX: "hidden",
            overflowY: "auto",
          }}>
            {content}
          </div>
        </div>
      )}
      <RotateDeviceOverlay />
    </>
  );

  function renderContent() {
  if (bootLoading) {
    return (
      <LoadingScreen
        onDone={() => setBootLoading(false)}
        duration={1500}
        label="ДОБРО ПОЖАЛОВАТЬ"
        progress={bootProgress}
      />
    );
  }

  if (transitionTo) {
    return (
      <LoadingScreen
        label={transitionLabel}
        duration={4500}
        onDone={() => {
          const target = transitionTo;
          setTransitionTo(null);
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
          if (lobbyBossRaidBossId) {
            hydrateFromProfile();
            const p = getCurrentProfile();
            const lv = p ? getBossRaidCurrentLevel(p, lobbyBossRaidBossId) : 1;
            setBossRaidBattle({ bossId: lobbyBossRaidBossId, level: lv });
            goWithLoad("game", "БОЙ С БОССОМ");
            return;
          }
          // Always read latest selections from the active profile before entering battle.
          const { mode } = hydrateFromProfile();
          // Mega Star Battle requires the player to assemble a 3-brawler squad first.
          if (mode === "megashowdown") {
            go("megaSquad");
            return;
          }
          goWithLoad("game", "ВХОД В АРЕНУ");
        }}
        onCollection={() => go("collection")}
        onShop={() => go("shop")}
        onSettings={() => go("settings")}
        onProfile={() => go("profile")}
        onClashPass={() => go("clashpass")}
        onTrophyRoad={() => go("trophyroad")}
        onChests={() => go("chests")}
        onPets={() => go("pets")}
        onModeSelect={() => go("modeSelect")}
        onBrawlerSelect={() => go("characterSelect")}
        onLogout={() => { logout(); go("auth"); }}
        onMapEditor={() => go("mapeditor")}
        onNews={() => go("news")}
        onClubs={() => go("clubs")}
        onAdmin={() => go("admin")}
        onStarGuardianRewards={() => go("starGuardianRewards")}
      />
    );
  }

  if (screen === "starGuardianRewards") {
    return <StarGuardianRewardsPage onBack={() => go("menu")} />;
  }

  if (screen === "mapeditor") {
    return <MapEditorPage onBack={() => go("menu")} />;
  }

  if (screen === "news") {
    return <NewsPage onBack={() => go("menu")} />;
  }

  if (screen === "clubs") {
    return <ClubsPage onBack={() => go("menu")} />;
  }

  if (screen === "megaSquad") {
    return (
      <MegaSquadPickerPage
        onConfirm={(ids, levels) => {
          setMegaSquad({ ids, levels });
          goWithLoad("game", "СБОР ОТРЯДА");
        }}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "admin") {
    return <AdminPanel onBack={() => go("menu")} />;
  }

  if (screen === "modeSelect") {
    return (
      <ModeSelect
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
        onTraining={(id) => {
          // For training we use the brawler locally without persisting it as
          // the player's active pick — locked brawlers are testable but
          // cannot become the lobby selection. We also use a transient mode
          // override instead of touching the persisted lobby mode, so the
          // main-menu "Играть" button keeps launching the user's chosen mode.
          setSelectedBrawler(id);
          setForceMode("training");
          goWithLoad("game", "ВХОД В ТРЕНИРОВКУ");
        }}
        onBack={() => go("menu")}
      />
    );
  }

  if (screen === "profile") {
    return <ProfilePage onBack={() => go("menu")} />;
  }
  if (screen === "clashpass") {
    return <ClashPassPage onBack={() => go("menu")} />;
  }
  if (screen === "trophyroad") {
    return <TrophyRoadPage onBack={() => go("menu")} />;
  }
  if (screen === "chests") {
    return <ChestsPage onBack={() => go("menu")} />;
  }
  if (screen === "pets") {
    return <PetsPage onBack={() => go("menu")} />;
  }

  if (screen === "game") {
    const activeMode: GameMode = bossRaidBattle ? "bossraid" : (forceMode ?? selectedMode);
    return (
      <GameScreen
        mode={activeMode}
        showdownFormat={selectedShowdownFormat}
        starStrikeFormat={selectedStarStrikeFormat}
        brawlerId={selectedBrawler}
        megaSquad={activeMode === "megashowdown" ? megaSquad : null}
        bossRaid={bossRaidBattle}
        onExit={() => {
          setForceMode(null);
          setMegaSquad(null);
          setBossRaidBattle(null);
          goWithLoad("menu", "ВОЗВРАТ В ЛОББИ");
        }}
        onPlayAgain={() => {
          // For mega mode, replay must re-pick a squad; route back to picker.
          if (activeMode === "megashowdown") {
            setMegaSquad(null);
            go("megaSquad");
            return;
          }
          if (activeMode === "bossraid" && bossRaidBattle) {
            goWithLoad("game", "ПЕРЕЗАПУСК...");
            return;
          }
          goWithLoad("game", "ПЕРЕЗАПУСК...");
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

  if (screen === "settings") {
    return (
      <SettingsPage
        onBack={() => go("menu")}
        onSwitchProfile={() => { logout(); go("auth"); }}
      />
    );
  }

  return null;
  }
}
