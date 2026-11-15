import { describe, expect, it } from 'vitest';
import { remaining } from '../../core/nutrition/day';
import type { TargetValue } from '../../core/types';
import { asFake, useFakeDom } from '../screens/testDom';
import { fuelRings, leftDisplay, ringDashOffset, ringFraction, ringRow } from './rings';

/** One core `remaining(...)` entry, the way fuelRings gets it. */
const left = (eaten: number, t: TargetValue) =>
  remaining({ kcal: eaten, proteinG: eaten }, { kcal: t, proteinG: t, carbsG: t, fatG: t }).kcal;

useFakeDom();

describe('ring math', () => {
  it('fraction is capped to 0..1 and 0 without a target', () => {
    expect(ringFraction(50, 200)).toBe(0.25);
    expect(ringFraction(300, 200)).toBe(1);
    expect(ringFraction(-5, 200)).toBe(0);
    expect(ringFraction(50, 0)).toBe(0);
  });

  it('leftDisplay on core remaining: counts down, then how far over', () => {
    const t = { value: 2800, estimate: false };
    expect(leftDisplay(left(1250, t))).toEqual({ value: 1550, over: false });
    expect(leftDisplay(left(2800, t))).toEqual({ value: 0, over: false });
    expect(leftDisplay(left(2920, t))).toEqual({ value: 120, over: true });
    // Under half a unit over reads "0 to go", never "+0".
    expect(leftDisplay(left(2800.4, t))).toEqual({ value: 0, over: false });
  });

  it('dash offset: full circle empty, 0 when complete', () => {
    expect(ringDashOffset(0)).toBeCloseTo(2 * Math.PI * 40);
    expect(ringDashOffset(1)).toBe(0);
    expect(ringDashOffset(2)).toBe(0);
  });
});

describe('ringRow', () => {
  it('shows what is left as the big number, the target and an estimate tag', () => {
    const row = asFake(ringRow('proteinG', left(95, { value: 140, estimate: true })));
    expect(row.getAttribute('data-ring')).toBe('proteinG');
    expect(row.oneByClass('fuel-left-num').textContent).toBe('45');
    expect(row.oneByClass('fuel-left-unit').textContent).toBe('g protein to go');
    expect(row.oneByClass('fuel-ring-of').textContent).toContain('95 of 140');
    expect(row.byClass('fuel-tag').map((t) => t.textContent)).toEqual(['estimate']);
    expect(row.textContent).toContain('68% of target');
  });

  it('over target: "+N" in words, a full success ring, no estimate tag on a hand target', () => {
    const row = asFake(ringRow('kcal', left(2920, { value: 2800, estimate: false })));
    expect(row.getAttribute('data-over')).toBe('true');
    expect(row.classes).toContain('done');
    expect(row.oneByClass('fuel-left-num').textContent).toBe('+120');
    expect(row.oneByClass('fuel-left-unit').textContent).toBe('kcal over target');
    expect(row.byClass('fuel-tag')).toHaveLength(0);
    const fg = row.oneByClass('fuel-ring-fg');
    expect(fg.classes).toContain('done');
    expect(fg.getAttribute('stroke-dashoffset')).toBe('0.0');
    // The ring itself is decorative.
    expect(row.byTag('svg')[0]?.getAttribute('aria-hidden')).toBe('true');
  });

  it('fuelRings renders one row per key for the mode (Quick: kcal + protein, Full: all 4)', () => {
    const t = { value: 100, estimate: true };
    const targets = { kcal: t, proteinG: t, carbsG: t, fatG: t };
    const quick = asFake(fuelRings('quick', { kcal: 10, proteinG: 5 }, targets));
    expect(quick.byClass('fuel-ring').map((r) => r.getAttribute('data-ring'))).toEqual([
      'kcal',
      'proteinG',
    ]);
    const full = asFake(fuelRings('full', { kcal: 10, proteinG: 5 }, targets));
    expect(full.byClass('fuel-ring')).toHaveLength(4);
    // Unknown carbs/fat count as 0 eaten.
    expect(full.find((e) => e.getAttribute('data-left') === 'fatG')[0]?.textContent).toBe('100');
  });
});
