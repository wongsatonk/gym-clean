// M12 slice 1c task 8 (+ 2b version line): What's New tour render tests (fake DOM, made-up
// pages; the real page data is src/data/whatsNew/pages.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRoute, WhatsNewPage } from '../../core/types';
import { versionLabel } from '../../core/version';
import { FakeEl, asFake, useFakeDom } from '../screens/testDom';
import { pageCount, SWIPE_MIN_PX, whatsNewTour, type TourTopic } from './whatsNewTour';

useFakeDom();

const PAGES: WhatsNewPage[] = [
  {
    release: '9.9.0',
    id: 'p1',
    title: 'A test page',
    what: 'Something moved.',
    why: 'So it is easier.',
    tryIt: 'coach',
    icon: 'chat',
  },
  {
    release: '9.9.0',
    id: 'p2',
    title: 'Second page',
    what: 'Another change.',
    why: 'Because.',
    tryIt: 'calendar',
  },
  { release: '9.9.0', id: 'p3', title: 'No try page', what: 'Read only.', why: 'Info.' },
];
const TOPICS: TourTopic[] = [
  { id: 't1', title: 'Try the test topic', checkpoint: 'Checkpoint Z' },
  { id: 't2', title: 'Another topic' },
];

type Calls = { tryIt: AppRoute[]; skip: number; done: number; todos: number };

function render(over: { pages?: WhatsNewPage[]; topics?: TourTopic[]; start?: number } = {}) {
  const calls: Calls = { tryIt: [], skip: 0, done: 0, todos: 0 };
  const tour = whatsNewTour(
    {
      pages: over.pages ?? PAGES,
      addedTopics: over.topics ?? TOPICS,
      version: 'Version 9.9.0 (build abc1234)',
      startIndex: over.start,
    },
    {
      onTryIt: (r) => calls.tryIt.push(r),
      onSkip: () => calls.skip++,
      onDone: () => calls.done++,
      onOpenTodos: () => calls.todos++,
    },
  );
  return { tour, el: asFake(tour.el), calls };
}

const wn = (el: FakeEl, key: string) => el.find((e) => e.getAttribute('data-wn') === key);
const one = (el: FakeEl, key: string) => {
  const hit = wn(el, key)[0];
  if (!hit) throw new Error(`no [data-wn=${key}]`);
  return hit;
};
const key = (el: FakeEl, k: string, shiftKey = false) => {
  const ev = { key: k, shiftKey, preventDefault: vi.fn() };
  el.dispatch('keydown', ev);
  return ev;
};

/** Stubs prefers-reduced-motion and gives FakeEl an `animate` spy. */
let animate: ReturnType<typeof vi.fn>;
function setReduced(reduce: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('reduce'),
  }));
}
beforeEach(() => {
  animate = vi.fn(() => ({ cancel: vi.fn() }));
  (FakeEl.prototype as unknown as { animate: unknown }).animate = animate;
  setReduced(false);
});
afterEach(() => {
  delete (FakeEl.prototype as unknown as { animate?: unknown }).animate;
  vi.unstubAllGlobals();
});

describe("What's New tour", () => {
  it('is a modal dialog named by the page title, with a page count and dots', () => {
    const { el, tour } = render();
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-modal')).toBe('true');
    const title = one(el, 'title');
    expect(el.getAttribute('aria-labelledby')).toBe(title.getAttribute('id'));
    expect(title.textContent).toBe('A test page');
    expect(tour.total()).toBe(4); // 3 pages + "Added to your to-dos"
    expect(one(el, 'count').textContent).toBe('1 of 4');
    expect(one(el, 'live').textContent).toBe('Page 1 of 4: A test page');
    const dots = one(el, 'dots');
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.children.map((d) => d.classes.includes('on'))).toEqual([true, false, false, false]);
  });

  it('page 1 shows the version label under the title, later pages do not', () => {
    const { el, tour } = render();
    expect(one(el, 'version').textContent).toBe('Version 9.9.0 (build abc1234)');
    tour.next();
    expect(wn(el, 'version')).toHaveLength(0);
  });

  it('defaults the version to versionLabel()', () => {
    const tour = whatsNewTour(
      { pages: PAGES, addedTopics: [] },
      { onTryIt: () => {}, onSkip: () => {}, onDone: () => {}, onOpenTodos: () => {} },
    );
    expect(one(asFake(tour.el), 'version').textContent).toBe(versionLabel());
    expect(versionLabel()).toMatch(/^Version \d+\.\d+\.\d+/);
  });

  it('shows what + why and the icon', () => {
    const { el } = render();
    expect(one(el, 'what').textContent).toBe('Something moved.');
    expect(one(el, 'why').textContent).toBe('So it is easier.');
    expect(el.byClass('wn-icon')).toHaveLength(1);
  });

  it('Try it calls back with the page route; a page without tryIt has no button', () => {
    const { el, tour, calls } = render();
    const t = one(el, 'try');
    expect(t.textContent).toBe('Try it');
    expect(t.getAttribute('aria-label')).toBe('Try it: A test page');
    t.click();
    tour.next();
    one(el, 'try').click();
    expect(calls.tryIt).toEqual(['coach', 'calendar']);
    tour.next();
    expect(wn(el, 'try')).toHaveLength(0);
  });

  it('Skip is visible on every page and calls onSkip', () => {
    const { el, tour, calls } = render();
    for (let i = 0; i < tour.total(); i++) {
      expect(one(el, 'skip').textContent).toBe('Skip');
      tour.next();
    }
    one(el, 'skip').click();
    expect(calls.skip).toBe(1);
  });

  it('Next / Back buttons move; Back is disabled on page 1; Next becomes Done on the last', () => {
    const { el, tour, calls } = render();
    const back = one(el, 'back');
    const next = one(el, 'next');
    expect(back.hasAttribute('disabled')).toBe(true);
    expect(next.textContent).toBe('Next');
    next.click();
    expect(tour.index()).toBe(1);
    expect(back.hasAttribute('disabled')).toBe(false);
    back.click();
    expect(tour.index()).toBe(0);
    next.click();
    next.click();
    next.click();
    expect(tour.index()).toBe(3);
    expect(next.textContent).toBe('Done');
    expect(next.getAttribute('data-last')).toBe('true');
    expect(calls.done).toBe(0);
    next.click();
    expect(calls.done).toBe(1);
    expect(tour.index()).toBe(3);
  });

  it('last page: "Added to your to-dos" lists the topics with checkpoints + Open to-dos', () => {
    const { el, calls } = render({ start: 3 });
    expect(one(el, 'title').textContent).toBe('Added to your to-dos');
    expect(one(el, 'page').getAttribute('data-kind')).toBe('todos');
    const items = el.byClass('wn-topic');
    expect(items.map((i) => i.getAttribute('data-topic'))).toEqual(['t1', 't2']);
    expect(items[0]?.textContent).toBe('Try the test topicCheckpoint Z');
    expect(items[1]?.byClass('wn-topic-cp')).toHaveLength(0);
    one(el, 'open-todos').click();
    expect(calls.todos).toBe(1);
    expect(one(el, 'count').textContent).toBe('4 of 4');
  });

  it('no new topics → no to-dos page; the last feature page has Done', () => {
    const { el, tour } = render({ topics: [] });
    expect(tour.total()).toBe(3);
    tour.next();
    tour.next();
    expect(one(el, 'title').textContent).toBe('No try page');
    expect(one(el, 'next').textContent).toBe('Done');
  });

  it('keyboard: ArrowRight / ArrowLeft page, Escape skips', () => {
    const { el, tour, calls } = render();
    expect(key(el, 'ArrowRight').preventDefault).toHaveBeenCalled();
    expect(tour.index()).toBe(1);
    key(el, 'ArrowLeft');
    expect(tour.index()).toBe(0);
    key(el, 'ArrowLeft');
    expect(tour.index()).toBe(0);
    for (let i = 0; i < 6; i++) key(el, 'ArrowRight');
    expect(tour.index()).toBe(3);
    expect(calls.done).toBe(0); // the arrow never finishes the tour
    key(el, 'Escape');
    expect(calls.skip).toBe(1);
  });

  it('Tab is trapped: last → first, Shift+Tab first → last (disabled Back skipped)', () => {
    const { el } = render();
    const skip = one(el, 'skip');
    const next = one(el, 'next');
    next.focus();
    const ev = key(el, 'Tab');
    expect(ev.preventDefault).toHaveBeenCalled();
    expect(document.activeElement).toBe(skip);
    key(el, 'Tab', true);
    expect(document.activeElement).toBe(next);
    // Middle of the list: the browser moves focus, we do nothing.
    one(el, 'try').focus();
    expect(key(el, 'Tab').preventDefault).not.toHaveBeenCalled();
  });

  it('focus on Back stays in the dialog when Back is disabled on page 1', () => {
    const { el, tour } = render({ start: 1 });
    one(el, 'back').focus();
    one(el, 'back').click();
    expect(tour.index()).toBe(0);
    expect(document.activeElement).toBe(one(el, 'next'));
  });

  it('swipe left / right on the page is a shortcut; short or vertical moves do nothing', () => {
    const { el, tour } = render();
    const body = one(el, 'body');
    const swipe = (dx: number, dy = 0) => {
      body.dispatch('pointerdown', { clientX: 200, clientY: 300 });
      body.dispatch('pointerup', { clientX: 200 + dx, clientY: 300 + dy });
    };
    swipe(-(SWIPE_MIN_PX + 10));
    expect(tour.index()).toBe(1);
    swipe(SWIPE_MIN_PX + 10);
    expect(tour.index()).toBe(0);
    swipe(-(SWIPE_MIN_PX - 10));
    expect(tour.index()).toBe(0);
    swipe(-80, 200);
    expect(tour.index()).toBe(0);
  });

  it('a page change slides via enterScreen (transform/opacity) in the direction of travel', () => {
    const { el, tour } = render();
    expect(animate).not.toHaveBeenCalled(); // no motion on first show
    tour.next();
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = animate.mock.calls[0]?.[0] as Keyframe[];
    expect(frames[0]).toEqual({ opacity: 0, transform: 'translateX(8px)' });
    tour.back();
    expect((animate.mock.calls[1]?.[0] as Keyframe[])[0]?.transform).toBe('translateX(-8px)');
    expect(animate.mock.contexts[0]).toBe(one(el, 'page'));
  });

  it('reduced motion: no animation and no animation class', () => {
    setReduced(true);
    const { el, tour } = render();
    tour.next();
    tour.next();
    expect(animate).not.toHaveBeenCalled();
    const animated = [el, ...el.find(() => true)].filter((e) =>
      e.classes.some((c) => /^(motion-|anim)|stagger|slide/.test(c)),
    );
    expect(animated).toHaveLength(0);
  });

  it('pageCount', () => {
    expect(pageCount(1, 6)).toBe('2 of 6');
  });
});
