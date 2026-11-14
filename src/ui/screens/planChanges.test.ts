import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanChange, TrainerState } from '../../core/types';
import { asFake, useFakeDom } from './testDom';
import { changeWhen, newestFirst, planChangesScreen, RESET_CONFIRM_MS } from './planChanges';

useFakeDom();

const STATE = {} as TrainerState;
const at = (d: number, hh: number, mm = 0) => new Date(2026, 10, d, hh, mm).getTime();
const change = (id: number, createdAt: number, title: string, undoneAt?: number): PlanChange => ({
  id,
  createdAt,
  action: 'lighter',
  title,
  source: 'chip',
  before: STATE,
  after: STATE,
  ...(undoneAt !== undefined ? { undoneAt } : {}),
});

function render(changes: PlanChange[], confirmMs?: number) {
  const calls = { back: 0, undo: [] as (number | undefined)[], reset: 0 };
  const el = asFake(
    planChangesScreen(
      { changes, confirmMs },
      {
        onBack: () => calls.back++,
        onUndo: (c) => calls.undo.push(c.id),
        onReset: () => calls.reset++,
      },
    ),
  );
  return { el, calls };
}

describe('planChangesScreen', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is a Pro screen with Back and a title', () => {
    const { el, calls } = render([]);
    expect(el.getAttribute('data-screen')).toBe('plan-changes');
    expect(el.classes).toContain('mood-pro');
    expect(el.byTag('h1')[0]?.textContent).toBe('Plan changes');
    el.byTag('button')
      .find((b) => b.textContent === '‹ Back')
      ?.click();
    expect(calls.back).toBe(1);
  });

  it('shows an empty state when there are no changes', () => {
    const { el } = render([]);
    expect(el.oneByClass('plan-empty').getAttribute('data-plan-changes')).toBe('empty');
    expect(el.byClass('plan-change')).toHaveLength(0);
  });

  it('lists newest first with Undo on the newest only', () => {
    const { el, calls } = render([
      change(1, at(10, 9), 'Lighter today'),
      change(3, at(13, 18, 5), 'Easy on arms'),
      change(2, at(12, 7), 'Moved Pull A to Sat'),
    ]);
    const rows = el.byClass('plan-change');
    expect(rows.map((r) => r.getAttribute('data-change'))).toEqual(['3', '2', '1']);
    expect(rows[0]?.oneByClass('plan-change-title').textContent).toBe('Easy on arms');
    expect(rows[0]?.oneByClass('plan-change-when').textContent).toBe('Fri 13 Nov · 18:05');
    const undos = el.find((e) => e.hasAttribute('data-undo-change'));
    expect(undos).toHaveLength(1);
    expect(undos[0]?.getAttribute('data-undo-change')).toBe('3');
    expect(undos[0]?.getAttribute('aria-label')).toBe('Undo: Easy on arms');
    undos[0]?.click();
    expect(calls.undo).toEqual([3]);
  });

  it('undone changes are marked, and Undo moves to the newest still applied', () => {
    const { el } = render([
      change(1, at(10, 9), 'Lighter today'),
      change(2, at(12, 7), 'Easy on arms', at(12, 8)),
    ]);
    const rows = el.byClass('plan-change');
    expect(rows[0]?.hasAttribute('data-undone')).toBe(true);
    expect(rows[0]?.classes).toContain('undone');
    expect(rows[0]?.oneByClass('plan-change-when').textContent).toBe('Thu 12 Nov · 07:00 · Undone');
    expect(rows[0]?.byClass('plan-undo')).toHaveLength(0);
    expect(rows[1]?.byClass('plan-undo')).toHaveLength(1);
  });

  it('no Undo when every change is undone', () => {
    const { el } = render([change(1, at(10, 9), 'Lighter today', at(10, 10))]);
    expect(el.byClass('plan-undo')).toHaveLength(0);
  });

  it('Reset to default program needs two taps and disarms itself', () => {
    const { el, calls } = render([], 2000);
    const reset = el.find((e) => e.hasAttribute('data-reset-plan'))[0];
    expect(reset?.textContent).toBe('Reset to default program');
    reset?.click();
    expect(calls.reset).toBe(0);
    expect(reset?.hasAttribute('data-armed')).toBe(true);
    expect(reset?.textContent).toBe('Tap again to reset');
    vi.advanceTimersByTime(2000);
    expect(reset?.hasAttribute('data-armed')).toBe(false);
    expect(reset?.textContent).toBe('Reset to default program');
    reset?.click();
    reset?.click();
    expect(calls.reset).toBe(1);
    expect(reset?.hasAttribute('data-armed')).toBe(false);
    expect(RESET_CONFIRM_MS).toBe(3000);
  });

  it('helpers: changeWhen, newestFirst keeps ties in order', () => {
    expect(changeWhen(at(14, 6, 7))).toBe('Sat 14 Nov · 06:07');
    const a = change(1, 5, 'a');
    const b = change(2, 5, 'b');
    const c = change(3, 9, 'c');
    expect(newestFirst([a, b, c]).map((x) => x.id)).toEqual([3, 1, 2]);
  });
});
