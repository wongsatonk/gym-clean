// M13d task 5: what Set up Fuel opens with. Made-up body stats only (public repo).
import { describe, expect, it } from 'vitest';
import {
  SETUP_RANGE,
  prefillSetup,
  setupValueOk,
  type PrefillField,
  type SetupPrefillInput,
} from './setupPrefill';

const YEAR = 2031;

const run = (over: Partial<SetupPrefillInput> = {}) => prefillSetup({ year: YEAR, ...over });
const tags = (s: Set<PrefillField>) => [...s].sort();

const PLACEHOLDERS = {
  heightCm: SETUP_RANGE.heightCm.start,
  birthYear: YEAR - SETUP_RANGE.age.start,
  weightKg: SETUP_RANGE.weightKg.start,
};

describe('SETUP_RANGE (ranges as data in core)', () => {
  it('keeps the 1.16.1 field ranges and starting values', () => {
    expect(SETUP_RANGE).toEqual({
      heightCm: { min: 120, max: 230, step: 1, start: 170 },
      age: { min: 14, max: 90, start: 30 },
      weightKg: { min: 30, max: 250, start: 70 },
    });
  });

  it('setupValueOk: inclusive bounds; birth year checked as an age in `year`', () => {
    expect(setupValueOk('heightCm', 120, YEAR)).toBe(true);
    expect(setupValueOk('heightCm', 230, YEAR)).toBe(true);
    expect(setupValueOk('heightCm', 119.9, YEAR)).toBe(false);
    expect(setupValueOk('heightCm', Number.NaN, YEAR)).toBe(false);
    expect(setupValueOk('weightKg', 30, YEAR)).toBe(true);
    expect(setupValueOk('weightKg', 250.1, YEAR)).toBe(false);
    expect(setupValueOk('birthYear', YEAR - 14, YEAR)).toBe(true);
    expect(setupValueOk('birthYear', YEAR - 90, YEAR)).toBe(true);
    expect(setupValueOk('birthYear', YEAR - 13, YEAR)).toBe(false);
    expect(setupValueOk('birthYear', YEAR - 91, YEAR)).toBe(false);
    expect(setupValueOk('birthYear', 1990.5, YEAR)).toBe(false);
    expect(setupValueOk('weightKg', Number.POSITIVE_INFINITY, YEAR)).toBe(false);
  });
});

describe('prefillSetup', () => {
  it('nothing known (the 1.16.1 first setup without Health): the placeholders, no sex, no tags', () => {
    const r = run();
    expect(r.initial).toEqual(PLACEHOLDERS);
    expect(r.initial.sex).toBeUndefined();
    expect(r.initial.activity).toBeUndefined();
    expect(r.fromHealth.size).toBe(0);
  });

  it('a null profile (PWA, Health not connected) is the same as none', () => {
    expect(run({ profile: null })).toEqual(run());
  });

  it('Health fills height, birth year and sex, each tagged', () => {
    const r = run({ profile: { heightCm: 172, birthYear: 1994, sex: 'female' } });
    expect(r.initial).toEqual({ ...PLACEHOLDERS, heightCm: 172, birthYear: 1994, sex: 'female' });
    expect(tags(r.fromHealth)).toEqual(['birthYear', 'height', 'sex']);
  });

  it('Health height is rounded to the field step (whole cm)', () => {
    expect(run({ profile: { heightCm: 171.6 } }).initial.heightCm).toBe(172);
  });

  it('sex comes only from Health female/male; missing sex is never guessed', () => {
    const r = run({ profile: { heightCm: 165 } });
    expect(r.initial.sex).toBeUndefined();
    expect('sex' in r.initial).toBe(false);
    expect(r.fromHealth.has('sex')).toBe(false);
    // Anything else (a bad bridge value) is dropped too.
    const odd = run({ profile: { sex: 'other' as unknown as 'female' } });
    expect(odd.initial.sex).toBeUndefined();
    expect(odd.fromHealth.size).toBe(0);
  });

  it('the latest weigh-in is used even on a first setup (no saved values)', () => {
    const r = run({ latestKg: 64.3 });
    expect(r.initial.weightKg).toBe(64.3);
    expect(r.fromHealth.has('weight')).toBe(false);
  });

  it('weight is tagged only when that weigh-in came from Health', () => {
    expect(run({ latestKg: 64.3, latestSource: 'health' }).fromHealth.has('weight')).toBe(true);
    expect(run({ latestKg: 64.3, latestSource: 'manual' }).fromHealth.has('weight')).toBe(false);
    expect(run({ latestKg: null, latestSource: 'health' }).fromHealth.has('weight')).toBe(false);
  });

  it('saved values win over Health and the weigh-in (a re-run keeps what you confirmed)', () => {
    const r = run({
      saved: { heightCm: 180, birthYear: 1988, sex: 'male', activity: 'light', weightKg: 81 },
      profile: { heightCm: 175, birthYear: 1990, sex: 'female' },
      latestKg: 79,
      latestSource: 'health',
    });
    expect(r.initial).toEqual({
      heightCm: 180,
      birthYear: 1988,
      sex: 'male',
      activity: 'light',
      weightKg: 81,
    });
    expect(r.fromHealth.size).toBe(0);
  });

  it('per field: a saved gap is filled from Health, and only that field is tagged', () => {
    const r = run({
      saved: { heightCm: 180, activity: 'moderate' },
      profile: { heightCm: 175, birthYear: 1990, sex: 'female' },
    });
    expect(r.initial).toEqual({
      heightCm: 180,
      birthYear: 1990,
      sex: 'female',
      activity: 'moderate',
      weightKg: PLACEHOLDERS.weightKg,
    });
    expect(tags(r.fromHealth)).toEqual(['birthYear', 'sex']);
  });

  it('Health beats the weigh-in only where Health has the field (weight comes from weigh-ins)', () => {
    const r = run({ profile: { heightCm: 175 }, latestKg: 72.5 });
    expect(r.initial.heightCm).toBe(175);
    expect(r.initial.weightKg).toBe(72.5);
  });

  it('order for weight: saved, then the latest weigh-in, then the placeholder', () => {
    expect(run({ saved: { weightKg: 90 }, latestKg: 72 }).initial.weightKg).toBe(90);
    expect(run({ latestKg: 72 }).initial.weightKg).toBe(72);
    expect(run().initial.weightKg).toBe(PLACEHOLDERS.weightKg);
  });

  it('out-of-range Health height or age is dropped (next source, else the placeholder)', () => {
    const r = run({ profile: { heightCm: 300, birthYear: YEAR - 5, sex: 'male' } });
    expect(r.initial.heightCm).toBe(PLACEHOLDERS.heightCm);
    expect(r.initial.birthYear).toBe(PLACEHOLDERS.birthYear);
    expect(r.initial.sex).toBe('male');
    expect(tags(r.fromHealth)).toEqual(['sex']);
    expect(run({ profile: { heightCm: 80, birthYear: YEAR - 120 } }).fromHealth.size).toBe(0);
    expect(run({ profile: { heightCm: Number.NaN } }).initial.heightCm).toBe(PLACEHOLDERS.heightCm);
  });

  it('an out-of-range saved value falls back to Health, then the placeholder', () => {
    const r = run({ saved: { heightCm: 999, birthYear: 1700 }, profile: { heightCm: 168 } });
    expect(r.initial.heightCm).toBe(168);
    expect(r.initial.birthYear).toBe(PLACEHOLDERS.birthYear);
    expect(tags(r.fromHealth)).toEqual(['height']);
  });

  it('an out-of-range weigh-in is dropped (the placeholder, no tag)', () => {
    const r = run({ latestKg: 12, latestSource: 'health' });
    expect(r.initial.weightKg).toBe(PLACEHOLDERS.weightKg);
    expect(r.fromHealth.has('weight')).toBe(false);
  });

  it('a bad saved sex or activity is dropped, never replaced by a guess', () => {
    const r = run({
      saved: {
        sex: 'x' as unknown as 'male',
        activity: 'couch' as unknown as 'light',
      },
    });
    expect('sex' in r.initial).toBe(false);
    expect('activity' in r.initial).toBe(false);
  });

  it('the placeholder birth year follows `year` (time is passed in)', () => {
    expect(prefillSetup({ year: 2040 }).initial.birthYear).toBe(2040 - SETUP_RANGE.age.start);
  });

  it('never changes its inputs', () => {
    const profile = { heightCm: 171.6, birthYear: 1994, sex: 'female' as const };
    const saved = { activity: 'light' as const };
    run({ profile, saved, latestKg: 60 });
    expect(profile).toEqual({ heightCm: 171.6, birthYear: 1994, sex: 'female' });
    expect(saved).toEqual({ activity: 'light' });
  });
});
