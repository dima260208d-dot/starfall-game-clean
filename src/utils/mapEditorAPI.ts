// ── Admin authentication ──────────────────────────────────────────────────────
import { isFlatPickupCellClear, TILE_CELL_SIZE, type TileGrid } from "../game/TileMap";

const ADMIN_KEY      = "clash_admin_unlocked";
const MAPS_KEY       = "clash_editor_maps";
const PUB_PREFIX     = "clash_published_map_";

// Accept both legacy (ripmyself/sempay666) and the official credentials
// (ripmeself/Sempay666 — case-sensitive password) so older sessions keep
// working while the canonical login matches what is documented for admins.
const ADMIN_LOGINS    = ["ripmeself", "ripmyself"];
const ADMIN_PASSWORDS = ["Sempay666", "sempay666"];

export function isAdminUnlocked(): boolean {
  return localStorage.getItem(ADMIN_KEY) === "true";
}

export function tryAdminLogin(login: string, password: string): boolean {
  const l = login.trim();
  if (ADMIN_LOGINS.includes(l) && ADMIN_PASSWORDS.includes(password)) {
    localStorage.setItem(ADMIN_KEY, "true");
    return true;
  }
  return false;
}

export function lockAdmin(): void {
  localStorage.removeItem(ADMIN_KEY);
}

// ── Map data ──────────────────────────────────────────────────────────────────
export type EditorMode = "showdown" | "gemgrab" | "heist" | "bounty" | "brawlball" | "starstrike" | "siege";

export const EDITOR_MODES: { id: EditorMode; label: string; icon: string }[] = [
  { id: "showdown",  label: "Столкновение",         icon: "💀" },
  { id: "gemgrab",   label: "Ограбление кристаллов", icon: "💎" },
  { id: "heist",     label: "Ограбление",            icon: "💰" },
  { id: "bounty",    label: "Охота за головами",     icon: "⭐" },
  { id: "brawlball", label: "Футбол",                icon: "⚽" },
  { id: "starstrike", label: "Удар звезды",          icon: "⭐" },
  { id: "siege",     label: "Осада",                 icon: "🏰" },
];

export interface MapSave {
  id: string;
  name: string;
  mode: EditorMode;
  cells: number[];      // GRID_SIZE × GRID_SIZE flat, value = TileType
  overlays: number[];   // same size, value = OverlayType (0 = none)
  rotations?: number[]; // same size, per-cell LINE_TILE direction (0 = H, 1 = V)
  createdAt: number;
  updatedAt: number;
}

export function getSavedMaps(): MapSave[] {
  try { return JSON.parse(localStorage.getItem(MAPS_KEY) ?? "[]"); }
  catch { return []; }
}

export function upsertMap(map: MapSave): void {
  const all = getSavedMaps();
  const idx = all.findIndex(m => m.id === map.id);
  if (idx >= 0) all[idx] = map; else all.push(map);
  localStorage.setItem(MAPS_KEY, JSON.stringify(all));
}

export function deleteMapById(id: string): void {
  localStorage.setItem(MAPS_KEY, JSON.stringify(getSavedMaps().filter(m => m.id !== id)));
}

export function getPublishedMap(mode: EditorMode): MapSave | null {
  try {
    const raw = localStorage.getItem(PUB_PREFIX + mode);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function publishMap(map: MapSave): void {
  localStorage.setItem(PUB_PREFIX + map.mode, JSON.stringify(map));
}

export function unpublishMap(mode: EditorMode): void {
  localStorage.removeItem(PUB_PREFIX + mode);
}

// ── Overlay types (special game markers placed on top of tiles) ───────────────
export const OV = {
  NONE:        0,
  SPAWN_BLUE:  1,
  SPAWN_RED:   2,
  SPAWN_SD:    3,
  GEM_CENTER:  4,
  SAFE_BLUE:   5,
  SAFE_RED:    6,
  BASE_BLUE:   7,
  BASE_RED:    8,
  GOAL_BLUE:   9,
  GOAL_RED:    10,
  POWER_BOX:   11,
} as const;
export type OVType = typeof OV[keyof typeof OV];

// ── Validation ────────────────────────────────────────────────────────────────
const GS = 60; // grid size

function tile(cells: number[], x: number, y: number): number {
  if (x < 0 || y < 0 || x >= GS || y >= GS) return -1;
  return cells[y * GS + x];
}

function overlay(ovs: number[], x: number, y: number): number {
  if (x < 0 || y < 0 || x >= GS || y >= GS) return 0;
  return ovs[y * GS + x];
}

function isWalkable(t: number): boolean {
  // GRASS=0, BUSH=3, HEAL=7 — water and walls are impassable for BFS
  return t === 0 || t === 3 || t === 7;
}

function bfsConnected(cells: number[], starts: [number, number][]): boolean {
  if (starts.length < 2) return true;
  const visited = new Uint8Array(GS * GS);
  const queue: [number, number][] = [starts[0]];
  visited[starts[0][1] * GS + starts[0][0]] = 1;
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GS || ny >= GS) continue;
      if (visited[ny * GS + nx]) continue;
      if (!isWalkable(tile(cells, nx, ny))) continue;
      visited[ny * GS + nx] = 1;
      queue.push([nx, ny]);
    }
  }
  for (const [sx, sy] of starts.slice(1)) {
    if (!visited[sy * GS + sx]) return false;
  }
  return true;
}

export interface ValidationResult { ok: boolean; errors: string[] }

export function validateMap(cells: number[], ovs: number[], mode: EditorMode): ValidationResult {
  const errors: string[] = [];

  const spawnsSD: [number,number][] = [];
  const spawnBlue: [number,number][] = [];
  const spawnRed: [number,number][] = [];
  const gemCenters: [number,number][] = [];
  const safesBlue: [number,number][] = [];
  const safesRed: [number,number][] = [];
  const basesBlue: [number,number][] = [];
  const basesRed: [number,number][] = [];

  for (let y = 0; y < GS; y++) {
    for (let x = 0; x < GS; x++) {
      switch (overlay(ovs, x, y)) {
        case OV.SPAWN_SD:    spawnsSD.push([x,y]);    break;
        case OV.SPAWN_BLUE:  spawnBlue.push([x,y]);   break;
        case OV.SPAWN_RED:   spawnRed.push([x,y]);    break;
        case OV.GEM_CENTER:  gemCenters.push([x,y]);  break;
        case OV.SAFE_BLUE:   safesBlue.push([x,y]);   break;
        case OV.SAFE_RED:    safesRed.push([x,y]);    break;
        case OV.BASE_BLUE:   basesBlue.push([x,y]);   break;
        case OV.BASE_RED:    basesRed.push([x,y]);    break;
      }
    }
  }

  if (mode === "showdown") {
    if (spawnsSD.length < 6) errors.push(`Нужно минимум 6 спавн-точек (сейчас: ${spawnsSD.length})`);
    if (spawnsSD.length > 10) errors.push(`Максимум 10 спавн-точек (сейчас: ${spawnsSD.length})`);
    for (let i = 0; i < spawnsSD.length; i++) {
      for (let j = i + 1; j < spawnsSD.length; j++) {
        const dx = Math.abs(spawnsSD[i][0] - spawnsSD[j][0]);
        const dy = Math.abs(spawnsSD[i][1] - spawnsSD[j][1]);
        if (Math.sqrt(dx*dx+dy*dy) < 3) {
          errors.push("Спавн-точки слишком близко друг к другу (минимум 3 клетки)");
          break;
        }
      }
      if (errors.length > 5) break;
    }
    if (!bfsConnected(cells, spawnsSD)) errors.push("Карта не связна — не все спавн-точки достижимы");

    const pickupGrid: TileGrid = {
      cells: Uint8Array.from(cells),
      destroyed: new Uint8Array(GS * GS),
      width: GS,
      height: GS,
      cellSize: TILE_CELL_SIZE,
    };
    let badPowerBox = false;
    for (let y = 0; y < GS; y++) {
      for (let x = 0; x < GS; x++) {
        if (overlay(ovs, x, y) === OV.POWER_BOX && !isFlatPickupCellClear(pickupGrid, x, y)) {
          badPowerBox = true;
          break;
        }
      }
      if (badPowerBox) break;
    }
    if (badPowerBox) {
      errors.push("Бокс усиления: клетка и 8 соседей — только трава (без кустов, стен, воды и декора).");
    }
  }

  if (mode === "gemgrab") {
    if (gemCenters.length === 0) errors.push("Нужен маркер центра кристаллов");
    const [cx, cy] = gemCenters[0] ?? [30, 30];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const t = tile(cells, cx + dx, cy + dy);
        if (t !== 0 && t !== 3 && t !== 7) {
          errors.push("Зона 5×5 вокруг центра кристаллов не должна содержать непроходимые блоки");
          break;
        }
      }
      if (errors.length > 5) break;
    }
    if (spawnBlue.length === 0) errors.push("Нужна синяя спавн-точка");
    if (spawnRed.length === 0) errors.push("Нужна красная спавн-точка");
  }

  if (mode === "heist") {
    if (safesBlue.length === 0) errors.push("Нужен синий сейф");
    if (safesRed.length === 0) errors.push("Нужен красный сейф");
    safesBlue.forEach(([x,y]) => {
      if (x < 5 || x >= GS-5 || y < 5 || y >= GS-5) errors.push("Сейф слишком близко к краю (мин. 5 клеток)");
      if (x >= GS/2) errors.push("Синий сейф должен быть на левой половине карты");
    });
    safesRed.forEach(([x,y]) => {
      if (x < 5 || x >= GS-5 || y < 5 || y >= GS-5) errors.push("Сейф слишком близко к краю");
      if (x < GS/2) errors.push("Красный сейф должен быть на правой половине карты");
    });
    if (spawnBlue.length === 0) errors.push("Нужна синяя спавн-точка");
    if (spawnRed.length === 0) errors.push("Нужна красная спавн-точка");
  }

  if (mode === "siege") {
    if (basesBlue.length === 0) errors.push("Нужна синяя база");
    if (basesRed.length === 0) errors.push("Нужна красная база");
    basesBlue.forEach(([x]) => { if (x >= GS/2) errors.push("Синяя база должна быть на левой половине"); });
    basesRed.forEach(([x]) => { if (x < GS/2)  errors.push("Красная база должна быть на правой половине"); });
    if (spawnBlue.length === 0) errors.push("Нужна синяя спавн-точка");
    if (spawnRed.length === 0) errors.push("Нужна красная спавн-точка");
  }

  if (mode === "bounty" || mode === "brawlball" || mode === "starstrike") {
    if (spawnBlue.length === 0) errors.push("Нужна синяя спавн-точка");
    if (spawnRed.length === 0) errors.push("Нужна красная спавн-точка");
  }

  return { ok: errors.length === 0, errors };
}

// ── Random map generation ─────────────────────────────────────────────────────
// Brawl-Stars–style: left–right symmetric, BFS-connected, clear zones around overlays
export function generateRandomMap(mode: EditorMode): { cells: number[]; overlays: number[] } {
  const HALF = GS / 2; // 30
  const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

  // Solid block types that walls/obstacles can be
  const WALL_TYPES = [1, 2, 5, 6]; // box, crate, fence, rope-fence
  const DECO_TYPES = [3, 3, 9];    // bush, bush, barrel

  // Protected cells (cannot be blocked), filled later
  const protectedCells = new Set<number>();
  const protect = (x: number, y: number, r = 3) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < GS && ny < GS)
          protectedCells.add(ny * GS + nx);
      }
  };

  // ── Overlay layout per mode ──────────────────────────────────────────────
  // Positions are for the LEFT half; right half is mirrored at GS-1-x.
  type OvEntry = { x: number; y: number; ov: number; mirrorOv?: number };

  const overlayEntries: OvEntry[] = [];
  const addPair = (lx: number, ly: number, lovType: number, rovType: number) => {
    overlayEntries.push({ x: lx, y: ly, ov: lovType, mirrorOv: rovType });
  };

  const CX = HALF - 1, CY = HALF - 1; // center-ish (29,29)

  if (mode === "showdown") {
    // 10 spawn points spread around the map
    const raw: [number,number][] = [
      [5,5],[5,CY],[5,GS-6],
      [CX,5],[CX,GS-6],
      [GS-6,5],[GS-6,CY],[GS-6,GS-6],
      [CX-8,CY-8],[CX+8,CY+8],
    ];
    raw.forEach(([x,y]) => overlayEntries.push({ x, y, ov: OV.SPAWN_SD }));
  } else {
    // 3 blue spawns (left), 3 red spawns (mirror)
    const spawnYs = [CY - 4, CY, CY + 4];
    spawnYs.forEach(sy => addPair(3, sy, OV.SPAWN_BLUE, OV.SPAWN_RED));

    if (mode === "gemgrab") {
      overlayEntries.push({ x: CX, y: CY, ov: OV.GEM_CENTER });
    }
    if (mode === "heist") {
      addPair(7, CY, OV.SAFE_BLUE, OV.SAFE_RED);
    }
    if (mode === "siege") {
      addPair(5, CY, OV.BASE_BLUE, OV.BASE_RED);
    }
    if (mode === "bounty") {
      // No extra overlays beyond spawns
    }
    if (mode === "brawlball" || mode === "starstrike") {
      // Goals on top/bottom edges of center (same layout as футбол)
      overlayEntries.push({ x: CX, y: 5,      ov: OV.GOAL_BLUE });
      overlayEntries.push({ x: CX, y: GS - 6, ov: OV.GOAL_RED  });
    }
  }

  // Mark all overlay positions as protected (5×5 clear zone)
  for (const e of overlayEntries) {
    protect(e.x, e.y, 4);
    if (e.mirrorOv !== undefined) protect(GS - 1 - e.x, e.y, 4);
  }

  // ── Build the left half using random cluster shapes ──────────────────────
  function tryGenerate(): { cells: number[]; overlays: number[] } | null {
    const cells = new Array<number>(GS * GS).fill(0);
    const ovs   = new Array<number>(GS * GS).fill(0);

    const setCell = (x: number, y: number, t: number) => {
      if (x < 0 || y < 0 || x >= GS || y >= GS) return;
      if (protectedCells.has(y * GS + x)) return;
      cells[y * GS + x] = t;
    };

    // ── Scatter clusters on left half only (x < HALF) ────────────────────
    const clusterCount = rand(28, 45);
    for (let i = 0; i < clusterCount; i++) {
      const x = rand(2, HALF - 3);
      const y = rand(2, GS - 3);
      const isWall = Math.random() < 0.65;
      const t = isWall
        ? WALL_TYPES[rand(0, WALL_TYPES.length - 1)]
        : DECO_TYPES[rand(0, DECO_TYPES.length - 1)];
      const w = rand(1, isWall ? 4 : 2);
      const h = rand(1, isWall ? 3 : 2);
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++)
          setCell(x + dx, y + dy, t);
    }

    // ── Add a few water patches (left half only) ──────────────────────────
    if (Math.random() < 0.5) {
      const wx = rand(HALF - 12, HALF - 4), wy = rand(4, GS - 8);
      const ww = rand(2, 4), wh = rand(2, 3);
      for (let dy = 0; dy < wh; dy++)
        for (let dx = 0; dx < ww; dx++)
          setCell(wx + dx, wy + dy, 4); // WATER
    }

    // ── Mirror left half → right half ────────────────────────────────────
    for (let y = 0; y < GS; y++) {
      for (let x = 0; x < HALF; x++) {
        const t = cells[y * GS + x];
        if (t !== 0) {
          const rx = GS - 1 - x;
          if (!protectedCells.has(y * GS + rx)) cells[y * GS + rx] = t;
        }
      }
    }

    // ── Place overlays ────────────────────────────────────────────────────
    for (const e of overlayEntries) {
      cells[e.y * GS + e.x] = 0;
      ovs[e.y * GS + e.x] = e.ov;
      if (e.mirrorOv !== undefined) {
        const rx = GS - 1 - e.x;
        cells[e.y * GS + rx] = 0;
        ovs[e.y * GS + rx] = e.mirrorOv;
      }
    }

    // ── BFS connectivity check ────────────────────────────────────────────
    const keyPoints: [number,number][] = overlayEntries.map(e => [e.x, e.y] as [number,number]);
    if (mode === "showdown") {
      // only use SD spawns
    }
    if (keyPoints.length >= 2 && !bfsConnected(cells, keyPoints)) return null;

    return { cells: Array.from(cells), overlays: Array.from(ovs) };
  }

  // Retry up to 20 times until BFS passes
  for (let attempt = 0; attempt < 20; attempt++) {
    const result = tryGenerate();
    if (result) return result;
  }
  // Last-resort fallback: open map with only overlays
  const cells = new Array<number>(GS * GS).fill(0);
  const ovs   = new Array<number>(GS * GS).fill(0);
  for (const e of overlayEntries) {
    ovs[e.y * GS + e.x] = e.ov;
    if (e.mirrorOv !== undefined) ovs[e.y * GS + (GS - 1 - e.x)] = e.mirrorOv;
  }
  return { cells, overlays: ovs };
}

// ── Auto-seed default published maps (called once at app startup) ─────────────
const SEED_VERSION_KEY = "clash_seed_v3";
export function autoSeedDefaultMaps(): void {
  if (!localStorage.getItem(SEED_VERSION_KEY)) {
    const modes: EditorMode[] = ["showdown", "gemgrab", "heist", "bounty", "brawlball", "starstrike", "siege"];
    for (const mode of modes) {
      if (getPublishedMap(mode)) continue;
      const { cells, overlays } = generateRandomMap(mode);
      const map: MapSave = {
        id: `default_${mode}`,
        name: `Default ${mode}`,
        mode,
        cells,
        overlays,
        rotations: new Array(GS * GS).fill(0),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      upsertMap(map);
      publishMap(map);
    }
    localStorage.setItem(SEED_VERSION_KEY, "1");
  }
  // Older installs seeded before "starstrike" existed — add default map once.
  const STAR_KEY = "clash_editor_starstrike_v1";
  if (!localStorage.getItem(STAR_KEY)) {
    if (!getPublishedMap("starstrike")) {
      const { cells, overlays } = generateRandomMap("starstrike");
      const map: MapSave = {
        id: "default_starstrike",
        name: "Default starstrike",
        mode: "starstrike",
        cells,
        overlays,
        rotations: new Array(GS * GS).fill(0),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      upsertMap(map);
      publishMap(map);
    }
    localStorage.setItem(STAR_KEY, "1");
  }
}
