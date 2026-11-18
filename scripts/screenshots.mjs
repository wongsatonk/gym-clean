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
//   node scripts/screenshots.mjs m4f        # M4f wave 1 learning rules: badges, camera chip +
//                                            #   setup line, Rest/Summary/hands-free Fix note, export
//   node scripts/screenshots.mjs m4f-setup  # M4f set-up card at 390x844 + 375x667 (triceps,
//                                            #   hammer, tuned curl): card/Got it/count geometry
//   node scripts/screenshots.mjs m7         # M7 Fuel click-through (clock mocked, OFF routed):
//                                            #   docs/screenshots/m7-verify-*.png
//   node scripts/screenshots.mjs cam-verify  # Undo toast over Fuel sheets: Thai, barcode, photo
//                                            #   main buttons clear of the toast (2026-11-16)
//   node scripts/screenshots.mjs m5c-hold    # M5c breaks inside a set: body-line hold, Continue →
//                                            #   one set; last-set hold (Save set); dev-log export
//                                            #   to test-results/verify-m5c-hold/
//   node scripts/screenshots.mjs m12         # M12 slices 1 + 1c in the wired app (clock mocked):
//                                            #   Today to-do + missed cards, Coach, focus block,
//                                            #   Pause chat, Calendar, Share month, tour, to-dos,
//                                            #   report, About; reduced-motion animation counts
//   node scripts/screenshots.mjs m12b        # M12 slice 1b trainer kit (clock mocked, made-up
//                                            #   data): warm-up, effort, learn cards, short on
//                                            #   time, feel today, intake, Goal card, e1RM,
//                                            #   measurements, photo compare, cardio, 1.13.0 tour
//   node scripts/screenshots.mjs --store     # M13 store set: restores the made-up demo backup (owner
//                                            #   mode off) at 390x844 @3x, 6 screens plain + captioned
//                                            #   on the brand background: docs/screenshots/store/*.png
//   node scripts/screenshots.mjs m13         # M13 verify: fresh install welcome → intake → camera
//                                            #   page → Today; Settings, Self-check, tour, About owner
//                                            #   off; 7-tap unlock → owner on: m13-verify-*.png
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

// ------------------------------- M4f wave 1: learning rules (Hammer Curls etc.)

const M4F_HAMMER = '/fixtures/landmarks/hammer-curl/synthetic-01__reps-4__partials-0.json';
const M4F_TRICEPS = '/fixtures/landmarks/triceps-extension/synthetic-01__reps-4__partials-0.json';
const M4F_DEVLOG = 'test-results/verify-m4f/m4f-devlog-export.json';

async function m4fBadges(scope, sel) {
  return scope.locator(sel).evaluateAll((rows) =>
    rows.map((r) => ({
      name: (r.querySelector('.ex-name, h3, strong')?.textContent ?? r.textContent ?? '').trim().slice(0, 40),
      badges: [...r.querySelectorAll('[data-badge]')].map((b) => b.textContent.trim()),
    })),
  );
}

async function m4fLearningSizes(page) {
  return page.evaluate(() => {
    const px = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { text: el.textContent.trim(), font: parseFloat(cs.fontSize), h: Math.round(r.height),
        w: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right),
        top: Math.round(r.top), color: cs.color, bg: cs.backgroundColor,
        aria: el.getAttribute('aria-label'), role: el.getAttribute('role') };
    };
    return {
      chip: px('[role=dialog] [data-learning]'),
      title: px('[role=dialog] .cam-top h2, [role=dialog] .cam-top .cam-title'),
      close: px('[role=dialog] .cam-close'),
      setupLearning: px('[role=dialog] .setup-learning'),
      setupLines: [...document.querySelectorAll('[role=dialog] .cam-setup .setup-line')].map((e) => e.textContent.trim()),
      lscLearning: px('[data-lsc=learning]'),
      badgeLearning: px('[data-badge="learning"]'),
      badgeCamera: px('[data-badge="camera"]'),
    };
  });
}

async function m4f(browser) {
  // A. Hands-free off. Pull A: preview, list sheet, Hammer header, curl camera (tuned) + Rest,
  //    Hammer camera (learning, fixture 4 reps) + Rest, Summary, dev-log export.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    const out = {};
    await installM5Mocks(page, M4F_HAMMER);
    await page.goto(BASE);
    await m5SeedHandsFreeOff(page);
    await page.getByRole('button', { name: /Pull A/ }).click();
    await page.locator('.ex-row').first().waitFor();
    out.previewBadges = await m4fBadges(page, '.ex-row');
    await shot(page, log, 'm4f-badges-pull-a', { badges: out.previewBadges, sizes: await m4fLearningSizes(page) });
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('heading', { name: 'One-Arm Dumbbell Row' }).waitFor();
    await page.getByRole('button', { name: 'Exercise list' }).click();
    const list = page.getByRole('dialog', { name: 'Exercise list' });
    await list.locator('.ex-row-btn').first().waitFor();
    out.listBadges = await m4fBadges(list, '.ex-row-btn');
    await page.waitForTimeout(400);
    await shot(page, log, 'm4f-list-pull-a', { badges: out.listBadges });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    if (await list.isVisible()) await list.getByRole('button', { name: /Close/ }).first().click().catch(() => {});

    // Tuned curl first (so the last set is the learning one for Summary).
    await openFromList(page, 'Dumbbell Bicep Curl');
    out.curlHeaderBadges = await page.locator('main [data-badge]').evaluateAll((b) => b.map((e) => e.textContent.trim()));
    await page.evaluate(() => (window.__noPerson = true));
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    let cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.locator('.cam-setup').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    out.curlCam = await m4fLearningSizes(page);
    await shot(page, log, 'm4f-camera-tuned-curl', { sizes: out.curlCam });
    await cam.getByRole('button', { name: 'Set done' }).click();
    await cam.waitFor({ state: 'detached' });
    await page.locator('[data-rest-clock]').waitFor();
    await page.locator('[data-lsc=panel]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    out.curlRest = await m4fLearningSizes(page);
    await shot(page, log, 'm4f-rest-tuned-curl', { sizes: out.curlRest });

    // Hammer Curls (learning): leave Rest via Start set, then pick it from the list.
    await page.getByRole('button', { name: 'Start set' }).click();
    await page.getByRole('heading', { name: 'Dumbbell Bicep Curl' }).waitFor();
    await openFromList(page, 'Hammer Curls');
    out.hammerHeaderBadges = await page.locator('main [data-badge]').evaluateAll((b) => b.map((e) => e.textContent.trim()));
    await page.waitForTimeout(400);
    await shot(page, log, 'm4f-exercise-hammer', { badges: out.hammerHeaderBadges, sizes: await textSizes(page, 'main') });
    await page.evaluate(() => { window.__noPerson = true; window.__freezeAt = 0; });
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.locator('.cam-setup').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    out.hammerCam = await m4fLearningSizes(page);
    await shot(page, log, 'm4f-camera-learning-hammer', { sizes: out.hammerCam,
      text: await textSizes(page, '[role=dialog][aria-label="Camera"]') });
    // Person in → play the 4-rep fixture.
    await page.evaluate(() => (window.__noPerson = false));
    await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1000);
    const t0 = Date.now();
    await page.evaluate(() => window.__holdWhenReps(4, 0));
    await page.evaluate(() => window.__play());
    await cam.locator('.rep-num[data-reps="4"]').waitFor({ timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(2500);
    out.hammerCount = await cameraGeometry(page);
    out.hammerCount.ms = Date.now() - t0;
    out.hammerCount.gauge = await cam.locator('[data-gauge], .rep-gauge, .gauge').count();
    out.hammerCount.chipStill = await cam.locator('[data-learning]').count();
    await shot(page, log, 'm4f-camera-hammer-counted', { count: out.hammerCount });
    await cam.getByRole('button', { name: 'Set done' }).click();
    await cam.waitFor({ state: 'detached' });
    await page.locator('[data-rest-clock]').waitFor();
    await page.locator('[data-lsc=panel]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    out.hammerRest = await m4fLearningSizes(page);
    out.hammerRestPanel = await page.locator('[data-lsc=panel]').innerText();
    await shot(page, log, 'm4f-rest-learning-fix', { sizes: out.hammerRest, panel: out.hammerRestPanel,
      text: await textSizes(page, 'main') });
    out.rowsAfterHammer = await m5SetRows(page);

    await page.getByRole('button', { name: 'Pause' }).click();
    const paused = page.getByRole('dialog', { name: 'Paused' });
    await paused.getByRole('button', { name: 'End workout' }).click();
    await paused.getByRole('button', { name: 'Tap again to end' }).click();
    await page.getByRole('heading', { name: 'Workout done' }).waitFor();
    const lsc = page.locator('[data-lsc=learning]');
    out.summaryHasLearning = await lsc.count();
    if (out.summaryHasLearning) await lsc.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(400);
    await shot(page, log, 'm4f-summary-learning-fix', { sizes: await m4fLearningSizes(page) });

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
    mkdirSync('test-results/verify-m4f', { recursive: true });
    writeFileSync(M4F_DEVLOG, text);
    const sets = JSON.parse(text).sessions[0].sets ?? [];
    out.exportSets = sets.map((s) => ({ exerciseId: s.exerciseId, camera: s.camera ? { ruleStatus: s.camera.ruleStatus, frames: (s.camera.frames ?? []).length } : null, logged: s.logged, counted: s.counted }));
    out.said = await m5Said(page);
    out.offsite = offsite;
    out.console = log;
    results.push({ m4fA: out });
    await ctx.close();
  }
  // B. Push A triceps extension (learning): setup card with placement + learning line.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installM5Mocks(page, M4F_TRICEPS);
    await page.goto(BASE);
    await m5SeedHandsFreeOff(page);
    await page.getByRole('button', { name: /Push A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await openFromList(page, 'Standing Dumbbell Triceps Extension');
    await page.evaluate(() => (window.__noPerson = true));
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.locator('.cam-setup').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const setupBox = await cam.locator('.cam-setup').evaluate((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const got = [...el.querySelectorAll('button')].map((b) => {
        const br = b.getBoundingClientRect();
        return { text: b.textContent.trim(), top: Math.round(br.top), bottom: Math.round(br.bottom) };
      });
      const line = el.querySelector('.setup-learning')?.getBoundingClientRect();
      return { overflowY: cs.overflowY, maxHeight: cs.maxHeight, clientH: el.clientHeight, scrollH: el.scrollHeight,
        top: Math.round(r.top), bottom: Math.round(r.bottom), buttons: got,
        learningLine: line ? { top: Math.round(line.top), bottom: Math.round(line.bottom) } : null };
    });
    await shot(page, log, 'm4f-camera-setup-triceps', { setupBox, sizes: await m4fLearningSizes(page),
      text: await textSizes(page, '[role=dialog][aria-label="Camera"]') });
    results.push({ m4fB: { offsite, said: await m5Said(page), console: log } });
    await ctx.close();
  }
  // C. Hands-free on (default): Hammer Curls → auto stop → camera rest mode with the learning line.
  {
    const { ctx, page, log } = await newPhone(browser);
    const offsite = watchOffsite(page);
    await installHandsFreeMocks(page, M4F_HAMMER);
    await page.goto(BASE);
    await page.getByRole('button', { name: /Pull A/ }).click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('heading', { name: 'One-Arm Dumbbell Row' }).waitFor();
    await page.getByRole('button', { name: 'Exercise list' }).click();
    await page.getByRole('dialog', { name: 'Exercise list' }).locator('.ex-row-btn', { hasText: 'Hammer Curls' }).click();
    const ss = page.getByRole('button', { name: 'Start set' });
    if (await ss.isVisible().catch(() => false)) await ss.click();
    await page.getByRole('heading', { name: 'Hammer Curls' }).waitFor().catch(async () => {
      await page.screenshot({ path: 'test-results/verify-m4f/c-fail.png' });
      throw new Error('C: no Hammer heading; body=' + (await page.locator('main').innerText()).slice(0, 300));
    });
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await cam.and(page.locator('[data-person="true"]')).waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.__freezeWhenReps(4));
    await page.evaluate(() => window.__play());
    let mode;
    try {
      await cam.and(page.locator('[data-cam-mode="rest"]')).waitFor({ timeout: 40_000 });
      mode = 'rest';
    } catch { mode = await cam.getAttribute('data-cam-mode'); }
    await page.waitForTimeout(1500);
    const lscIn = cam.locator('[data-lsc=learning]');
    if (await lscIn.count()) await lscIn.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, log, 'm4f-handsfree-rest-learning', { mode, sizes: await m4fLearningSizes(page),
      hf: await handsFreeSizes(page), learningInCam: await lscIn.count(),
      repsData: await page.evaluate(() => [...document.querySelectorAll('[data-lsc=panel]')].map((e) => e.getAttribute('data-reps'))) });
    results.push({ m4fC: { offsite, said: await page.evaluate(() => window.__said.map((s) => s.text)), console: log } });
    await ctx.close();
  }
}

// M4f re-verify: the camera set-up card at 390×844 and 375×667 for two learning rules and the
// tuned curl. Whole card in view, "Got it" ≥ 56px and in view, rep number never covered.
async function m4fSetup(browser) {
  const cases = [
    ['Push A', 'Standing Dumbbell Triceps Extension', 'triceps', M4F_TRICEPS],
    ['Pull A', 'Hammer Curls', 'hammer', M4F_HAMMER],
    ['Pull A', 'Dumbbell Bicep Curl', 'tuned-curl', M4F_HAMMER],
  ];
  for (const [w, h] of [[390, 844], [375, 667]]) {
    for (const [day, name, slug, fixture] of cases) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2,
        isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, permissions: ['camera'] });
      const page = await ctx.newPage();
      const log = [];
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`); });
      page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
      const offsite = watchOffsite(page);
      await installM5Mocks(page, fixture);
      await page.goto(BASE);
      await m5SeedHandsFreeOff(page);
      await page.getByRole('button', { name: new RegExp(day) }).click();
      await page.getByRole('button', { name: 'Start workout' }).click();
      await openFromList(page, name);
      await page.evaluate(() => (window.__noPerson = true));
      await page.getByRole('button', { name: 'Camera', exact: true }).click();
      const cam = page.getByRole('dialog', { name: 'Camera' });
      await cam.locator('.cam-setup').waitFor({ timeout: 15_000 });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
          return { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height), w: Math.round(b.width) }; };
        const card = document.querySelector('.cam-setup');
        const got = [...(card?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'Got it');
        const num = document.querySelector('[role=dialog] .rep-num') ?? document.querySelector('[role=dialog] .rep-count');
        const cs = card ? getComputedStyle(card) : null;
        return { vh: innerHeight, scrollWidth: document.documentElement.scrollWidth,
          card: r(card), cardScrollH: card?.scrollHeight, cardClientH: card?.clientHeight, overflowY: cs?.overflowY,
          got: r(got), repCount: r(document.querySelector('[role=dialog] .rep-count')), repNum: r(num),
          repNumFont: num ? parseFloat(getComputedStyle(num).fontSize) : null,
          stage: r(document.querySelector('.cam-stage')),
          learningLine: r(document.querySelector('.cam-setup .setup-learning')),
          learningText: document.querySelector('.cam-setup .setup-learning')?.textContent?.trim() ?? null,
          chip: document.querySelector('[role=dialog] [data-learning]')?.getAttribute('aria-label') ?? null,
          placement: [...document.querySelectorAll('.cam-setup .setup-line')].map((e) => e.textContent.trim()) };
      });
      const fileName = w === 390 && slug === 'triceps' ? 'm4f-camera-setup-triceps'
        : w === 390 && slug === 'hammer' ? 'm4f-camera-learning-hammer'
        : `m4f-camera-setup-${slug}-${w}x${h}`;
      const ok = m.card && m.got && m.repCount && m.card.top >= 0 && m.card.bottom <= m.vh
        && m.got.h >= 56 && m.got.top >= m.card.top && m.got.bottom <= m.card.bottom && m.got.bottom <= m.vh
        && m.card.top >= m.repCount.bottom && m.scrollWidth === w
        && (!m.learningLine || m.learningLine.bottom <= m.card.bottom);
      await shot(page, log, fileName, { setupCheck: true });
      // Click Got it, card should hide.
      await cam.locator('.cam-setup').getByRole('button', { name: 'Got it' }).click();
      const hidden = await cam.locator('.cam-setup').isHidden();
      // Re-shoot before the click is not possible; take the shot of the card first via reopen is costly,
      // so take a shot before clicking:
      results.push({ viewport: `${w}x${h}`, name, ok, hiddenAfterGotIt: hidden, m, offsite, console: log });
      await ctx.close();
      void fileName;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// M7 Fuel (task 25): click-through at 390x844 with a mocked clock. Open Food Facts is routed to a
// made-up product / a 404; no real request leaves the machine.
const M7_OFF = 'https://world.openfoodfacts.org';
const m7At = (day, hour, min = 0) => new Date(2026, 10, day, hour, min).getTime();

async function m7Phone(browser, time, { noDetector = false } = {}) {
  const p = await newPhone(browser);
  await p.page.addInitScript((nd) => {
    window.__spoken = [];
    const fake = { speak: (u) => window.__spoken.push(u.text), cancel() {}, pause() {}, resume() {},
      getVoices: () => [], addEventListener() {}, speaking: false, pending: false, paused: false };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fake });
    if (nd) Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
  }, noDetector);
  p.offsite = watchOffsite(p.page);
  p.off = [];
  await p.ctx.route(`${M7_OFF}/**`, async (route) => {
    const url = route.request().url();
    p.off.push(url);
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (!url.includes('4006381333931')) return route.fulfill({ status: 404, headers: cors, body: '{"status":0}' });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ code: '4006381333931', status: 1,
      product: { product_name: 'Made-up oat drink', brands: 'Test brand',
        nutriments: { 'energy-kcal_100g': 46, proteins_100g: 1.1, carbohydrates_100g: 6.6, fat_100g: 1.5 } } }) });
  });
  await p.page.clock.install({ time });
  await p.page.goto(BASE);
  await p.page.locator('[data-screen="today"]').waitFor();
  return p;
}

/** Gym-rule measures on the visible screen: big numbers, smallest body text, smallest button. */
async function m7Sizes(page) {
  return page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const lefts = [...document.querySelectorAll('[data-left]')].filter(vis)
      .map((e) => parseFloat(getComputedStyle(e).fontSize));
    const btns = [...document.querySelectorAll('button, [role=switch], a[href]')].filter(vis)
      .filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })
      .map((e) => [e.textContent.trim().slice(0, 30) || e.getAttribute('aria-label'), Math.round(e.getBoundingClientRect().height)]);
    const small = btns.filter(([, h]) => h < 56);
    const texts = [...document.querySelectorAll('p, li, label, span, h1, h2, h3, button, input')].filter(vis)
      .filter((e) => e.textContent.trim() || e.tagName === 'INPUT')
      .filter((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })
      .map((e) => [e.textContent.trim().slice(0, 30), parseFloat(getComputedStyle(e).fontSize)]);
    const minText = texts.reduce((m, t) => (t[1] < m[1] ? t : m), ['', 999]);
    const under20 = texts.filter(([, s]) => s < 20).slice(0, 8);
    return { bigNumberPx: lefts, buttonsUnder56: small, minText, under20 };
  });
}

async function m7Shot(p, name, extra = {}) {
  await p.page.waitForTimeout(250);
  await shot(p.page, p.log, `m7-verify-${name}`, { sizes: await m7Sizes(p.page), ...extra });
}

async function m7SetUp(page, weight = '70.0') {
  await page.locator('main[data-screen="fuel"] [data-setup]').click();
  const setup = page.locator('main[data-screen="fuel-setup"]');
  await setup.waitFor();
  await setup.locator('[data-field="sex"] [data-choice="male"]').click();
  await setup.locator('[data-field="activity"] [data-choice="moderate"]').click();
  const w = setup.locator('[data-field="weight"] .nf-value');
  await w.fill(weight);
  await w.dispatchEvent('change');
  return setup;
}

async function m7GoFuel(page) {
  const fuel = page.locator('main[data-screen="fuel"]');
  if (await fuel.isVisible()) await page.locator('[data-tab="today"]').click();
  await page.locator('[data-tab="fuel"]').click();
  await fuel.waitFor();
}

async function m7(browser) {
  // A: setup → favorite, recipe, Thai Large, quick estimate → rings → Full → coach → barcode.
  const p = await m7Phone(browser, m7At(11, 12), { noDetector: true });
  const { page } = p;
  const sheet = page.locator('[data-log-sheet]');
  const steps = {};
  await m7GoFuel(page);
  await m7Shot(p, 'fuel-empty');
  const setup = await m7SetUp(page);
  await m7Shot(p, 'setup');
  await setup.locator('[data-setup-save]').click();
  await page.locator('main[data-screen="fuel"] [data-ring="kcal"]').waitFor();
  await m7Shot(p, 'fuel-start');

  await page.locator('[data-log-open]').click();
  await sheet.waitFor();
  await m7Shot(p, 'log-favorites');
  const shake = sheet.locator('[data-log-item]', { hasText: 'Protein shake' });
  await shake.click();
  await sheet.locator('[data-edit-item]').click();
  const ed = page.locator('[data-my-food-editor]');
  await ed.waitFor();
  await ed.locator('#food-kcal').fill('130');
  await ed.locator('#food-protein').fill('25');
  await m7Shot(p, 'shake-label');
  await ed.locator('[data-food-save]').click();
  await shake.click();
  steps.shakePreview = await sheet.locator('[data-preview]').textContent();
  await sheet.locator('[data-log-confirm]').click();
  await sheet.waitFor({ state: 'detached' });

  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="recipes"]').click();
  await sheet.locator('[data-new-recipe]').click();
  const rx = page.locator('[data-recipe-editor]');
  await rx.locator('#recipe-name').fill('Chicken rice bowl');
  for (const q of ['chicken breast', 'rice']) {
    await rx.locator('#recipe-search').fill(q);
    const first = rx.locator('[data-search-results] [data-log-item]').first();
    await first.waitFor({ timeout: 15_000 });
    await first.click();
  }
  await rx.locator('[data-stepper="servings"] [data-step="up"]').click();
  await m7Shot(p, 'recipe-editor');
  await rx.locator('[data-recipe-save]').click();
  await sheet.locator('[data-log-item^="recipe:"]', { hasText: 'Chicken rice bowl' }).click();
  steps.recipePreview = await sheet.locator('[data-preview]').textContent();
  await sheet.locator('[data-log-confirm]').click();
  await sheet.waitFor({ state: 'detached' });

  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="thai"]').click();
  await m7Shot(p, 'log-thai');
  await sheet.locator('[data-log-item="thai:thai:pad-kra-pao-moo-rice-egg"]').click();
  await sheet.locator('[data-portion="Large"]').click();
  steps.thaiLarge = await sheet.locator('[data-preview]').textContent();
  await m7Shot(p, 'thai-large');
  await sheet.locator('[data-log-confirm]').click();
  await sheet.waitFor({ state: 'detached' });

  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="quick"]').click();
  await sheet.locator('#quick-name').fill('Noodle shop near work');
  await sheet.locator('#quick-kcal').fill('650');
  await sheet.locator('#quick-protein').fill('30');
  await m7Shot(p, 'quick-estimate');
  await sheet.locator('[data-quick-log]').click();
  await sheet.waitFor({ state: 'detached' });
  await page.waitForTimeout(5500); // let the Logged toast go
  await m7Shot(p, 'fuel-quick-rings');
  await page.locator('main[data-screen="fuel"] [data-entry]').first().scrollIntoViewIfNeeded();
  await m7Shot(p, 'fuel-entries');
  steps.quickRings = await page.locator('main[data-screen="fuel"] [data-ring]').allTextContents();
  steps.entryCountQuick = await page.locator('main[data-screen="fuel"] [data-entry]').count();

  await page.locator('[data-tab="settings"]').click();
  const nut = page.locator('[data-nutrition]');
  await nut.scrollIntoViewIfNeeded();
  await nut.locator('[data-mode="full"]').click();
  await page.waitForTimeout(200);
  await nut.scrollIntoViewIfNeeded();
  await m7Shot(p, 'settings-nutrition-full');
  await m7GoFuel(page);
  await m7Shot(p, 'fuel-full-rings');
  steps.fullRings = await page.locator('main[data-screen="fuel"] [data-ring]').allTextContents();
  steps.entryCountFull = await page.locator('main[data-screen="fuel"] [data-entry]').count();

  await page.locator('[data-tab="today"]').click();
  await page.locator('[data-coach-open]').click();
  const coach = page.getByRole('dialog', { name: 'Coach' });
  await coach.locator('[data-coach-chip="food"]').click();
  await coach.locator('[data-food-card]').waitFor();
  await m7Shot(p, 'coach-food');
  steps.coachRow0 = (await coach.locator('[data-food-row="0"]').textContent())?.trim();
  await coach.locator('[data-food-log="0"]').click();
  await coach.locator('[data-food-logged="0"]').waitFor();
  await m7Shot(p, 'coach-food-logged');
  await coach.getByRole('button', { name: 'Close' }).click();
  await m7GoFuel(page);
  steps.entryCountAfterCoach = await page.locator('main[data-screen="fuel"] [data-entry]').count();

  // Barcode: off by default → explainer → on → typed digits (found, then not found → Add).
  await page.locator('[data-tab="settings"]').click();
  const sw = page.locator('[data-setting="barcode-lookup"]');
  await sw.scrollIntoViewIfNeeded();
  steps.barcodeDefault = await sw.getAttribute('aria-checked');
  steps.offRequestsWhileOff = p.off.length;
  await sw.click();
  await page.locator('[data-barcode-confirm]').waitFor();
  await m7Shot(p, 'barcode-explainer');
  await page.locator('[data-barcode-on]').click();
  await page.locator('[data-tab="fuel"]').click();
  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="search"]').click();
  await sheet.locator('[data-scan-open]').click();
  const scan = page.locator('[data-scan-sheet]');
  await scan.waitFor();
  await page.waitForTimeout(2500);
  steps.scanCamera = await scan.locator('[data-scan-camera]').getAttribute('data-scan-camera');
  await m7Shot(p, 'scan-sheet');
  await scan.locator('#scan-digits').fill('4006381333931');
  await scan.locator('[data-scan-lookup]').click();
  await sheet.locator('[data-log-detail="food:off:4006381333931"]').waitFor();
  await m7Shot(p, 'scan-found');
  await sheet.locator('[data-close]').click().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sheet.waitFor({ state: 'detached' }).catch(() => {});
  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="myFoods"]').click();
  await sheet.locator('[data-scan-open]').click();
  await scan.waitFor();
  await scan.locator('#scan-digits').fill('5901234123457');
  await scan.locator('[data-scan-lookup]').click();
  await scan.locator('[data-scan-result="missing"]').waitFor();
  await m7Shot(p, 'scan-missing');
  await scan.locator('[data-scan-add="5901234123457"]').click();
  const ed2 = page.locator('[data-my-food-editor]');
  await ed2.waitFor();
  await ed2.locator('#food-name').fill('Made-up crackers');
  await ed2.locator('[data-basis="per100g"]').click();
  await ed2.locator('#food-kcal').fill('420');
  await ed2.locator('#food-protein').fill('9');
  await m7Shot(p, 'scan-add-myfood');
  await ed2.locator('[data-food-save]').click();
  await sheet.locator('[data-log-detail]').waitFor();
  await sheet.locator('[data-log-back]').click();
  await sheet.locator('[data-section-panel="myFoods"]').waitFor();
  await m7Shot(p, 'myfoods-after-add');
  steps.myFoods = await sheet.locator('[data-section-panel="myFoods"] [data-log-item]').allTextContents();
  steps.offRequests = p.off;
  steps.spoken = await page.evaluate(() => window.__spoken);
  results.push({ flow: 'A', steps, offsite: p.offsite, console: p.log });
  await p.ctx.close();

  // B: two fake weeks of weigh-ins → weekly card → Accept → new target.
  const q = await m7Phone(browser, m7At(2, 7));
  const pg = q.page;
  const stepsB = {};
  await m7GoFuel(pg);
  const s2 = await m7SetUp(pg, '70.0');
  await s2.locator('[data-setup-save]').click();
  await pg.locator('main[data-screen="fuel"] [data-ring="kcal"]').waitFor();
  const wi = pg.locator('main[data-screen="weigh-in"]');
  const weigh = async (day, kg) => {
    await pg.clock.setSystemTime(m7At(day, 7));
    if (await wi.isVisible()) await wi.getByRole('button', { name: 'Back' }).click();
    await m7GoFuel(pg);
    await pg.locator('main[data-screen="fuel"] [data-weigh-in]').click();
    await wi.waitFor();
    const f = wi.locator('[data-field="weigh-in"] .nf-value');
    await f.fill(kg);
    await f.dispatchEvent('change');
    await wi.locator('[data-weigh-save]').click();
    await wi.locator('[data-weigh-today="saved"]').waitFor();
  };
  for (const d of [3, 4, 5]) await weigh(d, '70.0');
  for (const d of [9, 10, 11, 12]) await weigh(d, '70.1');
  await wi.getByRole('button', { name: 'Back' }).click();
  await pg.clock.setSystemTime(m7At(16, 7));
  await m7GoFuel(pg);
  stepsB.before = await pg.locator('[data-ring="kcal"]').textContent();
  await pg.locator('main[data-screen="fuel"] [data-weigh-in]').click();
  await wi.waitFor();
  const card = wi.locator('[data-weekly-card]');
  await card.waitFor();
  stepsB.cardKind = await card.getAttribute('data-kind');
  stepsB.cardTitle = await card.locator('#wi-card-title').textContent();
  await m7Shot(q, 'weigh-in-top');
  await card.scrollIntoViewIfNeeded();
  await m7Shot(q, 'weekly-card');
  await card.locator('[data-weekly-accept]').click();
  await card.waitFor({ state: 'detached' });
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await m7Shot(q, 'weigh-in-history');
  await wi.getByRole('button', { name: 'Back' }).click();
  await pg.waitForTimeout(300);
  stepsB.after = await pg.locator('[data-ring="kcal"]').textContent();
  await m7Shot(q, 'fuel-after-accept');
  results.push({ flow: 'B', steps: stepsB, offsite: q.offsite, console: q.log });
  await q.ctx.close();
}

// ---- M10e + M9 backup verify (2026-11-15) ----
async function m10eSeed(page, sessions) {
  for (let i = 0; i < 50; i++) {
    const ok = await page.evaluate((sessions) => new Promise((resolve) => {
      void indexedDB.databases().then((dbs) => {
        if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
        const open = indexedDB.open('gym-clean');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const d = open.result;
          if (!d.objectStoreNames.contains('sessions')) { d.close(); return resolve(false); }
          const tx = d.transaction(['sessions'], 'readwrite');
          for (const s of sessions)
            tx.objectStore('sessions').put({ ...s, setsDone: 0, totalVolumeKg: 0, restOverruns: 0 });
          tx.oncomplete = () => { d.close(); resolve(true); };
          tx.onerror = () => resolve(false);
        };
      });
    }), sessions);
    if (ok) break;
    await page.waitForTimeout(200);
  }
  await page.reload();
}

async function m10eShot(p, name, extra = {}) {
  await p.page.waitForTimeout(300);
  await shot(p.page, p.log, `m10e-verify-${name}`, { sizes: await m7Sizes(p.page), ...extra });
}

async function m10e(browser) {
  const p = await m7Phone(browser, m7At(13, 18));
  const { page } = p;
  const steps = {};
  const days = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b'];
  await m10eSeed(page, days.map((dayId, i) => ({ sessionId: `s-${dayId}`, dayId,
    startedAt: m7At(8 + i, 18), endedAt: m7At(8 + i, 18) + 50 * 60_000 })));
  await page.locator('[data-hero="legs-b"]').waitFor();
  const prompt = page.locator('[data-gym-prompt="Leg_Press"]');
  await prompt.waitFor();
  steps.promptText = (await prompt.textContent())?.trim();
  await m10eShot(p, 'prompt-today');
  const preview = page.locator('[data-screen="preview"]');
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await preview.locator('li.ex-row').first().waitFor();
  steps.previewHasLegPressBeforeTap = await preview.locator('[data-ex="Leg_Press"]').count();
  await m10eShot(p, 'prompt-preview');
  await preview.getByRole('button', { name: '‹ Back' }).click();
  await prompt.locator('[data-gym-swap]').click();
  const coach = page.getByRole('dialog', { name: 'Coach' });
  const card = coach.locator('[data-proposal]');
  await card.waitFor();
  steps.proposal = (await card.textContent())?.replace(/\s+/g, ' ').trim();
  steps.coachChips = await coach.locator('button').allTextContents();
  await m10eShot(p, 'proposal');
  await card.getByRole('button', { name: 'Apply' }).click();
  await page.locator('[data-undo-toast]').waitFor();
  steps.promptAfterApply = await prompt.count();
  await m10eShot(p, 'applied-today');
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  const smith = preview.locator('[data-ex="Smith_Machine_Squat"]');
  await smith.waitFor();
  steps.smithInfoBadge = await smith.locator('[data-badge="info"]').count();
  steps.legPressAfterApply = await preview.locator('[data-ex="Leg_Press"]').count();
  await m10eShot(p, 'applied-preview');
  // Reload keeps the swap.
  await page.reload();
  await page.locator('[data-hero="legs-b"]').waitFor();
  await page.waitForTimeout(500);
  steps.promptAfterApplyReload = await prompt.count();
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await smith.waitFor();
  steps.smithAfterReload = await smith.count();
  steps.smithInfoAfterReload = await smith.locator('[data-badge="info"]').count();
  steps.legPressAfterReload = await preview.locator('[data-ex="Leg_Press"]').count();
  await m10eShot(p, 'applied-preview-reloaded');
  await preview.getByRole('button', { name: '‹ Back' }).click();
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-plan-changes-open]').click();
  const changes = page.locator('[data-screen="plan-changes"]');
  await changes.locator('li.plan-change').first().waitFor();
  await m10eShot(p, 'plan-changes');
  await changes.locator('[data-undo-change]').first().click();
  await changes.locator('li.plan-change[data-undone]').first().waitFor();
  await m10eShot(p, 'plan-changes-undone');
  await changes.getByRole('button', { name: '‹ Back' }).click();
  await page.locator('[data-tab="today"]').click();
  await prompt.waitFor();
  steps.promptBackAfterUndo = await prompt.count();
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await preview.locator('li.ex-row').first().waitFor();
  steps.legPressAfterUndo = await preview.locator('[data-ex="Leg_Press"]').count();
  await preview.getByRole('button', { name: '‹ Back' }).click();

  // Keep it: hides the prompt, survives a reload, Leg Press stays.
  await prompt.locator('[data-gym-keep]').click();
  await page.waitForTimeout(300);
  steps.promptAfterKeep = await prompt.count();
  await m10eShot(p, 'kept-today');
  await page.reload();
  await page.locator('[data-hero="legs-b"]').waitFor();
  await page.waitForTimeout(500);
  steps.promptAfterKeepReload = await prompt.count();
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await preview.locator('li.ex-row').first().waitFor();
  steps.legPressAfterKeep = await preview.locator('[data-ex="Leg_Press"]').count();
  steps.previewPromptAfterKeep = await preview.locator('[data-gym-prompt]').count();
  await preview.getByRole('button', { name: '‹ Back' }).click();

  // My gym ticks.
  await page.locator('[data-tab="settings"]').click();
  await m10eShot(p, 'settings');
  await page.locator('[data-my-gym-open]').click();
  const gym = page.locator('[data-screen="my-gym"]');
  await gym.waitFor();
  await m10eShot(p, 'my-gym');
  const legPress = gym.locator('[data-gym-item="leg-press"]');
  const smithItem = gym.locator('[data-gym-item="smith-machine"]');
  steps.myGymLegPressBefore = await legPress.getAttribute('aria-checked');
  steps.myGymSmithBefore = await smithItem.getAttribute('aria-checked');
  await legPress.click();
  await page.waitForTimeout(300);
  steps.myGymLegPressAfter = await legPress.getAttribute('aria-checked');
  await legPress.scrollIntoViewIfNeeded();
  await m10eShot(p, 'my-gym-ticked');
  await page.reload();
  await page.locator('[data-screen="today"]').waitFor();
  await page.locator('[data-hero="legs-b"]').waitFor();
  await page.waitForTimeout(500);
  steps.promptAfterLegPressTicked = await prompt.count();
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-my-gym-open]').click();
  await gym.waitFor();
  steps.myGymLegPressAfterReload = await legPress.getAttribute('aria-checked');
  await legPress.click();
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('[data-hero="legs-b"]').waitFor();
  await prompt.waitFor({ timeout: 5000 }).catch(() => {});
  steps.promptAfterUntick = await prompt.count();

  // Backup → Restore (two taps) → Undo.
  await page.locator('[data-tab="settings"]').click();
  const backup = page.locator('[data-backup]');
  await backup.scrollIntoViewIfNeeded();
  await m10eShot(p, 'backup');
  const [dl] = await Promise.all([page.waitForEvent('download'),
    page.locator('[data-backup-export]').click()]);
  mkdirSync('test-results/verify-m10e', { recursive: true });
  const file = `test-results/verify-m10e/${dl.suggestedFilename()}`;
  await dl.saveAs(file);
  steps.backupFile = dl.suggestedFilename();
  await page.locator('[data-unit="lb"]').click();
  await page.locator('[data-backup-file]').setInputFiles(file);
  await page.locator('[data-backup-confirm]').waitFor();
  steps.confirmText = (await backup.textContent())?.replace(/\s+/g, ' ').trim();
  await backup.scrollIntoViewIfNeeded();
  await m10eShot(p, 'restore-confirm');
  const replace = page.locator('[data-backup-replace]');
  await replace.click();
  steps.replaceAfterOneTap = (await replace.textContent())?.trim();
  await m10eShot(p, 'restore-tap-again');
  await replace.click();
  await page.locator('[data-backup-status="ok"]').waitFor();
  steps.unitAfterRestore = await page.locator('[data-unit="kg"]').getAttribute('aria-pressed');
  await m10eShot(p, 'restored');
  await page.locator('[data-undo-toast]').getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(500);
  steps.statusAfterUndo = (await page.locator('[data-backup-status]').textContent())?.trim();
  steps.unitLbAfterUndo = await page.locator('[data-unit="lb"]').getAttribute('aria-pressed');
  await backup.scrollIntoViewIfNeeded();
  await m10eShot(p, 'restore-undone');

  // M7 Fuel: coach "what should I eat" with whole grams.
  await page.locator('[data-tab="fuel"]').click();
  await page.locator('main[data-screen="fuel"]').waitFor();
  const setup = await m7SetUp(page);
  await setup.locator('[data-setup-save]').click();
  await page.locator('main[data-screen="fuel"] [data-ring="kcal"]').waitFor();
  await page.locator('[data-tab="today"]').click();
  await page.locator('[data-coach-open]').click();
  await coach.getByLabel('Ask the coach').fill('what should I eat');
  await coach.getByRole('button', { name: 'Send' }).click();
  await coach.locator('[data-food-card]').waitFor();
  steps.foodRows = await coach.locator('[data-food-row]').allTextContents();
  steps.foodCard = (await coach.locator('[data-food-card]').first().textContent())?.replace(/\s+/g, ' ').trim();
  steps.decimalGrams = (steps.foodCard.match(/\d+\.\d+\s*g\b/g) ?? []);
  await m10eShot(p, 'coach-food');
  results.push({ flow: 'm10e', steps, offsite: p.offsite, off: p.off, console: p.log });
  await p.ctx.close();
}

// ---- Camera e2e stability + toast placement over Fuel sheets (2026-11-16) ----
/** Where `loc` sits relative to the toast, as it is now (no scroll): the gym-rule checks. */
async function clearOfToast(page, loc) {
  return loc.evaluate((el) => {
    const t = document.querySelector('.undo-toast');
    const tr = t?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      toastUp: !!t, toastText: t?.textContent?.trim().slice(0, 40) ?? null,
      btnTop: Math.round(r.top), btnBottom: Math.round(r.bottom), btnHeight: Math.round(r.height),
      toastTop: tr ? Math.round(tr.top) : null,
      onScreen: r.top >= 0 && r.bottom <= innerHeight, aboveToast: !!tr && r.bottom <= tr.top,
      tall: r.height >= 56, hitsButton: hit !== null && el.contains(hit),
    };
  });
}

async function tapWhereItIs(page, loc) {
  const b = await loc.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

async function camVerify(browser) {
  const p = await m7Phone(browser, m7At(18, 12, 10), { noDetector: true });
  const { page } = p;
  await page.addInitScript(() => {
    window.__fakeFoodResult = [{ categoryName: 'pad_thai', score: 0.82 },
      { categoryName: 'som_tum', score: 0.09 }, { categoryName: 'tom_yum_goong', score: 0.05 }];
    window.__gymCleanFakeFoodClassifier = { classify: () => window.__fakeFoodResult };
  });
  await page.reload();
  await page.locator('[data-screen="today"]').waitFor();
  const steps = {};
  const sheet = page.locator('[data-log-sheet]');
  const cs = async (name, extra = {}) => {
    await page.waitForTimeout(200);
    await shot(page, p.log, `cam-verify-${name}`, { sizes: await m7Sizes(page), ...extra });
  };
  // Settings: food model (fake) + barcode lookup on.
  await page.locator('[data-tab="settings"]').click();
  const fp = page.locator('[data-food-photos]');
  await fp.scrollIntoViewIfNeeded();
  await fp.locator('input[data-food-model-file]').setInputFiles({ name: 'made-up-food.tflite',
    mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4]) });
  await fp.locator('[data-food-model][data-state="ready"]').waitFor();
  const sw = page.locator('[data-setting="barcode-lookup"]');
  await sw.scrollIntoViewIfNeeded();
  await sw.click();
  await page.locator('[data-barcode-on]').click();
  // Fuel targets.
  await m7GoFuel(page);
  const setup = await m7SetUp(page);
  await setup.locator('[data-setup-save]').click();
  await page.locator('main[data-screen="fuel"] [data-ring="kcal"]').waitFor();

  // 1. Thai dish → Logged toast.
  const openThai = async () => {
    await page.locator('[data-log-open]').click();
    await sheet.locator('[data-log-section="thai"]').click();
    await sheet.locator('[data-log-item="thai:thai:pad-kra-pao-moo-rice-egg"]').click();
  };
  await openThai();
  await sheet.locator('[data-log-confirm]').click();
  await sheet.waitFor({ state: 'detached' });
  await page.locator('[data-undo-toast]').waitFor();
  await cs('fuel-toast');
  // 2. Thai dish again while the toast is up.
  await openThai();
  const thaiLog = sheet.locator('[data-log-confirm]');
  await page.waitForTimeout(300);
  steps.thaiLog = await clearOfToast(page, thaiLog);
  await cs('thai-detail-toast', { clear: steps.thaiLog });
  await tapWhereItIs(page, thaiLog);
  await sheet.waitFor({ state: 'detached' });
  steps.thaiToastAfter = (await page.locator('[data-undo-toast]').textContent())?.trim();
  // 3. Barcode while the toast is up: scan sheet Look up, then the found item's Log.
  await page.locator('[data-log-open]').click();
  await sheet.locator('[data-log-section="search"]').click();
  await sheet.locator('[data-scan-open]').click();
  const scan = page.locator('[data-scan-sheet]');
  await scan.waitFor();
  await scan.locator('#scan-digits').fill('4006381333931');
  await scan.locator('#scan-digits').blur();
  const lookUp = scan.locator('[data-scan-lookup]');
  await page.waitForTimeout(300);
  steps.toastUpAtScan = await page.locator('.undo-toast').count();
  steps.scanLookUp = await clearOfToast(page, lookUp);
  steps.scanDigits = await clearOfToast(page, scan.locator('#scan-digits'));
  await cs('scan-toast', { clear: steps.scanLookUp });
  await tapWhereItIs(page, lookUp);
  await sheet.locator('[data-log-detail="food:off:4006381333931"]').waitFor();
  const bcLog = sheet.locator('[data-log-confirm]');
  await page.waitForTimeout(300);
  steps.barcodeLog = await clearOfToast(page, bcLog);
  await cs('barcode-detail-toast', { clear: steps.barcodeLog });
  await tapWhereItIs(page, bcLog);
  await sheet.waitFor({ state: 'detached' });
  steps.barcodeToastAfter = (await page.locator('[data-undo-toast]').textContent())?.trim();
  // 4. Photo while the "Logged" toast is up.
  await page.locator('[data-log-open]').click();
  await sheet.waitFor();
  const png = Buffer.from(await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
    const c = cv.getContext('2d'); c.fillStyle = '#c2410c'; c.fillRect(0, 0, 640, 480);
    return cv.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await sheet.locator('[data-photo-input]').setInputFiles({ name: 'made-up.png', mimeType: 'image/png', buffer: png });
  const ph = page.locator('[data-photo-sheet]');
  await ph.waitFor();
  await ph.locator('[data-photo-state="confident"]').waitFor();
  const phLog = ph.locator('[data-photo-log]');
  await page.waitForTimeout(300);
  steps.toastUpAtPhoto = await page.locator('.undo-toast').count();
  steps.photoLog = await clearOfToast(page, phLog);
  await cs('photo-toast', { clear: steps.photoLog });
  // Scrolled to the end: the plate-size chips come clear of the toast and of the sticky Log.
  await ph.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  steps.photoLargeChipScrolled = await clearOfToast(page, ph.locator('[data-portion="Large"]'));
  steps.photoLogScrolled = await clearOfToast(page, phLog);
  await cs('photo-toast-scrolled', { clear: steps.photoLargeChipScrolled });
  await tapWhereItIs(page, phLog);
  await ph.waitFor({ state: 'detached' });
  steps.photoToastAfter = (await page.locator('[data-undo-toast]').textContent())?.trim();
  await page.waitForTimeout(300);
  steps.entries = await page.locator('main[data-screen="fuel"] [data-entry]').count();
  steps.toastSpaceAfterSheetsClosed = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue('--toast-space'));
  steps.toastBottom = await page.locator('.undo-toast').evaluate((t) => {
    const tb = document.querySelector('[data-tabbar]')?.getBoundingClientRect();
    return { toastBottom: Math.round(t.getBoundingClientRect().bottom), tabbarTop: tb ? Math.round(tb.top) : null };
  });
  await cs('fuel-after');
  steps.spoken = await page.evaluate(() => window.__spoken);
  results.push({ flow: 'cam-verify', steps, offsite: p.offsite, off: p.off, console: p.log });
  await p.ctx.close();
}

// ---- M11 Apple Health (2026-11-16): fake GymHealth bridge with MADE-UP data, same shape as
// e2e/health.spec.ts. Fri 13 Nov 2026 08:00 local: short night + higher resting HR today.
async function m11Phone(browser, native) {
  const p = await newPhone(browser);
  await p.page.addInitScript((isNative) => {
    window.__spoken = [];
    const fake = { speak: (u) => window.__spoken.push(u.text), cancel() {}, pause() {}, resume() {},
      getVoices: () => [], addEventListener() {}, speaking: false, pending: false, paused: false };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fake });
    if (isNative === null) return;
    window.__health = { isAvailable: 0, requestRead: [], read: [] };
    const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime();
    const ymd = (t) => { const d = new Date(t); const q = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${q(d.getMonth() + 1)}-${q(d.getDate())}`; };
    const sleep = [], restingHr = [], hrv = [], activeEnergy = [];
    for (let k = 0; k <= 28; k++) {
      const day = 13 - k; const today = k === 0; const wake = at(day, 6, 30);
      sleep.push({ start: wake - 8 * 3_600_000, end: wake, asleepMin: today ? 340 : 450, source: 'Band' });
      restingHr.push({ start: at(day, 7), bpm: today ? 62 : 55, source: 'Band' });
      hrv.push({ start: at(day, 6, 45), ms: 60, source: 'Band' });
      if (!today) activeEnergy.push({ date: ymd(at(day, 0)), start: at(day, 0), kcal: 400 });
    }
    const data = { sleep, restingHr, hrv, activeEnergy,
      bodyMass: [{ start: at(13, 7), kg: 70.4, source: 'Scale' }],
      workouts: [{ start: at(11, 18), minutes: 40, kind: 'running', source: 'Band' }] };
    const plugin = {
      isAvailable: async () => { window.__health.isAvailable++; return { available: true }; },
      requestRead: async ({ types }) => { window.__health.requestRead.push([...types]); return { requested: true }; },
      read: async ({ types, since, until }) => {
        window.__health.read.push([...types]);
        const out = {};
        for (const t of types) out[t] = (data[t] ?? []).filter((r) => r.start >= since && (!until || r.start < until));
        return out;
      },
    };
    window.Capacitor = { isNativePlatform: () => isNative, getPlatform: () => (isNative ? 'ios' : 'web'),
      Plugins: { GymHealth: plugin } };
  }, native);
  p.offsite = watchOffsite(p.page);
  await p.page.clock.install({ time: new Date(2026, 10, 13, 8, 0).getTime() });
  await p.page.goto(BASE);
  await p.page.locator('[data-cal]').first().waitFor();
  return p;
}

async function m11Shot(p, name, extra = {}) {
  await p.page.waitForTimeout(300);
  await shot(p.page, p.log, `m11-verify-${name}`, { sizes: await m7Sizes(p.page), ...extra });
}

async function m11(browser) {
  // Native (fake bridge): Settings → Health before and after Connect, Today card, Fuel weigh-in.
  const p = await m11Phone(browser, true);
  const { page } = p;
  const hs = page.locator('main[data-screen="health-settings"]');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-health-open]').click();
  await hs.waitFor();
  await m11Shot(p, 'health-settings-connect');
  await hs.locator('[data-health-connect]').click();
  await hs.locator('[data-health-last-read]').filter({ hasText: 'Last read: today 08:00' }).waitFor();
  await m11Shot(p, 'health-settings', {
    switches: await hs.locator('[data-health-type]').evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-health-type'), e.getAttribute('aria-checked'),
        Math.round(e.getBoundingClientRect().height)])),
    requestRead: await page.evaluate(() => window.__health.requestRead),
  });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await m11Shot(p, 'health-settings-bottom');
  // Turn-off confirm for one type (cancel nothing; just show the confirm row).
  await page.evaluate(() => window.scrollTo(0, 0));
  await hs.locator('[data-health-type="sleep"]').click();
  await hs.locator('[data-health-delete="sleep"]').waitFor();
  await hs.locator('[data-health-delete="sleep"]').scrollIntoViewIfNeeded();
  await m11Shot(p, 'health-settings-confirm');
  await hs.getByRole('button', { name: '‹ Back' }).click();
  await page.locator('[data-tab="today"]').click();
  await page.locator('[data-cal]').first().waitFor();
  // The confirm was left open (not confirmed): sleep must still be on and the card still there.
  const card = page.locator('[data-readiness]');
  await card.waitFor();
  await card.scrollIntoViewIfNeeded();
  await m11Shot(p, 'today-card', {
    offer: await card.getAttribute('data-readiness'),
    reasons: await card.locator('[data-readiness-reason]').allTextContents(),
    weekLoad: await page.locator('[data-week-load]').textContent(),
    cardButtons: await card.locator('button').evaluateAll((els) =>
      els.map((e) => [e.textContent.trim(), Math.round(e.getBoundingClientRect().height)])),
  });
  await page.locator('[data-tab="fuel"]').click();
  await page.locator('main[data-screen="fuel"]').waitFor();
  const weigh = page.locator('[data-weigh-in]');
  await weigh.filter({ hasText: '70.4' }).waitFor();
  await weigh.scrollIntoViewIfNeeded();
  await m11Shot(p, 'fuel-weigh-in', { weighIn: (await weigh.textContent())?.replace(/\s+/g, ' ').trim(),
    tag: await weigh.locator('[data-from-health]').textContent() });
  const spoken = await page.evaluate(() => window.__spoken);
  results.push({ flow: 'm11-native', spoken, offsite: p.offsite });
  await p.ctx.close();

  // PWA (no Capacitor): Settings → Health line.
  const w = await m11Phone(browser, null);
  await w.page.locator('[data-tab="settings"]').click();
  await w.page.locator('[data-health-open]').click();
  await w.page.locator('main[data-screen="health-settings"] [data-health-pwa]').waitFor();
  await m11Shot(w, 'health-pwa', { line: await w.page.locator('[data-health-pwa]').textContent() });
  results.push({ flow: 'm11-pwa', offsite: w.offsite });
  await w.ctx.close();
}

// ---------------------------------------------------------------------------------------------
// M12 slices 1 + 1c (verifier, 2026-11-17): the wired app at 390×844 with the clock installed on
// Fri 13 Nov 2026 18:00 (made-up sessions seeded into IndexedDB, as e2e/calendar.spec.ts):
// Today (to-do card + missed-day card), Coach (empty, proposal, applied), focus-block card
// (collapsed, expanded), Pause-sheet chat, Calendar (month, scores, day), Share month PNG, What's
// New tour (page 1 + last), To-do list, guide steps, report preview, Settings → About; and a
// reduced-motion pass that counts running animations. Every request off localhost is aborted and
// recorded. Writes docs/screenshots/m12-verify-*.png.
const M12_MIN = 60_000;
const m12At = (day, hour) => new Date(2026, 10, day, hour, 0).getTime();

async function m12Phone(browser, { time = m12At(13, 18), reducedMotion = 'no-preference', share = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    reducedMotion,
    acceptDownloads: true,
  });
  const offsite = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  await page.addInitScript((share) => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => window.__spoken.push(u.text), cancel: () => {}, pause: () => {},
        resume: () => {}, getVoices: () => [], addEventListener: () => {},
        speaking: false, pending: false, paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => {}, release: async () => {} }) },
    });
    if (!share)
      for (const k of ['share', 'canShare'])
        Object.defineProperty(navigator, k, { configurable: true, value: undefined });
  }, share);
  await page.clock.install({ time });
  await page.goto(BASE + '/');
  await page.locator('[data-cal]').first().waitFor();
  return { ctx, page, log, offsite };
}

async function m12Settle(page) {
  await page.waitForFunction(() =>
    document.getAnimations().every(
      (a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity,
    ),
  );
}

/** Smallest visible text font size and smallest visible button height on screen. */
async function m12Metrics(page, scope = 'body') {
  return page.evaluate((scope) => {
    const root = document.querySelector(scope) ?? document.body;
    let minFont = Infinity;
    let minFontText = '';
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('svg')) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own || el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < minFont) { minFont = fs; minFontText = el.textContent.trim().slice(0, 40); }
    }
    const btns = [...root.querySelectorAll('button')]
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => ({ t: b.textContent.trim().slice(0, 30), h: Math.round(b.getBoundingClientRect().height * 10) / 10 }));
    const minBtn = btns.reduce((m, b) => (b.h < m.h ? b : m), { t: '', h: Infinity });
    return { minFont, minFontText, minButton: minBtn, buttons: btns.length };
  }, scope);
}

async function m12Shot(p, name, extra = {}, opts = {}) {
  if (!opts.noSettle) await m12Settle(p.page);
  const metrics = await m12Metrics(p.page, opts.scope);
  await shot(p.page, p.log, `m12-verify-${name}`, { metrics, ...extra });
  if (opts.fullPage) await p.page.screenshot({ path: `${OUT}/m12-verify-${name}-full.png`, fullPage: true });
}

async function m12Seed(page, sessions, sets, seen) {
  for (let i = 0; i < 60; i++) {
    const ok = await page.evaluate(({ sessions, sets, seen }) => new Promise((resolve) => {
      const open = indexedDB.open('gym-clean');
      open.onerror = () => resolve(false);
      open.onsuccess = () => {
        const d = open.result;
        if (!d.objectStoreNames.contains('sessions')) { d.close(); return resolve(false); }
        const tx = d.transaction(['sessions', 'sets', 'settings'], 'readwrite');
        const st = tx.objectStore('settings');
        const get = st.get('whatsNew');
        get.onsuccess = () => st.put({ key: 'whatsNew', value: { ...(get.result?.value ?? {}), seenRelease: seen } });
        for (const s of sessions)
          tx.objectStore('sessions').put({ ...s, setsDone: sets.filter((l) => l.sessionId === s.sessionId).length,
            totalVolumeKg: 0, restOverruns: 0 });
        for (const l of sets) tx.objectStore('sets').put({ ...l, restTakenSec: 90, endedAt: l.startedAt + 40_000 });
        tx.oncomplete = () => { d.close(); resolve(true); };
        tx.onerror = () => resolve(false);
      };
    }), { sessions, sets, seen });
    if (ok) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  await page.reload();
  await page.locator('[data-cal]').first().waitFor();
}

function m12Program() {
  return JSON.parse(execFileSync('cat', ['src/data/program.json'], { encoding: 'utf8' }));
}

function m12AllSets(sessionId, day, start) {
  let t = start;
  return day.exercises.flatMap((e) => Array.from({ length: e.sets }, (_, setIndex) => {
    t += 2 * M12_MIN;
    return { sessionId, exerciseId: e.exerciseId, setIndex, reps: 10, weightKg: 20, startedAt: t };
  }));
}

/** Last week one session; this week Push A in full Mon, Pull A partly Tue, nothing Wed/Thu. */
async function m12SeedWeek(page, release) {
  const prog = m12Program();
  const push = prog.days.find((d) => d.id === 'push-a');
  const pull = prog.days.find((d) => d.id === 'pull-a');
  await m12Seed(page, [
    { sessionId: 'w-prev', dayId: 'push-a', startedAt: m12At(2, 18), endedAt: m12At(2, 18) + 40 * M12_MIN },
    { sessionId: 'w-mon', dayId: 'push-a', startedAt: m12At(9, 18), endedAt: m12At(9, 18) + 70 * M12_MIN },
    { sessionId: 'w-tue', dayId: 'pull-a', startedAt: m12At(10, 18), endedAt: m12At(10, 18) + 20 * M12_MIN },
  ], [
    { sessionId: 'w-prev', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0, reps: 10, weightKg: 20, startedAt: m12At(2, 18) + M12_MIN },
    ...m12AllSets('w-mon', push, m12At(9, 18)),
    { sessionId: 'w-tue', exerciseId: pull.exercises[0].exerciseId, setIndex: 0, reps: 9, weightKg: 22.5, startedAt: m12At(10, 18) + M12_MIN },
  ], release);
}

async function m12Animations(page) {
  return page.evaluate(() => document.getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => `${a.effect?.target?.className || a.effect?.target?.tagName || '?'}:${a.animationName ?? a.transitionProperty ?? 'web'}`));
}

async function m12(browser) {
  const release = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' })).version;
  const tab = (p, t) => p.page.locator(`[data-tab="${t}"]`).click();
  const coach = (p) => p.page.locator('[data-screen="coach"]');

  // 1. Today: to-do card + missed-day card; Calendar month / scores / day; Share month.
  {
    const p = await m12Phone(browser);
    await m12SeedWeek(p.page, release);
    await p.page.locator('[data-missed-day]').waitFor();
    await p.page.locator('[data-todo-card]').waitFor();
    const missed = (await p.page.locator('[data-missed-day] .missed-text').textContent())?.trim();
    const todo = (await p.page.locator('[data-todo-card]').textContent())?.replace(/\s+/g, ' ').trim();
    const startY = (await p.page.locator('[data-start]').first().boundingBox())?.y;
    const cardY = (await p.page.locator('[data-todo-card]').boundingBox())?.y;
    await m12Shot(p, 'today', { missed, todo, startY, cardY }, { fullPage: true });

    await tab(p, 'calendar');
    const month = p.page.locator('main[data-screen="calendar"]');
    await month.waitFor();
    await p.page.locator('[data-cal-day="2026-11-09"]').waitFor();
    const cells = await p.page.locator('[data-cal-day]').evaluateAll((els) => {
      const r = els[0].getBoundingClientRect();
      return { n: els.length, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
        statuses: Object.fromEntries(els.filter((e) => /2026-11-(0[2-9]|1[0-3])/.test(e.getAttribute('data-cal-day')))
          .map((e) => [e.getAttribute('data-cal-day'), `${e.getAttribute('data-status')} | ${e.getAttribute('aria-label')}`])) };
    });
    await m12Shot(p, 'calendar-month', { cells });
    // The score numbers count up (JS, not WAAPI): wait until the big number equals the line's %.
    await p.page.waitForFunction(() => {
      const s = document.querySelector('[data-score="week"]');
      const pct = /(\d+)%/.exec(s?.querySelector('[data-score-line]')?.textContent ?? '')?.[1];
      return pct !== undefined && s?.querySelector('.cal-score-num')?.textContent === `${pct}%`;
    });
    await p.page.waitForTimeout(600);
    const week = (await p.page.locator('[data-score="week"]').textContent())?.replace(/\s+/g, ' ').trim();
    const monthScore = (await p.page.locator('[data-score="month"]').textContent().catch(() => null))?.replace(/\s+/g, ' ').trim();
    await p.page.locator('[data-score="week"]').scrollIntoViewIfNeeded();
    await m12Shot(p, 'calendar-scores', { week, monthScore });

    // Share month (download fallback: no Web Share in this context).
    const before = [];
    p.page.on('request', (r) => before.push(r.url()));
    const [dl] = await Promise.all([p.page.waitForEvent('download'), p.page.locator('[data-share-month]').click()]);
    await dl.saveAs(`${OUT}/m12-verify-share-month.png`);
    const notice = await p.page.locator('[data-notice]').textContent();
    results.push({ file: `${OUT}/m12-verify-share-month.png`, flow: 'share-month', filename: dl.suggestedFilename(),
      notice, requestsAfterTap: before.filter((u) => !/^(blob|data):/.test(u)) });

    await p.page.locator('[data-cal-day="2026-11-10"]').click();
    const day = p.page.locator('main[data-screen="calendar-day"]');
    await day.waitFor();
    const rows = await day.locator('[data-cal-ex]').evaluateAll((els) =>
      els.map((e) => `${e.getAttribute('data-cal-ex')}=${e.getAttribute('data-row-status') ?? e.querySelector('[data-row-status]')?.getAttribute('data-row-status')}`));
    await m12Shot(p, 'calendar-day', { sub: await day.locator('[data-day-sub]').textContent(), rows }, { fullPage: true });
    results.push({ flow: 'm12-today-calendar', offsite: p.offsite, spoken: await p.page.evaluate(() => window.__spoken) });
    await p.ctx.close();
  }

  // 2. Coach tab: empty with starters → Not today proposal → Apply (Undo on the card).
  {
    const p = await m12Phone(browser);
    await tab(p, 'coach');
    await coach(p).waitFor();
    const tabs = await p.page.locator('[data-tab]').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return `${e.getAttribute('data-tab')} ${Math.round(r.width)}x${Math.round(r.height)} "${e.textContent.trim()}"`;
    }));
    await m12Shot(p, 'coach-empty', { tabs });
    await coach(p).locator('[data-coach-chip="notToday"]').click();
    await coach(p).locator('[data-proposal]').waitFor();
    await m12Shot(p, 'coach-proposal');
    await coach(p).locator('[data-proposal]').getByRole('button', { name: 'Apply' }).click();
    await coach(p).locator('[data-card-status="applied"]').waitFor();
    await m12Shot(p, 'coach-applied', { undo: await coach(p).getByRole('button', { name: 'Undo' }).count() });
    results.push({ flow: 'm12-coach', offsite: p.offsite, spoken: await p.page.evaluate(() => window.__spoken) });
    await p.ctx.close();
  }

  // 3. Focus block: "This month I want to build my chest" → 5 days → card collapsed → expanded.
  {
    const p = await m12Phone(browser);
    await tab(p, 'coach');
    await coach(p).getByLabel('Ask the coach').fill('This month I want to build my chest');
    await coach(p).getByRole('button', { name: 'Send' }).click();
    await coach(p).locator('[data-coach-followup]').filter({ hasText: '5 days' }).click();
    const card = coach(p).locator('[data-focus-block-card]').last();
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await m12Shot(p, 'focus-collapsed', { weeks: await card.locator('[data-fb-week]').allTextContents() });
    await card.locator('[data-fb-week]').first().click();
    await card.locator('[data-fb-day]').first().click();
    await card.locator('[data-fb-ex]').first().waitFor();
    await card.locator('[data-fb-week]').first().scrollIntoViewIfNeeded();
    await m12Shot(p, 'focus-expanded', {}, { fullPage: true });
    results.push({ flow: 'm12-focus', offsite: p.offsite });
    await p.ctx.close();
  }

  // 4. Pause-sheet compact chat.
  {
    const p = await m12Phone(browser);
    await p.page.locator('[data-hero="push-a"] [data-start]').click();
    await p.page.getByRole('button', { name: 'Start workout' }).click();
    await p.page.locator('[data-screen="exercise"]').waitFor();
    const duringSet = {
      inputs: await p.page.locator('input, textarea').count(),
      todoCard: await p.page.locator('[data-todo-card]').count(),
      tour: await p.page.locator('[data-tour="whats-new"]').count(),
      tabbar: await p.page.locator('[data-tabbar]').count(),
    };
    await p.page.getByRole('button', { name: 'Pause', exact: true }).click();
    await p.page.locator('[data-pause="coach"]').click();
    await p.page.locator('[data-coach-sheet]').waitFor();
    await m12Shot(p, 'pause-chat', { duringSet });
    await p.ctx.close();
  }

  // 5. What's New tour: an update from 1.11.0 → page 1 (version) … last page.
  {
    const p = await m12Phone(browser, { time: m12At(16, 18) });
    await m12Seed(p.page, [{ sessionId: 's1', dayId: 'push-a', startedAt: m12At(13, 18), endedAt: m12At(13, 18) + 40 * M12_MIN }],
      [{ sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0, reps: 10, weightKg: 20, startedAt: m12At(13, 18) + M12_MIN }], '1.11.0');
    const tour = p.page.locator('[data-tour="whats-new"]');
    await tour.waitFor();
    const wn = (part) => tour.locator(`[data-wn="${part}"]`);
    await m12Shot(p, 'tour-first', { count: await wn('count').textContent(), title: await wn('title').textContent(),
      version: await wn('version').textContent() }, { scope: '[data-tour="whats-new"]' });
    const titles = [await wn('title').textContent()];
    for (let i = 0; i < 12 && (await wn('next').getAttribute('data-last')) !== 'true'; i++) {
      await wn('next').click();
      titles.push(await wn('title').textContent());
    }
    await m12Shot(p, 'tour-last', { count: await wn('count').textContent(), titles,
      topics: await wn('topics').textContent() }, { scope: '[data-tour="whats-new"]' });
    results.push({ flow: 'm12-tour', offsite: p.offsite, spoken: await p.page.evaluate(() => window.__spoken) });
    await p.ctx.close();
  }

  // 6. To-dos: list, auto step, ask with note, decision, report preview; Settings → About.
  {
    const p = await m12Phone(browser, { time: m12At(16, 18) });
    await p.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const list = p.page.locator('main[data-screen="todos"]');
    const guide = p.page.locator('main[data-screen="todo-guide"]');
    const open = async (id) => { await list.locator(`li[data-todo-topic="${id}"] button`).click(); await guide.waitFor(); };
    await p.page.locator('[data-todo-card]').click();
    await list.waitFor();
    await m12Shot(p, 'todo-list', { summary: await list.locator('[data-todo-summary]').textContent() }, { fullPage: true });
    await open('coach-calendar');
    await m12Shot(p, 'guide-auto', { step: await guide.locator('[data-step-count]').textContent(),
      auto: await guide.locator('[data-auto-state]').getAttribute('data-auto-state') });
    for (let i = 0; i < 3; i++) await guide.locator('[data-guide-next]').click();
    await guide.locator('[data-option="something"]').click();
    await guide.locator('[data-note]').fill('The ring felt slow on rest days');
    await m12Shot(p, 'guide-ask-note', { step: await guide.locator('[data-step-count]').textContent() });
    await guide.locator('[data-guide-next]').click();
    await guide.getByRole('button', { name: '‹ To-dos' }).click();
    await open('apple-card');
    await guide.locator('[data-option="yes"]').click();
    await guide.locator('[data-decision]').waitFor();
    await m12Shot(p, 'guide-decision', { decision: await guide.locator('[data-decision]').textContent() });
    await guide.getByRole('button', { name: '‹ To-dos' }).click();
    await list.locator('[data-copy-report]').click();
    const sheet = p.page.locator('[data-report-sheet]');
    await sheet.locator('[data-report-text]').waitFor();
    const reportText = await sheet.locator('[data-report-text]').textContent();
    await m12Shot(p, 'report-preview', { hasName: /Wongsaton|Kampusan/.test(reportText ?? ''),
      header: reportText?.split('\n').slice(0, 3) }, { scope: '[data-report-sheet]' });
    await sheet.locator('[data-report-close]').click();
    const listBack = await list.locator('button').evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent.trim()));
    results.push({ flow: 'm12-todo-list-top-buttons', listBack, tabbarOnList: await p.page.locator('[data-tabbar]').count() });

    await p.page.reload();
    await p.page.locator('[data-cal]').first().waitFor();
    await tab(p, 'settings');
    const about = p.page.locator('[data-about="version"]');
    await about.scrollIntoViewIfNeeded();
    await p.page.locator('[data-about="credit"]').scrollIntoViewIfNeeded();
    await m12Shot(p, 'settings-about', { version: await about.textContent(),
      credit: await p.page.locator('[data-about="credit"]').textContent() });
    results.push({ flow: 'm12-todos', offsite: p.offsite, spoken: await p.page.evaluate(() => window.__spoken) });
    await p.ctx.close();
  }

  // 7. Reduced motion: running finite animations after each change (expect none).
  {
    const p = await m12Phone(browser, { reducedMotion: 'reduce' });
    const rm = {};
    rm.matches = await p.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    rm.todayLoad = await m12Animations(p.page);
    await tab(p, 'calendar');
    rm.calendar = await m12Animations(p.page);
    await tab(p, 'coach');
    await coach(p).locator('[data-coach-starter="week"]').click();
    rm.coachStarter = await m12Animations(p.page);
    await coach(p).locator('.cs-msg-coach').first().waitFor();
    rm.coachReply = await m12Animations(p.page);
    await p.ctx.close();
    const q = await m12Phone(browser, { time: m12At(16, 18), reducedMotion: 'reduce' });
    await m12Seed(q.page, [{ sessionId: 's1', dayId: 'push-a', startedAt: m12At(13, 18), endedAt: m12At(13, 18) + 40 * M12_MIN }],
      [{ sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0, reps: 10, weightKg: 20, startedAt: m12At(13, 18) + M12_MIN }], '1.11.0');
    await q.page.locator('[data-tour="whats-new"]').waitFor();
    rm.tourOpen = await m12Animations(q.page);
    await q.page.locator('[data-wn="next"]').click();
    rm.tourNext = await m12Animations(q.page);
    results.push({ flow: 'm12-reduced-motion', rm, console: [...p.log, ...q.log], offsite: [...p.offsite, ...q.offsite] });
    await q.ctx.close();
  }
}

// ---------------------------------------------------------------------------------------------
// M12 slice 1b "Trainer kit" (verifier, 2026-11-17): the wired app at 390×844, clock on Fri 13 Nov
// 2026 18:00, MADE-UP data only (sessions, a canvas-drawn image, a fake GymHealth bridge). Same
// flows and selectors as e2e/{trainer-kit,intake,body}.spec.ts. Screens: warm-up set, effort row,
// a learn card (effort Why? + one from a coach reply), short-on-time proposal, feel-today, intake
// (question 1 + summary), Goal card, measurements, e1RM chart, progress photo compare, cardio line
// (Today + Calendar week score, native fake), and the 1.13.0 What's New tour page 1. Every request
// off localhost is aborted and recorded. Writes docs/screenshots/m12b-verify-*.png.
async function m12bPhone(browser, { time = m12At(13, 18), skipIntake = true, warmupsOff = true,
  native = false, waitFor = '[data-cal]' } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ignoreHTTPSErrors: true, acceptDownloads: true,
  });
  const offsite = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  // e2e/fixtures.ts freshDbDefaults: a FRESH database gets intakeSkipped / trainerKit rows.
  await ctx.addInitScript((o) => {
    if (!o.skipIntake && !o.warmupsOff) return;
    const proto = IDBFactory.prototype;
    const open = proto.open;
    let fresh = false;
    proto.open = function (name, version) {
      const req = version === undefined ? open.call(this, name) : open.call(this, name, version);
      if (name !== 'gym-clean') return req;
      req.addEventListener('upgradeneeded', (e) => { if (e.oldVersion === 0) fresh = true; });
      req.addEventListener('success', () => {
        if (!fresh) return;
        const d = req.result;
        if (!d.objectStoreNames.contains('settings')) return;
        fresh = false;
        const st = d.transaction('settings', 'readwrite').objectStore('settings');
        if (o.skipIntake) st.put({ key: 'intakeSkipped', value: Date.now() });
        if (o.warmupsOff) st.put({ key: 'trainerKit', value: { warmups: 'off' } });
      });
      return req;
    };
  }, { skipIntake, warmupsOff });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  await page.addInitScript((isNative) => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => { if (u.text && u.volume !== 0) window.__spoken.push(u.text); },
        cancel: () => {}, pause: () => {}, resume: () => {}, getVoices: () => [],
        addEventListener: () => {}, speaking: false, pending: false, paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => {}, release: async () => {} }) },
    });
    if (!isNative) return;
    // Fake GymHealth (made-up): a 40 min run Wed 11 + a 55 min ride Thu 12 + a 30 min walk Mon 2.
    const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime();
    const data = {
      sleep: [], restingHr: [], hrv: [], activeEnergy: [], bodyMass: [],
      workouts: [
        { start: at(11, 7), minutes: 40, kind: 'running', source: 'Band' },
        { start: at(12, 7), minutes: 55, kind: 'cycling', source: 'Band' },
        { start: at(2, 7), minutes: 30, kind: 'walking', source: 'Band' },
      ],
    };
    const plugin = {
      isAvailable: async () => ({ available: true }),
      requestRead: async () => ({ requested: true }),
      read: async ({ types, since, until }) => {
        const out = {};
        for (const t of types) out[t] = (data[t] ?? []).filter((r) => r.start >= since && (!until || r.start < until));
        return out;
      },
    };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: { GymHealth: plugin } };
  }, native);
  await page.clock.install({ time });
  await page.goto(BASE + '/');
  await page.locator(waitFor).first().waitFor();
  return { ctx, page, log, offsite };
}

async function m12bShot(p, name, extra = {}, opts = {}) {
  if (!opts.noSettle) await m12Settle(p.page);
  const metrics = await m12Metrics(p.page, opts.scope);
  await shot(p.page, p.log, `m12b-verify-${name}`, { metrics, ...extra });
  if (opts.fullPage) await p.page.screenshot({ path: `${OUT}/m12b-verify-${name}-full.png`, fullPage: true });
}

function m12bBench() {
  const days = [2, 6, 11];
  return {
    sessions: days.map((d) => ({ sessionId: `s${d}`, dayId: 'push-a', startedAt: m12At(d, 18), endedAt: m12At(d, 18) + 45 * M12_MIN })),
    sets: days.flatMap((d, i) => [0, 1, 2].map((k) => ({ sessionId: `s${d}`, exerciseId: 'Dumbbell_Bench_Press',
      setIndex: k, reps: 8, weightKg: 15 + 2.5 * i, startedAt: m12At(d, 18) + (k + 1) * 3 * M12_MIN }))),
  };
}

async function m12bAnswer(page, a) {
  const intake = page.locator('main[data-screen="intake"]');
  for (const [id, value] of [['goal', a.goal], ['days', a.days], ['length', a.length], ['experience', a.experience], ['easyOn', '']]) {
    await page.locator(`main[data-screen="intake"][data-step="${id}"]`).waitFor();
    if (value) await intake.locator(`[data-option="${value}"]`).click();
    await intake.locator('[data-intake-next]').click();
  }
  await page.locator('main[data-screen="intake"][data-step="summary"]').waitFor();
}

async function m12bFinish(p, flow, extra = {}) {
  results.push({ flow, offsite: p.offsite, spoken: await p.page.evaluate(() => window.__spoken), console: p.log, ...extra });
  await p.ctx.close();
}

/** Scrolls into view, retrying while the screen re-renders (async Health/Dexie reads). */
async function m12bScroll(loc) {
  for (let i = 0; i < 20; i++) {
    try { await loc.evaluate((el) => el.scrollIntoView({ block: 'center' }), undefined, { timeout: 2000 }); return; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  throw new Error('m12bScroll: element never settled');
}

// Feel today → the "Lighter today?" card (SPEC M12 item 9: low energy + a sore area are two
// signals, "so both together work without Health"). Native fake with Health connected but no
// sleep/HRV/resting-HR data, native not connected, and the PWA.
async function m12bFeelCard(browser) {
  const out = {};
  for (const mode of ['native-connected', 'native-unconnected', 'pwa']) {
    const p = await m12bPhone(browser, { native: mode !== 'pwa' });
    const { page } = p;
    if (mode === 'native-connected') {
      await page.locator('[data-tab="settings"]').click();
      await page.locator('[data-health-open]').click();
      const hs = page.locator('main[data-screen="health-settings"]');
      await hs.locator('[data-health-connect]').click();
      await hs.locator('[data-health-last-read]').waitFor();
      await hs.getByRole('button', { name: '‹ Back' }).click();
      await page.locator('[data-tab="today"]').click();
      await page.locator('[data-cal]').first().waitFor();
    }
    const feel = page.locator('[data-feel-today]');
    await feel.locator('[data-feel-open]').click();
    await feel.locator('[data-feel-energy="2"]').click();
    await feel.locator('[data-feel-sore="chest"]').click();
    await feel.locator('[data-feel-save]').click();
    await page.locator('[data-easy-on="chest"]').first().waitFor();
    await m12Settle(page);
    await page.waitForTimeout(1500);
    const card = page.locator('[data-readiness]');
    out[mode] = {
      readinessCards: await card.count(),
      offer: await card.count() ? await card.first().getAttribute('data-readiness') : null,
      reasons: await page.locator('[data-readiness-reason]').allTextContents(),
      lighterText: await page.getByText('Lighter today', { exact: false }).count(),
    };
    if (await card.count()) {
      await m12bScroll(card.first());
      await m12bShot(p, `feel-card-${mode}`, out[mode]);
    }
    await m12bFinish(p, `m12b-feel-card-${mode}`, out[mode]);
  }
  return out;
}

async function m12b(browser, only) {
  if (only === 'feel-card') return m12bFeelCard(browser);
  const release = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' })).version;

  // 1. Workout with warm-ups on (trainer-kit default): warm-up set, effort row, effort learn card.
  {
    const p = await m12bPhone(browser, { warmupsOff: false });
    const { page } = p;
    await page.clock.pauseAt(m12At(13, 18) + 5_000);
    await page.getByRole('button', { name: /Push A/ }).first().click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('heading', { name: 'Dumbbell Bench Press' }).waitFor();
    await page.clock.runFor(500);
    await page.locator('[data-warmup-label]').waitFor();
    const during = {};
    for (const sel of ['[data-effort]', '[data-feel-today]', '[data-goal-card]', '[data-learn-open]', '[data-readiness]', 'input', 'textarea'])
      during[sel] = await page.locator(`[data-screen="exercise"] ${sel}, body > ${sel}`).count();
    await m12bShot(p, 'warmup-set', { counter: await page.locator('[data-set-counter]').textContent(),
      label: await page.locator('[data-warmup-label]').textContent(), duringSet: during });
    const setDone = async () => {
      await page.clock.runFor(30_000);
      await page.getByRole('button', { name: 'Set done' }).click();
      await page.locator('[data-screen="rest"]').waitFor();
      await page.clock.runFor(500);
    };
    const startSet = async () => {
      await page.clock.runFor(5_000);
      await page.getByRole('button', { name: 'Start set' }).click();
      await page.locator('[data-screen="exercise"]').waitFor();
    };
    await setDone();
    await m12bShot(p, 'warmup-rest', { warmup: await page.locator('[data-warmup]').textContent() });
    await startSet(); await setDone(); await startSet(); await setDone();
    const effort = page.locator('[data-effort]');
    await effort.waitFor();
    await m12bScroll(effort);
    await m12bShot(p, 'effort-row', { text: (await effort.textContent()).replace(/\s+/g, ' ').trim() });
    await effort.locator('[data-effort-opt="good"]').click();
    await effort.locator('[data-effort-why]').click();
    await page.locator('[data-learn-sheet="effort"]').waitFor();
    await m12bShot(p, 'learn-effort', {}, { scope: '[data-learn-sheet="effort"]' });
    await m12bFinish(p, 'm12b-workout');
  }

  // 2. Coach → Short on time → 30 min → proposal.
  {
    const p = await m12bPhone(browser);
    const { page } = p;
    const coach = page.locator('[data-screen="coach"]');
    await page.locator('[data-tab="coach"]').click();
    await coach.locator('[data-coach-chip="shortOnTime"]').click();
    await coach.locator('[data-coach-followup]', { hasText: '30 min' }).click();
    const card = coach.locator('[data-proposal]').last();
    await card.waitFor();
    await m12bScroll(card);
    await m12bShot(p, 'short-on-time', { card: (await card.textContent()).replace(/\s+/g, ' ').trim() }, { fullPage: true });
    await m12bFinish(p, 'm12b-short-on-time');
  }

  // 3. Feel today (energy 2 + chest) → "Go easy on chest today?"; a learn card from a coach reply.
  {
    const p = await m12bPhone(browser);
    const { page } = p;
    const feel = page.locator('[data-feel-today]');
    await feel.locator('[data-feel-open]').click();
    await feel.locator('[data-feel-energy="2"]').click();
    await feel.locator('[data-feel-sore="chest"]').click();
    await m12bScroll(feel);
    await m12bShot(p, 'feel-today', {}, { fullPage: true });
    await feel.locator('[data-feel-save]').click();
    const offer = page.locator('[data-easy-on="chest"]').first();
    await offer.waitFor();
    await m12Settle(page);
    await page.waitForTimeout(500); // Today re-renders after the save
    await offer.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await m12bShot(p, 'feel-today-saved', { offer: (await offer.textContent()).trim() });
    await offer.click();
    const coach = page.locator('[data-screen="coach"]');
    await coach.locator('[data-proposal]').last().getByRole('button', { name: 'Not now' }).click();
    await coach.getByLabel('Ask the coach').fill("How's my week?");
    await coach.getByRole('button', { name: 'Send' }).click();
    const why = coach.locator('[data-learn-open]').last();
    await why.waitFor();
    const id = await why.getAttribute('data-learn-open');
    await why.click();
    await page.locator(`[data-learn-sheet="${id}"]`).waitFor();
    await m12bShot(p, 'learn-card', { id }, { scope: `[data-learn-sheet="${id}"]` });
    await m12bFinish(p, 'm12b-feel-learn');
  }

  // 4. Fresh install → intake question 1 → summary ("What your answers change").
  {
    const p = await m12bPhone(browser, { skipIntake: false, waitFor: 'main[data-screen="intake"]' });
    const { page } = p;
    await m12bShot(p, 'intake', { count: await page.locator('[data-intake-count]').textContent() });
    await m12bAnswer(page, { goal: 'muscle', days: '3', length: '45', experience: 'new' });
    await m12bShot(p, 'intake-summary', {}, { fullPage: true });
    await m12bFinish(p, 'm12b-intake');
  }

  // 5. Existing install → Set your goal → intake → Goal card.
  {
    const p = await m12bPhone(browser);
    const { page } = p;
    const h = m12bBench();
    await m12Seed(page, h.sessions, h.sets, release);
    const card = page.locator('[data-goal-card]');
    await card.locator('[data-goal-set]').click();
    await m12bAnswer(page, { goal: 'strength', days: '4', length: '60', experience: 'some' });
    await page.locator('main[data-screen="intake"] [data-intake-done]').click();
    await page.locator('[data-goal-card="goals"]').waitFor();
    await m12bScroll(card);
    await m12bShot(p, 'goal-card', { text: (await card.textContent()).replace(/\s+/g, ' ').trim() });
    // 6. e1RM chart on the same seeded history.
    await page.locator('[data-tab="calendar"]').click();
    await page.locator('[data-cal-day="2026-11-11"]').click();
    await page.locator('main[data-screen="calendar-day"] [data-cal-history="Dumbbell_Bench_Press"]').click();
    const e1 = page.locator('[data-e1rm]');
    await e1.locator('.e1-dot').nth(2).waitFor();
    await m12bScroll(e1);
    await m12bShot(p, 'e1rm-chart', { state: await e1.getAttribute('data-state'), dots: await e1.locator('.e1-dot').count(),
      summary: await e1.locator('[data-e1rm-summary]').textContent() });
    await m12bFinish(p, 'm12b-goal-e1rm');
  }

  // 7. Fuel → Measurements (waist 81.5).
  {
    const p = await m12bPhone(browser);
    const { page } = p;
    await page.locator('[data-tab="fuel"]').click();
    await page.locator('[data-measurements-open]').click();
    const m = page.locator('main[data-screen="measurements"]');
    await m.locator('[data-site-toggle="waist"]').click();
    const v = m.locator('[data-field="site-waist"] .nf-value');
    await v.fill('81.5');
    await v.dispatchEvent('change');
    await m12bShot(p, 'measurements', {}, { fullPage: true });
    await m12bFinish(p, 'm12b-measurements');
  }

  // 8. Progress photos: on → two made-up canvas images → compare.
  {
    const p = await m12bPhone(browser);
    const { page } = p;
    await page.locator('[data-tab="settings"]').click();
    const section = page.locator('[data-section="progress-photos"]');
    await m12bScroll(section);
    const offByDefault = await section.locator('[data-setting="progress-photos"]').getAttribute('aria-checked');
    await section.locator('[data-setting="progress-photos"]').click();
    await section.locator('[data-progress-photos-open]').click();
    const ph = page.locator('main[data-screen="progress-photos"]');
    const png = async (c) => Buffer.from((await page.evaluate((c) => {
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 160;
      const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 120, 160);
      g.fillStyle = '#ffffff'; g.fillRect(40, 20, 40, 120);
      return cv.toDataURL('image/png');
    }, c)).split(',')[1], 'base64');
    for (const [pose, c, n] of [['front', '#3a6ea5', 'made-up-front.png'], ['side', '#a55a3a', 'made-up-side.png']]) {
      await ph.locator(`[data-pose="${pose}"]`).click();
      const before = await ph.locator('[data-photo]').count();
      await ph.locator('[data-photo-input="pick"]').setInputFiles({ name: n, mimeType: 'image/png', buffer: await png(c) });
      await ph.locator('[data-photo]').nth(before).waitFor();
    }
    const tiles = ph.locator('[data-photo]');
    await tiles.nth(1).waitFor();
    await tiles.nth(0).click();
    await tiles.nth(1).click();
    const cmp = ph.locator('[data-compare="pair"]');
    await cmp.waitFor();
    await m12bScroll(cmp);
    await m12bShot(p, 'photo-compare', { offByDefault, sides: await cmp.locator('[data-compare-side]').count() }, { fullPage: true });
    await m12bFinish(p, 'm12b-photos');
  }

  // 9. Cardio line (iPhone app, fake Health with made-up workouts): Today + Calendar week score.
  {
    const p = await m12bPhone(browser, { native: true });
    const { page } = p;
    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-health-open]').click();
    const hs = page.locator('main[data-screen="health-settings"]');
    await hs.locator('[data-health-connect]').click();
    await hs.locator('[data-health-last-read]').waitFor();
    await hs.getByRole('button', { name: '‹ Back' }).click();
    await page.locator('[data-tab="today"]').click();
    const line = page.locator('[data-cardio]').first();
    await line.waitFor();
    await m12bScroll(line);
    await m12bShot(p, 'cardio-today', { line: await line.textContent() });
    await page.locator('[data-tab="calendar"]').click();
    const cl = page.locator('[data-cardio]').first();
    await cl.waitFor();
    await m12bScroll(cl);
    await m12bShot(p, 'cardio-calendar', { line: await cl.textContent() });
    await m12bFinish(p, 'm12b-cardio');
  }
  // PWA: no Health → no cardio line.
  {
    const p = await m12bPhone(browser);
    await m12Settle(p.page);
    await m12bFinish(p, 'm12b-cardio-pwa', { cardioLines: await p.page.locator('[data-cardio]').count() });
  }

  // 10. What's New tour for this release: an update from 1.12.0 → page 1.
  {
    const p = await m12bPhone(browser, { time: m12At(16, 18) });
    await m12Seed(p.page, [{ sessionId: 's1', dayId: 'push-a', startedAt: m12At(13, 18), endedAt: m12At(13, 18) + 40 * M12_MIN }],
      [{ sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0, reps: 10, weightKg: 20, startedAt: m12At(13, 18) + M12_MIN }], '1.12.0');
    const tour = p.page.locator('[data-tour="whats-new"]');
    await tour.waitFor();
    const wn = (part) => tour.locator(`[data-wn="${part}"]`);
    await m12bShot(p, 'tour-first', { release, count: await wn('count').textContent(), title: await wn('title').textContent(),
      version: await wn('version').textContent() }, { scope: '[data-tour="whats-new"]' });
    const titles = [await wn('title').textContent()];
    for (let i = 0; i < 15 && (await wn('next').getAttribute('data-last')) !== 'true'; i++) {
      await wn('next').click();
      titles.push(await wn('title').textContent());
    }
    await m12bFinish(p, 'm12b-tour', { titles });
  }
}

// ---------- M13 task 35: store-style screenshot set (`--store`) ----------
// A made-up person only: the page builds `buildDemoBackup(now, { release })` (src/data/demo) and
// restores it with the app's own `importAll` on a blank same-origin page before the app boots
// (owner mode off, first launch done, tour seen). Then Today, a set, Rest, Coach (two chips),
// Calendar and Fuel at 390x844 @3x, each plain and captioned on the brand background. Every
// request off localhost is aborted and recorded. Writes docs/screenshots/store/*.png.
const STORE_OUT = `${OUT}/store`;
const STORE_BG = '#0d0f12';
// A Wednesday evening: a training day with no session yet, breakfast-to-snack logged in Fuel.
const STORE_AT = Number(process.env.STORE_AT ?? new Date(2026, 10, 18, 17, 30).getTime());

function storeBrand() {
  const src = execFileSync('cat', ['src/core/brand.ts'], { encoding: 'utf8' });
  const pick = (k) => new RegExp(`export const ${k} = '([^']*)'`).exec(src)?.[1];
  return { name: pick('APP_NAME'), tagline: pick('APP_TAGLINE') };
}

async function storePhone(browser, release) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    reducedMotion: 'reduce',
  });
  const offsite = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  await ctx.route(`${BASE}/__store-blank`, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>restore</title>' }));
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => window.__spoken.push(u.text), cancel: () => {}, pause: () => {},
        resume: () => {}, getVoices: () => [], addEventListener: () => {},
        speaking: false, pending: false, paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => {}, release: async () => {} }) },
    });
    for (const k of ['share', 'canShare'])
      Object.defineProperty(navigator, k, { configurable: true, value: undefined });
  });
  await page.clock.install({ time: STORE_AT });
  // Restore the demo backup through the app's restore function, before the app opens.
  await page.goto(`${BASE}/__store-blank`);
  const restored = await page.evaluate(async ({ now, release }) => {
    await import('/@vite/env'); // the dev server's define globals (__APP_RELEASE__ …)
    const { buildDemoBackup } = await import('/src/data/demo/demoBackup.ts');
    const { importAll } = await import('/src/data/backup.ts');
    const { GymDb } = await import('/src/data/db.ts');
    const file = buildDemoBackup(now, { release });
    const db = new GymDb();
    await db.open();
    const r = await importAll(db, file, { appVersion: release, now });
    const owner = (await db.settings.get('ownerMode'))?.value;
    const trainer = (await db.trainer.get('current'))?.state;
    db.close();
    return { counts: r.counts, owner, restWeekdays: trainer?.schedule?.restWeekdays,
      rotation: trainer?.schedule?.rotation };
  }, { now: STORE_AT, release });
  await page.goto(BASE + '/');
  return { ctx, page, log, offsite, restored };
}

/** Text that must never be in a store shot: to-dos, the dev log, a build hash. */
async function storeLeaks(page) {
  return page.evaluate(() => {
    const vis = (el) => el.getClientRects().length > 0;
    const text = document.body.innerText;
    return {
      todoCard: [...document.querySelectorAll('[data-todo-card]')].filter(vis).length,
      devlog: [...document.querySelectorAll('[data-devlog]')].filter(vis).length,
      todoWord: /to-?do/i.test(text),
      devLogWord: /developer log|dev log/i.test(text),
      hashLike: (text.match(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g) ?? []),
      buildWord: /\bbuild\b(?! a focus block)/i.test(text),
    };
  });
}

const storeResults = [];
async function storeShot(p, name, caption) {
  await p.page.waitForTimeout(400);
  const file = `${STORE_OUT}/${name}.png`;
  await p.page.screenshot({ path: file });
  const scrollWidth = await p.page.evaluate(() => document.documentElement.scrollWidth);
  const leaks = await storeLeaks(p.page);
  storeResults.push({ name, file, caption, scrollWidth, leaks, console: [...p.log] });
}

async function storeCaptioned(browser, brand) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
  const offsite = [];
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('data:')) return route.continue();
    offsite.push(u);
    return route.abort();
  });
  const page = await ctx.newPage();
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  for (const r of storeResults) {
    const png = execFileSync('base64', ['-i', r.file], { encoding: 'utf8', maxBuffer: 64 << 20 }).replace(/\s/g, '');
    await page.setContent(`<!doctype html><html><head><style>
      html,body{margin:0;width:390px;height:844px;background:${STORE_BG};color:#f4f6f8;overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
      .cap{position:absolute;top:40px;left:24px;right:24px;text-align:center}
      h1{margin:0;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-.01em}
      .shot{position:absolute;top:150px;left:50%;transform:translateX(-50%);width:288px;height:623px;
        border-radius:34px;overflow:hidden;box-shadow:0 0 0 6px #23272e,0 18px 40px rgba(0,0,0,.6)}
      .shot img{width:100%;height:100%;display:block}
      .brand{position:absolute;bottom:22px;left:0;right:0;text-align:center;font-size:15px;color:#a9b0bb}
      .brand b{color:#f4f6f8;font-weight:700}
    </style></head><body>
      <div class="cap"><h1>${esc(r.caption)}</h1></div>
      <div class="shot"><img src="data:image/png;base64,${png}" alt=""></div>
      <div class="brand"><b>${esc(brand.name)}</b> · ${esc(brand.tagline)}</div>
    </body></html>`);
    await page.locator('img').evaluate((img) => img.decode());
    const file = `${STORE_OUT}/${r.name}-captioned.png`;
    await page.screenshot({ path: file });
    r.captioned = file;
  }
  await ctx.close();
  return offsite;
}

async function store(browser) {
  mkdirSync(STORE_OUT, { recursive: true });
  const release = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' })).version;
  const brand = storeBrand();
  const p = await storePhone(browser, release);
  const flow = { restored: p.restored, release, at: new Date(STORE_AT).toString() };
  const tab = (t) => p.page.locator(`[data-tab="${t}"]`).click();

  await p.page.locator('[data-tab="today"]').waitFor();
  if (process.env.STORE_PROBE) {
    await p.page.waitForTimeout(4000);
    console.log(JSON.stringify(flow, null, 2));
    console.log(await p.page.locator('body').innerText());
    await p.page.screenshot({ path: 'test-results/store-probe.png' });
    await p.ctx.close();
    return;
  }
  // The demo plan is an edited one, so Today offers the newer default; answer it as a person would.
  await p.page.locator('[data-start]').first().waitFor();
  const keep = p.page.getByRole('button', { name: 'Keep mine' });
  flow.newDefaultNotice = await keep.waitFor({ timeout: 5000 }).then(() => true, () => false);
  if (flow.newDefaultNotice) {
    await keep.click();
    await keep.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }
  await storeShot(p, '1-today', "Today's workout, ready to start");

  await tab('calendar');
  await p.page.locator('main[data-screen="calendar"]').waitFor();
  await storeShot(p, '5-calendar', 'Your training month at a glance');

  await tab('fuel');
  await p.page.locator('main[data-screen="fuel"]').waitFor();
  await storeShot(p, '6-fuel', 'Log meals against your daily targets');

  await tab('coach');
  const coach = p.page.locator('[data-screen="coach"]');
  await coach.waitFor();
  flow.chips = await coach.locator('[data-coach-chip]').evaluateAll((els) =>
    els.map((e) => `${e.getAttribute('data-coach-chip')}: ${e.textContent.trim()}`));
  // A short made-up exchange (chat is not in backups): two chip taps, no typing.
  const chipTaps = (process.env.STORE_CHIPS ?? 'Build a focus block|Back').split('|');
  flow.coachTaps = [];
  for (const label of chipTaps) {
    const btn = coach.locator('[data-coach-chip], [data-coach-followup]').filter({ hasText: label }).last();
    await btn.click();
    await p.page.waitForTimeout(900);
    flow.coachTaps.push({ label, next: await coach.locator('[data-coach-chip], [data-coach-followup]')
      .evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.textContent.trim())) });
  }
  await storeShot(p, '4-coach', 'Ask the coach about your plan');

  await tab('today');
  await p.page.locator('[data-start]').first().click();
  await p.page.getByRole('button', { name: 'Start workout' }).click();
  await p.page.locator('[data-screen="exercise"]').waitFor();
  await storeShot(p, '2-set', 'One set at a time, in big numbers');

  await p.page.getByRole('button', { name: 'Set done' }).click();
  await p.page.locator('[data-screen="rest"]').waitFor();
  await p.page.waitForTimeout(1500);
  // Is anything drawn over the sticky Start set button (e.g. the next-set 3D figure)?
  flow.restOverlap = await p.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /Start set/.test(b.textContent));
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return [0.1, 0.2, 0.5, 0.9].map((fx) => {
      const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height / 2);
      return { fx, hitsButton: !!el && (el === btn || btn.contains(el)),
        el: el ? `${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className}` : null };
    });
  });
  await storeShot(p, '3-rest', 'A rest timer with the next set lined up');

  flow.offsite = p.offsite;
  flow.spoken = await p.page.evaluate(() => window.__spoken);
  await p.ctx.close();
  storeResults.sort((a, b) => a.name.localeCompare(b.name));
  flow.captionOffsite = await storeCaptioned(browser, brand);
  results.push(flow, ...storeResults);
}

// ------------------------------------------------- M13 verify (task 39): fresh install, owner off
// A fresh profile (no seed rows): welcome pages → intake (Skip for now) → camera page (Allow) →
// Today; Settings, Self-check, About and the What's New tour with owner mode off; then the 7-tap
// unlock → Owner tools on → About + Settings again. docs/screenshots/m13-verify-*.png.
async function m13Visible(page, sel) {
  return page.locator(sel).evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
}

async function m13Leaks(page) {
  return page.evaluate(() => {
    const text = document.body.innerText;
    return {
      hashLike: text.match(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g) ?? [],
      buildWord: /\(build /i.test(text),
      todoWord: /to-?dos?\b/i.test(text),
      devLogWord: /developer log/i.test(text),
    };
  });
}

async function m13Shot(p, name, extra = {}, opts = {}) {
  await p.page.waitForTimeout(350);
  const metrics = await m12Metrics(p.page, opts.scope);
  const leaks = await m13Leaks(p.page);
  await shot(p.page, p.log, `m13-verify-${name}`, { metrics, leaks, ...extra });
  if (opts.fullPage)
    await p.page.screenshot({ path: `${OUT}/m13-verify-${name}-full.png`, fullPage: true });
}

async function m13(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    ignoreHTTPSErrors: true,
    permissions: ['camera'],
    reducedMotion: 'reduce',
  });
  const offsite = [];
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost') return route.continue();
    offsite.push(url.href);
    return route.abort();
  });
  const page = await ctx.newPage();
  const log = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') log.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u) => window.__spoken.push(u.text), cancel: () => {}, pause: () => {},
        resume: () => {}, getVoices: () => [], addEventListener: () => {},
        speaking: false, pending: false, paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ addEventListener: () => {}, release: async () => {} }) },
    });
  });
  await page.clock.install({ time: m12At(18, 18) });
  const p = { ctx, page, log };
  const flow = { flow: 'm13', steps: [] };
  const step = (s) => flow.steps.push(s);
  const welcome = page.locator('[data-screen="welcome"]');
  const count = page.locator('[data-ob="count"]');
  const primary = page.locator('[data-ob="primary"]');

  await page.goto(BASE + '/');
  await welcome.waitFor();
  step({ welcomeShown: true, tabbar: await page.locator('[data-tabbar]').count() });
  // Welcome pages until the intake appears.
  for (let i = 1; i <= 6; i++) {
    if (await page.locator('main[data-screen="intake"]').count()) break;
    const c = (await count.textContent())?.trim();
    await m13Shot(p, `welcome-${i}`, { count: c, primary: (await primary.textContent())?.trim() },
      { scope: '[data-screen="welcome"]' });
    await primary.click();
  }
  await page.locator('main[data-screen="intake"]').waitFor();
  await m13Shot(p, 'welcome-intake', {}, { scope: 'main[data-screen="intake"]' });
  await page.locator('main[data-screen="intake"] [data-intake-skip]').click();
  await page.locator('[data-permission="camera"]').waitFor();
  await m13Shot(p, 'welcome-perm-camera', { count: (await count.textContent())?.trim(),
    notNow: await page.locator('[data-ob="not-now"]').count() }, { scope: '[data-screen="welcome"]' });
  await primary.click();
  await page.locator('[data-ob="granted"]').waitFor();
  await m13Shot(p, 'welcome-perm-camera-allowed', { primary: (await primary.textContent())?.trim() },
    { scope: '[data-screen="welcome"]' });
  await primary.click();
  await page.locator('[data-cal]').first().waitFor();
  await m13Shot(p, 'today-fresh', {
    todoCard: await m13Visible(page, '[data-todo-card]'),
    filledPrimary: await page.evaluate(() =>
      [...document.querySelectorAll('main button')].filter((b) => {
        if (b.getClientRects().length === 0) return false;
        const bg = getComputedStyle(b).backgroundColor;
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(bg);
        return m && +m[1] > 200 && +m[2] > 80 && +m[2] < 160 && +m[3] < 80;
      }).map((b) => b.textContent.trim().slice(0, 30))),
  });
  await page.reload();
  await page.locator('[data-cal]').first().waitFor();
  step({ afterReloadWelcome: await welcome.count() });

  // Settings, owner off.
  await page.locator('[data-tab="settings"]').click();
  await page.locator('main[data-screen="settings"]').waitFor();
  const settingsHooks = {};
  for (const h of ['data-todos-open', 'data-devlog', 'data-about-open', 'data-selfcheck-open',
    'data-whats-new-open'])
    settingsHooks[h] = await page.locator(`main[data-screen="settings"] [${h}]`).count();
  await m13Shot(p, 'settings-owner-off', { hooks: settingsHooks }, { fullPage: true });

  // Self-check, owner off.
  await page.locator('[data-selfcheck-open]').scrollIntoViewIfNeeded();
  await page.locator('[data-selfcheck-open]').click();
  await page.locator('main[data-screen="selfcheck"]').waitFor();
  let summaryText = '';
  for (let i = 0; i < 150; i++) {
    summaryText = (await page.locator('[data-selfcheck-summary]').textContent())?.trim() ?? '';
    if (/^All \d+ ready$|need/.test(summaryText)) break;
    await page.clock.runFor(500);
    await page.waitForTimeout(200);
  }
  const rows = await page.locator('[data-check]').evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute('data-check'), state: e.getAttribute('data-state'),
      text: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) })));
  await m13Shot(p, 'selfcheck-owner-off', { summary: summaryText, rows }, { fullPage: true });
  await page.locator('main[data-screen="selfcheck"] .back-btn').first().click();
  await page.locator('main[data-screen="settings"]').waitFor();

  // What's New tour replay, owner off.
  await page.locator('[data-whats-new-open]').scrollIntoViewIfNeeded();
  await page.locator('[data-whats-new-open]').click();
  const tour = page.locator('[data-tour="whats-new"]');
  await tour.waitFor();
  const tourPages = [];
  for (let i = 1; i <= 10; i++) {
    const c = (await tour.locator('[data-wn="count"]').textContent())?.trim();
    const title = (await tour.locator('[data-wn="title"]').first().textContent().catch(() => ''))?.trim();
    tourPages.push({ c, title });
    if (i === 1) await m13Shot(p, 'tour-1', { count: c, version: (await tour.locator('[data-wn="version"]').textContent().catch(() => null))?.trim() });
    const next = tour.locator('[data-wn="next"]');
    if (!(await next.count())) break;
    const label = (await next.textContent())?.trim();
    if (/done/i.test(label ?? '')) {
      await m13Shot(p, 'tour-last', { count: c, title });
      await next.click();
      break;
    }
    await next.click();
  }
  step({ tourPages });

  // About, owner off.
  await page.locator('main[data-screen="settings"]').waitFor();
  await page.locator('[data-about-open]').scrollIntoViewIfNeeded();
  await page.locator('[data-about-open]').click();
  const about = page.locator('main[data-screen="about"]');
  await about.waitFor();
  const version = about.locator('[data-about-version]');
  await m13Shot(p, 'about-owner-off', { version: (await version.textContent())?.trim(),
    text: (await about.innerText()).replace(/\s+/g, ' ').slice(0, 600) }, { fullPage: true });

  // 7 taps → Owner tools → on.
  for (let i = 0; i < 7; i++) await version.click();
  const sw = page.locator('[data-setting="owner-tools"]');
  await sw.waitFor();
  await sw.click();
  await page.waitForTimeout(300);
  await m13Shot(p, 'about-owner-on', { version: (await version.textContent())?.trim(),
    checked: await sw.getAttribute('aria-checked') });
  await about.locator('.back-btn').click();
  await page.locator('main[data-screen="settings"]').waitFor();
  const onHooks = {};
  for (const h of ['data-todos-open', 'data-devlog', 'data-about-open', 'data-selfcheck-open'])
    onHooks[h] = await page.locator(`main[data-screen="settings"] [${h}]`).count();
  await m13Shot(p, 'settings-owner-on', { hooks: onHooks }, { fullPage: true });

  flow.offsite = offsite;
  flow.spoken = await page.evaluate(() => window.__spoken);
  flow.console = [...log];
  results.push(flow);
  await ctx.close();
}

const milestone = (process.argv[2] ?? 'm4').replace(/^--/, '');
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
  else if (milestone === 'm4f') await m4f(browser);
  else if (milestone === 'm4f-setup') await m4fSetup(browser);
  else if (milestone === 'm7') await m7(browser);
  else if (milestone === 'm10e') await m10e(browser);
  else if (milestone === 'cam-verify') await camVerify(browser);
  else if (milestone === 'm11') await m11(browser);
  else if (milestone === 'm12') await m12(browser);
  else if (milestone === 'm12b') await m12b(browser, process.argv[3]);
  else if (milestone === 'store') await store(browser);
  else if (milestone === 'm13') await m13(browser);
  else throw new Error(`unknown milestone ${milestone}`);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
}
