// M13 task 17: the five tab labels never touch, at 390 and at 360 wide. Each label sits inside
// its own tab with a clear gap to the next, labels are ≥ 18px, tabs ≥ 56px wide and tall, and the
// active tab is marked by more than colour (aria-current + the sliding bar). Made-up data.
import { expect, test, type Page } from './fixtures';
import { at, guardNetwork, openApp, record } from './app.helpers';

async function measure(page: Page) {
  return page.evaluate(() => {
    const tabs = [...document.querySelectorAll<HTMLElement>('[data-tabbar] .tab')];
    return {
      scrollWidth: document.documentElement.scrollWidth,
      boxes: tabs.map((t) => {
        const label = t.querySelector<HTMLElement>('.tab-label');
        if (!label) throw new Error('tab without a label');
        const l = label.getBoundingClientRect();
        const r = t.getBoundingClientRect();
        return {
          id: t.dataset.tab ?? '',
          left: l.left,
          right: l.right,
          tabLeft: r.left,
          tabRight: r.right,
          tabW: r.width,
          tabH: r.height,
          fontPx: parseFloat(getComputedStyle(label).fontSize),
        };
      }),
    };
  });
}

for (const width of [390, 360]) {
  test(`tab labels don't overlap or touch at ${width} wide`, async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await page.setViewportSize({ width, height: 844 });
    await openApp(page, at(13, 18));
    await page.evaluate(() => document.fonts.ready);

    for (const active of ['today', 'calendar', 'settings']) {
      if (active !== 'today') await page.locator(`[data-tab="${active}"]`).click();
      const tab = page.locator(`[data-tab="${active}"]`);
      await expect(tab).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('[data-tabbar] [aria-current="page"]')).toHaveCount(1);
      await expect(page.locator(`[data-tab-ind="${active}"]`)).toHaveCount(1);

      const { scrollWidth, boxes } = await measure(page);
      expect(scrollWidth).toBe(width);
      expect(boxes.map((b) => b.id)).toEqual(['today', 'fuel', 'coach', 'calendar', 'settings']);
      for (const b of boxes) {
        expect(b.fontPx).toBeGreaterThanOrEqual(18);
        expect(b.tabW).toBeGreaterThanOrEqual(56);
        expect(b.tabH).toBeGreaterThanOrEqual(56);
        // The label stays inside its own tab, off the screen edge.
        expect(b.left).toBeGreaterThanOrEqual(b.tabLeft);
        expect(b.right).toBeLessThanOrEqual(b.tabRight);
        expect(b.right).toBeLessThanOrEqual(width - 4);
      }
      // Neighbouring labels keep a clear gap (Barlow 18px left only 2px at 360).
      const gaps = boxes.slice(1).map((b, i) => b.left - (boxes[i]?.right ?? 0));
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
    }

    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
}
