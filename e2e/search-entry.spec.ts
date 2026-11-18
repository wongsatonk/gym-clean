import { expect, test, type Page } from './fixtures';
import { guardNetwork } from './app.helpers';

/**
 * M13c task 14: the Search entry points, mounted from the real modules with made-up data (the
 * harness plays app.ts's part; main wires the Library in task 16):
 * - Today, Fuel, Calendar and Settings each show one Search button (magnifier + "Search",
 *   ≥ 56px, 20px text) when `onSearch` is passed; a tap hands the button out as the opener.
 * - Today: Start stays inside the first viewport at 390×844 and 375×667 (and 360×740).
 * - Nothing scrolls sideways; nothing is spoken (these are read with the phone in hand).
 * - Settings: every section has `id="settings-<key>"` + tabindex=-1, so a search hit can scroll
 *   to it and focus it.
 * Every test fails on a request that leaves the device.
 *
 * M13C_SHOTS=1 saves docs/screenshots/m13c-search-button-<screen>.png at 390×844.
 */

declare global {
  interface Window {
    __calls: string[];
    __spoken: string[];
  }
}

const NOW = new Date(2026, 10, 13, 18, 0).getTime(); // Fri 13 Nov 2026
const shots = !!process.env['M13C_SHOTS'];
const width = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

const offsiteBy = new WeakMap<Page, string[]>();
test.afterEach(({ page }) => {
  expect(offsiteBy.get(page) ?? [], 'requests that left the device').toEqual([]);
});

async function stubs(page: Page): Promise<void> {
  offsiteBy.set(page, await guardNetwork(page));
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__calls = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        paused: false,
        speak: (u: { text: string }) => window.__spoken.push(u.text),
        cancel: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: { request: async () => ({ release: async () => undefined }) },
    });
  });
}

type Screen = 'today' | 'fuel' | 'calendar' | 'settings';

async function mount(page: Page, screen: Screen): Promise<void> {
  await stubs(page);
  await page.goto('/');
  await expect(page.locator('main.screen').first()).toBeVisible();
  await page.evaluate(
    async ({ screen, now }) => {
      const log = (s: string) => window.__calls.push(s);
      const onSearch = (opener: HTMLElement) =>
        log(`search:${opener.hasAttribute('data-search-open') ? 'button' : opener.tagName}`);
      const noop = () => undefined;
      let el: HTMLElement;
      if (screen === 'today') {
        const today = await import('/src/ui/screens/today.ts' as string);
        const catalog = await import('/src/data/catalog.ts' as string);
        const days = catalog.program.days as { id: string; name: string }[];
        const push = days.find((d) => d.name === 'Push A') ?? days[0];
        const pull = days.find((d) => d.name === 'Pull A') ?? days[1];
        const dayAt = (i: number) => new Date(2026, 10, 9 + i).getTime();
        el = today.todayScreen(
          {
            now,
            days,
            upNextDayId: pull?.id ?? null,
            streakWeeks: 6,
            weekDots: [0, 1, 2, 3, 4, 5, 6].map((i) => ({
              dayStart: dayAt(i),
              state: i === 4 ? 'today' : i < 4 ? (i % 2 ? 'rest' : 'done') : 'future',
            })),
            last: {
              dayName: 'Legs A',
              date: new Date(2026, 10, 11, 18).getTime(),
              durationMs: 48 * 60000,
              volumeKg: 5400,
              volumeVsLast: 4,
            },
            unit: 'kg',
            // Two notices (the busiest Today): they fold into one row under the hero.
            missedDay: { date: '2026-11-10', dayId: push?.id, name: push?.name },
            readiness: {
              date: '2026-11-13',
              signals: [],
              reasons: ['Short sleep last night (5 h 40 min).'],
              offer: 'lighter',
            },
          },
          {
            onStart: (d: { id: string }) => log(`start:${d.id}`),
            onOpenDay: noop,
            onTab: noop,
            onLighterToday: noop,
            onNotToday: noop,
            onTrainAsPlanned: noop,
            onMoveMissed: noop,
            onSkipMissed: noop,
            onSearch,
          },
        );
      } else if (screen === 'fuel') {
        const fuel = await import('/src/ui/screens/fuel.ts' as string);
        el = fuel.fuelScreen(
          {
            now,
            mode: 'quick',
            targets: {
              kcal: { value: 2800, estimate: true },
              proteinG: { value: 140, estimate: true },
              carbsG: { value: 350, estimate: true },
              fatG: { value: 80, estimate: false },
            },
            totals: { kcal: 1207, proteinG: 69.3, carbsG: 95, fatG: 36 },
            entries: [],
            unit: 'kg',
            // A long weigh-in line: the widest header.
            lastWeighInKg: 102.5,
            lastWeighInSource: 'health',
          },
          {
            onLog: noop,
            onEditEntry: noop,
            onWeighIn: () => log('weigh'),
            onSetup: noop,
            onTab: noop,
            onSearch,
          },
        );
      } else if (screen === 'calendar') {
        const cal = await import('/src/ui/screens/calendar.ts' as string);
        const fx = await import('/src/ui/screens/calendarFixture.ts' as string);
        el = cal.calendarScreen(
          {
            month: fx.FIX_MONTH,
            today: fx.FIX_TODAY,
            days: fx.fixtureMonth(),
            week: fx.FIX_WEEK,
            monthScore: fx.FIX_MONTH_SCORE,
            streakWeeks: 6,
            dayName: fx.fixName,
          },
          { onPrevMonth: noop, onNextMonth: noop, onOpenDay: noop, onShare: noop, onSearch },
        );
      } else {
        const settings = await import('/src/ui/screens/settings.ts' as string);
        const slot = (attr: string) => {
          const d = document.createElement('div');
          d.setAttribute(attr, '');
          return d;
        };
        el = settings.settingsScreen(
          {
            accent: 'orange',
            background: 'glow',
            spokenCount: true,
            coachTips: true,
            handsFree: false,
            unit: 'kg',
            coachVoice: slot('data-coach-voice'),
            speakerCheck: slot('data-voice-test'),
            audioTest: slot('data-audio-test'),
            devLog: slot('data-devlog'),
            owner: false,
          },
          {
            onAccent: noop,
            onBackground: noop,
            onSpokenCount: noop,
            onCoachTips: noop,
            onHandsFree: noop,
            onUnit: noop,
            onCameraTest: noop,
            onTab: noop,
            onMyGym: noop,
            onHealth: noop,
            onReminders: noop,
            onAbout: noop,
            onSearch,
          },
        );
      }
      document.body.replaceChildren(el);
      window.scrollTo(0, 0);
    },
    { screen, now: NOW },
  );
  await expect(page.locator(`main[data-screen="${screen}"]`)).toBeVisible();
}

const SIZES = [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 360, height: 740 },
];

for (const screen of ['today', 'fuel', 'calendar', 'settings'] as const) {
  for (const vp of SIZES) {
    test(`${screen} at ${vp.width}×${vp.height}: one Search button, ≥ 56px, 20px text, no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await mount(page, screen);
      const btn = page.locator('[data-search-open]');
      await expect(btn).toHaveCount(1);
      await expect(btn).toBeInViewport({ ratio: 1 });
      await expect(btn).toHaveAccessibleName('Search');
      await expect(btn.locator('svg[data-icon="search"]')).toHaveAttribute('aria-hidden', 'true');
      const box = await btn.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(56);
      const style = await btn.evaluate((b) => {
        const s = getComputedStyle(b);
        return { size: parseFloat(s.fontSize), wrap: s.whiteSpace };
      });
      expect(style.size).toBeGreaterThanOrEqual(20);
      // One line: the label is never cut or wrapped.
      const label = btn.locator('.search-btn-label');
      expect(await label.evaluate((l) => l.scrollWidth <= l.clientWidth + 0.5)).toBe(true);
      expect(((await label.boundingBox())?.height ?? 99) < 40).toBe(true);
      expect(await width(page)).toBe(vp.width);

      if (screen === 'today') {
        const start = page.locator('main[data-screen="today"] [data-start]').first();
        await expect(start).toBeInViewport({ ratio: 1 });
        expect((await start.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
      }

      if (shots && vp.width === 390) {
        await page.screenshot({ path: `docs/screenshots/m13c-search-button-${screen}.png` });
      }

      await btn.click();
      expect(await page.evaluate(() => window.__calls)).toEqual(['search:button']);
      expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    });
  }
}

test('settings: every section is a jump target a search hit can scroll to and focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, 'settings');
  const sections = page.locator('section.set-section');
  const keys = await sections.evaluateAll((els) =>
    els.map((e) => ({
      key: e.getAttribute('data-section'),
      id: e.id,
      tabindex: e.getAttribute('tabindex'),
    })),
  );
  expect(keys.length).toBeGreaterThan(5);
  for (const k of keys) {
    expect(k.id).toBe(`settings-${k.key}`);
    expect(k.tabindex).toBe('-1');
  }
  // What app.ts will do for a "voice" hit: scroll to the section and focus it.
  const voice = page.locator('#settings-voice');
  await voice.evaluate((e) => {
    e.scrollIntoView({ block: 'start' });
    (e as HTMLElement).focus();
  });
  await expect(voice).toBeFocused();
  await expect(voice).toBeInViewport();
  // The section heading is not hidden behind the top edge.
  expect((await voice.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(await width(page)).toBe(390);
});
