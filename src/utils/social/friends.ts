import {
  getCurrentProfile,
  getCurrentUsername,
  updateProfile,
  findProfileStorageKeyByPlayerId,
} from "../localStorageAPI";
import { getProfileByPlayerId } from "../playerGiftSend";
import { initFriendshipBondOnAdd } from "./friendship";
import { isValidPlayerIdFormat, normalizePlayerIdQuery } from "../playerId";
import { getPresenceForPlayerId, formatLastSeen } from "./presence";
import { getRemotePresenceEntry } from "../cloud/remotePresenceCache";
import { translate as t } from "../../i18n";
import { lookupCloudPlayerPublic } from "../cloud/profileCloud";
import { cacheKnownPlayerStub } from "../knownPlayers";

export interface FriendEntry {
  playerId: string;
  username: string;
  addedAt: number;
}

export const FRIENDS_CHANGED_EVENT = "clash_friends_changed";

function emitFriendsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FRIENDS_CHANGED_EVENT));
  }
}

export function getFriendsList(): FriendEntry[] {
  const p = getCurrentProfile();
  return (p as any)?.friends ?? [];
}

export function addFriendByPlayerId(playerIdInput: string): { success: boolean; error?: string } {
  const me = getCurrentProfile();
  if (!me?.playerId) return { success: false, error: t("friends.error.unauthorized") };

  const idNorm = normalizePlayerIdQuery(playerIdInput);
  if (!isValidPlayerIdFormat(idNorm)) {
    return { success: false, error: t("friends.error.invalidId") };
  }

  if (normalizePlayerIdQuery(me.playerId) === idNorm) {
    return { success: false, error: t("friends.error.self") };
  }

  const target = getProfileByPlayerId(idNorm);
  if (!target) {
    return { success: false, error: t("friends.error.notFound") };
  }

  return addFriendEntry(idNorm, target.username);
}

export async function addFriendByPlayerIdAsync(
  playerIdInput: string,
): Promise<{ success: boolean; error?: string }> {
  const me = getCurrentProfile();
  if (!me?.playerId) return { success: false, error: t("friends.error.unauthorized") };

  const idNorm = normalizePlayerIdQuery(playerIdInput);
  if (!isValidPlayerIdFormat(idNorm)) {
    return { success: false, error: t("friends.error.invalidId") };
  }

  if (normalizePlayerIdQuery(me.playerId) === idNorm) {
    return { success: false, error: t("friends.error.self") };
  }

  let target = getProfileByPlayerId(idNorm);
  if (!target) {
    const remote = getRemotePresenceEntry(idNorm);
    if (remote?.username) {
      cacheKnownPlayerStub({
        playerId: idNorm,
        username: remote.username,
        selectedBrawlerId: remote.brawlerId,
        profileIconId: remote.profileIconId,
        trophies: remote.trophies,
      });
      target = getProfileByPlayerId(idNorm);
    }
  }

  if (!target) {
    const cloud = await lookupCloudPlayerPublic(idNorm);
    if (!cloud) return { success: false, error: t("friends.error.notFound") };
    cacheKnownPlayerStub({
      playerId: cloud.playerId,
      username: cloud.username,
      selectedBrawlerId: cloud.selectedBrawlerId,
      profileIconId: cloud.profileIconId,
      trophies: cloud.trophies,
    });
    target = getProfileByPlayerId(idNorm);
  }

  if (!target) return { success: false, error: t("friends.error.notFound") };
  return addFriendEntry(idNorm, target.username);
}

function addFriendEntry(idNorm: string, username: string): { success: boolean; error?: string } {
  const list = getFriendsList();
  if (list.some(f => normalizePlayerIdQuery(f.playerId) === idNorm)) {
    return { success: false, error: t("friends.error.alreadyAdded") };
  }

  const entry: FriendEntry = {
    playerId: idNorm,
    username,
    addedAt: Date.now(),
  };
  updateProfile({ friends: [...list, entry] } as any);
  initFriendshipBondOnAdd(idNorm);
  emitFriendsChanged();
  return { success: true };
}

export function removeFriend(playerId: string): void {
  const idNorm = normalizePlayerIdQuery(playerId);
  const list = getFriendsList().filter(
    f => normalizePlayerIdQuery(f.playerId) !== idNorm,
  );
  updateProfile({ friends: list } as any);
  emitFriendsChanged();
}

export interface FriendRow {
  entry: FriendEntry;
  online: boolean;
  statusText: string;
  screen: ReturnType<typeof getPresenceForPlayerId>["screen"];
  profileIconId?: string;
  brawlerId: string;
  trophies: number;
}

export function getFriendRows(): FriendRow[] {
  return getFriendsList().map(entry => {
    const pr = getPresenceForPlayerId(entry.playerId);
    const prof = getProfileByPlayerId(entry.playerId);
    const remote = getRemotePresenceEntry(entry.playerId);
    return {
      entry,
      online: pr.online,
      screen: pr.screen,
      statusText: formatLastSeen(pr.updatedAt, pr.online),
      profileIconId: prof?.profileIconId ?? remote?.profileIconId,
      brawlerId: prof?.selectedBrawlerId || prof?.favoriteBrawlerId || remote?.brawlerId || "miya",
      trophies: prof?.trophies ?? remote?.trophies ?? 0,
    };
  });
}

export function isFriend(playerId: string): boolean {
  const idNorm = normalizePlayerIdQuery(playerId);
  return getFriendsList().some(f => normalizePlayerIdQuery(f.playerId) === idNorm);
}

export function refreshFriendUsername(playerId: string): void {
  const target = getProfileByPlayerId(playerId);
  if (!target) return;
  const idNorm = normalizePlayerIdQuery(playerId);
  const list = getFriendsList().map(f =>
    normalizePlayerIdQuery(f.playerId) === idNorm
      ? { ...f, username: target.username }
      : f,
  );
  updateProfile({ friends: list } as any);
}
