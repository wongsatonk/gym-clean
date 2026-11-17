// M12 task 18: the Calendar tab and its prompts, end to end in the real app at 390×844 (SPEC
// M12 goals 7–8). Made-up sessions seeded into IndexedDB: last week one session (so a week
// recap is due), this week Push A in full on Mon, Pull A partly on Tue, nothing Wed / Thu.
// Today shows the missed-day card once (Skip it → gone, even after a reload); the coach thread
// gets last week's recap once. The month grid shows each status by shape + an accessible label;
// a day lists each exercise done / partly / missed with the per-exercise history one tap deeper
// (back label "Calendar"); the week score reads the same as the grid; Share month makes a PNG on
// the phone (the download fallback here) with no request off the dev server (route-asserted).
// Nothing on these screens is spoken.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  MIN,
  at,
  coachTab,
  expectTapTargets,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  seed,
  type SetSeed,
} from './app.helpers';

type Day = { id: string; name: string; exercises: { exerciseId: string; sets: number }[] };
const PROGRAM = JSON.parse(readFileSync('src/data/program.json', 'utf8')) as { days: Day[] };
const dayOf = (id: string): Day => {
  const d = PROGRAM.days.find((x) => x.id === id);
  if (!d) throw new Error(`no day ${id}`);
  return d;
};
const PUSH_A = dayOf('push-a');
const PULL_A = dayOf('pull-a');

/** Every planned set of a day, 10 × 20 kg. */
function allSets(sessionId: string, day: Day, start: number): SetSeed[] {
  let t = start;
  return day.exercises.flatMap((e) =>
    Array.from({ length: e.sets }, (_, setIndex) => {
      t += 2 * MIN;
      return {
        sessionId,
        exerciseId: e.exerciseId,
        setIndex,
        reps: 10,
        weightKg: 20,
        startedAt: t,
      };
    }),
  );
}

async function seedWeek(page: Page) {
  const first = PULL_A.exercises[0]?.exerciseId ?? '';
  await seed(
    page,
    [
      { sessionId: 'w-prev', dayId: 'push-a', startedAt: at(2, 18), endedAt: at(2, 18) + 40 * MIN },
      { sessionId: 'w-mon', dayId: 'push-a', startedAt: at(9, 18), endedAt: at(9, 18) + 70 * MIN },
      {
        sessionId: 'w-tue',
        dayId: 'pull-a',
        startedAt: at(10, 18),
        endedAt: at(10, 18) + 20 * MIN,
      },
    ],
    [
      {
        sessionId: 'w-prev',
        exerciseId: 'Dumbbell_Bench_Press',
        setIndex: 0,
        reps: 10,
        weightKg: 20,
        startedAt: at(2, 18) + MIN,
      },
      ...allSets('w-mon', PUSH_A, at(9, 18)),
      {
        sessionId: 'w-tue',
        exerciseId: first,
        setIndex: 0,
        reps: 9,
        weightKg: 22.5,
        startedAt: at(10, 18) + MIN,
      },
    ],
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();
}

/** The missed days he answered (settings key 'coach'), read straight from IndexedDB. */
async function answered(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('gym-clean');
        open.onerror = () => reject(new Error('open failed'));
        open.onsuccess = () => {
          const d = open.result;
          const rq = d.transaction('settings').objectStore('settings').get('coach');
          rq.onsuccess = () => {
            d.close();
            const row = rq.result as { value?: { missedAnswered?: string[] } } | undefined;
            resolve(row?.value?.missedAnswered ?? []);
          };
          rq.onerror = () => reject(new Error('read failed'));
        };
      }),
  );
}

const month = (page: Page) => page.locator('main[data-screen="calendar"]');
const cell = (page: Page, date: string) => page.locator(`[data-cal-day="${date}"]`);
const dayScreen = (page: Page) => page.locator('main[data-screen="calendar-day"]');

test('missed-day card once on Today; last week recap once in the thread', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await seedWeek(page);

  const missed = page.locator('[data-missed-day]');
  await expect(missed).toHaveAttribute('data-missed-day', '2026-11-12');
  await expect(missed.locator('.missed-text')).toHaveText(/^You missed .+ on Thu\.$/);
  await expectTapTargets(page, '[data-missed-day]');
  await noHorizontalOverflow(page);

  // Last week's recap is in the coach thread, once.
  await page.locator('[data-tab="coach"]').click();
  const recap = coachTab(page).locator('[data-recap="week"]');
  await expect(recap).toHaveCount(1);
  await expect(recap).toContainText('Mon 2 Nov to Sun 8 Nov');
  await page.locator('[data-tab="today"]').click();

  // Skip it: the card goes and stays gone; the recap isn't posted again.
  await missed.locator('[data-missed-skip]').click();
  await expect(missed).toHaveCount(0);
  // The answer is stored (settings 'coach', no message text) just after the tap.
  await expect.poll(() => answered(page)).toContain('2026-11-12');
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await expect(page.locator('[data-hero]').first()).toBeVisible();
  await expect(missed).toHaveCount(0);
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
  await expect(coachTab(page).locator('[data-recap="week"]')).toHaveCount(1);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('month rings by status → a day per exercise → exercise history (‹ Calendar); scores; month nav', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await seedWeek(page);

  await page.locator('[data-tab="calendar"]').click();
  await expect(month(page)).toHaveAttribute('data-month', '2026-11');
  await expect(page.locator('[data-tab="calendar"]')).toHaveAttribute('aria-current', 'page');
  const total = (d: Day) => d.exercises.reduce((n, e) => n + e.sets, 0);

  // Each status: its own ring and words in the label (never colour alone).
  await expect(cell(page, '2026-11-09')).toHaveAttribute('data-status', 'done');
  await expect(cell(page, '2026-11-09')).toHaveAttribute(
    'aria-label',
    `Mon 9: done, ${total(PUSH_A)} of ${total(PUSH_A)} sets`,
  );
  await expect(cell(page, '2026-11-10')).toHaveAttribute('data-status', 'partial');
  await expect(cell(page, '2026-11-10')).toHaveAttribute(
    'aria-label',
    `Tue 10: partly done, 1 of ${total(PULL_A)} sets`,
  );
  await expect(cell(page, '2026-11-11')).toHaveAttribute('data-status', 'missed');
  await expect(cell(page, '2026-11-12')).toHaveAttribute('data-status', 'missed');
  await expect(cell(page, '2026-11-13')).toHaveAttribute('data-status', 'planned');
  await expect(cell(page, '2026-11-13')).toHaveAttribute('aria-current', 'date');
  await expect(cell(page, '2026-11-01')).toHaveAttribute('data-status', 'rest'); // before day one
  for (const s of ['done', 'partial', 'missed', 'planned'])
    await expect(page.locator(`[data-legend="${s}"]`)).toBeVisible();

  // Week score: Mon 9 and Tue 10 trained of the 7 planned; the big number is the line's %.
  const line = page.locator('[data-score="week"] [data-score-line]');
  await expect(line).toHaveText(/^2 of 7 sessions, \d+% of planned sets$/);
  const pct = /(\d+)%/.exec((await line.textContent()) ?? '')?.[1];
  await expect(page.locator('[data-score="week"] .cal-score-num')).toHaveText(`${pct}%`);
  await expect(page.locator('[data-streak]')).toBeVisible();
  await expectTapTargets(page, 'main[data-screen="calendar"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-calendar-month.png'), fullPage: true });

  // Month nav: back to October and forward again.
  await page.locator('[data-cal-prev]').click();
  await expect(month(page)).toHaveAttribute('data-month', '2026-10');
  await page.locator('[data-cal-next]').click();
  await expect(month(page)).toHaveAttribute('data-month', '2026-11');

  // Mon 9: every exercise done.
  await cell(page, '2026-11-09').click();
  await expect(dayScreen(page)).toHaveAttribute('data-date', '2026-11-09');
  const rows = dayScreen(page).locator('[data-cal-ex]');
  await expect(rows).toHaveCount(PUSH_A.exercises.length);
  for (const s of await rows.evaluateAll((els) =>
    els.map((e) => e.getAttribute('data-row-status')),
  ))
    expect(s).toBe('done');
  await expect(dayScreen(page).locator('[data-day-action]')).toHaveCount(0); // done: nothing to do
  await dayScreen(page).locator('[data-cal-back]').click();

  // Tue 10: the first exercise partly (1 of its sets), the rest missed.
  await cell(page, '2026-11-10').click();
  await expect(dayScreen(page)).toHaveAttribute('data-date', '2026-11-10');
  const firstId = PULL_A.exercises[0]?.exerciseId ?? '';
  const first = dayScreen(page).locator(`[data-cal-ex="${firstId}"]`);
  await expect(first).toHaveAttribute('data-row-status', 'partial');
  await expect(first).toContainText(`Partly · 1 of ${PULL_A.exercises[0]?.sets} sets`);
  await expect(first).toContainText('9 reps');
  await expect(dayScreen(page).locator('[data-row-status="missed"]')).toHaveCount(
    PULL_A.exercises.length - 1,
  );
  await expectTapTargets(page, 'main[data-screen="calendar-day"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-calendar-day.png'), fullPage: true });

  // One tap deeper: that exercise's history, with "Calendar" as the way back.
  await first.locator('[data-cal-history]').click();
  const hist = page.locator('main[data-screen="history"][data-view="detail"]');
  await expect(hist).toBeVisible();
  await expect(hist.locator('[data-best] .hist-best-num')).toHaveText('9 × 22.5');
  await expect(page.locator('[data-history-back]')).toContainText('Calendar');
  await page.locator('[data-history-back]').click();
  await expect(dayScreen(page)).toHaveAttribute('data-date', '2026-11-10');
  await dayScreen(page).locator('[data-cal-back]').click();
  await expect(month(page)).toBeVisible();

  // A missed day offers Do it today and Move; Do it today opens that day to start now.
  await cell(page, '2026-11-12').click();
  await expect(dayScreen(page).locator('[data-day-action]')).toHaveCount(2);
  await dayScreen(page).locator('[data-day-action="doToday"]').click();
  await expect(page.locator('[data-screen="preview"]')).toBeVisible();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Share month: a 1080×1350 PNG made on the phone (download fallback), nothing sent', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { requests, errors } = record(page);
  // No Web Share here, so the app falls back to a download.
  await page.addInitScript(() => {
    for (const k of ['share', 'canShare'])
      Object.defineProperty(navigator, k, { configurable: true, value: undefined });
  });
  await openApp(page, at(13, 18));
  await seedWeek(page);
  await page.locator('[data-tab="calendar"]').click();
  await expect(cell(page, '2026-11-09')).toHaveAttribute('data-status', 'done');
  const before = requests.length;

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-month]').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/2026-11.*\.png$/);
  const path = testInfo.outputPath('m12-share-month.png');
  await download.saveAs(path);
  const png = readFileSync(path);
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(png.readUInt32BE(16)).toBe(1080); // IHDR width
  expect(png.readUInt32BE(20)).toBe(1350); // IHDR height
  await expect(page.locator('[data-notice]')).toHaveText('Image saved.');

  // Made from the page alone: only blob:/data: URLs (or nothing) since the tap.
  const after = requests.slice(before).filter((u) => !/^(blob|data):/.test(u));
  expect(after.filter((u) => !u.startsWith(new URL(page.url()).origin))).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
