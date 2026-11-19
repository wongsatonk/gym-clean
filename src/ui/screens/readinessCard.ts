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
// M12 1b task 31: when "sore" is one of the card's signals (he said so in "How do you feel
// today?"), the card also offers core's "Go easy on shoulders today?" per sore area (`offers`,
// from `todaysFeelOffers`); a tap opens today's M10 avoid-area proposal through `onEasyOn`.
// That is all soreness ever leads to.
//
// e2e hooks: `[data-readiness="lighter"|"deload"]`, `[data-readiness-reason]` per reason,
// `[data-readiness-lighter]`, `[data-readiness-deload]`, `[data-readiness-postpone]`,
// `[data-readiness-keep]`, `[data-easy-on=<area>]`.
import { CARD_TITLE } from '../../core/health/copy';
import type { FeelOffer } from '../../core/health/readiness';
import type { BodyArea, ReadinessCard } from '../../core/types';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { iconButton } from '../iconButton';
import { easyOnOffers } from './feelToday';
import './mainPill.css';
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
  /** M12 1b: "Go easy on <area> today?": open today's M10 avoid-area proposal for that area. */
  onEasyOn?: ((area: BodyArea) => void) | undefined;
};

/** True when the card shows the "Go easy on … today?" offers (a sore area is a reason). */
export function cardShowsEasyOn(
  card: ReadinessCard | null | undefined,
  offers: readonly FeelOffer[] | undefined,
  onEasyOn: ((area: BodyArea) => void) | undefined,
): boolean {
  return !!card?.signals.includes('sore') && !!offers?.length && !!onEasyOn;
}

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

/**
 * M13d task 40c: one of the card's choices, a round iconButton with its word beside it on a
 * full-width row (the choices stack, as the bars did; "Go easy on …" rows sit between them).
 */
function cardAct(
  ic: IconName,
  label: string,
  cls: string,
  hooks: Record<string, boolean>,
  onClick: () => void,
): HTMLButtonElement {
  return iconButton({
    icon: ic,
    label,
    labelAt: 'beside',
    wideHit: true,
    class: ['readiness-act', cls].filter(Boolean).join(' '),
    hooks,
    onClick: () => onClick(),
  });
}

/** The card, or null with no card / no reasons, or when a needed callback isn't wired. */
export function readinessCard(
  card: ReadinessCard | null | undefined,
  actions: ReadinessActions,
  offers?: readonly FeelOffer[] | undefined,
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
      cardAct(
        'minus',
        copy.cta,
        'readiness-cta card-cta',
        {
          [deload ? 'data-readiness-deload' : 'data-readiness-lighter']: true,
        },
        onMain,
      ),
      cardShowsEasyOn(card, offers, actions.onEasyOn)
        ? easyOnOffers(offers, actions.onEasyOn, 'readiness-btn readiness-easy')
        : null,
      cardAct(
        'calendar',
        READINESS_COPY.notToday,
        '',
        { 'data-readiness-postpone': true },
        onNotToday,
      ),
      cardAct('check', READINESS_COPY.keep, '', { 'data-readiness-keep': true }, onTrainAsPlanned),
    ),
  );
}
