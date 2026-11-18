// Shared by the M10e equipment and M9 backup specs (not a spec itself). Copied from
// trainer.spec.ts (left unchanged): speech + wake-lock mocks, request/error recording, the
// IndexedDB seed, and the 56px tap-target check.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    __spoken: string[];
  }
}

export const MIN = 60_000;
/** Local time on a November 2026 day. */
export const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).getTime();

export async function installMocks(page: Page) {
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

export function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

export function offDevice(requests: readonly string[], baseURL: string | undefined): string[] {
  const origin = new URL(baseURL ?? 'https://localhost').origin;
  return requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    return new URL(u).origin !== origin;
  });
}

/** M12 slice 1c: package.json `version` (the What's New tour key, `__APP_RELEASE__`). */
export const APP_RELEASE: string = (
  JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string }
).version;

export type SeedOptions = {
  /**
   * M12 slice 1c: the release whose What's New tour counts as seen (settings 'whatsNew'). Default
   * the current release, so seeded sessions never bring up the tour; `null` leaves the row as is.
   */
  whatsNewSeen?: string | null;
};

export type SessionSeed = { sessionId: string; dayId: string; startedAt: number; endedAt?: number };
export type SetSeed = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  weightKg: number;
  startedAt: number;
};

/**
 * Writes sessions and sets into the app's IndexedDB once Dexie has created it, then reloads. The
 * What's New tour is marked seen for the current release unless `opts.whatsNewSeen` says otherwise.
 */
export async function seed(
  page: Page,
  sessions: SessionSeed[],
  sets: SetSeed[],
  opts: SeedOptions = {},
) {
  const seen = opts.whatsNewSeen === undefined ? APP_RELEASE : opts.whatsNewSeen;
  await expect
    .poll(() =>
      page.evaluate(
        ({ sessions, sets, seen }) =>
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
                const tx = d.transaction(['sessions', 'sets', 'settings'], 'readwrite');
                if (seen !== null) {
                  const store = tx.objectStore('settings');
                  const get = store.get('whatsNew');
                  get.onsuccess = () => {
                    const prev = (get.result as { value?: Record<string, unknown> } | undefined)
                      ?.value;
                    store.put({ key: 'whatsNew', value: { ...(prev ?? {}), seenRelease: seen } });
                  };
                }
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
        { sessions, sets, seen },
      ),
    )
    .toBe(true);
  await page.reload();
}

/**
 * Puts one `settings` row (key → value) into the app's IndexedDB once Dexie has created it.
 * No reload: the caller reloads when the app must read it at start.
 */
export async function putSetting(page: Page, key: string, value: unknown) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, value }) =>
          new Promise<boolean>((resolve) => {
            void indexedDB.databases().then((dbs) => {
              if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
              const open = indexedDB.open('gym-clean');
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains('settings')) {
                  d.close();
                  return resolve(false);
                }
                const tx = d.transaction('settings', 'readwrite');
                tx.objectStore('settings').put({ key, value });
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
        { key, value },
      ),
    )
    .toBe(true);
}

/** Puts rows into one IndexedDB store of the app once Dexie has created it (no reload). */
export async function putRows(page: Page, store: string, rows: unknown[]) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ store, rows }) =>
          new Promise<boolean>((resolve) => {
            void indexedDB.databases().then((dbs) => {
              if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
              const open = indexedDB.open('gym-clean');
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains(store)) {
                  d.close();
                  return resolve(false);
                }
                const tx = d.transaction(store, 'readwrite');
                for (const r of rows) tx.objectStore(store).put(r);
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
        { store, rows },
      ),
    )
    .toBe(true);
}

/** Every row of one IndexedDB store of the app. */
export async function getRows<T = unknown>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (store) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const req = d.transaction(store, 'readonly').objectStore(store).getAll();
          req.onsuccess = () => {
            d.close();
            resolve(req.result as T[]);
          };
          req.onerror = () => {
            d.close();
            reject(new Error('read failed'));
          };
        };
      }),
    store,
  );
}

/** Reads one `settings` row's value (undefined when missing). */
export async function getSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (key) =>
      new Promise<unknown>((resolve) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => resolve(undefined);
        open.onsuccess = () => {
          const d = open.result;
          const req = d.transaction('settings', 'readonly').objectStore('settings').get(key);
          req.onsuccess = () => {
            d.close();
            resolve((req.result as { value?: unknown } | undefined)?.value);
          };
          req.onerror = () => {
            d.close();
            resolve(undefined);
          };
        };
      }),
    key,
  );
}

/** Every visible button in `scope` is at least 56px tall (gym rule). */
export async function expectTapTargets(page: Page, selector: string) {
  // evaluateAll doesn't wait: let the screen's buttons render first.
  await expect(page.locator(`${selector} button`).first()).toBeVisible();
  // M12 motion: let rise-ins finish first (a fractional translateY mid-animation can measure a
  // 56px button as 55.9999px). Reduced motion has none to wait for.
  await animationsSettled(page);
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

/** Opens the app at `time` and waits for Today's week strip. */
export async function openApp(page: Page, time: number) {
  await installMocks(page);
  await page.clock.install({ time });
  await page.goto('/');
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
}

/**
 * A toast is up and `target` is on screen without scrolling, wholly above the toast, at least
 * 56px tall (buttons), and a tap at its centre lands on it (nothing covers it).
 */
export async function expectClearOfToast(page: Page, target: Locator, minHeight = 56) {
  await expect(page.locator('.undo-toast')).toBeVisible();
  await expect(target).toBeVisible();
  await expect
    .poll(() =>
      target.evaluate((el, min) => {
        const toast = document.querySelector('.undo-toast')?.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          onScreen: r.top >= 0,
          aboveToast: toast !== undefined && r.bottom <= toast.top,
          tall: r.height >= min,
          hit: hit !== null && el.contains(hit),
        };
      }, minHeight),
    )
    .toEqual({ onScreen: true, aboveToast: true, tall: true, hit: true });
}

/** Taps `target` at its centre as it sits now (no scroll into view first). */
export async function tapInPlace(page: Page, target: Locator) {
  const b = await target.boundingBox();
  if (!b) throw new Error('target has no box');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

/** M12: the Coach tab (the coach's home; the old dialog is only the Pause sheet's chat now). */
export const coachTab = (page: Page): Locator => page.locator('[data-screen="coach"]');

/** M12: leaves the Coach tab for Today through the tab bar (the tab has no Close). */
export async function leaveCoach(page: Page): Promise<void> {
  await page.locator('[data-tab="today"]').click();
  await expect(coachTab(page)).toHaveCount(0);
}

/**
 * Every request must stay on the dev server (as health.spec): anything else is recorded and
 * aborted, so a leak fails the test instead of reaching the network.
 */
export async function guardNetwork(page: Page): Promise<string[]> {
  const offsite: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  return offsite;
}

/** Waits until no finite animation is running (rise-ins, slides); infinite loops are ignored. */
export async function animationsSettled(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
      ),
  );
}

/**
 * M12 slice 1c: waits until the app has finished its first to-do facts refresh and its first
 * What's New tour check since this page load (todoHost's ready signal on `<html>`). Assert that
 * the tour or the to-do card is absent only after this, never after a fixed wait.
 */
export async function todoReady(page: Page): Promise<void> {
  await expect(page.locator('html[data-todo-ready]')).toBeAttached();
}

/** How many to-do facts refreshes / tour checks have finished since this page load. */
export async function todoCounts(page: Page): Promise<{ refreshes: number; tourChecks: number }> {
  return page.evaluate(() => {
    const html = document.documentElement;
    return {
      refreshes: Number(html.getAttribute('data-todo-refreshes') ?? 0),
      tourChecks: Number(html.getAttribute('data-tour-checks') ?? 0),
    };
  });
}

/** Fires the "app came back to the foreground" event the app listens for. */
export async function foreground(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

/**
 * M13: Today folds two or more notices (readiness, missed day, missing kit, …) into one
 * "N things to sort" row. Makes `target` (a notice card or something inside one) visible:
 * opens the row when the target sits in it closed; a lone notice is shown as is.
 */
export async function revealNotice(page: Page, target: Locator): Promise<void> {
  const toggle = page.locator('[data-screen="today"] [data-notices-toggle]');
  await expect(target.or(toggle).first()).toBeVisible();
  // Retried: Today re-renders when its data lands, and a tap on a toggle that is being replaced
  // is lost (seen on slow CI), leaving the row folded.
  await expect(async () => {
    if (!(await target.first().isVisible()) && (await toggle.count()) > 0) {
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    }
    await expect(target.first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}
