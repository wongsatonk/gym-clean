import { expect, test, type Page } from '@playwright/test';

// M4e cleanup (A21/A22): the sticky CTA dock and the tab bar never hide content, and on Rest a
// coach "Apply" (a filled press) ends clear of the sticky "Start set" (the other filled press).
// Fixed clock, mocked speech and wake lock, 390×844.

declare global {
  interface Window {
    __spoken: string[];
  }
}

const BENCH = 'Dumbbell Bench Press';
const TIP = 'Strong set. Try +2.5 kg next set.';
const TIP_SPOKEN = 'Strong set. Try plus 2.5 kilos next set.';

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

async function boot(page: Page) {
  await installMocks(page);
  await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
  await page.goto('/');
  await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));
  await expect(page.locator('.day-btn').first()).toBeVisible();
}

/**
 * Scrolls to the end and checks every content block of the screen ends above the dock
 * (`.sticky-bottom` or the tab bar), and that the page has no sideways scroll.
 */
async function nothingUnderDock(page: Page, screen: string) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const r = await page.evaluate(() => {
    const dock = document.querySelector('main .sticky-bottom, main .tabbar');
    if (!dock?.parentElement) return null;
    const top = dock.getBoundingClientRect().top;
    const blocks = [...dock.parentElement.children].filter(
      (e) => !e.classList.contains('sticky-bottom') && !e.classList.contains('tabbar'),
    );
    const lowest = Math.max(...blocks.map((e) => e.getBoundingClientRect().bottom));
    return { top, lowest, count: blocks.length, sw: document.documentElement.scrollWidth };
  });
  if (!r) throw new Error(`${screen}: no dock`);
  expect(r.count, `${screen}: content above the dock`).toBeGreaterThan(0);
  expect(r.lowest, `${screen}: last block ends above the dock`).toBeLessThanOrEqual(r.top);
  expect(r.sw, `${screen}: no sideways scroll`).toBe(390);
  await page.evaluate(() => window.scrollTo(0, 0));
}

test('Settings, Preview, Exercise and Rest: nothing ends under the sticky dock', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('main.settings')).toBeVisible();
  await nothingUnderDock(page, 'settings');

  await page.locator('[data-tab="today"]').click();
  await page.getByRole('button', { name: /Push A/ }).click();
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  await nothingUnderDock(page, 'preview');

  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: BENCH })).toBeVisible();
  await nothingUnderDock(page, 'exercise');

  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await nothingUnderDock(page, 'rest');
});

test('Rest with a coach Apply: Apply ends ≥ 16px above Start set, and the tip is spoken', async ({
  page,
}) => {
  await boot(page);
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: BENCH })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.clock.runFor(30_000);
    await page.getByRole('button', { name: 'Set done' }).click();
    await expect(page.locator('[data-rest-clock]')).toBeVisible();
    if (i === 0) {
      await page.clock.runFor(5_000);
      await page.getByRole('button', { name: 'Start set' }).click();
    }
  }
  const tip = page.locator('[data-coach-tip]');
  await expect(tip).toBeVisible();
  await expect(tip.locator('[data-coach="text"]')).toHaveText(TIP);
  // Voice over screen: the advice is spoken (2 s into the rest), not only shown.
  await page.clock.runFor(2_500);
  await expect.poll(() => page.evaluate(() => window.__spoken)).toContain(TIP_SPOKEN);

  await page.evaluate(() => window.scrollTo(0, 0));
  const apply = tip.getByRole('button', { name: /^Apply 17\.5 kg/ });
  const start = page.getByRole('button', { name: 'Start set' });
  const a = await apply.boundingBox();
  const s = await start.boundingBox();
  if (!a || !s) throw new Error('Apply or Start set has no box');
  expect(s.y - (a.y + a.height)).toBeGreaterThanOrEqual(16);
  // The clock is still a main number inside the smaller ring.
  const clockPx = await page
    .locator('[data-rest-clock]')
    .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(clockPx).toBeGreaterThanOrEqual(64);

  // After Apply the "Applied" line keeps the same layout (no jump under the finger).
  await apply.click();
  const applied = tip.locator('[data-coach="applied"]');
  await expect(applied).toBeVisible();
  const ab = await applied.boundingBox();
  if (!ab) throw new Error('Applied has no box');
  expect(Math.abs(ab.y - a.y)).toBeLessThanOrEqual(1);
});
