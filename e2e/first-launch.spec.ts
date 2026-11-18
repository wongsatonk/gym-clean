import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getSetting,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  record,
} from './app.helpers';

/**
 * M13 first launch (SPEC M13 goal 1, Accept), the real app at 390×844 on a fresh install:
 * welcome pages (1 of 5: the lockup) → the slice 1b intake → the camera page → Today. On the web
 * the camera is the only permission page (Health, mic and reminders are iPhone-app pages).
 * - Every page: "N of 5", Skip, Back, one forward action; text ≥ 20px, buttons ≥ 56px, no
 *   horizontal scroll. Nothing is spoken (read with the phone in hand).
 * - "Allow camera" asks once and stops the camera straight away (nothing kept running), then
 *   shows "Allowed"; "Go to Today" stores settings 'onboarding' { doneAt } and never shows again.
 * - Skip on any page ends it ({ skippedAt }); Escape is the same shortcut.
 * - Settings → "Show the welcome again" replays it (no intake on a used install) and keeps the
 *   first stored row.
 * No request leaves the device.
 */

test.use({ firstRun: 'fresh' });

declare global {
  interface Window {
    __camTracks: MediaStreamTrack[];
  }
}

const NOW = at(13, 18);
const welcome = (page: Page) => page.locator('[data-screen="welcome"]');
const count = (page: Page) => page.locator('[data-ob="count"]');
const primary = (page: Page) => page.locator('[data-ob="primary"]');
const intake = (page: Page) => page.locator('main[data-screen="intake"]');

/** Keeps every camera track the app opens, to check it was stopped. */
async function watchCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__camTracks = [];
    const md = navigator.mediaDevices;
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      const s = await real(c);
      window.__camTracks.push(...s.getTracks());
      return s;
    };
  });
}

async function open(page: Page): Promise<void> {
  await installMocks(page);
  await watchCamera(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  await expect(welcome(page)).toBeVisible();
}

/** The current page's text sizes (px) and buttons (≥ 56px), and no sideways scroll. */
async function checkPage(page: Page): Promise<void> {
  const sizes = await welcome(page)
    .locator('p:not(.sr-only), h2, button')
    .evaluateAll((els) =>
      els
        .filter((e) => e.getClientRects().length > 0)
        .map((e) => [e.textContent?.trim() ?? '', parseFloat(getComputedStyle(e).fontSize)]),
    );
  for (const [text, px] of sizes) expect(Number(px), `"${text}"`).toBeGreaterThanOrEqual(20);
  await expectTapTargets(page, '[data-screen="welcome"]');
  await noHorizontalOverflow(page);
}

test('welcome → intake → camera (allowed, then stopped) → Today; stored once, never again', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page);

  // Page 1: the lockup, "1 of 5", Back disabled, Skip there, no tab bar.
  await expect(count(page)).toHaveText('1 of 5');
  await expect(welcome(page).locator('[data-ob="back"]')).toBeDisabled();
  await expect(welcome(page).locator('[data-ob="skip"]')).toBeVisible();
  await expect(welcome(page)).toContainText('Everything stays on this phone.');
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);
  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath('m13-welcome-1.png') });

  // Next, Back, Next: the pages move both ways.
  await primary(page).click();
  await expect(count(page)).toHaveText('2 of 5');
  await welcome(page).locator('[data-ob="back"]').click();
  await expect(count(page)).toHaveText('1 of 5');
  await primary(page).click();
  await primary(page).click();
  await expect(count(page)).toHaveText('3 of 5');
  await checkPage(page);

  // Page 4 is the intake itself; Skip for now there moves on to the camera page.
  await primary(page).click();
  await expect(intake(page)).toBeVisible();
  await intake(page).locator('[data-intake-skip]').click();
  await expect(count(page)).toHaveText('5 of 5');
  await expect(welcome(page).locator('[data-permission="camera"]')).toBeVisible();
  await expect(primary(page)).toHaveText('Allow camera');
  await expect(welcome(page).locator('[data-ob="not-now"]')).toBeVisible();
  await checkPage(page);
  await page.screenshot({ path: testInfo.outputPath('m13-welcome-camera.png') });

  // Allow: asked once, every track stopped at once; the page shows "Allowed".
  await primary(page).click();
  await expect(welcome(page).locator('[data-ob="granted"]')).toContainText('Allowed');
  const tracks = await page.evaluate(() => window.__camTracks.map((t) => t.readyState));
  expect(tracks.length).toBeGreaterThan(0);
  expect(tracks.every((s) => s === 'ended')).toBe(true);
  await expect(primary(page)).toHaveText('Go to Today');
  await checkPage(page);

  await primary(page).click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  await expect.poll(() => getSetting(page, 'onboarding')).toEqual({ doneAt: expect.any(Number) });

  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Skip on page 2 ends it (skippedAt) and it never shows again', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page);
  await primary(page).click();
  await expect(count(page)).toHaveText('2 of 5');
  await welcome(page).locator('[data-ob="skip"]').click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect
    .poll(() => getSetting(page, 'onboarding'))
    .toEqual({ skippedAt: expect.any(Number) });
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__camTracks)).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Escape is the Skip shortcut', async ({ page }) => {
  const offsite = await guardNetwork(page);
  await open(page);
  await primary(page).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect
    .poll(() => getSetting(page, 'onboarding'))
    .toEqual({ skippedAt: expect.any(Number) });
  expect(offsite).toEqual([]);
});

test('Not now on the camera page never opens the camera; Go to Today is not needed', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page);
  for (let i = 0; i < 3; i++) await primary(page).click();
  await intake(page).locator('[data-intake-skip]').click();
  await expect(welcome(page).locator('[data-permission="camera"]')).toBeVisible();
  await welcome(page).locator('[data-ob="not-now"]').click();
  // Not now on the last page ends the flow as done.
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect.poll(() => getSetting(page, 'onboarding')).toEqual({ doneAt: expect.any(Number) });
  expect(await page.evaluate(() => window.__camTracks)).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Settings → "Show the welcome again" replays it without the intake; the first row stays', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page);
  await welcome(page).locator('[data-ob="skip"]').click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect.poll(() => getSetting(page, 'onboarding')).toBeTruthy();
  const first = await getSetting(page, 'onboarding');

  await page.locator('[data-tab="settings"]').click();
  const rerun = page.locator('[data-welcome-rerun]');
  await rerun.scrollIntoViewIfNeeded();
  await expect(rerun).toHaveText('Show the welcome again');
  await rerun.click();
  await expect(welcome(page)).toBeVisible();
  await expect(count(page)).toHaveText('1 of 4');
  for (let i = 0; i < 3; i++) await primary(page).click();
  await expect(intake(page)).toHaveCount(0);
  await expect(welcome(page).locator('[data-permission="camera"]')).toBeVisible();
  await welcome(page).locator('[data-ob="not-now"]').click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  expect(await getSetting(page, 'onboarding')).toEqual(first);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
