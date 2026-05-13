// =========================================================================
// CHESTS — 7 rarity tiers, each with unique visuals, drop tables, and prices
// =========================================================================

export type ChestRarity = "common" | "rare" | "epic" | "mega" | "legendary" | "mythic" | "ultralegendary";

export interface ChestDef {
  rarity: ChestRarity;
  name: string;
  shortName: string;       // single word for tight UI
  tier: number;            // 1..7
  color: string;           // primary glow / accents
  secondaryColor: string;  // gradient secondary
  borderColor: string;
  description: string;
  priceCoins: number;
  priceGems: number;       // optional alternate price (gems)
  drops: ChestDropDef;
  emoji: string;           // fallback / hero emoji
}

export interface ChestDropDef {
  // Number of "items" that pop out when opened (visual + actual rolls)
  rolls: number;
  // Possible reward types and ranges per roll
  coinsRange: [number, number];
  gemsChance: number;        // 0..1 chance per roll
  gemsRange: [number, number];
  powerPointsChance: number;
  powerPointsRange: [number, number];
  // Bonus guaranteed rewards
  bonusGems?: number;
  bonusPowerPoints?: number;
  bonusCoins?: number;
  // Clash Pass XP granted on open (same as daily rewards)
  xp: number;
}

export const CHESTS: Record<ChestRarity, ChestDef> = {
  common: {
    rarity: "common",
    name: "Обычный сундук",
    shortName: "Обычный",
    tier: 1,
    color: "#9E9E9E",
    secondaryColor: "#616161",
    borderColor: "#BDBDBD",
    description: "Немного монет и пара очков прокачки.",
    priceCoins: 150,
    priceGems: 8,
    emoji: "📦",
    drops: {
      rolls: 2,
      coinsRange: [50, 150],
      gemsChance: 0.10,
      gemsRange: [1, 2],
      powerPointsChance: 0.4,
      powerPointsRange: [1, 5],
      xp: 25,
    },
  },
  rare: {
    rarity: "rare",
    name: "Редкий сундук",
    shortName: "Редкий",
    tier: 2,
    color: "#4FC3F7",
    secondaryColor: "#0288D1",
    borderColor: "#81D4FA",
    description: "Гарантированы очки прокачки и шанс на кристаллы.",
    priceCoins: 375,
    priceGems: 18,
    emoji: "🎁",
    drops: {
      rolls: 3,
      coinsRange: [300, 800],
      gemsChance: 0.15,
      gemsRange: [1, 3],
      powerPointsChance: 0.6,
      powerPointsRange: [2, 8],
      bonusPowerPoints: 2,
      xp: 50,
    },
  },
  epic: {
    rarity: "epic",
    name: "Эпический сундук",
    shortName: "Эпический",
    tier: 3,
    color: "#BA68C8",
    secondaryColor: "#7B1FA2",
    borderColor: "#CE93D8",
    description: "Хороший куш монет, очков прокачки и кристаллов.",
    priceCoins: 900,
    priceGems: 38,
    emoji: "💎",
    drops: {
      rolls: 4,
      coinsRange: [1200, 3000],
      gemsChance: 0.20,
      gemsRange: [2, 5],
      powerPointsChance: 0.7,
      powerPointsRange: [5, 15],
      bonusGems: 1,
      bonusPowerPoints: 4,
      xp: 100,
    },
  },
  mega: {
    rarity: "mega",
    name: "Мега-сундук",
    shortName: "Мега",
    tier: 4,
    color: "#FFB300",
    secondaryColor: "#E65100",
    borderColor: "#FFD54F",
    description: "Мощный набор: куча монет, очков и кристаллов.",
    priceCoins: 1725,
    priceGems: 58,
    emoji: "🏆",
    drops: {
      rolls: 5,
      coinsRange: [3500, 8000],
      gemsChance: 0.30,
      gemsRange: [3, 10],
      powerPointsChance: 0.8,
      powerPointsRange: [10, 30],
      bonusGems: 3,
      bonusPowerPoints: 8,
      bonusCoins: 200,
      xp: 200,
    },
  },
  mythic: {
    rarity: "mythic",
    name: "Мифический сундук",
    shortName: "Мифический",
    tier: 5,
    color: "#FF1744",
    secondaryColor: "#7B2FBE",
    borderColor: "#FF80AB",
    description: "Очень редкий. Огромный куш всего!",
    priceCoins: 4600,
    priceGems: 127,
    emoji: "🌌",
    drops: {
      rolls: 6,
      coinsRange: [7000, 15000],
      gemsChance: 0.40,
      gemsRange: [5, 20],
      powerPointsChance: 0.9,
      powerPointsRange: [20, 60],
      bonusGems: 8,
      bonusPowerPoints: 15,
      bonusCoins: 500,
      xp: 350,
    },
  },
  legendary: {
    rarity: "legendary",
    name: "Легендарный сундук",
    shortName: "Легендарный",
    tier: 6,
    color: "#FF6E40",
    secondaryColor: "#BF360C",
    borderColor: "#FF9E80",
    description: "Гарантированный мега-куш кристаллов.",
    priceCoins: 11500,
    priceGems: 288,
    emoji: "👑",
    drops: {
      rolls: 7,
      coinsRange: [15000, 30000],
      gemsChance: 0.60,
      gemsRange: [10, 40],
      powerPointsChance: 1.0,
      powerPointsRange: [40, 100],
      bonusGems: 20,
      bonusPowerPoints: 30,
      bonusCoins: 1500,
      xp: 600,
    },
  },
  ultralegendary: {
    rarity: "ultralegendary",
    name: "Ультралегендарный сундук",
    shortName: "Ультра",
    tier: 7,
    color: "#B388FF",
    secondaryColor: "#7C4DFF",
    borderColor: "#FFD700",
    description: "Высшая редкость. Шанс получить ультралегендарного бойца!",
    priceCoins: 20000,
    priceGems: 500,
    emoji: "✨",
    drops: {
      rolls: 8,
      coinsRange: [30000, 60000],
      gemsChance: 0.80,
      gemsRange: [20, 80],
      powerPointsChance: 1.0,
      powerPointsRange: [100, 200],
      bonusGems: 40,
      bonusPowerPoints: 60,
      bonusCoins: 5000,
      xp: 1000,
    },
  },
};

export const CHEST_RARITY_ORDER: ChestRarity[] = [
  "common", "rare", "epic", "mega", "mythic", "legendary", "ultralegendary",
];

export interface ChestRoll {
  type: "coins" | "gems" | "powerPoints" | "brawler" | "pet";
  amount: number;
  brawlerId?: string;       // when type === "brawler"
  petId?: string;           // when type === "pet"
}

function randInt(a: number, b: number): number {
  return Math.floor(a + Math.random() * (b - a + 1));
}

export function rollChestRewards(rarity: ChestRarity): ChestRoll[] {
  const def = CHESTS[rarity];
  const drops = def.drops;
  const out: ChestRoll[] = [];

  for (let i = 0; i < drops.rolls; i++) {
    // Each roll: roll one type
    const rollType = Math.random();
    if (rollType < drops.gemsChance) {
      out.push({ type: "gems", amount: randInt(drops.gemsRange[0], drops.gemsRange[1]) });
    } else if (rollType < drops.gemsChance + drops.powerPointsChance) {
      out.push({ type: "powerPoints", amount: randInt(drops.powerPointsRange[0], drops.powerPointsRange[1]) });
    } else {
      out.push({ type: "coins", amount: randInt(drops.coinsRange[0], drops.coinsRange[1]) });
    }
  }

  if (drops.bonusCoins)        out.push({ type: "coins",        amount: drops.bonusCoins });
  if (drops.bonusGems)         out.push({ type: "gems",         amount: drops.bonusGems });
  if (drops.bonusPowerPoints)  out.push({ type: "powerPoints",  amount: drops.bonusPowerPoints });

  return out;
}

export function summarizeRolls(rolls: ChestRoll[]): { coins: number; gems: number; powerPoints: number } {
  const sum = { coins: 0, gems: 0, powerPoints: 0 };
  for (const r of rolls) {
    if (r.type === "coins" || r.type === "gems" || r.type === "powerPoints") {
      sum[r.type] += r.amount;
    }
  }
  return sum;
}
