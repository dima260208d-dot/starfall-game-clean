/** Базовый URL тяжёлых ассетов: Koyeb edge → R2 → локально. */
import { getAssetCdnUrl, getEdgeServerHttpUrl } from "./runtimeConfig";

/** UI-картинки, иконки, аватары — всегда с основного хоста. */
export function getUiAssetBaseUrl(): string {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
}

/**
 * 3D-модели, GLB, тайлы карт — через Koyeb+R2 или прямой R2.
 * Приоритет: edge /cdn/ → R2 → локальный public/
 */
export function getHeavyAssetBaseUrl(): string {
  const edge = getEdgeServerHttpUrl();
  if (edge) return `${edge}/cdn/`;

  const cdn = getAssetCdnUrl();
  if (cdn) return cdn;

  const fromEnv = import.meta.env.VITE_ASSET_CDN_URL as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/?$/, "/");

  return getUiAssetBaseUrl();
}

/** @deprecated используйте getHeavyAssetBaseUrl или getUiAssetBaseUrl */
export function getAssetBaseUrl(): string {
  return getHeavyAssetBaseUrl();
}
