// M13d tasks 8, 13 and 3b: Set up Fuel's pre-fill, height in ft + in and the quiet "Not now".
// Made-up numbers only. Two parts:
// - the harness (src/ui/fuel/fuelSetup.harness.html): the "From Apple Health" notes, the ft + in
//   rows, the Not now button: sizes, words, no sideways scroll at 390×844, callbacks;
// - the real app: a lb profile (no 'lengthUnit' row) sets up Fuel in ft + in (stored cm, as
//   typed: 5'7" → 170.18), reopens it unchanged, and Measurements shows inches; a weigh-in that
//   came from Apple Health fills a first setup's weight with "From Apple Health".
// Nothing here is spoken (Set up Fuel is never a mid-set screen): asserted on the app runs.
// - task 9, the iPhone app's first run (fake Capacitor + GymHealth, made-up data): Units →
//   Apple Health → Connect → the intake → Fuel row applied → Set up Fuel shows Health's height,
//   birth year, sex and the weigh-in it gave, each "From Apple Health" → Save → the permission
//   pages → Today. Not now on the Health page: the form as in 1.16.1 (no notes, no profile read).
// FUEL_SETUP_SHOT=1 also writes docs/screenshots/m13d-fuel-setup-prefill.png and
// m13d-fuel-setup-ftin.png (390×844, dark).
import { expect, test, type Locator, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getRows,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  openApp,
  putRows,
  putSetting,
  record,
} from './app.helpers';
import {
  FAKE_HEALTH_PROFILE,
  installFakeHealthProfile,
  type FakeHealthProfileState,
} from '../src/native/fakeHealthProfile';

const HARNESS = '/src/ui/fuel/fuelSetup.harness.html';
const setup = (page: Page) => page.locator('main[data-screen="fuel-setup"]');
const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');

async function openHarness(page: Page, v: 'prefill' | 'ftin'): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${HARNESS}?v=${v}`);
  await expect(setup(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { harnessEvents: unknown[][] }).harnessEvents);

const fontPx = (l: Locator) => l.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

/** Types into a − value + box and commits it (the field reads it on `change`). */
async function typeBox(input: Locator, value: string) {
  await input.fill(value);
  await input.dispatchEvent('change');
}

const part = (page: Page, p: 'ft' | 'in') =>
  setup(page).locator(`[data-field="height"] [data-part="${p}"]`);

test('harness: "From Apple Health" under each pre-filled field, readable and linked', async ({
  page,
}) => {
  const errors = await openHarness(page, 'prefill');
  await noHorizontalOverflow(page);
  const notes = setup(page).locator('[data-from-health]');
  await expect(notes).toHaveCount(4);
  for (const [tag, field] of [
    ['height', 'height'],
    ['birthYear', 'birth-year'],
    ['sex', 'sex'],
    ['weight', 'weight'],
  ] as const) {
    const note = setup(page).locator(`[data-field="${field}"] [data-from-health="${tag}"]`);
    await expect(note).toHaveText('From Apple Health');
    expect(await fontPx(note), tag).toBeGreaterThanOrEqual(20);
  }
  // Screen readers hear it with the field.
  await expect(page.getByRole('textbox', { name: 'Height' })).toHaveAccessibleDescription(
    /From Apple Health/,
  );
  await expect(
    page.getByRole('group', { name: 'Sex (for the calorie estimate)' }),
  ).toHaveAccessibleDescription('From Apple Health');
  await expect(setup(page).locator('[data-field="height"] .nf-value')).toHaveValue('165');
  await expect(setup(page).locator('[data-field="weight"] .nf-value')).toHaveValue('61.2');
  await expectTapTargets(page, 'main[data-screen="fuel-setup"]');
  expect(errors).toEqual([]);
});

test('harness: the quiet Not now leaves without saving; a pick counts as a touch', async ({
  page,
}) => {
  await openHarness(page, 'prefill');
  const notNow = setup(page).getByRole('button', { name: 'Not now', exact: true });
  await expect(notNow).toBeVisible();
  const box = await notNow.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(56);
  expect(await fontPx(notNow)).toBeGreaterThanOrEqual(20);
  // Quiet: no fill, unlike Save.
  const bg = await notNow.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgba(0, 0, 0, 0)');
  await notNow.click();
  expect(await events(page)).toEqual([['touch'], ['notNow']]);
});

test('harness: height in ft + in, typed 5\'7" and carry at 12', async ({ page }) => {
  const errors = await openHarness(page, 'ftin');
  await noHorizontalOverflow(page);
  const ft = part(page, 'ft').locator('.nf-value');
  const inch = part(page, 'in').locator('.nf-value');
  await expect(ft).toHaveValue('5');
  await expect(inch).toHaveValue('7');
  await expect(page.getByRole('group', { name: 'Height' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Height, feet' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Height, inches' })).toBeVisible();
  for (const p of ['ft', 'in'] as const) {
    expect(await fontPx(part(page, p).locator('.nf-value')), p).toBeGreaterThanOrEqual(64);
    for (const dir of ['down', 'up']) {
      const b = await part(page, p).locator(`[data-step="${dir}"]`).boundingBox();
      expect(b?.height, `${p} ${dir}`).toBeGreaterThanOrEqual(56);
      expect(b?.width, `${p} ${dir}`).toBeGreaterThanOrEqual(56);
    }
  }
  await typeBox(inch, '11');
  await part(page, 'in').locator('[data-step="up"]').click();
  await expect(ft).toHaveValue('6');
  await expect(inch).toHaveValue('0');
  await typeBox(ft, '5\'7"');
  await expect(ft).toHaveValue('5');
  await expect(inch).toHaveValue('7');
  await setup(page).locator('[data-choice="male"]').click();
  await setup(page).locator('[data-choice="light"]').click();
  await setup(page).locator('[data-setup-save]').click();
  const saved = (await events(page)).find((e) => e[0] === 'save')?.[1] as { heightCm: number };
  expect(saved.heightCm).toBe(170.18);
  expect(errors).toEqual([]);
});

test('harness screenshots (FUEL_SETUP_SHOT=1)', async ({ page }) => {
  test.skip(!process.env.FUEL_SETUP_SHOT, 'set FUEL_SETUP_SHOT=1 to write the screenshots');
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await openHarness(page, 'prefill');
  await page.screenshot({ path: 'docs/screenshots/m13d-fuel-setup-prefill.png' });
  await openHarness(page, 'ftin');
  await page.screenshot({ path: 'docs/screenshots/m13d-fuel-setup-ftin.png' });
});

test('app, lb profile: Set up Fuel in ft + in, stored as typed; Measurements in inches', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, at(18, 18));
  await putSetting(page, 'unit', 'lb');
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();

  await page.locator('[data-tab="fuel"]').click();
  await fuelMain(page).locator('[data-setup]').click();
  await expect(setup(page)).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await noHorizontalOverflow(page);
  await expectTapTargets(page, 'main[data-screen="fuel-setup"]');
  // Not in the first run: no Not now.
  await expect(setup(page).locator('[data-setup-not-now]')).toHaveCount(0);
  await expect(part(page, 'ft').locator('.nf-value')).toHaveValue('5');
  await expect(part(page, 'in').locator('.nf-value')).toHaveValue('7');
  await typeBox(part(page, 'ft').locator('.nf-value'), '5\'7"');
  await setup(page).locator('[data-choice="female"]').click();
  await setup(page).locator('[data-choice="moderate"]').click();
  await setup(page).locator('[data-setup-save]').click();
  await expect(fuelMain(page).locator('[data-ring="kcal"]')).toBeVisible();
  expect(((await getSetting(page, 'nutrition')) as { heightCm: number }).heightCm).toBe(170.18);

  // Measurements follow the length unit (no row yet: inches with lb).
  await fuelMain(page).locator('[data-measurements-open]').click();
  const ms = page.locator('main[data-screen="measurements"]');
  await expect(ms).toBeVisible();
  await ms.locator('[data-site-toggle="waist"]').click();
  await expect(ms.locator('[data-field="site-waist"] .nf-unit')).toHaveText('in');
  await expect(ms).toContainText('Saved for today in inches.');

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(errors).toEqual([]);
});

test('app: a first setup starts from a weigh-in Apple Health gave, and says so', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, at(18, 18));
  await putRows(page, 'weighIns', [{ date: '2026-11-17', kg: 63.4, source: 'health' }]);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();

  await page.locator('[data-tab="fuel"]').click();
  await fuelMain(page).locator('[data-setup]').click();
  await expect(setup(page)).toBeVisible();
  await expect(setup(page).locator('[data-field="weight"] .nf-value')).toHaveValue('63.4');
  await expect(setup(page).locator('[data-from-health="weight"]')).toHaveText('From Apple Health');
  // Nothing else is claimed from Health (no profile without the iPhone app).
  await expect(setup(page).locator('[data-from-health]')).toHaveCount(1);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// M13d task 9: the iPhone app's first run, Health connected on its page before the intake.

declare global {
  interface Window {
    __gymCleanFakeHealthProfile: FakeHealthProfileState;
    __fakeHealth: { requestRead: unknown[]; read: string[][] };
  }
}

/** Fri 13 Nov 2026, 18:00 local. */
const NOW = at(13, 18);
const welcome = (page: Page) => page.locator('[data-screen="welcome"]');
const obPage = (page: Page) => welcome(page).locator('[data-ob="page"]');
const primary = (page: Page) => welcome(page).locator('[data-ob="primary"]');
const intakeMain = (page: Page) => page.locator('main[data-screen="intake"]');

/**
 * The iPhone app look: `window.Capacitor` says native, GymHealth answers with one made-up 63.4 kg
 * weigh-in this morning (nothing else), then `installFakeHealthProfile` adds `readProfile`
 * (170 cm, 1990, female). Every `requestRead` options object is kept.
 */
async function installNativeHealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log = { requestRead: [] as unknown[], read: [] as string[][] };
    window.__fakeHealth = log;
    const weighIn = { start: new Date(2026, 10, 13, 7, 0).getTime(), kg: 63.4, source: 'Scale' };
    const plugin = {
      isAvailable: async () => ({ available: true }),
      requestRead: async (o: unknown) => {
        log.requestRead.push(o);
        return { requested: true };
      },
      read: async ({ types, since }: { types: string[]; since: number }) => {
        log.read.push([...types]);
        const out: Record<string, unknown> = {};
        for (const t of types)
          out[t] = t === 'bodyMass' && weighIn.start >= since ? [{ ...weighIn }] : [];
        return out;
      },
    };
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { GymHealth: plugin },
    };
  });
  await page.addInitScript(installFakeHealthProfile, FAKE_HEALTH_PROFILE);
}

/** Welcome pages → Units (kept as preselected: kg + cm under en-TH) → the Apple Health page. */
async function toHealthPage(page: Page): Promise<void> {
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
  let sawUnits = false;
  for (let i = 0; i < 6; i++) {
    const key = await obPage(page).getAttribute('data-step');
    if (key === 'permission:health') break;
    if (key === 'units') sawUnits = true;
    await primary(page).tap();
    await expect(obPage(page)).not.toHaveAttribute('data-step', key ?? '');
  }
  expect(sawUnits).toBe(true);
  await expect(obPage(page)).toHaveAttribute('data-step', 'permission:health');
}

/** The intake answered (Lose fat, 3 days, 45 min, new, no easy-on, no abs), Fuel row applied → Done. */
async function intakeWithFuel(page: Page): Promise<void> {
  const intake = intakeMain(page);
  await expect(intake).toBeVisible();
  for (const [id, pick] of [
    ['goal', 'fat'],
    ['days', '3'],
    ['length', '45'],
    ['experience', 'new'],
    ['easyOn', null],
    ['wantsCore', null],
  ] as const) {
    await expect(intake).toHaveAttribute('data-step', id);
    if (pick) await intake.locator(`[data-option="${pick}"]`).tap();
    await intake.locator('[data-intake-next]').tap();
  }
  await expect(intake).toHaveAttribute('data-step', 'summary');
  const apply = intake.locator('[data-apply="fuel"]');
  await apply.tap();
  await expect(apply).toHaveAttribute('data-applied', 'true');
  await intake.locator('[data-intake-done]').tap();
  await expect(setup(page)).toBeVisible();
  await expect(page.locator('[data-onboarding-step="fuelSetup"]')).toBeVisible();
}

/** Camera, mic and reminders pages: Not now on each → Today. */
async function permissionsToToday(page: Page): Promise<void> {
  for (const p of ['camera', 'mic', 'notifications']) {
    await expect(obPage(page)).toHaveAttribute('data-step', `permission:${p}`);
    await welcome(page).locator('[data-ob="not-now"]').tap();
  }
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await expect.poll(() => getSetting(page, 'onboarding')).toEqual({ doneAt: expect.any(Number) });
}

const value = (page: Page, field: string) =>
  setup(page).locator(`[data-field="${field}"] .nf-value`);

test.describe('iPhone app first run (task 9)', () => {
  test.use({ firstRun: 'fresh' });

  test('Health connected first: Set up Fuel shows its height, birth year, sex and weigh-in', async ({
    page,
  }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await installNativeHealth(page);
    await toHealthPage(page);

    // Connect on the Health page, before the intake (task 2's order).
    await expect(intakeMain(page)).toHaveCount(0);
    await primary(page).tap();
    await expect(welcome(page).locator('[data-ob="granted"]')).toBeVisible();
    // Connect asks for the profile too (Wave A follow-up i).
    const asked = await page.evaluate(() => window.__fakeHealth.requestRead);
    expect(asked).toEqual([expect.objectContaining({ profile: true })]);
    await expect
      .poll(async () => (await getRows<{ kg: number; source?: string }>(page, 'weighIns')).length)
      .toBe(1);
    expect(await getRows(page, 'weighIns')).toEqual([
      expect.objectContaining({ date: '2026-11-13', kg: 63.4, source: 'health' }),
    ]);
    await primary(page).tap();

    await intakeWithFuel(page);
    await noHorizontalOverflow(page);
    await expectTapTargets(page, 'main[data-screen="fuel-setup"]');
    await expect(value(page, 'height')).toHaveValue('170');
    await expect(value(page, 'birth-year')).toHaveValue('1990');
    await expect(setup(page).locator('[data-field="sex"] [data-choice="female"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(value(page, 'weight')).toHaveValue('63.4');
    for (const [tag, field] of [
      ['height', 'height'],
      ['birthYear', 'birth-year'],
      ['sex', 'sex'],
      ['weight', 'weight'],
    ] as const) {
      await expect(
        setup(page).locator(`[data-field="${field}"] [data-from-health="${tag}"]`),
        tag,
      ).toHaveText('From Apple Health');
    }
    await expect(setup(page).locator('[data-from-health]')).toHaveCount(4);
    // One profile read for this open; nothing from it is stored before Save.
    expect(await page.evaluate(() => window.__gymCleanFakeHealthProfile.calls)).toBe(1);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();

    await setup(page).locator('[data-field="activity"] [data-choice="moderate"]').tap();
    const save = setup(page).locator('[data-setup-save]');
    await expect(save).toBeEnabled();
    await save.tap();
    await expect
      .poll(() => getSetting(page, 'nutrition'))
      .toMatchObject({
        goalKind: 'fat',
        heightCm: 170,
        birthYear: 1990,
        sex: 'female',
        activity: 'moderate',
      });

    await permissionsToToday(page);
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Health not connected: Set up Fuel as in 1.16.1 (no notes, no profile read)', async ({
    page,
  }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await installNativeHealth(page);
    await toHealthPage(page);
    await welcome(page).locator('[data-ob="not-now"]').tap();

    await intakeWithFuel(page);
    await expect(setup(page).locator('[data-from-health]')).toHaveCount(0);
    for (const sex of ['female', 'male']) {
      await expect(
        setup(page).locator(`[data-field="sex"] [data-choice="${sex}"]`),
      ).toHaveAttribute('aria-pressed', 'false');
    }
    expect(await page.evaluate(() => window.__gymCleanFakeHealthProfile.calls)).toBe(0);
    expect(await page.evaluate(() => window.__fakeHealth.requestRead)).toEqual([]);
    expect(await getRows(page, 'weighIns')).toEqual([]);
    await expect(setup(page).locator('[data-setup-save]')).toBeDisabled();

    await setup(page).locator('[data-field="sex"] [data-choice="male"]').tap();
    await setup(page).locator('[data-field="activity"] [data-choice="light"]').tap();
    await setup(page).locator('[data-setup-save]').tap();
    await expect
      .poll(() => getSetting(page, 'nutrition'))
      .toMatchObject({ goalKind: 'fat', sex: 'male', activity: 'light' });

    await permissionsToToday(page);
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
});
