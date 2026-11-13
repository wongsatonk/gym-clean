import { expect, test } from '@playwright/test';

test('tracks a person on the live camera and drives the 3D skeleton', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Camera test' }).click();

  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toHaveAttribute('data-person', 'true', { timeout: 30_000 });
  await expect(cam.locator('.cam-status')).toContainText('tracking');
  // The 3D skeleton is collapsed behind "3D" (M4c) and loads on first open.
  await expect(cam.locator('.skeleton3d')).toHaveCount(0);
  await cam.getByRole('button', { name: '3D skeleton' }).click();
  const skel = cam.locator('.skeleton3d');
  await expect(skel).toHaveAttribute('data-live', 'true');

  // Side preset turns the skeleton 90°
  await cam.getByRole('button', { name: 'Side' }).click();
  await expect(skel).toHaveAttribute('data-angle', '-1.57');

  // Overlay canvas has drawn something (non-transparent pixels)
  const drawn = await cam.locator('.cam-overlay').evaluate((c: HTMLCanvasElement) => {
    const ctx = c.getContext('2d');
    if (!ctx || !c.width) return 0;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 16) if ((d[i] ?? 0) > 0) n++;
    return n;
  });
  expect(drawn).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});

test('dev-log recorder: person frames, rep events and the count speech are logged', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const load = (p: string) => import(p) as Promise<Record<string, unknown>>;
    const ui = await load('/src/ui/cameraView.ts');
    const log = {
      frames: 0,
      personFrames: 0,
      angles: 0,
      camera: {} as Record<string, unknown>,
      events: [] as { type: string }[],
      speech: [] as { t: number; text: string; kind: string }[],
    };
    (window as unknown as { __rec: typeof log }).__rec = log;
    type View = { el: HTMLElement; start(): Promise<void> };
    const view = (ui.createCameraView as (o: unknown) => View)({
      title: 'Dumbbell Bicep Curl',
      exerciseId: 'Dumbbell_Bicep_Curl',
      onClose() {},
      onSetDone() {},
      recorder: {
        active: true,
        sessionId: 'test',
        camera: (m: Record<string, unknown>) => Object.assign(log.camera, m),
        frame: (f: unknown) => {
          log.frames++;
          if (f !== null) log.personFrames++;
        },
        angle: (_t: number, a: number | null) => {
          if (a !== null) log.angles++;
        },
        repEvent: (ev: { type: string }) => log.events.push(ev),
        speech: (s: { t: number; text: string; kind: string }) => log.speech.push(s),
        fps: () => {},
      },
    });
    document.body.append(view.el);
    void view.start();
  });
  type Log = {
    frames: number;
    personFrames: number;
    angles: number;
    camera: Record<string, unknown>;
    events: { type: string }[];
    speech: { t: number; text: string; kind: string }[];
  };
  const rec = () => page.evaluate(() => (window as unknown as { __rec: Log }).__rec);
  // GitHub's runners have no GPU (~2.5 fps): too slow to count a curl, so CI skips this live
  // test below 8 fps (same rule as rep-count.spec.ts). Locally it always runs.
  if (process.env.CI) {
    const fpsEl = page.locator('[data-fps]').first();
    await expect
      .poll(async () => Number(await fpsEl.getAttribute('data-fps')), { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.waitForTimeout(3_000);
    const measured = Number(await fpsEl.getAttribute('data-fps'));
    test.skip(measured < 8, `live inference at ${measured} fps (< 8) on this CI runner`);
  }
  await expect
    .poll(async () => (await rec()).events.filter((e) => e.type === 'rep').length, {
      timeout: 75_000,
    })
    .toBeGreaterThanOrEqual(1);
  const log = await rec();
  expect(log.camera).toMatchObject({ folder: 'curl', side: 'right' });
  expect(log.personFrames).toBeGreaterThan(10);
  expect(log.angles).toBeGreaterThan(10);
  // The count word is logged on the frame clock (ms since the camera started).
  const one = log.speech.find((s) => s.text === 'One');
  expect(one?.kind).toBe('count');
  expect(one?.t ?? -1).toBeGreaterThan(0);
  const placement = log.speech.find((s) => s.kind === 'placement'); // logged too, on the frame clock
  expect(placement?.t ?? -1).toBeGreaterThanOrEqual(0);
  expect(Number(log.camera.wallT0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
