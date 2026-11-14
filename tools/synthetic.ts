// Dev-only: renders an original articulated mannequin doing one of the six pose-tracked exercises
// (SPEC §2 M4 table, in its SPEC view) and records it to WebM, for exercising the landmark pipeline
// and the rep counter without filming anyone. Driven by scripts/synthetic.mjs.
//
// Each exercise is a pose function of the tracked joint angle (degrees, the same angle the rep
// counter measures). A clip is a keyframe schedule of that angle: full reps go >= 10 deg past both
// SPEC thresholds, partials turn around near mid-range, every phase lasts >= 400 ms.
//
// synthetic-03-<flaw> clips (M5 task 9) add one deliberate form mistake on reps 5-8 of an 8-rep set,
// as positive fixtures for the focus/form rules. The flaw is a per-rep weight `w` (0 = clean) that
// each exercise's pose function reads through `PoseExtra`.
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

/** Ground truth of a flaw clip, written to fixtures/synthetic/flaws.json by scripts/synthetic.mjs. */
export type FlawSpec = {
  /** Short id of the mistake, as in the file name (synthetic-03-<flaw>). */
  flaw: string;
  /** What the clip does, in the renderer's own (pre-detection) degrees and seconds. */
  description: string;
  /** 1-based rep numbers that carry the flaw. */
  flawReps: number[];
  /** Per rep, the rendered parameters (angle at the turnaround, lift and lowering seconds, weight). */
  reps: { turn: number; upSec: number; downSec: number; w: number }[];
};
export type ClipSpec = {
  folder: string;
  name: string;
  reps: number;
  partials: number;
  flaw?: FlawSpec;
};

declare global {
  interface Window {
    __clips: () => ClipSpec[];
    __render: (o: { folder: string; name: string }) => Promise<string>;
  }
}

// ---------------------------------------------------------------------------------------------
// Pose model. Figure frame: forward = +x, up = +y, the figure's right side = +z.
// ---------------------------------------------------------------------------------------------

type Side = {
  s: Vector3;
  e: Vector3;
  w: Vector3;
  h: Vector3;
  k: Vector3;
  a: Vector3;
  toe: Vector3;
};
type Pose = {
  hip: Vector3; // pelvis centre
  neck: Vector3; // shoulder centre
  face: Vector3; // unit vector the face points to
  hipW?: number; // lateral offset of each hip joint (default 0.09)
  r: Side;
  l: Side;
  bells: { pos: Vector3; axis: Vector3 }[];
};
/**
 * Flaw inputs for one frame. `flaw` is the clip's flaw id (a pose only applies its own), `w` the
 * flaw weight of the rep in progress (0 = clean, stepwise per rep), `ws` the same weight eased
 * between reps (for flaws that persist between reps), `turn` the rep's turnaround angle.
 */
type PoseExtra = { flaw: string | null; w: number; ws: number; turn: number };
const CLEAN_X: PoseExtra = { flaw: null, w: 0, ws: 0, turn: 0 };

const U = 0.3; // upper arm
const F = 0.26; // forearm
const THIGH = 0.42;
const SHIN = 0.41;
const SPINE = 0.5;
const HINGE = 70; // row: torso tilt from vertical
// MediaPipe's world landmarks read these flaws at roughly half their rendered size, so they are
// rendered larger than what the focus rules should measure.
const CURL_LEAN = 28; // curl elbow swing: torso leans back this far at the top of the lift
const CURL_DRIFT = 45; // ... and the upper arm swings this far forward of the torso line
const PUSHUP_SAG = 50; // push-up hip sag: shoulder-hip-ankle bends to 180 - this (rendered)
const RAISE_LAG = 15; // lateral raise: the left arm trails the right by this mid-rep ...
const RAISE_LEFT_SCALE = 0.65; // ... on top of covering only this share of the right arm's range
const rad = (d: number) => (d * Math.PI) / 180;
const v = (x: number, y: number, z = 0) => new Vector3(x, y, z);
/** Unit vector in the sagittal (x, y) plane at `deg` from +x, counter-clockwise. */
const dir = (deg: number) => v(Math.cos(rad(deg)), Math.sin(rad(deg)));
const at = (p: Vector3, z: number) => v(p.x, p.y, z);
const ang2 = (d: Vector3) => (Math.atan2(d.y, d.x) * 180) / Math.PI;

/** Point at distance `ra` from a and `rb` from b in the sagittal plane, the solution `pick` prefers. */
function joint(
  a: Vector3,
  ra: number,
  b: Vector3,
  rb: number,
  pick: (p: Vector3) => number,
): Vector3 {
  const d = Math.min(a.distanceTo(b), ra + rb - 1e-6);
  const ex = b.clone().sub(a).normalize();
  const ey = v(-ex.y, ex.x);
  const x = (d * d + ra * ra - rb * rb) / (2 * d);
  const y = Math.sqrt(Math.max(0, ra * ra - x * x));
  const c1 = a.clone().addScaledVector(ex, x).addScaledVector(ey, y);
  const c2 = a.clone().addScaledVector(ex, x).addScaledVector(ey, -y);
  return pick(c1) >= pick(c2) ? c1 : c2;
}

function sides(build: (z: number) => Side): { r: Side; l: Side } {
  return { r: build(1), l: build(-1) };
}
const standLegs = (sgn: number, w = 0.09) => ({
  k: v(0.03, 0.5, w * sgn),
  a: v(0, 0.09, w * sgn),
  toe: v(0.2, 0.03, w * sgn),
});

type Exercise = {
  view: 'side' | 'front';
  size: [number, number];
  cam: { pos: [number, number, number]; look: [number, number, number]; fov: number };
  start: number; // angle at rest (start position)
  full: number; // turnaround angle of a full rep
  partial: number; // turnaround angle of a partial rep (mid-range)
  pose: (theta: number, x: PoseExtra) => Pose;
  props?: (scene: Group) => void;
};

const box = (g: Group, c: [number, number, number], s: [number, number, number]) => {
  const m = new Mesh(new BoxGeometry(...s), new MeshStandardMaterial({ color: 0x5a4a3c }));
  m.position.set(...c);
  g.add(m);
};

const EX: Record<string, Exercise> = {
  // Elbow angle, side view. Thresholds > 150 / < 55.
  curl: {
    view: 'side',
    size: [720, 960],
    cam: { pos: [0.35, 1.0, 4.2], look: [0.1, 0.95, 0], fov: 32 },
    start: 180,
    full: 22,
    partial: 90,
    pose: (theta, x) => {
      // Flaw (elbow swing): with the lift's progress, the torso leans back up to CURL_LEAN and the
      // upper arm swings forward of the torso line by up to CURL_DRIFT. The elbow angle stays theta.
      const prog = Math.min(1, Math.max(0, (180 - theta) / (180 - 22)));
      // Both start 35% of the way up (so the pose the rule measures from, just as the lift
      // begins, is clean). The lean is full from 80% of the way up. The drift is full from 60%
      // to 85% of the way up; by the top the upper arm is back to half the lean forward of
      // vertical in the world (behind the leaning torso line), so the elbow angle MediaPipe reads at the top stays deep enough
      // to count (an upper arm pointing forward reads shallower).
      const k = x.flaw === 'elbow-swing' ? x.w : 0;
      const ramp = (a: number, b: number) => Math.min(1, Math.max(0, (prog - a) / (b - a)));
      const lean = CURL_LEAN * k * ramp(0.35, 0.8);
      const drift =
        k * (CURL_DRIFT * (ramp(0.35, 0.6) - ramp(0.85, 1)) - 0.5 * lean * ramp(0.85, 1));
      const hip = v(0, 0.92);
      const neck = hip.clone().addScaledVector(v(-Math.sin(rad(lean)), Math.cos(rad(lean))), SPINE);
      const { r, l } = sides((sg) => {
        const s = at(neck, 0.2 * sg);
        const e = s.clone().addScaledVector(dir(-94 + lean + drift), U);
        const w = e.clone().addScaledVector(dir(ang2(s.clone().sub(e)) - theta), F);
        return { s, e, w, h: w.clone(), ...standLegs(sg) };
      });
      return { hip, neck, face: dir(lean), r, l, bells: [r, l].map(bellAtHand(v(0, 0, 1))) };
    },
  },
  // Elbow angle, side view, horizontal body. Thresholds > 155 / < 95.
  'push-up': {
    view: 'side',
    size: [960, 720],
    cam: { pos: [-0.15, 0.55, 3.3], look: [-0.15, 0.38, 0], fov: 32 },
    start: 180,
    full: 40,
    partial: 115,
    pose: (theta, x) => {
      const ankle = v(-0.85, 0.1);
      const wrist = v(0.38, 0.05);
      const d = Math.sqrt(U * U + F * F - 2 * U * F * Math.cos(rad(theta)));
      // Body is a rigid line pivoting on the feet; find its tilt so the arm spans d.
      let lo = 0;
      let hi = 45;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const s = ankle.clone().addScaledVector(dir(mid), 1.33);
        if (s.distanceTo(wrist) < d) lo = mid;
        else hi = mid;
      }
      const beta = (lo + hi) / 2;
      const u = dir(beta);
      const neck = ankle.clone().addScaledVector(u, 1.33);
      // Flaw (hip sag): feet, shoulders and arms stay exactly where the clean rep has them (so the
      // elbow reads the same); only the hip drops below the ankle-shoulder line, by `drop`, so the
      // shoulder-hip-ankle angle is 180 - sag. Near the bottom the drop is capped to keep the hip
      // >= 0.05 off the floor (the pelvis touches it), so the sag shrinks to ~30 deg there.
      // The sag is zero near the top (a sagging plank with nearly straight arms makes MediaPipe
      // swap the left/right labels or drop the near arm's visibility, which the counter can't
      // follow): it ramps in between elbow angles ~131 and ~103 deg and stays until the arms
      // pass those angles again on the way up.
      const prog = Math.min(1, Math.max(0, (180 - theta) / (180 - 40)));
      const sag =
        x.flaw === 'hip-sag'
          ? PUSHUP_SAG * x.ws * Math.min(1, Math.max(0, (prog - 0.35) / 0.2))
          : 0;
      const bend = (h: number) => (Math.atan2(h, 0.83) + Math.atan2(h, 0.5)) * (180 / Math.PI);
      let dLo = 0;
      let dHi = 0.5;
      for (let i = 0; i < 40; i++) {
        const mid = (dLo + dHi) / 2;
        if (bend(mid) < sag) dLo = mid;
        else dHi = mid;
      }
      const down = dir(beta - 90);
      const line = ankle.clone().addScaledVector(u, 0.83);
      const drop = Math.max(0, Math.min(dLo, (line.y - 0.05) / -down.y));
      const hip = line.addScaledVector(down, drop);
      const knee = ankle.clone().lerp(hip, 0.41 / 0.83);
      const e2 = joint(neck, U, wrist, F, (p) => -p.x + 0.3 * p.y);
      const { r, l } = sides((sg) => ({
        s: at(neck, 0.2 * sg),
        e: at(e2, 0.23 * sg),
        w: at(wrist, 0.25 * sg),
        h: v(wrist.x + 0.07, 0.03, 0.25 * sg),
        k: at(knee, 0.1 * sg),
        a: at(ankle, 0.1 * sg),
        toe: v(ankle.x + 0.05, 0.01, 0.1 * sg),
      }));
      return { hip, neck, face: dir(beta - 90), r, l, bells: [] };
    },
  },
  // Elbow angle, front view, seated; wrists stay above the shoulders. Thresholds > 155 / < 95.
  'shoulder-press': {
    view: 'front',
    size: [720, 960],
    cam: { pos: [0, 0.9, 3.8], look: [0, 0.85, 0], fov: 32 },
    start: 35,
    full: 180,
    partial: 100,
    pose: (theta) => {
      const hip = v(0, 0.56);
      const neck = v(0, 1.06);
      // Forearm vertical, upper arm raised alpha above horizontal: cos(theta) = -sin(alpha).
      const alpha = Math.asin(-Math.cos(rad(theta)));
      const { r, l } = sides((sg) => {
        const s = at(neck, 0.2 * sg);
        const e = s.clone().add(v(0, U * Math.sin(alpha), U * Math.cos(alpha) * sg));
        const w = e.clone().add(v(0, F, 0));
        return {
          s,
          e,
          w,
          h: w.clone().add(v(0, 0.04, 0)),
          k: v(0.42, 0.52, 0.13 * sg),
          a: v(0.45, 0.09, 0.15 * sg),
          toe: v(0.62, 0.03, 0.15 * sg),
        };
      });
      return { hip, neck, face: v(1, 0), r, l, bells: [r, l].map(bellAtHand(v(0, 0, 1))) };
    },
    props: (g) => box(g, [-0.02, 0.24, 0], [0.46, 0.48, 0.42]),
  },
  // Rowing (near, right) arm elbow angle, side view, torso hinged ~70 deg. Thresholds > 150 / < 90.
  row: {
    view: 'side',
    size: [720, 960],
    cam: { pos: [0.3, 0.8, 3.7], look: [0.3, 0.72, 0], fov: 32 },
    start: 180,
    full: 45,
    partial: 72, // world landmarks read ~40 deg shallower here; this measures ~120
    pose: (theta) => {
      const hip = v(0, 0.88);
      const u = v(Math.sin(rad(HINGE)), Math.cos(rad(HINGE)));
      const neck = hip.clone().addScaledVector(u, SPINE);
      // The dumbbell hangs: forearm stays vertical, the upper arm swings back by 180 - theta.
      const gamma = 180 - theta;
      const sR = at(neck, 0.2);
      const eR = sR.clone().addScaledVector(dir(-90 - gamma), U);
      const wR = eR.clone().add(v(0, -F, 0));
      const sL = at(neck, -0.2);
      const handL = v(0.66, 0.53, -0.2);
      const eL = joint(sL, U, handL, F, (p) => -p.x);
      const r: Side = {
        s: sR,
        e: eR,
        w: wR,
        h: wR.clone(),
        k: v(0.05, 0.49, 0.1),
        a: v(-0.06, 0.09, 0.1),
        toe: v(0.14, 0.03, 0.1),
      };
      const l: Side = {
        s: sL,
        e: at(eL, -0.2),
        w: handL,
        h: handL.clone().add(v(0.06, -0.02, 0)),
        k: v(0.16, 0.49, -0.1),
        a: v(0.14, 0.09, -0.1),
        toe: v(0.34, 0.03, -0.1),
      };
      return {
        hip,
        neck,
        face: v(Math.cos(rad(HINGE)), -Math.sin(rad(HINGE))),
        r,
        l,
        bells: [r].map(bellAtHand(v(0, 0, 1))),
      };
    },
    props: (g) => box(g, [0.75, 0.25, -0.25], [0.5, 0.5, 0.4]),
  },
  // Knee angle (hip-knee-ankle), side view. Thresholds > 160 / < 100.
  'goblet-squat': {
    view: 'side',
    size: [720, 960],
    cam: { pos: [0.0, 0.85, 4.0], look: [0.0, 0.8, 0], fov: 32 },
    start: 180,
    full: 75,
    partial: 130,
    pose: (theta) => {
      const f = 180 - theta;
      const tau = 0.4 * f;
      const ankle = v(0, 0.09);
      const knee = ankle.clone().addScaledVector(v(Math.sin(rad(tau)), Math.cos(rad(tau))), SHIN);
      const kA = ang2(ankle.clone().sub(knee));
      const c1 = knee.clone().addScaledVector(dir(kA + theta), THIGH);
      const c2 = knee.clone().addScaledVector(dir(kA - theta), THIGH);
      const hip = c1.x <= c2.x ? c1 : c2;
      const lam = 0.45 * f;
      const u = v(Math.sin(rad(lam)), Math.cos(rad(lam)));
      const n = v(Math.cos(rad(lam)), -Math.sin(rad(lam)));
      const neck = hip.clone().addScaledVector(u, SPINE);
      const { r, l } = sides((sg) => {
        const s = at(neck, 0.2 * sg);
        const e = at(neck.clone().addScaledVector(u, -0.27).addScaledVector(n, 0.12), 0.15 * sg);
        const w = at(neck.clone().addScaledVector(u, -0.07).addScaledVector(n, 0.26), 0.06 * sg);
        return {
          s,
          e,
          w,
          h: w.clone(),
          k: at(knee, 0.14 * sg),
          a: at(ankle, 0.15 * sg),
          toe: v(0.2, 0.03, 0.17 * sg),
        };
      });
      const bell = at(neck.clone().addScaledVector(u, -0.06).addScaledVector(n, 0.31), 0);
      return { hip, neck, face: n, r, l, bells: [{ pos: bell, axis: u }] };
    },
  },
  // Shoulder angle (hip-shoulder-elbow), front view. Thresholds < 25 / > 75.
  'lateral-raise': {
    view: 'front',
    size: [720, 960],
    cam: { pos: [0, 1.0, 4.3], look: [0, 0.95, 0], fov: 32 },
    start: 8,
    full: 100,
    partial: 50,
    pose: (theta, x) => {
      const hip = v(0, 0.92);
      const neck = v(0, 1.42);
      // Narrow shoulders over wide hips, so the arm can hang close to the hip line.
      const off = (Math.atan2(0.17 - 0.12, SPINE) * 180) / Math.PI;
      const { r, l } = sides((sg) => {
        // Flaw (arms out of sync): the left arm (sg = -1) covers only RAISE_LEFT_SCALE of the
        // right arm's range (stops ~35 deg lower at the top) and trails it by RAISE_LAG more over
        // the middle of the movement.
        const p = Math.min(1, Math.max(0, (theta - 8) / (x.turn - 8 || 1)));
        const own =
          x.flaw === 'arms-out-of-sync' && sg < 0 && x.w > 0
            ? 8 +
              (theta - 8) * RAISE_LEFT_SCALE -
              RAISE_LAG * Math.min(1, 3 * Math.sin(Math.PI * p))
            : theta;
        const a = rad(Math.max(0, own - off));
        const s = at(neck, 0.17 * sg);
        const d = v(0, -Math.cos(a), Math.sin(a) * sg);
        const e = s.clone().addScaledVector(d, U);
        const w = e.clone().addScaledVector(d, F);
        return { s, e, w, h: w.clone().addScaledVector(d, 0.04), ...standLegs(sg, 0.12) };
      });
      return {
        hip,
        neck,
        face: v(1, 0),
        hipW: 0.12,
        r,
        l,
        bells: [r, l].map(bellAtHand(v(1, 0, 0))),
      };
    },
  },
};

function bellAtHand(axis: Vector3) {
  return (sd: Side) => {
    const d = sd.h.clone().sub(sd.e).normalize();
    return { pos: sd.h.clone().addScaledVector(d, 0.04), axis };
  };
}

// ---------------------------------------------------------------------------------------------
// Clip schedules
// ---------------------------------------------------------------------------------------------

type Move = 'full' | 'fast' | 'partial';
/** One rep of a schedule: turnaround angle, lift/lowering seconds, flaw weight. */
type Rep = { kind: 'full' | 'partial'; turn: number; up: number; down: number; w: number };
type Plan = { name: string; moves: (Move | Rep)[]; flaw?: Omit<FlawSpec, 'reps' | 'flawReps'> };
const CLEAN: Plan = { name: 'synthetic-01', moves: ['full', 'full', 'full', 'full'] };
const MESSY: Plan = { name: 'synthetic-02', moves: ['full', 'partial', 'fast', 'partial', 'fast'] };

/** 8 full reps; reps 5-8 (1-based) take `bad`, reps 1-4 `good`. */
const eight = (good: Partial<Rep>, bad: Partial<Rep>): Partial<Rep>[] =>
  Array.from({ length: 8 }, (_, i) => (i < 4 ? good : { w: 1, ...bad }));
const full = (o: Partial<Rep>): Rep => ({
  kind: 'full',
  turn: NaN,
  up: 1.0,
  down: 1.2,
  w: 0,
  ...o,
});

// M5 task 9: one deliberate mistake per clip, on reps 5-8 of 8 full reps, in the SPEC view.
const FLAWS: Record<string, Plan[]> = {
  'lateral-raise': [
    {
      name: 'synthetic-03-arms-out-of-sync',
      // Reps 1-4: both arms to 90. Reps 5-8: the right arm to 110, the left only to ~74 and
      // trailing mid-rep, so the arms are > 30 deg apart (rendered) from mid-lift through the top
      // hold to mid-lowering. The two-arm mean still clears the 75 deg threshold. Slow reps
      // (lift 1.6 s, lower 1.8 s).
      moves: [90, 90, 90, 90, 110, 110, 110, 110].map((turn, i) =>
        full({ turn, up: 1.6, down: 1.8, w: i < 4 ? 0 : 1 }),
      ),
      flaw: {
        flaw: 'arms-out-of-sync',
        description: `reps 5-8: right arm to 110 deg, left arm covers ${RAISE_LEFT_SCALE} of its range (to ~74 deg) and trails a further ${RAISE_LAG} deg mid-rep; reps 1-4 both arms to 90; lift 1.6 s, lower 1.8 s`,
      },
    },
    {
      name: 'synthetic-03-raise-too-high',
      // Reps 1-4 stop at 90, reps 5-8 go to 148 (rendered; MediaPipe reads high raises
      // lower: rendered 116 / 138 / 165 read ~108 / ~121 / ~150). Arms in sync. Reps 5-8 lift in 1.4 s and
      // lower in 1.7 s so the bigger range doesn't also read as a rushed lowering.
      moves: [90, 90, 90, 90, 148, 148, 148, 148].map((turn, i) =>
        full(i < 4 ? { turn } : { turn, up: 1.4, down: 1.7, w: 1 }),
      ),
      flaw: {
        flaw: 'raise-too-high',
        description:
          'both arms raise to 90 deg on reps 1-4 and to 148 deg on reps 5-8 (lift 1.4 s, lower 1.7 s)',
      },
    },
  ],
  curl: [
    {
      name: 'synthetic-03-elbow-swing',
      // Reps 5-8 lift in 1.6 s so the drift holds well past 0.2 s, and curl to 16 deg (the
      // swung pose reads shallower at the top).
      moves: eight({ turn: 22 }, { up: 1.6, turn: 16 }).map(full),
      flaw: {
        flaw: 'elbow-swing',
        description: `reps 5-8 (lift 1.6 s, curl to 16 deg): from 35% of the way up, the upper arm swings ${CURL_DRIFT} deg forward of the torso (held from 60% to 85% of the lift; back near vertical at the top) and the torso leans back ${CURL_LEAN} deg (full from 80%); rendered degrees`,
      },
    },
    {
      name: 'synthetic-03-rushed-lowering',
      moves: eight({ down: 2.0 }, { down: 0.6 }).map((o) => full({ turn: 22, ...o })),
      flaw: {
        flaw: 'rushed-lowering',
        description:
          'lowering takes 2.0 s on reps 1-4 and 0.6 s on reps 5-8 (lift 1.0 s throughout)',
      },
    },
  ],
  'push-up': [
    {
      name: 'synthetic-03-hip-sag',
      moves: eight({}, {}).map((o) => full({ turn: 40, ...o })),
      flaw: {
        flaw: 'hip-sag',
        description: `reps 5-8: hips drop below the ankle-shoulder line by up to ${PUSHUP_SAG} deg (shoulder-hip-ankle ${180 - PUSHUP_SAG} deg rendered), zero near the top, ramping in between elbow angles 131 and 103 deg, ~30 deg at the bottom where the hips touch the floor; arms and shoulders move exactly as in a clean rep`,
      },
    },
  ],
  'goblet-squat': [
    {
      name: 'synthetic-03-short-range',
      // Rendered depth 45 deg on reps 1-4 and 83 on reps 5-8. MediaPipe reads deep knee angles
      // shallower (rendered 45 / 80 measured ~72 / ~94), so this keeps reps 5-8 under the 100 deg
      // threshold while their measured range is under 80% of reps 1-4.
      moves: eight({ turn: 45 }, { turn: 83 }).map(full),
      flaw: {
        flaw: 'short-range',
        description:
          'knee bends to 45 deg on reps 1-4 and only to 83 deg on reps 5-8 (rendered range 135 vs 97 deg)',
      },
    },
  ],
};

// curl/synthetic-01 predates this renderer (3 full + 1 partial) and is kept byte-identical because
// the e2e fake camera plays it; scripts/synthetic.mjs never re-renders an existing copy.
const plansFor = (folder: string): Plan[] => [
  ...(folder === 'curl'
    ? [{ name: 'synthetic-01', moves: ['full', 'full', 'full', 'partial'] } as Plan, MESSY]
    : [CLEAN, MESSY]),
  ...(FLAWS[folder] ?? []),
];
const HOLD_START = 1.0;
const TAIL = 0.8;

function toRep(ex: Exercise, m: Move | Rep): Rep {
  if (typeof m !== 'string') return Number.isNaN(m.turn) ? { ...m, turn: ex.full } : m;
  return {
    kind: m === 'partial' ? 'partial' : 'full',
    turn: m === 'partial' ? ex.partial : ex.full,
    up: m === 'partial' ? 0.7 : 1.0,
    down: m === 'fast' ? 0.45 : m === 'partial' ? 0.8 : 1.2,
    w: 0,
  };
}

/** `w` is the flaw weight of the segment that ends at this key. */
type Key = { t: number; angle: number; w: number; turn: number };
function keyframes(ex: Exercise, reps: Rep[]): Key[] {
  const keys: Key[] = [{ t: 0, angle: ex.start, w: 0, turn: ex.full }];
  let t = HOLD_START;
  keys.push({ t, angle: ex.start, w: 0, turn: ex.full });
  for (const { turn, up, down, w } of reps) {
    keys.push({ t: (t += up), angle: turn, w, turn });
    keys.push({ t: (t += 0.4), angle: turn, w, turn });
    keys.push({ t: (t += down), angle: ex.start, w, turn });
    keys.push({ t: (t += 0.5), angle: ex.start, w, turn });
  }
  keys.push({ t: t + TAIL, angle: ex.start, w: 0, turn: ex.full });
  return keys;
}
const ease = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
/** Eased value of `get` at time t, plus the stepwise weight of the segment t is in. */
function sample(keys: Key[], t: number, get: (k: Key) => number): number {
  let prev: Key | undefined;
  for (const b of keys) {
    if (prev && t <= b.t) {
      const u = b.t > prev.t ? (t - prev.t) / (b.t - prev.t) : 1;
      return get(prev) + (get(b) - get(prev)) * ease(u);
    }
    prev = b;
  }
  return prev ? get(prev) : 0;
}
const angleAt = (keys: Key[], t: number) => sample(keys, t, (k) => k.angle);
/** The key that ends the segment t is in (stepwise per-rep values). */
function segment(keys: Key[], t: number): Key | undefined {
  return keys.find((k) => t <= k.t) ?? keys.at(-1);
}
function extraAt(keys: Key[], t: number, flaw: string | null): PoseExtra {
  const seg = segment(keys, t);
  return { flaw, w: seg?.w ?? 0, ws: sample(keys, t, (k) => k.w), turn: seg?.turn ?? 0 };
}

window.__clips = () =>
  Object.entries(EX).flatMap(([folder, ex]) =>
    plansFor(folder).map((p) => {
      const reps = p.moves.map((m) => toRep(ex, m));
      const full = reps.filter((r) => r.kind === 'full').length;
      const partials = reps.length - full;
      const spec: ClipSpec = {
        folder,
        name: `${p.name}__reps-${full}__partials-${partials}`,
        reps: full,
        partials,
      };
      if (p.flaw) {
        spec.flaw = {
          ...p.flaw,
          flawReps: reps.flatMap((r, i) => (r.w > 0 ? [i + 1] : [])),
          reps: reps.map((r) => ({ turn: r.turn, upSec: r.up, downSec: r.down, w: r.w })),
        };
      }
      return spec;
    }),
  );

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

const skin = new MeshStandardMaterial({ color: 0xc98e6b, roughness: 0.7 });
const shirt = new MeshStandardMaterial({ color: 0x2b5c8a, roughness: 0.8 });
const pants = new MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 });
const iron = new MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
const UP = new Vector3(0, 1, 0);

function capsule(r: number, mat: MeshStandardMaterial): Mesh {
  return new Mesh(new CapsuleGeometry(r, 1, 6, 14), mat);
}
function place(m: Mesh, a: Vector3, b: Vector3): void {
  const d = b.clone().sub(a);
  m.position.copy(a.clone().add(b).multiplyScalar(0.5));
  m.scale.set(1, Math.max(d.length(), 1e-3), 1);
  m.quaternion.copy(new Quaternion().setFromUnitVectors(UP, d.normalize()));
}
function dumbbell(): Group {
  const g = new Group();
  const bar = new Mesh(new CapsuleGeometry(0.014, 0.14, 4, 8), iron);
  const p1 = new Mesh(new BoxGeometry(0.07, 0.04, 0.07), iron);
  p1.position.y = 0.08;
  const p2 = p1.clone();
  p2.position.y = -0.08;
  g.add(bar, p1, p2);
  return g;
}

function buildFigure(fig: Group) {
  const head = new Mesh(new SphereGeometry(0.105, 32, 24), skin);
  head.scale.set(0.95, 1.1, 0.9);
  const nose = new Mesh(new SphereGeometry(0.022, 12, 10), skin);
  const neckM = capsule(0.05, skin);
  const torso = capsule(0.15, shirt);
  const pelvis = capsule(0.14, pants);
  fig.add(head, nose, neckM, torso, pelvis);
  const limbs = (['r', 'l'] as const).map(() => {
    const m = {
      sleeve: capsule(0.05, shirt),
      upper: capsule(0.043, skin),
      fore: capsule(0.038, skin),
      hand: new Mesh(new SphereGeometry(0.04, 12, 10), skin),
      thigh: capsule(0.075, pants),
      shin: capsule(0.055, pants),
      foot: capsule(0.045, pants),
    };
    fig.add(...Object.values(m));
    return m;
  });
  const bells = [dumbbell(), dumbbell()];
  fig.add(...bells);
  return (p: Pose) => {
    const u = p.neck.clone().sub(p.hip).normalize();
    place(torso, p.hip.clone().addScaledVector(u, 0.16), p.neck.clone().addScaledVector(u, -0.04));
    place(pelvis, p.hip.clone().addScaledVector(u, 0.01), p.hip.clone().addScaledVector(u, 0.13));
    place(neckM, p.neck.clone().addScaledVector(u, 0.06), p.neck.clone().addScaledVector(u, 0.13));
    head.position.copy(p.neck.clone().addScaledVector(u, 0.22));
    head.quaternion.copy(new Quaternion().setFromUnitVectors(UP, u));
    nose.position.copy(head.position.clone().addScaledVector(p.face, 0.1));
    [p.r, p.l].forEach((sd, i) => {
      const m = limbs[i];
      if (!m) return;
      const hipJ = at(p.hip, (p.hipW ?? 0.09) * (i === 0 ? 1 : -1));
      place(m.sleeve, sd.s, sd.s.clone().lerp(sd.e, 0.4));
      place(m.upper, sd.s, sd.e);
      place(m.fore, sd.e, sd.w);
      m.hand.position.copy(sd.h);
      place(m.thigh, hipJ, sd.k);
      place(m.shin, sd.k, sd.a);
      place(m.foot, sd.a, sd.toe);
    });
    bells.forEach((b, i) => {
      const spec = p.bells[i];
      b.visible = !!spec;
      if (!spec) return;
      b.position.copy(spec.pos);
      b.quaternion.copy(new Quaternion().setFromUnitVectors(UP, spec.axis.clone().normalize()));
    });
  };
}

window.__render = async ({ folder, name }) => {
  const ex = EX[folder];
  const plan = plansFor(folder).find((p) => name.startsWith(`${p.name}__`));
  if (!ex || !plan) throw new Error(`unknown clip ${folder}/${name}`);
  const [W, H] = ex.size;
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
  const camera = new PerspectiveCamera(ex.cam.fov, W / H, 0.1, 30);
  camera.position.set(...ex.cam.pos);
  camera.lookAt(...ex.cam.look);

  // Side view: the figure faces +x (screen right), the camera sees its right side.
  // Front view: turn the figure to face the camera (+z).
  const fig = new Group();
  if (ex.view === 'front') fig.rotation.y = -Math.PI / 2;
  scene.add(fig);
  ex.props?.(fig);
  const update = buildFigure(fig);
  const keys = keyframes(
    ex,
    plan.moves.map((m) => toRep(ex, m)),
  );
  const total = keys.at(-1)?.t ?? 0;

  const stream = renderer.domElement.captureStream(30);
  const rec = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 4e6,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  update(ex.pose(ex.start, CLEAN_X));
  renderer.render(scene, camera);
  rec.start(250);

  const t0 = performance.now();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      const theta = angleAt(keys, t);
      update(ex.pose(theta, extraAt(keys, t, plan.flaw?.flaw ?? null)));
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
