// M12 slice 1b task 33 (SPEC M12 trainer kit item 12 "Nutrition nudges"): two small Fuel pieces.
//
// - proteinNudge: the protein-per-meal nudge on the Fuel tab. Core (task 21,
//   src/core/nutrition/nudges.ts) decides when a logged meal is light on protein versus his
//   per-meal share and writes the sentence; this only draws it: the text, a "Why?" button that
//   opens the protein learn card (learnCard.ts) and "Got it", which dismisses it for that meal
//   (main records the meal key, so it shows once per meal). Shown, never spoken (Fuel is off the
//   workout). The text is about food only: no body numbers, no judgement words.
// - postWorkoutIdea: the post-workout meal idea on Summary. The idea is the M10 coach food
//   suggestion (core `suggestFood`, a `FoodSuggestion`) passed in; one row with the name, the
//   portion, kcal / protein, its plain reason and Log (≥ 56px). After Log, main re-renders with
//   `logged: true` and the row shows a check + "Logged" (achieved, not a button).
//
// e2e hooks: `[data-protein-nudge=<mealKey>]`, `[data-protein-nudge-why]`,
// `[data-protein-nudge-dismiss]`; `[data-meal-idea]`, `[data-meal-idea-log]`,
// `[data-meal-idea-logged]`.
import type { FoodSuggestion } from '../../core/types';
import { macroText, portionText } from '../coach/foodCard';
import { whyButton } from '../coach/learnCard';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import './proteinNudge.css';

export const NUDGE_TITLE = 'Protein check';
export const NUDGE_DISMISS = 'Got it';
export const IDEA_TITLE = 'After your workout';

export type ProteinNudgeProps = {
  /** Which meal it is about (core's key; the same key is passed back on dismiss). */
  mealKey: string;
  /** Core's sentence, e.g. "Lunch was light on protein. Eggs or yogurt would top it up." */
  text: string;
};

export type ProteinNudgeActions = {
  /** "Got it": hide it for this meal (main records the key). */
  onDismiss: (mealKey: string) => void;
  /** "Why?": main opens the protein learn card with `openLearnCard(card, opener)`. Omit → no link. */
  onWhy?: ((opener: HTMLElement) => void) | undefined;
};

export function proteinNudge(p: ProteinNudgeProps, a: ProteinNudgeActions): HTMLElement {
  return h(
    'section',
    {
      class: 'pn',
      'data-protein-nudge': p.mealKey,
      'aria-labelledby': 'pn-title',
    },
    h('h2', { class: 'pn-title', id: 'pn-title' }, icon('bowl', 'sm'), h('span', {}, NUDGE_TITLE)),
    h('p', { class: 'pn-text' }, p.text),
    h(
      'div',
      { class: 'pn-actions' },
      a.onWhy
        ? whyButton(a.onWhy, {
            label: 'Why? About protein',
            attrs: { 'data-protein-nudge-why': true },
          })
        : null,
      iconButton({
        icon: 'check',
        label: NUDGE_DISMISS,
        class: 'pn-dismiss',
        hooks: { 'data-protein-nudge-dismiss': true },
        onClick: () => a.onDismiss(p.mealKey),
      }),
    ),
  );
}

export type MealIdea = {
  /** The M10 coach food suggestion (core `suggestFood(...)`, first result). */
  suggestion: FoodSuggestion;
  /** Already logged from here: show "Logged" instead of Log. */
  logged?: boolean | undefined;
};

export function postWorkoutIdea(idea: MealIdea, onLog: (s: FoodSuggestion) => void): HTMLElement {
  const s = idea.suggestion;
  const action = idea.logged
    ? h(
        'span',
        { class: 'fc-logged', 'data-meal-idea-logged': true },
        icon('check', 'sm'),
        h('span', {}, 'Logged'),
      )
    : // M13d task 40e (Summary: styling only): a round button, its hit box not under the old
      // 96 × 56 (proteinNudge.css).
      iconButton({
        icon: 'plus',
        label: 'Log',
        ariaLabel: `Log ${s.label}`,
        class: 'meal-idea-log',
        hooks: { 'data-meal-idea-log': true },
        onClick: () => onLog(s),
      });
  return h(
    'section',
    { class: 'fc-card meal-idea', 'data-meal-idea': true, 'aria-labelledby': 'meal-idea-title' },
    h(
      'h2',
      { class: 'fc-title', id: 'meal-idea-title' },
      icon('bowl', 'sm'),
      h('span', {}, IDEA_TITLE),
    ),
    h(
      'div',
      { class: 'fc-row meal-idea-row' },
      h(
        'div',
        { class: 'fc-txt' },
        h('span', { class: 'fc-name' }, s.label),
        h('span', { class: 'fc-meta' }, `${portionText(s.amount)} · ${macroText(s)}`),
        s.why ? h('span', { class: 'fc-why' }, s.why) : null,
      ),
      action,
    ),
  );
}
