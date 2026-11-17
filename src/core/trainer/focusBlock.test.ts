import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../testkit/trainerCatalog';
import programJson from '../../data/program.json';
import { addDate, seedPlan, weekdayOf, type PlanSession } from './plan';
import { FOCUS_RULES } from './focusRules';
import {
  buildFocusBlock,
  focusSetsOf,
  groupSetsOf,
  keepMyWeekdays,
  reviseFocusBlock,
  weekdaysFor,
} from './focusBlock';
import type { TrainerCatalog } from './swapCandidates';
import type { BodyArea, FocusBlock, FocusBlockParams, Program, TrainerState } from '../types';

// Made-up data only: the repo's default program, no personal numbers.
const program = programJson as Program;
const CATALOG: TrainerCatalog = trainerCatalog();
const state = (): TrainerState => ({ ...seedPlan(program), version: 3 });
const ROT = program.days.map((d) => d.id);
const GROUPS: BodyArea[] = ['chest', 'back', 'arms', 'legs'];

// 2026-11-16 is a Monday.
const MON = '2026-11-16';
const params = (over: Partial<FocusBlockParams> = {}): FocusBlockParams => ({
  group: 'chest',
  weeks: 4,
  weekdays: [1, 2, 3, 4, 5],
  startDate: MON,
  ...over,
});

const weeksOf = (b: FocusBlock) =>
  Array.from({ length: b.weeks }, (_, w) => b.days.slice(w * 7, w * 7 + 7));
const trainingDays = (days: FocusBlock['days']) => days.flatMap((d) => (d.day ? [d.day] : []));
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);
const focusOfWeek = (b: FocusBlock, days: FocusBlock['days']) =>
  sum(trainingDays(days).map((d) => focusSetsOf(d.exercises, b.group, CATALOG)));
const plainDay = (id: string) => {
  const d = program.days.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};
/** His base days cycled over the weekdays (what the block starts from), per week. */
const baseWeeks = (b: FocusBlock, start = 0) => {
  let ptr = start;
  return weeksOf(b).map((week) =>
    week.flatMap((d) =>
      b.weekdays.includes(weekdayOf(d.date)) ? [plainDay(ROT[ptr++ % ROT.length] ?? '')] : [],
    ),
  );
};
/** Exact base weekly sets of a group: the rotation's sets × weekdays / rotation length. */
const baseExact = (group: BodyArea, n: number) =>
  (sum(program.days.map((d) => focusSetsOf(d.exercises, group, CATALOG))) * n) / ROT.length;

describe('focusRules', () => {
  it('holds the defaults as data', () => {
    expect(FOCUS_RULES.setsFactor).toBe(1.4);
    expect(FOCUS_RULES.minFactor).toBeGreaterThanOrEqual(1.3);
    expect(FOCUS_RULES.maxFactor).toBeLessThanOrEqual(1.5);
    expect(FOCUS_RULES.minFocusDays).toBe(2);
    expect(FOCUS_RULES.weeks).toEqual({ min: 2, max: 6 });
    expect(FOCUS_RULES.weekdays).toEqual({ min: 3, max: 6 });
  });
});

describe('buildFocusBlock', () => {
  it('lays his rotation over the chosen weekdays, rest on the others, 7 × weeks dates', () => {
    const b = buildFocusBlock(state(), CATALOG, params());
    expect(b.days).toHaveLength(28);
    expect(b.days[0]?.date).toBe(MON);
    expect(b.days[27]?.date).toBe(addDate(MON, 27));
    for (const d of b.days) {
      expect(d.day === null, d.date).toBe(!b.weekdays.includes(weekdayOf(d.date)));
    }
    const ids = trainingDays(b.days).map((d) => d.id);
    expect(ids.slice(0, 7)).toEqual([...ROT, ROT[0]]);
    expect(b.group).toBe('chest');
    expect(b.startDate).toBe(MON);
  });

  it('starts from the pending rotation day (last finished session + 1)', () => {
    const t = new Date(2026, 10, 14, 18).getTime();
    const sessions: PlanSession[] = [{ dayId: 'legs-a', startedAt: t, endedAt: t + 3_600_000 }];
    const b = buildFocusBlock(state(), CATALOG, params(), sessions);
    expect(trainingDays(b.days)[0]?.id).toBe('push-b');
  });

  for (const group of GROUPS) {
    for (const n of [3, 4, 5, 6]) {
      it(`${group}, ${n} days: focus weekly sets +30–50% on ≥ 2 days, other groups unchanged`, () => {
        const p = params({ group, weekdays: weekdaysFor(n) });
        const b = buildFocusBlock(state(), CATALOG, p);
        const base = baseExact(group, n);
        expect(b.baseSetsPerWeek).toBe(Math.round(base));
        expect(b.targetSetsPerWeek).toBeGreaterThanOrEqual(base * 1.3);
        expect(b.targetSetsPerWeek).toBeLessThanOrEqual(base * 1.5);
        const bases = baseWeeks(b);
        weeksOf(b).forEach((week, w) => {
          if (w === b.weeks - 1) return; // the lighter week
          const focus = focusOfWeek(b, week);
          expect(focus, `week ${w + 1}`).toBeGreaterThanOrEqual(base * 1.3);
          expect(focus, `week ${w + 1}`).toBeLessThanOrEqual(base * 1.5);
          const focusDays = trainingDays(week).filter(
            (d) => focusSetsOf(d.exercises, group, CATALOG) > 0,
          );
          expect(focusDays.length).toBeGreaterThanOrEqual(2);
          for (const other of ['chest', 'back', 'arms', 'legs', 'shoulders', 'core'] as const) {
            if (other === group) continue;
            const got = sum(
              trainingDays(week).map((d) => groupSetsOf(d.exercises, other, CATALOG)),
            );
            const want = sum((bases[w] ?? []).map((d) => groupSetsOf(d.exercises, other, CATALOG)));
            expect(got, `${other} week ${w + 1}`).toBe(want);
          }
        });
      });
    }
  }

  it('respects the per-exercise and per-session caps on added work', () => {
    for (const group of GROUPS) {
      const b = buildFocusBlock(state(), CATALOG, params({ group }));
      const bases = baseWeeks(b);
      weeksOf(b).forEach((week, w) => {
        trainingDays(week).forEach((d, i) => {
          const base = bases[w]?.[i];
          const baseFocus = base ? focusSetsOf(base.exercises, group, CATALOG) : 0;
          const focus = focusSetsOf(d.exercises, group, CATALOG);
          if (focus > baseFocus)
            expect(focus).toBeLessThanOrEqual(
              Math.max(baseFocus, FOCUS_RULES.maxFocusSetsPerSession),
            );
          for (const p of d.exercises) {
            const was = base?.exercises.find((x) => x.exerciseId === p.exerciseId)?.sets ?? 0;
            if (p.sets > was) expect(p.sets).toBeLessThanOrEqual(FOCUS_RULES.maxSetsPerExercise);
          }
        });
      });
    }
  });

  it('makes the last week lighter (the M10 lighter set rule) and marks it', () => {
    const b = buildFocusBlock(state(), CATALOG, params({ weeks: 3 }));
    const [w1, , w3] = weeksOf(b);
    const total = (days: FocusBlock['days']) =>
      sum(trainingDays(days).flatMap((d) => d.exercises.map((p) => p.sets)));
    expect(total(w3 ?? [])).toBeLessThan(total(w1 ?? []));
    for (const d of trainingDays(w3 ?? [])) {
      for (const p of d.exercises) {
        expect(p.adjusted).toBe('lighter');
        expect(p.sets).toBeGreaterThanOrEqual(1);
      }
    }
    for (const d of trainingDays(w1 ?? []))
      for (const p of d.exercises) expect(p.adjusted).toBeUndefined();
  });

  it('builds 2 and 6 weeks', () => {
    expect(buildFocusBlock(state(), CATALOG, params({ weeks: 2 })).days).toHaveLength(14);
    expect(buildFocusBlock(state(), CATALOG, params({ weeks: 6 })).days).toHaveLength(42);
  });

  it('rejects weeks or weekday counts outside the rules', () => {
    expect(() => buildFocusBlock(state(), CATALOG, params({ weeks: 1 }))).toThrow(RangeError);
    expect(() => buildFocusBlock(state(), CATALOG, params({ weeks: 7 }))).toThrow(RangeError);
    expect(() => buildFocusBlock(state(), CATALOG, params({ weekdays: [1, 3] }))).toThrow(
      RangeError,
    );
    expect(() =>
      buildFocusBlock(state(), CATALOG, params({ weekdays: [0, 1, 2, 3, 4, 5, 6] })),
    ).toThrow(RangeError);
  });

  it('works from a mid-week start (weeks are 7-day runs from the start date)', () => {
    const thu = '2026-11-19';
    const b = buildFocusBlock(state(), CATALOG, params({ startDate: thu }));
    expect(b.days[0]?.date).toBe(thu);
    expect(b.days[0]?.day?.id).toBe(ROT[0]);
    const base = baseExact('chest', 5);
    for (const week of weeksOf(b).slice(0, -1)) {
      expect(trainingDays(week)).toHaveLength(5);
      expect(focusOfWeek(b, week)).toBeGreaterThanOrEqual(base * 1.3);
    }
  });

  it('adds only catalog exercises of the group that the default gym can do', () => {
    for (const group of GROUPS) {
      const b = buildFocusBlock(state(), CATALOG, params({ group, weekdays: weekdaysFor(4) }));
      const bases = baseWeeks(b);
      weeksOf(b).forEach((week, w) =>
        trainingDays(week).forEach((d, i) => {
          const baseIds = new Set(bases[w]?.[i]?.exercises.map((p) => p.exerciseId));
          for (const p of d.exercises) {
            if (baseIds.has(p.exerciseId)) continue;
            const ex = EXERCISES.find((e) => e.id === p.exerciseId);
            expect(ex, p.exerciseId).toBeDefined();
            expect(CATALOG.canDo(p.exerciseId), p.exerciseId).toBe(true);
            expect(focusSetsOf([p], group, CATALOG)).toBe(p.sets);
            expect(p.sets).toBeGreaterThanOrEqual(FOCUS_RULES.minAddedSets);
          }
          const ids = d.exercises.map((p) => p.exerciseId);
          expect(new Set(ids).size).toBe(ids.length);
        }),
      );
    }
  });

  it('never adds an exercise a gym without that kit lacks', () => {
    const noCable = trainerCatalog(['dumbbells', 'adjustable-bench']);
    const b = buildFocusBlock(state(), noCable, params({ group: 'back' }));
    const planIds = new Set(program.days.flatMap((d) => d.exercises.map((p) => p.exerciseId)));
    for (const d of trainingDays(b.days))
      for (const p of d.exercises)
        if (!planIds.has(p.exerciseId))
          expect(noCable.canDo(p.exerciseId), p.exerciseId).toBe(true);
  });

  it('is deterministic: same input → identical block (and id)', () => {
    const a = buildFocusBlock(state(), CATALOG, params({ group: 'legs' }));
    const b = buildFocusBlock(state(), CATALOG, params({ group: 'legs' }));
    expect(b).toEqual(a);
    expect(a.id).toMatch(/^focus-/);
    expect(buildFocusBlock(state(), CATALOG, params({ group: 'back' })).id).not.toBe(a.id);
  });
});

describe('weekdays', () => {
  it('weekdaysFor gives the default weekdays per count', () => {
    expect(weekdaysFor(3)).toEqual([1, 3, 5]);
    expect(weekdaysFor(4)).toEqual([1, 2, 4, 5]);
    expect(weekdaysFor(5)).toEqual([1, 2, 3, 4, 5]);
    expect(weekdaysFor(6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keepMyWeekdays uses his rest weekdays when they leave 3–6 days', () => {
    const s = state();
    s.schedule.restWeekdays = [0, 3];
    expect(keepMyWeekdays(s, [], MON)).toEqual([1, 2, 4, 5, 6]);
  });

  it('keepMyWeekdays without rest weekdays: his usual weekdays from the last 4 weeks', () => {
    const at = (date: string) => {
      const [y, m, d] = date.split('-').map(Number) as [number, number, number];
      const t = new Date(y, m - 1, d, 18).getTime();
      return { dayId: 'push-a', startedAt: t, endedAt: t + 3_600_000 };
    };
    // Tue / Thu / Sat for 3 weeks, plus one odd Monday.
    const sessions = [
      '2026-10-27',
      '2026-10-29',
      '2026-10-31',
      '2026-11-03',
      '2026-11-05',
      '2026-11-07',
      '2026-11-10',
      '2026-11-12',
      '2026-11-14',
      '2026-11-09',
    ].map(at);
    expect(keepMyWeekdays(state(), sessions, MON)).toEqual([2, 4, 6]);
    // No history: the 5-day default.
    expect(keepMyWeekdays(state(), [], MON)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('reviseFocusBlock', () => {
  const block = () => buildFocusBlock(state(), CATALOG, params());

  it('weeks: rebuilds with the new length', () => {
    const r = reviseFocusBlock(block(), { weeks: 3 }, state(), CATALOG);
    if (!r.ok) throw new Error(r.reply);
    expect(r.block.weeks).toBe(3);
    expect(r.block.days).toHaveLength(21);
    expect(r.block.startDate).toBe(MON);
  });

  it('daysPerWeek: rebuilds on the default weekdays for that count', () => {
    const r = reviseFocusBlock(block(), { daysPerWeek: 4 }, state(), CATALOG);
    if (!r.ok) throw new Error(r.reply);
    expect(r.block.weekdays).toEqual([1, 2, 4, 5]);
    for (const week of weeksOf(r.block)) expect(trainingDays(week)).toHaveLength(4);
  });

  it('refuses out-of-range edits', () => {
    expect(reviseFocusBlock(block(), { weeks: 9 }, state(), CATALOG).ok).toBe(false);
    expect(reviseFocusBlock(block(), { daysPerWeek: 2 }, state(), CATALOG).ok).toBe(false);
  });

  it('swap by weekday: every such date with the exercise gets the replacement, same sets', () => {
    const b = block();
    // Thursdays with flyes.
    const thursdays = b.days.filter(
      (d) =>
        weekdayOf(d.date) === 4 && d.day?.exercises.some((p) => p.exerciseId === 'Dumbbell_Flyes'),
    );
    expect(thursdays.length).toBeGreaterThan(0);
    const r = reviseFocusBlock(
      b,
      { swap: { weekday: 4, exerciseId: 'Dumbbell_Flyes' } },
      state(),
      CATALOG,
    );
    if (!r.ok) throw new Error(r.reply);
    for (const t of thursdays) {
      const after = r.block.days.find((d) => d.date === t.date)?.day;
      const before = t.day?.exercises.find((p) => p.exerciseId === 'Dumbbell_Flyes');
      expect(after?.exercises.some((p) => p.exerciseId === 'Dumbbell_Flyes')).toBe(false);
      const i = t.day?.exercises.findIndex((p) => p.exerciseId === 'Dumbbell_Flyes') ?? -1;
      const row = after?.exercises[i];
      expect(row?.sets).toBe(before?.sets);
      expect(CATALOG.canDo(row?.exerciseId ?? '')).toBe(true);
    }
    // Other dates are untouched.
    for (const d of b.days.filter((x) => !thursdays.includes(x)))
      expect(r.block.days.find((x) => x.date === d.date)).toEqual(d);
    expect(r.block.id).not.toBe(b.id);
  });

  it('swap by date with an explicit replacement', () => {
    const b = block();
    const date =
      b.days.find((d) => d.day?.exercises.some((p) => p.exerciseId === 'Dumbbell_Bench_Press'))
        ?.date ?? '';
    const r = reviseFocusBlock(
      b,
      { swap: { date, exerciseId: 'Dumbbell_Bench_Press', toId: 'Cable_Chest_Press' } },
      state(),
      CATALOG,
    );
    if (!r.ok) throw new Error(r.reply);
    const ids = r.block.days.find((d) => d.date === date)?.day?.exercises.map((p) => p.exerciseId);
    expect(ids).toContain('Cable_Chest_Press');
    expect(ids).not.toContain('Dumbbell_Bench_Press');
  });

  it('swap refuses an exercise that is not on those days', () => {
    const r = reviseFocusBlock(
      block(),
      { swap: { weekday: 0, exerciseId: 'Dumbbell_Flyes' } },
      state(),
      CATALOG,
    );
    expect(r.ok).toBe(false);
  });

  it('is deterministic', () => {
    expect(reviseFocusBlock(block(), { daysPerWeek: 3 }, state(), CATALOG)).toEqual(
      reviseFocusBlock(block(), { daysPerWeek: 3 }, state(), CATALOG),
    );
  });
});
