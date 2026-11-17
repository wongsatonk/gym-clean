import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayCompletion, PeriodScore } from '../../core/types';
import {
  calendarScreen,
  dayLabel,
  leadingBlanks,
  monthTitle,
  ringPct,
  shiftMonth,
  type CalendarActions,
  type CalendarProps,
} from './calendar';
import {
  FIX_MONTH,
  FIX_MONTH_SCORE,
  FIX_TODAY,
  FIX_WEEK,
  fixName,
  fixtureMonth,
} from './calendarFixture';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

function must<T>(x: T | null | undefined): T {
  if (x === null || x === undefined) throw new Error('missing');
  return x;
}

const props = (over: Partial<CalendarProps> = {}): CalendarProps => ({
  month: FIX_MONTH,
  today: FIX_TODAY,
  days: fixtureMonth(),
  week: FIX_WEEK,
  monthScore: FIX_MONTH_SCORE,
  streakWeeks: 6,
  blockGroup: (id) => (id === 'b1' ? 'chest' : null),
  dayName: fixName,
  ...over,
});

const acts = (): CalendarActions & Record<string, ReturnType<typeof vi.fn>> =>
  ({
    onPrevMonth: vi.fn(),
    onNextMonth: vi.fn(),
    onOpenDay: vi.fn(),
    onShare: vi.fn(),
    onRetry: vi.fn(),
  }) as never;

const render = (p = props(), a = acts()) => asFake(calendarScreen(p, a));
const cell = (root: FakeEl, date: string) => {
  const hit = root.find((e) => e.getAttribute('data-cal-day') === date)[0];
  if (!hit) throw new Error(`no cell ${date}`);
  return hit;
};

afterEach(() => vi.useRealTimers());

describe('pure helpers', () => {
  it('month title, shifting and Monday-first blanks', () => {
    expect(monthTitle('2026-11')).toBe('November 2026');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(leadingBlanks('2026-11')).toBe(6); // Sun 1 Nov
    expect(leadingBlanks('2026-06')).toBe(0); // Mon 1 Jun
  });

  it('ring fill by status; partial stays visibly between empty and full', () => {
    const d = (status: DayCompletion['status'], done = 0, planned = 18) => ({
      status,
      setsDone: done,
      setsPlanned: planned,
    });
    expect(ringPct(d('done', 18))).toBe(100);
    expect(ringPct(d('extra', 6, 0))).toBe(100);
    expect(ringPct(d('partial', 9))).toBe(50);
    expect(ringPct(d('partial', 1, 100))).toBe(8);
    expect(ringPct(d('partial', 99, 100))).toBe(92);
    for (const s of ['missed', 'planned', 'rest'] as const) expect(ringPct(d(s))).toBe(0);
  });

  it('accessible day labels for every status', () => {
    const days = fixtureMonth();
    const at = (date: string) => must(days.find((d) => d.date === date));
    const L = (date: string, focus: 'chest' | null = null) =>
      dayLabel(at(date), FIX_TODAY, fixName, focus);
    expect(L('2026-11-02')).toBe('Mon 2: done, 18 of 18 sets');
    expect(L('2026-11-06')).toBe('Fri 6: partly done, 12 of 18 sets');
    expect(L('2026-11-10')).toBe('Tue 10: missed, Pull A');
    expect(L('2026-11-11')).toBe('Wed 11: rest');
    expect(L('2026-11-15')).toBe('Sun 15: extra session, 6 sets');
    expect(L('2026-11-19', 'chest')).toBe('Thu 19: planned, Pull A, today, chest focus block');
  });
});

describe('calendarScreen', () => {
  it('renders the month grid with a cell per date after the Monday-first blanks', () => {
    const root = render();
    expect(root.getAttribute('data-screen')).toBe('calendar');
    // M13 task 18 (one look): the standard surface + 20px cards, not the black workout track.
    expect(root.classes).toContain('mood-pro');
    expect(root.classes).not.toContain('mood-track');
    expect(root.byClass('cal-blank')).toHaveLength(6);
    expect(root.byClass('cal-day')).toHaveLength(30);
    expect(root.byClass('cal-month')[0]?.textContent).toBe('November 2026');
  });

  it('every day status has its own ring shape, data-status and label', () => {
    const root = render();
    const want: Record<string, string> = {
      '2026-11-02': 'done',
      '2026-11-06': 'partial',
      '2026-11-10': 'missed',
      '2026-11-11': 'rest',
      '2026-11-15': 'extra',
      '2026-11-20': 'planned',
    };
    for (const [date, status] of Object.entries(want)) {
      const c = cell(root, date);
      expect(c.getAttribute('data-status')).toBe(status);
      expect(c.getAttribute('aria-label')).toMatch(/^\w{3} \d+: /);
      const tracks = c.byClass('cal-ring-track');
      const arcs = c.byClass('cal-ring-arc');
      if (status === 'rest') expect(tracks).toHaveLength(0);
      else expect(tracks).toHaveLength(1);
      if (status === 'done' || status === 'extra')
        expect(arcs[0]?.getAttribute('stroke-dashoffset')).toBe('0');
      else if (status === 'partial')
        expect(arcs[0]?.getAttribute('stroke-dashoffset')).toBe('33'); // 12 of 18
      else expect(arcs).toHaveLength(0);
    }
    expect(cell(root, '2026-11-15').byClass('cal-extra')).toHaveLength(1);
  });

  it('marks today (outline + aria-current) and focus-block days, and shows the focus legend', () => {
    const root = render();
    const today = cell(root, FIX_TODAY);
    expect(today.hasAttribute('data-today')).toBe(true);
    expect(today.getAttribute('aria-current')).toBe('date');
    expect(cell(root, '2026-11-18').hasAttribute('aria-current')).toBe(false);
    expect(cell(root, '2026-11-16').byClass('cal-focus-mark')).toHaveLength(1);
    expect(cell(root, '2026-11-09').byClass('cal-focus-mark')).toHaveLength(0);
    const legend = root.oneByClass('cal-legend').textContent;
    for (const w of ['Done', 'Partly', 'Missed', 'Planned', 'Extra', 'Focus block'])
      expect(legend).toContain(w);
  });

  it('hides the focus and extra legend entries when the month has none', () => {
    const days = fixtureMonth().map((d) => {
      const rest: DayCompletion = { ...d };
      delete rest.blockId;
      return rest.status === 'extra' ? { ...rest, status: 'rest' as const } : rest;
    });
    const legend = render(props({ days })).oneByClass('cal-legend').textContent;
    expect(legend).not.toContain('Focus block');
    expect(legend).not.toContain('Extra');
  });

  it('every day and nav control is a real button (keyboard reachable) and calls back', () => {
    const a = acts();
    const root = render(props(), a);
    const buttons = root.byTag('button');
    for (const b of buttons) {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('tabindex')).toBeNull();
    }
    cell(root, '2026-11-06').click();
    expect(a.onOpenDay).toHaveBeenCalledWith('2026-11-06');
    root.find((e) => e.hasAttribute('data-cal-prev'))[0]?.click();
    root.find((e) => e.hasAttribute('data-cal-next'))[0]?.click();
    root.find((e) => e.hasAttribute('data-share-month'))[0]?.click();
    expect(a.onPrevMonth).toHaveBeenCalledOnce();
    expect(a.onNextMonth).toHaveBeenCalledOnce();
    expect(a.onShare).toHaveBeenCalledOnce();
    expect(root.find((e) => e.hasAttribute('data-cal-prev'))[0]?.getAttribute('aria-label')).toBe(
      'Previous month, October 2026',
    );
  });

  it('shows week and month scores, focus sets vs target, extras and the streak', () => {
    const root = render();
    const score = (k: string) => must(root.find((e) => e.getAttribute('data-score') === k)[0]);
    const week = score('week');
    expect(week.oneByClass('cal-score-num').textContent).toBe('86%');
    expect(week.oneByClass('cal-score-line').textContent).toBe(
      '2 of 5 sessions, 86% of planned sets',
    );
    expect(week.getAttribute('aria-label')).toBe('This week: 2 of 5 sessions, 86% of planned sets');
    expect(week.oneByClass('cal-score-focus').textContent).toBe('Chest focus: 9 of 20 sets');
    const month = score('month');
    expect(month.oneByClass('cal-score-title').textContent).toBe('This month');
    expect(month.oneByClass('cal-score-num').textContent).toBe('89%');
    expect(month.textContent).toContain('+ 1 extra session');
    expect(root.oneByClass('cal-streak').textContent).toBe('Streak: 6 weeks');
  });

  it('scores with nothing due or nothing planned', () => {
    const none: PeriodScore = {
      from: '2026-11-16',
      to: '2026-11-22',
      sessionsPlanned: 0,
      sessionsDone: 0,
      setsPlanned: 0,
      setsDone: 0,
      extra: 0,
    };
    const notDue = { ...none, sessionsPlanned: 4 };
    const root = render(props({ week: notDue, monthScore: none, streakWeeks: 1 }));
    const score = (k: string) => must(root.find((e) => e.getAttribute('data-score') === k)[0]);
    expect(score('week').oneByClass('cal-score-num').textContent).toBe('0/4');
    expect(score('week').oneByClass('cal-score-line').textContent).toBe('0 of 4 sessions');
    expect(score('month').oneByClass('cal-score-num').textContent).toBe('–');
    expect(score('month').oneByClass('cal-score-line').textContent).toBe('No sessions planned');
    expect(root.oneByClass('cal-streak').textContent).toBe('Streak: 1 week');
  });

  it('counts the score numbers up on first show and ends on the final value', () => {
    vi.useFakeTimers();
    const root = render(props({ animate: true }));
    const num = must(root.byClass('cal-score-num')[0]);
    expect(num.textContent).toBe('0%');
    vi.advanceTimersByTime(2000);
    expect(num.textContent).toBe('86%');
  });

  it('final numbers at once without animate (re-renders, reduced motion)', () => {
    const root = render(props({ animate: false }));
    expect(root.byClass('cal-score-num')[0]?.textContent).toBe('86%');
  });

  it('loading and error states replace the grid; retry calls back', () => {
    const a = acts();
    const loading = render(props({ loading: true }), a);
    expect(loading.byClass('cal-grid')).toHaveLength(0);
    expect(loading.find((e) => e.getAttribute('data-calendar-state') === 'loading')).toHaveLength(
      1,
    );
    const err = render(props({ loading: true, error: true }), a);
    const card = must(err.find((e) => e.getAttribute('data-calendar-state') === 'error')[0]);
    expect(card.getAttribute('role')).toBe('alert');
    card.byTag('button')[0]?.click();
    expect(a.onRetry).toHaveBeenCalledOnce();
  });

  it('appends the tab bar it is given', () => {
    const tabs = document.createElement('nav');
    const root = render(props({ tabs }));
    expect(root.children.at(-1)).toBe(tabs);
  });

  it('shows no weights or body data', () => {
    const text = render().textContent;
    expect(text).not.toMatch(/\bkg\b|\blb\b|weight|body fat|kcal/i);
  });
});

describe('cardio line on the week score (M12 1b task 32)', () => {
  const score = (root: FakeEl, key: string) =>
    must(root.find((e) => e.getAttribute('data-score') === key)[0]);

  it('"Cardio this week: 95 min" on the week card only, also in its label', () => {
    const root = render(props({ cardioMinutes: 95 }));
    const week = score(root, 'week');
    const line = week.find((e) => e.hasAttribute('data-cardio'));
    expect(line.map((l) => l.textContent)).toEqual(['Cardio this week: 95 min']);
    expect(line[0]?.classes).toContain('cal-score-sub');
    expect(week.getAttribute('aria-label')).toMatch(/\. Cardio this week: 95 min$/);
    expect(score(root, 'month').find((e) => e.hasAttribute('data-cardio'))).toEqual([]);
  });

  it('0 min shows; null or absent hides the line', () => {
    const zero = render(props({ cardioMinutes: 0 }));
    expect(zero.find((e) => e.hasAttribute('data-cardio'))[0]?.textContent).toBe(
      'Cardio this week: 0 min',
    );
    for (const p of [props({ cardioMinutes: null }), props()]) {
      const root = render(p);
      expect(root.find((e) => e.hasAttribute('data-cardio'))).toEqual([]);
      expect(score(root, 'week').getAttribute('aria-label')).not.toMatch(/Cardio/);
    }
  });
});
