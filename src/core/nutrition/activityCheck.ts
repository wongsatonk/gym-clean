// M11 activity-level check (SPEC M11 "Active energy → activity level", M11-q8). Pure: dates are
// passed in. It only suggests: the weekly check card shows "Switch / Keep", and nothing here (or
// in the caller) changes NutritionSettings by itself.
//
// Health's active energy is energy above resting, so the activity factor it implies is
//   factor ≈ (BMR + active) / ((1 − TEF) · BMR)
// (TEF = the thermic effect of food, about 10% of the day's total). The level whose M7 factor is
// nearest wins; a small margin past the current level's band keeps it from flip-flopping.
import type { HealthDay, NutritionSettings, WeighIn } from '../types';
import { addDate } from '../trainer/plan';
import { ACTIVITY_FACTORS, ageOn, bmrMifflin, currentWeight } from './targets';

export type ActivityLevel = NutritionSettings['activity'];

/** Thresholds as data. */
export const ACTIVITY_CHECK = {
  /** Days averaged, ending yesterday (today is still partial). */
  days: 14,
  /** Days in the window that must have active energy, else no suggestion. */
  minDays: 10,
  /** Share of the day's total energy spent digesting food. */
  tefShare: 0.1,
  /** How far (in factor units) past the current level's band the estimate must be. */
  margin: 0.025,
} as const;

const LEVELS: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'very'];

export type ActivitySuggestion = {
  current: ActivityLevel;
  suggested: ActivityLevel;
  /** 'more' = Health shows more activity than the set level. */
  direction: 'more' | 'less';
  /** Rounded mean of the days with data. */
  avgActiveKcal: number;
  /** Days with active energy in the window. */
  days: number;
};

export function impliedActivityFactor(bmrKcal: number, activeKcal: number): number {
  return (bmrKcal + activeKcal) / ((1 - ACTIVITY_CHECK.tefShare) * bmrKcal);
}

/** Band of a level: halfway to its neighbours' factors (open-ended at the ends). */
function band(level: ActivityLevel): [number, number] {
  const i = LEVELS.indexOf(level);
  const f = (l: ActivityLevel | undefined) => (l === undefined ? undefined : ACTIVITY_FACTORS[l]);
  const lo = f(LEVELS[i - 1]);
  const hi = f(LEVELS[i + 1]);
  const own = ACTIVITY_FACTORS[level];
  return [lo === undefined ? -Infinity : (lo + own) / 2, hi === undefined ? Infinity : (hi + own) / 2];
}

function nearestLevel(factor: number): ActivityLevel {
  let best: ActivityLevel = 'sedentary';
  for (const l of LEVELS)
    if (Math.abs(ACTIVITY_FACTORS[l] - factor) < Math.abs(ACTIVITY_FACTORS[best] - factor)) best = l;
  return best;
}

/** The suggested M7 activity level from the last 14 days of active energy, or null (no change). */
export function activityCheck(input: {
  settings: NutritionSettings;
  weighIns: readonly WeighIn[];
  healthDays: readonly HealthDay[];
  /** Local YYYY-MM-DD. */
  today: string;
}): ActivitySuggestion | null {
  const from = addDate(input.today, -ACTIVITY_CHECK.days);
  const to = addDate(input.today, -1);
  const byDate = new Map<string, number>();
  for (const d of input.healthDays) {
    const k = d.activeKcal;
    if (d.date < from || d.date > to || k === undefined || !Number.isFinite(k) || k < 0) continue;
    byDate.set(d.date, k);
  }
  if (byDate.size < ACTIVITY_CHECK.minDays) return null;

  const weight = currentWeight(input.weighIns, input.today);
  if (!weight) return null;
  const s = input.settings;
  const bmr = bmrMifflin({ sex: s.sex, kg: weight.kg, heightCm: s.heightCm, age: ageOn(s.birthYear, input.today) });
  if (!Number.isFinite(bmr) || bmr <= 0) return null;

  const avg = [...byDate.values()].reduce((a, b) => a + b, 0) / byDate.size;
  const factor = impliedActivityFactor(bmr, avg);
  const [lo, hi] = band(s.activity);
  if (factor >= lo - ACTIVITY_CHECK.margin && factor <= hi + ACTIVITY_CHECK.margin) return null;

  const suggested = nearestLevel(factor);
  if (suggested === s.activity) return null;
  return {
    current: s.activity,
    suggested,
    direction: factor > hi ? 'more' : 'less',
    avgActiveKcal: Math.round(avg),
    days: byDate.size,
  };
}
