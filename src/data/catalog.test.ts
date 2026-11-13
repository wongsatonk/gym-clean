import { describe, expect, it } from 'vitest';
import { cueFor, exerciseById, program, programDay } from './catalog';

const allPlanned = program.days.flatMap((d) => d.exercises);

describe('program data', () => {
  it('has six PPL days with unique ids', () => {
    expect(program.days.map((d) => d.id)).toEqual([
      'push-a',
      'pull-a',
      'legs-a',
      'push-b',
      'pull-b',
      'legs-b',
    ]);
  });

  it('every planned exercise has vendored data and a cue of at most 8 words', () => {
    for (const p of allPlanned) {
      expect(exerciseById(p.exerciseId), p.exerciseId).toBeDefined();
      const cue = cueFor(p.exerciseId);
      expect(cue, p.exerciseId).toBeTruthy();
      expect(cue.split(/\s+/).length, cue).toBeLessThanOrEqual(8);
    }
  });

  it('has valid set, rep, rest and weight values', () => {
    for (const p of allPlanned) {
      expect(p.sets).toBeGreaterThan(0);
      const [min, max] = p.targetReps;
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(min);
      expect(p.restSec).toBeGreaterThanOrEqual(30);
      expect(p.startWeightKg ?? 0).toBeGreaterThanOrEqual(0);
      expect((p.startWeightKg ?? 0) % 2.5, `${p.exerciseId} weight on a 2.5 kg step`).toBe(0);
      expect(['pose', 'manual']).toContain(p.tracking);
    }
  });

  it('weights chest, arms and back above legs', () => {
    const muscleSets = (muscles: string[]) =>
      allPlanned
        .filter((p) => muscles.includes(exerciseById(p.exerciseId)?.primaryMuscles[0] ?? ''))
        .reduce((n, p) => n + p.sets, 0);
    const upperPriority = muscleSets(['chest', 'biceps', 'triceps', 'lats', 'middle back']);
    const legs = muscleSets(['quadriceps', 'hamstrings', 'calves']);
    expect(upperPriority).toBeGreaterThan(legs);
  });

  it('never repeats an exercise within a day (logs are keyed by exerciseId)', () => {
    for (const d of program.days) {
      const ids = d.exercises.map((e) => e.exerciseId);
      expect(new Set(ids).size, d.id).toBe(ids.length);
    }
  });

  it('looks up a day by id', () => {
    expect(programDay('pull-a')?.name).toBe('Pull A');
    expect(programDay('nope')).toBeUndefined();
  });
});
