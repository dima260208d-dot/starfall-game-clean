import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import {
  getAllProfiles,
  getCurrentProfile,
  getCurrentUsername,
  isGuestProfile,
  normalizeProfile,
  saveProfiles,
  setCurrentUsername,
  findLocalProfileKeyForCloudAccount,
  findProfileStorageKeyByEmail,
  findProfileStorageKeyByPlayerId,
  type BattleRecord,
  type UserProfile,
} from "../localStorageAPI";
import { normalizePlayerIdQuery } from "../playerId";
import { tryCloudTimeout } from "./cloudFetch";
import { fetchAccountByLogin } from "./accountCloud";
import { mergeStarGuardianState, normalizeStarGuardianState } from "../subscription";

export const PROFILE_CLOUD_CHANGED = "clash-profile-cloud-changed";
export const PROFILE_CLOUD_SCHEMA = 2;

type CloudProfileRow = {
  player_id: string;
  username: string;
  profile_data: Record<string, unknown>;
  updated_at: string;
};

const CLOUD_OMIT_KEYS = new Set<string>([
  "passwordHash",
  "socialPresence",
]);

const CLOUD_MERGE_NEVER_OVERWRITE = new Set<string>([
  "passwordHash",
  "username",
  "socialPresence",
]);

const MAX_BATTLE_HISTORY = 50;
const MAX_PAYLOAD_BYTES = 1_400_000;
const PUSH_DEBOUNCE_MS = 400;
const AUTO_SYNC_INTERVAL_MS = 1000;
const AUTO_SYNC_STALE_MS = 2500;
const ACCOUNT_META_SYNC_MS = 30_000;
const PUSH_MAX_ATTEMPTS = 3;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncTimer: ReturnType<typeof setInterval> | null = null;
let suppressPush = false;
let pushInFlight: Promise<boolean> | null = null;
let pushQueued = false;
let lastPushError: string | null = null;
let lastPushOkAt = 0;
let lastAccountMetaSyncAt = 0;
let profileCloudListenersInit = false;
let reconcileInFlight: Promise<boolean> | null = null;

function emitProfileCloudChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILE_CLOUD_CHANGED));
  }
}

export function getProfileCloudLastError(): string | null {
  return lastPushError;
}

export function isProfileCloudReady(): boolean {
  return isRegisteredProfileForCloudSync();
}

/** Зарегистрированный аккаунт (не гость) с playerId — только такие пишут в облако. */
export function isRegisteredProfileForCloudSync(): boolean {
  if (!isSupabaseConfigured()) return false;
  const profile = getCurrentProfile();
  const username = getCurrentUsername();
  if (!profile?.playerId || !username) return false;
  if (isGuestProfile(profile)) return false;
  if (!profile.passwordHash) return false;
  return true;
}

export type ProfileCloudSyncStatus = {
  active: boolean;
  lastOkAt: number;
  error: string | null;
  pending: boolean;
};

export function getProfileCloudSyncStatus(): ProfileCloudSyncStatus {
  return {
    active: isRegisteredProfileForCloudSync() && autoSyncTimer !== null,
    lastOkAt: lastPushOkAt,
    error: lastPushError,
    pending: pushTimer !== null || pushInFlight !== null || pushQueued,
  };
}

function startAutoCloudSyncLoop(): void {
  if (autoSyncTimer) return;
  if (!isRegisteredProfileForCloudSync()) return;

  autoSyncTimer = setInterval(() => {
    if (!isRegisteredProfileForCloudSync()) {
      stopAutoCloudSyncLoop();
      return;
    }

    const profile = getCurrentProfile();
    if (!profile) return;

    const now = Date.now();
    const needsPush = hasUnsyncedLocalChanges(profile);
    const stale = now - lastPushOkAt > AUTO_SYNC_STALE_MS;

    if (needsPush || stale) {
      void pushCurrentProfileToCloud();
    }

    if (now - lastAccountMetaSyncAt > ACCOUNT_META_SYNC_MS) {
      lastAccountMetaSyncAt = now;
      void import("./accountCloud").then(({ syncCurrentAccountToCloud }) => syncCurrentAccountToCloud());
    }
  }, AUTO_SYNC_INTERVAL_MS);

  console.info("[profileCloud] auto-sync started (every", AUTO_SYNC_INTERVAL_MS, "ms)");
}

function stopAutoCloudSyncLoop(): void {
  if (!autoSyncTimer) return;
  clearInterval(autoSyncTimer);
  autoSyncTimer = null;
}

export function ensureAutoCloudSyncRunning(): void {
  if (isRegisteredProfileForCloudSync()) {
    startAutoCloudSyncLoop();
    void reconcileProfileWithCloudAccount().finally(() => pushCurrentProfileToCloud());
  }
}

/** Привязать локальный профиль к облачному аккаунту (playerId / email). */
export async function reconcileProfileWithCloudAccount(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (reconcileInFlight) return reconcileInFlight;

  const username = getCurrentUsername();
  const profile = getCurrentProfile();
  if (!username || !profile || isGuestProfile(profile) || !profile.passwordHash) {
    return false;
  }

  reconcileInFlight = (async () => {
    const login = profile.email?.trim() || username;
    const account = await fetchAccountByLogin(login);
    if (!account) {
      console.warn("[profileCloud] no cloud account for", login);
      return false;
    }

    const cloudId = normalizePlayerIdQuery(account.player_id);
    const localId = profile.playerId ? normalizePlayerIdQuery(profile.playerId) : "";
    const profiles = getAllProfiles();
    let updated = profiles[username] ?? profile;
    let changed = false;

    if (localId && localId !== cloudId) {
      console.warn("[profileCloud] playerId mismatch — fixing", localId, "→", cloudId);
      updated = { ...updated, playerId: cloudId };
      changed = true;
    } else if (!localId) {
      updated = { ...updated, playerId: cloudId };
      changed = true;
    }

    const cloudEmail = account.email?.trim().toLowerCase();
    if (cloudEmail && updated.email?.trim().toLowerCase() !== cloudEmail) {
      updated = { ...updated, email: account.email ?? updated.email };
      changed = true;
    }

    if (changed) {
      profiles[username] = normalizeProfile(updated);
      withSuppressPush(() => saveProfiles(profiles));
      console.info("[profileCloud] linked local profile to cloud account", cloudId);
    }

    return changed;
  })().finally(() => {
    reconcileInFlight = null;
  });

  return reconcileInFlight;
}

function withSuppressPush(fn: () => void): void {
  suppressPush = true;
  try {
    fn();
  } finally {
    suppressPush = false;
  }
}

function truncateBattleHistory(history: BattleRecord[] | undefined): BattleRecord[] | undefined {
  if (!history?.length || history.length <= MAX_BATTLE_HISTORY) return history;
  return history.slice(-MAX_BATTLE_HISTORY);
}

function shrinkPayloadForCloud(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  let size = JSON.stringify(out).length;
  if (size <= MAX_PAYLOAD_BYTES) return out;

  if (Array.isArray(out.battleHistory)) {
    out.battleHistory = (out.battleHistory as BattleRecord[]).slice(-50);
    size = JSON.stringify(out).length;
  }
  if (size > MAX_PAYLOAD_BYTES) {
    delete out.battleHistory;
    size = JSON.stringify(out).length;
  }
  if (size > MAX_PAYLOAD_BYTES && Array.isArray(out.inbox)) {
    out.inbox = (out.inbox as unknown[]).slice(-30);
    size = JSON.stringify(out).length;
  }
  if (size > MAX_PAYLOAD_BYTES) {
    delete out.inbox;
    delete out.purchaseHistory;
    size = JSON.stringify(out).length;
  }

  return out;
}

export function packProfileForCloud(profile: UserProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {
    cloudSchema: PROFILE_CLOUD_SCHEMA,
  };

  for (const [key, value] of Object.entries(profile) as [keyof UserProfile, unknown][]) {
    if (CLOUD_OMIT_KEYS.has(key)) continue;
    if (value === undefined) continue;

    if (key === "battleHistory" && Array.isArray(value)) {
      out.battleHistory = truncateBattleHistory(value as BattleRecord[]);
      continue;
    }

    try {
      out[key] = JSON.parse(JSON.stringify(value));
    } catch {
      // skip non-serializable values
    }
  }

  return shrinkPayloadForCloud(out);
}

function buildCloudPatch(cloud: Record<string, unknown>): Partial<UserProfile> {
  const patch: Partial<UserProfile> = {};
  for (const [key, value] of Object.entries(cloud)) {
    if (key === "cloudSchema") continue;
    if (CLOUD_MERGE_NEVER_OVERWRITE.has(key)) continue;
    if (value === undefined) continue;
    (patch as Record<string, unknown>)[key] = value;
  }
  return patch;
}

function localProfileRevision(profile: UserProfile): number {
  return profile.profileLocalRev ?? profile.createdAt ?? 0;
}

function hasUnsyncedLocalChanges(profile: UserProfile): boolean {
  const synced = profile.cloudSyncedAt ?? 0;
  return localProfileRevision(profile) > synced;
}

/** Оценка «богатства» прогресса — для выбора push vs pull. */
export function profileProgressScore(data: Partial<UserProfile> | Record<string, unknown>): number {
  const coins = Number((data as UserProfile).coins ?? 0);
  const gems = Number((data as UserProfile).gems ?? 0);
  const trophies = Number((data as UserProfile).trophies ?? 0);
  const games = Number((data as UserProfile).totalGamesPlayed ?? 0);
  const brawlers = Array.isArray((data as UserProfile).unlockedBrawlers)
    ? (data as UserProfile).unlockedBrawlers!.length
    : 0;
  const power = Number((data as UserProfile).powerPoints ?? 0);
  const pins = Array.isArray((data as UserProfile).ownedPins)
    ? (data as UserProfile).ownedPins!.length
    : 0;
  return (
    trophies * 100 +
    games * 50 +
    brawlers * 200 +
    Math.floor(coins / 10) +
    gems * 5 +
    power * 2 +
    pins * 30
  );
}

async function fetchCloudProfileRow(playerId: string): Promise<CloudProfileRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = normalizePlayerIdQuery(playerId);
  const result = await tryCloudTimeout(
    sb.from("player_profiles").select("*").eq("player_id", id).maybeSingle(),
    15_000,
    "profile fetch",
  );
  if (!result.ok || result.value.error) return null;
  return (result.value.data as CloudProfileRow | null) ?? null;
}

/** Публичные данные игрока из облака (для добавления в друзья с другого устройства). */
export async function lookupCloudPlayerPublic(playerId: string): Promise<{
  playerId: string;
  username: string;
  profileIconId?: string;
  selectedBrawlerId?: string;
  trophies?: number;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const row = await fetchCloudProfileRow(playerId);
  if (!row) return null;

  const data = row.profile_data ?? {};
  const username = String(row.username || data.username || playerId);
  return {
    playerId: normalizePlayerIdQuery(row.player_id),
    username,
    profileIconId: typeof data.profileIconId === "string" ? data.profileIconId : undefined,
    selectedBrawlerId: typeof data.selectedBrawlerId === "string"
      ? data.selectedBrawlerId
      : typeof data.favoriteBrawlerId === "string"
        ? data.favoriteBrawlerId
        : "hana",
    trophies: typeof data.trophies === "number" ? data.trophies : 0,
  };
}

export function scheduleProfileCloudPush(): void {
  if (!isSupabaseConfigured()) return;
  if (suppressPush) return;
  if (!isRegisteredProfileForCloudSync()) return;

  if (pushInFlight) {
    pushQueued = true;
    return;
  }

  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushCurrentProfileToCloud();
  }, PUSH_DEBOUNCE_MS);
}

export async function pushCurrentProfileToCloud(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    lastPushError = "Supabase not configured — restart dev server after .env.local";
    return false;
  }
  if (!isRegisteredProfileForCloudSync()) {
    return false;
  }
  if (pushInFlight) {
    pushQueued = true;
    return pushInFlight;
  }

  const username = getCurrentUsername();
  if (!username) {
    lastPushError = "Not logged in";
    return false;
  }

  const profiles = getAllProfiles();
  const profile = profiles[username];
  if (!profile?.playerId) {
    lastPushError = "No playerId on profile";
    console.warn("[profileCloud]", lastPushError);
    return false;
  }

  const playerId = normalizePlayerIdQuery(profile.playerId);
  const syncedAt = Date.now();

  pushInFlight = (async () => {
    for (let attempt = 1; attempt <= PUSH_MAX_ATTEMPTS; attempt++) {
      try {
        await reconcileProfileWithCloudAccount();

        const freshUsername = getCurrentUsername();
        const freshProfiles = getAllProfiles();
        const freshProfile = freshUsername ? freshProfiles[freshUsername] : null;
        if (!freshUsername || !freshProfile?.playerId) {
          lastPushError = "Profile not found during push";
          return false;
        }

        const sb = getSupabase();
        if (!sb) return false;

        const activePlayerId = normalizePlayerIdQuery(freshProfile.playerId);
        const payload = {
          ...packProfileForCloud(freshProfile),
          cloudSyncedAt: syncedAt,
        };

        const jsonSize = JSON.stringify(payload).length;
        if (jsonSize > MAX_PAYLOAD_BYTES) {
          lastPushError = `Profile too large (${Math.round(jsonSize / 1024)} KB)`;
          console.error("[profileCloud]", lastPushError);
          return false;
        }

        const result = await tryCloudTimeout(
          sb
            .from("player_profiles")
            .upsert(
              {
                player_id: activePlayerId,
                username: freshUsername,
                profile_data: payload,
                updated_at: new Date(syncedAt).toISOString(),
              },
              { onConflict: "player_id" },
            ),
          30_000,
          "profile upsert",
        );

        if (!result.ok) {
          lastPushError = result.error;
          console.warn("[profileCloud] push failed (attempt", attempt, "):", result.error);
          if (attempt < PUSH_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
            continue;
          }
          return false;
        }

        const { error } = result.value;
        if (error) {
          lastPushError = error.message;
          console.error("[profileCloud] push failed (attempt", attempt, "):", error.message, error);
          if (attempt < PUSH_MAX_ATTEMPTS) {
            await new Promise((r) => setTimeout(r, 800 * attempt));
            continue;
          }
          return false;
        }

        lastPushError = null;
        lastPushOkAt = syncedAt;
        console.info(
          "[profileCloud] saved",
          activePlayerId,
          `(${Math.round(jsonSize / 1024)} KB)`,
          `score=${profileProgressScore(freshProfile)}`,
        );

        const local = freshProfiles[freshUsername];
        if (local) {
          freshProfiles[freshUsername] = {
            ...local,
            cloudSyncedAt: syncedAt,
            profileLocalRev: localProfileRevision(local),
          };
          withSuppressPush(() => saveProfiles(freshProfiles));
        }

        void import("./accountCloud").then(({ syncCurrentAccountToCloud }) => syncCurrentAccountToCloud());
        emitProfileCloudChanged();
        return true;
      } catch (e) {
        lastPushError = e instanceof Error ? e.message : "Cloud sync failed";
        console.warn("[profileCloud] push error (attempt", attempt, "):", lastPushError);
        if (attempt < PUSH_MAX_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        return false;
      }
    }
    return false;
  })().finally(() => {
    pushInFlight = null;
    if (pushQueued) {
      pushQueued = false;
      void pushCurrentProfileToCloud();
    }
  });

  return pushInFlight;
}

export async function pullAndMergeProfileFromCloud(force = false): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const profile = getCurrentProfile();
  const username = getCurrentUsername();
  if (!profile?.playerId || !username) return false;

  if (!force && hasUnsyncedLocalChanges(profile)) {
    return false;
  }

  const playerId = normalizePlayerIdQuery(profile.playerId);
  const row = await fetchCloudProfileRow(playerId);

  if (!row) return false;

  const cloudTime = new Date(row.updated_at).getTime();
  const localSynced = profile.cloudSyncedAt ?? 0;

  if (!force && cloudTime <= localSynced) return false;

  const cloudProfile = row.profile_data ?? {};
  const cloudSyncedAt = typeof cloudProfile.cloudSyncedAt === "number"
    ? cloudProfile.cloudSyncedAt
    : cloudTime;

  const profiles = getAllProfiles();
  const local = profiles[username];
  if (!local) return false;

  const { passwordHash, username: localUsername } = local;
  const patch = buildCloudPatch(cloudProfile);

  const mergedStarGuardian = mergeStarGuardianState(
    normalizeStarGuardianState(local.starGuardian),
    normalizeStarGuardianState(patch.starGuardian),
  );

  const merged = normalizeProfile({
    ...local,
    ...patch,
    starGuardian: mergedStarGuardian,
    passwordHash,
    username: localUsername,
    cloudSyncedAt: Math.max(cloudSyncedAt, cloudTime),
    profileLocalRev: Math.max(localProfileRevision(local), cloudTime),
  });

  withSuppressPush(() => {
    profiles[username] = merged;
    saveProfiles(profiles);
  });

  emitProfileCloudChanged();
  console.info(
    "[profileCloud] pulled from cloud",
    playerId,
    `(score ${profileProgressScore(merged)})`,
    force ? "forced" : "",
  );
  return true;
}

export async function syncProfileWithCloud(): Promise<void> {
  try {
    if (!isProfileCloudReady()) {
      console.warn("[profileCloud] sync skipped — login with playerId required");
      return;
    }

    const profile = getCurrentProfile()!;
    const playerId = normalizePlayerIdQuery(profile.playerId!);
    const row = await fetchCloudProfileRow(playerId);
    const localScore = profileProgressScore(profile);
    const cloudScore = row ? profileProgressScore(row.profile_data ?? {}) : 0;

    const { syncCurrentAccountToCloud } = await import("./accountCloud");

    // Облако богаче — подтягиваем (вход с другого устройства).
    if (row && cloudScore > localScore + 20) {
      await pullAndMergeProfileFromCloud(true);
      await syncCurrentAccountToCloud();
      return;
    }

    // Локальный прогресс богаче — отправляем в облако (основной ПК).
    if (localScore > cloudScore + 20 || hasUnsyncedLocalChanges(profile)) {
      const ok = await pushCurrentProfileToCloud();
      if (!ok) {
        console.warn("[profileCloud] sync failed:", getProfileCloudLastError() ?? "unknown");
      } else {
        console.info("[profileCloud] pushed richer local profile", `(score ${localScore} vs cloud ${cloudScore})`);
      }
      await syncCurrentAccountToCloud();
      return;
    }

    await pullAndMergeProfileFromCloud(false);
    await pushCurrentProfileToCloud();
    await syncCurrentAccountToCloud();
  } catch (e) {
    console.warn("[profileCloud] sync error:", e instanceof Error ? e.message : e);
  }
}

export async function restoreProfileFromCloudForLogin(input: {
  playerId: string;
  username: string;
  email: string | null;
  passwordHash: string;
}): Promise<boolean> {
  const playerId = normalizePlayerIdQuery(input.playerId);
  const row = await fetchCloudProfileRow(playerId);

  const cloudProfile = row?.profile_data ?? {};
  const cloudTime = row ? new Date(row.updated_at).getTime() : 0;
  const cloudSyncedAt = typeof cloudProfile.cloudSyncedAt === "number"
    ? cloudProfile.cloudSyncedAt
    : cloudTime;

  const patch = buildCloudPatch(cloudProfile);
  const now = Date.now();
  const profiles = getAllProfiles();

  const existingKey =
    findProfileStorageKeyByPlayerId(playerId)
    ?? (input.email ? findProfileStorageKeyByEmail(input.email) : null)
    ?? (profiles[input.username] ? input.username : null);

  const existing = existingKey ? profiles[existingKey] : null;
  const cloudScore = profileProgressScore(patch as Partial<UserProfile>);
  const localScore = existing ? profileProgressScore(existing) : 0;

  const storageKey = existingKey ?? input.username;
  const mergedStarGuardian = mergeStarGuardianState(
    normalizeStarGuardianState(existing?.starGuardian),
    normalizeStarGuardianState(patch.starGuardian),
  );

  let merged: UserProfile;
  if (existing && localScore > cloudScore + 10) {
    merged = normalizeProfile({
      ...existing,
      playerId,
      email: input.email ?? existing.email,
      passwordHash: input.passwordHash,
      starGuardian: mergedStarGuardian,
      profileLocalRev: Date.now(),
      cloudSyncedAt: existing.cloudSyncedAt ?? cloudSyncedAt,
    });
    console.info(
      "[profileCloud] kept richer local profile",
      storageKey,
      `local=${localScore} cloud=${cloudScore}`,
    );
  } else {
    merged = normalizeProfile({
      ...patch,
      username: input.username,
      playerId,
      email: input.email ?? undefined,
      passwordHash: input.passwordHash,
      starGuardian: mergedStarGuardian,
      cloudSyncedAt: cloudSyncedAt || now,
      profileLocalRev: cloudSyncedAt || now,
      createdAt: typeof patch.createdAt === "number" ? (patch.createdAt as number) : now,
    } as UserProfile);
    console.info(
      "[profileCloud] restored from cloud",
      playerId,
      input.username,
      `(score ${profileProgressScore(merged)})`,
    );
  }

  withSuppressPush(() => {
    profiles[storageKey] = merged;
    saveProfiles(profiles);
  });

  setCurrentUsername(storageKey);
  emitProfileCloudChanged();

  if (existing && localScore > cloudScore + 10) {
    void uploadLocalProgressToCloud();
  }

  return true;
}

export function importProfileBackupFromJson(jsonText: string): {
  success: boolean;
  error?: string;
  username?: string;
} {
  try {
    const parsed = JSON.parse(jsonText) as Record<string, UserProfile>;
    if (!parsed || typeof parsed !== "object") {
      return { success: false, error: "Неверный формат файла" };
    }

    const profiles = getAllProfiles();
    let bestKey: string | null = null;
    let bestScore = -1;

    for (const [key, raw] of Object.entries(parsed)) {
      if (!raw || typeof raw !== "object") continue;
      const merged = normalizeProfile({ ...raw, username: key } as UserProfile);
      profiles[key] = merged;
      const score = profileProgressScore(merged);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }

    if (!bestKey) {
      return { success: false, error: "В файле нет профилей" };
    }

    withSuppressPush(() => saveProfiles(profiles));
    setCurrentUsername(bestKey);
    emitProfileCloudChanged();
    return { success: true, username: bestKey };
  } catch {
    return { success: false, error: "Не удалось прочитать файл" };
  }
}

export async function forceProfileCloudSync(): Promise<boolean> {
  const r = await uploadLocalProgressToCloud();
  return r.success;
}

/** Сохранить текущий локальный прогресс в облако (без pull). */
export async function uploadLocalProgressToCloud(): Promise<{
  success: boolean;
  error?: string;
  score?: number;
  kb?: number;
}> {
  if (!isProfileCloudReady()) {
    return { success: false, error: "Войдите в аккаунт с playerId" };
  }
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Облако не подключено — перезапустите npm run dev" };
  }

  const username = getCurrentUsername();
  const profile = getCurrentProfile();
  if (!username || !profile?.playerId) {
    return { success: false, error: "Профиль не найден" };
  }

  const score = profileProgressScore(profile);
  const looksEmpty = score < 80 && (profile.totalGamesPlayed ?? 0) < 2;

  const profiles = getAllProfiles();
  profiles[username] = {
    ...profile,
    profileLocalRev: Date.now(),
  };
  withSuppressPush(() => saveProfiles(profiles));

  const ok = await pushCurrentProfileToCloud();
  const { syncCurrentAccountToCloud } = await import("./accountCloud");
  await syncCurrentAccountToCloud();

  if (!ok) {
    return {
      success: false,
      error: getProfileCloudLastError() ?? "Не удалось сохранить",
      score,
    };
  }

  const kb = Math.round(JSON.stringify(packProfileForCloud(profiles[username])).length / 1024);
  console.info("[profileCloud] manual upload ok", username, `score=${score}`, `${kb}KB`);

  if (looksEmpty) {
    return {
      success: true,
      score,
      kb,
      error: "Сохранено, но профиль выглядит почти пустым — убедитесь, что это браузер с вашим прогрессом",
    };
  }

  return { success: true, score, kb };
}

export function downloadProfileBackupFile(): boolean {
  try {
    const raw = localStorage.getItem("clashArena_profiles") ?? "{}";
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `starfall-profile-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

export function initProfileCloudListeners(): void {
  if (typeof window === "undefined" || profileCloudListenersInit) return;
  profileCloudListenersInit = true;

  window.addEventListener("clash-profile-local-changed", () => {
    scheduleProfileCloudPush();
    if (isRegisteredProfileForCloudSync()) {
      startAutoCloudSyncLoop();
    }
  });

  window.addEventListener(PROFILE_CLOUD_CHANGED, () => {
    if (isRegisteredProfileForCloudSync()) {
      startAutoCloudSyncLoop();
      scheduleProfileCloudPush();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isRegisteredProfileForCloudSync()) {
      void reconcileProfileWithCloudAccount().finally(() => {
        void pushCurrentProfileToCloud();
        void syncProfileWithCloud();
      });
    }
  });

  if (isSupabaseConfigured()) {
    console.info("[profileCloud] enabled — auto full-account sync v", PROFILE_CLOUD_SCHEMA);
    ensureAutoCloudSyncRunning();
  } else {
    console.warn(
      "[profileCloud] disabled — add VITE_SUPABASE_* to .env.local or public/cloud-config.json, then restart",
    );
  }

  (window as unknown as { __forceCloudSync?: () => Promise<boolean>; __uploadProgress?: () => ReturnType<typeof uploadLocalProgressToCloud>; __cloudSyncStatus?: () => ProfileCloudSyncStatus }).__forceCloudSync =
    forceProfileCloudSync;
  (window as unknown as { __uploadProgress?: () => ReturnType<typeof uploadLocalProgressToCloud> }).__uploadProgress =
    uploadLocalProgressToCloud;
  (window as unknown as { __cloudSyncStatus?: () => ProfileCloudSyncStatus }).__cloudSyncStatus =
    getProfileCloudSyncStatus;
}

if (typeof window !== "undefined") {
  // Fallback if module imported before initProfileCloudListeners (tests / HMR).
  queueMicrotask(() => initProfileCloudListeners());
}
