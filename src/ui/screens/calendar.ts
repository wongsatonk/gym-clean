// M12 task 12: the Calendar tab (replaces History; SPEC M12 goal 7, design "Calendar + proof of
// completion"). A Monday-first month grid where each day is a ring by status, the week and
// month scores, and "Share month". Props in, callbacks out; app.ts wires the data
// (src/core/progress/completion.ts) and the tab bar (`tabs`, so this file doesn't depend on
// the TabId rename). Shown, not spoken: nothing here is reacted to mid-set.
//
// Status is never colour alone: each status has its own ring shape (full / arc / dashed /
// thin / none), the legend names them, and every day button has a full aria-label.
//
// M12 1b task 32: "Cardio this week: 95 min" (core `cardioLine`) on the week score card
// (`[data-cardio]`), hidden when `cardioMinutes` is null (no Health). Display only.
// M13c (optional): Search next to the title (`[data-search-open]`, ../searchButton.ts) when
// `onSearch` is set.
import './calendar.css';
import { cardioLine } from '../../core/health/cardio';
import { pctOf, scoreLine } from '../../core/progress/recap';
import { weekdayOf } from '../../core/trainer/plan';
import type { DayCompletion, DayStatus, FocusGroup, PeriodScore } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { iconButton } from '../iconButton';
import { countUp } from '../motion';
import { pageHead, type OnSearch } from '../searchButton';
import { moodClass } from '../tokens';

export type CalendarProps = {
  /** 'YYYY-MM' shown. */
  month: string;
  /** Local YYYY-MM-DD. */
  today: string;
  /** `monthCompletion(input, month)`: every date of the month, in order. */
  days: readonly DayCompletion[];
  /** `weekScore(input, today)`. */
  week: PeriodScore;
  /** `monthScore(input, month)`. */
  monthScore: PeriodScore;
  /** Mon–Sun weeks in a row (`stats.ts`, same as Today's streak tile). */
  streakWeeks: number;
  /** blockId → its focus group (for the focus mark's label). Omit when there are no blocks. */
  blockGroup?: ((blockId: string) => FocusGroup | null) | undefined;
  /** dayId → "Push A". */
  dayName: (dayId: string) => string;
  /** Count the score numbers up (first show only). Default: final numbers at once. */
  animate?: boolean | undefined;
  /** Still reading the logs. */
  loading?: boolean | undefined;
  /** The load failed (wins over loading and data). */
  error?: boolean | undefined;
  /**
   * M12 1b: core's `weeklyCardioMinutes(healthDays, sessions, today)` for this week. Shown on the
   * week score card; null / omitted hides the line.
   */
  cardioMinutes?: number | null | undefined;
  /** The tab bar element (app.ts: `tabBar('calendar', onTab)`). */
  tabs?: HTMLElement | null | undefined;
};

export type CalendarActions = {
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** A day was tapped: open its day detail (calendarDay.ts). */
  onOpenDay: (date: string) => void;
  /** "Share month": shareMonth.ts makes the image on the phone. */
  onShare: () => void;
  /** Error card's retry. */
  onRetry?: (() => void) | undefined;
  /** M13c: Search next to the title (opens the Library, field focused). Omitted → no button. */
  onSearch?: OnSearch | undefined;
};

// ---------- pure helpers ----------

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** 'November 2026'. */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1] ?? ''} ${y}`;
}

/** 'YYYY-MM' n months away. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  const yy = Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

/** Blank cells before the 1st in a Monday-first grid. */
export function leadingBlanks(month: string): number {
  return (weekdayOf(`${month}-01`) + 6) % 7;
}

/** 'Tue 18'. */
export function dayShort(date: string): string {
  return `${WEEKDAY_SHORT[weekdayOf(date)] ?? ''} ${Number(date.slice(8, 10))}`;
}

/** 'Tue 18 Nov'. */
export function dayLong(date: string): string {
  const m = Number(date.slice(5, 7));
  return `${dayShort(date)} ${(MONTHS[m - 1] ?? '').slice(0, 3)}`;
}

/** What a status reads as, for a day (with today/future in mind). */
export function statusWord(status: DayStatus): string {
  switch (status) {
    case 'done':
      return 'done';
    case 'partial':
      return 'partly done';
    case 'missed':
      return 'missed';
    case 'planned':
      return 'planned';
    case 'extra':
      return 'extra session';
    case 'rest':
      return 'rest';
  }
}

/** Ring fill 0–100 for a day: full when done/extra, the done share when partial, else 0. */
export function ringPct(day: Pick<DayCompletion, 'status' | 'setsDone' | 'setsPlanned'>): number {
  if (day.status === 'done' || day.status === 'extra') return 100;
  if (day.status !== 'partial' || day.setsPlanned <= 0) return 0;
  // Keep a partial arc visibly short of full and visibly more than nothing.
  return Math.min(92, Math.max(8, Math.round((day.setsDone / day.setsPlanned) * 100)));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * "Tue 18: done, 18 of 18 sets" — the day button's accessible name. Adds the day's name when
 * planned or missed, "today", and the focus block.
 */
export function dayLabel(
  day: DayCompletion,
  today: string,
  dayName: (id: string) => string,
  focus: FocusGroup | null = null,
): string {
  const bits: string[] = [statusWord(day.status)];
  const name = day.dayId ? dayName(day.dayId) : null;
  if (day.status === 'done' || day.status === 'partial')
    bits.push(`${day.setsDone} of ${plural(day.setsPlanned, 'set')}`);
  else if (day.status === 'extra') bits.push(plural(day.setsDone, 'set'));
  else if ((day.status === 'missed' || day.status === 'planned') && name) bits.push(name);
  if (day.date === today) bits.push('today');
  if (focus) bits.push(`${focus} focus block`);
  return `${dayShort(day.date)}: ${bits.join(', ')}`;
}

/** "Chest focus: 12 of 20 sets". */
export function focusLine(f: NonNullable<PeriodScore['focus']>): string {
  return `${cap(f.group)} focus: ${f.sets} of ${plural(f.target, 'set')}`;
}

// ---------- component ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** The status ring (decorative; the button carries the words). Same shape as the legend. */
export function statusRing(status: DayStatus, pct: number): SVGElement {
  const svg = svgEl('svg', {
    class: 'cal-ring',
    viewBox: '0 0 44 44',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  if (status === 'rest') return svg;
  svg.append(svgEl('circle', { class: 'cal-ring-track', cx: 22, cy: 22, r: 19 }));
  if (pct > 0) {
    svg.append(
      svgEl('circle', {
        class: 'cal-ring-arc',
        cx: 22,
        cy: 22,
        r: 19,
        pathLength: 100,
        'stroke-dasharray': '100 100',
        'stroke-dashoffset': 100 - pct,
        transform: 'rotate(-90 22 22)',
      }),
    );
  }
  return svg;
}

function dayCell(day: DayCompletion, props: CalendarProps, actions: CalendarActions): HTMLElement {
  const focus = day.blockId ? (props.blockGroup?.(day.blockId) ?? null) : null;
  const isToday = day.date === props.today;
  return h(
    'button',
    {
      type: 'button',
      class: 'cal-day',
      'data-cal-day': day.date,
      'data-status': day.status,
      'data-today': isToday || undefined,
      'data-focus': day.blockId ? 'true' : undefined,
      'aria-label': dayLabel(day, props.today, props.dayName, focus),
      'aria-current': isToday ? 'date' : undefined,
      onclick: () => actions.onOpenDay(day.date),
    },
    statusRing(day.status, ringPct(day)),
    h('span', { class: 'cal-day-num', 'aria-hidden': 'true' }, Number(day.date.slice(8, 10))),
    day.status === 'extra' ? h('span', { class: 'cal-extra', 'aria-hidden': 'true' }, '+') : null,
    day.blockId ? h('span', { class: 'cal-focus-mark', 'aria-hidden': 'true' }) : null,
  );
}

function monthGrid(props: CalendarProps, actions: CalendarActions): HTMLElement {
  const blanks = leadingBlanks(props.month);
  const cells: HTMLElement[] = [];
  for (let i = 0; i < blanks; i++)
    cells.push(h('span', { class: 'cal-blank', 'aria-hidden': 'true' }));
  for (const d of props.days) cells.push(dayCell(d, props, actions));
  return h(
    'div',
    { class: 'cal-grid-wrap' },
    h(
      'div',
      { class: 'cal-weekdays', 'aria-hidden': 'true' },
      ...WEEKDAYS.map((w) => h('span', { class: 'cal-wd' }, w.slice(0, 2))),
    ),
    h('div', { class: 'cal-grid', role: 'group', 'aria-label': monthTitle(props.month) }, ...cells),
  );
}

function legendItem(status: DayStatus, pct: number, label: string): HTMLElement {
  return h(
    'li',
    { class: 'cal-legend-item', 'data-legend': status },
    h('span', { class: 'cal-legend-ring', 'data-status': status }, statusRing(status, pct)),
    h('span', {}, label),
  );
}

function legend(props: CalendarProps): HTMLElement {
  const hasFocus = props.days.some((d) => d.blockId);
  const hasExtra = props.days.some((d) => d.status === 'extra');
  return h(
    'ul',
    { class: 'cal-legend', 'aria-label': 'Key' },
    legendItem('done', 100, 'Done'),
    legendItem('partial', 50, 'Partly'),
    legendItem('missed', 0, 'Missed'),
    legendItem('planned', 0, 'Planned'),
    hasExtra ? legendItem('extra', 100, 'Extra') : null,
    hasFocus
      ? h(
          'li',
          { class: 'cal-legend-item', 'data-legend': 'focus' },
          h('span', { class: 'cal-legend-ring' }, h('span', { class: 'cal-focus-mark' })),
          h('span', {}, 'Focus block'),
        )
      : null,
  );
}

/**
 * M13 task 21: one headline score per card. The big number is sessions ("2 of 6") with its label
 * ("sessions done"); the sets % is a quiet second line. The accessible name keeps core's full
 * sentence ("2 of 6 sessions, 86% of planned sets").
 */
function scoreCard(
  key: 'week' | 'month',
  title: string,
  s: PeriodScore,
  animate: boolean,
  cardio: string | null = null,
): HTMLElement {
  const pct = pctOf(s);
  const line = scoreLine(s);
  const planned = s.sessionsPlanned;
  const num = h('span', { class: 'cal-score-num', 'aria-hidden': 'true' });
  const done = s.sessionsDone;
  // More done than planned (a plan edited mid-week): never "7 of 6". The count leads with
  // "sessions done"; the plan becomes a quiet line.
  const over = planned > 0 && done > planned;
  let label: string;
  if (over) {
    if (animate) countUp(num, done);
    else num.textContent = String(done);
    label = done === 1 ? 'session done' : 'sessions done';
  } else if (planned > 0) {
    const fmt = (n: number) => `${n} of ${planned}`;
    if (animate) countUp(num, done, { format: fmt });
    else num.textContent = fmt(done);
    // "1 of 1 session done"; "0 of 1 sessions done" (a bare "session done" under 0 reads as done).
    label = done === 1 && planned === 1 ? 'session done' : 'sessions done';
  } else if (s.extra > 0) {
    num.textContent = String(s.extra);
    label = s.extra === 1 ? 'extra session' : 'extra sessions';
  } else {
    num.textContent = '–';
    label = 'No sessions planned';
  }
  const text = over
    ? `${plural(done, 'session')} done, ${planned} planned${pct !== null ? `, ${pct}% of planned sets` : ''}`
    : (line ??
      (s.extra > 0
        ? `No sessions planned, ${plural(s.extra, 'extra session')}`
        : 'No sessions planned'));
  return h(
    'section',
    {
      class: 'cal-score',
      'data-score': key,
      'aria-label': `${title}: ${text}${cardio ? `. ${cardio}` : ''}`,
    },
    h('h2', { class: 'cal-score-title caps' }, title),
    num,
    h(
      'div',
      { class: 'cal-score-text' },
      // The number, its label and the sets line are in the card's accessible name already.
      h('p', { class: 'cal-score-line', 'data-score-line': true, 'aria-hidden': 'true' }, label),
      over
        ? h(
            'p',
            { class: 'cal-score-sub', 'data-score-planned': planned, 'aria-hidden': 'true' },
            `${plural(planned, 'session')} planned`,
          )
        : null,
      pct !== null
        ? h(
            'p',
            {
              class: 'cal-score-sub cal-score-sets',
              'data-score-sets': pct,
              'aria-hidden': 'true',
            },
            `${pct}% of planned sets`,
          )
        : null,
      s.extra > 0 && planned > 0
        ? h(
            'p',
            { class: 'cal-score-sub', 'data-score-extra': s.extra },
            `+ ${plural(s.extra, 'extra session')}`,
          )
        : null,
      s.focus
        ? h(
            'p',
            { class: 'cal-score-sub cal-score-focus', 'data-score-focus': true },
            focusLine(s.focus),
          )
        : null,
      cardio ? h('p', { class: 'cal-score-sub', 'data-cardio': true }, cardio) : null,
    ),
  );
}

function stateCard(props: CalendarProps, actions: CalendarActions): HTMLElement | null {
  if (props.error) {
    return h(
      'div',
      { class: 'cal-state', 'data-calendar-state': 'error', role: 'alert' },
      h('p', { class: 'cal-state-title' }, "Couldn't load your calendar"),
      h('p', { class: 'cal-state-body' }, 'Your sets are still saved.'),
      actions.onRetry
        ? iconButton({
            icon: 'refresh',
            label: 'Try again',
            labelAt: 'beside',
            wideHit: true,
            class: 'cal-row-act',
            onClick: () => actions.onRetry?.(),
          })
        : null,
    );
  }
  if (props.loading)
    return h(
      'div',
      { class: 'cal-state', 'data-calendar-state': 'loading', role: 'status', 'aria-busy': 'true' },
      h('p', { class: 'cal-state-title' }, 'Loading…'),
    );
  return null;
}

export function calendarScreen(props: CalendarProps, actions: CalendarActions): HTMLElement {
  const state = stateCard(props, actions);
  const title = monthTitle(props.month);
  const nav = h(
    'div',
    { class: 'cal-nav' },
    // M13d task 40c: round buttons with a short word (Earlier / Later); the accessible name
    // starts with that word (label-in-name, WCAG 2.5.3) and still names the month it goes to.
    iconButton({
      icon: 'back',
      label: 'Earlier',
      ariaLabel: `Earlier: previous month, ${monthTitle(shiftMonth(props.month, -1))}`,
      class: 'cal-nav-act',
      hooks: { 'data-cal-prev': true },
      onClick: () => actions.onPrevMonth(),
    }),
    // The span shrinks the month to fit one line between Earlier / Later (calendar.css).
    h(
      'h2',
      { class: 'cal-month', 'aria-live': 'polite' },
      h('span', { class: 'cal-month-text' }, title),
    ),
    iconButton({
      icon: 'arrow-right',
      label: 'Later',
      ariaLabel: `Later: next month, ${monthTitle(shiftMonth(props.month, 1))}`,
      class: 'cal-nav-act',
      hooks: { 'data-cal-next': true },
      onClick: () => actions.onNextMonth(),
    }),
  );
  const animate = props.animate === true;
  const body: (HTMLElement | null)[] = state
    ? [state]
    : [
        monthGrid(props, actions),
        legend(props),
        h(
          'div',
          { class: 'cal-scores' },
          scoreCard(
            'week',
            'This week',
            props.week,
            animate,
            cardioLine(props.cardioMinutes ?? null),
          ),
          scoreCard('month', 'This month', props.monthScore, animate),
        ),
        h(
          'p',
          { class: 'cal-streak', 'data-streak': props.streakWeeks },
          icon('flame', 'md'),
          h('span', {}, `Streak: ${plural(props.streakWeeks, 'week')}`),
        ),
        iconButton({
          icon: 'share',
          label: 'Share month',
          labelAt: 'beside',
          wideHit: true,
          class: 'cal-row-act',
          hooks: { 'data-share-month': true },
          onClick: () => actions.onShare(),
        }),
        h('p', { class: 'cal-privacy muted' }, 'The image is made on this phone. No body data.'),
      ];
  return h(
    'main',
    {
      class: `screen calendar has-tabbar ${moodClass('pro')}`,
      'data-screen': 'calendar',
      'data-month': props.month,
    },
    pageHead('Calendar', actions.onSearch),
    nav,
    ...body,
    props.tabs ?? null,
  );
}
