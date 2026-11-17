// M7 Fuel — weekly adjustment loop (SPEC M7 "Weekly adjustment loop", M7-q2). Pure: dates are passed in.
// Suggestions are never applied by themselves: weeklyCheck proposes, decideCheck records the
// answer, and only applyAcceptedCheck (called by the app on Accept) changes settings.
import type { NutritionSettings, WeeklyCheck, WeighIn } from '../types';
import { addDate, localDate, weekdayOf } from '../trainer/plan';
import { fuelRuleFor } from './goalTargets';
import { ACTIVITY_FACTORS, averageBetween, dedupeWeighIns } from './targets';

/** Suggested change when gain is below the range (kcal/day). */
export const UP_KCAL = 150;
/** Suggested change when gain is above TOO_FAST_PCT (kcal/day). */
export const DOWN_KCAL = -100;
/** Weekly gain (% of body weight) above which the target is lowered (no goal set). */
export const TOO_FAST_PCT = 0.75;
/** Weigh-ins needed in each of the two weeks compared. */
export const MIN_WEIGH_INS = 4;

/** Float slack so exact range edges (e.g. 0.25%) count as in range. */
const EPS = 1e-9;

/** Monday (local YYYY-MM-DD) of the Monday–Sunday week containing `date`. */
export function weekStartOf(date: string): string {
  return addDate(date, -((weekdayOf(date) + 6) % 7));
}

/** Monday of the local week containing the instant `ms`. */
export function weekStartAt(ms: number): string {
  return weekStartOf(localDate(ms));
}

/** Average of the weigh-ins in the Monday–Sunday week starting `weekStart`, or null if none. */
export function weeklyAverages(
  weighIns: readonly WeighIn[],
  weekStart: string,
): { avgKg: number; count: number } | null {
  return averageBetween(weighIns, weekStart, addDate(weekStart, 6));
}

/**
 * This week's check (keyed by this week's Monday): last week's average vs the week before.
 * Every day of the week gives the same result. Never suggests a kcal target below the floor:
 * a "down" is cut short and an "up" lifts at least to it. With no hand-set kcal
 * (`settings.overrides.kcal`), the change is also cut to what keeps the kcal change within the
 * goal's range.
 *
 * M12 1b, per goal (goalTargets.ts): the band is the goal's weekly band, so the check works in
 * both directions. Under the band (gaining too slowly, or losing too fast) → 'up' (+150); over
 * the band plus the goal's slack (gaining too fast, or losing too slowly) → 'down' (−100).
 * The floor is the higher of BMR and maintenance + the range's low end: maintenance for no goal
 * and the gain goals (as before), BMR or maintenance − 600 for "lose fat" / "general".
 * No goal set = the old behaviour: the band from `settings.gainPctPerWeek`, down above 0.75%,
 * surplus 0–600. Pass `bmrKcal` (computeTargets gives it); without it the floor uses
 * maintenance ÷ the lowest activity factor, which is never under the real BMR.
 *
 * Contract: kind 'up' | 'down' with deltaKcal 0 means "a change was due but none is possible"
 * (already at maintenance / at the surplus cap); show it as info, with nothing to accept.
 * Use `checkHasChange` to tell. `applyAcceptedCheck` applies exactly `deltaKcal`.
 */
export function weeklyCheck(input: {
  weighIns: readonly WeighIn[];
  today: string;
  settings: Pick<NutritionSettings, 'gainPctPerWeek' | 'surplusKcal' | 'overrides' | 'goalKind'>;
  /** The kcal target in force now (override or computed). */
  kcalTarget: number;
  maintenanceKcal: number;
  /** The resting estimate (`TargetsResult.bmrKcal`); the suggestion never goes below it. */
  bmrKcal?: number;
}): WeeklyCheck {
  const weekStart = weekStartOf(input.today);
  const last = weeklyAverages(input.weighIns, addDate(weekStart, -7));
  const prev = weeklyAverages(input.weighIns, addDate(weekStart, -14));
  const result = (
    kind: WeeklyCheck['kind'],
    deltaKcal: number,
    ratePct: number | null,
  ): WeeklyCheck => ({
    weekStart,
    avgKg: last?.avgKg ?? null,
    prevAvgKg: prev?.avgKg ?? null,
    ratePct,
    kind,
    deltaKcal,
    outcome: 'pending',
  });

  if (!last || !prev || last.count < MIN_WEIGH_INS || prev.count < MIN_WEIGH_INS) {
    return result('needData', 0, null);
  }

  const ratePct = ((last.avgKg - prev.avgKg) / prev.avgKg) * 100;
  const goalKind = input.settings.goalKind;
  const rule = fuelRuleFor(goalKind);
  const [minPct, maxPct] = goalKind === undefined ? input.settings.gainPctPerWeek : rule.weeklyPct;
  const tooFastPct = goalKind === undefined ? TOO_FAST_PCT : maxPct + rule.fastSlackPct;
  const [lo, hi] = rule.deltaRange;
  const bmrKcal = input.bmrKcal ?? Math.ceil(input.maintenanceKcal / ACTIVITY_FACTORS.sedentary);
  const floorKcal = Math.max(Math.min(bmrKcal, input.maintenanceKcal), input.maintenanceKcal + lo);
  const floorDelta = floorKcal - input.kcalTarget; // change that lands exactly on the floor

  if (ratePct < minPct - EPS) {
    const up = Math.max(UP_KCAL, floorDelta);
    const capped =
      input.settings.overrides?.kcal === undefined
        ? Math.min(up, Math.max(0, hi - input.settings.surplusKcal))
        : up;
    return result('up', capped, ratePct);
  }
  if (ratePct > tooFastPct + EPS) {
    const down = Math.min(0, Math.max(DOWN_KCAL, floorDelta));
    const capped =
      input.settings.overrides?.kcal === undefined
        ? Math.min(0, Math.max(down, lo - input.settings.surplusKcal))
        : down;
    return result('down', capped, ratePct);
  }
  return result('onTrack', 0, ratePct);
}

/** True when the check proposes a real change (up/down with a non-zero delta) to accept. */
export function checkHasChange(check: WeeklyCheck): boolean {
  return (check.kind === 'up' || check.kind === 'down') && check.deltaKcal !== 0;
}

/** Record Accept / Not now. Only the check changes; a decided check is returned as is. */
export function decideCheck(
  check: WeeklyCheck,
  outcome: 'accepted' | 'dismissed',
  now: number,
): WeeklyCheck {
  if (check.outcome !== 'pending') return check;
  return { ...check, outcome, decidedAt: now };
}

/**
 * Settings after an accepted check: moves a hand-set kcal override if there is one, else the
 * kcal change (`surplusKcal`, negative for a deficit), by exactly `deltaKcal` (weeklyCheck
 * already kept it within the goal's range and above the floor). Returns `settings` itself for anything not accepted or with no change.
 */
export function applyAcceptedCheck(
  settings: NutritionSettings,
  check: WeeklyCheck,
): NutritionSettings {
  if (check.outcome !== 'accepted' || !checkHasChange(check)) return settings;
  const kcalOverride = settings.overrides?.kcal;
  if (kcalOverride !== undefined) {
    return {
      ...settings,
      overrides: { ...settings.overrides, kcal: kcalOverride + check.deltaKcal },
    };
  }
  return { ...settings, surplusKcal: settings.surplusKcal + check.deltaKcal };
}

export type TrendPoint = {
  date: string;
  /** That day's weigh-in, or null. */
  kg: number | null;
  /** Mean of weigh-ins in the 7 days ending this date, or null if none. */
  avgKg: number | null;
};

/** Chart series: the last `days` dates ending `today`, with daily dots and the 7-day average. */
export function trend(weighIns: readonly WeighIn[], days: number, today: string): TrendPoint[] {
  const byDate = dedupeWeighIns(weighIns);
  const out: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDate(today, -i);
    const avg = averageBetween(weighIns, addDate(date, -6), date);
    out.push({ date, kg: byDate.get(date) ?? null, avgKg: avg ? avg.avgKg : null });
  }
  return out;
}
