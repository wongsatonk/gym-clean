import { describe, expect, it } from 'vitest';
import type { Measurement } from '../types';
import {
  CM_PER_IN,
  MEASURE_AGAIN_DAYS,
  formatLength,
  fromLength,
  isValidCm,
  lengthUnitFor,
  measureDue,
  measurementSeries,
  siteLabel,
  toLength,
} from './measurements';

// Made-up tape numbers only.
const SITES = ['leftArm', 'rightArm', 'chest', 'waist', 'hips', 'leftThigh', 'rightThigh'];
const rows: Measurement[] = [
  { date: '2026-06-29', site: 'leftArm', cm: 33.5 },
  { date: '2026-06-01', site: 'leftArm', cm: 33 },
  { date: '2026-06-01', site: 'waist', cm: 80 },
  { date: '2026-06-29', site: 'waist', cm: 79 },
  { date: '2026-07-27', site: 'waist', cm: 78.5 },
  { date: '2026-06-01', site: 'neck', cm: 38 },
];

describe('units', () => {
  it('cm ↔ in follows the weight unit', () => {
    expect(lengthUnitFor('kg')).toBe('cm');
    expect(lengthUnitFor('lb')).toBe('in');
    expect(CM_PER_IN).toBe(2.54);
    expect(toLength(25.4, 'in')).toBeCloseTo(10, 9);
    expect(toLength(25.4, 'cm')).toBe(25.4);
    expect(fromLength(10, 'in')).toBeCloseTo(25.4, 9);
    expect(fromLength(33, 'cm')).toBe(33);
    expect(fromLength(toLength(81.3, 'in'), 'in')).toBeCloseTo(81.3, 9);
  });

  it('formats with one decimal at most', () => {
    expect(formatLength(33, 'cm')).toBe('33 cm');
    expect(formatLength(33.46, 'cm')).toBe('33.5 cm');
    expect(formatLength(81.28, 'in')).toBe('32 in');
    expect(formatLength(-1.27, 'in', { signed: true })).toBe('−0.5 in');
    expect(formatLength(1, 'cm', { signed: true })).toBe('+1 cm');
    expect(formatLength(0, 'cm', { signed: true })).toBe('0 cm');
  });

  it('accepts only plausible tape values', () => {
    expect(isValidCm(33)).toBe(true);
    expect(isValidCm(0)).toBe(false);
    expect(isValidCm(-4)).toBe(false);
    expect(isValidCm(Number.NaN)).toBe(false);
    expect(isValidCm(900)).toBe(false);
  });
});

describe('measurementSeries', () => {
  it('one series per site from the setting, in the setting’s order, oldest first', () => {
    const series = measurementSeries(rows, SITES);
    expect(series.map((s) => s.site)).toEqual(SITES);
    const waist = series.find((s) => s.site === 'waist');
    expect(waist?.points).toEqual([
      { date: '2026-06-01', cm: 80 },
      { date: '2026-06-29', cm: 79 },
      { date: '2026-07-27', cm: 78.5 },
    ]);
    expect(waist?.latest).toEqual({ date: '2026-07-27', cm: 78.5 });
    expect(waist?.changeCm).toBeCloseTo(-1.5, 9);
    expect(waist?.lastChangeCm).toBeCloseTo(-0.5, 9);
    expect(waist?.label).toBe('Waist');
  });

  it('a site with no rows is still listed, empty', () => {
    const chest = measurementSeries(rows, SITES).find((s) => s.site === 'chest');
    expect(chest).toEqual({ site: 'chest', label: 'Chest', points: [], latest: null, changeCm: null, lastChangeCm: null });
  });

  it('only the sites from settings are shown; a changed setting changes the list', () => {
    expect(measurementSeries(rows, ['waist']).map((s) => s.site)).toEqual(['waist']);
    expect(measurementSeries(rows, ['neck', 'waist']).map((s) => s.site)).toEqual(['neck', 'waist']);
    expect(measurementSeries(rows, [])).toEqual([]);
  });

  it('a repeated date keeps the later row; one point has no change yet', () => {
    const series = measurementSeries(
      [
        { date: '2026-06-01', site: 'hips', cm: 95 },
        { date: '2026-06-01', site: 'hips', cm: 94.5 },
      ],
      ['hips'],
    );
    expect(series[0]?.points).toEqual([{ date: '2026-06-01', cm: 94.5 }]);
    expect(series[0]?.changeCm).toBeNull();
  });

  it('labels: known ids, and a readable fallback for others', () => {
    expect(siteLabel('leftArm')).toBe('Left arm');
    expect(siteLabel('rightThigh')).toBe('Right thigh');
    expect(siteLabel('neck')).toBe('Neck');
    expect(siteLabel('upperBack')).toBe('Upper back');
  });
});

describe('measureDue', () => {
  it('data: measure again after 28 days', () => {
    expect(MEASURE_AGAIN_DAYS).toBe(28);
  });

  it('never measured → due now', () => {
    expect(measureDue([], SITES, '2026-06-01')).toEqual({ due: true, lastDate: null, dueDate: null, daysLeft: 0 });
  });

  it('due exactly 28 days after the last measuring day, not before', () => {
    const first = rows.filter((r) => r.date === '2026-06-01');
    expect(measureDue(first, SITES, '2026-06-28')).toEqual({
      due: false,
      lastDate: '2026-06-01',
      dueDate: '2026-06-29',
      daysLeft: 1,
    });
    expect(measureDue(first, SITES, '2026-06-29')).toMatchObject({ due: true, daysLeft: 0 });
    expect(measureDue(first, SITES, '2026-08-01')).toMatchObject({ due: true, daysLeft: 0 });
  });

  it('counts from the latest row of any listed site; other sites are ignored', () => {
    expect(measureDue(rows, SITES, '2026-08-01')).toMatchObject({ due: false, lastDate: '2026-07-27', dueDate: '2026-08-24' });
    expect(measureDue(rows, ['leftArm'], '2026-08-01')).toMatchObject({ due: true, lastDate: '2026-06-29' });
    expect(measureDue(rows, ['chest'], '2026-08-01')).toMatchObject({ due: true, lastDate: null });
  });

  it('rows dated after today do not count', () => {
    expect(measureDue([{ date: '2026-09-01', site: 'waist', cm: 78 }], SITES, '2026-08-01')).toMatchObject({
      due: true,
      lastDate: null,
    });
  });
});
