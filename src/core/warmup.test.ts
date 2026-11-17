import { describe, expect, it } from 'vitest';
import {
  isWarmup,
  warmupKind,
  warmupLabel,
  warmupLifts,
  warmupLine,
  warmupPlan,
  warmupRamp,
  workingSets,
  type WarmupLift,
} from './warmup';
import { WARMUP_RULES } from './warmupRules';
import type { PlannedExercise, ProgramDay, SetLog } from './types';
import { fromUnit, toUnit } from './units';

// Made-up plan and weights (the repo is public).
const lb = (v: number) => fromUnit(v, 'lb');
const inLb = (sets: readonly { weightKg: number; reps: number }[]) =>
  sets.map((s) => [Math.round(toUnit(s.weightKg, 'lb') * 100) / 100, s.reps]);
const inKg = (sets: readonly { weightKg: number; reps: number }[]) =>
  sets.map((s) => [s.weightKg, s.reps]);

const pe = (exerciseId: string, startWeightKg: number): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg,
  tracking: 'manual',
});
const LIFTS: Record<string, WarmupLift> = {
  squat: { kind: 'barbell', compound: true },
  bench: { kind: 'dumbbell', compound: true },
  row: { kind: 'dumbbell', compound: true },
  curl: { kind: 'dumbbell', compound: false },
  smith: { kind: 'smith', compound: true },
};
const plan = (
  exercises: PlannedExercise[],
  rule: 'firstHeavyLift' | 'everyCompound' | 'off' = 'firstHeavyLift',
  unit: 'kg' | 'lb' = 'kg',
) => {
  const day: ProgramDay = { id: 'd', name: 'Day', exercises };
  return warmupPlan({ day, rule, lifts: LIFTS, unit, workingKg: (p) => p.startWeightKg ?? 0 });
};

describe('warm-up rules (data)', () => {
  it('ramp 50% × 8 then 70% × 4; heavy dumbbell from 12 kg', () => {
    expect(WARMUP_RULES.ramp).toEqual([
      { share: 0.5, reps: 8 },
      { share: 0.7, reps: 4 },
    ]);
    expect(WARMUP_RULES.heavyDumbbellKg).toBe(12);
    expect(WARMUP_RULES.kit.kg.bar).toBe(20);
    expect(WARMUP_RULES.kit.lb.bar).toBe(45);
  });
});

describe('warmupRamp', () => {
  it('dumbbells in kg snap down to the 2.5 kg step', () => {
    // 50% of 22.5 = 11.25 → 10; 70% = 15.75 → 15.
    expect(inKg(warmupRamp(22.5, 'dumbbell', 'kg'))).toEqual([
      [10, 8],
      [15, 4],
    ]);
    // 50% of 15 = 7.5 (on the step); 70% = 10.5 → 10.
    expect(inKg(warmupRamp(15, 'dumbbell', 'kg'))).toEqual([
      [7.5, 8],
      [10, 4],
    ]);
  });

  it('dumbbells in lb snap down to the 5 lb step', () => {
    // 50% of 45 = 22.5 → 20; 70% = 31.5 → 30.
    expect(inLb(warmupRamp(lb(45), 'dumbbell', 'lb'))).toEqual([
      [20, 8],
      [30, 4],
    ]);
  });

  it('a kit with its own dumbbell step and lightest pair', () => {
    // 2 kg steps from 4 kg: 50% of 14 = 7 → 6; 70% = 9.8 → 8.
    const kit = { dumbbellStep: 2, dumbbellMin: 4 };
    expect(inKg(warmupRamp(14, 'dumbbell', 'kg', kit))).toEqual([
      [6, 8],
      [8, 4],
    ]);
    // Steps under the lightest pair are left out.
    expect(inKg(warmupRamp(12, 'dumbbell', 'kg', { dumbbellStep: 2, dumbbellMin: 8 }))).toEqual([
      [8, 4],
    ]);
  });

  it('barbell in kg: plate pairs on a 20 kg bar', () => {
    // 50% of 62.5 = 31.25 → 30; 70% = 43.75 → 42.5.
    expect(inKg(warmupRamp(62.5, 'barbell', 'kg'))).toEqual([
      [30, 8],
      [42.5, 4],
    ]);
  });

  it('barbell in lb: plate pairs on a 45 lb bar', () => {
    // 50% of 135 = 67.5 → 65; 70% = 94.5 → 90.
    expect(inLb(warmupRamp(lb(135), 'barbell', 'lb'))).toEqual([
      [65, 8],
      [90, 4],
    ]);
  });

  it('a step at or below the empty bar is the bar × 8, once', () => {
    // 50% of 40 = 20 = the bar; 70% = 28 → 27.5.
    expect(inKg(warmupRamp(40, 'barbell', 'kg'))).toEqual([
      [20, 8],
      [27.5, 4],
    ]);
    // 50% of 27.5 → under the bar; 70% = 19.25 → under the bar too: the bar once.
    expect(inKg(warmupRamp(27.5, 'barbell', 'kg'))).toEqual([[20, 8]]);
    // 70% of 30 = 21 → 20, the bar again: still once.
    expect(inKg(warmupRamp(30, 'barbell', 'kg'))).toEqual([[20, 8]]);
    expect(inLb(warmupRamp(lb(80), 'barbell', 'lb'))).toEqual([
      [45, 8],
      [55, 4],
    ]);
  });

  it('never a warm-up at or above the working weight', () => {
    expect(warmupRamp(20, 'barbell', 'kg')).toEqual([]);
    expect(warmupRamp(15, 'barbell', 'kg')).toEqual([]);
  });

  it('none for bodyweight or a bad weight', () => {
    expect(warmupRamp(0, 'dumbbell', 'kg')).toEqual([]);
    expect(warmupRamp(0, 'barbell', 'kg')).toEqual([]);
    expect(warmupRamp(Number.NaN, 'barbell', 'kg')).toEqual([]);
    expect(warmupRamp(-5, 'dumbbell', 'kg')).toEqual([]);
  });

  it('smith: plates only by default (bar 0), so no empty-bar set', () => {
    expect(inKg(warmupRamp(40, 'smith', 'kg'))).toEqual([
      [20, 8],
      [27.5, 4],
    ]);
    expect(inKg(warmupRamp(2.5, 'smith', 'kg'))).toEqual([]);
    expect(inKg(warmupRamp(30, 'smith', 'kg', { smithBar: 15 }))).toEqual([
      [15, 8],
      [20, 4],
    ]);
  });
});

describe('warmupPlan', () => {
  it('only the first heavy lift of the day gets a ramp', () => {
    const out = plan([pe('bench', 22.5), pe('squat', 60), pe('row', 20)]);
    expect(Object.keys(out)).toEqual(['bench']);
    expect(inKg(out.bench ?? [])).toEqual([
      [10, 8],
      [15, 4],
    ]);
  });

  it('light and bodyweight first lifts get none; the first heavy one after them does', () => {
    const out = plan([
      pe('pushup', 0),
      pe('curl', 10),
      pe('bench', 11.5),
      pe('row', 12),
      pe('squat', 60),
    ]);
    expect(Object.keys(out)).toEqual(['row']);
  });

  it('a day with only light or bodyweight lifts has none', () => {
    expect(plan([pe('pushup', 0), pe('curl', 10), pe('bench', 10)])).toEqual({});
  });

  it('the heavy threshold is per dumbbell, in kg, whatever the display unit', () => {
    expect(Object.keys(plan([pe('bench', lb(25))], 'firstHeavyLift', 'lb'))).toEqual([]);
    const out = plan([pe('bench', lb(30))], 'firstHeavyLift', 'lb');
    expect(inLb(out.bench ?? [])).toEqual([
      [15, 8],
      [20, 4],
    ]);
  });

  it('a barbell or smith lift counts at any loaded weight', () => {
    expect(Object.keys(plan([pe('curl', 8), pe('squat', 40)]))).toEqual(['squat']);
    expect(Object.keys(plan([pe('smith', 40), pe('squat', 40)]))).toEqual(['smith']);
  });

  it('lifts the kit map does not know (cables, machines) get none', () => {
    expect(plan([pe('pulldown', 40), pe('legpress', 80)])).toEqual({});
  });

  it('setting off: none', () => {
    expect(plan([pe('bench', 22.5), pe('squat', 60)], 'off')).toEqual({});
  });

  it('everyCompound: every heavy compound lift', () => {
    const lifts = { ...LIFTS, curl: { kind: 'dumbbell', compound: false } as WarmupLift };
    const day: ProgramDay = {
      id: 'd',
      name: 'Day',
      exercises: [pe('bench', 22.5), pe('curl', 14), pe('squat', 60), pe('pushup', 0)],
    };
    const out = warmupPlan({
      day,
      rule: 'everyCompound',
      lifts,
      unit: 'kg',
      workingKg: (p) => p.startWeightKg ?? 0,
    });
    expect(Object.keys(out)).toEqual(['bench', 'squat']);
  });

  it('a first heavy lift whose ramp is empty has none (and no later lift takes its place)', () => {
    expect(plan([pe('squat', 20), pe('bench', 22.5)])).toEqual({});
  });
});

describe('warmupKind / warmupLifts (from the exercise catalog fields)', () => {
  it('maps equipment to a kind, Smith by name, others to null', () => {
    const ex = (name: string, equipment: string | null, mechanic: string | null = 'compound') => ({
      id: name.replace(/ /g, '_'),
      name,
      equipment,
      mechanic,
    });
    expect(warmupKind(ex('Barbell Squat', 'barbell'))).toEqual({ kind: 'barbell', compound: true });
    expect(warmupKind(ex('Dumbbell Bicep Curl', 'dumbbell', 'isolation'))).toEqual({
      kind: 'dumbbell',
      compound: false,
    });
    expect(warmupKind(ex('Smith Machine Squat', 'machine'))).toEqual({
      kind: 'smith',
      compound: true,
    });
    expect(warmupKind(ex('Leg Press', 'machine'))).toBeNull();
    expect(warmupKind(ex('Pushups', 'body only'))).toBeNull();
    expect(warmupKind(ex('Mystery', null, null))).toBeNull();
    expect(warmupLifts([ex('Barbell Squat', 'barbell'), ex('Pushups', 'body only')])).toEqual({
      Barbell_Squat: { kind: 'barbell', compound: true },
    });
  });
});

describe('voice line and label', () => {
  const words = (s: string) => s.trim().split(/\s+/).length;

  it('speaks the weight and reps in ≤ 8 words', () => {
    expect(warmupLine({ weightKg: 20, reps: 8 }, 'kg')).toBe('Warm-up: 20 kilos for 8.');
    expect(warmupLine({ weightKg: 27.5, reps: 4 }, 'kg')).toBe('Warm-up: 27.5 kilos for 4.');
    expect(warmupLine({ weightKg: lb(45), reps: 8 }, 'lb')).toBe('Warm-up: 45 pounds for 8.');
    for (const unit of ['kg', 'lb'] as const)
      expect(words(warmupLine({ weightKg: lb(137.5), reps: 8 }, unit))).toBeLessThanOrEqual(8);
  });

  it('labels the set for the screen', () => {
    expect(warmupLabel({ index: 0, of: 2, weightKg: 20, reps: 8 }, 'kg')).toBe(
      'Warm-up 1 of 2 · 20 kg × 8',
    );
    expect(warmupLabel({ index: 1, of: 2, weightKg: lb(90), reps: 4 }, 'lb')).toBe(
      'Warm-up 2 of 2 · 90 lb × 4',
    );
  });
});

describe('isWarmup / workingSets', () => {
  it('splits warm-up logs from working sets', () => {
    const log = (over: Partial<SetLog>): SetLog => ({
      sessionId: 's',
      exerciseId: 'bench',
      setIndex: 0,
      reps: 8,
      weightKg: 20,
      restTakenSec: 0,
      startedAt: 1,
      endedAt: 2,
      ...over,
    });
    const logs = [log({ warmup: true, weightKg: 10 }), log({}), log({ setIndex: 1 })];
    expect(logs.map(isWarmup)).toEqual([true, false, false]);
    expect(workingSets(logs)).toEqual(logs.slice(1));
  });
});
