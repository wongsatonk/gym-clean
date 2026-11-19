// M7 task 14: Fuel setup (SPEC M7 "Targets", M7-q11). Asks height, birth year, sex, activity
// level and today's weight; today's weight becomes the first weigh-in (the app saves it).
// Props in, callbacks out: no DB, no core. Used for the first setup and for "Re-run setup"
// (pass `initial` and `onCancel`).
//
// Not a mid-workout screen, so typing is allowed (the number fields also step with − / +).
// Sex and activity have no default: Save stays disabled until both are picked, so the app
// never guesses them.
//
// M13d task 8: what Apple Health pre-filled (`fromHealth`, from core `prefillSetup`) says
// "From Apple Health" under that field; you still confirm with Save. Task 13: height in ft + in
// (two − / + rows) when the length unit is 'in'; it is held as a core unit field, so an untouched
// height saves exactly what it was (stored cm, 2 decimals for whole inches). Task 3b: a quiet
// "Not now" when the caller passes `onNotNow` (the first run's Set up Fuel step only).
// Task 13c (Decision "M13d answers" q3): a unit switch next to Today's weight (kg | lb) and
// Height (cm | ft·in), the same in the first run and on re-run. A tap re-shows that field from
// the metric value it holds (no drift, nothing saved, no Save needed) and calls `onUnits` with
// the whole new preference (the app makes it app-wide).
// Task 19 ("some screens have too much text"): the lead is one line, and the weigh-in note and
// the privacy line are one note (`[data-setup-note]`, lock icon; the privacy promise stays shown).
//
// e2e hooks: `main[data-screen="fuel-setup"]`, `[data-field=height|birth-year|weight|sex|
// activity]`, `[data-choice=<value>]`, `.nf-value` inputs (height in ft·in: `[data-part=ft|in]`
// rows), `[data-from-health=<field>]` notes, buttons "Save targets", "Back" and
// `[data-setup-not-now]`; the switches are groups "Weight unit" / "Height unit"
// (`[data-unit-for=weight|height]`).
import type { NutritionSettings, UnitPrefs } from '../../core/types';
import {
  SETUP_RANGE,
  type PrefillField,
  type SetupValues,
} from '../../core/nutrition/setupPrefill';
import { unitField } from '../../core/unitField';
import type { Unit } from '../../core/units';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { HEIGHT_UNIT_SWITCH, WEIGHT_UNIT_SWITCH } from '../unitSwitch';
import { choiceGroup, numberField, switchedUnitField, type Choice } from './fields';
import './fuelForms.css';
import '../onboarding/flowButtons.css';

export type Sex = NutritionSettings['sex'];
export type Activity = NutritionSettings['activity'];

/** What Setup collects (core's one copy; weight always kg, height always cm). The app merges
 *  it into NutritionSettings and saves the weigh-in. */
export type { SetupValues };

export type SetupProps = {
  /** Current year, for the birth-year range (the app passes `new Date().getFullYear()`). */
  year: number;
  /** M13d: today's weight in kg or lb, height in cm or ft + in (the app's 'unit' / 'lengthUnit'). */
  units: UnitPrefs;
  /** Starting values (core `prefillSetup`): saved, Apple Health, the latest weigh-in. */
  initial?: Partial<SetupValues> | undefined;
  /** M13d: fields whose starting value came from Apple Health ("From Apple Health" under them). */
  fromHealth?: ReadonlySet<PrefillField> | undefined;
};

export type SetupActions = {
  onSave: (values: SetupValues) => void;
  /** Shows Back (re-run from Settings, or leaving the first setup). */
  onCancel?: (() => void) | undefined;
  /** M13d task 3b: shows a quiet "Not now" (first run only): leave, nothing saved. */
  onNotNow?: (() => void) | undefined;
  /** M13d: the first edit, tap or focus on the form (the caller then stops re-filling it). */
  onTouch?: (() => void) | undefined;
  /** M13d task 13c: a unit switch was tapped; the whole new preference, once per tap. */
  onUnits: (next: UnitPrefs) => void;
};

/** The one line under the title (M13d task 19). */
export const SETUP_LEAD = 'Your daily calories and protein, estimated from these.';
/** The one note under the form: the first weigh-in + the privacy promise (M13d task 19). */
export const SETUP_NOTE = 'Saved as your first weigh-in. Stays on this phone.';

/** The words under a field Apple Health pre-filled. */
export const FROM_HEALTH = 'From Apple Health';

export const SEX_CHOICES: readonly Choice<Sex>[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export const ACTIVITY_CHOICES: readonly Choice<Activity>[] = [
  { value: 'sedentary', label: 'Mostly sitting', note: 'Desk job, little walking' },
  { value: 'light', label: 'Lightly active', note: 'Train 1–3 days a week' },
  { value: 'moderate', label: 'Active', note: 'Train 3–5 days a week' },
  { value: 'very', label: 'Very active', note: 'Train 6–7 days or a physical job' },
];

/** Field ranges: core's one copy (made-up starting values only; the repo is public). */
export { SETUP_RANGE };

/** The weight field's step in the display unit. */
export function weightStep(unit: Unit): number {
  return unit === 'kg' ? 0.1 : 0.2;
}

export function fuelSetupScreen(p: SetupProps, a: SetupActions): HTMLElement {
  const init = p.initial ?? {};
  const fromHealth = p.fromHealth ?? new Set<PrefillField>();
  const v = {
    birthYear: init.birthYear ?? p.year - SETUP_RANGE.age.start,
    sex: init.sex ?? null,
    activity: init.activity ?? null,
  } as {
    birthYear: number;
    sex: Sex | null;
    activity: Activity | null;
  };
  let units: UnitPrefs = { ...p.units };

  /** "From Apple Health" under a pre-filled field, read with it by screen readers. */
  function healthNote(
    tag: PrefillField,
    wrap: HTMLElement,
    described: readonly (Element | null | undefined)[],
  ): HTMLElement {
    if (!fromHealth.has(tag)) return wrap;
    const id = `from-health-${tag}`;
    for (const el of described) {
      if (!el) continue;
      const had = el.getAttribute('aria-describedby');
      el.setAttribute('aria-describedby', had ? `${had} ${id}` : id);
    }
    wrap.append(
      h(
        'p',
        { class: 'fuel-from-health', id, 'data-from-health': tag },
        icon('spark', 'sm'),
        h('span', {}, FROM_HEALTH),
      ),
    );
    return wrap;
  }

  let touched = false;
  const touch = () => {
    if (touched) return;
    touched = true;
    a.onTouch?.();
  };

  // M13d task 40b (Goal 7): Save is the page's one main action, the orange circle in a
  // full-width pill (flowButtons.css); greyed until sex and activity are picked.
  const save = iconButton({
    icon: 'check',
    label: 'Save targets',
    variant: 'main',
    wideHit: true,
    class: 'flow-pill fuel-setup-save',
    hooks: { 'data-setup-save': true },
    onClick: () => {
      if (!v.sex || !v.activity) return;
      a.onSave({
        heightCm: height.get().metric,
        birthYear: v.birthYear,
        sex: v.sex,
        activity: v.activity,
        weightKg: weight.get().metric,
      });
    },
  });
  const missing = h('p', { class: 'fuel-note', 'data-setup-missing': true, role: 'status' });
  const refresh = () => {
    const need = [v.sex ? null : 'sex', v.activity ? null : 'activity level'].filter(Boolean);
    if (need.length) {
      save.setAttribute('disabled', '');
      missing.textContent = `Pick your ${need.join(' and ')} to continue.`;
    } else {
      save.removeAttribute('disabled');
      missing.textContent = '';
    }
  };

  // Height and today's weight: core unit fields (no drift), each with its unit switch; saved as
  // their metric values (cm, kg). "From Apple Health" is re-added under a rebuilt field.
  const height = switchedUnitField({
    id: 'height',
    label: 'Height',
    field: unitField({
      kind: 'height',
      metric: init.heightCm ?? SETUP_RANGE.heightCm.start,
      unit: units.length,
    }),
    spec: HEIGHT_UNIT_SWITCH,
    onChange: touch,
    onUnit: (length) => {
      touch();
      units = { ...units, length };
      a.onUnits(units);
    },
    decorate: (f) => healthNote('height', f.el, f.inputs),
  });
  const weight = switchedUnitField({
    id: 'weight',
    label: "Today's weight",
    field: unitField({
      kind: 'bodyWeight',
      metric: init.weightKg ?? SETUP_RANGE.weightKg.start,
      unit: units.weight,
    }),
    spec: WEIGHT_UNIT_SWITCH,
    onChange: touch,
    onUnit: (weight) => {
      touch();
      units = { ...units, weight };
      a.onUnits(units);
    },
    decorate: (f) => healthNote('weight', f.el, f.inputs),
  });

  const birthYear = numberField({
    id: 'birth-year',
    label: 'Birth year',
    value: v.birthYear,
    step: 1,
    min: p.year - SETUP_RANGE.age.max,
    max: p.year - SETUP_RANGE.age.min,
    onChange: (x) => {
      v.birthYear = x;
      touch();
    },
  });
  const sex = choiceGroup({
    id: 'sex',
    label: 'Sex (for the calorie estimate)',
    options: SEX_CHOICES,
    selected: v.sex,
    layout: 'row',
    onPick: (x) => {
      v.sex = x;
      refresh();
      touch();
    },
  });

  refresh();
  const el = h(
    'main',
    { class: `screen fuel-form fuel-setup ${moodClass('pro')}`, 'data-screen': 'fuel-setup' },
    h(
      'header',
      { class: 'fuel-head' },
      a.onCancel
        ? iconButton({
            icon: 'back',
            label: 'Back',
            labelAt: 'beside',
            class: 'fuel-back',
            // M13d task 24: the edge swipe's Back (also in the flow)
            hooks: { 'data-swipe-back': true },
            onClick: () => a.onCancel?.(),
          })
        : null,
      h('h1', { class: 'page-title' }, 'Set up Fuel'),
    ),
    h('p', { class: 'fuel-lead' }, SETUP_LEAD),
    height.el,
    healthNote('birthYear', birthYear.el, [birthYear.controls[1]]),
    healthNote('sex', sex, [groupOf(sex)]),
    choiceGroup({
      id: 'activity',
      label: 'Activity level',
      options: ACTIVITY_CHOICES,
      selected: v.activity,
      layout: 'list',
      onPick: (x) => {
        v.activity = x;
        refresh();
        touch();
      },
    }),
    weight.el,
    h(
      'p',
      { class: 'fuel-privacy', 'data-setup-note': true },
      icon('lock', 'sm'),
      h('span', {}, SETUP_NOTE),
    ),
    // Quiet: at the end of the form, not in the sticky bar (Save stays the one main action).
    a.onNotNow
      ? iconButton({
          icon: 'skip',
          label: 'Not now',
          variant: 'quiet',
          labelAt: 'beside',
          class: 'fuel-not-now',
          hooks: { 'data-setup-not-now': true },
          onClick: () => a.onNotNow?.(),
        })
      : null,
    h('div', { class: 'sticky-bottom fuel-actions' }, missing, save),
  );
  // A tap or focus anywhere on the form counts as starting to fill it in.
  el.addEventListener('pointerdown', touch);
  el.addEventListener('focusin', touch);
  return el;
}

/** The choice group's role="group" box (a direct child; works on the fake test DOM too). */
function groupOf(field: HTMLElement): Element | undefined {
  return Array.from(field.children).find((c) => c.getAttribute('role') === 'group');
}
