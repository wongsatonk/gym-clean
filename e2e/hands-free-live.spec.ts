// M5c task 11 (live): the real pose model on the fake camera's synthetic curl loop
// (mobile-person-camera project; 3 curls + 1 partial per ~10 s loop). Flow: Pull A → Dumbbell
// Bicep Curl → Set done (no camera) → Rest → Camera → the sheet opens in rest mode → once the rest
// has run 10 s, two reps start set 2 by themselves ("Two" is the first word) → Set done → the
// set's rest taken is the backdated start. Skips below 8 fps in CI, like rep-count.spec.ts.
import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    __said: { text: string; at: number }[];
  }
}

const COUNT_WORDS = /^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)$/;
const MIN_LIVE_FPS = 8;
// MediaPipe's usage-log fetch is blocked by our CSP on purpose (Decisions, M3 privacy).
const USAGE_LOG = 'https://odml.pa.googleapis.com/v1/log';
const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);

async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__said = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
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
          if (u.volume === 0) return; // the silent iOS unlock
          window.__said.push({ text: u.text, at: Date.now() });
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
      value: {
        request: async () => ({
          addEventListener: () => undefined,
          release: async () => undefined,
        }),
      },
    });
  });
}

type SetRow = {
  setIndex: number;
  reps: number;
  restTakenSec: number;
  startedAt: number;
  endedAt: number;
};

function setRows(page: Page): Promise<SetRow[]> {
  return page.evaluate(
    () =>
      new Promise<SetRow[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => {
            open.result.close();
            resolve(req.result as SetRow[]);
          };
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

test('live: Rest → Camera opens rest mode; two reps after the arming time auto-start set 2', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  const thirdParty: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes(USAGE_LOG)) errors.push(m.text());
  });
  page.on('requestfinished', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http') && !ORIGIN_HOSTS.has(url.hostname))
      thirdParty.push(r.url());
  });

  await installMocks(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bicep Curl' })).toBeVisible();
  // Set 1 without the camera → Rest, whose top bar offers the camera for set 2.
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await expect.poll(async () => (await setRows(page)).length).toBe(1);
  const [set1] = await setRows(page);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
  await expect(cam.locator('[data-cam-rest-clock]')).toBeVisible();

  if (process.env.CI) {
    await expect
      .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(3_000); // let the rolling fps meter settle
    const measured = Number(await cam.getAttribute('data-fps'));
    test.skip(measured < MIN_LIVE_FPS, `live inference at ${measured} fps (< ${MIN_LIVE_FPS})`);
  }

  // The clip loops reps from the start: rest stays silent until the set starts by itself.
  const state = async () =>
    `fps=${await cam.getAttribute('data-fps')} person=${await cam.getAttribute('data-person')} mode=${await cam.getAttribute('data-cam-mode')}`;
  try {
    await expect(cam).toHaveAttribute('data-cam-mode', 'set', { timeout: 60_000 });
  } catch (e) {
    throw new Error(`no auto start: ${await state()}\n${String(e)}`, { cause: e });
  }
  const startedAt = Date.now();
  await expect(page.locator('[data-rest-clock]')).toHaveCount(0); // the session is in set 2
  await expect(cam.locator('[data-set]')).toHaveAttribute('data-set', '2/3');
  expect(Number(await cam.locator('.rep-num').getAttribute('data-reps'))).toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => (await page.evaluate(() => window.__said)).map((s) => s.text))
    .toContain('Two');
  const words = (await page.evaluate(() => window.__said))
    .map((s) => s.text)
    .filter((t) => COUNT_WORDS.test(t));
  expect(words[0]).toBe('Two'); // nothing counted out loud in rest; the first rep is silent

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect.poll(async () => (await setRows(page)).length).toBe(2);
  const set2 = (await setRows(page))[1];
  // Backdated to the first rep's departure: after arming (≥ 10 s of rest minus one rep), before
  // the start was noticed.
  expect(set2?.startedAt ?? 0).toBeLessThan(startedAt);
  expect(set2?.restTakenSec).toBe(
    Math.round(((set2?.startedAt ?? 0) - (set1?.endedAt ?? 0)) / 1000),
  );
  expect(set2?.restTakenSec ?? 0).toBeGreaterThanOrEqual(7);
  expect(thirdParty).toEqual([]);
  expect(errors).toEqual([]);
});
