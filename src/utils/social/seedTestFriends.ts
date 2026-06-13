/**
 * Тестовые друзья для локальной отладки соц. функций (меню, сеть, команда).
 * Идемпотентно: повторный вызов не дублирует записи.
 */
import {
  getAllProfiles,
  getCurrentProfile,
  getCurrentUsername,
  saveProfiles,
  normalizeProfile,
  type UserProfile,
} from "../localStorageAPI";
import { collectUsedPlayerIds } from "../playerId";
import type { FriendEntry } from "./friends";
import type { PresenceScreen } from "./presence";
import { FRIENDS_CHANGED_EVENT } from "./friends";

const SEED_FLAG = "clash_test_friends_seeded_v4";
const DEMO_INCOMING_KEY = "clash_demo_incoming_invite_v1";

export interface TestFriendSpec {
  username: string;
  playerId: string;
  brawlerId: string;
  presence: Exclude<PresenceScreen, "offline">;
  /** Режим боя (для иконки и симуляции наблюдения). */
  battleMode?: string;
  /** Показывать в панели «+» как в сети */
  onlineInPartyPanel: boolean;
  autoAcceptParty: boolean;
  trophies: number;
}

/** ID: 2 цифры + 10 букв = 12 символов (валидный формат игры). */
export const TEST_FRIEND_SPECS: TestFriendSpec[] = [
  { username: "Test_Yuki", playerId: "01YUKIFROSTX", brawlerId: "yuki", presence: "menu", onlineInPartyPanel: true, autoAcceptParty: true, trophies: 4200 },
  { username: "Test_Ronin", playerId: "02RONINBLADE", brawlerId: "ronin", presence: "battle", battleMode: "gemgrab", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 3100 },
  { username: "Test_Miya", playerId: "03MIYASTORMX", brawlerId: "miya", presence: "results", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 5500 },
  { username: "Test_Hana", playerId: "04HANABLOOMX", brawlerId: "hana", presence: "menu", onlineInPartyPanel: true, autoAcceptParty: true, trophies: 1800 },
  { username: "Test_Goro", playerId: "05GOROCRUSHX", brawlerId: "goro", presence: "battle", battleMode: "showdown", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 2900 },
  { username: "Test_Sora", playerId: "06SORALIGHTX", brawlerId: "sora", presence: "menu", onlineInPartyPanel: true, autoAcceptParty: true, trophies: 1200 },
  { username: "Test_Kenji", playerId: "07KENJISTELX", brawlerId: "kenji", presence: "battle", battleMode: "heist", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 6400 },
  { username: "Test_Rin", playerId: "08RINSHADOWX", brawlerId: "rin", presence: "results", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 3700 },
  { username: "Test_Taro", playerId: "09TAROFLAMEX", brawlerId: "taro", presence: "menu", onlineInPartyPanel: true, autoAcceptParty: true, trophies: 2100 },
  { username: "Test_Zafkiel", playerId: "10ZAFKIELAXX", brawlerId: "zafkiel", presence: "battle", battleMode: "starstrike", onlineInPartyPanel: true, autoAcceptParty: false, trophies: 8100 },
];

const MIGRATION_V4_KEY = "clash_test_friends_v4_migrated";

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return String(h);
}

function upsertTestProfile(all: Record<string, UserProfile>, spec: TestFriendSpec, usedIds: Set<string>): void {
  usedIds.add(spec.playerId);
  const now = Date.now();
  const existing = all[spec.username];
  const base: UserProfile = existing
    ? normalizeProfile(existing)
    : normalizeProfile({
        username: spec.username,
        playerId: spec.playerId,
        passwordHash: simpleHash("test"),
        createdAt: now,
      } as UserProfile);

  const power = Math.min(11, Math.max(1, Math.floor(spec.trophies / 450) + 1));
  all[spec.username] = {
    ...base,
    playerId: spec.playerId,
    username: spec.username,
    selectedBrawlerId: spec.brawlerId,
    favoriteBrawlerId: spec.brawlerId,
    trophies: spec.trophies,
    unlockedBrawlers: Array.from(new Set([...(base.unlockedBrawlers || []), spec.brawlerId, "hana"])),
    brawlerTrophies: { ...(base.brawlerTrophies || {}), [spec.brawlerId]: spec.trophies },
    brawlerLevels: { ...(base.brawlerLevels || {}), [spec.brawlerId]: power },
    brawlerStars: {
      ...(base.brawlerStars || {}),
      [spec.brawlerId]: Array.from({ length: Math.min(6, Math.floor(spec.trophies / 900)) }, (_, i) => i + 1),
    },
    socialPresence: {
      screen: spec.presence,
      updatedAt: now,
      menuActivity: spec.presence === "menu" ? null : null,
      battleMode: spec.presence === "battle" ? (spec.battleMode ?? "gemgrab") : undefined,
      battleSessionId: spec.presence === "battle" ? `${spec.playerId}-bot` : undefined,
    },
    socialTestAutoAcceptParty: spec.autoAcceptParty,
    partyCode: null,
    partyInviteIncoming: undefined,
    outgoingPartyInvite: undefined,
  } as UserProfile;
}

/** Создаёт 10 тест-аккаунтов и добавляет их в друзья текущего игрока. */
export function seedTestFriendsForCurrentUser(): { added: number; total: number } {
  const meKey = getCurrentUsername();
  const me = getCurrentProfile();
  if (!meKey || !me) return { added: 0, total: 0 };

  const all = getAllProfiles();
  const usedIds = collectUsedPlayerIds(all);

  for (const spec of TEST_FRIEND_SPECS) {
    upsertTestProfile(all, spec, usedIds);
  }

  const stamp = Date.now();
  const friends: FriendEntry[] = TEST_FRIEND_SPECS.map(spec => ({
    playerId: spec.playerId,
    username: spec.username,
    addedAt: stamp,
  }));

  all[meKey] = {
    ...all[meKey],
    friends,
  } as UserProfile;

  saveProfiles(all);

  try {
    localStorage.setItem(SEED_FLAG, "1");
  } catch { /* ignore */ }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FRIENDS_CHANGED_EVENT));
  }

  return { added: friends.length, total: TEST_FRIEND_SPECS.length };
}

/** Продлевает «в сети» у всех тест-друзей (для панели «+»). */
export function refreshTestFriendsPresence(): void {
  const all = getAllProfiles();
  const now = Date.now();
  let changed = false;
  for (const spec of TEST_FRIEND_SPECS) {
    const p = all[spec.username];
    if (!p) continue;
    const prevPresence = p.socialPresence;
    const keepActivity =
      spec.presence === "menu" && prevPresence?.screen === "menu"
        ? prevPresence.menuActivity ?? null
        : null;
    all[spec.username] = {
      ...p,
      playerId: spec.playerId,
      socialPresence: {
        screen: spec.presence,
        updatedAt: now,
        menuActivity: spec.presence === "menu" ? keepActivity : null,
        battleMode: spec.presence === "battle" ? (spec.battleMode ?? "gemgrab") : undefined,
        battleSessionId: spec.presence === "battle" ? `${spec.playerId}-bot` : undefined,
      },
      socialTestAutoAcceptParty: spec.autoAcceptParty,
    } as UserProfile;
    changed = true;
  }
  if (changed) saveProfiles(all);
}

function clearOldSeedFlags(): void {
  try {
    localStorage.removeItem("clash_test_friends_seeded_v1");
    localStorage.removeItem("clash_test_friends_seeded_v2");
    localStorage.removeItem("clash_test_friends_seeded_v3");
    localStorage.removeItem(SEED_FLAG);
  } catch { /* ignore */ }
}

export function ensureTestFriendsSeeded(): boolean {
  const meKey = getCurrentUsername();
  if (!meKey) return false;

  const needsV4 = (() => {
    try { return localStorage.getItem(MIGRATION_V4_KEY) !== "1"; } catch { return true; }
  })();

  if (needsV4) {
    clearOldSeedFlags();
    seedTestFriendsForCurrentUser();
    try { localStorage.setItem(MIGRATION_V4_KEY, "1"); } catch { /* ignore */ }
    window.setTimeout(() => maybeOfferDemoIncomingInvite(), 2500);
    return true;
  }

  const flagged = (() => {
    try { return localStorage.getItem(SEED_FLAG) === "1"; } catch { return false; }
  })();

  if (!flagged) {
    seedTestFriendsForCurrentUser();
    window.setTimeout(() => maybeOfferDemoIncomingInvite(), 2500);
    return true;
  }
  refreshTestFriendsPresence();
  return false;
}

export function isTestFriendPlayerId(playerId: string): boolean {
  const q = playerId.toUpperCase();
  return TEST_FRIEND_SPECS.some(s => s.playerId === q);
}

export function getTestFriendSpec(playerId: string): TestFriendSpec | undefined {
  return TEST_FRIEND_SPECS.find(s => s.playerId === playerId.toUpperCase());
}

export function getTestFriendAutoAccept(playerId: string): boolean {
  return getTestFriendSpec(playerId)?.autoAcceptParty ?? false;
}

/** Разовое входящее приглашение от Test_Yuki — чтобы увидеть окно «вступить / отклонить». */
export function maybeOfferDemoIncomingInvite(): void {
  try {
    if (localStorage.getItem(DEMO_INCOMING_KEY) === "1") return;
  } catch { return; }

  const me = getCurrentProfile();
  if (!me?.playerId) return;
  if ((me as UserProfile).partyInviteIncoming) return;
  if ((me as UserProfile).partyCode) return;

  const yuki = TEST_FRIEND_SPECS.find(s => s.username === "Test_Yuki");
  if (!yuki) return;

  const meKey = getCurrentUsername();
  if (!meKey) return;

  const all = getAllProfiles();
  const code = "DEMOYUKI";
  if (!all[yuki.username]) return;

  try {
    const parties = JSON.parse(localStorage.getItem("clash_parties_v1") || "{}") as Record<string, unknown>;
    if (!parties[code]) {
      parties[code] = {
        code,
        leaderPlayerId: yuki.playerId,
        members: [],
        createdAt: Date.now(),
      };
      localStorage.setItem("clash_parties_v1", JSON.stringify(parties));
    }
  } catch { /* ignore */ }

  all[meKey] = {
    ...all[meKey],
    partyInviteIncoming: {
      code,
      fromPlayerId: yuki.playerId,
      fromUsername: yuki.username,
      sentAt: Date.now(),
    },
  };
  saveProfiles(all);

  try {
    localStorage.setItem(DEMO_INCOMING_KEY, "1");
  } catch { /* ignore */ }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("clash_party_changed"));
  }
}
