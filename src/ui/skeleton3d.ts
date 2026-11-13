// 3D live skeleton from MediaPipe world landmarks (metres, hip-centred, y down).
import {
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
} from 'three';
import { JOINTS, SKELETON } from '../core/poseTopology';

export type SkeletonPreset = 'front' | 'side';

export type Skeleton3D = {
  readonly el: HTMLDivElement;
  update(
    world: readonly { x: number; y: number; z: number }[] | undefined,
    mirrored: boolean,
  ): void;
  setPreset(p: SkeletonPreset): void;
  dispose(): void;
};

const UP = new Vector3(0, 1, 0);

export function createSkeleton3D(): Skeleton3D {
  const el = document.createElement('div');
  el.className = 'skeleton3d';
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  el.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.05, 20);
  camera.position.set(0, 0.05, 2.5);
  camera.lookAt(0, 0, 0);
  scene.add(new HemisphereLight(0xffffff, 0x0b0d10, 1.4));
  const key = new DirectionalLight(0xffffff, 1.2);
  key.position.set(1, 2, 3);
  scene.add(key);

  const rig = new Group();
  scene.add(rig);
  const floor = new Mesh(
    new RingGeometry(0.35, 0.37, 48),
    new MeshStandardMaterial({ color: 0x2c343e }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.95;
  rig.add(floor);

  const jointGeo = new SphereGeometry(0.028, 12, 8);
  const boneGeo = new CylinderGeometry(0.014, 0.014, 1, 8);
  const jointMat = new MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.5 });
  const boneMat = new MeshStandardMaterial({ color: 0x4ade80, roughness: 0.5 });
  const joints = new Map(JOINTS.map((i) => [i, new Mesh(jointGeo, jointMat)]));
  const bones = SKELETON.map(() => new Mesh(boneGeo, boneMat));
  joints.forEach((m) => rig.add(m));
  bones.forEach((m) => rig.add(m));
  rig.visible = false;

  const pts: Vector3[] = Array.from({ length: 33 }, () => new Vector3());
  const tmp = new Vector3();
  const q = new Quaternion();
  let disposed = false;

  const render = () => {
    if (!disposed) renderer.render(scene, camera);
  };

  const ro = new ResizeObserver(() => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  });
  ro.observe(el);

  let dragX: number | null = null;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (dragX === null) return;
    rig.rotation.y += (e.clientX - dragX) * 0.012;
    dragX = e.clientX;
    el.dataset.angle = rig.rotation.y.toFixed(2);
    render();
  });
  canvas.addEventListener('pointerup', () => (dragX = null));
  canvas.addEventListener('pointercancel', () => (dragX = null));

  return {
    el,
    update(world, mirrored) {
      if (!world || world.length < 33) {
        rig.visible = false;
        el.dataset.live = 'false';
        render();
        return;
      }
      const sx = mirrored ? -1 : 1;
      world.forEach((p, i) => pts[i]?.set(p.x * sx, -p.y, -p.z));
      joints.forEach((m, i) => {
        const p = pts[i];
        if (p) m.position.copy(p);
      });
      SKELETON.forEach(([a, b], k) => {
        const pa = pts[a];
        const pb = pts[b];
        const bone = bones[k];
        if (!pa || !pb || !bone) return;
        tmp.subVectors(pb, pa);
        const len = tmp.length();
        bone.position.copy(pa).addScaledVector(tmp, 0.5);
        bone.scale.set(1, Math.max(len, 1e-4), 1);
        bone.quaternion.copy(q.setFromUnitVectors(UP, tmp.normalize()));
      });
      rig.visible = true;
      el.dataset.live = 'true';
      render();
    },
    setPreset(p) {
      rig.rotation.y = p === 'front' ? 0 : -Math.PI / 2;
      el.dataset.preset = p;
      el.dataset.angle = rig.rotation.y.toFixed(2);
      render();
    },
    dispose() {
      disposed = true;
      ro.disconnect();
      [jointGeo, boneGeo, floor.geometry].forEach((g) => g.dispose());
      [jointMat, boneMat, floor.material].forEach((m) => m.dispose());
      renderer.dispose();
      el.remove();
    },
  };
}
