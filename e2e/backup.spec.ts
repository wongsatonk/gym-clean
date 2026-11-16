// M9 B2/B3 Settings → Backup, end to end: Back up downloads a `.gymclean-backup.json` (a Blob,
// nothing uploaded) → the data is wiped → Restore picks the file → "Replace all data on this
// phone?" (two taps) → History and the settings are back, with an Undo toast. A file that isn't
// a backup, or one from a newer app, is refused in plain words and nothing changes.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  MIN,
  at,
  expectTapTargets,
  noHorizontalOverflow,
  offDevice,
  openApp,
  record,
  seed,
} from './app.helpers';

const SESSIONS = [
  { sessionId: 's-1', dayId: 'push-a', startedAt: at(11, 18), endedAt: at(11, 18) + 50 * MIN },
  { sessionId: 's-2', dayId: 'pull-a', startedAt: at(12, 18), endedAt: at(12, 18) + 50 * MIN },
];
const SETS = SESSIONS.map((s) => ({
  sessionId: s.sessionId,
  exerciseId: s.dayId === 'push-a' ? 'Dumbbell_Bench_Press' : 'One-Arm_Dumbbell_Row',
  setIndex: 0,
  reps: 10,
  weightKg: 20,
  startedAt: s.startedAt + MIN,
}));

/** Rows in an IndexedDB store of the app's database. */
async function count(page: Page, store: string): Promise<number> {
  return page.evaluate(
    (store) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const rq = d.transaction(store).objectStore(store).count();
          rq.onsuccess = () => {
            d.close();
            resolve(rq.result);
          };
          rq.onerror = () => reject(new Error('count failed'));
        };
      }),
    store,
  );
}

/** A "new phone": every store emptied, then a reload. */
async function wipe(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const names = [...d.objectStoreNames];
          const tx = d.transaction(names, 'readwrite');
          for (const n of names) tx.objectStore(n).clear();
          tx.oncomplete = () => {
            d.close();
            resolve();
          };
          tx.onerror = () => reject(new Error('clear failed'));
        };
      }),
  );
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

async function openSettings(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('[data-backup]')).toBeVisible();
}

async function backUp(page: Page): Promise<{ name: string; path: string }> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-backup-export]').click(),
  ]);
  const path = test.info().outputPath(download.suggestedFilename());
  await download.saveAs(path);
  return { name: download.suggestedFilename(), path };
}

async function pickAndReplace(page: Page, path: string) {
  await page.locator('[data-backup-file]').setInputFiles(path);
  await expect(page.locator('[data-backup-confirm]')).toHaveText('Replace all data on this phone?');
  await expect(page.locator('[data-backup]')).toContainText('2 workouts');
  const replace = page.locator('[data-backup-replace]');
  await replace.click();
  await expect(replace).toHaveText('Tap again to replace');
  await replace.click();
  await expect(page.locator('[data-backup-status="ok"]')).toHaveText('Restored from the backup.');
}

test('back up → wipe → restore (two taps) → History and settings are back; Undo puts the wiped state back', async ({
  page,
  baseURL,
}, testInfo) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await seed(page, SESSIONS, SETS);
  await openSettings(page);
  await page.locator('[data-unit="lb"]').click();
  await expect(page.locator('[data-unit="lb"]')).toHaveAttribute('aria-pressed', 'true');

  const file = await backUp(page);
  expect(file.name).toBe('gym-clean-2026-11-13.gymclean-backup.json');
  const json = JSON.parse(readFileSync(file.path, 'utf8')) as {
    format: string;
    tables: Record<string, unknown[]>;
  };
  expect(json.format).toBe('gym-clean-backup');
  expect(json.tables.sessions).toHaveLength(2);
  expect(json.tables.sets).toHaveLength(2);
  await expect(page.locator('[data-backup-status="ok"]')).toBeVisible();
  await expectTapTargets(page, '[data-backup]');
  await noHorizontalOverflow(page);

  await wipe(page);
  expect(await count(page, 'sessions')).toBe(0);
  await openSettings(page);
  await expect(page.locator('[data-unit="kg"]')).toHaveAttribute('aria-pressed', 'true');

  // Restore: the question first; Cancel changes nothing.
  await page.locator('[data-backup-file]').setInputFiles(file.path);
  await expect(page.locator('[data-backup-confirm]')).toBeVisible();
  await expectTapTargets(page, '[data-backup]');
  await page.locator('[data-backup]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('m9-backup-confirm.png') });
  await page.locator('[data-backup-cancel]').click();
  await expect(page.locator('[data-backup-confirm]')).toHaveCount(0);
  expect(await count(page, 'sessions')).toBe(0);

  await pickAndReplace(page, file.path);
  const toast = page.locator('[data-undo-toast]');
  await expect(toast).toContainText('Data restored.');
  await page.screenshot({ path: testInfo.outputPath('m9-backup-restored.png') });
  // Settings follow at once (no reload): lb is back.
  await expect(page.locator('[data-unit="lb"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await count(page, 'sessions')).toBe(2);
  expect(await count(page, 'sets')).toBe(2);
  await page.locator('[data-tab="history"]').click();
  await expect(page.locator('[data-history-day="s-2"]')).toBeVisible();
  await expect(page.locator('[data-history-day="s-1"]')).toBeVisible();

  // Undo (the toast is still up for 10 s): the wiped state comes back.
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => count(page, 'sessions')).toBe(0);
  // Away from Settings a short notice says it; on Settings it shows once, inline (no toast).
  const notice = page.locator('[data-notice]');
  await expect(notice).toHaveText('Restore undone.');
  await openSettings(page);
  await expect(page.locator('[data-unit="kg"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-backup-status="ok"]')).toHaveText('Restore undone.');
  await expect(notice).toHaveCount(0);
  await expect(page.getByText('Restore undone.')).toHaveCount(1);

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Undo on Settings: "Restore undone." shows once, inline, with no toast', async ({ page }) => {
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await seed(page, SESSIONS, SETS);
  await openSettings(page);
  const file = await backUp(page);
  await wipe(page);
  await openSettings(page);
  await pickAndReplace(page, file.path);
  const toast = page.locator('[data-undo-toast]');
  await expect(toast).toContainText('Data restored.');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-backup-status="ok"]')).toHaveText('Restore undone.');
  await expect.poll(() => count(page, 'sessions')).toBe(0);
  await expect(page.locator('.undo-toast')).toHaveCount(0);
  await expect(page.getByText('Restore undone.')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a file that is not a backup, or one from a newer app, is refused in plain words; nothing changes', async ({
  page,
  baseURL,
}, testInfo) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await seed(page, SESSIONS, SETS);
  await openSettings(page);
  const file = await backUp(page);
  const status = page.locator('[data-backup-status="error"]');

  await page.locator('[data-backup-file]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(status).toHaveText("This file isn't a Gym Clean backup. Nothing changed.");
  await expect(page.locator('[data-backup-confirm]')).toHaveCount(0);
  await page.locator('[data-backup]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('m9-backup-refused.png') });

  await page.locator('[data-backup-file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ not json'),
  });
  await expect(status).toHaveText("This file isn't a Gym Clean backup. Nothing changed.");

  const newer = JSON.parse(readFileSync(file.path, 'utf8')) as { dexieVersion: number };
  newer.dexieVersion = 999;
  await page.locator('[data-backup-file]').setInputFiles({
    name: 'newer.gymclean-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(newer)),
  });
  await expect(status).toHaveText('This backup is from a newer version. Update the app first.');
  await expect(page.locator('[data-backup-confirm]')).toHaveCount(0);

  expect(await count(page, 'sessions')).toBe(2);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});
