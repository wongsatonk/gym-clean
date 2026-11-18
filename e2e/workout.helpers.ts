// Shared by e2e specs (not a spec itself): Skip exercise and End workout live only in the Pause
// sheet (M4e A10/A11), so these open it from the workout top bar first.
import { expect, type Page } from '@playwright/test';

/** Taps Pause in the workout top bar and waits for the Pause sheet. */
export async function openPause(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
}

/** Pause → Skip exercise. The sheet resumes the session, then skips. */
export async function skipExercise(page: Page): Promise<void> {
  await openPause(page);
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Skip exercise' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toHaveCount(0);
}

/** Pause → End workout → Tap again to end (the two-tap confirmation). Lands on Summary. */
export async function endWorkout(page: Page): Promise<void> {
  await openPause(page);
  const sheet = page.getByRole('dialog', { name: 'Paused' });
  await sheet.getByRole('button', { name: 'End workout' }).click();
  await sheet.getByRole('button', { name: 'Tap again to end' }).click();
  await expect(page.getByRole('heading', { name: 'Workout done' })).toBeVisible();
}

/** Leaves Settings for Today through the tab bar (M4e: Settings has no "‹ Back"). */
export async function leaveSettings(page: Page): Promise<void> {
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-screen="settings"], main.settings')).toHaveCount(0);
}
