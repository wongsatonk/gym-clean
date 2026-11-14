import { expect, test, type Page } from '@playwright/test';

/**
 * M6 History screen (src/ui/screens/history.ts), mounted from the real module. The harness
 * plays app.ts's part: it holds the props, opens an exercise's detail on `onOpenExercise` and
 * goes back on `onBack`. History is read at rest, so it must speak nothing.
 * HISTORY_SHOTS=<dir> also saves 390×844 screenshots (list / detail / bodyweight / empty, per
 * accent) for review.
 */

declare global {
  interface Window {
    __calls: string[];
    __spoken: string[];
    __mountHistory: (mode: string, accent: string) => void;
  }
}

const D = (day: number) => new Date(2026, 10, day, 18, 0).getTime();

async function setup(page: Page): Promise<void> {
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
  });
  await page.goto('/');
  const today = D(13) + 60 * 60_000; // Fri 13 Nov, after the workout
  await page.evaluate(
    async ([now, d13, d11, d9, d6, d2]) => {
      const history = await import('/src/ui/screens/history.ts' as string);
      const core = await import('/src/core/history.ts' as string);
      const tokens = await import('/src/ui/tokens.ts' as string);
      // Real set logs through the real core selectors: the wiring main does in app.ts.
      type Log = Record<string, unknown>;
      const logs: Log[] = [];
      const sessions: { sessionId: string; dayId: string; startedAt: number; endedAt: number }[] =
        [];
      const session = (
        sessionId: string,
        dayId: string,
        start: number,
        min: number,
        blocks: [string, [number, number][], number | null][],
      ) => {
        sessions.push({ sessionId, dayId, startedAt: start, endedAt: start + min * 60_000 });
        let t = start;
        for (const [exerciseId, sets, focus] of blocks)
          sets.forEach(([reps, weightKg], setIndex) => {
            t += 90_000;
            logs.push({
              sessionId,
              exerciseId,
              setIndex,
              reps,
              weightKg,
              restTakenSec: 90,
              startedAt: t,
              endedAt: t + 40_000,
              ...(focus === null ? {} : { focusScore: focus }),
            });
          });
      };
      const x = (n: number, reps: number, kg: number): [number, number][] =>
        Array.from({ length: n }, () => [reps, kg]);
      session('s13', 'pullA', d13, 47, [
        [
          'row',
          [
            [12, 22.5],
            [10, 22.5],
            [10, 22.5],
          ],
          88,
        ],
      ]);
      session('s11', 'pushA', d11, 40, [
        [
          'pu',
          [
            [15, 0],
            [12, 0],
            [11, 0],
          ],
          90,
        ],
      ]);
      session('s9', 'legsA', d9, 55, [
        [
          'row',
          [
            [10, 22.5],
            [10, 22.5],
            [9, 22.5],
          ],
          81,
        ],
        ['curl', x(2, 10, 12.5), null],
        ['goblet', x(5, 12, 30), null],
      ]);
      session('s6', 'pullA', d6, 45, [
        [
          'row',
          [
            [12, 20],
            [10, 20],
            [10, 20],
          ],
          null,
        ],
        [
          'pu',
          [
            [14, 0],
            [12, 0],
            [10, 0],
          ],
          null,
        ],
      ]);
      session('s2', 'pushA', d2, 44, [
        [
          'row',
          [
            [10, 20],
            [10, 20],
            [8, 20],
          ],
          null,
        ],
        [
          'pu',
          [
            [12, 0],
            [10, 0],
            [9, 0],
          ],
          null,
        ],
      ]);
      const sets = core.finishedSets(sessions, logs);
      const ids: string[] = core.exercisesWithHistory(sets, now);
      const NAMES: Record<string, string> = {
        row: 'Dumbbell Bent-Over Row',
        pu: 'Push-up',
        curl: 'Hammer Curls',
        goblet: 'Goblet Squat',
        pullA: 'Pull A',
        pushA: 'Push A',
        legsA: 'Legs A',
      };
      const name = (id: string) => NAMES[id] ?? id;
      const base = {
        unit: 'kg',
        days: core.lastDays(sessions, sets, now),
        exercises: ids.map((id) => core.exerciseHistory(sets, id, now)),
        dayName: name,
        name,
      };
      window.__mountHistory = (mode: string, accent: string) => {
        window.__calls = [];
        tokens.applyAccent(accent);
        const open = (id: string) => core.exerciseHistory(sets, id, now);
        let detail: unknown =
          mode === 'detail' ? open('row') : mode === 'bodyweight' ? open('pu') : null;
        const props =
          mode === 'empty'
            ? { ...base, days: [], exercises: [] }
            : mode === 'loading'
              ? { ...base, days: [], exercises: [], loading: true }
              : mode === 'error'
                ? { ...base, days: [], exercises: [], error: true }
                : base;
        const render = () =>
          document.body.replaceChildren(
            history.historyScreen(
              { ...props, detail },
              {
                onOpenExercise: (id: string) => {
                  window.__calls.push(`open:${id}`);
                  detail = open(id);
                  render();
                },
                onBack: () => {
                  window.__calls.push('back');
                  detail = null;
                  render();
                },
                onTab: (t: string) => window.__calls.push(`tab:${t}`),
              },
            ),
          );
        render();
        window.scrollTo(0, 0);
      };
    },
    [today, D(13), D(11), D(9), D(6), D(2)] as const,
  );
}

const mount = async (page: Page, mode = 'list', accent = 'orange') => {
  await page.evaluate(([m, a]) => window.__mountHistory(m as string, a as string), [mode, accent]);
  await expect(page.locator('main[data-screen="history"]')).toBeVisible();
};

/** Overflow, ≥ 56px targets, ≥ 20px text (tab labels are the 18px bend), main numbers ≥ 64px. */
async function checkGymRules(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => ({ t: (b.textContent ?? '').trim(), r: b.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 56 || x.r.width < 56))
      .map((x) => `${x.t} ${x.r.width}×${x.r.height}`),
  );
  expect(small).toEqual([]);
  const tiny = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('main.history *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own || (el as HTMLElement).offsetParent === null || el.closest('.tab')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 20) out.push(`${el.className || el.tagName}: ${px}`);
    }
    return out;
  });
  expect(tiny).toEqual([]);
  const mainNums = await page.evaluate(() =>
    [...document.querySelectorAll('.hist-stat-value, .hist-best-num')].map((e) =>
      parseFloat(getComputedStyle(e).fontSize),
    ),
  );
  for (const px of mainNums) expect(px).toBeGreaterThanOrEqual(64);
  // Nothing overflows its own box sideways either (long names, big numbers).
  const clipped = await page.evaluate(() =>
    [...document.querySelectorAll('main.history *')]
      .filter((e) => e.getBoundingClientRect().right > 390.5)
      .map((e) => e.className || e.tagName),
  );
  expect(clipped).toEqual([]);
}

async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env['HISTORY_SHOTS'];
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await setup(page);
});

test('History list: 7-day scoreboard, sessions, exercises; gym rules; speaks nothing', async ({
  page,
}) => {
  await mount(page);
  await checkGymRules(page);
  await expect(page.locator('[data-week-stat="sessions"] .hist-stat-value')).toHaveText('3');
  await expect(page.locator('[data-week-stat="volume"] .hist-stat-value')).toHaveText('3,423');
  await expect(page.locator('[data-history-day]')).toHaveCount(3);
  await expect(page.locator('[data-history-exercise]')).toHaveCount(4);
  await expect(page.locator('[data-tab="history"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-tab]')).toHaveCount(3);
  // The tab bar doesn't cover the last exercise once scrolled to the bottom.
  await page.locator('[data-history-exercise]').last().scrollIntoViewIfNeeded();
  const [row, bar] = await Promise.all([
    page.locator('[data-history-exercise]').last().boundingBox(),
    page.locator('.tabbar').boundingBox(),
  ]);
  expect((row?.y ?? 0) + (row?.height ?? 0)).toBeLessThanOrEqual((bar?.y ?? 0) + 1);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('History: open an exercise, read its trend in text, go back; tabs call back', async ({
  page,
}) => {
  await mount(page);
  await page.locator('[data-history-exercise="row"]').click();
  await expect(page.locator('main[data-view="detail"]')).toBeVisible();
  await checkGymRules(page);
  await expect(page.locator('h1')).toHaveText('Dumbbell Bent-Over Row');
  await expect(page.locator('[data-best] .hist-best-num')).toHaveText('12 × 22.5');
  await expect(page.locator('[data-trend] rect')).toHaveCount(4);
  await expect(page.locator('[data-trend-end="latest"]')).toContainText('720 kg');
  await expect(page.locator('[data-trend-change]')).toHaveText('Volume +29% over 4 weeks');
  await expect(page.locator('[data-trend-focus]')).toHaveText('Average focus 85');
  await expect(page.locator('[data-history-session]')).toHaveCount(4);
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(page.locator('main[data-view="list"]')).toBeVisible();
  await page.locator('[data-tab="settings"]').click();
  expect(await page.evaluate(() => window.__calls)).toEqual(['open:row', 'back', 'tab:settings']);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('History: bodyweight exercise trends on reps', async ({ page }) => {
  await mount(page, 'bodyweight');
  await checkGymRules(page);
  await expect(page.locator('[data-trend]')).toHaveAttribute('data-metric', 'reps');
  await expect(page.locator('[data-best] .hist-best-num')).toHaveText('15');
  await expect(page.locator('[data-trend-change]')).toHaveText('+7 reps over 4 weeks');
  await expect(page.locator('[data-history-session]').first()).toContainText('15, 12, 11 reps');
});

test('History: empty state points to Today', async ({ page }) => {
  await mount(page, 'empty');
  await checkGymRules(page);
  await expect(page.locator('[data-history-empty="none"]')).toContainText('No workouts yet');
  await page.getByRole('button', { name: 'Go to Today' }).click();
  expect(await page.evaluate(() => window.__calls)).toEqual(['tab:today']);
});

test('History: loading shows a neutral card, a failed load says so; never the empty state', async ({
  page,
}) => {
  await mount(page, 'loading');
  await checkGymRules(page);
  await expect(page.locator('[data-history-state="loading"]')).toHaveText('Loading…');
  await expect(page.locator('[data-history-empty]')).toHaveCount(0);
  await mount(page, 'error');
  await checkGymRules(page);
  await expect(page.locator('[data-history-state="error"]')).toContainText("Couldn't load history");
  await expect(page.locator('[data-history-empty]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go to Today' }).click();
  expect(await page.evaluate(() => window.__calls)).toEqual(['tab:today']);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('History screenshots in every accent (HISTORY_SHOTS)', async ({ page }) => {
  test.skip(!process.env['HISTORY_SHOTS'], 'set HISTORY_SHOTS=<dir> to save screenshots');
  for (const accent of ['orange', 'volt', 'yellow']) {
    for (const mode of ['list', 'detail', 'bodyweight', 'empty', 'loading', 'error']) {
      await mount(page, mode, accent);
      await checkGymRules(page);
      await shoot(page, `history-${mode}-${accent}`);
    }
  }
});
