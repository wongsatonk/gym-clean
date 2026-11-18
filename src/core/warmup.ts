/**
 * M12 1b warm-up sets (SPEC M12 "Trainer kit" item 2). Pure; numbers live in warmupRules.ts.
 *
 * Rule `firstHeavyLift` (M12-q4 default): only the day's first barbell / Smith / heavy-dumbbell
 * lift gets a ramp of 50% × 8 then 70% × 4 of its working weight, each snapped **down** to the
 * kit's step. On a bar, a step at or below the empty bar is the bar × 8, once. Bodyweight and
 * light lifts get none; `off` gives none anywhere.
 *
 * Warm-up logs carry `warmup: true` and are excluded from volume, bests, stalls, e1RM and
 * completion % (`workingSets`).
 */
import type { Exercise, PlannedExercise, ProgramDay, SetLog, TrainerKitSettings } from './types';
import { formatWeight, fromUnit, toUnit, type Unit } from './units';
import { WARMUP_RULES, type WarmupKind, type WarmupKitSteps } from './warmupRules';

export type { WarmupKind } from './warmupRules';

/** `trainerKit.warmups`. */
export type WarmupRule = TrainerKitSettings['warmups'];
export type WarmupSet = { weightKg: number; reps: number };
/** What a lift is loaded with; `compound` matters for the `everyCompound` rule only. */
export type WarmupLift = { kind: WarmupKind; compound: boolean };
/** Overrides of the default kit steps, in the display unit (from the gym profile). */
export type WarmupKit = Partial<WarmupKitSteps>;
/** Position in the ramp (`index` is 0-based) with the planned weight and reps. */
export type WarmupStep = WarmupSet & { index: number; of: number };

export type WarmupPlanInput = {
  day: ProgramDay;
  rule: WarmupRule;
  /** exerciseId → how it is loaded (`warmupLifts`); ids not in it get no warm-up. */
  lifts: Readonly<Record<string, WarmupLift>>;
  /** The working weight the exercise will start at today (kg). */
  workingKg: (p: PlannedExercise) => number;
  unit: Unit;
  kit?: WarmupKit;
};

const EPS = 1e-6;

export const isWarmup = (l: Pick<SetLog, 'warmup'>): boolean => l.warmup === true;

/** The logs that count for volume, bests, stalls, e1RM and completion: no warm-ups. */
export function workingSets<T extends Pick<SetLog, 'warmup'>>(logs: readonly T[]): T[] {
  return logs.filter((l) => !isWarmup(l));
}

const stepsFor = (unit: Unit, kit: WarmupKit = {}): WarmupKitSteps => {
  const out = { ...WARMUP_RULES.kit[unit] };
  for (const k of Object.keys(out) as (keyof WarmupKitSteps)[]) {
    const v = kit[k];
    if (v !== undefined && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
};

/** `x` down to a whole number of `step`s above `base` (all in the display unit). */
function floorTo(x: number, step: number, base = 0): number {
  if (!(step > 0)) return x;
  return base + Math.floor((x - base + EPS) / step) * step;
}

/**
 * The warm-up sets before a working weight (kg), lightest first; empty when there is nothing
 * sensible to do (bodyweight, a weight at the empty bar, every step under the lightest dumbbell).
 */
export function warmupRamp(
  workingKg: number,
  kind: WarmupKind,
  unit: Unit,
  kit?: WarmupKit,
): WarmupSet[] {
  if (!Number.isFinite(workingKg) || workingKg <= 0) return [];
  const k = stepsFor(unit, kit);
  const working = Math.round(toUnit(workingKg, unit) * 1000) / 1000;
  const bar = kind === 'barbell' ? k.bar : kind === 'smith' ? k.smithBar : 0;
  const out: { w: number; reps: number }[] = [];
  for (const { share, reps } of WARMUP_RULES.ramp) {
    const raw = working * share;
    let w: number;
    let r: number = reps;
    if (kind === 'dumbbell') {
      w = floorTo(raw, k.dumbbellStep);
      if (w < k.dumbbellMin - EPS) continue;
    } else {
      w = floorTo(raw, k.plateStep, bar);
      if (w <= bar + EPS) {
        // At or below the empty bar: the bar for the first step's reps (no bar → nothing).
        if (bar <= 0) continue;
        w = bar;
        r = WARMUP_RULES.ramp[0].reps;
      }
    }
    if (w <= 0 || w >= working - EPS) continue;
    if (out.some((s) => Math.abs(s.w - w) < EPS)) continue; // each weight once
    out.push({ w, reps: r });
  }
  return out.map((s) => ({ weightKg: fromUnit(s.w, unit), reps: s.reps }));
}

/** Does this lift at this working weight get a warm-up at all? */
function isHeavy(lift: WarmupLift, workingKg: number): boolean {
  if (!Number.isFinite(workingKg) || workingKg <= 0) return false;
  return lift.kind === 'dumbbell' ? workingKg >= WARMUP_RULES.heavyDumbbellKg - EPS : true;
}

/**
 * exerciseId → its warm-up sets for today. `firstHeavyLift`: at most one entry, the day's first
 * barbell / Smith / heavy-dumbbell lift (none when its ramp is empty). `everyCompound`: every
 * such lift that is a compound. `off`: empty.
 */
export function warmupPlan(input: WarmupPlanInput): Record<string, WarmupSet[]> {
  const out: Record<string, WarmupSet[]> = {};
  if (input.rule === 'off') return out;
  for (const p of input.day.exercises) {
    const lift = input.lifts[p.exerciseId];
    if (!lift || p.exerciseId in out) continue;
    const kg = input.workingKg(p);
    if (!isHeavy(lift, kg)) continue;
    if (input.rule === 'everyCompound' && !lift.compound) continue;
    const ramp = warmupRamp(kg, lift.kind, input.unit, input.kit);
    if (ramp.length > 0) out[p.exerciseId] = ramp;
    if (input.rule === 'firstHeavyLift') break;
  }
  return out;
}

/** How a catalog exercise is loaded, or null when it never gets a warm-up. */
export function warmupKind(
  ex: Pick<Exercise, 'name' | 'equipment' | 'mechanic'>,
): WarmupLift | null {
  const kind: WarmupKind | undefined = WARMUP_RULES.smithName.test(ex.name)
    ? 'smith'
    : WARMUP_RULES.equipmentKind[ex.equipment ?? ''];
  if (!kind) return null;
  return { kind, compound: ex.mechanic === WARMUP_RULES.compoundMechanic };
}

/** The `lifts` map for `warmupPlan` / `startSession` from catalog exercises. */
export function warmupLifts(
  exercises: readonly Pick<Exercise, 'id' | 'name' | 'equipment' | 'mechanic'>[],
): Record<string, WarmupLift> {
  const out: Record<string, WarmupLift> = {};
  for (const ex of exercises) {
    const lift = warmupKind(ex);
    if (lift) out[ex.id] = lift;
  }
  return out;
}

/** Spoken before a warm-up set (≤ 8 words): "Warm-up: 20 kilos for 8." */
export function warmupLine(set: WarmupSet, unit: Unit): string {
  const word = unit === 'kg' ? 'kilos' : 'pounds';
  return `Warm-up: ${formatWeight(set.weightKg, unit)} ${word} for ${set.reps}.`;
}

/** Shown on the set / rest screen: "Warm-up 1 of 2 · 20 kg × 8". */
export function warmupLabel(step: WarmupStep, unit: Unit): string {
  return `Warm-up ${step.index + 1} of ${step.of} · ${formatWeight(step.weightKg, unit)} ${unit} × ${step.reps}`;
}
