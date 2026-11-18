import { describe, expect, it, vi } from 'vitest';
import { APP_NAME, APP_TAGLINE } from '../../core/brand';
import { checkCopy } from '../../core/trainer/replies';
import { CREDIT } from '../../core/version';
import {
  ABOUT_MEDICAL,
  PRIVACY_EXCEPTION,
  PRIVACY_POINTS,
  PRIVACY_TITLE,
  aboutCopy,
  aboutScreen,
} from './about';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

const render = (over: Partial<Parameters<typeof aboutScreen>[0]> = {}) => {
  const actions = { onBack: vi.fn(), onLicenses: vi.fn(), onOwnerChange: vi.fn() };
  const el = asFake(aboutScreen({ version: 'Version 1.15', owner: false, ...over }, actions));
  return { el, actions };
};

const allText = (el: FakeEl) => el.textContent;

describe('aboutScreen', () => {
  it('is the About screen: lockup with tagline, version line, credit', () => {
    const { el } = render();
    expect(el.tag).toBe('main');
    expect(el.getAttribute('data-screen')).toBe('about');
    const name = el.find((e) => e.getAttribute('data-brand') === 'name')[0];
    expect(name?.textContent).toBe(APP_NAME);
    expect(el.find((e) => e.getAttribute('data-brand') === 'tagline')[0]?.textContent).toBe(
      APP_TAGLINE,
    );
    expect(el.byClass('brand-lg')).toHaveLength(1);
    const v = el.find((e) => e.hasAttribute('data-about-version'))[0];
    expect(v?.textContent).toBe('Version 1.15');
    expect(allText(el)).toContain(CREDIT);
  });

  it('states the privacy promise with the barcode exception and the coaching line', () => {
    const t = allText(render().el);
    expect(t).toContain(PRIVACY_TITLE);
    for (const p of PRIVACY_POINTS) expect(t).toContain(p);
    expect(t).toContain(PRIVACY_EXCEPTION);
    expect(t).toContain('Coaching, not medical advice.');
    expect(ABOUT_MEDICAL).toBe('Coaching, not medical advice.');
  });

  it('the privacy promise is accurate: video, body data, Health and chat stay; barcode is opt-in and number-only', () => {
    expect(PRIVACY_TITLE).toBe('Everything stays on this phone');
    const pts = PRIVACY_POINTS.join(' ').toLowerCase();
    for (const w of ['video', 'body', 'health', 'chat']) expect(pts).toContain(w);
    const ex = PRIVACY_EXCEPTION.toLowerCase();
    expect(ex).toContain('barcode lookup');
    expect(ex).toContain('off');
    expect(ex).toContain('only the barcode number');
    expect(ex).toContain('open food facts');
  });

  it('"Open-source credits" opens the Licenses screen; Back goes back', () => {
    const { el, actions } = render();
    const row = el.find((e) => e.hasAttribute('data-about-licenses'))[0];
    expect(row?.tag).toBe('button');
    expect(row?.textContent).toContain('Open-source credits');
    row?.click();
    expect(actions.onLicenses).toHaveBeenCalledTimes(1);
    el.find((e) => e.hasAttribute('data-back'))[0]?.click();
    expect(actions.onBack).toHaveBeenCalledTimes(1);
  });

  it('no external links and no innerHTML text (icons aside)', () => {
    const { el } = render();
    expect(el.byTag('a')).toHaveLength(0);
    const html = el.find((e) => e.innerHTML !== '' && e.tag !== 'svg');
    expect(html).toHaveLength(0);
  });

  it('7 taps on the version line show the Owner tools switch (owner off)', () => {
    const { el, actions } = render();
    const v = el.find((e) => e.hasAttribute('data-about-version'))[0];
    const sw = () => el.find((e) => e.getAttribute('data-setting') === 'owner-tools')[0];
    for (let i = 0; i < 6; i++) v?.click();
    expect(sw()).toBeUndefined();
    v?.click();
    expect(sw()).toBeDefined();
    expect(el.find((e) => e.hasAttribute('data-owner-status'))[0]?.textContent).toBe(
      'Owner tools unlocked',
    );
    sw()?.click();
    expect(actions.onOwnerChange).toHaveBeenCalledWith(true);
  });

  it('owner on: the switch is already there', () => {
    const { el } = render({ owner: true, version: 'Version 1.15.0 (build abc1234)' });
    const sw = el.find((e) => e.getAttribute('data-setting') === 'owner-tools')[0];
    expect(sw?.getAttribute('aria-checked')).toBe('true');
  });

  it('without onOwnerChange the version line is plain text', () => {
    const el = asFake(
      aboutScreen(
        { version: 'Version 1.15', owner: false },
        { onBack: vi.fn(), onLicenses: vi.fn() },
      ),
    );
    const v = el.find((e) => e.hasAttribute('data-about-version'))[0];
    expect(v?.tag).toBe('p');
  });

  it('every line passes checkCopy and none is gendered', () => {
    for (const line of aboutCopy()) {
      expect(checkCopy(line).hits, line).toEqual([]);
      expect(line).not.toMatch(/\b(he|him|his|she|her|man|men|guy|bro)\b/i);
    }
  });
});
