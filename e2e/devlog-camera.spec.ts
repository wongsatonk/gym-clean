import { expect, test, type Page } from '@playwright/test';
import { seedHandsFreeOff } from './hands-free.helpers';
import { endWorkout } from './workout.helpers';

// M4c gym-session data path: a real camera set (fake camera = synthetic curl clip) is recorded in
// the developer log with frames, rep events, spoken counts, counted vs corrected numbers, and the
// export carries all of it. Runs in the `mobile-person-camera` project (one worker).

declare global {
  interface Window {
    __spoken: string[];
    __shared: File[];
  }
}

async function installMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__spoken = [];
    window.__shared = [];
    // EventTarget: voice.ts listens for end/error on each utterance.
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
          if (u.text && (u as { volume?: number }).volume !== 0) window.__spoken.push(u.text); // skip the silent iOS unlock
        },
        cancel: () => undefined,
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
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d?: ShareData) => Boolean(d?.files?.length),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        window.__shared.push(...(d.files ?? []));
      },
    });
  });
}

type ExportSet = {
  exerciseId: string;
  setIndex: number;
  counted?: { reps: number; partials: number };
  logged?: { reps: number; partials: number };
  camera?: {
    folder: string;
    wallT0?: number;
    frames: { t: number; landmarks: unknown[] | null }[];
    repEvents: unknown[];
    speech: { text: string; kind: string }[];
  };
};
type ExportLog = {
  format: string;
  sessions: { dayId: string; events: { type: string }[]; sets: ExportSet[] }[];
};

test('camera set → dev log has frames, rep events, spoken counts and the corrected numbers', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // MediaPipe's usage-log fetch is blocked by our CSP on purpose (Decisions, M3 privacy).
  const USAGE_LOG = 'https://odml.pa.googleapis.com/v1/log';
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes(USAGE_LOG)) errors.push(m.text());
  });
  const sent: string[] = [];
  page.on('requestfinished', (r) => sent.push(r.url()));

  await installMocks(page);
  await page.goto('/');
  // M4 per-set camera (Set done closes the sheet): hands-free off.
  await seedHandsFreeOff(page);

  // Pull A → exercise list → Dumbbell Bicep Curl → Camera.
  await page.getByRole('button', { name: /Pull A/ }).click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await list.locator('.ex-row-btn', { hasText: 'Dumbbell Bicep Curl' }).click();
  await expect(page.getByRole('heading', { name: 'Dumbbell Bicep Curl' })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });

  // GitHub's runners have no GPU (~2.5 fps): too slow to catch a curl's bottom, so CI skips this
  // live test below 8 fps (same rule as rep-count.spec.ts). Locally it always runs.
  if (process.env.CI) {
    await expect
      .poll(async () => Number(await cam.getAttribute('data-fps')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(3_000); // let the rolling fps meter settle
    const measured = Number(await cam.getAttribute('data-fps'));
    test.skip(measured < 8, `live inference at ${measured} fps (< 8) on this CI runner`);
  }

  // At least one counted rep (bounded wait).
  await expect
    .poll(async () => Number((await cam.locator('[data-reps]').getAttribute('data-reps')) ?? 0), {
      timeout: 60_000,
      intervals: [250],
    })
    .toBeGreaterThanOrEqual(1);

  await cam.getByRole('button', { name: 'Set done' }).click();
  await expect(cam).toHaveCount(0);
  await expect(page.locator('[data-rest-clock]')).toBeVisible();

  // Rest: fix the last set to 5 reps, 0 partials.
  const fix = page.locator('[data-lsc=panel]');
  await fix.locator('[data-lsc=fix]').click();
  const repsValue = fix.locator('[data-lsc=reps-value]');
  const partialsValue = fix.locator('[data-lsc=partials-value]');
  for (let i = 0; i < 40 && Number(await repsValue.textContent()) !== 5; i++) {
    const n = Number(await repsValue.textContent());
    await fix.locator(n > 5 ? '[data-lsc=reps-minus]' : '[data-lsc=reps-plus]').click();
  }
  for (let i = 0; i < 40 && Number(await partialsValue.textContent()) > 0; i++) {
    await fix.locator('[data-lsc=partials-minus]').click();
  }
  await expect(repsValue).toHaveText('5');
  await expect(partialsValue).toHaveText('0');
  await fix.locator('[data-lsc=save]').click();
  await expect(fix.locator('[data-lsc=summary]')).toHaveText('5 reps');

  // End workout (two taps) → Summary → Done.
  await endWorkout(page);
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // Settings → Export last session (mocked share sheet) → unzip in the page.
  await page.getByRole('button', { name: 'Settings' }).click();
  const panel = page.locator('[data-devlog=panel]');
  await expect(panel).toHaveAttribute('data-sessions', '1');
  await panel.locator('[data-devlog=export-last]').click();
  await expect(panel.locator('[data-devlog=status]')).toHaveText('Shared.', { timeout: 15_000 });
  const shared = await page.evaluate(async () => {
    const file = window.__shared.at(-1);
    if (!file) return null;
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    return { name: file.name, text: await new Response(stream).text() };
  });
  expect(shared?.name).toMatch(/^gym-clean-devlog-.*-last\.json\.gz$/);
  const log = JSON.parse(shared?.text ?? '{}') as ExportLog;
  expect(log.format).toBe('gym-clean-devlog');
  expect(log.sessions).toHaveLength(1);
  const session = log.sessions[0];
  if (!session) throw new Error('no session in the export');
  expect(session.dayId).toBe('pull-a');

  // Exactly the curl set, recorded from the camera.
  // Jumping away from the row via the list must not leave an unlogged row set behind.
  expect
    .soft(session.sets.map((s) => [s.exerciseId, s.setIndex]))
    .toEqual([['Dumbbell_Bicep_Curl', 0]]);
  const set = session.sets.find((s) => s.exerciseId === 'Dumbbell_Bicep_Curl');
  const camera = set?.camera;
  if (!set || !camera) throw new Error('the curl set has no camera data');
  expect(camera.folder).toBe('curl');
  expect(camera.frames.length).toBeGreaterThan(0);
  expect(camera.frames.some((f) => Array.isArray(f.landmarks) && f.landmarks.length > 0)).toBe(
    true,
  );
  expect(camera.repEvents.length).toBeGreaterThanOrEqual(1);
  expect(camera.speech.some((s) => s.kind === 'count')).toBe(true);
  expect(set.counted?.reps ?? 0).toBeGreaterThanOrEqual(1);
  expect(set.logged).toEqual({ reps: 5, partials: 0 });
  expect(session.events.some((e) => e.type === 'correction')).toBe(true);
  expect(camera.wallT0 ?? 0).toBeGreaterThan(0);

  // Privacy: nothing completed against a third-party host.
  const origin = new URL(page.url()).origin;
  const external = (u: string) =>
    !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:');
  expect(sent.filter(external)).toEqual([]);
  expect(errors).toEqual([]);
});
