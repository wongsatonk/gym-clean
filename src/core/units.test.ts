import { describe, expect, it } from 'vitest';
import { KG_PER_LB, formatWeight, fromUnit, snapToStep, stepFor, toUnit } from './units';

describe('units', () => {
  it('converts kg <-> lb', () => {
    expect(toUnit(KG_PER_LB * 45, 'lb')).toBeCloseTo(45, 10);
    expect(fromUnit(45, 'lb')).toBeCloseTo(20.41165665, 6);
    expect(toUnit(20, 'kg')).toBe(20);
    expect(fromUnit(20, 'kg')).toBe(20);
  });

  it('has a step per unit', () => {
    expect(stepFor('kg')).toBe(2.5);
    expect(stepFor('lb')).toBe(5);
  });

  it('snaps a kg weight to the nearest step in the display unit', () => {
    expect(toUnit(snapToStep(20, 'lb'), 'lb')).toBeCloseTo(45, 10);
    expect(snapToStep(21, 'kg')).toBe(20);
    expect(snapToStep(21.3, 'kg')).toBe(22.5);
    expect(snapToStep(0, 'lb')).toBe(0);
  });

  it('formats a kg weight in the display unit, trimming noise', () => {
    expect(formatWeight(20, 'kg')).toBe('20');
    expect(formatWeight(22.5, 'kg')).toBe('22.5');
    expect(formatWeight(fromUnit(45, 'lb'), 'lb')).toBe('45');
    expect(formatWeight(20, 'lb')).toBe('44.1');
    expect(formatWeight(1000, 'lb')).toBe('2,204.6');
  });
});
