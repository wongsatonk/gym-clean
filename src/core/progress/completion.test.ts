import { describe, expect, it } from 'vitest';
import {
  FIXTURE_CATALOG,
  FIXTURE_PROGRAM,
  FIXTURE_SESSIONS,
  FIXTURE_SETS,
  fixtureState,
} from '../testkit/progressFixture';
import { addDate, localDate } from '../trainer/plan';
import { weekStartOf } from '../stats';
import {
  dayCompletion,
  missedDay,
  monthCompletion,
  monthScore,
  periodScore,
  weekScore,
  weekStart,
  type CompletionInput,
  type CompletionSession,
  type CompletionSet,
} from './completion';
import type { FocusBlock, ProgramDay } from '../types';

// Made-up history (fixtures/twoWeeks.json); the repo is public.
const program = FIXTURE_PROGRAM;
const SESSIONS = FIXTURE_SESSIONS;
const SETS = FIXTURE_SETS;
const state = fixtureState;
const CATALOG = FIXTURE_CATALOG;
const TODAY = '2026-11-16';
const input = (over: Partial<CompletionInput> = {}): CompletionInput => ({
  state: state(),
  sessions: SESSIONS,
  sets: SETS,
  today: TODAY,
  ...over,
});

describe('dayCompletion', () => {
  it('done: every planned set logged, per exercise with reps', () => {
    const c = dayCompletion(input(), '2026-11-09');
    expect(c).toEqual({
      date: '2026-11-09',
      status: 'done',
      dayId: 'a',
      setsPlanned: 6,
      setsDone: 6,
      exercises: [
        {
          exerciseId: 'press',
          setsPlanned: 3,
          setsDone: 3,
          repsTarget: [8, 12],
          reps: [10, 9, 8],
          status: 'done',
        },
        {
          exerciseId: 'squat',
          setsPlanned: 3,
          setsDone: 3,
          repsTarget: [8, 12],
          reps: [12, 11, 10],
          status: 'done',
        },
      ],
    });
  });

  it('partial: some sets; exercise statuses done / partial', () => {
    const c = dayCompletion(input(), '2026-11-11');
    expect(c.status).toBe('partial');
    expect([c.setsPlanned, c.setsDone]).toEqual([6, 4]);
    expect(c.exercises.map((e) => e.status)).toEqual(['done', 'partial']);
  });

  it('missed: a past training date with no finished session', () => {
    const c = dayCompletion(input(), '2026-11-13');
    expect(c).toMatchObject({ status: 'missed', dayId: 'c', setsPlanned: 6, setsDone: 0 });
    expect(c.exercises.map((e) => e.status)).toEqual(['missed', 'missed']);
  });

  it('rest: a rest date; an unfinished session there is ignored', () => {
    expect(dayCompletion(input(), '2026-11-10')).toMatchObject({
      status: 'rest',
      dayId: null,
      setsPlanned: 0,
    });
    expect(dayCompletion(input(), '2026-11-12')).toMatchObject({ status: 'rest', setsDone: 0 });
  });

  it('extra: a session on a rest date counts its sets but plans none', () => {
    const c = dayCompletion(input(), '2026-11-15');
    expect(c).toMatchObject({ status: 'extra', dayId: 'a', setsPlanned: 0, setsDone: 3 });
    expect(c.exercises).toEqual([
      {
        exerciseId: 'press',
        setsPlanned: 0,
        setsDone: 3,
        repsTarget: [8, 12],
        reps: [10, 10, 9],
        status: 'done',
      },
    ]);
  });

  it('planned: today without a session, and future dates', () => {
    expect(dayCompletion(input(), TODAY)).toMatchObject({
      status: 'planned',
      dayId: 'b',
      setsPlanned: 6,
    });
    expect(dayCompletion(input(), '2026-11-18')).toMatchObject({ status: 'planned', dayId: 'c' });
    expect(dayCompletion(input(), '2026-11-17').status).toBe('rest');
  });

  it('before his first finished session nothing was planned (empty history too)', () => {
    expect(dayCompletion(input(), '2026-11-06')).toMatchObject({
      status: 'rest',
      dayId: null,
      setsPlanned: 0,
    });
    const empty = input({ sessions: [], sets: [] });
    expect(dayCompletion(empty, '2026-11-13').status).toBe('rest');
    expect(dayCompletion(empty, TODAY).status).toBe('planned');
    expect(dayCompletion(empty, '2026-11-18').status).toBe('planned');
  });

  it('a session that runs past midnight counts on its start date', () => {
    const late: CompletionSession = {
      sessionId: 'late',
      dayId: 'c',
      startedAt: new Date(2026, 10, 13, 23, 30).getTime(),
      endedAt: new Date(2026, 10, 14, 0, 40).getTime(),
    };
    const sets: CompletionSet[] = [
      ...SETS.filter((s) => s.sessionId !== 's4'),
      { sessionId: 'late', exerciseId: 'fly', reps: 12 },
    ];
    const sessions = SESSIONS.filter((s) => s.sessionId !== 's4').concat(late);
    expect(dayCompletion(input({ sessions, sets }), '2026-11-13')).toMatchObject({
      status: 'partial',
      setsDone: 1,
    });
    expect(dayCompletion(input({ sessions, sets }), '2026-11-14').status).toBe('missed');
  });

  it('a lighter / deload day: planned = the adjusted rows', () => {
    const rows =
      program.days[1]?.exercises.map((p) => ({ ...p, sets: 2, adjusted: 'lighter' as const })) ??
      [];
    const s = state({
      overrides: [{ date: '2026-11-11', dayId: 'b', adjust: { kind: 'lighter', exercises: rows } }],
    });
    const c = dayCompletion(input({ state: s }), '2026-11-11');
    expect([c.setsPlanned, c.setsDone]).toEqual([4, 3]);
    expect(c.exercises.map((e) => e.status)).toEqual(['done', 'partial']);
    const deload = state({
      overrides: [{ date: '2026-11-13', dayId: 'c', adjust: { kind: 'deload', exercises: rows } }],
    });
    expect(dayCompletion(input({ state: deload }), '2026-11-13').setsPlanned).toBe(4);
  });

  it('extra sets beyond the plan never count past 100% per exercise', () => {
    const sets = [...SETS, { sessionId: 's1', exerciseId: 'press', reps: 6 }];
    const c = dayCompletion(input({ sets }), '2026-11-09');
    expect(c.setsDone).toBe(6);
    expect(c.exercises[0]?.setsDone).toBe(4);
  });
});

describe('scores', () => {
  it('a week: sessions done / planned, sets done / due, extra', () => {
    expect(periodScore(input(), '2026-11-09', '2026-11-15')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      sessionsPlanned: 4,
      sessionsDone: 3,
      setsPlanned: 24,
      setsDone: 16,
      extra: 1,
    });
  });

  it('this week counts the whole week of sessions, but only sets due so far', () => {
    expect(weekScore(input(), TODAY)).toMatchObject({
      from: '2026-11-16',
      to: '2026-11-22',
      sessionsPlanned: 4,
      sessionsDone: 0,
      setsPlanned: 0,
      setsDone: 0,
    });
  });

  it('a month: November so far', () => {
    expect(monthScore(input(), '2026-11')).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      sessionsDone: 3,
      setsPlanned: 24,
      setsDone: 16,
      extra: 1,
    });
    expect(monthCompletion(input(), '2026-11')).toHaveLength(30);
    expect(monthCompletion(input(), '2026-02')).toHaveLength(28);
  });

  it('empty history: nothing due, nothing done', () => {
    expect(periodScore(input({ sessions: [], sets: [] }), '2026-11-09', '2026-11-15')).toEqual({
      from: '2026-11-09',
      to: '2026-11-15',
      sessionsPlanned: 0,
      sessionsDone: 0,
      setsPlanned: 0,
      setsDone: 0,
      extra: 0,
    });
  });

  it('weeks are Mon–Sun like weekStartOf, across DST changes', () => {
    for (const date of [
      '2026-11-01',
      '2026-11-02',
      '2026-03-08',
      '2026-03-09',
      '2026-10-25',
      '2026-03-29',
    ]) {
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      expect(weekStart(date), date).toBe(
        localDate(weekStartOf(new Date(y, m - 1, d, 12).getTime())),
      );
    }
    // A DST week has 7 dates; sessions near midnight land on their own dates.
    const sessions: CompletionSession[] = [
      {
        sessionId: 'x',
        dayId: 'a',
        startedAt: new Date(2026, 9, 26, 18).getTime(),
        endedAt: new Date(2026, 9, 26, 19).getTime(),
      },
      {
        sessionId: 'y',
        dayId: 'b',
        startedAt: new Date(2026, 9, 31, 23, 50).getTime(),
        endedAt: new Date(2026, 10, 1, 1, 30).getTime(),
      },
      {
        sessionId: 'z',
        dayId: 'c',
        startedAt: new Date(2026, 10, 1, 0, 30).getTime(),
        endedAt: new Date(2026, 10, 1, 1, 0).getTime(),
      },
    ];
    const sets: CompletionSet[] = [
      { sessionId: 'x', exerciseId: 'press', reps: 8 },
      { sessionId: 'y', exerciseId: 'row', reps: 8 },
      { sessionId: 'z', exerciseId: 'fly', reps: 8 },
    ];
    const i = input({ sessions, sets, today: '2026-11-03' });
    const week = weekScore(i, '2026-11-01');
    expect([week.from, week.to]).toEqual(['2026-10-26', '2026-11-01']);
    expect(dayCompletion(i, '2026-10-31')).toMatchObject({ dayId: 'b', setsDone: 1 });
    expect(dayCompletion(i, '2026-11-01')).toMatchObject({
      status: 'extra',
      dayId: 'c',
      setsDone: 1,
    });
    expect(addDate(week.from, 6)).toBe(week.to);
  });

  it('focus sets vs the block target during a focus block', () => {
    const blockDay = (id: string): ProgramDay => {
      const d = program.days.find((x) => x.id === id);
      if (!d) throw new Error(id);
      const extra = id === 'c' ? 'press' : 'fly';
      const first = d.exercises[0];
      if (!first) throw new Error(id);
      return {
        ...d,
        exercises: [...d.exercises.map((p) => ({ ...p })), { ...first, exerciseId: extra }],
      };
    };
    const ids = ['b', 'c', 'a'];
    let k = 0;
    const block: FocusBlock = {
      id: 'focus-test',
      group: 'chest',
      startDate: '2026-11-16',
      weeks: 2,
      weekdays: [1, 3, 5],
      days: Array.from({ length: 14 }, (_, i) => {
        const date = addDate('2026-11-16', i);
        const wd = new Date(Date.UTC(2026, 10, 16 + i)).getUTCDay();
        return { date, day: [1, 3, 5].includes(wd) ? blockDay(ids[k++ % 3] ?? 'a') : null };
      }),
      targetSetsPerWeek: 9,
      baseSetsPerWeek: 6,
    };
    const t = new Date(2026, 10, 16, 18).getTime();
    const sessions = [
      ...SESSIONS,
      { sessionId: 'f1', dayId: 'b', startedAt: t, endedAt: t + 3_600_000 },
    ];
    const sets = [
      ...SETS,
      { sessionId: 'f1', exerciseId: 'row', reps: 10 },
      { sessionId: 'f1', exerciseId: 'fly', reps: 12 },
      { sessionId: 'f1', exerciseId: 'fly', reps: 12 },
    ];
    const i = input({
      state: state({ blocks: [block] }),
      sessions,
      sets,
      today: '2026-11-18',
      catalog: CATALOG,
    });
    expect(dayCompletion(i, '2026-11-16')).toMatchObject({
      blockId: 'focus-test',
      setsPlanned: 9,
      setsDone: 3,
    });
    expect(weekScore(i, '2026-11-18').focus).toEqual({ group: 'chest', sets: 2, target: 9 });
    // November holds all 14 block dates → target 9 × 14 / 7.
    expect(monthScore(i, '2026-11').focus).toEqual({ group: 'chest', sets: 2, target: 18 });
    // No block in the period, or no catalog → no focus.
    expect(weekScore(i, '2026-11-09').focus).toBeUndefined();
    const { catalog: _c, ...noCatalog } = i;
    void _c;
    expect(weekScore(noCatalog, '2026-11-18').focus).toBeUndefined();
  });
});

describe('missedDay', () => {
  it('the newest missed planned date in the last 7 days', () => {
    expect(missedDay(input(), [])).toEqual({ date: '2026-11-13', dayId: 'c', name: 'Day C' });
  });

  it('once: an answered date (or any newer answer) hides it and every older one', () => {
    expect(missedDay(input(), ['2026-11-13'])).toBeNull();
    expect(missedDay(input(), ['2026-11-14'])).toBeNull();
    // An older answer doesn't hide a newer miss.
    expect(missedDay(input(), ['2026-11-02'])).toEqual({
      date: '2026-11-13',
      dayId: 'c',
      name: 'Day C',
    });
  });

  it('nothing older than 7 days, nothing with an empty history', () => {
    // Fri 13th is 8 days back; the week since has only rest days he asked for.
    const rested = state({
      overrides: ['2026-11-16', '2026-11-18', '2026-11-20'].map((date) => ({
        date,
        rest: true as const,
      })),
    });
    expect(missedDay(input({ today: '2026-11-21', state: rested }), [])).toBeNull();
    expect(missedDay(input({ sessions: [], sets: [] }), [])).toBeNull();
  });
});

// ---------- no fixed rest weekdays: a weekly target ----------

// Made-up 6-day plan, one 3-set exercise per day; restWeekdays empty (the app default).
const SIX: ProgramDay[] = Array.from({ length: 6 }, (_, i) => ({
  id: `d${i + 1}`,
  name: `Day ${i + 1}`,
  exercises: [
    {
      exerciseId: `ex${i + 1}`,
      sets: 3,
      targetReps: [8, 12] as [number, number],
      restSec: 90,
      tracking: 'manual' as const,
    },
  ],
}));
const sixState = (rotation = SIX.map((d) => d.id), restWeekdays: number[] = []) => {
  const days = SIX.filter((d) => rotation.includes(d.id));
  return planState({ name: 'Made-up six', weightUnit: 'kg', days }, rotation, restWeekdays);
};
function planState(
  p: { name: string; weightUnit: 'kg'; days: ProgramDay[] },
  rotation: string[],
  restWeekdays: number[],
) {
  return state({
    plan: { days: structuredClone(p.days), seededFrom: 'made-up', edited: false },
    schedule: { rotation, restWeekdays },
  });
}
/** Finished sessions on `dates`, walking the rotation; every planned set logged. */
function trained(dates: string[], rotation = SIX.map((d) => d.id)) {
  const sessions: CompletionSession[] = [];
  const sets: CompletionSet[] = [];
  dates.forEach((date, i) => {
    const dayId = rotation[i % rotation.length] ?? 'd1';
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const t = new Date(y, m - 1, d, 18).getTime();
    sessions.push({ sessionId: `t${i}`, dayId, startedAt: t, endedAt: t + 3_600_000 });
    const exerciseId = `ex${dayId.slice(1)}`;
    for (let k = 0; k < 3; k++) sets.push({ sessionId: `t${i}`, exerciseId, reps: 10 });
  });
  return { sessions, sets };
}
// Week of Mon 2026-11-02 … Sun 2026-11-08; the week before: Mon–Sat trained, Sun off.
const WEEK_BEFORE = [
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
];
const sixInput = (dates: string[], today: string, over: Partial<CompletionInput> = {}) => ({
  state: sixState(),
  ...trained([...WEEK_BEFORE, ...dates]),
  today,
  ...over,
});

describe('no fixed rest weekdays: weekly target = rotation length (max 6)', () => {
  it('6-day plan, one day off in a finished week: a rest day, no miss, "6 of 6"', () => {
    const i = sixInput(
      ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
      '2026-11-09',
    );
    expect(dayCompletion(i, '2026-11-04')).toMatchObject({
      status: 'rest',
      dayId: null,
      setsPlanned: 0,
    });
    expect(weekScore(i, '2026-11-04')).toMatchObject({
      sessionsPlanned: 6,
      sessionsDone: 6,
      setsPlanned: 18,
      setsDone: 18,
      extra: 0,
    });
    expect(missedDay(i, [])).toBeNull();
  });

  it('mid-week: one day off is rest, the week reads "of 6", only due sets count', () => {
    const i = sixInput(['2026-11-02', '2026-11-03'], '2026-11-05');
    expect(dayCompletion(i, '2026-11-04').status).toBe('rest');
    for (const d of ['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
      expect(dayCompletion(i, d).status, d).toBe('planned');
    expect(weekScore(i, '2026-11-05')).toMatchObject({
      sessionsPlanned: 6,
      sessionsDone: 2,
      setsPlanned: 6,
      setsDone: 6,
    });
    expect(missedDay(i, [])).toBeNull();
    // Nothing off yet: the rest day is still to come, the week is still 6.
    const fresh = sixInput(['2026-11-02', '2026-11-03', '2026-11-04'], '2026-11-05');
    expect(weekScore(fresh, '2026-11-05')).toMatchObject({ sessionsPlanned: 6, sessionsDone: 3 });
  });

  it('two days off in a week: the first is rest, the second missed; the card fires once', () => {
    const i = sixInput(['2026-11-02', '2026-11-05'], '2026-11-06');
    expect(dayCompletion(i, '2026-11-03').status).toBe('rest');
    expect(dayCompletion(i, '2026-11-04')).toMatchObject({
      status: 'missed',
      dayId: 'd2',
      setsPlanned: 3,
    });
    expect(weekScore(i, '2026-11-06')).toMatchObject({
      sessionsPlanned: 6,
      sessionsDone: 2,
      setsPlanned: 9,
      setsDone: 6,
    });
    expect(missedDay(i, [])).toEqual({ date: '2026-11-04', dayId: 'd2', name: 'Day 2' });
    expect(missedDay(i, ['2026-11-04'])).toBeNull();
    // Later that week, after he trained again: still nothing new.
    const later = sixInput(['2026-11-02', '2026-11-05', '2026-11-06'], '2026-11-07');
    expect(missedDay(later, ['2026-11-04'])).toBeNull();
    // A new week starts a fresh allowance: one day off there is rest again.
    const next = sixInput(
      ['2026-11-02', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
      '2026-11-11',
    );
    expect(dayCompletion(next, '2026-11-10').status).toBe('rest');
    expect(missedDay(next, ['2026-11-04'])).toBeNull();
  });

  it('a rest day he asked for uses the week’s day off', () => {
    const i = sixInput(['2026-11-02', '2026-11-04'], '2026-11-06', {
      state: sixState(undefined, []),
    });
    const s = { ...i.state, overrides: [{ date: '2026-11-03', rest: true as const }] };
    const c = { ...i, state: s };
    expect(dayCompletion(c, '2026-11-03').status).toBe('rest');
    expect(dayCompletion(c, '2026-11-05').status).toBe('missed');
    expect(missedDay(c, [])).toMatchObject({ date: '2026-11-05' });
  });

  it('target = rotation length capped at 6 (3-day rotation → 3, four days off free)', () => {
    const rot = ['d1', 'd2', 'd3'];
    const { sessions, sets } = trained(
      ['2026-10-26', '2026-11-02', '2026-11-04', '2026-11-06'],
      rot,
    );
    const i = { state: sixState(rot), sessions, sets, today: '2026-11-09' };
    expect(weekScore(i, '2026-11-02')).toMatchObject({ sessionsPlanned: 3, sessionsDone: 3 });
    expect(missedDay(i, [])).toBeNull();
    const early = trained(['2026-10-26', '2026-11-02'], rot);
    const cur = { ...i, ...early, today: '2026-11-03' };
    expect(weekScore(cur, '2026-11-03')).toMatchObject({ sessionsPlanned: 3, sessionsDone: 1 });
  });

  it('first week: days before his first session neither count nor use the day off', () => {
    const { sessions, sets } = trained(['2026-11-05', '2026-11-07']);
    const i = { state: sixState(), sessions, sets, today: '2026-11-08' };
    expect(dayCompletion(i, '2026-11-04').status).toBe('rest');
    expect(dayCompletion(i, '2026-11-06').status).toBe('rest');
    expect(missedDay(i, [])).toBeNull();
  });

  it('with fixed rest weekdays nothing changes: an untrained training day is missed', () => {
    const i = sixInput(['2026-11-02', '2026-11-03', '2026-11-05'], '2026-11-06', {
      state: sixState(undefined, [0]),
    });
    expect(dayCompletion(i, '2026-11-04').status).toBe('missed');
    expect(weekScore(i, '2026-11-04').sessionsPlanned).toBe(6);
    expect(missedDay(i, [])).toMatchObject({ date: '2026-11-04' });
    // The fixture (rest Tue/Thu/Sun) still reads 3 of 4.
    expect(weekScore(input(), '2026-11-09')).toMatchObject({ sessionsPlanned: 4, sessionsDone: 3 });
  });

  it('focus-block dates keep the block’s own rest days: an untrained block day is missed', () => {
    const s0 = sixState();
    const days: FocusBlock['days'] = Array.from({ length: 14 }, (_, k) => {
      const date = addDate('2026-11-02', k);
      const wd = new Date(Date.UTC(2026, 10, 2 + k)).getUTCDay();
      return { date, day: [1, 3, 5].includes(wd) ? (SIX[k % 6] ?? null) : null };
    });
    const block: FocusBlock = {
      id: 'focus-six',
      group: 'chest',
      startDate: '2026-11-02',
      weeks: 2,
      weekdays: [1, 3, 5],
      days,
      targetSetsPerWeek: 9,
      baseSetsPerWeek: 6,
    };
    const { sessions, sets } = trained(['2026-10-26', '2026-11-02']);
    const i = { state: { ...s0, blocks: [block] }, sessions, sets, today: '2026-11-06' };
    expect(dayCompletion(i, '2026-11-03').status).toBe('rest');
    expect(dayCompletion(i, '2026-11-04')).toMatchObject({
      status: 'missed',
      blockId: 'focus-six',
    });
    expect(weekScore(i, '2026-11-04')).toMatchObject({ sessionsPlanned: 3, sessionsDone: 1 });
    expect(missedDay(i, [])).toMatchObject({ date: '2026-11-04' });
  });
});

describe('warm-up sets are excluded (M12 1b)', () => {
  // 2026-11-09 (day a): press 3 sets, squat 3 sets, all done.
  const sid = SETS.find((x) => x.exerciseId === 'press')?.sessionId ?? '';
  const warm = (exerciseId: string): CompletionSet => ({
    sessionId: sid,
    exerciseId,
    reps: 8,
    warmup: true,
  });

  it('warm-ups add no sets done and no reps', () => {
    const withWarm = input({ sets: [warm('press'), warm('press'), ...SETS] });
    expect(dayCompletion(withWarm, '2026-11-09')).toEqual(dayCompletion(input(), '2026-11-09'));
    expect(weekScore(withWarm, '2026-11-09')).toEqual(weekScore(input(), '2026-11-09'));
  });

  it('a warm-up never completes a missing working set', () => {
    const first = SETS.findIndex((x) => x.sessionId === sid && x.exerciseId === 'press');
    const dropped = SETS.filter((_, i) => i !== first);
    expect(dropped).toHaveLength(SETS.length - 1);
    const c = dayCompletion(input({ sets: [...dropped, warm('press')] }), '2026-11-09');
    expect(c.status).toBe('partial');
    expect(c.setsDone).toBe(5);
    expect(c.exercises[0]).toMatchObject({ exerciseId: 'press', setsDone: 2, status: 'partial' });
  });

  it('a day with only warm-ups logged is not partly done', () => {
    const others = SETS.filter((x) => x.sessionId !== sid);
    const c = dayCompletion(input({ sets: [...others, warm('press')] }), '2026-11-09');
    expect(c.setsDone).toBe(0);
    expect(c.exercises.every((e) => e.setsDone === 0)).toBe(true);
  });
});
