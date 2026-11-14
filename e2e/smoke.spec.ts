import { expect, test } from '@playwright/test';

test('renders the Gym Clean home with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle('Gym Clean');
  await expect(page.locator('[data-screen="today"] .brand')).toHaveText('Gym Clean');
  // M4e Today: the hero names the next workout (its h1); it fills in once history loads.
  const heading = page.locator('[data-hero] h1.hero-title');
  await expect(heading).toBeVisible();
  // Fresh database: history loaded, the first program day is up next and Start is live.
  await expect(heading).toHaveText('Push A');
  await expect(page.locator('[data-hero] [data-start]')).toBeEnabled();

  // Readable at 2 m: main title ≥ 64px, tap targets ≥ 56px.
  const fontSize = await heading.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(64);
  for (const box of await page
    .locator('button')
    .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
    expect(box).toBeGreaterThanOrEqual(56);
  }

  expect(errors).toEqual([]);
});
