// Joint-angle math over LandmarkFrames (SPEC §3). Pure: no DOM, no MediaPipe.
import type { LandmarkFrame } from './types';

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

/** The joint angle for a triplet in this frame, or null if points are missing/degenerate. */
export function frameAngle(frame: LandmarkFrame, [ia, ib, ic]: Triplet): number | null {
  let angle: number;
  if (angleSource(frame) === 'world') {
    const w = frame.world ?? [];
    const a = w[ia];
    const b = w[ib];
    const c = w[ic];
    if (!a || !b || !c) return null;
    angle = jointAngle(a, b, c);
  } else {
    const a = frame.landmarks[ia];
    const b = frame.landmarks[ib];
    const c = frame.landmarks[ic];
    if (!a || !b || !c) return null;
    angle = jointAngle({ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y });
  }
  return Number.isFinite(angle) ? angle : null;
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
