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
