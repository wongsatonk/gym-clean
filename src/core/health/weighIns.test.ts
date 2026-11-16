import { describe, expect, it } from 'vitest';
import type { WeighIn } from '../types';
import {
  WEIGH_IN_CUTOFF_HOUR,
  morningWeighIns,
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

describe('morningWeighIns', () => {
  it('cuts off at local noon', () => {
    expect(WEIGH_IN_CUTOFF_HOUR).toBe(12);
  });

  it('picks the earliest sample before 12:00 local of each date, as a health weigh-in', () => {
    const out = morningWeighIns([
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

  it('ignores samples at or after 12:00 (no afternoon fallback)', () => {
    expect(morningWeighIns([s(at(2030, 1, 7, 12, 0), 71), s(at(2030, 1, 7, 18, 0), 71.2)])).toEqual(
      [],
    );
    expect(
      morningWeighIns([s(at(2030, 1, 7, 11, 59), 70.3), s(at(2030, 1, 7, 12, 0), 71)]),
    ).toEqual([{ date: '2030-01-07', kg: 70.3, source: 'health' }]);
  });

  it('takes a sample just after midnight as that new date', () => {
    expect(morningWeighIns([s(at(2030, 1, 8, 0, 5), 70)])).toEqual([
      { date: '2030-01-08', kg: 70, source: 'health' },
    ]);
  });

  it('rounds kg like a typed weigh-in (4 decimals) and drops bad values', () => {
    const out = morningWeighIns([
      s(at(2030, 1, 7, 7), 70.123456789),
      s(at(2030, 1, 8, 7), 0),
      s(at(2030, 1, 9, 7), -3),
      s(at(2030, 1, 10, 7), Number.NaN),
      s(Number.NaN, 70),
    ]);
    expect(out).toEqual([{ date: '2030-01-07', kg: 70.1235, source: 'health' }]);
  });

  it('a bad earliest sample does not hide a good later one the same morning', () => {
    expect(morningWeighIns([s(at(2030, 1, 7, 6), 0), s(at(2030, 1, 7, 8), 70.5)])).toEqual([
      { date: '2030-01-07', kg: 70.5, source: 'health' },
    ]);
  });
});

describe('planWeighInImport', () => {
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

  it('a typed weigh-in on that date wins (with or without an explicit source)', () => {
    const existing: WeighIn[] = [
      { date: '2030-01-07', kg: 69.9 },
      { date: '2030-01-08', kg: 69.8, source: 'manual' },
    ];
    expect(planWeighInImport({ samples, existing, deleted: [] })).toEqual([
      { date: '2030-01-09', kg: 70.6, source: 'health' },
    ]);
  });

  it('never re-imports a date he deleted', () => {
    expect(planWeighInImport({ samples, existing: [], deleted: ['2030-01-08'] })).toEqual([
      { date: '2030-01-07', kg: 70.2, source: 'health' },
      { date: '2030-01-09', kg: 70.6, source: 'health' },
    ]);
  });

  it('keeps an already imported weigh-in (a later read never overwrites it)', () => {
    const existing: WeighIn[] = [{ date: '2030-01-07', kg: 70.0, source: 'health' }];
    expect(
      planWeighInImport({ samples: [s(at(2030, 1, 7, 9), 70.9)], existing, deleted: [] }),
    ).toEqual([]);
  });
});
