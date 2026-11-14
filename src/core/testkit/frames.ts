// Test-only frame builders (not shipped: only *.test.ts files import this). They place an
// exercise rule's joint triplet so the joint angle is exactly the target, sample keyframed angle
// curves at 30 fps, and pose the hips for the push-up body line. Shared by repCounter.test and the
// autoSet acceptance replay.
import type { Side, Triplet } from '../angles';
import type { ExerciseRule } from '../exercises';
import { LANDMARK_COUNT } from '../poseTopology';
import type { LandmarkFrame } from '../types';

export const FPS = 30;
export const DT = 1000 / FPS;

export type SideSpec = {
  angle: number;
  visibility?: number | undefined;
  /**
   * Where the first triplet point sits relative to the joint: `above` (curl: shoulder above the
   * elbow, so 180° = arm hanging) or `below` (press/raise: shoulder/hip below the joint, so
   * 180° = pointing up for the press, 0° = arm down for the raise).
   */
  anchor?: 'above' | 'below' | undefined;
};

export type FrameSpec = {
  t: number;
  left?: SideSpec;
  right?: SideSpec;
  /** Omit world landmarks so the 2D fallback is used. */
  noWorld?: boolean | undefined;
};

export const SEG = 0.12;

export function place(
  pts: { x: number; y: number }[],
  vis: number[],
  triplet: Triplet,
  spec: SideSpec,
  cx: number,
) {
  const [ia, ib, ic] = triplet;
  const by = 0.45;
  const sign = spec.anchor === 'below' ? 1 : -1;
  const th = (spec.angle * Math.PI) / 180;
  // a = b + (0, -sign·SEG)… i.e. directly above (sign -1) or below (sign +1) the joint.
  // c - b is the (a - b) direction rotated by the target angle.
  pts[ib] = { x: cx, y: by };
  pts[ia] = { x: cx, y: by + sign * SEG };
  pts[ic] = { x: cx + Math.sin(th) * SEG, y: by + sign * Math.cos(th) * SEG };
  const v = spec.visibility ?? 0.95;
  vis[ia] = v;
  vis[ib] = v;
  vis[ic] = v;
}

export function makeFrame(rule: ExerciseRule, spec: FrameSpec): LandmarkFrame {
  const pts = Array.from({ length: LANDMARK_COUNT }, () => ({ x: 0.5, y: 0.5 }));
  const vis = Array.from({ length: LANDMARK_COUNT }, () => 0.9);
  // Place the left side first so a shared landmark (none today) would be overwritten predictably.
  if (spec.left) place(pts, vis, rule.triplets.left, spec.left, 0.65);
  if (spec.right) place(pts, vis, rule.triplets.right, spec.right, 0.35);
  const landmarks = pts.map((p, i) => ({ x: p.x, y: p.y, z: 0, visibility: vis[i] ?? 0 }));
  const frame: LandmarkFrame = { t: spec.t, landmarks };
  if (!spec.noWorld) frame.world = pts.map((p) => ({ x: p.x - 0.5, y: p.y - 0.5, z: 0 }));
  return frame;
}

/** Keyframes [ms, angle] → angle at time t by linear interpolation (held past the ends). */
export type Keys = readonly (readonly [number, number])[];
export function curveAt(keys: Keys, t: number): number {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (!first || !last) throw new Error('empty curve');
  if (t <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1];
    const k1 = keys[i];
    if (!k0 || !k1) continue;
    if (t <= k1[0]) return k0[1] + ((k1[1] - k0[1]) * (t - k0[0])) / (k1[0] - k0[0]);
  }
  return last[1];
}

/** Build a curve from segments: [durationMs, targetAngle], starting at `start`. */
export function curve(start: number, segs: readonly (readonly [number, number])[]): Keys {
  const keys: [number, number][] = [[0, start]];
  let t = 0;
  for (const [d, a] of segs) {
    t += d;
    keys.push([t, a]);
  }
  return keys;
}

export function duration(keys: Keys): number {
  return keys[keys.length - 1]?.[0] ?? 0;
}

/** The segments of a curve (durations between keyframes), to splice it into another curve. */
export function segsOf(keys: Keys): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < keys.length; i++) {
    const k0 = keys[i - 1];
    const k1 = keys[i];
    if (k0 && k1) out.push([k1[0] - k0[0], k1[1]]);
  }
  return out;
}

export type SampleOpts = {
  sides?: readonly Side[];
  anchor?: 'above' | 'below';
  /** Added to the angle per frame (frame index, t) → degrees. */
  noise?: (i: number, t: number) => number;
  /** Per-frame visibility override for both used sides. */
  visibility?: (t: number) => number;
  /** Fixed angle/visibility for a side that is not following the curve. */
  other?: Partial<Record<Side, SideSpec>>;
  noWorld?: boolean;
};

export function sample(rule: ExerciseRule, keys: Keys, opts: SampleOpts = {}): LandmarkFrame[] {
  const sides = opts.sides ?? ['left', 'right'];
  const frames: LandmarkFrame[] = [];
  const end = duration(keys);
  for (let i = 0; i * DT <= end + 1e-9; i++) {
    const t = i * DT;
    const angle = curveAt(keys, t) + (opts.noise?.(i, t) ?? 0);
    const spec: FrameSpec = { t: Math.round(t * 1000) / 1000, noWorld: opts.noWorld };
    for (const side of ['left', 'right'] as const) {
      const fixed = opts.other?.[side];
      if (fixed) spec[side] = { anchor: opts.anchor, ...fixed };
      else if (sides.includes(side))
        spec[side] = { angle, anchor: opts.anchor, visibility: opts.visibility?.(t) };
    }
    frames.push(makeFrame(rule, spec));
  }
  return frames;
}

/** Put hips and knees in the world so the shoulder–hip–knee angle is `deg` (180 = plank). */
export function withHip(f: LandmarkFrame, deg: number, kneeVisibility = 0.9): LandmarkFrame {
  const landmarks = f.landmarks.map((p, i) =>
    i === 25 || i === 26 ? { ...p, visibility: kneeVisibility } : p,
  );
  const world = f.world?.map((p) => ({ ...p }));
  if (!world) return f;
  const th = (deg * Math.PI) / 180;
  for (const [sh, hip, knee] of [
    [11, 23, 25],
    [12, 24, 26],
  ] as const) {
    const s0 = world[sh];
    if (!s0) continue;
    const h = { x: s0.x, y: s0.y + 0.3, z: s0.z };
    world[hip] = h;
    world[knee] = { x: h.x, y: h.y - Math.cos(th) * 0.4, z: h.z + Math.sin(th) * 0.4 };
  }
  return { ...f, landmarks, world };
}
