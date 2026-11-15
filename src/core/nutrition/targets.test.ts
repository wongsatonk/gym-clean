import { describe, expect, it } from 'vitest';
import type { NutritionSettings, WeighIn } from '../types';
import {
  ACTIVITY_FACTORS,
  NUTRITION_DEFAULTS,
  ageOn,
  bmrMifflin,
  clampProtein,
  clampSurplus,
  computeTargets,
  currentWeight,
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
    const s: NutritionSettings = { ...base, overrides: { kcal: 900 } };
    const r = ok(computeTargets(s, [{ date: TODAY, kg: 100 }], TODAY));
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
