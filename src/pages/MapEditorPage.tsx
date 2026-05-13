import { useState, useEffect, useRef, useCallback } from "react";
import {
  isAdminUnlocked, tryAdminLogin, lockAdmin,
  getSavedMaps, upsertMap, deleteMapById,
  getPublishedMap, publishMap,
  validateMap, generateRandomMap,
  EDITOR_MODES, OV,
  type MapSave, type EditorMode, type OVType,
} from "../utils/mapEditorAPI";
import { getTileCanvas, loadAllTileModels } from "../utils/tileModelCache";
import { getPlatformTileCanvas, loadPlatformTile } from "../utils/platformTile";
import { getPowerBoxCanvas, getSafeCanvas, loadPowerModels } from "../utils/powerModelCache";

const GS = 60;
const IDX = (x: number, y: number) => y * GS + x;

// ── Tile palette definition ───────────────────────────────────────────────────
// Note: type 0 (grass/ground) is NOT in the palette — it's the default background.
// Use the Erase tool to return a cell to ground.
const TILE_DEFS = [
  { type: 1,  label: "Стена",      color: "#8B6060", icon: "🧱", desc: "Непроходимая" },
  { type: 2,  label: "Гора",       color: "#607060", icon: "⛰️", desc: "Непроходимая" },
  { type: 3,  label: "Куст",       color: "#4CAF50", icon: "🌳", desc: "Укрытие" },
  { type: 4,  label: "Вода",       color: "#1565C0", icon: "💧", desc: "Замедление" },
  { type: 5,  label: "Кости",      color: "#BDBDBD", icon: "💀", desc: "Разрушаемый" },
  { type: 6,  label: "Забор",      color: "#C8A45A", icon: "🔩", desc: "Просматривается" },
  { type: 7,  label: "Бочка",      color: "#C2185B", icon: "❤️", desc: "Лечение" },
  { type: 9,  label: "Кактус",     color: "#558B2F", icon: "🌵", desc: "Непроходимый" },
  { type: 10, label: "Дерево",     color: "#8D6E63", icon: "🪵", desc: "Непроходимый" },
  { type: 11, label: "Камень",     color: "#78909C", icon: "🪨", desc: "Непроходимый" },
  { type: 12, label: "Пирамида",   color: "#FDD835", icon: "🔺", desc: "Непроходимая" },
] as const;

// All possible overlay markers
const ALL_OVERLAY_DEFS: { ov: OVType; label: string; color: string; icon: string }[] = [
  { ov: OV.SPAWN_SD,   label: "Спавн SD",      color: "#FF9800", icon: "🔶" },
  { ov: OV.SPAWN_BLUE, label: "Спавн синих",   color: "#1976D2", icon: "🔵" },
  { ov: OV.SPAWN_RED,  label: "Спавн красных", color: "#D32F2F", icon: "🔴" },
  { ov: OV.GEM_CENTER, label: "Центр кристалл",color: "#9C27B0", icon: "💎" },
  { ov: OV.SAFE_BLUE,  label: "Сейф синих",    color: "#0288D1", icon: "🔐" },
  { ov: OV.SAFE_RED,   label: "Сейф красных",  color: "#C62828", icon: "🔐" },
  { ov: OV.BASE_BLUE,  label: "База синих",     color: "#0277BD", icon: "🏰" },
  { ov: OV.BASE_RED,   label: "База красных",   color: "#B71C1C", icon: "🏰" },
  { ov: OV.GOAL_BLUE,  label: "Ворота синих",   color: "#0288D1", icon: "⚽" },
  { ov: OV.GOAL_RED,   label: "Ворота красных", color: "#C62828", icon: "⚽" },
  { ov: OV.POWER_BOX,  label: "Бокс усиления",  color: "#7B2FBE", icon: "📦" },
];

// Which overlays are valid for each mode
const MODE_OVERLAYS: Record<EditorMode, OVType[]> = {
  showdown:   [OV.SPAWN_SD, OV.POWER_BOX],
  gemgrab:    [OV.SPAWN_BLUE, OV.SPAWN_RED, OV.GEM_CENTER],
  heist:      [OV.SPAWN_BLUE, OV.SPAWN_RED, OV.SAFE_BLUE, OV.SAFE_RED],
  bounty:     [OV.SPAWN_BLUE, OV.SPAWN_RED],
  brawlball:  [OV.SPAWN_BLUE, OV.SPAWN_RED, OV.GOAL_BLUE, OV.GOAL_RED],
  starstrike: [OV.SPAWN_BLUE, OV.SPAWN_RED, OV.GOAL_BLUE, OV.GOAL_RED],
  siege:      [OV.SPAWN_BLUE, OV.SPAWN_RED, OV.BASE_BLUE, OV.BASE_RED],
};

type Tool = "pan" | "place" | "erase" | "brush" | "fill_rect";
type Mirror = "none" | "h" | "v" | "both";

// ── Spawn-point auto-placement ────────────────────────────────────────────────
// Default spawn positions for each mode (x, y in grid cells, 0-indexed).
// Blue spawns on the left third, Red on the right — symmetric.
const DEFAULT_SPAWNS: Record<EditorMode, { type: OVType; x: number; y: number }[]> = {
  showdown: Array.from({ length: 10 }, (_, i) => ({
    type: OV.SPAWN_SD as OVType,
    x: Math.round(30 + Math.cos((i / 10) * Math.PI * 2 - Math.PI / 2) * 22),
    y: Math.round(30 + Math.sin((i / 10) * Math.PI * 2 - Math.PI / 2) * 22),
  })),
  gemgrab:   [
    { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 52, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 36 },
    { type: OV.GEM_CENTER as OVType, x: 30, y: 30 },
  ],
  heist:     [
    { type: OV.SPAWN_BLUE as OVType, x: 10, y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 50, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 36 },
    { type: OV.SAFE_BLUE  as OVType, x: 5,  y: 30 },
    { type: OV.SAFE_RED   as OVType, x: 55, y: 30 },
  ],
  bounty:    [
    { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 52, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 36 },
  ],
  brawlball: [
    { type: OV.SPAWN_BLUE as OVType, x: 10, y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 50, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 36 },
    { type: OV.GOAL_BLUE  as OVType, x: 2,  y: 30 },
    { type: OV.GOAL_RED   as OVType, x: 57, y: 30 },
  ],
  starstrike: [
    { type: OV.SPAWN_BLUE as OVType, x: 10, y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 10, y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 50, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 50, y: 36 },
    { type: OV.GOAL_BLUE  as OVType, x: 2,  y: 30 },
    { type: OV.GOAL_RED   as OVType, x: 57, y: 30 },
  ],
  siege:     [
    { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 24 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 30 }, { type: OV.SPAWN_BLUE as OVType, x: 8,  y: 36 },
    { type: OV.SPAWN_RED  as OVType, x: 52, y: 24 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 30 }, { type: OV.SPAWN_RED  as OVType, x: 52, y: 36 },
    { type: OV.BASE_BLUE  as OVType, x: 4,  y: 30 },
    { type: OV.BASE_RED   as OVType, x: 56, y: 30 },
  ],
};

function applyAutoSpawns(mode: EditorMode, ovArr: number[]): void {
  for (const { type, x, y } of DEFAULT_SPAWNS[mode]) {
    if (x >= 0 && x < GS && y >= 0 && y < GS) ovArr[IDX(x, y)] = type;
  }
}

function hasAnySpawns(mode: EditorMode, ovArr: number[]): boolean {
  if (mode === "showdown") return ovArr.some(v => v === OV.SPAWN_SD);
  return ovArr.some(v => v === OV.SPAWN_BLUE) || ovArr.some(v => v === OV.SPAWN_RED);
}

// Max number of each spawn type allowed per mode
const SPAWN_MAX: Partial<Record<number, number>> = {
  [OV.SPAWN_SD]:   10,
  [OV.SPAWN_BLUE]: 3,
  [OV.SPAWN_RED]:  3,
};

interface Selection { x0: number; y0: number; x1: number; y1: number }

// ── Admin Login modal ─────────────────────────────────────────────────────────
function AdminLoginModal({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [login, setLogin] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    if (tryAdminLogin(login, pass)) onSuccess();
    else setErr("Неверный логин или пароль");
  };
  return (
    <Overlay>
      <ModalBox title="Вход для администратора">
        <input
          placeholder="Логин" value={login} onChange={e => setLogin(e.target.value)}
          style={inputStyle}
        />
        <input
          placeholder="Пароль" type="password" value={pass}
          onChange={e => setPass(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          style={{ ...inputStyle, marginTop: 10 }}
        />
        {err && <div style={{ color: "#F44336", fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Btn color="#FF5252" onClick={onCancel}>Отмена</Btn>
          <Btn color="#69F0AE" onClick={submit}>Войти</Btn>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Mode Select modal ─────────────────────────────────────────────────────────
function ModeSelectModal({ onSelect }: { onSelect: (m: EditorMode) => void }) {
  return (
    <Overlay>
      <ModalBox title="Выберите режим карты">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {EDITOR_MODES.map(m => (
            <button key={m.id} onClick={() => onSelect(m.id)} style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12, padding: "16px 12px", color: "white", cursor: "pointer",
              textAlign: "center", fontFamily: "inherit", transition: "background 0.15s",
            }}
              onMouseOver={e => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
              onMouseOut={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            >
              <div style={{ fontSize: 28 }}>{m.icon}</div>
              <div style={{ marginTop: 6, fontWeight: 800, fontSize: 13 }}>{m.label}</div>
            </button>
          ))}
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Save modal ────────────────────────────────────────────────────────────────
function SaveModal({ defaultName, onSave, onCancel }: { defaultName: string; onSave: (n: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(defaultName);
  return (
    <Overlay>
      <ModalBox title="Сохранить карту">
        <input
          value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && name.trim() && onSave(name.trim())}
          placeholder="Название карты" style={inputStyle} autoFocus
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn color="#FF5252" onClick={onCancel}>Отмена</Btn>
          <Btn color="#69F0AE" onClick={() => name.trim() && onSave(name.trim())}>Сохранить</Btn>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Maps library modal ────────────────────────────────────────────────────────
function MapsModal({
  maps, currentMode, onLoad, onDelete, onPublish, onClose,
}: {
  maps: MapSave[]; currentMode: EditorMode;
  onLoad: (m: MapSave) => void; onDelete: (id: string) => void;
  onPublish: (m: MapSave) => void; onClose: () => void;
}) {
  const published = getPublishedMap(currentMode);
  return (
    <Overlay>
      <ModalBox title="Сохранённые карты" wide>
        {maps.length === 0 && (
          <div style={{ color: "rgba(255,255,255,0.4)", textAlign: "center", padding: 24 }}>
            Нет сохранённых карт
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
          {maps.map(m => (
            <div key={m.id} style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
                  {EDITOR_MODES.find(x => x.id === m.mode)?.label ?? m.mode} • {new Date(m.updatedAt).toLocaleDateString("ru-RU")}
                  {published?.id === m.id && <span style={{ color: "#69F0AE", marginLeft: 8 }}>✓ Опубликована</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <SmBtn color="#40C4FF" onClick={() => onLoad(m)}>Открыть</SmBtn>
                {m.mode === currentMode && (
                  <SmBtn color="#FFD54F" onClick={() => onPublish(m)}>Опубликовать</SmBtn>
                )}
                <SmBtn color="#FF5252" onClick={() => { if (confirm(`Удалить «${m.name}»?`)) onDelete(m.id); }}>Удалить</SmBtn>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: "right" }}>
          <Btn color="rgba(255,255,255,0.3)" onClick={onClose}>Закрыть</Btn>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Validation Result modal ───────────────────────────────────────────────────
function ValidationModal({ errors, onClose, onForce }: { errors: string[]; onClose: () => void; onForce?: () => void }) {
  return (
    <Overlay>
      <ModalBox title={errors.length === 0 ? "Карта корректна ✓" : "Ошибки валидации"}>
        {errors.length === 0 ? (
          <div style={{ color: "#69F0AE", fontWeight: 700 }}>Карта прошла все проверки!</div>
        ) : (
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {errors.map((e, i) => <li key={i} style={{ color: "#F44336", fontSize: 13 }}>{e}</li>)}
          </ul>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn color="rgba(255,255,255,0.3)" onClick={onClose}>Закрыть</Btn>
          {errors.length > 0 && onForce && (
            <Btn color="#FF9800" onClick={onForce}>Опубликовать всё равно</Btn>
          )}
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Main MapEditorPage ────────────────────────────────────────────────────────
interface Props { onBack: () => void }

export default function MapEditorPage({ onBack }: Props) {
  const [authed, setAuthed] = useState(isAdminUnlocked());
  const [showLogin, setShowLogin] = useState(!isAdminUnlocked());

  // Redirect to login if not authed
  if (!authed && !showLogin) return null;
  if (showLogin && !authed) {
    return <AdminLoginModal
      onSuccess={() => { setAuthed(true); setShowLogin(false); }}
      onCancel={onBack}
    />;
  }

  return <EditorCore onBack={onBack} />;
}

// ── Editor core (only rendered when authed) ───────────────────────────────────
function EditorCore({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Rotation arrow button hit-areas (canvas pixel space) for LINE_TILE hover UI
  const rotBtnsRef = useRef<{
    H: { x: number; y: number; w: number; h: number };
    V: { x: number; y: number; w: number; h: number };
    gx: number; gy: number;
  } | null>(null);

  // Grid state
  const [mode, setMode] = useState<EditorMode | null>(null);
  const cells     = useRef<number[]>(new Array(GS * GS).fill(0));
  const overlays  = useRef<number[]>(new Array(GS * GS).fill(0));
  // Per-cell LINE_TILE (bones=5, fence=6) rotation: 0 = horizontal, 1 = vertical
  const rotations = useRef<number[]>(new Array(GS * GS).fill(0));
  const [, forceRedraw] = useState(0);
  const redraw = useCallback(() => forceRedraw(n => n + 1), []);

  // Camera
  const camX = useRef(0);   // world px (CSS units)
  const camY = useRef(0);
  const zoom = useRef(14);  // px per cell (CSS units, may be fractional)
  const cssCanvas = useRef({ w: 800, h: 600 }); // CSS pixel size of canvas

  // Tools
  const [tool, setTool] = useState<Tool>("pan");
  const [lineDir, setLineDir] = useState<"auto" | "h" | "v">("auto");
  const [mirror, setMirror] = useState<Mirror>("none");
  // Modal: offer to auto-place spawns when none are found
  const [autoSpawnPrompt, setAutoSpawnPrompt] = useState<{ yes: () => void; no: () => void } | null>(null);
  const [selectedTile, setSelectedTile] = useState<number>(0);   // 0 = none selected
  const [selectedOv, setSelectedOv]   = useState<OVType | 0>(0); // 0 = not using overlay

  // 3D model assets
  const [modelsReady, setModelsReady] = useState(false);
  useEffect(() => {
    Promise.all([loadAllTileModels(), loadPlatformTile(), loadPowerModels()]).then(() => {
      setModelsReady(true);
    });
  }, []);
  // Re-render whenever models finish loading
  useEffect(() => { if (modelsReady) redraw(); }, [modelsReady]);

  // Interaction state
  const isPanning = useRef(false);
  const isDrawing = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  /** Hold Space to pan even while «Ставить» and a tile are selected (like Photoshop). */
  const spacePan = useRef(false);
  const fillStart = useRef<{ x: number; y: number } | null>(null);
  const [fillSel, setFillSel] = useState<Selection | null>(null);
  const brushLastCell = useRef<{ x: number; y: number } | null>(null);

  // Modals
  const [showMaps, setShowMaps]       = useState(false);
  const [showSave, setShowSave]       = useState(false);
  const [saveName, setSaveName]       = useState("Моя карта");
  const [currentId, setCurrentId]     = useState<string | null>(null);
  const [notification, setNotif]      = useState("");
  const [valResult, setValResult]     = useState<{ errors: string[]; action?: () => void } | null>(null);
  const [maps, setMaps]               = useState<MapSave[]>([]);

  const notify = (msg: string) => { setNotif(msg); setTimeout(() => setNotif(""), 3000); };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, button")) return;
      e.preventDefault();
      spacePan.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spacePan.current = false;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  // Logical canvas size + client→logical scale (must match drawing after setTransform(dpr)).
  const getCanvasLayoutScale = () => {
    const c = canvasRef.current;
    if (!c) return { sx: 1, sy: 1, W: cssCanvas.current.w, H: cssCanvas.current.h };
    const rect = c.getBoundingClientRect();
    const W = c.clientWidth || cssCanvas.current.w || 1;
    const H = c.clientHeight || cssCanvas.current.h || 1;
    return {
      W,
      H,
      sx: rect.width > 0 ? W / rect.width : 1,
      sy: rect.height > 0 ? H / rect.height : 1,
    };
  };

  // Map pointer position to editor logical (CSS) space — same as ctx after setTransform(dpr).
  const clientToCanvas = (clientX: number, clientY: number) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const { sx: scaleX, sy: scaleY } = getCanvasLayoutScale();
    return {
      x: rect.width > 0 ? (clientX - rect.left) * scaleX : 0,
      y: rect.height > 0 ? (clientY - rect.top) * scaleY : 0,
    };
  };

  /** Pan deltas must use the same scale as clientToCanvas (rect can differ from clientWidth). */
  const clientDeltaToCanvasDelta = (dxClient: number, dyClient: number) => {
    const { sx, sy } = getCanvasLayoutScale();
    return { dx: dxClient * sx, dy: dyClient * sy };
  };

  const screenToGrid = (sx: number, sy: number): { gx: number; gy: number } => ({
    gx: Math.floor((sx + camX.current) / zoom.current),
    gy: Math.floor((sy + camY.current) / zoom.current),
  });

  const clampCam = () => {
    const cs = zoom.current;
    const maxX = GS * cs - cssCanvas.current.w;
    const maxY = GS * cs - cssCanvas.current.h;
    camX.current = Math.max(0, Math.min(camX.current, Math.max(0, maxX)));
    camY.current = Math.max(0, Math.min(camY.current, Math.max(0, maxY)));
  };

  // ── Mirror helper ───────────────────────────────────────────────────────────
  const mirrorCells = (gx: number, gy: number): [number, number][] => {
    const pts: [number, number][] = [[gx, gy]];
    if (mirror === "h" || mirror === "both") pts.push([GS - 1 - gx, gy]);
    if (mirror === "v" || mirror === "both") pts.push([gx, GS - 1 - gy]);
    if (mirror === "both") pts.push([GS - 1 - gx, GS - 1 - gy]);
    return [...new Map(pts.map(p => [p[0] * 1000 + p[1], p])).values()];
  };

  // ── Place / erase at cell ───────────────────────────────────────────────────
  const applyToCell = useCallback((gx: number, gy: number, t: Tool) => {
    if (gx < 0 || gy < 0 || gx >= GS || gy >= GS) return;

    // Enforce max spawn-point count before placing
    if (t !== "erase" && selectedOv !== 0) {
      const max = SPAWN_MAX[selectedOv];
      if (max !== undefined) {
        const alreadyHere = overlays.current[IDX(gx, gy)] === selectedOv;
        const existing = overlays.current.filter(v => v === selectedOv).length;
        if (!alreadyHere && existing >= max) {
          setNotif(`Максимум ${max} точек для этого режима`);
          setTimeout(() => setNotif(""), 3000);
          return;
        }
      }
    }

    const pts = mirrorCells(gx, gy);
    pts.forEach(([x, y]) => {
      if (t === "erase") {
        cells.current[IDX(x, y)]    = 0;
        overlays.current[IDX(x, y)] = 0;
        rotations.current[IDX(x, y)] = 0;
      } else {
        if (selectedOv !== 0) {
          overlays.current[IDX(x, y)] = selectedOv;
          cells.current[IDX(x, y)] = 0;  // overlays sit on grass
        } else {
          cells.current[IDX(x, y)]    = selectedTile;
          overlays.current[IDX(x, y)] = 0;
          if (selectedTile === 5 || selectedTile === 6) {
            rotations.current[IDX(x, y)] = lineDir === "v" ? 1 : 0;
          }
        }
      }
    });
    redraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTile, selectedOv, mirror]);

  // Fill rectangle
  const applyFillRect = useCallback((sel: Selection) => {
    const x0 = Math.min(sel.x0, sel.x1), x1 = Math.max(sel.x0, sel.x1);
    const y0 = Math.min(sel.y0, sel.y1), y1 = Math.max(sel.y0, sel.y1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (selectedOv !== 0) {
          overlays.current[IDX(x, y)] = selectedOv;
          cells.current[IDX(x, y)] = 0;
        } else {
          cells.current[IDX(x, y)] = selectedTile;
          overlays.current[IDX(x, y)] = 0;
          if (selectedTile === 5 || selectedTile === 6) {
            rotations.current[IDX(x, y)] = lineDir === "v" ? 1 : 0;
          }
        }
        if (mirror !== "none") {
          mirrorCells(x, y).forEach(([mx, my]) => {
            if (mx === x && my === y) return;
            if (selectedOv !== 0) { overlays.current[IDX(mx,my)] = selectedOv; cells.current[IDX(mx,my)] = 0; }
            else {
              cells.current[IDX(mx,my)] = selectedTile;
              overlays.current[IDX(mx,my)] = 0;
              if (selectedTile === 5 || selectedTile === 6) {
                rotations.current[IDX(mx, my)] = lineDir === "v" ? 1 : 0;
              }
            }
          });
        }
      }
    }
    setFillSel(null);
    redraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTile, selectedOv, mirror]);

  // ── Canvas rendering ────────────────────────────────────────────────────────
  const [hovCell, setHovCell] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    // Scale all drawing to CSS pixels so DPR canvas renders crisp on high-DPI screens
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const cs = zoom.current;
    const ox = camX.current, oy = camY.current;
    const W = cssCanvas.current.w;
    const H = cssCanvas.current.h;

    ctx.clearRect(0, 0, W, H);

    // Dark void outside the map area
    ctx.fillStyle = "#0d0d1a";
    ctx.fillRect(0, 0, W, H);

    const x0 = Math.max(0, Math.floor(ox / cs));
    const x1 = Math.min(GS - 1, Math.ceil((ox + W) / cs));
    const y0 = Math.max(0, Math.floor(oy / cs));
    const y1 = Math.min(GS - 1, Math.ceil((oy + H) / cs));

    const platformCanvas = getPlatformTileCanvas();

    // ── Pass 1: ONE platform image stretched across the entire 60×60 map ───
    const mapSX = -ox, mapSY = -oy, mapSW = GS * cs, mapSH = GS * cs;
    if (platformCanvas) {
      ctx.drawImage(platformCanvas, mapSX, mapSY, mapSW, mapSH);
    } else {
      ctx.fillStyle = "#5a8c44";
      ctx.fillRect(mapSX, mapSY, mapSW, mapSH);
    }

    // ── Pass 2: Tile models — painter order by (gx+gy) so NW is “back”, SE is “front”
    // (same idea as MapRenderer). Row-major gy→gx mis-orders diagonal neighbors.
    const SOLID_OD = cs * 0.08;
    const BUSH_OD  = cs * 0.40;
    const WATER_OD = cs * 0.20;
    // Tall solid tiles (wall, mountain, cactus, wood, stone, pyramid) use extra
    // upward overdraw; clip when stacking matches MapRenderer to avoid wrong overlap.
    const TALL_TILES = new Set([1, 2, 9, 10, 11, 12]);
    // Line tiles (fence, bone) auto-rotate 90° when they only have vertical neighbors
    const LINE_TILES = new Set([5, 6]);

    const sMin = x0 + y0;
    const sMax = x1 + y1;
    for (let s = sMin; s <= sMax; s++) {
      const gxMin = Math.max(x0, s - y1);
      const gxMax = Math.min(x1, s - y0);
      for (let gx = gxMin; gx <= gxMax; gx++) {
        const gy = s - gx;
        const sx = gx * cs - ox, sy = gy * cs - oy;
        const t = cells.current[IDX(gx, gy)];
        const ov = overlays.current[IDX(gx, gy)];

        if (t === 0 && ov === 0) continue; // pure grass — already drawn

        if (t !== 0) {
          const modelCanvas = getTileCanvas(t);
          const tileDef = (TILE_DEFS as readonly { type: number; color: string; icon: string }[]).find(d => d.type === t);

          if (modelCanvas) {
            if (LINE_TILES.has(t)) {
              // Bones (5) and Fence (6) orientation stored per-cell in rotations.current.
              // Arrow keys / toolbar set lineDir (default for newly placed tiles).
              const isVertical = rotations.current[IDX(gx, gy)] === 1;
              const od = 0;
              if (isVertical) {
                ctx.save();
                ctx.translate(sx + cs / 2, sy + cs / 2);
                ctx.rotate(Math.PI / 2);
                ctx.drawImage(modelCanvas, -cs / 2, -cs / 2, cs, cs);
                ctx.restore();
              } else {
                ctx.drawImage(modelCanvas, sx, sy, cs, cs);
              }
            } else if (TALL_TILES.has(t)) {
              // Fix south-side bleed: when same-type block is directly BELOW (hasSameSouth),
              // clip this block's bottom at 73% of cell height — that is where the lower
              // block's diamond face starts, so the seam is seamless with no south-wall peek.
              // When a same-type block is ABOVE (hasSameNorth), extend odTop to 1.3×cs so
              // this block's diamond covers the gap left by the upper block's clip.
              const odSide = cs * 0.08;
              const hasSameNorth = gy > 0       && cells.current[IDX(gx, gy - 1)] === t;
              const hasSameSouth = gy < GS - 1  && cells.current[IDX(gx, gy + 1)] === t;
              const odTop = hasSameNorth ? cs * 0.55 : cs * 0.26;
              if (hasSameSouth) {
                ctx.save();
                ctx.beginPath();
                // Column-local clip (same as MapRenderer) — full-width clip caused bad seams.
                ctx.rect(sx - cs, 0, cs * 3, Math.round(sy + cs * 0.50));
                ctx.clip();
                ctx.drawImage(modelCanvas, sx - odSide, sy - odTop, cs + odSide * 2, cs + odTop);
                ctx.restore();
              } else {
                ctx.drawImage(modelCanvas, sx - odSide, sy - odTop, cs + odSide * 2, cs + odTop);
              }
            } else {
              // Barrel (type 7) gets a modest overdraw so it looks fuller in the cell
              const od = t === 3 ? BUSH_OD : t === 4 ? WATER_OD : t === 7 ? cs * 0.10 : SOLID_OD;
              const odTop = t === 7 ? cs * 0.10 : od;
              ctx.drawImage(modelCanvas, sx - od, sy - odTop, cs + od * 2, cs + odTop);
            }
          } else {
            // Models not loaded yet — fallback flat colour + icon
            ctx.fillStyle = tileDef?.color ?? "#888";
            ctx.fillRect(sx, sy, cs, cs);
            if (cs >= 18) {
              ctx.font = `${Math.min(cs * 0.5, 16)}px serif`;
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText(tileDef?.icon ?? "?", sx + cs / 2, sy + cs / 2);
            }
          }
        }

        // Overlay markers (spawn points, safes, goals, etc.)
        if (ov !== 0) {
          const ovDef = ALL_OVERLAY_DEFS.find(d => d.ov === ov);
          if (ovDef) {
            const r = cs * 0.38;
            ctx.save();
            const isSafeOv = ov === OV.SAFE_BLUE || ov === OV.SAFE_RED
              || ov === OV.BASE_BLUE || ov === OV.BASE_RED;
            if (ov === OV.POWER_BOX) {
              const boxSprite = getPowerBoxCanvas();
              if (boxSprite) {
                const D = cs * 1.4;
                ctx.globalAlpha = 0.95;
                ctx.shadowColor = "#CE93D8";
                ctx.shadowBlur = 10;
                ctx.drawImage(boxSprite, sx + cs / 2 - D / 2, sy + cs / 2 - D / 2 - 2, D, D);
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 1;
              } else {
                ctx.globalAlpha = 0.92;
                ctx.fillStyle = ovDef.color;
                ctx.beginPath();
                ctx.arc(sx + cs / 2, sy + cs / 2, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.font = `${Math.min(r * 1.2, 18)}px serif`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(ovDef.icon, sx + cs / 2, sy + cs / 2);
              }
            } else if (isSafeOv) {
              const safeSprite = getSafeCanvas();
              if (safeSprite) {
                const D = cs * 1.35;
                ctx.globalAlpha = 0.95;
                ctx.shadowColor = ovDef.color;
                ctx.shadowBlur = 10;
                ctx.drawImage(safeSprite, sx + cs / 2 - D / 2, sy + cs / 2 - D / 2 - 2, D, D);
                ctx.shadowBlur = 0;
                ctx.globalAlpha = 1;
                // Team tint
                const isBlue = ov === OV.SAFE_BLUE || ov === OV.BASE_BLUE;
                ctx.fillStyle = isBlue ? "rgba(25,100,210,0.22)" : "rgba(210,30,30,0.22)";
                ctx.fillRect(sx + cs / 2 - D / 2, sy + cs / 2 - D / 2 - 2, D, D);
              } else {
                ctx.globalAlpha = 0.92;
                ctx.fillStyle = ovDef.color;
                ctx.beginPath();
                ctx.arc(sx + cs / 2, sy + cs / 2, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.font = `${Math.min(r * 1.2, 18)}px serif`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(ovDef.icon, sx + cs / 2, sy + cs / 2);
              }
            } else {
              ctx.globalAlpha = 0.92;
              ctx.fillStyle = ovDef.color;
              ctx.beginPath();
              ctx.arc(sx + cs / 2, sy + cs / 2, r, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
              if (cs >= 16) {
                ctx.font = `${Math.min(r * 1.2, 18)}px serif`;
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(ovDef.icon, sx + cs / 2, sy + cs / 2);
              }
            }
            ctx.restore();
          }
        }
      }
    }

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 0.5;
    for (let gx = x0; gx <= x1 + 1; gx++) {
      const sx = gx * cs - ox;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
    }
    for (let gy = y0; gy <= y1 + 1; gy++) {
      const sy = gy * cs - oy;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
    }

    // Center cross (for gem grab etc.)
    const halfSx = 30 * cs - ox, halfSy = 30 * cs - oy;
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(halfSx, 0); ctx.lineTo(halfSx, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, halfSy); ctx.lineTo(W, halfSy); ctx.stroke();
    ctx.setLineDash([]);

    // Half-map border (for symmetric placement guidance)
    ctx.strokeStyle = "rgba(255,255,0,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-ox, -oy, GS * cs, GS * cs);

    // Fill rect selection
    if (fillSel) {
      const fx0 = Math.min(fillSel.x0, fillSel.x1) * cs - ox;
      const fy0 = Math.min(fillSel.y0, fillSel.y1) * cs - oy;
      const fw = (Math.abs(fillSel.x1 - fillSel.x0) + 1) * cs;
      const fh = (Math.abs(fillSel.y1 - fillSel.y0) + 1) * cs;
      ctx.fillStyle = "rgba(255,255,0,0.15)";
      ctx.fillRect(fx0, fy0, fw, fh);
      ctx.strokeStyle = "#FFD54F";
      ctx.lineWidth = 2;
      ctx.strokeRect(fx0, fy0, fw, fh);
    }

    // Hover highlight + LINE_TILE rotation arrows
    rotBtnsRef.current = null;
    if (hovCell) {
      const sx = hovCell.x * cs - ox, sy = hovCell.y * cs - oy;
      ctx.strokeStyle = "#ffffff99";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, cs - 2, cs - 2);
      // Mirror highlights
      mirrorCells(hovCell.x, hovCell.y).slice(1).forEach(([mx, my]) => {
        const msx = mx * cs - ox, msy = my * cs - oy;
        ctx.strokeStyle = "#FFD54F88";
        ctx.strokeRect(msx + 1, msy + 1, cs - 2, cs - 2);
      });
      // If hovered cell is a LINE_TILE (bones=5, fence=6), draw H/V rotation arrows above it
      const hovT = cells.current[IDX(hovCell.x, hovCell.y)];
      if (hovT === 5 || hovT === 6) {
        const curRot = rotations.current[IDX(hovCell.x, hovCell.y)];
        const btnH = Math.max(16, Math.round(cs * 0.40));
        const btnW = Math.max(20, Math.round(cs * 0.46));
        const gap = Math.round(cs * 0.08);
        const totalW = btnW * 2 + gap;
        const bx = sx + (cs - totalW) / 2;
        const by = sy - btnH - 4;
        const hBtn = { x: bx, y: by, w: btnW, h: btnH };
        const vBtn = { x: bx + btnW + gap, y: by, w: btnW, h: btnH };
        rotBtnsRef.current = { H: hBtn, V: vBtn, gx: hovCell.x, gy: hovCell.y };
        const fontSize = Math.min(btnH * 0.65, 13);

        // H button
        ctx.fillStyle = curRot === 0 ? "rgba(76,175,80,0.88)" : "rgba(30,30,50,0.78)";
        ctx.beginPath();
        ctx.roundRect(hBtn.x, hBtn.y, hBtn.w, hBtn.h, 4);
        ctx.fill();
        ctx.strokeStyle = curRot === 0 ? "#A5D6A7" : "#555";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "white";
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↔", hBtn.x + hBtn.w / 2, hBtn.y + hBtn.h / 2);

        // V button
        ctx.fillStyle = curRot === 1 ? "rgba(76,175,80,0.88)" : "rgba(30,30,50,0.78)";
        ctx.beginPath();
        ctx.roundRect(vBtn.x, vBtn.y, vBtn.w, vBtn.h, 4);
        ctx.fill();
        ctx.strokeStyle = curRot === 1 ? "#A5D6A7" : "#555";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "white";
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("↕", vBtn.x + vBtn.w / 2, vBtn.y + vBtn.h / 2);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceRedraw, hovCell, fillSel, zoom.current, camX.current, camY.current, lineDir]);

  // ── Arrow keys toggle line direction when bones/fence selected ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (selectedTile !== 5 && selectedTile !== 6) return;
      if (e.key === "ArrowLeft")  { e.preventDefault(); setLineDir("h"); }
      if (e.key === "ArrowRight") { e.preventDefault(); setLineDir("v"); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTile]);

  // ── Resize canvas to parent ─────────────────────────────────────────────────
  const initialCamSet = useRef(false);
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const pw = c.parentElement?.clientWidth  ?? window.innerWidth;
      const ph = c.parentElement?.clientHeight ?? window.innerHeight;
      if (pw === 0 || ph === 0) return; // layout not settled yet
      const dpr = window.devicePixelRatio || 1;
      c.width  = Math.round(pw * dpr);
      c.height = Math.round(ph * dpr);
      c.style.width  = pw + "px";
      c.style.height = ph + "px";
      cssCanvas.current = { w: pw, h: ph };
      // On first load, zoom so the full 60-cell map fills the canvas width (CSS px)
      if (!initialCamSet.current) {
        initialCamSet.current = true;
        zoom.current = Math.max(10, Math.min(28, Math.floor(pw / GS)));
        const mapPx = GS * zoom.current;
        camX.current = 0;
        camY.current = Math.max(0, (mapPx - ph) / 2);
      }
      clampCam();
      redraw();
    };
    // Defer so parent flex container has settled to its final dimensions
    const rafId = requestAnimationFrame(resize);
    window.addEventListener("resize", resize);
    // Fullscreen transitions need two animation frames before the layout settles
    const handleFullscreen = () => { requestAnimationFrame(() => { requestAnimationFrame(resize); }); };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mouse handlers ──────────────────────────────────────────────────────────
  const onMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.button === 1 || e.button === 2) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (e.button !== 0) return;

    // Check if click lands on a LINE_TILE rotation arrow button
    if (rotBtnsRef.current) {
      const { x: cx, y: cy } = clientToCanvas(e.clientX, e.clientY);
      const { H, V, gx: bgx, gy: bgy } = rotBtnsRef.current;
      const inRect = (r: { x: number; y: number; w: number; h: number }) =>
        cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
      if (inRect(H)) {
        rotations.current[IDX(bgx, bgy)] = 0;
        redraw();
        return;
      }
      if (inRect(V)) {
        rotations.current[IDX(bgx, bgy)] = 1;
        redraw();
        return;
      }
    }

    if (
      spacePan.current ||
      tool === "pan" ||
      (tool === "place" && selectedTile === 0 && selectedOv === 0)
    ) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x: sx, y: sy } = clientToCanvas(e.clientX, e.clientY);
    const { gx, gy } = screenToGrid(sx, sy);

    if (tool === "fill_rect") {
      fillStart.current = { x: gx, y: gy };
      setFillSel({ x0: gx, y0: gy, x1: gx, y1: gy });
    } else {
      isDrawing.current = true;
      brushLastCell.current = { x: gx, y: gy };
      applyToCell(gx, gy, tool === "erase" ? "erase" : "place");
    }
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x: sx, y: sy } = clientToCanvas(e.clientX, e.clientY);

    if (isPanning.current) {
      const { dx, dy } = clientDeltaToCanvasDelta(
        e.clientX - lastMouse.current.x,
        e.clientY - lastMouse.current.y,
      );
      camX.current -= dx;
      camY.current -= dy;
      clampCam();
      lastMouse.current = { x: e.clientX, y: e.clientY };
    }

    const { gx, gy } = screenToGrid(sx, sy);
    setHovCell({ x: gx, y: gy });

    if (isPanning.current) {
      redraw();
      return;
    }

    if (isDrawing.current && (tool === "place" || tool === "brush" || tool === "erase")) {
      if (!brushLastCell.current || brushLastCell.current.x !== gx || brushLastCell.current.y !== gy) {
        applyToCell(gx, gy, tool === "erase" ? "erase" : "place");
        brushLastCell.current = { x: gx, y: gy };
      }
    }

    if (fillStart.current && tool === "fill_rect") {
      setFillSel({ x0: fillStart.current.x, y0: fillStart.current.y, x1: gx, y1: gy });
    }
  };

  const onMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning.current) { isPanning.current = false; return; }
    if (fillStart.current && fillSel && tool === "fill_rect") {
      applyFillRect(fillSel);
      fillStart.current = null;
    }
    isDrawing.current = false;
    brushLastCell.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x: mx, y: my } = clientToCanvas(e.clientX, e.clientY);
    const worldX = (mx + camX.current) / zoom.current;
    const worldY = (my + camY.current) / zoom.current;
    // Multiplicative zoom (±15% per tick) for smooth, even steps at all zoom levels
    const factor = e.deltaY > 0 ? (1 / 1.15) : 1.15;
    zoom.current = Math.max(8, Math.min(40, zoom.current * factor));
    camX.current = worldX * zoom.current - mx;
    camY.current = worldY * zoom.current - my;
    clampCam();
    const { gx, gy } = screenToGrid(mx, my);
    setHovCell({ x: gx, y: gy });
    redraw();
  };

  // ── Touch support ───────────────────────────────────────────────────────────
  const lastTouches = useRef<React.Touch[]>([]);
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    lastTouches.current = Array.from(e.touches) as React.Touch[];
    if (e.touches.length === 1) {
      const isPanMode =
        spacePan.current ||
        tool === "pan" ||
        (tool === "place" && selectedTile === 0 && selectedOv === 0);
      if (isPanMode) {
        isPanning.current = true;
        lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else {
        const t = e.touches[0];
        const { x: tx, y: ty } = clientToCanvas(t.clientX, t.clientY);
        const { gx, gy } = screenToGrid(tx, ty);
        isDrawing.current = true;
        applyToCell(gx, gy, tool === "erase" ? "erase" : "place");
      }
    }
  };
  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const a = e.touches[0], b = e.touches[1];
      const pa = lastTouches.current[0], pb = lastTouches.current[1];
      if (pa && pb) {
        const prevDist = Math.hypot(pa.clientX - pb.clientX, pa.clientY - pb.clientY);
        const curDist  = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const ratio = curDist / prevDist;
        const oldZ = zoom.current;
        zoom.current = Math.max(8, Math.min(40, oldZ * ratio));
        const cx = (a.clientX + b.clientX) / 2;
        const cy = (a.clientY + b.clientY) / 2;
        const { x: cmx, y: cmy } = clientToCanvas(cx, cy);
        const wx = (cmx + camX.current) / oldZ;
        const wy = (cmy + camY.current) / oldZ;
        camX.current = wx * zoom.current - cmx;
        camY.current = wy * zoom.current - cmy;
        clampCam();
      }
      // Pan with two fingers — same logical scale as mouse pan
      if (pa && pb) {
        const prevMid = { x: (pa.clientX + pb.clientX) / 2, y: (pa.clientY + pb.clientY) / 2 };
        const curMid  = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
        const { dx, dy } = clientDeltaToCanvasDelta(curMid.x - prevMid.x, curMid.y - prevMid.y);
        camX.current -= dx;
        camY.current -= dy;
        clampCam();
      }
      redraw();
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      if (isPanning.current) {
        const { dx, dy } = clientDeltaToCanvasDelta(
          t.clientX - lastMouse.current.x,
          t.clientY - lastMouse.current.y,
        );
        camX.current -= dx;
        camY.current -= dy;
        lastMouse.current = { x: t.clientX, y: t.clientY };
        clampCam();
        const { x: tx, y: ty } = clientToCanvas(t.clientX, t.clientY);
        const { gx, gy } = screenToGrid(tx, ty);
        setHovCell({ x: gx, y: gy });
        redraw();
      } else if (isDrawing.current) {
        const { x: tx, y: ty } = clientToCanvas(t.clientX, t.clientY);
        const { gx, gy } = screenToGrid(tx, ty);
        if (!brushLastCell.current || brushLastCell.current.x !== gx || brushLastCell.current.y !== gy) {
          applyToCell(gx, gy, tool === "erase" ? "erase" : "place");
          brushLastCell.current = { x: gx, y: gy };
        }
      }
    }
    lastTouches.current = Array.from(e.touches) as React.Touch[];
  };
  const onTouchEnd = () => { isDrawing.current = false; isPanning.current = false; };

  // ── Map actions ─────────────────────────────────────────────────────────────
  const handleClear = () => {
    if (!confirm("Очистить всю карту?")) return;
    cells.current     = new Array(GS * GS).fill(0);
    overlays.current  = new Array(GS * GS).fill(0);
    rotations.current = new Array(GS * GS).fill(0);
    redraw();
  };

  const handleRandom = () => {
    if (!mode) return;
    const gen = generateRandomMap(mode);
    cells.current     = gen.cells;
    overlays.current  = gen.overlays;
    rotations.current = new Array(GS * GS).fill(0);
    redraw();
    notify("Карта сгенерирована случайно");
  };

  const handleSave = (name: string) => {
    if (!mode) return;
    const doSave = (n: string) => {
      const map: MapSave = {
        id: currentId ?? `map_${Date.now()}`,
        name: n, mode,
        cells:     Array.from(cells.current),
        overlays:  Array.from(overlays.current),
        rotations: Array.from(rotations.current),
        createdAt: currentId ? (getSavedMaps().find(m => m.id === currentId)?.createdAt ?? Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };
      upsertMap(map);
      setCurrentId(map.id);
      setSaveName(n);
      setShowSave(false);
      notify(`Карта «${n}» сохранена`);
    };
    if (!hasAnySpawns(mode, overlays.current)) {
      setAutoSpawnPrompt({ yes: () => { applyAutoSpawns(mode, overlays.current); redraw(); doSave(name); }, no: () => doSave(name) });
    } else {
      doSave(name);
    }
  };

  const handleLoad = (map: MapSave) => {
    cells.current    = [...map.cells];
    overlays.current = [...map.overlays];
    rotations.current = map.rotations ? [...map.rotations] : new Array(GS * GS).fill(0);
    setCurrentId(map.id);
    setSaveName(map.name);
    setMode(map.mode);
    setShowMaps(false);
    redraw();
    notify(`Карта «${map.name}» загружена`);
  };

  const handleDelete = (id: string) => {
    deleteMapById(id);
    if (currentId === id) setCurrentId(null);
    setMaps(getSavedMaps());
  };

  const doPublish = (map: MapSave) => {
    publishMap({ ...map, cells: Array.from(cells.current), overlays: Array.from(overlays.current), rotations: Array.from(rotations.current), updatedAt: Date.now() });
    setShowMaps(false);
    notify(`Карта «${map.name}» опубликована для режима ${EDITOR_MODES.find(m => m.id === map.mode)?.label}`);
  };

  const handlePublishCurrent = () => {
    if (!mode) return;
    const doPub = () => {
      const res = validateMap(cells.current, overlays.current, mode);
      if (res.ok) {
        const map: MapSave = {
          id: currentId ?? `map_${Date.now()}`,
          name: saveName, mode,
          cells:     Array.from(cells.current),
          overlays:  Array.from(overlays.current),
          rotations: Array.from(rotations.current),
          createdAt: currentId ? Date.now() : Date.now(),
          updatedAt: Date.now(),
        };
        upsertMap(map);
        doPublish(map);
      } else {
        setValResult({
          errors: res.errors,
          action: () => {
            const map: MapSave = {
              id: currentId ?? `map_${Date.now()}`,
              name: saveName, mode,
              cells:     Array.from(cells.current),
              overlays:  Array.from(overlays.current),
              rotations: Array.from(rotations.current),
              createdAt: Date.now(), updatedAt: Date.now(),
            };
            upsertMap(map);
            doPublish(map);
            setValResult(null);
          },
        });
      }
    };
    if (!hasAnySpawns(mode, overlays.current)) {
      setAutoSpawnPrompt({ yes: () => { applyAutoSpawns(mode, overlays.current); redraw(); doPub(); }, no: () => doPub() });
    } else {
      doPub();
    }
  };

  const handleExport = () => {
    if (!mode) return;
    const data = JSON.stringify({ name: saveName, mode, cells: cells.current, overlays: overlays.current }, null, 2);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    a.download = `${saveName}.json`;
    a.click();
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (!data.cells || data.cells.length !== GS * GS) throw new Error("Неверный формат");
          cells.current     = [...data.cells];
          overlays.current  = data.overlays?.length === GS * GS ? [...data.overlays] : new Array(GS * GS).fill(0);
          rotations.current = data.rotations?.length === GS * GS ? [...data.rotations] : new Array(GS * GS).fill(0);
          if (data.mode) setMode(data.mode as EditorMode);
          if (data.name) setSaveName(data.name);
          setCurrentId(null);
          redraw();
          notify("Карта импортирована");
        } catch (err: any) {
          notify("Ошибка импорта: " + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Show mode select if no mode chosen
  if (!mode) {
    return <ModeSelectModal onSelect={(m) => {
      setMode(m);
      // Auto-place default spawn points immediately when a mode is chosen.
      // The user can delete or move them later.
      applyAutoSpawns(m, overlays.current);
      redraw();
    }} />;
  }

  const modeInfo = EDITOR_MODES.find(m => m.id === mode)!;
  const allMaps = getSavedMaps();

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#0a0020",
      display: "flex", flexDirection: "column",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      userSelect: "none",
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 52, background: "rgba(0,0,0,0.7)", borderBottom: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", gap: 8, padding: "0 12px", flexShrink: 0,
        overflowX: "auto",
      }}>
        <button onClick={onBack} style={tbBtn("#FF5252")}>← Выйти</button>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

        {/* Mode chip */}
        <div style={{
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "rgba(255,255,255,0.7)",
          flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {modeInfo.icon} {modeInfo.label}
        </div>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

        {/* Tools */}
        <ToolBtn active={tool === "pan"}       onClick={() => setTool("pan")}      label="✋ Пан" />
        <ToolBtn active={tool === "place"}     onClick={() => setTool("place")}    label="✏️ Ставить" />
        <ToolBtn active={tool === "erase"}     onClick={() => setTool("erase")}    label="🧹 Ластик" />
        <ToolBtn active={tool === "brush"}     onClick={() => setTool("brush")}    label="🖌️ Кисть" />
        <ToolBtn active={tool === "fill_rect"} onClick={() => setTool("fill_rect")}label="▭ Заполнить" />

        {/* Bones/Fence direction — only shown when bones or fence tile is selected */}
        {(selectedTile === 5 || selectedTile === 6) && (
          <>
            <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
            <ToolBtn active={lineDir !== "v"} onClick={() => setLineDir("h")}    label="↔ Гориз." />
            <ToolBtn active={lineDir === "v"} onClick={() => setLineDir("v")}    label="↕ Верт." />
          </>
        )}

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

        {/* Mirror */}
        <select
          value={mirror}
          onChange={e => setMirror(e.target.value as Mirror)}
          style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)",
            borderRadius: 8, padding: "4px 8px", color: "white", fontSize: 12, cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <option value="none">🔲 Без зеркала</option>
          <option value="h">↔ По гориз.</option>
          <option value="v">↕ По верт.</option>
          <option value="both">⊞ Оба</option>
        </select>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

        <button onClick={handleClear}  style={tbBtn("#FF7043")}>🗑️ Очистить</button>
        <button onClick={handleRandom} style={tbBtn("#AB47BC")}>🎲 Рандом</button>
        <button onClick={() => { setMaps(getSavedMaps()); setShowMaps(true); }} style={tbBtn("#26C6DA")}>📂 Карты</button>
        <button onClick={() => setShowSave(true)} style={tbBtn("#66BB6A")}>💾 Сохранить</button>
        <button onClick={handlePublishCurrent}     style={tbBtn("#FFD54F")}>🌐 Опубликовать</button>

        <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />

        <button onClick={handleExport} style={tbBtn("rgba(255,255,255,0.4)")}>⬇ Экспорт</button>
        <button onClick={handleImport} style={tbBtn("rgba(255,255,255,0.4)")}>⬆ Импорт</button>

        <button onClick={() => {
          lockAdmin();
          onBack();
        }} style={{ ...tbBtn("#FF5252"), marginLeft: "auto", flexShrink: 0 }}>🔒 Выйти</button>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          style={{
            display: "block", width: "100%", height: "100%", touchAction: "none",
            cursor: tool === "pan" ? (isPanning.current ? "grabbing" : "grab") : tool === "erase" ? "cell" : "crosshair",
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { isPanning.current = false; isDrawing.current = false; setHovCell(null); }}
          onWheel={onWheel}
          onContextMenu={e => e.preventDefault()}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />

        {/* Zoom indicator */}
        <div style={{
          position: "absolute", top: 10, right: 10,
          background: "rgba(0,0,0,0.5)", borderRadius: 8, padding: "6px 10px",
          fontSize: 11, color: "rgba(255,255,255,0.65)", lineHeight: 1.35, textAlign: "right",
        }}>
          <div>{Math.round(zoom.current)} px / клетка</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)" }}>Панорама: пробел + ЛКМ или СКМ</div>
        </div>

        {/* Notification */}
        {notification && (
          <div style={{
            position: "absolute", bottom: 90, left: "50%", transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.8)", borderRadius: 12, padding: "10px 20px",
            color: "#69F0AE", fontWeight: 700, fontSize: 14,
            border: "1px solid rgba(105,240,174,0.3)", whiteSpace: "nowrap",
          }}>
            {notification}
          </div>
        )}
      </div>

      {/* ── Bottom palette ────────────────────────────────────────────────── */}
      <div style={{
        height: 82, background: "rgba(0,0,0,0.85)", borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex", alignItems: "center", gap: 6, padding: "0 12px",
        overflowX: "auto", flexShrink: 0,
      }}>
        {/* Tile palette — uses pre-rendered 3D model thumbnails */}
        {TILE_DEFS.map(td => (
          <TileModelPaletteItem
            key={td.type}
            tileType={td.type} label={td.label} color={td.color} icon={td.icon}
            active={selectedOv === 0 && selectedTile === td.type}
            modelsReady={modelsReady}
            onClick={() => {
              setSelectedTile(td.type);
              setSelectedOv(0);
              if (tool !== "erase" && tool !== "brush" && tool !== "fill_rect") setTool("place");
            }}
          />
        ))}

        <div style={{ width: 2, height: 54, background: "rgba(255,255,255,0.15)", flexShrink: 0, margin: "0 4px" }} />

        {/* Overlay palette — filtered to current mode only */}
        {ALL_OVERLAY_DEFS.filter(od => mode && MODE_OVERLAYS[mode]?.includes(od.ov)).map(od => (
          <PaletteItem
            key={od.ov}
            icon={od.icon} label={od.label} color={od.color}
            active={selectedOv === od.ov}
            onClick={() => {
              setSelectedOv(od.ov);
              if (tool !== "erase" && tool !== "brush" && tool !== "fill_rect") setTool("place");
            }}
          />
        ))}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {showSave && (
        <SaveModal
          defaultName={saveName}
          onSave={handleSave}
          onCancel={() => setShowSave(false)}
        />
      )}

      {showMaps && (
        <MapsModal
          maps={allMaps}
          currentMode={mode}
          onLoad={handleLoad}
          onDelete={handleDelete}
          onPublish={map => {
            const res = validateMap(cells.current, overlays.current, mode);
            if (res.ok) doPublish(map);
            else setValResult({ errors: res.errors, action: () => { doPublish(map); setValResult(null); } });
          }}
          onClose={() => setShowMaps(false)}
        />
      )}

      {autoSpawnPrompt && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9999 }}>
          <div style={{ background:"#1e1e2e", borderRadius:12, padding:"28px 32px", maxWidth:380, width:"90%", textAlign:"center", boxShadow:"0 8px 40px #000a" }}>
            <div style={{ fontSize:18, fontWeight:700, color:"#fff", marginBottom:10 }}>Точки спауна не расставлены</div>
            <div style={{ fontSize:14, color:"#ccc", marginBottom:22 }}>
              Расставить точки спауна автоматически? Их можно переместить позже.
            </div>
            <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
              <button onClick={() => { const p = autoSpawnPrompt; setAutoSpawnPrompt(null); p?.yes(); }}
                style={{ padding:"8px 22px", borderRadius:8, border:"none", background:"#4CAF50", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Да, расставить
              </button>
              <button onClick={() => { const p = autoSpawnPrompt; setAutoSpawnPrompt(null); p?.no(); }}
                style={{ padding:"8px 22px", borderRadius:8, border:"none", background:"#555", color:"#eee", fontWeight:700, fontSize:14, cursor:"pointer" }}>
                Нет, сохранить как есть
              </button>
            </div>
          </div>
        </div>
      )}

      {valResult && (
        <ValidationModal
          errors={valResult.errors}
          onClose={() => setValResult(null)}
          onForce={valResult.action}
        />
      )}
    </div>
  );
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────
function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 200, backdropFilter: "blur(4px)",
    }}>
      {children}
    </div>
  );
}

function ModalBox({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #0e0035, #050018)",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: 20, padding: 28,
      width: wide ? 560 : 380, maxWidth: "90vw",
      boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
    }}>
      <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 900, color: "white" }}>{title}</h2>
      {children}
    </div>
  );
}

function Btn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: "10px 18px", borderRadius: 10,
      background: color + "22", border: `1px solid ${color}55`,
      color, fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
    }}>{children}</button>
  );
}

function SmBtn({ children, color, onClick }: { children: React.ReactNode; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 10px", borderRadius: 8,
      background: color + "20", border: `1px solid ${color}50`,
      color, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
      whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function ToolBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "4px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
      fontFamily: "inherit", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap",
      background: active ? "rgba(105,240,174,0.2)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${active ? "rgba(105,240,174,0.5)" : "rgba(255,255,255,0.1)"}`,
      color: active ? "#69F0AE" : "rgba(255,255,255,0.7)",
    }}>{label}</button>
  );
}

function tbBtn(color: string): React.CSSProperties {
  return {
    padding: "4px 10px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    fontFamily: "inherit", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap",
    background: color + "18", border: `1px solid ${color}40`, color,
  };
}

function PaletteItem({ icon, label, color, active, onClick }: {
  icon: string; label: string; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      padding: "6px 8px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
      background: active ? color + "33" : "rgba(255,255,255,0.04)",
      border: `2px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
      color: "white", fontFamily: "inherit",
      boxShadow: active ? `0 0 12px ${color}66` : "none",
      minWidth: 52,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 9, color: active ? color : "rgba(255,255,255,0.5)", fontWeight: 700, lineHeight: 1.2, textAlign: "center" }}>
        {label}
      </span>
    </button>
  );
}

function TileModelPaletteItem({ tileType, label, color, icon, active, modelsReady, onClick }: {
  tileType: number; label: string; color: string; icon: string; active: boolean; modelsReady: boolean; onClick: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const modelCanvas = getTileCanvas(tileType);
    ctx.clearRect(0, 0, 48, 48);
    if (modelCanvas) {
      if (tileType === 3) {
        // BUSH — tall canvas (256×512), show full model squished to fit
        ctx.drawImage(modelCanvas, 0, 0, 48, 48);
      } else {
        ctx.drawImage(modelCanvas, 0, 0, 48, 48);
      }
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 48, 48);
      ctx.font = "24px serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(icon, 24, 24);
    }
  }, [modelsReady, tileType, color, icon]);

  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
      padding: "4px 6px", borderRadius: 10, cursor: "pointer", flexShrink: 0,
      background: active ? color + "33" : "rgba(255,255,255,0.04)",
      border: `2px solid ${active ? color : "rgba(255,255,255,0.08)"}`,
      color: "white", fontFamily: "inherit",
      boxShadow: active ? `0 0 12px ${color}66` : "none",
      minWidth: 52,
    }}>
      <canvas
        ref={canvasRef}
        width={48} height={48}
        style={{ width: 48, height: 48, borderRadius: 6, imageRendering: "pixelated" }}
      />
      <span style={{ fontSize: 9, color: active ? color : "rgba(255,255,255,0.5)", fontWeight: 700, lineHeight: 1.2, textAlign: "center" }}>
        {label}
      </span>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 14px", borderRadius: 10,
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
  color: "white", fontSize: 15, fontFamily: "inherit", outline: "none",
};
