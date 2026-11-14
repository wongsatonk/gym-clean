// M6 History screen (Track mood: a scoreboard, numbers first). Pure render: data and callbacks
// in, element out. app.ts loads the logs and runs the core selectors in src/core/history.ts
// (`lastDays`, `exercisesWithHistory`, `exerciseHistory`) and passes their results straight in,
// plus `dayName` / `name` lookups. No DB access and no speech here: History is read at rest, never mid-set.
//
// Two views, chosen by `props.detail`:
// - list (detail null/omitted): a 7-day scoreboard (sessions + volume), the "Last 7 days" session
//   list, then "Exercises" as big buttons. Tapping one calls `onOpenExercise(id)`; app.ts loads
//   that exercise's 4 weeks and re-renders with `detail` set.
// - detail: "‹ History" back, the exercise name, its best set as the main number, a bar trend
//   (one bar per session, oldest left) with every value also written as text, the trend lines
//   (volume or reps change, average focus) and the session list, newest first.
//
// Bodyweight exercises (every logged weight 0) trend on total reps instead of volume and show
// sets as "15, 12 reps". Nothing relies on colour alone: the bars carry no meaning that the text
// row under them and the session list don't also say.
//
// e2e hooks: `[data-screen="history"]`, `[data-view="list"|"detail"]`, `[data-week-stat]`
// (sessions|volume), `[data-history-day]` per session row, `[data-history-exercise=<id>]`
// buttons, `[data-history-empty]` (none|week|exercise), `[data-history-state]` (loading|error),
// `[data-history-back]`,
// `[data-best]`, `[data-trend]` (with `data-metric` volume|reps), `[data-trend-change]`,
// `[data-trend-focus]`, `[data-history-session]` rows, and the tab bar (`[data-tab]`).
import '../history.css';
import { formatDuration } from '../../core/format';
import type { DaySession, ExerciseHistory, ExerciseSessionEntry } from '../../core/history';
import { formatWeight, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import { icon } from '../icons';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';
import { dateLabel } from './today';

/** One set as History shows it (`HistorySet` / `Top` from core fit). weightKg 0 = bodyweight. */
export type ShownSet = { reps: number; weightKg: number };

export type HistoryProps = {
  unit: Unit;
  /** `lastDays(sessions, sets, today)`: the last 7 days' finished sessions, newest first. */
  days: readonly DaySession[];
  /**
   * `exercisesWithHistory(sets, today).map((id) => exerciseHistory(sets, id, today))`, with
   * `sets = finishedSets(...)`: one row per exercise, most recently done first.
   */
  exercises: readonly ExerciseHistory[];
  /** `exerciseHistory(sets, id, today)` for the opened exercise; null/omitted shows the list. */
  detail?: ExerciseHistory | null | undefined;
  /** dayId → "Pull A". */
  dayName: (dayId: string) => string;
  /** exerciseId → "Dumbbell Row". */
  name: (exerciseId: string) => string;
  /**
   * The logs are still being read (app.ts: true from opening the tab until the load settles).
   * Shows a neutral "Loading…" card instead of the "No workouts yet" empty state.
   */
  loading?: boolean | undefined;
  /** The load failed: shows "Couldn't load history". Wins over `loading` and any data. */
  error?: boolean | undefined;
};

export type HistoryActions = {
  /** An exercise row was tapped: load its 4 weeks and re-render with `detail`. */
  onOpenExercise: (exerciseId: string) => void;
  /** "‹ History" on the detail view: re-render without `detail`. */
  onBack: () => void;
  onTab: (tab: TabId) => void;
};

// ---------- pure helpers ----------

export const isBodyweight = (sets: readonly ShownSet[]): boolean =>
  sets.every((s) => s.weightKg <= 0);

/** "12 × 22.5 kg" / "15 reps". */
export function setText(s: ShownSet, unit: Unit): string {
  return s.weightKg > 0
    ? `${s.reps} × ${formatWeight(s.weightKg, unit)} ${unit}`
    : `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}`;
}

/** "12×22.5, 10×22.5 kg"; all bodyweight "15, 14, 12 reps". */
export function setsLine(sets: readonly ShownSet[], unit: Unit): string {
  if (sets.length === 0) return '';
  if (isBodyweight(sets)) return `${sets.map((s) => s.reps).join(', ')} reps`;
  return `${sets.map((s) => `${s.reps}×${formatWeight(s.weightKg, unit)}`).join(', ')} ${unit}`;
}

/** A whole number in the display unit with thousands commas. */
export function volumeNum(kg: number, unit: Unit): string {
  return Math.round(toUnit(kg, unit)).toLocaleString('en-US');
}

export const totalReps = (sets: readonly ShownSet[]): number =>
  sets.reduce((n, s) => n + s.reps, 0);

export type TrendSeries = { metric: 'volume' | 'reps'; values: number[] };

/** The bar values, oldest first (as core orders them): volume (display unit), or total reps for bodyweight. */
export function trendSeries(oldestFirst: readonly ExerciseSessionEntry[], unit: Unit): TrendSeries {
  const bw = oldestFirst.every((s) => isBodyweight(s.sets));
  return bw
    ? { metric: 'reps', values: oldestFirst.map((s) => totalReps(s.sets)) }
    : { metric: 'volume', values: oldestFirst.map((s) => Math.round(toUnit(s.volumeKg, unit))) };
}

/** Bar heights in % of the tallest; a non-zero value keeps a visible sliver. */
export function barHeights(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => (v <= 0 ? 0 : Math.max(6, Math.round((v / max) * 100))));
}

export type ChangeLine = { text: string; tone: 'up' | 'flat' | 'down' | 'none' };

/**
 * The trend's change line. Volume uses the selector's %; reps (bodyweight) compares the first
 * and latest session's totals here. Fewer than 2 sessions: nothing to compare yet.
 */
export function changeLine(series: TrendSeries, volumeChangePct: number | null): ChangeLine {
  if (series.values.length < 2)
    return { text: 'First session. Nothing to compare yet.', tone: 'none' };
  const span = 'over 4 weeks';
  if (series.metric === 'volume') {
    if (volumeChangePct === null) return { text: 'No volume change to show', tone: 'none' };
    if (volumeChangePct > 0) return { text: `Volume +${volumeChangePct}% ${span}`, tone: 'up' };
    if (volumeChangePct === 0) return { text: `Volume same ${span}`, tone: 'flat' };
    return { text: `Volume −${-volumeChangePct}% ${span}`, tone: 'down' };
  }
  const d = (series.values[series.values.length - 1] ?? 0) - (series.values[0] ?? 0);
  const word = Math.abs(d) === 1 ? 'rep' : 'reps';
  if (d > 0) return { text: `+${d} ${word} ${span}`, tone: 'up' };
  if (d === 0) return { text: `Reps same ${span}`, tone: 'flat' };
  return { text: `−${-d} ${word} ${span}`, tone: 'down' };
}

/** "13 Nov" for the bar labels. */
export function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
}

// ---------- component ----------

function weekStat(key: string, label: string, value: string, unit?: string): HTMLElement {
  return h(
    'div',
    { class: 'hist-stat', 'data-week-stat': key },
    h('span', { class: 'hist-stat-label caps' }, label),
    h('span', { class: 'hist-stat-value' }, value),
    unit ? h('span', { class: 'hist-stat-unit' }, unit) : null,
  );
}

function emptyCard(kind: string, title: string, body: string, ...extra: HTMLElement[]) {
  return h(
    'div',
    { class: 'hist-empty', 'data-history-empty': kind, role: 'status' },
    h('p', { class: 'hist-empty-title' }, title),
    h('p', { class: 'hist-empty-body' }, body),
    ...extra,
  );
}

/** Loading / load-failed card: same shape as the empty card, but its own hook so e2e and tests
 * can tell "still reading" and "failed" apart from "nothing logged". */
function stateCard(props: HistoryProps, actions: HistoryActions): HTMLElement | null {
  if (props.error) {
    return h(
      'div',
      { class: 'hist-empty', 'data-history-state': 'error', role: 'alert' },
      h('p', { class: 'hist-empty-title' }, "Couldn't load history"),
      h(
        'p',
        { class: 'hist-empty-body' },
        'Your sets are still saved. Open History again to retry.',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ghost-btn wide-btn hist-empty-btn',
          onclick: () => actions.onTab('today'),
        },
        'Go to Today',
      ),
    );
  }
  if (props.loading) {
    return h(
      'div',
      { class: 'hist-empty', 'data-history-state': 'loading', role: 'status', 'aria-busy': 'true' },
      h('p', { class: 'hist-empty-title' }, 'Loading…'),
    );
  }
  return null;
}

function focusBadge(focus: number | null): HTMLElement | null {
  if (focus === null) return null;
  return h(
    'span',
    { class: 'hist-focus', 'data-focus': focus },
    h('span', { class: 'hist-focus-num' }, String(Math.round(focus))),
    h('span', { class: 'hist-focus-lbl' }, 'focus'),
  );
}

function dayRow(d: DaySession, unit: Unit, dayName: string): HTMLElement {
  const n = d.exercises.length;
  const bits = [
    `${d.setCount} ${d.setCount === 1 ? 'set' : 'sets'}`,
    `${n} ${n === 1 ? 'exercise' : 'exercises'}`,
    d.volumeKg > 0 ? `${volumeNum(d.volumeKg, unit)} ${unit}` : 'bodyweight',
  ];
  return h(
    'li',
    { class: 'hist-day', 'data-history-day': d.sessionId },
    h(
      'div',
      { class: 'hist-day-head' },
      h('span', { class: 'hist-day-name' }, dayName),
      focusBadge(d.avgFocus),
    ),
    h(
      'p',
      { class: 'hist-day-when' },
      `${dateLabel(d.startedAt)} · ${formatDuration(d.durationMs / 1000)}`,
    ),
    h('p', { class: 'hist-day-stats' }, bits.join(' · ')),
  );
}

function exerciseButton(
  ex: ExerciseHistory,
  name: string,
  unit: Unit,
  onOpen: (id: string) => void,
): HTMLElement {
  const n = ex.sessions.length;
  const last = ex.sessions[n - 1];
  const best = ex.trend.bestSet;
  const meta = [
    last ? `Last ${dateLabel(last.date)}` : null,
    `${n} ${n === 1 ? 'session' : 'sessions'}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return h(
    'li',
    {},
    h(
      'button',
      {
        type: 'button',
        class: 'hist-ex',
        'data-history-exercise': ex.exerciseId,
        onclick: () => onOpen(ex.exerciseId),
      },
      h(
        'span',
        { class: 'hist-ex-text' },
        h('span', { class: 'hist-ex-name' }, name),
        h('span', { class: 'hist-ex-meta' }, meta),
      ),
      best ? h('span', { class: 'hist-ex-top' }, setText(best, unit)) : null,
      h('span', { class: 'hist-ex-go', 'aria-hidden': 'true' }, icon('back', 'md')),
    ),
  );
}

function listView(props: HistoryProps, actions: HistoryActions): HTMLElement[] {
  const noHistory = props.days.length === 0 && props.exercises.length === 0;
  if (noHistory) {
    return [
      emptyCard(
        'none',
        'No workouts yet',
        'Finish a workout and your sets show up here: weights, reps and focus, week by week.',
        h(
          'button',
          {
            type: 'button',
            class: 'ghost-btn wide-btn hist-empty-btn',
            onclick: () => actions.onTab('today'),
          },
          'Go to Today',
        ),
      ),
    ];
  }
  const sessions = props.days.length;
  const volume = props.days.reduce((n, d) => n + d.volumeKg, 0);
  const out: HTMLElement[] = [
    h(
      'section',
      { class: 'hist-section', 'aria-labelledby': 'hist-week' },
      h('h2', { class: 'hist-head caps', id: 'hist-week' }, 'Last 7 days'),
      h(
        'div',
        { class: 'hist-stats' },
        weekStat('sessions', 'Sessions', String(sessions)),
        weekStat('volume', 'Volume', volumeNum(volume, props.unit), props.unit),
      ),
      sessions > 0
        ? h(
            'ul',
            { class: 'hist-days' },
            ...props.days.map((d) => dayRow(d, props.unit, props.dayName(d.dayId))),
          )
        : emptyCard('week', 'Nothing in the last 7 days', 'Your older sessions are below.'),
    ),
  ];
  out.push(
    h(
      'section',
      { class: 'hist-section', 'aria-labelledby': 'hist-ex' },
      h('h2', { class: 'hist-head caps', id: 'hist-ex' }, 'Exercises'),
      h('p', { class: 'hist-sub' }, 'Last 4 weeks. Tap one for its trend.'),
      h(
        'ul',
        { class: 'hist-exercises' },
        ...props.exercises.map((e) =>
          exerciseButton(e, props.name(e.exerciseId), props.unit, actions.onOpenExercise),
        ),
      ),
    ),
  );
  return out;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The bar trend: SVG bars (decorative) over an HTML row of the same values as text. */
function trendChart(series: TrendSeries, dates: number[], unit: Unit): HTMLElement {
  const heights = barHeights(series.values);
  const n = heights.length;
  const W = 100;
  const H = 40;
  const gap = n > 1 ? 2 : 0;
  const bw = Math.min(16, (W - gap * (n - 1)) / Math.max(1, n));
  const x0 = (W - (bw * n + gap * (n - 1))) / 2;
  const svg = svgEl('svg', {
    class: 'hist-bars',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(svgEl('line', { class: 'hist-bars-base', x1: 0, y1: H, x2: W, y2: H }));
  heights.forEach((p, i) => {
    const bh = (p / 100) * (H - 2);
    svg.append(
      svgEl('rect', {
        class: i === n - 1 ? 'hist-bar latest' : 'hist-bar',
        x: (x0 + i * (bw + gap)).toFixed(2),
        y: (H - bh).toFixed(2),
        width: bw.toFixed(2),
        height: bh.toFixed(2),
        rx: 0.8,
      }),
    );
  });
  const unitWord = series.metric === 'volume' ? unit : 'reps';
  // Every value is in the session list below; under the bars, the first and latest as text so
  // the trend reads without the bars (and without colour).
  const end = (which: 'first' | 'latest', i: number) =>
    h(
      'span',
      { class: `hist-end hist-end-${which}`, 'data-trend-end': which },
      h(
        'span',
        { class: 'hist-end-date' },
        which === 'latest' ? `Latest · ${shortDate(dates[i] ?? 0)}` : shortDate(dates[i] ?? 0),
      ),
      h(
        'span',
        { class: 'hist-end-num' },
        `${(series.values[i] ?? 0).toLocaleString('en-US')} ${unitWord}`,
      ),
    );
  const values = h(
    'div',
    { class: 'hist-ends' },
    n > 1 ? end('first', 0) : null,
    end('latest', n - 1),
  );
  return h(
    'figure',
    { class: 'hist-trend', 'data-trend': true, 'data-metric': series.metric },
    h(
      'figcaption',
      { class: 'hist-head caps' },
      series.metric === 'volume' ? `Volume per session (${unitWord})` : 'Reps per session',
    ),
    svg,
    values,
  );
}

function sessionRow(s: ExerciseSessionEntry, unit: Unit, bodyweight: boolean): HTMLElement {
  const total = bodyweight
    ? `${totalReps(s.sets)} reps total`
    : `${volumeNum(s.volumeKg, unit)} ${unit} volume`;
  return h(
    'li',
    { class: 'hist-session', 'data-history-session': s.sessionId },
    h(
      'div',
      { class: 'hist-day-head' },
      h('span', { class: 'hist-session-date' }, dateLabel(s.date)),
      focusBadge(s.avgFocus),
    ),
    h('p', { class: 'hist-session-sets' }, setsLine(s.sets, unit)),
    h('p', { class: 'hist-day-stats' }, total),
  );
}

function detailView(
  d: ExerciseHistory,
  name: string,
  unit: Unit,
  actions: HistoryActions,
): (HTMLElement | null)[] {
  const back = h(
    'button',
    { type: 'button', class: 'hist-back', 'data-history-back': true, onclick: actions.onBack },
    icon('back', 'md'),
    h('span', {}, 'History'),
  );
  const title = h('h1', { class: 'page-title hist-title' }, name);
  if (d.sessions.length === 0) {
    return [
      back,
      title,
      emptyCard(
        'exercise',
        'No sets in the last 4 weeks',
        'Do this exercise and its trend starts here.',
      ),
    ];
  }
  const series = trendSeries(d.sessions, unit);
  const bodyweight = series.metric === 'reps';
  const change = changeLine(series, d.trend.volumeChangePct);
  const best = d.trend.bestSet;
  const bestBlock = best
    ? h(
        'div',
        { class: 'hist-best', 'data-best': true },
        h('span', { class: 'hist-stat-label caps' }, 'Best set · 4 weeks'),
        h(
          'span',
          { class: 'hist-best-num' },
          best.weightKg > 0
            ? `${best.reps} × ${formatWeight(best.weightKg, unit)}`
            : String(best.reps),
        ),
        h('span', { class: 'hist-stat-unit' }, best.weightKg > 0 ? `reps × ${unit}` : 'reps'),
      )
    : null;
  const dates = d.sessions.map((s) => s.date);
  return [
    back,
    title,
    bestBlock,
    trendChart(series, dates, unit),
    h(
      'ul',
      { class: 'hist-trend-lines' },
      h(
        'li',
        { class: 'hist-change', 'data-trend-change': change.tone },
        icon('trend', 'md'),
        h('span', {}, change.text),
      ),
      h(
        'li',
        { class: 'hist-change', 'data-trend-focus': d.trend.avgFocus ?? '' },
        icon('flag', 'md'),
        h(
          'span',
          {},
          d.trend.avgFocus !== null
            ? `Average focus ${Math.round(d.trend.avgFocus)}`
            : 'No focus score yet (camera sets only)',
        ),
      ),
    ),
    h(
      'section',
      { class: 'hist-section', 'aria-labelledby': 'hist-sessions' },
      h('h2', { class: 'hist-head caps', id: 'hist-sessions' }, 'Sessions'),
      h(
        'ul',
        { class: 'hist-days' },
        ...[...d.sessions].reverse().map((s) => sessionRow(s, unit, bodyweight)),
      ),
    ),
  ];
}

export function historyScreen(props: HistoryProps, actions: HistoryActions): HTMLElement {
  const state = stateCard(props, actions);
  const detail = state ? null : (props.detail ?? null);
  const body: (HTMLElement | null)[] = state
    ? [h('h1', { class: 'page-title' }, 'History'), state]
    : detail
      ? detailView(detail, props.name(detail.exerciseId), props.unit, actions)
      : [h('h1', { class: 'page-title' }, 'History'), ...listView(props, actions)];
  return h(
    'main',
    {
      class: `screen history has-tabbar ${moodClass('track')}`,
      'data-screen': 'history',
      'data-view': detail ? 'detail' : 'list',
    },
    ...body,
    tabBar('history', actions.onTab),
  );
}
