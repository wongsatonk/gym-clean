// M4e workout top bar (mix README "cohesion anchors"): list / Camera / Pause on Exercise, list /
// Pause on Rest. 60px buttons, each an icon with a visible label, and a segment bar under it with
// the current exercise in the action colour (an outline/bar marks "now"; nothing here is filled
// orange). Pure render: data and callbacks in, element out.
import { h } from './dom';
import { icon } from './icons';

export type WorkoutTopBarProps = {
  dayName: string;
  /** 0-based index of the current exercise. */
  exIndex: number;
  exTotal: number;
  onList: () => void;
  /** Shown only when given (pose-tracked exercises). */
  onCamera?: (() => void) | undefined;
  onPause: () => void;
};

export function workoutTopBar(p: WorkoutTopBarProps): HTMLElement {
  const pos = `${p.exIndex + 1} of ${p.exTotal}`;
  return h(
    'div',
    { class: 'workout-top', 'data-workout-top': true },
    h(
      'header',
      { class: 'top-bar wtb' },
      h(
        'button',
        {
          type: 'button',
          class: 'wtb-btn wtb-list',
          // Starts with the visible text (WCAG 2.5.3 label in name); ends with "Exercise list",
          // the name e2e and screen readers find it by.
          'aria-label': `${p.dayName}, ${pos}, Exercise list`,
          onclick: p.onList,
        },
        icon('list', 'md'),
        h(
          'span',
          { class: 'wtb-txt' },
          h('b', { class: 'wtb-day' }, p.dayName),
          h('small', { class: 'wtb-pos' }, pos),
        ),
      ),
      p.onCamera
        ? h(
            'button',
            { type: 'button', class: 'wtb-btn', onclick: p.onCamera },
            icon('camera', 'md'),
            h('span', { class: 'wtb-lbl' }, 'Camera'),
          )
        : null,
      h(
        'button',
        { type: 'button', class: 'wtb-btn', onclick: p.onPause },
        icon('pause', 'md'),
        h('span', { class: 'wtb-lbl' }, 'Pause'),
      ),
    ),
    h(
      'div',
      { class: 'segs', 'aria-hidden': 'true' },
      ...Array.from({ length: p.exTotal }, (_, i) =>
        h('i', { class: i === p.exIndex ? 'cur' : i < p.exIndex ? 'past' : '' }),
      ),
    ),
  );
}
