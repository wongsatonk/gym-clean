import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  getRows,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
  todoReady,
} from './app.helpers';
import { endWorkout } from './workout.helpers';

/**
 * M13 owner mode (SPEC M13 goal 3, Accept), the real app at 390×844:
 * - A fresh install decides owner mode off: no to-do card on Today; Settings has no To-dos,
 *   Developer log or Coach eval; About shows "Version 1.15" with no build hash; a finished set
 *   writes nothing to the developer log.
 * - Seven taps on About's version line (each within 3 s) bring up the Owner tools switch with a
 *   status line; a pause longer than 3 s starts the count over. On → the build line, the to-dos
 *   and the developer log are back.
 * - A restored backup from before 1.15 (no 'ownerMode' row, but sessions) turns owner mode on.
 * Nothing spoken; no request leaves the device.
 */

test.use({ owner: 'off' }); // the default, said out loud: this spec is about a fresh install

const NOW = at(16, 18);
const about = (page: Page) => page.locator('main[data-screen="about"]');
const settings = (page: Page) => page.locator('main[data-screen="settings"]');
const ownerSwitch = (page: Page) => page.locator('[data-setting="owner-tools"]');

async function openSettings(page: Page): Promise<void> {
  await page.locator('[data-tab="settings"]').click();
  await expect(settings(page)).toBeVisible();
}

async function openAbout(page: Page): Promise<void> {
  await openSettings(page);
  await page.locator('[data-about-open]').scrollIntoViewIfNeeded();
  await page.locator('[data-about-open]').click();
  await expect(about(page)).toBeVisible();
}

/** Owner surfaces Settings shows (by hook). */
async function settingsOwnerHooks(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const hook of ['data-todos-open', 'data-devlog', 'data-brain-eval-open'])
    out[hook] = await settings(page).locator(`[${hook}]`).count();
  return out;
}

test('fresh install: owner surfaces hidden and the dev log records nothing; 7 taps → switch → back', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  await todoReady(page);

  await expect.poll(() => getSetting(page, 'ownerMode')).toMatchObject({ on: false, by: 'fresh' });
  await expect(page.locator('[data-todo-card]')).toHaveCount(0);

  await openSettings(page);
  expect(await settingsOwnerHooks(page)).toEqual({
    'data-todos-open': 0,
    'data-devlog': 0,
    'data-brain-eval-open': 0,
  });
  await expect(settings(page)).not.toContainText('Developer log');
  await expect(settings(page)).not.toContainText('build');

  // One manual set, then end: the developer log stays empty while owner mode is off.
  await page.locator('[data-tab="today"]').click();
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Set done' }).click();
  await endWorkout(page);
  await expect.poll(async () => (await getRows(page, 'sets')).length).toBe(1);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  // With owner mode on the log has its session row by Summary (devlog.spec); off: nothing at all.
  for (const store of ['devlogSessions', 'devlogSets', 'devlogChunks'])
    expect(await getRows(page, store), store).toEqual([]);

  // About: no build hash, no switch. Six taps, a pause over 3 s, one tap: still no switch.
  await openAbout(page);
  const version = about(page).locator('[data-about-version]');
  await expect(version).toHaveText(/^Version \d+\.\d+$/);
  await expect(ownerSwitch(page)).toHaveCount(0);
  for (let i = 0; i < 6; i++) await version.click();
  await page.clock.fastForward(3500);
  await version.click();
  await expect(ownerSwitch(page)).toHaveCount(0);

  // Six more within the window (seven in a row): the switch and its status line in words.
  for (let i = 0; i < 6; i++) await version.click();
  await expect(ownerSwitch(page)).toBeVisible();
  await expect(ownerSwitch(page)).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('[data-owner-status]')).toHaveText('Owner tools unlocked');
  expect((await ownerSwitch(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13-owner-unlocked.png') });

  // On: stored as the user's choice; the version line gains the build.
  await ownerSwitch(page).click();
  await expect(ownerSwitch(page)).toHaveAttribute('aria-checked', 'true');
  await expect.poll(() => getSetting(page, 'ownerMode')).toMatchObject({ on: true, by: 'user' });
  await expect(about(page).locator('[data-about-version]')).toContainText('build');

  // Settings and Today show the owner tools again.
  await about(page).locator('.back-btn').click();
  await expect(settings(page)).toBeVisible();
  await expect(settings(page).locator('[data-todos-open]')).toHaveCount(1);
  await expect(settings(page).locator('[data-devlog]').first()).toBeAttached();
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-todo-card]')).toBeVisible();

  // Off again: hidden again, and it stays off after a reload.
  await openAbout(page);
  await ownerSwitch(page).click();
  await expect.poll(() => getSetting(page, 'ownerMode')).toMatchObject({ on: false, by: 'user' });
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await todoReady(page);
  await expect(page.locator('[data-todo-card]')).toHaveCount(0);
  await openSettings(page);
  expect(await settingsOwnerHooks(page)).toEqual({
    'data-todos-open': 0,
    'data-devlog': 0,
    'data-brain-eval-open': 0,
  });

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a restored pre-1.15 backup (sessions, no ownerMode row) turns owner mode on', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  await expect.poll(() => getSetting(page, 'ownerMode')).toMatchObject({ on: false });
  await seed(
    page,
    [{ sessionId: 'old-1', dayId: 'push-a', startedAt: at(9, 18), endedAt: at(9, 18) + 45 * MIN }],
    [
      {
        sessionId: 'old-1',
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: 0,
        reps: 10,
        weightKg: 20,
        startedAt: at(9, 18) + MIN,
      },
    ],
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();

  // Back up, then make it a file from before 1.15: no 'ownerMode' (or 'onboarding') row.
  await openSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-backup-export]').click(),
  ]);
  const path = testInfo.outputPath('pre-1.15.gymclean-backup.json');
  await download.saveAs(path);
  const json = JSON.parse(readFileSync(path, 'utf8')) as {
    tables: { settings: { key: string }[] };
  };
  json.tables.settings = json.tables.settings.filter(
    (r) => r.key !== 'ownerMode' && r.key !== 'onboarding',
  );
  writeFileSync(path, JSON.stringify(json));
  expect(readFileSync(path, 'utf8')).not.toContain('ownerMode');

  // Still off before the restore.
  await expect(settings(page).locator('[data-todos-open]')).toHaveCount(0);

  await page.locator('[data-backup-file]').setInputFiles(path);
  const replace = page.locator('[data-backup-replace]');
  await replace.click();
  await expect(replace).toHaveText('Tap again to replace');
  await replace.click();
  await expect(page.locator('[data-backup-status="ok"]')).toBeVisible();

  // Decided from the restored data (it has a session): on, as an existing install.
  await expect
    .poll(() => getSetting(page, 'ownerMode'))
    .toMatchObject({ on: true, by: 'existing' });
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(page.locator('[data-todo-card]')).toBeVisible();
  await openSettings(page);
  await expect(settings(page).locator('[data-todos-open]')).toHaveCount(1);
  await expect(settings(page).locator('[data-devlog]').first()).toBeAttached();

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
