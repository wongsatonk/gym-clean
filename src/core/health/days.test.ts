import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { healthDays, preferredHrvSource, type HealthRead, type HealthSleepRead } from './days';
import { emptyHealthResult, type HealthReadResult } from '../../native/health';

/** All numbers are made up (the repo is public). */

let tz: string | undefined;
const useTz = (zone: string) => {
  beforeEach(() => {
    tz = process.env.TZ;
    process.env.TZ = zone;
  });
  afterEach(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
};

const t = (iso: string) => Date.parse(iso);
const day = (read: HealthRead, date: string) => healthDays(read).find((d) => d.date === date);
const night = (
  start: string,
  end: string,
  asleepMin: number,
  source = 'WHOOP',
): HealthSleepRead => ({
  start: t(start),
  end: t(end),
  asleepMin,
  source,
});

describe('healthDays: sleep', () => {
  useTz('Asia/Bangkok');

  it('assigns a night that crosses midnight to the wake-up date', () => {
    const read: HealthRead = {
      sleep: [night('2026-06-09T22:40:00+07:00', '2026-06-10T06:35:00+07:00', 440)],
    };
    const days = healthDays(read);
    expect(days.map((d) => d.date)).toEqual(['2026-06-10']);
    expect(days[0]?.sleepMin).toBe(440);
  });

  it('a night that starts after midnight still belongs to that morning', () => {
    const read: HealthRead = {
      sleep: [night('2026-06-10T01:30:00+07:00', '2026-06-10T08:00:00+07:00', 375)],
    };
    expect(day(read, '2026-06-10')?.sleepMin).toBe(375);
  });

  it('a night split in two sessions (woke up for a while) joins into one, by its end', () => {
    const read: HealthRead = {
      sleep: [
        night('2026-06-09T22:40:00+07:00', '2026-06-09T23:50:00+07:00', 65),
        night('2026-06-10T00:40:00+07:00', '2026-06-10T06:35:00+07:00', 340),
      ],
    };
    expect(healthDays(read)).toEqual([{ date: '2026-06-10', sleepMin: 405 }]);
  });

  it('never adds two sources together: the longer night wins', () => {
    const read: HealthRead = {
      sleep: [
        night('2026-06-09T23:00:00+07:00', '2026-06-10T06:00:00+07:00', 400, 'WHOOP'),
        night('2026-06-09T23:10:00+07:00', '2026-06-10T05:40:00+07:00', 370, 'Watch'),
      ],
    };
    expect(day(read, '2026-06-10')?.sleepMin).toBe(400);
  });

  it('a short afternoon nap does not replace or add to the night', () => {
    const read: HealthRead = {
      sleep: [
        night('2026-06-09T23:30:00+07:00', '2026-06-10T06:30:00+07:00', 410),
        night('2026-06-10T14:00:00+07:00', '2026-06-10T14:30:00+07:00', 25),
      ],
    };
    expect(day(read, '2026-06-10')?.sleepMin).toBe(410);
  });

  it('a repeated session (two reads overlapping) counts once', () => {
    const n = night('2026-06-09T23:00:00+07:00', '2026-06-10T06:00:00+07:00', 400);
    expect(day({ sleep: [n, { ...n }] }, '2026-06-10')?.sleepMin).toBe(400);
  });
});

describe('healthDays: sleep across DST (Europe/Berlin)', () => {
  useTz('Europe/Berlin');

  it('spring forward: the wake-up date, minutes as summed by the plugin', () => {
    // Clocks go 02:00 → 03:00 on Sun 2026-03-29: 23:00 → 07:00 local is 7 h.
    const read: HealthRead = {
      sleep: [night('2026-03-28T23:00:00+01:00', '2026-03-29T07:00:00+02:00', 400)],
    };
    expect(healthDays(read)).toEqual([{ date: '2026-03-29', sleepMin: 400 }]);
  });

  it('fall back: the wake-up date, nothing on the day before', () => {
    // Clocks go 03:00 → 02:00 on Sun 2026-10-25: 23:00 → 07:00 local is 9 h.
    const read: HealthRead = {
      sleep: [night('2026-10-24T23:00:00+02:00', '2026-10-25T07:00:00+01:00', 510)],
    };
    expect(day(read, '2026-10-25')?.sleepMin).toBe(510);
    expect(day(read, '2026-10-24')).toBeUndefined();
  });

  it('sessions either side of the skipped hour join into one night', () => {
    // 01:55 (+01) → 03:10 (+02) is only 15 real minutes apart.
    const read: HealthRead = {
      sleep: [
        night('2026-03-28T23:30:00+01:00', '2026-03-29T01:55:00+01:00', 140),
        night('2026-03-29T03:10:00+02:00', '2026-03-29T06:30:00+02:00', 195),
      ],
    };
    expect(healthDays(read)).toEqual([{ date: '2026-03-29', sleepMin: 335 }]);
  });

  it('a late night ending just after midnight on the fall-back day goes to that day', () => {
    const read: HealthRead = {
      sleep: [night('2026-10-24T21:00:00+02:00', '2026-10-25T00:30:00+02:00', 200)],
    };
    expect(healthDays(read)).toEqual([{ date: '2026-10-25', sleepMin: 200 }]);
  });
});

describe('healthDays: heart, energy, workouts', () => {
  useTz('Asia/Bangkok');

  it('resting HR: the first value of the local day, rounded', () => {
    const read: HealthRead = {
      restingHr: [
        { start: t('2026-06-10T15:00:00+07:00'), bpm: 64, source: 'WHOOP' },
        { start: t('2026-06-10T06:40:00+07:00'), bpm: 57.6, source: 'WHOOP' },
        { start: t('2026-06-09T23:50:00+07:00'), bpm: 70, source: 'WHOOP' },
      ],
    };
    expect(day(read, '2026-06-10')?.restingHr).toBe(58);
    expect(day(read, '2026-06-09')?.restingHr).toBe(70);
  });

  it('HRV: one source per day (the source with the most days), its first value', () => {
    const p = (iso: string, ms: number, source: string) => ({ start: t(iso), ms, source });
    const read: HealthRead = {
      hrv: [
        p('2026-06-08T06:00:00+07:00', 61, 'WHOOP'),
        p('2026-06-09T06:00:00+07:00', 59, 'WHOOP'),
        p('2026-06-10T05:00:00+07:00', 42.24, 'Watch'),
        p('2026-06-10T06:10:00+07:00', 63.46, 'WHOOP'),
        p('2026-06-10T09:00:00+07:00', 50, 'WHOOP'),
        p('2026-06-11T09:00:00+07:00', 40, 'Watch'),
      ],
    };
    const days = healthDays(read);
    expect(days.find((d) => d.date === '2026-06-10')).toMatchObject({
      hrvMs: 63.5,
      hrvSource: 'WHOOP',
    });
    // Only Watch on the 11th: kept, labelled with its own source.
    expect(days.find((d) => d.date === '2026-06-11')).toMatchObject({
      hrvMs: 40,
      hrvSource: 'Watch',
    });
  });

  it('HRV: the source already stored for recent days wins over a bigger count in this read', () => {
    const p = (iso: string, ms: number, source: string) => ({ start: t(iso), ms, source });
    const read: HealthRead = {
      hrv: [
        p('2026-06-09T06:00:00+07:00', 41, 'Watch'),
        p('2026-06-10T06:00:00+07:00', 42, 'Watch'),
        p('2026-06-10T06:30:00+07:00', 60, 'WHOOP'),
      ],
    };
    const days = healthDays(read, undefined, { hrvSource: 'WHOOP' });
    expect(days.find((d) => d.date === '2026-06-10')).toMatchObject({
      hrvMs: 60,
      hrvSource: 'WHOOP',
    });
    // Where only the other source wrote, it's kept with its own label.
    expect(days.find((d) => d.date === '2026-06-09')).toMatchObject({ hrvSource: 'Watch' });
  });

  it('HRV: a tie with nothing stored is decided by the latest data, not by the name', () => {
    const p = (iso: string, ms: number, source: string) => ({ start: t(iso), ms, source });
    const read = (a: string, b: string): HealthRead => ({
      hrv: [
        p('2026-06-10T06:00:00+07:00', 40, a),
        p('2026-06-10T07:00:00+07:00', 60, b),
        p('2026-06-11T06:00:00+07:00', 41, a),
        p('2026-06-11T07:00:00+07:00', 61, b),
      ],
    });
    // b's last sample is later → b, whatever the names sort to.
    expect(day(read('Watch', 'WHOOP'), '2026-06-10')?.hrvSource).toBe('WHOOP');
    expect(day(read('WHOOP', 'Watch'), '2026-06-10')?.hrvSource).toBe('Watch');
  });

  it('preferredHrvSource: the source on the most stored days, ties to the latest date', () => {
    expect(preferredHrvSource([])).toBeUndefined();
    expect(
      preferredHrvSource([
        { date: '2026-06-08', hrvMs: 60, hrvSource: 'WHOOP' },
        { date: '2026-06-09', hrvMs: 60, hrvSource: 'WHOOP' },
        { date: '2026-06-10', hrvMs: 40, hrvSource: 'Watch' },
      ]),
    ).toBe('WHOOP');
    expect(
      preferredHrvSource([
        { date: '2026-06-09', hrvMs: 60, hrvSource: 'WHOOP' },
        { date: '2026-06-10', hrvMs: 40, hrvSource: 'Watch' },
      ]),
    ).toBe('Watch');
    expect(
      preferredHrvSource([
        { date: '2026-06-10', hrvMs: 40, hrvSource: 'Watch' },
        { date: '2026-06-09', hrvMs: 60, hrvSource: 'WHOOP' },
      ]),
    ).toBe('Watch');
  });

  it('active energy: the daily total as sent, a repeated date keeps the larger, never summed', () => {
    const read: HealthRead = {
      activeEnergy: [
        { date: '2026-06-10', start: t('2026-06-10T00:00:00+07:00'), kcal: 550.4 },
        { date: '2026-06-10', start: t('2026-06-10T00:00:00+07:00'), kcal: 320 },
        { date: '2026-06-11', start: t('2026-06-11T00:00:00+07:00'), kcal: 40 },
      ],
    };
    expect(day(read, '2026-06-10')?.activeKcal).toBe(550);
    expect(day(read, '2026-06-11')?.activeKcal).toBe(40);
  });

  it('workouts land on the local date they start, exact repeats dropped', () => {
    const w = {
      start: t('2026-06-10T18:30:00+07:00'),
      minutes: 40.4,
      kind: 'running',
      kcal: 410.6,
      avgHr: 151.2,
      source: 'WHOOP',
    };
    const late = {
      start: t('2026-06-10T23:30:00+07:00'),
      minutes: 90,
      kind: 'soccer',
      source: 'WHOOP',
    };
    const d = day({ workouts: [w, { ...w }, late] }, '2026-06-10');
    expect(d?.workouts).toEqual([
      { start: w.start, minutes: 40, kind: 'running', kcal: 411, avgHr: 151, source: 'WHOOP' },
      late,
    ]);
  });

  it('empty or bad input gives no days and never throws', () => {
    expect(healthDays({})).toEqual([]);
    const bad: HealthRead = {
      restingHr: [{ start: Number.NaN, bpm: 60, source: 'x' }],
      hrv: [{ start: t('2026-06-10T06:00:00+07:00'), ms: Number.NaN, source: 'x' }],
      sleep: [night('2026-06-10T07:00:00+07:00', '2026-06-10T06:00:00+07:00', 60)],
      activeEnergy: [{ date: 'nope', start: Number.NaN, kcal: 100 }],
      workouts: [{ start: t('2026-06-10T07:00:00+07:00'), minutes: 0, kind: 'x', source: 'x' }],
    };
    expect(healthDays(bad)).toEqual([]);
  });

  it('merges every type into one row per date, sorted', () => {
    const read: HealthRead = {
      restingHr: [{ start: t('2026-06-11T06:00:00+07:00'), bpm: 56, source: 'WHOOP' }],
      sleep: [night('2026-06-09T23:00:00+07:00', '2026-06-10T06:00:00+07:00', 400)],
      hrv: [{ start: t('2026-06-10T06:00:00+07:00'), ms: 60, source: 'WHOOP' }],
    };
    expect(healthDays(read)).toEqual([
      { date: '2026-06-10', sleepMin: 400, hrvMs: 60, hrvSource: 'WHOOP' },
      { date: '2026-06-11', restingHr: 56 },
    ]);
  });
});

describe('healthDays: plugin shape', () => {
  it('takes the GymHealth read result as is', () => {
    const result: HealthReadResult = {
      ...emptyHealthResult('ok'),
      restingHr: [{ start: 0, bpm: 55, source: 'WHOOP' }],
    };
    const read: HealthRead = result; // compile-time: native result fits the core input
    expect(healthDays(read)).toHaveLength(1);
  });
});
