/**
 * SpinningModel3D — uses a single shared WebGL renderer (singleton) to avoid
 * exceeding the browser's WebGL context limit (~16 contexts).
 *
 * Architecture:
 *  - One THREE.WebGLRenderer renders to an OffscreenCanvas
 *  - Each mounted icon registers itself; the shared loop renders each icon's
 *    scene into the renderer, then copies the result to the icon's 2D canvas
 *    via drawImage(renderer.domElement)
 */
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fixCharacterSkinnedMeshes } from "../utils/gltfSkinnedMeshFix";
import { applyCanvasBitmapDrawPolicy, applyGLTFTexturePolicy } from "../utils/texturePolicy";
import { registerWebGLCleanup, notifyWebGLRemount, subscribeWebGLRemount } from "../utils/devWebGLRecovery";

const BASE_URL = (import.meta as any).env?.BASE_URL ?? "/";
function assetUrl(path: string) {
  const b = BASE_URL.endsWith("/") ? BASE_URL : BASE_URL + "/";
  return b + path.replace(/^\//, "");
}

// ─── Shared renderer singleton ──────────────────────────────────────────────

const RENDER_SIZE = 128; // internal render resolution

let sharedRenderer: THREE.WebGLRenderer | null = null;
let sharedRafId = 0;

type IconEntry = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group | null;
  canvas2d: HTMLCanvasElement;
  size: number;
  rotSpeed: number;
};

const icons: Set<IconEntry> = new Set();
const gltfCache = new Map<string, THREE.Group>();
const frozenSnapshotCache = new Map<string, string>();

export type FrozenSnapshotOpts = {
  modelPath: string;
  size: number;
  color?: string;
  ambientMult?: number;
  dirMult?: number;
  cameraPos?: [number, number, number];
  lookAtPos?: [number, number, number];
};

function frozenSnapshotKey(opts: FrozenSnapshotOpts): string {
  const [cx, cy, cz] = opts.cameraPos ?? [0, 0.6, 3];
  const [lx, ly, lz] = opts.lookAtPos ?? [0, 0.2, 0];
  return [
    opts.modelPath,
    opts.size,
    opts.ambientMult ?? 1,
    opts.dirMult ?? 1,
    opts.color ?? "",
    cx, cy, cz,
    lx, ly, lz,
  ].join("|");
}

export function getFrozenSpinningModelSnapshot(opts: FrozenSnapshotOpts): string | null {
  return frozenSnapshotCache.get(frozenSnapshotKey(opts)) ?? null;
}

function loseRendererContext(renderer: THREE.WebGLRenderer): void {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  } catch {
    /* ignore */
  }
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  try {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setSize(RENDER_SIZE, RENDER_SIZE);
    sharedRenderer.setClearColor(0x000000, 0);
    sharedRenderer.shadowMap.enabled = false;
    sharedRenderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      disposeSpinningModelRendererGpuOnly();
      notifyWebGLRemount();
    });
    return sharedRenderer;
  } catch {
    return null;
  }
}

function disposeSpinningModelRendererGpuOnly(): void {
  if (sharedRafId) {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = 0;
  }
  icons.clear();
  if (sharedRenderer) {
    try {
      loseRendererContext(sharedRenderer);
      sharedRenderer.dispose();
    } catch {
      /* ignore */
    }
    sharedRenderer = null;
  }
}

export function disposeSpinningModelRenderer(): void {
  disposeSpinningModelRendererGpuOnly();
  gltfCache.clear();
  frozenSnapshotCache.clear();
}

function normalizeGltfToGroup(model: THREE.Object3D): THREE.Group {
  fixCharacterSkinnedMeshes(model);
  const renderer = getRenderer();
  if (renderer) applyGLTFTexturePolicy(model, renderer);
  const box = new THREE.Box3().setFromObject(model);
  const c = new THREE.Vector3();
  box.getCenter(c);
  const sz = new THREE.Vector3();
  box.getSize(sz);
  const maxDim = Math.max(sz.x, sz.y, sz.z);
  const scale = maxDim > 0.001 ? 1.2 / maxDim : 1;
  model.scale.setScalar(scale);
  model.position.set(-c.x * scale, -c.y * scale, -c.z * scale);
  const group = new THREE.Group();
  group.add(model);
  return group;
}

function resolveAssetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const trimmed = pathOrUrl.replace(/^\//, "");
  const base = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  if (trimmed.startsWith(base.replace(/^\//, "")) || pathOrUrl.startsWith(base)) return pathOrUrl;
  return assetUrl(trimmed);
}

/** Preload a GLB into the shared icon cache (boot / recovery). */
export function preloadSpinningModelPath(pathOrUrl: string): Promise<void> {
  const url = resolveAssetUrl(pathOrUrl);
  if (gltfCache.has(url)) return Promise.resolve();
  return new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        gltfCache.set(url, normalizeGltfToGroup(gltf.scene));
        resolve();
      },
      undefined,
      () => resolve(),
    );
  });
}

registerWebGLCleanup(disposeSpinningModelRendererGpuOnly);

function startLoop() {
  if (sharedRafId) return;
  const loop = () => {
    sharedRafId = requestAnimationFrame(loop);
    const renderer = getRenderer();
    if (!renderer) return;
    for (const entry of icons) {
      if (entry.group) entry.group.rotation.y += entry.rotSpeed;
      renderer.setSize(RENDER_SIZE, RENDER_SIZE);
      renderer.render(entry.scene, entry.camera);
      const ctx = entry.canvas2d.getContext("2d");
      if (ctx) {
        applyCanvasBitmapDrawPolicy(ctx);
        ctx.clearRect(0, 0, entry.size, entry.size);
        ctx.drawImage(renderer.domElement, 0, 0, entry.size, entry.size);
      }
    }
  };
  loop();
}

function stopLoop() {
  if (icons.size === 0 && sharedRafId) {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = 0;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  modelPath: string;
  size?: number;
  color?: string;
  ambientMult?: number;
  dirMult?: number;
  style?: React.CSSProperties;
  /** Optional camera position override (default [0, 0.6, 3]) */
  cameraPos?: [number, number, number];
  /** Optional lookAt target override (default [0, 0.2, 0]) */
  lookAtPos?: [number, number, number];
  /** Override rotation speed in radians/frame (default 0.025) */
  rotSpeed?: number;
  /** One static frame — no RAF loop (lists with many instances). */
  frozen?: boolean;
}

function renderEntryOnce(entry: IconEntry, snapshotKey?: string): void {
  const renderer = getRenderer();
  if (!renderer || !entry.group) return;
  renderer.setSize(RENDER_SIZE, RENDER_SIZE);
  renderer.render(entry.scene, entry.camera);
  const ctx = entry.canvas2d.getContext("2d");
  if (ctx) {
    applyCanvasBitmapDrawPolicy(ctx);
    ctx.clearRect(0, 0, entry.size, entry.size);
    ctx.drawImage(renderer.domElement, 0, 0, entry.size, entry.size);
    if (snapshotKey) {
      try {
        frozenSnapshotCache.set(snapshotKey, entry.canvas2d.toDataURL("image/png"));
      } catch {
        /* ignore */
      }
    }
  }
}

/** Очередь — один WebGL-рендер за раз (параллельный prewarm ломал снимки). */
let snapshotPrewarmTail: Promise<void> = Promise.resolve();

function enqueueSnapshotPrewarm(task: () => Promise<void>): Promise<void> {
  const job = snapshotPrewarmTail
    .then(() => task())
    .catch(() => {});
  snapshotPrewarmTail = job;
  return job;
}

function buildFrozenScene(opts: FrozenSnapshotOpts): {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  group: THREE.Group;
} {
  const ambientMult = opts.ambientMult ?? 1;
  const dirMult = opts.dirMult ?? 1;
  const [cx, cy, cz] = opts.cameraPos ?? [0, 0.6, 3];
  const [lx, ly, lz] = opts.lookAtPos ?? [0, 0.2, 0];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(cx, cy, cz);
  camera.lookAt(lx, ly, lz);

  scene.add(new THREE.AmbientLight(0xffffff, 1.8 * ambientMult));
  const dir = new THREE.DirectionalLight(0xffffff, 3.0 * dirMult);
  dir.position.set(2, 4, 3);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0xffffff, 1.2 * dirMult);
  fill.position.set(-2, 1, 2);
  scene.add(fill);
  const back = new THREE.DirectionalLight(
    opts.color ? new THREE.Color(opts.color) : 0x8888ff,
    0.8 * dirMult,
  );
  back.position.set(-2, -1, -3);
  scene.add(back);

  const url = resolveAssetUrl(opts.modelPath);
  const group = gltfCache.has(url)
    ? cloneSkinned(gltfCache.get(url)!)
    : makeFallbackGroup(opts.modelPath, opts.color);
  scene.add(group);
  return { scene, camera, group };
}

/** Pre-render a static PNG snapshot (pass details, lists). */
export function prewarmFrozenSpinningModelSnapshot(opts: FrozenSnapshotOpts): Promise<void> {
  const key = frozenSnapshotKey(opts);
  if (frozenSnapshotCache.has(key)) return Promise.resolve();
  return enqueueSnapshotPrewarm(async () => {
    if (frozenSnapshotCache.has(key)) return;
    try {
      await preloadSpinningModelPath(opts.modelPath);
      if (frozenSnapshotCache.has(key)) return;
      const canvas = document.createElement("canvas");
      canvas.width = opts.size;
      canvas.height = opts.size;
      const { scene, camera, group } = buildFrozenScene(opts);
      const entry: IconEntry = {
        scene,
        camera,
        group,
        canvas2d: canvas,
        size: opts.size,
        rotSpeed: 0,
      };
      renderEntryOnce(entry, key);
    } catch {
      /* ignore — fallback canvas in ChestVisual */
    }
  });
}

function attachModelToEntry(
  entry: IconEntry,
  group: THREE.Group,
  frozen: boolean,
  snapshotKey?: string,
): void {
  entry.group = group;
  entry.scene.add(group);
  if (frozen) renderEntryOnce(entry, snapshotKey);
}

function makeFallbackGroup(modelPath: string, color?: string): THREE.Group {
  const c = color ? new THREE.Color(color) : new THREE.Color("#bbbbbb");
  const mat = new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.35 });
  const group = new THREE.Group();
  const p = modelPath.toLowerCase();
  if (p.includes("coin")) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 32), mat);
    mesh.rotation.x = Math.PI / 2;
    group.add(mesh);
  } else if (p.includes("gem")) {
    group.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), mat));
  } else if (p.includes("power")) {
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), mat));
  } else if (p.includes("trophy")) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.34, 0.42, 20), mat);
    cup.position.y = 0.18;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.18, 14), mat);
    stem.position.y = -0.14;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 20), mat);
    base.position.y = -0.3;
    group.add(cup, stem, base);
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.65, 0.65), mat));
  }
  return group;
}

export default function SpinningModel3D({
  modelPath,
  size = 48,
  color,
  ambientMult = 1,
  dirMult = 1,
  style,
  cameraPos,
  lookAtPos,
  rotSpeed,
  frozen = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entryRef = useRef<IconEntry | null>(null);
  const [remountEpoch, setRemountEpoch] = useState(0);

  const snapshotOpts: FrozenSnapshotOpts | null = frozen
    ? { modelPath, size, color, ambientMult, dirMult, cameraPos, lookAtPos }
    : null;
  const snapshotKey = snapshotOpts ? frozenSnapshotKey(snapshotOpts) : null;
  const cachedSnapshot = snapshotKey ? frozenSnapshotCache.get(snapshotKey) ?? null : null;
  const [snapshotSrc, setSnapshotSrc] = useState<string | null>(cachedSnapshot);

  useEffect(() => subscribeWebGLRemount(() => setRemountEpoch((e) => e + 1)), []);

  useEffect(() => {
    if (!frozen) return;
    if (snapshotKey && frozenSnapshotCache.has(snapshotKey)) {
      setSnapshotSrc(frozenSnapshotCache.get(snapshotKey)!);
    }
  }, [frozen, snapshotKey, remountEpoch]);

  useEffect(() => {
    if (frozen && snapshotSrc) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const [cx, cy, cz] = cameraPos ?? [0, 0.6, 3];
    const [lx, ly, lz] = lookAtPos ?? [0, 0.2, 0];
    const speed = rotSpeed ?? 0.025;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(cx, cy, cz);
    camera.lookAt(lx, ly, lz);

    scene.add(new THREE.AmbientLight(0xffffff, 1.8 * ambientMult));
    const dir = new THREE.DirectionalLight(0xffffff, 3.0 * dirMult);
    dir.position.set(2, 4, 3);
    scene.add(dir);
    const fill = new THREE.DirectionalLight(0xffffff, 1.2 * dirMult);
    fill.position.set(-2, 1, 2);
    scene.add(fill);
    const back = new THREE.DirectionalLight(color ? new THREE.Color(color) : 0x8888ff, 0.8 * dirMult);
    back.position.set(-2, -1, -3);
    scene.add(back);

    const entry: IconEntry = { scene, camera, group: null, canvas2d: canvas, size, rotSpeed: speed };
    entryRef.current = entry;
    if (!frozen) {
      icons.add(entry);
      startLoop();
    }

    const url = resolveAssetUrl(modelPath);
    const onModelReady = (group: THREE.Group) => {
      if (entryRef.current !== entry) return;
      attachModelToEntry(entry, group, frozen, snapshotKey ?? undefined);
      if (frozen && snapshotKey && frozenSnapshotCache.has(snapshotKey)) {
        setSnapshotSrc(frozenSnapshotCache.get(snapshotKey)!);
      }
    };
    if (gltfCache.has(url)) {
      onModelReady(cloneSkinned(gltfCache.get(url)!));
    } else {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const normalized = normalizeGltfToGroup(gltf.scene);
        gltfCache.set(url, normalized);
        onModelReady(cloneSkinned(normalized));
      }, undefined, () => {
        onModelReady(makeFallbackGroup(modelPath, color));
      });
    }

    return () => {
      if (!frozen) icons.delete(entry);
      entryRef.current = null;
      if (!frozen) stopLoop();
    };
  }, [modelPath, ambientMult, dirMult, color, remountEpoch, frozen, snapshotKey, snapshotSrc]);

  useEffect(() => {
    if (frozen && snapshotSrc) return;
    const canvas = canvasRef.current;
    const entry = entryRef.current;
    if (!canvas || !entry) return;
    entry.size = size;
    canvas.width = size;
    canvas.height = size;
    if (frozen && entry.group) renderEntryOnce(entry, snapshotKey ?? undefined);
  }, [size, frozen, snapshotKey, snapshotSrc]);

  if (frozen && snapshotSrc) {
    return (
      <img
        src={snapshotSrc}
        width={size}
        height={size}
        alt=""
        draggable={false}
        style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    />
  );
}
