// M4b exercise demos as data: which exercises have a demo, each demo's angle keyframes and tempo,
// and the mannequin pose at any time in the loop. Pure, no three.js import: badges call hasDemo()
// without loading the 3D chunk. The player (player.ts) maps DemoPose onto capsules.
import {
  FLAT_BENCH,
  INCLINE_BENCH,
  benchPressPose,
  inclinePressPose,
  lateralRaisePose,
  tricepsExtensionPose,
  pushUpPose,
  seatedPressPose,
  type DemoPose,
  type DemoProp,
  type MeasuredJoint,
  type SideKey,
  type V3,
} from './poses';

export type { DemoPose, DemoProp, DemoSide, MeasuredJoint, SideKey, V3 } from './poses';

/** Seconds per phase (SPEC M4b): lift 1 s, hold 0.3 s, lower 2 s, pause 0.5 s at the start. */
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
  /** Camera hint in the figure frame: point to look at and distance for the whole body to fit. */
  camera: { look: V3; distance: number };
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
    camera: { look: [-0.15, 0.38, 0], distance: 3.3 },
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
    camera: { look: [0, 0.85, 0], distance: 3.8 },
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
    camera: { look: [0, 0.95, 0], distance: 4.3 },
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
    camera: { look: [0.15, 0.7, 0], distance: 3.4 },
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
    camera: { look: [0.15, 0.85, 0], distance: 3.5 },
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
    camera: { look: [0, 1.05, 0], distance: 4.6 },
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
  return m.outward === 'lower'
    ? `Down ${TEMPO.lower} s · Up ${TEMPO.lift} s`
    : `Lift ${TEMPO.lift} s · Lower ${TEMPO.lower} s`;
}

const back = (l: Leg): Leg => (l === 'lift' ? 'lower' : 'lift');

/** Phases of one loop, in order, with their durations. */
function phases(m: DemoMove): { phase: Phase; dur: number; to: number }[] {
  return [
    { phase: 'pause', dur: TEMPO.pause, to: m.start },
    { phase: m.outward, dur: TEMPO[m.outward], to: m.far },
    { phase: 'hold', dur: TEMPO.hold, to: m.far },
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
