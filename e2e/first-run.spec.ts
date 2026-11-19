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
// M13d task 40b: the round buttons (SPEC M13d Goal 7) on every page of the flow: each
// `[data-icon-btn]` shows its word, is ≥ 56px, the main circle 72px in a pill as wide as the old
// bar; keyboard focus rings the circle. BUTTONS_AFTER_SHOT=1 also writes
// docs/screenshots/m13d-buttons-after-{first-run,intake,fuel-setup}.png (390×844, dark).
//
// Tagged @m13d-repro: red on 1.16.1/1.16.2 at the "Done → Set up Fuel inside the flow" step (the
// easy-on test first at its second Apply), green once main lands task 4 (and the stale-offer fix) (`npx playwright test e2e/first-run.spec.ts --project=mobile`).
// Nothing is spoken (read with the phone in hand); no request leaves the dev server.
import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getRows,
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

// ---------------------------------------------------------------------------------------------
// M13d task 4: the Set up Fuel step's edges (tagged @m13d-flow). The step is in the flow only
// while the intake's Fuel row is applied for the goal Done saved with: Skip for now or a changed
// goal drops it (nothing stored for Fuel, and it never opens again on its own); Back from the
// page after it reopens it with what was saved; a double tap on Done moves the flow on once.
// Task 3b: its quiet "Not now" drops the step and stores nothing (Back never brings it back).

/** Taps Next on each question (answers already kept) until the summary shows. */
async function nextToSummary(page: Page): Promise<void> {
  for (let i = 0; i < 8 && (await intake(page).getAttribute('data-step')) !== 'summary'; i++) {
    const next = intake(page).locator('[data-intake-next]');
    await expect(next).toBeEnabled();
    const from = await intake(page).getAttribute('data-step');
    await next.tap();
    await expect(intake(page)).not.toHaveAttribute('data-step', from ?? '');
  }
  await step(page, 'summary');
}

/** Back on the intake until it shows question `id` (answers kept). */
async function backTo(page: Page, id: string): Promise<void> {
  for (let i = 0; i < 8 && (await intake(page).getAttribute('data-step')) !== id; i++) {
    const from = await intake(page).getAttribute('data-step');
    await intake(page).locator('[data-intake-back]').tap();
    await expect(intake(page)).not.toHaveAttribute('data-step', from ?? '');
  }
  await step(page, id);
}

/** Set up Fuel's own Back: the intake's summary, still in the flow, Fuel row shown applied. */
async function fuelBackToSummary(page: Page): Promise<void> {
  await fuelSetup(page).getByRole('button', { name: 'Back', exact: true }).tap();
  await expect(intake(page)).toBeVisible();
  await step(page, 'summary');
  await expect(fuelSetup(page)).toHaveCount(0);
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);
  await expect(intake(page).locator('[data-apply="fuel"]')).toHaveAttribute('data-applied', 'true');
}

const fuelNotApplied = (page: Page) =>
  expect(intake(page).locator('[data-apply="fuel"]')).not.toHaveAttribute('data-applied', 'true');

test(
  'Set up Fuel → Back → a question → Skip for now: the step is dropped and never opens on its own',
  { tag: '@m13d-flow' },
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

    await fuelBackToSummary(page);
    await backTo(page, 'wantsCore');
    await intake(page).locator('[data-intake-skip]').tap();

    // Skip for now: straight to the camera page, Set up Fuel gone from the flow.
    await expect(cameraPage(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    await welcome(page).locator('[data-ob="back"]').tap();
    // Back from the camera page never reaches a Set up Fuel step (it was dropped).
    await expect(fuelSetup(page)).toHaveCount(0);
    await expect(intake(page)).toBeVisible();
    await intake(page).locator('[data-intake-skip]').tap();
    await cameraToToday(page);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();

    // Later, from Settings: Done with the same goal opens no Set up Fuel by itself.
    await page.locator('[data-tab="settings"]').tap();
    await page.locator('[data-intake-open]').tap();
    await expect(intake(page)).toBeVisible();
    await step(page, 'goal');
    await expect(intake(page).locator('[data-option="fat"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await nextToSummary(page);
    await expect(intake(page).locator('[data-change="fuel"]')).toBeVisible();
    await fuelNotApplied(page);
    await intake(page).locator('[data-intake-done]').tap();
    await expect(intake(page)).toHaveCount(0);
    await expect(fuelSetup(page)).toHaveCount(0);
    await expect(page.locator('main[data-screen="fuel"]')).toHaveCount(0);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'Set up Fuel → Back → another goal → Done: the camera page, no Set up Fuel, nothing for Fuel',
  { tag: '@m13d-flow' },
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

    await fuelBackToSummary(page);
    await backTo(page, 'goal');
    const muscle = intake(page).locator('[data-option="muscle"]');
    await muscle.tap();
    await expect(muscle).toHaveAttribute('aria-checked', 'true');
    await expect(intake(page).locator('[data-option="fat"]')).not.toHaveAttribute(
      'aria-checked',
      'true',
    );
    await nextToSummary(page);
    // The applied Fuel row was for "Lose fat": it no longer counts.
    await fuelNotApplied(page);
    await intake(page).locator('[data-intake-done]').tap();

    await expect(cameraPage(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    await cameraToToday(page);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    expect(await getSetting(page, 'intake')).toMatchObject({ goalKind: 'muscle' });
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'Set up Fuel → Save → camera → Back: Set up Fuel reopens with the saved values → Today',
  { tag: '@m13d-flow' },
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

    // A height off the starting value, so the reopened screen shows what was saved.
    const height = fuelSetup(page).locator('[data-field="height"] .nf-value');
    const before = await height.inputValue();
    await fuelSetup(page).locator('[data-field="height"] [data-step="up"]').tap();
    await expect(height).not.toHaveValue(before);
    const savedHeight = await height.inputValue();
    await saveFuel(page);
    await expect(cameraPage(page)).toBeVisible();
    const saved = (await getSetting(page, 'nutrition')) as {
      goalKind?: string;
      sex?: string;
      activity?: string;
      heightCm?: number;
    };
    expect(saved).toMatchObject({ goalKind: 'fat', sex: 'female', activity: 'moderate' });

    // Back from the camera page: Set up Fuel again, in the flow, with the saved values.
    await welcome(page).locator('[data-ob="back"]').tap();
    await expectFuelStepInFlow(page);
    const setup = fuelSetup(page);
    await expect(setup.locator('[data-field="sex"] [data-choice="female"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(setup.locator('[data-field="activity"] [data-choice="moderate"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(height).toHaveValue(savedHeight);

    const save = setup.locator('[data-setup-save]');
    await expect(save).toBeEnabled();
    await save.tap();
    await cameraToToday(page);

    // One set of targets (the one settings row) and one weigh-in for today, for the intake's goal.
    expect(await getSetting(page, 'nutrition')).toMatchObject({
      goalKind: 'fat',
      sex: 'female',
      activity: 'moderate',
      heightCm: saved.heightCm,
    });
    expect(await getRows(page, 'weighIns')).toHaveLength(1);
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'a double tap on Done with Fuel applied lands on Set up Fuel once, then the flow goes on',
  { tag: '@m13d-flow' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);
    await throughWelcome(page);
    await answerAll(page);
    await apply(page, 'plan');
    await apply(page, 'fuel');

    // Two taps back-to-back, the second before the first has finished saving (an unguarded second
    // Done would read no pending Fuel goal, drop the step and move the flow past it).
    await intake(page)
      .locator('[data-intake-done]')
      .evaluate((b: HTMLElement) => {
        b.click();
        b.click();
      });

    await expectFuelStepInFlow(page);
    await expect(cameraPage(page)).toHaveCount(0);
    await saveFuel(page);
    await expect
      .poll(async () => ((await getSetting(page, 'nutrition')) as { goalKind?: string })?.goalKind)
      .toBe('fat');
    await cameraToToday(page);
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test(
  'Set up Fuel → Not now: the camera page, nothing stored for Fuel; Back never shows it again',
  { tag: '@m13d-flow' },
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

    // The quiet "Not now" (task 3b): only in the flow, a word button ≥ 56px.
    const notNow = fuelSetup(page).getByRole('button', { name: 'Not now', exact: true });
    await expect(notNow).toBeVisible();
    expect((await notNow.boundingBox())?.height).toBeGreaterThanOrEqual(56);
    await notNow.tap();

    await expect(cameraPage(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    expect(await getRows(page, 'weighIns')).toEqual([]);

    // Back from the camera page: the step was dropped, so the intake (never Set up Fuel), from
    // its first question with the answers kept.
    await welcome(page).locator('[data-ob="back"]').tap();
    await expect(intake(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    await expect(page.locator('[data-tabbar]')).toHaveCount(0);
    await step(page, 'goal');
    await expect(intake(page).locator('[data-option="fat"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await nextToSummary(page);
    // Not now un-applied the Fuel row (nothing pending for Fuel).
    await fuelNotApplied(page);
    await intake(page).locator('[data-intake-done]').tap();
    // Done again: still no Set up Fuel (Not now dropped it for this run).
    await expect(cameraPage(page)).toBeVisible();
    await expect(fuelSetup(page)).toHaveCount(0);
    await cameraToToday(page);
    expect(await getSetting(page, 'nutrition')).toBeUndefined();
    await expectNotAgain(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

/** Every round button under `root`: a visible word, ≥ 56px both ways, a round circle (72px for
 *  the main one, which spans the row). Returns the words seen. */
async function roundButtons(page: Page, root: string): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready);
  const rows = await page.locator(`${root} [data-icon-btn]`).evaluateAll((els) =>
    els
      .filter((e) => e.getClientRects().length > 0)
      .map((e) => {
        const b = e.getBoundingClientRect();
        const circle = e.querySelector('.icon-btn-circle');
        const c = circle?.getBoundingClientRect();
        const word = e.querySelector('.icon-btn-label');
        const w = word?.getBoundingClientRect();
        return {
          word: word?.textContent ?? '',
          wordShown:
            !!word &&
            !!w &&
            w.width > 0 &&
            w.height > 0 &&
            getComputedStyle(word).visibility === 'visible',
          wordPx: word ? parseFloat(getComputedStyle(word).fontSize) : 0,
          clipped: !!word && word.scrollWidth > word.clientWidth + 1,
          w: b.width,
          h: b.height,
          right: b.right,
          circle: c ? [Math.round(c.width), Math.round(c.height)] : [0, 0],
          round: circle ? getComputedStyle(circle).borderRadius === '50%' : false,
          main: e.getAttribute('data-variant') === 'main',
        };
      }),
  );
  expect(rows.length, root).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.wordShown, `${r.word} shows its word`).toBe(true);
    expect(r.wordPx, `${r.word} word size`).toBeGreaterThanOrEqual(20);
    expect(r.clipped, `${r.word} word clipped`).toBe(false);
    expect(r.h, `${r.word} height`).toBeGreaterThanOrEqual(56);
    expect(r.w, `${r.word} width`).toBeGreaterThanOrEqual(56);
    expect(r.right, `${r.word} inside the screen`).toBeLessThanOrEqual(390);
    expect(r.round, `${r.word} round`).toBe(true);
    expect(r.circle, r.word).toEqual(r.main ? [72, 72] : [56, 56]);
    // The main action is a pill across the row (as wide as the bar it replaced).
    if (r.main) expect(r.w, `${r.word} pill width`).toBeGreaterThanOrEqual(240);
  }
  return rows.map((r) => r.word);
}

const shoot = async (page: Page, name: string) => {
  if (!process.env.BUTTONS_AFTER_SHOT) return;
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/m13d-buttons-after-${name}.png` });
};

test(
  'M13d 40b: round buttons with words on the welcome, intake and Set up Fuel pages',
  { tag: '@m13d-flow' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await open(page);

    // Page 1: Back is there but off, Skip is quiet, Next is the main pill.
    expect(await roundButtons(page, '[data-screen="welcome"]')).toEqual(['Skip', 'Back', 'Next']);
    await expect(welcome(page).locator('[data-ob="back"]')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await expectTapTargets(page, '[data-screen="welcome"]');
    await shoot(page, 'first-run');

    // Keyboard focus rings the circle (the whole row is the tap area, the circle shows focus).
    let ring = 'none';
    for (let i = 0; i < 6 && ring !== 'solid'; i++) {
      await page.keyboard.press('Tab');
      ring = await page.evaluate(() => {
        const c = document.activeElement
          ?.closest('[data-icon-btn]')
          ?.querySelector('.icon-btn-circle');
        return c ? getComputedStyle(c).outlineStyle : 'none';
      });
    }
    expect(ring).toBe('solid');

    // The other welcome pages (Units included) keep the same look.
    for (let i = 0; i < 8 && !(await intake(page).isVisible()); i++) {
      await primary(page).tap();
      if (await intake(page).isVisible()) break;
      const words = await roundButtons(page, '[data-screen="welcome"]');
      expect(words).toEqual(expect.arrayContaining(['Skip', 'Back']));
      await noHorizontalOverflow(page);
    }
    await expect(intake(page)).toBeVisible();

    // An intake question: Next stays off until answered, Back round, Skip for now quiet.
    await step(page, 'goal');
    const next = intake(page).locator('[data-intake-next]');
    await expect(next).toBeDisabled();
    await intake(page).locator('[data-option="fat"]').tap();
    await expect(next).toBeEnabled();
    await next.tap();
    await step(page, 'days');
    expect(await roundButtons(page, 'main[data-screen="intake"]')).toEqual(
      expect.arrayContaining(['Back', 'Next', 'Skip for now']),
    );
    await expectTapTargets(page, 'main[data-screen="intake"]');
    await noHorizontalOverflow(page);
    await intake(page).locator('[data-option="3"]').tap();
    await shoot(page, 'intake');
    await intake(page).locator('[data-intake-back]').tap();
    await step(page, 'goal');

    // The summary: Apply rows and Done; then Set up Fuel inside the flow.
    await answerAll(page);
    await apply(page, 'plan');
    await apply(page, 'fuel');
    expect(await roundButtons(page, 'main[data-screen="intake"]')).toEqual(
      expect.arrayContaining(['Applied', 'Done']),
    );
    await intake(page).locator('[data-intake-done]').tap();
    await expectFuelStepInFlow(page);
    await expect(fuelSetup(page).getByRole('button', { name: 'Less Height' })).toBeVisible();
    await expect(fuelSetup(page).getByRole('button', { name: 'More Height' })).toBeVisible();
    await expect(fuelSetup(page).getByRole('button', { name: 'Save targets' })).toBeDisabled();
    expect(await roundButtons(page, 'main[data-screen="fuel-setup"]')).toEqual(
      expect.arrayContaining(['Back', 'Less', 'More', 'Not now', 'Save targets']),
    );
    await expectTapTargets(page, 'main[data-screen="fuel-setup"]');
    await noHorizontalOverflow(page);
    await shoot(page, 'fuel-setup');
    await saveFuel(page);
    await cameraToToday(page);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);
