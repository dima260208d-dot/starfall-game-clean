import { useState } from "react";
import type { GameMode, ShowdownFormat, StarStrikeFormat } from "../App";
import { getCurrentProfile } from "../utils/localStorageAPI";
import BossRaidLobbyCarousel from "../components/BossRaidLobbyCarousel";

interface ModeSelectProps {
  onSelect: (mode: GameMode, showdownFormat?: ShowdownFormat, starStrikeFormat?: StarStrikeFormat) => void;
  selectedShowdownFormat: ShowdownFormat;
  selectedStarStrikeFormat: StarStrikeFormat;
  onBack: () => void;
  /** Выбор босса в ленте: возврат в лобби с режимом bossraid и выбранным боссом */
  onBossRaidLobbyPick?: (bossId: string) => void;
}

const BASE = (import.meta as any).env?.BASE_URL ?? "/";

/** Отдельные иллюстрации только для боковых вкладок (не режимные превью карт). */
const TAB_DECOR = {
  regular: `${BASE}images/mode-select-tab-pvp.svg`,
  boss: `${BASE}images/mode-select-tab-boss.svg`,
} as const;

const modes: Array<{
  id: GameMode;
  name: string;
  subtitle: string;
  desc: string;
  players: string;
  iconImg: string;
  color: string;
  gradient: string;
}> = [
  {
    id: "starstrike",
    name: "Star Strike",
    subtitle: "Звёздный мяч",
    desc: "Командный футбол с мячом: ведение, пасы, рикошеты и голы. Побеждает команда, которая забьет 3 мяча.",
    players: "3 на 3 или 5 на 5",
    iconImg: `${BASE}images/mode-starstrike.svg`,
    color: "#66BB6A",
    gradient: "linear-gradient(135deg, #1B5E20, #66BB6A)",
  },
  {
    id: "showdown",
    name: "Star Battle",
    subtitle: "Столкновение",
    desc: "Газ сжимается, на карте ящики и банки усиления. Формат выбирается ниже: одиночное, парное или тройное.",
    players: "10 или 12 участников",
    iconImg: `${BASE}images/mode-showdown.png`,
    color: "#FF5252",
    gradient: "linear-gradient(135deg, #B71C1C, #FF5252)",
  },
  {
    id: "crystals",
    name: "Crystal Carry",
    subtitle: "Вынос кристаллов",
    desc: "Несите кристаллы на свою базу. Кто первый соберёт 10 — побеждает!",
    players: "3 на 3",
    iconImg: `${BASE}images/mode-crystals.png`,
    color: "#40C4FF",
    gradient: "linear-gradient(135deg, #0D47A1, #40C4FF)",
  },
  {
    id: "siege",
    name: "Star Siege",
    subtitle: "Осада",
    desc: "Защитите свою базу от 3 волн врагов!",
    players: "4 против волн",
    iconImg: `${BASE}images/mode-siege.png`,
    color: "#69F0AE",
    gradient: "linear-gradient(135deg, #1B5E20, #69F0AE)",
  },
  {
    id: "heist",
    name: "Fallen Crown",
    subtitle: "Ограбление",
    desc: "Уничтожьте сейф врага раньше, чем они уничтожат ваш!",
    players: "3 на 3",
    iconImg: `${BASE}images/mode-heist.png`,
    color: "#FFD700",
    gradient: "linear-gradient(135deg, #F57F17, #FFD700)",
  },
  {
    id: "gemgrab",
    name: "Crystal Void",
    subtitle: "Ограбление кристаллов",
    desc: "Соберите 10 камней и удержите их 15 секунд для победы!",
    players: "3 на 3",
    iconImg: `${BASE}images/mode-gemgrab.png`,
    color: "#CE93D8",
    gradient: "linear-gradient(135deg, #4A148C, #CE93D8)",
  },
  {
    id: "megashowdown",
    name: "Mega Star Battle",
    subtitle: "МЕГА-Столкновение",
    desc: "Отряд из 3 бойцов в королевской битве. Меняйте бойцов в бою (кулдаун 3 сек). Награды ×1.5.",
    players: "Отряд 3 на 5–10 врагов",
    iconImg: `${BASE}images/mode-showdown.png`,
    color: "#FFD54F",
    gradient: "linear-gradient(135deg, #B71C1C, #FFD54F)",
  },
];

type ModeCategory = "regular" | "boss";

export default function ModeSelect({ onSelect, selectedShowdownFormat, selectedStarStrikeFormat, onBack, onBossRaidLobbyPick }: ModeSelectProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [showdownFormat, setShowdownFormat] = useState<ShowdownFormat>(selectedShowdownFormat);
  const [starStrikeFormat, setStarStrikeFormat] = useState<StarStrikeFormat>(selectedStarStrikeFormat);
  const [category, setCategory] = useState<ModeCategory>("regular");
  const [tabHover, setTabHover] = useState<ModeCategory | null>(null);
  const [tabPressed, setTabPressed] = useState<ModeCategory | null>(null);
  const profile = getCurrentProfile();
  const ownedCount = profile?.unlockedBrawlers?.length ?? 0;
  const effectiveShowdownFormat = showdownFormat;
  const showBossTab = Boolean(onBossRaidLobbyPick);

  const tabBase = (key: ModeCategory) => {
    const active = category === key;
    const hover = tabHover === key;
    const pressed = tabPressed === key;
    return {
      borderRadius: 11,
      padding: "6px 5px 7px",
      cursor: "pointer",
      width: "100%",
      border: active
        ? "1.5px solid rgba(255,213,79,0.75)"
        : hover
          ? "1.5px solid rgba(255,255,255,0.28)"
          : "1px solid rgba(255,255,255,0.1)",
      background: active
        ? "linear-gradient(165deg, rgba(40,55,95,0.92), rgba(16,22,42,0.98))"
        : hover
          ? "linear-gradient(165deg, rgba(34,46,78,0.9), rgba(14,18,34,0.96))"
          : "linear-gradient(165deg, rgba(26,36,62,0.82), rgba(12,14,28,0.94))",
      boxShadow: active
        ? "0 0 14px rgba(255,213,79,0.2), inset 0 1px 0 rgba(255,255,255,0.06)"
        : hover
          ? "0 6px 16px rgba(0,0,0,0.4), 0 0 12px rgba(100,180,255,0.1)"
          : "0 2px 8px rgba(0,0,0,0.28)",
      transform: pressed ? "scale(0.96)" : hover ? "scale(1.04)" : "scale(1)",
      transition: "transform 0.16s ease, box-shadow 0.22s ease, border-color 0.18s ease, background 0.22s ease",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "stretch",
      gap: 5,
      position: "relative" as const,
      overflow: "hidden" as const,
      animation: active ? "modeTabGlow 2.4s ease-in-out infinite" : undefined,
    };
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: "linear-gradient(135deg, #152745 0%, #243f69 50%, #355a90 100%)",
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        fontFamily: "'Segoe UI', Arial, sans-serif",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes modeTabGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(255,213,79,0.16), inset 0 1px 0 rgba(255,255,255,0.06); }
          50% { box-shadow: 0 0 16px rgba(255,213,79,0.26), inset 0 1px 0 rgba(255,255,255,0.08); }
        }
      `}</style>

      {/* Боковая колонка с вкладками */}
      <aside
        style={{
          width: 92,
          flexShrink: 0,
          padding: "52px 8px 14px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          background: "linear-gradient(180deg, rgba(6,10,24,0.55) 0%, rgba(10,16,36,0.75) 100%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset -4px 0 14px rgba(0,0,0,0.2)",
        }}
      >
        <button
          type="button"
          onClick={() => setCategory("regular")}
          onMouseEnter={() => setTabHover("regular")}
          onMouseLeave={() => {
            setTabHover(null);
            setTabPressed(null);
          }}
          onMouseDown={() => setTabPressed("regular")}
          onMouseUp={() => setTabPressed(null)}
          style={tabBase("regular")}
        >
          <div
            style={{
              height: 30,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: category === "regular" ? "0 0 8px rgba(64,196,255,0.2)" : undefined,
            }}
          >
            <img
              src={TAB_DECOR.regular}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                transform: tabHover === "regular" ? "scale(1.05)" : "scale(1)",
                transition: "transform 0.28s ease",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 9,
              fontWeight: 800,
              color: category === "regular" ? "#e1f5fe" : "rgba(255,255,255,0.78)",
              letterSpacing: 0.2,
              lineHeight: 1.15,
              textAlign: "center",
            }}
          >
            Обычные режимы
          </div>
        </button>

        {showBossTab ? (
          <button
            type="button"
            onClick={() => setCategory("boss")}
            onMouseEnter={() => setTabHover("boss")}
            onMouseLeave={() => {
              setTabHover(null);
              setTabPressed(null);
            }}
            onMouseDown={() => setTabPressed("boss")}
            onMouseUp={() => setTabPressed(null)}
            style={tabBase("boss")}
          >
            <div
              style={{
                height: 30,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid rgba(255,213,79,0.22)",
                boxShadow: category === "boss" ? "0 0 8px rgba(255,152,0,0.28)" : undefined,
              }}
            >
              <img
                src={TAB_DECOR.boss}
                alt=""
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  transform: tabHover === "boss" ? "scale(1.05)" : "scale(1)",
                  transition: "transform 0.28s ease",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: category === "boss" ? "#ffe082" : "rgba(255,255,255,0.78)",
                letterSpacing: 0.2,
                lineHeight: 1.15,
                textAlign: "center",
              }}
            >
              Режимы с боссом
            </div>
          </button>
        ) : null}
      </aside>

      {/* Основная область */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: category === "boss" ? "22px 12px 16px" : "40px 24px 48px",
          minWidth: 0,
          position: "relative",
        }}
      >
        <button
          onClick={onBack}
          style={{
            position: "absolute",
            top: 20,
            left: 24,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10,
            padding: "8px 18px",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          ← Назад
        </button>

        <div
          style={{
            textAlign: "center",
            marginBottom: category === "boss" ? 8 : 40,
            marginTop: category === "boss" ? 4 : 8,
          }}
        >
          <h1
            style={{
              fontSize: category === "boss" ? 30 : 42,
              fontWeight: 900,
              background: "linear-gradient(135deg, #CE93D8, #FFD700)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundSize: "200% auto",
              animation: "shimmer 3s linear infinite",
              margin: 0,
            }}
          >
            {category === "boss" ? "Бой с боссом" : "Выбор режима"}
          </h1>
          <p
            style={{
              color: "rgba(255,255,255,0.4)",
              marginTop: category === "boss" ? 4 : 8,
              fontSize: category === "boss" ? 11 : 14,
              lineHeight: category === "boss" ? 1.35 : undefined,
              maxWidth: category === "boss" ? 520 : undefined,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {category === "boss"
              ? "Пять бойцов против одного босса — без кубков за матч, награды за первые уровни."
              : "Выберите режим боя, чтобы начать"}
          </p>
        </div>

        {category === "regular" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 20,
              maxWidth: 1000,
              width: "100%",
            }}
          >
            {modes.map((mode, i) => {
              const locked = mode.id === "megashowdown" && ownedCount < 3;
              return (
                <div
                  key={i}
                  onMouseOver={() => setHovered(i)}
                  onMouseOut={() => setHovered(null)}
                  style={{
                    background: hovered === i ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${hovered === i ? mode.color + "60" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 20,
                    padding: 28,
                    cursor: locked ? "not-allowed" : "pointer",
                    transform: hovered === i && !locked ? "translateY(-4px)" : "none",
                    transition: "all 0.25s",
                    boxShadow: hovered === i && !locked ? `0 10px 40px ${mode.color}20` : "none",
                    position: "relative",
                    overflow: "hidden",
                    opacity: locked ? 0.55 : 1,
                  }}
                  onClick={() => {
                    if (locked) return;
                    if (mode.id === "showdown") {
                      onSelect(mode.id, effectiveShowdownFormat);
                    } else if (mode.id === "starstrike") {
                      onSelect(mode.id, undefined, starStrikeFormat);
                    } else {
                      onSelect(mode.id);
                    }
                  }}
                >
                  <div style={{ width: 80, height: 80, marginBottom: 12, position: "relative" }}>
                    <img src={mode.iconImg} alt={mode.name} style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 16, filter: `drop-shadow(0 0 12px ${mode.color}88)` }} />
                    {mode.id === "megashowdown" && (
                      <div
                        style={{
                          position: "absolute",
                          top: -2,
                          right: -4,
                          fontSize: 24,
                          lineHeight: 1,
                          filter: `drop-shadow(0 0 8px ${mode.color})`,
                          pointerEvents: "none",
                        }}
                      >
                        ✨✨✨
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 900,
                      color: mode.color,
                      marginBottom: 2,
                      letterSpacing: 1,
                    }}
                  >
                    {mode.name}
                  </div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginBottom: 2, fontWeight: 700 }}>
                    {mode.subtitle}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 10, letterSpacing: 1 }}>
                    {mode.players}
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: 0, lineHeight: 1.5 }}>
                    {mode.desc}
                  </p>
                  {mode.id === "showdown" && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1.2, fontWeight: 700 }}>
                        ФОРМАТ БОЯ
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(
                          [
                            { id: "solo", label: "Одиночное", players: "10 игроков" },
                            { id: "duo", label: "Парное", players: "5 команд (2x5)" },
                            { id: "trio", label: "Тройное", players: "4 команды (3x4)" },
                          ] as const
                        ).map((f) => {
                          const active = effectiveShowdownFormat === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowdownFormat(f.id);
                              }}
                              style={{
                                background: active ? "rgba(255,82,82,0.22)" : "rgba(255,255,255,0.06)",
                                border: `1px solid ${active ? "#FF5252" : "rgba(255,255,255,0.16)"}`,
                                borderRadius: 10,
                                color: active ? "#FF9E9E" : "rgba(255,255,255,0.7)",
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                              title={f.players}
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {mode.id === "starstrike" && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 8, letterSpacing: 1.2, fontWeight: 700 }}>
                        ФОРМАТ КОМАНД
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {(
                          [
                            { id: "3v3", label: "3 на 3" },
                            { id: "5v5", label: "5 на 5" },
                          ] as const
                        ).map((f) => {
                          const active = starStrikeFormat === f.id;
                          return (
                            <button
                              key={f.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setStarStrikeFormat(f.id);
                              }}
                              style={{
                                background: active ? "rgba(102,187,106,0.24)" : "rgba(255,255,255,0.06)",
                                border: `1px solid ${active ? "#66BB6A" : "rgba(255,255,255,0.16)"}`,
                                borderRadius: 10,
                                color: active ? "#B9F6CA" : "rgba(255,255,255,0.7)",
                                padding: "6px 10px",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                              }}
                            >
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {locked ? (
                    <div
                      style={{
                        marginTop: 20,
                        background: "rgba(0,0,0,0.45)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: 10,
                        padding: "10px 20px",
                        color: "#FFD54F",
                        fontWeight: 800,
                        fontSize: 12,
                        letterSpacing: 0.5,
                        textAlign: "center",
                      }}
                    >
                      🔒 Нужно 3 бойца (у вас {ownedCount})
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (mode.id === "showdown") {
                          onSelect(mode.id, effectiveShowdownFormat);
                        } else if (mode.id === "starstrike") {
                          onSelect(mode.id, undefined, starStrikeFormat);
                        } else {
                          onSelect(mode.id);
                        }
                      }}
                      style={{
                        marginTop: 20,
                        background: mode.gradient,
                        border: "none",
                        borderRadius: 10,
                        padding: "10px 24px",
                        color: "white",
                        fontWeight: 800,
                        fontSize: 14,
                        cursor: "pointer",
                        letterSpacing: 1,
                      }}
                    >
                      СТАРТ
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : onBossRaidLobbyPick ? (
          <BossRaidLobbyCarousel onSelectBoss={onBossRaidLobbyPick} />
        ) : null}
      </div>
    </div>
  );
}
