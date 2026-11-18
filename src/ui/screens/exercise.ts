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
// M12 1b: a warm-up set (`warmup` given) shows a text strip "Warm-up 1 of 2 · 20 kg × 8"
// (`[data-warmup]`, `[data-warmup-label]`) with Skip warm-ups (`[data-skip-warmups]`), and the
// set badge reads "Warm-up 1 of 2" instead of "Set 1 of 4" (no working-set pip is lit). Plain
// text and one button: no motion (this screen stays motion-off, motion.ts MOTION_OFF).
// M13b one-sided set (`side` given, oneArm.ts): the reps stepper is headed by the side
// ("Right arm", `[data-side-label]`), so its +/- are that side's. On the first side the CTA slot
// holds Next arm (`[data-next-side]`, speaks the switch line, then onNextSide); Set done is not
// offered there. On the second side a line gives the first side's reps (`[data-side-done]`) and
// Set done ignores taps for SWITCH_GUARD_MS after the switch (a double tap on Next arm).
import type { PlannedExercise } from '../../core/types';
import { exerciseById } from '../../data/catalog';
import { badgesFor } from '../badges';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { workoutTopBar } from '../topBar';
import {
  nextSideButton,
  sideLabel,
  sideLabelText,
  sideOfTurn,
  speakSideSwitch,
  SWITCH_GUARD_MS,
  type OneSidedView,
} from '../oneArm';
import { muscleLabel } from '../../core/dayInfo';

export type StepField = 'reps' | 'weight';

/** Which warm-up set this is: 0-based `index` of `total` (from the session state). */
export type WarmupStep = { index: number; total: number };

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
  /**
   * This set is a warm-up (before set 1 of the day's first heavy lift). `reps`, `weightText` and
   * `unit` are then the warm-up's; `setIndex` / `sets` stay the working sets (pips, all unlit).
   */
  warmup?: WarmupStep | undefined;
  /** M13b: a one-sided set (`oneSidedView(id, s)`); undefined for a two-sided exercise. */
  side?: OneSidedView | undefined;
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
  /**
   * Shows "Skip warm-ups" on a warm-up set: app.ts dispatches `{ type: 'SKIP_WARMUPS' }` and
   * goes to set 1.
   */
  onSkipWarmups?: (() => void) | undefined;
  /**
   * M13b, first side of a one-sided set: Next arm was tapped (the switch line is already being
   * spoken). app.ts dispatches `{ type: 'NEXT_SIDE', now }`.
   */
  onNextSide?: (() => void) | undefined;
};

function stepper(
  field: StepField,
  label: string,
  sub: string,
  name: string,
  value: string,
  onAdjust: ExerciseActions['onAdjust'],
  head?: HTMLElement,
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
    head ??
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

/** Working-set pips; `setIndex` -1 (a warm-up) lights none. */
function setPips(setIndex: number, sets: number): HTMLElement {
  return h(
    'span',
    { class: 'pips', 'aria-hidden': 'true' },
    ...Array.from({ length: sets }, (_, i) =>
      h('i', { class: i === setIndex ? 'cur' : i < setIndex ? 'past' : '' }),
    ),
  );
}

/** Pure: "Warm-up 1 of 2". */
export function warmupCount(w: WarmupStep): string {
  return `Warm-up ${w.index + 1} of ${w.total}`;
}

/** The warm-up strip: the label as text, and Skip warm-ups when the app allows it. */
function warmupStrip(p: ExerciseProps, w: WarmupStep, onSkip?: () => void): HTMLElement {
  return h(
    'section',
    { class: 'warmup-strip', 'aria-label': 'Warm-up set', 'data-warmup': true },
    h(
      'p',
      { class: 'warmup-label', 'data-warmup-label': true },
      h('span', { class: 'warmup-count' }, warmupCount(w)),
      // The dot belongs to the second part, so it is clipped away when that part wraps to its
      // own line beside Skip (styles.css .warmup-sep); the text still reads as one line.
      h(
        'span',
        { class: 'warmup-load' },
        h('span', { class: 'warmup-sep' }, ' · '),
        `${p.weightText} ${p.unit} × ${p.reps}`,
      ),
    ),
    onSkip
      ? h(
          'button',
          { type: 'button', class: 'warmup-skip', 'data-skip-warmups': true, onclick: onSkip },
          'Skip warm-ups',
        )
      : null,
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
            h('span', { class: 'set-lbl caps' }, p.warmup ? 'Warm-up' : 'Set'),
            ' ',
            h('span', { class: 'set-num' }, String((p.warmup?.index ?? p.setIndex) + 1)),
            h('span', { class: 'set-of' }, ` of ${p.warmup?.total ?? p.sets}`),
          ),
          setPips(p.warmup ? -1 : p.setIndex, p.sets),
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
    p.warmup ? warmupStrip(p, p.warmup, a.onSkipWarmups) : null,
    p.cue
      ? h(
          'div',
          { class: 'cue-panel', 'data-cue-panel': true },
          icon('speaker', 'md'),
          h('p', { class: 'cue-text' }, p.cue),
        )
      : null,
    p.side?.turn === 'second' && p.side.doneReps !== undefined
      ? h(
          'p',
          { class: 'side-done', 'data-side-done': true },
          `${sideLabelText(p.side.limb, sideOfTurn('first'))}: `,
          h('strong', {}, String(p.side.doneReps)),
          ` ${p.side.doneReps === 1 ? 'rep' : 'reps'}`,
        )
      : null,
    stepper(
      'reps',
      'Reps',
      'count',
      'Reps',
      String(p.reps),
      a.onAdjust,
      p.side ? sideLabel(p.side.limb, sideOfTurn(p.side.turn)) : undefined,
    ),
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
    h('div', { class: 'sticky-bottom' }, ctaButton(p.side, a)),
  );
}

/** Set done, or Next arm on the first side of a one-sided set. */
function ctaButton(side: OneSidedView | undefined, a: ExerciseActions): HTMLElement {
  if (side?.turn === 'first' && a.onNextSide) {
    const onNext = a.onNextSide;
    return nextSideButton(side.limb, () => {
      speakSideSwitch(side.limb, sideOfTurn('second'));
      onNext();
    });
  }
  const switchedAt = side?.turn === 'second' ? side.switchedAt : undefined;
  return h(
    'button',
    {
      type: 'button',
      class: 'primary-btn cta-btn',
      'data-set-done': true,
      onclick: () => {
        if (switchedAt !== undefined && Date.now() - switchedAt < SWITCH_GUARD_MS) return;
        a.onSetDone();
      },
    },
    icon('check', 'lg'),
    'Set done',
  );
}
