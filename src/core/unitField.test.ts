import { describe, expect, it } from 'vitest';
import { CM_RANGE } from './progress/measurements';
import { SETUP_RANGE } from './nutrition/setupPrefill';
import { fromUnit, toUnit } from './units';
import { FIELD_RANGE, editField, switchUnit, unitField, type UnitField } from './unitField';

// Made-up values only (public repo).

/** What 1.16 setup / weigh-in code stores for a typed lb value: snap to 0.2, then kg unrounded. */
const todayLbToKg = (lb: number) => fromUnit(Number((Math.round(lb / 0.2) * 0.2).toFixed(1)), 'lb');
/** What 1.16 Measurements stores for a typed inch value: cm rounded to 1 decimal. */
const todayInToCm = (inch: number) => Math.round(inch * 2.54 * 10) / 10;

describe('unitField: ranges', () => {
  it('takes the body-weight range from Set up Fuel (the weigh-in uses the same 30–250 kg)', () => {
    expect(FIELD_RANGE.bodyWeight).toEqual({ min: SETUP_RANGE.weightKg.min, max: SETUP_RANGE.weightKg.max });
    expect(FIELD_RANGE.height).toEqual({ min: SETUP_RANGE.heightCm.min, max: SETUP_RANGE.heightCm.max });
    expect(FIELD_RANGE.tape).toEqual({ min: CM_RANGE[0], max: CM_RANGE[1] });
  });

  it('reports step, min and max in the shown unit, rounded inward to the step', () => {
    const pick = (f: UnitField) => ({ step: f.step, min: f.min, max: f.max });
    expect(pick(unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' }))).toEqual({ step: 0.1, min: 30, max: 250 });
    expect(pick(unitField({ kind: 'bodyWeight', metric: 70, unit: 'lb' }))).toEqual({ step: 0.2, min: 66.2, max: 551 });
    expect(pick(unitField({ kind: 'height', metric: 170, unit: 'cm' }))).toEqual({ step: 1, min: 120, max: 230 });
    expect(pick(unitField({ kind: 'height', metric: 170, unit: 'in' }))).toEqual({ step: 1, min: 48, max: 90 });
    expect(pick(unitField({ kind: 'tape', metric: 33.5, unit: 'cm' }))).toEqual({ step: 0.5, min: 5, max: 300 });
    expect(pick(unitField({ kind: 'tape', metric: 33.5, unit: 'in' }))).toEqual({ step: 0.1, min: 2, max: 118.1 });
  });
});

describe('unitField: display', () => {
  it('shows body weight with one decimal in kg and lb', () => {
    const kg = unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' });
    expect(kg).toMatchObject({ kind: 'bodyWeight', metric: 70, unit: 'kg', value: 70, display: '70.0' });
    const lb = unitField({ kind: 'bodyWeight', metric: 70, unit: 'lb' });
    expect(lb).toMatchObject({ metric: 70, unit: 'lb', value: 154.3, display: '154.3' });
    expect(lb.parts).toBeUndefined();
  });

  it('shows height as whole cm, or ft + in with parts (inches carry at 12)', () => {
    expect(unitField({ kind: 'height', metric: 170, unit: 'cm' })).toMatchObject({ value: 170, display: '170' });
    const ftIn = unitField({ kind: 'height', metric: 170, unit: 'in' });
    expect(ftIn).toMatchObject({ metric: 170, value: 67, display: '5 ft 7 in', parts: { ft: 5, inch: 7 } });
    // 182.8 cm = 71.97 in → 72 in → 6 ft 0 in, never "5 ft 12 in".
    expect(unitField({ kind: 'height', metric: 182.8, unit: 'in' })).toMatchObject({
      display: '6 ft 0 in',
      parts: { ft: 6, inch: 0 },
    });
  });

  it('shows tape with one decimal in cm and in', () => {
    expect(unitField({ kind: 'tape', metric: 33.5, unit: 'cm' })).toMatchObject({ value: 33.5, display: '33.5' });
    expect(unitField({ kind: 'tape', metric: 33.5, unit: 'in' })).toMatchObject({ value: 13.2, display: '13.2' });
  });

  it('keeps a starting value outside the range as it is (only an edit clamps)', () => {
    expect(unitField({ kind: 'bodyWeight', metric: 25, unit: 'kg' }).metric).toBe(25);
  });
});

describe('switchUnit: no drift', () => {
  it('70 kg → lb → kg, 20 times, keeps exactly 70 and re-shows the same numbers', () => {
    let f: UnitField<'bodyWeight'> = unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' });
    for (let i = 0; i < 20; i++) {
      f = switchUnit(f, 'lb');
      expect(f.metric).toBe(70);
      expect(f.display).toBe('154.3');
      f = switchUnit(f, 'kg');
      expect(f.metric).toBe(70);
      expect(f.display).toBe('70.0');
    }
  });

  it('170 cm ↔ ft·in, 20 times, keeps exactly 170', () => {
    let f: UnitField<'height'> = unitField({ kind: 'height', metric: 170, unit: 'cm' });
    for (let i = 0; i < 20; i++) {
      f = switchUnit(f, 'in');
      expect(f.metric).toBe(170);
      expect(f.display).toBe('5 ft 7 in');
      f = switchUnit(f, 'cm');
      expect(f.metric).toBe(170);
      expect(f.display).toBe('170');
      expect(f.parts).toBeUndefined();
    }
  });

  it('tape cm ↔ in, 20 times, keeps exactly the stored cm', () => {
    let f: UnitField<'tape'> = unitField({ kind: 'tape', metric: 33.5, unit: 'cm' });
    for (let i = 0; i < 20; i++) {
      f = switchUnit(f, 'in');
      expect([f.metric, f.display]).toEqual([33.5, '13.2']);
      f = switchUnit(f, 'cm');
      expect([f.metric, f.display]).toEqual([33.5, '33.5']);
    }
  });

  it('never changes the field it is given (a switch writes nothing)', () => {
    const f = Object.freeze(unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' }));
    const g = switchUnit(f, 'lb');
    expect(g).not.toBe(f);
    expect(f).toMatchObject({ metric: 70, unit: 'kg', display: '70.0' });
    expect(g.min).toBe(66.2);
  });

  it('switching to the unit already shown changes nothing', () => {
    const f = unitField({ kind: 'height', metric: 170.18, unit: 'cm' });
    expect(switchUnit(f, 'cm')).toEqual(f);
  });
});

describe('editField', () => {
  it('an edit of 154.4 lb stores the same kg as 1.16 setup / weigh-in and re-shows 154.4', () => {
    const f = editField(unitField({ kind: 'bodyWeight', metric: 70, unit: 'lb' }), 154.4);
    expect(f.metric).toBe(todayLbToKg(154.4));
    expect(f.metric).toBe(fromUnit(154.4, 'lb'));
    expect(f.display).toBe('154.4');
    // …and it survives switching too.
    const back = switchUnit(switchUnit(f, 'kg'), 'lb');
    expect(back.metric).toBe(f.metric);
    expect(back.display).toBe('154.4');
    expect(switchUnit(f, 'kg').display).toBe('70.0');
  });

  it('snaps to the step like 1.16 does (kg 0.1, lb 0.2) and accepts typed text with a comma', () => {
    const kg = unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' });
    expect(editField(kg, 72.43).metric).toBe(72.4);
    expect(editField(kg, '72,4').metric).toBe(72.4);
    expect(editField(kg, ' 81.26 ').metric).toBe(81.3);
    const lb = unitField({ kind: 'bodyWeight', metric: 70, unit: 'lb' });
    expect(editField(lb, 160.35).metric).toBe(todayLbToKg(160.35));
    expect(editField(lb, 160.35).display).toBe('160.4');
  });

  it('typed 5\'7" in the height field stores 170.18 cm; parts and other forms agree', () => {
    const f = unitField({ kind: 'height', metric: 170, unit: 'in' });
    expect(editField(f, '5\'7"').metric).toBe(170.18);
    expect(editField(f, '5 ft 7 in').metric).toBe(170.18);
    expect(editField(f, '5 7').metric).toBe(170.18);
    expect(editField(f, { ft: 5, inch: 7 }).metric).toBe(170.18);
    expect(editField(f, 67).metric).toBe(170.18);
    const shown = editField(f, '5\'7"');
    expect(shown).toMatchObject({ display: '5 ft 7 in', parts: { ft: 5, inch: 7 }, value: 67 });
    // 12 inches carry into a foot.
    expect(editField(f, { ft: 5, inch: 12 })).toMatchObject({ metric: 182.88, display: '6 ft 0 in' });
  });

  it('height in cm stores whole cm (step 1, as 1.16)', () => {
    const f = unitField({ kind: 'height', metric: 170, unit: 'cm' });
    expect(editField(f, 171.4).metric).toBe(171);
    expect(editField(f, '168').metric).toBe(168);
  });

  it('tape in inches stores cm with one decimal (as 1.16 Measurements); cm snaps to 0.5', () => {
    const inch = unitField({ kind: 'tape', metric: 33.5, unit: 'in' });
    expect(editField(inch, 13.2).metric).toBe(todayInToCm(13.2));
    expect(editField(inch, 13.2).metric).toBe(33.5);
    expect(editField(inch, 14.1).metric).toBe(35.8);
    const cm = unitField({ kind: 'tape', metric: 33.5, unit: 'cm' });
    expect(editField(cm, 34.2).metric).toBe(34);
    expect(editField(cm, '36,5').metric).toBe(36.5);
  });

  it('clamps at both range edges in both units', () => {
    const kg = unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' });
    expect(editField(kg, 10).metric).toBe(30);
    expect(editField(kg, 400).metric).toBe(250);
    const lb = unitField({ kind: 'bodyWeight', metric: 70, unit: 'lb' });
    const low = editField(lb, 20);
    expect(low.display).toBe('66.2');
    expect(low.metric).toBe(fromUnit(66.2, 'lb'));
    expect(low.metric).toBeGreaterThanOrEqual(30);
    const high = editField(lb, 900);
    expect(high.display).toBe('551.0');
    expect(high.metric).toBeLessThanOrEqual(250);
    expect(toUnit(high.metric, 'lb')).toBeCloseTo(551, 9);

    const cm = unitField({ kind: 'height', metric: 170, unit: 'cm' });
    expect(editField(cm, 100).metric).toBe(120);
    expect(editField(cm, 300).metric).toBe(230);
    const ftIn = unitField({ kind: 'height', metric: 170, unit: 'in' });
    expect(editField(ftIn, { ft: 3, inch: 0 })).toMatchObject({ metric: 121.92, display: '4 ft 0 in' });
    expect(editField(ftIn, { ft: 8, inch: 0 })).toMatchObject({ metric: 228.6, display: '7 ft 6 in' });

    const tapeCm = unitField({ kind: 'tape', metric: 33.5, unit: 'cm' });
    expect(editField(tapeCm, 1).metric).toBe(5);
    expect(editField(tapeCm, 400).metric).toBe(300);
    const tapeIn = unitField({ kind: 'tape', metric: 33.5, unit: 'in' });
    expect(editField(tapeIn, 1)).toMatchObject({ metric: 5.1, display: '2.0' });
    expect(editField(tapeIn, 200)).toMatchObject({ metric: 300, display: '118.1' });
  });

  it('ignores junk and empty text (the field keeps its value)', () => {
    const w = unitField({ kind: 'bodyWeight', metric: 70, unit: 'kg' });
    for (const junk of ['', '  ', 'abc', '7o', 'NaN', 'Infinity']) expect(editField(w, junk)).toEqual(w);
    expect(editField(w, Number.NaN)).toEqual(w);
    const h = unitField({ kind: 'height', metric: 170, unit: 'in' });
    for (const junk of ['tall', '67', "-5'"]) expect(editField(h, junk)).toEqual(h);
    // ft + in parts on a field that isn't ft·in are refused too.
    expect(editField(w, { ft: 5, inch: 7 })).toEqual(w);
  });

  it('never changes the field it is given', () => {
    const f = Object.freeze(unitField({ kind: 'tape', metric: 33.5, unit: 'cm' }));
    const g = editField(f, 40);
    expect(g.metric).toBe(40);
    expect(f.metric).toBe(33.5);
  });
});
