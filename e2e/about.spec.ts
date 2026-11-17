import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

/**
 * M13 (SPEC M13 goal 6, Accept): Settings → About → Open-source credits, in the real app at
 * 390×844 on a fresh install (owner mode off, the default here).
 * - About shows the lockup, "Version 1.15" with no build hash, the privacy promise with its one
 *   exception, "Coaching, not medical advice." and the credits row. No link anywhere.
 * - The credits list is bundled (no request when it opens); an entry's licence opens as plain text
 *   in a <pre>: its URLs and angle brackets stay text, never links or markup.
 * - Back goes Credits → About → Settings. Nothing is spoken; no request leaves the device.
 */

const about = (page: Page) => page.locator('main[data-screen="about"]');
const licenses = (page: Page) => page.locator('main[data-screen="licenses"]');

async function openAbout(page: Page): Promise<void> {
  await page.locator('[data-tab="settings"]').click();
  const row = page.locator('[data-about-open]');
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await expect(about(page)).toBeVisible();
}

test('About: version without build, privacy promise, no links; credits open as plain text', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await openAbout(page);

  // Owner off: the plain version line, no build hash, no Owner tools switch yet.
  await expect(about(page).locator('[data-about-version]')).toHaveText(/^Version \d+\.\d+$/);
  await expect(about(page)).not.toContainText('build');
  await expect(page.locator('[data-setting="owner-tools"]')).toHaveCount(0);
  await expect(about(page).locator('[data-about-privacy]')).toContainText(
    'Everything stays on this phone',
  );
  await expect(about(page).locator('[data-about-exception]')).toContainText('Barcode lookup');
  await expect(about(page).locator('[data-about-medical]')).toHaveText(
    'Coaching, not medical advice.',
  );
  await expect(about(page).locator('[data-about-credit]')).toBeVisible();
  await expect(about(page).locator('a')).toHaveCount(0);
  const sizes = await about(page)
    .locator('p, li')
    .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(20);
  await expectTapTargets(page, 'main[data-screen="about"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13-about.png') });

  // Credits: bundled, so opening them sends nothing beyond the app's own files.
  const before = requests.length;
  await about(page).locator('[data-about-licenses]').click();
  await expect(licenses(page)).toBeVisible();
  const entry = licenses(page).locator('button[data-license^="free-exercise-db"]');
  await expect(entry).toBeVisible();
  await expect(licenses(page).locator('[data-license="dexie"]')).toBeVisible();
  await expect(licenses(page).locator('a')).toHaveCount(0);
  await expectTapTargets(page, 'main[data-screen="licenses"]');
  await noHorizontalOverflow(page);

  // One entry's licence: plain text (URLs and "<" as written), not links or parsed markup.
  await entry.click();
  const text = licenses(page).locator('pre[data-license-text]');
  await expect(text).toBeVisible();
  await expect(text).toContainText('http');
  expect(await text.evaluate((e) => e.children.length)).toBe(0);
  expect(await text.evaluate((e) => (e.textContent ?? '').includes('<'))).toBe(true);
  await expect(licenses(page).locator('a')).toHaveCount(0);
  expect(await text.evaluate((e) => getComputedStyle(e).whiteSpace), 'long lines wrap at 390').toBe(
    'pre-wrap',
  );
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13-license-text.png') });

  // Back: Credits list → About → Settings.
  await licenses(page).locator('.back-btn').click();
  await expect(licenses(page).locator('[data-license="dexie"]')).toBeVisible();
  await licenses(page).locator('.back-btn').click();
  await expect(about(page)).toBeVisible();
  await about(page).locator('.back-btn').click();
  await expect(page.locator('main[data-screen="settings"]')).toBeVisible();

  const since = requests.slice(before).filter((u) => !/^(blob|data):/.test(u));
  expect(since.filter((u) => !u.startsWith(new URL(page.url()).origin))).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
