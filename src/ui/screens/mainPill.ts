// M13d task 40c (SPEC M13d Goal 7): the one main action of a page as a wide pill: the 72px orange
// circle (iconButton `main`) with its word beside it, on a soft track as wide as the bar it
// replaces, so the whole row stays the tap area (docs/screenshots/m13d-buttons-preview-today.png).
// Used by Today's Start / Train anyway, the day preview's Start, the calendar day's Start / Do it
// today, the exercise page's How to and Share month's Share.
import { iconButton, type IconButtonProps } from '../iconButton';
import './mainPill.css';

export type MainPillProps = Omit<IconButtonProps, 'variant' | 'wideHit' | 'labelAt'>;

/** A main iconButton stretched to the row: circle + word beside, whole pill tappable. */
export function mainPill(props: MainPillProps): HTMLButtonElement {
  return iconButton({
    ...props,
    variant: 'main',
    labelAt: 'beside',
    wideHit: true,
    class: ['main-pill', props.class].filter(Boolean).join(' '),
  });
}
