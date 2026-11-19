// M13d task 21 (SPEC M13d Goal 4, Decision "M13d answers" q4): Settings → Display → Text size.
//
// Part 1, Larger on <html> directly (an init script keeps html[data-text-size="larger"] whatever
// the app sets, so these don't depend on main's task 22 wiring), the real app at 390×844:
// - Today: no sideways scroll, Start wholly in the first viewport (M13 rule), the five tab labels
//   at their Standard 18px and not clipped, no clipped words; nothing spoken.
// - Fuel and Settings: no sideways scroll, no clipped words, body text really larger (24px).
// - A fresh install's first run (welcome pages, Units, each intake question): no sideways scroll,
//   no clipped words.
// - Workout screens: Exercise and Rest keep their main numbers at Standard size, unclipped, with
//   Set done in view; no sideways scroll.
// - The measure pages with their unit switch (task 13c): Set up Fuel (label row + the two 56px
//   switches, Height in ft·in), the weigh-in and Measurements: no sideways scroll, nothing
//   clipped, each switch and label row inside the screen.
// Part 2, Settings → Display → Larger (task 22): html[data-text-size] flips at once, 'textSize' is
// stored, a reload keeps it, Standard puts it back. index.html's pre-paint script sets
// html[data-text-size] from the localStorage mirror before main.ts runs.
//
// Screenshots: docs/screenshots/m13d-text-larger.png (Today) and m13d-text-larger-settings.png.
import { expect, test, type Page } from './fixtures';
import { animationsSettled, at, getSetting, guardNetwork, openApp, record } from './app.helpers';

const NOW = at(13, 18);

/** Keeps html[data-text-size] at `size` from the first script on, whatever the app sets. */
async function forceTextSize(page: Page, size: 'large' | 'larger') {
  await page.addInitScript((s) => {
    const onHtml = new MutationObserver(() => force());
    let watched: Element | null = null;
    function force() {
      const el = document.documentElement;
      if (!el) return;
      if (el.getAttribute('data-text-size') !== s) el.setAttribute('data-text-size', s);
      if (watched !== el) {
        watched = el;
        onHtml.observe(el, { attributes: true, attributeFilter: ['data-text-size'] });
      }
    }
    // The init script can run before <html> exists: watch the document for it.
    new MutationObserver(force).observe(document, { childList: true });
    force();
  }, size);
}

const scrollWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

/**
 * Visible block-level text boxes under `rootSel` whose content is wider than their box (a word
 * pushed out or cut off). Boxes that scroll sideways on purpose (chip rows, the week strip) and
 * hidden / decorative ones are left out.
 */
async function clippedText(page: Page, rootSel: string): Promise<string[]> {
  return page
    .locator(rootSel)
    .first()
    .evaluate((root) => {
      const out: string[] = [];
      const sel = 'button, a, h1, h2, h3, p, label, li, [role="radio"], [role="switch"], span, div';
      for (const el of root.querySelectorAll<HTMLElement>(sel)) {
        if (!el.getClientRects().length) continue;
        if (el.closest('[aria-hidden="true"], .sr-only, svg')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility !== 'visible' || cs.display === 'inline' || cs.display === 'contents')
          continue;
        if (/auto|scroll/.test(cs.overflowX)) continue;
        // Only boxes that hold text of their own (a wrapper's overflow is its child's).
        const ownText = [...el.childNodes].some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        // Buttons count even when their words sit in an inline span.
        if (!ownText && !el.matches('button, a, [role="radio"], [role="switch"]')) continue;
        if (el.scrollWidth > el.clientWidth + 1)
          out.push(
            `${el.tagName.toLowerCase()} "${(el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)}" ${el.scrollWidth} > ${el.clientWidth}`,
          );
      }
      return out;
    });
}

const fontPx = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

test.describe('Text size Larger (html attribute set directly)', () => {
  test('Today: Start in the first viewport, tab labels at 18px in full, nothing clipped', async ({
    page,
  }) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await forceTextSize(page, 'larger');
    await openApp(page, NOW);
    await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
    // The body token really moved (24px), the number tokens did not.
    expect(
      await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return ['--fs-body', '--fs-cue', '--fs-lead', '--fs-label', '--fs-num', '--fs-timer'].map(
          (t) => cs.getPropertyValue(t).trim(),
        );
      }),
    ).toEqual(['24px', '26px', '30px', '22px', '72px', '132px']);

    const start = page.locator('main[data-screen="today"] [data-start]').first();
    await expect(start).toBeInViewport({ ratio: 1 });
    await expect
      .poll(async () => (await start.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(56);
    const labels = page.locator('[data-tabbar] .tab-label');
    await expect(labels).toHaveText(['Today', 'Fuel', 'Coach', 'Calendar', 'Settings']);
    for (const px of await labels.evaluateAll((els) =>
      els.map((e) => parseFloat(getComputedStyle(e).fontSize)),
    ))
      expect(px).toBe(18);
    expect(
      await labels.evaluateAll((els) =>
        els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent),
      ),
    ).toEqual([]);
    expect(await clippedText(page, 'main[data-screen="today"]')).toEqual([]);
    expect(await scrollWidth(page)).toBe(390);
    await animationsSettled(page);
    await page.screenshot({ path: 'docs/screenshots/m13d-text-larger.png' });
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(errors).toEqual([]);
    expect(offsite).toEqual([]);
  });

  for (const [size, bodyPx] of [
    ['large', 22],
    ['larger', 24],
  ] as const)
    test(`Fuel and Settings at ${size}: no sideways scroll, nothing clipped, body text at ${bodyPx}px`, async ({
      page,
    }) => {
      const { errors } = record(page);
      await forceTextSize(page, size);
      await openApp(page, NOW);

      await page.locator('[data-tab="fuel"]').tap();
      const fuel = page.locator('main[data-screen="fuel"]');
      await expect(fuel).toBeVisible();
      expect(await clippedText(page, 'main[data-screen="fuel"]')).toEqual([]);
      expect(await scrollWidth(page)).toBe(390);

      await page.locator('[data-tab="settings"]').tap();
      const settings = page.locator('main[data-screen="settings"]');
      await expect(settings).toBeVisible();
      expect(await fontPx(page, 'main[data-screen="settings"] .set-note')).toBe(bodyPx);
      expect(await clippedText(page, 'main[data-screen="settings"]')).toEqual([]);
      // The chosen accent and background keep their whole check mark (never colour alone).
      const width = (sel: string) =>
        page
          .locator(sel)
          .first()
          .evaluate((e) => e.getBoundingClientRect().width);
      expect(await width('[data-background-option="glow"] svg')).toBeGreaterThanOrEqual(17.5);
      expect(await width('.accent-opt.on .accent-swatch')).toBeGreaterThanOrEqual(25.5);
      expect(await scrollWidth(page)).toBe(390);
      await animationsSettled(page);
      if (size === 'larger')
        await page.screenshot({ path: 'docs/screenshots/m13d-text-larger-settings.png' });
      // Down the whole screen: still nothing sideways.
      await page.locator('[data-section="about"]').scrollIntoViewIfNeeded();
      expect(await scrollWidth(page)).toBe(390);
      expect(await page.evaluate(() => window.__spoken)).toEqual([]);
      expect(errors).toEqual([]);
    });

  test('Exercise and Rest: main numbers keep their size, unclipped; Set done in view', async ({
    page,
  }) => {
    const { errors } = record(page);
    await forceTextSize(page, 'larger');
    await openApp(page, NOW);
    // Today's Start opens the preview; its Start begins the workout.
    await page.locator('main[data-screen="today"] [data-start]').first().click();
    await page.getByRole('button', { name: 'Start workout' }).click();
    await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
    const reps = page.getByLabel('Reps', { exact: true });
    const kg = page.getByLabel('kg', { exact: true });
    await expect(reps).toBeVisible();
    for (const n of [reps, kg]) {
      const box = await n.evaluate((el) => ({
        fs: parseFloat(getComputedStyle(el).fontSize),
        over: el.scrollWidth > el.clientWidth + 1,
      }));
      expect(box.fs).toBeGreaterThanOrEqual(54); // the documented stepper exception
      expect(box.over).toBe(false);
    }
    await expect(page.getByRole('button', { name: 'Set done' })).toBeInViewport({ ratio: 1 });
    expect(await scrollWidth(page)).toBe(390);

    await page.clock.runFor(30_000);
    await page.getByRole('button', { name: 'Set done' }).click();
    const clock = page.locator('[data-rest-clock]');
    await expect(clock).toBeVisible();
    const rest = await clock.evaluate((el) => ({
      fs: parseFloat(getComputedStyle(el).fontSize),
      over: el.scrollWidth > el.clientWidth + 1,
    }));
    expect(rest.fs).toBeGreaterThanOrEqual(64);
    expect(rest.over).toBe(false);
    await expect(clock).toBeInViewport({ ratio: 1 });
    expect(await scrollWidth(page)).toBe(390);
    expect(errors).toEqual([]);
  });
});

/**
 * The unit switches and their label rows under `rootSel` sit inside the 390px screen, each option
 * ≥ 56px; every item of a label row stays on the row's box (nothing pushed past its right edge)
 * and the label never runs under the switch.
 */
async function switchesFit(page: Page, rootSel: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const sw = page.locator(`${rootSel} [data-unit-for="${id}"]`);
    await expect(sw, id).toBeVisible();
    const out = await sw.evaluate((g) => {
      const bad: string[] = [];
      const vw = document.documentElement.clientWidth;
      const row = g.parentElement as HTMLElement;
      const rb = row.getBoundingClientRect();
      for (const el of [row, ...row.children] as HTMLElement[]) {
        const b = el.getBoundingClientRect();
        if (b.left < -0.5 || b.right > vw + 0.5) bad.push(`${el.className} off screen ${b.right}`);
        if (el !== row && b.right > rb.right + 0.5)
          bad.push(`${el.className} past its row ${b.right} > ${rb.right}`);
      }
      // The label beside the switch never runs under it.
      const sb = g.getBoundingClientRect();
      for (const el of row.children) {
        if (el === g) continue;
        const b = el.getBoundingClientRect();
        const sameLine = b.top < sb.bottom - 0.5 && b.bottom > sb.top + 0.5;
        if (sameLine && b.right > sb.left + 0.5 && b.left < sb.right - 0.5)
          bad.push(`${el.className} under the switch`);
      }
      for (const b of g.querySelectorAll('button')) {
        const r = b.getBoundingClientRect();
        if (r.height < 56 || r.width < 56)
          bad.push(`option ${b.textContent} ${r.width}×${r.height}`);
        if (b.scrollWidth > b.clientWidth + 1) bad.push(`option ${b.textContent} clipped`);
      }
      return bad;
    });
    expect(out, id).toEqual([]);
  }
}

test.describe('Text size Larger on the measure pages (unit switch)', () => {
  test('Set up Fuel (kg | lb, cm | ft·in), the weigh-in and Measurements: nothing clipped or sideways', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const { errors } = record(page);
    await forceTextSize(page, 'larger');
    await openApp(page, NOW);
    await page.locator('[data-tab="fuel"]').tap();

    // Set up Fuel, cm then ft·in (two step rows), down the whole form.
    await page.locator('main[data-screen="fuel"] [data-setup]').tap();
    const SETUP = 'main[data-screen="fuel-setup"]';
    await expect(page.locator(SETUP)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await switchesFit(page, SETUP, ['height', 'weight']);
    expect(await clippedText(page, SETUP), 'setup cm').toEqual([]);
    expect(await scrollWidth(page)).toBe(390);
    await page
      .locator(`${SETUP} [data-unit-for="height"]`)
      .getByRole('button', { name: 'ft·in', exact: true })
      .tap();
    await expect(page.locator(`${SETUP} [data-field="height"] [data-part="in"]`)).toBeVisible();
    await page
      .locator(`${SETUP} [data-unit-for="weight"]`)
      .getByRole('button', { name: 'lb', exact: true })
      .tap();
    await switchesFit(page, SETUP, ['height', 'weight']);
    expect(await clippedText(page, SETUP), 'setup ft·in + lb').toEqual([]);
    for (const part of ['ft', 'in']) {
      const row = page.locator(`${SETUP} [data-field="height"] [data-part="${part}"]`);
      const b = await row.boundingBox();
      expect((b?.x ?? 0) + (b?.width ?? 0), part).toBeLessThanOrEqual(390);
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), part).toBe(true);
    }
    expect(await scrollWidth(page)).toBe(390);
    await page.locator(`${SETUP} [data-setup-save]`).scrollIntoViewIfNeeded();
    expect(await scrollWidth(page)).toBe(390);
    await page.locator(`${SETUP} .fuel-back`).first().tap();

    // The weigh-in (stepper + switch, in lb now).
    await page.locator('[data-weigh-in]').tap();
    const WEIGH = 'main[data-screen="weigh-in"]';
    await expect(page.locator(WEIGH)).toBeVisible();
    await switchesFit(page, WEIGH, ['weigh-in']);
    expect(await clippedText(page, WEIGH)).toEqual([]);
    expect(await scrollWidth(page)).toBe(390);
    await page.locator(`${WEIGH} .fuel-back`).tap();

    // Measurements (the switch heading the list, a site open in inches).
    await page.locator('[data-measurements-open]').tap();
    const MEAS = 'main[data-screen="measurements"]';
    await expect(page.locator(MEAS)).toBeVisible();
    await page.locator(`${MEAS} [data-site-toggle="waist"]`).tap();
    await expect(page.locator(`${MEAS} [data-field="site-waist"] .nf-unit`)).toHaveText('in');
    await switchesFit(page, MEAS, ['tape']);
    expect(await clippedText(page, MEAS)).toEqual([]);
    expect(await scrollWidth(page)).toBe(390);
    expect(await page.evaluate(() => window.__spoken)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('Text size Larger on a fresh install', () => {
  test.use({ firstRun: 'fresh' });

  test('first run (welcome, Units, each intake question): no sideways scroll, nothing clipped', async ({
    page,
  }) => {
    const { errors } = record(page);
    await forceTextSize(page, 'larger');
    await page.clock.install({ time: NOW });
    await page.goto('/');
    const welcome = page.locator('[data-screen="welcome"]');
    const intake = page.locator('main[data-screen="intake"]');
    await expect(welcome).toBeVisible();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await expect(welcome.or(intake)).toBeVisible();
      if (await intake.isVisible()) break;
      const step = (await welcome.locator('[data-ob="page"]').getAttribute('data-step')) ?? `${i}`;
      seen.push(step);
      expect(await clippedText(page, '[data-screen="welcome"]'), step).toEqual([]);
      expect(await scrollWidth(page), step).toBe(390);
      await welcome.locator('[data-ob="primary"]').tap();
    }
    expect(seen).toContain('units');

    await expect(intake).toBeVisible();
    const picks: Record<string, string | null> = {
      goal: 'fat',
      days: '3',
      length: '45',
      experience: 'new',
      easyOn: null,
      wantsCore: null,
    };
    for (const [id, pick] of Object.entries(picks)) {
      await expect(intake).toHaveAttribute('data-step', id);
      expect(await clippedText(page, 'main[data-screen="intake"]'), id).toEqual([]);
      expect(await scrollWidth(page), id).toBe(390);
      if (pick) await intake.locator(`[data-option="${pick}"]`).tap();
      await intake.locator('[data-intake-next]').tap();
    }
    await expect(intake).toHaveAttribute('data-step', 'summary');
    expect(await clippedText(page, 'main[data-screen="intake"]')).toEqual([]);
    expect(await scrollWidth(page)).toBe(390);
    expect(errors).toEqual([]);
  });
});

test('Settings → Display → Text size: Larger applies at once, is stored and survives a reload (task 22)', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, NOW);
  await page.locator('[data-tab="settings"]').tap();
  await expect(page.locator('main[data-screen="settings"]')).toBeVisible();
  const display = page.locator('[data-section="display"]');
  await expect(display).toHaveCount(1);

  const group = display.getByRole('group', { name: 'Text size', exact: true });
  const opt = (name: string) => group.getByRole('button', { name, exact: true });
  await expect(opt('Standard')).toHaveAttribute('aria-pressed', 'true');
  for (const b of await group.getByRole('button').all())
    expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  const noteBefore = await fontPx(page, '[data-set-note="display"]');
  expect(noteBefore).toBe(20);

  await opt('Larger').tap();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await expect(display.getByRole('button', { name: 'Larger', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await fontPx(page, '[data-set-note="display"]')).toBe(24);
  await expect.poll(() => getSetting(page, 'textSize')).toBe('larger');
  expect(await scrollWidth(page)).toBe(390);

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'larger');
  await page.locator('[data-tab="settings"]').tap();
  await expect(
    page.locator('[data-section="display"]').getByRole('button', { name: 'Larger', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');

  await page
    .locator('[data-section="display"]')
    .getByRole('button', { name: 'Standard', exact: true })
    .tap();
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'standard');
  await expect.poll(() => getSetting(page, 'textSize')).toBe('standard');
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(errors).toEqual([]);
});

test('index.html sets html[data-text-size] from the localStorage mirror before main.ts runs', async ({
  page,
}) => {
  // main.ts never loads here: only the inline pre-paint script can set the attribute.
  await page.route(/\/src\/main\.ts(\?|$)/, (r) => r.abort());
  await page.addInitScript(() => {
    const v = new URLSearchParams(location.search).get('ts');
    try {
      if (v) localStorage.setItem('gc-text-size', v);
    } catch {
      /* storage blocked: the page renders Standard */
    }
    document.addEventListener('DOMContentLoaded', () => {
      (window as unknown as { tsAtDcl: string | null }).tsAtDcl =
        document.documentElement.getAttribute('data-text-size');
    });
  });
  for (const [stored, want] of [
    ['larger', 'larger'],
    ['large', 'large'],
    ['huge', null],
    ['standard', null],
  ] as const) {
    await page.goto(`/?ts=${stored}`, { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { tsAtDcl?: string | null }).tsAtDcl), {
        message: stored,
      })
      .toBe(want);
  }
});
