import type { GameMode } from "../App";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");

export { BASE as publicAssetBase };

export const MODE_ICON_IMAGES: Partial<Record<GameMode | string, string>> = {
  starstrike: `${BASE}images/mode-starstrike.png`,
  showdown: `${BASE}images/mode-showdown.png`,
  crystals: `${BASE}images/mode-crystals.png`,
  siege: `${BASE}images/mode-siege.png`,
  heist: `${BASE}images/mode-heist.png`,
  gemgrab: `${BASE}images/mode-gemgrab.png`,
  megashowdown: `${BASE}images/mode-megashowdown.png`,
  bounty: `${BASE}images/mode-bounty.png`,
  monsterhide: `${BASE}images/mode-monsterhide.png`,
  monsterInvasion: `${BASE}images/mode-monster-invasion.png`,
  teamHunt: `${BASE}images/mode-team-hunt.png`,
  bossraid: `${BASE}images/mode-showdown.png`,
  training: `${BASE}images/mode-showdown.png`,
  ranked: `${BASE}images/mode-ranked-battle.png`,
};

export function getModeIconUrl(mode: string): string {
  return MODE_ICON_IMAGES[mode] ?? `${BASE}images/mode-showdown.png`;
}

export function brawlerAvatarUrl(brawlerId: string): string {
  return `${BASE}brawlers/avatars/${brawlerId}.png`;
}
