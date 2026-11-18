// M13c task 18: tappable badges (SPEC M13c goal 4; tasks 11, 13, 16), in the real app at 390×844.
//
// - Day preview (nothing started yet): each badge is a ≥ 56px button. 3D demo → the How-to
//   sheet, Camera → the Camera sheet (what it counts, where the phone goes, Practice),
//   Learning → the "Camera still learning" card. Each closes back to the badge it came from.
//   A row's name opens the exercise's detail; its badges work there too. No workout starts:
//   still the preview, no session saved, nothing spoken.
// - Exercise screen (a set is running): the badges are static labels again, not buttons, so
//   nothing new is reachable mid-set.
// Every test fails on a request that leaves the device (route-asserted) and on a console error.
import { expect, test, type Locator, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getRows,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

const NOW = at(18, 18);
const preview = (page: Page) => page.locator('main[data-screen="preview"]');

let guard: { offsite: string[]; errors: string[] } | null = null;
test.beforeEach(async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  guard = { offsite, errors };
});
test.afterEach(() => {
  expect(guard?.offsite ?? [], 'requests that left the device').toEqual([]);
  expect(guard?.errors ?? [], 'console errors').toEqual([]);
});

async function openPushA(page: Page): Promise<void> {
  await openApp(page, NOW);
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).locator('.ex-row').first()).toBeVisible();
}

/** The first preview row that has a `kind` badge button, and its exercise id. */
async function rowWith(page: Page, kind: string): Promise<{ row: Locator; id: string }> {
  const row = preview(page)
    .locator('li.ex-row')
    .filter({ has: page.locator(`[data-badge-open="${kind}"]`) })
    .first();
  await expect(row).toBeVisible();
  return { row, id: (await row.getAttribute('data-ex')) ?? '' };
}

test('preview: 3D demo, Camera and Learning badges open their sheets; nothing starts', async ({
  page,
}, testInfo) => {
  await openPushA(page);
  // Badges are buttons here, with a name that says what they open, and meet the 56px rule.
  const demo = preview(page).locator('[data-badge-open="3d"]').first();
  await expect(demo).toHaveAccessibleName(/^3D demo for /);
  await expect(preview(page).locator('[data-badge-open="camera"]').first()).toHaveAccessibleName(
    /^Camera set-up for /,
  );
  await expectTapTargets(page, 'main[data-screen="preview"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-preview-badges.png') });

  // 3D demo → the How-to sheet for that row → Close → focus back on the badge.
  const first = await rowWith(page, '3d');
  const demoBtn = first.row.locator('[data-badge-open="3d"]');
  await demoBtn.click();
  const howto = page.locator(`[data-howto="sheet"][data-exercise="${first.id}"]`);
  await expect(howto).toBeVisible();
  await expect(howto.locator('[data-howto="stage"]')).toHaveAttribute('data-mode', /^(3d|map)$/, {
    timeout: 15_000,
  });
  await howto.locator('[data-howto="close"]').click();
  await expect(page.locator('[data-howto="sheet"]')).toHaveCount(0);
  await expect(demoBtn).toBeFocused();

  // Camera → the Camera sheet: what it counts, where the phone goes, Practice + Close.
  const cam = await rowWith(page, 'camera');
  const camBtn = cam.row.locator('[data-badge-open="camera"]');
  await camBtn.click();
  const sheet = page.locator(`[data-camera-sheet="${cam.id}"]`);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-camera-title]')).toContainText('Camera');
  await expect(sheet.locator('[data-camera-counts]')).not.toBeEmpty();
  await expect(sheet.locator('[data-camera-lines]')).toBeVisible();
  await expect(sheet.locator('[data-camera-practice]')).toBeVisible();
  await expectTapTargets(page, `[data-camera-sheet="${cam.id}"]`);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-camera-sheet.png') });
  await sheet.locator('[data-camera-close]').click();
  await expect(page.locator('[data-camera-sheet]')).toHaveCount(0);
  await expect(camBtn).toBeFocused();

  // Learning → the "Camera still learning" card → Close.
  const learn = await rowWith(page, 'learning');
  const learnBtn = learn.row.locator('[data-badge-open="learning"]');
  await learnBtn.click();
  const card = page.locator('[data-learn-sheet="cameraLearning"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-learn-title]')).toHaveText('Camera still learning');
  await card.locator('[data-learn-close]').click();
  await expect(page.locator('[data-learn-sheet]')).toHaveCount(0);
  await expect(learnBtn).toBeFocused();

  // Nothing started: still the preview, no session saved, nothing spoken.
  await expect(preview(page)).toBeVisible();
  await expect(page.locator('main[data-screen="exercise"]')).toHaveCount(0);
  expect(await getRows(page, 'sessions')).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('preview: a row opens the exercise detail, whose badges work too; Back returns to the preview', async ({
  page,
}) => {
  await openPushA(page);
  const cam = await rowWith(page, 'camera');
  await cam.row.locator(`[data-ex-open="${cam.id}"]`).click();
  const detail = page.locator(`main[data-screen="exercise-detail"][data-exercise="${cam.id}"]`);
  await expect(detail).toBeVisible();
  // In the plan: the detail lists the Push A row.
  await expect(detail.locator('[data-detail-plan-row="Push A"]')).toBeVisible();
  // Camera block → Phone set-up opens the same Camera sheet; so does the Camera badge.
  await expect(detail.locator('[data-detail-camera-block]')).toBeVisible();
  await detail.locator('[data-detail-camera]').click();
  await expect(page.locator(`[data-camera-sheet="${cam.id}"]`)).toBeVisible();
  await page.locator('[data-camera-close]').click();
  await expect(page.locator('[data-camera-sheet]')).toHaveCount(0);
  await detail.locator('[data-badge-open="camera"]').first().click();
  await expect(page.locator(`[data-camera-sheet="${cam.id}"]`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-camera-sheet]')).toHaveCount(0);
  await expectTapTargets(page, 'main[data-screen="exercise-detail"]');
  await noHorizontalOverflow(page);

  await detail.locator('[data-detail-back]').click();
  await expect(preview(page)).toBeVisible();
  expect(await getRows(page, 'sessions')).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('Exercise screen: the badges are static labels, not buttons (nothing new mid-set)', async ({
  page,
}) => {
  await openPushA(page);
  await page.getByRole('button', { name: 'Start workout' }).click();
  const ex = page.locator('main[data-screen="exercise"]');
  await expect(ex).toBeVisible();
  const badges = ex.locator('.exercise-head-text [data-badge]');
  await expect(badges.first()).toBeVisible();
  await expect(page.locator('[data-badge-open]')).toHaveCount(0);
  const found = await badges.evaluateAll((els) =>
    els.map((el) => ({
      tag: el.tagName,
      control: el.closest('button, a, [role="button"], [tabindex]') !== null,
    })),
  );
  expect(found.length).toBeGreaterThan(0);
  for (const b of found) expect(b).toEqual({ tag: 'SPAN', control: false });
  // A tap on a badge opens nothing.
  await badges.first().click();
  await expect(
    page.locator('[data-camera-sheet], [data-howto="sheet"], [data-learn-sheet]'),
  ).toHaveCount(0);
  await expect(ex).toBeVisible();
});

// Verifier find (M13c task 21): badge buttons scrolling under the sticky Start bar took its taps.
test('preview: the Start workout bar stays on top of the badges at every scroll', async ({
  page,
}) => {
  await openPushA(page);
  const start = page.getByRole('button', { name: 'Start workout' });
  for (const y of [0, 150, 300, 600]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    const box = await start.boundingBox();
    expect(box).not.toBeNull();
    if (!box) continue;
    // Points across the bar all hit the Start button itself, never a badge under it.
    const hits = await page.evaluate(
      ({ x, w, cy }) =>
        [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
          const el = document.elementFromPoint(x + w * f, cy);
          return el?.closest('button')?.textContent?.trim() ?? '';
        }),
      { x: box.x, w: box.width, cy: box.y + box.height / 2 },
    );
    for (const h of hits) expect(h, `scroll ${y}`).toContain('Start workout');
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await start.click();
  await expect(page.locator('main[data-screen="exercise"]')).toBeVisible();
});
