import { expect, test, type Page } from './fixtures';
import {
  expectTapTargets,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  record,
} from './app.helpers';

/**
 * 1.15.0 Settings → Self-check (src/ui/screens/selfCheck.ts + src/ui/selfCheckRuns.ts), mounted
 * from the real modules at 390×844. The harness plays app.ts's part.
 * - Web, real wiring (`defaultSelfCheckDeps`): the pose engine really loads (no camera opened), the
 *   storage row is written, read and deleted, the iPhone-only rows say so, nothing asks for a
 *   permission, nothing is spoken and no request leaves the device.
 * - iPhone app with fake plugins: all ready, and two failing with their one-line fixes; "Copy
 *   results" puts plain text on the clipboard.
 * SELFCHECK_SHOTS=<dir> also saves the 390×844 screenshots there.
 */

declare global {
  interface Window {
    __spoken: string[];
    __asked: string[];
    __mountSelfCheck: (mode: 'web' | 'native-ok' | 'native-two-fail') => void;
  }
}

const screen = (page: Page) => page.locator('main[data-screen="selfcheck"]');
const summary = (page: Page) => page.locator('[data-selfcheck-summary]');
const row = (page: Page, id: string) => page.locator(`[data-check="${id}"]`);

async function setup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__asked = [];
    const voices = [
      { name: 'Daniel', lang: 'en-GB', default: true, localService: true, voiceURI: 'Daniel' },
      { name: 'Kanya', lang: 'th-TH', default: false, localService: true, voiceURI: 'Kanya' },
    ];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        paused: false,
        speak: (u: { text: string }) => window.__spoken.push(u.text),
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => voices,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      },
    });
    // Anything that could show a prompt is recorded (the self-check must call none of them).
    const md = navigator.mediaDevices;
    if (md) {
      md.getUserMedia = () => {
        window.__asked.push('getUserMedia');
        return Promise.reject(new Error('not in the self-check'));
      };
    }
    if ('Notification' in window) {
      Notification.requestPermission = () => {
        window.__asked.push('Notification.requestPermission');
        return Promise.resolve('default');
      };
    }
    if (navigator.storage) {
      navigator.storage.persist = () => {
        window.__asked.push('storage.persist');
        return Promise.resolve(false);
      };
      navigator.storage.persisted = () => Promise.resolve(true);
    }
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const view = await import('/src/ui/screens/selfCheck.ts' as string);
    const runs = await import('/src/ui/selfCheckRuns.ts' as string);
    const { GymDb } = await import('/src/data/db.ts' as string);
    const db = new GymDb();
    const ok = <T>(v: T) => Promise.resolve(v);
    // A fake store that reads back what was written.
    const m = new Map<string, unknown>();
    const fakes = (twoFail: boolean) => ({
      release: '1.15.0',
      build: 'abc1234',
      native: true,
      createTracker: () =>
        twoFail
          ? Promise.reject({
              type: 'error',
              target: { src: 'capacitor://localhost/mediapipe/wasm/vision_wasm_internal.js' },
            })
          : ok({ delegate: 'GPU', close: () => undefined }),
      cameraPermission: () => ok(twoFail ? 'denied' : 'granted'),
      brain: () => ok({ availability: () => ok({ available: true }) }),
      speech: () => ok({ availability: () => ok({ available: true }) }),
      reminders: () => ok({ available: true, permission: () => ok('granted') }),
      health: () => ok({ isAvailable: () => ok(true) }),
      healthConnected: () => ok(true),
      storage: {
        put: (k: string, v: unknown) => (m.set(k, v), ok(undefined)),
        get: (k: string) => ok(m.get(k)),
        delete: (k: string) => (m.delete(k), ok(undefined)),
      },
      persisted: () => ok(true),
      voices: () => ok([{ lang: 'en-GB', name: 'Daniel' }]),
    });
    window.__mountSelfCheck = (mode) => {
      let deps;
      if (mode === 'web') {
        deps = runs.defaultSelfCheckDeps(db, {
          release: '1.15.0',
          build: 'abc1234',
          native: false,
        });
      } else {
        deps = fakes(mode === 'native-two-fail');
      }
      document.body.replaceChildren(
        view.selfCheckScreen(
          { checks: runs.selfCheckRuns(deps), version: 'Version 1.15.0 (build abc1234)' },
          { onBack: () => undefined },
        ),
      );
    };
  });
}

async function shot(page: Page, name: string, outputPath: (n: string) => string) {
  await page.screenshot({ path: outputPath(`${name}.png`), fullPage: true });
  const dir = process.env['SELFCHECK_SHOTS'];
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

async function readable(page: Page) {
  const sizes = await screen(page)
    .locator('p, li span, h1')
    .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(20);
  await expectTapTargets(page, 'main[data-screen="selfcheck"]');
  await noHorizontalOverflow(page);
}

test('web: the real checks run without a prompt, a request off the phone or a word spoken', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await setup(page);
  await page.evaluate(() => window.__mountSelfCheck('web'));
  await expect(screen(page)).toBeVisible();
  await expect(summary(page)).toHaveText(/^All \d+ ready$|need/, { timeout: 75_000 });

  // The pose engine really loaded (CPU or GPU) — without opening the camera.
  await expect(row(page, 'pose')).toHaveAttribute('data-state', 'ok');
  await expect(row(page, 'pose')).toContainText(/Loaded \((CPU|GPU)\)/);
  await expect(row(page, 'storage')).toHaveAttribute('data-state', 'ok');
  await expect(row(page, 'voice')).toContainText('1 English voice');
  await expect(row(page, 'version')).toContainText('1.15.0 (build abc1234), web app');
  for (const id of ['brain', 'speech', 'notifications', 'health']) {
    await expect(row(page, id)).toHaveAttribute('data-state', 'info');
    await expect(row(page, id)).toContainText('iPhone app only');
  }
  await expect(summary(page)).toHaveText('All 8 ready');
  expect(await getSetting(page, 'selfCheckTemp')).toBeUndefined();

  expect(await page.evaluate(() => window.__asked)).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  // MediaPipe's usage-log fetch is blocked by our CSP on purpose (Decisions, M3 privacy); that
  // block is logged as a console error. Any other console error fails the test.
  const USAGE_LOG = 'https://odml.pa.googleapis.com/v1/log';
  expect(errors.filter((e) => !e.includes(USAGE_LOG))).toEqual([]);
  await readable(page);
  await shot(page, 'selfcheck-web', (n) => testInfo.outputPath(n));
});

test('iPhone app, all ready: "All 8 ready", every row OK as a word and an icon', async ({
  page,
}, testInfo) => {
  await setup(page);
  await page.evaluate(() => window.__mountSelfCheck('native-ok'));
  await expect(summary(page)).toHaveText('All 8 ready');
  const rows = page.locator('[data-check]');
  await expect(rows).toHaveCount(9);
  for (const r of await rows.all()) {
    await expect(r.locator('svg')).toHaveCount(1);
    await expect(r.locator('.selfcheck-word')).toHaveText(/^(OK|Info)$/);
  }
  await expect(page.locator('[data-check-fix]')).toHaveCount(0);
  await readable(page);
  await shot(page, 'selfcheck-all-ok', (n) => testInfo.outputPath(n));
});

test('iPhone app, two failing: fixes shown, Run again, Copy results is plain text', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setup(page);
  await page.evaluate(() => window.__mountSelfCheck('native-two-fail'));
  await expect(summary(page)).toHaveText('2 need attention');
  await expect(row(page, 'pose')).toHaveAttribute('data-state', 'fail');
  await expect(row(page, 'pose')).toContainText('Failed');
  await expect(row(page, 'pose')).toContainText("couldn't load vision_wasm_internal.js");
  await expect(row(page, 'pose').locator('[data-check-fix]')).toContainText('fresh build');
  await expect(row(page, 'camera')).toHaveAttribute('data-state', 'warn');
  await expect(row(page, 'camera')).toContainText('Warning');
  await expect(row(page, 'camera').locator('[data-check-fix]')).toContainText(
    'iPhone Settings > Gym Clean > Camera',
  );
  await readable(page);
  await shot(page, 'selfcheck-two-fail', (n) => testInfo.outputPath(n));

  await page.locator('[data-selfcheck-copy]').click();
  await expect(page.locator('[data-selfcheck-copied]')).toHaveText(
    'Copied. Paste it in a message to yourself.',
  );
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const lines = text.split('\n');
  expect(lines.slice(0, 3)).toEqual([
    'Gym Clean self-check',
    'Version 1.15.0 (build abc1234)',
    '2 need attention',
  ]);
  expect(lines).toHaveLength(12);
  expect(text).toContain(
    "Pose engine (camera reps): Failed. couldn't load vision_wasm_internal.js",
  );
  expect(text).toContain('Camera permission: Warning. Camera is blocked.');

  await page.locator('[data-selfcheck-again]').click();
  await expect(summary(page)).toHaveText('2 need attention');
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});
