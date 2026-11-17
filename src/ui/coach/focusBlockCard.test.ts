import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusBlock, PlannedExercise, ProgramDay } from '../../core/types';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import {
  buildFocusBlockCard,
  buildMissingBlockCard,
  focusBlockTitle,
  focusBlockWeeks,
  resetFocusCardMemory,
  setsText,
  weekLabel,
  type FocusBlockCardProps,
  type FocusWeekView,
} from './focusBlockCard';

useFakeDom();
beforeEach(() => resetFocusCardMemory());

// Made-up block: 2 weeks from Mon 2026-11-16, Mon/Wed/Fri, chest focus.
const row = (
  exerciseId: string,
  sets: number,
  extra: Partial<PlannedExercise> = {},
): PlannedExercise => ({
  exerciseId,
  sets,
  targetReps: [8, 12],
  restSec: 90,
  tracking: 'manual',
  ...extra,
});
const push = (lighter = false): ProgramDay => ({
  id: 'push',
  name: 'Push A',
  exercises: [
    row('Bench', lighter ? 3 : 4, lighter ? { adjusted: 'lighter' } : {}),
    row('Fly', lighter ? 2 : 3, lighter ? { adjusted: 'lighter' } : {}),
    row('Press', 3, { targetReps: [10, 10] }),
  ],
});
const pull = (lighter = false): ProgramDay => ({
  id: 'pull',
  name: 'Pull A',
  exercises: [
    row('Row', lighter ? 3 : 4, lighter ? { adjusted: 'lighter' } : {}),
    row('Pushup', 2),
  ],
});
function dates(start: string, n: number): string[] {
  const [y, m, d] = start.split('-').map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10),
  );
}
const BLOCK: FocusBlock = {
  id: 'fb-chest-2026-11-16',
  group: 'chest',
  startDate: '2026-11-16',
  weeks: 2,
  weekdays: [1, 3, 5],
  days: dates('2026-11-16', 14).map((date, i) => {
    const wd = i % 7; // 0 = Mon
    const lighter = i >= 7;
    if (wd === 0 || wd === 4) return { date, day: push(lighter) };
    if (wd === 2) return { date, day: pull(lighter) };
    return { date, day: null };
  }),
  targetSetsPerWeek: 20,
  baseSetsPerWeek: 14,
};
const NAMES: Record<string, string> = {
  Bench: 'Bench Press',
  Fly: 'Dumbbell Fly',
  Press: 'Shoulder Press',
  Row: 'Dumbbell Row',
  Pushup: 'Push-Up',
};
const FOCUS = new Set(['Bench', 'Fly', 'Pushup']);

function mount(p: Partial<FocusBlockCardProps> = {}) {
  const log: string[] = [];
  const built = buildFocusBlockCard(
    {
      block: BLOCK,
      status: 'pending',
      exerciseName: (id) => NAMES[id] ?? id,
      isFocus: (id) => FOCUS.has(id),
      ...p,
    },
    {
      onApply: () => log.push('apply'),
      onDismiss: () => log.push('dismiss'),
      onUndo: () => log.push('undo'),
      onAskAgain: () => log.push('ask'),
    },
  );
  return { el: asFake(built.el), controls: built.controls.map(asFake), log };
}
const attr = (el: FakeEl, name: string, value?: string) =>
  el.find((e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value));
const one = (el: FakeEl, name: string, value?: string) => {
  const hit = attr(el, name, value)[0];
  if (!hit) throw new Error(`no [${name}${value ? `=${value}` : ''}]`);
  return hit;
};
const btn = (el: FakeEl, text: string) => {
  const hit = el.byTag('button').find((b) => b.textContent.trim() === text);
  if (!hit) throw new Error(`no button ${text}`);
  return hit;
};
const panelOf = (el: FakeEl, b: FakeEl) => one(el, 'id', b.getAttribute('aria-controls') ?? '');

describe('focus-block card: view model (pure)', () => {
  it('cuts the block into weeks with days, rest dates, focus sets and the lighter week', () => {
    const weeks = focusBlockWeeks(
      BLOCK,
      (id) => NAMES[id] ?? id,
      (id) => FOCUS.has(id),
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]?.days.map((d) => d.date)).toEqual(['2026-11-16', '2026-11-18', '2026-11-20']);
    expect(weeks[0]?.restDates).toHaveLength(4);
    // Push A ×2 (4 + 3) + Pull A (2) = 16; the lighter week drops a set from Bench, Fly.
    expect(weeks[0]?.focusSets).toBe(16);
    expect(weeks[1]?.focusSets).toBe(12);
    expect(weeks.map((w) => w.lighter)).toEqual([false, true]);
    expect(weeks[0]?.days[0]?.exercises[0]).toEqual({
      exerciseId: 'Bench',
      name: 'Bench Press',
      sets: 4,
      reps: [8, 12],
      focus: true,
    });
  });

  it('labels weeks, sets and the title in words', () => {
    const weeks = focusBlockWeeks(
      BLOCK,
      (id) => id,
      (id) => FOCUS.has(id),
    );
    const [w1, w2] = weeks as [FocusWeekView, FocusWeekView];
    expect(weekLabel(w1, 'chest')).toBe('Week 1 · 3 days · chest 16 sets');
    expect(weekLabel(w2, 'chest')).toBe('Week 2 · 3 days · chest 12 sets · lighter week');
    expect(setsText({ sets: 4, reps: [8, 12] })).toBe('4 × 8–12');
    expect(setsText({ sets: 3, reps: [10, 10] })).toBe('3 × 10');
    expect(focusBlockTitle(BLOCK)).toBe('Chest focus: 2 weeks');
  });
});

describe('focus-block card: render', () => {
  it('pending: title, dates, one ≥ 56px row per week (collapsed), Apply / Not now', () => {
    const { el, log } = mount();
    expect(el.getAttribute('data-focus-block-card')).toBe('');
    expect(el.getAttribute('data-block-id')).toBe(BLOCK.id);
    expect(el.getAttribute('aria-label')).toBe('Chest focus: 2 weeks');
    expect(el.oneByClass('fb-dates').textContent).toBe('Mon 16 Nov to Sun 29 Nov');
    const weeks = attr(el, 'data-fb-week');
    expect(weeks.map((w) => w.textContent)).toEqual([
      'Week 1 · 3 days · chest 16 sets',
      'Week 2 · 3 days · chest 12 sets · lighter week',
    ]);
    for (const w of weeks) {
      expect(w.tag).toBe('button');
      expect(w.classes).toContain('fb-row'); // .fb-row: min-height var(--tap-min)
      expect(w.getAttribute('aria-expanded')).toBe('false');
      expect(panelOf(el, w).hasAttribute('hidden')).toBe(true);
    }
    btn(el, 'Apply').click();
    btn(el, 'Not now').click();
    expect(log).toEqual(['apply', 'dismiss']);
  });

  it('a week expands to its days and a day to its exercises (button = Enter / Space)', () => {
    const { el } = mount();
    const w1 = one(el, 'data-fb-week', '0');
    w1.click();
    expect(w1.getAttribute('aria-expanded')).toBe('true');
    expect(panelOf(el, w1).hasAttribute('hidden')).toBe(false);
    const day = one(el, 'data-fb-day', '2026-11-16');
    expect(day.textContent).toBe('Mon 16 NovPush A');
    expect(day.getAttribute('aria-expanded')).toBe('false');
    day.click();
    expect(day.getAttribute('aria-expanded')).toBe('true');
    const exs = attr(panelOf(el, day), 'data-fb-ex');
    expect(exs.map((e) => e.textContent)).toEqual([
      'Bench Press4 × 8–12Focus',
      'Dumbbell Fly3 × 8–12Focus',
      'Shoulder Press3 × 10',
    ]);
    // Focus is a word (and a hook), not a colour.
    expect(exs.map((e) => e.hasAttribute('data-fb-focus'))).toEqual([true, true, false]);
    expect(exs[0]?.byClass('fb-tag')[0]?.textContent).toBe('Focus');
    expect(panelOf(el, w1).oneByClass('fb-rest').textContent).toBe(
      'Rest: Tue 17, Thu 19, Sat 21, Sun 22',
    );
    // Collapse again.
    w1.click();
    expect(w1.getAttribute('aria-expanded')).toBe('false');
    expect(panelOf(el, w1).hasAttribute('hidden')).toBe(true);
  });

  it('labels the lighter week inside it', () => {
    const { el } = mount();
    one(el, 'data-fb-week', '1').click();
    expect(el.oneByClass('fb-lighter').textContent).toBe(
      'Lighter week: one set less, a bit lighter.',
    );
    expect(attr(el, 'data-fb-week', '0')[0]?.find((e) => e.classes.includes('fb-lighter'))).toEqual(
      [],
    );
  });

  it('keeps open rows across a re-render of the same block', () => {
    one(mount().el, 'data-fb-week', '1').click();
    const again = mount().el;
    expect(one(again, 'data-fb-week', '1').getAttribute('aria-expanded')).toBe('true');
    expect(one(again, 'data-fb-week', '0').getAttribute('aria-expanded')).toBe('false');
  });

  it('controls in tab order: every row button, then Apply, Not now', () => {
    const { controls } = mount();
    expect(
      controls.map(
        (c) =>
          c.getAttribute('data-fb-week') ?? c.getAttribute('data-fb-day') ?? c.textContent.trim(),
      ),
    ).toEqual([
      '0',
      '2026-11-16',
      '2026-11-18',
      '2026-11-20',
      '1',
      '2026-11-23',
      '2026-11-25',
      '2026-11-27',
      'Apply',
      'Not now',
    ]);
  });

  it('applied: weeks stay, Applied + Undo; the check pops in only right after Apply', () => {
    const { el, log } = mount({ status: 'applied' });
    expect(attr(el, 'data-fb-week')).toHaveLength(2);
    expect(el.byTag('button').some((b) => b.textContent.trim() === 'Apply')).toBe(false);
    const status = one(el, 'data-card-status', 'applied');
    expect(status.textContent).toBe('Applied.');
    expect(status.byTag('svg')[0]?.getAttribute('data-icon')).toBe('check');
    btn(el, 'Undo').click();
    expect(log).toEqual(['undo']);

    const animate = vi.fn();
    const g = globalThis as unknown as {
      document: { createElementNS: (n: string, t: string) => unknown };
    };
    const make = g.document.createElementNS;
    g.document.createElementNS = (n: string, t: string) => {
      const e = make(n, t) as { animate?: unknown; closest?: unknown };
      e.animate = animate;
      e.closest = () => null;
      return e;
    };
    const fresh = mount({ status: 'applied', justApplied: true }).el;
    expect(
      one(fresh, 'data-card-status', 'applied').byTag('svg')[0]?.getAttribute('data-icon'),
    ).toBe('check');
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['dismissed', 'Not now. Nothing changed.', null],
    ['undone', 'Undone. Your plan is back.', null],
    ['expired', 'Your plan changed since. This is out of date.', 'Ask again'],
  ] as const)('%s: no weeks, its status line', (status, text, button) => {
    const { el, log } = mount({ status });
    expect(attr(el, 'data-fb-week')).toHaveLength(0);
    expect(one(el, 'data-card-status', status).textContent).toBe(text);
    expect(el.byTag('button').some((b) => b.textContent.trim() === 'Undo')).toBe(false);
    if (button) {
      btn(el, button).click();
      expect(log).toEqual(['ask']);
    }
  });

  it('a block that is gone (old thread): "Focus block" and its status, pending reads expired', () => {
    const el = asFake(buildMissingBlockCard('pending', { onAskAgain: () => {} }).el);
    expect(el.byTag('h3')[0]?.textContent).toBe('Focus block');
    expect(one(el, 'data-card-status', 'expired').textContent).toContain('out of date');
  });
});
