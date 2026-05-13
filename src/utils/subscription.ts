// ─── Star Guardian (monthly subscription) ──────────────────────────────────
// 299₽/month "premium" stub: real money is mocked with a confirm dialog.
// While active the player gets:
//   • Daily main reward (auto-claimed on first visit each day)
//   • Daily secondary reward — pick 1 of 3 (rolled fresh each day)
//   • A "Power-Up Token" every 3 days (instant-level item for any brawler)
//   • The Astral assistant unlocks autoplay, in-battle tips and chat commands
//
// Persistence lives on UserProfile.starGuardian and UserProfile.astralSettings
// so the standard saveProfiles flow auto-persists everything.

import { getCurrentProfile, updateProfile, addCoins, addGems } from "./localStorageAPI";

export const STAR_GUARDIAN_PRICE_RUB = 299;
export const STAR_GUARDIAN_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// One-shot item that bumps any unlocked brawler by exactly 1 level for free.
// Stored as a count on the subscription state; consumed via consumePowerUpToken.
export const SPECIAL_REWARD_INTERVAL_DAYS = 3;

export type SecondaryRewardType = "coins" | "gems" | "powerPoints";
export interface SecondaryRewardOption {
  type: SecondaryRewardType;
  amount: number;
}

export interface StarGuardianState {
  activeUntil: number;            // unix ms (0 = never bought, past = expired)
  // Day-key (YYYYMMDD as int) of the last claim of each track.
  lastMainClaimDay: number;
  lastSecondaryClaimDay: number;
  lastSpecialClaimDay: number;
  // Day-key when the secondary options were last rolled (kept stable for the day).
  secondaryRolledDay: number;
  secondaryOptions: SecondaryRewardOption[];
  // Unconsumed "Power-Up Tokens" — give +1 level to any brawler (no resource cost).
  powerUpTokens: number;
  // Lifetime stats (cosmetic — shown in subscription details panel).
  totalSubscriptionsBought: number;
}

export interface AstralSettings {
  enabled: boolean;          // master toggle (all features)
  battleTipsEnabled: boolean;
  menuTipsEnabled: boolean;
  voice: 0 | 1 | 2;          // avatar variant
}

export const DEFAULT_ASTRAL_SETTINGS: AstralSettings = {
  enabled: true,
  battleTipsEnabled: true,
  menuTipsEnabled: true,
  voice: 0,
};

/** YYYYMMDD as int for stable per-day comparisons. */
export function dayKey(ts = Date.now()): number {
  const d = new Date(ts);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function emptyState(): StarGuardianState {
  return {
    activeUntil: 0,
    lastMainClaimDay: 0,
    lastSecondaryClaimDay: 0,
    lastSpecialClaimDay: 0,
    secondaryRolledDay: 0,
    secondaryOptions: [],
    powerUpTokens: 0,
    totalSubscriptionsBought: 0,
  };
}

export function getStarGuardian(): StarGuardianState {
  const p = getCurrentProfile();
  return (p?.starGuardian as StarGuardianState | undefined) ?? emptyState();
}

export function isStarGuardianActive(): boolean {
  const s = getStarGuardian();
  return s.activeUntil > Date.now();
}

export function getStarGuardianDaysRemaining(): number {
  const s = getStarGuardian();
  if (!isStarGuardianActive()) return 0;
  return Math.max(0, Math.ceil((s.activeUntil - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function getAstralSettings(): AstralSettings {
  const p = getCurrentProfile();
  return { ...DEFAULT_ASTRAL_SETTINGS, ...((p?.astralSettings as Partial<AstralSettings> | undefined) ?? {}) };
}

export function updateAstralSettings(patch: Partial<AstralSettings>): void {
  const cur = getAstralSettings();
  updateProfile({ astralSettings: { ...cur, ...patch } } as any);
}

function patchSubscription(patch: Partial<StarGuardianState>): void {
  const cur = getStarGuardian();
  const next: StarGuardianState = { ...cur, ...patch };
  updateProfile({ starGuardian: next } as any);
}

// ── Purchase ───────────────────────────────────────────────────────────────

/** Mock purchase — extends the activeUntil timestamp by 30 days from
 *  whichever is later: now or the existing expiry date (so re-buying while
 *  still active stacks instead of overwriting). */
export function purchaseStarGuardian(): { success: true; daysRemaining: number } {
  const cur = getStarGuardian();
  const base = Math.max(Date.now(), cur.activeUntil);
  const next: StarGuardianState = {
    ...cur,
    activeUntil: base + STAR_GUARDIAN_DURATION_MS,
    totalSubscriptionsBought: cur.totalSubscriptionsBought + 1,
  };
  updateProfile({ starGuardian: next } as any);
  return { success: true, daysRemaining: getStarGuardianDaysRemaining() };
}

// ── Daily main reward ──────────────────────────────────────────────────────

export const MAIN_DAILY_COINS = 500;
export const MAIN_DAILY_GEMS = 20;
export const MAIN_DAILY_POWER = 100;

export interface MainDailyClaimResult {
  claimed: boolean;
  coins: number;
  gems: number;
  powerPoints: number;
}

export function isMainDailyAvailable(): boolean {
  if (!isStarGuardianActive()) return false;
  return getStarGuardian().lastMainClaimDay !== dayKey();
}

/** Auto-grants the main daily reward (called on entering main menu).
 *  Returns the claim result so the UI can flash a notification. */
export function claimMainDaily(): MainDailyClaimResult {
  if (!isMainDailyAvailable()) {
    return { claimed: false, coins: 0, gems: 0, powerPoints: 0 };
  }
  const profile = getCurrentProfile();
  if (!profile) return { claimed: false, coins: 0, gems: 0, powerPoints: 0 };
  // Apply rewards (coins/gems via helpers, powerPoints via direct update).
  addCoins(MAIN_DAILY_COINS);
  addGems(MAIN_DAILY_GEMS);
  const p2 = getCurrentProfile()!;
  updateProfile({ powerPoints: p2.powerPoints + MAIN_DAILY_POWER });
  patchSubscription({ lastMainClaimDay: dayKey() });
  return { claimed: true, coins: MAIN_DAILY_COINS, gems: MAIN_DAILY_GEMS, powerPoints: MAIN_DAILY_POWER };
}

// ── Daily secondary reward (3-choice) ──────────────────────────────────────

const SECONDARY_POOL: SecondaryRewardOption[] = [
  { type: "coins",       amount: 500 },
  { type: "gems",        amount: 10 },
  { type: "powerPoints", amount: 50 },
];

/** Returns the 3 secondary options for today, rolling them once per day
 *  and persisting the roll so the choice menu is stable on refresh. */
export function getDailySecondaryOptions(): SecondaryRewardOption[] {
  const today = dayKey();
  const cur = getStarGuardian();
  if (cur.secondaryRolledDay === today && cur.secondaryOptions.length === 3) {
    return cur.secondaryOptions;
  }
  // Always offer all three pool entries (one of each kind), in a shuffled order.
  const shuffled = [...SECONDARY_POOL].sort(() => Math.random() - 0.5);
  patchSubscription({ secondaryRolledDay: today, secondaryOptions: shuffled });
  return shuffled;
}

export function isSecondaryDailyAvailable(): boolean {
  if (!isStarGuardianActive()) return false;
  return getStarGuardian().lastSecondaryClaimDay !== dayKey();
}

export function claimSecondaryDaily(index: 0 | 1 | 2): { claimed: boolean; option?: SecondaryRewardOption } {
  if (!isSecondaryDailyAvailable()) return { claimed: false };
  const opts = getDailySecondaryOptions();
  const opt = opts[index];
  if (!opt) return { claimed: false };
  if (opt.type === "coins") addCoins(opt.amount);
  else if (opt.type === "gems") addGems(opt.amount);
  else {
    const p = getCurrentProfile();
    if (!p) return { claimed: false };
    updateProfile({ powerPoints: p.powerPoints + opt.amount });
  }
  patchSubscription({ lastSecondaryClaimDay: dayKey() });
  return { claimed: true, option: opt };
}

// ── Special "Power-Up Token" (every 3 days) ────────────────────────────────

export function isSpecialDailyAvailable(): boolean {
  if (!isStarGuardianActive()) return false;
  const s = getStarGuardian();
  if (s.lastSpecialClaimDay === 0) return true;
  // Compare wall-clock days using day-key arithmetic (UTC-naive but stable).
  const last = parseDayKey(s.lastSpecialClaimDay);
  const today = parseDayKey(dayKey());
  const diff = Math.floor((today - last) / (24 * 60 * 60 * 1000));
  return diff >= SPECIAL_REWARD_INTERVAL_DAYS;
}

function parseDayKey(k: number): number {
  if (!k) return 0;
  const y = Math.floor(k / 10000);
  const m = Math.floor((k % 10000) / 100);
  const d = k % 100;
  return new Date(y, m - 1, d).getTime();
}

export function claimSpecialDaily(): { claimed: boolean; tokens?: number } {
  if (!isSpecialDailyAvailable()) return { claimed: false };
  const cur = getStarGuardian();
  patchSubscription({
    lastSpecialClaimDay: dayKey(),
    powerUpTokens: cur.powerUpTokens + 1,
  });
  return { claimed: true, tokens: cur.powerUpTokens + 1 };
}

/** Spend one Power-Up Token to bump a brawler by +1 level.
 *  Returns false if no tokens, brawler not unlocked, or already max. */
export function consumePowerUpToken(brawlerId: string): { success: boolean; newLevel?: number; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Нет профиля" };
  const sg = getStarGuardian();
  if (sg.powerUpTokens <= 0) return { success: false, error: "Нет токенов прокачки" };
  if (!profile.unlockedBrawlers.includes(brawlerId)) {
    return { success: false, error: "Этот боец ещё не открыт" };
  }
  const cur = profile.brawlerLevels[brawlerId] || 1;
  const MAX_LEVEL = 11;
  if (cur >= MAX_LEVEL) return { success: false, error: "Боец уже на максимальном уровне" };
  updateProfile({
    brawlerLevels: { ...profile.brawlerLevels, [brawlerId]: cur + 1 },
  });
  patchSubscription({ powerUpTokens: sg.powerUpTokens - 1 });
  return { success: true, newLevel: cur + 1 };
}
