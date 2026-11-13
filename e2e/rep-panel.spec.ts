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
    // Utterances only "end" when the test says so (__endSpeech), like a real voice finishing.
    const live: { ends: (() => void)[] }[] = [];
    (window as unknown as { __endSpeech: () => void }).__endSpeech = () => {
      for (const u of live.splice(0)) for (const f of u.ends) f();
    };
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      ends: (() => void)[] = [];
      constructor(t: string) {
        this.text = t;
        live.push(this);
      }
      addEventListener(type: string, f: () => void) {
        if (type === 'end') this.ends.push(f);
      }
    };
  });
}

/**
 * Mounts a rep panel for the curl and feeds it every fixture frame. With `switchAt`, once that
 * many reps are counted the frame clock restarts at 0, as after a camera switch (new stream).
 */
async function runFixture(page: Page, spokenCount: boolean, switchAt = 0, speechMs = 0) {
  return page.evaluate(
    async ({ fixture, spokenCount, switchAt, speechMs }) => {
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
        o: {
          spokenCount: boolean;
          onCount: (r: number, p: number) => void;
          clock: () => number;
          onSpeech: (e: { text: string; kind: string; dropped?: string }) => void;
        },
      ) => Panel;
      const createRepCounter = rc.createRepCounter as (r: Rule) => { reps: number };
      const ruleFor = ex.ruleFor as (id: string) => Rule | undefined;
      const rule = ruleFor('Dumbbell_Bicep_Curl');
      if (!rule) throw new Error('no curl rule');
      const counts: [number, number][] = [];
      const reports: { text: string; kind: string; dropped?: string }[] = [];
      const coachShown: string[] = [];
      const counter = createRepCounter(rule);
      // The speech policy runs on the fixture's own clock (monotonic, never shifted).
      let clockMs = 0;
      const endSpeech = (window as unknown as { __endSpeech: () => void }).__endSpeech;
      let speechStarted = -1;
      const panel = createRepPanel(counter, rule.limb, {
        spokenCount,
        onCount: (r: number, p: number) => counts.push([r, p]),
        clock: () => clockMs,
        onSpeech: (e) => {
          reports.push({
            text: e.text,
            kind: e.kind,
            ...(e.dropped ? { dropped: e.dropped } : {}),
          });
          if (!e.dropped) speechStarted = clockMs;
        },
      });
      document.body.replaceChildren(panel.el);
      const hintEl = panel.el.querySelector('.rep-hint');
      const hints: string[] = [hintEl?.textContent ?? ''];
      const frames = (await (await fetch(fixture)).json()) as { t: number }[];
      let shift = 0;
      let repsAtSwitch = -1;
      const coachEl = panel.el.querySelector('.rep-coach');
      for (const f of frames) {
        clockMs = f.t;
        // Each utterance lasts speechMs of fixture time (0 = never ends by itself).
        if (speechMs > 0 && speechStarted >= 0 && clockMs - speechStarted >= speechMs) {
          speechStarted = -1;
          endSpeech();
        }
        if (switchAt && repsAtSwitch < 0 && counter.reps >= switchAt) {
          repsAtSwitch = counter.reps;
          shift = f.t;
        }
        panel.update({ ...f, t: f.t - shift });
        const hint = hintEl?.textContent ?? '';
        if (hint !== hints.at(-1)) hints.push(hint);
        const c = coachEl?.textContent
          ? `${coachEl.textContent}|${(coachEl as HTMLElement).dataset.hintReason ?? ''}`
          : '';
        if (c && c !== coachShown.at(-1)) coachShown.push(c);
        if (!c && coachShown.at(-1)) coachShown.push('');
      }
      const hintAtEnd = hintEl?.textContent ?? '';
      panel.silence();
      return { counts, hints, hintAtEnd, repsAtSwitch, reports, coachShown };
    },
    { fixture: FIXTURE, spokenCount, switchAt, speechMs },
  );
}

test('rep panel counts the curl fixture, speaks each rep and the partial hint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSpeech(page);
  await page.goto('/');
  // Each utterance takes 0.8 s of fixture time.
  const { counts, hints, hintAtEnd, reports, coachShown } = await runFixture(page, true, 0, 800);

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

  // Both partials stop short of the top: "Curl higher." is shown each time (reason far), and
  // cleared by the next full rep.
  expect(coachShown).toEqual(['Curl higher.|far', '', 'Curl higher.|far', '']);
  // Spoken: every count, the first hint; the second hint falls inside the 6 s hint gap.
  expect(reports).toEqual([
    { text: 'One', kind: 'count' },
    { text: 'Curl higher.', kind: 'hint' },
    { text: 'Two', kind: 'count' },
    { text: 'Curl higher.', kind: 'hint', dropped: 'rate' },
    { text: 'Three', kind: 'count' },
  ]);
  const speech = await page.evaluate(() => (window as unknown as { __speech: string[] }).__speech);
  expect(speech).toEqual(['One', 'Curl higher.', 'Two', 'Three']);
  expect(errors).toEqual([]);
});

test('a hint never starts over a count; counts always speak (cancel-then-speak)', async ({
  page,
}) => {
  await mockSpeech(page);
  await page.goto('/');
  // The voice never reports 'end': a hint waits behind the count, then is dropped as stale.
  const { reports } = await runFixture(page, true, 0, 0);
  expect(reports.filter((r) => r.kind === 'count').map((r) => r.text)).toEqual([
    'One',
    'Two',
    'Three',
  ]);
  expect(reports.filter((r) => r.kind === 'hint')).toEqual([
    { text: 'Curl higher.', kind: 'hint', dropped: 'stale' },
    { text: 'Curl higher.', kind: 'hint', dropped: 'stale' },
  ]);
  // A cancel only ever comes right before a count word, or from silence() at the end.
  const speech = await page.evaluate(() => (window as unknown as { __speech: string[] }).__speech);
  expect(speech).toEqual(['One', 'Two', '<cancel>', 'Three', '<cancel>']);
});

test('spoken count off: no count words, hints still spoken', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  await runFixture(page, false, 0, 800);
  await expect(page.locator('[data-reps]')).toHaveAttribute('data-reps', '3');
  const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
  expect(spoken).toEqual(['Curl higher.']);
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

test('voice holds every in-flight utterance until it ends (no GC before end on iOS)', async ({
  page,
}) => {
  await mockSpeech(page);
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const mod = (await import('/src/ui/voice.ts' as string)) as {
      voice: { speak(t: string, o?: unknown): unknown; cancel(): void; readonly inFlight: number };
    };
    const { voice } = mod;
    voice.cancel();
    voice.speak('Curl higher.', { kind: 'hint' });
    voice.speak('Sit deeper.', { kind: 'hint' });
    const queued = voice.inFlight;
    (window as unknown as { __endSpeech: () => void }).__endSpeech();
    const afterEnd = voice.inFlight;
    voice.speak('One', { kind: 'count' });
    voice.speak('Two', { kind: 'count', cancel: true });
    const afterCancel = voice.inFlight;
    return { queued, afterEnd, afterCancel };
  });
  expect(sizes).toEqual({ queued: 2, afterEnd: 0, afterCancel: 1 });
});
