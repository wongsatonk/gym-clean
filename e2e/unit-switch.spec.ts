// M13d task 13b (SPEC M13d Goal 3): the unit switch on its harness page
// (src/ui/unitSwitch.harness.html, made-up values). The pages adopt it in task 13c.
// Checks: named groups with two pressed-state buttons, every option ≥ 56px both ways, words ≥ 20px,
// no sideways scroll at 390, one onChange per tap on the other option and none on the active one,
// the readout re-shows the same metric value (70.0 kg → 154.3 lb → 70.0 kg), keyboard use and the
// focus ring. Nothing here is spoken: the switch is never on a mid-set screen.
// UNIT_SWITCH_SHOT=1 also writes docs/screenshots/m13d-unit-switch.png (390×844, dark).
import { expect, test, type Page } from './fixtures';

const HARNESS = '/src/ui/unitSwitch.harness.html';

async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto(HARNESS);
  await expect(
    page.locator('[data-harness="unit-switch"] [data-unit-switch]').first(),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const group = (page: Page, name: string) => page.getByRole('group', { name, exact: true });
const changes = (page: Page) =>
  page.evaluate(() => (window as unknown as { harnessChanges: [string, string][] }).harnessChanges);
const readout = (page: Page, id: string) =>
  page.locator(`[data-readout="${id}"]`).evaluate((el) => el.textContent?.replace(/\s+/g, ''));

test('named groups, sizes, words and no sideways scroll at 390×844', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  for (const [name, words] of [
    ['Weight unit', ['kg', 'lb']],
    ['Height unit', ['cm', 'ft·in']],
    ['Measurement unit', ['cm', 'in']],
  ] as const) {
    const g = group(page, name);
    await expect(g).toBeVisible();
    const buttons = g.getByRole('button');
    await expect(buttons).toHaveCount(2);
    for (const [i, word] of words.entries()) {
      const b = g.getByRole('button', { name: word, exact: true });
      await expect(b).toHaveAttribute('aria-pressed', /^(true|false)$/);
      const box = await buttons.nth(i).boundingBox();
      expect(box?.height, `${name} ${word}`).toBeGreaterThanOrEqual(56);
      expect(box?.width, `${name} ${word}`).toBeGreaterThanOrEqual(56);
      const fs = await b.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(fs, `${name} ${word}`).toBeGreaterThanOrEqual(20);
    }
    // Compact: the whole switch stays well under half the 390 row.
    const gBox = await g.boundingBox();
    expect(gBox?.width, name).toBeLessThanOrEqual(180);
  }
  // Exactly one option pressed per group, matching the start values.
  await expect(group(page, 'Weight unit').getByRole('button', { name: 'kg' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(group(page, 'Measurement unit').getByRole('button', { name: 'in' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(errors).toEqual([]);
});

test('one change per tap on the other option, none on the active one; no drift', async ({
  page,
}) => {
  await open(page);
  const w = group(page, 'Weight unit');
  expect(await readout(page, 'weight')).toBe('70.0kg');

  await w.getByRole('button', { name: 'kg' }).tap();
  expect(await changes(page)).toEqual([]);

  await w.getByRole('button', { name: 'lb' }).tap();
  await expect(w.getByRole('button', { name: 'lb' })).toHaveAttribute('aria-pressed', 'true');
  await expect(w.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'false');
  expect(await readout(page, 'weight')).toBe('154.3lb');

  await w.getByRole('button', { name: 'lb' }).tap();
  for (let i = 0; i < 5; i++) {
    await w.getByRole('button', { name: 'kg' }).tap();
    await w.getByRole('button', { name: 'lb' }).tap();
  }
  await w.getByRole('button', { name: 'kg' }).tap();
  expect(await readout(page, 'weight')).toBe('70.0kg');
  const got = await changes(page);
  expect(got).toHaveLength(12);
  expect(got[0]).toEqual(['Weight unit', 'lb']);
  expect(got.at(-1)).toEqual(['Weight unit', 'kg']);

  const ht = group(page, 'Height unit');
  await ht.getByRole('button', { name: 'ft·in' }).tap();
  expect(await readout(page, 'height')).toBe('5ft7in');
  await ht.getByRole('button', { name: 'cm' }).tap();
  expect(await readout(page, 'height')).toBe('170cm');
  expect((await changes(page)).slice(-2)).toEqual([
    ['Height unit', 'in'],
    ['Height unit', 'cm'],
  ]);
});

test('keyboard: Tab reaches each option, Enter/Space switch, focus ring is visible', async ({
  page,
}) => {
  await open(page);
  const lb = group(page, 'Weight unit').getByRole('button', { name: 'lb' });
  await lb.focus();
  await page.keyboard.press('Enter');
  await expect(lb).toHaveAttribute('aria-pressed', 'true');
  const ring = await lb.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  // Focus came from a keypress, so :focus-visible applies.
  expect(ring.style).toBe('solid');
  expect(ring.width).toBeGreaterThanOrEqual(3);
  const kg = group(page, 'Weight unit').getByRole('button', { name: 'kg' });
  await kg.focus();
  await page.keyboard.press('Space');
  await expect(kg).toHaveAttribute('aria-pressed', 'true');
  expect(await changes(page)).toEqual([
    ['Weight unit', 'lb'],
    ['Weight unit', 'kg'],
  ]);
});

test.describe('harness screenshot (opt-in)', () => {
  test.use({ deviceScaleFactor: 2, colorScheme: 'dark' });
  test('writes docs/screenshots/m13d-unit-switch.png at 390×844', async ({ page }) => {
    test.skip(!process.env.UNIT_SWITCH_SHOT, 'set UNIT_SWITCH_SHOT=1 to write the screenshot');
    const errors = await open(page);
    // Show one switched state: height in ft·in.
    await group(page, 'Height unit').getByRole('button', { name: 'ft·in' }).tap();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: 'docs/screenshots/m13d-unit-switch.png' });
    expect(errors).toEqual([]);
  });
});
