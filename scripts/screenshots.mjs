// Verifier-owned phone-size screenshots (390x844 CSS px, DPR 2).
// The Playwright MCP browser rejects the self-signed dev cert, so this script drives Chromium
// directly with ignoreHTTPSErrors. It starts its own Vite dev server on SHOT_PORT (default 5197).
//
//   node scripts/screenshots.mjs m4          # M4 screens
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
  else throw new Error(`unknown milestone ${milestone}`);
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
} finally {
  server.kill();
}
