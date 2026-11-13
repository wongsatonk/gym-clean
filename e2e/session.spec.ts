import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __spoken: string[];
    __wake: string[];
  }
}

/** Replace speechSynthesis and the Wake Lock API with recorders. */
async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__wake = [];
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      constructor(text: string) {
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
          if (u.text) window.__spoken.push(u.text);
        },
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wake.push('request');
          return {
            addEventListener: () => undefined,
            release: async () => {
              window.__wake.push('release');
            },
          };
        },
      },
    });
  });
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken);
const BENCH_CUE = 'Squeeze your chest, slow on the way down.';
const INCLINE_CUE = 'Upper chest drives it, slow lowering.';

async function readSets(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        {
          exerciseId: string;
          setIndex: number;
          reps: number;
          weightKg: number;
          restTakenSec: number;
        }[]
      >((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test('runs a mini Push A session with rest cues, pause, skip and summary', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  // Freeze time; from here on it only moves via clock.runFor().
  await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));

  // Today
  await expect(page.locator('.day-btn')).toHaveCount(6);
  await page.getByRole('button', { name: /Push A/ }).click();
  await expect(page.locator('.ex-row')).toHaveCount(6);
  await page.getByRole('button', { name: 'Start workout' }).click();

  // Exercise: set 1 of bench press, adjust reps 10 -> 8 and weight 20 -> 22.5
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 1 of 4');
  await expect(page.getByText('Squeeze your chest, slow on the way down.')).toBeVisible();
  const reps = page.getByLabel('Reps', { exact: true });
  const kg = page.getByLabel('kg', { exact: true });
  await expect(reps).toHaveText('10');
  await expect(kg).toHaveText('20');
  await page.getByRole('button', { name: 'Reps minus' }).click();
  await page.getByRole('button', { name: 'Reps minus' }).click();
  await page.getByRole('button', { name: 'kg plus' }).click();
  await expect(reps).toHaveText('8');
  await expect(kg).toHaveText('22.5');
  expect(await page.evaluate(() => window.__wake)).toEqual(['request']);

  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();

  // Rest: 120 s target
  const clock = page.locator('[data-rest-clock]');
  await expect(clock).toHaveText('2:00');
  await page.clock.runFor(109_000);
  await expect(clock).toHaveText('0:11');
  expect(await spoken(page)).toEqual([BENCH_CUE]); // focus cue at set start

  await page.clock.runFor(1_000);
  await expect
    .poll(() => spoken(page))
    .toEqual([BENCH_CUE, 'Ten seconds. Next: Dumbbell Bench Press, set 2.']);

  await page.clock.runFor(10_000);
  await expect.poll(() => spoken(page)).toContain('Go.');
  await expect(clock).toHaveText('0:00');

  await page.clock.runFor(30_000); // target + 30 s
  await expect.poll(() => spoken(page)).toContain('Rest is over. Dumbbell Bench Press, set 2.');
  await expect(clock).toHaveText('+0:30');
  await expect(clock).toHaveClass(/overtime/);

  // Pause freezes the rest clock and its cues
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  const before = (await spoken(page)).length;
  await page.clock.runFor(120_000);
  expect((await spoken(page)).length).toBe(before);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(clock).toHaveText('+0:30');
  expect((await spoken(page)).length).toBe(before); // resume is silent

  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'Start set' }).click();

  // Set 2 starts with the focus cue and carries reps/weight forward
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe(BENCH_CUE);
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 2 of 4');
  await expect(reps).toHaveText('8');
  await expect(kg).toHaveText('22.5');

  // Skip the rest of bench press
  await page.getByRole('button', { name: 'Skip exercise' }).click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 1 of 3');
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe(INCLINE_CUE);
  await expect(reps).toHaveText('12');
  await expect(kg).toHaveText('15');

  await page.clock.runFor(40_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(clock).toBeVisible();

  // End needs two taps
  const end = page.getByRole('button', { name: 'End workout' });
  await end.click();
  await expect(page.getByRole('button', { name: 'Tap again to end' })).toBeVisible();
  await page.getByRole('button', { name: 'Tap again to end' }).click();

  // Summary: 8×22.5 + 12×15 = 360 kg, one overrun (155 s > 150 s)
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
  await expect(page.locator('[data-stat="sets"] .stat-value')).toHaveText('2');
  await expect(page.locator('[data-stat="volume"] .stat-value')).toHaveText('360');
  await expect(page.locator('[data-stat="overruns"] .stat-value')).toHaveText('1');
  await expect(page.getByText('skipped')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__wake)).toEqual(['request', 'release']);

  // Every set is in IndexedDB
  await expect.poll(async () => (await readSets(page)).length).toBe(2);
  const rows = await readSets(page);
  expect(
    rows.map(({ exerciseId, setIndex, reps, weightKg, restTakenSec }) => ({
      exerciseId,
      setIndex,
      reps,
      weightKg,
      restTakenSec,
    })),
  ).toEqual([
    { exerciseId: 'Dumbbell_Bench_Press', setIndex: 0, reps: 8, weightKg: 22.5, restTakenSec: 0 },
    { exerciseId: 'Incline_Dumbbell_Press', setIndex: 0, reps: 12, weightKg: 15, restTakenSec: 0 },
  ]);

  // Back to Today, Pull A is suggested next
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('.day-btn.up-next')).toContainText('Pull A');

  expect(errors).toEqual([]);
});
