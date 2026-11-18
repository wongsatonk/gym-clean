// M13c task 9 (his q1 answer): Settings → Accent colour → "Background: Moving glow / Plain".
// Moving glow = the slow accent glow behind the non-workout screens (styles.css "Moving glow");
// Plain = the flat #0d0f12 look of 1.15, nothing animates. In-workout screens are never touched.
// Pure render: value and callback in, element out. The caller saves settings 'background', then
// calls applyBackground (which the stylesheet reads as html[data-background]) and re-renders.
//
// The option hook is `data-background-option`, never `data-background`: that attribute on <html>
// is the switch the stylesheet reads.
import type { BackgroundStyle } from '../core/types';
import { h } from './dom';
import { icon } from './icons';

export type BackgroundOption = { value: BackgroundStyle; label: string };

/** In display order: the default first. */
export const BACKGROUND_OPTIONS: readonly BackgroundOption[] = [
  { value: 'glow', label: 'Moving glow' },
  { value: 'plain', label: 'Plain' },
];

export const BACKGROUND_NOTE = 'The glow drifts slowly. It stays still during a workout.';

const DEFAULT_BACKGROUND: BackgroundStyle = 'glow';

/** A stored setting (anything) → a valid style; missing or unknown → Moving glow. */
export function backgroundStyle(stored: unknown): BackgroundStyle {
  return stored === 'plain' || stored === 'glow' ? stored : DEFAULT_BACKGROUND;
}

/** Sets html[data-background]. Call before first paint (main.ts) and after every change. */
export function applyBackground(
  style: BackgroundStyle,
  root: HTMLElement = document.documentElement,
): void {
  root.setAttribute('data-background', backgroundStyle(style));
}

/**
 * The "Background" label, two toggle buttons (`aria-pressed`, white fill + check on the chosen
 * one, so it never rests on colour alone) and a one-line note. Tapping the chosen one does
 * nothing; the other calls `onChange`.
 */
export function backgroundPicker(
  value: BackgroundStyle,
  onChange: (style: BackgroundStyle) => void,
): HTMLElement {
  const current = backgroundStyle(value);
  return h(
    'div',
    { class: 'bg-picker', 'data-background-picker': true },
    h('p', { class: 'bg-picker-label', id: 'set-background-label' }, 'Background'),
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-labelledby': 'set-background-label' },
      ...BACKGROUND_OPTIONS.map((o) => {
        const on = o.value === current;
        return h(
          'button',
          {
            type: 'button',
            class: on ? 'seg-btn active' : 'seg-btn',
            'aria-pressed': on ? 'true' : 'false',
            'data-background-option': o.value,
            onclick: () => {
              if (!on) onChange(o.value);
            },
          },
          on ? icon('check', 'sm') : null,
          h('span', {}, o.label),
        );
      }),
    ),
    h('p', { class: 'muted set-note' }, BACKGROUND_NOTE),
  );
}
