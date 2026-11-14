// M5c follow-up B7: breaks inside a set ("tap to continue") end to end (SPEC M5c "Breaks inside a
// set" Accept). The pose model is replaced by a fixture player served in place of
// src/pose/landmarker.ts, like hands-free.spec.ts, but the clip is built in the page from the
// core test kit: head-on push-ups (the front variant, which has the body-line gate), 2.2 s to the
// first rep and one rep every 3.1 s after. Hooks:
// - window.__freezeAt = i holds clip frame i (frame 0 = top of the plank, the start position);
//   window.__play() replays the clip from frame 0;
// - window.__sit = true bends the hips to 45° (sitting down: the body-line gate fails while the
//   person stays in frame);
// - window.__noPerson = true returns no pose;
// - window.__hideWrists = true hides both wrists (a visibility gap, never a break).
// Real timers (autoSet runs on the camera frame clock); speech is mocked and recorded in order.
import { expect, test, type Locator, type Page } from '@playwright/test';

const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);
const PROMPT = 'Set on hold. Tap to continue.';
const REMIND = 'Tap Continue to count.';

type Said = { text: string; at: number };
type SetRow = {
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  restTakenSec: number;
  startedAt: number;
  endedAt: number;
};

declare global {
  interface Window {
    __said: Said[];
    __freezeAt: number | null;
    __noPerson: boolean;
    __sit: boolean;
    __hideWrists: boolean;
    __repsAt: Record<number, number>;
    __play: () => void;
    __freezeWhenReps: (n: number) => void;
  }
}

async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0;
    window.__noPerson = false;
    window.__sit = false;
    window.__hideWrists = false;
    window.__repsAt = {};
    window.__play = () => {
      window.__freezeAt = null;
    };
    // Freeze at the top of the plank the moment the shown count reaches n.
    window.__freezeWhenReps = (n: number) => {
      const check = () => {
        const el = document.querySelector<HTMLElement>('[role=dialog] .rep-num[data-reps]');
        if (el && Number(el.dataset.reps) >= n) {
          window.__freezeAt = 0;
          obs.disconnect();
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-reps'],
      });
      check();
    };
    // When each count was first shown (wall clock), for the backdated times.
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (!el.matches?.('[role=dialog] .rep-num[data-reps]')) continue;
        const n = Number(el.dataset.reps);
        if (n > 0 && !(n in window.__repsAt)) window.__repsAt[n] = Date.now();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-reps'] });

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
          if (u.volume === 0) return; // the silent iOS unlock
          window.__said.push({ text: u.text, at: Date.now() });
          setTimeout(() => u.dispatchEvent(new Event('end')), 300);
        },
        cancel: () => window.__said.push({ text: '<cancel>', at: Date.now() }),
        resume: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
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
  });
  // The clip is built from the core test kit (served by Vite like any other module).
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        import { curve, sample, withHip } from '/src/core/testkit/frames.ts';
        import { ruleFor } from '/src/core/exercises/index.ts';
        export async function createPoseTracker() {
          const rule = ruleFor('Pushups');
          const TOP = 165, BOTTOM = 110;
          const segs = [[600, TOP]];
          for (let i = 0; i < 6; i++) segs.push([700, BOTTOM], [200, BOTTOM], [700, TOP], [1500, TOP]);
          const frames = sample(rule, curve(TOP, segs));
          let base = null;
          const pose = (f, t) => {
            let out = withHip(f, window.__sit ? 45 : 175);
            if (window.__hideWrists)
              out = {
                ...out,
                landmarks: out.landmarks.map((p, i) => (i === 15 || i === 16 ? { ...p, visibility: 0 } : p)),
              };
            return { ...out, t };
          };
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__noPerson) { base = null; return null; }
              if (window.__freezeAt != null) {
                base = null;
                return pose(frames[window.__freezeAt], t);
              }
              base ??= t;
              const i = Math.floor((t - base) / 33.333) % frames.length;
              return pose(frames[i], t);
            },
            close() {},
          };
        }`,
    }),
  );
}

/** Console errors, page errors and any request that leaves the dev server. */
function watch(page: Page) {
  const errors: string[] = [];
  const thirdParty: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && !ORIGIN_HOSTS.has(url.hostname))
      thirdParty.push(r.url());
  });
  return { errors, thirdParty };
}

const said = (page: Page) => page.evaluate(() => window.__said);
const texts = async (page: Page) => (await said(page)).map((s) => s.text);
const wallNow = (page: Page) => page.evaluate(() => Date.now());
const setHook = (page: Page, name: 'sit' | 'noPerson' | 'hideWrists', on: boolean) =>
  page.evaluate(([k, v]) => ((window as unknown as Record<string, boolean>)[`__${k}`] = v), [
    name,
    on,
  ] as const);

/** Waits until `text` is said at or after list index `from`; returns that entry. */
async function waitSaid(page: Page, text: string, timeout: number, from = 0): Promise<Said> {
  await expect
    .poll(async () => (await texts(page)).slice(from).includes(text), { timeout })
    .toBe(true);
  const hit = (await said(page)).slice(from).find((s) => s.text === text);
  if (!hit) throw new Error(`not said: ${text}`);
  return hit;
}

/** All rows of the app's IndexedDB `sets` store, oldest first. */
function setRows(page: Page): Promise<SetRow[]> {
  return page.evaluate(
    () =>
      new Promise<SetRow[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => {
            open.result.close();
            const rows = (req.result as SetRow[]).sort((a, b) => a.startedAt - b.startedAt);
            resolve(rows);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

/** Push A → Start workout → Exercise list → Pushups → Camera (set 1 running). */
async function openCamera(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: 'Pushups' }).click();
  await expect(page.getByRole('heading', { name: 'Pushups' })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 15_000 });
  return cam;
}

const reps = (cam: Locator) => cam.locator('.rep-num[data-reps]');
const holdPanel = (cam: Locator) => cam.locator('[data-hold]');

/** Plays the clip from the top and holds it once `n` reps are shown; returns rep n's time. */
async function repsThenFreeze(page: Page, cam: Locator, n: number): Promise<number> {
  await page.evaluate((n) => {
    window.__repsAt = {};
    window.__freezeWhenReps(n);
    window.__play();
  }, n);
  await expect(reps(cam)).toHaveAttribute('data-reps', String(n), { timeout: 20_000 });
  expect(await page.evaluate(() => window.__freezeAt)).toBe(0);
  return page.evaluate((n) => window.__repsAt[n] ?? 0, n);
}

/** The hold panel is up for `reason`, and its buttons are gym-sized. */
async function expectHold(cam: Locator, reason: string, repCount: number): Promise<void> {
  const hold = holdPanel(cam);
  await expect(hold).toBeVisible();
  await expect(hold).toHaveAttribute('data-reason', reason);
  await expect(hold.locator('[data-hold-title]')).toHaveText(
    `On hold · ${repCount} ${repCount === 1 ? 'rep' : 'reps'}`,
  );
  await expect(hold.locator('[data-hold-clock]')).toBeVisible();
  for (const b of await hold.getByRole('button').all()) {
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  }
}

// One worker for the whole file: real-timer camera loops miss frames under parallel load.
test.describe.configure({ mode: 'default', timeout: 150_000 });

test('(1, 8, 9, 10) no person for 3 s after 2 reps → hold + prompt, nothing saved; Close while held saves (backdated)', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  const lastRepAt = await repsThenFreeze(page, cam, 2);
  const from = (await said(page)).length;
  const goneAt = await wallNow(page);
  await setHook(page, 'noPerson', true);
  const prompt = await waitSaid(page, PROMPT, 8_000, from);
  expect(prompt.at - goneAt).toBeGreaterThanOrEqual(2_500);
  expect(prompt.at - goneAt).toBeLessThan(5_500);
  await expectHold(cam, 'away', 2);
  await expect(holdPanel(cam)).toHaveAttribute('data-last-set', 'false');
  await expect(holdPanel(cam).getByRole('button', { name: 'Start next set' })).toBeVisible();
  // Past an Undo window's length: still on hold, the clock runs, no "Set done", no row.
  await page.waitForTimeout(6_000);
  await expect(holdPanel(cam)).toBeVisible();
  const clock = await holdPanel(cam).locator('[data-hold-clock]').textContent();
  expect(Number(/^0:(\d\d)$/.exec(clock ?? '')?.[1])).toBeGreaterThanOrEqual(8);
  await page.screenshot({ path: test.info().outputPath('m5c-hold.png') });
  expect((await texts(page)).filter((t) => t.startsWith('Set done'))).toEqual([]);
  expect(await setRows(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await cam.locator('.cam-top').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(cam).toHaveCount(0);
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [row] = await setRows(page);
  expect(row?.reps).toBe(2);
  expect(Math.abs((row?.endedAt ?? 0) - lastRepAt)).toBeLessThan(600);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(5, 2, 3) sitting 5 s → body-line hold; reps while held: not counted, reminder ≤ 1 / 10 s, no start, no cues; Continue resumes from N → one row', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  await repsThenFreeze(page, cam, 2);
  let from = (await said(page)).length;
  const satAt = await wallNow(page);
  await setHook(page, 'sit', true);
  const prompt = await waitSaid(page, PROMPT, 10_000, from);
  expect(prompt.at - satAt).toBeGreaterThanOrEqual(4_500);
  expect(prompt.at - satAt).toBeLessThan(7_500);
  await expectHold(cam, 'bodyLine', 2);
  expect((await texts(page)).slice(from).filter((t) => t.startsWith('Set done'))).toEqual([]);

  // Back in the plank doing push-ups without a tap: ~4 reps over 13 s, none counted.
  from = (await said(page)).length;
  await page.evaluate(() => {
    window.__sit = false;
    window.__play();
  });
  await page.waitForTimeout(13_500);
  await expect(reps(cam)).toHaveAttribute('data-reps', '2');
  await expect(holdPanel(cam)).toBeVisible();
  await expect(cam).toHaveAttribute('data-cam-mode', 'set');
  const during = (await said(page)).slice(from);
  // Only the reminder: no count words, no focus cues, no "Set done", no auto start.
  expect(during.map((s) => s.text).filter((t) => t !== REMIND)).toEqual([]);
  const reminders = during.filter((s) => s.text === REMIND);
  expect(reminders.length).toBeGreaterThanOrEqual(1);
  expect(reminders.length).toBeLessThanOrEqual(2);
  if (reminders.length === 2)
    expect((reminders[1]?.at ?? 0) - (reminders[0]?.at ?? 0)).toBeGreaterThanOrEqual(9_900);
  await expect(cam.locator('[data-cue]')).toHaveCount(0);
  expect(await setRows(page)).toEqual([]);

  // Continue: "Keep going.", the count resumes from 2.
  await page.evaluate(() => (window.__freezeAt = 0));
  from = (await said(page)).length;
  await holdPanel(cam).getByRole('button', { name: 'Continue set' }).click();
  await waitSaid(page, 'Keep going.', 3_000, from);
  await expect(holdPanel(cam)).toHaveCount(0);
  await expect(reps(cam)).toHaveAttribute('data-reps', '2');
  const lastRepAt = await repsThenFreeze(page, cam, 4);
  expect((await texts(page)).slice(from)).toEqual(
    expect.arrayContaining(['Keep going.', 'Three', 'Four']),
  );
  // Still in the plank: the normal still stop with the summed reps, then one row.
  await waitSaid(page, 'Set done. 4 reps.', 12_000, from);
  await expect.poll(async () => (await setRows(page)).length, { timeout: 10_000 }).toBe(1);
  const [row] = await setRows(page);
  expect(row?.reps).toBe(4);
  expect(Math.abs((row?.endedAt ?? 0) - lastRepAt)).toBeLessThan(600);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(4, 7) Start next set saves the held set backdated and starts the next at 0 (rest = the break); Save set on the last set closes the camera', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);

  // Set 1: 2 reps, sit → hold → Start next set.
  const lastRep1 = await repsThenFreeze(page, cam, 2);
  let from = (await said(page)).length;
  await setHook(page, 'sit', true);
  await waitSaid(page, PROMPT, 10_000, from);
  await expectHold(cam, 'bodyLine', 2);
  await page.waitForTimeout(1_500);
  const tap1 = await wallNow(page);
  await holdPanel(cam).getByRole('button', { name: 'Start next set' }).click();
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [row1] = await setRows(page);
  expect(row1?.reps).toBe(2);
  expect(Math.abs((row1?.endedAt ?? 0) - lastRep1)).toBeLessThan(600);
  // Set 2 is running at 0 (no rest mode in between), nothing said about a save.
  await expect(holdPanel(cam)).toHaveCount(0);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set');
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '2/3');
  await expect(reps(cam)).toHaveAttribute('data-reps', '0');
  expect((await texts(page)).slice(from).filter((t) => t.startsWith('Set done'))).toEqual([]);

  // Set 2: 2 reps, walk away → hold → Start next set; its rest is set 1's break.
  await setHook(page, 'sit', false);
  await repsThenFreeze(page, cam, 2);
  from = (await said(page)).length;
  await setHook(page, 'noPerson', true);
  await waitSaid(page, PROMPT, 8_000, from);
  await expectHold(cam, 'away', 2);
  await expect(holdPanel(cam)).toHaveAttribute('data-last-set', 'false');
  await holdPanel(cam).getByRole('button', { name: 'Start next set' }).click();
  await expect.poll(async () => (await setRows(page)).length).toBe(2);
  const row2 = (await setRows(page))[1];
  expect(row2?.reps).toBe(2);
  const breakSec = (tap1 - lastRep1) / 1000;
  expect(Math.abs((row2?.restTakenSec ?? 0) - breakSec)).toBeLessThan(1.5);
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '3/3');

  // Set 3 (the last): hold → Save set → saved, the camera closes.
  await setHook(page, 'noPerson', false);
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 10_000 });
  const lastRep3 = await repsThenFreeze(page, cam, 2);
  from = (await said(page)).length;
  await setHook(page, 'noPerson', true);
  await waitSaid(page, PROMPT, 8_000, from);
  await expectHold(cam, 'away', 2);
  await expect(holdPanel(cam)).toHaveAttribute('data-last-set', 'true');
  await expect(holdPanel(cam).getByRole('button', { name: 'Start next set' })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('m5c-hold-last-set.png') });
  await holdPanel(cam).getByRole('button', { name: 'Save set' }).click();
  await expect(cam).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(3);
  const row3 = (await setRows(page))[2];
  expect(row3?.reps).toBe(2);
  expect(Math.abs((row3?.endedAt ?? 0) - lastRep3)).toBeLessThan(600);
  expect((await texts(page)).filter((t) => t.startsWith('Set done'))).toEqual([]);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(5) a 2 s sit then stillness → the normal still stop, never a hold; Set done while held saves', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  await repsThenFreeze(page, cam, 2);
  let from = (await said(page)).length;
  await setHook(page, 'sit', true);
  await page.waitForTimeout(2_000);
  await setHook(page, 'sit', false);
  await waitSaid(page, 'Set done. 2 reps.', 14_000, from);
  expect((await texts(page)).slice(from)).not.toContain(PROMPT);
  await expect(holdPanel(cam)).toHaveCount(0);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 10_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(1);

  // Set 2 by hand (Start set), then a hold → Set done in the footer saves it, backdated.
  await cam.locator('[data-cam-rest="start"]').click();
  await expect(cam).toHaveAttribute('data-cam-mode', 'set');
  const lastRep = await repsThenFreeze(page, cam, 2);
  from = (await said(page)).length;
  await setHook(page, 'noPerson', true);
  await waitSaid(page, PROMPT, 8_000, from);
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect.poll(async () => (await setRows(page)).length).toBe(2);
  const row = (await setRows(page))[1];
  expect(row?.reps).toBe(2);
  expect(Math.abs((row?.endedAt ?? 0) - lastRep)).toBeLessThan(600);
  await expect(holdPanel(cam)).toHaveCount(0);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('a 10 s visibility gap (wrists hidden, person in frame) is never a hold', async ({ page }) => {
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  await repsThenFreeze(page, cam, 2);
  const from = (await said(page)).length;
  await setHook(page, 'hideWrists', true);
  await page.waitForTimeout(10_000);
  expect((await texts(page)).slice(from)).not.toContain(PROMPT);
  await expect(holdPanel(cam)).toHaveCount(0);
  await setHook(page, 'hideWrists', false);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(6) plain rest in place is unchanged: still stop → Undo window → saved → rest; 2 reps later auto-start set 2', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  const lastRep = await repsThenFreeze(page, cam, 2);
  await waitSaid(page, 'Set done. 2 reps.', 12_000);
  await expect(cam.locator('[data-auto-stop="pending"]')).toBeVisible();
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 10_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [row] = await setRows(page);
  expect(Math.abs((row?.endedAt ?? 0) - lastRep)).toBeLessThan(600);
  // Past the 10 s arming time: two push-ups in rest start set 2.
  await page.waitForTimeout(6_000);
  await page.evaluate(() => {
    window.__freezeWhenReps(2);
    window.__play();
  });
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 15_000 });
  await expect(reps(cam)).toHaveAttribute('data-reps', '2');
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '2/3');
  expect(await texts(page)).not.toContain(PROMPT);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('idle limit while held (3 min nobody in frame) saves the held set backdated and turns the camera off', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const w = watch(page);
  await installMocks(page);
  await page.goto('/');
  const cam = await openCamera(page);
  const lastRep = await repsThenFreeze(page, cam, 2);
  const from = (await said(page)).length;
  await setHook(page, 'noPerson', true);
  await waitSaid(page, PROMPT, 8_000, from);
  expect(await setRows(page)).toEqual([]);
  await waitSaid(page, 'Camera off.', 200_000, from);
  await expect(cam).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [row] = await setRows(page);
  expect(row?.reps).toBe(2);
  expect(Math.abs((row?.endedAt ?? 0) - lastRep)).toBeLessThan(600);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});
