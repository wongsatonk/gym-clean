// M13d task 40g (SPEC M13d Goal 7, Decision "M13d answers": mid-set screens, styling only): the
// round-button look on the workout screens (Exercise, Rest, Summary, Pause, the camera sheet and
// its panels). Each action keeps its place, its words and a hit box at least as big as in
// 1.16.2 (e2e/midset-hitboxes.spec.ts): a bar becomes a soft pill as wide as the bar, with the
// circle and the word beside it (the agreed look, docs/screenshots/m13d-buttons-preview-
// exercise.png). No press motion here: these screens get a colour change only (midset.css).
import { iconButton, type IconButtonProps } from './iconButton';
import './midset.css';

export type MidPillProps = Omit<IconButtonProps, 'labelAt' | 'wideHit'> & {
  /** Stretch to the row (a bar that became circle + word): the whole row is the tap area. */
  wide?: boolean;
};

/** A round icon button with its word beside it, on a soft pill track. */
export function midPill(p: MidPillProps): HTMLButtonElement {
  const { wide, ...rest } = p;
  return iconButton({
    ...rest,
    labelAt: 'beside',
    wideHit: wide === true,
    class: ['mid-pill', p.class].filter(Boolean).join(' '),
  });
}

/** Changes a pill's visible word (= its accessible name unless it has an aria-label). */
export function setPillWord(btn: HTMLElement, text: string): void {
  // iconButton builds [circle, word]; children works on the DOM and on the render tests' FakeEl.
  const word = btn.children[1] as HTMLElement | undefined;
  if (word) word.textContent = text;
}
