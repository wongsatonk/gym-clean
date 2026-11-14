// M4e A14/A15: the Summary's vs-last volume, new bests and the bodyweight reps card, driven
// through real sessions (IndexedDB history), plus a Fix on Summary that must refresh both.
import { expect, test, type Page } from '@playwright/test';
import { endWorkout, skipExercise } from './workout.helpers';

declare global {
  interface Window {
    __spoken: string[];
  }
}

/** speechSynthesis and Wake Lock recorders (Summary itself must stay silent). */
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
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
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

const spoken = (page: Page) => page.evaluate(() => window.__spoken);

async function startPushA(page: Page) {
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
}

/** Steps the Reps stepper to `target` (either way). */
async function setReps(page: Page, target: number) {
  const reps = page.getByLabel('Reps', { exact: true });
  for (let i = 0; i < 20; i++) {
    const now = Number(await reps.textContent());
    if (now === target) return;
    await page.getByRole('button', { name: now < target ? 'Reps plus' : 'Reps minus' }).click();
    await expect(reps).not.toHaveText(String(now));
  }
  throw new Error(`could not reach ${target} reps`);
}

async function boot(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));
  return errors;
}

test('second Push A: vs-last % and a new best; a Fix on Summary refreshes both', async ({
  page,
}) => {
  const errors = await boot(page);

  // Session 1: one bench set, 8 × 15 kg = 120 kg.
  await startPushA(page);
  await setReps(page, 8);
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('15');
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await endWorkout(page);
  // No earlier Push A: no comparison, no bests.
  await expect(page.locator('[data-volume-mode]')).toHaveAttribute('data-volume-mode', 'first');
  await expect(page.locator('[data-stat="volume"] .stat-value')).toHaveText('120');
  await expect(page.locator('[data-vs-last]')).toHaveCount(0);
  await expect(page.locator('[data-best]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Done' }).click();

  // Session 2, later: 10 × 15 kg = 150 kg → +25%, and 10 reps beats 8 at 15 kg.
  await page.clock.runFor(60 * 60_000);
  await startPushA(page);
  await setReps(page, 10);
  await expect(page.getByLabel('kg', { exact: true })).toHaveText('15');
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await endWorkout(page);

  const vs = page.locator('[data-vs-last]');
  await expect(vs).toHaveText('+25% vs last Push A');
  await expect(vs).toHaveAttribute('data-tone', 'up');
  await expect(page.locator('[data-bar="last"] .sum-bar-value')).toHaveText('120');
  await expect(page.locator('[data-bar="today"] .sum-bar-value')).toHaveText('150');
  await expect(page.locator('[data-stat="volume"] .stat-value')).toHaveText('150');
  const best = page.locator('[data-best="Dumbbell_Bench_Press"]');
  await expect(page.locator('[data-best]')).toHaveCount(1);
  await expect(best).toHaveAttribute('data-best-kind', 'reps');
  await expect(best.locator('.sum-best-now')).toHaveText('10 × 15');
  await expect(best.locator('.sum-best-was')).toHaveText('was 8 × 15 kg');
  await expect(page.getByRole('heading', { name: '1 new best' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('summary-vs-last.png') });

  // Fix last set on Summary: 10 → 8 reps. Same volume as last time, and no longer a best.
  const spokenBefore = (await spoken(page)).length;
  const fix = page.locator('[data-lsc=panel]');
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('10 reps');
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-minus]').click();
  await fix.locator('[data-lsc=reps-minus]').click();
  await expect(fix.locator('[data-lsc=reps-value]')).toHaveText('8');
  await fix.locator('[data-lsc=save]').click();

  await expect(page.locator('[data-stat="volume"] .stat-value')).toHaveText('120');
  await expect(vs).toHaveText('Same as last Push A');
  await expect(vs).toHaveAttribute('data-tone', 'flat');
  await expect(page.locator('[data-bar="today"] .sum-bar-value')).toHaveText('120');
  await expect(page.locator('[data-best]')).toHaveCount(0);
  await expect(page.locator('[data-bests]')).toHaveCount(0);

  // One rep lower still: 7 × 15 = 105 → −12.5% rounds to −12% (Math.round), shown neutral.
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-minus]').click();
  await fix.locator('[data-lsc=save]').click();
  await expect(vs).toHaveText('−12% vs last Push A');
  await expect(vs).toHaveAttribute('data-tone', 'down');
  await expect(page.locator('[data-best]')).toHaveCount(0);

  // Summary is read, not spoken.
  expect((await spoken(page)).length).toBe(spokenBefore);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('bodyweight-only day: the card shows total reps, not volume', async ({ page }) => {
  const errors = await boot(page);

  await startPushA(page);
  for (let i = 0; i < 5; i++) await skipExercise(page);
  await expect(page.getByRole('heading', { name: /Push-?ups/i })).toBeVisible();
  const reps = Number(await page.getByLabel('Reps', { exact: true }).textContent());
  expect(reps).toBeGreaterThan(0);
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await endWorkout(page);

  await expect(page.locator('[data-volume-mode]')).toHaveAttribute(
    'data-volume-mode',
    'bodyweight',
  );
  await expect(page.locator('[data-stat="volume"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="reps"] .stat-value')).toHaveText(String(reps));
  await expect(page.locator('.sum-volume-label')).toHaveText('Total reps');
  await expect(page.locator('.sum-volume-note')).toHaveText('Bodyweight day. Reps are the score.');
  await expect(page.locator('[data-vs-last]')).toHaveCount(0);
  // Tiles: sets / exercises / long rests (reps is in the card).
  await expect(page.locator('.sum-tile')).toHaveCount(3);
  await expect(page.locator('[data-stat="sets"] .stat-value')).toHaveText('1');
  await expect(page.locator('[data-stat="exercises"] .stat-value')).toHaveText('1/6');
  await expect(page.locator('.set-list li').first()).toContainText(`${reps} reps`);
  await page.screenshot({ path: test.info().outputPath('summary-bodyweight.png') });

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});
