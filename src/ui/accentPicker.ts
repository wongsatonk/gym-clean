// M4e A17 accent picker (Settings, docs/design/m4e-mix/settings.png): Orange / Volt / Yellow.
// Each option is a swatch plus its name; the chosen one is a white fill with dark text and a
// check in its swatch (selected/on states are never the action colour, mix README), so the
// choice never rests on colour alone. Pure render: value and callback in, element out.
//
// The option hook is `data-accent-option`, NOT `data-accent`: `[data-accent='volt']` is the
// token block that swaps --cta, and on a button it would repaint that button.
import type { Accent } from '../core/types';
import { h } from './dom';
import { icon } from './icons';

export type AccentOption = { accent: Accent; label: string };

/** In display order. Same order as tokens.ts ACCENTS. */
export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { accent: 'orange', label: 'Orange' },
  { accent: 'volt', label: 'Volt' },
  { accent: 'yellow', label: 'Yellow' },
];

/**
 * A group of three toggle buttons (`aria-pressed`). Tapping the chosen one does nothing;
 * another calls `onChange` (the caller saves it, applies it and re-renders).
 */
export function accentPicker(value: Accent, onChange: (accent: Accent) => void): HTMLElement {
  return h(
    'div',
    {
      class: 'accent-picker',
      role: 'group',
      'aria-label': 'Accent colour',
      'data-accent-picker': true,
    },
    ...ACCENT_OPTIONS.map((o) => {
      const on = o.accent === value;
      return h(
        'button',
        {
          type: 'button',
          class: on ? 'accent-opt on' : 'accent-opt',
          'aria-pressed': on ? 'true' : 'false',
          'data-accent-option': o.accent,
          onclick: () => {
            if (!on) onChange(o.accent);
          },
        },
        h(
          'span',
          { class: `accent-swatch accent-swatch-${o.accent}`, 'aria-hidden': 'true' },
          on ? icon('check', 'sm', { class: 'accent-check' }) : null,
        ),
        h('span', { class: 'accent-name' }, o.label),
      );
    }),
  );
}
