// M13d task 12 (SPEC M13d Goal 3): the first-run Units page, right after the welcome pages.
// Pure render of the page body (welcome.ts puts it in the usual frame with Back / Next / Skip):
// an icon, the title, one line, then two choices from UNITS_PAGE:
//   Weight            [ kg | lb ]      group "Weight unit"
//   Height and body   [ cm | ft·in ]   group "Height and body unit"
// Each choice is the shared unit switch (unitSwitch.ts: native buttons with aria-pressed, the
// active one filled), shown full width here so each option is a big target (≥ 56px tall).
// The visible words above each switch are hidden from screen readers: the group's name says it.
//
// Props in / callback out, no DB: `units` is the preselection (app.ts passes the saved rows on a
// re-run, or defaultUnits(deviceLocale()) on a fresh install); every tap on the other option
// calls `onChange` once with BOTH units, so the caller can keep and save them on Next. Nothing
// is written here, and Next is welcome.ts's usual button.
import type { LengthUnit, UnitPrefs } from '../../core/types';
import { UNITS_PAGE } from '../../data/onboarding';
import { h } from '../dom';
import { icon } from '../icons';
import { unitSwitch, type UnitSwitchSpec } from '../unitSwitch';

export type UnitsPageProps = {
  /** The units shown as chosen when the page opens. */
  units: UnitPrefs;
  /** The id the screen's dialog is labelled by (on the title). */
  titleId: string;
};

export type UnitsPageActions = {
  /** A tap on the other option: both units as they are now. */
  onChange: (units: UnitPrefs) => void;
};

/** Group names (the screen-reader name of each switch). */
export const UNITS_WEIGHT_GROUP = 'Weight unit';
export const UNITS_LENGTH_GROUP = 'Height and body unit';

export const WEIGHT_SPEC: UnitSwitchSpec<'kg' | 'lb'> = {
  label: UNITS_WEIGHT_GROUP,
  options: [
    { value: 'kg', label: UNITS_PAGE.weight.options.kg },
    { value: 'lb', label: UNITS_PAGE.weight.options.lb },
  ],
};

export const LENGTH_SPEC: UnitSwitchSpec<LengthUnit> = {
  label: UNITS_LENGTH_GROUP,
  options: [
    { value: 'cm', label: UNITS_PAGE.length.options.cm },
    { value: 'in', label: UNITS_PAGE.length.options.in },
  ],
};

function choice(label: string, key: string, sw: HTMLElement): HTMLElement {
  return h(
    'div',
    { class: 'ob-units-choice', 'data-units-choice': key },
    h('p', { class: 'ob-units-label', 'aria-hidden': 'true' }, label),
    sw,
  );
}

/** The Units page body (icon, title, one line, two choices). */
export function unitsPage(props: UnitsPageProps, actions: UnitsPageActions): HTMLElement {
  let units: UnitPrefs = { ...props.units };
  const weight = unitSwitch({
    ...WEIGHT_SPEC,
    value: units.weight,
    class: 'ob-units-switch',
    hooks: { 'data-units': 'weight' },
    onChange: (w) => {
      units = { ...units, weight: w };
      actions.onChange({ ...units });
    },
  });
  const length = unitSwitch({
    ...LENGTH_SPEC,
    value: units.length,
    class: 'ob-units-switch',
    hooks: { 'data-units': 'length' },
    onChange: (l) => {
      units = { ...units, length: l };
      actions.onChange({ ...units });
    },
  });
  return h(
    'section',
    { class: 'ob-welcome ob-units', 'data-units-page': true },
    h('div', { class: 'ob-icon' }, icon('ruler', 'lg')),
    h('h2', { class: 'ob-title', id: props.titleId, 'data-ob': 'title' }, UNITS_PAGE.title),
    h('p', { class: 'ob-text', 'data-ob': 'body' }, UNITS_PAGE.body),
    choice(UNITS_PAGE.weight.label, 'weight', weight),
    choice(UNITS_PAGE.length.label, 'length', length),
  );
}
