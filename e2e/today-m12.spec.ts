import { expect, test, type Page } from '@playwright/test';

/**
 * M12 task 14: Today's missed-day card and first-load motion, and the rest screen's set ring,
 * mounted from the real modules (today.ts, rest.ts) with made-up data. The harness plays
 * app.ts's part: it keeps one `createTodayMotion()` across re-renders and records callbacks.
 * Nothing here is spoken: the missed-day card is shown on Today only (he's holding the phone),
 * so the test asserts speechSynthesis.speak is never called.
 *
 * M12_SHOTS=1 also saves 390×844 screenshots to docs/screenshots/m12-today-*.png and
 * docs/screenshots/m12-rest-set-ring.png.
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

test('with the readiness card too: still fits, both cards above the hero', async ({ page }) => {
  await mountToday(page, { readiness: true });
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
  expect(order).toEqual(['missed', 'readiness', 'hero']);
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
