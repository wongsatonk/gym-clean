// M4f task 9/10: a camera rule that is still `learning` shows a "Learning" chip in the camera
// top band and one line on the "Set up your phone" card; its set's "Last set" Fix on Rest shows
// "Camera still learning. Fix it if it's off." None of it is spoken. A tuned rule (the curl)
// shows none of it. The fake camera is a test pattern (no person), so the setup card stays up
// and Set done saves a 0-rep camera set.
import { expect, test, type Page } from '@playwright/test';
import { seedHandsFreeOff } from './hands-free.helpers';

const CHIP_NAME = 'Learning: camera counting is new for this exercise';
const SETUP_LINE = 'Still learning: fix the count on Rest.';
const REST_LINE = "Camera still learning. Fix it if it's off.";

async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      constructor(text: string) {
        super();
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: FakeUtterance) => {
          if (u.text && u.volume !== 0) w.__spoken.push(u.text); // skip the silent iOS unlock
        },
        cancel: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({
          addEventListener: () => undefined,
          release: async () => undefined,
        }),
      },
    });
  });
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

/** Pull A → Start → exercise list → `name` → Camera. Returns the camera dialog. */
async function openCameraFor(page: Page, name: string) {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  return cam;
}

test.beforeEach(async ({ page }) => {
  await installMocks(page);
  await page.goto('/');
  await seedHandsFreeOff(page); // per-set camera: Set done closes the sheet and shows Rest
});

test('learning rule (Hammer Curls): chip + setup line on the camera, note under Fix on Rest, nothing spoken', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const cam = await openCameraFor(page, 'Hammer Curls');

  // Chip in the top band, accessible name per the SPEC, on one line, ≥ 20px.
  const chip = cam.getByRole('note', { name: CHIP_NAME });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('Learning');
  await expect(cam.locator('.cam-top [data-learning]')).toHaveCount(1);
  const chipBox = await chip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      fontPx: parseFloat(cs.fontSize),
      height: el.getBoundingClientRect().height,
      lineH: parseFloat(cs.lineHeight),
    };
  });
  expect(chipBox.fontPx).toBeGreaterThanOrEqual(20);
  expect(chipBox.height).toBeLessThan(chipBox.lineH * 1.6 + 8); // one line, not wrapped

  // The Close button keeps its one-line word next to the title.
  const close = cam.getByRole('button', { name: 'Close' });
  const closeBox = await close.evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    right: el.getBoundingClientRect().right,
  }));
  expect(closeBox.h).toBeLessThan(80);
  expect(closeBox.right).toBeLessThanOrEqual(390);

  // Setup card: the learning line after the placement lines, ≥ 20px.
  const setupLine = cam.locator('.cam-setup .setup-learning');
  await expect(setupLine).toHaveText(SETUP_LINE);
  await expect(cam.locator('.cam-setup .setup-line').last()).toHaveText(SETUP_LINE);
  expect(
    await setupLine.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('learning-camera-390.png') });

  // Set done → Rest: the note under "Last set" (inside the Fix panel).
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  const fix = page.locator('[data-lsc=panel]');
  await expect(fix.locator('[data-lsc=learning]')).toHaveText(REST_LINE);
  expect(
    await fix
      .locator('[data-lsc=learning]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  // Fix still works with the note there (one more rep than logged).
  const before = Number(await fix.getAttribute('data-reps'));
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-plus]').click();
  await fix.locator('[data-lsc=save]').click();
  await expect(fix).toHaveAttribute('data-reps', String(before + 1));
  await expect(fix.locator('[data-lsc=learning]')).toHaveText(REST_LINE);

  // Shown, never spoken.
  expect((await spoken(page)).filter((t) => /learning/i.test(t))).toEqual([]);
  expect(errors).toEqual([]);
});

test('tuned rule (Dumbbell Bicep Curl): no chip, no setup line, no Rest note', async ({ page }) => {
  const cam = await openCameraFor(page, 'Dumbbell Bicep Curl');
  await expect(cam.locator('.cam-setup')).toBeVisible();
  await expect(cam.locator('[data-learning]')).toHaveCount(0);
  await expect(cam.locator('.setup-learning')).toHaveCount(0);

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-lsc=panel]')).toBeVisible();
  await expect(page.locator('[data-lsc=learning]')).toHaveCount(0);
});

test.describe('small phone (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the chip fits beside the title without wrapping Close, no horizontal overflow', async ({
    page,
  }) => {
    const cam = await openCameraFor(page, 'Hammer Curls');
    const chip = cam.getByRole('note', { name: CHIP_NAME });
    await expect(chip).toBeVisible();
    const m = await page.evaluate(() => {
      const at = (sel: string): Element => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`missing ${sel}`);
        return el;
      };
      const box = (sel: string) => at(sel).getBoundingClientRect();
      const chipEl = at('.cam-learning');
      return {
        chipH: box('.cam-learning').height,
        chipLine: parseFloat(getComputedStyle(chipEl).lineHeight),
        chipRight: box('.cam-learning').right,
        closeH: box('.cam-close').height,
        closeLeft: box('.cam-close').left,
        closeRight: box('.cam-close').right,
        scroll: document.documentElement.scrollWidth,
      };
    });
    expect(m.chipH).toBeLessThan(m.chipLine * 1.6 + 8);
    expect(m.closeH).toBeLessThan(80);
    expect(m.chipRight).toBeLessThanOrEqual(m.closeLeft);
    expect(m.closeRight).toBeLessThanOrEqual(375);
    expect(m.scroll).toBe(375);
  });
});
