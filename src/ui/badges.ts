// M4b exercise badges: "3D demo" when an animated demo exists, "Info" otherwise, plus "Camera" for
// pose-tracked exercises, plus M4f "Learning" when that camera rule is still learning. Computed
// from data (hasDemo, tracking, the rule status), never from a hard-coded list.

import type { PlannedExercise } from '../core/types';
import { ruleStatus as coreRuleStatus, type RuleStatus } from '../core/exercises';
import { hasDemo } from './demo3d/ids';
import { h } from './dom';
import { icon, type IconName } from './icons';
import './howto.css';

export type BadgeKind = '3d' | 'info' | 'camera' | 'learning';
export type Badge = { kind: BadgeKind; label: string };

/** M4f rule status; `null`/`undefined` = no camera rule. */
export type BadgeRuleStatus = RuleStatus | null | undefined;

/** Where the status comes from when a caller doesn't pass one: the rule data in core. */
const lookupRuleStatus: (exerciseId: string) => BadgeRuleStatus = coreRuleStatus;

export type BadgeInput = {
  exerciseId: string;
  tracking: PlannedExercise['tracking'];
  /** Override for tests; omitted = looked up from the rule data. */
  ruleStatus?: BadgeRuleStatus;
};

/** Pure: which badges an exercise shows, in display order. */
export function badgeList({ exerciseId, tracking, ruleStatus }: BadgeInput): Badge[] {
  const out: Badge[] = [
    hasDemo(exerciseId) ? { kind: '3d', label: '3D demo' } : { kind: 'info', label: 'Info' },
  ];
  if (tracking === 'pose') {
    out.push({ kind: 'camera', label: 'Camera' });
    const status = ruleStatus === undefined ? lookupRuleStatus(exerciseId) : ruleStatus;
    if (status === 'learning') out.push({ kind: 'learning', label: 'Learning' });
  }
  return out;
}

/** Each badge's icon (decorative: the word is the label). */
export const BADGE_ICON: Record<BadgeKind, IconName> = {
  '3d': 'play',
  info: 'help',
  camera: 'camera',
  learning: 'trend',
};

/**
 * A row of small static pills (icon + word) on a neutral surface; place it in a list row or a
 * header. Not buttons, and not coloured: they describe the exercise, nothing to press or reach.
 */
export function badgesFor(input: BadgeInput): HTMLElement {
  return h(
    'span',
    { class: 'ex-badges', 'data-badges': input.exerciseId },
    ...badgeList(input).map((b) =>
      h(
        'span',
        { class: `ex-badge ex-badge-${b.kind}`, 'data-badge': b.kind },
        icon(BADGE_ICON[b.kind], 'sm'),
        h('span', {}, b.label),
      ),
    ),
  );
}
