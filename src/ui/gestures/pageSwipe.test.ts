// M13d task 25 (review fix): the page swipe leaves an edge-zone touch to the app's edge swipe only
// when that edge swipe has something to press (`swipeBackTarget(root)` non-null). With no target
// (the What's New tour has no marked Back) the page swipe keeps the edge, so the tour is never
// dead there. Gesture thresholds are core's (gestures.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEl, useFakeDom } from '../screens/testDom';
import { installPageSwipe, notOurs } from './pageSwipe';
import { fakeSwipe } from './testTouch';

const target = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('./edgeBack', async (orig) => ({
  ...(await orig<typeof import('./edgeBack')>()),
  swipeBackTarget: () => target.value,
}));

useFakeDom();

beforeEach(() => {
  target.value = null;
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

/** A swipe area under an installed edge swipe (`[data-edge-back]` root). */
function area() {
  const root = new FakeEl('div');
  root.setAttribute('data-edge-back', '');
  const body = Object.assign(new FakeEl('div'), {
    closest: (sel: string) => (sel === '[data-edge-back]' ? root : null),
  });
  const page = new FakeEl('section');
  body.append(page);
  const onBack = vi.fn();
  const onNext = vi.fn();
  installPageSwipe(body as unknown as HTMLElement, {
    mover: page as unknown as HTMLElement,
    onNext,
    onBack,
    canNext: () => true,
    canBack: () => true,
    viewport: () => ({ width: 390, height: 844 }),
    reducedMotion: () => false,
  });
  return { body, page, onBack, onNext };
}

const FROM_EDGE = { from: { x: 10, y: 400 }, to: { x: 260, y: 400 } };

describe('page swipe vs the edge swipe', () => {
  it('no edge target (the tour): a swipe from the edge is the page swipe’s Back', () => {
    const { body, onBack } = area();
    expect(notOurs(body as unknown as HTMLElement, 10)).toBe(false);
    fakeSwipe(body, FROM_EDGE);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('an edge target: the edge touch is left to the edge swipe (only one presses Back)', () => {
    target.value = new FakeEl('button');
    const { body, onBack } = area();
    expect(notOurs(body as unknown as HTMLElement, 10)).toBe(true);
    const s = fakeSwipe(body, FROM_EDGE);
    expect(s.prevented).toBe(0);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('away from the edge the page swipe acts either way', () => {
    target.value = new FakeEl('button');
    const { body, onBack } = area();
    expect(notOurs(body as unknown as HTMLElement, 80)).toBe(false);
    fakeSwipe(body, { from: { x: 80, y: 400 }, to: { x: 330, y: 400 } });
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
