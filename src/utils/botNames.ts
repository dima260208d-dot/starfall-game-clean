// Russian-flavoured nicknames used as the "БОТ ..." label above bot brawlers
// during a match. Picked once per bot at construction so the same name sticks
// for the whole match.

const BOT_NAMES = [
  "Витя", "Саня", "Лёха", "Дима", "Костя", "Игорёк", "Андрюха",
  "Кирюха", "Стёпа", "Антоха", "Серёжа", "Боря", "Гриша", "Макс",
  "Тимоха", "Ваня", "Илья", "Жора", "Рома", "Петя", "Слава",
  "Толя", "Юра", "Глеб", "Платон", "Коля", "Феликс", "Лёня",
  "Артём", "Эдик", "Мишаня", "Денчик", "Тимур", "Богдан",
];

export function pickBotName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}
