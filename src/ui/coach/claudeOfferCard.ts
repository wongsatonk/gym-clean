// M13c task 6d: the "Claude could help with this" explain card (SPEC M13c goal 6, Decision
// "M13c answers": "If coach does not have information enough and need to send data to Claude Api,
// explain to user."). The chat draws it under a coach reply the phone's coach couldn't answer
// (chat.ts prop `claudeOffer`); main decides when (core `claudeOfferFor`) and saves what a tap means.
//
// What it shows: the title, the why line, "What would be sent" (every `CLAUDE_SENDS` item),
// "Never sent" (every `CLAUDE_NEVER_SENDS` item), "Your key isn't set up yet." and exactly two
// buttons, the same size: **Tell me when it's ready** (→ `onWanted`; main sets
// `coach.claudeWanted = 'yes'`) and **Not now** (→ `onDismiss`). All copy comes from core 6c; the
// only strings here are the screen-reader row prefixes. Shown, never spoken (no live region; main
// never passes it to `say`). A tap disables both buttons, so one answer is saved once.
//
// No request exists behind it in 1.16.0: this module imports only the DOM helpers, the icons and
// pure core copy (claudeOfferCard.test.ts walks its import graph). Slice 3 (1.17.0) reuses the card.
//
// e2e hooks: `[data-claude-offer]`, `[data-claude-sends]` > `[data-claude-send=<id>]`,
// `[data-claude-never]` > `[data-claude-never-item=<id>]`, `[data-claude-offer-wanted]`,
// `[data-claude-offer-dismiss]`.
import { CLAUDE_OFFER } from '../../core/trainer/claude/offer';
import {
  CLAUDE_NEVER_SENDS,
  CLAUDE_SENDS,
  type ClaudeSendItem,
} from '../../core/trainer/claude/sends';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon, type IconName } from '../icons';
import './coach.css';
import './coachButtons.css';

export type ClaudeOfferCardActions = {
  /** "Tell me when it's ready": main saves `coach.claudeWanted = 'yes'` (+ the shown date). */
  onWanted: () => void;
  /** "Not now": main saves `claudeOfferShown(today)` and drops the card. */
  onDismiss: () => void;
};

/** Screen-reader prefixes, so each row says which list it is in (the lists aren't colour-coded). */
export const CLAUDE_CARD_SR = Object.freeze({
  send: 'Would be sent: ',
  never: 'Never sent: ',
});

let seq = 0;

function section(
  head: string,
  headIcon: IconName,
  items: readonly ClaudeSendItem[],
  kind: 'sends' | 'never',
): HTMLElement[] {
  const id = `co-head-${kind}-${++seq}`;
  const rowHook = kind === 'sends' ? 'data-claude-send' : 'data-claude-never-item';
  const sr = kind === 'sends' ? CLAUDE_CARD_SR.send : CLAUDE_CARD_SR.never;
  return [
    h('h4', { class: `co-head co-head-${kind}`, id }, icon(headIcon, 'sm'), h('span', {}, head)),
    h(
      'ul',
      {
        class: `co-list co-list-${kind}`,
        'aria-labelledby': id,
        [kind === 'sends' ? 'data-claude-sends' : 'data-claude-never']: true,
      },
      ...items.map((item) =>
        h(
          'li',
          { class: 'co-item', [rowHook]: item.id },
          h('span', { class: 'sr-only' }, sr),
          h('span', {}, item.label),
        ),
      ),
    ),
  ];
}

/** The card and its two buttons (`controls`, for a focus cycle). */
export function buildClaudeOfferCard(a: ClaudeOfferCardActions): {
  el: HTMLElement;
  controls: HTMLElement[];
} {
  const titleId = `co-title-${++seq}`;
  let answered = false;
  const answer = (cb: () => void) => () => {
    if (answered) return;
    answered = true;
    for (const b of buttons) b.setAttribute('disabled', '');
    cb();
  };
  // M13d task 40f: two secondary round buttons of the same size side by side (equal weight for a
  // consent choice: neither is the orange main action), each word under its circle.
  const wanted = iconButton({
    icon: 'clock',
    label: CLAUDE_OFFER.wanted,
    class: 'co-choice co-wanted',
    hooks: { 'data-claude-offer-wanted': true },
    onClick: answer(a.onWanted),
  });
  const dismiss = iconButton({
    icon: 'close',
    label: CLAUDE_OFFER.dismiss,
    class: 'co-choice co-dismiss',
    hooks: { 'data-claude-offer-dismiss': true },
    onClick: answer(a.onDismiss),
  });
  const buttons = [wanted, dismiss];

  const el = h(
    'section',
    { class: 'co-card', 'aria-labelledby': titleId, 'data-claude-offer': true },
    h(
      'h3',
      { class: 'co-title', id: titleId },
      icon('spark', 'sm'),
      h('span', {}, CLAUDE_OFFER.title),
    ),
    h('p', { class: 'co-why' }, CLAUDE_OFFER.why),
    ...section(CLAUDE_OFFER.sendsHead, 'chat', CLAUDE_SENDS, 'sends'),
    ...section(CLAUDE_OFFER.neverHead, 'lock', CLAUDE_NEVER_SENDS, 'never'),
    h('p', { class: 'co-key' }, icon('help', 'sm'), h('span', {}, CLAUDE_OFFER.keyNote)),
    h('div', { class: 'co-actions co-choices' }, wanted, dismiss),
  );
  return { el, controls: buttons };
}
