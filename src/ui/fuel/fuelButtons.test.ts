// M13d task 40e (SPEC M13d Goal 7): the Fuel buttons on the round iconButton. The wrappers
// (fuelButtons.ts) and what each Fuel screen / sheet now renders: round, a visible word, the
// old names kept (an aria-label only where the word is shortened), the old e2e hooks kept.
// Made-up data only.
import { describe, expect, it } from 'vitest';
import type { FoodAmount, FoodEntry, MacroSet } from '../../core/types';
import { asFake, useFakeDom, type FakeEl } from '../screens/testDom';
import { entrySheet } from './entrySheet';
import {
  LONG_WORD,
  actionRow,
  fuelBack,
  fuelMain,
  labelOf,
  saveRow,
  secondPill,
} from './fuelButtons';
import { all, byAttr } from './fuelTestKit';
import { nudgeBanner } from './links';
import { myFoodEditor } from './myFoodEditor';
import { photoButtons } from './photoCapture';
import { postWorkoutIdea, proteinNudge } from './proteinNudge';
import { recipeEditor } from './recipeEditor';

useFakeDom();

const noop = () => undefined;
const word = (b: FakeEl) => b.oneByClass('icon-btn-label').textContent;
const isRound = (b: FakeEl) =>
  b.tag === 'button' &&
  b.hasAttribute('data-icon-btn') &&
  b.oneByClass('icon-btn-circle').getAttribute('aria-hidden') === 'true';

describe('fuelButtons wrappers', () => {
  it('fuelMain: the main pill (orange circle, word beside, whole row); long words get the smaller size', () => {
    let hits = 0;
    const b = asFake(
      fuelMain({ icon: 'check', label: 'Log', hooks: { 'data-x': true }, onClick: () => hits++ }),
    );
    expect(isRound(b)).toBe(true);
    expect(b.getAttribute('data-variant')).toBe('main');
    expect(b.getAttribute('data-label-at')).toBe('beside');
    expect(b.hasAttribute('data-wide-hit')).toBe(true);
    expect(b.classes).toContain('main-pill');
    expect(b.classes).not.toContain('fuel-pill-long');
    expect(b.hasAttribute('data-x')).toBe(true);
    expect(word(b)).toBe('Log');
    b.click();
    expect(hits).toBe(1);
    const long = 'x'.repeat(LONG_WORD + 1);
    expect(asFake(fuelMain({ icon: 'plus', label: long, onClick: noop })).classes).toContain(
      'fuel-pill-long',
    );
  });

  it('secondPill: a secondary (or danger) circle with the word beside, the whole row', () => {
    const b = asFake(secondPill({ icon: 'camera', label: 'Scan a barcode', onClick: noop }));
    expect(b.getAttribute('data-variant')).toBe('secondary');
    expect(b.hasAttribute('data-wide-hit')).toBe(true);
    expect(b.classes).toContain('fuel-pill');
    const d = asFake(
      secondPill({ icon: 'trash', label: 'Remove', variant: 'danger', onClick: noop }),
    );
    expect(d.getAttribute('data-variant')).toBe('danger');
  });

  it('fuelBack: round chevron + "Back"; the edge-swipe hook only when asked', () => {
    let back = 0;
    const b = asFake(fuelBack(() => back++, { swipe: true, hooks: { 'data-y': true } }));
    expect(isRound(b)).toBe(true);
    expect(b.textContent).toBe('Back');
    expect(b.classes).toContain('fuel-back');
    expect(b.hasAttribute('data-swipe-back')).toBe(true);
    expect(b.hasAttribute('data-y')).toBe(true);
    expect(asFake(fuelBack(noop)).hasAttribute('data-swipe-back')).toBe(false);
    b.click();
    expect(back).toBe(1);
  });

  it('saveRow puts Delete first, then the pill; actionRow keeps the order given', () => {
    const main = fuelMain({ icon: 'check', label: 'Save', onClick: noop });
    const del = secondPill({ icon: 'trash', label: 'Delete', onClick: noop });
    const row = asFake(saveRow(main, del));
    expect(row.classes).toEqual(['fuel-save-row']);
    expect(row.children.map(word)).toEqual(['Delete', 'Save']);
    expect(asFake(saveRow(main)).children).toHaveLength(1);
    const acts = asFake(actionRow('extra', del, null, main));
    expect(acts.classes).toEqual(['fuel-acts', 'extra']);
    expect(acts.children.map(word)).toEqual(['Delete', 'Save']);
    expect(labelOf(main)?.textContent).toBe('Save');
  });
});

describe('Fuel sheets and cards use the round buttons (names kept)', () => {
  const ENTRY: FoodEntry = {
    id: 'e1',
    date: '2026-11-14',
    time: 0,
    slot: 'lunch',
    label: 'Khao man gai',
    amount: { servings: 1 },
    estimate: false,
    kcal: 600,
    proteinG: 30,
  };
  const preview = (a: FoodAmount): MacroSet => ({
    kcal: 600 * ('servings' in a ? a.servings : 1),
    proteinG: 30,
  });

  it('entry sheet: Delete is the danger circle ("Delete", name "Delete entry") before the Save pill', () => {
    let del = 0;
    const el = asFake(
      entrySheet(
        { entry: ENTRY, mode: 'quick', preview },
        { onSave: noop, onDelete: () => del++, onClose: noop },
      ),
    );
    const remove = byAttr(el, 'data-entry-remove');
    expect(isRound(remove)).toBe(true);
    expect(remove.getAttribute('data-variant')).toBe('danger');
    expect(word(remove)).toBe('Delete');
    expect(remove.getAttribute('aria-label')).toBe('Delete entry');
    const save = byAttr(el, 'data-entry-save');
    expect(save.getAttribute('data-variant')).toBe('main');
    expect(word(save)).toBe('Save');
    const row = el.oneByClass('fuel-save-row');
    expect(row.children).toEqual([remove, save]);
    remove.click();
    expect(del).toBe(1);
  });

  it('recipe and food editors: Delete is the danger circle with the old name', () => {
    const rx = asFake(
      recipeEditor(
        {
          draft: { id: 'r1', name: 'Bowl', servings: 1, ingredients: [] },
          mode: 'quick',
          perServing: () => ({ kcal: 0, proteinG: 0 }),
        },
        { onSave: noop, onDelete: noop, onCancel: noop, onSearch: noop },
      ),
    );
    expect(byAttr(rx, 'data-recipe-delete').getAttribute('aria-label')).toBe('Delete recipe');
    expect(byAttr(rx, 'data-recipe-save').getAttribute('data-variant')).toBe('main');
    const food = asFake(
      myFoodEditor(
        {
          draft: { id: 'f1', name: 'Oat drink', basis: { per100g: true }, kcal: 50, proteinG: 1 },
          mode: 'quick',
        },
        { onSave: noop, onDelete: noop, onCancel: noop },
      ),
    );
    expect(byAttr(food, 'data-food-delete').getAttribute('aria-label')).toBe('Delete food');
    expect(byAttr(food, 'data-food-delete').getAttribute('data-variant')).toBe('danger');
    expect(word(byAttr(food, 'data-food-save'))).toBe('Save food');
  });

  it('photo pickers, nudge banner, protein nudge and the Summary meal idea are round', () => {
    const pick = asFake(photoButtons({ onFile: noop }));
    expect([byAttr(pick, 'data-photo-open'), byAttr(pick, 'data-photo-library')].map(word)).toEqual(
      ['Take photo', 'Choose from library'],
    );
    const banner = asFake(nudgeBanner('40 g protein to go today', noop, noop));
    for (const b of all(banner, 'data-nudge-open').concat(all(banner, 'data-nudge-dismiss'))) {
      expect(isRound(b)).toBe(true);
    }
    expect(byAttr(banner, 'data-nudge-dismiss').getAttribute('aria-label')).toBeNull();
    const pn = asFake(proteinNudge({ mealKey: 'k', text: 'More protein?' }, { onDismiss: noop }));
    expect(isRound(byAttr(pn, 'data-protein-nudge-dismiss'))).toBe(true);
    const idea = asFake(
      postWorkoutIdea(
        {
          suggestion: {
            label: 'Greek yogurt',
            ref: { foodId: 'yogurt' },
            amount: { servings: 1 },
            macros: { kcal: 150, proteinG: 15 },
            why: 'Fits your protein left',
          },
        },
        noop,
      ),
    );
    const log = byAttr(idea, 'data-meal-idea-log');
    expect(isRound(log)).toBe(true);
    expect(word(log)).toBe('Log');
    expect(log.getAttribute('aria-label')).toBe('Log Greek yogurt');
    expect(log.classes).toContain('meal-idea-log');
  });
});
