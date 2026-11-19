// M7 task 15: the Weigh-in screen (SPEC M7 "Weigh-in", "Weekly adjustment loop", M7-q2, M7-q10).
// Props in, callbacks out: the app passes core results as they come — `trend(...)` (core
// `TrendPoint[]`, src/core/nutrition/adjust.ts), `weeklyCheck(...)` and `nutritionHistory(...)`
// (core `HistoryDay[]`, src/core/nutrition/day.ts, oldest first; shown newest first here) — and
// saves what comes back. No DB, no core math here beyond display.
//
// Order: header (Back, title) → the weekly suggestion card while it's pending (it's the thing to
// act on) → the kg/lb stepper + Save → our own SVG trend chart (daily dots + the 7-day average
// line) → nutrition history for the last 14 days with training days marked.
//
// The card never applies anything by itself (SPEC): Accept / Not now for a change, "Got it" for
// on track, need-more-data, and an up/down where core `checkHasChange(check)` is false (the
// target is already at its limit, so there is nothing to accept: an info card,
// `data-change="none"`). Accept shows only when `checkHasChange` is true.
// Copy is coaching language only, no weight-loss or health claims.
//
// e2e hooks: `main[data-screen="weigh-in"]`, `[data-field="weigh-in"] .nf-value`,
// `[data-weigh-save]`, `[data-weekly-card]` (data-kind up|down|onTrack|needData),
// `[data-weekly-accept]`, `[data-weekly-dismiss]`, `[data-trend-chart]` with `.wc-dot` and
// `.wc-avg`, `[data-fuel-history]` li `[data-day=YYYY-MM-DD]` (data-trained).
//
// M11 (optional): `[data-from-health]` tag when today's weigh-in was imported from Apple Health,
// and the activity-level line (`[data-activity-suggest]`, Switch `[data-activity-switch]` /
// Keep `[data-activity-keep]`) inside the weekly card, or as its own card when no check is
// pending. It only asks; nothing changes until Switch.
//
// M12 slice 1b (optional): body fat % and lean mass from Apple Health as their own small trends
// under the weight trend (`[data-body-comp]`, one `[data-comp="bodyFat"|"leanMass"]` card each
// with `[data-comp-now]`, `[data-comp-change]` and `[data-comp-chart]`). Shown only when
// `bodyComp` has a value; plain numbers, no score and no judgement on them. These values stay
// out of every coach context (the app never passes them anywhere but here).
import { checkHasChange, type TrendPoint } from '../../core/nutrition/adjust';
import type { HistoryDay } from '../../core/nutrition/day';
import type { WeeklyCheck } from '../../core/types';
import { formatWeight, fromUnit, toUnit, type Unit } from '../../core/units';
import { h } from '../dom';
import { icon } from '../icons';
import { dateLabel } from '../screens/today';
import { moodClass } from '../tokens';
import { estimateTag, fromHealthTag } from './common';
import { numberField } from './fields';
import { targetText } from './nutritionSettings';
import { ACTIVITY_CHOICES, weightStep, type Activity } from './setup';
import './weighIn.css';

export type WeighInProps = {
  unit: Unit;
  /** Today's weigh-in (kg), if already saved. */
  todayKg: number | null;
  /** The latest weigh-in before today (kg): the stepper starts here. */
  lastKg: number | null;
  /** Core `trend(...)`, oldest first: one point per day (kg / avgKg null on gaps). */
  trend: readonly TrendPoint[];
  /** The current weekly check; shown only while `outcome === 'pending'`. */
  check: WeeklyCheck | null;
  /** Today's calorie target, to show what Accept changes it to. */
  kcalTarget: number | null;
  /** Core `nutritionHistory(...)` for the last 14 days, oldest first (shown newest first). */
  history: readonly HistoryDay[];
  /** M11: where today's weigh-in came from; 'health' shows the "from Health" tag. */
  todaySource?: 'manual' | 'health' | undefined;
  /** M11-q8: core's activity-level check (current level + the one Health suggests), or null. */
  activity?: ActivitySuggestion | null | undefined;
  /**
   * M12 1b: Health days with a body fat % and / or lean mass (any order; `HealthDay` rows fit).
   * Omitted or without values: the section isn't drawn.
   */
  bodyComp?: readonly BodyCompPoint[] | undefined;
};

/** One day's body composition from Health (the fields of core `HealthDay` this screen reads). */
export type BodyCompPoint = {
  date: string;
  /** Percent, 0–100. */
  bodyFatPct?: number | undefined;
  leanMassKg?: number | undefined;
};

/** M11-q8: the M7 activity level now and the one his 14-day active energy fits. */
export type ActivitySuggestion = { current: Activity; suggested: Activity };

export type WeighInActions = {
  onBack: () => void;
  /** kg, today. Saving again replaces today's (M7-q10). */
  onSave: (kg: number) => void;
  onAccept: () => void;
  onDismiss: () => void;
  /** M11-q8: Switch to the suggested activity level. Needed (with onKeepActivity) to show it. */
  onSwitchActivity?: ((level: Activity) => void) | undefined;
  /** M11-q8: Keep the current level (don't ask again for this check). */
  onKeepActivity?: (() => void) | undefined;
};

// ---------- pure helpers ----------

/** "up 0.4%" / "down 0.2%" / "no change". */
export function rateText(ratePct: number): string {
  const r = Math.round(Math.abs(ratePct) * 100) / 100;
  if (r === 0) return 'no change';
  return `${ratePct > 0 ? 'up' : 'down'} ${r}%`;
}

export type CardCopy = {
  title: string;
  body: string;
  /** "New target: 2,800 kcal a day (was 2,650)." for up/down with a target. */
  change: string | null;
  accept: string | null;
  dismiss: string;
};

/** The weekly card's words for each kind. Pure. */
export function weeklyCardCopy(c: WeeklyCheck, unit: Unit, kcalTarget: number | null): CardCopy {
  const avg =
    c.avgKg !== null && c.prevAvgKg !== null && c.ratePct !== null
      ? `Last week's average was ${formatWeight(c.avgKg, unit)} ${unit}, ${rateText(c.ratePct)} from ${formatWeight(c.prevAvgKg, unit)} ${unit} the week before.`
      : '';
  if ((c.kind === 'up' || c.kind === 'down') && !checkHasChange(c)) {
    // Already at the limit (maintenance floor / top of the surplus range): nothing to accept.
    const why =
      c.kind === 'down'
        ? 'Gaining a bit faster than your plan. Your target is already at maintenance, so it stays the same.'
        : 'Gaining slower than your plan. Your target is already at the top of its range, so it stays the same.';
    return {
      title: 'Your target stays the same',
      body: `${avg} ${why}`.trim(),
      change: null,
      accept: null,
      dismiss: 'Got it',
    };
  }
  const change =
    kcalTarget !== null && checkHasChange(c)
      ? `New target: ${targetText(kcalTarget + c.deltaKcal)} kcal a day (was ${targetText(kcalTarget)}).`
      : null;
  switch (c.kind) {
    case 'up':
      return {
        title: `Add ${c.deltaKcal} kcal a day?`,
        body: `${avg} That's slower than your plan.`.trim(),
        change,
        accept: 'Accept',
        dismiss: 'Not now',
      };
    case 'down':
      return {
        title: `Eat ${Math.abs(c.deltaKcal)} kcal a day less?`,
        body: `${avg} That's faster than your plan.`.trim(),
        change,
        accept: 'Accept',
        dismiss: 'Not now',
      };
    case 'onTrack':
      return {
        title: 'On track this week',
        body: `${avg} Keep your targets as they are.`.trim(),
        change: null,
        accept: null,
        dismiss: 'Got it',
      };
    case 'needData':
      return {
        title: 'Need more weigh-ins',
        body: 'The weekly check needs at least 4 weigh-ins in each week. Nothing was changed.',
        change: null,
        accept: null,
        dismiss: 'Got it',
      };
  }
}

/** Whole days since 1970 for a YYYY-MM-DD (UTC, so DST never shifts a point). */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

export const CHART = { w: 358, h: 190, padL: 58, padR: 12, padT: 14, padB: 30 } as const;

export type ChartGeometry = {
  dots: { cx: number; cy: number; date: string }[];
  /** SVG path for the 7-day average, '' with fewer than 2 points. */
  avgPath: string;
  /** Top and bottom gridline labels in the display unit. */
  yTop: { y: number; label: string };
  yBottom: { y: number; label: string };
  xFirst: string;
  xLast: string;
};

type Pt = { date: string; kg: number };

/** Pure: lays the trend out in the chart box. null with fewer than 2 weigh-in days. */
export function chartGeometry(trend: readonly TrendPoint[], unit: Unit): ChartGeometry | null {
  const daily: Pt[] = [];
  const avg: Pt[] = [];
  for (const p of trend) {
    if (p.kg !== null) daily.push({ date: p.date, kg: p.kg });
    if (p.avgKg !== null) avg.push({ date: p.date, kg: p.avgKg });
  }
  if (daily.length < 2) return null;
  const all = [...daily, ...avg];
  const days = all.map((p) => dayNumber(p.date));
  const d0 = Math.min(...days);
  const d1 = Math.max(...days);
  const vals = all.map((p) => toUnit(p.kg, unit));
  // At least 1 unit of range, so a flat week doesn't blow up tiny changes.
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  lo = Math.floor((lo - pad) * 2) / 2;
  hi = Math.ceil((hi + pad) * 2) / 2;
  const x0 = CHART.padL;
  const x1 = CHART.w - CHART.padR;
  const y0 = CHART.padT;
  const y1 = CHART.h - CHART.padB;
  const x = (date: string) =>
    d1 === d0 ? (x0 + x1) / 2 : x0 + ((dayNumber(date) - d0) / (d1 - d0)) * (x1 - x0);
  const y = (kg: number) => y1 - ((toUnit(kg, unit) - lo) / (hi - lo)) * (y1 - y0);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const dots = daily.map((p) => ({ cx: r1(x(p.date)), cy: r1(y(p.kg)), date: p.date }));
  const avgPath =
    avg.length < 2
      ? ''
      : avg.map((p, i) => `${i ? 'L' : 'M'}${r1(x(p.date))} ${r1(y(p.kg))}`).join(' ');
  const label = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const first = all.reduce((a, b) => (a.date < b.date ? a : b)).date;
  const last = all.reduce((a, b) => (a.date > b.date ? a : b)).date;
  return {
    dots,
    avgPath,
    yTop: { y: y0, label: label(hi) },
    yBottom: { y: y1, label: label(lo) },
    xFirst: shortDate(first),
    xLast: shortDate(last),
  };
}

/** "3 Nov" for a YYYY-MM-DD. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return `${dt.getDate()} ${dt.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/** "Mon 2 Nov" for a YYYY-MM-DD. */
function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return dateLabel(new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime());
}

// ---------- M12 1b: body composition (pure) ----------

export type CompKind = 'bodyFat' | 'leanMass';
/** One reading in the unit it is shown in (%, kg or lb). */
export type CompReading = { date: string; value: number };

/** A kind's readings, oldest first, in the display unit (lean mass follows his weight unit). */
export function compSeries(
  points: readonly BodyCompPoint[],
  kind: CompKind,
  unit: Unit,
): CompReading[] {
  const out: CompReading[] = [];
  for (const p of points) {
    const raw = kind === 'bodyFat' ? p.bodyFatPct : p.leanMassKg;
    if (raw === undefined || !Number.isFinite(raw)) continue;
    out.push({ date: p.date, value: kind === 'bodyFat' ? raw : toUnit(raw, unit) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

const comp1 = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

/** "18.4" for the big number. */
export function compNow(series: readonly CompReading[]): string | null {
  const last = series[series.length - 1];
  return last ? comp1(last.value) : null;
}

/** "down 0.6 % since 3 Nov" / "same as 3 Nov" / "First reading, 14 Nov". Plain, no judgement. */
export function compChange(series: readonly CompReading[], unitWord: string): string | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) return null;
  if (series.length < 2) return `First reading, ${shortDate(last.date)}`;
  const d = Math.round((last.value - first.value) * 10) / 10;
  if (d === 0) return `same as ${shortDate(first.date)}`;
  return `${d > 0 ? 'up' : 'down'} ${comp1(Math.abs(d))} ${unitWord} since ${shortDate(first.date)}`;
}

// 340 wide: the card is 356px at 390px, so the 20px chart text never renders under 20px.
export const COMP_CHART = { w: 340, h: 150, padL: 62, padR: 14, padT: 16, padB: 34 } as const;

export type CompGeometry = {
  dots: { cx: number; cy: number; date: string }[];
  path: string;
  yTop: { y: number; label: string };
  yBottom: { y: number; label: string };
  xFirst: string;
  xLast: string;
};

/** Pure: a small line chart of the readings. null with fewer than 2. */
export function compGeometry(series: readonly CompReading[]): CompGeometry | null {
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last || series.length < 2) return null;
  const d0 = dayNumber(first.date);
  const d1 = dayNumber(last.date);
  const vals = series.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  // At least 1 unit of range, so a flat fortnight doesn't blow up tiny changes.
  const pad = Math.max(0.5, (hi - lo) * 0.1);
  lo = Math.floor((lo - pad) * 2) / 2;
  hi = Math.ceil((hi + pad) * 2) / 2;
  const x0 = COMP_CHART.padL;
  const x1 = COMP_CHART.w - COMP_CHART.padR;
  const y0 = COMP_CHART.padT;
  const y1 = COMP_CHART.h - COMP_CHART.padB;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const x = (date: string) =>
    d1 === d0 ? (x0 + x1) / 2 : x0 + ((dayNumber(date) - d0) / (d1 - d0)) * (x1 - x0);
  const y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
  const dots = series.map((p) => ({ cx: r1(x(p.date)), cy: r1(y(p.value)), date: p.date }));
  return {
    dots,
    path: dots.map((d, i) => `${i ? 'L' : 'M'}${d.cx} ${d.cy}`).join(' '),
    yTop: { y: y0, label: comp1(hi) },
    yBottom: { y: y1, label: comp1(lo) },
    xFirst: shortDate(first.date),
    xLast: shortDate(last.date),
  };
}

const COMP_COPY: Record<CompKind, { label: string }> = {
  bodyFat: { label: 'Body fat' },
  leanMass: { label: 'Lean mass' },
};
export const BODY_COMP_NOTE = 'From Apple Health. Kept on this phone only.';

const ACTIVITY_ORDER: readonly Activity[] = ACTIVITY_CHOICES.map((c) => c.value);
const activityLabel = (a: Activity) => ACTIVITY_CHOICES.find((c) => c.value === a)?.label ?? a;

/** "Health shows more activity than “Lightly active”. Switch to “Active”?" (null when equal). */
export function activityLine(s: ActivitySuggestion): string | null {
  const from = ACTIVITY_ORDER.indexOf(s.current);
  const to = ACTIVITY_ORDER.indexOf(s.suggested);
  if (from === to || from < 0 || to < 0) return null;
  const more = to > from ? 'more' : 'less';
  return `Health shows ${more} activity than “${activityLabel(s.current)}”. Switch to “${activityLabel(s.suggested)}”?`;
}

// ---------- parts ----------

function activityBlock(p: WeighInProps, a: WeighInActions): HTMLElement | null {
  const s = p.activity;
  const { onSwitchActivity, onKeepActivity } = a;
  if (!s || !onSwitchActivity || !onKeepActivity) return null;
  const line = activityLine(s);
  if (!line) return null;
  return h(
    'div',
    { class: 'wi-activity', 'data-activity-suggest': s.suggested },
    h('p', { class: 'wi-activity-text' }, line),
    h(
      'div',
      { class: 'wi-card-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'wi-dismiss wi-activity-btn',
          'data-activity-switch': true,
          onclick: () => onSwitchActivity(s.suggested),
        },
        h('span', {}, 'Switch'),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'wi-dismiss wi-activity-btn',
          'data-activity-keep': true,
          onclick: () => onKeepActivity(),
        },
        h('span', {}, 'Keep'),
      ),
    ),
  );
}

/** The activity line on its own card, for when no weekly check is pending. */
function activityCard(p: WeighInProps, a: WeighInActions): HTMLElement | null {
  const block = activityBlock(p, a);
  if (!block) return null;
  return h(
    'section',
    {
      class: 'wi-card wi-card-info',
      'data-activity-card': true,
      role: 'status',
      'aria-labelledby': 'wi-activity-title',
    },
    h(
      'p',
      { class: 'wi-card-eyebrow caps' },
      icon('calendar', 'sm'),
      h('span', {}, 'Weekly check'),
    ),
    h('h2', { class: 'wi-card-title', id: 'wi-activity-title' }, 'Activity level'),
    block,
  );
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag: string, attrs: Record<string, string | number>, text?: string): Element {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (text !== undefined) el.textContent = text;
  return el;
}

function weeklyCard(p: WeighInProps, a: WeighInActions): HTMLElement | null {
  const c = p.check;
  if (!c || c.outcome !== 'pending') return activityCard(p, a);
  const copy = weeklyCardCopy(c, p.unit, p.kcalTarget);
  const info = copy.accept === null;
  return h(
    'section',
    {
      class: `wi-card wi-card-${c.kind}${info ? ' wi-card-info' : ''}`,
      'data-weekly-card': true,
      'data-kind': c.kind,
      'data-change': checkHasChange(c) ? 'some' : 'none',
      role: 'status',
      'aria-labelledby': 'wi-card-title',
    },
    h(
      'p',
      { class: 'wi-card-eyebrow caps' },
      icon('calendar', 'sm'),
      h('span', {}, 'Weekly check'),
    ),
    h('h2', { class: 'wi-card-title', id: 'wi-card-title' }, copy.title),
    h('p', { class: 'wi-card-body' }, copy.body),
    copy.change
      ? h('p', { class: 'wi-card-change' }, h('span', {}, copy.change), ' ', estimateTag())
      : null,
    h(
      'div',
      { class: 'wi-card-actions' },
      copy.accept
        ? h(
            'button',
            {
              type: 'button',
              class: 'wi-accept',
              'data-weekly-accept': true,
              onclick: () => a.onAccept(),
            },
            icon('check', 'md'),
            h('span', {}, copy.accept),
          )
        : null,
      h(
        'button',
        {
          type: 'button',
          class: 'wi-dismiss',
          'data-weekly-dismiss': true,
          onclick: () => a.onDismiss(),
        },
        h('span', {}, copy.dismiss),
      ),
    ),
    activityBlock(p, a),
  );
}

function trendChart(p: WeighInProps): HTMLElement {
  const g = chartGeometry(p.trend, p.unit);
  if (!g) {
    return h(
      'p',
      { class: 'wi-empty', 'data-trend-chart': 'empty' },
      'Weigh in on a few mornings to see your trend.',
    );
  }
  const root = svg('svg', {
    class: 'wi-chart',
    viewBox: `0 0 ${CHART.w} ${CHART.h}`,
    role: 'img',
    'aria-label': `Weight trend from ${g.xFirst} to ${g.xLast}: daily weigh-ins and the 7-day average.`,
    'data-trend-chart': 'drawn',
  });
  const x0 = CHART.padL;
  const x1 = CHART.w - CHART.padR;
  for (const t of [g.yTop, g.yBottom]) {
    root.append(svg('line', { class: 'wc-grid', x1: x0, x2: x1, y1: t.y, y2: t.y }));
    root.append(
      svg('text', { class: 'wc-axis', x: x0 - 8, y: t.y + 6, 'text-anchor': 'end' }, t.label),
    );
  }
  const yb = CHART.h - 6;
  root.append(svg('text', { class: 'wc-axis', x: x0, y: yb, 'text-anchor': 'start' }, g.xFirst));
  root.append(svg('text', { class: 'wc-axis', x: x1, y: yb, 'text-anchor': 'end' }, g.xLast));
  for (const d of g.dots) root.append(svg('circle', { class: 'wc-dot', cx: d.cx, cy: d.cy, r: 5 }));
  if (g.avgPath) root.append(svg('path', { class: 'wc-avg', d: g.avgPath }));
  return h(
    'figure',
    { class: 'wi-figure' },
    root as unknown as HTMLElement,
    h(
      'figcaption',
      { class: 'wi-legend' },
      h('span', { class: 'wi-key wi-key-dot', 'aria-hidden': 'true' }),
      h('span', {}, 'Daily'),
      h('span', { class: 'wi-key wi-key-line', 'aria-hidden': 'true' }),
      h('span', {}, '7-day average'),
    ),
  );
}

function compCard(kind: CompKind, series: readonly CompReading[], unit: Unit): HTMLElement | null {
  const now = compNow(series);
  const first = series[0];
  const last = series[series.length - 1];
  if (now === null || !first || !last) return null;
  const unitWord = kind === 'bodyFat' ? '%' : unit;
  const label = COMP_COPY[kind].label;
  const change = compChange(series, unitWord);
  const g = compGeometry(series);
  let chart: Element | null = null;
  if (g) {
    chart = svg('svg', {
      class: 'bc-chart',
      viewBox: `0 0 ${COMP_CHART.w} ${COMP_CHART.h}`,
      role: 'img',
      'aria-label': `${label} from ${g.xFirst} to ${g.xLast}: ${comp1(first.value)} ${unitWord} to ${comp1(last.value)} ${unitWord}.`,
      'data-comp-chart': kind,
    });
    const x0 = COMP_CHART.padL;
    const x1 = COMP_CHART.w - COMP_CHART.padR;
    for (const t of [g.yTop, g.yBottom]) {
      chart.append(svg('line', { class: 'wc-grid', x1: x0, x2: x1, y1: t.y, y2: t.y }));
      chart.append(
        svg('text', { class: 'bc-axis', x: x0 - 8, y: t.y + 7, 'text-anchor': 'end' }, t.label),
      );
    }
    const yb = COMP_CHART.h - 8;
    chart.append(svg('text', { class: 'bc-axis', x: x0, y: yb, 'text-anchor': 'start' }, g.xFirst));
    chart.append(svg('text', { class: 'bc-axis', x: x1, y: yb, 'text-anchor': 'end' }, g.xLast));
    chart.append(svg('path', { class: 'bc-line', d: g.path }));
    for (const d of g.dots) {
      chart.append(svg('circle', { class: 'bc-dot', cx: d.cx, cy: d.cy, r: 5 }));
    }
  }
  return h(
    'div',
    { class: 'bc-card', 'data-comp': kind },
    h('h3', { class: 'bc-label' }, label),
    h(
      'p',
      { class: 'bc-now' },
      h('span', { class: 'bc-num', 'data-comp-now': kind }, now),
      h('span', { class: 'bc-unit' }, unitWord),
    ),
    change ? h('p', { class: 'bc-change', 'data-comp-change': kind }, change) : null,
    chart as unknown as HTMLElement | null,
  );
}

/** Body fat % and lean mass trends (from Health), or nothing when there is no reading. */
function bodyCompSection(p: WeighInProps): HTMLElement | null {
  const points = p.bodyComp ?? [];
  const cards = (['bodyFat', 'leanMass'] as const)
    .map((k) => compCard(k, compSeries(points, k, p.unit), p.unit))
    .filter((c): c is HTMLElement => c !== null);
  if (!cards.length) return null;
  return h(
    'section',
    { class: 'bc', 'data-body-comp': true, 'aria-labelledby': 'bc-title' },
    h('h2', { class: 'fuel-sub bc-title', id: 'bc-title' }, 'Body composition'),
    ...cards,
    h('p', { class: 'fuel-note' }, BODY_COMP_NOTE),
  );
}

function historyList(p: WeighInProps): HTMLElement {
  if (!p.history.length) {
    return h('p', { class: 'wi-empty', 'data-fuel-history': 'empty' }, 'Nothing logged yet.');
  }
  // Core gives oldest first; the list reads newest first.
  const days = [...p.history].reverse();
  return h(
    'ol',
    { class: 'wi-hist', 'data-fuel-history': true },
    ...days.map((d) =>
      h(
        'li',
        {
          class: d.training ? 'wi-day trained' : 'wi-day',
          'data-day': d.date,
          'data-trained': d.training ? 'true' : 'false',
        },
        h('span', { class: 'wi-day-date' }, longDate(d.date)),
        d.totals.count > 0
          ? h(
              'span',
              { class: 'wi-day-nums' },
              h('span', {}, `${targetText(d.totals.kcal)} kcal`),
              h('span', { class: 'muted' }, `${targetText(d.totals.proteinG)} g protein`),
            )
          : h('span', { class: 'wi-day-nums muted' }, 'Nothing logged'),
        d.training
          ? h(
              'span',
              { class: 'wi-day-train' },
              icon('dumbbell', 'sm'),
              h('span', { class: 'wi-day-train-txt' }, 'Trained'),
            )
          : h('span', { class: 'wi-day-train' }),
      ),
    ),
  );
}

export function weighInScreen(p: WeighInProps, a: WeighInActions): HTMLElement {
  const startKg = p.todayKg ?? p.lastKg ?? 70;
  const field = numberField({
    id: 'weigh-in',
    label: "Today's weight",
    unit: p.unit,
    value: toUnit(startKg, p.unit),
    step: weightStep(p.unit),
    min: toUnit(30, p.unit),
    max: toUnit(250, p.unit),
    onChange: () => undefined,
  });
  return h(
    'main',
    { class: `screen fuel-form weigh-in ${moodClass('pro')}`, 'data-screen': 'weigh-in' },
    h(
      'header',
      { class: 'fuel-head' },
      h(
        'button',
        {
          type: 'button',
          class: 'fuel-back',
          'data-swipe-back': true, // M13d task 24: the edge swipe's Back
          onclick: () => a.onBack(),
        },
        icon('back', 'md'),
        h('span', {}, 'Back'),
      ),
      h('h1', { class: 'page-title' }, 'Weigh-in'),
    ),
    weeklyCard(p, a),
    h(
      'section',
      { class: 'wi-entry', 'aria-label': 'Weigh in' },
      field.el,
      h(
        'p',
        { class: 'fuel-note', 'data-weigh-today': p.todayKg !== null ? 'saved' : 'none' },
        p.todayKg !== null
          ? `Saved today: ${formatWeight(p.todayKg, p.unit)} ${p.unit}. Saving again replaces it.`
          : 'Best in the morning, before breakfast.',
        p.todayKg !== null && p.todaySource === 'health' ? ' ' : null,
        p.todayKg !== null && p.todaySource === 'health' ? fromHealthTag() : null,
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'primary-btn cta-btn wi-save',
          'data-weigh-save': true,
          onclick: () => a.onSave(fromUnit(field.get(), p.unit)),
        },
        icon('check', 'lg'),
        p.todayKg !== null ? 'Update weigh-in' : 'Save weigh-in',
      ),
    ),
    h('h2', { class: 'fuel-sub' }, 'Trend'),
    trendChart(p),
    bodyCompSection(p),
    h('h2', { class: 'fuel-sub' }, 'Last 14 days'),
    historyList(p),
  );
}
