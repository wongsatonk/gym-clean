// M4e original icon set: one geometry, one stroke. Drawn for this project on a 24 grid
// (ported from `ICONS` in docs/design/m4e-mix/_src/build.mjs, plus `flag` from the step-1
// directions sheet). Every icon is inline SVG: stroke = currentColor, 2.25px, round caps and
// joins, aria-hidden. No sprite, no <use href>, no external reference. Icon buttons always carry
// a text label next to the icon (mix README), so the icon itself is decorative.

/** Inner SVG markup per icon, in 24×24 user units. Stroke/fill come from the root <svg>. */
export const ICON_PATHS = {
  dumbbell: '<path d="M3 9.5v5M6.5 7v10M17.5 7v10M21 9.5v5M6.5 12h11"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  camera:
    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7l1.5-3h4l1.5 3"/><circle cx="12" cy="13.5" r="3.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1"/>',
  sliders:
    '<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M9 15l2 2 4-4"/>',
  home: '<path d="M4 11l8-7 8 7v9h-5.5v-6h-5v6H4z"/>',
  flame:
    '<path d="M12 3c1 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.6 1.4-4.2 2.6-5.2.2 2 1.1 3.1 2.4 3.6C12.6 9.7 11.4 6.3 12 3z"/>',
  trophy:
    '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5A3.5 3.5 0 0 1 16.5 11M12 14v4M8 21h8M9.5 18h5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  skip: '<path d="M5 6l8 6-8 6zM17.5 6v12"/>',
  flag: '<path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  speaker:
    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.6M12 17v.2"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M10 3h4M18.5 6.5L20 5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bars: '<path d="M5 20v-7M10 20V8M15 20v-9M20 20V5"/>',
  medal:
    '<path d="M7.5 3h3.5l1 5.2M16.5 3H13l-1 5.2"/><circle cx="12" cy="15" r="6"/><path d="M9.6 15l1.7 1.7 3.2-3.4"/>',
  logo: '<path d="M2.5 9.5v5M5.5 7v10M18.5 7v10M21.5 9.5v5M5.5 12h4l1.5-3 2 6 1.5-3h3.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  palette:
    '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.6-1.3-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7.2" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  ruler: '<path d="M4 15.5L15.5 4 20 8.5 8.5 20z"/><path d="M8 12l2 2M10.5 9.5l1.5 1.5M13 7l2 2"/>',
} as const satisfies Record<string, string>;

export type IconName = keyof typeof ICON_PATHS;
export type IconSize = 'sm' | 'md' | 'lg';

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];

/** The one stroke width for the whole set (mix README "one geometry, one stroke"). */
export const ICON_STROKE = 2.25;

/** Pixel sizes matching the `--ic-sm` / `--ic-md` / `--ic-lg` tokens (22 / 28 / 32). */
export const ICON_PX: Record<IconSize, number> = { sm: 22, md: 28, lg: 32 };

export type IconOptions = {
  /** Extra class names for the <svg> (it always has `ic ic-<size>`). */
  class?: string;
  /** Override the stroke; only the stepper +/− use this (3px at 32px, mix README). */
  stroke?: number;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

function rootAttrs(name: IconName, size: IconSize, opts: IconOptions): Record<string, string> {
  const px = String(ICON_PX[size]);
  return {
    class: ['ic', `ic-${size}`, opts.class].filter(Boolean).join(' '),
    viewBox: '0 0 24 24',
    width: px,
    height: px,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': String(opts.stroke ?? ICON_STROKE),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    'data-icon': name,
  };
}

/** Escapes an attribute value (opts.class may come from a caller). */
function escapeAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Pure: the full `<svg>` markup for an icon (used by tests and string templates). */
export function iconMarkup(name: IconName, size: IconSize = 'md', opts: IconOptions = {}): string {
  const attrs = Object.entries(rootAttrs(name, size, opts))
    .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
    .join(' ');
  return `<svg xmlns="${SVG_NS}" ${attrs}>${ICON_PATHS[name]}</svg>`;
}

/** A decorative inline SVG icon; put a visible text label next to it. */
export function icon(name: IconName, size: IconSize = 'md', opts: IconOptions = {}): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries(rootAttrs(name, size, opts))) svg.setAttribute(k, v);
  // Trusted, compile-time constant markup from ICON_PATHS (never user input).
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}
