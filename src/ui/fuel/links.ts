// M7 task 16: Fuel pieces shown on other screens (SPEC M7 "Workout link", "In-app nudges").
// - proteinLine: the workout Summary's "Protein today 85 / 150 g" + the post-workout hint
//   (core `postWorkoutHint`). Shown, not spoken: Summary is after the workout.
// - nudgeBanner: Today's evening nudge (core `nudgeFor`, M7-q6). Shown when the app is opened,
//   never pushed and never spoken; Dismiss hides it for the day (the app records that).
//
// e2e hooks: `[data-fuel-protein]` with `.fp-value`, `[data-fuel-hint]`, `[data-fuel-nudge]`,
// `[data-nudge-dismiss]`, `[data-nudge-open]`.
import { h } from '../dom';
import { icon } from '../icons';
import { estimateTag } from './common';
import './fuelLinks.css';

export type SummaryFuel = {
  /** Protein logged today (g). */
  proteinG: number;
  /** Today's protein target (g). */
  targetG: number;
  /** `postWorkoutHint(...)`, e.g. "45 g protein to go today". */
  hint: string;
  /** The target is computed, not set by hand. */
  estimate?: boolean | undefined;
};

/** 0–100 for the bar; never above 100. Pure. */
export function proteinPct(proteinG: number, targetG: number): number {
  if (targetG <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((proteinG / targetG) * 100)));
}

export function proteinLine(f: SummaryFuel): HTMLElement {
  const pct = proteinPct(f.proteinG, f.targetG);
  const done = f.proteinG >= f.targetG;
  return h(
    'section',
    { class: done ? 'fp fp-done' : 'fp', 'data-fuel-protein': true, 'aria-labelledby': 'fp-title' },
    h(
      'div',
      { class: 'fp-top' },
      h(
        'h2',
        { class: 'fp-title', id: 'fp-title' },
        icon('flame', 'sm'),
        h('span', {}, 'Protein today'),
      ),
      f.estimate ? estimateTag() : null,
    ),
    h(
      'p',
      { class: 'fp-nums' },
      h('span', { class: 'fp-value' }, String(Math.round(f.proteinG))),
      h('span', { class: 'fp-of' }, ` / ${Math.round(f.targetG)} g`),
    ),
    h(
      'div',
      {
        class: 'fp-bar',
        role: 'progressbar',
        'aria-label': 'Protein today',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': pct,
      },
      h('span', { class: 'fp-fill', style: `width:${pct}%` }),
    ),
    h('p', { class: 'fp-hint', 'data-fuel-hint': true }, f.hint),
  );
}

export function nudgeBanner(
  text: string,
  onDismiss: () => void,
  onOpen?: (() => void) | undefined,
): HTMLElement {
  return h(
    'section',
    { class: 'fuel-nudge', 'data-fuel-nudge': true, role: 'status', 'aria-live': 'polite' },
    h('p', { class: 'fuel-nudge-text' }, icon('flame', 'sm'), h('span', {}, text)),
    h(
      'div',
      { class: 'fuel-nudge-actions' },
      onOpen
        ? h(
            'button',
            {
              type: 'button',
              class: 'fuel-nudge-btn',
              'data-nudge-open': true,
              onclick: () => onOpen(),
            },
            h('span', {}, 'Log food'),
          )
        : null,
      h(
        'button',
        {
          type: 'button',
          class: 'fuel-nudge-btn',
          'data-nudge-dismiss': true,
          'aria-label': 'Dismiss',
          onclick: () => onDismiss(),
        },
        icon('close', 'sm'),
        h('span', {}, 'Dismiss'),
      ),
    ),
  );
}
