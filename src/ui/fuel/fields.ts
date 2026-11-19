// M7 Fuel form pieces shared by Setup, Settings → Nutrition and the Weigh-in screen
// (src/ui/fuel/fuelForms.css). Each keeps its own value and calls back on every change, so the
// caller can either re-render or read the value at Save.
//
// - numberField: label, [−] value [+]. The value is a text box with a decimal keypad, so a
//   number far from the start can be typed instead of tapped. The value is ≥ 64px (main number),
//   the − / + buttons are ≥ 72px. Typed values are clamped and snapped to the step on change.
// - choiceGroup: a row (or list) of buttons where one is chosen: white fill + check, aria-pressed.
import { editField, type FieldKind, type UnitField } from '../../core/unitField';
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

// ---------- M13d: fields backed by a core unit field (no drift) ----------
//
// The field keeps the metric value it will save (core `unitField`); what is shown is re-derived
// from it (`display` / `parts`), and every edit goes through core `editField` (snapped, clamped,
// stored at the data layer's precision). An untouched field saves its metric value as given.

export type UnitNumberFieldOpts<K extends FieldKind> = {
  id: string;
  label: string;
  field: UnitField<K>;
  /** Called with the new field after every − / + tap or typed change that moved it. */
  onChange: (field: UnitField<K>) => void;
};

export type UnitNumberField<K extends FieldKind> = {
  el: HTMLElement;
  get: () => UnitField<K>;
  /** Every input (one, or two for height in ft·in), for aria-describedby hooks. */
  inputs: HTMLElement[];
};

/** One − / + row: the buttons and the value box. Labels / handlers come from the caller. */
function stepRow(o: {
  inputId: string;
  label: string;
  unitText: string;
  numeric: boolean;
  part?: string;
  onStep: (dir: -1 | 1) => void;
  onTyped: (raw: string) => void;
}) {
  const input = h('input', {
    type: 'text',
    id: o.inputId,
    class: 'nf-value',
    inputmode: o.numeric ? 'numeric' : 'decimal',
    autocomplete: 'off',
    'aria-describedby': `${o.inputId}-unit`,
  });
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
  minus.addEventListener('click', () => o.onStep(-1));
  plus.addEventListener('click', () => o.onStep(1));
  input.addEventListener('change', () => o.onTyped(String(input.value ?? '')));
  const row = h(
    'div',
    { class: 'nf-row', 'data-part': o.part },
    minus,
    h(
      'span',
      { class: 'nf-mid' },
      input,
      h('span', { class: 'nf-unit', id: `${o.inputId}-unit` }, o.unitText),
    ),
    plus,
  );
  const ends = (atMin: boolean, atMax: boolean) => {
    if (atMin) minus.setAttribute('disabled', '');
    else minus.removeAttribute('disabled');
    if (atMax) plus.setAttribute('disabled', '');
    else plus.removeAttribute('disabled');
  };
  return { row, input, ends };
}

const EPS = 1e-9;

/**
 * label, [−] value [+] for a body weight, a height in cm or a tape length: shows
 * `field.display`, steps by `field.step`, edits through core `editField`.
 */
export function unitNumberField<K extends FieldKind>(
  o: UnitNumberFieldOpts<K>,
): UnitNumberField<K> {
  if (o.field.kind === 'height' && o.field.unit === 'in') {
    return heightFtInField(
      o as unknown as UnitNumberFieldOpts<'height'>,
    ) as unknown as UnitNumberField<K>;
  }
  let field = o.field;
  const inputId = `nf-${o.id}`;
  const apply = (next: UnitField<K>) => {
    const moved = next.metric !== field.metric;
    field = next;
    show();
    if (moved) o.onChange(field);
  };
  const r = stepRow({
    inputId,
    label: o.label,
    unitText: field.unit,
    numeric: field.decimals === 0,
    onStep: (dir) => apply(editField(field, field.value + dir * field.step)),
    onTyped: (raw) => apply(editField(field, raw)),
  });
  const show = () => {
    r.input.value = field.display;
    r.ends(field.value <= field.min + EPS, field.value >= field.max - EPS);
  };
  show();
  const el = h(
    'div',
    { class: 'nf', 'data-field': o.id },
    h('label', { class: 'nf-label', for: inputId }, o.label),
    r.row,
  );
  return { el, get: () => field, inputs: [r.input] };
}

/** A typed height that names its own feet / inches (`5'7"`, `5 ft 7`, `5 7`, `67 in`). */
const WHOLE_HEIGHT = /['"′″’”]|ft|feet|foot|in|\s/i;

/**
 * Height in ft·in: two − / + rows (feet, inches) over one height field. Inches carry at 12
 * (11 in + 1 → next foot); a whole height typed in either box (`5'7"`) sets both.
 */
export function heightFtInField(o: UnitNumberFieldOpts<'height'>): UnitNumberField<'height'> {
  let field = o.field;
  const parts = () => field.parts ?? { ft: Math.floor(field.value / 12), inch: field.value % 12 };
  const apply = (next: UnitField<'height'>) => {
    const moved = next.metric !== field.metric;
    field = next;
    show();
    if (moved) o.onChange(field);
  };
  const typed = (raw: string, part: 'ft' | 'inch') => {
    const t = raw.trim();
    if (WHOLE_HEIGHT.test(t)) return apply(editField(field, t));
    const n = Number(t.replace(',', '.'));
    if (t === '' || !Number.isFinite(n)) return apply(field); // junk: show the value again
    const p = parts();
    apply(
      editField(
        field,
        part === 'ft' ? { ft: Math.round(n), inch: p.inch } : { ft: p.ft, inch: Math.round(n) },
      ),
    );
  };
  const step = (part: 'ft' | 'inch', dir: -1 | 1) => {
    const p = parts();
    apply(
      editField(
        field,
        part === 'ft' ? { ft: p.ft + dir, inch: p.inch } : { ft: p.ft, inch: p.inch + dir },
      ),
    );
  };
  const ft = stepRow({
    inputId: `nf-${o.id}-ft`,
    label: `${o.label}, feet`,
    unitText: 'ft',
    numeric: true,
    part: 'ft',
    onStep: (dir) => step('ft', dir),
    onTyped: (raw) => typed(raw, 'ft'),
  });
  const inch = stepRow({
    inputId: `nf-${o.id}-in`,
    label: `${o.label}, inches`,
    unitText: 'in',
    numeric: true,
    part: 'in',
    onStep: (dir) => step('inch', dir),
    onTyped: (raw) => typed(raw, 'inch'),
  });
  ft.input.setAttribute('aria-label', `${o.label}, feet`);
  inch.input.setAttribute('aria-label', `${o.label}, inches`);
  const show = () => {
    const p = parts();
    ft.input.value = String(p.ft);
    inch.input.value = String(p.inch);
    const atMin = field.value <= field.min + EPS;
    const atMax = field.value >= field.max - EPS;
    ft.ends(atMin, atMax);
    inch.ends(atMin, atMax);
  };
  show();
  const labelId = `nf-${o.id}-label`;
  const el = h(
    'div',
    {
      class: 'nf nf-ftin',
      'data-field': o.id,
      'data-unit': 'ftin',
      role: 'group',
      'aria-labelledby': labelId,
    },
    h('span', { class: 'nf-label', id: labelId }, o.label),
    ft.row,
    inch.row,
  );
  return { el, get: () => field, inputs: [ft.input, inch.input] };
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
