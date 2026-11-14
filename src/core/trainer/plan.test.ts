import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REST_WEEKDAYS,
  addDate,
  calendar,
  effectiveDay,
  localDate,
  programHash,
  seedPlan,
  upNext,
  weekdayOf,
  type PlanSession,
} from './plan';
import type { DayOverride, PlannedExercise, Program, ProgramDay, TrainerState } from '../types';

// Made-up program and history (the repo is public). Dates are local; 2026-11-09 is a Monday,
// 2026-11-15 a Sunday. Times are built with new Date(y, m, d, h, min), so tests hold in any zone.
const ex = (exerciseId: string, over: Partial<PlannedExercise> = {}): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
  ...over,
});
const day = (id: string): ProgramDay => ({
  id,
  name: id.toUpperCase(),
  exercises: [ex(`${id}-x`), ex(`${id}-y`)],
});
const PROGRAM: Program = {
  name: 'Test PPL',
  weightUnit: 'kg',
  days: ['a', 'b', 'c', 'd', 'e', 'f'].map(day),
};

const at = (m: number, d: number, h = 18, min = 0) => new Date(2026, m - 1, d, h, min).getTime();
let n = 0;
const done = (dayId: string, startedAt: number): PlanSession => ({
  sessionId: `s${n++}`,
  dayId,
  startedAt,
  endedAt: startedAt + 3_600_000,
});
const unfinished = (dayId: string, startedAt: number): PlanSession => ({
  sessionId: `s${n++}`,
  dayId,
  startedAt,
});

/** The first exercise of the first day (throws if missing). */
const firstEx = (days: ProgramDay[]): PlannedExercise => {
  const e = days[0]?.exercises[0];
  if (!e) throw new Error('no exercise');
  return e;
};

/** A seeded state with these rest weekdays and overrides. */
const st = (restWeekdays: number[] = [], overrides: DayOverride[] = []): TrainerState => {
  const s = seedPlan(PROGRAM);
  return { ...s, schedule: { ...s.schedule, restWeekdays }, overrides };
};
const ids = (state: TrainerState, sessions: PlanSession[], from: string, days: number) =>
  calendar(state, sessions, from, days).map((e) => (e.rest ? '-' : e.dayId));

describe('local dates', () => {
  it('formats a local time as YYYY-MM-DD', () => {
    expect(localDate(at(11, 9, 7))).toBe('2026-11-09');
    expect(localDate(new Date(2026, 0, 5, 0, 0).getTime())).toBe('2026-01-05');
  });

  it('Sunday 23:59 and Monday 00:00 are different days and weeks', () => {
    expect(localDate(at(11, 15, 23, 59))).toBe('2026-11-15');
    expect(localDate(at(11, 16, 0, 0))).toBe('2026-11-16');
    expect(weekdayOf('2026-11-15')).toBe(0);
    expect(weekdayOf('2026-11-16')).toBe(1);
  });

  it('adds calendar days across month and year ends', () => {
    expect(addDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDate('2026-11-09', -14)).toBe('2026-10-26');
  });

  it('is DST-safe: every local midnight and 23:59 in the DST months maps to its own date', () => {
    // March and Oct/Nov hold the DST switches in the US and EU; whatever zone runs the test.
    for (const [m, days] of [
      [3, 31],
      [10, 31],
      [11, 30],
    ] as const) {
      for (let d = 1; d <= days; d++) {
        const want = `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        expect(localDate(new Date(2026, m - 1, d, 0, 0).getTime())).toBe(want);
        expect(localDate(new Date(2026, m - 1, d, 23, 59).getTime())).toBe(want);
        if (d > 1)
          expect(addDate(want, -1)).toBe(localDate(new Date(2026, m - 1, d - 1, 12).getTime()));
      }
    }
  });
});

describe('seedPlan', () => {
  it('copies the program, rotation = program order, rest = Sunday (M10-q1 default)', () => {
    const s = seedPlan(PROGRAM);
    expect(s.version).toBe(0);
    expect(s.plan.days).toEqual(PROGRAM.days);
    expect(s.plan.days).not.toBe(PROGRAM.days);
    expect(s.plan.days[0]?.exercises).not.toBe(PROGRAM.days[0]?.exercises);
    expect(s.plan.edited).toBe(false);
    expect(s.plan.seededFrom).toBe(programHash(PROGRAM));
    expect(s.schedule).toEqual({ rotation: ['a', 'b', 'c', 'd', 'e', 'f'], restWeekdays: [0] });
    expect(DEFAULT_REST_WEEKDAYS).toEqual([0]);
    expect(s.overrides).toEqual([]);
  });

  it('a deep copy: editing the plan never touches the program', () => {
    const s = seedPlan(PROGRAM);
    firstEx(s.plan.days).sets = 99;
    expect(firstEx(PROGRAM.days).sets).toBe(3);
  });

  it('the hash is stable and changes with the program', () => {
    expect(programHash(PROGRAM)).toBe(programHash(structuredClone(PROGRAM)));
    const changed = structuredClone(PROGRAM);
    firstEx(changed.days.slice(1)).sets = 4;
    expect(programHash(changed)).not.toBe(programHash(PROGRAM));
    expect(programHash(PROGRAM)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('calendar: rotation', () => {
  it('starts the rotation at the first day with no history', () => {
    expect(ids(st(), [], '2026-11-09', 7)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'a']);
  });

  it('continues after the last finished session, by start time', () => {
    const sessions = [done('c', at(11, 6)), done('a', at(11, 4))];
    expect(ids(st(), sessions, '2026-11-09', 3)).toEqual(['d', 'e', 'f']);
  });

  it('ignores unfinished sessions', () => {
    const sessions = [done('b', at(11, 6)), unfinished('c', at(11, 7))];
    expect(ids(st(), sessions, '2026-11-09', 2)).toEqual(['c', 'd']);
  });

  it('wraps after the last rotation day', () => {
    expect(ids(st(), [done('f', at(11, 7))], '2026-11-09', 2)).toEqual(['a', 'b']);
  });

  it("a session day that is not in the rotation restarts it (like today's app)", () => {
    expect(ids(st(), [done('gone', at(11, 7))], '2026-11-09', 1)).toEqual(['a']);
  });

  it('missed days do not skip rotation days', () => {
    // Last trained Monday 11-02; nothing since. Today (11-09) is still the next day.
    expect(ids(st([0]), [done('b', at(11, 2))], '2026-11-09', 2)).toEqual(['c', 'd']);
  });

  it('marks dates with a finished session as done and continues after them', () => {
    const sessions = [done('a', at(11, 9)), done('b', at(11, 10))];
    const cal = calendar(st(), sessions, '2026-11-09', 4);
    expect(cal.map((e) => [e.date, e.dayId, e.done])).toEqual([
      ['2026-11-09', 'a', true],
      ['2026-11-10', 'b', true],
      ['2026-11-11', 'c', false],
      ['2026-11-12', 'd', false],
    ]);
  });

  it('two sessions on one date: the later one counts', () => {
    const sessions = [done('a', at(11, 9, 7)), done('d', at(11, 9, 19))];
    expect(ids(st(), sessions, '2026-11-09', 2)).toEqual(['d', 'e']);
  });

  it('a session finished on a rest weekday ("Train anyway") shows as done', () => {
    const cal = calendar(st([0]), [done('a', at(11, 15))], '2026-11-15', 2);
    expect(cal[0]).toMatchObject({ date: '2026-11-15', dayId: 'a', rest: false, done: true });
    expect(cal[1]).toMatchObject({ date: '2026-11-16', dayId: 'b' });
  });

  it('a past week (strip from Monday) uses the sessions of that week', () => {
    // Monday trained a, Tuesday missed, Wednesday trained b; today is Thursday.
    const sessions = [done('f', at(11, 7)), done('a', at(11, 9)), done('b', at(11, 11))];
    expect(ids(st([0]), sessions, '2026-11-09', 7)).toEqual(['a', 'b', 'b', 'c', 'd', 'e', '-']);
    // Tuesday shows the day that was up next then (b), even though it was missed.
  });

  it('returns `days` consecutive dates and nothing for days <= 0', () => {
    const cal = calendar(st(), [], '2026-12-29', 5);
    expect(cal.map((e) => e.date)).toEqual([
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(calendar(st(), [], '2026-12-29', 0)).toEqual([]);
  });
});

describe('calendar: rest weekdays', () => {
  it('Sunday is rest and the rotation waits for Monday', () => {
    const cal = calendar(st([0]), [], '2026-11-12', 6);
    expect(cal.map((e) => (e.rest ? '-' : e.dayId))).toEqual(['a', 'b', 'c', '-', 'd', 'e']);
    expect(cal[3]).toMatchObject({ date: '2026-11-15', dayId: null, rest: true, done: false });
  });

  it('several rest weekdays', () => {
    // Wed (3) and Sun (0) off.
    expect(ids(st([3, 0]), [], '2026-11-09', 8)).toEqual(['a', 'b', '-', 'c', 'd', 'e', '-', 'f']);
  });

  it('Sunday 23:59 is still the rest day; Monday 00:00 trains', () => {
    const s = st([0]);
    expect(calendar(s, [], localDate(at(11, 15, 23, 59)), 1)[0]).toMatchObject({ rest: true });
    expect(calendar(s, [], localDate(at(11, 16, 0, 0)), 1)[0]).toMatchObject({
      rest: false,
      dayId: 'a',
    });
  });

  it('a DST week has 7 dates with one Sunday rest (US 2026-11-01, EU 2026-10-25)', () => {
    for (const from of ['2026-10-26', '2026-10-19', '2026-11-01', '2026-03-02', '2026-03-23']) {
      const cal = calendar(st([0]), [], from, 7);
      const dates = cal.map((e) => e.date);
      expect(new Set(dates).size).toBe(7);
      expect(cal.filter((e) => e.rest)).toHaveLength(1);
      expect(cal.filter((e) => e.rest)[0]?.date).toSatisfy((d: string) => weekdayOf(d) === 0);
    }
  });
});

describe('calendar: overrides', () => {
  it('a rest override makes a training day rest; the rotation continues next day', () => {
    const s = st([0], [{ date: '2026-11-10', rest: true }]);
    const cal = calendar(s, [], '2026-11-09', 7);
    expect(cal.map((e) => (e.rest ? '-' : e.dayId))).toEqual(['a', '-', 'b', 'c', 'd', 'e', '-']);
    expect(cal[1]?.override).toEqual({ date: '2026-11-10', rest: true });
  });

  it('a train override on a rest weekday takes the next rotation day ("use the rest day")', () => {
    const s = st([0], [{ date: '2026-11-10', rest: true }, { date: '2026-11-15' }]);
    expect(ids(s, [], '2026-11-09', 8)).toEqual(['a', '-', 'b', 'c', 'd', 'e', 'f', 'a']);
  });

  it('a train override with a dayId runs that day and the rotation continues after it', () => {
    const s = st([0], [{ date: '2026-11-15', dayId: 'd' }]);
    expect(ids(s, [], '2026-11-12', 5)).toEqual(['a', 'b', 'c', 'd', 'e']);
    const jump = st([], [{ date: '2026-11-10', dayId: 'e' }]);
    expect(ids(jump, [], '2026-11-09', 3)).toEqual(['a', 'e', 'f']);
  });

  it('a train override with an unknown dayId keeps the rotation where it was', () => {
    const s = st([], [{ date: '2026-11-10', dayId: 'zz' }]);
    expect(ids(s, [], '2026-11-09', 3)).toEqual(['a', 'zz', 'b']);
  });

  it('an adjust-only override keeps the rotation day', () => {
    const adjust = {
      kind: 'lighter' as const,
      exercises: [ex('a-x', { sets: 2, adjusted: 'lighter' })],
    };
    const s = st([], [{ date: '2026-11-09', adjust }]);
    const cal = calendar(s, [], '2026-11-09', 2);
    expect(cal[0]).toMatchObject({ dayId: 'a', rest: false, override: { adjust } });
    expect(cal[1]?.dayId).toBe('b');
  });

  it('overrides before fromDate are ignored; the newest override for a date wins', () => {
    const s = st(
      [],
      [
        { date: '2026-11-08', rest: true },
        { date: '2026-11-09', rest: true },
        { date: '2026-11-09', dayId: 'c' },
      ],
    );
    expect(ids(s, [], '2026-11-09', 2)).toEqual(['c', 'd']);
  });

  it('a finished session beats a rest override on the same date', () => {
    const s = st([], [{ date: '2026-11-09', rest: true }]);
    const cal = calendar(s, [done('a', at(11, 9))], '2026-11-09', 2);
    expect(cal[0]).toMatchObject({ dayId: 'a', rest: false, done: true });
  });

  it('postponing twice slides the rotation by two days', () => {
    const s = st(
      [0],
      [
        { date: '2026-11-10', rest: true },
        { date: '2026-11-11', rest: true },
      ],
    );
    expect(ids(s, [done('f', at(11, 7))], '2026-11-09', 7)).toEqual([
      'a',
      '-',
      '-',
      'b',
      'c',
      'd',
      '-',
    ]);
  });
});

describe('effectiveDay', () => {
  it('is the rotation day as it will run', () => {
    const e = effectiveDay(st([0]), [done('a', at(11, 9))], '2026-11-10');
    expect(e).toMatchObject({ date: '2026-11-10', rest: false, done: false, adjusted: null });
    expect(e.day).toEqual(PROGRAM.days[1]);
  });

  it('uses the user plan, not the program', () => {
    const s = st();
    s.plan.days = s.plan.days.map((d, i) => (i === 0 ? { ...d, name: 'Mine' } : d));
    expect(effectiveDay(s, [], '2026-11-09').day?.name).toBe('Mine');
  });

  it('applies an adjust override (exercises replaced, id and name kept)', () => {
    const exercises = [ex('a-x', { sets: 2, weightKgToday: 9, adjusted: 'lighter' })];
    const s = st([], [{ date: '2026-11-09', adjust: { kind: 'lighter', exercises } }]);
    const e = effectiveDay(s, [], '2026-11-09');
    expect(e.day).toEqual({ id: 'a', name: 'A', exercises });
    expect(e.adjusted).toBe('lighter');
    // The plan itself is untouched.
    expect(s.plan.days[0]?.exercises).toHaveLength(2);
  });

  it('a rest date has rest: true and `day` = what "Train anyway" runs', () => {
    const e = effectiveDay(st([0]), [done('c', at(11, 13))], '2026-11-15');
    expect(e.rest).toBe(true);
    expect(e.day?.id).toBe('d');
    expect(e.adjusted).toBeNull();
  });

  it('a day id missing from the plan → day null', () => {
    const s = st([], [{ date: '2026-11-09', dayId: 'zz' }]);
    expect(effectiveDay(s, [], '2026-11-09').day).toBeNull();
  });
});

describe('upNext', () => {
  /** Today's app (app.ts loadUpNext): the day after the last session, in program order. */
  const todaysApp = (sessions: PlanSession[]): string | null => {
    const last = [...sessions].sort((a, b) => a.startedAt - b.startedAt).at(-1);
    const idx = last ? PROGRAM.days.findIndex((d) => d.id === last.dayId) : -1;
    return PROGRAM.days[(idx + 1) % PROGRAM.days.length]?.id ?? null;
  };

  it("equals today's app behaviour with no overrides and no rest weekdays (no regression)", () => {
    const histories: PlanSession[][] = [
      [],
      [done('a', at(11, 2))],
      [done('a', at(11, 2)), done('b', at(11, 3)), done('c', at(11, 4))],
      [done('f', at(11, 7))],
      [done('gone', at(11, 7))],
      [done('e', at(11, 8)), done('b', at(11, 1))],
      [done('a', at(11, 9, 7))], // already trained today
      [done('c', at(11, 9, 7)), done('d', at(11, 9, 19))],
    ];
    for (const h of histories) {
      for (const today of ['2026-11-09', '2026-11-12', '2026-11-15']) {
        expect(upNext(st([]), h, today)?.dayId).toBe(todaysApp(h));
      }
    }
  });

  it('is today when today trains, else the next training date', () => {
    expect(upNext(st([0]), [done('a', at(11, 9))], '2026-11-10')).toEqual({
      date: '2026-11-10',
      dayId: 'b',
    });
    // Sunday rest: Monday.
    expect(upNext(st([0]), [done('a', at(11, 14))], '2026-11-15')).toEqual({
      date: '2026-11-16',
      dayId: 'b',
    });
    // Already trained today: the next date.
    expect(upNext(st([]), [done('a', at(11, 9))], '2026-11-09')).toEqual({
      date: '2026-11-10',
      dayId: 'b',
    });
  });

  it('follows overrides (postponed today)', () => {
    const s = st([0], [{ date: '2026-11-10', rest: true }]);
    expect(upNext(s, [done('a', at(11, 9))], '2026-11-10')).toEqual({
      date: '2026-11-11',
      dayId: 'b',
    });
  });

  it('never leaves Start without a day: all weekdays rest → today with the rotation day', () => {
    expect(upNext(st([0, 1, 2, 3, 4, 5, 6]), [done('a', at(11, 2))], '2026-11-09')).toEqual({
      date: '2026-11-09',
      dayId: 'b',
    });
  });

  it('an empty rotation → null', () => {
    const s = st();
    s.schedule.rotation = [];
    expect(upNext(s, [], '2026-11-09')).toBeNull();
  });
});
