// M13c task 18: the Library + search, end to end in the real app at 390×844 (SPEC M13c goals 3,
// 4 and 6; tasks 12, 12b, 13, 16, 17b).
//
// - Today → Search → "abs": the abdominals exercises come first (≥ 8) → an exercise's detail →
//   Watch 3D demo (the 3D stage, or the muscle-map fallback without WebGL) → Close → Back keeps
//   the typed "abs" → Back to Today.
// - Each group-by (Muscle / Equipment / Day / Movement / A–Z) and My gym only.
// - "voice" → Settings scrolled to the Voice section, which has focus.
// - The "Search foods for '…'" row → Fuel's log sheet with the text in its search field.
// - Your own data on this phone (seeded sessions, coach chat and meals): "yesterday" and "bench"
//   open the right Calendar day, "rice" opens Fuel on that day, a chat word opens the Coach tab
//   on that message; Show more pages the workouts.
// Search is read with the phone in hand: nothing is spoken. Every test fails on a request that
// leaves the device (route-asserted) and on a console error.
import { expect, test, type Page } from './fixtures';
import {
  MIN,
  at,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  putRows,
  record,
  seed,
  type SessionSeed,
  type SetSeed,
} from './app.helpers';

/** Wed 18 Nov 2026, 18:00: "yesterday" is Tue 17 Nov. */
const NOW = at(18, 18);

/** The ten vendored abdominals-primary exercises (src/data/exercises.json, M13c task 2). */
const ABS = new Set([
  'Air_Bike',
  'Cable_Crunch',
  'Crunches',
  'Dead_Bug',
  'Dumbbell_Side_Bend',
  'Flat_Bench_Lying_Leg_Raise',
  'Hanging_Leg_Raise',
  'Pallof_Press',
  'Reverse_Crunch',
  'Russian_Twist',
]);

const library = (page: Page) => page.locator('main[data-screen="library"]');
const field = (page: Page) => library(page).locator('[data-library-search]');

let guard: { offsite: string[]; errors: string[] } | null = null;
test.beforeEach(async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  guard = { offsite, errors };
});
test.afterEach(async ({ page }) => {
  expect(guard?.offsite ?? [], 'requests that left the device').toEqual([]);
  expect(guard?.errors ?? [], 'console errors').toEqual([]);
  // Search is read, never spoken.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
});

/** Today → Search: the Library opens with the field focused (the phone keyboard comes up). */
async function openLibrary(page: Page): Promise<void> {
  await page.locator('main[data-screen="today"] [data-search-open]').click();
  await expect(library(page)).toBeVisible();
  await expect(field(page)).toBeFocused();
}

async function type(page: Page, q: string): Promise<void> {
  await field(page).fill(q);
  await expect(field(page)).toHaveValue(q);
}

test('"abs" → the abs exercises first → detail → 3D demo → Back keeps the search → Today', async ({
  page,
}, testInfo) => {
  await openApp(page, NOW);
  await openLibrary(page);
  await expect(library(page).locator('[data-library-count]')).toContainText(/\d+ exercises/);
  await expectTapTargets(page, 'main[data-screen="library"]');
  await noHorizontalOverflow(page);

  await type(page, 'abs');
  const exHits = library(page).locator('[data-search-section="exercise"] [data-library-ex]');
  await expect(exHits.first()).toBeVisible();
  const ids = await exHits.evaluateAll((els) => els.map((e) => e.getAttribute('data-library-ex')));
  expect(ids.length).toBeGreaterThanOrEqual(8);
  // Every abdominals exercise ranks above anything else ("abs" → abdominals through synonyms).
  const firstNonAbs = ids.findIndex((id) => !ABS.has(id ?? ''));
  const absCount = ids.filter((id) => ABS.has(id ?? '')).length;
  expect(absCount).toBeGreaterThanOrEqual(8);
  if (firstNonAbs !== -1) expect(firstNonAbs).toBeGreaterThanOrEqual(absCount);
  // Group-by and My gym only step aside while searching.
  await expect(library(page).locator('[data-group-by]')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-search-abs.png') });

  // A row → the exercise's detail.
  const id = ids[0] ?? '';
  await library(page).locator(`[data-ex-open="${id}"]`).first().click();
  const detail = page.locator(`main[data-screen="exercise-detail"][data-exercise="${id}"]`);
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-detail-map]')).toBeVisible();
  await expect(detail.locator('[data-detail-notplan]')).toBeVisible(); // abs aren't in the plan
  await expect(detail.locator('[data-detail-new]')).toBeVisible(); // never done
  await expectTapTargets(page, 'main[data-screen="exercise-detail"]');
  await noHorizontalOverflow(page);

  // Watch 3D demo → the How-to sheet (3D stage, or the map without WebGL) → Close.
  const howTo = detail.locator('[data-detail-howto]');
  await expect(howTo).toHaveText(/Watch 3D demo|How to/);
  await howTo.click();
  const sheet = page.locator(`[data-howto="sheet"][data-exercise="${id}"]`);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-howto="stage"]')).toHaveAttribute('data-mode', /^(3d|map)$/, {
    timeout: 15_000,
  });
  await sheet.locator('[data-howto="close"]').click();
  await expect(page.locator('[data-howto="sheet"]')).toHaveCount(0);

  // Back → the Library with "abs" still typed and the same hits.
  await detail.locator('[data-detail-back]').click();
  await expect(library(page)).toBeVisible();
  await expect(field(page)).toHaveValue('abs');
  await expect(exHits.first()).toHaveAttribute('data-library-ex', id);

  // Back → Today, with no workout started.
  await library(page).locator('[data-library-back]').click();
  await expect(page.locator('main[data-screen="today"]')).toBeVisible();
  await expect(library(page)).toHaveCount(0);
});

test('each group-by lists every exercise; Day ends with "Not in your plan"; My gym only hides what the gym lacks', async ({
  page,
}) => {
  await openApp(page, NOW);
  await openLibrary(page);
  const groups = library(page).locator('[data-library-group]');
  const rows = library(page).locator('[data-library-ex]');
  const keys = () =>
    groups.evaluateAll((els) => els.map((e) => e.getAttribute('data-library-group') ?? ''));
  const total = Number(
    ((await library(page).locator('[data-library-count]').textContent()) ?? '').match(/\d+/)?.[0],
  );
  expect(total).toBeGreaterThanOrEqual(60);

  // Muscle (default): abdominals have their own group under the Core area.
  await expect(library(page).locator('[data-group-by="muscle"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await keys()).toContain('muscle:abdominals');
  await expect(library(page).locator('[data-library-area="core"]')).toBeVisible();
  expect(await rows.count()).toBe(total);

  // Equipment: Cable and Body only groups; every exercise once.
  await library(page).locator('[data-group-by="equipment"]').click();
  await expect(library(page).locator('[data-group-by="equipment"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect.poll(keys).toContain('equipment:cable');
  expect(await keys()).toContain('equipment:body');
  expect(await rows.count()).toBe(total);

  // Day: the plan's days in order, then "Not in your plan" (abs live there: no plan has them).
  await library(page).locator('[data-group-by="day"]').click();
  await expect.poll(keys).toContain('day:push-a');
  const dayKeys = await keys();
  expect(dayKeys.at(-1)).toBe('day:none');
  await expect(library(page).locator('[data-library-group="day:none"]')).toContainText(
    'Not in your plan',
  );
  const notInPlan = library(page).locator('[data-library-list="day:none"] [data-library-ex]');
  const notIds = await notInPlan.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-library-ex')),
  );
  for (const abs of ABS) expect(notIds).toContain(abs);

  // Movement.
  await library(page).locator('[data-group-by="movement"]').click();
  await expect.poll(keys).toContain('movement:push-compound');
  expect(await rows.count()).toBe(total);

  // A–Z: one group, alphabetical.
  await library(page).locator('[data-group-by="az"]').click();
  await expect.poll(keys).toEqual(['az']);
  const names = await library(page)
    .locator('[data-library-ex] .ex-row-name')
    .evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  expect(names).toHaveLength(total);
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));

  // A group folds and opens again.
  const head = library(page).locator('[data-library-group="az"]');
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(library(page).locator('[data-library-list="az"]')).toBeHidden();
  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');

  // My gym only: the default gym has no pull-up bar, so Hanging Leg Raise goes (it says what it
  // needs when shown).
  await expect(library(page).locator('[data-library-ex="Hanging_Leg_Raise"]')).toContainText(
    'Needs:',
  );
  const myGym = library(page).locator('[data-library-mygym]');
  await expect(myGym).toHaveAttribute('aria-checked', 'false');
  await myGym.click();
  await expect(myGym).toHaveAttribute('aria-checked', 'true');
  await expect(library(page).locator('[data-library-ex="Hanging_Leg_Raise"]')).toHaveCount(0);
  await expect(library(page).locator('[data-library-needs]')).toHaveCount(0);
  expect(await rows.count()).toBeLessThan(total);
  await expectTapTargets(page, 'main[data-screen="library"]');
  await noHorizontalOverflow(page);
});

test('"voice" → Settings scrolled to the Voice section, focused', async ({ page }) => {
  await openApp(page, NOW);
  await openLibrary(page);
  await type(page, 'voice');
  const hit = library(page).locator('[data-search-section="setting"] [data-search-hit]').first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.locator('main[data-screen="settings"]')).toBeVisible();
  const voice = page.locator('#settings-voice');
  await expect(voice).toBeFocused();
  await expect(voice).toBeInViewport();
  expect((await voice.boundingBox())?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect(page.locator('[data-tab="settings"]')).toHaveAttribute('aria-current', 'page');
  await noHorizontalOverflow(page);
});

test('"Search foods for …" → Fuel\'s log sheet with the text in its search', async ({ page }) => {
  await openApp(page, NOW);
  await openLibrary(page);
  await type(page, 'jasmine rice');
  const food = library(page).locator('[data-search-hit="food:food"]');
  await expect(food).toContainText("Search foods for 'jasmine rice'");
  await food.click();
  const sheet = page.locator('[data-log-sheet]');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('input[type="search"]')).toHaveValue('jasmine rice');
  await expect(page.locator('[data-tab="fuel"]')).toHaveAttribute('aria-current', 'page');
});

// ---------- your own data ----------

const BENCH = 'Dumbbell_Bench_Press';
/** One finished session (3 sets of `exerciseId`) on November `day`. */
function session(
  day: number,
  dayId: string,
  exerciseId: string,
): { s: SessionSeed; sets: SetSeed[] } {
  const sessionId = `s-${dayId}-${day}`;
  const start = at(day, 18);
  return {
    s: { sessionId, dayId, startedAt: start, endedAt: start + 45 * MIN },
    sets: [0, 1, 2].map((k) => ({
      sessionId,
      exerciseId,
      setIndex: k,
      reps: 8,
      weightKg: 20,
      startedAt: start + (k + 1) * 3 * MIN,
    })),
  };
}

/** A logged food (made-up macros). */
const food = (id: string, date: string, hour: number, label: string) => ({
  id,
  date,
  time: new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).getTime(),
  slot: 'lunch',
  label,
  amount: { servings: 1 },
  estimate: true,
  kcal: 400,
  proteinG: 20,
  carbsG: 60,
  fatG: 8,
});

const CHAT_ID = 701;

/**
 * Yesterday (17 Nov): Push A with bench, jasmine rice for lunch. 16 Nov: a coach chat about a
 * "marathon". 13 Nov: Pull A (no bench), chicken salad. Bench sessions on 11 earlier days, so
 * "bench" has more than one page.
 */
async function seedHistory(page: Page): Promise<void> {
  await putRows(page, 'chatMessages', [
    {
      id: CHAT_ID,
      createdAt: at(16, 9),
      role: 'user',
      text: 'I ran a half marathon on Sunday, should I rest my legs?',
      source: 'rules',
      phase: 'today',
    },
    {
      id: CHAT_ID + 1,
      createdAt: at(16, 9) + 2000,
      role: 'coach',
      text: 'Take it easy on legs today.',
      source: 'rules',
      phase: 'today',
    },
  ]);
  await putRows(page, 'foodEntries', [
    food('f17', '2026-11-17', 12, 'Jasmine rice'),
    food('f13', '2026-11-13', 12, 'Chicken salad'),
  ]);
  const all = [
    session(17, 'push-a', BENCH),
    session(13, 'pull-a', 'Dumbbell_Bicep_Curl'),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => session(d, 'push-a', BENCH)),
  ];
  await seed(
    page,
    all.map((x) => x.s),
    all.flatMap((x) => x.sets),
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

test('your data: "yesterday" and "bench" open that Calendar day; Show more pages the workouts', async ({
  page,
}, testInfo) => {
  await openApp(page, NOW);
  await seedHistory(page);
  await openLibrary(page);

  // "yesterday": Tue 17 Nov's workout and meals; nothing from other days.
  await type(page, 'yesterday');
  const workouts = library(page).locator('[data-search-section="workout"] [data-search-hit]');
  await expect(workouts).toHaveCount(1);
  await expect(workouts.first()).toHaveAttribute('data-search-hit', 'workout:s-push-a-17');
  await expect(workouts.first()).toContainText('Push A');
  await expect(
    library(page).locator('[data-search-section="meal"] [data-search-hit]'),
  ).toHaveAttribute('data-search-hit', 'meal:2026-11-17');
  await expect(library(page).locator('[data-search-loading]')).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m13c-e2e-search-yesterday.png') });
  await workouts.first().click();
  const day = page.locator('main[data-screen="calendar-day"]');
  await expect(day).toHaveAttribute('data-date', '2026-11-17');
  await expect(day.locator(`[data-cal-ex="${BENCH}"]`)).toBeVisible();
  await expect(page.locator('[data-tab="calendar"]')).toHaveAttribute('aria-current', 'page');

  // "bench": the exercise first, then the bench workouts, newest first, 10 a page.
  await page.locator('[data-tab="today"]').click();
  await openLibrary(page);
  await type(page, 'bench');
  await expect(
    library(page).locator(`[data-search-section="exercise"] [data-library-ex="${BENCH}"]`),
  ).toBeVisible();
  await expect(workouts).toHaveCount(10);
  await expect(workouts.first()).toHaveAttribute('data-search-hit', 'workout:s-push-a-17');
  // Pull A on the 13th has no bench: not a hit.
  await expect(library(page).locator('[data-search-hit="workout:s-pull-a-13"]')).toHaveCount(0);
  const more = library(page).locator('[data-search-more="workout"]');
  await expect(more).toBeVisible();
  await more.click();
  await expect(workouts).toHaveCount(12);
  await expect(more).toHaveCount(0);
  await expectTapTargets(page, 'main[data-screen="library"]');
  await noHorizontalOverflow(page);
  // The oldest: 1 Nov.
  await workouts.last().click();
  await expect(day).toHaveAttribute('data-date', '2026-11-01');
});

test('your data: "rice" opens Fuel on that day; a chat word opens the Coach on that message', async ({
  page,
}) => {
  await openApp(page, NOW);
  await seedHistory(page);
  await openLibrary(page);

  await type(page, 'rice');
  const meal = library(page).locator('[data-search-section="meal"] [data-search-hit]');
  await expect(meal).toHaveCount(1);
  await expect(meal).toHaveAttribute('data-search-hit', 'meal:2026-11-17');
  await meal.click();
  await expect(page.locator('[data-tab="fuel"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('main[data-screen="fuel"] [data-fuel-day="2026-11-17"]')).toBeVisible();
  await expect(page.locator('main[data-screen="fuel"]')).toContainText('Jasmine rice');
  await expect(page.locator('main[data-screen="fuel"]')).not.toContainText('Chicken salad');
  await expect(page.getByRole('button', { name: 'Back to today' }).first()).toBeVisible();

  // A word from a coach chat → the Coach tab with that message revealed and focused.
  await page.locator('[data-tab="today"]').click();
  await openLibrary(page);
  await type(page, 'marathon');
  const chat = library(page).locator('[data-search-section="chat"] [data-search-hit]');
  await expect(chat).toHaveCount(1);
  await expect(chat).toHaveAttribute('data-search-hit', `chat:${CHAT_ID}`);
  await expect(chat).toContainText('You ·');
  await chat.click();
  const coach = page.locator('[data-screen="coach"]');
  await expect(coach).toBeVisible();
  const msg = coach.locator(`[data-msg-id="${CHAT_ID}"]`);
  await expect(msg).toBeFocused();
  await expect(msg).toBeInViewport();
  await expect(msg).toContainText('half marathon');
  await noHorizontalOverflow(page);
});
