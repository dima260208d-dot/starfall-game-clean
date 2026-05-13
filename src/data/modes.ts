import type { GameMode } from "../App";

export interface ModeInfo {
  id: GameMode;
  name: string;
  subtitle: string;
  desc: string;
  players: string;
  icon: string;
  color: string;
  gradient: string;
  mapName: string;
}

export const MODES: ModeInfo[] = [
  {
    id: "showdown",
    name: "Star Battle",
    subtitle: "Столкновение",
    desc: "Выберите формат: одиночное, парное или тройное. Газ постепенно сжимает арену, а усиления из ящиков и банок помогают пережить финал.",
    players: "Одиночное 10 • Парное 10 • Тройное 12",
    icon: "⚔️",
    color: "#FF5252",
    gradient: "linear-gradient(135deg, #B71C1C, #FF5252)",
    mapName: "Заброшенный храм",
  },
  {
    id: "crystals",
    name: "Crystal Carry",
    subtitle: "Вынос кристаллов",
    desc: "Собирайте кристаллы, что появляются в центре карты, и удерживайте их. Команда, набравшая 10 кристаллов и удержавшая их, побеждает.",
    players: "3 на 3",
    icon: "💎",
    color: "#40C4FF",
    gradient: "linear-gradient(135deg, #0D47A1, #40C4FF)",
    mapName: "Кристальная шахта",
  },
  {
    id: "siege",
    name: "Star Siege",
    subtitle: "Осада",
    desc: "Защитите свою базу от трёх волн врагов. Чем дольше держитесь — тем выше награда.",
    players: "4 против волн",
    icon: "🏰",
    color: "#69F0AE",
    gradient: "linear-gradient(135deg, #1B5E20, #69F0AE)",
    mapName: "Кристальная шахта",
  },
  {
    id: "heist",
    name: "Fallen Crown",
    subtitle: "Ограбление",
    desc: "У каждой команды есть сейф. Уничтожьте сейф врага раньше, чем они уничтожат ваш.",
    players: "3 на 3",
    icon: "🔐",
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #F57F17, #FFD700)",
    mapName: "Кристальная шахта",
  },
  {
    id: "gemgrab",
    name: "Crystal Void",
    subtitle: "Ограбление кристаллов",
    desc: "Подбирайте камни, что выпадают из центрального источника. Команда, удержавшая 10 камней одновременно в течение 15 секунд, побеждает. Если носителя убивают — он роняет все камни.",
    players: "3 на 3",
    icon: "💠",
    color: "#CE93D8",
    gradient: "linear-gradient(135deg, #4A148C, #CE93D8)",
    mapName: "Кристальная шахта",
  },
  {
    id: "starstrike",
    name: "Star Strike",
    subtitle: "Звёздный мяч",
    desc: "Футбольный бой с физическим мячом: ведите, пасуйте и забивайте. Формат матча можно выбрать: 3 на 3 или 5 на 5.",
    players: "3 на 3 или 5 на 5",
    icon: "⚽",
    color: "#66BB6A",
    gradient: "linear-gradient(135deg, #1B5E20, #66BB6A)",
    mapName: "Арена удара",
  },
  {
    id: "megashowdown",
    name: "Mega Star Battle",
    subtitle: "МЕГА-Столкновение",
    desc: "Возьмите отряд из 3 бойцов в королевскую битву. Когда активный боец умирает — в бой выходит следующий из отряда. Кнопка «Сменить» (кулдаун 3 сек) переключает между живыми бойцами. Банки усиления действуют на весь отряд. Награды — в 1.5 раза больше обычных.",
    players: "Отряд 3 на 5–10 врагов",
    icon: "✨",
    color: "#FFD54F",
    gradient: "linear-gradient(135deg, #B71C1C, #FFD54F)",
    mapName: "Заброшенный храм",
  },
  {
    id: "bossraid",
    name: "Бой с боссом",
    subtitle: "Рейд на босса",
    desc: "Пять бойцов против одного босса. Уровни 1–5 с наградой за первое прохождение, дальше бесконечное усиление. Кубки за матч не начисляются.",
    players: "5 против 1",
    icon: "👑",
    color: "#FFD54F",
    gradient: "linear-gradient(135deg, #4A148C, #FFD54F)",
    mapName: "Арена босса",
  },
];

export function getModeInfo(id: string): ModeInfo {
  return MODES.find(m => m.id === id) || MODES[0];
}
