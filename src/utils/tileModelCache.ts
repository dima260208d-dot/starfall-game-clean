import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TileType } from "../game/TileMap";

// ── Canvas dimensions ─────────────────────────────────────────────────────────
const TILE_PX = 256;

// ── Camera frustum ────────────────────────────────────────────────────────────
// Non-square frustum: wider in Y to accommodate isometric projection without
// clipping model tops. Ratio ≈ 1.45 matches the isometric height stretch of a cube.
const HALF_X = 4.5;
const HALF_Y = 6.5;

export const PYRAMID_TILE = 12;

const TILE_MODEL: Partial<Record<number, string>> = {
  [TileType.WALL]:       "brick_wall.glb",
  [TileType.MOUNTAIN]:   "stone_block.glb",
  [TileType.BUSH]:       "grass_tile.glb",
  [TileType.WATER]:      "water.glb",
  [TileType.DECORATION]: "bones.glb",
  [TileType.FENCE]:      "fence.glb",
  [TileType.HEAL]:       "barrel.glb",
  [TileType.CACTUS]:     "cactus.glb",
  [TileType.WOOD]:       "wood_block.glb",
  [TileType.SAND_WALL]:  "boulder.glb",
  [PYRAMID_TILE]:        "pyramid.glb",
};

const TILE_FALLBACK_COLOR: Partial<Record<number, string>> = {
  [TileType.WALL]:       "#8B6060",
  [TileType.MOUNTAIN]:   "#607060",
  [TileType.BUSH]:       "#4CAF50",
  [TileType.WATER]:      "#1565C0",
  [TileType.DECORATION]: "#E0E0E0",
  [TileType.FENCE]:      "#C8A45A",
  [TileType.HEAL]:       "#C2185B",
  [TileType.CACTUS]:     "#558B2F",
  [TileType.WOOD]:       "#8D6E63",
  [TileType.SAND_WALL]:  "#78909C",
  [PYRAMID_TILE]:        "#FDD835",
};

// Tile types that are rendered tall in-game.
export const TALL_TILE_TYPES = new Set<number>([
  TileType.WALL,
  TileType.MOUNTAIN,
  TileType.DECORATION,
  TileType.FENCE,
  TileType.WOOD,
  TileType.SAND_WALL,
  TileType.CACTUS,
  PYRAMID_TILE,
]);

const cache = new Map<number, HTMLCanvasElement>();
let loadPromise: Promise<void> | null = null;

function makeFallback(color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_PX; c.height = TILE_PX;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, TILE_PX - 4, TILE_PX - 4);
  return c;
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
function getOrCreateRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(TILE_PX, TILE_PX);
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = false;
    sharedRenderer = r;
    return r;
  } catch {
    return null;
  }
}

function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.8));
  const dir1 = new THREE.DirectionalLight(0xfff5e0, 1.2);
  dir1.position.set(4, 10, 4);
  scene.add(dir1);
  const dir2 = new THREE.DirectionalLight(0xd0e8ff, 0.55);
  dir2.position.set(-4, 6, -2);
  scene.add(dir2);
  return scene;
}

/**
 * Isometric camera with a non-square frustum.
 * HALF_Y > HALF_X gives vertical headroom so tall models don't clip at top.
 * lookAtY shifts the focus point upward so models centred above the ground plane
 * remain in frame.
 */
function buildCamera(lookAtY = 0.8): THREE.OrthographicCamera {
  const cam = new THREE.OrthographicCamera(-HALF_X, HALF_X, HALF_Y, -HALF_Y, 0.1, 200);
  cam.position.set(0, 7, 7);
  cam.lookAt(0, lookAtY, 0);
  return cam;
}

function fixMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: THREE.Material) => {
      m.side = THREE.DoubleSide;
      m.depthWrite = true;
      m.needsUpdate = true;
    });
  });
}

export function getTileCanvas(type: number): HTMLCanvasElement | null {
  return cache.get(type) ?? null;
}

export function loadAllTileModels(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const renderer = getOrCreateRenderer();
    if (!renderer) {
      for (const [typeStr, color] of Object.entries(TILE_FALLBACK_COLOR) as [string, string][]) {
        cache.set(Number(typeStr), makeFallback(color));
      }
      return;
    }

    const baseUrl: string = (import.meta as any).env?.BASE_URL ?? "/";
    const base = baseUrl.replace(/\/$/, "");
    const entries = Object.entries(TILE_MODEL) as [string, string][];

    const fetched = await Promise.allSettled(
      entries.map(async ([typeStr, filename]) => {
        const type = Number(typeStr);
        const url = `${base}/models/${filename}`;
        const gltf = await new Promise<any>((res, rej) =>
          new GLTFLoader().load(url, res, undefined, rej)
        );
        return { type, gltf };
      })
    );

    for (let i = 0; i < fetched.length; i++) {
      const result = fetched[i];
      const type = Number(entries[i][0]);
      const fallback = TILE_FALLBACK_COLOR[type] ?? "#888888";

      if (result.status === "rejected") {
        cache.set(type, makeFallback(fallback));
        continue;
      }
      try {
        const { gltf } = result.value;
        const model = gltf.scene.clone(true);
        fixMaterials(model);

        if (type === TileType.WATER) model.rotation.x = -Math.PI / 2;
        // Fence: no Y rotation so the fence panel faces the camera head-on.
        // A slight X tilt makes the fence look upright from the top-down view.
        if (type === TileType.FENCE) {
          model.rotation.y = 0;
          model.rotation.x = -Math.PI / 10;
        }

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxXZ = Math.max(size.x, size.z) || 1;
        const maxY  = size.y || 1;

        // Primary scale: fill 90 % of frustum width by XZ footprint.
        const scaleByXZ = (HALF_X * 2 * 0.90) / maxXZ;
        // Height cap: don't exceed 90 % of frustum height.
        const scaleByY  = (HALF_Y * 2 * 0.90) / maxY;

        let scale: number;
        let lookAtY = 0.8; // default camera focus point

        if (type === TileType.CACTUS) {
          // Cactus is thin and tall — cap at 80 % of the safe Y scale to avoid clipping.
          // Raise the camera focus to centre the cactus vertically in the frustum.
          scale = Math.min(scaleByXZ, scaleByY * 0.80);
          lookAtY = (maxY * scale) * 0.45;
        } else if (type === TileType.HEAL) {
          // Barrel — scale up to fill ~80% of cell width.
          scale = Math.min(scaleByXZ * 0.85, scaleByY * 0.90);
        } else if (type === TileType.FENCE || type === TileType.WOOD) {
          // These models are taller than they are wide — safe to let Y go a bit larger.
          scale = Math.min(scaleByXZ, scaleByY * 2.0);
        } else if (type === TileType.BUSH) {
          // grass_tile is flat — scale to fill full frustum width.
          scale = Math.min(scaleByXZ, scaleByY);
        } else {
          scale = Math.min(scaleByXZ, scaleByY);
        }

        // Centre horizontally; sit base on ground (y = 0).
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
        model.scale.setScalar(scale);

        renderer.setSize(TILE_PX, TILE_PX);
        renderer.setClearColor(0x000000, 0);

        const scene = buildScene();
        scene.add(model);
        const camera = buildCamera(lookAtY);
        renderer.render(scene, camera);

        const out = document.createElement("canvas");
        out.width = TILE_PX; out.height = TILE_PX;
        out.getContext("2d")!.drawImage(renderer.domElement, 0, 0);
        cache.set(type, out);
      } catch {
        cache.set(type, makeFallback(fallback));
      }
    }

    renderer.setSize(TILE_PX, TILE_PX);
  })();
  return loadPromise;
}
