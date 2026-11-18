// M12 task 12: a Calendar day (design "Calendar + proof of completion"). That date's plan with
// each exercise done / partly / missed (sets and reps done vs planned, from logged sessions),
// the actions Start (today) / Move / Do it today, and "History" per exercise (the existing
// exercise history, one tap deeper). Props in, callbacks out; no weights, only sets and reps.
import './calendar.css';
import type { DayCompletion, FocusGroup } from '../../core/types';
import { h } from '../dom';
import { icon, type IconName } from '../icons';
import { countUp } from '../motion';
import { sidedSetBlock, type SetSides } from '../sidesText';
import { moodClass } from '../tokens';
import { dayLong, ringPct, statusRing, statusWord } from './calendar';

export type CalendarDayProps = {
  /** `dayCompletion(input, date)`. */
  day: DayCompletion;
  /** Local YYYY-MM-DD. */
  today: string;
  /** dayId → "Push A". */
  dayName: (dayId: string) => string;
  /** exerciseId → "Dumbbell Row". */
  name: (exerciseId: string) => string;
  /** The focus block's group when `day.blockId` is set. */
  focusGroup?: FocusGroup | null | undefined;
  /** Marks focus exercises (with a "Focus" label, not colour alone). */
  isFocus?: ((exerciseId: string) => boolean) | undefined;
  /** Count the sets number up (first show only). */
  animate?: boolean | undefined;
  /** The tab bar element (app.ts: `tabBar('calendar', onTab)`). */
  tabs?: HTMLElement | null | undefined;
};

export type CalendarDayActions = {
  /** "‹ Calendar". */
  onBack: () => void;
  /** Today, not done yet: start this day's workout. */
  onStart: () => void;
  /** Move this day (Coach tab, notToday/move chip). */
  onMove: (date: string) => void;
  /** Train this (missed or future) day today (Coach tab, a dated override proposal). */
  onDoToday: (date: string) => void;
  /** Opens the existing exercise history for one exercise. */
  onHistory: (exerciseId: string) => void;
};

export type DayAction = 'start' | 'move' | 'doToday';

/** Which actions a day offers. Done / partial-past / rest / extra days offer none. */
export function dayActions(
  day: Pick<DayCompletion, 'date' | 'status'>,
  today: string,
): DayAction[] {
  if (day.date === today)
    return day.status === 'planned' || day.status === 'partial' ? ['start', 'move'] : [];
  if (day.date > today) return day.status === 'planned' ? ['doToday', 'move'] : [];
  // SPEC: Move is for today or a later planned day; a past miss can only be done today.
  return day.status === 'missed' ? ['doToday'] : [];
}

type RowState = 'done' | 'partial' | 'missed' | 'todo';

/** A row's status word: before the day is over, nothing logged reads "To do", not "Missed". */
export function rowState(
  ex: DayCompletion['exercises'][number],
  date: string,
  today: string,
): RowState {
  if (ex.status === 'missed' && date >= today) return 'todo';
  return ex.status;
}

const ROW: Record<RowState, { word: string; icon: IconName }> = {
  done: { word: 'Done', icon: 'check' },
  partial: { word: 'Partly', icon: 'minus' },
  missed: { word: 'Missed', icon: 'close' },
  todo: { word: 'To do', icon: 'clock' },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "10 · 10 · 9 reps, target 8–12" (or just the target when nothing was logged). */
export function repsLine(ex: DayCompletion['exercises'][number]): string {
  const [lo, hi] = ex.repsTarget;
  const target = lo > 0 ? (lo === hi ? `target ${lo}` : `target ${lo}–${hi}`) : '';
  if (ex.reps.length === 0) return target ? `${cap(target)} reps` : '';
  return [`${ex.reps.join(' · ')} reps`, target].filter(Boolean).join(', ');
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * M13b: a day exercise may carry each logged set's per-side counts (parallel to `reps`), for
 * "R 12 · L 11 reps". Optional until `DayCompletion` has it (core `completion.ts`).
 */
export type DayExercise = DayCompletion['exercises'][number] & {
  sides?: readonly (SetSides | null | undefined)[] | undefined;
};

/** One-sided: one "R 12 · L 11 reps" line per set, then "Target 8–12"; else the old line. */
function repsCell(ex: DayExercise): HTMLElement | null {
  const sets = ex.reps.map((reps, i) => ({ reps, weightKg: 0, sides: ex.sides?.[i] ?? null }));
  const block = sidedSetBlock(sets, 'kg', '');
  if (!block) return repsLine(ex) ? h('p', { class: 'cal-ex-reps muted' }, repsLine(ex)) : null;
  const target = repsLine({ ...ex, reps: [] });
  return h(
    'p',
    { class: 'cal-ex-reps muted' },
    block,
    target ? h('span', { class: 'side-target' }, target) : null,
  );
}

function exerciseRow(
  ex: DayExercise,
  props: CalendarDayProps,
  actions: CalendarDayActions,
): HTMLElement {
  const st = props.day.status === 'extra' ? 'done' : rowState(ex, props.day.date, props.today);
  const r = ROW[st];
  const nm = props.name(ex.exerciseId);
  const sets =
    props.day.status === 'extra'
      ? plural(ex.setsDone, 'set')
      : `${ex.setsDone} of ${plural(ex.setsPlanned, 'set')}`;
  const focus = props.isFocus?.(ex.exerciseId) === true;
  return h(
    'li',
    { class: 'cal-ex', 'data-cal-ex': ex.exerciseId, 'data-row-status': st },
    h(
      'div',
      { class: 'cal-ex-text' },
      h(
        'p',
        { class: 'cal-ex-head' },
        h('span', { class: 'cal-ex-name' }, nm),
        focus ? h('span', { class: 'cal-tag', 'data-focus-ex': true }, 'Focus') : null,
      ),
      h(
        'p',
        { class: 'cal-ex-status', 'data-status': st },
        icon(r.icon, 'sm'),
        h('span', {}, `${r.word} · ${sets}`),
      ),
      repsCell(ex),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'cal-ex-hist',
        'data-cal-history': ex.exerciseId,
        'aria-label': `History: ${nm}`,
        onclick: () => actions.onHistory(ex.exerciseId),
      },
      icon('trend', 'md'),
      h('span', { 'aria-hidden': 'true' }, 'History'),
    ),
  );
}

const ACTION_BTN: Record<DayAction, { label: string; cls: string; icon: IconName }> = {
  start: { label: 'Start', cls: 'primary-btn cta-btn cal-act', icon: 'play' },
  doToday: { label: 'Do it today', cls: 'primary-btn cta-btn cal-act', icon: 'play' },
  move: { label: 'Move', cls: 'ghost-btn wide-btn cal-act cal-act-2', icon: 'calendar' },
};

export function calendarDayScreen(
  props: CalendarDayProps,
  actions: CalendarDayActions,
): HTMLElement {
  const { day, today } = props;
  const name = day.dayId ? props.dayName(day.dayId) : null;
  const isToday = day.date === today;
  const word =
    day.status === 'missed' || (day.status === 'planned' && !isToday)
      ? statusWord(day.status)
      : day.status === 'planned'
        ? 'to do today'
        : statusWord(day.status);
  const subtitle =
    day.status === 'rest' ? 'Rest day' : [name, cap(word)].filter(Boolean).join(' · ');

  const showSets = day.status !== 'rest';
  const num = h('span', { class: 'cal-day-big-num', 'aria-hidden': 'true' });
  const total = day.status === 'extra' ? day.setsDone : day.setsPlanned;
  if (props.animate === true) countUp(num, day.setsDone);
  else num.textContent = String(day.setsDone);
  const setsText =
    day.status === 'extra'
      ? `${plural(day.setsDone, 'set')} on a rest day`
      : `${day.setsDone} of ${plural(day.setsPlanned, 'set')}`;

  const acts = dayActions(day, today).map((a) => {
    const b = ACTION_BTN[a];
    const on =
      a === 'start'
        ? actions.onStart
        : a === 'move'
          ? () => actions.onMove(day.date)
          : () => actions.onDoToday(day.date);
    return h(
      'button',
      { type: 'button', class: b.cls, 'data-day-action': a, onclick: on },
      icon(b.icon, 'md'),
      h('span', {}, b.label),
    );
  });

  return h(
    'main',
    {
      class: `screen calendar-day has-tabbar ${moodClass('pro')}`,
      'data-screen': 'calendar-day',
      'data-date': day.date,
      'data-status': day.status,
    },
    h(
      'button',
      { type: 'button', class: 'cal-back', 'data-cal-back': true, onclick: actions.onBack },
      icon('back', 'md'),
      h('span', {}, 'Calendar'),
    ),
    h('h1', { class: 'page-title' }, dayLong(day.date)),
    h(
      'div',
      { class: 'cal-day-head' },
      h(
        'span',
        { class: 'cal-day-ring', 'data-status': day.status },
        statusRing(day.status, ringPct(day)),
      ),
      h(
        'div',
        { class: 'cal-day-meta' },
        h('p', { class: 'cal-day-sub', 'data-day-sub': true }, subtitle),
        props.focusGroup && day.blockId
          ? h(
              'p',
              { class: 'cal-day-focus', 'data-day-focus': props.focusGroup },
              h('span', { class: 'cal-focus-mark', 'aria-hidden': 'true' }),
              h('span', {}, `${cap(props.focusGroup)} focus block`),
            )
          : null,
      ),
    ),
    showSets
      ? h(
          'div',
          {
            class: 'cal-day-sets',
            'data-day-sets': `${day.setsDone}/${total}`,
            'aria-label': setsText,
          },
          num,
          h(
            'span',
            { class: 'cal-day-of', 'aria-hidden': 'true' },
            day.status === 'extra' ? 'sets' : `of ${day.setsPlanned} sets`,
          ),
        )
      : h(
          'p',
          { class: 'cal-state-body', 'data-day-rest': true },
          'Nothing planned. Rest and recover.',
        ),
    acts.length ? h('div', { class: 'cal-actions' }, ...acts) : null,
    day.exercises.length
      ? h(
          'section',
          { class: 'cal-ex-section', 'aria-labelledby': 'cal-ex-head' },
          h('h2', { class: 'cal-section-head caps', id: 'cal-ex-head' }, 'Exercises'),
          h(
            'ul',
            { class: 'cal-ex-list' },
            ...day.exercises.map((e) => exerciseRow(e, props, actions)),
          ),
        )
      : null,
    props.tabs ?? null,
  );
}
