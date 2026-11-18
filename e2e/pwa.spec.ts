// M6 PWA (project "pwa", runs against `vite preview` of a production build): the app installs a
// service worker on first load, then works in airplane mode, including the pose model and the
// MediaPipe wasm, even though the camera was never opened while online.
import { expect, test, type Page, type Request } from './fixtures';

const MODEL = 'models/pose_landmarker_lite.task';
const WASM = 'mediapipe/wasm/vision_wasm_internal.wasm';

/** Waits until a service worker is active and controls this page (a reload after first install). */
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // No clientsClaim (updates must not take over a running page), so the first page load stays
  // uncontrolled; the next load is served by the worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

test('installs, then works offline with the model and wasm served from the cache', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: Request[] = [];
  context.on('request', (r) => requests.push(r));

  await page.goto('/');
  await expect(page.locator('[data-screen="today"] .brand')).toHaveText('Gym Clean');
  const origin = new URL(page.url()).origin;

  // Installable: manifest linked, standalone, portrait, dark, three icons incl. maskable.
  const manifestHref = (await page.locator('link[rel="manifest"]').getAttribute('href')) ?? '';
  expect(manifestHref).toContain('manifest.webmanifest');
  const manifest = await (await page.request.get(new URL(manifestHref, page.url()).href)).json();
  expect(manifest).toMatchObject({
    name: 'Gym Clean',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#0d0f12',
    background_color: '#0d0f12',
    start_url: '/',
    scope: '/',
  });
  expect(
    manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes} ${i.purpose}`),
  ).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await page.request.get(new URL(icon.src, page.url()).href)).ok()).toBe(true);
  }
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  const touchIcon = (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '';
  expect(touchIcon).toContain('apple-touch-icon.png');
  expect((await page.request.get(new URL(touchIcon, page.url()).href)).ok()).toBe(true);

  await waitForServiceWorker(page);
  // Precached at install, before the camera was ever opened.
  const cached = await page.evaluate(
    async (urls) =>
      Promise.all(urls.map(async (u) => !!(await caches.match(u, { ignoreSearch: true })))),
    [`${origin}/${MODEL}`, `${origin}/${WASM}`],
  );
  expect(cached).toEqual([true, true]);

  // Airplane mode.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-screen="today"] .brand')).toHaveText('Gym Clean');
  await expect(page.locator('[data-hero] h1.hero-title')).toHaveText('Push A');
  await expect(page.locator('[data-hero] [data-start]')).toBeEnabled();

  // The camera test runs real on-device inference offline: model + wasm come from the cache.
  const fromSw: string[] = [];
  page.on('response', (r) => {
    if (r.fromServiceWorker()) fromSw.push(r.url());
  });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });
  await expect
    .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await cam.getByRole('button', { name: 'Close' }).click();
  expect(fromSw).toContain(`${origin}/${MODEL}`);
  expect(fromSw).toContain(`${origin}/${WASM}`);

  // Privacy: nothing ever left for a third party, online or offline.
  const external = requests
    .map((r) => r.url())
    .filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
