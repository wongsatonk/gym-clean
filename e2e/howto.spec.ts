import { expect, test, type Page } from './fixtures';

// M4b (S9): Demo / Info / Camera badges and the "How to" sheet with the 3D demo.

async function installMocks(page: Page) {
  await page.addInitScript(() => {
    // EventTarget: voice.ts listens for end/error on each utterance.
    class FakeUtterance extends EventTarget {
      text: string;
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
      value: { speak: () => undefined, cancel: () => undefined, getVoices: () => [] },
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

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

const PUSH_A = [
  ['Dumbbell Bench Press', false],
  ['Incline Dumbbell Press', false],
  ['Seated Dumbbell Press', true],
  ['Side Lateral Raise', true],
  ['Standing Dumbbell Triceps Extension', true],
  ['Pushups', true],
] as const;

const hasWebGL = (page: Page) =>
  page.evaluate(() => {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  });

/**
 * The badges are static labels, not controls (so the 56px tap-target rule doesn't apply): plain
 * spans, not inside a button or link of their own, no pointer cursor, not focusable. The How-to
 * sheet opens from its own ≥ 56px button. (In the exercise-list sheet they sit inside the whole
 * row's button, which is the tap target; that is checked by the list's own tests.)
 */
async function expectStaticBadges(page: Page, scope: string) {
  const badges = page.locator(`${scope} [data-badge]`);
  await expect(badges.first()).toBeVisible();
  const found = await badges.evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent,
      tag: el.tagName,
      control: el.closest('button, a, [role="button"], [role="link"], [tabindex]') !== null,
      pointer: getComputedStyle(el).cursor === 'pointer',
    })),
  );
  expect(found.length).toBeGreaterThan(0);
  for (const b of found) {
    expect(b, `badge "${b.text}"`).toEqual({
      text: b.text,
      tag: 'SPAN',
      control: false,
      pointer: false,
    });
  }
}

test('badges: Push A has six 3D demos, Camera on the tracked four (M4f adds Triceps Extension, still Learning); Pull A and Legs B all 3D demo', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await installMocks(page);
  await page.goto('/');

  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  const rows = page.locator('.ex-row');
  await expect(rows).toHaveCount(6);
  for (const [i, [name, camera]] of PUSH_A.entries()) {
    const row = rows.nth(i);
    await expect(row).toContainText(name);
    await expect(row.locator('[data-badge="3d"]')).toHaveText('3D demo');
    await expect(row.locator('[data-badge="info"]')).toHaveCount(0);
    await expect(row.locator('[data-badge="camera"]')).toHaveCount(camera ? 1 : 0);
  }
  // M4f: only the new wave-1 rule is still learning.
  await expect(page.locator('.ex-row [data-badge="learning"]')).toHaveCount(1);
  await expect(
    rows
      .filter({ hasText: 'Standing Dumbbell Triceps Extension' })
      .locator('[data-badge="learning"]'),
  ).toHaveText('Learning');
  const fontPx = await rows
    .first()
    .locator('[data-badge="3d"]')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(20);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  // M13c goal 4: on the preview (nothing started yet) each badge is its own ≥ 56px button that
  // opens its sheet (badges.spec.ts); the pill inside keeps its word. Mid-set they stay static
  // (the Exercise screen check below).
  const pills = await page.locator('.ex-row [data-badge]').evaluateAll((els) =>
    els.map((el) => {
      const btn = el.closest('button');
      return {
        inBadgeButton: btn?.hasAttribute('data-badge-open') ?? false,
        tall: (btn?.getBoundingClientRect().height ?? 0) >= 56,
      };
    }),
  );
  expect(pills.length).toBeGreaterThan(0);
  for (const p of pills) expect(p).toEqual({ inBadgeButton: true, tall: true });

  // Legs B preview (M4d batch 2): every row, Leg Press included, has a 3D demo and no Camera.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: /Legs B/ })
    .first()
    .click();
  const legPress = page.locator('.ex-row', { hasText: 'Leg Press' });
  await expect(legPress.locator('[data-badge="3d"]')).toHaveText('3D demo');
  await expect(legPress.locator('[data-badge="camera"]')).toHaveCount(0);
  await expect(page.locator('.ex-row [data-badge="info"]')).toHaveCount(0);

  // Pull A in-session list: every exercise has a 3D demo (M4d); the manual ones no Camera.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  for (const name of ['Reverse Flyes', 'Wide-Grip Lat Pulldown']) {
    const row = list.locator('.ex-row-btn', { hasText: name });
    await expect(row.locator('[data-badge]')).toHaveText(['3D demo']);
  }
  await expect(list.locator('[data-badge="info"]')).toHaveCount(0);
  // The pose-tracked curl has a 3D demo (M4d) + Camera.
  const curl = list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' });
  await expect(curl.locator('[data-badge]')).toHaveText(['3D demo', 'Camera']);
  // M4f wave 1: Hammer Curls is camera-tracked and still learning.
  const hammer = list.locator('.ex-row-btn', { hasText: 'Hammer Curls' });
  await expect(hammer.locator('[data-badge]')).toHaveText(['3D demo', 'Camera', 'Learning']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  expect(errors).toEqual([]);
});

test('How to: the 3D demo loops with phase text, Close returns focus', async ({ page }) => {
  const errors = watchErrors(page);
  await installMocks(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.locator('.exercise-head-text [data-badge="3d"]')).toBeVisible();
  await expectStaticBadges(page, '.exercise-head-text');

  const open = page.locator('[data-howto-open]');
  // The How-to control is the button, and it meets the tap-target rule.
  const openBox = await open.boundingBox();
  expect(openBox?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(openBox?.width ?? 0).toBeGreaterThanOrEqual(56);
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Dumbbell Bench Press' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-howto=close]')).toBeFocused();
  await expect(sheet.locator('[data-howto=tempo]')).toHaveText('Lift 1 s · Lower 2 s');
  const lines = sheet.locator('[data-howto=lines] li');
  expect(await lines.count()).toBeGreaterThanOrEqual(2);
  // In a workout the How-to opens with More already expanded: the focus line is on screen with
  // nothing new to tap mid-set (M13d review decision).
  await expect(sheet.locator('[data-more="howto"] [data-more-btn]')).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(sheet.locator('[data-howto=focus]')).toBeVisible();
  await expect(sheet.locator('[data-howto=focus]')).toContainText('Focus:');
  await expect(sheet.locator('[data-howto=cue]')).not.toBeEmpty();
  // M4e A19 roles: the spoken cue is the lavender cue panel with a speaker icon; the focus line
  // is plain text beside a cyan dot; badges sit on the neutral surface-2 (not white, not amber).
  await expect(sheet.locator('[data-howto=cue].cue-panel [data-icon="speaker"]')).toHaveCount(1);
  await expect(sheet.locator('[data-howto=focus] .swatch-dot')).toHaveCount(1);
  const roles = await sheet.evaluate((el) => {
    const css = (sel: string, prop: string) =>
      getComputedStyle(el.querySelector(sel) as Element).getPropertyValue(prop);
    const probe = (v: string) => {
      const d = document.createElement('i');
      d.style.color = `var(${v})`;
      el.append(d);
      const c = getComputedStyle(d).color;
      d.remove();
      return c;
    };
    return {
      cueBar: css('[data-howto=cue]', 'border-left-color') === probe('--cue'),
      focusText: css('[data-howto=focus]', 'color') === probe('--text'),
      badges: [...el.querySelectorAll('.ex-badge')].every(
        (b) => getComputedStyle(b).backgroundColor === probe('--surface-2'),
      ),
    };
  });
  expect(roles).toEqual({ cueBar: true, focusText: true, badges: true });

  const stage = sheet.locator('[data-howto=stage]');
  if (await hasWebGL(page)) {
    await expect(stage).toHaveAttribute('data-mode', '3d', { timeout: 15_000 });
    await expect(stage.locator('canvas')).toBeVisible();
    // The loop is 3.8 s: within ~5 s the phase text shows more than one phase.
    const phase = sheet.locator('[data-howto=phase]');
    const seen = new Set<string>();
    await expect
      .poll(
        async () => {
          seen.add((await phase.textContent()) ?? '');
          return [...seen].filter((p) => ['Lift', 'Lower', 'Hold'].includes(p)).length;
        },
        { timeout: 6_000, intervals: [100] },
      )
      .toBeGreaterThanOrEqual(2);
    const px = await phase.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(28);
  } else {
    // No WebGL in this browser: the sheet falls back to the muscle map.
    await expect(stage).toHaveAttribute('data-mode', 'map');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  await sheet.locator('[data-howto=close]').click();
  await expect(page.locator('[data-howto=sheet]')).toHaveCount(0);
  await expect(open).toBeFocused();

  expect(errors).toEqual([]);
});

test('How to: reduced motion starts the demo paused on the start pose', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installMocks(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.locator('[data-howto-open]').click();
  const sheet = page.locator('[data-howto=sheet]');
  const stage = sheet.locator('[data-howto=stage]');
  test.skip(!(await hasWebGL(page)), 'no WebGL: the muscle map has no motion to test');
  await expect(stage).toHaveAttribute('data-mode', '3d', { timeout: 15_000 });

  await expect(sheet.locator('.demo3d-play')).toHaveText('Play');
  const phase = sheet.locator('[data-howto=phase]');
  const first = await phase.textContent();
  await page.waitForTimeout(2_000); // longer than a lift or a pause
  await expect(phase).toHaveText(first ?? '');
  await expect(sheet.locator('.demo3d-play')).toHaveText('Play');

  // Play still works when asked for.
  await sheet.locator('.demo3d-play').click();
  await expect(sheet.locator('.demo3d-play')).toHaveText('Pause');

  expect(errors).toEqual([]);
});
