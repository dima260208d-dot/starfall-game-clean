/**
 * Preloads GLB models used by the game (boot screen).
 * Progress reflects real completion of each asset group.
 */
import { preloadBootAssets } from "./battleAssetPreloader";

export async function preloadAllModels(
  base: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  await preloadBootAssets(base, onProgress);
}
