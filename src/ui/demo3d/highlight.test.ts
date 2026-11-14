import { describe, expect, it } from 'vitest';
import exercises from '../../data/exercises.json';
import { MUSCLES } from '../bodyMap';
import { MANNEQUIN_SEGMENTS, MUSCLE_TO_PARTS, highlightFor, partsFor } from './highlight';
import { DEMO_IDS, demoFor, poseAt } from './moves';
import { armTwist, patchesFor, segmentFrames } from './rig';

const byId = new Map(exercises.map((e) => [e.id, e]));

describe('muscle -> mannequin part map', () => {
  it('maps every M2 muscle to at least one known mannequin part', () => {
    for (const m of MUSCLES) {
      const parts = MUSCLE_TO_PARTS[m];
      expect(parts.length, m).toBeGreaterThan(0);
      for (const p of parts) {
        expect(MANNEQUIN_SEGMENTS, `${m} -> ${p.segment}`).toContain(p.segment);
        const [a, b] = p.span ?? [0, 1];
        expect(a).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThanOrEqual(1);
        expect(b).toBeGreaterThan(a);
      }
    }
  });

  for (const id of DEMO_IDS) {
    it(`${id}: every primary and secondary muscle lights at least one part`, () => {
      const ex = byId.get(id);
      expect(ex, id).toBeDefined();
      if (!ex) return;
      expect(ex.primaryMuscles.length).toBeGreaterThan(0);
      const helpers = demoFor(id)?.helpers ?? [];
      for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles, ...helpers])
        expect(partsFor(m).length, `${id}: ${m}`).toBeGreaterThan(0);
      const lit = highlightFor(ex.primaryMuscles, ex.secondaryMuscles);
      expect(lit.some((h) => h.level === 'primary')).toBe(true);
      if (ex.secondaryMuscles.length) expect(lit.some((h) => h.level === 'secondary')).toBe(true);
    });
  }

  it('unknown muscle names map to nothing (no throw)', () => {
    expect(partsFor('wings')).toEqual([]);
    expect(highlightFor(['wings'], [])).toEqual([]);
  });

  it('primary wins over secondary when both light the same part', () => {
    // Shoulders (primary) and triceps (secondary) both live on the arm, but on different parts;
    // listing a muscle as both keeps it primary only.
    const lit = highlightFor(['shoulders'], ['shoulders', 'triceps']);
    const shoulder = lit.filter((h) => h.muscle === 'shoulders');
    expect(shoulder.every((h) => h.level === 'primary')).toBe(true);
    expect(lit.some((h) => h.muscle === 'triceps' && h.level === 'secondary')).toBe(true);
  });

  it('chest and back muscles sit on opposite faces of the torso', () => {
    const face = (m: string) => partsFor(m).find((p) => p.segment === 'torso')?.face;
    expect(face('chest')).toBe('front');
    expect(face('abdominals')).toBe('front');
    expect(face('middle back')).toBe('back');
    expect(face('lower back')).toBe('back');
  });
});

describe('M4d Legs A + Push B: the primary muscle lights on both sides of the mannequin', () => {
  const cases: [string, string, string[]][] = [
    ['Stiff-Legged_Dumbbell_Deadlift', 'hamstrings', ['glutes', 'lower back']],
    ['Dumbbell_Lunges', 'quadriceps', ['calves', 'glutes', 'hamstrings']],
    ['Lying_Leg_Curls', 'hamstrings', []],
    ['Standing_Calf_Raises', 'calves', []],
    ['Dumbbell_Flyes', 'chest', []],
    ['Dumbbell_Shoulder_Press', 'shoulders', ['triceps']],
    ['Cable_Crossover', 'chest', ['shoulders']],
    ['Triceps_Pushdown', 'triceps', []],
    ['Bench_Dips', 'triceps', ['chest', 'shoulders']],
  ];
  it.each(cases)('%s: %s primary, the data secondaries secondary', (id, primary, secondary) => {
    const ex = byId.get(id);
    const m = demoFor(id);
    expect(ex && m, id).toBeTruthy();
    if (!ex || !m) return;
    expect(ex.primaryMuscles).toContain(primary);
    const lit = highlightFor(ex.primaryMuscles, [...ex.secondaryMuscles, ...(m.helpers ?? [])]);
    const patches = patchesFor(segmentFrames(poseAt(m, 1.5), armTwist(m)), lit);
    const prim = patches.filter((p) => p.muscle === primary);
    expect(prim.every((p) => p.level === 'primary')).toBe(true);
    // Limb muscles light both limbs; torso muscles (chest) one patch on the front.
    if (primary === 'chest') expect(prim.length).toBeGreaterThan(0);
    else
      expect(new Set(prim.map((p) => Math.sign(p.centre[2] - poseAt(m, 1.5).hip[2])))).toEqual(
        new Set([1, -1]),
      );
    for (const s of secondary)
      expect(
        patches.filter((p) => p.muscle === s).every((p) => p.level === 'secondary'),
        s,
      ).toBe(true);
  });
});
