import { describe, expect, it } from 'vitest';
import type { FoodSuggestion, NutritionTargets } from '../../core/types';
import { fuelScreen, type FuelActions, type FuelProps } from '../screens/fuel';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { byAttr, copyHits, oneAttr } from './fuelTestUtil';
import {
  IDEA_TITLE,
  NUDGE_DISMISS,
  NUDGE_TITLE,
  postWorkoutIdea,
  proteinNudge,
  type ProteinNudgeProps,
} from './proteinNudge';

useFakeDom();

// Made-up numbers and text only (core writes the real sentence, task 21).
const NUDGE: ProteinNudgeProps = {
  mealKey: '2026-11-17:lunch',
  text: 'Lunch was light on protein. Eggs or yogurt would top it up.',
};
const IDEA: FoodSuggestion = {
  label: 'Greek yogurt + banana',
  ref: { foodId: 'yogurt' },
  amount: { servings: 1 },
  macros: { kcal: 260.4, proteinG: 22.6 },
  why: 'Fits your 40 g protein left',
};

describe('proteinNudge', () => {
  it('shows the title, core text, Why? and Got it; ≥ 56px buttons by class', () => {
    const el = asFake(proteinNudge(NUDGE, { onDismiss: () => {}, onWhy: () => {} }));
    expect(el.getAttribute('data-protein-nudge')).toBe(NUDGE.mealKey);
    expect(el.textContent).toContain(NUDGE_TITLE);
    expect(el.textContent).toContain(NUDGE.text);
    expect(oneAttr(el, 'data-protein-nudge-why').classes).toContain('learn-why');
    const dismiss = oneAttr(el, 'data-protein-nudge-dismiss');
    expect(dismiss.tag).toBe('button');
    expect(dismiss.textContent).toBe(NUDGE_DISMISS);
    expect(copyHits(el)).toEqual([]);
  });

  it('Got it hands back the meal key; Why? hands back its button', () => {
    const dismissed: string[] = [];
    const openers: unknown[] = [];
    const el = asFake(
      proteinNudge(NUDGE, { onDismiss: (k) => dismissed.push(k), onWhy: (o) => openers.push(o) }),
    );
    oneAttr(el, 'data-protein-nudge-dismiss').click();
    const why = oneAttr(el, 'data-protein-nudge-why');
    why.click();
    expect(dismissed).toEqual([NUDGE.mealKey]);
    expect(openers).toEqual([why]);
  });

  it('no Why? without onWhy', () => {
    const el = asFake(proteinNudge(NUDGE, { onDismiss: () => {} }));
    expect(byAttr(el, 'data-protein-nudge-why')).toHaveLength(0);
  });
});

describe('postWorkoutIdea', () => {
  it('one row: name, portion · kcal · protein, the reason, Log', () => {
    const logged: FoodSuggestion[] = [];
    const el = asFake(postWorkoutIdea({ suggestion: IDEA }, (s) => logged.push(s)));
    expect(el.textContent).toContain(IDEA_TITLE);
    expect(el.textContent).toContain('Greek yogurt + banana');
    expect(el.textContent).toContain('1 serving · 260 kcal · 23 g protein');
    expect(el.textContent).toContain(IDEA.why);
    const log = oneAttr(el, 'data-meal-idea-log');
    expect(log.getAttribute('aria-label')).toBe('Log Greek yogurt + banana');
    log.click();
    expect(logged).toEqual([IDEA]);
    expect(copyHits(el)).toEqual([]);
  });

  it('logged: a check + "Logged", no button', () => {
    const el = asFake(postWorkoutIdea({ suggestion: IDEA, logged: true }, () => {}));
    expect(byAttr(el, 'data-meal-idea-log')).toHaveLength(0);
    expect(oneAttr(el, 'data-meal-idea-logged').textContent).toBe('Logged');
  });
});

describe('Fuel screen slot', () => {
  const TARGETS: NutritionTargets = {
    kcal: { value: 2600, estimate: true },
    proteinG: { value: 140, estimate: true },
    carbsG: { value: 320, estimate: true },
    fatG: { value: 80, estimate: true },
  };
  const props = (over: Partial<FuelProps> = {}): FuelProps => ({
    now: new Date(2026, 10, 17, 13, 0).getTime(),
    mode: 'quick',
    targets: TARGETS,
    totals: { kcal: 700, proteinG: 18, carbsG: 90, fatG: 20 },
    entries: [],
    unit: 'kg',
    ...over,
  });
  const actions = (over: Partial<FuelActions> = {}): FuelActions => ({
    onLog: () => {},
    onEditEntry: () => {},
    onWeighIn: () => {},
    onSetup: () => {},
    onTab: () => {},
    ...over,
  });
  const order = (el: FakeEl) =>
    el.children.map(
      (c) =>
        (c.hasAttribute('data-protein-nudge') && 'nudge') ||
        (c.hasAttribute('data-log-open') && 'log') ||
        (c.classes.includes('fuel-entries') && 'entries') ||
        c.tag,
    );

  it('sits between Log food and today’s food when the nudge and onDismissProteinNudge are set', () => {
    const dismissed: string[] = [];
    const el = asFake(
      fuelScreen(
        props({ proteinNudge: NUDGE }),
        actions({ onDismissProteinNudge: (k) => dismissed.push(k), onProteinWhy: () => {} }),
      ),
    );
    const o = order(el);
    expect(o.indexOf('nudge')).toBe(o.indexOf('log') + 1);
    expect(o.indexOf('entries')).toBe(o.indexOf('nudge') + 1);
    oneAttr(el, 'data-protein-nudge-dismiss').click();
    expect(dismissed).toEqual([NUDGE.mealKey]);
    expect(byAttr(el, 'data-protein-nudge-why')).toHaveLength(1);
  });

  it('hidden without the nudge, with null, or without the dismiss callback; no Why? without onProteinWhy', () => {
    const cb = { onDismissProteinNudge: () => {} };
    expect(byAttr(asFake(fuelScreen(props(), actions(cb))), 'data-protein-nudge')).toHaveLength(0);
    expect(
      byAttr(asFake(fuelScreen(props({ proteinNudge: null }), actions(cb))), 'data-protein-nudge'),
    ).toHaveLength(0);
    expect(
      byAttr(asFake(fuelScreen(props({ proteinNudge: NUDGE }), actions())), 'data-protein-nudge'),
    ).toHaveLength(0);
    const noWhy = asFake(fuelScreen(props({ proteinNudge: NUDGE }), actions(cb)));
    expect(byAttr(noWhy, 'data-protein-nudge')).toHaveLength(1);
    expect(byAttr(noWhy, 'data-protein-nudge-why')).toHaveLength(0);
  });
});
