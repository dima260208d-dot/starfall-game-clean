import { useEffect, useRef } from "react";
import type { GameMode } from "../App";
import { getPublishedMap, type EditorMode } from "../utils/mapEditorAPI";
import { drawStarStrikePreview } from "../utils/starStrikeMapPreview";

interface Brawler { x: number; y: number; alive: boolean; inBush?: boolean; stats?: { id?: string }; hp?: number; maxHp?: number; }
interface GameInstance {
  player: Brawler;
  bots?: Brawler[];
  allies?: Brawler[];
  enemies?: Brawler[];
  map: { width: number; height: number };
  /** Живая сетка (тренировка и др.) — превью миникарты как в бою. */
  tileGrid?: { cells: Uint8Array; width: number; height: number };
  over: boolean;
  gas?: { radius?: number; cx?: number; cy?: number };
}

interface Props {
  gameRef: React.RefObject<GameInstance | null>;
  mode: GameMode;
}

const MAP_SIZE = 150;
const BASE = (import.meta as any).env?.BASE_URL ?? "/";
const THUMB_GS = 60;
const TILE_THUMB_COLORS: Record<number, string> = {
  0: "#5a8c44", 1: "#8B6060", 2: "#607060", 3: "#4CAF50",
  4: "#1565C0", 5: "#BDBDBD", 6: "#C8A45A", 7: "#C2185B",
  9: "#558B2F", 10: "#8D6E63", 11: "#78909C", 12: "#FDD835",
};

function drawLiveTileGridThumb(
  ctx: CanvasRenderingContext2D,
  cells: Uint8Array,
  gw: number,
  gh: number,
  mapX: number,
  mapY: number,
  mapW: number,
  mapH: number,
  colors: Record<number, string>,
): void {
  const cellW = mapW / gw;
  const cellH = mapH / gh;
  ctx.fillStyle = colors[0] ?? "#5a8c44";
  ctx.fillRect(mapX, mapY, mapW, mapH);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const t = cells[y * gw + x] ?? 0;
      if (t !== 0) {
        ctx.fillStyle = colors[t] ?? "#888";
        ctx.fillRect(mapX + x * cellW, mapY + y * cellH, cellW + 0.2, cellH + 0.2);
      }
    }
  }
}

const MODE_BG: Record<string, string> = {
  showdown: `${BASE}images/mode-showdown.png`,
  crystals: `${BASE}images/mode-crystals.png`,
  siege: `${BASE}images/mode-siege.png`,
  heist: `${BASE}images/mode-heist.png`,
  gemgrab: `${BASE}images/mode-gemgrab.png`,
  starstrike: `${BASE}images/mode-starstrike.svg`,
  megashowdown: `${BASE}images/mode-showdown.png`,
  training: `${BASE}images/mode-showdown.png`,
  bossraid: `${BASE}images/mode-crystals.png`,
};

export default function MiniMap({ gameRef, mode }: Props) {
  const cvs = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.src = MODE_BG[mode] || MODE_BG.showdown;
    bgRef.current = img;
  }, [mode]);

  useEffect(() => {
    const id = setInterval(() => {
      const game = gameRef.current;
      const canvas = cvs.current;
      if (!game || !canvas || game.over) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const { width: mw, height: mh } = game.map;
      const scale = MAP_SIZE / Math.max(mw, mh);

      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Background
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

      // Map area preview image (same theme image as mode card)
      const mapW = mw * scale;
      const mapH = mh * scale;
      const mapX = (MAP_SIZE - mapW) / 2;
      const mapY = (MAP_SIZE - mapH) / 2;
      const modeForPreview: EditorMode =
        (mode === "training" || mode === "megashowdown" ? "showdown" : mode === "bossraid" ? "crystals" : mode) as EditorMode;
      const pubMap = getPublishedMap(modeForPreview);
      const bg = bgRef.current;
      if (mode === "training" && game.tileGrid) {
        const { cells, width: gw, height: gh } = game.tileGrid;
        drawLiveTileGridThumb(ctx, cells, gw, gh, mapX, mapY, mapW, mapH, TILE_THUMB_COLORS);
      } else if (pubMap) {
        const cellW = mapW / THUMB_GS;
        const cellH = mapH / THUMB_GS;
        ctx.fillStyle = TILE_THUMB_COLORS[0];
        ctx.fillRect(mapX, mapY, mapW, mapH);
        for (let y = 0; y < THUMB_GS; y++) {
          for (let x = 0; x < THUMB_GS; x++) {
            const t = pubMap.cells[y * THUMB_GS + x] ?? 0;
            if (t !== 0) {
              ctx.fillStyle = TILE_THUMB_COLORS[t] ?? "#888";
              ctx.fillRect(mapX + x * cellW, mapY + y * cellH, cellW + 0.2, cellH + 0.2);
            }
          }
        }
        if (pubMap.overlays) {
          for (let y = 0; y < THUMB_GS; y++) {
            for (let x = 0; x < THUMB_GS; x++) {
              const ov = pubMap.overlays[y * THUMB_GS + x] ?? 0;
              if (ov !== 0) {
                ctx.fillStyle = ov === 3 ? "#FF9800" : ov <= 2 ? (ov === 1 ? "#1976D2" : "#D32F2F") : "#9C27B0";
                ctx.fillRect(mapX + x * cellW, mapY + y * cellH, cellW + 0.2, cellH + 0.2);
              }
            }
          }
        }
      } else if (mode === "starstrike") {
        ctx.fillStyle = TILE_THUMB_COLORS[0];
        ctx.fillRect(mapX, mapY, mapW, mapH);
        ctx.save();
        ctx.translate(mapX, mapY);
        drawStarStrikePreview(ctx, mapW, mapH, 1);
        ctx.restore();
      } else if (bg && bg.complete) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.drawImage(bg, mapX, mapY, mapW, mapH);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(40,60,30,0.9)";
        ctx.fillRect(mapX, mapY, mapW, mapH);
      }
      ctx.save();
      ctx.fillStyle = "rgba(8,16,28,0.42)";
      ctx.fillRect(mapX, mapY, mapW, mapH);
      ctx.restore();

      // Gas zone (Showdown)
      if (game.gas && game.gas.radius !== undefined) {
        const g = game.gas;
        const cx = mapX + ((g.cx ?? mw / 2) * scale);
        const cy = mapY + ((g.cy ?? mh / 2) * scale);
        const r = (g.radius ?? 0) * scale;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,200,0,0.06)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100,255,50,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Collect all enemies
      const enemies: Brawler[] = game.enemies
        ? game.enemies.filter(b => b.alive)
        : [...(game.bots ?? []), ...(game.enemies ?? [])].filter(b => b.alive);

      const allies: Brawler[] = (game.allies ?? []).filter(b => b.alive);

      // Draw enemies as red dots — hide if they are in a bush (same as in-game visibility)
      for (const b of enemies) {
        if (b.inBush) continue;
        const ex = mapX + b.x * scale;
        const ey = mapY + b.y * scale;
        ctx.beginPath();
        ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#FF4444";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Draw allies as blue dots
      for (const b of allies) {
        const ax = mapX + b.x * scale;
        const ay = mapY + b.y * scale;
        ctx.beginPath();
        ctx.arc(ax, ay, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#40C4FF";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      // Draw player as white/yellow dot (larger)
      if (game.player) {
        const px = mapX + game.player.x * scale;
        const py = mapY + game.player.y * scale;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#FFD700";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // Pulse ring
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,215,0,0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, MAP_SIZE - 1, MAP_SIZE - 1);

    }, 66); // ~15fps

    return () => clearInterval(id);
  }, [gameRef, mode]);

  return (
    <div style={{
      position: "absolute",
      top: 12,
      right: 12,
      zIndex: 8,
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 0 20px rgba(0,0,0,0.7), 0 0 0 1.5px rgba(255,255,255,0.15)",
      userSelect: "none",
    }}>
      <canvas
        ref={cvs}
        width={MAP_SIZE}
        height={MAP_SIZE}
        style={{ display: "block" }}
      />
      {mode !== "starstrike" && mode !== "training" && <EnemyCounter gameRef={gameRef} />}
    </div>
  );
}

function EnemyCounter({ gameRef }: { gameRef: React.RefObject<GameInstance | null> }) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const g = gameRef.current;
      if (!g || !spanRef.current) return;
      const source = g.enemies ?? [...(g.bots ?? []), ...(g.enemies ?? [])];
      const total = source.length;
      const alive = source.filter(b => b.alive).length;
      spanRef.current.textContent = `⚔ Враги: ${alive} / ${total}`;
    }, 250);
    return () => clearInterval(id);
  }, [gameRef]);

  return (
    <div style={{
      background: "rgba(0,0,0,0.75)",
      color: "#FF7777",
      fontSize: 10,
      fontWeight: 800,
      textAlign: "center",
      padding: "3px 8px",
      letterSpacing: 0.5,
      borderTop: "1px solid rgba(255,255,255,0.1)",
    }}>
      <span ref={spanRef}>⚔ Враги: —</span>
    </div>
  );
}
