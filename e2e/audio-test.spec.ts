import { expect, test, type Page } from '@playwright/test';

/**
 * Settings → Voice → "Audio test (for music)" (src/ui/audioTest.ts), mounted from the real module.
 * speechSynthesis, AudioContext and navigator.audioSession are fakes that log what played and
 * which session type was set at that moment; the camera is Chromium's fake device.
 */

type Box = { x: number; y: number; width: number; height: number };

declare global {
  interface Window {
    __log: string[];
    __streams: MediaStream[];
    __audioTest: { el: HTMLElement; dispose(): void } | null;
  }
}

async function installFakes(page: Page, withAudioSession: boolean): Promise<void> {
  await page.addInitScript((withSession: boolean) => {
    window.__log = [];
    window.__streams = [];
    const log = (s: string) => window.__log.push(s);
    const sessionType = () =>
      (navigator as unknown as { audioSession?: { type: string } }).audioSession?.type ?? 'none';

    if (withSession) {
      let type = 'auto';
      Object.defineProperty(navigator, 'audioSession', {
        configurable: true,
        value: {
          get type() {
            return type;
          },
          set type(v: string) {
            type = v;
            log(`type=${v}`);
          },
        },
      });
    }

    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        paused: false,
        speak: (u: SpeechSynthesisUtterance) => {
          if (u.volume === 0) return; // silent unlock
          log(`speak:${u.text}@${sessionType()}`);
          setTimeout(() => {
            u.dispatchEvent(new Event('start'));
            u.dispatchEvent(new Event('end'));
          }, 10);
        },
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
      },
    });

    class FakeParam {
      value = 0;
      setValueAtTime() {}
      linearRampToValueAtTime() {}
    }
    class FakeAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      constructor() {
        log('ctx:new');
      }
      resume() {
        this.state = 'running';
        log(`ctx:resume@${sessionType()}`);
        return Promise.resolve();
      }
      suspend() {
        this.state = 'suspended';
        log('ctx:suspend');
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        log('ctx:close');
        return Promise.resolve();
      }
      createGain() {
        return { gain: new FakeParam(), connect: (n: unknown) => n };
      }
      createOscillator() {
        const osc = {
          type: 'sine',
          frequency: new FakeParam(),
          connect: (n: unknown) => n,
          start: () => log(`beep:${osc.frequency.value}@${sessionType()}`),
          stop: () => undefined,
        };
        return osc;
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });

    const md = navigator.mediaDevices;
    const real = md.getUserMedia.bind(md);
    md.getUserMedia = async (c?: MediaStreamConstraints) => {
      log(`gum:audio=${String(c?.audio)}`);
      const s = await real(c);
      window.__streams.push(s);
      return s;
    };
  }, withAudioSession);
}

/** Mounts the panel in a Settings-like screen; returns requests that left the dev server. */
async function mount(page: Page): Promise<string[]> {
  const thirdParty: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== 'localhost' && !r.url().startsWith('data:') && !r.url().startsWith('blob:'))
      thirdParty.push(r.url());
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const mod = (await import('/src/ui/audioTest.ts' as string)) as {
      createAudioTest(): { el: HTMLElement; dispose(): void };
    };
    const handle = mod.createAudioTest();
    window.__audioTest = handle;
    const screen = document.createElement('main');
    screen.className = 'screen settings';
    const label = document.createElement('p');
    label.className = 'field-label';
    label.textContent = 'Voice';
    screen.append(label, handle.el);
    document.body.replaceChildren(screen);
  });
  return thirdParty;
}

const liveTracks = (page: Page) =>
  page.evaluate(
    () =>
      window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length,
  );

test('Audio test: chosen session type is set before each play; camera stops on off and dispose', async ({
  page,
}, info) => {
  await installFakes(page, true);
  await page.clock.install();
  const thirdParty = await mount(page);
  const panel = page.locator('[data-audio-test]');
  const status = page.locator('[data-audio-status]');

  // Collapsed by default; the summary is a big tap target.
  const summary = panel.locator('summary');
  await expect(summary).toHaveText('Audio test (for music)');
  expect(((await summary.boundingBox()) as Box).height).toBeGreaterThanOrEqual(56);
  await expect(page.getByRole('button', { name: 'Speak a phrase' })).toBeHidden();
  await summary.click();
  await expect(
    panel.getByText(
      'Play music in another app, then try each button. Note: paused, quieter, or plays over it.',
    ),
  ).toBeVisible();
  await expect(status).toHaveText('Session: auto. Played: nothing yet. Camera: off.');

  // Speech under 'ambient'.
  await panel.getByRole('button', { name: 'ambient', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'ambient', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(panel.getByText(/ambient: should mix/)).toBeVisible();
  await page.getByRole('button', { name: 'Speak a phrase' }).click();
  await page.clock.runFor(50);
  await expect(status).toHaveText('Session: ambient. Played: speech (done). Camera: off.');

  // Beep under 'transient': type set, then the context resumed, then both tones.
  await panel.getByRole('button', { name: 'transient', exact: true }).click();
  await page.getByRole('button', { name: 'Play a beep' }).click();
  await expect(status).toHaveText('Session: transient. Played: beep. Camera: off.');
  // The context is suspended after the beep so the session can end.
  await page.clock.runFor(1000);

  // Second beep under 'transient-solo' reuses the one AudioContext.
  await panel.getByRole('button', { name: 'transient-solo' }).click();
  await page.getByRole('button', { name: 'Play a beep' }).click();

  expect(await page.evaluate(() => window.__log)).toEqual([
    'type=ambient',
    'speak:Twelve. Slow the lowering.@ambient',
    'type=transient',
    'ctx:new',
    'ctx:resume@transient',
    'beep:880@transient',
    'beep:1320@transient',
    'ctx:suspend',
    'type=transient-solo',
    'ctx:resume@transient-solo',
    'beep:880@transient-solo',
    'beep:1320@transient-solo',
  ]);

  // Camera: video only, a live preview, tracks stopped on off.
  const cam = page.locator('[data-audio-camera]');
  await cam.click();
  await expect(status).toHaveText(/Camera: on\.$/);
  await expect(cam).toHaveText('Camera off');
  await expect(page.locator('.audio-test-preview')).toBeVisible();
  expect(await liveTracks(page)).toBe(1);
  expect(await page.evaluate(() => window.__log.filter((l) => l.startsWith('gum:')))).toEqual([
    'gum:audio=false',
  ]);

  // Readable at 2 m, no sideways scroll, big targets.
  for (const sel of [
    '.audio-test-note',
    '.audio-test-status',
    '.audio-seg-btn',
    '.audio-test-btn',
  ]) {
    const sizes = await page
      .locator(sel)
      .evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).fontSize)));
    for (const s of sizes) expect(s, sel).toBeGreaterThanOrEqual(20);
  }
  for (const b of await panel.getByRole('button').all()) {
    expect(((await b.boundingBox()) as Box).height).toBeGreaterThanOrEqual(56);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: info.outputPath('audio-test-390x844.png'), fullPage: true });

  await cam.click();
  await expect(cam).toHaveText('Camera on');
  await expect(status).toHaveText(/Camera: off\.$/);
  expect(await liveTracks(page)).toBe(0);

  // On again, then leave Settings: dispose stops the camera, closes the context, type → auto.
  await cam.click();
  await expect(status).toHaveText(/Camera: on\.$/);
  expect(await liveTracks(page)).toBe(1);
  await page.evaluate(() => window.__audioTest?.dispose());
  expect(await liveTracks(page)).toBe(0);
  const tail = await page.evaluate(() => window.__log.slice(-2));
  expect(tail).toEqual(['ctx:close', 'type=auto']);
  expect(
    await page.evaluate(
      () => (navigator as unknown as { audioSession: { type: string } }).audioSession.type,
    ),
  ).toBe('auto');

  expect(thirdParty).toEqual([]);
});

test('Audio test: closing the section stops the camera', async ({ page }) => {
  await installFakes(page, true);
  await mount(page);
  const summary = page.locator('[data-audio-test] summary');
  await summary.click();
  await page.locator('[data-audio-camera]').click();
  await expect(page.locator('[data-audio-status]')).toHaveText(/Camera: on\.$/);
  expect(await liveTracks(page)).toBe(1);
  await summary.click();
  await expect.poll(() => liveTracks(page)).toBe(0);
  await expect(page.locator('[data-audio-status]')).toHaveText(/Camera: off\.$/);
});

test('Audio test without navigator.audioSession: a note instead of the choice, buttons still play', async ({
  page,
}) => {
  await installFakes(page, false);
  const thirdParty = await mount(page);
  await page.locator('[data-audio-test] summary').click();
  await expect(page.locator('[data-audio-unsupported]')).toHaveText(/not supported/);
  await expect(page.locator('[data-session-type]')).toHaveCount(0);
  await expect(page.locator('[data-audio-status]')).toHaveText(
    'Session: not supported. Played: nothing yet. Camera: off.',
  );
  await page.getByRole('button', { name: 'Speak a phrase' }).click();
  await page.getByRole('button', { name: 'Play a beep' }).click();
  await expect(page.locator('[data-audio-status]')).toHaveText(/Played: beep\./);
  const log = await page.evaluate(() => window.__log);
  expect(log).toContain('speak:Twelve. Slow the lowering.@none');
  expect(log).toContain('beep:880@none');
  expect(log.some((l) => l.startsWith('type='))).toBe(false);
  // Dispose with no audioSession is a no-op that doesn't throw.
  await page.evaluate(() => window.__audioTest?.dispose());
  expect(thirdParty).toEqual([]);
});
