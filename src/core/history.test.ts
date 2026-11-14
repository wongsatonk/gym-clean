import { describe, expect, it } from 'vitest';
import {
  exerciseHistory,
  exercisesWithHistory,
  finishedSets,
  historyWindowStart,
  lastDays,
  lastDaysStart,
} from './history';
import type { StatsSession } from './stats';
import type { SetLog } from './types';

// All dates are built in local time (new Date(y, m, d, h, min)), so the tests hold in any
// time zone. 2026-11-09 is a Monday. Made-up history, not anyone's real training.
const at = (m: number, d: number, h = 18, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const midnight = (m: number, d: number) => new Date(2026, m - 1, d).getTime();
const MIN = 60_000;
const HOUR = 60 * MIN;

const BENCH = 'Dumbbell_Bench_Press';
const CURL = 'Dumbbell_Bicep_Curl';
const PUSHUP = 'Pushups';

/** `endedAt: null` = an unfinished session. */
const sess = (
  sessionId: string,
  startedAt: number,
  over: { dayId?: string; endedAt?: number | null } = {},
): StatsSession => {
  const endedAt = over.endedAt === undefined ? startedAt + HOUR : over.endedAt;
  const row: StatsSession = { sessionId, dayId: over.dayId ?? 'push-a', startedAt };
  return endedAt === null ? row : { ...row, endedAt };
};

const log = (over: Partial<SetLog> = {}): SetLog => ({
  sessionId: 's1',
  exerciseId: BENCH,
  setIndex: 0,
  reps: 8,
  weightKg: 20,
  restTakenSec: 0,
  startedAt: 1000,
  endedAt: 2000,
  ...over,
});

/** `n` sets of one exercise in one session, starting at `t0`, one minute apart. */
const sets = (
  sessionId: string,
  exerciseId: string,
  t0: number,
  rows: Array<Partial<SetLog>>,
): SetLog[] =>
  rows.map((r, i) =>
    log({
      sessionId,
      exerciseId,
      setIndex: i,
      startedAt: t0 + i * MIN,
      endedAt: t0 + i * MIN + 30_000,
      ...r,
    }),
  );

describe('lastDaysStart', () => {
  it('is local midnight of the day N-1 days before today', () => {
    expect(lastDaysStart(at(11, 14, 9), 7)).toBe(midnight(11, 8));
    expect(lastDaysStart(at(11, 14, 9), 1)).toBe(midnight(11, 14));
  });

  it('is DST-safe (local calendar days, not 24 h steps)', () => {
    // Whatever the zone, the result is a local midnight N-1 calendar days back.
    const start = lastDaysStart(at(3, 31, 12), 7);
    expect(start).toBe(midnight(3, 25));
    const d = new Date(start);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });
});

describe('lastDays', () => {
  const today = at(11, 14, 20); // Saturday evening

  it('is empty with no sessions', () => {
    expect(lastDays([], [], today)).toEqual([]);
  });

  it('summarises each finished session in the last 7 days, newest first', () => {
    const s1 = sess('s1', at(11, 10, 18), { dayId: 'push-a', endedAt: at(11, 10, 19, 5) });
    const s2 = sess('s2', at(11, 12, 7), { dayId: 'pull-a', endedAt: at(11, 12, 7, 50) });
    const logs = [
      ...sets('s1', BENCH, at(11, 10, 18, 5), [
        { weightKg: 20, reps: 10, focusScore: 90 },
        { weightKg: 22.5, reps: 8, focusScore: 70 },
      ]),
      ...sets('s1', PUSHUP, at(11, 10, 18, 30), [{ weightKg: 0, reps: 15 }]),
      ...sets('s2', CURL, at(11, 12, 7, 5), [{ weightKg: 10, reps: 12 }]),
    ];
    expect(lastDays([s1, s2], logs, today)).toEqual([
      {
        sessionId: 's2',
        dayId: 'pull-a',
        startedAt: at(11, 12, 7),
        dayStart: midnight(11, 12),
        durationMs: 50 * MIN,
        setCount: 1,
        volumeKg: 120,
        exercises: [CURL],
        avgFocus: null,
      },
      {
        sessionId: 's1',
        dayId: 'push-a',
        startedAt: at(11, 10, 18),
        dayStart: midnight(11, 10),
        durationMs: 65 * MIN,
        setCount: 3,
        volumeKg: 20 * 10 + 22.5 * 8,
        exercises: [BENCH, PUSHUP],
        avgFocus: 80,
      },
    ]);
  });

  it('keeps today and the 6 days before; drops older and future sessions', () => {
    const inFirst = sess('first', at(11, 8, 0, 1));
    const tooOld = sess('old', at(11, 7, 23, 59));
    const todays = sess('today', at(11, 14, 6));
    const tomorrow = sess('tomorrow', at(11, 15, 6));
    const ids = lastDays([inFirst, tooOld, todays, tomorrow], [], today).map((r) => r.sessionId);
    expect(ids).toEqual(['today', 'first']);
  });

  it('honours a custom number of days', () => {
    const a = sess('a', at(11, 13, 9));
    const b = sess('b', at(11, 12, 9));
    expect(lastDays([a, b], [], today, 2).map((r) => r.sessionId)).toEqual(['a']);
  });

  it('ignores unfinished sessions', () => {
    const open = sess('open', at(11, 13, 9), { endedAt: null });
    const done = sess('done', at(11, 13, 7));
    const logs = sets('open', BENCH, at(11, 13, 9, 5), [{ reps: 8 }]);
    expect(lastDays([open, done], logs, today).map((r) => r.sessionId)).toEqual(['done']);
  });

  it('ignores 0-rep sets for count, volume, exercises and focus', () => {
    const s = sess('s', at(11, 13, 9));
    const logs = [
      ...sets('s', BENCH, at(11, 13, 9, 5), [{ reps: 8, weightKg: 20, focusScore: 60 }]),
      ...sets('s', CURL, at(11, 13, 9, 20), [{ reps: 0, weightKg: 10, focusScore: 0 }]),
    ];
    const [row] = lastDays([s], logs, today);
    expect(row).toMatchObject({ setCount: 1, volumeKg: 160, exercises: [BENCH], avgFocus: 60 });
  });

  it('gives a session with no sets zero counts and an empty exercise list', () => {
    const [row] = lastDays([sess('s', at(11, 13, 9))], [], today);
    expect(row).toMatchObject({ setCount: 0, volumeKg: 0, exercises: [], avgFocus: null });
  });

  it('rounds the average focus and never reports a negative duration', () => {
    const s = sess('s', at(11, 13, 9), { endedAt: at(11, 13, 8) });
    const logs = sets('s', BENCH, at(11, 13, 9, 5), [
      { focusScore: 90 },
      { focusScore: 85 },
      { focusScore: 80 },
      { focusScore: 80 },
    ]);
    const [row] = lastDays([s], logs, today);
    expect(row?.avgFocus).toBe(84); // 83.75
    expect(row?.durationMs).toBe(0);
  });

  it('counts bodyweight sets as sets with no volume', () => {
    const s = sess('s', at(11, 13, 9));
    const logs = sets('s', PUSHUP, at(11, 13, 9, 5), [
      { weightKg: 0, reps: 20 },
      { weightKg: 0, reps: 15 },
    ]);
    expect(lastDays([s], logs, today)[0]).toMatchObject({ setCount: 2, volumeKg: 0 });
  });
});

describe('historyWindowStart', () => {
  it('is the Monday of the week N-1 weeks before the current Mon–Sun week', () => {
    expect(historyWindowStart(at(11, 14, 9), 4)).toBe(midnight(10, 19));
    expect(historyWindowStart(at(11, 9, 0, 1), 1)).toBe(midnight(11, 9));
    expect(historyWindowStart(at(11, 15, 23), 4)).toBe(midnight(10, 19)); // Sunday
  });
});

describe('exerciseHistory', () => {
  const today = at(11, 14, 20);

  it('is empty with no sets', () => {
    expect(exerciseHistory([], BENCH, today)).toEqual({
      exerciseId: BENCH,
      sessions: [],
      trend: { bestSet: null, volumeChangeKg: null, volumeChangePct: null, avgFocus: null },
    });
  });

  it('lists each session in the window, oldest first, with sets, top set, volume and focus', () => {
    const logs = [
      ...sets('b', BENCH, at(11, 5, 18), [
        { weightKg: 22.5, reps: 8, focusScore: 80 },
        { weightKg: 22.5, reps: 7, partials: 1 },
      ]),
      ...sets('a', BENCH, at(10, 27, 18), [
        { weightKg: 20, reps: 10, focusScore: 90 },
        { weightKg: 20, reps: 9, focusScore: 70 },
      ]),
      ...sets('a', CURL, at(10, 27, 18, 30), [{ weightKg: 10, reps: 12 }]),
    ];
    const h = exerciseHistory(logs, BENCH, today);
    expect(h.sessions).toEqual([
      {
        sessionId: 'a',
        date: at(10, 27, 18),
        dayStart: midnight(10, 27),
        sets: [
          { weightKg: 20, reps: 10, focusScore: 90 },
          { weightKg: 20, reps: 9, focusScore: 70 },
        ],
        topSet: { weightKg: 20, reps: 10 },
        volumeKg: 380,
        focusScores: [90, 70],
        avgFocus: 80,
      },
      {
        sessionId: 'b',
        date: at(11, 5, 18),
        dayStart: midnight(11, 5),
        sets: [
          { weightKg: 22.5, reps: 8, focusScore: 80 },
          { weightKg: 22.5, reps: 7, focusScore: null },
        ],
        topSet: { weightKg: 22.5, reps: 8 },
        volumeKg: 22.5 * 15,
        focusScores: [80],
        avgFocus: 80,
      },
    ]);
    expect(h.trend).toEqual({
      bestSet: { weightKg: 22.5, reps: 8, sessionId: 'b', date: at(11, 5, 18) },
      volumeChangeKg: 337.5 - 380,
      volumeChangePct: Math.round(((337.5 - 380) / 380) * 100),
      avgFocus: 80,
    });
  });

  it('orders sets within a session by start time', () => {
    const logs = [
      log({ sessionId: 'a', setIndex: 1, reps: 6, startedAt: at(11, 10, 18, 5) }),
      log({ sessionId: 'a', setIndex: 0, reps: 9, startedAt: at(11, 10, 18, 1) }),
    ];
    const h = exerciseHistory(logs, BENCH, today);
    expect(h.sessions[0]?.sets.map((s) => s.reps)).toEqual([9, 6]);
    expect(h.sessions[0]?.date).toBe(at(11, 10, 18, 1));
  });

  it('keeps the current Mon–Sun week plus the 3 before it, and nothing after today', () => {
    const logs = [
      log({ sessionId: 'edge', startedAt: at(10, 19, 0, 1) }), // Monday 4 weeks back
      log({ sessionId: 'old', startedAt: at(10, 18, 23, 59) }), // the Sunday before
      log({ sessionId: 'future', startedAt: at(11, 15, 8) }), // tomorrow
    ];
    expect(exerciseHistory(logs, BENCH, today).sessions.map((s) => s.sessionId)).toEqual(['edge']);
    expect(exerciseHistory(logs, BENCH, today, 5).sessions.map((s) => s.sessionId)).toEqual([
      'old',
      'edge',
    ]);
  });

  it('ignores 0-rep sets and sessions left with none', () => {
    const logs = [
      ...sets('a', BENCH, at(11, 10, 18), [{ reps: 0, weightKg: 40, focusScore: 10 }]),
      ...sets('b', BENCH, at(11, 12, 18), [
        { reps: 0, weightKg: 40 },
        { reps: 8, weightKg: 20 },
      ]),
    ];
    const h = exerciseHistory(logs, BENCH, today);
    expect(h.sessions.map((s) => s.sessionId)).toEqual(['b']);
    expect(h.sessions[0]?.sets).toEqual([{ weightKg: 20, reps: 8, focusScore: null }]);
    expect(h.trend.bestSet).toMatchObject({ weightKg: 20, reps: 8 });
  });

  it('gives bodyweight sets reps but no volume, and no volume percent change', () => {
    const logs = [
      ...sets('a', PUSHUP, at(11, 10, 18), [{ weightKg: 0, reps: 12 }]),
      ...sets('b', PUSHUP, at(11, 12, 18), [{ weightKg: 0, reps: 15 }]),
    ];
    const h = exerciseHistory(logs, PUSHUP, today);
    expect(h.sessions.map((s) => [s.topSet, s.volumeKg])).toEqual([
      [{ weightKg: 0, reps: 12 }, 0],
      [{ weightKg: 0, reps: 15 }, 0],
    ]);
    expect(h.trend).toMatchObject({
      bestSet: { weightKg: 0, reps: 15, sessionId: 'b' },
      volumeChangeKg: 0,
      volumeChangePct: null,
    });
  });

  it('has no volume change with a single session', () => {
    const h = exerciseHistory(sets('a', BENCH, at(11, 10, 18), [{ reps: 8 }]), BENCH, today);
    expect(h.trend).toMatchObject({ volumeChangeKg: null, volumeChangePct: null });
  });

  it('picks the heaviest best set, then most reps; an earlier tie keeps the earlier session', () => {
    const logs = [
      ...sets('a', BENCH, at(11, 3, 18), [{ weightKg: 25, reps: 6 }]),
      ...sets('b', BENCH, at(11, 6, 18), [{ weightKg: 20, reps: 12 }]),
      ...sets('c', BENCH, at(11, 9, 18), [{ weightKg: 25, reps: 7 }]),
      ...sets('d', BENCH, at(11, 12, 18), [{ weightKg: 25, reps: 7 }]),
    ];
    expect(exerciseHistory(logs, BENCH, today).trend.bestSet).toEqual({
      weightKg: 25,
      reps: 7,
      sessionId: 'c',
      date: at(11, 9, 18),
    });
  });

  it('averages every focus score in the window (rounded), null without camera sets', () => {
    const logs = [
      ...sets('a', BENCH, at(11, 3, 18), [{ focusScore: 100 }, { focusScore: 91 }]),
      ...sets('b', BENCH, at(11, 6, 18), [{ focusScore: 60 }, {}]),
    ];
    expect(exerciseHistory(logs, BENCH, today).trend.avgFocus).toBe(84); // 83.67
    const plain = sets('a', BENCH, at(11, 3, 18), [{}, {}]);
    const h = exerciseHistory(plain, BENCH, today);
    expect(h.trend.avgFocus).toBeNull();
    expect(h.sessions[0]?.avgFocus).toBeNull();
    expect(h.sessions[0]?.focusScores).toEqual([]);
  });

  it('keeps two sessions on the same day apart', () => {
    const logs = [
      ...sets('am', BENCH, at(11, 10, 7), [{ reps: 8 }]),
      ...sets('pm', BENCH, at(11, 10, 19), [{ reps: 6 }]),
    ];
    const h = exerciseHistory(logs, BENCH, today);
    expect(h.sessions.map((s) => [s.sessionId, s.dayStart])).toEqual([
      ['am', midnight(11, 10)],
      ['pm', midnight(11, 10)],
    ]);
  });
});

describe('exercisesWithHistory', () => {
  const today = at(11, 14, 20);

  it('lists ids with sets in the window, most recently done first', () => {
    const logs = [
      ...sets('a', BENCH, at(11, 3, 18), [{}]),
      ...sets('a', CURL, at(11, 3, 18, 30), [{}]),
      ...sets('b', PUSHUP, at(11, 10, 18), [{ weightKg: 0 }]),
      ...sets('c', BENCH, at(11, 12, 18), [{}]),
      ...sets('old', 'Old_Exercise', at(10, 1, 18), [{}]),
      ...sets('future', 'Future_Exercise', at(11, 16, 18), [{}]),
      ...sets('c', 'Skipped', at(11, 12, 19), [{ reps: 0 }]),
    ];
    expect(exercisesWithHistory(logs, today)).toEqual([BENCH, PUSHUP, CURL]);
    expect(exercisesWithHistory(logs, today, 1)).toEqual([BENCH, PUSHUP]);
  });

  it('is empty with no sets', () => {
    expect(exercisesWithHistory([], today)).toEqual([]);
  });
});

describe('finishedSets', () => {
  it('keeps only sets whose session is known and finished', () => {
    const sessions = [sess('done', 1000), sess('open', 5000, { endedAt: null })];
    const logs = [
      log({ sessionId: 'done' }),
      log({ sessionId: 'open' }),
      log({ sessionId: 'gone' }),
    ];
    expect(finishedSets(sessions, logs).map((l) => l.sessionId)).toEqual(['done']);
  });
});
