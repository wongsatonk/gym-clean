import { describe, expect, it } from 'vitest';
import { DEFAULT_EQUIPMENT, EXERCISES, trainerCatalog } from '../testkit/trainerCatalog';
import templatesJson from '../../data/templates/starterTemplates.json';
import templatesRaw from '../../data/templates/starterTemplates.json?raw';
import { ruleFor } from '../exercises';
import { estimateMinutes } from './estimate';
import { buildStarterPlan, STARTER_TEMPLATES, type StarterPlan } from './starterPlan';
import source from './starterPlan.ts?raw';
import type { TrainerCatalog } from './swapCandidates';
import type { BodyArea, Exercise, GoalKind, Intake, PlannedExercise } from '../types';

// Made-up intake answers only (the repo is public).
const GOALS: GoalKind[] = ['muscle', 'fat', 'strength', 'general'];
const DAYS = [2, 3, 4, 5, 6];
const MINUTES: Intake['sessionMin'][] = [30, 45, 60, 75];
const EXPERIENCE: Intake['experience'][] = ['new', 'some', 'years'];
const AREAS: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];

const intake = (over: Partial<Intake> = {}): Intake => ({
  goalKind: 'muscle',
  days: 3,
  sessionMin: 60,
  experience: 'some',
  easyOn: [],
  at: 1_800_000_000_000,
  ...over,
});
const DEFAULT_GYM: TrainerCatalog = trainerCatalog();
const DUMBBELLS_ONLY: TrainerCatalog = trainerCatalog(['dumbbells']);
const NO_KIT: TrainerCatalog = trainerCatalog([]);
const build = (i: Intake, gym: TrainerCatalog = DEFAULT_GYM): StarterPlan =>
  buildStarterPlan(i, gym, gym);
const exercise = (id: string): Exercise => {
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`no exercise ${id}`);
  return e;
};
const rowsOf = (p: StarterPlan): PlannedExercise[] => p.plan.days.flatMap((d) => d.exercises);
const totalSets = (p: StarterPlan) => rowsOf(p).reduce((n, r) => n + r.sets, 0);

describe('starter templates (data)', () => {
  const T = templatesJson;

  it('full body for 2–3 days, upper/lower for 4, push/pull/legs for 5–6', () => {
    expect(STARTER_TEMPLATES).toBe(templatesJson);
    expect(T.byDays['2'].split).toBe('fullBody');
    expect(T.byDays['3'].split).toBe('fullBody');
    expect(T.byDays['4'].split).toBe('upperLower');
    expect(T.byDays['5'].split).toBe('pushPullLegs');
    expect(T.byDays['6'].split).toBe('pushPullLegs');
    for (const n of DAYS) {
      const key = String(n) as keyof typeof T.trainWeekdays;
      expect(T.trainWeekdays[key]).toHaveLength(n);
      expect(new Set(T.trainWeekdays[key]).size).toBe(n);
    }
  });

  it('every rotation day, slot and preferred exercise exists', () => {
    const days = T.days as Record<string, { id: string; name: string; slots: { slot: string }[] }>;
    const slots = T.slots as Record<
      string,
      { muscles: string[]; prefer?: string[]; orElse?: string }
    >;
    const ids = new Set(EXERCISES.map((e) => e.id));
    for (const { rotation } of Object.values(T.byDays))
      for (const key of rotation) expect(days[key], key).toBeDefined();
    const dayIds = Object.values(days).map((d) => d.id);
    expect(new Set(dayIds).size).toBe(dayIds.length);
    for (const d of Object.values(days)) {
      expect(d.slots.length).toBeGreaterThanOrEqual(4);
      expect(d.slots.some((s) => (s as { main?: boolean }).main)).toBe(true);
      for (const s of d.slots) expect(slots[s.slot], s.slot).toBeDefined();
    }
    for (const [name, s] of Object.entries(slots)) {
      expect(s.muscles.length, name).toBeGreaterThan(0);
      for (const id of s.prefer ?? []) expect(ids.has(id), `${name}: ${id}`).toBe(true);
      if (s.orElse !== undefined) expect(slots[s.orElse], name).toBeDefined();
    }
  });

  it('has reps and rest for every goal and sets for every experience', () => {
    for (const g of GOALS) {
      for (const kind of ['main', 'accessory'] as const) {
        const p = T.prescription[g][kind];
        expect(p.reps).toHaveLength(2);
        expect(p.reps[0]).toBeLessThanOrEqual(p.reps[1] ?? 0);
        expect(p.restSec).toBeGreaterThan(0);
      }
      expect(T.copy.goals[g].length).toBeGreaterThan(0);
    }
    for (const e of EXPERIENCE) {
      expect(T.sets[e].main).toBeGreaterThanOrEqual(2);
      expect(T.sets[e].accessory).toBeGreaterThanOrEqual(2);
      expect(T.sets[e].max).toBeGreaterThanOrEqual(Math.max(T.sets[e].main, T.sets[e].accessory));
    }
    expect(T.sets.new.max).toBeLessThanOrEqual(T.sets.years.max);
    // At most this many exercises a day: fewer for a beginner.
    expect([T.sets.new.maxExercises, T.sets.some.maxExercises, T.sets.years.maxExercises]).toEqual([
      6, 7, 8,
    ]);
  });

  it('every day has extra slots to fill a longer session, and a fill band', () => {
    expect(T.fill.bandMin).toBe(10);
    expect('maxExercises' in T.fill).toBe(false);
    const days = T.days as Record<string, { extras: { slot: string }[] }>;
    for (const [key, d] of Object.entries(days)) {
      expect(d.extras.length, key).toBeGreaterThanOrEqual(2);
      for (const x of d.extras)
        expect((T.slots as Record<string, unknown>)[x.slot], x.slot).toBeDefined();
    }
  });
});

/** A day at the experience's caps: the most exercises, each at its most sets. */
const capped = (
  d: { exercises: readonly PlannedExercise[] },
  sets: { max: number; maxExercises: number },
) => d.exercises.length === sets.maxExercises && d.exercises.every((r) => r.sets === sets.max);
/** Every day's minutes, for the range check at the end. */
const minutes: number[] = [];

describe('buildStarterPlan', () => {
  for (const goalKind of GOALS) {
    for (const days of DAYS) {
      for (const sessionMin of MINUTES) {
        it(`${goalKind}, ${days} days, ${sessionMin} min: fits, doable, well formed`, () => {
          for (const experience of EXPERIENCE) {
            const label = `${experience}`;
            const p = build(intake({ goalKind, days, sessionMin, experience }));
            const rotation = STARTER_TEMPLATES.byDays[String(days) as '2'].rotation;
            expect(p.split).toBe(STARTER_TEMPLATES.byDays[String(days) as '2'].split);
            expect(p.plan.days, label).toHaveLength(rotation.length);
            expect(p.schedule.rotation).toEqual(p.plan.days.map((d) => d.id));
            expect(p.schedule.restWeekdays, label).toHaveLength(7 - days);
            expect(p.plan.edited).toBe(true);
            expect(p.plan.seededFrom).toMatch(/^starter:[0-9a-f]{8}$/);
            const rx = STARTER_TEMPLATES.prescription[goalKind];
            const sets = STARTER_TEMPLATES.sets[experience];
            for (const d of p.plan.days) {
              const m = estimateMinutes(d);
              expect(m, `${label} ${d.id}`).toBeLessThanOrEqual(sessionMin);
              expect(d.exercises.length, `${label} ${d.id}`).toBeLessThanOrEqual(sets.maxExercises);
              // Within 10 min of the chosen length, unless the day is as big as the
              // experience allows (every exercise slot used, every row at its most sets).
              if (m < sessionMin - STARTER_TEMPLATES.fill.bandMin)
                expect(capped(d, sets), `${label} ${d.id} ${m} min`).toBe(true);
              minutes.push(m);
              expect(d.exercises.length, `${label} ${d.id}`).toBeGreaterThan(0);
              const ids = d.exercises.map((r) => r.exerciseId);
              expect(new Set(ids).size, `${label} ${d.id}`).toBe(ids.length);
              for (const r of d.exercises) {
                expect(DEFAULT_GYM.canDo(r.exerciseId), r.exerciseId).toBe(true);
                expect(r.sets).toBeGreaterThanOrEqual(2);
                expect(r.sets).toBeLessThanOrEqual(sets.max);
                expect([rx.main.reps, rx.accessory.reps]).toContainEqual(r.targetReps);
                expect([rx.main.restSec, rx.accessory.restSec]).toContain(r.restSec);
                expect(r.tracking).toBe(ruleFor(r.exerciseId) ? 'pose' : 'manual');
                expect(r.pairWith).toBeUndefined();
                expect(r.adjusted).toBeUndefined();
                // No weights from anyone: blank, or 0 for a bodyweight move.
                if (exercise(r.exerciseId).equipment === 'body only')
                  expect(r.startWeightKg).toBe(0);
                else expect(r.startWeightKg).toBeUndefined();
                expect(r.weightKgToday).toBeUndefined();
              }
            }
          }
        });
      }
    }
  }

  it('starts each day with its main lifts, as the template lists them', () => {
    const p = build(intake({ days: 4, sessionMin: 75, experience: 'years' }));
    const upper = p.plan.days[0];
    expect(upper?.name).toBe('Upper A');
    expect(upper?.exercises[0]?.exerciseId).toBe('Dumbbell_Bench_Press');
    expect(upper?.exercises[1]?.exerciseId).toBe('One-Arm_Dumbbell_Row');
    expect(upper?.exercises[0]?.sets).toBeGreaterThanOrEqual(STARTER_TEMPLATES.sets.years.main);
    expect(upper?.exercises[0]?.targetReps).toEqual(
      STARTER_TEMPLATES.prescription.muscle.main.reps,
    );
  });

  it('the goal sets reps and rest; experience sets the sets', () => {
    const strength = build(intake({ goalKind: 'strength', sessionMin: 75 }));
    const fat = build(intake({ goalKind: 'fat', sessionMin: 75 }));
    expect(strength.plan.days[0]?.exercises[0]).toMatchObject({ targetReps: [5, 8], restSec: 150 });
    expect(fat.plan.days[0]?.exercises[0]).toMatchObject({ targetReps: [10, 12], restSec: 75 });
    for (const experience of EXPERIENCE) {
      const sets = STARTER_TEMPLATES.sets[experience];
      for (const sessionMin of [60, 75] as const) {
        const p = build(intake({ experience, sessionMin, days: 4 }));
        for (const d of p.plan.days) {
          // The main lifts start at the experience's sets (a long session only adds to them).
          expect(d.exercises[0]?.sets ?? 0).toBeGreaterThanOrEqual(sets.main);
          for (const r of d.exercises) expect(r.sets).toBeLessThanOrEqual(sets.max);
        }
      }
    }
  });

  it('a longer session gets more work, up to the experience caps', () => {
    const at45 = build(intake({ days: 3, sessionMin: 45, experience: 'years' }));
    const at75 = build(intake({ days: 3, sessionMin: 75, experience: 'years' }));
    const count = (p: StarterPlan) => rowsOf(p).length;
    expect(count(at75)).toBeGreaterThan(count(at45));
    expect(totalSets(at75)).toBeGreaterThan(totalSets(at45));
  });

  it('a beginner with a long session gets a smaller day, ending below the chosen length', () => {
    const sets = STARTER_TEMPLATES.sets.new;
    const p = build(intake({ goalKind: 'fat', days: 3, sessionMin: 75, experience: 'new' }));
    for (const d of p.plan.days) {
      expect(d.exercises).toHaveLength(sets.maxExercises);
      expect(capped(d, sets)).toBe(true);
      expect(estimateMinutes(d)).toBeLessThan(75 - STARTER_TEMPLATES.fill.bandMin);
    }
  });

  it('the per-case minutes stay in range (logged for the report)', () => {
    expect(minutes.length).toBeGreaterThan(0);
    const lo = Math.min(...minutes);
    const hi = Math.max(...minutes);
    console.info(`starter day minutes: ${lo}–${hi} over ${minutes.length} days`);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThanOrEqual(75);
  });

  it('a shorter session has less work, never more', () => {
    for (const days of DAYS) {
      const short = build(intake({ days, sessionMin: 30 }));
      const long = build(intake({ days, sessionMin: 75 }));
      expect(totalSets(short), `${days}`).toBeLessThan(totalSets(long));
      // The main lifts are what stays.
      for (const [i, d] of short.plan.days.entries())
        expect(d.exercises[0]?.exerciseId).toBe(long.plan.days[i]?.exercises[0]?.exerciseId);
    }
  });

  it('varies the picks between the days of a rotation where the gym allows', () => {
    const p = build(intake({ days: 6, sessionMin: 75 }));
    const pushA = p.plan.days[0]?.exercises.map((r) => r.exerciseId) ?? [];
    const pushB = p.plan.days[3]?.exercises.map((r) => r.exerciseId) ?? [];
    expect(pushA.length).toBeGreaterThan(2);
    expect(pushB.some((id) => !pushA.includes(id))).toBe(true);
  });

  it('same answers → the same plan (the time of the intake does not matter)', () => {
    for (const goalKind of GOALS) {
      for (const days of DAYS) {
        const a = build(intake({ goalKind, days, easyOn: ['shoulders'] }));
        const b = build(intake({ goalKind, days, easyOn: ['shoulders'], at: 5, goalText: 'x' }));
        expect(a).toEqual(b);
      }
    }
  });

  it('only picks what a dumbbells-only gym can do, and every day still trains', () => {
    for (const goalKind of GOALS) {
      for (const days of DAYS) {
        for (const sessionMin of [30, 75] as const) {
          const p = build(intake({ goalKind, days, sessionMin }), DUMBBELLS_ONLY);
          expect(p.plan.days.length).toBeGreaterThan(0);
          expect(p.schedule.rotation).toEqual(p.plan.days.map((d) => d.id));
          for (const d of p.plan.days) {
            expect(d.exercises.length, d.id).toBeGreaterThan(0);
            expect(estimateMinutes(d)).toBeLessThanOrEqual(sessionMin);
            for (const r of d.exercises)
              expect(DUMBBELLS_ONLY.canDo(r.exerciseId), r.exerciseId).toBe(true);
          }
        }
      }
    }
  });

  it('with no kit at all it builds bodyweight days only, and drops days with nothing to do', () => {
    for (const days of DAYS) {
      const p = build(intake({ days }), NO_KIT);
      expect(p.schedule.rotation).toEqual(p.plan.days.map((d) => d.id));
      for (const d of p.plan.days) {
        expect(d.exercises.length).toBeGreaterThan(0);
        for (const r of d.exercises) {
          expect(NO_KIT.canDo(r.exerciseId)).toBe(true);
          expect(r.startWeightKg).toBe(0);
        }
      }
    }
    const nothing: TrainerCatalog = { ...DEFAULT_GYM, canDo: () => false };
    expect(build(intake(), nothing).plan.days).toEqual([]);
    expect(build(intake(), nothing).schedule.rotation).toEqual([]);
  });

  it('takes the catalog and the gym separately', () => {
    const p = buildStarterPlan(intake(), DEFAULT_GYM, { canDo: DUMBBELLS_ONLY.canDo });
    expect(p).toEqual(build(intake(), DUMBBELLS_ONLY));
    expect(DEFAULT_EQUIPMENT.length).toBeGreaterThan(1);
  });

  describe('go-easy areas', () => {
    const areaOf = DEFAULT_GYM.areaOf;
    const inArea = (muscles: string[], area: BodyArea) => muscles.some((m) => areaOf(m) === area);

    for (const area of AREAS) {
      it(`${area}: no pick mainly works it; picks where it helps are lighter`, () => {
        for (const days of DAYS) {
          const i = intake({ days, sessionMin: 75, experience: 'years', easyOn: [area] });
          const p = build(i);
          const sets = STARTER_TEMPLATES.sets.years;
          for (const r of rowsOf(p)) {
            const e = exercise(r.exerciseId);
            expect(inArea(e.primaryMuscles, area), `${days}d ${r.exerciseId}`).toBe(false);
            if (!inArea(e.secondaryMuscles, area)) continue;
            if (e.equipment === 'body only') {
              const tops = [
                STARTER_TEMPLATES.prescription.muscle.main.reps[1] ?? 0,
                STARTER_TEMPLATES.prescription.muscle.accessory.reps[1] ?? 0,
              ].map((n) => Math.round(n * 0.8));
              expect(tops).toContain(r.targetReps[1]);
            } else {
              expect(r.sets).toBeLessThanOrEqual(sets.max - STARTER_TEMPLATES.easyOn.setsDrop);
            }
          }
        }
      });
    }

    it('prefers a pick that does not load the area at all', () => {
      // Arms: a row loads the biceps, so each one runs a set lighter; curls are never picked.
      const plain = build(intake({ days: 4, sessionMin: 75, experience: 'years' }));
      const easy = build(
        intake({ days: 4, sessionMin: 75, experience: 'years', easyOn: ['arms'] }),
      );
      expect(rowsOf(plain).some((r) => r.exerciseId === 'Dumbbell_Bicep_Curl')).toBe(true);
      expect(rowsOf(easy).some((r) => r.exerciseId === 'Dumbbell_Bicep_Curl')).toBe(false);
    });

    it('drops a day that only works the area (legs days with legs on the list)', () => {
      const p = build(intake({ days: 6, easyOn: ['legs'] }));
      expect(p.plan.days.map((d) => d.name)).toEqual(['Push A', 'Pull A', 'Push B', 'Pull B']);
      expect(p.schedule.rotation).toHaveLength(4);
    });

    it('several areas at once', () => {
      const p = build(intake({ days: 3, easyOn: ['shoulders', 'arms'] }));
      for (const r of rowsOf(p)) {
        const e = exercise(r.exerciseId);
        expect(inArea(e.primaryMuscles, 'shoulders')).toBe(false);
        expect(inArea(e.primaryMuscles, 'arms')).toBe(false);
      }
      expect(rowsOf(p).length).toBeGreaterThan(0);
    });
  });

  it('answers out of range build nothing', () => {
    for (const days of [0, 1, 7, 2.5, Number.NaN]) {
      const p = build(intake({ days }));
      expect(p.plan.days).toEqual([]);
      expect(p.schedule.rotation).toEqual([]);
    }
  });

  it('nothing is written for one person: text and picks come from the data files', () => {
    for (const text of [templatesRaw, source]) {
      expect(text).not.toMatch(/wongsaton|kampusan|\baof\b|his wife|\bhusband\b/i);
      expect(text).not.toMatch(/\b\d+(\.\d+)?\s?(kg|lb|cm)\b/i);
    }
    // No exercise id or name is written in the builder itself.
    for (const e of EXERCISES) {
      expect(source.includes(e.id), e.id).toBe(false);
      expect(source.includes(`'${e.name}'`), e.name).toBe(false);
    }
  });

  it('is pure', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
