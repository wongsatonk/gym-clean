import { expect, test, type Page } from '@playwright/test';

// M4b (S9): Demo / Info / Camera badges and the "How to" sheet with the 3D demo.

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    // EventTarget: voice.ts listens for end/error on each utterance.
    class FakeUtterance extends EventTarget {
      text: string;
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
      value: { speak: () => undefined, cancel: () => undefined, getVoices: () => [] },
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

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const PUSH_A = [
  ['Dumbbell Bench Press', false],
  ['Incline Dumbbell Press', false],
  ['Seated Dumbbell Press', true],
  ['Side Lateral Raise', true],
  ['Standing Dumbbell Triceps Extension', false],
  ['Pushups', true],
] as const;

const hasWebGL = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  });

test('badges: Push A has six 3D demos, Camera on the tracked three; curl is 3D demo, Hammer Curls Info', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await installMocks(page);
  await page.goto('/');

  await page.getByRole('button', { name: /Push A/ }).click();
  const rows = page.locator('.ex-row');
  await expect(rows).toHaveCount(6);
  for (const [i, [name, camera]] of PUSH_A.entries()) {
    const row = rows.nth(i);
    await expect(row).toContainText(name);
    await expect(row.locator('[data-badge="3d"]')).toHaveText('3D demo');
    await expect(row.locator('[data-badge="info"]')).toHaveCount(0);
    await expect(row.locator('[data-badge="camera"]')).toHaveCount(camera ? 1 : 0);
  }
  const fontPx = await rows
    .first()
    .locator('[data-badge="3d"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  // Pull A in-session list: Hammer Curls (manual, no demo) shows only "Info".
  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  const hammer = list.locator('.ex-row-btn', { hasText: 'Hammer Curls' });
  await expect(hammer.locator('[data-badge="info"]')).toHaveText('Info');
  await expect(hammer.locator('[data-badge="3d"]')).toHaveCount(0);
  await expect(hammer.locator('[data-badge="camera"]')).toHaveCount(0);
  // The pose-tracked curl has a 3D demo (M4d) + Camera.
  const curl = list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' });
  await expect(curl.locator('[data-badge]')).toHaveText(['3D demo', 'Camera']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  expect(errors).toEqual([]);
});

test('How to: the 3D demo loops with phase text, Close returns focus', async ({ page }) => {
  const errors = watchErrors(page);
  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.locator('.exercise-head-text [data-badge="3d"]')).toBeVisible();

  const open = page.locator('[data-howto-open]');
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Dumbbell Bench Press' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-howto=close]')).toBeFocused();
  await expect(sheet.locator('[data-howto=tempo]')).toHaveText('Lift 1 s · Lower 2 s');
  const lines = sheet.locator('[data-howto=lines] li');
  expect(await lines.count()).toBeGreaterThanOrEqual(2);
  await expect(sheet.locator('[data-howto=focus]')).toContainText('Focus:');
  await expect(sheet.locator('[data-howto=cue]')).not.toBeEmpty();

  const stage = sheet.locator('[data-howto=stage]');
  if (await hasWebGL(page)) {
    await expect(stage).toHaveAttribute('data-mode', '3d', { timeout: 15_000 });
    await expect(stage.locator('canvas')).toBeVisible();
    // The loop is 3.8 s: within ~5 s the phase text shows more than one phase.
    const phase = sheet.locator('[data-howto=phase]');
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          seen.add((await phase.textContent()) ?? '');
          return [...seen].filter((p) => ['Lift', 'Lower', 'Hold'].includes(p)).length;
        },
        { timeout: 6_000, intervals: [100] },
      )
      .toBeGreaterThanOrEqual(2);
    const px = await phase.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(28);
  } else {
    // No WebGL in this browser: the sheet falls back to the muscle map.
    await expect(stage).toHaveAttribute('data-mode', 'map');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await sheet.locator('[data-howto=close]').click();
  await expect(page.locator('[data-howto=sheet]')).toHaveCount(0);
  await expect(open).toBeFocused();

  expect(errors).toEqual([]);
});

test('How to: reduced motion starts the demo paused on the start pose', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.locator('[data-howto-open]').click();
  const sheet = page.locator('[data-howto=sheet]');
  const stage = sheet.locator('[data-howto=stage]');
  test.skip(!(await hasWebGL(page)), 'no WebGL: the muscle map has no motion to test');
  await expect(stage).toHaveAttribute('data-mode', '3d', { timeout: 15_000 });

  await expect(sheet.locator('.demo3d-play')).toHaveText('Play');
  const phase = sheet.locator('[data-howto=phase]');
  const first = await phase.textContent();
  await page.waitForTimeout(2_000); // longer than a lift or a pause
  await expect(phase).toHaveText(first ?? '');
  await expect(sheet.locator('.demo3d-play')).toHaveText('Play');

  // Play still works when asked for.
  await sheet.locator('.demo3d-play').click();
  await expect(sheet.locator('.demo3d-play')).toHaveText('Pause');

  expect(errors).toEqual([]);
});
