import { expect, test, type Page } from '@playwright/test';
import { endWorkout } from './workout.helpers';

// M4c developer log + "Last set" correction (task 11, devlog part). A manual Push A set, a fix on
// Rest and again on Summary, then Settings → export (share sheet mocked) → Clear.

declare global {
  interface Window {
    __spoken: string[];
    __shared: File[];
  }
}

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__shared = [];
    // EventTarget: voice.ts listens for end/error on each utterance.
    class FakeUtterance extends EventTarget {
      text: string;
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
        speak: (u: FakeUtterance) => window.__spoken.push(u.text),
        cancel: () => undefined,
        getVoices: () => [],
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({
          addEventListener: () => undefined,
          release: async () => undefined,
        }),
      },
    });
    // iOS-style share sheet that accepts files and records them.
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d?: ShareData) => Boolean(d?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        window.__shared.push(...(d.files ?? []));
      },
    });
  });
}

/** All rows of one object store in the app's IndexedDB. */
function readStore<T>(page: Page, store: string): Promise<T[]> {
  return page.evaluate(
    (name) =>
      new Promise<T[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction(name).objectStore(name).getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as T[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    store,
  );
}

type SetRow = { exerciseId: string; reps: number; partials?: number; weightKg: number };
type SessionRow = { sessionId: string; totalVolumeKg?: number; endedAt?: number };
type DevLogSessionRow = { id: string; endedAt?: number; bytes: number };

/** Decompresses the shared .json.gz inside the page and returns its name and parsed JSON. */
function sharedExport(page: Page) {
  return page.evaluate(async () => {
    const file = window.__shared.at(-1);
    if (!file) return null;
    const text = await new Response(
      file.stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    return { name: file.name, count: window.__shared.length, text };
  });
}

const NOTE = 'secret note do not export';

test('dev log: correct the last set on Rest and Summary, export it, clear it', async ({ page }) => {
  const errors: string[] = [];
  const thirdParty: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', '127.0.0.1'].includes(host) && !r.url().startsWith('data:')) {
      thirdParty.push(r.url());
    }
  });
  await installMocks(page);
  await page.goto('/');

  // Settings: panel on by default, empty log, privacy note.
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.locator('[data-devlog=panel]');
  await expect(panel.locator('[data-devlog=toggle]')).toHaveAttribute('aria-checked', 'true');
  await expect(panel.locator('[data-devlog=summary]')).toHaveText('Empty');
  await expect(panel.locator('[data-devlog=export-last]')).toBeDisabled();
  await expect(panel.locator('[data-devlog=privacy]')).toContainText('No video');
  await page.getByRole('button', { name: '‹ Back' }).click();

  // Push A, one manual bench press set with a note (free text must never reach the log).
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await page.getByRole('button', { name: 'Notes and machine setting' }).click();
  await page.getByLabel('Today’s note').fill(NOTE);
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByRole('button', { name: 'Set done' }).click();

  // Rest: "Last set: 8 reps" → Fix → 7 reps, 1 partial → Save.
  const fix = page.locator('[data-lsc=panel]');
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('8 reps');
  await fix.locator('[data-lsc=fix]').click();
  for (let i = 0; i < 1; i++) await fix.locator('[data-lsc=reps-minus]').click();
  await fix.locator('[data-lsc=partials-plus]').click();
  await expect(fix.locator('[data-lsc=reps-value]')).toHaveText('7');
  await expect(fix.locator('[data-lsc=partials-value]')).toHaveText('1');
  await fix.locator('[data-lsc=save]').click();
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('7 reps · 1 partial');
  await expect(fix.locator('[data-lsc=fix]')).toBeFocused();
  await expect
    .poll(async () => (await readStore<SetRow>(page, 'sets')).map((r) => [r.reps, r.partials]))
    .toEqual([[7, 1]]);

  // End the workout (two taps) → Summary has the fix control too: 7 → 6 reps.
  await endWorkout(page);
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('7 reps · 1 partial');
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-minus]').click();
  await fix.locator('[data-lsc=save]').click();
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('6 reps · 1 partial');
  await expect
    .poll(async () => (await readStore<SetRow>(page, 'sets')).map((r) => [r.reps, r.partials]))
    .toEqual([[6, 1]]);
  const weightKg = (await readStore<SetRow>(page, 'sets'))[0]?.weightKg ?? NaN;
  await expect
    .poll(async () => (await readStore<SessionRow>(page, 'sessions'))[0]?.totalVolumeKg)
    .toBe(6 * weightKg);

  // On Summary the dev log stays open (so a fix here still reaches it) but is already flushed.
  await expect
    .poll(async () => {
      const rows = await readStore<DevLogSessionRow>(page, 'devlogSessions');
      return rows.length === 1 && rows[0]?.endedAt === undefined && (rows[0]?.bytes ?? 0) > 0;
    })
    .toBe(true);

  // Leaving Summary finishes it.
  await page.getByRole('button', { name: 'Done' }).click();
  await expect
    .poll(async () => (await readStore<DevLogSessionRow>(page, 'devlogSessions'))[0]?.endedAt)
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(panel.locator('[data-devlog=summary]')).toHaveText(
    /^\d+(\.\d)? (kB|MB) · 1 session$/,
  );
  await expect(panel.locator('[data-devlog=summary]')).not.toHaveText(/^0 kB/);

  // Export last → share sheet gets one gzip file.
  await panel.locator('[data-devlog=export-last]').click();
  await expect(panel.locator('[data-devlog=status]')).toHaveText('Shared.');
  const shared = await sharedExport(page);
  expect(shared?.count).toBe(1);
  expect(shared?.name).toMatch(/^gym-clean-devlog-.*-last\.json\.gz$/);
  const log = JSON.parse(shared?.text ?? '{}') as {
    format: string;
    sessions: {
      dayId: string;
      settings: Record<string, unknown>;
      events: { type: string; data?: { reps?: number; partials?: number } }[];
      sets: { exerciseId: string; logged?: { reps: number; partials: number } }[];
    }[];
  };
  expect(log.format).toBe('gym-clean-devlog');
  expect(log.sessions).toHaveLength(1);
  const session = log.sessions[0];
  if (!session) throw new Error('no session in the export');
  expect(session.dayId).toBe('push-a');
  expect(session.sets).toHaveLength(1);
  // The Summary fix must reach the log too (it is the ground truth for the counter).
  expect.soft(session.sets[0]).toMatchObject({
    exerciseId: 'Dumbbell_Bench_Press',
    logged: { reps: 6, partials: 1 },
  });
  // Both corrections are in the event log, in order.
  expect
    .soft(
      session.events
        .filter((e) => e.type === 'CORRECT_LAST_SET')
        .map((e) => [e.data?.reps, e.data?.partials]),
    )
    .toEqual([
      [7, 1],
      [6, 1],
    ]);
  // No free text: the note typed during the workout is nowhere in the file.
  expect(shared?.text).not.toContain(NOTE);
  expect(Object.keys(session.settings).sort()).toEqual(['spokenCount', 'unit']);

  // Clear needs two taps, then the log is empty.
  const clear = panel.locator('[data-devlog=clear]');
  await clear.click();
  await expect(clear).toHaveText('Tap again to clear');
  await clear.click();
  await expect(panel.locator('[data-devlog=summary]')).toHaveText('Empty');
  await expect(panel.locator('[data-devlog=status]')).toHaveText('Developer log cleared.');
  expect(await readStore(page, 'devlogSessions')).toEqual([]);
  expect(await readStore(page, 'devlogSets')).toEqual([]);
  expect(await readStore(page, 'devlogChunks')).toEqual([]);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(thirdParty).toEqual([]);
  expect(errors).toEqual([]);
});
