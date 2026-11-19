import { describe, expect, it } from 'vitest';
import type { LengthUnit, UnitPrefs } from '../../core/types';
import { lengthUnitFor, type Unit } from '../../core/units';
import { asFake, useFakeDom } from '../screens/testDom';
import { clampStep, decimalsOf, numberField, parseTyped } from './fields';
import { byAttr, copyHits, oneAttr, typeInto, valueOf } from './fuelTestUtil';
import {
  ACTIVITY_CHOICES,
  FROM_HEALTH,
  fuelSetupScreen,
  weightStep,
  type SetupProps,
  type SetupValues,
  SETUP_LEAD,
  SETUP_NOTE,
} from './setup';

useFakeDom();

/** Test shorthand: `unit` / `lengthUnit` build `units` (length follows the weight unit, as the
 *  app's fallback does when there is no 'lengthUnit' row). */
type RenderOver = Partial<Omit<SetupProps, 'units'>> & { unit?: Unit; lengthUnit?: LengthUnit };

function render(
  over: RenderOver = {},
  cancel = false,
  more: { notNow?: () => void; touch?: () => void } = {},
) {
  const saved: SetupValues[] = [];
  const units: UnitPrefs[] = [];
  let cancelled = 0;
  const { unit = 'kg', lengthUnit, ...rest } = over;
  const el = asFake(
    fuelSetupScreen(
      { year: 2026, units: { weight: unit, length: lengthUnit ?? lengthUnitFor(unit) }, ...rest },
      {
        onSave: (v) => saved.push(v),
        onCancel: cancel ? () => cancelled++ : undefined,
        onNotNow: more.notNow,
        onTouch: more.touch,
        onUnits: (u) => units.push(u),
      },
    ),
  );
  const field = (id: string) => oneAttr(el, 'data-field', id);
  const input = (id: string) => field(id).oneByClass('nf-value');
  const step = (id: string, dir: 'up' | 'down') => oneAttr(field(id), 'data-step', dir);
  const pick = (group: string, value: string) =>
    oneAttr(field(group), 'data-choice', value).click();
  const save = oneAttr(el, 'data-setup-save');
  return { el, saved, units, cancelled: () => cancelled, field, input, step, pick, save };
}

describe('number field helpers', () => {
  it('clamps and snaps to the step', () => {
    expect(clampStep(72.46, 30, 250, 0.1)).toBe(72.5);
    expect(clampStep(10, 30, 250, 0.1)).toBe(30);
    expect(clampStep(999, 0, 600, 50)).toBe(600);
    expect(clampStep(1.849, 1.6, 2.2, 0.1)).toBe(1.8);
  });
  it('counts step decimals and reads typed numbers (comma decimal too)', () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.25)).toBe(2);
    expect(parseTyped(' 72,4 ')).toBe(72.4);
    expect(parseTyped('')).toBeNaN();
    expect(parseTyped('abc')).toBeNaN();
  });
  it('steps with − / +, disables at the ends, and resets a non-number', () => {
    const got: number[] = [];
    const f = numberField({
      id: 'x',
      label: 'X',
      value: 599,
      step: 50,
      min: 0,
      max: 600,
      onChange: (v) => got.push(v),
    });
    const el = asFake(f.el);
    const input = el.oneByClass('nf-value');
    expect(valueOf(input)).toBe('600'); // snapped
    expect(oneAttr(el, 'data-step', 'up').hasAttribute('disabled')).toBe(true);
    oneAttr(el, 'data-step', 'down').click();
    expect(got).toEqual([550]);
    expect(oneAttr(el, 'data-step', 'up').hasAttribute('disabled')).toBe(false);
    typeInto(input, 'lots');
    expect(valueOf(input)).toBe('550');
    expect(got).toEqual([550]);
    typeInto(input, '-20');
    expect(got.at(-1)).toBe(0);
    expect(f.get()).toBe(0);
  });
});

describe('fuelSetupScreen', () => {
  it("asks height, birth year, sex, activity and today's weight", () => {
    const { el, field } = render();
    expect(el.getAttribute('data-screen')).toBe('fuel-setup');
    for (const id of ['height', 'birth-year', 'sex', 'activity', 'weight'])
      expect(field(id)).toBeTruthy();
    expect(field('activity').find((e) => e.hasAttribute('data-choice'))).toHaveLength(
      ACTIVITY_CHOICES.length,
    );
    expect(el.textContent).toContain('Saved as your first weigh-in.');
    expect(el.textContent).toContain('Stays on this phone.');
  });

  it('M13d task 19: a one-line lead and one note (first weigh-in + the privacy promise, lock icon)', () => {
    const { el } = render();
    const lead = el.byClass('fuel-lead');
    expect(lead.map((p) => p.textContent)).toEqual([SETUP_LEAD]);
    expect(SETUP_LEAD.split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(SETUP_LEAD.replace(/\.$/, '')).not.toMatch(/[.;!?]/);
    const note = oneAttr(el, 'data-setup-note');
    expect(note.textContent).toBe(SETUP_NOTE);
    expect(note.find((e) => e.getAttribute('data-icon') === 'lock')).toHaveLength(1);
    // The old separate weigh-in note is gone; the privacy promise is never behind More.
    expect(el.byClass('fuel-note').filter((p) => !p.hasAttribute('data-setup-missing'))).toEqual(
      [],
    );
    expect(byAttr(el, 'data-more')).toHaveLength(0);
    expect(copyHits(el)).toEqual([]);
  });

  it('keeps Save disabled until sex and activity are picked (no guessing)', () => {
    const r = render();
    expect(r.save.hasAttribute('disabled')).toBe(true);
    expect(oneAttr(r.el, 'data-setup-missing').textContent).toBe(
      'Pick your sex and activity level to continue.',
    );
    r.save.click();
    expect(r.saved).toEqual([]);
    r.pick('sex', 'female');
    expect(oneAttr(r.el, 'data-setup-missing').textContent).toBe(
      'Pick your activity level to continue.',
    );
    r.pick('activity', 'moderate');
    expect(r.save.hasAttribute('disabled')).toBe(false);
  });

  it('saves every value, with the weight in kg (the first weigh-in)', () => {
    const r = render();
    r.step('height', 'up').click();
    typeInto(r.input('birth-year'), '1990');
    r.pick('sex', 'male');
    r.pick('activity', 'light');
    typeInto(r.input('weight'), '68.3');
    r.save.click();
    expect(r.saved).toEqual([
      { heightCm: 171, birthYear: 1990, sex: 'male', activity: 'light', weightKg: 68.3 },
    ]);
  });

  it('marks the chosen option with aria-pressed (white fill class "on")', () => {
    const r = render();
    r.pick('sex', 'male');
    const male = oneAttr(r.field('sex'), 'data-choice', 'male');
    const female = oneAttr(r.field('sex'), 'data-choice', 'female');
    expect(male.getAttribute('aria-pressed')).toBe('true');
    expect(male.classes).toContain('on');
    expect(female.getAttribute('aria-pressed')).toBe('false');
  });

  it.each<[Unit, string, number]>([
    ['kg', '70.0', 0.1],
    ['lb', '154.3', 0.2], // M13d (n): core unitField's display (70 kg = 154.32 lb), not a snap
  ])('shows the weight in %s and converts back to kg', (unit, start, stepSize) => {
    const r = render({ unit });
    expect(valueOf(r.input('weight'))).toBe(start);
    expect(weightStep(unit)).toBe(stepSize);
    expect(r.field('weight').textContent).toContain(unit);
    r.pick('sex', 'female');
    r.pick('activity', 'sedentary');
    if (unit === 'lb') typeInto(r.input('weight'), '150');
    r.save.click();
    const kg = r.saved[0]?.weightKg ?? 0;
    expect(kg).toBeCloseTo(unit === 'kg' ? 70 : 150 * 0.45359237, 6);
  });

  it('re-run starts from the saved values and offers Back', () => {
    const r = render(
      { initial: { heightCm: 182, birthYear: 1988, sex: 'male', activity: 'very', weightKg: 80 } },
      true,
    );
    expect(valueOf(r.input('height'))).toBe('182');
    expect(valueOf(r.input('birth-year'))).toBe('1988');
    expect(valueOf(r.input('weight'))).toBe('80.0');
    expect(r.save.hasAttribute('disabled')).toBe(false);
    r.el.find((e) => e.tag === 'button' && e.textContent === 'Back')[0]?.click();
    expect(r.cancelled()).toBe(1);
    r.save.click();
    expect(r.saved[0]).toMatchObject({ heightCm: 182, activity: 'very', weightKg: 80 });
  });

  it('M13d task 24: Back is the edge swipe’s one Back (also with Not now in the flow); none without Back', () => {
    const marked = (el: ReturnType<typeof render>['el']) =>
      el.find((e) => e.hasAttribute('data-swipe-back'));
    const withBack = marked(render({}, true).el);
    expect(withBack).toHaveLength(1);
    expect(withBack[0]?.classes).toContain('fuel-back');
    const inFlow = render({}, true, { notNow: () => {} }).el;
    expect(marked(inFlow)).toHaveLength(1);
    expect(byAttr(inFlow, 'data-setup-not-now')[0]?.hasAttribute('data-swipe-back')).toBe(false);
    expect(marked(render().el)).toHaveLength(0);
  });

  it('first setup has no Back; birth years stay in range', () => {
    const r = render();
    expect(r.el.find((e) => e.textContent === 'Back' && e.tag === 'button')).toHaveLength(0);
    typeInto(r.input('birth-year'), '2024');
    expect(valueOf(r.input('birth-year'))).toBe('2012');
    typeInto(r.input('birth-year'), '1900');
    expect(valueOf(r.input('birth-year'))).toBe('1936');
  });

  it('passes the copy check', () => {
    expect(copyHits(render().el)).toEqual([]);
  });

  it('every button is labelled', () => {
    const { el } = render({}, true);
    for (const b of el.byTag('button')) {
      expect(b.textContent.trim() || b.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('M13d task 8: From Apple Health', () => {
  const HEALTH = new Set(['height', 'birthYear', 'sex'] as const);

  it('a note under each field Health pre-filled, linked to its input', () => {
    const r = render({
      initial: { heightCm: 165, birthYear: 1991, sex: 'female', weightKg: 61.2 },
      fromHealth: HEALTH,
    });
    const notes = byAttr(r.el, 'data-from-health');
    expect(notes.map((n) => n.getAttribute('data-from-health'))).toEqual([
      'height',
      'birthYear',
      'sex',
    ]);
    for (const n of notes) expect(n.textContent).toBe(FROM_HEALTH);
    // Each note sits inside its field and is read with it.
    expect(byAttr(r.field('height'), 'data-from-health')).toHaveLength(1);
    expect(r.input('height').getAttribute('aria-describedby')).toContain('from-health-height');
    expect(r.input('birth-year').getAttribute('aria-describedby')).toContain(
      'from-health-birthYear',
    );
    const sexGroup = r.field('sex').find((e) => e.getAttribute('role') === 'group')[0];
    expect(sexGroup?.getAttribute('aria-describedby')).toBe('from-health-sex');
    // The values are there; you still confirm with Save (activity is never pre-filled).
    expect(valueOf(r.input('height'))).toBe('165');
    expect(oneAttr(r.field('sex'), 'data-choice', 'female').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(r.save.hasAttribute('disabled')).toBe(true);
    r.pick('activity', 'light');
    r.save.click();
    expect(r.saved).toEqual([
      { heightCm: 165, birthYear: 1991, sex: 'female', activity: 'light', weightKg: 61.2 },
    ]);
  });

  it('a weight from a Health weigh-in is tagged too', () => {
    const r = render({ initial: { weightKg: 61.2 }, fromHealth: new Set(['weight'] as const) });
    expect(byAttr(r.el, 'data-from-health').map((n) => n.getAttribute('data-from-health'))).toEqual(
      ['weight'],
    );
    expect(r.input('weight').getAttribute('aria-describedby')).toContain('from-health-weight');
  });

  it('nothing is said without Health (PWA, Not now, nothing recorded)', () => {
    for (const fromHealth of [undefined, new Set<never>()]) {
      const r = render({ initial: { heightCm: 165 }, fromHealth });
      expect(byAttr(r.el, 'data-from-health')).toHaveLength(0);
      expect(r.el.textContent).not.toContain(FROM_HEALTH);
    }
  });

  it('the note passes the copy check', () => {
    expect(copyHits(render({ fromHealth: HEALTH }).el)).toEqual([]);
  });
});

describe('M13d task 13: height in cm or ft + in', () => {
  const ftIn = (r: ReturnType<typeof render>, part: 'ft' | 'in') =>
    oneAttr(r.field('height'), 'data-part', part);

  it('cm (the default with kg): one field; an untouched height saves exactly as given', () => {
    const r = render({ initial: { heightCm: 170.18 } });
    expect(byAttr(r.field('height'), 'data-part')).toHaveLength(0);
    expect(valueOf(r.input('height'))).toBe('170');
    r.pick('sex', 'female');
    r.pick('activity', 'light');
    r.save.click();
    expect(r.saved[0]?.heightCm).toBe(170.18);
    typeInto(r.input('height'), '999');
    expect(valueOf(r.input('height'))).toBe('230');
    expect(oneAttr(r.field('height'), 'data-step', 'up').hasAttribute('disabled')).toBe(true);
  });

  it('ft + in: 170 cm shows 5 ft 7 in in two − / + rows, and saves 170 untouched', () => {
    const r = render({ lengthUnit: 'in', initial: { heightCm: 170 } });
    expect(r.field('height').getAttribute('role')).toBe('group');
    expect(valueOf(ftIn(r, 'ft').oneByClass('nf-value'))).toBe('5');
    expect(valueOf(ftIn(r, 'in').oneByClass('nf-value'))).toBe('7');
    expect(ftIn(r, 'ft').textContent).toContain('ft');
    expect(ftIn(r, 'in').textContent).toContain('in');
    r.pick('sex', 'male');
    r.pick('activity', 'light');
    r.save.click();
    expect(r.saved[0]?.heightCm).toBe(170);
  });

  it('follows the weight unit when no length unit is given (lb → ft + in)', () => {
    const r = render({ unit: 'lb', initial: { heightCm: 170 } });
    expect(byAttr(r.field('height'), 'data-part')).toHaveLength(2);
  });

  it('typed 5\'7" (in either box) → 170.18 cm, stored as is (2 decimals)', () => {
    for (const part of ['ft', 'in'] as const) {
      const r = render({ lengthUnit: 'in' });
      typeInto(ftIn(r, part).oneByClass('nf-value'), '5\'7"');
      expect(valueOf(ftIn(r, 'ft').oneByClass('nf-value'))).toBe('5');
      expect(valueOf(ftIn(r, 'in').oneByClass('nf-value'))).toBe('7');
      r.pick('sex', 'female');
      r.pick('activity', 'light');
      r.save.click();
      expect(r.saved[0]?.heightCm).toBe(170.18);
    }
  });

  it('inches carry at 12 both ways; feet step whole feet; plain numbers per box', () => {
    const r = render({ lengthUnit: 'in', initial: { heightCm: 180.34 } }); // 5 ft 11 in
    const val = (part: 'ft' | 'in') => valueOf(ftIn(r, part).oneByClass('nf-value'));
    expect([val('ft'), val('in')]).toEqual(['5', '11']);
    oneAttr(ftIn(r, 'in'), 'data-step', 'up').click();
    expect([val('ft'), val('in')]).toEqual(['6', '0']);
    oneAttr(ftIn(r, 'in'), 'data-step', 'down').click();
    expect([val('ft'), val('in')]).toEqual(['5', '11']);
    oneAttr(ftIn(r, 'ft'), 'data-step', 'down').click();
    expect([val('ft'), val('in')]).toEqual(['4', '11']);
    typeInto(ftIn(r, 'in').oneByClass('nf-value'), '14');
    expect([val('ft'), val('in')]).toEqual(['5', '2']);
    typeInto(ftIn(r, 'ft').oneByClass('nf-value'), '6');
    expect([val('ft'), val('in')]).toEqual(['6', '2']);
    typeInto(ftIn(r, 'ft').oneByClass('nf-value'), 'tall');
    expect([val('ft'), val('in')]).toEqual(['6', '2']);
  });

  it('clamps to the height range (4 ft 0 in – 7 ft 6 in) and disables − / + at the ends', () => {
    const r = render({ lengthUnit: 'in' });
    const val = (part: 'ft' | 'in') => valueOf(ftIn(r, part).oneByClass('nf-value'));
    typeInto(ftIn(r, 'ft').oneByClass('nf-value'), '9');
    expect([val('ft'), val('in')]).toEqual(['7', '6']);
    for (const part of ['ft', 'in'] as const)
      expect(oneAttr(ftIn(r, part), 'data-step', 'up').hasAttribute('disabled')).toBe(true);
    typeInto(ftIn(r, 'ft').oneByClass('nf-value'), '1');
    expect([val('ft'), val('in')]).toEqual(['4', '0']);
    for (const part of ['ft', 'in'] as const)
      expect(oneAttr(ftIn(r, part), 'data-step', 'down').hasAttribute('disabled')).toBe(true);
  });

  it('each box and step button has its own name', () => {
    const r = render({ lengthUnit: 'in' });
    expect(ftIn(r, 'ft').oneByClass('nf-value').getAttribute('aria-label')).toBe('Height, feet');
    expect(ftIn(r, 'in').oneByClass('nf-value').getAttribute('aria-label')).toBe('Height, inches');
    expect(oneAttr(ftIn(r, 'in'), 'data-step', 'up').getAttribute('aria-label')).toBe(
      'More Height, inches',
    );
  });
});

describe('M13d task 3b: Not now and the first touch', () => {
  it('a quiet Not now only when asked for; it calls back once per tap and saves nothing', () => {
    expect(byAttr(render().el, 'data-setup-not-now')).toHaveLength(0);
    let n = 0;
    const r = render({}, true, { notNow: () => n++ });
    const btn = oneAttr(r.el, 'data-setup-not-now');
    expect(btn.tag).toBe('button');
    expect(btn.textContent).toBe('Not now');
    // M13d task 40b: a quiet round button with its word beside the circle.
    expect(btn.classes).toContain('icon-btn');
    expect(btn.getAttribute('data-variant')).toBe('quiet');
    btn.click();
    expect(n).toBe(1);
    expect(r.saved).toEqual([]);
  });

  it('onTouch fires once, on the first edit or pick', () => {
    let touches = 0;
    const r = render({}, false, { touch: () => touches++ });
    expect(touches).toBe(0);
    r.step('height', 'up').click();
    r.pick('sex', 'female');
    typeInto(r.input('weight'), '71');
    expect(touches).toBe(1);
    const r2 = render({}, false, { touch: () => touches++ });
    r2.el.dispatch('focusin', {});
    expect(touches).toBe(2);
  });
});

describe("M13d task 13c: a unit switch next to Height and Today's weight", () => {
  /** The switch in a field's label row (the group with `data-unit-for`). */
  const unitGroup = (r: ReturnType<typeof render>, id: string) =>
    oneAttr(r.field(id), 'data-unit-for', id);
  const tap = (r: ReturnType<typeof render>, id: string, unit: string) =>
    oneAttr(unitGroup(r, id), 'data-unit', unit).click();
  const pressed = (r: ReturnType<typeof render>, id: string) =>
    byAttr(unitGroup(r, id), 'data-unit')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.getAttribute('data-unit'));
  const ftIn = (r: ReturnType<typeof render>) =>
    ['ft', 'in'].map((part) =>
      valueOf(oneAttr(r.field('height'), 'data-part', part).oneByClass('nf-value')),
    );

  it("each switch is a named group in its field's label row, showing the units passed in", () => {
    const r = render({ unit: 'lb', lengthUnit: 'cm' });
    const w = unitGroup(r, 'weight');
    expect(w.getAttribute('role')).toBe('group');
    expect(w.getAttribute('aria-label')).toBe('Weight unit');
    expect(unitGroup(r, 'height').getAttribute('aria-label')).toBe('Height unit');
    expect(pressed(r, 'weight')).toEqual(['lb']);
    expect(pressed(r, 'height')).toEqual(['cm']);
    // In the label row, right after the label.
    const head = r.field('weight').oneByClass('unit-field-head');
    expect(head.children[0]?.classes).toContain('nf-label');
    expect(head.children[1]).toBe(w);
    // Exactly two switches on the page (birth year, sex and activity have none).
    expect(byAttr(r.el, 'data-unit-switch')).toHaveLength(2);
  });

  it('70.0 kg → lb 154.3 → kg 70.0 with no drift, nothing saved, onUnits once per tap', () => {
    const r = render({ initial: { weightKg: 70 } });
    expect(valueOf(r.input('weight'))).toBe('70.0');
    tap(r, 'weight', 'lb');
    expect(valueOf(r.input('weight'))).toBe('154.3');
    expect(r.field('weight').oneByClass('nf-unit').textContent).toBe('lb');
    tap(r, 'weight', 'kg');
    expect(valueOf(r.input('weight'))).toBe('70.0');
    for (let i = 0; i < 20; i++) {
      tap(r, 'weight', 'lb');
      tap(r, 'weight', 'kg');
    }
    expect(valueOf(r.input('weight'))).toBe('70.0');
    expect(r.saved).toEqual([]);
    expect(r.units).toHaveLength(42);
    expect(r.units[0]).toEqual({ weight: 'lb', length: 'cm' });
    expect(r.units.at(-1)).toEqual({ weight: 'kg', length: 'cm' });
    // Tapping the unit already shown does nothing.
    tap(r, 'weight', 'kg');
    expect(r.units).toHaveLength(42);
    // Save after all that: exactly the kg it started from.
    r.pick('sex', 'female');
    r.pick('activity', 'light');
    tap(r, 'weight', 'lb');
    r.save.click();
    expect(r.saved[0]?.weightKg).toBe(70);
  });

  it('170 cm → 5 ft 7 in → 170 cm, saves exactly 170; the other unit is kept in onUnits', () => {
    const r = render({ unit: 'lb', lengthUnit: 'cm', initial: { heightCm: 170 } });
    expect(valueOf(r.input('height'))).toBe('170');
    tap(r, 'height', 'in');
    expect(ftIn(r)).toEqual(['5', '7']);
    expect(r.field('height').getAttribute('data-unit')).toBe('ftin');
    tap(r, 'height', 'cm');
    expect(byAttr(r.field('height'), 'data-part')).toHaveLength(0);
    expect(valueOf(r.input('height'))).toBe('170');
    for (let i = 0; i < 20; i++) {
      tap(r, 'height', 'in');
      tap(r, 'height', 'cm');
    }
    expect(r.units[0]).toEqual({ weight: 'lb', length: 'in' });
    expect(r.units[1]).toEqual({ weight: 'lb', length: 'cm' });
    expect(r.units).toHaveLength(42);
    r.pick('sex', 'male');
    r.pick('activity', 'light');
    tap(r, 'height', 'in');
    r.save.click();
    expect(r.saved[0]?.heightCm).toBe(170);
  });

  it('switching one field keeps the other unit; both switches reported as the whole preference', () => {
    const r = render();
    tap(r, 'weight', 'lb');
    tap(r, 'height', 'in');
    tap(r, 'weight', 'kg');
    expect(r.units).toEqual([
      { weight: 'lb', length: 'cm' },
      { weight: 'lb', length: 'in' },
      { weight: 'kg', length: 'in' },
    ]);
  });

  it('only an edit changes the value: 154.4 lb typed → shown again after kg and back', () => {
    const r = render({ initial: { weightKg: 70 } });
    tap(r, 'weight', 'lb');
    typeInto(r.input('weight'), '154.4');
    tap(r, 'weight', 'kg');
    expect(valueOf(r.input('weight'))).toBe('70.0');
    tap(r, 'weight', 'lb');
    expect(valueOf(r.input('weight'))).toBe('154.4');
    r.pick('sex', 'female');
    r.pick('activity', 'light');
    r.save.click();
    expect(r.saved[0]?.weightKg).toBeCloseTo(154.4 * 0.45359237, 9);
    // The rebuilt field still steps and types (one − / + row, edits through core).
    r.step('weight', 'up').click();
    expect(valueOf(r.input('weight'))).toBe('154.6');
  });

  it('a switch counts as starting the form (onTouch) and keeps "From Apple Health" linked', () => {
    let touches = 0;
    const r = render(
      {
        initial: { heightCm: 165, weightKg: 61.2 },
        fromHealth: new Set(['height', 'weight'] as const),
      },
      false,
      { touch: () => touches++ },
    );
    tap(r, 'height', 'in');
    expect(touches).toBe(1);
    tap(r, 'weight', 'lb');
    for (const id of ['height', 'weight']) {
      expect(byAttr(r.field(id), 'data-from-health')).toHaveLength(1);
    }
    for (const part of ['ft', 'in'])
      expect(
        oneAttr(r.field('height'), 'data-part', part)
          .oneByClass('nf-value')
          .getAttribute('aria-describedby'),
      ).toContain('from-health-height');
    expect(r.input('weight').getAttribute('aria-describedby')).toContain('from-health-weight');
    expect(copyHits(r.el)).toEqual([]);
  });

  it('every switch button has a visible word', () => {
    const r = render();
    for (const b of byAttr(r.el, 'data-unit')) expect(b.textContent.trim()).toBeTruthy();
  });
});

describe('M13d task 40b: round buttons', () => {
  it('Save targets is the main pill; Back is round with its word beside it', () => {
    const r = render({}, true);
    expect(r.save.getAttribute('data-variant')).toBe('main');
    expect(r.save.classes).toContain('flow-pill');
    expect(r.save.textContent).toBe('Save targets');
    const back = r.el.oneByClass('fuel-back');
    expect(back.getAttribute('data-icon-btn')).not.toBeNull();
    expect(back.getAttribute('data-label-at')).toBe('beside');
    expect(back.textContent).toBe('Back');
  });

  it('− / + are round with the words Less / More; their names stay "Less <field>"', () => {
    const r = render();
    const down = r.step('weight', 'down');
    const up = r.step('weight', 'up');
    expect(down.hasAttribute('data-icon-btn')).toBe(true);
    expect([down.textContent, up.textContent]).toEqual(['Less', 'More']);
    expect(down.getAttribute('aria-label')).toBe("Less Today's weight");
    expect(up.getAttribute('aria-label')).toBe("More Today's weight");
    expect(down.classes).toContain('nf-step');
    const before = valueOf(r.input('weight'));
    up.click();
    expect(valueOf(r.input('weight'))).not.toBe(before);
    // The plain number field (birth year) uses the same pair.
    expect(r.step('birth-year', 'up').getAttribute('aria-label')).toBe('More Birth year');
  });
});
