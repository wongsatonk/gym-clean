// M12 task 18: the Calendar tab and its prompts, end to end in the real app at 390×844 (SPEC
// M12 goals 7–8). Made-up sessions seeded into IndexedDB: last week one session (so a week
// recap is due), this week Push A in full on Mon, Pull A partly on Tue, nothing Wed / Thu.
// Today shows the missed-day card once (Skip it → gone, even after a reload); the coach thread
// gets last week's recap once. The month grid shows each status by shape + an accessible label;
// a day lists each exercise done / partly / missed with the per-exercise history one tap deeper
// (back label "Calendar"); the week score reads the same as the grid; Share month makes a PNG on
// the phone (the download fallback here) with no request off the dev server (route-asserted).
// Day actions open the Coach tab with the chip sent: Do it today → doToday (a later day: proposal
// → Apply → Today and the Calendar run it today → Undo; a missed rotation day: "already today's
// workout"), Move on a later day → moveDay → date chips → Apply → moved → Undo. The missed-day
// card: a rotation miss offers Start it (today's preview), a focus-block miss Move it (doToday).
// Nothing on these screens is spoken.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';
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
  revealNotice,
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
  await revealNotice(page, missed);
  await expect(missed).toHaveAttribute('data-missed-day', '2026-11-12');
  await expect(missed.locator('.missed-text')).toHaveText(/^You missed .+ on Thu\.$/);
  // A rotation miss is carried forward to today: Start it, not a Move proposal.
  await expect(missed.locator('[data-missed-start]')).toHaveText('Start it');
  await expect(missed.locator('[data-missed-move]')).toHaveCount(0);
  await expectTapTargets(page, '[data-missed-day]');
  await noHorizontalOverflow(page);

  // Last week's recap is in the coach thread, once.
  await page.locator('[data-tab="coach"]').click();
  const recap = coachTab(page).locator('[data-recap="week"]');
  await expect(recap).toHaveCount(1);
  await expect(recap).toContainText('Mon 2 Nov to Sun 8 Nov');
  await page.locator('[data-tab="today"]').click();

  // Skip it: the card goes and stays gone; the recap isn't posted again.
  await revealNotice(page, missed);
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
  await expect(cell(page, '2026-11-11')).toHaveAttribute('data-status', 'rest'); // the week's day off (no fixed rest days)
  await expect(cell(page, '2026-11-12')).toHaveAttribute('data-status', 'missed');
  await expect(cell(page, '2026-11-13')).toHaveAttribute('data-status', 'planned');
  await expect(cell(page, '2026-11-13')).toHaveAttribute('aria-current', 'date');
  await expect(cell(page, '2026-11-01')).toHaveAttribute('data-status', 'rest'); // before day one
  for (const s of ['done', 'partial', 'missed', 'planned'])
    await expect(page.locator(`[data-legend="${s}"]`)).toBeVisible();

  // Week score: Mon 9 and Tue 10 trained of the weekly target of 6. M13: one headline score
  // (sessions, with its label); the sets % is a quiet second line, also in the card's name.
  await expect(page.locator('[data-score="week"] .cal-score-num')).toHaveText('2 of 6');
  await expect(page.locator('[data-score="week"] [data-score-line]')).toHaveText('sessions done');
  const sets = page.locator('[data-score="week"] [data-score-sets]');
  await expect(sets).toHaveText(/^\d+% of planned sets$/);
  const pct = /(\d+)%/.exec((await sets.textContent()) ?? '')?.[1];
  await expect(page.locator('[data-score="week"]')).toHaveAttribute(
    'aria-label',
    `This week: 2 of 6 sessions, ${pct}% of planned sets`,
  );
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

  // A missed day offers Do it today only (Move is from today on). Do it today opens the Coach tab
  // with doToday sent; the rotation already carried that day to today, so the coach says so.
  await cell(page, '2026-11-12').click();
  await expect(dayScreen(page).locator('[data-day-action]')).toHaveCount(1);
  await dayScreen(page).locator('[data-day-action="doToday"]').click();
  await expect(coachTab(page)).toBeVisible();
  const said = coachTab(page).locator('.cs-msg-user').last();
  await expect(said).toHaveText(/Do (.+) today$/);
  const name = /Do (.+) today$/.exec((await said.textContent()) ?? '')?.[1] ?? '';
  await expect(coachTab(page).locator('.cs-msg-coach').last()).toContainText(
    `${name} is already today's workout.`,
  );
  await expect(coachTab(page).locator('[data-proposal]')).toHaveCount(0);

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

  // M13: Share opens a preview (Post size first); its Share button makes the file.
  await page.locator('[data-share-month]').click();
  await expect(page.locator('[data-share-image]')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-go]').click(),
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

/** "Pull A" from a day screen's "Pull A · Planned". */
async function dayNameOn(page: Page, date: string): Promise<string> {
  await month(page).locator(`[data-cal-day="${date}"]`).click();
  await expect(dayScreen(page)).toHaveAttribute('data-date', date);
  const sub = (await dayScreen(page).locator('[data-day-sub]').textContent()) ?? '';
  return sub.split(' · ')[0] ?? '';
}

async function backToMonth(page: Page) {
  await dayScreen(page).locator('[data-cal-back]').click();
  await expect(month(page)).toBeVisible();
}

test('a later day: Do it today → proposal → Apply → Today and Calendar run it today → Undo', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();

  await page.locator('[data-tab="calendar"]').click();
  const later = await dayNameOn(page, '2026-11-14');
  expect(later).not.toBe('Push A');
  const laterId = PROGRAM.days.find((d) => d.name === later)?.id ?? '';
  await expect(dayScreen(page).locator('[data-day-action]')).toHaveCount(2);
  await dayScreen(page).locator('[data-day-action="doToday"]').click();

  // The Coach tab with doToday sent: his bubble, then the proposal waiting for Apply.
  await expect(coachTab(page)).toBeVisible();
  await expect(coachTab(page).locator('.cs-msg-user').last()).toHaveText(`You: Do ${later} today`);
  const card = coachTab(page).locator('[data-proposal]').last();
  await expect(card).toContainText(`Do ${later} today`);
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toBeVisible();

  // Today runs it now; the Calendar's today reads it as to do today.
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator(`[data-hero="${laterId}"]`)).toBeVisible();
  await page.locator('[data-tab="calendar"]').click();
  expect(await dayNameOn(page, '2026-11-13')).toBe(later);
  await expect(dayScreen(page).locator('[data-day-sub]')).toContainText('To do today');
  await backToMonth(page);

  // Undo on the card: back to the plan as it was.
  await page.locator('[data-tab="coach"]').click();
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await page.locator('[data-tab="calendar"]').click();
  expect(await dayNameOn(page, '2026-11-13')).toBe('Push A');

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a later day: Move → "to which day?" date chips → Apply → the Calendar shows it moved → Undo', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await page.locator('[data-tab="calendar"]').click();
  const name = await dayNameOn(page, '2026-11-14');
  await dayScreen(page).locator('[data-day-action="move"]').click();

  // The coach asks where to, with date chips (≥ 56px).
  await expect(coachTab(page)).toBeVisible();
  await expect(coachTab(page).locator('.cs-msg-user').last()).toHaveText('You: Move Sat 14 Nov');
  await expect(coachTab(page).locator('.cs-msg-coach').last()).toContainText(
    `Move ${name} to which day?`,
  );
  const chips = coachTab(page).locator('[data-coach-followup]');
  await expect(chips.first()).toBeVisible();
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  const label = (await chips.first().textContent())?.trim() ?? '';
  const dom = Number(/(\d+)$/.exec(label)?.[1]);
  expect(dom).toBeGreaterThan(14);
  const to = `2026-11-${String(dom)}`;
  await chips.first().click();

  const card = coachTab(page).locator('[data-proposal]').last();
  await expect(card).toContainText(`Move ${name}`);
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toBeVisible();

  // The Calendar: Sat 14 rests, the day lands on the chosen date.
  await page.locator('[data-tab="calendar"]').click();
  await expect(cell(page, '2026-11-14')).toHaveAttribute('data-status', 'rest');
  expect(await dayNameOn(page, to)).toBe(name);
  await backToMonth(page);

  // Undo: Sat 14 has it again.
  await page.locator('[data-tab="coach"]').click();
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();
  await page.locator('[data-tab="calendar"]').click();
  await expect(cell(page, '2026-11-14')).toHaveAttribute('data-status', 'planned');
  expect(await dayNameOn(page, '2026-11-14')).toBe(name);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test("a rotation miss: Start it opens today's workout and the answer is stored first", async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, at(13, 18));
  await seedWeek(page);
  const missed = page.locator('[data-missed-day="2026-11-12"]');
  const heroId = (await page.locator('[data-hero]').first().getAttribute('data-hero')) ?? '';
  await revealNotice(page, missed);
  await missed.locator('[data-missed-start]').click();
  const preview = page.locator('[data-screen="preview"]');
  await expect(preview).toBeVisible();
  await expect(preview.locator('#preview-title')).toHaveText(dayOf(heroId).name);
  expect(await answered(page)).toContain('2026-11-12');
  await preview.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-hero]').first()).toBeVisible();
  await expect(page.locator('[data-missed-day]')).toHaveCount(0);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a focus-block miss: Move it → the Coach tab with Do it today sent → Apply → Today runs it', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // Wed 11 (Push A done on Mon 9, so misses count from there): a chest block starting today,
  // applied in the chat.
  await openApp(page, at(11, 18));
  await seed(
    page,
    [{ sessionId: 'b-mon', dayId: 'push-a', startedAt: at(9, 18), endedAt: at(9, 18) + 70 * MIN }],
    allSets('b-mon', PUSH_A, at(9, 18)),
  );
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await page.locator('[data-tab="coach"]').click();
  await coachTab(page).getByLabel('Ask the coach').fill('This month I want to build my chest');
  await coachTab(page).getByRole('button', { name: 'Send' }).click();
  await coachTab(page).locator('[data-coach-followup]').filter({ hasText: '5 days' }).click();
  // M13c: "Also add abs?" (the plan has no abs); No keeps the chest-only block.
  await expect(coachTab(page)).toContainText('Also add abs?');
  await coachTab(page).locator('[data-coach-followup]').filter({ hasText: /^No$/ }).click();
  const block = coachTab(page).locator('[data-focus-block-card]').last();
  await block.getByRole('button', { name: 'Apply' }).click();
  await expect(block.locator('[data-card-status="applied"]')).toBeVisible();

  // Two days later, nothing done: the newest missed block day is offered with Move it.
  await page.clock.setSystemTime(at(13, 18));
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  const missed = page.locator('[data-missed-day]');
  await revealNotice(page, missed);
  await expect(missed.locator('[data-missed-move]')).toHaveText('Move it');
  await expect(missed.locator('[data-missed-start]')).toHaveCount(0);
  const date = (await missed.getAttribute('data-missed-day')) ?? '';
  const text = (await missed.locator('.missed-text').textContent()) ?? '';
  const name = /You missed (.+) on /.exec(text)?.[1] ?? '';
  expect(name).not.toBe('');
  await missed.locator('[data-missed-move]').click();

  await expect(coachTab(page)).toBeVisible();
  await expect(coachTab(page).locator('.cs-msg-user').last()).toHaveText(`You: Do ${name} today`);
  const card = coachTab(page).locator('[data-proposal]').last();
  await expect(card).toContainText(`Do ${name} today`);
  await expect(card).toContainText('focus block stays as planned');
  expect(await answered(page)).toContain(date);
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toBeVisible();
  await page.locator('[data-tab="today"]').click();
  await expect(page.locator('[data-hero]').first()).toBeVisible();
  await expect(page.locator('[data-missed-day]')).toHaveCount(0);
  await page.locator('[data-tab="calendar"]').click();
  expect(await dayNameOn(page, '2026-11-13')).toBe(name);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
