// M12 slice 2 task 21: the weekly check-in, end to end at 390×844 (web; it needs no plugin). The
// card for a Mon–Sun week posts on the first Coach-tab open from its Sunday, and only once he has
// finished a session in that week (Decision, task 20): a fresh install gets none. Three 1–5
// questions → Done → a summary; the answers join the next week recap ("You rated energy 4, sleep
// 3, soreness 2."); due once a week; Skip stays skipped; everything survives a reload; the next
// week brings a new card. Shown, never spoken. No request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  coachTab,
  expectTapTargets,
  getRows,
  guardNetwork,
  leaveCoach,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
} from './app.helpers';

const card = (page: Page) => coachTab(page).locator('[data-checkin-card]');

/** A finished Push A on `day` (November 2026) at 18:00, with one set. */
function session(id: string, day: number) {
  const start = at(day, 18);
  return {
    sessions: [{ sessionId: id, dayId: 'push-a', startedAt: start, endedAt: start + 40 * MIN }],
    sets: [
      {
        sessionId: id,
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: 0,
        reps: 10,
        weightKg: 20,
        startedAt: start + MIN,
      },
    ],
  };
}

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

/** Opens the app on another day on the same phone (same database), closing `page`. */
async function reopenOn(page: Page, time: number): Promise<Page> {
  const next = await page.context().newPage();
  await page.close();
  await openApp(next, time);
  return next;
}

test('due once a week after a session: answer → summary; survives a reload; the answers join the week recap', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // Sun 15 Nov: the check-in for Mon 9 – Sun 15 opens today; he trained on Fri 13.
  await openApp(page, at(15, 10));
  const s = session('s1', 13);
  await seed(page, s.sessions, s.sets);
  await expect(page.locator('[data-cal]').first()).toBeVisible();

  await goCoach(page);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-week', '2026-11-09');
  await expect(card(page)).toHaveAttribute('data-card-status', 'pending');
  await expect(coachTab(page).locator('.cs-msg-coach').last()).toContainText(
    'Check-in: how did this week feel?',
  );
  await expect(card(page).locator('[data-checkin-done]')).toBeDisabled();
  await expectTapTargets(page, '[data-checkin-card]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-check-in.png') });

  for (const [q, n] of [
    ['energy', 4],
    ['sleep', 3],
    ['soreness', 2],
  ] as const) {
    const pick = card(page).locator(`[data-checkin-pick="${q}:${n}"]`);
    await pick.click();
    await expect(pick).toHaveAttribute('aria-checked', 'true');
  }
  await card(page).locator('[data-checkin-done]').click();
  await expect(card(page)).toHaveAttribute('data-card-status', 'done');
  await expect(card(page).locator('[data-checkin-summary="done"]')).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-check-in-done.png') });
  const rows = await getRows<Record<string, unknown>>(page, 'checkIns');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ weekStart: '2026-11-09', energy: 4, sleep: 3, soreness: 2 });

  // Due once: leaving and coming back posts nothing new.
  await leaveCoach(page);
  await goCoach(page);
  await expect(card(page)).toHaveCount(1);

  // Kept on the phone.
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-card-status', 'done');
  await expect(card(page).locator('[data-checkin-summary="done"]')).toBeVisible();
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(errors).toEqual([]);

  // Monday: the recap of last week carries the check-in line; no second check-in card.
  const mon = await reopenOn(page, at(16, 9));
  const monErrors = record(mon).errors;
  await goCoach(mon);
  const recap = coachTab(mon).locator('[data-recap="week"]', { hasText: '9 Nov' });
  await expect(recap).toHaveCount(1);
  await expect(recap).toContainText('You rated energy 4, sleep 3, soreness 2.');
  await expect(card(mon)).toHaveCount(1);
  await noHorizontalOverflow(mon);
  expect(await mon.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(monErrors).toEqual([]);
});

test('no session that week → no card; Skip stays skipped; the next week brings a new card', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // A fresh install on Sun 15: nothing trained, so no check-in.
  await openApp(page, at(15, 10));
  await goCoach(page);
  await expect(coachTab(page).getByLabel('Ask the coach')).toBeVisible();
  await expect(card(page)).toHaveCount(0);

  // After a session that week, the next open posts it; Skip this week.
  const s = session('s1', 13);
  await seed(page, s.sessions, s.sets);
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(card(page)).toHaveAttribute('data-card-status', 'pending');
  await card(page).locator('[data-checkin-skip]').click();
  await expect(card(page)).toHaveAttribute('data-card-status', 'skipped');
  await expect(card(page).locator('[data-checkin-summary="skipped"]')).toBeVisible();
  const rows = await getRows<{ weekStart: string; skipped?: boolean }>(page, 'checkIns');
  expect(rows).toEqual([expect.objectContaining({ weekStart: '2026-11-09', skipped: true })]);

  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await goCoach(page);
  await expect(card(page)).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-card-status', 'skipped');
  expect(errors).toEqual([]);

  // Sun 22, after a session on Tue 17: the week of Mon 16 gets its own card; last week's stays.
  const sun = await reopenOn(page, at(22, 10));
  const sunErrors = record(sun).errors;
  const t = session('s2', 17);
  await seed(sun, t.sessions, t.sets);
  await expect(sun.locator('[data-cal]').first()).toBeVisible();
  await goCoach(sun);
  await expect(card(sun)).toHaveCount(2);
  await expect(card(sun).last()).toHaveAttribute('data-week', '2026-11-16');
  await expect(card(sun).last()).toHaveAttribute('data-card-status', 'pending');
  await expect(card(sun).first()).toHaveAttribute('data-card-status', 'skipped');
  expect(await sun.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(sunErrors).toEqual([]);
});
