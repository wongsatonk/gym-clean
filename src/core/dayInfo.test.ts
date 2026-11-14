import { describe, expect, it } from 'vitest';
import { WORK_SEC_PER_SET, dayMuscles, estimateMinutes, muscleLabel, setCount } from './dayInfo';
import type { Exercise, PlannedExercise, ProgramDay } from './types';

const planned = (exerciseId: string, sets: number, restSec = 90): PlannedExercise => ({
  exerciseId,
  sets,
  targetReps: [8, 12],
  restSec,
  tracking: 'manual',
});

const day = (exercises: PlannedExercise[]): ProgramDay => ({ id: 'x', name: 'X', exercises });

type Muscles = Pick<Exercise, 'primaryMuscles' | 'secondaryMuscles'>;
const LOOKUP: Record<string, Muscles> = {
  row: { primaryMuscles: ['middle back'], secondaryMuscles: ['biceps', 'lats'] },
  pulldown: { primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'shoulders'] },
  curl: { primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'] },
};
const lookup = (id: string): Muscles | undefined => LOOKUP[id];

describe('estimateMinutes', () => {
  it('counts work + rests (no rest after the last set), rounded to 5 min', () => {
    expect(WORK_SEC_PER_SET).toBe(40);
    // 3 × 130 + 2 × 100 − 60 = 530 s ≈ 8.8 min → 10
    expect(estimateMinutes(day([planned('a', 3, 90), planned('b', 2, 60)]))).toBe(10);
  });

  it('is at least 5 min, also for an empty day', () => {
    expect(estimateMinutes(day([]))).toBe(5);
    expect(estimateMinutes(day([planned('a', 1, 30)]))).toBe(5);
  });

  it('rounds to the nearest 5', () => {
    // 4 × (40 + 120) − 120 = 520 s ≈ 8.7 → 10; 2 × 160 − 120 = 200 s ≈ 3.3 → 5
    expect(estimateMinutes(day([planned('a', 4, 120)]))).toBe(10);
    // 12 × 160 − 120 = 1800 s = 30 min
    expect(estimateMinutes(day([planned('a', 12, 120)]))).toBe(30);
  });
});

describe('setCount', () => {
  it('sums planned sets', () => {
    expect(setCount(day([planned('a', 3), planned('b', 4)]))).toBe(7);
    expect(setCount(day([]))).toBe(0);
  });
});

describe('dayMuscles', () => {
  it('ranks primary muscles by sets, ties in first-seen order', () => {
    const m = dayMuscles(
      day([planned('row', 3), planned('pulldown', 4), planned('curl', 3)]),
      lookup,
    );
    expect(m.primary).toEqual(['lats', 'middle back', 'biceps']);
  });

  it('keeps only secondary muscles that are not primary anywhere', () => {
    const m = dayMuscles(
      day([planned('row', 3), planned('pulldown', 4), planned('curl', 3)]),
      lookup,
    );
    expect(m.secondary).toEqual(['shoulders', 'forearms']);
  });

  it('adds sets across exercises sharing a primary muscle', () => {
    const m = dayMuscles(
      day([planned('curl', 2), planned('pulldown', 3), planned('curl', 2)]),
      lookup,
    );
    expect(m.primary).toEqual(['biceps', 'lats']);
  });

  it('skips unknown exercises', () => {
    expect(dayMuscles(day([planned('nope', 3)]), lookup)).toEqual({ primary: [], secondary: [] });
  });
});

describe('muscleLabel', () => {
  it('capitalises the first letter only', () => {
    expect(muscleLabel('middle back')).toBe('Middle back');
    expect(muscleLabel('lats')).toBe('Lats');
    expect(muscleLabel('')).toBe('');
  });
});
