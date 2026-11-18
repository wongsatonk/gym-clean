import { expect, test, type Page } from './fixtures';
import {
  at,
  coachTab,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

/**
 * M13 wave 2 (tasks 11, 21, 22), at 390×844:
 * - Empty states (task 22): a fresh install's Fuel day (no targets: "Set up targets" is the one
 *   filled button, Log food is the empty state's outline action) and its empty Coach thread (icon,
 *   one line, the starters). A Fuel day with targets set (harness): Log food is the filled action
 *   inside the empty state. Nothing spoken: these are read with the phone in hand.
 * - Wording (task 21): the Calendar week / month cards show one headline score ("0 of 6") with its
 *   label; the Summary stall card says "Plateau" in sentence case (harness).
 * - Launch mark (task 11): with the app script blocked the page shows the static logo mark on
 *   #0d0f12 (not a blank page); the favicon links are the real icon; the description is the
 *   tagline. With the script, the app's first render replaces the mark.
 *
 * M13_SHOTS=1 also saves the screenshots to docs/screenshots/m13-*.png.
 */

const shots = !!process.env['M13_SHOTS'];
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.constructor === Animation)
        .map((a) => a.finished),
    ),
  );
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
};
const spoken = (page: Page) => page.evaluate(() => window.__spoken);
const filledButtons = (page: Page, scope: string) => page.locator(`${scope} .primary-btn:visible`);

test('fresh install: empty Fuel day and empty Coach thread are icon + one line + one action', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  // Fuel: no targets yet → "Set up targets" is the one filled button.
  await page.locator('[data-tab="fuel"]').click();
  const fuel = page.locator('main[data-screen="fuel"]');
  await expect(fuel).toBeVisible();
  await expect(filledButtons(page, 'main[data-screen="fuel"]')).toHaveCount(1);
  await expect(filledButtons(page, 'main[data-screen="fuel"]')).toHaveText('Set up targets');
  const day = fuel.locator('[data-empty-state="fuel-day"]');
  await expect(day).toBeVisible();
  await expect(day.locator('.empty-state-art svg[data-icon="plate"]')).toBeVisible();
  await expect(day.locator('.empty-state-line')).toHaveText('Nothing logged yet today.');
  await expect(day.getByRole('button')).toHaveCount(1);
  await expect(day.getByRole('button', { name: 'Log food' })).toBeVisible();
  await expect(fuel.locator('[data-log-open]')).toHaveCount(1);
  expect(
    await day
      .locator('.empty-state-line')
      .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  await expectTapTargets(page, 'main[data-screen="fuel"]');
  await noHorizontalOverflow(page);
  await day.scrollIntoViewIfNeeded();
  await shot(page, 'm13-fuel-empty');

  // Coach: an empty thread.
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
  const thread = coachTab(page).locator('[data-empty-state="coach-thread"]');
  await expect(thread).toBeVisible();
  await expect(thread.locator('.empty-state-art svg[data-icon="spark"]')).toBeVisible();
  await expect(thread.locator('.empty-state-line')).toHaveCount(1);
  await expect(thread.getByRole('group', { name: 'Suggestions' })).toBeVisible();
  // The starters fill the card's width (one column of ≥ 56px buttons).
  const starters = thread.locator('[data-coach-starter]');
  expect(await starters.count()).toBeGreaterThan(0);
  for (const box of await starters.evaluateAll((els) =>
    els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect),
  )) {
    expect(box.height).toBeGreaterThanOrEqual(56);
    expect(box.width).toBeGreaterThan(300);
  }
  await noHorizontalOverflow(page);
  await shot(page, 'm13-coach-empty');

  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Calendar cards: one headline score each ("N of M" + label), the sets % only in a quiet line', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  await page.locator('[data-tab="calendar"]').click();
  for (const key of ['week', 'month']) {
    const card = page.locator(`[data-score="${key}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator('.cal-score-num')).toHaveCount(1);
    await expect(card.locator('.cal-score-num')).toHaveText(/^(\d+ of \d+|\d+|–)$/);
    await expect(card.locator('[data-score-line]')).toHaveText(
      /^(sessions? done|extra sessions?|No sessions planned)$/,
    );
    // The big number is ≥ 64px; no second big number on the card.
    expect(
      await card
        .locator('.cal-score-num')
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    ).toBeGreaterThanOrEqual(64);
  }
  await noHorizontalOverflow(page);
  await page.locator('[data-score="week"]').scrollIntoViewIfNeeded();
  await shot(page, 'm13-calendar-score');
  expect(await spoken(page)).toEqual([]);
});

test('Fuel day with targets set (harness): Log food is the filled action inside the empty state', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const fuel = await import('/src/ui/screens/fuel.ts' as string);
    const tabs: string[] = [];
    (window as unknown as { __calls: string[] }).__calls = tabs;
    const el = fuel.fuelScreen(
      {
        now: new Date(2026, 10, 13, 9, 0).getTime(),
        mode: 'quick',
        targets: {
          kcal: { value: 2200, estimate: true },
          proteinG: { value: 120, estimate: true },
          carbsG: { value: 260, estimate: true },
          fatG: { value: 70, estimate: true },
        },
        totals: { kcal: 0, proteinG: 0 },
        entries: [],
        unit: 'kg',
        lastWeighInKg: 61.5,
      },
      {
        onLog: () => tabs.push('log'),
        onEditEntry: () => undefined,
        onWeighIn: () => undefined,
        onSetup: () => tabs.push('setup'),
        onTab: (t: string) => tabs.push(`tab:${t}`),
      },
    );
    document.body.replaceChildren(el);
  });
  const day = page.locator('[data-empty-state="fuel-day"]');
  await expect(day).toBeVisible();
  await expect(filledButtons(page, 'main[data-screen="fuel"]')).toHaveCount(1);
  const log = day.getByRole('button', { name: 'Log food' });
  await expect(log).toHaveClass(/primary-btn/);
  expect((await log.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(72);
  await noHorizontalOverflow(page);
  await shot(page, 'm13-fuel-empty-targets');
  await log.click();
  expect(await page.evaluate(() => (window as unknown as { __calls: string[] }).__calls)).toEqual([
    'log',
  ]);
});

test('Summary stall card (harness): "Plateau", sentence case, not an all-caps status word', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const m = await import('/src/ui/coachSummary.ts' as string);
    const el = m.createStallCards(
      [
        {
          exerciseId: 'bench',
          line: 'Dumbbell Bench Press: same best set for 3 sessions.',
          options: ['lighter', 'addSet'],
        },
      ],
      () => undefined,
    );
    const main = document.createElement('main');
    main.className = 'screen';
    main.append(el);
    document.body.replaceChildren(main);
  });
  const label = page.locator('.stall-label');
  await expect(label).toHaveText('Plateau');
  expect(await label.evaluate((e) => getComputedStyle(e).textTransform)).toBe('none');
  await expect(page.locator('[data-stall="bench"]')).toHaveAttribute(
    'aria-label',
    'Plateau: Dumbbell Bench Press: same best set for 3 sessions.',
  );
  await expect(page.locator('body')).not.toContainText(/stalled/i);
  await noHorizontalOverflow(page);
  await shot(page, 'm13-plateau-card');
});

test('launch mark: with the app script blocked the page shows the logo mark, not a blank page', async ({
  page,
}) => {
  await page.route('**/src/main.ts*', (r) => r.abort());
  await page.goto('/');
  const mark = page.locator('#app > [data-boot-mark]');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  const box = await mark.locator('svg').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(96);
  // Centred on the dark page, orange stroke.
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 195)).toBeLessThan(2);
  expect(await mark.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(13, 15, 18)');
  expect(await mark.locator('svg').getAttribute('stroke')).toBe('#ff7a1a');
  // Head: the real favicon (SVG + 32px PNG) and the tagline as the description.
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute(
    'href',
    '/icons/favicon.svg',
  );
  await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute(
    'href',
    '/icons/favicon-32.png',
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Your pocket strength coach.',
  );
  for (const href of ['/icons/favicon.svg', '/icons/favicon-32.png']) {
    expect((await page.request.get(href)).ok()).toBe(true);
  }
  await noHorizontalOverflow(page);
  await shot(page, 'm13-boot-mark');
});

test('launch mark: the app mounts over it (gone after the first render)', async ({ page }) => {
  await openApp(page, at(13, 18));
  await expect(page.locator('[data-boot-mark]')).toHaveCount(0);
});
