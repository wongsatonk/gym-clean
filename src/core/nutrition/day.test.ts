import { describe, expect, it } from 'vitest';
import {
  NUDGE_FROM_HOUR,
  POST_WORKOUT_MS,
  dayTotals,
  foodDate,
  leftMacros,
  nudgeFor,
  nutritionHistory,
  postWorkoutHint,
  recentItems,
  remaining,
  slotFor,
} from './day';
import { checkCopy } from '../trainer/replies';
import type { FoodEntry, NutritionTargets } from '../types';

// Made-up targets and entries only (the repo is public).
const TARGETS: NutritionTargets = {
  kcal: { value: 2600, estimate: true },
  proteinG: { value: 140, estimate: true },
  carbsG: { value: 320, estimate: true },
  fatG: { value: 75, estimate: false },
};
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

let n = 0;
function e(over: Partial<FoodEntry> & { time: number }): FoodEntry {
  return {
    id: `e${n++}`,
    date: foodDate(over.time),
    slot: 'lunch',
    label: 'Made-up food',
    amount: { servings: 1 },
    estimate: false,
    kcal: 500,
    proteinG: 30,
    ...over,
  };
}

describe('foodDate (M7-q8: the day ends at midnight)', () => {
  it('23:59 is today, 00:01 is the next day', () => {
    expect(foodDate(at(11, 23, 59))).toBe('2026-11-11');
    expect(foodDate(at(12, 0, 1))).toBe('2026-11-12');
  });
});

describe('dayTotals', () => {
  it('sums one local day; carbs/fat only from entries that have them', () => {
    const list = [
      e({ time: at(11, 8), kcal: 400, proteinG: 25.25, carbsG: 50, fatG: 10 }),
      e({ time: at(11, 13), kcal: 650, proteinG: 22.1 }),
      e({ time: at(11, 23, 59), kcal: 100.4, proteinG: 5, carbsG: 12 }),
      e({ time: at(12, 0, 1), kcal: 999, proteinG: 99 }),
    ];
    expect(dayTotals(list, '2026-11-11')).toEqual({
      kcal: 1150,
      proteinG: 52.4,
      carbsG: 62,
      fatG: 10,
      count: 3,
    });
    expect(dayTotals(list, '2026-11-12')).toEqual({ kcal: 999, proteinG: 99, count: 1 });
  });

  it('no date → all entries; none → zeros', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, proteinG: 0, count: 0 });
    expect(dayTotals([e({ time: at(1, 9) }), e({ time: at(2, 9) })]).count).toBe(2);
  });
});

describe('remaining', () => {
  it('left is never negative; over says by how much', () => {
    const r = remaining({ kcal: 2700, proteinG: 95.5, carbsG: 100 }, TARGETS);
    expect(r.kcal).toEqual({ target: 2600, eaten: 2700, left: 0, over: 100, estimate: true });
    expect(r.proteinG).toEqual({ target: 140, eaten: 95.5, left: 44.5, over: 0, estimate: true });
    expect(r.carbsG).toMatchObject({ left: 220, over: 0 });
    expect(r.fatG).toMatchObject({ eaten: 0, left: 75, over: 0, estimate: false });
  });

  it('leftMacros gives what is left as a MacroSet', () => {
    const r = remaining({ kcal: 1000, proteinG: 100 }, TARGETS);
    expect(leftMacros(r)).toEqual({ kcal: 1600, proteinG: 40, carbsG: 320, fatG: 75 });
  });
});

describe('slotFor (M7-q1)', () => {
  it('slot boundaries by local time', () => {
    expect(slotFor(at(11, 6))).toBe('breakfast');
    expect(slotFor(at(11, 10, 29))).toBe('breakfast');
    expect(slotFor(at(11, 10, 30))).toBe('lunch');
    expect(slotFor(at(11, 14, 29))).toBe('lunch');
    expect(slotFor(at(11, 14, 30))).toBe('snack');
    expect(slotFor(at(11, 17, 29))).toBe('snack');
    expect(slotFor(at(11, 17, 30))).toBe('dinner');
    expect(slotFor(at(11, 21, 29))).toBe('dinner');
    expect(slotFor(at(11, 21, 30))).toBe('snack');
    expect(slotFor(at(11, 23, 59))).toBe('snack');
    expect(slotFor(at(12, 0, 1))).toBe('breakfast');
  });

  it('post-workout within 2 h after the last session ended', () => {
    const end = at(11, 18);
    expect(POST_WORKOUT_MS).toBe(2 * 3_600_000);
    expect(slotFor(end + 60_000, end)).toBe('post-workout');
    expect(slotFor(end + POST_WORKOUT_MS, end)).toBe('post-workout');
    expect(slotFor(end + POST_WORKOUT_MS + 60_000, end)).toBe('dinner');
    expect(slotFor(end - 60_000, end)).toBe('dinner');
    expect(slotFor(at(11, 12), undefined)).toBe('lunch');
  });
});

describe('recentItems', () => {
  it('newest first, deduplicated by ref + amount, at most n', () => {
    const shake1 = e({ time: at(10, 8), ref: { foodId: 'shake' }, label: 'Shake' });
    const shake2 = e({ time: at(11, 8), ref: { foodId: 'shake' }, label: 'Shake' });
    const shakeX2 = e({ time: at(11, 9), ref: { foodId: 'shake' }, amount: { servings: 2 } });
    const curry = e({ time: at(11, 12), ref: { recipeId: 'curry' } });
    const quick1 = e({ time: at(9, 12), label: 'Takeout rice', kcal: 700, proteinG: 25 });
    const quick2 = e({ time: at(11, 13), label: 'Takeout rice', kcal: 700, proteinG: 25 });
    const list = [shake1, shake2, shakeX2, curry, quick1, quick2];
    expect(recentItems(list, 10).map((x) => x.id)).toEqual([
      quick2.id,
      curry.id,
      shakeX2.id,
      shake2.id,
    ]);
    expect(recentItems(list, 2).map((x) => x.id)).toEqual([quick2.id, curry.id]);
    expect(recentItems([], 5)).toEqual([]);
  });
});

describe('nudgeFor (M7-q6)', () => {
  const low = { kcal: 1500, proteinG: 100 }; // 100 < 0.75 × 140 = 105
  it('fires after 19:00 when protein is under 75% of the target', () => {
    expect(NUDGE_FROM_HOUR).toBe(19);
    const r = nudgeFor(at(11, 19, 0), low, TARGETS, false);
    expect(r).toEqual({
      kind: 'eveningProtein',
      date: '2026-11-11',
      leftG: 40,
      text: '40 g protein to go today',
    });
  });

  it('not before 19:00, not at ≥ 75%, not without targets', () => {
    expect(nudgeFor(at(11, 18, 59), low, TARGETS, false)).toBeNull();
    expect(nudgeFor(at(11, 20), { kcal: 0, proteinG: 105 }, TARGETS, false)).toBeNull();
    expect(nudgeFor(at(11, 20), low, null, false)).toBeNull();
  });

  it('at most once a day: shownToday blocks it', () => {
    expect(nudgeFor(at(11, 21), low, TARGETS, true)).toBeNull();
  });
});

describe('postWorkoutHint', () => {
  it('"45 g protein to go today" or "Protein target hit today"', () => {
    expect(postWorkoutHint({ kcal: 0, proteinG: 95 }, TARGETS)).toBe('45 g protein to go today');
    expect(postWorkoutHint({ kcal: 0, proteinG: 139.6 }, TARGETS)).toBe('Protein target hit today');
    expect(postWorkoutHint({ kcal: 0, proteinG: 150 }, TARGETS)).toBe('Protein target hit today');
    expect(postWorkoutHint({ kcal: 0, proteinG: 150 }, null)).toBeNull();
  });

  it('every hint and nudge line passes checkCopy', () => {
    const lines = [
      postWorkoutHint({ kcal: 0, proteinG: 0 }, TARGETS),
      postWorkoutHint({ kcal: 0, proteinG: 200 }, TARGETS),
      nudgeFor(at(11, 20), { kcal: 0, proteinG: 0 }, TARGETS, false)?.text,
    ];
    for (const l of lines) {
      expect(l).toBeTruthy();
      expect(checkCopy(l ?? '').ok).toBe(true);
    }
  });
});

describe('nutritionHistory', () => {
  it('last N days oldest first, training days only from finished sessions', () => {
    const entries = [
      e({ time: at(9, 12), kcal: 800, proteinG: 40 }),
      e({ time: at(11, 8), kcal: 300, proteinG: 20 }),
      e({ time: at(11, 19), kcal: 700, proteinG: 45 }),
      e({ time: at(5, 12) }), // outside the window
    ];
    const sessions = [
      { startedAt: at(9, 18), endedAt: at(9, 19) },
      { startedAt: at(10, 18) }, // never finished
      { startedAt: at(11, 23, 30), endedAt: at(12, 0, 30) }, // counts for the day it started
    ];
    const h = nutritionHistory(entries, sessions, '2026-11-11', 3);
    expect(h.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11']);
    expect(h.map((d) => d.training)).toEqual([true, false, true]);
    expect(h.map((d) => d.totals.kcal)).toEqual([800, 0, 1000]);
    expect(h[2]?.totals).toEqual({ kcal: 1000, proteinG: 65, count: 2 });
  });

  it('crosses a month boundary', () => {
    const h = nutritionHistory([], [], '2026-12-01', 2);
    expect(h.map((d) => d.date)).toEqual(['2026-11-30', '2026-12-01']);
  });
});
