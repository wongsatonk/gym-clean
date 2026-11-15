// M7 Fuel, end to end in the real app (SPEC M7 "Accept", task 18), at 390×844:
// - set up targets → log a favorite (the seed Protein shake asks for its label numbers first), a
//   recipe serving, a Thai dish (Large) and a quick estimate → rings and remaining update →
//   Full mode → carbs/fat appear, nothing lost (also after a reload);
// - weigh-ins over 2 fake weeks (clock mocked) → the weekly suggestion card → Accept → new target;
//   and the info card when the target is already at its limit (nothing to accept);
// - delete + Undo; the coach's "What should I eat?" → Log → Fuel updates;
// - offline search after the first load, against the production preview (service worker).
// Fuel is never mid-set, so nothing is spoken; no request ever leaves the device.
import { expect, test, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __spoken: string[];
  }
}

// pwa project's preview server (playwright.config.ts): started for every run, so this spec can
// use it for the offline case.
const PORT = Number(process.env.E2E_PORT ?? 5174);
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? PORT + 1000);

// Chromium refuses a service worker over the self-signed cert even with ignoreHTTPSErrors; the
// offline case needs one. The fake-camera flags are the mobile project's.
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--ignore-certificate-errors',
    ],
  },
});

/** Local time, November 2026 (Mon 2, 9 and 16 Nov start the weeks). */
const at = (day: number, hour: number, min = 0) => new Date(2026, 10, day, hour, min).getTime();

const PAD_KRA_PAO = 'thai:pad-kra-pao-moo-rice-egg'; // 836 kcal / 40.8 g per plate; Large ×1.4

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
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
  });
}

/** Every request and error of the whole browser context (pages, workers, service worker). */
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

async function openApp(page: Page, time: number, url = '/') {
  await installMocks(page);
  await page.clock.install({ time });
  await page.goto(url);
  await expect(page.locator('[data-screen="today"]')).toBeVisible();
}

const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');
const logSheet = (page: Page) => page.locator('[data-log-sheet]');
const entries = (page: Page) => fuelMain(page).locator('[data-entry]');

/** Opens the Fuel tab fresh (via Today when it's already showing, so it re-reads the clock). */
async function goFuel(page: Page) {
  if (await fuelMain(page).isVisible()) {
    await page.locator('[data-tab="today"]').click();
    await expect(page.locator('[data-screen="today"]')).toBeVisible();
  }
  await page.locator('[data-tab="fuel"]').click();
  await expect(fuelMain(page)).toBeVisible();
}

/** Setup with made-up values: 170 cm, 30 years, male, Active, `weight` kg. */
async function setUpTargets(page: Page, weight = '70.0') {
  await expect(fuelMain(page).locator('[data-setup-card]')).toBeVisible();
  await expect(fuelMain(page).locator('[data-ring]')).toHaveCount(0);
  await fuelMain(page).locator('[data-setup]').click();
  const setup = page.locator('main[data-screen="fuel-setup"]');
  await expect(setup).toBeVisible();
  await expect(setup.locator('[data-setup-save]')).toBeDisabled(); // sex + activity: no guess
  await setup.locator('[data-field="sex"] [data-choice="male"]').click();
  await setup.locator('[data-field="activity"] [data-choice="moderate"]').click();
  await typeNumber(setup.locator('[data-field="weight"] .nf-value'), weight);
  await setup.locator('[data-setup-save]').click();
  await expect(fuelMain(page).locator('[data-ring="kcal"]')).toBeVisible();
}

/** Types into a − value + field and commits it (the field reads it on `change`). */
async function typeNumber(input: Locator, value: string) {
  await input.fill(value);
  await input.dispatchEvent('change');
  await expect(input).toHaveValue(value);
}

const num = (s: string) => Number(s.replace(/[^\d.+-]/g, ''));

/** A ring's numbers: the big "to go" number, and "eaten of target". */
async function ring(page: Page, key: 'kcal' | 'proteinG' | 'carbsG' | 'fatG') {
  const r = fuelMain(page).locator(`[data-ring="${key}"]`);
  const left = (await r.locator('[data-left]').textContent()) ?? '';
  const of = (await r.locator('.fuel-ring-of > span').first().textContent()) ?? '';
  const [eaten = '', target = ''] = of.split(' of ');
  return { left: num(left), over: left.startsWith('+'), eaten: num(eaten), target: num(target) };
}

/** The big number agrees with "eaten of target": target − eaten to go, or "+(eaten − target)" over. */
function consistent(r: Awaited<ReturnType<typeof ring>>): boolean {
  const gap = r.over ? r.eaten - r.target : r.target - r.eaten;
  return Math.abs(gap - r.left) <= 1;
}

/** "836 kcal · 41 g protein · …" → numbers. */
function macros(line: string) {
  const pick = (re: RegExp) => {
    const m = line.match(re);
    return m ? num(m[1] ?? '') : undefined;
  };
  return {
    kcal: pick(/([\d,]+) kcal/),
    proteinG: pick(/([\d,]+) g protein/),
    carbsG: pick(/([\d,]+) g carbs/),
    fatG: pick(/([\d,]+) g fat/),
  };
}

async function openLog(page: Page, section?: string) {
  await fuelMain(page).locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();
  if (section) {
    await logSheet(page).locator(`[data-log-section="${section}"]`).click();
    await expect(logSheet(page).locator(`[data-section-panel="${section}"]`)).toBeVisible();
  }
}

/** Taps Log in an item's detail; the sheet closes and the "Logged …" toast shows. */
async function confirmLog(page: Page, label: string) {
  await logSheet(page).locator('[data-log-confirm]').click();
  await expect(logSheet(page)).toHaveCount(0);
  await expect(page.locator('[data-undo-toast]')).toContainText(`Logged ${label}`);
}

/** Every visible button in `scope` is at least 56px tall (gym rule). */
async function expectTapTargets(page: Page, selector: string) {
  await expect(page.locator(`${selector} button`).first()).toBeVisible();
  let heights: (readonly [string, number])[] = [];
  await expect
    .poll(async () => {
      heights = await page
        .locator(`${selector} button`)
        .evaluateAll((els) =>
          els
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => [e.textContent?.trim() ?? '', e.getBoundingClientRect().height] as const),
        );
      return heights.length;
    })
    .toBeGreaterThan(0);
  for (const [name, hgt] of heights) expect(hgt, `button "${name}"`).toBeGreaterThanOrEqual(56);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

/** Kcal and protein the Fuel rings count as eaten match the entries, and left = target − eaten. */
async function expectRings(page: Page, eaten: { kcal: number; proteinG: number }) {
  for (const key of ['kcal', 'proteinG'] as const) {
    await expect
      .poll(async () => {
        const r = await ring(page, key);
        return Math.abs(r.eaten - eaten[key]) <= 1 && consistent(r);
      }, key)
      .toBe(true);
  }
}

test('setup → log a favorite, a recipe serving, a Thai dish (Large) and a quick estimate → rings update → Full mode keeps everything', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { requests, errors } = record(page);
  await openApp(page, at(11, 12)); // Wed lunchtime: no evening nudge
  await goFuel(page);
  await noHorizontalOverflow(page);
  await setUpTargets(page);

  const start = { kcal: await ring(page, 'kcal'), protein: await ring(page, 'proteinG') };
  expect(start.kcal.eaten).toBe(0);
  expect(start.kcal.target).toBeGreaterThan(1500);
  expect(start.kcal.left).toBe(start.kcal.target);
  expect(start.protein.left).toBe(start.protein.target);
  await expect(fuelMain(page).locator('[data-ring="kcal"] [data-estimate]')).toBeVisible();
  // Quick mode: kcal + protein only.
  await expect(fuelMain(page).locator('[data-ring]')).toHaveCount(2);
  await expectTapTargets(page, 'main[data-screen="fuel"]');

  const eaten = { kcal: 0, proteinG: 0 };

  // 1. Favorite: the seed Protein shake asks for its label numbers before it can be logged.
  await openLog(page);
  await expect(logSheet(page).locator('[data-log-section="favorites"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expectTapTargets(page, '[data-log-sheet]');
  const shake = logSheet(page).locator('[data-log-item]', { hasText: 'Protein shake' });
  await shake.click();
  await expect(logSheet(page).locator('[data-needs-label]')).toBeVisible();
  await expect(logSheet(page).locator('[data-log-confirm]')).toHaveCount(0);
  await logSheet(page).locator('[data-edit-item]').click();
  const editor = page.locator('[data-my-food-editor]');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[data-label-prompt]')).toBeVisible();
  await editor.locator('#food-kcal').fill('130');
  await editor.locator('#food-protein').fill('25');
  await editor.locator('[data-food-save]').click();
  await expect(editor).toHaveCount(0);
  // Back on Favorites: now it logs in the usual ≤ 3 taps (open, item, Log).
  await expect(logSheet(page)).toBeVisible();
  await shake.click();
  await expect(logSheet(page).locator('[data-needs-label]')).toHaveCount(0);
  await expect(logSheet(page).locator('[data-preview]')).toHaveText('130 kcal · 25 g protein');
  await confirmLog(page, 'Protein shake');
  eaten.kcal += 130;
  eaten.proteinG += 25;
  await expect(entries(page)).toHaveCount(1);
  await expectRings(page, eaten);
  // The ≤ 3 taps path, measured: open → item → Log — then remove it again with the toast's Undo.
  await openLog(page);
  await shake.click();
  await confirmLog(page, 'Protein shake');
  await expect(entries(page)).toHaveCount(2);
  await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(entries(page)).toHaveCount(1);
  await expectRings(page, eaten);

  // 2. A recipe serving: build it from the food list (grams), the pot makes 2 servings.
  await openLog(page, 'recipes');
  await logSheet(page).locator('[data-new-recipe]').click();
  const rx = page.locator('[data-recipe-editor]');
  await expect(rx).toBeVisible();
  await rx.locator('#recipe-name').fill('Chicken rice bowl');
  for (const q of ['chicken breast', 'rice']) {
    await rx.locator('#recipe-search').fill(q);
    const first = rx.locator('[data-search-results] [data-log-item]').first();
    await expect(first).toBeVisible({ timeout: 15_000 });
    await first.click();
  }
  await expect(rx.locator('[data-ingredient]')).toHaveCount(2);
  await rx.locator('[data-stepper="servings"] [data-step="up"]').click();
  await expect(rx.locator('[data-stepper="servings"] .fuel-step-num')).toHaveText('2');
  const perServing = (await rx.locator('[data-per-serving]').textContent()) ?? '';
  expect(perServing).toMatch(/kcal · .* g protein/);
  await rx.locator('[data-recipe-save]').click();
  await expect(rx).toHaveCount(0);
  await expect(logSheet(page).locator('[data-section-panel="recipes"]')).toBeVisible();
  await logSheet(page)
    .locator('[data-log-item^="recipe:"]', { hasText: 'Chicken rice bowl' })
    .click();
  await expect(logSheet(page).locator('[data-stepper="portion"] .fuel-step-num')).toHaveText('1');
  await expect(logSheet(page).locator('[data-preview]')).toHaveText(perServing);
  await confirmLog(page, 'Chicken rice bowl');
  const rxMacros = macros(perServing);
  eaten.kcal += rxMacros.kcal ?? NaN;
  eaten.proteinG += rxMacros.proteinG ?? NaN;
  await expect(entries(page)).toHaveCount(2);
  await expectRings(page, eaten);

  // 3. A Thai dish, Large plate (×1.4): 836 → 1,170 kcal, 40.8 → 57 g protein.
  await openLog(page, 'thai');
  const dish = logSheet(page).locator(`[data-log-item="thai:${PAD_KRA_PAO}"]`);
  await expect(dish).toContainText('ข้าวผัดกะเพรา'); // Thai name alongside English
  await dish.click();
  await expect(logSheet(page).locator('[data-portion="Regular"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(logSheet(page).locator('[data-preview]')).toHaveText('836 kcal · 41 g protein');
  await logSheet(page).locator('[data-portion="Large"]').click();
  await expect(logSheet(page).locator('[data-preview]')).toHaveText('1,170 kcal · 57 g protein');
  await confirmLog(page, 'Pad kra pao');
  eaten.kcal += 1170;
  eaten.proteinG += 57.1;
  await expect(entries(page)).toHaveCount(3);
  await expectRings(page, eaten);

  // 4. A quick estimate (takeout).
  await openLog(page, 'quick');
  await logSheet(page).locator('#quick-name').fill('Noodle shop near work');
  await logSheet(page).locator('#quick-kcal').fill('650');
  await logSheet(page).locator('#quick-protein').fill('30');
  await expect(logSheet(page).locator('#quick-carbs')).toHaveCount(0); // Quick mode
  await logSheet(page).locator('[data-quick-log]').click();
  await expect(logSheet(page)).toHaveCount(0);
  await expect(page.locator('[data-undo-toast]')).toContainText('Logged Noodle shop near work');
  eaten.kcal += 650;
  eaten.proteinG += 30;
  await expect(entries(page)).toHaveCount(4);
  await expectRings(page, eaten);
  const quickEntry = entries(page).filter({ hasText: 'Noodle shop near work' });
  await expect(quickEntry.locator('.fuel-entry-macros')).toHaveText('650 kcal · 30 g protein');
  await noHorizontalOverflow(page);
  const quickRings = { kcal: await ring(page, 'kcal'), protein: await ring(page, 'proteinG') };

  // Full mode: carbs + fat rings appear, nothing lost.
  await page.locator('[data-tab="settings"]').click();
  const nutrition = page.locator('[data-nutrition]');
  await nutrition.scrollIntoViewIfNeeded();
  await nutrition.locator('[data-mode="full"]').click();
  await expect(page.locator('[data-nutrition]')).toHaveAttribute('data-nutrition', 'full');
  await expect(page.locator('[data-nutrition] [data-target="carbsG"]')).toBeVisible();
  await goFuel(page);
  await expect(fuelMain(page).locator('[data-ring]')).toHaveCount(4);
  await expect(fuelMain(page).locator('[data-ring="carbsG"]')).toBeVisible();
  await expect(fuelMain(page).locator('[data-ring="fatG"]')).toBeVisible();
  await expect(entries(page)).toHaveCount(4);
  expect(await ring(page, 'kcal')).toEqual(quickRings.kcal);
  expect(await ring(page, 'proteinG')).toEqual(quickRings.protein);
  const fullCarbs = await ring(page, 'carbsG');
  expect(fullCarbs.eaten).toBeGreaterThan(0); // Thai dish + recipe carry carbs
  expect(consistent(fullCarbs)).toBe(true);
  await expect(
    entries(page).filter({ hasText: 'Pad kra pao' }).locator('.fuel-entry-macros'),
  ).toContainText('g carbs');
  // The quick estimate had no carbs/fat: still exactly kcal + protein, not zeros.
  await expect(quickEntry.locator('.fuel-entry-macros')).toHaveText('650 kcal · 30 g protein');
  // Full mode's quick form asks carbs/fat (optional).
  await openLog(page, 'quick');
  await expect(logSheet(page).locator('#quick-carbs')).toBeVisible();
  await logSheet(page).locator('[data-close]').click();
  await expect(logSheet(page)).toHaveCount(0);
  await noHorizontalOverflow(page);

  // Kept across a reload (IndexedDB), and back to Quick loses nothing.
  await page.reload();
  await goFuel(page);
  await expect(entries(page)).toHaveCount(4);
  await expect(fuelMain(page).locator('[data-ring]')).toHaveCount(4);
  expect(await ring(page, 'kcal')).toEqual(quickRings.kcal);
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-nutrition] [data-mode="quick"]').click();
  await expect(page.locator('[data-nutrition]')).toHaveAttribute('data-nutrition', 'quick');
  await goFuel(page);
  await expect(fuelMain(page).locator('[data-ring]')).toHaveCount(2);
  await expect(entries(page)).toHaveCount(4);
  expect(await ring(page, 'proteinG')).toEqual(quickRings.protein);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

/** Weigh-in screen for "today" (re-opened so it reads the current clock). */
async function weighIn(page: Page, kg: string) {
  const wi = page.locator('main[data-screen="weigh-in"]');
  if (await wi.isVisible()) await wi.getByRole('button', { name: 'Back' }).click();
  else await goFuel(page);
  await fuelMain(page).locator('[data-weigh-in]').click();
  await expect(wi).toBeVisible();
  await expect(wi.locator('[data-weigh-today]')).toHaveAttribute('data-weigh-today', 'none');
  await typeNumber(wi.locator('[data-field="weigh-in"] .nf-value'), kg);
  await wi.locator('[data-weigh-save]').click();
  await expect(wi.locator('[data-weigh-today]')).toHaveAttribute('data-weigh-today', 'saved');
  return wi;
}

/** Two weeks of morning weigh-ins: setup on Mon 2 Nov (`w1`), then Tue–Thu; Mon–Thu 9–12 Nov (`w2`). */
async function twoWeeks(page: Page, w1: string, w2: string) {
  await goFuel(page);
  await setUpTargets(page, w1); // the first weigh-in (Mon 2 Nov)
  for (const day of [3, 4, 5]) {
    await page.clock.setSystemTime(at(day, 7));
    await weighIn(page, w1);
  }
  await page.clock.setSystemTime(at(9, 7));
  const wi = await weighIn(page, w2);
  // A new week, but only one full week of data: "need more weigh-ins", nothing to accept.
  const card = wi.locator('[data-weekly-card]');
  await expect(card).toHaveAttribute('data-kind', 'needData');
  await expect(card).toHaveAttribute('data-change', 'none');
  await expect(card.locator('[data-weekly-accept]')).toHaveCount(0);
  for (const day of [10, 11, 12]) {
    await page.clock.setSystemTime(at(day, 7));
    await weighIn(page, w2);
  }
  await page.locator('main[data-screen="weigh-in"]').getByRole('button', { name: 'Back' }).click();
  await expect(fuelMain(page)).toBeVisible();
  await page.clock.setSystemTime(at(16, 7)); // Monday: last week vs the week before
}

test('weigh-ins over 2 fake weeks → weekly card → Accept → the new kcal target', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { requests, errors } = record(page);
  await openApp(page, at(2, 7));
  // 70.0 → 70.1 kg is +0.14 %/week, below the 0.25–0.5 % range: suggest +150 kcal.
  await twoWeeks(page, '70.0', '70.1');

  await goFuel(page);
  const before = await ring(page, 'kcal');
  await fuelMain(page).locator('[data-weigh-in]').click();
  const wi = page.locator('main[data-screen="weigh-in"]');
  const card = wi.locator('[data-weekly-card]');
  await expect(card).toHaveAttribute('data-kind', 'up');
  await expect(card).toHaveAttribute('data-change', 'some');
  await expect(card.locator('#wi-card-title')).toHaveText('Add 150 kcal a day?');
  await expect(wi.locator('[data-trend-chart="drawn"] .wc-dot')).toHaveCount(8);
  await expectTapTargets(page, 'main[data-screen="weigh-in"]');
  await noHorizontalOverflow(page);
  await card.locator('[data-weekly-accept]').click();
  await expect(card).toHaveCount(0); // decided: never shown again this week

  await wi.getByRole('button', { name: 'Back' }).click();
  await expect(fuelMain(page)).toBeVisible();
  const after = await ring(page, 'kcal');
  expect(after.target).toBe(before.target + 150);
  expect(after.left).toBe(before.left + 150);

  // Stored: the new target and the answer survive a reload.
  await page.reload();
  await goFuel(page);
  expect((await ring(page, 'kcal')).target).toBe(before.target + 150);
  await fuelMain(page).locator('[data-weigh-in]').click();
  await expect(page.locator('main[data-screen="weigh-in"]')).toBeVisible();
  await expect(page.locator('[data-weekly-card]')).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test('weekly check at the top of the surplus range → an info card with nothing to accept', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const { requests, errors } = record(page);
  await openApp(page, at(2, 7));
  await twoWeeks(page, '70.0', '70.1');

  // Surplus already at its 600 kcal top: the slow gain can't raise it further.
  await page.locator('[data-tab="settings"]').click();
  const surplus = page.locator('[data-nutrition] [data-field="surplus"] .nf-value');
  await surplus.scrollIntoViewIfNeeded();
  await typeNumber(surplus, '600');
  await goFuel(page);
  const before = await ring(page, 'kcal');

  await fuelMain(page).locator('[data-weigh-in]').click();
  const wi = page.locator('main[data-screen="weigh-in"]');
  const card = wi.locator('[data-weekly-card]');
  await expect(card).toHaveAttribute('data-kind', 'up');
  await expect(card).toHaveAttribute('data-change', 'none');
  await expect(card.locator('#wi-card-title')).toHaveText('Your target stays the same');
  await expect(card.locator('[data-weekly-accept]')).toHaveCount(0);
  await card.locator('[data-weekly-dismiss]').click(); // "Got it" records the answer
  await expect(card).toHaveCount(0);
  await wi.getByRole('button', { name: 'Back' }).click();
  expect((await ring(page, 'kcal')).target).toBe(before.target);

  await page.reload();
  await goFuel(page);
  await fuelMain(page).locator('[data-weigh-in]').click();
  await expect(page.locator('main[data-screen="weigh-in"]')).toBeVisible();
  await expect(page.locator('[data-weekly-card]')).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test('delete an entry → the rings drop it → Undo puts it back', async ({ page, baseURL }) => {
  const { requests, errors } = record(page);
  await openApp(page, at(11, 12));
  await goFuel(page);
  await setUpTargets(page);
  await openLog(page, 'thai');
  await logSheet(page).locator(`[data-log-item="thai:${PAD_KRA_PAO}"]`).click();
  await confirmLog(page, 'Pad kra pao');
  await expect(entries(page)).toHaveCount(1);
  const logged = await ring(page, 'kcal');
  expect(logged.eaten).toBe(836);

  const row = entries(page).first();
  const id = await row.getAttribute('data-entry');
  await row.locator('[data-entry-delete]').click(); // no confirm dialog
  await expect(entries(page)).toHaveCount(0);
  await expect(fuelMain(page).locator('[data-entries="none"]')).toBeVisible();
  expect((await ring(page, 'kcal')).eaten).toBe(0);
  const toast = page.locator('[data-undo-toast]');
  await expect(toast).toContainText('Deleted Pad kra pao');
  await expectTapTargets(page, '[data-undo-toast]');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(entries(page)).toHaveCount(1);
  await expect(fuelMain(page).locator(`[data-entry="${id}"]`)).toBeVisible();
  expect(await ring(page, 'kcal')).toEqual(logged);

  // The restore is stored, not just drawn.
  await page.reload();
  await goFuel(page);
  await expect(fuelMain(page).locator(`[data-entry="${id}"]`)).toBeVisible();

  expect(offDevice(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test("coach's What should I eat? → Log → Fuel shows the entry", async ({ page, baseURL }) => {
  const { requests, errors } = record(page);
  await openApp(page, at(11, 12));
  await goFuel(page);
  await setUpTargets(page);
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-screen="today"]')).toBeVisible();

  await page.locator('[data-coach-open]').click();
  const coach = page.getByRole('dialog', { name: 'Coach' });
  await expect(coach).toBeVisible();
  await coach.locator('[data-coach-chip="food"]').click();
  const card = coach.locator('[data-food-card]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-food-row]')).toHaveCount(3);
  // The placeholder Protein shake (no label numbers yet) is never suggested.
  await expect(card).not.toContainText('Protein shake');
  await expectTapTargets(page, '[data-food-card]');
  const name = ((await card.locator('[data-food-row="0"]').textContent()) ?? '').trim();
  await card.locator('[data-food-log="0"]').click();
  await expect(card.locator('[data-food-logged="0"]')).toBeVisible();
  await expect(page.locator('[data-undo-toast]')).toContainText('Logged');
  await coach.getByRole('button', { name: 'Close' }).click();
  await expect(coach).toHaveCount(0);

  await goFuel(page);
  await expect(entries(page)).toHaveCount(1);
  const label = (
    (await entries(page).first().locator('.fuel-entry-name').textContent()) ?? ''
  ).trim();
  expect(name).toContain(label);
  const k = await ring(page, 'kcal');
  expect(k.eaten).toBeGreaterThan(0);
  expect(consistent(k)).toBe(true);

  // Shown, not spoken (not mid-set).
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test('production build: food search works offline after the first load', async ({ page }) => {
  test.setTimeout(120_000);
  const url = `https://localhost:${PWA_PORT}/`;
  const { requests, errors } = record(page);
  await openApp(page, at(11, 12), url);
  // The service worker installs on the first load and controls the next one.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await goFuel(page);
  await setUpTargets(page);
  await openLog(page, 'search');
  const search = logSheet(page).locator('#log-search');
  await search.fill('chicken breast');
  const results = logSheet(page).locator('[data-search-results] [data-log-item^="usda:"]');
  await expect(results.first()).toBeVisible({ timeout: 15_000 });
  await logSheet(page).locator('[data-close]').click();

  // Airplane mode, and a cold start: the food list comes from the service worker's cache.
  await page.context().setOffline(true);
  await page.reload();
  await goFuel(page);
  await expect(fuelMain(page).locator('[data-ring="kcal"]')).toBeVisible();
  await openLog(page, 'search');
  await logSheet(page).locator('#log-search').fill('egg');
  await expect(logSheet(page).locator('[data-search-state="offline"]')).toHaveCount(0);
  await expect(results.first()).toBeVisible({ timeout: 15_000 });
  await results.first().click();
  await logSheet(page).locator('[data-log-confirm]').click();
  await expect(logSheet(page)).toHaveCount(0);
  await expect(entries(page)).toHaveCount(1);
  await page.context().setOffline(false);

  expect(offDevice(requests, new URL(url).origin)).toEqual([]);
  expect(errors).toEqual([]);
});
