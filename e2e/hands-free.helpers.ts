// Shared by e2e specs (not a spec itself): turn "Hands-free sets" (M5c, default ON) off for
// specs that test the M4/M4c per-set camera, where Set done closes the sheet.
import { expect, type Page } from '@playwright/test';

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
