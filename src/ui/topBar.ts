// M4e workout top bar (mix README "cohesion anchors"): list / Camera / Pause on Exercise, list /
// Pause on Rest. Each an icon with a visible label, and a segment bar under it with the current
// exercise in the action colour (an outline/bar marks "now"; nothing here is filled orange).
// Pure render: data and callbacks in, element out.
//
// M13d task 40a (SPEC M13d Goal 7, mid-set = styling only): the three controls are the shared
// round icon button. Same places, same words and names, nothing new to tap; the bar stays 60px
// tall so nothing below moves, and each hit box is at least the 1.16.2 one (Camera / Pause
// 88×60). To fit circle over word in 60px the circles here are 36px (topBar.css). The list
// keeps its two lines (day name over "3 of 5") beside its circle. No press motion here: the
// Exercise screen is a motion-off screen (iconButton.css).
import { h } from './dom';
import { iconButton } from './iconButton';
import './topBar.css';

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
      iconButton({
        icon: 'list',
        label: p.dayName,
        labelAt: 'beside',
        class: 'wtb-list',
        // Starts with the visible text (WCAG 2.5.3 label in name); ends with "Exercise list",
        // the name e2e and screen readers find it by.
        ariaLabel: `${p.dayName}, ${pos}, Exercise list`,
        labelContent: [
          h(
            'span',
            { class: 'wtb-txt' },
            h('b', { class: 'wtb-day' }, p.dayName),
            h('small', { class: 'wtb-pos' }, pos),
          ),
        ],
        onClick: () => p.onList(),
      }),
      p.onCamera
        ? iconButton({
            icon: 'camera',
            label: 'Camera',
            class: 'wtb-side',
            onClick: () => p.onCamera?.(),
          })
        : null,
      iconButton({
        icon: 'pause',
        label: 'Pause',
        class: 'wtb-side',
        hooks: { 'data-pause-open': true },
        onClick: () => p.onPause(),
      }),
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
