// M13d task 40d (SPEC M13d Goal 7): the round icon buttons on Settings, its sub-screens, the
// To-dos and What's New, in the real app at 390×844 (owner mode on, as on his install).
// Every `[data-icon-btn]` shows its word (≥ 20px, not clipped), has an accessible name, is ≥ 56px
// both ways, its circle is round (72px main, 56px otherwise), and stays inside the screen; the
// rows that replaced full-width bars keep the whole row as the tap area. Today's names are kept
// (role + name finds every row). Segmented choices and switches are not icon buttons. Nothing is
// spoken, no request leaves the dev server, no sideways scroll.
// BUTTONS_AFTER_SHOT=1 also writes docs/screenshots/m13d-buttons-after-{settings,
// settings-lower,todos,todo-guide,whats-new,self-check}.png (390×844, dark).
import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  todoReady,
} from './app.helpers';

test.use({ owner: 'on' });

type Row = {
  word: string;
  name: string;
  main: boolean;
  wide: boolean;
  w: number;
  h: number;
  right: number;
  circle: [number, number];
  round: boolean;
  wordPx: number;
  wordShown: boolean;
  clipped: boolean;
};

/** Measures every visible round button under `root` and checks the Goal 7 rules. */
async function roundButtons(page: Page, root: string): Promise<string[]> {
  const rows: Row[] = await page.locator(`${root} [data-icon-btn]`).evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => {
        const b = el.getBoundingClientRect();
        const circle = el.querySelector('.icon-btn-circle') as HTMLElement;
        const c = circle.getBoundingClientRect();
        const word = el.querySelector('.icon-btn-label') as HTMLElement;
        const ws = getComputedStyle(word);
        return {
          word: (word.textContent ?? '').trim(),
          name: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim(),
          main: el.getAttribute('data-variant') === 'main',
          wide: el.hasAttribute('data-wide-hit'),
          w: Math.round(b.width),
          h: Math.round(b.height),
          right: Math.round(b.right),
          circle: [Math.round(c.width), Math.round(c.height)] as [number, number],
          round: parseFloat(getComputedStyle(circle).borderTopLeftRadius) >= c.width / 2 - 1,
          wordPx: parseFloat(ws.fontSize),
          wordShown: ws.display !== 'none' && ws.visibility !== 'hidden' && word.offsetWidth > 0,
          clipped: word.scrollWidth > word.clientWidth + 1,
        };
      }),
  );
  expect(rows.length, root).toBeGreaterThan(0);
  for (const r of rows) {
    expect(r.wordShown, `${r.word} shows its word`).toBe(true);
    expect(r.name, `${r.word} has a name`).not.toBe('');
    expect(r.wordPx, `${r.word} word size`).toBeGreaterThanOrEqual(20);
    expect(r.clipped, `${r.word} word clipped`).toBe(false);
    expect(r.h, `${r.word} height`).toBeGreaterThanOrEqual(56);
    expect(r.w, `${r.word} width`).toBeGreaterThanOrEqual(56);
    expect(r.right, `${r.word} inside the screen`).toBeLessThanOrEqual(390);
    expect(r.round, `${r.word} round`).toBe(true);
    expect(r.circle, r.word).toEqual(r.main ? [72, 72] : [56, 56]);
    // A row that replaced a wide bar is still a wide tap area (a pill across its row; beside a
    // Back circle on the step pages).
    if (r.wide) expect(r.w, `${r.word} row width`).toBeGreaterThanOrEqual(240);
  }
  return rows.map((r) => r.word);
}

const shoot = async (page: Page, name: string) => {
  if (!process.env.BUTTONS_AFTER_SHOT) return;
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `docs/screenshots/m13d-buttons-after-${name}.png` });
};

const settings = (page: Page) => page.locator('main[data-screen="settings"]');

test(
  'M13d 40d: Settings rows are round buttons with their words; names, hooks and choices kept',
  { tag: '@m13d-flow' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openApp(page, at(16, 18));
    await page.locator('[data-tab="settings"]').click();
    await expect(settings(page)).toBeVisible();
    await shoot(page, 'settings');

    // Today's names still find every row (role + exact name), each one a round button.
    for (const name of [
      'Set your goal',
      'Camera test',
      'My gym',
      'Health',
      'Self-check',
      'Coach',
      'Reminders',
      'Plan changes',
      'To-dos',
      "What's new",
      'Test voice',
      'Back up',
      'Restore from a file',
      'About Gym Clean',
      'Show the welcome again',
    ]) {
      const b = settings(page).locator('.set-section').getByRole('button', { name, exact: true });
      await expect(b, name).toHaveCount(1);
      await expect(b, name).toHaveAttribute('data-icon-btn', '');
    }
    // Choices and switches stay as they were: not round buttons.
    for (const sel of [
      '[data-unit]',
      '[data-text-size-option]',
      '[data-accent-option]',
      '[role="switch"]',
      '[data-coach-persona]',
    ]) {
      const n = await settings(page).locator(`${sel}[data-icon-btn]`).count();
      expect(n, sel).toBe(0);
    }

    const words = await roundButtons(page, 'main[data-screen="settings"]');
    expect(words).toEqual(expect.arrayContaining(['Camera test', 'My gym', 'About Gym Clean']));
    await expectTapTargets(page, 'main[data-screen="settings"]');
    await noHorizontalOverflow(page);

    // A lower part of the page (voice, camera, units) for the after shot.
    await settings(page).locator('[data-section="camera"]').scrollIntoViewIfNeeded();
    await shoot(page, 'settings-lower');

    // Keyboard focus rings the circle, not the whole row.
    const camera = settings(page).getByRole('button', { name: 'Camera test', exact: true });
    await camera.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await camera.evaluate((el) => {
      const c = getComputedStyle(el.querySelector('.icon-btn-circle') as HTMLElement);
      return { style: c.outlineStyle, width: parseFloat(c.outlineWidth) };
    });
    expect(ring.style).toBe('solid');
    expect(ring.width).toBeGreaterThanOrEqual(2);

    // Self-check: Run again (main pill) + Copy results.
    await settings(page).getByRole('button', { name: 'Self-check', exact: true }).click();
    const check = page.locator('main[data-screen="selfcheck"]');
    await expect(check.locator('[data-selfcheck-again]')).toBeEnabled({ timeout: 20_000 });
    expect(await roundButtons(page, 'main[data-screen="selfcheck"]')).toEqual(
      expect.arrayContaining(['Run again', 'Copy results']),
    );
    await expect(check.locator('[data-selfcheck-again]')).toHaveAttribute('data-variant', 'main');
    await noHorizontalOverflow(page);
    await check.locator('[data-selfcheck-copy]').scrollIntoViewIfNeeded();
    await shoot(page, 'self-check');

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    // MediaPipe's usage-log fetch (the Self-check loads the pose engine) is blocked by our CSP on
    // purpose (Decisions, M3 privacy); that block is logged as an error (as in self-check.spec.ts).
    const USAGE_LOG = 'https://odml.pa.googleapis.com/v1/log';
    expect(errors.filter((e) => !e.includes(USAGE_LOG))).toEqual([]);
  },
);

test(
  "M13d 40d: To-dos, a to-do guide and What's New use round buttons (Next is the main pill)",
  { tag: '@m13d-flow' },
  async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openApp(page, at(16, 18));
    await todoReady(page);
    await page.locator('[data-tab="settings"]').click();

    // What's New (Settings → What's new): Skip, Back, Next as round buttons; Next → Done.
    await settings(page).getByRole('button', { name: "What's new", exact: true }).click();
    const tour = page.locator('[data-tour="whats-new"]');
    await expect(tour).toBeVisible();
    const next = tour.locator('[data-wn="next"]');
    // The replay shows the newest release's pages: one page → Done at once.
    const onePage = (await next.getAttribute('data-last')) === 'true';
    expect(await roundButtons(page, '[data-tour="whats-new"] .wn-nav')).toEqual([
      'Back',
      onePage ? 'Done' : 'Next',
    ]);
    await expect(tour.getByRole('button', { name: 'Skip', exact: true })).toBeVisible();
    await expect(next).toHaveAttribute('data-variant', 'main');
    await expect(next.locator(`[data-icon="${onePage ? 'check' : 'arrow-right'}"]`)).toHaveCount(1);
    await noHorizontalOverflow(page);
    await shoot(page, 'whats-new');
    while ((await next.getAttribute('data-last')) !== 'true') await next.click();
    await expect(next).toHaveText('Done');
    await expect(tour.locator('[data-wn="next"] [data-icon="check"]')).toHaveCount(1);
    await tour.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(tour).toHaveCount(0);

    // To-dos list: Copy report is the main pill; the topic rows stay rows.
    await settings(page).getByRole('button', { name: 'To-dos', exact: true }).click();
    const list = page.locator('main[data-screen="todos"]');
    await expect(list).toBeVisible();
    await expect(list.locator('[data-copy-report]')).toHaveAttribute('data-variant', 'main');
    await expect(list.locator('.todo-row-btn[data-icon-btn]')).toHaveCount(0);
    // The list redraws once its facts load: retry the scroll on the current element.
    await expect(async () => {
      await list.locator('[data-copy-report]').scrollIntoViewIfNeeded({ timeout: 1000 });
    }).toPass();
    expect(await roundButtons(page, 'main[data-screen="todos"]')).toContain('Copy report');
    await noHorizontalOverflow(page);
    await shoot(page, 'todos');

    // A guide: Back (circle) + Next (main pill), Skip this topic (quiet), two taps.
    await list.locator('[data-todo-topic] button').first().click();
    const guide = page.locator('main[data-screen="todo-guide"]');
    await expect(guide).toBeVisible();
    const words = await roundButtons(page, 'main[data-screen="todo-guide"] .todo-nav');
    expect(words).toEqual(['Back', 'Next']);
    await expect(guide.locator('[data-guide-next]')).toHaveAttribute('data-variant', 'main');
    await expect(guide.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
    await expect(guide.getByRole('button', { name: 'Skip this topic' })).toBeVisible();
    await noHorizontalOverflow(page);
    await guide.locator('[data-skip-topic]').scrollIntoViewIfNeeded();
    await shoot(page, 'todo-guide');
    const skip = guide.locator('[data-skip-topic]');
    await skip.click();
    await expect(skip).toHaveAttribute('data-armed', 'true');
    await expect(skip).toHaveText('Tap again to skip');
    await expect(guide.getByRole('button', { name: 'Tap again to skip' })).toBeVisible();

    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  },
);

test('M13d 40d: Reduce Motion keeps the press to a colour change on Settings', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page, at(16, 18));
  await page.locator('[data-tab="settings"]').click();
  const b = settings(page).getByRole('button', { name: 'Camera test', exact: true });
  const box = await b.boundingBox();
  if (!box) throw new Error('no Camera test box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const t = await b.evaluate(
    (el) => getComputedStyle(el.querySelector('.icon-btn-circle') as HTMLElement).transform,
  );
  // Release off the button, so nothing opens.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
});
