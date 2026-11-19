// M13d task 19 (SPEC M13d goal 4 "Less text per screen"): the shared "More" disclosure. A screen
// shows its one short line; the rest sits in a panel behind a real button ("More" ↔ "Less").
// Used by the intake summary, Set up Fuel, Settings, the How-to sheet and learn cards.
//
// Never put a privacy promise or a safety cue behind it (SPEC: those stay visible).
//
// Accessibility (WAI-ARIA disclosure pattern): a <button> with aria-expanded and aria-controls
// pointing at the panel; the panel is `hidden` while closed (out of the reading order and of the
// readability audit's word count). The visible word is in the accessible name; `about` adds a
// screen-reader-only tail ("More about Starter plan") so several on one screen stay distinct.
// Text ≥ 20px, the button ≥ 56px tall (moreDisclosure.css). Focus stays on the button.
// Motion: the panel fades in (CSS `motion-fade`, zeroed by the global reduced-motion rule).
//
// Props in, element out: no DB, no speech (nothing here is shown during a set).
//
// e2e hooks: `[data-more]` on the wrapper (value: the caller's hook, e.g. "learn"),
// `[data-more-btn]` (aria-expanded), `[data-more-panel]`.
import { h } from './dom';
import { icon } from './icons';
import './moreDisclosure.css';

export const MORE_LABEL = 'More';
export const LESS_LABEL = 'Less';

export type MoreDisclosureOptions = {
  /** What is behind it, for screen readers: "More about <about>". */
  about?: string | undefined;
  /** The wrapper's `data-more` value (default ''). */
  hook?: string | undefined;
  /** Start open. Default false. */
  open?: boolean | undefined;
  /** Extra class names on the wrapper. */
  className?: string | undefined;
};

export type MoreDisclosure = {
  el: HTMLElement;
  button: HTMLButtonElement;
  panel: HTMLElement;
  /** Opens or closes it (as a tap would). */
  set: (open: boolean) => void;
  isOpen: () => boolean;
};

let ids = 0;

/** A "More" button and the panel it opens, holding `content` (nulls are left out). */
export function moreDisclosure(
  content: readonly (Node | null | undefined | false)[],
  opts: MoreDisclosureOptions = {},
): MoreDisclosure {
  const panelId = `more-panel-${++ids}`;
  let open = opts.open === true;
  const word = h('span', { class: 'more-word' }, open ? LESS_LABEL : MORE_LABEL);
  const button = h(
    'button',
    {
      type: 'button',
      class: 'more-btn',
      'data-more-btn': true,
      'aria-expanded': open ? 'true' : 'false',
      'aria-controls': panelId,
    },
    word,
    opts.about ? h('span', { class: 'sr-only' }, ` about ${opts.about}`) : null,
    icon('back', 'sm', { class: 'more-chev' }),
  );
  const panel = h(
    'div',
    { class: 'more-panel', id: panelId, 'data-more-panel': true, hidden: !open },
    ...content.filter((c): c is Node => Boolean(c)),
  );
  const set = (to: boolean) => {
    open = to;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    word.textContent = open ? LESS_LABEL : MORE_LABEL;
    if (open) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  };
  button.addEventListener('click', () => set(!open));
  const el = h(
    'div',
    {
      class: `more${opts.className ? ` ${opts.className}` : ''}`,
      'data-more': opts.hook ?? '',
    },
    button,
    panel,
  );
  return { el, button, panel, set, isOpen: () => open };
}
