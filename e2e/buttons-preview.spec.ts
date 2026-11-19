// M13d task 38 (SPEC M13d Goal 7): the round-button design preview
// (src/ui/buttonsPreview.harness.html, made-up data). No app screen uses it yet (tasks 39-41).
// Per frame: no sideways scroll at 390, every circle ≥ 56px (main ≥ 72px), every button ≥ 56px
// both ways, no text under 18px, no console errors. Exercise frame: today's hit boxes kept
// (− / + 80×68, Set done the full row) and no press motion. Press frames: Start scales with the
// glow; under Reduce Motion only the colour changes. Nothing here is spoken (look-check only).
// BUTTONS_PREVIEW_SHOT=1 also writes docs/screenshots/m13d-buttons-preview-*.png (390×844, dark).
import { expect, test, type Locator, type Page } from './fixtures';

const FRAMES = ['first-run', 'fuel-setup', 'today', 'sheet', 'exercise'] as const;
const url = (f: string) => `/src/ui/buttonsPreview.harness.html?frame=${f}`;

async function open(page: Page, frame: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  await page.goto(url(frame));
  await expect(page.locator(`[data-frame="${frame}"]`)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

const scaleOf = (btn: Locator) =>
  btn.locator('.icon-btn-circle').evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === 'none' ? 1 : new DOMMatrixReadOnly(t).a;
  });

async function hold<T>(page: Page, btn: Locator, fn: () => Promise<T>): Promise<T> {
  const b = await btn.locator('.icon-btn-circle').boundingBox();
  if (!b) throw new Error('no circle');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  try {
    return await fn();
  } finally {
    await page.mouse.up();
  }
}

for (const frame of FRAMES) {
  test(`${frame}: sizes, smallest text and no sideways scroll at 390×844`, async ({ page }) => {
    const errors = await open(page, frame);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

    const report = await page.evaluate(() => {
      const circles = [...document.querySelectorAll<HTMLElement>('[data-icon-btn]')].map((b) => {
        const c = b.querySelector('.icon-btn-circle')?.getBoundingClientRect();
        const r = b.getBoundingClientRect();
        return {
          name: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
          variant: b.getAttribute('data-variant'),
          cw: c?.width ?? 0,
          ch: c?.height ?? 0,
          bw: r.width,
          bh: r.height,
        };
      });
      let smallest = Infinity;
      let where = '';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.textContent?.trim() || el.closest('script,style')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < smallest) {
          smallest = fs;
          where = n.textContent.trim();
        }
      }
      const buttons = [...document.querySelectorAll<HTMLElement>('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          name: b.getAttribute('aria-label') ?? b.textContent?.trim() ?? '',
          w: r.width,
          h: r.height,
        };
      });
      return { circles, smallest, where, buttons };
    });

    expect(report.circles.length, 'circles').toBeGreaterThan(0);
    for (const c of report.circles) {
      expect(c.cw, c.name).toBeGreaterThanOrEqual(c.variant === 'main' ? 72 : 56);
      expect(Math.abs(c.cw - c.ch), c.name).toBeLessThan(1);
    }
    for (const b of report.buttons) {
      expect(b.w, b.name).toBeGreaterThanOrEqual(56);
      expect(b.h, b.name).toBeGreaterThanOrEqual(56);
    }
    expect(report.smallest, `smallest text: "${report.where}"`).toBeGreaterThanOrEqual(18);
    expect(errors).toEqual([]);
  });
}

test('fuel-setup: the unit switches sit next to their fields', async ({ page }) => {
  await open(page, 'fuel-setup');
  for (const [field, name] of [
    ['height', 'Height unit'],
    ['weight', 'Weight unit'],
  ] as const) {
    const g = page.locator(`[data-field="${field}"]`).getByRole('group', { name });
    await expect(g).toBeVisible();
    await expect(g.getByRole('button')).toHaveCount(2);
  }
});

test('exercise: today hit boxes kept, the words kept, no press motion', async ({ page }) => {
  await open(page, 'exercise');
  for (const name of ['Less reps', 'More reps', 'Less weight', 'More weight']) {
    const b = await page.getByRole('button', { name, exact: true }).boundingBox();
    expect(b?.width, name).toBeGreaterThanOrEqual(80);
    expect(b?.height, name).toBeGreaterThanOrEqual(68);
  }
  const done = page.getByRole('button', { name: 'Set done', exact: true });
  expect((await done.boundingBox())?.width).toBeGreaterThanOrEqual(358);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  expect(await hold(page, done, () => scaleOf(done))).toBe(1);
});

test('press: Start scales to 0.92; under Reduce Motion it does not', async ({ page }) => {
  await open(page, 'today');
  const start = page.locator('[data-demo="start"]');
  await expect(start).toHaveAccessibleName('Start workout');
  await hold(page, start, async () => {
    await expect.poll(() => scaleOf(start)).toBeLessThan(0.95);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await hold(page, start, () => scaleOf(start))).toBe(1);
});

test.describe('design preview screenshots (opt-in)', () => {
  test.use({ deviceScaleFactor: 2, colorScheme: 'dark' });
  test.beforeEach(() => {
    test.skip(!process.env.BUTTONS_PREVIEW_SHOT, 'set BUTTONS_PREVIEW_SHOT=1 to write them');
  });

  for (const frame of FRAMES) {
    test(`writes m13d-buttons-preview-${frame}.png`, async ({ page }) => {
      const errors = await open(page, frame);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `docs/screenshots/m13d-buttons-preview-${frame}.png` });
      expect(errors).toEqual([]);
    });
  }

  for (const reduced of [false, true]) {
    test(`writes the pressed Start frame${reduced ? ' (Reduce Motion)' : ''}`, async ({ page }) => {
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      const errors = await open(page, 'today');
      const hero = page.locator('.hero');
      const start = page.locator('[data-demo="start"]');
      await hold(page, start, async () => {
        // Let the 120 ms press settle before the picture.
        await page.waitForTimeout(250);
        await hero.screenshot({
          path: `docs/screenshots/m13d-buttons-preview-pressed${reduced ? '-reduced-motion' : ''}.png`,
        });
      });
      expect(errors).toEqual([]);
    });
  }
});
