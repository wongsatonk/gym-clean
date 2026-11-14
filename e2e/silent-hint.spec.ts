import { expect, test, type Page } from '@playwright/test';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
type Box = { x: number; y: number; width: number; height: number };
const DAY = 24 * 60 * 60 * 1000;

type Opts = { userAgent?: string; maxTouchPoints?: number; now?: number; speechRelevant?: boolean };

/** Builds the hint (from the real module) into an empty body; returns whether it rendered. */
async function mount(page: Page, opts: Opts): Promise<boolean> {
  return page.evaluate(async (o) => {
    const mod = (await import('/src/ui/silentHint.ts' as string)) as {
      silentHint(opts: unknown): HTMLElement | null;
    };
    const el = mod.silentHint({
      ...o,
      now: o.now === undefined ? undefined : () => o.now as number,
    });
    document.body.replaceChildren(...(el ? [el] : []));
    return el !== null;
  }, opts);
}

test('Silent-mode hint: iPhone and iPadOS only, readable, "Got it" hides it for 30 days', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());

  // Shown on iPhone and on iPadOS (desktop UA + touch); not on a Mac without touch or Android.
  expect(await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(true);
  expect(await mount(page, { userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 })).toBe(true);
  expect(await mount(page, { userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 0 })).toBe(false);
  expect(await mount(page, { userAgent: ANDROID_UA, maxTouchPoints: 5 })).toBe(false);
  // No spoken setting on → nothing to remind about.
  expect(
    await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5, speechRelevant: false }),
  ).toBe(false);

  const t0 = Date.parse('2026-11-13T18:00:00Z');
  expect(await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5, now: t0 })).toBe(true);
  const hint = page.locator('[data-silent-hint]');
  await expect(hint).toHaveText(/Spoken cues: turn Silent mode off\./);
  // Icon + words (not colour alone); the icon is decorative.
  await expect(hint.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  const text = hint.locator('.silent-hint-text');
  expect(
    await text.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  const ok = hint.getByRole('button', { name: 'Got it' });
  const box = (await ok.boundingBox()) as Box;
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(box.width).toBeGreaterThanOrEqual(56);

  await ok.click();
  await expect(hint).toHaveCount(0);
  // Snoozed for 30 days, back after.
  expect(await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5, now: t0 + 29 * DAY })).toBe(
    false,
  );
  expect(await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5, now: t0 + 31 * DAY })).toBe(
    true,
  );
});

test('Silent-mode hint renders and dismisses without storage', async ({ page }) => {
  await page.addInitScript(() => {
    const boom = () => {
      throw new Error('storage blocked');
    };
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(await mount(page, { userAgent: IPHONE_UA, maxTouchPoints: 5 })).toBe(true);
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('[data-silent-hint]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`Silent-mode hint above "Start workout" on the day preview (iOS UA, ${vp.width}×${vp.height})`, async ({
    browser,
  }, info) => {
    const ctx = await browser.newContext({
      userAgent: IPHONE_UA,
      viewport: vp,
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
      baseURL: info.project.use.baseURL ?? '',
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await page.getByRole('button', { name: /Push A/ }).click();
    const start = page.getByRole('button', { name: 'Start workout' });
    await expect(start).toBeVisible();
    // Mounted by the real preview screen (app.ts), right above the Start button.
    const hint = page.locator('[data-screen="preview"] .sticky-bottom > [data-silent-hint]');
    await expect(hint).toBeVisible();
    const h = (await hint.boundingBox()) as Box;
    const s = (await start.boundingBox()) as Box;
    expect(h.y + h.height).toBeLessThanOrEqual(s.y);
    // The whole Start button stays on screen while the hint shows.
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.x + s.width).toBeLessThanOrEqual(vp.width);
    expect(s.y + s.height).toBeLessThanOrEqual(vp.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
    await page.screenshot({ path: info.outputPath(`silent-hint-${vp.width}x${vp.height}.png`) });
    await hint.getByRole('button', { name: 'Got it' }).click();
    await expect(hint).toHaveCount(0);
    // Focus moves on to Start workout instead of being lost with the removed button.
    await expect(start).toBeFocused();
    await ctx.close();
  });
}
