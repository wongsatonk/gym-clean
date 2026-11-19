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
//
// e2e hooks: `main[data-screen="fuel-setup"]`, `[data-field=height|birth-year|weight|sex|
// activity]`, `[data-choice=<value>]`, `.nf-value` inputs (height in ft·in: `[data-part=ft|in]`
// rows), `[data-from-health=<field>]` notes, buttons "Save targets", "Back" and
// `[data-setup-not-now]`.
import type { LengthUnit, NutritionSettings } from '../../core/types';
import {
  SETUP_RANGE,
  type PrefillField,
  type SetupValues,
} from '../../core/nutrition/setupPrefill';
import { unitField } from '../../core/unitField';
import { fromUnit, lengthUnitFor, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { choiceGroup, numberField, unitNumberField, type Choice } from './fields';
import './fuelForms.css';

export type Sex = NutritionSettings['sex'];
export type Activity = NutritionSettings['activity'];

/** What Setup collects (core's one copy; weight always kg, height always cm). The app merges
 *  it into NutritionSettings and saves the weigh-in. */
export type { SetupValues };

export type SetupProps = {
  /** Current year, for the birth-year range (the app passes `new Date().getFullYear()`). */
  year: number;
  unit: Unit;
  /** M13d: height in cm or ft + in. Default: follows the weight unit (no 'lengthUnit' row). */
  lengthUnit?: LengthUnit | undefined;
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
};

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
    weightKg: init.weightKg ?? SETUP_RANGE.weightKg.start,
  } as {
    birthYear: number;
    sex: Sex | null;
    activity: Activity | null;
    weightKg: number;
  };

  let touched = false;
  const touch = () => {
    if (touched) return;
    touched = true;
    a.onTouch?.();
  };

  const save = h(
    'button',
    { type: 'button', class: 'primary-btn cta-btn', 'data-setup-save': true },
    icon('check', 'lg'),
    'Save targets',
  );
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

  // Height: a core unit field (cm, or ft + in), saved as its metric value.
  const height = unitNumberField({
    id: 'height',
    label: 'Height',
    field: unitField({
      kind: 'height',
      metric: init.heightCm ?? SETUP_RANGE.heightCm.start,
      unit: p.lengthUnit ?? lengthUnitFor(p.unit),
    }),
    onChange: touch,
  });

  save.addEventListener('click', () => {
    if (!v.sex || !v.activity) return;
    a.onSave({
      heightCm: height.get().metric,
      birthYear: v.birthYear,
      sex: v.sex,
      activity: v.activity,
      weightKg: v.weightKg,
    });
  });

  const step = weightStep(p.unit);
  const weight = numberField({
    id: 'weight',
    label: "Today's weight",
    unit: p.unit,
    value: toUnit(v.weightKg, p.unit),
    step,
    min: toUnit(SETUP_RANGE.weightKg.min, p.unit),
    max: toUnit(SETUP_RANGE.weightKg.max, p.unit),
    onChange: (x) => {
      v.weightKg = fromUnit(x, p.unit);
      touch();
    },
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

  /** "From Apple Health" under a pre-filled field, read with it by screen readers. */
  const healthNote = (
    tag: PrefillField,
    wrap: HTMLElement,
    described: readonly (Element | null | undefined)[],
  ): HTMLElement => {
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
  };

  refresh();
  const el = h(
    'main',
    { class: `screen fuel-form fuel-setup ${moodClass('pro')}`, 'data-screen': 'fuel-setup' },
    h(
      'header',
      { class: 'fuel-head' },
      a.onCancel
        ? h(
            'button',
            {
              type: 'button',
              class: 'fuel-back',
              'data-swipe-back': true, // M13d task 24: the edge swipe's Back (also in the flow)
              onclick: () => a.onCancel?.(),
            },
            icon('back', 'md'),
            h('span', {}, 'Back'),
          )
        : null,
      h('h1', { class: 'page-title' }, 'Set up Fuel'),
    ),
    h(
      'p',
      { class: 'fuel-lead' },
      'Your daily calories and protein are worked out from these. They are estimates you can change any time.',
    ),
    healthNote('height', height.el, height.inputs),
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
    healthNote('weight', weight.el, [weight.controls[1]]),
    h('p', { class: 'fuel-note' }, 'Saved as your first weigh-in.'),
    h('p', { class: 'fuel-privacy' }, icon('lock', 'sm'), h('span', {}, 'Stays on this phone.')),
    // Quiet: at the end of the form, not in the sticky bar (Save stays the one main action).
    a.onNotNow
      ? h(
          'button',
          {
            type: 'button',
            class: 'ghost-btn fuel-not-now',
            'data-setup-not-now': true,
            onclick: () => a.onNotNow?.(),
          },
          'Not now',
        )
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
