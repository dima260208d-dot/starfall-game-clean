import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fixCharacterSkinnedMeshes } from "../utils/gltfSkinnedMeshFix";
import { applyGLTFTexturePolicy } from "../utils/texturePolicy";

interface Brawler3DModelProps {
  modelUrl: string;
  /** Name of the GLTF animation clip to loop (e.g. "Walking"). */
  animation: string;
  /** Direct clip index — used as the primary selector when provided. */
  animationIdx?: number;
  /** Glow color used for the radial backdrop. */
  color: string;
  size?: number;
  autoRotateInitial?: boolean;
}

// ── GLTF cache ────────────────────────────────────────────────────────────────
// The first time a model URL is loaded the raw GLTF plus the pre-computed
// normalisation transform are cached. Subsequent viewers clone the scene and
// apply the stored scale/offset — avoiding a re-download AND the bounding-box
// issue that arises when computing Box3 on an off-scene skinned-mesh clone.
interface CachedGLTF {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  normScale: number;
  normOffX: number;
  normOffY: number;
  normOffZ: number;
}
const gltfCache = new Map<string, Promise<CachedGLTF>>();

function loadGLTFCached(url: string): Promise<CachedGLTF> {
  const hit = gltfCache.get(url);
  if (hit) return hit;
  const p = new Promise<CachedGLTF>((resolve, reject) => {
    new GLTFLoader().load(url, (gltf) => {
      const scene = gltf.scene;
      fixMaterials(scene);
      fixCharacterSkinnedMeshes(scene);

      // Compute normalisation from the original scene (correct for skinned meshes).
      const box = new THREE.Box3().setFromObject(scene);
      const sz = new THREE.Vector3();
      box.getSize(sz);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const TARGET_H = 2.2;
      const normScale = sz.y > 0.001 ? TARGET_H / sz.y : 1;

      const animations = gltf.animations ?? [];
      resolve({
        scene,
        animations,
        normScale,
        normOffX: -center.x * normScale,
        normOffY: -box.min.y * normScale,
        normOffZ: -center.z * normScale,
      });
    }, undefined, (err) => {
      // Evict on failure so the next mount can retry the download.
      gltfCache.delete(url);
      reject(err);
    });
  });
  gltfCache.set(url, p);
  return p;
}

// ── Material fix ──────────────────────────────────────────────────────────────
// Many GLB exporters incorrectly set transparent=true, alphaTest, or BackSide.
// Forcing DoubleSide prevents "missing" mesh parts and depthWrite fixes z-order.
function fixMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: THREE.Material) => {
      m.side = THREE.DoubleSide;
      m.depthWrite = true;
      const sm = m as THREE.MeshStandardMaterial;
      if (sm.opacity !== undefined && sm.opacity >= 0.98) {
        m.transparent = false;
      }
      m.needsUpdate = true;
    });
  });
  applyGLTFTexturePolicy(root, null);
}

// ── Animation clip resolution ─────────────────────────────────────────────────
// Resolution order:
//   1. Direct index (most reliable — hardcoded from binary GLB extraction)
//   2. Exact name match
//   3. Case-insensitive partial name match
//   4. Fuzzy: first clip whose name does NOT look like a combat/attack animation
//   5. clips[0] last resort
const ATTACK_PATTERN = /attack|slash|combo|kick|shot|cast|spin|punch|strike|stab/i;
function resolveClip(
  clips: THREE.AnimationClip[],
  requested: string,
  idx?: number,
): THREE.AnimationClip | null {
  if (!clips.length) return null;
  // 1. Direct index
  if (idx !== undefined && clips[idx]) return clips[idx];
  // 2. Exact name
  const exact = clips.find(c => c.name === requested);
  if (exact) return exact;
  // 3. Case-insensitive partial
  const lower = requested.toLowerCase();
  const partial = clips.find(c => c.name.toLowerCase().includes(lower));
  if (partial) return partial;
  // 4. Avoid attack clips — prefer one that looks like a walk/idle
  const nonAttack = clips.filter(c => !ATTACK_PATTERN.test(c.name) && !/^run/i.test(c.name));
  if (nonAttack.length) return nonAttack.find(c => /walk/i.test(c.name)) ?? nonAttack[0];
  // 5. Last resort
  return clips[0];
}

/**
 * Standalone 3D model viewer for menu / collection screens. The user looks at
 * the brawler "head-on" and can drag horizontally to spin the model 360°.
 * One animation clip plays on a loop. Models are cached after first download.
 */
export default function Brawler3DModel({
  modelUrl,
  animation,
  animationIdx,
  color,
  size = 320,
  autoRotateInitial = false,
}: Brawler3DModelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    mixer?: THREE.AnimationMixer;
    clips?: THREE.AnimationClip[];
    currentAction?: THREE.AnimationAction;
    rootGroup?: THREE.Group;
    yaw: number;
    autoRotate: boolean;
    dragging: boolean;
    dragStartX: number;
    dragStartYaw: number;
    raf: number;
    lastTs: number;
  }>({
    yaw: 0,
    autoRotate: autoRotateInitial,
    dragging: false,
    dragStartX: 0,
    dragStartYaw: 0,
    raf: 0,
    lastTs: 0,
  });

  // ---------------- One-time scene setup ----------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (err) {
      console.warn("[Brawler3DModel] WebGL unavailable, skipping", err);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(size, size, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    camera.position.set(0, 1.4, 5.5);
    camera.lookAt(0, 1.0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(color), 0.55);
    rim.position.set(-2, 2, -3);
    scene.add(rim);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    stateRef.current.renderer = renderer;
    stateRef.current.scene = scene;
    stateRef.current.camera = camera;
    stateRef.current.rootGroup = rootGroup;

    // ---------------- Load GLB (cached) ----------------
    let cancelled = false;
    loadGLTFCached(modelUrl).then((cached) => {
      if (cancelled) return;

      // Clone the cached scene — scale/offset already computed at load time.
      const model = cloneSkinned(cached.scene) as THREE.Group;
      fixMaterials(model);
      model.scale.setScalar(cached.normScale);
      model.position.set(cached.normOffX, cached.normOffY, cached.normOffZ);

      rootGroup.add(model);

      const mixer = new THREE.AnimationMixer(model);
      stateRef.current.mixer = mixer;
      stateRef.current.clips = cached.animations;
      playClip(animation, animationIdx);
    }).catch(() => {
      console.warn("[Brawler3DModel] failed to load", modelUrl);
    });

    // ---------------- Render loop ----------------
    const tick = (ts: number) => {
      const s = stateRef.current;
      const dt = s.lastTs ? Math.min(0.05, (ts - s.lastTs) / 1000) : 0;
      s.lastTs = ts;

      if (s.autoRotate && !s.dragging) {
        s.yaw += dt * 0.6;
      }
      if (s.rootGroup) s.rootGroup.rotation.y = s.yaw;
      if (s.mixer) s.mixer.update(dt);
      if (s.renderer && s.scene && s.camera) s.renderer.render(s.scene, s.camera);

      s.raf = requestAnimationFrame(tick);
    };
    stateRef.current.raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(stateRef.current.raf);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      rootGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, size]);

  // ---------------- Animation switching ----------------
  const playClip = (name: string, idx?: number) => {
    const s = stateRef.current;
    if (!s.mixer || !s.clips) return;
    const clip = resolveClip(s.clips, name, idx);

    if (!clip) return;
    const next = s.mixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(0.25);
    next.play();
    if (s.currentAction && s.currentAction !== next) {
      s.currentAction.fadeOut(0.25);
    }
    s.currentAction = next;
  };

  useEffect(() => {
    playClip(animation, animationIdx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, animationIdx]);

  // ---------------- Pointer drag ----------------
  const onPointerDown = (e: React.PointerEvent) => {
    const s = stateRef.current;
    s.dragging = true;
    s.autoRotate = false;
    s.dragStartX = e.clientX;
    s.dragStartYaw = s.yaw;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = stateRef.current;
    if (!s.dragging) return;
    const dx = e.clientX - s.dragStartX;
    s.yaw = s.dragStartYaw + dx * 0.012;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    stateRef.current.dragging = false;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* */ }
  };

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        userSelect: "none",
        touchAction: "none",
        cursor: "grab",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => { stateRef.current.autoRotate = !stateRef.current.autoRotate; }}
      title=""
    >
      <div
        style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: `radial-gradient(circle at 50% 55%, ${color}55 0%, ${color}15 35%, transparent 70%)`,
          filter: "blur(2px)", pointerEvents: "none",
        }}
      />
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }} />
    </div>
  );
}
