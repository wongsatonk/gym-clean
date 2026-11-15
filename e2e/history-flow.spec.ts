// M6 History, end to end in the real app: sessions and sets seeded straight into the app's
// IndexedDB, then the History tab loads them through app.ts (finishedHistorySince + the core
// selectors). Two finished sessions this week and one unfinished one that must not show up
// anywhere; open an exercise, read its detail, Back, then the Today tab. History is read at rest,
// so nothing is spoken. No third-party requests, no console errors.
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __spoken: string[];
  }
}

/** Local times, so the day rows read the same in any timezone. Fri 13 Nov 2026 is "today". */
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();
const MIN = 60_000;

/** speechSynthesis and Wake Lock recorders (as in m4e-theme.spec.ts). */
async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
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
      value: {
        speak: (u: FakeUtterance) => {
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
        },
        cancel: () => undefined,
        getVoices: () => [],
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

function thirdParty(requests: readonly string[], baseURL: string | undefined): string[] {
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
  focusScore?: number;
};

/** Writes sessions and set logs into the app's IndexedDB once Dexie has created it. */
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
                if (
                  !d.objectStoreNames.contains('sessions') ||
                  !d.objectStoreNames.contains('sets')
                ) {
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
}

const ROW = 'One-Arm_Dumbbell_Row';
const PULLDOWN = 'Wide-Grip_Lat_Pulldown';

test('History tab: last 7 days from the DB, unfinished session hidden, exercise detail, Back, Today', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await installMocks(page);
  await page.clock.install({ time: at(13, 18) });
  await page.goto('/');
  await expect(page.locator('.day-btn')).toHaveCount(7);

  const set = (
    sessionId: string,
    exerciseId: string,
    start: number,
    rows: [number, number][],
    focusScore?: number,
  ): SetSeed[] =>
    rows.map(([reps, weightKg], setIndex) => ({
      sessionId,
      exerciseId,
      setIndex,
      reps,
      weightKg,
      startedAt: start + (setIndex + 1) * 3 * MIN,
      ...(focusScore === undefined ? {} : { focusScore }),
    }));
  await seed(
    page,
    [
      // Mon 9 Nov, finished: row 2 × 10 × 20 (400 kg) + pulldown 10 × 40 (400 kg).
      { sessionId: 'h-mon', dayId: 'pull-a', startedAt: at(9, 18), endedAt: at(9, 18) + 45 * MIN },
      // Thu 12 Nov, finished: row 12 × 22.5 + 10 × 22.5 (495 kg).
      {
        sessionId: 'h-thu',
        dayId: 'pull-a',
        startedAt: at(12, 18),
        endedAt: at(12, 18) + 50 * MIN,
      },
      // Fri 13 Nov this morning, never finished: a heavy row set that must not count anywhere.
      { sessionId: 'h-open', dayId: 'push-a', startedAt: at(13, 7) },
    ],
    [
      ...set(
        'h-mon',
        ROW,
        at(9, 18),
        [
          [10, 20],
          [10, 20],
        ],
        80,
      ),
      ...set('h-mon', PULLDOWN, at(9, 18) + 20 * MIN, [[10, 40]]),
      ...set(
        'h-thu',
        ROW,
        at(12, 18),
        [
          [12, 22.5],
          [10, 22.5],
        ],
        90,
      ),
      ...set('h-open', ROW, at(13, 7), [[15, 30]]),
    ],
  );

  // List: 2 sessions, 1,295 kg, newest first; the unfinished one is nowhere.
  await page.locator('[data-tab="history"]').click();
  const list = page.locator('main[data-screen="history"][data-view="list"]');
  await expect(list).toBeVisible();
  await expect(page.locator('[data-week-stat="sessions"] .hist-stat-value')).toHaveText('2');
  await expect(page.locator('[data-week-stat="volume"] .hist-stat-value')).toHaveText('1,295');
  const days = page.locator('[data-history-day]');
  await expect(days).toHaveCount(2);
  await expect(days.nth(0)).toHaveAttribute('data-history-day', 'h-thu');
  await expect(days.nth(0)).toContainText('Pull A');
  await expect(days.nth(0)).toContainText('Thu 12 Nov · 50 min');
  await expect(days.nth(0)).toContainText('2 sets · 1 exercise · 495 kg');
  await expect(days.nth(1)).toHaveAttribute('data-history-day', 'h-mon');
  await expect(days.nth(1)).toContainText('Mon 9 Nov · 45 min');
  await expect(days.nth(1)).toContainText('3 sets · 2 exercises · 800 kg');
  await expect(page.locator('[data-history-day="h-open"]')).toHaveCount(0);
  await expect(page.locator('[data-history-empty]')).toHaveCount(0);
  await expect(page.locator('[data-history-exercise]')).toHaveCount(2);
  await expect(page.locator(`[data-history-exercise="${ROW}"]`)).toContainText('12 × 22.5 kg');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  // Detail: best set from finished sessions only (not the unfinished 15 × 30), two sessions.
  await page.locator(`[data-history-exercise="${ROW}"]`).click();
  await expect(page.locator('main[data-screen="history"][data-view="detail"]')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('One-Arm Dumbbell Row');
  await expect(page.locator('[data-best] .hist-best-num')).toHaveText('12 × 22.5');
  await expect(page.locator('[data-trend]')).toHaveAttribute('data-metric', 'volume');
  await expect(page.locator('[data-trend-change]')).toHaveText('Volume +24% over 4 weeks');
  await expect(page.locator('[data-trend-focus]')).toHaveText('Average focus 85');
  const sessions = page.locator('[data-history-session]');
  await expect(sessions).toHaveCount(2);
  await expect(sessions.nth(0)).toHaveAttribute('data-history-session', 'h-thu');
  await expect(sessions.nth(0)).toContainText('12×22.5, 10×22.5 kg');
  await expect(sessions.nth(0)).toContainText('495 kg volume');
  await expect(sessions.nth(1)).toHaveAttribute('data-history-session', 'h-mon');
  await expect(sessions.nth(1)).toContainText('10×20, 10×20 kg');
  await expect(page.locator('[data-history-session="h-open"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  // Back to the list, then the Today tab.
  await page.locator('[data-history-back]').click();
  await expect(list).toBeVisible();
  await expect(page.locator('[data-history-day]')).toHaveCount(2);
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('main[data-screen="history"]')).toHaveCount(0);
  await expect(page.locator('.day-btn')).toHaveCount(7);
  await expect(page.locator('[data-tab="today"]')).toHaveAttribute('aria-current', 'page');

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(thirdParty(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});
