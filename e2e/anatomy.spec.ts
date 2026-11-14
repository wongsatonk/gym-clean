import { expect, test, type Page } from '@playwright/test';

async function startDay(page: Page, day: RegExp) {
  await page.goto('/');
  await page.getByRole('button', { name: day }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
}

const cases = [
  { day: /Push A/, exercise: 'Dumbbell Bench Press', primary: 'chest', view: 'front' },
  { day: /Pull A/, exercise: 'One-Arm Dumbbell Row', primary: 'middle back', view: 'back' },
  { day: /Legs A/, exercise: 'Goblet Squat', primary: 'quadriceps', view: 'front' },
] as const;

for (const c of cases) {
  test(`3D body lights ${c.primary} for ${c.exercise} and turns to the ${c.view}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await startDay(page, c.day);
    await expect(page.getByRole('heading', { name: c.exercise })).toBeVisible();

    // 2D fallback is in the slot with the right view and highlight
    const slot = page.locator('.exercise-head [data-muscle-slot]');
    await expect(slot.locator('svg.body-map')).toHaveAttribute('data-view', c.view);
    await expect(slot.locator(`path[data-muscle="${c.primary}"]`)).toHaveClass(/primary/);

    // 3D body loads into the same slot and faces the working muscles
    const body = slot.locator('.body3d');
    await expect(body).toHaveAttribute('data-primary', new RegExp(c.primary));
    const target = Number(await body.getAttribute('data-target'));
    expect(Math.cos(target) > 0).toBe(c.view === 'front');

    // Tap → full-screen viewer, draggable
    await page.getByRole('button', { name: 'Show target muscles in 3D' }).click();
    const sheet = page.getByRole('dialog', { name: 'Target muscles' });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.body3d')).toHaveAttribute('data-interactive', 'true');
    await expect(sheet.locator('.legend')).toContainText(c.primary);
    // Nothing from the screen paints over the sheet (the stage's set count, legend and How to
    // once showed through): the top element at each one's centre belongs to the sheet.
    const onTop = await page.evaluate(() =>
      [...document.querySelectorAll('[data-set-counter], [data-legend], [data-howto-open]')]
        .filter((e) => !e.closest('[role="dialog"]'))
        .map((e) => {
          const r = e.getBoundingClientRect();
          const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return hit?.closest('[aria-label="Target muscles"]')
            ? 'sheet'
            : `${hit?.tagName ?? 'none'}.${hit?.getAttribute('class') ?? ''}`;
        }),
    );
    expect(onTop.length).toBeGreaterThan(0);
    expect(onTop).toEqual(onTop.map(() => 'sheet'));
    const canvas = sheet.locator('canvas');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('no canvas box');
    const before = Number(await sheet.locator('.body3d').getAttribute('data-angle'));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = Number(await sheet.locator('.body3d').getAttribute('data-angle'));
    expect(Math.abs(after - before)).toBeGreaterThan(0.5);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(slot.locator('.body3d')).toHaveAttribute('data-interactive', 'false');

    expect(errors).toEqual([]);
  });
}

test('falls back to the 2D map when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await startDay(page, /Push A/);
  const slot = page.locator('.exercise-head [data-muscle-slot]');
  await expect(slot.locator('svg.body-map')).toBeVisible();
  await expect(slot.locator('path[data-muscle="chest"]')).toHaveClass(/primary/);
  await page.waitForTimeout(500);
  await expect(slot.locator('.body3d')).toHaveCount(0);
});
