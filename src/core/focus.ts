// Live focus cues (SPEC M5, PROGRESS "M5 cue mechanics"). A pure per-frame tracker, fed like
// autoSet: every camera tick, after the rep counter (and autoSet), including ticks with no pose.
// No DOM, no clock: every time is passed in, on the camera frame clock.
//
// Focus rules: rushed lowering and shrinking range judge each counted rep against the set's
// baseline (mean of the first `baselineReps` reps); stalled, out of frame and low fps are timers.
//
// Form rules (task 5) judge each counted rep's geometry, from the first rep (no baseline):
//  - arms out of sync: |left − right| per-side angle (the counter's sideAngles, in the rule's
//    angle space) above armsOutOfSyncDeg, held ≥ armsOutOfSyncSec mid-rep (down/bottom/up);
//  - raise too high: the rep event's maxAngle above raiseTooHighDeg;
//  - elbow drift: the upper arm's angle from the torso line (world hip–shoulder–elbow, on the
//    counter's tracked side, else the better-visible side) grown by more than elbowDriftDeg over its value on the frame before
//    the lift, held ≥ formHoldSec in the lift. Relative, because the world model reads a hanging
//    arm 17–29° off the torso line on the clean synthetic curl (an absolute 25° nearly fires);
//    signed, so the arm settling closer to the torso is no drift;
//  - body swing: the torso (visible sides' hip → shoulder, world) turned more than bodySwingDeg
//    from its direction on the frame before the lift, held ≥ formHoldSec in the lift;
//  - hips sag: world shoulder–hip–ankle (same side choice) below hipSagMinDeg, held ≥
//    formHoldSec mid-rep; only while the counter's active view is `side`.
// "The lift" is the concentric leg plus the dwell at the far end (curl/row: down + bottom;
// push-up: bottom + up), taken from the rule's start / eccentric data. A measure is unknown
// (null) when its joints fail the visibility gate (rule.minVisibility), the frame has no world
// landmarks, or the hold was never met; an unknown rep breaks the rule's streak and never fires.
// The holds keep one-frame pose glitches from reading as a fault.
//
// Firing:
//  - A rule fires only when its flag is `true` (false or missing = never).
//  - Rep rules need `streakReps` qualifying reps in a row; partials neither extend nor break a
//    streak. After a fire the streak restarts; at most `maxFiresPerRule` fires per rule per set.
//  - At most one cue per push, by priority: out of frame > low fps > form > rushed lowering >
//    shrinking range > stalled. A rep rule that loses on priority keeps its streak (it isn't a
//    fire), so it fires on its next qualifying rep; a timer rule simply stays due.
//  - Nothing fires while paused or when autoState is rest / pending / closed. Rest frames are
//    ignored entirely (an auto-started set's starting reps arrive as the reset seed); in the other
//    quiet states reps still count (for "N to go") and fill the baseline, but don't judge, and
//    every timer restarts when the quiet state ends.
import { angleBetweenDeg, jointAngle, tripletVisibility, type Triplet, type Vec3 } from './angles';
import type { AutoSetConfig, AutoSetState } from './autoSet';
import type { ExerciseRule } from './exercises';
import type { RepPhase, SideAngles, TrackedSide, UntrackedReason } from './repCounter';
import { LANDMARK } from './poseTopology';
import type { FocusCueId, LandmarkFrame, RepEvent } from './types';

/** All thresholds are data; retuned from the developer log after Checkpoint C. */
export type FocusConfig = {
  /** Reps whose mean is the set's baseline (never judged themselves). */
  baselineReps: number;
  /** Rushed lowering: eccentric time < this × the baseline's. */
  rushedRatio: number;
  /** Shrinking range: rep range (max − min angle) < this × the baseline's. */
  rangeRatio: number;
  /** Qualifying reps in a row before a rep rule fires. */
  streakReps: number;
  /** Fires per rule per set. */
  maxFiresPerRule: number;
  /** Stalled (hands-free off, or fewer than autoSet.stopMinReps reps): no phase change or event. */
  stalledSec: number;
  /** Stalled with hands-free on, outside the start band: autoSet.stalledSec × this. */
  stalledHandsFreeFraction: number;
  /** Out of frame: joints hidden (or nobody, when no auto stop follows) for this long. */
  outOfFrameSec: number;
  /** Low fps: below this rate… */
  lowFps: number;
  /** …for this long. */
  lowFpsSec: number;
  /** Form: |left − right| angle (deg) above this, held for armsOutOfSyncSec mid-rep. */
  armsOutOfSyncDeg: number;
  armsOutOfSyncSec: number;
  /**
   * Form: a rep's maxAngle above this (deg; lateral raise). 120 = clearly above shoulder height
   * (Wongsaton's answer (1), 2026-11-13; was 100, which his real reps at 91–109° crossed).
   */
  raiseTooHighDeg: number;
  /** Form: upper arm swinging away from the torso line by more than this (deg) in the lift. */
  elbowDriftDeg: number;
  /** Form: torso direction changing by more than this (deg) in the lift. */
  bodySwingDeg: number;
  /** Form: shoulder–hip–ankle angle below this (deg; side view only). */
  hipSagMinDeg: number;
  /** Form: how long elbow drift / body swing / hips sag must hold past the line (s). */
  formHoldSec: number;
};

export const FOCUS_DEFAULTS: Readonly<FocusConfig> = Object.freeze({
  baselineReps: 2,
  rushedRatio: 0.5,
  rangeRatio: 0.85,
  streakReps: 2,
  maxFiresPerRule: 2,
  stalledSec: 8,
  stalledHandsFreeFraction: 0.5,
  outOfFrameSec: 2,
  lowFps: 15,
  lowFpsSec: 3,
  armsOutOfSyncDeg: 20,
  armsOutOfSyncSec: 0.5,
  raiseTooHighDeg: 120,
  elbowDriftDeg: 25,
  bodySwingDeg: 15,
  hipSagMinDeg: 160,
  formHoldSec: 0.2,
});

/** Which rules are on for an exercise (data on the exercise rule; only `true` is on). */
export type FocusRuleFlags = Partial<Record<FocusCueId, boolean>>;

/**
 * Shown = spoken; ≤ 6 words; coaching language only. `{N}` in the stalled cue is the reps still
 * to go (see cueText).
 */
export const CUE_TEXT: Readonly<Record<FocusCueId, string>> = Object.freeze({
  rushedLowering: 'Slow the lowering.',
  shrinkingRange: 'Full range.',
  stalled: 'Stay with it. {N} to go.',
  outOfFrame: 'Step back into frame.',
  lowFps: 'Move closer to the light.',
  armsOutOfSync: 'Both arms together.',
  raiseTooHigh: 'Stop at shoulder height.',
  elbowDrift: 'Keep your elbow still.',
  bodySwing: 'Keep your body still.',
  hipSag: 'Keep your body straight.',
});

/** The cue's text with `{N}` filled in (reps still to go). */
export function cueText(id: FocusCueId, toGo: number): string {
  return CUE_TEXT[id].replace('{N}', String(Math.max(0, Math.round(toGo))));
}

/** One camera tick, after the rep counter (and autoSet) saw it. */
export type FocusInput = {
  /** Frame clock (ms). */
  t: number;
  /** A person is in frame (autoSet's personInFrame), whatever the counter's gates say. */
  present: boolean;
  /** The counter tracked this frame. */
  tracking: boolean;
  /** Why it didn't (null when tracked). Only `visibility` can be out of frame. */
  untracked: UntrackedReason | null;
  phase: RepPhase;
  /** The counter's smoothed angle (part 2). */
  angle?: number | null;
  /** Per-side angles, 'both' side mode only (part 2). */
  sides?: SideAngles | null;
  /** The landmark frame, for the form rules (world landmarks + visibility). */
  frame?: LandmarkFrame | null;
  /**
   * The counter's active camera view (`counter.rule.view`). Hips sag is judged only when this is
   * 'side'. When missing, the rule's own view is used, unless the rule has an `otherView` (then
   * the view is unknown and hips sag isn't judged).
   */
  view?: 'side' | 'front' | null;
  /**
   * The counter's tracked side (`counter.side`). When it is 'left' / 'right', elbow drift and
   * hips sag use that side only (a side view's far side can read nonsense at high visibility);
   * otherwise they use the better-visible side.
   */
  side?: TrackedSide | null;
  /** Events the counter returned for this frame. */
  events: readonly RepEvent[];
  /** Measured frame rate; 0 / null = unknown. */
  fps: number | null;
  /** The hands-free machine's state; null or 'off' when it isn't running. */
  autoState: AutoSetState | null;
  paused: boolean;
};

export type FocusCue = {
  id: FocusCueId;
  /** Frame clock time of the detection. */
  t: number;
  /** Counted reps in the set at the detection (seeded reps included). */
  reps: number;
  /**
   * The measured value: eccentric ms / range deg of the rep that fired; ms stalled or out of
   * frame; fps.
   */
  value: number;
  /** The set's baseline (rep rules); null for the timer rules. */
  baseline: number | null;
  /** The limit the value crossed (same unit as value). */
  threshold: number;
  /** Shown and spoken. */
  text: string;
};

/**
 * One counted rep's form measures (deg); null = unknown (joints hidden, no world landmarks, the
 * hold never met, or the view can't judge it). Reported for the dev log / real-data replays.
 */
export type FormMeasures = {
  /** Largest |left − right| held ≥ armsOutOfSyncSec mid-rep. */
  armsOutOfSync: number | null;
  /** The rep event's maxAngle. */
  raiseTooHigh: number | null;
  /**
   * Largest growth of the upper arm's angle from the torso line over its value before the lift,
   * held ≥ formHoldSec in the lift.
   */
  elbowDrift: number | null;
  /** Largest torso turn from its direction before the lift, held ≥ formHoldSec in the lift. */
  bodySwing: number | null;
  /** Smallest shoulder–hip–ankle angle held ≥ formHoldSec mid-rep (side view only). */
  hipSag: number | null;
};

export type FocusTrackerOptions = {
  config?: Partial<FocusConfig>;
  flags: FocusRuleFlags;
  /** Top of the target range; "N to go" and the stalled cut-off. */
  targetReps: number;
  /** The hands-free config when hands-free sets are on, else null. */
  autoSet: AutoSetConfig | null;
};

export type FocusTracker = {
  /**
   * New set. `seed`: the events that auto-started it (rest-mode reps), counted toward the reps
   * and the baseline. Keeps the once-per-tracker low-fps flag.
   */
  reset(opts: { targetReps: number; seed?: readonly RepEvent[] }): void;
  /** Feed one camera tick (in time order). Returns at most one cue. */
  push(input: FocusInput): FocusCue[];
  /** Every cue fired in this set, in order (one entry per detection). */
  readonly fired: FocusCueId[];
  /** The latest counted rep's form measures; null before the set's first rep. */
  readonly lastForm: FormMeasures | null;
};

/** A backwards step in t this big or bigger is a stream restart; smaller ones are jitter. */
const RESTART_REGRESSION_MS = 100;
/** autoSet's start band: there, the hands-free still stop decides instead of the stalled cue. */
const START_BAND: ReadonlySet<RepPhase> = new Set<RepPhase>(['top', 'setup']);
const QUIET_AUTO_STATES: ReadonlySet<AutoSetState> = new Set<AutoSetState>([
  'rest',
  'pending',
  'closed',
]);

/** Counter phases between leaving the start band and returning to it. */
const MID_REP: ReadonlySet<RepPhase> = new Set<RepPhase>(['down', 'bottom', 'up']);
/** A hold is broken by a hole of this many ms without frames (the counter's EMA reseed gap). */
const HOLD_GAP_MS = 500;

/**
 * "Held for holdMs": push samples in time order; returns the smallest value over the last
 * holdMs (the sample at or before t − holdMs included), or null until the run covers holdMs.
 * A null sample or a hole over HOLD_GAP_MS breaks the run.
 */
function createHold(holdMs: number) {
  let buf: { t: number; v: number }[] = [];
  return {
    clear(): void {
      buf = [];
    },
    push(t: number, v: number | null): number | null {
      if (v === null || !Number.isFinite(v)) {
        buf = [];
        return null;
      }
      const last = buf[buf.length - 1];
      if (last && t - last.t > HOLD_GAP_MS) buf = [];
      buf.push({ t, v });
      while (buf.length > 1 && (buf[1]?.t ?? Infinity) <= t - holdMs) buf.shift();
      if ((buf[0]?.t ?? Infinity) > t - holdMs) return null;
      return buf.reduce((m, s) => Math.min(m, s.v), Infinity);
    },
  };
}

type FormId = 'armsOutOfSync' | 'raiseTooHigh' | 'elbowDrift' | 'bodySwing' | 'hipSag';

/** Form rules in priority order: the measure crosses the line when `bad`. */
const FORM_RULES: readonly {
  id: FormId;
  threshold: (c: FocusConfig) => number;
  bad: (value: number, threshold: number) => boolean;
}[] = [
  { id: 'armsOutOfSync', threshold: (c) => c.armsOutOfSyncDeg, bad: (v, th) => v > th },
  { id: 'raiseTooHigh', threshold: (c) => c.raiseTooHighDeg, bad: (v, th) => v > th },
  { id: 'elbowDrift', threshold: (c) => c.elbowDriftDeg, bad: (v, th) => v > th },
  { id: 'bodySwing', threshold: (c) => c.bodySwingDeg, bad: (v, th) => v > th },
  { id: 'hipSag', threshold: (c) => c.hipSagMinDeg, bad: (v, th) => v < th },
];

const L = LANDMARK;
const SIDES = [
  { s: L.LEFT_SHOULDER, e: L.LEFT_ELBOW, h: L.LEFT_HIP, a: L.LEFT_ANKLE },
  { s: L.RIGHT_SHOULDER, e: L.RIGHT_ELBOW, h: L.RIGHT_HIP, a: L.RIGHT_ANKLE },
] as const;

/**
 * The joint angle (world 3D) at the middle point of a side's triplet: `side`'s when it is 'left'
 * or 'right', else the better-visible side's. Null when that side fails the visibility gate (no
 * fallback to the other side) or the frame has no world landmarks.
 */
function sideAngle(
  frame: LandmarkFrame,
  triplets: { left: Triplet; right: Triplet },
  minVisibility: number,
  side: TrackedSide | null | undefined,
): number | null {
  const w = frame.world;
  if (!w || w.length === 0) return null;
  const candidates =
    side === 'left' || side === 'right' ? [triplets[side]] : [triplets.left, triplets.right];
  let best: Triplet | null = null;
  let bestVis = -Infinity;
  for (const tr of candidates) {
    const v = tripletVisibility(frame, tr);
    if (v >= minVisibility && v > bestVis) {
      best = tr;
      bestVis = v;
    }
  }
  if (!best) return null;
  const [pa, pb, pc] = best.map((i) => w[i]);
  if (!pa || !pb || !pc) return null;
  const angle = jointAngle(pa, pb, pc);
  return Number.isFinite(angle) ? angle : null;
}

/** Unit hip → shoulder direction (world) over the sides whose shoulder and hip are visible. */
function visibleTorso(frame: LandmarkFrame, minVisibility: number): Vec3 | null {
  const w = frame.world;
  if (!w || w.length === 0) return null;
  let x = 0;
  let y = 0;
  let z = 0;
  let n = 0;
  for (const side of SIDES) {
    const sh = w[side.s];
    const hip = w[side.h];
    const vis = Math.min(
      frame.landmarks[side.s]?.visibility ?? 0,
      frame.landmarks[side.h]?.visibility ?? 0,
    );
    if (!sh || !hip || !(vis >= minVisibility)) continue;
    x += sh.x - hip.x;
    y += sh.y - hip.y;
    z += sh.z - hip.z;
    n++;
  }
  const len = Math.hypot(x, y, z);
  if (n === 0 || !(len > 0)) return null;
  return { x: x / len, y: y / len, z: z / len };
}

type RepRule = {
  id: 'rushedLowering' | 'shrinkingRange';
  measure: (ev: RepEvent) => number;
  ratio: (c: FocusConfig) => number;
};

/** Rep rules in priority order. */
const REP_RULES: readonly RepRule[] = [
  { id: 'rushedLowering', measure: (ev) => ev.eccentricMs, ratio: (c) => c.rushedRatio },
  { id: 'shrinkingRange', measure: (ev) => ev.maxAngle - ev.minAngle, ratio: (c) => c.rangeRatio },
];

/** A rep rule's verdict on the latest rep, waiting to be picked by priority. */
type Due = { id: FocusCueId; value: number; baseline: number | null; threshold: number };

export function createFocusTracker(rule: ExerciseRule, opts: FocusTrackerOptions): FocusTracker {
  const config: FocusConfig = { ...FOCUS_DEFAULTS, ...opts.config };
  // The lift (concentric) leg: the out leg (phase 'down') unless the lowering goes out.
  const farEnd = rule.start === 'extended' ? 'contracted' : 'extended';
  const eccentricEnd = rule.eccentric === 'toExtended' ? 'extended' : 'contracted';
  const LIFT: ReadonlySet<RepPhase> = new Set<RepPhase>([
    eccentricEnd === farEnd ? 'up' : 'down',
    'bottom',
  ]);
  const [LS, RS] = SIDES;
  const ELBOW_TRIPLETS = { left: [LS.h, LS.s, LS.e], right: [RS.h, RS.s, RS.e] } as const;
  const BODY_LINE_TRIPLETS = { left: [LS.s, LS.h, LS.a], right: [RS.s, RS.h, RS.a] } as const;
  const minVis = rule.minVisibility;
  const flags = opts.flags;
  const auto = opts.autoSet;
  const on = (id: FocusCueId) => flags[id] === true;
  const ms = (sec: number) => sec * 1000;

  // Per tracker.
  let lowFpsFired = false;
  let lastT: number | null = null;

  // Per set.
  let targetReps = opts.targetReps;
  let reps = 0;
  let baselineEvents: RepEvent[] = [];
  let baseline: Record<RepRule['id'], number> | null = null;
  let streak: Partial<Record<FocusCueId, number>> = {};
  let lastForm: FormMeasures | null = null;
  let fires: Partial<Record<FocusCueId, number>> = {};
  let fired: FocusCueId[] = [];
  /** Rep-rule verdicts from the latest rep that haven't fired yet (lost on priority). */
  let repDue: Due[] = [];

  // Timers (null = not running). They restart after any quiet frame.
  let prevPhase: RepPhase | null = null;
  let activityT: number | null = null;
  let stalledFired = false;
  let outSince: number | null = null;
  /** Out of frame re-arms only once the joints are back in view. */
  let outArmed = true;
  let lowSince: number | null = null;

  // Form measures of the rep in progress (cleared at every event and at the start band).
  const holdMs = ms(config.formHoldSec);
  const syncHold = createHold(ms(config.armsOutOfSyncSec));
  const elbowHold = createHold(holdMs);
  const swingHold = createHold(holdMs);
  /** Holds −(shoulder–hip–ankle), so its min is the largest angle over the window. */
  const sagHold = createHold(holdMs);
  let syncMax: number | null = null;
  let elbowMax: number | null = null;
  let swingMax: number | null = null;
  let sagMin: number | null = null;
  /** Torso direction on the frame before the lift began (body swing reference). */
  let torsoRef: Vec3 | null = null;
  /** Torso direction on the previous tracked frame. */
  let prevTorso: Vec3 | null = null;
  /** Upper arm–torso angle on the frame before the lift began (elbow drift reference). */
  let armRef: number | null = null;
  /** Upper arm–torso angle on the previous tracked frame. */
  let prevArm: number | null = null;

  function clearForm(): void {
    syncHold.clear();
    elbowHold.clear();
    swingHold.clear();
    sagHold.clear();
    syncMax = null;
    elbowMax = null;
    swingMax = null;
    sagMin = null;
    torsoRef = null;
    armRef = null;
  }

  const maxOf = (a: number | null, b: number | null) =>
    b === null ? a : a === null ? b : Math.max(a, b);

  /** Collect this frame's form measures (only frames the counter tracked, mid-rep). */
  function measureForm(input: FocusInput): void {
    const frame = input.frame ?? null;
    if (!input.tracking) {
      // A hidden frame breaks every hold; the rep's maxima so far stand.
      syncHold.clear();
      elbowHold.clear();
      swingHold.clear();
      sagHold.clear();
      prevTorso = null;
      prevArm = null;
      return;
    }
    const t = input.t;
    const mid = MID_REP.has(input.phase);
    const lift = LIFT.has(input.phase);
    const torso = frame ? visibleTorso(frame, minVis) : null;
    const arm = frame ? sideAngle(frame, ELBOW_TRIPLETS, minVis, input.side) : null;

    if (mid) {
      const l = input.sides?.left ?? null;
      const r = input.sides?.right ?? null;
      syncMax = maxOf(syncMax, syncHold.push(t, l !== null && r !== null ? Math.abs(l - r) : null));
      const view = input.view ?? (rule.otherView ? null : rule.view);
      if (view === 'side') {
        const line = frame ? sideAngle(frame, BODY_LINE_TRIPLETS, minVis, input.side) : null;
        const held = sagHold.push(t, line === null ? null : -line);
        if (held !== null) sagMin = sagMin === null ? -held : Math.min(sagMin, -held);
      } else sagHold.clear();
    }
    if (lift) {
      armRef ??= prevArm ?? arm;
      elbowMax = maxOf(
        elbowMax,
        elbowHold.push(t, arm !== null && armRef !== null ? arm - armRef : null),
      );
      torsoRef ??= prevTorso ?? torso;
      const turn = torso && torsoRef ? angleBetweenDeg(torso, torsoRef) : null;
      swingMax = maxOf(swingMax, swingHold.push(t, turn));
    } else {
      elbowHold.clear();
      swingHold.clear();
      torsoRef = null;
      armRef = null;
    }
    prevTorso = torso;
    prevArm = arm;
  }

  /** The finished rep's measures; clears the accumulators for the next one. */
  function finishRep(ev: RepEvent): FormMeasures {
    const m: FormMeasures = {
      armsOutOfSync: syncMax,
      raiseTooHigh: Number.isFinite(ev.maxAngle) ? ev.maxAngle : null,
      elbowDrift: elbowMax,
      bodySwing: swingMax,
      hipSag: sagMin,
    };
    clearForm();
    return m;
  }

  /** Advance the form streaks with this rep; queue the ones that are due (priority order). */
  function judgeForm(m: FormMeasures): void {
    for (const f of FORM_RULES) {
      const value = m[f.id];
      const threshold = f.threshold(config);
      if (value === null || !f.bad(value, threshold)) {
        streak[f.id] = 0; // unknown breaks the streak too
        continue;
      }
      streak[f.id] = (streak[f.id] ?? 0) + 1;
      if ((streak[f.id] ?? 0) >= config.streakReps && canFire(f.id))
        repDue.push({ id: f.id, value, baseline: null, threshold });
    }
  }

  function resetSet(target: number): void {
    targetReps = target;
    reps = 0;
    baselineEvents = [];
    baseline = null;
    streak = {};
    lastForm = null;
    clearForm();
    prevTorso = null;
    prevArm = null;
    fires = {};
    fired = [];
    repDue = [];
    prevPhase = null;
    activityT = null;
    stalledFired = false;
    outSince = null;
    outArmed = true;
    lowSince = null;
  }

  function restartTimers(): void {
    activityT = null;
    outSince = null;
    lowSince = null;
    prevPhase = null;
    clearForm();
    prevTorso = null;
    prevArm = null;
  }

  const canFire = (id: FocusCueId) => on(id) && (fires[id] ?? 0) < config.maxFiresPerRule;

  /** Count a rep; fill the baseline or (when `judge`) advance the rep-rule streaks. */
  function seeRep(ev: RepEvent, judge: boolean): void {
    reps++;
    lastForm = finishRep(ev);
    if (judge) {
      repDue = [];
      judgeForm(lastForm);
    }
    if (baseline === null) {
      baselineEvents.push(ev);
      if (baselineEvents.length >= config.baselineReps) {
        const n = baselineEvents.length;
        const mean = (f: (e: RepEvent) => number) =>
          baselineEvents.reduce((s, e) => s + f(e), 0) / n;
        const b = { rushedLowering: 0, shrinkingRange: 0 };
        for (const r of REP_RULES) b[r.id] = mean(r.measure);
        baseline = b;
      }
      return;
    }
    if (!judge) return;
    for (const r of REP_RULES) {
      const base = baseline[r.id];
      const threshold = base * r.ratio(config);
      const value = r.measure(ev);
      if (base > 0 && value < threshold) streak[r.id] = (streak[r.id] ?? 0) + 1;
      else streak[r.id] = 0;
      if ((streak[r.id] ?? 0) >= config.streakReps && canFire(r.id))
        repDue.push({ id: r.id, value, baseline: base, threshold });
    }
  }

  function fire(due: Due, t: number): FocusCue {
    fires[due.id] = (fires[due.id] ?? 0) + 1;
    fired.push(due.id);
    if (streak[due.id] !== undefined) streak[due.id] = 0;
    repDue = repDue.filter((d) => d.id !== due.id);
    return {
      id: due.id,
      t,
      reps,
      value: due.value,
      baseline: due.baseline,
      threshold: due.threshold,
      text: cueText(due.id, targetReps - reps),
    };
  }

  function reset(o: { targetReps: number; seed?: readonly RepEvent[] }): void {
    resetSet(o.targetReps);
    for (const ev of o.seed ?? []) if (ev.type === 'rep') seeRep(ev, true);
    // Seeded verdicts never fire on their own: the next qualifying rep does.
    repDue = [];
  }

  function push(input: FocusInput): FocusCue[] {
    const { t } = input;
    if (lastT !== null && t <= lastT - RESTART_REGRESSION_MS) restartTimers();
    else if (lastT !== null && t < lastT) return []; // out-of-order jitter
    lastT = t;

    const autoState = input.autoState;
    if (autoState === 'rest') {
      restartTimers();
      return [];
    }
    const quiet = input.paused || (autoState !== null && QUIET_AUTO_STATES.has(autoState));

    if (!quiet) measureForm(input);
    let event = false;
    for (const ev of input.events) {
      event = true;
      if (ev.type === 'rep') seeRep(ev, !quiet);
      else clearForm(); // a partial's frames belong to no rep
    }
    if (!MID_REP.has(input.phase)) clearForm();
    if (quiet) {
      restartTimers();
      repDue = [];
      return [];
    }

    // Activity: an event or a counter phase change.
    if (event || activityT === null || (prevPhase !== null && prevPhase !== input.phase))
      activityT = t;
    prevPhase = input.phase;

    const handsFree = auto !== null && autoState === 'set';
    const autoStopFollows = handsFree && reps >= auto.stopMinReps;

    // Out of frame: joints hidden while present, or nobody when no auto stop follows.
    const hidden =
      input.untracked === 'visibility' && (input.present || !autoStopFollows) && reps > 0;
    if (!hidden) {
      outSince = null;
      outArmed = true;
    } else if (outSince === null) outSince = t;

    // Low fps.
    const fps = input.fps;
    if (typeof fps === 'number' && fps > 0 && fps < config.lowFps) lowSince ??= t;
    else lowSince = null;

    const due: Due[] = [];
    if (
      outSince !== null &&
      outArmed &&
      canFire('outOfFrame') &&
      t - outSince >= ms(config.outOfFrameSec)
    )
      due.push({
        id: 'outOfFrame',
        value: t - outSince,
        baseline: null,
        threshold: ms(config.outOfFrameSec),
      });
    if (lowSince !== null && !lowFpsFired && on('lowFps') && t - lowSince >= ms(config.lowFpsSec))
      due.push({ id: 'lowFps', value: fps ?? 0, baseline: null, threshold: config.lowFps });
    // Form verdicts come first in repDue, then the rep rules (priority order).
    due.push(...repDue);
    const stalledLimit = stalledLimitMs(input.phase, autoStopFollows);
    if (
      stalledLimit !== null &&
      !stalledFired &&
      on('stalled') &&
      reps > 0 &&
      reps < targetReps &&
      input.present &&
      !hidden &&
      t - activityT >= stalledLimit
    )
      due.push({ id: 'stalled', value: t - activityT, baseline: null, threshold: stalledLimit });

    // Rep verdicts belong to this frame's rep; a later frame can't fire them.
    const first = due[0];
    const cue = first ? fire(first, t) : null;
    repDue = [];
    if (!cue) return [];
    if (cue.id === 'outOfFrame') outArmed = false;
    if (cue.id === 'lowFps') lowFpsFired = true;
    if (cue.id === 'stalled') stalledFired = true;
    return [cue];
  }

  /** Stalled cut-off (ms) here, or null when the hands-free still stop decides instead. */
  function stalledLimitMs(phase: RepPhase, autoStopFollows: boolean): number | null {
    if (!autoStopFollows || auto === null) return ms(config.stalledSec);
    if (START_BAND.has(phase)) return null;
    return ms(auto.stalledSec * config.stalledHandsFreeFraction);
  }

  return {
    reset,
    push,
    get fired() {
      return [...fired];
    },
    get lastForm() {
      return lastForm;
    },
  };
}
