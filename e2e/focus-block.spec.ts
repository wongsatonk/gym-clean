// M12 task 18: a focus block, end to end in the real app at 390×844 (SPEC M12 goal 6). He types
// "This month I want to build my chest"; the rule coach asks only what's missing (the days),
// then shows the week-by-week card; a typed edit ("only 4 days a week") revises it; a week
// expands to days and a day to exercises (focus exercises labelled); Apply marks the block's
// days on the Calendar (with the focus line in the week score); Undo on the card takes them all
// away. Shown, never spoken. No request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  at,
  coachTab,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

const block = (page: Page) => coachTab(page).locator('[data-focus-block-card]').last();

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

async function ask(page: Page, text: string) {
  await coachTab(page).getByLabel('Ask the coach').fill(text);
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
}

test('"This month I want to build my chest" → days question → card → edit → expand → Apply → Calendar marks the block → Undo', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await goCoach(page);

  // Group (chest) and weeks ("this month" = 4) are in the words: only the days are asked.
  await ask(page, 'This month I want to build my chest');
  const options = coachTab(page).locator('[data-coach-followup]');
  await expect(options.filter({ hasText: 'Keep my days' })).toBeVisible();
  await expect(options.filter({ hasText: '5 days' })).toBeVisible();
  await expect(coachTab(page).locator('[data-focus-block-card]')).toHaveCount(0);
  await expectTapTargets(page, '[data-screen="coach"]');
  await options.filter({ hasText: '5 days' }).click();

  // The card: 4 weeks, collapsed, Apply / Not now.
  await expect(block(page)).toBeVisible();
  await expect(block(page)).toHaveAttribute('data-proposal-status', 'pending');
  await expect(block(page).locator('[data-fb-week]')).toHaveCount(4);
  await expect(block(page).locator('[data-fb-week]').first()).toContainText('5 days');
  await expect(block(page).locator('[data-fb-week]').first()).toContainText(/chest/i);
  await expect(block(page).locator('[data-fb-week]').last()).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-focus-collapsed.png') });

  // An edit, typed while the card waits (no quick chips, but the text box stays), gives a
  // revised block.
  await expect(coachTab(page).locator('[data-coach-chip]')).toHaveCount(0);
  await ask(page, 'only 4 days a week');
  await expect(coachTab(page).locator('[data-focus-block-card]')).toHaveCount(2);
  await expect(block(page)).toHaveAttribute('data-proposal-status', 'pending');
  await expect(block(page).locator('[data-fb-week]').first()).toContainText('4 days');
  // Only the revised card keeps Apply: the first one reads expired.
  const older = coachTab(page).locator('[data-focus-block-card]').first();
  await expect(older).toHaveAttribute('data-proposal-status', 'expired');
  await expect(older.locator('[data-card-status="expired"]')).toBeVisible();
  await expect(older.getByRole('button', { name: 'Apply' })).toHaveCount(0);
  await expect(coachTab(page).getByRole('button', { name: 'Apply' })).toHaveCount(1);

  // Week → days → exercises, by keyboard as well as by tap.
  const week = block(page).locator('[data-fb-week]').first();
  await week.focus();
  await page.keyboard.press('Enter');
  await expect(week).toHaveAttribute('aria-expanded', 'true');
  const day = block(page).locator('[data-fb-day]').first();
  await expect(day).toBeVisible();
  await day.click();
  await expect(day).toHaveAttribute('aria-expanded', 'true');
  await expect(block(page).locator('[data-fb-ex]').first()).toBeVisible();
  // The lighter last week is labelled when opened.
  const last = block(page).locator('[data-fb-week]').last();
  await last.click();
  await expect(block(page)).toContainText('Lighter week');
  // Some day of the block has a labelled focus exercise (words, not colour alone).
  const days = block(page).locator('[data-fb-day]:visible'); // weeks 1 and 4 are open
  const n = await days.count();
  for (let i = 0; i < n; i++) {
    const d = days.nth(i);
    if ((await d.getAttribute('aria-expanded')) === 'false') await d.click();
  }
  const focusRow = block(page).locator('[data-fb-ex][data-fb-focus]').first();
  await expect(focusRow).toContainText('Focus');
  await expectTapTargets(page, '[data-focus-block-card]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-focus-expanded.png'), fullPage: true });

  // Apply: the Calendar marks the block's days.
  await block(page).getByRole('button', { name: 'Apply' }).click();
  await expect(block(page).locator('[data-card-status="applied"]')).toBeVisible();
  await page.locator('[data-tab="calendar"]').click();
  await expect(page.locator('main[data-screen="calendar"]')).toBeVisible();
  const marked = page.locator('[data-cal-day][data-focus="true"]');
  await expect(marked.first()).toBeVisible();
  // Today starts the block (no session yet today).
  await expect(page.locator('[data-cal-day="2026-11-13"]')).toHaveAttribute('data-focus', 'true');
  await expect(page.locator('[data-cal-day="2026-11-12"]')).not.toHaveAttribute('data-focus');
  await expect(page.locator('[data-cal-day="2026-11-13"]')).toHaveAttribute(
    'aria-label',
    /chest focus block/,
  );
  await expect(page.locator('[data-legend="focus"]')).toBeVisible();
  await expect(page.locator('[data-score="week"] [data-score-focus]')).toContainText(
    /Chest focus: \d+ of \d+ sets/,
  );
  await noHorizontalOverflow(page);

  // Undo on the card: every block day is gone from the Calendar.
  await goCoach(page);
  await block(page).getByRole('button', { name: 'Undo' }).click();
  await expect(block(page).locator('[data-card-status="undone"]')).toBeVisible();
  await page.locator('[data-tab="calendar"]').click();
  await expect(page.locator('main[data-screen="calendar"] [data-cal-day]').first()).toBeVisible();
  await expect(page.locator('[data-cal-day][data-focus="true"]')).toHaveCount(0);
  await expect(page.locator('[data-legend="focus"]')).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
