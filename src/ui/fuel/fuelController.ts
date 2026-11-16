// M7 task 17 + F3: the Fuel wiring. Owns the nutrition data the screens show (loaded from the
// store, kept in memory, saved on every change) and the Fuel sub-views (tab, weigh-in, setup) and
// sheets (log, entry, my food, recipe). app.ts keeps one instance and asks it for the Fuel
// screen, the Settings → Nutrition block, the Summary protein line, Today's nudge and the coach's
// food data. All numbers come from core (targets, totals, weekly check, portions, search).
//
// Privacy: nutrition data stays in IndexedDB. Nothing here writes to the developer log. Fetches:
// the same-origin food list (foodDb, lazy, on the first search) and, only while barcode lookup
// is on, the Open Food Facts lookup with nothing but the barcode digits (offClient.ts).
//
// M7b photos: the photo is shrunk in memory (photoCapture), classified on the phone by the
// injected classifier (host.photo, food-vision), turned into options by `decide`, confirmed in
// the photo sheet and logged with `entryFromPhoto`. The photo is kept only when "Save photos to
// improve recognition" is on (`maybeSavePhoto`), labelled with the dish he confirmed; otherwise
// the canvas is dropped once the sheet closes. Photos and results never reach the developer log.
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
  rescaleEntry,
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
  FoodModelRecord,
  FoodVisionSettings,
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
import { CLASS_MAP } from '../../food-vision/classMap';
import { decide as decidePhoto, type ScoredLabel } from '../../food-vision/decide';
import { entryFromPhoto } from '../../core/nutrition/photo';
import { deletePhotos, getFoodVisionSettings, getModel, maybeSavePhoto } from '../../data/nutrition/photoStore';
import { foodDb } from '../../data/nutrition/foodDb';
import { lookupBarcode } from '../../data/nutrition/offClient';
import { EDIT_FROM_LABEL, SEED_FOODS, THAI_DISHES } from '../../data/nutrition/foods';
import {
  addFavorite,
  deleteEntry,
  deleteFood,
  deleteRecipe,
  entriesBetween,
  getBarcodeLookup,
  getNudgeShown,
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
  setNudgeShown,
} from '../../data/nutrition/store';
import { fuelScreen } from '../screens/fuel';
import type { TabId } from '../tabBar';
import { barcodeScanSheet, type ScanSheet } from './barcodeScan';
import { entrySheet } from './entrySheet';
import type { SummaryFuel } from './links';
import {
  logSheet,
  type LogChoice,
  type LogItem,
  type LogSection,
  type LogSheet,
  type QuickLog,
  type SearchState,
} from './logSheet';
import { myFoodEditor, type MyFoodDraft } from './myFoodEditor';
import { nutritionSettings, type MacroKey } from './nutritionSettings';
import { preparePhoto, type CapturedPhoto } from './photoCapture';
import { photoSheet, type PhotoChoice, type PhotoSheet } from './photoSheet';
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
  /** M7b: on-device photo logging. Omitted → the log sheet has no photo row. */
  photo?: FuelPhotoHost | undefined;
};

/** What the photo flow needs from food-vision (app.ts passes the real classifier). */
export type FuelPhotoHost = {
  /** The shared classifier for this stored model (food-vision `loadFoodClassifier`). */
  load: (model: FoodModelRecord) => Promise<{
    classify: (image: HTMLCanvasElement) => { categories: readonly ScoredLabel[] };
  }>;
  /** Frees the loaded classifier (model removed or replaced; food-vision `disposeFoodClassifier`). */
  dispose: () => void;
  /** Test seam. Default: photoCapture `preparePhoto`. */
  prepare?: ((file: Blob, opts: { keepBlob: boolean }) => Promise<CapturedPhoto>) | undefined;
};

/** A photo still in memory while its dish is being picked (search after a photo). */
type PendingPhoto = { photo: CapturedPhoto; takenAt: number };

type Sub = { kind: 'main' } | { kind: 'weighIn' } | { kind: 'setup'; back: 'fuel' | 'settings' };

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
  /** M7b: the imported food model (null: none) and the save-photos setting. */
  let photoModel: FoodModelRecord | null = null;
  let photoSettings: FoodVisionSettings = { savePhotos: false };
  /** Bumps on every new photo and on close, so a slow classify can't fill a newer sheet. */
  let photoSeq = 0;
  let sub: Sub = { kind: 'main' };
  let sheet: HTMLElement | null = null;
  /** Cleanup for the open sheet (the scanner stops its camera). */
  let sheetDispose: (() => void) | null = null;
  /** The open sheet when it is the log sheet (Undo re-renders it). */
  let logEl: LogSheet | null = null;
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

  /**
   * Local writes: `gen` moves when one starts and when it settles, `pending` holds those still
   * running. A refresh whose read overlapped a write reads again, so it never puts back rows from
   * before the write (or drops a row the write added).
   */
  let gen = 0;
  const pending = new Set<Promise<unknown>>();
  function track<T>(p: Promise<T>): Promise<T> {
    gen++;
    pending.add(p);
    const done = () => {
      pending.delete(p);
      gen++;
    };
    p.then(done, done);
    return p;
  }

  /**
   * Reads everything; null when a local write overlapped the read (the caller reads again),
   * unless `force` (first load: something beats nothing).
   */
  async function read(force = false) {
    const t = host.now();
    const d = foodDate(t);
    const startGen = gen;
    const rows = await Promise.all([
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
      getNudgeShown(db),
      host.photo ? getModel(db) : Promise.resolve(undefined),
      getFoodVisionSettings(db),
    ]);
    return force || (startGen === gen && pending.size === 0) ? rows : null;
  }

  const MAX_READS = 5;

  async function load(): Promise<void> {
    let rows: Awaited<ReturnType<typeof read>> = null;
    for (let i = 0; i < MAX_READS && rows === null; i++) {
      if (pending.size) await Promise.allSettled([...pending]);
      rows = await read(i === MAX_READS - 1 && !loaded);
    }
    // Writes kept landing (very unlikely): keep the in-memory copy, which already has them.
    if (rows === null) return;
    const [s, m, bc, w, e, f, r, fav, c, sess, shown, model, fv] = rows;
    setPhotoModel(model ?? null);
    photoSettings = fv;
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
    nudgeShownDate = shown;
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
      if (await track(seedOnce(db, SEED_FOODS, host.now()))) {
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
    void track(setNudgeShown(db, d)).catch(host.logError);
  }

  function dismissNudge(): void {
    nudge = null;
    nudgeShownDate = today();
    void track(setNudgeShown(db, nudgeShownDate)).catch(host.logError);
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
    await track(saveFood(db, f));
    foods = [...foods, f];
  }

  // ---------- sheets ----------

  function openSheet(el: HTMLElement, dispose?: () => void): void {
    closeSheet(false);
    sheet = el;
    sheetDispose = dispose ?? null;
    host.root.inert = true;
    document.body.append(el);
    el.focus();
  }

  const LOG_OPEN = '[data-log-open]';
  const entryEditSel = (id: string) => `[data-entry-edit="${id}"]`;

  /** Focus `sel` on the current screen, else its Log button (never left on <body>). */
  function focusOn(sel: string): void {
    const root = host.root;
    if (sheet || typeof root.querySelector !== 'function') return;
    (root.querySelector<HTMLElement>(sel) ?? root.querySelector<HTMLElement>(LOG_OPEN))?.focus();
  }

  /** `refocus`: where focus goes once the sheet is gone (false: the caller decides). */
  function closeSheet(refocus: string | false = LOG_OPEN): void {
    window.clearTimeout(searchTimer);
    searchSeq++;
    photoSeq++;
    if (!sheet) return;
    sheetDispose?.();
    sheetDispose = null;
    logEl = null;
    sheet.remove();
    sheet = null;
    host.root.inert = false;
    if (refocus) focusOn(refocus);
  }

  /**
   * Data changed: re-render. `focus` (after a sheet action) puts focus back on that control of
   * the re-rendered screen; the old element is gone with the render.
   */
  function afterChange(focus?: string): void {
    index = null;
    evaluateNudge();
    host.render();
    if (focus) focusOn(focus);
  }

  /** Undo changed what an open log sheet lists: draw it again on the same section. */
  function reopenLog(): void {
    if (logEl && sheet === logEl) openLog(logEl.section());
  }

  async function addEntry(e: FoodEntry): Promise<void> {
    await track(saveEntry(db, e));
    entries = [...entries, e];
    afterChange(LOG_OPEN);
    host.toast(`Logged ${e.label}.`, () => void removeEntry(e, false));
  }

  async function removeEntry(e: FoodEntry, undoable: boolean, focus?: string): Promise<void> {
    await track(deleteEntry(db, e.id));
    entries = entries.filter((x) => x.id !== e.id);
    afterChange(focus);
    if (undoable)
      host.toast(`Deleted ${e.label}.`, () => {
        void track(restoreEntry(db, e))
          .then(() => {
            entries = [...entries.filter((x) => x.id !== e.id), e];
            afterChange();
          })
          .catch(host.logError);
      });
  }

  /**
   * `pending`: a photo whose dish is being found through search (M7b). It lives only in this
   * sheet's callbacks, so it is dropped with the sheet.
   */
  function openLog(section?: LogSection, detail?: LogItem, pending?: PendingPhoto): void {
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
          initialDetail: detail,
          scan: barcode,
          photoAvailable: photoModel !== null,
        },
        {
          onLog: (c) => void logChoice(c, pending).catch(host.logError),
          onQuickLog: (q) => void quickLog(q).catch(host.logError),
          onSearch: (q) => runSearch(q, el),
          onNewRecipe: () => openRecipeEditor(null),
          onNewFood: () => openFoodEditor(null, false),
          onEditItem: (item) => editItem(item),
          onScan: (from) => openScan(from),
          onPhoto: host.photo ? (file) => void photoFlow(file).catch(host.logError) : undefined,
          onClose: () => closeSheet(),
        },
      );
      openSheet(el);
      logEl = el;
    });
  }

  // ---------- M7b food photos ----------

  /** A new or removed model frees the old classifier (it is reloaded on the next photo). */
  function setPhotoModel(next: FoodModelRecord | null): void {
    const changed =
      (photoModel === null) !== (next === null) ||
      (photoModel !== null && next !== null && photoModel.importedAt !== next.importedAt);
    if (changed && photoModel !== null) host.photo?.dispose();
    photoModel = next;
  }

  /** Photo → in-memory canvas → photo sheet ("Looking…") → classify → decide → result. */
  async function photoFlow(file: File): Promise<void> {
    const ph = host.photo;
    const model = photoModel;
    if (!ph || !model) return;
    const seq = ++photoSeq;
    const takenAt = host.now();
    const slot = slotFor(takenAt, lastSessionEnd());
    let captured: CapturedPhoto | null;
    try {
      captured = await (ph.prepare ?? preparePhoto)(file, { keepBlob: photoSettings.savePhotos });
    } catch {
      captured = null;
    }
    if (seq !== photoSeq) return; // another photo or a closed sheet meanwhile
    const pending: PendingPhoto | undefined = captured ? { photo: captured, takenAt } : undefined;
    const el: PhotoSheet = photoSheet(
      {
        mode,
        slot,
        dishes: thaiItems(),
        state: captured ? { status: 'looking' } : { status: 'error' },
        photo: captured?.canvas,
      },
      {
        onLog: (c) => void logPhoto(c, pending).catch(host.logError),
        // The photo goes along to search: a Thai dish picked there is still labelled with it.
        onSearch: () => openLog('search', undefined, pending),
        onCancel: () => closeSheet(),
      },
    );
    openSheet(el);
    photoSeq = seq; // openSheet's closeSheet bumped it; this sheet is the current photo
    if (!captured) return;
    let state: Parameters<PhotoSheet['setState']>[0];
    try {
      const classifier = await ph.load(model);
      if (seq !== photoSeq || sheet !== el) return;
      const { categories } = classifier.classify(captured.canvas);
      state = { status: 'result', decision: decidePhoto(categories, CLASS_MAP, { claudeAvailable: false }) };
    } catch (err) {
      // Not host.logError: nothing about photos goes to the developer log. The sheet says it.
      console.warn('Food photo: classify failed', err);
      state = { status: 'error' };
    }
    if (seq !== photoSeq || sheet !== el) return;
    el.setState(state);
  }

  async function logPhoto(c: PhotoChoice, pending: PendingPhoto | undefined): Promise<void> {
    const dish = foodMap().get(c.dishId);
    const e = dish ? entryFromPhoto(dish, c.portion.label, c.confidence, entryOpts(c.slot)) : null;
    if (!e) return;
    closeSheet();
    await addPhotoEntry(e, c.dishId, pending);
  }

  /**
   * Saves the entry, then (save-photos on only) the photo labelled with the dish. Undo removes
   * both. The in-memory photo is dropped either way once this returns.
   */
  async function addPhotoEntry(e: FoodEntry, dishId: string, pending: PendingPhoto | undefined): Promise<void> {
    await track(saveEntry(db, e));
    entries = [...entries, e];
    let savedId: string | null = null;
    const blob = pending?.photo.blob;
    if (pending && blob) {
      const id = uid('photo');
      const photo = { id, dishId, createdAt: pending.takenAt, w: pending.photo.w, h: pending.photo.h, blob };
      const saved = await track(maybeSavePhoto(db, photoSettings, photo)).catch((err: unknown) => {
        host.logError(err);
        return false;
      });
      if (saved) savedId = id;
    }
    afterChange(LOG_OPEN);
    host.toast(`Logged ${e.label}.`, () => {
      void removeEntry(e, false).catch(host.logError);
      if (savedId) void track(deletePhotos(db, [savedId])).catch(host.logError);
    });
  }

  // ---------- barcode (M7-q5, only while the lookup is on) ----------

  function openScan(back: LogSection): void {
    const el: ScanSheet = barcodeScanSheet({
      onCode: (code) => void scanLookup(el, code).catch(host.logError),
      onAddFood: (code) => openFoodEditor(null, false, { barcode: code }),
      onClose: () => openLog(back),
    });
    openSheet(el, () => el.dispose());
  }

  /** Lookup → found: its detail to log (saved to My foods, Undo) / missing: add it / a message. */
  async function scanLookup(el: ScanSheet, code: string): Promise<void> {
    el.setStatus({ kind: 'looking', code });
    const r = await track(lookupBarcode(db, code));
    if (sheet !== el) return; // closed while looking
    switch (r.status) {
      case 'found': {
        const f = r.food;
        foods = [...foods.filter((x) => x.id !== f.id), f];
        index = null;
        openLog('myFoods', foodItem(f, `food:${f.id}`, f.note ? { note: f.note } : {}));
        if (r.from === 'online') host.toast(`Saved ${f.name} to My foods.`, () => void unsaveFood(f));
        return;
      }
      case 'notFound':
      case 'incomplete':
        el.setStatus({ kind: 'missing', code, reason: r.status });
        return;
      case 'off':
        el.setStatus({ kind: 'off' });
        return;
      case 'error':
        el.setStatus({ kind: 'error', reason: r.reason });
        return;
      case 'invalid':
        el.setStatus({ kind: 'invalid' });
        return;
    }
  }

  /** Undo of a barcode save: the food leaves My foods (entries already logged keep their numbers). */
  async function unsaveFood(f: Food): Promise<void> {
    await track(deleteFood(db, f.id));
    foods = foods.filter((x) => x.id !== f.id);
    index = null;
    reopenLog();
    host.render();
  }

  async function logChoice(c: LogChoice, pending?: PendingPhoto): Promise<void> {
    const opts = entryOpts(c.slot);
    let e: FoodEntry | null = null;
    const { foodId, recipeId } = c.item.ref;
    // After a photo (None of these → search): a Thai dish keeps the photo source, no confidence.
    const dish = pending && foodId !== undefined ? foodMap().get(foodId) : undefined;
    const photoE =
      dish && c.portion && 'servings' in c.amount && c.amount.servings === 1
        ? entryFromPhoto(dish, c.portion.label, undefined, opts)
        : null;
    if (photoE && foodId !== undefined) {
      closeSheet();
      await addPhotoEntry(photoE, foodId, pending);
      return;
    }
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
      await track(saveFood(db, f));
      const fav: Favorite = { id: `fav:${f.id}`, ref: { foodId: f.id }, amount: { servings: 1 }, createdAt: host.now() };
      await track(addFavorite(db, fav));
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
    // Core rescaleEntry scales from the entry's as-logged macros/amount, so edits never drift.
    const preview = (a: FoodAmount): MacroSet => macrosOf(rescaleEntry(e, a) ?? e);
    openSheet(
      entrySheet(
        { entry: e, mode, preview },
        {
          onSave: ({ amount, slot }) => {
            const next: FoodEntry = { ...(rescaleEntry(e, amount) ?? e), slot };
            closeSheet(entryEditSel(e.id));
            void track(saveEntry(db, next))
              .then(() => {
                entries = entries.map((x) => (x.id === e.id ? next : x));
                afterChange(entryEditSel(e.id));
              })
              .catch(host.logError);
          },
          onDelete: () => {
            closeSheet();
            void removeEntry(e, true, LOG_OPEN).catch(host.logError);
          },
          onClose: () => closeSheet(entryEditSel(e.id)),
        },
      ),
    );
  }

  function openFoodEditor(existing: Food | null, labelPrompt: boolean, opts: { barcode?: string } = {}): void {
    const draft: MyFoodDraft = existing
      ? { ...macrosOf(existing), id: existing.id, name: existing.name, nameTh: existing.nameTh, basis: existing.basis }
      : { kcal: 0, proteinG: 0, name: '', basis: { servingLabel: '' }, barcode: opts.barcode };
    const back = () =>
      openLog((existing && !labelPrompt) || opts.barcode ? 'myFoods' : 'favorites');
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
            // A cleared carbs / fat field drops the stored value.
            if (d.carbsG !== undefined) f.carbsG = d.carbsG;
            else delete f.carbsG;
            if (d.fatG !== undefined) f.fatG = d.fatG;
            else delete f.fatG;
            if (!existing && d.barcode) f.barcode = d.barcode;
            // The seed placeholder now has the label's numbers: no longer an estimate.
            if (EDIT_FROM_LABEL.has(f.id)) {
              delete f.estimate;
              delete f.note;
            }
            void track(saveFood(db, f))
              .then(() => {
                foods = [...foods.filter((x) => x.id !== f.id), f];
                index = null;
                // A scanned product: straight to its detail, ready to log.
                if (!existing && f.barcode) openLog('myFoods', foodItem(f, `food:${f.id}`));
                else back();
                host.render();
                // A scanned product added by hand: Undo takes it out of My foods again.
                if (!existing && f.barcode) host.toast(`Saved ${f.name} to My foods.`, () => void unsaveFood(f));
              })
              .catch(host.logError);
          },
          onCancel: back,
          onDelete:
            existing && foods.some((x) => x.id === existing.id)
              ? () => {
                  void track(deleteFood(db, existing.id))
                    .then((row) => {
                      foods = foods.filter((x) => x.id !== existing.id);
                      index = null;
                      openLog('myFoods');
                      if (row)
                        host.toast(`Deleted ${row.name}.`, () => {
                          void track(saveFood(db, row))
                            .then(() => {
                              foods = [...foods, row];
                              index = null;
                              reopenLog();
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
            await track(saveRecipe(db, r));
            recipes = [...recipes.filter((x) => x.id !== r.id), r];
            index = null;
            back();
          })().catch(host.logError);
        },
        onCancel: back,
        onDelete: existing
          ? () => {
              void track(deleteRecipe(db, existing.id))
                .then((row) => {
                  recipes = recipes.filter((x) => x.id !== existing.id);
                  index = null;
                  back();
                  if (row)
                    host.toast(`Deleted ${row.name}.`, () => {
                      void track(saveRecipe(db, row))
                        .then(() => {
                          recipes = [...recipes, row];
                          index = null;
                          reopenLog();
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
        onDeleteEntry: (e) => void removeEntry(e, true, LOG_OPEN).catch(host.logError),
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
          void track(saveWeighIn(db, w))
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
    // One tracked write for both, so a refresh can't land between them with the old check.
    void track(
      (async () => {
        if (next !== prev) await saveNutritionSettings(db, next);
        await saveWeeklyCheck(db, decided);
      })(),
    ).catch(host.logError);
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
    // Build on what is stored, not the in-memory copy: mode and the barcode switch may have been
    // set (before setup, or while it was open), and the in-memory copy may be older.
    const [stored, storedMode, storedBarcode] = await Promise.all([
      getNutritionSettings(db),
      getNutritionMode(db),
      getBarcodeLookup(db),
    ]);
    const body = { heightCm: v.heightCm, birthYear: v.birthYear, sex: v.sex, activity: v.activity };
    const next: NutritionSettings = stored
      ? { ...stored, ...body, mode: storedMode, barcodeLookup: storedBarcode }
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
    await track(saveNutritionSettings(db, next));
    await track(saveWeighIn(db, w));
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
    void track(saveNutritionSettings(db, next)).catch(host.logError);
    afterChange();
  }

  function settingsBlock(): HTMLElement {
    return nutritionSettings(
      { settings, barcodeLookup: barcode, targets: targets() },
      {
        onMode: (m) => {
          mode = m;
          if (settings) settings = { ...settings, mode: m };
          void track(setMode(db, m)).catch(host.logError);
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
          void track(setBarcodeLookup(db, on)).catch(host.logError);
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
      await track(saveEntry(db, e));
      entries = [...entries, e];
      afterChange();
      host.toast(`Logged ${e.label}.`, () => {
        void track(deleteEntry(db, e.id))
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
    /**
     * M7b: Settings → Food photos saved a change (model imported / replaced / removed, Undo, or
     * the save-photos switch). A new or removed model frees the loaded classifier.
     */
    setPhoto(next: { model?: FoodModelRecord | null; settings?: FoodVisionSettings }): void {
      if (next.model !== undefined) setPhotoModel(next.model);
      if (next.settings !== undefined) photoSettings = { savePhotos: next.settings.savePhotos };
    },
  };
}
