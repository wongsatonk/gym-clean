import { describe, expect, it } from 'vitest';
import { inverseTable } from './poses';

describe('inverseTable', () => {
  it('inverts increasing and decreasing samples, clamped to the ends', () => {
    const sq = inverseTable(0, 10, 100, (x) => x * x);
    expect(sq(25)).toBeCloseTo(5, 2);
    expect(sq(-1)).toBe(0);
    expect(sq(1000)).toBe(10);
    const down = inverseTable(0, 90, 90, (x) => 180 - x);
    expect(down(135)).toBeCloseTo(45, 9);
  });

  it('a throw mid-build leaves no half-filled table: the next call rebuilds it whole', () => {
    let calls = 0;
    let failAt: number | undefined = 30;
    const inv = inverseTable(0, 100, 100, (x) => {
      calls++;
      if (calls === failAt) throw new Error('boom');
      return 2 * x;
    });
    expect(() => inv(50)).toThrow('boom');
    failAt = undefined;
    calls = 0;
    // Had the first 29 samples been kept, the lookup would search a short table and miss.
    expect(inv(50)).toBeCloseTo(25, 9);
    expect(inv(150)).toBeCloseTo(75, 9);
    expect(calls).toBe(101);
    // Built once: later calls do not re-sample.
    inv(10);
    expect(calls).toBe(101);
  });
});
