// M13d task 1 (SPEC M13d goal 1, Accept "the repro first"): the first run always ends on Today.
//
// The bug (1.16.1, a second user's fresh install, 2026-11-18): Apply on the intake's "Fuel targets"
// row ("Set up Fuel for this goal") and then Done opened Set up Fuel OUTSIDE the first-launch flow:
// the remaining pages (Apple Health, camera, mic, reminders) never showed, 'onboarding' was never
// stored, and Save landed on the Fuel tab. Fixed behaviour, asserted here at 390×844 with touch:
//
// - Fresh install → the welcome pages (whatever they are: Units joins them in M13d) → the intake
//   with every row it shows applied (starter plan, Fuel targets) → Done → Set up Fuel shown as
//   a step of the flow (`[data-onboarding-step="fuelSetup"]`, no tab bar) → Save (targets stored
//   with the intake's goal) → the camera page → Allow → Go to Today → Today; the 'onboarding' row
//   is stored ({ doneAt }); a reload shows no welcome, no intake, no Set up Fuel.
// - The Fuel row left alone ("skipped"): Done goes straight to the camera page, no Set up Fuel,
//   nothing stored for Fuel; the flow still ends on Today with 'onboarding' stored.
// - Back on Set up Fuel returns to the intake's last screen (the summary, answers kept, still
//   inside the flow); Done again shows Set up Fuel again (the step stays: Back is navigation, not
//   an undo of Apply), and the flow ends on Today.
// - With an easy-on area answered the summary shows three rows (go-easy list, starter plan, Fuel):
//   all three apply. Found while writing this spec (1.16.2): both trainer offers are proposed from
//   the same plan version when the summary opens, so the second Apply is refused as stale
//   (core/trainer/changes.ts applyProposal) and shows "That didn't apply. Try again." for good.
//
// Tagged @m13d-repro: red on 1.16.1/1.16.2 at the "Done → Set up Fuel inside the flow" step (the
// easy-on test first at its second Apply), green once main lands task 4 (and the stale-offer fix) (`npx playwright test e2e/first-run.spec.ts --project=mobile`).
// Nothing is spoken (read with the phone in hand); no request leaves the dev server.
import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  record,
} from './app.helpers';

test.use({ firstRun: 'fresh' });

const NOW = at(13, 18);
const welcome = (page: Page) => page.locator('[data-screen="welcome"]');
const primary = (page: Page) => welcome(page).locator('[data-ob="primary"]');
const intake = (page: Page) => page.locator('main[data-screen="intake"]');
const fuelSetup = (page: Page) => page.locator('main[data-screen="fuel-setup"]');
const flowFuelStep = (page: Page) => page.locator('[data-onboarding-step="fuelSetup"]');
const cameraPage = (page: Page) => welcome(page).locator('[data-permission="camera"]');
const today = (page: Page) => page.locator('[data-cal]').first();
const step = (page: Page, id: string) => expect(intake(page)).toHaveAttribute('data-step', id);

async function open(page: Page): Promise<void> {
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
}

/** Next through the welcome pages (2–3 today, plus Units in M13d) until the intake opens. */
async function throughWelcome(page: Page): Promise<void> {
  for (let i = 0; i < 8 && !(await intake(page).isVisible()); i++) {
    await expect(primary(page).or(intake(page))).toBeVisible();
    if (await intake(page).isVisible()) break;
    await primary(page).tap();
  }
  await expect(intake(page)).toBeVisible();
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);
}

/** Lose fat, 3 days, 45 min, new, go easy on `easyOn` (none by default), abs No → the summary. */
async function answerAll(page: Page, easyOn: string[] = []): Promise<void> {
  const pick = async (id: string, values: string[], next: string) => {
    await step(page, id);
    for (const v of values) {
      const opt = intake(page).locator(`[data-option="${v}"]`);
      await opt.tap();
      await expect(opt).toHaveAttribute('aria-checked', 'true');
    }
    await intake(page).locator('[data-intake-next]').tap();
    await step(page, next);
  };
  await pick('goal', ['fat'], 'days');
  await pick('days', ['3'], 'length');
  await pick('length', ['45'], 'experience');
  await pick('experience', ['new'], 'easyOn');
  await pick('easyOn', easyOn, 'wantsCore');
  await pick('wantsCore', [], 'summary');
}

/** Taps Apply on a summary row and waits for it to read as applied. */
async function apply(page: Page, id: 'plan' | 'easyOn' | 'fuel'): Promise<void> {
  const row = intake(page).locator(`[data-change="${id}"]`);
  await expect(row).toBeVisible();
  const btn = intake(page).locator(`[data-apply="${id}"]`);
  await btn.tap();
  await expect(btn).toHaveAttribute('data-applied', 'true');
}

/** Set up Fuel is on screen as a step of the first-launch flow (the bug: it wasn't). */
async function expectFuelStepInFlow(page: Page): Promise<void> {
  await expect(fuelSetup(page)).toBeVisible();
  await expect(flowFuelStep(page)).toBeVisible();
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);
}

/** Picks sex + activity (Save waits for both) and saves the targets. */
async function saveFuel(page: Page): Promise<void> {
  const setup = fuelSetup(page);
  await setup.locator('[data-field="sex"] [data-choice="female"]').tap();
  await setup.locator('[data-field="activity"] [data-choice="moderate"]').tap();
  const save = setup.locator('[data-setup-save]');
  await expect(save).toBeEnabled();
  await save.tap();
}

/** The camera page (the web's only permission page): Allow → Go to Today → Today. */
async function cameraToToday(page: Page): Promise<void> {
  await expect(cameraPage(page)).toBeVisible();
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);
  await primary(page).tap();
  await expect(welcome(page).locator('[data-ob="granted"]')).toBeVisible();
  await expect(primary(page)).toHaveText('Go to Today');
  await primary(page).tap();
  await expectOnToday(page);
}

async function expectOnToday(page: Page): Promise<void> {
  await expect(today(page)).toBeVisible();
  await expect(page.locator('[data-tab="today"]')).toHaveAttribute('aria-current', 'page');
  await expect(welcome(page)).toHaveCount(0);
  await expect(fuelSetup(page)).toHaveCount(0);
  await expect(page.locator('main[data-screen="fuel"]')).toHaveCount(0);
  await expect.poll(() => getSetting(page, 'onboarding')).toEqual({ doneAt: expect.any(Number) });
}

/** A reload opens Today: no welcome, no intake, no Set up Fuel. */
async function expectNotAgain(page: Page): Promise<void> {
  await page.reload();
  await expect(today(page)).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await expect(intake(page)).toHaveCount(0);
  await expect(fuelSetup(page)).toHaveCount(0);
}

test(
  'every intake row applied → Done → Set up Fuel inside the flow → Save → camera → Today',
  { tag: '@m13d-repro' },
  async ({ page }, testInfo) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);
    await throughWelcome(page);
    await answerAll(page);
    await expect(intake(page).locator('[data-change]')).toHaveCount(2); // plan + Fuel
    await apply(page, 'plan');
    await apply(page, 'fuel');
    await intake(page).locator('[data-intake-done]').tap();

    // The bug: Set up Fuel opened on the Fuel tab, outside the flow.
    await expectFuelStepInFlow(page);
    await expectTapTargets(page, 'main[data-screen="fuel-setup"]');
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('m13d-first-run-fuel-step.png') });

    await saveFuel(page);
    await expect
      .poll(async () => ((await getSetting(page, 'nutrition')) as { goalKind?: string })?.goalKind)
      .toBe('fat');
    await cameraToToday(page);
    expect(await getSetting(page, 'intake')).toMatchObject({ goalKind: 'fat', days: 3 });
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'Fuel row left alone: Done → the camera page (no Set up Fuel) → Today',
  { tag: '@m13d-repro' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);
    await throughWelcome(page);
    await answerAll(page);
    await apply(page, 'plan');
    await expect(intake(page).locator('[data-apply="fuel"]')).not.toHaveAttribute(
      'data-applied',
      'true',
    );
    await intake(page).locator('[data-intake-done]').tap();

    await expect(cameraPage(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    await welcome(page).locator('[data-ob="not-now"]').tap();
    await expectOnToday(page);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  "Back on Set up Fuel returns to the intake's last screen; Done again → Set up Fuel → Today",
  { tag: '@m13d-repro' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);
    await throughWelcome(page);
    await answerAll(page);
    await apply(page, 'plan');
    await apply(page, 'fuel');
    await intake(page).locator('[data-intake-done]').tap();
    await expectFuelStepInFlow(page);

    // Set up Fuel's own Back: the intake's summary, answers kept, still in the flow.
    await fuelSetup(page).getByRole('button', { name: 'Back', exact: true }).tap();
    await expect(intake(page)).toBeVisible();
    await step(page, 'summary');
    await expect(intake(page).locator('[data-intake-answers]')).toBeVisible();
    await expect(page.locator('[data-tabbar]')).toHaveCount(0);
    await expect(fuelSetup(page)).toHaveCount(0);
    expect(await getSetting(page, 'onboarding')).toBeUndefined();
    expect(await getSetting(page, 'nutrition')).toBeUndefined();

    // Done again: Set up Fuel is still the next step; Save → camera → Today.
    await intake(page).locator('[data-intake-done]').tap();
    await expectFuelStepInFlow(page);
    await saveFuel(page);
    await cameraToToday(page);
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'with an easy-on area: go-easy list, starter plan and Fuel all apply → Set up Fuel → Today',
  { tag: '@m13d-repro' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);
    await throughWelcome(page);
    await answerAll(page, ['legs']);
    await expect(intake(page).locator('[data-change]')).toHaveCount(3);
    // Top to bottom, as a first-time user taps them. 1.16.2: the second trainer Apply is stale.
    await apply(page, 'plan');
    await apply(page, 'easyOn');
    await apply(page, 'fuel');
    await expect(intake(page).locator('[data-change-error]:not(:empty)')).toHaveCount(0);
    await intake(page).locator('[data-intake-done]').tap();

    await expectFuelStepInFlow(page);
    await saveFuel(page);
    await cameraToToday(page);
    expect(await getSetting(page, 'intake')).toMatchObject({ goalKind: 'fat', easyOn: ['legs'] });
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);
