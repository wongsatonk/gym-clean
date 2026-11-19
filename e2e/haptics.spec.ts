// M13d task 39 (SPEC M9 "light haptics on Set done / Apply", M13d Goal 7): in the iPhone app a
// press on a `main` round button gives one light tap; a secondary press gives none; a press that
// leaves the button before release (a scroll) gives none. Set done is a main action mid-set and
// keeps its light tap (SPEC M9 allows it on Set done and Apply; the haptic is the confirmation
// he feels without looking).
//
// Native fakes (made up, nothing leaves the page): `window.Capacitor` says native ('ios') and
// carries a fake `Plugins.Haptics` whose `impact({ style })` records the style on
// `window.__impacts`; src/native/haptics.ts picks a plugin already on `Capacitor.Plugins` before
// importing `@capacitor/haptics`. Other native plugins are absent, so those features stay off.
import { expect, test, type Page } from './fixtures';
import { at, guardNetwork, installMocks, record } from './app.helpers';

declare global {
  interface Window {
    __impacts: string[];
  }
}

test.use({ colorScheme: 'dark' });

const NOW = at(13, 18);

async function installHaptics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__impacts = [];
    const w = window as unknown as {
      Capacitor?: { Plugins?: Record<string, unknown> } & Record<string, unknown>;
    };
    const plugins = { ...(w.Capacitor?.Plugins ?? {}) };
    plugins.Haptics = {
      impact: async ({ style }: { style: string }) => {
        window.__impacts.push(style);
      },
    };
    w.Capacitor = {
      ...(w.Capacitor ?? {}),
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: plugins,
    };
  });
}

const impacts = (page: Page) => page.evaluate(() => window.__impacts.length);

/** Lets a lazy haptics import settle, then reads the count. */
async function settledImpacts(page: Page): Promise<number> {
  await page.waitForTimeout(150);
  return impacts(page);
}

test('iPhone app: a main press taps once, a secondary press or a press dragged off does not; Set done taps', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await installHaptics(page);
  await installMocks(page);
  await page.clock.install({ time: NOW });
  await page.goto('/');
  const today = page.locator('main[data-screen="today"]');
  const main = today.locator('[data-icon-btn][data-variant="main"]').first();
  await expect(main).toBeVisible();
  await expect(today.locator('[aria-busy="true"]')).toHaveCount(0);
  expect(await settledImpacts(page)).toBe(0);

  // A secondary press (Search) and back: no tap.
  const search = today.locator('[data-search-open]');
  expect(await search.getAttribute('data-variant')).not.toBe('main');
  await search.click();
  const library = page.locator('main[data-screen="library"]');
  await expect(library).toBeVisible();
  expect(await settledImpacts(page)).toBe(0);
  await library.locator('[data-library-back]').click();
  await expect(today).toBeVisible();
  await expect(main).toBeVisible();

  // A press that leaves the main button before release (a scroll starting on it): no click, no tap.
  const box = await main.locator('.icon-btn-circle').boundingBox();
  if (!box) throw new Error('no circle');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(1, 1, { steps: 4 });
  await page.mouse.up();
  await expect(today).toBeVisible();
  expect(await settledImpacts(page)).toBe(0);

  // A main press (Today's Start): one light tap.
  await main.click();
  await expect.poll(() => impacts(page)).toBe(1);
  expect(await page.evaluate(() => window.__impacts)).toEqual(['LIGHT']);

  // Into the workout. Set done (main, mid-set): one more light tap, never more than one per press.
  const startWorkout = page.getByRole('button', { name: 'Start workout' });
  await expect(startWorkout).toBeVisible();
  const startIsMain = (await startWorkout.getAttribute('data-variant')) === 'main';
  await startWorkout.click();
  const ex = page.locator('main[data-screen="exercise"]');
  await expect(ex).toBeVisible();
  const before = startIsMain ? 2 : 1;
  await expect.poll(() => impacts(page)).toBe(before);
  const setDone = ex.locator('[data-set-done]');
  expect(await setDone.getAttribute('data-variant')).toBe('main');
  await page.clock.runFor(30_000);
  await setDone.click();
  await expect(page.locator('[data-screen="rest"]')).toBeVisible();
  await expect.poll(() => impacts(page)).toBe(before + 1);
  expect(await settledImpacts(page)).toBe(before + 1);
  expect(new Set(await page.evaluate(() => window.__impacts))).toEqual(new Set(['LIGHT']));

  // A secondary press mid-workout (Pause): no tap.
  const pause = page.getByRole('button', { name: 'Pause', exact: true });
  expect(await pause.getAttribute('data-variant')).not.toBe('main');
  await pause.click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  expect(await settledImpacts(page)).toBe(before + 1);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
