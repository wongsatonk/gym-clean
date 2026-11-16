// M11 task 12: Apple Health in the iPhone app, end to end at 390×844, with a fake
// `window.Capacitor` (isNativePlatform + Plugins.GymHealth) serving MADE-UP data (the repo is
// public). Connect → per-type switches → Today's "Lighter today?" card with two reasons →
// Lighter today → the M10 proposal → Apply → Undo; an imported weigh-in shows "from Health" in
// Fuel; a type turned off takes the card and its stored values with it. The card is shown, never
// spoken. No request leaves the dev server (route-asserted). The PWA (no native bridge) shows
// "Health data works in the iPhone app." and never calls the plugin.
import { expect, test, type Page } from '@playwright/test';
import { at, expectTapTargets, installMocks, noHorizontalOverflow, record } from './app.helpers';

declare global {
  interface Window {
    __health: { isAvailable: number; requestRead: string[][]; read: string[][] };
  }
}

/** Fri 13 Nov 2026, 08:00 local: a training day (fresh plan, no rest weekdays). */
const NOW = at(13, 8);

/**
 * The fake GymHealth plugin. `native` false = a Capacitor object that says "not native" (the
 * plugin must then never be called). Data, all made up: 28 usual nights (7 h 30 m asleep),
 * resting HR 55, HRV 60 ms, 400 kcal active a day, one 40 min run on Wed; this morning a short
 * night (5 h 40 m) and resting HR 62, and a 70.4 kg weigh-in at 07:00.
 */
async function installHealth(page: Page, native: boolean) {
  await page.addInitScript((isNative) => {
    window.__health = { isAvailable: 0, requestRead: [], read: [] };
    const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
    const ymd = (t: number) => {
      const d = new Date(t);
      const p = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const sleep = [];
    const restingHr = [];
    const hrv = [];
    const activeEnergy = [];
    for (let k = 0; k <= 28; k++) {
      const day = 13 - k; // Date rolls negative days back into October
      const today = k === 0;
      const wake = at(day, 6, 30);
      const asleepMin = today ? 340 : 450;
      sleep.push({ start: wake - 8 * 3_600_000, end: wake, asleepMin, source: 'Band' });
      restingHr.push({ start: at(day, 7), bpm: today ? 62 : 55, source: 'Band' });
      hrv.push({ start: at(day, 6, 45), ms: 60, source: 'Band' });
      if (!today) activeEnergy.push({ date: ymd(at(day, 0)), start: at(day, 0), kcal: 400 });
    }
    const data: Record<string, { start: number }[]> = {
      sleep,
      restingHr,
      hrv,
      activeEnergy,
      bodyMass: [{ start: at(13, 7), kg: 70.4, source: 'Scale' } as { start: number }],
      workouts: [
        { start: at(11, 18), minutes: 40, kind: 'running', source: 'Band' } as { start: number },
      ],
    };
    const plugin = {
      isAvailable: async () => {
        window.__health.isAvailable++;
        return { available: true };
      },
      requestRead: async ({ types }: { types: string[] }) => {
        window.__health.requestRead.push([...types]);
        return { requested: true };
      },
      read: async ({ types, since, until }: { types: string[]; since: number; until?: number }) => {
        window.__health.read.push([...types]);
        const out: Record<string, unknown> = {};
        for (const t of types)
          out[t] = (data[t] ?? []).filter((r) => r.start >= since && (!until || r.start < until));
        return out;
      },
    };
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => isNative,
      getPlatform: () => (isNative ? 'ios' : 'web'),
      Plugins: { GymHealth: plugin },
    };
  }, native);
}

/** Every request must stay on the dev server: anything else is recorded and aborted. */
async function guardNetwork(page: Page): Promise<string[]> {
  const offsite: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  return offsite;
}

async function open(page: Page, native: boolean | null) {
  if (native !== null) await installHealth(page, native);
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

const healthScreen = (page: Page) => page.locator('main[data-screen="health-settings"]');
const card = (page: Page) => page.locator('[data-readiness]');
const sw = (page: Page, type: string) => healthScreen(page).locator(`[data-health-type="${type}"]`);

async function openHealthSettings(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-health-open]').click();
  await expect(healthScreen(page)).toBeVisible();
}

async function backToToday(page: Page) {
  await healthScreen(page).getByRole('button', { name: '‹ Back' }).click();
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

async function connect(page: Page) {
  await openHealthSettings(page);
  await expect(healthScreen(page).locator('[data-health-connect]')).toBeVisible();
  await healthScreen(page).locator('[data-health-connect]').click();
  await expect(healthScreen(page).locator('[data-health-last-read]')).toHaveText(
    'Last read: today 08:00',
  );
}

/** Stored per-day Health values (field names only) and imported weigh-ins. */
async function stored(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ fields: string[]; healthWeighIns: number }>((resolve, reject) => {
        const req = indexedDB.open('gym-clean');
        req.onerror = () => reject(new Error('open failed'));
        req.onsuccess = () => {
          const d = req.result;
          const tx = d.transaction(['healthDays', 'weighIns']);
          const days = tx.objectStore('healthDays').getAll();
          const ws = tx.objectStore('weighIns').getAll();
          tx.oncomplete = () => {
            d.close();
            const fields = new Set<string>();
            for (const row of days.result as Record<string, unknown>[])
              for (const k of Object.keys(row)) if (k !== 'date') fields.add(k);
            resolve({
              fields: [...fields].sort(),
              healthWeighIns: (ws.result as { source?: string }[]).filter(
                (w) => w.source === 'health',
              ).length,
            });
          };
          tx.onerror = () => reject(new Error('read failed'));
        };
      }),
  );
}

test('connect → switches → "Lighter today?" with two reasons → Lighter today → Apply → Undo', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page, true);
  // Not connected yet: nothing read, no card.
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__health.read)).toEqual([]);

  await openHealthSettings(page);
  await expect(healthScreen(page).locator('[data-health-connect]')).toBeVisible();
  await expectTapTargets(page, 'main[data-screen="health-settings"]');
  await noHorizontalOverflow(page);
  await healthScreen(page).locator('[data-health-connect]').click();
  await expect(healthScreen(page).locator('[data-health-last-read]')).toHaveText(
    'Last read: today 08:00',
  );
  // Connect asked iOS for the six listed types (and only those), then read them.
  const six = ['bodyMass', 'workouts', 'activeEnergy', 'sleep', 'restingHr', 'hrv'];
  expect(await page.evaluate(() => window.__health.requestRead)).toEqual([six]);
  for (const t of six) await expect(sw(page, t)).toHaveAttribute('aria-checked', 'true');
  await expect(healthScreen(page).locator('[data-health-connect]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('health-settings-390.png') });

  // A switch: off asks first ("Turn off and delete"), on asks iOS for that one type.
  await sw(page, 'activeEnergy').click();
  await healthScreen(page).locator('[data-health-delete="activeEnergy"]').click();
  await expect(sw(page, 'activeEnergy')).toHaveAttribute('aria-checked', 'false');
  await expect(sw(page, 'activeEnergy')).toBeEnabled();
  await sw(page, 'activeEnergy').click();
  await expect(sw(page, 'activeEnergy')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(() => page.evaluate(() => window.__health.requestRead.at(-1)))
    .toEqual(['activeEnergy']);
  await expectTapTargets(page, 'main[data-screen="health-settings"]');
  await noHorizontalOverflow(page);

  // Today: the card with the two reasons, and the week line with the outside run.
  await backToToday(page);
  await expect(card(page)).toHaveAttribute('data-readiness', 'lighter');
  const reasons = card(page).locator('[data-readiness-reason]');
  await expect(reasons).toHaveCount(2);
  await expect(reasons.nth(0)).toContainText(/sleep/i);
  await expect(reasons.nth(1)).toContainText(/resting heart rate/i);
  await expect(page.locator('[data-week-load]')).toContainText('1 other workout (run 40 min)');
  await expectTapTargets(page, '[data-readiness]');
  await noHorizontalOverflow(page);
  await card(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('health-card-390.png') });

  // Lighter today → the M10 Lighter proposal → Apply → Undo.
  await card(page).locator('[data-readiness-lighter]').click();
  await expect(card(page)).toHaveCount(0);
  const coach = page.getByRole('dialog', { name: 'Coach' });
  const proposal = coach.locator('[data-proposal]');
  await expect(proposal).toBeVisible();
  await proposal.getByRole('button', { name: 'Apply' }).click();
  await expect(coach).toHaveCount(0);
  await expect(page.locator('[data-adjusted]')).toContainText('Lighter today');
  const toast = page.locator('[data-undo-toast]');
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-adjusted]')).toHaveCount(0);
  // Answered: the card doesn't come back today, even after the app comes back to the front.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('[data-week-load]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  // Shown, never spoken.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('an imported weigh-in shows "from Health" in Fuel', async ({ page }, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page, true);
  await connect(page);
  await healthScreen(page).getByRole('button', { name: '‹ Back' }).click();
  await page.locator('[data-tab="fuel"]').click();
  const weigh = page.locator('[data-weigh-in]');
  await expect(weigh).toContainText('70.4');
  await expect(weigh.locator('[data-from-health]')).toHaveText('from Health');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('health-fuel-390.png') });
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a type turned off: the card it leaned on is gone and its stored values are deleted', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page, true);
  await connect(page);
  expect((await stored(page)).fields).toContain('sleepMin');
  await backToToday(page);
  await expect(card(page).locator('[data-readiness-reason]')).toHaveCount(2);

  await openHealthSettings(page);
  await sw(page, 'sleep').click();
  await healthScreen(page).locator('[data-health-delete="sleep"]').click();
  await expect(sw(page, 'sleep')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await stored(page)).fields).not.toContain('sleepMin');
  // Weight off deletes the imported weigh-in too.
  expect((await stored(page)).healthWeighIns).toBe(1);
  await sw(page, 'bodyMass').click();
  await healthScreen(page).locator('[data-health-delete="bodyMass"]').click();
  await expect.poll(async () => (await stored(page)).healthWeighIns).toBe(0);

  await backToToday(page);
  await expect(page.locator('[data-week-load]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  // Still off after a reload (nothing reads it back).
  await page.reload();
  await expect(page.locator('[data-week-load]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect((await stored(page)).fields).not.toContain('sleepMin');
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('PWA: "Health data works in the iPhone app." and no HealthKit call', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { requests, errors } = record(page);
  // A Capacitor object that says "not native", with the plugin present: it must never be called.
  await open(page, false);
  await openHealthSettings(page);
  await expect(healthScreen(page).locator('[data-health-pwa]')).toHaveText(
    'Health data works in the iPhone app.',
  );
  await expect(healthScreen(page).locator('[data-health-connect], [data-health-type]')).toHaveCount(
    0,
  );
  await noHorizontalOverflow(page);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await backToToday(page);
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('[data-week-load]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__health)).toEqual({
    isAvailable: 0,
    requestRead: [],
    read: [],
  });
  // The native module is never even loaded on the web.
  expect(requests.filter((u) => u.includes('/native/'))).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('PWA without any Capacitor object: the same line', async ({ page }) => {
  const { errors } = record(page);
  await open(page, null);
  await openHealthSettings(page);
  await expect(healthScreen(page).locator('[data-health-pwa]')).toHaveText(
    'Health data works in the iPhone app.',
  );
  expect(await page.evaluate(() => typeof (window as { Capacitor?: unknown }).Capacitor)).toBe(
    'undefined',
  );
  expect(errors).toEqual([]);
});
