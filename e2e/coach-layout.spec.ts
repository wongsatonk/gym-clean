// M12 slice 2 follow-up: the Coach tab gives the thread most of the screen at 390×844. On the
// iPhone (402×874) the quick chips wrapped onto six rows, and with the text box, the brain note
// and the privacy line the thread was a ~70pt strip whose newest reply needed scrolling. Here:
// the thread is ≥ 45% of the viewport with the keyboard closed (empty thread, a reply with its
// quick chips, a pending proposal with its note), the newest message is in view without
// scrolling the thread, the quick chips are one row that scrolls sideways inside itself
// (≥ 56px), and nothing overflows the page sideways. A card taller than the thread opens at its
// top (read from the start), not its end.
import { expect, test, type Page } from './fixtures';
import {
  animationsSettled,
  at,
  coachTab,
  expectTapTargets,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';

const VIEW_H = 844;

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

/** Thread height and whether the newest thread item is wholly inside it (no thread scrolling). */
async function threadLayout(page: Page) {
  // Let the scroll-to-newest frame and any rise-ins run.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  return page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('[data-screen="coach"] .chat-scroll');
    if (!scroll) throw new Error('no thread');
    const box = scroll.getBoundingClientRect();
    const items = scroll.querySelectorAll<HTMLElement>('.chat-list > .chat-item');
    const newest = items[items.length - 1];
    const n = newest?.getBoundingClientRect();
    // The newest item's top is in view (a tall card may run past the bottom: its start shows).
    const newestTopInView = !n || (n.top >= box.top - 1 && n.top < box.bottom - 40);
    const newestBottomInView = !n || n.bottom <= box.bottom + 1;
    return {
      height: box.height,
      newestTopInView,
      newestBottomInView,
    };
  });
}

test('the thread gets most of the Coach tab: chips in one sideways row, newest reply in view', async ({
  page,
}, testInfo) => {
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await goCoach(page);

  // Empty thread: the starters live in the thread, so it is already the big part.
  expect((await threadLayout(page)).height).toBeGreaterThanOrEqual(VIEW_H * 0.45);
  await noHorizontalOverflow(page);

  // An open question: the coach answers with what it can help with + every quick chip, under it.
  const box = coachTab(page).getByLabel('Ask the coach');
  await box.fill('hello there');
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
  await expect(coachTab(page).locator('.cs-msg-coach')).toHaveCount(1);
  const quick = coachTab(page).locator('.chat-quick');
  await expect(quick).toBeVisible();
  // "I can help with:" is a lead-in: its chips sit right under its bubble (in the thread), not
  // in the dock, so the bubble never reads as a cut-off sentence.
  await expect(
    coachTab(page).locator('li.chat-item-coach').last().locator('.chat-quick'),
  ).toHaveCount(1);
  await expect(coachTab(page).locator('.chat-dock .chat-quick')).toHaveCount(0);
  // One row: every chip on the same line, the row scrolls inside itself, the page never does.
  const tops = await quick
    .locator('.cs-chip')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  await noHorizontalOverflow(page);
  await expectTapTargets(page, '[data-screen="coach"]');

  let t = await threadLayout(page);
  expect(t.height).toBeGreaterThanOrEqual(VIEW_H * 0.45);
  expect(t.newestBottomInView).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('coach-layout-reply.png') });

  // A pending proposal (Not today) with the thread already holding a turn: the card starts in
  // view, the thread is still the big part.
  await quick.locator('[data-coach-chip="notToday"]').click();
  await expect(coachTab(page).locator('.proposal-card')).toBeVisible();
  t = await threadLayout(page);
  expect(t.height).toBeGreaterThanOrEqual(VIEW_H * 0.45);
  expect(t.newestTopInView).toBe(true);
  await noHorizontalOverflow(page);
  await animationsSettled(page);
  await page.screenshot({ path: testInfo.outputPath('coach-layout-proposal.png') });
  // Its Apply is a short scroll down inside the thread.
  await coachTab(page).getByRole('button', { name: 'Apply' }).scrollIntoViewIfNeeded();
  await expect(coachTab(page).getByRole('button', { name: 'Apply' })).toBeInViewport();

  expect(errors).toEqual([]);
});

/** Types `text`, sends it and waits for the coach's answer (retries if a re-render swapped the box). */
async function ask(page: Page, text: string) {
  const tab = coachTab(page);
  const coach = tab.locator('li.chat-item-coach');
  const mine = tab.locator('.cs-msg-user');
  const replies = await coach.count();
  const sent = await mine.count();
  await expect(async () => {
    if ((await mine.count()) === sent) {
      await tab.getByLabel('Ask the coach').fill(text);
      await tab.getByRole('button', { name: 'Send' }).click();
    }
    await expect(mine).toHaveCount(sent + 1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(coach).toHaveCount(replies + 1);
  await expect(tab.locator('[data-chat-typing]')).toHaveCount(0);
}

test('Checkpoint J: every new reply scrolls into view, and stays there when the thread box shrinks', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await goCoach(page);
  for (const q of [
    // Plain text replies (a proposal card taller than the thread opens at its top instead).
    'How was my week?',
    'What should I train today?',
    'How was my week?',
    'What should I train today?',
    'How was my week?',
    'What should I train today?',
  ]) {
    await ask(page, q);
    await animationsSettled(page);
    const l = await threadLayout(page);
    expect(l.newestTopInView).toBe(true);
    expect(l.newestBottomInView).toBe(true);
  }
  // The thread is long enough to scroll (else this proves nothing).
  const scrollable = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('[data-screen="coach"] .chat-scroll');
    return s ? s.scrollHeight > s.clientHeight + 40 : false;
  });
  expect(scrollable).toBe(true);
  // The box shrinks after the reply (keyboard opening, a taller chip row): still the newest.
  await page.addStyleTag({ content: '.chat-dock { padding-bottom: 220px; }' });
  const l = await threadLayout(page);
  expect(l.newestBottomInView).toBe(true);
  expect(l.newestTopInView).toBe(true);
  expect(errors).toEqual([]);
});

test('Checkpoint J: after the keyboard closes, the page scrolls back (no title above the screen)', async ({
  page,
}) => {
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await goCoach(page);
  // Stand-in for WKWebView: let the page scroll, then move it up while the text box has focus,
  // as iOS does to show the box over the keyboard.
  await page.addStyleTag({ content: 'body { padding-bottom: 900px; }' });
  const box = coachTab(page).getByLabel('Ask the coach');
  await box.focus();
  await page.evaluate(() => window.scrollTo(0, 300));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await box.blur();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.locator('[data-screen="coach"] h1, [data-screen="coach"] .chat-head').first(),
  ).toBeInViewport();
  // After a send (re-render + refocus) and then closing: back at the top again.
  await box.focus();
  await page.evaluate(() => window.scrollTo(0, 300));
  await ask(page, 'How was my week?');
  await coachTab(page).getByLabel('Ask the coach').blur();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await noHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
