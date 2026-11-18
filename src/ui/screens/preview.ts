// M4e day preview (Energy mood, SPEC M4e "Picked"). Pure render: data and callbacks in, element
// out. app.ts formats each row's plan / last-time text (it owns the unit and the loaded history).
//
// e2e hooks kept from the old preview: `data-screen="preview"`, a "‹ Back" button, `ol.ex-list`
// with one `li.ex-row` per exercise (name, badges, plan, `.machine`, "Last time: …"), the
// silent-mode hint above a "Start workout" button that reads "Loading…" while disabled.
// M10 (optional props): a Coach button, the "Adjusted today" banner, an "Adjusted" badge on
// changed rows (`li.ex-row[data-adjusted]`) and removed rows in their own list
// (`li.ex-row-removed`, not `.ex-row`, so `.ex-row` still counts the exercises that run).
// M10e (optional): the "missing kit" prompt (`[data-gym-prompt]`, ./gymPrompt.ts).
// M12 slice 1b (optional, short on time): a row done back to back with another shows a pair
// label, "Pair: back to back with Triceps Pushdown" (`.pair-note`, `li.ex-row[data-pair]`; icon
// + words, never colour alone). The pair rest is in the row's plan text (app.ts formats it).
// M13c goal 4 (optional): `onBadge` makes the row's badges buttons (`[data-badge-open=<kind>]`)
// and `onOpenExercise` makes the rest of the row open the exercise's detail: the name becomes a
// button (`[data-ex-open=<id>]`) whose target covers the row (`li.ex-row.ex-row-tap`). Nothing
// here starts a workout; without them the rows render exactly as before.
import type { PlannedExercise, ProgramDay } from '../../core/types';
import { exerciseById } from '../../data/catalog';
import { badgesFor, type BadgeKind } from '../badges';
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dayMuscles, estimateMinutes, muscleLabel } from '../../core/dayInfo';
import { adjustedBanner, coachButton } from './today';
import { gymPrompt, type MissingKit } from './gymPrompt';

/** How a row differs from the default day (M10). `removed` rows aren't part of the day that runs. */
export type RowAdjust = 'swap' | 'lighter' | 'deload' | 'avoidArea' | 'shortOnTime' | 'removed';

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
  /**
   * M12 1b: display name of the exercise this one is paired with today (`PlannedExercise.pairWith`
   * → `exerciseName(id)`). Set it on both rows of a pair. Shows the pair label.
   */
  pairedWith?: string | undefined;
};

/** "Pair: back to back with Triceps Pushdown". */
export function pairLabel(partner: string): string {
  return `Pair: back to back with ${partner}`;
}

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
  /**
   * M10e: the first exercise of this day his gym has no kit for (kept ids skipped). Shows the
   * "missing kit" prompt when both callbacks are set. The rows stay as they are until Apply.
   */
  missingKit?: MissingKit | null | undefined;
};

export type PreviewActions = {
  onBack: () => void;
  onStart: (day: ProgramDay) => void;
  /** M10: shows the Coach button in the top bar when set. */
  onCoach?: (() => void) | undefined;
  /** M10: Undo on the Adjusted banner. */
  onUndoAdjust?: (() => void) | undefined;
  /** M10e: See a swap on the missing-kit prompt. */
  onSeeGymSwap?: ((exerciseId: string) => void) | undefined;
  /** M10e: Keep it on the missing-kit prompt. */
  onKeepExercise?: ((exerciseId: string) => void) | undefined;
  /**
   * M13c: a badge was tapped (3D demo / Info → How-to sheet, Camera → Camera sheet, Learning →
   * learn card). Makes the badges buttons; `opener` is the badge, for focus return.
   */
  onBadge?: ((kind: BadgeKind, exerciseId: string, opener: HTMLElement) => void) | undefined;
  /** M13c: a tap anywhere else on a row opens the exercise's detail. */
  onOpenExercise?: ((exerciseId: string) => void) | undefined;
};

/** The "Adjusted" badge: icon + word (never colour alone). */
function adjustedBadge(): HTMLElement {
  return h('span', { class: 'adj-badge' }, icon('pencil', 'sm'), 'Adjusted');
}

function exRow(r: PreviewRow, actions: PreviewActions): HTMLElement {
  const { onBadge, onOpenExercise } = actions;
  const name = h('strong', { class: 'ex-row-name' }, r.name);
  return h(
    'li',
    {
      class: ['ex-row', r.adjusted ? 'adjusted' : '', onOpenExercise ? 'ex-row-tap' : '']
        .filter(Boolean)
        .join(' '),
      'data-ex': r.exerciseId,
      'data-adjusted': r.adjusted,
      'data-pair': r.pairedWith ? true : undefined,
    },
    onOpenExercise
      ? h(
          'button',
          {
            type: 'button',
            class: 'ex-row-open',
            'data-ex-open': r.exerciseId,
            onclick: () => onOpenExercise(r.exerciseId),
          },
          name,
          icon('back', 'sm', { class: 'ex-row-chev' }),
        )
      : name,
    r.adjusted ? adjustedBadge() : null,
    badgesFor({
      exerciseId: r.exerciseId,
      tracking: r.tracking,
      name: r.name,
      onBadge: onBadge ? (kind, opener) => onBadge(kind, r.exerciseId, opener) : undefined,
    }),
    r.adjustNote ? h('span', { class: 'adj-note' }, r.adjustNote) : null,
    r.pairedWith
      ? h(
          'span',
          { class: 'pair-note' },
          icon('flip', 'sm'),
          h('span', {}, pairLabel(r.pairedWith)),
        )
      : null,
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
      backButton(actions.onBack),
      actions.onCoach ? coachButton(actions.onCoach) : null,
    ),
    gymPrompt(props.missingKit, actions),
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
    h('ol', { class: 'ex-list' }, ...props.rows.map((r) => exRow(r, actions))),
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
