/**
 * M13d task 5 (SPEC M13d Goal 2): what Set up Fuel opens with. Pure; the app passes the Health
 * profile (read once per open, iPhone app only, never stored), the latest weigh-in and the saved
 * NutritionSettings fields, plus the current year.
 *
 * Per field, the first valid value wins: saved (what you confirmed before) → Apple Health
 * (height, birth year, sex) → the latest weigh-in (weight; one imported from Health counts, even
 * on a first setup) → the starting placeholder. Values outside SETUP_RANGE are dropped and the
 * next source is used. Sex and activity have no placeholder: sex comes only from a saved value or
 * Health's female / male, never guessed. `fromHealth` names the fields whose shown value came from
 * Health, so the form can say "From Apple Health" next to them.
 *
 * SETUP_RANGE is the one copy of the field ranges (made-up starting values only; the repo is
 * public).
 */
import type { HealthProfile, NutritionSettings, WeighIn } from '../types';

export const SETUP_RANGE = {
  heightCm: { min: 120, max: 230, step: 1, start: 170 },
  age: { min: 14, max: 90, start: 30 },
  weightKg: { min: 30, max: 250, start: 70 },
} as const;

export type SetupSex = NutritionSettings['sex'];
export type SetupActivity = NutritionSettings['activity'];

/** What Set up Fuel collects (weight always kg, height always cm). */
export type SetupValues = {
  heightCm: number;
  birthYear: number;
  sex: SetupSex;
  activity: SetupActivity;
  weightKg: number;
};

export type PrefillField = 'height' | 'birthYear' | 'sex' | 'weight';

export type SetupPrefillInput = {
  /** From Apple Health (null / omitted on the web, when not connected or nothing recorded). */
  profile?: HealthProfile | null | undefined;
  /** The latest weigh-in's weight in kg (null / omitted when there is none). */
  latestKg?: number | null | undefined;
  /** Where that weigh-in came from; only 'health' tags the weight. */
  latestSource?: WeighIn['source'] | undefined;
  /** The saved values (a re-run), any subset. */
  saved?: Partial<SetupValues> | undefined;
  /** The current year (birth year is checked as an age in it). */
  year: number;
};

export type SetupPrefill = {
  initial: {
    heightCm: number;
    birthYear: number;
    weightKg: number;
    sex?: SetupSex;
    activity?: SetupActivity;
  };
  fromHealth: Set<PrefillField>;
};

const SEXES: readonly SetupSex[] = ['female', 'male'];
const ACTIVITIES: readonly SetupActivity[] = ['sedentary', 'light', 'moderate', 'very'];

/** True when `v` fits the Set up Fuel field range (inclusive; birth year as an age in `year`). */
export function setupValueOk(
  field: 'heightCm' | 'birthYear' | 'weightKg',
  v: unknown,
  year: number,
): v is number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return false;
  if (field === 'birthYear') {
    const age = year - v;
    return Number.isInteger(v) && age >= SETUP_RANGE.age.min && age <= SETUP_RANGE.age.max;
  }
  const r = SETUP_RANGE[field];
  return v >= r.min && v <= r.max;
}

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function prefillSetup(input: SetupPrefillInput): SetupPrefill {
  const { year } = input;
  const saved = input.saved ?? {};
  const profile = input.profile ?? {};
  const fromHealth = new Set<PrefillField>();

  const healthHeight =
    typeof profile.heightCm === 'number'
      ? roundTo(profile.heightCm, SETUP_RANGE.heightCm.step)
      : undefined;

  const pick = <T>(
    tag: PrefillField,
    savedV: T | undefined,
    healthV: T | undefined,
    ok: (v: unknown) => v is T,
  ): T | undefined => {
    if (ok(savedV)) return savedV;
    if (ok(healthV)) {
      fromHealth.add(tag);
      return healthV;
    }
    return undefined;
  };
  const num = (field: 'heightCm' | 'birthYear' | 'weightKg') => (v: unknown) =>
    setupValueOk(field, v, year);
  const sexOk = (v: unknown): v is SetupSex => SEXES.includes(v as SetupSex);
  const activityOk = (v: unknown): v is SetupActivity => ACTIVITIES.includes(v as SetupActivity);

  const heightCm =
    pick('height', saved.heightCm, healthHeight, num('heightCm')) ?? SETUP_RANGE.heightCm.start;
  const birthYear =
    pick('birthYear', saved.birthYear, profile.birthYear, num('birthYear')) ??
    year - SETUP_RANGE.age.start;
  const sex = pick('sex', saved.sex, profile.sex, sexOk);
  const activity = activityOk(saved.activity) ? saved.activity : undefined;

  // Weight: saved, then the latest weigh-in (Health-tagged only when it came from Health).
  let weightKg: number = SETUP_RANGE.weightKg.start;
  if (setupValueOk('weightKg', saved.weightKg, year)) weightKg = saved.weightKg;
  else if (setupValueOk('weightKg', input.latestKg, year)) {
    weightKg = input.latestKg;
    if (input.latestSource === 'health') fromHealth.add('weight');
  }

  return {
    initial: {
      heightCm,
      birthYear,
      weightKg,
      ...(sex !== undefined ? { sex } : {}),
      ...(activity !== undefined ? { activity } : {}),
    },
    fromHealth,
  };
}
