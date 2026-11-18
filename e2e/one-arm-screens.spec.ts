// M13b task 13: one-sided sets on the camera view and the Exercise screen, mounted from their
// modules (app.ts wiring is task 16; the full Right → Next arm → Left flow is e2e/one-arm.spec.ts,
// task 17). Checks the side label, the Next arm button (size, place, spoken switch line that
// cuts a count word), Set done only on the second side, leg wording, and no sideways scroll.
import { expect, test, type Page } from './fixtures';

async function mockSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __speech: string[] };
    w.__speech = [];
    const fake = {
      speak: (u: { text: string }) => w.__speech.push(u.text),
      cancel: () => w.__speech.push('<cancel>'),
      resume: () => {},
      getVoices: () => [],
      speaking: false,
      pending: false,
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      text: string;
      constructor(t: string) {
        this.text = t;
      }
      addEventListener() {}
    };
  });
}

const speech = (page: Page) =>
  page.evaluate(() => (window as unknown as { __speech: string[] }).__speech);

const SWITCH = 'Left arm. Turn so your left arm faces the phone.';

type Turn = 'first' | 'second' | null;

/** Mounts the One-Arm Dumbbell Row camera view (not started: no model needed for these checks). */
async function mountRowCamera(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const ui = await load('/src/ui/cameraView.ts');
    type View = { el: HTMLElement; setSession(s: unknown): void };
    const w = window as unknown as {
      __next: number;
      __done: number;
      __turn(t: 'first' | 'second' | null): void;
    };
    w.__next = 0;
    w.__done = 0;
    const view = (ui.createCameraView as (o: unknown) => View)({
      title: 'One-Arm Dumbbell Row',
      exerciseId: 'One-Arm_Dumbbell_Row',
      onClose() {},
      onSetDone: () => w.__done++,
      onNextSide: () => w.__next++,
      speakPlacement: false,
      target: { setNumber: 1, sets: 4, targetReps: 12, minReps: 8 },
    });
    document.body.append(view.el);
    w.__turn = (t) =>
      view.setSession({ phase: 'exercise', paused: false, restElapsedMs: 0, sideTurn: t });
  });
}

const setTurn = (page: Page, t: Turn) =>
  page.evaluate((t) => (window as unknown as { __turn(t: Turn): void }).__turn(t), t);

test('camera, one-arm row: "Right arm" over the count, Next arm spoken, then Left arm + Set done', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await mockSpeech(page);
  await page.goto('/');
  await mountRowCamera(page);
  await setTurn(page, 'first');
  const cam = page.getByRole('dialog', { name: 'Camera' });

  // Side label on top of the count, inside the HUD, ≥ 20px; the count stays ≥ 64px.
  const label = cam.locator('.rep-panel [data-side-label]');
  await expect(label).toHaveText('Right arm');
  await expect(label).toHaveAttribute('data-side-label', 'right');
  const box = (sel: string) =>
    cam.locator(sel).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, fs: parseFloat(getComputedStyle(el).fontSize) };
    });
  const l = await box('.rep-panel [data-side-label]');
  const n = await box('[data-reps]');
  expect(l.fs).toBeGreaterThanOrEqual(20);
  expect(n.fs).toBeGreaterThanOrEqual(64);
  expect(l.bottom).toBeLessThanOrEqual(n.top + 1);
  // The counter's own side line doesn't repeat it.
  await expect(cam.locator('.rep-side')).toBeHidden();

  // Next arm in the Set done slot: full width, ≥ 56px, on screen; no Set done on the first arm.
  const next = cam.getByRole('button', { name: 'Next arm' });
  await expect(next).toBeVisible();
  await expect(cam.getByRole('button', { name: 'Set done' })).toBeHidden();
  const nb = await next.boundingBox();
  expect(nb?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(nb?.width ?? 0).toBeGreaterThanOrEqual(390 - 2 * 16);
  expect((nb?.y ?? 0) + (nb?.height ?? 0)).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/m13b-camera-right.png' });

  // Tap: the count word is cut, the switch line spoken, the app told.
  await next.click();
  const said = await speech(page);
  expect(said).toContain(SWITCH);
  expect(said.lastIndexOf('<cancel>')).toBeLessThan(said.indexOf(SWITCH));
  expect(await page.evaluate(() => (window as unknown as { __next: number }).__next)).toBe(1);

  // The app dispatched NEXT_SIDE: the view follows the session to the left arm.
  await setTurn(page, 'second');
  await expect(label).toHaveText('Left arm');
  await expect(label).toHaveAttribute('data-side-label', 'left');
  await expect(cam.locator('[data-reps]')).toHaveText('0');
  await expect(next).toBeHidden();
  const done = cam.getByRole('button', { name: 'Set done' });
  await expect(done).toBeVisible();
  await page.screenshot({ path: 'test-results/m13b-camera-left.png' });
  // A double tap right after Next arm is ignored; a later tap ends the set.
  await page.waitForTimeout(800);
  await done.click();
  expect(await page.evaluate(() => (window as unknown as { __done: number }).__done)).toBe(1);

  // Rest: the next set starts on the right arm again.
  await setTurn(page, null);
  await expect(label).toHaveText('Right arm');
  expect(errors).toEqual([]);
});

/** Mounts the Exercise screen from its module with a one-sided view. */
async function mountExercise(
  page: Page,
  o: { id: string; name: string; tracking: string; side: unknown },
): Promise<void> {
  await page.evaluate(async (o) => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const ui = await load('/src/ui/screens/exercise.ts');
    const w = window as unknown as { __next: number; __done: number; __adjust: string[] };
    w.__next = 0;
    w.__done = 0;
    w.__adjust = [];
    document.querySelector('#app')?.replaceChildren();
    document.body.replaceChildren();
    const el = (ui.exerciseScreen as (p: unknown, a: unknown) => HTMLElement)(
      {
        dayName: 'Pull A',
        exIndex: 1,
        exTotal: 5,
        exerciseId: o.id,
        tracking: o.tracking,
        name: o.name,
        repsRange: '8–12',
        setIndex: 1,
        sets: 4,
        reps: 12,
        weightText: '22.5',
        unit: 'kg',
        cue: 'Elbow to hip.',
        figure: document.createElement('div'),
        hasNotes: false,
        side: o.side,
      },
      {
        onList() {},
        onPause() {},
        onHowTo() {},
        onNotes() {},
        onAdjust: (f: string, d: number) => w.__adjust.push(`${f}${d}`),
        onSetDone: () => w.__done++,
        onNextSide: () => w.__next++,
      },
    );
    const app = document.createElement('div');
    app.id = 'app';
    app.append(el);
    document.body.append(app);
  }, o);
}

test('exercise screen, manual one-arm set: Right arm +/- and Next arm, then Left arm + Set done', async ({
  page,
}) => {
  await mockSpeech(page);
  await page.goto('/');
  await mountExercise(page, {
    id: 'One-Arm_Dumbbell_Row',
    name: 'One-Arm Dumbbell Row',
    tracking: 'manual',
    side: { limb: 'arm', turn: 'first' },
  });
  const label = page.locator('[data-stepper="reps"] [data-side-label]');
  await expect(label).toHaveText('Right arm');
  expect(
    await label.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(20);
  await page.getByRole('button', { name: 'Reps plus' }).click();
  expect(await page.evaluate(() => (window as unknown as { __adjust: string[] }).__adjust)).toEqual(
    ['reps1'],
  );
  await expect(page.getByRole('button', { name: 'Set done' })).toHaveCount(0);
  const next = page.getByRole('button', { name: 'Next arm' });
  await next.scrollIntoViewIfNeeded();
  const nb = await next.boundingBox();
  expect(nb?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/m13b-exercise-right.png' });
  await next.click();
  expect(await speech(page)).toEqual(['<cancel>', SWITCH]);
  expect(await page.evaluate(() => (window as unknown as { __next: number }).__next)).toBe(1);

  await mountExercise(page, {
    id: 'One-Arm_Dumbbell_Row',
    name: 'One-Arm Dumbbell Row',
    tracking: 'manual',
    side: { limb: 'arm', turn: 'second', doneReps: 12, switchedAt: 0 },
  });
  await expect(page.locator('[data-stepper="reps"] [data-side-label]')).toHaveText('Left arm');
  await expect(page.locator('[data-side-done]')).toHaveText('Right arm: 12 reps');
  await expect(page.getByRole('button', { name: 'Next arm' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'test-results/m13b-exercise-left.png' });
  await page.getByRole('button', { name: 'Set done' }).click();
  expect(await page.evaluate(() => (window as unknown as { __done: number }).__done)).toBe(1);
});

test('exercise screen, one-leg exercise: "Right leg" and Next leg', async ({ page }) => {
  await mockSpeech(page);
  await page.goto('/');
  await mountExercise(page, {
    id: 'Split_Squat_with_Dumbbells',
    name: 'Split Squat with Dumbbells',
    tracking: 'manual',
    side: { limb: 'leg', turn: 'first' },
  });
  await expect(page.locator('[data-side-label]')).toHaveText('Right leg');
  await page.getByRole('button', { name: 'Next leg' }).click();
  expect(await speech(page)).toContain('Left leg. Turn so your left leg faces the phone.');
});
