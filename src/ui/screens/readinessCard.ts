// M11 task 10: the "Lighter today?" card on Today (SPEC M11 "Lighter today?", "Deload nudge").
// Pure render: core's `ReadinessCard` (src/core/health/readiness.ts) and callbacks in. Same card
// as the M10e missing-kit prompt (./gymPrompt.ts): amber edge, text, then the buttons.
//
// Shown, never spoken (he's holding the phone on Today, M10 rule 5): this module imports no
// voice. Today only: the Exercise and camera screens never import it (tested).
// Nothing changes until he taps: Lighter today / Deload week open the M10 proposal (Apply / Undo
// there), Not today opens the M10 postpone proposal, Train as planned hides it for today.
//
// The reasons are core's strings, shown as-is (core writes them, including the deload line, and
// checks them with checkHealthCopy); the card adds only its fixed words and core's CARD_TITLE.
//
// e2e hooks: `[data-readiness="lighter"|"deload"]`, `[data-readiness-reason]` per reason,
// `[data-readiness-lighter]`, `[data-readiness-deload]`, `[data-readiness-postpone]`,
// `[data-readiness-keep]`.
import { CARD_TITLE } from '../../core/health/copy';
import type { ReadinessCard } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import './readinessCard.css';

export type ReadinessActions = {
  /** Lighter today: open the M10 `proposeLighter` proposal. */
  onLighterToday?: (() => void) | undefined;
  /** Deload week (offer 'deload'): open the M10 `proposeDeload` proposal. */
  onDeloadWeek?: (() => void) | undefined;
  /** Not today: open the M10 `proposePostpone` proposal. */
  onNotToday?: (() => void) | undefined;
  /** Train as planned: hide the card for today. */
  onTrainAsPlanned?: (() => void) | undefined;
};

export const READINESS_COPY = {
  lighter: { title: CARD_TITLE.lighter, cta: 'Lighter today' },
  deload: { title: CARD_TITLE.deload, cta: 'Deload week' },
  notToday: 'Not today',
  keep: 'Train as planned',
} as const;

/** Every fixed string the card can show (for the copy test). */
export function readinessFixedCopy(): string[] {
  const c = READINESS_COPY;
  return [c.lighter.title, c.lighter.cta, c.deload.title, c.deload.cta, c.notToday, c.keep];
}

/** The card, or null with no card / no reasons, or when a needed callback isn't wired. */
export function readinessCard(
  card: ReadinessCard | null | undefined,
  actions: ReadinessActions,
): HTMLElement | null {
  if (!card || card.reasons.length === 0) return null;
  const { onNotToday, onTrainAsPlanned } = actions;
  const deload = card.offer === 'deload';
  const onMain = deload ? actions.onDeloadWeek : actions.onLighterToday;
  if (!onMain || !onNotToday || !onTrainAsPlanned) return null;
  const copy = deload ? READINESS_COPY.deload : READINESS_COPY.lighter;
  return h(
    'section',
    {
      class: 'readiness-card',
      'data-readiness': card.offer,
      role: 'status',
      'aria-labelledby': 'readiness-title',
    },
    h(
      'h2',
      { class: 'readiness-title', id: 'readiness-title' },
      icon('pause', 'sm'),
      h('span', {}, copy.title),
    ),
    h(
      'ul',
      { class: 'readiness-reasons' },
      ...card.reasons.map((r) => h('li', { 'data-readiness-reason': true }, r)),
    ),
    h(
      'div',
      { class: 'readiness-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'readiness-btn readiness-cta',
          [deload ? 'data-readiness-deload' : 'data-readiness-lighter']: true,
          onclick: () => onMain(),
        },
        copy.cta,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'readiness-btn',
          'data-readiness-postpone': true,
          onclick: () => onNotToday(),
        },
        READINESS_COPY.notToday,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'readiness-btn',
          'data-readiness-keep': true,
          onclick: () => onTrainAsPlanned(),
        },
        READINESS_COPY.keep,
      ),
    ),
  );
}
