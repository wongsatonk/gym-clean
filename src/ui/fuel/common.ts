// M7 Fuel: small shared pieces for the Fuel screens (formatting, the "estimate" tag, the portion
// stepper, the sheet shell with its focus trap). Pure render helpers: no DB, no speech.
import type { FoodAmount, MacroSet, MealSlot, NutritionMode } from '../../core/types';
import { h } from '../dom';
import { installSheetSwipe } from '../gestures/sheetSwipe';
import { iconButton } from '../iconButton';
import { moodClass } from '../tokens';
import '../chromeButtons.css';
import './fuel.css';

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snack: 'Snack',
  dinner: 'Dinner',
  'post-workout': 'Post-workout',
};

/** Slot chips order (M7-q1 day order; post-workout last, it can fall anywhere). */
export const SLOT_ORDER: readonly MealSlot[] = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
  'post-workout',
];

/** "1,850" (whole numbers, grouped). */
export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "0.5", "1", "1.5" (no trailing zeros). */
export function fmtAmount(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** "1 serving", "1.5 servings", "150 g". */
export function amountText(a: FoodAmount): string {
  if ('grams' in a) return `${fmtNum(a.grams)} g`;
  return `${fmtAmount(a.servings)} ${a.servings === 1 ? 'serving' : 'servings'}`;
}

/** "520 kcal · 32 g protein" (+ carbs · fat in Full mode when known). */
export function macroLine(m: MacroSet, mode: NutritionMode): string {
  const parts = [`${fmtNum(m.kcal)} kcal`, `${fmtNum(m.proteinG)} g protein`];
  if (mode === 'full') {
    if (m.carbsG !== undefined) parts.push(`${fmtNum(m.carbsG)} g carbs`);
    if (m.fatG !== undefined) parts.push(`${fmtNum(m.fatG)} g fat`);
  }
  return parts.join(' · ');
}

/** The "estimate" tag next to a computed or rough number (a word, never colour alone). */
export function estimateTag(): HTMLElement {
  return h('span', { class: 'fuel-tag', 'data-estimate': true }, 'estimate');
}

/** M11: the "from Health" tag on a weigh-in imported from Apple Health (a word, a static label). */
export function fromHealthTag(): HTMLElement {
  return h('span', { class: 'fuel-tag', 'data-from-health': true }, 'from Health');
}

/** append() that skips null / undefined / false (optional parts). */
export function appendAll(
  el: HTMLElement,
  ...nodes: (Node | string | null | undefined | false)[]
): void {
  for (const n of nodes) if (n !== null && n !== undefined && n !== false) el.append(n);
}

/** Empties an element (works with the test DOM too). */
export function clear(el: HTMLElement): void {
  el.textContent = '';
}

export type StepperOpts = {
  /** Accessible name of the group, e.g. "Portion". */
  label: string;
  value: number;
  step: number;
  min: number;
  max?: number | undefined;
  /** "servings" / "g", shown under the number. */
  unit: (v: number) => string;
  onChange: (v: number) => void;
  /** e2e / test hook. */
  key: string;
};

/**
 * A [−] value [+] stepper: 64px number (`.stepper-value`) between round − / + buttons with
 * "Less" / "More" under the circle (M13d, as fields.ts's number field). Names stay
 * "Less <label>" / "More <label>"; `data-step` = down / up.
 */
export function stepper(o: StepperOpts): HTMLElement & { set: (v: number) => void } {
  let value = o.value;
  const num = h('span', { class: 'stepper-value fuel-step-num' }, fmtAmount(value));
  const unit = h('span', { class: 'fuel-step-unit' }, o.unit(value));
  const roundStep = (dir: -1 | 1) =>
    iconButton({
      icon: dir < 0 ? 'minus' : 'plus',
      label: dir < 0 ? 'Less' : 'More',
      ariaLabel: `${dir < 0 ? 'Less' : 'More'} ${o.label.toLowerCase()}`,
      class: 'fuel-step-btn',
      hooks: { 'data-step': dir < 0 ? 'down' : 'up' },
      onClick: () => {
        set(value + dir * o.step);
        o.onChange(value);
      },
    });
  const minus = roundStep(-1);
  const plus = roundStep(1);
  const paint = () => {
    num.textContent = fmtAmount(value);
    unit.textContent = o.unit(value);
    if (value <= o.min) minus.setAttribute('disabled', '');
    else minus.removeAttribute('disabled');
    if (o.max !== undefined && value >= o.max) plus.setAttribute('disabled', '');
    else plus.removeAttribute('disabled');
  };
  const set = (v: number) => {
    const max = o.max ?? Infinity;
    value = Math.min(max, Math.max(o.min, Math.round(v * 100) / 100));
    paint();
  };
  const el = h(
    'div',
    { class: 'fuel-stepper', role: 'group', 'aria-label': o.label, 'data-stepper': o.key },
    minus,
    h('output', { class: 'fuel-step-out', 'aria-live': 'polite' }, num, unit),
    plus,
  );
  paint();
  return Object.assign(el, { set });
}

/** A labelled text field (visible label above, `for`/`id` linked). Numbers use inputmode. */
export function field(o: {
  id: string;
  label: string;
  value?: string | undefined;
  numeric?: boolean | undefined;
  hint?: string | undefined;
  onInput?: ((v: string) => void) | undefined;
  type?: 'text' | 'search' | undefined;
}): { wrap: HTMLElement; input: HTMLInputElement; error: HTMLElement } {
  const input = h('input', {
    id: o.id,
    class: 'fuel-input',
    type: o.type ?? 'text',
    value: o.value,
    inputmode: o.numeric ? 'decimal' : undefined,
    autocomplete: 'off',
    enterkeyhint: 'done',
    'aria-describedby': `${o.id}-err`,
  });
  if (o.value !== undefined) (input as { value: string }).value = o.value;
  if (o.onInput) {
    const cb = o.onInput;
    input.addEventListener('input', () => cb(inputValue(input)));
  }
  const error = h('p', { class: 'fuel-error', id: `${o.id}-err`, 'aria-live': 'polite' });
  const wrap = h(
    'div',
    { class: 'fuel-field', 'data-field': o.id },
    h('label', { class: 'fuel-label', for: o.id }, o.label),
    o.hint ? h('p', { class: 'fuel-hint' }, o.hint) : null,
    input,
    error,
  );
  return { wrap, input, error };
}

/** An input's current text ('' when unset). */
export function inputValue(input: HTMLInputElement): string {
  return String((input as { value?: unknown }).value ?? '').trim();
}

/** Parses "1,5" / "1.5" / "320"; null when empty or not a number ≥ 0. */
export function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type SheetShell = {
  el: HTMLElement;
  body: HTMLElement;
  title: HTMLElement;
};

/**
 * A full-screen sheet (Pro mood): a title row with a quiet round Close / Cancel, a scrolling body.
 * Escape calls `onEscape`; Tab / Shift+Tab stay inside the sheet (focus trap, as in the Pause
 * sheet). The app makes the page behind inert. Swipe down (at the top) = the Close button (M13d),
 * until the sheet has unsaved changes (any input / change event inside it).
 */
export function sheetShell(o: {
  title: string;
  key: string;
  closeLabel: string;
  onClose: () => void;
  onEscape?: (() => void) | undefined;
}): SheetShell {
  const title = h('h1', { class: 'page-title fuel-sheet-title', id: `${o.key}-title` }, o.title);
  const body = h('div', { class: 'fuel-sheet-body' });
  // M13d task 40a: Close / Cancel is a quiet round icon button with the word beside it.
  const close = iconButton({
    icon: 'close',
    label: o.closeLabel,
    variant: 'quiet',
    labelAt: 'beside',
    class: 'fuel-sheet-close chrome-close',
    hooks: { 'data-close': true },
    onClick: () => o.onClose(),
  });
  const el = h(
    'div',
    {
      class: `fuel-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': `${o.key}-title`,
      tabindex: '-1',
      [`data-${o.key}`]: true,
    },
    h('div', { class: 'fuel-sheet-top' }, title, close),
    body,
  );
  // M13d task 25: swipe down = this Close / Cancel (the whole sheet follows; scrolled: scrolls).
  // Once anything is typed or changed in the sheet it is "dirty" and the swipe is removed for
  // good (like iOS isModalInPresentation): a stray swipe never drops an edit. Close still works.
  const unswipe = installSheetSwipe(el, { close: () => close.click() });
  const dirty = () => {
    unswipe();
    el.removeEventListener('input', dirty);
    el.removeEventListener('change', dirty);
  };
  el.addEventListener('input', dirty);
  el.addEventListener('change', dirty);
  el.addEventListener('keydown', (ev) => {
    const e = ev as KeyboardEvent;
    if (e.key === 'Escape') {
      e.preventDefault();
      (o.onEscape ?? o.onClose)();
      return;
    }
    if (e.key === 'Tab') trapTab(el, e);
  });
  return { el, body, title };
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select, textarea, [href]';

/** Keeps Tab / Shift+Tab inside `root`. */
export function trapTab(root: HTMLElement, e: KeyboardEvent): void {
  if (typeof root.querySelectorAll !== 'function') return;
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (items.length === 0) return;
  const at = items.indexOf(document.activeElement as HTMLElement);
  const n = items.length;
  if (at < 0) {
    e.preventDefault();
    items[e.shiftKey ? n - 1 : 0]?.focus();
    return;
  }
  if (!e.shiftKey && at === n - 1) {
    e.preventDefault();
    items[0]?.focus();
  } else if (e.shiftKey && at === 0) {
    e.preventDefault();
    items[n - 1]?.focus();
  }
}
