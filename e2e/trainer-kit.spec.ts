// M12 slice 1b task 38: the trainer kit in the real app at 390×844 (SPEC M12 trainer-kit items
// 1, 2, 5, 9, 10, 12 + slice 1b Accept). Warm-ups stay ON here (the trainer kit's default rule,
// first heavy lift); every other spec runs with them off (e2e/fixtures.ts).
//
// - Warm-up sets before the first heavy lift: shown ("Warm-up 1 of 2 · 7.5 kg × 8"), spoken
//   between sets, logged as warm-ups, and left out of Summary's volume. One tap skips them.
// - Setup cues: spoken once, between sets, before the first working set (never during a set).
// - Effort: "How was that set?" on Rest after a working set (not after a warm-up), saved on the
//   set row; Why? opens the effort learn card.
// - Short on time: Coach → "Short on time" → "30 min" → proposal → Apply → a shorter day →
//   Undo brings the full day back.
// - Feel today: energy + a sore area → "Go easy on chest today?" → the coach's proposal.
// - A learn card from a coach reply ("How's my week?" → consistency).
// - Nothing new to tap or read during a set. No request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  at,
  coachTab,
  expectTapTargets,
  guardNetwork,
  leaveCoach,
  noHorizontalOverflow,
  openApp,
  record,
  revealNotice,
} from './app.helpers';
import { endWorkout } from './workout.helpers';

test.use({ warmups: 'default' });

const BENCH = 'Dumbbell Bench Press';
/** Bench's setup checks (src/data/setupCues.json). */
const BENCH_SETUP = ['Feet flat.', 'Shoulder blades back.', 'Wrists over elbows.'];
/** First heavy lift at 15 kg: ~50 % × 8, then ~70 % × 4, snapped to the dumbbell steps. */
const WARM_1 = 'Warm-up: 7.5 kilos for 8.';
const WARM_2 = 'Warm-up: 10 kilos for 4.';

const spoken = (page: Page) => page.evaluate(() => window.__spoken);
const countOf = (xs: readonly string[], x: string) => xs.filter((s) => s === x).length;

type SetRow = {
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  warmup?: boolean;
  effort?: string;
};

async function readSets(page: Page): Promise<SetRow[]> {
  return page.evaluate(
    () =>
      new Promise<SetRow[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const d = open.result;
          const req = d.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => {
            d.close();
            resolve(req.result as SetRow[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

/** Today → Push A preview → Start workout (time frozen from here, moved with runFor). */
async function startPushA(page: Page) {
  await page.clock.pauseAt(at(13, 18) + 5_000);
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: BENCH })).toBeVisible();
  // The between-sets lines are queued a tick after the screen shows (a paused clock holds them).
  await page.clock.runFor(500);
}

/** During a set: nothing from the trainer kit to tap or read (Today / Rest only). */
async function nothingNewDuringASet(page: Page) {
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  for (const sel of [
    '[data-effort]',
    '[data-feel-today]',
    '[data-goal-card]',
    '[data-learn-open]',
    '[data-learn-sheet]',
    '[data-readiness]',
  ])
    await expect(page.locator(sel), sel).toHaveCount(0);
}

async function setDone(page: Page) {
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();
  await page.clock.runFor(500); // let the queued between-sets line go
}

async function startSet(page: Page) {
  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
}

test('warm-ups shown, spoken and logged (not in volume); setup cues once; effort saved; Why? card', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await startPushA(page);

  // Warm-up 1: the strip, the badge, the stepper at the warm-up's numbers; said as it starts.
  const counter = page.locator('[data-set-counter]');
  await expect(counter).toHaveText('Warm-up 1 of 2');
  await expect(page.locator('[data-warmup-label]')).toHaveText('Warm-up 1 of 2 · 7.5 kg × 8');
  await expect(page.getByLabel('Reps', { exact: true })).toHaveText('8');
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('7.5');
  await expect(page.locator('[data-skip-warmups]')).toBeVisible();
  await expect.poll(() => spoken(page)).toContain(WARM_1);
  await nothingNewDuringASet(page);
  await expectTapTargets(page, '[data-screen="exercise"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-warmup-set.png') });

  // Rest after a warm-up: the next warm-up is named and said; no effort row for a warm-up.
  await setDone(page);
  await expect(page.locator('[data-warmup]')).toContainText('Warm-up 2 of 2');
  await expect(page.locator('[data-effort]')).toHaveCount(0);
  await expect.poll(() => spoken(page)).toContain(WARM_2);
  await startSet(page);
  await expect(counter).toHaveText('Warm-up 2 of 2');
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('10');

  // Rest before the first working set: the setup checks, once, in order.
  await setDone(page);
  await expect(page.locator('[data-effort]')).toHaveCount(0);
  await expect.poll(async () => (await spoken(page)).slice(-3)).toEqual(BENCH_SETUP);
  await startSet(page);
  await expect(counter).toHaveText('Set 1 of 4');
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('15');
  await expect(page.locator('[data-warmup]')).toHaveCount(0);
  await nothingNewDuringASet(page);

  // Rest after a working set: "How was that set?" — Hard is saved on that set's row.
  await setDone(page);
  const effort = page.locator('[data-effort]');
  await expect(effort).toBeVisible();
  await expect(effort).toContainText('How was that set?');
  await expectTapTargets(page, '[data-screen="rest"]');
  await noHorizontalOverflow(page);
  await effort.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('m12b-effort-row.png') });
  await effort.locator('[data-effort-opt="hard"]').click();
  await expect(effort.locator('[data-effort-opt="hard"]')).toHaveAttribute('aria-checked', 'true');
  await expect(effort).toHaveAttribute('data-effort', 'hard');
  await expect
    .poll(async () =>
      (await readSets(page))
        .filter((r) => r.exerciseId === 'Dumbbell_Bench_Press' && r.warmup !== true)
        .map((r) => [r.reps, r.weightKg, r.effort ?? null]),
    )
    .toEqual([[8, 15, 'hard']]);

  // Why? → the effort learn card; Close returns to the rest screen.
  await effort.locator('[data-effort-why]').click();
  const card = page.locator('[data-learn-sheet="effort"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-learn-title]')).not.toBeEmpty();
  await expectTapTargets(page, '[data-learn-sheet="effort"]');
  await page.screenshot({ path: testInfo.outputPath('m12b-learn-effort.png') });
  await card.locator('[data-learn-close]').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();

  // The setup checks were said once, never again on later rests.
  await startSet(page);
  await setDone(page);
  await page.clock.runFor(3_000);
  for (const line of BENCH_SETUP) expect(countOf(await spoken(page), line), line).toBe(1);
  expect(countOf(await spoken(page), WARM_1)).toBe(1);
  expect(countOf(await spoken(page), WARM_2)).toBe(1);

  // Logged: 2 warm-ups (marked) + 2 working sets. Summary's volume counts working sets only.
  await expect
    .poll(async () =>
      (await readSets(page))
        .filter((r) => r.exerciseId === 'Dumbbell_Bench_Press')
        .map((r) => [r.warmup === true, r.reps, r.weightKg])
        .sort(),
    )
    .toEqual(
      [
        [true, 8, 7.5],
        [true, 4, 10],
        [false, 8, 15],
        [false, 8, 15],
      ].sort(),
    );
  await endWorkout(page);
  await expect(page.locator('[data-stat="sets"] .stat-value')).toHaveText('2');
  await expect(page.locator('[data-stat="volume"] .stat-value')).toHaveText('240');

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Skip warm-ups: one tap goes straight to Set 1 of 4; nothing more is said about warm-ups', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await startPushA(page);
  await expect(page.locator('[data-set-counter]')).toHaveText('Warm-up 1 of 2');
  await expect.poll(() => spoken(page)).toContain(WARM_1);
  await page.locator('[data-skip-warmups]').click();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 1 of 4');
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('15');
  await expect(page.locator('[data-warmup]')).toHaveCount(0);

  await setDone(page);
  await expect(page.locator('[data-effort]')).toBeVisible();
  await expect(page.locator('[data-warmup]')).toHaveCount(0);
  await page.clock.runFor(3_000);
  expect((await spoken(page)).filter((s) => s.startsWith('Warm-up'))).toEqual([WARM_1]);
  expect((await readSets(page)).filter((r) => r.warmup === true)).toEqual([]);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

/** Push A's preview (from Today): rows that run, rows cut, rows paired back to back. */
async function previewShape(page: Page) {
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  const preview = page.locator('[data-screen="preview"]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('.ex-row').first()).toBeVisible();
  const shape = {
    rows: await preview.locator('.ex-row').count(),
    cut: await preview.locator('.ex-row-removed').count(),
    paired: await preview.locator('.ex-row[data-pair]').count(),
  };
  await preview.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  return shape;
}

test('Short on time: "30 min" → proposal → Apply → a shorter day → Undo brings the full day back', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  const full = await previewShape(page);
  expect(full).toMatchObject({ cut: 0, paired: 0 });

  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
  await coachTab(page).locator('[data-coach-chip="shortOnTime"]').click();
  const thirty = coachTab(page).locator('[data-coach-followup]', { hasText: '30 min' });
  await expect(thirty).toBeVisible();
  await thirty.click();
  const card = coachTab(page).locator('[data-proposal]').last();
  await expect(card).toBeVisible();
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-short-on-time.png') });
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toBeVisible();

  await leaveCoach(page);
  await revealNotice(page, page.locator('[data-adjusted]'));
  const short = await previewShape(page);
  expect(short.cut + short.paired, 'rows cut or paired').toBeGreaterThan(0);

  await page.locator('[data-tab="coach"]').click();
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();
  await leaveCoach(page);
  expect(await previewShape(page)).toEqual(full);

  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Feel today: energy + a sore area → "Go easy on chest today?" → the coach proposal; a learn card from a reply', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  const feel = page.locator('[data-feel-today]');
  await expect(feel).toHaveAttribute('data-state', 'ask');
  await feel.locator('[data-feel-open]').click();
  await expect(feel).toHaveAttribute('data-state', 'open');
  await feel.locator('[data-feel-energy="2"]').click();
  await feel.locator('[data-feel-sore="chest"]').click();
  await expect(feel.locator('[data-feel-sore="chest"]')).toHaveAttribute('aria-checked', 'true');
  await expectTapTargets(page, '[data-feel-today]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-feel-today.png') });
  await feel.locator('[data-feel-save]').click();
  await expect(feel).toHaveAttribute('data-state', 'done');

  // SPEC M12 item 9: feel today alone (energy 2 + a sore area = two signals) makes the
  // "Lighter today?" card on the web, without Health.
  const lighter = page.locator('[data-readiness="lighter"]');
  await revealNotice(page, lighter);
  await expect(lighter.getByRole('heading', { name: 'Lighter today?' })).toBeVisible();
  await expect(lighter.locator('[data-readiness-reason]')).toHaveCount(2);
  await expect(lighter.locator('[data-readiness-lighter]')).toBeVisible();

  // Saved for today: still answered after a reload, and today's card stays as shown.
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(page.locator('[data-feel-today]')).toHaveAttribute('data-state', 'done');
  await revealNotice(page, page.locator('[data-readiness="lighter"]'));

  const offer = page.locator('[data-easy-on="chest"]').first();
  await expect(offer).toBeVisible();
  await offer.click();
  await expect(coachTab(page)).toBeVisible();
  const card = coachTab(page).locator('[data-proposal]').last();
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Apply' })).toBeVisible();
  await card.getByRole('button', { name: 'Not now' }).click();

  // A learn card from a coach reply ("How's my week?" → consistency): opens, closes.
  await coachTab(page).getByLabel('Ask the coach').fill("How's my week?");
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
  const why = coachTab(page).locator('[data-learn-open]').last();
  await expect(why).toBeVisible();
  const id = await why.getAttribute('data-learn-open');
  await why.click();
  const sheet = page.locator(`[data-learn-sheet="${id}"]`);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-learn-body]')).not.toBeEmpty();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-learn-card.png') });
  await sheet.locator('[data-learn-close]').click();
  await expect(sheet).toHaveCount(0);

  // Shown, never spoken (Today and the Coach tab are read with the phone in hand).
  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
