import { describe, expect, it } from 'vitest';
import type { Unit } from '../../core/units';
import { asFake, useFakeDom } from '../screens/testDom';
import { clampStep, decimalsOf, numberField, parseTyped } from './fields';
import { copyHits, oneAttr, typeInto, valueOf } from './fuelTestUtil';
import {
  ACTIVITY_CHOICES,
  fuelSetupScreen,
  weightStep,
  type SetupProps,
  type SetupValues,
} from './setup';

useFakeDom();

function render(over: Partial<SetupProps> = {}, cancel = false) {
  const saved: SetupValues[] = [];
  let cancelled = 0;
  const el = asFake(
    fuelSetupScreen(
      { year: 2026, unit: 'kg', ...over },
      { onSave: (v) => saved.push(v), onCancel: cancel ? () => cancelled++ : undefined },
    ),
  );
  const field = (id: string) => oneAttr(el, 'data-field', id);
  const input = (id: string) => field(id).oneByClass('nf-value');
  const step = (id: string, dir: 'up' | 'down') => oneAttr(field(id), 'data-step', dir);
  const pick = (group: string, value: string) =>
    oneAttr(field(group), 'data-choice', value).click();
  const save = oneAttr(el, 'data-setup-save');
  return { el, saved, cancelled: () => cancelled, field, input, step, pick, save };
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
    ['lb', '154.4', 0.2],
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
