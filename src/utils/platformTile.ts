import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const TILE_PX = 512;

let cachedCanvas: HTMLCanvasElement | null = null;
let loadPromise: Promise<HTMLCanvasElement | null> | null = null;

export function getPlatformTileCanvas(): HTMLCanvasElement | null {
  return cachedCanvas;
}

export function loadPlatformTile(): Promise<HTMLCanvasElement | null> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = TILE_PX;
    offscreen.height = TILE_PX;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(TILE_PX, TILE_PX);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x8b6e3a);

    const scene = new THREE.Scene();
    const half = 5;
    const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 200);
    camera.position.set(0, 50, 0);
    camera.lookAt(0, 0, 0);
    camera.up.set(0, 0, -1);

    scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    const dir = new THREE.DirectionalLight(0xfff8e0, 0.55);
    dir.position.set(4, 10, 4);
    scene.add(dir);

    try {
      const baseUrl: string = (import.meta as any).env?.BASE_URL ?? "/";
      const url = baseUrl.replace(/\/$/, "") + "/models/platform.glb";
      const loader = new GLTFLoader();
      const gltf = await new Promise<any>((res, rej) =>
        loader.load(url, res, undefined, rej)
      );

      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.z) || 1;
      const scale = (half * 2 * 0.99) / maxDim;

      model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      model.scale.setScalar(scale);
      scene.add(model);

      renderer.render(scene, camera);

      const ctx2d = offscreen.getContext("2d")!;
      ctx2d.drawImage(renderer.domElement, 0, 0);
      cachedCanvas = offscreen;
    } catch (e) {
      console.warn("[platformTile] Failed to load platform.glb", e);
    } finally {
      renderer.dispose();
    }
    return cachedCanvas;
  })();
  return loadPromise;
}
