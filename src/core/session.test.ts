import { describe, expect, it } from 'vitest';
import type { FocusCueId, PlannedExercise, ProgramDay } from './types';
import {
  REST_OVERRUN_GRACE_SEC,
  currentPlanned,
  currentSide,
  currentWarmup,
  lowerSide,
  next,
  restElapsedMs,
  startSession,
  summarize,
  type SessionEvent,
  type SessionState,
} from './session';
import { formatWeight, toUnit } from './units';

const exA: PlannedExercise = {
  exerciseId: 'A',
  sets: 2,
  targetReps: [8, 12],
  restSec: 60,
  startWeightKg: 20,
  tracking: 'manual',
};
const exC: PlannedExercise = {
  exerciseId: 'C',
  sets: 1,
  targetReps: [5, 5],
  restSec: 120,
  tracking: 'manual',
};

const day: ProgramDay = {
  id: 'test',
  name: 'Test Day',
  exercises: [
    exA,
    {
      exerciseId: 'B',
      sets: 1,
      targetReps: [10, 15],
      restSec: 90,
      startWeightKg: 10,
      tracking: 'pose',
    },
    exC,
  ],
};

const T0 = 1_000_000;
const sec = (s: number) => T0 + s * 1000;

function run(state: SessionState, ...events: SessionEvent[]): SessionState {
  return events.reduce(next, state);
}

const fresh = () => startSession(day, 's1', T0);

describe('startSession', () => {
  it('starts on the first set of the first exercise with planned defaults', () => {
    const s = fresh();
    expect(s.phase).toBe('exercise');
    expect(s.exIndex).toBe(0);
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(12);
    expect(s.weightKg).toBe(20);
    expect(s.setStartedAt).toBe(T0);
    expect(s.lastRestTakenSec).toBe(0);
    expect(currentPlanned(s).exerciseId).toBe('A');
  });

  it('defaults weight to 0 when the plan has none', () => {
    const s = startSession({ ...day, exercises: [exC] }, 's', T0);
    expect(s.weightKg).toBe(0);
  });
});

describe('ADJUST', () => {
  it('changes reps and weight, clamped at zero', () => {
    let s = run(fresh(), { type: 'ADJUST', field: 'reps', delta: -1 });
    expect(s.reps).toBe(11);
    s = run(s, { type: 'ADJUST', field: 'weight', delta: 2.5 });
    expect(s.weightKg).toBe(22.5);
    s = run(s, { type: 'ADJUST', field: 'weight', delta: -100 });
    expect(s.weightKg).toBe(0);
    s = run(
      s,
      ...Array.from({ length: 20 }, () => ({ type: 'ADJUST', field: 'reps', delta: -1 }) as const),
    );
    expect(s.reps).toBe(0);
  });

  it('avoids floating point drift on weight', () => {
    let s = startSession({ ...day, exercises: [{ ...exA, startWeightKg: 0 }] }, 's', T0);
    for (let i = 0; i < 3; i++) s = next(s, { type: 'ADJUST', field: 'weight', delta: 0.1 });
    expect(s.weightKg).toBe(0.3);
  });

  it('is ignored during rest', () => {
    const s = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    expect(next(s, { type: 'ADJUST', field: 'reps', delta: 1 })).toBe(s);
  });
});

describe('SET_DONE', () => {
  it('logs the set and starts rest for the next set of the same exercise', () => {
    const s = run(
      fresh(),
      { type: 'ADJUST', field: 'reps', delta: -2 },
      { type: 'SET_DONE', now: sec(40) },
    );
    expect(s.logs).toEqual([
      {
        sessionId: 's1',
        exerciseId: 'A',
        setIndex: 0,
        reps: 10,
        weightKg: 20,
        restTakenSec: 0,
        startedAt: T0,
        endedAt: sec(40),
      },
    ]);
    expect(s.phase).toBe('rest');
    expect(s.restTargetSec).toBe(60);
    expect(s.exIndex).toBe(0);
    expect(s.setIndex).toBe(1);
    expect(s.reps).toBe(10); // carried forward
    expect(s.weightKg).toBe(20);
  });

  it('after the last set of an exercise, rests then moves to the next exercise with its defaults', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(s.phase).toBe('rest');
    expect(s.restTargetSec).toBe(60); // rest uses the exercise just finished
    expect(s.exIndex).toBe(1);
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(15);
    expect(s.weightKg).toBe(10);
  });

  it('goes to summary after the final set, without a rest', () => {
    const s = startSession({ ...day, exercises: [exC] }, 's', T0);
    const done = next(s, { type: 'SET_DONE', now: sec(20) });
    expect(done.phase).toBe('summary');
    expect(done.endedAt).toBe(sec(20));
    expect(done.logs).toHaveLength(1);
  });
});

describe('rest timing and START_SET', () => {
  it('measures elapsed rest and records it on the next logged set', () => {
    let s = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    expect(restElapsedMs(s, sec(75))).toBe(45_000);
    s = run(s, { type: 'START_SET', now: sec(95.4) });
    expect(s.phase).toBe('exercise');
    expect(s.lastRestTakenSec).toBe(65);
    expect(s.setStartedAt).toBe(sec(95.4));
    expect(restElapsedMs(s, sec(200))).toBe(0);
    s = run(s, { type: 'SET_DONE', now: sec(130) });
    expect(s.logs[1]).toMatchObject({ setIndex: 1, restTakenSec: 65, startedAt: sec(95.4) });
  });

  it('counts an overrun only when rest exceeds target + grace', () => {
    const target = 60 + REST_OVERRUN_GRACE_SEC;
    const onTime = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'START_SET', now: sec(target) },
    );
    expect(onTime.restOverruns).toBe(0);
    const late = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'START_SET', now: sec(target + 1) },
    );
    expect(late.restOverruns).toBe(1);
  });

  it('START_SET is ignored outside rest', () => {
    const s = fresh();
    expect(next(s, { type: 'START_SET', now: sec(5) })).toBe(s);
  });
});

describe('PAUSE / RESUME', () => {
  it('freezes the rest clock while paused', () => {
    let s = run(fresh(), { type: 'SET_DONE', now: sec(0) }, { type: 'PAUSE', now: sec(20) });
    expect(s.paused).toBe(true);
    expect(restElapsedMs(s, sec(500))).toBe(20_000);
    s = run(s, { type: 'RESUME', now: sec(500) });
    expect(s.paused).toBe(false);
    expect(restElapsedMs(s, sec(510))).toBe(30_000);
    s = run(s, { type: 'START_SET', now: sec(540) });
    expect(s.lastRestTakenSec).toBe(60);
    expect(s.restOverruns).toBe(0);
  });

  it('ignores workout events while paused, and double pause/resume', () => {
    const paused = run(fresh(), { type: 'PAUSE', now: sec(5) });
    expect(next(paused, { type: 'SET_DONE', now: sec(6) })).toBe(paused);
    expect(next(paused, { type: 'ADJUST', field: 'reps', delta: 1 })).toBe(paused);
    expect(next(paused, { type: 'SKIP_EXERCISE', now: sec(6) })).toBe(paused);
    expect(next(paused, { type: 'PAUSE', now: sec(7) })).toBe(paused);
    const s = fresh();
    expect(next(s, { type: 'RESUME', now: sec(1) })).toBe(s);
  });

  it('pausing mid-set keeps the exercise phase', () => {
    const s = run(fresh(), { type: 'PAUSE', now: sec(5) }, { type: 'RESUME', now: sec(50) });
    expect(s.phase).toBe('exercise');
    expect(s.paused).toBe(false);
  });
});

describe('SKIP_EXERCISE', () => {
  it('during a set, jumps straight to the next exercise', () => {
    const s = run(fresh(), { type: 'SKIP_EXERCISE', now: sec(10) });
    expect(s.phase).toBe('exercise');
    expect(currentPlanned(s).exerciseId).toBe('B');
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(15);
    expect(s.setStartedAt).toBe(sec(10));
    expect(s.lastRestTakenSec).toBe(0);
    expect(s.skipped).toEqual(['A']);
  });

  it('during rest, skips the upcoming exercise and keeps resting', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'SKIP_EXERCISE', now: sec(10) },
    );
    expect(s.phase).toBe('rest');
    expect(currentPlanned(s).exerciseId).toBe('B');
    expect(s.skipped).toEqual(['A']);
    expect(restElapsedMs(s, sec(15))).toBe(15_000);
  });

  it('skipping the last exercise ends the session', () => {
    const s = run(
      fresh(),
      { type: 'SKIP_EXERCISE', now: sec(1) },
      { type: 'SKIP_EXERCISE', now: sec(2) },
      { type: 'SKIP_EXERCISE', now: sec(3) },
    );
    expect(s.phase).toBe('summary');
    expect(s.skipped).toEqual(['A', 'B', 'C']);
    expect(s.endedAt).toBe(sec(3));
  });
});

describe('FINISH and summary', () => {
  it('ends early from any phase, even paused', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'PAUSE', now: sec(40) },
      { type: 'FINISH', now: sec(60) },
    );
    expect(s.phase).toBe('summary');
    expect(s.paused).toBe(false);
    expect(s.endedAt).toBe(sec(60));
  });

  it('ignores all events after summary', () => {
    const s = run(fresh(), { type: 'FINISH', now: sec(1) });
    for (const e of [
      { type: 'SET_DONE', now: sec(2) },
      { type: 'START_SET', now: sec(2) },
      { type: 'PAUSE', now: sec(2) },
      { type: 'FINISH', now: sec(9) },
    ] as const) {
      expect(next(s, e)).toBe(s);
    }
  });

  it('summarizes sets, volume, overruns, skipped and duration', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) }, // A: 12 × 20
      { type: 'START_SET', now: sec(200) }, // overrun (170 s > 90 s)
      { type: 'ADJUST', field: 'reps', delta: -4 },
      { type: 'SET_DONE', now: sec(230) }, // A: 8 × 20
      { type: 'START_SET', now: sec(280) },
      { type: 'SKIP_EXERCISE', now: sec(285) }, // skip B
      { type: 'SET_DONE', now: sec(300) }, // C: 5 × 0
    );
    expect(s.phase).toBe('summary');
    expect(summarize(s)).toEqual({
      setsDone: 3,
      totalVolumeKg: 400,
      restOverruns: 1,
      skipped: ['B'],
      durationSec: 300,
    });
  });
});

describe('units and defaults (M1b)', () => {
  it('uses last time’s weight as the default, exactly', () => {
    const s = startSession(day, 's', T0, { lastWeightKg: { A: 23.75 } });
    expect(s.weightKg).toBe(23.75);
  });

  it('snaps planned start weights to the step of the chosen unit', () => {
    const s = startSession(day, 's', T0, { unit: 'lb' });
    expect(s.unit).toBe('lb');
    expect(toUnit(s.weightKg, 'lb')).toBeCloseTo(45, 6); // 20 kg -> 45 lb
  });

  it('steps weight in the display unit without drift', () => {
    let s = startSession(day, 's', T0, { unit: 'lb' });
    for (let i = 0; i < 20; i++) s = next(s, { type: 'ADJUST', field: 'weight', delta: 5 });
    expect(toUnit(s.weightKg, 'lb')).toBeCloseTo(145, 6);
    expect(formatWeight(s.weightKg, 'lb')).toBe('145');
  });
});

describe('GO_TO_EXERCISE and wrap-around (M1b)', () => {
  it('jumps to another exercise mid-set with its defaults', () => {
    const s = run(fresh(), { type: 'GO_TO_EXERCISE', exIndex: 2, now: sec(10) });
    expect(s.phase).toBe('exercise');
    expect(currentPlanned(s).exerciseId).toBe('C');
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(5);
    expect(s.setStartedAt).toBe(sec(10));
  });

  it('during rest, changes the upcoming exercise and keeps resting', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(5) },
    );
    expect(s.phase).toBe('rest');
    expect(currentPlanned(s).exerciseId).toBe('B');
    expect(restElapsedMs(s, sec(20))).toBe(20_000);
  });

  it('ignores jumps to the current, a finished or a missing exercise', () => {
    const s = fresh();
    expect(next(s, { type: 'GO_TO_EXERCISE', exIndex: 0, now: sec(1) })).toBe(s);
    expect(next(s, { type: 'GO_TO_EXERCISE', exIndex: 9, now: sec(1) })).toBe(s);
    const bDone = run(
      s,
      { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(1) },
      { type: 'SET_DONE', now: sec(2) },
      { type: 'START_SET', now: sec(3) },
    );
    expect(next(bDone, { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(4) })).toBe(bDone);
  });

  it('wraps around to unfinished exercises and resumes at the next set, with today’s values', () => {
    let s = run(
      fresh(),
      { type: 'ADJUST', field: 'reps', delta: -3 }, // A set 1: 9 reps
      { type: 'SET_DONE', now: sec(10) }, // A 1/2 done
      { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(20) }, // upcoming B
      { type: 'START_SET', now: sec(60) },
      { type: 'SET_DONE', now: sec(90) }, // B done -> next unfinished after B is C
    );
    expect(currentPlanned(s).exerciseId).toBe('C');
    s = run(s, { type: 'START_SET', now: sec(150) }, { type: 'SET_DONE', now: sec(170) }); // C done -> wrap to A
    expect(s.phase).toBe('rest');
    expect(currentPlanned(s).exerciseId).toBe('A');
    expect(s.setIndex).toBe(1);
    expect(s.reps).toBe(9);
    expect(s.weightKg).toBe(20);
    s = run(s, { type: 'START_SET', now: sec(250) }, { type: 'SET_DONE', now: sec(280) });
    expect(s.phase).toBe('summary');
    expect(s.logs.map((l) => `${l.exerciseId}${l.setIndex}`)).toEqual(['A0', 'B0', 'C0', 'A1']);
  });

  it('a jump un-skips an exercise', () => {
    const s = run(
      fresh(),
      { type: 'SKIP_EXERCISE', now: sec(1) },
      { type: 'GO_TO_EXERCISE', exIndex: 0, now: sec(2) },
    );
    expect(s.skipped).toEqual([]);
    expect(currentPlanned(s).exerciseId).toBe('A');
  });

  it('skipped exercises are not wrapped back to', () => {
    const s = run(
      fresh(),
      { type: 'SKIP_EXERCISE', now: sec(1) }, // skip A -> B
      { type: 'SET_DONE', now: sec(2) }, // B done -> C
      { type: 'START_SET', now: sec(3) },
      { type: 'SET_DONE', now: sec(4) }, // C done -> nothing unfinished except skipped A
    );
    expect(s.phase).toBe('summary');
  });
});

describe('SET_COUNTED from the rep counter (M4)', () => {
  const counted = (reps: number, partials: number): SessionEvent => ({
    type: 'SET_COUNTED',
    reps,
    partials,
  });

  it('starts every session with 0 partials', () => {
    expect(fresh().partials).toBe(0);
  });

  it('overwrites reps and partials during a set', () => {
    const s = run(fresh(), counted(3, 1), counted(5, 2));
    expect(s.reps).toBe(5);
    expect(s.partials).toBe(2);
  });

  it('rounds and clamps counts to whole non-negative numbers', () => {
    const s = run(fresh(), counted(-2, -1));
    expect(s.reps).toBe(0);
    expect(s.partials).toBe(0);
  });

  it('rounds fractional counts to the nearest whole number', () => {
    const s = run(fresh(), counted(4.6, 1.4));
    expect(s.reps).toBe(5);
    expect(s.partials).toBe(1);
  });

  it('ignores non-finite counts: keeps the current reps, partials fall back to 0', () => {
    const before = run(fresh(), counted(6, 2));
    for (const bad of [NaN, Infinity, -Infinity]) {
      const s = run(before, counted(bad, bad));
      expect(s.reps).toBe(6);
      expect(s.partials).toBe(0);
    }
    const mixed = run(before, counted(7, NaN));
    expect(mixed.reps).toBe(7);
    expect(mixed.partials).toBe(0);
  });

  it('is ignored during rest', () => {
    const resting = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    expect(run(resting, counted(4, 2))).toBe(resting);
  });

  it('is ignored while paused, in either phase', () => {
    const paused = run(fresh(), { type: 'PAUSE', now: sec(5) });
    expect(run(paused, counted(4, 2))).toBe(paused);
    const pausedRest = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'PAUSE', now: sec(35) },
    );
    expect(run(pausedRest, counted(4, 2))).toBe(pausedRest);
  });

  it('is ignored after summary', () => {
    const done = run(fresh(), { type: 'FINISH', now: sec(5) });
    expect(run(done, counted(4, 2))).toBe(done);
  });

  it('still lets the stepper correct the counted reps', () => {
    const s = run(fresh(), counted(9, 0), { type: 'ADJUST', field: 'reps', delta: 1 });
    expect(s.reps).toBe(10);
    const logged = run(s, { type: 'SET_DONE', now: sec(30) });
    expect(logged.logs[0]?.reps).toBe(10);
  });

  it('logs partials with the set when there were any', () => {
    const s = run(fresh(), counted(8, 2), { type: 'SET_DONE', now: sec(30) });
    expect(s.logs[0]).toMatchObject({ reps: 8, partials: 2 });
  });

  it('leaves partials out of the log when there were none', () => {
    const s = run(fresh(), counted(8, 0), { type: 'SET_DONE', now: sec(30) });
    expect(s.logs[0]).not.toHaveProperty('partials');
  });

  it('resets partials for the next set but keeps the counted reps as its default', () => {
    const s = run(fresh(), counted(8, 2), { type: 'SET_DONE', now: sec(30) });
    expect(s.partials).toBe(0);
    expect(s.reps).toBe(8);
    const nextSet = run(s, { type: 'START_SET', now: sec(90) });
    expect(nextSet.partials).toBe(0);
    const logged = run(nextSet, { type: 'SET_DONE', now: sec(120) });
    expect(logged.logs[1]).not.toHaveProperty('partials');
  });

  it('resets partials when moving to another exercise by skip or jump', () => {
    const skipped = run(fresh(), counted(3, 1), { type: 'SKIP_EXERCISE', now: sec(10) });
    expect(skipped.partials).toBe(0);
    const jumped = run(fresh(), counted(3, 1), {
      type: 'GO_TO_EXERCISE',
      exIndex: 2,
      now: sec(10),
    });
    expect(jumped.partials).toBe(0);
  });
});

describe('CORRECT_LAST_SET on Rest (M4c)', () => {
  const correct = (reps: number, partials: number): SessionEvent => ({
    type: 'CORRECT_LAST_SET',
    reps,
    partials,
  });
  // A camera set: counted 10 reps + 1 partial, then Set done → Rest.
  const counted = () =>
    run(
      fresh(),
      { type: 'SET_COUNTED', reps: 10, partials: 1 },
      { type: 'SET_DONE', now: sec(40) },
    );

  it('corrects the just-logged set while resting', () => {
    const s = run(counted(), correct(12, 0));
    expect(s.phase).toBe('rest');
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0]).toMatchObject({ exerciseId: 'A', setIndex: 0, reps: 12 });
    expect(s.logs[0]).not.toHaveProperty('partials');
    const again = run(s, correct(9, 2));
    expect(again.logs[0]).toMatchObject({ reps: 9, partials: 2 });
  });

  it('carries the corrected reps into the next set of the same exercise', () => {
    const s = run(counted(), correct(8, 0));
    expect(s.exIndex).toBe(0);
    expect(s.setIndex).toBe(1);
    expect(s.reps).toBe(8);
  });

  it('does not touch the upcoming set’s reps when the next set is another exercise', () => {
    // Exercise A has 2 sets; after both, Rest leads to B (planned top 15).
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(s.phase).toBe('rest');
    expect(s.exIndex).toBe(1);
    const c = run(s, correct(7, 1));
    expect(c.logs[1]).toMatchObject({ exerciseId: 'A', setIndex: 1, reps: 7, partials: 1 });
    expect(c.logs[0]).toMatchObject({ reps: 12 });
    expect(c.reps).toBe(15);
  });

  it('clamps to whole numbers ≥ 0 and ignores non-finite values', () => {
    expect(run(counted(), correct(-3, -1)).logs[0]).toMatchObject({ reps: 0 });
    expect(run(counted(), correct(-3, -1)).logs[0]).not.toHaveProperty('partials');
    expect(run(counted(), correct(10.6, 1.4)).logs[0]).toMatchObject({ reps: 11, partials: 1 });
    const before = counted();
    expect(run(before, correct(Number.NaN, 0))).toBe(before);
    expect(run(before, correct(5, Number.POSITIVE_INFINITY))).toBe(before);
  });

  it('is ignored outside Rest, while paused, and before any set is logged', () => {
    const start = fresh();
    expect(run(start, correct(5, 0))).toBe(start);
    const exercising = run(counted(), { type: 'START_SET', now: sec(100) });
    expect(run(exercising, correct(5, 0))).toBe(exercising);
    const paused = run(counted(), { type: 'PAUSE', now: sec(50) });
    expect(run(paused, correct(5, 0))).toBe(paused);
  });

  it('also corrects the last set on Summary (the final set goes straight there)', () => {
    // Exercise C (1 set) is the last one: its Set done ends the workout.
    const s = run(
      startSession({ ...day, exercises: [exC] }, 's1', T0),
      { type: 'SET_COUNTED', reps: 3, partials: 2 },
      { type: 'SET_DONE', now: sec(30) },
    );
    expect(s.phase).toBe('summary');
    const c = run(s, correct(5, 0));
    expect(c.phase).toBe('summary');
    expect(c.endedAt).toBe(s.endedAt);
    expect(c.logs[0]).toMatchObject({ exerciseId: 'C', reps: 5 });
    expect(c.logs[0]).not.toHaveProperty('partials');
    expect(summarize(c).totalVolumeKg).toBe(summarize(s).totalVolumeKg); // C has 0 kg
    const finished = run(counted(), { type: 'FINISH', now: sec(60) }, correct(7, 1));
    expect(finished.logs[0]).toMatchObject({ reps: 7, partials: 1 });
    expect(summarize(finished).totalVolumeKg).toBe(7 * 20);
    expect(summarize(finished).setsDone).toBe(1);
  });

  it('on Summary, still ignores other events, bad values and a workout with no sets', () => {
    const done = run(counted(), { type: 'FINISH', now: sec(60) });
    expect(run(done, correct(Number.NaN, 0))).toBe(done);
    expect(run(done, { type: 'SET_DONE', now: sec(70) })).toBe(done);
    expect(run(done, { type: 'SET_COUNTED', reps: 3, partials: 0 })).toBe(done);
    const empty = run(fresh(), { type: 'FINISH', now: sec(5) });
    expect(run(empty, correct(5, 0))).toBe(empty);
  });

  it('changes the summary volume', () => {
    const s = run(counted(), correct(5, 0), { type: 'FINISH', now: sec(60) });
    expect(summarize(s).totalVolumeKg).toBe(5 * 20);
  });
});

describe('APPLY_NEXT_WEIGHT on Rest (M5b)', () => {
  const apply = (weightKg: number, exerciseId = 'A'): SessionEvent => ({
    type: 'APPLY_NEXT_WEIGHT',
    exerciseId,
    weightKg,
  });
  // Set 1 of A (2 sets, 20 kg) logged → Rest before set 2 of A.
  const resting = () => run(fresh(), { type: 'SET_DONE', now: sec(30) });

  it('sets the upcoming set’s weight on Rest without touching logs or the rest clock', () => {
    const before = resting();
    const s = run(before, apply(22.5));
    expect(s.phase).toBe('rest');
    expect(s.weightKg).toBe(22.5);
    expect(s.logs).toBe(before.logs);
    expect(s.logs[0]).toMatchObject({ weightKg: 20 });
    expect(s.reps).toBe(before.reps);
    expect(s.restAccumMs).toBe(before.restAccumMs);
    expect(s.restRunningSince).toBe(before.restRunningSince);
    expect(restElapsedMs(s, sec(50))).toBe(restElapsedMs(before, sec(50)));
  });

  it('keeps an lb weight stored as odd kg exactly (40 lb)', () => {
    const lb40 = 40 * 0.45359237;
    const s = run(startSession(day, 's1', T0, { unit: 'lb' }), { type: 'SET_DONE', now: sec(30) });
    const a = run(s, apply(lb40));
    expect(a.weightKg).toBe(lb40);
    expect(toUnit(a.weightKg, 'lb')).toBeCloseTo(40, 9);
    expect(formatWeight(a.weightKg, 'lb')).toBe('40');
  });

  it('is logged with the next set and carries over to the set after', () => {
    const s = run(
      resting(),
      apply(22.5),
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(s.logs.map((l) => l.weightKg)).toEqual([20, 22.5]);
    // A 3-set exercise: set 3 starts at the applied weight too.
    const three = startSession({ ...day, exercises: [{ ...exA, sets: 3 }, exC] }, 's1', T0);
    const t = run(
      three,
      { type: 'SET_DONE', now: sec(30) },
      apply(25),
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(t.phase).toBe('rest');
    expect(t.setIndex).toBe(2);
    expect(t.weightKg).toBe(25);
  });

  it('can be applied again (last one wins) and to 0 kg', () => {
    expect(run(resting(), apply(22.5), apply(25)).weightKg).toBe(25);
    expect(run(resting(), apply(0)).weightKg).toBe(0);
  });

  it('is ignored when the upcoming exercise differs from the advice’s exercise', () => {
    // After both sets of A, Rest leads to B (10 kg): a tap for A must not change B's weight.
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(s.exIndex).toBe(1);
    expect(run(s, apply(22.5, 'A'))).toBe(s);
    expect(run(s, apply(12, 'B')).weightKg).toBe(12);
    // Rest before A's set 2: an id for another exercise is ignored.
    const r = resting();
    expect(run(r, apply(22.5, 'B'))).toBe(r);
  });

  it('is ignored after SKIP_EXERCISE on Rest (a stale Apply tap)', () => {
    const skipped = run(resting(), { type: 'SKIP_EXERCISE', now: sec(40) });
    expect(skipped.phase).toBe('rest');
    expect(currentPlanned(skipped).exerciseId).toBe('B');
    expect(run(skipped, apply(22.5, 'A'))).toBe(skipped);
    expect(skipped.weightKg).toBe(10);
  });

  it('works after CORRECT_LAST_SET on the same Rest, keeping both changes', () => {
    const s = run(resting(), { type: 'CORRECT_LAST_SET', reps: 9, partials: 1 }, apply(22.5));
    expect(s.logs[0]).toMatchObject({ reps: 9, partials: 1, weightKg: 20 });
    expect(s.reps).toBe(9);
    expect(s.weightKg).toBe(22.5);
    const logged = run(s, { type: 'START_SET', now: sec(90) }, { type: 'SET_DONE', now: sec(120) });
    expect(logged.logs[1]).toMatchObject({ reps: 9, weightKg: 22.5 });
  });

  it('ignores NaN, Infinity and negative weights', () => {
    const before = resting();
    expect(run(before, apply(Number.NaN))).toBe(before);
    expect(run(before, apply(Number.POSITIVE_INFINITY))).toBe(before);
    expect(run(before, apply(-2.5))).toBe(before);
  });

  it('is ignored on the exercise phase, while paused, and on Summary', () => {
    const start = fresh();
    expect(run(start, apply(30))).toBe(start);
    const exercising = run(resting(), { type: 'START_SET', now: sec(90) });
    expect(run(exercising, apply(30))).toBe(exercising);
    const paused = run(resting(), { type: 'PAUSE', now: sec(40) });
    expect(run(paused, apply(30))).toBe(paused);
    const resumed = run(paused, apply(30), { type: 'RESUME', now: sec(50) });
    expect(resumed.weightKg).toBe(20);
    const done = run(resting(), { type: 'FINISH', now: sec(60) });
    expect(run(done, apply(30))).toBe(done);
  });
});

describe('backdated START_SET / SET_DONE times (M5c hands-free)', () => {
  it('a backdated START_SET measures rest from the rest start to the given time', () => {
    // Rest started at 30 s; the auto start fires at 140 s but is backdated to the first rep's
    // departure at 125 s.
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(125) },
    );
    expect(s.phase).toBe('exercise');
    expect(s.setStartedAt).toBe(sec(125));
    expect(s.lastRestTakenSec).toBe(95);
    // 95 s > 60 s target + 30 s grace: the overrun is counted on the backdated value.
    expect(s.restOverruns).toBe(1);
    const onTime = run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(115) },
    );
    expect(onTime.lastRestTakenSec).toBe(85);
    expect(onTime.restOverruns).toBe(0);
  });

  it('clamps a START_SET backdated before the rest start', () => {
    const s = run(fresh(), { type: 'SET_DONE', now: sec(30) }, { type: 'START_SET', now: sec(20) });
    expect(s.setStartedAt).toBe(sec(30));
    expect(s.lastRestTakenSec).toBe(0);
    expect(s.restOverruns).toBe(0);
  });

  it('clamps a START_SET backdated before a resume to the running rest segment start', () => {
    const s = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'PAUSE', now: sec(20) }, // 20 s accumulated
      { type: 'RESUME', now: sec(200) },
      { type: 'START_SET', now: sec(190) }, // before the resume: no negative segment
    );
    expect(s.setStartedAt).toBe(sec(200));
    expect(s.lastRestTakenSec).toBe(20);
    expect(s.restOverruns).toBe(0);
    const later = run(
      fresh(),
      { type: 'SET_DONE', now: sec(0) },
      { type: 'PAUSE', now: sec(20) },
      { type: 'RESUME', now: sec(200) },
      { type: 'START_SET', now: sec(230) },
    );
    expect(later.lastRestTakenSec).toBe(50);
  });

  it('a backdated SET_DONE logs the given end and starts rest from it', () => {
    let s = run(fresh(), { type: 'SET_DONE', now: sec(30) }, { type: 'START_SET', now: sec(90) });
    // The save is dispatched at 131 s, backdated to the last rep's end at 120 s.
    s = run(s, { type: 'SET_DONE', now: sec(120) });
    expect(s.logs[1]).toMatchObject({ startedAt: sec(90), endedAt: sec(120), restTakenSec: 60 });
    expect(s.phase).toBe('rest');
    expect(s.restRunningSince).toBe(sec(120));
    // Rest elapsed at the dispatch moment already includes the 11 s gap.
    expect(restElapsedMs(s, sec(131))).toBe(11_000);
  });

  it('clamps a SET_DONE before the set start to the set start', () => {
    let s = run(fresh(), { type: 'SET_DONE', now: sec(30) }, { type: 'START_SET', now: sec(90) });
    s = run(s, { type: 'SET_DONE', now: sec(80) });
    expect(s.logs[1]).toMatchObject({ startedAt: sec(90), endedAt: sec(90) });
    expect(s.restRunningSince).toBe(sec(90));
    expect(restElapsedMs(s, sec(100))).toBe(10_000);
  });

  it('clamps a final SET_DONE before the set start, and summary ends there', () => {
    const s = startSession({ ...day, exercises: [exC] }, 's', sec(50));
    const done = next(s, { type: 'SET_DONE', now: sec(40) });
    expect(done.phase).toBe('summary');
    expect(done.logs[0]).toMatchObject({ startedAt: sec(50), endedAt: sec(50) });
    expect(done.endedAt).toBe(sec(50));
  });
});

describe('SET_FOCUS and the focus score (M5)', () => {
  const focus = (...cues: FocusCueId[]): SessionEvent => ({ type: 'SET_FOCUS', cues });
  const counted = (reps: number, partials: number): SessionEvent => ({
    type: 'SET_COUNTED',
    reps,
    partials,
  });
  const done = (s: number): SessionEvent => ({ type: 'SET_DONE', now: sec(s) });
  const correct = (reps: number, partials: number): SessionEvent => ({
    type: 'CORRECT_LAST_SET',
    reps,
    partials,
  });

  it('starts every session with no focus cues', () => {
    expect(fresh().focusCues).toBeNull();
  });

  it('overwrites the set’s cues during a set (a copy, not the caller’s array)', () => {
    const cues: FocusCueId[] = ['rushedLowering'];
    const s = run(fresh(), focus('stalled'), { type: 'SET_FOCUS', cues });
    expect(s.focusCues).toEqual(['rushedLowering']);
    cues.push('hipSag');
    expect(s.focusCues).toEqual(['rushedLowering']);
  });

  it('drops unknown ids and ignores a non-array payload', () => {
    const odd = { type: 'SET_FOCUS', cues: ['stalled', 'bogus'] } as unknown as SessionEvent;
    expect(run(fresh(), odd).focusCues).toEqual(['stalled']);
    const before = run(fresh(), focus('stalled'));
    const bad = { type: 'SET_FOCUS', cues: 'stalled' } as unknown as SessionEvent;
    expect(run(before, bad)).toBe(before);
  });

  it('a manual set (no SET_FOCUS) logs no score and no cues', () => {
    const s = run(fresh(), counted(8, 1), done(30));
    expect(s.logs[0]).not.toHaveProperty('focusScore');
    expect(s.logs[0]).not.toHaveProperty('cues');
  });

  it('a camera set with no cues scores 100 − 5 × partials', () => {
    expect(run(fresh(), counted(10, 0), focus(), done(30)).logs[0]).toMatchObject({
      focusScore: 100,
      cues: [],
    });
    expect(run(fresh(), counted(10, 3), focus(), done(30)).logs[0]).toMatchObject({
      focusScore: 85,
    });
  });

  it('logs the cue ids and their score with the set', () => {
    const s = run(
      fresh(),
      counted(9, 1),
      focus('rushedLowering', 'rushedLowering', 'stalled', 'outOfFrame'),
      done(30),
    );
    expect(s.logs[0]).toMatchObject({
      reps: 9,
      partials: 1,
      cues: ['rushedLowering', 'rushedLowering', 'stalled', 'outOfFrame'],
      focusScore: 100 - 20 - 5 - 0 - 5,
    });
  });

  it('gives no score to a camera set with 0 reps, but keeps its cues', () => {
    const s = run(fresh(), counted(0, 2), focus('outOfFrame'), done(30));
    expect(s.logs[0]).not.toHaveProperty('focusScore');
    expect(s.logs[0]).toMatchObject({ cues: ['outOfFrame'] });
  });

  it('scores the reps as logged, after a stepper fix during the set', () => {
    const s = run(
      fresh(),
      counted(0, 0),
      focus(),
      { type: 'ADJUST', field: 'reps', delta: 1 },
      done(30),
    );
    expect(s.logs[0]).toMatchObject({ reps: 1, focusScore: 100 });
  });

  it('clears the cues for the next set, so a manual next set has no score', () => {
    const rest = run(fresh(), counted(8, 0), focus('rushedLowering'), done(30));
    expect(rest.focusCues).toBeNull();
    const s = run(rest, { type: 'START_SET', now: sec(90) }, done(120));
    expect(s.logs[1]).not.toHaveProperty('focusScore');
    expect(s.logs[0]).toMatchObject({ focusScore: 90 });
  });

  it('clears the cues when moving to another exercise (last set, skip or jump)', () => {
    const lastOfA = run(
      fresh(),
      done(30),
      { type: 'START_SET', now: sec(90) },
      focus('stalled'),
      done(120),
    );
    expect(lastOfA.exIndex).toBe(1);
    expect(lastOfA.focusCues).toBeNull();
    expect(
      run(fresh(), focus('stalled'), { type: 'SKIP_EXERCISE', now: sec(5) }).focusCues,
    ).toBeNull();
    expect(
      run(fresh(), focus('stalled'), { type: 'GO_TO_EXERCISE', exIndex: 2, now: sec(5) }).focusCues,
    ).toBeNull();
  });

  it('is ignored on Rest, while paused, and on Summary', () => {
    const rest = run(fresh(), done(30));
    expect(run(rest, focus('stalled'))).toBe(rest);
    const paused = run(fresh(), { type: 'PAUSE', now: sec(5) });
    expect(run(paused, focus('stalled'))).toBe(paused);
    const summary = run(fresh(), { type: 'FINISH', now: sec(5) });
    expect(run(summary, focus('stalled'))).toBe(summary);
  });

  it('CORRECT_LAST_SET recomputes the score from the stored cues and the corrected partials', () => {
    const rest = run(fresh(), counted(10, 1), focus('shrinkingRange'), done(30));
    expect(rest.logs[0]).toMatchObject({ focusScore: 85 });
    const fixed = run(rest, correct(10, 3));
    expect(fixed.logs[0]).toMatchObject({ partials: 3, cues: ['shrinkingRange'], focusScore: 75 });
    expect(run(fixed, correct(11, 0)).logs[0]).toMatchObject({ reps: 11, focusScore: 90 });
  });

  it('CORRECT_LAST_SET drops the score at 0 reps and restores it above 0', () => {
    const rest = run(fresh(), counted(10, 0), focus(), done(30));
    const zero = run(rest, correct(0, 1));
    expect(zero.logs[0]).not.toHaveProperty('focusScore');
    expect(zero.logs[0]).toMatchObject({ cues: [] });
    expect(run(zero, correct(4, 1)).logs[0]).toMatchObject({ focusScore: 95 });
  });

  it('CORRECT_LAST_SET never gives a manual set a score', () => {
    const rest = run(fresh(), counted(10, 0), done(30));
    const fixed = run(rest, correct(9, 2));
    expect(fixed.logs[0]).not.toHaveProperty('focusScore');
    expect(fixed.logs[0]).not.toHaveProperty('cues');
  });

  it('CORRECT_LAST_SET recomputes on Summary too', () => {
    const s = run(
      startSession({ ...day, exercises: [exC] }, 's1', T0),
      counted(3, 0),
      focus('rushedLowering'),
      done(30),
    );
    expect(s.phase).toBe('summary');
    expect(run(s, correct(5, 2)).logs[0]).toMatchObject({ focusScore: 80 });
  });
});

describe('EXTEND_REST (M4e +30 s)', () => {
  const resting = () => run(fresh(), { type: 'SET_DONE', now: sec(0) });
  const extend = (now: number, s = 30): SessionEvent => ({ type: 'EXTEND_REST', sec: s, now });

  it('raises the rest target during rest and keeps the clock running', () => {
    const s = run(resting(), extend(sec(20)));
    expect(s.restTargetSec).toBe(90);
    expect(s.phase).toBe('rest');
    expect(restElapsedMs(s, sec(40))).toBe(40_000);
  });

  it('two taps add 60 s', () => {
    const s = run(resting(), extend(sec(10)), extend(sec(12)));
    expect(s.restTargetSec).toBe(120);
  });

  it('is ignored during a set, while paused, and after summary', () => {
    const ex = fresh();
    expect(next(ex, extend(sec(1)))).toBe(ex);
    const paused = run(resting(), { type: 'PAUSE', now: sec(5) });
    expect(next(paused, extend(sec(6)))).toBe(paused);
    const done = run(resting(), { type: 'FINISH', now: sec(5) });
    expect(next(done, extend(sec(6)))).toBe(done);
  });

  it('ignores zero, negative and non-finite amounts', () => {
    const s = resting();
    for (const bad of [0, -30, Number.NaN, Number.POSITIVE_INFINITY])
      expect(next(s, extend(sec(5), bad))).toBe(s);
  });

  it('applies to this rest only: the next rest is back to the plan', () => {
    let s = run(resting(), extend(sec(10)), { type: 'START_SET', now: sec(80) });
    s = run(s, { type: 'SET_DONE', now: sec(120) });
    expect(s.phase).toBe('rest');
    expect(s.restTargetSec).toBe(exA.restSec);
  });

  it('logs the rest target that applied before each set, including +30 s; none for the first set', () => {
    let s = run(resting(), extend(sec(10)), { type: 'START_SET', now: sec(80) });
    s = run(s, { type: 'SET_DONE', now: sec(120) }); // A set 2, after the extended rest
    expect(s.logs[0]).not.toHaveProperty('restTargetSec');
    expect(s.logs[1]?.restTargetSec).toBe(90);
    s = run(s, { type: 'START_SET', now: sec(150) }, { type: 'SET_DONE', now: sec(180) }); // B
    expect(s.logs[2]?.restTargetSec).toBe(exA.restSec); // rest after A's last set, plan 60
  });

  it('a set reached by skipping mid-set had no rest before it: no rest target logged', () => {
    const s = run(
      fresh(),
      { type: 'SKIP_EXERCISE', now: sec(5) },
      { type: 'SET_DONE', now: sec(40) },
    );
    expect(s.logs[0]).not.toHaveProperty('restTargetSec');
    // …also when the skip happens mid-set after a rest.
    const t = run(
      resting(),
      { type: 'START_SET', now: sec(60) },
      { type: 'SKIP_EXERCISE', now: sec(70) },
      { type: 'SET_DONE', now: sec(100) },
    );
    expect(t.logs[1]?.restTakenSec).toBe(0);
    expect(t.logs[1]).not.toHaveProperty('restTargetSec');
  });

  it('measures overrun against the extended target (extra time is planned rest)', () => {
    const limit = 60 + REST_OVERRUN_GRACE_SEC;
    // Without the extension, limit + 20 s is an overrun…
    expect(run(resting(), { type: 'START_SET', now: sec(limit + 20) }).restOverruns).toBe(1);
    // …with +30 s it is not, up to the new limit…
    const ext = run(resting(), extend(sec(30)), { type: 'START_SET', now: sec(limit + 30) });
    expect(ext.restOverruns).toBe(0);
    expect(ext.lastRestTakenSec).toBe(limit + 30);
    // …and past the new limit it still is.
    expect(
      run(resting(), extend(sec(30)), { type: 'START_SET', now: sec(limit + 31) }).restOverruns,
    ).toBe(1);
  });
});

describe('weightKgToday default precedence (M10)', () => {
  const lighter = (p: PlannedExercise, kg: number): PlannedExercise => ({
    ...p,
    weightKgToday: kg,
  });

  it('plan < last time < weightKgToday for the first set', () => {
    const plan = startSession({ ...day, exercises: [exA] }, 's', T0);
    expect(plan.weightKg).toBe(20);
    const last = startSession({ ...day, exercises: [exA] }, 's', T0, { lastWeightKg: { A: 25 } });
    expect(last.weightKg).toBe(25);
    const today = startSession({ ...day, exercises: [lighter(exA, 22.5)] }, 's', T0, {
      lastWeightKg: { A: 25 },
    });
    expect(today.weightKg).toBe(22.5);
  });

  it('weightKgToday is used exactly (not re-snapped), also in lb and at 0 kg', () => {
    const lb = startSession({ ...day, exercises: [lighter(exA, 18.14)] }, 's', T0, { unit: 'lb' });
    expect(lb.weightKg).toBe(18.14);
    const zero = startSession({ ...day, exercises: [lighter(exA, 0)] }, 's', T0, {
      lastWeightKg: { A: 25 },
    });
    expect(zero.weightKg).toBe(0);
  });

  it('ignores a non-finite or negative weightKgToday and falls back to last time', () => {
    for (const kg of [NaN, Infinity, -5]) {
      const s = startSession({ ...day, exercises: [lighter(exA, kg)] }, 's', T0, {
        lastWeightKg: { A: 25 },
      });
      expect(s.weightKg).toBe(25);
    }
  });

  it('a set logged today still wins for the next set of that exercise', () => {
    const d: ProgramDay = { ...day, exercises: [lighter(exA, 15), exC] };
    const s = run(
      startSession(d, 's', T0, { lastWeightKg: { A: 25 } }),
      { type: 'ADJUST', field: 'weight', delta: 2.5 },
      { type: 'SET_DONE', now: sec(30) },
    );
    expect(s.logs[0]?.weightKg).toBe(17.5);
    expect(s.weightKg).toBe(17.5);
  });

  it('applies when moving to an exercise by jump, skip or finishing the previous one', () => {
    const d: ProgramDay = { ...day, exercises: [exC, lighter(exA, 15)] };
    const opts = { lastWeightKg: { A: 25 } };
    expect(
      run(startSession(d, 's', T0, opts), { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(1) })
        .weightKg,
    ).toBe(15);
    expect(
      run(startSession(d, 's', T0, opts), { type: 'SKIP_EXERCISE', now: sec(1) }).weightKg,
    ).toBe(15);
    expect(run(startSession(d, 's', T0, opts), { type: 'SET_DONE', now: sec(30) }).weightKg).toBe(
      15,
    );
  });
});

describe('REPLACE_UPCOMING (M10 mid-workout coach)', () => {
  const exD: PlannedExercise = {
    exerciseId: 'D',
    sets: 3,
    targetReps: [6, 8],
    restSec: 75,
    startWeightKg: 30,
    tracking: 'manual',
    adjusted: 'swap',
  };
  const replace = (exIndex: number, p: PlannedExercise | null, t = sec(50)): SessionEvent => ({
    type: 'REPLACE_UPCOMING',
    exIndex,
    planned: p,
    now: t,
  });
  const ids = (s: SessionState) => s.day.exercises.map((p) => p.exerciseId);
  // Rest after A's last set: the upcoming set is B (exIndex 1), which has no logged sets.
  const restBeforeB = () =>
    run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );

  it('replaces a later exercise mid-set without touching the current set', () => {
    const s0 = run(fresh(), { type: 'ADJUST', field: 'reps', delta: -2 });
    const s = run(s0, replace(2, exD));
    expect(ids(s)).toEqual(['A', 'B', 'D']);
    expect(s.day.exercises[2]).toEqual(exD);
    expect(s.exIndex).toBe(0);
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(10);
    expect(s.weightKg).toBe(20);
    expect(s.phase).toBe('exercise');
    expect(s.setStartedAt).toBe(T0);
    // The original day object is not mutated.
    expect(day.exercises.map((p) => p.exerciseId)).toEqual(['A', 'B', 'C']);
  });

  it('removes a later exercise mid-set; the current index stays', () => {
    const s = run(fresh(), replace(1, null));
    expect(ids(s)).toEqual(['A', 'C']);
    expect(s.exIndex).toBe(0);
    expect(currentPlanned(s).exerciseId).toBe('A');
  });

  it('removing an exercise before the current index shifts the current index down', () => {
    // Jump to C mid-set, then remove B (index 1, before C at index 2).
    const s0 = run(fresh(), { type: 'GO_TO_EXERCISE', exIndex: 2, now: sec(5) });
    const s = run(s0, replace(1, null));
    expect(ids(s)).toEqual(['A', 'C']);
    expect(s.exIndex).toBe(1);
    expect(currentPlanned(s).exerciseId).toBe('C');
    expect(s.setStartedAt).toBe(sec(5));
  });

  it('replacing an exercise before the current index keeps the current index', () => {
    const s0 = run(fresh(), { type: 'GO_TO_EXERCISE', exIndex: 2, now: sec(5) });
    const s = run(s0, replace(1, exD));
    expect(ids(s)).toEqual(['A', 'D', 'C']);
    expect(s.exIndex).toBe(2);
    expect(currentPlanned(s).exerciseId).toBe('C');
  });

  it('rejects the running set (current exercise in the exercise phase)', () => {
    const s0 = fresh();
    expect(run(s0, replace(0, exD))).toBe(s0);
    expect(run(s0, replace(0, null))).toBe(s0);
  });

  it('rejects an exercise with logged sets, also during rest', () => {
    // Rest between A's sets: A has 1 logged set and is the upcoming exercise.
    const r = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    expect(r.phase).toBe('rest');
    expect(run(r, replace(0, exD))).toBe(r);
    expect(run(r, replace(0, null))).toBe(r);
    // A finished exercise (all sets logged) is rejected too.
    const b = restBeforeB();
    expect(run(b, replace(0, null))).toBe(b);
    expect(run(b, replace(0, exD))).toBe(b);
  });

  it('rejects after summary and for a missing index', () => {
    const done = run(fresh(), { type: 'FINISH', now: sec(1) });
    expect(run(done, replace(2, exD))).toBe(done);
    const s = fresh();
    expect(run(s, replace(3, exD))).toBe(s);
    expect(run(s, replace(-1, null))).toBe(s);
    expect(run(s, replace(1.5, null))).toBe(s);
  });

  it('is accepted while paused mid-set: later rows only, the paused set stays', () => {
    const p = run(fresh(), { type: 'PAUSE', now: sec(1) });
    const s = run(p, replace(2, exD), replace(1, null));
    expect(ids(s)).toEqual(['A', 'D']);
    expect(s.paused).toBe(true);
    expect(s.phase).toBe('exercise');
    expect(s.exIndex).toBe(0);
    expect(s.setStartedAt).toBe(p.setStartedAt);
    // The current exercise is still the running set while paused.
    expect(run(p, replace(0, exD))).toBe(p);
    expect(run(p, replace(0, null))).toBe(p);
  });

  it('is accepted while paused on Rest; the rest clock stays frozen', () => {
    const r = run(restBeforeB(), { type: 'PAUSE', now: sec(150) });
    expect(r.restAccumMs).toBe(30_000);
    const s = run(r, replace(1, { ...exD, weightKgToday: 27.5 }, sec(170)));
    expect(ids(s)).toEqual(['A', 'D', 'C']);
    expect(s.paused).toBe(true);
    expect(s.phase).toBe('rest');
    expect(s.weightKg).toBe(27.5);
    expect(s.restAccumMs).toBe(r.restAccumMs);
    expect(s.restRunningSince).toBeNull();
    expect(s.setStartedAt).toBe(r.setStartedAt);
    expect(restElapsedMs(s, sec(500))).toBe(30_000);
    // Removing the upcoming one while paused moves on and keeps the pause.
    const m = run(r, replace(1, null, sec(170)));
    expect(currentPlanned(m).exerciseId).toBe('C');
    expect(m.paused).toBe(true);
    expect(m.restAccumMs).toBe(30_000);
    // Resume picks up the rest clock as before.
    const t = run(s, { type: 'RESUME', now: sec(200) });
    expect(restElapsedMs(t, sec(210))).toBe(40_000);
  });

  it('rejects a replacement already elsewhere in the day, or with no sets', () => {
    const s = fresh();
    expect(run(s, replace(2, { ...exD, exerciseId: 'A' }))).toBe(s);
    expect(run(s, replace(2, { ...exD, sets: 0 }))).toBe(s);
    expect(run(s, replace(2, { ...exD, sets: NaN }))).toBe(s);
    // Re-planning the same exercise in place is fine (e.g. lighter mid-workout).
    const same = run(s, replace(2, { ...exC, sets: 2, adjusted: 'lighter' }));
    expect(same.day.exercises[2]?.sets).toBe(2);
  });

  it('on Rest, replacing the upcoming exercise loads its defaults and keeps resting', () => {
    const r = restBeforeB();
    expect(r.exIndex).toBe(1);
    const s = run(r, replace(1, { ...exD, weightKgToday: 27.5 }));
    expect(ids(s)).toEqual(['A', 'D', 'C']);
    expect(s.phase).toBe('rest');
    expect(s.exIndex).toBe(1);
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(8);
    expect(s.weightKg).toBe(27.5);
    expect(s.restRunningSince).toBe(r.restRunningSince);
    expect(s.restTargetSec).toBe(r.restTargetSec);
    expect(s.logs).toBe(r.logs);
    // The next set logs the new exercise with its own rest.
    const t = run(s, { type: 'START_SET', now: sec(200) }, { type: 'SET_DONE', now: sec(230) });
    expect(t.logs.at(-1)?.exerciseId).toBe('D');
    expect(t.phase).toBe('rest');
    expect(t.restTargetSec).toBe(75);
    expect(currentPlanned(t).exerciseId).toBe('D');
  });

  it('on Rest, removing the upcoming exercise moves to the next unfinished one', () => {
    const s = run(restBeforeB(), replace(1, null));
    expect(ids(s)).toEqual(['A', 'C']);
    expect(s.phase).toBe('rest');
    expect(s.exIndex).toBe(1);
    expect(currentPlanned(s).exerciseId).toBe('C');
    expect(s.reps).toBe(5);
  });

  it('on Rest, removing the last remaining exercise ends the session at `now`', () => {
    const d: ProgramDay = { ...day, exercises: [{ ...exA, sets: 1 }, exC] };
    const r = run(startSession(d, 's', T0), { type: 'SET_DONE', now: sec(30) });
    expect(r.phase).toBe('rest');
    const s = run(r, replace(1, null, sec(45)));
    expect(s.phase).toBe('summary');
    expect(s.endedAt).toBe(sec(45));
    expect(ids(s)).toEqual(['A']);
  });

  it('on Rest, removing an exercise before the upcoming one shifts the index', () => {
    // A done, skip B on rest → upcoming C (index 2); then remove B.
    const r = run(restBeforeB(), { type: 'SKIP_EXERCISE', now: sec(125) });
    expect(r.exIndex).toBe(2);
    const s = run(r, replace(1, null));
    expect(ids(s)).toEqual(['A', 'C']);
    expect(s.exIndex).toBe(1);
    expect(currentPlanned(s).exerciseId).toBe('C');
    expect(s.phase).toBe('rest');
  });

  it('a removed or replaced exercise leaves the skipped list', () => {
    const r = run(restBeforeB(), { type: 'SKIP_EXERCISE', now: sec(125) });
    expect(r.skipped).toEqual(['B']);
    expect(run(r, replace(1, null)).skipped).toEqual([]);
    const swapped = run(r, replace(1, exD));
    expect(swapped.skipped).toEqual([]);
    // The swapped-in exercise is fresh: wrap-around reaches it after C.
    const t = run(
      swapped,
      { type: 'START_SET', now: sec(200) },
      { type: 'SET_DONE', now: sec(230) },
    );
    expect(currentPlanned(t).exerciseId).toBe('D');
  });

  it('the summary after a removal counts only the remaining work', () => {
    const s = run(
      fresh(),
      replace(1, null),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
      { type: 'START_SET', now: sec(180) },
      { type: 'SET_DONE', now: sec(200) },
    );
    expect(s.phase).toBe('summary');
    expect(s.logs.map((l) => l.exerciseId)).toEqual(['A', 'A', 'C']);
    expect(summarize(s)).toEqual({
      setsDone: 3,
      totalVolumeKg: 12 * 20 * 2 + 5 * 0,
      restOverruns: 0,
      skipped: [],
      durationSec: 200,
    });
  });
});

describe('INSERT_UPCOMING (M10 mid-workout Undo)', () => {
  const exB = day.exercises[1] as PlannedExercise;
  const exD: PlannedExercise = {
    exerciseId: 'D',
    sets: 2,
    targetReps: [6, 8],
    restSec: 75,
    startWeightKg: 30,
    tracking: 'manual',
  };
  const insert = (exIndex: number, p: PlannedExercise, t = sec(50)): SessionEvent => ({
    type: 'INSERT_UPCOMING',
    exIndex,
    planned: p,
    now: t,
  });
  const remove = (exIndex: number, t = sec(50)): SessionEvent => ({
    type: 'REPLACE_UPCOMING',
    exIndex,
    planned: null,
    now: t,
  });
  const ids = (s: SessionState) => s.day.exercises.map((p) => p.exerciseId);
  const restBeforeB = () =>
    run(
      fresh(),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );

  it('mid-set: inserting after the current exercise leaves the set alone', () => {
    const s0 = run(fresh(), remove(1), { type: 'ADJUST', field: 'reps', delta: -1 });
    const s = run(s0, insert(1, exB));
    expect(ids(s)).toEqual(['A', 'B', 'C']);
    expect(s.day.exercises[1]).toEqual(exB);
    expect(s.exIndex).toBe(0);
    expect(s.reps).toBe(11);
    expect(s.setStartedAt).toBe(T0);
    expect(s.phase).toBe('exercise');
  });

  it('mid-set: inserting at or before the current exercise shifts its index up', () => {
    // On C (index 1 after removing B), put B back at 1 → C moves to 2 and stays current.
    const s0 = run(fresh(), { type: 'GO_TO_EXERCISE', exIndex: 2, now: sec(5) }, remove(1));
    expect(s0.exIndex).toBe(1);
    const s = run(s0, insert(1, exB));
    expect(ids(s)).toEqual(['A', 'B', 'C']);
    expect(s.exIndex).toBe(2);
    expect(currentPlanned(s).exerciseId).toBe('C');
    expect(s.setStartedAt).toBe(sec(5));
    // At index 0, before everything.
    const t = run(s0, insert(0, exD));
    expect(ids(t)).toEqual(['D', 'A', 'C']);
    expect(currentPlanned(t).exerciseId).toBe('C');
  });

  it('appends at the end (index = length)', () => {
    const s = run(fresh(), insert(3, exD));
    expect(ids(s)).toEqual(['A', 'B', 'C', 'D']);
    expect(s.exIndex).toBe(0);
  });

  it('on Rest: Undo of removing the upcoming exercise makes it upcoming again', () => {
    const r = restBeforeB();
    const removed = run(r, remove(1));
    expect(currentPlanned(removed).exerciseId).toBe('C');
    const s = run(removed, insert(1, exB, sec(60)));
    expect(ids(s)).toEqual(['A', 'B', 'C']);
    expect(s.phase).toBe('rest');
    expect(s.exIndex).toBe(1);
    expect(currentPlanned(s).exerciseId).toBe('B');
    // B's defaults: plan reps top, plan weight.
    expect(s.setIndex).toBe(0);
    expect(s.reps).toBe(15);
    expect(s.weightKg).toBe(10);
    // The rest clock and target are untouched.
    expect(s.restRunningSince).toBe(r.restRunningSince);
    expect(s.restTargetSec).toBe(r.restTargetSec);
    expect(s.restAccumMs).toBe(r.restAccumMs);
    expect(s.logs).toBe(r.logs);
  });

  it('on Rest between sets of an exercise: the upcoming set stays, index shifts', () => {
    // Rest after A's first set: A (1 logged) is upcoming at 0.
    const r = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    const s = run(r, insert(0, exD));
    expect(ids(s)).toEqual(['D', 'A', 'B', 'C']);
    expect(s.exIndex).toBe(1);
    expect(currentPlanned(s).exerciseId).toBe('A');
    expect(s.setIndex).toBe(1);
    expect(s.reps).toBe(r.reps);
    expect(s.weightKg).toBe(r.weightKg);
  });

  it('on Rest: inserting after the upcoming exercise changes nothing else', () => {
    const r = restBeforeB();
    const s = run(r, insert(2, exD));
    expect(ids(s)).toEqual(['A', 'B', 'D', 'C']);
    expect(s.exIndex).toBe(1);
    expect(s.reps).toBe(r.reps);
    expect(s.weightKg).toBe(r.weightKg);
  });

  it('is accepted while paused (mid-set and on Rest); the pause and rest clock stay', () => {
    const p = run(fresh(), remove(1), { type: 'PAUSE', now: sec(10) });
    const s = run(p, insert(1, exB));
    expect(ids(s)).toEqual(['A', 'B', 'C']);
    expect(s.paused).toBe(true);
    expect(s.setStartedAt).toBe(T0);
    const r = run(restBeforeB(), remove(1), { type: 'PAUSE', now: sec(150) });
    const t = run(r, insert(1, exB, sec(170)));
    expect(currentPlanned(t).exerciseId).toBe('B');
    expect(t.paused).toBe(true);
    expect(t.restAccumMs).toBe(30_000);
    expect(t.restRunningSince).toBeNull();
  });

  it('the inserted exercise is fresh: it gets done after the others', () => {
    const s = run(
      fresh(),
      remove(1),
      insert(1, exB),
      { type: 'SET_DONE', now: sec(30) },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(currentPlanned(s).exerciseId).toBe('B');
  });

  it('rejects duplicates, logged exercises, no sets, bad indices, and Summary', () => {
    const s = fresh();
    expect(run(s, insert(1, { ...exD, exerciseId: 'C' }))).toBe(s);
    expect(run(s, insert(1, exB))).toBe(s);
    expect(run(s, insert(1, { ...exD, sets: 0 }))).toBe(s);
    expect(run(s, insert(1, { ...exD, sets: 1.5 }))).toBe(s);
    expect(run(s, insert(4, exD))).toBe(s);
    expect(run(s, insert(-1, exD))).toBe(s);
    expect(run(s, insert(0.5, exD))).toBe(s);
    // An exercise with logged sets today can't come back as a new row.
    const r = run(startSession({ ...day, exercises: [exA, exC] }, 's', T0), {
      type: 'SET_DONE',
      now: sec(30),
    });
    const gone = { ...r, day: { ...r.day, exercises: [exC] }, exIndex: 0 };
    expect(run(gone, insert(0, exA))).toBe(gone);
    const done = run(fresh(), remove(1), { type: 'FINISH', now: sec(5) });
    expect(run(done, insert(1, exB))).toBe(done);
  });

  it('a skipped id leaves the skipped list when it comes back', () => {
    const r = run(restBeforeB(), { type: 'SKIP_EXERCISE', now: sec(125) });
    expect(r.skipped).toEqual(['B']);
    const gone = { ...r, day: { ...r.day, exercises: [exA, exC] }, exIndex: 1 };
    expect(run(gone, insert(1, exB)).skipped).toEqual([]);
  });
});

describe('SET_EFFORT on Rest (M12 1b effort)', () => {
  const rest = () => run(fresh(), { type: 'SET_DONE', now: sec(30) });
  const effort = (setIndex: number, e: 'easy' | 'good' | 'hard' | null): SessionEvent => ({
    type: 'SET_EFFORT',
    setIndex,
    effort: e,
  });

  it('stores the effort on the last logged set and leaves everything else alone', () => {
    const r = rest();
    const s = run(r, effort(0, 'easy'));
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0]).toEqual({ ...r.logs[0], effort: 'easy' });
    expect({ ...s, logs: r.logs }).toEqual(r);
  });

  it('can be changed and cleared while still on Rest', () => {
    const s = run(rest(), effort(0, 'easy'), effort(0, 'hard'));
    expect(s.logs[0]?.effort).toBe('hard');
    const cleared = run(s, effort(0, null));
    expect(cleared.logs[0]).not.toHaveProperty('effort');
  });

  it('a set without an answer has no effort field', () => {
    expect(rest().logs[0]).not.toHaveProperty('effort');
  });

  it('is never accepted during a set, while paused, or on Summary', () => {
    const inSet = fresh();
    expect(run(inSet, effort(0, 'easy'))).toBe(inSet);
    const nextSet = run(rest(), { type: 'START_SET', now: sec(90) });
    expect(run(nextSet, effort(0, 'easy'))).toBe(nextSet);
    const paused = run(rest(), { type: 'PAUSE', now: sec(40) });
    expect(run(paused, effort(0, 'easy'))).toBe(paused);
    const done = run(rest(), { type: 'FINISH', now: sec(50) });
    expect(run(done, effort(0, 'easy'))).toBe(done);
  });

  it('only for the last logged set, and only a known effort', () => {
    const r = run(rest(), { type: 'START_SET', now: sec(90) }, { type: 'SET_DONE', now: sec(120) });
    // The last log is set index 1 of A; set 0 is no longer editable.
    expect(run(r, effort(0, 'easy'))).toBe(r);
    expect(run(r, effort(1, 'good')).logs.map((l) => l.effort)).toEqual([undefined, 'good']);
    expect(run(r, { type: 'SET_EFFORT', setIndex: 1, effort: 'huge' as 'easy' })).toBe(r);
  });

  it('survives a rep correction and is not copied to the next set', () => {
    const s = run(
      rest(),
      effort(0, 'hard'),
      { type: 'CORRECT_LAST_SET', reps: 9, partials: 0 },
      { type: 'START_SET', now: sec(90) },
      { type: 'SET_DONE', now: sec(120) },
    );
    expect(s.logs[0]).toMatchObject({ reps: 9, effort: 'hard' });
    expect(s.logs[1]).not.toHaveProperty('effort');
  });
});

describe('warm-up sets (M12 1b)', () => {
  // A: dumbbells at 20 kg → ramp 10 kg × 8, 12.5 kg × 4 (70% = 14, snapped down). B: 10 kg, light.
  const lifts = {
    A: { kind: 'dumbbell', compound: true },
    B: { kind: 'dumbbell', compound: false },
  } as const;
  const warm = (over: Parameters<typeof startSession>[3] = {}, d: ProgramDay = day) =>
    startSession(d, 's1', T0, { warmups: { rule: 'firstHeavyLift', lifts }, ...over });
  const done = (t: number): SessionEvent => ({ type: 'SET_DONE', now: sec(t) });
  const start = (t: number): SessionEvent => ({ type: 'START_SET', now: sec(t) });

  it('without the option nothing changes: no warm-ups, no new state', () => {
    const s = fresh();
    expect(s).not.toHaveProperty('warmups');
    expect(currentWarmup(s)).toBeNull();
    expect(startSession(day, 's1', T0, {})).toEqual(s);
  });

  it('rule off: no warm-ups', () => {
    const s = startSession(day, 's1', T0, { warmups: { rule: 'off', lifts } });
    expect(currentWarmup(s)).toBeNull();
    expect(s.weightKg).toBe(20);
    expect(run(s, done(30)).logs[0]).not.toHaveProperty('warmup');
  });

  it('starts on warm-up 1 of 2 with its weight and reps', () => {
    const s = warm();
    expect(s.warmups).toEqual({
      A: [
        { weightKg: 10, reps: 8 },
        { weightKg: 12.5, reps: 4 },
      ],
    });
    expect(currentWarmup(s)).toEqual({ index: 0, of: 2, weightKg: 10, reps: 8 });
    expect(s).toMatchObject({ phase: 'exercise', exIndex: 0, setIndex: 0, weightKg: 10, reps: 8 });
  });

  it('runs the ramp before set 1 and logs each with warmup: true', () => {
    const w1 = run(warm(), done(30));
    expect(w1.logs[0]).toMatchObject({
      exerciseId: 'A',
      setIndex: 0,
      weightKg: 10,
      reps: 8,
      warmup: true,
    });
    expect(w1.phase).toBe('rest');
    expect(currentWarmup(w1)).toEqual({ index: 1, of: 2, weightKg: 12.5, reps: 4 });
    expect(w1).toMatchObject({ exIndex: 0, setIndex: 0, weightKg: 12.5, reps: 4 });

    const w2 = run(w1, start(60), done(90));
    expect(w2.logs[1]).toMatchObject({ setIndex: 1, weightKg: 12.5, reps: 4, warmup: true });
    // Now the first working set: the plan's weight and reps, set index 0.
    expect(currentWarmup(w2)).toBeNull();
    expect(w2).toMatchObject({ phase: 'rest', exIndex: 0, setIndex: 0, weightKg: 20, reps: 12 });

    const set1 = run(w2, start(120), done(150));
    expect(set1.logs[2]).toMatchObject({ exerciseId: 'A', setIndex: 0, weightKg: 20, reps: 12 });
    expect(set1.logs[2]).not.toHaveProperty('warmup');
    expect(set1).toMatchObject({ exIndex: 0, setIndex: 1, weightKg: 20 });
    // The second working set finishes A (2 sets): on to B, which has no warm-up.
    const set2 = run(set1, start(200), done(230));
    expect(currentPlanned(set2).exerciseId).toBe('B');
    expect(currentWarmup(set2)).toBeNull();
    expect(set2.weightKg).toBe(10);
  });

  it('the rest after a warm-up is short, and never longer than the exercise rest', () => {
    expect(run(warm(), done(30)).restTargetSec).toBe(45);
    const quick: ProgramDay = { ...day, exercises: [{ ...exA, restSec: 30 }, exC] };
    expect(run(warm({}, quick), done(30)).restTargetSec).toBe(30);
    // After the last warm-up too; after a working set, the plan's rest.
    const s = run(warm(), done(30), start(60), done(90));
    expect(s.restTargetSec).toBe(45);
    expect(run(s, start(120), done(150)).restTargetSec).toBe(60);
  });

  it('the working weight follows last time, and the ramp follows it', () => {
    const s = warm({ lastWeightKg: { A: 30 } });
    expect(s.warmups?.A).toEqual([
      { weightKg: 15, reps: 8 },
      { weightKg: 20, reps: 4 },
    ]);
    const working = run(s, done(30), start(60), done(90));
    expect(working.weightKg).toBe(30);
  });

  it('snaps to the display unit and a custom kit', () => {
    const s = warm({ unit: 'lb', lastWeightKg: { A: 45 * 0.45359237 } });
    expect(s.warmups?.A?.map((w) => Math.round(toUnit(w.weightKg, 'lb')))).toEqual([20, 30]);
    const kit = startSession(day, 's1', T0, {
      warmups: { rule: 'firstHeavyLift', lifts, kit: { dumbbellStep: 2, dumbbellMin: 2 } },
    });
    expect(kit.warmups?.A?.map((w) => w.weightKg)).toEqual([10, 14]);
  });

  it('only the first heavy lift: a light first lift has none, the heavy one after it does', () => {
    const d: ProgramDay = { ...day, exercises: [day.exercises[1] as PlannedExercise, exA, exC] };
    const s = warm({}, d);
    expect(currentWarmup(s)).toBeNull();
    expect(s.weightKg).toBe(10);
    const atA = run(s, done(30)); // B has 1 set → rest before A
    expect(currentPlanned(atA).exerciseId).toBe('A');
    expect(currentWarmup(atA)).toEqual({ index: 0, of: 2, weightKg: 10, reps: 8 });
    expect(atA).toMatchObject({ weightKg: 10, reps: 8 });
  });

  it('bodyweight and unknown lifts get none', () => {
    const s = warm({}, { ...day, exercises: [exC] });
    expect(s).not.toHaveProperty('warmups');
    expect(currentWarmup(s)).toBeNull();
  });

  it('a warm-up set can be adjusted; what was done is what is logged', () => {
    const s = run(
      warm(),
      { type: 'ADJUST', field: 'weight', delta: 2.5 },
      { type: 'ADJUST', field: 'reps', delta: -2 },
      done(30),
    );
    expect(s.logs[0]).toMatchObject({ weightKg: 12.5, reps: 6, warmup: true });
    // The next warm-up still loads its own planned values.
    expect(s).toMatchObject({ weightKg: 12.5, reps: 4 });
    expect(currentWarmup(s)?.index).toBe(1);
  });

  describe('SKIP_WARMUPS', () => {
    const skip = (t: number): SessionEvent => ({ type: 'SKIP_WARMUPS', now: sec(t) });

    it('before the first warm-up: straight to working set 1', () => {
      const s = run(warm(), skip(5));
      expect(currentWarmup(s)).toBeNull();
      expect(s).toMatchObject({ phase: 'exercise', setIndex: 0, weightKg: 20, reps: 12 });
      expect(s.setStartedAt).toBe(sec(5));
      expect(s.logs).toEqual([]);
      expect(run(s, done(40)).logs[0]).not.toHaveProperty('warmup');
    });

    it('on Rest between warm-ups: the rest goes on, the working set is next', () => {
      const r = run(warm(), done(30));
      const s = run(r, skip(40));
      expect(currentWarmup(s)).toBeNull();
      expect(s).toMatchObject({ phase: 'rest', setIndex: 0, weightKg: 20, reps: 12 });
      expect(s.restRunningSince).toBe(r.restRunningSince);
      // The warm-up already done stays logged.
      expect(s.logs).toHaveLength(1);
      expect(s.logs[0]?.warmup).toBe(true);
    });

    it('is ignored when no warm-up is up, while paused, and on Summary', () => {
      const plain = fresh();
      expect(run(plain, skip(5))).toBe(plain);
      const working = run(warm(), done(30), start(60), done(90));
      expect(run(working, skip(95))).toBe(working);
      const paused = run(warm(), { type: 'PAUSE', now: sec(5) });
      expect(run(paused, skip(6))).toBe(paused);
      const fin = run(warm(), { type: 'FINISH', now: sec(5) });
      expect(run(fin, skip(6))).toBe(fin);
    });
  });

  it('skipping the exercise and coming back resumes the ramp where it was', () => {
    const s = run(
      warm(),
      done(30),
      { type: 'SKIP_EXERCISE', now: sec(40) },
      { type: 'GO_TO_EXERCISE', exIndex: 0, now: sec(50) },
    );
    expect(currentPlanned(s).exerciseId).toBe('A');
    expect(currentWarmup(s)).toEqual({ index: 1, of: 2, weightKg: 12.5, reps: 4 });
  });

  it('warm-ups do not count as sets of the exercise', () => {
    // 2 warm-ups + 1 of 2 working sets: A is not finished, the next set is working set index 1.
    const s = run(warm(), done(30), start(60), done(90), start(120), done(150));
    expect(currentPlanned(s).exerciseId).toBe('A');
    expect(s.setIndex).toBe(1);
  });

  it('the summary leaves warm-ups out of sets and volume', () => {
    const s = run(warm(), done(30), start(60), done(90), start(120), done(150), {
      type: 'FINISH',
      now: sec(200),
    });
    expect(s.logs).toHaveLength(3);
    expect(summarize(s)).toMatchObject({ setsDone: 1, totalVolumeKg: 240 });
  });

  it('effort is not taken for a warm-up set', () => {
    const r = run(warm(), done(30));
    expect(run(r, { type: 'SET_EFFORT', setIndex: 0, effort: 'easy' })).toBe(r);
  });

  it('correcting a warm-up count does not change the next set', () => {
    const last = run(warm(), done(30), start(60), done(90));
    const s = run(last, { type: 'CORRECT_LAST_SET', reps: 3, partials: 0 });
    expect(s.logs[1]).toMatchObject({ reps: 3, warmup: true });
    expect(s.reps).toBe(12);
    const mid = run(warm(), done(30), { type: 'CORRECT_LAST_SET', reps: 7, partials: 0 });
    expect(mid.logs[0]).toMatchObject({ reps: 7, warmup: true });
    expect(mid.reps).toBe(4);
  });

  it('replacing the warm-up exercise drops its ramp', () => {
    const d: ProgramDay = { ...day, exercises: [day.exercises[1] as PlannedExercise, exA, exC] };
    const s = run(warm({}, d), {
      type: 'REPLACE_UPCOMING',
      exIndex: 1,
      planned: { ...exA, exerciseId: 'Z' },
      now: sec(5),
    });
    expect(s.warmups).toEqual({});
    const atZ = run(s, done(30));
    expect(currentPlanned(atZ).exerciseId).toBe('Z');
    expect(currentWarmup(atZ)).toBeNull();
  });

  it('an exercise with warm-ups logged counts as started (no replace)', () => {
    const r = run(warm(), done(30));
    expect(
      run(r, {
        type: 'REPLACE_UPCOMING',
        exIndex: 0,
        planned: { ...exA, exerciseId: 'Z' },
        now: sec(40),
      }),
    ).toBe(r);
  });
});

describe('one-sided sets (M13b): right, Next side, left, one SetLog', () => {
  const row: PlannedExercise = {
    exerciseId: 'One-Arm_Dumbbell_Row',
    sets: 2,
    targetReps: [8, 12],
    restSec: 60,
    startWeightKg: 20,
    tracking: 'pose',
  };
  const stepUps: PlannedExercise = {
    exerciseId: 'Dumbbell_Step_Ups',
    sets: 1,
    targetReps: [10, 10],
    restSec: 90,
    tracking: 'manual',
  };
  const oneDay: ProgramDay = { id: 'one', name: 'One Day', exercises: [row, exA, stepUps] };
  const one = () => startSession(oneDay, 's1', T0);
  const counted = (reps: number, partials = 0): SessionEvent => ({
    type: 'SET_COUNTED',
    reps,
    partials,
  });
  const nextSide = (t: number): SessionEvent => ({ type: 'NEXT_SIDE', now: sec(t) });
  const done = (t: number): SessionEvent => ({ type: 'SET_DONE', now: sec(t) });

  it('a one-sided set starts on the right; two-sided exercises have no side', () => {
    const s = one();
    expect(s.side).toBe('right');
    expect(currentSide(s)).toBe('right');
    expect(s.doneSide).toBeUndefined();
    const two = fresh();
    expect(currentSide(two)).toBeNull();
    expect('side' in two).toBe(false);
    expect('doneSide' in two).toBe(false);
  });

  it('NEXT_SIDE keeps the right count and moves to the left', () => {
    const s = run(one(), counted(12, 1), nextSide(30));
    expect(s.phase).toBe('exercise');
    expect(currentSide(s)).toBe('left');
    expect(s.doneSide).toEqual({
      side: 'right',
      reps: 12,
      partials: 1,
      focusCues: null,
      at: sec(30),
    });
    expect(s.partials).toBe(0);
    expect(s.logs).toHaveLength(0);
    expect(s.restRunningSince).toBeNull();
  });

  it('SET_COUNTED and ADJUST apply to the current side only', () => {
    const s = run(
      one(),
      counted(12),
      { type: 'ADJUST', field: 'reps', delta: -1 },
      nextSide(30),
      counted(9, 2),
      { type: 'ADJUST', field: 'reps', delta: 1 },
    );
    expect(s.doneSide).toMatchObject({ reps: 11, partials: 0 });
    expect(s.reps).toBe(10);
    expect(s.partials).toBe(2);
  });

  it('SET_DONE on the left logs one SetLog with both sides, reps = the lower side', () => {
    const s = run(one(), counted(12), nextSide(30), counted(11, 1), done(60));
    expect(s.logs).toHaveLength(1);
    expect(s.logs[0]).toMatchObject({
      exerciseId: 'One-Arm_Dumbbell_Row',
      setIndex: 0,
      reps: 11,
      partials: 1,
      weightKg: 20,
      sides: { right: { reps: 12, partials: 0 }, left: { reps: 11, partials: 1 } },
      startedAt: T0,
      endedAt: sec(60),
    });
    // the left being lower or the right being lower: either way the lower side
    const r = run(one(), counted(8, 2), nextSide(30), counted(10), done(60));
    expect(r.logs[0]).toMatchObject({ reps: 8, partials: 2 });
    expect(r.logs[0]?.partials).toBe(2);
  });

  it('the rest clock starts when the left side ends, not at the switch', () => {
    const s = run(one(), counted(12), nextSide(30), counted(12), done(70));
    expect(s.phase).toBe('rest');
    expect(s.restRunningSince).toBe(sec(70));
    expect(restElapsedMs(s, sec(100))).toBe(30_000);
    const t = run(s, { type: 'START_SET', now: sec(130) });
    expect(t.lastRestTakenSec).toBe(60);
  });

  it('the next set starts on the right again with the logged (lower) reps', () => {
    const s = run(one(), counted(12), nextSide(30), counted(10), done(60));
    expect(currentSide(s)).toBe('right');
    expect(s.doneSide).toBeUndefined();
    expect(s.setIndex).toBe(1);
    expect(s.reps).toBe(10);
    expect(s.partials).toBe(0);
    const t = run(s, { type: 'START_SET', now: sec(120) }, counted(9), nextSide(150));
    expect(t.doneSide).toMatchObject({ side: 'right', reps: 9 });
  });

  it('SET_DONE on the first side (early end) logs the right only', () => {
    const s = run(one(), counted(7, 1), done(40));
    expect(s.logs[0]).toMatchObject({
      reps: 7,
      partials: 1,
      sides: { right: { reps: 7, partials: 1 } },
      endedAt: sec(40),
    });
    expect(s.logs[0]?.sides?.left).toBeUndefined();
    expect(s.phase).toBe('rest');
  });

  it('NEXT_SIDE is ignored for two-sided exercises, on the second side, on Rest and while paused', () => {
    const two = fresh();
    expect(next(two, nextSide(10))).toBe(two);
    const left = run(one(), nextSide(10));
    expect(next(left, nextSide(20))).toBe(left);
    const paused = run(one(), { type: 'PAUSE', now: sec(5) });
    expect(next(paused, nextSide(10))).toBe(paused);
    const rest = run(one(), done(30));
    expect(next(rest, nextSide(40))).toBe(rest);
  });

  it('NEXT_SIDE time is clamped to the set start', () => {
    const s = run(one(), { type: 'NEXT_SIDE', now: T0 - 5000 });
    expect(s.doneSide?.at).toBe(T0);
  });

  it('focus cues are per side and joined at Set done; the score uses the logged reps/partials', () => {
    const s = run(
      one(),
      counted(10),
      { type: 'SET_FOCUS', cues: ['rushedLowering'] as FocusCueId[] },
      nextSide(30),
      counted(10),
      { type: 'SET_FOCUS', cues: ['rushedLowering', 'rushedLowering'] as FocusCueId[] },
      done(60),
    );
    expect(s.logs[0]?.cues).toEqual(['rushedLowering', 'rushedLowering', 'rushedLowering']);
    expect(typeof s.logs[0]?.focusScore).toBe('number');
    const manual = run(one(), counted(10), nextSide(30), done(60));
    expect(manual.logs[0]?.cues).toBeUndefined();
    expect(manual.logs[0]?.focusScore).toBeUndefined();
    const rightOnly = run(
      one(),
      { type: 'SET_FOCUS', cues: [] as FocusCueId[] },
      nextSide(30),
      done(60),
    );
    expect(rightOnly.logs[0]?.cues).toEqual([]);
  });

  it('CORRECT_LAST_SET with a side fixes that side and recomputes the lower side', () => {
    const s = run(one(), counted(12), nextSide(30), counted(11), done(60));
    const fixLeft = run(s, { type: 'CORRECT_LAST_SET', side: 'left', reps: 13, partials: 0 });
    expect(fixLeft.logs[0]).toMatchObject({
      reps: 12,
      sides: { right: { reps: 12, partials: 0 }, left: { reps: 13, partials: 0 } },
    });
    expect(fixLeft.reps).toBe(12); // carries to the next set
    const fixRight = run(s, { type: 'CORRECT_LAST_SET', side: 'right', reps: 9, partials: 2 });
    expect(fixRight.logs[0]).toMatchObject({
      reps: 9,
      partials: 2,
      sides: { right: { reps: 9, partials: 2 }, left: { reps: 11, partials: 0 } },
    });
    expect(s.logs[0]?.sides?.left?.reps).toBe(11); // immutably
  });

  it('CORRECT_LAST_SET can add the left to an early-ended set', () => {
    const s = run(one(), counted(7), done(40));
    const f = run(s, { type: 'CORRECT_LAST_SET', side: 'left', reps: 6, partials: 0 });
    expect(f.logs[0]).toMatchObject({
      reps: 6,
      sides: { right: { reps: 7, partials: 0 }, left: { reps: 6, partials: 0 } },
    });
  });

  it('CORRECT_LAST_SET with a side is ignored for a two-sided set; without one it fixes the total', () => {
    const two = run(fresh(), { type: 'SET_DONE', now: sec(30) });
    expect(next(two, { type: 'CORRECT_LAST_SET', side: 'left', reps: 3, partials: 0 })).toBe(two);
    const s = run(one(), counted(12), nextSide(30), counted(11), done(60));
    const total = run(s, { type: 'CORRECT_LAST_SET', reps: 10, partials: 0 });
    expect(total.logs[0]?.reps).toBe(10);
    expect(total.logs[0]?.sides).toBeUndefined();
  });

  it('CORRECT_LAST_SET per side works on Summary for the final set (leg exercise)', () => {
    const d: ProgramDay = { id: 'legs', name: 'Legs', exercises: [stepUps] };
    const s = run(startSession(d, 's2', T0), nextSide(30), counted(9), done(60));
    expect(s.phase).toBe('summary');
    expect(s.logs[0]).toMatchObject({ reps: 9, sides: { right: { reps: 10 }, left: { reps: 9 } } });
    const f = run(s, { type: 'CORRECT_LAST_SET', side: 'left', reps: 10, partials: 0 });
    expect(f.logs[0]?.reps).toBe(10);
  });

  it('summarize counts a one-sided set once with the lower side’s volume', () => {
    const s = run(one(), counted(12), nextSide(30), counted(10), done(60), {
      type: 'FINISH',
      now: sec(90),
    });
    expect(summarize(s)).toMatchObject({ setsDone: 1, totalVolumeKg: 200 });
    expect(s.logs[0]?.sides).toEqual({
      right: { reps: 12, partials: 0 },
      left: { reps: 10, partials: 0 },
    });
  });

  it('moving to a two-sided exercise drops the side fields; moving back adds them', () => {
    const s = run(one(), nextSide(10), { type: 'GO_TO_EXERCISE', exIndex: 1, now: sec(20) });
    expect(currentPlanned(s).exerciseId).toBe('A');
    expect('side' in s).toBe(false);
    expect('doneSide' in s).toBe(false);
    const back = run(s, { type: 'GO_TO_EXERCISE', exIndex: 0, now: sec(30) });
    expect(currentSide(back)).toBe('right');
    expect(back.doneSide).toBeUndefined();
    const skip = run(one(), nextSide(10), { type: 'SKIP_EXERCISE', now: sec(20) });
    expect('side' in skip).toBe(false);
  });

  it('two-sided exercises log no sides', () => {
    const s = run(fresh(), counted(9), { type: 'SET_DONE', now: sec(30) });
    expect(s.logs[0]?.sides).toBeUndefined();
    expect('sides' in (s.logs[0] ?? {})).toBe(false);
  });

  it('lowerSide picks fewer reps, then more partials on a tie', () => {
    expect(
      lowerSide({ right: { reps: 12, partials: 0 }, left: { reps: 11, partials: 3 } }),
    ).toEqual({
      reps: 11,
      partials: 3,
    });
    expect(
      lowerSide({ right: { reps: 10, partials: 1 }, left: { reps: 10, partials: 0 } }),
    ).toEqual({
      reps: 10,
      partials: 1,
    });
    expect(lowerSide({ left: { reps: 4, partials: 0 } })).toEqual({ reps: 4, partials: 0 });
    expect(lowerSide({})).toBeNull();
  });
});
