/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LengthUnit, Measurement, UnitPrefs } from '../../core/types';
import { asFake, useFakeDom } from '../screens/testDom';
import { byAttr, copyHits, oneAttr, texts, typeInto, valueOf } from './fuelTestUtil';
import {
  changeText,
  entryLine,
  measurementsEntry,
  measurementsEntryRow,
  measurementsScreen,
  measureStatus,
  saveLabel,
  saveName,
  SAVE_WORD,
  siteHistory,
  siteLabel,
  siteLine,
  startCm,
  statusCopy,
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

/** Test shorthand: `lengthUnit` builds `units` (weight in kg). */
function render(
  over: Partial<Omit<MeasurementsProps, 'units'>> & { lengthUnit?: LengthUnit } = {},
) {
  const calls = { back: 0, save: [] as Measurement[][], units: [] as UnitPrefs[] };
  const { lengthUnit = 'cm', ...rest } = over;
  const el = asFake(
    measurementsScreen(
      {
        sites: SITES,
        units: { weight: 'kg', length: lengthUnit },
        today: TODAY,
        measurements: SAVED,
        ...rest,
      },
      {
        onBack: () => calls.back++,
        onSave: (rows) => calls.save.push(rows),
        onUnits: (u) => calls.units.push(u),
      },
    ),
  );
  return { el, calls };
}

describe('measurement helpers', () => {
  it("M13d: the unit maths is core's (no local cm / in copy left here)", () => {
    const src = readFileSync(new URL('./measurements.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/CM_PER_IN|2\.54/);
    expect(src).not.toMatch(
      /export (const|function) (toLength|fromLength|formatLength|lengthUnit)\b/,
    );
    expect(siteLine(siteHistory(SAVED, 'waist'), 'in', TODAY)).toBe(
      '32.3 in · 12 Oct · same as 14 Aug',
    );
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

  it('M13d 40e: the visible word is short; the name starts with it and says what it saves', () => {
    expect(SAVE_WORD).toBe('Save');
    expect(saveName(0)).toBe('Save. Tap a spot to measure');
    expect(saveName(1)).toBe('Save 1 measurement');
    expect(saveName(3)).toBe('Save 3 measurements');
    for (const n of [0, 1, 3]) expect(saveName(n).startsWith(SAVE_WORD)).toBe(true);
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
    // M13d 40e: the round main button; the word is "Save", the name what it saves.
    expect(save.hasAttribute('data-icon-btn')).toBe(true);
    expect(save.getAttribute('data-variant')).toBe('main');
    expect(oneAttr(save, 'data-measure-save-label').textContent).toBe('Save');
    expect(save.getAttribute('aria-label')).toBe('Save. Tap a spot to measure');
    save.click();
    expect(calls.save).toEqual([]);
    expect(byAttr(el, 'data-field')).toHaveLength(0);

    const arm = oneAttr(el, 'data-site-toggle', 'leftArm');
    arm.click();
    expect(arm.getAttribute('aria-expanded')).toBe('true');
    expect(save.hasAttribute('disabled')).toBe(false);
    expect(save.textContent).toBe('Save');
    expect(save.getAttribute('aria-label')).toBe('Save 1 measurement');
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
    expect(save.getAttribute('aria-label')).toBe('Save 2 measurements');
    save.click();
    expect(calls.save).toEqual([
      [
        { date: TODAY, site: 'leftArm', cm: 35 },
        { date: TODAY, site: 'waist', cm: 82.5 },
      ],
    ]);
  });

  it('lengthUnit "in": shows and steps in inches, stores cm', () => {
    const { el, calls } = render({ lengthUnit: 'in' });
    expect(oneAttr(el, 'data-site-last', 'waist').textContent).toContain('32.3 in');
    oneAttr(el, 'data-site-toggle', 'chest').click();
    const input = oneAttr(el, 'data-field', 'site-chest').oneByClass('nf-value');
    typeInto(input, '40');
    expect(valueOf(input)).toBe('40.0');
    oneAttr(el, 'data-measure-save').click();
    expect(calls.save).toEqual([[{ date: TODAY, site: 'chest', cm: 101.6 }]]);
    expect(texts(el)).toContain("Saved for today in inches. Saving again replaces today's.");
  });

  it('M13d: an opened site left alone saves exactly what it was, in either unit', () => {
    for (const lengthUnit of ['cm', 'in'] as const) {
      const { el, calls } = render({ lengthUnit });
      oneAttr(el, 'data-site-toggle', 'leftArm').click();
      expect(valueOf(oneAttr(el, 'data-field', 'site-leftArm').oneByClass('nf-value'))).toBe(
        lengthUnit === 'cm' ? '34.5' : '13.6',
      );
      oneAttr(el, 'data-measure-save').click();
      expect(calls.save).toEqual([[{ date: TODAY, site: 'leftArm', cm: 34.5 }]]);
    }
  });

  it('M13d: typed values are clamped to the tape range (5–300 cm), steps disable at the ends', () => {
    const { el, calls } = render();
    oneAttr(el, 'data-site-toggle', 'chest').click();
    const field = oneAttr(el, 'data-field', 'site-chest');
    const input = field.oneByClass('nf-value');
    typeInto(input, '400');
    expect(valueOf(input)).toBe('300.0');
    expect(oneAttr(field, 'data-step', 'up').hasAttribute('disabled')).toBe(true);
    typeInto(input, '3');
    expect(valueOf(input)).toBe('5.0');
    expect(oneAttr(field, 'data-step', 'down').hasAttribute('disabled')).toBe(true);
    typeInto(input, 'abc');
    expect(valueOf(input)).toBe('5.0');
    oneAttr(el, 'data-measure-save').click();
    expect(calls.save).toEqual([[{ date: TODAY, site: 'chest', cm: 5 }]]);
  });

  it('M13d task 24: the header Back is the edge swipe’s one Back', () => {
    const marked = render().el.find((e) => e.hasAttribute('data-swipe-back'));
    expect(marked).toHaveLength(1);
    expect(marked[0]?.classes).toContain('fuel-back');
  });

  it('Back calls back; no sites → a plain note', () => {
    const { el, calls } = render();
    el.oneByClass('fuel-back').click();
    expect(calls.back).toBe(1);
    expect(byAttr(render({ sites: [] }).el, 'data-measure-sites', 'none')).toHaveLength(1);
  });

  it('copy is plain: no banned or diagnosis words', () => {
    for (const over of [
      {},
      { measurements: [] },
      { today: '2026-10-20' },
      { lengthUnit: 'in' as const },
    ])
      expect(copyHits(render(over).el)).toEqual([]);
  });
});

describe('M13d task 13c: cm | in switch by the entry', () => {
  const tap = (el: ReturnType<typeof render>['el'], unit: string) =>
    oneAttr(oneAttr(el, 'data-unit-for', 'tape'), 'data-unit', unit).click();
  const value = (el: ReturnType<typeof render>['el'], site: string) =>
    valueOf(oneAttr(el, 'data-field', `site-${site}`).oneByClass('nf-value'));

  it('one named switch heading the list, showing the unit passed in; none without spots', () => {
    const { el } = render({ lengthUnit: 'in' });
    const g = oneAttr(el, 'data-unit-for', 'tape');
    expect(g.getAttribute('role')).toBe('group');
    expect(g.getAttribute('aria-label')).toBe('Measurement unit');
    expect(oneAttr(g, 'data-unit', 'in').getAttribute('aria-pressed')).toBe('true');
    expect(byAttr(el, 'data-unit-switch')).toHaveLength(1);
    // The switch sits in the list's heading row, before the list.
    const row = el.oneByClass('ms-unit-row');
    expect(row.children[0]?.textContent).toBe('Spots to measure');
    expect(row.children[1]).toBe(g);
    const order = el.find((e) => e.hasAttribute('data-unit-for') || e.classes.includes('ms-sites'));
    expect(order[0]?.hasAttribute('data-unit-for')).toBe(true);
    expect(byAttr(render({ sites: [] }).el, 'data-unit-switch')).toHaveLength(0);
  });

  it('80 cm → 31.5 in → 80 cm with no drift; nothing saved; onUnits once per tap', () => {
    const { el, calls } = render({ measurements: [{ date: '2026-10-12', site: 'waist', cm: 80 }] });
    oneAttr(el, 'data-site-toggle', 'waist').click();
    expect(value(el, 'waist')).toBe('80.0');
    tap(el, 'in');
    expect(value(el, 'waist')).toBe('31.5');
    expect(oneAttr(el, 'data-field', 'site-waist').oneByClass('nf-unit').textContent).toBe('in');
    tap(el, 'cm');
    expect(value(el, 'waist')).toBe('80.0');
    for (let i = 0; i < 20; i++) {
      tap(el, 'in');
      tap(el, 'cm');
    }
    tap(el, 'cm'); // already shown: nothing
    expect(value(el, 'waist')).toBe('80.0');
    expect(calls.save).toEqual([]);
    expect(calls.units).toHaveLength(42);
    expect(calls.units[0]).toEqual({ weight: 'kg', length: 'in' });
    expect(calls.units.at(-1)).toEqual({ weight: 'kg', length: 'cm' });
    tap(el, 'in');
    oneAttr(el, 'data-measure-save').click();
    expect(calls.save).toEqual([[{ date: TODAY, site: 'waist', cm: 80 }]]);
  });

  it('re-words the last-value lines and the note; closed sites open in the new unit', () => {
    const { el } = render();
    tap(el, 'in');
    expect(oneAttr(el, 'data-site-last', 'waist').textContent).toBe(
      siteLine(siteHistory(SAVED, 'waist'), 'in', TODAY),
    );
    expect(oneAttr(el, 'data-measure-note').textContent).toBe(
      "Saved for today in inches. Saving again replaces today's.",
    );
    oneAttr(el, 'data-site-toggle', 'leftArm').click();
    expect(oneAttr(el, 'data-field', 'site-leftArm').oneByClass('nf-unit').textContent).toBe('in');
    expect(value(el, 'leftArm')).toBe('13.6');
  });

  it('an edit survives switching and is what gets saved', () => {
    const { el, calls } = render();
    oneAttr(el, 'data-site-toggle', 'chest').click();
    tap(el, 'in');
    typeInto(oneAttr(el, 'data-field', 'site-chest').oneByClass('nf-value'), '40');
    tap(el, 'cm');
    expect(value(el, 'chest')).toBe('101.6');
    tap(el, 'in');
    expect(value(el, 'chest')).toBe('40.0');
    oneAttr(el, 'data-measure-save').click();
    expect(calls.save).toEqual([[{ date: TODAY, site: 'chest', cm: 101.6 }]]);
  });

  it('copy stays plain after a switch', () => {
    const { el } = render();
    tap(el, 'in');
    expect(copyHits(el)).toEqual([]);
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
