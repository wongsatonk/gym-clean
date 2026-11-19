// M13 task 20: one shared look for back / done / forward controls. Icons (chevron-left `back`,
// `check`, `arrow-right`) instead of typed "‹", "✓" or "→". The icon is decorative (aria-hidden);
// the visible word is the accessible name.
//
// M13d task 40a (SPEC M13d Goal 7): Back is the shared round icon button: a 56px circle with the
// chevron and the word beside it (secondary look). The whole button (circle + word) is the tap
// area, ≥ 56px both ways; backButton.css keeps the word on one line.
import { h } from './dom';
import { iconButton } from './iconButton';
import { icon } from './icons';
import './backButton.css';

type Hooks = Record<string, string | boolean>;

/**
 * The top-bar back control: chevron + word ("Back", or where it goes, e.g. "To-dos").
 * `hooks` adds data attributes (`.back-btn` and `[data-back]` stay the hooks e2e use).
 * M13d task 24: it is the screen's edge-swipe Back (`data-swipe-back`, gestures/edgeBack.ts)
 * unless `hooks` says `'data-swipe-back': false` (a screen whose step Back takes the swipe).
 */
export function backButton(onBack: () => void, label = 'Back', hooks: Hooks = {}): HTMLElement {
  return iconButton({
    icon: 'back',
    label,
    labelAt: 'beside',
    class: 'back-btn',
    hooks: { 'data-back': true, 'data-swipe-back': true, ...hooks },
    onClick: () => onBack(),
  });
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
