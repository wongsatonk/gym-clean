// M12 slice 1b task 38: the intake, the Goal card and the gym file in the real app at 390×844
// (SPEC M12 trainer-kit item 3 + slice 1b Accept, Decision "Second user").
//
// - A fresh install opens the intake (one question per screen) → "What your answers change" →
//   Starter plan Apply (Undo toast puts the plan back) → Apply again → Done → Today runs the
//   starter plan. Nothing is spoken.
// - An existing install (any session) is never forced: Today shows "Set your goal"; the intake
//   from there suggests goals from the history, shown on the Goal card.
// - Settings → Your goal re-runs it. "Lose fat" shows Fuel targets before → after and changes
//   nothing until Apply.
// - My Gym: Share my gym file → import it on a fresh profile → preview → Apply.
// No request leaves the dev server (route-asserted).
import { expect, freshDbDefaults, test, type Locator, type Page } from './fixtures';
import {
  MIN,
  at,
  expectTapTargets,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
  type SetSeed,
  revealNotice,
} from './app.helpers';

const intake = (page: Page) => page.locator('main[data-screen="intake"]');

/** M13: a fresh install opens the welcome pages first; Next through them to the intake. */
async function throughWelcome(page: Page) {
  const welcome = page.locator('[data-screen="welcome"]');
  await expect(welcome).toBeVisible();
  while (await welcome.isVisible()) await page.locator('[data-ob="primary"]').click();
}

/** M13: after the intake the first-launch flow shows the permission pages; skip them to Today. */
async function finishWelcome(page: Page) {
  await page.locator('[data-ob="skip"]').click();
}
const step = (page: Page, id: string) => expect(intake(page)).toHaveAttribute('data-step', id);

/**
 * Answers every question (none for go-easy-on) and lands on the summary. `first`: no earlier
 * answers, so Next waits for a pick on every question (nothing is preselected).
 */
async function answer(
  page: Page,
  a: { goal: string; days: string; length: string; experience: string },
  first = false,
) {
  const pick = async (id: string, value: string, next: string) => {
    await step(page, id);
    const nextBtn = intake(page).locator('[data-intake-next]');
    if (first && id !== 'easyOn') await expect(nextBtn).toBeDisabled();
    if (value) {
      await intake(page).locator(`[data-option="${value}"]`).click();
      await expect(intake(page).locator(`[data-option="${value}"]`)).toHaveAttribute(
        'aria-checked',
        'true',
      );
    }
    await nextBtn.click();
    await step(page, next);
  };
  await pick('goal', a.goal, 'days');
  await pick('days', a.days, 'length');
  await pick('length', a.length, 'experience');
  await pick('experience', a.experience, 'easyOn');
  await pick('easyOn', '', 'summary');
}

/** Today's program day names, in the week strip / day list order. */
const dayNames = (page: Page) =>
  page
    .locator('.day-btn')
    .evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-day') ?? ''))]);

test.describe('fresh install', () => {
  test.use({ firstRun: 'fresh' });

  test('opens the intake → starter plan Apply → Undo → Apply → Done → Today runs the starter plan', async ({
    page,
  }, testInfo) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await installMocks(page);
    await page.clock.install({ time: at(13, 18) });
    await page.goto('/');
    await throughWelcome(page);
    await expect(intake(page)).toBeVisible();
    await expect(page.locator('[data-tabbar]')).toHaveCount(0);
    await expect(intake(page).locator('[data-intake-count]')).toHaveText('Question 1 of 5');
    await expect(intake(page).locator('[data-intake-skip]')).toBeVisible();
    await expect(intake(page).locator('[data-intake-close]')).toHaveCount(0); // first run: Skip only
    await expectTapTargets(page, 'main[data-screen="intake"]');
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('m12b-intake.png') });

    await answer(page, { goal: 'muscle', days: '3', length: '45', experience: 'new' }, true);
    const plan = intake(page).locator('[data-change="plan"]');
    await expect(plan).toBeVisible();
    await expect(plan).toContainText('Starter plan');
    await expect(intake(page)).toContainText('Nothing changes until you tap Apply.');
    await expectTapTargets(page, 'main[data-screen="intake"]');
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('m12b-intake-changes.png') });

    // Apply → the Undo toast; Undo puts the plan back as it was.
    const apply = intake(page).locator('[data-apply="plan"]');
    await apply.click();
    await expect(apply).toHaveAttribute('data-applied', 'true');
    const toast = page.locator('[data-undo-toast]');
    await expect(toast).toBeVisible();
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(toast).toHaveCount(0);

    await intake(page).locator('[data-intake-done]').click();
    await finishWelcome(page);
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    expect(await dayNames(page)).toContain('push-a'); // the plan as before

    // Re-run from Settings and Apply for good: Today runs the 3-day full-body starter plan.
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-intake-open]').click();
    await expect(intake(page)).toBeVisible();
    await expect(intake(page).locator('[data-intake-close]')).toBeVisible();
    await answer(page, { goal: 'muscle', days: '3', length: '45', experience: 'new' });
    await intake(page).locator('[data-apply="plan"]').click();
    await expect(intake(page).locator('[data-apply="plan"]')).toHaveAttribute(
      'data-applied',
      'true',
    );
    await intake(page).locator('[data-intake-done]').click();
    await page.locator('[data-tab="today"]').click();
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await expect.poll(() => dayNames(page)).not.toContain('push-a');
    await expect(page.getByRole('button', { name: /Full body/ }).first()).toBeVisible();

    // Answers kept; the first-run intake never comes back.
    expect(await getSetting(page, 'intake')).toMatchObject({
      goalKind: 'muscle',
      days: 3,
      sessionMin: 45,
      experience: 'new',
    });
    await page.reload();
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await expect(intake(page)).toHaveCount(0);

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('Skip for now lands on Today and is remembered', async ({ page }) => {
    const offsite = await guardNetwork(page);
    await installMocks(page);
    await page.clock.install({ time: at(13, 18) });
    await page.goto('/');
    await throughWelcome(page);
    await expect(intake(page)).toBeVisible();
    await intake(page).locator('[data-intake-skip]').click();
    await finishWelcome(page);
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await expect.poll(() => getSetting(page, 'intakeSkipped')).toEqual(expect.any(Number));
    await page.reload();
    await expect(page.locator('[data-cal]').first()).toBeVisible();
    await expect(intake(page)).toHaveCount(0);
    // "Set your goal" stays on Today for later.
    await expect(page.locator('[data-goal-card="prompt"]')).toBeVisible();
    expect(offsite).toEqual([]);
  });
});

/** Three Dumbbell Bench Press sessions this month (made-up numbers). */
function benchHistory() {
  const days = [2, 6, 11];
  const sessions = days.map((d) => ({
    sessionId: `s${d}`,
    dayId: 'push-a',
    startedAt: at(d, 18),
    endedAt: at(d, 18) + 45 * MIN,
  }));
  const sets: SetSeed[] = days.flatMap((d, i) =>
    [0, 1, 2].map((k) => ({
      sessionId: `s${d}`,
      exerciseId: 'Dumbbell_Bench_Press',
      setIndex: k,
      reps: 8,
      weightKg: 15 + 2.5 * i,
      startedAt: at(d, 18) + (k + 1) * 3 * MIN,
    })),
  );
  return { sessions, sets };
}

test('an existing install is never forced: Set your goal → intake → goals on the Goal card', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  const h = benchHistory();
  await seed(page, h.sessions, h.sets);
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(intake(page)).toHaveCount(0);

  const card = page.locator('[data-goal-card]');
  await expect(card).toHaveAttribute('data-goal-card', 'prompt');
  await revealNotice(page, card);
  await card.locator('[data-goal-set]').click();
  await expect(intake(page)).toBeVisible();
  await expect(intake(page).locator('[data-intake-close]')).toBeVisible();
  await answer(page, { goal: 'strength', days: '4', length: '60', experience: 'some' }, true);
  // With history the plan offer is a rebuild, never applied without a tap.
  await expect(intake(page).locator('[data-change="plan"]')).toContainText(
    'Build a new plan from my answers',
  );
  await intake(page).locator('[data-intake-done]').click();

  await expect(page.locator('[data-cal]').first()).toBeVisible();
  expect(await dayNames(page)).toContain('push-a'); // plan untouched (no Apply)
  await expect(card).toHaveAttribute('data-goal-card', 'goals');
  const goal = card.locator('[data-goal]').first();
  await expect(goal).toBeVisible();
  await expect(goal.locator('[data-goal-pct]')).toBeVisible();
  await expect(goal.locator('[data-goal-due]')).toBeVisible();
  await expect(goal.locator('[data-goal-status]')).toBeVisible();
  await expect(card).toContainText('Dumbbell Bench Press');
  await card.scrollIntoViewIfNeeded();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-goal-card.png') });

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');

/** Types into a − value + field and commits it (the field reads it on `change`). */
async function typeNumber(input: Locator, value: string) {
  await input.fill(value);
  await input.dispatchEvent('change');
  await expect(input).toHaveValue(value);
}

test('"Lose fat" shows Fuel targets before → after and changes nothing until Apply', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  // Fuel set up with made-up values.
  await page.locator('[data-tab="fuel"]').click();
  await fuelMain(page).locator('[data-setup]').click();
  const setup = page.locator('main[data-screen="fuel-setup"]');
  await setup.locator('[data-field="sex"] [data-choice="female"]').click();
  await setup.locator('[data-field="activity"] [data-choice="moderate"]').click();
  await typeNumber(setup.locator('[data-field="weight"] .nf-value'), '62.0');
  await setup.locator('[data-setup-save]').click();
  await expect(fuelMain(page).locator('[data-ring="kcal"]')).toBeVisible();
  const before = await getSetting(page, 'nutrition');

  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-intake-open]').click();
  await answer(page, { goal: 'fat', days: '3', length: '45', experience: 'some' }, true);
  const fuel = intake(page).locator('[data-change="fuel"]');
  await expect(fuel).toBeVisible();
  await expect(fuel.locator('[data-diff="before"]')).toBeVisible();
  await expect(fuel.locator('[data-diff="after"]')).toBeVisible();
  const was = (await fuel.locator('[data-diff="before"] dd').textContent()) ?? '';
  const will = (await fuel.locator('[data-diff="after"] dd').textContent()) ?? '';
  expect(will).not.toBe(was);
  // Shown, not done: the stored settings are as they were.
  expect(await getSetting(page, 'nutrition')).toEqual(before);

  await intake(page).locator('[data-apply="fuel"]').click();
  await expect(intake(page).locator('[data-apply="fuel"]')).toHaveAttribute('data-applied', 'true');
  await expect
    .poll(async () => ((await getSetting(page, 'nutrition')) as { goalKind?: string }).goalKind)
    .toBe('fat');

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

/** Share captures the file instead of the phone's share sheet. */
async function captureShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sharedGym: string | null };
    w.__sharedGym = null;
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files?: File[] }) => {
        w.__sharedGym = (await d.files?.[0]?.text()) ?? null;
      },
    });
  });
}

async function openMyGym(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-my-gym-open]').click();
  await expect(page.locator('[data-screen="my-gym"]')).toBeVisible();
}

test('Share my gym file → import it on a fresh profile → preview → Apply', async ({
  page,
  browser,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await captureShare(page);
  await openApp(page, at(13, 18));
  await openMyGym(page);
  const legPress = page.locator('[data-gym-item="leg-press"]');
  await expect(legPress).toHaveAttribute('aria-checked', 'false');
  await legPress.click();
  await expect(legPress).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-gym-share]').click();
  await expect(page.locator('[data-gym-shared]')).toBeVisible();
  const file = await page.evaluate(
    () => (window as unknown as { __sharedGym: string | null }).__sharedGym,
  );
  expect(file).toContain('leg-press');

  // A fresh profile (another phone): the file adds what it has.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    baseURL: testInfo.project.use.baseURL ?? '',
  });
  await freshDbDefaults(ctx);
  const other = await ctx.newPage();
  const offsite2 = await guardNetwork(other);
  const errors2 = record(other).errors;
  await openApp(other, at(13, 18));
  await openMyGym(other);
  await expect(other.locator('[data-gym-item="leg-press"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await other.locator('[data-gym-import]').setInputFiles({
    name: 'my-gym.gymclean-gym.json',
    mimeType: 'application/json',
    buffer: Buffer.from(file ?? '', 'utf8'),
  });
  const preview = other.locator('[data-gym-import-preview]');
  await expect(preview).toBeVisible();
  await expect(preview).toContainText(/leg press/i);
  await expectTapTargets(other, '[data-screen="my-gym"]');
  await noHorizontalOverflow(other);
  await other.locator('[data-gym-import-apply]').click();
  await expect(preview).toHaveCount(0);
  await expect(other.locator('[data-gym-item="leg-press"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Not a gym file: one plain line, nothing changes.
  await other.locator('[data-gym-import]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":1}', 'utf8'),
  });
  await expect(other.locator('[data-gym-import-error]')).toContainText("This isn't a gym file.");
  await ctx.close();

  expect(offsite).toEqual([]);
  expect(offsite2).toEqual([]);
  expect(errors).toEqual([]);
  expect(errors2).toEqual([]);
});
