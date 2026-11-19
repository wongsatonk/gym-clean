// M13d task 40e (SPEC M13d Goal 7): the Fuel screens' buttons on the shared round iconButton.
// Thin wrappers so every Fuel screen and sheet lays them out the same way:
//
// - `fuelMain`: the one main action of a page or sheet (Log, Save, Look up…): the shared main
//   pill (screens/mainPill.ts: 72px orange circle, word beside, the whole pill is the tap area).
//   A long word gets the list-name size so it stays on one line at 390.
// - `secondPill`: a wide second action (Scan a barcode, New recipe, Back to today…): the 56px
//   circle + word beside on the same kind of track; the whole row stays the tap area.
// - `fuelBack`: the top Back of a Fuel screen or sheet: round chevron + "Back" beside. Keeps
//   `.fuel-back` (render tests) and, on screens, `data-swipe-back` (task 24's edge swipe).
// - `actionRow`: circles with their word under them, side by side (card and editor actions).
// - `saveRow`: a sheet's bottom: the danger Delete circle (when there is one) + the main pill.
//   Over an Undo toast this row sticks just above it (fuelButtons.css), as the old bar did.
//
// The visible word is the accessible name; an `ariaLabel` only where the word is shortened.
import { h } from '../dom';
import { iconButton, type IconButtonProps } from '../iconButton';
import { mainPill } from '../screens/mainPill';
import './fuelButtons.css';

type PillProps = Omit<IconButtonProps, 'variant' | 'labelAt' | 'wideHit'>;

/** Words longer than this get the smaller pill size (one line at 390, standard text). */
export const LONG_WORD = 14;

const join = (...names: (string | undefined)[]) => names.filter(Boolean).join(' ');

/** The page's one main action: orange circle + word beside, the whole pill is the tap area. */
export function fuelMain(p: PillProps): HTMLButtonElement {
  return mainPill({
    ...p,
    class: join(p.label.length > LONG_WORD ? 'fuel-pill-long' : undefined, p.class),
  });
}

/** A wide second action: 56px circle + word beside, the whole pill is the tap area. */
export function secondPill(
  p: PillProps & { variant?: 'secondary' | 'danger' | undefined },
): HTMLButtonElement {
  return iconButton({
    ...p,
    variant: p.variant ?? 'secondary',
    labelAt: 'beside',
    wideHit: true,
    class: join('fuel-pill', p.class),
  });
}

/**
 * The top Back: round chevron + "Back". `swipe` marks it as the screen's edge-swipe Back
 * (`data-swipe-back`); `hooks` adds other data attributes.
 */
export function fuelBack(
  onBack: () => void,
  opts: { swipe?: boolean; hooks?: Record<string, string | boolean> } = {},
): HTMLButtonElement {
  return iconButton({
    icon: 'back',
    label: 'Back',
    labelAt: 'beside',
    class: 'fuel-back',
    hooks: { ...(opts.swipe ? { 'data-swipe-back': true } : {}), ...opts.hooks },
    onClick: () => onBack(),
  });
}

/** Circles with their word under them, side by side. */
export function actionRow(extra: string | null, ...buttons: (HTMLElement | null)[]): HTMLElement {
  return h('div', { class: join('fuel-acts', extra ?? undefined) }, ...buttons);
}

/** A sheet's bottom row: Delete (danger circle, optional) then the main pill. */
export function saveRow(main: HTMLElement, del?: HTMLElement | null): HTMLElement {
  return h('div', { class: 'fuel-save-row' }, del ?? null, main);
}

/** The label span of an iconButton (the circle is its first child, the word the second). */
export function labelOf(btn: HTMLElement): HTMLElement | null {
  const kids = btn.children as unknown as ArrayLike<HTMLElement>;
  return kids[1] ?? null;
}
