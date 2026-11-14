// M5c task 11: hands-free sets end to end (SPEC M5c Accept). The pose model is replaced by a
// fixture player served in place of src/pose/landmarker.ts (like camera-layout.spec.ts), with
// two hooks: window.__freezeAt = i holds fixture frame i (frame 0 = arm down, the curl's start
// position; setting it back to null replays the clip from frame 0) and window.__noPerson = true
// returns no pose. Real timers (autoSet runs on the camera frame clock); speech is mocked and
// recorded in order with wall-clock times. The curl clip completes reps ~3.3 s, ~8.3 s and
// ~13 s after it starts playing, with partials at ~5.5 s and ~10.3 s.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { endWorkout } from './workout.helpers';

const CURL = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';
const PRESS = '/fixtures/landmarks/shoulder-press/synthetic-01__reps-4__partials-0.json';
const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);
const TIP_A2 = 'Keep the weight. Aim for 8 reps.';

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
    __fxIdx: number;
    __repsAt: Record<number, number>;
    __playedAt: number;
    __play: () => void;
    __shared: File[];
    __freezeWhenReps: (n: number) => void;
  }
}

async function installMocks(page: Page, fixture: string): Promise<void> {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0; // start in the start position; tests call __play()
    window.__noPerson = false;
    window.__repsAt = {};
    window.__playedAt = 0;
    window.__play = () => {
      window.__playedAt = Date.now();
      window.__freezeAt = null;
    };
    // Freeze in the start position the moment the camera's count reaches n (no test latency:
    // the arm is back down right after a rep, before the next attempt leaves the start band).
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
          // A short "voice": the coach speech policy waits for 'end'.
          setTimeout(() => u.dispatchEvent(new Event('end')), 300);
        },
        cancel: () => window.__said.push({ text: '<cancel>', at: Date.now() }),
        resume: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
      },
    });
    // Dev-log export goes through the share sheet: keep the file.
    window.__shared = [];
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
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function createPoseTracker() {
          const frames = await (await fetch(${JSON.stringify(fixture)})).json();
          let base = null;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__noPerson) { base = null; return null; }
              if (window.__freezeAt != null) {
                base = null;
                return { ...frames[window.__freezeAt], t };
              }
              base ??= t;
              const i = Math.floor((t - base) / 33.333) % frames.length;
              window.__fxIdx = i;
              return { ...frames[i], t };
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
const play = (page: Page) => page.evaluate(() => window.__play());
const freezeWhenReps = (page: Page, n: number) =>
  page.evaluate((n) => window.__freezeWhenReps(n), n);
const wallNow = (page: Page) => page.evaluate(() => Date.now());

/** All rows of the app's IndexedDB `sets` store. */
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
            resolve(req.result as SetRow[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

function readSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    (k) =>
      new Promise<unknown>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('settings').objectStore('settings').get(k);
          req.onsuccess = () => {
            open.result.close();
            resolve((req.result as { value?: unknown } | undefined)?.value);
          };
          req.onerror = () => reject(req.error);
        };
      }),
    key,
  );
}

/** Day → Start workout → Exercise list → `exercise` → Camera (set 1 running). */
async function openCamera(page: Page, day: RegExp, exercise: string): Promise<Locator> {
  await page.getByRole('button', { name: day }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: exercise }).click();
  await expect(page.getByRole('heading', { name: exercise })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 15_000 });
  return cam;
}

const reps = (cam: Locator) => cam.locator('.rep-num[data-reps]');
const banner = (cam: Locator) => cam.locator('[data-auto-stop="pending"]');

/** Plays the clip from the start position and holds it once `n` reps are counted. */
async function repsThenFreeze(page: Page, cam: Locator, n: number): Promise<number> {
  await freezeWhenReps(page, n);
  await play(page);
  await expect(reps(cam)).toHaveAttribute('data-reps', String(n), { timeout: 20_000 });
  expect(await page.evaluate(() => window.__freezeAt)).toBe(0);
  return wallNow(page);
}

/** m:ss → seconds. */
const clockSec = (text: string) => {
  const m = /^(\d+):(\d\d)$/.exec(text.trim());
  if (!m) throw new Error(`not a rest clock: ${text}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

test.describe.configure({ timeout: 120_000 });

test('(i, v) still → "Set done. 2 reps." + Undo; saved only after the window, backdated; tip spoken at the save', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await expect(cam).not.toHaveAttribute('data-cam-mode', 'rest');

  const frozenAt = await repsThenFreeze(page, cam, 2);
  const lastRepAt = await page.evaluate(() => window.__repsAt[2] ?? 0);

  // ~6 s still in the start band → the stop is proposed and spoken (nothing saved yet).
  await expect(banner(cam)).toBeVisible({ timeout: 10_000 });
  await expect(banner(cam)).toHaveAttribute('data-reason', 'still');
  const doneSaid = (await said(page)).find((s) => s.text === 'Set done. 2 reps.');
  expect(doneSaid, 'Set done spoken').toBeTruthy();
  const stillMs = (doneSaid?.at ?? 0) - frozenAt;
  expect(stillMs).toBeGreaterThanOrEqual(5_500);
  expect(stillMs).toBeLessThanOrEqual(8_000);
  await expect(banner(cam).locator('[data-auto-stop="reps"]')).toHaveText('2');
  const undo = cam.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  const box = await undo.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  const secs = banner(cam).locator('[data-auto-stop="seconds"]');
  const firstSecs = Number(await secs.textContent());
  expect(firstSecs).toBeGreaterThanOrEqual(3);
  expect(firstSecs).toBeLessThanOrEqual(5);
  await expect.poll(async () => Number(await secs.textContent())).toBeLessThan(firstSecs);
  // Delayed save: no row while the window is open.
  expect(await setRows(page)).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('hands-free-pending-undo.png') });

  // Window over → the set is saved with the backdated end and the camera is in rest mode.
  await expect.poll(async () => (await setRows(page)).length, { timeout: 8_000 }).toBe(1);
  const [row] = await setRows(page);
  expect(row?.exerciseId).toBe('Dumbbell_Bicep_Curl');
  expect(row?.reps).toBe(2);
  expect(Math.abs((row?.endedAt ?? 0) - lastRepAt)).toBeLessThan(500);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  await expect(banner(cam)).toHaveCount(0);
  // Rest clock already ~11 s into the 60 s rest (the time since the last rep).
  const clock = cam.locator('[data-cam-rest-clock]');
  await expect(clock).toBeVisible();
  const left = clockSec((await clock.textContent()) ?? '');
  const since = Math.round(((await wallNow(page)) - (row?.endedAt ?? 0)) / 1000);
  expect(since).toBeGreaterThanOrEqual(10);
  expect(Math.abs(60 - since - left)).toBeLessThanOrEqual(1);
  expect(left).toBeLessThanOrEqual(50);
  await expect(cam.locator('[data-cam-rest="next"]')).toContainText('Set 2 of 3');

  // (v) Speech order: last count word → "Set done" → the coach tip at the save, nothing cut off.
  await expect.poll(() => texts(page)).toContain(TIP_A2);
  const list = await said(page);
  const tail = list.slice(list.map((s) => s.text).lastIndexOf('Two'));
  expect(tail.map((s) => s.text)).toEqual(['Two', 'Set done. 2 reps.', TIP_A2]);
  const tipAt = tail[2]?.at ?? 0;
  const savedAt = (doneSaid?.at ?? 0) + 5_000;
  expect(Math.abs(tipAt - savedAt)).toBeLessThan(1_500); // at the save, not 2 s into a fresh rest
  // Still once, a few seconds later (the 2 s rest rule doesn't say it again).
  await page.waitForTimeout(3_000);
  expect((await texts(page)).filter((t) => t === TIP_A2)).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(ii) Undo → "Keep going.", nothing saved, counting continues; the next still stop waits 12 s', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  await expect(banner(cam)).toBeVisible({ timeout: 10_000 });
  await cam.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => texts(page)).toContain('Keep going.');
  // Past the end of the window: still nothing saved, still the set.
  await page.waitForTimeout(6_000);
  expect(await setRows(page)).toEqual([]);
  await expect(cam).not.toHaveAttribute('data-cam-mode', 'rest');
  await expect(cam.locator('[data-auto-stop="undo"]')).toHaveCount(0);

  // Counting goes on from 2.
  const frozenAt = await repsThenFreeze(page, cam, 3);
  await expect(reps(cam)).toHaveText('3');
  // After a cancel the still stop needs 2 × 6 s.
  await page.waitForTimeout(9_000);
  expect((await texts(page)).filter((t) => t.startsWith('Set done'))).toHaveLength(1);
  await expect.poll(() => texts(page), { timeout: 8_000 }).toContain('Set done. 3 reps.');
  const second = (await said(page)).find((s) => s.text === 'Set done. 3 reps.');
  expect((second?.at ?? 0) - frozenAt).toBeGreaterThanOrEqual(11_000);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(iii) a rep inside the window cancels the stop without a tap', async ({ page }) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  await expect(banner(cam)).toBeVisible({ timeout: 10_000 });
  // The next rep ends ~3.3 s after playing resumes: inside the 5 s window.
  await freezeWhenReps(page, 3);
  await play(page);
  await expect(reps(cam)).toHaveAttribute('data-reps', '3', { timeout: 8_000 });
  await expect.poll(() => texts(page)).toContain('Keep going.');
  const list = await texts(page);
  expect(list.indexOf('Keep going.')).toBeGreaterThan(list.indexOf('Set done. 2 reps.'));
  await expect(cam.locator('[data-auto-stop="undo"]')).toHaveCount(0, { timeout: 3_000 });
  await page.waitForTimeout(3_000);
  expect(await setRows(page)).toEqual([]);
  await expect(cam).not.toHaveAttribute('data-cam-mode', 'rest');
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(iv) rest mode: reps before 10 s of rest start nothing; later 2 reps auto-start set 2, backdated', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  // Manual Set done: rest starts now (not backdated); hands-free keeps the camera, in rest mode.
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  // Two reps at ~4 s and ~9 s of rest (before arming), then hold.
  await page.evaluate(() => {
    setTimeout(() => window.__play(), 500);
    setTimeout(() => (window.__freezeAt = 0), 500 + 8_800);
  });
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [set1] = await setRows(page);
  await page.waitForTimeout(12_500);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  expect(await page.locator('[data-rest-clock]').count()).toBe(1); // still the Rest screen
  const afterDone = (await texts(page)).slice((await texts(page)).lastIndexOf('Two') + 1);
  expect(afterDone.filter((t) => /^(One|Two|Three)$/.test(t))).toEqual([]); // rest is silent

  // Armed: two reps ≤ 8 s apart start set 2, the first word being "Two".
  await play(page);
  const playedAt = await page.evaluate(() => window.__playedAt);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 12_000 });
  await page.evaluate(() => (window.__freezeAt = 0));
  await expect(reps(cam)).toHaveText('2');
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '2/3');
  await expect(page.locator('[data-rest-clock]')).toHaveCount(0);
  const counts = (await texts(page)).filter((t) => /^(One|Two|Three)$/.test(t));
  expect(counts.at(-1)).toBe('Two');
  expect(counts.filter((t) => t === 'Two')).toHaveLength(2); // set 1's and set 2's
  await page.screenshot({ path: test.info().outputPath('hands-free-auto-started.png') });

  // Save set 2 by hand: its start and rest taken are the backdated departure of the first rep.
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect.poll(async () => (await setRows(page)).length).toBe(2);
  const set2 = (await setRows(page))[1];
  expect(set2?.setIndex).toBe(1);
  expect(set2?.startedAt ?? 0).toBeGreaterThan(playedAt + 500);
  expect(set2?.startedAt ?? 0).toBeLessThan(playedAt + 3_300); // before the first rep ended
  expect(set2?.restTakenSec).toBe(
    Math.round(((set2?.startedAt ?? 0) - (set1?.endedAt ?? 0)) / 1000),
  );
  expect(set2?.restTakenSec ?? 0).toBeGreaterThanOrEqual(14);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test("(vi) the exercise's last set closes the camera; Rest's Camera opens the next pose exercise in rest mode", async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, PRESS);
  await page.goto('/');
  const cam = await openCamera(page, /Push A/, 'Seated Dumbbell Press');
  // Sets 1 and 2 by hand; the sheet stays open between them.
  for (const n of [1, 2]) {
    await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', `${n}/3`);
    await cam.getByRole('button', { name: 'Set done' }).click();
    await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
    await cam.locator('[data-cam-rest="start"]').click();
    await expect(cam).not.toHaveAttribute('data-cam-mode', 'rest');
  }
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '3/3');
  // Set 3 hands-free: reps, still, window, save → the press is finished → the camera closes.
  await repsThenFreeze(page, cam, 2);
  await expect(banner(cam)).toBeVisible({ timeout: 10_000 });
  await expect(cam).toHaveCount(0, { timeout: 8_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(3);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  // The last set's next-time tip (2 reps < 7 → N2 "repeat 12.5 kg") is spoken at the save,
  // although the camera closed in the same dispatch: "Set done" → tip, nothing cancelled.
  await expect(page.locator('[data-coach-tip]')).toHaveAttribute('data-advice-rule', 'N2');
  await expect(page.locator('[data-coach-tip] [data-coach="text"]')).toHaveText(
    'Next time on Seated Dumbbell Press: repeat 12.5 kg.',
  );
  const NEXT_TIME = /^Next time on Seated Dumbbell Press: repeat 12\.5 /;
  await expect.poll(async () => (await texts(page)).some((t) => NEXT_TIME.test(t))).toBe(true);
  {
    const list = await said(page);
    const tail = list.slice(list.map((s) => s.text).lastIndexOf('Set done. 2 reps.'));
    expect(tail.map((s) => s.text)).toHaveLength(2);
    expect(tail[0]?.text).toBe('Set done. 2 reps.');
    expect(tail[1]?.text).toMatch(NEXT_TIME);
    // At the save (end of the 5 s window), not 2 s into a fresh rest.
    const gap = (tail[1]?.at ?? 0) - (tail[0]?.at ?? 0);
    expect(gap).toBeGreaterThanOrEqual(4_000);
    expect(gap).toBeLessThan(6_500);
  }
  const camBtn = page.getByRole('button', { name: 'Camera', exact: true });
  await expect(camBtn).toBeVisible(); // Side Lateral Raise is next and pose-tracked
  expect((await camBtn.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await page.screenshot({ path: test.info().outputPath('hands-free-rest-camera-button.png') });
  await camBtn.click();
  const next = page.getByRole('dialog', { name: 'Camera' });
  await expect(next).toHaveAttribute('data-cam-mode', 'rest');
  await expect(next.locator('[data-cam-rest-clock]')).toBeVisible();
  await expect(next.locator('[data-cam-rest="next"]')).toContainText('Set 1 of 5');
  await expect(next.locator('[data-cam-rest="start"]')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('hands-free-camera-rest.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(vii) "Hands-free sets" off (persisted) → no auto stop; Set done closes the camera (M4)', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sw = page.locator('[data-setting="hands-free"]');
  await expect(sw).toHaveAttribute('aria-checked', 'true'); // default on
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect.poll(() => readSetting(page, 'handsFree')).toBe(false);
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('[data-setting="hands-free"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await page.screenshot({ path: test.info().outputPath('hands-free-setting-off.png') });
  await page.getByRole('button', { name: '‹ Back' }).click();

  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  await page.waitForTimeout(15_000);
  await expect(cam.locator('[data-auto-stop]')).toHaveCount(0);
  expect((await texts(page)).filter((t) => t.startsWith('Set done'))).toEqual([]);
  expect(await setRows(page)).toEqual([]);
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await expect.poll(async () => (await setRows(page)).map((r) => r.reps)).toEqual([2]);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('out of frame: no person for 3 s after 2 reps → the set goes on hold (M5c break), nothing saved', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  const lastRepAt = await page.evaluate(() => window.__repsAt[2] ?? 0);
  const goneAt = await page.evaluate(() => {
    window.__noPerson = true;
    return Date.now();
  });
  const hold = cam.locator('[data-hold]');
  await expect(hold).toBeVisible({ timeout: 6_000 });
  await expect(hold).toHaveAttribute('data-reason', 'away');
  await expect(hold.locator('[data-hold-title]')).toHaveText('On hold · 2 reps');
  await expect(hold.locator('[data-hold-clock]')).toBeVisible();
  const prompt = (await said(page)).find((s) => s.text === 'Set on hold. Tap to continue.');
  expect((prompt?.at ?? 0) - goneAt).toBeGreaterThanOrEqual(2_500);
  expect((prompt?.at ?? 0) - goneAt).toBeLessThan(5_500);
  for (const name of ['Continue set', 'Start next set']) {
    const box = await hold.getByRole('button', { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  }
  // Past the Undo window's length: still on hold, no "Set done", no stop banner, no row.
  await page.waitForTimeout(6_000);
  await expect(hold).toBeVisible();
  await expect(cam.locator('[data-auto-stop]')).toHaveCount(0);
  expect((await texts(page)).filter((t) => t.startsWith('Set done'))).toEqual([]);
  expect(await setRows(page)).toEqual([]);
  // Set done while held saves the held set, backdated to its last rep.
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect.poll(async () => (await setRows(page)).map((r) => r.reps)).toEqual([2]);
  const [row] = await setRows(page);
  expect(Math.abs((row?.endedAt ?? 0) - lastRepAt)).toBeLessThan(500);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  await expect(hold).toHaveCount(0);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(b) Close during the Undo window saves the set (backdated) and closes the sheet', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  await repsThenFreeze(page, cam, 2);
  const lastRepAt = await page.evaluate(() => window.__repsAt[2] ?? 0);
  await expect(banner(cam)).toBeVisible({ timeout: 10_000 });
  expect(await setRows(page)).toEqual([]);
  await cam.locator('.cam-top').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(cam).toHaveCount(0);
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [row] = await setRows(page);
  expect(row?.reps).toBe(2);
  expect(Math.abs((row?.endedAt ?? 0) - lastRepAt)).toBeLessThan(500);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

type DevLogExport = {
  format: string;
  sessions: {
    events: { type: string; t: number; data?: { action?: string; reason?: string } }[];
    sets: {
      exerciseId: string;
      setIndex: number;
      startedAt: number;
      endedAt?: number;
      camera?: {
        folder: string;
        delegate: string;
        wallT0?: number;
        frames: { t: number; landmarks: unknown[] | null }[];
        repEvents: unknown[];
        speech: { text: string; kind: string }[];
      };
    }[];
  }[];
};

test('(a) dev log: an auto-started set has its camera meta, rep events, speech and a 1.5 s pre-roll', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  const cam = await openCamera(page, /Pull A/, 'Dumbbell Bicep Curl');
  // Set 1: auto stop → saved → rest mode.
  await repsThenFreeze(page, cam, 2);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 15_000 });
  // Set 2: auto start in rest mode (armed: the rest is backdated past 10 s), then auto stop.
  await page.waitForTimeout(5_500); // past the 5 s after an auto stop
  // One more rep inside set 2: the two starting reps happen in rest, before the set opens, so
  // their rep events aren't in it (the pre-roll carries frames and angles only).
  await freezeWhenReps(page, 3);
  await play(page);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 12_000 });
  await expect(reps(cam)).toHaveAttribute('data-reps', '3', { timeout: 10_000 });
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 15_000 });
  await expect.poll(async () => (await setRows(page)).length).toBe(2);

  // End → Summary → Done → Settings → Export last session (mocked share sheet).
  await cam.locator('[data-cam-rest="close"]').click();
  await expect(cam).toHaveCount(0);
  await endWorkout(page);
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.locator('[data-devlog=panel]');
  await panel.locator('[data-devlog=export-last]').click();
  await expect(panel.locator('[data-devlog=status]')).toHaveText('Shared.', { timeout: 15_000 });
  const text = await page.evaluate(async () => {
    const file = window.__shared.at(-1);
    if (!file) return '';
    const stream = file.name.endsWith('.gz')
      ? file.stream().pipeThrough(new DecompressionStream('gzip'))
      : file.stream();
    return new Response(stream).text();
  });
  const log = JSON.parse(text) as DevLogExport;
  const session = log.sessions[0];
  if (!session) throw new Error('no session in the export');
  const curl = session.sets.filter((s) => s.exerciseId === 'Dumbbell_Bicep_Curl');
  expect(curl.map((s) => s.setIndex)).toEqual([0, 1]);
  const set2 = curl[1];
  const camera = set2?.camera;
  if (!set2 || !camera) throw new Error('set 2 has no camera data');
  expect(camera.folder).toBe('curl');
  expect(camera.delegate).toBe('CPU');
  expect(camera.wallT0 ?? 0).toBeGreaterThan(0);
  expect(camera.repEvents.length).toBeGreaterThanOrEqual(1);
  expect(camera.speech.map((s) => s.text)).toEqual(expect.arrayContaining(['Two', 'Three']));
  expect(camera.speech.some((s) => s.kind === 'count' && s.text === 'Two')).toBe(true);
  // Pre-roll: the first frame is ~1.5 s before the backdated start (on the camera frame clock).
  const startFt = set2.startedAt - (camera.wallT0 ?? 0);
  const firstT = Math.min(...camera.frames.map((f) => f.t));
  expect(startFt - firstT).toBeGreaterThan(1_000);
  expect(startFt - firstT).toBeLessThan(2_000);
  const auto = session.events.filter((e) => e.type === 'autoSet').map((e) => e.data?.action ?? '');
  expect(auto).toEqual(expect.arrayContaining(['stopPending', 'commit', 'start']));
  expect(auto.filter((a) => a === 'commit')).toHaveLength(2);

  // The converter turns both sets into fixtures (dry run: nothing written).
  const file = test.info().outputPath('devlog-hands-free.json');
  writeFileSync(file, text);
  const out = execFileSync('node', ['scripts/devlog.mjs', file, '--dry-run'], {
    encoding: 'utf8',
  });
  expect(out).toMatch(/2 set\(s\): 2 would be written, 0 kept \(exists\), 0 skipped/);
  expect(out).not.toContain('skipped:');
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});
