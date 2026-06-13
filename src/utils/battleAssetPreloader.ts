/**
 * Единая предзагрузка ресурсов боя с реальным прогрессом (GLB, текстуры, спрайты).
 * Вызывается на экране загрузки перед входом в GameScreen.
 */
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BRAWLERS } from "../entities/BrawlerData";
import { preloadCharRenderers, disposeCharBakerSharedRenderer } from "../game/miyaTopDownRenderer";
import { preloadPetModels } from "../game/pet3DRenderer";
import { loadSpriteSheet, loadBrawlerImages } from "../game/sprites";
import { loadRollingStarBallModel } from "../game/soccerBallRenderer";
import type { GameMode } from "../App";
import { loadAllTileModels, disposeTileBakerRenderer } from "./tileModelCache";
import { loadBinbunGrassAssets } from "../game/binbunGrass3D";
import { loadPowerBoxGLBTemplate, loadPowerJarGLBTemplate, loadPowerModels, disposePowerBakerRenderer } from "./powerModelCache";
import { loadResourceListIcons, disposeResourceListIconBaker } from "./resourceListIconCache";
import { loadGLTFCached, MODEL_URLS } from "../components/BrawlerRevealModal";
import { loadChestCached, CHEST_MODELS } from "../components/Chest3DViewer";
import { preloadSpinningModelPath } from "../components/SpinningModel3D";

export type PreloadProgressCallback = (ratio: number) => void;

type WeightedTask = { weight: number; run: () => Promise<unknown> };

let battleAssetsReady = false;

export function isBattleAssetsReady(): boolean {
  return battleAssetsReady;
}

export function resetBattleAssetsReady(): void {
  battleAssetsReady = false;
}

function releaseMenuBakerContexts(): void {
  disposeTileBakerRenderer();
  disposePowerBakerRenderer();
  disposeResourceListIconBaker();
  disposeCharBakerSharedRenderer();
}

async function runWeightedPreload(
  tasks: WeightedTask[],
  onProgress: PreloadProgressCallback,
): Promise<void> {
  const total = tasks.reduce((s, t) => s + t.weight, 0);
  if (total <= 0) {
    onProgress(1);
    return;
  }
  let done = 0;
  onProgress(0.02);

  await Promise.all(
    tasks.map(async (task) => {
      try {
        await task.run();
      } catch {
        /* отдельный ассет не должен ронять весь бой */
      }
      done += task.weight;
      onProgress(0.02 + (done / total) * 0.96);
    }),
  );

  onProgress(1);
}

function loadGlbQuiet(url: string): Promise<void> {
  return new Promise((resolve) => {
    new GLTFLoader().load(url, () => resolve(), undefined, () => resolve());
  });
}

function collectCoreBattleTasks(base: string): WeightedTask[] {
  const b = base.endsWith("/") ? base : `${base}/`;
  return [
    { weight: 24, run: () => loadAllTileModels() },
    { weight: 10, run: () => loadBinbunGrassAssets(b) },
    { weight: 5, run: () => loadPowerBoxGLBTemplate() },
    { weight: 5, run: () => loadPowerJarGLBTemplate() },
    { weight: 18, run: () => preloadCharRenderers(b) },
    { weight: 6, run: () => preloadPetModels(b) },
    { weight: 4, run: () => loadSpriteSheet(`${b}characters.webp`) },
    { weight: 14, run: () => loadBrawlerImages(BRAWLERS.map((x) => x.id), b) },
  ];
}

export interface BattlePreloadOptions {
  mode?: GameMode;
}

/** Полная предзагрузка перед боем (экран «ВХОД В АРЕНУ» и т.п.). */
export async function preloadBattleAssets(
  base: string,
  onProgress: PreloadProgressCallback,
  opts: BattlePreloadOptions = {},
): Promise<void> {
  battleAssetsReady = false;
  const b = base.endsWith("/") ? base : `${base}/`;
  const tasks = collectCoreBattleTasks(base);

  if (opts.mode === "starstrike") {
    tasks.push({ weight: 8, run: () => loadPowerModels() });
    tasks.push({ weight: 6, run: () => loadRollingStarBallModel(b) });
  }
  if (opts.mode === "heist") {
    tasks.push({ weight: 5, run: () => loadGlbQuiet(`${b}models/safe.glb`) });
  }
  if (opts.mode === "gemgrab" || opts.mode === "crystals") {
    tasks.push({ weight: 4, run: () => loadGlbQuiet(`${b}models/gem.glb`) });
  }

  await runWeightedPreload(tasks, onProgress);
  releaseMenuBakerContexts();
  battleAssetsReady = true;
}

/** Задачи для первого запуска приложения (меню, сундуки, все модели). */
export function collectBootPreloadTasks(base: string): WeightedTask[] {
  const b = base.endsWith("/") ? base : `${base}/`;
  const tasks = collectCoreBattleTasks(base);

  for (const m of Object.values(MODEL_URLS)) {
    tasks.push({ weight: 2, run: () => loadGLTFCached(`${b}${m.url}`) });
  }
  for (const path of Object.values(CHEST_MODELS)) {
    tasks.push({ weight: 2, run: () => loadChestCached(`${b}${path}`) });
    tasks.push({ weight: 2, run: () => preloadSpinningModelPath(`${b}${path}`) });
  }
  tasks.push(
    { weight: 2, run: () => preloadSpinningModelPath(`${b}models/coin.glb`) },
    { weight: 2, run: () => preloadSpinningModelPath(`${b}models/gem.glb`) },
    { weight: 2, run: () => preloadSpinningModelPath(`${b}models/powerpoint.glb`) },
    { weight: 2, run: () => preloadSpinningModelPath(`${b}models/trophy.glb`) },
    { weight: 2, run: () => loadGlbQuiet(`${b}models/safe.glb`) },
    { weight: 2, run: () => loadGlbQuiet(`${b}models/star_ball.glb`) },
    { weight: 3, run: () => loadResourceListIcons() },
  );

  return tasks;
}

export async function preloadBootAssets(
  base: string,
  onProgress: PreloadProgressCallback,
): Promise<void> {
  await runWeightedPreload(collectBootPreloadTasks(base), onProgress);
  releaseMenuBakerContexts();
  battleAssetsReady = true;
}
