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
  /**
   * Moving machine parts (lat pulldown bar and cables) as round rods a -> b of radius r. The count
   * stays the same through the loop (the player creates the meshes once).
   */
  rods?: Rod[];
  /** Moving machine boxes (the weight stack). Same count through the loop. */
  blocks?: DemoProp[];
  /**
   * The point the lift raises, when it isn't the hand: a pulldown's pull brings the bar (and the
   * hands) DOWN while the weight stack goes up. Tests use it to check lift = load up.
   */
  load?: V3;
};

/** A round rod (bar, cable) from a to b, radius r. */
export type Rod = { a: V3; b: V3; r: number };

/**
 * A static box prop (bench, seat) in the figure frame: centre + full size, optionally tilted by
 * `rotZ` radians about the z axis (counter-clockwise: +x toward +y), e.g. an incline back pad.
 */
export type DemoProp = { at: V3; size: V3; rotZ?: number };

/** Bone lengths shared with tools/synthetic.ts. */
export const BONE = { upperArm: 0.3, forearm: 0.26, thigh: 0.42, shin: 0.41, spine: 0.5 } as const;
const U = BONE.upperArm;
const F = BONE.forearm;
const THIGH = BONE.thigh;
const SHIN = BONE.shin;
const SPINE = BONE.spine;
/** One-arm row: torso tilt from vertical (deg), as in tools/synthetic.ts. */
export const ROW_HINGE = 70;
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
/** Direction angle (deg) of a vector in the sagittal plane. */
const ang2 = (d: V3) => deg(Math.atan2(d[1], d[0]));
/**
 * Hand point 4 cm past the wrist along the forearm. tools/synthetic.ts puts the hand AT the wrist
 * for the curl, row and goblet squat (it only draws a sphere there); the demo needs a non-zero hand
 * segment for its frames, like the other demos have. Every other joint keeps synthetic's numbers.
 */
const handPast = (e: V3, w: V3): V3 => addS(w, norm(sub(w, e)), 0.04);

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

/** Dumbbell biceps curl, side view: elbow angle; the upper arm hangs still, the forearm curls. */
export function curlPose(theta: number): DemoPose {
  const hip = v(0, 0.92);
  const neck = v(0, 1.42);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = addS(s, dir(-94), U);
    const w = addS(e, dir(ang2(sub(s, e)) - theta), F);
    return { s, e, w, h: handPast(e, w), ...standLegs(sg) };
  });
  return {
    hip,
    neck,
    face: v(1, 0),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [r, l].map(bellAtHand(v(0, 0, 1))),
  };
}

/**
 * One-arm dumbbell row, side view: the rowing (right, near) arm's elbow angle. The torso is hinged
 * ROW_HINGE deg forward, the left hand rests on a bench (ROW_BENCH); the dumbbell hangs, so the
 * forearm stays vertical while the upper arm swings back by 180 - theta.
 */
export function rowPose(theta: number): DemoPose {
  const hip = v(0, 0.88);
  const u = v(Math.sin(rad(ROW_HINGE)), Math.cos(rad(ROW_HINGE)));
  const neck = addS(hip, u, SPINE);
  const gamma = 180 - theta;
  const sR = at(neck, 0.2);
  const eR = addS(sR, dir(-90 - gamma), U);
  const wR = add(eR, v(0, -F, 0));
  const sL = at(neck, -0.2);
  const handL = v(0.66, 0.53, -0.2);
  const eL = joint(sL, U, handL, F, (p) => -p[0]);
  const r: DemoSide = {
    s: sR,
    e: eR,
    w: wR,
    h: handPast(eR, wR),
    k: v(0.05, 0.49, 0.1),
    a: v(-0.06, 0.09, 0.1),
    toe: v(0.14, 0.03, 0.1),
  };
  const l: DemoSide = {
    s: sL,
    e: at(eL, -0.2),
    w: handL,
    h: add(handL, v(0.06, -0.02, 0)),
    k: v(0.16, 0.49, -0.1),
    a: v(0.14, 0.09, -0.1),
    toe: v(0.34, 0.03, -0.1),
  };
  return {
    hip,
    neck,
    face: v(Math.cos(rad(ROW_HINGE)), -Math.sin(rad(ROW_HINGE))),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [r].map(bellAtHand(v(0, 0, 1))),
  };
}

/**
 * Bench for the one-arm row: the support hand rests on it (tools/synthetic.ts box, lengthened
 * forward into a bench so it reads as one; same top height and the same near edge under the hand).
 */
export const ROW_BENCH: readonly DemoProp[] = [{ at: v(0.9, 0.25, -0.25), size: v(0.8, 0.5, 0.4) }];

/**
 * Goblet squat, side view: knee angle (hip-knee-ankle). Feet stay flat; the shins tip forward
 * 0.4x and the torso leans 0.45x of the knee bend; one dumbbell is held upright at the chest.
 */
export function gobletSquatPose(theta: number): DemoPose {
  const f = 180 - theta;
  const tau = 0.4 * f;
  const ankle = v(0, 0.09);
  const knee = addS(ankle, v(Math.sin(rad(tau)), Math.cos(rad(tau))), SHIN);
  const kA = ang2(sub(ankle, knee));
  const c1 = addS(knee, dir(kA + theta), THIGH);
  const c2 = addS(knee, dir(kA - theta), THIGH);
  const hip = c1[0] <= c2[0] ? c1 : c2;
  const lam = 0.45 * f;
  const u = v(Math.sin(rad(lam)), Math.cos(rad(lam)));
  const n = v(Math.cos(rad(lam)), -Math.sin(rad(lam)));
  const neck = addS(hip, u, SPINE);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = at(addS(addS(neck, u, -0.27), n, 0.12), 0.15 * sg);
    const w = at(addS(addS(neck, u, -0.07), n, 0.26), 0.06 * sg);
    return {
      s,
      e,
      w,
      h: handPast(e, w),
      k: at(knee, 0.14 * sg),
      a: at(ankle, 0.15 * sg),
      toe: v(0.2, 0.03, 0.17 * sg),
    };
  });
  const bell = at(addS(addS(neck, u, -0.06), n, 0.31), 0);
  // Hip joints in line with the knees (synthetic leaves the default 0.09): the thigh then stays in
  // the knee's sagittal plane, so the measured knee angle equals theta (0.09 reads ~175 standing).
  return { hip, neck, face: n, hipW: 0.14, r, l, bells: [{ pos: bell, axis: u }] };
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

// --- M4d Pull A: hammer curl, reverse fly, wide-grip lat pulldown (original poses) -------------

/**
 * Hammer curl, side view, elbow angle: the curl's arm path with a neutral grip (palms facing each
 * other, thumbs up). The dumbbell handle stays in the arm's plane at right angles to the forearm,
 * so it points forward at the bottom and upright at the top, like a hammer.
 */
export function hammerCurlPose(theta: number): DemoPose {
  const p = curlPose(theta);
  const bells = [p.r, p.l].map((sd) => {
    const f = norm(sub(sd.h, sd.e));
    return { pos: addS(sd.h, f, 0.04), axis: norm(v(-f[1], f[0])) };
  });
  return { ...p, bells };
}

/**
 * Chest-supported reverse fly layout (howto: "Chest on an incline bench"): the torso lies face down
 * on a pad tilted `incline` deg from horizontal, feet on the floor behind. `bend` is the fixed soft
 * elbow (elbow angle = 180 - bend).
 */
export const REVERSE_FLY = { incline: 40, hip: v(0, 0.82), hipW: 0.1, bend: 20 } as const;

/** Upper-arm direction for a reverse-fly raise of `phi` deg: hanging (0) -> out to the side (90). */
const flyDir = (phi: number, sg: number): V3 => v(0, -Math.cos(rad(phi)), Math.sin(rad(phi)) * sg);

/**
 * Inverse of a monotonic sampled function: given samples (x[i], y[i]) with y strictly increasing
 * or decreasing, returns y -> x by binary search + linear interpolation, clamped to the ends.
 * Built once per demo at module load, so a frame costs a few comparisons instead of re-posing.
 */
function inverseTable(x0: number, x1: number, n: number, f: (x: number) => number) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    xs.push(x);
    ys.push(f(x));
  }
  const up = (ys[n] ?? 0) > (ys[0] ?? 0);
  return (y: number): number => {
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((ys[mid] ?? 0) < y === up) lo = mid;
      else hi = mid;
    }
    const ya = ys[lo] ?? 0;
    const yb = ys[hi] ?? 0;
    const u = Math.max(0, Math.min(1, yb === ya ? 0 : (y - ya) / (yb - ya)));
    return (xs[lo] ?? 0) + ((xs[hi] ?? 0) - (xs[lo] ?? 0)) * u;
  };
}

/** Raise angle (deg) for a reverse-fly shoulder angle; the angle grows with the raise. */
const flyRaiseFor = (() => {
  const { incline, hip, hipW } = REVERSE_FLY;
  const sR = at(addS(hip, dir(incline), SPINE), 0.2);
  const hjR = at(hip, hipW);
  return inverseTable(-15, 100, 460, (phi) => angleAtJoint(hjR, sR, addS(sR, flyDir(phi, 1), U)));
})();

/**
 * Reverse fly (rear delts), shoulder angle (hip-shoulder-elbow): both arms swing out to the sides
 * in the vertical plane across the body, soft elbows, until level with the back. The raise angle
 * for `theta` comes from a table built once (flyRaiseFor).
 */
export function reverseFlyPose(theta: number): DemoPose {
  const { incline, hip, hipW, bend } = REVERSE_FLY;
  const u = dir(incline); // spine, hip -> neck
  const chest = dir(incline - 90); // chest normal, toward the pad (down and forward)
  const neck = addS(hip, u, SPINE);
  const phi = flyRaiseFor(theta);
  const ankleX = -0.35;
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = addS(s, flyDir(phi, sg), U);
    // Soft elbow: the forearm trails the upper arm by `bend` deg in the same swing plane.
    const fd = flyDir(phi - bend, sg);
    const w = addS(e, fd, F);
    const a = v(ankleX, 0.09, hipW * sg);
    const k = joint(at(hip, hipW * sg), THIGH, a, SHIN, (p) => p[0]);
    return { s, e, w, h: addS(w, fd, 0.04), k, a, toe: v(ankleX + 0.2, 0.03, hipW * sg) };
  });
  // Neutral grip: handles point forward (along x), across the swing plane.
  const bells = [r, l].map(bellAtHand(v(1, 0, 0)));
  return { hip, neck, face: chest, hipW, r, l, bells };
}

/** Incline bench under the chest for the reverse fly: tilted pad, a post and a floor base. */
export const REVERSE_FLY_BENCH: readonly DemoProp[] = (() => {
  const { incline, hip } = REVERSE_FLY;
  const u = dir(incline);
  const chest = dir(incline - 90);
  const pad = addS(addS(hip, u, 0.17), chest, 0.155);
  const under = addS(pad, chest, 0.04);
  return [
    { at: pad, size: v(0.62, 0.08, 0.26), rotZ: rad(incline) },
    { at: v(under[0], under[1] / 2, 0), size: v(0.08, under[1], 0.08) },
    { at: v(under[0] + 0.05, 0.025, 0), size: v(0.6, 0.05, 0.3) },
  ];
})();

/**
 * Wide-grip lat pulldown machine layout (figure frame, metres). The bar hangs on a vertical cable
 * at x = barX, from the pulley at pulleyY; the weight stack sits behind the seat at stackX.
 */
export const PULLDOWN = {
  hip: v(0, 0.56),
  /** Torso lean back from vertical (deg): "chest up". */
  lean: 12,
  barX: 0,
  /** Hands on the bar, each side (shoulders are at 0.2: about twice shoulder width). */
  gripZ: 0.42,
  barHalf: 0.6,
  pulleyY: 1.95,
  stackX: -0.62,
  /** Bar height at the bottom: touching the upper chest. */
  barLow: 1.02,
  /** Elbow-to-hand distance, the bar sits in the fist 4 cm past the wrist. */
  reachSlack: 0.001,
} as const;

const HAND = 0.04;

/** Elbow at distance U from s and F + HAND from the grip g, on the side `pref` points to. */
function elbowToward(s: V3, g: V3, pref: V3): V3 {
  const L = F + HAND;
  const d = Math.min(dist(s, g), U + L - 1e-9);
  const ex = norm(sub(g, s));
  const x = (d * d + U * U - L * L) / (2 * d);
  const r = Math.sqrt(Math.max(0, U * U - x * x));
  const perp = norm(addS(pref, ex, -dot(pref, ex)));
  return addS(addS(s, ex, x), perp, r);
}

const pulldownTorso = () => {
  const u = v(-Math.sin(rad(PULLDOWN.lean)), Math.cos(rad(PULLDOWN.lean)));
  const neck = addS(PULLDOWN.hip, u, SPINE);
  return { u, neck };
};

/** Highest bar the hands reach with arms (all but) straight: the start of each rep. */
export const PULLDOWN_BAR_TOP: number = (() => {
  const { neck } = pulldownTorso();
  const s = at(neck, 0.2);
  const reach = U + F + HAND - PULLDOWN.reachSlack;
  const dx = PULLDOWN.barX - s[0];
  const dz = PULLDOWN.gripZ - s[2];
  return s[1] + Math.sqrt(reach * reach - dx * dx - dz * dz);
})();

/** Elbows drop down and a little out and forward, under the bar (wide grip). */
const PULLDOWN_ELBOW = (sg: number) => norm(v(0.1, -1, 0.55 * sg));

/** Pose at bar height b (the shoulder angle is measured from it). */
function pulldownAtBar(b: number): DemoPose {
  const { hip } = PULLDOWN;
  const { neck } = pulldownTorso();
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const g = v(PULLDOWN.barX, b, PULLDOWN.gripZ * sg);
    const e = elbowToward(s, g, PULLDOWN_ELBOW(sg));
    const f = norm(sub(g, e));
    return {
      s,
      e,
      w: addS(e, f, F),
      h: addS(e, f, F + HAND),
      k: v(0.42, 0.52, 0.13 * sg),
      a: v(0.45, 0.09, 0.15 * sg),
      toe: v(0.62, 0.03, 0.15 * sg),
    };
  });
  const rise = PULLDOWN_BAR_TOP - b;
  const stackTop = 0.32 + rise;
  const x = PULLDOWN.barX;
  const P = PULLDOWN.pulleyY;
  return {
    hip,
    neck,
    face: v(Math.cos(rad(PULLDOWN.lean)), Math.sin(rad(PULLDOWN.lean))),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [],
    rods: [
      { a: v(x, b, -PULLDOWN.barHalf), b: v(x, b, PULLDOWN.barHalf), r: 0.016 },
      { a: v(x, b, 0), b: v(x, P, 0), r: 0.006 },
      { a: v(PULLDOWN.stackX, stackTop, 0), b: v(PULLDOWN.stackX, P, 0), r: 0.006 },
    ],
    blocks: [{ at: v(PULLDOWN.stackX, stackTop - 0.15, 0), size: v(0.2, 0.3, 0.22) }],
    load: v(PULLDOWN.stackX, stackTop, 0),
  };
}

/** Bar height for a pulldown shoulder angle (table over the bar's travel, built once). */
const pulldownBarFor = inverseTable(PULLDOWN.barLow - 0.05, PULLDOWN_BAR_TOP, 300, (b) =>
  measuredAngle(pulldownAtBar(b), 'shoulder', 'r'),
);

/**
 * Wide-grip lat pulldown, front view, shoulder angle (hip-shoulder-elbow): seated, thighs under
 * the pad, the bar comes from arms straight overhead down to the upper chest, elbows down and out.
 * The bar height for `theta` comes from a table built once (the shoulder angle shrinks as the
 * bar drops).
 */
export function pulldownPose(theta: number): DemoPose {
  return pulldownAtBar(pulldownBarFor(theta));
}

/** Static pulldown machine: seat, thigh pad on a post, column and top beam over the bar. */
export const PULLDOWN_MACHINE: readonly DemoProp[] = (() => {
  const { stackX, pulleyY, barX } = PULLDOWN;
  const beamFrom = stackX - 0.06;
  const beamTo = barX + 0.06;
  return [
    { at: v(-0.02, 0.24, 0), size: v(0.46, 0.48, 0.42) }, // seat
    { at: v(0.32, 0.65, 0), size: v(0.1, 0.08, 0.46) }, // thigh pad
    { at: v(0.32, 0.305, 0), size: v(0.04, 0.61, 0.04) }, // thigh pad post
    { at: v(stackX - 0.15, (pulleyY + 0.09) / 2, 0), size: v(0.08, pulleyY + 0.09, 0.3) }, // column
    { at: v((beamFrom + beamTo) / 2, pulleyY + 0.05, 0), size: v(beamTo - beamFrom, 0.07, 0.08) },
  ];
})();

// --- M4d Legs A + Push B (original poses) -----------------------------------------------------

const FOOT = 0.2;
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));

/**
 * Stiff-legged dumbbell deadlift layout: knees fixed with a slight bend, the thighs tip back
 * `thighBack` x the torso hinge (the hips go back), and the dumbbells travel straight down at
 * `handX`, just in front of the legs ("lower the weights along your legs").
 */
export const SLDL = {
  knee: v(0.06, 0.5),
  ankle: v(0, 0.09),
  thighBack: 0.25,
  handX: 0.19,
  handZ: 0.15,
} as const;

/** Pose at torso hinge `lam` deg from vertical (the hip angle is measured from it). */
function sldlAt(lam: number): DemoPose {
  const delta = SLDL.thighBack * lam;
  const hip = addS(SLDL.knee, v(-Math.sin(rad(delta)), Math.cos(rad(delta))), THIGH);
  const u = v(Math.sin(rad(lam)), Math.cos(rad(lam)));
  const neck = addS(hip, u, SPINE);
  const reach = U + F + HAND;
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const dx = SLDL.handX - s[0];
    const dz = SLDL.handZ * sg - s[2];
    const d = norm(v(dx, -Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz)), dz));
    const e = addS(s, d, U);
    const w = addS(e, d, F);
    return {
      s,
      e,
      w,
      h: addS(w, d, HAND),
      k: at(SLDL.knee, DEFAULT_HIP_W * sg),
      a: at(SLDL.ankle, DEFAULT_HIP_W * sg),
      toe: v(0.2, 0.03, DEFAULT_HIP_W * sg),
    };
  });
  return {
    hip,
    neck,
    face: v(Math.cos(rad(lam)), -Math.sin(rad(lam))),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [r, l].map(bellAtHand(v(0, 0, 1))),
  };
}

const sldlHingeFor = inverseTable(0, 90, 360, (lam) => measuredAngle(sldlAt(lam), 'hip', 'r'));

/**
 * Stiff-legged dumbbell deadlift, side view, hip angle (shoulder-hip-knee): straight arms, flat
 * back, slight fixed knee bend; the hips go back as the torso hinges toward horizontal.
 */
export function stiffLegDeadliftPose(theta: number): DemoPose {
  return sldlAt(sldlHingeFor(theta));
}

/**
 * Dumbbell lunge layout: a split stance (right foot forward flat, left foot back on its ball),
 * hips straight down between the feet, torso upright. `w` = hip/foot width each side.
 */
export const LUNGE = {
  front: v(0.36, 0.09),
  back: v(-0.4, 0.13),
  backToe: v(-0.22, 0.05),
  w: 0.11,
  lean: 4,
} as const;

const LUNGE_TOP = LUNGE.front[1] + Math.sqrt((THIGH + SHIN - 0.004) ** 2 - LUNGE.front[0] ** 2);

function lungeAt(y: number): DemoPose {
  const hip = v(0, y);
  const u = v(Math.sin(rad(LUNGE.lean)), Math.cos(rad(LUNGE.lean)));
  const neck = addS(hip, u, SPINE);
  const leg = (ankle: V3, sg: number) => {
    const hj = at(hip, LUNGE.w * sg);
    const a = at(ankle, LUNGE.w * sg);
    // Knees bend forward on both legs.
    return {
      a,
      k: at(
        joint(hj, THIGH, a, SHIN, (p) => p[0]),
        LUNGE.w * sg,
      ),
    };
  };
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = add(s, v(0, -U));
    const w = add(e, v(0, -F));
    const lg =
      sg > 0
        ? { ...leg(LUNGE.front, 1), toe: v(LUNGE.front[0] + 0.2, 0.03, LUNGE.w) }
        : { ...leg(LUNGE.back, -1), toe: at(LUNGE.backToe, -LUNGE.w) };
    return { s, e, w, h: add(w, v(0, -HAND)), ...lg };
  });
  return {
    hip,
    neck,
    face: v(Math.cos(rad(LUNGE.lean)), -Math.sin(rad(LUNGE.lean))),
    hipW: LUNGE.w,
    r,
    l,
    bells: [r, l].map(bellAtHand(v(1, 0, 0))),
  };
}

const lungeHipFor = inverseTable(0.3, LUNGE_TOP, 400, (y) =>
  measuredAngle(lungeAt(y), 'knee', 'r'),
);

/**
 * Dumbbell lunge, side view, front (right) knee angle: from the split stance the hips go
 * straight down until both knees are bent, a dumbbell hanging in each hand.
 */
export function lungePose(theta: number): DemoPose {
  return lungeAt(lungeHipFor(theta));
}

/**
 * Lying leg curl machine layout: face down, hips on the pad, knees just past its end; the ankle
 * roller sits on the back of the ankles and turns about the knee axis; the stack is at the side.
 */
export const LEG_CURL = {
  hip: v(0, 0.64),
  padTop: 0.53,
  padEnd: -0.36,
  /** Roller offset from the ankle, out from the back of the shin. */
  roller: 0.09,
  stack: v(-0.15, 0, -0.55),
  /** Stack rise (m) over the whole curl (180 -> 60 deg). */
  stackRise: 0.24,
} as const;

/** Lying leg curl, side view, knee angle: thighs flat on the pad, heels curl toward the glutes. */
export function legCurlPose(theta: number): DemoPose {
  const { hip, roller, stack, stackRise } = LEG_CURL;
  const neck = add(hip, v(SPINE, 0));
  const knee = v(hip[0] - THIGH, hip[1]);
  const shin = dir(theta); // knee -> ankle; 180 = straight back
  const ankle = addS(knee, shin, SHIN);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    // Hands hold the handles under the front of the pad.
    const w = v(neck[0] + 0.24, 0.45, 0.2 * sg);
    const e = at(
      joint(s, U, w, F, (p) => -p[1]),
      0.2 * sg,
    );
    return {
      s,
      e,
      w,
      h: handPast(e, w),
      k: at(knee, DEFAULT_HIP_W * sg),
      a: at(ankle, DEFAULT_HIP_W * sg),
      toe: at(addS(ankle, dir(theta + 90), FOOT), DEFAULT_HIP_W * sg),
    };
  });
  const pad = addS(addS(ankle, dir(theta - 90), roller), shin, -0.04);
  const rise = (stackRise * (180 - theta)) / 120;
  const stackTop = 0.32 + rise;
  return {
    hip,
    neck,
    face: v(0, -1),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [],
    rods: [
      { a: at(pad, -0.25), b: at(pad, 0.25), r: 0.045 }, // ankle roller
      { a: at(knee, -0.3), b: at(pad, -0.3), r: 0.02 }, // lever arm
      { a: v(stack[0], stackTop, stack[2]), b: v(stack[0], 1.05, stack[2]), r: 0.006 }, // cable
    ],
    blocks: [{ at: v(stack[0], stackTop - 0.15, stack[2]), size: v(0.2, 0.3, 0.2) }],
    load: v(stack[0], stackTop, stack[2]),
  };
}

/** Leg curl bench: pad (hips to just above the knees), post, base, lever housing and stack column. */
export const LEG_CURL_MACHINE: readonly DemoProp[] = (() => {
  const { padTop, padEnd, stack, hip } = LEG_CURL;
  const front = 0.9;
  return [
    { at: v((padEnd + front) / 2, padTop - 0.05, 0), size: v(front - padEnd, 0.1, 0.32) },
    { at: v(0.25, (padTop - 0.1) / 2, 0), size: v(0.1, padTop - 0.1, 0.1) },
    { at: v(0.25, 0.025, 0), size: v(1.1, 0.05, 0.4) },
    { at: v(hip[0] - THIGH, hip[1], -0.3), size: v(0.1, 0.1, 0.04) },
    { at: v(stack[0] - 0.15, 0.55, stack[2]), size: v(0.06, 1.1, 0.06) },
  ];
})();

/**
 * Standing calf raise machine: the balls of the feet on the step edge (the pivot), knees and body
 * straight, shoulders under the pads; the whole body rises as the heels lift.
 */
export const CALF = { toe: v(0.14, 0.15), stepTop: 0.11, stepEdge: 0.12, columnX: -0.36 } as const;

/** Standing calf raise, side view, ankle angle (knee-ankle-toe): 90 = foot level. */
export function calfRaisePose(theta: number): DemoPose {
  const beta = theta - 90; // foot pitch, toes below the ankle
  const ankle = addS(CALF.toe, dir(-beta), -FOOT);
  const knee = add(ankle, v(0, SHIN));
  const hip = add(knee, v(0, THIGH));
  const neck = add(hip, v(0, SPINE));
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    // Hands hold the pad handles in front of the shoulders.
    const w = add(s, v(0.2, 0.03, 0));
    const e = at(
      joint(s, U, w, F, (p) => -p[1]),
      0.2 * sg,
    );
    return {
      s,
      e,
      w,
      h: handPast(e, w),
      k: at(knee, DEFAULT_HIP_W * sg),
      a: at(ankle, DEFAULT_HIP_W * sg),
      toe: at(CALF.toe, DEFAULT_HIP_W * sg),
    };
  });
  const padY = neck[1] + 0.085;
  const pads = [1, -1].map((sg) => ({ at: v(neck[0], padY, 0.17 * sg), size: v(0.2, 0.07, 0.14) }));
  return {
    hip,
    neck,
    face: v(1, 0),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [],
    rods: [
      // Pad arms back to the carriage on the column.
      ...[1, -1].map((sg) => ({
        a: v(neck[0] - 0.08, padY, 0.17 * sg),
        b: v(CALF.columnX, padY, 0.17 * sg),
        r: 0.02,
      })),
      // Handles from the front of each pad down to the hands.
      ...[r, l].map((sd, i) => ({
        a: v(neck[0] + 0.1, padY, 0.17 * (i === 0 ? 1 : -1)),
        b: sd.h,
        r: 0.016,
      })),
    ],
    blocks: [...pads, { at: v(CALF.columnX, padY, 0), size: v(0.12, 0.16, 0.46) }],
    load: v(neck[0], padY, 0),
  };
}

/** Calf raise machine: the step (feet on its front edge) and the column the pads ride on. */
export const CALF_MACHINE: readonly DemoProp[] = [
  { at: v(CALF.stepEdge + 0.18, CALF.stepTop / 2, 0), size: v(0.36, CALF.stepTop, 0.6) },
  { at: v(CALF.columnX - 0.1, 1.05, 0), size: v(0.08, 2.1, 0.5) },
];

/**
 * Dumbbell fly on the flat bench, shoulder opening angle (`armOpen`, other shoulder - shoulder -
 * elbow): 90 = upper arms straight up, 180 = out level with the shoulders. The arms swing in the
 * plane across the chest with a fixed soft elbow (forearms trail `bend` deg inward, a hug).
 */
export const FLY = { bend: 20 } as const;

export function flyPose(theta: number): DemoPose {
  const hip = BENCH.hip;
  const neck = addS(hip, v(1, 0), SPINE);
  const phi = deg(Math.asin(clamp1(-Math.cos(rad(theta)))));
  const arc = (a: number, sg: number): V3 => v(0, Math.cos(rad(a)), Math.sin(rad(a)) * sg);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = addS(s, arc(phi, sg), U);
    const fd = arc(phi - FLY.bend, sg);
    const w = addS(e, fd, F);
    return { s, e, w, h: addS(w, fd, HAND), ...benchLegs(sg) };
  });
  // Neutral grip: palms face each other, handles along the bench.
  return {
    hip,
    neck,
    face: v(0, 1),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [r, l].map(bellAtHand(v(1, 0, 0))),
  };
}

/** Upright bench for the dumbbell shoulder press: the seated press seat plus a back pad. */
export const SHOULDER_PRESS_BENCH: readonly DemoProp[] = [
  { at: v(-0.02, 0.24, 0), size: v(0.46, 0.48, 0.42) },
  { at: v(-0.16, 0.92, 0), size: v(0.08, 0.72, 0.34) },
  { at: v(-0.16, 0.28, 0), size: v(0.06, 0.56, 0.06) },
];

/**
 * Cable crossover layout: standing between two high pulleys, staggered stance, torso leaning
 * `lean` deg forward. The arms sweep in a plane that runs from out-and-slightly-up (toward the
 * pulleys) to down-and-forward, where the hands meet in front of the lower chest.
 */
export const CROSSOVER = {
  hip: v(0, 0.92),
  lean: 15,
  bend: 20,
  pulley: v(-0.1, 2.0, 0.88),
  towerX: -0.26,
} as const;

const CROSS_A = norm(v(1, -0.55, 0));
const crossB = (sg: number): V3 => {
  const b0 = v(0, 0.25, sg);
  return norm(addS(b0, CROSS_A, -dot(b0, CROSS_A)));
};
const crossDir = (phi: number, sg: number): V3 =>
  add(scale(CROSS_A, Math.cos(rad(phi))), scale(crossB(sg), Math.sin(rad(phi))));

function crossoverAt(phi: number): DemoPose {
  const { hip, lean, bend, pulley } = CROSSOVER;
  const u = v(Math.sin(rad(lean)), Math.cos(rad(lean)));
  const neck = addS(hip, u, SPINE);
  const legs: Record<'r' | 'l', Pick<DemoSide, 'k' | 'a' | 'toe'>> = {
    r: { k: v(0.13, 0.5, 0.11), a: v(0.12, 0.09, 0.11), toe: v(0.32, 0.03, 0.11) },
    l: { k: v(-0.08, 0.51, -0.09), a: v(-0.16, 0.09, -0.09), toe: v(0.04, 0.03, -0.09) },
  };
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = addS(s, crossDir(phi, sg), U);
    const fd = crossDir(phi - bend, sg);
    const w = addS(e, fd, F);
    return { s, e, w, h: addS(w, fd, HAND), ...legs[sg > 0 ? 'r' : 'l'] };
  });
  const travel = (sd: DemoSide, sg: number) => dist(sd.h, at(pulley, pulley[2] * sg));
  const rise = travel(r, 1) - CROSS_REST;
  const stackTop = 0.32 + rise;
  const rods: Rod[] = [];
  const blocks: DemoProp[] = [];
  for (const [sd, sg] of [
    [r, 1],
    [l, -1],
  ] as const) {
    const p = at(pulley, pulley[2] * sg);
    rods.push(
      { a: sd.h, b: p, r: 0.006 }, // cable
      { a: add(sd.h, v(0, -0.06, 0)), b: add(sd.h, v(0, 0.06, 0)), r: 0.016 }, // handle
      { a: v(p[0], stackTop, p[2]), b: p, r: 0.006 }, // cable down to the stack
    );
    blocks.push({ at: v(p[0], stackTop - 0.15, p[2]), size: v(0.2, 0.3, 0.2) });
  }
  return {
    hip,
    neck,
    face: v(Math.cos(rad(lean)), -Math.sin(rad(lean))),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [],
    rods,
    blocks,
    load: v(pulley[0], stackTop, pulley[2]),
  };
}

/** Hand-to-pulley distance at the open end (the stack rests there). */
const CROSS_OPEN_PHI = 80;
const CROSS_REST: number = (() => {
  const { hip, lean, pulley } = CROSSOVER;
  const neck = addS(hip, v(Math.sin(rad(lean)), Math.cos(rad(lean))), SPINE);
  const s = at(neck, 0.2);
  const e = addS(s, crossDir(CROSS_OPEN_PHI, 1), U);
  const fd = crossDir(CROSS_OPEN_PHI - CROSSOVER.bend, 1);
  return dist(addS(addS(e, fd, F), fd, HAND), pulley);
})();

/**
 * Cable crossover, front view, shoulder opening angle (`armOpen`): soft elbows, the hands sweep
 * from out at the sides down and in until they meet in front. Closed form: for the arm direction
 * cos(phi) A + sin(phi) B, the angle to the other shoulder is acos(-B.z sin(phi)).
 */
export function crossoverPose(theta: number): DemoPose {
  const bz = crossB(1)[2];
  return crossoverAt(deg(Math.asin(clamp1(-Math.cos(rad(theta)) / bz))));
}

/** Two pulley towers either side, pulleys at the top. */
export const CROSSOVER_MACHINE: readonly DemoProp[] = [1, -1].flatMap((sg) => {
  const { pulley, towerX } = CROSSOVER;
  return [
    { at: v(towerX, 1.05, pulley[2] * sg), size: v(0.08, 2.1, 0.08) },
    {
      at: v((towerX + pulley[0]) / 2, pulley[1] + 0.05, pulley[2] * sg),
      size: v(0.26, 0.06, 0.06),
    },
    { at: v(pulley[0], pulley[1], pulley[2] * sg), size: v(0.08, 0.08, 0.04) },
  ];
});

/**
 * Triceps pushdown layout: standing at a high pulley in front of the figure, straight bar,
 * upper arms pinned at the sides (slightly forward), torso `lean` deg forward.
 */
export const PUSHDOWN = {
  hip: v(0, 0.92),
  lean: 8,
  upperArm: -84,
  pulley: v(0.32, 2.05, 0),
  stackX: 0.64,
  barHalf: 0.3,
} as const;

function pushdownTorso() {
  const u = v(Math.sin(rad(PUSHDOWN.lean)), Math.cos(rad(PUSHDOWN.lean)));
  return { u, neck: addS(PUSHDOWN.hip, u, SPINE) };
}

/** Bar centre for an elbow angle (the hands are on the bar, the bar centred between them). */
function pushdownArms(theta: number) {
  const { neck } = pushdownTorso();
  return sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const e = addS(s, dir(PUSHDOWN.upperArm), U);
    const w = addS(e, dir(ang2(sub(s, e)) - theta), F);
    return { s, e, w, h: handPast(e, w), ...standLegs(sg) };
  });
}

const PUSHDOWN_REST: number = (() => {
  const { r } = pushdownArms(75);
  return dist(at(r.h, 0), PUSHDOWN.pulley);
})();

/** Triceps pushdown, side view, elbow angle: the forearms push the bar from chest height down. */
export function pushdownPose(theta: number): DemoPose {
  const { neck } = pushdownTorso();
  const { r, l } = pushdownArms(theta);
  const { pulley, stackX, barHalf, hip, lean } = PUSHDOWN;
  const bar = at(r.h, 0);
  const stackTop = 0.32 + dist(bar, pulley) - PUSHDOWN_REST;
  return {
    hip,
    neck,
    face: v(Math.cos(rad(lean)), -Math.sin(rad(lean))),
    hipW: DEFAULT_HIP_W,
    r,
    l,
    bells: [],
    rods: [
      { a: at(bar, -barHalf), b: at(bar, barHalf), r: 0.014 }, // bar
      { a: bar, b: pulley, r: 0.006 }, // cable to the pulley
      { a: v(stackX, stackTop, 0), b: v(stackX, pulley[1], 0), r: 0.006 }, // down to the stack
    ],
    blocks: [{ at: v(stackX, stackTop - 0.15, 0), size: v(0.2, 0.3, 0.22) }],
    load: v(stackX, stackTop, 0),
  };
}

/** Cable station in front of the figure: column, top arm out to the pulley, pulley block. */
export const PUSHDOWN_MACHINE: readonly DemoProp[] = (() => {
  const { pulley, stackX } = PUSHDOWN;
  const colX = stackX + 0.16;
  return [
    { at: v(colX, 1.08, 0), size: v(0.08, 2.16, 0.3) },
    {
      at: v((pulley[0] + colX) / 2, pulley[1] + 0.06, 0),
      size: v(colX - pulley[0] + 0.04, 0.06, 0.08),
    },
    { at: v(pulley[0], pulley[1], 0), size: v(0.08, 0.08, 0.04) },
  ];
})();

/**
 * Bench dips layout: wrists on the bench edge behind the figure, fingers forward over the edge,
 * torso leaning `lean` deg back, legs out in front with the heels on the floor. The shoulders
 * stay `dx` in front of the wrists and go straight down as the elbows bend back.
 */
export const DIPS = {
  wrist: v(-0.2, 0.47),
  benchTop: 0.45,
  edge: -0.17,
  dx: 0.04,
  lean: 12,
  ankle: v(0.55, 0.09),
  w: 0.1,
} as const;

/** Bench dips, side view, elbow angle: the body lowers in front of the bench, elbows back. */
export function benchDipPose(theta: number): DemoPose {
  const { wrist, dx, lean, ankle, w: hw } = DIPS;
  const d = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(rad(theta)));
  const neck = v(wrist[0] + dx, wrist[1] + Math.sqrt(Math.max(0, d * d - dx * dx)));
  const u = v(-Math.sin(rad(lean)), Math.cos(rad(lean)));
  const hip = addS(neck, u, -SPINE);
  const { r, l } = sides((sg) => {
    const s = at(neck, 0.2 * sg);
    const w = at(wrist, 0.2 * sg);
    const e = at(
      joint(s, U, w, F, (p) => -p[0]),
      0.2 * sg,
    );
    const hj = at(hip, hw * sg);
    const a = at(ankle, hw * sg);
    const k = at(
      joint(hj, THIGH, a, SHIN, (p) => p[1]),
      hw * sg,
    );
    return { s, e, w, h: add(w, v(HAND, 0, 0)), k, a, toe: addS(a, dir(80), FOOT) };
  });
  return {
    hip,
    neck,
    face: v(Math.cos(rad(lean)), Math.sin(rad(lean))),
    hipW: hw,
    r,
    l,
    bells: [],
    load: neck,
  };
}

/** The bench behind the figure: its front edge just in front of the wrists. */
export const DIP_BENCH: readonly DemoProp[] = [
  { at: v(DIPS.edge - 0.25, DIPS.benchTop / 2, 0), size: v(0.5, DIPS.benchTop, 0.56) },
];

// --- measuring a pose (tests, and later the ROM caption) --------------------------------------

/**
 * The joint angle a demo is driven by. `elbow`, `shoulder` (hip-shoulder-elbow) and `knee` are the
 * rep counter's angles; the M4d demos add `hip` (shoulder-hip-knee, a hinge), `ankle`
 * (knee-ankle-toe, 90 = foot level) and `armOpen` (other shoulder-shoulder-elbow: 90 = upper arm
 * straight ahead of the chest, 180 = out to the side; a fly's opening).
 */
export type MeasuredJoint = 'elbow' | 'shoulder' | 'knee' | 'hip' | 'ankle' | 'armOpen';
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
  if (joint === 'hip') return angleAtJoint(sd.s, hipJoint(p, side), sd.k);
  if (joint === 'ankle') return angleAtJoint(sd.k, sd.a, sd.toe);
  if (joint === 'armOpen') return angleAtJoint(p[side === 'r' ? 'l' : 'r'].s, sd.s, sd.e);
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
