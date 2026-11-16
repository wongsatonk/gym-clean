/**
 * M7 nutrition persistence (Dexie v5 tables + settings key 'nutrition'). All of it stays in
 * IndexedDB on the phone and never goes into the developer log.
 *
 * Deletes return the removed row so the UI's Undo toast can put it back with the matching
 * restore (or save) call; nothing here asks for confirmation.
 */
import type {
  Favorite,
  Food,
  FoodEntry,
  NutritionMode,
  NutritionSettings,
  Recipe,
  WeeklyCheck,
  WeighIn,
} from '../../core/types';
import type { GymDb } from '../db';
import { markHealthWeighInDeleted } from '../health/store';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(date: string): void {
  if (!DATE_RE.test(date)) throw new RangeError(`Bad local date "${date}" (want YYYY-MM-DD)`);
}

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// ---------- My foods (custom, quick-estimate favorites, Open Food Facts results, seeds) ----------

export async function saveFood(db: GymDb, food: Food): Promise<void> {
  await db.foods.put(food);
}

export async function getFood(db: GymDb, id: string): Promise<Food | undefined> {
  return db.foods.get(id);
}

/** All my foods, by name. */
export async function listFoods(db: GymDb): Promise<Food[]> {
  return (await db.foods.toArray()).sort(byName);
}

export async function foodByBarcode(db: GymDb, barcode: string): Promise<Food | undefined> {
  return db.foods.where('barcode').equals(barcode).first();
}

/** Removes the food and returns it (for Undo: `saveFood`). Favorites pointing at it stay. */
export async function deleteFood(db: GymDb, id: string): Promise<Food | undefined> {
  return db.transaction('rw', db.foods, async () => {
    const row = await db.foods.get(id);
    if (row) await db.foods.delete(id);
    return row;
  });
}

// ---------- Recipes ----------

export async function saveRecipe(db: GymDb, recipe: Recipe): Promise<void> {
  await db.recipes.put(recipe);
}

export async function getRecipe(db: GymDb, id: string): Promise<Recipe | undefined> {
  return db.recipes.get(id);
}

export async function listRecipes(db: GymDb): Promise<Recipe[]> {
  return (await db.recipes.toArray()).sort(byName);
}

/** Removes the recipe and returns it (for Undo: `saveRecipe`). Past entries keep their macros. */
export async function deleteRecipe(db: GymDb, id: string): Promise<Recipe | undefined> {
  return db.transaction('rw', db.recipes, async () => {
    const row = await db.recipes.get(id);
    if (row) await db.recipes.delete(id);
    return row;
  });
}

// ---------- Food log ----------

/** Adds or replaces (same id) an entry. */
export async function saveEntry(db: GymDb, entry: FoodEntry): Promise<void> {
  checkDate(entry.date);
  await db.foodEntries.put(entry);
}

/** One local day's entries, in time order. */
export async function entriesForDate(db: GymDb, date: string): Promise<FoodEntry[]> {
  return db.foodEntries.where('date').equals(date).sortBy('time');
}

/** Entries with `from <= date <= to` (local YYYY-MM-DD), in time order. */
export async function entriesBetween(db: GymDb, from: string, to: string): Promise<FoodEntry[]> {
  return db.foodEntries.where('date').between(from, to, true, true).sortBy('time');
}

/** Removes the entry and returns it unchanged, for `restoreEntry` (Undo). */
export async function deleteEntry(db: GymDb, id: string): Promise<FoodEntry | undefined> {
  return db.transaction('rw', db.foodEntries, async () => {
    const row = await db.foodEntries.get(id);
    if (row) await db.foodEntries.delete(id);
    return row;
  });
}

export async function restoreEntry(db: GymDb, entry: FoodEntry): Promise<void> {
  await saveEntry(db, entry);
}

// ---------- Weigh-ins (one per local date, the latest wins: M7-q10) ----------

/**
 * Saves (replaces) the date's weigh-in. `source` is kept when given ('health' = imported from
 * Apple Health, M11); a row without one was typed by hand. Saving an imported row again (Undo of
 * its delete) takes its date off the deleted-imports list.
 */
export async function saveWeighIn(db: GymDb, w: WeighIn): Promise<void> {
  checkDate(w.date);
  if (!Number.isFinite(w.kg) || w.kg <= 0) throw new RangeError(`Bad weigh-in kg ${w.kg}`);
  const row: WeighIn = { date: w.date, kg: w.kg };
  if (w.source === 'health' || w.source === 'manual') row.source = w.source;
  if (row.source !== 'health') {
    await db.weighIns.put(row);
    return;
  }
  await db.transaction('rw', [db.weighIns, db.settings], async () => {
    await db.weighIns.put(row);
    await markHealthWeighInDeleted(db, row.date, false);
  });
}

/** Weigh-ins in date order, optionally only those on or after `sinceDate`. */
export async function listWeighIns(db: GymDb, sinceDate?: string): Promise<WeighIn[]> {
  if (sinceDate === undefined) return db.weighIns.orderBy('date').toArray();
  return db.weighIns.where('date').aboveOrEqual(sinceDate).toArray();
}

/**
 * Removes the weigh-in and returns it (for Undo: `saveWeighIn`). Deleting an imported one
 * (source 'health') puts its date on the deleted-imports list, so Health never brings it back.
 */
export async function deleteWeighIn(db: GymDb, date: string): Promise<WeighIn | undefined> {
  return db.transaction('rw', [db.weighIns, db.settings], async () => {
    const row = await db.weighIns.get(date);
    if (row) await db.weighIns.delete(date);
    if (row?.source === 'health') await markHealthWeighInDeleted(db, date, true);
    return row;
  });
}

// ---------- Favorites ----------

export async function addFavorite(db: GymDb, fav: Favorite): Promise<void> {
  await db.favorites.put(fav);
}

/** Favorites, oldest first. */
export async function listFavorites(db: GymDb): Promise<Favorite[]> {
  return db.favorites.orderBy('createdAt').toArray();
}

/** Removes the favorite and returns it, for `restoreFavorite` (Undo). */
export async function deleteFavorite(db: GymDb, id: string): Promise<Favorite | undefined> {
  return db.transaction('rw', db.favorites, async () => {
    const row = await db.favorites.get(id);
    if (row) await db.favorites.delete(id);
    return row;
  });
}

export async function restoreFavorite(db: GymDb, fav: Favorite): Promise<void> {
  await db.favorites.put(fav);
}

// ---------- Weekly checks (one per week; the outcome is recorded, never applied here) ----------

export async function saveWeeklyCheck(db: GymDb, check: WeeklyCheck): Promise<void> {
  checkDate(check.weekStart);
  await db.weeklyChecks.put(check);
}

export async function getWeeklyCheck(
  db: GymDb,
  weekStart: string,
): Promise<WeeklyCheck | undefined> {
  return db.weeklyChecks.get(weekStart);
}

export async function listWeeklyChecks(db: GymDb): Promise<WeeklyCheck[]> {
  return db.weeklyChecks.orderBy('weekStart').toArray();
}

// ---------- Settings (settings table, key 'nutrition') ----------

const KEY = 'nutrition';
const SEEDED_KEY = 'nutritionSeeded';

async function rawSettings(db: GymDb): Promise<Record<string, unknown>> {
  const v = (await db.settings.get(KEY))?.value;
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The full settings once setup has run, else null (mode/barcode may still be stored). */
export async function getNutritionSettings(db: GymDb): Promise<NutritionSettings | null> {
  const v = await rawSettings(db);
  const gain = v.gainPctPerWeek;
  const complete =
    (v.mode === 'quick' || v.mode === 'full') &&
    num(v.heightCm) &&
    num(v.birthYear) &&
    (v.sex === 'male' || v.sex === 'female') &&
    (v.activity === 'sedentary' ||
      v.activity === 'light' ||
      v.activity === 'moderate' ||
      v.activity === 'very') &&
    num(v.surplusKcal) &&
    num(v.proteinGPerKg) &&
    num(v.fatPct) &&
    Array.isArray(gain) &&
    gain.length === 2 &&
    num(gain[0]) &&
    num(gain[1]) &&
    typeof v.barcodeLookup === 'boolean';
  return complete ? (v as NutritionSettings) : null;
}

export async function saveNutritionSettings(db: GymDb, s: NutritionSettings): Promise<void> {
  await db.settings.put({ key: KEY, value: s });
}

async function patchSettings(db: GymDb, patch: Partial<NutritionSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const v = await rawSettings(db);
    await db.settings.put({ key: KEY, value: { ...v, ...patch } });
  });
}

/** Quick unless 'full' is stored. */
export async function getNutritionMode(db: GymDb): Promise<NutritionMode> {
  return (await rawSettings(db)).mode === 'full' ? 'full' : 'quick';
}

/** Changes only the mode; every other setting and every entry stays as it is. */
export async function setMode(db: GymDb, mode: NutritionMode): Promise<void> {
  await patchSettings(db, { mode });
}

/** Open Food Facts lookup: off unless an explicit true is stored. */
export async function getBarcodeLookup(db: GymDb): Promise<boolean> {
  return (await rawSettings(db)).barcodeLookup === true;
}

export async function setBarcodeLookup(db: GymDb, on: boolean): Promise<void> {
  await patchSettings(db, { barcodeLookup: on });
}

// ---------- Evening nudge (settings key 'nutritionNudgeShown') ----------

/** M7-q6: the local date the evening nudge was last shown or dismissed (at most once a day). */
const NUDGE_KEY = 'nutritionNudgeShown';

/** The date the nudge was last shown (YYYY-MM-DD), else null. */
export async function getNudgeShown(db: GymDb): Promise<string | null> {
  const v = (await db.settings.get(NUDGE_KEY))?.value;
  return typeof v === 'string' && DATE_RE.test(v) ? v : null;
}

/** Records that the nudge was shown (or dismissed) on `date`. */
export async function setNudgeShown(db: GymDb, date: string): Promise<void> {
  checkDate(date);
  await db.settings.put({ key: NUDGE_KEY, value: date });
}

// ---------- Seeding ----------

/**
 * First run only: stores each seed food (unless a food with that id already exists, so label
 * values I edited are kept) and adds it as a favorite (`fav:<foodId>`, 1 serving). A settings
 * flag makes it run once ever, so a deleted seed favorite doesn't come back.
 * Returns true when it seeded.
 */
export async function seedOnce(
  db: GymDb,
  seedFoods: readonly Food[],
  now: number,
): Promise<boolean> {
  return db.transaction('rw', db.settings, db.foods, db.favorites, async () => {
    if ((await db.settings.get(SEEDED_KEY))?.value === true) return false;
    for (const food of seedFoods) {
      if (!(await db.foods.get(food.id))) await db.foods.put(food);
      await db.favorites.put({
        id: `fav:${food.id}`,
        ref: { foodId: food.id },
        amount: { servings: 1 },
        createdAt: now,
      });
    }
    await db.settings.put({ key: SEEDED_KEY, value: true });
    return true;
  });
}
