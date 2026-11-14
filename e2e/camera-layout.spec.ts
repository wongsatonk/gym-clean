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

/** A colour token's computed rgb() string, so tests follow the theme instead of pinning a hex. */
const tokenRgb = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('i');
    probe.style.color = `var(${n})`;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    return rgb;
  }, name);

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
  // Success green (--success) at the target, not before.
  const green = await tokenRgb(page, '--success');
  expect(reached?.colour).toBe(green);
  expect(below.every((c) => c.colour !== green)).toBe(true);
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
  // No counter → no range-of-motion gauge.
  await expect(cam.locator('[data-gauge]')).toHaveCount(0);
  await expect(cam.locator('.cam-gauge-slot')).toBeHidden();
  await expect(cam.locator('.cam-setup')).toHaveCount(0);
  await expect(cam.getByRole('button', { name: 'Phone position' })).toHaveCount(0);
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('header: every tracked exercise name shows in full (wraps, never "Dumbbel…")', async ({
  page,
}) => {
  await mockSpeech(page);
  await page.goto('/');
  for (const title of [
    'Dumbbell Bicep Curl',
    'Seated Dumbbell Press',
    'One-Arm Dumbbell Row',
    'Side Lateral Raise',
    'Goblet Squat',
    'Pushups',
  ]) {
    const r = await page.evaluate(async (title) => {
      document.querySelector('[role="dialog"][aria-label="Camera"]')?.remove();
      const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
      const ui = await load('/src/ui/cameraView.ts');
      type View = { el: HTMLElement };
      const view = (ui.createCameraView as (o: unknown) => View)({
        title,
        exerciseId: 'Dumbbell_Bicep_Curl',
        onClose() {},
        onSetDone() {},
        speakPlacement: false,
        target: { setNumber: 1, sets: 3, targetReps: 12, minReps: 8 },
      });
      document.body.append(view.el);
      const q = (sel: string): HTMLElement => {
        const e = view.el.querySelector<HTMLElement>(sel);
        if (!e) throw new Error(`missing ${sel}`);
        return e;
      };
      const t = q('.cam-title');
      const cs = getComputedStyle(t);
      const box = t.getBoundingClientRect();
      const close = q('.cam-close').getBoundingClientRect();
      const b3d = q('.cam-3d-btn').getBoundingClientRect();
      const stage = q('.cam-stage').getBoundingClientRect();
      return {
        text: t.textContent,
        fontPx: parseFloat(cs.fontSize),
        clipped: t.scrollWidth > t.clientWidth || cs.textOverflow === 'ellipsis',
        lines: Math.round(box.height / parseFloat(cs.lineHeight)),
        rightEdge: box.right,
        b3dLeft: b3d.left,
        btnH: Math.min(close.height, b3d.height),
        stageH: stage.height,
      };
    }, title);
    expect(r.text, title).toBe(title);
    expect(r.clipped, title).toBe(false);
    expect(r.fontPx, title).toBeGreaterThanOrEqual(20);
    expect(r.lines, title).toBeLessThanOrEqual(2);
    expect(r.rightEdge, title).toBeLessThanOrEqual(r.b3dLeft);
    expect(r.btnH, title).toBeGreaterThanOrEqual(56);
    // Two lines fit beside the 56px buttons, so the video keeps its size.
    expect(r.stageH, title).toBeGreaterThanOrEqual(600);
  }
  // The e2e hook (dialog "Camera") is unchanged.
  await expect(page.getByRole('dialog', { name: 'Camera' })).toBeVisible();
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

// ---- S2: range-of-motion gauge on the video ----

/**
 * Feeds a fixture through a real counter + panel (synchronously) with the gauge mounted in a
 * 400px column, and samples the gauge after every frame.
 */
async function runGaugeFixture(page: Page, exerciseId: string, fixture: string) {
  return page.evaluate(
    async ({ exerciseId, fixture }) => {
      const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
      const [ui, rc, ex, rg] = await Promise.all([
        load('/src/ui/cameraView.ts'),
        load('/src/core/repCounter.ts'),
        load('/src/core/exercises/index.ts'),
        load('/src/core/romGauge.ts'),
      ]);
      type Rule = { limb: 'arm' | 'leg' };
      type Counter = { angle: number | null; lastMiss: string | null; reachedFar: boolean };
      type Panel = {
        el: HTMLElement;
        gauge: HTMLElement;
        update(f: unknown): void;
        silence(): void;
      };
      const rule = (ex.ruleFor as (id: string) => Rule)(exerciseId);
      const counter = (rc.createRepCounter as (r: Rule) => Counter)(rule);
      const panel = (ui.createRepPanel as (c: unknown, l: string, o: unknown) => Panel)(
        counter,
        rule.limb,
        { spokenCount: false },
      );
      const slot = document.createElement('div');
      slot.className = 'cam-gauge-slot';
      slot.style.cssText = 'position:fixed;top:100px;right:8px;height:400px;bottom:auto';
      slot.append(panel.gauge);
      document.body.replaceChildren(panel.el, slot);
      const g = panel.gauge;
      const q = (s: string) => g.querySelector(s) as HTMLElement;
      const readGauge = rg.readGauge as (
        r: unknown,
        a: number | null,
      ) => { position: number } | null;
      const frames = (await (await fetch(fixture)).json()) as unknown[];
      const steps = [];
      for (const f of frames) {
        panel.update(f);
        const missedEl = g.querySelector('.gauge-mark[data-missed]') as HTMLElement | null;
        steps.push({
          angle: g.dataset.angle ?? '',
          zone: g.dataset.gaugeZone ?? '',
          reached: g.dataset.gaugeReached ?? '',
          missed: g.dataset.gaugeMissed ?? '',
          lastMiss: counter.lastMiss,
          reachedFar: counter.reachedFar,
          hidden: g.hidden,
          fillColour: getComputedStyle(q('.gauge-fill')).backgroundColor,
          missedColour: missedEl
            ? `${missedEl.dataset.mark}:${getComputedStyle(missedEl).backgroundImage}`
            : null,
          nowTop: q('.gauge-now').getBoundingClientRect().top,
          fillScale: new DOMMatrix(getComputedStyle(q('.gauge-fill')).transform).d,
          targetTop: q('.gauge-target').getBoundingClientRect().top,
          startTop: q('.gauge-start').getBoundingClientRect().top,
          position: readGauge(rule, counter.angle)?.position ?? null,
        });
      }
      const px = (s: string) => parseFloat(getComputedStyle(q(s)).fontSize);
      const labels = [...g.querySelectorAll('.gauge-label')].map((l) => l.textContent);
      const sizes = { label: px('.gauge-label'), angle: px('.gauge-angle') };
      const angleText = q('.gauge-angle').textContent;
      panel.silence();
      return { steps, labels, sizes, angleText };
    },
    { exerciseId, fixture },
  );
}

for (const [exerciseId, fixture] of [
  ['Dumbbell_Bicep_Curl', '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json'],
  ['Side_Lateral_Raise', '/fixtures/landmarks/lateral-raise/synthetic-02__reps-3__partials-2.json'],
  [
    'Seated_Dumbbell_Press',
    '/fixtures/landmarks/shoulder-press/synthetic-02__reps-3__partials-2.json',
  ],
] as const) {
  test(`gauge (${exerciseId}): marks, live angle, green when reached, amber on the missed mark`, async ({
    page,
  }) => {
    await page.goto('/');
    const GREEN = await tokenRgb(page, '--success');
    const AMBER = await tokenRgb(page, '--warn');
    const { steps, labels, sizes, angleText } = await runGaugeFixture(page, exerciseId, fixture);
    expect(labels).toEqual(['Target', 'Start']);
    expect(sizes.label).toBeGreaterThanOrEqual(20);
    expect(sizes.angle).toBeGreaterThanOrEqual(20);
    expect(angleText).toMatch(/^\d+°$/);

    const live = steps.filter((s) => !s.hidden);
    expect(live.length).toBeGreaterThan(100);
    // The angle changes (≥ 30 different whole degrees over the set).
    expect(new Set(live.map((s) => s.angle)).size).toBeGreaterThan(30);
    expect(new Set(live.map((s) => s.zone))).toEqual(new Set(['start', 'moving', 'target']));
    for (const s of live) {
      // Target at the top for every exercise (inverted raise, contracted-start press included).
      expect(s.targetTop).toBeLessThan(s.startTop);
      // The live marker is above the target line exactly when the position is past it.
      if (s.position !== null && s.position > 1.02) expect(s.nowTop).toBeLessThan(s.targetTop);
      if (s.position !== null && s.position < -0.02) expect(s.nowTop).toBeGreaterThan(s.startTop);
      // The fill never flips below the start line: clamped at 0, only the marker goes lower.
      expect(s.fillScale).toBeGreaterThanOrEqual(0);
      if (s.position !== null && s.position < 0) expect(s.fillScale).toBe(0);
      // Green fill exactly while this rep has reached the target.
      expect(s.reached).toBe(String(s.reachedFar));
      expect(s.fillColour === GREEN).toBe(s.reachedFar);
      // Amber line on the mark the last partial missed (far → target, start → start).
      const want = s.lastMiss === 'far' ? 'target' : s.lastMiss === 'start' ? 'start' : '';
      expect(s.missed).toBe(want);
      if (want) {
        expect(s.missedColour).toContain(`${want}:`);
        // Reaching the target in the next rep turns that line green (the miss is being fixed).
        if (want === 'target' && s.reachedFar) expect(s.missedColour).not.toContain(AMBER);
        else expect(s.missedColour).toContain(AMBER);
      } else {
        expect(s.missedColour).toBeNull();
      }
    }
    // Reached → green, then back to the start → reset (latched per rep, not per set).
    const firstGreen = live.findIndex((s) => s.reached === 'true');
    expect(firstGreen).toBeGreaterThan(0);
    expect(live.slice(firstGreen).some((s) => s.reached === 'false')).toBe(true);
    // At least one partial lit a missed mark.
    expect(live.some((s) => s.missed !== '')).toBe(true);
  });
}

/**
 * Replaces the pose model with a fixture player (served in place of src/pose/landmarker.ts), so
 * the real camera view tracks a "person" on the fake camera: frame i = elapsed time / 33 ms.
 */
async function fakeTrackerFromFixture(page: Page, fixture: string): Promise<void> {
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function createPoseTracker() {
          const frames = await (await fetch(${JSON.stringify(fixture)})).json();
          let first = null;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              first ??= t;
              const i = Math.floor((t - first) / 33.333);
              window.__gaugeIdx = i % frames.length;
              if (window.__gaugeFreezeAt != null && i >= window.__gaugeFreezeAt)
                return { ...frames[window.__gaugeFreezeAt], t };
              return { ...frames[i % frames.length], t };
            },
            close() {},
          };
        }`,
    }),
  );
}

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

for (const vp of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test(`gauge on the live camera view (${vp.width}×${vp.height}): shown when tracking, clear of the count and buttons`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(vp);
    await mockSpeech(page);
    await fakeTrackerFromFixture(page, FIXTURE);
    // __gaugeFreezeAt holds one fixture frame (for a stable mid-rep screenshot).
    await page.addInitScript(() => {
      (window as unknown as { __gaugeFreezeAt: number | null }).__gaugeFreezeAt = null;
    });
    await page.goto('/');
    await mountCurlCamera(page, false);
    const cam = page.getByRole('dialog', { name: 'Camera' });
    const gauge = cam.locator('[data-gauge]');
    // Set-up card up first (no stable tracking yet): the gauge stays out of its way.
    await expect(cam.getByRole('region', { name: 'Set up your phone' })).toBeHidden({
      timeout: 30_000,
    });
    await expect(gauge).toBeVisible();
    await expect(gauge.locator('.gauge-target .gauge-label')).toHaveText('Target');
    await expect(gauge.locator('.gauge-start .gauge-label')).toHaveText('Start');
    // The live angle changes.
    const first = await gauge.getAttribute('data-angle');
    await expect.poll(() => gauge.getAttribute('data-angle'), { timeout: 5_000 }).not.toBe(first);
    await expect(gauge.locator('.gauge-angle')).toHaveText(/^\d+°$/);

    // Not over the count panel, the stage buttons, or the middle of the video (the person).
    const g = (await gauge.boundingBox()) as Box;
    const stage = (await cam.locator('.cam-stage').boundingBox()) as Box;
    const panel = (await cam.locator('.rep-panel').boundingBox()) as Box;
    const sw = (await cam.getByRole('button', { name: 'Switch camera' }).boundingBox()) as Box;
    const phone = (await cam.getByRole('button', { name: 'Phone position' }).boundingBox()) as Box;
    expect(overlaps(g, panel)).toBe(false);
    expect(overlaps(g, sw)).toBe(false);
    expect(overlaps(g, phone)).toBe(false);
    expect(g.x + g.width).toBeLessThanOrEqual(stage.x + stage.width);
    expect(g.y + g.height).toBeLessThanOrEqual(stage.y + stage.height);
    expect(g.x).toBeGreaterThanOrEqual(stage.x + stage.width - 100); // right edge only (88px column + 8px inset)
    expect(g.height).toBeGreaterThanOrEqual(200);

    // Start/Target labels are whole: inside the viewport, inside the gauge backing, and not cut
    // by any clipping ancestor (short phones have little headroom above/below the lines).
    const labelClips = await gauge.evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>('.gauge-label')].map((label) => {
        const r = label.getBoundingClientRect();
        const inside = (o: DOMRect) =>
          r.left >= o.left - 0.5 &&
          r.right <= o.right + 0.5 &&
          r.top >= o.top - 0.5 &&
          r.bottom <= o.bottom + 0.5;
        const clippedBy: string[] = [];
        for (let a = label.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (
            (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') &&
            !inside(a.getBoundingClientRect())
          )
            clippedBy.push(a.className);
        }
        const vp = new DOMRect(0, 0, innerWidth, innerHeight);
        return {
          text: label.textContent,
          inViewport: inside(vp),
          inGauge: inside(root.getBoundingClientRect()),
          clippedBy,
        };
      }),
    );
    expect(labelClips).toEqual([
      { text: 'Target', inViewport: true, inGauge: true, clippedBy: [] },
      { text: 'Start', inViewport: true, inGauge: true, clippedBy: [] },
    ]);

    // "Phone position" brings the card back over the width of the video: the gauge steps aside.
    await cam.getByRole('button', { name: 'Phone position' }).click();
    await expect(cam.getByRole('region', { name: 'Set up your phone' })).toBeVisible();
    await expect(gauge).toBeHidden();
    await cam.getByRole('button', { name: 'Got it' }).click();
    await expect(gauge).toBeVisible();

    {
      // Mid-rep screenshot: wait for the arm part-way up, then hold that frame.
      await expect
        .poll(
          async () => {
            const zone = await gauge.getAttribute('data-gauge-zone');
            const deg = Number(await gauge.getAttribute('data-angle'));
            return zone === 'moving' && deg < 110 && deg > 80;
          },
          { timeout: 20_000, intervals: [20] },
        )
        .toBe(true);
      await page.evaluate(() => {
        const w = window as unknown as { __gaugeFreezeAt: number; __gaugeIdx: number };
        w.__gaugeFreezeAt = w.__gaugeIdx;
      });
      await page.waitForTimeout(600);
      await page.screenshot({ path: info.outputPath(`gauge-${vp.width}x${vp.height}.png`) });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(vp.width);
    expect(errors).toEqual([]);
  });
}
