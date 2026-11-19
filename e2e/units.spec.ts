// M13d tasks 12 + 14 (SPEC M13d Goal 3, Decision "M13d answers"): Units up front.
//
// Part 1, the screens on their harness pages (task 12, green now), 390×844 with touch:
// - The first-run Units page (src/ui/onboarding/onboarding.harness.html, the units step): two
//   named choices (Weight unit kg | lb, Height and body unit cm | ft·in), the preselection shown
//   pressed, each option ≥ 56px tall and its word ≥ 20px, ≤ 30 words, no sideways scroll, a tap
//   reports both units once, Next moves on.
// - Settings → Units (src/ui/screens/settingsUnits.harness.html): the section is "Units" with both
//   choices; taps report; the weight buttons keep their `data-unit` hooks.
// Part 2, the app (task 14, main wires app.ts; RED until then):
// - Fresh install, locale en-US → Units preselects lb + ft·in → Next stores 'unit' lb +
//   'lengthUnit' in → Set up Fuel (first run) shows ft + in and lb → Today → Fuel → Measurements
//   shows inches.
// - Fresh install, locale th-TH → kg + cm preselected, stored on Next.
// - An existing install (no 'lengthUnit' row) is unchanged whatever the locale: Settings → Units
//   shows the saved weight unit, tape follows it (kg → cm, lb → in), nothing new is stored.
// Part 3, the unit switch on each measure page (task 13c, green now), on
// src/ui/fuel/unitSwitchPages.harness.html: Set up Fuel (kg | lb by Today's weight, cm | ft·in by
// Height), the weigh-in (kg | lb by the stepper), Measurements (cm | in heading the list). A tap
// re-shows the field from the metric value it holds (70.0 kg → 154.3 lb → 70.0 kg,
// 170 cm → 5 ft 7 in → 170 cm, 80 cm → 31.5 in → 80 cm), reports the whole preference once, and
// saves nothing; Save afterwards stores exactly the metric value.
// Part 4, the app (task 14b, app.ts sends every onUnits to setUnitPrefs + app state): a switch on
// Set up Fuel → Save → the 'unit' row, Settings → Units and a workout started afterwards (its
// weight stepper, left before Set done: no set row) show the new unit, the weigh-in stays in kg;
// the weigh-in and Measurements switches change the rows too.
// Nothing here is spoken before the workout starts; no request leaves the dev server.
//
// UNITS_SHOT=1 also writes docs/screenshots/m13d-units-page.png and m13d-settings-units.png;
// UNIT_PAGES_SHOT=1 writes m13d-fuel-setup-switch.png, m13d-weighin-switch.png,
// m13d-measurements-switch.png and the four-frame sheet m13d-unit-switch-pages.png.
import { expect, test, type Page } from './fixtures';
import {
  at,
  getRows,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

const SHOT = !!process.env.UNITS_SHOT;
const NOW = at(13, 18);
const WEIGHT = 'Weight unit';
const LENGTH = 'Height and body unit';

const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const option = (page: Page, name: string, word: string) =>
  group(page, name).getByRole('button', { name: word, exact: true });

async function expectChosen(page: Page, weight: 'kg' | 'lb', length: 'cm' | 'ft·in') {
  for (const [name, words, want] of [
    [WEIGHT, ['kg', 'lb'], weight],
    [LENGTH, ['cm', 'ft·in'], length],
  ] as const)
    for (const w of words)
      await expect(option(page, name, w), `${name} ${w}`).toHaveAttribute(
        'aria-pressed',
        w === want ? 'true' : 'false',
      );
}

/** Every option of both groups ≥ 56px tall (and wide), its word ≥ 20px. */
async function expectBigOptions(page: Page) {
  for (const name of [WEIGHT, LENGTH]) {
    const buttons = group(page, name).getByRole('button');
    await expect(buttons).toHaveCount(2);
    for (const b of await buttons.all()) {
      const box = await b.boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(56);
      expect(box?.width, name).toBeGreaterThanOrEqual(56);
      const fs = await b.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fs, name).toBeGreaterThanOrEqual(20);
    }
  }
}

const harnessLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { harnessLog?: string[] }).harnessLog ?? []);

// ---------------------------------------------------------------- Part 1: harness pages

test.describe('Units page (harness)', () => {
  // web, intake done: [welcome hello, welcome train, units, camera] → the units step is index 2.
  const URL = '/src/ui/onboarding/onboarding.harness.html?platform=web&step=2';

  test('two named choices, the preselection pressed, big targets, ≤ 30 words, taps report', async ({
    page,
  }) => {
    const { errors } = record(page);
    await page.goto(`${URL}&units=lb,in`);
    const screen = page.locator('[data-screen="welcome"]');
    await expect(screen.locator('[data-ob="page"]')).toHaveAttribute('data-step', 'units');
    await expect(page.getByRole('dialog', { name: 'Units' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    await expectChosen(page, 'lb', 'ft·in');
    await expectBigOptions(page);
    await noHorizontalOverflow(page);

    // Visible words over each choice.
    await expect(screen.locator('.ob-units-label')).toHaveText(['Weight', 'Height and body']);
    const body = screen.locator('[data-ob="body"]');
    expect(
      await body.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(20);
    const words = (await screen.locator('[data-ob="page"]').innerText())
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length, words.join(' ')).toBeLessThanOrEqual(30);
    // The whole page fits the first viewport with Back / Next on screen.
    const next = screen.locator('[data-ob="primary"]');
    const nb = await next.boundingBox();
    expect((nb?.y ?? 0) + (nb?.height ?? 0)).toBeLessThanOrEqual(844);

    if (SHOT) await page.screenshot({ path: 'docs/screenshots/m13d-units-page.png' });

    // The chosen option reports nothing; the other reports both units once.
    await option(page, WEIGHT, 'lb').tap();
    await option(page, WEIGHT, 'kg').tap();
    await option(page, LENGTH, 'cm').tap();
    await expectChosen(page, 'kg', 'cm');
    expect(await harnessLog(page)).toEqual(['units kg in', 'units kg cm']);

    await next.tap();
    expect((await harnessLog(page)).at(-1)).toBe('next');
    expect(errors).toEqual([]);
  });

  test('no preselection passed → kg + cm', async ({ page }) => {
    await page.goto(URL);
    await expect(group(page, WEIGHT)).toBeVisible();
    await expectChosen(page, 'kg', 'cm');
  });
});

test.describe('Settings → Units (harness)', () => {
  const URL = '/src/ui/screens/settingsUnits.harness.html';

  test('Units holds Weight and Height and body; taps report; weight hooks kept', async ({
    page,
  }) => {
    const { errors } = record(page);
    await page.goto(`${URL}?unit=lb&length=in`);
    const sec = page.locator('[data-section="unit"]');
    await expect(sec.getByRole('heading', { name: 'Units' })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expectChosen(page, 'lb', 'ft·in');
    await expectBigOptions(page);
    await noHorizontalOverflow(page);
    await expect(sec.locator('[data-unit]')).toHaveCount(2); // e2e elsewhere uses [data-unit=lb]
    await expect(sec).toContainText('Height in feet and inches, tape in inches.');

    if (SHOT) {
      await sec.evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: 'docs/screenshots/m13d-settings-units.png' });
    }

    await option(page, LENGTH, 'cm').tap();
    await expectChosen(page, 'lb', 'cm');
    await expect(sec).toContainText('Height and tape in cm.');
    await option(page, WEIGHT, 'kg').tap();
    await expectChosen(page, 'kg', 'cm');
    expect(await harnessLog(page)).toEqual(['length cm', 'unit kg']);
    expect(errors).toEqual([]);
  });

  test('no lengthUnit row → height follows the weight unit (lb → ft·in)', async ({ page }) => {
    await page.goto(`${URL}?unit=lb`);
    await expectChosen(page, 'lb', 'ft·in');
  });
});

// ---------------------------------------------------------------- Part 2: the app (task 14)

const welcome = (page: Page) => page.locator('[data-screen="welcome"]');
const obStep = (page: Page) => welcome(page).locator('[data-ob="page"]');
const primary = (page: Page) => welcome(page).locator('[data-ob="primary"]');
const intake = (page: Page) => page.locator('main[data-screen="intake"]');
const fuelSetup = (page: Page) => page.locator('main[data-screen="fuel-setup"]');
const measurements = (page: Page) => page.locator('main[data-screen="measurements"]');

async function openFresh(page: Page): Promise<void> {
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
}

/** Next through the welcome pages until the Units page shows. */
async function toUnitsPage(page: Page): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((await obStep(page).getAttribute('data-step')) === 'units') break;
    await primary(page).tap();
  }
  await expect(obStep(page)).toHaveAttribute('data-step', 'units');
  await expect(group(page, WEIGHT)).toBeVisible();
}

/** The intake as in first-run.spec.ts: lose fat, 3 days, 45 min, new, no easy-on, no abs. */
async function answerAll(page: Page): Promise<void> {
  const pick = async (id: string, values: string[], next: string) => {
    await expect(intake(page)).toHaveAttribute('data-step', id);
    for (const v of values) await intake(page).locator(`[data-option="${v}"]`).tap();
    await intake(page).locator('[data-intake-next]').tap();
    await expect(intake(page)).toHaveAttribute('data-step', next);
  };
  await pick('goal', ['fat'], 'days');
  await pick('days', ['3'], 'length');
  await pick('length', ['45'], 'experience');
  await pick('experience', ['new'], 'easyOn');
  await pick('easyOn', [], 'wantsCore');
  await pick('wantsCore', [], 'summary');
}

test.describe('fresh install, en-US', () => {
  test.use({ firstRun: 'fresh', locale: 'en-US' });

  test('Units preselects lb + ft·in → Set up Fuel in ft·in and lb → Measurements in inches', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openFresh(page);
    await toUnitsPage(page);
    await expectChosen(page, 'lb', 'ft·in'); // task 14: app.ts passes defaultUnits(deviceLocale())
    await primary(page).tap();
    // The units step saves both rows before the next step.
    await expect.poll(() => getSetting(page, 'unit')).toBe('lb');
    await expect.poll(() => getSetting(page, 'lengthUnit')).toBe('in');

    // On to the intake (the iPhone app has the Health page first; the web goes straight there).
    await expect(intake(page)).toBeVisible();
    await answerAll(page);
    const fuelBtn = intake(page).locator('[data-apply="fuel"]');
    await fuelBtn.tap();
    await expect(fuelBtn).toHaveAttribute('data-applied', 'true');
    await intake(page).locator('[data-intake-done]').tap();

    // Set up Fuel: height as feet + inches, today's weight in lb.
    const setup = fuelSetup(page);
    await expect(setup).toBeVisible();
    await expect(setup.locator('[data-field="height"] [data-part="ft"]')).toBeVisible();
    await expect(setup.locator('[data-field="height"] [data-part="in"]')).toBeVisible();
    await expect(setup.locator('[data-field="weight"] .nf-unit')).toHaveText('lb');
    await noHorizontalOverflow(page);
    await setup.locator('[data-field="sex"] [data-choice="female"]').tap();
    await setup.locator('[data-field="activity"] [data-choice="moderate"]').tap();
    await setup.locator('[data-setup-save]').tap();

    // The web's last page (camera): Not now → Today.
    await expect(welcome(page).locator('[data-permission="camera"]')).toBeVisible();
    await welcome(page).locator('[data-ob="not-now"]').tap();
    await expect(page.locator('[data-cal]').first()).toBeVisible();

    // Fuel → Measurements: tape in inches.
    await page.locator('[data-tab="fuel"]').tap();
    await page.locator('[data-measurements-open]').tap();
    await expect(measurements(page)).toBeVisible();
    await measurements(page).locator('[data-site-toggle="waist"]').tap();
    await expect(measurements(page).locator('[data-field="site-waist"] .nf-unit')).toHaveText('in');

    // Settings → Units shows the same (Measurements is a sub-screen with no tab bar: Back first).
    await measurements(page).locator('.fuel-back').tap();
    await page.locator('[data-tab="settings"]').tap();
    await expectChosen(page, 'lb', 'ft·in');

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('fresh install, th-TH', () => {
  test.use({ firstRun: 'fresh', locale: 'th-TH' });

  test('Units preselects kg + cm and stores them on Next', async ({ page }) => {
    const { errors } = record(page);
    await openFresh(page);
    await toUnitsPage(page);
    await expectChosen(page, 'kg', 'cm');
    await primary(page).tap();
    await expect.poll(() => getSetting(page, 'unit')).toBe('kg');
    await expect.poll(() => getSetting(page, 'lengthUnit')).toBe('cm');
    await expect(intake(page)).toBeVisible();
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a choice changed on the page is what gets stored', async ({ page }) => {
    await openFresh(page);
    await toUnitsPage(page);
    await option(page, LENGTH, 'ft·in').tap();
    await expectChosen(page, 'kg', 'ft·in');
    await primary(page).tap();
    await expect.poll(() => getSetting(page, 'lengthUnit')).toBe('in');
    await expect.poll(() => getSetting(page, 'unit')).toBe('kg');
  });
});

test.describe('existing install (no lengthUnit row), en-US', () => {
  // firstRun 'skip' = an install that already went through the first run.
  test.use({ locale: 'en-US' });

  async function openSettingsUnits(page: Page) {
    await page.locator('[data-tab="settings"]').tap();
    await expect(page.locator('[data-section="unit"]')).toBeVisible();
  }

  test('kg stays kg and tape stays cm whatever the locale; nothing new is stored', async ({
    page,
  }) => {
    const { errors } = record(page);
    await installMocks(page);
    await page.clock.install({ time: NOW });
    await page.goto('/');
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await expect(welcome(page)).toHaveCount(0);
    await openSettingsUnits(page);
    await expectChosen(page, 'kg', 'cm');
    expect(await getSetting(page, 'unit')).toBeUndefined();
    expect(await getSetting(page, 'lengthUnit')).toBeUndefined();

    await page.locator('[data-tab="fuel"]').tap();
    await page.locator('[data-measurements-open]').tap();
    await measurements(page).locator('[data-site-toggle="waist"]').tap();
    await expect(measurements(page).locator('[data-field="site-waist"] .nf-unit')).toHaveText('cm');
    expect(errors).toEqual([]);
  });

  test('weight switched to lb: tape follows it (in), Height shows ft·in, no lengthUnit row', async ({
    page,
  }) => {
    await installMocks(page);
    await page.clock.install({ time: NOW });
    await page.goto('/');
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await openSettingsUnits(page);
    await option(page, WEIGHT, 'lb').tap();
    await expect.poll(() => getSetting(page, 'unit')).toBe('lb');
    await page.reload();
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await openSettingsUnits(page);
    await expectChosen(page, 'lb', 'ft·in');
    expect(await getSetting(page, 'lengthUnit')).toBeUndefined();

    await page.locator('[data-tab="fuel"]').tap();
    await page.locator('[data-measurements-open]').tap();
    await measurements(page).locator('[data-site-toggle="waist"]').tap();
    await expect(measurements(page).locator('[data-field="site-waist"] .nf-unit')).toHaveText('in');
  });
});

// ---------------------------------------------------------------- Part 3: switch on each page (13c)

const PAGES = '/src/ui/fuel/unitSwitchPages.harness.html';
type HarnessEvent = [string, unknown];
const events = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { harnessEvents: [string, unknown][] }).harnessEvents,
  ) as Promise<HarnessEvent[]>;
const unitsCalls = async (page: Page) =>
  (await events(page)).filter(([k]) => k === 'units').map(([, u]) => u);

async function openPage(page: Page, v: string, units = 'kg,cm') {
  const rec = record(page);
  await page.goto(`${PAGES}?v=${v}&units=${units}`);
  await expect(page.locator('[data-unit-switch]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return rec;
}

/** The switch (a named group) next to the field `forId`, its options ≥ 56px, words ≥ 20px. */
async function expectSwitch(page: Page, forId: string, name: string, words: string[]) {
  const g = page.locator(`[data-unit-for="${forId}"]`);
  await expect(g).toHaveAttribute('role', 'group');
  await expect(g).toHaveAttribute('aria-label', name);
  for (const w of words) {
    const b = g.getByRole('button', { name: w, exact: true });
    const box = await b.boundingBox();
    expect(box?.height, `${name} ${w}`).toBeGreaterThanOrEqual(56);
    expect(box?.width, `${name} ${w}`).toBeGreaterThanOrEqual(56);
    const fs = await b.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fs, `${name} ${w}`).toBeGreaterThanOrEqual(20);
  }
  return g;
}

const value = (page: Page, field: string) => page.locator(`[data-field="${field}"] .nf-value`);
const ftIn = (page: Page) =>
  Promise.all(
    ['ft', 'in'].map((p) =>
      page.locator(`[data-field="height"] [data-part="${p}"] .nf-value`).inputValue(),
    ),
  );

test.describe('unit switch on each measure page (harness)', () => {
  test('Set up Fuel: kg | lb and cm | ft·in, no drift, nothing saved, Save stores the metric', async ({
    page,
  }) => {
    const { errors } = await openPage(page, 'setup');
    const setup = fuelSetup(page);
    const w = await expectSwitch(page, 'weight', 'Weight unit', ['kg', 'lb']);
    const ht = await expectSwitch(page, 'height', 'Height unit', ['cm', 'ft·in']);
    await noHorizontalOverflow(page);
    // The switch sits on its field's label row, at the end.
    const label = await setup.locator('[data-field="weight"] .nf-label').boundingBox();
    const sw = await w.boundingBox();
    expect(
      Math.abs((label?.y ?? 0) + (label?.height ?? 0) / 2 - ((sw?.y ?? 0) + (sw?.height ?? 0) / 2)),
    ).toBeLessThan(20);
    expect((sw?.x ?? 0) + (sw?.width ?? 0)).toBeGreaterThan(300);

    await expect(value(page, 'weight')).toHaveValue('70.0');
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await expect(value(page, 'weight')).toHaveValue('154.3');
    await expect(setup.locator('[data-field="weight"] .nf-unit')).toHaveText('lb');
    await w.getByRole('button', { name: 'kg', exact: true }).tap();
    await expect(value(page, 'weight')).toHaveValue('70.0');
    for (let i = 0; i < 3; i++) {
      await w.getByRole('button', { name: 'lb', exact: true }).tap();
      await w.getByRole('button', { name: 'kg', exact: true }).tap();
    }
    await expect(value(page, 'weight')).toHaveValue('70.0');

    await expect(value(page, 'height')).toHaveValue('170');
    await ht.getByRole('button', { name: 'ft·in', exact: true }).tap();
    expect(await ftIn(page)).toEqual(['5', '7']);
    await noHorizontalOverflow(page);
    await ht.getByRole('button', { name: 'cm', exact: true }).tap();
    await expect(value(page, 'height')).toHaveValue('170');

    expect(await unitsCalls(page)).toEqual([
      { weight: 'lb', length: 'cm' },
      { weight: 'kg', length: 'cm' },
      ...Array.from({ length: 3 }, () => [
        { weight: 'lb', length: 'cm' },
        { weight: 'kg', length: 'cm' },
      ]).flat(),
      { weight: 'kg', length: 'in' },
      { weight: 'kg', length: 'cm' },
    ]);
    expect((await events(page)).filter(([k]) => k === 'save')).toEqual([]);

    // Shown in lb + ft·in, then saved: exactly 70 kg and 170 cm.
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await ht.getByRole('button', { name: 'ft·in', exact: true }).tap();
    await setup.locator('[data-field="sex"] [data-choice="female"]').tap();
    await setup.locator('[data-field="activity"] [data-choice="moderate"]').tap();
    await setup.locator('[data-setup-save]').tap();
    const saved = (await events(page)).filter(([k]) => k === 'save');
    expect(saved).toEqual([
      [
        'save',
        { heightCm: 170, birthYear: 1994, sex: 'female', activity: 'moderate', weightKg: 70 },
      ],
    ]);
    expect(await page.evaluate(() => window.__spoken ?? [])).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('weigh-in: kg | lb by the stepper, no drift, the trend re-labelled, Save stores kg', async ({
    page,
  }) => {
    const { errors } = await openPage(page, 'weighin');
    const w = await expectSwitch(page, 'weigh-in', 'Weight unit', ['kg', 'lb']);
    await noHorizontalOverflow(page);
    await expect(value(page, 'weigh-in')).toHaveValue('70.0');
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await expect(value(page, 'weigh-in')).toHaveValue('154.3');
    // The chart's top label follows the unit (≈ 156 lb vs ≈ 71 kg).
    const topLabel = () =>
      page.locator('[data-trend-chart="drawn"] .wc-axis').first().textContent();
    expect(Number(await topLabel())).toBeGreaterThan(140);
    await w.getByRole('button', { name: 'kg', exact: true }).tap();
    await expect(value(page, 'weigh-in')).toHaveValue('70.0');
    expect(Number(await topLabel())).toBeLessThan(80);
    expect(await unitsCalls(page)).toEqual([
      { weight: 'lb', length: 'cm' },
      { weight: 'kg', length: 'cm' },
    ]);
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await page.locator('[data-weigh-save]').tap();
    expect((await events(page)).filter(([k]) => k === 'save')).toEqual([['save', 70]]);
    expect(errors).toEqual([]);
  });

  test('Measurements: cm | in heading the list, no drift, Save stores cm', async ({ page }) => {
    const { errors } = await openPage(page, 'measurements');
    const ms = measurements(page);
    const g = await expectSwitch(page, 'tape', 'Measurement unit', ['cm', 'in']);
    await noHorizontalOverflow(page);
    await ms.locator('[data-site-toggle="waist"]').tap();
    await expect(value(page, 'site-waist')).toHaveValue('80.0');
    await g.getByRole('button', { name: 'in', exact: true }).tap();
    await expect(value(page, 'site-waist')).toHaveValue('31.5');
    await expect(ms.locator('[data-field="site-waist"] .nf-unit')).toHaveText('in');
    await expect(ms.locator('[data-site-last="waist"]')).toContainText('31.5 in');
    await g.getByRole('button', { name: 'cm', exact: true }).tap();
    await expect(value(page, 'site-waist')).toHaveValue('80.0');
    expect(await unitsCalls(page)).toEqual([
      { weight: 'kg', length: 'in' },
      { weight: 'kg', length: 'cm' },
    ]);
    await g.getByRole('button', { name: 'in', exact: true }).tap();
    await ms.locator('[data-measure-save]').tap();
    expect((await events(page)).filter(([k]) => k === 'save')).toEqual([
      ['save', [{ date: '2026-11-18', site: 'waist', cm: 80 }]],
    ]);
    expect(errors).toEqual([]);
  });
});

test.describe('unit switch pages screenshots (opt-in)', () => {
  test.use({ deviceScaleFactor: 2, colorScheme: 'dark' });

  test('writes m13d-*-switch.png and the m13d-unit-switch-pages.png sheet at 390×844', async ({
    page,
  }) => {
    test.skip(!process.env.UNIT_PAGES_SHOT, 'set UNIT_PAGES_SHOT=1 to write the screenshots');
    const frames: Buffer[] = [];
    const shot = async (path?: string) => {
      await page.mouse.move(0, 0);
      const png = await page.screenshot(path ? { path } : {});
      frames.push(png);
    };
    // Set up Fuel switched to lb + ft·in: the Height switch (top), then Today's weight.
    const { errors } = await openPage(page, 'setup');
    await page.locator('[data-unit-for="height"]').getByRole('button', { name: 'ft·in' }).tap();
    await page.locator('[data-unit-for="weight"]').getByRole('button', { name: 'lb' }).tap();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot('docs/screenshots/m13d-fuel-setup-switch.png');
    await page
      .locator('[data-field="weight"]')
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot();
    // The weigh-in in lb.
    await openPage(page, 'weighin');
    await page.locator('[data-unit-for="weigh-in"]').getByRole('button', { name: 'lb' }).tap();
    await shot('docs/screenshots/m13d-weighin-switch.png');
    // Measurements in inches with the waist open.
    await openPage(page, 'measurements');
    await page.locator('[data-site-toggle="waist"]').tap();
    await page.locator('[data-unit-for="tape"]').getByRole('button', { name: 'in' }).tap();
    await shot('docs/screenshots/m13d-measurements-switch.png');

    // The sheet: the four 390×844 frames side by side.
    await page.setViewportSize({ width: 390 * 4 + 16 * 3, height: 844 });
    await page.setContent(
      `<body style="margin:0;background:#000;display:flex;gap:16px">${frames
        .map(
          (f) =>
            `<img width="390" height="844" src="data:image/png;base64,${f.toString('base64')}">`,
        )
        .join('')}</body>`,
    );
    await page.screenshot({ path: 'docs/screenshots/m13d-unit-switch-pages.png' });
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------- Part 4: app-wide (14b)

test.describe('a page switch changes the unit app-wide (task 14b wiring)', () => {
  test.use({ locale: 'th-TH' });

  test('Set up Fuel: lb → Save → stored rows, Settings → Units, Fuel and a new workout show lb; the weigh-in stays kg', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openApp(page, NOW);
    const setsBefore = await getRows(page, 'sets');
    await page.locator('[data-tab="fuel"]').tap();
    await page.locator('main[data-screen="fuel"] [data-setup]').tap();
    const setup = fuelSetup(page);
    await expect(setup).toBeVisible();
    const w = setup.locator('[data-unit-for="weight"]');
    await expect(value(page, 'weight')).toHaveValue('70.0');
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await expect(value(page, 'weight')).toHaveValue('154.3');
    await expect.poll(() => getSetting(page, 'unit')).toBe('lb'); // app-wide at once, no Save
    await w.getByRole('button', { name: 'kg', exact: true }).tap();
    await expect(value(page, 'weight')).toHaveValue('70.0');
    await expect.poll(() => getSetting(page, 'unit')).toBe('kg');
    await w.getByRole('button', { name: 'lb', exact: true }).tap();
    await expect.poll(() => getSetting(page, 'unit')).toBe('lb');
    await expect(value(page, 'weight')).toHaveValue('154.3');
    await setup.locator('[data-field="sex"] [data-choice="female"]').tap();
    await setup.locator('[data-field="activity"] [data-choice="moderate"]').tap();
    await setup.locator('[data-setup-save]').tap();
    await expect(page.locator('main[data-screen="fuel"] [data-ring="kcal"]')).toBeVisible();

    // Stored: the preference rows; the weigh-in in kg (exactly what the field held).
    expect(await getSetting(page, 'unit')).toBe('lb');
    expect(await getSetting(page, 'lengthUnit')).toBe('cm');
    const weighIns = await getRows<{ kg: number }>(page, 'weighIns');
    expect(weighIns.map((x) => x.kg)).toEqual([70]);

    // The weigh-in page opens in lb; Settings → Units shows lb.
    await page.locator('[data-weigh-in]').tap();
    await expect(value(page, 'weigh-in')).toHaveValue('154.3');
    await expect(page.locator('[data-field="weigh-in"] .nf-unit')).toHaveText('lb');
    await page.locator('main[data-screen="weigh-in"] .fuel-back').tap();
    await page.locator('[data-tab="settings"]').tap();
    await expectChosen(page, 'lb', 'cm');
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);

    // A workout started now steps its weight in lb (the stepper reads the app-wide unit).
    await page.locator('[data-tab="today"]').tap();
    await page.locator('main[data-screen="today"] [data-start]').first().tap();
    await page.getByRole('button', { name: 'Start workout' }).tap();
    await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
    const stepper = page.locator('[data-stepper="weight"]');
    await expect(stepper.getByLabel('lb', { exact: true })).toBeVisible();
    await expect(stepper.locator('.st-label small')).toHaveText('lb');
    await expect(stepper.getByLabel('kg', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'lb plus' })).toBeVisible();
    // The start cue is a focus cue; nothing spoken names kilograms.
    const spoken = (await page.evaluate(() => window.__spoken)) ?? [];
    expect(spoken.join(' ')).not.toMatch(/kilo|\bkg\b/i);
    // Left before Set done: no set row was written by any of this.
    expect(await getRows(page, 'sets')).toEqual(setsBefore);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('weigh-in and Measurements switches change the rows; nothing is converted', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { errors } = record(page);
    await openApp(page, NOW);
    await page.locator('[data-tab="fuel"]').tap();
    await page.locator('[data-weigh-in]').tap();
    await page
      .locator('[data-unit-for="weigh-in"]')
      .getByRole('button', { name: 'lb', exact: true })
      .tap();
    await expect.poll(() => getSetting(page, 'unit')).toBe('lb');
    await page.locator('main[data-screen="weigh-in"] .fuel-back').tap();

    await page.locator('[data-measurements-open]').tap();
    const ms = measurements(page);
    await ms.locator('[data-site-toggle="waist"]').tap();
    await ms
      .locator('[data-unit-for="tape"]')
      .getByRole('button', { name: 'in', exact: true })
      .tap();
    await expect.poll(() => getSetting(page, 'lengthUnit')).toBe('in');
    await expect(ms.locator('[data-field="site-waist"] .nf-unit')).toHaveText('in');
    await ms.locator('.fuel-back').tap();
    expect(await getRows(page, 'weighIns')).toEqual([]);
    expect(await getRows(page, 'measurements')).toEqual([]);

    await page.locator('[data-tab="settings"]').tap();
    await expectChosen(page, 'lb', 'ft·in');
    expect(errors).toEqual([]);
  });
});
