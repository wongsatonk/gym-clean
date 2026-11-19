import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from './fixtures';
import { openPause, endWorkout } from './workout.helpers';

// M13d task 40g: the mid-set screens got the round-button look as styling only, so no control may
// get smaller or move away. This spec measures every button's hit box (its border box) on the
// Exercise screen (normal, warm-up, one-arm), the Pause sheet, Rest (plain and with a coach tip),
// Summary, the camera sheet (plain and one-arm) and the camera panels (rest, hold, auto stop, last-
// set fix, coach tip), at 390×844, and compares each with the 1.16.2 table in
// `midset-hitboxes.1.16.2.json` (recorded from commit 3c67c9e before the restyle): every control
// is still there under the same name, at least as wide and as tall, and starts within 24px of
// where it was. MIDSET_HITBOX_OUT=<dir> writes this run's table (how the 1.16.2 one was made).
// Fixed clock, mocked speech and wake lock.

type Box = { key: string; x: number; y: number; w: number; h: number };
type Table = Record<string, Box[]>;

const BASE_FILE = resolve(process.cwd(), 'e2e/midset-hitboxes.1.16.2.json');
const BASE: Table | null = (() => {
  try {
    return JSON.parse(readFileSync(BASE_FILE, 'utf8')) as Table;
  } catch {
    return null;
  }
})();
const MOVE_PX = 24;
/** Not a control: where the workout top bar ends, so a taller bar doesn't count as a move. */
const TOP_BAR = '(top bar bottom)';

async function installMocks(page: Page) {
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
          if (u.text && u.volume !== 0) w.__spoken.push(u.text);
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

async function boot(page: Page) {
  await installMocks(page);
  await page.clock.install({ time: new Date(2026, 10, 13, 18, 0, 0) });
  await page.goto('/');
  await page.clock.pauseAt(new Date(2026, 10, 13, 18, 0, 5));
  await expect(page.locator('.day-btn').first()).toBeVisible();
}

async function startDay(page: Page, day: RegExp, first: string) {
  await page.getByRole('button', { name: day }).first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: first })).toBeVisible();
}

/** Every rendered button in `root`: its name (aria-label, else its words) and its box at scroll 0. */
async function boxes(page: Page, root: Locator): Promise<Box[]> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(root.locator('button').first()).toBeVisible();
  return root.evaluate((el, topBarKey) => {
    const seen = new Map<string, number>();
    const buttons = [...el.querySelectorAll('button')]
      .filter((b) => b.getClientRects().length > 0 && !b.closest('[hidden]'))
      .map((b) => {
        const name = (b.getAttribute('aria-label') ?? b.textContent ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        const n = (seen.get(name) ?? 0) + 1;
        seen.set(name, n);
        const r = b.getBoundingClientRect();
        const round = (v: number) => Math.round(v * 10) / 10;
        return {
          key: n > 1 ? `${name} #${n}` : name,
          x: round(r.x),
          y: round(r.y),
          w: round(r.width),
          h: round(r.height),
        };
      });
    // The workout top bar's bottom (owned by another task): content below it may move with it.
    const bar = el.querySelector('.top-bar')?.getBoundingClientRect();
    return bar
      ? [...buttons, { key: topBarKey, x: 0, y: Math.round(bar.bottom * 10) / 10, w: 0, h: 0 }]
      : buttons;
  }, TOP_BAR);
}

/** Records `screen`'s boxes and checks them against the 1.16.2 table (when it exists). */
async function check(page: Page, screen: string, root: Locator, table: Table) {
  const now = await boxes(page, root);
  table[screen] = now;
  const shots = process.env.MIDSET_HITBOX_SHOTS;
  if (shots) await page.screenshot({ path: resolve(shots, `${screen}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth), `${screen} width`).toBe(
    390,
  );
  const before = BASE?.[screen];
  if (!BASE) return;
  const barShift =
    (now.find((n) => n.key === TOP_BAR)?.y ?? 0) - (before?.find((b) => b.key === TOP_BAR)?.y ?? 0);
  expect(before, `${screen}: in the 1.16.2 table`).toBeDefined();
  for (const b of before ?? []) {
    const a = now.find((n) => n.key === b.key);
    expect.soft(a, `${screen}: "${b.key}" still there`).toBeDefined();
    if (!a) continue;
    expect.soft(a.w, `${screen}: "${b.key}" width`).toBeGreaterThanOrEqual(b.w - 0.5);
    expect.soft(a.h, `${screen}: "${b.key}" height`).toBeGreaterThanOrEqual(b.h - 0.5);
    expect.soft(Math.abs(a.x - b.x), `${screen}: "${b.key}" left`).toBeLessThanOrEqual(MOVE_PX);
    const dy = Math.min(Math.abs(a.y - b.y), Math.abs(a.y - barShift - b.y));
    expect.soft(dy, `${screen}: "${b.key}" top`).toBeLessThanOrEqual(MOVE_PX);
  }
  // Nothing new to tap.
  for (const a of now)
    expect
      .soft(
        before?.some((b) => b.key === a.key),
        `${screen}: "${a.key}" is not new`,
      )
      .toBe(true);
}

function save(name: string, table: Table) {
  const dir = process.env.MIDSET_HITBOX_OUT;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, `${name}.json`), JSON.stringify(table, null, 1));
}

test('Exercise, Pause, Rest (plain and coach tip) and Summary keep their 1.16.2 hit boxes', async ({
  page,
}) => {
  const table: Table = {};
  await boot(page);
  await startDay(page, /Push A/, 'Dumbbell Bench Press');
  const main = page.locator('main.screen');
  await check(page, 'exercise', main, table);

  // The Set done dock never covers the weight stepper (follow-up r): its top is below the
  // −/+ circles once scrolled to them.
  await page.evaluate(() => window.scrollTo(0, 0));
  const plus = page.getByRole('button', { name: /^kg plus$|^lb plus$/ });
  await plus.scrollIntoViewIfNeeded();
  const dock = await page.locator('main .sticky-bottom').boundingBox();
  const pb = await plus.boundingBox();
  if (!dock || !pb) throw new Error('no dock or plus');
  expect(dock.y, 'Set done dock clear of the weight stepper').toBeGreaterThanOrEqual(
    pb.y + pb.height,
  );

  await openPause(page);
  const sheet = page.getByRole('dialog', { name: 'Paused' });
  await check(page, 'pause', sheet, table);
  await sheet.getByRole('button', { name: 'End workout' }).click();
  await check(page, 'pause-armed', sheet, table);
  await sheet.getByRole('button', { name: 'Resume' }).click();
  await expect(sheet).toHaveCount(0);

  for (let i = 0; i < 2; i++) {
    await page.clock.runFor(30_000);
    await page.getByRole('button', { name: 'Set done' }).click();
    await expect(page.locator('[data-rest-clock]')).toBeVisible();
    if (i === 0) {
      await check(page, 'rest', main, table);
      await page.clock.runFor(5_000);
      await page.getByRole('button', { name: 'Start set' }).click();
    }
  }
  await expect(page.locator('[data-coach-tip]')).toBeVisible();
  await check(page, 'rest-tip', main, table);

  await endWorkout(page);
  await check(page, 'summary', main, table);
  save('main', table);
});

test.describe('warm-ups on', () => {
  test.use({ warmups: 'default' });
  test('a warm-up set keeps Skip warm-ups and the rest of the Exercise screen', async ({
    page,
  }) => {
    const table: Table = {};
    await boot(page);
    await startDay(page, /Push A/, 'Dumbbell Bench Press');
    await expect(page.locator('[data-warmup]')).toBeVisible();
    await check(page, 'exercise-warmup', page.locator('main.screen'), table);
    save('warmup', table);
  });
});

test('one-arm row: Next arm, then Set done with the side line', async ({ page }) => {
  const table: Table = {};
  await boot(page);
  await startDay(page, /Pull A/, 'One-Arm Dumbbell Row');
  const main = page.locator('main.screen');
  await check(page, 'exercise-one-arm-first', main, table);
  await page.clock.runFor(20_000);
  await page.getByRole('button', { name: 'Next arm' }).click();
  await expect(page.locator('[data-side-done]')).toBeVisible();
  await check(page, 'exercise-one-arm-second', main, table);
  save('one-arm', table);
});

/** Mounts the camera view (not started: no model needed) for `exerciseId`. */
async function mountCamera(page: Page, exerciseId: string, title: string) {
  await page.evaluate(
    async ({ exerciseId, title }) => {
      const ui = (await import('/src/ui/cameraView.ts' as string)) as {
        createCameraView(o: unknown): { el: HTMLElement; setSession(s: unknown): void };
      };
      const view = ui.createCameraView({
        title,
        exerciseId,
        onClose() {},
        onSetDone() {},
        onNextSide() {},
        speakPlacement: false,
        target: { setNumber: 1, sets: 4, targetReps: 12, minReps: 8 },
      });
      document.body.append(view.el);
      (window as unknown as { __view: typeof view }).__view = view;
    },
    { exerciseId, title },
  );
}

test('camera sheet: plain, one-arm first side', async ({ page }) => {
  const table: Table = {};
  await boot(page);
  await mountCamera(page, 'Dumbbell_Bicep_Curl', 'Dumbbell Bicep Curl');
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  await check(page, 'camera', cam, table);
  await page.evaluate(() => {
    const v = (window as unknown as { __view: { el: HTMLElement } }).__view;
    v.el.remove();
  });
  await mountCamera(page, 'One-Arm_Dumbbell_Row', 'One-Arm Dumbbell Row');
  await page.evaluate(() =>
    (window as unknown as { __view: { setSession(s: unknown): void } }).__view.setSession({
      phase: 'exercise',
      paused: false,
      restElapsedMs: 0,
      sideTurn: 'first',
    }),
  );
  await expect(cam.getByRole('button', { name: 'Next arm' })).toBeVisible();
  await check(page, 'camera-one-arm-first', cam, table);
  save('camera', table);
});

test('camera panels in the sheet: rest (with fix open and a coach tip), hold, auto stop', async ({
  page,
}) => {
  const table: Table = {};
  await boot(page);
  await mountCamera(page, 'Dumbbell_Bench_Press', 'Dumbbell Bench Press');
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  // Each panel alone in the sheet's stage, where the camera view puts it.
  const mount = (kind: string) =>
    page.evaluate(async (kind) => {
      const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
      const stage = document.querySelector('.cam-stage');
      if (!stage) throw new Error('no stage');
      stage.querySelector('[data-midset-panel]')?.remove();
      type El = { el: HTMLElement };
      let el: HTMLElement;
      if (kind === 'rest') {
        const rest = await load('/src/ui/cameraRestPanel.ts');
        const fix = await load('/src/ui/lastSetCorrection.ts');
        const tip = await load('/src/ui/coachTip.ts');
        const panel = (
          rest.createCameraRestPanel as (o: unknown) => El & { update(u: unknown): void }
        )({ onStartSet() {}, onClose() {} });
        panel.update({
          restMs: 30_000,
          nextLine: 'Next: set 2 of 4',
          coachTipEl: (tip.createCoachTip as (o: unknown) => El)({
            advice: {
              rule: 'r',
              text: 'Strong set. Try +2.5 kg next set.',
              why: '',
              apply: { weightKg: 17.5 },
            },
            unit: 'kg',
            onApply() {},
          }).el,
          fixEl: (fix.createLastSetCorrection as (o: unknown) => El)({
            reps: 9,
            partials: 1,
            onCorrect() {},
          }).el,
        });
        el = panel.el;
      } else if (kind === 'hold') {
        const hold = await load('/src/ui/holdPanel.ts');
        el = (hold.createHoldPanel as (o: unknown) => El)({
          reps: 8,
          partials: 1,
          lastSet: false,
          onContinue() {},
          onNext() {},
        }).el;
      } else {
        const stop = await load('/src/ui/autoStopBanner.ts');
        el = (stop.createAutoStopBanner as (o: unknown) => El)({
          reps: 8,
          partials: 0,
          seconds: 5,
          onUndo() {},
        }).el;
      }
      el.setAttribute('data-midset-panel', kind);
      stage.append(el);
    }, kind);

  await mount('rest');
  await check(page, 'panel-rest', cam, table);
  await cam.getByRole('button', { name: 'Fix', exact: true }).click();
  await expect(cam.locator('[data-lsc="editor"]')).toBeVisible();
  await check(page, 'panel-rest-fix-open', cam, table);
  await mount('hold');
  await check(page, 'panel-hold', cam, table);
  await mount('stop');
  await check(page, 'panel-stop', cam, table);
  save('panels', table);
});
