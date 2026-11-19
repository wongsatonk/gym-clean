import { describe, expect, it } from 'vitest';
import { TEXT_SIZES, isTextSize, textScale } from './textSize';

describe('textScale (M13d task 20)', () => {
  it('maps each size to body / cue / lead / label px', () => {
    expect(textScale('standard')).toEqual({ body: 20, cue: 22, lead: 26, label: 18 });
    expect(textScale('large')).toEqual({ body: 22, cue: 24, lead: 28, label: 20 });
    expect(textScale('larger')).toEqual({ body: 24, cue: 26, lead: 30, label: 22 });
  });

  it('only scales words: numbers, timers and tab labels are not in the map', () => {
    for (const size of TEXT_SIZES) {
      expect(Object.keys(textScale(size)).sort()).toEqual(['body', 'cue', 'label', 'lead']);
    }
  });

  it('never goes below the readability floor (body ≥ 20px, labels ≥ 18px) and grows with each step', () => {
    expect(TEXT_SIZES).toEqual(['standard', 'large', 'larger']);
    const bodies = TEXT_SIZES.map((size) => textScale(size).body);
    for (const size of TEXT_SIZES) {
      expect(textScale(size).body).toBeGreaterThanOrEqual(20);
      expect(textScale(size).label).toBeGreaterThanOrEqual(18);
    }
    expect(bodies).toEqual([...bodies].sort((x, y) => x - y));
    expect(new Set(bodies).size).toBe(3);
  });

  it('returns a fresh object (callers may not change the shared map)', () => {
    const t = textScale('standard');
    t.body = 99;
    expect(textScale('standard').body).toBe(20);
  });

  it('isTextSize accepts only the three sizes', () => {
    for (const s of TEXT_SIZES) expect(isTextSize(s)).toBe(true);
    for (const v of ['huge', '', null, undefined, 1, 'Standard']) expect(isTextSize(v)).toBe(false);
  });
});
