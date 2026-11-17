import { describe, expect, it } from 'vitest';
import type { DaySession, ExerciseHistory, ExerciseSessionEntry } from '../../core/history';
import type { TabId } from '../tabBar';
import { TABS } from '../tabBar';
import { FakeEl, asFake, useFakeDom } from './testDom';
import {
  barHeights,
  changeLine,
  historyScreen,
  setText,
  setsLine,
  trendSeries,
  type HistoryProps,
} from './history';

useFakeDom();

const D = (day: number) => new Date(2026, 10, day, 18, 0).getTime(); // Nov 2026

const NAMES: Record<string, string> = {
  row: 'DB Row',
  pu: 'Push-up',
  pull: 'Pull A',
  push: 'Push A',
};
const name = (id: string) => NAMES[id] ?? id;

const day = (
  sessionId: string,
  dayId: string,
  d: number,
  min: number,
  setCount: number,
  volumeKg: number,
  n: number,
  avgFocus: number | null,
): DaySession => ({
  sessionId,
  dayId,
  startedAt: D(d),
  dayStart: D(d),
  durationMs: min * 60_000,
  setCount,
  volumeKg,
  exercises: Array.from({ length: n }, (_, i) => `e${i}`),
  avgFocus,
});

/** Oldest first, like exerciseHistory. */
const sess = (
  id: string,
  d: number,
  sets: { reps: number; weightKg: number }[],
  avgFocus: number | null = null,
): ExerciseSessionEntry => ({
  sessionId: id,
  date: D(d),
  dayStart: D(d),
  sets: sets.map((x) => ({ ...x, focusScore: avgFocus })),
  topSet: sets[0] ?? { reps: 0, weightKg: 0 },
  volumeKg: sets.reduce((n, x) => n + x.reps * x.weightKg, 0),
  focusScores: avgFocus === null ? [] : [avgFocus],
  avgFocus,
});

const best = (reps: number, weightKg: number, d: number) => ({
  reps,
  weightKg,
  sessionId: 'x',
  date: D(d),
});

const ROW: ExerciseHistory = {
  exerciseId: 'row',
  sessions: [
    sess('s1', 6, [
      { reps: 10, weightKg: 20 },
      { reps: 10, weightKg: 20 },
    ]),
    sess(
      's3',
      13,
      [
        { reps: 12, weightKg: 22.5 },
        { reps: 10, weightKg: 22.5 },
      ],
      88,
    ),
  ],
  trend: { bestSet: best(12, 22.5, 13), volumeChangeKg: 95, volumeChangePct: 24, avgFocus: 88 },
};

const PU: ExerciseHistory = {
  exerciseId: 'pu',
  sessions: [
    sess('s2', 6, [
      { reps: 12, weightKg: 0 },
      { reps: 10, weightKg: 0 },
    ]),
    sess('s4', 13, [
      { reps: 15, weightKg: 0 },
      { reps: 12, weightKg: 0 },
    ]),
  ],
  trend: { bestSet: best(15, 0, 13), volumeChangeKg: 0, volumeChangePct: null, avgFocus: null },
};

const PROPS: HistoryProps = {
  unit: 'kg',
  days: [day('s3', 'pull', 13, 47, 14, 2450, 5, 86), day('s2', 'push', 11, 40, 12, 0, 4, null)],
  exercises: [ROW, { ...PU, sessions: PU.sessions.slice(0, 1) }],
  dayName: name,
  name,
};

function render(over: Partial<HistoryProps> = {}) {
  const calls: string[] = [];
  const el = asFake(
    historyScreen(
      { ...PROPS, ...over },
      {
        onOpenExercise: (id) => calls.push(`open:${id}`),
        onBack: () => calls.push('back'),
        onTab: (t: TabId) => calls.push(`tab:${t}`),
      },
    ),
  );
  return { el, calls };
}

const byAttr = (el: FakeEl, k: string, v?: string) =>
  el.find((e) => e.hasAttribute(k) && (v === undefined || e.getAttribute(k) === v));
const one = (el: FakeEl, k: string, v?: string) => {
  const hit = byAttr(el, k, v)[0];
  if (!hit) throw new Error(`no [${k}${v ? `=${v}` : ''}]`);
  return hit;
};

describe('history helpers', () => {
  it('formats sets, weighted and bodyweight', () => {
    expect(setText({ reps: 12, weightKg: 22.5 }, 'kg')).toBe('12 × 22.5 kg');
    expect(setText({ reps: 1, weightKg: 0 }, 'kg')).toBe('1 rep');
    expect(
      setsLine(
        [
          { reps: 12, weightKg: 22.5 },
          { reps: 10, weightKg: 22.5 },
        ],
        'kg',
      ),
    ).toBe('12×22.5, 10×22.5 kg');
    expect(
      setsLine(
        [
          { reps: 15, weightKg: 0 },
          { reps: 12, weightKg: 0 },
        ],
        'kg',
      ),
    ).toBe('15, 12 reps');
    expect(setsLine([], 'kg')).toBe('');
  });

  it('trends volume oldest first, or reps for bodyweight', () => {
    expect(trendSeries(ROW.sessions, 'kg')).toEqual({ metric: 'volume', values: [400, 495] });
    expect(trendSeries(PU.sessions, 'kg')).toEqual({ metric: 'reps', values: [22, 27] });
  });

  it('scales bars to the tallest and keeps a sliver for small values', () => {
    expect(barHeights([50, 100])).toEqual([50, 100]);
    expect(barHeights([1, 100])).toEqual([6, 100]);
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([0, 10])).toEqual([0, 100]);
  });

  it('writes the change line in words with a sign', () => {
    const vol = (values: number[]) => ({ metric: 'volume' as const, values });
    const reps = (values: number[]) => ({ metric: 'reps' as const, values });
    expect(changeLine(vol([1]), null).tone).toBe('none');
    expect(changeLine(vol([1, 2]), 12)).toEqual({ text: 'Volume +12% over 4 weeks', tone: 'up' });
    expect(changeLine(vol([2, 2]), 0).tone).toBe('flat');
    expect(changeLine(vol([2, 1]), -5)).toEqual({ text: 'Volume −5% over 4 weeks', tone: 'down' });
    expect(changeLine(reps([22, 27]), null)).toEqual({ text: '+5 reps over 4 weeks', tone: 'up' });
    expect(changeLine(reps([22, 21]), null)).toEqual({ text: '−1 rep over 4 weeks', tone: 'down' });
  });
});

describe('history screen: list', () => {
  it('is a Track screen with the 7-day scoreboard, the days and the exercises, tab bar last', () => {
    const { el } = render();
    expect(el.classes).toEqual(
      expect.arrayContaining(['screen', 'history', 'has-tabbar', 'mood-track']),
    );
    expect(el.getAttribute('data-view')).toBe('list');
    expect(one(el, 'data-week-stat', 'sessions').oneByClass('hist-stat-value').textContent).toBe(
      '2',
    );
    expect(one(el, 'data-week-stat', 'volume').textContent).toContain('2,450');
    const days = byAttr(el, 'data-history-day');
    expect(days.map((d) => d.getAttribute('data-history-day'))).toEqual(['s3', 's2']);
    expect(days[0]?.textContent).toContain('Fri 13 Nov · 47 min');
    expect(days[0]?.textContent).toContain('14 sets · 5 exercises · 2,450 kg');
    expect(days[0]?.textContent).toContain('86focus');
    expect(days[1]?.textContent).toContain('bodyweight');
    expect(days[1]?.byClass('hist-focus')).toHaveLength(0);
    const rows = byAttr(el, 'data-history-exercise');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('12 × 22.5 kg'),
      expect.stringContaining('15 reps'),
    ]);
    expect(rows[0]?.textContent).toContain('Last Fri 13 Nov · 2 sessions');
    expect(rows[1]?.textContent).toContain('Last Fri 6 Nov · 1 session');
    expect(rows.every((r) => r.tag === 'button')).toBe(true);
    const last = el.children[el.children.length - 1];
    expect(last?.getAttribute('data-tabbar')).toBe('');
    expect(one(el, 'data-tab', 'calendar').getAttribute('aria-current')).toBe('page');
  });

  it('opens an exercise and switches tabs through the callbacks', () => {
    const { el, calls } = render();
    one(el, 'data-history-exercise', 'pu').click();
    one(el, 'data-tab', 'calendar').click(); // the active tab does nothing
    one(el, 'data-tab', 'settings').click();
    expect(calls).toEqual(['open:pu', 'tab:settings']);
  });

  it('sits under the Calendar tab (M12: Calendar replaces History)', () => {
    expect(TABS.map((t) => t.label)).toContain('Calendar');
    expect(TABS.map((t) => t.label)).not.toContain('History');
  });

  it('empty: no history at all shows one message and a way to Today', () => {
    const { el, calls } = render({ days: [], exercises: [] });
    expect(one(el, 'data-history-empty', 'none').textContent).toContain('No workouts yet');
    expect(byAttr(el, 'data-week-stat')).toHaveLength(0);
    el.find((e) => e.tag === 'button' && e.textContent === 'Go to Today')[0]?.click();
    expect(calls).toEqual(['tab:today']);
  });

  it('empty week: older exercises still listed', () => {
    const { el } = render({ days: [] });
    expect(one(el, 'data-history-empty', 'week')).toBeTruthy();
    expect(one(el, 'data-week-stat', 'sessions').textContent).toContain('0');
    expect(byAttr(el, 'data-history-exercise')).toHaveLength(2);
  });

  it('loading: a neutral Loading card, not the empty state, and no scoreboard yet', () => {
    const { el } = render({ loading: true, days: [], exercises: [] });
    expect(el.getAttribute('data-view')).toBe('list');
    const card = one(el, 'data-history-state', 'loading');
    expect(card.textContent).toContain('Loading…');
    expect(card.getAttribute('role')).toBe('status');
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(byAttr(el, 'data-history-empty')).toHaveLength(0);
    expect(el.textContent).not.toContain('No workouts yet');
    expect(byAttr(el, 'data-week-stat')).toHaveLength(0);
    expect(byAttr(el, 'data-history-exercise')).toHaveLength(0);
    expect(one(el, 'data-tab', 'calendar').getAttribute('aria-current')).toBe('page');
  });

  it('error: "Couldn\'t load history" with a way to Today, not the empty state', () => {
    const { el, calls } = render({ error: true, days: [], exercises: [] });
    const card = one(el, 'data-history-state', 'error');
    expect(card.textContent).toContain("Couldn't load history");
    expect(card.getAttribute('role')).toBe('alert');
    expect(byAttr(el, 'data-history-empty')).toHaveLength(0);
    expect(byAttr(el, 'data-history-state', 'loading')).toHaveLength(0);
    expect(byAttr(el, 'data-week-stat')).toHaveLength(0);
    el.find((e) => e.tag === 'button' && e.textContent === 'Go to Today')[0]?.click();
    expect(calls).toEqual(['tab:today']);
  });

  it('error wins over loading and over stale data; both false renders the list as before', () => {
    expect(
      byAttr(render({ error: true, loading: true }).el, 'data-history-state', 'error'),
    ).toHaveLength(1);
    const stale = render({ error: true }).el;
    expect(byAttr(stale, 'data-history-day')).toHaveLength(0);
    const ok = render({ loading: false, error: false }).el;
    expect(byAttr(ok, 'data-history-state')).toHaveLength(0);
    expect(byAttr(ok, 'data-history-day')).toHaveLength(2);
  });

  it('converts volume to lb', () => {
    const { el } = render({ unit: 'lb' });
    expect(one(el, 'data-week-stat', 'volume').textContent).toContain('5,401lb');
  });
});

describe('history screen: exercise detail', () => {
  it('shows the best set, a volume trend with text values, the trend lines and sessions', () => {
    const { el, calls } = render({ detail: ROW });
    expect(el.getAttribute('data-view')).toBe('detail');
    expect(el.byTag('h1')[0]?.textContent).toBe('DB Row');
    expect(one(el, 'data-best').textContent).toContain('12 × 22.5');
    const trend = one(el, 'data-trend');
    expect(trend.getAttribute('data-metric')).toBe('volume');
    expect(trend.byTag('svg')[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(trend.byTag('rect')).toHaveLength(2);
    expect(trend.byClass('latest')).toHaveLength(1);
    expect(one(el, 'data-trend-end', 'first').textContent).toContain('400 kg');
    expect(one(el, 'data-trend-end', 'latest').textContent).toContain('Latest · 13 Nov');
    expect(one(el, 'data-trend-end', 'latest').textContent).toContain('495 kg');
    expect(one(el, 'data-trend-change').textContent).toBe('Volume +24% over 4 weeks');
    expect(one(el, 'data-trend-focus').textContent).toBe('Average focus 88');
    const rows = byAttr(el, 'data-history-session');
    expect(rows.map((r) => r.getAttribute('data-history-session'))).toEqual(['s3', 's1']); // newest first
    expect(rows[0]?.textContent).toContain('12×22.5, 10×22.5 kg');
    expect(rows[0]?.textContent).toContain('495 kg volume');
    expect(byAttr(el, 'data-history-exercise')).toHaveLength(0);
    one(el, 'data-history-back').click();
    expect(calls).toEqual(['back']);
    expect(one(el, 'data-tab', 'calendar').getAttribute('aria-current')).toBe('page');
  });

  it('the back button says where it goes back to (M12: Calendar)', () => {
    expect(one(render({ detail: ROW }).el, 'data-history-back').textContent).toBe('History');
    const { el } = render({ detail: ROW, backLabel: 'Calendar' });
    expect(one(el, 'data-history-back').textContent).toBe('Calendar');
  });

  it('bodyweight: reps trend, reps best, no volume, focus explained', () => {
    const { el } = render({ detail: PU });
    expect(one(el, 'data-trend').getAttribute('data-metric')).toBe('reps');
    expect(one(el, 'data-best').textContent).toContain('15reps');
    expect(one(el, 'data-trend-end', 'latest').textContent).toContain('27 reps');
    expect(one(el, 'data-trend-change').textContent).toBe('+5 reps over 4 weeks');
    expect(one(el, 'data-trend-focus').textContent).toContain('No focus score yet');
    const rows = byAttr(el, 'data-history-session');
    expect(rows[0]?.textContent).toContain('15, 12 reps');
    expect(rows[0]?.textContent).toContain('27 reps');
    expect(el.textContent).not.toContain('volume');
  });

  it('one session: nothing to compare yet, one bar', () => {
    const one1 = { ...ROW, sessions: ROW.sessions.slice(1) };
    const { el } = render({ detail: one1 });
    expect(one(el, 'data-trend').byTag('rect')).toHaveLength(1);
    expect(byAttr(el, 'data-trend-end', 'first')).toHaveLength(0);
    expect(one(el, 'data-trend-change').textContent).toContain('Nothing to compare yet');
  });

  it('no sessions in 4 weeks: an empty card and Back', () => {
    const { el } = render({
      detail: {
        ...ROW,
        sessions: [],
        trend: { bestSet: null, volumeChangeKg: null, volumeChangePct: null, avgFocus: null },
      },
    });
    expect(one(el, 'data-history-empty', 'exercise')).toBeTruthy();
    expect(byAttr(el, 'data-trend')).toHaveLength(0);
    expect(byAttr(el, 'data-history-back')).toHaveLength(1);
  });
});
