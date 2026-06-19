import { getSupabase, isSupabaseConfigured } from "../../lib/supabase";
import { tryCloudTimeout } from "./cloudFetch";
import {
  getAllProfiles,
  getCurrentProfile,
  getCurrentUsername,
  hashAccountPassword,
  isGuestProfile,
  type UserProfile,
} from "../localStorageAPI";
import { normalizePlayerIdQuery, isValidPlayerIdFormat } from "../playerId";

export type CloudAccountRow = {
  player_id: string;
  username: string;
  email: string | null;
  password_hash: string;
  account_blocked: boolean;
  updated_at: string;
};

let accountPushTimer: ReturnType<typeof setTimeout> | null = null;
let accountPushInFlight: Promise<boolean> | null = null;
let lastAccountError: string | null = null;
let lastFetchFailed = false;

export function getAccountCloudLastError(): string | null {
  return lastAccountError;
}

function normalizeLoginText(value: string): string {
  return value.trim().normalize("NFC");
}

function loginMatchesUsername(stored: string, input: string): boolean {
  const a = normalizeLoginText(stored);
  const b = normalizeLoginText(input);
  if (a === b) return true;
  return a.toLowerCase() === b.toLowerCase();
}

async function fetchAllAccountsFromCloud(): Promise<CloudAccountRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const result = await tryCloudTimeout(
    sb.from("player_accounts").select("*"),
    20_000,
    "accounts list",
  );

  if (!result.ok) {
    lastAccountError = result.error;
    lastFetchFailed = true;
    console.warn("[accountCloud] list accounts failed:", result.error);
    return [];
  }

  const { data, error } = result.value;
  if (error) {
    lastAccountError = error.message;
    lastFetchFailed = true;
    console.warn("[accountCloud] list accounts failed:", error.message);
    return [];
  }

  lastFetchFailed = false;
  return (data as CloudAccountRow[]) ?? [];
}

function matchAccountInList(accounts: CloudAccountRow[], login: string): CloudAccountRow | null {
  const trimmed = normalizeLoginText(login);
  if (!trimmed) return null;

  const emailNorm = normalizeEmail(trimmed);
  const playerIdNorm = isValidPlayerIdFormat(trimmed)
    ? normalizePlayerIdQuery(trimmed)
    : null;

  for (const row of accounts) {
    if (emailNorm && row.email?.toLowerCase() === emailNorm) return row;
    if (loginMatchesUsername(row.username, trimmed)) return row;
    if (playerIdNorm && normalizePlayerIdQuery(row.player_id) === playerIdNorm) return row;
  }
  return null;
}

function normalizeEmail(email: string | undefined | null): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return trimmed && trimmed.includes("@") ? trimmed : null;
}

function isLoginEmail(login: string): boolean {
  return login.includes("@");
}

export async function fetchAccountByUsername(username: string): Promise<CloudAccountRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const name = normalizeLoginText(username);
  const result = await tryCloudTimeout(
    sb.from("player_accounts").select("*").eq("username", name).maybeSingle(),
    12_000,
    "account fetch username",
  );
  if (!result.ok) {
    lastAccountError = result.error;
    lastFetchFailed = true;
    console.warn("[accountCloud] fetch by username failed:", result.error);
    return null;
  }
  const { data, error } = result.value;
  if (error) {
    lastAccountError = error.message;
    lastFetchFailed = true;
    console.warn("[accountCloud] fetch by username failed:", error.message);
    return null;
  }
  lastFetchFailed = false;
  return (data as CloudAccountRow | null) ?? null;
}

export async function fetchAccountByEmail(email: string): Promise<CloudAccountRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const result = await tryCloudTimeout(
    sb.from("player_accounts").select("*").eq("email", normalized).maybeSingle(),
    10_000,
    "account fetch email",
  );
  if (!result.ok) {
    console.warn("[accountCloud] fetch by email failed:", result.error);
    return null;
  }
  const { data, error } = result.value;
  if (error) {
    console.warn("[accountCloud] fetch by email failed:", error.message);
    return null;
  }
  return (data as CloudAccountRow | null) ?? null;
}

export async function fetchAccountByLogin(login: string): Promise<CloudAccountRow | null> {
  const trimmed = normalizeLoginText(login);
  if (!trimmed) return null;

  if (!isSupabaseConfigured()) {
    lastAccountError = "Supabase not configured";
    return null;
  }

  if (isLoginEmail(trimmed)) {
    const byEmail = await fetchAccountByEmail(trimmed);
    if (byEmail) return byEmail;
  }

  const byUsername = await fetchAccountByUsername(trimmed);
  if (byUsername) return byUsername;

  if (isValidPlayerIdFormat(trimmed)) {
    const byId = await fetchAccountByPlayerId(trimmed);
    if (byId) return byId;
  }

  // Надёжный fallback: загружаем список и ищем на клиенте (кириллица, пробелы).
  const all = await fetchAllAccountsFromCloud();
  const matched = matchAccountInList(all, trimmed);
  if (matched) {
    console.info("[accountCloud] matched via list fallback", matched.username);
    return matched;
  }

  return null;
}

export async function fetchAccountByPlayerId(playerId: string): Promise<CloudAccountRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const id = normalizePlayerIdQuery(playerId);
  const { data, error } = await sb
    .from("player_accounts")
    .select("*")
    .eq("player_id", id)
    .maybeSingle();
  if (error) {
    console.warn("[accountCloud] fetch by player_id failed:", error.message);
    return null;
  }
  return (data as CloudAccountRow | null) ?? null;
}

export async function isUsernameTakenInCloud(username: string, exceptPlayerId?: string): Promise<boolean> {
  const row = await fetchAccountByUsername(username);
  if (!row) return false;
  if (exceptPlayerId && normalizePlayerIdQuery(row.player_id) === normalizePlayerIdQuery(exceptPlayerId)) {
    return false;
  }
  return true;
}

export async function isEmailTakenInCloud(email: string, exceptPlayerId?: string): Promise<boolean> {
  const row = await fetchAccountByEmail(email);
  if (!row) return false;
  if (exceptPlayerId && normalizePlayerIdQuery(row.player_id) === normalizePlayerIdQuery(exceptPlayerId)) {
    return false;
  }
  return true;
}

export async function upsertAccountToCloud(input: {
  playerId: string;
  username: string;
  email?: string | null;
  passwordHash: string;
  accountBlocked?: boolean;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    lastAccountError = "Supabase not configured";
    return false;
  }

  const sb = getSupabase();
  if (!sb) return false;

  const playerId = normalizePlayerIdQuery(input.playerId);
  const username = input.username.trim();
  const email = normalizeEmail(input.email);
  const syncedAt = new Date().toISOString();

  const result = await tryCloudTimeout(
    sb
      .from("player_accounts")
      .upsert(
        {
          player_id: playerId,
          username,
          email,
          password_hash: input.passwordHash,
          account_blocked: input.accountBlocked ?? false,
          updated_at: syncedAt,
        },
        { onConflict: "player_id" },
      ),
    12_000,
    "account upsert",
  );

  if (!result.ok) {
    lastAccountError = result.error;
    console.error("[accountCloud] upsert failed:", result.error);
    return false;
  }

  const { error } = result.value;
  if (error) {
    lastAccountError = error.message;
    console.error("[accountCloud] upsert failed:", error.message, error);
    return false;
  }

  lastAccountError = null;
  console.info("[accountCloud] saved account", playerId, username, email ?? "(no email)");
  return true;
}

export function scheduleAccountCloudPush(): void {
  if (!isSupabaseConfigured()) return;
  const profile = getCurrentProfile();
  if (!profile?.playerId || isGuestProfile(profile)) return;

  if (accountPushTimer) clearTimeout(accountPushTimer);
  accountPushTimer = setTimeout(() => {
    accountPushTimer = null;
    void syncCurrentAccountToCloud();
  }, 600);
}

export async function syncCurrentAccountToCloud(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (accountPushInFlight) return accountPushInFlight;

  const username = getCurrentUsername();
  const profile = getCurrentProfile();
  if (!username || !profile?.playerId || isGuestProfile(profile)) return false;
  if (!profile.passwordHash) return false;

  accountPushInFlight = (async () => {
    return upsertAccountToCloud({
      playerId: profile.playerId!,
      username,
      email: profile.email,
      passwordHash: profile.passwordHash,
      accountBlocked: profile.accountBlocked ?? false,
    });
  })().finally(() => {
    accountPushInFlight = null;
  });

  return accountPushInFlight;
}

export async function registerAccountInCloud(input: {
  playerId: string;
  username: string;
  email: string;
  passwordHash: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: "Облако не настроено — перезапустите npm run dev" };
  }

  const email = normalizeEmail(input.email);
  if (!email) {
    return { success: false, error: "Укажите корректный e-mail" };
  }

  if (await isUsernameTakenInCloud(input.username)) {
    return { success: false, error: "Имя пользователя уже занято" };
  }
  if (await isEmailTakenInCloud(email)) {
    return { success: false, error: "Этот e-mail уже привязан к другому аккаунту" };
  }

  const ok = await upsertAccountToCloud({
    playerId: input.playerId,
    username: input.username.trim(),
    email,
    passwordHash: input.passwordHash,
  });

  if (!ok) {
    return { success: false, error: lastAccountError ?? "Не удалось сохранить аккаунт в облаке" };
  }
  return { success: true };
}

export async function updateAccountEmailInCloud(
  playerId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { success: false, error: "Invalid email" };
  }
  if (await isEmailTakenInCloud(normalized, playerId)) {
    return { success: false, error: "Этот e-mail уже привязан к другому аккаунту" };
  }

  const profile = getCurrentProfile();
  if (!profile?.passwordHash) {
    return { success: false, error: "Not logged in" };
  }

  const ok = await upsertAccountToCloud({
    playerId,
    username: getCurrentUsername() ?? profile.username,
    email: normalized,
    passwordHash: profile.passwordHash,
    accountBlocked: profile.accountBlocked,
  });

  return ok
    ? { success: true }
    : { success: false, error: lastAccountError ?? "Cloud update failed" };
}

export async function updateAccountPasswordInCloud(
  playerId: string,
  passwordHash: string,
): Promise<boolean> {
  const profile = getCurrentProfile();
  const username = getCurrentUsername();
  if (!profile || !username) return false;

  return upsertAccountToCloud({
    playerId,
    username,
    email: profile.email,
    passwordHash,
    accountBlocked: profile.accountBlocked,
  });
}

export async function changeAccountEmailCloud(newEmail: string): Promise<{ success: boolean; error?: string }> {
  const profile = getCurrentProfile();
  const username = getCurrentUsername();
  if (!username || !profile?.playerId || isGuestProfile(profile)) {
    return { success: false, error: "Register the account first" };
  }

  const email = newEmail.trim();
  if (!email.includes("@")) {
    return { success: false, error: "Invalid email" };
  }

  if (isSupabaseConfigured()) {
    if (await isEmailTakenInCloud(email, profile.playerId)) {
      return { success: false, error: "Этот e-mail уже привязан к другому аккаунту" };
    }
  }

  const { changeAccountEmail } = await import("../localStorageAPI");
  const local = changeAccountEmail(email);
  if (!local.success) return local;

  await syncCurrentAccountToCloud();
  return { success: true };
}

export async function changeAccountPasswordCloud(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  const profile = getCurrentProfile();
  if (!profile?.playerId || isGuestProfile(profile)) {
    return { success: false, error: "Guest accounts have no password" };
  }

  if (!verifyAccountPassword(currentPassword, profile.passwordHash)) {
    return { success: false, error: "Wrong password" };
  }
  if (!newPassword || newPassword.length < 3) {
    return { success: false, error: "Password must be at least 3 characters" };
  }

  const { changeAccountPassword } = await import("../localStorageAPI");
  const local = changeAccountPassword(currentPassword, newPassword);
  if (!local.success) return local;

  await updateAccountPasswordInCloud(profile.playerId, hashAccountPassword(newPassword));
  return { success: true };
}

export function verifyAccountPassword(password: string, passwordHash: string): boolean {
  return hashAccountPassword(password) === passwordHash;
}

let accountCloudListenersInit = false;

export function initAccountCloudListeners(): void {
  if (typeof window === "undefined" || accountCloudListenersInit) return;
  accountCloudListenersInit = true;

  window.addEventListener("clash-profile-local-changed", () => {
    scheduleAccountCloudPush();
  });
}

if (typeof window !== "undefined") {
  queueMicrotask(() => initAccountCloudListeners());
}
