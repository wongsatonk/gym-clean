// Verifier-owned phone-size screenshots (390x844 CSS px, DPR 2).
// The Playwright MCP browser rejects the self-signed dev cert, so this script drives Chromium
// directly with ignoreHTTPSErrors. It starts its own Vite dev server on SHOT_PORT (default 5197).
//
//   node scripts/screenshots.mjs m4          # M4 screens
//   node scripts/screenshots.mjs m4c         # M4c + M4b Push A slice screens
//   node scripts/screenshots.mjs m4c-flow    # Push A click-through (JSON report, export saved
//                                            #   under test-results/), no docs screenshots
//   node scripts/screenshots.mjs m5           # M5 focus cues (fixture landmarker): live cue, stalled,
//                                            #   out of frame, Rest Fix, Summary Focus / not scored,
//                                            #   Coach T1, Settings coach voice; dev-log export saved
//                                            #   to test-results/verify-m5/
//   node scripts/screenshots.mjs m5b [coach|s2|m4d|silent]
//                                            # m4d-next round: M5b coach click-through, S2 gauge,
//                                            #   M4d demos + Pull A badges, silent hint (iOS UA)
//   node scripts/screenshots.mjs m4e [orange|volt|yellow]
//                                            # M4e redesign: every screen per accent
//   node scripts/screenshots.mjs m5c-hold    # M5c breaks inside a set: body-line hold, Continue →
//                                            #   one set; last-set hold (Save set); dev-log export
//                                            #   to test-results/verify-m5c-hold/
//
// For each screen it records document.documentElement.scrollWidth, console errors/warnings and
// page errors, and prints a JSON summary. The fake camera plays the synthetic curl clip
// (test-results/fake-camera/person.mjpeg, made by e2e/fake-camera.setup.ts).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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

// ------------------------------------- M5c hands-free sets (fixture landmarker, like e2e/hands-free)

const HF_CURL = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';
const HF_PRESS = '/fixtures/landmarks/shoulder-press/synthetic-01__reps-4__partials-0.json';

/** Speech spy + wake lock + share-less export, and the fixture player in place of the model. */
async function installHandsFreeMocks(page, fixture) {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0;
    window.__noPerson = false;
    window.__play = () => {
      window.__playedAt = Date.now();
      window.__freezeAt = null;
    };
    window.__freezeWhenReps = (n) => {
      const check = () => {
        const el = document.querySelector('[role=dialog] .rep-num[data-reps]');
        if (el && Number(el.dataset.reps) >= n) {
          window.__freezeAt = 0;
          obs.disconnect();
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-reps'] });
      check();
    };
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
          if (u.volume === 0) return;
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
      value: { request: async () => ({ addEventListener: () => undefined, release: async () => undefined }) },
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
              if (window.__freezeAt != null) { base = null; return { ...frames[window.__freezeAt], t }; }
              base ??= t;
              const i = Math.floor((t - base) / 33.333) % frames.length;
              return { ...frames[i], t };
            },
            close() {},
          };
        }`,
    }),
  );
}

/** Font sizes / tap heights of the hands-free parts that must be readable at 2 m. */
async function handsFreeSizes(page) {
  return page.evaluate(() => {
    const px = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        font: parseFloat(getComputedStyle(el).fontSize),
        h: Math.round(r.height),
        w: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        text: (el.textContent ?? '').trim().slice(0, 60),
        color: getComputedStyle(el).color,
        bg: getComputedStyle(el).backgroundColor,
      };
    };
    return {
      bannerReps: px('[data-auto-stop="reps"]'),
      undo: px('[data-auto-stop="undo"]'),
      restClock: px('[data-cam-rest-clock]'),
      restNext: px('[data-cam-rest="next"]'),
      restStart: px('[data-cam-rest="start"]'),
      restClose: px('[data-cam-rest="close"]'),
      repNum: px('[role=dialog] .rep-num[data-reps]'),
      setDone: px('[role=dialog][aria-label="Camera"] button.set-done, [role=dialog][aria-label="Camera"] [data-set-done]'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
}

async function m5c(browser) {
  // A. Pull A curl: settings, pending Undo, camera rest mode, auto-started set; dev-log export.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installHandsFreeMocks(page, HF_CURL);
    const out = {};
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Settings' }).click();
    const sw = page.locator('[data-setting="hands-free"]');
    await sw.waitFor();
    await sw.scrollIntoViewIfNeeded();
    await shot(page, log, 'm5c-settings-hands-free', {
      switch: { checked: await sw.getAttribute('aria-checked'), box: await sw.boundingBox() },
      sizes: await textSizes(page, 'main'),
    });
    await page.getByRole('button', { name: '‹ Back' }).click();

    await page.getByRole('button', { name: /Pull A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await openFromList(page, 'Dumbbell Bicep Curl');
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    // Set 1: two reps, then hold still → stop pending (Undo window).
    await page.evaluate(() => window.__freezeWhenReps(2));
    await page.evaluate(() => window.__play());
    const banner = cam.locator('[data-auto-stop="pending"]');
    await banner.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await shot(page, log, 'm5c-pending-undo', {
      reason: await banner.getAttribute('data-reason'),
      hf: await handsFreeSizes(page),
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    // Window over → saved → rest mode with clock + tip + Fix.
    await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    out.restSlots = {
      coach: await cam.locator('[data-cam-rest="coach"]').isVisible(),
      fix: await cam.locator('[data-cam-rest="fix"]').isVisible(),
    };
    await shot(page, log, 'm5c-camera-rest', {
      hf: await handsFreeSizes(page),
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
      slots: out.restSlots,
    });
    // Rest is already ~12 s in (armed): play → 2 reps → auto start of set 2.
    await page.evaluate(() => window.__play());
    await cam.and(page.locator('[data-cam-mode="set"]')).waitFor({ timeout: 15_000 });
    await page.evaluate(() => (window.__freezeAt = 0));
    await page.waitForTimeout(600);
    await shot(page, log, 'm5c-auto-started', {
      set: await cam.locator('[data-set]').getAttribute('data-set'),
      reps: await cam.locator('.rep-num[data-reps]').getAttribute('data-reps'),
      hf: await handsFreeSizes(page),
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    // Let set 2 auto-stop and save (still → window → commit), then end the workout.
    await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor({ timeout: 20_000 });
    out.spoken = await page.evaluate(() => window.__said.map((s) => s.text));
    await cam.locator('[data-cam-rest="close"]').click();
    await page.getByRole('button', { name: 'End workout' }).click();
    await page.getByRole('button', { name: 'Tap again to end' }).click();
    await page.getByRole('heading', { name: 'Workout done' }).waitFor();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.locator('[data-devlog=panel]');
    out.devlogSessions = await panel.getAttribute('data-sessions');
    const dl = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await panel.locator('[data-devlog=export-last]').click();
    const d = await dl;
    out.exportStatus = await panel.locator('[data-devlog=status]').textContent();
    if (d) {
      const path = `test-results/m5c-export-${Date.now()}.json.gz`;
      await d.saveAs(path);
      out.exportFile = path;
    }
    out.offsite = offsite;
    out.console = log;
    await ctx.close();
    results.push({ m5cFlowA: out });
  }
  // B. Push A press: last set hands-free → camera closes → Rest shows Camera for the lateral raise.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installHandsFreeMocks(page, HF_PRESS);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Push A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await openFromList(page, 'Seated Dumbbell Press');
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.locator('.rep-panel').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    for (const n of [1, 2]) {
      await cam.locator(`[data-set="${n}/3"]`).waitFor();
      await cam.getByRole('button', { name: 'Set done' }).click();
      await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor();
      await cam.locator('[data-cam-rest="start"]').click();
      await cam.and(page.locator('[data-cam-mode="set"]')).waitFor();
    }
    await cam.locator('[data-set="3/3"]').waitFor();
    await page.evaluate(() => window.__freezeWhenReps(2));
    await page.evaluate(() => window.__play());
    await cam.locator('[data-auto-stop="pending"]').waitFor({ timeout: 20_000 });
    await page.getByRole('dialog', { name: 'Camera' }).waitFor({ state: 'detached', timeout: 10_000 });
    await page.locator('[data-rest-clock]').waitFor();
    await page.waitForTimeout(1500);
    const camBtn = page.getByRole('button', { name: 'Camera', exact: true });
    await shot(page, log, 'm5c-rest-camera-button', {
      cameraButton: await camBtn.boundingBox(),
      sizes: await textSizes(page, 'main'),
      offsite,
    });
    await camBtn.click();
    const next = page.getByRole('dialog', { name: 'Camera' });
    await next.locator('[data-cam-rest-clock]').waitFor();
    results.push({
      m5cFlowB: {
        nextMode: await next.getAttribute('data-cam-mode'),
        nextLine: await next.locator('[data-cam-rest="next"]').textContent(),
        spoken: await page.evaluate(() => window.__said.map((s) => s.text)),
        console: log,
      },
    });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- M5 (live focus & form cues)

const M5_RUSHED = '/fixtures/landmarks/curl/synthetic-03-rushed-lowering__reps-8__partials-0.json';
const M5_CURL = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';
const M5_DEVLOG = 'test-results/verify-m5/m5-devlog-export.json';

/** Fixture player (like e2e/focus-cues.spec.ts) + speech spy + wake lock + share-sheet capture. */
async function installM5Mocks(page, fixture) {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0;
    window.__from = 0;
    window.__noPerson = false;
    window.__hideWrists = false;
    window.__slowMs = 0;
    window.__play = () => {
      window.__freezeAt = null;
    };
    window.__holdWhenReps = (n, frame) => {
      const check = () => {
        const el = document.querySelector('[role=dialog] .rep-num[data-reps]');
        if (el && Number(el.dataset.reps) >= n) {
          window.__freezeAt = frame;
          obs.disconnect();
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-reps'] });
      check();
    };
    class FakeUtterance extends EventTarget {
      constructor(text) {
        super();
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => {
          if (u.volume === 0) return;
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
      value: (d) => Boolean(d?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d) => {
        window.__shared.push(...(d.files ?? []));
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => undefined, release: async () => undefined }) },
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
              if (window.__freezeAt != null) { base = null; f = frames[window.__freezeAt]; }
              else {
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

async function m5SeedHandsFreeOff(page) {
  const ok = await pollUntil(
    () =>
      page.evaluate(
        () =>
          new Promise((resolve) => {
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
                tx.objectStore('settings').put({ key: 'handsFree', value: false });
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
      ),
    10_000,
  );
  if (!ok) throw new Error('could not seed handsFree=false');
  await page.reload();
}

async function m5SetRows(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result.map((r) => ({
              exerciseId: r.exerciseId, setIndex: r.setIndex, reps: r.reps,
              partials: r.partials, cues: r.cues, focusScore: r.focusScore,
            })));
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

async function m5Said(page) {
  return page.evaluate(() => window.__said.map((s) => s.text).filter((t) => t !== '<cancel>'));
}

async function m5GoToCurl(page) {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('heading', { name: 'One-Arm Dumbbell Row' }).waitFor();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' }).click();
  const startSet = page.getByRole('button', { name: 'Start set' });
  if (await startSet.isVisible()) await startSet.click();
  await page.getByRole('heading', { name: 'Dumbbell Bicep Curl' }).waitFor();
}

async function m5OpenCam(page) {
  await page.evaluate(() => (window.__freezeAt = 0));
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
  return cam;
}

async function m5RepsThenFreeze(page, cam, n, frame = 0) {
  await page.evaluate(([n, f]) => window.__holdWhenReps(n, f), [n, frame]);
  await page.evaluate(() => window.__play());
  await cam.locator(`.rep-num[data-reps="${n}"]`).waitFor({ timeout: 45_000 });
}

async function m5FixLastSet(page, r, p, shotName, log) {
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
  if (shotName) {
    await fix.scrollIntoViewIfNeeded();
    await shot(page, log, shotName, { sizes: await textSizes(page, 'main') });
  }
  await fix.locator('[data-lsc=save]').click();
}

async function m5CueStyle(cam) {
  const coach = cam.locator('.rep-coach[data-cue]');
  if (!(await coach.count())) return null;
  return coach.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { id: el.dataset.cue, text: el.textContent, font: parseFloat(cs.fontSize),
      color: cs.color, bg: cs.backgroundColor };
  });
}

async function m5EndWorkout(page) {
  await page.getByRole('button', { name: 'End workout' }).click();
  await page.getByRole('button', { name: 'Tap again to end' }).click();
  await page.getByRole('heading', { name: 'Workout done' }).waitFor();
}

async function m5FocusSizes(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[data-focus-summary] *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own) continue;
      out.push({ cls: el.className, text: el.textContent.trim().slice(0, 50),
        font: parseFloat(getComputedStyle(el).fontSize), color: getComputedStyle(el).color });
    }
    return out;
  });
}

async function m5(browser) {
  // A. Rushed curl (hands-free off): live cue, Rest Fix, set 2, Summary Focus + Coach T1, export.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installM5Mocks(page, M5_RUSHED);
    await page.goto(BASE);
    await m5SeedHandsFreeOff(page);
    await m5GoToCurl(page);
    let cam = await m5OpenCam(page);
    await m5RepsThenFreeze(page, cam, 8);
    await cam.locator('.rep-coach[data-cue="rushedLowering"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-camera-cue', {
      cue: await m5CueStyle(cam),
      hf: await handsFreeSizes(page),
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
      said: await m5Said(page),
    });
    await cam.getByRole('button', { name: 'Set done' }).click();
    await cam.waitFor({ state: 'detached' });
    await page.locator('[data-rest-clock]').waitFor();
    await page.waitForTimeout(800);
    await m5FixLastSet(page, 8, 1, 'm5-rest-fix-score', log);
    await page.waitForTimeout(500);
    const afterFix = await m5SetRows(page);
    // Set 2: same clip.
    await page.getByRole('button', { name: 'Start set' }).click();
    cam = await m5OpenCam(page);
    await m5RepsThenFreeze(page, cam, 8);
    await cam.locator('.rep-coach[data-cue="rushedLowering"]').waitFor({ timeout: 10_000 });
    await cam.getByRole('button', { name: 'Set done' }).click();
    await cam.waitFor({ state: 'detached' });
    await m5EndWorkout(page);
    const focus = page.locator('[data-focus-summary]');
    await focus.waitFor();
    await focus.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-summary-focus', {
      rows: await m5SetRows(page),
      afterFix,
      focusText: (await focus.innerText()).split('\n'),
      focusSizes: await m5FocusSizes(page),
      sizes: await textSizes(page, '[data-focus-summary]'),
    });
    const coachRow = page.locator('[data-coach-exercise="Dumbbell_Bicep_Curl"]');
    await coachRow.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-coach-tempo', {
      rule: await coachRow.getAttribute('data-advice-rule'),
      text: await coachRow.innerText(),
      sizes: await textSizes(page, 'main'),
    });
    // Dev-log export (mocked share sheet).
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.locator('[data-devlog=panel]');
    await panel.locator('[data-devlog=export-last]').click();
    await panel.locator('[data-devlog=status]', { hasText: 'Shared.' }).waitFor({ timeout: 15_000 });
    const text = await page.evaluate(async () => {
      const file = window.__shared.at(-1);
      if (!file) return '';
      const stream = file.name.endsWith('.gz')
        ? file.stream().pipeThrough(new DecompressionStream('gzip'))
        : file.stream();
      return new Response(stream).text();
    });
    mkdirSync('test-results/verify-m5', { recursive: true });
    writeFileSync(M5_DEVLOG, text);
    const ev = JSON.parse(text).sessions[0].events;
    results.push({
      m5Export: {
        file: M5_DEVLOG,
        focusCue: ev.filter((e) => e.type === 'focusCue').map((e) => e.data),
        focusScore: ev.filter((e) => e.type === 'focusScore').map((e) => e.data),
      },
      offsiteA: offsite,
      saidA: await m5Said(page),
      consoleA: log,
    });
    await ctx.close();
  }
  // B. M4 curl clip (hands-free off): stalled cue, out of frame, low fps, Summary "(not scored)".
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installM5Mocks(page, M5_CURL);
    await page.goto(BASE);
    await m5SeedHandsFreeOff(page);
    await m5GoToCurl(page);
    const cam = await m5OpenCam(page);
    await m5RepsThenFreeze(page, cam, 3);
    await cam.locator('.rep-coach[data-cue="stalled"]').waitFor({ timeout: 14_000 });
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-camera-stalled', {
      cue: await m5CueStyle(cam),
      hf: await handsFreeSizes(page),
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    await page.waitForTimeout(6_500);
    await page.evaluate(() => (window.__hideWrists = true));
    await cam.locator('.rep-coach[data-cue="outOfFrame"]').waitFor({ timeout: 8_000 });
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-camera-out-of-frame', { cue: await m5CueStyle(cam) });
    await page.evaluate(() => (window.__hideWrists = false));
    await page.waitForTimeout(6_500);
    await page.evaluate(() => (window.__slowMs = 90));
    await pollUntil(async () => (await m5Said(page)).includes('Move closer to the light.'), 14_000);
    await page.evaluate(() => (window.__slowMs = 0));
    await cam.getByRole('button', { name: 'Set done' }).click();
    await cam.waitFor({ state: 'detached' });
    await m5EndWorkout(page);
    const focus = page.locator('[data-focus-summary]');
    await focus.waitFor();
    await focus.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-summary-not-scored', {
      rows: await m5SetRows(page),
      focusText: (await focus.innerText()).split('\n'),
      focusSizes: await m5FocusSizes(page),
    });
    results.push({ offsiteB: offsite, saidB: await m5Said(page), consoleB: log });
    await ctx.close();
  }
  // C. Settings → Coach voice.
  {
    const { ctx, page, log } = await newPhone(browser);
    await installM5Mocks(page, M5_CURL);
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Settings' }).click();
    const cv = page.locator('[data-coach-voice]');
    await cv.waitFor();
    await cv.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await shot(page, log, 'm5-settings-coach-voice', {
      sizes: await textSizes(page, '[data-coach-voice]'),
      text: (await cv.innerText()).split('\n'),
    });
    await cv.getByRole('button', { name: 'Drill sergeant' }).click();
    await page.waitForTimeout(300);
    await cv.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, log, 'm5-settings-coach-voice-drill', {
      sizes: await textSizes(page, '[data-coach-voice]'),
      text: (await cv.innerText()).split('\n'),
    });
    await ctx.close();
  }
}

// ------------------------------- M5c follow-up: breaks inside a set ("tap to continue", B10)

const M5C_HOLD_DEVLOG = 'test-results/verify-m5c-hold/m5c-hold-devlog.json';

/**
 * Like e2e/hands-free-break.spec.ts: a head-on push-up clip built from the core test kit, with
 * __sit (hips at 45°: the body-line gate fails, person in frame) and __noPerson hooks. Speech spy,
 * wake lock and a share-sheet capture for the dev-log export.
 */
async function installHoldMocks(page) {
  await page.addInitScript(() => {
    window.__said = [];
    window.__freezeAt = 0;
    window.__noPerson = false;
    window.__sit = false;
    window.__play = () => {
      window.__freezeAt = null;
    };
    window.__freezeWhenReps = (n) => {
      const check = () => {
        const el = document.querySelector('[role=dialog] .rep-num[data-reps]');
        if (el && Number(el.dataset.reps) >= n) {
          window.__freezeAt = 0;
          obs.disconnect();
        }
      };
      const obs = new MutationObserver(check);
      obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-reps'] });
      check();
    };
    class FakeUtterance extends EventTarget {
      constructor(text) {
        super();
        this.text = text;
        this.lang = '';
        this.rate = 1;
        this.pitch = 1;
        this.volume = 1;
        this.voice = null;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => {
          if (u.volume === 0) return;
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
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => Boolean(d?.files?.length) });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d) => {
        window.__shared.push(...(d.files ?? []));
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => undefined, release: async () => undefined }) },
    });
  });
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
          const pose = (f, t) => ({ ...withHip(f, window.__sit ? 45 : 175), t });
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__noPerson) { base = null; return null; }
              if (window.__freezeAt != null) { base = null; return pose(frames[window.__freezeAt], t); }
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

async function holdSizes(page) {
  return page.evaluate(() => {
    const px = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').trim().slice(0, 40),
        font: parseFloat(cs.fontSize),
        h: Math.round(r.height),
        w: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        color: cs.color,
        bg: cs.backgroundColor,
      };
    };
    const panel = document.querySelector('[data-hold]');
    const card = panel?.querySelector('.hold-card');
    return {
      reason: panel?.getAttribute('data-reason'),
      lastSet: panel?.getAttribute('data-last-set'),
      panel: px(panel),
      card: px(card),
      title: px(panel?.querySelector('[data-hold-title]')),
      clock: px(panel?.querySelector('[data-hold-clock]')),
      label: px(panel?.querySelector('.hold-label')),
      buttons: [...(panel?.querySelectorAll('button') ?? [])].map(px),
      shownReps: document.querySelector('[role=dialog] .rep-num[data-reps]')?.getAttribute('data-reps'),
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });
}

async function holdOpenPushups(page) {
  await page.goto(BASE);
  await page.getByRole('button', { name: /Push A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await openFromList(page, 'Pushups');
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
  return cam;
}

async function holdRepsThenFreeze(page, cam, n) {
  await page.evaluate((k) => {
    window.__freezeWhenReps(k);
    window.__play();
  }, n);
  await cam.locator(`.rep-num[data-reps="${n}"]`).waitFor({ timeout: 25_000 });
}

const holdSaidFrom = (page, from) => page.evaluate((f) => window.__said.slice(f).map((s) => s.text), from);
const holdSaidLen = (page) => page.evaluate(() => window.__said.length);
async function holdWaitSaid(page, text, from, ms) {
  const ok = await pollUntil(async () => (await holdSaidFrom(page, from)).includes(text), ms);
  if (!ok) throw new Error(`not said within ${ms} ms: ${text}`);
}

async function m5cHold(browser) {
  // A. Push-ups set 1: 2 reps → sit down (body-line gate) → hold → screenshot → Continue → 2 more
  //    reps → still stop → one saved set of 4. End workout, dev-log export.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installHoldMocks(page);
    const out = {};
    const cam = await holdOpenPushups(page);
    await holdRepsThenFreeze(page, cam, 2);
    let from = await holdSaidLen(page);
    await page.evaluate(() => (window.__sit = true));
    await holdWaitSaid(page, 'Set on hold. Tap to continue.', from, 10_000);
    await cam.locator('[data-hold]').waitFor();
    await page.waitForTimeout(7_000); // clock past 0:10
    await shot(page, log, 'm5c-hold', {
      hold: await holdSizes(page),
      sizes: await textSizes(page, '[data-hold]'),
      camSizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    out.saidToHold = await holdSaidFrom(page, from);
    // Continue.
    await page.evaluate(() => (window.__sit = false));
    from = await holdSaidLen(page);
    await cam.locator('[data-hold]').getByRole('button', { name: 'Continue set' }).click();
    await cam.locator('[data-hold]').waitFor({ state: 'detached', timeout: 5_000 });
    out.repsAfterContinue = await cam.locator('.rep-num[data-reps]').getAttribute('data-reps');
    await holdRepsThenFreeze(page, cam, 4);
    await holdWaitSaid(page, 'Set done. 4 reps.', from, 15_000);
    await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor({ timeout: 15_000 });
    out.saidAfterContinue = await holdSaidFrom(page, from);
    await page.waitForTimeout(800);
    await shot(page, log, 'm5c-hold-continued-rest', {
      sizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    await cam.locator('[data-cam-rest="close"]').click();
    await page.getByRole('button', { name: 'End workout' }).click();
    await page.getByRole('button', { name: 'Tap again to end' }).click();
    await page.getByRole('heading', { name: 'Workout done' }).waitFor();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.locator('[data-devlog=panel]');
    await panel.locator('[data-devlog=export-last]').click();
    await panel.locator('[data-devlog=status]', { hasText: 'Shared.' }).waitFor({ timeout: 15_000 });
    const text = await page.evaluate(async () => {
      const file = window.__shared.at(-1);
      if (!file) return '';
      const stream = file.name.endsWith('.gz')
        ? file.stream().pipeThrough(new DecompressionStream('gzip'))
        : file.stream();
      return new Response(stream).text();
    });
    mkdirSync('test-results/verify-m5c-hold', { recursive: true });
    writeFileSync(M5C_HOLD_DEVLOG, text);
    const sessions = JSON.parse(text).sessions ?? [];
    const ev = sessions.flatMap((s) => s.events ?? []);
    out.export = {
      file: M5C_HOLD_DEVLOG,
      autoSet: ev.filter((e) => e.type === 'autoSet').map((e) => e.data),
      setDone: ev.filter((e) => /set/i.test(e.type) && e.type !== 'autoSet').map((e) => ({ type: e.type, data: e.data })),
    };
    out.offsite = offsite;
    out.console = log;
    results.push({ m5cHoldA: out });
    await ctx.close();
  }
  // B. Sets 1–2 via hold → Start next set; set 3 (the last): walk away → hold → Save set.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installHoldMocks(page);
    const out = { sets: [] };
    const cam = await holdOpenPushups(page);
    for (const set of ['1/3', '2/3']) {
      await cam.locator(`[data-set="${set}"]`).waitFor();
      await page.evaluate(() => (window.__noPerson = false));
      await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 10_000 });
      await holdRepsThenFreeze(page, cam, 2);
      const from = await holdSaidLen(page);
      await page.evaluate(() => (window.__noPerson = true));
      await holdWaitSaid(page, 'Set on hold. Tap to continue.', from, 10_000);
      await cam.locator('[data-hold]').getByRole('button', { name: 'Start next set' }).click();
      out.sets.push(set);
    }
    await cam.locator('[data-set="3/3"]').waitFor();
    await page.evaluate(() => (window.__noPerson = false));
    await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 10_000 });
    await holdRepsThenFreeze(page, cam, 2);
    const from = await holdSaidLen(page);
    await page.evaluate(() => (window.__noPerson = true));
    await holdWaitSaid(page, 'Set on hold. Tap to continue.', from, 10_000);
    await cam.locator('[data-hold]').waitFor();
    await page.waitForTimeout(4_000);
    await shot(page, log, 'm5c-hold-last-set', {
      hold: await holdSizes(page),
      sizes: await textSizes(page, '[data-hold]'),
      camSizes: await textSizes(page, '[role=dialog][aria-label="Camera"]'),
    });
    await cam.locator('[data-hold]').getByRole('button', { name: 'Save set' }).click();
    await page.getByRole('dialog', { name: 'Camera' }).waitFor({ state: 'detached', timeout: 10_000 });
    out.said = await page.evaluate(() => window.__said.map((s) => s.text));
    out.offsite = offsite;
    out.console = log;
    results.push({ m5cHoldB: out });
    await ctx.close();
  }
}

// ---------------------------------------------------------------- M4e (visual redesign)

const M4E_ACCENTS = ['orange', 'volt', 'yellow'];

/** Picks the accent in Settings, waits for the localStorage copy, then returns to Today. */
async function m4eSetAccent(page, accent) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('main.settings').waitFor();
  await page.locator(`[data-accent-option="${accent}"]`).click();
  await pollUntil(async () => (await page.evaluate(() => localStorage.getItem('gc-accent'))) === accent, 5_000);
  await page.waitForTimeout(400); // IndexedDB write
}

async function m4eTheme(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accentAttr: document.documentElement.getAttribute('data-accent'),
      cta: cs.getPropertyValue('--cta').trim(),
      success: cs.getPropertyValue('--success').trim(),
      mood: document.querySelector('.mood-energy') ? 'energy' : document.querySelector('.mood-track') ? 'track' : document.querySelector('.mood-pro') ? 'pro' : null,
      moods: [...document.querySelectorAll('.mood-energy,.mood-pro,.mood-track')].map((e) => e.className.match(/mood-\w+/)[0]),
    };
  });
}

async function m4eShot(page, log, screen, accent, root = 'body') {
  await page.waitForTimeout(500);
  await shot(page, log, `m4e-${screen}-${accent}`, {
    theme: await m4eTheme(page),
    sizes: await textSizes(page, root),
  });
  log.length = 0; // console per screen
}

async function m4eCloseDialog(page, name) {
  const d = page.getByRole('dialog', { name });
  await d.getByRole('button', { name: /^(Close|Cancel)$/ }).first().click();
  await d.waitFor({ state: 'detached' });
}

async function m4e(browser, only) {
  const accents = only ? [only] : M4E_ACCENTS;
  for (const accent of accents) {
    // A. Today (empty), Settings, preview, Exercise and its overlays, Pause.
    {
      const { ctx, page, log } = await newPhone(browser);
      const offsite = watchOffsite(page);
      await installSpeechSpy(page);
      await page.goto(BASE);
      await page.locator('.day-btn').first().waitFor();
      await m4eSetAccent(page, accent);
      await page.evaluate(() => window.scrollTo(0, 0));
      await m4eShot(page, log, 'settings', accent, 'main');
      await page.locator('[data-tab="today"]').click();
      await page.locator('.day-btn').first().waitFor();
      await m4eShot(page, log, 'today-empty', accent, 'main');
      await page.getByRole('button', { name: /Push A/ }).click();
      await page.getByRole('button', { name: 'Start workout' }).waitFor();
      await m4eShot(page, log, 'preview', accent, 'main');
      await page.getByRole('button', { name: 'Start workout' }).click();
      await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
      await m4eShot(page, log, 'exercise', accent, 'main');
      // Body sheet
      await page.getByRole('button', { name: 'Show target muscles in 3D' }).first().click();
      await page.getByRole('dialog', { name: 'Target muscles' }).waitFor();
      await page.waitForTimeout(1500);
      await m4eShot(page, log, 'body-sheet', accent, '[role=dialog][aria-label="Target muscles"]');
      await m4eCloseDialog(page, 'Target muscles');
      // How-to
      await page.locator('[data-howto-open]').click();
      const how = page.locator('[data-howto=sheet]');
      await how.waitFor();
      await pollUntil(async () => (await how.locator('[data-howto=stage]').getAttribute('data-mode')) === '3d', 15_000);
      await page.waitForTimeout(1200);
      await m4eShot(page, log, 'howto', accent, '[data-howto=sheet]');
      await how.locator('[data-howto=close]').click();
      await how.waitFor({ state: 'detached' });
      // Notes
      await page.getByRole('button', { name: 'Notes and machine setting' }).click();
      await page.getByRole('dialog', { name: 'Notes' }).waitFor();
      await m4eShot(page, log, 'notes', accent, '[role=dialog][aria-label="Notes"]');
      await m4eCloseDialog(page, 'Notes');
      // Exercise list
      await page.getByRole('button', { name: 'Exercise list' }).click();
      await page.getByRole('dialog', { name: 'Exercise list' }).waitFor();
      await m4eShot(page, log, 'exercise-list', accent, '[role=dialog][aria-label="Exercise list"]');
      await m4eCloseDialog(page, 'Exercise list');
      // Pause
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await page.getByRole('dialog', { name: 'Paused' }).waitFor();
      await m4eShot(page, log, 'pause', accent, '[role=dialog][aria-label="Paused"]');
      results.push({ m4eA: accent, offsite });
      await ctx.close();
    }
    // B. Fake clock: Rest, Rest +30 s, over rest; two sessions → Summary with "vs last"; Today tiles.
    {
      const { ctx, page, log } = await newPhone(browser);
      const offsite = watchOffsite(page);
      await installSpeechSpy(page);
      await page.clock.install({ time: new Date('2026-11-13T18:00:00Z') });
      await page.goto(BASE);
      await page.clock.pauseAt(new Date('2026-11-13T18:00:05Z'));
      await page.locator('.day-btn').first().waitFor();
      await m4eSetAccent(page, accent);
      await page.locator('[data-tab="today"]').click();
      const oneSession = async (sets) => {
        await page.getByRole('button', { name: /Push A/ }).click();
        await page.getByRole('button', { name: 'Start workout' }).click();
        await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
        for (let i = 0; i < sets; i++) {
          await page.clock.runFor(30_000);
          await page.getByRole('button', { name: 'Set done' }).click();
          await page.locator('[data-rest-clock]').waitFor();
          if (i < sets - 1) {
            await page.clock.runFor(10_000);
            await page.getByRole('button', { name: 'Start set' }).click();
          }
        }
      };
      await oneSession(1);
      await page.clock.runFor(10_000);
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      const sheet = page.getByRole('dialog', { name: 'Paused' });
      await sheet.getByRole('button', { name: 'End workout' }).click();
      await sheet.getByRole('button', { name: 'Tap again to end' }).click();
      await page.getByRole('heading', { name: 'Workout done' }).waitFor();
      await page.getByRole('button', { name: 'Done' }).click();
      await page.clock.runFor(3600_000);
      // Session 2: two sets, shots of Rest along the way.
      await oneSession(2);
      await page.clock.runFor(5_000);
      await m4eShot(page, log, 'rest', accent, 'main');
      await page.getByRole('button', { name: '+30 s, add 30 seconds of rest', exact: true }).click();
      await m4eShot(page, log, 'rest-plus30', accent, 'main');
      await page.clock.runFor(160_000);
      await page.locator('[data-rest-timer][data-state="over"]').waitFor();
      await m4eShot(page, log, 'rest-over', accent, 'main');
      await page.getByRole('button', { name: 'Pause', exact: true }).click();
      await sheet.getByRole('button', { name: 'End workout' }).click();
      await sheet.getByRole('button', { name: 'Tap again to end' }).click();
      await page.getByRole('heading', { name: 'Workout done' }).waitFor();
      await m4eShot(page, log, 'summary', accent, 'main');
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await m4eShot(page, log, 'summary-bottom', accent, 'main');
      await page.getByRole('button', { name: 'Done' }).click();
      await page.locator('.day-btn').first().waitFor();
      await m4eShot(page, log, 'today', accent, 'main');
      results.push({ m4eB: accent, offsite });
      await ctx.close();
    }
    // C. Camera (hands-free curl fixture): set mode, pending Undo, rest mode.
    {
      const { ctx, page, log } = await newPhone(browser);
      const offsite = watchOffsite(page);
      await installHandsFreeMocks(page, HF_CURL);
      await page.goto(BASE);
      await page.locator('.day-btn').first().waitFor();
      await m4eSetAccent(page, accent);
      await page.locator('[data-tab="today"]').click();
      await page.getByRole('button', { name: /Pull A/ }).click();
      await page.getByRole('button', { name: 'Start workout' }).click();
      await openFromList(page, 'Dumbbell Bicep Curl');
      await page.getByRole('button', { name: 'Camera', exact: true }).click();
      const cam = page.getByRole('dialog', { name: 'Camera' });
      await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1000);
      await page.evaluate(() => window.__freezeWhenReps(2));
      await page.evaluate(() => window.__play());
      await cam.locator('.rep-num[data-reps="1"]').waitFor({ timeout: 20_000 });
      await m4eShot(page, log, 'camera-set', accent, '[role=dialog][aria-label="Camera"]');
      await cam.locator('[data-auto-stop="pending"]').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(200);
      await shot(page, log, `m4e-camera-undo-${accent}`, { theme: await m4eTheme(page), hf: await handsFreeSizes(page) });
      log.length = 0;
      await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor({ timeout: 10_000 });
      await m4eShot(page, log, 'camera-rest', accent, '[role=dialog][aria-label="Camera"]');
      results.push({ m4eC: accent, offsite });
      await ctx.close();
    }
    // D. Camera hold (push-ups, body-line gate).
    {
      const { ctx, page, log } = await newPhone(browser);
      const offsite = watchOffsite(page);
      await installHoldMocks(page);
      await page.goto(BASE);
      await page.locator('.day-btn').first().waitFor();
      await m4eSetAccent(page, accent);
      const cam = await holdOpenPushups(page);
      await holdRepsThenFreeze(page, cam, 2);
      const from = await holdSaidLen(page);
      await page.evaluate(() => (window.__sit = true));
      await holdWaitSaid(page, 'Set on hold. Tap to continue.', from, 10_000);
      await cam.locator('[data-hold]').waitFor();
      await page.waitForTimeout(1500);
      await shot(page, log, `m4e-camera-hold-${accent}`, { theme: await m4eTheme(page), hold: await holdSizes(page) });
      results.push({ m4eD: accent, offsite });
      await ctx.close();
    }
  }
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
  else if (milestone === 'm5c') await m5c(browser);
  else if (milestone === 'm5c-hold') await m5cHold(browser);
  else if (milestone === 'm5') await m5(browser);
  else if (milestone === 'm4e') await m4e(browser, process.argv[3]);
  else throw new Error(`unknown milestone ${milestone}`);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
}
