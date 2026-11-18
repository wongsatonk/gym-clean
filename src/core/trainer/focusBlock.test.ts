import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../testkit/trainerCatalog';
import programJson from '../../data/program.json';
import { addDate, effectiveDay, seedPlan, weekdayOf, type PlanSession } from './plan';
import { proposeShortOnTime } from './actions/shortOnTime';
import { FOCUS_RULES } from './focusRules';
import {
  buildFocusBlock,
  focusSetsOf,
  groupSetsOf,
  keepMyWeekdays,
  reviseFocusBlock,
  weekdaysFor,
} from './focusBlock';
import { swapCandidates, type TrainerCatalog } from './swapCandidates';
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

  it('never trims his own rows: a week already over the band keeps his plan’s sets', () => {
    // Made-up plan: A = 11 chest sets, B–D no chest; 5 days from A → week 1 has A twice
    // (22 chest sets, over the band's top of 20).
    const row = (exerciseId: string, sets: number) => ({
      exerciseId,
      sets,
      targetReps: [8, 12] as [number, number],
      restSec: 90,
      tracking: 'manual' as const,
    });
    const days = [
      {
        id: 'A',
        name: 'A',
        exercises: [
          row('Dumbbell_Bench_Press', 4),
          row('Incline_Dumbbell_Press', 4),
          row('Dumbbell_Flyes', 3),
        ],
      },
      { id: 'B', name: 'B', exercises: [row('One-Arm_Dumbbell_Row', 4)] },
      { id: 'C', name: 'C', exercises: [row('Goblet_Squat', 4)] },
      { id: 'D', name: 'D', exercises: [row('Hammer_Curls', 3)] },
    ];
    const s = seedPlan({ name: 'Made-up', weightUnit: 'kg', days } as Program);
    const b = buildFocusBlock(s, CATALOG, params({ weekdays: [1, 2, 3, 4, 5] }));
    const [week1] = weeksOf(b);
    const aDays = trainingDays(week1 ?? []).filter((d) => d.id === 'A');
    expect(aDays).toHaveLength(2);
    for (const d of aDays) expect(d.exercises).toEqual(days[0]?.exercises);
    expect(focusOfWeek(b, week1 ?? [])).toBe(22);
  });

  it('every block day keeps at least his own sets on his own rows (all groups, 3–6 days)', () => {
    for (const group of GROUPS)
      for (const n of [3, 4, 5, 6]) {
        const b = buildFocusBlock(state(), CATALOG, params({ group, weekdays: weekdaysFor(n) }));
        const bases = baseWeeks(b);
        weeksOf(b).forEach((week, w) => {
          if (w === b.weeks - 1) return; // the lighter week
          trainingDays(week).forEach((d, i) => {
            for (const p of bases[w]?.[i]?.exercises ?? []) {
              const got = d.exercises.find((x) => x.exerciseId === p.exerciseId)?.sets ?? 0;
              expect(got, `${group} ${n}d w${w + 1} ${p.exerciseId}`).toBeGreaterThanOrEqual(
                p.sets,
              );
            }
          });
        });
      }
  });

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

// ---------- M13c: abs only through a chosen focus (Decision "M13c answers", q3) ----------

const isAbs = (id: string) =>
  EXERCISES.find((e) => e.id === id)?.primaryMuscles.includes('abdominals') ?? false;
const absRowsOf = (days: FocusBlock['days']) =>
  trainingDays(days).flatMap((d) => d.exercises.filter((p) => isAbs(p.exerciseId)));
const withoutAbs = (b: FocusBlock): FocusBlock['days'] =>
  b.days.map((d) => ({
    date: d.date,
    day: d.day && { ...d.day, exercises: d.day.exercises.filter((p) => !isAbs(p.exerciseId)) },
  }));
const totalOf = (exercises: readonly { sets: number }[]) => sum(exercises.map((p) => p.sets));
const NON_CORE: BodyArea[] = ['chest', 'back', 'arms', 'legs', 'shoulders'];
const R = FOCUS_RULES.alsoCore;

describe('core as the focus group (M13c)', () => {
  it('a core block reaches the empty-base target on ≥ 2 days a week, abs from the gym only', () => {
    for (const n of [3, 4, 5, 6]) {
      const b = buildFocusBlock(state(), CATALOG, params({ group: 'core', weekdays: weekdaysFor(n) }));
      expect(b.baseSetsPerWeek).toBe(0);
      expect(b.targetSetsPerWeek).toBe(FOCUS_RULES.emptyBaseSets);
      weeksOf(b)
        .slice(0, -1)
        .forEach((week, w) => {
          expect(focusOfWeek(b, week), `${n}d week ${w + 1}`).toBeGreaterThanOrEqual(
            FOCUS_RULES.emptyBaseSets,
          );
          const days = trainingDays(week).filter((d) => focusSetsOf(d.exercises, 'core', CATALOG) > 0);
          expect(days.length).toBeGreaterThanOrEqual(2);
        });
      for (const p of absRowsOf(b.days)) expect(CATALOG.canDo(p.exerciseId), p.exerciseId).toBe(true);
    }
  });

  it('picks from the preferred abs list first (Cable Crunch where the gym can)', () => {
    const b = buildFocusBlock(state(), CATALOG, params({ group: 'core' }));
    const ids = absRowsOf(weeksOf(b)[0] ?? []).map((p) => p.exerciseId);
    // The lightest day gets the first pick, which need not be the first date.
    expect(new Set(ids)).toEqual(new Set(FOCUS_RULES.prefer.core.slice(0, ids.length)));
  });

  it('a core block with alsoCore is just a core block', () => {
    const plain = buildFocusBlock(state(), CATALOG, params({ group: 'core' }));
    const also = buildFocusBlock(state(), CATALOG, params({ group: 'core', alsoCore: true }));
    expect(also).toEqual(plain);
    expect(also.alsoCore).toBeUndefined();
  });
});

describe('alsoCore: "Also add abs?" Yes (M13c)', () => {
  for (const group of NON_CORE) {
    for (const n of [3, 5, 6]) {
      it(`${group}, ${n} days: the main group is byte-identical, only abs rows are added`, () => {
        const p = params({ group, weekdays: weekdaysFor(n) });
        const plain = buildFocusBlock(state(), CATALOG, p);
        const also = buildFocusBlock(state(), CATALOG, { ...p, alsoCore: true });
        expect(absRowsOf(plain.days)).toEqual([]);
        expect(plain.alsoCore).toBeUndefined();
        expect(also.alsoCore).toBe(true);
        expect(withoutAbs(also)).toEqual(plain.days);
        expect([also.group, also.targetSetsPerWeek, also.baseSetsPerWeek]).toEqual([
          plain.group,
          plain.targetSetsPerWeek,
          plain.baseSetsPerWeek,
        ]);
        expect(also.id).not.toBe(plain.id);
      });
    }
  }

  it('abs rows: 3 × 10–15, 60 s rest, manual, weight 0 for body-only, ≥ 2 days up to the empty base', () => {
    for (const n of [3, 4, 5, 6]) {
      const b = buildFocusBlock(
        state(),
        CATALOG,
        params({ group: 'chest', weekdays: weekdaysFor(n), alsoCore: true }),
      );
      weeksOf(b).forEach((week, w) => {
        const last = w === b.weeks - 1;
        const rows = absRowsOf(week);
        const days = trainingDays(week).filter((d) => d.exercises.some((p) => isAbs(p.exerciseId)));
        expect(days.length, `${n}d w${w + 1}`).toBeGreaterThanOrEqual(R.minDays);
        // One abs row per day, a different exercise each.
        for (const d of days) expect(d.exercises.filter((p) => isAbs(p.exerciseId))).toHaveLength(1);
        expect(new Set(rows.map((p) => p.exerciseId)).size).toBe(rows.length);
        if (!last) expect(sum(rows.map((p) => p.sets))).toBe(FOCUS_RULES.emptyBaseSets);
        for (const p of rows) {
          const ex = EXERCISES.find((e) => e.id === p.exerciseId);
          expect(p.targetReps).toEqual(R.targetReps);
          expect(p.restSec).toBe(R.restSec);
          expect(p.tracking).toBe('manual');
          expect(p.sets).toBe(last ? R.sets - 1 : R.sets);
          if (last) expect(p.adjusted).toBe('lighter');
          else expect(p.adjusted).toBeUndefined();
          if (ex?.equipment === 'body only') expect(p.startWeightKg).toBe(0);
          else expect(p.startWeightKg).toBeUndefined();
          expect(CATALOG.canDo(p.exerciseId)).toBe(true);
        }
      });
    }
  });

  it('abs go on the lightest days of the week', () => {
    const p = params({ group: 'back', weekdays: weekdaysFor(5) });
    const plain = buildFocusBlock(state(), CATALOG, p);
    const also = buildFocusBlock(state(), CATALOG, { ...p, alsoCore: true });
    weeksOf(also)
      .slice(0, -1)
      .forEach((week, w) => {
        const plainWeek = weeksOf(plain)[w] ?? [];
        const totals = plainWeek.map((d) => (d.day ? totalOf(d.day.exercises) : null));
        const withAbs = week.flatMap((d, i) =>
          d.day?.exercises.some((x) => isAbs(x.exerciseId)) ? [totals[i] ?? 0] : [],
        );
        const others = week.flatMap((d, i) =>
          d.day && !d.day.exercises.some((x) => isAbs(x.exerciseId)) ? [totals[i] ?? 0] : [],
        );
        expect(Math.max(...withAbs)).toBeLessThanOrEqual(Math.min(...others));
      });
  });

  it('kit from the gym: Cable Crunch first where it can; a gym without cables gets body-only picks', () => {
    const b = buildFocusBlock(state(), CATALOG, params({ alsoCore: true }));
    expect(absRowsOf(weeksOf(b)[0] ?? []).map((p) => p.exerciseId)).toContain('Cable_Crunch');
    for (const kit of [['dumbbells', 'adjustable-bench'], []]) {
      const gym = trainerCatalog(kit);
      const nb = buildFocusBlock(state(), gym, params({ alsoCore: true }));
      const rows = absRowsOf(nb.days);
      expect(rows.length).toBeGreaterThan(0);
      for (const p of rows) {
        expect(gym.canDo(p.exerciseId), p.exerciseId).toBe(true);
        expect(EXERCISES.find((e) => e.id === p.exerciseId)?.equipment, p.exerciseId).toBe(
          'body only',
        );
      }
    }
  });

  it('go-easy core → no abs rows (and no alsoCore mark)', () => {
    const s = { ...state(), easyOn: ['core' as const] };
    const plain = buildFocusBlock(s, CATALOG, params());
    const also = buildFocusBlock(s, CATALOG, params({ alsoCore: true }));
    expect(absRowsOf(also.days)).toEqual([]);
    expect(also).toEqual(plain);
  });

  it('a gym that can do no abs adds none', () => {
    const gym: TrainerCatalog = { ...CATALOG, canDo: (id) => !isAbs(id) && CATALOG.canDo(id) };
    const b = buildFocusBlock(state(), gym, params({ alsoCore: true }));
    expect(absRowsOf(b.days)).toEqual([]);
    expect(b.alsoCore).toBeUndefined();
    expect(withoutAbs(b)).toEqual(buildFocusBlock(state(), gym, params()).days);
  });

  it('revisions keep the abs: weeks and days rebuild with them, a swap keeps the mark', () => {
    const b = buildFocusBlock(state(), CATALOG, params({ alsoCore: true }));
    for (const edit of [{ weeks: 3 }, { daysPerWeek: 4 }] as const) {
      const r = reviseFocusBlock(b, edit, state(), CATALOG);
      if (!r.ok) throw new Error(r.reply);
      expect(r.block.alsoCore).toBe(true);
      expect(absRowsOf(r.block.days).length).toBeGreaterThan(0);
    }
    const r = reviseFocusBlock(
      b,
      { swap: { weekday: 4, exerciseId: 'Dumbbell_Flyes' } },
      state(),
      CATALOG,
    );
    if (!r.ok) throw new Error(r.reply);
    expect(r.block.alsoCore).toBe(true);
  });

  it('is deterministic', () => {
    const p = params({ group: 'legs', alsoCore: true });
    expect(buildFocusBlock(state(), CATALOG, p)).toEqual(buildFocusBlock(state(), CATALOG, p));
  });
});

describe('no path adds abs without your pick (M13c)', () => {
  it('the default program, its seed and a re-seed have no abs', () => {
    for (const d of program.days)
      for (const p of d.exercises) expect(isAbs(p.exerciseId), p.exerciseId).toBe(false);
    for (const d of state().plan.days)
      for (const p of d.exercises) expect(isAbs(p.exerciseId), p.exerciseId).toBe(false);
  });

  it('a block for any other group without alsoCore has no abs, on any day count', () => {
    for (const group of NON_CORE)
      for (const n of [3, 4, 5, 6])
        expect(
          absRowsOf(buildFocusBlock(state(), CATALOG, params({ group, weekdays: weekdaysFor(n) })).days),
          `${group} ${n}d`,
        ).toEqual([]);
  });

  it('swaps never offer an abs exercise for a plan exercise', () => {
    for (const d of program.days)
      for (const p of d.exercises) {
        const ex = EXERCISES.find((e) => e.id === p.exerciseId);
        if (!ex) throw new Error(p.exerciseId);
        const cands = swapCandidates(ex, CATALOG, { exclude: [], limit: 100 });
        expect(cands.filter((c) => isAbs(c.exercise.id)).map((c) => c.exercise.id), p.exerciseId).toEqual([]);
      }
  });

  it('short on time never adds abs', () => {
    const s = state();
    for (const [i, d] of program.days.entries()) {
      // The day before `d` finished on Sunday 2026-11-15, so `d` runs on Monday.
      const prev = program.days[(i + program.days.length - 1) % program.days.length]?.id ?? '';
      const t = new Date(2026, 10, 15, 18).getTime();
      const sessions: PlanSession[] = [{ dayId: prev, startedAt: t, endedAt: t + 3_600_000 }];
      for (const minutes of [20, 30, 45]) {
        const r = proposeShortOnTime(
          { state: s, sessions, today: MON, unit: 'kg', lastWeightKg: {} },
          minutes,
          CATALOG,
        );
        if (!r.ok) continue;
        const rows = effectiveDay(r.proposal.next, sessions, MON).day?.exercises ?? [];
        expect(rows.filter((p) => isAbs(p.exerciseId)), `${d.id} ${minutes}`).toEqual([]);
      }
    }
  });
});
