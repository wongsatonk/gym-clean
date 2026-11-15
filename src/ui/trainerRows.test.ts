import { describe, expect, it } from 'vitest';
import type { PlannedExercise } from '../core/types';
import { alignRows, rowChanged } from './trainerRows';

const row = (id: string, sets = 3, reps: [number, number] = [8, 12]): PlannedExercise => ({
  exerciseId: id,
  sets,
  targetReps: reps,
  restSec: 90,
  tracking: 'manual',
});
const ids = (pairs: ReturnType<typeof alignRows>) =>
  pairs.map((p) => `${p.from.exerciseId}>${p.to?.exerciseId ?? '-'}`);

describe('alignRows', () => {
  it('pairs kept rows in place (lighter)', () => {
    const from = [row('a'), row('b')];
    const to = [row('a', 2), row('b', 2)];
    expect(ids(alignRows(from, to))).toEqual(['a>a', 'b>b']);
  });

  it('pairs a swap in place and a removal with null', () => {
    const from = [row('a'), row('b'), row('c')];
    expect(ids(alignRows(from, [row('a'), row('x'), row('c')]))).toEqual(['a>a', 'b>x', 'c>c']);
    expect(ids(alignRows(from, [row('a'), row('c')]))).toEqual(['a>a', 'b>-', 'c>c']);
  });

  it('a removal next to a swap: the swap goes to the row it copies', () => {
    const from = [row('a'), row('b', 4, [6, 8]), row('c', 3, [10, 15])];
    const to = [row('a'), row('x', 3, [10, 15])];
    expect(ids(alignRows(from, to))).toEqual(['a>a', 'b>-', 'c>x']);
  });

  it('trailing swaps and removals', () => {
    const from = [row('a'), row('b'), row('c')];
    expect(ids(alignRows(from, [row('a'), row('y')]))).toEqual(['a>a', 'b>y', 'c>-']);
    expect(ids(alignRows(from, []))).toEqual(['a>-', 'b>-', 'c>-']);
  });

  it('rowChanged', () => {
    expect(rowChanged(row('a'), row('a'))).toBe(false);
    expect(rowChanged(row('a'), row('a', 2))).toBe(true);
    expect(rowChanged(row('a'), null)).toBe(true);
  });
});
