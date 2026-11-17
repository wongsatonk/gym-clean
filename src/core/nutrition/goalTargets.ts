/**
 * M12 slice 1b: Fuel targets follow the goal (data). Pure, no imports from targets.ts (which
 * reads this file).
 *
 * Per goal: the kcal change against maintenance (Mifflin–St Jeor per sex × activity), protein
 * per kg of body weight, and the weekly body-weight band the weekly check steers into. Every
 * number is a default tuned at a checkpoint. No goal set = the muscle rule, which is what the
 * app did before goals. The kcal target itself is never below the resting estimate (BMR); that
 * floor lives in targets.ts and adjust.ts.
 */
import type { GoalKind, NutritionSettings } from '../types';

/** The widest signed kcal change against maintenance any goal may reach. */
export const KCAL_DELTA_RANGE = [-600, 600] as const;

export type GoalFuelRule = {
  /** Starting kcal change against maintenance (negative = deficit). */
  deltaKcal: number;
  proteinGPerKg: number;
  /** Weekly body-weight change wanted, % of body weight [low, high] (negative = loss). */
  weeklyPct: readonly [low: number, high: number];
  /** The check lowers kcal only above `weeklyPct[1] + fastSlackPct`. */
  fastSlackPct: number;
  /** How far the weekly check (and a stored value) may move the kcal change for this goal. */
  deltaRange: readonly [lo: number, hi: number];
};

export const GOAL_TARGETS: Record<GoalKind, GoalFuelRule> = {
  muscle: { deltaKcal: 300, proteinGPerKg: 1.8, weeklyPct: [0.25, 0.5], fastSlackPct: 0.25, deltaRange: [0, 600] },
  strength: { deltaKcal: 200, proteinGPerKg: 1.8, weeklyPct: [0.1, 0.35], fastSlackPct: 0.25, deltaRange: [0, 600] },
  general: { deltaKcal: 0, proteinGPerKg: 1.6, weeklyPct: [-0.25, 0.25], fastSlackPct: 0, deltaRange: [-600, 600] },
  fat: { deltaKcal: -400, proteinGPerKg: 2.0, weeklyPct: [-0.75, -0.25], fastSlackPct: 0, deltaRange: [-600, 0] },
};

/** No goal set: the behaviour from before goals (a 0–600 surplus, gain band 0.25–0.5%). */
export const NO_GOAL_RULE: GoalFuelRule = { ...GOAL_TARGETS.muscle };

export function fuelRuleFor(goalKind: GoalKind | undefined): GoalFuelRule {
  return goalKind !== undefined && Object.hasOwn(GOAL_TARGETS, goalKind) ? GOAL_TARGETS[goalKind] : NO_GOAL_RULE;
}

/**
 * The settings for a goal: its kcal change, protein and weekly band. Body stats, mode and
 * hand-set values (`overrides`) are kept. Returns a new object; nothing is saved here, so the
 * caller shows before → after (targets.ts `goalTargetChange`) and saves only on Apply.
 */
export function withGoal(settings: NutritionSettings, goalKind: GoalKind): NutritionSettings {
  const rule = fuelRuleFor(goalKind);
  return {
    ...settings,
    goalKind,
    surplusKcal: rule.deltaKcal,
    proteinGPerKg: rule.proteinGPerKg,
    gainPctPerWeek: [rule.weeklyPct[0], rule.weeklyPct[1]],
  };
}
