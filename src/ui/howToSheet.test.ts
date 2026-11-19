// M13d task 19: the How-to sheet reads steps first; the focus line sits behind "More"; the form
// cue (a safety cue) stays shown.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DEMO_IDS } from './demo3d/ids';
import { byAttr, oneAttr } from './fuel/fuelTestUtil';
import { createHowToSheet, howToContent } from './howToSheet';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';

// The 3D player stays "loading" (no three.js in a unit test).
vi.mock('./demo3d/player', () => ({ createDemoPlayer: () => new Promise(() => {}) }));

useFakeDom();

beforeAll(() => {
  // The sheet sets stage.dataset.mode; the fake DOM has no dataset.
  Object.defineProperty(FakeEl.prototype, 'dataset', {
    configurable: true,
    get(this: FakeEl & { _ds?: Record<string, string> }) {
      this._ds ??= {};
      return this._ds;
    },
  });
});

const ID = DEMO_IDS.find((id) => {
  const c = howToContent(id);
  return c.lines.length > 0 && c.focus !== '' && c.cue !== '' && c.tempo !== '';
});

describe('createHowToSheet (M13d task 19)', () => {
  it('has an exercise with steps, tempo, focus and cue to test with', () => {
    expect(ID).toBeTruthy();
  });

  it('steps come first, then the tempo and the cue; the focus line is behind a closed More', () => {
    const h = createHowToSheet({ exerciseId: ID ?? '', tracking: 'manual', onClose: () => {} });
    const el = asFake(h.el);
    const order = el.children
      .map((c) => c.getAttribute('data-howto') ?? (c.hasAttribute('data-more') ? 'more' : null))
      .filter((k) => k !== null && k !== 'note' && k !== 'phase');
    expect(order).toEqual(['stage', 'lines', 'tempo', 'cue', 'more']);
    const more = oneAttr(el, 'data-more', 'howto');
    const btn = oneAttr(more, 'data-more-btn');
    expect(btn.tag).toBe('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    const panel = oneAttr(more, 'data-more-panel');
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(oneAttr(panel, 'data-howto', 'focus').textContent).toContain('Focus');
    // The cue is never behind More.
    expect(byAttr(panel, 'data-howto', 'cue')).toHaveLength(0);
    btn.click();
    expect(panel.hasAttribute('hidden')).toBe(false);
    h.dispose();
  });

  it('opened while a workout is on screen: More starts open (nothing new to tap mid-set)', () => {
    const doc = globalThis.document as unknown as { querySelector?: (s: string) => unknown };
    doc.querySelector = (sel: string) => (sel.includes('[data-screen="exercise"]') ? {} : null);
    const h = createHowToSheet({ exerciseId: ID ?? '', tracking: 'manual', onClose: () => {} });
    const more = oneAttr(asFake(h.el), 'data-more', 'howto');
    expect(oneAttr(more, 'data-more-btn').getAttribute('aria-expanded')).toBe('true');
    expect(oneAttr(more, 'data-more-panel').hasAttribute('hidden')).toBe(false);
    h.dispose();
  });
});
