// Three.js side of the M4b demo player: builds the original mannequin (cylinders, spheres and
// ellipsoids only, M2 body colours) and poses it from a DemoPose each frame. Loaded lazily by
// player.ts, so three.js stays in its own chunk.
//
// The figure is drawn in the figure frame of poses.ts (+x forward, +y up, +z the figure's right),
// which is right-handed like three.js. `yaw` turns it about the vertical axis: 0 shows the right
// side (forward = screen right), -PI/2 faces the camera.
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';
import type { Highlight } from './highlight';
import { poseAt, type DemoMove, type DemoPose, type V3 } from './moves';
import { SIZES, armTwist, bodyAxes, demoBounds, fitCamera, patchesFor, segmentFrames } from './rig';

/** M2 body3d colours (viewer.ts), plus a lighter limb tone so the figure reads at 2 m. */
const COLORS = {
  body: 0x56636f,
  joint: 0x3b4652,
  secondary: 0x2f9e5c,
  primary: 0x4ade80,
  primaryGlow: 0x166534,
  iron: 0x9aa5b1,
  prop: 0x2a323c,
  floor: 0x000000,
};

const FOV = 32;
const PITCH = 0.12; // radians the camera looks down
const UP = new Vector3(0, 1, 0);

export type DemoScene = {
  readonly canvas: HTMLCanvasElement;
  setSize(w: number, h: number): void;
  setYaw(yaw: number): void;
  setTime(t: number): void;
  render(): void;
  /** Live GPU object counts, for leak checks. */
  info(): { geometries: number; textures: number; programs: number };
  dispose(): void;
};

/** Throws when WebGL can't be created (the caller falls back). */
export function createDemoScene(move: DemoMove, highlights: readonly Highlight[]): DemoScene {
  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 30);
  scene.add(new HemisphereLight(0xdfe7f0, 0x0b0d10, 1.3));
  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(2.2, 3, 3);
  scene.add(key);
  const rim = new DirectionalLight(0x4ade80, 0.45);
  rim.position.set(-2, 1.5, -2.5);
  scene.add(rim);

  // Everything we create, so dispose() can free all of it.
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const geo = <G extends BufferGeometry>(g: G): G => (geos.push(g), g);
  const mat = <M extends Material>(m: M): M => (mats.push(m), m);

  const sphere = geo(new SphereGeometry(1, 24, 16));
  // Unit rods (radius 1 at the a end, height 1 along +y = toward b). Limbs taper toward b.
  const cylinder = geo(new CylinderGeometry(1, 1, 1, 20, 1, true));
  const taper = (k: number) => geo(new CylinderGeometry(k, 1, 1, 20, 1, false));
  const rodGeo = {
    upper: taper(0.85),
    fore: taper(0.8),
    thigh: taper(0.75),
    shin: taper(0.8),
    foot: taper(0.9),
  };
  const box = geo(new BoxGeometry(1, 1, 1));
  const bodyMat = mat(
    new MeshStandardMaterial({ color: COLORS.body, roughness: 0.75, metalness: 0.05 }),
  );
  const jointMat = mat(new MeshStandardMaterial({ color: COLORS.joint, roughness: 0.8 }));
  const ironMat = mat(
    new MeshStandardMaterial({ color: COLORS.iron, roughness: 0.35, metalness: 0.6 }),
  );
  const propMat = mat(new MeshStandardMaterial({ color: COLORS.prop, roughness: 0.9 }));
  const levelMat = {
    secondary: mat(new MeshStandardMaterial({ color: COLORS.secondary, roughness: 0.55 })),
    primary: mat(
      new MeshStandardMaterial({
        color: COLORS.primary,
        emissive: new Color(COLORS.primaryGlow),
        emissiveIntensity: 0.7,
        roughness: 0.45,
      }),
    ),
  };

  // pivot (yaw) > figure (offset so the look point sits at the origin)
  const pivot = new Group();
  const fig = new Group();
  pivot.add(fig);
  scene.add(pivot);

  const floor = new Mesh(
    geo(new CircleGeometry(1, 48)),
    mat(
      new MeshBasicMaterial({
        color: COLORS.floor,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      }),
    ),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  fig.add(floor);

  for (const pr of move.props) {
    const m = new Mesh(box, propMat);
    m.position.set(...pr.at);
    m.scale.set(...pr.size);
    m.rotation.z = pr.rotZ ?? 0;
    fig.add(m);
  }

  const mesh = (g: BufferGeometry, m: Material) => {
    const x = new Mesh(g, m);
    fig.add(x);
    return x;
  };

  // --- mannequin meshes -----------------------------------------------------------------------
  const torso = mesh(sphere, bodyMat);
  const pelvis = mesh(sphere, bodyMat);
  const girdle = mesh(cylinder, bodyMat);
  const neck = mesh(cylinder, bodyMat);
  const head = mesh(sphere, bodyMat);
  const nose = mesh(sphere, bodyMat);
  const limbs = [0, 1].map(() => ({
    shoulder: mesh(sphere, jointMat),
    upper: mesh(rodGeo.upper, bodyMat),
    elbow: mesh(sphere, jointMat),
    fore: mesh(rodGeo.fore, bodyMat),
    wrist: mesh(sphere, jointMat),
    hand: mesh(sphere, bodyMat),
    hip: mesh(sphere, jointMat),
    thigh: mesh(rodGeo.thigh, bodyMat),
    knee: mesh(sphere, jointMat),
    shin: mesh(rodGeo.shin, bodyMat),
    ankle: mesh(sphere, jointMat),
    foot: mesh(rodGeo.foot, bodyMat),
    toe: mesh(sphere, bodyMat),
  }));
  const bells = [0, 1].map(() => {
    const g = new Group();
    const bar = new Mesh(cylinder, ironMat);
    bar.scale.set(0.014, 0.16, 0.014);
    g.add(bar);
    for (const y of [-0.08, 0.08]) {
      const plate = new Mesh(cylinder, ironMat);
      plate.scale.set(0.045, 0.045, 0.045);
      plate.position.y = y;
      const cap = new Mesh(sphere, ironMat); // closes the open cylinder ends
      cap.scale.set(0.045, 0.012, 0.045);
      cap.position.y = y + Math.sign(y) * 0.0225;
      g.add(plate, cap);
    }
    fig.add(g);
    return g;
  });

  // Moving machine parts (pulldown bar, cables, weight stack): counts are fixed for the loop.
  const pose0 = poseAt(move, 0);
  // Closed rods (the open limb cylinder would show the bar's hollow ends); metal weight stack.
  const solidRod = geo(new CylinderGeometry(1, 1, 1, 16, 1, false));
  const rodMeshes = (pose0.rods ?? []).map(() => mesh(solidRod, ironMat));
  const blockMeshes = (pose0.blocks ?? []).map(() => mesh(box, ironMat));

  // Muscle patches: one mesh per patch, created once (the count doesn't change with the pose).
  const twist = armTwist(move);
  const startPatches = patchesFor(segmentFrames(pose0, twist), highlights);
  const patchMeshes = startPatches.map((p) => mesh(sphere, levelMat[p.level]));

  // --- placement helpers (scratch objects, no per-frame allocation of three objects) -----------
  const va = new Vector3();
  const vb = new Vector3();
  const vd = new Vector3();
  const vx = new Vector3();
  const vy = new Vector3();
  const vz = new Vector3();
  const m4 = new Matrix4();
  const set = (v: Vector3, p: V3) => v.set(p[0], p[1], p[2]);

  function rod(m: Mesh, a: V3, b: V3, r: number): void {
    set(va, a);
    set(vb, b);
    vd.subVectors(vb, va);
    const l = Math.max(vd.length(), 1e-4);
    m.position.copy(va).addScaledVector(vd, 0.5);
    m.scale.set(r, l, r);
    m.quaternion.setFromUnitVectors(UP, vd.normalize());
  }
  function ball(m: Mesh, p: V3, r: number): void {
    set(m.position, p);
    m.scale.setScalar(r);
  }
  /** Ellipsoid at c with its y axis along `axis`, z along `normal`, half extents [x, y, z]. */
  function ellipsoid(m: Mesh, c: V3, axis: V3, normal: V3, half: V3): void {
    set(vy, axis).normalize();
    set(vz, normal);
    vz.addScaledVector(vy, -vz.dot(vy)).normalize();
    vx.crossVectors(vy, vz);
    m.quaternion.setFromRotationMatrix(m4.makeBasis(vx, vy, vz));
    set(m.position, c);
    m.scale.set(half[0], half[1], half[2]);
  }
  const at = (a: V3, d: V3, k: number): V3 => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

  function pose(p: DemoPose): void {
    const { up, front, right } = bodyAxes(p);
    const T = SIZES.torso;
    const spine = Math.hypot(p.neck[0] - p.hip[0], p.neck[1] - p.hip[1], p.neck[2] - p.hip[2]);
    ellipsoid(torso, at(p.hip, up, spine * T.centreT), up, front, [T.rx, T.halfLen, T.rz]);
    const P = SIZES.pelvis;
    ellipsoid(pelvis, at(p.hip, up, P.len / 2), up, front, [P.rx, P.len * 0.9, P.rz]);
    rod(girdle, p.l.s, p.r.s, 0.055);
    rod(neck, at(p.neck, up, SIZES.neck.from), at(p.neck, up, SIZES.neck.to), SIZES.neck.r);
    const headC = at(p.neck, up, SIZES.head.at);
    ellipsoid(head, headC, up, front, SIZES.head.size);
    ball(nose, at(headC, front, SIZES.head.size[2] * 0.92), 0.026);

    [p.r, p.l].forEach((sd, i) => {
      const L = limbs[i];
      if (!L) return;
      const hipJ = at(p.hip, right, p.hipW * (i === 0 ? 1 : -1));
      ball(L.shoulder, sd.s, SIZES.shoulder);
      rod(L.upper, sd.s, sd.e, SIZES.upperArm);
      ball(L.elbow, sd.e, SIZES.upperArm * 0.95);
      rod(L.fore, sd.e, sd.w, SIZES.forearm);
      ball(L.wrist, sd.w, SIZES.forearm * 0.9);
      ball(L.hand, sd.h, SIZES.hand);
      ball(L.hip, hipJ, SIZES.thigh);
      rod(L.thigh, hipJ, sd.k, SIZES.thigh);
      ball(L.knee, sd.k, SIZES.shin * 1.05);
      rod(L.shin, sd.k, sd.a, SIZES.shin);
      ball(L.ankle, sd.a, SIZES.foot * 1.05);
      rod(L.foot, sd.a, sd.toe, SIZES.foot);
      ball(L.toe, sd.toe, SIZES.foot);
    });

    bells.forEach((b, i) => {
      const spec = p.bells[i];
      b.visible = !!spec;
      if (!spec) return;
      // A single two-handed bell (triceps extension) is drawn bigger so it reads at 2 m.
      b.scale.setScalar(p.bells.length === 1 ? 1.6 : 1);
      set(b.position, spec.pos);
      set(vd, spec.axis).normalize();
      b.quaternion.setFromUnitVectors(UP, vd);
    });

    rodMeshes.forEach((m, i) => {
      const x = p.rods?.[i];
      m.visible = !!x;
      if (x) rod(m, x.a, x.b, x.r);
    });
    blockMeshes.forEach((m, i) => {
      const x = p.blocks?.[i];
      m.visible = !!x;
      if (!x) return;
      m.position.set(...x.at);
      m.scale.set(...x.size);
      m.rotation.z = x.rotZ ?? 0;
    });

    const patches = patchesFor(segmentFrames(p, twist), highlights);
    patchMeshes.forEach((m, i) => {
      const x = patches[i];
      m.visible = !!x;
      if (x) ellipsoid(m, x.centre, x.axis, x.normal, x.half);
    });
  }

  // --- camera ---------------------------------------------------------------------------------
  const bounds = demoBounds(move);
  const centre: V3 = [(bounds.min[0] + bounds.max[0]) / 2, 0, (bounds.min[2] + bounds.max[2]) / 2];
  const floorR = Math.max(
    0.5,
    Math.hypot(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2]) / 2,
  );
  floor.position.set(centre[0], 0.001, centre[2]);
  floor.scale.setScalar(floorR * 0.75);

  // Muscles facing the floor (push-up chest) need a camera near floor level to be seen.
  const primary = startPatches.filter((x) => x.level === 'primary');
  const downY = primary.length ? primary.reduce((a, x) => a + x.normal[1], 0) / primary.length : 0;
  const pitch = downY < -0.5 ? -0.02 : PITCH;

  function frame(aspect: number): void {
    const { look, distance } = fitCamera(bounds, FOV, aspect);
    fig.position.set(-look[0], -look[1], -look[2]);
    camera.aspect = aspect;
    camera.position.set(0, Math.sin(pitch) * distance, Math.cos(pitch) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  frame(1);
  pose(poseAt(move, 0));

  let disposed = false;
  return {
    canvas,
    setSize(w, h) {
      if (disposed || !w || !h) return;
      renderer.setSize(w, h, false);
      frame(w / h);
    },
    setYaw(yaw) {
      pivot.rotation.y = yaw;
    },
    setTime(t) {
      if (!disposed) pose(poseAt(move, t));
    },
    render() {
      if (!disposed) renderer.render(scene, camera);
    },
    info() {
      return {
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene.clear();
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      renderer.renderLists.dispose();
      renderer.dispose();
      // Free the context now instead of waiting for GC: each open makes a new one, and phones
      // only allow a handful (PROGRESS Decisions, M4b).
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
