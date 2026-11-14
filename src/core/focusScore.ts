// M5 per-set focus score (SPEC M5 "Score"). Pure: cue ids + partials in, 0–100 out.
import type { FocusCueId } from './types';

/** Points lost per detection. Out of frame and low fps are placement/light, not focus: 0. */
const WEIGHTS: Readonly<Record<FocusCueId, number>> = {
  rushedLowering: 10,
  shrinkingRange: 10,
  armsOutOfSync: 10,
  raiseTooHigh: 10,
  elbowDrift: 10,
  bodySwing: 10,
  hipSag: 10,
  stalled: 5,
  outOfFrame: 0,
  lowFps: 0,
};

/** Points lost per partial rep. */
export const PARTIAL_WEIGHT = 5;

export const FOCUS_CUE_IDS = Object.keys(WEIGHTS) as readonly FocusCueId[];

export function isFocusCueId(v: unknown): v is FocusCueId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(WEIGHTS, v);
}

export function cueWeight(id: FocusCueId): number {
  return WEIGHTS[id];
}

/**
 * 100 − Σ cue weights − 5 × partials, clamped to 0–100. Every detection counts (a cue the
 * speech policy dropped still costs). Unknown ids are skipped; bad partials count as 0.
 */
export function focusScore(cues: readonly FocusCueId[], partials: number): number {
  const p = Number.isFinite(partials) ? Math.max(0, Math.round(partials)) : 0;
  let score = 100 - p * PARTIAL_WEIGHT;
  for (const id of cues) if (isFocusCueId(id)) score -= WEIGHTS[id];
  return Math.min(100, Math.max(0, score));
}
