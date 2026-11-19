import { describe, expect, it } from 'vitest';
import { checkCopy } from '../../core/trainer/replies';
import type { FoodSuggestion } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { coachSheet, type CoachSheetActions, type CoachSheetProps } from './coachSheet';
import { buildFoodCard, macroText, portionText } from './foodCard';

useFakeDom();

// Made-up numbers only (public repo).
const FOOD: FoodSuggestion[] = [
  {
    label: 'Protein shake',
    ref: { foodId: 'seed-shake' },
    amount: { servings: 1 },
    macros: { kcal: 160, proteinG: 25 },
    why: 'Fits your 40 g protein left',
  },
  {
    label: 'Khao man gai',
    ref: { foodId: 'thai-khao-man-gai' },
    amount: { servings: 1.5 },
    macros: { kcal: 870.4, proteinG: 39.6 },
    why: '',
  },
  {
    label: 'Chicken breast',
    ref: { foodId: 'usda:1' },
    amount: { grams: 150 },
    macros: { kcal: 248, proteinG: 46.5 },
    why: 'Most protein per kcal',
  },
  { label: 'Fourth', ref: {}, amount: { servings: 2 }, macros: { kcal: 1, proteinG: 1 }, why: '' },
];

const attr = (el: FakeEl, name: string) => el.find((e) => e.hasAttribute(name));

describe('food card helpers', () => {
  it('portionText', () => {
    expect(portionText({ servings: 1 })).toBe('1 serving');
    expect(portionText({ servings: 1.5 })).toBe('1.5 servings');
    expect(portionText({ servings: 0.5 })).toBe('0.5 servings');
    expect(portionText({ grams: 149.6 })).toBe('150 g');
  });
  it('macroText', () => {
    expect(macroText({ macros: { kcal: 870.4, proteinG: 39.6 } })).toBe('870 kcal · 40 g protein');
  });
});

describe('buildFoodCard', () => {
  it('3 rows max: name, portion, kcal / protein, a Log button each', () => {
    const logs: number[] = [];
    const { el: raw, controls } = buildFoodCard(FOOD, { onLog: (i) => logs.push(i) });
    const el = asFake(raw);
    const rows = attr(el, 'data-food-row');
    expect(rows).toHaveLength(3);
    expect(rows[1]?.textContent).toContain('Khao man gai');
    expect(rows[1]?.textContent).toContain('1.5 servings · 870 kcal · 40 g protein');
    expect(rows[2]?.textContent).toContain('150 g · 248 kcal · 47 g protein');
    expect(rows[0]?.textContent).toContain('Fits your 40 g protein left');
    const btns = attr(el, 'data-food-log');
    expect(btns.map((b) => b.textContent)).toEqual(['Log', 'Log', 'Log']);
    expect(btns[1]?.getAttribute('aria-label')).toBe('Log Khao man gai');
    expect(controls).toHaveLength(3);
    btns[2]?.click();
    expect(logs).toEqual([2]);
    for (const t of el.find((e) => e.tag === '#text')) expect(checkCopy(t.text).ok).toBe(true);
  });

  it('M13d task 40f: Log is a secondary round button, word under, named for its food', () => {
    const { el: raw } = buildFoodCard(FOOD, { onLog: () => undefined });
    for (const b of attr(asFake(raw), 'data-food-log')) {
      expect(b.hasAttribute('data-icon-btn')).toBe(true);
      expect(b.getAttribute('data-variant')).toBe('secondary');
      expect(b.getAttribute('data-label-at')).toBe('below');
      expect(b.oneByClass('icon-btn-label').textContent).toBe('Log');
      expect(b.oneByClass('icon-btn-circle').byTag('svg')[0]?.getAttribute('data-icon')).toBe(
        'plus',
      );
      expect(b.getAttribute('aria-label')).toMatch(/^Log /);
    }
  });

  it('a logged row shows "Logged" instead of its button', () => {
    const { el: raw, controls } = buildFoodCard(FOOD, { onLog: () => undefined }, [0]);
    const el = asFake(raw);
    expect(attr(el, 'data-food-log').map((b) => b.getAttribute('data-food-log'))).toEqual([
      '1',
      '2',
    ]);
    expect(attr(el, 'data-food-logged')[0]?.textContent).toBe('Logged');
    expect(controls).toHaveLength(2);
  });
});

describe('coachSheet with the food card (M7 F2)', () => {
  const base: CoachSheetProps = { items: [{ kind: 'coach', text: 'Here are a few ideas.' }] };
  function render(p: Partial<CoachSheetProps>, withLog = true) {
    const logs: number[] = [];
    const a: CoachSheetActions = {
      onClose: () => undefined,
      onChip: () => undefined,
      onArea: () => undefined,
      onApply: () => undefined,
      onDismiss: () => undefined,
      onLogFood: withLog ? (i) => logs.push(i) : undefined,
    };
    return { el: asFake(coachSheet({ ...base, ...p }, a)), logs };
  }

  it('without the food prop the sheet is unchanged (no card)', () => {
    expect(attr(render({}).el, 'data-food-card')).toHaveLength(0);
  });

  it('draws the card inside the message list and routes Log', () => {
    const { el, logs } = render({ food: { suggestions: FOOD } });
    const list = el.oneByClass('cs-list');
    expect(attr(list, 'data-food-card')).toHaveLength(1);
    attr(el, 'data-food-log')[0]?.click();
    expect(logs).toEqual([0]);
    // The quick chips are still offered under it.
    expect(attr(el, 'data-coach-chip').length).toBeGreaterThan(0);
  });

  it('no card without onLogFood, with no suggestions, or while a red flag is up', () => {
    expect(attr(render({ food: { suggestions: FOOD } }, false).el, 'data-food-card')).toHaveLength(
      0,
    );
    expect(attr(render({ food: { suggestions: [] } }).el, 'data-food-card')).toHaveLength(0);
    const red = render({
      items: [{ kind: 'redFlag', text: 'Stop the workout for today and get checked by a doctor.' }],
      food: { suggestions: FOOD },
    });
    expect(attr(red.el, 'data-food-card')).toHaveLength(0);
  });

  it('Log buttons join the Tab cycle after Close', () => {
    const { el } = render({ food: { suggestions: FOOD } });
    const kd = el.listeners.get('keydown')?.[0];
    expect(kd).toBeTruthy();
    const doc = (globalThis as unknown as { document: { activeElement: unknown } }).document;
    const close = el.find((e) => e.tag === 'button' && e.textContent === 'Close')[0];
    doc.activeElement = close;
    kd?.({ key: 'Tab', shiftKey: false, preventDefault: () => undefined });
    expect(doc.activeElement).toBe(attr(el, 'data-food-log')[0]);
  });
});
