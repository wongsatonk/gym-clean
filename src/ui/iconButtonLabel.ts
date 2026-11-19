// M13d task 40d: change the visible word (or the icon) of a round icon button (iconButton.ts) in
// place, for buttons that follow a state ("Tap again to replace", "Tap to share", "Camera off",
// Next → Done). The word is the accessible name, so the name follows too. iconButton builds
// [circle span, word span]; children[] works on the real DOM and on the render tests' FakeEl.
// Task 41 may fold these into iconButton.ts.
import { iconButtonLayout, type IconButtonVariant } from './iconButton';
import { icon, type IconName } from './icons';

/** Sets the visible word (= accessible name) of an `iconButton`. */
export function setIconButtonLabel(btn: HTMLElement, text: string): void {
  const word = btn.children[1] as HTMLElement | undefined;
  if (word) word.textContent = text;
}

/** Swaps the icon in an `iconButton`'s circle (same size as iconButton draws it). */
export function setIconButtonIcon(btn: HTMLElement, name: IconName): void {
  const circle = btn.children[0] as HTMLElement | undefined;
  const variant = (btn.getAttribute('data-variant') ?? 'secondary') as IconButtonVariant;
  circle?.replaceChildren(icon(name, iconButtonLayout(variant).iconSize));
}
