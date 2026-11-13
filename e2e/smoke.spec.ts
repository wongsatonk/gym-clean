import { expect, test } from '@playwright/test';

test('renders the FocusRep title with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle('FocusRep');
  const heading = page.getByRole('heading', { level: 1, name: 'FocusRep' });
  await expect(heading).toBeVisible();

  // Readable at 2 m: main title ≥ 64px.
  const fontSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(64);

  expect(errors).toEqual([]);
});
