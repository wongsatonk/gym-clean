import { describe, expect, it } from 'vitest';
import {
  CM_PER_IN,
  KG_PER_LB,
  cmToFtIn,
  defaultUnits,
  formatHeight,
  formatWeight,
  ftInToCm,
  fromUnit,
  lengthUnitFor,
  parseFtIn,
  snapToStep,
  stepFor,
  toUnit,
} from './units';
import { lengthUnitFor as reExported } from './progress/measurements';

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

describe('height: cm ↔ ft·in', () => {
  it('uses the exact inch', () => {
    expect(CM_PER_IN).toBe(2.54);
  });

  it('cmToFtIn gives whole inches with 12 carrying into feet', () => {
    expect(cmToFtIn(170)).toEqual({ ft: 5, inch: 7 });
    expect(cmToFtIn(170.18)).toEqual({ ft: 5, inch: 7 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 });
    // 5 ft 11.6 in rounds to 72 in → 6 ft 0 in, never "5 ft 12 in".
    expect(cmToFtIn(ftInToCm(5, 11.6))).toEqual({ ft: 6, inch: 0 });
    expect(cmToFtIn(ftInToCm(5, 11.4))).toEqual({ ft: 5, inch: 11 });
    expect(cmToFtIn(0)).toEqual({ ft: 0, inch: 0 });
  });

  it('ftInToCm is exact (no rounding) and carries inches past 12', () => {
    expect(ftInToCm(5, 7)).toBeCloseTo(170.18, 10);
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 10);
    expect(ftInToCm(5, 13)).toBeCloseTo(ftInToCm(6, 1), 10);
    expect(ftInToCm(0, 67)).toBeCloseTo(170.18, 10);
  });

  it('ft·in → cm → ft·in is exact for every whole-inch height 3 ft – 7 ft 11 in', () => {
    for (let ft = 3; ft <= 7; ft++) {
      for (let inch = 0; inch < 12; inch++) {
        expect(cmToFtIn(ftInToCm(ft, inch))).toEqual({ ft, inch });
      }
    }
  });

  it('cm → ft·in → cm stays within half an inch; the common heights within 1 cm', () => {
    // Whole inches can't carry more than ±0.5 in (1.27 cm); stored values stay cm, so this
    // rounding is display-only and never written back.
    for (let cm = 90; cm <= 240; cm += 0.1) {
      const { ft, inch } = cmToFtIn(cm);
      expect(Math.abs(ftInToCm(ft, inch) - cm)).toBeLessThanOrEqual(CM_PER_IN / 2 + 1e-9);
    }
    for (const cm of [150, 155, 160, 165, 170, 175, 180, 185, 190]) {
      const { ft, inch } = cmToFtIn(cm);
      expect(Math.abs(ftInToCm(ft, inch) - cm)).toBeLessThanOrEqual(1);
    }
  });
});

describe('formatHeight', () => {
  it('shows cm with one decimal at most', () => {
    expect(formatHeight(170, 'cm')).toBe('170 cm');
    expect(formatHeight(170.18, 'cm')).toBe('170.2 cm');
    expect(formatHeight(165.04, 'cm')).toBe('165 cm');
  });

  it('shows ft and whole inches, with the carry', () => {
    expect(formatHeight(170, 'in')).toBe('5 ft 7 in');
    expect(formatHeight(182.88, 'in')).toBe('6 ft 0 in');
    expect(formatHeight(ftInToCm(5, 11.6), 'in')).toBe('6 ft 0 in');
  });
});

describe('parseFtIn', () => {
  it.each([
    [`5'7"`, 67],
    [`5'7''`, 67],
    [`5′7″`, 67],
    [`5’7”`, 67],
    [`5' 7"`, 67],
    [`5'7`, 67],
    ['5 ft 7 in', 67],
    ['5ft7in', 67],
    ['5 ft 7', 67],
    ['5 feet 7 inches', 67],
    ['5 foot 7 inch', 67],
    ['5 7', 67],
    [`5'`, 60],
    ['5 ft', 60],
    ['67 in', 67],
    ['67in', 67],
    ['67"', 67],
    ['67 inches', 67],
    [`  5'7"  `, 67],
    ['5 FT 7 IN', 67],
    [`5'7.5"`, 67.5],
    ['5 7,5', 67.5],
  ])('%s → %d in', (raw, total) => {
    expect(parseFtIn(raw)).toBeCloseTo(total, 10);
  });

  it('carries inches of 12 or more', () => {
    expect(parseFtIn(`5'12"`)).toBe(72);
    expect(parseFtIn('5 13')).toBe(73);
    expect(parseFtIn('5 ft 14 in')).toBe(74);
  });

  it.each([
    [''],
    ['   '],
    ['abc'],
    ['5 ft 7 in tall'],
    [`-5'7"`],
    [`5'-7"`],
    ['5 -7'],
    ['-67 in'],
    ['5 7 2'],
    [`5'7'`],
    ['5..7'],
    ['67'],
    ['0 ft 0 in'],
    ['in'],
    ["'"],
    ['NaN in'],
    ['Infinity in'],
    ['1e3 in'],
  ])('rejects %j', (raw) => {
    expect(parseFtIn(raw)).toBeNull();
  });
});

describe('defaultUnits (from the phone region)', () => {
  it.each([
    ['en-US', 'lb', 'in'],
    ['es-US', 'lb', 'in'],
    ['en-LR', 'lb', 'in'],
    ['my-MM', 'lb', 'in'],
    ['en_US', 'lb', 'in'],
    ['th-TH', 'kg', 'cm'],
    ['en-GB', 'kg', 'cm'],
    ['de-DE', 'kg', 'cm'],
    ['en', 'kg', 'cm'],
    ['', 'kg', 'cm'],
    ['not a locale!!', 'kg', 'cm'],
  ])('%j → %s + %s', (locale, weight, length) => {
    expect(defaultUnits(locale)).toEqual({ weight, length });
  });

  it('no locale → kg + cm', () => {
    expect(defaultUnits()).toEqual({ weight: 'kg', length: 'cm' });
  });
});

describe('lengthUnitFor (no lengthUnit row: follows the weight unit)', () => {
  it('kg → cm, lb → in, and measurements re-exports the same function', () => {
    expect(lengthUnitFor('kg')).toBe('cm');
    expect(lengthUnitFor('lb')).toBe('in');
    expect(reExported).toBe(lengthUnitFor);
  });
});
