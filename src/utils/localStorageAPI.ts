import type { ChestRarity } from "./chests";
import { CHESTS, CHEST_RARITY_ORDER, rollChestRewards, type ChestRoll } from "./chests";
import { DAILY_LADDER, getRewardForDay } from "./dailyLadder";
import {
  generateDailyQuests, isQuestsExpired,
  buildFreshQuestPoolForUnlocked, addDailyQuestsForUnlocked, addWeeklyQuestsForUnlocked,
  isDailyExpired, isWeeklyExpired,
  DAILY_QUEST_COUNT, WEEKLY_QUEST_COUNT,
  type DailyQuestsState, type QuestKind, type QuestPool, type QuestMeta,
} from "./quests";
import { BRAWLERS, BRAWLER_GEM_COST, CHEST_BRAWLER_DROP_CHANCE } from "../entities/BrawlerData";
import {
  PETS, PET_GEM_COST, CHEST_PET_DROP_CHANCE, CHEST_PET_RARITY_WEIGHTS,
  type PetRarity,
} from "../entities/PetData";
import {
  BRAWLER_CONSTELLATIONS,
  MAX_STARS_PER_BRAWLER,
  STAR_COST_GEMS,
  STAR_PACK3_COST_GEMS,
  type BrawlerStarDef,
} from "./constellations";

export interface BattleRecord {
  id: string;                  // uuid-like timestamp+random
  ts: number;                  // unix ms
  mode: string;
  brawlerId: string;           // player brawler used
  won: boolean;
  place: number;
  totalPlayers: number;
  trophyDelta: number;
  xpGained: number;
  coinsEarned: number;
  durationSec?: number;
  enemies: Array<{ id: string; name: string; isBot: boolean }>;
}

/** Stored on `UserProfile.bossRaid`. */
export interface BossRaidProfileSlice {
  byBoss: Record<string, { maxDefeated: number; claimedLevels: number[] }>;
}

export interface UserProfile {
  username: string;
  passwordHash: string;
  coins: number;
  gems: number;
  powerPoints: number;
  brawlerLevels: Record<string, number>;
  brawlerSkins: Record<string, string[]>;
  lastDailyBonus: number;
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  trophies: number;
  xp: number;
  clashPassLevel: number;
  clashPassClaimed: number[];
  // Premium (paid) Star Pass — unlocked once via mock 450₽ purchase.
  // While false, paid-track rewards are visually locked and cannot be claimed.
  // Once true, the user may retroactively claim every paid reward up to the
  // current clashPassLevel.
  clashPassPaid?: boolean;
  clashPassClaimedPaid?: number[];
  trophyRoadClaimed: number[];
  modeStats: Record<string, { games: number; wins: number; losses: number }>;
  favoriteBrawlerId: string;
  selectedBrawlerId: string;
  selectedMode: string;
  selectedShowdownFormat?: "solo" | "duo" | "trio";
  selectedStarStrikeFormat?: "3v3" | "5v5";
  lastResult?: { place: number; trophyDelta: number; xpGained: number; mode: string; won: boolean };
  battleHistory?: BattleRecord[];
  createdAt: number;

  // Daily ladder (rotating 30-day rewards)
  dailyLadderDay: number;            // current day (1..30, then loops back to 1)
  dailyLadderLastClaim: number;      // unix ms of last claim

  // Daily quests (legacy, kept for backward compat)
  dailyQuests?: DailyQuestsState;
  // New accumulated quest pool (daily + weekly, max 50)
  questPool?: QuestPool;

  // Chest inventory: how many of each rarity the player owns (unopened)
  chestInventory: Record<ChestRarity, number>;

  // List of brawler IDs the player has unlocked. Locked brawlers can still
  // be tried in Training mode but cannot be set as the active brawler.
  unlockedBrawlers: string[];

  // Per-brawler trophy count (0..MAX_BRAWLER_TROPHIES). Awarded alongside
  // the global trophy count on every match end, scoped to whichever brawler
  // the player used. Drives the per-brawler rank ladder (1..100).
  brawlerTrophies: Record<string, number>;
  // Per-brawler list of claimed rank rewards (rank numbers 1..100).
  brawlerRankClaimed: Record<string, number[]>;

  // "pc": keyboard + mouse. "mobile": on-screen joysticks (move / attack /
  // super). Defaults to "mobile" on touch devices, "pc" otherwise.
  controlMode: "pc" | "mobile";

  // IDs of brawlers recently unlocked but not yet viewed in the collection.
  newBrawlers?: string[];
  // Per-brawler unlocked star indices (1..6).
  brawlerStars?: Record<string, number[]>;

  // ── Pets ───────────────────────────────────────────────────────────────────
  // Pets drop from chests in parallel with brawlers (independent roll) and
  // can be bought in the shop with gems. The equipped pet appears as a
  // follower in battle and grants a passive effect.
  unlockedPets?: string[];
  equippedPetId?: string | null;
  newPets?: string[]; // pets recently obtained, not yet viewed in pets page

  // ── Star Guardian subscription + Astral assistant ─────────────────────────
  // Free-form payload; the canonical shape lives in src/utils/subscription.ts
  // and src/ai/AstralAssistant.ts. Both are optional so legacy profiles keep
  // working without migration.
  starGuardian?: unknown;
  astralSettings?: unknown;
  donateFlags?: unknown;

  // ── Boss raid (PvE) ───────────────────────────────────────────────────────
  /** Per-boss progress: max defeated level, first-clear claims for levels 1–5. */
  bossRaid?: BossRaidProfileSlice;

  // ── Clubs (guilds) ─────────────────────────────────────────────────────────
  // Kept directly on the user profile so club membership survives reloads.
  clubId?: string | null;
  clubInvites?: string[];
  clubRewardLog?: string[];
}

export type ControlMode = "pc" | "mobile";

function detectDefaultControlMode(): ControlMode {
  if (typeof window === "undefined") return "pc";
  const touch =
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 0);
  return touch && window.innerWidth < 900 ? "mobile" : "pc";
}

export function getControlMode(): ControlMode {
  return getCurrentProfile()?.controlMode ?? detectDefaultControlMode();
}

export function setControlMode(mode: ControlMode): void {
  updateProfile({ controlMode: mode });
}

export const MAX_TROPHIES = 10000;
export const MAX_CLASHPASS_LEVEL = 50;
export const RENAME_GEM_COST = 50;

export function clashPassXpForLevel(level: number): number {
  if (level <= 1) return 150;
  if (level >= MAX_CLASHPASS_LEVEL) return 1000;
  // Linear from 150 (lvl 1->2) up to 1000 (lvl 49->50)
  return Math.round(150 + ((level - 1) / (MAX_CLASHPASS_LEVEL - 2)) * (1000 - 150));
}

export interface TrophyRoadReward {
  trophies: number;
  type: "coins" | "gems" | "powerPoints" | "brawler" | "chest";
  amount: number;
  label: string;
  chestRarity?: ChestRarity;
}

function buildTrophyRoad(): TrophyRoadReward[] {
  const thresholds: number[] = [];
  for (let t = 50; t <= 1000; t += 50) thresholds.push(t);
  for (let t = 1100; t <= 3000; t += 100) thresholds.push(t);
  for (let t = 3200; t <= 5000; t += 200) thresholds.push(t);
  for (let t = 5400; t <= 10000; t += 400) thresholds.push(t);

  return thresholds.map((trophies, i): TrophyRoadReward => {
    // Mythic chest at the very top
    if (trophies === 10000) return { trophies, type: "chest", amount: 1, chestRarity: "mythic", label: "Мифический сундук" };
    // Big gem milestones at major thresholds
    if (trophies === 5000)  return { trophies, type: "chest", amount: 1, chestRarity: "legendary", label: "Легендарный сундук" };
    if (trophies === 3000)  return { trophies, type: "chest", amount: 1, chestRarity: "mega", label: "Мега-сундук" };
    if (trophies === 1000)  return { trophies, type: "chest", amount: 1, chestRarity: "epic", label: "Эпический сундук" };

    // Periodic chest drops every ~10 tiers in addition to the big milestones
    if (i > 0 && i % 12 === 0) {
      const rarity: ChestRarity = i >= 30 ? "epic" : i >= 18 ? "rare" : "common";
      const labelMap: Record<ChestRarity, string> = {
        common: "Обычный сундук", rare: "Редкий сундук", epic: "Эпический сундук",
        mega: "Мега-сундук", legendary: "Легендарный сундук", mythic: "Мифический сундук",
        ultralegendary: "Ультралегендарный сундук",
      };
      return { trophies, type: "chest", amount: 1, chestRarity: rarity, label: labelMap[rarity] };
    }

    // 5-tier rotation: coin, coin, pp, coin, gem
    const cycle = i % 5;
    if (cycle === 4) {
      const amount = Math.max(5, Math.round(trophies / 80));
      return { trophies, type: "gems", amount, label: `${amount} кристаллов` };
    }
    if (cycle === 2) {
      const amount = Math.max(3, Math.round(trophies / 60));
      return { trophies, type: "powerPoints", amount, label: `${amount} очков прокачки` };
    }
    const amount = Math.max(40, Math.round((trophies * 0.5) / 10) * 10);
    return { trophies, type: "coins", amount, label: `${amount} монет` };
  });
}

export const TROPHY_ROAD: TrophyRoadReward[] = buildTrophyRoad();

export interface ClashPassReward {
  type: "coins" | "gems" | "powerPoints" | "chest";
  amount: number;
  label: string;
  chestRarity?: ChestRarity;
}

export function clashPassRewardForLevel(level: number): ClashPassReward {
  // Special chest tiers
  if (level === 50) return { type: "chest", amount: 1, chestRarity: "mythic", label: "Мифический сундук" };
  if (level === 40) return { type: "chest", amount: 1, chestRarity: "legendary", label: "Легендарный сундук" };
  if (level === 30) return { type: "chest", amount: 1, chestRarity: "mega", label: "Мега-сундук" };
  if (level === 20) return { type: "chest", amount: 1, chestRarity: "epic", label: "Эпический сундук" };
  if (level === 10) return { type: "chest", amount: 1, chestRarity: "rare", label: "Редкий сундук" };

  // Pattern of rewards: alternate coins, powerPoints, gems with scaling amounts
  const tier = Math.floor((level - 1) / 5); // 0..9
  const pos = (level - 1) % 5;
  if (pos === 4) {
    // Big reward every 5th level — gems
    return { type: "gems", amount: 10 + tier * 10, label: `${10 + tier * 10} кристаллов` };
  }
  if (pos === 2) {
    return { type: "powerPoints", amount: 5 + tier * 3, label: `${5 + tier * 3} очков прокачки` };
  }
  const coins = 50 + tier * 50 + pos * 25;
  return { type: "coins", amount: coins, label: `${coins} монет` };
}

// =========================================================================
// PAID (Premium) Star Pass — mocked purchase for 450 ₽
// =========================================================================

export const CLASH_PASS_PRICE_RUB = 450;

const CHEST_BUMP: Record<ChestRarity, ChestRarity> = {
  common: "rare",
  rare: "epic",
  epic: "mega",
  mega: "legendary",
  legendary: "mythic",
  mythic: "ultralegendary",
  ultralegendary: "ultralegendary",
};

const CHEST_LABEL: Record<ChestRarity, string> = {
  common: "Обычный сундук",
  rare: "Редкий сундук",
  epic: "Эпический сундук",
  mega: "Мега-сундук",
  legendary: "Легендарный сундук",
  mythic: "Мифический сундук",
  ultralegendary: "Ультралегендарный сундук",
};

/**
 * Premium Star Pass reward for a given level. Always strictly better than the
 * free track:
 *   • coins / powerPoints / gems → x2 the amount
 *   • chest                      → bumped one rarity tier higher
 * On every 5th level we also boost gems-style rewards a bit further to honour
 * the "more gems / boosters" promise from the product description.
 */
export function paidClashPassRewardForLevel(level: number): ClashPassReward {
  const free = clashPassRewardForLevel(level);
  if (free.type === "chest" && free.chestRarity) {
    const bumped = CHEST_BUMP[free.chestRarity];
    return { type: "chest", amount: 1, chestRarity: bumped, label: CHEST_LABEL[bumped] };
  }
  // Every 5th level on the free track is a gem reward — give players a bigger
  // gem stack (3x) to make the premium track feel notably more generous.
  if (free.type === "gems") {
    const amt = free.amount * 3;
    return { type: "gems", amount: amt, label: `${amt} кристаллов` };
  }
  // All other rewards: simple x2 multiplier.
  if (free.type === "coins") {
    const amt = free.amount * 2;
    return { type: "coins", amount: amt, label: `${amt} монет` };
  }
  if (free.type === "powerPoints") {
    const amt = free.amount * 2;
    return { type: "powerPoints", amount: amt, label: `${amt} очков прокачки` };
  }
  return free;
}

/**
 * Mock purchase — no real money changes hands. Flips clashPassPaid=true and
 * unlocks retroactive claiming of every premium reward up to the current
 * clashPassLevel. Returns success even if already purchased (idempotent).
 */
export function buyClashPass(): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (profile.clashPassPaid) return { success: false, error: "Star Pass уже куплен" };
  updateProfile({ clashPassPaid: true });
  return { success: true };
}

export function claimPaidClashPassReward(level: number): { success: boolean; reward?: ClashPassReward; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (level < 1 || level > MAX_CLASHPASS_LEVEL) return { success: false, error: "Неверный уровень" };
  if (!profile.clashPassPaid) return { success: false, error: "Star Pass не куплен" };
  if (profile.clashPassLevel < level) return { success: false, error: "Уровень не достигнут" };
  const claimed = profile.clashPassClaimedPaid || [];
  if (claimed.includes(level)) return { success: false, error: "Уже получено" };
  const reward = paidClashPassRewardForLevel(level);
  const updates: Partial<UserProfile> = {
    clashPassClaimedPaid: [...claimed, level],
  };
  if (reward.type === "coins") updates.coins = profile.coins + reward.amount;
  else if (reward.type === "gems") updates.gems = profile.gems + reward.amount;
  else if (reward.type === "powerPoints") updates.powerPoints = profile.powerPoints + reward.amount;
  else if (reward.type === "chest" && reward.chestRarity) {
    updates.chestInventory = {
      ...profile.chestInventory,
      [reward.chestRarity]: (profile.chestInventory[reward.chestRarity] || 0) + reward.amount,
    };
  }
  updateProfile(updates);
  return { success: true, reward };
}

const PROFILES_KEY = "clashArena_profiles";
const CURRENT_USER_KEY = "clashArena_currentUser";

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

export function getAllProfiles(): Record<string, UserProfile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveProfiles(profiles: Record<string, UserProfile>): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getCurrentUsername(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUsername(username: string | null): void {
  if (username === null) {
    localStorage.removeItem(CURRENT_USER_KEY);
  } else {
    localStorage.setItem(CURRENT_USER_KEY, username);
  }
}

function defaultChestInventory(): Record<ChestRarity, number> {
  return { common: 0, rare: 0, epic: 0, mega: 0, legendary: 0, mythic: 0, ultralegendary: 0 };
}

function normalizeProfile(p: UserProfile): UserProfile {
  const defaultLevels = { miya: 1, ronin: 1, yuki: 1, kenji: 1, hana: 1, goro: 1, sora: 1, rin: 1, taro: 1 };

  // Resolve unlocked brawlers first, so selected/favorite IDs can be validated
  // against the unlocked set and locked picks can never persist as the active
  // pick (which would otherwise let players enter ranked matches with locked
  // brawlers — see character-lock requirement).
  const unlockedBrawlers = (() => {
    const ids = new Set<string>(p.unlockedBrawlers || []);
    ids.add("hana"); // Always guarantee the starter brawler.
    return Array.from(ids);
  })();

  const safeSelected = (id: string | undefined) =>
    id && unlockedBrawlers.includes(id) ? id : "hana";

  return {
    username: p.username,
    passwordHash: p.passwordHash || "",
    coins: p.coins ?? 500,
    gems: p.gems ?? 50,
    powerPoints: p.powerPoints ?? 10,
    brawlerLevels: { ...defaultLevels, ...(p.brawlerLevels || {}) },
    brawlerSkins: p.brawlerSkins || {},
    lastDailyBonus: p.lastDailyBonus ?? 0,
    totalGamesPlayed: p.totalGamesPlayed ?? 0,
    totalWins: p.totalWins ?? 0,
    totalLosses: p.totalLosses ?? 0,
    trophies: p.trophies ?? 0,
    xp: p.xp ?? 0,
    clashPassLevel: p.clashPassLevel ?? 1,
    clashPassClaimed: p.clashPassClaimed || [],
    clashPassPaid: p.clashPassPaid ?? false,
    clashPassClaimedPaid: p.clashPassClaimedPaid || [],
    trophyRoadClaimed: (() => {
      // Stored as trophy thresholds. Filter out anything not in current ladder
      // (handles migration from older index-based storage).
      const validThresholds = new Set(TROPHY_ROAD.map(r => r.trophies));
      return (p.trophyRoadClaimed || []).filter((v: number) => validThresholds.has(v));
    })(),
    modeStats: p.modeStats || {},
    favoriteBrawlerId: safeSelected(p.favoriteBrawlerId),
    selectedBrawlerId: safeSelected(p.selectedBrawlerId),
    selectedMode: p.selectedMode || "showdown",
    selectedShowdownFormat: p.selectedShowdownFormat === "duo" || p.selectedShowdownFormat === "trio" ? p.selectedShowdownFormat : "solo",
    selectedStarStrikeFormat: p.selectedStarStrikeFormat === "5v5" ? "5v5" : "3v3",
    lastResult: p.lastResult,
    createdAt: p.createdAt || Date.now(),
    dailyLadderDay: p.dailyLadderDay ?? 1,
    dailyLadderLastClaim: p.dailyLadderLastClaim ?? 0,
    dailyQuests: p.dailyQuests,
    questPool: p.questPool,
    chestInventory: { ...defaultChestInventory(), ...(p.chestInventory || {}) },
    unlockedBrawlers,
    brawlerTrophies: { ...(p.brawlerTrophies || {}) },
    brawlerRankClaimed: { ...(p.brawlerRankClaimed || {}) },
    controlMode: p.controlMode === "mobile" || p.controlMode === "pc"
      ? p.controlMode
      : detectDefaultControlMode(),
    newBrawlers: p.newBrawlers || [],
    brawlerStars: p.brawlerStars || {},
    unlockedPets: p.unlockedPets || [],
    equippedPetId: p.equippedPetId || null,
    newPets: p.newPets || [],
    starGuardian: p.starGuardian,
    astralSettings: p.astralSettings,
    donateFlags: p.donateFlags,
    clubId: p.clubId ?? null,
    clubInvites: p.clubInvites || [],
    clubRewardLog: p.clubRewardLog || [],
    bossRaid: (() => {
      const raw = p.bossRaid;
      if (!raw || typeof raw !== "object" || !raw.byBoss) return { byBoss: {} as BossRaidProfileSlice["byBoss"] };
      return { byBoss: { ...raw.byBoss } };
    })(),
  };
}

// =========================================================================
// Per-brawler trophy ranks (1..100)
// =========================================================================

export const MAX_BRAWLER_RANK = 100;
export const MAX_BRAWLER_TROPHIES = 5000;

export interface BrawlerRankReward {
  rank: number;
  trophies: number; // cumulative trophies needed to reach this rank
  type: "coins" | "gems" | "powerPoints" | "chest";
  amount: number;
  label: string;
  chestRarity?: ChestRarity;
}

function buildBrawlerRankTable(): BrawlerRankReward[] {
  const out: BrawlerRankReward[] = [];
  for (let rank = 1; rank <= MAX_BRAWLER_RANK; rank++) {
    // Cumulative trophy threshold: gentle early curve, steeper late game.
    // rank 1 → 10, rank 10 → ~135, rank 50 → ~1525, rank 100 → ~5000.
    const trophies = Math.round(10 * rank + 0.4 * rank * rank);

    let reward: Omit<BrawlerRankReward, "rank" | "trophies">;
    if (rank === MAX_BRAWLER_RANK) {
      reward = { type: "chest", amount: 1, chestRarity: "mythic", label: "Мифический сундук" };
    } else if (rank === 75) {
      reward = { type: "chest", amount: 1, chestRarity: "legendary", label: "Легендарный сундук" };
    } else if (rank === 50) {
      reward = { type: "chest", amount: 1, chestRarity: "mega", label: "Мега-сундук" };
    } else if (rank === 25) {
      reward = { type: "chest", amount: 1, chestRarity: "epic", label: "Эпический сундук" };
    } else if (rank % 10 === 0) {
      const rarity: ChestRarity = rank >= 60 ? "epic" : rank >= 30 ? "rare" : "common";
      const labelMap: Record<ChestRarity, string> = {
        common: "Обычный сундук", rare: "Редкий сундук", epic: "Эпический сундук",
        mega: "Мега-сундук", legendary: "Легендарный сундук", mythic: "Мифический сундук",
        ultralegendary: "Ультралегендарный сундук",
      };
      reward = { type: "chest", amount: 1, chestRarity: rarity, label: labelMap[rarity] };
    } else {
      // Rotate gems / power points / coins.
      const cycle = rank % 5;
      if (cycle === 0) {
        const amount = 5 + Math.floor(rank / 5);
        reward = { type: "gems", amount, label: `${amount} кристаллов` };
      } else if (cycle === 3) {
        const amount = 3 + Math.floor(rank / 4);
        reward = { type: "powerPoints", amount, label: `${amount} очков прокачки` };
      } else {
        const amount = 30 + rank * 5;
        reward = { type: "coins", amount, label: `${amount} монет` };
      }
    }
    out.push({ rank, trophies, ...reward });
  }
  return out;
}

export const BRAWLER_RANK_TABLE: BrawlerRankReward[] = buildBrawlerRankTable();

export function getBrawlerTrophies(profile: UserProfile | null, brawlerId: string): number {
  if (!profile) return 0;
  return profile.brawlerTrophies[brawlerId] || 0;
}

export function getBrawlerRank(trophies: number): number {
  // Highest rank whose trophy threshold is satisfied. Rank 0 if no rank yet.
  let rank = 0;
  for (const r of BRAWLER_RANK_TABLE) {
    if (trophies >= r.trophies) rank = r.rank;
    else break;
  }
  return rank;
}

export function getBrawlerRankClaimed(profile: UserProfile | null, brawlerId: string): number[] {
  if (!profile) return [];
  return profile.brawlerRankClaimed[brawlerId] || [];
}

export function getUnclaimedBrawlerRankCount(profile: UserProfile | null, brawlerId: string): number {
  if (!profile) return 0;
  const trophies = getBrawlerTrophies(profile, brawlerId);
  const rank = getBrawlerRank(trophies);
  const claimed = new Set(getBrawlerRankClaimed(profile, brawlerId));
  let n = 0;
  for (let r = 1; r <= rank; r++) if (!claimed.has(r)) n++;
  return n;
}

export function getTotalUnclaimedBrawlerRankCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  let total = 0;
  for (const id of Object.keys(profile.brawlerTrophies)) {
    total += getUnclaimedBrawlerRankCount(profile, id);
  }
  return total;
}

export function claimBrawlerRankReward(
  brawlerId: string,
  rank: number,
): { success: boolean; reward?: BrawlerRankReward; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  if (rank < 1 || rank > MAX_BRAWLER_RANK) return { success: false, error: "Неверный ранг" };
  const reward = BRAWLER_RANK_TABLE[rank - 1];
  const trophies = getBrawlerTrophies(profile, brawlerId);
  if (trophies < reward.trophies) return { success: false, error: "Недостаточно кубков" };
  const claimed = new Set(getBrawlerRankClaimed(profile, brawlerId));
  if (claimed.has(rank)) return { success: false, error: "Уже получено" };
  claimed.add(rank);
  const updates: Partial<UserProfile> = {
    brawlerRankClaimed: {
      ...profile.brawlerRankClaimed,
      [brawlerId]: Array.from(claimed),
    },
  };
  if (reward.type === "coins") updates.coins = profile.coins + reward.amount;
  else if (reward.type === "gems") updates.gems = profile.gems + reward.amount;
  else if (reward.type === "powerPoints") updates.powerPoints = profile.powerPoints + reward.amount;
  else if (reward.type === "chest" && reward.chestRarity) {
    updates.chestInventory = {
      ...profile.chestInventory,
      [reward.chestRarity]: (profile.chestInventory[reward.chestRarity] || 0) + reward.amount,
    };
  }
  updateProfile(updates);
  return { success: true, reward };
}

// ─── Notification badges ────────────────────────────────────────────────────
// Helpers that return the number of *unclaimed* / *unread* items in each
// reward source so the lobby can show a red "1" badge on the corresponding
// menu entry.

export function getUnclaimedTrophyRoadCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  const claimed = new Set(profile.trophyRoadClaimed);
  let count = 0;
  for (const r of TROPHY_ROAD) {
    if (r.trophies <= profile.trophies && !claimed.has(r.trophies)) count++;
  }
  return count;
}

export function getUnclaimedClashPassCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  const claimed = new Set(profile.clashPassClaimed);
  let count = 0;
  // Clash Pass awards a reward when the player *reaches* a level. Anything from
  // level 1 up to (and including) the current level that hasn't been claimed
  // yet is fair game.
  for (let lvl = 1; lvl <= profile.clashPassLevel; lvl++) {
    if (!claimed.has(lvl)) count++;
  }
  return count;
}

export function getUnopenedChestCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  return Object.values(profile.chestInventory || {}).reduce((a, b) => a + b, 0);
}

export function getClaimableQuestCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  const pool = profile.questPool;
  if (!pool) return 0;
  return pool.activeQuests.filter(q => !q.claimed && q.progress >= q.target).length;
}

export function getActiveQuestCount(profile: UserProfile | null): number {
  if (!profile) return 0;
  const pool = profile.questPool;
  if (!pool) return 0;
  return pool.activeQuests.filter(q => !q.claimed).length;
}

export function isBrawlerUnlocked(profile: UserProfile | null, brawlerId: string): boolean {
  if (!profile) return false;
  return profile.unlockedBrawlers.includes(brawlerId);
}

export function getCurrentProfile(): UserProfile | null {
  const username = getCurrentUsername();
  if (!username) return null;
  const profiles = getAllProfiles();
  const raw = profiles[username];
  if (!raw) return null;
  return normalizeProfile(raw);
}

export function createProfile(username: string, password: string): { success: boolean; error?: string } {
  if (!username.trim() || username.length < 2) {
    return { success: false, error: "Username must be at least 2 characters" };
  }
  if (!password || password.length < 3) {
    return { success: false, error: "Password must be at least 3 characters" };
  }
  const profiles = getAllProfiles();
  if (profiles[username]) {
    return { success: false, error: "Username already taken" };
  }
  const newProfile: UserProfile = normalizeProfile({
    username,
    passwordHash: simpleHash(password),
    createdAt: Date.now(),
  } as UserProfile);
  profiles[username] = newProfile;
  saveProfiles(profiles);
  setCurrentUsername(username);
  return { success: true };
}

export function loginProfile(username: string, password: string): { success: boolean; error?: string } {
  const profiles = getAllProfiles();
  const profile = profiles[username];
  if (!profile) {
    return { success: false, error: "User not found" };
  }
  if (profile.passwordHash !== simpleHash(password)) {
    return { success: false, error: "Wrong password" };
  }
  setCurrentUsername(username);
  return { success: true };
}

export function createGuestProfile(): void {
  const guestName = `Guest_${Math.floor(Math.random() * 9999)}`;
  const profiles = getAllProfiles();
  profiles[guestName] = normalizeProfile({
    username: guestName,
    passwordHash: "",
    coins: 200,
    gems: 10,
    powerPoints: 5,
    createdAt: Date.now(),
  } as UserProfile);
  saveProfiles(profiles);
  setCurrentUsername(guestName);
}

export function updateProfile(updates: Partial<UserProfile>): void {
  const username = getCurrentUsername();
  if (!username) return;
  const profiles = getAllProfiles();
  if (!profiles[username]) return;
  profiles[username] = { ...profiles[username], ...updates };
  saveProfiles(profiles);
}

export function logout(): void {
  setCurrentUsername(null);
}

export function claimDailyBonus(): { success: boolean; coins?: number } {
  // Legacy entry point — re-routed through the new daily ladder so existing
  // callers (e.g. ShopPage's "+50 monet" daily bonus card) keep working.
  const r = claimDailyLadderReward();
  if (!r.success) return { success: false };
  if (r.reward?.type === "coins") return { success: true, coins: r.reward.amount };
  return { success: true, coins: 0 };
}

export function openBox(): { type: string; amount: number } {
  const profile = getCurrentProfile();
  if (!profile || profile.coins < 100) return { type: "error", amount: 0 };
  const roll = Math.random();
  let reward: { type: string; amount: number };
  if (roll < 0.70) {
    const coins = Math.floor(Math.random() * 151) + 50;
    reward = { type: "coins", amount: coins };
    updateProfile({ coins: profile.coins - 100 + coins });
  } else if (roll < 0.95) {
    const pp = Math.floor(Math.random() * 5) + 1;
    reward = { type: "powerPoints", amount: pp };
    updateProfile({ coins: profile.coins - 100, powerPoints: profile.powerPoints + pp });
  } else {
    const gems = Math.floor(Math.random() * 3) + 1;
    reward = { type: "gems", amount: gems };
    updateProfile({ coins: profile.coins - 100, gems: profile.gems + gems });
  }
  return reward;
}

export function upgradeBrawlerCost(level: number): { coins: number; powerPoints: number } {
  return { coins: 100 * level, powerPoints: 5 * level };
}

export const MAX_BRAWLER_LEVEL = 10;

export function upgradeBrawler(id: string): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  const level = profile.brawlerLevels[id] || 1;
  if (level >= 10) return { success: false, error: "Max level reached" };
  const costCoins = 100 * level;
  const costPP = 5 * level;
  if (profile.coins < costCoins) return { success: false, error: `Need ${costCoins} coins` };
  if (profile.powerPoints < costPP) return { success: false, error: `Need ${costPP} power points` };
  const newLevels = { ...profile.brawlerLevels, [id]: level + 1 };
  updateProfile({
    coins: profile.coins - costCoins,
    powerPoints: profile.powerPoints - costPP,
    brawlerLevels: newLevels,
  });
  trackQuestProgress("upgrade_brawler", 1);
  return { success: true };
}

export function addCoins(amount: number): void {
  const profile = getCurrentProfile();
  if (!profile) return;
  updateProfile({ coins: profile.coins + amount });
}

export function addGems(amount: number): void {
  const profile = getCurrentProfile();
  if (!profile) return;
  updateProfile({ gems: profile.gems + amount });
}

// Trophy delta by Showdown placement (10 brawlers total)
const SHOWDOWN_TROPHIES = [16, 12, 9, 6, 3, -2, -4, -6, -8, -10];

export function getBattleHistory(): BattleRecord[] {
  return getCurrentProfile()?.battleHistory ?? [];
}

type QuestTrackContext = {
  won: boolean;
  mode: string;
  place: number;
  actualDelta: number;
  brawlerId: string;
  killCount: number;
  damageDealt: number;
  healingDone: number;
  superUses: number;
  powerCubesCollected: number;
};

function trackQuestsByContext(ctx: QuestTrackContext): void {
  const bMeta: QuestMeta = { brawlerId: ctx.brawlerId };
  const modeMeta: QuestMeta = { mode: ctx.mode };
  const isShowdownLike = ctx.mode === "showdown" || ctx.mode === "megashowdown";

  const trackers: Array<() => void> = [
    () => trackQuestProgress("play_games", 1),
    () => trackQuestProgress("play_brawler", 1, bMeta),
    () => { if (ctx.won) trackQuestProgress("win_games", 1); },
    () => { if (ctx.won) trackQuestProgress("win_brawler", 1, bMeta); },
    () => { if (ctx.won && ctx.mode === "gemgrab") trackQuestProgress("win_mode_gemgrab", 1, modeMeta); },
    () => { if (ctx.won && ctx.mode === "heist") trackQuestProgress("win_mode_heist", 1, modeMeta); },
    () => { if (ctx.won && ctx.mode === "bounty") trackQuestProgress("win_mode_bounty", 1, modeMeta); },
    () => { if (ctx.won && ctx.mode === "brawlball") trackQuestProgress("win_mode_brawlball", 1, modeMeta); },
    () => { if (ctx.won && isShowdownLike) trackQuestProgress("win_mode_showdown", 1, { mode: "showdown" }); },
    () => {
      if (isShowdownLike) trackQuestProgress("play_showdown", 1);
      else if (ctx.mode !== "training") trackQuestProgress("play_team", 1);
    },
    () => { if (isShowdownLike && ctx.place <= 5) trackQuestProgress("survive_showdown", 1); },
    () => { if (isShowdownLike && ctx.place <= 3) trackQuestProgress("place_top3", 1); },
    () => { if (isShowdownLike && ctx.place === 1) trackQuestProgress("place_top1_showdown", 1); },
    () => { if (ctx.actualDelta > 0) trackQuestProgress("earn_trophies", ctx.actualDelta); },
    () => {
      if (ctx.killCount > 0) {
        trackQuestProgress("kill_enemies", ctx.killCount);
        trackQuestProgress("kill_brawler", ctx.killCount, bMeta);
      }
    },
    () => {
      if (ctx.damageDealt > 0) {
        trackQuestProgress("deal_damage", ctx.damageDealt);
        trackQuestProgress("damage_brawler", ctx.damageDealt, bMeta);
      }
    },
    () => { if (ctx.healingDone > 0) trackQuestProgress("heal_hp", ctx.healingDone); },
    () => { if (ctx.superUses > 0) trackQuestProgress("use_super", ctx.superUses); },
    () => { if (ctx.powerCubesCollected > 0) trackQuestProgress("collect_powercubes", ctx.powerCubesCollected); },
  ];
  for (const t of trackers) t();
}

export function recordGameResult(opts: {
  won: boolean;
  mode: string;
  brawlerId?: string;
  place?: number; // 1..10 for showdown, 1 or 2 for team modes
  totalPlayers?: number;
  enemies?: Array<{ id: string; name: string; isBot: boolean }>;
  durationSec?: number;
  // Per-match stats for quest tracking
  killCount?: number;
  damageDealt?: number;
  healingDone?: number;
  superUses?: number;
  powerCubesCollected?: number;
  petBonusCoins?: number;
  // Multiplier applied to coins, XP, and trophy delta. Used by special modes
  // such as Mega Star Battle (×1.5) to reward higher-stakes play.
  rewardMultiplier?: number;
}): { trophyDelta: number; xpGained: number; coinsEarned: number; place: number; clashPassUp: boolean } {
  const profile = getCurrentProfile();
  if (!profile) {
    return { trophyDelta: 0, xpGained: 0, coinsEarned: 0, place: 0, clashPassUp: false };
  }
  const { won, mode } = opts;
  if (mode === "bossraid") {
    const usedId = opts.brawlerId || profile.selectedBrawlerId;
    const place = won ? 1 : 2;
    const newRecord: BattleRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      mode,
      brawlerId: usedId,
      won,
      place,
      totalPlayers: 6,
      trophyDelta: 0,
      xpGained: 0,
      coinsEarned: 0,
      durationSec: opts.durationSec,
      enemies: opts.enemies ?? [],
    };
    const prevHistory = profile.battleHistory ?? [];
    const newHistory = [newRecord, ...prevHistory].slice(0, 20);
    updateProfile({
      totalGamesPlayed: profile.totalGamesPlayed + 1,
      lastResult: { place, trophyDelta: 0, xpGained: 0, mode, won },
      battleHistory: newHistory,
    });
    return { trophyDelta: 0, xpGained: 0, coinsEarned: 0, place, clashPassUp: false };
  }
  const rewardMul = opts.rewardMultiplier && opts.rewardMultiplier > 0 ? opts.rewardMultiplier : 1;
  // Mega Star Battle is showdown-style (free-for-all with placement).
  const isShowdownLike = mode === "showdown" || mode === "megashowdown";
  const place = opts.place ?? (won ? 1 : 2);
  const totalPlayers = opts.totalPlayers ?? (isShowdownLike ? 10 : 2);

  // Trophies
  let trophyDelta: number;
  if (isShowdownLike) {
    const idx = Math.max(0, Math.min(SHOWDOWN_TROPHIES.length - 1, place - 1));
    trophyDelta = SHOWDOWN_TROPHIES[idx];
  } else {
    trophyDelta = won ? 8 : -5;
  }
  trophyDelta = Math.round(trophyDelta * rewardMul);
  const newTrophies = Math.max(0, Math.min(MAX_TROPHIES, profile.trophies + trophyDelta));
  const actualDelta = newTrophies - profile.trophies;

  // XP
  let xpGained: number;
  if (isShowdownLike) {
    xpGained = Math.max(8, 50 - (place - 1) * 6);
  } else {
    xpGained = won ? 40 : 12;
  }
  xpGained = Math.round(xpGained * rewardMul);
  let newXp = profile.xp + xpGained;
  let newLevel = profile.clashPassLevel;
  let clashPassUp = false;
  while (newLevel < MAX_CLASHPASS_LEVEL && newXp >= clashPassXpForLevel(newLevel)) {
    newXp -= clashPassXpForLevel(newLevel);
    newLevel++;
    clashPassUp = true;
  }
  if (newLevel >= MAX_CLASHPASS_LEVEL) newXp = 0;

  // Battle-end resource rewards are disabled:
  // no coins, gems, or power points should be granted for match completion.
  const coinsEarned = 0;
  const ppBonus = 0;

  // Mode stats
  const ms = profile.modeStats[mode] || { games: 0, wins: 0, losses: 0 };
  const newModeStats = {
    ...profile.modeStats,
    [mode]: {
      games: ms.games + 1,
      wins: won ? ms.wins + 1 : ms.wins,
      losses: !won ? ms.losses + 1 : ms.losses,
    },
  };

  // Per-brawler trophies — awarded to whichever brawler the player used.
  const usedId = opts.brawlerId || profile.selectedBrawlerId;
  const prevBrawlerTrophies = profile.brawlerTrophies[usedId] || 0;
  const newBrawlerTrophies = Math.max(
    0,
    Math.min(MAX_BRAWLER_TROPHIES, prevBrawlerTrophies + actualDelta),
  );
  const updatedBrawlerTrophies = {
    ...profile.brawlerTrophies,
    [usedId]: newBrawlerTrophies,
  };

  const newRecord: BattleRecord = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    mode,
    brawlerId: usedId,
    won,
    place,
    totalPlayers,
    trophyDelta: actualDelta,
    xpGained,
    coinsEarned,
    durationSec: opts.durationSec,
    enemies: opts.enemies ?? [],
  };
  const prevHistory = profile.battleHistory ?? [];
  const newHistory = [newRecord, ...prevHistory].slice(0, 20);

  // Bump the player's club battle counter (no-op if not in a club or training).
  // We dispatch a window event instead of importing clubs.ts directly to
  // avoid a circular ESM dependency. clubs.ts subscribes on first import.
  if (profile.username && typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("clash:battle-finished", {
        detail: { username: profile.username, mode },
      }));
    } catch { /* ignore */ }
  }

  updateProfile({
    totalGamesPlayed: profile.totalGamesPlayed + 1,
    totalWins: won ? profile.totalWins + 1 : profile.totalWins,
    totalLosses: !won ? profile.totalLosses + 1 : profile.totalLosses,
    coins: profile.coins + coinsEarned,
    powerPoints: profile.powerPoints + ppBonus,
    trophies: newTrophies,
    xp: newXp,
    clashPassLevel: newLevel,
    modeStats: newModeStats,
    brawlerTrophies: updatedBrawlerTrophies,
    lastResult: { place, trophyDelta: actualDelta, xpGained, mode, won },
    battleHistory: newHistory,
  });

  // Track quest progress via dedicated per-quest trackers.
  trackQuestsByContext({
    won,
    mode,
    place,
    actualDelta,
    brawlerId: usedId,
    killCount: opts.killCount ?? 0,
    damageDealt: opts.damageDealt ?? 0,
    healingDone: opts.healingDone ?? 0,
    superUses: opts.superUses ?? 0,
    powerCubesCollected: opts.powerCubesCollected ?? 0,
  });

  return { trophyDelta: actualDelta, xpGained, coinsEarned, place, clashPassUp };
  void totalPlayers;
}

export function setSelectedBrawler(id: string): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (!profile.unlockedBrawlers.includes(id)) {
    return { success: false, error: "Боец заблокирован" };
  }
  updateProfile({ selectedBrawlerId: id });
  return { success: true };
}

// Unlock a brawler in the shop using gems.
export function unlockBrawlerWithGems(brawlerId: string): { success: boolean; error?: string; cost?: number } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  const brawler = BRAWLERS.find(b => b.id === brawlerId);
  if (!brawler) return { success: false, error: "Боец не найден" };
  if (profile.unlockedBrawlers.includes(brawlerId)) {
    return { success: false, error: "Уже разблокирован" };
  }
  const cost = BRAWLER_GEM_COST[brawler.rarity];
  if (profile.gems < cost) {
    return { success: false, error: `Нужно ${cost} кристаллов`, cost };
  }
  const newBrawlers = [...(profile.newBrawlers || [])];
  if (!newBrawlers.includes(brawlerId)) newBrawlers.push(brawlerId);
  updateProfile({
    gems: profile.gems - cost,
    unlockedBrawlers: [...profile.unlockedBrawlers, brawlerId],
    newBrawlers,
  });
  return { success: true, cost };
}

export function getBrawlerStarsCount(profile: UserProfile | null, brawlerId: string): number {
  if (!profile) return 0;
  return profile.brawlerStars?.[brawlerId]?.length || 0;
}

export function getBrawlerStars(profile: UserProfile | null, brawlerId: string): number[] {
  if (!profile) return [];
  return profile.brawlerStars?.[brawlerId] || [];
}

export function getBrawlerConstellationDefs(brawlerId: string): BrawlerStarDef[] {
  return BRAWLER_CONSTELLATIONS[brawlerId] || [];
}

export function buyBrawlerStarWithGems(brawlerId: string, starIndex: number): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  const defs = BRAWLER_CONSTELLATIONS[brawlerId] || [];
  if (!defs.some(s => s.index === starIndex)) return { success: false, error: "Звезда не найдена" };
  if (!profile.unlockedBrawlers.includes(brawlerId)) return { success: false, error: "Сначала открой бойца" };
  const had = new Set(profile.brawlerStars?.[brawlerId] || []);
  if (had.has(starIndex)) return { success: false, error: "Уже открыто" };
  if (had.size >= MAX_STARS_PER_BRAWLER) return { success: false, error: "Все звезды уже открыты" };
  if (profile.gems < STAR_COST_GEMS) return { success: false, error: `Нужно ${STAR_COST_GEMS} кристаллов` };
  had.add(starIndex);
  updateProfile({
    gems: profile.gems - STAR_COST_GEMS,
    brawlerStars: { ...(profile.brawlerStars || {}), [brawlerId]: Array.from(had).sort((a, b) => a - b) },
  });
  return { success: true };
}

export function buyBrawlerStarsPackWithGems(brawlerId: string): { success: boolean; gained?: number[]; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  if (!profile.unlockedBrawlers.includes(brawlerId)) return { success: false, error: "Сначала открой бойца" };
  const defs = BRAWLER_CONSTELLATIONS[brawlerId] || [];
  const had = new Set(profile.brawlerStars?.[brawlerId] || []);
  const missing = defs.map(s => s.index).filter(i => !had.has(i));
  if (missing.length === 0) return { success: false, error: "Все звезды уже открыты" };
  if (missing.length < 3) return { success: false, error: `Для пакета нужно минимум 3 неоткрытые звезды (осталось ${missing.length})` };
  if (profile.gems < STAR_PACK3_COST_GEMS) return { success: false, error: `Нужно ${STAR_PACK3_COST_GEMS} кристаллов` };
  const picks = missing.slice(0, 3);
  for (const p of picks) had.add(p);
  updateProfile({
    gems: profile.gems - STAR_PACK3_COST_GEMS,
    brawlerStars: { ...(profile.brawlerStars || {}), [brawlerId]: Array.from(had).sort((a, b) => a - b) },
  });
  return { success: true, gained: picks };
}

// Mark a brawler as seen in the collection (removes the "NEW" badge).
export function markBrawlerSeen(brawlerId: string): void {
  const profile = getCurrentProfile();
  if (!profile) return;
  const newBrawlers = (profile.newBrawlers || []).filter(id => id !== brawlerId);
  updateProfile({ newBrawlers });
}

// Get the list of newly unlocked brawlers not yet viewed in the collection.
export function getNewBrawlers(): string[] {
  return getCurrentProfile()?.newBrawlers || [];
}

// Directly grant a brawler unlock (used by chest drops).
export function grantBrawlerUnlock(brawlerId: string): { success: boolean } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false };
  if (profile.unlockedBrawlers.includes(brawlerId)) return { success: false };
  const newBrawlers = [...(profile.newBrawlers || [])];
  if (!newBrawlers.includes(brawlerId)) newBrawlers.push(brawlerId);
  updateProfile({ unlockedBrawlers: [...profile.unlockedBrawlers, brawlerId], newBrawlers });
  return { success: true };
}

// =========================================================================
// PETS
// =========================================================================

export function unlockPetWithGems(petId: string): { success: boolean; error?: string; cost?: number } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  const pet = PETS.find(p => p.id === petId);
  if (!pet) return { success: false, error: "Питомец не найден" };
  if ((profile.unlockedPets || []).includes(petId)) {
    return { success: false, error: "Уже разблокирован" };
  }
  const cost = PET_GEM_COST[pet.rarity];
  if (profile.gems < cost) {
    return { success: false, error: `Нужно ${cost} кристаллов`, cost };
  }
  const newPets = [...(profile.newPets || [])];
  if (!newPets.includes(petId)) newPets.push(petId);
  updateProfile({
    gems: profile.gems - cost,
    unlockedPets: [...(profile.unlockedPets || []), petId],
    newPets,
  });
  return { success: true, cost };
}

export function grantPetUnlock(petId: string): { success: boolean } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false };
  if ((profile.unlockedPets || []).includes(petId)) return { success: false };
  const newPets = [...(profile.newPets || [])];
  if (!newPets.includes(petId)) newPets.push(petId);
  updateProfile({
    unlockedPets: [...(profile.unlockedPets || []), petId],
    newPets,
  });
  return { success: true };
}

export function equipPet(petId: string | null): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  if (petId !== null && !(profile.unlockedPets || []).includes(petId)) {
    return { success: false, error: "Питомец не разблокирован" };
  }
  updateProfile({ equippedPetId: petId });
  return { success: true };
}

export function markPetSeen(petId: string): void {
  const profile = getCurrentProfile();
  if (!profile) return;
  const newPets = (profile.newPets || []).filter(id => id !== petId);
  updateProfile({ newPets });
}

export function getNewPets(): string[] {
  return getCurrentProfile()?.newPets || [];
}

// Pick a random locked pet weighted by chest tier. Returns null if the player
// already owns every pet that this chest can drop.
function pickLockedPetForChest(profile: UserProfile, chestRarity: ChestRarity): string | null {
  const owned = new Set(profile.unlockedPets || []);
  const weights = CHEST_PET_RARITY_WEIGHTS[chestRarity];

  // Build the cumulative pool: only rarities with at least one locked pet.
  const buckets: { rarity: PetRarity; weight: number; pets: string[] }[] = [];
  for (const [rarity, w] of Object.entries(weights)) {
    if (!w) continue;
    const lockedAtRarity = PETS
      .filter(p => p.rarity === (rarity as PetRarity) && !owned.has(p.id))
      .map(p => p.id);
    if (lockedAtRarity.length > 0) {
      buckets.push({ rarity: rarity as PetRarity, weight: w, pets: lockedAtRarity });
    }
  }
  if (buckets.length === 0) return null;

  const totalWeight = buckets.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * totalWeight;
  for (const b of buckets) {
    r -= b.weight;
    if (r <= 0) return b.pets[Math.floor(Math.random() * b.pets.length)];
  }
  const last = buckets[buckets.length - 1];
  return last.pets[Math.floor(Math.random() * last.pets.length)];
}

// Pick a random locked brawler from chest's rarity tier or higher.
// Returns null if none available (player owns everything at that tier+).
function pickLockedBrawlerForChest(profile: UserProfile, chestRarity: ChestRarity): string | null {
  const minTier = CHEST_RARITY_ORDER.indexOf(chestRarity);
  const lockedAtOrAbove = BRAWLERS.filter(b =>
    !profile.unlockedBrawlers.includes(b.id) &&
    CHEST_RARITY_ORDER.indexOf(b.rarity) >= minTier,
  );
  if (lockedAtOrAbove.length === 0) return null;
  return lockedAtOrAbove[Math.floor(Math.random() * lockedAtOrAbove.length)].id;
}

export function setSelectedMode(mode: string): void {
  updateProfile({ selectedMode: mode });
}

export function setSelectedShowdownFormat(format: "solo" | "duo" | "trio"): void {
  updateProfile({ selectedShowdownFormat: format });
}

export function setSelectedStarStrikeFormat(format: "3v3" | "5v5"): void {
  updateProfile({ selectedStarStrikeFormat: format });
}

export function setFavoriteBrawler(id: string): void {
  updateProfile({ favoriteBrawlerId: id });
}

export function renamePlayer(newName: string): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  const trimmed = newName.trim();
  if (trimmed.length < 2 || trimmed.length > 16) {
    return { success: false, error: "Имя должно быть 2-16 символов" };
  }
  if (trimmed === profile.username) {
    return { success: false, error: "Это уже ваше имя" };
  }
  if (profile.gems < RENAME_GEM_COST) {
    return { success: false, error: `Нужно ${RENAME_GEM_COST} кристаллов` };
  }
  const profiles = getAllProfiles();
  if (profiles[trimmed]) return { success: false, error: "Имя занято" };
  // Move profile under new key
  delete profiles[profile.username];
  profiles[trimmed] = { ...profile, username: trimmed, gems: profile.gems - RENAME_GEM_COST };
  saveProfiles(profiles);
  setCurrentUsername(trimmed);
  return { success: true };
}

export function claimTrophyRoadReward(idx: number): { success: boolean; reward?: TrophyRoadReward; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (idx < 0 || idx >= TROPHY_ROAD.length) return { success: false, error: "Неверная награда" };
  const reward = TROPHY_ROAD[idx];
  if (profile.trophies < reward.trophies) return { success: false, error: "Недостаточно кубков" };
  if (profile.trophyRoadClaimed.includes(reward.trophies)) return { success: false, error: "Уже получено" };
  const updates: Partial<UserProfile> = {
    trophyRoadClaimed: [...profile.trophyRoadClaimed, reward.trophies],
  };
  if (reward.type === "coins") updates.coins = profile.coins + reward.amount;
  else if (reward.type === "gems") updates.gems = profile.gems + reward.amount;
  else if (reward.type === "powerPoints") updates.powerPoints = profile.powerPoints + reward.amount;
  else if (reward.type === "chest" && reward.chestRarity) {
    updates.chestInventory = {
      ...profile.chestInventory,
      [reward.chestRarity]: (profile.chestInventory[reward.chestRarity] || 0) + reward.amount,
    };
  }
  updateProfile(updates);
  return { success: true, reward };
}

export function claimClashPassReward(level: number): { success: boolean; reward?: ClashPassReward; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (level < 1 || level > MAX_CLASHPASS_LEVEL) return { success: false, error: "Неверный уровень" };
  if (profile.clashPassLevel < level) return { success: false, error: "Уровень не достигнут" };
  if (profile.clashPassClaimed.includes(level)) return { success: false, error: "Уже получено" };
  const reward = clashPassRewardForLevel(level);
  const updates: Partial<UserProfile> = {
    clashPassClaimed: [...profile.clashPassClaimed, level],
  };
  if (reward.type === "coins") updates.coins = profile.coins + reward.amount;
  else if (reward.type === "gems") updates.gems = profile.gems + reward.amount;
  else if (reward.type === "powerPoints") updates.powerPoints = profile.powerPoints + reward.amount;
  else if (reward.type === "chest" && reward.chestRarity) {
    updates.chestInventory = {
      ...profile.chestInventory,
      [reward.chestRarity]: (profile.chestInventory[reward.chestRarity] || 0) + reward.amount,
    };
  }
  updateProfile(updates);
  return { success: true, reward };
}

export function buyXp(xpAmount: number, gemCost: number): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (profile.gems < gemCost) return { success: false, error: "Недостаточно кристаллов" };
  let newXp = profile.xp + xpAmount;
  let newLevel = profile.clashPassLevel;
  while (newLevel < MAX_CLASHPASS_LEVEL && newXp >= clashPassXpForLevel(newLevel)) {
    newXp -= clashPassXpForLevel(newLevel);
    newLevel++;
  }
  if (newLevel >= MAX_CLASHPASS_LEVEL) newXp = 0;
  updateProfile({ gems: profile.gems - gemCost, xp: newXp, clashPassLevel: newLevel });
  return { success: true };
}

// =========================================================================
// CHESTS — buy, grant, open, with rolled rewards
// =========================================================================

export function buyChest(rarity: ChestRarity, currency: "coins" | "gems"): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  const def = CHESTS[rarity];
  if (currency === "coins") {
    if (profile.coins < def.priceCoins) return { success: false, error: "Недостаточно монет" };
    updateProfile({
      coins: profile.coins - def.priceCoins,
      chestInventory: { ...profile.chestInventory, [rarity]: (profile.chestInventory[rarity] || 0) + 1 },
    });
  } else {
    if (profile.gems < def.priceGems) return { success: false, error: "Недостаточно кристаллов" };
    updateProfile({
      gems: profile.gems - def.priceGems,
      chestInventory: { ...profile.chestInventory, [rarity]: (profile.chestInventory[rarity] || 0) + 1 },
    });
  }
  return { success: true };
}

export function grantChest(rarity: ChestRarity, count = 1): void {
  const profile = getCurrentProfile();
  if (!profile) return;
  updateProfile({
    chestInventory: {
      ...profile.chestInventory,
      [rarity]: (profile.chestInventory[rarity] || 0) + count,
    },
  });
}

export function openChest(rarity: ChestRarity): { success: boolean; rolls?: ChestRoll[]; xpGained?: number; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if ((profile.chestInventory[rarity] || 0) < 1) return { success: false, error: "Нет такого сундука" };

  const rolls = rollChestRewards(rarity);

  // Brawler drop chance: per-chest. If it triggers AND there is at least one
  // locked brawler at this tier or above, replace one random regular roll
  // with the brawler reward. Otherwise the rolls remain currency-only.
  const dropChance = CHEST_BRAWLER_DROP_CHANCE[rarity];
  let brawlerUnlockId: string | null = null;
  if (Math.random() < dropChance) {
    brawlerUnlockId = pickLockedBrawlerForChest(profile, rarity);
    if (brawlerUnlockId) {
      // Replace the first non-bonus roll with the brawler reward so the user
      // visibly sees a brawler card pop out.
      const replaceIdx = Math.floor(Math.random() * rolls.length);
      rolls[replaceIdx] = { type: "brawler", amount: 1, brawlerId: brawlerUnlockId };
    }
  }

  // ── Independent pet roll ──────────────────────────────────────────────────
  // Pets drop on a separate per-chest probability table so a single chest may
  // yield both a brawler and a pet, mirroring the spec's "parallel" loot.
  const petDropChance = CHEST_PET_DROP_CHANCE[rarity];
  let petUnlockId: string | null = null;
  if (Math.random() < petDropChance) {
    petUnlockId = pickLockedPetForChest(profile, rarity);
    if (petUnlockId) {
      // Replace a different roll (avoid clobbering the brawler if any).
      const candidates = rolls
        .map((r, i) => ({ r, i }))
        .filter(x => x.r.type !== "brawler");
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        rolls[pick.i] = { type: "pet", amount: 1, petId: petUnlockId };
      } else {
        // All rolls already taken by brawler — append the pet as a bonus roll.
        rolls.push({ type: "pet", amount: 1, petId: petUnlockId });
      }
    }
  }

  let coinsGain = 0, gemsGain = 0, ppGain = 0;
  let unlockedBrawlers = profile.unlockedBrawlers;
  let unlockedPets = profile.unlockedPets || [];
  let newPets = [...(profile.newPets || [])];
  for (const r of rolls) {
    if (r.type === "coins") coinsGain += r.amount;
    else if (r.type === "gems") gemsGain += r.amount;
    else if (r.type === "powerPoints") ppGain += r.amount;
    else if (r.type === "brawler" && r.brawlerId && !unlockedBrawlers.includes(r.brawlerId)) {
      unlockedBrawlers = [...unlockedBrawlers, r.brawlerId];
    } else if (r.type === "pet" && r.petId && !unlockedPets.includes(r.petId)) {
      unlockedPets = [...unlockedPets, r.petId];
      if (!newPets.includes(r.petId)) newPets.push(r.petId);
    }
  }

  // Apply XP gain — same as daily/quest rewards so Clash Pass levels consistently
  const xpGain = CHESTS[rarity].drops.xp;
  let newXp = profile.xp + xpGain;
  let newLevel = profile.clashPassLevel;
  while (newLevel < MAX_CLASHPASS_LEVEL && newXp >= clashPassXpForLevel(newLevel)) {
    newXp -= clashPassXpForLevel(newLevel);
    newLevel++;
  }
  if (newLevel >= MAX_CLASHPASS_LEVEL) newXp = 0;

  updateProfile({
    coins: profile.coins + coinsGain,
    gems: profile.gems + gemsGain,
    powerPoints: profile.powerPoints + ppGain,
    xp: newXp,
    clashPassLevel: newLevel,
    chestInventory: {
      ...profile.chestInventory,
      [rarity]: profile.chestInventory[rarity] - 1,
    },
    unlockedBrawlers,
    unlockedPets,
    newPets,
  });
  trackQuestProgress("open_chests", 1);
  return { success: true, rolls, xpGained: xpGain };
}

// =========================================================================
// DAILY LADDER (rotating 30-day rewards)
// =========================================================================

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function canClaimDailyLadder(profile: UserProfile | null): boolean {
  if (!profile) return false;
  return Date.now() - profile.dailyLadderLastClaim >= ONE_DAY_MS;
}

export function dailyLadderTimeLeft(profile: UserProfile | null): number {
  if (!profile) return 0;
  return Math.max(0, ONE_DAY_MS - (Date.now() - profile.dailyLadderLastClaim));
}

export function claimDailyLadderReward(): { success: boolean; reward?: ReturnType<typeof getRewardForDay>; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Not logged in" };
  if (!canClaimDailyLadder(profile)) return { success: false, error: "Награда уже получена" };
  const reward = getRewardForDay(profile.dailyLadderDay);
  applyReward(profile, reward.type, reward.amount, reward.chestRarity);
  // Read profile again because applyReward mutated coins/etc
  const updated = getCurrentProfile();
  if (!updated) return { success: false, error: "Profile gone" };
  updateProfile({
    dailyLadderLastClaim: Date.now(),
    dailyLadderDay: (updated.dailyLadderDay % DAILY_LADDER.length) + 1,
  });
  return { success: true, reward };
}

function applyReward(
  profile: UserProfile,
  type: "coins" | "gems" | "powerPoints" | "chest" | "xp",
  amount: number,
  chestRarity?: ChestRarity,
): void {
  if (type === "coins") {
    updateProfile({ coins: profile.coins + amount });
  } else if (type === "gems") {
    updateProfile({ gems: profile.gems + amount });
  } else if (type === "powerPoints") {
    updateProfile({ powerPoints: profile.powerPoints + amount });
  } else if (type === "chest" && chestRarity) {
    updateProfile({
      chestInventory: {
        ...profile.chestInventory,
        [chestRarity]: (profile.chestInventory[chestRarity] || 0) + amount,
      },
    });
  } else if (type === "xp") {
    let newXp = profile.xp + amount;
    let newLevel = profile.clashPassLevel;
    while (newLevel < MAX_CLASHPASS_LEVEL && newXp >= clashPassXpForLevel(newLevel)) {
      newXp -= clashPassXpForLevel(newLevel);
      newLevel++;
    }
    if (newLevel >= MAX_CLASHPASS_LEVEL) newXp = 0;
    updateProfile({ xp: newXp, clashPassLevel: newLevel });
  }
}

// =========================================================================
// DAILY QUESTS
// =========================================================================

// ── Quest pool helpers ────────────────────────────────────────────────────────
function ensureQuestPool(profile: UserProfile): QuestPool {
  let pool = profile.questPool;
  if (!pool) {
    pool = buildFreshQuestPoolForUnlocked(profile.unlockedBrawlers);
    updateProfile({ questPool: pool });
    return pool;
  }
  let changed = false;
  const unlocked = new Set(profile.unlockedBrawlers || []);

  // Remove stale brawler-specific quests for locked/unowned brawlers.
  // This fixes legacy pools that were created before unlocked filtering.
  const filteredQuests = pool.activeQuests.filter(q => {
    const bid = q.meta?.brawlerId;
    return !bid || unlocked.has(bid);
  });
  if (filteredQuests.length !== pool.activeQuests.length) {
    pool = { ...pool, activeQuests: filteredQuests };
    changed = true;
  }

  // Backfill missing roll timestamps for legacy pools so expiry math works.
  if (typeof pool.lastDailyRoll !== "number" || Number.isNaN(pool.lastDailyRoll)) {
    pool = { ...pool, lastDailyRoll: 0 };
    changed = true;
  }
  if (typeof pool.lastWeeklyRoll !== "number" || Number.isNaN(pool.lastWeeklyRoll)) {
    pool = { ...pool, lastWeeklyRoll: 0 };
    changed = true;
  }

  // Top up missing pools (e.g. legacy profiles created before weekly quests existed).
  const hasAnyDaily  = pool.activeQuests.some(q => !q.isWeekly);
  const hasAnyWeekly = pool.activeQuests.some(q =>  q.isWeekly);
  if (!hasAnyDaily)  { pool = addDailyQuestsForUnlocked(pool, profile.unlockedBrawlers);  changed = true; }
  if (!hasAnyWeekly) { pool = addWeeklyQuestsForUnlocked(pool, profile.unlockedBrawlers); changed = true; }

  // Keep a healthy amount of quests after filtering stale entries.
  // Daily bucket should have at least DAILY_QUEST_COUNT active entries;
  // weekly bucket should have at least WEEKLY_QUEST_COUNT.
  const dailyActive = pool.activeQuests.filter(q => !q.isWeekly && !q.claimed).length;
  const weeklyActive = pool.activeQuests.filter(q => q.isWeekly && !q.claimed).length;
  if (dailyActive < DAILY_QUEST_COUNT) {
    pool = addDailyQuestsForUnlocked(pool, profile.unlockedBrawlers);
    changed = true;
  }
  if (weeklyActive < WEEKLY_QUEST_COUNT) {
    pool = addWeeklyQuestsForUnlocked(pool, profile.unlockedBrawlers);
    changed = true;
  }

  if (isDailyExpired(pool))  { pool = addDailyQuestsForUnlocked(pool, profile.unlockedBrawlers);  changed = true; }
  if (isWeeklyExpired(pool)) { pool = addWeeklyQuestsForUnlocked(pool, profile.unlockedBrawlers); changed = true; }
  if (changed) updateProfile({ questPool: pool });
  return pool;
}

// Kept for backward-compat (QuestsModal may still call this)
export function getOrRollDailyQuests(): DailyQuestsState {
  const profile = getCurrentProfile();
  if (!profile) return generateDailyQuests();
  const pool = ensureQuestPool(profile);
  // Return a legacy-shaped object of the first 5 non-weekly quests
  const quests = pool.activeQuests.filter(q => !q.isWeekly).slice(0, 5);
  return { generatedAt: pool.lastDailyRoll, quests };
}

export function getQuestPool(): QuestPool | null {
  const profile = getCurrentProfile();
  if (!profile) return null;
  return ensureQuestPool(profile);
}

export function trackQuestProgress(kind: QuestKind, amount: number, meta?: QuestMeta): void {
  const profile = getCurrentProfile();
  if (!profile || amount <= 0) return;
  const pool = ensureQuestPool(profile);
  let changed = false;
  const updatedQuests = pool.activeQuests.map(q => {
    if (q.kind !== kind || q.claimed) return q;
    // Meta matching — if quest has brawlerId, caller must provide matching id
    if (q.meta?.brawlerId && q.meta.brawlerId !== meta?.brawlerId) return q;
    // mode meta check
    if (q.meta?.mode && q.meta.mode !== meta?.mode) return q;
    const newProgress = Math.min(q.target, q.progress + amount);
    if (newProgress !== q.progress) { changed = true; return { ...q, progress: newProgress }; }
    return q;
  });
  if (changed) {
    updateProfile({ questPool: { ...pool, activeQuests: updatedQuests } });
  }
}

export function claimQuestReward(questId: string): { success: boolean; error?: string; rewardLabel?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Нет квестов" };
  const pool = ensureQuestPool(profile);
  const q = pool.activeQuests.find(x => x.id === questId);
  if (!q) return { success: false, error: "Квест не найден" };
  if (q.claimed) return { success: false, error: "Уже получено" };
  if (q.progress < q.target) return { success: false, error: "Цель не достигнута" };

  applyReward(profile, q.reward.type, q.reward.amount, q.reward.chestRarity);

  const updated = getCurrentProfile();
  if (!updated) return { success: false };
  const updPool = updated.questPool ?? pool;
  updateProfile({
    questPool: {
      ...updPool,
      // Claimed/completed quest leaves the list immediately.
      activeQuests: updPool.activeQuests.filter(x => x.id !== questId),
    },
  });
  return { success: true, rewardLabel: q.reward.label };
}
