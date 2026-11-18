// Render tests for the entry editor (task 11), Recipe editor and My food editor (task 13).
// Made-up numbers only.
import { describe, expect, it } from 'vitest';
import type { FoodAmount, FoodEntry, MacroSet } from '../../core/types';
import { asFake, useFakeDom } from '../screens/testDom';
import { entrySheet } from './entrySheet';
import { all, byAttr, expectCleanCopy, key, typeInto } from './fuelTestKit';
import type { LogItem } from './logSheet';
import { myFoodEditor, type MyFoodDraft } from './myFoodEditor';
import { recipeEditor, type RecipeDraft } from './recipeEditor';

useFakeDom();

const val = (el: unknown) => (el as { value: string }).value;

describe('entrySheet', () => {
  const ENTRY: FoodEntry = {
    id: 'e1',
    date: '2026-11-14',
    time: 0,
    slot: 'lunch',
    label: 'Khao man gai',
    amount: { servings: 1 },
    estimate: true,
    kcal: 600,
    proteinG: 30,
  };
  const preview = (a: FoodAmount): MacroSet => {
    const k = 'servings' in a ? a.servings : a.grams / 100;
    return { kcal: 600 * k, proteinG: 30 * k };
  };

  function open(entry: FoodEntry = ENTRY) {
    const calls = { save: [] as unknown[], del: 0, close: 0 };
    const el = asFake(
      entrySheet(
        { entry, mode: 'quick', preview },
        {
          onSave: (c) => calls.save.push(c),
          onDelete: () => calls.del++,
          onClose: () => calls.close++,
        },
      ),
    );
    return { el, calls };
  }

  it('edits amount (0.5 steps) and slot with a live preview, then saves', () => {
    const { el, calls } = open();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(byAttr(el, 'data-preview').textContent).toBe('600 kcal · 30 g protein');
    byAttr(el, 'data-step', 'up').click();
    expect(byAttr(el, 'data-preview').textContent).toBe('900 kcal · 45 g protein');
    byAttr(el, 'data-slot-chip', 'post-workout').click();
    expect(byAttr(el, 'data-slot-chip', 'post-workout').getAttribute('aria-pressed')).toBe('true');
    expect(byAttr(el, 'data-slot-chip', 'lunch').getAttribute('aria-pressed')).toBe('false');
    byAttr(el, 'data-entry-save').click();
    expect(calls.save).toEqual([{ amount: { servings: 1.5 }, slot: 'post-workout' }]);
    expectCleanCopy(el);
  });

  it('gram entries step by 10 g; Delete and Escape', () => {
    const { el, calls } = open({ ...ENTRY, amount: { grams: 150 } });
    byAttr(el, 'data-step', 'down').click();
    byAttr(el, 'data-entry-save').click();
    expect(calls.save).toEqual([{ amount: { grams: 140 }, slot: 'lunch' }]);
    byAttr(el, 'data-entry-remove').click();
    expect(calls.del).toBe(1);
    key(el, 'Escape');
    expect(calls.close).toBe(1);
  });
});

describe('recipeEditor', () => {
  const OIL: LogItem = {
    key: 'usda:oil',
    label: 'Oil, vegetable',
    macros: { kcal: 884, proteinG: 0 },
    per: '100g',
    ref: { foodId: 'usda:oil' },
  };
  const CHICKEN: LogItem = {
    key: 'usda:chicken',
    label: 'Chicken breast, raw',
    macros: { kcal: 120, proteinG: 22.5 },
    per: '100g',
    ref: { foodId: 'usda:chicken' },
  };
  const PER100: Record<string, MacroSet> = {
    'usda:oil': OIL.macros,
    'usda:chicken': CHICKEN.macros,
  };
  // Stand-in for the core recipe math: sum per 100 g × grams, ÷ servings.
  const perServing = (d: RecipeDraft): MacroSet => {
    let kcal = 0;
    let proteinG = 0;
    for (const i of d.ingredients) {
      kcal += ((PER100[i.foodId]?.kcal ?? 0) * i.grams) / 100;
      proteinG += ((PER100[i.foodId]?.proteinG ?? 0) * i.grams) / 100;
    }
    return { kcal: kcal / d.servings, proteinG: proteinG / d.servings };
  };

  function open(
    draft: RecipeDraft = { name: '', servings: 2, ingredients: [] },
    withDelete = false,
  ) {
    const calls = { search: [] as string[], save: [] as RecipeDraft[], cancel: 0, del: 0 };
    const ed = recipeEditor(
      { draft, mode: 'quick', perServing },
      {
        onSearch: (q) => calls.search.push(q),
        onSave: (d) => calls.save.push(d),
        onCancel: () => calls.cancel++,
        onDelete: withDelete ? () => calls.del++ : undefined,
      },
    );
    return { ed, el: asFake(ed), calls };
  }

  it('builds a recipe: search → add (100 g), edit grams, servings, live per-serving preview', () => {
    const { ed, el, calls } = open();
    expect(el.textContent).toContain('New recipe');
    expect(byAttr(el, 'data-per-serving').textContent).toBe('Add ingredients to see it.');
    typeInto(byAttr(el, 'id', 'recipe-search'), 'chicken');
    expect(calls.search).toEqual(['chicken']);
    ed.setSearch({ status: 'results', query: 'chicken', items: [CHICKEN, OIL] });
    byAttr(el, 'data-log-item', 'usda:chicken').click();
    byAttr(el, 'data-log-item', 'usda:oil').click();
    expect(all(el, 'data-ingredient').map((r) => r.getAttribute('data-ingredient'))).toEqual([
      'usda:chicken',
      'usda:oil',
    ]);
    // 100 g chicken + 100 g oil over 2 servings.
    expect(byAttr(el, 'data-per-serving').textContent).toBe('502 kcal · 11 g protein');
    typeInto(byAttr(el, 'id', 'grams-0'), '400');
    typeInto(byAttr(el, 'id', 'grams-1'), '20');
    expect(byAttr(el, 'data-per-serving').textContent).toBe('328 kcal · 45 g protein');
    byAttr(el, 'data-step', 'up').click(); // 3 servings
    expect(byAttr(el, 'data-stepper', 'servings').textContent).toContain('3servings');
    typeInto(byAttr(el, 'id', 'recipe-name'), 'Chicken stir fry');
    byAttr(el, 'data-recipe-save').click();
    expect(calls.save).toEqual([
      {
        name: 'Chicken stir fry',
        servings: 3,
        ingredients: [
          { foodId: 'usda:chicken', name: 'Chicken breast, raw', grams: 400 },
          { foodId: 'usda:oil', name: 'Oil, vegetable', grams: 20 },
        ],
      },
    ]);
    expect(el.textContent).toContain('doesn’t change food you already logged');
    expectCleanCopy(el);
  });

  it('labels each grams input by its ingredient; Remove drops it', () => {
    const { el } = open({
      id: 'r1',
      name: 'Curry',
      servings: 4,
      ingredients: [
        { foodId: 'usda:chicken', name: 'Chicken breast, raw', grams: 500 },
        { foodId: 'usda:oil', name: 'Oil, vegetable', grams: 30 },
      ],
    });
    expect(el.textContent).toContain('Edit recipe');
    expect(val(byAttr(el, 'id', 'grams-0'))).toBe('500');
    expect(byAttr(el, 'for', 'grams-0').textContent).toBe('Chicken breast, raw, grams');
    const rm = byAttr(el, 'data-ingredient-remove', 'usda:oil');
    expect(rm.getAttribute('aria-label')).toBe('Remove Oil, vegetable');
    rm.click();
    expect(all(el, 'data-ingredient')).toHaveLength(1);
  });

  it('validates: a name and at least one ingredient; bad grams show an error by the field', () => {
    const { el, calls } = open();
    byAttr(el, 'data-recipe-save').click();
    expect(calls.save).toHaveLength(0);
    expect(byAttr(el, 'id', 'recipe-name-err').textContent).toBe('Give the recipe a name.');
    expect(byAttr(el, 'id', 'rx-list-err').textContent).toBe('Add at least one ingredient.');
    const { ed: ed2, el: el2 } = open({ name: 'X', servings: 1, ingredients: [] });
    ed2.setSearch({ status: 'results', query: 'c', items: [CHICKEN] });
    byAttr(el2, 'data-log-item', 'usda:chicken').click();
    typeInto(byAttr(el2, 'id', 'grams-0'), 'abc');
    expect(byAttr(el2, 'id', 'grams-0-err').textContent).toBe('Enter the grams.');
  });

  it('search states, Cancel, Delete', () => {
    const { ed, el, calls } = open({ id: 'r1', name: 'A', servings: 1, ingredients: [] }, true);
    ed.setSearch({ status: 'offline' });
    expect(byAttr(el, 'data-search-state', 'offline').textContent).toContain('offline');
    ed.setSearch({ status: 'loading', query: 'x' });
    expect(all(el, 'data-search-state', 'loading')).toHaveLength(1);
    byAttr(el, 'data-close').click();
    expect(calls.cancel).toBe(1);
    byAttr(el, 'data-recipe-delete').click();
    expect(calls.del).toBe(1);
    expect(all(open().el, 'data-recipe-delete')).toHaveLength(0);
  });
});

describe('myFoodEditor', () => {
  const NEW: MyFoodDraft = { name: '', basis: { per100g: true }, kcal: 0, proteinG: 0 };

  function open(draft: MyFoodDraft = NEW, mode: 'quick' | 'full' = 'quick', labelPrompt = false) {
    const calls = { save: [] as MyFoodDraft[], cancel: 0 };
    const el = asFake(
      myFoodEditor(
        { draft, mode, labelPrompt },
        { onSave: (d) => calls.save.push(d), onCancel: () => calls.cancel++ },
      ),
    );
    return { el, calls };
  }

  it('per 100 g by default; per serving reveals the serving label and optional weight', () => {
    const { el, calls } = open();
    expect(byAttr(el, 'data-basis', 'per100g').getAttribute('aria-pressed')).toBe('true');
    expect(byAttr(el, 'data-serving-fields').hasAttribute('hidden')).toBe(true);
    expect(byAttr(el, 'data-per-label').textContent).toBe('Numbers for 100 g');
    expect(val(byAttr(el, 'id', 'food-kcal'))).toBe('');
    byAttr(el, 'data-basis', 'serving').click();
    expect(byAttr(el, 'data-serving-fields').hasAttribute('hidden')).toBe(false);
    typeInto(byAttr(el, 'id', 'food-name'), 'Soy milk');
    typeInto(byAttr(el, 'id', 'food-serving-label'), '1 bottle');
    typeInto(byAttr(el, 'id', 'food-serving-g'), '300');
    typeInto(byAttr(el, 'id', 'food-kcal'), '120');
    typeInto(byAttr(el, 'id', 'food-protein'), '9.5');
    byAttr(el, 'data-food-save').click();
    expect(calls.save).toEqual([
      {
        id: undefined,
        name: 'Soy milk',
        nameTh: undefined,
        basis: { servingLabel: '1 bottle', servingG: 300 },
        kcal: 120,
        proteinG: 9.5,
      },
    ]);
    expectCleanCopy(el);
  });

  it('validates name, serving label and numbers next to each field', () => {
    const { el, calls } = open();
    byAttr(el, 'data-basis', 'serving').click();
    byAttr(el, 'data-food-save').click();
    expect(calls.save).toHaveLength(0);
    expect(byAttr(el, 'id', 'food-name-err').textContent).toBe('Give the food a name.');
    expect(byAttr(el, 'id', 'food-serving-label-err').textContent).toBe('Say what one serving is.');
    expect(byAttr(el, 'id', 'food-kcal-err').textContent).toContain('calories');
    expect(byAttr(el, 'id', 'food-protein-err').textContent).toContain('protein');
  });

  it('Full mode edits carbs/fat; Quick keeps stored carbs/fat (no data lost)', () => {
    const stored: MyFoodDraft = {
      id: 'f1',
      name: 'Granola',
      basis: { per100g: true },
      kcal: 450,
      proteinG: 10,
      carbsG: 60,
      fatG: 18,
    };
    const full = open(stored, 'full');
    expect(val(byAttr(full.el, 'id', 'food-carbs'))).toBe('60');
    typeInto(byAttr(full.el, 'id', 'food-fat'), '20');
    byAttr(full.el, 'data-food-save').click();
    expect(full.calls.save[0]).toMatchObject({ carbsG: 60, fatG: 20 });

    const quick = open(stored, 'quick');
    expect(all(quick.el, 'id', 'food-carbs')).toHaveLength(0);
    expect(quick.el.textContent).toContain('Edit food');
    typeInto(byAttr(quick.el, 'id', 'food-kcal'), '460');
    byAttr(quick.el, 'data-food-save').click();
    expect(quick.calls.save[0]).toMatchObject({ id: 'f1', kcal: 460, carbsG: 60, fatG: 18 });
  });

  it('Protein shake label prompt: placeholder numbers start empty, with the label line', () => {
    const shake: MyFoodDraft = {
      id: 'seed:protein-shake',
      name: 'Protein shake',
      basis: { servingLabel: '1 scoop', servingG: 30 },
      kcal: 1,
      proteinG: 1,
      carbsG: 1,
    };
    const { el, calls } = open(shake, 'quick', true);
    expect(byAttr(el, 'data-label-prompt').textContent).toContain('label');
    expect(val(byAttr(el, 'id', 'food-kcal'))).toBe('');
    expect(val(byAttr(el, 'id', 'food-serving-label'))).toBe('1 scoop');
    typeInto(byAttr(el, 'id', 'food-kcal'), '130');
    typeInto(byAttr(el, 'id', 'food-protein'), '24');
    byAttr(el, 'data-food-save').click();
    expect(calls.save[0]).toEqual({
      id: 'seed:protein-shake',
      name: 'Protein shake',
      nameTh: undefined,
      basis: { servingLabel: '1 scoop', servingG: 30 },
      kcal: 130,
      proteinG: 24,
    });
    key(el, 'Escape');
    expect(calls.cancel).toBe(1);
  });
});
