import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NutritionSettings, WeeklyCheck, WeighIn } from '../types';
import {
  DOWN_KCAL,
  TOO_FAST_PCT,
  UP_KCAL,
  applyAcceptedCheck,
  checkHasChange,
  decideCheck,
  trend,
  weekStartOf,
  weekStartAt,
  weeklyAverages,
  weeklyCheck,
} from './adjust';
import { NUTRITION_DEFAULTS } from './targets';

// Made-up example person; never real body stats.
const settings: NutritionSettings = {
  ...NUTRITION_DEFAULTS,
  gainPctPerWeek: [0.25, 0.5],
  heightCm: 175,
  birthYear: 1996,
  sex: 'male',
  activity: 'moderate',
};

/** n weigh-ins on consecutive days from `monday`, all at `kg`. */
function week(monday: string, kg: number, n = 7): WeighIn[] {
  const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    return { date: t.toISOString().slice(0, 10), kg };
  });
}

// 2026-06-01 is a Monday. The check shown on Monday 2026-06-15 compares the week of
// 2026-06-08 with the week of 2026-06-01.
const PREV = '2026-06-01';
const LAST = '2026-06-08';
const CHECK_DAY = '2026-06-15';
const base = { settings, kcalTarget: 2856, maintenanceKcal: 2556 };

function check(
  prevKg: number,
  lastKg: number,
  extra: Partial<typeof base> = {},
  nPrev = 7,
  nLast = 7,
) {
  return weeklyCheck({
    ...base,
    ...extra,
    weighIns: [...week(PREV, prevKg, nPrev), ...week(LAST, lastKg, nLast)],
    today: CHECK_DAY,
  });
}

describe('weeks', () => {
  it('weekStartOf gives the Monday (weeks run Monday–Sunday)', () => {
    expect(weekStartOf('2026-06-08')).toBe('2026-06-08'); // Monday
    expect(weekStartOf('2026-06-10')).toBe('2026-06-08'); // Wednesday
    expect(weekStartOf('2026-06-14')).toBe('2026-06-08'); // Sunday
    expect(weekStartOf('2026-06-15')).toBe('2026-06-15'); // next Monday
    expect(weekStartOf('2026-01-01')).toBe('2025-12-29'); // across a year
  });

  it('Sunday 23:59 and Monday 00:00 (local) fall in different weeks', () => {
    const sun = new Date(2026, 5, 14, 23, 59).getTime();
    const mon = new Date(2026, 5, 15, 0, 0).getTime();
    expect(weekStartAt(sun)).toBe('2026-06-08');
    expect(weekStartAt(mon)).toBe('2026-06-15');
  });

  describe('across a DST change', () => {
    let tz: string | undefined;
    beforeEach(() => {
      tz = process.env.TZ;
      process.env.TZ = 'Europe/Berlin'; // clocks go forward Sun 2026-03-29 02:00
    });
    afterEach(() => {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    });

    it('the DST week still runs Monday 23 → Sunday 29 March with 7 days', () => {
      expect(weekStartAt(new Date(2026, 2, 29, 23, 59).getTime())).toBe('2026-03-23');
      expect(weekStartAt(new Date(2026, 2, 30, 0, 0).getTime())).toBe('2026-03-30');
      expect(weekStartAt(new Date(2026, 2, 23, 0, 0).getTime())).toBe('2026-03-23');
      const w = [...week('2026-03-16', 70), ...week('2026-03-23', 70.25)];
      expect(weeklyAverages(w, '2026-03-23')).toEqual({ avgKg: 70.25, count: 7 });
      const c = weeklyCheck({ ...base, weighIns: w, today: '2026-03-30' });
      expect(c.weekStart).toBe('2026-03-30');
      expect(c.kind).toBe('onTrack');
    });
  });
});

describe('weeklyAverages', () => {
  it('averages only that Monday–Sunday week', () => {
    const w: WeighIn[] = [
      { date: '2026-06-07', kg: 99 }, // Sunday before
      { date: '2026-06-08', kg: 70 },
      { date: '2026-06-10', kg: 71 },
      { date: '2026-06-14', kg: 72 }, // Sunday
      { date: '2026-06-15', kg: 99 }, // next Monday
    ];
    expect(weeklyAverages(w, '2026-06-08')).toEqual({ avgKg: 71, count: 3 });
  });
  it('is null with no weigh-ins that week', () => {
    expect(weeklyAverages([], '2026-06-08')).toBeNull();
  });
});

describe('weeklyCheck', () => {
  it('compares last week with the week before, keyed by this week’s Monday', () => {
    const c = check(70, 70.25);
    expect(c.weekStart).toBe(CHECK_DAY);
    expect(c.avgKg).toBeCloseTo(70.25);
    expect(c.prevAvgKg).toBeCloseTo(70);
    expect(c.ratePct).toBeCloseTo(0.357, 2);
    expect(c.outcome).toBe('pending');
    expect(c.decidedAt).toBeUndefined();
  });

  it('any day of the week gives the same check', () => {
    const w = [...week(PREV, 70), ...week(LAST, 70.25)];
    const a = weeklyCheck({ ...base, weighIns: w, today: '2026-06-15' });
    const b = weeklyCheck({ ...base, weighIns: w, today: '2026-06-21' });
    expect(b).toEqual(a);
  });

  it('in range → on track, no change', () => {
    expect(check(70, 70.25)).toMatchObject({ kind: 'onTrack', deltaKcal: 0 });
  });

  it('gain below the range → +150', () => {
    expect(UP_KCAL).toBe(150);
    expect(check(70, 70.1)).toMatchObject({ kind: 'up', deltaKcal: 150 }); // 0.14%
    expect(check(70, 69.5)).toMatchObject({ kind: 'up', deltaKcal: 150 }); // losing
  });

  it('between the range top and 0.75%/week → still on track', () => {
    expect(check(70, 70.45)).toMatchObject({ kind: 'onTrack', deltaKcal: 0 }); // 0.64%
  });

  it('gain above 0.75%/week → −100', () => {
    expect(TOO_FAST_PCT).toBe(0.75);
    expect(DOWN_KCAL).toBe(-100);
    expect(check(70, 70.7)).toMatchObject({ kind: 'down', deltaKcal: -100 }); // 1%
  });

  it('range edges are inclusive (exactly 0.25% and 0.75% are on track)', () => {
    expect(check(80, 80.2).kind).toBe('onTrack'); // 0.25%
    expect(check(80, 80.6).kind).toBe('onTrack'); // 0.75%
  });

  it('uses the gain range from settings', () => {
    const s = { ...settings, gainPctPerWeek: [0.5, 0.75] as [number, number] };
    expect(check(70, 70.25, { settings: s })).toMatchObject({ kind: 'up', deltaKcal: 150 });
  });

  it('3 weigh-ins in either week → needData, no change', () => {
    for (const [nPrev, nLast] of [
      [3, 7],
      [7, 3],
      [0, 7],
      [3, 3],
    ] as const) {
      const c = check(70, 71, {}, nPrev, nLast);
      expect(c).toMatchObject({ kind: 'needData', deltaKcal: 0 });
    }
    const c = check(70, 71, {}, 3, 7);
    expect(c.prevAvgKg).toBeCloseTo(70);
    expect(c.avgKg).toBeCloseTo(71);
    expect(c.ratePct).toBeNull();
  });

  it('exactly 4 weigh-ins in each week is enough', () => {
    expect(check(70, 70.7, {}, 4, 4)).toMatchObject({ kind: 'down', deltaKcal: -100 });
  });

  it('never suggests a target below the maintenance estimate', () => {
    // 40 kcal above maintenance: −100 is cut to −40.
    expect(check(70, 70.7, { kcalTarget: 2596 })).toMatchObject({ kind: 'down', deltaKcal: -40 });
    // Already at maintenance: no lower suggestion.
    expect(check(70, 70.7, { kcalTarget: 2556 })).toMatchObject({ kind: 'down', deltaKcal: 0 });
    // A hand-set target under maintenance: never "down", and "up" lifts at least to maintenance.
    expect(check(70, 70.7, { kcalTarget: 2300 })).toMatchObject({ kind: 'down', deltaKcal: 0 });
    expect(check(70, 70.1, { kcalTarget: 2300 })).toMatchObject({ kind: 'up', deltaKcal: 256 });
  });
});

describe('accept / dismiss', () => {
  const pending: WeeklyCheck = check(70, 70.1);

  it('only records the outcome; nothing is applied by itself', () => {
    const before = structuredClone(settings);
    const accepted = decideCheck(pending, 'accepted', 1_700_000_000_000);
    expect(accepted).toEqual({ ...pending, outcome: 'accepted', decidedAt: 1_700_000_000_000 });
    const dismissed = decideCheck(pending, 'dismissed', 5);
    expect(dismissed).toEqual({ ...pending, outcome: 'dismissed', decidedAt: 5 });
    expect(pending.outcome).toBe('pending'); // input not mutated
    expect(settings).toEqual(before);
  });

  it('a decided check is not decided again', () => {
    const accepted = decideCheck(pending, 'accepted', 10);
    expect(decideCheck(accepted, 'dismissed', 20)).toBe(accepted);
  });

  it('applyAcceptedCheck changes the surplus only for an accepted check', () => {
    expect(applyAcceptedCheck(settings, pending)).toBe(settings);
    expect(applyAcceptedCheck(settings, decideCheck(pending, 'dismissed', 1))).toBe(settings);
    const next = applyAcceptedCheck(settings, decideCheck(pending, 'accepted', 1));
    expect(next).toEqual({ ...settings, surplusKcal: 450 });
    expect(settings.surplusKcal).toBe(300);
  });

  it('applyAcceptedCheck moves a hand-set kcal instead of the surplus', () => {
    const s = { ...settings, overrides: { kcal: 2900, proteinG: 130 } };
    const down = decideCheck(check(70, 70.7), 'accepted', 1);
    expect(applyAcceptedCheck(s, down)).toEqual({ ...s, overrides: { kcal: 2800, proteinG: 130 } });
  });

  it('applyAcceptedCheck applies exactly deltaKcal (the check already respects 0–600)', () => {
    const s550 = { ...settings, surplusKcal: 550 };
    const up = decideCheck(
      check(70, 70.1, { settings: s550, kcalTarget: 2556 + 550 }),
      'accepted',
      1,
    );
    expect(up.deltaKcal).toBe(50);
    expect(applyAcceptedCheck(s550, up).surplusKcal).toBe(600);
    const s50 = { ...settings, surplusKcal: 50 };
    const down = decideCheck(
      check(70, 70.7, { settings: s50, kcalTarget: 2556 + 50 }),
      'accepted',
      1,
    );
    expect(down.deltaKcal).toBe(-50);
    expect(applyAcceptedCheck(s50, down).surplusKcal).toBe(0);
    // A check is applied as is, even to settings it wasn't computed from.
    const s100 = { ...settings, surplusKcal: 100 };
    expect(applyAcceptedCheck(s100, decideCheck(check(70, 70.1), 'accepted', 1)).surplusKcal).toBe(
      250,
    );
  });

  it('an accepted no-change check leaves settings untouched', () => {
    const s600 = { ...settings, surplusKcal: 600 };
    const up = decideCheck(
      check(70, 70.1, { settings: s600, kcalTarget: 2556 + 600 }),
      'accepted',
      1,
    );
    expect(applyAcceptedCheck(s600, up)).toBe(s600);
  });
});

describe('no change possible (clamped to 0)', () => {
  it('down at the maintenance floor → down with deltaKcal 0', () => {
    const s0 = { ...settings, surplusKcal: 0 };
    const c = check(70, 70.7, { settings: s0, kcalTarget: 2556 });
    expect(c).toMatchObject({ kind: 'down', deltaKcal: 0 });
    expect(checkHasChange(c)).toBe(false);
  });

  it('up at the 600 kcal surplus cap → up with deltaKcal 0', () => {
    const s600 = { ...settings, surplusKcal: 600 };
    const c = check(70, 70.1, { settings: s600, kcalTarget: 2556 + 600 });
    expect(c).toMatchObject({ kind: 'up', deltaKcal: 0 });
    expect(checkHasChange(c)).toBe(false);
  });

  it('up near the cap is cut to what fits: surplus 550 → +50, accepted → 600', () => {
    const s550 = { ...settings, surplusKcal: 550 };
    const c = check(70, 70.1, { settings: s550, kcalTarget: 2556 + 550 });
    expect(c).toMatchObject({ kind: 'up', deltaKcal: 50 });
    expect(checkHasChange(c)).toBe(true);
    expect(applyAcceptedCheck(s550, decideCheck(c, 'accepted', 1)).surplusKcal).toBe(600);
  });

  it('without a hand-set kcal, a down never takes the surplus below 0', () => {
    const s50 = { ...settings, surplusKcal: 50 };
    expect(check(70, 70.7, { settings: s50 })).toMatchObject({ kind: 'down', deltaKcal: -50 });
  });

  it('a hand-set kcal target is not capped by the surplus range', () => {
    const s = { ...settings, surplusKcal: 600, overrides: { kcal: 3300 } };
    const c = check(70, 70.1, { settings: s, kcalTarget: 3300 });
    expect(c).toMatchObject({ kind: 'up', deltaKcal: 150 });
    expect(applyAcceptedCheck(s, decideCheck(c, 'accepted', 1)).overrides?.kcal).toBe(3450);
  });

  it('checkHasChange: only up/down with a non-zero delta', () => {
    const c = check(70, 70.1);
    expect(checkHasChange(c)).toBe(true);
    expect(checkHasChange(check(70, 70.7))).toBe(true);
    expect(checkHasChange(check(70, 70.25))).toBe(false); // onTrack
    expect(checkHasChange(check(70, 71, {}, 3, 7))).toBe(false); // needData
    expect(checkHasChange({ ...c, kind: 'onTrack', deltaKcal: 150 })).toBe(false);
  });
});

describe('trend', () => {
  it('daily points with the trailing 7-day average, ending today', () => {
    const w: WeighIn[] = [
      { date: '2026-06-01', kg: 70 },
      { date: '2026-06-03', kg: 72 },
      { date: '2026-06-08', kg: 74 },
      { date: '2026-06-20', kg: 99 }, // after today: ignored
    ];
    const t = trend(w, 9, '2026-06-09');
    expect(t.map((p) => p.date)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
      '2026-06-08',
      '2026-06-09',
    ]);
    expect(t.map((p) => p.kg)).toEqual([70, null, 72, null, null, null, null, 74, null]);
    expect(t.map((p) => p.avgKg)).toEqual([70, 70, 71, 71, 71, 71, 71, 73, 73]);
  });

  it('the average uses weigh-ins from before the window too', () => {
    const t = trend([{ date: '2026-06-05', kg: 70 }], 2, '2026-06-10');
    expect(t).toEqual([
      { date: '2026-06-09', kg: null, avgKg: 70 },
      { date: '2026-06-10', kg: null, avgKg: 70 },
    ]);
  });

  it('a repeated date keeps the later weigh-in; no data → null average', () => {
    const t = trend(
      [
        { date: '2026-06-10', kg: 80 },
        { date: '2026-06-10', kg: 70 },
      ],
      2,
      '2026-06-10',
    );
    expect(t).toEqual([
      { date: '2026-06-09', kg: null, avgKg: null },
      { date: '2026-06-10', kg: 70, avgKg: 70 },
    ]);
    expect(trend([], 0, '2026-06-10')).toEqual([]);
  });
});
