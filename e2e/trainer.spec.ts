// M10 phase A, end to end in the real app (SPEC M10 "Accept", phase A E2E list): the coach sheet
// on Today / the preview / the Pause sheet, Apply → Undo, the calendar (Not today, rest day,
// Train anyway), Lighter today in lb, a mid-workout swap, a mid-workout removal + Undo, a stall on Summary from seeded history,
// a red flag, Plan changes with Reset + Undo, and the plan surviving a reload.
// Replies on Today and the preview are shown, not spoken; a change applied mid-workout is spoken
// once as a short cue. No text box on the Exercise screen during a set; no off-device request.
import { expect, test, type Page } from '@playwright/test';
import { openPause, endWorkout, leaveSettings } from './workout.helpers';

declare global {
  interface Window {
    __spoken: string[];
  }
}

const REFERRAL = "If something doesn't feel right, check with a doctor or physio.";
const RED_FLAG = 'Stop the workout for today and get checked by a doctor.';
const MIN = 60_000;
/**
 * Local times. Fri 13 Nov 2026 and Sun 15 Nov are both training days by default (M10-q1: no fixed
 * rest days); the rest-day tests store Sunday as a rest weekday with `setRestWeekdays`.
 */
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      voice = null;
      pitch = 1;
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
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
        speaking: false,
        pending: false,
        paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ addEventListener: () => undefined, release: async () => {} }),
      },
    });
  });
}

function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

function offDevice(requests: readonly string[], baseURL: string | undefined): string[] {
  const origin = new URL(baseURL ?? 'https://localhost').origin;
  return requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    return new URL(u).origin !== origin;
  });
}

type SessionSeed = { sessionId: string; dayId: string; startedAt: number; endedAt?: number };
type SetSeed = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  startedAt: number;
};

/** Writes sessions and sets into the app's IndexedDB once Dexie has created it, then reloads. */
async function seed(page: Page, sessions: SessionSeed[], sets: SetSeed[]) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ sessions, sets }) =>
          new Promise<boolean>((resolve) => {
            void indexedDB.databases().then((dbs) => {
              if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
              const open = indexedDB.open('gym-clean');
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains('sessions')) {
                  d.close();
                  return resolve(false);
                }
                const tx = d.transaction(['sessions', 'sets'], 'readwrite');
                for (const s of sessions)
                  tx.objectStore('sessions').put({
                    ...s,
                    setsDone: sets.filter((l) => l.sessionId === s.sessionId).length,
                    totalVolumeKg: 0,
                    restOverruns: 0,
                  });
                for (const l of sets)
                  tx.objectStore('sets').put({
                    ...l,
                    restTakenSec: 90,
                    endedAt: l.startedAt + 40_000,
                  });
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
        { sessions, sets },
      ),
    )
    .toBe(true);
  await page.reload();
}

/**
 * Sets the stored trainer state's rest weekdays (0 = Sunday) once the app has seeded it, then
 * reloads. The plan itself stays the app's own seed.
 */
async function setRestWeekdays(page: Page, restWeekdays: number[]) {
  await expect
    .poll(() =>
      page.evaluate(
        (restWeekdays) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('gym-clean');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const d = open.result;
              if (!d.objectStoreNames.contains('trainer')) {
                d.close();
                return resolve(false);
              }
              const tx = d.transaction('trainer', 'readwrite');
              const store = tx.objectStore('trainer');
              const rq = store.get('current');
              let wrote = false;
              rq.onsuccess = () => {
                const row = rq.result as
                  { key: string; state: { schedule: { restWeekdays: number[] } } } | undefined;
                if (!row) return;
                row.state.schedule.restWeekdays = restWeekdays;
                store.put(row);
                wrote = true;
              };
              tx.oncomplete = () => {
                d.close();
                resolve(wrote);
              };
              tx.onerror = () => resolve(false);
            };
          }),
        restWeekdays,
      ),
    )
    .toBe(true);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

/** Opens the app at `time` and waits for Today's week strip. */
async function openApp(page: Page, time: number) {
  await installMocks(page);
  await page.clock.install({ time });
  await page.goto('/');
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

const coach = (page: Page) => page.getByRole('dialog', { name: 'Coach' });

async function openCoach(page: Page) {
  await page.locator('[data-coach-open]').click();
  await expect(coach(page)).toBeVisible();
}

/** Every visible button in `scope` is at least 56px tall (gym rule). */
async function expectTapTargets(page: Page, selector: string) {
  // evaluateAll doesn't wait: let the screen's buttons render first.
  await expect(page.locator(`${selector} button`).first()).toBeVisible();
  // Some screens render twice (e.g. Plan changes after its async list load), so the buttons can be
  // swapped out between the wait above and the measure. Retry until a laid-out set is measured.
  let heights: (readonly [string, number])[] = [];
  await expect
    .poll(async () => {
      heights = await page
        .locator(`${selector} button`)
        .evaluateAll((els) =>
          els
            .filter((e) => e.getClientRects().length > 0)
            .map((e) => [e.textContent?.trim() ?? '', e.getBoundingClientRect().height] as const),
        );
      return heights.length;
    })
    .toBeGreaterThan(0);
  for (const [name, hgt] of heights) expect(hgt, `button "${name}"`).toBeGreaterThanOrEqual(56);
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

test('Not today: the 7-day preview → Apply → Today rests, next day up → Undo restores it', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  // Sunday is a rest weekday here, so "use rest day" (the default mode) has one to use.
  await setRestWeekdays(page, [0]);
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await expect(page.locator('[data-cal="2026-11-15"]')).toHaveAttribute('data-rest');

  await openCoach(page);
  await expectTapTargets(page, '[data-coach-sheet]');
  await coach(page).locator('[data-coach-chip="notToday"]').click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Sunday becomes a training day');
  // The moved week, before → after, one row per changed date.
  await expect(card.locator('.proposal-row').first()).toBeVisible();
  await expect(card).toContainText('Push A');
  await expectTapTargets(page, '[data-coach-sheet]');
  await noHorizontalOverflow(page);
  await card.getByRole('button', { name: 'Apply' }).click();

  // Today rests; the strip moves the day; the confirmation offers Undo.
  await expect(coach(page)).toHaveCount(0);
  await expect(page.locator('[data-hero="rest"]')).toContainText('Rest day');
  await expect(page.locator('[data-hero="rest"]')).toContainText('Next up: Push A');
  await expect(page.locator('[data-adjusted]')).toContainText('Rest day (moved)');
  await expect(page.locator('[data-cal="2026-11-13"]')).toHaveAttribute('data-rest');
  await expect(page.locator('[data-cal="2026-11-14"]')).toHaveAttribute('data-day', 'push-a');
  // useRestDay: the week keeps every session, so Sunday trains instead of resting.
  await expect(page.locator('[data-cal="2026-11-15"]')).not.toHaveAttribute('data-rest');
  const toast = page.locator('[data-undo-toast]');
  await expect(toast).toBeVisible();
  await expectTapTargets(page, '[data-undo-toast]');

  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await expect(page.locator('[data-adjusted]')).toHaveCount(0);
  await expect(page.locator('[data-cal="2026-11-13"]')).toHaveAttribute('data-day', 'push-a');

  // Shown, not spoken, on Today.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('"my arms hurt": referral line + go-easy proposal → preview shows the changes → the workout runs them', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  // Push A done yesterday: today is Pull A (two curls, rows and pulldowns).
  await seed(
    page,
    [
      {
        sessionId: 's-push',
        dayId: 'push-a',
        startedAt: at(12, 18),
        endedAt: at(12, 18) + 50 * MIN,
      },
    ],
    [],
  );
  await expect(page.locator('[data-hero="pull-a"]')).toBeVisible();

  await openCoach(page);
  const box = coach(page).getByLabel('Ask the coach');
  await box.fill('my arms hurt');
  await coach(page).getByRole('button', { name: 'Send' }).click();
  await expect(coach(page).locator('.cs-msg-coach').last()).toContainText(REFERRAL);
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Dumbbell Bicep Curl');
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-adjusted]')).toContainText('Easy on arms');

  // The preview lists today as it runs: curls gone, changed rows badged.
  await page.locator('[data-hero="pull-a"] [data-start]').click();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
  await expect(page.locator('[data-screen="preview"] [data-adjusted]').first()).toBeVisible();
  await expect(page.locator('li.ex-row[data-ex="Dumbbell_Bicep_Curl"]')).toHaveCount(0);
  await expect(page.locator('li.ex-row[data-ex="Hammer_Curls"]')).toHaveCount(0);
  await expect(page.locator('li.ex-row[data-adjusted]').first()).toBeVisible();
  const running = await page
    .locator('li.ex-row')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-ex')));

  // The workout runs that day.
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await expect(list.locator('.ex-row-btn')).toHaveCount(running.length);
  await expect(list).not.toContainText('Dumbbell Bicep Curl');
  // The session row says it ran adjusted (stalls skip it).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve) => {
            const open = indexedDB.open('gym-clean');
            open.onsuccess = () => {
              const d = open.result;
              const rq = d.transaction('sessions').objectStore('sessions').getAll();
              rq.onsuccess = () => {
                const rows = rq.result as { endedAt?: number; adjust?: string[] }[];
                d.close();
                resolve(rows.find((r) => r.endedAt === undefined)?.adjust ?? null);
              };
            };
          }),
      ),
    )
    .toEqual(['avoidArea']);

  expect(await page.evaluate(() => window.__spoken.filter((t) => t.includes('doctor')))).toEqual(
    [],
  );
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Lighter today in lb: 35 lb → 30 lb on the Exercise screen, and the plan survives a reload', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await page.locator('[data-tab="settings"]').click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await leaveSettings(page);

  await openCoach(page);
  await coach(page).locator('[data-coach-chip="lighter"]').click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toContainText('35 lb');
  await expect(card).toContainText('30 lb');
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-adjusted]')).toContainText('Lighter today');

  await page.reload();
  await expect(page.locator('[data-adjusted]')).toContainText('Lighter today');
  await expect(page.locator('[data-cal="2026-11-13"]')).toHaveAttribute('data-day', 'push-a');

  await page.locator('[data-hero="push-a"] [data-start]').click();
  const first = page.locator('li.ex-row').first();
  await expect(first).toContainText('3 × 8 reps · 30 lb');
  await expect(first).toHaveAttribute('data-adjusted', 'lighter');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByLabel('lb', { exact: true })).toHaveText('30');
  await expect(page.locator('[data-set-counter]')).toContainText('Set 1 of 3');

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('mid-workout swap from the Pause sheet: no text box during the set; spoken once; Undo', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await page.locator('[data-hero="push-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  // During a set: no way to type, and no coach entry on the Exercise screen.
  await expect(page.locator('input, textarea')).toHaveCount(0);
  await expect(page.locator('[data-coach-open]')).toHaveCount(0);

  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  await expect(coach(page)).toBeVisible();
  await expect(coach(page).getByLabel('Ask the coach')).toBeVisible(); // paused: typing allowed
  await expect(coach(page).locator('[data-coach-chip="notToday"]')).toHaveCount(0);
  await coach(page).locator('[data-coach-chip="swap"]').click();
  // The running exercise isn't offered; the others are.
  const options = coach(page).locator('[data-coach-followup]');
  await expect(options.filter({ hasText: 'Dumbbell Bench Press' })).toHaveCount(0);
  await options.filter({ hasText: 'Seated Dumbbell Press' }).click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toContainText('Seated Dumbbell Press');
  const spokenBefore = await page.evaluate(() => window.__spoken.length);
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(coach(page)).toHaveCount(0);
  await expect(page.locator('[data-undo-toast]')).toBeVisible();
  const said = await page.evaluate((n) => window.__spoken.slice(n), spokenBefore);
  expect(said).toHaveLength(1);
  expect(said[0]).toMatch(/^Done\./);
  expect((said[0] ?? '').split(/\s+/).length).toBeLessThanOrEqual(8);

  // Still paused; the list now runs the swap in place of Seated Dumbbell Press.
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  await paused.getByRole('button', { name: 'Resume' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await expect(list.locator('.ex-row-btn')).toHaveCount(6);
  await expect(list).not.toContainText('Seated Dumbbell Press');
  await list.getByRole('button', { name: 'Close' }).click();

  // Undo from Settings → Plan changes is still possible later; here, the toast's Undo
  // puts the unstarted row back.
  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  await coach(page).getByRole('button', { name: 'Close' }).click();
  await expect(coach(page)).toHaveCount(0);
  await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  await expect(page.getByRole('dialog', { name: 'Exercise list' })).toContainText(
    'Seated Dumbbell Press',
  );

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test("mid-workout go-easy removes the curls; the toast's Undo brings them back in place", async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  // Push A done yesterday: today is Pull A (rows first, curls last).
  await seed(
    page,
    [
      {
        sessionId: 's-push',
        dayId: 'push-a',
        startedAt: at(12, 18),
        endedAt: at(12, 18) + 50 * MIN,
      },
    ],
    [],
  );
  await page.locator('[data-hero="pull-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  const listIds = async () => {
    await page.getByRole('button', { name: 'Exercise list' }).click();
    const list = page.getByRole('dialog', { name: 'Exercise list' });
    await expect(list).toBeVisible();
    const names = await list.locator('.ex-row-btn').allTextContents();
    await list.getByRole('button', { name: 'Close' }).click();
    return names;
  };
  const before = await listIds();
  const curlAt = before.findIndex((t) => t.includes('Dumbbell Bicep Curl'));
  expect(curlAt).toBeGreaterThan(0);

  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  await coach(page).getByLabel('Ask the coach').fill('my arms hurt');
  await coach(page).getByRole('button', { name: 'Send' }).click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  const spokenBefore = await page.evaluate(() => window.__spoken.length);
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(coach(page)).toHaveCount(0);
  // Spoken once, short (paused: no set running).
  const said = await page.evaluate((n) => window.__spoken.slice(n), spokenBefore);
  expect(said).toHaveLength(1);
  expect(said[0]).toMatch(/^Done\./);
  expect(said[0]).not.toMatch(/swap/i);
  await expect(page.locator('[data-undo-toast]')).not.toContainText(/swap/i);

  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();
  const during = await listIds();
  expect(during.some((t) => t.includes('Dumbbell Bicep Curl'))).toBe(false);
  expect(during.length).toBeLessThan(before.length);

  // Undo: the removed rows come back, in their places.
  await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-undo-toast]')).toHaveCount(0);
  const after = await listIds();
  expect(after).toEqual(before);

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a stalled lift on Summary (seeded history) opens its proposal; Apply', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  // Three Push A sessions with the same best bench set (8 × 15 kg).
  const days = [2, 5, 9];
  await seed(
    page,
    days.map((d) => ({
      sessionId: `s-${d}`,
      dayId: 'push-a',
      startedAt: at(d, 18),
      endedAt: at(d, 18) + 45 * MIN,
    })),
    days.flatMap((d) =>
      [0, 1].map((i) => ({
        sessionId: `s-${d}`,
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: i,
        reps: 8,
        weightKg: 15,
        startedAt: at(d, 18) + (i + 1) * 3 * MIN,
      })),
    ),
  );
  // Today the rotation is on Pull A; run Push A from its card in the week strip.
  await page.locator('.day-btn[data-day="push-a"]').first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Set done' }).click(); // 8 × 15 again: no gain
  await endWorkout(page);

  const stall = page.locator('[data-stall="Dumbbell_Bench_Press"]');
  await expect(stall).toContainText('Dumbbell Bench Press: same best set for 4 sessions.');
  await stall.getByRole('button', { name: 'Go lighter' }).click();
  const card = coach(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-undo-toast]')).toBeVisible();
  await expect(page.locator('[data-stall="Dumbbell_Bench_Press"]')).toHaveCount(0);

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a red-flag phrase gets the fixed line and no training proposal', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await openCoach(page);
  await coach(page).getByLabel('Ask the coach').fill('I have chest pain');
  await coach(page).getByRole('button', { name: 'Send' }).click();
  const flag = coach(page).locator('[data-redflag]');
  await expect(flag).toContainText(RED_FLAG);
  await expect(coach(page).locator('[data-proposal]')).toHaveCount(0);
  await expect(coach(page).locator('[data-coach-chip]')).toHaveCount(0);
  await expect(coach(page).getByLabel('Ask the coach')).toHaveCount(0);
  await expect(flag.getByRole('button', { name: 'Not today' })).toBeVisible();
  await expect(flag.getByRole('button', { name: 'End workout' })).toHaveCount(0);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('rest day: "Rest day" hero → Train anyway runs the next day; the calendar agrees', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(15, 10)); // Sunday
  // The default has no rest weekdays (M10-q1): Sunday trains the first program day.
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await expect(page.locator('[data-cal="2026-11-15"]')).toHaveAttribute('data-day', 'push-a');
  await setRestWeekdays(page, [0]);
  const hero = page.locator('[data-hero="rest"]');
  await expect(hero).toContainText('Rest day');
  await expect(hero).toContainText('Next up: Push A');
  await expect(page.locator('[data-cal="2026-11-15"]')).toHaveAttribute('data-rest');
  await noHorizontalOverflow(page);
  await hero.getByRole('button', { name: 'Train anyway' }).click();
  await expect(page.locator('[data-screen="preview"] h1')).toHaveText('Push A');
  await page.getByRole('button', { name: '‹ Back' }).click();
  // Today trains now: the normal hero, and the coach can change today.
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await expect(page.locator('[data-cal="2026-11-15"]')).toHaveAttribute('data-day', 'push-a');
  await openCoach(page);
  await coach(page).locator('[data-coach-chip="lighter"]').click();
  await expect(coach(page).locator('[data-proposal]')).toBeVisible();
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Not today → Train anyway takes the postpone back: the week is as before, Undo rests again', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await setRestWeekdays(page, [0]);
  const week = () =>
    page
      .locator('[data-cal]')
      .evaluateAll((els) =>
        els.map((e) => `${e.getAttribute('data-cal')}:${e.getAttribute('data-day') ?? 'rest'}`),
      );
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  const before = await week();

  await openCoach(page);
  await coach(page).locator('[data-coach-chip="notToday"]').click();
  await coach(page).locator('[data-proposal]').getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-hero="rest"]')).toBeVisible();
  // useRestDay turned Sunday into a training day.
  await expect(page.locator('[data-cal="2026-11-15"]')).not.toHaveAttribute('data-rest');

  await page.locator('[data-hero="rest"]').getByRole('button', { name: 'Train anyway' }).click();
  await expect(page.locator('[data-screen="preview"] h1')).toHaveText('Push A');
  const toast = page.locator('[data-undo-toast]');
  await expect(toast).toContainText('Today is a training day');
  await page.getByRole('button', { name: '‹ Back' }).click();
  // The postpone is taken back: Sunday rests again, no extra session, no "Adjusted" banner.
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await expect(page.locator('[data-cal="2026-11-15"]')).toHaveAttribute('data-rest');
  expect(await week()).toEqual(before);
  await expect(page.locator('[data-adjusted]')).toHaveCount(0);
  await expect(page.locator('[data-notice]')).toHaveCount(0);

  // The normal Undo: today rests again as the postpone left it, with no conflict notice.
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-hero="rest"]')).toBeVisible();
  await expect(page.locator('[data-cal="2026-11-15"]')).not.toHaveAttribute('data-rest');
  await expect(page.locator('[data-notice]')).toHaveCount(0);

  // Plan changes lists both, newest first.
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-plan-changes-open]').click();
  const rows = page.locator('[data-screen="plan-changes"] li.plan-change');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Train anyway today');

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('mid-workout Lighter today after a logged set: the confirmation says only unstarted lifts change', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  await page.locator('[data-hero="push-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Set done' }).click();
  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  await coach(page).locator('[data-coach-chip="lighter"]').click();
  const spokenBefore = await page.evaluate(() => window.__spoken.length);
  await coach(page).locator('[data-proposal]').getByRole('button', { name: 'Apply' }).click();
  await expect(coach(page)).toHaveCount(0);
  const line = 'Done. Lifts not started yet are lighter.';
  await expect(page.locator('[data-undo-toast]')).toContainText(line);
  expect(await page.evaluate((n) => window.__spoken.slice(n), spokenBefore)).toEqual([line]);
});

test('the Pause sheet has no Coach row while the camera view is open', async ({ page }) => {
  await openApp(page, at(13, 18));
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await openPause(page);
  await expect(page.locator('[data-pause="coach"]')).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();

  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Camera' })).toBeVisible();
  // The camera sheet covers the top bar; the Pause sheet is modal over the camera when the
  // session pauses under it, so the click goes to the top bar's Pause button directly.
  await page.getByRole('button', { name: 'Pause', exact: true }).dispatchEvent('click');
  const paused = page.getByRole('dialog', { name: 'Paused' });
  await expect(paused).toBeVisible();
  await expect(paused.getByRole('button', { name: 'Resume' })).toBeVisible();
  await expect(page.locator('[data-pause="coach"]')).toHaveCount(0);
});

test('Plan changes: newest first, Reset to default (two taps) → Undo brings the change back', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await openApp(page, at(13, 18));
  await openCoach(page);
  await coach(page).locator('[data-coach-chip="lighter"]').click();
  await coach(page).locator('[data-proposal]').getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('[data-adjusted]')).toContainText('Lighter today');

  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-plan-changes-open]').click();
  const screen = page.locator('[data-screen="plan-changes"]');
  await expect(screen.locator('li.plan-change')).toHaveCount(1);
  await expect(screen.locator('li.plan-change').first()).toContainText('Lighter today');
  await expectTapTargets(page, '[data-screen="plan-changes"]');

  const reset = screen.locator('[data-reset-plan]');
  await reset.click();
  await expect(reset).toHaveText('Tap again to reset');
  await reset.click();
  await expect(screen.locator('li.plan-change')).toHaveCount(2);
  await expect(screen.locator('li.plan-change').first()).toContainText('Reset to default program');
  await expect(screen.locator('[data-undo-change]')).toHaveCount(1);
  // Reset keeps dated overrides (only the plan and rotation are re-seeded): today stays lighter.
  await screen.locator('[data-undo-change]').click();
  await expect(screen.locator('li.plan-change').first()).toHaveAttribute('data-undone');
  await expect(screen.locator('[data-undo-change]')).toHaveCount(1); // now on Lighter today

  await screen.getByRole('button', { name: '‹ Back' }).click();
  await leaveSettings(page);
  await expect(page.locator('[data-adjusted]')).toContainText('Lighter today');
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});
