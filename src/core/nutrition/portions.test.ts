import { describe, expect, it } from 'vitest';
import {
  QUICK_PRESETS,
  THAI_PORTIONS,
  defaultAmount,
  entryFromFood,
  entryFromQuick,
  entryFromRecipe,
  foodFromDbRow,
  missingIngredients,
  recipePerServing,
  roundMacros,
  scaleFood,
  weighInDisplay,
  weighInKg,
} from './portions';
import { checkCopy } from '../trainer/replies';
import type { Food, FoodDbRow, Recipe } from '../types';

// Made-up foods and numbers only (the repo is public).
const RICE: Food = {
  id: 'f-rice',
  name: 'Cooked rice',
  source: 'custom',
  basis: { per100g: true },
  kcal: 130,
  proteinG: 2.7,
  carbsG: 28,
  fatG: 0.3,
};
const CHICKEN: Food = {
  id: 'f-chicken',
  name: 'Chicken breast',
  source: 'custom',
  basis: { per100g: true },
  kcal: 165,
  proteinG: 31,
  carbsG: 0,
  fatG: 3.6,
};
const SAUCE: Food = {
  // No fat value (a label that didn't list it).
  id: 'f-sauce',
  name: 'Oyster sauce',
  source: 'custom',
  basis: { servingLabel: '1 tbsp', servingG: 18 },
  kcal: 9,
  proteinG: 0.2,
  carbsG: 2,
};
const SHAKE: Food = {
  id: 'f-shake',
  name: 'Protein shake',
  source: 'custom',
  basis: { servingLabel: '1 scoop' },
  kcal: 120,
  proteinG: 24,
  carbsG: 3,
  fatG: 1.5,
};
const PAD_THAI: Food = {
  id: 'thai-pad-thai',
  name: 'Pad thai',
  nameTh: 'ผัดไทย',
  source: 'thai-estimate',
  basis: { servingLabel: '1 plate' },
  portions: [...THAI_PORTIONS],
  kcal: 600,
  proteinG: 20,
  carbsG: 80,
  fatG: 22,
  note: 'Reference recipe (made-up test values)',
};

const T = new Date(2026, 10, 11, 12, 30).getTime();
const OPTS = { id: 'e1', time: T, slot: 'lunch' as const };

describe('roundMacros', () => {
  it('kcal to whole numbers, grams to 1 decimal, missing stays missing', () => {
    expect(roundMacros({ kcal: 99.5, proteinG: 12.345, carbsG: 0.04 })).toEqual({
      kcal: 100,
      proteinG: 12.3,
      carbsG: 0,
    });
    expect('fatG' in roundMacros({ kcal: 1, proteinG: 1 })).toBe(false);
  });
});

describe('scaleFood', () => {
  it('per 100 g × grams', () => {
    expect(scaleFood(CHICKEN, { grams: 150 })).toEqual({
      kcal: 248,
      proteinG: 46.5,
      carbsG: 0,
      fatG: 5.4,
    });
  });

  it('per serving × 0.5 / 1 / 1.5 / 2 servings', () => {
    expect(scaleFood(SHAKE, { servings: 0.5 })).toEqual({
      kcal: 60,
      proteinG: 12,
      carbsG: 1.5,
      fatG: 0.8,
    });
    expect(scaleFood(SHAKE, { servings: 1 })?.kcal).toBe(120);
    expect(scaleFood(SHAKE, { servings: 1.5 })).toMatchObject({ kcal: 180, proteinG: 36 });
    expect(scaleFood(SHAKE, { servings: 2 })).toMatchObject({ kcal: 240, proteinG: 48 });
  });

  it('Small / Regular / Large = 0.75 / 1 / 1.4', () => {
    expect(THAI_PORTIONS.map((p) => p.factor)).toEqual([0.75, 1, 1.4]);
    expect(scaleFood(PAD_THAI, { servings: 1 }, 0.75)).toMatchObject({ kcal: 450, proteinG: 15 });
    expect(scaleFood(PAD_THAI, { servings: 1 }, 1)).toMatchObject({ kcal: 600, proteinG: 20 });
    expect(scaleFood(PAD_THAI, { servings: 1 }, 1.4)).toEqual({
      kcal: 840,
      proteinG: 28,
      carbsG: 112,
      fatG: 30.8,
    });
  });

  it('grams of a serving food use its serving weight', () => {
    expect(scaleFood(SAUCE, { grams: 36 })).toEqual({ kcal: 18, proteinG: 0.4, carbsG: 4 });
  });

  it('one serving of a per-100 g food is 100 g', () => {
    expect(scaleFood(RICE, { servings: 2 })).toMatchObject({ kcal: 260, proteinG: 5.4 });
  });

  it('grams of a serving food without a serving weight → null', () => {
    expect(scaleFood(SHAKE, { grams: 30 })).toBeNull();
  });

  it('a missing macro stays missing, never 0', () => {
    const r = scaleFood(SAUCE, { servings: 2 });
    expect(r).not.toBeNull();
    expect(r && 'fatG' in r).toBe(false);
  });

  it('negative or non-finite amounts → null', () => {
    expect(scaleFood(RICE, { grams: -5 })).toBeNull();
    expect(scaleFood(RICE, { grams: Number.NaN })).toBeNull();
    expect(scaleFood(SHAKE, { servings: 1 }, -1)).toBeNull();
  });
});

describe('defaultAmount', () => {
  it('100 g for per-100 g foods, 1 serving otherwise', () => {
    expect(defaultAmount(RICE)).toEqual({ grams: 100 });
    expect(defaultAmount(SHAKE)).toEqual({ servings: 1 });
  });
});

describe('foodFromDbRow', () => {
  it('maps a USDA row to a per-100 g Food with a source and a note', () => {
    const row: FoodDbRow = {
      id: 'usda:123',
      name: 'Egg, whole, raw',
      ds: 'sr',
      kcal: 143,
      proteinG: 12.6,
      fatG: 9.5,
      portions: [{ label: '1 large', g: 50 }],
    };
    const f = foodFromDbRow(row);
    expect(f).toMatchObject({
      id: 'usda:123',
      name: 'Egg, whole, raw',
      source: 'usda',
      basis: { per100g: true },
      kcal: 143,
      proteinG: 12.6,
      fatG: 9.5,
    });
    expect('carbsG' in f).toBe(false);
    expect(f.note).toMatch(/USDA FoodData Central/);
  });

  it('keeps unknown macros undefined and names the dataset in the note (moved from foodDb)', () => {
    const food = foodFromDbRow({
      id: 'usda:1',
      name: 'Made-up grain, cooked',
      ds: 'sr',
      kcal: 120,
      proteinG: 3.1,
      carbsG: 25,
    });
    expect(food).toEqual({
      id: 'usda:1',
      name: 'Made-up grain, cooked',
      source: 'usda',
      basis: { per100g: true },
      kcal: 120,
      proteinG: 3.1,
      carbsG: 25,
      note: 'USDA FoodData Central (SR Legacy), per 100 g.',
    });
    expect('fatG' in food).toBe(false);
    const fnd = foodFromDbRow({
      id: 'usda:2',
      name: 'Made-up fish',
      ds: 'foundation',
      kcal: 90,
      proteinG: 19.5,
    });
    expect(fnd.note).toBe('USDA FoodData Central (Foundation Foods), per 100 g.');
  });

  it('household measures (grams) stay on the row, not in Food.portions (plate-size factors)', () => {
    const f = foodFromDbRow({
      id: 'usda:3',
      name: 'Made-up egg',
      ds: 'sr',
      kcal: 143,
      proteinG: 12.6,
      portions: [{ label: '1 large', g: 50 }],
    });
    expect(f.portions).toBeUndefined();
  });
});

const RECIPE: Recipe = {
  id: 'r-kapao',
  name: 'Chicken kra pao',
  ingredients: [
    { foodId: 'f-chicken', grams: 400 },
    { foodId: 'f-rice', grams: 600 },
  ],
  servings: 4,
  updatedAt: 1,
};

describe('recipePerServing', () => {
  it('sums the ingredients and divides by servings', () => {
    // chicken 660 kcal / 124 g P / 0 C / 14.4 F; rice 780 / 16.2 / 168 / 1.8
    expect(recipePerServing(RECIPE, [RICE, CHICKEN])).toEqual({
      kcal: 360,
      proteinG: 35.1,
      carbsG: 42,
      fatG: 4.1,
    });
  });

  it('accepts a Map lookup', () => {
    const map = new Map([RICE, CHICKEN].map((f) => [f.id, f]));
    expect(recipePerServing(RECIPE, map)?.kcal).toBe(360);
  });

  it('a fat value missing in any ingredient → fat undefined, not 0', () => {
    const r: Recipe = {
      ...RECIPE,
      ingredients: [...RECIPE.ingredients, { foodId: 'f-sauce', grams: 36 }],
    };
    const per = recipePerServing(r, [RICE, CHICKEN, SAUCE]);
    expect(per).toMatchObject({ kcal: 365, carbsG: 43 });
    expect(per && 'fatG' in per).toBe(false);
  });

  it('an unknown or unscalable ingredient → null, and missingIngredients names it', () => {
    const r: Recipe = {
      ...RECIPE,
      ingredients: [
        ...RECIPE.ingredients,
        { foodId: 'gone', grams: 10 },
        { foodId: 'f-shake', grams: 30 },
      ],
    };
    expect(recipePerServing(r, [RICE, CHICKEN, SHAKE])).toBeNull();
    expect(missingIngredients(r, [RICE, CHICKEN, SHAKE])).toEqual(['gone', 'f-shake']);
    expect(missingIngredients(RECIPE, [RICE, CHICKEN])).toEqual([]);
  });

  it('servings ≤ 0 → null', () => {
    expect(recipePerServing({ ...RECIPE, servings: 0 }, [RICE, CHICKEN])).toBeNull();
  });
});

describe('entry builders', () => {
  it('entryFromFood copies the scaled macros, the ref, the local date', () => {
    const e = entryFromFood(SHAKE, { servings: 1.5 }, OPTS);
    expect(e).toEqual({
      id: 'e1',
      date: '2026-11-11',
      time: T,
      slot: 'lunch',
      label: 'Protein shake',
      ref: { foodId: 'f-shake' },
      amount: { servings: 1.5 },
      estimate: false,
      kcal: 180,
      proteinG: 36,
      carbsG: 4.5,
      fatG: 2.3,
    });
  });

  it('a Large Thai dish stores 1.4 servings, its label, and estimate = true', () => {
    const e = entryFromFood(PAD_THAI, { servings: 1 }, { ...OPTS, portion: 'Large' });
    expect(e).toMatchObject({
      label: 'Pad thai (Large)',
      amount: { servings: 1.4 },
      kcal: 840,
      proteinG: 28,
      estimate: true,
    });
  });

  it('Regular keeps the plain label; an unknown portion label → null', () => {
    expect(entryFromFood(PAD_THAI, { servings: 1 }, { ...OPTS, portion: 'Regular' })?.label).toBe(
      'Pad thai',
    );
    expect(entryFromFood(PAD_THAI, { servings: 1 }, { ...OPTS, portion: 'Huge' })).toBeNull();
  });

  it('a quick-estimate food logs as an estimate', () => {
    const quick: Food = { ...SHAKE, id: 'q1', name: 'Thai place — pad see ew', estimate: true };
    expect(entryFromFood(quick, { servings: 1 }, OPTS)?.estimate).toBe(true);
  });

  it('entryFromFood with an amount it cannot scale → null', () => {
    expect(entryFromFood(SHAKE, { grams: 20 }, OPTS)).toBeNull();
  });

  it('entryFromRecipe logs 0.5 / 1.5 servings; editing the recipe later leaves the entry alone', () => {
    const foods = [RICE, CHICKEN];
    const half = entryFromRecipe(RECIPE, foods, 0.5, OPTS);
    expect(half).toMatchObject({
      label: 'Chicken kra pao',
      ref: { recipeId: 'r-kapao' },
      amount: { servings: 0.5 },
      kcal: 180,
      proteinG: 17.5,
      estimate: false,
    });
    const onePointFive = entryFromRecipe(RECIPE, foods, 1.5, OPTS);
    expect(onePointFive?.kcal).toBe(540);

    const snapshot = structuredClone(half);
    const edited: Recipe = { ...RECIPE, servings: 2, updatedAt: 2 };
    expect(recipePerServing(edited, foods)?.kcal).toBe(720);
    expect(half).toEqual(snapshot);
    expect(entryFromRecipe(edited, foods, 0.5, OPTS)?.kcal).toBe(360);
  });

  it('entryFromRecipe with a missing ingredient → null', () => {
    expect(entryFromRecipe(RECIPE, [RICE], 1, OPTS)).toBeNull();
  });

  it('entryFromQuick: name + kcal + protein, carbs/fat optional, estimate = true', () => {
    const e = entryFromQuick({ name: '  Takeout noodles ', kcal: 650.4, proteinG: 25.06 }, OPTS);
    expect(e).toEqual({
      id: 'e1',
      date: '2026-11-11',
      time: T,
      slot: 'lunch',
      label: 'Takeout noodles',
      amount: { servings: 1 },
      estimate: true,
      kcal: 650,
      proteinG: 25.1,
    });
    expect(
      entryFromQuick({ name: 'x', kcal: 500, proteinG: 20, carbsG: 60, fatG: 15 }, OPTS),
    ).toMatchObject({ carbsG: 60, fatG: 15 });
  });

  it('entryFromQuick rejects an empty name or bad numbers', () => {
    expect(entryFromQuick({ name: ' ', kcal: 1, proteinG: 1 }, OPTS)).toBeNull();
    expect(entryFromQuick({ name: 'a', kcal: -1, proteinG: 1 }, OPTS)).toBeNull();
    expect(entryFromQuick({ name: 'a', kcal: 1, proteinG: Number.NaN }, OPTS)).toBeNull();
  });

  it('the entry date is the local day of its time (midnight boundary)', () => {
    const late = new Date(2026, 10, 11, 23, 59).getTime();
    const early = new Date(2026, 10, 12, 0, 1).getTime();
    expect(entryFromFood(SHAKE, { servings: 1 }, { ...OPTS, time: late })?.date).toBe('2026-11-11');
    expect(entryFromFood(SHAKE, { servings: 1 }, { ...OPTS, time: early })?.date).toBe(
      '2026-11-12',
    );
  });
});

describe('QUICK_PRESETS', () => {
  it('Light / Regular / Big with kcal + protein, rising, and clean copy', () => {
    expect(QUICK_PRESETS.map((p) => p.label)).toEqual([
      'Light plate',
      'Regular plate',
      'Big plate',
    ]);
    for (let i = 1; i < QUICK_PRESETS.length; i++) {
      const a = QUICK_PRESETS[i - 1];
      const b = QUICK_PRESETS[i];
      expect(b && a && b.kcal > a.kcal && b.proteinG >= a.proteinG).toBe(true);
    }
    for (const p of QUICK_PRESETS) expect(checkCopy(`${p.label} ${p.note}`).ok).toBe(true);
  });
});

describe('weigh-ins in kg / lb', () => {
  it('kg passes through; lb converts to kg', () => {
    expect(weighInKg(72.4, 'kg')).toBe(72.4);
    expect(weighInKg(160, 'lb')).toBeCloseTo(72.575, 3);
  });

  it('display rounds to 0.1 in the unit, and lb → kg → lb round-trips', () => {
    expect(weighInDisplay(72.575, 'kg')).toBe(72.6);
    for (const lb of [120.1, 160, 180.4, 201.7]) {
      expect(weighInDisplay(weighInKg(lb, 'lb') ?? 0, 'lb')).toBe(lb);
    }
    for (const kg of [55.3, 72.4, 90]) {
      expect(weighInDisplay(weighInKg(kg, 'kg') ?? 0, 'kg')).toBe(kg);
    }
  });

  it('rejects non-positive or non-finite input', () => {
    expect(weighInKg(0, 'kg')).toBeNull();
    expect(weighInKg(Number.POSITIVE_INFINITY, 'lb')).toBeNull();
  });
});
