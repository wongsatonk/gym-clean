import { describe, expect, it } from 'vitest';
import { STREAK_MIN_PER_WEEK, weeklyStreak } from '../stats';
import type { SetLog } from '../types';
import {
  SHARE_LEADS,
  leadOptions,
  pickLead,
  shareLeadText,
  shareStats,
  type ShareSession,
} from './shareStats';

// Made-up sessions only (public repo). Local times.
const at = (y: number, m: number, d: number, h = 18) => new Date(y, m - 1, d, h).getTime();

let id = 0;
type Made = { session: ShareSession; sets: SetLog[] };
function made(
  start: number,
  sets: Array<[kg: number, reps: number, warmup?: true]>,
  finished = true,
): Made {
  const sessionId = `s${++id}`;
  const session: ShareSession = {
    sessionId,
    dayId: 'day-a',
    startedAt: start,
    ...(finished ? { endedAt: start + 3600_000 } : {}),
  };
  return {
    session,
    sets: sets.map(([weightKg, reps, warmup], i) => ({
      sessionId,
      exerciseId: 'ex-1',
      setIndex: i,
      reps,
      weightKg,
      restTakenSec: 90,
      startedAt: start + i * 60_000,
      endedAt: start + i * 60_000 + 30_000,
      ...(warmup ? { warmup } : {}),
    })),
  };
}
const flat = (list: Made[]) => ({
  sessions: list.map((m) => m.session),
  sets: list.flatMap((m) => m.sets),
});

const october = [
  made(at(2026, 10, 5), [
    [20, 8, true],
    [40, 10],
    [40, 10],
    [40, 10],
  ]), // 1200 kg, warm-up out
  made(at(2026, 10, 7), [
    [30, 10],
    [30, 10],
    [0, 15],
  ]), // 600 kg + bodyweight
  made(at(2026, 10, 9), [[50, 5]]), // 250 kg
  made(at(2026, 10, 12), [[20, 8, true]]), // warm-ups only: not a session done
  made(at(2026, 10, 20), [[100, 10]], false), // never finished
  made(at(2026, 9, 30), [[100, 10]]), // September
  made(at(2026, 11, 2), [[100, 10]]), // November
];

describe('shareStats', () => {
  it('a known month: sessions done, total volume (warm-ups and unfinished out)', () => {
    const { sessions, sets } = flat(october);
    expect(shareStats('2026-10', sessions, sets, at(2026, 11, 17))).toEqual({
      sessionsDone: 3,
      volumeKg: 2050,
      streakWeeks: weeklyStreak(sessions, new Date(2026, 9, 31, 23, 59, 59, 999).getTime()),
    });
  });

  it('warm-up sets never add volume and a warm-up-only session is not counted', () => {
    const only = [
      made(at(2026, 10, 14), [
        [60, 8, true],
        [80, 4, true],
      ]),
    ];
    const { sessions, sets } = flat(only);
    expect(shareStats('2026-10', sessions, sets, at(2026, 11, 1))).toMatchObject({
      sessionsDone: 0,
      volumeKg: 0,
    });
  });

  it('an empty month is all zeros', () => {
    expect(shareStats('2026-08', [], [], at(2026, 11, 17))).toEqual({
      sessionsDone: 0,
      volumeKg: 0,
      streakWeeks: 0,
    });
    const { sessions, sets } = flat(october);
    expect(shareStats('2026-08', sessions, sets, at(2026, 11, 17))).toEqual({
      sessionsDone: 0,
      volumeKg: 0,
      streakWeeks: 0,
    });
  });

  it('streak comes from stats.ts, as of the month end for a past month', () => {
    // Mon / Wed / Fri in the weeks of Oct 12, 19 and 26: three weeks in a row by Oct 31.
    const weeks = [12, 19, 26].flatMap((mon) =>
      [0, 2, 4].map((d) => made(at(2026, 10, mon + d), [[20, 10]])),
    );
    const { sessions, sets } = flat(weeks);
    const s = shareStats('2026-10', sessions, sets, at(2026, 11, 17));
    expect(s.streakWeeks).toBe(3);
    expect(s.streakWeeks).toBe(
      weeklyStreak(sessions, new Date(2026, 9, 31, 23, 59, 59, 999).getTime(), STREAK_MIN_PER_WEEK),
    );
    // Today's streak has lapsed (nothing in November), the month's image keeps October's.
    expect(weeklyStreak(sessions, at(2026, 11, 17))).toBe(0);
  });

  it('the current month counts its streak as of today', () => {
    const weeks = [2, 9].flatMap((mon) =>
      [0, 2, 4].map((d) => made(at(2026, 11, mon + d), [[20, 10]])),
    );
    const { sessions, sets } = flat(weeks);
    const today = at(2026, 11, 12);
    expect(shareStats('2026-11', sessions, sets, today).streakWeeks).toBe(
      weeklyStreak(sessions, today),
    );
    // A session later than today (clock skew) is ignored like everywhere else.
    expect(shareStats('2026-11', sessions, sets, today).sessionsDone).toBe(5);
  });

  it('rejects a month that is not YYYY-MM', () => {
    expect(() => shareStats('2026-13', [], [], at(2026, 11, 1))).toThrow(RangeError);
    expect(() => shareStats('Oct', [], [], at(2026, 11, 1))).toThrow(RangeError);
  });
});

describe('leads', () => {
  const full = { sessionsDone: 12, volumeKg: 23_456.4, streakWeeks: 4 };

  it('offers only leads whose number is above 0, sessions first', () => {
    expect(SHARE_LEADS).toEqual(['sessions', 'volume', 'streak']);
    expect(leadOptions(full)).toEqual(['sessions', 'volume', 'streak']);
    expect(leadOptions({ sessionsDone: 3, volumeKg: 0, streakWeeks: 0 })).toEqual(['sessions']);
    expect(leadOptions({ sessionsDone: 0, volumeKg: 0, streakWeeks: 0 })).toEqual([]);
  });

  it('pickLead defaults to sessions, keeps a wanted lead that is offered, else falls back', () => {
    expect(pickLead(full)).toBe('sessions');
    expect(pickLead(full, 'volume')).toBe('volume');
    expect(pickLead(full, 'streak')).toBe('streak');
    expect(pickLead({ sessionsDone: 3, volumeKg: 120, streakWeeks: 0 }, 'streak')).toBe('sessions');
    // Bodyweight-only month: sessions but no volume.
    expect(pickLead({ sessionsDone: 2, volumeKg: 0, streakWeeks: 1 }, 'volume')).toBe('sessions');
  });

  it('never offers a 0: an empty month has no lead', () => {
    expect(pickLead({ sessionsDone: 0, volumeKg: 0, streakWeeks: 0 })).toBeNull();
    expect(pickLead({ sessionsDone: 0, volumeKg: 0, streakWeeks: 0 }, 'volume')).toBeNull();
  });

  it('text: sessions and streak with plurals', () => {
    expect(shareLeadText('sessions', full, 'kg')).toEqual({ value: '12', label: 'sessions done' });
    expect(shareLeadText('sessions', { ...full, sessionsDone: 1 }, 'kg')).toEqual({
      value: '1',
      label: 'session done',
    });
    expect(shareLeadText('streak', full, 'kg')).toEqual({ value: '4', label: 'weeks in a row' });
    expect(shareLeadText('streak', { ...full, streakWeeks: 1 }, 'lb')).toEqual({
      value: '1',
      label: 'week in a row',
    });
  });

  it('text: total lifted in kg and in lb (the lb helper from units.ts), whole numbers', () => {
    expect(shareLeadText('volume', full, 'kg')).toEqual({ value: '23,456', label: 'kg lifted' });
    // 23,456.4 kg / 0.45359237 = 51,712.5… lb
    expect(shareLeadText('volume', full, 'lb')).toEqual({ value: '51,713', label: 'lb lifted' });
  });
});
