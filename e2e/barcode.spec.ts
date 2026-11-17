// M7 task 23: the barcode track end to end in the real app at 390×844 (M7-q5, off by default).
// Open Food Facts is mocked with page.route, so nothing leaves the machine:
// - off (default): no Scan entry anywhere in the log sheet, 0 requests to openfoodfacts;
// - on: typed digits → one GET whose URL is only the code (no query, no cookies, no referrer,
//   no body) → the food's detail → Log; the product is saved to My foods (Undo offered), so the
//   same code next time is found on the phone with no request;
// - not found → "Add it to My foods" with the barcode kept → the next lookup is local;
// - the camera: BarcodeDetector where it exists, else the on-device zxing reader from our own
//   origin; the stream stops on a hit and on Close.
// Fuel is never mid-set, so nothing is spoken (asserted).
import { expect, test, type Page, type Request } from '@playwright/test';
import { animationsSettled, expectClearOfToast, tapInPlace } from './app.helpers';

declare global {
  interface Window {
    __spoken: string[];
    __streams: MediaStream[];
    __detects: number;
  }
}

const OFF = 'https://world.openfoodfacts.org';
const CODE = '4006381333931'; // made-up product, valid EAN-13 check digit
const CODE2 = '5901234123457';
const SHOTS = process.env.SCAN_SHOTS === '1';

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__streams = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      voice = null;
      pitch = 1;
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
          if (u.text && u.volume !== 0) window.__spoken.push(u.text);
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
        speaking: false,
        pending: false,
        paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ addEventListener: () => undefined, release: async () => {} }),
      },
    });
    // Keep every camera stream, to check it is stopped.
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await gum(c);
      window.__streams.push(s);
      return s;
    };
  });
}

/** The browser's reader, faked: nothing for two frames, then `code`. */
async function fakeDetector(page: Page, code: string) {
  await page.addInitScript((c: string) => {
    window.__detects = 0;
    class FakeDetector {
      static getSupportedFormats = async () => ['ean_13', 'ean_8', 'upc_a', 'qr_code'];
      async detect() {
        window.__detects++;
        return window.__detects < 3 ? [] : [{ rawValue: c }];
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: FakeDetector, configurable: true });
  }, code);
}

async function noDetector(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'BarcodeDetector', { value: undefined, configurable: true });
  });
}

type OffMock = { requests: Request[] };

/** Open Food Facts, mocked: `found` → a made-up product, else 404. */
async function mockOff(page: Page, found: boolean): Promise<OffMock> {
  const mock: OffMock = { requests: [] };
  await page.context().route(`${OFF}/**`, async (route) => {
    mock.requests.push(route.request());
    const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
    if (!found) return route.fulfill({ status: 404, headers: cors, body: '{"status":0}' });
    return route.fulfill({
      status: 200,
      headers: cors,
      body: JSON.stringify({
        code: CODE,
        status: 1,
        product: {
          product_name: 'Made-up oat drink',
          brands: 'Test brand',
          nutriments: {
            'energy-kcal_100g': 46,
            proteins_100g: 1.1,
            carbohydrates_100g: 6.6,
            fat_100g: 1.5,
          },
        },
      }),
    });
  });
  return mock;
}

function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.context().on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

/** Requests to any host but the app's own and the (mocked) Open Food Facts. */
function otherHosts(requests: readonly string[], origin: string): string[] {
  return requests.filter((u) => {
    if (u.startsWith('data:') || u.startsWith('blob:')) return false;
    const o = new URL(u).origin;
    return o !== origin && o !== OFF;
  });
}

async function openApp(page: Page) {
  await installMocks(page);
  await page.goto('/');
  await expect(page.locator('[data-screen="today"]')).toBeVisible();
}

/** Settings → Nutrition → Barcode lookup → its explainer → Turn on. */
async function turnOnLookup(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  const sw = page.locator('[data-setting="barcode-lookup"]');
  await sw.scrollIntoViewIfNeeded();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(page.locator('[data-barcode-confirm]')).toContainText('Nothing else is sent.');
  await page.locator('[data-barcode-on]').click();
  await expect(page.locator('[data-setting="barcode-lookup"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
}

const logSheet = (page: Page) => page.locator('[data-log-sheet]');
const scanSheet = (page: Page) => page.locator('[data-scan-sheet]');

async function openLog(page: Page, section: 'search' | 'myFoods') {
  await page.locator('[data-tab="fuel"]').click();
  await expect(page.locator('main[data-screen="fuel"]')).toBeVisible();
  await page.locator('[data-log-open]').click();
  await expect(logSheet(page)).toBeVisible();
  await logSheet(page).locator(`[data-log-section="${section}"]`).click();
}

async function openScanner(page: Page, section: 'search' | 'myFoods' = 'search') {
  await openLog(page, section);
  await logSheet(page).locator('[data-scan-open]').click();
  await expect(scanSheet(page)).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  await scanSheet(page).locator('#scan-digits').fill(code);
  await scanSheet(page).locator('[data-scan-lookup]').click();
}

/**
 * Every camera stream the page opened has ended (a stream still opening when the sheet went is
 * stopped as soon as it arrives, so callers poll).
 */
async function streamsEnded(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      window.__streams.length > 0 &&
      window.__streams.every((s) => s.getTracks().every((t) => t.readyState === 'ended')),
  );
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const sheetW = await page
    .locator('.fuel-sheet')
    .last()
    .evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(sheetW[0]).toBeLessThanOrEqual(sheetW[1] ?? 0);
}

test('off by default: no Scan entry and 0 requests to Open Food Facts', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  const off = await mockOff(page, true);
  await openApp(page);
  await page.locator('[data-tab="settings"]').click();
  await expect(page.locator('[data-setting="barcode-lookup"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await openLog(page, 'search');
  await expect(logSheet(page).locator('[data-scan-open]')).toHaveCount(0);
  await logSheet(page).locator('#log-search').fill(CODE);
  await logSheet(page).locator('[data-log-section="myFoods"]').click();
  await expect(logSheet(page).locator('[data-section-panel="myFoods"]')).toBeVisible();
  await expect(logSheet(page).locator('[data-scan-open]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(off.requests).toHaveLength(0);
  expect(requests.filter((u) => u.includes('openfoodfacts'))).toEqual([]);
  expect(otherHosts(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test('on: typed digits → one GET with only the code → detail → Log; saved for next time', async ({
  page,
  context,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await noDetector(page); // typing path; the camera is covered below
  // A cookie for the lookup host must never be sent.
  await context.addCookies([
    { name: 'tracker', value: 'x', domain: 'world.openfoodfacts.org', path: '/' },
  ]);
  const off = await mockOff(page, true);
  await openApp(page);
  await turnOnLookup(page);
  await openScanner(page);

  // A wrong check digit is caught on the phone: no request.
  await typeCode(page, '4006381333932');
  await expect(scanSheet(page).locator('#scan-digits-err')).toContainText('8, 12 or 13 digits');
  expect(off.requests).toHaveLength(0);

  await typeCode(page, CODE);
  const detail = logSheet(page).locator(`[data-log-detail="food:off:${CODE}"]`);
  await expect(detail).toBeVisible();
  await expect(scanSheet(page)).toHaveCount(0);
  await expect.poll(() => streamsEnded(page)).toBe(true); // camera off once the sheet closed

  // The request: exactly the code in the path, nothing else.
  expect(off.requests).toHaveLength(1);
  const req = off.requests[0];
  expect(req?.method()).toBe('GET');
  expect(req?.url()).toBe(`${OFF}/api/v2/product/${CODE}.json`);
  expect(new URL(req?.url() ?? '').search).toBe('');
  expect(req?.postData()).toBeNull();
  const headers = (await req?.allHeaders()) ?? {};
  expect(headers.cookie).toBeUndefined();
  expect(headers.referer).toBeUndefined();

  await expect(detail.locator('.log-detail-name')).toHaveText('Made-up oat drink (Test brand)');
  await expect(detail.locator('[data-item-note]')).toContainText('Open Food Facts');
  await expect(page.locator('[data-undo-toast]')).toContainText(
    'Saved Made-up oat drink (Test brand) to My foods.',
  );
  // Log sits above the Undo toast, no scroll needed: a tap where it is lands on it.
  const logBtn = detail.locator('[data-log-confirm]');
  await expectClearOfToast(page, logBtn);
  if (SHOTS) await page.screenshot({ path: 'docs/screenshots/m7-scan-found.png' });
  await noOverflow(page);

  await tapInPlace(page, logBtn);
  await expect(logSheet(page)).toHaveCount(0);
  await expect(page.locator('main[data-screen="fuel"] [data-entry]')).toHaveCount(1);
  await expect(page.locator('[data-undo-toast]')).toContainText('Logged Made-up oat drink');

  // Next time: found on the phone, no request. The "Logged" toast is still up: Look up stays
  // clear of it.
  await openScanner(page, 'myFoods');
  await scanSheet(page).locator('#scan-digits').fill(CODE);
  const lookUp = scanSheet(page).locator('[data-scan-lookup]');
  await expectClearOfToast(page, lookUp);
  await tapInPlace(page, lookUp);
  await expect(logSheet(page).locator(`[data-log-detail="food:off:${CODE}"]`)).toBeVisible();
  expect(off.requests).toHaveLength(1);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(otherHosts(requests, new URL(baseURL ?? '').origin)).toEqual([]);
  expect(errors).toEqual([]);
});

test('not found → Add it to My foods with the barcode → the next lookup is local', async ({
  page,
}) => {
  const { errors } = record(page);
  await noDetector(page);
  const off = await mockOff(page, false);
  await openApp(page);
  await turnOnLookup(page);
  await openScanner(page, 'myFoods');
  await typeCode(page, CODE2);

  const result = scanSheet(page).locator('[data-scan-result="missing"]');
  await expect(result).toContainText('Open Food Facts doesn’t have 5901234123457 yet.');
  const add = result.locator(`[data-scan-add="${CODE2}"]`);
  await expect(add).toHaveText(/Add it to My foods/);
  expect((await add.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(off.requests).toHaveLength(1);
  if (SHOTS) await page.screenshot({ path: 'docs/screenshots/m7-scan-missing.png' });
  await noOverflow(page);

  await add.click();
  const editor = page.locator('[data-my-food-editor]');
  await expect(editor).toBeVisible();
  await expect(editor.locator(`[data-food-barcode="${CODE2}"]`)).toContainText(CODE2);
  await expect.poll(() => streamsEnded(page)).toBe(true);
  await editor.locator('#food-name').fill('Made-up crackers');
  await editor.locator('[data-basis="per100g"]').click();
  await editor.locator('#food-kcal').fill('420');
  await editor.locator('#food-protein').fill('9');
  await editor.locator('[data-food-save]').click();

  // Saved: its detail opens, ready to log; Back lists it under My foods.
  await expect(logSheet(page).locator('[data-log-detail] .log-detail-name')).toHaveText(
    'Made-up crackers',
  );
  await logSheet(page).locator('[data-log-back]').click();
  await expect(logSheet(page).locator('[data-section-panel="myFoods"]')).toBeVisible();
  await expect(
    logSheet(page).locator('[data-log-item]', { hasText: 'Made-up crackers' }),
  ).toBeVisible();
  await expect(page.locator('[data-undo-toast]')).toContainText(
    'Saved Made-up crackers to My foods.',
  );

  // The same code again: on the phone now, no request. Look up and Log stay clear of the toast.
  await logSheet(page).locator('[data-scan-open]').click();
  await scanSheet(page).locator('#scan-digits').fill(CODE2);
  const lookUp = scanSheet(page).locator('[data-scan-lookup]');
  await expectClearOfToast(page, lookUp);
  await tapInPlace(page, lookUp);
  await expect(logSheet(page).locator('[data-log-detail]')).toContainText('Made-up crackers');
  await expectClearOfToast(page, logSheet(page).locator('[data-log-confirm]'));
  expect(off.requests).toHaveLength(1);
  // Chrome logs the mocked 404 itself; nothing else.
  expect(errors.filter((e) => !/status of 404/.test(e))).toEqual([]);
});

test('camera: BarcodeDetector reads the code, the rear camera stops on the hit', async ({
  page,
}) => {
  const { errors } = record(page);
  await fakeDetector(page, CODE);
  const off = await mockOff(page, true);
  await openApp(page);
  await turnOnLookup(page);
  await openScanner(page);
  // Two empty frames first: the camera shows while it looks.
  await expect(scanSheet(page).locator('[data-scan-camera]')).toHaveAttribute(
    'data-scan-camera',
    /on|stopped/,
  );
  await expect(logSheet(page).locator(`[data-log-detail="food:off:${CODE}"]`)).toBeVisible();
  expect(await page.evaluate(() => window.__detects)).toBeGreaterThanOrEqual(3);
  await expect.poll(() => streamsEnded(page)).toBe(true);
  expect(off.requests).toHaveLength(1);
  expect(off.requests[0]?.url()).toBe(`${OFF}/api/v2/product/${CODE}.json`);
  expect(errors).toEqual([]);
});

test('camera: no BarcodeDetector → the on-device reader from our own origin; Close stops it', async ({
  page,
  baseURL,
}) => {
  const { requests, errors } = record(page);
  await noDetector(page);
  const off = await mockOff(page, true);
  await openApp(page);
  await turnOnLookup(page);
  await openScanner(page);
  const cam = scanSheet(page).locator('[data-scan-camera]');
  await expect(cam).toHaveAttribute('data-scan-camera', 'on', { timeout: 15_000 });
  await expect(cam).toHaveText('Hold the barcode inside the frame.');
  const origin = new URL(baseURL ?? '').origin;
  expect(requests.some((u) => u.startsWith(origin) && /zxing_reader[^/]*\.wasm/.test(u))).toBe(
    true,
  );
  expect(otherHosts(requests, origin)).toEqual([]);
  expect(await streamsEnded(page)).toBe(false); // live while scanning
  // 2 m rules on the scanner: body ≥ 20px, buttons ≥ 56px, no sideways scroll.
  expect(
    await cam.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  // M12 motion: let the sheet's rise-in land first (mid-animation a 56px button can measure 55.99).
  await animationsSettled(page);
  for (const sel of ['[data-scan-lookup]', '[data-close]'])
    expect((await scanSheet(page).locator(sel).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(
      56,
    );
  await noOverflow(page);
  if (SHOTS) await page.screenshot({ path: 'docs/screenshots/m7-scan-camera.png' });

  await scanSheet(page).locator('[data-close]').click();
  await expect(scanSheet(page)).toHaveCount(0);
  await expect(logSheet(page)).toBeVisible();
  await expect.poll(() => streamsEnded(page)).toBe(true);
  expect(off.requests).toHaveLength(0);
  expect(errors).toEqual([]);
});
