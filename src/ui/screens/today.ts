// M4e Today screen (Energy mood, docs/design/m4e-mix/today.png). Pure render: data and callbacks
// in, element out. No DB access; app.ts loads the history and runs the core selectors
// (weeklyStreak, weekDots, lastSession, volumeVsLast) and passes their results here.
//
// e2e hooks kept from the old Today: `.day-btn` per program day with `data-day`, `.up-next` on
// the suggested day, a `Settings` button (now the tab), each day's button named by the day.
import type { WeekDot } from '../../core/stats';
import type { ProgramDay } from '../../core/types';
import { formatWeight, type Unit } from '../../core/units';
import { exerciseById } from '../../data/catalog';
import { bodyMapSvg, pickView } from '../bodyMap';
import { h } from '../dom';
import { icon } from '../icons';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';
import { dayMuscles, estimateMinutes, muscleLabel, type DayMuscles } from './dayInfo';

/** The last finished session, as the Last time tile shows it. */
export type TodayLast = {
  dayName: string;
  /** startedAt (ms). */
  date: number;
  durationMs: number;
  volumeKg: number;
  /** `volumeVsLast(...)`; null on a first session of that day or a bodyweight day. */
  volumeVsLast: number | null;
};

export type TodayProps = {
  /** Current time (ms), for the date and the "Wed" labels. */
  now: number;
  /** The program days, in order (`program.days`). */
  days: readonly ProgramDay[];
  /** The suggested next day. null while the history is still loading: Start is disabled. */
  upNextDayId: string | null;
  /** `weeklyStreak(sessions, now, STREAK_MIN_PER_WEEK)`. */
  streakWeeks: number;
  /** `weekDots(sessions, now)`: 7 entries, Mon–Sun. */
  weekDots: readonly WeekDot[];
  last: TodayLast | null;
  /** dayId → startedAt of a finished session this week; those cards show ✓ + weekday. */
  doneThisWeek?: Readonly<Record<string, number>> | undefined;
  unit: Unit;
  /** The silent-mode hint (`silentHint()`), placed right above Start workout. */
  hint?: HTMLElement | null | undefined;
};

export type TodayActions = {
  /** The hero's Start workout. */
  onStart: (day: ProgramDay) => void;
  /** A day card in the strip (opens the preview, as the old day list did). */
  onOpenDay: (day: ProgramDay) => void;
  onTab: (tab: TabId) => void;
};

const WEEK_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEK_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DOT_SR: Record<WeekDot['state'], string> = {
  done: 'trained',
  today: 'today',
  rest: 'no workout',
  future: 'coming up',
};
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Fri 13 Nov". */
export function dateLabel(ms: number): string {
  const d = new Date(ms);
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const mo = d.toLocaleDateString('en-GB', { month: 'short' });
  return `${wd} ${d.getDate()} ${mo}`;
}

/** "Wed" within the last 6 days, else "3 Nov". */
export function whenLabel(ms: number, now: number): string {
  if (now - ms < 6 * DAY_MS) return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
  const d = new Date(ms);
  return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/** The Last time tile's bottom line: the volume trend, or a fallback when there's none. */
export function volumeLine(
  last: Pick<TodayLast, 'volumeKg' | 'volumeVsLast'>,
  unit: Unit,
): { text: string; tone: 'up' | 'flat' } {
  const pct = last.volumeVsLast;
  if (pct !== null) {
    if (pct > 0) return { text: `+${pct}% volume`, tone: 'up' };
    if (pct === 0) return { text: 'Same volume', tone: 'flat' };
    return { text: `${pct}% volume`.replace('-', '−'), tone: 'flat' };
  }
  // No earlier session of that day (or it moved no weight): show what was lifted, if anything.
  if (last.volumeKg > 0)
    return {
      text: `${formatWeight(Math.round(last.volumeKg), unit)} ${unit} lifted`,
      tone: 'flat',
    };
  return { text: 'Bodyweight day', tone: 'flat' };
}

function heroFigure(m: DayMuscles): HTMLElement {
  const fig = h('div', { class: 'hero-fig', 'aria-hidden': 'true' });
  // Constant-only markup (bodyMap.ts), safe as innerHTML.
  fig.innerHTML = bodyMapSvg({
    view: pickView(m.primary),
    primary: m.primary,
    secondary: m.secondary,
    size: 'mini',
  });
  return fig;
}

function hero(props: TodayProps, actions: TodayActions): HTMLElement {
  const idx = props.days.findIndex((d) => d.id === props.upNextDayId);
  const day = idx >= 0 ? props.days[idx] : undefined;
  if (!day) {
    return h(
      'section',
      { class: 'hero', 'aria-busy': 'true', 'data-hero': true },
      h('p', { class: 'eyebrow' }, 'Next up'),
      h(
        'h1',
        { class: 'hero-title' },
        h('span', { 'aria-hidden': 'true' }, '…'),
        h('span', { class: 'sr-only' }, 'Loading'),
      ),
      props.hint ?? null,
      h('button', { class: 'primary-btn hero-cta', type: 'button', disabled: true }, 'Loading…'),
    );
  }
  const m = dayMuscles(day, exerciseById);
  return h(
    'section',
    { class: 'hero', 'aria-labelledby': 'hero-title', 'data-hero': day.id },
    h('span', { class: 'hero-rings', 'aria-hidden': 'true' }),
    heroFigure(m),
    h(
      'div',
      { class: 'hero-txt' },
      h('p', { class: 'eyebrow' }, `Next up · Day ${idx + 1} of ${props.days.length}`),
      h('h1', { class: 'hero-title', id: 'hero-title' }, day.name),
      h(
        'p',
        { class: 'hero-meta' },
        h('span', {}, icon('dumbbell', 'sm'), `${day.exercises.length} exercises`),
        h('span', {}, icon('clock', 'sm'), `~${estimateMinutes(day)} min`),
      ),
      h(
        'ul',
        { class: 'chips', 'aria-label': 'Muscles worked' },
        ...m.primary.slice(0, 3).map((name) => h('li', { class: 'chip' }, muscleLabel(name))),
      ),
    ),
    props.hint ?? null,
    h(
      'button',
      {
        class: 'primary-btn hero-cta',
        type: 'button',
        'data-start': day.id,
        onclick: () => actions.onStart(day),
      },
      icon('play', 'lg'),
      'Start workout',
    ),
  );
}

function streakTile(props: TodayProps): HTMLElement {
  const n = props.streakWeeks;
  return h(
    'section',
    { class: 'tile streak', 'data-streak': n },
    h('h2', { class: 'tile-head' }, icon('flame', 'sm'), 'Streak'),
    h('p', { class: 'tile-num' }, String(n), h('small', {}, n === 1 ? 'wk' : 'wks')),
    h(
      'ul',
      { class: 'week', 'aria-label': 'This week' },
      ...props.weekDots
        .slice(0, 7)
        .map((d, i) =>
          h(
            'li',
            { class: `wd ${d.state}`, 'data-dot': d.state },
            h(
              'span',
              { class: 'dot', 'aria-hidden': 'true' },
              d.state === 'done' ? icon('check', 'sm') : null,
            ),
            h('span', { class: 'wl', 'aria-hidden': 'true' }, WEEK_LETTERS[i] ?? ''),
            h('span', { class: 'sr-only' }, `${WEEK_NAMES[i] ?? ''}: ${DOT_SR[d.state]}`),
          ),
        ),
    ),
  );
}

function lastTile(props: TodayProps): HTMLElement {
  const head = h('h2', { class: 'tile-head' }, icon('calendar', 'sm'), 'Last time');
  const last = props.last;
  if (!last) {
    return h(
      'section',
      { class: 'tile last', 'data-last-session': 'none' },
      head,
      h('p', { class: 'last-name' }, 'None yet'),
      h('p', { class: 'last-meta' }, 'Start one above'),
    );
  }
  const vol = volumeLine(last, props.unit);
  const mins = Math.max(1, Math.round(last.durationMs / 60000));
  return h(
    'section',
    { class: 'tile last', 'data-last-session': last.dayName },
    head,
    h('p', { class: 'last-name' }, last.dayName),
    h('p', { class: 'last-meta' }, `${whenLabel(last.date, props.now)} · ${mins} min`),
    h(
      'p',
      { class: `trend ${vol.tone}`, 'data-volume': vol.tone },
      icon(vol.tone === 'up' ? 'trend' : 'dumbbell', 'sm'),
      vol.text,
    ),
  );
}

function dayCard(day: ProgramDay, props: TodayProps, actions: TodayActions): HTMLElement {
  const next = day.id === props.upNextDayId;
  const doneAt = props.doneThisWeek?.[day.id];
  const m = dayMuscles(day, exerciseById);
  const fig = h('span', { class: 'day-fig', 'aria-hidden': 'true' });
  fig.innerHTML = bodyMapSvg({
    view: pickView(m.primary),
    primary: m.primary,
    secondary: [],
    size: 'mini',
  });
  const when = next
    ? h('span', { class: 'day-when next' }, 'Next')
    : doneAt !== undefined
      ? h('span', { class: 'day-when done' }, icon('check', 'sm'), whenLabel(doneAt, props.now))
      : h('span', { class: 'day-when' }, `${day.exercises.length} exercises`);
  return h(
    'button',
    {
      type: 'button',
      class: `day-btn${next ? ' up-next' : ''}${doneAt !== undefined ? ' done' : ''}`,
      'data-day': day.id,
      onclick: () => actions.onOpenDay(day),
    },
    fig,
    h('span', { class: 'day-name' }, day.name),
    when,
  );
}

export function todayScreen(props: TodayProps, actions: TodayActions): HTMLElement {
  const strip = h(
    'div',
    { class: 'day-strip', 'data-day-strip': true },
    ...props.days.map((d) => dayCard(d, props, actions)),
  );
  // Bring the suggested day into view inside its own row (no page scroll, no animation).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const card = strip.querySelector<HTMLElement>('.day-btn.up-next');
      if (card && strip.isConnected && strip.scrollWidth > strip.clientWidth) {
        strip.scrollLeft = Math.max(0, card.offsetLeft - strip.offsetLeft - 16);
      }
    });
  }
  return h(
    'main',
    { class: `screen today has-tabbar ${moodClass('energy')}`, 'data-screen': 'today' },
    h(
      'header',
      { class: 'appbar' },
      h('span', { class: 'brand' }, icon('logo', 'lg'), 'Gym Clean'),
      h('span', { class: 'date' }, dateLabel(props.now)),
    ),
    hero(props, actions),
    h('div', { class: 'pair' }, streakTile(props), lastTile(props)),
    h(
      'div',
      { class: 'days-head' },
      h('h2', {}, 'Your week'),
      h('span', {}, `${props.days.length}-day split`),
    ),
    strip,
    tabBar('today', actions.onTab),
  );
}
