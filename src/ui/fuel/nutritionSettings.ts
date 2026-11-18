// M7 task 14: Settings → Nutrition (SPEC M7 "Two tracking modes", "Targets", barcode item 7).
// A block the Settings screen places in its Nutrition section (`SettingsProps.nutrition`).
// Props in, callbacks out: the app saves each change and re-renders with new props.
//
// - Quick / Full switch (segmented, white fill = chosen). Switching never loses data.
// - Targets for the visible macros, each with its number (≥ 64px), "estimate" when computed and
//   "set by you" when overridden. "Change" opens an inline editor (number field, Save, and
//   "Use estimate" to drop the override).
// - Calorie change vs maintenance (step 50; M12 1b: the goal's range, e.g. −600–0 to lose fat,
//   0–600 with no goal) and protein 1.6–2.2 g/kg (step 0.1) steppers. A note shows when the
//   kcal target was lifted to the resting estimate (`kcalFloored`).
// - "Re-run setup".
// - Barcode lookup (M7-q5, off by default). Turning it on first shows what it sends: only the
//   barcode number. Turning it off is immediate.
//
// e2e hooks: `[data-nutrition]`, `[data-mode=quick|full]` (aria-pressed), `[data-target=kcal|
// proteinG|carbsG|fatG]` with `.nt-value`, `[data-target-edit]`, `[data-field=surplus|protein]`,
// `[data-setup-rerun]`, `[data-setting=barcode-lookup]` (role=switch), `[data-barcode-confirm]`.
import { visibleMacros, type MacroKey } from '../../core/nutrition/targets';
import { fuelRuleFor } from '../../core/nutrition/goalTargets';
import type { NutritionMode, NutritionSettings, NutritionTargets } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { switchRow } from '../screens/settings';
import { estimateTag } from './common';
import { numberField } from './fields';
import './fuelForms.css';

export type { MacroKey };

export type NutritionSettingsProps = {
  /** null → not set up yet: only the "Set up targets" button (and the barcode switch). */
  settings: NutritionSettings | null;
  /**
   * The stored barcode-lookup flag, for the not-set-up state (there are no settings to read it
   * from yet). Once set up, `settings.barcodeLookup` is used. Default false (off, M7-q5).
   */
  barcodeLookup?: boolean | undefined;
  /** From core `targets(...)`; null when there's no weigh-in yet. */
  targets: NutritionTargets | null;
  /** M12 1b: the kcal target was below the resting estimate and was lifted to it. */
  kcalFloored?: boolean | undefined;
};

export type NutritionSettingsActions = {
  onMode: (mode: NutritionMode) => void;
  /** A hand override for one macro; null drops it (back to the estimate). */
  onOverride: (macro: MacroKey, value: number | null) => void;
  onSurplus: (kcal: number) => void;
  onProteinPerKg: (gPerKg: number) => void;
  /** Opens Setup (first setup, or re-run with the saved values). */
  onSetup: () => void;
  onBarcodeLookup: (on: boolean) => void;
};

export const MACRO_META: Record<
  MacroKey,
  { label: string; unit: string; min: number; max: number; step: number }
> = {
  kcal: { label: 'Calories', unit: 'kcal', min: 1000, max: 6000, step: 10 },
  proteinG: { label: 'Protein', unit: 'g', min: 40, max: 400, step: 1 },
  carbsG: { label: 'Carbs', unit: 'g', min: 0, max: 900, step: 1 },
  fatG: { label: 'Fat', unit: 'g', min: 20, max: 300, step: 1 },
};

/** No goal / a gain goal. A goal's own range comes from `surplusRange(goalKind)`. */
export const SURPLUS_RANGE = { min: 0, max: 600, step: 50 } as const;

/** M12 1b: the stepper range for the goal (a deficit for "lose fat" / "general fitness"). */
export function surplusRange(goalKind: NutritionSettings['goalKind']): {
  min: number;
  max: number;
  step: number;
} {
  const [min, max] = fuelRuleFor(goalKind).deltaRange;
  return { min, max, step: SURPLUS_RANGE.step };
}

/** The stepper's label: "above" when it can only add, "vs" when it can go below maintenance. */
export function surplusLabel(goalKind: NutritionSettings['goalKind']): string {
  return surplusRange(goalKind).min < 0
    ? 'Calories vs maintenance (minus = below)'
    : 'Calories above maintenance';
}

export const FLOORED_NOTE =
  'Calories are kept at your resting estimate, the lowest this app suggests.';
export const PROTEIN_RANGE = { min: 1.6, max: 2.2, step: 0.1 } as const;

export const MODE_NOTE: Record<NutritionMode, string> = {
  quick: 'Calories, protein and weight.',
  full: 'Adds carbs and fat. Switching back keeps everything you logged.',
};

export const BARCODE_EXPLAINER =
  'Looks up the barcode number online (Open Food Facts). Nothing else is sent. Results are saved on this phone, so the next scan works offline.';

/** "2,650" for kcal, "158" for grams. Pure. */
export function targetText(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

function modeSwitch(mode: NutritionMode, onMode: (m: NutritionMode) => void): HTMLElement {
  const btn = (m: NutritionMode, label: string) => {
    const on = m === mode;
    return h(
      'button',
      {
        type: 'button',
        class: on ? 'seg-btn active' : 'seg-btn',
        'aria-pressed': on ? 'true' : 'false',
        'data-mode': m,
        onclick: () => {
          if (!on) onMode(m);
        },
      },
      on ? icon('check', 'sm') : null,
      h('span', {}, label),
    );
  };
  return h(
    'div',
    { class: 'nt-mode' },
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': 'Tracking mode' },
      btn('quick', 'Quick'),
      btn('full', 'Full'),
    ),
    h('p', { class: 'muted set-note' }, MODE_NOTE[mode]),
  );
}

function targetRow(
  key: MacroKey,
  target: { value: number; estimate: boolean },
  overridden: boolean,
  onOverride: NutritionSettingsActions['onOverride'],
): HTMLElement {
  const meta = MACRO_META[key];
  const row = h('div', { class: 'nt-row', 'data-target': key });
  const view = () => {
    row.replaceChildren(
      h(
        'div',
        { class: 'nt-top' },
        h('span', { class: 'nt-label' }, meta.label),
        target.estimate ? estimateTag() : null,
        overridden ? h('span', { class: 'nt-yours', 'data-yours': true }, 'set by you') : null,
      ),
      h(
        'div',
        { class: 'nt-bottom' },
        h(
          'span',
          { class: 'nt-num' },
          h('span', { class: 'nt-value' }, targetText(target.value)),
          h('span', { class: 'nt-unit' }, meta.unit),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'nt-btn',
            'data-target-edit': key,
            onclick: edit,
          },
          icon('pencil', 'sm'),
          h('span', {}, 'Change'),
        ),
      ),
    );
  };
  const edit = () => {
    const field = numberField({
      id: `target-${key}`,
      label: `${meta.label} target`,
      unit: meta.unit,
      value: target.value,
      step: meta.step,
      min: meta.min,
      max: meta.max,
      onChange: () => undefined,
    });
    row.replaceChildren(
      field.el,
      h(
        'div',
        { class: 'nt-edit-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'nt-btn nt-save',
            'data-target-save': key,
            onclick: () => onOverride(key, field.get()),
          },
          icon('check', 'sm'),
          h('span', {}, 'Save'),
        ),
        overridden
          ? h(
              'button',
              {
                type: 'button',
                class: 'nt-btn',
                'data-target-reset': key,
                onclick: () => onOverride(key, null),
              },
              h('span', {}, 'Use estimate'),
            )
          : null,
        h(
          'button',
          { type: 'button', class: 'nt-btn', 'data-target-cancel': key, onclick: view },
          h('span', {}, 'Cancel'),
        ),
      ),
    );
  };
  view();
  return row;
}

function barcodeBlock(on: boolean, onSet: (on: boolean) => void): HTMLElement {
  const box = h('div', { class: 'nt-barcode' });
  const confirm = () =>
    h(
      'div',
      {
        class: 'nt-confirm',
        'data-barcode-confirm': true,
        role: 'group',
        'aria-label': 'Barcode lookup',
      },
      h('p', { class: 'nt-confirm-txt' }, icon('help', 'sm'), h('span', {}, BARCODE_EXPLAINER)),
      h(
        'div',
        { class: 'nt-edit-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'nt-btn nt-save',
            'data-barcode-on': true,
            onclick: () => onSet(true),
          },
          h('span', {}, 'Turn on'),
        ),
        h(
          'button',
          { type: 'button', class: 'nt-btn', 'data-barcode-cancel': true, onclick: show },
          h('span', {}, 'Not now'),
        ),
      ),
    );
  function show() {
    box.replaceChildren(
      switchRow('barcode-lookup', 'Barcode lookup', on, (next) => {
        // Off → On asks first (SPEC: the setting explains this before turning it on).
        if (next) box.replaceChildren(confirm());
        else onSet(false);
      }),
      h(
        'p',
        { class: 'muted set-note' },
        on ? 'On. Only the barcode number is sent.' : 'Off. Barcodes are never looked up.',
      ),
    );
  }
  show();
  return box;
}

export function nutritionSettings(
  p: NutritionSettingsProps,
  a: NutritionSettingsActions,
): HTMLElement {
  const s = p.settings;
  if (!s) {
    return h(
      'div',
      { class: 'nt', 'data-nutrition': 'empty' },
      h('p', { class: 'set-note' }, 'Set up Fuel to get daily calorie and protein targets.'),
      h(
        'button',
        {
          type: 'button',
          class: 'set-action',
          'data-setup-rerun': true,
          onclick: () => a.onSetup(),
        },
        'Set up targets',
      ),
      barcodeBlock(p.barcodeLookup ?? false, a.onBarcodeLookup),
    );
  }
  const overrides = s.overrides ?? {};
  const t = p.targets;
  const targets = t
    ? h(
        'div',
        { class: 'nt-targets', 'data-targets': true },
        ...visibleMacros(s.mode).map((k) =>
          targetRow(k, t[k], overrides[k] !== undefined, a.onOverride),
        ),
      )
    : h('p', { class: 'set-note', 'data-targets': 'none' }, 'Weigh in first to see your targets.');

  return h(
    'div',
    { class: 'nt', 'data-nutrition': s.mode },
    modeSwitch(s.mode, a.onMode),
    h('h3', { class: 'nt-sub' }, 'Daily targets'),
    targets,
    p.kcalFloored && t
      ? h('p', { class: 'set-note', 'data-kcal-floored': true }, FLOORED_NOTE)
      : null,
    numberField({
      id: 'surplus',
      label: surplusLabel(s.goalKind),
      unit: 'kcal',
      value: s.surplusKcal,
      ...surplusRange(s.goalKind),
      onChange: a.onSurplus,
    }).el,
    numberField({
      id: 'protein',
      label: 'Protein per kg of body weight',
      unit: 'g/kg',
      value: s.proteinGPerKg,
      ...PROTEIN_RANGE,
      onChange: a.onProteinPerKg,
    }).el,
    h(
      'button',
      { type: 'button', class: 'set-action', 'data-setup-rerun': true, onclick: () => a.onSetup() },
      'Re-run setup',
    ),
    barcodeBlock(s.barcodeLookup, a.onBarcodeLookup),
  );
}
