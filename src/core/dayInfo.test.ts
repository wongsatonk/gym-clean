import { describe, expect, it } from 'vitest';
import { dayMuscles, estimateMinutes, muscleLabel, setCount } from './dayInfo';
import programJson from '../data/program.json';
import {
  estimateMinutes as trainerMinutes,
  estimateSeconds,
  fitToMinutes,
} from './trainer/estimate';
import type { Exercise, PlannedExercise, Program, ProgramDay } from './types';

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
  // The same formula as the coach's time estimate (trainer/estimate.ts), rounded to 5 for "~N min".
  it('is the trainer estimate rounded to the nearest 5 min', () => {
    const d = day([planned('a', 3, 90), planned('b', 2, 60)]);
    const sec = estimateSeconds(d);
    expect(estimateMinutes(d)).toBe(Math.round(sec / 300) * 5);
    // 90 + 3 × 12 × 3 + 2 × 90 + 90 + 2 × 12 × 3 + 60 = 600 s = 10 min
    expect(sec).toBe(600);
    expect(estimateMinutes(d)).toBe(10);
  });

  it('is at least 5 min, also for an empty day', () => {
    expect(estimateMinutes(day([]))).toBe(5);
    expect(estimateMinutes(day([planned('a', 1, 30)]))).toBe(5);
  });

  it('never shows more than a day fitted to N minutes (short on time, starter plans)', () => {
    for (const n of [20, 30, 45, 60, 75]) {
      const rows = Array.from({ length: 12 }, (_, i) => planned(`x${i}`, 4, 90));
      const fitted = fitToMinutes(rows, { minutes: n, main: ['x0'], pair: true });
      expect(trainerMinutes({ exercises: fitted.rows })).toBeLessThanOrEqual(n);
      expect(estimateMinutes(day(fitted.rows)), `${n}`).toBeLessThanOrEqual(n);
    }
  });

  it('agrees with the trainer estimate within 3 min on every program day', () => {
    for (const d of (programJson as Program).days)
      expect(Math.abs(estimateMinutes(d) - trainerMinutes(d)), d.id).toBeLessThanOrEqual(3);
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
