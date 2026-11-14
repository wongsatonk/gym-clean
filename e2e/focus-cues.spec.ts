// M5 task 14: live focus cues end to end (PROGRESS M5 task 14, cue mechanics Decision). The pose
// model is replaced by a fixture player served in place of src/pose/landmarker.ts (like
// hands-free.spec.ts), with hooks:
//   __freezeAt = i      hold fixture frame i (null = play; playing restarts at __from)
//   __from = i          frame the next play starts at (default 0)
//   __noPerson = true   no pose at all (walked away)
//   __hideWrists = true elbows + wrists invisible, the rest of the body in view
//   __slowMs = n        each detect() busy-waits n ms (low frame rate)
// Real timers; speech is mocked and recorded in order with wall-clock times (each utterance
// "speaks" 300 ms, then fires 'end').
//
// Clips: the rushed-lowering curl (8 reps; reps 1–4 lower in ~2 s, reps 5–8 in ~0.6 s; counts at
// ~4.3, 8.2, 12.1, 15.9, 19.0, 21.5, 24.0, 26.5 s; frame 75 = the top of the curl, frame 0 = arm
// down) and the M4 curl clip (3 reps + 2 partials: reps ~3.3, 8.3, 13 s, partials ~5.5, 10.3 s).
// The other synthetic-03 flaw clips are covered by src/core/focus.replay.test.ts; here the
// disabled elbowDrift / bodySwing rules are checked as "never spoken" across every test.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedHandsFreeOff } from './hands-free.helpers';

const RUSHED = '/fixtures/landmarks/curl/synthetic-03-rushed-lowering__reps-8__partials-0.json';
const CURL = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';
/** Rushed clip: the top of the first curl (elbow ~28°), outside the start band. */
const FAR_FRAME = 75;
/** Rushed clip: arm down just before rep 5 (the first rushed rep). */
const RUSHED_REPS_FROM = 495;
const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);
const CURL_ID = 'Dumbbell_Bicep_Curl';

const CUE = {
  rushedLowering: 'Slow the lowering.',
  outOfFrame: 'Step back into frame.',
  lowFps: 'Move closer to the light.',
  elbowDrift: 'Keep your elbow still.',
  bodySwing: 'Keep your body still.',
} as const;
const stalled = (toGo: number) => `Stay with it. ${toGo} to go.`;
const isFocusText = (t: string) =>
  (Object.values(CUE) as string[]).includes(t) || t.startsWith('Stay with it.');

type Said = { text: string; at: number };
type SetRow = {
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  cues?: string[];
  focusScore?: number | null;
};
type ExportEvent = { type: string; t: number; data?: Record<string, unknown> };
type ExportLog = {
  sessions: {
    events: ExportEvent[];
    sets: {
      exerciseId: string;
      setIndex: number;
      camera?: { speech: { text: string; kind: string; dropped?: string }[] };
    }[];
  }[];
};

declare global {
  interface Window {
    __said: Said[];
    __freezeAt: number | null;
    __from: number;
    __noPerson: boolean;
    __hideWrists: boolean;
    __slowMs: number;
    __play: () => void;
    __holdWhenReps: (n: number, frame: number) => void;
    __shared: File[];
  }
}

async function installMocks(page: Page, fixture: string): Promise<void> {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0; // start in the start position; tests call __play()
    window.__from = 0;
    window.__noPerson = false;
    window.__hideWrists = false;
    window.__slowMs = 0;
    window.__play = () => {
      window.__freezeAt = null;
    };
    // Hold `frame` the moment the camera's count reaches n (no test latency).
    window.__holdWhenReps = (n: number, frame: number) => {
      const check = () => {
        const el = document.querySelector<HTMLElement>('[role=dialog] .rep-num[data-reps]');
        if (el && Number(el.dataset.reps) >= n) {
          window.__freezeAt = frame;
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
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: unknown = null;
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
        addEventListener: () => undefined,
        speaking: false,
        pending: false,
      },
    });
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
        const HIDE = new Set([13, 14, 15, 16]);
        const hide = (pts) => pts && pts.map((p, i) => (HIDE.has(i) ? { ...p, visibility: 0 } : p));
        export async function createPoseTracker() {
          const frames = await (await fetch(${JSON.stringify(fixture)})).json();
          let base = null;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__slowMs > 0) {
                const until = performance.now() + window.__slowMs;
                while (performance.now() < until) {}
              }
              if (window.__noPerson) { base = null; return null; }
              let f;
              if (window.__freezeAt != null) {
                base = null;
                f = frames[window.__freezeAt];
              } else {
                base ??= t;
                f = frames[(window.__from + Math.floor((t - base) / 33.333)) % frames.length];
              }
              if (window.__hideWrists) f = { ...f, landmarks: hide(f.landmarks), world: hide(f.world) };
              return { ...f, t };
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
const play = (page: Page, from = 0) =>
  page.evaluate((from) => {
    window.__from = from;
    window.__play();
  }, from);
const freezeWhenReps = (page: Page, n: number, frame = 0) =>
  page.evaluate(([n, frame]) => window.__holdWhenReps(n, frame), [n, frame] as const);
const setHook = (page: Page, hook: 'noPerson' | 'hideWrists', on: boolean) =>
  page.evaluate(
    ([hook, on]) => {
      if (hook === 'noPerson') window.__noPerson = on;
      else window.__hideWrists = on;
    },
    [hook, on] as const,
  );
const wallNow = (page: Page) => page.evaluate(() => Date.now());

/** Waits until `text` has been said (after index `from` of the speech log); returns the entry. */
async function waitSaid(page: Page, text: string, timeout: number, from = 0): Promise<Said> {
  await expect
    .poll(async () => (await texts(page)).slice(from).includes(text), { timeout })
    .toBe(true);
  const list = await said(page);
  const hit = list.slice(from).find((s) => s.text === text);
  if (!hit) throw new Error(`not said: ${text}`);
  return hit;
}

/** The non-cancel entry said just before `entry` (the speech log is in order). */
function saidBefore(list: Said[], entry: Said): Said | undefined {
  const i = list.findIndex((s) => s.text === entry.text && s.at === entry.at);
  return list
    .slice(0, i)
    .reverse()
    .find((s) => s.text !== '<cancel>');
}

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
const curlRows = async (page: Page) =>
  (await setRows(page))
    .filter((r) => r.exerciseId === CURL_ID)
    .sort((a, b) => a.setIndex - b.setIndex);

/** Pull A → Start workout (the row is first). */
async function startPullA(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
}

/** Exercise list → curl (starting its set if the jump left us on Rest). */
async function goToCurl(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' }).click();
  const startSet = page.getByRole('button', { name: 'Start set' });
  if (await startSet.isVisible()) await startSet.click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bicep Curl' })).toBeVisible();
}

/** Camera on the current (exercise-phase) set; waits for the fixture person. */
async function openCam(page: Page): Promise<Locator> {
  await page.evaluate(() => (window.__freezeAt = 0));
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 15_000 });
  return cam;
}

const reps = (cam: Locator) => cam.locator('.rep-num[data-reps]');

/** Plays the clip and holds `frame` once `n` reps are counted. */
async function repsThenFreeze(page: Page, cam: Locator, n: number, frame = 0): Promise<number> {
  await freezeWhenReps(page, n, frame);
  await play(page);
  await expect(reps(cam)).toHaveAttribute('data-reps', String(n), { timeout: 45_000 });
  return wallNow(page);
}

/** End workout (two taps) → Summary. */
async function endWorkout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'Tap again to end' }).click();
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
}

/** Fix last set: steps reps / partials to the given values and saves. */
async function fixLastSet(page: Page, r: number, p: number): Promise<void> {
  const fix = page.locator('[data-lsc=panel]');
  await fix.locator('[data-lsc=fix]').click();
  const repsValue = fix.locator('[data-lsc=reps-value]');
  const partialsValue = fix.locator('[data-lsc=partials-value]');
  for (let i = 0; i < 40 && Number(await repsValue.textContent()) !== r; i++) {
    const n = Number(await repsValue.textContent());
    await fix.locator(n > r ? '[data-lsc=reps-minus]' : '[data-lsc=reps-plus]').click();
  }
  for (let i = 0; i < 40 && Number(await partialsValue.textContent()) !== p; i++) {
    const n = Number(await partialsValue.textContent());
    await fix.locator(n > p ? '[data-lsc=partials-minus]' : '[data-lsc=partials-plus]').click();
  }
  await expect(repsValue).toHaveText(String(r));
  await expect(partialsValue).toHaveText(String(p));
  await fix.locator('[data-lsc=save]').click();
}

/** Disabled rules (elbow drift, body swing on the curl) never speak; no focus text twice in 6 s. */
async function commonSpeechChecks(page: Page): Promise<void> {
  const list = await said(page);
  expect(list.map((s) => s.text)).not.toContain(CUE.elbowDrift);
  expect(list.map((s) => s.text)).not.toContain(CUE.bodySwing);
  const focus = list.filter((s) => isFocusText(s.text)).map((s) => s.at);
  focus.slice(1).forEach((at, k) => expect(at - (focus[k] ?? 0)).toBeGreaterThanOrEqual(5_900));
}

test.describe.configure({ timeout: 180_000 });

test('(1, 6, 7, 8) rushed sets: cue after a count word; rows scored; Summary Focus + T1; Fix recomputes; manual set unscored', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, RUSHED);
  await page.goto('/');
  await seedHandsFreeOff(page); // per-set camera: Set done closes the sheet
  await startPullA(page);

  // A manual set (no camera): no focus score.
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await goToCurl(page);

  // Set 1: 8 reps, rushed lowering on 5–8.
  let cam = await openCam(page);
  await repsThenFreeze(page, cam, 8);
  const cueSaid = await waitSaid(page, CUE.rushedLowering, 10_000);
  const list = await said(page);
  const before = saidBefore(list, cueSaid);
  // Said right after a count word had finished (the mock voice speaks 300 ms), never over it,
  // and only after the 2-rep baseline plus two rushed reps (rep 6).
  expect(before?.text).toBe('Six');
  expect(cueSaid.at - (before?.at ?? NaN)).toBeGreaterThanOrEqual(250);
  // Fired twice (reps 6 and 8) but spoken once: the second is inside the 6 s hint gap.
  expect(list.filter((s) => s.text === CUE.rushedLowering)).toHaveLength(1);
  // Shown in the coach line (≥ 20px) with its id.
  const coach = cam.locator('.rep-coach[data-cue="rushedLowering"]');
  await expect(coach).toHaveText(CUE.rushedLowering);
  expect(
    await coach.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect.poll(async () => (await curlRows(page)).length).toBe(1);
  let [c1] = await curlRows(page);
  expect(c1?.reps).toBe(8);
  expect(c1?.cues).toEqual(['rushedLowering', 'rushedLowering']);
  expect(c1?.focusScore).toBe(80);
  const manual = (await setRows(page)).find((r) => r.exerciseId !== CURL_ID);
  expect(manual).toBeDefined();
  expect(manual?.focusScore ?? null).toBeNull();
  expect(manual?.cues).toBeUndefined();

  // Fix on Rest: one partial → 100 − 2×10 − 5 = 75 (recomputed from the stored cue ids).
  await fixLastSet(page, 8, 1);
  await expect.poll(async () => (await curlRows(page))[0]?.focusScore).toBe(75);
  [c1] = await curlRows(page);
  expect(c1?.cues).toEqual(['rushedLowering', 'rushedLowering']);

  // Set 2: the same clip.
  await page.getByRole('button', { name: 'Start set' }).click();
  const from = (await said(page)).length;
  cam = await openCam(page);
  await repsThenFreeze(page, cam, 8);
  await waitSaid(page, CUE.rushedLowering, 10_000, from);
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect.poll(async () => (await curlRows(page)).length).toBe(2);
  expect((await curlRows(page))[1]?.focusScore).toBe(80);

  // Summary: Focus per camera set (score ≥ 64px), cue counts, no row for the manual exercise.
  await endWorkout(page);
  const focus = page.locator('[data-focus-summary]');
  await expect(focus.getByRole('heading', { name: 'Focus' })).toBeVisible();
  await expect(focus.locator('[data-focus-exercise]')).toHaveCount(1);
  const curlFocus = focus.locator(`[data-focus-exercise="${CURL_ID}"]`);
  const s1 = curlFocus.locator('[data-focus-set="1"]');
  const s2 = curlFocus.locator('[data-focus-set="2"]');
  await expect(s1).toHaveAttribute('data-focus-score', '75');
  await expect(s2).toHaveAttribute('data-focus-score', '80');
  await expect(s2.locator('.focus-score')).toHaveText('80');
  expect(
    await s2.locator('.focus-score').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(64);
  await expect(s1.locator('[data-focus-cue="rushedLowering"]')).toHaveText('Slow the lowering ×2');
  await expect(s1.locator('[data-focus-partials]')).toHaveText('1 partial');
  // Coach: two rushed sets → T1.
  const coachRow = page.locator(`[data-coach-exercise="${CURL_ID}"]`);
  await expect(coachRow).toHaveAttribute('data-advice-rule', 'T1');
  await expect(coachRow.locator('[data-coach=next]')).toContainText('lower for 2 seconds');
  await page.screenshot({ path: test.info().outputPath('focus-summary.png') });

  // Fix last set on Summary: one partial → 75 on screen and in the DB.
  await fixLastSet(page, 8, 1);
  await expect(s2).toHaveAttribute('data-focus-score', '75');
  await expect.poll(async () => (await curlRows(page))[1]?.focusScore).toBe(75);
  // A fix to 0 reps removes the score (and the set's Focus row).
  await fixLastSet(page, 0, 0);
  await expect(s2).toHaveCount(0);
  await expect.poll(async () => (await curlRows(page))[1]?.focusScore ?? null).toBeNull();
  await expect(s1).toHaveAttribute('data-focus-score', '75');

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await commonSpeechChecks(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(9) drill persona: the cue is spoken rewritten and logged as spoken; dev log has focusCue/focusScore; converter prints them', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, RUSHED);
  await page.goto('/');
  await seedHandsFreeOff(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.locator('[data-coach-voice]').getByRole('button', { name: 'Drill sergeant' }).click();
  await expect(page.locator('[data-coach-voice] [data-rudeness="2"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /Back/ }).click();
  await startPullA(page);
  await goToCurl(page);

  const cam = await openCam(page);
  await repsThenFreeze(page, cam, 8);
  const lines = await page.evaluate(async () => {
    const p = '/src/core/personas.ts';
    const m = (await import(p)) as {
      drillVariants: (c: string, k: string, l: number) => string[];
    };
    return m.drillVariants('Slow the lowering.', 'hint', 2);
  });
  await expect
    .poll(async () => (await texts(page)).some((t) => lines.includes(t)), { timeout: 10_000 })
    .toBe(true);
  const spoken = (await texts(page)).find((t) => lines.includes(t)) ?? '';
  expect(await texts(page)).not.toContain(CUE.rushedLowering); // never the calm line…
  // …but the screen shows the calm cue text.
  await expect(cam.locator('.rep-coach[data-cue="rushedLowering"]')).toHaveText(CUE.rushedLowering);
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await endWorkout(page);
  await page.getByRole('button', { name: 'Done' }).click();

  // Settings → Export last session (mocked share sheet).
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
  const session = (JSON.parse(text) as ExportLog).sessions[0];
  if (!session) throw new Error('no session in the export');

  // focusCue: one per detection (reps 6 and 8), ids and numbers only.
  const cues = session.events.filter((e) => e.type === 'focusCue');
  expect(cues.map((e) => e.data?.id)).toEqual(['rushedLowering', 'rushedLowering']);
  expect(cues.map((e) => e.data?.reps)).toEqual([6, 8]);
  for (const e of cues) {
    const d = e.data ?? {};
    expect(Object.keys(d).sort()).toEqual(
      ['baseline', 'id', 'reps', 't', 'threshold', 'value'].sort(),
    );
    for (const k of ['t', 'reps', 'value', 'baseline', 'threshold'])
      expect(typeof d[k], k).toBe('number');
    expect(Number(d.value)).toBeLessThan(Number(d.threshold));
  }
  const scores = session.events.filter((e) => e.type === 'focusScore');
  expect(scores.map((e) => e.data)).toEqual([{ score: 80, cues: 2, partials: 0 }]);
  // The speech log has the line actually spoken (the drill rewrite), as a hint.
  const set = session.sets.find((s) => s.exerciseId === CURL_ID);
  const speech = set?.camera?.speech ?? [];
  expect(speech.some((s) => s.kind === 'hint' && s.text === spoken && !s.dropped)).toBe(true);
  expect(speech.some((s) => s.text === CUE.rushedLowering && !s.dropped)).toBe(false);

  // The converter prints the focus section (dry run: nothing written).
  const file = test.info().outputPath('devlog-focus.json');
  writeFileSync(file, text);
  const out = execFileSync('node', ['scripts/devlog.mjs', file, '--dry-run'], {
    encoding: 'utf8',
  });
  expect(out).toContain('Focus cues:');
  expect(out).toMatch(/score 80 \(2 cues, 0 partials\)/);
  expect(out).toMatch(/rep 6\s+rushedLowering/);
  expect(out).toMatch(/rep 8\s+rushedLowering/);

  await commonSpeechChecks(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(2, 3) hands-free: rushed reps in rest mode → no cue; auto-started set seeds the baseline and cues; none in the Undo window', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, RUSHED);
  await page.goto('/');
  await startPullA(page);
  await goToCurl(page);
  const cam = await openCam(page);

  // Set 1: 2 reps, then Set done by hand (rest starts now, so auto start waits 10 s).
  await repsThenFreeze(page, cam, 2);
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  const restFrom = (await said(page)).length;
  // Rest mode: three rushed reps (counted silently), then hold. No cue, still resting.
  await play(page, RUSHED_REPS_FROM);
  await page.waitForTimeout(7_500);
  await page.evaluate(() => (window.__freezeAt = 0));
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  expect((await texts(page)).slice(restFrom).filter(isFocusText)).toEqual([]);
  await expect(cam.locator('[data-cue]')).toHaveCount(0);

  // Armed (> 10 s of rest): reps 1–2 (slow) auto-start set 2 and seed its baseline; reps 3–4
  // slow, 5–6 rushed → the cue fires in the auto-started set, after "Six".
  // Long enough that rest rep 7 and the replay's rep 1 are > 8 s apart (no mixed start pair).
  await page.waitForTimeout(6_000);
  const setFrom = (await said(page)).length;
  await freezeWhenReps(page, 6);
  await play(page);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 15_000 });
  await expect(reps(cam)).toHaveAttribute('data-reps', '6', { timeout: 30_000 });
  const cue = await waitSaid(page, CUE.rushedLowering, 5_000, setFrom);
  expect(saidBefore(await said(page), cue)?.text).toBe('Six');

  // Held in the start band: "Set done. 6 reps." at ~6 s, Undo window, saved — no cue in between.
  const done = await waitSaid(page, 'Set done. 6 reps.', 12_000, setFrom);
  await expect(cam.locator('[data-auto-stop="pending"]')).toBeVisible();
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 10_000 });
  const windowSaid = (await said(page)).filter((s) => s.at >= done.at);
  expect(windowSaid.map((s) => s.text).filter(isFocusText)).toEqual([]);
  await expect.poll(async () => (await curlRows(page)).length).toBe(2);
  const set2 = (await curlRows(page))[1];
  expect(set2?.reps).toBe(6);
  expect(set2?.cues).toEqual(['rushedLowering']);
  expect(set2?.focusScore).toBe(90);

  await commonSpeechChecks(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(4, 5) hands-free: held outside the band → stalled cue ~5 s then stop ~10 s; in the band → only "Set done"; walking away → only the hold prompt', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, RUSHED);
  await page.goto('/');
  await startPullA(page);
  await goToCurl(page);
  const cam = await openCam(page);

  // Set 1: 2 reps, then hold the top of a curl (outside the start band).
  const frozen = await repsThenFreeze(page, cam, 2, FAR_FRAME);
  const cue = await waitSaid(page, stalled(10), 9_000);
  expect(cue.at - frozen).toBeGreaterThan(4_000);
  expect(cue.at - frozen).toBeLessThan(7_500);
  const stop = await waitSaid(page, 'Set done. 2 reps.', 9_000);
  expect(stop.at - frozen).toBeGreaterThan(8_500);
  expect(stop.at - frozen).toBeLessThan(13_000);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 10_000 });
  await expect.poll(async () => (await curlRows(page))[0]?.cues).toEqual(['stalled']);
  expect((await curlRows(page))[0]?.focusScore).toBe(95);
  await page.evaluate(() => (window.__freezeAt = 0));

  // Set 2 (auto start; the count shows 2 at once) held in the start band: only "Set done" ~6 s.
  await page.waitForTimeout(5_500);
  let from = (await said(page)).length;
  await freezeWhenReps(page, 2);
  await play(page);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 15_000 });
  const started = await wallNow(page);
  const done2 = await waitSaid(page, 'Set done. 2 reps.', 12_000, from);
  expect(done2.at - started).toBeGreaterThan(4_500);
  expect((await texts(page)).slice(from).filter(isFocusText)).toEqual([]);
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest', { timeout: 10_000 });

  // Set 3 (the curl's last): after the auto start, walk away → the 3 s away break puts the set
  // on hold and speaks only the prompt (no "Set done", no "Step back into frame."). Nothing is
  // saved until a tap: Save set saves it.
  await page.waitForTimeout(5_500);
  from = (await said(page)).length;
  await freezeWhenReps(page, 2);
  await play(page);
  await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 15_000 });
  const goneAt = await wallNow(page);
  await setHook(page, 'noPerson', true);
  const prompt = await waitSaid(page, 'Set on hold. Tap to continue.', 10_000, from);
  expect(prompt.at - goneAt).toBeGreaterThan(2_500);
  expect(prompt.at - goneAt).toBeLessThan(5_500);
  const hold = cam.locator('[data-hold]');
  await expect(hold).toBeVisible();
  await expect(hold).toHaveAttribute('data-reason', 'away');
  await expect(hold).toHaveAttribute('data-last-set', 'true');
  await page.waitForTimeout(3_000);
  expect((await texts(page)).slice(from).filter(isFocusText)).toEqual([]);
  expect((await texts(page)).slice(from).filter((t) => t.startsWith('Set done'))).toEqual([]);
  expect((await curlRows(page)).length).toBe(2);
  await hold.getByRole('button', { name: 'Save set' }).click();
  await expect.poll(async () => (await curlRows(page)).length, { timeout: 10_000 }).toBe(3);
  expect((await curlRows(page))[2]?.reps).toBe(2);
  expect((await curlRows(page)).map((r) => r.focusScore)).toEqual([95, 100, 100]);
  expect((await texts(page)).slice(from).filter(isFocusText)).toEqual([]);

  await commonSpeechChecks(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});

test('(1, 4, 5) hands-free off: partial speaks only its hint; stalled ~8 s; hidden wrists → out of frame; low fps; Summary "(not scored)"', async ({
  page,
}) => {
  const w = watch(page);
  await installMocks(page, CURL);
  await page.goto('/');
  await seedHandsFreeOff(page);
  await startPullA(page);
  await goToCurl(page);
  const cam = await openCam(page);

  // 3 reps + 2 partials: the partial speaks its M4c hint, never a focus cue.
  const frozen = await repsThenFreeze(page, cam, 3);
  const beforeStall = await texts(page);
  expect(
    beforeStall.some((t) => t === 'Curl higher.' || t === 'Straighten your arm at the bottom.'),
  ).toBe(true);
  expect(beforeStall.filter(isFocusText)).toEqual([]);

  // Held in the start band with hands-free off: "Stay with it. 9 to go." at ~8 s.
  const cue = await waitSaid(page, stalled(9), 12_000);
  expect(cue.at - frozen).toBeGreaterThan(6_500);
  expect(cue.at - frozen).toBeLessThan(10_500);
  await expect(cam.locator('.rep-coach[data-cue="stalled"]')).toHaveText(stalled(9));

  // Wrists hidden while the body is in view: "Step back into frame." after ~2 s.
  await page.waitForTimeout(6_500); // outside the 6 s hint gap
  await setHook(page, 'hideWrists', true);
  const hiddenAt = await wallNow(page);
  const out = await waitSaid(page, CUE.outOfFrame, 6_000);
  expect(out.at - hiddenAt).toBeGreaterThan(1_500);
  await setHook(page, 'hideWrists', false);

  // A slow camera (< 15 fps for 3 s): "Move closer to the light."
  await page.waitForTimeout(6_500);
  await page.evaluate(() => (window.__slowMs = 90));
  await waitSaid(page, CUE.lowFps, 12_000);
  await page.evaluate(() => (window.__slowMs = 0));

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect.poll(async () => (await curlRows(page)).length).toBe(1);
  const [row] = await curlRows(page);
  expect(row?.cues).toEqual(['stalled', 'outOfFrame', 'lowFps']);
  // 100 − 5 (stalled) − 2 × 5 (partials); out of frame and low fps cost nothing.
  expect(row?.focusScore).toBe(85);

  await endWorkout(page);
  const set = page.locator(`[data-focus-exercise="${CURL_ID}"] [data-focus-set="1"]`);
  await expect(set).toHaveAttribute('data-focus-score', '85');
  await expect(set.locator('[data-focus-cue="stalled"]')).toHaveText('Stay with it');
  await expect(set.locator('[data-focus-cue="outOfFrame"]')).toHaveText(
    'Step back into frame (not scored)',
  );
  await expect(set.locator('[data-focus-cue="lowFps"]')).toHaveText(
    'Move closer to the light (not scored)',
  );
  await expect(set.locator('[data-focus-partials]')).toHaveText('2 partials');

  await commonSpeechChecks(page);
  expect(w.thirdParty).toEqual([]);
  expect(w.errors).toEqual([]);
});
