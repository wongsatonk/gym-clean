import { expect, test, type Page } from './fixtures';
import { animationsSettled, at, expectTapTargets, openApp, record } from './app.helpers';

/**
 * M12 task 14: Today's missed-day card and first-load motion, and the rest screen's set ring,
 * mounted from the real modules (today.ts, rest.ts) with made-up data. The harness plays
 * app.ts's part: it keeps one `createTodayMotion()` across re-renders and records callbacks.
 * Nothing here is spoken: the missed-day card is shown on Today only (he's holding the phone),
 * so the test asserts speechSynthesis.speak is never called.
 *
 * M12_SHOTS=1 also saves 390×844 screenshots to docs/screenshots/m12-today-*.png and
 * docs/screenshots/m12-rest-set-ring.png.
 *
 * M13d task 40c: Today's buttons are round (iconButton): Start the 72px main circle + word in a
 * wide pill, the cards' actions 56px circles with their words. BUTTONS_AFTER_SHOT=1 saves
 * docs/screenshots/m13d-buttons-after-today.png (the real app) and
 * m13d-buttons-after-today-cards.png (this harness, both notices open).
 */

declare global {
  interface Window {
    __calls: string[];
    __spoken: string[];
    __rerender: () => void;
  }
}

const NOW = new Date(2026, 10, 13, 18, 0).getTime(); // Fri 13 Nov 2026

async function stubs(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        paused: false,
        speak: (u: { text: string }) => window.__spoken.push(u.text),
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ release: async () => undefined }) },
    });
  });
}

async function mountToday(
  page: Page,
  opts: { readiness?: boolean; missedAction?: 'move' | 'start' } = {},
): Promise<void> {
  await stubs(page);
  await page.goto('/');
  await page.evaluate(
    async ({ now, readiness, missedAction }) => {
      const today = await import('/src/ui/screens/today.ts' as string);
      const catalog = await import('/src/data/catalog.ts' as string);
      const days = catalog.program.days as { id: string; name: string }[];
      const push = days.find((d) => d.name === 'Push A') ?? days[0];
      const pull = days.find((d) => d.name === 'Pull A') ?? days[1];
      window.__calls = [];
      const motion = today.createTodayMotion();
      const dayAt = (i: number) => new Date(2026, 10, 9 + i).getTime();
      const state = {
        missed: { date: '2026-11-10', dayId: push?.id, name: push?.name } as unknown,
      };
      const render = () => {
        const el = today.todayScreen(
          {
            now,
            days,
            upNextDayId: pull?.id ?? null,
            streakWeeks: 6,
            weekDots: [
              { dayStart: dayAt(0), state: 'done' },
              { dayStart: dayAt(1), state: 'rest' },
              { dayStart: dayAt(2), state: 'done' },
              { dayStart: dayAt(3), state: 'rest' },
              { dayStart: dayAt(4), state: 'today' },
              { dayStart: dayAt(5), state: 'future' },
              { dayStart: dayAt(6), state: 'future' },
            ],
            last: {
              dayName: 'Legs A',
              date: new Date(2026, 10, 11, 18).getTime(),
              durationMs: 48 * 60000,
              volumeKg: 5400,
              volumeVsLast: 4,
            },
            unit: 'kg',
            missedDay: state.missed,
            missedAction,
            motion,
            readiness: readiness
              ? {
                  date: '2026-11-13',
                  signals: [],
                  reasons: ['Short sleep last night (5 h 40 min).'],
                  offer: 'lighter',
                }
              : null,
          },
          {
            onStart: (d: { id: string }) => window.__calls.push(`start:${d.id}`),
            onOpenDay: (d: { id: string }) => window.__calls.push(`open:${d.id}`),
            onTab: (t: string) => window.__calls.push(`tab:${t}`),
            onCoach: () => window.__calls.push('coach'),
            onLighterToday: () => window.__calls.push('lighter'),
            onNotToday: () => window.__calls.push('notToday'),
            onTrainAsPlanned: () => window.__calls.push('keep'),
            onMoveMissed: (m: { date: string }) => {
              window.__calls.push(`move:${m.date}`);
              state.missed = null;
              render();
            },
            onStartMissed: (m: { date: string }) => {
              window.__calls.push(`startMissed:${m.date}`);
              state.missed = null;
              render();
            },
            onSkipMissed: (m: { date: string }) => {
              window.__calls.push(`skip:${m.date}`);
              state.missed = null;
              render();
            },
          },
        );
        document.body.replaceChildren(el);
      };
      window.__rerender = render;
      render();
    },
    { now: NOW, readiness: opts.readiness ?? false, missedAction: opts.missedAction ?? 'move' },
  );
  await expect(page.locator('main.today')).toBeVisible();
}

const calls = (page: Page) => page.evaluate(() => window.__calls);
const shots = !!process.env['M12_SHOTS'];
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  // Let the entrance land first (the screenshot shows the settled screen).
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.constructor === Animation)
        .map((a) => a.finished),
    ),
  );
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
};

test('Today at 390×844: the missed-day card, readable, big targets, no overflow, not spoken', async ({
  page,
}) => {
  await mountToday(page);
  const card = page.locator('[data-missed-day="2026-11-10"]');
  await expect(card).toHaveText(/You missed Push A on Tue\./);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  for (const sel of ['[data-missed-move]', '[data-missed-skip]']) {
    const box = await page.locator(sel).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  }
  // A rotation miss: Start it in the same place, the same size.
  await mountToday(page, { missedAction: 'start' });
  await expect(page.locator('[data-missed-move]')).toHaveCount(0);
  const start = await page.locator('[data-missed-start]').boundingBox();
  expect(start?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const sizes = await card.evaluate((c) =>
    [...c.querySelectorAll('p, button')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
  );
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(20);
  // The streak counts up and lands on its value.
  await expect(page.locator('[data-streak-num]')).toHaveText('6');
  await shot(page, 'm12-today-missed');
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('Move it passes the missed day out and the card goes away; Skip it and Start it likewise', async ({
  page,
}) => {
  await mountToday(page);
  await page.getByRole('button', { name: 'Move it' }).click();
  expect(await calls(page)).toEqual(['move:2026-11-10']);
  await expect(page.locator('[data-missed-day]')).toHaveCount(0);

  await mountToday(page);
  await page.getByRole('button', { name: 'Skip it' }).click();
  expect(await calls(page)).toEqual(['skip:2026-11-10']);
  await expect(page.locator('[data-missed-day]')).toHaveCount(0);

  // A rotation miss offers Start it (no Move it): it passes the missed day out the same way.
  await mountToday(page, { missedAction: 'start' });
  await expect(page.getByRole('button', { name: 'Move it' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Start it' }).click();
  expect(await calls(page)).toEqual(['startMissed:2026-11-10']);
  await expect(page.locator('[data-missed-day]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('with the readiness card too (M13): Start first, both cards in one "2 things to sort" row', async ({
  page,
}) => {
  await mountToday(page, { readiness: true });
  await expect(page.getByRole('button', { name: 'Start workout' })).toBeInViewport({ ratio: 1 });
  const toggle = page.locator('[data-notices="2"] [data-notices-toggle]');
  await expect(toggle).toContainText('2 things to sort');
  await expect(page.locator('[data-readiness="lighter"]')).toBeHidden();
  await toggle.click();
  await expect(page.locator('[data-readiness="lighter"]')).toBeVisible();
  await expect(page.locator('[data-missed-day]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('[data-missed-day], [data-readiness], [data-hero]')].map((e) =>
      (e as HTMLElement).dataset['missedDay']
        ? 'missed'
        : e.hasAttribute('data-hero')
          ? 'hero'
          : 'readiness',
    ),
  );
  expect(order).toEqual(['hero', 'readiness', 'missed']);
  await shot(page, 'm12-today-missed-readiness');
});

test('first load animates once; a re-render plays nothing', async ({ page }) => {
  await mountToday(page);
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.constructor === Animation).length,
    ),
  ).toBeGreaterThan(3);
  await expect(page.locator('[data-streak-num]')).toHaveText('6');
  await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.constructor === Animation)
      .forEach((a) => a.finish()),
  );
  await page.evaluate(() => window.__rerender());
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.constructor === Animation).length,
    ),
  ).toBe(0);
  await expect(page.locator('[data-streak-num]')).toHaveText('6');
});

test('reduced motion: no animations, the streak shows its final number at once', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountToday(page, { readiness: true });
  expect(
    await page.evaluate(
      () => document.getAnimations().filter((a) => a.constructor === Animation).length,
    ),
  ).toBe(0);
  await expect(page.locator('[data-streak-num]')).toHaveText('6', { timeout: 50 });
});

test('rest screen: the set ring fills to the set just logged, words unchanged', async ({
  page,
}) => {
  await stubs(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const rest = await import('/src/ui/screens/rest.ts' as string);
    const fig = document.createElement('div');
    const view = rest.restScreen(
      {
        dayName: 'Pull A',
        exIndex: 1,
        exTotal: 5,
        remainingMs: 74_000,
        targetMs: 90_000,
        exerciseId: 'One-Arm_Dumbbell_Row',
        name: 'One-Arm Dumbbell Row',
        setIndex: 2,
        sets: 4,
        reps: 10,
        weightText: '22.5',
        unit: 'kg',
        cue: 'Elbow to hip.',
        figure: fig,
        hasNotes: false,
      },
      {
        onList: () => undefined,
        onPause: () => undefined,
        onExtend: () => undefined,
        onNotes: () => undefined,
        onStartSet: () => undefined,
      },
    );
    document.body.replaceChildren(view.el);
  });
  const ring = page.locator('[data-set-ring]');
  await expect(ring).toHaveAttribute('data-done', '2');
  await expect(page.locator('.rest-eyebrow')).toHaveText('Next · Set 3 of 4');
  await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.constructor === Animation)
      .forEach((a) => a.finish()),
  );
  expect(
    await page.locator('.set-ring-fg').evaluate((e) => getComputedStyle(e).strokeDashoffset),
  ).toBe('50px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await shot(page, 'm12-rest-set-ring');
});

// ---------- M13d task 40c: the round buttons on Today ----------

/** Box of the circle inside a round button, and of the whole button. */
const roundBoxes = (page: Page, sel: string) =>
  page.locator(sel).evaluate((b) => {
    const c = b.querySelector('.icon-btn-circle') as HTMLElement;
    const cb = c.getBoundingClientRect();
    const bb = b.getBoundingClientRect();
    return {
      variant: b.getAttribute('data-variant'),
      circle: { w: cb.width, h: cb.height, radius: getComputedStyle(c).borderRadius },
      button: { w: bb.width, h: bb.height },
      word: b.querySelector('.icon-btn-label')?.textContent ?? '',
      fill: getComputedStyle(c).backgroundColor,
    };
  });

test("M13d 40c: Start is the round main button in its pill, the cards' actions round with their words", async ({
  page,
}) => {
  await mountToday(page, { readiness: true });
  const start = page.getByRole('button', { name: 'Start workout' });
  await expect(start).toBeInViewport({ ratio: 1 });
  const s = await roundBoxes(page, '[data-start]');
  expect(s.variant).toBe('main');
  expect(s.word).toBe('Start workout');
  expect(s.circle.w).toBeGreaterThanOrEqual(72);
  expect(s.circle.h).toBeGreaterThanOrEqual(72);
  expect(s.circle.radius).toBe('50%');
  expect(s.button.w).toBeGreaterThan(300); // the whole row stays the tap area
  expect(s.button.h).toBeGreaterThanOrEqual(72);

  await page.locator('[data-notices-toggle]').click();
  for (const sel of [
    '[data-missed-move]',
    '[data-missed-skip]',
    '[data-readiness-lighter]',
    '[data-readiness-postpone]',
    '[data-readiness-keep]',
  ]) {
    const b = await roundBoxes(page, sel);
    expect(b.variant, sel).toBe('secondary');
    expect(b.word.length, sel).toBeGreaterThan(0);
    expect(b.circle.w, sel).toBeGreaterThanOrEqual(56);
    expect(b.circle.radius, sel).toBe('50%');
    // Follow-up (u): never under 56px, whatever the load.
    expect(b.button.h, sel).toBeGreaterThanOrEqual(56);
    expect(b.button.w, sel).toBeGreaterThanOrEqual(56);
  }
  // Only Start's circle is filled orange.
  const fills = await page
    .locator('[data-icon-btn][data-variant="main"]')
    .evaluateAll((els) => els.map((e) => e.textContent?.trim()));
  expect(fills).toEqual(['Start workout']);
  // The accessible names did not change.
  await expect(page.getByRole('button', { name: 'Move it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip it' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lighter today', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expectTapTargets(page, 'main.today');
  if (process.env['BUTTONS_AFTER_SHOT']) {
    await animationsSettled(page);
    await page.screenshot({ path: 'docs/screenshots/m13d-buttons-after-today-cards.png' });
  }
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test("M13d 40c: the real app's Today at 390×844: round Start in the first viewport, no overflow", async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  const start = page.locator('main[data-screen="today"] [data-start]').first();
  await expect(start).toBeInViewport({ ratio: 1 });
  await expect(start).toHaveAttribute('data-variant', 'main');
  await expect(start).toHaveAccessibleName('Start workout');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expectTapTargets(page, 'main[data-screen="today"]');
  if (process.env['BUTTONS_AFTER_SHOT']) {
    await animationsSettled(page);
    await page.screenshot({ path: 'docs/screenshots/m13d-buttons-after-today.png' });
  }
  expect(errors).toEqual([]);
});
