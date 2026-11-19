// M13d task 13b (SPEC M13d Goal 3, Decision "M13d answers"): the unit switch that sits right next
// to a measured field: `kg | lb` (body weight), `cm | ft·in` (height), `cm | in` (tape).
// A compact two-option segmented control: `role="group"` with an accessible name ("Weight unit" /
// "Height unit" / "Measurement unit"), each option a native <button> with `aria-pressed`, ≥ 56px
// tall (compact width, never under 56px either way). The active option is filled.
//
// Props in / callback out, no DB: a tap on the other option fills it at once and calls
// `onChange(unit)` once; a tap on the active option does nothing. The page owns the preference
// (the 'unit' / 'lengthUnit' rows) and the field's metric value (task 10b); a switch never saves.
// `setUnitSwitch(el, unit)` re-shows a value chosen elsewhere without calling `onChange`.
//
// Not used on Exercise / Rest / camera / Summary / Pause (nothing new mid-set).
import { h } from './dom';
import './unitSwitch.css';

export type UnitSwitchOption<T extends string> = {
  value: T;
  /** The visible word, also the button's accessible name ("kg", "ft·in"). */
  label: string;
};

export type UnitSwitchSpec<T extends string> = {
  /** The group's accessible name ("Weight unit"). */
  label: string;
  options: readonly [UnitSwitchOption<T>, UnitSwitchOption<T>];
};

/** Body weight (Set up Fuel, the weigh-in): the app's 'unit' row. */
export const WEIGHT_UNIT_SWITCH: UnitSwitchSpec<'kg' | 'lb'> = {
  label: 'Weight unit',
  options: [
    { value: 'kg', label: 'kg' },
    { value: 'lb', label: 'lb' },
  ],
};

/** Height (Set up Fuel): the 'lengthUnit' row; 'in' is shown as feet + inches. */
export const HEIGHT_UNIT_SWITCH: UnitSwitchSpec<'cm' | 'in'> = {
  label: 'Height unit',
  options: [
    { value: 'cm', label: 'cm' },
    { value: 'in', label: 'ft·in' },
  ],
};

/** Tape measurements (Fuel → Measurements): the 'lengthUnit' row. */
export const TAPE_UNIT_SWITCH: UnitSwitchSpec<'cm' | 'in'> = {
  label: 'Measurement unit',
  options: [
    { value: 'cm', label: 'cm' },
    { value: 'in', label: 'in' },
  ],
};

export type UnitSwitchProps<T extends string> = UnitSwitchSpec<T> & {
  /** The unit shown now. */
  value: T;
  /** Called once per tap on the other option, with that option's unit. */
  onChange: (unit: T) => void;
  /** Extra class names for placement by the page. */
  class?: string;
  /** Extra data attributes on the group (test and app hooks). */
  hooks?: Record<string, string | boolean>;
};

/** Shows `unit` as the active option (fill + aria-pressed). Class set whole: no classList. */
function paint(buttons: readonly HTMLButtonElement[], group: HTMLElement, unit: string): void {
  for (const b of buttons) {
    const on = b.getAttribute('data-unit') === unit;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.setAttribute('class', on ? 'unit-switch-opt active' : 'unit-switch-opt');
  }
  group.setAttribute('data-value', unit);
}

/** Per switch: re-show a unit chosen elsewhere (setUnitSwitch). */
const setters = new WeakMap<HTMLElement, (unit: string) => void>();

/** A compact two-option unit switch. */
export function unitSwitch<T extends string>(props: UnitSwitchProps<T>): HTMLElement {
  let current: string = props.value;
  const buttons: HTMLButtonElement[] = [];
  for (const opt of props.options) {
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'unit-switch-opt',
          'data-unit': opt.value,
          onclick: () => {
            if (opt.value === current) return;
            current = opt.value;
            paint(buttons, group, current);
            props.onChange(opt.value);
          },
        },
        opt.label,
      ),
    );
  }
  const group: HTMLElement = h(
    'div',
    {
      ...props.hooks,
      role: 'group',
      'aria-label': props.label,
      class: ['unit-switch', props.class].filter(Boolean).join(' '),
      'data-unit-switch': true,
    },
    ...buttons,
  );
  paint(buttons, group, current);
  setters.set(group, (unit) => {
    current = unit;
    paint(buttons, group, unit);
  });
  return group;
}

/** Re-shows `unit` as the active option (a choice made elsewhere); never calls `onChange`. */
export function setUnitSwitch(group: HTMLElement, unit: string): void {
  setters.get(group)?.(unit);
}
