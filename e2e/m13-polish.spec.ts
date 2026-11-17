import { expect, test, type Page } from './fixtures';

/**
 * M13 tasks 19, 23, 24 (polish), mounted from the real modules with made-up data. The harness
 * plays app.ts's part (props in, callbacks recorded):
 * - Today, hero first: with notices seeded, Start is inside the first 390×844 viewport, the
 *   notices sit in one "N things to sort" row that opens in place, the only filled orange button
 *   is Start, and nothing is spoken (Today is read with the phone in hand).
 * - Rest "Next" card: the 2D map shows at once; the real 3D body fades in over it once it has
 *   drawn; moved away (the 3D sheet), the 2D comes back. Instant under reduced motion.
 * - Fuel entry rows: no always-visible Delete block; the row opens the sheet (Edit / Delete).
 *
 * M13_SHOTS=1 also saves 390×844 screenshots to docs/screenshots/m13-*.png.
 */

declare global {
  interface Window {
    __calls: string[];
    __spoken: string[];
    __rerender: () => void;
  }
}

const NOW = new Date(2026, 10, 13, 18, 0).getTime(); // Fri 13 Nov 2026
const shots = !!process.env['M13_SHOTS'];
const settle = (page: Page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.constructor === Animation)
        .map((a) => a.finished),
    ),
  );
const shot = async (page: Page, name: string) => {
  if (!shots) return;
  await settle(page);
  await page.screenshot({ path: `docs/screenshots/${name}.png` });
};
const width = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

async function stubs(page: Page): Promise<void> {
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

// ---------- Today (task 19) ----------

async function mountToday(page: Page, notices: 'none' | 'two' | 'one'): Promise<void> {
  await stubs(page);
  await page.goto('/');
  await page.evaluate(
    async ({ now, notices }) => {
      const today = await import('/src/ui/screens/today.ts' as string);
      const catalog = await import('/src/data/catalog.ts' as string);
      const days = catalog.program.days as { id: string; name: string }[];
      const push = days.find((d) => d.name === 'Push A') ?? days[0];
      const pull = days.find((d) => d.name === 'Pull A') ?? days[1];
      const dayAt = (i: number) => new Date(2026, 10, 9 + i).getTime();
      const state = {
        open: false,
        missed:
          notices === 'none'
            ? null
            : ({ date: '2026-11-10', dayId: push?.id, name: push?.name } as unknown),
        readiness:
          notices === 'two'
            ? {
                date: '2026-11-13',
                signals: [],
                reasons: ['Short sleep last night (5 h 40 min).'],
                offer: 'lighter',
              }
            : null,
      };
      const log = (s: string) => window.__calls.push(s);
      const render = () => {
        const el = today.todayScreen(
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
            missedDay: state.missed,
            readiness: state.readiness,
            noticesOpen: state.open,
          },
          {
            onStart: (d: { id: string }) => log(`start:${d.id}`),
            onOpenDay: (d: { id: string }) => log(`open:${d.id}`),
            onTab: (t: string) => log(`tab:${t}`),
            onCoach: () => log('coach'),
            onLighterToday: () => log('lighter'),
            onNotToday: () => log('notToday'),
            onTrainAsPlanned: () => log('keep'),
            onNoticesToggle: (o: boolean) => {
              state.open = o;
              log(`notices:${o}`);
            },
            onMoveMissed: () => {
              log('move');
              state.missed = null;
              render();
            },
            onSkipMissed: () => {
              log('skip');
              state.missed = null;
              render();
            },
          },
        );
        document.body.replaceChildren(el);
      };
      window.__rerender = render;
      render();
    },
    { now: NOW, notices },
  );
  await expect(page.locator('main.today')).toBeVisible();
}

/** Buttons painted with the action colour (--cta) as their fill, by computed style. */
const filledButtons = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--cta)';
    document.body.append(probe);
    const cta = getComputedStyle(probe).color;
    probe.remove();
    return [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null && getComputedStyle(b).backgroundColor === cta)
      .map((b) => b.textContent?.trim() ?? '');
  });

test('Today, two notices: Start in the first viewport, one row "2 things to sort", one filled button', async ({
  page,
}) => {
  await mountToday(page, 'two');
  const start = page.getByRole('button', { name: 'Start workout' });
  await expect(start).toBeInViewport({ ratio: 1 });
  const row = page.locator('[data-notices="2"]');
  const toggle = row.locator('[data-notices-toggle]');
  await expect(toggle).toContainText('2 things to sort');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('[data-readiness]')).toBeHidden();
  await expect(page.locator('[data-missed-day]')).toBeHidden();
  expect((await toggle.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(await filledButtons(page)).toEqual(['Start workout']);
  expect(await width(page)).toBe(390);
  await shot(page, 'm13-today-notices');

  // Opens in place; still one filled button; the cards' actions work; app.ts keeps it open.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('[data-readiness]')).toBeVisible();
  await expect(page.locator('[data-missed-day]')).toBeVisible();
  expect(await filledButtons(page)).toEqual(['Start workout']);
  for (const sel of ['[data-readiness-lighter]', '[data-missed-move]', '[data-missed-skip]']) {
    expect((await page.locator(sel).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  }
  const sizes = await row.evaluate((r) =>
    [...r.querySelectorAll('p, li, button, h2')].map((e) =>
      parseFloat(getComputedStyle(e).fontSize),
    ),
  );
  for (const s of sizes) expect(s).toBeGreaterThanOrEqual(20);
  expect(await width(page)).toBe(390);
  await page.locator('[data-notices]').scrollIntoViewIfNeeded();
  await shot(page, 'm13-today-notices-open');

  // Skip the missed day → one notice left: the readiness card shows on its own.
  await page.locator('[data-missed-skip]').click();
  await expect(page.locator('[data-notices]')).toHaveCount(0);
  await expect(page.locator('[data-readiness]')).toBeVisible();
  expect(await page.evaluate(() => window.__calls)).toEqual(['notices:true', 'skip']);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

test('Today: no header Coach button; with no notices the hero follows the app bar', async ({
  page,
}) => {
  await mountToday(page, 'none');
  await expect(page.locator('[data-coach-open]')).toHaveCount(0);
  await expect(page.locator('.appbar .date')).toHaveText('Fri 13 Nov');
  const order = await page.evaluate(() =>
    [...(document.querySelector('main.today')?.children ?? [])].slice(0, 2).map((c) => c.tagName),
  );
  expect(order).toEqual(['HEADER', 'SECTION']);
  await expect(page.locator('main.today > section.hero')).toHaveCount(1);
  expect(await filledButtons(page)).toEqual(['Start workout']);
  // The week strip ends clear of the tab bar when scrolled to the bottom.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const strip = await page.locator('[data-day-strip]').boundingBox();
  const bar = await page.locator('.tabbar').boundingBox();
  expect((strip?.y ?? 0) + (strip?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'm13-today-fresh');
});

// ---------- Rest (task 23) ----------

async function mountRest(page: Page): Promise<void> {
  await stubs(page);
  await page.goto('/');
  await page.evaluate(async () => {
    const rest = await import('/src/ui/screens/rest.ts' as string);
    const bodyMap = await import('/src/ui/bodyMap.ts' as string);
    const catalog = await import('/src/data/catalog.ts' as string);
    const id = 'One-Arm_Dumbbell_Row';
    const ex = catalog.exerciseById(id);
    // The slot app.ts's muscleSlot(id, 'rest') builds: a button around the labelled 2D map.
    const slot = document.createElement('div');
    slot.className = 'muscle-slot rest';
    slot.dataset['muscleSlot'] = id;
    slot.dataset['interactive'] = 'false';
    slot.innerHTML = bodyMap.bodyMapSvg({
      view: bodyMap.pickView(ex.primaryMuscles),
      primary: ex.primaryMuscles,
      secondary: ex.secondaryMuscles,
    });
    const btn = document.createElement('button');
    btn.className = 'muscle-btn';
    btn.setAttribute('aria-label', 'Show target muscles in 3D');
    btn.append(slot);
    const view = rest.restScreen(
      {
        dayName: 'Pull A',
        exIndex: 1,
        exTotal: 5,
        remainingMs: 74_000,
        targetMs: 90_000,
        exerciseId: id,
        name: 'One-Arm Dumbbell Row',
        setIndex: 2,
        sets: 4,
        reps: 10,
        weightText: '22.5',
        unit: 'kg',
        cue: 'Elbow to hip.',
        figure: btn,
        hasNotes: false,
      },
      {
        onList: () => undefined,
        onPause: () => undefined,
        onExtend: () => undefined,
        onNotes: () => undefined,
        onStartSet: () => undefined,
      },
    );
    document.body.replaceChildren(view.el);
  });
}

/** What app.ts's placeBody3d does: the real 3D body moved into the slot. */
const place3d = (page: Page) =>
  page.evaluate(async () => {
    const viewer = await import('/src/ui/body3d/viewer.ts' as string);
    if (!viewer.webglAvailable()) return false;
    const slot = document.querySelector<HTMLElement>('[data-muscle-slot]');
    if (!slot) return false;
    const body = viewer.createBody3D({ reducedMotion: false });
    slot.classList.add('has-3d');
    slot.append(body.el);
    body.setInteractive(false);
    body.setMuscles(['middle back', 'lats'], ['biceps']);
    (window as unknown as { __body: unknown }).__body = body;
    return true;
  });

const opacity = (page: Page, sel: string) =>
  page.locator(sel).evaluate((e) => Number(getComputedStyle(e).opacity));

test('Rest "Next" card: the 2D map at once, the 3D fades in over it, and back to 2D when it leaves', async ({
  page,
}) => {
  await mountRest(page);
  const box = page.locator('.rest-card-fig');
  await expect(box).toHaveAttribute('data-3d', 'pending');
  const flat = box.locator('[data-rest-fig-2d] svg.body-map');
  await expect(flat).toBeVisible();
  expect((await flat.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  expect(await opacity(page, '[data-rest-fig-2d]')).toBe(1);
  // One labelled map on the page (the slot's); the placeholder is decorative.
  await expect(page.getByRole('img', { name: /view\./ })).toHaveCount(1);
  expect(await width(page)).toBe(390);
  await shot(page, 'm13-rest-placeholder');

  test.skip(!(await place3d(page)), 'no WebGL in this browser');
  await expect(box).toHaveAttribute('data-3d', 'shown');
  await expect.poll(() => opacity(page, '.rest-card-fig .body3d')).toBe(1);
  await expect.poll(() => opacity(page, '[data-rest-fig-2d]')).toBe(0);
  await shot(page, 'm13-rest-3d');

  // Tapped: app.ts moves the 3D body to the sheet → the card shows the 2D again.
  await page.evaluate(() => document.querySelector('.body3d')?.remove());
  await expect(box).toHaveAttribute('data-3d', 'pending');
  await expect.poll(() => opacity(page, '[data-rest-fig-2d]')).toBe(1);
});

test('Rest "Next" card under reduced motion: the swap is instant', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mountRest(page);
  expect(
    await page
      .locator('[data-rest-fig-2d]')
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe('0s');
  test.skip(!(await place3d(page)), 'no WebGL in this browser');
  await expect(page.locator('.rest-card-fig')).toHaveAttribute('data-3d', 'shown');
  // No waiting: the very next frame has the final opacities.
  expect(await opacity(page, '[data-rest-fig-2d]')).toBe(0);
  expect(await opacity(page, '.rest-card-fig .body3d')).toBe(1);
});

// ---------- Fuel entry rows (task 24) ----------

async function mountFuel(page: Page): Promise<void> {
  await stubs(page);
  await page.goto('/');
  await page.evaluate(async (now) => {
    const fuel = await import('/src/ui/screens/fuel.ts' as string);
    const at = (h: number, m: number) => new Date(2026, 10, 13, h, m).getTime();
    const entries = [
      {
        id: 'e1',
        date: '2026-11-13',
        time: at(7, 45),
        slot: 'breakfast',
        label: 'Protein shake',
        amount: { servings: 1 },
        estimate: false,
        kcal: 200,
        proteinG: 30,
      },
      {
        id: 'e2',
        date: '2026-11-13',
        time: at(12, 30),
        slot: 'lunch',
        label: 'Pad kra pao with rice + fried egg',
        amount: { servings: 1.4 },
        estimate: true,
        kcal: 900,
        proteinG: 38,
      },
      {
        id: 'e3',
        date: '2026-11-13',
        time: at(15, 10),
        slot: 'snack',
        label: 'Banana',
        amount: { grams: 120 },
        estimate: false,
        kcal: 107,
        proteinG: 1.3,
      },
    ];
    const log = (s: string) => window.__calls.push(s);
    const el = fuel.fuelScreen(
      {
        now,
        mode: 'quick',
        targets: {
          kcal: { value: 2800, estimate: true },
          proteinG: { value: 140, estimate: true },
          carbsG: { value: 350, estimate: true },
          fatG: { value: 80, estimate: true },
        },
        totals: { kcal: 1207, proteinG: 69.3 },
        entries,
        unit: 'kg',
        lastWeighInKg: 70.2,
      },
      {
        onLog: () => log('log'),
        onEditEntry: (e: { id: string }) => log(`edit:${e.id}`),
        onDeleteEntry: (e: { id: string }) => log(`delete:${e.id}`),
        onWeighIn: () => log('weigh'),
        onSetup: () => log('setup'),
        onDismissNudge: () => log('dismiss'),
        onTab: (t: string) => log(`tab:${t}`),
      },
    );
    document.body.replaceChildren(el);
  }, NOW);
  await expect(page.locator('[data-entry="e1"]')).toBeVisible();
}

test('Fuel entry rows at 390×844: one full-width row button, no Delete block; it opens the editor', async ({
  page,
}) => {
  await mountFuel(page);
  const row = page.locator('[data-entry="e1"]');
  await row.scrollIntoViewIfNeeded();
  await expect(row.locator('button')).toHaveCount(1);
  await expect(page.locator('[data-entry-delete]')).toHaveCount(0);
  await expect(page.getByText('Delete', { exact: true })).toHaveCount(0);
  const box = await row.locator('[data-entry-edit]').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(340); // the row's full width at 390 (16px gutters)
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(56);
  await expect(row.locator('[data-entry-edit]')).toHaveAccessibleName(
    /Protein shake.*edit or delete/,
  );
  expect(await width(page)).toBe(390);
  await shot(page, 'm13-fuel-entries');
  await row.locator('[data-entry-edit]').click();
  expect(await page.evaluate(() => window.__calls)).toEqual(['edit:e1']);
});
