// Three.js renderer for the original 3D body. Lazy-loaded by the app.
// One instance owns one WebGL context for the whole app: the controller moves `el` between
// screens instead of creating new contexts (phones only allow a handful).
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { figurePalette, stageBackground } from './palette';
import { BODY_SEGMENTS, MUSCLE_PARTS, facingAngle, type BodySegment } from './parts';
import { addRim } from './rim';

export type Body3D = {
  /** Wrapper element (div > canvas); size it with CSS. */
  readonly el: HTMLDivElement;
  setMuscles(primary: readonly string[], secondary: readonly string[]): void;
  setInteractive(on: boolean): void;
  /**
   * Paint the lit stage behind the figure. 'auto' (default) paints it only in the interactive
   * full viewer: the inline (Exercise) and Rest slots sit on a stage their screen already draws,
   * so there the canvas stays transparent.
   */
  setStage(on: boolean | 'auto'): void;
  dispose(): void;
};

const TARGET_Y = 0.9;
const TURN_EASE = 0.18;
const DRAG_RAD_PER_PX = 0.012;

function segmentMesh(s: BodySegment, sphere: BufferGeometry, mat: MeshStandardMaterial): Mesh {
  if (s.kind === 'ellipsoid') {
    const m = new Mesh(sphere, mat);
    m.position.set(...s.at);
    m.scale.set(...s.size);
    return m;
  }
  if (s.kind === 'box') {
    const m = new Mesh(new BoxGeometry(...s.size), mat);
    m.position.set(...s.at);
    return m;
  }
  const a = new Vector3(...s.a);
  const b = new Vector3(...s.b);
  const dir = b.clone().sub(a);
  const m = new Mesh(new CapsuleGeometry(s.r, dir.length(), 6, 14), mat);
  m.position.copy(a.clone().add(b).multiplyScalar(0.5));
  m.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  return m;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createBody3D(opts: { reducedMotion: boolean }): Body3D {
  const el = document.createElement('div');
  el.className = 'body3d';
  // Token colours, read once now (M4e A7): body, rim, stage, cyan muscle.
  const C = figurePalette();
  const paintStage = (on: boolean) => {
    el.dataset.stage = String(on);
    el.style.background = on ? stageBackground() : '';
    el.style.borderRadius = on ? 'var(--r-btn, 12px)' : '';
    el.style.overflow = on ? 'hidden' : '';
  };
  let stageMode: boolean | 'auto' = 'auto';
  const applyStage = () =>
    paintStage(stageMode === 'auto' ? el.dataset.interactive === 'true' : stageMode);
  applyStage();
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // Clear to fully transparent: off the full viewer, the screen's own stage shows through.
  renderer.setClearAlpha(0);
  el.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 0.5, 0.1, 20);
  camera.position.set(0, 1.0, 3.7);
  camera.lookAt(0, TARGET_Y, 0);

  scene.add(new HemisphereLight(C.skyLight, C.groundLight, 1.3));
  const key = new DirectionalLight(C.keyLight, 1.8);
  key.position.set(1.6, 2.6, 3);
  scene.add(key);
  const rim = new DirectionalLight(C.rimLight, 0.8);
  rim.position.set(-2, 1.5, -2.5);
  scene.add(rim);

  const sphere = new SphereGeometry(1, 28, 18);
  const bodyMat = addRim(
    new MeshStandardMaterial({ color: C.body, roughness: 0.8, metalness: 0.05 }),
    { color: C.edge },
  );
  const mats = {
    muscle: addRim(new MeshStandardMaterial({ color: C.idleMuscle, roughness: 0.6 }), {
      color: C.edge,
    }),
    secondary: new MeshStandardMaterial({ color: C.secondary, roughness: 0.55 }),
    primary: new MeshStandardMaterial({
      color: C.muscle,
      emissive: new Color(C.muscleGlow),
      emissiveIntensity: 0.7,
      roughness: 0.45,
    }),
  };

  const body = new Group();
  for (const s of BODY_SEGMENTS) body.add(segmentMesh(s, sphere, bodyMat));
  const muscleMeshes: Mesh[] = [];
  for (const p of MUSCLE_PARTS) {
    const m = new Mesh(sphere, mats.muscle);
    m.position.set(...p.at);
    m.scale.set(...p.scale);
    m.userData.muscle = p.muscle;
    muscleMeshes.push(m);
    body.add(m);
  }
  scene.add(body);

  let targetAngle = facingAngle([]);
  body.rotation.y = targetAngle;
  let frame = 0;
  let disposed = false;

  function render(): void {
    if (!disposed) renderer.render(scene, camera);
    el.dataset.angle = body.rotation.y.toFixed(2);
  }

  function animate(): void {
    frame = 0;
    const delta = targetAngle - body.rotation.y;
    if (opts.reducedMotion || Math.abs(delta) < 0.002) {
      body.rotation.y = targetAngle;
      render();
      return;
    }
    body.rotation.y += delta * TURN_EASE;
    render();
    frame = requestAnimationFrame(animate);
  }

  function kick(): void {
    if (!frame) frame = requestAnimationFrame(animate);
  }

  // Size follows the wrapper element wherever it is attached.
  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fill the canvas height with the figure; back off a little on very narrow canvases.
    camera.position.z = w / h < 0.4 ? 4.4 : 3.7;
    camera.updateProjectionMatrix();
    render();
  });
  ro.observe(el);

  // Drag to rotate (enabled only in the full-screen viewer).
  let dragX: number | null = null;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (el.dataset.interactive !== 'true') return;
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    body.rotation.y += (e.clientX - dragX) * DRAG_RAD_PER_PX;
    targetAngle = body.rotation.y;
    dragX = e.clientX;
    render();
  });
  const endDrag = () => {
    dragX = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  return {
    el,
    setMuscles(primary, secondary) {
      for (const m of muscleMeshes) {
        const id = m.userData.muscle as string;
        m.material = primary.includes(id)
          ? mats.primary
          : secondary.includes(id)
            ? mats.secondary
            : mats.muscle;
      }
      el.dataset.primary = primary.join(',');
      el.dataset.secondary = secondary.join(',');
      // Turn the shortest way round to the new target.
      const raw = facingAngle(primary);
      const turns = Math.round((body.rotation.y - raw) / (2 * Math.PI));
      targetAngle = raw + turns * 2 * Math.PI;
      el.dataset.target = targetAngle.toFixed(2);
      kick();
    },
    setInteractive(on) {
      el.dataset.interactive = String(on);
      canvas.style.touchAction = on ? 'none' : 'auto';
      applyStage();
    },
    setStage(on) {
      stageMode = on;
      applyStage();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      ro.disconnect();
      sphere.dispose();
      body.traverse((o) => {
        if (o instanceof Mesh && o.geometry !== sphere) (o.geometry as BufferGeometry).dispose();
      });
      bodyMat.dispose();
      Object.values(mats).forEach((m) => m.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}
