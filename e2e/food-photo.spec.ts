// M7b task 18: log food from a photo, end to end in the real app at 390×844.
// The classifier is the dev-only fake (`window.__gymCleanFakeFoodClassifier`, src/food-vision);
// the photo is a made-up solid-colour PNG drawn in the test, never a real photo. Checks:
// - no model → no Photo button, the Settings hint; a model that doesn't match the dish list is
//   refused at import;
// - confident → the top guess is preselected → Log (1 tap, Regular) / Large (2 taps), with the
//   Thai dish's values, `source: 'photo-local'`, `estimate`, `photoConfidence`; rings update;
// - unsure → nothing preselected; no match → search → log;
// - no "Claude" / "Ask" anywhere (the Claude backup is out of this milestone);
// - save-photos off → nothing in `foodPhotos`; on → 1 photo labelled with the confirmed dish →
//   Export downloads a zip with labels.csv → Delete with Undo;
// - 0 off-device requests, no console errors, taps ≥ 56px, no horizontal overflow, nothing spoken.
// - M13c task 15: Take photo + Choose from library; a file set on the library input (no
//   `capture`) opens the same suggestions sheet as Take photo and logs the same way.
// FOOD_SHOTS=1 writes docs/screenshots/m7b-wired-*.png; M13C_SHOTS=1 writes
// docs/screenshots/m13c-food-photo-buttons.png.
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from './fixtures';
import { entryFromFood } from '../src/core/nutrition/portions';
import type { Food, FoodEntry } from '../src/core/types';
import { readZip } from '../src/core/zip';

type Scored = { categoryName: string; score: number };

declare global {
  interface Window {
    __spoken: string[];
    __fakeFoodResult: Scored[];
    __gymCleanFakeFoodClassifier?: {
      labels?: readonly string[];
      classify?: () => readonly Scored[];
      unreadable?: boolean;
    };
  }
}

const SHOTS = process.env.FOOD_SHOTS === '1';
const M13C_SHOTS = process.env.M13C_SHOTS === '1';
const at = (day: number, hour: number, min = 0) => new Date(2026, 10, day, hour, min).getTime();
const LUNCH = at(18, 12, 10); // a Wednesday lunchtime

const THAI = JSON.parse(readFileSync('src/data/nutrition/thaiDishes.json', 'utf8')) as {
  foods: Food[];
};
const DISHES = new Map(THAI.foods.map((f) => [f.id, f]));
const PAD_THAI = 'thai:pad-thai-goong'; // class pad_thai's default dish
const CONFIDENT: Scored[] = [
  { categoryName: 'pad_thai', score: 0.82 },
  { categoryName: 'som_tum', score: 0.09 },
  { categoryName: 'tom_yum_goong', score: 0.05 },
];
const UNSURE: Scored[] = [
  { categoryName: 'pad_thai', score: 0.45 },
  { categoryName: 'som_tum', score: 0.3 },
  { categoryName: 'tom_yum_goong', score: 0.1 },
];
const NO_MATCH: Scored[] = [{ categoryName: 'not_a_dish', score: 0.9 }];

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__fakeFoodResult = [];
    window.__gymCleanFakeFoodClassifier = { classify: () => window.__fakeFoodResult };
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      voice = null;
      pitch = 1;
      constructor(text: string) {
        super();
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: FakeUtterance) => {
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
        speaking: false,
        pending: false,
        paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ addEventListener: () => undefined, release: async () => {} }),
      },
    });
    // No Web Share in the test browser: Export falls back to a download we can read.
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
}

/** Every request and error of the whole browser context. */
function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

/** Requests to any host but the app's own (data:/blob: are local). */
function offDevice(requests: readonly string[], origin: string): string[] {
  return requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    return new URL(u).origin !== origin;
  });
}

async function openApp(page: Page) {
  await installMocks(page);
  await page.clock.install({ time: LUNCH });
  await page.goto('/');
  await expect(page.locator('[data-screen="today"]')).toBeVisible();
}

const setResult = (page: Page, r: Scored[]) =>
  page.evaluate((x) => {
    window.__fakeFoodResult = x;
  }, r);

/** A made-up 640×480 solid-colour PNG, drawn in the page. */
async function madeUpPng(page: Page, colour = '#c2410c'): Promise<Buffer> {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement('canvas');
    cv.width = 640;
    cv.height = 480;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 640, 480);
    }
    return cv.toDataURL('image/png').split(',')[1] ?? '';
  }, colour);
  return Buffer.from(b64, 'base64');
}

/** Rows of an IndexedDB store (photo blobs as their size). */
async function rows<T = Record<string, unknown>>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (store) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const rq = d.transaction(store).objectStore(store).getAll();
          rq.onsuccess = () => {
            d.close();
            resolve(
              (rq.result as Record<string, unknown>[]).map((r) =>
                r.blob instanceof Blob ? { ...r, blob: r.blob.size } : r,
              ) as T[],
            );
          };
          rq.onerror = () => reject(new Error('read failed'));
        };
      }),
    store,
  );
}

const settings = (page: Page) => page.locator('main[data-screen="settings"]');
const foodPhotos = (page: Page) => page.locator('[data-food-photos]');
const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');
const logSheet = (page: Page) => page.locator('[data-log-sheet]');
const photoSheet = (page: Page) => page.locator('[data-photo-sheet]');

async function goSettings(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await expect(settings(page)).toBeVisible();
  await foodPhotos(page).scrollIntoViewIfNeeded();
}

async function goFuel(page: Page) {
  await page.locator('[data-tab="fuel"]').click();
  await expect(fuelMain(page)).toBeVisible();
}

/** Settings → Food photos → Import a made-up model file. */
async function importModel(page: Page, name = 'made-up-food.tflite') {
  await goSettings(page);
  await foodPhotos(page)
    .locator('input[data-food-model-file]')
    .setInputFiles({
      name,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from([1, 2, 3, 4]),
    });
}

async function expectModelReady(page: Page) {
  await expect(foodPhotos(page).locator('[data-food-model]')).toHaveAttribute(
    'data-state',
    'ready',
  );
}

/** Fuel → Log food → Log from a photo (the made-up PNG). */
async function takePhoto(page: Page, result: Scored[]) {
  await setResult(page, result);
  if (!(await fuelMain(page).isVisible())) await goFuel(page);
  await fuelMain(page).locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();
  await expect(logSheet(page).locator('[data-photo-open]')).toBeVisible();
  await expectTapTargets(logSheet(page).locator('[data-log-photo]'));
  await shot(page, 'log-photo-button');
  await logSheet(page)
    .locator('[data-photo-input]')
    .setInputFiles({ name: 'made-up.png', mimeType: 'image/png', buffer: await madeUpPng(page) });
  await expect(photoSheet(page)).toBeVisible();
  await expect(photoSheet(page).locator('[data-photo-state]')).not.toHaveAttribute(
    'data-photo-state',
    'looking',
  );
}

/** Every visible button in `scope` is at least 56px tall (gym rule). */
async function expectTapTargets(scope: Locator) {
  // M12 motion: sheets rise in; measure once the finite entrance animations have settled
  // (a box read mid-transform comes back a hair under its real size).
  await scope
    .page()
    .waitForFunction(() =>
      document
        .getAnimations()
        .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
    );
  const heights = await scope
    .locator('button')
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => [e.textContent?.trim() ?? '', e.getBoundingClientRect().height] as const),
    );
  expect(heights.length).toBeGreaterThan(0);
  for (const [name, hgt] of heights) expect(hgt, `button "${name}"`).toBeGreaterThanOrEqual(56);
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

/** No Claude / Ask control or text in the sheet (text and attributes). */
async function noClaude(scope: Locator) {
  const html = await scope.evaluate((el) => el.outerHTML);
  expect(html).not.toMatch(/claude/i);
  expect(await scope.innerText()).not.toMatch(/\bAsk\b/);
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `docs/screenshots/m7b-wired-${name}.png` });
}

/** The entry `entryFromFood` makes for this dish and portion (values, label, amount). */
function expected(dishId: string, portion: string) {
  const dish = DISHES.get(dishId);
  if (!dish) throw new Error(`no dish ${dishId}`);
  const e = entryFromFood(dish, { servings: 1 }, { id: 'x', time: LUNCH, slot: 'lunch', portion });
  if (!e) throw new Error('no entry');
  const { kcal, proteinG, carbsG, fatG, label, amount } = e;
  return { kcal, proteinG, carbsG, fatG, label, amount, ref: { foodId: dishId } };
}

test.afterEach(async ({ page }) => {
  // Fuel is never mid-set: nothing is spoken.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('no model: no Photo button, the Settings hint; a model that doesn’t match is refused', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page);
  await goFuel(page);
  await fuelMain(page).locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();
  await expect(logSheet(page).locator('[data-photo-open]')).toHaveCount(0);
  await expect(logSheet(page).locator('[data-photo-hint]')).toHaveText(
    'Log from a photo: add a food model in Settings.',
  );
  await noOverflow(page);
  await shot(page, 'log-no-model');
  await logSheet(page).locator('[data-close]').click();

  // Settings → Food photos: no model; the backup note says photos and model stay out.
  await goSettings(page);
  await expect(foodPhotos(page).locator('[data-food-model]')).toHaveAttribute('data-state', 'none');
  await expect(page.locator('[data-backup-photos-note]')).toContainText(
    'Food photos and the food model aren’t in the backup',
  );

  // Not a .tflite → stopped before checking.
  await foodPhotos(page)
    .locator('input[data-food-model-file]')
    .setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await expect(foodPhotos(page).locator('[data-food-model-status]')).toHaveText(
    'Pick a .tflite model file.',
  );

  // Labels that aren't our dish list → refused, nothing stored.
  await page.evaluate(() => {
    if (window.__gymCleanFakeFoodClassifier)
      window.__gymCleanFakeFoodClassifier.labels = ['pizza', 'burger'];
  });
  await importModel(page, 'other-food.tflite');
  await expect(foodPhotos(page).locator('[data-food-model-status]')).toHaveText(
    "This model doesn't match the dish list.",
  );
  await expect(foodPhotos(page).locator('[data-food-model]')).toHaveAttribute('data-state', 'none');
  expect(await rows(page, 'foodModels')).toHaveLength(0);
  await noOverflow(page);
  await shot(page, 'settings-mismatch');

  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});

test('confident: 1 tap logs Regular, 2 taps log Large, with the dish values; rings update; nothing saved while off', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const { requests, errors } = record(page);
  await openApp(page);
  await importModel(page);
  await expectModelReady(page);
  await expect(page.locator('[data-undo-toast]')).toContainText('Food model added.');
  await noOverflow(page);
  await shot(page, 'settings-model');

  // Targets first, so the rings show what the photo logs.
  await goFuel(page);
  await fuelMain(page).locator('[data-setup]').click();
  const setup = page.locator('main[data-screen="fuel-setup"]');
  await setup.locator('[data-field="sex"] [data-choice="male"]').click();
  await setup.locator('[data-field="activity"] [data-choice="moderate"]').click();
  const w = setup.locator('[data-field="weight"] .nf-value');
  await w.fill('70.0');
  await w.dispatchEvent('change');
  await setup.locator('[data-setup-save]').click();
  await expect(fuelMain(page).locator('[data-ring="kcal"]')).toBeVisible();

  // Photo → confident: top guess preselected, % shown, Log enabled.
  await takePhoto(page, CONFIDENT);
  const sheet = photoSheet(page);
  await expect(sheet.locator('[data-photo-state]')).toHaveAttribute(
    'data-photo-state',
    'confident',
  );
  await expect(sheet.locator('[data-photo-option="pad_thai"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.locator('[data-photo-option="pad_thai"] [data-photo-pct]')).toHaveText('82%');
  await expect(sheet.locator('[data-photo-option]')).toHaveCount(3);
  await expect(sheet.locator('[data-portion="Regular"]')).toHaveAttribute('aria-pressed', 'true');
  await noClaude(sheet);
  await expectTapTargets(sheet);
  await noOverflow(page);
  await shot(page, 'photo-confident');

  // 1 tap: Log (Regular).
  await sheet.locator('[data-photo-log]').click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(1);
  await expect(page.locator('[data-undo-toast]')).toContainText('Logged ');
  let entries = await rows<FoodEntry>(page, 'foodEntries');
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    ...expected(PAD_THAI, 'Regular'),
    source: 'photo-local',
    estimate: true,
    photoConfidence: 0.82,
  });

  // 2 taps: Large, then Log.
  await takePhoto(page, CONFIDENT);
  await photoSheet(page).locator('[data-portion="Large"]').click();
  await photoSheet(page).locator('[data-photo-log]').click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(2);
  entries = await rows<FoodEntry>(page, 'foodEntries');
  expect(entries).toHaveLength(2);
  // getAll() orders by the random id: match both plates, whichever comes first.
  expect(entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ ...expected(PAD_THAI, 'Regular'), photoConfidence: 0.82 }),
      expect.objectContaining({
        ...expected(PAD_THAI, 'Large'),
        source: 'photo-local',
        estimate: true,
        photoConfidence: 0.82,
      }),
    ]),
  );

  // Rings count both plates.
  const eaten = Math.round(
    (expected(PAD_THAI, 'Regular').kcal ?? 0) + (expected(PAD_THAI, 'Large').kcal ?? 0),
  );
  await expect
    .poll(async () => {
      const of =
        (await fuelMain(page)
          .locator('[data-ring="kcal"] .fuel-ring-of > span')
          .first()
          .textContent()) ?? '';
      return Math.abs(Number((of.split(' of ')[0] ?? '').replace(/[^\d.]/g, '')) - eaten);
    })
    .toBeLessThanOrEqual(1);
  await expect(fuelMain(page).locator('[data-entry]')).toHaveCount(2);
  await shot(page, 'fuel-after-photo');

  // Save-photos is off by default: nothing kept.
  expect(await rows(page, 'foodPhotos')).toHaveLength(0);
  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});

test('unsure: nothing preselected, no Claude; pick one → logged with its confidence', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page);
  await importModel(page);
  await expectModelReady(page);
  await takePhoto(page, UNSURE);
  const sheet = photoSheet(page);
  await expect(sheet.locator('[data-photo-state]')).toHaveAttribute('data-photo-state', 'unsure');
  await expect(sheet).toContainText('Not sure. Pick one or search.');
  await expect(sheet.locator('[data-photo-option][aria-pressed="true"]')).toHaveCount(0);
  await expect(sheet.locator('[data-photo-log]')).toBeDisabled();
  await noClaude(sheet);
  await expectTapTargets(sheet);
  await noOverflow(page);
  await shot(page, 'photo-unsure');

  await sheet.locator('[data-photo-option="som_tum"]').click();
  await sheet.locator('[data-photo-log]').click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(1);
  const [e] = await rows<FoodEntry>(page, 'foodEntries');
  expect(e).toMatchObject({ source: 'photo-local', estimate: true, photoConfidence: 0.3 });
  expect(e?.ref?.foodId).toMatch(/^thai:som-tum/);
  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});

test('no match → search → a Thai dish is logged from the photo (no confidence)', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page);
  await importModel(page);
  await expectModelReady(page);
  await takePhoto(page, NO_MATCH);
  const sheet = photoSheet(page);
  await expect(sheet.locator('[data-photo-state]')).toHaveAttribute('data-photo-state', 'noMatch');
  await noClaude(sheet);
  await shot(page, 'photo-no-match');
  await sheet.locator('[data-photo-search]').click();
  await expect(logSheet(page).locator('[data-section-panel="search"]')).toBeVisible();
  await logSheet(page).locator('#log-search').fill('tom yum');
  const hit = logSheet(page)
    .locator('[data-log-item]')
    .filter({ hasText: /tom yum/i })
    .first();
  await expect(hit).toBeVisible();
  await hit.click();
  await logSheet(page).locator('[data-log-confirm]').click();
  await expect(logSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(1);
  const [e] = await rows<FoodEntry>(page, 'foodEntries');
  expect(e).toMatchObject({ source: 'photo-local', estimate: true });
  expect(e?.photoConfidence).toBeUndefined();
  expect(e?.ref?.foodId).toMatch(/^thai:tom-yum/);
  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});

test('save-photos on: 1 labelled photo → Export zip with labels.csv → Delete with Undo', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const { requests, errors } = record(page);
  await openApp(page);
  await importModel(page);
  await expectModelReady(page);

  // Off by default; the explainer comes before it turns on.
  const sw = foodPhotos(page).locator('[data-setting="save-food-photos"]');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(foodPhotos(page).locator('[data-food-save-explainer]')).toContainText(
    'Photos stay on this phone.',
  );
  await shot(page, 'settings-explainer');
  await foodPhotos(page).locator('[data-food-save-on]').click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');

  // Photo → pick the chicken variant → Log: the photo is labelled with the dish he confirmed.
  await takePhoto(page, CONFIDENT);
  await photoSheet(page).locator('[data-photo-variant="thai:pad-thai-gai"]').click();
  await photoSheet(page).locator('[data-photo-log]').click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(1);
  await expect.poll(async () => (await rows(page, 'foodPhotos')).length).toBe(1);
  const photos = await rows<{
    dishId: string;
    createdAt: number;
    w: number;
    h: number;
    blob: number;
  }>(page, 'foodPhotos');
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({ dishId: 'thai:pad-thai-gai', w: 512, h: 384 });
  expect(photos[0]?.blob).toBeGreaterThan(0);

  // Settings shows the count; Export downloads the zip.
  await goSettings(page);
  await expect(foodPhotos(page).locator('[data-food-photo-count]')).toHaveText('1 saved photo');
  await expectTapTargets(foodPhotos(page));
  await noOverflow(page);
  await shot(page, 'settings-one-photo');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    foodPhotos(page).locator('[data-food-photos-export]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('gym-clean-food-photos-2026-11-18.zip');
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const files = readZip(new Uint8Array(await readFile(path)));
  const names = files.map((f) => f.name);
  expect(names).toContain('gym-clean-food-photos/labels.csv');
  expect(names.filter((n) => n.endsWith('.jpg'))).toEqual([
    `gym-clean-food-photos/thai_pad-thai-gai/${photos[0]?.createdAt}.jpg`,
  ]);
  const csv = new TextDecoder().decode(files.find((f) => f.name.endsWith('labels.csv'))?.data);
  expect(csv).toBe(
    `file,dishId,createdAt\nthai_pad-thai-gai/${photos[0]?.createdAt}.jpg,thai:pad-thai-gai,${photos[0]?.createdAt}\n`,
  );

  // Delete: two taps, then Undo puts it back.
  const del = foodPhotos(page).locator('[data-food-photos-delete]');
  await del.click();
  await expect(del).toHaveAttribute('data-armed');
  await del.click();
  await expect(page.locator('[data-undo-toast]')).toContainText('Deleted 1 saved photo.');
  expect(await rows(page, 'foodPhotos')).toHaveLength(0);
  await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(foodPhotos(page).locator('[data-food-photo-count]')).toHaveText('1 saved photo');
  expect(await rows(page, 'foodPhotos')).toHaveLength(1);

  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});

test('M13c: Choose from library (no capture) → the same suggestions sheet as Take photo → logged', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page);
  await importModel(page);
  await expectModelReady(page);
  await setResult(page, CONFIDENT);
  await goFuel(page);
  await fuelMain(page).locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();

  // Two buttons, icon + words, side by side, each ≥ 56px.
  const row = logSheet(page).locator('[data-log-photo]');
  const take = row.locator('[data-photo-open]');
  const library = row.locator('[data-photo-library]');
  await expect(take).toHaveText('Take photo');
  await expect(library).toHaveText('Choose from library');
  await expect(take.locator('svg')).toHaveCount(1);
  await expect(library.locator('svg')).toHaveCount(1);
  await expectTapTargets(row);
  const [tb, lb] = [await take.boundingBox(), await library.boundingBox()];
  expect(tb && lb && Math.abs(tb.y - lb.y)).toBeLessThan(1); // one row
  expect(tb && lb && Math.abs(tb.height - lb.height)).toBeLessThan(1);
  for (const b of [tb, lb]) expect(b?.height ?? 0).toBeGreaterThanOrEqual(56);
  const fontPx = await row
    .locator('button')
    .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  for (const f of fontPx) expect(f).toBeGreaterThanOrEqual(20);
  // The camera input keeps capture; the library input has none (the iOS photo picker).
  await expect(row.locator('[data-photo-input]')).toHaveAttribute('capture', 'environment');
  const libInput = row.locator('[data-photo-library-input]');
  await expect(libInput).toHaveAttribute('type', 'file');
  await expect(libInput).toHaveAttribute('accept', 'image/*');
  expect(await libInput.evaluate((e) => e.hasAttribute('capture'))).toBe(false);
  await noOverflow(page);
  if (M13C_SHOTS) await page.screenshot({ path: 'docs/screenshots/m13c-food-photo-buttons.png' });

  // The library photo → the same confident sheet Take photo shows.
  await libInput.setInputFiles({
    name: 'from-library.png',
    mimeType: 'image/png',
    buffer: await madeUpPng(page),
  });
  const sheet = photoSheet(page);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-photo-state]')).toHaveAttribute(
    'data-photo-state',
    'confident',
  );
  await expect(sheet.locator('[data-photo-option]')).toHaveCount(3);
  await expect(sheet.locator('[data-photo-option="pad_thai"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.locator('[data-photo-option="pad_thai"] [data-photo-pct]')).toHaveText('82%');
  await noClaude(sheet);
  await expectTapTargets(sheet);
  await noOverflow(page);

  await sheet.locator('[data-photo-log]').click();
  await expect(photoSheet(page)).toHaveCount(0);
  await expect.poll(async () => (await rows(page, 'foodEntries')).length).toBe(1);
  const [e] = await rows<FoodEntry>(page, 'foodEntries');
  expect(e).toMatchObject({
    ...expected(PAD_THAI, 'Regular'),
    source: 'photo-local',
    estimate: true,
    photoConfidence: 0.82,
  });
  // Save photos is off: nothing kept from the library either.
  expect(await rows(page, 'foodPhotos')).toHaveLength(0);
  expect(offDevice(requests, baseURL ?? '')).toEqual([]);
  expect(errors).toEqual([]);
});
