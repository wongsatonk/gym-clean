import { describe, expect, it } from 'vitest';
import type { PlannedExercise } from '../types';
import { alignRows, rowChanged } from './rows';

const row = (id: string, sets = 3, reps: [number, number] = [8, 12]): PlannedExercise => ({
  exerciseId: id,
  sets,
  targetReps: reps,
  restSec: 90,
  tracking: 'manual',
});
const ids = (pairs: ReturnType<typeof alignRows>) =>
  pairs.map((p) => `${p.from.exerciseId}>${p.to?.exerciseId ?? '-'}`);

describe('alignRows (likeness pairing, no row map)', () => {
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

describe('alignRows with a row map (DayAdjust.replaced)', () => {
  it('follows the map where likeness would guess wrong', () => {
    // b removed, c swapped for x, but x looks like b (likeness would pair b>x).
    const from = [row('a'), row('b', 4, [6, 8]), row('c')];
    const to = [row('a'), row('x', 4, [6, 8])];
    expect(ids(alignRows(from, to))).toEqual(['a>a', 'b>x', 'c>-']);
    const map = [
      { fromId: 'b', toId: null },
      { fromId: 'c', toId: 'x' },
    ];
    expect(ids(alignRows(from, to, map))).toEqual(['a>a', 'b>-', 'c>x']);
  });

  it('a swap target is paired with the mapped row even when the order moved', () => {
    const from = [row('a'), row('b'), row('c')];
    const to = [row('y'), row('b'), row('x')];
    const map = [
      { fromId: 'a', toId: 'x' },
      { fromId: 'c', toId: 'y' },
    ];
    expect(ids(alignRows(from, to, map))).toEqual(['a>x', 'b>b', 'c>y']);
  });

  it('a chain (plan row → earlier swap-in → now) works from either side', () => {
    // Plan a → x earlier, then x → y now: the map lists both a and x.
    const map = [
      { fromId: 'a', toId: 'y' },
      { fromId: 'x', toId: 'y' },
    ];
    const to = [row('y'), row('b')];
    expect(ids(alignRows([row('a'), row('b')], to, map))).toEqual(['a>y', 'b>b']);
    expect(ids(alignRows([row('x'), row('b')], to, map))).toEqual(['x>y', 'b>b']);
  });

  it('rows the map does not cover fall back to likeness; stale entries are ignored', () => {
    const from = [row('a'), row('b'), row('c')];
    const to = [row('a'), row('x'), row('z', 5)];
    const map = [
      // stale: q isn't in `to`
      { fromId: 'b', toId: 'q' },
      // kept rows aren't replacements
      { fromId: 'a', toId: null },
    ];
    expect(ids(alignRows(from, to, map))).toEqual(['a>a', 'b>x', 'c>z']);
  });

  it('a mapped target is used once', () => {
    const from = [row('a'), row('b')];
    const to = [row('x')];
    const map = [
      { fromId: 'a', toId: 'x' },
      { fromId: 'b', toId: 'x' },
    ];
    expect(ids(alignRows(from, to, map))).toEqual(['a>x', 'b>-']);
  });
});
