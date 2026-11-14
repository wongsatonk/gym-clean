// Pure layout math for the demo player (no three.js import, unit-tested): where each mannequin
// segment sits and which way its "front" and "outer" sides point for a DemoPose, where the muscle
// highlight patches go, how far the camera must be to fit the figure, and the phase label text.
//
// Frames are in the figure frame of poses.ts: forward = +x, up = +y, the figure's right = +z.
import type { Face, Highlight, Segment } from './highlight';
import { cycleSeconds, poseAt, type DemoMove, type DemoPose, type Phase, type V3 } from './moves';

// --- vector helpers ---------------------------------------------------------------------------
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const addS = (a: V3, b: V3, k: number): V3 => add(a, scale(b, k));
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
};
const lerp = (a: V3, b: V3, t: number): V3 => addS(a, sub(b, a), t);

/** Rotate v about unit axis k by angle (rad), Rodrigues. */
function rotate(v: V3, k: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

// --- segment frames ---------------------------------------------------------------------------

/** One drawn segment: a -> b, with unit `front`/`outer` directions perpendicular to a -> b. */
export type SegFrame = {
  segment: Segment;
  /** +1 right, -1 left, 0 centred (torso, pelvis, neck, head). */
  side: 1 | -1 | 0;
  a: V3;
  b: V3;
  /** Unit, along a -> b. */
  axis: V3;
  /** Unit: the side that faces forward in the anatomical standing pose. */
  front: V3;
  /** Unit: away from the midline (for centred segments: the figure's right). */
  outer: V3;
  /** Half-width (outer direction) and half-depth (front direction) of the drawn shape, metres. */
  rx: number;
  rz: number;
  /** Ellipsoid segments get thinner toward their ends; cylinders keep their radius. */
  shape: 'cylinder' | 'ellipsoid';
};

/** Body axes of a pose: spine up, forward (face direction flattened onto the chest plane), right. */
export function bodyAxes(p: DemoPose): { up: V3; front: V3; right: V3 } {
  const up = norm(sub(p.neck, p.hip));
  let front = norm(addS(p.face, up, -dot(p.face, up)));
  if (len(front) < 0.5) front = norm(cross(up, [0, 0, 1]));
  return { up, front, right: norm(cross(front, up)) };
}

/**
 * Limb front/outer: take the anatomical standing frame (limb hanging along -up, front = body
 * front, outer = sideways) and turn it by the shortest rotation onto the limb's actual direction.
 * Exactly overhead (antiparallel), the turn is taken about the body front axis (a sideways raise),
 * which is also the limit of the shortest rotation in the seated press.
 */
export function limbFrame(
  axis: V3,
  body: { up: V3; front: V3; right: V3 },
  sg: 1 | -1,
): { front: V3; outer: V3 } {
  const rest = scale(body.up, -1);
  const restOuter = scale(body.right, sg);
  const c = Math.max(-1, Math.min(1, dot(rest, axis)));
  const k = cross(rest, axis);
  if (len(k) < 1e-6) {
    if (c > 0) return { front: body.front, outer: restOuter };
    return { front: body.front, outer: rotate(restOuter, body.front, Math.PI) };
  }
  const kn = norm(k);
  const angle = Math.acos(c);
  return { front: rotate(body.front, kn, angle), outer: rotate(restOuter, kn, angle) };
}

/** Drawn sizes (metres). Patches are placed from these, the player draws from them too. */
export const SIZES = {
  /** Ellipsoid centred at centreT along hip -> neck, half-length in metres. */
  torso: { centreT: 0.52, halfLen: 0.29, rx: 0.17, rz: 0.11 },
  pelvis: { len: 0.12, rx: 0.16, rz: 0.105 },
  neck: { from: 0.03, to: 0.15, r: 0.045 },
  head: { at: 0.25, size: [0.095, 0.115, 0.105] as V3 },
  shoulder: 0.058,
  upperArm: 0.046,
  forearm: 0.04,
  hand: 0.04,
  thigh: 0.075,
  shin: 0.056,
  foot: 0.042,
} as const;

const SIDES = [
  ['r', 1],
  ['l', -1],
] as const;

/** Upper-arm twist (rad) about its long axis per side, see armTwist(). */
export type ArmTwist = { r: number; l: number };
const NO_TWIST: ArmTwist = { r: 0, l: 0 };

/**
 * Every segment of the mannequin for a pose (limbs once per side). `twist` turns the upper arm's
 * (and shoulder cap's) front/outer about the arm axis; pass armTwist(move) so the biceps face the
 * way the elbow folds.
 */
export function segmentFrames(p: DemoPose, twist: ArmTwist = NO_TWIST): SegFrame[] {
  const body = bodyAxes(p);
  const centred = (
    segment: Segment,
    a: V3,
    b: V3,
    rx: number,
    rz: number,
    shape: SegFrame['shape'],
  ): SegFrame => ({
    segment,
    side: 0,
    a,
    b,
    axis: norm(sub(b, a)),
    front: body.front,
    outer: body.right,
    rx,
    rz,
    shape,
  });
  const t = SIZES.torso;
  const out: SegFrame[] = [
    centred('torso', p.hip, p.neck, t.rx, t.rz, 'ellipsoid'),
    centred(
      'pelvis',
      p.hip,
      addS(p.hip, body.up, SIZES.pelvis.len),
      SIZES.pelvis.rx,
      SIZES.pelvis.rz,
      'ellipsoid',
    ),
    centred(
      'neck',
      addS(p.neck, body.up, SIZES.neck.from),
      addS(p.neck, body.up, SIZES.neck.to),
      SIZES.neck.r,
      SIZES.neck.r,
      'cylinder',
    ),
    centred(
      'head',
      addS(p.neck, body.up, SIZES.head.at - SIZES.head.size[1]),
      addS(p.neck, body.up, SIZES.head.at + SIZES.head.size[1]),
      SIZES.head.size[0],
      SIZES.head.size[2],
      'ellipsoid',
    ),
  ];
  for (const [key, sg] of SIDES) {
    const sd = p[key];
    const hipJ: V3 = add(p.hip, scale(body.right, p.hipW * sg));
    const phi = twist[key];
    const limb = (segment: Segment, a: V3, b: V3, r: number, turn = 0): SegFrame => {
      const axis = norm(sub(b, a));
      const f = limbFrame(axis, body, sg);
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const front = add(scale(f.front, c), scale(f.outer, sn));
      const outer = add(scale(f.outer, c), scale(f.front, -sn));
      return { segment, side: sg, a, b, axis, front, outer, rx: r, rz: r, shape: 'cylinder' };
    };
    const upperAxis = norm(sub(sd.e, sd.s));
    out.push(
      limb(
        'shoulder',
        addS(sd.s, upperAxis, -0.03),
        addS(sd.s, upperAxis, 0.1),
        SIZES.shoulder,
        phi,
      ),
      limb('upperArm', sd.s, sd.e, SIZES.upperArm, phi),
      limb('forearm', sd.e, sd.w, SIZES.forearm),
      limb('hand', sd.w, sd.h, SIZES.hand),
      limb('thigh', hipJ, sd.k, SIZES.thigh),
      limb('shin', sd.k, sd.a, SIZES.shin),
      limb('foot', sd.a, sd.toe, SIZES.foot),
    );
  }
  return out;
}

/**
 * The arm's twist about its long axis for a demo, per side: the forearm folds toward the front
 * (biceps side) of the upper arm, so at the most bent end of the rep the fold direction says
 * where the front is. The upper arm hardly twists during a rep, so one angle per demo keeps the
 * patches steady (a per-frame fold would flip when the elbow straightens). Straight-arm demos
 * (lateral raise) get 0.
 */
export function armTwist(m: DemoMove): ArmTwist {
  const poses = [m.pose(m.start), m.pose(m.far)];
  const out = { r: 0, l: 0 };
  for (const [key] of SIDES) {
    let best: V3 = [0, 0, 0];
    let bestPose = poses[0];
    for (const p of poses) {
      const sd = p[key];
      const axis = norm(sub(sd.e, sd.s));
      const fore = norm(sub(sd.w, sd.e));
      const fold = addS(fore, axis, -dot(fore, axis));
      if (len(fold) > len(best)) {
        best = fold;
        bestPose = p;
      }
    }
    if (len(best) < 0.2 || !bestPose) continue;
    const f = segmentFrames(bestPose).find(
      (x) => x.segment === 'upperArm' && x.side === (key === 'r' ? 1 : -1),
    );
    if (f) out[key] = Math.atan2(dot(best, f.outer), dot(best, f.front));
  }
  return out;
}

/** Ellipsoid thickness factor at t along a segment drawn as an ellipsoid. */
function profile(f: SegFrame, t: number, segLen: number): number {
  if (f.shape === 'cylinder') return 1;
  if (f.segment !== 'torso') return 1 - 0.25 * Math.abs(2 * t - 1);
  const { centreT, halfLen } = SIZES.torso;
  const u = ((t - centreT) * segLen) / halfLen;
  return Math.sqrt(Math.max(0.3, 1 - u * u));
}

// --- highlight patches ------------------------------------------------------------------------

/** An ellipsoid patch: centre, unit along-axis, unit outward normal, half extents [across, along, out]. */
export type Patch = {
  muscle: string;
  level: Highlight['level'];
  centre: V3;
  axis: V3;
  normal: V3;
  half: V3;
};

function faceNormals(f: SegFrame, face: Face): V3[] {
  if (face === 'front') return [f.front];
  if (face === 'back') return [scale(f.front, -1)];
  if (f.side === 0) return face === 'outer' ? [f.outer, scale(f.outer, -1)] : [];
  return [face === 'outer' ? f.outer : scale(f.outer, -1)];
}

/** Patches for the highlights on a set of segment frames. Limb highlights light both sides. */
export function patchesFor(frames: readonly SegFrame[], highlights: readonly Highlight[]): Patch[] {
  const out: Patch[] = [];
  for (const h of highlights) {
    const [s0, s1] = h.span ?? [0, 1];
    for (const f of frames) {
      if (f.segment !== h.segment) continue;
      const segLen = len(sub(f.b, f.a));
      const tm = (s0 + s1) / 2;
      const mid = lerp(f.a, f.b, tm);
      const halfAlong = ((s1 - s0) * segLen) / 2;
      const k = profile(f, tm, segLen);
      const base = { muscle: h.muscle, level: h.level, axis: f.axis };
      if (!h.face) {
        out.push({
          ...base,
          centre: mid,
          normal: f.front,
          half: [f.rx * k * 1.12, halfAlong + 0.2 * Math.min(f.rx, f.rz), f.rz * k * 1.12],
        });
        continue;
      }
      const sideways = h.face === 'outer' || h.face === 'inner';
      const rn = (sideways ? f.rx : f.rz) * k;
      const rt = (sideways ? f.rz : f.rx) * k;
      for (const n of faceNormals(f, h.face)) {
        out.push({
          ...base,
          centre: addS(mid, n, rn * 0.65),
          normal: n,
          half: [rt * 0.8, Math.max(halfAlong, rn * 0.5), rn * 0.6],
        });
      }
    }
  }
  return out;
}

// --- camera fit -------------------------------------------------------------------------------

/** Box (min/max) around every joint of the loop plus the props, in the figure frame. */
export function demoBounds(m: DemoMove, samples = 12): { min: V3; max: V3 } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const grow = (p: V3, r = 0) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i] ?? Infinity, (p[i] ?? 0) - r);
      max[i] = Math.max(max[i] ?? -Infinity, (p[i] ?? 0) + r);
    }
  };
  const T = cycleSeconds(m);
  for (let i = 0; i < samples; i++) {
    const p = poseAt(m, (T * i) / samples);
    const up = bodyAxes(p).up;
    grow(p.hip, 0.17);
    grow(p.neck, 0.17);
    grow(addS(p.neck, up, SIZES.head.at), 0.12);
    for (const sd of [p.r, p.l])
      for (const j of [sd.s, sd.e, sd.w, sd.h, sd.k, sd.a, sd.toe]) grow(j, 0.06);
    for (const b of p.bells) grow(b.pos, 0.09);
    for (const r of p.rods ?? []) for (const j of [r.a, r.b]) grow(j, r.r);
    for (const b of p.blocks ?? []) grow(b.at, Math.max(...b.size) / 2);
  }
  for (const pr of m.props) {
    // Half-diagonal in the x/y plane covers any rotZ; z keeps its own half size.
    const r = Math.hypot(pr.size[0], pr.size[1]) / 2;
    const hz = pr.size[2] / 2;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) grow([pr.at[0] + sx * r, pr.at[1] + sx * r, pr.at[2] + sz * hz]);
    grow([pr.at[0], Math.max(0, pr.at[1] - r), pr.at[2]]);
  }
  grow([min[0] ?? 0, 0, min[2] ?? 0]); // the floor is always in view
  return { min: min as unknown as V3, max: max as unknown as V3 };
}

/**
 * Camera framing that fits the figure at any drag angle: the look point (box centre) and the
 * distance at which the box's vertical extent and its horizontal radius (round the vertical axis)
 * both fit a camera of vertical `fovDeg` and the given aspect, with a margin.
 */
export function fitCamera(
  box: { min: V3; max: V3 },
  fovDeg: number,
  aspect: number,
  margin = 1.08,
): { look: V3; distance: number } {
  const look = scale(add(box.min, box.max), 0.5);
  const halfH = (box.max[1] - box.min[1]) / 2;
  const halfW = Math.hypot(box.max[0] - box.min[0], box.max[2] - box.min[2]) / 2;
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 1e-3);
  // Near parts sit closer to the camera; add the horizontal radius so they still fit.
  const distance = Math.max(halfH / tanV, halfW / tanH) * margin + halfW * 0.5;
  return { look, distance };
}

// --- labels -----------------------------------------------------------------------------------

/**
 * Phase text for the sheet. Matches tempoLabel(): a push-up (starts with the lowering) says
 * "Down"/"Up", everything else "Lift"/"Lower". The hold at the far end and the pause at the start
 * both say "Hold".
 */
export function phaseLabel(m: DemoMove, phase: Phase): string {
  if (phase === 'hold' || phase === 'pause') return 'Hold';
  if (m.outward === 'lower') return phase === 'lower' ? 'Down' : 'Up';
  const w = m.words ?? { lift: 'Lift', lower: 'Lower' };
  return phase === 'lift' ? w.lift : w.lower;
}
