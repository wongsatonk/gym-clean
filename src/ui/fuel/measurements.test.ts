/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../core/types';
import { asFake, useFakeDom } from '../screens/testDom';
import { byAttr, copyHits, oneAttr, texts, typeInto, valueOf } from './fuelTestUtil';
import {
  changeText,
  entryLine,
  formatLength,
  fromLength,
  lengthUnit,
  measurementsEntry,
  measurementsEntryRow,
  measurementsScreen,
  measureStatus,
  saveLabel,
  siteHistory,
  siteLabel,
  siteLine,
  startCm,
  statusCopy,
  toLength,
  type MeasurementsProps,
} from './measurements';

useFakeDom();

// Made-up numbers only (public repo).
const SITES = ['leftArm', 'rightArm', 'chest', 'waist', 'hips', 'leftThigh', 'rightThigh'];
const TODAY = '2026-11-17';
const SAVED: Measurement[] = [
  { date: '2026-08-14', site: 'leftArm', cm: 34 },
  { date: '2026-10-12', site: 'leftArm', cm: 34.5 },
  { date: '2026-10-12', site: 'waist', cm: 82 },
  { date: '2026-08-14', site: 'waist', cm: 82 },
];

function render(over: Partial<MeasurementsProps> = {}) {
  const calls = { back: 0, save: [] as Measurement[][] };
  const el = asFake(
    measurementsScreen(
      { sites: SITES, unit: 'kg', today: TODAY, measurements: SAVED, ...over },
      { onBack: () => calls.back++, onSave: (rows) => calls.save.push(rows) },
    ),
  );
  return { el, calls };
}

describe('measurement helpers', () => {
  it('cm with kg, inches with lb', () => {
    expect(lengthUnit('kg')).toBe('cm');
    expect(lengthUnit('lb')).toBe('in');
    expect(toLength(25.4, 'in')).toBeCloseTo(10);
    expect(fromLength(10, 'in')).toBe(25.4);
    expect(fromLength(34.5, 'cm')).toBe(34.5);
    expect(formatLength(34.5, 'cm')).toBe('34.5 cm');
    expect(formatLength(34.29, 'in')).toBe('13.5 in');
  });

  it('labels the default sites and reads an unknown id as words', () => {
    expect(SITES.map(siteLabel)).toEqual([
      'Left arm',
      'Right arm',
      'Chest',
      'Waist',
      'Hips',
      'Left thigh',
      'Right thigh',
    ]);
    expect(siteLabel('leftCalf')).toBe('Left calf');
    expect(siteLabel('neck')).toBe('Neck');
    expect(startCm('leftCalf')).toBe(37);
    expect(startCm('somewhere')).toBe(50);
  });

  it('a site line: last value, date and the change since the time before', () => {
    expect(siteLine(siteHistory(SAVED, 'leftArm'), 'cm', TODAY)).toBe(
      '34.5 cm · 12 Oct · +0.5 cm since 14 Aug',
    );
    expect(siteLine(siteHistory(SAVED, 'waist'), 'cm', TODAY)).toBe(
      '82 cm · 12 Oct · same as 14 Aug',
    );
    expect(siteLine(siteHistory(SAVED, 'chest'), 'cm', TODAY)).toBe('Not measured yet');
    expect(siteLine([{ date: TODAY, site: 'hips', cm: 96 }], 'cm', TODAY)).toBe('96 cm · today');
    expect(changeText(33.5, 34, 'cm')).toBe('−0.5 cm');
    expect(changeText(34, 34, 'in')).toBe('same');
  });

  it('"Measure again" once the newest measurement is 28 days old', () => {
    expect(measureStatus([], TODAY)).toEqual({ kind: 'first' });
    // 12 Oct → 17 Nov = 36 days.
    expect(measureStatus(SAVED, TODAY)).toEqual({ kind: 'due', last: '2026-10-12', days: 36 });
    expect(measureStatus(SAVED, '2026-11-08').kind).toBe('ok'); // 27 days
    expect(measureStatus(SAVED, '2026-11-09').kind).toBe('due'); // 28 days
    expect(measureStatus(SAVED, '2026-10-20', 7).kind).toBe('due'); // the rule is data
    expect(statusCopy(measureStatus(SAVED, TODAY)).title).toBe('Measure again');
    expect(statusCopy(measureStatus(SAVED, TODAY)).body).toBe('Last measured 12 Oct, 36 days ago.');
    expect(statusCopy(measureStatus(SAVED, '2026-11-08')).body).toBe(
      'Last measured 12 Oct, 27 days ago. Next in 1 day.',
    );
  });

  it('Save button words', () => {
    expect(saveLabel(0)).toBe('Tap a spot to measure');
    expect(saveLabel(1)).toBe('Save 1 measurement');
    expect(saveLabel(3)).toBe('Save 3 measurements');
  });
});

describe('measurementsScreen', () => {
  it('one row per site from the settings, in order, with its last value', () => {
    const { el } = render({ sites: ['waist', 'leftCalf'] });
    expect(el.getAttribute('data-screen')).toBe('measurements');
    expect(byAttr(el, 'data-site').map((r) => r.getAttribute('data-site'))).toEqual([
      'waist',
      'leftCalf',
    ]);
    expect(oneAttr(el, 'data-site-last', 'waist').textContent).toContain('82 cm');
    expect(oneAttr(el, 'data-site-last', 'leftCalf').textContent).toBe('Not measured yet');
    expect(texts(el)).toContain('Left calf');
  });

  it('shows "Measure again" when due, the first-time card with no data', () => {
    expect(oneAttr(render().el, 'data-measure-status').getAttribute('data-measure-status')).toBe(
      'due',
    );
    expect(texts(render().el)).toContain('Measure again');
    const first = render({ measurements: [] }).el;
    expect(oneAttr(first, 'data-measure-status').getAttribute('data-measure-status')).toBe('first');
    const ok = render({ today: '2026-10-20' }).el;
    expect(oneAttr(ok, 'data-measure-status').getAttribute('data-measure-status')).toBe('ok');
  });

  it('Save is off until a site is opened; opening starts at the last value', () => {
    const { el, calls } = render();
    const save = oneAttr(el, 'data-measure-save');
    expect(save.hasAttribute('disabled')).toBe(true);
    save.click();
    expect(calls.save).toEqual([]);
    expect(byAttr(el, 'data-field')).toHaveLength(0);

    const arm = oneAttr(el, 'data-site-toggle', 'leftArm');
    arm.click();
    expect(arm.getAttribute('aria-expanded')).toBe('true');
    expect(save.hasAttribute('disabled')).toBe(false);
    expect(save.textContent).toBe('Save 1 measurement');
    const field = oneAttr(el, 'data-field', 'site-leftArm');
    expect(valueOf(field.oneByClass('nf-value'))).toBe('34.5');
    expect(oneAttr(el, 'data-site-edit', 'leftArm').hasAttribute('hidden')).toBe(false);
  });

  it('saves every opened site for today in cm, in site order; a closed one is left out', () => {
    const { el, calls } = render();
    oneAttr(el, 'data-site-toggle', 'waist').click();
    oneAttr(el, 'data-site-toggle', 'leftArm').click();
    oneAttr(el, 'data-site-toggle', 'chest').click();
    typeInto(oneAttr(el, 'data-field', 'site-leftArm').oneByClass('nf-value'), '35');
    // + on the waist: 82 → 82.5
    oneAttr(el, 'data-field', 'site-waist')
      .find((e) => e.getAttribute('data-step') === 'up')[0]
      ?.click();
    // Chest is closed again: not saved.
    oneAttr(el, 'data-site-toggle', 'chest').click();
    expect(oneAttr(el, 'data-site-toggle', 'chest').getAttribute('aria-expanded')).toBe('false');
    const save = oneAttr(el, 'data-measure-save');
    expect(save.textContent).toBe('Save 2 measurements');
    save.click();
    expect(calls.save).toEqual([
      [
        { date: TODAY, site: 'leftArm', cm: 35 },
        { date: TODAY, site: 'waist', cm: 82.5 },
      ],
    ]);
  });

  it('lb: shows and steps in inches, stores cm', () => {
    const { el, calls } = render({ unit: 'lb' });
    expect(oneAttr(el, 'data-site-last', 'waist').textContent).toContain('32.3 in');
    oneAttr(el, 'data-site-toggle', 'chest').click();
    const input = oneAttr(el, 'data-field', 'site-chest').oneByClass('nf-value');
    typeInto(input, '40');
    expect(valueOf(input)).toBe('40.0');
    oneAttr(el, 'data-measure-save').click();
    expect(calls.save).toEqual([[{ date: TODAY, site: 'chest', cm: 101.6 }]]);
  });

  it('Back calls back; no sites → a plain note', () => {
    const { el, calls } = render();
    el.oneByClass('fuel-back').click();
    expect(calls.back).toBe(1);
    expect(byAttr(render({ sites: [] }).el, 'data-measure-sites', 'none')).toHaveLength(1);
  });

  it('copy is plain: no banned or diagnosis words', () => {
    for (const over of [{}, { measurements: [] }, { today: '2026-10-20' }, { unit: 'lb' as const }])
      expect(copyHits(render(over).el)).toEqual([]);
  });
});

describe('Fuel entry row', () => {
  it('says when it was last done and when it is due', () => {
    expect(measurementsEntry([], TODAY)).toEqual({ lastDate: null, due: false });
    expect(measurementsEntry(SAVED, TODAY)).toEqual({ lastDate: '2026-10-12', due: true });
    expect(measurementsEntry(SAVED, '2026-10-20')).toEqual({ lastDate: '2026-10-12', due: false });
    expect(entryLine({ lastDate: null, due: false })).toBe('Tape measure, once a month');
    expect(entryLine({ lastDate: '2026-10-12', due: true })).toBe('Measure again · last 12 Oct');
    expect(entryLine({ lastDate: '2026-10-12', due: false })).toBe('Last 12 Oct');
  });

  it('is one button that opens the screen', () => {
    let opened = 0;
    const el = asFake(measurementsEntryRow({ lastDate: '2026-10-12', due: true }, () => opened++));
    expect(el.tag).toBe('button');
    expect(el.getAttribute('data-due')).toBe('true');
    expect(texts(el)).toEqual(['Measurements', 'Measure again · last 12 Oct']);
    el.click();
    expect(opened).toBe(1);
  });
});

describe('measurements.css', () => {
  const css = readFileSync(new URL('./measurements.css', import.meta.url), 'utf8');

  it('tokens only, text at body size or larger, taps ≥ 56px', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/font-size:\s*\d/);
    expect(css).not.toContain('--fs-label');
    expect(css).toMatch(/\.ms-entry \{[^}]*min-height: var\(--tap-cta\)/);
    expect(css).toMatch(/\.ms-site-btn \{[^}]*min-height: var\(--tap-cta\)/);
  });
});
