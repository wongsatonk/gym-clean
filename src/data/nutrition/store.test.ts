import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Food, FoodEntry, NutritionSettings, Recipe, WeeklyCheck } from '../../core/types';
import { GymDb } from '../db';
import {
  addFavorite,
  deleteEntry,
  deleteFavorite,
  deleteFood,
  deleteRecipe,
  deleteWeighIn,
  entriesBetween,
  entriesForDate,
  foodByBarcode,
  getBarcodeLookup,
  getFood,
  getNutritionMode,
  getNutritionSettings,
  getRecipe,
  getWeeklyCheck,
  listFavorites,
  listFoods,
  listRecipes,
  listWeeklyChecks,
  listWeighIns,
  restoreEntry,
  restoreFavorite,
  saveEntry,
  saveFood,
  saveNutritionSettings,
  saveRecipe,
  saveWeeklyCheck,
  saveWeighIn,
  seedOnce,
  setBarcodeLookup,
  setMode,
} from './store';

// Made-up values throughout (the repo is public).
let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`nutrition-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const food = (over: Partial<Food> = {}): Food => ({
  id: 'my:rice',
  name: 'Jasmine rice, cooked',
  source: 'custom',
  basis: { per100g: true },
  kcal: 130,
  proteinG: 2.5,
  ...over,
});
const entry = (over: Partial<FoodEntry> = {}): FoodEntry => ({
  id: 'e1',
  date: '2030-01-07',
  time: 1000,
  slot: 'lunch',
  label: 'Made-up lunch',
  ref: { foodId: 'my:rice' },
  amount: { grams: 200 },
  estimate: false,
  kcal: 260,
  proteinG: 5,
  carbsG: 56.4,
  fatG: 0.6,
  ...over,
});
const settings = (over: Partial<NutritionSettings> = {}): NutritionSettings => ({
  mode: 'quick',
  heightCm: 170,
  birthYear: 1990,
  sex: 'male',
  activity: 'moderate',
  surplusKcal: 300,
  proteinGPerKg: 1.8,
  fatPct: 25,
  gainPctPerWeek: [0.25, 0.5],
  barcodeLookup: false,
  ...over,
});
const shake: Food = {
  id: 'seed:protein-shake',
  name: 'Protein shake',
  source: 'custom',
  basis: { servingLabel: '1 scoop' },
  kcal: 100,
  proteinG: 20,
  note: 'Placeholder values: edit them from your product label.',
};

describe('foods', () => {
  it('saves, reads, lists by name, finds by barcode and deletes', async () => {
    await saveFood(db, food());
    await saveFood(db, food({ id: 'my:bar', name: 'Almond bar', barcode: '4006381333931' }));
    expect(await getFood(db, 'my:rice')).toEqual(food());
    expect((await listFoods(db)).map((f) => f.name)).toEqual([
      'Almond bar',
      'Jasmine rice, cooked',
    ]);
    expect((await foodByBarcode(db, '4006381333931'))?.id).toBe('my:bar');
    expect(await foodByBarcode(db, '0000000000000')).toBeUndefined();
    expect(await deleteFood(db, 'my:bar')).toMatchObject({ id: 'my:bar' });
    expect(await deleteFood(db, 'my:bar')).toBeUndefined();
    expect(await listFoods(db)).toHaveLength(1);
  });
});

describe('recipes', () => {
  const recipe: Recipe = {
    id: 'r1',
    name: 'Basil chicken pot',
    nameTh: 'กะเพราไก่',
    ingredients: [{ foodId: 'my:rice', grams: 400 }],
    servings: 3,
    updatedAt: 10,
  };
  it('saves, edits, lists and deletes', async () => {
    await saveRecipe(db, recipe);
    await saveRecipe(db, { ...recipe, servings: 4, updatedAt: 20 });
    expect(await getRecipe(db, 'r1')).toMatchObject({ servings: 4, updatedAt: 20 });
    expect(await listRecipes(db)).toHaveLength(1);
    expect(await deleteRecipe(db, 'r1')).toMatchObject({ id: 'r1' });
    expect(await listRecipes(db)).toEqual([]);
  });
});

describe('food entries', () => {
  it('reads one day in time order and a date range inclusive', async () => {
    await saveEntry(db, entry({ id: 'b', time: 3000 }));
    await saveEntry(db, entry({ id: 'a', time: 2000 }));
    await saveEntry(db, entry({ id: 'c', date: '2030-01-08', time: 90_000 }));
    await saveEntry(db, entry({ id: 'd', date: '2030-01-10', time: 300_000 }));
    expect((await entriesForDate(db, '2030-01-07')).map((e) => e.id)).toEqual(['a', 'b']);
    expect((await entriesBetween(db, '2030-01-07', '2030-01-08')).map((e) => e.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('restores a deleted entry exactly (Undo)', async () => {
    const e = entry({ estimate: true, photoConfidence: 0.8 });
    await saveEntry(db, e);
    const removed = await deleteEntry(db, 'e1');
    expect(removed).toEqual(e);
    expect(await entriesForDate(db, '2030-01-07')).toEqual([]);
    await restoreEntry(db, removed as FoodEntry);
    expect(await entriesForDate(db, '2030-01-07')).toEqual([e]);
    expect(await deleteEntry(db, 'missing')).toBeUndefined();
  });

  it('rejects a malformed date', async () => {
    await expect(saveEntry(db, entry({ date: '2030-1-7' }))).rejects.toThrow(/date/);
  });
});

describe('weigh-ins', () => {
  it('keeps one per date: saving the same date again replaces it (latest wins)', async () => {
    await saveWeighIn(db, { date: '2030-01-08', kg: 70.4 });
    await saveWeighIn(db, { date: '2030-01-07', kg: 70.2 });
    await saveWeighIn(db, { date: '2030-01-08', kg: 70.6 });
    expect(await listWeighIns(db)).toEqual([
      { date: '2030-01-07', kg: 70.2 },
      { date: '2030-01-08', kg: 70.6 },
    ]);
    expect(await listWeighIns(db, '2030-01-08')).toEqual([{ date: '2030-01-08', kg: 70.6 }]);
    expect(await deleteWeighIn(db, '2030-01-07')).toEqual({ date: '2030-01-07', kg: 70.2 });
    expect(await listWeighIns(db)).toHaveLength(1);
  });

  it('rejects a bad date or weight', async () => {
    await expect(saveWeighIn(db, { date: 'today', kg: 70 })).rejects.toThrow(/date/);
    await expect(saveWeighIn(db, { date: '2030-01-07', kg: 0 })).rejects.toThrow(/kg/);
    await expect(saveWeighIn(db, { date: '2030-01-07', kg: Number.NaN })).rejects.toThrow(/kg/);
  });
});

describe('favorites', () => {
  it('lists oldest first and restores a deleted favorite (Undo)', async () => {
    const a = { id: 'f2', ref: { foodId: 'my:rice' }, amount: { servings: 1 }, createdAt: 20 };
    const b = { id: 'f1', ref: { recipeId: 'r1' }, amount: { servings: 0.5 }, createdAt: 10 };
    await addFavorite(db, a);
    await addFavorite(db, b);
    expect((await listFavorites(db)).map((f) => f.id)).toEqual(['f1', 'f2']);
    const removed = await deleteFavorite(db, 'f2');
    expect(removed).toEqual(a);
    expect(await listFavorites(db)).toHaveLength(1);
    await restoreFavorite(db, a);
    expect(await listFavorites(db)).toEqual([b, a]);
  });
});

describe('weekly checks', () => {
  it('stores one per week and records the outcome', async () => {
    const c: WeeklyCheck = {
      weekStart: '2030-01-14',
      avgKg: 70.5,
      prevAvgKg: 70.4,
      ratePct: 0.14,
      kind: 'up',
      deltaKcal: 150,
      outcome: 'pending',
    };
    await saveWeeklyCheck(db, c);
    await saveWeeklyCheck(db, { ...c, outcome: 'accepted', decidedAt: 99 });
    await saveWeeklyCheck(db, { ...c, weekStart: '2030-01-07', kind: 'needData', deltaKcal: 0 });
    expect(await getWeeklyCheck(db, '2030-01-14')).toMatchObject({
      outcome: 'accepted',
      decidedAt: 99,
    });
    expect((await listWeeklyChecks(db)).map((w) => w.weekStart)).toEqual([
      '2030-01-07',
      '2030-01-14',
    ]);
  });
});

describe('nutrition settings', () => {
  it('is null before setup; mode defaults to quick and barcode lookup to off', async () => {
    expect(await getNutritionSettings(db)).toBeNull();
    expect(await getNutritionMode(db)).toBe('quick');
    expect(await getBarcodeLookup(db)).toBe(false);
  });

  it('round-trips under the settings key "nutrition"', async () => {
    await saveNutritionSettings(db, settings({ overrides: { kcal: 2600 } }));
    expect(await getNutritionSettings(db)).toEqual(settings({ overrides: { kcal: 2600 } }));
    expect((await db.settings.get('nutrition'))?.value).toMatchObject({ heightCm: 170 });
  });

  it('switches mode without touching any other setting or any entry field', async () => {
    await saveNutritionSettings(db, settings({ overrides: { proteinG: 140 } }));
    const quickEstimate = entry({ id: 'q', estimate: true });
    delete quickEstimate.carbsG;
    delete quickEstimate.fatG;
    await saveEntry(db, entry());
    await saveEntry(db, quickEstimate);
    const before = await entriesForDate(db, '2030-01-07');

    await setMode(db, 'full');
    expect(await getNutritionSettings(db)).toEqual(
      settings({ mode: 'full', overrides: { proteinG: 140 } }),
    );
    expect(await getNutritionMode(db)).toBe('full');
    await setMode(db, 'quick');
    expect(await getNutritionSettings(db)).toEqual(settings({ overrides: { proteinG: 140 } }));
    expect(await entriesForDate(db, '2030-01-07')).toEqual(before);
    expect(before.find((e) => e.id === 'e1')).toMatchObject({ carbsG: 56.4, fatG: 0.6 });
  });

  it('keeps mode and barcode choices made before setup (setup is still null until complete)', async () => {
    await setMode(db, 'full');
    await setBarcodeLookup(db, true);
    expect(await getNutritionSettings(db)).toBeNull();
    expect(await getNutritionMode(db)).toBe('full');
    expect(await getBarcodeLookup(db)).toBe(true);
    await setBarcodeLookup(db, false);
    expect(await getBarcodeLookup(db)).toBe(false);
  });

  it('only a stored true turns barcode lookup on', async () => {
    await db.settings.put({ key: 'nutrition', value: { barcodeLookup: 'yes' } });
    expect(await getBarcodeLookup(db)).toBe(false);
    await db.settings.put({ key: 'nutrition', value: 'garbage' });
    expect(await getBarcodeLookup(db)).toBe(false);
    expect(await getNutritionSettings(db)).toBeNull();
  });
});

describe('seedOnce', () => {
  it('adds the seed foods as favorites the first time only', async () => {
    expect(await seedOnce(db, [shake], 500)).toBe(true);
    expect(await getFood(db, 'seed:protein-shake')).toEqual(shake);
    expect(await listFavorites(db)).toEqual([
      {
        id: 'fav:seed:protein-shake',
        ref: { foodId: 'seed:protein-shake' },
        amount: { servings: 1 },
        createdAt: 500,
      },
    ]);
    expect(await seedOnce(db, [shake], 600)).toBe(false);
    expect(await listFavorites(db)).toHaveLength(1);
  });

  it('never brings back a seed favorite I deleted, nor overwrites label values I edited', async () => {
    await seedOnce(db, [shake], 500);
    await saveFood(db, { ...shake, kcal: 130, proteinG: 25 });
    await deleteFavorite(db, 'fav:seed:protein-shake');
    expect(await seedOnce(db, [shake], 700)).toBe(false);
    expect(await listFavorites(db)).toEqual([]);
    expect(await getFood(db, 'seed:protein-shake')).toMatchObject({ kcal: 130, proteinG: 25 });
  });

  it('keeps an existing food with the seed id (e.g. restored from an older install)', async () => {
    await saveFood(db, { ...shake, proteinG: 24 });
    await seedOnce(db, [shake], 500);
    expect(await getFood(db, 'seed:protein-shake')).toMatchObject({ proteinG: 24 });
    expect(await listFavorites(db)).toHaveLength(1);
  });
});
