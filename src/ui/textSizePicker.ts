// M13d task 21 (SPEC M13d Goal 4, Decision "M13d answers" q4): Settings → Display → Text size.
// Standard / Large / Larger as one named group of three toggle buttons, stacked (one per row, so
// every word fits at 360 wide whatever size is on). Each option's word is drawn at that size's
// cue px (core `textScale`), so you see the size before you pick it. The chosen one is filled
// with a check and aria-pressed (never colour alone); tapping it again does nothing.
//
// The stylesheet reads html[data-text-size] (styles.css "Text size"): large / larger raise the
// word tokens (--fs-label / --fs-body / --fs-cue / --fs-lead) to core `textScale`; numbers,
// timers and the tab labels keep their size. `applyTextSize` sets it and writes the sync mirror
// index.html reads before first paint (IndexedDB 'textSize' stays the source).
import type { TextSize } from '../core/types';
import { TEXT_SIZES, isTextSize, textScale } from '../core/textSize';
import { h } from './dom';
import { icon } from './icons';
import './textSizePicker.css';

export const TEXT_SIZE_LABEL: Readonly<Record<TextSize, string>> = {
  standard: 'Standard',
  large: 'Large',
  larger: 'Larger',
};

/** The group name (the visible label above the three options). */
export const TEXT_SIZE_GROUP = 'Text size';

/** The one-line note under the choice (≤ 10 words, stays shown). */
export const TEXT_SIZE_NOTE = 'Numbers and timers keep their size.';

/** The localStorage key index.html's pre-paint script reads. */
export const TEXT_SIZE_MIRROR = 'gc-text-size';

/** A stored value (anything) → a valid size; missing or unknown → Standard. */
export function textSizeOf(stored: unknown): TextSize {
  return isTextSize(stored) ? stored : 'standard';
}

/**
 * Sets html[data-text-size] and mirrors it to localStorage for the pre-paint script. Call before
 * the first render (app start) and after every change. Storage off → the attribute still applies.
 */
export function applyTextSize(
  size: TextSize,
  root: HTMLElement = document.documentElement,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined'
    ? null
    : localStorage,
): void {
  const s = textSizeOf(size);
  root.setAttribute('data-text-size', s);
  try {
    storage?.setItem(TEXT_SIZE_MIRROR, s);
  } catch {
    // private mode / storage off: IndexedDB still holds the choice
  }
}

/** The "Text size" label, the three stacked options and the one-line note. */
export function textSizePicker(value: TextSize, onChange: (size: TextSize) => void): HTMLElement {
  const current = textSizeOf(value);
  return h(
    'div',
    { class: 'text-size-picker', 'data-text-size-picker': true },
    h('div', { class: 'text-size-label', id: 'set-text-size-label' }, TEXT_SIZE_GROUP),
    h(
      'div',
      {
        class: 'segmented text-size-options',
        role: 'group',
        'aria-labelledby': 'set-text-size-label',
      },
      ...TEXT_SIZES.map((s) => {
        const on = s === current;
        const word = h('span', { class: 'text-size-word' }, TEXT_SIZE_LABEL[s]);
        // The preview: the word at that size's cue px (from the core scale, not a CSS literal).
        word.style.fontSize = `${textScale(s).cue}px`;
        return h(
          'button',
          {
            type: 'button',
            class: on ? 'seg-btn active' : 'seg-btn',
            'aria-pressed': on ? 'true' : 'false',
            'data-text-size-option': s,
            onclick: () => {
              if (!on) onChange(s);
            },
          },
          on ? icon('check', 'sm') : null,
          word,
        );
      }),
    ),
    h('p', { class: 'muted set-note', 'data-set-note': 'display' }, TEXT_SIZE_NOTE),
  );
}
