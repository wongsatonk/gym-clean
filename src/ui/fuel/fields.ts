// M7 Fuel form pieces shared by Setup, Settings → Nutrition and the Weigh-in screen
// (src/ui/fuel/fuelForms.css). Each keeps its own value and calls back on every change, so the
// caller can either re-render or read the value at Save.
//
// - numberField: label, [−] value [+]. The value is a text box with a decimal keypad, so a
//   number far from the start can be typed instead of tapped. The value is ≥ 64px (main number),
//   the − / + buttons are ≥ 72px. Typed values are clamped and snapped to the step on change.
// - choiceGroup: a row (or list) of buttons where one is chosen: white fill + check, aria-pressed.
import { h } from '../dom';
import { icon } from '../icons';
import './fuelForms.css';

/** Clamp to [min, max] and round to the step's decimals (0.1 → 1 decimal). Pure. */
export function clampStep(value: number, min: number, max: number, step: number): number {
  const decimals = decimalsOf(step);
  const snapped = Math.round(value / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  return Number(clamped.toFixed(decimals));
}

/** How many decimals a step has (1 → 0, 0.1 → 1, 0.25 → 2). Pure. */
export function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/** Reads a typed number; accepts a comma decimal ("72,4"). NaN when it isn't one. Pure. */
export function parseTyped(raw: string): number {
  const t = raw.trim().replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

export type NumberFieldOpts = {
  /** Unique within the page; also the `data-field` hook. */
  id: string;
  label: string;
  /** Shown after the value ("cm", "kg", "kcal"). */
  unit?: string | undefined;
  value: number;
  step: number;
  min: number;
  max: number;
  /** Called with the clamped value after every − / + tap or typed change. */
  onChange: (value: number) => void;
};

export type NumberField = { el: HTMLElement; get: () => number; controls: HTMLElement[] };

export function numberField(o: NumberFieldOpts): NumberField {
  const decimals = decimalsOf(o.step);
  let value = clampStep(o.value, o.min, o.max, o.step);
  const show = (v: number) => v.toFixed(decimals);

  const input = h('input', {
    type: 'text',
    id: `nf-${o.id}`,
    class: 'nf-value',
    inputmode: decimals > 0 ? 'decimal' : 'numeric',
    autocomplete: 'off',
    'aria-describedby': o.unit ? `nf-${o.id}-unit` : undefined,
  });
  input.value = show(value);

  const minus = h(
    'button',
    { type: 'button', class: 'nf-step', 'data-step': 'down', 'aria-label': `Less ${o.label}` },
    icon('minus', 'lg'),
  );
  const plus = h(
    'button',
    { type: 'button', class: 'nf-step', 'data-step': 'up', 'aria-label': `More ${o.label}` },
    icon('plus', 'lg'),
  );

  const set = (next: number) => {
    value = clampStep(next, o.min, o.max, o.step);
    input.value = show(value);
    sync();
    o.onChange(value);
  };
  const sync = () => {
    if (value <= o.min) minus.setAttribute('disabled', '');
    else minus.removeAttribute('disabled');
    if (value >= o.max) plus.setAttribute('disabled', '');
    else plus.removeAttribute('disabled');
  };
  minus.addEventListener('click', () => set(value - o.step));
  plus.addEventListener('click', () => set(value + o.step));
  input.addEventListener('change', () => {
    const typed = parseTyped(String(input.value ?? ''));
    if (Number.isNaN(typed)) input.value = show(value);
    else set(typed);
  });
  sync();

  const el = h(
    'div',
    { class: 'nf', 'data-field': o.id },
    h('label', { class: 'nf-label', for: `nf-${o.id}` }, o.label),
    h(
      'div',
      { class: 'nf-row' },
      minus,
      h(
        'span',
        { class: 'nf-mid' },
        input,
        o.unit ? h('span', { class: 'nf-unit', id: `nf-${o.id}-unit` }, o.unit) : null,
      ),
      plus,
    ),
  );
  return { el, get: () => value, controls: [minus, input, plus] };
}

export type Choice<T extends string> = { value: T; label: string; note?: string | undefined };

/**
 * One-of-many buttons. `layout: 'row'` for short labels (Male / Female, Quick / Full), 'list'
 * for labels with a note under them (activity levels). The chosen button is updated in place.
 */
export function choiceGroup<T extends string>(o: {
  id: string;
  label: string;
  options: readonly Choice<T>[];
  selected: T | null;
  layout: 'row' | 'list';
  onPick: (value: T) => void;
}): HTMLElement {
  const buttons: HTMLElement[] = [];
  const mark = (picked: T | null) => {
    o.options.forEach((opt, i) => {
      const b = buttons[i];
      if (!b) return;
      const on = opt.value === picked;
      b.setAttribute('class', on ? 'choice on' : 'choice');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  };
  for (const opt of o.options) {
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'choice',
          'data-choice': opt.value,
          onclick: () => {
            mark(opt.value);
            o.onPick(opt.value);
          },
        },
        h('span', { class: 'choice-check', 'aria-hidden': 'true' }, icon('check', 'sm')),
        h(
          'span',
          { class: 'choice-txt' },
          h('span', { class: 'choice-label' }, opt.label),
          opt.note ? h('span', { class: 'choice-note' }, opt.note) : null,
        ),
      ),
    );
  }
  mark(o.selected);
  return h(
    'div',
    { class: 'choice-field', 'data-field': o.id },
    h('span', { class: 'nf-label', id: `cg-${o.id}` }, o.label),
    h(
      'div',
      {
        class: `choices choices-${o.layout}`,
        role: 'group',
        'aria-labelledby': `cg-${o.id}`,
      },
      ...buttons,
    ),
  );
}
