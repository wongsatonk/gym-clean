// Shared by e2e specs (not a spec itself): turn "Hands-free sets" (M5c, default ON) off for
// specs that test the M4/M4c per-set camera, where Set done closes the sheet.
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Stores `handsFree: false` in the app's IndexedDB settings, then reloads so the app starts with
 * it. Call after the first page.goto('/'): it waits for the app to have created its database.
 */
export async function seedHandsFreeOff(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve) => {
            void indexedDB.databases().then((dbs) => {
              if (!dbs.some((d) => d.name === 'gym-clean')) return resolve(false);
              const open = indexedDB.open('gym-clean');
              open.onerror = () => resolve(false);
              open.onsuccess = () => {
                const d = open.result;
                if (!d.objectStoreNames.contains('settings')) {
                  d.close();
                  return resolve(false);
                }
                const tx = d.transaction('settings', 'readwrite');
                tx.objectStore('settings').put({ key: 'handsFree', value: false });
                tx.oncomplete = () => {
                  d.close();
                  resolve(true);
                };
                tx.onerror = () => resolve(false);
              };
            });
          }),
      ),
    )
    .toBe(true);
  await page.reload();
}

/**
 * Taps Camera and waits for `ready` (default: a tracked person). On a loaded machine Chrome's
 * fake capture device sometimes fails to start ("Could not start video source",
 * NotReadableError / AbortError): the sheet shows the camera error, as it should. That is the
 * test machine, not the app, so close the sheet and open it again (up to 3 tries).
 */
export async function openCameraSheet(
  page: Page,
  ready: (cam: Locator) => Promise<void> = (cam) =>
    expect(cam).toHaveAttribute('data-person', 'true', { timeout: 15_000 }),
): Promise<Locator> {
  const cam = page.getByRole('dialog', { name: 'Camera' });
  for (let attempt = 1; ; attempt++) {
    await page.getByRole('button', { name: 'Camera', exact: true }).click();
    await expect(cam).toBeVisible();
    // Opened (data-delegate: the model is loaded), or the device error.
    await expect
      .poll(
        async () =>
          (await cam.getAttribute('data-error')) ?? (await cam.getAttribute('data-delegate')),
        {
          timeout: 30_000,
        },
      )
      .not.toBeNull();
    const error = await cam.getAttribute('data-error');
    if (error === null || !/NotReadableError|AbortError/.test(error) || attempt === 3) break;
    await cam.locator('.cam-top').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(cam).toHaveCount(0);
  }
  await ready(cam);
  return cam;
}
