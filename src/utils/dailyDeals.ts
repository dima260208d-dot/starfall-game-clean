// =========================================================================
// DAILY SHOP DEALS
// -------------------------------------------------------------------------
// Generates a fresh set of ~15 deals every calendar day from a weighted
// admin-editable pool. Deals are GLOBAL: every player sees the same set on
// the same day, while each profile tracks which deal IDs they bought.
// Admins can edit the pool, mark a deal "special" (heavier weight), force a
// regenerate, or pin a specific deal for testing.
// =========================================================================

import { CHESTS, type ChestRarity, CHEST_RARITY_ORDER } from "./chests";
import { PETS, PET_GEM_COST, type PetRarity } from "../entities/PetData";
import {
  getCurrentProfile, updateProfile, addCoins, addGems, grantChest,
} from "./localStorageAPI";

const POOL_KEY        = "clash_deals_pool_v1";
const TODAY_KEY       = "clash_deals_today_v1";
const HISTORY_KEY     = "clash_deals_history_v1";
const FORCED_KEY      = "clash_deals_forced_v1";  // optional admin-pinned deal id

export const DAILY_DEALS_COUNT = 15;

// ── Deal types ──────────────────────────────────────────────────────────
export type Currency = "coins" | "gems";

export type DealItem =
  | { kind: "coins";       amount: number }
  | { kind: "gems";        amount: number }
  | { kind: "powerPoints"; amount: number }
  | { kind: "chest";       rarity: ChestRarity; count: number }
  | { kind: "pet";         petId: string }
  | { kind: "upgradeDiscount"; percent: number; uses: number }; // queued discount on upgradeBrawler

export interface DealTemplate {
  id: string;            // pool id (stable)
  title: string;         // human label, e.g. "Скидка на обычный сундук"
  items: DealItem[];     // contents of the deal (1 or many = bundle)
  priceCurrency: Currency;
  priceAmount: number;   // price the player pays
  baselineAmount?: number; // optional shown-as struck-through baseline
  weight: number;        // base draw weight (1..100)
  special?: boolean;     // doubles weight; appears more often
  category?: "discount" | "bundle" | "freebie" | "rare";
  iconColor?: string;    // accent color for the card
}

// Today's snapshot: an instance of a template, with a fresh per-day id.
export interface ActiveDeal extends DealTemplate {
  instanceId: string;    // unique per-day id stored in profile.boughtDeals
  date: string;          // YYYY-MM-DD this snapshot belongs to
}

interface TodaySnapshot {
  date: string;
  deals: ActiveDeal[];
  generatedAt: number;
}

// ── Default pool ─────────────────────────────────────────────────────────
// Reasonable baseline so the shop always has something. Admins may freely
// add/remove/edit entries via the admin panel.
function buildDefaultPool(): DealTemplate[] {
  const out: DealTemplate[] = [];

  // Chest discounts (one per common-mythic, 25% off coins)
  CHEST_RARITY_ORDER.filter(r => r !== "ultralegendary").forEach(rarity => {
    const def = CHESTS[rarity];
    const discounted = Math.round(def.priceCoins * 0.75 / 5) * 5;
    out.push({
      id: `discount_chest_${rarity}_coins`,
      title: `${def.name} — скидка 25%`,
      items: [{ kind: "chest", rarity, count: 1 }],
      priceCurrency: "coins",
      priceAmount: discounted,
      baselineAmount: def.priceCoins,
      weight: rarity === "common" ? 18 : rarity === "rare" ? 14 : rarity === "epic" ? 9 : 5,
      category: "discount",
      iconColor: def.color,
    });
  });

  // Pure currency packs
  out.push({
    id: "pack_coins_500",
    title: "Пакет монет",
    items: [{ kind: "coins", amount: 500 }],
    priceCurrency: "gems", priceAmount: 18, baselineAmount: 25,
    weight: 12, category: "bundle", iconColor: "#FFD700",
  });
  out.push({
    id: "pack_pp_50",
    title: "Очки силы x50",
    items: [{ kind: "powerPoints", amount: 50 }],
    priceCurrency: "coins", priceAmount: 250, baselineAmount: 350,
    weight: 14, category: "bundle", iconColor: "#CE93D8",
  });
  out.push({
    id: "pack_gems_25",
    title: "Кристаллы x25",
    items: [{ kind: "gems", amount: 25 }],
    priceCurrency: "coins", priceAmount: 1500, baselineAmount: 2200,
    weight: 8, category: "bundle", iconColor: "#40C4FF",
  });

  // Bundles
  out.push({
    id: "bundle_lucky",
    title: "Пакет «Удача»",
    items: [
      { kind: "chest", rarity: "common", count: 3 },
      { kind: "powerPoints", amount: 50 },
    ],
    priceCurrency: "coins", priceAmount: 250, baselineAmount: 500,
    weight: 10, category: "bundle", iconColor: "#76FF03",
  });
  out.push({
    id: "bundle_starter",
    title: "Пакет новичка",
    items: [
      { kind: "chest", rarity: "rare", count: 1 },
      { kind: "coins", amount: 200 },
      { kind: "powerPoints", amount: 30 },
    ],
    priceCurrency: "gems", priceAmount: 35, baselineAmount: 60,
    weight: 8, category: "bundle", iconColor: "#4FC3F7",
  });
  out.push({
    id: "bundle_warlord",
    title: "Пакет полководца",
    items: [
      { kind: "chest", rarity: "epic", count: 1 },
      { kind: "powerPoints", amount: 80 },
      { kind: "coins", amount: 500 },
    ],
    priceCurrency: "gems", priceAmount: 90, baselineAmount: 140,
    weight: 5, category: "bundle", iconColor: "#AB47BC", special: true,
  });

  // Pet discounts (only the lower rarities to keep pool balanced)
  PETS.filter(p => (["common", "rare", "epic"] as PetRarity[]).includes(p.rarity)).forEach(p => {
    const base = PET_GEM_COST[p.rarity];
    const discounted = Math.round(base * 0.7 / 5) * 5;
    out.push({
      id: `discount_pet_${p.id}`,
      title: `Питомец «${p.name}»`,
      items: [{ kind: "pet", petId: p.id }],
      priceCurrency: "gems", priceAmount: discounted, baselineAmount: base,
      weight: p.rarity === "common" ? 7 : p.rarity === "rare" ? 5 : 3,
      category: p.rarity === "epic" ? "rare" : "discount",
      iconColor: p.color,
    });
  });

  // Upgrade discount voucher
  out.push({
    id: "voucher_upgrade_10",
    title: "Купон: -10% на улучшение бойца (3 раза)",
    items: [{ kind: "upgradeDiscount", percent: 10, uses: 3 }],
    priceCurrency: "gems", priceAmount: 20, baselineAmount: 30,
    weight: 6, category: "discount", iconColor: "#FFD54F",
  });
  out.push({
    id: "voucher_upgrade_20",
    title: "Купон: -20% на улучшение (1 раз)",
    items: [{ kind: "upgradeDiscount", percent: 20, uses: 1 }],
    priceCurrency: "gems", priceAmount: 12, baselineAmount: 18,
    weight: 8, category: "discount", iconColor: "#FFAB00",
  });

  // A rare ultra-deal
  out.push({
    id: "freebie_daily_pp",
    title: "Подарок: 20 очков силы за 1 монету",
    items: [{ kind: "powerPoints", amount: 20 }],
    priceCurrency: "coins", priceAmount: 1, baselineAmount: 140,
    weight: 2, category: "freebie", iconColor: "#FF8A65",
  });

  return out;
}

// ── Pool persistence ─────────────────────────────────────────────────────
export function getDealPool(): DealTemplate[] {
  try {
    const raw = localStorage.getItem(POOL_KEY);
    if (!raw) {
      const def = buildDefaultPool();
      localStorage.setItem(POOL_KEY, JSON.stringify(def));
      return def;
    }
    return JSON.parse(raw) as DealTemplate[];
  } catch { return buildDefaultPool(); }
}

export function saveDealPool(pool: DealTemplate[]): void {
  localStorage.setItem(POOL_KEY, JSON.stringify(pool));
}

export function upsertDealTemplate(t: DealTemplate): void {
  const pool = getDealPool();
  const idx = pool.findIndex(p => p.id === t.id);
  if (idx >= 0) pool[idx] = t; else pool.push(t);
  saveDealPool(pool);
}

export function removeDealTemplate(id: string): void {
  saveDealPool(getDealPool().filter(p => p.id !== id));
}

// ── Daily snapshot ───────────────────────────────────────────────────────
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function pickWeighted<T extends { weight: number; special?: boolean }>(arr: T[], rng: () => number): T {
  const total = arr.reduce((s, x) => s + x.weight * (x.special ? 2 : 1), 0);
  let r = rng() * total;
  for (const x of arr) {
    const w = x.weight * (x.special ? 2 : 1);
    if ((r -= w) <= 0) return x;
  }
  return arr[arr.length - 1];
}

function generateForDate(date: string, count: number): TodaySnapshot {
  const pool = getDealPool();
  const deals: ActiveDeal[] = [];
  // Forced deal pinned by admin always slot 0.
  const forcedId = localStorage.getItem(FORCED_KEY);
  if (forcedId) {
    const forced = pool.find(p => p.id === forcedId);
    if (forced) {
      deals.push({ ...forced, instanceId: `${date}_${forced.id}_0`, date });
    }
  }
  // Avoid duplicates by removing each picked template from working pool.
  const working = pool.filter(p => !forcedId || p.id !== forcedId);
  while (deals.length < count && working.length > 0) {
    const pick = pickWeighted(working, Math.random);
    deals.push({
      ...pick,
      instanceId: `${date}_${pick.id}_${deals.length}`,
      date,
    });
    const idx = working.indexOf(pick);
    working.splice(idx, 1);
  }
  return { date, deals, generatedAt: Date.now() };
}

export function getTodaysDeals(): ActiveDeal[] {
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (raw) {
      const snap = JSON.parse(raw) as TodaySnapshot;
      if (snap.date === todayKey()) return snap.deals;
      // Roll over: archive old snapshot into history.
      pushHistory(snap);
    }
  } catch { /* ignore */ }
  const fresh = generateForDate(todayKey(), DAILY_DEALS_COUNT);
  localStorage.setItem(TODAY_KEY, JSON.stringify(fresh));
  return fresh.deals;
}

export function regenerateTodayDeals(): ActiveDeal[] {
  // Archive the current snapshot first so admins can review what was shown.
  try {
    const raw = localStorage.getItem(TODAY_KEY);
    if (raw) pushHistory(JSON.parse(raw));
  } catch { /* ignore */ }
  const fresh = generateForDate(todayKey(), DAILY_DEALS_COUNT);
  localStorage.setItem(TODAY_KEY, JSON.stringify(fresh));
  return fresh.deals;
}

function pushHistory(snap: TodaySnapshot): void {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const arr = raw ? (JSON.parse(raw) as TodaySnapshot[]) : [];
    arr.unshift(snap);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(0, 14)));
  } catch { /* ignore */ }
}

export function getDealsHistory(): TodaySnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TodaySnapshot[]) : [];
  } catch { return []; }
}

export function getMsUntilDealsReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

export function setForcedDeal(id: string | null): void {
  if (id) localStorage.setItem(FORCED_KEY, id);
  else localStorage.removeItem(FORCED_KEY);
}

export function getForcedDealId(): string | null {
  return localStorage.getItem(FORCED_KEY);
}

// ── Per-user purchase tracking ───────────────────────────────────────────
// We persist bought instance ids on the profile under a free-form key so we
// don't have to amend the UserProfile interface.
const BOUGHT_FIELD = "boughtDeals" as const;

interface DealsBoughtRecord {
  date: string;
  ids: string[];
  upgradeVouchers?: { percent: number; uses: number }[];
}

function getBoughtRecord(): DealsBoughtRecord {
  const p = getCurrentProfile() as any;
  if (!p) return { date: todayKey(), ids: [] };
  const r: DealsBoughtRecord | undefined = p[BOUGHT_FIELD];
  if (!r || r.date !== todayKey()) {
    // Reset for the new day but keep upgrade vouchers (they persist across days).
    return { date: todayKey(), ids: [], upgradeVouchers: r?.upgradeVouchers ?? [] };
  }
  return r;
}

function saveBoughtRecord(r: DealsBoughtRecord): void {
  updateProfile({ [BOUGHT_FIELD]: r } as any);
}

export function isDealBought(instanceId: string): boolean {
  return getBoughtRecord().ids.includes(instanceId);
}

export function purchaseDeal(deal: ActiveDeal): { success: boolean; error?: string } {
  const profile = getCurrentProfile();
  if (!profile) return { success: false, error: "Не авторизован" };
  if (isDealBought(deal.instanceId)) return { success: false, error: "Уже куплено сегодня" };
  // Check funds
  if (deal.priceCurrency === "coins" && profile.coins < deal.priceAmount) {
    return { success: false, error: "Недостаточно монет" };
  }
  if (deal.priceCurrency === "gems" && profile.gems < deal.priceAmount) {
    return { success: false, error: "Недостаточно кристаллов" };
  }
  // Charge
  if (deal.priceCurrency === "coins") {
    updateProfile({ coins: profile.coins - deal.priceAmount });
  } else {
    updateProfile({ gems: profile.gems - deal.priceAmount });
  }
  // Grant items
  const rec = getBoughtRecord();
  for (const item of deal.items) {
    grantDealItem(item, rec);
  }
  // Mark as bought
  rec.ids = [...rec.ids, deal.instanceId];
  saveBoughtRecord(rec);
  return { success: true };
}

function grantDealItem(item: DealItem, rec: DealsBoughtRecord): void {
  switch (item.kind) {
    case "coins":       addCoins(item.amount); break;
    case "gems":        addGems(item.amount); break;
    case "powerPoints": {
      const p = getCurrentProfile();
      if (p) updateProfile({ powerPoints: p.powerPoints + item.amount });
      break;
    }
    case "chest":       grantChest(item.rarity, item.count); break;
    case "pet": {
      const p: any = getCurrentProfile();
      if (!p) break;
      const owned: string[] = p.unlockedPets || [];
      if (owned.includes(item.petId)) {
        // Compensation: 50% of the listed gem price.
        const def = PETS.find(pp => pp.id === item.petId);
        if (def) addGems(Math.round(PET_GEM_COST[def.rarity] * 0.5));
      } else {
        const newPets = [...(p.newPets || []), item.petId];
        updateProfile({
          unlockedPets: [...owned, item.petId],
          newPets,
        });
      }
      break;
    }
    case "upgradeDiscount": {
      rec.upgradeVouchers = [
        ...(rec.upgradeVouchers ?? []),
        { percent: item.percent, uses: item.uses },
      ];
      break;
    }
  }
}

// Used by upgradeBrawler() to apply queued discount vouchers.
export function consumeUpgradeVoucher(): { percent: number } | null {
  const rec = getBoughtRecord();
  const v = rec.upgradeVouchers?.[0];
  if (!v) return null;
  const next = { ...v, uses: v.uses - 1 };
  const tail = rec.upgradeVouchers!.slice(1);
  rec.upgradeVouchers = next.uses > 0 ? [next, ...tail] : tail;
  saveBoughtRecord(rec);
  return { percent: v.percent };
}

export function listUpgradeVouchers(): { percent: number; uses: number }[] {
  return getBoughtRecord().upgradeVouchers ?? [];
}
