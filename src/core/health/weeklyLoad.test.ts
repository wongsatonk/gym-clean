import { describe, expect, it } from 'vitest';
import type { HealthDay, HealthWorkout } from '../types';
import { GYM_CLEAN_SOURCES, OVERLAP_SLACK_MS, weeklyLoad, type LoadSession } from './weeklyLoad';

// Made-up data only. Local-time constructor so the tests hold in any time zone.
// 2030-01-07 is a Monday.
const at = (d: number, h: number, mi = 0): number => new Date(2030, 0, d, h, mi).getTime();
const MIN = 60_000;

const session = (id: string, d: number, h: number, minutes = 60): LoadSession => ({
  sessionId: id,
  dayId: 'push-a',
  startedAt: at(d, h),
  endedAt: at(d, h) + minutes * MIN,
});

const wo = (
  d: number,
  h: number,
  minutes: number,
  kind: string,
  source = 'WHOOP',
): HealthWorkout => ({
  start: at(d, h),
  minutes,
  kind,
  source,
});

const day = (date: string, workouts: HealthWorkout[]): HealthDay => ({ date, workouts });

describe('weeklyLoad', () => {
  const today = at(10, 20); // Thursday evening

  it('counts finished gym sessions and outside workouts in this Mon–Sun week', () => {
    const load = weeklyLoad({
      sessions: [session('s1', 7, 18), session('s2', 9, 18), session('old', 5, 18)],
      healthDays: [
        day('2030-01-06', [wo(6, 9, 30, 'running')]), // last Sunday: not this week
        day('2030-01-08', [wo(8, 7, 40, 'running')]),
        day('2030-01-10', [wo(10, 17, 90, 'soccer')]),
      ],
      today,
    });
    expect(load.gymSessions).toBe(2);
    expect(load.outside).toEqual([
      { start: at(8, 7), minutes: 40, kind: 'running', source: 'WHOOP' },
      { start: at(10, 17), minutes: 90, kind: 'soccer', source: 'WHOOP' },
    ]);
    expect(load.outsideMinutes).toBe(130);
  });

  it('skips unfinished sessions and sessions after today', () => {
    const open: LoadSession = { sessionId: 'o', dayId: 'x', startedAt: at(10, 18) };
    const load = weeklyLoad({
      sessions: [open, session('later', 12, 18)],
      healthDays: [],
      today,
    });
    expect(load.gymSessions).toBe(0);
  });

  it('a gym session also logged as a Health workout counts once (time overlap)', () => {
    const load = weeklyLoad({
      sessions: [session('s1', 8, 18, 60)],
      healthDays: [
        day('2030-01-08', [
          // WHOOP auto-detected the same lifting session, starting a few minutes early.
          {
            start: at(8, 18) - 4 * MIN,
            minutes: 58,
            kind: 'traditionalStrengthTraining',
            source: 'WHOOP',
          },
          wo(8, 7, 40, 'running'),
        ]),
      ],
      today,
    });
    expect(load.gymSessions).toBe(1);
    expect(load.outside.map((w) => w.kind)).toEqual(['running']);
  });

  it('overlap uses a small slack on both sides and nothing more', () => {
    const s1 = session('s1', 8, 18, 60);
    const end = s1.endedAt as number;
    const justIn: HealthWorkout = {
      start: end + OVERLAP_SLACK_MS - MIN,
      minutes: 30,
      kind: 'walking',
      source: 'WHOOP',
    };
    const justOut: HealthWorkout = {
      start: end + OVERLAP_SLACK_MS + MIN,
      minutes: 30,
      kind: 'cycling',
      source: 'WHOOP',
    };
    const load = weeklyLoad({
      sessions: [s1],
      healthDays: [day('2030-01-08', [justIn, justOut])],
      today,
    });
    expect(load.outside.map((w) => w.kind)).toEqual(['cycling']);
  });

  it('skips workouts written by Gym Clean itself (by source)', () => {
    expect(GYM_CLEAN_SOURCES.length).toBeGreaterThan(0);
    const load = weeklyLoad({
      sessions: [],
      healthDays: [day('2030-01-08', [wo(8, 7, 40, 'running', GYM_CLEAN_SOURCES[0])])],
      today,
    });
    expect(load.outside).toEqual([]);
  });

  it('GYM_CLEAN_SOURCES holds source names only (workouts carry no bundle id; the plugin drops ours by bundle id)', () => {
    for (const s of GYM_CLEAN_SOURCES) expect(s).not.toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i);
  });

  it('the same workout stored twice (re-read) counts once', () => {
    const w = wo(8, 7, 40, 'running');
    const load = weeklyLoad({
      sessions: [],
      healthDays: [day('2030-01-08', [w, { ...w }]), day('2030-01-08', [{ ...w }])],
      today,
    });
    expect(load.outside).toHaveLength(1);
  });

  it('places a workout by its start time, not by the row it sits in', () => {
    // Started Sunday 23:30 of last week, filed under Monday: last week.
    const late: HealthWorkout = {
      start: at(6, 23, 30),
      minutes: 60,
      kind: 'running',
      source: 'WHOOP',
    };
    const load = weeklyLoad({ sessions: [], healthDays: [day('2030-01-07', [late])], today });
    expect(load.outside).toEqual([]);
  });

  it('nothing at all → zeros', () => {
    expect(weeklyLoad({ sessions: [], healthDays: [], today })).toEqual({
      gymSessions: 0,
      outside: [],
      outsideMinutes: 0,
    });
  });
});
