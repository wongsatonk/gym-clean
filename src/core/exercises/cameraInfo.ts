// SPEC M13c goal 4: what the Camera sheet shows for an exercise, outside a workout. Read from the
// rule data (counts line, placement, status) and the M13b one-sided list; null = counted by hand.
import type { OneSidedLimb } from '../types';
import { ruleFor } from './index';
import { oneSidedLimb } from './oneSided';
import type { PhonePlacement } from './types';

export type CameraInfo = {
  /** "Counts each curl from your elbow angle." (the rule's countsLine). */
  counts: string;
  /** Phone set-up lines (the rule's placement lines; a fresh array). */
  lines: string[];
  view: PhonePlacement['view'];
  /** How the body faces the phone, e.g. "Side-on, curling arm toward the phone". */
  facing: string;
  /** Phone-to-body distance range in metres. */
  distanceM: [min: number, max: number];
  /** Phone height, e.g. "Waist height". */
  heightHint: string;
  /** Present for one-sided exercises: right side first, then "Next arm/leg". */
  oneSided?: OneSidedLimb;
  /** The rule is still `learning` (SPEC M4f): show the learning note. */
  learning: boolean;
};

/** Camera info for an exercise, or null when it has no rule (manual counting). */
export function cameraInfo(exerciseId: string): CameraInfo | null {
  const rule = ruleFor(exerciseId);
  if (!rule) return null;
  const { placement } = rule;
  const info: CameraInfo = {
    counts: rule.countsLine,
    lines: [...placement.lines],
    view: placement.view,
    facing: placement.facing,
    distanceM: [placement.distanceM[0], placement.distanceM[1]],
    heightHint: placement.heightHint,
    learning: rule.status === 'learning',
  };
  const limb = oneSidedLimb(exerciseId);
  if (limb !== undefined) info.oneSided = limb;
  return info;
}
