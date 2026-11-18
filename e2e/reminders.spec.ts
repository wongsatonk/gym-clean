// M12 slice 2 task 21: reminders in the iPhone app, end to end at 390×844 with the fake
// `@capacitor/local-notifications` (src/native/fakeReminders.ts, `installFakeLocalNotifications`).
// All three are off by default and nothing is asked at launch; turning one on asks iPhone for
// permission once and schedules the next days on this phone; another switch doesn't ask again;
// a new time re-schedules; off cancels exactly that kind; the settings and the schedule survive
// a reload without duplicates. Denied → a plain box and nothing scheduled. The PWA shows one
// line and never touches the plugin. Notification text has no numbers. No request leaves the
// dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  at,
  expectTapTargets,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';
import {
  installFakeLocalNotifications,
  type FakeNotificationsOptions,
  type FakeNotificationsState,
} from '../src/native/fakeReminders';

declare global {
  interface Window {
    __gymCleanFakeNotifications: FakeNotificationsState;
  }
}

/** Fri 13 Nov 2026, 08:00: a training day, before the default 18:00 reminder. */
const NOW = at(13, 8);

const screen = (page: Page) => page.locator('main[data-screen="reminders"]');
const sw = (page: Page, s: string) => screen(page).locator(`[data-setting="reminder-${s}"]`);
const fake = (page: Page) => page.evaluate(() => window.__gymCleanFakeNotifications);

type Kind = 'session' | 'missedDay' | 'sundayRecap';
const KIND: Record<number, Kind> = { 1: 'session', 2: 'missedDay', 3: 'sundayRecap' };

/** Pending notifications, decoded: kind (from the id scheme), local "HH:MM", weekday. */
async function pending(page: Page) {
  const s = await fake(page);
  return s.pending.map((p) => {
    const d = new Date(p.at);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return {
      kind: KIND[Math.floor(p.id / 100_000_000)],
      time: hhmm,
      day: d.getDay(),
      at: p.at,
      title: p.title,
      body: p.body,
    };
  });
}
const ofKind = async (page: Page, k: Kind) => (await pending(page)).filter((p) => p.kind === k);

async function open(page: Page, opts: FakeNotificationsOptions = {}) {
  await page.addInitScript(installFakeLocalNotifications, opts);
  await openApp(page, NOW);
}

async function openReminders(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-reminders-open]').click();
  await expect(screen(page)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
}

test('off by default; on → asks once → scheduled; a new time re-schedules; off cancels; survives a reload', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page);
  await openReminders(page);

  // All off, nothing asked, nothing scheduled.
  for (const s of ['session', 'missed-day', 'sunday-recap'])
    await expect(sw(page, s)).toHaveAttribute('aria-checked', 'false');
  await expect(screen(page).locator('[data-reminders-ask]')).toBeVisible();
  await expect(screen(page).locator('[data-reminder-time]')).toHaveCount(0);
  let f = await fake(page);
  expect(f.prompts).toBe(0);
  expect(f.calls).not.toContain('requestPermissions');
  expect(f.calls).not.toContain('schedule');
  expect(f.pending).toEqual([]);
  await expectTapTargets(page, 'main[data-screen="reminders"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-reminders-off.png') });

  // Session reminder on → iPhone asks once → the coming training days at 18:00.
  await sw(page, 'session').click();
  await expect(sw(page, 'session')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await ofKind(page, 'session')).length).toBeGreaterThan(0);
  f = await fake(page);
  expect(f.prompts).toBe(1);
  await expect(screen(page).locator('[data-reminders-ask]')).toHaveCount(0);
  await expect(screen(page).locator('[data-reminder-time]')).toHaveValue('18:00');
  const sessions = await ofKind(page, 'session');
  expect(sessions.every((p) => p.time === '18:00' && p.at > NOW)).toBe(true);
  // Coaching words only: no numbers (no body, Health, weight or food numbers).
  for (const p of sessions) {
    expect(p.title).toBe('Gym Clean');
    expect(p.body).toMatch(/today\. Ready when you are\.$/);
    expect(p.body).not.toMatch(/\d/);
  }
  await expectTapTargets(page, 'main[data-screen="reminders"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-reminders-on.png') });

  // Two more on: no second prompt; the Sunday recap is set for Sunday 19:00.
  await sw(page, 'missed-day').click();
  await sw(page, 'sunday-recap').click();
  await expect(sw(page, 'sunday-recap')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await ofKind(page, 'sundayRecap')).length).toBeGreaterThan(0);
  for (const p of await ofKind(page, 'sundayRecap')) {
    expect(p.day).toBe(0);
    expect(p.time).toBe('19:00');
    expect(p.body).not.toMatch(/\d/);
  }
  f = await fake(page);
  expect(f.prompts).toBe(1);
  expect(f.calls.filter((c) => c === 'requestPermissions')).toHaveLength(1);
  // The missed-day nudge waits the morning after today's session (re-planned away once it's done).
  const nudges = await ofKind(page, 'missedDay');
  expect(nudges.length).toBeGreaterThan(0);
  for (const p of nudges) {
    expect(p.time).toBe('09:00');
    expect(p.body).toMatch(/^Missed .+ yesterday\? Pick it up when you're ready\.$/);
    expect(p.body).not.toMatch(/\d/);
  }

  // A new time: the session reminders move to it.
  const time = screen(page).locator('[data-reminder-time]');
  await time.fill('07:30');
  await time.dispatchEvent('change');
  await expect
    .poll(async () => (await ofKind(page, 'session')).map((p) => p.time))
    .not.toContain('18:00');
  const moved = await ofKind(page, 'session');
  expect(moved.length).toBeGreaterThan(0);
  expect(moved.every((p) => p.time === '07:30' && p.at > NOW)).toBe(true);

  // Session reminder off: exactly its notifications go; the recap stays.
  await sw(page, 'session').click();
  await expect(sw(page, 'session')).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => (await ofKind(page, 'session')).length).toBe(0);
  const recaps = await ofKind(page, 'sundayRecap');
  expect(recaps.length).toBeGreaterThan(0);
  expect((await fake(page)).calls).toContain('cancel');

  // Stored on the phone; after a reload the same switches and the same schedule (no duplicates).
  expect(await getSetting(page, 'reminders')).toMatchObject({
    session: { on: false, time: '07:30' },
    missedDay: { on: true },
    sundayRecap: { on: true },
    askedPermission: true,
  });
  const before = (await fake(page)).pending.map((p) => p.id).sort();
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(errors).toEqual([]);

  // The app opened again (same phone: the database stays; iPhone keeps the permission and what's
  // pending, so the fake starts from there). It re-plans on open: same ids, nothing twice.
  const again = await page.context().newPage();
  const errors2 = record(again).errors;
  await page.close();
  const reopened: FakeNotificationsOptions = { display: 'granted', pendingIds: before };
  await again.addInitScript(installFakeLocalNotifications, reopened);
  await openApp(again, NOW);
  await openReminders(again);
  await expect(sw(again, 'session')).toHaveAttribute('aria-checked', 'false');
  await expect(sw(again, 'missed-day')).toHaveAttribute('aria-checked', 'true');
  await expect(sw(again, 'sunday-recap')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await fake(again)).calls).toContain('getPending');
  await expect
    .poll(async () => (await ofKind(again, 'sundayRecap')).map((p) => p.body))
    .toEqual(recaps.map((p) => p.body));
  const after = (await fake(again)).pending.map((p) => p.id);
  expect(new Set(after).size).toBe(after.length);
  expect([...after].sort()).toEqual(before);
  // No prompt this time: permission was already given.
  expect((await fake(again)).prompts).toBe(0);
  expect(await again.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors2).toEqual([]);
});

test('denied → a plain box on how to allow them; nothing scheduled', async ({ page }, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await open(page, { grantOnRequest: false });
  await openReminders(page);
  await sw(page, 'session').click();
  await expect(screen(page).locator('[data-reminders-denied]')).toBeVisible();
  await expect(screen(page).locator('[data-reminders-denied]')).toContainText(
    'iPhone Settings > Notifications > Gym Clean',
  );
  const f = await fake(page);
  expect(f.prompts).toBe(1);
  expect(f.pending).toEqual([]);
  expect(f.calls).not.toContain('schedule');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-reminders-denied.png') });
  // Another switch: iPhone isn't asked again.
  await sw(page, 'sunday-recap').click();
  await expect(sw(page, 'sunday-recap')).toHaveAttribute('aria-checked', 'true');
  expect((await fake(page)).prompts).toBe(1);
  expect((await fake(page)).pending).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('the PWA: one line, no switches, the plugin is never called', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  // A Capacitor object that says "not native" first, then the fake keeps it that way.
  await page.addInitScript(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => false };
  });
  await open(page);
  await openReminders(page);
  await expect(screen(page).locator('[data-reminders-pwa]')).toHaveText(
    'Reminders work in the iPhone app.',
  );
  await expect(screen(page).locator('[role="switch"]')).toHaveCount(0);
  await noHorizontalOverflow(page);
  expect((await fake(page)).calls).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

// The fixed times in the copy follow the same clock as the time picker (the phone's locale):
// a 12-hour phone reads "09:00 AM" and "07:00 PM", a 24-hour one "09:00" and "19:00".
for (const c of [
  { locale: 'en-US', missed: '09:00 AM', recap: '07:00 PM', picker: /PM/ },
  { locale: 'en-GB', missed: '09:00', recap: '19:00', picker: null },
] as const) {
  test.describe(`clock: ${c.locale}`, () => {
    test.use({ locale: c.locale });
    test(`the copy's times match the picker's clock (${c.locale})`, async ({ page }, testInfo) => {
      const { errors } = record(page);
      await open(page, { display: 'granted' });
      await openReminders(page);
      await sw(page, 'session').click();
      await expect(screen(page).locator('[data-reminder-time]')).toHaveValue('18:00');
      const sp = (s: string | null) => (s ?? '').replace(/\s/g, ' ');
      const missed = sp(await screen(page).locator('#rem-note-missedDay').textContent());
      const recap = sp(await screen(page).locator('#rem-note-sundayRecap').textContent());
      expect(missed).toBe(`The morning after a missed session, at ${c.missed}.`);
      expect(recap).toBe(`Sunday at ${c.recap}: a nudge to look back at your week.`);
      // The browser's own clock for this locale agrees (what the picker draws with).
      const pickerClock = await page.evaluate(() =>
        new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
          new Date(2026, 0, 1, 18, 0),
        ),
      );
      if (c.picker) expect(pickerClock).toMatch(c.picker);
      else expect(pickerClock).toBe('18:00');
      await expectTapTargets(page, 'main[data-screen="reminders"]');
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`m12s2-reminders-${c.locale}.png`) });
      expect(errors).toEqual([]);
    });
  });
}
