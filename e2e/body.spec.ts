// M12 slice 1b task 38: body tracking in the real app at 390×844 (SPEC M12 trainer-kit items 4 + 8,
// slice 1b Accept). Made-up numbers and a made-up image (a canvas drawing) only.
//
// - Fuel → Measurements: open a site, save, and it is still there after a reload (stored in cm).
// - Calendar → a day → an exercise's history shows the estimated 1-rep max per session.
// - Progress photos: off by default (nothing to add or see); on → add two made-up photos →
//   compare side by side → delete one (two taps). They stay on the phone: a Back up file has no
//   photos. No request leaves the dev server (route-asserted).
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  expectTapTargets,
  getRows,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
  type SetSeed,
} from './app.helpers';

const measurements = (page: Page) => page.locator('main[data-screen="measurements"]');

test('a tape measurement saved in Fuel survives a reload', async ({ page }, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  await page.locator('[data-tab="fuel"]').click();
  const open = page.locator('[data-measurements-open]');
  await expect(open).toBeVisible();
  await open.click();
  await expect(measurements(page)).toBeVisible();
  await expect(measurements(page).locator('[data-measure-status]')).toHaveAttribute(
    'data-measure-status',
    'first',
  );
  const toggle = measurements(page).locator('[data-site-toggle="waist"]');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const value = measurements(page).locator('[data-field="site-waist"] .nf-value');
  await value.fill('81.5');
  await value.dispatchEvent('change');
  await expect(value).toHaveValue('81.5');
  await expectTapTargets(page, 'main[data-screen="measurements"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-measurements.png') });
  await measurements(page).locator('[data-measure-save]').click();

  await expect
    .poll(async () =>
      (await getRows<{ date: string; site: string; cm: number }>(page, 'measurements')).map((m) => [
        m.date,
        m.site,
        m.cm,
      ]),
    )
    .toEqual([['2026-11-13', 'waist', 81.5]]);

  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await page.locator('[data-tab="fuel"]').click();
  await page.locator('[data-measurements-open]').click();
  await expect(measurements(page).locator('[data-site-last="waist"]')).toContainText('81.5');
  await expect(measurements(page).locator('[data-measure-status]')).toHaveAttribute(
    'data-measure-status',
    'ok',
  );

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Calendar exercise history shows the estimated 1-rep max per session', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  const days = [2, 6, 11];
  await seed(
    page,
    days.map((d) => ({
      sessionId: `s${d}`,
      dayId: 'push-a',
      startedAt: at(d, 18),
      endedAt: at(d, 18) + 45 * MIN,
    })),
    days.flatMap((d, i) =>
      [0, 1].map((k): SetSeed => ({
        sessionId: `s${d}`,
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: k,
        reps: 8,
        weightKg: 15 + 2.5 * i,
        startedAt: at(d, 18) + (k + 1) * 3 * MIN,
      })),
    ),
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();

  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-day="2026-11-11"]').click();
  const day = page.locator('main[data-screen="calendar-day"]');
  await expect(day).toHaveAttribute('data-date', '2026-11-11');
  await day.locator('[data-cal-history="Dumbbell_Bench_Press"]').click();

  const e1rm = page.locator('[data-e1rm]');
  await expect(e1rm).toHaveAttribute('data-state', 'line');
  await expect(e1rm.locator('.e1-dot')).toHaveCount(3);
  await expect(e1rm.locator('[data-e1rm-chart]')).toHaveAttribute('role', 'img');
  await expect(e1rm.locator('[data-e1rm-summary]')).not.toBeEmpty();
  await e1rm.scrollIntoViewIfNeeded();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12b-e1rm-chart.png') });

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

/** A made-up image: a plain canvas drawing, as PNG bytes. */
async function madeUpPng(page: Page, colour: string): Promise<Buffer> {
  const url = await page.evaluate((c) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 160;
    const g = canvas.getContext('2d');
    if (g) {
      g.fillStyle = c;
      g.fillRect(0, 0, 120, 160);
      g.fillStyle = '#ffffff';
      g.fillRect(40, 20, 40, 120);
    }
    return canvas.toDataURL('image/png');
  }, colour);
  return Buffer.from(url.split(',')[1] ?? '', 'base64');
}

const photos = (page: Page) => page.locator('main[data-screen="progress-photos"]');

test('progress photos: off by default → on → add two made-up photos → compare → delete; never in a backup', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  // Off by default: a switch, nothing to open.
  await page.locator('[data-tab="settings"]').click();
  const section = page.locator('[data-section="progress-photos"]');
  await section.scrollIntoViewIfNeeded();
  const sw = section.locator('[data-setting="progress-photos"]');
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(section.locator('[data-progress-photos-open]')).toHaveCount(0);

  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await section.locator('[data-progress-photos-open]').click();
  await expect(photos(page)).toHaveAttribute('data-state', 'on');
  await expect(photos(page).locator('[data-photos-privacy]')).toBeVisible();
  await expect(photos(page).locator('[data-photos-empty]')).toBeVisible();

  // Two made-up photos (front, then side).
  const add = async (pose: string, colour: string, name: string) => {
    await photos(page).locator(`[data-pose="${pose}"]`).click();
    await expect(photos(page).locator(`[data-pose="${pose}"]`)).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await photos(page)
      .locator('[data-photo-input="pick"]')
      .setInputFiles({ name, mimeType: 'image/png', buffer: await madeUpPng(page, colour) });
  };
  await add('front', '#3a6ea5', 'made-up-front.png');
  await expect(photos(page).locator('[data-photo]')).toHaveCount(1);
  await add('side', '#a55a3a', 'made-up-side.png');
  const tiles = photos(page).locator('[data-photo]');
  await expect(tiles).toHaveCount(2);
  await expect.poll(async () => (await getRows(page, 'progressPhotos')).length).toBe(2);

  // Compare: tap two → side by side.
  await tiles.nth(0).click();
  await expect(tiles.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await tiles.nth(1).click();
  const compare = photos(page).locator('[data-compare]');
  await expect(compare).toHaveAttribute('data-compare', 'pair');
  await expect(compare.locator('[data-compare-side]')).toHaveCount(2);
  await expectTapTargets(page, 'main[data-screen="progress-photos"]');
  await noHorizontalOverflow(page);
  await compare.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('m12b-photo-compare.png') });
  await compare.locator('[data-compare-clear]').click();
  await expect(compare.locator('[data-compare-side]')).toHaveCount(0);

  // Delete one: the first tap arms it, the second deletes.
  const id = (await tiles.nth(0).getAttribute('data-photo')) ?? '';
  const del = photos(page).locator(`[data-photo-delete="${id}"]`);
  await del.click();
  await expect(del).toHaveAttribute('data-armed', 'true');
  await expect(tiles).toHaveCount(2);
  await del.click();
  await expect(tiles).toHaveCount(1);
  await expect.poll(async () => (await getRows(page, 'progressPhotos')).length).toBe(1);

  // A Back up file never carries them.
  await photos(page).getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('main.settings')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-backup-export]').click(),
  ]);
  const path = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(path);
  const text = readFileSync(path, 'utf8');
  const json = JSON.parse(text) as { tables: Record<string, unknown[]> };
  expect(Object.keys(json.tables)).not.toContain('progressPhotos');
  expect(text).not.toContain('made-up-');
  expect(text).not.toContain('image/png');

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
