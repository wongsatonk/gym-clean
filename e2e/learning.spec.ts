// M4f task 9/10: a camera rule that is still `learning` shows a "Learning" chip in the camera
// top band and one line on the "Set up your phone" card; its set's "Last set" Fix on Rest shows
// "Camera still learning. Fix it if it's off." None of it is spoken. A tuned rule (the curl)
// shows none of it. The fake camera is a test pattern (no person), so the setup card stays up
// and Set done saves a 0-rep camera set. One test swaps the pose model for a fixture player
// (like hands-free.spec.ts) to count a real clip; it plays on the wall clock, so this spec runs
// one test at a time (the `mobile-clips` Playwright project).
import { expect, test, type Page } from './fixtures';
import { seedHandsFreeOff } from './hands-free.helpers';
import { endWorkout } from './workout.helpers';

const CHIP_NAME = 'Learning: camera counting is new for this exercise';
const SETUP_LINE = 'Still learning: fix the count on Rest.';
const REST_LINE = "Camera still learning. Fix it if it's off.";

async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: string[] };
    w.__spoken = [];
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
          if (u.text && u.volume !== 0) w.__spoken.push(u.text); // skip the silent iOS unlock
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
  });
}

const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

/** Pull A → Start → exercise list → `name` → Camera. Returns the camera dialog. */
async function openCameraFor(page: Page, name: string) {
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  return cam;
}

test.beforeEach(async ({ page }) => {
  await installMocks(page);
  await page.goto('/');
  await seedHandsFreeOff(page); // per-set camera: Set done closes the sheet and shows Rest
});

test('learning rule (Hammer Curls): chip + setup line on the camera, note under Fix on Rest, nothing spoken', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const cam = await openCameraFor(page, 'Hammer Curls');

  // Chip in the top band, accessible name per the SPEC, on one line, ≥ 20px.
  const chip = cam.getByRole('note', { name: CHIP_NAME });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText('Learning');
  await expect(cam.locator('.cam-top [data-learning]')).toHaveCount(1);
  const chipBox = await chip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      fontPx: parseFloat(cs.fontSize),
      height: el.getBoundingClientRect().height,
      lineH: parseFloat(cs.lineHeight),
    };
  });
  expect(chipBox.fontPx).toBeGreaterThanOrEqual(20);
  expect(chipBox.height).toBeLessThan(chipBox.lineH * 1.6 + 8); // one line, not wrapped

  // The Close button keeps its one-line word next to the title.
  const close = cam.getByRole('button', { name: 'Close' });
  const closeBox = await close.evaluate((el) => ({
    h: el.getBoundingClientRect().height,
    right: el.getBoundingClientRect().right,
  }));
  expect(closeBox.h).toBeLessThan(80);
  expect(closeBox.right).toBeLessThanOrEqual(390);

  // Setup card: the learning line after the placement lines, ≥ 20px.
  const setupLine = cam.locator('.cam-setup .setup-learning');
  await expect(setupLine).toHaveText(SETUP_LINE);
  await expect(cam.locator('.cam-setup .setup-line').last()).toHaveText(SETUP_LINE);
  expect(
    await setupLine.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('learning-camera-390.png') });

  // Set done → Rest: the note under "Last set" (inside the Fix panel).
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  const fix = page.locator('[data-lsc=panel]');
  await expect(fix.locator('[data-lsc=learning]')).toHaveText(REST_LINE);
  expect(
    await fix
      .locator('[data-lsc=learning]')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  // Fix still works with the note there (one more rep than logged).
  const before = Number(await fix.getAttribute('data-reps'));
  await fix.locator('[data-lsc=fix]').click();
  await fix.locator('[data-lsc=reps-plus]').click();
  await fix.locator('[data-lsc=save]').click();
  await expect(fix).toHaveAttribute('data-reps', String(before + 1));
  await expect(fix.locator('[data-lsc=learning]')).toHaveText(REST_LINE);

  // Shown, never spoken.
  expect((await spoken(page)).filter((t) => /learning/i.test(t))).toEqual([]);
  expect(errors).toEqual([]);
});

test('tuned rule (Dumbbell Bicep Curl): no chip, no setup line, no Rest note', async ({ page }) => {
  const cam = await openCameraFor(page, 'Dumbbell Bicep Curl');
  await expect(cam.locator('.cam-setup')).toBeVisible();
  await expect(cam.locator('[data-learning]')).toHaveCount(0);
  await expect(cam.locator('.setup-learning')).toHaveCount(0);

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-lsc=panel]')).toBeVisible();
  await expect(page.locator('[data-lsc=learning]')).toHaveCount(0);
});

/** Pull A → Start → exercise list → `name` (no camera). */
async function goToExercise(page: Page, name: string): Promise<void> {
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

test('manual set on a learning exercise (Hammer Curls, camera never opened): no Rest note', async ({
  page,
}) => {
  await goToExercise(page, 'Hammer Curls');
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await expect(page.locator('[data-lsc=panel]')).toBeVisible();
  await expect(page.locator('[data-lsc=learning]')).toHaveCount(0);
});

test('a manual set after a camera set on the same learning exercise drops the Rest note', async ({
  page,
}) => {
  const cam = await openCameraFor(page, 'Hammer Curls');
  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-lsc=learning]')).toHaveText(REST_LINE);
  // Set 2 by hand, camera closed.
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.locator('[data-set-counter]')).toHaveText(/^Set 2 of/);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await expect(page.locator('[data-lsc=panel]')).toBeVisible();
  await expect(page.locator('[data-lsc=learning]')).toHaveCount(0);
});

test.describe('hands-free on (camera stays open in rest mode)', () => {
  test.beforeEach(async ({ page }) => {
    // The top-level beforeEach turned hands-free off; turn it back on (the default).
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('gym-clean');
          open.onerror = () => reject(new Error('open failed'));
          open.onsuccess = () => {
            const d = open.result;
            const tx = d.transaction('settings', 'readwrite');
            tx.objectStore('settings').put({ key: 'handsFree', value: true });
            tx.oncomplete = () => {
              d.close();
              resolve();
            };
            tx.onerror = () => reject(new Error('put failed'));
          };
        }),
    );
    await page.reload();
  });

  test('learning rule: the camera rest panel shows the note under Fix, nothing spoken', async ({
    page,
  }, testInfo) => {
    const cam = await openCameraFor(page, 'Hammer Curls');
    await cam.getByRole('button', { name: 'Set done' }).click();
    await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
    const fixSlot = cam.locator('[data-cam-rest="fix"]');
    await expect(fixSlot).toBeVisible();
    const note = fixSlot.locator('[data-lsc=learning]');
    await expect(note).toHaveText(REST_LINE);
    expect(
      await note.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBeGreaterThanOrEqual(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: testInfo.outputPath('learning-camera-rest-390.png') });
    expect((await spoken(page)).filter((t) => /learning/i.test(t))).toEqual([]);
  });

  test('tuned rule (Dumbbell Bicep Curl): no note on the camera rest panel', async ({ page }) => {
    const cam = await openCameraFor(page, 'Dumbbell Bicep Curl');
    await cam.getByRole('button', { name: 'Set done' }).click();
    await expect(cam).toHaveAttribute('data-cam-mode', 'rest');
    await expect(cam.locator('[data-cam-rest="fix"] [data-lsc=panel]')).toBeVisible();
    await expect(cam.locator('[data-lsc=learning]')).toHaveCount(0);
  });
});

// ---- Set-up card fits under a taller top band (Learning chip, long names) ----

/** Push A / Pull A → Start → exercise list → `name` → Camera, set-up card up. */
async function openCameraOn(page: Page, day: RegExp, first: string, name: string) {
  await page.getByRole('button', { name: day }).first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: first })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: name }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam.locator('.cam-setup')).toBeVisible();
  return cam;
}

for (const [day, first, name] of [
  [/Push A/, 'Dumbbell Bench Press', 'Standing Dumbbell Triceps Extension'],
  [/Pull A/, 'One-Arm Dumbbell Row', 'Hammer Curls'],
] as const) {
  test(`set-up card fully in view at 390×844, "Got it" ≥ 56px, count uncovered: ${name}`, async ({
    page,
  }, testInfo) => {
    const cam = await openCameraOn(page, day, first, name);
    await expect(cam.getByRole('note', { name: CHIP_NAME })).toBeVisible();
    const got = cam.locator('.cam-setup').getByRole('button', { name: 'Got it' });
    await expect(got).toBeInViewport({ ratio: 1 });
    // The HUD height feeds the card's max-height through a ResizeObserver: let it settle.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const card = document.querySelector<HTMLElement>('.cam-setup');
          return card ? card.scrollHeight - card.clientHeight : -1;
        }),
      )
      .toBeLessThanOrEqual(1);
    const m = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`missing ${sel}`);
        return el.getBoundingClientRect();
      };
      const card = box('.cam-setup');
      const btn = [...document.querySelectorAll('.cam-setup button')].find(
        (b) => b.textContent === 'Got it',
      );
      if (!btn) throw new Error('no Got it');
      const g = btn.getBoundingClientRect();
      return {
        cardTop: card.top,
        cardBottom: card.bottom,
        stageBottom: box('.cam-stage').bottom,
        countBottom: box('.rep-count').bottom,
        got: { top: g.top, bottom: g.bottom, h: g.height, w: g.width },
        learningBottom: box('.cam-setup .setup-learning').bottom,
        vh: innerHeight,
        scroll: document.documentElement.scrollWidth,
      };
    });
    expect(m.cardBottom).toBeLessThanOrEqual(m.vh);
    expect(m.cardBottom).toBeLessThanOrEqual(m.stageBottom);
    expect(m.got.h).toBeGreaterThanOrEqual(56);
    expect(m.got.w).toBeGreaterThanOrEqual(56);
    expect(m.got.top).toBeGreaterThanOrEqual(m.cardTop);
    expect(m.got.bottom).toBeLessThanOrEqual(m.cardBottom);
    expect(m.learningBottom).toBeLessThanOrEqual(m.cardBottom); // last line not cut
    expect(m.cardTop).toBeGreaterThanOrEqual(m.countBottom); // never over the count
    expect(m.scroll).toBe(390);
    await page.screenshot({
      path: testInfo.outputPath(`setup-card-${name.replace(/ /g, '-')}.png`),
    });
  });
}

test.describe('set-up card on a short phone (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  // Learning (chip + extra line) and tuned rules, side and front views: the whole card fits,
  // with no inner scroll, under the count and above the stage buttons.
  for (const [day, first, name, learning] of [
    [/Push A/, 'Dumbbell Bench Press', 'Standing Dumbbell Triceps Extension', true],
    [/Pull A/, 'One-Arm Dumbbell Row', 'Hammer Curls', true],
    [/Pull A/, 'One-Arm Dumbbell Row', 'Dumbbell Bicep Curl', false],
    [/Push A/, 'Dumbbell Bench Press', 'Side Lateral Raise', false],
  ] as const) {
    test(`${name}: whole card in view, no inner scroll, "Got it" ≥ 56px, count uncovered`, async ({
      page,
    }, testInfo) => {
      const cam = await openCameraOn(page, day, first, name);
      // Since M13b the card closes itself 10 s after the camera starts; on a slow runner that can
      // land mid-test. Reopen it with "Phone position", which holds it open for ≥ 8 s.
      const card = cam.locator('.cam-setup');
      if (await card.isVisible())
        await card
          .getByRole('button', { name: 'Got it' })
          .click({ timeout: 2000 })
          .catch(() => undefined);
      await cam.getByRole('button', { name: 'Phone position' }).click();
      const got = card.getByRole('button', { name: 'Got it' });
      await expect(got).toBeInViewport({ ratio: 1 });
      const line = cam.locator('[data-setup-learning]');
      if (learning) {
        await expect(line).toHaveText(SETUP_LINE);
        await expect(line).toBeInViewport({ ratio: 1 });
      } else {
        await expect(line).toHaveCount(0);
      }
      // The HUD height feeds the card's max-height through a ResizeObserver: let it settle.
      const fit = () =>
        page.evaluate(() => {
          const card = document.querySelector<HTMLElement>('.cam-setup');
          if (!card) return 'missing';
          const over = card.scrollHeight - card.clientHeight;
          if (over <= 0) return 'fits';
          // Enough to tell why on a failure (a poll timeout doesn't print the last value).
          const stage = card.parentElement;
          return JSON.stringify({
            over,
            sh: card.scrollHeight,
            ch: card.clientHeight,
            maxH: getComputedStyle(card).maxHeight,
            hud: stage ? getComputedStyle(stage).getPropertyValue('--hud-h') : '',
            stageCls: stage?.className,
            stageH: stage?.clientHeight,
          });
        });
      await expect
        .poll(fit)
        .toBe('fits')
        .catch(async () => expect(await fit()).toBe('fits'));
      const m = await page.evaluate(() => {
        const card = document.querySelector('.cam-setup')?.getBoundingClientRect();
        const count = document.querySelector('.rep-count')?.getBoundingClientRect();
        const btn = [...document.querySelectorAll('.cam-setup button')]
          .find((b) => b.textContent === 'Got it')
          ?.getBoundingClientRect();
        if (!card || !count || !btn) throw new Error('missing card parts');
        const parts = [...document.querySelectorAll('.cam-setup > *')].map((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
        const sw = document.querySelector('.cam-switch')?.getBoundingClientRect();
        const panel = document.querySelector('.rep-panel')?.getBoundingClientRect();
        if (!sw || !panel) throw new Error('missing switch or rep panel');
        const lineFont = [...document.querySelectorAll('.cam-setup .setup-line')].map((el) =>
          parseFloat(getComputedStyle(el).fontSize),
        );
        return {
          card,
          count,
          btn,
          sw,
          panel,
          parts,
          lineFont,
          stageBottom: document.querySelector('.cam-stage')?.getBoundingClientRect().bottom ?? 0,
          vh: innerHeight,
          scroll: document.documentElement.scrollWidth,
        };
      });
      expect(m.btn.height).toBeGreaterThanOrEqual(56);
      expect(m.btn.width).toBeGreaterThanOrEqual(56);
      expect(m.btn.bottom).toBeLessThanOrEqual(m.card.bottom);
      expect(m.card.top).toBeGreaterThanOrEqual(m.count.bottom); // never over the count
      expect(m.card.bottom).toBeLessThanOrEqual(Math.min(m.vh, m.stageBottom));
      for (const part of m.parts) {
        // Every line inside the card: nothing cut at either edge.
        expect(part.top).toBeGreaterThanOrEqual(m.card.top);
        expect(part.bottom).toBeLessThanOrEqual(m.card.bottom);
      }
      for (const px of m.lineFont) expect(px).toBeGreaterThanOrEqual(20);
      // The switch-camera button moved up beside the count: clear of the rep panel and the card.
      const apart = (a: DOMRect, b: DOMRect) =>
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart(m.sw, m.panel), 'switch vs rep panel').toBe(true);
      expect(apart(m.sw, m.card), 'switch vs card').toBe(true);
      expect(m.sw.height).toBeGreaterThanOrEqual(56);
      expect(m.sw.right).toBeLessThanOrEqual(375);
      expect(m.scroll).toBe(375);
      await page.screenshot({
        path: testInfo.outputPath(`setup-card-375-${name.replace(/ /g, '-')}.png`),
      });
      await got.click();
      await expect(cam.locator('.cam-setup')).toBeHidden();
    });
  }
});

// On a short phone the status line under the video hides while the set-up card is up, but never
// when it carries an error: a blocked camera or a failed model means no person is ever found, so
// the card stays up and the error must still show.
test.describe('camera errors stay visible on a short phone (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });
  const PULL_A = [/Pull A/, 'One-Arm Dumbbell Row', 'Hammer Curls'] as const;

  test('camera blocked: the "Camera blocked" line shows under the card', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });
    await page.reload();
    const cam = await openCameraOn(page, ...PULL_A);
    const status = cam.locator('.cam-status');
    await expect(status).toContainText('Camera blocked');
    await expect(status).toBeInViewport({ ratio: 1 });
    await expect(cam.locator('.cam-setup')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  });

  test('pose model fails to load: the error line shows under the card', async ({ page }) => {
    await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: 'export async function createPoseTracker() { throw new Error("no model"); }',
      }),
    );
    const cam = await openCameraOn(page, ...PULL_A);
    const status = cam.locator('.cam-status');
    await expect(status).toContainText('Pose model failed to load');
    await expect(status).toBeInViewport({ ratio: 1 });
    await expect(cam.locator('.cam-setup')).toBeVisible();
  });

  test('switch camera fails: the error line shows; a later good switch clears it', async ({
    page,
  }) => {
    // A pose model that loads at once and never finds a person: the card stays up.
    await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export async function createPoseTracker() {
          return { delegate: 'CPU', detect() { return null; }, close() {} };
        }`,
      }),
    );
    const cam = await openCameraOn(page, ...PULL_A);
    const status = cam.locator('.cam-status');
    await expect(cam).toHaveAttribute('data-delegate', /.+/); // model loaded, loop running
    await expect(status).toBeHidden(); // the fps line hides while the card is up
    await page.evaluate(() => {
      const w = window as unknown as { __realGum?: MediaDevices['getUserMedia'] };
      w.__realGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Could not start video source', 'NotReadableError'));
    });
    await cam.getByRole('button', { name: 'Switch camera' }).click();
    await expect(status).toContainText('Camera error');
    await expect(status).toBeInViewport({ ratio: 1 });
    await page.evaluate(() => {
      const w = window as unknown as { __realGum: MediaDevices['getUserMedia'] };
      navigator.mediaDevices.getUserMedia = w.__realGum;
    });
    await cam.getByRole('button', { name: 'Switch camera' }).click();
    await expect(status).toBeHidden();
  });
});

// ---- Fixture landmarker: a learning rule counts a clip; dev log carries the rule status ----

const HAMMER = '/fixtures/landmarks/hammer-curl/synthetic-01__reps-4__partials-0.json';
const ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1']);

type DevLogExport = {
  sessions: {
    sets: { exerciseId: string; reps: number; camera?: { folder: string; ruleStatus?: string } }[];
  }[];
};

/**
 * Serves a fixture player in place of src/pose/landmarker.ts. It plays `window.__fixture` once
 * (holding the last frame, so a clip is counted exactly once) after `window.__play()`; until then
 * it holds frame 0, and `window.__noPerson` returns no pose. Also keeps shared dev-log files.
 */
async function installFixtureLandmarker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __fixture: string;
      __noPerson: boolean;
      __playing: boolean;
      __play: () => void;
      __shared: File[];
    };
    w.__fixture = '';
    w.__noPerson = true;
    w.__playing = false;
    w.__play = () => {
      w.__playing = true;
    };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d?: ShareData) => Boolean(d?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        w.__shared.push(...(d.files ?? []));
      },
    });
  });
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function createPoseTracker() {
          const frames = window.__fixture ? await (await fetch(window.__fixture)).json() : [];
          let base = null;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__noPerson || !frames.length) { base = null; return null; }
              if (!window.__playing) return { ...frames[0], t };
              base ??= t;
              const i = Math.min(Math.floor((t - base) / 33.333), frames.length - 1);
              return { ...frames[i], t };
            },
            close() {},
          };
        }`,
    }),
  );
}

// M13: the developer log records only with owner mode on (a fresh install is off).
test.describe('owner mode on (dev log)', () => {
  test.use({ owner: 'on' });

  test('fixture landmarker: Hammer Curls counts 4 reps with the chip, Fix works, dev log says learning vs tuned', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    const thirdParty: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.protocol.startsWith('http') && !ORIGIN_HOSTS.has(url.hostname))
        thirdParty.push(r.url());
    });
    await installFixtureLandmarker(page);
    await page.reload(); // the route and init script apply from here

    // A tuned camera set first: Dumbbell Bicep Curl, nobody in frame, Set done (0 reps).
    const curlCam = await openCameraFor(page, 'Dumbbell Bicep Curl');
    await expect(curlCam.locator('[data-learning]')).toHaveCount(0);
    // The model is up (the camera meta reaches the dev log then).
    await expect(curlCam).toHaveAttribute('data-delegate', 'CPU', { timeout: 15_000 });
    await curlCam.getByRole('button', { name: 'Set done' }).click();
    await expect(curlCam).toHaveCount(0);
    await expect(page.locator('[data-rest-clock]')).toBeVisible();

    // Hammer Curls on the clip: the list jump lands on its rest, then Start set.
    await page.getByRole('button', { name: 'Exercise list' }).click();
    await page
      .getByRole('dialog', { name: 'Exercise list' })
      .locator('.ex-row-btn', { hasText: 'Hammer Curls' })
      .click();
    await expect(page.locator('[data-rest-clock]')).toBeVisible();
    await page.getByRole('button', { name: 'Start set' }).click();
    await expect(page.getByRole('heading', { name: 'Hammer Curls' })).toBeVisible();
    await page.evaluate((f) => {
      (window as unknown as { __fixture: string }).__fixture = f;
    }, HAMMER);
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    const cam = page.getByRole('dialog', { name: 'Camera' });
    await expect(cam).toHaveAttribute('data-delegate', 'CPU', { timeout: 15_000 });
    await expect(cam.getByRole('note', { name: CHIP_NAME })).toBeVisible();
    await expect(cam.locator('.cam-setup .setup-learning')).toHaveText(SETUP_LINE);
    await expect(cam.locator('[data-gauge]')).toHaveCount(1);
    const count = cam.locator('[data-reps]');
    await expect(count).toHaveText('0');

    // Step in (start position held), then play the clip once.
    await page.evaluate(() => {
      (window as unknown as { __noPerson: boolean }).__noPerson = false;
    });
    await expect(cam.locator('.cam-setup')).toBeHidden({ timeout: 10_000 }); // person found
    await expect(cam.locator('[data-gauge]')).toBeVisible();
    await page.evaluate(() => (window as unknown as { __play: () => void }).__play());
    await expect(count).toHaveText('4', { timeout: 30_000 });
    await page.waitForTimeout(1_500); // the last frame is held: no fifth rep
    await expect(count).toHaveText('4');
    await expect(cam.getByRole('note', { name: CHIP_NAME })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('learning-hammer-counted.png') });

    // Set done → Rest: the learning note under Fix; Fix changes the row (4 → 5).
    await cam.getByRole('button', { name: 'Set done' }).click();
    await expect(cam).toHaveCount(0);
    const fix = page.locator('[data-lsc=panel]');
    await expect(fix).toHaveAttribute('data-reps', '4');
    await expect(fix.locator('[data-lsc=learning]')).toHaveText(REST_LINE);
    await fix.locator('[data-lsc=fix]').click();
    await fix.locator('[data-lsc=reps-plus]').click();
    await fix.locator('[data-lsc=save]').click();
    await expect(fix).toHaveAttribute('data-reps', '5');

    // End → Summary → Done → Settings → Export last session (mocked share sheet).
    await endWorkout(page);
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    const panel = page.locator('[data-devlog=panel]');
    await panel.locator('[data-devlog=export-last]').click();
    await expect(panel.locator('[data-devlog=status]')).toHaveText('Shared.', { timeout: 15_000 });
    const text = await page.evaluate(async () => {
      const file = (window as unknown as { __shared: File[] }).__shared.at(-1);
      if (!file) return '';
      const stream = file.name.endsWith('.gz')
        ? file.stream().pipeThrough(new DecompressionStream('gzip'))
        : file.stream();
      return new Response(stream).text();
    });
    const sets = (JSON.parse(text) as DevLogExport).sessions[0]?.sets ?? [];
    const hammer = sets.filter((x) => x.exerciseId === 'Hammer_Curls');
    const curl = sets.filter((x) => x.exerciseId === 'Dumbbell_Bicep_Curl');
    expect(hammer).toHaveLength(1);
    expect(curl).toHaveLength(1);
    expect(hammer[0]?.camera?.folder).toBe('hammer-curl');
    expect(hammer[0]?.camera?.ruleStatus).toBe('learning');
    expect(curl[0]?.camera?.folder).toBe('curl');
    expect(curl[0]?.camera?.ruleStatus).toBe('tuned');

    // Nothing about learning is spoken; nothing leaves the device.
    expect((await spoken(page)).filter((t) => /learning/i.test(t))).toEqual([]);
    expect(thirdParty).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('small phone (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('the chip fits beside the title without wrapping Close, no horizontal overflow', async ({
    page,
  }) => {
    const cam = await openCameraFor(page, 'Hammer Curls');
    const chip = cam.getByRole('note', { name: CHIP_NAME });
    await expect(chip).toBeVisible();
    const m = await page.evaluate(() => {
      const at = (sel: string): Element => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`missing ${sel}`);
        return el;
      };
      const box = (sel: string) => at(sel).getBoundingClientRect();
      const chipEl = at('.cam-learning');
      return {
        chipH: box('.cam-learning').height,
        chipLine: parseFloat(getComputedStyle(chipEl).lineHeight),
        chipRight: box('.cam-learning').right,
        closeH: box('.cam-close').height,
        closeLeft: box('.cam-close').left,
        closeRight: box('.cam-close').right,
        scroll: document.documentElement.scrollWidth,
      };
    });
    expect(m.chipH).toBeLessThan(m.chipLine * 1.6 + 8);
    expect(m.closeH).toBeLessThan(80);
    expect(m.chipRight).toBeLessThanOrEqual(m.closeLeft);
    expect(m.closeRight).toBeLessThanOrEqual(375);
    expect(m.scroll).toBe(375);
  });
});
