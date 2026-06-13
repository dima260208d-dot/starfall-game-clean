import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ClashShowdown } from "../modes/ClashShowdown";
import { ClashCrystals } from "../modes/ClashCrystals";
import { ClashHeist } from "../modes/ClashHeist";
import { ClashGemGrab } from "../modes/ClashGemGrab";
import { ClashSiege } from "../modes/ClashSiege";
import { ClashTraining } from "../modes/ClashTraining";
import { ClashMega } from "../modes/ClashMega";
import { ClashStarStrike } from "../modes/ClashStarStrike";
import { ClashBossRaid } from "../modes/ClashBossRaid";
import { ClashBounty } from "../modes/ClashBounty";
import { ClashMonsterHide } from "../modes/ClashMonsterHide";
import { ClashMonsterInvasion } from "../modes/ClashMonsterInvasion";
import { ClashTeamHunt } from "../modes/ClashTeamHunt";
import { getCurrentProfile, getControlMode, getQuestPool, getBrawlerStars, getBattleHistory } from "../utils/localStorageAPI";
import { getPlayerTreasuryBattleBonuses } from "../utils/clubTreasury";
import { BattleStageShell, useEffectiveControlScheme, usePlatformLayout } from "../platform";
import { setMyPresence, setMyBattlePresence, clearMyBattlePresence } from "../utils/social/presence";
import { getMatchStats, normalizeMatchStats } from "../utils/matchStats";
import { loadSpriteSheet, loadBrawlerImages } from "../game/sprites";
import { isBattleAssetsReady } from "../utils/battleAssetPreloader";
import { loadPowerModels, loadSafeGLBTemplate } from "../utils/powerModelCache";
import { preloadCharRenderers } from "../game/miyaTopDownRenderer";
import { setGameRenderDt } from "../game/frameClock";
import { BRAWLERS, getBrawlerById } from "../entities/BrawlerData";
import { getPetById } from "../entities/PetData";
import MobileControls from "../components/MobileControls";
import { cycleOliverMemory } from "../utils/oliverMechanics";
import MiniMap from "../components/MiniMap";
import MegaSquadHud from "../components/MegaSquadHud";
import BattlePinHud from "../components/BattlePinHud";
import ResultScreen from "../components/ResultScreen";
import AstralBattleTip from "../components/AstralBattleTip";
import KillFeedHud from "../components/KillFeedHud";
import BattleIntroOverlay from "../components/battleIntro/BattleIntroOverlay";
import { enrichIntroParticipants, type BattleIntroParticipant } from "../utils/battleIntro/battleIntroParticipants";
import { buildIntroCameraPath } from "../utils/battleIntro/battleIntroCamera";
import { preloadIntroBrawlerModels } from "../utils/battleIntro/battleIntroPreload";
import { resetKillFeedBus, setKillFeedPlayerTeam } from "../utils/killFeed";
import { AstralAutoplay, buildBattleSnapshot } from "../ai/AstralAutoplay";
import { recordHumanMatchEnd } from "../ai/aiCombatLearning";
import {
  beginPlayerObservation,
  endPlayerObservation,
  observePlayerBattleFrame,
  trackPlayerStuck,
} from "../ai/aiPlayerObserver";
import { gasSafeRadius, playerGasEdgeMargin } from "../ai/aiGas";
import { isStarGuardianActive, getAstralSettings } from "../utils/subscription";
import type { GameParticipant } from "../types/gameResult";
import type { GameMode, ShowdownFormat, StarStrikeFormat } from "../App";
import { applyPartySharedBossRaidVictory, type GrantBossRaidRewardResult } from "../utils/bossRaidRewards";
import { applyPartySharedSiegeVictory } from "../utils/siegeProgress";
import { BOSS_RAID_MAX_LEVEL } from "../utils/bossRaidProgress";
import { isAdminUnlocked } from "../utils/mapEditorAPI";
import { useI18n } from "../i18n";
import { applyForcedDevBattleExit } from "../utils/forcedBattleExit";
import { resetDevBattlePause, toggleDevBattlePauseFromCaps, isDevBattleWorldFrozen } from "../game/battleDevPause";
import {
  setBattle3DCanvas,
  beginBattle3DSession,
  initBattle3DForBattle,
  enableBattle3D,
  disposeBattle3D,
  tickAndRenderBattle3D,
  resolveBattleTileGrid,
} from "../game/battle3DWorld";
import type { Battle3DSafe } from "../game/battle3DSafes";
import type { Brawler } from "../entities/Brawler";
import {
  amIPlayAgainReady,
  clearBattlePlayAgainState,
  clearAllPlayAgainState,
  getBattleTeamPlayAgainPanelMembers,
  getPlayAgainSecondsLeft,
  getPlayAgainState,
  isBattleTeamPlayAgainEligible,
  isPlayAgainActive,
  playAgainOnResultExit,
  pressBattlePlayAgain,
  shouldExitAfterBattlePlayAgain,
  shouldRematchBattlePlayAgain,
  stashBattlePlayAgainRematchRoster,
  stashBattleTeamRosterFromParticipants,
  tickBattlePlayAgainExpired,
} from "../utils/social/battleTeamPlayAgain";
import { PARTY_CHANGED_EVENT } from "../utils/social/party";
import { clearPartyBattleRoster, stashPartyBattleRoster } from "../utils/social/partyBattle";
import {
  startBattleReplayRecording,
  tickBattleReplayRecording,
  finishBattleReplayRecording,
  finishLiveBattleRecording,
  cancelBattleReplayRecording,
  getCurrentLiveBattleSessionId,
} from "../utils/battleReplayRecorder";
import { enrichLatestBattleRecord, extractBattleScore, buildBattleHistoryParticipants } from "../utils/battleHistoryEnrich";
import { getMyClub, shareBattleToClub } from "../utils/clubs";
import { editorModeForGameMode, getActiveMap } from "../utils/mapSchedule";

interface GameScreenProps {
  mode: GameMode;
  showdownFormat?: ShowdownFormat;
  starStrikeFormat?: StarStrikeFormat;
  brawlerId: string;
  megaSquad?: { ids: string[]; levels: number[] } | null;
  bossRaid?: { bossId: string; level: number } | null;
  siege?: { level: number } | null;
  onExit: () => void;
  onResultPlayAgain: (won: boolean) => void;
}

type AnyGame = ClashShowdown | ClashCrystals | ClashHeist | ClashGemGrab | ClashSiege | ClashTraining | ClashMega | ClashStarStrike | ClashBossRaid | ClashBounty | ClashMonsterHide | ClashMonsterInvasion | ClashTeamHunt;
type QuestDelta = { description: string; before: number; after: number; target: number; delta: number };

/** Собрать всех бойцов, которых нужно отрендерить в 3D-сцене боя. */
function collectBattleBrawlers(game: AnyGame): Brawler[] {
  const out: Brawler[] = [];
  const seen = new Set<string>();
  const g: any = game;

  const add = (b: unknown) => {
    if (!b || typeof b !== "object") return;
    const br = b as Brawler;
    if (!br.id || seen.has(br.id)) return;
    seen.add(br.id);
    out.push(br);
  };

  add(g.player);
  if (Array.isArray(g.allies)) for (const b of g.allies) add(b);
  if (Array.isArray(g.enemies)) for (const b of g.enemies) add(b);
  if (Array.isArray(g.bots)) for (const b of g.bots) add(b);
  add(g.boss);

  return out;
}

export default function GameScreen({ mode, showdownFormat = "solo", starStrikeFormat = "3v3", brawlerId, megaSquad, bossRaid = null, siege = null, onExit, onResultPlayAgain }: GameScreenProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas3DRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<AnyGame | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const spriteLoadedRef = useRef(false);
  const [result, setResult] = useState<{
    place: number;
    trophyDelta: number;
    xpGained: number;
    winStreak?: number;
    winStreakBonus?: number;
    masteryXpGained?: number;
    masteryLeaderBonus?: number;
    monsterKillTrophyBonus?: number;
  } | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [matchStatsData, setMatchStatsData] = useState(normalizeMatchStats());
  const [questDeltas, setQuestDeltas] = useState<QuestDelta[]>([]);
  const { tier, width, shortSide } = usePlatformLayout();
  const mobileControlScheme = useEffectiveControlScheme();
  const [profileControlMode] = useState(() => getControlMode());
  const isDesktopBattle = tier === "desktop" || (width >= 1024 && shortSide > 520);
  const controlMode = isDesktopBattle ? profileControlMode : mobileControlScheme;
  const autoplayRef = useRef<AstralAutoplay | null>(null);
  const [autoplayOn, setAutoplayOn] = useState(false);
  const autoplayOnRef = useRef(false);
  const battleStartRef = useRef<number>(0);
  const playerStuckRef = useRef({ x: 0, y: 0, stillSec: 0, wasStuckHeavy: false });
  const gameOverAtRef = useRef<number | null>(null);
  const gameOverHandledRef = useRef(false);
  const gameOverStateRef = useRef(false);
  const partyRematchResolvedRef = useRef(false);
  const [partyPlayAgainTick, setPartyPlayAgainTick] = useState(0);
  const [bossRaidGrant, setBossRaidGrant] = useState<GrantBossRaidRewardResult | null>(null);
  const [replayId, setReplayId] = useState<string | null>(null);
  const [battleShared, setBattleShared] = useState(false);
  const [introActive, setIntroActive] = useState(true);
  const introActiveRef = useRef(true);
  const introCamRef = useRef<{ x: number; y: number } | null>(null);
  const introDtZeroedRef = useRef(false);
  const [introParticipants, setIntroParticipants] = useState<BattleIntroParticipant[]>([]);
  const [introMeta, setIntroMeta] = useState<{
    playerX: number;
    playerY: number;
    camW: number;
    camH: number;
    mapW: number;
    mapH: number;
    playerTeam: string;
  } | null>(null);
  const astralAvailable = isStarGuardianActive() && getAstralSettings().enabled && mode !== "training" && mode !== "bossraid";
  const brawlerStats = BRAWLERS.find(b => b.id === brawlerId) || BRAWLERS[0];

  // Snapshot quests before each battle starts so result deltas are reliable.
  const preQuestSnapshot = useRef<Array<{ id: string; progress: number }>>([]);

  const computeQuestDeltas = (): QuestDelta[] => {
    const pool = getQuestPool();
    if (!pool) return [];
    const snapMap = new Map(preQuestSnapshot.current.map(q => [q.id, q.progress]));
    return pool.activeQuests
      .filter(q => !q.claimed)
      .map(q => {
        const before = snapMap.get(q.id);
        if (before === undefined) return null;
        const delta = q.progress - before;
        if (delta <= 0) return null;
        return {
          description: q.description,
          before,
          after: q.progress,
          target: q.target,
          delta,
        };
      })
      .filter((x): x is QuestDelta => x !== null)
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);
  };

  useEffect(() => {
    if (gameOver && participants.length > 0) {
      stashBattleTeamRosterFromParticipants(participants);
      setPartyPlayAgainTick(t => t + 1);
    }
  }, [gameOver, participants]);

  useEffect(() => {
    partyRematchResolvedRef.current = false;
    stashPartyBattleRoster();
  }, [mode, brawlerId, showdownFormat, starStrikeFormat, bossRaid?.bossId, bossRaid?.level]);

  useEffect(() => {
    let mounted = true;
    if (isBattleAssetsReady()) {
      setSpriteLoaded(true);
      return () => { mounted = false; };
    }
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    Promise.all([
      loadSpriteSheet(`${base}characters.webp`),
      loadBrawlerImages(BRAWLERS.map(b => b.id), base),
      preloadCharRenderers(base),
    ]).then(() => {
      if (mounted) setSpriteLoaded(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    spriteLoadedRef.current = spriteLoaded;
    const g = gameRef.current as { spriteLoaded?: boolean } | null;
    if (g) g.spriteLoaded = spriteLoaded;
  }, [spriteLoaded]);

  useEffect(() => {
    autoplayOnRef.current = autoplayOn;
  }, [autoplayOn]);

  useEffect(() => {
    gameOverStateRef.current = gameOver;
  }, [gameOver]);

  useEffect(() => {
    const sessionId = getCurrentLiveBattleSessionId();
    if (sessionId) setMyBattlePresence(mode, sessionId);
    else setMyPresence("battle");
    return () => clearMyBattlePresence();
  }, [mode]);

  useEffect(() => {
    if (gameOver && result) setMyPresence("results");
  }, [gameOver, result]);

  useEffect(() => {
    if (!gameOver) {
      setReplayId(null);
      setBattleShared(false);
      return;
    }
    const syncReplay = () => {
      const id = getBattleHistory()[0]?.replayId;
      if (id) setReplayId(prev => prev ?? id);
    };
    syncReplay();
    const timer = window.setInterval(syncReplay, 250);
    return () => window.clearInterval(timer);
  }, [gameOver]);

  const handleShareBattle = (): { success: boolean; error?: string } => {
    const id = replayId ?? getBattleHistory()[0]?.replayId ?? null;
    if (!id) return { success: false, error: "Запись боя ещё сохраняется" };
    const game = gameRef.current;
    const score = game ? extractBattleScore(game) : null;
    const myTeam = (game as { player?: { team?: string } })?.player?.team;
    const teams = buildBattleHistoryParticipants(participants, myTeam);
    const res = shareBattleToClub({
      replayId: id,
      mode,
      won,
      place: result?.place ?? 1,
      totalPlayers: Math.max(1, participants.length),
      trophyDelta: result?.trophyDelta ?? 0,
      scoreBlue: score?.blue,
      scoreRed: score?.red,
      durationSec: (performance.now() - battleStartRef.current) / 1000,
      teams,
    });
    if (res.success) setBattleShared(true);
    return res;
  };

  const finalizeBattleNow = (forcedWon?: boolean) => {
    const currentGame = gameRef.current;
    if (!currentGame || gameOverStateRef.current) return;
    gameOverHandledRef.current = true;
    cancelAnimationFrame(rafRef.current);
    const ms = getMatchStats();
    const questDeltaNow = mode === "bossraid" ? [] : computeQuestDeltas();
    const wonNow = forcedWon ?? currentGame.won;
    let raidGrant: GrantBossRaidRewardResult | null = null;
    if (wonNow && mode === "bossraid" && bossRaid) {
      raidGrant = applyPartySharedBossRaidVictory(bossRaid.bossId, bossRaid.level);
    } else if (wonNow && mode === "siege" && siege) {
      applyPartySharedSiegeVictory(siege.level);
    } else if (mode === "bossraid") {
      raidGrant = null;
    }
    setGameOver(true);
    setWon(wonNow);
    setQuestDeltas(questDeltaNow);
    setBossRaidGrant(raidGrant);
    setMatchStatsData({
      damageDealt: ms.damageDealt ?? 0,
      healingDone: ms.healingDone ?? 0,
      superUses: ms.superUses ?? 0,
      killCount: ms.killCount ?? 0,
      powerCubesCollected: ms.powerCubesCollected ?? 0,
    });
    const p = getCurrentProfile();
    if (p?.lastResult) {
      setResult({
        place: p.lastResult.place,
        trophyDelta: p.lastResult.trophyDelta,
        xpGained: p.lastResult.xpGained,
        winStreak: p.lastResult.winStreak,
        winStreakBonus: p.lastResult.winStreakBonus,
        masteryXpGained: p.lastResult.masteryXpGained,
        masteryLeaderBonus: p.lastResult.masteryLeaderBonus,
        monsterKillTrophyBonus: p.lastResult.monsterKillTrophyBonus,
        rankedCupDelta: p.lastResult.rankedCupDelta,
        rankedBattle: p.lastResult.rankedBattle,
      });
    } else {
      setResult({ place: wonNow ? 1 : 2, trophyDelta: 0, xpGained: 0 });
    }
    if (mode !== "training") {
      const pl = (currentGame as any).player;
      const gas = (currentGame as any).gas;
      let lastGasMargin: number | null = null;
      if (pl && gas && gasSafeRadius(gas) > 0) {
        lastGasMargin = playerGasEdgeMargin(pl.x, pl.y, gas);
      }
      const durationSec = Math.max(1, Math.floor(((currentGame as any).matchTime ?? 0) || 0));
      recordHumanMatchEnd({
        mode,
        won: wonNow,
        brawlerId,
        durationSec,
        lastGasMargin,
        hpAtEnd: pl?.hp ?? 0,
        wasStuckHeavy: playerStuckRef.current.wasStuckHeavy,
      });
    }
    if (typeof (currentGame as any).getParticipants === "function") {
      setParticipants((currentGame as any).getParticipants());
    } else {
      const prof = getCurrentProfile();
      setParticipants([{
        brawlerId,
        displayName: prof?.username || t("common.player"),
        team: "blue",
        isPlayer: true,
        level: (prof?.brawlerLevels?.[brawlerId] || 1),
        trophies: prof?.trophies ?? 0,
      }]);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Delete") return;
      if (!isAdminUnlocked()) return;
      if (gameOverStateRef.current) return;
      const g = gameRef.current;
      if (!g) return;
      e.preventDefault();
      const outcome = applyForcedDevBattleExit(g, {
        mode,
        brawlerId,
        showdownFormat: mode === "showdown" ? showdownFormat : undefined,
        starStrikeFormat: mode === "starstrike" ? starStrikeFormat : undefined,
      });
      finalizeBattleNow(outcome?.won ?? false);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, []);

  /** Режим разработчика: Caps Lock — пауза мира (боты, таймеры, снаряды); игрок ходит и бьёт. */
  useEffect(() => {
    const onCaps = (e: KeyboardEvent) => {
      if (!isAdminUnlocked()) return;
      if (e.code !== "CapsLock" || e.repeat) return;
      e.preventDefault();
      toggleDevBattlePauseFromCaps();
    };
    window.addEventListener("keydown", onCaps, { capture: true });
    return () => window.removeEventListener("keydown", onCaps, { capture: true } as any);
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;

    setBossRaidGrant(null);
    const canvas = canvasRef.current;

    const poolBeforeBattle = getQuestPool();
    preQuestSnapshot.current = poolBeforeBattle
      ? poolBeforeBattle.activeQuests
          .filter(q => !q.claimed)
          .map(q => ({ id: q.id, progress: q.progress }))
      : [];
    const profile = getCurrentProfile();
    const level = profile?.brawlerLevels[brawlerId] || 1;
    const spritesReady = spriteLoadedRef.current;

    let game: AnyGame;
    const handleAttack = () => gameRef.current?.handleAttack();
    const handleSuper = () => gameRef.current?.handleSuper();

    if (mode === "showdown") {
      game = new ClashShowdown(canvas, brawlerId, level, showdownFormat, handleAttack, handleSuper, spritesReady);
    } else if (mode === "crystals") {
      game = new ClashCrystals(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "heist") {
      game = new ClashHeist(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "gemgrab") {
      game = new ClashGemGrab(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "starstrike") {
      game = new ClashStarStrike(canvas, brawlerId, level, starStrikeFormat, handleAttack, handleSuper, spritesReady);
    } else if (mode === "training") {
      game = new ClashTraining(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "bossraid") {
      const br = bossRaid ?? { bossId: "miya", level: 1 };
      game = new ClashBossRaid(canvas, brawlerId, level, br.bossId, br.level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "bounty") {
      game = new ClashBounty(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "monsterhide") {
      game = new ClashMonsterHide(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "monsterInvasion") {
      game = new ClashMonsterInvasion(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "teamHunt") {
      game = new ClashTeamHunt(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady);
    } else if (mode === "megashowdown") {
      // Fall back to active brawler ×3 if the picker did not provide a squad
      // (e.g. direct route into the screen). Levels default to 1.
      const ids = (megaSquad?.ids && megaSquad.ids.length === 3)
        ? megaSquad.ids
        : [brawlerId, brawlerId, brawlerId];
      const levels = (megaSquad?.levels && megaSquad.levels.length === 3)
        ? megaSquad.levels
        : [level, level, level];
      game = new ClashMega(canvas, ids, levels, handleAttack, handleSuper, spritesReady);
    } else {
      const sl = siege?.level ?? 1;
      game = new ClashSiege(canvas, brawlerId, level, handleAttack, handleSuper, spritesReady, sl);
    }

    gameRef.current = game;

    resetKillFeedBus();
    setKillFeedPlayerTeam((game as { player?: { team?: string } }).player?.team ?? "blue");

    const playerTeam = (game as { player?: { team?: string } }).player?.team ?? "blue";
    const rawParts =
      typeof (game as { getParticipants?: () => GameParticipant[] }).getParticipants === "function"
        ? (game as { getParticipants: () => GameParticipant[] }).getParticipants()
        : [{
            brawlerId,
            displayName: getCurrentProfile()?.username || t("common.player"),
            team: playerTeam,
            isPlayer: true,
            level,
            trophies: getCurrentProfile()?.trophies ?? 0,
          }];
    setIntroParticipants(enrichIntroParticipants(rawParts, playerTeam));
    preloadIntroBrawlerModels(rawParts.map(p => p.brawlerId));

    const editorMode = editorModeForGameMode(mode);
    const activeMap = editorMode ? getActiveMap(editorMode) : null;
    const anyGame: any = game;
    const tileGrid = resolveBattleTileGrid(anyGame);
    const mapW = anyGame.map?.width ?? 3000;
    const mapH = anyGame.map?.height ?? 3000;
    const camView = anyGame.camera ? { w: anyGame.camera.width, h: anyGame.camera.height } : { w: 857, h: 571 };
    const playerX = anyGame.player?.x ?? mapW / 2;
    const playerY = anyGame.player?.y ?? mapH / 2;
    setIntroMeta({
      playerX,
      playerY,
      camW: camView.w,
      camH: camView.h,
      mapW,
      mapH,
      playerTeam,
    });
    const camPath = buildIntroCameraPath(playerX, playerY, camView.w, camView.h, mapW, mapH);
    introActiveRef.current = true;
    introCamRef.current = { x: camPath.startX, y: camPath.startY };
    introDtZeroedRef.current = false;
    setIntroActive(true);

    startBattleReplayRecording({
      mode,
      playerBrawlerId: brawlerId,
      mapId: activeMap?.id,
      myTeam: (game as { player?: { team?: string } }).player?.team,
      tileGrid,
      mapWidth: mapW,
      mapHeight: mapH,
      camViewW: camView.w,
      camViewH: camView.h,
      gameZoom: 1.4,
    });

    // ── 3D-сцена боя (единственный world-pass; 2D-канвас = HUD/снаряды/FX) ──
    beginBattle3DSession();
    void loadPowerModels();
    void loadSafeGLBTemplate();
    let boot3dCancelled = false;
    let boot3dRaf = 0;
    const bootBattle3D = () => {
      if (boot3dCancelled) return;
      const canvas3D = canvas3DRef.current;
      if (!canvas3D) {
        boot3dRaf = requestAnimationFrame(bootBattle3D);
        return;
      }
      setBattle3DCanvas(canvas3D);
      void initBattle3DForBattle({
        tileGrid,
        mapWidth: mapW,
        mapHeight: mapH,
        camViewW: camView.w,
        camViewH: camView.h,
        canvasCssW: 1200,
        canvasCssH: 800,
      }).catch((err) => {
        console.error("[battle3D] init failed:", err);
      });
    };
    bootBattle3D();

    const gameLike = game as unknown as { input: any; player: any; bots: any[]; drops: any[]; map: any; gas?: any };
    autoplayRef.current = new AstralAutoplay(gameLike, mode);
    autoplayRef.current.setSnapshotProvider(() => {
      const g = gameRef.current;
      if (!g?.player) return null;
      const dur = (performance.now() - battleStartRef.current) / 1000;
      return buildBattleSnapshot(
        g as typeof gameLike,
        mode,
        dur,
        getPetById(getCurrentProfile()?.equippedPetId ?? null)?.effectLabel ?? null,
      );
    });
    // Apply constellation bonuses once at battle start.
    try {
      const p = getCurrentProfile();
      const gp: any = (game as any).player;
      const starBrawlerId = gp?.stats?.id ?? brawlerId;
      const stars = getBrawlerStars(p, starBrawlerId);
      if (gp && gp.stats) {
        // Never mutate shared brawler stat templates (BRAWLERS entries),
        // otherwise bonuses stack between matches and break base speed/damage.
        gp.stats = { ...gp.stats };
        const baseStats = getBrawlerById(gp.stats.id);
        if (baseStats) {
          // Hard reset per-match runtime stats to canonical values from BRAWLERS.
          gp.stats.speed = baseStats.speed;
          if (typeof gp.speed === "number") gp.speed = baseStats.speed;
        }
        gp.constellationStars = stars;
        if (stars.includes(1)) { // survivability
          const hpBoost = Math.round((gp.maxHp || gp.hp || gp.stats.hp || 0) * 0.08);
          if (hpBoost > 0) {
            gp.maxHp = (gp.maxHp || gp.hp) + hpBoost;
            gp.hp = (gp.hp || 0) + hpBoost;
          }
        }
        if (stars.includes(2)) {
          if (typeof gp.stats.attackRange === "number") gp.stats.attackRange *= 1.12;
          if (typeof gp.stats.projectileSpeed === "number") gp.stats.projectileSpeed *= 1.1;
        }
        if (stars.includes(3) && typeof gp.stats.attackDamage === "number") gp.stats.attackDamage += 120;
        if (stars.includes(4) && typeof gp.stats.speed === "number" && gp.stats.id !== "zafkiel") {
          gp.stats.speed *= 1.08;
          if (typeof gp.speed === "number") gp.speed *= 1.08;
        }
        if (stars.includes(5) && typeof gp.stats.regenRate === "number") gp.stats.regenRate += 6;
        if (stars.includes(6) && typeof gp.stats.superChargePerHit === "number") gp.stats.superChargePerHit *= 1.1;
      }
      const clubBonuses = getPlayerTreasuryBattleBonuses(p, getMyClub());
      if (gp && gp.stats) {
        if (clubBonuses.damagePct > 0 && typeof gp.stats.attackDamage === "number") {
          gp.stats.attackDamage = Math.round(gp.stats.attackDamage * (1 + clubBonuses.damagePct / 100));
        }
        if (clubBonuses.speedPct > 0 && typeof gp.stats.speed === "number" && gp.stats.id !== "zafkiel") {
          const speedMult = 1 + clubBonuses.speedPct / 100;
          gp.stats.speed *= speedMult;
          if (typeof gp.speed === "number") gp.speed *= speedMult;
        }
        if (clubBonuses.hpPct > 0) {
          const hpBase = gp.maxHp || gp.hp || gp.stats.hp || 0;
          const hpBoost = Math.round(hpBase * (clubBonuses.hpPct / 100));
          if (hpBoost > 0) {
            gp.maxHp = (gp.maxHp || gp.hp) + hpBoost;
            gp.hp = (gp.hp || 0) + hpBoost;
          }
        }
      }
    } catch { /* no-op */ }
    if (mode !== "training") {
      beginPlayerObservation(mode);
      playerStuckRef.current = {
        x: game.player?.x ?? 0,
        y: game.player?.y ?? 0,
        stillSec: 0,
        wasStuckHeavy: false,
      };
    }
    const ctx = canvas.getContext("2d")!;

    const loop = (timestamp: number) => {
      const prev = lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const rawDt = prev ? (timestamp - prev) / 1000 : 1 / 60;
      const dt = Math.min(Math.max(rawDt, 1 / 240), 0.05);

      if (autoplayOnRef.current && autoplayRef.current && !game.over && !isDevBattleWorldFrozen() && !introActiveRef.current) {
        autoplayRef.current.tick(timestamp);
      }
      const introFrozen = introActiveRef.current;
      if (!introFrozen) {
        game.update(dt);
        setGameRenderDt(dt);
      } else if (!introDtZeroedRef.current) {
        setGameRenderDt(0);
        introDtZeroedRef.current = true;
      }

      if (mode !== "training" && !game.over && !introFrozen) {
        const pl = (game as any).player;
        if (pl) {
          const stuck = trackPlayerStuck(pl.x, pl.y, dt, playerStuckRef.current);
          playerStuckRef.current = { ...stuck, wasStuckHeavy: stuck.wasStuckHeavy };
          observePlayerBattleFrame(game as any, pl.id ?? brawlerId, dt);
        }
      }

      if (!game.over && !introFrozen) {
        tickBattleReplayRecording(game, collectBattleBrawlers(game), dt);
      }

      const cam: any = (game as any).camera;
      if (cam) {
        if (introFrozen && introCamRef.current) {
          cam.x = introCamRef.current.x;
          cam.y = introCamRef.current.y;
        }
        const brawlers = collectBattleBrawlers(game);
        const player: any = (game as any).player;
        const viewerTeam: string | undefined = player?.team;
        const crates: any[] | undefined = (game as any).map?.crates;
        const allDrops: any[] | undefined = (game as any).drops;
        const powerJars = allDrops
          ? allDrops
              .filter((d: any) => d && d.type === "powerup" && (typeof d.jarId === "number" || typeof d.id === "number"))
              .map((d: any) => ({
                id: d.jarId ?? d.id,
                x: d.x,
                y: d.y,
                radius: d.radius ?? 14,
                spawnX: d.spawnX,
                spawnY: d.spawnY,
              }))
          : undefined;
        let battleSafes: Battle3DSafe[] | undefined;
        if (mode === "heist" && Array.isArray((game as any).safes)) {
          battleSafes = (game as any).safes.map((s: any) => ({
            id: `heist-${s.team}`,
            x: s.x,
            y: s.y,
            team: s.team,
            hp: s.hp,
            maxHp: s.maxHp,
            size: 100,
          }));
        } else if (mode === "siege" && (game as any).baseHp > 0) {
          battleSafes = [{
            id: "siege-base",
            x: (game as any).baseX,
            y: (game as any).baseY,
            team: "blue",
            hp: (game as any).baseHp,
            maxHp: (game as any).baseMaxHp,
            size: 60,
          }];
        }
        tickAndRenderBattle3D(cam.x ?? 0, cam.y ?? 0, brawlers, introFrozen ? 0 : dt, viewerTeam, crates, powerJars, battleSafes, mode === "monsterhide");
      }

      game.render(ctx);

      if (game.over) {
        if (gameOverAtRef.current == null) gameOverAtRef.current = timestamp;
        // Keep rendering for a short post-battle transition instead of hard stop.
        const overFor = timestamp - gameOverAtRef.current;
        const fadeT = Math.min(1, overFor / 1400);
        ctx.save();
        ctx.fillStyle = `rgba(6,8,16,${0.12 + fadeT * 0.28})`;
        ctx.fillRect(0, 0, 1200, 800);
        ctx.restore();

        if (!gameOverHandledRef.current && overFor >= 1400) {
          gameOverHandledRef.current = true;
          const ms = getMatchStats();
          const currentGame = gameRef.current;
          const questDeltaNow = mode === "bossraid" ? [] : computeQuestDeltas();
          setGameOver(true);
          setWon(game.won);
          setQuestDeltas(questDeltaNow);
          let raidGrantLoop: GrantBossRaidRewardResult | null = null;
          if (game.won && mode === "bossraid" && bossRaid) {
            raidGrantLoop = applyPartySharedBossRaidVictory(bossRaid.bossId, bossRaid.level);
          } else if (game.won && mode === "siege" && siege) {
            applyPartySharedSiegeVictory(siege.level);
          } else if (mode === "bossraid") {
            raidGrantLoop = null;
          }
          setBossRaidGrant(raidGrantLoop);
          setMatchStatsData(normalizeMatchStats(ms));
          const p = getCurrentProfile();
          if (p?.lastResult) {
            setResult({
        place: p.lastResult.place,
        trophyDelta: p.lastResult.trophyDelta,
        xpGained: p.lastResult.xpGained,
        winStreak: p.lastResult.winStreak,
        winStreakBonus: p.lastResult.winStreakBonus,
        masteryXpGained: p.lastResult.masteryXpGained,
        masteryLeaderBonus: p.lastResult.masteryLeaderBonus,
        monsterKillTrophyBonus: p.lastResult.monsterKillTrophyBonus,
        rankedCupDelta: p.lastResult.rankedCupDelta,
        rankedBattle: p.lastResult.rankedBattle,
      });
          }
          if (currentGame && typeof (currentGame as any).getParticipants === "function") {
            setParticipants((currentGame as any).getParticipants());
          } else {
            const prof = getCurrentProfile();
            setParticipants([{
              brawlerId,
              displayName: prof?.username || t("common.player"),
              team: "blue",
              isPlayer: true,
              level: level,
              trophies: prof?.trophies ?? 0,
            }]);
          }
          void (async () => {
            const replayId = await finishBattleReplayRecording();
            const parts =
              currentGame && typeof (currentGame as any).getParticipants === "function"
                ? (currentGame as any).getParticipants()
                : [];
            const score = currentGame ? extractBattleScore(currentGame) : null;
            finishLiveBattleRecording({
              won: game.won,
              participants: parts,
              result: p?.lastResult
                ? {
                    trophyDelta: p.lastResult.trophyDelta,
                    xpGained: p.lastResult.xpGained,
                    place: p.lastResult.place,
                  }
                : null,
              matchStats: normalizeMatchStats(ms),
              scoreBlue: score?.blue,
              scoreRed: score?.red,
            });
            const battleRecordId = getBattleHistory()[0]?.id;
            enrichLatestBattleRecord({
              recordId: battleRecordId,
              participants: parts,
              myTeam: (currentGame as { player?: { team?: string } })?.player?.team,
              scoreBlue: score?.blue,
              scoreRed: score?.red,
              replayId,
              durationSec: (performance.now() - battleStartRef.current) / 1000,
              mapId: activeMap?.id,
              showdownFormat: mode === "showdown" ? showdownFormat : undefined,
              bossId: mode === "bossraid" ? bossRaid?.bossId : undefined,
              bossLevel: mode === "bossraid" ? bossRaid?.level : undefined,
            });
            if (replayId) setReplayId(replayId);
          })();
        }
        if (!gameOverHandledRef.current) {
          rafRef.current = requestAnimationFrame(loop);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      boot3dCancelled = true;
      cancelAnimationFrame(boot3dRaf);
      if (mode !== "training") endPlayerObservation();
      cancelBattleReplayRecording();
      resetDevBattlePause();
      resetKillFeedBus();
      enableBattle3D(false);
      disposeBattle3D();
      setBattle3DCanvas(null);
      cancelAnimationFrame(rafRef.current);
      game.destroy?.();
      gameRef.current = null;
      autoplayRef.current?.destroy();
      autoplayRef.current = null;
      lastTimeRef.current = 0;
      gameOverAtRef.current = null;
      gameOverHandledRef.current = false;
    };
  }, [mode, showdownFormat, starStrikeFormat, brawlerId, bossRaid?.bossId, bossRaid?.level]);

  const handleIntroComplete = useCallback(() => {
    introActiveRef.current = false;
    introCamRef.current = null;
    introDtZeroedRef.current = false;
    setIntroActive(false);
    battleStartRef.current = performance.now();
  }, []);

  const handleIntroCamera = useCallback((x: number, y: number) => {
    introCamRef.current = { x, y };
  }, []);

  const partyReplayEligible = gameOver && isBattleTeamPlayAgainEligible() && mode !== "training";

  useEffect(() => {
    if (!partyReplayEligible) return;
    const bump = () => {
      tickBattlePlayAgainExpired();
      setPartyPlayAgainTick(t => t + 1);
    };
    bump();
    const iv = window.setInterval(bump, 250);
    window.addEventListener(PARTY_CHANGED_EVENT, bump);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener(PARTY_CHANGED_EVENT, bump);
    };
  }, [partyReplayEligible]);

  useEffect(() => {
    if (!partyReplayEligible || partyRematchResolvedRef.current) return;
    const pa = getPlayAgainState();
    if (!pa?.finalized) return;
    partyRematchResolvedRef.current = true;
    if (shouldRematchBattlePlayAgain()) {
      stashBattlePlayAgainRematchRoster();
      clearBattlePlayAgainState();
      onResultPlayAgain(won);
    } else if (shouldExitAfterBattlePlayAgain()) {
      clearAllPlayAgainState();
      onExit();
    }
  }, [partyReplayEligible, partyPlayAgainTick, won, onExit, onResultPlayAgain]);

  const handlePlayAgain = () => {
    if (partyReplayEligible) {
      if (getPlayAgainState()?.finalized) return;
      pressBattlePlayAgain(mode);
      setPartyPlayAgainTick(t => t + 1);
      return;
    }
    onResultPlayAgain(won);
  };

  const handleResultExit = () => {
    if (partyReplayEligible && !getPlayAgainState()?.finalized) {
      playAgainOnResultExit();
    }
    clearAllPlayAgainState();
    onExit();
  };

  const partyPaActive = partyReplayEligible && isPlayAgainActive();
  const partyPaReady = partyReplayEligible && amIPlayAgainReady();
  const partyPaSecs = partyReplayEligible ? getPlayAgainSecondsLeft() : 0;

  const isRankedResult = !!result?.rankedBattle;
  let playAgainLabel = t("battle.playAgain");
  if (isRankedResult) playAgainLabel = t("ranked.playAgain");
  else if (mode === "bossraid" && won) playAgainLabel = t("battle.nextBossLevel");
  else if (partyPaActive && partyPaReady) playAgainLabel = t("party.waitingSeconds", { seconds: partyPaSecs });
  else if (partyPaActive) playAgainLabel = t("battle.playAgainCountdown", { seconds: partyPaSecs });

  const playAgainDisabled =
    (mode === "bossraid" && won && !!bossRaid && bossRaid.level >= BOSS_RAID_MAX_LEVEL)
    || (partyPaActive && partyPaReady);

  const stageCanvases = (
    <>
      <canvas
        ref={canvas3DRef}
        width={1200}
        height={800}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          pointerEvents: "none",
          background: "#050508",
          zIndex: 0,
        }}
      />
      <canvas
        ref={canvasRef}
        width={1200}
        height={800}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
          background: "transparent",
          transform: "translateZ(0)",
          border: "none",
          outline: "none",
          boxShadow: "inset 0 1px 0 0 #050508",
          zIndex: 1,
        }}
      />
    </>
  );

  const battleHud = (
    <>
      {introActive && introMeta && introParticipants.length > 0 && (
        <BattleIntroOverlay
          mode={mode}
          showdownFormat={showdownFormat}
          participants={introParticipants}
          playerTeam={introMeta.playerTeam}
          playerX={introMeta.playerX}
          playerY={introMeta.playerY}
          camW={introMeta.camW}
          camH={introMeta.camH}
          mapW={introMeta.mapW}
          mapH={introMeta.mapH}
          onCamera={handleIntroCamera}
          onComplete={handleIntroComplete}
        />
      )}

      {controlMode === "mobile" && !gameOver && !introActive && (
        <MobileControls
          getInput={() => gameRef.current?.input ?? null}
          getPlayerInfo={() => ({
            attackRange: brawlerStats.attackRange,
            canvas: canvasRef.current,
            brawlerId: gameRef.current?.player?.stats.id ?? brawlerStats.id,
            playerX: gameRef.current?.player?.x,
            playerY: gameRef.current?.player?.y,
            camX: gameRef.current?.camera?.x,
            camY: gameRef.current?.camera?.y,
            oliverMemoryCount: gameRef.current?.player?.oliverMemories?.length ?? 0,
            onOliverCycleMemory: () => {
              const p = gameRef.current?.player;
              if (p) cycleOliverMemory(p);
            },
          })}
        />
      )}

      {!gameOver && !introActive && (
        <MiniMap gameRef={gameRef as any} mode={mode} showdownFormat={showdownFormat} />
      )}

      {mode === "megashowdown" && !gameOver && !introActive && (
        <MegaSquadHud gameRef={gameRef as React.MutableRefObject<ClashMega | null>} />
      )}

      {mode === "training" && !gameOver && (
        <button
          onClick={onExit}
          style={{
            position: "absolute",
            top: 14, right: 14, zIndex: 11,
            background: "linear-gradient(135deg, #C62828, #FF5252)",
            border: "none",
            borderRadius: 12,
            padding: "10px 18px",
            color: "white",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1.5,
            cursor: "pointer",
            boxShadow: "0 4px 18px rgba(255,82,82,0.5)",
          }}
        >
          {t("battle.exitTraining")}
        </button>
      )}

      {!gameOver && !introActive && (
        <KillFeedHud top={astralAvailable ? 96 : 18} />
      )}

      {astralAvailable && !gameOver && !introActive && (
        <>
          <AstralBattleTip
            getSnapshot={() => {
              const g = gameRef.current;
              if (!g || !g.player) return null;
              const dur = (performance.now() - battleStartRef.current) / 1000;
              return buildBattleSnapshot(
                g as unknown as { input: any; player: any; bots: any[]; drops: any[]; map: any; gas?: any },
                mode,
                dur,
                getPetById(getCurrentProfile()?.equippedPetId ?? null)?.effectLabel ?? null,
              );
            }}
          />
          <button
            onClick={() => {
              const next = !autoplayOn;
              setAutoplayOn(next);
            }}
            style={{
              position: "absolute",
              top: 212, right: 14, zIndex: 11,
              background: autoplayOn
                ? "linear-gradient(135deg, #FFD740, #FFA000)"
                : "rgba(74,20,140,0.85)",
              border: `1.5px solid ${autoplayOn ? "#FFD740" : "rgba(206,147,216,0.6)"}`,
              borderRadius: 12,
              padding: "10px 14px",
              color: autoplayOn ? "#3E2723" : "#FFD740",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: 1,
              cursor: "pointer",
              boxShadow: autoplayOn
                ? "0 4px 18px rgba(255,160,0,0.5)"
                : "0 4px 14px rgba(0,0,0,0.5)",
            }}
            title={t("battle.astralAutoplay")}
          >
            ✨ {autoplayOn ? t("battle.autoplayOn") : t("battle.autoplayOff")}
          </button>
        </>
      )}

      {!gameOver && !introActive && (
        <BattlePinHud
          brawlerId={brawlerId}
          gameRef={gameRef as any}
          canvasRef={canvasRef}
          visible={!gameOver}
        />
      )}
    </>
  );

  const resultOverlay = gameOver ? (
    <ResultScreen
      won={won}
      mode={mode}
      participants={participants}
      result={result}
      matchStats={matchStatsData}
      questDeltas={questDeltas}
      bossRaidGrant={bossRaidGrant}
      playAgainLabel={playAgainLabel}
      playAgainDisabled={playAgainDisabled}
      partyPlayAgainMembers={partyReplayEligible ? getBattleTeamPlayAgainPanelMembers() : []}
      partyPlayAgainSecondsLeft={partyPaSecs}
      partyPlayAgainActive={partyPaActive}
      canShareBattle={mode !== "training" && !!getMyClub()}
      replayReady={!!replayId || !!getBattleHistory()[0]?.replayId}
      battleShared={battleShared}
      onShareBattle={handleShareBattle}
      onExit={handleResultExit}
      onPlayAgain={handlePlayAgain}
    />
  ) : null;

  if (isDesktopBattle) {
    return (
      <>
        <div
          style={{
            width: "100vw",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#050508",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(100vw, calc(100vh * 1200 / 800))",
              height: "min(100vh, calc(100vw * 800 / 1200))",
              maxWidth: "100vw",
              maxHeight: "100vh",
              overflow: "hidden",
              background: "#050508",
              isolation: "isolate",
            }}
          >
            {stageCanvases}
            <div style={{ position: "absolute", inset: 0, zIndex: 10 }}>
              {battleHud}
            </div>
          </div>
        </div>
        {resultOverlay}
      </>
    );
  }

  return (
    <>
      <BattleStageShell overlay={battleHud}>
        {stageCanvases}
      </BattleStageShell>
      {resultOverlay}
    </>
  );
}
