// M13d task 40a (SPEC M13d Goal 7): the chrome and sheet buttons are round icon buttons in the
// real app, 390×844, fixed clock, mocked speech and wake lock (app.helpers installMocks).
// - Settings → About: Back is a round button with its word beside ("Settings"), keeps the
//   `data-back` / `data-swipe-back` hooks and its name, ≥ 56px, and goes back.
// - Fuel → Log food: the sheet's Close is a quiet round button with the word beside, ≥ 56px.
// - A workout (mid-set = styling only): the top bar stays 60px tall, Pause keeps its 88×60 hit
//   box and its name, the exercise list keeps its name; nothing new is spoken by the restyle.
// No sideways scroll anywhere. CHROME_SHOT=1 also writes the after shots
// docs/screenshots/m13d-buttons-after-chrome{,-sheet,-topbar}.png.
import { expect, test, type Locator, type Page } from './fixtures';
import { at, noHorizontalOverflow, openApp } from './app.helpers';

const shots = process.env.CHROME_SHOT === '1';
const spoken = (page: Page) => page.evaluate(() => window.__spoken);

/** A round icon button: hook, visible word = name, ≥ 56px both ways, the circle is round. */
async function expectRound(btn: Locator, word: string, name = word) {
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute('data-icon-btn', '');
  await expect(btn).toHaveAccessibleName(name);
  await expect(btn.locator('.icon-btn-label')).toHaveText(word);
  await expect(btn.locator('.icon-btn-circle svg')).toHaveAttribute('aria-hidden', 'true');
  const box = await btn.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(56);
  const radius = await btn
    .locator('.icon-btn-circle')
    .evaluate((c) => getComputedStyle(c).borderTopLeftRadius);
  expect(radius).toBe('50%');
}

test.use({ colorScheme: 'dark' });

test('About: Back is a round button with its word beside; it goes back', async ({ page }) => {
  await openApp(page, at(13, 18));
  await page.locator('[data-tab="settings"]').click();
  const row = page.locator('[data-about-open]');
  await row.scrollIntoViewIfNeeded();
  await row.click();
  const about = page.locator('main[data-screen="about"]');
  await expect(about).toBeVisible();
  const back = about.locator('.back-btn');
  await expectRound(back, 'Settings');
  await expect(back).toHaveAttribute('data-back', '');
  await expect(back).toHaveAttribute('data-swipe-back', '');
  await expect(back).toHaveAttribute('data-label-at', 'beside');
  // The word sits beside the circle, on one line.
  const circle = await back.locator('.icon-btn-circle').boundingBox();
  const word = await back.locator('.icon-btn-label').boundingBox();
  expect((word?.x ?? 0) > (circle?.x ?? 0) + (circle?.width ?? 0) - 1).toBe(true);
  expect(word?.height ?? 99).toBeLessThan(40);
  await noHorizontalOverflow(page);
  if (shots) await page.screenshot({ path: 'docs/screenshots/m13d-buttons-after-chrome.png' });
  await back.click();
  await expect(page.locator('main[data-screen="settings"]')).toBeVisible();
  expect(await spoken(page)).toEqual([]);
});

test('Fuel Log sheet: Close is a quiet round button with the word beside', async ({ page }) => {
  await openApp(page, at(13, 18));
  await page.locator('[data-tab="fuel"]').click();
  await page.locator('main[data-screen="fuel"] [data-log-open]').first().click();
  const sheet = page.locator('[data-log-sheet]');
  await expect(sheet).toBeVisible();
  const close = sheet.locator('[data-close]');
  await expectRound(close, 'Close');
  await expect(close).toHaveAttribute('data-variant', 'quiet');
  await noHorizontalOverflow(page);
  if (shots) {
    await page.screenshot({ path: 'docs/screenshots/m13d-buttons-after-chrome-sheet.png' });
  }
  await close.click();
  await expect(sheet).toHaveCount(0);
  expect(await spoken(page)).toEqual([]);
});

test('workout top bar: still 60px tall, Pause 88×60 with its name, the list keeps its name', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  const ex = page.locator('main[data-screen="exercise"]');
  await expect(ex).toBeVisible();
  const before = await spoken(page);

  const bar = ex.locator('.wtb');
  const barBox = await bar.boundingBox();
  expect(Math.round(barBox?.height ?? 0)).toBe(60);

  const pause = ex.locator('[data-pause-open]');
  await expect(pause).toHaveAttribute('data-icon-btn', '');
  await expect(pause).toHaveAccessibleName('Pause');
  await expect(pause.locator('.icon-btn-label')).toHaveText('Pause');
  const p = await pause.boundingBox();
  expect(p?.width ?? 0).toBeGreaterThanOrEqual(88);
  expect(p?.height ?? 0).toBeGreaterThanOrEqual(60);

  const list = ex.getByRole('button', { name: /, Exercise list$/ });
  await expect(list).toHaveCount(1);
  await expect(list).toHaveAttribute('data-icon-btn', '');
  expect((await list.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(60);

  // The Exercise screen is motion-off: pressing a top-bar circle never scales it.
  await pause.hover();
  await page.mouse.down();
  const scale = await pause
    .locator('.icon-btn-circle')
    .evaluate((c) => getComputedStyle(c).transform);
  await page.mouse.up();
  expect(scale === 'none' || scale === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();

  await noHorizontalOverflow(page);
  // The restyle adds nothing spoken (only what the screen said before Pause).
  expect((await spoken(page)).slice(0, before.length)).toEqual(before);
  if (shots) {
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Resume' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'docs/screenshots/m13d-buttons-after-chrome-topbar.png' });
  }
});
