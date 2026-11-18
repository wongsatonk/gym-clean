// M13 task 10: the brand lockup (mark + name + optional tagline). Fake DOM render tests.
import { describe, expect, it } from 'vitest';
import { APP_NAME, APP_TAGLINE } from '../core/brand';
import { brandLockup, LOCKUP_MARK_PX } from './brand';
import { ICON_PATHS } from './icons';
import { asFake, type FakeEl, useFakeDom } from './screens/testDom';

useFakeDom();

const part = (el: FakeEl, key: string) => el.find((e) => e.getAttribute('data-brand') === key);

describe('brandLockup', () => {
  it('shows the mark (the logo path, decorative) and APP_NAME', () => {
    const el = asFake(brandLockup());
    expect(el.getAttribute('data-brand')).toBe('lockup');
    const mark = part(el, 'mark')[0];
    expect(mark).toBeDefined();
    const svg = mark?.byTag('svg')[0];
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('data-icon')).toBe('logo');
    expect(svg?.innerHTML).toBe(ICON_PATHS.logo);
    expect(part(el, 'name')[0]?.textContent).toBe(APP_NAME);
  });

  it('defaults to the small size with no tagline', () => {
    const el = asFake(brandLockup());
    expect(el.classes).toContain('brand-sm');
    expect(part(el, 'tagline')).toHaveLength(0);
    const svg = el.byTag('svg')[0];
    expect(svg?.getAttribute('width')).toBe(String(LOCKUP_MARK_PX.sm));
  });

  it('large size stacks a bigger mark; tagline: true shows APP_TAGLINE', () => {
    const el = asFake(brandLockup({ size: 'lg', tagline: true }));
    expect(el.classes).toContain('brand-lg');
    expect(el.byTag('svg')[0]?.getAttribute('width')).toBe(String(LOCKUP_MARK_PX.lg));
    expect(LOCKUP_MARK_PX.lg).toBeGreaterThan(LOCKUP_MARK_PX.sm);
    expect(part(el, 'tagline')[0]?.textContent).toBe(APP_TAGLINE);
  });

  it('a tagline string replaces the default; an empty one shows none', () => {
    expect(part(asFake(brandLockup({ tagline: 'Lift.' })), 'tagline')[0]?.textContent).toBe(
      'Lift.',
    );
    expect(part(asFake(brandLockup({ tagline: '' })), 'tagline')).toHaveLength(0);
  });

  it('the name can be a heading with an id (for aria-labelledby)', () => {
    const el = asFake(brandLockup({ size: 'lg', nameTag: 'h1', nameId: 'ob-title' }));
    const name = part(el, 'name')[0];
    expect(name?.tag).toBe('h1');
    expect(name?.getAttribute('id')).toBe('ob-title');
    expect(asFake(brandLockup()).find((e) => e.getAttribute('data-brand') === 'name')[0]?.tag).toBe(
      'p',
    );
  });
});
