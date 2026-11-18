// M13c task 18: abs join a plan only through a chosen focus block or the intake (SPEC M13c
// goal 5, Decision "M13c answers" q3), end to end in the real app at 390×844.
//
// - Coach: a chest block → "Also add abs?" Yes → the card says "with abs" → Apply → abs rows on
//   ≥ 2 block days (the stored plan and the Calendar day) → Undo takes them away again.
// - Coach: "add abs" → the focus flow on Abs & core → Apply → a core block.
// - A plan never gains abs without a pick: the default plan has none; a chest block with "No"
//   adds none.
// - First run: the intake with "Yes, add abs" gives a starter plan with abs; with the default
//   No it has none.
// Shown, never spoken. Every test fails on a request that leaves the device (route-asserted) and
// on a console error.
import { expect, test, type Page } from './fixtures';
import {
  at,
  coachTab,
  expectTapTargets,
  getRows,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

/** Wed 18 Nov 2026, 18:00 (no session today: a new block starts today). */
const NOW = at(18, 18);

/** The ten vendored abdominals-primary exercises (src/data/exercises.json, M13c task 2). */
const ABS = new Set([
  'Air_Bike',
  'Cable_Crunch',
  'Crunches',
  'Dead_Bug',
  'Dumbbell_Side_Bend',
  'Flat_Bench_Lying_Leg_Raise',
  'Hanging_Leg_Raise',
  'Pallof_Press',
  'Reverse_Crunch',
  'Russian_Twist',
]);

type Day = { id: string; name: string; exercises: { exerciseId: string }[] };
type Block = { group: string; alsoCore?: true; days: { date: string; day: Day | null }[] };
type State = { plan: { days: Day[] }; blocks?: Block[] };

let guard: { offsite: string[]; errors: string[] } | null = null;
test.beforeEach(async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  guard = { offsite, errors };
});
test.afterEach(async ({ page }) => {
  expect(guard?.offsite ?? [], 'requests that left the device').toEqual([]);
  expect(guard?.errors ?? [], 'console errors').toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

/** The stored trainer state (null before the app first saves one: the default program). */
async function trainerState(page: Page): Promise<State | null> {
  const rows = await getRows<{ key: string; state: State }>(page, 'trainer');
  return rows.find((r) => r.key === 'current')?.state ?? null;
}

const absOf = (days: readonly (Day | null)[]): string[] =>
  days.flatMap((d) => (d ? d.exercises.map((e) => e.exerciseId).filter((x) => ABS.has(x)) : []));

/** Abs exercise ids in the plan's days. */
const planAbs = (s: State | null): string[] => (s ? absOf(s.plan.days) : []);
/** Block dates (with their abs ids) that have abs rows. */
const blockAbsDays = (s: State | null): { date: string; abs: string[] }[] =>
  (s?.blocks ?? []).flatMap((b) =>
    b.days.map((d) => ({ date: d.date, abs: absOf([d.day]) })).filter((d) => d.abs.length > 0),
  );

const block = (page: Page) => coachTab(page).locator('[data-focus-block-card]').last();
const options = (page: Page) => coachTab(page).locator('[data-coach-followup]');

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

async function ask(page: Page, text: string) {
  await coachTab(page).getByLabel('Ask the coach').fill(text);
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
}

/** A month of chest on 5 days, up to the "Also add abs?" step. */
async function chestUpToAbs(page: Page) {
  await goCoach(page);
  await ask(page, 'This month I want to build my chest');
  await options(page).filter({ hasText: '5 days' }).click();
  await expect(coachTab(page)).toContainText('Also add abs?');
  await expect(coachTab(page).locator('[data-focus-block-card]')).toHaveCount(0);
  await expect(options(page).filter({ hasText: /^Yes$/ })).toBeVisible();
  await expect(options(page).filter({ hasText: /^No$/ })).toBeVisible();
  await expectTapTargets(page, '[data-screen="coach"]');
}

/** Calendar → the given November day → its exercise ids. */
async function calendarDayExercises(page: Page, date: string): Promise<string[]> {
  await page.locator('[data-tab="calendar"]').click();
  await expect(page.locator('main[data-screen="calendar"]')).toBeVisible();
  await page.locator(`[data-cal-day="${date}"]`).click();
  const day = page.locator('main[data-screen="calendar-day"]');
  await expect(day).toHaveAttribute('data-date', date);
  await expect(day.locator('[data-cal-ex]').first()).toBeVisible();
  return day
    .locator('[data-cal-ex]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-cal-ex') ?? ''));
}

test('Chest focus + "Also add abs?" Yes → Apply → abs rows on the block days → Undo removes them', async ({
  page,
}, testInfo) => {
  await openApp(page, NOW);
  expect(planAbs(await trainerState(page))).toEqual([]);
  await chestUpToAbs(page);
  await options(page).filter({ hasText: /^Yes$/ }).click();

  await expect(block(page)).toBeVisible();
  await expect(block(page)).toHaveAttribute('data-proposal-status', 'pending');
  await expect(coachTab(page)).toContainText(/chest block, with abs/);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-chest-with-abs.png') });
  // Nothing changes before Apply.
  expect(blockAbsDays(await trainerState(page))).toEqual([]);

  await block(page).getByRole('button', { name: 'Apply' }).click();
  await expect(block(page).locator('[data-card-status="applied"]')).toBeVisible();
  // The stored block: chest, marked alsoCore, abs rows on ≥ 2 days of its first week; the base
  // plan itself still has none (the rows end with the block).
  await expect.poll(async () => (await trainerState(page))?.blocks?.length ?? 0).toBe(1);
  const applied = await trainerState(page);
  expect(applied?.blocks?.[0]).toMatchObject({ group: 'chest', alsoCore: true });
  expect(planAbs(applied)).toEqual([]);
  const absDays = blockAbsDays(applied);
  const week1 = absDays.filter((d) => d.date <= '2026-11-24');
  expect(week1.length).toBeGreaterThanOrEqual(2);

  // The Calendar day shows the abs row.
  const first = week1[0];
  if (!first) throw new Error('no abs day in week 1');
  const ids = await calendarDayExercises(page, first.date);
  expect(ids.filter((x) => ABS.has(x)).length).toBeGreaterThan(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-calendar-abs-day.png') });

  // Undo on the card: the block and its abs rows are gone.
  await goCoach(page);
  await block(page).getByRole('button', { name: 'Undo' }).click();
  await expect(block(page).locator('[data-card-status="undone"]')).toBeVisible();
  await expect.poll(async () => blockAbsDays(await trainerState(page))).toEqual([]);
  expect(planAbs(await trainerState(page))).toEqual([]);
  const after = await calendarDayExercises(page, first.date);
  expect(after.filter((x) => ABS.has(x))).toEqual([]);
});

test('"add abs" → the focus flow on Abs & core → Apply → a core block', async ({ page }) => {
  await openApp(page, NOW);
  await goCoach(page);
  await ask(page, 'add abs');
  // The flow asks weeks then days; the group is already Abs & core, so no "Also add abs?".
  await expect(coachTab(page)).toContainText('For how many weeks?');
  await options(page)
    .filter({ hasText: /^3 weeks$/ })
    .click();
  await expect(coachTab(page)).toContainText('How many days a week?');
  await options(page).filter({ hasText: 'Keep my days' }).click();
  await expect(block(page)).toBeVisible();
  await expect(coachTab(page)).not.toContainText('Also add abs?');
  await expect(block(page).locator('[data-fb-week]')).toHaveCount(3);
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);

  await block(page).getByRole('button', { name: 'Apply' }).click();
  await expect(block(page).locator('[data-card-status="applied"]')).toBeVisible();
  await expect.poll(async () => (await trainerState(page))?.blocks?.[0]?.group).toBe('core');
  const s = await trainerState(page);
  // A core block reaches its target on ≥ 2 days a week.
  expect(blockAbsDays(s).filter((d) => d.date <= '2026-11-24').length).toBeGreaterThanOrEqual(2);
  expect(planAbs(s)).toEqual([]);
});

test('a plan never gains abs without a pick: the default plan has none; chest with "No" adds none', async ({
  page,
}) => {
  await openApp(page, NOW);
  // The day previews list no abs.
  for (const name of ['Push A', 'Pull A', 'Legs A']) {
    await page
      .getByRole('button', { name: new RegExp(name) })
      .first()
      .click();
    const rows = page.locator('main[data-screen="preview"] li.ex-row');
    await expect(rows.first()).toBeVisible();
    const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-ex') ?? ''));
    expect(
      ids.filter((x) => ABS.has(x)),
      name,
    ).toEqual([]);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.locator('main[data-screen="today"]')).toBeVisible();
  }
  expect(planAbs(await trainerState(page))).toEqual([]);

  await chestUpToAbs(page);
  await options(page).filter({ hasText: /^No$/ }).click();
  await expect(block(page)).toBeVisible();
  await expect(coachTab(page)).not.toContainText('with abs');
  await block(page).getByRole('button', { name: 'Apply' }).click();
  await expect(block(page).locator('[data-card-status="applied"]')).toBeVisible();
  await expect.poll(async () => (await trainerState(page))?.blocks?.length ?? 0).toBe(1);
  const s = await trainerState(page);
  expect(s?.blocks?.[0]?.alsoCore).toBeUndefined();
  expect(blockAbsDays(s)).toEqual([]);
  expect(planAbs(s)).toEqual([]);
});

// ---------- first run: the intake's "Add abs to your plan?" ----------

test.describe('fresh install', () => {
  test.use({ firstRun: 'fresh' });

  const intake = (page: Page) => page.locator('main[data-screen="intake"]');
  const step = (page: Page, id: string) => expect(intake(page)).toHaveAttribute('data-step', id);

  /** Welcome → intake → answers (abs as given) → Apply the starter plan → Done → Today. */
  async function runIntake(page: Page, abs: 'yes' | 'no') {
    await installMocks(page);
    await page.clock.install({ time: NOW });
    await page.goto('/');
    const welcome = page.locator('[data-screen="welcome"]');
    await expect(welcome).toBeVisible();
    while (await welcome.isVisible()) await page.locator('[data-ob="primary"]').click();
    await expect(intake(page)).toBeVisible();
    const pick = async (id: string, value: string, next: string) => {
      await step(page, id);
      if (value) await intake(page).locator(`[data-option="${value}"]`).click();
      await intake(page).locator('[data-intake-next]').click();
      await step(page, next);
    };
    await pick('goal', 'muscle', 'days');
    await pick('days', '3', 'length');
    await pick('length', '45', 'experience');
    await pick('experience', 'new', 'easyOn');
    await pick('easyOn', '', 'wantsCore');
    // No is the default: only Yes needs a tap.
    await expect(intake(page).locator('[data-option="no"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await pick('wantsCore', abs === 'yes' ? 'yes' : '', 'summary');
    if (abs === 'yes')
      await expect(intake(page).locator('[data-intake-answers]')).toContainText('With abs');
    else await expect(intake(page).locator('[data-intake-answers]')).not.toContainText('With abs');
    await intake(page).locator('[data-apply="plan"]').click();
    await expect(intake(page).locator('[data-apply="plan"]')).toHaveAttribute(
      'data-applied',
      'true',
    );
    await intake(page).locator('[data-intake-done]').click();
    await page.locator('[data-ob="skip"]').click();
    await expect(page.locator('[data-cal]').first()).toBeVisible();
  }

  test('intake "Yes, add abs" → the starter plan has abs on ≥ 3 days', async ({ page }) => {
    await runIntake(page, 'yes');
    await expect.poll(async () => planAbs(await trainerState(page)).length).toBeGreaterThan(0);
    const s = await trainerState(page);
    const days = s?.plan.days ?? [];
    expect(days.filter((d) => absOf([d]).length > 0).length).toBeGreaterThanOrEqual(3);
    // The first day's preview lists the abs row.
    await page
      .getByRole('button', { name: /Full body/ })
      .first()
      .click();
    const ids = await page
      .locator('main[data-screen="preview"] li.ex-row')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-ex') ?? ''));
    expect(ids.filter((x) => ABS.has(x)).length).toBeGreaterThan(0);
  });

  test('intake with the default No → the starter plan has no abs', async ({ page }) => {
    await runIntake(page, 'no');
    await expect.poll(async () => (await trainerState(page))?.plan.days.length ?? 0).toBe(3);
    expect(planAbs(await trainerState(page))).toEqual([]);
  });
});
