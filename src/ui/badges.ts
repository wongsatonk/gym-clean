// M4b exercise badges: "3D demo" when an animated demo exists, "Info" otherwise, plus "Camera" for
// pose-tracked exercises, plus M4f "Learning" when that camera rule is still learning. Computed
// from data (hasDemo, tracking, the rule status), never from a hard-coded list.
// M13c goal 4: with an `onBadge` callback (day preview rows, the Library, exercise detail — all
// outside a workout) each badge is a button: the same pill inside a ≥ 56px tall transparent hit
// box, labelled "3D demo for Goblet Squat", hook `[data-badge-open=<kind>]`. Without it (Exercise
// screen, How-to sheet, camera view) they stay static spans: nothing new is reachable mid-set.

import type { PlannedExercise } from '../core/types';
import { ruleStatus as coreRuleStatus, type RuleStatus } from '../core/exercises';
import { exerciseName } from '../data/catalog';
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

/** M13c: what a tapped badge opens is the caller's; it gets the button back for focus return. */
export type OnBadge = (kind: BadgeKind, opener: HTMLElement) => void;

export type BadgesForInput = BadgeInput & {
  /** Display name for the buttons' labels; omitted = `exerciseName(exerciseId)`. */
  name?: string | undefined;
  /** M13c: makes each badge a button. Omit it on every in-workout surface. */
  onBadge?: OnBadge | undefined;
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
 * The screen-reader name of a badge button: "3D demo for Goblet Squat". Starts with the visible
 * word (label in name). Pure.
 */
export function badgeButtonLabel(kind: BadgeKind, name: string): string {
  switch (kind) {
    case '3d':
      return `3D demo for ${name}`;
    case 'info':
      return `Info for ${name}`;
    case 'camera':
      return `Camera set-up for ${name}`;
    case 'learning':
      return `Learning: what it means for ${name}`;
  }
}

function pill(b: Badge, attrs: Record<string, string>): HTMLElement {
  return h(
    'span',
    { class: `ex-badge ex-badge-${b.kind}`, ...attrs },
    icon(BADGE_ICON[b.kind], 'sm'),
    h('span', {}, b.label),
  );
}

/**
 * A row of small pills (icon + word) on a neutral surface; place it in a list row or a header.
 * Not coloured: they describe the exercise. Static spans unless `onBadge` is given (outside a
 * workout only), then each is a button with the same pill look.
 */
export function badgesFor(input: BadgesForInput): HTMLElement {
  const { onBadge } = input;
  const list = badgeList(input);
  if (!onBadge) {
    return h(
      'span',
      { class: 'ex-badges', 'data-badges': input.exerciseId },
      ...list.map((b) => pill(b, { 'data-badge': b.kind })),
    );
  }
  const name = input.name ?? exerciseName(input.exerciseId);
  return h(
    'span',
    { class: 'ex-badges ex-badges-tap', 'data-badges': input.exerciseId },
    ...list.map((b) => {
      const btn: HTMLButtonElement = h(
        'button',
        {
          type: 'button',
          class: 'ex-badge-btn',
          'aria-label': badgeButtonLabel(b.kind, name),
          'data-badge-open': b.kind,
          onclick: () => onBadge(b.kind, btn),
        },
        pill(b, { 'data-badge': b.kind, 'aria-hidden': 'true' }),
      );
      return btn;
    }),
  );
}
