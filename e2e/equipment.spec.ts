// M10e equipment-aware swaps, end to end (PROGRESS M10e tasks 10 + 11). His gym has no leg
// press, and Legs B has Leg Press: Today and the preview ask once (never silently), the coach
// offers a plan-scope swap (Apply / Undo as any plan change), Keep it stops the question, typed
// "my gym has no leg press" reaches the same proposal, and Settings → My gym edits the list.
// The prompt is shown, not spoken (it's before a workout). Nothing leaves the phone.
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
import { leaveSettings } from './workout.helpers';

const coach = (page: Page) => page.getByRole('dialog', { name: 'Coach' });
const prompt = (page: Page) => page.locator('[data-gym-prompt="Leg_Press"]');
const preview = (page: Page) => page.locator('[data-screen="preview"]');

/** Fri 13 Nov 18:00, the five days before done in order: Legs B is up next today. */
async function openLegsB(page: Page) {
  await openApp(page, at(13, 18));
  const days = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b'];
  await seed(
    page,
    days.map((dayId, i) => ({
      sessionId: `s-${dayId}`,
      dayId,
      startedAt: at(8 + i, 18),
      endedAt: at(8 + i, 18) + 50 * MIN,
    })),
    [],
  );
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
}

async function openPreview(page: Page) {
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator('li.ex-row').first()).toBeVisible();
}

async function backToToday(page: Page) {
  await preview(page).getByRole('button', { name: '‹ Back' }).click();
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
}

/** The stored gym profile (settings key 'gym'), or null before the first edit. */
async function storedGym(page: Page): Promise<{ equipment: string[]; kept: string[] } | null> {
  return page.evaluate(
    () =>
      new Promise<{ equipment: string[]; kept: string[] } | null>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const rq = d.transaction('settings').objectStore('settings').get('gym');
          rq.onsuccess = () => {
            d.close();
            const row = rq.result as { value: { equipment: string[]; kept: string[] } } | undefined;
            resolve(row?.value ?? null);
          };
          rq.onerror = () => reject(new Error('read failed'));
        };
      }),
  );
}

/** Waits until Keep it is stored (the prompt hides at once; the write lands just after). */
async function keptStored(page: Page, id: string) {
  await expect.poll(async () => (await storedGym(page))?.kept ?? []).toContain(id);
}

async function openMyGym(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-my-gym-open]').click();
  await expect(page.locator('[data-screen="my-gym"]')).toBeVisible();
}

test('Legs B: prompt (no silent change) → See a swap → Apply → Smith Machine Squat with Info → reload keeps it → Undo brings Leg Press and the prompt back', async ({
  page,
  baseURL,
}, testInfo) => {
  const { requests, errors } = record(page);
  await openLegsB(page);

  // Asked on Today; the day itself is unchanged until he taps.
  await expect(prompt(page)).toContainText('Your gym has no kit for Leg Press.');
  await expectTapTargets(page, '[data-gym-prompt]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m10e-prompt-today.png') });
  await openPreview(page);
  await expect(preview(page).locator('[data-ex="Leg_Press"]')).toBeVisible();
  await expect(preview(page).locator('[data-gym-prompt="Leg_Press"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('m10e-prompt-preview.png') });
  await backToToday(page);

  // See a swap: the coach's plan-scope proposal, closest replacement first.
  await prompt(page).locator('[data-gym-swap]').click();
  await expect(coach(page)).toBeVisible();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Leg Press');
  await expect(card).toContainText('Smith Machine Squat');
  await expect(coach(page).getByRole('button', { name: 'Keep Leg Press' })).toBeVisible();
  await expectTapTargets(page, '[data-coach-sheet]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m10e-proposal.png') });
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(coach(page)).toHaveCount(0);
  await expect(page.locator('[data-undo-toast]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);

  // The preview runs the replacement, marked "Info" (no 3D demo yet).
  await openPreview(page);
  const smith = preview(page).locator('[data-ex="Smith_Machine_Squat"]');
  await expect(smith).toBeVisible();
  await expect(smith.locator('[data-badge="info"]')).toBeVisible();
  await expect(preview(page).locator('[data-ex="Leg_Press"]')).toHaveCount(0);
  await expect(preview(page).locator('[data-gym-prompt]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('m10e-applied-preview.png') });

  // A plan change: it survives a reload.
  await page.reload();
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await openPreview(page);
  await expect(preview(page).locator('[data-ex="Smith_Machine_Squat"]')).toBeVisible();
  await backToToday(page);

  // Undo from Settings → Plan changes: Leg Press and the prompt are back.
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-plan-changes-open]').click();
  const changes = page.locator('[data-screen="plan-changes"]');
  await expect(changes.locator('li.plan-change').first()).toContainText('Leg Press');
  await changes.locator('[data-undo-change]').click();
  await expect(changes.locator('li.plan-change').first()).toHaveAttribute('data-undone');
  await changes.getByRole('button', { name: '‹ Back' }).click();
  await leaveSettings(page);
  await expect(prompt(page)).toBeVisible();
  await openPreview(page);
  await expect(preview(page).locator('[data-ex="Leg_Press"]')).toBeVisible();
  await expect(preview(page).locator('[data-ex="Smith_Machine_Squat"]')).toHaveCount(0);

  // Shown, not spoken.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Keep it: the prompt goes and stays gone after a reload; the day keeps Leg Press', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openLegsB(page);
  await prompt(page).locator('[data-gym-keep]').click();
  await expect(prompt(page)).toHaveCount(0);
  await keptStored(page, 'Leg_Press');
  await page.reload();
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await openPreview(page);
  await expect(preview(page).locator('[data-ex="Leg_Press"]')).toBeVisible();
  await expect(preview(page).locator('[data-gym-prompt]')).toHaveCount(0);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('the coach\'s "Keep Leg Press" chip keeps it: nothing changes, the prompt goes', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openLegsB(page);
  await prompt(page).locator('[data-gym-swap]').click();
  await coach(page).getByRole('button', { name: 'Keep Leg Press' }).click();
  await expect(coach(page).locator('[data-proposal]')).toHaveCount(0);
  await expect(coach(page).locator('.cs-msg-coach').last()).toContainText('keeping Leg Press');
  await coach(page).getByRole('button', { name: 'Close' }).click();
  await expect(coach(page)).toHaveCount(0);
  await expect(prompt(page)).toHaveCount(0);
  await keptStored(page, 'Leg_Press');
  await page.reload();
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('typed "my gym has no leg press" gets the same swap proposal', async ({ page, baseURL }) => {
  const { requests, errors } = record(page);
  await openLegsB(page);
  await page.locator('[data-coach-open]').click();
  await expect(coach(page)).toBeVisible();
  await coach(page).getByLabel('Ask the coach').fill('my gym has no leg press');
  await coach(page).getByRole('button', { name: 'Send' }).click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Leg Press');
  await expect(card).toContainText('Smith Machine Squat');
  await expect(coach(page).getByRole('button', { name: 'Keep Leg Press' })).toBeVisible();
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('My gym: Keep it resets when the list changes; no smith → barbell squat first; tick Leg press → no prompt', async ({
  page,
  baseURL,
}, testInfo) => {
  const { requests, errors } = record(page);
  await openLegsB(page);
  await prompt(page).locator('[data-gym-keep]').click();
  await expect(prompt(page)).toHaveCount(0);
  await keptStored(page, 'Leg_Press');

  await openMyGym(page);
  const screen = page.locator('[data-screen="my-gym"]');
  await expect(screen.locator('[data-gym-item="leg-press"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(screen.locator('[data-gym-item="smith-machine"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(screen).toContainText('Keep it');
  await expect(screen).toContainText('Stays on this phone.');
  await expectTapTargets(page, '[data-screen="my-gym"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m10e-my-gym.png'), fullPage: true });

  // No smith machine: the question is back (Keep it was cleared), barbell squat first.
  await screen.locator('[data-gym-item="smith-machine"]').click();
  await expect(screen.locator('[data-gym-item="smith-machine"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await screen.getByRole('button', { name: '‹ Back' }).click();
  await leaveSettings(page);
  await expect(prompt(page)).toBeVisible();
  await prompt(page).locator('[data-gym-swap]').click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toContainText('Barbell Squat');
  await expect(card).not.toContainText('Smith Machine Squat');
  await coach(page).getByRole('button', { name: 'Close' }).click();

  // A leg press after all: no prompt, and it survives a reload.
  await openMyGym(page);
  await page.locator('[data-gym-item="leg-press"]').click();
  await expect(page.locator('[data-gym-item="leg-press"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('[data-screen="my-gym"]').getByRole('button', { name: '‹ Back' }).click();
  await leaveSettings(page);
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);
  await expect.poll(async () => (await storedGym(page))?.equipment ?? []).toContain('leg-press');
  await page.reload();
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();
  await expect(prompt(page)).toHaveCount(0);

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});
