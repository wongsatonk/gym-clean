// M7 Fuel: edit one logged entry (task 11 "each entry can be edited"). Amount stepper (0.5
// servings, or 10 g for gram entries), meal-slot chips, a live preview, Save and Delete (M13d
// task 40e: the round Delete circle beside the Save pill; Delete's name stays "Delete entry").
// The preview numbers come from the caller (core portion scaling), so the UI holds no math.
//
// e2e hooks: dialog `[data-entry-sheet]`, `[data-stepper=amount]`, `[data-slot-chip=<slot>]`,
// `[data-entry-save]`, `[data-entry-remove]`.
import type { FoodAmount, FoodEntry, MacroSet, MealSlot, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { SLOT_LABEL, SLOT_ORDER, macroLine, sheetShell, stepper } from './common';
import { fuelMain, saveRow } from './fuelButtons';

export type EntrySheetProps = {
  entry: FoodEntry;
  mode: NutritionMode;
  /** Macros for a new amount (core: the entry scaled by amount). */
  preview: (amount: FoodAmount) => MacroSet;
};

export type EntrySheetActions = {
  onSave: (change: { amount: FoodAmount; slot: MealSlot }) => void;
  onDelete: () => void;
  onClose: () => void;
};

export const SERVING_STEP = 0.5;
export const GRAM_STEP = 10;

/** Meal-slot chips (radio-like buttons, aria-pressed). */
export function slotChips(current: MealSlot, onPick: (s: MealSlot) => void): HTMLElement {
  const buttons = SLOT_ORDER.map((s) =>
    h(
      'button',
      {
        type: 'button',
        class: s === current ? 'fuel-chip on' : 'fuel-chip',
        'aria-pressed': s === current ? 'true' : 'false',
        'data-slot-chip': s,
      },
      SLOT_LABEL[s],
    ),
  );
  buttons.forEach((b, i) =>
    b.addEventListener('click', () => {
      const s = SLOT_ORDER[i] as MealSlot;
      buttons.forEach((o, j) => {
        o.setAttribute('class', j === i ? 'fuel-chip on' : 'fuel-chip');
        o.setAttribute('aria-pressed', j === i ? 'true' : 'false');
      });
      onPick(s);
    }),
  );
  return h('div', { class: 'fuel-chips', role: 'group', 'aria-label': 'Meal' }, ...buttons);
}

export function entrySheet(p: EntrySheetProps, a: EntrySheetActions): HTMLElement {
  const grams = 'grams' in p.entry.amount;
  let amount = 'grams' in p.entry.amount ? p.entry.amount.grams : p.entry.amount.servings;
  let slot = p.entry.slot;
  const toAmount = (v: number): FoodAmount => (grams ? { grams: v } : { servings: v });
  const shell = sheetShell({
    title: p.entry.label,
    key: 'entry-sheet',
    closeLabel: 'Close',
    onClose: a.onClose,
  });
  const preview = h('p', { class: 'fuel-preview', 'aria-live': 'polite', 'data-preview': true });
  const paint = () => {
    preview.textContent = macroLine(p.preview(toAmount(amount)), p.mode);
  };
  const step = stepper({
    label: 'Amount',
    key: 'amount',
    value: amount,
    step: grams ? GRAM_STEP : SERVING_STEP,
    min: grams ? GRAM_STEP : SERVING_STEP,
    unit: (v) => (grams ? 'g' : v === 1 ? 'serving' : 'servings'),
    onChange: (v) => {
      amount = v;
      paint();
    },
  });
  paint();
  shell.body.append(
    h('h2', { class: 'fuel-h2' }, 'Amount'),
    step,
    preview,
    h('h2', { class: 'fuel-h2' }, 'Meal'),
    slotChips(slot, (s) => {
      slot = s;
    }),
    // M13d task 40e: Delete (danger circle, the word shortened, name "Delete entry") + Save.
    saveRow(
      fuelMain({
        icon: 'check',
        label: 'Save',
        hooks: { 'data-entry-save': true },
        onClick: () => a.onSave({ amount: toAmount(amount), slot }),
      }),
      iconButton({
        icon: 'trash',
        label: 'Delete',
        ariaLabel: 'Delete entry',
        variant: 'danger',
        hooks: { 'data-entry-remove': true },
        onClick: () => a.onDelete(),
      }),
    ),
  );
  return shell.el;
}
