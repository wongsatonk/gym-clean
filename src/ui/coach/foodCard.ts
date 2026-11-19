// M7 F2 (replaces M10 F2): the coach's food result card. Up to 3 suggestions from core
// `suggestFood(...)`, each a row with the name, the portion, kcal / protein and a Log button
// (≥ 56px; M13d task 40f: a round icon button, its name still "Log <food>"). Props in, callbacks out; the app logs the entry, shows the Undo toast and re-renders
// with `logged` set for that row.
//
// e2e hooks: `[data-food-card]`, `[data-food-row=<index>]`, `[data-food-log=<index>]`.
import type { FoodAmount, FoodSuggestion } from '../../core/types';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import './foodCard.css';
import './coachButtons.css';

/** "1 serving", "1.5 servings", "200 g". Pure. */
export function portionText(amount: FoodAmount): string {
  if ('grams' in amount) return `${Math.round(amount.grams)} g`;
  const n = Math.round(amount.servings * 100) / 100;
  return `${n} ${n === 1 ? 'serving' : 'servings'}`;
}

/** "520 kcal · 32 g protein". Pure. */
export function macroText(s: Pick<FoodSuggestion, 'macros'>): string {
  return `${Math.round(s.macros.kcal)} kcal · ${Math.round(s.macros.proteinG)} g protein`;
}

export type FoodCardActions = { onLog: (index: number) => void };

/** At most 3 rows (SPEC). `logged` marks rows already logged (their button is replaced). */
export function buildFoodCard(
  suggestions: readonly FoodSuggestion[],
  a: FoodCardActions,
  logged: readonly number[] = [],
): { el: HTMLElement; controls: HTMLElement[] } {
  const controls: HTMLElement[] = [];
  const rows = suggestions.slice(0, 3).map((s, index) => {
    const done = logged.includes(index);
    const btn = done
      ? h(
          'span',
          { class: 'fc-logged', 'data-food-logged': index },
          icon('check', 'sm'),
          h('span', {}, 'Logged'),
        )
      : // M13d task 40f: a secondary round button, "Log" under the circle; the name says which.
        iconButton({
          icon: 'plus',
          label: 'Log',
          ariaLabel: `Log ${s.label}`,
          class: 'fc-log-btn',
          hooks: { 'data-food-log': String(index) },
          onClick: () => a.onLog(index),
        });
    if (!done) controls.push(btn);
    return h(
      'li',
      { class: 'fc-row', 'data-food-row': index },
      h(
        'div',
        { class: 'fc-txt' },
        h('span', { class: 'fc-name' }, s.label),
        h('span', { class: 'fc-meta' }, `${portionText(s.amount)} · ${macroText(s)}`),
        s.why ? h('span', { class: 'fc-why' }, s.why) : null,
      ),
      btn,
    );
  });
  const el = h(
    'section',
    { class: 'fc-card', 'data-food-card': true, 'aria-label': 'Food ideas' },
    h('h3', { class: 'fc-title' }, icon('flame', 'sm'), h('span', {}, 'Ideas that fit today')),
    h('ol', { class: 'fc-list' }, ...rows),
  );
  return { el, controls };
}
