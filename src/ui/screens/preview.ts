// M4e day preview (Energy mood, SPEC M4e "Picked"). Pure render: data and callbacks in, element
// out. app.ts formats each row's plan / last-time text (it owns the unit and the loaded history).
//
// e2e hooks kept from the old preview: `data-screen="preview"`, a "‹ Back" button, `ol.ex-list`
// with one `li.ex-row` per exercise (name, badges, plan, `.machine`, "Last time: …"), the
// silent-mode hint above a "Start workout" button that reads "Loading…" while disabled.
// M10 (optional props): a Coach button, the "Adjusted today" banner, an "Adjusted" badge on
// changed rows (`li.ex-row[data-adjusted]`) and removed rows in their own list
// (`li.ex-row-removed`, not `.ex-row`, so `.ex-row` still counts the exercises that run).
import type { PlannedExercise, ProgramDay } from '../../core/types';
import { exerciseById } from '../../data/catalog';
import { badgesFor } from '../badges';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dayMuscles, estimateMinutes, muscleLabel } from '../../core/dayInfo';
import { adjustedBanner, coachButton } from './today';

/** How a row differs from the default day (M10). `removed` rows aren't part of the day that runs. */
export type RowAdjust = 'swap' | 'lighter' | 'deload' | 'avoidArea' | 'removed';

export type PreviewRow = {
  exerciseId: string;
  tracking: PlannedExercise['tracking'];
  /** Display name (`exerciseName(id)`). */
  name: string;
  /** "4 × 8–12 reps · 15 kg" (or "· bodyweight"). */
  plan: string;
  /** The saved machine setting, if any. */
  machine?: string | undefined;
  /** "8×40, 8×40 lb" from the last session; omitted when there is none. */
  last?: string | undefined;
  /** M10: this row was changed for today. Shows the "Adjusted" badge. */
  adjusted?: RowAdjust | undefined;
  /** M10: what changed, e.g. "Swapped for Barbell Curl" or "−1 set, −10% weight". */
  adjustNote?: string | undefined;
};

export type PreviewProps = {
  day: ProgramDay;
  /** 1-based position in the program, for "Day 2 of 6". */
  position: number;
  total: number;
  rows: readonly PreviewRow[];
  /** The last-time data is still loading: Start is disabled and reads "Loading…". */
  loading: boolean;
  /** The silent-mode hint (`silentHint()`), placed right above Start workout. */
  hint?: HTMLElement | null | undefined;
  /** M10: exercises taken out today (`adjusted: 'removed'`), listed after the day as it runs. */
  removedRows?: readonly PreviewRow[] | undefined;
  /** M10: today's override summary; shows the "Adjusted today" banner with Undo. */
  adjustedToday?: string | null | undefined;
};

export type PreviewActions = {
  onBack: () => void;
  onStart: (day: ProgramDay) => void;
  /** M10: shows the Coach button in the top bar when set. */
  onCoach?: (() => void) | undefined;
  /** M10: Undo on the Adjusted banner. */
  onUndoAdjust?: (() => void) | undefined;
};

/** The "Adjusted" badge: icon + word (never colour alone). */
function adjustedBadge(): HTMLElement {
  return h('span', { class: 'adj-badge' }, icon('pencil', 'sm'), 'Adjusted');
}

function exRow(r: PreviewRow): HTMLElement {
  return h(
    'li',
    {
      class: r.adjusted ? 'ex-row adjusted' : 'ex-row',
      'data-ex': r.exerciseId,
      'data-adjusted': r.adjusted,
    },
    h('strong', { class: 'ex-row-name' }, r.name),
    r.adjusted ? adjustedBadge() : null,
    badgesFor({ exerciseId: r.exerciseId, tracking: r.tracking }),
    r.adjustNote ? h('span', { class: 'adj-note' }, r.adjustNote) : null,
    h('span', { class: 'ex-row-plan' }, r.plan),
    r.machine ? h('span', { class: 'machine' }, `Machine: ${r.machine}`) : null,
    r.last ? h('span', { class: 'muted ex-row-last' }, `Last time: ${r.last}`) : null,
  );
}

/** A row taken out today: name, the badge and "Removed today" (no plan, it won't run). */
function removedRow(r: PreviewRow): HTMLElement {
  return h(
    'li',
    { class: 'ex-row-removed', 'data-ex': r.exerciseId, 'data-adjusted': 'removed' },
    h('s', { class: 'ex-row-name' }, r.name),
    adjustedBadge(),
    h('span', { class: 'adj-note' }, r.adjustNote ?? 'Removed today'),
  );
}

export function previewScreen(props: PreviewProps, actions: PreviewActions): HTMLElement {
  const { day } = props;
  const muscles = dayMuscles(day, exerciseById).primary.slice(0, 3);
  return h(
    'main',
    { class: `screen preview ${moodClass('energy')}`, 'data-screen': 'preview' },
    h(
      'header',
      { class: 'top-bar' },
      h('button', { class: 'ghost-btn', type: 'button', onclick: actions.onBack }, '‹ Back'),
      actions.onCoach ? coachButton(actions.onCoach) : null,
    ),
    props.adjustedToday ? adjustedBanner(props.adjustedToday, actions.onUndoAdjust) : null,
    h(
      'section',
      { class: 'preview-head', 'aria-labelledby': 'preview-title' },
      h('p', { class: 'eyebrow' }, `Day ${props.position} of ${props.total}`),
      h('h1', { class: 'hero-title', id: 'preview-title' }, day.name),
      h(
        'p',
        { class: 'hero-meta' },
        h('span', {}, icon('dumbbell', 'sm'), `${day.exercises.length} exercises`),
        h('span', {}, icon('clock', 'sm'), `~${estimateMinutes(day)} min`),
      ),
      muscles.length
        ? h(
            'ul',
            { class: 'chips', 'aria-label': 'Muscles worked' },
            ...muscles.map((m) => h('li', { class: 'chip' }, muscleLabel(m))),
          )
        : null,
    ),
    h('ol', { class: 'ex-list' }, ...props.rows.map(exRow)),
    props.removedRows?.length
      ? h(
          'section',
          { class: 'removed-list', 'aria-labelledby': 'removed-title' },
          h('h2', { class: 'removed-title', id: 'removed-title' }, 'Taken out today'),
          h('ul', { class: 'ex-list' }, ...props.removedRows.map(removedRow)),
        )
      : null,
    h(
      'div',
      { class: 'sticky-bottom' },
      props.hint ?? null,
      h(
        'button',
        {
          class: 'primary-btn hero-cta',
          type: 'button',
          disabled: props.loading,
          onclick: () => actions.onStart(day),
        },
        props.loading ? null : icon('play', 'lg'),
        props.loading ? 'Loading…' : 'Start workout',
      ),
    ),
  );
}
