import { describe, expect, it } from 'vitest';
import {
  STREAK_MIN_PER_WEEK,
  type StatsSession,
  lastSession,
  newBests,
  previousSameDaySession,
  sessionVolume,
  volumeVsLast,
  weekDots,
  weeklyStreak,
} from './stats';
import type { SetLog } from './types';
import { fromUnit } from './units';

// All dates are built in local time (new Date(y, m, d, h, min)), so the tests hold in any
// time zone. 2026-11-09 is a Monday. Made-up history, not anyone's real training.
const at = (m: number, d: number, h = 18, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
const HOUR = 3_600_000;

let nId = 0;
/** `endedAt: undefined` = an unfinished session (the field is left out). */
const sess = (
  startedAt: number,
  over: Partial<Omit<StatsSession, 'endedAt'>> & { endedAt?: number | undefined } = {},
): StatsSession => {
  const { endedAt, ...rest } = { endedAt: startedAt + HOUR, ...over };
  const row: StatsSession = { sessionId: `s${nId++}`, dayId: 'push-a', startedAt, ...rest };
  return endedAt === undefined ? row : { ...row, endedAt };
};

/** `count` finished sessions in the Mon–Sun week starting on the Monday (month, day). */
const week = (m: number, monday: number, count: number): StatsSession[] =>
  Array.from({ length: count }, (_, i) => sess(at(m, monday + i)));

const log = (over: Partial<SetLog> = {}): SetLog => ({
  sessionId: 'today',
  exerciseId: 'Dumbbell_Bench_Press',
  setIndex: 0,
  reps: 8,
  weightKg: 20,
  restTakenSec: 0,
  startedAt: 1000,
  endedAt: 2000,
  ...over,
});

describe('STREAK_MIN_PER_WEEK', () => {
  it('is the provisional 3 workouts per week (Blockers A-q1)', () => {
    expect(STREAK_MIN_PER_WEEK).toBe(3);
  });
});

describe('weeklyStreak', () => {
  const wed = at(11, 11, 12); // Wednesday of the week starting Mon 2026-11-09

  it('is 0 with no history', () => {
    expect(weeklyStreak([], wed, 3)).toBe(0);
  });

  it('defaults to STREAK_MIN_PER_WEEK', () => {
    const s = [...week(11, 2, 2)];
    expect(weeklyStreak(s, wed)).toBe(0);
    expect(weeklyStreak(s, wed, 2)).toBe(1);
  });

  it('counts consecutive qualifying past weeks; the in-progress week does not break it', () => {
    const s = [...week(10, 19, 3), ...week(10, 26, 3), ...week(11, 2, 4)];
    expect(weeklyStreak(s, wed, 3)).toBe(3);
  });

  it('adds the current week once it qualifies', () => {
    const s = [...week(10, 26, 3), ...week(11, 2, 3), ...week(11, 9, 3)];
    expect(weeklyStreak(s, at(11, 12, 20), 3)).toBe(3);
  });

  it('a current week that qualifies on its own counts 1', () => {
    expect(weeklyStreak(week(11, 9, 3), at(11, 12, 20), 3)).toBe(1);
  });

  it('a gap week breaks the streak', () => {
    // Weeks of 10-19 and 10-26 qualify, 11-02 has 2 (gap), current week in progress.
    const s = [...week(10, 19, 3), ...week(10, 26, 3), ...week(11, 2, 2)];
    expect(weeklyStreak(s, wed, 3)).toBe(0);
    // An empty gap week behaves the same.
    const t = [...week(10, 19, 3), ...week(11, 2, 3)];
    expect(weeklyStreak(t, wed, 3)).toBe(1);
  });

  it('ignores unfinished sessions', () => {
    const s = [...week(11, 2, 2), sess(at(11, 7), { endedAt: undefined })];
    expect(weeklyStreak(s, wed, 3)).toBe(0);
  });

  it('puts Sunday 23:59 local in the old week and Monday 00:00 in the new one', () => {
    const lastWeek = [sess(at(11, 2)), sess(at(11, 4))];
    const sunLate = sess(at(11, 8, 23, 59));
    const monMidnight = sess(at(11, 9, 0, 0));
    // Sunday 23:59 completes last week → streak 1.
    expect(weeklyStreak([...lastWeek, sunLate], wed, 3)).toBe(1);
    // Monday 00:00 is this week, so last week stays at 2 → no streak.
    expect(weeklyStreak([...lastWeek, monMidnight], wed, 3)).toBe(0);
  });

  it('judges "today" by local week: Sunday 23:59 is still the current week', () => {
    const s = [...week(11, 2, 3)];
    // Sun 2026-11-15 23:59 → current week is 11-09 (no sessions, in progress): last week counts.
    expect(weeklyStreak(s, at(11, 15, 23, 59), 3)).toBe(1);
    // Mon 2026-11-16 00:00 → week 11-09 is now the past week with 0 sessions: broken.
    expect(weeklyStreak(s, at(11, 16, 0, 0), 3)).toBe(0);
  });

  it('ignores sessions after today', () => {
    const s = [...week(11, 2, 3), sess(at(11, 20)), sess(at(11, 21)), sess(at(11, 22))];
    expect(weeklyStreak(s, wed, 3)).toBe(1);
  });

  it('accepts sessions in any order', () => {
    const s = [...week(10, 26, 3), ...week(11, 2, 3)].reverse();
    expect(weeklyStreak(s, wed, 3)).toBe(2);
  });
});

describe('weekDots', () => {
  it('returns Mon–Sun with done / today / rest / future', () => {
    const today = at(11, 12, 9); // Thursday
    const s = [sess(at(11, 9)), sess(at(11, 11)), sess(at(11, 13, 7), { endedAt: undefined })];
    const dots = weekDots(s, today);
    expect(dots.map((d) => d.state)).toEqual([
      'done',
      'rest',
      'done',
      'today',
      'future',
      'future',
      'future',
    ]);
    expect(dots[0]?.dayStart).toBe(new Date(2026, 10, 9).getTime());
    expect(dots[6]?.dayStart).toBe(new Date(2026, 10, 15).getTime());
  });

  it('marks today done once a finished session is in it', () => {
    const today = at(11, 12, 20);
    const dots = weekDots([sess(at(11, 12, 18))], today);
    expect(dots[3]?.state).toBe('done');
  });

  it('is all rest/today/future with no history', () => {
    expect(weekDots([], at(11, 9, 8)).map((d) => d.state)).toEqual([
      'today',
      'future',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(weekDots([], at(11, 15, 23, 59)).map((d) => d.state)).toEqual([
      'rest',
      'rest',
      'rest',
      'rest',
      'rest',
      'rest',
      'today',
    ]);
  });

  it('ignores sessions from other weeks', () => {
    const dots = weekDots([sess(at(11, 8, 23, 59)), sess(at(11, 16, 0, 0))], at(11, 11));
    expect(dots.every((d) => d.state !== 'done')).toBe(true);
  });
});

describe('sessionVolume', () => {
  it('is 0 for no sets', () => {
    expect(sessionVolume([])).toBe(0);
  });

  it('sums reps × kg; bodyweight sets add 0', () => {
    const v = sessionVolume([
      log({ reps: 8, weightKg: 20 }),
      log({ reps: 10, weightKg: 22.5 }),
      log({ exerciseId: 'Pushups', reps: 15, weightKg: 0 }),
    ]);
    expect(v).toBe(160 + 225);
  });

  it('works in kg for lb-entered weights', () => {
    const w = fromUnit(35, 'lb'); // stored as kg
    expect(sessionVolume([log({ reps: 8, weightKg: w })])).toBeCloseTo(8 * 15.876, 2);
  });
});

describe('volumeVsLast', () => {
  it('is null with no previous session or a zero previous volume', () => {
    expect(volumeVsLast([log()], [])).toBeNull();
    expect(volumeVsLast([log()], [log({ weightKg: 0 })])).toBeNull();
  });

  it('is the rounded percent change', () => {
    expect(volumeVsLast([log({ reps: 9 })], [log({ reps: 8 })])).toBe(13); // 12.5 → 13
    expect(volumeVsLast([log({ reps: 8 })], [log({ reps: 10 })])).toBe(-20);
    expect(volumeVsLast([log()], [log()])).toBe(0);
  });
});

describe('previousSameDaySession', () => {
  it('finds the latest earlier finished session of the same day', () => {
    const a = sess(at(11, 2), { dayId: 'push-a' });
    const b = sess(at(11, 4), { dayId: 'pull-a' });
    const c = sess(at(11, 5), { dayId: 'push-a', endedAt: undefined });
    const d = sess(at(11, 6), { dayId: 'push-a' });
    const cur = sess(at(11, 9), { dayId: 'push-a' });
    expect(previousSameDaySession([cur, a, b, c, d], cur.sessionId)?.sessionId).toBe(d.sessionId);
    expect(previousSameDaySession([cur, b], cur.sessionId)).toBeNull();
    expect(previousSameDaySession([a], 'missing')).toBeNull();
  });
});

describe('lastSession', () => {
  it('is null with no finished session', () => {
    expect(lastSession([], [])).toBeNull();
    expect(lastSession([sess(at(11, 9), { endedAt: undefined })], [])).toBeNull();
  });

  it('gives day, duration, volume and date of the latest finished session', () => {
    const old = sess(at(11, 2), { dayId: 'pull-a' });
    const latest = sess(at(11, 4), { dayId: 'push-a', endedAt: at(11, 4) + 50 * 60_000 });
    const open = sess(at(11, 5), { endedAt: undefined });
    const sets = [
      log({ sessionId: latest.sessionId, reps: 8, weightKg: 20 }),
      log({ sessionId: latest.sessionId, reps: 10, weightKg: 0 }),
      log({ sessionId: old.sessionId, reps: 100, weightKg: 100 }),
    ];
    expect(lastSession([old, open, latest], sets)).toEqual({
      sessionId: latest.sessionId,
      dayId: 'push-a',
      date: at(11, 4),
      durationMs: 50 * 60_000,
      volumeKg: 160,
    });
  });
});

describe('newBests', () => {
  const hist = (reps: number, weightKg: number, ex = 'Dumbbell_Bench_Press') =>
    log({ sessionId: 'old', exerciseId: ex, reps, weightKg });

  it('the first-ever session has no bests', () => {
    expect(newBests([log({ reps: 12, weightKg: 30 })], [])).toEqual([]);
  });

  it('more weight is a best, with the old value', () => {
    expect(newBests([log({ reps: 6, weightKg: 22.5 })], [hist(8, 20), hist(10, 17.5)])).toEqual([
      {
        exerciseId: 'Dumbbell_Bench_Press',
        kind: 'weight',
        weightKg: 22.5,
        reps: 6,
        old: { weightKg: 20, reps: 8 },
      },
    ]);
  });

  it('more reps at the same weight is a best', () => {
    expect(newBests([log({ reps: 9, weightKg: 20 })], [hist(8, 20)])).toEqual([
      {
        exerciseId: 'Dumbbell_Bench_Press',
        kind: 'reps',
        weightKg: 20,
        reps: 9,
        old: { weightKg: 20, reps: 8 },
      },
    ]);
  });

  it('more reps at a lower weight is not a best', () => {
    expect(newBests([log({ reps: 15, weightKg: 17.5 })], [hist(8, 20)])).toEqual([]);
  });

  it('matching the old best is not a best', () => {
    expect(newBests([log({ reps: 8, weightKg: 20 })], [hist(8, 20)])).toEqual([]);
  });

  it('compares lb-entered weights stored as odd kg as equal', () => {
    const w = fromUnit(35, 'lb');
    const today = [log({ reps: 9, weightKg: fromUnit(35, 'lb') })];
    const out = newBests(today, [hist(8, w + 1e-9)]);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('reps');
  });

  it('uses the top set today (heaviest, then most reps), one entry per exercise', () => {
    const today = [
      log({ reps: 10, weightKg: 20 }),
      log({ reps: 7, weightKg: 22.5 }),
      log({ reps: 6, weightKg: 22.5 }),
    ];
    const out = newBests(today, [hist(8, 20)]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: 'weight', weightKg: 22.5, reps: 7 });
  });

  it('bodyweight exercises compare reps', () => {
    const today = [log({ exerciseId: 'Pushups', reps: 16, weightKg: 0 })];
    expect(newBests(today, [hist(15, 0, 'Pushups')])).toEqual([
      {
        exerciseId: 'Pushups',
        kind: 'reps',
        weightKg: 0,
        reps: 16,
        old: { weightKg: 0, reps: 15 },
      },
    ]);
  });

  it('an exercise without history has no best; others still count; order follows today', () => {
    const today = [
      log({ exerciseId: 'New_Move', reps: 10, weightKg: 10 }),
      log({ exerciseId: 'Pushups', reps: 20, weightKg: 0 }),
      log({ reps: 9, weightKg: 20 }),
    ];
    const out = newBests(today, [hist(8, 20), hist(15, 0, 'Pushups')]);
    expect(out.map((b) => b.exerciseId)).toEqual(['Pushups', 'Dumbbell_Bench_Press']);
  });

  it('ignores history rows from today’s own sessions and 0-rep sets', () => {
    const today = [log({ reps: 9, weightKg: 20 })];
    expect(newBests(today, [log({ reps: 9, weightKg: 20 })])).toEqual([]);
    expect(newBests(today, [...today, hist(8, 20)])).toHaveLength(1);
    expect(newBests([log({ reps: 0, weightKg: 30 })], [hist(8, 20)])).toEqual([]);
    expect(newBests(today, [hist(0, 40)])).toEqual([]);
  });
});

describe('purity', () => {
  it('runs without a DOM', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
  });
});
