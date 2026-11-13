// Mannequin pose functions for the M4b exercise demos: plain numbers, no three.js import, so the
// demo data stays unit-testable and badge code (hasDemo) never pulls the 3D chunk.
//
// The pose functions are COPIED from tools/synthetic.ts (PROGRESS Decisions, M4b): that file keeps
// its own copy so the committed synthetic fixtures stay reproducible. Same figure, same numbers.
//
// Figure frame (as in tools/synthetic.ts): forward = +x, up = +y, the figure's right side = +z,
// metres, floor at y = 0. Each pose is a function of the exercise's tracked joint angle (degrees,
// the angle the rep counter measures).

export type V3 = readonly [number, number, number];

/** One body side: shoulder, elbow, wrist, hand, knee, ankle, toe. Hip joints come from `hip`/`hipW`. */
export type DemoSide = { s: V3; e: V3; w: V3; h: V3; k: V3; a: V3; toe: V3 };

export type DemoPose = {
  /** Pelvis centre. */
  hip: V3;
  /** Shoulder centre. */
  neck: V3;
  /** Unit vector the face points to. */
  face: V3;
  /** Lateral (z) offset of each hip joint. */
  hipW: number;
  r: DemoSide;
  l: DemoSide;
  /** Dumbbells: centre and handle axis (unit). */
  bells: { pos: V3; axis: V3 }[];
};

/**
 * A static box prop (bench, seat) in the figure frame: centre + full size, optionally tilted by
 * `rotZ` radians about the z axis (counter-clockwise: +x toward +y), e.g. an incline back pad.
 */
export type DemoProp = { at: V3; size: V3; rotZ?: number };

/** Bone lengths shared with tools/synthetic.ts. */
export const BONE = { upperArm: 0.3, forearm: 0.26, thigh: 0.42, shin: 0.41, spine: 0.5 } as const;
const U = BONE.upperArm;
const F = BONE.forearm;
const SPINE = BONE.spine;
export const DEFAULT_HIP_W = 0.09;

// --- tiny vector helpers (tuples, no allocation-heavy classes) ---------------------------------
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const v = (x: number, y: number, z = 0): V3 => [x, y, z];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/** a + b * k */
const addS = (a: V3, b: V3, k: number): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const dist = (a: V3, b: V3) => len(sub(a, b));
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Same point with a new z. */
const at = (p: V3, z: number): V3 => [p[0], p[1], z];
/** Unit vector in the sagittal (x, y) plane at `d` degrees from +x, counter-clockwise. */
const dir = (d: number): V3 => v(Math.cos(rad(d)), Math.sin(rad(d)));

/** Point at distance `ra` from a and `rb` from b in the sagittal plane, the solution `pick` prefers. */
function joint(a: V3, ra: number, b: V3, rb: number, pick: (p: V3) => number): V3 {
  const d = Math.min(dist(a, b), ra + rb - 1e-6);
  const ex = norm(sub(b, a));
  const ey = v(-ex[1], ex[0]);
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  const y = Math.sqrt(Math.max(0, ra * ra - x * x));
  const c1 = addS(addS(a, ex, x), ey, y);
  const c2 = addS(addS(a, ex, x), ey, -y);
  return pick(c1) >= pick(c2) ? c1 : c2;
}

const sides = (build: (sg: number) => DemoSide) => ({ r: build(1), l: build(-1) });
const standLegs = (sg: number, w = DEFAULT_HIP_W) => ({
  k: v(0.03, 0.5, w * sg),
  a: v(0, 0.09, w * sg),
  toe: v(0.2, 0.03, w * sg),
});
const bellAtHand = (axis: V3) => (sd: DemoSide) => ({
  pos: addS(sd.h, norm(sub(sd.h, sd.e)), 0.04),
  axis,
});

// --- pose functions (ported from tools/synthetic.ts) ------------------------------------------

/** Push-up, side view: elbow angle; the body is a rigid line pivoting on the feet. */
export function pushUpPose(theta: number): DemoPose {
  const ankle = v(-0.85, 0.1);
  const wrist = v(0.38, 0.05);
  const d = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(rad(theta)));
  // Find the body tilt so the arm spans d.
  let lo = 0;
  let hi = 45;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (dist(addS(ankle, dir(mid), 1.33), wrist) < d) lo = mid;
    else hi = mid;
  }
  const beta = (lo + hi) / 2;
  const u = dir(beta);
  const neck = addS(ankle, u, 1.33);
  const hip = addS(ankle, u, 0.83);
  const e2 = joint(neck, U, wrist, F, (p) => -p[0] + 0.3 * p[1]);
  const { r, l } = sides((sg) => ({
    s: at(neck, 0.2 * sg),
    e: at(e2, 0.23 * sg),
    w: at(wrist, 0.25 * sg),
    h: v(wrist[0] + 0.07, 0.03, 0.25 * sg),
    k: at(addS(ankle, u, 0.41), 0.1 * sg),
    a: at(ankle, 0.1 * sg),
    toe: v(ankle[0] + 0.05, 0.01, 0.1 * sg),
  }));
  return { hip, neck, face: dir(beta - 90), hipW: DEFAULT_HIP_W, r, l, bells: [] };
}

/** Seated dumbbell press, front view: elbow angle; forearms stay vertical over the elbows. */
export function seatedPressPose(theta: number): DemoPose {
  const hip = v(0, 0.56);
  const neck = v(0, 1.06);
  // Upper arm raised alpha above horizontal: cos(theta) = -sin(alpha).
  const alpha = Math.asin(-Math.cos(rad(theta)));
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = add(s, v(0, U * Math.sin(alpha), U * Math.cos(alpha) * sg));
    const w = add(e, v(0, F, 0));
    return {
      s,
      e,
      w,
      h: add(w, v(0, 0.04, 0)),
      k: v(0.42, 0.52, 0.13 * sg),
      a: v(0.45, 0.09, 0.15 * sg),
      toe: v(0.62, 0.03, 0.15 * sg),
    };
  });
  const bells = [r, l].map(bellAtHand(v(0, 0, 1)));
  return { hip, neck, face: v(1, 0), hipW: DEFAULT_HIP_W, r, l, bells };
}

/** Side lateral raise, front view: shoulder angle (hip–shoulder–elbow), straight arms. */
export function lateralRaisePose(theta: number): DemoPose {
  const hip = v(0, 0.92);
  const neck = v(0, 1.42);
  const hipW = 0.12;
  // Narrow shoulders over wide hips, so the arm can hang close to the hip line.
  const off = deg(Math.atan2(0.17 - hipW, SPINE));
  const a = rad(Math.max(0, theta - off));
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.17 * sg);
    const d = v(0, -Math.cos(a), Math.sin(a) * sg);
    const e = addS(s, d, U);
    const w = addS(e, d, F);
    return { s, e, w, h: addS(w, d, 0.04), ...standLegs(sg, hipW) };
  });
  return { hip, neck, face: v(1, 0), hipW, r, l, bells: [r, l].map(bellAtHand(v(1, 0, 0))) };
}

// --- original pose functions (M4b, not in tools/synthetic.ts) ----------------------------------

/** Bench layout shared by the flat and incline presses (figure frame, metres). */
export const BENCH = {
  /** Pelvis centre, sitting on the bench. */
  hip: v(0, 0.56),
  /** Top surface of the flat bench / seat. */
  top: 0.45,
  /** Incline of the back pad (deg from horizontal) for the incline press. */
  incline: 30,
} as const;

/** Lying/sitting legs: knees bent, feet flat on the floor beyond the bench end (toward -x). */
const benchLegs = (sg: number) => ({
  k: v(-0.38, 0.52, 0.15 * sg),
  a: v(-0.42, 0.09, 0.17 * sg),
  toe: v(-0.62, 0.03, 0.17 * sg),
});

/**
 * Dumbbell press lying on a bench whose back is tilted `incline` deg (0 = flat). The head is
 * toward +x. Forearms stay along the press axis P (perpendicular to the torso, tipped `inward`
 * toward the midline); the upper arm swings in the plane of P and a lateral direction tucked
 * `tuck` deg toward the hips. Elbow angle = theta exactly, as cos(theta) = -sin(alpha).
 */
function benchPress(theta: number, incline: number, inward: number, tuck = 30): DemoPose {
  const u = dir(incline); // spine, hip -> neck
  const n = dir(incline + 90); // chest normal, away from the bench
  const hip = BENCH.hip;
  const neck = addS(hip, u, SPINE);
  const alpha = Math.asin(-Math.cos(rad(theta)));
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const p = norm(add(n, v(0, 0, -inward * sg)));
    // Lateral direction (out to the side, tucked toward the hips), made orthogonal to P.
    const lat0 = add(scale(u, -Math.sin(rad(tuck))), v(0, 0, Math.cos(rad(tuck)) * sg));
    const lat = norm(addS(lat0, p, -dot(lat0, p)));
    const e = add(s, add(scale(p, U * Math.sin(alpha)), scale(lat, U * Math.cos(alpha))));
    const w = addS(e, p, F);
    return { s, e, w, h: addS(w, p, 0.04), ...benchLegs(sg) };
  });
  const bells = [r, l].map(bellAtHand(v(0, 0, 1)));
  return { hip, neck, face: n, hipW: DEFAULT_HIP_W, r, l, bells };
}

/** Flat dumbbell bench press, elbow angle: dumbbells beside the chest -> arms straight up. */
export function benchPressPose(theta: number): DemoPose {
  return benchPress(theta, 0, 0.03);
}

/** Low-incline dumbbell press, elbow angle: upper chest -> arms straight, slightly in. */
export function inclinePressPose(theta: number): DemoPose {
  return benchPress(theta, BENCH.incline, 0.12);
}

/** Flat bench: one box under the torso and head. */
export const FLAT_BENCH: readonly DemoProp[] = [
  { at: v(0.2, BENCH.top / 2), size: v(1.2, BENCH.top, 0.3) },
];

/** Incline bench: a seat box plus a back pad tilted BENCH.incline deg, behind the torso. */
export const INCLINE_BENCH: readonly DemoProp[] = (() => {
  const u = dir(BENCH.incline);
  const n = dir(BENCH.incline + 90);
  const pad = addS(addS(BENCH.hip, u, 0.4), n, -0.165);
  return [
    { at: v(-0.05, BENCH.top / 2), size: v(0.5, BENCH.top, 0.3) },
    { at: pad, size: v(0.9, 0.1, 0.3), rotZ: rad(BENCH.incline) },
  ];
})();

/**
 * Standing overhead triceps extension, elbow angle: one dumbbell held overhead with both hands.
 * The upper arms stay still (up, slightly forward and in); the forearms fold back behind the head.
 */
export function tricepsExtensionPose(theta: number): DemoPose {
  const hip = v(0, 0.92);
  const neck = v(0, 1.42);
  const bend = rad(180 - theta);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const up = norm(v(0.08, 0.97, -0.22 * sg)); // upper arm, shoulder -> elbow
    const back0 = v(-1, 0, 0);
    const back = norm(addS(back0, up, -dot(back0, up))); // behind the head, orthogonal to `up`
    const e = addS(s, up, U);
    const f = add(scale(up, Math.cos(bend)), scale(back, Math.sin(bend)));
    const w = addS(e, f, F);
    return { s, e, w, h: addS(w, f, 0.04), ...standLegs(sg) };
  });
  // One dumbbell, handle between the two hands.
  const pos = scale(add(r.h, l.h), 0.5);
  return {
    hip,
    neck,
    face: v(1, 0),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [{ pos, axis: v(0, 0, 1) }],
  };
}

// --- measuring a pose (tests, and later the ROM caption) --------------------------------------

export type MeasuredJoint = 'elbow' | 'shoulder' | 'knee';
export type SideKey = 'r' | 'l';

/** Hip joint of one side. */
export function hipJoint(p: DemoPose, side: SideKey): V3 {
  return at(p.hip, p.hipW * (side === 'r' ? 1 : -1));
}

/** Angle (deg) at b between a and c. */
export function angleAtJoint(a: V3, b: V3, c: V3): number {
  const u = norm(sub(a, b));
  const w = norm(sub(c, b));
  return deg(Math.acos(Math.max(-1, Math.min(1, dot(u, w)))));
}

/** The joint angle the rep counter would measure, from the pose's own joint positions. */
export function measuredAngle(p: DemoPose, joint: MeasuredJoint, side: SideKey): number {
  const sd = p[side];
  if (joint === 'elbow') return angleAtJoint(sd.s, sd.e, sd.w);
  if (joint === 'shoulder') return angleAtJoint(hipJoint(p, side), sd.s, sd.e);
  return angleAtJoint(hipJoint(p, side), sd.k, sd.a);
}

/** Every rigid segment's length, per side, for the constant-bone-length test. */
export function boneLengths(p: DemoPose): Record<string, number> {
  const out: Record<string, number> = { spine: dist(p.hip, p.neck) };
  for (const side of ['r', 'l'] as const) {
    const sd = p[side];
    const hj = hipJoint(p, side);
    out[`upperArm.${side}`] = dist(sd.s, sd.e);
    out[`forearm.${side}`] = dist(sd.e, sd.w);
    out[`hand.${side}`] = dist(sd.w, sd.h);
    out[`thigh.${side}`] = dist(hj, sd.k);
    out[`shin.${side}`] = dist(sd.k, sd.a);
    out[`foot.${side}`] = dist(sd.a, sd.toe);
  }
  return out;
}
