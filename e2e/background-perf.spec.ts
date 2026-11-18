// M13c task 9: the moving glow (his q1 answer, option c) in the real app at 390×844.
// - Today has one fixed ::before glow layer whose transform drifts over time; the page colour
//   and the launch colour stay #0d0f12; Today's Start stays in the first viewport.
// - Plain (html[data-background='plain']) is the flat look: no layer, nothing animates.
// - Paused (animation-play-state, via motion.ts watchAmbient → html[data-ambient]) while the
//   page is hidden and under a sheet; on the Exercise screen there is no glow at all and
//   under reduced motion it is the still glow (no animation).
// - Perf/battery: a 10 s Chrome trace (CDP Tracing) of Today with the glow vs Plain: after the
//   first frame the glow adds no Layout / Paint / raster work, main-thread time per frame stays
//   within 1 ms of Plain, and the glow sits on its own compositor layer (CDP LayerTree).
// main.ts does not call watchAmbient() yet (task 17 wiring), so the pause tests start it
// in-page from the same module the app loads. Nothing is spoken here; no request leaves.
//
// Screenshots (docs/screenshots/m13c-bg-*.png) only with M13C_SHOTS=1.
import type { CDPSession } from '@playwright/test';
import { expect, test, type Page } from './fixtures';
import { at, guardNetwork, openApp, record } from './app.helpers';

const shots = !!process.env['M13C_SHOTS'];
const PAGE_BG = 'rgb(13, 15, 18)';

type Glow = {
  content: string;
  animationName: string;
  playState: string;
  position: string;
  willChange: string;
  transform: string;
  backgroundImage: string;
  /** Play states of the CSS animation 'ambient-drift' in the document. */
  anims: string[];
  ambient: string | null;
  rootBg: string;
};

/** The glow layer of the shown screen root (`main.screen`) and every 'ambient-drift' animation. */
function glow(page: Page, screen = 'main.screen'): Promise<Glow> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) throw new Error(`no ${sel}`);
    const cs = getComputedStyle(root, '::before');
    return {
      content: cs.content,
      animationName: cs.animationName,
      playState: cs.animationPlayState,
      position: cs.position,
      willChange: cs.willChange,
      transform: cs.transform,
      backgroundImage: cs.backgroundImage,
      anims: document
        .getAnimations()
        .filter((a) => (a as CSSAnimation).animationName === 'ambient-drift')
        .map((a) => a.playState),
      ambient: document.documentElement.getAttribute('data-ambient'),
      rootBg: getComputedStyle(root).backgroundColor,
    };
  }, screen);
}

/** Starts motion.ts watchAmbient() in the page (what main.ts will do at start-up). */
async function watch(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const m = await import('/src/ui/motion.ts' as string);
    (window as unknown as { __stopAmbient: () => void }).__stopAmbient = m.watchAmbient();
  });
}

async function setBackground(page: Page, style: 'glow' | 'plain'): Promise<void> {
  await page.evaluate((s) => document.documentElement.setAttribute('data-background', s), style);
}

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.constructor === Animation)
        .map((a) => a.finished),
    ),
  );
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
}

test('Today has a moving glow on one fixed layer; page and launch colour unchanged', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  const today = 'main[data-screen="today"]';
  const g = await glow(page, today);
  expect(g).toMatchObject({
    animationName: 'ambient-drift',
    playState: 'running',
    position: 'fixed',
    willChange: 'transform',
    rootBg: PAGE_BG,
  });
  expect(g.content).not.toBe('none');
  expect(g.backgroundImage).toMatch(/radial-gradient/);
  expect(g.anims).toEqual(['running']);
  // It moves: the transform read twice, 2 s apart, differs.
  await expect
    .poll(async () => (await glow(page, today)).transform, { timeout: 8000, intervals: [2000] })
    .not.toBe(g.transform);
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d0f12');
  // Start stays in the first viewport.
  const start = page.locator('[data-hero] [data-start]').first();
  const box = await start.boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
  expect(offsite).toEqual([]);
});

test('Today Start is still in the first viewport at 375×667 with the glow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await openApp(page, at(13, 18));
  expect((await glow(page, 'main[data-screen="today"]')).anims).toEqual(['running']);
  const box = await page.locator('[data-hero] [data-start]').first().boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(667);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test('Plain is the flat look: no glow layer, nothing animates', async ({ page }) => {
  await openApp(page, at(13, 18));
  await setBackground(page, 'plain');
  const g = await glow(page);
  expect(g.content).toBe('none');
  expect(g.anims).toEqual([]);
  expect(g.rootBg).toBe(PAGE_BG);
  await shot(page, 'm13c-bg-plain-today');
  await setBackground(page, 'glow');
  expect((await glow(page)).anims).toEqual(['running']);
  // The tab bar is solid --surface either way (no ghosts of the content scrolling under it).
  const bar = await page.locator('.tabbar').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bar).toBe('rgb(22, 25, 30)');
});

test('paused while the page is hidden and under a sheet', async ({ page }) => {
  await openApp(page, at(13, 18));
  await watch(page);
  expect(await glow(page)).toMatchObject({ anims: ['running'], ambient: null });

  // Page hidden (the app goes to the background).
  const setHidden = (hidden: boolean) =>
    page.evaluate((h) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (h ? 'hidden' : 'visible'),
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  expect(await glow(page)).toMatchObject({
    anims: ['paused'],
    playState: 'paused',
    ambient: 'paused',
  });
  await setHidden(false);
  expect(await glow(page)).toMatchObject({ anims: ['running'], ambient: null });

  // A sheet (the learn card: role=dialog, aria-modal) covers the page.
  await page.evaluate(async () => {
    const cards = await import('/src/data/learnCards.ts' as string);
    const lc = await import('/src/ui/coach/learnCard.ts' as string);
    const card = cards.LEARN_CARDS[0];
    (window as unknown as { __lc: { close: () => void } }).__lc = lc.openLearnCard(card);
  });
  await expect(page.locator('[aria-modal="true"]')).toBeVisible();
  await expect.poll(async () => (await glow(page)).anims).toEqual(['paused']);
  expect((await glow(page)).ambient).toBe('paused');
  await page.evaluate(() => (window as unknown as { __lc: { close: () => void } }).__lc.close());
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await expect.poll(async () => (await glow(page)).anims).toEqual(['running']);
});

test('the Exercise screen has no glow (flat, nothing animating) and pauses it', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  await watch(page);
  await page.locator('[data-hero="push-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  const ex = 'main[data-screen="exercise"]';
  await expect(page.locator(ex)).toBeVisible();
  const g = await glow(page, ex);
  expect(g.content).toBe('none');
  expect(g.anims).toEqual([]);
  expect(g.rootBg).toBe(PAGE_BG);
  await expect.poll(async () => (await glow(page, ex)).ambient).toBe('paused');
  await shot(page, 'm13c-bg-exercise-black');
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('is the still glow: the layer is drawn, nothing animates', async ({ page }) => {
    await openApp(page, at(13, 18));
    const g = await glow(page);
    expect(g.content).not.toBe('none');
    expect(g.backgroundImage).toMatch(/radial-gradient/);
    expect(g.animationName).toBe('none');
    expect(g.anims).toEqual([]);
  });
});

test('Settings → Accent colour → Background: Moving glow / Plain switches the look', async ({
  page,
}) => {
  await openApp(page, at(13, 18));
  // The harness plays app.ts's part (task 17): a pick goes to applyBackground and re-renders.
  await page.evaluate(async () => {
    const settings = await import('/src/ui/screens/settings.ts' as string);
    const bg = await import('/src/ui/backgroundPicker.ts' as string);
    const w = window as unknown as { __bgCalls: string[] };
    w.__bgCalls = [];
    let style = 'glow';
    bg.applyBackground(style);
    const slot = () => document.createElement('div');
    const render = () => {
      const el = settings.settingsScreen(
        {
          accent: 'orange',
          background: style,
          spokenCount: true,
          coachTips: true,
          handsFree: false,
          unit: 'kg',
          coachVoice: slot(),
          speakerCheck: slot(),
          audioTest: slot(),
          devLog: slot(),
        },
        {
          onAccent: () => undefined,
          onBackground: (s: string) => {
            w.__bgCalls.push(s);
            style = s;
            bg.applyBackground(s);
            render();
          },
          onSpokenCount: () => undefined,
          onCoachTips: () => undefined,
          onHandsFree: () => undefined,
          onUnit: () => undefined,
          onCameraTest: () => undefined,
          onTab: () => undefined,
        },
      );
      document.body.replaceChildren(el);
    };
    render();
  });
  const row = page.locator('[data-section="accent"] [data-background-picker]');
  await expect(row).toBeVisible();
  await expect(row.getByRole('group', { name: 'Background' })).toBeVisible();
  const glowBtn = row.getByRole('button', { name: 'Moving glow' });
  const plainBtn = row.getByRole('button', { name: 'Plain' });
  await expect(glowBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(glowBtn.locator('[data-icon="check"]')).toHaveCount(1);
  for (const b of [glowBtn, plainBtn]) {
    const box = await b.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
    const fs = await b.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fs).toBeGreaterThanOrEqual(20);
    // One line, nothing clipped.
    expect(await b.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect((await glow(page)).anims).toEqual(['running']);
  await row.scrollIntoViewIfNeeded();
  await page.locator('[data-section="accent"]').evaluate((el) => el.scrollIntoView());
  await shot(page, 'm13c-bg-settings');

  await plainBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-background', 'plain');
  await expect(row.getByRole('button', { name: 'Plain' })).toHaveAttribute('aria-pressed', 'true');
  expect(await glow(page)).toMatchObject({ content: 'none', anims: [] });
  await row.getByRole('button', { name: 'Moving glow' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-background', 'glow');
  expect((await glow(page)).anims).toEqual(['running']);
  expect(
    await page.evaluate(() => (window as unknown as { __bgCalls: string[] }).__bgCalls),
  ).toEqual(['plain', 'glow']);
});

// ---- Perf / battery trace ----

type TraceEvent = {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  args?: { name?: string };
};

type TraceStats = {
  frames: number;
  mainMs: number;
  mainMsPerFrame: number;
  layout: number;
  paint: number;
  prePaint: number;
  raster: number;
  styleRecalc: number;
};

async function trace(cdp: CDPSession, ms: number): Promise<TraceStats> {
  const events: TraceEvent[] = [];
  const onData = (e: { value: Record<string, unknown>[] }): void => {
    events.push(...(e.value as unknown as TraceEvent[]));
  };
  cdp.on('Tracing.dataCollected', onData);
  const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()));
  await cdp.send('Tracing.start', {
    transferMode: 'ReportEvents',
    traceConfig: {
      includedCategories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'toplevel',
        'cc',
        'blink',
      ],
    },
  });
  await new Promise((r) => setTimeout(r, ms));
  await cdp.send('Tracing.end');
  await done;
  cdp.off('Tracing.dataCollected', onData);
  const names = new Map<string, string>();
  for (const e of events)
    if (e.ph === 'M' && e.name === 'thread_name')
      names.set(`${e.pid}:${e.tid}`, e.args?.name ?? '');
  const on = (e: TraceEvent, thread: string) => names.get(`${e.pid}:${e.tid}`) === thread;
  const main = events.filter((e) => on(e, 'CrRendererMain'));
  const count = (list: TraceEvent[], name: string) => list.filter((e) => e.name === name).length;
  const frames = count(
    events.filter((e) => on(e, 'Compositor')),
    'DrawFrame',
  );
  const mainMs =
    main.filter((e) => e.ph === 'X' && e.name === 'RunTask').reduce((s, e) => s + (e.dur ?? 0), 0) /
    1000;
  return {
    frames,
    mainMs: Math.round(mainMs * 10) / 10,
    mainMsPerFrame: frames ? Math.round((mainMs / frames) * 1000) / 1000 : 0,
    layout: count(main, 'Layout'),
    paint: count(main, 'Paint'),
    prePaint: count(main, 'PrePaint'),
    styleRecalc: count(main, 'UpdateLayoutTree'),
    raster: events.filter((e) => e.name === 'RasterTask').length,
  };
}

/** Compositor layers whose compositing reasons say "animated transform" / "will-change". */
async function glowLayers(cdp: CDPSession): Promise<{ w: number; h: number; reasons: string[] }[]> {
  const tree = new Promise<{ layers?: { layerId: string; width: number; height: number }[] }>((r) =>
    cdp.once('LayerTree.layerTreeDidChange', r),
  );
  await cdp.send('LayerTree.enable');
  const { layers = [] } = await tree;
  const out: { w: number; h: number; reasons: string[] }[] = [];
  for (const l of layers) {
    const res = (await cdp
      .send('LayerTree.compositingReasons', { layerId: l.layerId })
      .catch(() => ({ compositingReasonIds: [] }))) as { compositingReasonIds?: string[] };
    const reasons = res.compositingReasonIds ?? [];
    if (reasons.some((x) => /transform|willChange/i.test(x)))
      out.push({ w: Math.round(l.width), h: Math.round(l.height), reasons });
  }
  await cdp.send('LayerTree.disable');
  return out;
}

test('perf trace: compositor-only glow, main thread within 1 ms/frame of Plain', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await openApp(page, at(13, 18));
  const cdp = await page.context().newCDPSession(page);
  const SECONDS = 10;

  // The glow on its own compositor layer, a little larger than the 390×844 viewport (inset -8%).
  const layers = await glowLayers(cdp);
  const glowLayer = layers.find((l) => l.w >= 390 && l.w <= 520 && l.h >= 844 && l.h <= 1100);
  expect(glowLayer, JSON.stringify(layers)).toBeTruthy();

  await setBackground(page, 'plain');
  await page.waitForTimeout(1000);
  const plain = await trace(cdp, SECONDS * 1000);
  await setBackground(page, 'glow');
  // After the first frame (the layer is drawn once), then measure.
  await page.waitForTimeout(1000);
  const moving = await trace(cdp, SECONDS * 1000);

  const evidence = { seconds: SECONDS, glowLayer, plain, glow: moving };
  console.log(`background-perf ${JSON.stringify(evidence)}`);
  info.annotations.push({ type: 'background-perf', description: JSON.stringify(evidence) });

  // The glow animates on the compositor: frames keep coming…
  expect(moving.frames).toBeGreaterThan(SECONDS * 20);
  // …with no layout, paint or raster work of its own after the first frame.
  expect(moving.layout).toBeLessThanOrEqual(plain.layout);
  expect(moving.paint).toBeLessThanOrEqual(plain.paint);
  // Blink may run an odd main frame to sync the compositor animation's timing (seen: 1 style
  // recalc + 1 pre-paint in 10 s, no paint); that is not per-frame work.
  expect(moving.prePaint).toBeLessThanOrEqual(plain.prePaint + 3);
  expect(moving.styleRecalc).toBeLessThanOrEqual(plain.styleRecalc + 3);
  expect(moving.raster).toBeLessThanOrEqual(plain.raster);
  // Main-thread work per frame within 1 ms of Plain.
  const plainPerFrame = plain.frames ? plain.mainMs / plain.frames : 0;
  expect(moving.mainMsPerFrame - plainPerFrame).toBeLessThanOrEqual(1);
});

// ---- Screenshots of each non-workout screen with the glow (M13C_SHOTS=1) ----

test('screenshots: the glow on Today, preview, Fuel, Coach, Calendar, Settings', async ({
  page,
}) => {
  test.skip(!shots, 'M13C_SHOTS=1 writes docs/screenshots/m13c-bg-*.png');
  await openApp(page, at(13, 18));
  await shot(page, 'm13c-bg-today');
  await page.locator('[data-hero="push-a"] [data-start]').click();
  await expect(page.locator('main[data-screen="preview"]')).toBeVisible();
  await shot(page, 'm13c-bg-preview');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('main[data-screen="today"]')).toBeVisible();
  for (const [tab, name] of [
    ['fuel', 'fuel'],
    ['coach', 'coach'],
    ['calendar', 'calendar'],
  ] as const) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await expect(page.locator(`main[data-screen="${tab}"]`).first()).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, `m13c-bg-${name}`);
  }
});
