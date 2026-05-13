import { useEffect, useRef, useState, type RefObject } from "react";
import { ClashShowdown } from "../modes/ClashShowdown";
import { ClashCrystals } from "../modes/ClashCrystals";
import { ClashHeist } from "../modes/ClashHeist";
import { ClashGemGrab } from "../modes/ClashGemGrab";
import { ClashSiege } from "../modes/ClashSiege";
import { ClashTraining } from "../modes/ClashTraining";
import { ClashMega } from "../modes/ClashMega";
import { ClashStarStrike } from "../modes/ClashStarStrike";
import { ClashBossRaid } from "../modes/ClashBossRaid";
import { getCurrentProfile, getControlMode, getQuestPool, getBrawlerStars } from "../utils/localStorageAPI";
import { getMatchStats } from "../utils/matchStats";
import { loadSpriteSheet, loadBrawlerImages } from "../game/sprites";
import { preloadCharRenderers } from "../game/miyaTopDownRenderer";
import { setGameRenderDt } from "../game/frameClock";
import { BRAWLERS, getBrawlerById } from "../entities/BrawlerData";
import { getPetById } from "../entities/PetData";
import MobileControls from "../components/MobileControls";
import MiniMap from "../components/MiniMap";
import MegaSquadHud from "../components/MegaSquadHud";
import ResultScreen from "../components/ResultScreen";
import AstralBattleTip from "../components/AstralBattleTip";
import { AstralAutoplay, buildBattleSnapshot } from "../ai/AstralAutoplay";
import { isStarGuardianActive, getAstralSettings } from "../utils/subscription";
import type { GameParticipant } from "../types/gameResult";
import type { GameMode, ShowdownFormat, StarStrikeFormat } from "../App";
import { finalizeBossRaidVictory, type GrantBossRaidRewardResult } from "../utils/bossRaidRewards";
import { isAdminUnlocked } from "../utils/mapEditorAPI";
import { resetDevBattlePause, toggleDevBattlePauseFromCaps, isDevBattleWorldFrozen } from "../game/battleDevPause";

interface GameScreenProps {
  mode: GameMode;
  showdownFormat?: ShowdownFormat;
  starStrikeFormat?: StarStrikeFormat;
  brawlerId: string;
  megaSquad?: { ids: string[]; levels: number[] } | null;
  bossRaid?: { bossId: string; level: number } | null;
  onExit: () => void;
  onPlayAgain?: () => void;
}

type AnyGame = ClashShowdown | ClashCrystals | ClashHeist | ClashGemGrab | ClashSiege | ClashTraining | ClashMega | ClashStarStrike | ClashBossRaid;
type QuestDelta = { description: string; before: number; after: number; target: number; delta: number };

/** Duplicate score/timer above the canvas — avoids clipping when the canvas uses `object-fit: cover`. */
function StarStrikeHudFixed({
  gameRef,
  visible,
}: {
  gameRef: RefObject<AnyGame | null>;
  visible: boolean;
}) {
  const [s, setS] = useState({ blue: 0, red: 0, secondsLeft: 180, overtime: false });
  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const g = gameRef.current;
      if (!g || typeof (g as ClashStarStrike).getHudSnapshot !== "function") return;
      setS((g as ClashStarStrike).getHudSnapshot());
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [visible, gameRef]);
  if (!visible) return null;
  const mm = Math.floor(s.secondsLeft / 60);
  const ss = Math.floor(s.secondsLeft % 60).toString().padStart(2, "0");
  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 25,
        pointerEvents: "none",
        width: 360,
        padding: "8px 12px 10px",
        borderRadius: 14,
        background: "rgba(0,0,0,0.82)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.12)",
        textAlign: "center",
        fontFamily: "'Segoe UI', Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.88)", letterSpacing: 1.2, marginBottom: 4 }}>
        {s.overtime ? `ЗОЛОТОЙ ГОЛ • ${mm}:${ss}` : `${mm}:${ss}`}
      </div>
      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", marginBottom: 2 }}>F3 — визуальный редактор слоя (без физики)</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <span style={{ fontSize: 26, fontWeight: 900, color: "#40C4FF", minWidth: 44 }}>{s.blue}</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: "#fff", opacity: 0.9 }}>:</span>
        <span style={{ fontSize: 26, fontWeight: 900, color: "#FF5252", minWidth: 44 }}>{s.red}</span>
      </div>
    </div>
  );
}

export default function GameScreen({ mode, showdownFormat = "solo", starStrikeFormat = "3v3", brawlerId, megaSquad, bossRaid = null, onExit, onPlayAgain }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<AnyGame | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [spriteLoaded, setSpriteLoaded] = useState(false);
  const [result, setResult] = useState<{ place: number; trophyDelta: number; xpGained: number } | null>(null);
  const [participants, setParticipants] = useState<GameParticipant[]>([]);
  const [matchStatsData, setMatchStatsData] = useState({ damageDealt: 0, healingDone: 0, superUses: 0, killCount: 0, powerCubesCollected: 0 });
  const [questDeltas, setQuestDeltas] = useState<QuestDelta[]>([]);
  const [controlMode] = useState(getControlMode());
  const autoplayRef = useRef<AstralAutoplay | null>(null);
  const [autoplayOn, setAutoplayOn] = useState(false);
  const autoplayOnRef = useRef(false);
  const battleStartRef = useRef<number>(0);
  const gameOverAtRef = useRef<number | null>(null);
  const gameOverHandledRef = useRef(false);
  const gameOverStateRef = useRef(false);
  const [bossRaidGrant, setBossRaidGrant] = useState<GrantBossRaidRewardResult | null>(null);
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
    let mounted = true;
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
    autoplayOnRef.current = autoplayOn;
  }, [autoplayOn]);

  useEffect(() => {
    gameOverStateRef.current = gameOver;
  }, [gameOver]);

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
      raidGrant = finalizeBossRaidVictory(bossRaid.bossId, bossRaid.level);
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
      setResult({ place: p.lastResult.place, trophyDelta: p.lastResult.trophyDelta, xpGained: p.lastResult.xpGained });
    } else {
      setResult({ place: wonNow ? 1 : 2, trophyDelta: 0, xpGained: 0 });
    }
    if (typeof (currentGame as any).getParticipants === "function") {
      setParticipants((currentGame as any).getParticipants());
    } else {
      const prof = getCurrentProfile();
      setParticipants([{
        brawlerId,
        displayName: prof?.username || "Игрок",
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
      g.over = true;
      g.won = false;
      finalizeBattleNow(false);
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

    let game: AnyGame;
    const handleAttack = () => gameRef.current?.handleAttack();
    const handleSuper = () => gameRef.current?.handleSuper();

    if (mode === "showdown") {
      game = new ClashShowdown(canvas, brawlerId, level, showdownFormat, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "crystals") {
      game = new ClashCrystals(canvas, brawlerId, level, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "heist") {
      game = new ClashHeist(canvas, brawlerId, level, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "gemgrab") {
      game = new ClashGemGrab(canvas, brawlerId, level, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "starstrike") {
      game = new ClashStarStrike(canvas, brawlerId, level, starStrikeFormat, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "training") {
      game = new ClashTraining(canvas, brawlerId, level, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "bossraid") {
      const br = bossRaid ?? { bossId: "miya", level: 1 };
      game = new ClashBossRaid(canvas, brawlerId, level, br.bossId, br.level, handleAttack, handleSuper, spriteLoaded);
    } else if (mode === "megashowdown") {
      // Fall back to active brawler ×3 if the picker did not provide a squad
      // (e.g. direct route into the screen). Levels default to 1.
      const ids = (megaSquad?.ids && megaSquad.ids.length === 3)
        ? megaSquad.ids
        : [brawlerId, brawlerId, brawlerId];
      const levels = (megaSquad?.levels && megaSquad.levels.length === 3)
        ? megaSquad.levels
        : [level, level, level];
      game = new ClashMega(canvas, ids, levels, handleAttack, handleSuper, spriteLoaded);
    } else {
      game = new ClashSiege(canvas, brawlerId, level, handleAttack, handleSuper, spriteLoaded);
    }

    gameRef.current = game;
    autoplayRef.current = new AstralAutoplay(game as unknown as { input: any; player: any; bots: any[]; drops: any[]; map: any; gas?: any }, mode);
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
    } catch { /* no-op */ }
    battleStartRef.current = performance.now();
    const ctx = canvas.getContext("2d")!;

    const loop = (timestamp: number) => {
      const prev = lastTimeRef.current;
      lastTimeRef.current = timestamp;
      const rawDt = prev ? (timestamp - prev) / 1000 : 1 / 60;
      const dt = Math.min(Math.max(rawDt, 1 / 240), 0.05);

      if (autoplayOnRef.current && autoplayRef.current && !game.over && !isDevBattleWorldFrozen()) {
        autoplayRef.current.tick(timestamp);
      }
      game.update(dt);
      setGameRenderDt(dt);
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
            raidGrantLoop = finalizeBossRaidVictory(bossRaid.bossId, bossRaid.level);
          } else if (mode === "bossraid") {
            raidGrantLoop = null;
          }
          setBossRaidGrant(raidGrantLoop);
          setMatchStatsData({
            damageDealt: ms.damageDealt ?? 0,
            healingDone: ms.healingDone ?? 0,
            superUses: ms.superUses ?? 0,
            killCount: ms.killCount ?? 0,
            powerCubesCollected: ms.powerCubesCollected ?? 0,
          });
          const p = getCurrentProfile();
          if (p?.lastResult) {
            setResult({ place: p.lastResult.place, trophyDelta: p.lastResult.trophyDelta, xpGained: p.lastResult.xpGained });
          }
          if (currentGame && typeof (currentGame as any).getParticipants === "function") {
            setParticipants((currentGame as any).getParticipants());
          } else {
            const prof = getCurrentProfile();
            setParticipants([{
              brawlerId,
              displayName: prof?.username || "Игрок",
              team: "blue",
              isPlayer: true,
              level: level,
              trophies: prof?.trophies ?? 0,
            }]);
          }
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
      resetDevBattlePause();
      cancelAnimationFrame(rafRef.current);
      game.destroy?.();
      gameRef.current = null;
      autoplayRef.current?.destroy();
      autoplayRef.current = null;
      lastTimeRef.current = 0;
      gameOverAtRef.current = null;
      gameOverHandledRef.current = false;
    };
  }, [mode, showdownFormat, starStrikeFormat, brawlerId, spriteLoaded, bossRaid?.bossId, bossRaid?.level]);

  const handlePlayAgain = () => {
    if (onPlayAgain) {
      onPlayAgain();
    } else {
      onExit();
    }
  };

  return (
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
      {/*
        Буфер игры 1200×800 (3:2). Растягивание на весь экран ломало пропорции (object-fit: cover
        + несовпадение сторон). Контейнер = max вписанный прямоугольник 3:2 — без неравномерного скейла.
      */}
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
        <canvas
          ref={canvasRef}
          width={1200}
          height={800}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            touchAction: "none",
            background: "#050508",
            transform: "translateZ(0)",
            border: "none",
            outline: "none",
            boxShadow: "inset 0 1px 0 0 #050508",
          }}
        />
      </div>

      <StarStrikeHudFixed gameRef={gameRef} visible={mode === "starstrike" && !gameOver} />

      {controlMode === "mobile" && !gameOver && (
        <MobileControls
          getInput={() => gameRef.current?.input ?? null}
          getPlayerInfo={() => ({
            attackRange: brawlerStats.attackRange,
            canvas: canvasRef.current,
            brawlerId: gameRef.current?.player?.stats.id ?? brawlerStats.id,
            playerX: gameRef.current?.player?.x,
            playerY: gameRef.current?.player?.y,
          })}
        />
      )}

      {!gameOver && (
        <MiniMap gameRef={gameRef as any} mode={mode} />
      )}

      {mode === "megashowdown" && !gameOver && (
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
          ✕ ВЫЙТИ
        </button>
      )}

      {mode === "bossraid" && !gameOver && (
        <button
          onClick={onExit}
          style={{
            position: "absolute",
            top: 14, right: 14, zIndex: 11,
            background: "linear-gradient(135deg, #4a148c, #7c4dff)",
            border: "none",
            borderRadius: 12,
            padding: "10px 18px",
            color: "white",
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 1.5,
            cursor: "pointer",
            boxShadow: "0 4px 18px rgba(124,77,255,0.45)",
          }}
        >
          ✕ ВЫЙТИ
        </button>
      )}

      {/* ── Astral: in-battle tips and autoplay toggle ── */}
      {astralAvailable && !gameOver && (
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
            title="Астрал: автобой"
          >
            ✨ {autoplayOn ? "АВТО ВКЛ" : "АВТО"}
          </button>
        </>
      )}

      {gameOver && (
        <ResultScreen
          won={won}
          mode={mode}
          participants={participants}
          result={result}
          matchStats={matchStatsData}
          questDeltas={questDeltas}
          bossRaidGrant={bossRaidGrant}
          onExit={onExit}
          onPlayAgain={handlePlayAgain}
        />
      )}
    </div>
  );
}
