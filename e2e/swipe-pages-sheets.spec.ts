// M13d task 25 (SPEC M13d Goal 5b + 5c): page swipes in the first run and swipe down to close a
// sheet, with real touch events (CDP Input.dispatchTouchEvent on the mobile project's touch
// emulation; same finger as e2e/swipe.spec.ts). In-page gestures, so they work in a normal tab
// too (the Safari-tab rule is the edge swipe's, decision (w)): nothing here emulates standalone.
//
// 1. First run (fresh profile): swipe left → the next page (the page follows the finger, no
//    sideways scroll); swipe right → back; a right swipe on page 1 does nothing. The buttons stay.
// 2. Fuel → Log food (a sheetShell sheet): a short drag springs back and stays open; swipe down
//    from its title closes it (the Fuel screen is back, focus not lost to a stuck overlay).
// 3. A scrolled sheet scrolls first: the Log sheet scrolled down + a downward swipe scrolls it
//    (still open, no follow); back at the top the same swipe closes it.
// 4. A Fuel editor with unsaved changes (My food, a name typed) stays open on a swipe down; its
//    Cancel still closes it.
// 5. The How-to sheet opened off a workout (Library → exercise → Watch 3D demo): swipe down from
//    its title closes it and the exercise detail is back.
// Nothing here is spoken: none of it is reachable during a set.
import type { CDPSession } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { at, installMocks, noHorizontalOverflow, openApp } from './app.helpers';

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

type Drag = {
  from: { x: number; y: number };
  to: { x: number; y: number };
  steps?: number;
  /** Hold still this long before lifting (no flick). */
  holdMs?: number;
  release?: boolean;
};

/** A finger drag; events 16 ms apart (a phone's frames), so speed is what the drag says. */
async function drag(f: Finger, d: Drag): Promise<void> {
  const { from, to, steps = 12, holdMs = 160, release = true } = d;
  await send(f, 'touchStart', from.x, from.y);
  for (let i = 1; i <= steps; i++) {
    f.t += 0.016;
    await send(
      f,
      'touchMove',
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps,
    );
  }
  f.t += holdMs / 1000;
  if (release) await lift(f);
}

async function lift(f: Finger): Promise<void> {
  f.t += 0.016;
  await send(f, 'touchEnd');
}

const transformOf = (page: Page, sel: string) =>
  page.locator(sel).evaluate((el) => (el as HTMLElement).style.transform);

// ---------- 1. first run: sideways between pages ----------

test.describe('first run: swipe sideways between pages', () => {
  test.use({ firstRun: 'fresh' });

  test('left = Next, right = Back; the page follows the finger; page 1 has no Back', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await installMocks(page);
    await page.clock.install({ time: at(13, 18) });
    await page.goto('/');
    const welcome = page.locator('[data-screen="welcome"]');
    const obPage = welcome.locator('[data-ob="page"]');
    await expect(obPage).toHaveAttribute('data-index', '0');
    await expect(welcome.locator('[data-page-swipe]')).toHaveCount(1);
    const f = await finger(page);

    // Right on page 1: nothing to go back to.
    await drag(f, { from: { x: 80, y: 420 }, to: { x: 330, y: 420 } });
    await expect(obPage).toHaveAttribute('data-index', '0');

    // Mid-swipe the page follows (transform only), nothing scrolls sideways.
    await drag(f, { from: { x: 330, y: 420 }, to: { x: 90, y: 420 }, release: false });
    expect(await transformOf(page, '[data-ob="page"]')).toBe('translate3d(-240px, 0px, 0px)');
    await noHorizontalOverflow(page);
    await lift(f);
    await expect(obPage).toHaveAttribute('data-index', '1');
    expect(await transformOf(page, '[data-ob="page"]')).toBe('');

    // Right = Back.
    await drag(f, { from: { x: 80, y: 420 }, to: { x: 330, y: 420 } });
    await expect(obPage).toHaveAttribute('data-index', '0');

    // A short slow drag springs back.
    await drag(f, { from: { x: 300, y: 420 }, to: { x: 250, y: 420 } });
    await expect(obPage).toHaveAttribute('data-index', '0');
    await expect.poll(() => transformOf(page, '[data-ob="page"]')).toBe('');

    // The buttons are still the way through.
    await expect(welcome.locator('[data-ob="primary"]')).toBeVisible();
    await expect(welcome.locator('[data-ob="back"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

// ---------- 2 + 3. sheets: swipe down to close ----------

const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');
const logSheet = (page: Page) => page.locator('[data-log-sheet]');

async function openLogSheet(page: Page, section?: string): Promise<void> {
  await page.locator('[data-tab="fuel"]').click();
  await expect(fuelMain(page)).toBeVisible();
  await fuelMain(page).locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();
  await expect(logSheet(page)).toHaveAttribute('data-sheet-swipe', '');
  if (section) {
    await logSheet(page).locator(`[data-log-section="${section}"]`).click();
    await expect(logSheet(page).locator(`[data-section-panel="${section}"]`)).toBeVisible();
  }
}

async function centre(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error(`no box for ${sel}`);
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/** The sheet sits at the top of the screen: no follow, no spring-back or entrance still running. */
async function sheetSettled(page: Page): Promise<void> {
  await expect
    .poll(() => logSheet(page).evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBe(0);
}

test.describe('sheets: swipe down to close', () => {
  test('Fuel Log sheet: a short drag springs back, a long one closes it', async ({ page }) => {
    await openApp(page, at(13, 18));
    await openLogSheet(page);
    await sheetSettled(page);
    const f = await finger(page);
    const from = await centre(page, '[data-log-sheet] .fuel-sheet-title');
    // Mid-drag the sheet follows downwards.
    await drag(f, { from, to: { x: from.x, y: from.y + 160 }, release: false });
    expect(await transformOf(page, '[data-log-sheet]')).toBe('translate3d(0px, 160px, 0px)');
    await noHorizontalOverflow(page);
    // Held still under 30% of the height: it springs back.
    await lift(f);
    await expect(logSheet(page)).toBeVisible();
    await expect.poll(() => transformOf(page, '[data-log-sheet]')).toBe('');
    // …and is back in place (the spring-back transition has run) before the next finger.
    await sheetSettled(page);
    const again = await centre(page, '[data-log-sheet] .fuel-sheet-title');

    await drag(f, { from: again, to: { x: again.x, y: again.y + 400 } });
    await expect(logSheet(page)).toHaveCount(0);
    await expect(fuelMain(page)).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test('a scrolled sheet scrolls first; at the top the same swipe closes it', async ({ page }) => {
    await openApp(page, at(13, 18));
    await openLogSheet(page, 'thai');
    const sheet = logSheet(page);
    const scrollable = await sheet.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(scrollable, 'the Thai list makes the sheet scroll').toBeGreaterThan(300);
    await sheet.evaluate((el) => {
      el.scrollTop = 300;
    });
    // Start on a list row (not a text field) in the middle of the screen.
    const from = { x: 195, y: 360 };
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('input, textarea, select') === null,
      from,
    );
    expect(hit, 'the finger lands on a row, not a field').toBe(true);
    const f = await finger(page);
    await drag(f, { from, to: { x: from.x, y: from.y + 360 }, release: false });
    expect(await transformOf(page, '[data-log-sheet]')).toBe('');
    await lift(f);
    await expect(sheet).toBeVisible();
    await expect.poll(() => sheet.evaluate((el) => el.scrollTop)).toBeLessThan(300);

    await sheet.evaluate((el) => {
      el.scrollTop = 0;
    });
    await sheetSettled(page);
    const top = await centre(page, '[data-log-sheet] .fuel-sheet-title');
    await drag(f, { from: top, to: { x: top.x, y: top.y + 400 } });
    await expect(sheet).toHaveCount(0);
    await expect(fuelMain(page)).toBeVisible();
  });
});

// ---------- 4. unsaved changes: no swipe-down ----------

test('My food with a name typed: swipe down leaves it open; Cancel still closes', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  await openLogSheet(page, 'myFoods');
  await logSheet(page).locator('[data-new-food]').click();
  const editor = page.locator('[data-my-food-editor]');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('data-sheet-swipe', '');
  await editor.locator('#food-name').fill('Swipe test bar');
  // Dirty: the swipe is gone for this sheet.
  await expect(editor).not.toHaveAttribute('data-sheet-swipe', '');
  await expect
    .poll(() => editor.evaluate((el) => Math.round(el.getBoundingClientRect().top)))
    .toBe(0);
  const from = await centre(page, '[data-my-food-editor] .fuel-sheet-title');
  const f = await finger(page);
  await drag(f, { from, to: { x: from.x, y: from.y + 400 }, release: false });
  expect(await transformOf(page, '[data-my-food-editor]')).toBe('');
  await lift(f);
  await expect(editor).toBeVisible();
  await expect(editor.locator('#food-name')).toHaveValue('Swipe test bar');
  await noHorizontalOverflow(page);
  await editor.locator('[data-close]').click();
  await expect(editor).toHaveCount(0);
});

// ---------- 5. the How-to sheet, off a workout ----------

test('How-to opened from the Library: swipe down from its title closes it', async ({ page }) => {
  await openApp(page, at(13, 18));
  await page.locator('main[data-screen="today"] [data-search-open]').click();
  const library = page.locator('main[data-screen="library"]');
  await expect(library).toBeVisible();
  await library.locator('[data-library-search]').fill('bench');
  await library.locator('[data-ex-open]').first().click();
  const detail = page.locator('main[data-screen="exercise-detail"]');
  await expect(detail).toBeVisible();
  await detail.locator('[data-detail-howto]').click();
  const sheet = page.locator('[data-howto="sheet"]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-sheet-swipe', '');
  // Off a workout the focus line waits behind More (closed).
  await expect(sheet.locator('[data-more="howto"] [data-more-btn]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const from = await centre(page, '[data-howto="title"]');
  const f = await finger(page);
  // Mid-drag the sheet follows; past 30% of the height the lift closes it.
  await drag(f, { from, to: { x: from.x, y: from.y + 400 }, release: false });
  expect(await transformOf(page, '[data-howto="sheet"]')).toBe('translate3d(0px, 400px, 0px)');
  await noHorizontalOverflow(page);
  await lift(f);
  await expect(sheet).toHaveCount(0);
  await expect(detail).toBeVisible();
  await noHorizontalOverflow(page);
});
