// M7 task 17 + F3: the Fuel wiring. Owns the nutrition data the screens show (loaded from the
// store, kept in memory, saved on every change) and the Fuel sub-views (tab, weigh-in, setup) and
// sheets (log, entry, my food, recipe). app.ts keeps one instance and asks it for the Fuel
// screen, the Settings → Nutrition block, the Summary protein line, Today's nudge and the coach's
// food data. All numbers come from core (targets, totals, weekly check, portions, search).
//
// Privacy: nutrition data stays in IndexedDB. Nothing here writes to the developer log, and the
// only fetch is the same-origin food list (foodDb, lazy, on the first search).
import { weekStartOf, weeklyCheck, checkHasChange, decideCheck, applyAcceptedCheck, trend } from '../../core/nutrition/adjust';
import {
  dayTotals,
  foodDate,
  nudgeFor,
  nutritionHistory,
  postWorkoutHint,
  recentItems,
  slotFor,
  type Nudge,
} from '../../core/nutrition/day';
import {
  QUICK_PRESETS,
  entryFromFood,
  entryFromQuick,
  entryFromRecipe,
  foodFromDbRow,
  isEstimateFood,
  recipePerServing,
  scaleFood,
  type EntryOpts,
} from '../../core/nutrition/portions';
import { buildSearchIndex, searchFoods, type SearchIndex, type SearchResult } from '../../core/nutrition/search';
import { NUTRITION_DEFAULTS, clampProtein, clampSurplus, computeTargets, type TargetsResult } from '../../core/nutrition/targets';
import type { CoachFuel } from '../../core/trainer/coach';
import { entryFromSuggestion } from '../../core/trainer/actions/food';
import { addDate } from '../../core/trainer/plan';
import type {
  Favorite,
  Food,
  FoodAmount,
  FoodDbRow,
  FoodEntry,
  FoodSuggestion,
  MacroSet,
  MealSlot,
  NutritionMode,
  NutritionSettings,
  Recipe,
  WeeklyCheck,
  WeighIn,
} from '../../core/types';
import type { Unit } from '../../core/units';
import { sessionsSince, type GymDb } from '../../data/db';
import { foodDb } from '../../data/nutrition/foodDb';
import { EDIT_FROM_LABEL, SEED_FOODS, THAI_DISHES } from '../../data/nutrition/foods';
import {
  addFavorite,
  deleteEntry,
  deleteFood,
  deleteRecipe,
  entriesBetween,
  getBarcodeLookup,
  getNutritionMode,
  getNutritionSettings,
  listFavorites,
  listFoods,
  listRecipes,
  listWeeklyChecks,
  listWeighIns,
  restoreEntry,
  saveEntry,
  saveFood,
  saveNutritionSettings,
  saveRecipe,
  saveWeeklyCheck,
  saveWeighIn,
  seedOnce,
  setBarcodeLookup,
  setMode,
} from '../../data/nutrition/store';
import { fuelScreen } from '../screens/fuel';
import type { TabId } from '../tabBar';
import { entrySheet } from './entrySheet';
import type { SummaryFuel } from './links';
import { logSheet, type LogChoice, type LogItem, type LogSection, type QuickLog, type SearchState } from './logSheet';
import { myFoodEditor, type MyFoodDraft } from './myFoodEditor';
import { nutritionSettings, type MacroKey } from './nutritionSettings';
import { recipeEditor, type RecipeDraft } from './recipeEditor';
import { fuelSetupScreen, type SetupValues } from './setup';
import { weighInScreen } from './weighIn';

export type FuelHost = {
  db: GymDb;
  /** The app root (made inert while a Fuel sheet is open). */
  root: HTMLElement;
  now: () => number;
  unit: () => Unit;
  /** Re-render the app's current screen. */
  render: () => void;
  /** Make the app's view the Fuel screen (whatever sub-view is current) and render. */
  showFuel: () => void;
  /** Back to Settings (setup opened from Settings → Nutrition). */
  showSettings: () => void;
  goTab: (tab: TabId) => void;
  /** The app's Undo toast (10 s). */
  toast: (text: string, onUndo: () => void) => void;
  logError: (err: unknown) => void;
};

type Sub = { kind: 'main' } | { kind: 'weighIn' } | { kind: 'setup'; back: 'fuel' | 'settings' };

/** Settings key for the evening nudge (M7-q6: at most once a day): the date it was last shown. */
const NUDGE_KEY = 'nutritionNudgeShown';
const ENTRY_DAYS = 30;
const HISTORY_DAYS = 14;
const TREND_DAYS = 28;
const RECENTS = 8;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_LIMIT = 40;

function uid(prefix: string): string {
  const c = globalThis.crypto as Crypto | undefined;
  const id =
    typeof c?.randomUUID === 'function'
      ? c.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${id}`;
}

const amountValue = (a: FoodAmount): number => ('grams' in a ? a.grams : a.servings);

function macrosOf(m: MacroSet): MacroSet {
  const out: MacroSet = { kcal: m.kcal, proteinG: m.proteinG };
  if (m.carbsG !== undefined) out.carbsG = m.carbsG;
  if (m.fatG !== undefined) out.fatG = m.fatG;
  return out;
}

/** The serving basis without an undefined `servingG` (exactOptionalPropertyTypes). */
function cleanBasis(b: MyFoodDraft['basis']): Food['basis'] {
  if ('per100g' in b) return { per100g: true };
  return b.servingG !== undefined ? { servingLabel: b.servingLabel, servingG: b.servingG } : { servingLabel: b.servingLabel };
}

/**
 * An entry's macros as a food (per 100 g for gram entries, per 1 serving otherwise), so core
 * `scaleFood` can preview a new amount. Core rounding applies.
 */
function entryBase(e: FoodEntry): Food {
  const grams = 'grams' in e.amount;
  const v = amountValue(e.amount);
  const raw: Food = { ...macrosOf(e), id: e.id, name: e.label, source: 'custom', basis: { servingLabel: 'entry' } };
  const per = v > 0 ? scaleFood(raw, { servings: (grams ? 100 : 1) / v }) : null;
  return {
    ...(per ?? macrosOf(e)),
    id: e.id,
    name: e.label,
    source: 'custom',
    basis: grams ? { per100g: true } : { servingLabel: 'serving' },
  };
}

export type FuelController = ReturnType<typeof createFuel>;

export function createFuel(host: FuelHost) {
  const { db } = host;
  let loaded = false;
  let loading: Promise<void> | null = null;
  let seeded = false;
  let settings: NutritionSettings | null = null;
  let mode: NutritionMode = 'quick';
  let barcode = false;
  let weighIns: WeighIn[] = [];
  let entries: FoodEntry[] = [];
  let foods: Food[] = [];
  let recipes: Recipe[] = [];
  let favorites: Favorite[] = [];
  let checks: WeeklyCheck[] = [];
  let sessions: { startedAt: number; endedAt?: number }[] = [];
  let nudgeShownDate: string | null = null;
  let nudge: Nudge | null = null;
  let sub: Sub = { kind: 'main' };
  let sheet: HTMLElement | null = null;
  let index: SearchIndex | null = null;
  let indexHasUsda = false;
  /** USDA rows seen in search results, as foods (saved to db.foods once logged or used). */
  const usdaFoods = new Map<string, Food>();
  /** Their database rows (household measures for the log sheet). */
  const usdaRows = new Map<string, FoodDbRow>();
  let searchSeq = 0;
  let searchTimer: number | undefined;

  const today = () => foodDate(host.now());

  // ---------- loading ----------

  async function load(): Promise<void> {
    const t = host.now();
    const d = foodDate(t);
    const [s, m, bc, w, e, f, r, fav, c, sess, shown] = await Promise.all([
      getNutritionSettings(db),
      getNutritionMode(db),
      getBarcodeLookup(db),
      listWeighIns(db),
      entriesBetween(db, addDate(d, -(ENTRY_DAYS - 1)), d),
      listFoods(db),
      listRecipes(db),
      listFavorites(db),
      listWeeklyChecks(db),
      sessionsSince(db, t - (HISTORY_DAYS + 1) * 24 * 3_600_000),
      db.settings.get(NUDGE_KEY),
    ]);
    settings = s;
    mode = s?.mode ?? m;
    barcode = s?.barcodeLookup ?? bc;
    weighIns = w;
    entries = e;
    foods = f;
    recipes = r;
    favorites = fav;
    checks = c;
    sessions = sess.map((x) =>
      x.endedAt !== undefined ? { startedAt: x.startedAt, endedAt: x.endedAt } : { startedAt: x.startedAt },
    );
    nudgeShownDate = typeof shown?.value === 'string' ? shown.value : null;
    index = null;
    loaded = true;
    evaluateNudge();
  }

  /** Re-reads everything (cheap: small tables). Errors are logged, the old data stays. */
  async function refresh(): Promise<void> {
    if (loading) return loading;
    loading = load()
      .catch(host.logError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  async function ensureLoaded(): Promise<void> {
    if (!loaded) await refresh();
  }

  /** First Fuel open: the seed foods (Protein shake) as favorites, once ever. */
  async function ensureSeeded(): Promise<void> {
    if (seeded) return;
    seeded = true;
    try {
      if (await seedOnce(db, SEED_FOODS, host.now())) {
        [foods, favorites] = await Promise.all([listFoods(db), listFavorites(db)]);
        index = null;
      }
    } catch (err) {
      host.logError(err);
    }
  }

  // ---------- selectors ----------

  /** Every food entries / favorites / recipes may point at; stored foods win (edited shake). */
  function foodMap(): Map<string, Food> {
    const m = new Map<string, Food>();
    for (const f of SEED_FOODS) m.set(f.id, f);
    for (const f of THAI_DISHES) m.set(f.id, f);
    for (const [id, f] of usdaFoods) m.set(id, f);
    for (const f of foods) m.set(f.id, f);
    return m;
  }

  const needsLabel = (f: Food) => EDIT_FROM_LABEL.has(f.id) && f.estimate === true;

  /** Placeholder foods still waiting for their label numbers (never suggested by the coach). */
  function skipIds(): Set<string> {
    const m = foodMap();
    return new Set([...EDIT_FROM_LABEL].filter((id) => m.get(id)?.estimate === true));
  }

  function targetsResult(): TargetsResult | null {
    return settings ? computeTargets(settings, weighIns, today()) : null;
  }

  function targets() {
    const r = targetsResult();
    return r?.ok ? r.targets : null;
  }

  const todayEntries = () => entries.filter((e) => e.date === today());
  const totals = () => dayTotals(entries, today());

  function lastSessionEnd(): number | undefined {
    let end: number | undefined;
    for (const s of sessions) if (s.endedAt !== undefined && (end === undefined || s.endedAt > end)) end = s.endedAt;
    return end;
  }

  function entryOpts(slot?: MealSlot): EntryOpts {
    const t = host.now();
    return { id: uid('entry'), time: t, slot: slot ?? slotFor(t, lastSessionEnd()) };
  }

  function evaluateNudge(): void {
    const d = today();
    if (nudge && nudge.date === d) {
      // Still on show this visit: keep it current, or drop it once protein is on track.
      nudge = nudgeFor(host.now(), totals(), targets(), false);
      return;
    }
    nudge = null;
    if (nudgeShownDate === d) return;
    const n = nudgeFor(host.now(), totals(), targets(), false);
    if (!n) return;
    nudge = n;
    nudgeShownDate = d;
    void db.settings.put({ key: NUDGE_KEY, value: d }).catch(host.logError);
  }

  function dismissNudge(): void {
    nudge = null;
    nudgeShownDate = today();
    void db.settings.put({ key: NUDGE_KEY, value: nudgeShownDate }).catch(host.logError);
    host.render();
  }

  function currentCheck(): WeeklyCheck | null {
    const r = targetsResult();
    if (!settings || !r?.ok) return null;
    const d = today();
    const stored = checks.find((c) => c.weekStart === weekStartOf(d));
    if (stored) return stored;
    return weeklyCheck({
      weighIns,
      today: d,
      settings,
      kcalTarget: r.targets.kcal.value,
      maintenanceKcal: r.maintenanceKcal,
    });
  }

  // ---------- log items ----------

  function isMine(f: Food): boolean {
    return f.source !== 'usda' && f.source !== 'thai-estimate';
  }

  function foodItem(f: Food, key: string, extra: Partial<LogItem> = {}): LogItem {
    const row = f.source === 'usda' ? usdaRows.get(f.id) : undefined;
    return {
      key,
      label: f.name,
      nameTh: f.nameTh,
      macros: macrosOf(f),
      per: 'per100g' in f.basis ? '100g' : 'serving',
      portions: f.portions,
      measures: row?.portions,
      estimate: isEstimateFood(f),
      needsLabel: needsLabel(f),
      editable: isMine(f),
      ref: { foodId: f.id },
      ...extra,
    };
  }

  function recipeItem(r: Recipe, key: string, extra: Partial<LogItem> = {}): LogItem | null {
    const per = recipePerServing(r, foodMap());
    if (!per) return null;
    return {
      key,
      label: r.name,
      nameTh: r.nameTh,
      macros: per,
      per: 'serving',
      editable: true,
      ref: { recipeId: r.id },
      ...extra,
    };
  }

  function resultItem(r: SearchResult): LogItem | null {
    switch (r.kind) {
      case 'myFood':
      case 'thai':
        return foodItem(r.food, `food:${r.food.id}`);
      case 'recipe':
        return recipeItem(r.recipe, `recipe:${r.recipe.id}`);
      case 'usda': {
        const f = foodFromDbRow(r.row);
        usdaFoods.set(f.id, f);
        usdaRows.set(f.id, r.row);
        return foodItem(f, `usda:${f.id}`);
      }
    }
  }

  const refKey = (ref: { foodId?: string; recipeId?: string } | undefined, a: FoodAmount) =>
    `${ref?.recipeId ? `r:${ref.recipeId}` : ref?.foodId ? `f:${ref.foodId}` : ''}|${JSON.stringify(a)}`;

  function favoriteItems(): LogItem[] {
    const map = foodMap();
    const out: LogItem[] = [];
    const favKeys = new Set<string>();
    for (const fav of favorites) {
      const amount = amountValue(fav.amount);
      if ('foodId' in fav.ref) {
        const f = map.get(fav.ref.foodId);
        if (!f) continue;
        favKeys.add(refKey(fav.ref, fav.amount));
        out.push(foodItem(f, `fav:${fav.id}`, { badge: 'favorite', defaultAmount: amount }));
      } else {
        const recipeId = fav.ref.recipeId;
        const r = recipes.find((x) => x.id === recipeId);
        const item = r && recipeItem(r, `fav:${fav.id}`, { badge: 'favorite', defaultAmount: amount });
        if (!item) continue;
        favKeys.add(refKey(fav.ref, fav.amount));
        out.push(item);
      }
    }
    // Recents: the stored amount already includes any S/R/L factor, so no plate-size chips here
    // (picking Large again would apply 1.4 twice).
    for (const e of recentItems(entries, RECENTS + favorites.length)) {
      if (out.length >= favorites.length + RECENTS) break;
      if (e.ref && favKeys.has(refKey(e.ref, e.amount))) continue;
      const key = `recent:${e.id}`;
      const amount = amountValue(e.amount);
      if (e.ref?.recipeId !== undefined) {
        const r = recipes.find((x) => x.id === e.ref?.recipeId);
        const item = r && recipeItem(r, key, { badge: 'recent', defaultAmount: amount });
        if (item) out.push(item);
      } else if (e.ref?.foodId !== undefined) {
        const f = map.get(e.ref.foodId);
        if (f) out.push(foodItem(f, key, { badge: 'recent', defaultAmount: amount, portions: undefined }));
      } else {
        const base = entryBase(e);
        out.push({
          key,
          label: e.label,
          macros: macrosOf(base),
          per: 'grams' in e.amount ? '100g' : 'serving',
          defaultAmount: amount,
          estimate: e.estimate,
          badge: 'recent',
          ref: {},
        });
      }
    }
    return out;
  }

  function myFoodItems(): LogItem[] {
    return foods.filter(isMine).map((f) => foodItem(f, `food:${f.id}`));
  }

  function recipeItems(): LogItem[] {
    return recipes.flatMap((r) => recipeItem(r, `recipe:${r.id}`) ?? []);
  }

  function thaiItems(): LogItem[] {
    return THAI_DISHES.map((f) => foodItem(f, `thai:${f.id}`));
  }

  // ---------- search ----------

  function searchIndex(usda: readonly FoodDbRow[] | null): SearchIndex {
    if (!index || (usda && !indexHasUsda)) {
      index = buildSearchIndex({
        myFoods: foods.filter(isMine),
        recipes,
        thaiDishes: THAI_DISHES,
        ...(usda ? { usda } : {}),
      });
      indexHasUsda = usda !== null;
    }
    return index;
  }

  function runSearch(
    query: string,
    target: { setSearch: (s: SearchState) => void },
    keep: (i: LogItem) => boolean = () => true,
  ): void {
    const seq = ++searchSeq;
    window.clearTimeout(searchTimer);
    if (query.trim() === '') {
      target.setSearch({ status: 'idle' });
      return;
    }
    searchTimer = window.setTimeout(() => {
      void (async () => {
        if (!foodDb.rows()) target.setSearch({ status: 'loading', query });
        let usda: FoodDbRow[] | null;
        try {
          usda = await foodDb.load();
        } catch {
          usda = null; // offline before the first load: my items and Thai dishes still search
        }
        if (seq !== searchSeq) return;
        const items = searchFoods(searchIndex(usda), query, { limit: SEARCH_LIMIT })
          .map(resultItem)
          .filter((i): i is LogItem => i !== null && keep(i));
        target.setSearch(
          usda === null && items.length === 0 ? { status: 'offline' } : { status: 'results', query, items },
        );
      })();
    }, SEARCH_DEBOUNCE_MS);
  }

  /** A USDA food used in a log or recipe is kept in My foods' table so it resolves offline. */
  async function keepUsda(id: string): Promise<void> {
    const f = usdaFoods.get(id);
    if (!f || foods.some((x) => x.id === id)) return;
    await saveFood(db, f);
    foods = [...foods, f];
  }

  // ---------- sheets ----------

  function openSheet(el: HTMLElement): void {
    closeSheet(false);
    sheet = el;
    host.root.inert = true;
    document.body.append(el);
    el.focus();
  }

  function closeSheet(refocus = true): void {
    window.clearTimeout(searchTimer);
    searchSeq++;
    if (!sheet) return;
    sheet.remove();
    sheet = null;
    host.root.inert = false;
    if (refocus) host.root.querySelector<HTMLElement>('[data-log-open]')?.focus();
  }

  function afterChange(): void {
    index = null;
    evaluateNudge();
    host.render();
  }

  async function addEntry(e: FoodEntry): Promise<void> {
    await saveEntry(db, e);
    entries = [...entries, e];
    afterChange();
    host.toast(`Logged ${e.label}.`, () => void removeEntry(e, false));
  }

  async function removeEntry(e: FoodEntry, undoable: boolean): Promise<void> {
    await deleteEntry(db, e.id);
    entries = entries.filter((x) => x.id !== e.id);
    afterChange();
    if (undoable)
      host.toast(`Deleted ${e.label}.`, () => {
        void restoreEntry(db, e)
          .then(() => {
            entries = [...entries.filter((x) => x.id !== e.id), e];
            afterChange();
          })
          .catch(host.logError);
      });
  }

  function openLog(section?: LogSection): void {
    void ensureSeeded().then(() => {
      const el = logSheet(
        {
          mode,
          slot: slotFor(host.now(), lastSessionEnd()),
          favorites: favoriteItems(),
          recipes: recipeItems(),
          thai: thaiItems(),
          myFoods: myFoodItems(),
          presets: QUICK_PRESETS.map((p) => ({ label: p.label, kcal: p.kcal, proteinG: p.proteinG })),
          initialSection: section,
        },
        {
          onLog: (c) => void logChoice(c).catch(host.logError),
          onQuickLog: (q) => void quickLog(q).catch(host.logError),
          onSearch: (q) => runSearch(q, el),
          onNewRecipe: () => openRecipeEditor(null),
          onNewFood: () => openFoodEditor(null, false),
          onEditItem: (item) => editItem(item),
          onClose: () => closeSheet(),
        },
      );
      openSheet(el);
    });
  }

  async function logChoice(c: LogChoice): Promise<void> {
    const opts = entryOpts(c.slot);
    let e: FoodEntry | null = null;
    const { foodId, recipeId } = c.item.ref;
    if (recipeId !== undefined) {
      const r = recipes.find((x) => x.id === recipeId);
      e = r ? entryFromRecipe(r, foodMap(), amountValue(c.amount), opts) : null;
    } else if (foodId !== undefined) {
      const f = foodMap().get(foodId);
      if (f) {
        // Plate size only for items that offer it (never on recents: their amount has it already).
        const portion = c.item.portions?.length && c.portion ? c.portion.label : undefined;
        e = entryFromFood(f, c.amount, portion !== undefined ? { ...opts, portion } : opts);
        if (e && f.source === 'usda') await keepUsda(f.id);
      }
    } else {
      e = entryFromQuick({ name: c.item.label, ...c.macros }, opts);
      if (e) e.estimate = c.item.estimate === true;
    }
    if (!e) return;
    closeSheet();
    await addEntry(e);
  }

  async function quickLog(q: QuickLog): Promise<void> {
    const opts = entryOpts(q.slot);
    let e: FoodEntry | null;
    if (q.saveFavorite) {
      const f: Food = {
        ...macrosOf(q.macros),
        id: uid('my'),
        name: q.name.trim(),
        source: 'custom',
        basis: { servingLabel: '1 plate' },
        estimate: true,
      };
      if (f.name === '') return;
      await saveFood(db, f);
      const fav: Favorite = { id: `fav:${f.id}`, ref: { foodId: f.id }, amount: { servings: 1 }, createdAt: host.now() };
      await addFavorite(db, fav);
      foods = [...foods, f];
      favorites = [...favorites, fav];
      e = entryFromFood(f, { servings: 1 }, opts);
    } else {
      e = entryFromQuick({ name: q.name, ...q.macros }, opts);
    }
    if (!e) return;
    closeSheet();
    await addEntry(e);
  }

  function editItem(item: LogItem): void {
    if (item.ref.recipeId !== undefined) {
      const r = recipes.find((x) => x.id === item.ref.recipeId);
      if (r) openRecipeEditor(r);
      return;
    }
    const f = item.ref.foodId !== undefined ? foodMap().get(item.ref.foodId) : undefined;
    if (f) openFoodEditor(f, item.needsLabel === true);
  }

  function openEntry(e: FoodEntry): void {
    const base = entryBase(e);
    const preview = (a: FoodAmount): MacroSet => scaleFood(base, a) ?? macrosOf(e);
    openSheet(
      entrySheet(
        { entry: e, mode, preview },
        {
          onSave: ({ amount, slot }) => {
            const m = preview(amount);
            const next: FoodEntry = { ...e, amount, slot, kcal: m.kcal, proteinG: m.proteinG };
            if (m.carbsG !== undefined) next.carbsG = m.carbsG;
            else delete next.carbsG;
            if (m.fatG !== undefined) next.fatG = m.fatG;
            else delete next.fatG;
            closeSheet();
            void saveEntry(db, next)
              .then(() => {
                entries = entries.map((x) => (x.id === e.id ? next : x));
                afterChange();
              })
              .catch(host.logError);
          },
          onDelete: () => {
            closeSheet();
            void removeEntry(e, true).catch(host.logError);
          },
          onClose: () => closeSheet(),
        },
      ),
    );
  }

  function openFoodEditor(existing: Food | null, labelPrompt: boolean): void {
    const draft: MyFoodDraft = existing
      ? { ...macrosOf(existing), id: existing.id, name: existing.name, nameTh: existing.nameTh, basis: existing.basis }
      : { kcal: 0, proteinG: 0, name: '', basis: { servingLabel: '' } };
    const back = () => openLog(existing && !labelPrompt ? 'myFoods' : 'favorites');
    openSheet(
      myFoodEditor(
        { draft, mode, labelPrompt },
        {
          onSave: (d) => {
            const f: Food = {
              ...(existing ?? { id: uid('my'), source: 'custom' as const }),
              name: d.name,
              basis: cleanBasis(d.basis),
              kcal: d.kcal,
              proteinG: d.proteinG,
            };
            if (d.nameTh) f.nameTh = d.nameTh;
            else delete f.nameTh;
            if (d.carbsG !== undefined) f.carbsG = d.carbsG;
            if (d.fatG !== undefined) f.fatG = d.fatG;
            // The seed placeholder now has the label's numbers: no longer an estimate.
            if (EDIT_FROM_LABEL.has(f.id)) {
              delete f.estimate;
              delete f.note;
            }
            void saveFood(db, f)
              .then(() => {
                foods = [...foods.filter((x) => x.id !== f.id), f];
                index = null;
                back();
                host.render();
              })
              .catch(host.logError);
          },
          onCancel: back,
          onDelete:
            existing && foods.some((x) => x.id === existing.id)
              ? () => {
                  void deleteFood(db, existing.id)
                    .then((row) => {
                      foods = foods.filter((x) => x.id !== existing.id);
                      index = null;
                      openLog('myFoods');
                      if (row)
                        host.toast(`Deleted ${row.name}.`, () => {
                          void saveFood(db, row)
                            .then(() => {
                              foods = [...foods, row];
                              index = null;
                            })
                            .catch(host.logError);
                        });
                    })
                    .catch(host.logError);
                }
              : undefined,
        },
      ),
    );
  }

  function asRecipe(d: RecipeDraft, id: string): Recipe {
    const r: Recipe = {
      id,
      name: d.name,
      ingredients: d.ingredients.map((i) => ({ foodId: i.foodId, grams: i.grams })),
      servings: d.servings,
      updatedAt: host.now(),
    };
    if (d.nameTh) r.nameTh = d.nameTh;
    return r;
  }

  function openRecipeEditor(existing: Recipe | null): void {
    const map = foodMap();
    const draft: RecipeDraft = existing
      ? {
          id: existing.id,
          name: existing.name,
          nameTh: existing.nameTh,
          servings: existing.servings,
          ingredients: existing.ingredients.map((i) => ({
            ...i,
            name: map.get(i.foodId)?.name ?? i.foodId,
          })),
        }
      : { name: '', servings: 1, ingredients: [] };
    const back = () => openLog('recipes');
    const el = recipeEditor(
      {
        draft,
        mode,
        perServing: (d) => recipePerServing(asRecipe(d, 'draft'), foodMap()) ?? { kcal: 0, proteinG: 0 },
      },
      {
        // Ingredients are weighed in grams: only foods with values per 100 g.
        onSearch: (q) => runSearch(q, el, (i) => i.per === '100g' && i.ref.foodId !== undefined),
        onSave: (d) => {
          const r = asRecipe(d, existing?.id ?? uid('recipe'));
          void (async () => {
            for (const i of r.ingredients) if (i.foodId.startsWith('usda:')) await keepUsda(i.foodId);
            await saveRecipe(db, r);
            recipes = [...recipes.filter((x) => x.id !== r.id), r];
            index = null;
            back();
          })().catch(host.logError);
        },
        onCancel: back,
        onDelete: existing
          ? () => {
              void deleteRecipe(db, existing.id)
                .then((row) => {
                  recipes = recipes.filter((x) => x.id !== existing.id);
                  index = null;
                  back();
                  if (row)
                    host.toast(`Deleted ${row.name}.`, () => {
                      void saveRecipe(db, row)
                        .then(() => {
                          recipes = [...recipes, row];
                          index = null;
                        })
                        .catch(host.logError);
                    });
                })
                .catch(host.logError);
            }
          : undefined,
      },
    );
    openSheet(el);
  }

  // ---------- sub-views ----------

  function latestKg(before?: string): number | null {
    let best: WeighIn | null = null;
    for (const w of weighIns) {
      if (before !== undefined && w.date >= before) continue;
      if (!best || w.date > best.date) best = w;
    }
    return best?.kg ?? null;
  }

  function mainScreen(): HTMLElement {
    return fuelScreen(
      {
        now: host.now(),
        mode,
        targets: targets(),
        totals: totals(),
        entries: todayEntries(),
        unit: host.unit(),
        lastWeighInKg: latestKg(),
        nudge: nudge?.text ?? null,
      },
      {
        onLog: () => openLog(),
        onEditEntry: (e) => openEntry(e),
        onDeleteEntry: (e) => void removeEntry(e, true).catch(host.logError),
        onWeighIn: () => {
          sub = { kind: 'weighIn' };
          host.render();
        },
        onSetup: () => openSetup('fuel'),
        onDismissNudge: () => dismissNudge(),
        onTab: (t) => host.goTab(t),
      },
    );
  }

  function weighInView(): HTMLElement {
    const d = today();
    const r = targetsResult();
    return weighInScreen(
      {
        unit: host.unit(),
        todayKg: weighIns.find((w) => w.date === d)?.kg ?? null,
        lastKg: latestKg(d),
        trend: trend(weighIns, TREND_DAYS, d),
        check: currentCheck(),
        kcalTarget: r?.ok ? r.targets.kcal.value : null,
        history: nutritionHistory(entries, sessions, d, HISTORY_DAYS),
      },
      {
        onBack: () => {
          sub = { kind: 'main' };
          host.render();
        },
        onSave: (kg) => {
          const w: WeighIn = { date: today(), kg };
          void saveWeighIn(db, w)
            .then(() => {
              weighIns = [...weighIns.filter((x) => x.date !== w.date), w].sort((a, b) =>
                a.date < b.date ? -1 : 1,
              );
              afterChange();
            })
            .catch(host.logError);
        },
        onAccept: () => decide('accepted'),
        onDismiss: () => decide('dismissed'),
      },
    );
  }

  /** Accept applies the change (only when there is one); both record the answer. */
  function decide(outcome: 'accepted' | 'dismissed'): void {
    const c = currentCheck();
    if (!c || !settings || c.outcome !== 'pending') return;
    if (outcome === 'accepted' && !checkHasChange(c)) return;
    const decided = decideCheck(c, outcome, host.now());
    const prev = settings;
    const next = applyAcceptedCheck(prev, decided);
    settings = next;
    checks = [...checks.filter((x) => x.weekStart !== decided.weekStart), decided];
    void (async () => {
      if (next !== prev) await saveNutritionSettings(db, next);
      await saveWeeklyCheck(db, decided);
    })().catch(host.logError);
    afterChange();
  }

  function openSetup(back: 'fuel' | 'settings'): void {
    sub = { kind: 'setup', back };
    host.showFuel();
  }

  function leaveSetup(back: 'fuel' | 'settings'): void {
    sub = { kind: 'main' };
    if (back === 'settings') host.showSettings();
    else host.render();
  }

  function setupView(back: 'fuel' | 'settings'): HTMLElement {
    const s = settings;
    const kg = latestKg();
    return fuelSetupScreen(
      {
        year: new Date(host.now()).getFullYear(),
        unit: host.unit(),
        initial: s
          ? {
              heightCm: s.heightCm,
              birthYear: s.birthYear,
              sex: s.sex,
              activity: s.activity,
              ...(kg !== null ? { weightKg: kg } : {}),
            }
          : undefined,
      },
      {
        onSave: (v) => void saveSetup(v, back).catch(host.logError),
        onCancel: () => leaveSetup(back),
      },
    );
  }

  async function saveSetup(v: SetupValues, back: 'fuel' | 'settings'): Promise<void> {
    // Mode and the barcode switch may already be stored (set before setup): keep them.
    const [storedMode, storedBarcode] = await Promise.all([getNutritionMode(db), getBarcodeLookup(db)]);
    const body = { heightCm: v.heightCm, birthYear: v.birthYear, sex: v.sex, activity: v.activity };
    const next: NutritionSettings = settings
      ? { ...settings, ...body, mode: storedMode, barcodeLookup: storedBarcode }
      : {
          mode: storedMode,
          surplusKcal: NUTRITION_DEFAULTS.surplusKcal,
          proteinGPerKg: NUTRITION_DEFAULTS.proteinGPerKg,
          fatPct: NUTRITION_DEFAULTS.fatPct,
          gainPctPerWeek: [NUTRITION_DEFAULTS.gainPctPerWeek[0], NUTRITION_DEFAULTS.gainPctPerWeek[1]],
          barcodeLookup: storedBarcode,
          ...body,
        };
    const w: WeighIn = { date: today(), kg: v.weightKg };
    await saveNutritionSettings(db, next);
    await saveWeighIn(db, w);
    settings = next;
    mode = next.mode;
    barcode = next.barcodeLookup;
    weighIns = [...weighIns.filter((x) => x.date !== w.date), w].sort((a, b) => (a.date < b.date ? -1 : 1));
    evaluateNudge();
    leaveSetup(back);
  }

  // ---------- Settings → Nutrition ----------

  function saveSettings(next: NutritionSettings): void {
    settings = next;
    void saveNutritionSettings(db, next).catch(host.logError);
    afterChange();
  }

  function settingsBlock(): HTMLElement {
    return nutritionSettings(
      { settings, barcodeLookup: barcode, targets: targets() },
      {
        onMode: (m) => {
          mode = m;
          if (settings) settings = { ...settings, mode: m };
          void setMode(db, m).catch(host.logError);
          host.render();
        },
        onOverride: (k: MacroKey, value) => {
          if (!settings) return;
          const o: Partial<MacroSet> = Object.fromEntries(
            Object.entries(settings.overrides ?? {}).filter(([key]) => key !== k),
          );
          if (value !== null) o[k] = value;
          const next: NutritionSettings = { ...settings };
          if (Object.keys(o).length) next.overrides = o;
          else delete next.overrides;
          saveSettings(next);
        },
        onSurplus: (kcal) => settings && saveSettings({ ...settings, surplusKcal: clampSurplus(kcal) }),
        onProteinPerKg: (g) => settings && saveSettings({ ...settings, proteinGPerKg: clampProtein(g) }),
        onSetup: () => openSetup('settings'),
        onBarcodeLookup: (on) => {
          barcode = on;
          if (settings) settings = { ...settings, barcodeLookup: on };
          void setBarcodeLookup(db, on).catch(host.logError);
          host.render();
        },
      },
    );
  }

  // ---------- public ----------

  return {
    refresh,
    ensureLoaded,
    /** The Fuel tab: loads (first time), seeds once, starts on the main view. */
    async open(): Promise<void> {
      await ensureLoaded();
      await ensureSeeded();
      evaluateNudge();
      sub = { kind: 'main' };
    },
    screen(): HTMLElement {
      switch (sub.kind) {
        case 'main':
          return mainScreen();
        case 'weighIn':
          return weighInView();
        case 'setup':
          return setupView(sub.back);
      }
    },
    settingsBlock,
    /** Summary's protein line, or null without targets. */
    summaryFuel(): SummaryFuel | null {
      const t = targets();
      const tot = totals();
      const hint = postWorkoutHint(tot, t);
      if (!t || hint === null) return null;
      return { proteinG: tot.proteinG, targetG: t.proteinG.value, hint, estimate: t.proteinG.estimate };
    },
    /** Today's evening nudge text (M7-q6), or null. */
    nudgeText: (): string | null => nudge?.text ?? null,
    dismissNudge,
    /** The coach offers food once targets exist. */
    m7Available: (): boolean => targets() !== null,
    coachFuel(): CoachFuel {
      return {
        totals: totals(),
        targets: targets(),
        favorites,
        foods: foodMap(),
        recipes,
        thaiDishes: THAI_DISHES,
        skipIds: skipIds(),
      };
    },
    /** F3: the coach card's Log. Resolves with an undo that removes the entry again. */
    async logSuggestion(s: FoodSuggestion, onUndone: () => void): Promise<void> {
      const e = entryFromSuggestion(s, entryOpts(), { foods: foodMap() });
      await saveEntry(db, e);
      entries = [...entries, e];
      afterChange();
      host.toast(`Logged ${e.label}.`, () => {
        void deleteEntry(db, e.id)
          .then(() => {
            entries = entries.filter((x) => x.id !== e.id);
            afterChange();
            onUndone();
          })
          .catch(host.logError);
      });
    },
    /** Closes an open Fuel sheet (leaving the screen). */
    closeSheet: () => closeSheet(false),
  };
}
