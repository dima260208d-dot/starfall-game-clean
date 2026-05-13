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
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fixCharacterSkinnedMeshes } from "../utils/gltfSkinnedMeshFix";
import { applyCanvasBitmapDrawPolicy, applyGLTFTexturePolicy } from "../utils/texturePolicy";

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

function getRenderer() {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    sharedRenderer.setPixelRatio(1);
    sharedRenderer.setSize(RENDER_SIZE, RENDER_SIZE);
    sharedRenderer.setClearColor(0x000000, 0);
    sharedRenderer.shadowMap.enabled = false;
  }
  return sharedRenderer;
}

function startLoop() {
  if (sharedRafId) return;
  const loop = () => {
    sharedRafId = requestAnimationFrame(loop);
    const renderer = getRenderer();
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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entryRef = useRef<IconEntry | null>(null);

  useEffect(() => {
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
    icons.add(entry);
    startLoop();

    const url = assetUrl(modelPath);
    if (gltfCache.has(url)) {
      const g = cloneSkinned(gltfCache.get(url)!);
      entry.group = g;
      scene.add(g);
    } else {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        fixCharacterSkinnedMeshes(model);
        applyGLTFTexturePolicy(model, getRenderer());
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
        gltfCache.set(url, group);
        const g2 = cloneSkinned(group);
        entry.group = g2;
        scene.add(g2);
      }, undefined, () => {
        const fallback = makeFallbackGroup(modelPath, color);
        entry.group = fallback;
        scene.add(fallback);
      });
    }

    return () => {
      icons.delete(entry);
      stopLoop();
    };
  }, [modelPath, size, ambientMult, dirMult, color]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
    />
  );
}
