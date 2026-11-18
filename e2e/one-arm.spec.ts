// M13b task 17: a one-arm set end to end in the real app (390×844, frozen clock, fake speech and
// wake lock). Pull A opens on One-Arm Dumbbell Row: "Right arm" over the reps, "Right arm first."
// spoken, the full-width Next arm (≥ 56px) speaks the switch line, the left arm gets its own
// count, Set done only on the left (a double tap within 700 ms of Next arm is ignored), one
// SetLog with `sides` and reps = the lower side, the rest clock starts after the left, Fix edits
// one side, and Summary / Calendar day / History read "R x · L y". Also: the camera view's Next
// arm (label, count from 0 on the left), a two-arm exercise unchanged, nothing spoken twice, no
// off-device request, no console errors. Camera rep counting is e2e/camera.spec.ts (task 18).
import { expect, test, type Page } from './fixtures';
import { endWorkout } from './workout.helpers';

declare global {
  interface Window {
    __spoken: string[];
  }
}

/** Fake speechSynthesis (records each line; `<cancel>` for cancel) and Wake Lock. */
async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    class FakeUtterance extends EventTarget {
      text: string;
      lang = '';
      rate = 1;
      volume = 1;
      voice = null;
      pitch = 1;
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
          if (u.text && u.volume !== 0) window.__spoken.push(u.text); // skip the silent iOS unlock
        },
        cancel: () => undefined,
        pause: () => undefined,
        resume: () => undefined,
        getVoices: () => [],
        addEventListener: () => undefined,
        speaking: false,
        pending: false,
        paused: false,
      },
    });
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => ({ addEventListener: () => undefined, release: async () => {} }),
      },
    });
  });
}

/** Console errors, page errors and every request URL. */
function record(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return { requests, errors };
}

function offDevice(requests: readonly string[], baseURL: string | undefined): string[] {
  const origin = new URL(baseURL ?? 'https://localhost').origin;
  return requests.filter(
    (u) => !u.startsWith('data:') && !u.startsWith('blob:') && new URL(u).origin !== origin,
  );
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken);

/** Each line spoken more than once (a repeated "Rest." between sets is not this flow's). */
function twice(lines: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const l of lines) (seen.has(l) ? dup : seen).add(l);
  return [...dup];
}

type SetRow = {
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  weightKg: number;
  sides?: { right?: { reps: number; partials: number }; left?: { reps: number; partials: number } };
  startedAt: number;
  endedAt: number;
};

async function readSets(page: Page): Promise<SetRow[]> {
  return page.evaluate(
    () =>
      new Promise<SetRow[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('sets').objectStore('sets').getAll();
          req.onsuccess = () => resolve(req.result as SetRow[]);
          req.onerror = () => reject(req.error);
        };
      }),
  );
}

const ROW = 'One-Arm_Dumbbell_Row';
const START = 'Right arm first.';
const SWITCH = 'Left arm. Turn so your left arm faces the phone.';
/** The row's focus cue (src/data/cues.json): said at every set's start, like the side line. */
const ROW_CUE = 'Elbow to hip, squeeze your back.';

/** Fri 13 Nov 2026 18:00 local; the clock only moves through runFor from here. */
async function openApp(page: Page): Promise<void> {
  await installMocks(page);
  await page.clock.install({ time: new Date(2026, 10, 13, 18, 0, 0) });
  await page.goto('/');
  await page.clock.pauseAt(new Date(2026, 10, 13, 18, 0, 5));
}

/** Today → Pull A → Start workout: the row is the first exercise. */
async function startPullA(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
}

const repsValue = (page: Page) => page.getByLabel('Reps', { exact: true });

/** Taps Reps plus / minus until the stepper reads `n`. */
async function setReps(page: Page, n: number): Promise<void> {
  const now = Number(await repsValue(page).innerText());
  const btn = page.getByRole('button', { name: n > now ? 'Reps plus' : 'Reps minus' });
  for (let i = 0; i < Math.abs(n - now); i++) await btn.click();
  await expect(repsValue(page)).toHaveText(String(n));
}

const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);

test('manual one-arm row: Right arm → Next arm → Left arm → Set done → Rest; Fix per side; Summary, Calendar day and History read R · L', async ({
  page,
  baseURL,
}, testInfo) => {
  test.setTimeout(60_000);
  const { requests, errors } = record(page);
  await openApp(page);
  await startPullA(page);

  // Right arm first: label over the reps (≥ 20px). (The spoken "Right arm first." at the
  // workout's first set is the test.fail below; from rest it is checked at set 2.)
  const label = page.locator('[data-stepper="reps"] [data-side-label]');
  await expect(label).toHaveText('Right arm');
  await expect(label).toHaveAttribute('data-side-label', 'right');
  expect(
    await label.evaluate((e) => parseFloat(getComputedStyle(e).fontSize)),
  ).toBeGreaterThanOrEqual(20);

  // First side: Next arm in the Set done slot, full width, ≥ 56px; no Set done.
  await expect(page.getByRole('button', { name: 'Set done' })).toHaveCount(0);
  const next = page.getByRole('button', { name: 'Next arm' });
  await expect(next).toBeVisible();
  const nb = await next.boundingBox();
  expect(nb?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect(nb?.width ?? 0).toBeGreaterThanOrEqual(390 - 2 * 16);
  await noOverflow(page);

  await setReps(page, 12);
  await page.clock.runFor(40_000);
  const before = (await spoken(page)).length;
  await next.click();
  await expect.poll(async () => (await spoken(page)).slice(before)).toEqual([SWITCH]);

  // Left arm: its own label, the right's reps shown as done, Set done instead of Next arm.
  await expect(label).toHaveText('Left arm');
  await expect(label).toHaveAttribute('data-side-label', 'left');
  await expect(page.locator('[data-side-done]')).toHaveText('Right arm: 12 reps');
  await expect(page.getByRole('button', { name: 'Next arm' })).toHaveCount(0);
  const done = page.getByRole('button', { name: 'Set done' });
  await expect(done).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13b-e2e-left.png') });

  // A double tap within 700 ms of Next arm (clock frozen) doesn't end the set.
  await done.click();
  await expect(page.locator('[data-rest-clock]')).toHaveCount(0);
  await expect(label).toHaveText('Left arm');
  expect(await readSets(page)).toEqual([]);

  // The left arm's own count; Set done ends the set and the rest starts now.
  await setReps(page, 11);
  await page.clock.runFor(35_000);
  await done.click();
  const clock = page.locator('[data-rest-clock]');
  await expect(clock).toBeVisible();
  const restTarget = await clock.innerText();
  await page.clock.runFor(10_000);
  const [m, sec] = restTarget.split(':').map(Number);
  const left = (m ?? 0) * 60 + (sec ?? 0) - 10;
  await expect(clock).toHaveText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);

  // One SetLog: both sides, reps = the lower side, the set's time spans both arms.
  await expect.poll(async () => (await readSets(page)).length).toBe(1);
  const [row] = await readSets(page);
  expect(row?.exerciseId).toBe(ROW);
  expect(row?.setIndex).toBe(0);
  expect(row?.reps).toBe(11);
  expect(row?.sides).toEqual({ right: { reps: 12, partials: 0 }, left: { reps: 11, partials: 0 } });
  expect((row?.endedAt ?? 0) - (row?.startedAt ?? 0)).toBeGreaterThanOrEqual(75_000);

  // Rest: "Last set: R 12 · L 11". Fix the left arm to 10 (right kept, reps = 10), then the
  // right arm to 9 (now the lower side: reps = 9).
  const fix = page.locator('[data-lsc="panel"]');
  await expect(fix).toContainText('R 12 · L 11');
  const fixSide = async (side: 'left' | 'right', step: 'minus' | 'plus', times: number) => {
    await fix.locator('[data-lsc="fix"]').click();
    const pick = fix.locator(`[data-lsc="side-${side}"]`);
    await pick.click();
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < times; i++) await fix.locator(`[data-lsc="reps-${step}"]`).click();
    await fix.locator('[data-lsc="save"]').click();
  };
  await fixSide('left', 'minus', 1);
  await expect(fix.locator('.lsc-line')).toContainText('R 12 · L 10');
  await expect
    .poll(async () => (await readSets(page))[0])
    .toMatchObject({
      reps: 10,
      sides: { right: { reps: 12, partials: 0 }, left: { reps: 10, partials: 0 } },
    });
  await fixSide('right', 'minus', 3);
  await expect(fix.locator('.lsc-line')).toContainText('R 9 · L 10');
  await expect
    .poll(async () => (await readSets(page))[0])
    .toMatchObject({
      reps: 9,
      sides: { right: { reps: 9, partials: 0 }, left: { reps: 10, partials: 0 } },
    });
  expect(await readSets(page)).toHaveLength(1);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13b-e2e-rest-fix.png') });

  // Next set starts on the right again, said again ("Right arm first." is per set).
  const beforeSet2 = (await spoken(page)).length;
  await page
    .getByRole('button', { name: /Start (next )?set/ })
    .first()
    .click();
  await expect(label).toHaveText('Right arm');
  await expect.poll(async () => (await spoken(page)).slice(beforeSet2)).toContain(START);
  expect((await spoken(page)).slice(beforeSet2).filter((l) => l === START)).toHaveLength(1);
  await expect(page.getByRole('button', { name: 'Next arm' })).toBeVisible();

  // Pause → End workout → Summary: "R 9 · L 10 × <weight>".
  await endWorkout(page);
  const summary = page.locator('main');
  await expect(summary).toContainText(/R 9 · L 10 × [\d.]+ kg/);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13b-e2e-summary.png'), fullPage: true });

  // Calendar day (today): "R 9 · L 10 reps"; History one tap deeper: "R 9 · L 10 × …".
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-day="2026-11-13"]').click();
  const day = page.locator('main[data-screen="calendar-day"]');
  await expect(day).toHaveAttribute('data-date', '2026-11-13');
  const rowEx = day.locator(`[data-cal-ex="${ROW}"]`);
  await expect(rowEx).toContainText('R 9 · L 10 reps');
  await noOverflow(page);
  await rowEx.locator('[data-cal-history]').click();
  await expect(page.locator('main[data-screen="history"][data-view="detail"]')).toBeVisible();
  await expect(page.locator('[data-history-session]').first()).toContainText(/R 9 · L 10 × [\d.]+/);
  await noOverflow(page);

  // Speech: the switch once, the per-set lines at most once per set; nothing said twice in a row.
  const said = await spoken(page);
  expect(said.filter((l) => l === ROW_CUE)).toHaveLength(2);
  expect(said.filter((l) => l === SWITCH)).toHaveLength(1);
  expect(said.filter((l) => l === START).length).toBeLessThanOrEqual(2);
  for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
  expect(twice(said.filter((l) => l !== START && l !== ROW_CUE))).toEqual([]);

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('camera view on the row: Right arm → Next arm (spoken) → Left arm from 0 → Set done after the guard', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const { requests, errors } = record(page);
  await openApp(page);
  await startPullA(page);
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();

  const label = cam.locator('.rep-panel [data-side-label]');
  await expect(label).toHaveText('Right arm');
  await expect(cam.getByRole('button', { name: 'Set done' })).toBeHidden();
  const next = cam.getByRole('button', { name: 'Next arm' });
  await expect(next).toBeVisible();
  const nb = await next.boundingBox();
  expect(nb?.height ?? 0).toBeGreaterThanOrEqual(56);
  expect((nb?.y ?? 0) + (nb?.height ?? 0)).toBeLessThanOrEqual(844);
  await noOverflow(page);

  const before = (await spoken(page)).length;
  await next.click();
  await expect.poll(async () => (await spoken(page)).slice(before)).toContain(SWITCH);
  expect((await spoken(page)).filter((l) => l === SWITCH)).toHaveLength(1);

  await expect(label).toHaveText('Left arm');
  await expect(cam.locator('[data-reps]')).toHaveText('0');
  await expect(next).toBeHidden();
  const done = cam.getByRole('button', { name: 'Set done' });
  await expect(done).toBeVisible();

  // Within 700 ms of Next arm: ignored. After: the set ends with both sides.
  await done.click();
  expect(await readSets(page)).toEqual([]);
  await page.clock.runFor(1_000);
  await done.click();
  await expect.poll(async () => (await readSets(page)).length).toBe(1);
  const [row] = await readSets(page);
  expect(row?.exerciseId).toBe(ROW);
  expect(Object.keys(row?.sides ?? {}).sort()).toEqual(['left', 'right']);
  // (Nothing counted on the left: the left logs the reps carried over, as a two-arm set with
  // nothing counted logs the stepper's value. The camera e2e, task 18, counts real reps.)
  expect(row?.reps).toBe(Math.min(row?.sides?.right?.reps ?? 0, row?.sides?.left?.reps ?? 0));

  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a two-arm exercise is unchanged: Set done from the start, no side label, no Next arm', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page);
  await page
    .getByRole('button', { name: /Push A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bench Press' })).toBeVisible();
  await expect(page.locator('[data-side-label]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next arm' })).toHaveCount(0);
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-rest-clock]')).toBeVisible();
  await expect.poll(async () => (await readSets(page)).length).toBe(1);
  expect((await readSets(page))[0]?.sides).toBeUndefined();
  const said = await spoken(page);
  expect(said).not.toContain(START);
  expect(said).not.toContain(SWITCH);
  expect(errors).toEqual([]);
});

// Task 17 finding, fixed in app.ts (speakSideStart on the focus-cue edge): the workout's first set
// (Pull A opens on the row) says "Right arm first." too, not only a set started from rest.
test('"Right arm first." is spoken when the workout opens on the row', async ({ page }) => {
  await openApp(page);
  await startPullA(page);
  await expect(page.locator('[data-side-label]').first()).toHaveText('Right arm');
  await expect.poll(() => spoken(page), { timeout: 2_000 }).toContain(START);
  expect((await spoken(page)).filter((l) => l === START)).toHaveLength(1);
});
