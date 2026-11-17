// M13 task 10: the brand lockup. The mark is the app icon's logo path (ICON_PATHS.logo, drawn for
// this project) on a rounded tile, next to (sm) or above (lg) APP_NAME, with APP_TAGLINE under it
// when asked. The mark is decorative (aria-hidden); the name is the text a screen reader reads.
// Used on the first welcome page (lg + tagline) and anywhere the app shows its name.
import { APP_NAME, APP_TAGLINE } from '../core/brand';
import { h } from './dom';
import { icon } from './icons';
import './brand.css';

export type LockupSize = 'sm' | 'lg';

/** The mark's drawn size in px (the tile around it is ~1.6×). */
export const LOCKUP_MARK_PX: Record<LockupSize, number> = { sm: 32, lg: 72 };

export type LockupOptions = {
  /** 'sm' (default): mark beside the name. 'lg': mark above a display-size name. */
  size?: LockupSize;
  /** true → APP_TAGLINE; a string → that line; false / '' / omitted → no tagline. */
  tagline?: boolean | string;
  /** Element for the name (default 'p'); a page title passes 'h1' or 'h2'. */
  nameTag?: 'p' | 'h1' | 'h2';
  /** id on the name, for a dialog's aria-labelledby. */
  nameId?: string;
};

export function brandLockup(opts: LockupOptions = {}): HTMLElement {
  const size = opts.size ?? 'sm';
  const tagline = opts.tagline === true ? APP_TAGLINE : opts.tagline || '';
  const mark = icon('logo', 'lg', { class: 'brand-mark-ic' });
  const px = String(LOCKUP_MARK_PX[size]);
  mark.setAttribute('width', px);
  mark.setAttribute('height', px);
  return h(
    'div',
    { class: `brand-lockup brand-${size}`, 'data-brand': 'lockup' },
    h('span', { class: 'brand-mark', 'data-brand': 'mark' }, mark),
    h(
      'div',
      { class: 'brand-words' },
      h(
        opts.nameTag ?? 'p',
        { class: 'brand-name', id: opts.nameId, 'data-brand': 'name' },
        APP_NAME,
      ),
      tagline ? h('p', { class: 'brand-tagline', 'data-brand': 'tagline' }, tagline) : null,
    ),
  );
}
