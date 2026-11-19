// M12 task 18: the Coach tab, end to end in the real app at 390×844 (SPEC M12 goals 1–4).
// Five tabs with Coach raised in the centre; an empty thread shows the starters; a starter gets
// a rule answer; Not today → Apply → Undo on the card in the thread; the thread survives a
// reload; Clear chat (two taps) empties it for good; Today's / the preview's Coach buttons and
// the openers (missing-kit prompt, a Calendar day's Move: today → Not today, a later day → "Move
// X to which day?") open the tab with their chip already sent; the Pause sheet shows the same
// thread as a compact chat with the workout chips only; nothing to type during a set; a red flag mid-workout is the one line that is spoken.
// Replies on the tab are shown, never spoken. No request leaves the dev server (route-asserted).
// M13c task 18: a question the phone's coach can't answer → the "Claude could help with this"
// card (both lists, "Your key isn't set up yet."); Tell me when it's ready stores settings coach
// claudeWanted 'yes', Not now stores nothing but the date; once a day; never after "no"; no request
// to any host but the page's (the card sends nothing: no Claude client exists in 1.16.0).
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  coachTab,
  expectTapTargets,
  getSetting,
  guardNetwork,
  leaveCoach,
  noHorizontalOverflow,
  offDevice,
  openApp,
  putSetting,
  record,
  seed,
  revealNotice,
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
  // M13d task 40f: Apply is the main round button (a wide pill), Not now a secondary circle.
  await expect(card.getByRole('button', { name: 'Apply' })).toHaveAttribute('data-variant', 'main');
  await expect(card.getByRole('button', { name: 'Not now' })).toHaveAttribute(
    'data-variant',
    'secondary',
  );
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

  // M13: Today has no header Coach button (the tab is the way in): nothing sent for him (last
  // week's recap may be there).
  await expect(page.locator('[data-screen="today"] [data-coach-open]')).toHaveCount(0);
  await page.locator('[data-tab="coach"]').click();
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
  await revealNotice(page, page.locator('[data-gym-prompt="Leg_Press"]'));
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

// ---------- M13c: the Claude explain card ----------

/** A question the rules coach can't answer (its "I can help with:" fallback). */
const OFF_TOPIC = 'What is the capital of France?';
const claudeCard = (page: Page) => coachTab(page).locator('[data-claude-offer]');

async function askCoach(page: Page, text: string) {
  await coachTab(page).getByLabel('Ask the coach').fill(text);
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
  await expect(bubbles(page, 'user').last()).toContainText(text);
}

/** Both lists exactly as core's CLAUDE_SENDS / CLAUDE_NEVER_SENDS (read from the page's modules). */
async function expectBothLists(page: Page) {
  const lists = await page.evaluate(async () => {
    const m = await import('/src/core/trainer/claude/sends.ts' as string);
    const ids = (l: { id: string }[]) => l.map((x) => x.id);
    return { sends: ids(m.CLAUDE_SENDS), never: ids(m.CLAUDE_NEVER_SENDS) };
  });
  expect(lists.sends.length).toBeGreaterThan(0);
  expect(lists.never.length).toBeGreaterThan(0);
  const card = claudeCard(page);
  expect(
    await card
      .locator('[data-claude-sends] [data-claude-send]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-claude-send'))),
  ).toEqual(lists.sends);
  expect(
    await card
      .locator('[data-claude-never] [data-claude-never-item]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-claude-never-item'))),
  ).toEqual(lists.never);
}

test("Claude card: an off-topic question → the card with both lists → Tell me when it's ready stores 'yes'; once a day; nothing sent", async ({
  page,
  baseURL,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { requests, errors } = record(page);
  await openApp(page, at(18, 18));
  await goCoach(page);

  await askCoach(page, OFF_TOPIC);
  await expect(bubbles(page, 'coach').last()).toContainText('I can help with:');
  const card = claudeCard(page);
  await expect(card).toBeVisible();
  // It sits under the reply that couldn't help; the thread shows the start of that turn, and
  // the card's title is on screen without scrolling.
  await expect(bubbles(page, 'coach').last()).toBeInViewport();
  await expect(card.locator('.co-title')).toBeInViewport();
  await expect(card).toContainText('Claude could help with this');
  await expect(card).toContainText('What would be sent');
  await expect(card).toContainText('Never sent');
  await expect(card).toContainText("Your key isn't set up yet.");
  await expectBothLists(page);
  // Exactly two answers, the same size, both ≥ 56px.
  await expect(card.getByRole('button')).toHaveCount(2);
  const wanted = card.locator('[data-claude-offer-wanted]');
  const notNow = card.locator('[data-claude-offer-dismiss]');
  await expect(wanted).toHaveText("Tell me when it's ready");
  await expect(notNow).toHaveText('Not now');
  await expectTapTargets(page, '[data-claude-offer]');
  // M13d task 40f: two secondary round buttons, side by side, the same size (equal weight).
  {
    await card.scrollIntoViewIfNeeded();
    const [w, n] = [await wanted.boundingBox(), await notNow.boundingBox()];
    if (!w || !n) throw new Error('no Claude card buttons');
    expect(Math.abs(w.width - n.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(w.height - n.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(w.y - n.y)).toBeLessThanOrEqual(1);
    await expect(wanted).toHaveAttribute('data-variant', 'secondary');
    await expect(notNow).toHaveAttribute('data-variant', 'secondary');
  }
  await noHorizontalOverflow(page);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-claude-card.png') });
  // Shown today: saved so it shows once a day.
  await expect.poll(() => getSetting(page, 'claudeOffer')).toEqual({ lastShownDate: '2026-11-18' });

  await wanted.click();
  await expect(claudeCard(page)).toHaveCount(0);
  await expect
    .poll(() => getSetting(page, 'coach'))
    .toEqual(expect.objectContaining({ claudeWanted: 'yes' }));

  // Once a day: another question the coach can't answer → no second card, also after a reload.
  await askCoach(page, 'Who won the football last night?');
  await expect(bubbles(page, 'coach').last()).toContainText('I can help with:');
  await expect(claudeCard(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(bubbles(page, 'user').last()).toContainText('football');
  await expect(claudeCard(page)).toHaveCount(0);

  // Shown, never spoken; nothing left the page's own host.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Claude card: Not now saves only the date; it comes back the next day; never after "no"', async ({
  page,
  baseURL,
}) => {
  const offsite = await guardNetwork(page);
  const { requests, errors } = record(page);
  await openApp(page, at(18, 18));
  await goCoach(page);

  // A real answer gets no card.
  await coachTab(page).locator('[data-coach-starter="week"]').click();
  await expect(bubbles(page, 'coach')).toHaveCount(1);
  await expect(claudeCard(page)).toHaveCount(0);

  await askCoach(page, OFF_TOPIC);
  await expect(claudeCard(page)).toBeVisible();
  await claudeCard(page).locator('[data-claude-offer-dismiss]').click();
  await expect(claudeCard(page)).toHaveCount(0);
  await expect.poll(() => getSetting(page, 'claudeOffer')).toEqual({ lastShownDate: '2026-11-18' });
  const coach = (await getSetting(page, 'coach')) as { claudeWanted?: string } | undefined;
  expect(coach?.claudeWanted).toBeUndefined();

  // The next day: the card can show again.
  await page.clock.setSystemTime(at(19, 18));
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await askCoach(page, OFF_TOPIC);
  await expect(claudeCard(page)).toBeVisible();
  await expect.poll(() => getSetting(page, 'claudeOffer')).toEqual({ lastShownDate: '2026-11-19' });

  // "No" (the to-do's answer) → never again, even on a new day.
  const prev = ((await getSetting(page, 'coach')) ?? {}) as Record<string, unknown>;
  await putSetting(page, 'coach', { ...prev, claudeWanted: 'no' });
  await page.clock.setSystemTime(at(20, 18));
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await askCoach(page, 'What is the capital of Spain?');
  await expect(bubbles(page, 'coach').last()).toContainText('I can help with:');
  await expect(claudeCard(page)).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offDevice(requests, baseURL)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
