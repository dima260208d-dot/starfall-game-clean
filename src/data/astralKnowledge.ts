// ─── Astral Knowledge Base ─────────────────────────────────────────────────
// Helpers Astral uses to answer questions in chat. Everything here is read
// from the existing game data (BRAWLERS, MODES, PETS, CHESTS) so when balance
// or content changes, Astral's answers update automatically.

import { BRAWLERS, BRAWLER_LORE, BRAWLER_RARITY_LABEL, BRAWLER_GEM_COST } from "../entities/BrawlerData";
import { MODES } from "../data/modes";
import { PETS, PET_GEM_COST, PET_RARITY_LABEL } from "../entities/PetData";
import { CHESTS, CHEST_RARITY_ORDER } from "../utils/chests";
import { STAR_GUARDIAN_PRICE_RUB, MAIN_DAILY_COINS, MAIN_DAILY_GEMS, MAIN_DAILY_POWER, SPECIAL_REWARD_INTERVAL_DAYS } from "../utils/subscription";

const NORM_RE = /[^a-zа-яё0-9]/gi;
function norm(s: string): string {
  return (s ?? "").toLowerCase().replace(NORM_RE, "");
}

/** Find a brawler whose id or name appears in the message. */
export function findBrawlerInMessage(msg: string) {
  const n = norm(msg);
  for (const b of BRAWLERS) {
    if (n.includes(norm(b.id)) || n.includes(norm(b.name))) return b;
  }
  return null;
}

export function findPetInMessage(msg: string) {
  const n = norm(msg);
  for (const p of PETS) {
    if (n.includes(norm(p.id)) || n.includes(norm(p.name))) return p;
  }
  return null;
}

export function findModeInMessage(msg: string) {
  const n = norm(msg);
  for (const m of MODES) {
    if (n.includes(norm(m.id)) || n.includes(norm(m.name)) || n.includes(norm(m.subtitle))) return m;
  }
  // Russian aliases
  if (/showdown|столк|выживан|battle royale/i.test(msg)) return MODES.find(m => m.id === "showdown") ?? null;
  if (/crystal|кристалл/i.test(msg)) return MODES.find(m => m.id === "crystals") ?? null;
  if (/heist|сейф|ограбл/i.test(msg)) return MODES.find(m => m.id === "heist") ?? null;
  if (/gemgrab|гем|самоцвет/i.test(msg)) return MODES.find(m => m.id === "gemgrab") ?? null;
  if (/siege|осад/i.test(msg)) return MODES.find(m => m.id === "siege") ?? null;
  if (/training|тренир/i.test(msg)) return MODES.find(m => m.id === "training") ?? null;
  if (/mega|мега/i.test(msg)) return MODES.find(m => m.id === "megashowdown") ?? null;
  return null;
}

export function describeBrawler(b: ReturnType<typeof findBrawlerInMessage> & {}): string {
  if (!b) return "";
  const lore = BRAWLER_LORE[b.id] ?? "";
  const rarity = BRAWLER_RARITY_LABEL[b.rarity];
  const cost = BRAWLER_GEM_COST[b.rarity];
  return [
    `🔥 *${b.name}* (${b.role}, ${rarity}) — HP ${b.hp}, урон ${b.attackDamage}, скорость ${b.speed}.`,
    `⚔️ Атака «${b.attackName}»: ${b.attackDesc}`,
    `💥 Супер «${b.superName}»: ${b.superDesc}`,
    `💎 Открывается за ${cost} кристаллов или из сундука.`,
    lore && `📖 ${lore}`,
  ].filter(Boolean).join("\n");
}

export function describePet(p: ReturnType<typeof findPetInMessage> & {}): string {
  if (!p) return "";
  const cost = PET_GEM_COST[p.rarity];
  return [
    `🐾 *${p.name}* (${PET_RARITY_LABEL[p.rarity]}).`,
    `✨ Эффект: ${p.effectLabel}.`,
    `💎 В магазине: ${cost} кристаллов.`,
    p.description && `📖 ${p.description}`,
  ].filter(Boolean).join("\n");
}

export function describeMode(m: ReturnType<typeof findModeInMessage> & {}): string {
  if (!m) return "";
  return [
    `${m.icon} *${m.name}* — ${m.subtitle}.`,
    `🗺️ Карта: ${m.mapName}.`,
    `👥 ${m.players}.`,
    `📜 ${m.desc}`,
  ].join("\n");
}

export function chestPriceList(): string {
  const lines = CHEST_RARITY_ORDER.map(r => {
    const c = CHESTS[r];
    return `• ${c.name}: ${c.priceCoins.toLocaleString("ru-RU")} монет / ${c.priceGems} кристаллов`;
  });
  return `🎁 Цены сундуков:\n${lines.join("\n")}`;
}

export function subscriptionDescription(): string {
  return [
    `⭐ *Star Guardian* — ${STAR_GUARDIAN_PRICE_RUB}₽ в месяц.`,
    `📅 Каждый день: ${MAIN_DAILY_COINS} монет + ${MAIN_DAILY_GEMS} кристаллов + ${MAIN_DAILY_POWER} поинтов.`,
    `🎁 Каждый день: дополнительная награда на выбор (3 варианта).`,
    `⚡ Раз в ${SPECIAL_REWARD_INTERVAL_DAYS} дня: токен прокачки (+1 уровень любому бойцу).`,
    `🤖 Все функции Астрала: автобой, подсказки в бою, выполнение команд через чат.`,
  ].join("\n");
}

/** Top-level random tip (shown when player asks "что мне делать?"). */
export function randomGameplayHint(): string {
  const HINTS = [
    "💡 В Star Battle прячься в кустах и наноси первый удар — это 90% победы.",
    "💡 В Crystal Carry не лезь в драку, если несёшь 8+ кристаллов: лучше отступить и сохранить очки.",
    "💡 В Heist обходи врагов с фланга — большинство ботов фокусируются на сейфе.",
    "💡 Питомец *Огневик* поджигает врагов с шансом 10% — отличный выбор для дальнобоев.",
    "💡 Питомец *Феникс* воскрешает один раз за бой — спасатель в Showdown.",
    "💡 В Siege атакуй вражеский робот сбоку — у него меньше брони с боков.",
    "💡 Покупай мега-сундуки только в дни скидок (загляни в магазин ежедневно).",
    "💡 Уровень бойца важнее редкости — прокачай одного любимца до 9–11 уровня.",
    "💡 В Mega Star Battle переключайся на свежего бойца, как только у текущего HP < 30%.",
    "💡 Используй супер сразу при заряде 100% — нет смысла «копить про запас».",
  ];
  return HINTS[Math.floor(Math.random() * HINTS.length)];
}

export function listAllBrawlers(): string {
  const byRarity: Record<string, string[]> = {};
  for (const b of BRAWLERS) {
    const k = BRAWLER_RARITY_LABEL[b.rarity];
    (byRarity[k] ||= []).push(b.name);
  }
  const lines = Object.entries(byRarity).map(([r, names]) => `• ${r}: ${names.join(", ")}`);
  return `👥 Все бойцы:\n${lines.join("\n")}`;
}

export function listAllPets(): string {
  return `🐾 Все питомцы (${PETS.length}):\n` + PETS.map(p =>
    `• ${p.name} — ${p.effectLabel}`
  ).join("\n");
}

export function listAllModes(): string {
  return `🎮 Игровые режимы:\n` + MODES.map(m => `• ${m.icon} ${m.name} — ${m.subtitle}`).join("\n");
}
