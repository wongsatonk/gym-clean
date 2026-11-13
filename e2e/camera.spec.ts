import { expect, test } from '@playwright/test';

test('camera test runs on-device pose inference on the live stream', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const sent: string[] = [];
  page.on('requestfinished', (r) => sent.push(r.url()));

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();

  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  // Model loads and inference runs (fake camera = test pattern, so no person)
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });
  await expect
    .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await expect(cam).toHaveAttribute('data-person', 'false');
  await expect(cam.locator('.skeleton3d canvas')).toBeVisible();

  // 3D presets
  await cam.getByRole('button', { name: 'Side' }).click();
  await expect(cam.locator('.skeleton3d')).toHaveAttribute('data-preset', 'side');

  // Switch camera keeps running
  await cam.getByRole('button', { name: 'Switch camera' }).click();
  await expect(cam.locator('.cam-stage')).toHaveAttribute('data-facing', 'environment');

  // Close stops every camera track
  await cam.getByRole('button', { name: 'Close' }).click();
  await expect(cam).toHaveCount(0);
  const live = await page.evaluate(() =>
    [...document.querySelectorAll('video')].some((v) => v.srcObject instanceof MediaStream),
  );
  expect(live).toBe(false);

  // Privacy: model + wasm come from our own origin, and nothing reaches a third party
  // (MediaPipe's usage logging is blocked by the page's CSP connect-src).
  const origin = new URL(page.url()).origin;
  const external = (u: string) =>
    !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:');
  expect(sent.filter(external)).toEqual([]);
  expect(requests.some((u) => u.startsWith(`${origin}/models/pose_landmarker_lite.task`))).toBe(
    true,
  );
  expect(requests.some((u) => u.startsWith(`${origin}/mediapipe/wasm/`))).toBe(true);
  expect(errors).toEqual([]);
});

test('pose-tracked exercises offer the camera; manual ones do not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Skip exercise' }).click(); // Lat pulldown = manual
  await expect(page.getByRole('heading', { name: 'Wide-Grip Lat Pulldown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toHaveCount(0);
});
