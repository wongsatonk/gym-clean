// M6 PWA guard for the dev server (project "mobile"): the service worker is build-only, so dev
// and every dev-server e2e run without one (a worker would serve stale code between edits).
import { expect, test } from './fixtures';

test('the dev server registers no service worker and links no manifest', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-screen="today"] .brand')).toHaveText('Gym Clean');
  // registerSW.js runs on window load; give it the chance before checking.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
  const registrations = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistrations()).length,
  );
  expect(registrations).toBe(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
});
