import type { SocialPresence } from "../social/presence";

export type RemotePresenceEntry = SocialPresence & {
  playerId: string;
  username?: string;
  partyCode?: string | null;
  brawlerId?: string;
  profileIconId?: string;
  trophies?: number;
};

const ONLINE_MS = 5 * 60 * 1000;
const remoteById = new Map<string, RemotePresenceEntry>();

export function setRemotePresenceEntry(playerId: string, entry: RemotePresenceEntry): void {
  remoteById.set(playerId, entry);
}

export function getRemotePresenceEntry(playerId: string): RemotePresenceEntry | null {
  const entry = remoteById.get(playerId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ONLINE_MS) {
    remoteById.delete(playerId);
    return null;
  }
  return entry;
}

export function getRemotePartyCodeForPlayer(playerId: string): string | null {
  const entry = getRemotePresenceEntry(playerId);
  const code = entry?.partyCode;
  return code ? String(code).toUpperCase() : null;
}

export function clearRemotePresenceCache(): void {
  remoteById.clear();
}
