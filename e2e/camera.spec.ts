import { expect, test } from './fixtures';
import { skipExercise } from './workout.helpers';

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
  // The 3D skeleton starts collapsed behind the "3D" toggle
  const toggle3d = cam.getByRole('button', { name: '3D skeleton' });
  await expect(toggle3d).toHaveAttribute('aria-expanded', 'false');
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  await toggle3d.click();
  await expect(toggle3d).toHaveAttribute('aria-expanded', 'true');
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

// The native app (capacitor://) loads the wasm loader as a blob: URL and the model as a buffer
// from our own fetches (src/pose/fileset.ts). Chromium can't serve capacitor://, so force that
// path here and prove MediaPipe accepts it; on the real scheme it is chosen automatically.
test('pose model loads through the native own-fetch path (blob: loader + model buffer)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const m = (await import('/src/pose/landmarker.ts' as string)) as typeof import('../src/pose/landmarker');
    const t = await m.createPoseTracker('CPU', { ownFetch: true });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const frame = t.detect(c, 1);
    t.close();
    return { delegate: t.delegate, frame };
  });
  expect(out).toEqual({ delegate: 'CPU', frame: null });
  const origin = new URL(page.url()).origin;
  expect(requests).toContain(`${origin}/mediapipe/wasm/vision_wasm_internal.js`);
  expect(requests).toContain(`${origin}/models/pose_landmarker_lite.task`);
  expect(requests.some((u) => u.startsWith('blob:'))).toBe(true);
  expect(errors).toEqual([]);
});

test('pose-tracked exercises offer the camera; manual ones do not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();
  await skipExercise(page); // Lat pulldown = manual
  await expect(page.getByRole('heading', { name: 'Wide-Grip Lat Pulldown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toHaveCount(0);
});

// M4f wave 1: the six learning rules make their exercises camera exercises. Bench press stays
// manual (no rule), so its screen never offers the camera.
test('Hammer Curls offers the camera; Dumbbell Bench Press does not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  await page
    .getByRole('dialog', { name: 'Exercise list' })
    .locator('.ex-row-btn', { hasText: 'Hammer Curls' })
    .click();
  await expect(page.getByRole('heading', { name: 'Hammer Curls' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();

  await page.goto('/');
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toHaveCount(0);
});
