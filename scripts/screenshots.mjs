// Verifier-owned phone-size screenshots (390x844 CSS px, DPR 2).
// The Playwright MCP browser rejects the self-signed dev cert, so this script drives Chromium
// directly with ignoreHTTPSErrors. It starts its own Vite dev server on SHOT_PORT (default 5197).
//
//   node scripts/screenshots.mjs m4          # M4 screens
//   node scripts/screenshots.mjs m4c         # M4c + M4b Push A slice screens
//   node scripts/screenshots.mjs m4c-flow    # Push A click-through (JSON report, export saved
//                                            #   under test-results/), no docs screenshots
//   node scripts/screenshots.mjs m5b [coach|s2|m4d|silent]
//                                            # m4d-next round: M5b coach click-through, S2 gauge,
//                                            #   M4d demos + Pull A badges, silent hint (iOS UA)
//
// For each screen it records document.documentElement.scrollWidth, console errors/warnings and
// page errors, and prints a JSON summary. The fake camera plays the synthetic curl clip
// (test-results/fake-camera/person.mjpeg, made by e2e/fake-camera.setup.ts).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = Number(process.env.SHOT_PORT ?? 5197);
const BASE = `https://localhost:${PORT}`;
const OUT = 'docs/screenshots';
const FAKE = 'test-results/fake-camera/person.mjpeg';
const SOURCE = 'fixtures/synthetic/curl/synthetic-01__reps-3__partials-1.webm';
const USAGE_LOG = 'odml.pa.googleapis.com';

function ensureFakeCamera() {
  if (existsSync(FAKE)) return;
  mkdirSync('test-results/fake-camera', { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', SOURCE, '-vf', 'scale=480:640',
    '-q:v', '5', '-r', '30', FAKE]);
}

async function waitForServer(url, ms = 30_000) {
  const t0 = Date.now();
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`dev server not up at ${url}`);
}

async function newPhone(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
  });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  return { ctx, page, log };
}

const results = [];
async function shot(page, log, name, extra = {}) {
  const file = `${OUT}/${name}.png`;
  await page.screenshot({ path: file });
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const unexpected = log.filter((l) => !l.includes(USAGE_LOG));
  results.push({ file, scrollWidth, console: [...log], unexpected, ...extra });
}

async function openCurlCamera(page) {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('heading', { name: 'One-Arm Dumbbell Row' }).waitFor();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('[data-ex-index="3"]').click();
  await page.getByRole('heading', { name: 'Dumbbell Bicep Curl' }).waitFor();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await cam.locator('.rep-panel').waitFor();
  return cam;
}

/** Geometry of the camera sheet: is the rep number and Set done inside the 844px viewport? */
async function cameraGeometry(page) {
  return page.evaluate(() => {
    const cam = document.querySelector('[role="dialog"][aria-label="Camera"]');
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height),
        left: Math.round(r.left), right: Math.round(r.right) };
    };
    const reps = cam?.querySelector('[data-reps]');
    const done = [...(cam?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'Set done',
    );
    const scroller = cam;
    return {
      sheet: rect(cam),
      sheetScrollHeight: cam?.scrollHeight ?? null,
      sheetClientHeight: cam?.clientHeight ?? null,
      sheetScrollTop: scroller?.scrollTop ?? null,
      reps: rect(reps),
      repsFontPx: reps ? parseFloat(getComputedStyle(reps).fontSize) : null,
      repsText: reps?.textContent ?? null,
      partials: cam?.querySelector('[data-partials]')?.getAttribute('data-partials') ?? null,
      side: cam?.querySelector('[data-side]')?.textContent ?? null,
      hint: cam?.querySelector('.rep-hint')?.textContent ?? null,
      setDone: rect(done),
      fps: cam?.getAttribute('data-fps') ?? null,
      bodyScrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });
}

async function m4(browser) {
  // 1. Settings with the spoken-count toggle.
  {
    const { ctx, page, log } = await newPhone(browser);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sw = page.getByRole('switch', { name: /Count reps out loud/ });
    await sw.waitFor();
    await sw.scrollIntoViewIfNeeded();
    const box = await sw.boundingBox();
    await shot(page, log, 'm4-settings-spoken-count', {
      switch: { checked: await sw.getAttribute('aria-checked'), box },
    });
    await ctx.close();
  }
  // 2. Camera sheet counting live, then 3. Rest after Set done.
  {
    const { ctx, page, log } = await newPhone(browser);
    await page.goto(BASE);
    const cam = await openCurlCamera(page);
    const reps = cam.locator('[data-reps]');
    const t0 = Date.now();
    while (Date.now() - t0 < 60_000) {
      if (Number(await reps.getAttribute('data-reps')) >= 3) break;
      await page.waitForTimeout(250);
    }
    const geom = await cameraGeometry(page);
    await shot(page, log, 'm4-camera-counting', { geom });
    const doneCount = { reps: geom.repsText, partials: geom.partials };
    await cam.getByRole('button', { name: 'Set done' }).click();
    await page.locator('[data-screen="rest"]').waitFor();
    await page.waitForTimeout(400);
    const restText = await page.locator('[data-screen="rest"]').innerText();
    await shot(page, log, 'm4-rest-after-counted-set', { doneCount, restText });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- M4c + M4b (Push A slice)

/** Records spoken text (with kind order) instead of speaking; wake lock stubbed. */
async function installSpeechSpy(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      constructor(text) {
        super();
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.volume = 1;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => {
          window.__spoken.push(u.text);
          setTimeout(() => u.dispatchEvent(new Event('end')), 300);
        },
        cancel: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
      },
    });
  });
}

async function pollUntil(fn, ms, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, step));
  }
  return null;
}

async function textSizes(page, root) {
  // Smallest visible text font-size and smallest visible button height under root.
  return page.evaluate((sel) => {
    const r = document.querySelector(sel) ?? document.body;
    let minFont = 999;
    let minFontText = '';
    for (const el of r.querySelectorAll('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const f = parseFloat(getComputedStyle(el).fontSize);
      if (f < minFont) {
        minFont = f;
        minFontText = el.textContent.trim().slice(0, 40);
      }
    }
    let minBtn = 999;
    let minBtnText = '';
    for (const b of r.querySelectorAll('button')) {
      const rc = b.getBoundingClientRect();
      if (!rc.width || !rc.height) continue;
      if (rc.height < minBtn) {
        minBtn = rc.height;
        minBtnText = (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30);
      }
    }
    return { minFont, minFontText, minBtn: Math.round(minBtn), minBtnText };
  }, root);
}

async function openFromList(page, name) {
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: name }).first().click();
  await page.getByRole('heading', { name }).waitFor();
}

async function m4c(browser) {
  // 1. Push A preview with badges.
  {
    const { ctx, page, log } = await newPhone(browser);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Push A/ }).click();
    await page.locator('.ex-row').first().waitFor();
    const rows = await page.locator('.ex-row').evaluateAll((els) =>
      els.map((e) => ({
        text: e.querySelector('.ex-name, h3, strong')?.textContent?.trim() ?? e.textContent.trim().slice(0, 40),
        badges: [...e.querySelectorAll('[data-badge]')].map((b) => ({
          t: b.textContent,
          font: parseFloat(getComputedStyle(b).fontSize),
        })),
      })),
    );
    await shot(page, log, 'm4c-preview-badges', { rows, sizes: await textSizes(page, 'main') });
    await ctx.close();
  }
  // 2. How-to sheet: Pushups (3D demo), then an Info exercise (Hammer Curls, Pull A).
  for (const [day, name, file] of [
    [/Push A/, 'Pushups', 'm4c-howto-pushups'],
    [/Pull A/, 'Hammer Curls', 'm4c-howto-info'],
  ]) {
    const { ctx, page, log } = await newPhone(browser);
    await page.goto(BASE);
    await page.getByRole('button', { name: day }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.locator('[data-howto-open]').waitFor();
    await openFromList(page, name);
    const headBadges = await page.locator('.exercise-head-text [data-badge]').allTextContents();
    const howBtn = await page.locator('[data-howto-open]').boundingBox();
    await page.locator('[data-howto-open]').click();
    const sheet = page.locator('[data-howto=sheet]');
    await sheet.waitFor();
    const stage = sheet.locator('[data-howto=stage]');
    if (name === 'Pushups') {
      await pollUntil(async () => (await stage.getAttribute('data-mode')) === '3d', 15_000);
      await page.waitForTimeout(1600); // mid-rep
    } else {
      await page.waitForTimeout(800);
    }
    const info = {
      headBadges,
      howBtnHeight: howBtn?.height,
      mode: await stage.getAttribute('data-mode'),
      playing: await sheet.locator('[data-demo-playing]').first().getAttribute('data-demo-playing').catch(() => null),
      tempo: await sheet.locator('[data-howto=tempo]').textContent().catch(() => null),
      lines: await sheet.locator('[data-howto=lines] li').allTextContents(),
      focus: await sheet.locator('[data-howto=focus]').textContent().catch(() => null),
      sheetScroll: await sheet.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight })),
      sizes: await textSizes(page, '[data-howto=sheet]'),
    };
    await shot(page, log, file, info);
    await ctx.close();
  }
  // 2b. The other five Push A demos mid-rep (SPEC M4b: screenshots of all 6 demos).
  {
    const { ctx, page, log } = await newPhone(browser);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Push A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.locator('[data-howto-open]').waitFor();
    for (const [name, slug] of [
      ['Dumbbell Bench Press', 'bench-press'],
      ['Incline Dumbbell Press', 'incline-press'],
      ['Seated Dumbbell Press', 'seated-press'],
      ['Side Lateral Raise', 'lateral-raise'],
      ['Standing Dumbbell Triceps Extension', 'triceps-extension'],
    ]) {
      if (name !== 'Dumbbell Bench Press') await openFromList(page, name);
      await page.locator('[data-howto-open]').click();
      const sheet = page.locator('[data-howto=sheet]');
      const stage = sheet.locator('[data-howto=stage]');
      await pollUntil(async () => (await stage.getAttribute('data-mode')) === '3d', 15_000);
      await page.waitForTimeout(1600);
      await shot(page, log, `m4b-demo-${slug}`, {
        mode: await stage.getAttribute('data-mode'),
        headBadges: await page.locator('.exercise-head-text [data-badge]').allTextContents(),
      });
      await sheet.locator('[data-howto=close]').click();
      await sheet.waitFor({ state: 'detached' });
    }
    await ctx.close();
  }
  // 3. Camera (curl clip on Pull A curl): set-up card, counting, hint; then Rest, Summary, Settings.
  {
    const { ctx, page, log } = await newPhone(browser);
    await installSpeechSpy(page);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Pull A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('heading', { name: 'One-Arm Dumbbell Row' }).waitFor();
    await openFromList(page, 'Dumbbell Bicep Curl');
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.locator('.rep-panel').waitFor();
    const card = cam.locator('[data-setup]');
    await card.waitFor();
    await page.waitForTimeout(900); // video frames up
    await shot(page, log, 'm4c-camera-setup-card', {
      setup: await card.getAttribute('data-setup'),
      cardText: await card.innerText(),
      spoken: await page.evaluate(() => window.__spoken.slice()),
      geom: await cameraGeometry(page),
    });
    const reps = cam.locator('[data-reps]');
    await pollUntil(async () => Number(await reps.getAttribute('data-reps')) >= 2, 60_000);
    const stageBox = await cam.locator('.cam-stage').boundingBox();
    await shot(page, log, 'm4c-camera-counting', {
      geom: await cameraGeometry(page),
      stageHeight: stageBox?.height,
      target: await cam.locator('[data-target]').textContent(),
      setLine: await cam.locator('[data-set]').textContent(),
      repsColor: await reps.evaluate((e) => getComputedStyle(e).color),
      targetFont: await cam.locator('[data-target]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      setFont: await cam.locator('[data-set]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      setup: await card.getAttribute('data-setup'),
      sizes: await textSizes(page, '[role="dialog"][aria-label="Camera"]'),
    });
    const coach = cam.locator('.rep-coach');
    const hinted = await pollUntil(async () => ((await coach.textContent()) ?? '').trim().length > 0, 60_000, 100);
    await shot(page, log, 'm4c-camera-hint', {
      hinted: Boolean(hinted),
      hint: await coach.textContent(),
      reason: await coach.getAttribute('data-hint-reason'),
      hintFont: await coach.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
      spoken: await page.evaluate(() => window.__spoken.slice()),
      geom: await cameraGeometry(page),
    });
    await cam.getByRole('button', { name: 'Set done' }).click();
    await page.locator('[data-rest-clock]').waitFor();
    const fix = page.locator('[data-lsc=panel]');
    await fix.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, log, 'm4c-rest-fix-last-set', {
      summary: await fix.locator('[data-lsc=summary]').textContent(),
      fixBtn: await fix.locator('[data-lsc=fix]').boundingBox(),
    });
    await fix.locator('[data-lsc=fix]').click();
    await fix.locator('[data-lsc=reps-plus]').click();
    await fix.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const stepBtns = await fix.locator('button').evaluateAll((bs) =>
      bs.filter((b) => b.offsetParent).map((b) => [b.textContent.trim() || b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().width)]),
    );
    const valueFont = await fix.locator('[data-lsc=reps-value]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    await shot(page, log, 'm4c-rest-fix-last-set-open', { stepBtns, valueFont });
    await fix.locator('[data-lsc=save]').click();
    await page.getByRole('button', { name: 'End workout' }).click();
    await page.getByRole('button', { name: 'Tap again to end' }).click();
    await page.getByRole('heading', { name: 'Workout done' }).waitFor();
    const sfix = page.locator('[data-lsc=panel]');
    await sfix.locator('[data-lsc=fix]').click();
    await sfix.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, log, 'm4c-summary-fix', {
      summary: await sfix.locator('[data-lsc=summary]').textContent(),
    });
    await sfix.locator('[data-lsc=save]').click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.locator('[data-devlog=panel]');
    await panel.waitFor();
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await shot(page, log, 'm4c-settings-devlog', {
      summary: await panel.locator('[data-devlog=summary]').textContent(),
      sessions: await panel.getAttribute('data-sessions'),
      sizes: await textSizes(page, '[data-devlog=panel]'),
    });
    await ctx.close();
  }
}

/** Push A click-through: placement cards + sentences, Set done, Rest Fix, Summary Fix, export. */
async function m4cFlow(browser) {
  const { ctx, page, log } = await newPhone(browser);
  await installSpeechSpy(page);
  const offsite = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && !/^(data|blob):/.test(r.url())) offsite.push(r.url());
  });
  const out = {};
  await page.goto(BASE);
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
  // A note with a sentinel, which must not reach the export.
  await page.getByRole('button', { name: 'Notes and machine setting' }).click();
  await page.locator('textarea').last().fill('SENTINEL-free-text-xyz');
  await page.locator('input[placeholder="e.g. Seat 4, pad 2"]').fill('SENTINEL-machine-xyz');
  await page.getByRole('button', { name: 'Save' }).click();
  out.cams = [];
  for (const name of ['Seated Dumbbell Press', 'Side Lateral Raise', 'Pushups']) {
    await openFromList(page, name);
    const before = await page.evaluate(() => window.__spoken.length);
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    const card = cam.locator('[data-setup]');
    await card.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(4000);
    const spokenNew = await page.evaluate((n) => window.__spoken.slice(n), before);
    const entry = {
      name,
      cardText: (await card.innerText()).replace(/\n+/g, ' | '),
      setupState: await card.getAttribute('data-setup'),
      target: await cam.locator('[data-target]').textContent().catch(() => null),
      setLine: await cam.locator('[data-set]').textContent().catch(() => null),
      reps: await cam.locator('[data-reps]').getAttribute('data-reps'),
      fps: await cam.getAttribute('data-fps'),
      spokenNew,
    };
    out.cams.push(entry);
    if (name !== 'Pushups') await cam.getByRole('button', { name: 'Close' }).click();
    else {
      await page.screenshot({ path: 'test-results/m4c-flow-pushups-camera.png' });
      await cam.getByRole('button', { name: 'Set done' }).click();
    }
  }
  await page.locator('[data-rest-clock]').waitFor();
  const fix = page.locator('[data-lsc=panel]');
  out.restSummaryBefore = await fix.locator('[data-lsc=summary]').textContent();
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-plus]').click();
  await fix.locator('[data-lsc=reps-plus]').click();
  await fix.locator('[data-lsc=save]').click();
  out.restSummaryAfter = await fix.locator('[data-lsc=summary]').textContent();
  // Second Pushups set: Start set → camera → spoken placement only once per exercise?
  await page.getByRole('button', { name: 'Start set' }).click();
  const before2 = await page.evaluate(() => window.__spoken.length);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam2 = page.getByRole('dialog', { name: 'Camera' });
  await cam2.locator('.rep-panel').waitFor();
  await page.waitForTimeout(3000);
  out.secondOpenSpoken = await page.evaluate((n) => window.__spoken.slice(n), before2);
  out.secondTarget = [await cam2.locator('[data-target]').textContent(), await cam2.locator('[data-set]').textContent()];
  await cam2.getByRole('button', { name: 'Set done' }).click();
  // Pushups was the last set planned? Either Rest or Summary follows; end explicitly if needed.
  if (!(await page.getByRole('heading', { name: 'Workout done' }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'End workout' }).click();
    await page.getByRole('button', { name: 'Tap again to end' }).click();
  }
  await page.getByRole('heading', { name: 'Workout done' }).waitFor();
  const sfix = page.locator('[data-lsc=panel]');
  out.summaryFixBefore = await sfix.locator('[data-lsc=summary]').textContent();
  await sfix.locator('[data-lsc=fix]').click();
  await sfix.locator('[data-lsc=partials-plus]').click();
  await sfix.locator('[data-lsc=save]').click();
  out.summaryFixAfter = await sfix.locator('[data-lsc=summary]').textContent();
  out.summaryText = (await page.locator('main').innerText()).slice(0, 600);
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.locator('[data-devlog=panel]');
  out.devlogSummary = await panel.locator('[data-devlog=summary]').textContent();
  // Real export path (no share mock): headless Chromium has no file share → download.
  const dl = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await panel.locator('[data-devlog=export-last]').click();
  const d = await dl;
  out.exportStatus = await panel.locator('[data-devlog=status]').textContent();
  if (d) {
    const path = `test-results/m4c-export-${Date.now()}.json.gz`;
    await d.saveAs(path);
    out.exportFile = { name: d.suggestedFilename(), path };
  }
  out.offsite = offsite;
  out.console = log;
  out.allSpoken = await page.evaluate(() => window.__spoken.slice());
  await ctx.close();
  console.log(JSON.stringify(out, null, 2));
}

// ------------------------------------- m4d-next round: S2 gauge, M4d demos, silent hint, M5b coach

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/** Records every request that leaves the dev server (http(s) to a non-local host). */
function watchOffsite(page) {
  const offsite = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(u.hostname))
      offsite.push(r.url());
  });
  return offsite;
}

/** Speech spy that records text + volume, with resume() (voice.ts calls it before speak). */
async function installSpeechSpy2(page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      constructor(text) {
        super();
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.volume = 1;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => {
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
          setTimeout(() => u.dispatchEvent(new Event('end')), 300);
        },
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => undefined, release: async () => undefined }) },
    });
  });
}

async function m4d(browser) {
  // Pull A preview badges.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Pull A/ }).click();
    await page.locator('.ex-row').first().waitFor();
    const rows = await page.locator('.ex-row').evaluateAll((els) =>
      els.map((e) => ({
        text: e.textContent.trim().slice(0, 60),
        badges: [...e.querySelectorAll('[data-badge]')].map((b) => ({
          t: b.textContent,
          font: parseFloat(getComputedStyle(b).fontSize),
        })),
      })),
    );
    await shot(page, log, 'm4d-pull-a-badges', { rows, sizes: await textSizes(page, 'main'), offsite });
    await ctx.close();
  }
  // How-to sheets for the six new demos, mid-rep.
  for (const [day, name, id] of [
    [/Pull A/, 'Dumbbell Bicep Curl', 'Dumbbell_Bicep_Curl'],
    [/Pull A/, 'One-Arm Dumbbell Row', 'One-Arm_Dumbbell_Row'],
    [/Legs A/, 'Goblet Squat', 'Goblet_Squat'],
    [/Pull A/, 'Hammer Curls', 'Hammer_Curls'],
    [/Pull A/, 'Reverse Flyes', 'Reverse_Flyes'],
    [/Pull A/, 'Wide-Grip Lat Pulldown', 'Wide-Grip_Lat_Pulldown'],
  ]) {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await page.goto(BASE);
    await page.getByRole('button', { name: day }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.locator('[data-howto-open]').waitFor();
    const heading = await page.locator('h1, h2').first().textContent();
    if (!heading?.includes(name)) await openFromList(page, name);
    const headBadges = await page.locator('.exercise-head-text [data-badge]').allTextContents();
    const howBtn = await page.locator('[data-howto-open]').boundingBox();
    await page.locator('[data-howto-open]').click();
    const sheet = page.locator('[data-howto=sheet]');
    await sheet.waitFor();
    const stage = sheet.locator('[data-howto=stage]');
    await pollUntil(async () => (await stage.getAttribute('data-mode')) === '3d', 15_000);
    await page.waitForTimeout(1600); // mid-rep
    const info = {
      id,
      headBadges,
      howBtnHeight: howBtn?.height,
      mode: await stage.getAttribute('data-mode'),
      playing: await sheet.locator('[data-demo-playing]').first().getAttribute('data-demo-playing').catch(() => null),
      phase: await sheet.locator('[data-howto=phase]').textContent().catch(() => null),
      tempo: await sheet.locator('[data-howto=tempo]').textContent().catch(() => null),
      lines: await sheet.locator('[data-howto=lines] li').allTextContents(),
      focus: await sheet.locator('[data-howto=focus]').textContent().catch(() => null),
      sheetScroll: await sheet.evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight })),
      sizes: await textSizes(page, '[data-howto=sheet]'),
      offsite,
    };
    await shot(page, log, `m4d-howto-${id.toLowerCase().replace(/_/g, '-')}`, info);
    await ctx.close();
  }
}

async function s2(browser) {
  const { ctx, page, log } = await newPhone(browser);
  await installSpeechSpy2(page);
  const offsite = watchOffsite(page);
  await page.goto(BASE);
  const cam = await openCurlCamera(page);
  const gauge = cam.locator('[data-gauge]');
  // Mid-rep: gauge visible and the zone is "moving" (between the start and target lines).
  const ok = await pollUntil(async () => {
    const vis = await gauge.isVisible().catch(() => false);
    const zone = await gauge.getAttribute('data-gauge-zone').catch(() => null);
    return vis && zone === 'moving';
  }, 60_000, 50);
  const g = await gauge.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const px = (s) => {
      const e = el.querySelector(s);
      return e ? parseFloat(getComputedStyle(e).fontSize) : null;
    };
    return {
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      angle: el.dataset.angle,
      zone: el.dataset.gaugeZone,
      reached: el.dataset.gaugeReached,
      missed: el.dataset.gaugeMissed,
      angleText: el.querySelector('.gauge-angle')?.textContent,
      labels: [...el.querySelectorAll('.gauge-label')].map((l) => l.textContent),
      labelFont: px('.gauge-label'),
      angleFont: px('.gauge-angle'),
    };
  });
  await shot(page, log, 's2-camera-gauge', { midRep: Boolean(ok), gauge: g, geom: await cameraGeometry(page), offsite });
  await ctx.close();
}

async function silentHintShot(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    userAgent: IPHONE_UA,
  });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  const offsite = watchOffsite(page);
  await page.goto(BASE);
  await page.getByRole('button', { name: /Push A/ }).click();
  const hint = page.locator('[data-screen="preview"] [data-silent-hint]');
  await hint.waitFor();
  const start = page.getByRole('button', { name: 'Start workout' });
  const info = {
    text: await hint.innerText(),
    hintBox: await hint.boundingBox(),
    startBox: await start.boundingBox(),
    gotIt: await hint.getByRole('button', { name: 'Got it' }).boundingBox(),
    textFont: await hint.locator('.silent-hint-text').evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
    colors: await hint.evaluate((e) => {
      const t = e.querySelector('.silent-hint-text');
      return { fg: getComputedStyle(t).color, bg: getComputedStyle(e).backgroundColor };
    }),
    offsite,
  };
  await shot(page, log, 'silent-hint-preview', info);
  await ctx.close();
  // Non-iOS UA (the default phone context): no hint.
  const p2 = await newPhone(browser);
  await p2.page.goto(BASE);
  await p2.page.getByRole('button', { name: /Push A/ }).click();
  await p2.page.getByRole('button', { name: 'Start workout' }).waitFor();
  results.push({ check: 'silent hint on non-iOS UA', count: await p2.page.locator('[data-silent-hint]').count() });
  await p2.ctx.close();
}

/** M5b click-through: Push A in lb → Bench 2 clean sets → A3 tip spoken once → Apply 40 lb → ... */
async function m5b(browser) {
  const { ctx, page, log } = await newPhone(browser);
  await installSpeechSpy2(page);
  const offsite = watchOffsite(page);
  const out = { steps: [] };
  const step = (k, v) => out.steps.push({ [k]: v });
  const spoken = () => page.evaluate(() => window.__spoken.slice());
  await page.goto(BASE);
  // lb mode.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
  step('startWeight', await page.getByLabel('lb', { exact: true }).textContent());
  // Set 1 at the top (8 reps default).
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.locator('[data-rest-clock]').waitFor();
  await page.waitForTimeout(3500);
  step('set1TipCount', await page.locator('[data-coach-tip]').count());
  await page.getByRole('button', { name: 'Start set' }).click();
  await page.waitForTimeout(500);
  // Set 2 at the top → A3.
  await page.getByRole('button', { name: 'Set done' }).click();
  const tRest = Date.now();
  const tip = page.locator('[data-coach-tip]');
  await tip.waitFor();
  const spokenAt1s = await spoken();
  await page.waitForTimeout(3500);
  const say = 'Strong set. Try plus 5 pounds next set.';
  const countSay = (l) => l.filter((t) => t === say).length;
  const s3 = await spoken();
  const apply = tip.getByRole('button', { name: /Apply/ });
  await tip.scrollIntoViewIfNeeded();
  await shot(page, log, 'm5b-rest-coach-tip', {
    rule: await tip.getAttribute('data-advice-rule'),
    text: await tip.locator('[data-coach="text"]').textContent(),
    why: await tip.locator('[data-coach="why"]').textContent(),
    applyText: await apply.textContent(),
    applyBox: await apply.boundingBox(),
    sizes: await textSizes(page, '[data-coach-tip]'),
    fonts: await tip.evaluate((e) => ({
      text: parseFloat(getComputedStyle(e.querySelector('[data-coach="text"]')).fontSize),
      why: parseFloat(getComputedStyle(e.querySelector('[data-coach="why"]')).fontSize),
    })),
    msSinceRest: Date.now() - tRest,
    spokenBefore2s: spokenAt1s.includes(say),
    spokenCountAt3_5s: countSay(s3),
  });
  await page.waitForTimeout(6000);
  step('spokenCountAt9_5s', countSay(await spoken()));
  await apply.click();
  await tip.locator('[data-coach="applied"]').waitFor();
  await page.waitForTimeout(300);
  await tip.scrollIntoViewIfNeeded();
  await shot(page, log, 'm5b-rest-coach-applied', {
    applied: await tip.locator('[data-coach="applied"]').textContent(),
    buttonsInTip: await tip.getByRole('button').count(),
    nextUp: await page.locator('.next-up').textContent(),
  });
  await page.getByRole('button', { name: 'Start set' }).click();
  step('set3Counter', await page.locator('[data-set-counter]').textContent());
  step('set3Weight', await page.getByLabel('lb', { exact: true }).textContent());
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.locator('[data-rest-clock]').waitFor();
  await page.waitForTimeout(3000);
  step('afterSet3Tip', await tip.count() ? await tip.locator('[data-coach="text"]').textContent() : null);
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'Tap again to end' }).click();
  await page.getByRole('heading', { name: 'Workout done' }).waitFor();
  const summary = page.locator('[data-coach-summary]');
  await summary.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shot(page, log, 'm5b-summary-coach', {
    text: await summary.innerText(),
    items: await summary.locator('[data-coach-exercise]').evaluateAll((els) =>
      els.map((e) => ({ id: e.getAttribute('data-coach-exercise'), rule: e.getAttribute('data-advice-rule') })),
    ),
    sizes: await textSizes(page, '[data-coach-summary]'),
  });
  step('allSpokenWorkout1', await spoken());
  await page.getByRole('button', { name: 'Done' }).click();
  // Dev-log export.
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.locator('[data-devlog=panel]');
  await panel.waitFor();
  const dl = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
  await panel.locator('[data-devlog=export-last]').click();
  const d = await dl;
  if (d) {
    const path = `test-results/m5b-export-${Date.now()}.json.gz`;
    await d.saveAs(path);
    out.exportFile = path;
  }
  // Coach tips switch.
  const sw = page.locator('[data-setting="coach-tips"]');
  await sw.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await shot(page, log, 'm5b-settings-coach-switch', {
    checked: await sw.getAttribute('aria-checked'),
    label: await sw.innerText(),
    box: await sw.boundingBox(),
    sizes: await textSizes(page, 'main'),
  });
  await sw.click();
  step('switchAfterTap', await sw.getAttribute('aria-checked'));
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  step('switchAfterReload', await page.locator('[data-setting="coach-tips"]').getAttribute('aria-checked'));
  await page.getByRole('button', { name: '‹ Back' }).click();
  const before = (await spoken()).length;
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
  await page.getByRole('button', { name: 'Reps minus' }).click();
  await page.getByRole('button', { name: 'Reps minus' }).click(); // 6 < 8 → would be A2
  await page.getByRole('button', { name: 'Set done' }).click();
  await page.locator('[data-rest-clock]').waitFor();
  await page.waitForTimeout(5000);
  step('tipsOffTipCount', await page.locator('[data-coach-tip]').count());
  step('tipsOffSpoken', (await spoken()).slice(before));
  out.offsite = offsite;
  out.console = log;
  await ctx.close();
  results.push({ m5bFlow: out });
}

const milestone = process.argv[2] ?? 'm4';
ensureFakeCamera();
mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
try {
  await waitForServer(BASE);
  const browser = await chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${FAKE}`,
    ],
  });
  if (milestone === 'm4') await m4(browser);
  else if (milestone === 'm4c') await m4c(browser);
  else if (milestone === 'm4c-flow') await m4cFlow(browser);
  else if (milestone === 'm5b') {
    // m4d-next round: M5b coach flow, S2 gauge, M4d demos + badges, silent hint.
    const only = process.argv[3];
    if (!only || only === 'coach') await m5b(browser);
    if (!only || only === 's2') await s2(browser);
    if (!only || only === 'm4d') await m4d(browser);
    if (!only || only === 'silent') await silentHintShot(browser);
  }
  else throw new Error(`unknown milestone ${milestone}`);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
}
