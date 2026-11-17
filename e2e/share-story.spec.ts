import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
} from './app.helpers';

/**
 * M13 task 25 wired in task 31 (SPEC M13 Accept): Calendar → Share opens a preview made on the
 * phone, 390×844. Post size first (no lead picker); Story size shows "Lead with" (only leads
 * whose number is above 0, Sessions done picked); picking a lead remakes the image; Share hands
 * the 1080×1920 PNG named gym-clean-<month>-story.png to the share sheet, or downloads it when
 * there is no Web Share. Back returns to the Calendar. Nothing spoken, no request off the device.
 */

declare global {
  interface Window {
    __storyShared: { name: string; type: string; size: number; title: string }[];
  }
}

const preview = (page: Page) => page.locator('main[data-screen="share-preview"]');
const sizeBtn = (page: Page, s: 'post' | 'story') => page.locator(`[data-share-size="${s}"]`);
const leadBtn = (page: Page, l: string) => page.locator(`[data-share-lead="${l}"]`);

/** Two finished sessions with sets this month (sessions and volume both above 0). */
async function seedMonth(page: Page): Promise<void> {
  const set = (sessionId: string, start: number, i: number) => ({
    sessionId,
    exerciseId: 'Dumbbell_Bench_Press',
    setIndex: i,
    reps: 10,
    weightKg: 20,
    startedAt: start + (i + 1) * MIN,
  });
  await seed(
    page,
    [
      { sessionId: 's-mon', dayId: 'push-a', startedAt: at(9, 18), endedAt: at(9, 18) + 50 * MIN },
      {
        sessionId: 's-wed',
        dayId: 'pull-a',
        startedAt: at(11, 18),
        endedAt: at(11, 18) + 50 * MIN,
      },
    ],
    [0, 1, 2].flatMap((i) => [set('s-mon', at(9, 18), i), set('s-wed', at(11, 18), i)]),
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

async function openPreview(page: Page): Promise<void> {
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-share-month]').click();
  await expect(preview(page)).toBeVisible();
  await imageReady(page);
}

/** The PNG is drawn on the phone: slow under parallel workers, so a longer wait than usual. */
async function imageReady(page: Page): Promise<void> {
  await expect(page.locator('[data-share-image]')).toBeVisible({ timeout: 20_000 });
}

/** The image's natural size once the <img> has loaded. */
const imageSize = (page: Page) =>
  page.locator('[data-share-image]').evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });

test('Story share: Post → Story, lead picker, remade image, download named …-story.png', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await page.addInitScript(() => {
    for (const k of ['share', 'canShare'])
      Object.defineProperty(navigator, k, { configurable: true, value: undefined });
  });
  await openApp(page, at(13, 18));
  await seedMonth(page);
  await openPreview(page);

  // Post size first: no lead picker, a 1080×1350 image.
  await expect(sizeBtn(page, 'post')).toHaveAttribute('aria-pressed', 'true');
  await expect(sizeBtn(page, 'story')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('[data-share-lead]')).toHaveCount(0);
  expect(await imageSize(page)).toEqual([1080, 1350]);
  await expect(preview(page)).toContainText('Nothing is uploaded.');
  await expect(preview(page).locator('a')).toHaveCount(0);
  await noHorizontalOverflow(page);

  // Story size: the lead picker with Sessions done picked; a 1080×1920 image.
  await sizeBtn(page, 'story').click();
  await expect(sizeBtn(page, 'story')).toHaveAttribute('aria-pressed', 'true');
  await expect(leadBtn(page, 'sessions')).toHaveAttribute('aria-pressed', 'true');
  await expect(leadBtn(page, 'volume')).toHaveAttribute('aria-pressed', 'false');
  await imageReady(page);
  expect(await imageSize(page)).toEqual([1080, 1920]);
  const before = await page.locator('[data-share-image]').getAttribute('src');

  // Lead with Total lifted: a new image (new object URL), still Story size.
  await leadBtn(page, 'volume').click();
  await expect(leadBtn(page, 'volume')).toHaveAttribute('aria-pressed', 'true');
  await expect(leadBtn(page, 'sessions')).toHaveAttribute('aria-pressed', 'false');
  await imageReady(page);
  await expect(page.locator('[data-share-image]')).not.toHaveAttribute('src', before ?? '');
  expect(await imageSize(page)).toEqual([1080, 1920]);
  await expectTapTargets(page, 'main[data-screen="share-preview"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13-share-story.png') });

  // Share (no Web Share here): a download named for the month and the Story size.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-go]').click(),
  ]);
  expect(download.suggestedFilename()).toBe('gym-clean-2026-11-story.png');
  const path = testInfo.outputPath('story.png');
  await download.saveAs(path);
  const png = readFileSync(path);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1920);
  await expect(page.locator('[data-notice]')).toHaveText('Image saved.');

  // Back to the Calendar month.
  await preview(page).locator('.back-btn').click();
  await expect(preview(page)).toHaveCount(0);
  await expect(page.locator('[data-share-month]')).toBeVisible();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Story share with Web Share: the share sheet gets one PNG file named …-story.png', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await page.addInitScript(() => {
    window.__storyShared = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d: { files?: File[] }) => Array.isArray(d.files),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files: File[]; title: string }) => {
        for (const f of d.files)
          window.__storyShared.push({ name: f.name, type: f.type, size: f.size, title: d.title });
      },
    });
  });
  await openApp(page, at(13, 18));
  await seedMonth(page);
  await openPreview(page);
  await sizeBtn(page, 'story').click();
  await expect(leadBtn(page, 'sessions')).toHaveAttribute('aria-pressed', 'true');
  await imageReady(page);
  await page.locator('[data-share-go]').click();
  await expect.poll(() => page.evaluate(() => window.__storyShared.length)).toBe(1);
  const [file] = await page.evaluate(() => window.__storyShared);
  expect(file?.name).toBe('gym-clean-2026-11-story.png');
  expect(file?.type).toBe('image/png');
  expect(file?.size ?? 0).toBeGreaterThan(1000);
  // Shared, not downloaded: no "Image saved." notice.
  await expect(page.locator('[data-notice]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
