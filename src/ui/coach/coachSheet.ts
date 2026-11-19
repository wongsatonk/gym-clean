// M10 Coach sheet (SPEC M10 "Coach chat", PROGRESS M10 task 13). A bottom sheet in the Pro mood:
// a message list, proposal / red-flag cards inside it, quick-action chips (≥ 56px, icon + words),
// area chips after "Go easy on…", an optional text box (`allowTyping`; never offered mid-set: the
// caller only passes it from Today, the preview and the Pause sheet), and the privacy line.
// Props in, callbacks out: no DB, no core calls. The app re-renders the sheet with new props.
//
// Replies are shown, not spoken, here (SPEC M10 "Voice"): the phone is in his hand. Spoken
// confirmations mid-workout are the app's job (task 16).
//
// Focus trap and Escape follow the Pause sheet: Escape closes; Tab / Shift+Tab cycle the sheet's
// controls in order; the page behind is made inert by the app.
//
// e2e hooks: dialog named "Coach", `data-coach-chip=<id>`, `data-coach-area=<area>`,
// `data-coach-followup=<index>` (follow-up options, task 16), the text box
// labelled "Ask the coach" with button "Send", button "Close".
import type { BodyArea, FoodSuggestion, Proposal } from '../../core/types';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { installSheetSwipe } from '../gestures/sheetSwipe';
import { moodClass } from '../tokens';
import { buildFoodCard } from './foodCard';
import { buildProposalCard, buildRedFlagCard } from './proposalCard';
import './coach.css';

export type CoachChipId = 'notToday' | 'easyOn' | 'lighter' | 'swap' | 'adjustPlan' | 'food';

export type ChipDef = { id: CoachChipId; label: string; icon: IconName };

/** Quick actions in SPEC order. Every chip has a visible label; the icon is decorative. */
export const COACH_CHIPS: readonly ChipDef[] = [
  { id: 'notToday', label: 'Not today', icon: 'calendar' },
  { id: 'easyOn', label: 'Go easy on…', icon: 'pause' },
  { id: 'lighter', label: 'Lighter today', icon: 'minus' },
  { id: 'swap', label: 'Swap an exercise', icon: 'flip' },
  { id: 'adjustPlan', label: 'Adjust my plan', icon: 'sliders' },
  { id: 'food', label: 'What should I eat?', icon: 'flame' },
];

export const AREA_CHIPS: readonly { area: BodyArea; label: string }[] = [
  { area: 'arms', label: 'Arms' },
  { area: 'shoulders', label: 'Shoulders' },
  { area: 'chest', label: 'Chest' },
  { area: 'back', label: 'Back' },
  { area: 'legs', label: 'Legs' },
  { area: 'core', label: 'Core' },
];

export const PRIVACY_LINE = 'Stays on this phone.';

export type CoachItem =
  | { kind: 'coach'; text: string }
  | { kind: 'user'; text: string }
  | { kind: 'proposal'; proposal: Pick<Proposal, 'title' | 'lines' | 'why'> }
  /** The fixed red-flag line (from core). While one is shown, no chips or text box are offered. */
  | { kind: 'redFlag'; text: string };

export type CoachSheetProps = {
  items: readonly CoachItem[];
  /** Show the area chips (after "Go easy on…"). */
  showAreas?: boolean | undefined;
  /** Free text box. Only from Today, the preview and the Pause sheet; never during a set. */
  allowTyping?: boolean | undefined;
  /** Hide chips that don't apply here (e.g. 'notToday' mid-workout). Default: all. */
  chips?: readonly CoachChipId[] | undefined;
  /** A workout is running: the red-flag card offers End workout. */
  inWorkout?: boolean | undefined;
  /**
   * Follow-up options from the coach ("Try Hammer Curls", "Push the week instead", an exercise
   * to swap). Shown under the list, also next to a waiting proposal (they're alternatives to
   * it), never while a red flag is up.
   */
  followUps?: readonly { label: string }[] | undefined;
  /**
   * M7 F2: food ideas from core `suggestFood` ("What should I eat?"), drawn as a card after the
   * messages with a Log button per row. `logged` = row indexes already logged. Needs `onLogFood`;
   * never shown while a red flag is up. Omitted → the sheet is unchanged.
   */
  food?: { suggestions: readonly FoodSuggestion[]; logged?: readonly number[] } | undefined;
};

export type CoachSheetActions = {
  onClose: () => void;
  onChip: (id: CoachChipId) => void;
  onArea: (area: BodyArea) => void;
  onText?: ((text: string) => void) | undefined;
  /** Apply / Not now on the proposal at `index` in `items`. */
  onApply: (index: number) => void;
  onDismiss: (index: number) => void;
  onEndWorkout?: (() => void) | undefined;
  /** A follow-up option at `index` in `followUps`. */
  onFollowUp?: ((index: number) => void) | undefined;
  /** M7 F2: Log on the food card row at `index` in `food.suggestions`. */
  onLogFood?: ((index: number) => void) | undefined;
};

/**
 * Pure: which chips to draw. Red flag → none (SPEC: only End workout / Not today). A proposal
 * waiting for Apply / Not now → none, so Apply stays on screen at 390×844; Not now brings them back.
 */
export function visibleChips(p: Pick<CoachSheetProps, 'items' | 'chips'>): ChipDef[] {
  if (hasRedFlag(p.items) || awaitingAnswer(p.items)) return [];
  const allow = p.chips ? new Set(p.chips) : null;
  return COACH_CHIPS.filter((c) => !allow || allow.has(c.id));
}

export function hasRedFlag(items: readonly CoachItem[]): boolean {
  return items.some((i) => i.kind === 'redFlag');
}

/** The newest item is a proposal: the sheet waits for Apply / Not now. */
export function awaitingAnswer(items: readonly CoachItem[]): boolean {
  return items[items.length - 1]?.kind === 'proposal';
}

/** Pure: the trimmed text to send, or null for nothing worth sending. */
export function textToSend(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, 200) : null;
}

function bubble(item: { kind: 'coach' | 'user'; text: string }): HTMLElement {
  return h(
    'li',
    { class: `cs-msg cs-msg-${item.kind}` },
    h('span', { class: 'sr-only' }, item.kind === 'coach' ? 'Coach: ' : 'You: '),
    item.text,
  );
}

export function coachSheet(p: CoachSheetProps, a: CoachSheetActions): HTMLElement {
  const cycle: HTMLElement[] = [];

  const close = h(
    'button',
    { type: 'button', class: 'cs-btn cs-close', onclick: a.onClose },
    icon('close', 'md'),
    h('span', {}, 'Close'),
  );
  cycle.push(close);

  const red = hasRedFlag(p.items);
  const quiet = red || awaitingAnswer(p.items);
  const list = h('ol', { class: 'cs-list', role: 'log', 'aria-live': 'polite' });
  p.items.forEach((item, index) => {
    if (item.kind === 'coach' || item.kind === 'user') {
      list.append(bubble(item));
      return;
    }
    const built =
      item.kind === 'proposal'
        ? buildProposalCard(item.proposal, {
            onApply: () => a.onApply(index),
            onDismiss: () => a.onDismiss(index),
          })
        : buildRedFlagCard(item.text, {
            onEndWorkout: p.inWorkout ? a.onEndWorkout : undefined,
            onNotToday: () => a.onChip('notToday'),
          });
    list.append(h('li', { class: 'cs-card-item' }, built.el));
    cycle.push(...built.controls);
  });
  if (p.food && p.food.suggestions.length && a.onLogFood && !red) {
    const onLogFood = a.onLogFood;
    const built = buildFoodCard(p.food.suggestions, { onLog: onLogFood }, p.food.logged);
    list.append(h('li', { class: 'cs-card-item' }, built.el));
    cycle.push(...built.controls);
  }

  const chips = visibleChips(p).map((c) => {
    const pressed = c.id === 'easyOn' && p.showAreas === true;
    return h(
      'button',
      {
        type: 'button',
        class: 'cs-chip',
        'data-coach-chip': c.id,
        'aria-expanded': c.id === 'easyOn' ? String(pressed) : undefined,
        onclick: () => a.onChip(c.id),
      },
      icon(c.icon, 'sm'),
      h('span', {}, c.label),
    );
  });
  const followUps =
    !red && a.onFollowUp
      ? (p.followUps ?? []).map((f, index) =>
          h(
            'button',
            {
              type: 'button',
              class: 'cs-chip cs-followup',
              'data-coach-followup': index,
              onclick: () => a.onFollowUp?.(index),
            },
            h('span', {}, f.label),
          ),
        )
      : [];
  // Tab order follows the layout: follow-ups sit above the quick chips.
  cycle.push(...followUps, ...chips);

  const areas =
    p.showAreas && !quiet
      ? AREA_CHIPS.map((c) =>
          h(
            'button',
            {
              type: 'button',
              class: 'cs-chip cs-area',
              'data-coach-area': c.area,
              onclick: () => a.onArea(c.area),
            },
            c.label,
          ),
        )
      : [];
  cycle.push(...areas);

  let typing: HTMLElement | null = null;
  if (p.allowTyping && a.onText && !quiet) {
    const onText = a.onText;
    const input = h('input', {
      type: 'text',
      id: 'cs-input',
      class: 'cs-input',
      enterkeyhint: 'send',
      autocomplete: 'off',
      maxlength: 200,
    });
    const send = () => {
      const t = textToSend(input.value ?? '');
      if (t) onText(t);
    };
    input.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Enter') {
        ev.preventDefault();
        send();
      }
    });
    const sendBtn = h(
      'button',
      { type: 'button', class: 'cs-btn cs-send', onclick: send },
      h('span', {}, 'Send'),
    );
    typing = h(
      'div',
      { class: 'cs-typing' },
      h('label', { class: 'cs-label', for: 'cs-input' }, 'Ask the coach'),
      h('div', { class: 'cs-typing-row' }, input, sendBtn),
    );
    cycle.push(input, sendBtn);
  }

  const scroll = h('div', { class: 'cs-scroll' }, list);
  // Newest message in view once the caller has mounted the sheet (chat convention).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      scroll.scrollTop = scroll.scrollHeight;
    });
  }

  const panel = h(
    'div',
    { class: 'cs-panel' },
    h('div', { class: 'cs-head' }, h('h2', { class: 'cs-title' }, 'Coach'), close),
    scroll,
    followUps.length
      ? h(
          'div',
          { class: 'cs-chips cs-followups', role: 'group', 'aria-label': 'Options' },
          ...followUps,
        )
      : null,
    chips.length
      ? h('div', { class: 'cs-chips', role: 'group', 'aria-label': 'Quick actions' }, ...chips)
      : null,
    areas.length
      ? h(
          'div',
          { class: 'cs-chips cs-areas', role: 'group', 'aria-label': 'Go easy on' },
          ...areas,
        )
      : null,
    typing,
    h('p', { class: 'cs-privacy' }, icon('lock', 'sm'), h('span', {}, PRIVACY_LINE)),
  );

  const sheet = h(
    'div',
    {
      class: `overlay coach-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Coach',
      tabindex: '-1',
      'data-coach-sheet': true,
    },
    panel,
  );
  // M13d task 25: swipe down = Close (the panel follows; a scrolled message list scrolls first).
  installSheetSwipe(sheet, { close: () => close.click(), mover: panel });

  sheet.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Escape') {
      kev.preventDefault();
      a.onClose();
      return;
    }
    if (kev.key !== 'Tab') return;
    kev.preventDefault();
    const at = cycle.indexOf(document.activeElement as HTMLElement);
    const n = cycle.length;
    const next = at < 0 ? (kev.shiftKey ? n - 1 : 0) : (at + (kev.shiftKey ? n - 1 : 1)) % n;
    cycle[next]?.focus();
  });
  return sheet;
}
