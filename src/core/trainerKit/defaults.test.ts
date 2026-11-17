import { describe, expect, it } from 'vitest';
import { TRAINER_KIT_DEFAULTS, mergeTrainerKit } from './defaults';

describe('TRAINER_KIT_DEFAULTS (M12-q4)', () => {
  it('holds the planner defaults', () => {
    expect(TRAINER_KIT_DEFAULTS).toEqual({
      measurementSites: [
        'leftArm',
        'rightArm',
        'chest',
        'waist',
        'hips',
        'leftThigh',
        'rightThigh',
      ],
      e1rmFormula: 'epley',
      warmups: 'firstHeavyLift',
      reviewWeeks: 5,
    });
  });

  it('cannot be changed by a caller', () => {
    expect(Object.isFrozen(TRAINER_KIT_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(TRAINER_KIT_DEFAULTS.measurementSites)).toBe(true);
  });
});

describe('mergeTrainerKit', () => {
  it('returns the defaults for no row or a non-object row', () => {
    for (const row of [undefined, null, 'x', 7, [], true]) {
      expect(mergeTrainerKit(row)).toEqual(TRAINER_KIT_DEFAULTS);
    }
  });

  it('returns a fresh copy the caller may change', () => {
    const a = mergeTrainerKit(undefined);
    a.measurementSites.push('neck');
    a.reviewWeeks = 9;
    expect(mergeTrainerKit(undefined)).toEqual(TRAINER_KIT_DEFAULTS);
    expect(TRAINER_KIT_DEFAULTS.measurementSites).toHaveLength(7);
  });

  it('takes the stored values', () => {
    const row = {
      measurementSites: ['waist', 'neck'],
      e1rmFormula: 'epley',
      warmups: 'everyCompound',
      reviewWeeks: 4,
    };
    expect(mergeTrainerKit(row)).toEqual(row);
  });

  it('fills the fields a partial row lacks', () => {
    expect(mergeTrainerKit({ reviewWeeks: 6 })).toEqual({
      ...TRAINER_KIT_DEFAULTS,
      reviewWeeks: 6,
    });
    expect(mergeTrainerKit({ warmups: 'off' })).toEqual({
      ...TRAINER_KIT_DEFAULTS,
      warmups: 'off',
    });
  });

  it('falls back field by field on a bad value', () => {
    expect(
      mergeTrainerKit({
        measurementSites: 'waist',
        e1rmFormula: 'brzycki',
        warmups: 'always',
        reviewWeeks: 0,
      }),
    ).toEqual(TRAINER_KIT_DEFAULTS);
    for (const reviewWeeks of [-1, 2.5, 53, NaN, Infinity, '5', null]) {
      expect(mergeTrainerKit({ reviewWeeks }).reviewWeeks).toBe(5);
    }
  });

  it('cleans the site list: strings only, trimmed, no repeats; an empty list reads as the default', () => {
    expect(
      mergeTrainerKit({ measurementSites: [' waist ', 'waist', '', 3, null, 'neck'] }),
    ).toEqual({
      ...TRAINER_KIT_DEFAULTS,
      measurementSites: ['waist', 'neck'],
    });
    expect(mergeTrainerKit({ measurementSites: [] }).measurementSites).toEqual(
      TRAINER_KIT_DEFAULTS.measurementSites,
    );
    expect(mergeTrainerKit({ measurementSites: ['', 4] }).measurementSites).toEqual(
      TRAINER_KIT_DEFAULTS.measurementSites,
    );
  });

  it('drops unknown fields', () => {
    expect(mergeTrainerKit({ reviewWeeks: 6, extra: 'x' })).toEqual({
      ...TRAINER_KIT_DEFAULTS,
      reviewWeeks: 6,
    });
  });
});
