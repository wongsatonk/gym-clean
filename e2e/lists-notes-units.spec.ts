import { expect, test } from '@playwright/test';
import { endWorkout, leaveSettings } from './workout.helpers';

test('lb units, notes, exercise list jump and last time carry across sessions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // Settings: switch to lb
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'lb', exact: true }).click();
  await expect(page.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await leaveSettings(page);

  // Preview: Push A list with lb weights (15 kg plan -> 35 lb)
  await page.getByRole('button', { name: /Push A/ }).click();
  const rows = page.locator('.ex-row');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('Dumbbell Bench Press');
  await expect(rows.first()).toContainText('4 × 8 reps · 35 lb');
  await page.getByRole('button', { name: 'Start workout' }).click();

  // Exercise: lb stepper steps by 5
  const lb = page.getByLabel('lb', { exact: true });
  await expect(lb).toHaveText('35');
  await page.getByRole('button', { name: 'lb plus' }).click();
  await expect(lb).toHaveText('40');

  // Notes: machine setting + lasting note + today's note
  await page.getByRole('button', { name: 'Notes and machine setting' }).click();
  await page.getByLabel('Machine setting', { exact: true }).fill('Bench notch 3');
  await page.getByLabel('Exercise note').fill('Arch a little');
  await page.getByLabel('Today’s note').fill('felt strong');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Machine: Bench notch 3')).toBeVisible();
  await expect(page.getByText('Arch a little')).toBeVisible();

  // Set done -> rest shows today's set
  await page.getByRole('button', { name: 'Set done' }).click();
  await expect(page.locator('[data-today]')).toHaveText('Today: 8×40 lb');

  // List: jump to Side Lateral Raise while resting
  await page.getByRole('button', { name: 'Exercise list' }).click();
  const list = page.getByRole('dialog', { name: 'Exercise list' });
  await expect(list.locator('[data-ex-index="0"]')).toContainText('1/4 sets');
  await expect(list.locator('[data-ex-index="0"]')).toContainText('up next');
  await list.locator('[data-ex-index="3"]').click();
  await expect(page.locator('.next-up')).toContainText('Side Lateral Raise');
  await page.getByRole('button', { name: 'Start set' }).click();
  await expect(page.getByRole('heading', { name: 'Side Lateral Raise' })).toBeVisible();
  await expect(page.locator('[data-set-counter]')).toHaveText('Set 1 of 5');

  // End -> summary in lb with today's note
  await endWorkout(page);
  await expect(page.locator('[data-stat="volume"]')).toContainText('320');
  await expect(page.locator('[data-stat="volume"] .sum-volume-unit')).toHaveText('lb');
  await expect(page.getByText('“felt strong”')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  // Next session: last time, machine setting and weight default carry over; today's note is fresh
  await page.getByRole('button', { name: /Push A/ }).click();
  await expect(rows.first()).toContainText('Machine: Bench notch 3');
  await expect(rows.first()).toContainText('Last time: 8×40 lb');
  await expect(rows.first()).toContainText('· 40 lb');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(lb).toHaveText('40');
  await expect(page.locator('[data-last]')).toHaveText('Last time: 8×40 lb');
  await expect(page.locator('[data-today]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Notes and machine setting' }).click();
  await expect(page.getByLabel('Exercise note')).toHaveValue('Arch a little');
  await expect(page.getByLabel('Today’s note')).toHaveValue('');

  // Unit persists across reloads
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'lb', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  expect(errors).toEqual([]);
});
