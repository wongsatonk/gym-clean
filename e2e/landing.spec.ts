// M13 task 36: the static landing page (public/welcome/), checked on the production build that the
// "pwa" web server serves (`vite build` + `vite preview` on PWA_PORT), so the real service worker
// is in play. This file runs in the "mobile" project; it points baseURL at the preview and adds
// --ignore-certificate-errors (Chromium won't register a service worker over the self-signed cert
// without it), as the pwa project does.
//
// Asserts: zero <script> (in the served HTML and the DOM), a strict CSP meta, every request to the
// page's own origin, the three screenshots load, text ≥ 20px, no horizontal overflow at 390,
// the privacy promise matches the About screen (src/ui/screens/about.ts), and with the PWA
// installed /welcome/ is still the landing page, not the app shell.
//
// LANDING_SHOTS=1 writes docs/screenshots/m13-landing-{phone,desktop}.png.
import { readFileSync } from 'node:fs';
import { APP_NAME, APP_TAGLINE } from '../src/core/brand';
import { expect, test, type Page, type Request } from './fixtures';

const SHOTS = process.env.LANDING_SHOTS === '1';
const PORT = Number(process.env.E2E_PORT ?? 5174);
const PWA_PORT = Number(process.env.E2E_PWA_PORT ?? PORT + 1000);
const ORIGIN = `https://localhost:${PWA_PORT}`;

test.use({
  baseURL: ORIGIN,
  launchOptions: { args: ['--ignore-certificate-errors'] },
});

/** The About screen's privacy copy, read from its source (about.ts imports CSS, so not imported). */
function aboutPrivacy(): { points: string[]; exception: string; medical: string } {
  const src = readFileSync('src/ui/screens/about.ts', 'utf8');
  const strings = (block: string): string[] =>
    [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => (m[1] ?? '').replace(/\\'/g, "'"));
  const points = strings(/PRIVACY_POINTS[^=]*=\s*\[([\s\S]*?)\];/.exec(src)?.[1] ?? '');
  const exception = strings(/PRIVACY_EXCEPTION\s*=\s*([\s\S]*?);/.exec(src)?.[1] ?? '').join('');
  const medical = strings(/ABOUT_MEDICAL\s*=\s*([^;]*);/.exec(src)?.[1] ?? '').join('');
  return { points, exception, medical };
}

/** In-app "this phone" / "stays here" read as "your phone" on a page seen from a laptop. */
const forLanding = (s: string): string =>
  s.replaceAll('this phone', 'your phone').replace('stays here.', 'stays on your phone.');

function trackRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.context().on('request', (r) => requests.push(r));
  return requests;
}

const offOrigin = (requests: Request[]): string[] =>
  requests.map((r) => r.url()).filter((u) => !u.startsWith(`${ORIGIN}/`) && !u.startsWith('data:'));

async function expectImagesLoaded(page: Page): Promise<void> {
  const imgs = page.locator('.shot-list img');
  await expect(imgs).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    const img = imgs.nth(i);
    await img.scrollIntoViewIfNeeded();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(600);
    expect(await img.getAttribute('alt')).toBeTruthy();
  }
}

test('landing page: static, no script, own files only, readable at 390', async ({ page }) => {
  const requests = trackRequests(page);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  const res = await page.goto('/welcome/');
  expect(res?.ok()).toBe(true);
  const html = (await res?.text()) ?? '';
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/https?:\/\//i); // relative paths only, no external URL at all
  await expect(page.locator('script')).toHaveCount(0);

  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("img-src 'self' data:");
  expect(csp).toContain("style-src 'self'");
  expect(csp).toContain("script-src 'none'");

  // Brand + copy.
  await expect(page.locator('h1')).toHaveText(APP_NAME);
  await expect(page.locator('.tagline')).toHaveText(APP_TAGLINE);
  await expect(page.locator('.hero .mark svg path')).toHaveCount(1);
  const about = aboutPrivacy();
  expect(about.points.length).toBeGreaterThanOrEqual(5);
  await expect(page.locator('.privacy .points li')).toHaveText(about.points.map(forLanding));
  await expect(page.locator('.exception-head')).toHaveText('The one exception');
  await expect(page.locator('.exception p')).toHaveText(about.exception);
  await expect(page.locator('.medical')).toHaveText(about.medical);

  // "Open the app" goes to the app next to it (relative, works under /<repo>/).
  const open = page.getByRole('link', { name: 'Open the app' });
  await expect(open).toHaveCount(2);
  for (const a of await open.all()) expect(await a.getAttribute('href')).toBe('../');

  await expectImagesLoaded(page);

  // Phone rules: no sideways scroll, text ≥ 20px, the button ≥ 56px tall, name ≥ 64px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim()))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 20)
      .map((el) => `${el.tagName}.${el.className}: ${getComputedStyle(el).fontSize}`),
  );
  expect(small).toEqual([]);
  const cta = await open.first().boundingBox();
  expect(cta?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(
    await page.locator('h1').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(64);

  // The page's own fonts are used (no network font, no fallback-only render).
  expect(await page.evaluate(() => document.fonts.check('700 72px "Barlow Condensed"'))).toBe(true);

  expect(offOrigin(requests)).toEqual([]);
  expect(problems).toEqual([]);

  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/screenshots/m13-landing-phone.png',
      fullPage: true,
      scale: 'css',
    });
  }
});

test('landing page: still served at /welcome/ with the PWA service worker installed', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const requests = trackRequests(page);

  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // No clientsClaim: the first load stays uncontrolled; the reload is served by the worker.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await expect(page.locator('[data-screen]').first()).toBeVisible();

  await page.goto('/welcome/');
  await expect(page.locator('h1')).toHaveText(APP_NAME);
  await expect(page.locator('script')).toHaveCount(0);
  await expect(page.locator('[data-screen]')).toHaveCount(0); // not the app shell
  await expectImagesLoaded(page);

  // And "Open the app" lands back in the app.
  await page.getByRole('link', { name: 'Open the app' }).first().click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
  await expect(page.locator('[data-screen]').first()).toBeVisible();

  expect(offOrigin(requests)).toEqual([]);
});

test('landing page: desktop width', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: ORIGIN,
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  const requests = trackRequests(page);
  await page.goto('/welcome/');
  await expectImagesLoaded(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  // Three screenshots side by side.
  const tops = await page
    .locator('.shot-list img')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(offOrigin(requests)).toEqual([]);
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: 'docs/screenshots/m13-landing-desktop.png', fullPage: true });
  }
  await context.close();
});
