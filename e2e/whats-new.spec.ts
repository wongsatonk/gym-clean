// M12 slice 1c task 14: the What's New tour in the real app at 390×844 (SPEC M12 "What's New tour
// + To-do guides", goal 1 + 4). Once per release: an update (older `seenRelease` + a session)
// shows it over Today; Next / Back / Done, Skip, and Try it (closes the tour and deep-links) all
// mark the release seen, so a reload shows nothing. A fresh profile never sees it (marked seen
// silently). Settings → What's new replays it. Page 1 and Settings → About show the same
// "Version <package.json version> (build …)" label; About has the credit line. Reduced motion →
// no page animation. Nothing is spoken; no request leaves the dev server (route-asserted).
import { expect, test, type Page } from '@playwright/test';
import {
  APP_RELEASE,
  MIN,
  at,
  expectTapTargets,
  foreground,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  putSetting,
  record,
  seed,
  todoCounts,
  todoReady,
} from './app.helpers';
import { endWorkout } from './workout.helpers';

const TOUR = '[data-tour="whats-new"]';
const tour = (page: Page) => page.locator(TOUR);
const wn = (page: Page, part: string) => tour(page).locator(`[data-wn="${part}"]`);
/** 1.12.0: six feature pages + "Added to your to-dos". */
const TOTAL = 7;

/** A profile updated from an older release: one finished session, the 1.11.0 tour seen. */
async function openUpdated(page: Page) {
  await openApp(page, at(16, 18));
  await seed(
    page,
    [{ sessionId: 's1', dayId: 'push-a', startedAt: at(13, 18), endedAt: at(13, 18) + 40 * MIN }],
    [
      {
        sessionId: 's1',
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: 0,
        reps: 10,
        weightKg: 20,
        startedAt: at(13, 18) + MIN,
      },
    ],
    { whatsNewSeen: '1.11.0' },
  );
  await expect(tour(page)).toBeVisible();
}

const seenRelease = async (page: Page) =>
  ((await getSetting(page, 'whatsNew')) as { seenRelease?: string } | undefined)?.seenRelease;

test('an update shows the tour once: version on page 1, Next / Back, last page, Done → never again', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openUpdated(page);

  await expect(tour(page)).toHaveAttribute('role', 'dialog');
  // Over Today (the screen underneath), never anything else.
  await expect(page.locator('[data-cal]').first()).toBeAttached();
  await expect(wn(page, 'count')).toHaveText(`1 of ${TOTAL}`);
  await expect(wn(page, 'title')).toHaveText('Meet the Coach tab');
  await expect(wn(page, 'version')).toHaveText(
    new RegExp(`^Version ${APP_RELEASE.replace(/\./g, '\\.')} \\(build [0-9a-z-]+\\)$`),
  );
  await expect(wn(page, 'skip')).toBeVisible();
  await expectTapTargets(page, TOUR);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-tour-first.png') });

  await wn(page, 'next').click();
  await expect(wn(page, 'count')).toHaveText(`2 of ${TOTAL}`);
  await expect(wn(page, 'version')).toHaveCount(0);
  await wn(page, 'back').click();
  await expect(wn(page, 'count')).toHaveText(`1 of ${TOTAL}`);
  // Keyboard is a shortcut too (no keyboard is needed: the buttons above did it).
  await page.keyboard.press('ArrowRight');
  await expect(wn(page, 'count')).toHaveText(`2 of ${TOTAL}`);

  for (let i = 2; i < TOTAL; i++) {
    await expect(wn(page, 'skip')).toBeVisible(); // Skip on every page
    await wn(page, 'next').click();
  }
  await expect(wn(page, 'count')).toHaveText(`${TOTAL} of ${TOTAL}`);
  await expect(wn(page, 'title')).toHaveText('Added to your to-dos');
  await expect(wn(page, 'topics').locator('[data-topic="coach-calendar"]')).toBeVisible();
  await expect(wn(page, 'open-todos')).toBeVisible();
  await expect(wn(page, 'next')).toHaveAttribute('data-last', 'true');
  await expectTapTargets(page, TOUR);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-tour-added.png') });

  await wn(page, 'next').click(); // Done
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect.poll(() => seenRelease(page)).toBe(APP_RELEASE);

  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await todoReady(page);
  await expect(tour(page)).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Skip closes it on any page and marks the release seen', async ({ page }) => {
  const offsite = await guardNetwork(page);
  await openUpdated(page);
  await wn(page, 'next').click();
  await wn(page, 'next').click();
  await expect(wn(page, 'count')).toHaveText(`3 of ${TOTAL}`);
  await wn(page, 'skip').click();
  await expect(tour(page)).toHaveCount(0);
  await expect.poll(() => seenRelease(page)).toBe(APP_RELEASE);
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await todoReady(page);
  await expect(tour(page)).toHaveCount(0);
  expect(offsite).toEqual([]);
});

test('Try it closes the tour and opens the feature; Open to-dos opens the list', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  await openUpdated(page);
  await wn(page, 'next').click();
  await wn(page, 'next').click();
  await expect(wn(page, 'title')).toHaveText('Calendar replaces History');
  await expect(wn(page, 'try')).toHaveAttribute('data-route', 'calendar');
  await wn(page, 'try').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('[data-screen="calendar"]')).toBeVisible();
  await expect(page.locator('[data-tab="calendar"]')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => seenRelease(page)).toBe(APP_RELEASE);

  // Replay from Settings, straight to the last page's Open to-dos.
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-whats-new-open]').click();
  await expect(tour(page)).toBeVisible();
  for (let i = 1; i < TOTAL; i++) await wn(page, 'next').click();
  await wn(page, 'open-todos').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('main[data-screen="todos"]')).toBeVisible();
  expect(offsite).toEqual([]);
});

test("a fresh profile never sees the tour (marked seen); Settings → What's new replays it; About shows version + credit", async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(16, 18));
  await expect.poll(() => seenRelease(page)).toBe(APP_RELEASE);
  await expect(tour(page)).toHaveCount(0);

  await page.locator('[data-tab="settings"]').click();
  const about = page.locator('[data-section="about"], section:has([data-about="version"])').last();
  await about.scrollIntoViewIfNeeded();
  const label = page.locator('[data-about="version"]');
  await expect(label).toHaveText(
    new RegExp(`^Version ${APP_RELEASE.replace(/\./g, '\\.')} \\(build [0-9a-z-]+\\)$`),
  );
  await expect(page.locator('[data-about="credit"]')).toHaveText('© 2026 Wongsaton Kampusan');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-settings-about.png') });
  const versionText = await label.textContent();

  await page.locator('[data-whats-new-open]').click();
  await expect(tour(page)).toBeVisible();
  await expect(wn(page, 'count')).toHaveText(`1 of ${TOTAL}`);
  // The same label as About.
  await expect(wn(page, 'version')).toHaveText(versionText ?? '');
  await page.keyboard.press('Escape'); // = Skip
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator('[data-whats-new-open]')).toBeVisible();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('reduced motion: page changes are instant (no animation)', async ({ page }) => {
  const offsite = await guardNetwork(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openUpdated(page);
  await wn(page, 'next').click();
  await expect(wn(page, 'count')).toHaveText(`2 of ${TOTAL}`);
  const running = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return t instanceof Element && t.closest('[data-tour]') !== null;
      })
      .map((a) => a.playState),
  );
  expect(running).toEqual([]);
  expect(offsite).toEqual([]);
});

test('never over a workout or its preview, even on foreground; back on Today it shows', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // A profile with a session and this release seen: no tour at open.
  await openApp(page, at(16, 18));
  await seed(
    page,
    [{ sessionId: 's1', dayId: 'push-a', startedAt: at(13, 18), endedAt: at(13, 18) + 40 * MIN }],
    [],
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await todoReady(page);
  await expect(tour(page)).toHaveCount(0);

  // On the preview, an update lands (older release seen) and the app comes back to the
  // foreground: facts refresh, but no tour over the preview.
  await page.locator('[data-start]').first().click();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();
  await putSetting(page, 'whatsNew', { seenRelease: '1.11.0' });
  const before = await todoCounts(page);
  await foreground(page);
  await expect
    .poll(async () => (await todoCounts(page)).refreshes)
    .toBeGreaterThan(before.refreshes);
  await expect(tour(page)).toHaveCount(0);

  // Mid-workout: foreground does nothing at all (no refresh, no tour check, no tour).
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  const mid = await todoCounts(page);
  await foreground(page); // the app's listeners run synchronously inside this dispatch
  expect(await todoCounts(page)).toEqual(mid);
  await expect(tour(page)).toHaveCount(0);
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.filter((s) => /what's new|to-do/i.test(s))).toEqual([]);

  // Workout over → Today → foreground: now the unseen release's tour shows.
  await endWorkout(page);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
  await foreground(page);
  await expect(tour(page)).toBeVisible();
  await expect(wn(page, 'count')).toHaveText(`1 of ${TOTAL}`);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
