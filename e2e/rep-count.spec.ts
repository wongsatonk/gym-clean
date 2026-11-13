// M4 task 12: live rep counting end to end. The fake camera (mobile-person-camera project) loops
// fixtures/synthetic/curl/synthetic-01__reps-3__partials-1.webm: 3 full curls + 1 partial per loop
// (~10 s). Flow: Pull A → Dumbbell Bicep Curl → Camera → count → Set done → Rest → IndexedDB row.
//
// Covered elsewhere (not duplicated here): a manual exercise has no Camera button and so no
// counter, in camera.spec.ts "pose-tracked exercises offer the camera; manual ones do not"; the
// Settings camera test has no counter, in rep-panel.spec.ts.
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __spoken: string[];
    /** data-reps / data-partials on screen at the moment Set done was tapped. */
    __atSetDone: { reps: number; partials: number } | null;
  }
}

const COUNT_WORDS = new Set([
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
]);

/** speechSynthesis + wakeLock recorders, and a capture-phase tap on Set done. */
async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__atSetDone = null;
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      constructor(text: string) {
        this.text = text;
      }
      addEventListener() {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (u: FakeUtterance) => {
          if (u.text && (u as { volume?: number }).volume !== 0) window.__spoken.push(u.text); // skip the silent iOS unlock
        },
        cancel: () => undefined,
        getVoices: () => [],
        speaking: false,
        pending: false,
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
    // Capture phase runs before the app's own click handler, so this is exactly the count the
    // app logs (a rep landing between a read and the click can't skew it).
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target as HTMLElement | null;
        const btn = t?.closest('button');
        const cam = btn?.closest('[role="dialog"][aria-label="Camera"]');
        if (!btn || !cam || btn.textContent?.trim() !== 'Set done') return;
        window.__atSetDone = {
          reps: Number(cam.querySelector('[data-reps]')?.getAttribute('data-reps')),
          partials: Number(cam.querySelector('[data-partials]')?.getAttribute('data-partials')),
        };
      },
      true,
    );
  });
}

const countWords = async (page: Page) =>
  (await page.evaluate(() => window.__spoken)).filter((t) => COUNT_WORDS.has(t));

async function readSets(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ exerciseId: string; setIndex: number; reps: number; partials?: number }[]>(
        (resolve, reject) => {
          const open = indexedDB.open('gym-clean');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const req = open.result.transaction('sets').objectStore('sets').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          };
        },
      ),
  );
}

/** Pull A → jump to Dumbbell Bicep Curl via the exercise list → open its camera. */
async function openCurlCamera(page: Page) {
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await expect(list.locator('[data-ex-index="3"]')).toContainText('Dumbbell Bicep Curl');
  await list.locator('[data-ex-index="3"]').click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bicep Curl' })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam.locator('.rep-panel')).toBeVisible();
  return cam;
}

/** Below this the counter can't see the curl bottom (local headless ≈ 20 fps, phone 30). */
const MIN_LIVE_FPS = 8;

/** Waits (bounded) until the live counter shows ≥ 3 reps and ≥ 1 partial. */
async function waitForCounts(cam: ReturnType<Page['getByRole']>) {
  const reps = cam.locator('[data-reps]');
  const partials = cam.locator('[data-partials]');
  // On failure, say why: inference rate, person found, and the panel's hint.
  const state = async () =>
    `fps=${await cam.getAttribute('data-fps')} person=${await cam.getAttribute(
      'data-person',
    )} delegate=${await cam.getAttribute('data-delegate')} hint="${await cam
      .locator('.rep-hint')
      .textContent()}" partials=${await partials.getAttribute('data-partials')}`;
  // GitHub's runners have no GPU: pose inference runs at ~2.5 fps there, which can't catch the
  // bottom of a curl (every rep reads as a partial). Counting logic is still covered in CI by the
  // fixture suite; this live test needs a real rate, so CI skips it when the rate is too low.
  // Locally it always runs, so a real slowdown still fails.
  if (process.env.CI) {
    await expect
      .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await cam.page().waitForTimeout(3_000); // let the rolling fps meter settle
    const measured = Number(await cam.getAttribute('data-fps'));
    test.skip(
      measured < MIN_LIVE_FPS,
      `live inference at ${measured} fps (< ${MIN_LIVE_FPS}) on this CI runner`,
    );
  }
  try {
    // Model load (≤ ~15 s) + up to two ~10 s loops of the clip.
    await expect
      .poll(async () => Number(await reps.getAttribute('data-reps')), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(async () => Number(await partials.getAttribute('data-partials')), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
    test.info().annotations.push({ type: 'live', description: await state() });
  } catch (e) {
    throw new Error(`live count not reached: ${await state()}\n${String(e)}`, { cause: e });
  }
}

test('live camera counts curls, speaks the count and logs it on Set done', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // MediaPipe's usage-log fetch is blocked by our CSP on purpose (Decisions, M3 privacy); that
  // block is logged as a console error. Any other console error fails the test.
  const USAGE_LOG = 'https://odml.pa.googleapis.com/v1/log';
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes(USAGE_LOG)) errors.push(m.text());
  });
  const sent: string[] = [];
  page.on('requestfinished', (r) => sent.push(r.url()));

  await installMocks(page);
  await page.goto('/');
  const cam = await openCurlCamera(page);
  await waitForCounts(cam);

  // The big number matches the attribute, and the spoken words are the counts in order.
  const reps = cam.locator('[data-reps]');
  await expect(reps).toHaveText(/^\d+$/);
  const words = await countWords(page);
  expect(words.slice(0, 3)).toEqual(['One', 'Two', 'Three']);
  expect(words.length).toBeLessThanOrEqual(Number(await reps.getAttribute('data-reps')));

  // Set done closes the sheet, logs the set and goes to Rest.
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();

  const atDone = await page.evaluate(() => window.__atSetDone);
  expect(atDone).not.toBeNull();
  expect(atDone?.reps ?? 0).toBeGreaterThanOrEqual(3);
  await expect.poll(async () => (await readSets(page)).length).toBe(1);
  const [row] = await readSets(page);
  expect(row?.exerciseId).toBe('Dumbbell_Bicep_Curl');
  expect(row?.setIndex).toBe(0);
  expect(row?.reps).toBe(atDone?.reps);
  expect(row?.partials ?? 0).toBe(atDone?.partials);
  expect(row?.partials ?? 0).toBeGreaterThanOrEqual(1);

  // Privacy: nothing completed against a third-party host.
  const origin = new URL(page.url()).origin;
  const external = (u: string) =>
    !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:');
  expect(sent.filter(external)).toEqual([]);
  expect(errors).toEqual([]);
});

test('with "Count reps out loud" off, the live count is silent', async ({ page }) => {
  test.setTimeout(120_000);
  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sw = page.getByRole('switch', { name: /Count reps out loud/ });
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: '‹ Back' }).click();

  const cam = await openCurlCamera(page);
  await waitForCounts(cam);
  expect(await countWords(page)).toEqual([]);
  // The focus cue still speaks at set start: speech itself works, only counting is muted.
  expect((await page.evaluate(() => window.__spoken)).length).toBeGreaterThan(0);
});
