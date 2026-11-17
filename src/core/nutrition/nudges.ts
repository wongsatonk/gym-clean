/**
 * M12 1b nutrition nudges (SPEC M12 trainer kit item 12). Pure: entries, targets and the meals
 * already shown are passed in.
 *
 * - Protein per meal: a meal is every entry of one slot on one local day. A meal of at least
 *   `minMealKcal` whose protein is under `proteinShare` of the per-meal share (daily protein
 *   target / `mealsPerDay`) gets one nudge, keyed `date:slot`; a key the caller has shown or
 *   dismissed never nudges again (once per meal). The text is about food only: no numbers, no
 *   judgement. Shown on Fuel, never spoken.
 * - Post-workout idea on Summary: the M10 coach food suggestion for what is left today
 *   (`suggestFood`, first result). No logic of its own.
 */
import type { FoodEntry, FoodSuggestion, MacroSet, MealSlot, NutritionTargets } from '../types';
import { suggestFood, type FoodCandidates } from '../trainer/actions/food';
import { leftMacros, remaining } from './day';

export const NUDGE_RULES = { minMealKcal: 250, proteinShare: 0.6, mealsPerDay: 4 } as const;

const MEAL_NAME: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'That snack',
  'post-workout': 'Your post-workout meal',
};
const IDEAS = 'Eggs, yogurt, tofu or chicken at your next meal would top it up.';

export type MealNudge = { mealKey: string; date: string; slot: MealSlot; text: string };

/** The once-per-meal key. */
export const mealKey = (date: string, slot: MealSlot): string => `${date}:${slot}`;

/** Every meal light on protein, oldest first, minus the keys in `seen`. */
export function mealNudges(
  entries: readonly FoodEntry[],
  targets: NutritionTargets | null,
  seen: ReadonlySet<string> = new Set(),
): MealNudge[] {
  const daily = targets?.proteinG.value ?? 0;
  if (!(daily > 0)) return [];
  const line = (daily / NUDGE_RULES.mealsPerDay) * NUDGE_RULES.proteinShare;
  const meals = new Map<string, { date: string; slot: MealSlot; at: number; m: MacroSet }>();
  for (const e of entries) {
    const key = mealKey(e.date, e.slot);
    const meal = meals.get(key) ?? {
      date: e.date,
      slot: e.slot,
      at: e.time,
      m: { kcal: 0, proteinG: 0 },
    };
    meal.m = { kcal: meal.m.kcal + e.kcal, proteinG: meal.m.proteinG + e.proteinG };
    meal.at = Math.min(meal.at, e.time);
    meals.set(key, meal);
  }
  return [...meals]
    .filter(
      ([key, x]) => !seen.has(key) && x.m.kcal >= NUDGE_RULES.minMealKcal && x.m.proteinG < line,
    )
    .sort(([, a], [, b]) => a.at - b.at)
    .map(([key, x]) => ({
      mealKey: key,
      date: x.date,
      slot: x.slot,
      text: `${MEAL_NAME[x.slot]} was light on protein. ${IDEAS}`,
    }));
}

/** The one to show on `date`: the latest light meal that day not in `seen`, or null. */
export function proteinNudge(
  entries: readonly FoodEntry[],
  targets: NutritionTargets | null,
  date: string,
  seen: ReadonlySet<string> = new Set(),
): MealNudge | null {
  return (
    mealNudges(entries, targets, seen)
      .filter((x) => x.date === date)
      .at(-1) ?? null
  );
}

/** Summary's post-workout idea: the coach's first food suggestion for what is left today. */
export function summaryFoodIdea(
  totals: MacroSet,
  targets: NutritionTargets | null,
  fuel: FoodCandidates,
): FoodSuggestion | null {
  if (!targets) return null;
  const left = leftMacros(remaining(totals, targets));
  if (left.kcal <= 0 && left.proteinG <= 0) return null;
  return suggestFood(left, fuel)[0] ?? null;
}
