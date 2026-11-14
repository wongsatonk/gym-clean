// M4b exercise demos as data: which exercises have a demo, each demo's angle keyframes and tempo,
// and the mannequin pose at any time in the loop. Pure, no three.js import: badges call hasDemo()
// without loading the 3D chunk. The player (player.ts, scene.ts) draws DemoPose as
// spheres, ellipsoids and tapered cylinders.
import {
  benchDipPose,
  CALF_MACHINE,
  calfRaisePose,
  CROSSOVER_MACHINE,
  crossoverPose,
  DIP_BENCH,
  flyPose,
  LEG_CURL_MACHINE,
  legCurlPose,
  lungePose,
  PUSHDOWN_MACHINE,
  pushdownPose,
  SHOULDER_PRESS_BENCH,
  stiffLegDeadliftPose,
  FLAT_BENCH,
  INCLINE_BENCH,
  ROW_BENCH,
  benchPressPose,
  curlPose,
  gobletSquatPose,
  hammerCurlPose,
  PULLDOWN_MACHINE,
  pulldownPose,
  REVERSE_FLY_BENCH,
  reverseFlyPose,
  rowPose,
  inclinePressPose,
  lateralRaisePose,
  tricepsExtensionPose,
  pushUpPose,
  seatedPressPose,
  type DemoPose,
  type DemoProp,
  type MeasuredJoint,
  type SideKey,
} from './poses';

export type { DemoPose, DemoProp, DemoSide, MeasuredJoint, SideKey, V3 } from './poses';

/**
 * Seconds per phase (SPEC M4b): lift 1 s, hold 0.3 s, lower 2 s, pause 0.5 s at the start. A demo
 * whose how-to tempo line has a hold ("Hold 1 s") overrides the hold (DemoMove.hold).
 */
export const TEMPO = { lift: 1, hold: 0.3, lower: 2, pause: 0.5 } as const;

export type Leg = 'lift' | 'lower';
export type Phase = Leg | 'hold' | 'pause';

export type DemoMove = {
  exerciseId: string;
  /** Default camera view (the same view the camera page asks for, when the exercise is tracked). */
  view: 'side' | 'front';
  /** The joint whose angle drives the pose, and the side measured. */
  measure: { joint: MeasuredJoint; side: SideKey };
  /** Angle (deg) at the start position, where each rep starts and ends. */
  start: number;
  /** Angle (deg) at the far end of a full rep. */
  far: number;
  /** Whether going from the start to the far end is the lift or the lowering. */
  outward: Leg;
  pose: (theta: number) => DemoPose;
  /** Static props (bench, seat). */
  props: readonly DemoProp[];
  /**
   * Words for the two legs when "Lift"/"Lower" don't fit (pulldown: "Pull"/"Return"); used by the
   * tempo text and the phase label, matching the how-to tempo line.
   */
  words?: { lift: string; lower: string };
  /**
   * Muscles the how-to focus line names as helpers that the exercise data doesn't list (e.g. the
   * forearms in a hammer curl). Lit as secondary.
   */
  helpers?: readonly string[];
  /**
   * Opening camera turn (rad, the player's yaw) when neither preset shows the target muscles:
   * the reverse fly opens on a 3/4 rear view of the rear shoulders. Front/Side still work.
   */
  openYaw?: number;
  /**
   * Seconds held at the far end when the how-to tempo line asks for a hold ("Lift 1 s · Hold 1 s ·
   * Lower 2 s"); shown in the tempo text. Default: TEMPO.hold, not shown.
   */
  hold?: number;
};

export type Key = { t: number; angle: number };

// Figure frame: forward = +x, up = +y, right = +z (see poses.ts). Angles from tools/synthetic.ts:
// every full rep goes >= 10 deg past both rep-counter thresholds (tested). The manual exercises
// below have original poses; their tests check the declared start/far angles instead.
export const DEMOS: readonly DemoMove[] = [
  {
    exerciseId: 'Pushups',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 180,
    far: 40,
    outward: 'lower',
    pose: pushUpPose,
    props: [],
  },
  {
    exerciseId: 'Seated_Dumbbell_Press',
    view: 'front',
    measure: { joint: 'elbow', side: 'r' },
    start: 35,
    far: 180,
    outward: 'lift',
    pose: seatedPressPose,
    props: [{ at: [-0.02, 0.24, 0], size: [0.46, 0.48, 0.42] }],
  },
  {
    exerciseId: 'Side_Lateral_Raise',
    view: 'front',
    measure: { joint: 'shoulder', side: 'r' },
    start: 8,
    far: 100,
    outward: 'lift',
    pose: lateralRaisePose,
    props: [],
  },
  // M4d: the other three pose-tracked exercises (Pull A / Legs A), also from tools/synthetic.ts.
  {
    exerciseId: 'Dumbbell_Bicep_Curl',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 180,
    far: 22,
    outward: 'lift',
    pose: curlPose,
    props: [],
  },
  {
    exerciseId: 'One-Arm_Dumbbell_Row',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 180,
    // tools/synthetic.ts rows to 45 (tuned for world-landmark compression in the fixture); the demo
    // stops at 70, upper arm in line with the back, the textbook top. Still 20 deg past the 90 rule.
    far: 70,
    outward: 'lift',
    pose: rowPose,
    props: ROW_BENCH,
  },
  {
    exerciseId: 'Goblet_Squat',
    view: 'side',
    measure: { joint: 'knee', side: 'r' },
    start: 180,
    far: 75,
    outward: 'lower',
    pose: gobletSquatPose,
    props: [],
  },
  // Manual-count Push A exercises (no rep-counter rule): original poses, declared start/far angles.
  {
    exerciseId: 'Dumbbell_Bench_Press',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 70,
    far: 180,
    outward: 'lift',
    pose: benchPressPose,
    props: FLAT_BENCH,
  },
  {
    exerciseId: 'Incline_Dumbbell_Press',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 70,
    far: 180,
    outward: 'lift',
    pose: inclinePressPose,
    props: INCLINE_BENCH,
  },
  {
    exerciseId: 'Standing_Dumbbell_Triceps_Extension',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 180,
    far: 45,
    outward: 'lower',
    pose: tricepsExtensionPose,
    props: [],
  },
  // M4d Pull A, manual count: original poses, declared start/far angles.
  {
    exerciseId: 'Hammer_Curls',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 180,
    // Hands at shoulder height (howto: "Curl up to shoulder height").
    far: 30,
    outward: 'lift',
    pose: hammerCurlPose,
    props: [],
    // Focus line: "biceps and the top of the forearm" (brachioradialis; the M2 map has forearms).
    helpers: ['forearms'],
  },
  {
    exerciseId: 'Reverse_Flyes',
    // Neither preset shows the rear shoulders on a chest-down figure: the front view sees the
    // chest side, the side view sees the arm come straight at the camera. It opens on a 3/4 view
    // from behind and above the right shoulder instead (openYaw); Side is the nearest preset.
    view: 'side',
    measure: { joint: 'shoulder', side: 'r' },
    start: 55,
    // Upper arms level with the back (howto: "up to shoulder level").
    far: 100,
    outward: 'lift',
    pose: reverseFlyPose,
    props: REVERSE_FLY_BENCH,
    // Focus line: "Upper back helps."
    helpers: ['middle back'],
    openYaw: 0.75,
  },
  {
    exerciseId: 'Wide-Grip_Lat_Pulldown',
    // Front: the wide grip and the elbows travelling down and out are the point of the exercise.
    view: 'front',
    // Shoulder angle (hip-shoulder-elbow): the lats' job. The elbow angle bottoms out at the
    // shoulder line and opens again as the bar goes on to the chest, so it can't drive the pose.
    measure: { joint: 'shoulder', side: 'r' },
    // Arms all but straight overhead (elbow ~167 deg) -> bar touching the upper chest.
    start: 152,
    far: 35,
    outward: 'lift',
    pose: pulldownPose,
    props: PULLDOWN_MACHINE,
    words: { lift: 'Pull', lower: 'Return' },
  },
  // M4d Legs A, manual count: original poses, declared start/far angles.
  {
    exerciseId: 'Stiff-Legged_Dumbbell_Deadlift',
    view: 'side',
    // Hip angle (shoulder-hip-knee): the hinge is the exercise; the knees keep a fixed slight bend.
    measure: { joint: 'hip', side: 'r' },
    // Standing tall (the shoulders sit 11 cm outside the hip joints, so straight reads ~168).
    start: 167,
    // Torso ~70 deg forward, dumbbells just below the knees.
    far: 90,
    outward: 'lower',
    pose: stiffLegDeadliftPose,
    props: [],
  },
  {
    exerciseId: 'Dumbbell_Lunges',
    view: 'side',
    // Front (right) knee. The demo stays in the split stance (no step in/out, right leg forward
    // only): the lowering and rising are what the how-to lines coach.
    measure: { joint: 'knee', side: 'r' },
    // Top of the split stance: the front leg all but straight.
    start: 165,
    far: 90,
    outward: 'lower',
    pose: lungePose,
    props: [],
  },
  {
    exerciseId: 'Lying_Leg_Curls',
    view: 'side',
    measure: { joint: 'knee', side: 'r' },
    start: 175,
    // Heels well up toward the glutes.
    far: 60,
    outward: 'lift',
    pose: legCurlPose,
    props: LEG_CURL_MACHINE,
    hold: 1,
  },
  {
    exerciseId: 'Standing_Calf_Raises',
    view: 'side',
    // Ankle angle (knee-ankle-toe): 75 = heels below the step (stretch), 130 = high on the toes.
    measure: { joint: 'ankle', side: 'r' },
    start: 75,
    far: 130,
    outward: 'lift',
    pose: calfRaisePose,
    props: CALF_MACHINE,
    hold: 1,
    // The calves are on the back of the shins, a sliver from either preset: open on a 3/4 rear
    // view from the right (the column is far enough back not to hide them). Side is the nearest
    // preset.
    openYaw: 0.6,
  },
  // M4d Push B, manual count (Incline_Dumbbell_Press already has its Push A demo).
  {
    exerciseId: 'Dumbbell_Flyes',
    // Front: the arms open and close across the camera's view.
    view: 'front',
    measure: { joint: 'armOpen', side: 'r' },
    // Starts open like the presses start low (the how-to tempo line lifts first).
    start: 165,
    far: 95,
    outward: 'lift',
    pose: flyPose,
    props: FLAT_BENCH,
  },
  {
    exerciseId: 'Dumbbell_Shoulder_Press',
    view: 'front',
    measure: { joint: 'elbow', side: 'r' },
    // Dumbbells at shoulder height -> arms straight overhead (the seated press arm path).
    start: 50,
    far: 178,
    outward: 'lift',
    pose: seatedPressPose,
    props: SHOULDER_PRESS_BENCH,
  },
  {
    exerciseId: 'Cable_Crossover',
    view: 'front',
    measure: { joint: 'armOpen', side: 'r' },
    // Arms open toward the high pulleys -> hands meeting in front of the lower chest.
    start: 160,
    far: 80,
    outward: 'lift',
    pose: crossoverPose,
    props: CROSSOVER_MACHINE,
    words: { lift: 'Pull', lower: 'Return' },
    hold: 1,
  },
  {
    exerciseId: 'Triceps_Pushdown',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    // Bar at chest height -> arms straight down.
    start: 75,
    far: 175,
    outward: 'lift',
    pose: pushdownPose,
    props: PUSHDOWN_MACHINE,
    words: { lift: 'Push', lower: 'Return' },
    hold: 1,
  },
  {
    exerciseId: 'Bench_Dips',
    view: 'side',
    measure: { joint: 'elbow', side: 'r' },
    start: 175,
    far: 85,
    outward: 'lower',
    pose: benchDipPose,
    props: DIP_BENCH,
  },
];

const BY_ID = new Map(DEMOS.map((d) => [d.exerciseId, d]));

/** Exercise ids that have an animated demo, in registry order. */
export const DEMO_IDS: readonly string[] = DEMOS.map((d) => d.exerciseId);

export function demoFor(exerciseId: string): DemoMove | undefined {
  return BY_ID.get(exerciseId);
}

/** Drives the "3D demo" / "Info" badges. */
export function hasDemo(exerciseId: string): boolean {
  return BY_ID.has(exerciseId);
}

/**
 * Tempo text shown next to the demo, in the order the rep happens: "Down 2 s · Up 1 s" when a rep
 * starts with the lowering (push-up), "Lift 1 s · Lower 2 s" when it starts with the lift.
 */
export function tempoLabel(m: DemoMove): string {
  const hold = m.hold === undefined ? '' : ` · Hold ${m.hold} s`;
  if (m.outward === 'lower') return `Down ${TEMPO.lower} s${hold} · Up ${TEMPO.lift} s`;
  const w = m.words ?? { lift: 'Lift', lower: 'Lower' };
  return `${w.lift} ${TEMPO.lift} s${hold} · ${w.lower} ${TEMPO.lower} s`;
}

/** Seconds held at the far end of the rep. */
export function holdSeconds(m: DemoMove): number {
  return m.hold ?? TEMPO.hold;
}

const back = (l: Leg): Leg => (l === 'lift' ? 'lower' : 'lift');

/** Phases of one loop, in order, with their durations. */
function phases(m: DemoMove): { phase: Phase; dur: number; to: number }[] {
  return [
    { phase: 'pause', dur: TEMPO.pause, to: m.start },
    { phase: m.outward, dur: TEMPO[m.outward], to: m.far },
    { phase: 'hold', dur: holdSeconds(m), to: m.far },
    { phase: back(m.outward), dur: TEMPO[back(m.outward)], to: m.start },
  ];
}

export function cycleSeconds(m: DemoMove): number {
  return phases(m).reduce((s, p) => s + p.dur, 0);
}

/** Angle keyframes of one loop; the first and last keys are both the start angle. */
export function trackFor(m: DemoMove): Key[] {
  const keys: Key[] = [{ t: 0, angle: m.start }];
  let t = 0;
  for (const p of phases(m)) keys.push({ t: (t += p.dur), angle: p.to });
  return keys;
}

const wrap = (t: number, total: number) => (total > 0 ? ((t % total) + total) % total : 0);

/** Angle at time t (s, looping), eased in and out between keys. */
export function angleAt(keys: readonly Key[], t: number): number {
  const first = keys[0];
  const last = keys.at(-1);
  if (!first || !last) return 0;
  // Exactly one loop (or a multiple) lands on the last key, which equals the first.
  const tt = t > 0 && wrap(t, last.t) === 0 ? last.t : wrap(t, last.t);
  let a = first;
  for (const b of keys.slice(1)) {
    if (tt <= b.t) {
      const u = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 1;
      return a.angle + (b.angle - a.angle) * (0.5 - 0.5 * Math.cos(Math.PI * u));
    }
    a = b;
  }
  return last.angle;
}

/** Which phase the loop is in at time t (s, looping). */
export function phaseAt(m: DemoMove, t: number): Phase {
  let tt = wrap(t, cycleSeconds(m));
  for (const p of phases(m)) {
    if (tt < p.dur) return p.phase;
    tt -= p.dur;
  }
  return 'pause';
}

/** The mannequin pose at time t (s, looping). t = 0 is the start pose (reduced motion). */
export function poseAt(m: DemoMove, t: number): DemoPose {
  return m.pose(angleAt(trackFor(m), t));
}
