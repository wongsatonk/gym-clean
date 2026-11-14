import { expect, test, type Page } from '@playwright/test';

/**
 * M4e A17: the Settings screen (src/ui/screens/settings.ts) and the accent picker, mounted from
 * the real modules with the real coach voice, audio test and developer log parts. The harness
 * plays app.ts's part (A18): a picked accent goes to `applyAccent` and the screen re-renders.
 * Settings speaks nothing itself; the Speaker check / Test voice speech is covered by
 * coach-voice.spec.ts and audio-test.spec.ts.
 */

declare global {
  interface Window {
    __calls: string[];
  }
}

async function mount(page: Page, accent = 'orange'): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        paused: false,
        speak: () => undefined,
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
      },
    });
  });
  await page.goto('/');
  await page.evaluate(async (start: string) => {
    type Accent = 'orange' | 'volt' | 'yellow';
    type Unit = 'kg' | 'lb';
    const settings = await import('/src/ui/screens/settings.ts' as string);
    const tokens = await import('/src/ui/tokens.ts' as string);
    const cv = await import('/src/ui/coachVoiceSettings.ts' as string);
    const audio = await import('/src/ui/audioTest.ts' as string);
    const devlog = await import('/src/ui/devLogPanel.ts' as string);
    window.__calls = [];
    const state = {
      accent: start as Accent,
      spokenCount: true,
      coachTips: true,
      handsFree: false,
      unit: 'kg' as Unit,
      voice: { persona: 'drill', rudeness: 2, voiceName: null },
    };
    const coach = cv.createCoachVoiceSettings({
      value: state.voice,
      voices: [],
      onChange: () => undefined,
      onTest: () => undefined,
    });
    const panel = devlog.createDevLogPanel({
      db: null,
      api: {
        getEnabled: async () => true,
        setEnabled: async () => undefined,
        stats: async () => ({ bytes: 6.4 * 1024 * 1024, sessions: 3 }),
        exportFile: async () => new File([''], 'x.json'),
        clear: async () => undefined,
      },
    });
    void panel.refresh();
    const speaker = document.createElement('div');
    speaker.className = 'voice-test';
    speaker.innerHTML =
      '<button class="ghost-btn wide-btn" data-voice-test>Speaker check</button>' +
      '<p class="muted">No sound? Turn Silent mode off and the volume up.</p>';
    tokens.applyAccent(state.accent);
    const render = () => {
      const el = settings.settingsScreen(
        {
          accent: state.accent,
          spokenCount: state.spokenCount,
          coachTips: state.coachTips,
          handsFree: state.handsFree,
          unit: state.unit,
          coachVoice: coach.el,
          speakerCheck: speaker,
          audioTest: audio.audioTestPanel(),
          devLog: panel.el,
        },
        {
          onAccent: (a: Accent) => {
            window.__calls.push(`accent:${a}`);
            state.accent = a;
            tokens.applyAccent(a);
            render();
          },
          onSpokenCount: (on: boolean) => {
            window.__calls.push(`spoken:${on}`);
            state.spokenCount = on;
            render();
          },
          onCoachTips: (on: boolean) => {
            window.__calls.push(`tips:${on}`);
            state.coachTips = on;
            render();
          },
          onHandsFree: (on: boolean) => {
            window.__calls.push(`handsFree:${on}`);
            state.handsFree = on;
            render();
          },
          onUnit: (u: Unit) => {
            window.__calls.push(`unit:${u}`);
            state.unit = u;
            render();
          },
          onCameraTest: () => window.__calls.push('camera'),
          onTab: (t: string) => window.__calls.push(`tab:${t}`),
        },
      );
      document.body.replaceChildren(el);
    };
    render();
  }, accent);
  await expect(page.locator('main.settings')).toBeVisible();
}

const calls = (page: Page) => page.evaluate(() => window.__calls);
const varOf = (page: Page, name: string) =>
  page.evaluate(
    (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(),
    name,
  );

test('Settings at 390×844: readable, big targets, no overflow, chosen states in white', async ({
  page,
}) => {
  await mount(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  // Every visible button is a ≥ 56px target (the tab bar's are 72).
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, summary')]
      .map((b) => ({ t: (b.textContent ?? '').trim(), r: b.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && (x.r.height < 56 || x.r.width < 56))
      .map((x) => `${x.t} ${x.r.width}×${x.r.height}`),
  );
  expect(small).toEqual([]);

  // Reading text ≥ 20px; only the tab labels use the 18px label bend (next to an icon).
  const tinyText = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll('main.settings *')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own || (el as HTMLElement).offsetParent === null) continue;
      if (el.closest('.tab')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 20) out.push(`${el.className || el.tagName}: ${px}`);
    }
    return out;
  });
  expect(tinyText).toEqual([]);

  // Chosen accent and unit: white fill, dark text, a check; the switches say On/Off.
  const selected = await varOf(page, '--selected');
  const chosen = page.locator('[data-accent-option="orange"]');
  await expect(chosen).toHaveAttribute('aria-pressed', 'true');
  await expect(chosen.locator('[data-icon="check"]')).toHaveCount(1);
  const fill = await chosen.evaluate((el) => getComputedStyle(el).backgroundColor);
  const probe = await page.evaluate((c) => {
    const d = document.createElement('div');
    d.style.background = c;
    document.body.append(d);
    const v = getComputedStyle(d).backgroundColor;
    d.remove();
    return v;
  }, selected);
  expect(fill).toBe(probe);
  await expect(page.getByRole('button', { name: 'kg', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('[data-setting="spoken-count"] .switch-state')).toHaveText('On');
  await expect(page.locator('[data-setting="hands-free"] .switch-state')).toHaveText('Off');
  // The accessible name stays the label (the On/Off word is aria-hidden).
  await expect(page.getByRole('switch', { name: 'Hands-free sets', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  // The hooks other specs use are all here.
  for (const sel of [
    '[data-coach-voice]',
    '.voice-test:has([data-voice-test]) + [data-audio-test]',
    '[data-devlog=panel]',
    '[data-tab="today"]',
  ])
    await expect(page.locator(sel), sel).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Camera test' })).toBeVisible();
  await expect(page.getByRole('button', { name: '‹ Back' })).toHaveCount(0);
});

test('Accent: Volt swaps the action colour and success to gold; Yellow keeps green', async ({
  page,
}) => {
  await mount(page);
  const green = await varOf(page, '--success');
  await page.locator('[data-accent-option="volt"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'volt');
  await expect(page.locator('[data-accent-option="volt"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-accent-option="orange"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(await varOf(page, '--cta')).toBe('#c8f31d');
  expect(await varOf(page, '--success')).toBe('#ffc94d');

  // Tapping the chosen one again does nothing.
  await page.locator('[data-accent-option="volt"]').click();
  await page.locator('[data-accent-option="yellow"]').click();
  expect(await varOf(page, '--cta')).toBe('#ffd60a');
  expect(await varOf(page, '--success')).toBe(green);
  expect(await calls(page)).toEqual(['accent:volt', 'accent:yellow']);

  // The active tab marker follows the accent.
  const bar = await page
    .locator('[data-tab="settings"]')
    .evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
  expect(bar).toBe('rgb(255, 214, 10)');
});

test('Switches, unit, Camera test and the Today tab report through their callbacks', async ({
  page,
}) => {
  await mount(page, 'volt');
  const spoken = page.getByRole('switch', { name: 'Count reps out loud' });
  await spoken.click();
  await expect(spoken).toHaveAttribute('aria-checked', 'false');
  await expect(spoken.locator('.switch-state')).toHaveText('Off');
  await page.getByRole('switch', { name: 'Hands-free sets' }).click();
  await expect(page.locator('[data-setting="hands-free"] .switch-state')).toHaveText('On');
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await expect(page.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('main.settings')).toContainText('Weights step by 5 lb.');
  await page.getByRole('button', { name: 'Camera test' }).click();
  await page.locator('[data-tab="today"]').click();
  expect(await calls(page)).toEqual([
    'spoken:false',
    'handsFree:true',
    'unit:lb',
    'camera',
    'tab:today',
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
