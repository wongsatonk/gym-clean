// M7 task 14: Fuel setup (SPEC M7 "Targets", M7-q11). Asks height, birth year, sex, activity
// level and today's weight; today's weight becomes the first weigh-in (the app saves it).
// Props in, callbacks out: no DB, no core. Used for the first setup and for "Re-run setup"
// (pass `initial` and `onCancel`).
//
// Not a mid-workout screen, so typing is allowed (the number fields also step with − / +).
// Sex and activity have no default: Save stays disabled until both are picked, so the app
// never guesses them.
//
// e2e hooks: `main[data-screen="fuel-setup"]`, `[data-field=height|birth-year|weight|sex|
// activity]`, `[data-choice=<value>]`, `.nf-value` inputs, buttons "Save targets" and "Back".
import type { NutritionSettings } from '../../core/types';
import { SETUP_RANGE, type SetupValues } from '../../core/nutrition/setupPrefill';
import { fromUnit, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { choiceGroup, numberField, type Choice } from './fields';
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
  /** Re-run: the saved values and the latest weigh-in. Omitted on first setup. */
  initial?: Partial<SetupValues> | undefined;
};

export type SetupActions = {
  onSave: (values: SetupValues) => void;
  /** Shows Back (re-run from Settings, or leaving the first setup). */
  onCancel?: (() => void) | undefined;
};

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
  const v = {
    heightCm: init.heightCm ?? SETUP_RANGE.heightCm.start,
    birthYear: init.birthYear ?? p.year - SETUP_RANGE.age.start,
    sex: init.sex ?? null,
    activity: init.activity ?? null,
    weightKg: init.weightKg ?? SETUP_RANGE.weightKg.start,
  } as {
    heightCm: number;
    birthYear: number;
    sex: Sex | null;
    activity: Activity | null;
    weightKg: number;
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
  save.addEventListener('click', () => {
    if (!v.sex || !v.activity) return;
    a.onSave({
      heightCm: v.heightCm,
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
    },
  });

  refresh();
  return h(
    'main',
    { class: `screen fuel-form fuel-setup ${moodClass('pro')}`, 'data-screen': 'fuel-setup' },
    h(
      'header',
      { class: 'fuel-head' },
      a.onCancel
        ? h(
            'button',
            { type: 'button', class: 'fuel-back', onclick: () => a.onCancel?.() },
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
    numberField({
      id: 'height',
      label: 'Height',
      unit: 'cm',
      value: v.heightCm,
      step: SETUP_RANGE.heightCm.step,
      min: SETUP_RANGE.heightCm.min,
      max: SETUP_RANGE.heightCm.max,
      onChange: (x) => {
        v.heightCm = x;
      },
    }).el,
    numberField({
      id: 'birth-year',
      label: 'Birth year',
      value: v.birthYear,
      step: 1,
      min: p.year - SETUP_RANGE.age.max,
      max: p.year - SETUP_RANGE.age.min,
      onChange: (x) => {
        v.birthYear = x;
      },
    }).el,
    choiceGroup({
      id: 'sex',
      label: 'Sex (for the calorie estimate)',
      options: SEX_CHOICES,
      selected: v.sex,
      layout: 'row',
      onPick: (x) => {
        v.sex = x;
        refresh();
      },
    }),
    choiceGroup({
      id: 'activity',
      label: 'Activity level',
      options: ACTIVITY_CHOICES,
      selected: v.activity,
      layout: 'list',
      onPick: (x) => {
        v.activity = x;
        refresh();
      },
    }),
    weight.el,
    h('p', { class: 'fuel-note' }, 'Saved as your first weigh-in.'),
    h('p', { class: 'fuel-privacy' }, icon('lock', 'sm'), h('span', {}, 'Stays on this phone.')),
    h('div', { class: 'sticky-bottom fuel-actions' }, missing, save),
  );
}
