// M7 Fuel — daily nutrition targets (SPEC M7 "Targets"). Pure: dates are passed in.
import type {
  GoalKind,
  MacroSet,
  NutritionMode,
  NutritionSettings,
  NutritionTargets,
  TargetValue,
  WeighIn,
} from '../types';
import { addDate } from '../trainer/plan';
import { fuelRuleFor, withGoal } from './goalTargets';

export const ACTIVITY_FACTORS: Record<NutritionSettings['activity'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
};

/** Settings defaults (SPEC M7); body stats come from setup. */
export const NUTRITION_DEFAULTS = {
  mode: 'quick',
  surplusKcal: 300,
  proteinGPerKg: 1.8,
  fatPct: 25,
  gainPctPerWeek: [0.25, 0.5],
  barcodeLookup: false,
} as const satisfies Omit<NutritionSettings, 'heightCm' | 'birthYear' | 'sex' | 'activity'>;

/** The kcal change range with no goal set (a surplus only). Per goal: goalTargets.ts `deltaRange`. */
export const SURPLUS_RANGE = [0, 600] as const;
export const PROTEIN_RANGE = [1.6, 2.2] as const;
/** Fat never goes below this many g per kg of body weight (Full mode). */
export const FAT_MIN_G_PER_KG = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The signed kcal change against maintenance, kept inside the goal's range (M12 1b): 0–600 with
 * no goal or a gain goal, down to −600 for "lose fat" / "general". Junk → the goal's default.
 */
export function clampSurplus(kcal: number, goalKind?: GoalKind): number {
  const rule = fuelRuleFor(goalKind);
  return Number.isFinite(kcal) ? clamp(kcal, rule.deltaRange[0], rule.deltaRange[1]) : rule.deltaKcal;
}

export function clampProtein(gPerKg: number): number {
  return Number.isFinite(gPerKg)
    ? clamp(gPerKg, PROTEIN_RANGE[0], PROTEIN_RANGE[1])
    : NUTRITION_DEFAULTS.proteinGPerKg;
}

/** Age in whole years from the birth year (only the year is stored) and today's local date. */
export function ageOn(birthYear: number, today: string): number {
  return Math.max(0, Number(today.slice(0, 4)) - birthYear);
}

/** Mifflin–St Jeor resting energy, kcal/day. */
export function bmrMifflin(p: { sex: 'male' | 'female'; kg: number; heightCm: number; age: number }): number {
  return 10 * p.kg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/** One weigh-in per date; a repeated date keeps the later row (M7-q10). */
export function dedupeWeighIns(weighIns: readonly WeighIn[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const w of weighIns) byDate.set(w.date, w.kg);
  return byDate;
}

/** Mean of the weigh-ins dated in `[from, to]` (inclusive local dates), or null. */
export function averageBetween(
  weighIns: readonly WeighIn[],
  from: string,
  to: string,
): { avgKg: number; count: number } | null {
  let sum = 0;
  let count = 0;
  for (const [date, kg] of dedupeWeighIns(weighIns)) {
    if (date >= from && date <= to) {
      sum += kg;
      count += 1;
    }
  }
  return count ? { avgKg: sum / count, count } : null;
}

export type CurrentWeight = { kg: number; from: 'avg7' | 'latest' };

/** Body weight for targets: the 7-day average (today and the 6 days before), else the latest weigh-in, else null. */
export function currentWeight(weighIns: readonly WeighIn[], today: string): CurrentWeight | null {
  const avg = averageBetween(weighIns, addDate(today, -6), today);
  if (avg) return { kg: avg.avgKg, from: 'avg7' };
  let latest: [string, number] | null = null;
  for (const [date, kg] of dedupeWeighIns(weighIns)) {
    if (date <= today && (!latest || date > latest[0])) latest = [date, kg];
  }
  return latest ? { kg: latest[1], from: 'latest' } : null;
}

export type TargetsResult =
  | {
      ok: true;
      targets: NutritionTargets;
      /** Mifflin–St Jeor × activity, rounded; the weekly check never goes below it. */
      maintenanceKcal: number;
      /** Mifflin–St Jeor resting estimate, rounded up; the kcal target is never below it (M12 1b). */
      bmrKcal: number;
      /** The kcal target (computed or hand-set) was under `bmrKcal` and was lifted to it. */
      kcalFloored: boolean;
      weightKg: number;
      weightFrom: CurrentWeight['from'];
    }
  | { ok: false; reason: 'weighInFirst' };

const est = (value: number): TargetValue => ({ value: Math.round(value), estimate: true });
const pick = (override: number | undefined, computed: () => number): TargetValue =>
  override !== undefined && Number.isFinite(override)
    ? { value: override, estimate: false }
    : est(computed());

/**
 * Daily targets. All four macros are always computed (the mode only changes what is shown).
 * Overrides win per macro (estimate: false); fat and carbs are derived from the final kcal and
 * protein targets, so a hand-set kcal carries through.
 *
 * M12 1b: the kcal change follows `settings.goalKind` (a deficit for "lose fat"; no goal = the
 * old surplus). The kcal target, computed or hand-set, is never below the resting estimate.
 */
export function computeTargets(
  settings: NutritionSettings,
  weighIns: readonly WeighIn[],
  today: string,
): TargetsResult {
  const weight = currentWeight(weighIns, today);
  if (!weight) return { ok: false, reason: 'weighInFirst' };
  const kg = weight.kg;
  const o = settings.overrides ?? {};

  const bmr = bmrMifflin({ sex: settings.sex, kg, heightCm: settings.heightCm, age: ageOn(settings.birthYear, today) });
  const maintenanceKcal = Math.round(bmr * ACTIVITY_FACTORS[settings.activity]);
  const bmrKcal = Math.ceil(bmr);

  const wanted = pick(o.kcal, () => maintenanceKcal + clampSurplus(settings.surplusKcal, settings.goalKind));
  const kcalFloored = wanted.value < bmrKcal;
  const kcal: TargetValue = kcalFloored ? { ...wanted, value: bmrKcal } : wanted;
  const proteinG = pick(o.proteinG, () => clampProtein(settings.proteinGPerKg) * kg);
  const fatPct = Number.isFinite(settings.fatPct) ? Math.max(0, settings.fatPct) : NUTRITION_DEFAULTS.fatPct;
  const fatG = pick(o.fatG, () => Math.max((kcal.value * fatPct) / 100 / 9, FAT_MIN_G_PER_KG * kg));
  const carbsG = pick(o.carbsG, () => Math.max(0, (kcal.value - proteinG.value * 4 - fatG.value * 9) / 4));

  return {
    ok: true,
    targets: { kcal, proteinG, carbsG, fatG },
    maintenanceKcal,
    bmrKcal,
    kcalFloored,
    weightKg: kg,
    weightFrom: weight.from,
  };
}

export type GoalTargetLine = { label: string; before: string; after: string };

export type GoalTargetChange =
  | {
      ok: true;
      /** The settings to save when he taps Apply. Nothing is saved before that. */
      next: NutritionSettings;
      before: NutritionTargets;
      after: NutritionTargets;
      /** A shown number (kcal or protein) differs. */
      changed: boolean;
      /** "Fuel targets: 2,650 → 2,250 kcal", or "Fuel targets stay at 2,650 kcal". */
      text: string;
      /** The rows that differ (Calories, Protein). */
      lines: GoalTargetLine[];
      /** Macros he set by hand; they stay as they are and win over the goal. */
      handSet: MacroKey[];
    }
  | { ok: false; reason: 'weighInFirst'; next: NutritionSettings };

const fmt = (v: number) => v.toLocaleString('en-US');

/**
 * A goal change as before → after. Pure: `settings` is not touched and nothing is stored; the
 * caller shows the text and saves `next` only on Apply.
 */
export function goalTargetChange(
  settings: NutritionSettings,
  weighIns: readonly WeighIn[],
  today: string,
  goalKind: GoalKind,
): GoalTargetChange {
  const next = withGoal(settings, goalKind);
  const before = computeTargets(settings, weighIns, today);
  const after = computeTargets(next, weighIns, today);
  if (!before.ok || !after.ok) return { ok: false, reason: 'weighInFirst', next };
  const b = before.targets;
  const a = after.targets;
  const lines: GoalTargetLine[] = [];
  if (a.kcal.value !== b.kcal.value) {
    lines.push({ label: 'Calories', before: `${fmt(b.kcal.value)} kcal`, after: `${fmt(a.kcal.value)} kcal` });
  }
  if (a.proteinG.value !== b.proteinG.value) {
    lines.push({ label: 'Protein', before: `${fmt(b.proteinG.value)} g`, after: `${fmt(a.proteinG.value)} g` });
  }
  const text =
    a.kcal.value !== b.kcal.value
      ? `Fuel targets: ${fmt(b.kcal.value)} → ${fmt(a.kcal.value)} kcal`
      : `Fuel targets stay at ${fmt(a.kcal.value)} kcal`;
  const o = settings.overrides ?? {};
  const handSet = (['kcal', 'proteinG', 'carbsG', 'fatG'] as const).filter((k) => o[k] !== undefined);
  return { ok: true, next, before: b, after: a, changed: lines.length > 0, text, lines, handSet };
}

export type MacroKey = keyof MacroSet;

/** Which macros the mode shows and asks for. */
export function visibleMacros(mode: NutritionMode): MacroKey[] {
  return mode === 'full' ? ['kcal', 'proteinG', 'carbsG', 'fatG'] : ['kcal', 'proteinG'];
}

/** Switch mode: a new settings object differing only in `mode` (no other value is touched). */
export function withMode(settings: NutritionSettings, mode: NutritionMode): NutritionSettings {
  return { ...settings, mode };
}
