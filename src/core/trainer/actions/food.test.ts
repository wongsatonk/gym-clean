import { describe, expect, it } from 'vitest';
import { KCAL_SLACK, entryFromSuggestion, suggestFood, type FoodCandidates } from './food';
import { THAI_PORTIONS } from '../../nutrition/portions';
import { checkCopy } from '../replies';
import type { Favorite, Food, Recipe } from '../../types';

// Made-up foods and numbers only (the repo is public).
const SHAKE: Food = {
  id: 'seed-shake',
  name: 'Protein shake',
  source: 'custom',
  basis: { servingLabel: '1 scoop' },
  kcal: 120,
  proteinG: 24,
};
const CHICKEN: Food = {
  id: 'f-chicken',
  name: 'Chicken breast',
  source: 'custom',
  basis: { per100g: true },
  kcal: 165,
  proteinG: 31,
};
const RICE: Food = {
  id: 'f-rice',
  name: 'Cooked rice',
  source: 'custom',
  basis: { per100g: true },
  kcal: 130,
  proteinG: 2.7,
};
const thai = (id: string, name: string, kcal: number, proteinG: number): Food => ({
  id,
  name,
  source: 'thai-estimate',
  basis: { servingLabel: '1 plate' },
  portions: [...THAI_PORTIONS],
  kcal,
  proteinG,
  note: 'Made-up test values',
});
const PAD_THAI = thai('thai-pad-thai', 'Pad thai', 600, 20);
const KAPAO = thai('thai-kapao', 'Pad kra pao with rice and egg', 700, 32);
const SOM_TUM = thai('thai-som-tum', 'Som tum', 150, 4);

const RECIPE: Recipe = {
  id: 'r-chicken-rice',
  name: 'Chicken and rice',
  ingredients: [
    { foodId: 'f-chicken', grams: 400 },
    { foodId: 'f-rice', grams: 600 },
  ],
  servings: 4, // 360 kcal / 35 g protein per serving
  updatedAt: 1,
};
const FAV_SHAKE: Favorite = {
  id: 'fav1',
  ref: { foodId: 'seed-shake' },
  amount: { servings: 1 },
  createdAt: 1,
};

const C: FoodCandidates = {
  favorites: [FAV_SHAKE],
  foods: [SHAKE, CHICKEN, RICE, PAD_THAI, KAPAO, SOM_TUM],
  recipes: [RECIPE],
  thaiDishes: [PAD_THAI, KAPAO, SOM_TUM],
};

describe('suggestFood', () => {
  it('up to 3 items, protein first', () => {
    const s = suggestFood({ kcal: 1200, proteinG: 60 }, C);
    expect(s.map((x) => x.label)).toEqual([
      'Chicken and rice',
      'Pad kra pao with rice and egg',
      'Protein shake',
    ]);
    expect(s[0]).toMatchObject({
      ref: { recipeId: 'r-chicken-rice' },
      amount: { servings: 1 },
      macros: { kcal: 360, proteinG: 35.1 },
    });
    expect(s[2]).toMatchObject({ ref: { foodId: 'seed-shake' }, amount: { servings: 1 } });
  });

  it('when protein covers what is left, kcal fit decides', () => {
    // 20 g left: everything but som tum covers it; then the closest to 700 kcal wins.
    const s = suggestFood({ kcal: 700, proteinG: 20 }, C);
    expect(s.map((x) => x.label)).toEqual([
      'Pad kra pao with rice and egg',
      'Pad thai',
      'Chicken and rice',
    ]);
  });

  it('a Thai dish too big at Regular is offered Small; too big at Small is left out', () => {
    const s = suggestFood({ kcal: 540, proteinG: 40 }, { ...C, favorites: [], recipes: [] });
    const kapao = s.find((x) => x.ref.foodId === 'thai-kapao');
    expect(kapao).toMatchObject({
      label: 'Pad kra pao with rice and egg (Small)',
      amount: { servings: 0.75 },
      macros: { kcal: 525, proteinG: 24 },
    });
    expect(s.find((x) => x.ref.foodId === 'thai-pad-thai')).toMatchObject({
      label: 'Pad thai (Small)',
    });
    // Nothing fits 100 kcal: the smallest option within the slack (som tum Small, 112.5).
    const tight = suggestFood({ kcal: 100, proteinG: 0 }, { ...C, favorites: [], recipes: [] });
    expect(tight.map((x) => x.label)).toEqual(['Som tum (Small)']);
    expect(KCAL_SLACK).toBeGreaterThanOrEqual(50);
  });

  it('protein left but kcal used up: only small items with real protein (slack, ≥ 5 g)', () => {
    const s = suggestFood({ kcal: 0, proteinG: 30 }, C);
    expect(s.map((x) => x.label)).toEqual(['Protein shake']);
  });

  it('protein done, kcal left: closest kcal first', () => {
    const s = suggestFood({ kcal: 600, proteinG: 0 }, C);
    expect(s[0]?.label).toBe('Pad thai');
    expect(s[0]?.why).toBe('Fits your 600 kcal left');
  });

  it('nothing left → no suggestions', () => {
    expect(suggestFood({ kcal: 0, proteinG: 0 }, C)).toEqual([]);
  });

  it('one row per food/recipe; the favorite amount wins', () => {
    const fav2: Favorite = {
      id: 'fav2',
      ref: { recipeId: 'r-chicken-rice' },
      amount: { servings: 0.5 },
      createdAt: 2,
    };
    const s = suggestFood(
      { kcal: 2000, proteinG: 100 },
      { ...C, favorites: [FAV_SHAKE, fav2] },
      10,
    );
    const rows = s.filter((x) => x.ref.recipeId === 'r-chicken-rice');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount).toEqual({ servings: 0.5 });
  });

  it('skips favorites and recipes it cannot resolve', () => {
    const lost: Favorite = {
      id: 'x',
      ref: { foodId: 'gone' },
      amount: { servings: 1 },
      createdAt: 1,
    };
    const broken: Recipe = {
      ...RECIPE,
      id: 'r2',
      name: 'Broken',
      ingredients: [{ foodId: 'gone', grams: 10 }],
    };
    const s = suggestFood(
      { kcal: 2000, proteinG: 100 },
      { favorites: [lost], foods: [], recipes: [broken], thaiDishes: [] },
    );
    expect(s).toEqual([]);
  });

  it('a label that fails checkCopy is never offered', () => {
    const odd: Food = { ...SHAKE, id: 'odd', name: 'Pain au chocolat' };
    const s = suggestFood(
      { kcal: 2000, proteinG: 100 },
      { favorites: [], foods: [], recipes: [], thaiDishes: [odd] },
    );
    expect(s).toEqual([]);
  });

  it('why: covers or counts toward the protein left; every line passes checkCopy', () => {
    const s = suggestFood({ kcal: 1200, proteinG: 30 }, C);
    expect(s[0]?.why).toBe('Covers your 30 g protein left');
    const t = suggestFood({ kcal: 1200, proteinG: 60 }, C);
    expect(t[0]?.why).toBe('35.1 g of your 60 g protein left');
    for (const x of [...s, ...t]) {
      expect(checkCopy(x.label).ok).toBe(true);
      expect(checkCopy(x.why).ok).toBe(true);
    }
  });
});

describe('suggestFood: placeholder foods waiting for label numbers', () => {
  const shakeOnly = (shake: Food): FoodCandidates => ({
    favorites: [FAV_SHAKE],
    foods: [shake],
    recipes: [],
    thaiDishes: [],
  });

  it('skips foods whose id is in skipIds (e.g. EDIT_FROM_LABEL)', () => {
    const c = { ...C, skipIds: new Set(['seed-shake']) };
    const s = suggestFood({ kcal: 1200, proteinG: 60 }, c);
    expect(s.some((x) => x.ref.foodId === 'seed-shake')).toBe(false);
    expect(s).toHaveLength(3);
    // Thai dishes are skipped by id too.
    const t = suggestFood({ kcal: 700, proteinG: 20 }, { ...C, skipIds: new Set(['thai-kapao']) });
    expect(t.some((x) => x.ref.foodId === 'thai-kapao')).toBe(false);
  });

  it('skips the unedited seed shake when its id is in skipIds', () => {
    const seed: Food = { ...SHAKE, estimate: true };
    expect(
      suggestFood(
        { kcal: 0, proteinG: 30 },
        { ...shakeOnly(seed), skipIds: new Set(['seed-shake']) },
      ),
    ).toEqual([]);
  });

  it('offers a custom estimate when its id is not in skipIds (no source/estimate heuristic)', () => {
    const seed: Food = { ...SHAKE, estimate: true };
    expect(suggestFood({ kcal: 0, proteinG: 30 }, shakeOnly(seed))).toHaveLength(1);
  });

  it('offers a quick-estimate favorite (custom + estimate)', () => {
    const quick: Food = {
      id: 'f-quick-noodles',
      name: 'Noodle soup',
      source: 'custom',
      basis: { servingLabel: '1 bowl' },
      kcal: 400,
      proteinG: 22,
      estimate: true,
    };
    const fav: Favorite = {
      id: 'fav-quick',
      ref: { foodId: quick.id },
      amount: { servings: 1 },
      createdAt: 1,
    };
    const s = suggestFood(
      { kcal: 500, proteinG: 30 },
      {
        favorites: [fav, FAV_SHAKE],
        foods: [quick, SHAKE],
        recipes: [],
        thaiDishes: [],
        skipIds: new Set(['seed-shake']),
      },
    );
    expect(s.map((x) => x.ref.foodId)).toEqual(['f-quick-noodles']);
  });

  it('offers it once label numbers are saved (estimate cleared)', () => {
    const edited: Food = { ...SHAKE };
    delete edited.estimate;
    expect(suggestFood({ kcal: 0, proteinG: 30 }, shakeOnly(edited)).map((x) => x.label)).toEqual([
      'Protein shake',
    ]);
    const editedFalse: Food = { ...SHAKE, estimate: false };
    expect(suggestFood({ kcal: 0, proteinG: 30 }, shakeOnly(editedFalse))).toHaveLength(1);
  });

  it('estimate Thai dishes (not custom) are still offered', () => {
    const s = suggestFood(
      { kcal: 600, proteinG: 0 },
      { ...C, thaiDishes: [{ ...PAD_THAI, estimate: true }] },
    );
    expect(s[0]?.label).toBe('Pad thai');
  });
});

describe('entryFromSuggestion', () => {
  it('copies label, ref, amount and macros into a FoodEntry draft', () => {
    const [s] = suggestFood({ kcal: 1200, proteinG: 60 }, C);
    const time = new Date(2026, 10, 11, 20, 0).getTime();
    expect(s && entryFromSuggestion(s, { id: 'e9', time, slot: 'dinner' })).toEqual({
      id: 'e9',
      date: '2026-11-11',
      time,
      slot: 'dinner',
      label: 'Chicken and rice',
      ref: { recipeId: 'r-chicken-rice' },
      amount: { servings: 1 },
      estimate: false,
      kcal: 360,
      proteinG: 35.1,
    });
  });

  it('Thai dish suggestions log as estimates', () => {
    const s = suggestFood({ kcal: 600, proteinG: 0 }, C)[0];
    const time = new Date(2026, 10, 11, 20, 0).getTime();
    expect(s && entryFromSuggestion(s, { id: 'e1', time, slot: 'dinner' }, C)?.estimate).toBe(true);
  });
});
