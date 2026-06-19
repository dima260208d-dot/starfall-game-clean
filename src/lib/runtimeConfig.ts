/**
 * Единая runtime-конфигурация: build-time env + public/cloud-config.json
 */
import { applySupabaseRuntimeConfig, isSupabaseConfigured } from "./supabase";

export type CloudRuntimeConfig = {
  url?: string;
  anonKey?: string;
  gameServerUrl?: string;
  gameServerWsUrl?: string;
  edgeServerUrl?: string;
  assetCdnUrl?: string;
  updatedAt?: string;
};

let runtime: CloudRuntimeConfig = {};
let loaded = false;

function resolveWsUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return httpUrl.replace(/^https:/, "wss:") + "/ws";
  if (httpUrl.startsWith("http://")) return httpUrl.replace(/^http:/, "ws:") + "/ws";
  return httpUrl;
}

export function getRuntimeConfig(): CloudRuntimeConfig {
  return runtime;
}

export function getGameServerHttpUrl(): string | null {
  const fromEnv = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  const url = fromEnv || runtime.gameServerUrl;
  if (!url) return null;
  return url.replace(/\/$/, "");
}

export function getGameServerWsUrl(): string | null {
  const fromEnv = import.meta.env.VITE_GAME_SERVER_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (runtime.gameServerWsUrl) return runtime.gameServerWsUrl;
  const http = getGameServerHttpUrl();
  return http ? resolveWsUrl(http) : null;
}

export function getEdgeServerHttpUrl(): string | null {
  const fromEnv = import.meta.env.VITE_EDGE_SERVER_URL as string | undefined;
  const url = fromEnv || runtime.edgeServerUrl;
  if (!url) return null;
  return url.replace(/\/$/, "");
}

export function getAssetCdnUrl(): string | null {
  const fromEnv = import.meta.env.VITE_ASSET_CDN_URL as string | undefined;
  const url = fromEnv || runtime.assetCdnUrl;
  if (!url) return null;
  return url.replace(/\/?$/, "/");
}

/** WebSocket для синхронизации боёв (Koyeb edge). */
export function getBattleWsUrl(): string | null {
  const edge = getEdgeServerHttpUrl();
  if (!edge) return null;
  const wsBase = edge.startsWith("https://")
    ? edge.replace(/^https:/, "wss:")
    : edge.replace(/^http:/, "ws:");
  return `${wsBase}/ws/battle`;
}

export function isEdgeServerConfigured(): boolean {
  return Boolean(getEdgeServerHttpUrl());
}

export function isGameServerConfigured(): boolean {
  return Boolean(getGameServerHttpUrl());
}

export async function loadCloudRuntimeConfig(): Promise<boolean> {
  if (loaded) return isSupabaseConfigured() || isGameServerConfigured();
  loaded = true;

  try {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
    const res = await fetch(`${base}cloud-config.json`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as CloudRuntimeConfig;
      runtime = data;

      if (!isSupabaseConfigured() && data.url && data.anonKey && data.url.includes("supabase.co")) {
        applySupabaseRuntimeConfig(data.url, data.anonKey);
      }

      if (data.gameServerUrl || data.gameServerWsUrl) {
        console.info("[runtime] game server:", data.gameServerUrl ?? data.gameServerWsUrl);
      }
      if (data.edgeServerUrl) {
        console.info("[runtime] edge (Koyeb+R2):", data.edgeServerUrl);
      }
      if (data.assetCdnUrl) {
        console.info("[runtime] asset CDN (R2 direct):", data.assetCdnUrl);
      }
    }
  } catch {
    /* offline / no file */
  }

  return isSupabaseConfigured() || isGameServerConfigured();
}
