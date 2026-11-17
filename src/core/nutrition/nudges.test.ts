import { describe, expect, it } from 'vitest';
import { suggestFood, type FoodCandidates } from '../trainer/actions/food';
import { checkCopy } from '../trainer/replies';
import { leftMacros, remaining } from './day';
import { mealNudges, mealKey, NUDGE_RULES, proteinNudge, summaryFoodIdea } from './nudges';
import source from './nudges.ts?raw';
import type { Food, FoodEntry, MealSlot, NutritionTargets } from '../types';

// Made-up targets and meals only (the repo is public).
const targets = (proteinG: number): NutritionTargets => ({
  kcal: { value: 2400, estimate: true },
  proteinG: { value: proteinG, estimate: true },
  carbsG: { value: 280, estimate: true },
  fatG: { value: 70, estimate: true },
});
const T = targets(160); // per-meal share 40 g; the nudge line is 60% of it = 24 g
let n = 0;
const entry = (
  slot: MealSlot,
  kcal: number,
  proteinG: number,
  date = '2026-11-11',
  hour = 12,
): FoodEntry => ({
  id: `e${n++}`,
  date,
  time: new Date(2026, 10, Number(date.slice(8)), hour).getTime(),
  slot,
  label: 'Meal',
  amount: { servings: 1 },
  estimate: true,
  kcal,
  proteinG,
});

describe('rules (data)', () => {
  it('a meal of 250 kcal or more under 60% of the per-meal protein share (target / 4)', () => {
    expect(NUDGE_RULES).toEqual({ minMealKcal: 250, proteinShare: 0.6, mealsPerDay: 4 });
  });
});

describe('mealNudges', () => {
  it('nudges a light-protein meal, not a protein-rich one', () => {
    const got = mealNudges(
      [entry('lunch', 600, 20), entry('dinner', 700, 45, '2026-11-11', 19)],
      T,
    );
    expect(got).toEqual([
      { mealKey: '2026-11-11:lunch', date: '2026-11-11', slot: 'lunch', text: expect.any(String) },
    ]);
  });

  it('boundaries: 250 kcal counts, 249 does not; 24 g is enough, 23.9 g is not', () => {
    expect(mealNudges([entry('lunch', 250, 10)], T)).toHaveLength(1);
    expect(mealNudges([entry('lunch', 249, 10)], T)).toHaveLength(0);
    expect(mealNudges([entry('lunch', 500, 24)], T)).toHaveLength(0);
    expect(mealNudges([entry('lunch', 500, 23.9)], T)).toHaveLength(1);
  });

  it('a meal is every entry of one slot on one day', () => {
    // Two small entries add up to a meal; together the protein is enough.
    expect(mealNudges([entry('lunch', 150, 5), entry('lunch', 150, 5)], T)).toHaveLength(1);
    expect(mealNudges([entry('lunch', 150, 5), entry('lunch', 150, 20)], T)).toHaveLength(0);
    // The same slot on another day is another meal.
    const two = mealNudges(
      [entry('lunch', 500, 10, '2026-11-10'), entry('lunch', 500, 10, '2026-11-11')],
      T,
    );
    expect(two.map((x) => x.mealKey)).toEqual(['2026-11-10:lunch', '2026-11-11:lunch']);
  });

  it('once per meal: a dismissed or shown meal never nudges again', () => {
    const meals = [entry('breakfast', 400, 8, '2026-11-11', 8), entry('lunch', 600, 10)];
    expect(mealNudges(meals, T)).toHaveLength(2);
    const seen = new Set([mealKey('2026-11-11', 'breakfast')]);
    expect(mealNudges(meals, T, seen).map((x) => x.slot)).toEqual(['lunch']);
  });

  it('nothing without a protein target', () => {
    expect(mealNudges([entry('lunch', 600, 5)], null)).toEqual([]);
    expect(mealNudges([entry('lunch', 600, 5)], targets(0))).toEqual([]);
  });

  it('text names the meal, offers ideas, has no numbers or judgement, passes checkCopy', () => {
    const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack', 'post-workout'];
    for (const slot of slots) {
      const [x] = mealNudges([entry(slot, 500, 5)], T);
      expect(x?.text, slot).toMatch(/light on protein/);
      expect(x?.text).not.toMatch(/\d/);
      expect(x?.text).not.toMatch(/\b(bad|fail|wrong|should have)\b/i);
      expect(checkCopy(x?.text ?? '')).toEqual({ ok: true, hits: [] });
    }
    expect(mealNudges([entry('lunch', 500, 5)], T)[0]?.text).toBe(
      'Lunch was light on protein. Eggs, yogurt, tofu or chicken at your next meal would top it up.',
    );
  });
});

describe('proteinNudge (the one to show)', () => {
  it("is today's latest light meal not seen yet", () => {
    const meals = [
      entry('breakfast', 400, 8, '2026-11-11', 8),
      entry('lunch', 600, 10, '2026-11-11', 13),
      entry('lunch', 600, 10, '2026-11-10', 13),
    ];
    expect(proteinNudge(meals, T, '2026-11-11')?.mealKey).toBe('2026-11-11:lunch');
    expect(proteinNudge(meals, T, '2026-11-11', new Set(['2026-11-11:lunch']))?.mealKey).toBe(
      '2026-11-11:breakfast',
    );
    expect(
      proteinNudge(meals, T, '2026-11-11', new Set(['2026-11-11:lunch', '2026-11-11:breakfast'])),
    ).toBeNull();
    expect(proteinNudge(meals, T, '2026-11-12')).toBeNull();
  });
});

describe('summaryFoodIdea (post-workout idea on Summary)', () => {
  const SHAKE: Food = {
    id: 'seed-shake',
    name: 'Protein shake',
    source: 'custom',
    basis: { servingLabel: '1 scoop' },
    kcal: 120,
    proteinG: 24,
  };
  const fuel: FoodCandidates = {
    favorites: [
      { id: 'fav', ref: { foodId: 'seed-shake' }, amount: { servings: 1 }, createdAt: 1 },
    ],
    foods: [SHAKE],
    recipes: [],
    thaiDishes: [],
  };

  it("is the coach's first food suggestion for what is left today (no new logic)", () => {
    const totals = { kcal: 1200, proteinG: 60 };
    const want = suggestFood(leftMacros(remaining(totals, T)), fuel)[0];
    expect(want).toBeDefined();
    expect(summaryFoodIdea(totals, T, fuel)).toEqual(want);
  });

  it('none without targets, or with nothing left', () => {
    expect(summaryFoodIdea({ kcal: 0, proteinG: 0 }, null, fuel)).toBeNull();
    expect(summaryFoodIdea({ kcal: 3000, proteinG: 200 }, T, fuel)).toBeNull();
  });
});

describe('purity', () => {
  it('uses no network, DOM or clock', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
