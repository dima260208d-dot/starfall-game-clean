import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { loadRollingStarBallModel } from "../game/soccerBallRenderer";
import { applyCanvasBitmapDrawPolicy, applyGLTFTexturePolicy } from "./texturePolicy";

const SZ = 128; // sprite render resolution

let boxCanvas:  HTMLCanvasElement | null = null;
let jarCanvas:  HTMLCanvasElement | null = null;
let safeCanvas: HTMLCanvasElement | null = null;
let gemCanvas:  HTMLCanvasElement | null = null;
let starBallCanvas: HTMLCanvasElement | null = null;
let loadPromise: Promise<void> | null = null;

function getBaseUrl(): string {
  const base: string = ((import.meta as any).env?.BASE_URL ?? "/");
  return base.replace(/\/$/, "");
}

let sharedRenderer: THREE.WebGLRenderer | null = null;
function getRenderer(): THREE.WebGLRenderer | null {
  if (sharedRenderer) return sharedRenderer;
  try {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(SZ, SZ);
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    sharedRenderer = r;
    return r;
  } catch { return null; }
}

function buildScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 2.2));
  const d1 = new THREE.DirectionalLight(0xfff5e0, 1.5);
  d1.position.set(5, 10, 5);
  scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xd0c0ff, 0.7);
  d2.position.set(-4, 6, -2);
  scene.add(d2);
  return scene;
}

function fixMaterials(root: THREE.Object3D, renderer: THREE.WebGLRenderer | null): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mats = Array.isArray((obj as THREE.Mesh).material)
      ? (obj as THREE.Mesh).material as THREE.Material[]
      : [(obj as THREE.Mesh).material as THREE.Material];
    mats.forEach(m => { m.side = THREE.DoubleSide; m.depthWrite = true; m.needsUpdate = true; });
  });
  applyGLTFTexturePolicy(root, renderer);
}

type CamPreset = "iso" | "front" | "front-low";

function loadAndRender(
  renderer: THREE.WebGLRenderer,
  url: string,
  cam: CamPreset,
): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        try {
          const model = gltf.scene.clone(true);
          fixMaterials(model, getRenderer());

          const box3 = new THREE.Box3().setFromObject(model);
          const center = box3.getCenter(new THREE.Vector3());
          const size = box3.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const scale = 7.0 / maxDim;
          model.position.set(-center.x * scale, -box3.min.y * scale, -center.z * scale);
          model.scale.setScalar(scale);

          const scene = buildScene();
          scene.add(model);

          let camera: THREE.Camera;
          if (cam === "iso") {
            const H = 6.5;
            const c = new THREE.OrthographicCamera(-H, H, H, -H, 0.1, 200);
            c.position.set(0, 8, 8); c.lookAt(0, 1.5, 0);
            camera = c;
          } else if (cam === "front") {
            const H = 5.5;
            const c = new THREE.OrthographicCamera(-H, H, H, -H, 0.1, 200);
            c.position.set(1, 6, 6); c.lookAt(0, 1, 0);
            camera = c;
          } else {
            // front-low: good for safes/vaults — slightly elevated frontal view
            const H = 6.0;
            const c = new THREE.OrthographicCamera(-H, H, H, -H, 0.1, 200);
            c.position.set(0, 5, 9); c.lookAt(0, 2, 0);
            camera = c;
          }

          renderer.setSize(SZ, SZ);
          renderer.setClearColor(0x000000, 0);
          renderer.render(scene, camera);

          const out = document.createElement("canvas");
          out.width = SZ; out.height = SZ;
          const pctx = out.getContext("2d")!;
          applyCanvasBitmapDrawPolicy(pctx);
          pctx.drawImage(renderer.domElement, 0, 0);
          resolve(out);
        } catch (e) { reject(e); }
      },
      undefined,
      reject,
    );
  });
}

export function getPowerBoxCanvas(): HTMLCanvasElement | null { return boxCanvas; }
export function getPowerJarCanvas(): HTMLCanvasElement | null { return jarCanvas; }
export function getSafeCanvas():     HTMLCanvasElement | null { return safeCanvas; }
export function getGemCanvas():      HTMLCanvasElement | null { return gemCanvas; }
export function getStarBallCanvas(): HTMLCanvasElement | null { return starBallCanvas; }
export function loadPowerModels(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const base = getBaseUrl();
    const renderer = getRenderer();
    if (!renderer) return; // no WebGL — callers fall back to Canvas 2D

    try { boxCanvas  = await loadAndRender(renderer, `${base}/models/power_box.glb`, "iso"); }
    catch { /* leave null → Canvas fallback */ }

    try { jarCanvas  = await loadAndRender(renderer, `${base}/models/power_jar.glb`, "front"); }
    catch { /* leave null → Canvas fallback */ }

    try { safeCanvas = await loadAndRender(renderer, `${base}/models/safe.glb`, "front-low"); }
    catch { /* leave null → Canvas fallback */ }

    try { gemCanvas  = await loadAndRender(renderer, `${base}/models/gem.glb`, "front"); }
    catch { /* leave null → Canvas fallback */ }

    try { starBallCanvas = await loadAndRender(renderer, `${base}/models/star_ball.glb`, "front"); }
    catch { /* leave null → Canvas fallback */ }

    try { await loadRollingStarBallModel(base); }
    catch { /* in-game rolling fallback */ }
  })();
  return loadPromise;
}
