// M10e task 8: the "missing kit" prompt on Today and the day preview (SPEC M10e "Never silent,
// asked once"). Pure render: app.ts finds the first exercise of the shown day that the gym
// profile can't do (core `missingKit`, kept ids skipped) and passes it in.
//
// Shown, not spoken: it appears before a workout, so there's nothing to react to mid-set.
// Nothing changes until he taps: See a swap opens the coach's swap proposal (Apply / Undo there),
// Keep it remembers the exercise. The day's rows stay as they are until Apply.
//
// e2e hooks: `[data-gym-prompt="<exerciseId>"]`, `[data-gym-swap]`, `[data-gym-keep]`.
//
// M13d task 40d (Goal 7): both are round icon buttons with the word below (See a swap a
// secondary circle, Keep it a quiet one): the page's one main action stays Start.
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import './gymPrompt.css';
import '../settingsButtons.css';

/** The exercise the gym lacks kit for (`name` = `exerciseName(id)`). */
export type MissingKit = { exerciseId: string; name: string };

export type GymPromptActions = {
  /** See a swap: open the coach on the `gymSwap` chip for this exercise. */
  onSeeGymSwap?: ((exerciseId: string) => void) | undefined;
  /** Keep it: remember the exercise (`keepExercise`), the prompt goes away. */
  onKeepExercise?: ((exerciseId: string) => void) | undefined;
};

/** "Your gym has no kit for Leg Press." */
export function gymPromptText(name: string): string {
  return `Your gym has no kit for ${name}.`;
}

/** The prompt, or null when there's nothing missing or a callback isn't wired. */
export function gymPrompt(
  missing: MissingKit | null | undefined,
  actions: GymPromptActions,
): HTMLElement | null {
  const { onSeeGymSwap, onKeepExercise } = actions;
  if (!missing || !onSeeGymSwap || !onKeepExercise) return null;
  const id = missing.exerciseId;
  return h(
    'section',
    { class: 'gym-prompt', 'data-gym-prompt': id, role: 'status' },
    h(
      'p',
      { class: 'gym-prompt-text' },
      icon('dumbbell', 'sm'),
      h('span', {}, gymPromptText(missing.name)),
    ),
    h(
      'div',
      { class: 'gym-prompt-actions set-ib-actions' },
      iconButton({
        icon: 'flip',
        label: 'See a swap',
        hooks: { 'data-gym-swap': true },
        onClick: () => onSeeGymSwap(id),
      }),
      iconButton({
        icon: 'check',
        label: 'Keep it',
        variant: 'quiet',
        hooks: { 'data-gym-keep': true },
        onClick: () => onKeepExercise(id),
      }),
    ),
  );
}
