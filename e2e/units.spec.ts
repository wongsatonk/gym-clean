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
// Nothing here is spoken (no mid-set screen); no request leaves the dev server.
//
// UNITS_SHOT=1 also writes docs/screenshots/m13d-units-page.png and m13d-settings-units.png.
import { expect, test, type Page } from './fixtures';
import {
  at,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
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
