/**
 * Preloads GLB models used by the game.
 *
 * Strategy:
 *  – Brawler / chest / resource models are awaited on the loading screen so
 *    the main menu and reveal animations are ready immediately.
 *  – Tile models (large terrain GLBs) and the platform tile are fired off in
 *    the background the moment the loading screen starts.  They resolve when
 *    ready; the tile renderer already falls back to solid colours until then.
 */
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadGLTFCached, MODEL_URLS } from "../components/BrawlerRevealModal";
import { loadChestCached, CHEST_MODELS } from "../components/Chest3DViewer";
import { loadAllTileModels } from "./tileModelCache";
import { loadPlatformTile } from "./platformTile";
import { loadPowerModels } from "./powerModelCache";

// ── Resource model cache (coin / gem / powerpoint) ────────────────────────────
const resourceCache = new Map<string, Promise<void>>();

function loadResourceCached(url: string): Promise<void> {
  const hit = resourceCache.get(url);
  if (hit) return hit;
  const p = new Promise<void>((resolve) => {
    new GLTFLoader().load(url, () => resolve(), undefined, () => resolve());
  });
  resourceCache.set(url, p);
  return p;
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function preloadAllModels(
  base: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const b = base.endsWith("/") ? base : `${base}/`;

  // Start tile + platform loading immediately in the background (non-blocking).
  // These resolve asynchronously; the map renderer uses solid-colour fallbacks
  // until the 3-D tiles are ready.
  loadAllTileModels();
  loadPlatformTile();
  loadPowerModels(); // power box + power jar GLBs (non-blocking)

  // Only these tasks gate the loading screen.
  const brawlerTasks = Object.values(MODEL_URLS).map((m) =>
    loadGLTFCached(`${b}${m.url}`),
  );
  const chestTasks = Object.values(CHEST_MODELS).map((path) =>
    loadChestCached(`${b}${path}`),
  );
  const resourceTasks = (
    ["models/coin.glb", "models/gem.glb", "models/powerpoint.glb"] as const
  ).map((p) => loadResourceCached(`${b}${p}`));

  const allTasks: Promise<unknown>[] = [
    ...brawlerTasks,
    ...chestTasks,
    ...resourceTasks,
  ];
  const total = allTasks.length;
  let done = 0;

  onProgress(0.04); // immediate 4 % so the bar never looks stuck at zero

  await Promise.all(
    allTasks.map((task) =>
      Promise.resolve(task)
        .then(() => { done++; onProgress(0.04 + (done / total) * 0.92); })
        .catch(() => { done++; onProgress(0.04 + (done / total) * 0.92); }),
    ),
  );

  onProgress(1.0);
}
