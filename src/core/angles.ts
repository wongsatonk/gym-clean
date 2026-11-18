// Joint-angle math over LandmarkFrames (SPEC §3). Pure: no DOM, no MediaPipe.
import { LANDMARK } from './poseTopology';
import type { LandmarkFrame } from './types';

const { LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP, LEFT_KNEE, RIGHT_KNEE } = LANDMARK;

export type Side = 'left' | 'right';
export type SidePair<T> = { left: T; right: T };
/** Landmark indices [a, b, c]; the angle is measured at b (the joint). */
export type Triplet = readonly [a: number, b: number, c: number];

type Vec = { x: number; y: number; z?: number };

const DEG = 180 / Math.PI;

/** Angle ABC at vertex b in degrees (0 = folded, 180 = straight). NaN if a segment has zero length. */
export function jointAngle(a: Vec, b: Vec, c: Vec): number {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const uz = (a.z ?? 0) - (b.z ?? 0);
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = (c.z ?? 0) - (b.z ?? 0);
  if (Math.hypot(ux, uy, uz) === 0 || Math.hypot(vx, vy, vz) === 0) return NaN;
  // atan2(|u×v|, u·v) stays precise near 0° and 180°, unlike acos.
  const cross = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  const dot = ux * vx + uy * vy + uz * vz;
  return Math.atan2(cross, dot) * DEG;
}

/**
 * Which coordinates angles are measured in. `world` (metric 3D, hip-centred) is used when the
 * frame has it, because normalized x/y are stretched by the video aspect ratio, which fixtures
 * don't store. `image` = normalized x/y only (normalized z is too noisy to use).
 */
export function angleSource(frame: LandmarkFrame): 'world' | 'image' {
  return frame.world && frame.world.length > 0 ? 'world' : 'image';
}

/**
 * The 2D joint angle in the image plane: normalized x/y with x scaled by the video aspect
 * (width / height), so the angle is measured in square pixels. Null if a point is missing, a
 * segment is degenerate, or the aspect is not a positive number.
 */
export function imageAngle(
  frame: LandmarkFrame,
  [ia, ib, ic]: Triplet,
  aspect: number,
): number | null {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return null;
  const a = frame.landmarks[ia];
  const b = frame.landmarks[ib];
  const c = frame.landmarks[ic];
  if (!a || !b || !c) return null;
  const angle = jointAngle(
    { x: a.x * aspect, y: a.y },
    { x: b.x * aspect, y: b.y },
    { x: c.x * aspect, y: c.y },
  );
  return Number.isFinite(angle) ? angle : null;
}

/**
 * Where to measure: by default `world` 3D when the frame has it (else 2D normalized x/y).
 * `space: 'image'` always measures in the image plane with x scaled by `aspect` (default 1):
 * for front-view movements in the camera's plane, where the world model's depth guess bends
 * the angle (M4 real-data Decision, seated press).
 */
export type AngleOptions = { space?: 'auto' | 'image'; aspect?: number };

/** The joint angle for a triplet in this frame, or null if points are missing/degenerate. */
export function frameAngle(
  frame: LandmarkFrame,
  triplet: Triplet,
  opts: AngleOptions = {},
): number | null {
  if (opts.space === 'image') return imageAngle(frame, triplet, opts.aspect ?? 1);
  const [ia, ib, ic] = triplet;
  if (angleSource(frame) === 'world') {
    const w = frame.world ?? [];
    const a = w[ia];
    const b = w[ib];
    const c = w[ic];
    if (!a || !b || !c) return null;
    const angle = jointAngle(a, b, c);
    return Number.isFinite(angle) ? angle : null;
  }
  return imageAngle(frame, triplet, 1);
}

export type Vec3 = { x: number; y: number; z: number };

/**
 * Unit vector from the hip midpoint to the shoulder midpoint in world coordinates (camera axes,
 * y down), or null without world landmarks or with coincident midpoints.
 */
export function torsoDirection(frame: LandmarkFrame): Vec3 | null {
  const w = frame.world;
  if (!w || w.length === 0) return null;
  const ls = w[LEFT_SHOULDER];
  const rs = w[RIGHT_SHOULDER];
  const lh = w[LEFT_HIP];
  const rh = w[RIGHT_HIP];
  if (!ls || !rs || !lh || !rh) return null;
  const x = (ls.x + rs.x - lh.x - rh.x) / 2;
  const y = (ls.y + rs.y - lh.y - rh.y) / 2;
  const z = (ls.z + rs.z - lh.z - rh.z) / 2;
  const n = Math.hypot(x, y, z);
  if (!(n > 0)) return null;
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * How far the shoulder line (left → right shoulder, world 3D) turns toward the camera, in
 * degrees: ~0 facing the camera (front view), ~90 side-on. Null without world landmarks.
 */
export function shoulderYawDeg(frame: LandmarkFrame): number | null {
  const w = frame.world;
  if (!w || w.length === 0) return null;
  const ls = w[LEFT_SHOULDER];
  const rs = w[RIGHT_SHOULDER];
  if (!ls || !rs) return null;
  const across = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const depth = Math.abs(ls.z - rs.z);
  if (!(across > 0) && !(depth > 0)) return null;
  return Math.atan2(depth, across) * DEG;
}

/**
 * Body line at the hips: shoulder–hip–knee angle in world 3D (180 = straight body, as in a
 * plank; ~40–120 sitting, kneeling up or standing up), averaged over the sides whose shoulder,
 * hip and knee all have image visibility ≥ minVisibility. MediaPipe returns every world point,
 * guessed when unseen, so a hidden side says nothing. A degenerate side (zero-length segment) is
 * skipped too. Null (unknown) when no side is usable or there are no world landmarks.
 */
export function hipAngleDeg(frame: LandmarkFrame, minVisibility: number): number | null {
  const w = frame.world;
  if (!w || w.length === 0) return null;
  const sides = [
    [LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE],
    [RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE],
  ] as const;
  let sum = 0;
  let n = 0;
  for (const triplet of sides) {
    if (!(tripletVisibility(frame, triplet) >= minVisibility)) continue;
    const [pa, pb, pc] = triplet.map((i) => w[i]);
    if (!pa || !pb || !pc) continue;
    const angle = jointAngle(pa, pb, pc);
    if (!Number.isFinite(angle)) continue;
    sum += angle;
    n++;
  }
  return n > 0 ? sum / n : null;
}

/** Angle between two unit vectors in degrees (0–180). */
export function angleBetweenDeg(u: Vec3, v: Vec3): number {
  const cross = Math.hypot(u.y * v.z - u.z * v.y, u.z * v.x - u.x * v.z, u.x * v.y - u.y * v.x);
  return Math.atan2(cross, u.x * v.x + u.y * v.y + u.z * v.z) * DEG;
}

/** Lowest visibility of the three points (0 if any is missing). Used for the visibility gate. */
export function tripletVisibility(frame: LandmarkFrame, triplet: Triplet): number {
  let min = 1;
  for (const i of triplet) {
    const p = frame.landmarks[i];
    if (!p) return 0;
    min = Math.min(min, p.visibility);
  }
  return min;
}

function tripletMeanVisibility(frame: LandmarkFrame, triplet: Triplet): number {
  let sum = 0;
  for (const i of triplet) sum += frame.landmarks[i]?.visibility ?? 0;
  return sum / triplet.length;
}

/** Mean visibility of the triplet's points over a window of frames (0 for no frames). */
export function meanVisibility(frames: readonly LandmarkFrame[], triplet: Triplet): number {
  if (frames.length === 0) return 0;
  let sum = 0;
  for (const f of frames) sum += tripletMeanVisibility(f, triplet);
  return sum / frames.length;
}

/** The side whose triplet is more visible on average over the window. Ties → right. */
export function pickSide(frames: readonly LandmarkFrame[], triplets: SidePair<Triplet>): Side {
  return meanVisibility(frames, triplets.left) > meanVisibility(frames, triplets.right)
    ? 'left'
    : 'right';
}
