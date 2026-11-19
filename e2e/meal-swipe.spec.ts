// M13d task 26 (SPEC M13d Goal 5): on the Fuel day, swipe left on a logged meal row → a round
// danger Delete (trash + word, ≥ 56px) → the same delete + 10 s Undo toast as the sheet's; Undo
// puts the meal back (stored, not just drawn). A tap elsewhere hides Delete; a tap on a row still
// opens its sheet; a short drag or a vertical drag does nothing; Reduce Motion: no follow, the
// swipe still opens Delete. Real touch events (CDP Input.dispatchTouchEvent on the mobile
// project's touch emulation), meals seeded straight into IndexedDB (made-up food).
// MEAL_SWIPE_SHOT=1 also writes docs/screenshots/m13d-meal-swipe.png (390×844, Delete showing).
// Fuel is never mid-set: nothing is spoken.
import type { CDPSession } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { at, getRows, noHorizontalOverflow, openApp, putRows, record } from './app.helpers';

type Finger = { cdp: CDPSession; t: number };

async function finger(page: Page): Promise<Finger> {
  return { cdp: await page.context().newCDPSession(page), t: Date.now() / 1000 };
}

async function send(
  f: Finger,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  x?: number,
  y?: number,
): Promise<void> {
  await f.cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: x === undefined || y === undefined ? [] : [{ x, y }],
    timestamp: f.t,
  });
}

/** A one-finger drag from (x, y) by dx / dy over 12 frames, held still before lifting. */
async function drag(f: Finger, x: number, y: number, dx: number, dy = 0, release = true) {
  await send(f, 'touchStart', x, y);
  for (let i = 1; i <= 12; i++) {
    f.t += 0.016;
    await send(f, 'touchMove', x + (dx * i) / 12, y + (dy * i) / 12);
  }
  f.t += 0.16;
  if (release) {
    f.t += 0.016;
    await send(f, 'touchEnd');
  }
}

const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');
const rows = (page: Page) => fuelMain(page).locator('[data-entry]');
const row = (page: Page, id: string) => fuelMain(page).locator(`[data-entry="${id}"]`);
const deleteBtn = (page: Page, id: string) => row(page, id).locator(`[data-entry-delete="${id}"]`);

const DAY = '2026-11-11';
const MEALS = [
  {
    id: 'swipe-oats',
    date: DAY,
    time: at(11, 8),
    slot: 'breakfast',
    label: 'Overnight oats',
    amount: { servings: 1 },
    estimate: false,
    kcal: 420,
    proteinG: 24,
  },
  {
    id: 'swipe-rice',
    date: DAY,
    time: at(11, 12),
    slot: 'lunch',
    label: 'Chicken rice',
    amount: { servings: 1 },
    estimate: true,
    kcal: 600,
    proteinG: 35,
  },
];

/** The middle of a row (where a thumb lands), scrolled clear of the fixed tab bar first. */
async function centre(page: Page, id: string): Promise<{ x: number; y: number }> {
  // M13d task 40e: the round buttons made Fuel's header and actions taller, so the second row can
  // start under the tab bar; bring it to the middle of the screen as a thumb would.
  await row(page, id).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = await row(page, id).boundingBox();
  if (!box) throw new Error(`no row ${id}`);
  return { x: box.x + box.width * 0.75, y: box.y + box.height / 2 };
}

const slid = (page: Page, id: string) =>
  row(page, id)
    .locator('[data-entry-edit]')
    .evaluate((el) => (el as HTMLElement).style.transform);

async function openFuelWithMeals(page: Page) {
  const rec = record(page);
  await openApp(page, at(11, 13));
  await putRows(page, 'foodEntries', MEALS);
  await page.reload(); // Fuel reads its entries at start
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await page.locator('[data-tab="fuel"]').click();
  await expect(fuelMain(page)).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await page.evaluate(() => document.fonts.ready);
  return rec;
}

test.describe('Fuel: swipe a meal row to Delete', () => {
  test('swipe → Delete → the Undo toast → Undo restores the meal (stored)', async ({ page }) => {
    const { errors } = await openFuelWithMeals(page);
    const f = await finger(page);
    // An untouched row is one button (the sheet path).
    await expect(row(page, 'swipe-oats').locator('button')).toHaveCount(1);

    const c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -96, 0, false);
    expect(await slid(page, 'swipe-oats')).toBe('translate3d(-96px, 0px, 0px)'); // follows
    await noHorizontalOverflow(page);
    f.t += 0.016;
    await send(f, 'touchEnd');
    await expect(row(page, 'swipe-oats')).toHaveAttribute('data-swipe-open', '');
    const del = deleteBtn(page, 'swipe-oats');
    await expect(del).toBeVisible();
    await expect(del).toHaveAccessibleName('Delete Overnight oats');
    await expect(del).toContainText('Delete');
    await expect(del.locator('svg[data-icon="trash"]')).toHaveCount(1);
    const box = await del.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(56);
    await noHorizontalOverflow(page);
    if (process.env.MEAL_SWIPE_SHOT) {
      await page.screenshot({ path: 'docs/screenshots/m13d-meal-swipe.png' });
    }

    await del.tap();
    await expect(row(page, 'swipe-oats')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(1);
    const toast = page.locator('[data-undo-toast]');
    await expect(toast).toContainText('Deleted Overnight oats');
    await expect.poll(async () => (await getRows(page, 'foodEntries')).length).toBe(1);
    await toast.getByRole('button', { name: 'Undo' }).tap();
    await expect(row(page, 'swipe-oats')).toBeVisible();
    await expect(rows(page)).toHaveCount(2);
    await expect.poll(async () => (await getRows(page, 'foodEntries')).length).toBe(2);
    // Back closed: one button again.
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');
    await expect(row(page, 'swipe-oats').locator('button')).toHaveCount(1);

    // The restore is stored, not just drawn.
    await page.reload();
    await page.locator('[data-tab="fuel"]').click();
    await expect(row(page, 'swipe-oats')).toBeVisible();

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('a tap elsewhere hides Delete; a tap on the open row only closes it; a tap opens the sheet', async ({
    page,
  }) => {
    const { errors } = await openFuelWithMeals(page);
    const f = await finger(page);
    let c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -110);
    await expect(deleteBtn(page, 'swipe-oats')).toBeVisible();

    // Elsewhere (the page heading): Delete hides, nothing deleted.
    await fuelMain(page).locator('h1').tap();
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');
    await expect(deleteBtn(page, 'swipe-oats')).toBeHidden();
    await expect.poll(() => slid(page, 'swipe-oats')).toBe('');
    await expect(rows(page)).toHaveCount(2);

    // Open again, tap the row itself: it closes, the sheet stays shut.
    c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -110);
    await expect(row(page, 'swipe-oats')).toHaveAttribute('data-swipe-open', '');
    await page.waitForTimeout(450); // past the swipe's own click
    // The row's visible left part (the button has slid aside, so measure on the row).
    await row(page, 'swipe-oats').tap({ position: { x: 60, y: 30 } });
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');
    await expect(page.locator('[data-entry-remove]')).toHaveCount(0);

    // Opening one row closes another.
    c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -110);
    const c2 = await centre(page, 'swipe-rice');
    await drag(f, c2.x, c2.y, -110);
    await expect(row(page, 'swipe-rice')).toHaveAttribute('data-swipe-open', '');
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');
    await fuelMain(page).locator('h1').tap();
    await expect(row(page, 'swipe-rice')).not.toHaveAttribute('data-swipe-open');

    // A short drag springs back; a vertical drag is the page's.
    c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -40);
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');
    await expect.poll(() => slid(page, 'swipe-oats')).toBe('');
    c = await centre(page, 'swipe-oats');
    await drag(f, c.x, c.y, -8, -160);
    await expect(row(page, 'swipe-oats')).not.toHaveAttribute('data-swipe-open');

    // The button path is kept: a tap on a closed row opens its sheet with Delete in it.
    await page.waitForTimeout(450);
    await row(page, 'swipe-oats').locator('[data-entry-edit]').tap();
    await expect(page.locator('[data-entry-remove]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('Reduce Motion: no follow while dragging; the swipe still shows Delete', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { errors } = await openFuelWithMeals(page);
    const f = await finger(page);
    const c = await centre(page, 'swipe-rice');
    await drag(f, c.x, c.y, -96, 0, false);
    expect(await slid(page, 'swipe-rice')).toBe('');
    f.t += 0.016;
    await send(f, 'touchEnd');
    await expect(row(page, 'swipe-rice')).toHaveAttribute('data-swipe-open', '');
    await deleteBtn(page, 'swipe-rice').tap();
    await expect(page.locator('[data-undo-toast]')).toContainText('Deleted Chicken rice');
    await expect(rows(page)).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});
