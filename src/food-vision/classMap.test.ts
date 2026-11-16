// M7b task 3: classifier label → Thai dish map. classMap.json is the single source of truth for
// the app and the Python pipeline (ml/), so these tests guard its shape and its link to the dish table.
import { describe, expect, it } from 'vitest';
import dishes from '../data/nutrition/thaiDishes.json';
import rawText from './classMap.json?raw';
import {
  CLASS_MAP,
  CLASS_LABELS,
  LABEL_PATTERN,
  classForDish,
  dishesForLabel,
  parseClassMap,
} from './classMap';

const dishIds = new Set(dishes.foods.map((f) => f.id));

describe('classMap.json', () => {
  it('has at least 2 classes with unique, lower snake ASCII labels', () => {
    expect(CLASS_LABELS.length).toBeGreaterThanOrEqual(2);
    expect(new Set(CLASS_LABELS).size).toBe(CLASS_LABELS.length);
    for (const label of CLASS_LABELS) expect(label).toMatch(LABEL_PATTERN);
  });

  it('gives every class at least one dish, and every dish exists in thaiDishes.json', () => {
    for (const label of CLASS_LABELS) {
      const ids = dishesForLabel(label);
      expect(ids.length, label).toBeGreaterThanOrEqual(1);
      for (const id of ids) expect(dishIds.has(id), `${label} → ${id}`).toBe(true);
    }
  });

  it('puts no dish in two classes', () => {
    const seen = new Map<string, string>();
    for (const label of CLASS_LABELS) {
      for (const id of dishesForLabel(label)) {
        expect(seen.get(id), `${id} in ${label}`).toBeUndefined();
        seen.set(id, label);
      }
    }
  });

  it('maps every dataset class name to at most one label', () => {
    const seen = new Set<string>();
    for (const label of CLASS_LABELS) {
      for (const names of Object.values(CLASS_MAP.classes[label]?.datasets ?? {})) {
        for (const n of names) {
          expect(seen.has(n), n).toBe(false);
          seen.add(n);
        }
      }
    }
  });

  it('groups look-alike variants under one class with the first dish as the default (M7b-q2)', () => {
    expect(dishesForLabel('pad_kra_pao')[0]).toBe('thai:pad-kra-pao-moo-rice-egg');
    expect(dishesForLabel('pad_kra_pao')).toContain('thai:pad-kra-pao-goong-rice-egg');
    expect(classForDish('thai:pad-kra-pao-gai-rice-egg')).toBe('pad_kra_pao');
  });

  it('returns no dishes for an unknown label and no class for an unmapped dish', () => {
    expect(dishesForLabel('nope')).toEqual([]);
    expect(dishesForLabel('__proto__')).toEqual([]);
    expect(classForDish('thai:khao-suay')).toBeUndefined();
  });

  it('accepts the committed JSON', () => {
    expect(parseClassMap(JSON.parse(rawText))).toEqual(CLASS_MAP);
  });
});

describe('parseClassMap', () => {
  const ok = { version: 1, classes: { a_b: { dishes: ['thai:x'] }, c: { dishes: ['thai:y'] } } };

  it('accepts a minimal valid map', () => {
    expect(Object.keys(parseClassMap(ok).classes)).toEqual(['a_b', 'c']);
  });

  it.each([
    ['not an object', 42],
    ['no classes', { version: 1 }],
    ['bad label', { version: 1, classes: { 'Pad-Thai': { dishes: ['thai:x'] } } }],
    ['empty dishes', { version: 1, classes: { a: { dishes: [] } } }],
    ['non-thai dish id', { version: 1, classes: { a: { dishes: ['usda:1'] } } }],
    ['dish in two classes', { version: 1, classes: { a: { dishes: ['thai:x'] }, b: { dishes: ['thai:x'] } } }],
    ['bad datasets', { version: 1, classes: { a: { dishes: ['thai:x'], datasets: { thfood50: 'X' } } } }],
  ])('rejects %s', (_name, value) => {
    expect(() => parseClassMap(value)).toThrow();
  });
});
