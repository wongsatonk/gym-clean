import { describe, expect, it } from 'vitest';
import type { WeighIn } from '../types';
import {
  WEIGH_IN_CUTOFF_HOUR,
  dailyWeighIns,
  planWeighInImport,
  weighInSource,
  type BodyMassSample,
} from './weighIns';

// Made-up numbers only (the repo is public). Times use the local Date constructor so the tests
// hold in any time zone.
const at = (y: number, mo: number, d: number, h: number, mi = 0): number =>
  new Date(y, mo - 1, d, h, mi).getTime();
const s = (time: number, kg: number): BodyMassSample => ({ time, kg });

describe('weighInSource', () => {
  it('reads a row without a source (typed before M11) as manual', () => {
    expect(weighInSource({ date: '2030-01-07', kg: 70 })).toBe('manual');
    expect(weighInSource({ date: '2030-01-07', kg: 70, source: 'manual' })).toBe('manual');
    expect(weighInSource({ date: '2030-01-07', kg: 70, source: 'health' })).toBe('health');
  });
});

describe('dailyWeighIns', () => {
  it('cuts off at local noon', () => {
    expect(WEIGH_IN_CUTOFF_HOUR).toBe(12);
  });

  it('picks the earliest sample before 12:00 local of each date, as a health weigh-in', () => {
    const out = dailyWeighIns([
      s(at(2030, 1, 7, 9, 30), 70.6),
      s(at(2030, 1, 7, 6, 45), 70.2),
      s(at(2030, 1, 7, 7, 0), 70.4),
      s(at(2030, 1, 8, 8, 0), 70.1),
    ]);
    expect(out).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-08', kg: 70.1, source: 'health' },
    ]);
  });

  it('a sample before 12:00 beats an earlier-listed or heavier afternoon one', () => {
    expect(
      dailyWeighIns([s(at(2030, 1, 7, 12, 0), 71), s(at(2030, 1, 7, 11, 59), 70.3)]),
    ).toEqual([{ date: '2030-01-07', kg: 70.3, source: 'health' }]);
  });

  it('no sample before 12:00: falls back to the earliest sample that day (a late scale sync)', () => {
    expect(
      dailyWeighIns([s(at(2030, 1, 7, 18, 0), 71.2), s(at(2030, 1, 7, 12, 0), 71)]),
    ).toEqual([{ date: '2030-01-07', kg: 71, source: 'health' }]);
  });

  it('takes a sample just after midnight as that new date', () => {
    expect(dailyWeighIns([s(at(2030, 1, 8, 0, 5), 70)])).toEqual([
      { date: '2030-01-08', kg: 70, source: 'health' },
    ]);
  });

  it('rounds kg like a typed weigh-in (4 decimals) and drops bad values', () => {
    const out = dailyWeighIns([
      s(at(2030, 1, 7, 7), 70.123456789),
      s(at(2030, 1, 8, 7), 0),
      s(at(2030, 1, 9, 7), -3),
      s(at(2030, 1, 10, 7), Number.NaN),
      s(Number.NaN, 70),
    ]);
    expect(out).toEqual([{ date: '2030-01-07', kg: 70.1235, source: 'health' }]);
  });

  it('a bad earliest sample does not hide a good later one the same morning', () => {
    expect(dailyWeighIns([s(at(2030, 1, 7, 6), 0), s(at(2030, 1, 7, 8), 70.5)])).toEqual([
      { date: '2030-01-07', kg: 70.5, source: 'health' },
    ]);
  });
});

describe('planWeighInImport (Health wins)', () => {
  const samples = [
    s(at(2030, 1, 7, 7), 70.2),
    s(at(2030, 1, 8, 7), 70.4),
    s(at(2030, 1, 9, 7), 70.6),
  ];

  it('imports every picked date when nothing is stored', () => {
    expect(planWeighInImport({ samples, existing: [], deleted: [] })).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-08', kg: 70.4, source: 'health' },
      { date: '2030-01-09', kg: 70.6, source: 'health' },
    ]);
  });

  it('replaces a typed weigh-in on that date (with or without an explicit source)', () => {
    const existing: WeighIn[] = [
      { date: '2030-01-07', kg: 69.9 },
      { date: '2030-01-08', kg: 70.4, source: 'manual' },
    ];
    expect(planWeighInImport({ samples, existing, deleted: [] })).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      // Same kg but typed: still rewritten so it shows "from Health".
      { date: '2030-01-08', kg: 70.4, source: 'health' },
      { date: '2030-01-09', kg: 70.6, source: 'health' },
    ]);
  });

  it('leaves a typed weigh-in alone on a date Health has no sample for', () => {
    const existing: WeighIn[] = [{ date: '2030-01-10', kg: 69.5 }];
    expect(
      planWeighInImport({ samples, existing, deleted: [] }).map((w) => w.date),
    ).not.toContain('2030-01-10');
  });

  it('never re-imports a date he deleted, typed row or not', () => {
    const existing: WeighIn[] = [{ date: '2030-01-08', kg: 69.0 }];
    expect(planWeighInImport({ samples, existing, deleted: ['2030-01-08'] })).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-09', kg: 70.6, source: 'health' },
    ]);
  });

  it("updates an imported weigh-in when Health's pick for that date changed", () => {
    // First read: only an afternoon sample (fallback). A later read also has the morning one.
    const existing: WeighIn[] = [{ date: '2030-01-07', kg: 70.9, source: 'health' }];
    expect(
      planWeighInImport({
        samples: [s(at(2030, 1, 7, 15), 70.9), s(at(2030, 1, 7, 6), 70.1)],
        existing,
        deleted: [],
      }),
    ).toEqual([{ date: '2030-01-07', kg: 70.1, source: 'health' }]);
  });

  it('skips an imported weigh-in that already holds the same value (nothing to write)', () => {
    const existing: WeighIn[] = [{ date: '2030-01-07', kg: 70.2, source: 'health' }];
    expect(
      planWeighInImport({ samples: [s(at(2030, 1, 7, 7), 70.2)], existing, deleted: [] }),
    ).toEqual([]);
  });
});
