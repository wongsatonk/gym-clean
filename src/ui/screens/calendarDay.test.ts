import { describe, expect, it, vi } from 'vitest';
import type { DayCompletion } from '../../core/types';
import {
  calendarDayScreen,
  dayActions,
  repsLine,
  rowState,
  type CalendarDayActions,
  type CalendarDayProps,
} from './calendarDay';
import { FIX_TODAY, fixName, fixtureMonth } from './calendarFixture';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('missing');
  return x;
}

const at = (date: string): DayCompletion => must(fixtureMonth().find((d) => d.date === date));

const props = (date: string, over: Partial<CalendarDayProps> = {}): CalendarDayProps => ({
  day: at(date),
  today: FIX_TODAY,
  dayName: fixName,
  name: fixName,
  ...over,
});

const acts = () =>
  ({
    onBack: vi.fn(),
    onStart: vi.fn(),
    onMove: vi.fn(),
    onDoToday: vi.fn(),
    onHistory: vi.fn(),
  }) satisfies CalendarDayActions;

const render = (p: CalendarDayProps, a = acts()) => asFake(calendarDayScreen(p, a));
const actionIds = (root: FakeEl) =>
  root.find((e) => e.hasAttribute('data-day-action')).map((e) => e.getAttribute('data-day-action'));
const rows = (root: FakeEl) => root.byClass('cal-ex');

describe('dayActions', () => {
  it('Start + Move today; Do it today + Move for future planned; Do it today for past missed (Move is from today on); none otherwise', () => {
    const T = FIX_TODAY;
    expect(dayActions({ date: T, status: 'planned' }, T)).toEqual(['start', 'move']);
    expect(dayActions({ date: T, status: 'partial' }, T)).toEqual(['start', 'move']);
    expect(dayActions({ date: T, status: 'done' }, T)).toEqual([]);
    expect(dayActions({ date: '2026-11-20', status: 'planned' }, T)).toEqual(['doToday', 'move']);
    expect(dayActions({ date: '2026-11-10', status: 'missed' }, T)).toEqual(['doToday']);
    for (const s of ['done', 'partial', 'rest', 'extra'] as const)
      expect(dayActions({ date: '2026-11-06', status: s }, T)).toEqual([]);
    expect(dayActions({ date: '2026-11-22', status: 'rest' }, T)).toEqual([]);
  });
});

describe('row helpers', () => {
  const ex = (
    reps: number[],
    status: 'done' | 'partial' | 'missed',
    target: [number, number] = [8, 12],
  ) => ({
    exerciseId: 'bench',
    setsPlanned: 3,
    setsDone: reps.length,
    repsTarget: target,
    reps,
    status,
  });
  it('nothing logged reads To do until the day is over', () => {
    expect(rowState(ex([], 'missed'), FIX_TODAY, FIX_TODAY)).toBe('todo');
    expect(rowState(ex([], 'missed'), '2026-11-25', FIX_TODAY)).toBe('todo');
    expect(rowState(ex([], 'missed'), '2026-11-10', FIX_TODAY)).toBe('missed');
    expect(rowState(ex([10], 'partial'), FIX_TODAY, FIX_TODAY)).toBe('partial');
  });
  it('reps line: logged reps and the target, no weights', () => {
    expect(repsLine(ex([12, 11, 10], 'done'))).toBe('12 · 11 · 10 reps, target 8–12');
    expect(repsLine(ex([], 'missed'))).toBe('Target 8–12 reps');
    expect(repsLine(ex([5], 'partial', [5, 5]))).toBe('5 reps, target 5');
    expect(repsLine(ex([], 'missed', [0, 0]))).toBe('');
  });
});

describe('calendarDayScreen', () => {
  it('a done day: every exercise Done with sets of planned, no actions', () => {
    const root = render(props('2026-11-02'));
    expect(root.getAttribute('data-screen')).toBe('calendar-day');
    // M13 task 18 (one look): the standard surface + 20px cards, not the black workout track.
    expect(root.classes).toContain('mood-pro');
    expect(root.classes).not.toContain('mood-track');
    expect(root.byTag('h1')[0]?.textContent).toBe('Mon 2 Nov');
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Push A · Done');
    expect(root.oneByClass('cal-day-big-num').textContent).toBe('18');
    expect(root.oneByClass('cal-day-of').textContent).toBe('of 18 sets');
    expect(rows(root).map((r) => r.getAttribute('data-row-status'))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
    expect(rows(root)[0]?.oneByClass('cal-ex-status').textContent).toBe('Done · 5 of 5 sets');
    expect(actionIds(root)).toEqual([]);
  });

  it('a partly done day shows done / partly / missed rows', () => {
    const root = render(props('2026-11-06'));
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Push A · Partly done');
    expect(rows(root).map((r) => r.getAttribute('data-row-status'))).toEqual([
      'done',
      'done',
      'partial',
      'missed',
    ]);
    expect(rows(root)[2]?.oneByClass('cal-ex-status').textContent).toBe('Partly · 2 of 4 sets');
    expect(rows(root)[3]?.oneByClass('cal-ex-status').textContent).toBe('Missed · 0 of 4 sets');
  });

  it('a missed day offers Do it today (not Move: that is from today on) with its date', () => {
    const a = acts();
    const root = render(props('2026-11-10'), a);
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Pull A · Missed');
    expect(actionIds(root)).toEqual(['doToday']);
    root.find((e) => e.getAttribute('data-day-action') === 'doToday')[0]?.click();
    expect(a.onDoToday).toHaveBeenCalledWith('2026-11-10');
    expect(a.onMove).not.toHaveBeenCalled();
  });

  it('a later planned day offers Do it today and Move, each with its date', () => {
    const a = acts();
    const root = render(props('2026-11-20'), a);
    expect(actionIds(root)).toEqual(['doToday', 'move']);
    root.find((e) => e.getAttribute('data-day-action') === 'doToday')[0]?.click();
    root.find((e) => e.getAttribute('data-day-action') === 'move')[0]?.click();
    expect(a.onDoToday).toHaveBeenCalledWith('2026-11-20');
    expect(a.onMove).toHaveBeenCalledWith('2026-11-20');
  });

  it('today: To do rows, Start + Move, focus block line and focus tags', () => {
    const a = acts();
    const root = render(
      props(FIX_TODAY, { focusGroup: 'chest', isFocus: (id) => id === 'bench' || id === 'pushup' }),
      a,
    );
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Pull A · To do today');
    expect(rows(root).every((r) => r.getAttribute('data-row-status') === 'todo')).toBe(true);
    expect(rows(root)[0]?.oneByClass('cal-ex-status').textContent).toBe('To do · 0 of 5 sets');
    expect(root.oneByClass('cal-day-focus').textContent).toBe('Chest focus block');
    expect(root.find((e) => e.hasAttribute('data-focus-ex'))).toHaveLength(2);
    expect(actionIds(root)).toEqual(['start', 'move']);
    root.find((e) => e.getAttribute('data-day-action') === 'start')[0]?.click();
    expect(a.onStart).toHaveBeenCalledOnce();
  });

  it('an extra session on a rest day lists what was done, with no plan denominator', () => {
    const root = render(props('2026-11-15'));
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Pull A · Extra session');
    expect(root.oneByClass('cal-day-of').textContent).toBe('sets');
    expect(rows(root)).toHaveLength(2);
    expect(rows(root)[0]?.oneByClass('cal-ex-status').textContent).toBe('Done · 3 sets');
  });

  it('a rest day: no sets number, no rows, no actions', () => {
    const root = render(props('2026-11-11'));
    expect(root.oneByClass('cal-day-sub').textContent).toBe('Rest day');
    expect(root.byClass('cal-day-big-num')).toHaveLength(0);
    expect(rows(root)).toHaveLength(0);
    expect(root.find((e) => e.hasAttribute('data-day-rest'))).toHaveLength(1);
    expect(actionIds(root)).toEqual([]);
  });

  it('History per exercise and Back call back; all controls are buttons with names', () => {
    const a = acts();
    const root = render(props('2026-11-02'), a);
    const hist = must(root.find((e) => e.getAttribute('data-cal-history') === 'row')[0]);
    expect(hist.getAttribute('aria-label')).toBe('History: One-Arm Dumbbell Row');
    hist.click();
    expect(a.onHistory).toHaveBeenCalledWith('row');
    root.find((e) => e.hasAttribute('data-cal-back'))[0]?.click();
    expect(a.onBack).toHaveBeenCalledOnce();
    for (const b of root.byTag('button')) {
      expect(b.getAttribute('type')).toBe('button');
      expect(
        b.textContent.trim().length + (b.getAttribute('aria-label') ?? '').length,
      ).toBeGreaterThan(0);
    }
  });

  it('counts the sets up when animate is on', () => {
    vi.useFakeTimers();
    const root = render(props('2026-11-02', { animate: true }));
    const num = root.oneByClass('cal-day-big-num');
    expect(num.textContent).toBe('0');
    vi.advanceTimersByTime(2000);
    expect(num.textContent).toBe('18');
    vi.useRealTimers();
  });

  it('no weights in the day detail', () => {
    expect(render(props('2026-11-02')).textContent).not.toMatch(/\bkg\b|\blb\b|weight/i);
  });
});

describe('calendarDayScreen M13b one-sided sets', () => {
  const S = (r: number, l: number) => ({
    right: { reps: r, partials: 0 },
    left: { reps: l, partials: 0 },
  });
  const oneArm = {
    exerciseId: 'row',
    setsPlanned: 3,
    setsDone: 2,
    repsTarget: [8, 12] as [number, number],
    reps: [11, 10],
    sides: [S(12, 11), S(10, 10)],
    status: 'partial' as const,
  };
  const dayWith = (ex: DayCompletion['exercises']): DayCompletion => ({
    ...at('2026-11-06'),
    exercises: ex,
  });

  it('a one-sided exercise reads "R 12 · L 11 reps" per set, then the target', () => {
    const root = render(props('2026-11-06', { day: dayWith([oneArm]) }));
    const reps = rows(root)[0]?.oneByClass('cal-ex-reps');
    expect(reps?.byClass('side-set').map((l) => l.textContent)).toEqual([
      'R 12 · L 11 reps',
      'R 10 · L 10 reps',
    ]);
    expect(reps?.textContent).toContain('Target 8–12');
  });

  it('sets logged without sides keep the old line', () => {
    const plain = { ...oneArm, sides: undefined };
    const root = render(props('2026-11-06', { day: dayWith([plain]) }));
    const reps = rows(root)[0]?.oneByClass('cal-ex-reps');
    expect(reps?.byClass('side-set')).toHaveLength(0);
    expect(reps?.textContent).toBe('11 · 10 reps, target 8–12');
  });
});
