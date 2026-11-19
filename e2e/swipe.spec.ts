// M13d tasks 24 + 27 (SPEC M13d Goal 5a): swipe back from the left edge, with real touch events
// (CDP Input.dispatchTouchEvent on the mobile project's touch emulation).
//
// 1. Harness (src/ui/gestures/edgeBack.harness.html, the real About screen, made-up data): the
//    screen follows the finger, past a third of the width Back is pressed once and feel() runs
//    once; a short drag springs back; a vertical drag from the edge is the page's; Reduce Motion
//    keeps the action without the follow; nothing in a workout. No sideways scroll mid-swipe.
//    SWIPE_SHOT=1 also writes docs/screenshots/m13d-swipe-back.png (390×844, mid-swipe).
// 2. The app (task 27 installs edge-back on #app in the iPhone app / home-screen app only; standalone
//    is emulated here): Settings → About → swipe → Settings; intake question 3 → swipe →
//    question 2; Fuel → Measurements → swipe → Fuel; Today → nothing; a workout → nothing; a
//    normal browser tab (no standalone) → not installed, About stays.
//    `openInstalled` expects `#app[data-edge-back]` (app.ts installs it).
// Nothing here is spoken: the swipe only presses an existing Back, which is never mid-set.
import type { CDPSession } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { at, noHorizontalOverflow, openApp } from './app.helpers';

const HARNESS = '/src/ui/gestures/edgeBack.harness.html';

type Swipe = {
  from?: number;
  to: number;
  y?: number;
  /** Total vertical travel (a scroll, not a swipe). */
  dy?: number;
  steps?: number;
  /** Hold still this long before lifting (no flick). */
  holdMs?: number;
  /** false: leave the finger down (for a mid-swipe look); call `lift` later. */
  release?: boolean;
};

/**
 * A finger on CDP touch emulation. Events carry their own timestamps (16 ms apart, like a phone's
 * frames), so speed is what the swipe says, not how fast CDP round-trips are.
 */
type Finger = { cdp: CDPSession; t: number };

async function finger(page: Page): Promise<Finger> {
  return { cdp: await page.context().newCDPSession(page), t: Date.now() / 1000 };
}

async function send(
  f: Finger,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x?: number,
  y?: number,
): Promise<void> {
  await f.cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: x === undefined || y === undefined ? [] : [{ x, y }],
    timestamp: f.t,
  });
}

async function swipe(f: Finger, s: Swipe): Promise<void> {
  const { from = 4, to, y = 420, dy = 0, steps = 12, holdMs = 160, release = true } = s;
  await send(f, 'touchStart', from, y);
  for (let i = 1; i <= steps; i++) {
    f.t += 0.016;
    await send(f, 'touchMove', from + ((to - from) * i) / steps, y + (dy * i) / steps);
  }
  f.t += holdMs / 1000;
  if (release) await lift(f);
}

async function lift(f: Finger): Promise<void> {
  f.t += 0.016;
  await send(f, 'touchEnd');
}

const harnessLog = (page: Page) =>
  page.evaluate(() => (window as unknown as { harnessLog: string[] }).harnessLog);
const screenTransform = (page: Page) =>
  page.locator('main[data-screen="about"]').evaluate((el) => (el as HTMLElement).style.transform);

async function openHarness(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(HARNESS + query);
  await expect(page.locator('#app[data-edge-back] main[data-screen="about"]')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

test.describe('edge swipe back: harness', () => {
  test('follows the finger, then past a third: Back once and feel() once', async ({ page }) => {
    const errors = await openHarness(page);
    const cdp = await finger(page);
    await swipe(cdp, { to: 200, release: false });
    expect(await screenTransform(page)).toBe('translate3d(196px, 0px, 0px)');
    await noHorizontalOverflow(page); // #app clips: no sideways scroll mid-swipe
    if (process.env.SWIPE_SHOT) {
      await page.screenshot({ path: 'docs/screenshots/m13d-swipe-back.png' });
    }
    expect(await harnessLog(page)).toEqual([]);
    await lift(cdp);
    expect(await harnessLog(page)).toEqual(['back', 'feel']);
    expect(await screenTransform(page)).toBe('');
    expect(errors).toEqual([]);
  });

  test('a short drag springs back; a vertical drag from the edge is left to the page', async ({
    page,
  }) => {
    await openHarness(page);
    const cdp = await finger(page);
    await swipe(cdp, { to: 90 });
    await expect.poll(() => screenTransform(page)).toBe('');
    await swipe(cdp, { to: 14, dy: -300 });
    expect(await screenTransform(page)).toBe('');
    // Away from the edge: not a back swipe.
    await swipe(cdp, { from: 80, to: 330 });
    expect(await harnessLog(page)).toEqual([]);
  });

  test('a quick flick commits from a short distance', async ({ page }) => {
    await openHarness(page);
    const cdp = await finger(page);
    await swipe(cdp, { to: 100, steps: 3, holdMs: 0 });
    expect(await harnessLog(page)).toEqual(['back', 'feel']);
  });

  test('Reduce Motion: no follow, the same action', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHarness(page);
    const cdp = await finger(page);
    await swipe(cdp, { to: 200, release: false });
    expect(await screenTransform(page)).toBe('');
    await lift(cdp);
    expect(await harnessLog(page)).toEqual(['back', 'feel']);
  });

  test('in a workout (data-in-workout): nothing', async ({ page }) => {
    await openHarness(page, '?view=workout');
    const cdp = await finger(page);
    await swipe(cdp, { to: 200, release: false });
    expect(await screenTransform(page)).toBe('');
    await lift(cdp);
    expect(await harnessLog(page)).toEqual([]);
  });
});

// ---------- the app (task 27) ----------

/** Standalone display mode, as on the home-screen app (task 27 installs only there / in the app). */
async function emulateStandalone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => {
      if (!/display-mode:\s*standalone/.test(q)) return real(q);
      const mql = real('(min-width: 0px)'); // always matches; keeps a real MediaQueryList shape
      return Object.defineProperty(mql, 'media', { value: q });
    };
  });
}

async function openInstalled(page: Page): Promise<Finger> {
  await emulateStandalone(page);
  await openApp(page, at(13, 18));
  const installed = await page.locator('#app[data-edge-back]').count();
  expect(installed).toBeGreaterThan(0);
  return finger(page);
}

test.describe('edge swipe back: in the app', () => {
  test('Settings → About → swipe → Settings', async ({ page }) => {
    const cdp = await openInstalled(page);
    await page.locator('[data-tab="settings"]').click();
    const row = page.locator('[data-about-open]');
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(page.locator('main[data-screen="about"]')).toBeVisible();
    await swipe(cdp, { to: 220 });
    await expect(page.locator('main[data-screen="settings"]')).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('intake question 3 → swipe → question 2', async ({ page }) => {
    const cdp = await openInstalled(page);
    const intake = page.locator('main[data-screen="intake"]');
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-intake-open]').click();
    await expect(intake).toHaveAttribute('data-step', 'goal');
    await intake.locator('[data-option="muscle"]').click();
    await intake.locator('[data-intake-next]').click();
    await expect(intake).toHaveAttribute('data-step', 'days');
    await intake.locator('[data-option="3"]').click();
    await intake.locator('[data-intake-next]').click();
    await expect(intake).toHaveAttribute('data-step', 'length');
    await swipe(cdp, { to: 220 });
    await expect(intake).toHaveAttribute('data-step', 'days');
  });

  test('Fuel → Measurements → swipe → Fuel', async ({ page }) => {
    const cdp = await openInstalled(page);
    await page.locator('[data-tab="fuel"]').click();
    const fuel = page.locator('main[data-screen="fuel"]');
    await expect(fuel).toBeVisible();
    await fuel.locator('[data-measurements-open]').click();
    const ms = page.locator('main[data-screen="measurements"]');
    await expect(ms).toBeVisible();
    // Exactly one Back offered to the swipe: the header's.
    await expect(page.locator('[data-swipe-back]')).toHaveCount(1);
    await swipe(cdp, { to: 220 });
    await expect(fuel).toBeVisible();
    await expect(ms).toHaveCount(0);
    await expect(page.locator('[data-tab="fuel"]')).toHaveAttribute('aria-current', 'page');
    await noHorizontalOverflow(page);
  });

  test('Today: nothing (a tab root has nothing to go back to)', async ({ page }) => {
    const cdp = await openInstalled(page);
    await swipe(cdp, { to: 220 });
    const today = page.locator('main[data-screen="today"]');
    await expect(today).toBeVisible();
    expect(await today.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  });

  test('a normal browser tab (not standalone): not installed, an edge swipe on About does nothing', async ({
    page,
  }) => {
    // In a Safari tab the browser's own edge swipe means "leave the page": the app stays out.
    await openApp(page, at(13, 18));
    expect(await page.evaluate(() => window.matchMedia('(display-mode: standalone)').matches)).toBe(
      false,
    );
    await expect(page.locator('#app[data-edge-back]')).toHaveCount(0);
    await page.locator('[data-tab="settings"]').click();
    const row = page.locator('[data-about-open]');
    await row.scrollIntoViewIfNeeded();
    await row.click();
    const about = page.locator('main[data-screen="about"]');
    await expect(about).toBeVisible();
    const cdp = await finger(page);
    await swipe(cdp, { to: 220, release: false });
    expect(await about.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
    await lift(cdp);
    await expect(about).toBeVisible();
    await expect(page.locator('main[data-screen="settings"]')).toHaveCount(0);
    await noHorizontalOverflow(page);
  });

  test('a workout: nothing on Exercise', async ({ page }) => {
    const cdp = await openInstalled(page);
    await page
      .getByRole('button', { name: /Push A/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    const exercise = page.locator('[data-screen="exercise"]');
    await expect(exercise).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-in-workout', /.*/);
    await swipe(cdp, { to: 220 });
    await expect(exercise).toBeVisible();
    expect(await exercise.evaluate((el) => (el as HTMLElement).style.transform)).toBe('');
  });
});
