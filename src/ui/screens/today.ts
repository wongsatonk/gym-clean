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
// M11 (optional): the "Lighter today?" card (`[data-readiness]`, ./readinessCard.ts; never on a
// rest day) and the weekly-load line under "Your week" (`[data-week-load]`, ./weekLoad.ts).
// M12 (optional): the missed-day card (`[data-missed-day]`, Move it `[data-missed-move]` or Start
// it `[data-missed-start]` for a rotation miss, Skip it
// `[data-missed-skip]`; shown, not spoken) and first-load motion through a `TodayMotion` that
// app.ts keeps for the app's life (cards stagger in once, the streak counts up once, the
// readiness card slides in when it first appears). Without `motion` nothing moves.
// M12 1b (optional): "How do you feel today?" below Start (`[data-feel-today]`, ./feelToday.ts,
// shown when `onSaveFeel` is set) with "Go easy on … today?" offers (`[data-easy-on]`; on the
// readiness card when a sore area is one of its reasons, else on the feel row; never on a rest
// day), and the cardio line under "Your week" (`[data-cardio]`, hidden when null).
import type { WeekDot } from '../../core/stats';
import type { MissedDay } from '../../core/progress/completion';
import type { DayFeel, DayOverride, ProgramDay, ReadinessCard } from '../../core/types';
import { cardioLine } from '../../core/health/cardio';
import type { FeelOffer } from '../../core/health/readiness';
import { formatWeight, type Unit } from '../../core/units';
import { exerciseById } from '../../data/catalog';
import { bodyMapSvg, pickView } from '../bodyMap';
import { h } from '../dom';
import { icon } from '../icons';
import { countUp, enterScreen, staggerIn } from '../motion';
import { tabBar, type TabId } from '../tabBar';
import { moodClass } from '../tokens';
import { nudgeBanner } from '../fuel/links';
import { dayMuscles, estimateMinutes, muscleLabel, type DayMuscles } from '../../core/dayInfo';
import { gymPrompt, type MissingKit } from './gymPrompt';
import { cardShowsEasyOn, readinessCard, type ReadinessActions } from './readinessCard';
import { feelToday } from './feelToday';
import { todoCard, type TodoCardProps } from '../todo/todoCard';
import { weekLoadLine, type WeekLoad } from './weekLoad';

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
  // ---- M11 health (optional) ----
  /**
   * Core's readiness card for today (`ReadinessCard`), or null. Shows "Lighter today?" (or
   * "Deload week?" when `offer === 'deload'`) when its callbacks are set; never on a rest day.
   */
  readiness?: ReadinessCard | null | undefined;
  /** Core's weekly load (gym sessions + outside workouts). Shows the line under "Your week". */
  weekLoad?: WeekLoad | null | undefined;
  // ---- M12 (optional) ----
  /**
   * Core's `missedDay(...)` (not yet answered). Shows "You missed Push A on Tue." with Move it /
   * Skip it when both callbacks are set. app.ts stores the answer, so it's shown once.
   */
  missedDay?: MissedDay | null | undefined;
  /**
   * The missed-day card's first button: 'move' (default) → Move it (`onMoveMissed`); 'start' →
   * Start it (`onStartMissed`), for a rotation miss the rotation already carried forward to today.
   */
  missedAction?: 'move' | 'start' | undefined;
  /** First-load motion state from `createTodayMotion()`, kept by app.ts across re-renders. */
  motion?: TodayMotion | undefined;
  // ---- M12 slice 1c (optional) ----
  /**
   * The to-do card ("To-dos: 6 of 12 done"), below the hero so it never pushes Start down.
   * Shown when `visible` and `onOpenTodos` is set.
   */
  todo?: TodoCardProps | null | undefined;
  // ---- M12 slice 1b (optional) ----
  /** Today's "How do you feel today?" answer (`getDayFeel(today)`); null = not answered. */
  feel?: DayFeel | null | undefined;
  /** Core's `todaysFeelOffers(feels, today)`: "Go easy on shoulders today?" per sore area. */
  feelOffers?: readonly FeelOffer[] | undefined;
  /** Keep the feel row open (app.ts, across a re-render while he is answering). */
  feelOpen?: boolean | undefined;
  /** Core's `weeklyCardioMinutes(...)`: "Cardio this week: 95 min" under "Your week"; null hides it. */
  cardioMinutes?: number | null | undefined;
};

/**
 * What Today has already played. app.ts makes one with `createTodayMotion()` and passes the same
 * object on every render, so a re-render (state change, tab back) never replays the entrance.
 */
export type TodayMotion = {
  /** The cards have staggered in and the streak has counted up. */
  entered: boolean;
  /** Key of the readiness card on screen (null = none), so it slides in only when new. */
  readiness: string | null;
};

export function createTodayMotion(): TodayMotion {
  return { entered: false, readiness: null };
}

/** One calendar day, as `src/core/trainer/plan.ts` returns it. `date` is local YYYY-MM-DD. */
export type CalendarEntry = {
  date: string;
  dayId: string | null;
  rest: boolean;
  override?: DayOverride | undefined;
};

export type TodayActions = ReadinessActions & {
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
  /** M12: Move it on the missed-day card (opens the coach's move proposal for that day). */
  onMoveMissed?: ((missed: MissedDay) => void) | undefined;
  /** M12: Start it on the missed-day card (`missedAction: 'start'`; opens today's workout). */
  onStartMissed?: ((missed: MissedDay) => void) | undefined;
  /** M12: Skip it on the missed-day card (stored as answered; the card goes away). */
  onSkipMissed?: ((missed: MissedDay) => void) | undefined;
  /** M12 slice 1c: the to-do card was tapped (opens the To-do list). */
  onOpenTodos?: (() => void) | undefined;
  /**
   * M12 1b: Save on "How do you feel today?" (shows the row when set). app.ts calls
   * `saveDayFeel(feel)` (no energy + no sore deletes the row) and re-renders Today.
   * The "Go easy on … today?" buttons call `onEasyOn` (ReadinessActions).
   */
  onSaveFeel?: ((feel: DayFeel) => void) | undefined;
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

/** The streak tile and its number (the one Today counts up). */
function streakTile(props: TodayProps): { el: HTMLElement; num: HTMLElement } {
  const n = props.streakWeeks;
  const num = h('span', { 'data-streak-num': true }, String(n));
  const el = h(
    'section',
    { class: 'tile streak', 'data-streak': n },
    h('h2', { class: 'tile-head' }, icon('flame', 'sm'), 'Streak'),
    h('p', { class: 'tile-num' }, num, h('small', {}, n === 1 ? 'wk' : 'wks')),
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
  return { el, num };
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

/** "Tue" for a date in the last 6 days, else "Mon 9" (7 days back is the same weekday). */
function missedWhen(date: string, now: number): string {
  const ms = ymdToMs(date);
  const wd = new Date(ms).toLocaleDateString('en-GB', { weekday: 'short' });
  return ymdToMs(ymd(now)) - ms < 7 * DAY_MS ? wd : `${wd} ${new Date(ms).getDate()}`;
}

/** "You missed Push A on Tue." */
export function missedDayText(missed: MissedDay, now: number): string {
  return `You missed ${missed.name} on ${missedWhen(missed.date, now)}.`;
}

/** The missed-day card, or null with no missed day or when a callback isn't wired. */
export function missedDayCard(
  missed: MissedDay | null | undefined,
  now: number,
  actions: Pick<TodayActions, 'onMoveMissed' | 'onStartMissed' | 'onSkipMissed'>,
  action: 'move' | 'start' = 'move',
): HTMLElement | null {
  const { onSkipMissed } = actions;
  const onFirst = action === 'start' ? actions.onStartMissed : actions.onMoveMissed;
  if (!missed || !onFirst || !onSkipMissed) return null;
  return h(
    'section',
    { class: 'missed-card', 'data-missed-day': missed.date, role: 'status' },
    h(
      'p',
      { class: 'missed-text' },
      icon('calendar', 'sm'),
      h('span', {}, missedDayText(missed, now)),
    ),
    h(
      'div',
      { class: 'missed-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'missed-btn missed-cta',
          [action === 'start' ? 'data-missed-start' : 'data-missed-move']: true,
          onclick: () => onFirst(missed),
        },
        action === 'start' ? 'Start it' : 'Move it',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'missed-btn',
          'data-missed-skip': true,
          onclick: () => onSkipMissed(missed),
        },
        'Skip it',
      ),
    ),
  );
}

/** M12 1b: "Cardio this week: 95 min" (core's `cardioLine`), or null when there's no Health. */
export function cardioLineEl(minutes: number | null | undefined): HTMLElement | null {
  const text = cardioLine(minutes ?? null);
  if (text === null) return null;
  return h(
    'p',
    { class: 'week-load cardio-line', 'data-cardio': Math.max(0, Math.round(minutes ?? 0)) },
    icon('timer', 'sm'),
    h('span', {}, text),
  );
}

/** M12 1b: the feel-today row, or null without `onSaveFeel`. Offers go to the card when it has them. */
function feelRow(props: TodayProps, actions: TodayActions, rest: boolean): HTMLElement | null {
  const onSaveFeel = actions.onSaveFeel;
  if (!onSaveFeel) return null;
  const inCard = !rest && cardShowsEasyOn(props.readiness, props.feelOffers, actions.onEasyOn);
  return feelToday(
    {
      date: ymd(props.now),
      feel: props.feel,
      offers: rest || inCard ? undefined : props.feelOffers,
      open: props.feelOpen,
    },
    { onSaveFeel, onEasyOn: actions.onEasyOn },
  );
}

const readinessKey = (c: ReadinessCard): string => `${c.offer}|${c.reasons.join('|')}`;

/**
 * First-load motion (design "Motion": Today). The elements already hold their final state; the
 * helpers only play toward it, and do nothing under reduced motion.
 */
function playTodayMotion(
  motion: TodayMotion,
  parts: {
    cards: HTMLElement[];
    streakNum: HTMLElement;
    streak: number;
    readiness: HTMLElement | null;
  },
  props: TodayProps,
): void {
  const key = parts.readiness && props.readiness ? readinessKey(props.readiness) : null;
  if (parts.readiness && key !== motion.readiness) enterScreen(parts.readiness, 'next');
  motion.readiness = key;
  if (motion.entered) return;
  motion.entered = true;
  staggerIn(parts.cards);
  countUp(parts.streakNum, parts.streak);
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
  const rest = todayEntry(props)?.rest === true;
  const readiness = rest ? null : readinessCard(props.readiness, actions, props.feelOffers);
  const streak = streakTile(props);
  // The cards that rise in on first load, in reading order (the readiness card slides instead).
  const cards = [
    props.newProgram && actions.onUseNewProgram && actions.onKeepPlan
      ? newProgramPrompt(actions)
      : null,
    gymPrompt(props.missingKit, actions),
    missedDayCard(props.missedDay, props.now, actions, props.missedAction),
  ];
  const lower = [
    props.adjustedToday ? adjustedBanner(props.adjustedToday, actions.onUndoAdjust) : null,
    props.nudge && actions.onDismissNudge
      ? nudgeBanner(props.nudge, actions.onDismissNudge, actions.onOpenFuel)
      : null,
    hero(props, actions),
    feelRow(props, actions, rest),
    actions.onOpenTodos ? todoCard(props.todo, { onOpen: actions.onOpenTodos }) : null,
    h('div', { class: 'pair' }, streak.el, lastTile(props)),
    h(
      'div',
      { class: 'days-head' },
      h('h2', {}, 'Your week'),
      h('span', {}, `${props.days.length}-day split`),
    ),
    weekLoadLine(props.weekLoad),
    cardioLineEl(props.cardioMinutes),
    strip,
  ];
  const el = h(
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
    ...cards,
    readiness,
    ...lower,
    tabBar('today', actions.onTab),
  );
  if (props.motion) {
    playTodayMotion(
      props.motion,
      {
        cards: [...cards, ...lower].filter((c): c is HTMLElement => c !== null),
        streakNum: streak.num,
        streak: props.streakWeeks,
        readiness,
      },
      props,
    );
  }
  return el;
}
