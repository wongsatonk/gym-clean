import { describe, expect, it } from 'vitest';
import type { FoodEntry, NutritionTargets } from '../../core/types';
import { all, byAttr, expectCleanCopy } from '../fuel/fuelTestKit';
import type { TabId } from '../tabBar';
import { fuelScreen, groupBySlot, type FuelProps } from './fuel';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

// Made-up numbers only.
const NOW = new Date(2026, 10, 14, 13, 0).getTime();
const at = (hh: number, mm = 0) => new Date(2026, 10, 14, hh, mm).getTime();
const TARGETS: NutritionTargets = {
  kcal: { value: 2800, estimate: true },
  proteinG: { value: 140, estimate: true },
  carbsG: { value: 350, estimate: true },
  fatG: { value: 80, estimate: false },
};
const ENTRIES: FoodEntry[] = [
  {
    id: 'e2',
    date: '2026-11-14',
    time: at(12, 30),
    slot: 'lunch',
    label: 'Pad kra pao with rice + fried egg',
    amount: { servings: 1.4 },
    estimate: true,
    kcal: 900,
    proteinG: 38,
    carbsG: 95,
    fatG: 36,
  },
  {
    id: 'e1',
    date: '2026-11-14',
    time: at(7, 45),
    slot: 'breakfast',
    label: 'Protein shake',
    amount: { servings: 1 },
    estimate: false,
    kcal: 200,
    proteinG: 30,
  },
  {
    id: 'e3',
    date: '2026-11-14',
    time: at(8, 10),
    slot: 'breakfast',
    label: 'Banana',
    amount: { grams: 120 },
    estimate: false,
    kcal: 107,
    proteinG: 1.3,
  },
];

function props(over: Partial<FuelProps> = {}): FuelProps {
  return {
    now: NOW,
    mode: 'quick',
    targets: TARGETS,
    totals: { kcal: 1207, proteinG: 69.3, carbsG: 95, fatG: 36 },
    entries: ENTRIES,
    unit: 'kg',
    lastWeighInKg: 70.2,
    ...over,
  };
}

function render(over: Partial<FuelProps> = {}) {
  const calls = {
    log: 0,
    edit: [] as string[],
    del: [] as string[],
    weigh: 0,
    setup: 0,
    dismiss: 0,
    tab: [] as TabId[],
  };
  const el = asFake(
    fuelScreen(props(over), {
      onLog: () => calls.log++,
      onEditEntry: (e) => calls.edit.push(e.id),
      onDeleteEntry: (e) => calls.del.push(e.id),
      onWeighIn: () => calls.weigh++,
      onSetup: () => calls.setup++,
      onDismissNudge: () => calls.dismiss++,
      onTab: (t) => calls.tab.push(t),
    }),
  );
  return { el, calls };
}

const left = (el: FakeEl, key: string) => byAttr(el, 'data-left', key).textContent;

describe('fuelScreen', () => {
  it('Quick: kcal + protein rings with the big "to go" numbers and estimate tags', () => {
    const { el } = render();
    expect(el.tag).toBe('main');
    expect(el.classes).toEqual(
      expect.arrayContaining(['screen', 'fuel', 'has-tabbar', 'mood-pro']),
    );
    expect(all(el, 'data-ring').map((r) => r.getAttribute('data-ring'))).toEqual([
      'kcal',
      'proteinG',
    ]);
    expect(left(el, 'kcal')).toBe('1,593');
    expect(left(el, 'proteinG')).toBe('71');
    expect(byAttr(el, 'data-ring', 'kcal').textContent).toContain('kcal to go');
    expect(byAttr(el, 'data-ring', 'kcal').byClass('fuel-tag')[0]?.textContent).toBe('estimate');
    // The left number is the main number class (≥ 64px in fuel.css).
    expect(byAttr(el, 'data-left', 'kcal').classes).toContain('fuel-left-num');
    expectCleanCopy(el);
  });

  it('Full: adds carbs + fat rings; entries show carbs/fat when known', () => {
    const { el } = render({ mode: 'full' });
    expect(all(el, 'data-ring')).toHaveLength(4);
    expect(left(el, 'carbsG')).toBe('255');
    expect(left(el, 'fatG')).toBe('44');
    // Fat target is a hand override: no estimate tag on that row.
    expect(byAttr(el, 'data-ring', 'fatG').byClass('fuel-tag')).toHaveLength(0);
    expect(byAttr(el, 'data-entry', 'e2').textContent).toContain('95 g carbs · 36 g fat');
    // Quick hides them, the data is untouched.
    const quick = render().el;
    expect(byAttr(quick, 'data-entry', 'e2').textContent).not.toContain('carbs');
  });

  it('over target: "+N … over target"', () => {
    const { el } = render({ totals: { kcal: 2950, proteinG: 150 } });
    expect(left(el, 'kcal')).toBe('+150');
    expect(left(el, 'proteinG')).toBe('+10');
    expect(byAttr(el, 'data-ring', 'proteinG').textContent).toContain('g protein over target');
    expect(byAttr(el, 'data-ring', 'kcal').getAttribute('data-over')).toBe('true');
  });

  it('empty: no targets → "Set up your targets" card instead of rings; no entries line', () => {
    const { el, calls } = render({ targets: null, entries: [], totals: { kcal: 0, proteinG: 0 } });
    expect(all(el, 'data-ring')).toHaveLength(0);
    expect(byAttr(el, 'data-setup-card').textContent).toContain('Set up your targets');
    byAttr(el, 'data-setup').click();
    expect(calls.setup).toBe(1);
    expect(byAttr(el, 'data-entries', 'none').textContent).toContain('Nothing logged yet today.');
    // Logging still works before setup.
    byAttr(el, 'data-log-open').click();
    expect(calls.log).toBe(1);
    expectCleanCopy(el);
  });

  it('groups entries by slot (groups and rows in time order), with slot totals', () => {
    const { el } = render();
    const slots = all(el, 'data-slot');
    expect(slots.map((s) => s.getAttribute('data-slot'))).toEqual(['breakfast', 'lunch']);
    expect(all(slots[0] as FakeEl, 'data-entry').map((e) => e.getAttribute('data-entry'))).toEqual([
      'e1',
      'e3',
    ]);
    expect(slots[0]?.oneByClass('fuel-slot-sum').textContent).toBe('307 kcal · 31 g');
    const banana = byAttr(el, 'data-entry', 'e3');
    expect(banana.textContent).toContain('120 g');
    const kraPao = byAttr(el, 'data-entry', 'e2');
    expect(kraPao.textContent).toContain('1.4 servings');
    expect(kraPao.byClass('fuel-tag')[0]?.textContent).toBe('estimate');
  });

  it('a row opens the editor; Delete calls onDeleteEntry (Undo is the toast) and is named', () => {
    const { el, calls } = render();
    byAttr(el, 'data-entry-edit', 'e2').click();
    expect(calls.edit).toEqual(['e2']);
    const del = byAttr(el, 'data-entry-delete', 'e3');
    expect(del.getAttribute('aria-label')).toBe('Delete Banana');
    del.click();
    expect(calls.del).toEqual(['e3']);
  });

  it('weigh-in button shows the last weigh-in in the unit', () => {
    const { el, calls } = render({ unit: 'lb', lastWeighInKg: 70 });
    const btn = byAttr(el, 'data-weigh-in');
    expect(btn.textContent).toContain('Weigh-in');
    expect(btn.textContent).toMatch(/154(\.\d)? lb/);
    btn.click();
    expect(calls.weigh).toBe(1);
    expect(byAttr(render({ lastWeighInKg: null }).el, 'data-weigh-in').textContent).toBe(
      'Weigh-in',
    );
  });

  it('nudge banner slot: status text + Dismiss', () => {
    expect(all(render().el, 'data-fuel-nudge')).toHaveLength(0);
    const { el, calls } = render({ nudge: '40 g protein to go today' });
    // The one shared banner (links.ts): on the Fuel tab there is no "Log food" link in it.
    const n = byAttr(el, 'data-fuel-nudge');
    expect(all(n, 'data-nudge-open')).toHaveLength(0);
    expect(n.getAttribute('role')).toBe('status');
    expect(n.textContent).toContain('40 g protein to go today');
    byAttr(el, 'data-nudge-dismiss').click();
    expect(calls.dismiss).toBe(1);
  });

  it('the tab bar has the 5 M12 tabs with Fuel current', () => {
    const { el, calls } = render();
    const tabs = el.byClass('tab');
    expect(tabs.map((t) => t.getAttribute('data-tab'))).toEqual([
      'today',
      'fuel',
      'coach',
      'calendar',
      'settings',
    ]);
    expect(tabs[1]?.getAttribute('aria-current')).toBe('page');
    tabs[1]?.click();
    tabs[3]?.click();
    expect(calls.tab).toEqual(['calendar']);
  });
});

describe('groupBySlot', () => {
  it('is empty for no entries', () => {
    expect(groupBySlot([])).toEqual([]);
  });
});
