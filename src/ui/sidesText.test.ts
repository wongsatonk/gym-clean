import { describe, expect, it } from 'vitest';
import {
  hasSides,
  sidedSetAria,
  sidedSetLines,
  sidedSetText,
  sidesAria,
  sidesLineText,
  sidesRepsText,
} from './sidesText';

const S = (r: number, l: number, rp = 0, lp = 0) => ({
  right: { reps: r, partials: rp },
  left: { reps: l, partials: lp },
});

describe('per-side set text (M13b)', () => {
  it('reads right first, then left: "R 12 · L 11"', () => {
    expect(sidesRepsText(S(12, 11))).toBe('R 12 · L 11');
    expect(
      sidesRepsText({ left: { reps: 9, partials: 0 }, right: { reps: 10, partials: 0 } }),
    ).toBe('R 10 · L 9');
  });

  it('a missing side is left out', () => {
    expect(sidesRepsText({ right: { reps: 12, partials: 0 } })).toBe('R 12');
    expect(sidesRepsText({ left: { reps: 7, partials: 0 } })).toBe('L 7');
  });

  it('spells the sides out for screen readers', () => {
    expect(sidesAria(S(12, 11))).toBe('Right 12, left 11 reps');
    expect(sidesAria({ right: { reps: 1, partials: 0 } })).toBe('Right 1 rep');
  });

  it('a set: "R 12 · L 11 × 20 kg", bodyweight "R 12 · L 11 reps"', () => {
    expect(sidedSetText({ reps: 11, weightKg: 20, sides: S(12, 11) }, 'kg')).toBe(
      'R 12 · L 11 × 20 kg',
    );
    expect(sidedSetText({ reps: 11, weightKg: 0, sides: S(12, 11) }, 'kg')).toBe(
      'R 12 · L 11 reps',
    );
    expect(sidedSetText({ reps: 11, weightKg: 20, sides: S(12, 11) }, 'lb')).toBe(
      'R 12 · L 11 × 44.1 lb',
    );
  });

  it('a set without sides reads as before ("12 × 20 kg" / "12 reps")', () => {
    expect(sidedSetText({ reps: 12, weightKg: 20 }, 'kg')).toBe('12 × 20 kg');
    expect(sidedSetText({ reps: 1, weightKg: 0 }, 'kg')).toBe('1 rep');
  });

  it('hasSides: only a set with at least one side', () => {
    expect(hasSides({})).toBe(false);
    expect(hasSides({ sides: {} })).toBe(false);
    expect(hasSides({ sides: { left: { reps: 0, partials: 0 } } })).toBe(true);
  });

  it('sidedSetLines: one line per set when any set has sides, else null (old text unchanged)', () => {
    expect(
      sidedSetLines(
        [
          { reps: 12, weightKg: 20 },
          { reps: 10, weightKg: 20 },
        ],
        'kg',
      ),
    ).toBeNull();
    expect(
      sidedSetLines(
        [
          { reps: 11, weightKg: 20, sides: S(12, 11) },
          { reps: 10, weightKg: 20 },
        ],
        'kg',
      ),
    ).toEqual(['R 12 · L 11 × 20 kg', '10 × 20 kg']);
  });

  it('the Fix line: "R 12 · L 11", partials of both sides added when any', () => {
    expect(sidesLineText(S(12, 11))).toBe('R 12 · L 11');
    expect(sidesLineText(S(12, 11, 1, 0))).toBe('R 12 · L 11 · 1 partial');
    expect(sidesLineText(S(12, 11, 1, 2))).toBe('R 12 · L 11 · 3 partials');
  });

  it('spoken set label: with the weight, null without sides', () => {
    expect(sidedSetAria({ reps: 11, weightKg: 20, sides: S(12, 11) }, 'kg')).toBe(
      'Right 12, left 11 reps × 20 kg',
    );
    expect(sidedSetAria({ reps: 11, weightKg: 0, sides: S(12, 11) }, 'kg')).toBe(
      'Right 12, left 11 reps',
    );
    expect(sidedSetAria({ reps: 11, weightKg: 20 }, 'kg')).toBeNull();
  });
});
