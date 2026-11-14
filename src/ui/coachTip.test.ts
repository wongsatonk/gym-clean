import { describe, expect, it } from 'vitest';
import { fromUnit } from '../core/units';
import { applySlot, appliedText, applyText, sameApply, weightLabel } from './coachTip';

const a3 = (weightKg: number) => ({
  rule: 'A3',
  text: 'Strong set. Try +5 lb next set.',
  why: 'Reps: 8, 8 · no partials',
  apply: { weightKg },
});
const a2 = { rule: 'A2', text: 'Keep the weight. Aim for 8 reps.', why: 'Set 2: 6 reps' };

describe('coach tip labels', () => {
  it('formats the weight in the display unit, lb-chosen kg values exactly', () => {
    expect(weightLabel(fromUnit(40, 'lb'), 'lb')).toBe('40 lb');
    expect(weightLabel(62.5, 'kg')).toBe('62.5 kg');
    expect(applyText(fromUnit(40, 'lb'), 'lb')).toBe('Apply 40 lb');
    expect(appliedText(fromUnit(40, 'lb'), 'lb')).toBe('Applied: 40 lb next set');
    expect(appliedText(17.5, 'kg')).toBe('Applied: 17.5 kg next set');
  });
});

describe('applySlot', () => {
  const on = { hasHandler: true, canApply: true, applied: false };
  it('offers a button only for advice with apply, a handler, and the same exercise up next', () => {
    expect(applySlot(a3(20), on)).toBe('button');
    expect(applySlot(a2, on)).toBe('none');
    expect(applySlot(null, on)).toBe('none');
    expect(applySlot(a3(20), { ...on, hasHandler: false })).toBe('none');
    expect(applySlot(a3(20), { ...on, canApply: false })).toBe('none');
  });
  it('shows the applied state once applied (no second tap), even if the next set moved on', () => {
    expect(applySlot(a3(20), { ...on, applied: true })).toBe('applied');
    expect(applySlot(a3(20), { ...on, applied: true, canApply: false })).toBe('applied');
    expect(applySlot(a2, { ...on, applied: true })).toBe('none');
  });
});

describe('sameApply', () => {
  it('keeps Applied only while the same weight is suggested', () => {
    expect(sameApply(a3(18.14), a3(18.14))).toBe(true);
    expect(sameApply(a3(18.1436948), a3(18.1437))).toBe(true);
    expect(sameApply(a3(20), a3(22.5))).toBe(false);
    expect(sameApply(a3(20), a2)).toBe(false);
    expect(sameApply(a2, a2)).toBe(false);
    expect(sameApply(a3(20), null)).toBe(false);
  });
});
