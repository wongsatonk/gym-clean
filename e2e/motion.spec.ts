// M12 task 18: motion across the app (SPEC M12 goal 9) in the real app at 390×844.
// With motion allowed, a tab switch plays its short entrance (so the checks below can fail),
// and the Exercise screen gets no new motion during a set. Under prefers-reduced-motion:
// reduce (Playwright's emulation), nothing animates or transitions: tab switches, the Pause
// sheet, the coach chat (bubbles, typing), the Calendar's numbers (shown final) — instant swaps.
// No request leaves the dev server (route-asserted); nothing here is spoken except the
// workout's own cues.
import { expect, test, type Page } from './fixtures';
import { at, coachTab, guardNetwork, noHorizontalOverflow, openApp, record } from './app.helpers';
import { openPause } from './workout.helpers';

/** Every animation in the document (CSS + Web Animations), as "target: name/state". */
function animations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document.getAnimations().map((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const name = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty;
      return `${t?.className || t?.tagName || '?'}: ${name ?? 'web'}/${a.playState}`;
    }),
  );
}

/** Animations whose target is inside `selector`. */
function animationsIn(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (sel) =>
      document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
          return t?.closest(sel) != null;
        })
        .map((a) => `${(a as CSSAnimation).animationName ?? 'web'}/${a.playState}`),
    selector,
  );
}

test.describe('motion allowed', () => {
  test('a tab switch plays its entrance; the Exercise screen gets no new motion', async ({
    page,
  }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openApp(page, at(13, 18));

    // Proof the checks can see motion: switching tabs animates (screen entrance / indicator).
    await page.locator('[data-tab="calendar"]').click();
    await expect(page.locator('main[data-screen="calendar"]')).toBeVisible();
    expect((await animations(page)).length).toBeGreaterThan(0);
    await page.locator('[data-tab="today"]').click();

    // The Exercise screen: no entrance, no press transition, nothing running inside it.
    await page.locator('[data-hero="push-a"] [data-start]').click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    const ex = page.locator('[data-screen="exercise"]');
    await expect(ex).toBeVisible();
    expect(await animationsIn(page, '[data-screen="exercise"]')).toEqual([]);
    // Every button, Set done included (a round main button since M13d: on this motion-off screen
    // its press is a colour change only, iconButton.css), has no press transition.
    const durations = await ex
      .locator('button')
      .evaluateAll((els) =>
        els.map((e) => [e.textContent?.trim() ?? '', getComputedStyle(e).transitionDuration]),
      );
    expect(durations.length).toBeGreaterThan(3);
    for (const [name, d] of durations)
      expect(
        (d ?? '').split(',').every((x) => parseFloat(x) === 0),
        `button "${name}"`,
      ).toBe(true);
    // Pause → Resume: back on the set, still nothing new moving on it.
    await openPause(page);
    await page
      .getByRole('dialog', { name: 'Paused' })
      .getByRole('button', { name: 'Resume' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
    expect(await animationsIn(page, '[data-screen="exercise"]')).toEqual([]);

    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('tab switches, the Pause sheet and the chat are instant swaps; numbers show final', async ({
    page,
  }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await openApp(page, at(13, 18));
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    expect(await animations(page)).toEqual([]);

    // Every tab, both directions: nothing animates, the indicator jumps.
    for (const tab of ['fuel', 'coach', 'calendar', 'settings', 'today', 'calendar'] as const) {
      await page.locator(`[data-tab="${tab}"]`).click();
      await expect(page.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-current', 'page');
      expect(await animations(page), `after ${tab}`).toEqual([]);
    }
    // Calendar scores: the final numbers at once (no count-up).
    await expect(page.locator('[data-score="week"] .cal-score-num')).toHaveText(
      /^(\d+ of \d+|\d+|–)$/,
    );
    // Buttons have no press transition.
    const transitions = await page
      .locator('[data-tabbar] button')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration));
    for (const d of transitions) expect(parseFloat(d)).toBe(0);

    // The chat: his bubble, the typing indicator and the reply appear without motion.
    await page.locator('[data-tab="coach"]').click();
    await coachTab(page).locator('[data-coach-starter="week"]').click();
    await expect(coachTab(page).locator('.cs-msg-coach')).toHaveCount(1);
    expect(await animations(page)).toEqual([]);
    await coachTab(page).locator('[data-coach-chip="notToday"]').click();
    await coachTab(page).locator('[data-proposal]').getByRole('button', { name: 'Apply' }).click();
    await expect(coachTab(page).locator('[data-card-status="applied"]')).toBeVisible();
    expect(await animations(page)).toEqual([]); // no check morph
    await coachTab(page).getByRole('button', { name: 'Undo' }).click();
    await expect(coachTab(page).locator('[data-card-status="undone"]')).toBeVisible();
    expect(await animations(page)).toEqual([]);
    await noHorizontalOverflow(page);

    // Sheets: the Pause sheet and its coach chat appear without sliding or fading.
    await page.locator('[data-tab="today"]').click();
    await page.locator('[data-hero="push-a"] [data-start]').click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
    expect(await animations(page)).toEqual([]);
    await openPause(page);
    expect(await animations(page)).toEqual([]);
    await page.locator('[data-pause="coach"]').click();
    const sheet = page.getByRole('dialog', { name: 'Coach' });
    await expect(sheet).toBeVisible();
    expect(await animations(page)).toEqual([]);
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    expect(await animations(page)).toEqual([]);

    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
});
