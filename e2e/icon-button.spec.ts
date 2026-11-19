// M13d task 36 (SPEC M13d Goal 7): the shared round icon button, on its harness page
// (src/ui/iconButton.harness.html, made-up labels). No screen adopts it yet (tasks 38-40).
// Checks: sizes (circles ≥ 56px, main ≥ 72px, every tap area ≥ 56px, wide row = full width),
// the visible word is the accessible name (aria-label only where shortened), words ≥ 20px, no
// sideways scroll at 390, the press animation (scale 0.92 + glow, back on release), Reduce
// Motion and the Exercise screen (colour change only), the focus ring, and the press-feel hook
// (main presses only). Nothing here is spoken: a button press has no voice line.
// ICON_BTN_SHOT=1 also writes docs/screenshots/m13d-icon-buttons.png (390×844, dark).
import { expect, test, type Locator, type Page } from './fixtures';

const HARNESS = '/src/ui/iconButton.harness.html';

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto(HARNESS);
  await expect(page.locator('[data-harness="icon-buttons"] [data-icon-btn]').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const demo = (page: Page, name: string) => page.locator(`[data-demo="${name}"]`);
const circle = (btn: Locator) => btn.locator('.icon-btn-circle');

async function box(l: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const b = await l.boundingBox();
  if (!b) throw new Error('not laid out');
  return b;
}

/** Scale factor of the circle's computed transform (1 when none). */
const scaleOf = (btn: Locator) =>
  circle(btn).evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a;
  });

const glowOf = (btn: Locator) =>
  circle(btn).evaluate((el) => {
    const s = getComputedStyle(el, '::after');
    return { opacity: Number(s.opacity), display: s.display };
  });

/** Holds a pointer down on the middle of `btn`, runs `fn`, then releases. */
async function whilePressed<T>(page: Page, btn: Locator, fn: () => Promise<T>): Promise<T> {
  const box = await circle(btn).boundingBox();
  if (!box) throw new Error('no circle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    return await fn();
  } finally {
    await page.mouse.up();
  }
}

test('sizes, names, words and no sideways scroll at 390×844', async ({ page }) => {
  const errors = await open(page);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const all = page.locator('[data-icon-btn]');
  const n = await all.count();
  expect(n).toBe(18);
  for (let i = 0; i < n; i++) {
    const b = all.nth(i);
    const variant = await b.getAttribute('data-variant');
    const btnBox = await b.boundingBox();
    const cBox = await circle(b).boundingBox();
    const word = b.locator('.icon-btn-label');
    const fs = await word.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const label = (await word.textContent()) ?? '';
    expect(btnBox?.width, label).toBeGreaterThanOrEqual(56);
    expect(btnBox?.height, label).toBeGreaterThanOrEqual(56);
    expect(cBox?.width, label).toBeGreaterThanOrEqual(variant === 'main' ? 72 : 56);
    expect(Math.abs((cBox?.width ?? 0) - (cBox?.height ?? 0)), label).toBeLessThan(1);
    expect(fs, label).toBeGreaterThanOrEqual(20);
    // The icon inside the circle is decorative.
    await expect(b.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  }

  // The visible word is the accessible name; aria-label only where the word is shortened.
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Back to To-dos' })).toHaveCount(1);
  await expect(demo(page, 'aria').locator('.icon-btn-label')).toHaveText('Back');

  // Main: word beside the 72px circle; secondary: word below the 56px circle.
  const main = demo(page, 'main');
  const mc = await box(circle(main));
  const mw = await box(main.locator('.icon-btn-label'));
  expect(mw.x).toBeGreaterThan(mc.x + mc.width - 1);
  const sec = demo(page, 'secondary');
  const sc = await box(circle(sec));
  const sw = await box(sec.locator('.icon-btn-label'));
  expect(sw.y).toBeGreaterThan(sc.y + sc.height - 1);

  // wideHit: the whole row is the tap area (the screen's content width).
  const wide = await box(demo(page, 'wide'));
  const content = await page.locator('[data-harness]').evaluate((el) => {
    const s = getComputedStyle(el);
    return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  });
  expect(Math.round(wide.width)).toBe(Math.round(content));

  // Disabled stays disabled.
  await expect(demo(page, 'disabled')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeEnabled();

  // All of it fits one phone screen (the design preview frame).
  const bottom = await page
    .locator('[data-harness]')
    .evaluate((el) => el.lastElementChild?.getBoundingClientRect().bottom ?? Infinity);
  expect(bottom).toBeLessThanOrEqual(844);

  expect(errors).toEqual([]);
});

test('press: the circle scales to 0.92 with a glow and springs back; taps reach onClick', async ({
  page,
}) => {
  await open(page);
  const main = demo(page, 'main');
  expect(await scaleOf(main)).toBe(1);
  expect((await glowOf(main)).opacity).toBe(0);

  await whilePressed(page, main, async () => {
    await expect.poll(() => scaleOf(main)).toBeCloseTo(0.92, 2);
    await expect.poll(async () => (await glowOf(main)).opacity).toBe(1);
    // Only the circle moves: the row itself is not shrunk by the global 0.97 rule.
    expect(await main.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });
  await expect.poll(() => scaleOf(main)).toBe(1);
  await expect.poll(async () => (await glowOf(main)).opacity).toBe(0);

  // The press above was a full tap on Start (down + up).
  await page.getByRole('button', { name: 'Delete' }).click();
  expect(
    await page.evaluate(() => (window as unknown as { harnessTaps: string[] }).harnessTaps),
  ).toEqual(['Start', 'Delete']);
});

test('Reduce Motion: no scale and no glow, only the colour change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const main = demo(page, 'main');
  await whilePressed(page, main, async () => {
    expect(await scaleOf(main)).toBe(1);
    expect((await glowOf(main)).display).toBe('none');
    const filter = await circle(main).evaluate((el) => getComputedStyle(el).filter);
    expect(filter).toContain('brightness');
  });
});

test('Exercise screen: the look without the press motion', async ({ page }) => {
  await open(page);
  const b = demo(page, 'motion-off');
  await whilePressed(page, b, async () => {
    expect(await scaleOf(b)).toBe(1);
    expect((await glowOf(b)).display).toBe('none');
  });
});

test('keyboard focus shows a 3px ring round the circle', async ({ page }) => {
  await open(page);
  const main = demo(page, 'main');
  await main.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(main).toBeFocused();
  const ring = await circle(main).evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth };
  });
  expect(ring).toEqual({ style: 'solid', width: '3px' });
});

test('press feel: once per main press, never for secondary, quiet or danger', async ({ page }) => {
  await open(page);
  const feels = () =>
    page.evaluate(() => (window as unknown as { harnessFeels: number }).harnessFeels);
  await page.getByRole('button', { name: 'Start' }).tap();
  expect(await feels()).toBe(1);
  await page.getByRole('button', { name: 'Next' }).tap();
  expect(await feels()).toBe(2);
  for (const name of ['Settings', 'Not now', 'Delete', 'Undo', 'Less']) {
    await page.getByRole('button', { name, exact: true }).first().tap();
  }
  expect(await feels()).toBe(2);
});

test.describe('design preview screenshot (opt-in)', () => {
  test.use({ deviceScaleFactor: 2, colorScheme: 'dark' });
  test('writes docs/screenshots/m13d-icon-buttons.png at 390×844', async ({ page }) => {
    test.skip(!process.env.ICON_BTN_SHOT, 'set ICON_BTN_SHOT=1 to write the screenshot');
    const errors = await open(page);
    await page.screenshot({ path: 'docs/screenshots/m13d-icon-buttons.png' });
    expect(errors).toEqual([]);
  });
});
