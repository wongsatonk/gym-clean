import { describe, expect, it } from 'vitest';
import type { GoalKind, NutritionSettings, WeighIn } from '../types';
import { withGoal } from './goalTargets';
import {
  ACTIVITY_FACTORS,
  NUTRITION_DEFAULTS,
  ageOn,
  bmrMifflin,
  clampProtein,
  clampSurplus,
  computeTargets,
  currentWeight,
  goalTargetChange,
  visibleMacros,
  withMode,
} from './targets';

// Made-up example person; never real body stats.
const base: NutritionSettings = {
  ...NUTRITION_DEFAULTS,
  heightCm: 175,
  birthYear: 1996,
  sex: 'male',
  activity: 'moderate',
};

const TODAY = '2026-06-10';
const oneWeighIn: WeighIn[] = [{ date: TODAY, kg: 70 }];

function ok(result: ReturnType<typeof computeTargets>) {
  if (!result.ok) throw new Error(`expected targets, got ${result.reason}`);
  return result;
}

describe('defaults', () => {
  it('match the SPEC', () => {
    expect(NUTRITION_DEFAULTS).toEqual({
      mode: 'quick',
      surplusKcal: 300,
      proteinGPerKg: 1.8,
      fatPct: 25,
      gainPctPerWeek: [0.25, 0.5],
      barcodeLookup: false,
    });
  });
});

describe('ageOn', () => {
  it('is the year difference from birth year to today', () => {
    expect(ageOn(1996, '2026-01-01')).toBe(30);
    expect(ageOn(1996, '2026-12-31')).toBe(30);
    expect(ageOn(2000, '2026-06-10')).toBe(26);
  });
  it('never goes negative', () => {
    expect(ageOn(2030, '2026-06-10')).toBe(0);
  });
});

describe('bmrMifflin', () => {
  it('male: 10w + 6.25h − 5a + 5', () => {
    expect(bmrMifflin({ sex: 'male', kg: 70, heightCm: 175, age: 30 })).toBeCloseTo(700 + 1093.75 - 150 + 5);
  });
  it('female: 10w + 6.25h − 5a − 161', () => {
    expect(bmrMifflin({ sex: 'female', kg: 60, heightCm: 165, age: 28 })).toBeCloseTo(
      600 + 1031.25 - 140 - 161,
    );
  });
});

describe('clamps', () => {
  it('surplus to 0–600', () => {
    expect(clampSurplus(-50)).toBe(0);
    expect(clampSurplus(300)).toBe(300);
    expect(clampSurplus(900)).toBe(600);
    expect(clampSurplus(Number.NaN)).toBe(300);
  });
  it('protein to 1.6–2.2 g/kg', () => {
    expect(clampProtein(1.0)).toBe(1.6);
    expect(clampProtein(2.0)).toBe(2.0);
    expect(clampProtein(3.5)).toBe(2.2);
    expect(clampProtein(Number.NaN)).toBe(1.8);
  });
});

describe('currentWeight', () => {
  it('is the average of weigh-ins in the last 7 days (today included)', () => {
    const w: WeighIn[] = [
      { date: '2026-06-03', kg: 90 }, // 8 days back: outside
      { date: '2026-06-04', kg: 70 },
      { date: '2026-06-07', kg: 71 },
      { date: '2026-06-10', kg: 72 },
    ];
    expect(currentWeight(w, TODAY)).toEqual({ kg: 71, from: 'avg7' });
  });
  it('falls back to the latest weigh-in when none is in the window', () => {
    const w: WeighIn[] = [
      { date: '2026-05-01', kg: 69 },
      { date: '2026-05-20', kg: 70.5 },
      { date: '2026-05-10', kg: 69.5 },
    ];
    expect(currentWeight(w, TODAY)).toEqual({ kg: 70.5, from: 'latest' });
  });
  it('ignores weigh-ins dated after today', () => {
    expect(currentWeight([{ date: '2026-06-11', kg: 80 }], TODAY)).toBeNull();
  });
  it('a repeated date counts once, the later row wins', () => {
    const w: WeighIn[] = [
      { date: '2026-06-09', kg: 70 },
      { date: '2026-06-10', kg: 99 },
      { date: '2026-06-10', kg: 72 },
    ];
    expect(currentWeight(w, TODAY)).toEqual({ kg: 71, from: 'avg7' });
  });
  it('is null with no weigh-ins', () => {
    expect(currentWeight([], TODAY)).toBeNull();
  });
});

describe('computeTargets', () => {
  it('asks to weigh in first when there is no weigh-in', () => {
    expect(computeTargets(base, [], TODAY)).toEqual({ ok: false, reason: 'weighInFirst' });
  });

  it('male, moderate: maintenance + 300, protein 1.8 g/kg, all estimates', () => {
    const r = ok(computeTargets(base, oneWeighIn, TODAY));
    // BMR = 700 + 1093.75 − 150 + 5 = 1648.75; × 1.55 = 2555.5625
    expect(r.weightKg).toBe(70);
    expect(r.maintenanceKcal).toBe(2556);
    expect(r.targets.kcal).toEqual({ value: 2856, estimate: true });
    expect(r.targets.proteinG).toEqual({ value: 126, estimate: true });
    // fat = max(25% × 2856 / 9 = 79.3, 0.6 × 70 = 42) → 79
    expect(r.targets.fatG).toEqual({ value: 79, estimate: true });
    // carbs = (2856 − 126×4 − 79×9) / 4 = (2856 − 504 − 711) / 4 = 410.25 → 410
    expect(r.targets.carbsG).toEqual({ value: 410, estimate: true });
  });

  it('female, every activity level uses its factor', () => {
    const f: NutritionSettings = { ...base, sex: 'female', heightCm: 165, birthYear: 1998 };
    const bmr = 600 + 1031.25 - 140 - 161; // 60 kg, 165 cm, 28 y
    const w: WeighIn[] = [{ date: TODAY, kg: 60 }];
    expect(ACTIVITY_FACTORS).toEqual({ sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 });
    for (const activity of ['sedentary', 'light', 'moderate', 'very'] as const) {
      const r = ok(computeTargets({ ...f, activity }, w, TODAY));
      expect(r.maintenanceKcal).toBe(Math.round(bmr * ACTIVITY_FACTORS[activity]));
      expect(r.targets.kcal.value).toBe(Math.round(bmr * ACTIVITY_FACTORS[activity]) + 300);
    }
  });

  it('male, every activity level differs and rises with activity', () => {
    const vals = (['sedentary', 'light', 'moderate', 'very'] as const).map(
      (activity) => ok(computeTargets({ ...base, activity }, oneWeighIn, TODAY)).maintenanceKcal,
    );
    expect(vals).toEqual([1979, 2267, 2556, 2844]);
  });

  it('clamps surplus and protein from stored settings', () => {
    const hi = ok(computeTargets({ ...base, surplusKcal: 1000, proteinGPerKg: 3 }, oneWeighIn, TODAY));
    expect(hi.targets.kcal.value).toBe(2556 + 600);
    expect(hi.targets.proteinG.value).toBe(Math.round(2.2 * 70));
    const lo = ok(computeTargets({ ...base, surplusKcal: -200, proteinGPerKg: 1 }, oneWeighIn, TODAY));
    expect(lo.targets.kcal.value).toBe(2556);
    expect(lo.targets.proteinG.value).toBe(Math.round(1.6 * 70));
  });

  it('the 0.6 g/kg fat floor binds when 25% of kcal is less', () => {
    // A heavy made-up person on a hand-set low kcal target: 25% × 1800 / 9 = 50 g < 0.6 × 120 = 72 g.
    const s: NutritionSettings = { ...base, overrides: { kcal: 1800 } };
    const r = ok(computeTargets(s, [{ date: TODAY, kg: 120 }], TODAY));
    expect(r.targets.fatG).toEqual({ value: 72, estimate: true });
  });

  it('carbs never go negative', () => {
    // Hand-set protein alone is more than the hand-set kcal (which is above the BMR floor, M12 1b).
    const s: NutritionSettings = { ...base, overrides: { kcal: 2000, proteinG: 520 } };
    const r = ok(computeTargets(s, [{ date: TODAY, kg: 100 }], TODAY));
    expect(r.kcalFloored).toBe(false);
    expect(r.targets.carbsG.value).toBe(0);
  });

  it('overrides win per macro and drop the estimate flag; derived macros follow them', () => {
    const s: NutritionSettings = { ...base, overrides: { kcal: 3000, proteinG: 140 } };
    const r = ok(computeTargets(s, oneWeighIn, TODAY));
    expect(r.targets.kcal).toEqual({ value: 3000, estimate: false });
    expect(r.targets.proteinG).toEqual({ value: 140, estimate: false });
    // fat = 25% × 3000 / 9 = 83.3 → 83 (estimate), carbs = (3000 − 560 − 747) / 4 = 423.25 → 423
    expect(r.targets.fatG).toEqual({ value: 83, estimate: true });
    expect(r.targets.carbsG).toEqual({ value: 423, estimate: true });
    expect(r.maintenanceKcal).toBe(2556);

    const all = ok(
      computeTargets({ ...base, overrides: { kcal: 2500, proteinG: 150, carbsG: 300, fatG: 70 } }, oneWeighIn, TODAY),
    );
    expect(all.targets).toEqual({
      kcal: { value: 2500, estimate: false },
      proteinG: { value: 150, estimate: false },
      carbsG: { value: 300, estimate: false },
      fatG: { value: 70, estimate: false },
    });
  });

  it('uses the 7-day average weight', () => {
    const w: WeighIn[] = [
      { date: '2026-06-08', kg: 69 },
      { date: '2026-06-10', kg: 71 },
    ];
    const r = ok(computeTargets(base, w, TODAY));
    expect(r.weightKg).toBe(70);
    expect(r.weightFrom).toBe('avg7');
  });

  it('is the same in Quick and Full mode (mode only changes what is shown)', () => {
    const q = computeTargets({ ...base, mode: 'quick' }, oneWeighIn, TODAY);
    const f = computeTargets({ ...base, mode: 'full' }, oneWeighIn, TODAY);
    expect(q).toEqual(f);
  });
});

describe('mode', () => {
  it('visibleMacros', () => {
    expect(visibleMacros('quick')).toEqual(['kcal', 'proteinG']);
    expect(visibleMacros('full')).toEqual(['kcal', 'proteinG', 'carbsG', 'fatG']);
  });

  it('a Quick → Full → Quick round trip changes no stored value', () => {
    const stored: NutritionSettings = {
      ...base,
      surplusKcal: 250,
      proteinGPerKg: 2.0,
      overrides: { kcal: 2700, fatG: 75 },
    };
    const snapshot = structuredClone(stored);
    const full = withMode(stored, 'full');
    expect(full.mode).toBe('full');
    expect({ ...full, mode: 'quick' }).toEqual(snapshot);
    const back = withMode(full, 'quick');
    expect(back).toEqual(snapshot);
    expect(stored).toEqual(snapshot); // input not mutated
    expect(computeTargets(back, oneWeighIn, TODAY)).toEqual(computeTargets(stored, oneWeighIn, TODAY));
  });
});

// ---- M12 1b: targets follow the goal and sex ----

// Made-up example people; never real body stats.
const man: NutritionSettings = { ...base }; // 175 cm, 30 y, 70 kg, moderate → BMR 1648.75, maintenance 2556
const woman: NutritionSettings = { ...NUTRITION_DEFAULTS, heightCm: 162, birthYear: 1994, sex: 'female', activity: 'light' };
const womanWeighIn: WeighIn[] = [{ date: TODAY, kg: 58 }]; // 32 y → BMR 1271.5, maintenance 1748
const smaller: NutritionSettings = { ...NUTRITION_DEFAULTS, heightCm: 150, birthYear: 1981, sex: 'female', activity: 'sedentary' };
const smallerWeighIn: WeighIn[] = [{ date: TODAY, kg: 48 }]; // 45 y → BMR 1031.5, maintenance 1238

describe('goal targets (M12 1b)', () => {
  const cases: [GoalKind, number, number, number, number][] = [
    // goal, man kcal, man protein g, woman kcal, woman protein g
    ['muscle', 2856, 126, 2048, 104],
    ['strength', 2756, 126, 1948, 104],
    ['general', 2556, 112, 1748, 93],
    ['fat', 2156, 140, 1348, 116],
  ];

  it.each(cases)('%s: male and female (Mifflin per sex) from made-up bodies', (kind, mKcal, mProtein, fKcal, fProtein) => {
    const m = ok(computeTargets(withGoal(man, kind), oneWeighIn, TODAY));
    expect(m.maintenanceKcal).toBe(2556);
    expect(m.bmrKcal).toBe(1649);
    expect(m.targets.kcal).toEqual({ value: mKcal, estimate: true });
    expect(m.targets.proteinG).toEqual({ value: mProtein, estimate: true });
    const f = ok(computeTargets(withGoal(woman, kind), womanWeighIn, TODAY));
    expect(f.maintenanceKcal).toBe(1748);
    expect(f.bmrKcal).toBe(1272);
    expect(f.targets.kcal).toEqual({ value: fKcal, estimate: true });
    expect(f.targets.proteinG).toEqual({ value: fProtein, estimate: true });
    for (const r of [m, f]) {
      expect(r.kcalFloored).toBe(false);
      expect(r.targets.kcal.value).toBeGreaterThanOrEqual(r.bmrKcal);
    }
  });

  it('no goal = the old result (and the same as the muscle goal)', () => {
    const none = ok(computeTargets(man, oneWeighIn, TODAY));
    expect(none.targets).toEqual({
      kcal: { value: 2856, estimate: true },
      proteinG: { value: 126, estimate: true },
      carbsG: { value: 410, estimate: true },
      fatG: { value: 79, estimate: true },
    });
    expect(none.maintenanceKcal).toBe(2556);
    expect(none.weightKg).toBe(70);
    expect(ok(computeTargets(withGoal(man, 'muscle'), oneWeighIn, TODAY)).targets).toEqual(none.targets);
    // Without a goal a stored negative surplus is still clamped to 0–600, as before.
    expect(ok(computeTargets({ ...man, surplusKcal: -400 }, oneWeighIn, TODAY)).targets.kcal.value).toBe(2556);
    expect(clampSurplus(-400)).toBe(0);
    expect(clampSurplus(900)).toBe(600);
  });

  it('the signed change is clamped to the goal’s range (−600…+600 overall)', () => {
    expect(clampSurplus(-400, 'fat')).toBe(-400);
    expect(clampSurplus(-900, 'fat')).toBe(-600);
    expect(clampSurplus(200, 'fat')).toBe(0);
    expect(clampSurplus(-900, 'general')).toBe(-600);
    expect(clampSurplus(900, 'general')).toBe(600);
    expect(clampSurplus(-100, 'muscle')).toBe(0);
    expect(clampSurplus(-100, 'strength')).toBe(0);
    expect(clampSurplus(Number.NaN, 'fat')).toBe(-400);
    expect(clampSurplus(Number.NaN, 'general')).toBe(0);
    expect(clampSurplus(Number.NaN)).toBe(300);
    const r = ok(computeTargets({ ...withGoal(man, 'fat'), surplusKcal: -900 }, oneWeighIn, TODAY));
    expect(r.targets.kcal.value).toBe(2556 - 600);
  });

  it('BMR floor: a deficit never takes the kcal target below the resting estimate', () => {
    const r = ok(computeTargets(withGoal(smaller, 'fat'), smallerWeighIn, TODAY));
    expect(r.maintenanceKcal).toBe(1238);
    expect(r.bmrKcal).toBe(1032); // 1031.5 rounded up, so the target is never under it
    expect(r.targets.kcal).toEqual({ value: 1032, estimate: true }); // not 838
    expect(r.kcalFloored).toBe(true);
    // The biggest deficit allowed, every sex and activity: still at or above BMR.
    for (const sex of ['male', 'female'] as const) {
      for (const activity of ['sedentary', 'light', 'moderate', 'very'] as const) {
        const s = { ...withGoal({ ...smaller, sex, activity }, 'fat'), surplusKcal: -600 };
        const t = ok(computeTargets(s, smallerWeighIn, TODAY));
        expect(t.targets.kcal.value).toBeGreaterThanOrEqual(t.bmrKcal);
      }
    }
  });

  it('BMR floor: a hand-set kcal under it is lifted too; the other macros follow the lifted value', () => {
    const r = ok(computeTargets({ ...smaller, overrides: { kcal: 800 } }, smallerWeighIn, TODAY));
    expect(r.targets.kcal).toEqual({ value: 1032, estimate: false });
    expect(r.kcalFloored).toBe(true);
    const at = ok(computeTargets({ ...smaller, overrides: { kcal: 1032 } }, smallerWeighIn, TODAY));
    expect(r.targets.fatG).toEqual(at.targets.fatG);
    expect(at.kcalFloored).toBe(false);
  });
});

describe('goalTargetChange (before → after, nothing applied)', () => {
  it('shows the kcal and protein change and returns the settings to save on Apply', () => {
    const snapshot = structuredClone(man);
    const c = goalTargetChange(man, oneWeighIn, TODAY, 'fat');
    if (!c.ok) throw new Error('expected a change');
    expect(c.text).toBe('Fuel targets: 2,856 → 2,156 kcal');
    expect(c.lines).toEqual([
      { label: 'Calories', before: '2,856 kcal', after: '2,156 kcal' },
      { label: 'Protein', before: '126 g', after: '140 g' },
    ]);
    expect(c.changed).toBe(true);
    expect(c.before.kcal.value).toBe(2856);
    expect(c.after.kcal.value).toBe(2156);
    expect(c.next).toEqual(withGoal(man, 'fat'));
    expect(man).toEqual(snapshot); // nothing changes until the caller saves `next`
  });

  it('each goal, for a woman’s made-up body', () => {
    const text = (kind: GoalKind) => {
      const c = goalTargetChange(woman, womanWeighIn, TODAY, kind);
      return c.ok ? c.text : c.reason;
    };
    expect(text('muscle')).toBe('Fuel targets stay at 2,048 kcal');
    expect(text('strength')).toBe('Fuel targets: 2,048 → 1,948 kcal');
    expect(text('general')).toBe('Fuel targets: 2,048 → 1,748 kcal');
    expect(text('fat')).toBe('Fuel targets: 2,048 → 1,348 kcal');
  });

  it('same numbers (no goal → muscle) still records the goal, with nothing to show as changed', () => {
    const c = goalTargetChange(man, oneWeighIn, TODAY, 'muscle');
    if (!c.ok) throw new Error('expected a change');
    expect(c.changed).toBe(false);
    expect(c.lines).toEqual([]);
    expect(c.next.goalKind).toBe('muscle');
  });

  it('hand-set values stay his: they are listed, and the line shows no change for them', () => {
    const s: NutritionSettings = { ...man, overrides: { kcal: 2700 } };
    const c = goalTargetChange(s, oneWeighIn, TODAY, 'fat');
    if (!c.ok) throw new Error('expected a change');
    expect(c.handSet).toEqual(['kcal']);
    expect(c.text).toBe('Fuel targets stay at 2,700 kcal');
    expect(c.lines).toEqual([{ label: 'Protein', before: '126 g', after: '140 g' }]);
    expect(c.next.overrides).toEqual({ kcal: 2700 });
  });

  it('no weigh-in yet: nothing to show, but the settings for Apply are still there', () => {
    const c = goalTargetChange(man, [], TODAY, 'fat');
    expect(c).toEqual({ ok: false, reason: 'weighInFirst', next: withGoal(man, 'fat') });
  });
});
