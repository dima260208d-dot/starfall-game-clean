import type { UserProfile } from "./localStorageAPI";

export interface BrawlerStarDef {
  index: number;
  name: string;
  effect: string;
  icon: string;
}

export const MAX_STARS_PER_BRAWLER = 6;
export const STAR_COST_GEMS = 500;
export const STAR_PACK3_COST_GEMS = 1200;
export const STAR_COST_RUB = 399;
export const STAR_PACK3_COST_RUB = 999;

export const BRAWLER_CONSTELLATIONS: Record<string, BrawlerStarDef[]> = {
  miya: [
    { index: 1, name: "Тень в ночи", effect: "Неуязвимость после телепорта +0.5с.", icon: "✦" },
    { index: 2, name: "Острые перья", effect: "Три сюрикена летят на 15% дальше и на 10% быстрее.", icon: "✧" },
    { index: 3, name: "Разрывная сила", effect: "Если в одну цель за выстрел попали 2+ сюрикена: +150 урона.", icon: "❖" },
    { index: 4, name: "Призрачный шаг", effect: "После супера: +25% скорости на 2с.", icon: "✪" },
    { index: 5, name: "Отравленные клинки", effect: "Кровотечение: 50 урона/с на 2с.", icon: "✹" },
    { index: 6, name: "Двойник смерти", effect: "Смертельный урон: телепорт + 20% HP (кд 60с).", icon: "✵" },
  ],
  ronin: [
    { index: 1, name: "Крепкий орешек", effect: "Макс. HP +8%.", icon: "❂" },
    { index: 2, name: "Гнев земли", effect: "Конус-атака: +100 урона целям под щитом.", icon: "✺" },
    { index: 3, name: "Несокрушимый", effect: "Щит супера длится на 1с дольше.", icon: "✷" },
    { index: 4, name: "Отражённый удар", effect: "Возврат урона щитом: 45% вместо 30%.", icon: "✸" },
    { index: 5, name: "Стойкий воин", effect: "Лечение под щитом +30%.", icon: "✶" },
    { index: 6, name: "Бессмертный самурай", effect: "Ниже 15% HP: щит 1000 на 3с (кд 90с).", icon: "✲" },
  ],
  yuki: [
    { index: 1, name: "Морозная пыль", effect: "Замедление атаки +0.5с.", icon: "❄" },
    { index: 2, name: "Целительный резонанс", effect: "Супер снимает slow/poison с союзников.", icon: "✼" },
    { index: 3, name: "Снежный ком", effect: "Каждый 3-й шар взрывается: 150 AoE.", icon: "✽" },
    { index: 4, name: "Холодный ветер", effect: "Радиус лечения супера +25%.", icon: "✾" },
    { index: 5, name: "Ледяная броня", effect: "После лечения: 10% резист на 3с.", icon: "❉" },
    { index: 6, name: "Снежная буря", effect: "Супер отталкивает врагов в 120px.", icon: "❋" },
  ],
  kenji: [
    { index: 1, name: "Ударная волна", effect: "Первый враг от цепи оглушается на 0.3с.", icon: "⚡" },
    { index: 2, name: "Заряженный", effect: "Урон цепи: 300 на цель.", icon: "⟡" },
    { index: 3, name: "Цепная реакция", effect: "Цепь прыгает до 4 врагов.", icon: "⟢" },
    { index: 4, name: "Проводник", effect: "После супера: перезарядка атаки +20% на 4с.", icon: "⟣" },
    { index: 5, name: "Изолятор", effect: "В зоне супера враги не могут дать супер.", icon: "⟐" },
    { index: 6, name: "Грозовой разряд", effect: "Новый задетый враг цепью: +100 HP.", icon: "⟠" },
  ],
  hana: [
    { index: 1, name: "Скорая помощь", effect: "Лечебная пуля снимает 1 дебафф.", icon: "✚" },
    { index: 2, name: "Капельница", effect: "Лечение выстрела: 200 вместо 150.", icon: "✙" },
    { index: 3, name: "Двойная доза", effect: "Каждый 4-й выстрел: +50% силы за 2 заряда.", icon: "✛" },
    { index: 4, name: "Цветущий аромат", effect: "Радиус супера +20%.", icon: "✜" },
    { index: 5, name: "Жизненная сила", effect: "Союзники в супер-зоне: +15% скорости.", icon: "✿" },
    { index: 6, name: "Божественное поле", effect: "После зоны супера: щит 300 на 3с.", icon: "❀" },
  ],
  goro: [
    { index: 1, name: "Ярость предков", effect: "Каждая атака: +5% скорости на 2с (до x3).", icon: "☄" },
    { index: 2, name: "Кровавый след", effect: "При суперe: +20% вампиризма на 5с.", icon: "☇" },
    { index: 3, name: "Бешеный топор", effect: "+30% урона целям ниже 30% HP.", icon: "☈" },
    { index: 4, name: "Неистовство", effect: "Супер длится +2с.", icon: "☉" },
    { index: 5, name: "Боевой клич", effect: "Союзники в 100px: +15% урона на 3с.", icon: "☊" },
    { index: 6, name: "Бессмертие", effect: "Убийство во время супера: +400 HP.", icon: "☋" },
  ],
  sora: [
    { index: 1, name: "Раскалённый пепел", effect: "Зона взрыва: +50 урона/с на 2с.", icon: "☌" },
    { index: 2, name: "Маг-ускоритель", effect: "Скорость шара +30%.", icon: "☍" },
    { index: 3, name: "Пламенный дождь", effect: "Супер по жирным целям: +10% урона.", icon: "☀" },
    { index: 4, name: "Кольцо огня", effect: "После супера: аура 100 урона/с на 3с.", icon: "☼" },
    { index: 5, name: "Бесконечная мана", effect: "Без урона 3с: перезарядка +10%.", icon: "◉" },
    { index: 6, name: "Катастрофа", effect: "Каждый 3-й шар: ещё 2 шара по 70% урона.", icon: "◎" },
  ],
  rin: [
    { index: 1, name: "Смертельный яд", effect: "Яд: 120 за тик вместо 100.", icon: "◈" },
    { index: 2, name: "Укус гадюки", effect: "Попадание кинжалом даёт slow 0.5с.", icon: "◇" },
    { index: 3, name: "Токсичное облако", effect: "Радиус супера +30%.", icon: "◆" },
    { index: 4, name: "Летучая мышь", effect: "В своём яде: +15% скорости.", icon: "◊" },
    { index: 5, name: "Эпидемия", effect: "Смерть от яда: взрыв 150 AoE.", icon: "⬟" },
    { index: 6, name: "Невидимая угроза", effect: "После супера невидимость 1.5с.", icon: "⬢" },
  ],
  taro: [
    { index: 1, name: "Улучшенные шестерни", effect: "HP турели: 300 вместо 200.", icon: "⚙" },
    { index: 2, name: "Ракетный залп", effect: "Турель стреляет на 20% быстрее.", icon: "⛭" },
    { index: 3, name: "Инженерный гений", effect: "Повторный супер снимает прошлую турель и ставит новую (на поле одна на слот отряда).", icon: "⛯" },
    { index: 4, name: "Авторемонт", effect: "Турель лечится на 20/с без урона 3с.", icon: "⛢" },
    { index: 5, name: "Электромагнит", effect: "По slow/stun целям турель +50% урона.", icon: "⌬" },
    { index: 6, name: "Сверхзаряд", effect: "При установке турели: щит 400 на 4с.", icon: "⌖" },
  ],
  zafkiel: [
    { index: 1, name: "Сжатие времени", effect: "Длительность замедления Beth увеличена с 1.5 до 2.5 секунд.", icon: "⌛" },
    { index: 2, name: "Мгновенный откат", effect: "После супера Зафкиэль мгновенно восстанавливает 1 заряд атаки.", icon: "⏪" },
    { index: 3, name: "Двойной удар", effect: "При полном стопе цели: +150 урона и +20% входящего урона цели на 2 секунды.", icon: "⚔️" },
    { index: 4, name: "Парадокс времени", effect: "Aleph откатывает дальше и снимает 1 положительный бафф с врага.", icon: "🌀" },
    { index: 5, name: "Хроно-щит", effect: "Каждое попадание даёт щит 150 на 3с (стакается до 450).", icon: "🛡️" },
    { index: 6, name: "Бесконечная петля", effect: "Супер оставляет ловушку на 10с, радиус зоны увеличен до 130.", icon: "♾️" },
  ],
};

export function getBrawlerStars(profile: UserProfile | null, brawlerId: string): number[] {
  if (!profile) return [];
  return profile.brawlerStars?.[brawlerId] || [];
}

export function getMissingStarIndices(profile: UserProfile | null, brawlerId: string): number[] {
  const have = new Set(getBrawlerStars(profile, brawlerId));
  const defs = BRAWLER_CONSTELLATIONS[brawlerId] || [];
  return defs.map(s => s.index).filter(i => !have.has(i));
}

