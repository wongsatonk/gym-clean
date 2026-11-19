// M13d task 12 (Wave A review follow-up (a)): the locale handed to core defaultUnits() comes from
// the device REGION (Intl first, then navigator.languages), not the bare language.
import { describe, expect, it } from 'vitest';
import { defaultUnits } from '../core/units';
import { deviceLocale, regionOf } from './deviceLocale';

describe('regionOf', () => {
  it.each([
    ['en-US', 'US'],
    ['th-TH', 'TH'],
    ['en_GB', 'GB'],
    ['zh-Hant-TW', 'TW'],
    ['en', undefined],
    ['', undefined],
    [undefined, undefined],
    ['not a tag!!', undefined],
  ])('%s → %s', (tag, region) => {
    expect(regionOf(tag)).toBe(region);
  });
});

describe('deviceLocale', () => {
  it('prefers the Intl locale when it names a region (English phone set up in Thailand)', () => {
    const loc = deviceLocale({ intl: 'en-TH', languages: ['en-US', 'th-TH'], language: 'en-US' });
    expect(loc).toBe('en-TH');
    expect(defaultUnits(loc)).toEqual({ weight: 'kg', length: 'cm' });
  });

  it('falls back to the first navigator.languages entry with a region', () => {
    expect(deviceLocale({ intl: 'en', languages: ['en', 'en-US'], language: 'en' })).toBe('en-US');
    expect(deviceLocale({ intl: undefined, languages: ['th', 'th-TH'] })).toBe('th-TH');
  });

  it('then navigator.language', () => {
    expect(deviceLocale({ intl: 'en', languages: [], language: 'en-LR' })).toBe('en-LR');
  });

  it('no region anywhere → the first value (core reads metric); nothing at all → undefined', () => {
    const loc = deviceLocale({ intl: 'en', languages: ['en'], language: 'en' });
    expect(loc).toBe('en');
    expect(defaultUnits(loc)).toEqual({ weight: 'kg', length: 'cm' });
    expect(deviceLocale({})).toBeUndefined();
    expect(deviceLocale({ intl: '', languages: ['  '], language: '' })).toBeUndefined();
  });

  it('never invents a region from the language (no maximize: bare "en" is not the US)', () => {
    expect(defaultUnits(deviceLocale({ intl: 'en', languages: ['en'] }))).toEqual({
      weight: 'kg',
      length: 'cm',
    });
  });

  it.each([
    ['en-US', { weight: 'lb', length: 'in' }],
    ['my-MM', { weight: 'lb', length: 'in' }],
    ['th-TH', { weight: 'kg', length: 'cm' }],
    ['de-DE', { weight: 'kg', length: 'cm' }],
  ] as const)('%s through defaultUnits → %o', (intl, units) => {
    expect(defaultUnits(deviceLocale({ intl }))).toEqual(units);
  });

  it('reads the browser by default without throwing', () => {
    expect(() => deviceLocale()).not.toThrow();
  });
});
