// M12 slice 1b task 28: the estimated one-rep-max chart in an exercise's history (SPEC M12
// "Trainer kit" item 4). Pure render: core's series in (one point per session: the best estimate
// of its non-warm-up sets of 12 reps or fewer, lighter / deload sessions flagged), element out.
// No math here beyond layout and formatting.
//
// Our own SVG (original art): a line through one mark per session, oldest left. Nothing is told
// by colour alone:
// - the summary is written out above the chart ("Best estimate 72 kg on 12 Nov", then the latest)
//   and is the chart's accessible name;
// - marks differ by shape: a filled dot, a ring around the best, a hollow dot for a lighter day,
//   each named in the legend;
// - values are written at the marks (all of them up to 4 sessions; otherwise the best, the latest
//   and the first, skipping a label that would touch another) and the two end dates under them.
//
// Empty (no chartable set yet) and one-point states are plain sentences. An estimate from logged
// sets, never a tested max or a promise: the note says so.
//
// e2e hooks: `[data-e1rm]` (data-state empty|one|line), `[data-e1rm-summary]`,
// `[data-e1rm-chart]` (role="img"), `.e1-dot` per session (`data-best`, `data-lighter`),
// `.e1-val` labels, `[data-e1rm-legend]`.
import { formatWeight, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import './e1rmChart.css';

/** One session of a lift, as core's e1RM series gives it. */
export type E1rmPoint = {
  /** The session's day: epoch ms or a local YYYY-MM-DD. */
  date: number | string;
  /** The session's best estimated one-rep max, in kg. */
  e1rmKg: number;
  /** A lighter / deload session (marked, and left out of nothing). */
  lighter?: boolean | undefined;
};

export type E1rmChartProps = {
  unit: Unit;
  /** Oldest first. */
  points: readonly E1rmPoint[];
};

// ---------- pure helpers ----------

/** "12 Nov" for either date form. */
export function e1rmDate(date: number | string): string {
  let d: Date;
  if (typeof date === 'number') d = new Date(date);
  else {
    const [y, m, day] = date.split('-').map(Number);
    d = new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1);
  }
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/** Index of the best estimate (the latest one on a tie); -1 when empty. */
export function bestIndex(points: readonly E1rmPoint[]): number {
  let best = -1;
  points.forEach((p, i) => {
    if (best < 0 || p.e1rmKg >= (points[best]?.e1rmKg ?? 0)) best = i;
  });
  return best;
}

export type E1rmSummary = {
  /** "Best estimate 72 kg on 12 Nov". */
  best: string;
  /** "Latest 70 kg on 14 Nov"; null when the latest is the best. */
  latest: string | null;
  /** "1 lighter day is marked." / null. */
  lighter: string | null;
};

/** The chart in words. null with no points. */
export function e1rmSummary(points: readonly E1rmPoint[], unit: Unit): E1rmSummary | null {
  const bi = bestIndex(points);
  const best = points[bi];
  const last = points[points.length - 1];
  if (!best || !last) return null;
  const val = (p: E1rmPoint) => `${formatWeight(p.e1rmKg, unit)} ${unit}`;
  const n = points.filter((p) => p.lighter).length;
  return {
    best: `Best estimate ${val(best)} on ${e1rmDate(best.date)}`,
    latest: bi === points.length - 1 ? null : `Latest ${val(last)} on ${e1rmDate(last.date)}`,
    lighter:
      n === 0 ? null : n === 1 ? '1 lighter day is marked.' : `${n} lighter days are marked.`,
  };
}

/** The summary as one sentence run (the chart's accessible name). */
export function e1rmSummaryText(points: readonly E1rmPoint[], unit: Unit): string {
  const s = e1rmSummary(points, unit);
  if (!s) return E1RM_EMPTY;
  return [`${s.best}.`, s.latest ? `${s.latest}.` : null, s.lighter].filter(Boolean).join(' ');
}

export const E1RM_EMPTY = 'No estimate yet. It starts with a weighted set of 12 reps or fewer.';
export const E1RM_ONE = 'First estimate. The line starts with your next session.';
export const E1RM_NOTE =
  "From each session's top set of 12 reps or fewer, warm-ups left out. An estimate, not a tested max.";

// 320 wide: the card's inner width at 390px is 328px, so the 22px chart text never drops under 20px.
export const E1RM_CHART = { w: 320, h: 234, padX: 30, padT: 46, padB: 66 } as const;
/** Value labels closer than this (px on the x axis) would touch: the lower-priority one is dropped. */
const LABEL_GAP = 72;

export type E1rmMark = {
  cx: number;
  cy: number;
  /** The value in the display unit, "72.5". */
  value: string;
  best: boolean;
  lighter: boolean;
  /** Whether the value is written at the mark. */
  labelled: boolean;
  /** The value goes under the mark (a dip: above it would sit on the line). */
  below: boolean;
  anchor: 'start' | 'middle' | 'end';
};

export type E1rmGeometry = {
  marks: E1rmMark[];
  /** '' with one point. */
  path: string;
  xFirst: string;
  xLast: string;
};

/** Pure: lays the series out in the chart box. null with no points. */
export function e1rmGeometry(points: readonly E1rmPoint[], unit: Unit): E1rmGeometry | null {
  const n = points.length;
  const first = points[0];
  const last = points[n - 1];
  if (!first || !last) return null;
  const vals = points.map((p) => toUnit(p.e1rmKg, unit));
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  // At least 5 units of range, so a steady month doesn't look like a mountain.
  const pad = Math.max(2.5 - (hi - lo) / 2, (hi - lo) * 0.12);
  lo -= pad;
  hi += pad;
  const x0 = E1RM_CHART.padX;
  const x1 = E1RM_CHART.w - E1RM_CHART.padX;
  const y0 = E1RM_CHART.padT;
  const y1 = E1RM_CHART.h - E1RM_CHART.padB;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const x = (i: number) => (n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0));
  const y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  const bi = bestIndex(points);
  const marks: E1rmMark[] = points.map((p, i) => ({
    cx: r1(x(i)),
    cy: r1(y(vals[i] ?? 0)),
    value: formatWeight(p.e1rmKg, unit),
    best: i === bi,
    lighter: p.lighter === true,
    labelled: false,
    below: false,
    anchor: n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
  }));
  // A dip between two higher sessions: its value reads under the mark, clear of the line.
  marks.forEach((m, i) => {
    const prev = marks[i - 1];
    const next = marks[i + 1];
    m.below = prev !== undefined && next !== undefined && m.cy > prev.cy && m.cy > next.cy;
  });
  // Which values are written: all up to 4 sessions; else best, latest, first, without touching.
  const order = n <= 4 ? marks.map((_, i) => i) : [bi, n - 1, 0];
  const taken: number[] = [];
  for (const i of order) {
    const m = marks[i];
    if (!m || m.labelled) continue;
    if (n > 4 && taken.some((cx) => Math.abs(cx - m.cx) < LABEL_GAP)) continue;
    m.labelled = true;
    taken.push(m.cx);
  }
  return {
    marks,
    path: n < 2 ? '' : marks.map((m, i) => `${i ? 'L' : 'M'}${m.cx} ${m.cy}`).join(' '),
    xFirst: e1rmDate(first.date),
    xLast: e1rmDate(last.date),
  };
}

// ---------- component ----------

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag: string, attrs: Record<string, string | number>, text?: string): Element {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function legend(hasLighter: boolean): HTMLElement {
  const key = (cls: string, word: string) => [
    h('span', { class: `e1-key ${cls}`, 'aria-hidden': 'true' }),
    h('span', {}, word),
  ];
  return h(
    'p',
    { class: 'e1-legend', 'data-e1rm-legend': true },
    ...key('e1-key-dot', 'Session'),
    ...key('e1-key-best', 'Best'),
    ...(hasLighter ? key('e1-key-lighter', 'Lighter day') : []),
  );
}

/** The e1RM card for one lift. Always renders (an empty series is a sentence, not a blank). */
export function e1rmChart(p: E1rmChartProps): HTMLElement {
  const title = h(
    'figcaption',
    { class: 'hist-head caps e1-title' },
    `Estimated 1-rep max (${p.unit})`,
  );
  const g = e1rmGeometry(p.points, p.unit);
  const s = e1rmSummary(p.points, p.unit);
  if (!g || !s) {
    return h(
      'figure',
      { class: 'e1', 'data-e1rm': true, 'data-state': 'empty' },
      title,
      h('p', { class: 'e1-empty' }, E1RM_EMPTY),
    );
  }
  const one = p.points.length === 1;
  const root = svg('svg', {
    class: 'e1-chart',
    viewBox: `0 0 ${E1RM_CHART.w} ${E1RM_CHART.h}`,
    role: 'img',
    'aria-label': e1rmSummaryText(p.points, p.unit),
    'data-e1rm-chart': 'true',
  });
  const yBase = E1RM_CHART.h - 28;
  root.append(
    svg('line', {
      class: 'e1-base',
      x1: E1RM_CHART.padX - 16,
      x2: E1RM_CHART.w - E1RM_CHART.padX + 16,
      y1: yBase,
      y2: yBase,
    }),
  );
  if (g.path) root.append(svg('path', { class: 'e1-line', d: g.path }));
  for (const m of g.marks) {
    if (m.best) root.append(svg('circle', { class: 'e1-ring', cx: m.cx, cy: m.cy, r: 12 }));
    const dot = svg('circle', {
      class: m.lighter ? 'e1-dot e1-dot-lighter' : 'e1-dot',
      cx: m.cx,
      cy: m.cy,
      r: 6,
    });
    if (m.best) dot.setAttribute('data-best', 'true');
    if (m.lighter) dot.setAttribute('data-lighter', 'true');
    root.append(dot);
  }
  for (const m of g.marks) {
    if (!m.labelled) continue;
    const dx = m.anchor === 'start' ? -14 : m.anchor === 'end' ? 14 : 0;
    root.append(
      svg(
        'text',
        {
          class: 'e1-val',
          x: m.cx + dx,
          y: m.below ? m.cy + 32 : m.cy - 20,
          'text-anchor': m.anchor,
        },
        m.value,
      ),
    );
  }
  const yDate = E1RM_CHART.h - 5;
  if (one) {
    root.append(
      svg(
        'text',
        { class: 'e1-axis', x: E1RM_CHART.w / 2, y: yDate, 'text-anchor': 'middle' },
        g.xFirst,
      ),
    );
  } else {
    root.append(
      svg(
        'text',
        { class: 'e1-axis', x: E1RM_CHART.padX - 16, y: yDate, 'text-anchor': 'start' },
        g.xFirst,
      ),
    );
    root.append(
      svg(
        'text',
        {
          class: 'e1-axis',
          x: E1RM_CHART.w - E1RM_CHART.padX + 16,
          y: yDate,
          'text-anchor': 'end',
        },
        g.xLast,
      ),
    );
  }
  return h(
    'figure',
    { class: 'e1', 'data-e1rm': true, 'data-state': one ? 'one' : 'line' },
    title,
    h(
      'div',
      { class: 'e1-summary', 'data-e1rm-summary': true },
      h('p', { class: 'e1-best' }, s.best),
      s.latest ? h('p', { class: 'e1-latest' }, s.latest) : null,
      one ? h('p', { class: 'e1-latest' }, E1RM_ONE) : null,
    ),
    root as unknown as HTMLElement,
    legend(p.points.some((pt) => pt.lighter)),
    h('p', { class: 'e1-note' }, E1RM_NOTE),
  );
}
