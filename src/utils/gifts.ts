// =========================================================================
// GIFTS — admin broadcast & per-player claim queue.
// Admin sends a multi-item gift package; the package is appended to every
// registered profile's pending-gift queue. Players claim them one-by-one
// from the main menu.
// =========================================================================

import { CHESTS, type ChestRarity } from "./chests";
import { PETS, PET_GEM_COST } from "../entities/PetData";
import { BRAWLERS, BRAWLER_GEM_COST } from "../entities/BrawlerData";
import {
  getCurrentProfile, getAllProfiles, saveProfiles, updateProfile,
  type UserProfile,
} from "./localStorageAPI";

export type GiftItem =
  | { kind: "coins";       amount: number }
  | { kind: "gems";        amount: number }
  | { kind: "powerPoints"; amount: number }
  | { kind: "chest";       rarity: ChestRarity; count: number }
  | { kind: "pet";         petId: string }
  | { kind: "brawler";     brawlerId: string };

export interface PendingGift {
  id: string;
  message: string;        // up to 200 chars
  items: GiftItem[];      // up to 5
  sentAt: number;
  fromAdmin: string;      // "developers" / admin display name
}

export const MAX_GIFT_ITEMS    = 5;
export const MAX_GIFT_MESSAGE  = 200;
export const MAX_AMOUNT_GEMS   = 10000;
export const MAX_AMOUNT_COINS  = 10000;
export const MAX_AMOUNT_PP     = 10000;
export const MAX_AMOUNT_CHEST  = 50;

const GIFT_FIELD = "pendingGifts" as const; // stored on UserProfile (free-form)

// ── Read pending gifts ───────────────────────────────────────────────────
export function getPendingGifts(): PendingGift[] {
  const p: any = getCurrentProfile();
  if (!p) return [];
  return (p[GIFT_FIELD] as PendingGift[] | undefined) ?? [];
}

// ── Broadcast to all users ───────────────────────────────────────────────
export function broadcastGift(opts: {
  items: GiftItem[];
  message: string;
  fromAdmin?: string;
}): { success: boolean; recipients: number; error?: string } {
  if (opts.items.length === 0) return { success: false, recipients: 0, error: "Нет предметов" };
  if (opts.items.length > MAX_GIFT_ITEMS) {
    return { success: false, recipients: 0, error: `Не более ${MAX_GIFT_ITEMS} предметов` };
  }
  const message = (opts.message ?? "").slice(0, MAX_GIFT_MESSAGE);
  const all = getAllProfiles();
  const id = `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const stamp = Date.now();
  let recipients = 0;
  for (const username of Object.keys(all)) {
    const prof = all[username] as any;
    const queue: PendingGift[] = prof[GIFT_FIELD] ?? [];
    queue.push({
      id,
      message,
      items: opts.items,
      sentAt: stamp,
      fromAdmin: opts.fromAdmin ?? "developers",
    });
    prof[GIFT_FIELD] = queue;
    recipients += 1;
  }
  saveProfiles(all);
  return { success: true, recipients };
}

// ── Claim a gift ─────────────────────────────────────────────────────────
export function claimGift(giftId: string): { success: boolean; error?: string } {
  const p: any = getCurrentProfile();
  if (!p) return { success: false, error: "Не авторизован" };
  const queue: PendingGift[] = p[GIFT_FIELD] ?? [];
  const gift = queue.find(g => g.id === giftId);
  if (!gift) return { success: false, error: "Подарок не найден" };

  // Apply each item to a fresh patch on top of the current profile.
  let patch: Partial<UserProfile> & Record<string, any> = {};
  const cur = { ...p } as UserProfile & Record<string, any>;
  // Apply items one-by-one, mutating cur+patch so subsequent items see the
  // up-to-date totals (used when multiple coins/gems items are bundled).
  for (const it of gift.items) {
    applyGiftItem(it, cur, patch);
  }
  // Remove the claimed gift from the queue.
  patch[GIFT_FIELD] = queue.filter(g => g.id !== giftId);
  updateProfile(patch);
  return { success: true };
}

function applyGiftItem(
  it: GiftItem,
  cur: UserProfile & Record<string, any>,
  patch: Partial<UserProfile> & Record<string, any>,
): void {
  switch (it.kind) {
    case "coins": {
      const next = (patch.coins ?? cur.coins) + Math.max(0, it.amount);
      patch.coins = next; cur.coins = next;
      break;
    }
    case "gems": {
      const next = (patch.gems ?? cur.gems) + Math.max(0, it.amount);
      patch.gems = next; cur.gems = next;
      break;
    }
    case "powerPoints": {
      const next = (patch.powerPoints ?? cur.powerPoints) + Math.max(0, it.amount);
      patch.powerPoints = next; cur.powerPoints = next;
      break;
    }
    case "chest": {
      const baseInv = patch.chestInventory ?? cur.chestInventory;
      const nextInv = {
        ...baseInv,
        [it.rarity]: (baseInv[it.rarity] || 0) + Math.max(0, it.count),
      };
      patch.chestInventory = nextInv; cur.chestInventory = nextInv;
      break;
    }
    case "pet": {
      const owned = (patch.unlockedPets ?? cur.unlockedPets ?? []) as string[];
      if (owned.includes(it.petId)) {
        const def = PETS.find(p => p.id === it.petId);
        if (def) {
          const refund = Math.round(PET_GEM_COST[def.rarity] * 0.5);
          const nextG = (patch.gems ?? cur.gems) + refund;
          patch.gems = nextG; cur.gems = nextG;
        }
      } else {
        const nextOwned = [...owned, it.petId];
        const nextNew = [...((patch.newPets ?? cur.newPets ?? []) as string[]), it.petId];
        patch.unlockedPets = nextOwned; cur.unlockedPets = nextOwned;
        patch.newPets = nextNew; cur.newPets = nextNew;
      }
      break;
    }
    case "brawler": {
      const owned = (patch.unlockedBrawlers ?? cur.unlockedBrawlers) as string[];
      if (owned.includes(it.brawlerId)) {
        const def = BRAWLERS.find(b => b.id === it.brawlerId);
        if (def) {
          const refund = Math.round(BRAWLER_GEM_COST[def.rarity] * 0.5);
          const nextG = (patch.gems ?? cur.gems) + refund;
          patch.gems = nextG; cur.gems = nextG;
        }
      } else {
        const nextOwned = [...owned, it.brawlerId];
        const nextNew = [...((patch.newBrawlers ?? cur.newBrawlers ?? []) as string[]), it.brawlerId];
        patch.unlockedBrawlers = nextOwned; cur.unlockedBrawlers = nextOwned;
        patch.newBrawlers = nextNew; cur.newBrawlers = nextNew;
      }
      break;
    }
  }
}

// ── Helpers for the admin UI ─────────────────────────────────────────────
export function describeGiftItem(it: GiftItem): string {
  switch (it.kind) {
    case "coins":       return `${it.amount} монет`;
    case "gems":        return `${it.amount} кристаллов`;
    case "powerPoints": return `${it.amount} очков силы`;
    case "chest":       return `${CHESTS[it.rarity].name} ×${it.count}`;
    case "pet":         return `Питомец «${PETS.find(p => p.id === it.petId)?.name ?? it.petId}»`;
    case "brawler":     return `Боец «${BRAWLERS.find(b => b.id === it.brawlerId)?.name ?? it.brawlerId}»`;
  }
}
