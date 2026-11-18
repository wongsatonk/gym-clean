/**
 * M12 1b effort → M5b advice, as data (SPEC M12 "Trainer kit" item 1). The optional Easy / Good /
 * Hard tap on the rest screen (≈ 3+ / 2 / 0–1 reps left) changes when advice.ts offers a step up
 * (more weight, or one more rep for bodyweight). The effort of the exercise's **last** set decides.
 * Problems still win: a set below the range, partials or rushed lowering never step up.
 *
 * Defaults, tuned at a checkpoint.
 */
import type { SetEffort } from '../types';

export type EffortRule = {
  /** false = hold: no step up, whatever the reps. */
  stepUp: boolean;
  /** Reps every counted set needs: the top of the target range, or only its bottom. */
  repsFloor: 'top' | 'bottom';
  /** Clean sets at the current weight needed before a step up (never more than the planned sets). */
  minSetsAtWeight: number;
};

/** The rule before effort existed (M5b A3 / A4 / N3). */
const DEFAULT_RULE: EffortRule = { stepUp: true, repsFloor: 'top', minSetsAtWeight: 2 };

/** `none` = no answer. Good and no answer are the unchanged M5b rule. */
export const EFFORT_RULES: Readonly<Record<SetEffort | 'none', EffortRule>> = {
  none: DEFAULT_RULE,
  good: DEFAULT_RULE,
  easy: { stepUp: true, repsFloor: 'bottom', minSetsAtWeight: 1 },
  hard: { stepUp: false, repsFloor: 'top', minSetsAtWeight: 2 },
};

/** Opens the advice text and the "why" line when the effort changed the outcome's basis. */
export const EFFORT_WORDS: Readonly<Record<'easy' | 'hard', { lead: string; why: string }>> = {
  easy: { lead: 'Felt easy.', why: 'felt easy' },
  hard: { lead: 'Felt hard.', why: 'felt hard' },
};

export const SET_EFFORTS: readonly SetEffort[] = ['easy', 'good', 'hard'];

export const isSetEffort = (x: unknown): x is SetEffort =>
  typeof x === 'string' && (SET_EFFORTS as readonly string[]).includes(x);
