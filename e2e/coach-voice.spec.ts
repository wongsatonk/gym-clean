// Drill-sergeant coach voice (design 2026-11-13): Settings → "Coach voice". Speech is mocked and
// records each utterance with its voice, rate and pitch; getVoices() returns window.__cvVoices.
// The live count part replaces the pose model with a fixture player (like hands-free.spec.ts).
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

const CURL = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';

type Said = { text: string; voice: string | null; rate: number; pitch: number; lang: string };
type FakeVoice = { name: string; lang: string; default: boolean; localService: boolean };

/** Test hooks on window. Own names (no global Window augmentation: other specs declare __said). */
type CvWindow = Window & {
  __cvSaid: Said[];
  __cvVoices: FakeVoice[];
  __cvFreezeAt: number | null;
};

const MALE: FakeVoice[] = [
  { name: 'Samantha', lang: 'en-US', default: true, localService: true },
  { name: 'Daniel', lang: 'en-GB', default: false, localService: true },
  { name: 'Fred', lang: 'en-US', default: false, localService: true },
];

async function installMocks(page: Page, voices: FakeVoice[]): Promise<void> {
  await page.addInitScript((voices) => {
    const w = window as unknown as CvWindow;
    w.__cvSaid = [];
    w.__cvVoices = voices;
    w.__cvFreezeAt = 0;
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: FakeVoice | null = null;
      constructor(text: string) {
        super();
        this.text = text;
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      value: FakeUtterance,
      configurable: true,
    });
    const synth = new EventTarget();
    Object.assign(synth, {
      speak: (u: FakeUtterance) => {
        if (u.volume === 0) return; // the silent iOS unlock
        w.__cvSaid.push({
          text: u.text,
          voice: u.voice?.name ?? null,
          rate: u.rate,
          pitch: u.pitch,
          lang: u.lang,
        });
        setTimeout(() => u.dispatchEvent(new Event('end')), 300);
      },
      cancel: () => undefined,
      resume: () => undefined,
      getVoices: () => w.__cvVoices,
      speaking: false,
      pending: false,
      paused: false,
    });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({
          addEventListener: () => undefined,
          release: async () => undefined,
        }),
      },
    });
  }, voices);
  await page.route(/\/src\/pose\/landmarker\.ts/, (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function createPoseTracker() {
          const frames = await (await fetch(${JSON.stringify(CURL)})).json();
          let base = null;
          return {
            delegate: 'CPU',
            detect(_video, t) {
              if (window.__cvFreezeAt != null) { base = null; return { ...frames[window.__cvFreezeAt], t }; }
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

function watch(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const said = (page: Page) => page.evaluate(() => (window as unknown as CvWindow).__cvSaid);

/** The persona's variants for a calm line, from the app's own module. */
function variants(page: Page, calm: string, kind: string, level: number): Promise<string[]> {
  return page.evaluate(
    async ({ calm, kind, level }) => {
      const p = '/src/core/personas.ts';
      const m = (await import(p)) as {
        drillVariants: (c: string, k: string, l: number) => string[];
      };
      return m.drillVariants(calm, kind, level);
    },
    { calm, kind, level },
  );
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  const section = page.locator('[data-coach-voice]');
  await expect(section.getByRole('heading', { name: 'Coach voice' })).toBeVisible();
  return section;
}

const pressed = (loc: ReturnType<Page['locator']>) =>
  expect(loc).toHaveAttribute('aria-pressed', 'true');

test('Drill → Savage → Fred: Test voice speaks a Savage line in Fred, faster and lower; survives a reload', async ({
  page,
}) => {
  const errors = watch(page);
  await installMocks(page, MALE);
  await page.goto('/');
  let cv = await openSettings(page);

  // Calm by default: no rudeness, no picker; Test voice speaks the calm line in the default voice.
  await pressed(cv.locator('[data-coach-persona="calm"]'));
  await expect(cv.locator('[data-rudeness]')).toHaveCount(0);
  await cv.getByRole('button', { name: 'Test voice' }).click();
  await expect
    .poll(() => said(page))
    .toEqual([{ text: 'Keep going.', voice: null, rate: 1, pitch: 1, lang: 'en-US' }]);

  await cv.getByRole('button', { name: 'Drill sergeant' }).click();
  cv = page.locator('[data-coach-voice]');
  await pressed(cv.locator('[data-coach-persona="drill"]'));
  await pressed(cv.locator('[data-rudeness="2"]')); // Rude is the default level
  await cv.getByRole('button', { name: 'Savage' }).click();
  await pressed(cv.locator('[data-rudeness="3"]'));
  await expect(cv.locator('[data-strong-language]')).toHaveClass(/cv-note-on/);
  // Picker: Automatic (Daniel, the default order's first) then the installed male voices only.
  await expect(cv.locator('[data-voice-name]')).toHaveText([
    'Automatic: Daniel',
    'Daniel (UK)',
    'Fred (US)',
  ]);
  await cv.locator('[data-voice-name="Fred"]').click();
  await pressed(cv.locator('[data-voice-name="Fred"]'));

  // Gym rules on the section: 56 px targets, 20 px text, no sideways scroll.
  const sizes = await cv.evaluate((el) => ({
    minBtn: Math.min(
      ...[...el.querySelectorAll('button')].map((b) => b.getBoundingClientRect().height),
    ),
    minFont: Math.min(
      ...[...el.querySelectorAll('button, p, h2')].map((x) =>
        parseFloat(getComputedStyle(x).fontSize),
      ),
    ),
  }));
  expect(sizes.minBtn).toBeGreaterThanOrEqual(56);
  expect(sizes.minFont).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await cv.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('coach-voice-drill-savage.png') });

  await page.evaluate(() => ((window as unknown as CvWindow).__cvSaid = []));
  await cv.getByRole('button', { name: 'Test voice' }).click();
  const savage = await variants(page, 'Keep going.', 'cue', 3);
  expect(savage.length).toBeGreaterThan(0);
  await expect.poll(async () => (await said(page)).length).toBe(1);
  const [test1] = await said(page);
  expect(savage).toContain(test1?.text);
  expect(test1?.voice).toBe('Fred');
  expect(test1?.lang).toBe('en-US');
  expect(test1?.rate).toBeCloseTo(1.15);
  expect(test1?.pitch).toBeCloseTo(0.8);

  // Saved: after a reload the same choices are shown and used.
  await page.reload();
  cv = await openSettings(page);
  await pressed(cv.locator('[data-coach-persona="drill"]'));
  await pressed(cv.locator('[data-rudeness="3"]'));
  await pressed(cv.locator('[data-voice-name="Fred"]'));
  await cv.getByRole('button', { name: 'Test voice' }).click();
  await expect.poll(async () => (await said(page)).at(-1)?.voice).toBe('Fred');
  expect(savage).toContain((await said(page)).at(-1)?.text);
  expect(errors).toEqual([]);
});

test('no male voice installed: the picker shows how to add one in iOS', async ({ page }) => {
  const errors = watch(page);
  await installMocks(page, [
    { name: 'Samantha', lang: 'en-US', default: true, localService: true },
  ]);
  await page.goto('/');
  const cv = await openSettings(page);
  await cv.getByRole('button', { name: 'Drill sergeant' }).click();
  const hint = page.locator('[data-coach-voice] [data-no-male-voice]');
  await expect(hint).toBeVisible();
  await expect(hint).toContainText('Settings → Accessibility → Spoken Content → Voices → English');
  await expect(page.locator('[data-coach-voice] [data-voice-name]')).toHaveCount(0);
  // Test voice still speaks, in the only English voice, with the drill delivery.
  await page.locator('[data-coach-voice]').getByRole('button', { name: 'Test voice' }).click();
  await expect.poll(async () => (await said(page)).at(-1)?.voice).toBe('Samantha');
  expect((await said(page)).at(-1)?.rate).toBeCloseTo(1.15);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect(errors).toEqual([]);
});

test('drill on: live rep counts stay plain numbers; hints are rewritten', async ({ page }) => {
  const errors = watch(page);
  await installMocks(page, MALE);
  await page.goto('/');
  const cv = await openSettings(page);
  await cv.getByRole('button', { name: 'Drill sergeant' }).click();
  await page.locator('[data-coach-voice] [data-rudeness="3"]').click();
  await page.getByRole('button', { name: /Back/ }).click();

  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  await page
    .getByRole('dialog', { name: 'Exercise list' })
    .locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' })
    .click();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 30_000 });

  await page.evaluate(() => {
    const w = window as unknown as CvWindow;
    w.__cvSaid = [];
    w.__cvFreezeAt = null; // play the clip: 3 reps, 2 partials
  });
  await expect(cam.locator('.rep-num[data-reps]')).toHaveAttribute('data-reps', '3', {
    timeout: 40_000,
  });
  await page.evaluate(() => ((window as unknown as CvWindow).__cvFreezeAt = 0));

  const list = await said(page);
  const counts = list.filter((s) => ['One', 'Two', 'Three'].includes(s.text));
  expect(counts.map((s) => s.text)).toEqual(['One', 'Two', 'Three']);
  for (const c of counts) {
    expect(c.voice).toBe('Daniel'); // Automatic: the default order's first
    expect(c.rate).toBeCloseTo(1.15);
  }
  // The partial hint is spoken in the drill sergeant's words, never the calm line.
  const hints = await variants(page, 'Curl higher.', 'hint', 3);
  const hintSaid = list.filter((s) => hints.includes(s.text));
  expect(hintSaid.length).toBeGreaterThan(0);
  expect(list.map((s) => s.text)).not.toContain('Curl higher.');
  expect(errors).toEqual([]);
});
