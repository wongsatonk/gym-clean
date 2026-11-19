// M12 slice 1b task 33 (SPEC M12 trainer kit item 12): the learn-card sheet. A short "why" card
// (core data `LearnCard = { id; title; body; why? }`, ~10 of them in src/data/learnCards.ts) that
// the coach and screens link to with a "Why?" button: a coach bubble with `learnId` (chat.ts),
// the rest screen's effort row (`onEffortWhy(opener)`), the Fuel protein nudge.
//
// Props in, callbacks out: the caller passes the card itself (main looks it up by id); nothing
// here imports the card list. Shown, never spoken: it opens only on a tap, and every opener is
// between sets or off the workout (rest screen, chat, Fuel), never during a set.
//
// The sheet is a bottom sheet over a veil (role="dialog", aria-modal): title (sheet title size),
// the body (paragraphs split on blank lines, ≥ 20px), the optional `why` as a "Why it helps"
// block, and one "Got it" button (≥ 56px). Close by Got it, the veil, or Escape; Tab stays on
// the sheet's controls. On close the sheet is removed and focus goes back to the opener (when
// it is still on the page). Motion: the panel rises with `enterScreen(…, 'up')` (motion.ts:
// nothing under reduced motion), the veil fade is CSS (zeroed by the global reduced-motion rule).
//
// `openLearnCard(card, opener)` mounts it on document.body; only one is open at a time.
// `closeLearnCard()` closes it from outside (main calls it when a set starts, so a card left
// open on the rest screen never covers the Exercise screen).
//
// M13d task 19 ("some screens have too much text"): a card with a `short` lead opens on it; the
// body and the `why` block sit behind the shared "More" disclosure (../moreDisclosure.ts), and
// Tab moves between More and Got it. A card without `short` shows as before. An opener carrying
// `data-learn-hide-why` (the intake's abs Why?, whose card's `why` talks about a focus block)
// opens the card without its `why` block. Opened while a workout is on screen (the Rest screen)
// More starts open, so nothing new has to be tapped between sets (M13d review decision).
//
// M13d task 25: swipe down closes it (Got it's own path; the panel follows the finger). Never
// while a workout is on screen (sheetSwipe.ts). Closing removes the swipe with the sheet.
//
// e2e hooks: `[data-learn-sheet=<id>]` (the dialog), `[data-learn-title]`, `[data-learn-short]`,
// `[data-learn-body]`, `[data-learn-why]`, `[data-learn-close]`, `[data-learn-veil]`,
// `[data-more="learn"]` (its `[data-more-btn]`); "Why?" buttons from `whyButton(...)` carry
// `data-learn-open=<id>` (or the caller's own hook).
import type { LearnCard } from '../../core/types';
import { h } from '../dom';
import { workoutOnScreen } from '../gestures/edgeBack';
import { installSheetSwipe } from '../gestures/sheetSwipe';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import { moreDisclosure } from '../moreDisclosure';
import { enterScreen, type Stop } from '../motion';
import { moodClass } from '../tokens';
import '../chromeButtons.css';
import './learnCard.css';

export const GOT_IT = 'Got it';
export const WHY_LABEL = 'Why?';
export const WHY_HEADING = 'Why it helps';
/** On an opener: open the card without its `why` block. */
export const HIDE_WHY_ATTR = 'data-learn-hide-why';

/** The body split into paragraphs on blank lines; single newlines become spaces. Pure. */
export function bodyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** The card with this id, or null (a stale `learnId` shows no link). Pure. */
export function findLearnCard(
  cards: readonly LearnCard[],
  id: string | undefined,
): LearnCard | null {
  if (!id) return null;
  return cards.find((c) => c.id === id) ?? null;
}

export type WhyButtonOptions = {
  /** Screen-reader name, e.g. "Why? About protein". Default "Why?". */
  label?: string | undefined;
  /** Extra hook attributes (e.g. `{ 'data-nudge-why': true }`). */
  attrs?: Record<string, string | boolean> | undefined;
  /** Extra class names. */
  className?: string | undefined;
};

/**
 * The "Why?" link-style button (≥ 56px, help icon + word, underlined like the rest screen's).
 * `onWhy` gets the button itself, so the sheet can hand focus back to it on close.
 */
export function whyButton(
  onWhy: (opener: HTMLElement) => void,
  opts: WhyButtonOptions = {},
): HTMLButtonElement {
  const btn: HTMLButtonElement = h(
    'button',
    {
      type: 'button',
      class: `learn-why${opts.className ? ` ${opts.className}` : ''}`,
      'aria-label': opts.label,
      ...(opts.attrs ?? {}),
      onclick: () => onWhy(btn),
    },
    icon('help', 'sm'),
    h('span', {}, WHY_LABEL),
  );
  return btn;
}

export type LearnSheetActions = {
  /** Got it, the veil, or Escape. */
  onClose: () => void;
};

export type LearnSheetOptions = {
  /** Leave out the `why` block (the intake context). Default false. */
  hideWhy?: boolean | undefined;
};

let sheets = 0;

type Built = {
  root: HTMLElement;
  panel: HTMLElement;
  gotIt: HTMLElement;
  /** Removes the swipe-down. */
  unswipe: () => void;
};

/** The sheet element (pure render; `openLearnCard` mounts it and handles focus). */
export function learnCardSheet(
  card: LearnCard,
  a: LearnSheetActions,
  opts: LearnSheetOptions = {},
): HTMLElement {
  return buildSheet(card, a, opts).root;
}

function buildSheet(card: LearnCard, a: LearnSheetActions, opts: LearnSheetOptions = {}): Built {
  const titleId = `learn-title-${++sheets}`;
  const bodyId = `learn-body-${sheets}`;
  const shortId = `learn-short-${sheets}`;
  // M13d task 40a: Got it = the main round button on a full-width pill (the whole row taps).
  const close = iconButton({
    icon: 'check',
    label: GOT_IT,
    variant: 'main',
    wideHit: true,
    class: 'learn-close chrome-pill',
    hooks: { 'data-learn-close': true },
    onClick: () => a.onClose(),
  });
  const paras = bodyParagraphs(card.body);
  const body = h(
    'div',
    { class: 'learn-body', id: bodyId, 'data-learn-body': true },
    ...paras.map((p) => h('p', {}, p)),
  );
  const why =
    card.why && opts.hideWhy !== true
      ? h(
          'section',
          { class: 'learn-whyblock', 'data-learn-why': true, 'aria-label': WHY_HEADING },
          h('h3', { class: 'learn-why-h' }, WHY_HEADING),
          h('p', {}, card.why),
        )
      : null;
  const lead = card.short?.trim();
  // With a short lead: the lead, then the body and the why behind More.
  const more = lead
    ? moreDisclosure([body, why], { about: card.title, hook: 'learn', open: workoutOnScreen() })
    : null;
  const panel = h(
    'div',
    { class: 'learn-panel' },
    h('p', { class: 'learn-eyebrow caps' }, icon('help', 'sm'), h('span', {}, 'Coach tip')),
    h('h2', { class: 'learn-title', id: titleId, 'data-learn-title': true }, card.title),
    ...(more && lead
      ? [h('p', { class: 'learn-short', id: shortId, 'data-learn-short': true }, lead), more.el]
      : [body, why]),
    close,
  );
  const controls: HTMLElement[] = more ? [more.button, close] : [close];
  const veil = h('div', {
    class: 'learn-veil',
    'data-learn-veil': true,
    'aria-hidden': 'true',
    onclick: () => a.onClose(),
  });
  const root = h(
    'div',
    {
      class: `learn-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': titleId,
      'aria-describedby': more ? shortId : bodyId,
      'data-learn-sheet': card.id,
    },
    veil,
    panel,
  );
  // Escape closes; Tab / Shift+Tab cycle through the sheet's controls (More, Got it).
  root.addEventListener('keydown', (ev) => {
    const kev = ev as KeyboardEvent;
    if (kev.key === 'Escape') {
      kev.preventDefault();
      a.onClose();
    } else if (kev.key === 'Tab') {
      kev.preventDefault();
      const at = controls.indexOf(document.activeElement as HTMLElement);
      const step = kev.shiftKey ? -1 : 1;
      const next = at < 0 ? close : controls[(at + step + controls.length) % controls.length];
      (next ?? close).focus();
    }
  });
  // Swipe down = Got it (the panel follows the finger).
  const unswipe = installSheetSwipe(root, { close: () => close.click(), mover: panel });
  return { root, panel, gotIt: close, unswipe };
}

export type LearnCardHandle = {
  el: HTMLElement;
  /** Removes the sheet and returns focus to the opener. Safe to call more than once. */
  close: () => void;
};

export type OpenLearnCardOptions = {
  /** Where to mount (default document.body). */
  parent?: HTMLElement | undefined;
  /** Called once after the sheet closed (any way). */
  onClosed?: (() => void) | undefined;
};

let current: LearnCardHandle | null = null;

/**
 * Opens `card` as a sheet over the current screen and focuses Got it. On close, focus goes back
 * to `opener` (when it is still in the page). Opening another card replaces the open one.
 */
export function openLearnCard(
  card: LearnCard,
  opener?: HTMLElement | null,
  opts: OpenLearnCardOptions = {},
): LearnCardHandle {
  current?.close();
  let closed = false;
  let stopMotion: Stop = () => {};
  let unswipe: () => void = () => {};
  const handle: LearnCardHandle = {
    el: null as unknown as HTMLElement,
    close: () => {
      if (closed) return;
      closed = true;
      stopMotion();
      unswipe();
      const el = handle.el as Partial<HTMLElement>;
      if (typeof el.remove === 'function') el.remove();
      if (current === handle) current = null;
      if (opener && opener.isConnected !== false && typeof opener.focus === 'function') {
        opener.focus();
      }
      opts.onClosed?.();
    },
  };
  const hideWhy = typeof opener?.hasAttribute === 'function' && opener.hasAttribute(HIDE_WHY_ATTR);
  const built = buildSheet(card, { onClose: handle.close }, { hideWhy });
  handle.el = built.root;
  unswipe = built.unswipe;
  const parent = opts.parent ?? document.body;
  parent.append(built.root);
  current = handle;
  stopMotion = enterScreen(built.panel, 'up');
  built.gotIt.focus();
  return handle;
}

/** Closes the open learn card, if any (focus goes back to its opener). */
export function closeLearnCard(): void {
  current?.close();
}

/** True while a learn card is open. */
export function learnCardOpen(): boolean {
  return current !== null;
}
