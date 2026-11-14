// Live focus cues (SPEC M5, PROGRESS "M5 cue mechanics"). A pure per-frame tracker, fed like
// autoSet: every camera tick, after the rep counter (and autoSet), including ticks with no pose.
// No DOM, no clock: every time is passed in, on the camera frame clock.
//
// Focus rules (part 1, this file): rushed lowering and shrinking range judge each counted rep
// against the set's baseline (mean of the first `baselineReps` reps); stalled, out of frame and
// low fps are timers. Form rules (arms out of sync, raise too high, elbow drift, body swing, hips
// sag) are part 2 (task 5); their thresholds already live in the config.
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
import type { AutoSetConfig, AutoSetState } from './autoSet';
import type { ExerciseRule } from './exercises';
import type { RepPhase } from './repCounter';
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
  /** Part 2 (task 5): |left − right| angle (deg) held for armsOutOfSyncSec mid-rep. */
  armsOutOfSyncDeg: number;
  armsOutOfSyncSec: number;
  /** Part 2: a rep's maxAngle above this (deg; lateral raise). */
  raiseTooHighDeg: number;
  /** Part 2: upper arm swinging forward of the torso line by more than this (deg) in the lift. */
  elbowDriftDeg: number;
  /** Part 2: torso direction changing by more than this (deg) in the lift. */
  bodySwingDeg: number;
  /** Part 2: shoulder–hip–ankle angle below this (deg; side view only). */
  hipSagMinDeg: number;
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
  raiseTooHighDeg: 100,
  elbowDriftDeg: 25,
  bodySwingDeg: 15,
  hipSagMinDeg: 160,
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

/** Why the counter didn't track a frame (repCounter's `untracked` getter, M5 task 2). */
export type UntrackedReason = 'visibility' | 'posture' | 'bodyLine';

/** Per-side joint angles in the rule's angle space, before the EMA (repCounter `sideAngles`). */
export type SideAngles = { left: number | null; right: number | null };

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
  /** The landmark frame, for the geometry rules (part 2). */
  frame?: LandmarkFrame | null;
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

export function createFocusTracker(_rule: ExerciseRule, opts: FocusTrackerOptions): FocusTracker {
  const config: FocusConfig = { ...FOCUS_DEFAULTS, ...opts.config };
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
  let streak: Record<RepRule['id'], number> = { rushedLowering: 0, shrinkingRange: 0 };
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

  function resetSet(target: number): void {
    targetReps = target;
    reps = 0;
    baselineEvents = [];
    baseline = null;
    streak = { rushedLowering: 0, shrinkingRange: 0 };
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
  }

  const canFire = (id: FocusCueId) => on(id) && (fires[id] ?? 0) < config.maxFiresPerRule;

  /** Count a rep; fill the baseline or (when `judge`) advance the rep-rule streaks. */
  function seeRep(ev: RepEvent, judge: boolean): void {
    reps++;
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
    repDue = [];
    for (const r of REP_RULES) {
      const base = baseline[r.id];
      const threshold = base * r.ratio(config);
      const value = r.measure(ev);
      if (base > 0 && value < threshold) streak[r.id]++;
      else streak[r.id] = 0;
      if (streak[r.id] >= config.streakReps && canFire(r.id))
        repDue.push({ id: r.id, value, baseline: base, threshold });
    }
  }

  function fire(due: Due, t: number): FocusCue {
    fires[due.id] = (fires[due.id] ?? 0) + 1;
    fired.push(due.id);
    if (due.id === 'rushedLowering' || due.id === 'shrinkingRange') streak[due.id] = 0;
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

    let event = false;
    for (const ev of input.events) {
      event = true;
      if (ev.type === 'rep') seeRep(ev, !quiet);
    }
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
    // Form rules (part 2) go here, before the rep rules.
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
  };
}
