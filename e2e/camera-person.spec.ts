import { expect, test } from '@playwright/test';

test('tracks a person on the live camera and drives the 3D skeleton', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();

  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 30_000 });
  await expect(cam.locator('.cam-status')).toContainText('tracking');
  const skel = cam.locator('.skeleton3d');
  await expect(skel).toHaveAttribute('data-live', 'true');

  // Side preset turns the skeleton 90°
  await cam.getByRole('button', { name: 'Side' }).click();
  await expect(skel).toHaveAttribute('data-angle', '-1.57');

  // Overlay canvas has drawn something (non-transparent pixels)
  const drawn = await cam.locator('.cam-overlay').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx || !c.width) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 16) if ((d[i] ?? 0) > 0) n++;
    return n;
  });
  expect(drawn).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
