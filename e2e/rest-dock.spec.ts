import { expect, test, type Page } from './fixtures';

/**
 * Rest screen, sticky "Start set" dock vs. the "Next" card's 3D body (found by the M13 store
 * screenshot run): with the real WebGL viewer in the card, every point across the Start set
 * button must hit the button, never the canvas, at 390×844. Mounted from the real modules with
 * made-up data, the way e2e/m13-polish.spec.ts does it.
 */

declare global {
  interface Window {
    __spoken: string[];
    __started: number;
  }
}

async function mountRest(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__started = 0;
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
  await page.goto('/');
  await page.evaluate(async () => {
    const rest = await import('/src/ui/screens/rest.ts' as string);
    const bodyMap = await import('/src/ui/bodyMap.ts' as string);
    const catalog = await import('/src/data/catalog.ts' as string);
    const id = 'One-Arm_Dumbbell_Row';
    const ex = catalog.exerciseById(id);
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
        hasNotes: true,
        note: 'Brace on the bench, flat back.',
        today: '10 × 22.5 kg',
        last: '10, 10, 9 × 22.5 kg',
        // As in the store run: the effort row pushes the card down under the dock at scrollY 0.
        effort: null,
        fixEl: Object.assign(document.createElement('div'), {
          className: 'lsc',
          style: 'min-height: 90px',
        }),
      },
      {
        onList: () => undefined,
        onPause: () => undefined,
        onExtend: () => undefined,
        onNotes: () => undefined,
        onStartSet: () => {
          window.__started += 1;
        },
        onEffort: () => undefined,
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
    return true;
  });

/** Tags of what elementFromPoint hits at 5%…95% across the button, on its middle row. */
const hitsAcross = (page: Page) =>
  page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('.sticky-bottom .cta-btn');
    if (!btn) return ['no button'];
    const r = btn.getBoundingClientRect();
    const out: string[] = [];
    for (const f of [0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const hit = document.elementFromPoint(r.left + r.width * f, r.top + r.height * fy);
        out.push(hit && btn.contains(hit) ? 'button' : (hit?.tagName.toLowerCase() ?? 'none'));
      }
    }
    return out;
  });

test('Rest: the sticky Start set button is on top of the 3D card and tappable across its width', async ({
  page,
}) => {
  await mountRest(page);
  test.skip(!(await place3d(page)), 'no WebGL in this browser');
  await expect(page.locator('.rest-card-fig')).toHaveAttribute('data-3d', 'shown');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

  const btn = page.locator('.sticky-bottom .cta-btn');
  await expect(btn).toBeVisible();
  expect((await btn.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);

  // At every scroll position the card can pass under the dock, the button wins every point.
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(max).toBeGreaterThan(0); // the card does scroll under the dock
  for (const y of [0, Math.round(max / 3), Math.round((2 * max) / 3), max]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    expect(await hitsAcross(page), `scrollY ${y}`).toEqual(Array(27).fill('button'));
  }

  // A real tap on the left edge starts the set.
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
  expect(await page.evaluate(() => window.__started)).toBe(1);
});
