// M12 slice 1c task 14: the What's New tour in the real app at 390×844 (SPEC M12 "What's New tour
// + To-do guides", goal 1 + 4). Once per release: an update (older `seenRelease` + a session)
// shows it over Today; Next / Back / Done, Skip, and Try it (closes the tour and deep-links) all
// mark the release seen, so a reload shows nothing. A fresh profile never sees it (marked seen
// silently). Settings → What's new replays it. Page 1 and Settings → About show the same
// "Version <package.json version> (build …)" label; About has the credit line. Reduced motion →
// no page animation. The tour's pages are read from src/data/whatsNew/pages.ts. Nothing is spoken; no request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
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
import { WHATS_NEW_PAGES } from '../src/data/whatsNew/pages';

// M13: the tour's to-do pages, its version text and the build line are owner surfaces, as on his
// install. A fresh install (owner off) is covered in owner-mode.spec.ts.
test.use({ owner: 'on' });

const TOUR = '[data-tour="whats-new"]';
const tour = (page: Page) => page.locator(TOUR);
const wn = (page: Page, part: string) => tour(page).locator(`[data-wn="${part}"]`);

// The tour's shape comes from the page and topic data, so a new release doesn't break this spec.
// An update shows every release after the one he last saw, up to APP_RELEASE (newest first, data
// order within a release; core/todo/whatsNew.ts `tourToShow`), then "Added to your to-dos" only
// when those releases added a topic. A patch release can have a single page (1.15.2), so the
// updated profile last saw a release far enough back for at least MIN_PAGES pages (Next / Back
// and Skip on page 3 need them). Settings → What's new replays only the newest release with pages
// (`replayPages`). The tour lists every added topic on either platform (on the web an iPhone-only
// one sits under "In the iPhone app" in the list), so the count comes from `since` alone, as
// todoHost's `addedTopics` does.
const byNum = (a: string, b: string) => {
  const [x, y] = [a.split('.').map(Number), b.split('.').map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
const MIN_PAGES = 3;
/** Releases with pages up to this one, newest first. */
const RELEASES = [...new Set(WHATS_NEW_PAGES.map((p) => p.release))]
  .filter((r) => byNum(r, APP_RELEASE) <= 0)
  .sort((a, b) => byNum(b, a));
const pagesOf = (r: string) => WHATS_NEW_PAGES.filter((p) => p.release === r);
/** The releases an update tour covers: the newest ones until there are MIN_PAGES pages. */
const TOUR_RELEASES: string[] = [];
for (const r of RELEASES) {
  TOUR_RELEASES.push(r);
  if (TOUR_RELEASES.flatMap(pagesOf).length >= MIN_PAGES) break;
}
/** What the updated profile last saw: the release with pages just before the tour's oldest. */
const SEEN_FROM = RELEASES[TOUR_RELEASES.length] as string;
/** The update tour's feature pages, in the order the tour shows them. */
const TOUR_PAGES = TOUR_RELEASES.flatMap(pagesOf);
/** Settings → What's new: the newest release with pages. */
const REPLAY_RELEASE = RELEASES[0] as string;
const REPLAY_PAGES = pagesOf(REPLAY_RELEASE);
/**
 * Ids of the topics the tour's releases added to the to-dos (the tour's last page lists them;
 * none → no such page). Read from src/data/todos/topics.ts through the dev server in beforeAll:
 * that module imports program.json, which Node can't load without an import attribute.
 */
let ADDED: string[] = [];
let HAS_TODO_PAGE = false;
/** The update tour's pages (+ "Added to your to-dos" when its releases added a topic). */
let TOTAL = TOUR_PAGES.length;
let REPLAY_HAS_TODO_PAGE = false;
/** The replay's pages (+ "Added to your to-dos" when the replayed release added a topic). */
let REPLAY_TOTAL = REPLAY_PAGES.length;

test.beforeAll(async ({ browser }, testInfo) => {
  expect(SEEN_FROM, `a release before the newest ${MIN_PAGES} tour pages`).toBeDefined();
  const baseURL = testInfo.project.use.baseURL;
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    ...(baseURL ? { baseURL } : {}),
  });
  const p = await ctx.newPage();
  await p.goto('/');
  const topics = await p.evaluate(async () => {
    const path = '/src/data/todos/topics.ts';
    const m = (await import(/* @vite-ignore */ path)) as {
      TODO_TOPICS: { id: string; since: string }[];
    };
    return m.TODO_TOPICS.map(({ id, since }) => ({ id, since }));
  });
  await ctx.close();
  ADDED = topics.filter((t) => TOUR_RELEASES.includes(t.since)).map((t) => t.id);
  HAS_TODO_PAGE = ADDED.length > 0;
  TOTAL = TOUR_PAGES.length + (HAS_TODO_PAGE ? 1 : 0);
  REPLAY_HAS_TODO_PAGE = topics.some((t) => t.since === REPLAY_RELEASE);
  REPLAY_TOTAL = REPLAY_PAGES.length + (REPLAY_HAS_TODO_PAGE ? 1 : 0);
});
/** The last feature page's title (the tour's last page when nothing was added). */
const LAST_FEATURE = TOUR_PAGES.at(-1)?.title ?? '';
/** The first page whose Try it opens another tab (else one that opens Today), for the Try it test. */
const TAB_IDX = TOUR_PAGES.findIndex((p) =>
  ['calendar', 'coach', 'fuel', 'settings'].includes(p.tryIt ?? ''),
);
// 1.15.1's pages (Next arm, set-up card) both try it on Today: then Today's tab is the check.
const TRY_IDX = TAB_IDX >= 0 ? TAB_IDX : TOUR_PAGES.findIndex((p) => p.tryIt === 'today');
const TRY_PAGE = TOUR_PAGES[TRY_IDX];

/** A profile updated from SEEN_FROM: one finished session, that release's tour seen. */
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
    { whatsNewSeen: SEEN_FROM },
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
  await expect(wn(page, 'title')).toHaveText(TOUR_PAGES[0]?.title ?? '');
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
  if (HAS_TODO_PAGE) {
    await expect(wn(page, 'title')).toHaveText('Added to your to-dos');
    for (const id of ADDED)
      await expect(wn(page, 'topics').locator(`[data-topic="${id}"]`)).toBeVisible();
    await expect(wn(page, 'open-todos')).toBeVisible();
  } else {
    // No topic added this release: the tour ends on its last feature page.
    await expect(wn(page, 'title')).toHaveText(LAST_FEATURE);
    await expect(wn(page, 'topics')).toHaveCount(0);
    await expect(wn(page, 'open-todos')).toHaveCount(0);
  }
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

test('Try it closes the tour and opens the feature; Open to-dos (when a topic was added) opens the list', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  await openUpdated(page);
  expect(TRY_PAGE, 'a page whose Try it opens a tab').toBeDefined();
  for (let i = 0; i < TRY_IDX; i++) await wn(page, 'next').click();
  await expect(wn(page, 'title')).toHaveText(TRY_PAGE?.title ?? '');
  const route = TRY_PAGE?.tryIt ?? '';
  await expect(wn(page, 'try')).toHaveAttribute('data-route', route);
  await wn(page, 'try').click();
  await expect(tour(page)).toHaveCount(0);
  await expect(page.locator(`[data-tab="${route}"]`)).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => seenRelease(page)).toBe(APP_RELEASE);

  // Replay from Settings, straight to the last page (Open to-dos when this release added a topic).
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-whats-new-open]').click();
  await expect(tour(page)).toBeVisible();
  for (let i = 1; i < REPLAY_TOTAL; i++) await wn(page, 'next').click();
  await expect(wn(page, 'count')).toHaveText(`${REPLAY_TOTAL} of ${REPLAY_TOTAL}`);
  if (REPLAY_HAS_TODO_PAGE) {
    await wn(page, 'open-todos').click();
    await expect(tour(page)).toHaveCount(0);
    await expect(page.locator('main[data-screen="todos"]')).toBeVisible();
  } else {
    await expect(wn(page, 'open-todos')).toHaveCount(0);
    await wn(page, 'next').click(); // Done
    await expect(tour(page)).toHaveCount(0);
  }
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
  await expect(wn(page, 'count')).toHaveText(`1 of ${REPLAY_TOTAL}`);
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
  await putSetting(page, 'whatsNew', { seenRelease: SEEN_FROM });
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
