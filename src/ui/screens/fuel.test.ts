import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    weigh: 0,
    setup: 0,
    dismiss: 0,
    tab: [] as TabId[],
    today: 0,
  };
  const el = asFake(
    fuelScreen(props(over), {
      onLog: () => calls.log++,
      onEditEntry: (e) => calls.edit.push(e.id),
      onWeighIn: () => calls.weigh++,
      onSetup: () => calls.setup++,
      onDismissNudge: () => calls.dismiss++,
      onToday: () => calls.today++,
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

  it('M13: until targets exist, "Set up targets" is the one filled button; Log food is outline', () => {
    const { el } = render({ targets: null, entries: [], totals: { kcal: 0, proteinG: 0 } });
    const filled = el.byClass('primary-btn');
    expect(filled).toHaveLength(1);
    expect(filled[0]?.hasAttribute('data-setup')).toBe(true);
    expect(filled[0]?.textContent).toBe('Set up targets');
    const log = byAttr(el, 'data-log-open');
    expect(log.classes).not.toContain('primary-btn');
    expect(log.textContent).toBe('Log food');
  });

  it('M13: with targets, Log food is the one filled button', () => {
    for (const entries of [[], ENTRIES]) {
      const { el } = render({ entries });
      const filled = el.byClass('primary-btn');
      expect(filled).toHaveLength(1);
      expect(filled[0]?.hasAttribute('data-log-open')).toBe(true);
    }
  });

  it('M13: an empty day is the empty state (plate icon, one line, Log food as its one action)', () => {
    const { el, calls } = render({ entries: [], totals: { kcal: 0, proteinG: 0 } });
    const empty = byAttr(el, 'data-empty-state', 'fuel-day');
    expect(empty.oneByClass('empty-state-art').byTag('svg')[0]?.getAttribute('data-icon')).toBe(
      'plate',
    );
    expect(empty.oneByClass('empty-state-line').textContent).toBe('Nothing logged yet today.');
    const buttons = empty.byTag('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.hasAttribute('data-log-open')).toBe(true);
    // Not a second Log food button elsewhere on the screen.
    expect(all(el, 'data-log-open')).toHaveLength(1);
    buttons[0]?.click();
    expect(calls.log).toBe(1);
    // With entries there is no empty state and Log food sits above the list.
    expect(all(render().el, 'data-empty-state')).toHaveLength(0);
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

  it('M13: a row is one button that opens the sheet (Edit / Delete); no Delete block on the row', () => {
    const { el, calls } = render();
    byAttr(el, 'data-entry-edit', 'e2').click();
    expect(calls.edit).toEqual(['e2']);
    for (const id of ['e1', 'e2', 'e3']) {
      const row = byAttr(el, 'data-entry', id);
      const buttons = row.byTag('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]?.getAttribute('data-entry-edit')).toBe(id);
      expect(row.textContent).not.toContain('Delete');
      expect(row.oneByClass('sr-only').textContent).toBe(', edit or delete');
      expect(row.oneByClass('fuel-entry-go').getAttribute('aria-hidden')).toBe('true');
    }
    expect(el.find((e) => e.hasAttribute('data-entry-delete'))).toEqual([]);
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

describe('M12 1b: Measurements row', () => {
  const noop = () => undefined;
  const base = {
    onLog: noop,
    onEditEntry: noop,
    onWeighIn: noop,
    onSetup: noop,
    onTab: noop,
  };
  const order = (el: FakeEl) =>
    el
      .find(
        (e) =>
          e.attrs.has('data-measurements-open') ||
          e.attrs.has('data-log-open') ||
          e.classes.includes('fuel-entries'),
      )
      .map((e) =>
        e.attrs.has('data-measurements-open')
          ? 'measure'
          : e.attrs.has('data-log-open')
            ? 'log'
            : 'entries',
      );

  it('is not there unless both the data and the callback are passed (old callers unchanged)', () => {
    expect(all(render().el, 'data-measurements-open')).toHaveLength(0);
    expect(
      all(
        render({ measurements: { lastDate: '2026-11-01', due: false } }).el,
        'data-measurements-open',
      ),
    ).toHaveLength(0);
    const el = asFake(fuelScreen(props(), { ...base, onMeasurements: noop }));
    expect(all(el, 'data-measurements-open')).toHaveLength(0);
  });

  it('sits under today’s food and opens the screen', () => {
    let opened = 0;
    const el = asFake(
      fuelScreen(props({ measurements: { lastDate: '2026-11-01', due: false } }), {
        ...base,
        onMeasurements: () => opened++,
      }),
    );
    const row = byAttr(el, 'data-measurements-open');
    expect(row.tag).toBe('button');
    expect(row.textContent).toContain('Measurements');
    expect(row.textContent).toContain('Last 1 Nov');
    expect(order(el)).toEqual(['log', 'entries', 'measure']);
    row.click();
    expect(opened).toBe(1);
    expectCleanCopy(row);
  });

  it('moves up under the header when it is time to measure again', () => {
    const el = asFake(
      fuelScreen(props({ measurements: { lastDate: '2026-10-12', due: true } }), {
        ...base,
        onMeasurements: noop,
      }),
    );
    expect(all(el, 'data-measurements-open')).toHaveLength(1);
    expect(byAttr(el, 'data-measurements-open').textContent).toContain('Measure again');
    expect(order(el)).toEqual(['measure', 'log', 'entries']);
  });

  it('never measured: still offered, with a plain line', () => {
    const el = asFake(
      fuelScreen(props({ measurements: { lastDate: null, due: false } }), {
        ...base,
        onMeasurements: noop,
      }),
    );
    expect(byAttr(el, 'data-measurements-open').textContent).toContain(
      'Tape measure, once a month',
    );
  });
});

describe('Fuel: Search in the header (M13c)', () => {
  const noop = () => undefined;
  const base = { onLog: noop, onEditEntry: noop, onWeighIn: noop, onSetup: noop, onTab: noop };

  it('without onSearch the header is unchanged (no Search, no has-search)', () => {
    const { el } = render();
    const head = el.byClass('fuel-head')[0];
    expect(head?.classes).not.toContain('has-search');
    expect(all(el, 'data-search-open')).toHaveLength(0);
  });

  it('with onSearch: Search in the header next to Weigh-in; a tap passes the button out', () => {
    const got: unknown[] = [];
    const el = asFake(fuelScreen(props(), { ...base, onSearch: (o) => got.push(o) }));
    const head = el.byClass('fuel-head')[0];
    if (!head) throw new Error('no header');
    expect(head.classes).toContain('has-search');
    expect(head.children.map((c) => c.classes[0])).toEqual([
      'fuel-head-txt',
      'search-btn',
      'fuel-weigh-btn',
    ]);
    const btn = byAttr(head, 'data-search-open', '');
    expect(btn.textContent).toBe('Search');
    btn.click();
    expect(got).toEqual([btn]);
  });
});

describe('M13c 12b: a past day (search → Meals · Wed 11 Nov)', () => {
  const DAY = { date: '2026-11-11', label: 'Wed 11 Nov' };
  const old = ENTRIES.map((e) => ({ ...e, date: DAY.date }));

  it('the header, the rows and the heading are that day; Back to today replaces Log food', () => {
    const { el, calls } = render({
      day: DAY,
      entries: old,
      nudge: '40 g protein to go today',
      proteinNudge: { mealKey: 'k', text: 'More protein?' },
    });
    expect(byAttr(el, 'data-fuel-day', DAY.date).textContent).toBe('Wed 11 Nov');
    expect(el.oneByClass('fuel-entries').getAttribute('aria-label')).toBe('Food on Wed 11 Nov');
    expect(all(el, 'data-entry')).toHaveLength(3);
    expect(all(el, 'data-log-open')).toHaveLength(0);
    expect(all(el, 'data-fuel-nudge')).toHaveLength(0);
    expect(all(el, 'data-protein-nudge')).toHaveLength(0);
    const back = byAttr(el, 'data-fuel-today');
    expect(back.tag).toBe('button');
    expect(back.textContent).toBe('Back to today');
    back.click();
    expect(calls.today).toBe(1);
    // Rows still open the entry sheet.
    byAttr(el, 'data-entry-edit', 'e1').click();
    expect(calls.edit).toEqual(['e1']);
    expectCleanCopy(el);
  });

  it('an empty past day names the day and offers Back to today, not Log food', () => {
    const { el, calls } = render({ day: DAY, entries: [], totals: { kcal: 0, proteinG: 0 } });
    const empty = byAttr(el, 'data-empty-state', 'fuel-day');
    expect(empty.oneByClass('empty-state-line').textContent).toBe('Nothing logged on Wed 11 Nov.');
    expect(el.byTag('h2').map((x) => x.textContent)).toContain('Wed 11 Nov');
    expect(all(el, 'data-log-open')).toHaveLength(0);
    byAttr(empty, 'data-fuel-today').click();
    expect(calls.today).toBe(1);
  });

  it('day: null is today (unchanged screen)', () => {
    const { el } = render({ day: null });
    expect(all(el, 'data-fuel-day')).toHaveLength(0);
    expect(all(el, 'data-log-open')).toHaveLength(1);
    expect(all(el, 'data-fuel-today')).toHaveLength(0);
  });
});

describe('M13d task 26: swipe left on a meal row shows Delete', () => {
  type Doc = { addEventListener?: unknown; removeEventListener?: unknown };
  let downs: ((e: unknown) => void)[] = [];
  let reduce = false;
  const g = globalThis as { matchMedia?: unknown };
  beforeEach(() => {
    downs = [];
    reduce = false;
    const doc = (globalThis as unknown as { document: Doc }).document;
    doc.addEventListener = (type: string, cb: (e: unknown) => void) => {
      if (type === 'pointerdown') downs.push(cb);
    };
    doc.removeEventListener = (type: string, cb: (e: unknown) => void) => {
      if (type === 'pointerdown') downs = downs.filter((d) => d !== cb);
    };
    g.matchMedia = () => ({ matches: reduce });
  });
  afterEach(() => {
    delete g.matchMedia;
    vi.useRealTimers();
  });

  function swipeRender() {
    const deleted: string[] = [];
    const edited: string[] = [];
    const el = asFake(
      fuelScreen(props(), {
        onLog: () => undefined,
        onEditEntry: (e) => edited.push(e.id),
        onDeleteEntry: (e) => deleted.push(e.id),
        onWeighIn: () => undefined,
        onSetup: () => undefined,
        onTab: () => undefined,
      }),
    );
    return { el, deleted, edited };
  }

  /** A one-finger drag on the row: start, `steps` moves to `dx`/`dy`, then (optionally) lift. */
  function drag(row: FakeEl, dx: number, dy = 0, opts: { lift?: boolean; holdMs?: number } = {}) {
    const x0 = 300;
    const y0 = 400;
    const target = { closest: () => null };
    let t = 1000;
    let prevented = 0;
    const touch = (x: number, y: number) => [{ clientX: x, clientY: y }];
    row.dispatch('touchstart', { touches: touch(x0, y0), timeStamp: t, target });
    for (let i = 1; i <= 8; i++) {
      t += 16;
      const x = x0 + (dx * i) / 8;
      const y = y0 + (dy * i) / 8;
      row.dispatch('touchmove', {
        touches: touch(x, y),
        timeStamp: t,
        target,
        cancelable: true,
        preventDefault: () => prevented++,
      });
    }
    if (opts.lift !== false) {
      t += opts.holdMs ?? 160;
      row.dispatch('touchend', {
        touches: [],
        changedTouches: touch(x0 + dx, y0 + dy),
        timeStamp: t,
        target,
      });
    }
    return { prevented };
  }

  const main = (row: FakeEl) => byAttr(row, 'data-entry-edit');
  const del = (row: FakeEl) => byAttr(row, 'data-entry-delete');
  const panel = (row: FakeEl) => byAttr(row, 'data-entry-swipe');
  /** A tap on the row's own button (the row's click listeners run first, as in capture). */
  function tapRow(row: FakeEl) {
    let stopped = false;
    row.dispatch('click', {
      target: { closest: () => null },
      preventDefault: () => undefined,
      stopPropagation: () => (stopped = true),
    });
    if (!stopped) main(row).click();
  }

  it('without onDeleteEntry the rows are not swipeable (old callers unchanged)', () => {
    const { el } = render();
    expect(all(el, 'data-swipe-row')).toHaveLength(0);
  });

  it('an untouched row is still one button; a tap opens the sheet', () => {
    const { el, edited } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    expect(row.hasAttribute('data-swipe-row')).toBe(true);
    expect(row.byTag('button')).toHaveLength(1);
    expect(row.textContent).not.toContain('Delete');
    tapRow(row);
    expect(edited).toEqual(['e1']);
  });

  it('left past 72px: the row follows, then opens on a round danger Delete (trash + word)', () => {
    const { el, deleted, edited } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e3');
    const { prevented } = drag(row, -90, 0, { lift: false });
    expect(prevented).toBeGreaterThan(0); // the swipe is ours: no page scroll
    expect(main(row).style.transform).toBe('translate3d(-90px, 0, 0)');
    expect(panel(row).hasAttribute('hidden')).toBe(false);
    row.dispatch('touchend', {
      touches: [],
      changedTouches: [{ clientX: 210, clientY: 400 }],
      timeStamp: 1300,
      target: { closest: () => null },
    });
    expect(row.hasAttribute('data-swipe-open')).toBe(true);
    expect(main(row).style.transform).toBe('translate3d(-104px, 0, 0)');
    const btn = del(row);
    expect(btn.getAttribute('data-entry-delete')).toBe('e3');
    expect(btn.getAttribute('data-variant')).toBe('danger');
    expect(btn.getAttribute('aria-label')).toBe('Delete Banana');
    expect(btn.oneByClass('icon-btn-label').textContent).toBe('Delete');
    expect(btn.find((e) => e.getAttribute('data-icon') === 'trash')).toHaveLength(1);
    btn.click();
    expect(deleted).toEqual(['e3']);
    expect(edited).toEqual([]);
  });

  it('past the Delete width the row drags with resistance', () => {
    const { el } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    drag(row, -164, 0, { lift: false });
    expect(main(row).style.transform).toBe('translate3d(-124px, 0, 0)');
  });

  it('a short drag springs back and deletes nothing', () => {
    vi.useFakeTimers();
    const { el, deleted } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    drag(row, -50);
    expect(row.hasAttribute('data-swipe-open')).toBe(false);
    expect(main(row).style.transform).toBe('');
    vi.advanceTimersByTime(500);
    expect(panel(row).hasAttribute('hidden')).toBe(true);
    expect(deleted).toEqual([]);
  });

  it('a vertical drag is the page scroll: nothing moves, nothing prevented', () => {
    const { el } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    const { prevented } = drag(row, -6, -200);
    expect(prevented).toBe(0);
    expect(all(row, 'data-entry-swipe')).toHaveLength(0);
    expect(row.hasAttribute('data-swipe-open')).toBe(false);
  });

  it('a right swipe is not this gesture', () => {
    const { el } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    drag(row, 120);
    expect(all(row, 'data-entry-swipe')).toHaveLength(0);
  });

  it('a tap on the open row only closes it (no sheet); a press elsewhere closes it too', () => {
    vi.useFakeTimers();
    const { el, edited } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e2');
    drag(row, -100);
    vi.advanceTimersByTime(500); // past the swipe's own click
    expect(row.hasAttribute('data-swipe-open')).toBe(true);
    tapRow(row);
    expect(row.hasAttribute('data-swipe-open')).toBe(false);
    expect(edited).toEqual([]);
    vi.advanceTimersByTime(500);
    tapRow(row); // closed again: a tap opens the sheet
    expect(edited).toEqual(['e2']);

    drag(row, -100);
    expect(downs).toHaveLength(1);
    downs[0]?.({ target: null });
    expect(row.hasAttribute('data-swipe-open')).toBe(false);
    expect(downs).toHaveLength(0);
  });

  it('one row open at a time', () => {
    const { el } = swipeRender();
    const a = byAttr(el, 'data-entry', 'e1');
    const b = byAttr(el, 'data-entry', 'e3');
    drag(a, -100);
    drag(b, -100);
    expect(a.hasAttribute('data-swipe-open')).toBe(false);
    expect(b.hasAttribute('data-swipe-open')).toBe(true);
  });

  it('Reduce Motion: no follow while dragging; it still opens on release', () => {
    reduce = true;
    const { el, deleted } = swipeRender();
    const row = byAttr(el, 'data-entry', 'e1');
    drag(row, -90, 0, { lift: false });
    expect(main(row).style.transform ?? '').toBe('');
    row.dispatch('touchend', {
      touches: [],
      changedTouches: [{ clientX: 210, clientY: 400 }],
      timeStamp: 1300,
      target: { closest: () => null },
    });
    expect(row.hasAttribute('data-swipe-open')).toBe(true);
    expect(main(row).style.transition).toBe('none');
    del(row).click();
    expect(deleted).toEqual(['e1']);
  });
});
