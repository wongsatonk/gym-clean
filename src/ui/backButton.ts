// M13 task 20: one shared look for back / done / forward controls. Icons (chevron-left `back`,
// `check`, `arrow-right`) instead of typed "‹", "✓" or "→". The icon is decorative (aria-hidden);
// the visible word is the accessible name. Tap size comes from the global button rule (56px) and
// backButton.css keeps the icon and word on one line.
import { h } from './dom';
import { icon } from './icons';
import './backButton.css';

type Hooks = Record<string, string | boolean>;

/**
 * The top-bar back control: chevron + word ("Back", or where it goes, e.g. "To-dos").
 * Keeps the `ghost-btn` look the screens already had; `hooks` adds data attributes.
 */
export function backButton(onBack: () => void, label = 'Back', hooks: Hooks = {}): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'ghost-btn back-btn',
      'data-back': true,
      ...hooks,
      onclick: () => onBack(),
    },
    icon('back', 'sm'),
    h('span', { class: 'back-btn-label' }, label),
  );
}

/** Content for a forward control: the word then an arrow ("Next →" without the typed arrow). */
export function forwardContent(label: string): Node[] {
  return [h('span', {}, label), icon('arrow-right', 'sm')];
}

/** A finished mark: check + word ("✓ done" without the typed tick). Not a button. */
export function doneMark(label = 'done'): HTMLElement {
  return h(
    'span',
    { class: 'done-mark', 'data-done-mark': true },
    icon('check', 'sm'),
    h('span', {}, label),
  );
}
