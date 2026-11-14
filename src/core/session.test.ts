import { describe, expect, it } from 'vitest';
import type { PlannedExercise, ProgramDay } from './types';
import {
  REST_OVERRUN_GRACE_SEC,
  currentPlanned,
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
