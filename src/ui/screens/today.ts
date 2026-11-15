// M4e Today screen (Energy mood, docs/design/m4e-mix/today.png). Pure render: data and callbacks
// in, element out. No DB access; app.ts loads the history and runs the core selectors
// (weeklyStreak, weekDots, lastSession, volumeVsLast) and passes their results here.
//
// e2e hooks kept from the old Today: `.day-btn` per program day with `data-day`, `.up-next` on
// the suggested day, a `Settings` button (now the tab), each day's button named by the day.
//
// M10 trainer props are all optional; without them the screen is the M4e one. With them: a
// Coach button (`[data-coach-open]`), the "Adjusted today" banner (`[data-adjusted]`, Undo
// `[data-undo-adjust]`), a "Rest day" hero (`[data-hero="rest"]`, Train anyway keeps
// `data-start`), and a dated week strip (`.cal-card[data-cal]`, moved days `.moved`).
// M10e (optional): the "missing kit" prompt (`[data-gym-prompt]`, ./gymPrompt.ts).
import type { WeekDot } from '../../core/stats';
import type { DayOverride, ProgramDay } from '../../core/types';
import { formatWeight, type Unit } from '../../core/units';
import { exerciseById } from '../../data/catalog';
import { bodyMapSvg, pickView } from '../bodyMap';
import { h } from '../dom';
import { icon } from '../icons';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';
import { nudgeBanner } from '../fuel/links';
import { dayMuscles, estimateMinutes, muscleLabel, type DayMuscles } from '../../core/dayInfo';
import { gymPrompt, type MissingKit } from './gymPrompt';

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
  // ---- M10 trainer (all optional: without them Today renders exactly as in M4e) ----
  /**
   * The calendar week (core `calendar(...)`), in date order. When set, "Your week" shows these
   * dated cards instead of one card per program day, and a rest entry for today turns the hero
   * into "Rest day" with Train anyway.
   */
  calendar?: readonly CalendarEntry[] | undefined;
  /** "Easy on arms · 2 swaps": today's override summary. Shows the Adjusted banner with Undo. */
  adjustedToday?: string | null | undefined;
  /** M10-q11: program.json changed after he edited his plan: offer Use it / Keep mine. */
  newProgram?: boolean | undefined;
  /** M7-q6: the evening nudge line (core `nudgeFor`), e.g. "40 g protein to go today." Shown, never spoken. */
  nudge?: string | null | undefined;
  /**
   * M10e: the first exercise of the up-next day his gym has no kit for (kept ids skipped).
   * Shows the "missing kit" prompt (See a swap / Keep it) when both callbacks are set.
   */
  missingKit?: MissingKit | null | undefined;
};

/** One calendar day, as `src/core/trainer/plan.ts` returns it. `date` is local YYYY-MM-DD. */
export type CalendarEntry = {
  date: string;
  dayId: string | null;
  rest: boolean;
  override?: DayOverride | undefined;
};

export type TodayActions = {
  /** The hero's Start workout. */
  onStart: (day: ProgramDay) => void;
  /** A day card in the strip (opens the preview, as the old day list did). */
  onOpenDay: (day: ProgramDay) => void;
  onTab: (tab: TabId) => void;
  /** Shows the Coach button (top bar) when set. */
  onCoach?: (() => void) | undefined;
  /** Undo on the Adjusted banner. */
  onUndoAdjust?: (() => void) | undefined;
  /** Train anyway on a rest day; falls back to onStart. */
  onTrainAnyway?: ((day: ProgramDay) => void) | undefined;
  /** "A new default program is available": Use it (an undoable Reset). */
  onUseNewProgram?: (() => void) | undefined;
  /** … Keep mine (the prompt goes away). */
  onKeepPlan?: (() => void) | undefined;
  /** M7: Dismiss on the nudge (hidden for the rest of the day). Required for the nudge to show. */
  onDismissNudge?: (() => void) | undefined;
  /** M7: "Log food" on the nudge (opens Fuel). */
  onOpenFuel?: (() => void) | undefined;
  /** M10e: See a swap on the missing-kit prompt (opens the coach's swap proposal). */
  onSeeGymSwap?: ((exerciseId: string) => void) | undefined;
  /** M10e: Keep it on the missing-kit prompt. */
  onKeepExercise?: ((exerciseId: string) => void) | undefined;
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

/** Local YYYY-MM-DD for a time (ms), as calendar entries carry it. */
export function ymd(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Local midnight of a YYYY-MM-DD. */
function ymdToMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

/** The Coach button (Today and the preview top bars): icon + word, ≥ 56px. */
export function coachButton(onCoach: () => void): HTMLElement {
  return h(
    'button',
    { type: 'button', class: 'coach-btn', 'data-coach-open': true, onclick: () => onCoach() },
    icon('chat', 'md'),
    h('span', {}, 'Coach'),
  );
}

/**
 * "Adjusted today: <summary>" with Undo (Today and the preview). A status, not an alert: the
 * change was just made by a tap, so it's announced politely.
 */
export function adjustedBanner(summary: string, onUndo: (() => void) | undefined): HTMLElement {
  return h(
    'section',
    { class: 'adjusted-banner', 'data-adjusted': true, role: 'status', 'aria-live': 'polite' },
    h(
      'p',
      { class: 'adjusted-text' },
      icon('pencil', 'sm'),
      h('span', {}, h('strong', {}, 'Adjusted today: '), summary),
    ),
    onUndo
      ? h(
          'button',
          {
            type: 'button',
            class: 'adjusted-undo',
            'data-undo-adjust': true,
            onclick: () => onUndo(),
          },
          'Undo',
        )
      : null,
  );
}

/** M10-q11: the new-default-program prompt (Today only). */
function newProgramPrompt(actions: TodayActions): HTMLElement {
  return h(
    'section',
    { class: 'adjusted-banner program-prompt', 'data-program-prompt': true, role: 'status' },
    h(
      'p',
      { class: 'adjusted-text' },
      icon('calendar', 'sm'),
      h('span', {}, 'A new default program is available.'),
    ),
    h(
      'div',
      { class: 'program-prompt-actions' },
      h(
        'button',
        { type: 'button', class: 'adjusted-undo', onclick: () => actions.onUseNewProgram?.() },
        'Use it',
      ),
      h(
        'button',
        { type: 'button', class: 'adjusted-undo', onclick: () => actions.onKeepPlan?.() },
        'Keep mine',
      ),
    ),
  );
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

/** Today's calendar entry, if a calendar was passed. */
function todayEntry(props: TodayProps): CalendarEntry | undefined {
  const today = ymd(props.now);
  return props.calendar?.find((e) => e.date === today);
}

/**
 * A rest weekday: "Rest day" with Train anyway, which starts the up-next day (Start is never
 * disabled, per Decision). The CTA keeps `data-start` so the e2e Start hook still finds it.
 */
function restHero(day: ProgramDay, props: TodayProps, actions: TodayActions): HTMLElement {
  const train = actions.onTrainAnyway ?? actions.onStart;
  return h(
    'section',
    { class: 'hero hero-rest', 'aria-labelledby': 'hero-title', 'data-hero': 'rest' },
    h(
      'div',
      { class: 'hero-txt' },
      h('p', { class: 'eyebrow' }, 'Today'),
      h('h1', { class: 'hero-title', id: 'hero-title' }, 'Rest day'),
      h('p', { class: 'hero-meta rest-next' }, `Next up: ${day.name}`),
    ),
    props.hint ?? null,
    h(
      'button',
      {
        class: 'primary-btn hero-cta',
        type: 'button',
        'data-start': day.id,
        'data-train-anyway': true,
        onclick: () => train(day),
      },
      icon('play', 'lg'),
      'Train anyway',
    ),
  );
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
  if (todayEntry(props)?.rest) return restHero(day, props, actions);
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

/**
 * True when an override moved this date: it was made a rest day, or a training day by Not today /
 * Train anyway (an override with no `adjust`). An adjust override (lighter, swap, …) pins its
 * day id too, but only changes what the day runs, so it's "Adjusted", not "Moved".
 */
export function isMoved(entry: CalendarEntry): boolean {
  const o = entry.override;
  return !!o && (o.rest === true || o.adjust === undefined);
}

/**
 * One dated card of the calendar week. Training days stay `.day-btn` buttons with `data-day`
 * (they open the preview, like the program-day cards); rest days are plain cards.
 */
function calendarCard(
  entry: CalendarEntry,
  isNext: boolean,
  props: TodayProps,
  actions: TodayActions,
): HTMLElement {
  const ms = ymdToMs(entry.date);
  const isToday = entry.date === ymd(props.now);
  const moved = isMoved(entry);
  const adjusted = !!entry.override?.adjust;
  const day = entry.rest ? undefined : props.days.find((d) => d.id === entry.dayId);
  const wd = new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
  const dateLine = h(
    'span',
    { class: 'cal-date' },
    isToday ? 'Today' : `${wd} ${new Date(ms).getDate()}`,
  );
  const doneAt = day ? props.doneThisWeek?.[day.id] : undefined;
  const done = doneAt !== undefined && ymd(doneAt) === entry.date;
  // One visible status, by priority; the sr-only line carries all of them.
  const status: string[] = [];
  if (done) status.push('done');
  if (isNext) status.push('next');
  if (moved) status.push('moved');
  if (adjusted) status.push('adjusted');
  const when = done
    ? h('span', { class: 'day-when done' }, icon('check', 'sm'), 'Done')
    : moved
      ? h('span', { class: 'day-when moved' }, 'Moved')
      : isNext
        ? h('span', { class: 'day-when next' }, 'Next')
        : adjusted
          ? h('span', { class: 'day-when adjusted' }, 'Adjusted')
          : h('span', { class: 'day-when' }, day ? `${day.exercises.length} exercises` : 'Off');
  const cls = ['cal-card', isToday ? 'today' : '', moved ? 'moved' : '', done ? 'done' : ''].filter(
    Boolean,
  );
  const sr = h('span', { class: 'sr-only' }, status.length ? ` (${status.join(', ')})` : '');
  if (!day) {
    return h(
      'div',
      { class: [...cls, 'rest'].join(' '), 'data-cal': entry.date, 'data-rest': true },
      dateLine,
      h('span', { class: 'cal-rest-mark', 'aria-hidden': 'true' }, icon('pause', 'md')),
      h('span', { class: 'day-name' }, 'Rest'),
      when,
      sr,
    );
  }
  const m = dayMuscles(day, exerciseById);
  const fig = h('span', { class: 'day-fig', 'aria-hidden': 'true' });
  fig.innerHTML = bodyMapSvg({
    view: pickView(m.primary),
    primary: m.primary,
    secondary: [],
    size: 'mini',
  });
  return h(
    'button',
    {
      type: 'button',
      class: [...cls, 'day-btn', isNext ? 'up-next' : ''].filter(Boolean).join(' '),
      'data-day': day.id,
      'data-cal': entry.date,
      onclick: () => actions.onOpenDay(day),
    },
    dateLine,
    fig,
    h('span', { class: 'day-name' }, day.name),
    when,
    sr,
  );
}

function calendarCards(
  calendar: readonly CalendarEntry[],
  props: TodayProps,
  actions: TodayActions,
): HTMLElement[] {
  // "Next" marks the first entry from today on that runs the up-next day.
  const today = ymd(props.now);
  const nextDate = calendar.find(
    (e) => !e.rest && e.date >= today && e.dayId !== null && e.dayId === props.upNextDayId,
  )?.date;
  return calendar.map((e) => calendarCard(e, e.date === nextDate, props, actions));
}

export function todayScreen(props: TodayProps, actions: TodayActions): HTMLElement {
  const strip = h(
    'div',
    { class: 'day-strip', 'data-day-strip': true },
    ...(props.calendar
      ? calendarCards(props.calendar, props, actions)
      : props.days.map((d) => dayCard(d, props, actions))),
  );
  // Bring the suggested day into view inside its own row (no page scroll, no animation).
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      const card =
        strip.querySelector<HTMLElement>('.cal-card.today') ??
        strip.querySelector<HTMLElement>('.day-btn.up-next');
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
      actions.onCoach
        ? h(
            'span',
            { class: 'appbar-end' },
            h('span', { class: 'date' }, dateLabel(props.now)),
            coachButton(actions.onCoach),
          )
        : h('span', { class: 'date' }, dateLabel(props.now)),
    ),
    props.newProgram && actions.onUseNewProgram && actions.onKeepPlan
      ? newProgramPrompt(actions)
      : null,
    gymPrompt(props.missingKit, actions),
    props.adjustedToday ? adjustedBanner(props.adjustedToday, actions.onUndoAdjust) : null,
    props.nudge && actions.onDismissNudge
      ? nudgeBanner(props.nudge, actions.onDismissNudge, actions.onOpenFuel)
      : null,
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
