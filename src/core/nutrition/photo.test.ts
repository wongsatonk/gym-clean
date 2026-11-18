import { describe, expect, it } from 'vitest';
import type { Food } from '../types';
import { THAI_PORTIONS, entryFromFood } from './portions';
import { entryFromPhoto } from './photo';

// Made-up test values.
const DISH: Food = {
  id: 'thai:test-fried-rice',
  name: 'Test fried rice',
  nameTh: 'ข้าวผัด',
  source: 'thai-estimate',
  basis: { servingLabel: '1 plate', servingG: 300 },
  portions: [...THAI_PORTIONS],
  kcal: 600,
  proteinG: 20,
  carbsG: 80,
  fatG: 22,
  note: 'Reference recipe (made-up test values)',
};
const CHICKEN: Food = {
  id: 'usda:1',
  name: 'Chicken breast',
  source: 'usda',
  basis: { per100g: true },
  kcal: 165,
  proteinG: 31,
};

const T = new Date(2026, 10, 15, 12, 30).getTime();
const OPTS = { id: 'p1', time: T, slot: 'lunch' as const };

describe('entryFromPhoto', () => {
  it('Large equals entryFromFood with portion Large, plus photo fields', () => {
    const e = entryFromPhoto(DISH, 'Large', 0.82, OPTS);
    const base = entryFromFood(DISH, { servings: 1 }, { ...OPTS, portion: 'Large' });
    expect(base).not.toBeNull();
    expect(e).toEqual({ ...base, source: 'photo-local', estimate: true, photoConfidence: 0.82 });
    expect(e?.kcal).toBe(840);
    expect(e?.label).toBe('Test fried rice (Large)');
  });

  it('Small and Regular match entryFromFood', () => {
    for (const portion of ['Small', 'Regular'] as const) {
      const e = entryFromPhoto(DISH, portion, 0.7, OPTS);
      const base = entryFromFood(DISH, { servings: 1 }, { ...OPTS, portion });
      expect(e).toEqual({ ...base, source: 'photo-local', estimate: true, photoConfidence: 0.7 });
    }
    expect(entryFromPhoto(DISH, 'Small', 0.7, OPTS)?.kcal).toBe(450);
    expect(entryFromPhoto(DISH, 'Regular', 0.7, OPTS)?.label).toBe('Test fried rice');
  });

  it('always source photo-local and estimate true, ref keeps the dish id', () => {
    const e = entryFromPhoto(DISH, 'Regular', 0.9, OPTS);
    expect(e?.source).toBe('photo-local');
    expect(e?.estimate).toBe(true);
    expect(e?.ref).toEqual({ foodId: 'thai:test-fried-rice' });
    expect(e?.amount).toEqual({ servings: 1 });
  });

  it('rounds confidence to 2 decimals', () => {
    expect(entryFromPhoto(DISH, 'Regular', 0.8234, OPTS)?.photoConfidence).toBe(0.82);
    expect(entryFromPhoto(DISH, 'Regular', 0.616, OPTS)?.photoConfidence).toBe(0.62);
    expect(entryFromPhoto(DISH, 'Regular', 0.999, OPTS)?.photoConfidence).toBe(1);
    expect(entryFromPhoto(DISH, 'Regular', 0, OPTS)?.photoConfidence).toBe(0);
    expect(entryFromPhoto(DISH, 'Regular', 1, OPTS)?.photoConfidence).toBe(1);
  });

  it('rejects confidence outside 0–1 or not finite', () => {
    for (const c of [-0.01, 1.01, Number.NaN, Infinity, -Infinity]) {
      expect(entryFromPhoto(DISH, 'Regular', c, OPTS)).toBeNull();
    }
  });

  it('search case: no confidence → source kept, no photoConfidence key', () => {
    const e = entryFromPhoto(DISH, 'Regular', undefined, OPTS);
    expect(e?.source).toBe('photo-local');
    expect(e?.estimate).toBe(true);
    expect(e && 'photoConfidence' in e).toBe(false);
  });

  it('rejects unknown portions and non-Thai dishes', () => {
    expect(entryFromPhoto(DISH, 'Huge', 0.8, OPTS)).toBeNull();
    expect(entryFromPhoto(DISH, '', 0.8, OPTS)).toBeNull();
    expect(entryFromPhoto(CHICKEN, 'Regular', 0.8, OPTS)).toBeNull();
    expect(entryFromPhoto({ ...DISH, id: 'thai-x' }, 'Regular', 0.8, OPTS)).toBeNull();
    expect(entryFromPhoto({ ...DISH, source: 'custom' }, 'Regular', 0.8, OPTS)).toBeNull();
  });

  it('a dish with its own portion list only accepts those labels', () => {
    const d: Food = { ...DISH, portions: [{ label: 'Regular', factor: 1 }] };
    expect(entryFromPhoto(d, 'Large', 0.8, OPTS)).toBeNull();
    expect(entryFromPhoto(d, 'Regular', 0.8, OPTS)?.kcal).toBe(600);
  });
});
