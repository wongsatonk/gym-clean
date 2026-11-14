// M4e A20: the redesign end to end in the real app. Accent persistence and the pre-paint copy,
// +30 s on Rest (and what's spoken), Skip/End only in the Pause sheet, self-hosted fonts, the
// Today tiles after a finished session, and no third-party request anywhere.
import { expect, test, type Page } from '@playwright/test';
import { endWorkout, openPause, skipExercise } from './workout.helpers';

declare global {
  interface Window {
    __spoken: string[];
  }
}

const GREEN = '#3be38b';
const GOLD = '#ffc94d';

/** speechSynthesis and Wake Lock recorders (as in session.spec.ts). */
async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      constructor(text: string) {
        super();
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: FakeUtterance) => {
          if (u.text && u.volume !== 0) window.__spoken.push(u.text); // skip the silent iOS unlock
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ addEventListener: () => undefined, release: async () => {} }),
      },
    });
  });
}

/** Records every request URL and every console error from the start of the test. */
function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

/** Requests that leave the app's origin (data: and blob: stay on the device). */
function thirdParty(requests: readonly string[], baseURL: string | undefined): string[] {
  const origin = new URL(baseURL ?? 'https://localhost').origin;
  return requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    return new URL(u).origin !== origin;
  });
}

async function boot(page: Page) {
  const rec = record(page);
  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));
  await expect(page.locator('.day-btn')).toHaveCount(6);
  return rec;
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken);
const tenSeconds = (page: Page) =>
  spoken(page).then((s) => s.filter((t) => t.startsWith('Ten seconds')));
const varOf = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(),
    name,
  );

/**
 * Waits until the accent is in both places: the localStorage pre-paint copy and IndexedDB (the
 * source the app re-applies on load). Reloading before the IndexedDB write commits would load the
 * old accent, which no person tapping and then reopening the app can hit.
 */
async function expectSaved(page: Page, accent: string) {
  await expect.poll(() => page.evaluate(() => localStorage.getItem('gc-accent'))).toBe(accent);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('gym-clean');
            open.onerror = () => resolve(null);
            open.onsuccess = () => {
              const d = open.result;
              const req = d.transaction('settings').objectStore('settings').get('accent');
              req.onsuccess = () => {
                d.close();
                resolve((req.result as { value?: unknown } | undefined)?.value ?? null);
              };
              req.onerror = () => {
                d.close();
                resolve(null);
              };
            };
          }),
      ),
    )
    .toBe(accent);
}

async function openSettings(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('main.settings')).toBeVisible();
}

async function startPushA(page: Page) {
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
}

test('Volt survives a reload, is applied before the app script runs, and turns success gold', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = await boot(page);
  expect(await varOf(page, '--success')).toBe(GREEN);

  await openSettings(page);
  await page.locator('[data-accent-option="volt"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'volt');
  expect(await varOf(page, '--success')).toBe(GOLD);
  await expectSaved(page, 'volt');

  await page.reload();
  await expect(page.locator('.day-btn')).toHaveCount(6);
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'volt');
  expect(await varOf(page, '--cta')).toBe('#c8f31d');
  expect(await varOf(page, '--success')).toBe(GOLD);
  await openSettings(page);
  await expect(page.locator('[data-accent-option="volt"]')).toHaveAttribute('aria-pressed', 'true');
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);

  // Before first paint: with the app module blocked, only index.html's inline script and the
  // stylesheet run. The accent must already be on <html> from the localStorage copy.
  await page.route('**/src/main.ts', (r) => r.abort());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'volt');
  expect(await varOf(page, '--success')).toBe(GOLD);
  await expect(page.locator('#app')).toBeEmpty();
});

for (const accent of ['orange', 'yellow'] as const) {
  test(`${accent} keeps success green, before and after a reload`, async ({ page, baseURL }) => {
    const { requests, errors } = await boot(page);
    await openSettings(page);
    // Start from Volt so picking the accent is a real change for Orange too.
    await page.locator('[data-accent-option="volt"]').click();
    expect(await varOf(page, '--success')).toBe(GOLD);
    await page.locator(`[data-accent-option="${accent}"]`).click();
    await expect(page.locator(`[data-accent-option="${accent}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await varOf(page, '--success')).toBe(GREEN);
    await expectSaved(page, accent);

    await page.reload();
    await expect(page.locator('.day-btn')).toHaveCount(6);
    // The pre-paint script only sets Volt/Yellow; the app sets the attribute once IndexedDB loads.
    await expect(page.locator('html')).toHaveAttribute('data-accent', accent);
    expect(await varOf(page, '--success')).toBe(GREEN);
    expect(thirdParty(requests, baseURL)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('+30 s on Rest extends the clock, and "Ten seconds" is spoken 30 s later', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = await boot(page);
  await startPushA(page);
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();

  const clock = page.locator('[data-rest-clock]');
  await expect(clock).toHaveText('2:00');
  await expect(page.locator('[data-rest-target]')).toHaveText('of 2:00');
  // Found by its visible label (label in name), which also carries the longer description.
  await page.getByRole('button', { name: '+30 s, add 30 seconds of rest', exact: true }).click();
  await expect(clock).toHaveText('2:30');
  await expect(page.locator('[data-rest-target]')).toHaveText('of 2:30');

  // Without +30 s the cue comes at 110 s (session.spec.ts). Now it must wait until 140 s.
  await page.clock.runFor(111_000);
  await expect(clock).toHaveText('0:39');
  expect(await tenSeconds(page)).toEqual([]);
  await page.clock.runFor(28_000);
  await expect(clock).toHaveText('0:11');
  expect(await tenSeconds(page)).toEqual([]);
  await page.clock.runFor(1_000);
  await expect
    .poll(() => tenSeconds(page))
    .toEqual(['Ten seconds. Next: Dumbbell Bench Press, set 2.']);

  await page.clock.runFor(10_000);
  await expect(clock).toHaveText('0:00');
  await expect.poll(() => spoken(page)).toContain('Go.');
  // The rest timer reports it was not over-rested at 150 s.
  await expect(page.locator('[data-rest-timer]')).toHaveAttribute('data-state', 'rest');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Skip and End are absent from Exercise and Rest; both work from the Pause sheet', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = await boot(page);
  await startPushA(page);

  // Exercise
  await expect(page.getByRole('button', { name: 'Skip exercise' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End workout' })).toHaveCount(0);
  await skipExercise(page);
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 1 of 4');

  // Rest
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip exercise' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End workout' })).toHaveCount(0);

  // The sheet holds both; Resume closes it without side effects.
  await openPause(page);
  const sheet = page.getByRole('dialog', { name: 'Paused' });
  await expect(sheet.getByRole('button', { name: 'Skip exercise' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'End workout' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Resume' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();

  await endWorkout(page);
  await expect(page.locator('[data-stat="sets"] .stat-value')).toHaveText('1');
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('fonts are self-hosted: every .woff2 comes from the app origin', async ({ page, baseURL }) => {
  const { requests, errors } = await boot(page);
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('700 64px "Barlow Condensed"')))
    .toBe(true);
  await expect
    .poll(() => requests.filter((u) => /\.woff2(\?|$)/.test(u)).length)
    .toBeGreaterThan(0);
  const origin = new URL(baseURL ?? 'https://localhost').origin;
  const fonts = requests.filter((u) => /\.woff2(\?|$)/.test(u));
  for (const u of fonts) expect(new URL(u).origin, u).toBe(origin);
  // Both families are in use on Today.
  expect(fonts.some((u) => u.includes('barlow-condensed'))).toBe(true);
  expect(fonts.some((u) => /\/barlow\//.test(u) || u.includes('barlow-latin'))).toBe(true);
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

/** Puts finished sessions straight into the app's IndexedDB (no sets: bodyweight-like). */
async function seedSessions(
  page: Page,
  rows: { sessionId: string; dayId: string; startedAt: number; endedAt: number }[],
) {
  await expect
    .poll(() =>
      page.evaluate(
        (list) =>
          new Promise<boolean>((resolve) => {
            void indexedDB.databases().then((dbs) => {
              if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
              const open = indexedDB.open('gym-clean');
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains('sessions')) {
                  d.close();
                  return resolve(false);
                }
                const tx = d.transaction('sessions', 'readwrite');
                for (const r of list)
                  tx.objectStore('sessions').put({
                    ...r,
                    setsDone: 0,
                    totalVolumeKg: 0,
                    restOverruns: 0,
                  });
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
        rows,
      ),
    )
    .toBe(true);
}

test("Today's streak and Last time tiles fill in after seeded and finished sessions", async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = await boot(page);
  const streak = page.locator('[data-streak]');
  const last = page.locator('[data-last-session]');
  await expect(streak).toHaveAttribute('data-streak', '0');
  await expect(last).toHaveAttribute('data-last-session', 'none');
  await expect(last).toContainText('None yet');

  // Two sessions earlier this week (Fri 13 Nov 2026 → Mon 9 and Wed 11): not a streak yet (3/wk).
  const day = 24 * 3600 * 1000;
  const t = new Date('2026-11-13T18:00:05Z').getTime();
  await seedSessions(page, [
    {
      sessionId: 'seed-1',
      dayId: 'legs-a',
      startedAt: t - 4 * day,
      endedAt: t - 4 * day + 45 * 60_000,
    },
    {
      sessionId: 'seed-2',
      dayId: 'pull-a',
      startedAt: t - 2 * day,
      endedAt: t - 2 * day + 50 * 60_000,
    },
  ]);
  await page.reload();
  await expect(page.locator('.day-btn')).toHaveCount(6);
  await expect(last).toHaveAttribute('data-last-session', 'Pull A');
  await expect(streak).toHaveAttribute('data-streak', '0');
  await expect(page.locator('[data-dot="done"]')).toHaveCount(2);

  // A third, finished in the app: one Push A set, 8 × 15 kg.
  await startPushA(page);
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.clock.runFor(10_000);
  await endWorkout(page);
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(streak).toHaveAttribute('data-streak', '1');
  await expect(streak.locator('.tile-num')).toHaveText('1wk');
  await expect(page.locator('[data-dot="done"]')).toHaveCount(3);
  await expect(last).toHaveAttribute('data-last-session', 'Push A');
  await expect(last.locator('.last-meta')).toContainText('Fri');
  await expect(last.locator('[data-volume]')).toHaveText('120 kg lifted');
  await expect(page.locator('.day-btn[data-day="push-a"]')).toHaveClass(/done/);
  await page.screenshot({ path: test.info().outputPath('today-tiles.png') });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});
