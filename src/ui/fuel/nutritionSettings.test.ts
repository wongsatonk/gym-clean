import { describe, expect, it } from 'vitest';
import type { NutritionSettings, NutritionTargets } from '../../core/types';
import { asFake, useFakeDom } from '../screens/testDom';
import { copyHits, oneAttr, byAttr, typeInto } from './fuelTestUtil';
import {
  BARCODE_EXPLAINER,
  FLOORED_NOTE,
  nutritionSettings,
  surplusLabel,
  surplusRange,
  targetText,
  type MacroKey,
  type NutritionSettingsProps,
} from './nutritionSettings';

useFakeDom();

// Made-up numbers only (public repo).
const SETTINGS: NutritionSettings = {
  mode: 'quick',
  heightCm: 175,
  birthYear: 1995,
  sex: 'male',
  activity: 'moderate',
  surplusKcal: 300,
  proteinGPerKg: 1.8,
  fatPct: 25,
  gainPctPerWeek: [0.25, 0.5],
  barcodeLookup: false,
};
const TARGETS: NutritionTargets = {
  kcal: { value: 2650, estimate: true },
  proteinG: { value: 126, estimate: true },
  carbsG: { value: 340, estimate: true },
  fatG: { value: 74, estimate: true },
};

function render(over: Partial<NutritionSettingsProps> = {}) {
  const calls = {
    mode: [] as string[],
    override: [] as [MacroKey, number | null][],
    surplus: [] as number[],
    protein: [] as number[],
    setup: 0,
    barcode: [] as boolean[],
  };
  const el = asFake(
    nutritionSettings(
      { settings: SETTINGS, targets: TARGETS, ...over },
      {
        onMode: (m) => calls.mode.push(m),
        onOverride: (k, v) => calls.override.push([k, v]),
        onSurplus: (v) => calls.surplus.push(v),
        onProteinPerKg: (v) => calls.protein.push(v),
        onSetup: () => calls.setup++,
        onBarcodeLookup: (on) => calls.barcode.push(on),
      },
    ),
  );
  return { el, calls };
}

const rows = (el: ReturnType<typeof render>['el']) =>
  byAttr(el, 'data-target').map((r) => r.getAttribute('data-target'));

describe('Settings → Nutrition', () => {
  it('Quick shows kcal + protein; Full adds carbs + fat', () => {
    expect(rows(render().el)).toEqual(['kcal', 'proteinG']);
    expect(rows(render({ settings: { ...SETTINGS, mode: 'full' } }).el)).toEqual([
      'kcal',
      'proteinG',
      'carbsG',
      'fatG',
    ]);
  });

  it('the mode switch marks the chosen mode and only calls back on a change', () => {
    const { el, calls } = render();
    const quick = oneAttr(el, 'data-mode', 'quick');
    expect(quick.getAttribute('aria-pressed')).toBe('true');
    quick.click();
    oneAttr(el, 'data-mode', 'full').click();
    expect(calls.mode).toEqual(['full']);
    expect(el.textContent).toContain('Calories, protein and weight.');
  });

  it('targets show the number, unit and an "estimate" tag; overrides say "set by you"', () => {
    const { el } = render({
      settings: { ...SETTINGS, overrides: { kcal: 2800 } },
      targets: { ...TARGETS, kcal: { value: 2800, estimate: false } },
    });
    const kcal = oneAttr(el, 'data-target', 'kcal');
    expect(kcal.oneByClass('nt-value').textContent).toBe('2,800');
    expect(kcal.textContent).toContain('kcal');
    expect(byAttr(kcal, 'data-estimate')).toHaveLength(0);
    expect(byAttr(kcal, 'data-yours')).toHaveLength(1);
    const protein = oneAttr(el, 'data-target', 'proteinG');
    expect(protein.oneByClass('nt-value').textContent).toBe('126');
    expect(byAttr(protein, 'data-estimate')).toHaveLength(1);
    expect(targetText(2649.6)).toBe('2,650');
  });

  it('Change → edit → Save sends the override; Use estimate drops it; Cancel goes back', () => {
    const { el, calls } = render({ settings: { ...SETTINGS, overrides: { proteinG: 140 } } });
    oneAttr(el, 'data-target-edit', 'kcal').click();
    const kcal = oneAttr(el, 'data-target', 'kcal');
    expect(byAttr(kcal, 'data-target-reset')).toHaveLength(0); // not overridden
    typeInto(kcal.oneByClass('nf-value'), '2903');
    oneAttr(kcal, 'data-target-save', 'kcal').click();
    expect(calls.override).toEqual([['kcal', 2900]]); // snapped to 10 kcal
    oneAttr(kcal, 'data-target-cancel', 'kcal').click();
    expect(kcal.oneByClass('nt-value').textContent).toBe('2,650');

    oneAttr(el, 'data-target-edit', 'proteinG').click();
    oneAttr(el, 'data-target-reset', 'proteinG').click();
    expect(calls.override.at(-1)).toEqual(['proteinG', null]);
  });

  it('surplus steps 0–600 by 50 and protein 1.6–2.2 by 0.1', () => {
    const { el, calls } = render({
      settings: { ...SETTINGS, surplusKcal: 600, proteinGPerKg: 2.2 },
    });
    const surplus = oneAttr(el, 'data-field', 'surplus');
    expect(oneAttr(surplus, 'data-step', 'up').hasAttribute('disabled')).toBe(true);
    oneAttr(surplus, 'data-step', 'down').click();
    const protein = oneAttr(el, 'data-field', 'protein');
    oneAttr(protein, 'data-step', 'down').click();
    oneAttr(protein, 'data-step', 'down').click();
    expect(calls.surplus).toEqual([550]);
    expect(calls.protein).toEqual([2.1, 2]);
    typeInto(protein.oneByClass('nf-value'), '3');
    expect(calls.protein.at(-1)).toBe(2.2);
  });

  it('M12 1b: a "lose fat" goal lets the stepper go below maintenance (to −600)', () => {
    expect(surplusRange('fat')).toEqual({ min: -600, max: 0, step: 50 });
    expect(surplusRange(undefined)).toEqual({ min: 0, max: 600, step: 50 });
    expect(surplusLabel('fat')).toMatch(/vs maintenance/);
    expect(surplusLabel('muscle')).toBe('Calories above maintenance');
    const { el, calls } = render({
      settings: { ...SETTINGS, goalKind: 'fat', surplusKcal: -400 },
    });
    const surplus = oneAttr(el, 'data-field', 'surplus');
    expect(oneAttr(surplus, 'data-step', 'up').hasAttribute('disabled')).toBe(false);
    oneAttr(surplus, 'data-step', 'down').click();
    expect(calls.surplus).toEqual([-450]);
  });

  it('M12 1b: says so when the kcal target was lifted to the resting estimate', () => {
    expect(byAttr(render().el, 'data-kcal-floored')).toHaveLength(0);
    const { el } = render({ kcalFloored: true });
    expect(oneAttr(el, 'data-kcal-floored').textContent).toBe(FLOORED_NOTE);
  });

  it('Re-run setup calls onSetup', () => {
    const { el, calls } = render();
    oneAttr(el, 'data-setup-rerun').click();
    expect(calls.setup).toBe(1);
    expect(oneAttr(el, 'data-setup-rerun').textContent).toBe('Re-run setup');
  });

  it('no weigh-in yet: says so instead of targets', () => {
    const { el } = render({ targets: null });
    expect(oneAttr(el, 'data-targets', 'none').textContent).toBe(
      'Weigh in first to see your targets.',
    );
  });

  it('not set up: only "Set up targets" and the barcode switch', () => {
    const { el, calls } = render({ settings: null, targets: null });
    expect(el.getAttribute('data-nutrition')).toBe('empty');
    expect(byAttr(el, 'data-mode')).toHaveLength(0);
    oneAttr(el, 'data-setup-rerun').click();
    expect(calls.setup).toBe(1);
    expect(byAttr(el, 'data-setting', 'barcode-lookup')).toHaveLength(1);
  });

  it('not set up: the barcode switch shows the stored flag (prop), not a hardcoded off', () => {
    const sw = (on?: boolean) =>
      oneAttr(
        render({ settings: null, targets: null, barcodeLookup: on }).el,
        'data-setting',
        'barcode-lookup',
      ).getAttribute('aria-checked');
    expect(sw(true)).toBe('true');
    expect(sw(false)).toBe('false');
    expect(sw(undefined)).toBe('false');
  });

  describe('barcode lookup (off by default, explains before turning on)', () => {
    it('off → tapping shows the explainer first; nothing is turned on yet', () => {
      const { el, calls } = render();
      const sw = oneAttr(el, 'data-setting', 'barcode-lookup');
      expect(sw.getAttribute('role')).toBe('switch');
      expect(sw.getAttribute('aria-checked')).toBe('false');
      sw.click();
      expect(calls.barcode).toEqual([]);
      const confirm = oneAttr(el, 'data-barcode-confirm');
      expect(confirm.textContent).toContain(BARCODE_EXPLAINER);
      expect(BARCODE_EXPLAINER).toContain('Nothing else is sent.');
      oneAttr(el, 'data-barcode-on').click();
      expect(calls.barcode).toEqual([true]);
    });

    it('Not now goes back to the Off switch without a call', () => {
      const { el, calls } = render();
      oneAttr(el, 'data-setting', 'barcode-lookup').click();
      oneAttr(el, 'data-barcode-cancel').click();
      expect(byAttr(el, 'data-barcode-confirm')).toHaveLength(0);
      expect(oneAttr(el, 'data-setting', 'barcode-lookup').getAttribute('aria-checked')).toBe(
        'false',
      );
      expect(calls.barcode).toEqual([]);
    });

    it('on → turning it off is immediate', () => {
      const { el, calls } = render({ settings: { ...SETTINGS, barcodeLookup: true } });
      const sw = oneAttr(el, 'data-setting', 'barcode-lookup');
      expect(sw.getAttribute('aria-checked')).toBe('true');
      expect(el.textContent).toContain('Only the barcode number is sent.');
      sw.click();
      expect(calls.barcode).toEqual([false]);
    });
  });

  it('passes the copy check in both modes, the edit state and the barcode explainer', () => {
    const quick = render();
    oneAttr(quick.el, 'data-setting', 'barcode-lookup').click();
    oneAttr(quick.el, 'data-target-edit', 'kcal').click();
    expect(copyHits(quick.el)).toEqual([]);
    expect(copyHits(render({ settings: { ...SETTINGS, mode: 'full' } }).el)).toEqual([]);
  });
});
