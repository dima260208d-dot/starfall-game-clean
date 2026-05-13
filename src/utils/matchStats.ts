// ── Per-match statistics tracker ─────────────────────────────────────────────
// Brawler.ts and game modes increment these during a match.
// recordGameResult reads them once, then resets.

export interface MatchStats {
  damageDealt:         number;
  healingDone:         number;
  superUses:           number;
  killCount:           number;
  powerCubesCollected: number;
  petBonusCoins:       number; // bonus coins awarded by the equipped pet (kill bonus, etc.)
}

const _stats: MatchStats = {
  damageDealt: 0,
  healingDone: 0,
  superUses: 0,
  killCount: 0,
  powerCubesCollected: 0,
  petBonusCoins: 0,
};

export function resetMatchStats(): void {
  _stats.damageDealt = 0;
  _stats.healingDone = 0;
  _stats.superUses = 0;
  _stats.killCount = 0;
  _stats.powerCubesCollected = 0;
  _stats.petBonusCoins = 0;
}

export function addMatchStat(key: keyof MatchStats, amount: number): void {
  _stats[key] += amount;
}

export function getMatchStats(): MatchStats {
  return { ..._stats };
}
