// M12 task 18: the Coach tab, end to end in the real app at 390×844 (SPEC M12 goals 1–4).
// Five tabs with Coach raised in the centre; an empty thread shows the starters; a starter gets
// a rule answer; Not today → Apply → Undo on the card in the thread; the thread survives a
// reload; Clear chat (two taps) empties it for good; Today's / the preview's Coach buttons and
// the openers (missing-kit prompt, a Calendar day's Move: today → Not today, a later day → "Move
// X to which day?") open the tab with their chip already sent; the Pause sheet shows the same
// thread as a compact chat with the workout chips only; nothing to type during a set; a red flag mid-workout is the one line that is spoken.
// Replies on the tab are shown, never spoken. No request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  coachTab,
  expectTapTargets,
  guardNetwork,
  leaveCoach,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
} from './app.helpers';
import { openPause } from './workout.helpers';

const RED_FLAG = 'Stop the workout for today and get checked by a doctor.';

const bubbles = (page: Page, role: 'user' | 'coach') => coachTab(page).locator(`.cs-msg-${role}`);

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(page.locator('[data-tab="coach"]')).toHaveAttribute('aria-current', 'page');
}

test('5 tabs with Coach in the centre; empty thread → starters → a rule answer; readable, not spoken', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));

  const tabs = page.locator('[data-tabbar] [data-tab]');
  await expect(tabs).toHaveCount(5);
  expect(await tabs.evaluateAll((els) => els.map((e) => e.getAttribute('data-tab')))).toEqual([
    'today',
    'fuel',
    'coach',
    'calendar',
    'settings',
  ]);
  // Every tab has a visible label and is ≥ 56px both ways at 390px.
  for (const label of ['Today', 'Fuel', 'Coach', 'Calendar', 'Settings'])
    await expect(page.locator('[data-tabbar]').getByText(label, { exact: true })).toBeVisible();
  const sizes = await tabs.evaluateAll((els) =>
    els.map((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height]),
  );
  for (const [w, h] of sizes) {
    expect(w).toBeGreaterThanOrEqual(56);
    expect(h).toBeGreaterThanOrEqual(56);
  }
  // The centre tab is drawn raised (its own class), not just placed in the middle.
  await expect(page.locator('[data-tab="coach"]')).toHaveClass(/tab-centre/);
  await expect(page.locator('[data-tab="today"]')).toHaveAttribute('aria-current', 'page');

  await goCoach(page);
  const starters = coachTab(page).locator('[data-coach-starter]');
  await expect(starters).toHaveCount(4);
  await expect(starters.first()).toHaveText("How's my week?");
  await expect(coachTab(page)).toContainText('Stays on this phone.');
  await expect(coachTab(page).getByLabel('Ask the coach')).toBeVisible();
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-coach-empty.png') });

  await coachTab(page).locator('[data-coach-starter="week"]').click();
  await expect(bubbles(page, 'user').last()).toContainText("How's my week?");
  await expect(bubbles(page, 'coach')).toHaveCount(1);
  await expect(bubbles(page, 'coach').last()).not.toBeEmpty();
  // The starters go once the thread has something in it.
  await expect(coachTab(page).locator('[data-coach-starter]')).toHaveCount(0);
  await noHorizontalOverflow(page);

  // Shown, never spoken (he's holding the phone).
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Not today → Apply → Undo in the thread; the thread survives a reload; Clear chat takes two taps', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();

  await goCoach(page);
  await coachTab(page).locator('[data-coach-chip="notToday"]').click();
  const card = coachTab(page).locator('[data-proposal]');
  await expect(card).toBeVisible();
  // While the card waits for an answer, Apply stays on screen: no quick chips, no text box.
  await expect(coachTab(page).locator('[data-coach-chip]')).toHaveCount(0);
  await expect(coachTab(page).getByLabel('Ask the coach')).toHaveCount(0);
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-coach-proposal.png') });

  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toContainText('Applied.');
  await expect(page.locator('[data-undo-toast]')).toHaveCount(0); // the card holds Undo
  await expectTapTargets(page, '[data-screen="coach"]');
  await page.screenshot({ path: testInfo.outputPath('m12-coach-applied.png') });
  await leaveCoach(page);
  await expect(page.locator('[data-hero="rest"]')).toBeVisible();

  await goCoach(page);
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();
  await leaveCoach(page);
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();

  // Kept on the phone: after a reload the thread and the card's outcome are still there.
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(bubbles(page, 'user').first()).toContainText('Not today');
  await expect(coachTab(page).locator('[data-card-status="undone"]')).toBeVisible();
  await expect(coachTab(page).locator('[data-coach-starter]')).toHaveCount(0);

  // Clear chat: the first tap only arms it.
  const clear = coachTab(page).locator('[data-chat-clear]');
  await clear.click();
  await expect(clear).toContainText('Tap again to clear');
  await expect(bubbles(page, 'user')).toHaveCount(1);
  await clear.click();
  await expect(coachTab(page).locator('[data-msg-id]')).toHaveCount(0);
  await expect(coachTab(page).locator('[data-coach-starter]')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(coachTab(page).locator('[data-msg-id]')).toHaveCount(0);
  await expect(coachTab(page).locator('[data-coach-starter]')).toHaveCount(4);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test("Today's and the preview's Coach buttons, the missing-kit prompt and a Calendar day's Move open the tab (chip sent)", async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // Fri 13 Nov 18:00, the five days before done in order: Legs B (with Leg Press) is up today.
  await openApp(page, at(13, 18));
  const days = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b'];
  await seed(
    page,
    days.map((dayId, i) => ({
      sessionId: `s-${dayId}`,
      dayId,
      startedAt: at(8 + i, 18),
      endedAt: at(8 + i, 18) + 50 * MIN,
    })),
    [],
  );
  await expect(page.locator('[data-hero="legs-b"]')).toBeVisible();

  // Today's Coach button: the tab opens, nothing sent for him (last week's recap may be there).
  await page.locator('[data-coach-open]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(page.locator('[data-tab="coach"]')).toHaveAttribute('aria-current', 'page');
  await expect(bubbles(page, 'user')).toHaveCount(0);
  await leaveCoach(page);

  // The preview's Coach button: the same tab.
  await page.locator('[data-hero="legs-b"] [data-start]').click();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
  await page.locator('[data-screen="preview"] [data-coach-open]').click();
  await expect(coachTab(page)).toBeVisible();
  await leaveCoach(page);

  // The missing-kit prompt's See a swap: his bubble + the swap proposal, already sent.
  await page.locator('[data-gym-prompt="Leg_Press"] [data-gym-swap]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(bubbles(page, 'user').last()).toContainText('Swap Leg Press');
  await expect(coachTab(page).locator('[data-proposal]').last()).toContainText('Leg Press');
  await coachTab(page)
    .locator('[data-proposal]')
    .last()
    .getByRole('button', { name: 'Not now' })
    .click();
  await expect(coachTab(page).locator('[data-card-status="dismissed"]')).toBeVisible();

  // A Calendar day's Move (today): the coach's Not today, already sent.
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-day="2026-11-13"]').click();
  await page.locator('[data-day-action="move"]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(bubbles(page, 'user').last()).toContainText('Not today');
  // A fresh proposal, waiting for his answer.
  await expect(
    coachTab(page).locator('[data-proposal]').last().getByRole('button', { name: 'Apply' }),
  ).toBeVisible();

  // A later day's Move: the coach's moveDay, already sent; it asks where to with date chips.
  await page.locator('[data-tab="calendar"]').click();
  await page.locator('[data-cal-day="2026-11-14"]').click();
  await page.locator('[data-day-action="move"]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(bubbles(page, 'user').last()).toHaveText('You: Move Sat 14 Nov');
  await expect(bubbles(page, 'coach').last()).toContainText(/Move .+ to which day\?/);
  await expect(coachTab(page).locator('[data-coach-followup]').first()).toBeVisible();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Pause sheet: the same thread as a compact chat, workout chips only; nothing to type during a set; a red flag is spoken once', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  // Something in the thread from the tab first.
  await goCoach(page);
  await coachTab(page).locator('[data-coach-starter="week"]').click();
  await expect(bubbles(page, 'coach')).toHaveCount(1);
  await leaveCoach(page);

  await page.locator('[data-hero="push-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  // During a set: no text box, no Coach entry, no tab bar.
  await expect(page.locator('input, textarea')).toHaveCount(0);
  await expect(page.locator('[data-coach-open]')).toHaveCount(0);
  await expect(page.locator('[data-tabbar]')).toHaveCount(0);

  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  const sheet = page.getByRole('dialog', { name: 'Coach' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-variant', 'sheet');
  // The same thread: the tab's question is here.
  await expect(sheet.locator('.cs-msg-user').first()).toContainText("How's my week?");
  // Only what can change what's left of this workout.
  expect(
    await sheet
      .locator('[data-coach-chip]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-coach-chip'))),
  ).toEqual(['easyOn', 'lighter', 'swap']);
  await expect(sheet.getByLabel('Ask the coach')).toBeVisible(); // paused: typing allowed
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible();
  await expectTapTargets(page, '[data-coach-sheet]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-pause-chat.png') });
  // Opening the chat says nothing (the workout's own cues came before).
  const before = await page.evaluate(() => window.__spoken.length);

  // A red flag: the fixed line, End workout, nothing else to tap or type; spoken once.
  await sheet.getByLabel('Ask the coach').fill('I have chest pain');
  await sheet.getByRole('button', { name: 'Send' }).click();
  const flag = sheet.locator('[data-redflag]');
  await expect(flag).toContainText(RED_FLAG);
  await expect(flag.getByRole('button', { name: 'End workout' })).toBeVisible();
  await expect(sheet.locator('[data-coach-chip]')).toHaveCount(0);
  await expect(sheet.getByLabel('Ask the coach')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((n) => window.__spoken.slice(n), before))
    .toEqual([RED_FLAG]);

  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  expect(await page.evaluate((n) => window.__spoken.slice(n), before)).toEqual([RED_FLAG]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
