// M12 slice 1b task 4 (tested in task 38): switching tabs from the tab bar opens the new screen
// at the top, whatever the scroll of the screen you left; a long screen keeps working (you can
// scroll it again after). 390×844, made-up data, no request leaves the dev server.
import { expect, test, type Page } from './fixtures';
import { at, guardNetwork, noHorizontalOverflow, openApp, record } from './app.helpers';

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/**
 * Scrolls the page down by `px` (as a thumb would) and waits until it moved and the scroll ended
 * (`scrollend`): a wheel scroll glides, and a tab tapped mid-glide (more likely on a slow machine
 * like CI) lands the new screen a px or a few down as the glide's last step applies.
 */
async function scrollDown(page: Page, px: number): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __scrollEnded: boolean };
    w.__scrollEnded = false;
    // Only this scroll's end: the tab switch's own scroll to the top can end just after.
    const onEnd = () => {
      if (window.scrollY <= 100) return;
      w.__scrollEnded = true;
      removeEventListener('scrollend', onEnd);
    };
    addEventListener('scrollend', onEnd);
  });
  await page.mouse.wheel(0, px);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __scrollEnded: boolean }).__scrollEnded),
    )
    .toBe(true);
  return scrollY(page);
}

/** The Calendar once its month is loaded (the Loading line before it is shorter than the phone). */
async function calendarLoaded(page: Page) {
  await expect(page.locator('main[data-screen="calendar"] .cal-grid')).toBeVisible();
}

async function tab(page: Page, id: string) {
  await page.locator(`[data-tab="${id}"]`).click();
  await expect(page.locator(`[data-tab="${id}"]`)).toHaveAttribute('aria-current', 'page');
}

test('a tab switch opens the new screen at the top (Calendar → Coach → Calendar, Settings → Fuel → Today)', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  // Calendar is longer than the phone: scroll it, then leave for Coach.
  await tab(page, 'calendar');
  await calendarLoaded(page);
  await scrollDown(page, 600);
  await tab(page, 'coach');
  await expect(page.locator('[data-screen="coach"]')).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(0);

  // Back to Calendar: at the top again, not where it was left.
  await tab(page, 'calendar');
  await calendarLoaded(page);
  await expect.poll(() => scrollY(page)).toBe(0);
  // It still scrolls normally afterwards.
  await scrollDown(page, 600);

  // Settings (long) → Fuel → Today: each opens at the top.
  await tab(page, 'settings');
  await expect.poll(() => scrollY(page)).toBe(0);
  await scrollDown(page, 900);
  await tab(page, 'fuel');
  await expect.poll(() => scrollY(page)).toBe(0);
  await tab(page, 'settings');
  await expect.poll(() => scrollY(page)).toBe(0);
  await scrollDown(page, 900);
  await tab(page, 'today');
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect.poll(() => scrollY(page)).toBe(0);
  await noHorizontalOverflow(page);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
