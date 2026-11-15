import { describe, expect, it } from 'vitest';
import exercisesJson from '../../data/exercises.json';
import bodyAreasJson from '../../data/bodyAreas.json';
import equipmentJson from '../../data/equipment.json';
import programJson from '../../data/program.json';
import { muscleOverlap, swapCandidates, trackingFor, type TrainerCatalog } from './swapCandidates';
import type { BodyArea, Exercise, Program } from '../types';

// The vendored catalog, wired the way src/data/catalog.ts does it (src/core can't import it).
const exercises = exercisesJson as Exercise[];
const areaByMuscle = new Map<string, BodyArea>();
for (const [area, a] of Object.entries(bodyAreasJson.areas)) {
  for (const m of a.muscles) areaByMuscle.set(m, area as BodyArea);
}
const subs = equipmentJson.substitutes as Record<string, string>;
const CATALOG: TrainerCatalog = {
  exercises,
  areaOf: (m) => areaByMuscle.get(m),
  hasEquipment: (v) => v !== null && equipmentJson.available.includes(subs[v] ?? v),
};
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
      expect(CATALOG.hasEquipment(c.exercise.equipment), c.exercise.id).toBe(true);
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

  it('skips exercises whose equipment the gym lacks', () => {
    const cat: TrainerCatalog = { ...CATALOG, hasEquipment: (v) => v === 'dumbbell' };
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
