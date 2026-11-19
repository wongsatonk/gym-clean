// M13d task 40e (SPEC M13d Goal 7): the Fuel tab, its sheets and the Measurements page use the
// round icon buttons. Each action is a circle with a visible word that is (or starts) its
// accessible name, ≥ 56px (the main one ≥ 72px), the whole pill row is the tap area, words stay on
// one line at 390 (the Measurements Save that wrapped with the system font is "Save" now), no
// horizontal overflow, the Undo toast never covers a sheet's main button. Fuel is never mid-set:
// nothing is spoken. Made-up data seeded straight into IndexedDB.
// FUEL_BUTTONS_SHOT=1 also writes docs/screenshots/m13d-buttons-after-fuel*.png (390×844).
import { expect, test, type Locator, type Page } from './fixtures';
import {
  animationsSettled,
  at,
  expectClearOfToast,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  putRows,
  putSetting,
  record,
} from './app.helpers';

const SHOTS = process.env.FUEL_BUTTONS_SHOT === '1';
const DAY = '2026-11-13';

const fuelMain = (page: Page) => page.locator('main[data-screen="fuel"]');
const measurements = (page: Page) => page.locator('main[data-screen="measurements"]');
const entrySheet = (page: Page) => page.locator('[data-entry-sheet]');

const MEALS = [
  {
    id: 'btn-oats',
    date: DAY,
    time: at(13, 8),
    slot: 'breakfast',
    label: 'Overnight oats',
    amount: { servings: 1 },
    estimate: false,
    kcal: 420,
    proteinG: 24,
  },
  {
    id: 'btn-rice',
    date: DAY,
    time: at(13, 12),
    slot: 'lunch',
    label: 'Chicken rice',
    amount: { servings: 1 },
    estimate: true,
    kcal: 600,
    proteinG: 35,
  },
];

async function openFuel(page: Page, withTargets = true) {
  const offsite = await guardNetwork(page);
  const rec = record(page);
  await openApp(page, at(13, 18));
  if (withTargets) {
    await putSetting(page, 'nutrition', {
      mode: 'quick',
      heightCm: 175,
      birthYear: 1994,
      sex: 'male',
      activity: 'moderate',
      surplusKcal: 250,
      proteinGPerKg: 1.8,
      fatPct: 25,
      gainPctPerWeek: [0.25, 0.5],
      barcodeLookup: false,
    });
    await putRows(page, 'weighIns', [{ date: DAY, kg: 72.5, source: 'manual' }]);
  }
  await putRows(page, 'foodEntries', MEALS);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await page.locator('[data-tab="fuel"]').click();
  await expect(fuelMain(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { offsite, ...rec };
}

type Box = { w: number; h: number; circle: number; round: boolean; lines: number };

/** The button's box, its circle's size and roundness, and how many lines its word takes. */
async function measure(btn: Locator): Promise<Box> {
  return btn.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const c = el.querySelector('.icon-btn-circle');
    const cb = c?.getBoundingClientRect();
    const label = el.querySelector('.icon-btn-label');
    const lb = label?.getBoundingClientRect();
    const lh = label ? parseFloat(getComputedStyle(label).lineHeight) : 1;
    return {
      w: b.width,
      h: b.height,
      circle: cb ? Math.min(cb.width, cb.height) : 0,
      round: c ? getComputedStyle(c).borderRadius === '50%' : false,
      lines: lb ? Math.round(lb.height / lh) : 0,
    };
  });
}

/** Every visible round button in `scope`: a word, round, ≥ 56px (main ≥ 72px), one line. */
async function expectRoundButtons(scope: Locator) {
  // Sheets rise in: measure once the entrance has settled (mid-transform a 56px circle can
  // measure 55.99997px), with a hair of float tolerance.
  await animationsSettled(scope.page());
  const btns = scope.locator('[data-icon-btn]:visible');
  const n = await btns.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const b = btns.nth(i);
    const word = ((await b.locator('.icon-btn-label').textContent()) ?? '').trim();
    expect(word, 'a visible word').not.toBe('');
    // The visible word is the accessible name, or the start of it where it was shortened.
    const name = (await b.getAttribute('aria-label')) ?? word;
    expect(name.startsWith(word), `${name} starts with ${word}`).toBe(true);
    const m = await measure(b);
    const main = (await b.getAttribute('data-variant')) === 'main';
    expect(m.round, `${word} is round`).toBe(true);
    expect(m.circle, `${word} circle`).toBeGreaterThanOrEqual((main ? 72 : 56) - 0.01);
    expect(Math.min(m.w, m.h), `${word} tap area`).toBeGreaterThanOrEqual(56 - 0.01);
    if ((await b.getAttribute('data-label-at')) === 'beside') {
      expect(m.lines, `${word} on one line`).toBe(1);
    }
  }
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    ),
  );
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
}

test.describe('Fuel round buttons (M13d task 40e)', () => {
  test('Fuel tab: Log food is the main pill, Weigh-in and Search round, every button ≥ 56px', async ({
    page,
  }) => {
    const { offsite, errors } = await openFuel(page);
    const main = fuelMain(page);
    const log = main.getByRole('button', { name: 'Log food' });
    await expect(log).toHaveAttribute('data-icon-btn', '');
    await expect(log).toHaveAttribute('data-variant', 'main');
    await expect(log).toHaveAttribute('data-wide-hit', '');
    const lb = await measure(log);
    expect(lb.circle).toBeGreaterThanOrEqual(72);
    expect(lb.w).toBeGreaterThan(300); // the whole row is the tap area
    // Weigh-in keeps its name with the last weigh-in in it.
    const weigh = main.locator('[data-weigh-in]');
    await expect(weigh).toHaveAttribute('data-icon-btn', '');
    await expect(weigh).toHaveAccessibleName(/^Weigh-in\s*72\.5 kg$/);
    // Only one orange (main) action on the screen.
    await expect(main.locator('[data-icon-btn][data-variant="main"]:visible')).toHaveCount(1);
    await expectRoundButtons(main);
    await expectTapTargets(page, 'main[data-screen="fuel"]');
    await noHorizontalOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'm13d-buttons-after-fuel');
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('entry sheet: Delete is the danger circle ("Delete entry"), Save the main pill; Delete → Undo', async ({
    page,
  }) => {
    const { errors } = await openFuel(page);
    await fuelMain(page).locator('[data-entry-edit="btn-rice"]').click();
    const sheet = entrySheet(page);
    await expect(sheet).toBeVisible();
    const del = sheet.getByRole('button', { name: 'Delete entry' });
    await expect(del).toHaveAttribute('data-variant', 'danger');
    await expect(del.locator('.icon-btn-label')).toHaveText('Delete');
    const save = sheet.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toHaveAttribute('data-variant', 'main');
    // One row: Delete left of Save.
    const [d, s] = [await del.boundingBox(), await save.boundingBox()];
    expect(d && s && d.x + d.width <= s.x).toBe(true);
    // The amount stepper: round − / + with "Less" / "More" under the circle, names unchanged.
    const amount = sheet.locator('[data-stepper="amount"]');
    for (const [dir, word] of [
      ['down', 'Less'],
      ['up', 'More'],
    ] as const) {
      const b = amount.locator(`[data-step="${dir}"]`);
      await expect(b).toHaveAttribute('data-icon-btn', '');
      await expect(b).toHaveAttribute('data-label-at', 'below');
      await expect(b.locator('.icon-btn-label')).toHaveText(word);
      await expect(b).toHaveAccessibleName(`${word} amount`);
    }
    await amount.locator('[data-step="up"]').click();
    await expect(amount.locator('.fuel-step-num')).toHaveText('1.5');
    await expectRoundButtons(sheet);
    await noHorizontalOverflow(page);
    await shot(page, 'm13d-buttons-after-fuel-sheet');
    await del.click();
    await expect(page.locator('[data-undo-toast]')).toContainText('Deleted Chicken rice');
    await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
    await expect(fuelMain(page).locator('[data-entry="btn-rice"]')).toBeVisible();
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('log sheet: the Thai detail Log is the main pill, Back round; the toast never covers Log', async ({
    page,
  }) => {
    const { errors } = await openFuel(page);
    await fuelMain(page).getByRole('button', { name: 'Log food' }).click();
    const sheet = page.locator('[data-log-sheet]');
    await expect(sheet).toBeVisible();
    await expectRoundButtons(sheet);
    await sheet.locator('[data-log-section="thai"]').click();
    await sheet.locator('[data-log-item]').first().click();
    const back = sheet.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toHaveAttribute('data-icon-btn', '');
    const log = sheet.getByRole('button', { name: 'Log', exact: true });
    await expect(log).toHaveAttribute('data-variant', 'main');
    await expectRoundButtons(sheet);
    await noHorizontalOverflow(page);
    // Log once: the Undo toast comes up; the sheet's next Log stays clear of it.
    await log.click();
    await expect(page.locator('[data-undo-toast]')).toContainText('Logged ');
    await fuelMain(page).getByRole('button', { name: 'Log food' }).click();
    await sheet.locator('[data-log-section="thai"]').click();
    await sheet.locator('[data-log-item]').first().click();
    await expectClearOfToast(page, sheet.getByRole('button', { name: 'Log', exact: true }), 72);
    expect(errors).toEqual([]);
  });

  test('Measurements: Save is one line ("Save"), named by what it saves, at every text size', async ({
    page,
  }) => {
    const { errors } = await openFuel(page);
    await fuelMain(page).locator('[data-measurements-open]').click();
    const ms = measurements(page);
    await expect(ms).toBeVisible();
    await expect(ms.getByRole('button', { name: 'Back', exact: true })).toHaveAttribute(
      'data-swipe-back',
      '',
    );
    const save = ms.locator('[data-measure-save]');
    await expect(save).toBeDisabled();
    await expect(save).toHaveAccessibleName('Save. Tap a spot to measure');
    await ms.locator('[data-site-toggle="waist"]').click();
    await expect(save).toBeEnabled();
    await expect(save).toHaveAccessibleName('Save 1 measurement');
    await ms.locator('[data-site-toggle="hips"]').click();
    await expect(save).toHaveAccessibleName('Save 2 measurements');
    for (const size of ['standard', 'large', 'larger']) {
      await page.evaluate((s) => {
        if (s === 'standard') delete document.documentElement.dataset.textSize;
        else document.documentElement.dataset.textSize = s;
      }, size);
      await expect(save.locator('.icon-btn-label')).toHaveText('Save');
      expect((await measure(save)).lines, `Save on one line (${size})`).toBe(1);
      await noHorizontalOverflow(page);
    }
    await page.evaluate(() => delete document.documentElement.dataset.textSize);
    await expectRoundButtons(ms);
    await expectTapTargets(page, 'main[data-screen="measurements"]');
    await save.scrollIntoViewIfNeeded();
    await shot(page, 'm13d-buttons-after-fuel-measurements');
    expect(errors).toEqual([]);
  });
  test('Settings → Nutrition → Change: the kcal target shows whole between round − / +', async ({
    page,
  }, testInfo) => {
    const { errors } = await openFuel(page);
    await page.locator('[data-tab="settings"]').click();
    const change = page.locator('[data-target-edit="kcal"]');
    await change.scrollIntoViewIfNeeded();
    await change.click();
    const field = page.locator('[data-field="target-kcal"]');
    await expect(field).toBeVisible();
    const input = field.locator('input.nf-value');
    // Wide targets (4 digits, the largest allowed too) fit their box at every text size.
    for (const [size, v] of [
      ['standard', '2830'],
      ['standard', '6000'],
      ['larger', '6000'],
    ] as const) {
      await page.evaluate((s) => {
        if (s === 'standard') delete document.documentElement.dataset.textSize;
        else document.documentElement.dataset.textSize = s;
      }, size);
      await input.fill(v);
      await input.dispatchEvent('change');
      await expect(input).toHaveValue(v);
      const fit = await input.evaluate((el) => ({
        sw: (el as HTMLInputElement).scrollWidth,
        cw: (el as HTMLInputElement).clientWidth,
        fs: parseFloat(getComputedStyle(el).fontSize),
      }));
      expect(
        fit.sw,
        `${v} fits at ${size} (scroll ${fit.sw} vs box ${fit.cw})`,
      ).toBeLessThanOrEqual(fit.cw);
      expect(fit.fs, 'main number size').toBeGreaterThanOrEqual(54);
    }
    for (const dir of ['down', 'up']) {
      const b = await field.locator(`[data-step="${dir}"]`).boundingBox();
      expect(b?.width ?? 0, dir).toBeGreaterThanOrEqual(56);
      expect(b?.height ?? 0, dir).toBeGreaterThanOrEqual(56);
    }
    await expectRoundButtons(field);
    await noHorizontalOverflow(page);
    await page.screenshot({ path: testInfo.outputPath('kcal-change-390.png') });
    expect(errors).toEqual([]);
  });
});
