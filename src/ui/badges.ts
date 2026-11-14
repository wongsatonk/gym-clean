// M4b exercise badges: "3D demo" when an animated demo exists, "Info" otherwise, plus "Camera" for
// pose-tracked exercises. Computed from data (hasDemo, tracking), never from a hard-coded list.

import type { PlannedExercise } from '../core/types';
import { hasDemo } from './demo3d/moves';
import { h } from './dom';
import { icon, type IconName } from './icons';
import './howto.css';

export type BadgeKind = '3d' | 'info' | 'camera';
export type Badge = { kind: BadgeKind; label: string };

export type BadgeInput = { exerciseId: string; tracking: PlannedExercise['tracking'] };

/** Pure: which badges an exercise shows, in display order. */
export function badgeList({ exerciseId, tracking }: BadgeInput): Badge[] {
  const out: Badge[] = [
    hasDemo(exerciseId) ? { kind: '3d', label: '3D demo' } : { kind: 'info', label: 'Info' },
  ];
  if (tracking === 'pose') out.push({ kind: 'camera', label: 'Camera' });
  return out;
}

/** Each badge's icon (decorative: the word is the label). */
export const BADGE_ICON: Record<BadgeKind, IconName> = {
  '3d': 'play',
  info: 'help',
  camera: 'camera',
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
