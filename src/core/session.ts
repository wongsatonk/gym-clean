// Workout session state machine (SPEC M1). Pure: every event carries its own timestamp.
import { FIRST_SIDE, isOneSided, otherSide } from './exercises/oneSided';
import { focusScore, isFocusCueId } from './focusScore';
import { isSetEffort } from './trainer/effortRules';
import type {
  FocusCueId,
  PlannedExercise,
  ProgramDay,
  SetEffort,
  SetLog,
  SideCount,
  WorkSide,
} from './types';
import { fromUnit, snapToStep, toUnit, type Unit } from './units';
import {
  isWarmup,
  warmupPlan,
  type WarmupKit,
  type WarmupLift,
  type WarmupRule,
  type WarmupSet,
  type WarmupStep,
} from './warmup';
import { WARMUP_RULES } from './warmupRules';

/** Rest may run this long past target before it counts as an overrun / triggers nudges. */
export const REST_OVERRUN_GRACE_SEC = 30;

export type SessionPhase = 'exercise' | 'rest' | 'summary';

/** M13b: the first side of a one-sided set once NEXT_SIDE has moved on from it. */
export type DoneSide = {
  readonly side: WorkSide;
  readonly reps: number;
  readonly partials: number;
  /** That side's SET_FOCUS cues (null = none arrived), joined with the second side's at SET_DONE. */
  readonly focusCues: readonly FocusCueId[] | null;
  /** When NEXT_SIDE switched (clamped to ≥ setStartedAt). */
  readonly at: number;
};

export type SessionState = {
  readonly sessionId: string;
  readonly day: ProgramDay;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly phase: SessionPhase;
  /** Position of the current set (phase "exercise") or the upcoming set (phase "rest"). */
  readonly exIndex: number;
  readonly setIndex: number;
  /** Editable values for the current/upcoming set. */
  readonly reps: number;
  /** Partial reps the rep counter saw in the current set (M4); logged only when > 0. */
  readonly partials: number;
  /**
   * M5 focus/form detections of the current set (SET_FOCUS); null = the set got no SET_FOCUS
   * (manual set), so it is logged without cues or a score. Cleared for every new set.
   */
  readonly focusCues: readonly FocusCueId[] | null;
  readonly weightKg: number;
  readonly setStartedAt: number;
  /** Rest before the current set, logged with it. */
  readonly lastRestTakenSec: number;
  /**
   * Rest: the current target (plan restSec + any EXTEND_REST). Exercise: the target of the rest
   * before this set, logged with it as `restTargetSec`; 0 = no rest before it (first set, or
   * reached by a mid-set skip), logged without one.
   */
  readonly restTargetSec: number;
  /** Rest clock: accumulated ms plus the running segment (null while paused / not resting). */
  readonly restAccumMs: number;
  readonly restRunningSince: number | null;
  readonly paused: boolean;
  readonly logs: readonly SetLog[];
  readonly skipped: readonly string[];
  readonly restOverruns: number;
  /** Display unit; weight ADJUST deltas are in this unit. Storage is always kg. */
  readonly unit: Unit;
  /** Weight used last session per exerciseId — preferred default over the plan. */
  readonly lastWeightKg: Readonly<Record<string, number>>;
  /**
   * M12 1b: exerciseId → the warm-up sets to run before its first working set (absent = none
   * anywhere). While one is up (`currentWarmup`), `reps` / `weightKg` hold its values, `setIndex`
   * stays 0 and SET_DONE logs it with `warmup: true`. SKIP_WARMUPS and REPLACE_UPCOMING drop an
   * entry.
   */
  readonly warmups?: Readonly<Record<string, readonly WarmupSet[]>>;
  /**
   * M13b: only for a one-sided exercise (exercises/oneSided.ts), absent for two-sided ones. The
   * side the current (exercise phase) or upcoming (rest) set is on: every set starts on
   * FIRST_SIDE; NEXT_SIDE moves it to the other. `reps` / `partials` / `focusCues` are this
   * side's.
   */
  readonly side?: WorkSide;
  /** M13b: the first side's counts once NEXT_SIDE moved on; absent before that. */
  readonly doneSide?: DoneSide;
};

export type StartOptions = {
  unit?: Unit;
  lastWeightKg?: Record<string, number>;
  /**
   * M12 1b warm-ups: the `trainerKit.warmups` rule, how each exercise is loaded
   * (warmup.ts `warmupLifts`), and kit steps from the gym profile (display unit). Left out or
   * `rule: 'off'` = no warm-up sets.
   */
  warmups?: { rule: WarmupRule; lifts: Readonly<Record<string, WarmupLift>>; kit?: WarmupKit };
};

export type SessionEvent =
  | { type: 'ADJUST'; field: 'reps' | 'weight'; delta: number }
  /**
   * `now` may be backdated (M5c hands-free: the end of the last rep). It is clamped to
   * ≥ `setStartedAt`, so a set never ends before it started.
   */
  | { type: 'SET_DONE'; now: number }
  /** Live count from the rep counter: overwrites reps/partials of the current set. */
  | { type: 'SET_COUNTED'; reps: number; partials: number }
  /**
   * M5 live trainer: every focus/form detection of the current set so far (one id per
   * detection, repeats included). Overwrites like SET_COUNTED; only in the exercise phase, not
   * paused. Unknown ids are dropped. SET_DONE then logs `cues` + `focusScore` (score only with
   * ≥ 1 rep); sets that never got a SET_FOCUS log neither.
   */
  | { type: 'SET_FOCUS'; cues: readonly FocusCueId[] }
  /**
   * M4c ground truth: fix the just-logged set's reps/partials on Rest (the camera's Set done
   * logs immediately). Ignored outside Rest, while paused, or with no logged set.
   */
  | {
      type: 'CORRECT_LAST_SET';
      reps: number;
      partials: number;
      /**
       * M13b: fix one side of a one-sided set (sets or adds that side; `reps` / `partials` then
       * become the lower side's). Ignored for a set logged without `sides`. Left out on a set with
       * `sides`: the numbers are the set's total and `sides` is dropped.
       */
      side?: WorkSide;
    }
  /**
   * M13b: one-sided exercise, first side done ("Next arm"): keep its reps/partials/cues and
   * count the other side from here (`reps` stays as a starting value, partials and cues reset).
   * Only in the exercise phase, not paused, on the first side. The rest clock is untouched: rest
   * starts at SET_DONE after the second side. `now` is clamped to ≥ `setStartedAt`.
   */
  | { type: 'NEXT_SIDE'; now: number }
  /**
   * M12 1b: the optional Easy / Good / Hard answer for the set just logged (`null` clears it).
   * Only on Rest, not paused, and only for the last logged set (`setIndex` must be its
   * `setIndex`, so a stale tap after the next set is ignored). Never during a set. Stored as
   * `effort` on that log; nothing else changes (advice.ts reads it).
   */
  | { type: 'SET_EFFORT'; setIndex: number; effort: SetEffort | null }
  /**
   * M5b coach "Apply": set the upcoming set's weight (kg, stored as given). Only on Rest, not
   * paused, and only while the upcoming exercise is `exerciseId` (a stale tap after a skip/jump
   * is ignored); non-finite or negative values are ignored. Logs are untouched; the weight then
   * carries over like any other.
   */
  | { type: 'APPLY_NEXT_WEIGHT'; exerciseId: string; weightKg: number }
  /**
   * `now` may be backdated (M5c hands-free: when the first rep left the start band). It is
   * clamped to ≥ the running rest segment start (`restRunningSince`), so a backdate across a
   * pause/resume can't make a negative segment or a start before the previous set's end.
   */
  | { type: 'START_SET'; now: number }
  /**
   * M4e "+30 s": raise `restTargetSec` by `sec` for the current rest only (the next rest starts
   * from the plan's restSec again). Only on Rest, not paused, finite `sec` > 0. The extra time
   * counts as planned rest (A-q3): START_SET's overrun check and the rest cues use the raised
   * target. The rest clock keeps running; `now` is informational.
   */
  | { type: 'EXTEND_REST'; sec: number; now: number }
  | { type: 'SKIP_EXERCISE'; now: number }
  /**
   * M12 1b: drop the warm-up sets still to do for the current / upcoming exercise and load its
   * first working set. Only while a warm-up is up (`currentWarmup`), not paused. During a set the
   * working set starts at `now`; on Rest the rest clock goes on. Warm-ups already logged stay.
   */
  | { type: 'SKIP_WARMUPS'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'GO_TO_EXERCISE'; exIndex: number; now: number }
  /**
   * M10 coach, mid-workout: replace (`planned`) or remove (`null`) the exercise at `exIndex` in
   * today's day. Accepted only when that exercise has no logged sets and it isn't the running set
   * (the current exercise in the exercise phase, paused or not). Accepted while paused (the Pause
   * sheet's coach): the pause, the rest clock and `setStartedAt` stay. A replacement must have
   * ≥ 1 set and must not already be elsewhere in the day. Indices stay right: removing before
   * the current exercise shifts `exIndex` down. On Rest, replacing the upcoming exercise loads
   * its defaults; removing it moves to the next unfinished one (summary at `now` if none).
   * The removed/replaced id leaves `skipped`. Logged sets are never touched.
   */
  | { type: 'REPLACE_UPCOMING'; exIndex: number; planned: PlannedExercise | null; now: number }
  /**
   * M10 mid-workout Undo of a removal: put an unstarted exercise back at `exIndex`
   * (0…length). Rejected when its id is already in the day or has logged sets today, or it has
   * no sets. Accepted mid-set, on Rest and while paused (the pause and rest clock stay).
   * Indices stay right: inserting at or before the current exercise shifts `exIndex` up, except
   * on Rest between exercises (the upcoming one has no logged sets) at exactly `exIndex`, where
   * the inserted exercise becomes the upcoming one and its defaults load (the Undo of removing
   * the upcoming exercise). The id leaves `skipped`. `now` is informational.
   */
  | { type: 'INSERT_UPCOMING'; exIndex: number; planned: PlannedExercise; now: number }
  | { type: 'FINISH'; now: number };

export type SessionSummary = {
  setsDone: number;
  totalVolumeKg: number;
  restOverruns: number;
  skipped: string[];
  durationSec: number;
};

const roundKg = (kg: number) => Math.round(kg * 100) / 100;

/** M13b: the side being worked, null for a two-sided exercise (or on Summary). */
export function currentSide(s: SessionState): WorkSide | null {
  return s.phase === 'summary' ? null : (s.side ?? null);
}

/**
 * M13b: the side a one-sided set is logged as (`SetLog.reps` / `partials`): fewer reps; on a
 * tie, more partials (the weaker side). Null when no side is recorded.
 */
export function lowerSide(sides: Partial<Record<WorkSide, SideCount>>): SideCount | null {
  let low: SideCount | null = null;
  for (const side of [FIRST_SIDE, otherSide(FIRST_SIDE)]) {
    const c = sides[side];
    if (!c) continue;
    if (!low || c.reps < low.reps || (c.reps === low.reps && c.partials > low.partials)) low = c;
  }
  return low ? { reps: low.reps, partials: low.partials } : null;
}

/**
 * M13b: `s` set up for a fresh set of `exerciseId`: on FIRST_SIDE with no done side for a
 * one-sided exercise; without either field for a two-sided one (so its state is as before).
 */
function freshSide(s: SessionState, exerciseId: string): SessionState {
  const rest: { -readonly [K in keyof SessionState]: SessionState[K] } = { ...s };
  delete rest.side;
  delete rest.doneSide;
  return isOneSided(exerciseId) ? { ...rest, side: FIRST_SIDE } : rest;
}

function planned(day: ProgramDay, exIndex: number): PlannedExercise {
  const p = day.exercises[exIndex];
  if (!p) throw new Error(`No exercise at index ${exIndex} in day ${day.id}`);
  return p;
}

/** Every log of the exercise, warm-ups included ("has it been started?"). */
const loggedFor = (s: Pick<SessionState, 'logs'>, exerciseId: string) =>
  s.logs.filter((l) => l.exerciseId === exerciseId);

/** The exercise's working sets: warm-ups (M12 1b) never count toward its planned sets. */
const workingFor = (s: Pick<SessionState, 'logs'>, exerciseId: string) =>
  s.logs.filter((l) => l.exerciseId === exerciseId && !isWarmup(l));

type Defaults = Pick<SessionState, 'logs' | 'unit' | 'lastWeightKg' | 'warmups'>;

/** The warm-up set that is next for exercise `p`, or null (none planned, all done, or working sets begun). */
function warmupFor(
  s: Pick<SessionState, 'logs' | 'warmups'>,
  p: PlannedExercise,
): WarmupStep | null {
  const ramp = s.warmups?.[p.exerciseId];
  if (!ramp) return null;
  const logs = loggedFor(s, p.exerciseId);
  const done = logs.filter(isWarmup).length;
  const set = ramp[done];
  if (!set || done < logs.length) return null;
  return { index: done, of: ramp.length, weightKg: set.weightKg, reps: set.reps };
}

const validKg = (kg: number | undefined): kg is number =>
  kg !== undefined && Number.isFinite(kg) && kg >= 0;

/**
 * Values for the next set of exercise `exIndex`: today's last set, else the plan's
 * `weightKgToday` (M10 lighter/deload, used exactly), else last time, else the plan.
 */
function workingDefaults(s: Defaults, p: PlannedExercise) {
  const last = workingFor(s, p.exerciseId).at(-1);
  if (last) return { reps: last.reps, partials: 0, focusCues: null, weightKg: last.weightKg };
  const weightKg = validKg(p.weightKgToday)
    ? p.weightKgToday
    : (s.lastWeightKg[p.exerciseId] ?? snapToStep(p.startWeightKg ?? 0, s.unit));
  return { reps: p.targetReps[1], partials: 0, focusCues: null, weightKg };
}

/** Values for the next set of `p`: its next warm-up set (M12 1b) while one is up, else `workingDefaults`. */
function defaultsFor(s: Defaults, p: PlannedExercise) {
  const w = warmupFor(s, p);
  if (w) return { reps: w.reps, partials: 0, focusCues: null, weightKg: w.weightKg };
  return workingDefaults(s, p);
}

function isFinished(s: SessionState, exIndex: number): boolean {
  const p = planned(s.day, exIndex);
  return workingFor(s, p.exerciseId).length >= p.sets;
}

/**
 * First exercise from `from + first` on that is neither finished nor skipped, wrapping around
 * (`first` 1 = after `from`, 0 = including it); -1 if none.
 */
function nextUnfinished(s: SessionState, from: number, first: 0 | 1 = 1): number {
  const n = s.day.exercises.length;
  for (let k = first; k < n; k++) {
    const i = (from + k) % n;
    if (!isFinished(s, i) && !s.skipped.includes(planned(s.day, i).exerciseId)) return i;
  }
  return -1;
}

export function startSession(
  day: ProgramDay,
  sessionId: string,
  now: number,
  opts: StartOptions = {},
): SessionState {
  const unit = opts.unit ?? 'kg';
  const lastWeightKg = { ...(opts.lastWeightKg ?? {}) };
  const base: Defaults = { logs: [], unit, lastWeightKg };
  const ramps = opts.warmups
    ? warmupPlan({
        day,
        rule: opts.warmups.rule,
        lifts: opts.warmups.lifts,
        workingKg: (p) => workingDefaults(base, p).weightKg,
        unit,
        ...(opts.warmups.kit ? { kit: opts.warmups.kit } : {}),
      })
    : {};
  const warmups = Object.keys(ramps).length > 0 ? { warmups: ramps } : {};
  const first = planned(day, 0);
  const state: SessionState = {
    sessionId,
    day,
    startedAt: now,
    endedAt: null,
    phase: 'exercise',
    exIndex: 0,
    setIndex: 0,
    ...defaultsFor({ ...base, ...warmups }, planned(day, 0)),
    setStartedAt: now,
    lastRestTakenSec: 0,
    restTargetSec: 0,
    restAccumMs: 0,
    restRunningSince: null,
    paused: false,
    logs: [],
    skipped: [],
    restOverruns: 0,
    unit,
    lastWeightKg,
    ...warmups,
  };
  return freshSide(state, first.exerciseId);
}

export function currentPlanned(s: SessionState): PlannedExercise {
  return planned(s.day, s.exIndex);
}

/**
 * M12 1b: the warm-up set that is running (phase "exercise") or up next (phase "rest"), with its
 * place in the ramp and its planned weight and reps; null for a working set and on Summary.
 */
export function currentWarmup(s: SessionState): WarmupStep | null {
  if (s.phase === 'summary' || !s.day.exercises[s.exIndex]) return null;
  return warmupFor(s, currentPlanned(s));
}

export function restElapsedMs(s: SessionState, now: number): number {
  if (s.phase !== 'rest') return 0;
  return s.restAccumMs + (s.restRunningSince === null ? 0 : now - s.restRunningSince);
}

/**
 * Score fields of a logged set: a camera set (has `cues`) with ≥ 1 rep gets
 * focusScore(cues, partials); otherwise no score. Mutates `log`.
 */
function applyScore(log: SetLog): void {
  if (log.cues && log.reps >= 1) log.focusScore = focusScore(log.cues, log.partials ?? 0);
  else delete log.focusScore;
}

function toSummary(s: SessionState, now: number): SessionState {
  return { ...s, phase: 'summary', endedAt: now, paused: false, restRunningSince: null };
}

/** Move to the next unlogged set of exercise `exIndex`, or to summary when `exIndex` is -1. */
function goToExercise(s: SessionState, exIndex: number, now: number): SessionState {
  if (exIndex < 0) return toSummary(s, now);
  const p = planned(s.day, exIndex);
  const moved: SessionState = {
    ...s,
    exIndex,
    setIndex: workingFor(s, p.exerciseId).length,
    ...defaultsFor(s, p),
  };
  return freshSide(moved, p.exerciseId);
}

/**
 * CORRECT_LAST_SET: fix the most recent logged set (Rest, or Summary for the workout's final
 * set). Never paused here: the paused branch and toSummary handle that.
 */
function correctLast(
  s: SessionState,
  e: Extract<SessionEvent, { type: 'CORRECT_LAST_SET' }>,
): SessionState {
  const last = s.logs.at(-1);
  if (!last) return s;
  if (!Number.isFinite(e.reps) || !Number.isFinite(e.partials)) return s;
  if (e.side !== undefined && !last.sides) return s;
  const count = {
    reps: Math.max(0, Math.round(e.reps)),
    partials: Math.max(0, Math.round(e.partials)),
  };
  const fixed: SetLog = { ...last };
  if (e.side !== undefined && last.sides) {
    fixed.sides = { ...last.sides, [e.side]: count };
  } else {
    delete fixed.sides;
  }
  const { reps, partials } = (fixed.sides && lowerSide(fixed.sides)) ?? count;
  fixed.reps = reps;
  if (partials > 0) fixed.partials = partials;
  else delete fixed.partials;
  applyScore(fixed);
  // Reps carry over to the next set of the same exercise, so carry the corrected value
  // (not from a warm-up set: the set after it has its own reps).
  const sameExercise = !isWarmup(last) && currentPlanned(s).exerciseId === last.exerciseId;
  return {
    ...s,
    logs: [...s.logs.slice(0, -1), fixed],
    ...(sameExercise ? { reps } : {}),
  };
}

/** REPLACE_UPCOMING (never on Summary here; may be paused). Returns `s` itself when rejected. */
function replaceUpcoming(
  s: SessionState,
  e: Extract<SessionEvent, { type: 'REPLACE_UPCOMING' }>,
): SessionState {
  const exercises = s.day.exercises;
  const old = exercises[e.exIndex];
  if (!Number.isInteger(e.exIndex) || !old) return s;
  if (s.phase === 'exercise' && e.exIndex === s.exIndex) return s;
  if (loggedFor(s, old.exerciseId).length > 0) return s;
  const p = e.planned;
  if (p) {
    if (!validSets(p)) return s;
    if (exercises.some((x, i) => i !== e.exIndex && x.exerciseId === p.exerciseId)) return s;
  }

  const day: ProgramDay = {
    ...s.day,
    exercises: p
      ? exercises.map((x, i) => (i === e.exIndex ? { ...p } : x))
      : exercises.filter((_, i) => i !== e.exIndex),
  };
  const skipped = s.skipped.filter((id) => id !== old.exerciseId);
  const base = { ...withoutWarmups(s, old.exerciseId), day, skipped };

  if (e.exIndex !== s.exIndex) {
    // Not the current/upcoming exercise: only its position may shift the current index.
    const shift = !p && e.exIndex < s.exIndex ? 1 : 0;
    return { ...base, exIndex: s.exIndex - shift };
  }
  // Rest, upcoming exercise (0 logged sets): reload its defaults or move on.
  if (p) return goToExercise(base, e.exIndex, e.now);
  if (day.exercises.length === 0) return toSummary(base, e.now);
  const at = e.exIndex % day.exercises.length;
  return goToExercise({ ...base, exIndex: at }, nextUnfinished(base, at, 0), e.now);
}

/** `s` without the warm-up ramp of `exerciseId` (the same object when it has none). */
function withoutWarmups(s: SessionState, exerciseId: string): SessionState {
  if (!s.warmups || !(exerciseId in s.warmups)) return s;
  const warmups = Object.fromEntries(Object.entries(s.warmups).filter(([id]) => id !== exerciseId));
  return { ...s, warmups };
}

const validSets = (p: PlannedExercise) => Number.isInteger(p.sets) && p.sets >= 1;

/** INSERT_UPCOMING (never on Summary here; may be paused). Returns `s` itself when rejected. */
function insertUpcoming(
  s: SessionState,
  e: Extract<SessionEvent, { type: 'INSERT_UPCOMING' }>,
): SessionState {
  const exercises = s.day.exercises;
  const at = e.exIndex;
  const p = e.planned;
  if (!Number.isInteger(at) || at < 0 || at > exercises.length) return s;
  if (!p || !validSets(p)) return s;
  if (exercises.some((x) => x.exerciseId === p.exerciseId)) return s;
  if (loggedFor(s, p.exerciseId).length > 0) return s;

  const day: ProgramDay = {
    ...s.day,
    exercises: [...exercises.slice(0, at), { ...p }, ...exercises.slice(at)],
  };
  const skipped = s.skipped.filter((id) => id !== p.exerciseId);
  const base = { ...s, day, skipped };
  if (at > s.exIndex) return base;
  const betweenExercises =
    s.phase === 'rest' && loggedFor(s, currentPlanned(s).exerciseId).length === 0;
  if (at === s.exIndex && betweenExercises) return goToExercise(base, at, e.now);
  return { ...base, exIndex: s.exIndex + 1 };
}

export function next(s: SessionState, e: SessionEvent): SessionState {
  if (s.phase === 'summary') return e.type === 'CORRECT_LAST_SET' ? correctLast(s, e) : s;
  if (e.type === 'FINISH') return toSummary(s, e.now);

  // The coach may change upcoming rows from the Pause sheet; the pause itself stays.
  if (e.type === 'REPLACE_UPCOMING') return replaceUpcoming(s, e);
  if (e.type === 'INSERT_UPCOMING') return insertUpcoming(s, e);

  if (s.paused) {
    if (e.type !== 'RESUME') return s;
    return { ...s, paused: false, restRunningSince: s.phase === 'rest' ? e.now : null };
  }

  switch (e.type) {
    case 'RESUME':
      return s;

    case 'PAUSE':
      return {
        ...s,
        paused: true,
        restAccumMs: restElapsedMs(s, e.now),
        restRunningSince: null,
      };

    case 'ADJUST': {
      if (s.phase !== 'exercise') return s;
      return e.field === 'reps'
        ? { ...s, reps: Math.max(0, Math.round(s.reps + e.delta)) }
        : {
            ...s,
            weightKg: Math.max(
              0,
              fromUnit(Math.round((toUnit(s.weightKg, s.unit) + e.delta) * 100) / 100, s.unit),
            ),
          };
    }

    case 'SET_COUNTED': {
      if (s.phase !== 'exercise') return s;
      return {
        ...s,
        // A non-finite count (NaN/Infinity) must not poison state: keep reps, zero partials.
        reps: Number.isFinite(e.reps) ? Math.max(0, Math.round(e.reps)) : s.reps,
        partials: Number.isFinite(e.partials) ? Math.max(0, Math.round(e.partials)) : 0,
      };
    }

    case 'SET_FOCUS': {
      if (s.phase !== 'exercise' || !Array.isArray(e.cues)) return s;
      return { ...s, focusCues: e.cues.filter(isFocusCueId) };
    }

    case 'CORRECT_LAST_SET':
      return s.phase === 'rest' ? correctLast(s, e) : s;

    case 'SET_EFFORT': {
      const last = s.logs.at(-1);
      if (s.phase !== 'rest' || !last || last.setIndex !== e.setIndex || isWarmup(last)) return s;
      if (e.effort !== null && !isSetEffort(e.effort)) return s;
      const fixed: SetLog = { ...last };
      if (e.effort === null) delete fixed.effort;
      else fixed.effort = e.effort;
      return { ...s, logs: [...s.logs.slice(0, -1), fixed] };
    }

    case 'APPLY_NEXT_WEIGHT':
      if (s.phase !== 'rest' || currentPlanned(s).exerciseId !== e.exerciseId) return s;
      if (!Number.isFinite(e.weightKg) || e.weightKg < 0) return s;
      return { ...s, weightKg: e.weightKg };

    case 'EXTEND_REST':
      if (s.phase !== 'rest' || !Number.isFinite(e.sec) || e.sec <= 0) return s;
      return { ...s, restTargetSec: s.restTargetSec + e.sec };

    case 'NEXT_SIDE': {
      if (s.phase !== 'exercise' || s.side === undefined || s.doneSide) return s;
      const doneSide: DoneSide = {
        side: s.side,
        reps: s.reps,
        partials: s.partials,
        focusCues: s.focusCues,
        at: Math.max(e.now, s.setStartedAt),
      };
      return { ...s, side: otherSide(s.side), doneSide, partials: 0, focusCues: null };
    }

    case 'SET_DONE': {
      if (s.phase !== 'exercise') return s;
      const now = Math.max(e.now, s.setStartedAt);
      const p = currentPlanned(s);
      const warm = warmupFor(s, p);
      const sides = setSides(s);
      const count = (sides && lowerSide(sides)) ?? { reps: s.reps, partials: s.partials };
      const cues = setCues(s);
      const log: SetLog = {
        sessionId: s.sessionId,
        exerciseId: p.exerciseId,
        // A warm-up set is numbered within the ramp; working sets start at 0 after it.
        setIndex: warm ? warm.index : s.setIndex,
        reps: count.reps,
        ...(count.partials > 0 ? { partials: count.partials } : {}),
        weightKg: s.weightKg,
        restTakenSec: s.lastRestTakenSec,
        ...(s.restTargetSec > 0 ? { restTargetSec: s.restTargetSec } : {}),
        ...(cues ? { cues } : {}),
        ...(warm ? { warmup: true as const } : {}),
        ...(sides ? { sides } : {}),
        startedAt: s.setStartedAt,
        endedAt: now,
      };
      applyScore(log);
      const logged = { ...s, logs: [...s.logs, log] };
      const moved = warm
        ? goToExercise(logged, s.exIndex, now) // the next warm-up, or working set 1 with its own values
        : s.setIndex + 1 < p.sets
          ? freshSide(
              // keep reps/weight for the next set (a one-sided set's logged, lower reps)
              {
                ...logged,
                setIndex: s.setIndex + 1,
                reps: count.reps,
                partials: 0,
                focusCues: null,
              },
              p.exerciseId,
            )
          : goToExercise(logged, nextUnfinished(logged, s.exIndex), now);
      if (moved.phase === 'summary') return moved;
      return {
        ...moved,
        phase: 'rest',
        restTargetSec: warm ? Math.min(p.restSec, WARMUP_RULES.restSec) : p.restSec,
        restAccumMs: 0,
        restRunningSince: now,
      };
    }

    case 'START_SET': {
      if (s.phase !== 'rest') return s;
      const now = s.restRunningSince === null ? e.now : Math.max(e.now, s.restRunningSince);
      const elapsedSec = restElapsedMs(s, now) / 1000;
      const overrun = elapsedSec > s.restTargetSec + REST_OVERRUN_GRACE_SEC;
      return {
        ...s,
        phase: 'exercise',
        setStartedAt: now,
        lastRestTakenSec: Math.round(elapsedSec),
        restAccumMs: 0,
        restRunningSince: null,
        restOverruns: s.restOverruns + (overrun ? 1 : 0),
      };
    }

    case 'GO_TO_EXERCISE': {
      const target = s.day.exercises[e.exIndex];
      if (!target || e.exIndex === s.exIndex || isFinished(s, e.exIndex)) return s;
      const skipped = s.skipped.filter((id) => id !== target.exerciseId);
      const moved = goToExercise({ ...s, skipped }, e.exIndex, e.now);
      return s.phase === 'rest' ? moved : { ...moved, setStartedAt: e.now };
    }

    case 'SKIP_WARMUPS': {
      if (!currentWarmup(s)) return s;
      const moved = goToExercise(withoutWarmups(s, currentPlanned(s).exerciseId), s.exIndex, e.now);
      return s.phase === 'rest' ? moved : { ...moved, setStartedAt: e.now };
    }

    case 'SKIP_EXERCISE': {
      const skipped = [...s.skipped, currentPlanned(s).exerciseId];
      const withSkip = { ...s, skipped };
      const moved = goToExercise(withSkip, nextUnfinished(withSkip, s.exIndex), e.now);
      if (moved.phase === 'summary' || s.phase === 'rest') return moved;
      return { ...moved, setStartedAt: e.now, lastRestTakenSec: 0, restTargetSec: 0 };
    }
  }
}

/** M13b: the per-side counts of a one-sided set being logged; undefined for a two-sided one. */
function setSides(s: SessionState): Partial<Record<WorkSide, SideCount>> | undefined {
  if (s.side === undefined) return undefined;
  const sides: Partial<Record<WorkSide, SideCount>> = {};
  if (s.doneSide) sides[s.doneSide.side] = { reps: s.doneSide.reps, partials: s.doneSide.partials };
  sides[s.side] = { reps: s.reps, partials: s.partials };
  return sides;
}

/** The set's cues: both sides' SET_FOCUS cues joined (M13b), null when neither side got any. */
function setCues(s: SessionState): FocusCueId[] | null {
  const first = s.doneSide?.focusCues ?? null;
  if (!first && !s.focusCues) return null;
  return [...(first ?? []), ...(s.focusCues ?? [])];
}

export function summarize(s: SessionState): SessionSummary {
  const end = s.endedAt ?? s.startedAt;
  const working = s.logs.filter((l) => !isWarmup(l)); // warm-ups (M12 1b) are not sets or volume
  return {
    setsDone: working.length,
    totalVolumeKg: roundKg(working.reduce((v, l) => v + l.reps * l.weightKg, 0)),
    restOverruns: s.restOverruns,
    skipped: [...s.skipped],
    durationSec: Math.round((end - s.startedAt) / 1000),
  };
}
