import { afterAll, describe, expect, it } from 'vitest';
import fixture from '../progress/fixtures/twoWeeks.json';
import { FIXTURE_SETS, fixtureState, localTime } from '../testkit/progressFixture';
import type { CompletionSession } from '../progress/completion';
import type { ReminderSettings, TrainerState } from '../types';
import {
  DEFAULT_REMINDERS,
  MISSED_DAY_TIME,
  REMINDER_WINDOW_DAYS,
  SUNDAY_RECAP_TIME,
  mergeReminders,
  reminderIdFromNumber,
  reminderNumericId,
  reminderPlan,
  type ReminderPlanInput,
} from './schedule';

// Made-up history (src/core/progress/fixtures/twoWeeks.json): days a/b/c ("Day A"…), rest on
// Tue, Thu, Sun. Mon 2026-11-16 projects b; then Wed c, Fri a, Sat b, Mon c, Wed a, Fri b, Sat c.
// Set at load (not in beforeAll): describe bodies below compute local times while collecting.
const tz = process.env.TZ;
process.env.TZ = 'Europe/Berlin';
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

/** Built inside each test, so local times use the zone above. */
const sessions = (): CompletionSession[] =>
  fixture.sessions.map((s) => ({
    sessionId: s.sessionId,
    dayId: s.dayId,
    startedAt: localTime(s.start),
    ...(s.end ? { endedAt: localTime(s.end) } : {}),
  }));

const on = (over: Partial<ReminderSettings> = {}): ReminderSettings => ({
  session: { on: true, time: '18:00' },
  missedDay: { on: true },
  sundayRecap: { on: true },
  ...over,
});
const only = (kind: 'session' | 'missedDay' | 'sundayRecap'): ReminderSettings => ({
  session: { on: kind === 'session', time: '18:00' },
  missedDay: { on: kind === 'missedDay' },
  sundayRecap: { on: kind === 'sundayRecap' },
});

const input = (over: Partial<ReminderPlanInput> = {}): ReminderPlanInput => ({
  state: fixtureState(),
  sessions: sessions(),
  sets: FIXTURE_SETS,
  ...over,
});

const ids = (plan: { schedule: { id: string }[] }) => plan.schedule.map((r) => r.id);

describe('settings', () => {
  it('everything is off by default; session time 18:00', () => {
    expect(DEFAULT_REMINDERS).toEqual({
      session: { on: false, time: '18:00' },
      missedDay: { on: false },
      sundayRecap: { on: false },
    });
  });

  it('mergeReminders fills defaults and drops junk', () => {
    expect(mergeReminders(undefined)).toEqual(DEFAULT_REMINDERS);
    expect(mergeReminders('x')).toEqual(DEFAULT_REMINDERS);
    expect(mergeReminders({ session: { on: true } })).toEqual({
      ...DEFAULT_REMINDERS,
      session: { on: true, time: '18:00' },
    });
    expect(
      mergeReminders({
        session: { on: 'yes', time: '7:30' },
        missedDay: { on: true },
        sundayRecap: null,
        askedPermission: true,
      }),
    ).toEqual({ ...DEFAULT_REMINDERS, missedDay: { on: true }, askedPermission: true });
    expect(mergeReminders({ session: { on: true, time: '06:45' } }).session).toEqual({
      on: true,
      time: '06:45',
    });
    for (const bad of ['24:00', '12:60', '1200', ''])
      expect(mergeReminders({ session: { on: true, time: bad } }).session.time).toBe('18:00');
  });

  it('times as data: missed-day 09:00, Sunday recap 19:00, 14-day window', () => {
    expect(MISSED_DAY_TIME).toBe('09:00');
    expect(SUNDAY_RECAP_TIME).toBe('19:00');
    expect(REMINDER_WINDOW_DAYS).toBe(14);
  });
});

describe('ids', () => {
  it('string ids are kind:date; numbers are kind code × 1e8 + yyyymmdd and round-trip', () => {
    expect(reminderNumericId('session:2026-11-16')).toBe(120261116);
    expect(reminderNumericId('missedDay:2026-11-13')).toBe(220261113);
    expect(reminderNumericId('sundayRecap:2026-11-22')).toBe(320261122);
    for (const id of ['session:2026-11-16', 'missedDay:2027-01-01', 'sundayRecap:2026-12-27'])
      expect(reminderIdFromNumber(reminderNumericId(id))).toBe(id);
    expect(reminderNumericId('sundayRecap:2099-12-31')).toBeLessThan(2 ** 31);
  });

  it('numbers that are not ours → null; bad string ids throw', () => {
    for (const n of [0, 5, -120261116, 1.5, 420261116, 120261341, 120261300, 99999999])
      expect(reminderIdFromNumber(n)).toBeNull();
    expect(() => reminderNumericId('nap:2026-11-16')).toThrow();
    expect(() => reminderNumericId('session:16-11-2026')).toThrow();
  });
});

describe('reminderPlan', () => {
  const MON_8 = localTime('2026-11-16 08:00');

  it('all off → nothing scheduled, every window id cancelled', () => {
    const plan = reminderPlan(DEFAULT_REMINDERS, input(), MON_8);
    expect(plan.schedule).toEqual([]);
    expect(plan.cancel).toContain('session:2026-11-16');
    expect(plan.cancel).toContain('session:2026-11-29');
    expect(plan.cancel).not.toContain('session:2026-11-30');
    expect(plan.cancel).toContain('missedDay:2026-11-15');
    expect(plan.cancel).toContain('missedDay:2026-11-16');
    expect(plan.cancel).toContain('sundayRecap:2026-11-22');
    expect(plan.cancel).toContain('sundayRecap:2026-11-29');
    expect(plan.cancel).not.toContain('sundayRecap:2026-11-23');
    expect(new Set(plan.cancel).size).toBe(plan.cancel.length);
  });

  it('session: his time on projected training days only, with the day name', () => {
    const plan = reminderPlan(only('session'), input(), MON_8);
    expect(ids(plan)).toEqual(
      [
        '2026-11-16',
        '2026-11-18',
        '2026-11-20',
        '2026-11-21',
        '2026-11-23',
        '2026-11-25',
        '2026-11-27',
        '2026-11-28',
      ].map((d) => `session:${d}`),
    );
    expect(plan.schedule[0]).toEqual({
      id: 'session:2026-11-16',
      numericId: 120261116,
      kind: 'session',
      date: '2026-11-16',
      at: localTime('2026-11-16 18:00'),
      title: 'Gym Clean',
      body: 'Day B today. Ready when you are.',
    });
    expect(plan.schedule[1]?.body).toBe('Day C today. Ready when you are.');
    // Rest days (Tue, Thu, Sun) are cancelled, never scheduled.
    expect(plan.cancel).toContain('session:2026-11-17');
    expect(plan.cancel).toContain('session:2026-11-22');
    expect(plan.cancel.filter((id) => ids(plan).includes(id))).toEqual([]);
  });

  it('session time follows his setting', () => {
    const plan = reminderPlan(
      { ...only('session'), session: { on: true, time: '06:30' } },
      input(),
      localTime('2026-11-16 05:00'),
    );
    expect(plan.schedule[0]?.at).toBe(localTime('2026-11-16 06:30'));
  });

  it("skips today's reminder once its time has passed", () => {
    const plan = reminderPlan(only('session'), input(), localTime('2026-11-16 18:00'));
    expect(ids(plan)[0]).toBe('session:2026-11-18');
    expect(plan.cancel).toContain('session:2026-11-16');
  });

  it("no reminder once today's session is done (finished, started today)", () => {
    const done = [
      ...sessions(),
      {
        sessionId: 'today',
        dayId: 'b',
        startedAt: localTime('2026-11-16 07:00'),
        endedAt: localTime('2026-11-16 07:50'),
      },
    ];
    const plan = reminderPlan(only('session'), input({ sessions: done }), MON_8);
    expect(ids(plan)).not.toContain('session:2026-11-16');
    expect(ids(plan)[0]).toBe('session:2026-11-18');
  });

  it("an unfinished session today doesn't count as done", () => {
    const open = [
      ...sessions(),
      { sessionId: 'today', dayId: 'b', startedAt: localTime('2026-11-16 07:00') },
    ];
    const plan = reminderPlan(only('session'), input({ sessions: open }), MON_8);
    expect(ids(plan)[0]).toBe('session:2026-11-16');
  });

  it("no fixed rest weekdays: the week's days off (uncounted future dates) get no reminder", () => {
    const base = fixtureState();
    const state: TrainerState = { ...base, schedule: { ...base.schedule, restWeekdays: [] } };
    const plan = reminderPlan(only('session'), input({ state }), MON_8);
    expect(ids(plan)).toEqual(
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-23', '2026-11-24', '2026-11-25'].map(
        (d) => `session:${d}`,
      ),
    );
  });

  describe('missed day', () => {
    // Sat 2026-11-14 08:00, before that day's session: Fri 2026-11-13 (Day C) was missed.
    const SAT_8 = localTime('2026-11-14 08:00');
    const before = () => sessions().filter((s) => s.startedAt < SAT_8);

    it("yesterday missed → a nudge today at 09:00, keyed by the missed date; today's planned day → tomorrow 09:00", () => {
      const plan = reminderPlan(only('missedDay'), input({ sessions: before() }), SAT_8);
      expect(plan.schedule).toEqual([
        {
          id: 'missedDay:2026-11-13',
          numericId: 220261113,
          kind: 'missedDay',
          date: '2026-11-13',
          at: localTime('2026-11-14 09:00'),
          title: 'Gym Clean',
          body: "Missed Day C yesterday? Pick it up when you're ready.",
        },
        expect.objectContaining({
          id: 'missedDay:2026-11-14',
          date: '2026-11-14',
          at: localTime('2026-11-15 09:00'),
        }),
      ]);
    });

    it('once per missed day: the same plan again gives the same ids', () => {
      const a = reminderPlan(only('missedDay'), input({ sessions: before() }), SAT_8);
      const b = reminderPlan(only('missedDay'), input({ sessions: before() }), SAT_8 + 60_000);
      expect(ids(b)).toEqual(ids(a));
      // After 09:00 it has been shown: not scheduled again.
      const later = reminderPlan(
        only('missedDay'),
        input({ sessions: before() }),
        localTime('2026-11-14 09:00'),
      );
      expect(ids(later)).toEqual(['missedDay:2026-11-14']);
      expect(later.cancel).toContain('missedDay:2026-11-13');
    });

    it('an answered miss (Move it / Skip it) gets no nudge', () => {
      const plan = reminderPlan(
        only('missedDay'),
        input({ sessions: before(), answeredMissed: ['2026-11-13'] }),
        SAT_8,
      );
      expect(ids(plan)).toEqual(['missedDay:2026-11-14']);
      expect(plan.cancel).toContain('missedDay:2026-11-13');
    });

    it('today done → no nudge for today; a rest day yesterday → none for yesterday', () => {
      // Mon 2026-11-16: yesterday (Sun) was a rest day with an extra session.
      const done = [
        ...sessions(),
        {
          sessionId: 'today',
          dayId: 'b',
          startedAt: localTime('2026-11-16 07:00'),
          endedAt: localTime('2026-11-16 07:50'),
        },
      ];
      expect(ids(reminderPlan(only('missedDay'), input({ sessions: done }), MON_8))).toEqual([]);
      expect(ids(reminderPlan(only('missedDay'), input(), MON_8))).toEqual([
        'missedDay:2026-11-16',
      ]);
    });

    it("a rest day today → no nudge for today (Mon 2026-11-16 missed → today's 09:00 only)", () => {
      const tue = localTime('2026-11-17 08:00');
      expect(ids(reminderPlan(only('missedDay'), input(), tue))).toEqual(['missedDay:2026-11-16']);
      const wed = localTime('2026-11-18 08:00');
      const rest = reminderPlan(
        only('missedDay'),
        input({ answeredMissed: ['2026-11-16'] }),
        localTime('2026-11-17 08:00'),
      );
      expect(ids(rest)).toEqual([]);
      expect(ids(reminderPlan(only('missedDay'), input(), wed))).toEqual(['missedDay:2026-11-18']);
    });
  });

  it('Sunday recap: 19:00 each Sunday in the window', () => {
    const plan = reminderPlan(only('sundayRecap'), input(), MON_8);
    expect(plan.schedule.map((r) => [r.id, r.at, r.body])).toEqual([
      [
        'sundayRecap:2026-11-22',
        localTime('2026-11-22 19:00'),
        'Sunday check-in: how did this week feel?',
      ],
      [
        'sundayRecap:2026-11-29',
        localTime('2026-11-29 19:00'),
        'Sunday check-in: how did this week feel?',
      ],
    ]);
    const sunLate = reminderPlan(only('sundayRecap'), input(), localTime('2026-11-22 19:30'));
    // Window 2026-11-22 … 2026-12-05: tonight's has passed.
    expect(ids(sunLate)).toEqual(['sundayRecap:2026-11-29']);
  });

  it('turning one off puts its ids in cancel and keeps the others', () => {
    const all = reminderPlan(on(), input(), MON_8);
    const noSession = reminderPlan(
      { ...on(), session: { on: false, time: '18:00' } },
      input(),
      MON_8,
    );
    const sessionIds = ids(all).filter((id) => id.startsWith('session:'));
    expect(sessionIds.length).toBeGreaterThan(0);
    for (const id of sessionIds) expect(noSession.cancel).toContain(id);
    expect(ids(noSession)).toEqual(ids(all).filter((id) => !id.startsWith('session:')));
  });

  it('pending ids outside the window are cancelled; scheduled ones never are', () => {
    const plan = reminderPlan(
      only('session'),
      input({ pending: ['session:2026-11-01', 'session:2026-11-16', 'missedDay:2026-11-10'] }),
      MON_8,
    );
    expect(plan.cancel).toContain('session:2026-11-01');
    expect(plan.cancel).toContain('missedDay:2026-11-10');
    expect(plan.cancel).not.toContain('session:2026-11-16');
    expect(new Set(plan.cancel).size).toBe(plan.cancel.length);
  });

  it('a new install (no sessions) still gets session reminders', () => {
    const plan = reminderPlan(only('session'), input({ sessions: [], sets: [] }), MON_8);
    expect(ids(plan)[0]).toBe('session:2026-11-16');
  });

  it('sorted by time', () => {
    const plan = reminderPlan(on(), input(), MON_8);
    const at = plan.schedule.map((r) => r.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  describe('local wall-clock times across DST (Europe/Berlin)', () => {
    it('spring forward (Sun 2027-03-28): still 18:00 / 19:00 local', () => {
      const base = fixtureState();
      const state: TrainerState = { ...base, schedule: { ...base.schedule, restWeekdays: [] } };
      const plan = reminderPlan(on(), input({ state }), localTime('2027-03-22 08:00'));
      const rows = plan.schedule;
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const d = new Date(r.at);
        const want = r.kind === 'session' ? 18 : r.kind === 'sundayRecap' ? 19 : 9;
        expect([d.getHours(), d.getMinutes()], r.id).toEqual([want, 0]);
      }
      const sundays = rows.filter((r) => r.kind === 'sundayRecap').map((r) => r.at);
      expect(sundays).toHaveLength(2);
      expect((sundays[1] ?? 0) - (sundays[0] ?? 0)).toBe(7 * 24 * 3_600_000);
      const recap = (date: string) =>
        reminderPlan(only('sundayRecap'), input({ state }), localTime(`${date} 08:00`)).schedule[0]
          ?.at ?? NaN;
      // 2027-03-21 → 2027-03-28 crosses the switch: one hour shorter.
      expect(recap('2027-03-28') - recap('2027-03-21')).toBe(7 * 24 * 3_600_000 - 3_600_000);
    });

    it('fall back (Sun 2026-10-25): one hour longer', () => {
      const recap = (date: string) =>
        reminderPlan(only('sundayRecap'), input(), localTime(`${date} 08:00`)).schedule[0]?.at ??
        NaN;
      expect(recap('2026-10-25') - recap('2026-10-18')).toBe(7 * 24 * 3_600_000 + 3_600_000);
      expect(new Date(recap('2026-10-25')).getHours()).toBe(19);
    });
  });
});
