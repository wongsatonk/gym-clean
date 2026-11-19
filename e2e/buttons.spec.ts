// M13d task 41 (SPEC M13d Goal 7, Decision "M13d answers"): every round icon button in the real
// app, one sweep per screen at 390×844 (dark, fixed clock, mocked speech and wake lock):
// the first run (welcome pages, Units, the intake, Set up Fuel in the flow), Today, Calendar,
// Library, Fuel + the Log food sheet, Coach, Settings, About, What's New, and a workout (Exercise,
// the Pause sheet, Rest, Summary).
//
// Every visible `[data-icon-btn]`:
// - shows its word (`.icon-btn-label`, not empty, rendered) and has an accessible name that
//   contains that word (label-in-name, WCAG 2.5.3; "Earlier: previous month, October 2026");
// - is a tap area ≥ 56px both ways; a `main` one ≥ 72px tall with a 72px circle;
// - has a round circle (border-radius 50%, as wide as tall), 56px (72px main), except the
//   workout top bar's circles (`.wtb`, 36px inside 60px hit boxes: documented in topBar.css,
//   task 40g); their hit box is still checked;
// - shows the focus ring (≥ 3px solid outline on the circle) on keyboard focus;
// - has a press transition on transform / opacity only, ≤ 200 ms (circle, its glow, the button).
// With `reducedMotion: 'reduce'` a press moves nothing (no transform on the circle or the button);
// without it the same press scales the circle (the check can see motion). Mid-set screens
// (Exercise, Rest, Summary, Pause): a press moves nothing either way. No font or icon file is
// requested after the first screen has loaded (icons are inline SVG; fonts are bundled), no
// request leaves the dev server, `expectTapTargets` passes and nothing scrolls sideways on every
// visited screen; no console errors.
//
// Deliberate exceptions (not `[data-icon-btn]`, left as they were in 1.16.2; the 56px rule still
// holds where `expectTapTargets` reaches them):
// - mid-set panels and lines: lastSetCorrection (Fix / the rep editor), autoStopBanner (Undo),
//   silentHint, coachSummary;
// - the camera sheet's top bar Close and 3D, Switch camera, the setup card's Got it;
// - Skip warm-ups (a word-only pill in the round buttons' shape, midset.css `.mid-text-pill`);
// - the Exercise weight / reps steppers (72px circles with no word, midset.css `.mid-step`);
// - segmented choices, chips, list rows, fields, the tab bar and in-text links (SPEC Goal 7).
// The workout's body / exercise-list / notes sheets (app.ts) keep their 1.16.2 buttons until
// main's task 39 remainder lands; the sweep checks whatever icon buttons they have.
//
// M13d screenshots (env-gated writers; each spec skips or no-ops its shot unless the variable is
// set; all 390×844 into docs/screenshots/):
// - ICON_BTN_SHOT=1        e2e/icon-button.spec.ts      → m13d-icon-buttons.png
// - UNIT_SWITCH_SHOT=1     e2e/unit-switch.spec.ts      → m13d-unit-switch.png
// - BUTTONS_PREVIEW_SHOT=1 e2e/buttons-preview.spec.ts  → m13d-buttons-preview-{first-run,
//                          fuel-setup,today,sheet,exercise,pressed,pressed-reduced-motion}.png
// - FUEL_SETUP_SHOT=1      e2e/fuel-setup-prefill.spec.ts → m13d-fuel-setup-prefill.png,
//                          m13d-fuel-setup-ftin.png
// - BUTTONS_AFTER_SHOT=1   e2e/first-run.spec.ts        → m13d-buttons-after-{first-run,intake,
//                          fuel-setup}.png
//                          e2e/settings-buttons.spec.ts → m13d-buttons-after-{settings,
//                          settings-lower,todos,todo-guide,whats-new,self-check}.png
//                          e2e/today-m12.spec.ts        → m13d-buttons-after-{today,today-cards}.png
// - CHROME_SHOT=1          e2e/chrome-buttons.spec.ts   → m13d-buttons-after-chrome{,-sheet,
//                          -topbar}.png
// - FUEL_BUTTONS_SHOT=1    e2e/fuel-buttons.spec.ts     → m13d-buttons-after-fuel{,-sheet,
//                          -measurements}.png
// - UNIT_PAGES_SHOT=1      e2e/units.spec.ts            → m13d-{fuel-setup,weighin,measurements}-
//                          switch.png, m13d-unit-switch-pages.png
// - UNITS_SHOT=1           e2e/units.spec.ts            → m13d-units-page.png,
//                          m13d-settings-units.png
// - MEAL_SWIPE_SHOT=1      e2e/meal-swipe.spec.ts       → m13d-meal-swipe.png
// - SWIPE_SHOT=1           e2e/swipe.spec.ts            → m13d-swipe-back.png
// - MIDSET_HITBOX_SHOTS=<dir> e2e/midset-hitboxes.spec.ts → one <screen>.png per measured screen
//   (MIDSET_HITBOX_OUT=<dir> writes that run's hit-box table, how the 1.16.2 one was made).
// Not env-gated: e2e/text-size.spec.ts always writes m13d-text-larger{,-settings}.png. The
// m13d-buttons-after-{exercise,rest,camera,summary,coach,coach-cards,demo}.png shots came from
// one-off scripts during tasks 40f-40h (no writer in e2e).
import { expect, test, type Locator, type Page, type Request } from './fixtures';
import {
  at,
  expectTapTargets,
  guardNetwork,
  installMocks,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';
import { endWorkout, openPause } from './workout.helpers';

test.use({ colorScheme: 'dark' });

const NOW = at(13, 18);

type Transition = { prop: string; ms: number };
type Sweep = {
  word: string;
  name: string;
  labelInName: boolean;
  wordShown: boolean;
  main: boolean;
  topBar: boolean;
  w: number;
  h: number;
  cw: number;
  ch: number;
  radius: string;
  focusable: boolean;
  focusVisible: boolean;
  ringStyle: string;
  ringPx: number;
  transitions: Transition[];
};

/**
 * Waits until `root` has settled. Screens that load data (Calendar, Today) render twice and
 * replace their root when the data arrives; measuring in between reads a root that is about to
 * be detached (0 buttons). Settled: a round button visible, no loading placeholder
 * (`aria-busy`) under the root, and the same root element with the same number (> 0) of
 * visible round buttons on two reads 50 ms (several frames) apart.
 */
async function settle(page: Page, root: string): Promise<void> {
  await expect(page.locator(`${root} [data-icon-btn]`).first()).toBeVisible();
  await expect(page.locator(`${root} [aria-busy="true"]`)).toHaveCount(0);
  let last: string | null = null;
  await expect
    .poll(
      async () => {
        const snap = await page.evaluate((sel) => {
          const w = window as unknown as {
            __sweepIds?: WeakMap<Element, number>;
            __sweepN?: number;
          };
          const el = document.querySelector(sel);
          if (!el) return null;
          w.__sweepIds ??= new WeakMap();
          let id = w.__sweepIds.get(el);
          if (id === undefined) {
            id = w.__sweepN = (w.__sweepN ?? 0) + 1;
            w.__sweepIds.set(el, id);
          }
          const n = [...el.querySelectorAll('[data-icon-btn]')].filter((b) =>
            b.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }),
          ).length;
          return n > 0 ? `${id}:${n}` : null;
        }, root);
        const same = snap !== null && snap === last;
        last = snap;
        return same;
      },
      { message: `${root} settles`, intervals: [50], timeout: 15_000 },
    )
    .toBe(true);
}

/**
 * Measures every visible `[data-icon-btn]` under `root` (one evaluate, on the root as it is at
 * that moment, after `settle`) and checks the Goal 7 rules on each. Keyboard modality first (one
 * Tab), so `focus()` shows the focus-visible ring exactly as a keyboard user would see it.
 * Returns the words found.
 */
async function sweep(page: Page, root: string): Promise<string[]> {
  await settle(page, root);
  await page.keyboard.press('Tab');
  let rows: Sweep[] | null = null;
  // The root is looked up inside the page, so the measure never runs on a detached element; if
  // it re-rendered away between settle and measure, settle again (bounded).
  for (let i = 0; i < 3 && rows === null; i++) {
    if (i > 0) await settle(page, root);
    rows = await page.evaluate((sel): Sweep[] | null => {
      const scope = document.querySelector(sel);
      if (!scope) return null;
      const norm = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim();
      const nameOf = (el: Element): string => {
        const by = el.getAttribute('aria-labelledby');
        if (by)
          return by
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
        return el.getAttribute('aria-label') ?? el.textContent ?? '';
      };
      const ms = (v: string) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000);
      const transitionsOf = (s: CSSStyleDeclaration): { prop: string; ms: number }[] => {
        const props = s.transitionProperty.split(',').map((p) => p.trim());
        const durs = s.transitionDuration.split(',').map((d) => ms(d.trim()));
        return props.map((prop, i) => ({ prop, ms: durs[i % durs.length] ?? 0 }));
      };
      const visible = [...scope.querySelectorAll<HTMLButtonElement>('[data-icon-btn]')].filter(
        (b) =>
          // Rendered: not display:none, not in a closed <details> (content-visibility), visible.
          b.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) &&
          !b.closest('[hidden]'),
      );
      const out = visible.map((b) => {
        const label = b.querySelector<HTMLElement>('.icon-btn-label');
        const circle = b.querySelector<HTMLElement>('.icon-btn-circle');
        const word = (label?.innerText ?? '').replace(/\s+/g, ' ').trim();
        const name = nameOf(b).replace(/\s+/g, ' ').trim();
        const r = b.getBoundingClientRect();
        const c = circle?.getBoundingClientRect();
        const cs = circle ? getComputedStyle(circle) : null;
        const focusable = !b.disabled && !b.closest('[inert]');
        let focusVisible = false;
        let ringStyle = 'none';
        let ringPx = 0;
        if (focusable && circle) {
          b.focus({ preventScroll: true });
          focusVisible = b.matches(':focus-visible');
          const f = getComputedStyle(circle);
          ringStyle = f.outlineStyle;
          ringPx = parseFloat(f.outlineWidth);
          b.blur();
        }
        return {
          word,
          name,
          labelInName: word !== '' && norm(name).includes(norm(word)),
          wordShown:
            label !== null &&
            word !== '' &&
            label.offsetWidth > 0 &&
            getComputedStyle(label).display !== 'none',
          main: b.getAttribute('data-variant') === 'main',
          topBar: b.closest('.wtb') !== null,
          w: r.width,
          h: r.height,
          cw: c?.width ?? 0,
          ch: c?.height ?? 0,
          radius: cs?.borderTopLeftRadius ?? '',
          focusable,
          focusVisible,
          ringStyle,
          ringPx,
          transitions: [
            ...transitionsOf(getComputedStyle(b)),
            ...(circle ? transitionsOf(getComputedStyle(circle)) : []),
            ...(circle ? transitionsOf(getComputedStyle(circle, '::after')) : []),
          ],
        };
      });
      (document.activeElement as HTMLElement | null)?.blur?.();
      return out.length > 0 ? out : null;
    }, root);
  }
  if (rows === null) throw new Error(`${root}: no round buttons after settling 3 times`);
  expect(rows.length, `${root}: round buttons`).toBeGreaterThan(0);
  for (const r of rows) {
    const id = `${root} "${r.word || r.name}"`;
    expect(r.wordShown, `${id} shows its word`).toBe(true);
    expect(r.name, `${id} has a name`).not.toBe('');
    expect(r.labelInName, `${id}: name "${r.name}" contains the word "${r.word}"`).toBe(true);
    expect(r.w, `${id} hit width`).toBeGreaterThanOrEqual(56);
    expect(r.h, `${id} hit height`).toBeGreaterThanOrEqual(r.main ? 72 : 56);
    // Round: a circle, as wide as tall, radius 50%.
    expect(r.radius, `${id} round`).toBe('50%');
    expect(Math.abs(r.cw - r.ch), `${id} circle`).toBeLessThanOrEqual(0.5);
    if (!r.topBar) {
      // The workout top bar's 36px circles are the documented exception (hit box checked above).
      expect(r.cw, `${id} circle size`).toBeGreaterThanOrEqual(r.main ? 71.5 : 55.5);
    }
    if (r.focusable) {
      expect(r.focusVisible, `${id} keyboard focus is focus-visible`).toBe(true);
      expect(r.ringStyle, `${id} focus ring`).toBe('solid');
      expect(r.ringPx, `${id} focus ring width`).toBeGreaterThanOrEqual(3);
    }
    for (const t of r.transitions) {
      if (t.ms <= 0) continue;
      expect(['transform', 'opacity'], `${id} transitions ${t.prop}`).toContain(t.prop);
      expect(t.ms, `${id} ${t.prop} transition`).toBeLessThanOrEqual(200);
    }
  }
  await expectTapTargets(page, root);
  await noHorizontalOverflow(page);
  return rows.map((r) => r.word);
}

/** Presses `btn` without releasing on it and reads the circle's and the button's transform. */
async function pressTransform(page: Page, btn: Locator): Promise<{ circle: string; btn: string }> {
  await btn.scrollIntoViewIfNeeded();
  const box = await btn.locator('.icon-btn-circle').boundingBox();
  if (!box) throw new Error('no circle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // The transition runs on the motion tokens (≤ 200 ms); wait past it before reading.
  await page.waitForTimeout(260);
  const t = await btn.evaluate((b) => ({
    circle: getComputedStyle(b.querySelector('.icon-btn-circle') as Element).transform,
    btn: getComputedStyle(b).transform,
    // The element read is the one held down (not a fresh copy from a re-render, which would
    // read "still" without being pressed).
    active: b.matches(':active'),
  }));
  // Leave before releasing: no click.
  await page.mouse.move(1, 1);
  await page.mouse.up();
  expect(t.active, 'the pressed button is the one measured').toBe(true);
  return { circle: t.circle, btn: t.btn };
}

const still = (t: string) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';

/**
 * Records font and icon requests made after the first screen has loaded and its fonts are in.
 * Icons are inline SVG and fonts are bundled, so none should follow.
 */
async function watchAssets(page: Page): Promise<string[]> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const late: string[] = [];
  page.on('request', (r: Request) => {
    const url = r.url();
    const type = r.resourceType();
    if (
      type === 'font' ||
      /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url) ||
      (type === 'image' && /\.svg(\?|$)|icon/i.test(url))
    )
      late.push(`${type} ${url}`);
  });
  return late;
}

test.describe('first run', () => {
  test.use({ firstRun: 'fresh' });
  test('first run: welcome pages, Units, the intake and Set up Fuel', async ({ page }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await installMocks(page);
    await page.clock.install({ time: NOW });
    await page.goto('/');
    const welcome = page.locator('[data-screen="welcome"]');
    const intake = page.locator('main[data-screen="intake"]');
    await expect(welcome).toBeVisible();
    const late = await watchAssets(page);

    // Every welcome page, the Units page among them.
    let sawUnits = false;
    for (let i = 0; i < 8 && !(await intake.isVisible()); i++) {
      await expect(welcome.locator('[data-ob="primary"]')).toBeVisible();
      if (await welcome.locator('[data-units-page]').isVisible()) sawUnits = true;
      expect(await sweep(page, '[data-screen="welcome"]')).toEqual(
        expect.arrayContaining(['Skip', 'Back']),
      );
      await welcome.locator('[data-ob="primary"]').tap();
      await expect(welcome.locator('[data-ob="primary"]').or(intake)).toBeVisible();
    }
    expect(sawUnits, 'the Units page was swept').toBe(true);
    await expect(intake).toBeVisible();

    // The intake: a question, then the summary with its rows applied.
    const pick = async (id: string, values: string[]) => {
      await expect(intake).toHaveAttribute('data-step', id);
      for (const v of values) await intake.locator(`[data-option="${v}"]`).tap();
      await intake.locator('[data-intake-next]').tap();
    };
    await pick('goal', ['fat']);
    await expect(intake).toHaveAttribute('data-step', 'days');
    await sweep(page, 'main[data-screen="intake"]');
    await pick('days', ['3']);
    await pick('length', ['45']);
    await pick('experience', ['new']);
    await pick('easyOn', []);
    await pick('wantsCore', []);
    await expect(intake).toHaveAttribute('data-step', 'summary');
    for (const id of ['plan', 'fuel']) {
      const btn = intake.locator(`[data-apply="${id}"]`);
      await btn.tap();
      await expect(btn).toHaveAttribute('data-applied', 'true');
    }
    expect(await sweep(page, 'main[data-screen="intake"]')).toEqual(
      expect.arrayContaining(['Done']),
    );
    await intake.locator('[data-intake-done]').tap();

    // Set up Fuel, a step of the flow.
    await expect(page.locator('[data-onboarding-step="fuelSetup"]')).toBeVisible();
    expect(await sweep(page, 'main[data-screen="fuel-setup"]')).toEqual(
      expect.arrayContaining(['Back', 'Save targets']),
    );

    expect(late, 'font / icon requests after load').toEqual([]);
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test("Today, Calendar, Library, Fuel + Log sheet, Coach, Settings, About, What's New", async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  const late = await watchAssets(page);

  expect(await sweep(page, 'main[data-screen="today"]')).toEqual(
    expect.arrayContaining(['Search']),
  );

  await page.locator('main[data-screen="today"] [data-search-open]').click();
  await expect(page.locator('main[data-screen="library"]')).toBeVisible();
  await sweep(page, 'main[data-screen="library"]');
  await page.locator('main[data-screen="library"] [data-library-back]').click();
  await expect(page.locator('main[data-screen="library"]')).toHaveCount(0);

  await page.locator('[data-tab="calendar"]').click();
  expect(await sweep(page, 'main[data-screen="calendar"]')).toEqual(
    expect.arrayContaining(['Earlier', 'Later']),
  );

  await page.locator('[data-tab="fuel"]').click();
  await sweep(page, 'main[data-screen="fuel"]');
  await page.locator('main[data-screen="fuel"] [data-log-open]').first().click();
  const sheet = page.locator('[data-log-sheet]');
  await expect(sheet).toBeVisible();
  expect(await sweep(page, '[data-log-sheet]')).toEqual(expect.arrayContaining(['Close']));
  await sheet.locator('[data-close]').click();
  await expect(sheet).toHaveCount(0);

  await page.locator('[data-tab="coach"]').click();
  await sweep(page, '[data-screen="coach"]');

  await page.locator('[data-tab="settings"]').click();
  await sweep(page, 'main[data-screen="settings"]');
  const aboutRow = page.locator('[data-about-open]');
  await aboutRow.scrollIntoViewIfNeeded();
  await aboutRow.click();
  await expect(page.locator('main[data-screen="about"]')).toBeVisible();
  expect(await sweep(page, 'main[data-screen="about"]')).toEqual(
    expect.arrayContaining(['Settings']),
  );
  await page.locator('main[data-screen="about"] .back-btn').click();
  await expect(page.locator('main[data-screen="settings"]')).toBeVisible();

  const wnRow = page.locator('[data-whats-new-open]');
  await wnRow.scrollIntoViewIfNeeded();
  await wnRow.click();
  const tour = page.locator('[data-tour="whats-new"]');
  await expect(tour).toBeVisible();
  await sweep(page, '[data-tour="whats-new"]');
  await tour.locator('[data-wn="skip"]').click();
  await expect(tour).toHaveCount(0);

  expect(late, 'font / icon requests after load').toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a workout: Exercise, Pause, Rest, Summary; a press moves nothing mid-set', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  const late = await watchAssets(page);
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  const ex = page.locator('main[data-screen="exercise"]');
  await expect(ex).toBeVisible();
  expect(await sweep(page, 'main[data-screen="exercise"]')).toEqual(
    expect.arrayContaining(['Set done', 'Pause']),
  );
  const setDone = ex.getByRole('button', { name: 'Set done' });
  const t1 = await pressTransform(page, setDone);
  expect(still(t1.circle) && still(t1.btn), `Exercise press ${JSON.stringify(t1)}`).toBe(true);

  await openPause(page);
  await sweep(page, '.pause-sheet');
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);

  await page.clock.runFor(30_000);
  await setDone.click();
  const rest = page.locator('[data-screen="rest"]');
  await expect(rest.locator('[data-rest-clock]')).toBeVisible();
  expect(await sweep(page, '[data-screen="rest"]')).toEqual(expect.arrayContaining(['Start set']));
  const t2 = await pressTransform(page, rest.getByRole('button', { name: 'Start set' }));
  expect(still(t2.circle) && still(t2.btn), `Rest press ${JSON.stringify(t2)}`).toBe(true);

  await endWorkout(page);
  await expect(page.locator('[data-screen="summary"]')).toBeVisible();
  expect(await sweep(page, '[data-screen="summary"]')).toEqual(expect.arrayContaining(['Done']));
  const t3 = await pressTransform(
    page,
    page.locator('[data-screen="summary"]').getByRole('button', { name: 'Done' }),
  );
  expect(still(t3.circle) && still(t3.btn), `Summary press ${JSON.stringify(t3)}`).toBe(true);

  expect(late, 'font / icon requests after load').toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

/**
 * Presses `btn` (a round button in a sheet or toast mounted on document.body, outside the
 * session tree) and expects no motion: the sheet's root carries `data-motion="off"`.
 */
async function stillInSheet(page: Page, sheet: Locator, btn: Locator, what: string) {
  await expect(sheet, `${what} is motion-off`).toHaveAttribute('data-motion', 'off');
  await expect(btn).toHaveAttribute('data-icon-btn', /.*/);
  const t = await pressTransform(page, btn);
  expect(still(t.circle) && still(t.btn), `${what} press ${JSON.stringify(t)}`).toBe(true);
}

test('sheets on the body mid-workout (How-to, effort Why?, Pause → Coach): a press moves nothing', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);

  // Proof the check can see motion: the same How-to sheet off a workout (Library → detail)
  // is not motion-off and its Close scales on a press.
  await settle(page, 'main[data-screen="today"]');
  await page.locator('main[data-screen="today"] [data-search-open]').click();
  const library = page.locator('main[data-screen="library"]');
  await expect(library).toBeVisible();
  await library.locator('[data-library-search]').fill('bench');
  await library.locator('[data-ex-open]').first().click();
  const detail = page.locator('main[data-screen="exercise-detail"]');
  await expect(detail).toBeVisible();
  await detail.locator('[data-detail-howto]').click();
  const howTo = page.locator('[data-howto="sheet"]');
  await expect(howTo).toBeVisible();
  await expect(howTo).not.toHaveAttribute('data-motion', /.*/);
  const off = await pressTransform(page, howTo.locator('[data-howto="close"]'));
  expect(off.circle).toMatch(/^matrix\(0\.92, 0, 0, 0\.92, 0, 0\)$/);
  await howTo.locator('[data-howto="close"]').click();
  await expect(howTo).toHaveCount(0);
  await detail.locator('[data-swipe-back]').click();
  await expect(library).toBeVisible();
  await library.locator('[data-library-back]').click();
  await settle(page, 'main[data-screen="today"]');

  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  const ex = page.locator('main[data-screen="exercise"]');
  await expect(ex).toBeVisible();

  // How-to from Exercise.
  await ex.locator('[data-howto-open]').click();
  await expect(howTo).toBeVisible();
  await stillInSheet(page, howTo, howTo.locator('[data-howto="close"]'), 'How-to (Exercise)');
  await howTo.locator('[data-howto="close"]').click();
  await expect(howTo).toHaveCount(0);

  // Pause → Coach: the compact chat sheet.
  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  const chat = page.getByRole('dialog', { name: 'Coach' });
  await expect(chat).toBeVisible();
  const chatClose = chat.getByRole('button', { name: 'Close' });
  await stillInSheet(page, chat, chatClose, 'Pause → Coach');
  await chatClose.click();
  await expect(chat).toHaveCount(0);
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);

  // Rest: the effort row's Why? opens the learn card.
  await page.clock.runFor(30_000);
  await ex.getByRole('button', { name: 'Set done' }).click();
  const effort = page.locator('[data-effort]');
  await expect(effort).toBeVisible();
  await effort.locator('[data-effort-why]').click();
  const card = page.locator('[data-learn-sheet="effort"]');
  await expect(card).toBeVisible();
  await stillInSheet(page, card, card.locator('[data-learn-close]'), 'effort Why? (Rest)');
  await card.locator('[data-learn-close]').click();
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

/** The 1.16.2 hit boxes (px, at 390×844) of the workout sheets' buttons: never smaller. */
const SHEET_BOXES_1162 = {
  close: { w: 96, h: 56 },
  cancel: { w: 102.5, h: 56 },
  save: { w: 358, h: 72 },
};

/**
 * Checks a workout sheet's button: its name, a hit box at least 1.16.2's, and, once it is a round
 * icon button (task 39, main), the full sweep plus no press motion (these sheets open mid-set).
 */
async function workoutSheetButton(
  page: Page,
  dialog: Locator,
  name: string,
  min: { w: number; h: number },
): Promise<void> {
  const btn = dialog.getByRole('button', { name, exact: true });
  await expect(btn).toBeVisible();
  const box = await btn.boundingBox();
  expect(box?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(min.w - 0.5);
  expect(box?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(min.h - 0.5);
  if ((await btn.getAttribute('data-icon-btn')) === null) return;
  const t = await pressTransform(page, btn);
  expect(still(t.circle) && still(t.btn), `${name} press ${JSON.stringify(t)}`).toBe(true);
}

test('workout sheets (body, exercise list, notes): names and 1.16.2 hit boxes kept', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('main[data-screen="exercise"]')).toBeVisible();
  // From Rest: the screen behind is not a motion-off one, so only the sheet can stop a press.
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();

  const sheets: {
    open: () => Promise<void>;
    label: string;
    buttons: [string, keyof typeof SHEET_BOXES_1162][];
  }[] = [
    {
      label: 'Exercise list',
      open: () => page.getByRole('button', { name: /Exercise list$/ }).click(),
      buttons: [['Close', 'close']],
    },
    {
      label: 'Notes',
      open: () => page.getByRole('button', { name: 'Notes and machine setting' }).click(),
      buttons: [
        ['Cancel', 'cancel'],
        ['Save', 'save'],
      ],
    },
    {
      label: 'Target muscles',
      open: () => page.getByRole('button', { name: 'Show target muscles in 3D' }).first().click(),
      buttons: [['Close', 'close']],
    },
  ];
  for (const sheet of sheets) {
    await sheet.open();
    const dialog = page.getByRole('dialog', { name: sheet.label });
    await expect(dialog).toBeVisible();
    const root = `[role="dialog"][aria-label="${sheet.label}"]`;
    if ((await dialog.locator('[data-icon-btn]').count()) > 0) await sweep(page, root);
    else {
      await expectTapTargets(page, root);
      await noHorizontalOverflow(page);
    }
    for (const [name, key] of sheet.buttons)
      await workoutSheetButton(page, dialog, name, SHEET_BOXES_1162[key]);
    await dialog
      .getByRole('button', { name: sheet.buttons[0]?.[0] ?? 'Close', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
  }

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe('press motion', () => {
  test('Today: a press scales the circle (≤ 200 ms) and never the whole row', async ({ page }) => {
    await openApp(page, NOW);
    await settle(page, 'main[data-screen="today"]');
    const start = page.locator('main[data-screen="today"] [data-icon-btn][data-variant="main"]');
    await expect(start.first()).toBeVisible();
    const t = await pressTransform(page, start.first());
    // scale(0.92) = matrix(0.92, 0, 0, 0.92, 0, 0).
    expect(t.circle).toMatch(/^matrix\(0\.92, 0, 0, 0\.92, 0, 0\)$/);
    expect(still(t.btn), `row ${t.btn}`).toBe(true);
  });

  test.describe('Reduce Motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('Today and a sheet: a press moves nothing, colour only', async ({ page }) => {
      await openApp(page, NOW);
      await settle(page, 'main[data-screen="today"]');
      const today = page.locator('main[data-screen="today"]');
      const main = today.locator('[data-icon-btn][data-variant="main"]').first();
      await expect(main).toBeVisible();
      for (const btn of [main, today.locator('[data-search-open]')]) {
        const t = await pressTransform(page, btn);
        expect(still(t.circle) && still(t.btn), JSON.stringify(t)).toBe(true);
      }
      await page.locator('[data-tab="fuel"]').click();
      await page.locator('main[data-screen="fuel"] [data-log-open]').first().click();
      const close = page.locator('[data-log-sheet] [data-close]');
      await expect(close).toBeVisible();
      await settle(page, '[data-log-sheet]');
      const t = await pressTransform(page, close);
      expect(still(t.circle) && still(t.btn), JSON.stringify(t)).toBe(true);
    });
  });
});
