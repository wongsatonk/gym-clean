// M13d task 36 (SPEC M13d Goal 7, Decision "M13d answers"): the shared round button. A circle
// with one of our own SVG icons (src/ui/icons.ts) and a short visible word: under the circle for
// secondary actions, beside it for the one main action of a page. The word is the accessible
// name (today's names kept, so screen readers and `getByRole('button', { name })` still find
// them); `ariaLabel` only where the visible word is shortened. The icon is decorative.
//
// Sizes: main circle 72px (`--tap-cta`), the others 56px (`--tap-min`); the whole <button>
// (circle + word) is the tap area, never under 56px, and `wideHit` stretches it to the full row
// for a wide bar that becomes circle + word.
//
// Press look (iconButton.css): the circle scales to 0.92 with a soft glow and springs back,
// transform/opacity on the motion tokens; under Reduce Motion, and on the motion-off screens
// (Exercise, camera), a colour change only.
//
// Haptics: `setPressFeel(fn)` installs a hook fired on pointerdown of `main` buttons only. main
// wires the native light tap into it at boot (task 39); src/ui never imports native code.
import { h } from './dom';
import { icon, type IconName, type IconSize } from './icons';
import './iconButton.css';

export type IconButtonVariant = 'main' | 'secondary' | 'quiet' | 'danger';
export type IconButtonLabelAt = 'below' | 'beside';

export const ICON_BTN_VARIANTS: readonly IconButtonVariant[] = [
  'main',
  'secondary',
  'quiet',
  'danger',
];

/** Circle diameter per variant (px), mirroring `--tap-cta` / `--tap-min` in iconButton.css. */
export const ICON_BTN_CIRCLE_PX: Record<IconButtonVariant, number> = {
  main: 72,
  secondary: 56,
  quiet: 56,
  danger: 56,
};

/**
 * The colour tokens each variant uses (iconButton.css sets the same ones; the tests check both
 * agree and that icon and word reach 4.5:1). `fill: null` = no fill, the page shows through.
 */
export const ICON_BTN_COLOURS: Record<
  IconButtonVariant,
  { fill: string | null; ink: string; word: string }
> = {
  main: { fill: '--cta', ink: '--on-cta', word: '--text' },
  secondary: { fill: '--surface-2', ink: '--text', word: '--text' },
  quiet: { fill: null, ink: '--text-2', word: '--text-2' },
  danger: { fill: '--surface-2', ink: '--danger', word: '--danger' },
};

export type IconButtonLayout = { circlePx: number; iconSize: IconSize; labelAt: IconButtonLabelAt };

/** Pure: circle size, icon size and word placement for a variant. */
export function iconButtonLayout(
  variant: IconButtonVariant,
  labelAt?: IconButtonLabelAt,
): IconButtonLayout {
  const main = variant === 'main';
  return {
    circlePx: ICON_BTN_CIRCLE_PX[variant],
    iconSize: main ? 'lg' : 'md',
    labelAt: labelAt ?? (main ? 'beside' : 'below'),
  };
}

/** The press feel (a light haptic in the iPhone app). May return a promise; errors are ignored. */
export type PressFeel = () => unknown;

const NO_FEEL: PressFeel = () => {};
let pressFeel: PressFeel = NO_FEEL;

/** Installs the press-feel hook for main buttons (null restores the no-op). Read at press time. */
export function setPressFeel(fn: PressFeel | null): void {
  pressFeel = fn ?? NO_FEEL;
}

function feelPress(): void {
  try {
    const r = pressFeel();
    // A native bridge returns a promise; a rejected one (no plugin, web build) is ignored.
    if (
      r !== null &&
      typeof r === 'object' &&
      typeof (r as { catch?: unknown }).catch === 'function'
    ) {
      (r as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Never the only signal: a missing or failing haptic leaves the press as it was.
  }
}

export type IconButtonProps = {
  icon: IconName;
  /** The short visible word; also the accessible name unless `ariaLabel` is given. */
  label: string;
  variant?: IconButtonVariant;
  /** Where the word sits; default beside for `main`, below for the others. */
  labelAt?: IconButtonLabelAt;
  /** The whole row is the tap area (a wide bar that became circle + word). */
  wideHit?: boolean;
  /** Only where the visible word is shortened ("Back" for "Back to To-dos"). */
  ariaLabel?: string;
  /** Extra data attributes (test and app hooks), e.g. `{ 'data-save': true }`. */
  hooks?: Record<string, string | boolean>;
  /** Extra class names for placement by the screen. */
  class?: string;
  disabled?: boolean;
  /** Gets the button, so a screen can hand focus back to it. */
  onClick: (btn: HTMLButtonElement) => void;
};

/** A round icon button with a visible word. */
export function iconButton(props: IconButtonProps): HTMLButtonElement {
  const variant = props.variant ?? 'secondary';
  const layout = iconButtonLayout(variant, props.labelAt);
  const btn: HTMLButtonElement = h(
    'button',
    {
      ...props.hooks,
      type: 'button',
      class: ['icon-btn', props.class].filter(Boolean).join(' '),
      'data-icon-btn': true,
      'data-variant': variant,
      'data-label-at': layout.labelAt,
      'data-wide-hit': props.wideHit === true,
      'aria-label': props.ariaLabel,
      disabled: props.disabled === true,
      onclick: () => props.onClick(btn),
      onpointerdown:
        variant === 'main'
          ? (ev: Event) => {
              if ((ev as PointerEvent).isPrimary === false) return;
              if (btn.disabled === true || btn.hasAttribute('disabled')) return;
              feelPress();
            }
          : undefined,
    },
    h(
      'span',
      { class: 'icon-btn-circle', 'aria-hidden': 'true' },
      icon(props.icon, layout.iconSize),
    ),
    h('span', { class: 'icon-btn-label' }, props.label),
  );
  return btn;
}
