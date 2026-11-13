// Layout of the original 3D body: plain numbers, no Three.js import (so it is unit-testable).
// Units are roughly metres, y up, +z = the body's front. Shapes are defined for the right side
// (x > 0) and mirrored; centred shapes have x = 0.
import type { Muscle } from '../bodyMap';

export type Vec3 = readonly [number, number, number];

export type BodySegment =
  | { kind: 'capsule'; a: Vec3; b: Vec3; r: number }
  | { kind: 'ellipsoid'; at: Vec3; size: Vec3 }
  | { kind: 'box'; at: Vec3; size: Vec3 };

/** A muscle is drawn as one or more ellipsoids: centre + radii. */
export type MusclePart = { muscle: Muscle; at: Vec3; scale: Vec3 };

const SHOULDER: Vec3 = [0.23, 1.42, 0];
const ELBOW: Vec3 = [0.27, 1.14, 0];
const WRIST: Vec3 = [0.29, 0.89, 0];
const HIP: Vec3 = [0.1, 0.9, 0];
const KNEE: Vec3 = [0.11, 0.5, 0.01];
const ANKLE: Vec3 = [0.11, 0.1, 0];

const along = (a: Vec3, b: Vec3, t: number, off: Vec3 = [0, 0, 0]): Vec3 => [
  a[0] + (b[0] - a[0]) * t + off[0],
  a[1] + (b[1] - a[1]) * t + off[1],
  a[2] + (b[2] - a[2]) * t + off[2],
];

const flipX = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];

function mirrorSegment(s: BodySegment): BodySegment {
  return s.kind === 'capsule' ? { ...s, a: flipX(s.a), b: flipX(s.b) } : { ...s, at: flipX(s.at) };
}

const SIDE_SEGMENTS: BodySegment[] = [
  { kind: 'capsule', a: SHOULDER, b: ELBOW, r: 0.048 },
  { kind: 'capsule', a: ELBOW, b: WRIST, r: 0.04 },
  { kind: 'ellipsoid', at: [0.295, 0.83, 0], size: [0.035, 0.055, 0.025] },
  { kind: 'capsule', a: HIP, b: KNEE, r: 0.078 },
  { kind: 'capsule', a: KNEE, b: ANKLE, r: 0.055 },
  { kind: 'box', at: [0.11, 0.03, 0.045], size: [0.085, 0.05, 0.22] },
];

export const BODY_SEGMENTS: readonly BodySegment[] = [
  { kind: 'ellipsoid', at: [0, 1.63, 0], size: [0.095, 0.115, 0.105] }, // head
  { kind: 'capsule', a: [0, 1.46, 0], b: [0, 1.55, 0], r: 0.05 }, // neck
  { kind: 'capsule', a: [-0.2, 1.41, 0], b: [0.2, 1.41, 0], r: 0.06 }, // shoulder girdle
  { kind: 'ellipsoid', at: [0, 1.22, 0], size: [0.19, 0.28, 0.115] }, // torso
  { kind: 'ellipsoid', at: [0, 0.93, 0], size: [0.17, 0.11, 0.105] }, // pelvis
  ...SIDE_SEGMENTS,
  ...SIDE_SEGMENTS.map(mirrorSegment),
];

/** Right-side (or centred, x = 0) muscle shapes. */
const RIGHT: MusclePart[] = [
  { muscle: 'neck', at: [0.03, 1.5, 0.03], scale: [0.025, 0.05, 0.025] },
  { muscle: 'traps', at: [0.08, 1.46, -0.04], scale: [0.1, 0.05, 0.05] },
  { muscle: 'traps', at: [0, 1.36, -0.085], scale: [0.05, 0.1, 0.03] },
  { muscle: 'shoulders', at: [0.225, 1.41, 0], scale: [0.07, 0.075, 0.07] },
  { muscle: 'chest', at: [0.085, 1.335, 0.085], scale: [0.092, 0.068, 0.05] },
  { muscle: 'biceps', at: along(SHOULDER, ELBOW, 0.5, [0, 0, 0.032]), scale: [0.046, 0.1, 0.044] },
  {
    muscle: 'triceps',
    at: along(SHOULDER, ELBOW, 0.5, [0, 0, -0.032]),
    scale: [0.048, 0.105, 0.046],
  },
  { muscle: 'forearms', at: along(ELBOW, WRIST, 0.35), scale: [0.047, 0.095, 0.047] },
  { muscle: 'abdominals', at: [0, 1.13, 0.1], scale: [0.078, 0.13, 0.035] },
  { muscle: 'abdominals', at: [0.135, 1.12, 0.06], scale: [0.04, 0.1, 0.04] },
  { muscle: 'lats', at: [0.13, 1.2, -0.075], scale: [0.085, 0.16, 0.055] },
  { muscle: 'middle back', at: [0.055, 1.3, -0.095], scale: [0.05, 0.075, 0.03] },
  { muscle: 'lower back', at: [0.04, 1.05, -0.095], scale: [0.04, 0.085, 0.03] },
  { muscle: 'glutes', at: [0.085, 0.89, -0.075], scale: [0.09, 0.09, 0.065] },
  { muscle: 'abductors', at: [0.165, 0.94, 0], scale: [0.04, 0.07, 0.06] },
  { muscle: 'adductors', at: along(HIP, KNEE, 0.3, [-0.045, 0, 0.01]), scale: [0.035, 0.1, 0.045] },
  { muscle: 'quadriceps', at: along(HIP, KNEE, 0.45, [0, 0, 0.045]), scale: [0.076, 0.17, 0.062] },
  { muscle: 'hamstrings', at: along(HIP, KNEE, 0.45, [0, 0, -0.045]), scale: [0.07, 0.16, 0.058] },
  { muscle: 'calves', at: along(KNEE, ANKLE, 0.28, [0, 0, -0.035]), scale: [0.056, 0.11, 0.05] },
];

export const MUSCLE_PARTS: readonly MusclePart[] = [
  ...RIGHT,
  ...RIGHT.filter((p) => p.at[0] !== 0).map((p) => ({ ...p, at: flipX(p.at) })),
];

/** Slight turn so the body never looks flat. */
const THREE_QUARTER = 0.35;

/**
 * Y-rotation (radians) for the body so the primary muscles face the camera (+z).
 * Symmetric pairs cancel sideways, so this mostly picks front vs back.
 */
export function facingAngle(primary: readonly string[]): number {
  let sx = 0;
  let sz = 0;
  for (const p of MUSCLE_PARTS) {
    if (!primary.includes(p.muscle)) continue;
    const len = Math.hypot(p.at[0], p.at[2]);
    if (len < 1e-9) continue;
    sx += p.at[0] / len;
    sz += p.at[2] / len;
  }
  const theta = Math.hypot(sx, sz) < 1e-6 ? 0 : Math.atan2(sx, sz);
  return -theta + THREE_QUARTER;
}
