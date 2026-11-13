// Workout session state machine (SPEC M1). Pure: every event carries its own timestamp.
import type { PlannedExercise, ProgramDay, SetLog } from './types';
import { fromUnit, snapToStep, toUnit, type Unit } from './units';

/** Rest may run this long past target before it counts as an overrun / triggers nudges. */
export const REST_OVERRUN_GRACE_SEC = 30;

export type SessionPhase = 'exercise' | 'rest' | 'summary';

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
  readonly weightKg: number;
  readonly setStartedAt: number;
  /** Rest before the current set, logged with it. */
  readonly lastRestTakenSec: number;
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
};

export type StartOptions = { unit?: Unit; lastWeightKg?: Record<string, number> };

export type SessionEvent =
  | { type: 'ADJUST'; field: 'reps' | 'weight'; delta: number }
  | { type: 'SET_DONE'; now: number }
  | { type: 'START_SET'; now: number }
  | { type: 'SKIP_EXERCISE'; now: number }
  | { type: 'PAUSE'; now: number }
  | { type: 'RESUME'; now: number }
  | { type: 'GO_TO_EXERCISE'; exIndex: number; now: number }
  | { type: 'FINISH'; now: number };

export type SessionSummary = {
  setsDone: number;
  totalVolumeKg: number;
  restOverruns: number;
  skipped: string[];
  durationSec: number;
};

const roundKg = (kg: number) => Math.round(kg * 100) / 100;

function planned(day: ProgramDay, exIndex: number): PlannedExercise {
  const p = day.exercises[exIndex];
  if (!p) throw new Error(`No exercise at index ${exIndex} in day ${day.id}`);
  return p;
}

const loggedFor = (s: Pick<SessionState, 'logs'>, exerciseId: string) =>
  s.logs.filter((l) => l.exerciseId === exerciseId);

/** Values for the next set of exercise `exIndex`: today's last set, else last time, else the plan. */
function defaultsFor(s: Pick<SessionState, 'logs' | 'unit' | 'lastWeightKg'>, p: PlannedExercise) {
  const last = loggedFor(s, p.exerciseId).at(-1);
  if (last) return { reps: last.reps, weightKg: last.weightKg };
  const weightKg = s.lastWeightKg[p.exerciseId] ?? snapToStep(p.startWeightKg ?? 0, s.unit);
  return { reps: p.targetReps[1], weightKg };
}

function isFinished(s: SessionState, exIndex: number): boolean {
  const p = planned(s.day, exIndex);
  return loggedFor(s, p.exerciseId).length >= p.sets;
}

/** Next exercise after `from` that is neither finished nor skipped, wrapping around; -1 if none. */
function nextUnfinished(s: SessionState, from: number): number {
  const n = s.day.exercises.length;
  for (let k = 1; k < n; k++) {
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
  return {
    sessionId,
    day,
    startedAt: now,
    endedAt: null,
    phase: 'exercise',
    exIndex: 0,
    setIndex: 0,
    ...defaultsFor({ logs: [], unit, lastWeightKg }, planned(day, 0)),
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
  };
}

export function currentPlanned(s: SessionState): PlannedExercise {
  return planned(s.day, s.exIndex);
}

export function restElapsedMs(s: SessionState, now: number): number {
  if (s.phase !== 'rest') return 0;
  return s.restAccumMs + (s.restRunningSince === null ? 0 : now - s.restRunningSince);
}

function toSummary(s: SessionState, now: number): SessionState {
  return { ...s, phase: 'summary', endedAt: now, paused: false, restRunningSince: null };
}

/** Move to the next unlogged set of exercise `exIndex`, or to summary when `exIndex` is -1. */
function goToExercise(s: SessionState, exIndex: number, now: number): SessionState {
  if (exIndex < 0) return toSummary(s, now);
  const p = planned(s.day, exIndex);
  return {
    ...s,
    exIndex,
    setIndex: loggedFor(s, p.exerciseId).length,
    ...defaultsFor(s, p),
  };
}

export function next(s: SessionState, e: SessionEvent): SessionState {
  if (s.phase === 'summary') return s;
  if (e.type === 'FINISH') return toSummary(s, e.now);

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

    case 'SET_DONE': {
      if (s.phase !== 'exercise') return s;
      const p = currentPlanned(s);
      const log: SetLog = {
        sessionId: s.sessionId,
        exerciseId: p.exerciseId,
        setIndex: s.setIndex,
        reps: s.reps,
        weightKg: s.weightKg,
        restTakenSec: s.lastRestTakenSec,
        startedAt: s.setStartedAt,
        endedAt: e.now,
      };
      const logged = { ...s, logs: [...s.logs, log] };
      const moved =
        s.setIndex + 1 < p.sets
          ? { ...logged, setIndex: s.setIndex + 1 } // keep reps/weight for the next set
          : goToExercise(logged, nextUnfinished(logged, s.exIndex), e.now);
      if (moved.phase === 'summary') return moved;
      return {
        ...moved,
        phase: 'rest',
        restTargetSec: p.restSec,
        restAccumMs: 0,
        restRunningSince: e.now,
      };
    }

    case 'START_SET': {
      if (s.phase !== 'rest') return s;
      const elapsedSec = restElapsedMs(s, e.now) / 1000;
      const overrun = elapsedSec > s.restTargetSec + REST_OVERRUN_GRACE_SEC;
      return {
        ...s,
        phase: 'exercise',
        setStartedAt: e.now,
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

    case 'SKIP_EXERCISE': {
      const skipped = [...s.skipped, currentPlanned(s).exerciseId];
      const withSkip = { ...s, skipped };
      const moved = goToExercise(withSkip, nextUnfinished(withSkip, s.exIndex), e.now);
      if (moved.phase === 'summary' || s.phase === 'rest') return moved;
      return { ...moved, setStartedAt: e.now, lastRestTakenSec: 0 };
    }
  }
}

export function summarize(s: SessionState): SessionSummary {
  const end = s.endedAt ?? s.startedAt;
  return {
    setsDone: s.logs.length,
    totalVolumeKg: roundKg(s.logs.reduce((v, l) => v + l.reps * l.weightKg, 0)),
    restOverruns: s.restOverruns,
    skipped: [...s.skipped],
    durationSec: Math.round((end - s.startedAt) / 1000),
  };
}
