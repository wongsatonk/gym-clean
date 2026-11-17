import { describe, expect, it } from 'vitest';
import { addDate } from '../trainer/plan';
import type { HealthDay } from '../types';
import { baseline, median, workoutKcalBaseline } from './baseline';

/** Made-up numbers only. */
const TODAY = '2026-06-30';
/** `n` days before TODAY with `make(i)` (i = 1 is yesterday). */
const past = (n: number, make: (i: number) => Partial<HealthDay>): HealthDay[] =>
  Array.from({ length: n }, (_, k) => ({ date: addDate(TODAY, -(k + 1)), ...make(k + 1) }));

describe('median', () => {
  it('odd, even, empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeUndefined();
  });
});

describe('baseline', () => {
  it('is the median of the 28 days before today', () => {
    const days = past(10, (i) => ({ sleepMin: 400 + i }));
    expect(baseline(days, TODAY, 'sleepMin')).toBe(405.5);
  });

  it('needs at least 7 days with a value', () => {
    expect(
      baseline(
        past(6, () => ({ restingHr: 55 })),
        TODAY,
        'restingHr',
      ),
    ).toBeUndefined();
    expect(
      baseline(
        past(7, () => ({ restingHr: 55 })),
        TODAY,
        'restingHr',
      ),
    ).toBe(55);
    // 10 rows but only 6 carry the value.
    const gaps = past(10, (i) => (i <= 6 ? { restingHr: 55 } : { sleepMin: 420 }));
    expect(baseline(gaps, TODAY, 'restingHr')).toBeUndefined();
  });

  it('ignores today, the future and days older than 28', () => {
    const days: HealthDay[] = [
      ...past(28, () => ({ sleepMin: 420 })),
      { date: addDate(TODAY, -29), sleepMin: 10 },
      { date: addDate(TODAY, -40), sleepMin: 10 },
      { date: TODAY, sleepMin: 10 },
      { date: addDate(TODAY, 1), sleepMin: 10 },
    ];
    expect(baseline(days, TODAY, 'sleepMin')).toBe(420);
  });

  it('HRV only from the same source, so a mix never forms one baseline', () => {
    const days = past(20, (i) =>
      i % 2 === 0 ? { hrvMs: 60, hrvSource: 'WHOOP' } : { hrvMs: 35, hrvSource: 'Watch' },
    );
    expect(baseline(days, TODAY, 'hrvMs', 'WHOOP')).toBe(60);
    expect(baseline(days, TODAY, 'hrvMs', 'Watch')).toBe(35);
    // 4 WHOOP days in a mostly-Watch month: not enough.
    const mostlyWatch = past(20, (i) =>
      i <= 4 ? { hrvMs: 60, hrvSource: 'WHOOP' } : { hrvMs: 35, hrvSource: 'Watch' },
    );
    expect(baseline(mostlyWatch, TODAY, 'hrvMs', 'WHOOP')).toBeUndefined();
    expect(baseline(mostlyWatch, TODAY, 'hrvMs', 'Watch')).toBe(35);
  });
});

describe('workoutKcalBaseline', () => {
  const w = (date: string, kcal?: number) => ({
    start: Date.parse(`${date}T18:00:00Z`),
    minutes: 40,
    kind: 'running',
    ...(kcal === undefined ? {} : { kcal }),
    source: 'WHOOP',
  });

  it('median kcal of outside workouts in the window, needs 7 workouts with kcal', () => {
    const six = past(6, (i) => ({ workouts: [w(addDate(TODAY, -i), 300 + i)] }));
    expect(workoutKcalBaseline(six, TODAY)).toBeUndefined();
    const days = past(8, (i) => ({ workouts: [w(addDate(TODAY, -i), 300 + i * 10)] }));
    expect(workoutKcalBaseline(days, TODAY)).toBe(345);
    const noKcal = past(10, (i) => ({ workouts: [w(addDate(TODAY, -i))] }));
    expect(workoutKcalBaseline(noKcal, TODAY)).toBeUndefined();
  });
});
