import { describe, expect, it } from 'vitest';
import programJson from '../../data/program.json';
import { DEFAULT_EQUIPMENT, EXERCISES, trainerCatalog } from '../testkit/trainerCatalog';
import { muscleOverlap, swapCandidates, trackingFor, type TrainerCatalog } from './swapCandidates';
import type { BodyArea, Exercise, Program } from '../types';

// The vendored catalog with his gym's default profile, wired like src/ui/app.ts (M10e).
const exercises = EXERCISES;
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;
const byId = (id: string): Exercise => {
  const e = exercises.find((x) => x.id === id);
  if (!e) throw new Error(`no exercise ${id}`);
  return e;
};
const muscles = (e: Exercise) => [...e.primaryMuscles, ...e.secondaryMuscles];

describe('swapCandidates', () => {
  it('without an area: same primary muscle, never itself, kit the gym has', () => {
    const curl = byId('Dumbbell_Bicep_Curl');
    const out = swapCandidates(curl, CATALOG, { exclude: [] });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      expect(c.exercise.id).not.toBe(curl.id);
      expect(c.exercise.primaryMuscles).toContain('biceps');
      expect(CATALOG.canDo(c.exercise.id), c.exercise.id).toBe(true);
    }
  });

  it('ranks by primary overlap, then secondary overlap, then the same tracking', () => {
    const cat: TrainerCatalog = {
      ...CATALOG,
      exercises: [
        {
          ...byId('Front_Dumbbell_Raise'),
          id: 'shoulder-only',
          primaryMuscles: ['shoulders'],
          secondaryMuscles: [],
        },
        {
          ...byId('Front_Dumbbell_Raise'),
          id: 'chest-only',
          primaryMuscles: ['chest'],
          secondaryMuscles: [],
        },
        {
          ...byId('Front_Dumbbell_Raise'),
          id: 'chest+tri',
          primaryMuscles: ['chest'],
          secondaryMuscles: ['triceps'],
        },
        {
          ...byId('Front_Dumbbell_Raise'),
          id: 'chest+tri+sh',
          primaryMuscles: ['chest'],
          secondaryMuscles: ['triceps', 'shoulders'],
        },
        {
          ...byId('Front_Dumbbell_Raise'),
          id: 'chest-pose',
          primaryMuscles: ['chest'],
          secondaryMuscles: [],
        },
      ],
      hasRule: (id) => id === 'chest-pose',
      canDo: () => true,
    };
    const bench = byId('Dumbbell_Bench_Press'); // chest | shoulders, triceps
    const ids = swapCandidates(bench, cat, { exclude: [], tracking: 'pose', limit: 10 }).map(
      (c) => c.exercise.id,
    );
    expect(ids).toEqual(['chest+tri+sh', 'chest+tri', 'chest-pose', 'chest-only']);
  });

  it("tracking is 'pose' only when a rule exists; the swap pool is manual", () => {
    expect(trackingFor('Dumbbell_Bicep_Curl', CATALOG)).toBe('pose');
    expect(trackingFor('Seated_Dumbbell_Curl', CATALOG)).toBe('manual');
    expect(trackingFor('Cable_Rope_Overhead_Triceps_Extension', CATALOG)).toBe('manual');
    const out = swapCandidates(byId('Hammer_Curls'), CATALOG, { exclude: [], limit: 20 });
    for (const c of out) expect(c.tracking).toBe(trackingFor(c.exercise.id, CATALOG));
  });

  it('respects exclude and limit (default 3)', () => {
    const curl = byId('Dumbbell_Bicep_Curl');
    const all = swapCandidates(curl, CATALOG, { exclude: [], limit: 50 });
    expect(all.length).toBeGreaterThan(3);
    expect(swapCandidates(curl, CATALOG, { exclude: [] })).toHaveLength(3);
    const first = all[0]?.exercise.id ?? '';
    const without = swapCandidates(curl, CATALOG, { exclude: [first], limit: 50 });
    expect(without.map((c) => c.exercise.id)).not.toContain(first);
  });

  it('skips exercises the gym lacks the kit for', () => {
    const cat = trainerCatalog(['dumbbells']);
    const out = swapCandidates(byId('Triceps_Pushdown'), cat, { exclude: [], limit: 50 });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) expect(c.exercise.equipment).toBe('dumbbell');
  });

  it('with an area: a candidate never loads it, as primary or secondary', () => {
    const areas: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];
    for (const area of areas) {
      for (const d of program.days) {
        for (const p of d.exercises) {
          const out = swapCandidates(byId(p.exerciseId), CATALOG, {
            avoid: area,
            exclude: [],
            limit: 50,
          });
          for (const c of out) {
            for (const m of muscles(c.exercise)) {
              expect(CATALOG.areaOf(m), `${area}: ${p.exerciseId} → ${c.exercise.id}`).not.toBe(
                area,
              );
            }
          }
        }
      }
    }
  });

  it("with an area: the candidate shares a primary muscle with the exercise's primaries outside it", () => {
    // Synthetic: the real catalog has one primary muscle per exercise.
    const base = byId('Front_Dumbbell_Raise');
    const ex = (id: string, primaryMuscles: string[], secondaryMuscles: string[] = []) => ({
      ...base,
      id,
      primaryMuscles,
      secondaryMuscles,
    });
    const press = ex('press', ['chest', 'triceps'], ['shoulders']);
    const cat: TrainerCatalog = {
      ...CATALOG,
      exercises: [
        press,
        ex('fly', ['chest'], ['shoulders']),
        ex('chest-only', ['chest']),
        // Hits only the press's secondary muscle (shoulders) as a primary: not a swap.
        ex('raise', ['shoulders']),
        ex('kickback', ['triceps']),
      ],
      canDo: () => true,
    };
    const ids = swapCandidates(press, cat, { avoid: 'arms', exclude: [], limit: 10 }).map(
      (c) => c.exercise.id,
    );
    expect(ids).toEqual(['fly', 'chest-only']);
  });

  it('with an area: primaries all in the area → no candidates, even via secondary muscles', () => {
    // Seated press (shoulders | triceps) on a shoulders day off: never a triceps kickback.
    const press = byId('Seated_Dumbbell_Press');
    expect(press.primaryMuscles).toEqual(['shoulders']);
    expect(swapCandidates(press, CATALOG, { avoid: 'shoulders', exclude: [], limit: 50 })).toEqual(
      [],
    );
    // Dips (triceps | chest, shoulders) on an arms day off: no chest fly either.
    expect(
      swapCandidates(byId('Bench_Dips'), CATALOG, { avoid: 'arms', exclude: [], limit: 50 }),
    ).toEqual([]);
  });

  it('with an area: nothing left to hit → no candidates (curls on an arms day off)', () => {
    expect(
      swapCandidates(byId('Dumbbell_Bicep_Curl'), CATALOG, { avoid: 'arms', exclude: [] }),
    ).toEqual([]);
    expect(
      swapCandidates(byId('Standing_Dumbbell_Triceps_Extension'), CATALOG, {
        avoid: 'arms',
        exclude: [],
      }),
    ).toEqual([]);
  });

  it('muscleOverlap counts shared muscles', () => {
    expect(muscleOverlap(['chest', 'triceps'], ['triceps', 'shoulders'])).toBe(1);
    expect(muscleOverlap([], ['chest'])).toBe(0);
  });
});

// M10e: kit needs are per exercise (exerciseKit.json) and `replaceWith` ranks the closest first.
describe('swapCandidates with kit needs (M10e)', () => {
  const legsB = program.days.find((d) => d.id === 'legs-b')?.exercises.map((p) => p.exerciseId);
  const legPress = byId('Leg_Press');

  it('Leg Press on Legs B: smith squat, barbell squat, split squat, in that order', () => {
    const ids = swapCandidates(legPress, CATALOG, { exclude: legsB ?? [] }).map(
      (c) => c.exercise.id,
    );
    expect(ids).toEqual(['Smith_Machine_Squat', 'Barbell_Squat', 'Split_Squat_with_Dumbbells']);
  });

  it('without a smith machine the barbell squat comes first', () => {
    const cat = trainerCatalog(DEFAULT_EQUIPMENT.filter((i) => i !== 'smith-machine'));
    const ids = swapCandidates(legPress, cat, { exclude: legsB ?? [] }).map((c) => c.exercise.id);
    expect(ids.slice(0, 2)).toEqual(['Barbell_Squat', 'Split_Squat_with_Dumbbells']);
    expect(ids).not.toContain('Smith_Machine_Squat');
  });

  it('dumbbells only → dumbbell moves only', () => {
    const cat = trainerCatalog(['dumbbells']);
    const out = swapCandidates(legPress, cat, { exclude: legsB ?? [], limit: 50 });
    expect(out.length).toBeGreaterThan(0);
    for (const c of out) {
      // Goblet squat is a kettlebell move upstream, done here with one dumbbell.
      expect(['dumbbell', 'kettlebells'], c.exercise.id).toContain(c.exercise.equipment);
      expect(cat.canDo(c.exercise.id), c.exercise.id).toBe(true);
    }
  });

  it('preferred ids only count when eligible; then the usual keys', () => {
    const cat: TrainerCatalog = {
      ...CATALOG,
      preferred: () => ['Nope', 'Pushups', 'Dumbbell_Squat'],
    };
    const ids = swapCandidates(legPress, cat, { exclude: [], limit: 50 }).map((c) => c.exercise.id);
    expect(ids[0]).toBe('Dumbbell_Squat');
    expect(ids).not.toContain('Pushups');
    const plain = swapCandidates(
      legPress,
      { ...CATALOG, preferred: () => [] },
      {
        exclude: [],
        limit: 50,
      },
    ).map((c) => c.exercise.id);
    expect(ids.slice(1)).toEqual(plain.filter((id) => id !== 'Dumbbell_Squat'));
  });

  it('never suggests a rope exercise or anything his gym lacks, with or without an area', () => {
    const areas: (BodyArea | undefined)[] = [
      undefined,
      'arms',
      'shoulders',
      'chest',
      'back',
      'legs',
      'core',
    ];
    for (const avoid of areas) {
      for (const d of program.days) {
        for (const p of d.exercises) {
          const out = swapCandidates(byId(p.exerciseId), CATALOG, {
            ...(avoid ? { avoid } : {}),
            exclude: [],
            limit: 50,
          });
          for (const c of out) {
            expect(c.exercise.id, `${p.exerciseId} → ${c.exercise.id}`).not.toMatch(/rope/i);
            expect(CATALOG.canDo(c.exercise.id), c.exercise.id).toBe(true);
          }
        }
      }
    }
  });

  it('every program exercise still has a candidate with his gym (day ids excluded)', () => {
    for (const d of program.days) {
      const inDay = d.exercises.map((p) => p.exerciseId);
      for (const p of d.exercises) {
        const out = swapCandidates(byId(p.exerciseId), CATALOG, { exclude: inDay });
        expect(out.length, `${d.id}: ${p.exerciseId}`).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
