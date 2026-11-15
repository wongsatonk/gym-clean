// M7 Fuel — daily nutrition targets (SPEC M7 "Targets"). Pure: dates are passed in.
import type { MacroSet, NutritionMode, NutritionSettings, NutritionTargets, TargetValue, WeighIn } from '../types';
import { addDate } from '../trainer/plan';

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

export const SURPLUS_RANGE = [0, 600] as const;
export const PROTEIN_RANGE = [1.6, 2.2] as const;
/** Fat never goes below this many g per kg of body weight (Full mode). */
export const FAT_MIN_G_PER_KG = 0.6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampSurplus(kcal: number): number {
  return Number.isFinite(kcal) ? clamp(kcal, SURPLUS_RANGE[0], SURPLUS_RANGE[1]) : NUTRITION_DEFAULTS.surplusKcal;
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

  const kcal = pick(o.kcal, () => maintenanceKcal + clampSurplus(settings.surplusKcal));
  const proteinG = pick(o.proteinG, () => clampProtein(settings.proteinGPerKg) * kg);
  const fatPct = Number.isFinite(settings.fatPct) ? Math.max(0, settings.fatPct) : NUTRITION_DEFAULTS.fatPct;
  const fatG = pick(o.fatG, () => Math.max((kcal.value * fatPct) / 100 / 9, FAT_MIN_G_PER_KG * kg));
  const carbsG = pick(o.carbsG, () => Math.max(0, (kcal.value - proteinG.value * 4 - fatG.value * 9) / 4));

  return { ok: true, targets: { kcal, proteinG, carbsG, fatG }, maintenanceKcal, weightKg: kg, weightFrom: weight.from };
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
