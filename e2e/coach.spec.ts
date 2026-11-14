import { expect, test, type Page } from '@playwright/test';

// M5b task 7: the after-set coach on Rest (tip, speech, Apply), its Settings switch, and the
// Summary "Coach" section. Fixed clock, mocked speech (volume-0 unlock skipped), no camera.

declare global {
  interface Window {
    __spoken: string[];
  }
}

const BENCH = 'Dumbbell Bench Press';
const BENCH_CUE = 'Squeeze your chest, slow on the way down.';
const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);

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
          if (u.text && u.volume !== 0) window.__spoken.push(u.text); // skip the silent unlock
        },
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({
          addEventListener: () => undefined,
          release: async () => undefined,
        }),
      },
    });
  });
}

/** Console errors, page errors and any request that leaves the dev server. */
function watch(page: Page) {
  const errors: string[] = [];
  const thirdParty: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && !ORIGIN_HOSTS.has(url.hostname))
      thirdParty.push(r.url());
  });
  return { errors, thirdParty };
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken);

/** A row of the app's IndexedDB `settings` store (undefined when not set). */
function readSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('settings').objectStore('settings').get(k);
          req.onsuccess = () => {
            open.result.close();
            resolve((req.result as { value?: unknown } | undefined)?.value);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    key,
  );
}
const countOf = (list: string[], text: string) => list.filter((t) => t === text).length;

async function boot(page: Page) {
  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  // Time only moves via runFor() from here on.
  await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));
}

async function setUnit(page: Page, unit: 'kg' | 'lb') {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: unit, exact: true }).click();
  await expect(page.getByRole('button', { name: unit, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '‹ Back' }).click();
}

async function startPushA(page: Page) {
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: BENCH })).toBeVisible();
}

/** On the Exercise screen: optionally lower the reps, work 30 s, tap Set done. */
async function doSet(page: Page, repsMinus = 0) {
  for (let i = 0; i < repsMinus; i++)
    await page.getByRole('button', { name: 'Reps minus' }).click();
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
}

/** On Rest: a few seconds (no overrun), then Start set. */
async function nextSet(page: Page) {
  await page.clock.runFor(5_000);
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.locator('[data-rest-clock]')).toHaveCount(0);
}

/** Rest just started: the advice is not spoken before 2 s, then exactly once. */
async function expectSpokenOnceAt2s(page: Page, say: string) {
  await page.clock.runFor(1_500);
  expect(await spoken(page)).not.toContain(say);
  await page.clock.runFor(1_000);
  await expect.poll(async () => countOf(await spoken(page), say)).toBe(1);
  // Still once after re-renders and well into the rest (before "Ten seconds").
  await page.clock.runFor(20_000);
  expect(countOf(await spoken(page), say)).toBe(1);
}

async function endWorkout(page: Page) {
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'Tap again to end' }).click();
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

test('lb: two clean Bench sets → "+5 lb" tip, spoken once at 2 s, Apply sets 40 lb', async ({
  page,
}) => {
  const w = watch(page);
  await boot(page);
  await setUnit(page, 'lb');
  await startPushA(page);
  await expect(page.getByLabel('lb', { exact: true })).toHaveText('35');

  // Set 1 at the top (8): A3 needs two sets, so no tip yet.
  await doSet(page);
  await page.clock.runFor(3_000);
  await expect(page.locator('[data-coach-tip]')).toHaveCount(0);
  expect(await spoken(page)).toEqual([BENCH_CUE]);
  await nextSet(page);

  // Set 2 at the top → A3.
  await doSet(page);
  const tip = page.locator('[data-coach-tip]');
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute('data-advice-rule', 'A3');
  await expect(tip.locator('[data-coach="text"]')).toHaveText('Strong set. Try +5 lb next set.');
  await expect(tip.locator('[data-coach="why"]')).not.toBeEmpty();
  const apply = tip.getByRole('button', { name: 'Apply 40 lb to the next set' });
  await expect(apply).toHaveText('Apply 40 lb');
  expect((await apply.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await expectSpokenOnceAt2s(page, 'Strong set. Try plus 5 pounds next set.');
  // Queued behind the set-start cue; nothing was cancelled or reordered.
  expect((await spoken(page)).slice(0, 3)).toEqual([
    BENCH_CUE,
    BENCH_CUE,
    'Strong set. Try plus 5 pounds next set.',
  ]);
  await noOverflow(page);

  // Apply: no second tap, Next shows the new weight, the stepper starts there.
  await apply.click();
  await expect(tip.getByRole('button')).toHaveCount(0);
  await expect(tip.locator('[data-coach="applied"]')).toHaveText('Applied: 40 lb next set');
  await expect(page.locator('.next-up')).toContainText('8 reps × 40 lb');
  // Re-renders (clock ticks) keep the Applied state.
  await page.clock.runFor(2_000);
  await expect(tip.locator('[data-coach="applied"]')).toBeVisible();
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 3 of 4');
  await expect(page.getByLabel('lb', { exact: true })).toHaveText('40');

  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('below range → "Keep the weight. Aim for 8 reps." shown and spoken', async ({ page }) => {
  const w = watch(page);
  await boot(page);
  await startPushA(page);
  await doSet(page, 2); // 6 reps < 8
  const tip = page.locator('[data-coach-tip]');
  await expect(tip).toHaveAttribute('data-advice-rule', 'A2');
  await expect(tip.locator('[data-coach="text"]')).toHaveText('Keep the weight. Aim for 8 reps.');
  await expect(tip.getByRole('button')).toHaveCount(0); // no Apply for A2
  await expectSpokenOnceAt2s(page, 'Keep the weight. Aim for 8 reps.');
  await noOverflow(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('kg: two clean Bench sets → "+2.5 kg" and "Apply 17.5 kg"', async ({ page }) => {
  const w = watch(page);
  await boot(page);
  await startPushA(page);
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('15');
  await doSet(page);
  await nextSet(page);
  await doSet(page);
  const tip = page.locator('[data-coach-tip]');
  await expect(tip.locator('[data-coach="text"]')).toHaveText('Strong set. Try +2.5 kg next set.');
  await expect(tip.getByRole('button', { name: 'Apply 17.5 kg to the next set' })).toBeVisible();
  await expectSpokenOnceAt2s(page, 'Strong set. Try plus 2.5 kilos next set.');
  await noOverflow(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('"Coach tips" off (persisted) → no tip and no advice speech', async ({ page }) => {
  const w = watch(page);
  // Settings + reload with the fake clock still running: the IndexedDB write and the reload's
  // async settings read must settle before time is paused.
  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sw = page.locator('[data-setting="coach-tips"]');
  await expect(sw).toHaveAttribute('aria-checked', 'true'); // default on
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => readSetting(page, 'coachTips')).toBe(false);
  // Persisted across a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-setting="coach-tips"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.getByRole('button', { name: '‹ Back' }).click();
  const t = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(t + 1_000);

  await startPushA(page);
  await doSet(page, 2); // would be A2
  await page.clock.runFor(5_000);
  await expect(page.locator('[data-coach-tip]')).toHaveCount(0);
  await nextSet(page);
  await doSet(page); // still nothing
  await page.clock.runFor(25_000);
  await expect(page.locator('[data-coach-tip]')).toHaveCount(0);
  const said = await spoken(page);
  expect(said.filter((t) => /Keep the weight|Strong set|Aim for|Next time/.test(t))).toEqual([]);
  expect(said).toContain(BENCH_CUE); // speech itself still works

  // The Summary section always shows.
  await endWorkout(page);
  await expect(page.locator('[data-coach-summary]')).toBeVisible();
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('Summary Coach section: a next-time line per exercise and "+N reps" vs last time', async ({
  page,
}) => {
  const w = watch(page);
  await boot(page);

  // Session 1: one Bench set of 6.
  await startPushA(page);
  await doSet(page, 2);
  await endWorkout(page);
  const summary = page.locator('[data-coach-summary]');
  await expect(summary.locator('[data-coach-exercise]')).toHaveCount(1);
  await expect(summary.locator('[data-progress]')).toHaveCount(0); // no last time yet
  await page.getByRole('button', { name: 'Done' }).click();

  // Session 2: Bench 8 (same weight → +2 reps), then one Incline set via the exercise list.
  await page.clock.runFor(3_600_000);
  await startPushA(page);
  await expect(page.getByLabel('Reps', { exact: true })).toHaveText('8');
  await doSet(page);
  await page.getByRole('button', { name: 'Exercise list' }).click();
  await page.getByRole('dialog', { name: 'Exercise list' }).locator('[data-ex-index="1"]').click();
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.getByRole('heading', { name: 'Incline Dumbbell Press' })).toBeVisible();
  await doSet(page);
  await endWorkout(page);

  await expect(summary.getByRole('heading', { name: 'Coach' })).toBeVisible();
  const items = summary.locator('[data-coach-exercise]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute('data-coach-exercise', 'Dumbbell_Bench_Press');
  await expect(items.nth(1)).toHaveAttribute('data-coach-exercise', 'Incline_Dumbbell_Press');
  for (let i = 0; i < 2; i++) {
    await expect(items.nth(i).locator('[data-coach="next"]')).toHaveText(/^Next time: .+\.$/);
    await expect(items.nth(i)).toHaveAttribute('data-advice-rule', /^N[1-6]$/);
  }
  const progress = items.nth(0).locator('[data-progress]');
  await expect(progress).toContainText('Up');
  await expect(progress).toContainText('+2 reps vs last time.');
  await expect(items.nth(1).locator('[data-progress]')).toHaveCount(0); // no Incline last time
  // Summary is shown, not spoken.
  expect((await spoken(page)).filter((t) => t.startsWith('Next time'))).toEqual([]);
  await noOverflow(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});
