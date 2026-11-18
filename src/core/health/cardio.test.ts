import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { weekStartOf } from '../stats';
import type { HealthDay, HealthWorkout } from '../types';
import { CARDIO_KINDS, cardioLine, isCardioKind, weeklyCardioMinutes } from './cardio';
import { checkHealthCopy } from './copy';
import type { LoadSession } from './weeklyLoad';

/** Made-up workouts only (the repo is public). */
let tz: string | undefined;
const useTz = (zone: string) => {
  process.env.TZ = zone;
};
beforeEach(() => {
  tz = process.env.TZ;
  useTz('Asia/Bangkok');
});
afterEach(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

/** A local wall-clock time in the current test time zone. */
const at = (y: number, m: number, d: number, h = 0, min = 0): number =>
  new Date(y, m - 1, d, h, min).getTime();
const ymd = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const w = (start: number, minutes: number, kind = 'running', source = 'WHOOP'): HealthWorkout => ({
  start,
  minutes,
  kind,
  source,
});
/** Health rows from workouts, one per local date. */
function days(...workouts: HealthWorkout[]): HealthDay[] {
  const by = new Map<string, HealthWorkout[]>();
  for (const x of workouts) by.set(ymd(x.start), [...(by.get(ymd(x.start)) ?? []), x]);
  return [...by].map(([date, ws]) => ({ date, workouts: ws }));
}
const gym = (startedAt: number, minutes: number, id = 's1'): LoadSession => ({
  sessionId: id,
  dayId: 'push-a',
  startedAt,
  endedAt: startedAt + minutes * 60_000,
});

// Monday 2026-06-01 … Sunday 2026-06-07 (Bangkok, no DST).
const MON = () => at(2026, 6, 1);

describe('weeklyCardioMinutes', () => {
  it('adds the cardio workouts of the Mon–Sun week', () => {
    const d = days(
      w(at(2026, 6, 1, 7), 30),
      w(at(2026, 6, 3, 18), 45, 'cycling'),
      w(at(2026, 6, 6, 9), 20, 'swimming'),
    );
    expect(weeklyCardioMinutes(d, [], MON())).toBe(95);
  });

  it('takes any moment of the week as the week', () => {
    const d = days(w(at(2026, 6, 1, 7), 30), w(at(2026, 6, 7, 20), 15));
    expect(weeklyCardioMinutes(d, [], at(2026, 6, 4, 13, 30))).toBe(45);
    expect(weeklyCardioMinutes(d, [], at(2026, 6, 7, 23, 59))).toBe(45);
    expect(weekStartOf(at(2026, 6, 4, 13, 30))).toBe(MON());
  });

  it('week edges: Monday 00:00 is in, Sunday 23:59 is in, the next Monday 00:00 is out', () => {
    const d = days(
      w(at(2026, 5, 31, 23, 50), 40), // Sunday before: last week, even though it runs past midnight
      w(at(2026, 6, 1, 0, 0), 10),
      w(at(2026, 6, 7, 23, 59), 20), // starts this week, counted whole
      w(at(2026, 6, 8, 0, 0), 60),
    );
    expect(weeklyCardioMinutes(d, [], MON())).toBe(30);
    expect(weeklyCardioMinutes(d, [], at(2026, 5, 25))).toBe(40);
    expect(weeklyCardioMinutes(d, [], at(2026, 6, 8))).toBe(60);
  });

  it('goes by the workout start, not by the row it is stored on', () => {
    const d: HealthDay[] = [{ date: '2026-06-08', workouts: [w(at(2026, 6, 7, 22), 25)] }];
    expect(weeklyCardioMinutes(d, [], MON())).toBe(25);
  });

  it('no double count: a Health workout over a finished gym session is that session', () => {
    const lift = gym(at(2026, 6, 2, 18), 60);
    const d = days(
      w(at(2026, 6, 2, 18, 5), 50, 'highIntensityIntervalTraining'), // the same hour, tagged as cardio
      w(at(2026, 6, 2, 19, 5), 10, 'walking'), // within the slack after it
      w(at(2026, 6, 2, 7), 30),
    );
    expect(weeklyCardioMinutes(d, [], MON())).toBe(90);
    expect(weeklyCardioMinutes(d, [lift], MON())).toBe(30);
    // An unfinished session hides nothing.
    const open: LoadSession = { sessionId: 's2', dayId: 'push-a', startedAt: lift.startedAt };
    expect(weeklyCardioMinutes(d, [open], MON())).toBe(90);
  });

  it('no double count: the same workout stored twice, and workouts Gym Clean wrote', () => {
    const run = w(at(2026, 6, 4, 7), 30);
    const d: HealthDay[] = [
      { date: '2026-06-04', workouts: [run, { ...run }] },
      { date: '2026-06-05', workouts: [run, w(at(2026, 6, 5, 7), 40, 'running', 'Gym Clean')] },
    ];
    expect(weeklyCardioMinutes(d, [], MON())).toBe(30);
  });

  it('only cardio kinds count (data): strength, stretching and unknown kinds do not', () => {
    const d = days(
      w(at(2026, 6, 1, 7), 30, 'running'),
      w(at(2026, 6, 2, 7), 60, 'traditionalStrengthTraining'),
      w(at(2026, 6, 3, 7), 45, 'functionalStrengthTraining'),
      w(at(2026, 6, 4, 7), 40, 'yoga'),
      w(at(2026, 6, 5, 7), 20, 'flexibility'),
      w(at(2026, 6, 6, 7), 25, 'other'),
      w(at(2026, 6, 6, 9), 15, 'coreTraining'),
      w(at(2026, 6, 7, 7), 35, 'soccer'),
    );
    expect(weeklyCardioMinutes(d, [], MON())).toBe(65);
    for (const k of ['running', 'walking', 'cycling', 'swimming', 'rowing', 'elliptical', 'hiking'])
      expect(isCardioKind(k), k).toBe(true);
    for (const k of ['traditionalStrengthTraining', 'yoga', 'other', '', 'toString'])
      expect(isCardioKind(k), k).toBe(false);
    expect(isCardioKind('HKWorkoutActivityTypeRunning')).toBe(true);
    expect(new Set(CARDIO_KINDS).size).toBe(CARDIO_KINDS.length);
  });

  it('whole minutes; broken rows are skipped', () => {
    const d = days(
      w(at(2026, 6, 1, 7), 30.4),
      w(at(2026, 6, 2, 7), 20.4),
      w(at(2026, 6, 3, 7), Number.NaN),
      w(at(2026, 6, 4, 7), -15),
      w(Number.NaN, 30),
    );
    expect(weeklyCardioMinutes(d, [], MON())).toBe(51);
  });

  it('no Health → null (the line is hidden), Health with no cardio this week → 0', () => {
    expect(weeklyCardioMinutes(null, [], MON())).toBeNull();
    expect(weeklyCardioMinutes(undefined, [], MON())).toBeNull();
    expect(weeklyCardioMinutes([], [], MON())).toBeNull();
    // Health on, but workouts were never read (only sleep): still no line.
    expect(weeklyCardioMinutes([{ date: '2026-06-02', sleepMin: 420 }], [], MON())).toBeNull();
    // Workouts are read; none this week.
    expect(weeklyCardioMinutes([{ date: '2026-06-02', workouts: [] }], [], MON())).toBe(0);
    expect(weeklyCardioMinutes(days(w(at(2026, 5, 20, 7), 30)), [], MON())).toBe(0);
  });

  describe('DST (America/New_York)', () => {
    beforeEach(() => useTz('America/New_York'));

    it('spring forward: the 167-hour week Mon 2 – Sun 8 March 2026 keeps its edges', () => {
      const mon = at(2026, 3, 2);
      expect(at(2026, 3, 9) - mon).toBe(167 * 3_600_000);
      const d = days(
        w(at(2026, 3, 2, 0, 0), 10),
        w(at(2026, 3, 8, 23, 30), 20), // after the clock change, still Sunday
        w(at(2026, 3, 9, 0, 10), 60), // next Monday: an exact 7 × 24 h window would take it
      );
      expect(weeklyCardioMinutes(d, [], mon)).toBe(30);
      expect(weeklyCardioMinutes(d, [], at(2026, 3, 8, 12))).toBe(30);
      expect(weeklyCardioMinutes(d, [], at(2026, 3, 9))).toBe(60);
    });

    it('fall back: the 169-hour week Mon 26 Oct – Sun 1 Nov 2026 keeps its edges', () => {
      const mon = at(2026, 10, 26);
      expect(at(2026, 11, 2) - mon).toBe(169 * 3_600_000);
      const d = days(
        w(at(2026, 11, 1, 23, 30), 20), // Sunday's 25th hour: an exact 7 × 24 h window would drop it
        w(at(2026, 11, 2, 0, 0), 60),
        w(at(2026, 10, 25, 23, 59), 45),
      );
      expect(weeklyCardioMinutes(d, [], mon)).toBe(20);
      expect(weeklyCardioMinutes(d, [], at(2026, 11, 1, 1, 30))).toBe(20);
    });
  });
});

describe('cardioLine', () => {
  it('is the display line, hidden without Health', () => {
    expect(cardioLine(95)).toBe('Cardio this week: 95 min');
    expect(cardioLine(0)).toBe('Cardio this week: 0 min');
    expect(cardioLine(null)).toBeNull();
  });

  it('states minutes only and passes the copy checks', () => {
    for (const m of [0, 1, 59, 60, 95, 240, 1200]) {
      const t = cardioLine(m) ?? '';
      expect(checkHealthCopy(t).hits, t).toEqual([]);
      expect(t).toMatch(/^Cardio this week: \d+ min$/);
    }
  });
});
