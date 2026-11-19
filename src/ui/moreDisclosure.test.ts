// M13d task 19: the shared "More" disclosure.
import { describe, expect, it } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import { h } from './dom';
import { byAttr, oneAttr } from './fuel/fuelTestUtil';
import { LESS_LABEL, MORE_LABEL, moreDisclosure } from './moreDisclosure';
import { asFake, useFakeDom } from './screens/testDom';

useFakeDom();

describe('moreDisclosure', () => {
  it('is a real button (aria-expanded, aria-controls) over a hidden panel holding the content', () => {
    const d = moreDisclosure([h('p', {}, 'The rest of it.'), null], { hook: 'x' });
    const el = asFake(d.el);
    expect(el.getAttribute('data-more')).toBe('x');
    const btn = oneAttr(el, 'data-more-btn');
    expect(btn.tag).toBe('button');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toBe(MORE_LABEL);
    const panel = oneAttr(el, 'data-more-panel');
    expect(btn.getAttribute('aria-controls')).toBe(panel.getAttribute('id'));
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(panel.children).toHaveLength(1);
    expect(panel.textContent).toBe('The rest of it.');
    expect(d.isOpen()).toBe(false);
  });

  it('a tap opens it (Less), another closes it (More)', () => {
    const d = moreDisclosure([h('p', {}, 'Detail')]);
    const btn = asFake(d.button);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toBe(LESS_LABEL);
    expect(asFake(d.panel).hasAttribute('hidden')).toBe(false);
    expect(d.isOpen()).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).toBe(MORE_LABEL);
    expect(asFake(d.panel).hasAttribute('hidden')).toBe(true);
  });

  it('`about` names what is behind it for screen readers only; `open` starts it open', () => {
    const d = moreDisclosure([h('p', {}, 'x')], { about: 'Starter plan', open: true });
    const btn = asFake(d.button);
    expect(btn.textContent).toBe(`${LESS_LABEL} about Starter plan`);
    expect(btn.byClass('sr-only')[0]?.textContent).toBe(' about Starter plan');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(byAttr(asFake(d.el), 'data-more-panel')[0]?.hasAttribute('hidden')).toBe(false);
  });

  it('its words pass the coaching-words check', () => {
    for (const s of [MORE_LABEL, LESS_LABEL]) expect(checkCopy(s)).toEqual({ ok: true, hits: [] });
  });
});
