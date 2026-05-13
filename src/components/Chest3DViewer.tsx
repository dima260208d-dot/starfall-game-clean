/**
 * Chest3DViewer — small Three.js canvas displaying an idle-rotating 3D chest.
 * Used inline inside chest cards as a visual replacement for ChestVisual.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHESTS, type ChestRarity } from "../utils/chests";

export const CHEST_MODELS: Record<ChestRarity, string> = {
  common:         "models/chest_common.glb",
  rare:           "models/chest_rare.glb",
  epic:           "models/chest_epic.glb",
  mega:           "models/chest_mega.glb",
  legendary:      "models/chest_legendary.glb",
  mythic:         "models/chest_mythic.glb",
  ultralegendary: "models/chest_ultralegendary.glb",
};

interface CachedChest {
  scene: THREE.Group;
  normScale: number;
  normOffX: number;
  normOffY: number;
  normOffZ: number;
}

const chestGltfCache = new Map<string, Promise<CachedChest>>();

export function loadChestCached(url: string): Promise<CachedChest> {
  const hit = chestGltfCache.get(url);
  if (hit) return hit;
  const p = new Promise<CachedChest>((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const scene = gltf.scene;
      scene.traverse((obj) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        const m = obj as THREE.Mesh;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat: THREE.Material) => { mat.side = THREE.DoubleSide; mat.needsUpdate = true; });
      });
      const box = new THREE.Box3().setFromObject(scene);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const TARGET_H = 2.4;
      const normScale = sz.y > 0.001 ? TARGET_H / sz.y : 1;
      resolve({
        scene,
        normScale,
        normOffX: -center.x * normScale,
        normOffY: -box.min.y * normScale,
        normOffZ: -center.z * normScale,
      });
    }, undefined, (err) => { chestGltfCache.delete(url); reject(err); });
  });
  chestGltfCache.set(url, p);
  return p;
}

interface Props {
  rarity: ChestRarity;
  size?: number;
}

export default function Chest3DViewer({ rarity, size = 130 }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const def = CHESTS[rarity];

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch { return; }

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1.1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 3);
    scene.add(key);
    const glow = new THREE.PointLight(new THREE.Color(def.color), 3, 8);
    glow.position.set(0, 1.5, 2);
    scene.add(glow);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    let rafId = 0;
    let lastTs = 0;
    let cancelled = false;

    const tick = (ts: number) => {
      rafId = requestAnimationFrame(tick);
      const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
      lastTs = ts;
      rootGroup.rotation.y += dt * 0.65;
      rootGroup.position.y = Math.sin(ts / 1200) * 0.08;
      glow.intensity = 2.5 + Math.sin(ts / 700) * 0.8;
      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(tick);

    const base = (import.meta as any).env?.BASE_URL ?? "/";
    loadChestCached(`${base}${CHEST_MODELS[rarity]}`).then((cached) => {
      if (cancelled) return;
      const model = cloneSkinned(cached.scene) as THREE.Group;
      model.scale.setScalar(cached.normScale);
      model.position.set(cached.normOffX, cached.normOffY, cached.normOffZ);
      rootGroup.add(model);
    }).catch(() => {});

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [rarity, size]);

  return (
    <div
      ref={mountRef}
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    />
  );
}
