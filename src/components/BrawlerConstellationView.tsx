import type { CSSProperties } from "react";

interface NodeDef { x: number; y: number }
type Theme = { nodes: NodeDef[]; edges: Array<[number, number]>; glyph: string; title: string };

const THEMES: Record<string, Theme> = {
  miya: { // ninja shuriken
    nodes: [{ x: 50, y: 10 }, { x: 82, y: 32 }, { x: 50, y: 50 }, { x: 18, y: 32 }, { x: 50, y: 82 }, { x: 50, y: 32 }],
    edges: [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5], [0, 1], [1, 2], [2, 3], [3, 0]],
    glyph: "🥷",
    title: "Сюрикен Тени",
  },
  ronin: {
    nodes: [{ x: 15, y: 20 }, { x: 50, y: 10 }, { x: 85, y: 20 }, { x: 30, y: 45 }, { x: 70, y: 45 }, { x: 50, y: 80 }],
    edges: [[0, 1], [1, 2], [0, 3], [2, 4], [3, 5], [4, 5], [3, 4]],
    glyph: "🛡️",
    title: "Щит Самурая",
  },
  yuki: {
    nodes: [{ x: 50, y: 10 }, { x: 70, y: 26 }, { x: 70, y: 52 }, { x: 50, y: 68 }, { x: 30, y: 52 }, { x: 30, y: 26 }],
    edges: [[0, 2], [2, 4], [4, 0], [1, 3], [3, 5], [5, 1]],
    glyph: "❄️",
    title: "Снежный Цветок",
  },
  kenji: {
    nodes: [{ x: 12, y: 30 }, { x: 30, y: 20 }, { x: 48, y: 34 }, { x: 66, y: 22 }, { x: 84, y: 36 }, { x: 60, y: 70 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5]],
    glyph: "⚡",
    title: "Цепь Молний",
  },
  hana: {
    nodes: [{ x: 50, y: 12 }, { x: 68, y: 26 }, { x: 62, y: 48 }, { x: 50, y: 62 }, { x: 38, y: 48 }, { x: 32, y: 26 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [2, 5]],
    glyph: "🌸",
    title: "Лепестки Жизни",
  },
  goro: {
    nodes: [{ x: 20, y: 16 }, { x: 78, y: 16 }, { x: 50, y: 34 }, { x: 24, y: 54 }, { x: 76, y: 54 }, { x: 50, y: 82 }],
    edges: [[0, 2], [1, 2], [2, 3], [2, 4], [3, 5], [4, 5]],
    glyph: "🪓",
    title: "Топор Берсерка",
  },
  sora: {
    nodes: [{ x: 50, y: 8 }, { x: 74, y: 24 }, { x: 78, y: 52 }, { x: 50, y: 72 }, { x: 22, y: 52 }, { x: 26, y: 24 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]],
    glyph: "🔥",
    title: "Огненная Корона",
  },
  rin: {
    nodes: [{ x: 30, y: 14 }, { x: 62, y: 16 }, { x: 80, y: 34 }, { x: 68, y: 58 }, { x: 38, y: 70 }, { x: 18, y: 44 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4]],
    glyph: "🦂",
    title: "Ядовитый След",
  },
  taro: {
    nodes: [{ x: 50, y: 10 }, { x: 72, y: 22 }, { x: 72, y: 48 }, { x: 50, y: 60 }, { x: 28, y: 48 }, { x: 28, y: 22 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [1, 4], [2, 5]],
    glyph: "⚙️",
    title: "Шестерни Инженера",
  },
  zafkiel: {
    nodes: [{ x: 50, y: 8 }, { x: 72, y: 18 }, { x: 72, y: 46 }, { x: 50, y: 58 }, { x: 28, y: 46 }, { x: 28, y: 18 }],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3], [1, 4], [2, 5]],
    glyph: "⏳",
    title: "Петля Хроностража",
  },
};

export default function BrawlerConstellationView({
  brawlerId,
  ownedStars,
  onPick,
  style,
}: {
  brawlerId: string;
  ownedStars: number[];
  onPick?: (starIndex: number) => void;
  style?: CSSProperties;
}) {
  const t = THEMES[brawlerId] || THEMES.hana;
  const owned = new Set(ownedStars);
  return (
    <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(0,0,0,0.28)", padding: 10, ...style }}>
      <div style={{ marginBottom: 6, fontSize: 11, letterSpacing: 1, color: "rgba(255,255,255,0.72)", fontWeight: 800 }}>
        {t.glyph} {t.title}
      </div>
      <svg viewBox="0 0 100 90" style={{ width: "100%", height: 160 }}>
        {t.edges.map(([a, b], i) => (
          <line
            key={i}
            x1={t.nodes[a].x}
            y1={t.nodes[a].y}
            x2={t.nodes[b].x}
            y2={t.nodes[b].y}
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.2"
          />
        ))}
        {t.nodes.map((n, i) => {
          const idx = i + 1;
          const on = owned.has(idx);
          return (
            <g key={idx} onClick={() => onPick?.(idx)} style={{ cursor: onPick ? "pointer" : "default" }}>
              <circle cx={n.x} cy={n.y} r={5.4} fill={on ? "#FFD740" : "rgba(255,255,255,0.16)"} stroke={on ? "#FFF9C4" : "rgba(255,255,255,0.5)"} strokeWidth="1.1" />
              <text x={n.x} y={n.y + 1.5} textAnchor="middle" style={{ fontSize: 3.5, fill: on ? "#5D4037" : "white", fontWeight: 900 }}>
                {idx}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

