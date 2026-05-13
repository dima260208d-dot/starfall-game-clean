import type { ChestRarity } from "../utils/chests";

export interface BrawlerStats {
  id: string;
  name: string;
  role: string;
  rarity: ChestRarity;
  hp: number;
  speed: number;
  regenRate: number;
  attackDamage: number;
  attackRange: number;
  attackCooldown: number;
  attackCharges: number;
  superCooldown: number;
  // Percent of the super bar gained per successful hit on an enemy (0-100).
  // Super now charges *only* from landing hits — no passive/auto-charge.
  superChargePerHit: number;
  color: string;
  secondaryColor: string;
  accentColor: string;
  description: string;
  attackName: string;
  superName: string;
  attackDesc: string;
  superDesc: string;
  spriteRow: number;
  spriteCol: number;
}

// Russian labels for the chest-style rarity tiers when used on a brawler.
export const BRAWLER_RARITY_LABEL: Record<ChestRarity, string> = {
  common:         "Обычный",
  rare:           "Редкий",
  epic:           "Эпический",
  mega:           "Мега",
  legendary:      "Легендарный",
  mythic:         "Мифический",
  ultralegendary: "Ультралегендарный",
};

// Gem cost to unlock a brawler in the shop, scaled by rarity.
export const BRAWLER_GEM_COST: Record<ChestRarity, number> = {
  common:         20,
  rare:           60,
  epic:           150,
  mega:           300,
  legendary:      600,
  mythic:         1200,
  ultralegendary: 5000,
};

// Per-chest chance to drop a brawler (instead of a normal reward roll).
// Higher rarity chests have a higher chance to drop brawlers.
export const CHEST_BRAWLER_DROP_CHANCE: Record<ChestRarity, number> = {
  common:         0.03,   //  3%
  rare:           0.05,   //  5%
  epic:           0.08,   //  8%
  mega:           0.12,   // 12%
  mythic:         0.15,   // 15%
  legendary:      0.20,   // 20%
  ultralegendary: 0.37,   // 37% (mythic 20% + legendary 12% + ultralegendary 5%)
};

// Brawler rarity tiers that can drop from each chest type.
// Higher tier chests can drop brawlers of equal or lower rarity.
export const CHEST_BRAWLER_RARITY_WEIGHTS: Record<ChestRarity, Partial<Record<ChestRarity, number>>> = {
  common:         { common: 1 },
  rare:           { common: 0.85, rare: 0.15 },
  epic:           { common: 0.6, rare: 0.3, epic: 0.1 },
  mega:           { common: 0.5, rare: 0.3, epic: 0.15, mega: 0.05 },
  mythic:         { common: 0.4, rare: 0.25, epic: 0.2, mega: 0.1, mythic: 0.05 },
  legendary:      { epic: 0.5, mega: 0.3, legendary: 0.2 },
  ultralegendary: { mythic: 0.63, legendary: 0.32, ultralegendary: 0.05 },
};

// Backstory/lore for each brawler, shown on the character detail page.
export const BRAWLER_LORE: Record<string, string> = {
  miya:    "Мия выросла в скрытой деревне теневых клинков. После того как враждебный клан уничтожил её дом, она поклялась вершить правосудие в одиночку. За один бросок она выпускает три сюрикена — те не знают промаха, а тренировки в искусстве телепортации сделали её самым быстрым убийцей в Арене.",
  ronin:   "Когда-то Ронин был генералом императорской армии. Преданный собственными лордами, он надел старые доспехи и стал вольным самураем. Его катана разрубает камень, а щит выдерживает залпы из десятка винтовок.",
  yuki:    "Юки родилась в горном храме, где училась искусству целительной магии льда. Она пришла в Арену, чтобы найти брата, пропавшего в одном из турниров. До тех пор она лечит союзников и замораживает любого, кто встанет на пути.",
  kenji:   "Кендзи — гениальный изобретатель, выгнанный из университета за «слишком опасные эксперименты». Его электрошокеры собраны из деталей старых автоматов, а молнии прыгают между врагами как живые. Он выходит на арену, чтобы доказать, что был прав.",
  hana:    "Хана — фронтовой медик из Розового госпиталя. Её пистолет одинаково хорошо лечит союзников и продырявливает броню врагов. Она верит, что добро и сила могут идти рука об руку, и ни разу не сдалась перед безнадёжным пациентом.",
  goro:    "Горо — горный варвар, сошедший с северных вершин. Он не помнит своего детства, но помнит вкус победы. Двойные топоры он выковал собственными руками, и ни один щит не выдерживал двух его ударов подряд.",
  sora:    "Сора — придворный маг, изгнанный за то, что осмелился изучать запретные звёздные руны. Его летающая книга шепчет ему древние формулы, а метеоритный дождь оставляет шрамы на самой арене.",
  rin:     "Рин выросла в зелёных джунглях среди ядовитых растений. Каждый её кинжал смазан личным составом яда, формулу которого не знает никто. Она появляется бесшумно, отравляет цель и исчезает в зарослях прежде, чем кто-то успеет среагировать.",
  taro:    "Таро — пожилой инженер, который собрал свой первый шагоход в шесть лет. Гаечный ключ в его руках — оружие пострашнее меча, а турели, что он расставляет на поле боя, держат позиции часами. Не недооценивайте старика.",
  zafkiel: "Зафкиэль — хранитель времени и пространства, последний из ордена Хроностражей. Он управляет потоками времени, возвращая врагов в прошлое или ускоряя их к неизбежной судьбе. Его Врата Вечности — точка, где прошлое и будущее сливаются в одно мгновение. Те, кто встаёт на его пути, обнаруживают, что их движения уже давно предрешены.",
};

export const BRAWLERS: BrawlerStats[] = [
  {
    id: "miya",
    name: "Мия",
    role: "Ассасин",
    rarity: "legendary",
    hp: 3600,
    speed: 5.2,
    regenRate: 360,
    attackDamage: 400,
    attackRange: 220,
    attackCooldown: 1.2,
    attackCharges: 3,
    superCooldown: 20,
    superChargePerHit: 8,
    color: "#7B2FBE",
    secondaryColor: "#4A0080",
    accentColor: "#FF1744",
    description: "Девушка-ниндзя с фиолетовыми волосами; в бою бросает три сюрикена веером",
    attackName: "Теневые клинки",
    superName: "Разрыв реальности",
    attackDesc: "Мия быстро бросает 3 сюрикена веером: центральный летит прямо на 220 ед., боковые — под углом ±15° от прицела. Каждый наносит 400 урона при попадании (до 1200 суммарно, если все три попадут). 3 заряда атаки, перезарядка 1.2 сек. Удобно перекрывать коридор или добивать цель плотным веером и сразу отступать.",
    superDesc: "Мия мгновенно телепортируется за спину ближайшему врагу в радиусе 400 ед., наносит ему усиленный удар и накладывает замедление -40% на 2 секунды; сама получает +20% скорости на 1 сек. Используй супер → три заряда атаки по три сюрикена (до 9 снарядов подряд) для добивания.",
    spriteRow: 0,
    spriteCol: 0,
  },
  {
    id: "ronin",
    name: "Ronin",
    role: "Танк",
    rarity: "epic",
    hp: 5500,
    speed: 3.2,
    regenRate: 240,
    attackDamage: 300,
    attackRange: 160,
    attackCooldown: 1.4,
    attackCharges: 2,
    superCooldown: 22,
    superChargePerHit: 18,
    color: "#B71C1C",
    secondaryColor: "#FFD700",
    accentColor: "#FF6F00",
    description: "Огромный самурай в красных доспехах с катаной",
    attackName: "Столб земли",
    superName: "Несокрушимая стена",
    attackDesc: "Ронин делает широкий взмах катаной, поражая всех в конусе 60° перед собой (дальность 160 ед.). Наносит 300 урона каждой цели. 2 заряда, перезарядка 1.4 сек — можно нанести 2 удара подряд (до 600 одной цели). Чем ближе враг — тем выше вероятность обоих попаданий.",
    superDesc: "Ронин поднимает бронированный щит на 5 секунд: входящий урон снижается на 50%, а 30% поглощённого урона отражается обратно атакующему. Скорость снижается на 15%, но атаки катаной продолжаются. Оптимален для принятия огня группы врагов — наносит им reflected-урон суммарно.",
    spriteRow: 0,
    spriteCol: 2,
  },
  {
    id: "yuki",
    name: "Yuki",
    role: "Поддержка",
    rarity: "mega",
    hp: 3200,
    speed: 4.2,
    regenRate: 420,
    attackDamage: 200,
    attackRange: 350,
    attackCooldown: 1.0,
    attackCharges: 3,
    superCooldown: 18,
    superChargePerHit: 14,
    color: "#0288D1",
    secondaryColor: "#E1F5FE",
    accentColor: "#B2EBF2",
    description: "Девушка в синем кимоно с посохом и снежинкой",
    attackName: "Снежный шар",
    superName: "Исцеляющий снег",
    attackDesc: "Юки выпускает ледяной шар прямолинейно на 350 ед. При попадании: 200 урона + мгновенное замедление цели на -35% движения и скорострельности на 2 сек. 3 заряда, перезарядка 1.0 сек. Три быстрых броска могут одновременно замедлить 3 врагов — идеально для контроля при прорывах.",
    superDesc: "Юки выпускает снежный вихрь — исцеляющее облако радиусом 140 ед. на 6 секунд. Союзники внутри восстанавливают 300 ХП/сек (до 1800 ХП суммарно), враги замедляются на 25%. Облако стоит на месте — расставляй его на точке захвата, за прикрытием или под обстрелом для максимальной эффективности.",
    spriteRow: 0,
    spriteCol: 3,
  },
  {
    id: "kenji",
    name: "Kenji",
    role: "Контроллер",
    rarity: "epic",
    hp: 4000,
    speed: 3.8,
    regenRate: 330,
    attackDamage: 250,
    attackRange: 200,
    attackCooldown: 1.3,
    attackCharges: 2,
    superCooldown: 20,
    superChargePerHit: 16,
    color: "#F9A825",
    secondaryColor: "#212121",
    accentColor: "#40C4FF",
    description: "Парень в жёлтом костюме с электрошокерами на руках",
    attackName: "Электрическая цепь",
    superName: "Клетка молний",
    attackDesc: "Кендзи выпускает молнию (дальность 200 ед.), которая прыгает цепью: первая цель — 250 урона, вторая в радиусе 130 ед. — 175 (70%), третья — 120 (48%). 2 заряда, перезарядка 1.3 сек. В плотных группах наносит до 545 суммарного урона одним выстрелом.",
    superDesc: "Кендзи создаёт электрическую клетку радиусом 110 ед. на 5 секунд. Все враги внутри получают 200 урона/сек от электрошока (до 1000 суммарно) и замедляются на 50%. Клетка видима — заставляй врагов выбирать: оставаться и гореть или выходить под атаки союзников у краёв.",
    spriteRow: 0,
    spriteCol: 4,
  },
  {
    id: "hana",
    name: "Hana",
    role: "Хилер",
    rarity: "rare",
    hp: 3000,
    speed: 4.5,
    regenRate: 480,
    attackDamage: 150,
    attackRange: 400,
    attackCooldown: 0.9,
    attackCharges: 4,
    superCooldown: 16,
    superChargePerHit: 12,
    color: "#E91E8C",
    secondaryColor: "#FCE4EC",
    accentColor: "#FF80AB",
    description: "Девушка в розовом медицинском халате с лечебным пистолетом",
    attackName: "Лечебная пуля",
    superName: "Цветущий сад",
    attackDesc: "Хана стреляет розовой пулей (дальность 400 ед.) с двойным режимом: если прицел на союзнике — лечит его на 150 ХП; если на враге — наносит 150 урона. 4 заряда, перезарядка 0.9 сек. На пиковой скорострельности: лечение 600 ХП/сек союзника или 600 урона/сек врагу — один из лучших показателей DPS и хила.",
    superDesc: "Хана создаёт цветущий сад радиусом 160 ед. на 5 секунд. Союзники внутри получают 200 ХП/сек исцеления (до 1000 ХП) и +20% к скорости передвижения. Хана продолжает стрелять в пределах или вне сада. Идеален для медленных танков — резко повышает их выживаемость под огнём. Комбинируй с Ронином или Горо.",
    spriteRow: 1,
    spriteCol: 0,
  },
  {
    id: "goro",
    name: "Goro",
    role: "Берсерк",
    rarity: "mythic",
    hp: 6200,
    speed: 2.9,
    regenRate: 210,
    attackDamage: 450,
    attackRange: 90,
    attackCooldown: 1.5,
    attackCharges: 2,
    superCooldown: 22,
    superChargePerHit: 20,
    color: "#8D4E2B",
    secondaryColor: "#FF3D00",
    accentColor: "#BF360C",
    description: "Огромный бородатый мужчина с двумя боевыми топорами",
    attackName: "Двойной топор",
    superName: "Ярость берсерка",
    attackDesc: "Горо вращается на 360°, атакуя двумя топорами всех в радиусе 90 ед. вокруг — 450 урона каждому. 2 заряда, перезарядка 1.5 сек. В плотной группе из 3 врагов наносит 2700 суммарного урона за два оборота. Лучший ближний AoE в игре — зайди в центр группы и активируй два заряда подряд.",
    superDesc: "Горо впадает в ярость берсерка на 5 секунд: +40% к скорости передвижения и +50% к урону каждого удара (450 × 1.5 = 675 за оборот). В режиме берсерка мобильность Горо позволяет догнать любого врага. Комбо: включи супер → рви в ближний бой → два оборота = 1350 урона одной цели за 3 секунды.",
    spriteRow: 1,
    spriteCol: 1,
  },
  {
    id: "sora",
    name: "Sora",
    role: "Маг",
    rarity: "mega",
    hp: 3400,
    speed: 4.0,
    regenRate: 270,
    attackDamage: 300,
    attackRange: 400,
    attackCooldown: 1.1,
    attackCharges: 3,
    superCooldown: 24,
    superChargePerHit: 14,
    color: "#1A237E",
    secondaryColor: "#FFD700",
    accentColor: "#FF6F00",
    description: "Парень в синей мантии с летающей книгой заклинаний",
    attackName: "Огненный шар",
    superName: "Метеоритный дождь",
    attackDesc: "Сора выпускает огненный шар (дальность 400 ед.): прямое попадание — 300 урона + взрыв в радиусе 60 ед. — 150 урона всем рядом. Суммарно 450 по одной цели в эпицентре. 3 заряда, перезарядка 1.1 сек. Против групп каждый выстрел поражает несколько целей взрывной волной — мощный контроль площади.",
    superDesc: "Сора вызывает дождь из 5 метеоров в выбранной зоне за 3 секунды. Каждый метеор: 250 урона при ударе + взрыв в радиусе 70 ед. (дополнительный урон). По одной цели — до 1250 суммарно. Падение случайно в кругу 120 ед. от прицела. Эффективен против плотных групп, засевших за прикрытием или на точке захвата.",
    spriteRow: 1,
    spriteCol: 2,
  },
  {
    id: "rin",
    name: "Rin",
    role: "Отравитель",
    rarity: "legendary",
    hp: 3300,
    speed: 5.0,
    regenRate: 300,
    attackDamage: 350,
    attackRange: 300,
    attackCooldown: 1.0,
    attackCharges: 3,
    superCooldown: 19,
    superChargePerHit: 13,
    color: "#2E7D32",
    secondaryColor: "#8BC34A",
    accentColor: "#CE93D8",
    description: "Девушка с зелёными волосами и ядовитыми кинжалами",
    attackName: "Отравленный кинжал",
    superName: "Облако яда",
    attackDesc: "Рин бросает отравленный кинжал (дальность 300 ед.): 350 урона при попадании + яд на 3 секунды (100 урона/сек = 300 ДоТ). Итого 650 урона с одного броска. 3 заряда, перезарядка 1.0 сек. Яд не суммируется — новый бросок обновляет таймер. Оптимальная стратегия: поддерживать яд постоянно, добивая через кинжалы.",
    superDesc: "Рин метает ядовитую гранату, создавая облако радиусом 100 ед. на 4 секунды. Все враги внутри получают 150 урона/сек (до 600 суммарно). Можно комбинировать с кинжалами: яд от гранаты + яд от кинжала = двойной урон по времени. Облако прозрачно — враги не всегда замечают его, пока не получат урон от первого тика.",
    spriteRow: 1,
    spriteCol: 3,
  },
  {
    id: "taro",
    name: "Taro",
    role: "Инженер",
    rarity: "rare",
    hp: 3700,
    speed: 3.5,
    regenRate: 240,
    attackDamage: 400,
    attackRange: 80,
    attackCooldown: 0.8,
    attackCharges: 3,
    superCooldown: 25,
    superChargePerHit: 16,
    color: "#5D4037",
    secondaryColor: "#CD9B39",
    accentColor: "#78909C",
    description: "Старик с гаечным ключом и механическим рюкзаком",
    attackName: "Гаечный ключ",
    superName: "Турель",
    attackDesc: "Таро наносит мощный удар гаечным ключом (дальность 80 ед.): 400 урона основной цели + 80 урона всем врагам в радиусе 50 ед. вокруг точки удара (взрывная волна). 3 заряда, перезарядка 0.8 сек. Высокий DPS в ближнем бою — если стоять вплотную, за 3 удара можно нанести 1200 чистого урона одной цели.",
    superDesc: "Таро мгновенно устанавливает боевую турель в текущей позиции: 200 ХП, дальность обнаружения 250 ед., стреляет каждые 0.6 сек по 150 урона ближайшему врагу (DPS турели: 250/сек). Живёт 12 сек или до уничтожения. Новая турель заменяет старую. Тактика: поставь у прохода и атакуй с другой стороны — враги оказываются под двойным огнём.",
    spriteRow: 1,
    spriteCol: 4,
  },
  {
    id: "zafkiel",
    name: "Зафкиэль",
    role: "Контроллер/Стратег",
    rarity: "ultralegendary",
    hp: 3800,
    speed: 4.2,
    regenRate: 325,
    attackDamage: 350,
    attackRange: 375,
    attackCooldown: 1.4,
    attackCharges: 3,
    superCooldown: 22,
    superChargePerHit: 13,
    color: "#9C27B0",
    secondaryColor: "#4A148C",
    accentColor: "#FFD700",
    description: "Хранитель времени с пистолями и механизмом песочных часов",
    attackName: "Цикл времени",
    superName: "Врата Вечности",
    attackDesc: "Зафкиэль использует 3 уникальных заряда по очереди: ① Далет (зелёный) — снаряд телепортирует цель туда, где она была 2 секунды назад, сбрасывая импульс движения. ② Бет (синий) — снаряд замедляет цель на -40% скорости и скорострельности на 3 секунды. ③ Заин (жёлтый) — снаряд станит цель на 0.6 сек (полная остановка). После активации супера 3 следующих заряда становятся усиленными: Алеф (×2 скорость полёта снаряда), Гимель (яд 100 урона/сек на 3 сек), Йуд (самонаводящийся снаряд, преследует ближайшего врага). Перезарядка 1.4 сек, дальность 375 ед.",
    superDesc: "Зафкиэль открывает Врата Вечности — временную аномалию радиусом 120 ед. на 4 секунды. Все враги внутри каждую секунду откатываются на 2 секунды назад по своей траектории: теряют позицию, скорость и набранный импульс. Фактически превращает область в ловушку — враги не могут через неё пройти без потерь. После активации Зафкиэль получает 3 усиленных заряда (Алеф/Гимель/Йуд), кардинально меняя стиль атаки на следующие 3 выстрела.",
    spriteRow: 2,
    spriteCol: 0,
  },
];

export function pickBotStats(playerBrawlerId: string, count: number): BrawlerStats[] {
  // Exclude ultra-legendary from bot pool (too rare / complex for bots)
  const pool = BRAWLERS.filter(b => b.id !== playerBrawlerId && b.rarity !== "ultralegendary");
  // Fisher-Yates shuffle
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const result: BrawlerStats[] = [];
  for (let i = 0; i < count; i++) {
    result.push(shuffled[i % shuffled.length]);
  }
  return result;
}

export function getBrawlerById(id: string): BrawlerStats | undefined {
  return BRAWLERS.find((b) => b.id === id);
}

export function getScaledStats(brawler: BrawlerStats, level: number) {
  const lvl = Math.max(1, Math.min(10, level));
  return {
    hp: Math.floor(brawler.hp * (1 + 0.05 * (lvl - 1))),
    attackDamage: Math.floor(brawler.attackDamage * (1 + 0.03 * (lvl - 1))),
    speed: brawler.speed,
    regenRate: brawler.regenRate,
    attackCooldown: brawler.attackCooldown,
    attackCharges: brawler.attackCharges,
    attackRange: brawler.attackRange,
  };
}
