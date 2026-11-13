// Registry of per-exercise rules. Add an exercise = add a data file and list it here.
import type { LandmarkFrame } from '../types';
import { curl } from './curl';
import { gobletSquat } from './gobletSquat';
import { lateralRaise } from './lateralRaise';
import { pushUp } from './pushUp';
import { row } from './row';
import { shoulderPress } from './shoulderPress';
import type { ExerciseRule, Side } from './types';

export type { ExerciseRule, Side, SidePair, Triplet } from './types';
export { COUNTER_DEFAULTS } from './types';

export const RULES: readonly ExerciseRule[] = [
  curl,
  pushUp,
  shoulderPress,
  row,
  gobletSquat,
  lateralRaise,
];

export function ruleFor(exerciseId: string): ExerciseRule | undefined {
  return RULES.find((r) => r.exerciseId === exerciseId);
}

export function ruleForFolder(folder: string): ExerciseRule | undefined {
  return RULES.find((r) => r.folder === folder);
}

/**
 * Whether the rule's optional extended gate holds for one side in this frame (normalized image y
 * grows downward). Always true without a gate; false if the gate's landmarks are missing.
 */
export function extendedGatePasses(rule: ExerciseRule, frame: LandmarkFrame, side: Side): boolean {
  const gate = rule.extendedGate;
  if (!gate) return true;
  const upper = frame.landmarks[gate.upper[side]];
  const lower = frame.landmarks[gate.lower[side]];
  if (!upper || !lower) return false;
  return upper.y < lower.y;
}
