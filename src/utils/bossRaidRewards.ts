import type { ChestRarity } from "./chests";
import { updateProfile, getCurrentProfile } from "./localStorageAPI";
import { defaultBossRaidSlice } from "./bossRaidProgress";

export interface BossRaidLevelReward {
  coins: number;
  powerPoints: number;
  gems: number;
  chest?: { rarity: ChestRarity; count: number };
}

/** First-clear rewards for levels 1–5 (per boss). */
export const BOSS_RAID_LEVEL_REWARDS: Record<number, BossRaidLevelReward> = {
  1: { coins: 400, powerPoints: 15, gems: 5, chest: { rarity: "common", count: 1 } },
  2: { coins: 650, powerPoints: 25, gems: 8, chest: { rarity: "rare", count: 1 } },
  3: { coins: 900, powerPoints: 40, gems: 12, chest: { rarity: "rare", count: 1 } },
  4: { coins: 1200, powerPoints: 55, gems: 18, chest: { rarity: "epic", count: 1 } },
  5: { coins: 1800, powerPoints: 80, gems: 30, chest: { rarity: "epic", count: 1 } },
};

export interface GrantBossRaidRewardResult {
  granted: boolean;
  reward?: BossRaidLevelReward;
  reason?: string;
}

/**
 * On boss raid victory: bump maxDefeated, then grant first-clear bundle for levels 1–5 once.
 */
export function finalizeBossRaidVictory(bossId: string, level: number): GrantBossRaidRewardResult {
  const profile = getCurrentProfile();
  if (!profile) return { granted: false, reason: "no_profile" };
  const raid = profile.bossRaid ?? defaultBossRaidSlice();
  const per = raid.byBoss[bossId] ?? { maxDefeated: 0, claimedLevels: [] };
  const maxDefeated = Math.max(per.maxDefeated, level);
  let coins = profile.coins;
  let powerPoints = profile.powerPoints;
  let gems = profile.gems;
  const chestInv = { ...profile.chestInventory };
  let grantedReward: BossRaidLevelReward | undefined;
  let granted = false;

  if (level >= 1 && level <= 5 && !per.claimedLevels.includes(level)) {
    const def = BOSS_RAID_LEVEL_REWARDS[level];
    if (def) {
      granted = true;
      grantedReward = def;
      coins += def.coins;
      powerPoints += def.powerPoints;
      gems += def.gems;
      if (def.chest) {
        const r = def.chest.rarity;
        chestInv[r] = (chestInv[r] || 0) + def.chest.count;
      }
    }
  }

  const claimedLevels = granted
    ? [...per.claimedLevels, level].sort((a, b) => a - b)
    : per.claimedLevels;

  const byBoss = {
    ...raid.byBoss,
    [bossId]: {
      ...per,
      maxDefeated,
      claimedLevels,
    },
  };

  updateProfile({
    coins,
    powerPoints,
    gems,
    chestInventory: chestInv,
    bossRaid: { ...raid, byBoss },
  });

  return granted ? { granted: true, reward: grantedReward } : { granted: false, reason: "repeat_or_no_tier" };
}
