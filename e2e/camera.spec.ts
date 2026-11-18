import { expect, test, type Locator, type Page } from './fixtures';
import { openCameraSheet, seedHandsFreeOff } from './hands-free.helpers';
import { skipExercise } from './workout.helpers';

test('camera test runs on-device pose inference on the live stream', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const sent: string[] = [];
  page.on('requestfinished', (r) => sent.push(r.url()));

  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();

  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  // Model loads and inference runs (fake camera = test pattern, so no person)
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });
  await expect
    .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 15_000 })
    .toBeGreaterThan(1);
  await expect(cam).toHaveAttribute('data-person', 'false');
  // The 3D skeleton starts collapsed behind the "3D" toggle
  const toggle3d = cam.getByRole('button', { name: '3D skeleton' });
  await expect(toggle3d).toHaveAttribute('aria-expanded', 'false');
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  await toggle3d.click();
  await expect(toggle3d).toHaveAttribute('aria-expanded', 'true');
  await expect(cam.locator('.skeleton3d canvas')).toBeVisible();

  // 3D presets
  await cam.getByRole('button', { name: 'Side' }).click();
  await expect(cam.locator('.skeleton3d')).toHaveAttribute('data-preset', 'side');

  // Switch camera keeps running
  await cam.getByRole('button', { name: 'Switch camera' }).click();
  await expect(cam.locator('.cam-stage')).toHaveAttribute('data-facing', 'environment');

  // Close stops every camera track
  await cam.getByRole('button', { name: 'Close' }).click();
  await expect(cam).toHaveCount(0);
  const live = await page.evaluate(() =>
    [...document.querySelectorAll('video')].some((v) => v.srcObject instanceof MediaStream),
  );
  expect(live).toBe(false);

  // Privacy: model + wasm come from our own origin, and nothing reaches a third party
  // (MediaPipe's usage logging is blocked by the page's CSP connect-src).
  const origin = new URL(page.url()).origin;
  const external = (u: string) =>
    !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:');
  expect(sent.filter(external)).toEqual([]);
  expect(requests.some((u) => u.startsWith(`${origin}/models/pose_landmarker_lite.task`))).toBe(
    true,
  );
  expect(requests.some((u) => u.startsWith(`${origin}/mediapipe/wasm/`))).toBe(true);
  expect(errors).toEqual([]);
});

// The native app (capacitor://) loads the wasm loader as a blob: URL and the model as a buffer
// from our own fetches (src/pose/fileset.ts). Chromium can't serve capacitor://, so force that
// path here and prove MediaPipe accepts it; on the real scheme it is chosen automatically.
test('pose model loads through the native own-fetch path (blob: loader + model buffer)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const m = (await import(
      '/src/pose/landmarker.ts' as string
    )) as typeof import('../src/pose/landmarker');
    const t = await m.createPoseTracker('CPU', { ownFetch: true });
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const frame = t.detect(c, 1);
    t.close();
    return { delegate: t.delegate, frame };
  });
  expect(out).toEqual({ delegate: 'CPU', frame: null });
  const origin = new URL(page.url()).origin;
  expect(requests).toContain(`${origin}/mediapipe/wasm/vision_wasm_internal.js`);
  expect(requests).toContain(`${origin}/models/pose_landmarker_lite.task`);
  expect(requests.some((u) => u.startsWith('blob:'))).toBe(true);
  expect(errors).toEqual([]);
});

test('pose-tracked exercises offer the camera; manual ones do not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();
  await skipExercise(page); // Lat pulldown = manual
  await expect(page.getByRole('heading', { name: 'Wide-Grip Lat Pulldown' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toHaveCount(0);
});

// M4f wave 1: the six learning rules make their exercises camera exercises. Bench press stays
// manual (no rule), so its screen never offers the camera.
test('Hammer Curls offers the camera; Dumbbell Bench Press does not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  await page
    .getByRole('dialog', { name: 'Exercise list' })
    .locator('.ex-row-btn', { hasText: 'Hammer Curls' })
    .click();
  await expect(page.getByRole('heading', { name: 'Hammer Curls' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toBeVisible();

  await page.goto('/');
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Camera', exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------------------------
// M13b task 18: one-arm sets on the camera (SPEC M13b, Decision "One-arm sets"). The pose model
// is replaced by a fixture player served in place of src/pose/landmarker.ts (as in
// hands-free.spec.ts) that plays the synthetic row clips: synthetic-01 rows with the right arm,
// synthetic-03-left with the left. Hooks: window.__clip picks the clip, window.__play() plays it
// once from frame 0 and then holds frame 0 (arm hanging, the start position), window.__noPerson
// returns no pose. The player gives one fixture frame per camera frame, every frame, whatever the
// page's fps: the counter sees exactly the frames the fixture suite counts (a starved page plays
// the clip slower, never skips a turnaround; this spec runs in the parallel phase). Times are the
// camera frame clock. Speech is mocked and recorded with wall-clock times.

const ROW_CLIPS = {
  right: '/fixtures/landmarks/row/synthetic-01__reps-4__partials-0.json',
  left: '/fixtures/landmarks/row/synthetic-03-left__reps-4__partials-0.json',
};
const SWITCH_LINE = 'Left arm. Turn so your left arm faces the phone.';
const REMIND_LINE = "Tap Next arm when you're ready.";

type RowWindow = Window & {
  __said: { text: string; at: number }[];
  __clip: 'right' | 'left';
  __noPerson: boolean;
  __playing: boolean;
  __clipDone: number;
  /** Wall-clock time the last clip played to its end. */
  __clipDoneAt: number;
  /** Wall-clock time each count was first shown on the camera (page side, no test latency). */
  __repsAt: Record<number, number>;
  __play: (clip: 'right' | 'left') => void;
};

async function installRowPlayer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as RowWindow;
    w.__said = [];
    w.__clip = 'right';
    w.__noPerson = false;
    w.__playing = false;
    w.__clipDone = 0;
    w.__clipDoneAt = 0;
    w.__repsAt = {};
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (!el.matches?.('[role=dialog] .rep-num[data-reps]')) continue;
        const n = Number(el.dataset.reps);
        if (n > 0 && !(n in w.__repsAt)) w.__repsAt[n] = Date.now();
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-reps'] });
    w.__play = (clip) => {
      w.__clip = clip;
      w.__playing = true;
    };
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
          w.__said.push({ text: u.text, at: Date.now() });
          setTimeout(() => u.dispatchEvent(new Event('end')), 300);
        },
        cancel: () => w.__said.push({ text: '<cancel>', at: Date.now() }),
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
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function createPoseTracker() {
          const clips = {
            right: await (await fetch(${JSON.stringify(ROW_CLIPS.right)})).json(),
            left: await (await fetch(${JSON.stringify(ROW_CLIPS.left)})).json(),
          };
          let idx = 0;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__noPerson) return null;
              const frames = clips[window.__clip];
              if (!window.__playing) { idx = 0; return { ...frames[0], t }; }
              const f = frames[idx++];
              if (idx >= frames.length) {
                window.__playing = false;
                window.__clipDone++;
                window.__clipDoneAt = Date.now();
                idx = 0;
              }
              return { ...f, t };
            },
            close() {},
          };
        }`,
    }),
  );
}

type RowSetRow = {
  exerciseId: string;
  reps: number;
  partials?: number;
  sides?: Partial<Record<'right' | 'left', { reps: number; partials: number }>>;
};

function rowSetRows(page: Page): Promise<RowSetRow[]> {
  return page.evaluate(
    () =>
      new Promise<RowSetRow[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as RowSetRow[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

const said = (page: Page) =>
  page.evaluate(() => (window as unknown as RowWindow).__said.map((s) => s.text));
const playClip = (page: Page, clip: 'right' | 'left') =>
  page.evaluate((c) => (window as unknown as RowWindow).__play(c), clip);
const setNoPerson = (page: Page, on: boolean) =>
  page.evaluate((v) => ((window as unknown as RowWindow).__noPerson = v), on);
/** Waits until the clip played once to the end (count settles on its last rep before that). */
async function clipDone(page: Page, n: number): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as RowWindow).__clipDone), {
      timeout: 60_000,
    })
    .toBe(n);
}

function watchRow(page: Page): { errors: string[]; thirdParty: string[] } {
  const errors: string[] = [];
  const thirdParty: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname))
      thirdParty.push(r.url());
  });
  return { errors, thirdParty };
}

/** Pull A → Start workout (One-Arm Dumbbell Row is first) → Camera, person tracked. */
async function openRowCamera(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  return openCameraSheet(page);
}

const repNum = (cam: Locator) => cam.locator('.rep-num[data-reps]');
const sideOnHud = (cam: Locator) => cam.locator('.rep-panel [data-side-label]');

test.describe('one-arm row on the camera (M13b)', () => {
  test('right arm counts, Next arm switches to the left from 0, the other arm never counts; strip not card after the first rep', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const w = watchRow(page);
    await installRowPlayer(page);
    await page.goto('/');
    await seedHandsFreeOff(page);
    const cam = await openRowCamera(page);

    // Right arm first: label over the count, Next arm in the Set done slot.
    await expect(sideOnHud(cam)).toHaveText('Right arm');
    await expect(sideOnHud(cam)).toHaveAttribute('data-side-label', 'right');
    const next = cam.getByRole('button', { name: 'Next arm' });
    const done = cam.getByRole('button', { name: 'Set done' });
    await expect(next).toBeVisible();
    await expect(done).toBeHidden();
    const nb = await next.boundingBox();
    expect(nb?.height ?? 0).toBeGreaterThanOrEqual(56);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '0');

    // The set-up card is up before the first rep (or already closed by stable tracking).
    const card = cam.locator('.cam-setup');
    const strip = cam.locator('[data-frame-strip]');

    // Right clip on the right arm: 4 reps, no partials.
    await playClip(page, 'right');
    await clipDone(page, 1);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4');
    await expect(cam.locator('.rep-partials')).toHaveAttribute('data-partials', '0');

    // The left arm rowing while the counter is on the right: nothing counts, the side stays.
    await playClip(page, 'left');
    await clipDone(page, 2);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4');
    await expect(cam.locator('.rep-partials')).toHaveAttribute('data-partials', '0');
    await expect(sideOnHud(cam)).toHaveText('Right arm');
    // Turned back with the right arm to the phone (the left clip's far right arm reads as out of
    // frame for the right-locked counter, which is right).
    await page.evaluate(() => ((window as unknown as RowWindow).__clip = 'right'));
    await expect(strip).toHaveAttribute('data-frame-strip', 'hidden', { timeout: 10_000 });

    // After the first rep, a loss shows the one-line strip at the top, never the card.
    await setNoPerson(page, true);
    await expect(strip).toHaveAttribute('data-frame-strip', 'shown', { timeout: 10_000 });
    await expect(strip).toHaveText('Step into frame');
    await page.waitForTimeout(3000);
    await expect(strip).toHaveAttribute('data-frame-strip', 'shown');
    await expect(card).toBeHidden();
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4');
    const sb = await strip.boundingBox();
    const stage = await cam.locator('.cam-stage').boundingBox();
    expect(sb && stage).toBeTruthy();
    // In the top half of the stage, nothing over the lower half.
    expect((sb?.y ?? 0) + (sb?.height ?? 0)).toBeLessThanOrEqual(
      (stage?.y ?? 0) + (stage?.height ?? 0) / 2,
    );
    await setNoPerson(page, false);
    await expect(strip).toHaveAttribute('data-frame-strip', 'hidden', { timeout: 10_000 });
    await expect(card).toBeHidden();
    await expect(sideOnHud(cam)).toHaveText('Right arm');

    // Next arm: the switch line is spoken, the counter moves to the left arm from 0.
    await next.click();
    await expect(sideOnHud(cam)).toHaveText('Left arm');
    await expect(sideOnHud(cam)).toHaveAttribute('data-side-label', 'left');
    await expect(repNum(cam)).toHaveAttribute('data-reps', '0');
    await expect(done).toBeVisible();
    await expect(next).toBeHidden();
    expect(await said(page)).toContain(SWITCH_LINE);

    // The right arm rowing now counts nothing; the left clip counts 4.
    await page.waitForTimeout(800); // past the Set done double-tap guard
    await playClip(page, 'right');
    await clipDone(page, 3);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '0');
    await expect(cam.locator('.rep-partials')).toHaveAttribute('data-partials', '0');
    await playClip(page, 'left');
    await clipDone(page, 4);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4');
    await expect(sideOnHud(cam)).toHaveText('Left arm');

    // Set done logs one set with both sides.
    await done.click();
    await expect.poll(() => rowSetRows(page), { timeout: 10_000 }).toHaveLength(1);
    const [row] = await rowSetRows(page);
    expect(row).toMatchObject({
      exerciseId: 'One-Arm_Dumbbell_Row',
      reps: 4,
      sides: { right: { reps: 4, partials: 0 }, left: { reps: 4, partials: 0 } },
    });
    expect(w.errors).toEqual([]);
    expect(w.thirdParty).toEqual([]);
  });

  test('hands-free: never ends the set on the right arm; "Tap Next arm" said once after ~6 s idle', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const w = watchRow(page);
    await installRowPlayer(page);
    await page.goto('/');
    const cam = await openRowCamera(page);
    await expect(sideOnHud(cam)).toHaveText('Right arm');
    const next = cam.getByRole('button', { name: 'Next arm' });
    await expect(next).toBeVisible();

    // Right clip: 4 reps, then he stands still (frame 0 held).
    await playClip(page, 'right');
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4', { timeout: 60_000 });
    const fourAt = await page.evaluate(() => (window as unknown as RowWindow).__repsAt[4] ?? 0);
    expect(fourAt, 'page recorded when rep 4 showed').toBeGreaterThan(0);
    await clipDone(page, 1);
    const reminders = async () => (await said(page)).filter((t) => t === REMIND_LINE).length;
    await expect.poll(reminders, { timeout: 15_000 }).toBe(1);
    const remindAt = await page.evaluate(
      (line) => (window as unknown as RowWindow).__said.find((s) => s.text === line)?.at ?? 0,
      REMIND_LINE,
    );
    // ~6 s without a rep or a tracked phase change: at least 6 s after rep 4 showed, and within
    // ~6 s of the clip's end (its tail after rep 4 plays slower on a starved page).
    const clipEndAt = await page.evaluate(() => (window as unknown as RowWindow).__clipDoneAt);
    expect(remindAt - fourAt).toBeGreaterThanOrEqual(5_500);
    expect(remindAt - clipEndAt).toBeLessThan(8_000);

    // Still far past the two-arm still stop (6 s) and the Undo window: no stop, no hold.
    await page.waitForTimeout(10_000);
    // Out of frame past the away hold (3 s): still the same set, counting on.
    await setNoPerson(page, true);
    await page.waitForTimeout(5_000);
    await setNoPerson(page, false);
    await page.waitForTimeout(3_000);
    const texts = await said(page);
    expect(texts.filter((t) => t === REMIND_LINE)).toHaveLength(1);
    expect(texts.some((t) => /^Set done\./.test(t))).toBe(false);
    expect(texts.some((t) => /on hold/i.test(t))).toBe(false);
    await expect(cam.locator('[data-auto-stop="pending"]')).toHaveCount(0);
    await expect(cam.locator('[data-cam-rest]')).toHaveCount(0);
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4');
    await expect(sideOnHud(cam)).toHaveText('Right arm');
    await expect(next).toBeVisible();
    expect(await rowSetRows(page)).toEqual([]);

    // Next arm → left: 4 reps, then the second side ends hands-free as any set does.
    await next.click();
    await expect(sideOnHud(cam)).toHaveText('Left arm');
    await expect(repNum(cam)).toHaveAttribute('data-reps', '0');
    await page.waitForTimeout(800);
    await playClip(page, 'left');
    await expect(repNum(cam)).toHaveAttribute('data-reps', '4', { timeout: 60_000 });
    await expect
      .poll(async () => (await said(page)).some((t) => t === 'Set done. 4 reps.'), {
        timeout: 30_000,
      })
      .toBe(true);
    await expect.poll(() => rowSetRows(page), { timeout: 20_000 }).toHaveLength(1);
    const [row] = await rowSetRows(page);
    expect(row).toMatchObject({
      exerciseId: 'One-Arm_Dumbbell_Row',
      reps: 4,
      sides: { right: { reps: 4, partials: 0 }, left: { reps: 4, partials: 0 } },
    });
    // The reminder belongs to the first side only.
    expect((await said(page)).filter((t) => t === REMIND_LINE)).toHaveLength(1);
    expect(w.errors).toEqual([]);
    expect(w.thirdParty).toEqual([]);
  });
});
