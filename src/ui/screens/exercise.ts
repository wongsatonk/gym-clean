// M4e Exercise screen (Pro mood, docs/design/m4e-mix/exercise.png). Pure render: data and
// callbacks in, element out. app.ts owns the session state, the muscle slot (2D map / 3D body),
// the sheets and dispatching.
//
// Set done is the only filled action-colour shape. Skip exercise and End workout are not here:
// they live in the Pause sheet (screens/pauseSheet.ts).
//
// e2e hooks kept from the old screen: `data-screen="exercise"`, the exercise name as the h1,
// `.exercise-head [data-muscle-slot]`, `.exercise-head-text [data-badge]`, `[data-set-counter]`
// reading "Set 1 of 4", `[data-howto-open]` "How to", the cue text, the "Notes and machine
// setting" button, `[data-today]` / `[data-last]`, stepper buttons "Reps minus" / "kg plus" and
// outputs labelled "Reps" / the unit, the "Set done" button, and the top bar's "Exercise list",
// "Camera", "Pause".
import type { PlannedExercise } from '../../core/types';
import { exerciseById } from '../../data/catalog';
import { badgesFor } from '../badges';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { workoutTopBar } from '../topBar';
import { muscleLabel } from './dayInfo';

export type StepField = 'reps' | 'weight';

export type ExerciseProps = {
  dayName: string;
  /** 0-based index of the current exercise in the day. */
  exIndex: number;
  exTotal: number;
  exerciseId: string;
  tracking: PlannedExercise['tracking'];
  /** Display name (`exerciseName(id)`). */
  name: string;
  /** "8–12" (or "10"). */
  repsRange: string;
  /** 0-based set index and the planned number of sets. */
  setIndex: number;
  sets: number;
  reps: number;
  /** The weight as shown, in `unit` ("22.5"). */
  weightText: string;
  unit: string;
  /** The spoken focus cue for this exercise (`cueFor(id)`); '' hides the panel. */
  cue: string;
  /** The muscle slot from app.ts (`muscleSlot(id, 'inline')`): the 3D body is placed in it. */
  figure: HTMLElement;
  /** Notes row. */
  machine?: string | undefined;
  /** The lasting exercise note, shown under the notes row. */
  note?: string | undefined;
  /** A lasting or today's note exists: the button reads "Notes •". */
  hasNotes: boolean;
  /** "8×40, 8×40 lb" logged today / last session; omitted when empty. */
  today?: string | undefined;
  last?: string | undefined;
};

export type ExerciseActions = {
  onList: () => void;
  /** Given only for pose-tracked exercises: shows the Camera button. */
  onCamera?: (() => void) | undefined;
  onPause: () => void;
  onHowTo: (opener: HTMLElement) => void;
  onNotes: () => void;
  /** -1 or +1 step; app.ts applies the step size (1 rep, 2.5 kg, 5 lb). */
  onAdjust: (field: StepField, dir: -1 | 1) => void;
  onSetDone: () => void;
};

function stepper(
  field: StepField,
  label: string,
  sub: string,
  name: string,
  value: string,
  onAdjust: ExerciseActions['onAdjust'],
): HTMLElement {
  const btn = (dir: -1 | 1) =>
    h(
      'button',
      {
        type: 'button',
        class: 'step-btn',
        'aria-label': `${name} ${dir < 0 ? 'minus' : 'plus'}`,
        onclick: () => onAdjust(field, dir),
      },
      icon(dir < 0 ? 'minus' : 'plus', 'lg', { stroke: 3 }),
    );
  return h(
    'div',
    { class: 'stepper ex-stepper', 'data-stepper': field },
    h(
      'p',
      { class: 'st-label', 'aria-hidden': 'true' },
      h('span', { class: 'caps' }, label),
      h('small', {}, sub),
    ),
    h(
      'div',
      { class: 'st-row' },
      btn(-1),
      h(
        'output',
        { class: `stepper-value${value.length >= 5 ? ' long' : ''}`, 'aria-label': name },
        value,
      ),
      btn(1),
    ),
  );
}

function setPips(setIndex: number, sets: number): HTMLElement {
  return h(
    'span',
    { class: 'pips', 'aria-hidden': 'true' },
    ...Array.from({ length: sets }, (_, i) =>
      h('i', { class: i === setIndex ? 'cur' : i < setIndex ? 'past' : '' }),
    ),
  );
}

export function exerciseScreen(p: ExerciseProps, a: ExerciseActions): HTMLElement {
  const primary = exerciseById(p.exerciseId)?.primaryMuscles ?? [];
  const legend = primary.map(muscleLabel).join(' · ');
  const howTo: HTMLElement = h(
    'button',
    {
      type: 'button',
      class: 'howto-btn',
      'data-howto-open': true,
      onclick: () => a.onHowTo(howTo),
    },
    icon('help', 'md'),
    'How to',
  );
  return h(
    'main',
    { class: `screen exercise ${moodClass('pro')}`, 'data-screen': 'exercise' },
    workoutTopBar({
      dayName: p.dayName,
      exIndex: p.exIndex,
      exTotal: p.exTotal,
      onList: a.onList,
      onCamera: a.onCamera,
      onPause: a.onPause,
    }),
    h(
      'div',
      { class: 'exercise-head' },
      h(
        'div',
        { class: 'exercise-head-text' },
        h('h1', { class: 'exercise-name' }, p.name),
        h(
          'p',
          { class: 'ex-meta' },
          h('span', {}, `Target ${p.repsRange} reps`),
          badgesFor({ exerciseId: p.exerciseId, tracking: p.tracking }),
        ),
      ),
      h(
        'section',
        { class: 'stage', 'aria-label': 'Set and muscles' },
        h(
          'div',
          { class: 'stage-col' },
          h(
            'p',
            { class: 'set-badge', 'data-set-counter': true },
            h('span', { class: 'set-lbl caps' }, 'Set'),
            ' ',
            h('span', { class: 'set-num' }, String(p.setIndex + 1)),
            h('span', { class: 'set-of' }, ` of ${p.sets}`),
          ),
          setPips(p.setIndex, p.sets),
          legend
            ? h(
                'p',
                { class: 'stage-legend', 'data-legend': true },
                h('i', { class: 'swatch-dot', 'aria-hidden': 'true' }),
                legend,
              )
            : null,
          howTo,
        ),
        h('div', { class: 'stage-fig' }, p.figure),
      ),
    ),
    p.cue
      ? h(
          'div',
          { class: 'cue-panel', 'data-cue-panel': true },
          icon('speaker', 'md'),
          h('p', { class: 'cue-text' }, p.cue),
        )
      : null,
    stepper('reps', 'Reps', 'count', 'Reps', String(p.reps), a.onAdjust),
    stepper('weight', 'Weight', p.unit, p.unit, p.weightText, a.onAdjust),
    h(
      'button',
      {
        type: 'button',
        class: 'notes-btn',
        'aria-label': 'Notes and machine setting',
        onclick: a.onNotes,
      },
      h(
        'span',
        { class: p.machine ? 'machine' : 'muted' },
        p.machine ? `Machine: ${p.machine}` : 'Machine setting',
      ),
      h('span', { class: 'notes-tag' }, icon('pencil', 'sm'), p.hasNotes ? 'Notes •' : 'Notes'),
    ),
    p.note ? h('p', { class: 'lasting-note' }, p.note) : null,
    p.today || p.last
      ? h(
          'div',
          { class: 'history' },
          p.today
            ? h('p', { 'data-today': true }, h('span', { class: 'muted' }, 'Today: '), p.today)
            : null,
          p.last
            ? h('p', { 'data-last': true }, h('span', { class: 'muted' }, 'Last time: '), p.last)
            : null,
        )
      : null,
    h(
      'div',
      { class: 'sticky-bottom' },
      h(
        'button',
        {
          type: 'button',
          class: 'primary-btn cta-btn',
          'data-set-done': true,
          onclick: a.onSetDone,
        },
        icon('check', 'lg'),
        'Set done',
      ),
    ),
  );
}
