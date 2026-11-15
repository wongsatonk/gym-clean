/**
 * M7 portions, recipes and entry builders (SPEC M7 "Food sources", plan task 7). Pure.
 *
 * - `scaleFood`: per 100 g × grams/100, or per serving × servings, times a portion factor.
 *   One serving of a per-100 g food is 100 g; grams of a per-serving food need its `servingG`.
 *   An amount that can't be converted returns null.
 * - A macro missing from a food (or any recipe ingredient) stays undefined, never 0.
 * - Entry builders copy the macros into the entry, so editing a recipe or food later never
 *   rewrites past entries.
 * - Rounding (only at the end): kcal to whole numbers, grams to 1 decimal.
 * - Weigh-ins are stored in kg; display/input go through src/core/units.ts.
 */
import type { Food, FoodAmount, FoodDbRow, FoodEntry, MacroSet, MealSlot, Recipe } from '../types';
import { fromUnit, toUnit, type Unit } from '../units';
import { localDate } from '../trainer/plan';

/** Small / Regular / Large × a typical plate (M7-q9). */
export const THAI_PORTIONS: readonly { label: string; factor: number }[] = [
  { label: 'Small', factor: 0.75 },
  { label: 'Regular', factor: 1 },
  { label: 'Large', factor: 1.4 },
];

/**
 * Quick-estimate starter values (M7-q3): typical-plate guesses the form fills in and you edit
 * before logging. Rough round numbers, not from any app or table.
 */
export const QUICK_PRESETS: readonly {
  id: 'light' | 'regular' | 'big';
  label: string;
  kcal: number;
  proteinG: number;
  note: string;
}[] = [
  { id: 'light', label: 'Light plate', kcal: 450, proteinG: 20, note: 'Starter guess, edit it.' },
  {
    id: 'regular',
    label: 'Regular plate',
    kcal: 650,
    proteinG: 25,
    note: 'Starter guess, edit it.',
  },
  { id: 'big', label: 'Big plate', kcal: 900, proteinG: 35, note: 'Starter guess, edit it.' },
];

export type FoodLookup = readonly Food[] | ReadonlyMap<string, Food>;

const OPTIONAL = ['carbsG', 'fatG'] as const;

/** Round half up without binary noise (35.05 → 35.1). */
function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(Number((x * f).toPrecision(12))) / f;
}

/** kcal to whole numbers, grams to 1 decimal; missing macros stay missing. */
export function roundMacros(m: MacroSet): MacroSet {
  const out: MacroSet = { kcal: roundTo(m.kcal, 0), proteinG: roundTo(m.proteinG, 1) };
  for (const k of OPTIONAL) {
    const v = m[k];
    if (v !== undefined) out[k] = roundTo(v, 1);
  }
  return out;
}

function times(m: MacroSet, f: number): MacroSet {
  const out: MacroSet = { kcal: m.kcal * f, proteinG: m.proteinG * f };
  for (const k of OPTIONAL) {
    const v = m[k];
    if (v !== undefined) out[k] = v * f;
  }
  return out;
}

const okNum = (x: number) => Number.isFinite(x) && x >= 0;

/** How many "basis units" (100 g, or servings) the amount is; null = can't convert. */
function basisUnits(food: Food, amount: FoodAmount): number | null {
  const per100 = 'per100g' in food.basis;
  if ('grams' in amount) {
    if (!okNum(amount.grams)) return null;
    if (per100) return amount.grams / 100;
    const g = 'servingG' in food.basis ? food.basis.servingG : undefined;
    return g !== undefined && g > 0 ? amount.grams / g : null;
  }
  if (!okNum(amount.servings)) return null;
  return amount.servings; // per-100 g: one serving = 100 g
}

function scaleRaw(food: Food, amount: FoodAmount, factor = 1): MacroSet | null {
  if (!okNum(factor)) return null;
  const u = basisUnits(food, amount);
  return u === null ? null : times(food, u * factor);
}

/** The food's macros for `amount` × the portion `factor`, rounded; null = can't convert. */
export function scaleFood(food: Food, amount: FoodAmount, factor = 1): MacroSet | null {
  const m = scaleRaw(food, amount, factor);
  return m && roundMacros(m);
}

/** What a picker starts at: 100 g for per-100 g foods, else 1 serving. */
export function defaultAmount(food: Food): FoodAmount {
  return 'per100g' in food.basis ? { grams: 100 } : { servings: 1 };
}

const DS_LABEL: Record<FoodDbRow['ds'], string> = {
  foundation: 'Foundation Foods',
  sr: 'SR Legacy',
  fndds: 'FNDDS',
};

/** A USDA database row as a per-100 g Food (for recipes and logging). */
export function foodFromDbRow(row: FoodDbRow): Food {
  const f: Food = {
    id: row.id,
    name: row.name,
    source: 'usda',
    basis: { per100g: true },
    kcal: row.kcal,
    proteinG: row.proteinG,
    note: `USDA FoodData Central (${DS_LABEL[row.ds]}), per 100 g.`,
  };
  if (row.carbsG !== undefined) f.carbsG = row.carbsG;
  if (row.fatG !== undefined) f.fatG = row.fatG;
  return f;
}

function lookup(foods: FoodLookup, id: string): Food | undefined {
  return 'get' in foods ? foods.get(id) : foods.find((f) => f.id === id);
}

/** Ingredient food ids that are unknown or can't be weighed in grams. */
export function missingIngredients(recipe: Recipe, foods: FoodLookup): string[] {
  return recipe.ingredients
    .filter((i) => {
      const f = lookup(foods, i.foodId);
      return !f || scaleRaw(f, { grams: i.grams }) === null;
    })
    .map((i) => i.foodId);
}

function perServingRaw(recipe: Recipe, foods: FoodLookup): MacroSet | null {
  if (!(recipe.servings > 0) || missingIngredients(recipe, foods).length > 0) return null;
  let kcal = 0;
  let proteinG = 0;
  // null = some ingredient doesn't know this macro, so the recipe doesn't either.
  let carbsG: number | null = 0;
  let fatG: number | null = 0;
  for (const i of recipe.ingredients) {
    const f = lookup(foods, i.foodId);
    const m = f && scaleRaw(f, { grams: i.grams });
    if (!m) return null;
    kcal += m.kcal;
    proteinG += m.proteinG;
    carbsG = carbsG === null || m.carbsG === undefined ? null : carbsG + m.carbsG;
    fatG = fatG === null || m.fatG === undefined ? null : fatG + m.fatG;
  }
  const sum: MacroSet = { kcal, proteinG };
  if (carbsG !== null) sum.carbsG = carbsG;
  if (fatG !== null) sum.fatG = fatG;
  return times(sum, 1 / recipe.servings);
}

/** One serving of the recipe, rounded; null = an ingredient is missing or servings ≤ 0. */
export function recipePerServing(recipe: Recipe, foods: FoodLookup): MacroSet | null {
  const m = perServingRaw(recipe, foods);
  return m && roundMacros(m);
}

export type EntryOpts = { id: string; time: number; slot: MealSlot };

function entry(
  opts: EntryOpts,
  label: string,
  amount: FoodAmount,
  macros: MacroSet,
  estimate: boolean,
  ref?: FoodEntry['ref'],
): FoodEntry {
  const e: FoodEntry = {
    id: opts.id,
    date: localDate(opts.time),
    time: opts.time,
    slot: opts.slot,
    label,
    ...(ref ? { ref } : {}),
    amount,
    estimate,
    ...roundMacros(macros),
  };
  return e;
}

const ESTIMATE_SOURCES: ReadonlySet<Food['source']> = new Set([
  'thai-estimate',
  'photo-local',
  'photo-ai',
]);

/** Entries from this food are estimates (Thai dish list, quick estimates, photo guesses). */
export function isEstimateFood(food: Food): boolean {
  return food.estimate === true || ESTIMATE_SOURCES.has(food.source);
}

/**
 * Log `amount` of a food. `portion` = one of `food.portions` labels (e.g. 'Large'): the entry
 * stores servings × factor and the label gains "(Large)" (Regular stays plain).
 * Null = the amount can't be converted or the portion is unknown.
 */
export function entryFromFood(
  food: Food,
  amount: FoodAmount,
  opts: EntryOpts & { portion?: string },
): FoodEntry | null {
  let factor = 1;
  let label = food.name;
  if (opts.portion !== undefined) {
    const p = (food.portions ?? THAI_PORTIONS).find((x) => x.label === opts.portion);
    if (!p) return null;
    factor = p.factor;
    if (p.factor !== 1) label = `${food.name} (${p.label})`;
  }
  const m = scaleRaw(food, amount, factor);
  if (!m) return null;
  const stored: FoodAmount =
    factor === 1
      ? amount
      : 'grams' in amount
        ? { grams: roundTo(amount.grams * factor, 1) }
        : { servings: roundTo(amount.servings * factor, 3) };
  return entry(opts, label, stored, m, isEstimateFood(food), { foodId: food.id });
}

/** Log servings of a recipe (values copied now). Null = missing ingredient or bad servings. */
export function entryFromRecipe(
  recipe: Recipe,
  foods: FoodLookup,
  servings: number,
  opts: EntryOpts,
): FoodEntry | null {
  if (!okNum(servings)) return null;
  const per = perServingRaw(recipe, foods);
  if (!per) return null;
  return entry(opts, recipe.name, { servings }, times(per, servings), false, {
    recipeId: recipe.id,
  });
}

export type QuickInput = { name: string } & MacroSet;

/** A quick estimate (restaurant / takeout): always `estimate: true`. Null = empty name or bad numbers. */
export function entryFromQuick(q: QuickInput, opts: EntryOpts): FoodEntry | null {
  const name = q.name.trim();
  if (name === '' || !okNum(q.kcal) || !okNum(q.proteinG)) return null;
  const m: MacroSet = { kcal: q.kcal, proteinG: q.proteinG };
  for (const k of OPTIONAL) {
    const v = q[k];
    if (v === undefined) continue;
    if (!okNum(v)) return null;
    m[k] = v;
  }
  return entry(opts, name, { servings: 1 }, m, true);
}

/** A typed weigh-in in the display unit → kg (stored); null = not a positive number. */
export function weighInKg(value: number, unit: Unit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return roundTo(fromUnit(value, unit), 4);
}

/** A stored kg weigh-in shown in the unit, to 0.1. */
export function weighInDisplay(kg: number, unit: Unit): number {
  return roundTo(toUnit(kg, unit), 1);
}
