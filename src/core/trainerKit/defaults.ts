/**
 * M12 slice 1b: the trainer-kit setting (M12-q4, Decision "M12 slices 1b + 2"). The defaults are
 * data; the to-do decision step (src/data/todos/topics.ts) or a later change writes the settings
 * row 'trainerKit', and every slice 1b feature reads it through `getTrainerKit`
 * (src/data/trainerKit/store.ts), which merges the stored row with these defaults.
 */
import type { TrainerKitSettings } from '../types';

/** M12-q4 defaults (confirmed by the trainer-kit decision step). Frozen: copy before changing. */
export const TRAINER_KIT_DEFAULTS: TrainerKitSettings = Object.freeze({
  measurementSites: Object.freeze([
    'leftArm',
    'rightArm',
    'chest',
    'waist',
    'hips',
    'leftThigh',
    'rightThigh',
  ]) as unknown as string[],
  e1rmFormula: 'epley',
  warmups: 'firstHeavyLift',
  reviewWeeks: 5,
} satisfies TrainerKitSettings);

/** The longest review interval a stored row may ask for (a year). */
export const REVIEW_WEEKS_MAX = 52;

const WARMUPS: readonly TrainerKitSettings['warmups'][] = [
  'firstHeavyLift',
  'everyCompound',
  'off',
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Non-empty strings, trimmed, first mention wins; null when the value isn't a usable list. */
function cleanSites(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const s of v) {
    if (typeof s !== 'string') continue;
    const t = s.trim();
    if (t !== '' && !out.includes(t)) out.push(t);
  }
  return out.length > 0 ? out : null;
}

/**
 * The stored 'trainerKit' settings value merged over the defaults: each missing or bad field
 * falls back to its default on its own, unknown fields are dropped. Always a fresh object.
 */
export function mergeTrainerKit(row: unknown): TrainerKitSettings {
  const d = TRAINER_KIT_DEFAULTS;
  const v = isObj(row) ? row : {};
  const weeks = v.reviewWeeks;
  return {
    measurementSites: cleanSites(v.measurementSites) ?? [...d.measurementSites],
    e1rmFormula: v.e1rmFormula === 'epley' ? v.e1rmFormula : d.e1rmFormula,
    warmups: WARMUPS.find((w) => w === v.warmups) ?? d.warmups,
    reviewWeeks:
      typeof weeks === 'number' &&
      Number.isInteger(weeks) &&
      weeks >= 1 &&
      weeks <= REVIEW_WEEKS_MAX
        ? weeks
        : d.reviewWeeks,
  };
}
