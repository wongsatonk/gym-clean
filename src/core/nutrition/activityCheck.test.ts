import { describe, expect, it } from 'vitest';
import type { HealthDay, NutritionSettings, WeighIn } from '../types';
import { addDate } from '../trainer/plan';
import { ACTIVITY_CHECK, activityCheck, impliedActivityFactor } from './activityCheck';
import { NUTRITION_DEFAULTS } from './targets';

// Made-up body stats only (the repo is public).
// BMR (Mifflin–St Jeor): 10·70 + 6.25·175 − 5·35 + 5 = 1623.75 kcal.
const settings = (activity: NutritionSettings['activity']): NutritionSettings => ({
  ...NUTRITION_DEFAULTS,
  gainPctPerWeek: [0.25, 0.5],
  heightCm: 175,
  birthYear: 1995,
  sex: 'male',
  activity,
});
const TODAY = '2030-01-15';
const weighIns: WeighIn[] = [{ date: '2030-01-14', kg: 70 }];

/** `n` days with the same active energy, ending yesterday. */
const days = (kcal: number, n = 14, endOffset = -1): HealthDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: addDate(TODAY, endOffset - i), activeKcal: kcal }));

describe('impliedActivityFactor', () => {
  it('is (BMR + active) / ((1 − TEF) · BMR)', () => {
    expect(ACTIVITY_CHECK.tefShare).toBe(0.1);
    expect(impliedActivityFactor(1000, 0)).toBeCloseTo(1 / 0.9, 6);
    expect(impliedActivityFactor(1623.75, 600)).toBeCloseTo(2223.75 / 1461.375, 6);
  });
});

describe('activityCheck (M11-q8: suggests only)', () => {
  it('uses a 14-day window and needs at least 10 days with data', () => {
    expect(ACTIVITY_CHECK.days).toBe(14);
    expect(ACTIVITY_CHECK.minDays).toBe(10);
  });

  it('suggests moderate when Health shows clearly more than light', () => {
    expect(
      activityCheck({ settings: settings('light'), weighIns, healthDays: days(600), today: TODAY }),
    ).toEqual({
      current: 'light',
      suggested: 'moderate',
      direction: 'more',
      avgActiveKcal: 600,
      days: 14,
    });
  });

  it('suggests a lower level when Health shows less', () => {
    expect(
      activityCheck({ settings: settings('very'), weighIns, healthDays: days(100), today: TODAY }),
    ).toMatchObject({ current: 'very', suggested: 'sedentary', direction: 'less' });
  });

  it('null when the level already fits', () => {
    // light ≈ 386 kcal/day active for this made-up body.
    expect(
      activityCheck({ settings: settings('light'), weighIns, healthDays: days(390), today: TODAY }),
    ).toBeNull();
  });

  it('null just past a boundary (a small margin keeps it from flip-flopping)', () => {
    // light/moderate boundary ≈ 513 kcal; 540 is past it but inside the margin.
    expect(
      activityCheck({ settings: settings('light'), weighIns, healthDays: days(540), today: TODAY }),
    ).toBeNull();
  });

  it('null with fewer than 10 days of active energy in the window', () => {
    expect(
      activityCheck({ settings: settings('light'), weighIns, healthDays: days(600, 9), today: TODAY }),
    ).toBeNull();
    const ten = activityCheck({
      settings: settings('light'),
      weighIns,
      healthDays: days(600, 10),
      today: TODAY,
    });
    expect(ten).toMatchObject({ suggested: 'moderate', days: 10 });
  });

  it('ignores today (partial), days older than the window and days without active energy', () => {
    const healthDays: HealthDay[] = [
      ...days(600, 12),
      { date: TODAY, activeKcal: 5000 },
      { date: addDate(TODAY, -15), activeKcal: 5000 },
      { date: addDate(TODAY, -13), sleepMin: 420 },
    ];
    // days(600, 12) covers -1…-12; -13 has no active energy; -14 is missing.
    expect(
      activityCheck({ settings: settings('light'), weighIns, healthDays, today: TODAY }),
    ).toMatchObject({ avgActiveKcal: 600, days: 12 });
  });

  it('null without any weigh-in (no body weight for the estimate)', () => {
    expect(
      activityCheck({ settings: settings('light'), weighIns: [], healthDays: days(600), today: TODAY }),
    ).toBeNull();
  });

  it('never changes the settings it was given', () => {
    const s = settings('light');
    const copy = structuredClone(s);
    activityCheck({ settings: s, weighIns, healthDays: days(900), today: TODAY });
    expect(s).toEqual(copy);
  });
});
