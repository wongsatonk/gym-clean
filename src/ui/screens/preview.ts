// M4e day preview (Energy mood, SPEC M4e "Picked"). Pure render: data and callbacks in, element
// out. app.ts formats each row's plan / last-time text (it owns the unit and the loaded history).
//
// e2e hooks kept from the old preview: `data-screen="preview"`, a "‹ Back" button, `ol.ex-list`
// with one `li.ex-row` per exercise (name, badges, plan, `.machine`, "Last time: …"), the
// silent-mode hint above a "Start workout" button that reads "Loading…" while disabled.
import type { PlannedExercise, ProgramDay } from '../../core/types';
import { exerciseById } from '../../data/catalog';
import { badgesFor } from '../badges';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dayMuscles, estimateMinutes, muscleLabel } from './dayInfo';

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
};

export type PreviewActions = {
  onBack: () => void;
  onStart: (day: ProgramDay) => void;
};

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
    ),
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
    h(
      'ol',
      { class: 'ex-list' },
      ...props.rows.map((r) =>
        h(
          'li',
          { class: 'ex-row', 'data-ex': r.exerciseId },
          h('strong', { class: 'ex-row-name' }, r.name),
          badgesFor({ exerciseId: r.exerciseId, tracking: r.tracking }),
          h('span', { class: 'ex-row-plan' }, r.plan),
          r.machine ? h('span', { class: 'machine' }, `Machine: ${r.machine}`) : null,
          r.last ? h('span', { class: 'muted ex-row-last' }, `Last time: ${r.last}`) : null,
        ),
      ),
    ),
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
