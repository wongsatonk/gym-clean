/**
 * M11 personal baselines (SPEC M11): the median of his own values over the 28 days before
 * `date`, used only once at least 7 values exist. HRV is compared only within one source
 * (WHOOP's RMSSD-based value and Apple's SDNN don't mix). Pure.
 */
import { addDate } from '../trainer/plan';
import type { HealthDay } from '../types';
import { HEALTH_RULES, type HealthRules } from './rules';

export type BaselineMetric = 'sleepMin' | 'restingHr' | 'hrvMs';

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const hi = s[mid] ?? 0;
  return s.length % 2 ? hi : ((s[mid - 1] ?? hi) + hi) / 2;
}

/** Days strictly before `date` and within the baseline window. */
export function windowDays(
  days: readonly HealthDay[],
  date: string,
  rules: HealthRules = HEALTH_RULES,
): HealthDay[] {
  const from = addDate(date, -rules.baselineDays);
  return days.filter((d) => d.date >= from && d.date < date);
}

/**
 * His usual value of `metric` before `date`, or undefined with fewer than `minBaselineDays`
 * values. For `hrvMs`, only days from `hrvSource` count.
 */
export function baseline(
  days: readonly HealthDay[],
  date: string,
  metric: BaselineMetric,
  hrvSource?: string,
  rules: HealthRules = HEALTH_RULES,
): number | undefined {
  const values = windowDays(days, date, rules)
    .filter((d) => metric !== 'hrvMs' || d.hrvSource === hrvSource)
    .map((d) => d[metric])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return values.length >= rules.minBaselineDays ? median(values) : undefined;
}

/** Median active energy of his outside workouts before `date` (needs `minBaselineDays` workouts). */
export function workoutKcalBaseline(
  days: readonly HealthDay[],
  date: string,
  rules: HealthRules = HEALTH_RULES,
): number | undefined {
  const kcal = windowDays(days, date, rules)
    .flatMap((d) => d.workouts ?? [])
    .map((w) => w.kcal)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return kcal.length >= rules.minBaselineDays ? median(kcal) : undefined;
}
