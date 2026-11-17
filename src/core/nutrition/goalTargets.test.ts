import { describe, expect, it } from 'vitest';
import type { GoalKind, NutritionSettings } from '../types';
import { GOAL_TARGETS, KCAL_DELTA_RANGE, NO_GOAL_RULE, fuelRuleFor, withGoal } from './goalTargets';
import { NUTRITION_DEFAULTS, PROTEIN_RANGE, SURPLUS_RANGE } from './targets';

const KINDS: GoalKind[] = ['muscle', 'strength', 'general', 'fat'];

// Made-up example person; never real body stats.
const base: NutritionSettings = { ...NUTRITION_DEFAULTS, heightCm: 162, birthYear: 1994, sex: 'female', activity: 'light' };

describe('goal targets (data)', () => {
  it('kcal change, protein and weekly band per goal', () => {
    expect(GOAL_TARGETS.muscle).toMatchObject({ deltaKcal: 300, proteinGPerKg: 1.8, weeklyPct: [0.25, 0.5] });
    expect(GOAL_TARGETS.strength).toMatchObject({ deltaKcal: 200, proteinGPerKg: 1.8, weeklyPct: [0.1, 0.35] });
    expect(GOAL_TARGETS.general).toMatchObject({ deltaKcal: 0, proteinGPerKg: 1.6, weeklyPct: [-0.25, 0.25] });
    expect(GOAL_TARGETS.fat).toMatchObject({ deltaKcal: -400, proteinGPerKg: 2.0, weeklyPct: [-0.75, -0.25] });
  });

  it('every value sits inside the allowed ranges', () => {
    expect(KCAL_DELTA_RANGE).toEqual([-600, 600]);
    for (const kind of KINDS) {
      const r = GOAL_TARGETS[kind];
      expect(r.deltaRange[0]).toBeGreaterThanOrEqual(KCAL_DELTA_RANGE[0]);
      expect(r.deltaRange[1]).toBeLessThanOrEqual(KCAL_DELTA_RANGE[1]);
      expect(r.deltaKcal).toBeGreaterThanOrEqual(r.deltaRange[0]);
      expect(r.deltaKcal).toBeLessThanOrEqual(r.deltaRange[1]);
      expect(r.proteinGPerKg).toBeGreaterThanOrEqual(PROTEIN_RANGE[0]);
      expect(r.proteinGPerKg).toBeLessThanOrEqual(PROTEIN_RANGE[1]);
      expect(r.weeklyPct[0]).toBeLessThan(r.weeklyPct[1]);
      expect(r.fastSlackPct).toBeGreaterThanOrEqual(0);
    }
  });

  it('gain goals never go under maintenance; "lose fat" never becomes a surplus', () => {
    expect(GOAL_TARGETS.muscle.deltaRange).toEqual([0, 600]);
    expect(GOAL_TARGETS.strength.deltaRange).toEqual([0, 600]);
    expect(GOAL_TARGETS.general.deltaRange).toEqual([-600, 600]);
    expect(GOAL_TARGETS.fat.deltaRange).toEqual([-600, 0]);
  });

  it('no goal = the muscle rule (what the app did before goals)', () => {
    expect(fuelRuleFor(undefined)).toBe(NO_GOAL_RULE);
    expect(NO_GOAL_RULE.deltaRange).toEqual([...SURPLUS_RANGE]);
    expect(NO_GOAL_RULE).toEqual(GOAL_TARGETS.muscle);
    expect(NO_GOAL_RULE.deltaKcal).toBe(NUTRITION_DEFAULTS.surplusKcal);
    expect(NO_GOAL_RULE.proteinGPerKg).toBe(NUTRITION_DEFAULTS.proteinGPerKg);
    expect(NO_GOAL_RULE.weeklyPct).toEqual([...NUTRITION_DEFAULTS.gainPctPerWeek]);
    for (const kind of KINDS) expect(fuelRuleFor(kind)).toBe(GOAL_TARGETS[kind]);
    expect(fuelRuleFor('bulk' as GoalKind)).toBe(NO_GOAL_RULE);
  });
});

describe('withGoal', () => {
  it('returns new settings with the goal’s kcal change, protein and band; the input is untouched', () => {
    const snapshot = structuredClone(base);
    const next = withGoal(base, 'fat');
    expect(next).toEqual({ ...base, goalKind: 'fat', surplusKcal: -400, proteinGPerKg: 2.0, gainPctPerWeek: [-0.75, -0.25] });
    expect(base).toEqual(snapshot);
    expect(next.gainPctPerWeek).not.toBe(GOAL_TARGETS.fat.weeklyPct);
  });

  it('keeps body stats, mode and hand-set values', () => {
    const s: NutritionSettings = { ...base, mode: 'full', fatPct: 30, overrides: { proteinG: 120 }, barcodeLookup: true };
    for (const kind of KINDS) {
      const next = withGoal(s, kind);
      expect(next).toMatchObject({ heightCm: 162, birthYear: 1994, sex: 'female', activity: 'light', mode: 'full', fatPct: 30, barcodeLookup: true });
      expect(next.overrides).toEqual({ proteinG: 120 });
      expect(next.goalKind).toBe(kind);
    }
  });
});
