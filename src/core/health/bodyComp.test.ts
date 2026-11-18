import { describe, expect, it } from 'vitest';
import type { HealthDay } from '../types';
import { BODY_COMP_AVG_DAYS, bodyCompTrend, type BodyCompSeries } from './bodyComp';

/** All numbers are made up (the repo is public). */
const TODAY = '2026-06-30';
const must = <T>(v: T | null | undefined): T => {
  if (v === null || v === undefined) throw new Error('expected a value');
  return v;
};

const days: HealthDay[] = [
  { date: '2026-06-20', bodyFatPct: 24, leanMassKg: 52 },
  { date: '2026-06-24', bodyFatPct: 23, sleepMin: 400 },
  { date: '2026-06-26', sleepMin: 410 },
  { date: '2026-06-27', bodyFatPct: 22.5, leanMassKg: 52.6 },
  { date: '2026-06-30', bodyFatPct: 22, leanMassKg: 52.9 },
];

describe('bodyCompTrend', () => {
  it('gives one point per date for the last `span` dates ending today, oldest first', () => {
    const s = must(bodyCompTrend(days, 14, TODAY).bodyFat);
    expect(s.points).toHaveLength(14);
    expect(s.points[0]?.date).toBe('2026-06-17');
    expect(s.points.at(-1)?.date).toBe(TODAY);
    expect(s.points.map((p) => p.date)).toEqual([...s.points.map((p) => p.date)].sort());
  });

  it('a point holds that date’s reading, or null on a date without one', () => {
    const s = must(bodyCompTrend(days, 14, TODAY).bodyFat);
    const at = (date: string) => s.points.find((p) => p.date === date);
    expect(at('2026-06-24')?.value).toBe(23);
    expect(at('2026-06-26')?.value).toBeNull();
    expect(at('2026-06-17')?.value).toBeNull();
  });

  it('the average is the mean of the readings in the 7 days ending that date', () => {
    expect(BODY_COMP_AVG_DAYS).toBe(7);
    const s = must(bodyCompTrend(days, 14, TODAY).bodyFat);
    const at = (date: string) => s.points.find((p) => p.date === date)?.avg;
    expect(at('2026-06-19')).toBeNull(); // nothing yet
    expect(at('2026-06-20')).toBe(24);
    expect(at('2026-06-26')).toBe(23.5); // 20th + 24th
    expect(at('2026-06-27')).toBe(22.8); // 24th + 27th = 22.75 → 0.1 %
    expect(at('2026-06-30')).toBe(22.5); // 24th, 27th, 30th
  });

  it('readings just before the window still count toward the first averages', () => {
    const s = must(bodyCompTrend(days, 5, TODAY).bodyFat);
    expect(s.points[0]).toEqual({ date: '2026-06-26', value: null, avg: 23.5 });
  });

  it('lean mass is its own series in kg, to 0.01', () => {
    const s = must(bodyCompTrend(days, 14, TODAY).leanMass);
    const at = (date: string) => s.points.find((p) => p.date === date);
    expect(at('2026-06-24')).toEqual({ date: '2026-06-24', value: null, avg: 52 });
    expect(at('2026-06-27')).toEqual({ date: '2026-06-27', value: 52.6, avg: 52.6 });
    expect(at('2026-06-30')).toEqual({ date: '2026-06-30', value: 52.9, avg: 52.75 });
  });

  it('latest = the newest reading in the window', () => {
    const t = bodyCompTrend(days, 14, TODAY);
    expect(t.bodyFat?.latest).toEqual({ date: TODAY, value: 22 });
    expect(bodyCompTrend(days, 14, '2026-06-29').leanMass?.latest).toEqual({
      date: '2026-06-27',
      value: 52.6,
    });
  });

  it('change = last average minus the first average in the window, as plain numbers', () => {
    const t = bodyCompTrend(days, 14, TODAY);
    expect(t.bodyFat?.change).toBe(-1.5); // 24 → 22.5
    expect(t.leanMass?.change).toBe(0.75); // 52 → 52.75
  });

  it('change is null until two dates in the window have a reading', () => {
    const one: HealthDay[] = [{ date: TODAY, bodyFatPct: 22 }];
    const s: BodyCompSeries = must(bodyCompTrend(one, 14, TODAY).bodyFat);
    expect(s.latest).toEqual({ date: TODAY, value: 22 });
    expect(s.change).toBeNull();
  });

  it('a value with no reading in the window is null, so its trend is not shown', () => {
    expect(bodyCompTrend([], 14, TODAY)).toEqual({ bodyFat: null, leanMass: null });
    const fatOnly = bodyCompTrend([{ date: TODAY, bodyFatPct: 22 }], 14, TODAY);
    expect(fatOnly.leanMass).toBeNull();
    expect(fatOnly.bodyFat).not.toBeNull();
    // Old readings only: outside the window.
    expect(bodyCompTrend([{ date: '2026-01-01', bodyFatPct: 22 }], 14, TODAY).bodyFat).toBeNull();
  });

  it('ignores readings after today, damaged values and a zero or negative span', () => {
    const odd = [
      { date: '2026-07-02', bodyFatPct: 30 },
      { date: '2026-06-29', bodyFatPct: Number.NaN, leanMassKg: -4 },
      { date: '2026-06-28', bodyFatPct: 21 },
    ] as HealthDay[];
    const t = bodyCompTrend(odd, 7, TODAY);
    expect(t.bodyFat?.latest).toEqual({ date: '2026-06-28', value: 21 });
    expect(t.bodyFat?.points.at(-1)).toEqual({ date: TODAY, value: null, avg: 21 });
    expect(t.leanMass).toBeNull();
    expect(bodyCompTrend(days, 0, TODAY)).toEqual({ bodyFat: null, leanMass: null });
  });

  it('a date listed twice keeps the last row given', () => {
    const twice: HealthDay[] = [
      { date: TODAY, bodyFatPct: 25 },
      { date: TODAY, bodyFatPct: 22 },
    ];
    expect(bodyCompTrend(twice, 3, TODAY).bodyFat?.latest).toEqual({ date: TODAY, value: 22 });
  });

  it('does not change its input and reads only the two body values', () => {
    const frozen = Object.freeze(days.map((d) => Object.freeze({ ...d })));
    const t = bodyCompTrend(frozen, 14, TODAY);
    expect(JSON.stringify(t)).not.toMatch(/sleep|400|410/);
  });
});
