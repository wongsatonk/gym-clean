import { describe, expect, it } from 'vitest';
import { scaleFood } from '../../core/nutrition/portions';
import type { FoodEntry } from '../../core/types';
import { fuelScreen } from '../screens/fuel';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { all, byAttr, expectCleanCopy, key, typeInto } from './fuelTestKit';
import {
  LOG_SECTIONS,
  logSheet,
  scaleItem,
  type LogChoice,
  type LogItem,
  type LogSheetProps,
  type QuickLog,
} from './logSheet';

useFakeDom();

// Made-up numbers only.
const SHAKE: LogItem = {
  key: 'fav:shake',
  label: 'Protein shake',
  macros: { kcal: 200, proteinG: 30, carbsG: 8, fatG: 4 },
  per: 'serving',
  badge: 'favorite',
  ref: { foodId: 'seed:protein-shake' },
};
const KRA_PAO: LogItem = {
  key: 'thai:kra-pao',
  label: 'Pad kra pao with rice + fried egg',
  nameTh: 'ผัดกะเพรา ข้าว ไข่ดาว',
  macros: { kcal: 600, proteinG: 25, carbsG: 70, fatG: 24 },
  per: 'serving',
  estimate: true,
  portions: [
    { label: 'Small', factor: 0.75 },
    { label: 'Regular', factor: 1 },
    { label: 'Large', factor: 1.4 },
  ],
  ref: { foodId: 'thai:kra-pao' },
};
const CURRY: LogItem = {
  key: 'recipe:curry',
  label: 'Green curry, home',
  macros: { kcal: 450, proteinG: 32 },
  per: 'serving',
  editable: true,
  ref: { recipeId: 'r1' },
};
const RICE: LogItem = {
  key: 'usda:1',
  label: 'Rice, white, cooked',
  macros: { kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 },
  per: '100g',
  measures: [{ label: '1 cup', g: 158 }],
  ref: { foodId: 'usda:1' },
};

function props(over: Partial<LogSheetProps> = {}): LogSheetProps {
  return {
    mode: 'quick',
    slot: 'lunch',
    favorites: [SHAKE],
    recipes: [CURRY],
    thai: [KRA_PAO],
    myFoods: [],
    presets: [
      { label: 'Light', kcal: 400, proteinG: 15 },
      { label: 'Regular', kcal: 600, proteinG: 25, carbsG: 70, fatG: 22 },
      { label: 'Big', kcal: 850, proteinG: 35 },
    ],
    ...over,
  };
}

function open(over: Partial<LogSheetProps> = {}) {
  const calls = {
    log: [] as LogChoice[],
    quick: [] as QuickLog[],
    search: [] as string[],
    edit: [] as string[],
    newRecipe: 0,
    newFood: 0,
    close: 0,
  };
  const sheet = logSheet(props(over), {
    onLog: (c) => calls.log.push(c),
    onQuickLog: (q) => calls.quick.push(q),
    onSearch: (q) => calls.search.push(q),
    onNewRecipe: () => calls.newRecipe++,
    onNewFood: () => calls.newFood++,
    onEditItem: (i) => calls.edit.push(i.key),
    onClose: () => calls.close++,
  });
  return { sheet, el: asFake(sheet), calls };
}

const section = (el: FakeEl, id: string) => byAttr(el, 'data-log-section', id).click();

describe('logSheet', () => {
  it('is a modal dialog with sections in SPEC order', () => {
    const { el } = open();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    expect(all(el, 'data-log-section').map((b) => b.getAttribute('data-log-section'))).toEqual([
      'favorites',
      'recipes',
      'thai',
      'quick',
      'search',
      'myFoods',
    ]);
    expect(LOG_SECTIONS.map((s) => s.title)).toEqual([
      'Favorites & recent',
      'My recipes',
      'Thai dishes',
      'Quick estimate',
      'Search foods',
      'My foods',
    ]);
    expect(byAttr(el, 'data-log-section', 'favorites').getAttribute('aria-pressed')).toBe('true');
    expectCleanCopy(el);
  });

  it('a favorite logs in 3 taps: open (Fuel tab), item, Log', () => {
    let taps = 0;
    let sheet: ReturnType<typeof open> | null = null;
    const fuel = asFake(
      fuelScreen(
        {
          now: 0,
          mode: 'quick',
          targets: null,
          totals: { kcal: 0, proteinG: 0 },
          entries: [] as FoodEntry[],
          unit: 'kg',
        },
        {
          onLog: () => {
            sheet = open();
          },
          onEditEntry: () => undefined,
          onDeleteEntry: () => undefined,
          onWeighIn: () => undefined,
          onSetup: () => undefined,
          onTab: () => undefined,
        },
      ),
    );
    const tap = (e: FakeEl) => {
      taps++;
      e.click();
    };
    tap(byAttr(fuel, 'data-log-open'));
    const s = sheet as unknown as ReturnType<typeof open>;
    tap(byAttr(s.el, 'data-log-item', 'fav:shake'));
    tap(byAttr(s.el, 'data-log-confirm'));
    expect(taps).toBe(3);
    expect(s.calls.log).toHaveLength(1);
    expect(s.calls.log[0]).toMatchObject({
      amount: { servings: 1 },
      slot: 'lunch',
      macros: { kcal: 200, proteinG: 30 },
    });
  });

  it('Thai dish: S/R/L chips (Regular first), Large scales by 1.4, Thai name shown', () => {
    const { el, calls } = open();
    section(el, 'thai');
    const row = byAttr(el, 'data-log-item', 'thai:kra-pao');
    expect(row.textContent).toContain('ผัดกะเพรา');
    expect(row.byClass('fuel-tag')[0]?.textContent).toBe('estimate');
    row.click();
    expect(byAttr(el, 'data-portion', 'Regular').getAttribute('aria-pressed')).toBe('true');
    byAttr(el, 'data-portion', 'Large').click();
    expect(byAttr(el, 'data-portion', 'Large').getAttribute('aria-pressed')).toBe('true');
    expect(byAttr(el, 'data-preview').textContent).toBe('840 kcal · 35 g protein');
    byAttr(el, 'data-slot-chip', 'dinner').click();
    byAttr(el, 'data-log-confirm').click();
    expect(calls.log[0]).toMatchObject({
      portion: { label: 'Large', factor: 1.4 },
      amount: { servings: 1 },
      slot: 'dinner',
      macros: { kcal: 840, proteinG: 35 },
    });
  });

  it('portion stepper moves by 0.5 and never below 0.5', () => {
    const { el, calls } = open();
    byAttr(el, 'data-log-item', 'fav:shake').click();
    const down = byAttr(el, 'data-step', 'down');
    const up = byAttr(el, 'data-step', 'up');
    expect(down.getAttribute('aria-label')).toBe('Less portion');
    down.click();
    expect(byAttr(el, 'data-stepper', 'portion').textContent).toContain('0.5serving');
    expect(down.hasAttribute('disabled')).toBe(true);
    up.click();
    up.click();
    up.click();
    expect(byAttr(el, 'data-preview').textContent).toBe('400 kcal · 60 g protein');
    byAttr(el, 'data-log-confirm').click();
    expect(calls.log[0]?.amount).toEqual({ servings: 2 });
  });

  it('gram foods step by 10 g and offer household measures', () => {
    const { el, calls, sheet } = open();
    section(el, 'search');
    sheet.setSearch({ status: 'results', query: 'rice', items: [RICE] });
    byAttr(el, 'data-log-item', 'usda:1').click();
    // Starts at the first measure.
    expect(byAttr(el, 'data-stepper', 'portion').textContent).toContain('158g');
    byAttr(el, 'data-step', 'up').click();
    byAttr(el, 'data-log-confirm').click();
    expect(calls.log[0]?.amount).toEqual({ grams: 168 });
    expect(calls.log[0]?.macros.kcal).toBe(Math.round(130 * 1.68));
  });

  it('Full mode shows carbs and fat in previews and quick-estimate fields', () => {
    const { el } = open({ mode: 'full' });
    byAttr(el, 'data-log-item', 'fav:shake').click();
    expect(byAttr(el, 'data-preview').textContent).toBe(
      '200 kcal · 30 g protein · 8 g carbs · 4 g fat',
    );
    key(el, 'Escape');
    section(el, 'quick');
    expect(all(el, 'id', 'quick-carbs')).toHaveLength(1);
    expect(all(el, 'id', 'quick-fat')).toHaveLength(1);
    expect(all(open().el, 'id', 'quick-carbs')).toHaveLength(0);
  });

  it('Protein shake with placeholder values asks for the label numbers instead of logging', () => {
    const { el, calls } = open({ favorites: [{ ...SHAKE, needsLabel: true }] });
    byAttr(el, 'data-log-item', 'fav:shake').click();
    expect(all(el, 'data-log-confirm')).toHaveLength(0);
    expect(byAttr(el, 'data-needs-label').textContent).toContain('label');
    byAttr(el, 'data-edit-item').click();
    expect(calls.edit).toEqual(['fav:shake']);
  });

  it('recipes and my foods: New buttons and Edit from the detail', () => {
    const { el, calls } = open();
    section(el, 'recipes');
    byAttr(el, 'data-new-recipe').click();
    expect(calls.newRecipe).toBe(1);
    byAttr(el, 'data-log-item', 'recipe:curry').click();
    expect(byAttr(el, 'data-edit-item').textContent).toBe('Edit recipe');
    byAttr(el, 'data-edit-item').click();
    expect(calls.edit).toEqual(['recipe:curry']);
    byAttr(el, 'data-log-back').click();
    section(el, 'myFoods');
    expect(byAttr(el, 'data-section-panel', 'myFoods').textContent).toContain(
      'No foods of your own yet.',
    );
    byAttr(el, 'data-new-food').click();
    expect(calls.newFood).toBe(1);
  });

  it('quick estimate: presets fill kcal + protein, errors stay next to the field, save as favorite', () => {
    const { el, calls } = open();
    section(el, 'quick');
    // Nothing typed: errors, no log.
    byAttr(el, 'data-quick-log').click();
    expect(calls.quick).toHaveLength(0);
    expect(byAttr(el, 'id', 'quick-kcal-err').textContent).toContain('Enter the calories');
    expect(byAttr(el, 'id', 'quick-kcal').getAttribute('aria-describedby')).toBe('quick-kcal-err');
    byAttr(el, 'data-quick-preset', 'Big').click();
    const kcal = byAttr(el, 'id', 'quick-kcal') as unknown as { value: string };
    expect(kcal.value).toBe('850');
    typeInto(byAttr(el, 'id', 'quick-kcal'), '780');
    typeInto(byAttr(el, 'id', 'quick-name'), 'Thai place near work: pad see ew');
    const fav = byAttr(el, 'data-quick-favorite');
    fav.click();
    expect(fav.getAttribute('aria-checked')).toBe('true');
    byAttr(el, 'data-slot-chip', 'dinner').click();
    byAttr(el, 'data-quick-log').click();
    expect(calls.quick).toEqual([
      {
        name: 'Thai place near work: pad see ew',
        macros: { kcal: 780, proteinG: 35 },
        slot: 'dinner',
        saveFavorite: true,
      },
    ]);
    expectCleanCopy(el);
  });

  it('search: typing calls onSearch; loading, offline, empty and results states', () => {
    const { el, sheet, calls } = open({ initialSection: 'search' });
    expect(sheet.section()).toBe('search');
    typeInto(byAttr(el, 'id', 'log-search'), 'rice');
    expect(calls.search).toEqual(['rice']);
    sheet.setSearch({ status: 'loading', query: 'rice' });
    expect(byAttr(el, 'data-search-state', 'loading').textContent).toContain('Loading');
    sheet.setSearch({ status: 'offline' });
    expect(byAttr(el, 'data-search-state', 'offline').textContent).toContain('offline');
    sheet.setSearch({ status: 'results', query: 'zzz', items: [] });
    expect(byAttr(el, 'data-search-state', 'empty').textContent).toBe('No matches for “zzz”.');
    sheet.setSearch({ status: 'results', query: 'rice', items: [RICE] });
    expect(byAttr(el, 'data-log-item', 'usda:1').textContent).toContain('per 100 g');
    expectCleanCopy(el);
  });

  it('Escape goes back from a detail, then closes; Close button closes', () => {
    const { el, calls } = open();
    byAttr(el, 'data-log-item', 'fav:shake').click();
    expect(byAttr(el, 'class', 'log-secs').hasAttribute('hidden')).toBe(true);
    key(el, 'Escape');
    expect(all(el, 'data-log-detail')).toHaveLength(0);
    expect(byAttr(el, 'class', 'log-secs').hasAttribute('hidden')).toBe(false);
    expect(calls.close).toBe(0);
    key(el, 'Escape');
    expect(calls.close).toBe(1);
    byAttr(el, 'data-close').click();
    expect(calls.close).toBe(2);
  });

  it('detail moves focus to the item heading', () => {
    const { el } = open();
    byAttr(el, 'data-log-item', 'fav:shake').click();
    const heading = byAttr(el, 'id', 'log-detail-name');
    expect((document as unknown as { activeElement: unknown }).activeElement).toBe(heading);
  });
});

describe('scaleItem (core scaleFood)', () => {
  it('matches core scaleFood exactly and never returns NaN', () => {
    const food = {
      ...KRA_PAO.macros,
      id: KRA_PAO.key,
      name: KRA_PAO.label,
      source: 'custom' as const,
      basis: { servingLabel: 'serving' },
    };
    expect(scaleItem(KRA_PAO, { servings: 1.5 }, 0.75)).toEqual(
      scaleFood(food, { servings: 1.5 }, 0.75),
    );
    // Grams on a serving-only item: core can't convert → 0, not NaN.
    expect(scaleItem(KRA_PAO, { grams: 120 })).toEqual({ kcal: 0, proteinG: 0 });
  });

  it('scales servings × factor and grams per 100 g, keeping unknown macros unknown', () => {
    expect(scaleItem(KRA_PAO, { servings: 0.5 }, 1.4)).toEqual({
      kcal: 420,
      proteinG: 17.5,
      carbsG: 49,
      fatG: 16.8,
    });
    expect(scaleItem(CURRY, { servings: 2 })).toEqual({ kcal: 900, proteinG: 64 });
    expect(scaleItem(RICE, { grams: 50 })).toEqual({
      kcal: 65,
      proteinG: 1.4,
      carbsG: 14,
      fatG: 0.2,
    });
  });
});
