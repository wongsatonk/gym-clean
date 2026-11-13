// M4c task 5: camera-first layout. The video fills the screen between slim bands, the count and
// target sit on the video, a "Set up your phone" card shows until tracking is stable (its
// sentence spoken once), and the 3D skeleton is collapsed behind "3D". The fake camera here is a
// test pattern (no person), so the card stays up. The view is mounted from its module with a
// target, because app.ts wires `target` in a later task.
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';

async function mockSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __speech: string[] };
    w.__speech = [];
    const fake = {
      speak: (u: { text: string }) => w.__speech.push(u.text),
      cancel: () => w.__speech.push('<cancel>'),
      getVoices: () => [],
      speaking: false,
      pending: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      constructor(t: string) {
        this.text = t;
      }
      addEventListener() {}
    };
  });
}

const speech = (page: Page) =>
  page.evaluate(() => (window as unknown as { __speech: string[] }).__speech);

type Rect = { top: number; bottom: number; height: number; width: number };
const rect = (page: Page, sel: string) =>
  page.locator(sel).evaluate((el): Rect => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, height: r.height, width: r.width };
  });

/** Mounts the curl camera view with a target ("Set 2 of 3 · 8–12 reps") from its module. */
async function mountCurlCamera(page: Page, speakPlacement = true): Promise<void> {
  await page.evaluate(async (speakPlacement) => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const ui = await load('/src/ui/cameraView.ts');
    type View = { el: HTMLElement; start(): Promise<void> };
    const view = (ui.createCameraView as (o: unknown) => View)({
      title: 'Dumbbell Bicep Curl',
      exerciseId: 'Dumbbell_Bicep_Curl',
      onClose() {},
      onSetDone() {},
      speakPlacement,
      target: { setNumber: 2, sets: 3, targetReps: 12, minReps: 8 },
    });
    document.body.append(view.el);
    void view.start();
  }, speakPlacement);
}

test('curl camera: big video, "0 / 12" + set line, set-up card spoken once, 3D collapsed', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSpeech(page);
  await page.goto('/');
  await mountCurlCamera(page);
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });

  // Count + target, both big and on the video.
  await expect(cam.locator('[data-reps]')).toHaveText('0');
  await expect(cam.locator('.rep-target')).toHaveText('/ 12');
  await expect(cam.locator('.rep-set')).toHaveText('Set 2 of 3 · 8–12 reps');
  const px = (sel: string) =>
    cam
      .locator(sel)
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(await px('[data-reps]')).toBeGreaterThanOrEqual(64);
  expect(await px('.rep-set')).toBeGreaterThanOrEqual(20);
  // Partial-rep hint slot ("Curl higher."): same dark backing, ≥ 22px, empty until a partial.
  expect(await px('.rep-coach')).toBeGreaterThanOrEqual(22);
  await expect(cam.locator('.rep-coach')).toBeHidden();
  const stage = await rect(page, '.cam-stage');
  expect(stage.height).toBeGreaterThanOrEqual(600);
  const reps = await rect(page, '[data-reps]');
  expect(reps.top).toBeGreaterThanOrEqual(stage.top);
  expect(reps.bottom).toBeLessThanOrEqual(stage.bottom);

  // Set done stays on screen, below the video.
  const done = cam.getByRole('button', { name: 'Set done' });
  await expect(done).toBeInViewport();
  const doneBox = await done.boundingBox();
  expect(doneBox?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect((doneBox?.y ?? 0) + (doneBox?.height ?? 0)).toBeLessThanOrEqual(844);

  // Phone set-up card (no person in the test pattern, so it stays up), spoken exactly once.
  const card = cam.getByRole('region', { name: 'Set up your phone' });
  await expect(card).toBeVisible();
  await expect(card.locator('.setup-line').first()).toBeVisible();
  expect(await px('.setup-line')).toBeGreaterThanOrEqual(22);
  await expect(card.locator('svg.setup-pic')).toHaveAttribute('data-view', 'side');
  const said = await speech(page);
  expect(said.filter((t) => t !== '<cancel>')).toHaveLength(1);
  expect(said[0]).toMatch(/phone/i);
  // "Got it" hides it; "Phone position" brings it back.
  await card.getByRole('button', { name: 'Got it' }).click();
  await expect(card).toBeHidden();
  // Focus moves to the button that brings the card back.
  await expect(cam.getByRole('button', { name: 'Phone position' })).toBeFocused();
  await cam.getByRole('button', { name: 'Phone position' }).click();
  await expect(card).toBeVisible();

  // Switch camera is a ≥ 56px icon button.
  const sw = await cam.getByRole('button', { name: 'Switch camera' }).boundingBox();
  expect(sw?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(sw?.width ?? 0).toBeGreaterThanOrEqual(56);

  // 3D skeleton collapsed by default; loaded only when opened.
  const btn3d = cam.getByRole('button', { name: '3D skeleton' });
  await expect(btn3d).toHaveAttribute('aria-expanded', 'false');
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  await expect(cam.getByRole('button', { name: 'Side' })).toBeHidden();
  await btn3d.click();
  await expect(btn3d).toHaveAttribute('aria-expanded', 'true');
  await expect(cam.locator('.skeleton3d canvas')).toBeVisible();
  await cam.getByRole('button', { name: 'Side' }).click();
  await expect(cam.locator('.skeleton3d')).toHaveAttribute('data-preset', 'side');
  await btn3d.click();
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('the count turns green when the target is reached', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  const colours = await page.evaluate(async (fixture) => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const [ui, rc, ex] = await Promise.all([
      load('/src/ui/cameraView.ts'),
      load('/src/core/repCounter.ts'),
      load('/src/core/exercises/index.ts'),
    ]);
    type Rule = { limb: 'arm' | 'leg' };
    type Panel = { el: HTMLElement; update(frame: unknown): void; silence(): void };
    const rule = (ex.ruleFor as (id: string) => Rule)('Dumbbell_Bicep_Curl');
    const counter = (rc.createRepCounter as (r: Rule) => { reps: number })(rule);
    const panel = (ui.createRepPanel as (c: unknown, l: string, o: unknown) => Panel)(
      counter,
      rule.limb,
      { spokenCount: false, target: { setNumber: 1, sets: 3, targetReps: 3 } },
    );
    document.body.replaceChildren(panel.el);
    const num = panel.el.querySelector('[data-reps]') as HTMLElement;
    const seen: { reps: number; colour: string; at: boolean }[] = [];
    const frames = (await (await fetch(fixture)).json()) as unknown[];
    for (const f of frames) {
      panel.update(f);
      const reps = counter.reps;
      if (seen.at(-1)?.reps !== reps)
        seen.push({
          reps,
          colour: getComputedStyle(num).color,
          at: panel.el.classList.contains('at-target'),
        });
    }
    panel.silence();
    return seen;
  }, FIXTURE);
  const below = colours.filter((c) => c.reps < 3);
  const reached = colours.find((c) => c.reps >= 3);
  expect(below.every((c) => !c.at)).toBe(true);
  expect(reached?.at).toBe(true);
  // Green (#4ade80) at the target, not before.
  expect(reached?.colour).toBe('rgb(74, 222, 128)');
  expect(below.every((c) => c.colour !== 'rgb(74, 222, 128)')).toBe(true);
});

test('Camera test from Settings: big video, no counter, no set-up card', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  const stage = await rect(page, '.cam-stage');
  expect(stage.height).toBeGreaterThanOrEqual(600);
  expect(stage.width).toBe(390);
  await expect(cam.locator('.rep-panel')).toHaveCount(0);
  await expect(cam.locator('.cam-setup')).toHaveCount(0);
  await expect(cam.getByRole('button', { name: 'Phone position' })).toHaveCount(0);
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('short phone (375×667): the set-up card never covers the count', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 375, height: 667 });
  await mockSpeech(page);
  await page.goto('/');
  await mountCurlCamera(page, false);
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });
  const card = cam.getByRole('region', { name: 'Set up your phone' });
  await expect(card).toBeVisible();
  const panel = await rect(page, '.rep-panel');
  const cardBox = await rect(page, '.cam-setup');
  expect(cardBox.top).toBeGreaterThanOrEqual(panel.bottom);
  // speakPlacement: false → the sentence is not said.
  expect(await speech(page)).toEqual([]);
  await expect(cam.getByRole('button', { name: 'Set done' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

/** Mounts the curl view with a fake dev-log recorder that tallies calls (or throws on frames). */
async function mountWithRecorder(page: Page, throwOnFrame: boolean): Promise<void> {
  await page.evaluate(async (throwOnFrame) => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const ui = await load('/src/ui/cameraView.ts');
    const log = {
      frames: 0,
      nullFrames: 0,
      angles: 0,
      fps: 0,
      camera: {} as Record<string, unknown>,
      events: [] as unknown[],
      speech: [] as unknown[],
    };
    (window as unknown as { __rec: typeof log }).__rec = log;
    const recorder = {
      active: true,
      sessionId: 'test',
      camera: (m: Record<string, unknown>) => Object.assign(log.camera, m),
      frame: (f: unknown) => {
        if (throwOnFrame) throw new Error('boom');
        log.frames++;
        if (f === null) log.nullFrames++;
      },
      angle: () => log.angles++,
      repEvent: (ev: unknown) => log.events.push(ev),
      speech: (s: unknown) => log.speech.push(s),
      fps: () => log.fps++,
    };
    type View = { el: HTMLElement; start(): Promise<void> };
    const view = (ui.createCameraView as (o: unknown) => View)({
      title: 'Dumbbell Bicep Curl',
      exerciseId: 'Dumbbell_Bicep_Curl',
      onClose() {},
      onSetDone() {},
      recorder,
    });
    document.body.append(view.el);
    void view.start();
  }, throwOnFrame);
}

type RecLog = {
  speech: { t: number; kind: string }[];
  frames: number;
  nullFrames: number;
  angles: number;
  fps: number;
  camera: Record<string, unknown>;
};
const recLog = (page: Page) => page.evaluate(() => (window as unknown as { __rec: RecLog }).__rec);

test('dev-log recorder gets camera meta, every frame (null = no person), angles and fps', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mockSpeech(page);
  await page.goto('/');
  await mountWithRecorder(page, false);
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-delegate', /GPU|CPU/, { timeout: 30_000 });
  await expect.poll(async () => (await recLog(page)).fps, { timeout: 15_000 }).toBeGreaterThan(1);
  await expect
    .poll(async () => (await recLog(page)).frames, { timeout: 15_000 })
    .toBeGreaterThan(5);
  const log = await recLog(page);
  expect(log.camera).toMatchObject({ folder: 'curl', side: null });
  // The frame clock is tied to the wall clock, and the placement sentence (said before the
  // model is ready) is logged on the frame clock too.
  expect(Number(log.camera.wallT0)).toBeGreaterThan(0);
  const placement = log.speech.find((x) => x.kind === 'placement');
  expect(placement?.t ?? -1).toBeGreaterThanOrEqual(0);
  expect(String(log.camera.delegate)).toMatch(/GPU|CPU/);
  // Test pattern: no person, so every frame is logged as null, each with its angle (null).
  expect(log.nullFrames).toBe(log.frames);
  expect(log.angles).toBe(log.frames);
});

test('a failing recorder never stops the camera loop', async ({ page }) => {
  test.setTimeout(60_000);
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('Developer log')) warnings.push(m.text());
  });
  await mockSpeech(page);
  await page.goto('/');
  await mountWithRecorder(page, true);
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect
    .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 30_000 })
    .toBeGreaterThan(1);
  expect(warnings).toHaveLength(1); // warned once, not per frame
});
