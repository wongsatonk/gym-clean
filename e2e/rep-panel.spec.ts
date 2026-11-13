// M4 task 10: the live rep panel on the camera sheet and the "Count reps out loud" setting.
// The panel is driven with recorded landmark frames (synthetic curl fixture) instead of the live
// camera, so the count is deterministic. The end-to-end camera → count → Set done flow needs
// app.ts wiring (M4 task 11) and gets its own spec there.
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = '/fixtures/landmarks/curl/synthetic-02__reps-3__partials-2.json';

async function mockSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // __speech logs speak/cancel in order, to check cancel-then-speak.
    const w = window as unknown as { __spoken: string[]; __speech: string[] };
    w.__spoken = [];
    w.__speech = [];
    const fake = {
      speak: (u: { text: string }) => {
        w.__spoken.push(u.text);
        w.__speech.push(u.text);
      },
      cancel: () => w.__speech.push('<cancel>'),
      getVoices: () => [],
      speaking: false,
      pending: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      constructor(t: string) {
        this.text = t;
      }
      addEventListener() {}
    };
  });
}

/**
 * Mounts a rep panel for the curl and feeds it every fixture frame. With `switchAt`, once that
 * many reps are counted the frame clock restarts at 0, as after a camera switch (new stream).
 */
async function runFixture(page: Page, spokenCount: boolean, switchAt = 0) {
  return page.evaluate(
    async ({ fixture, spokenCount, switchAt }) => {
      // Vite dev server serves the app's source modules; paths are strings so tsc skips them.
      type Panel = { el: HTMLElement; update(frame: unknown): void; silence(): void };
      type Rule = { limb: 'arm' | 'leg' };
      const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
      const [ui, rc, ex] = await Promise.all([
        load('/src/ui/cameraView.ts'),
        load('/src/core/repCounter.ts'),
        load('/src/core/exercises/index.ts'),
      ]);
      const createRepPanel = ui.createRepPanel as (
        c: unknown,
        limb: Rule['limb'],
        o: { spokenCount: boolean; onCount: (r: number, p: number) => void },
      ) => Panel;
      const createRepCounter = rc.createRepCounter as (r: Rule) => { reps: number };
      const ruleFor = ex.ruleFor as (id: string) => Rule | undefined;
      const rule = ruleFor('Dumbbell_Bicep_Curl');
      if (!rule) throw new Error('no curl rule');
      const counts: [number, number][] = [];
      const counter = createRepCounter(rule);
      const panel = createRepPanel(counter, rule.limb, {
        spokenCount,
        onCount: (r: number, p: number) => counts.push([r, p]),
      });
      document.body.replaceChildren(panel.el);
      const hintEl = panel.el.querySelector('.rep-hint');
      const hints: string[] = [hintEl?.textContent ?? ''];
      const frames = (await (await fetch(fixture)).json()) as { t: number }[];
      let shift = 0;
      let repsAtSwitch = -1;
      for (const f of frames) {
        if (switchAt && repsAtSwitch < 0 && counter.reps >= switchAt) {
          repsAtSwitch = counter.reps;
          shift = f.t;
        }
        panel.update({ ...f, t: f.t - shift });
        const hint = hintEl?.textContent ?? '';
        if (hint !== hints.at(-1)) hints.push(hint);
      }
      const hintAtEnd = hintEl?.textContent ?? '';
      panel.silence();
      return { counts, hints, hintAtEnd, repsAtSwitch };
    },
    { fixture: FIXTURE, spokenCount, switchAt },
  );
}

test('rep panel counts the curl fixture and speaks each rep, never partials', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSpeech(page);
  await page.goto('/');
  const { counts, hints, hintAtEnd } = await runFixture(page, true);

  // Before any frame: step into frame; then setup asks for the start position; counting clears it.
  expect(hints[0]).toBe('Step into frame');
  expect(hints).toContain('Get into start position');
  expect(hints.indexOf('')).toBeGreaterThan(hints.indexOf('Get into start position'));
  expect(hintAtEnd).toBe('');
  await expect(page.locator('[data-reps]')).toHaveAttribute('data-reps', '3');
  await expect(page.locator('[data-reps]')).toHaveText('3');
  await expect(page.locator('[data-partials]')).toHaveAttribute('data-partials', '2');
  await expect(page.locator('.rep-partials')).toHaveText('2 partials');
  // Synthetic clip films the right side; the label names the person's own right arm.
  await expect(page.locator('.rep-side')).toHaveText('Right arm');
  expect(counts.at(-1)).toEqual([3, 2]);
  const fontPx = await page
    .locator('[data-reps]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(64);

  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken).toEqual(['One', 'Two', 'Three']);
  // Cancel-then-speak: each count after the first drops any queued speech; silence() cancels the
  // last word still in flight (the fake never fires 'end').
  const speech = await page.evaluate(() => (window as unknown as { __speech: string[] }).__speech);
  expect(speech).toEqual(['One', '<cancel>', 'Two', '<cancel>', 'Three', '<cancel>']);
  expect(errors).toEqual([]);
});

test('rep panel stays silent when spoken count is off', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  await runFixture(page, false);
  await expect(page.locator('[data-reps]')).toHaveAttribute('data-reps', '3');
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken).toEqual([]);
});

test('Settings: "Count reps out loud" toggles and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const sw = page.getByRole('switch', { name: /Count reps out loud/ });
  await expect(sw).toHaveAttribute('aria-checked', 'true'); // default on
  const box = await sw.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await expect(sw).toContainText('Off');

  // The save is fire-and-forget; wait for the row so the reload can't race the IndexedDB write.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<unknown>((resolve, reject) => {
            const open = indexedDB.open('gym-clean');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const req = open.result
                .transaction('settings')
                .objectStore('settings')
                .get('spokenCount');
              req.onsuccess = () => {
                open.result.close();
                resolve((req.result as { value?: unknown } | undefined)?.value);
              };
              req.onerror = () => reject(req.error);
            };
          }),
      ),
    )
    .toBe(false);

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('switch', { name: /Count reps out loud/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('Camera test from Settings shows no rep counter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  await expect(cam.locator('.rep-panel')).toHaveCount(0);
  await expect(cam.getByRole('button', { name: 'Set done' })).toHaveCount(0);
});

test('a camera switch (frame clock restarts) keeps the counted reps', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  const { counts, repsAtSwitch } = await runFixture(page, true, 1);
  expect(repsAtSwitch).toBeGreaterThanOrEqual(1);
  // Never reported lower than before, never reset to 0 after the switch.
  for (let i = 1; i < counts.length; i++) {
    expect(counts[i]?.[0] ?? 0).toBeGreaterThanOrEqual(counts[i - 1]?.[0] ?? 0);
  }
  const final = Number(await page.locator('[data-reps]').getAttribute('data-reps'));
  expect(final).toBeGreaterThanOrEqual(repsAtSwitch);
});
