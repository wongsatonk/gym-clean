// The Fuel controller against a real (fake-indexeddb) database and the fake DOM: setup merge,
// weekly Accept, Undo of log / delete, the once-a-day nudge, refresh vs. writes, focus after a
// sheet, the barcode wiring. Made-up numbers only.
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { weekStartOf } from '../../core/nutrition/adjust';
import { NUTRITION_DEFAULTS } from '../../core/nutrition/targets';
import type {
  FoodModelRecord,
  FoodSuggestion,
  NutritionSettings,
  WeeklyCheck,
} from '../../core/types';
import type { ScoredLabel } from '../../food-vision/decide';
import {
  countPhotos,
  listPhotos,
  saveModel,
  setFoodVisionSettings,
} from '../../data/nutrition/photoStore';
import { foodDate as localDate } from '../../core/nutrition/day';
import { GymDb } from '../../data/db';
import {
  entriesBetween,
  getFood,
  getNutritionSettings,
  listWeeklyChecks,
  saveFood,
  saveEntry,
  saveNutritionSettings,
  saveWeeklyCheck,
  saveWeighIn,
  setBarcodeLookup,
  setMode,
} from '../../data/nutrition/store';
import { saveMeasurement } from '../../data/trainerKit/store';
import type { TabId } from '../tabBar';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import {
  createFuel,
  type FuelController,
  type FuelHealthHost,
  type FuelHost,
  type FuelPhotoHost,
} from './fuelController';

useFakeDom();

// ---------- fake DOM extras the controller needs ----------

/** `[attr]` / `[attr="v"]` only: enough for the controller's focus targets. */
function select(root: FakeEl, sel: string): FakeEl | null {
  const m = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(sel);
  if (!m) throw new Error(`unsupported selector ${sel}`);
  const [, attr = '', value] = m;
  return (
    root.find(
      (e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value),
    )[0] ?? null
  );
}

let body: FakeEl;
const proto = FakeEl.prototype as unknown as { remove?: () => void };
beforeAll(() => {
  proto.remove = function (this: FakeEl) {
    body.children = body.children.filter((c) => c !== this);
  };
  (globalThis as { window?: unknown }).window ??= globalThis;
});
afterAll(() => {
  delete proto.remove;
});
beforeEach(() => {
  body = new FakeEl('body');
  Object.assign((globalThis as unknown as { document: object }).document, {
    body,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

// ---------- fixture ----------

// A Wednesday evening, after the 19:00 nudge hour.
const EVENING = new Date(2026, 10, 18, 20, 0).getTime();
const DAY = 86_400_000;

const SETTINGS: NutritionSettings = {
  ...NUTRITION_DEFAULTS,
  gainPctPerWeek: [0.25, 0.5],
  heightCm: 175,
  birthYear: 1994,
  sex: 'male',
  activity: 'moderate',
};

type Toast = { text: string; onUndo: () => void };

let db: GymDb;
let n = 0;
beforeEach(async () => {
  vi.stubGlobal('scrollTo', () => undefined); // M13d: every Set up Fuel open scrolls to the top
  db = new GymDb(`fuel-ctrl-${n++}`);
  await db.open();
});
afterEach(async () => {
  await flush(); // M13d: a Set up Fuel open finishes its load / Health read before the db closes
  vi.unstubAllGlobals();
  db.close();
  await db.delete();
});

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

function makeApp(
  now = EVENING,
  photo?: FuelPhotoHost,
  health?: FuelHealthHost,
  more: Pick<FuelHost, 'healthProfile' | 'lengthUnit' | 'trainerKit'> = {},
) {
  const root = new FakeEl('main');
  (root as unknown as { querySelector: (s: string) => FakeEl | null }).querySelector = (s) =>
    select(root, s);
  let view: 'fuel' | 'settings' | 'other' = 'other';
  const toasts: Toast[] = [];
  const tabs: TabId[] = [];
  const clock = { now };
  /** Host calls: which view the controller asked the app for. */
  const calls = { render: 0, showFuel: 0, showSettings: 0 };
  // eslint-disable-next-line prefer-const
  let ctrl: FuelController;
  const render = () => {
    calls.render++;
    if (view === 'fuel') root.replaceChildren(asFake(ctrl.screen()));
    else if (view === 'settings') root.replaceChildren(asFake(ctrl.settingsBlock()));
  };
  ctrl = createFuel({
    db,
    root: root as unknown as HTMLElement,
    now: () => clock.now,
    unit: () => 'kg',
    render,
    showFuel: () => {
      calls.showFuel++;
      view = 'fuel';
      render();
    },
    showSettings: () => {
      calls.showSettings++;
      view = 'settings';
      render();
    },
    goTab: (t) => tabs.push(t),
    toast: (text, onUndo) => toasts.push({ text, onUndo }),
    logError: (err) => {
      throw err;
    },
    photo,
    health,
    ...more,
  });
  const openFuel = async () => {
    await ctrl.open();
    view = 'fuel';
    render();
  };
  const sheet = (): FakeEl | undefined => body.children.at(-1);
  const inSheet = (attr: string, value?: string): FakeEl => {
    const s = sheet();
    if (!s) throw new Error('no sheet');
    const hit = s.find(
      (e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value),
    )[0];
    if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}] in the sheet`);
    return hit;
  };
  const onScreen = (attr: string, value?: string): FakeEl => {
    const hit = root.find(
      (e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value),
    )[0];
    if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}] on screen`);
    return hit;
  };
  const type = (el: FakeEl, v: string) => {
    (el as unknown as { value: string }).value = v;
    el.dispatch('input', {});
  };
  const showSettings = () => {
    view = 'settings';
    render();
  };
  /** M13c 12b: Fuel on a given day (what the app does after `openDay`). */
  const openDay = async (date: string) => {
    await ctrl.openDay(date);
    view = 'fuel';
    render();
  };
  return {
    ctrl,
    root,
    calls,
    toasts,
    tabs,
    clock,
    openFuel,
    sheet,
    inSheet,
    onScreen,
    type,
    showSettings,
    openDay,
  };
}

const active = () =>
  (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement;

async function setUp(over: Partial<NutritionSettings> = {}) {
  await saveNutritionSettings(db, { ...SETTINGS, ...over });
  await saveWeighIn(db, { date: localDate(EVENING - 3 * DAY), kg: 70 });
}

/** Opens the log sheet and logs a quick estimate. */
async function quickLog(app: ReturnType<typeof makeApp>, kcal: string, protein: string) {
  app.onScreen('data-log-open').click();
  await flush();
  app.inSheet('data-log-section', 'quick').click();
  app.type(app.inSheet('id', 'quick-kcal'), kcal);
  app.type(app.inSheet('id', 'quick-protein'), protein);
  app.inSheet('data-quick-log').click();
  await flush();
}

describe('setup', () => {
  it('builds on the stored settings, not the in-memory copy', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    // Written elsewhere after the controller loaded: a newer surplus, Full mode, barcode on.
    await saveNutritionSettings(db, { ...SETTINGS, surplusKcal: 450 });
    await setMode(db, 'full');
    await setBarcodeLookup(db, true);

    app.showSettings();
    app.onScreen('data-setup-rerun').click();
    app.onScreen('data-setup-save').click();
    await flush();

    const s = await getNutritionSettings(db);
    expect(s).toMatchObject({ surplusKcal: 450, mode: 'full', barcodeLookup: true, heightCm: 175 });
  });
});

describe('setupForGoal (M12 1b; M13d task 3: onLeave / inFlow)', () => {
  let scrolls: [number, number][];
  beforeEach(() => {
    scrolls = [];
    vi.stubGlobal('scrollTo', (x: number, y: number) => scrolls.push([x, y]));
  });

  /** Picks sex + activity on the setup screen (Save waits for both). */
  const pickBoth = (app: ReturnType<typeof makeApp>) => {
    app.onScreen('data-choice', 'female').click();
    app.onScreen('data-choice', 'moderate').click();
  };
  const back = (app: ReturnType<typeof makeApp>) => app.root.oneByClass('fuel-back');

  it('without opts (unchanged): Save stores the goal and lands on the Fuel tab', async () => {
    const app = makeApp();
    app.ctrl.setupForGoal('fat');
    expect(app.calls.showFuel).toBe(1);
    expect(app.onScreen('data-screen').getAttribute('data-screen')).toBe('fuel-setup');
    expect(app.root.find((e) => e.hasAttribute('data-onboarding-step'))).toHaveLength(0);
    // M13d (t): opened at the top too (the intake summary's scroll doesn't carry over).
    expect(scrolls).toEqual([[0, 0]]);
    pickBoth(app);
    app.onScreen('data-setup-save').click();
    await flush();
    expect(await getNutritionSettings(db)).toMatchObject({ goalKind: 'fat', sex: 'female' });
    expect(app.onScreen('data-screen').getAttribute('data-screen')).toBe('fuel');
  });

  it('without opts (unchanged): Back lands on the Fuel tab, nothing saved', async () => {
    const app = makeApp();
    app.ctrl.setupForGoal('fat');
    back(app).click();
    await flush();
    expect(app.onScreen('data-screen').getAttribute('data-screen')).toBe('fuel');
    expect(await getNutritionSettings(db)).toBeNull();
  });

  it('onLeave: Save writes the targets and weigh-in first, then calls onLeave("saved") once', async () => {
    const app = makeApp();
    const left: { how: string; stored: unknown; weighIns: number }[] = [];
    app.ctrl.setupForGoal('fat', {
      onLeave: (how) => {
        // Read synchronously what the writes left behind (they finished before this call).
        void Promise.all([getNutritionSettings(db), db.weighIns.count()]).then(([s, w]) =>
          left.push({ how, stored: s, weighIns: w }),
        );
      },
    });
    pickBoth(app);
    const after = { ...app.calls };
    app.onScreen('data-setup-save').click();
    await flush();
    expect(left).toEqual([
      { how: 'saved', stored: expect.objectContaining({ goalKind: 'fat' }), weighIns: 1 },
    ]);
    // Not the Fuel tab, not Settings: the caller decides where to go.
    expect(app.calls).toEqual(after);
    // The controller is back on its main view for the next time Fuel opens.
    expect(asFake(app.ctrl.screen()).getAttribute('data-screen')).toBe('fuel');
  });

  it('onLeave: a second Save tap while saving leaves once and saves once', async () => {
    const app = makeApp();
    const how: string[] = [];
    app.ctrl.setupForGoal('muscle', { onLeave: (h) => how.push(h) });
    pickBoth(app);
    const save = app.onScreen('data-setup-save');
    save.click();
    save.click();
    await flush();
    expect(how).toEqual(['saved']);
    expect(await db.weighIns.count()).toBe(1);
  });

  it('onLeave: Back calls onLeave("back"), saves nothing and forgets the goal', async () => {
    const app = makeApp();
    const how: string[] = [];
    app.ctrl.setupForGoal('fat', { onLeave: (h) => how.push(h) });
    const after = { ...app.calls };
    back(app).click();
    back(app).click(); // a double tap leaves once
    await flush();
    expect(how).toEqual(['back']);
    expect(app.calls).toEqual(after);
    expect(await getNutritionSettings(db)).toBeNull();
    expect(asFake(app.ctrl.screen()).getAttribute('data-screen')).toBe('fuel');

    // A later setup from Settings saves without the dropped goal.
    await app.ctrl.open();
    app.showSettings();
    app.onScreen('data-setup-rerun').click();
    pickBoth(app);
    app.onScreen('data-setup-save').click();
    await flush();
    expect((await getNutritionSettings(db))?.goalKind).toBeUndefined();
  });

  it('inFlow: marked as the flow step, no tab bar, opened at the top', () => {
    const app = makeApp();
    app.ctrl.setupForGoal('fat', { onLeave: () => undefined, inFlow: true });
    const main = app.onScreen('data-screen', 'fuel-setup');
    expect(main.getAttribute('data-onboarding-step')).toBe('fuelSetup');
    expect(app.root.find((e) => e.hasAttribute('data-tabbar'))).toHaveLength(0);
    expect(scrolls).toEqual([[0, 0]]);
    // Its own Back (accessible name "Back") and Save stay.
    expect(back(app).textContent).toBe('Back');
    expect(app.onScreen('data-setup-save')).toBeTruthy();
    // A re-render (data arriving) keeps the marker.
    expect(asFake(app.ctrl.screen()).getAttribute('data-onboarding-step')).toBe('fuelSetup');
  });

  it('onLeave without inFlow: not marked as a flow step, no Not now; opened at the top', () => {
    const app = makeApp();
    app.ctrl.setupForGoal('fat', { onLeave: () => undefined });
    expect(app.onScreen('data-screen', 'fuel-setup').hasAttribute('data-onboarding-step')).toBe(
      false,
    );
    expect(app.root.find((e) => e.hasAttribute('data-setup-not-now'))).toHaveLength(0);
    expect(scrolls).toEqual([[0, 0]]);
  });

  it('M13d 3b: in the flow, Not now leaves with "skip" once and saves nothing', async () => {
    await setUp();
    const before = await getNutritionSettings(db);
    const app = makeApp();
    const how: string[] = [];
    app.ctrl.setupForGoal('fat', { onLeave: (h) => how.push(h), inFlow: true });
    const after = { ...app.calls };
    const notNow = app.onScreen('data-setup-not-now');
    expect(notNow.textContent).toBe('Not now');
    notNow.click();
    notNow.click();
    app.onScreen('data-setup-save').click(); // too late: already left
    await flush();
    expect(how).toEqual(['skip']);
    expect(app.calls).toEqual(after);
    expect(await getNutritionSettings(db)).toEqual(before);
    expect(await db.weighIns.count()).toBe(1);
    expect(asFake(app.ctrl.screen()).getAttribute('data-screen')).toBe('fuel');
  });

  it('without opts or from Settings: no Not now', async () => {
    await setUp();
    const app = makeApp();
    app.ctrl.setupForGoal('fat');
    expect(app.root.find((e) => e.hasAttribute('data-setup-not-now'))).toHaveLength(0);
  });

  it('after leaving the flow step, Settings → Re-run setup is the normal screen again', async () => {
    await setUp();
    const app = makeApp();
    app.ctrl.setupForGoal('fat', { onLeave: () => undefined, inFlow: true });
    back(app).click();
    await app.ctrl.open();
    app.showSettings();
    app.onScreen('data-setup-rerun').click();
    expect(app.onScreen('data-screen', 'fuel-setup').hasAttribute('data-onboarding-step')).toBe(
      false,
    );
    back(app).click();
    expect(app.calls.showSettings).toBe(1); // the normal Back: to Settings
  });
});

describe('weekly check', () => {
  it('Accept applies the change once and records the answer', async () => {
    await setUp();
    const pending: WeeklyCheck = {
      weekStart: weekStartOf(localDate(EVENING)),
      avgKg: 70,
      prevAvgKg: 70,
      ratePct: 0,
      kind: 'up',
      deltaKcal: 100,
      outcome: 'pending',
    };
    await saveWeeklyCheck(db, pending);
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-weigh-in').click();
    app.onScreen('data-weekly-accept').click();
    await flush();
    expect((await getNutritionSettings(db))?.surplusKcal).toBe(400);
    const [check] = await listWeeklyChecks(db);
    expect(check?.outcome).toBe('accepted');
    // A second load doesn't apply it again.
    const again = makeApp();
    await again.openFuel();
    expect((await getNutritionSettings(db))?.surplusKcal).toBe(400);
  });
});

describe('log and delete with Undo', () => {
  it('Undo of a log removes the entry; focus lands on the new Log button', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    await quickLog(app, '500', '30');
    const today = localDate(EVENING);
    expect(await entriesBetween(db, today, today)).toHaveLength(1);
    expect(app.sheet()).toBeUndefined();
    expect(active()).toBe(app.onScreen('data-log-open')); // the re-rendered one, not <body>
    expect(app.toasts.at(-1)?.text).toMatch(/^Logged /);
    app.toasts.at(-1)?.onUndo();
    await flush();
    expect(await entriesBetween(db, today, today)).toHaveLength(0);
    expect(app.root.find((e) => e.hasAttribute('data-entry'))).toHaveLength(0);
  });

  it('Undo of a delete puts the entry back', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    await quickLog(app, '400', '20');
    const today = localDate(EVENING);
    const [e] = await entriesBetween(db, today, today);
    // M13 task 24: the row opens the sheet; Delete is there (no Delete block on the row).
    app.onScreen('data-entry-edit', e?.id).click();
    app.inSheet('data-entry-remove').click();
    await flush();
    expect(await entriesBetween(db, today, today)).toHaveLength(0);
    expect(app.toasts.at(-1)?.text).toMatch(/^Deleted /);
    app.toasts.at(-1)?.onUndo();
    await flush();
    expect(await entriesBetween(db, today, today)).toHaveLength(1);
    expect(app.onScreen('data-entry', e?.id)).toBeTruthy();
  });

  it('editing an entry returns focus to that entry', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    await quickLog(app, '400', '20');
    const today = localDate(EVENING);
    const [e] = await entriesBetween(db, today, today);
    app.onScreen('data-entry-edit', e?.id).click();
    app.inSheet('data-close').click();
    expect(active()).toBe(app.onScreen('data-entry-edit', e?.id));
  });

  it('Undo of a food delete re-renders the open log sheet with the food back', async () => {
    await setUp();
    await saveFood(db, {
      id: 'my:oats',
      name: 'Made-up oats',
      source: 'custom',
      basis: { per100g: true },
      kcal: 380,
      proteinG: 13,
      carbsG: 60,
      fatG: 7,
    });
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    app.inSheet('data-log-section', 'myFoods').click();
    app.inSheet('data-log-item', 'food:my:oats').click();
    app.inSheet('data-edit-item').click();
    app.inSheet('data-food-delete').click();
    await flush();
    expect(await getFood(db, 'my:oats')).toBeUndefined();
    expect(() => app.inSheet('data-log-item', 'food:my:oats')).toThrow();
    app.toasts.at(-1)?.onUndo();
    await flush();
    expect(await getFood(db, 'my:oats')).toBeTruthy();
    expect(app.inSheet('data-section-panel', 'myFoods')).toBeTruthy();
    expect(app.inSheet('data-log-item', 'food:my:oats')).toBeTruthy();
  });

  it('editing a food: a cleared carbs / fat field drops the stored value', async () => {
    await setUp({ mode: 'full' });
    await saveFood(db, {
      id: 'my:oats',
      name: 'Made-up oats',
      source: 'custom',
      basis: { per100g: true },
      kcal: 380,
      proteinG: 13,
      carbsG: 60,
      fatG: 7,
    });
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    app.inSheet('data-log-section', 'myFoods').click();
    app.inSheet('data-log-item', 'food:my:oats').click();
    app.inSheet('data-edit-item').click();
    app.type(app.inSheet('id', 'food-carbs'), '');
    app.type(app.inSheet('id', 'food-fat'), '');
    app.inSheet('data-food-save').click();
    await flush();
    const f = await getFood(db, 'my:oats');
    expect(f?.carbsG).toBeUndefined();
    expect(f?.fatG).toBeUndefined();
    expect(f?.kcal).toBe(380);
  });
});

describe('evening nudge', () => {
  it('shows at most once a day, dismissed or not', async () => {
    await setUp();
    const first = makeApp();
    await first.ctrl.refresh();
    expect(first.ctrl.nudgeText()).toMatch(/protein/i);
    // Another app start the same evening: not again.
    const second = makeApp();
    await second.ctrl.refresh();
    expect(second.ctrl.nudgeText()).toBeNull();
    // Next evening: back.
    const next = makeApp(EVENING + DAY);
    await next.ctrl.refresh();
    expect(next.ctrl.nudgeText()).toMatch(/protein/i);
    next.ctrl.dismissNudge();
    expect(next.ctrl.nudgeText()).toBeNull();
    const later = makeApp(EVENING + DAY + 3_600_000);
    await later.ctrl.refresh();
    expect(later.ctrl.nudgeText()).toBeNull();
  });
});

describe('refresh vs. writes', () => {
  it('a write made while a refresh is reading is kept', async () => {
    await setUp();
    const app = makeApp();
    await app.ctrl.refresh();
    const s: FoodSuggestion = {
      label: 'Made-up snack',
      ref: {},
      amount: { servings: 1 },
      macros: { kcal: 250, proteinG: 20 },
      why: 'test',
    };
    // The refresh reads the entries before the write lands, and resolves only after it.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const where = db.foodEntries.where.bind(db.foodEntries);
    let held = false;
    vi.spyOn(db.foodEntries, 'where').mockImplementation(((index: string) => {
      const real = where(index);
      if (held) return real;
      held = true;
      return {
        between: (...args: Parameters<typeof real.between>) => {
          const rows = real.between(...args).sortBy('time');
          return { sortBy: () => rows.then(async (r) => (await gate, r)) };
        },
      };
    }) as unknown as typeof db.foodEntries.where);
    const reading = app.ctrl.refresh();
    await flush(); // the entries are read (none yet); the refresh waits on the gate
    await app.ctrl.logSuggestion(s, () => undefined);
    expect(app.ctrl.coachFuel().totals.kcal).toBe(250);
    release();
    await reading;
    expect(held).toBe(true);
    expect(app.ctrl.coachFuel().totals.kcal).toBe(250);
    // Several overlapping refreshes and writes still end with every row.
    const r2 = app.ctrl.refresh();
    const w2 = app.ctrl.logSuggestion({ ...s, label: 'Made-up snack 2' }, () => undefined);
    const r3 = app.ctrl.refresh();
    await Promise.all([r2, w2, r3]);
    await app.ctrl.refresh();
    expect(app.ctrl.coachFuel().totals.kcal).toBe(500);
  });
});

describe('barcode', () => {
  const CODE = '4006381333931';

  it('off: no Scan button in the log sheet', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    app.inSheet('data-log-section', 'search').click();
    expect(() => app.inSheet('data-scan-open')).toThrow();
  });

  it('on: typed digits → found online → its detail to log, saved to My foods with Undo', async () => {
    await setUp({ barcodeLookup: true });
    type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
    const fetch = vi.fn<FetchFn>(
      async () =>
        new Response(
          JSON.stringify({
            status: 1,
            product: {
              product_name: 'Made-up oat drink',
              nutriments: { 'energy-kcal_100g': 46, proteins_100g: 1.1 },
            },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    app.inSheet('data-log-section', 'search').click();
    app.inSheet('data-scan-open').click();
    expect(app.sheet()?.hasAttribute('data-scan-sheet')).toBe(true);
    (app.inSheet('id', 'scan-digits') as unknown as { value: string }).value = CODE;
    app.inSheet('data-scan-lookup').click();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://world.openfoodfacts.org/api/v2/product/${CODE}.json`,
    );
    expect(app.inSheet('data-log-detail', `food:off:${CODE}`)).toBeTruthy();
    expect(app.inSheet('data-item-note').textContent).toMatch(/Open Food Facts/);
    expect(await getFood(db, `off:${CODE}`)).toBeTruthy();
    expect(app.toasts.at(-1)?.text).toBe('Saved Made-up oat drink to My foods.');
    app.toasts.at(-1)?.onUndo();
    await flush();
    expect(await getFood(db, `off:${CODE}`)).toBeUndefined();
  });

  it('on: not found → Add it to My foods with the barcode kept on the food', async () => {
    await setUp({ barcodeLookup: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 404 })),
    );
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    app.inSheet('data-log-section', 'myFoods').click();
    app.inSheet('data-scan-open').click();
    (app.inSheet('id', 'scan-digits') as unknown as { value: string }).value = CODE;
    app.inSheet('data-scan-lookup').click();
    await flush();
    expect(app.inSheet('data-scan-result').getAttribute('data-scan-result')).toBe('missing');
    app.inSheet('data-scan-add', CODE).click();
    expect(app.inSheet('data-food-barcode', CODE)).toBeTruthy();
    app.type(app.inSheet('id', 'food-name'), 'Made-up crackers');
    app.inSheet('data-basis', 'per100g').click();
    app.type(app.inSheet('id', 'food-kcal'), '420');
    app.type(app.inSheet('id', 'food-protein'), '9');
    app.inSheet('data-food-save').click();
    await flush();
    const saved = (await db.foods.toArray()).find((f) => f.name === 'Made-up crackers');
    expect(saved?.barcode).toBe(CODE);
    expect(app.toasts.at(-1)?.text).toBe('Saved Made-up crackers to My foods.');
  });
});

// ---------- M7b photo flow (task 16a) ----------

describe('photo flow (M7b)', () => {
  const MODEL: FoodModelRecord = {
    id: 'food',
    name: 'made-up.tflite',
    sizeBytes: 10,
    labels: ['pad_thai', 'som_tum'],
    importedAt: 1,
    blob: new Blob([new Uint8Array([1, 2, 3])]),
  };
  const CONFIDENT: ScoredLabel[] = [
    { categoryName: 'pad_thai', score: 0.82 },
    { categoryName: 'som_tum', score: 0.1 },
  ];
  const UNSURE: ScoredLabel[] = [
    { categoryName: 'pad_thai', score: 0.45 },
    { categoryName: 'som_tum', score: 0.3 },
  ];

  function fakePhoto(result: ScoredLabel[] | (() => never)) {
    const calls = { load: 0, dispose: 0, prepare: [] as boolean[] };
    const host: FuelPhotoHost = {
      load: () => {
        calls.load++;
        return Promise.resolve({
          classify: () => ({ categories: typeof result === 'function' ? result() : result }),
        });
      },
      dispose: () => calls.dispose++,
      prepare: (_file, { keepBlob }) => {
        calls.prepare.push(keepBlob);
        return Promise.resolve({
          canvas: new FakeEl('canvas') as unknown as HTMLCanvasElement,
          w: 4,
          h: 3,
          blob: keepBlob ? new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])]) : undefined,
        });
      },
    };
    return { host, calls };
  }

  async function takePhoto(app: ReturnType<typeof makeApp>) {
    app.onScreen('data-log-open').click();
    await flush();
    const input = app.inSheet('data-photo-input') as FakeEl & { files?: unknown };
    input.files = [{ name: 'meal.jpg' }];
    input.dispatch('change', {});
    await flush();
  }

  const todays = () => entriesBetween(db, localDate(EVENING), localDate(EVENING));

  it('no model: the log sheet shows the Settings hint, not the button', async () => {
    await setUp();
    const app = makeApp(EVENING, fakePhoto(CONFIDENT).host);
    await app.openFuel();
    app.onScreen('data-log-open').click();
    await flush();
    expect(app.inSheet('data-photo-hint').textContent).toMatch(/add a food model in Settings/);
    expect(() => app.inSheet('data-photo-open')).toThrow();
  });

  it('confident → Log at Regular in one tap: photo-local entry with confidence, nothing saved (off)', async () => {
    await setUp();
    await saveModel(db, MODEL);
    const { host, calls } = fakePhoto(CONFIDENT);
    const app = makeApp(EVENING, host);
    await app.openFuel();
    await takePhoto(app);
    expect(calls.prepare).toEqual([false]);
    expect(app.inSheet('data-photo-state').getAttribute('data-photo-state')).toBe('confident');
    app.inSheet('data-photo-log').click();
    await flush();
    const [e] = await todays();
    expect(e).toMatchObject({
      source: 'photo-local',
      estimate: true,
      photoConfidence: 0.82,
      ref: { foodId: 'thai:pad-thai-goong' },
    });
    expect(await countPhotos(db)).toBe(0);
    expect(app.toasts.at(-1)?.text).toMatch(/^Logged /);
    expect(app.sheet()).toBeUndefined();
  });

  it('save-photos on: 1 photo labelled with the confirmed dish; Undo removes entry and photo', async () => {
    await setUp();
    await saveModel(db, MODEL);
    await setFoodVisionSettings(db, { savePhotos: true });
    const { host, calls } = fakePhoto(CONFIDENT);
    const app = makeApp(EVENING, host);
    await app.openFuel();
    await takePhoto(app);
    expect(calls.prepare).toEqual([true]);
    app.inSheet('data-photo-variant', 'thai:pad-thai-gai').click();
    app.inSheet('data-portion', 'Large').click();
    app.inSheet('data-photo-log').click();
    await flush();
    const photos = await listPhotos(db);
    expect(photos.map((p) => p.dishId)).toEqual(['thai:pad-thai-gai']);
    expect(photos[0]?.createdAt).toBe(EVENING);
    const [e] = await todays();
    expect(e?.ref).toEqual({ foodId: 'thai:pad-thai-gai' });
    app.toasts.at(-1)?.onUndo();
    await flush();
    expect(await todays()).toHaveLength(0);
    expect(await countPhotos(db)).toBe(0);
  });

  it('unsure: nothing preselected, Log disabled until a pick', async () => {
    await setUp();
    await saveModel(db, MODEL);
    const app = makeApp(EVENING, fakePhoto(UNSURE).host);
    await app.openFuel();
    await takePhoto(app);
    expect(app.inSheet('data-photo-state').getAttribute('data-photo-state')).toBe('unsure');
    expect(app.inSheet('data-photo-log').getAttribute('disabled')).not.toBeNull();
    app.inSheet('data-photo-option', 'som_tum').click();
    app.inSheet('data-photo-log').click();
    await flush();
    const [e] = await todays();
    expect(e).toMatchObject({ source: 'photo-local', photoConfidence: 0.3 });
  });

  it('None of these → search → a Thai dish: photo source, no confidence, photo saved when on', async () => {
    await setUp();
    await saveModel(db, MODEL);
    await setFoodVisionSettings(db, { savePhotos: true });
    const app = makeApp(EVENING, fakePhoto(UNSURE).host);
    await app.openFuel();
    await takePhoto(app);
    app.inSheet('data-photo-search').click();
    await flush();
    expect(app.inSheet('data-section-panel').getAttribute('data-section-panel')).toBe('search');
    // Pick from the Thai list (search results use the same items).
    app.inSheet('data-log-section', 'thai').click();
    app.inSheet('data-log-item', 'thai:thai:tom-yum-goong').click();
    app.inSheet('data-log-confirm').click();
    await flush();
    const [e] = await todays();
    expect(e?.source).toBe('photo-local');
    expect(e?.photoConfidence).toBeUndefined();
    expect((await listPhotos(db)).map((p) => p.dishId)).toEqual(['thai:tom-yum-goong']);
  });

  it('cancel: nothing logged or saved; a classifier error shows the error state', async () => {
    await setUp();
    await saveModel(db, MODEL);
    await setFoodVisionSettings(db, { savePhotos: true });
    const app = makeApp(EVENING, fakePhoto(CONFIDENT).host);
    await app.openFuel();
    await takePhoto(app);
    app.inSheet('data-close').click();
    await flush();
    expect(app.sheet()).toBeUndefined();
    expect(await todays()).toHaveLength(0);
    expect(await countPhotos(db)).toBe(0);
  });

  it('a classifier that throws → the error state, Log by hand opens search', async () => {
    await setUp();
    await saveModel(db, MODEL);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const app = makeApp(
      EVENING,
      fakePhoto(() => {
        throw new Error('boom');
      }).host,
    );
    await app.openFuel();
    await takePhoto(app);
    expect(app.inSheet('data-photo-state').getAttribute('data-photo-state')).toBe('error');
    app.inSheet('data-photo-search').click();
    await flush();
    expect(app.inSheet('data-section-panel').getAttribute('data-section-panel')).toBe('search');
    warn.mockRestore();
  });

  it('model removed / replaced → classifier disposed; removed → hint again', async () => {
    await setUp();
    await saveModel(db, MODEL);
    const { host, calls } = fakePhoto(CONFIDENT);
    const app = makeApp(EVENING, host);
    await app.openFuel();
    app.ctrl.setPhoto({ model: { ...MODEL, importedAt: 2 } });
    expect(calls.dispose).toBe(1);
    app.ctrl.setPhoto({ model: { ...MODEL, importedAt: 2 } });
    expect(calls.dispose).toBe(1);
    app.ctrl.setPhoto({ model: null });
    expect(calls.dispose).toBe(2);
    app.onScreen('data-log-open').click();
    await flush();
    expect(() => app.inSheet('data-photo-hint')).not.toThrow();
  });
});

describe('M11 health pass-through', () => {
  it('an imported weigh-in carries the "from Health" tag on Fuel and on Weigh-in', async () => {
    await saveNutritionSettings(db, SETTINGS);
    // Put directly: the store's own `source` handling is core's (M11 task 7).
    await db.weighIns.put({ date: localDate(EVENING), kg: 70.2, source: 'health' });
    const app = makeApp();
    await app.openFuel();
    expect(app.onScreen('data-weigh-in').textContent).toContain('from Health');
    app.onScreen('data-weigh-in').click();
    expect(app.onScreen('data-weigh-today').textContent).toContain('from Health');
  });

  it('a typed weigh-in has no tag, before or after Save', async () => {
    await setUp();
    const app = makeApp();
    await app.openFuel();
    expect(app.root.find((e) => e.hasAttribute('data-from-health'))).toHaveLength(0);
    app.onScreen('data-weigh-in').click();
    app.onScreen('data-weigh-save').click();
    await flush();
    expect(app.onScreen('data-weigh-today').getAttribute('data-weigh-today')).toBe('saved');
    expect(app.root.find((e) => e.hasAttribute('data-from-health'))).toHaveLength(0);
  });

  it('activity line: Keep reports and changes nothing; Switch sets the level with Undo', async () => {
    await setUp({ activity: 'light' });
    const answers: [string, string][] = [];
    let suggest: NutritionSettings['activity'] | null = 'moderate';
    const health: FuelHealthHost = {
      activitySuggestion: () => suggest,
      onActivityAnswered: (a, level) => {
        answers.push([a, level]);
        suggest = null;
      },
    };
    const app = makeApp(EVENING, undefined, health);
    await app.openFuel();
    app.onScreen('data-weigh-in').click();
    expect(app.onScreen('data-activity-suggest').getAttribute('data-activity-suggest')).toBe(
      'moderate',
    );
    app.onScreen('data-activity-keep').click();
    await flush();
    expect(answers).toEqual([['keep', 'light']]);
    expect((await getNutritionSettings(db))?.activity).toBe('light');
    expect(app.root.find((e) => e.hasAttribute('data-activity-suggest'))).toHaveLength(0);

    suggest = 'moderate';
    const again = makeApp(EVENING, undefined, health);
    await again.openFuel();
    again.onScreen('data-weigh-in').click();
    again.onScreen('data-activity-switch').click();
    await flush();
    expect(answers.at(-1)).toEqual(['switch', 'moderate']);
    expect((await getNutritionSettings(db))?.activity).toBe('moderate');
    expect(again.toasts.at(-1)?.text).toBe('Activity level changed');
    again.toasts.at(-1)?.onUndo();
    await flush();
    expect((await getNutritionSettings(db))?.activity).toBe('light');
  });

  it('without a health host there is no activity line', async () => {
    await setUp({ activity: 'light' });
    const app = makeApp();
    await app.openFuel();
    app.onScreen('data-weigh-in').click();
    expect(app.root.find((e) => e.hasAttribute('data-activity-suggest'))).toHaveLength(0);
  });
});

describe('M13c 12b: openDay (search → a Fuel day)', () => {
  const entry = (id: string, date: string, label: string): Parameters<typeof saveEntry>[1] => ({
    id,
    date,
    time: new Date(`${date}T12:00:00`).getTime(),
    slot: 'lunch',
    label,
    amount: { servings: 1 },
    estimate: false,
    kcal: 500,
    proteinG: 30,
  });

  it('opens a day in the 30-day window, then Back to today', async () => {
    await setUp();
    const yesterday = localDate(EVENING - DAY);
    await saveEntry(db, entry('a', yesterday, 'Rice'));
    await saveEntry(db, entry('b', localDate(EVENING), 'Shake'));
    const app = makeApp();
    await app.ctrl.openDay(yesterday);
    app.ctrl.screen();
    await app.openFuel(); // open() resets to today…
    expect(app.ctrl.viewDay()).toBeNull();
    await app.ctrl.openDay(yesterday); // …openDay shows that day
    app.root.replaceChildren(asFake(app.ctrl.screen()));
    expect(app.ctrl.viewDay()).toBe(yesterday);
    expect(app.onScreen('data-fuel-day', yesterday).textContent).toBe('Tue 17 Nov');
    expect(
      app.root.find((e) => e.hasAttribute('data-entry')).map((e) => e.getAttribute('data-entry')),
    ).toEqual(['a']);
    app.onScreen('data-fuel-today').click();
    expect(app.ctrl.viewDay()).toBeNull();
    app.root.replaceChildren(asFake(app.ctrl.screen()));
    expect(
      app.root.find((e) => e.hasAttribute('data-entry')).map((e) => e.getAttribute('data-entry')),
    ).toEqual(['b']);
  });

  it('a day older than the window is read on its own; today or later opens today', async () => {
    await setUp();
    const old = localDate(EVENING - 90 * DAY);
    await saveEntry(db, entry('old', old, 'Khao man gai'));
    const app = makeApp();
    await app.ctrl.openDay(old);
    app.root.replaceChildren(asFake(app.ctrl.screen()));
    expect(app.onScreen('data-entry', 'old').textContent).toContain('Khao man gai');
    await app.ctrl.openDay(localDate(EVENING + DAY));
    expect(app.ctrl.viewDay()).toBeNull();
  });

  const rowIds = (app: ReturnType<typeof makeApp>) =>
    app.root.find((e) => e.hasAttribute('data-entry')).map((e) => e.getAttribute('data-entry'));

  // Review fix: a day older than the window lives in its own list, so edits and deletes must
  // reach it too (and Delete's focus has no Log button there: Back to today takes it).
  for (const [name, daysAgo] of [
    ['older than the 30-day window', 90],
    ['inside the 30-day window', 1],
  ] as const) {
    it(`${name}: Delete removes the row (focus on Back to today), Undo brings it back`, async () => {
      await setUp();
      const day = localDate(EVENING - daysAgo * DAY);
      await saveEntry(db, entry('x', day, 'Khao man gai'));
      await saveEntry(db, entry('y', day, 'Som tam'));
      const app = makeApp();
      await app.openDay(day);
      expect(rowIds(app)).toEqual(['x', 'y']);
      app.onScreen('data-entry-edit', 'x').click();
      app.inSheet('data-entry-remove').click();
      await flush();
      expect(await entriesBetween(db, day, day)).toHaveLength(1);
      expect(rowIds(app)).toEqual(['y']);
      expect(active()).toBe(app.onScreen('data-fuel-today'));
      expect(app.toasts.at(-1)?.text).toBe('Deleted Khao man gai.');
      app.toasts.at(-1)?.onUndo();
      await flush();
      expect(await entriesBetween(db, day, day)).toHaveLength(2);
      expect(rowIds(app).sort()).toEqual(['x', 'y']);
      // Today's list never picks up the old day's row.
      app.onScreen('data-fuel-today').click();
      app.root.replaceChildren(asFake(app.ctrl.screen()));
      expect(rowIds(app)).toEqual([]);
    });

    it(`${name}: editing the amount shows the new amount on the row`, async () => {
      await setUp();
      const day = localDate(EVENING - daysAgo * DAY);
      await saveEntry(db, entry('x', day, 'Khao man gai'));
      const app = makeApp();
      await app.openDay(day);
      expect(app.onScreen('data-entry', 'x').textContent).toContain('500 kcal');
      app.onScreen('data-entry-edit', 'x').click();
      app.inSheet('data-step', 'up').click();
      app.inSheet('data-entry-save').click();
      await flush();
      expect((await entriesBetween(db, day, day))[0]?.kcal).toBe(750);
      expect(app.onScreen('data-entry', 'x').textContent).toContain('750 kcal');
      expect(app.onScreen('data-entry', 'x').textContent).not.toContain('500 kcal');
      expect(active()).toBe(app.onScreen('data-entry-edit', 'x'));
    });
  }
});

describe('M13d task 8: Set up Fuel pre-fill (Health profile + latest weigh-in)', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', () => undefined);
  });
  const PROFILE = { heightCm: 168, birthYear: 1992, sex: 'female' as const };
  const tags = (app: ReturnType<typeof makeApp>) =>
    app.root
      .find((e) => e.hasAttribute('data-from-health'))
      .map((e) => e.getAttribute('data-from-health'));
  const value = (app: ReturnType<typeof makeApp>, field: string) =>
    (app.onScreen('data-field', field).oneByClass('nf-value') as unknown as { value: string })
      .value;

  it('first setup: Health height / birth year / sex and a Health weigh-in, each tagged', async () => {
    await saveWeighIn(db, { date: localDate(EVENING - DAY), kg: 63.4, source: 'health' });
    let reads = 0;
    const app = makeApp(EVENING, undefined, undefined, {
      healthProfile: async () => {
        reads++;
        return PROFILE;
      },
    });
    app.ctrl.setupForGoal('fat', { onLeave: () => undefined, inFlow: true });
    await flush();
    expect(reads).toBe(1); // one read per open
    expect(tags(app)).toEqual(['height', 'birthYear', 'sex', 'weight']);
    expect(value(app, 'height')).toBe('168');
    expect(value(app, 'birth-year')).toBe('1992');
    expect(value(app, 'weight')).toBe('63.4');
    // A re-render (a sync finishing) keeps the pre-fill without reading again.
    app.ctrl.screen();
    expect(reads).toBe(1);
    // Still confirmed with Save: activity is yours to pick.
    app.onScreen('data-choice', 'light').click();
    app.onScreen('data-setup-save').click();
    await flush();
    expect(await getNutritionSettings(db)).toMatchObject({
      heightCm: 168,
      birthYear: 1992,
      sex: 'female',
      activity: 'light',
    });
  });

  it('without Health: no tags; a first setup still starts from the latest (own) weigh-in', async () => {
    await saveWeighIn(db, { date: localDate(EVENING - DAY), kg: 66.2 });
    const app = makeApp();
    app.ctrl.setupForGoal('fat');
    await flush();
    expect(tags(app)).toEqual([]);
    expect(value(app, 'weight')).toBe('66.2');
    expect(value(app, 'height')).toBe('170');
  });

  it('a Health reply of null or an error: the form works as before', async () => {
    for (const healthProfile of [async () => null, async () => Promise.reject(new Error('x'))]) {
      // (makeApp's logError throws: a failed read must stay quiet, never crash the open.)
      const app = makeApp(EVENING, undefined, undefined, { healthProfile });
      app.ctrl.setupForGoal('fat');
      await flush();
      expect(tags(app)).toEqual([]);
      expect(app.onScreen('data-screen', 'fuel-setup')).toBeTruthy();
    }
  });

  it('a re-run: saved values win over Health (no tag on them)', async () => {
    await setUp(); // saved: 175 cm, 1994, male; weigh-in 70 (manual)
    const app = makeApp(EVENING, undefined, undefined, { healthProfile: async () => PROFILE });
    await app.ctrl.open();
    app.showSettings();
    app.onScreen('data-setup-rerun').click();
    await flush();
    expect(tags(app)).toEqual([]);
    expect(value(app, 'height')).toBe('175');
    expect(value(app, 'weight')).toBe('70.0');
  });

  it('once you start filling it in, data arriving late does not re-fill the form', async () => {
    let answer: (p: typeof PROFILE) => void = () => undefined;
    const app = makeApp(EVENING, undefined, undefined, {
      healthProfile: () => new Promise((r) => (answer = r)),
    });
    app.ctrl.setupForGoal('fat');
    const renders = app.calls.render;
    app
      .onScreen('data-field', 'height')
      .find((e) => e.getAttribute('data-step') === 'up')[0]
      ?.click();
    answer(PROFILE);
    await flush();
    expect(app.calls.render).toBe(renders);
    expect(value(app, 'height')).toBe('171');
  });

  it('left before Health answered: nothing re-renders', async () => {
    let answer: (p: typeof PROFILE) => void = () => undefined;
    const app = makeApp(EVENING, undefined, undefined, {
      healthProfile: () => new Promise((r) => (answer = r)),
    });
    app.ctrl.setupForGoal('fat', { onLeave: () => undefined });
    app.root.oneByClass('fuel-back').click();
    const renders = app.calls.render;
    answer(PROFILE);
    await flush();
    expect(app.calls.render).toBe(renders);
  });
});

describe('M13d task 13: length unit', () => {
  beforeEach(() => {
    vi.stubGlobal('scrollTo', () => undefined);
  });

  it('host.lengthUnit "in": Set up Fuel asks ft + in and Measurements shows inches', async () => {
    await setUp();
    await saveMeasurement(db, { date: localDate(EVENING - 3 * DAY), site: 'waist', cm: 81.28 });
    const app = makeApp(EVENING, undefined, undefined, {
      lengthUnit: () => 'in',
      trainerKit: () =>
        ({ measurementSites: ['waist'] }) as unknown as ReturnType<
          NonNullable<FuelHost['trainerKit']>
        >,
    });
    app.ctrl.setupForGoal('fat');
    await flush();
    const height = app.onScreen('data-field', 'height');
    expect(
      height.find((e) => e.hasAttribute('data-part')).map((e) => e.getAttribute('data-part')),
    ).toEqual(['ft', 'in']);
    await app.ctrl.openMeasurements();
    const el = asFake(app.ctrl.screen());
    expect(el.getAttribute('data-screen')).toBe('measurements');
    const last = el.find((e) => e.getAttribute('data-site-last') === 'waist')[0];
    expect(last?.textContent).toContain('32 in');
  });

  it('no lengthUnit from the host: follows the weight unit (kg → cm)', async () => {
    await setUp();
    const app = makeApp();
    app.ctrl.setupForGoal('fat');
    await flush();
    expect(
      app.onScreen('data-field', 'height').find((e) => e.hasAttribute('data-part')),
    ).toHaveLength(0);
  });
});
