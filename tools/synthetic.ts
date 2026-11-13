// Dev-only: renders an original articulated mannequin doing dumbbell curls (side view) and records
// it to WebM, for exercising the landmark pipeline without filming anyone.
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
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';

declare global {
  interface Window {
    __render: (o: { reps: number; partials: number; repSec?: number }) => Promise<string>;
  }
}

const W = 720;
const H = 960;
const skin = new MeshStandardMaterial({ color: 0xc98e6b, roughness: 0.7 });
const shirt = new MeshStandardMaterial({ color: 0x2b5c8a, roughness: 0.8 });
const pants = new MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 });
const iron = new MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
const UP = new Vector3(0, 1, 0);

function limb(a: Vector3, b: Vector3, r: number, mat: MeshStandardMaterial): Mesh {
  const m = new Mesh(new CapsuleGeometry(r, 1, 6, 14), mat);
  place(m, a, b);
  return m;
}
function place(m: Mesh, a: Vector3, b: Vector3): void {
  const d = b.clone().sub(a);
  m.position.copy(a.clone().add(b).multiplyScalar(0.5));
  m.scale.set(1, Math.max(d.length(), 1e-3) / 1, 1);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d.normalize()));
}

/** Elbow flexion (rad from straight) over time: full reps reach 145°, partial reps 70°. */
function flexion(t: number, plan: number[], repSec: number): number {
  const i = Math.floor(t / repSec);
  const peak = plan[i];
  if (peak === undefined) return 0.1;
  const u = (t - i * repSec) / repSec; // 0..1: up 40%, hold 10%, down 50%
  const s = u < 0.4 ? u / 0.4 : u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
  const eased = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, s)));
  return 0.1 + eased * (peak - 0.1);
}

window.__render = async ({ reps, partials, repSec = 2.4 }) => {
  const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H, false);
  document.body.append(renderer.domElement);
  const scene = new Scene();
  scene.background = new Color(0xd9d6d0);
  scene.add(new HemisphereLight(0xffffff, 0x8a8070, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 3, 3);
  scene.add(sun);
  const floor = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: 0xa8a29a }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const camera = new PerspectiveCamera(32, W / H, 0.1, 30);
  camera.position.set(0.35, 1.0, 4.2);
  camera.lookAt(0.1, 0.95, 0);

  // Person faces +x; the camera sees their right side.
  const fig = new Group();
  scene.add(fig);
  const head = new Mesh(new SphereGeometry(0.105, 32, 24), skin);
  head.scale.set(0.95, 1.1, 0.9);
  head.position.set(0.01, 1.64, 0);
  const nose = new Mesh(new SphereGeometry(0.022, 12, 10), skin);
  nose.position.set(0.11, 1.63, 0);
  fig.add(head, nose, limb(new Vector3(0, 1.48, 0), new Vector3(0, 1.55, 0), 0.05, skin));
  fig.add(limb(new Vector3(0, 1.08, 0), new Vector3(0, 1.38, 0), 0.15, shirt));
  fig.add(limb(new Vector3(0, 0.93, 0), new Vector3(0, 1.05, 0), 0.14, pants));
  for (const z of [0.09, -0.09]) {
    fig.add(limb(new Vector3(0, 0.92, z), new Vector3(0.03, 0.5, z), 0.075, pants));
    fig.add(limb(new Vector3(0.03, 0.5, z), new Vector3(0, 0.09, z), 0.055, pants));
    const foot = new Mesh(new BoxGeometry(0.24, 0.06, 0.09), pants);
    foot.position.set(0.07, 0.03, z);
    fig.add(foot);
  }
  type Arm = { upper: Mesh; fore: Mesh; bell: Group; shoulder: Vector3; elbow: Vector3 };
  const arms: Arm[] = [0.2, -0.2].map((z) => {
    const shoulder = new Vector3(0, 1.42, z);
    const elbow = new Vector3(-0.02, 1.12, z);
    const upper = limb(shoulder, elbow, 0.045, shirt);
    const fore = limb(elbow, elbow.clone().add(new Vector3(0, -0.26, 0)), 0.038, skin);
    const bell = new Group();
    const bar = new Mesh(new CapsuleGeometry(0.014, 0.14, 4, 8), iron);
    bar.rotation.x = Math.PI / 2;
    const p1 = new Mesh(new BoxGeometry(0.07, 0.07, 0.04), iron);
    p1.position.z = 0.08;
    const p2 = p1.clone();
    p2.position.z = -0.08;
    bell.add(bar, p1, p2);
    fig.add(upper, fore, bell);
    return { upper, fore, bell, shoulder, elbow };
  });

  const plan = [...Array(reps).fill(2.53), ...Array(partials).fill(1.22)]; // 145° and 70°
  const total = plan.length * repSec + 1.0;

  const stream = renderer.domElement.captureStream(30);
  const rec = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 4e6,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(250);

  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      const phi = flexion(Math.max(0, t - 0.5), plan, repSec);
      for (const a of arms) {
        const dir = new Vector3(Math.sin(phi), -Math.cos(phi), 0);
        const hand = a.elbow.clone().addScaledVector(dir, 0.26);
        place(a.fore, a.elbow, hand);
        a.bell.position.copy(hand.clone().addScaledVector(dir, 0.04));
      }
      renderer.render(scene, camera);
      if (t < total) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await done;
  const buf = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
};
