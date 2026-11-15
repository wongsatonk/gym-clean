/**
 * M10 F1 / M7 coach food suggestions: "What should I eat?" → up to 3 items from my favorites,
 * my recipes and the Thai dish list that fit what's left today, protein first, then kcal.
 * Pure. Nothing is logged here: each suggestion is a Log payload the caller turns into an entry
 * (`entryFromSuggestion`) only on a tap.
 *
 * Rules:
 * - Candidates: favorites (their saved amount), recipes (1 serving, else ½), Thai dishes
 *   (Regular, else Small). One row per food/recipe; favorites come first, so their amount wins.
 * - An option fits when its kcal ≤ kcal left; if none of a candidate's options do, its smallest
 *   option within `KCAL_SLACK` over still counts.
 * - With protein left, items need ≥ `MIN_PROTEIN_G` and rank by the protein they cover (capped at
 *   what's left), then by closeness to the kcal left. With protein done, closeness to kcal left.
 * - Labels that fail `checkCopy` are never offered.
 * - Foods in `skipIds` (placeholders still waiting for label numbers) are never offered.
 */
import type {
  Favorite,
  Food,
  FoodAmount,
  FoodEntry,
  FoodSuggestion,
  MacroSet,
  Recipe,
} from '../../types';
import {
  THAI_PORTIONS,
  isEstimateFood,
  recipePerServing,
  roundMacros,
  scaleFood,
  type EntryOpts,
  type FoodLookup,
} from '../../nutrition/portions';
import { localDate } from '../plan';
import { checkCopy } from '../replies';

/** How far over the kcal left a suggestion may go when nothing smaller fits. */
export const KCAL_SLACK = 150;
/** With protein left, a suggestion must bring at least this much. */
export const MIN_PROTEIN_G = 5;
export const MAX_SUGGESTIONS = 3;

export type FoodCandidates = {
  favorites: readonly Favorite[];
  /** Every food favorites and recipes may point to (my foods, seed foods, Thai dishes, …). */
  foods: FoodLookup;
  recipes: readonly Recipe[];
  thaiDishes: readonly Food[];
  /**
   * Food ids never offered, e.g. the app's EDIT_FROM_LABEL set (src/data/nutrition/foods.ts;
   * core can't import data, so the caller passes it). Default: none.
   */
  skipIds?: ReadonlySet<string>;
};

/**
 * A placeholder food still waiting for its label numbers is never suggested. Only `skipIds`
 * decides this (the app passes EDIT_FROM_LABEL until the label is entered): `estimate: true` on
 * a custom food also marks quick-estimate favorites, which must still be offered.
 */
function skipFood(food: Food, skipIds: ReadonlySet<string>): boolean {
  return skipIds.has(food.id);
}

const NO_SKIP: ReadonlySet<string> = new Set();

type Option = { label: string; amount: FoodAmount; macros: MacroSet };
type Candidate = { key: string; ref: FoodSuggestion['ref']; options: Option[] };

function find(foods: FoodLookup, id: string): Food | undefined {
  return 'get' in foods ? foods.get(id) : foods.find((f) => f.id === id);
}

function recipeOptions(r: Recipe, foods: FoodLookup, servings: readonly number[]): Option[] {
  const per = recipePerServing(r, foods);
  if (!per) return [];
  return servings.map((s) => ({
    label: r.name,
    amount: { servings: s },
    macros: roundMacros({
      kcal: per.kcal * s,
      proteinG: per.proteinG * s,
      ...(per.carbsG !== undefined ? { carbsG: per.carbsG * s } : {}),
      ...(per.fatG !== undefined ? { fatG: per.fatG * s } : {}),
    }),
  }));
}

function foodOption(food: Food, amount: FoodAmount, label = food.name, factor = 1): Option[] {
  const macros = scaleFood(food, amount, factor);
  if (!macros) return [];
  const stored: FoodAmount =
    factor === 1 || 'grams' in amount ? amount : { servings: amount.servings * factor };
  return [{ label, amount: stored, macros }];
}

function candidates(c: FoodCandidates): Candidate[] {
  const skipIds = c.skipIds ?? NO_SKIP;
  const out: Candidate[] = [];
  for (const f of c.favorites) {
    if ('foodId' in f.ref) {
      if (skipIds.has(f.ref.foodId)) continue;
      const food = find(c.foods, f.ref.foodId);
      if (food && skipFood(food, skipIds)) continue;
      const options = food ? foodOption(food, f.amount) : [];
      out.push({ key: `f:${f.ref.foodId}`, ref: { foodId: f.ref.foodId }, options });
    } else {
      const recipeId = f.ref.recipeId;
      const r = c.recipes.find((x) => x.id === recipeId);
      const servings = 'servings' in f.amount ? [f.amount.servings] : [];
      const options = r ? recipeOptions(r, c.foods, servings) : [];
      out.push({ key: `r:${recipeId}`, ref: { recipeId }, options });
    }
  }
  for (const r of c.recipes) {
    out.push({
      key: `r:${r.id}`,
      ref: { recipeId: r.id },
      options: recipeOptions(r, c.foods, [1, 0.5]),
    });
  }
  for (const d of c.thaiDishes) {
    if (skipFood(d, skipIds)) continue;
    const portions = d.portions ?? THAI_PORTIONS;
    const options = ['Regular', 'Small'].flatMap((name) => {
      const p = portions.find((x) => x.label === name);
      if (!p) return [];
      const label = p.factor === 1 ? d.name : `${d.name} (${p.label})`;
      return foodOption(d, { servings: 1 }, label, p.factor);
    });
    out.push({ key: `f:${d.id}`, ref: { foodId: d.id }, options });
  }
  return out;
}

function pick(options: readonly Option[], kcalLeft: number): Option | undefined {
  const within = options.find((o) => o.macros.kcal <= kcalLeft);
  if (within) return within;
  const smallest = [...options].sort((a, b) => a.macros.kcal - b.macros.kcal)[0];
  return smallest && smallest.macros.kcal <= kcalLeft + KCAL_SLACK ? smallest : undefined;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

function whyFor(o: Option, left: MacroSet): string {
  const p = r1(left.proteinG);
  if (p > 0) {
    return o.macros.proteinG >= p
      ? `Covers your ${p} g protein left`
      : `${r1(o.macros.proteinG)} g of your ${p} g protein left`;
  }
  return `Fits your ${Math.round(left.kcal)} kcal left`;
}

/** Up to `n` suggestions that fit `left` (what's left today), protein first. */
export function suggestFood(
  left: MacroSet,
  c: FoodCandidates,
  n = MAX_SUGGESTIONS,
): FoodSuggestion[] {
  const kcalLeft = Math.max(0, left.kcal);
  const proteinLeft = Math.max(0, left.proteinG);
  if (kcalLeft <= 0 && proteinLeft <= 0) return [];

  const seen = new Set<string>();
  const rows: { s: FoodSuggestion; order: number; cover: number; dist: number }[] = [];
  candidates(c).forEach((cand, order) => {
    if (seen.has(cand.key)) return;
    seen.add(cand.key);
    const o = pick(cand.options, kcalLeft);
    if (!o || !checkCopy(o.label).ok) return;
    if (proteinLeft > 0 && o.macros.proteinG < Math.min(MIN_PROTEIN_G, proteinLeft)) return;
    const why = whyFor(o, { kcal: kcalLeft, proteinG: proteinLeft });
    if (!checkCopy(why).ok) return;
    rows.push({
      s: { label: o.label, ref: cand.ref, amount: o.amount, macros: o.macros, why },
      order,
      cover: r1(Math.min(o.macros.proteinG, proteinLeft)),
      dist: Math.abs(kcalLeft - o.macros.kcal),
    });
  });
  rows.sort(
    (a, b) =>
      b.cover - a.cover ||
      a.dist - b.dist ||
      a.order - b.order ||
      a.s.label.localeCompare(b.s.label),
  );
  return rows.slice(0, n).map((r) => r.s);
}

/**
 * The FoodEntry a suggestion's Log button writes (macros copied as shown). Pass the candidates
 * so Thai dishes and quick-estimate foods keep their "estimate" flag.
 */
export function entryFromSuggestion(
  s: FoodSuggestion,
  opts: EntryOpts,
  c?: Pick<FoodCandidates, 'foods'>,
): FoodEntry {
  const food = s.ref.foodId !== undefined && c ? find(c.foods, s.ref.foodId) : undefined;
  const estimate = food !== undefined && isEstimateFood(food);
  return {
    id: opts.id,
    date: localDate(opts.time),
    time: opts.time,
    slot: opts.slot,
    label: s.label,
    ref: { ...s.ref },
    amount: s.amount,
    estimate,
    ...roundMacros(s.macros),
  };
}
