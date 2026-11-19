// M13d task 25 (SPEC M13d Goal 5b): swipe sideways between the pages of the first run and the
// What's New tour. Left = Next, right = Back; the buttons stay and do the same thing (the swipe is
// a shortcut, never the only way). The pure classifier is `pageSwipe` in src/core/gestures.ts.
//
// - The page follows the finger (transform only); a way the tour can't go (Back on page 1, Next
//   on the last page or on an ask page) stays put and does nothing. Reduce Motion: no follow.
// - A touch that starts in the left edge zone while the app's edge swipe is installed
//   (`[data-edge-back]` on an ancestor, task 27) and would press something there
//   (`swipeBackTarget(root)` non-null) is left to it: both mean Back, and only one may press it.
//   With no edge target (the What's New tour has no marked Back) the page swipe keeps the edge.
// - Never in a workout (`[data-in-workout]`, as the edge swipe): the first run and the tour are
//   never shown there, but the rule holds here too.
//
// e2e hooks: `[data-page-swipe]` on the swipe area while installed.
import { pageSwipe, SWIPE_RULES, type SwipeDirection } from '../../core/gestures';
import { NO_SWIPE_BACK, swipeBackTarget } from './edgeBack';
import { installSwipe } from './swipeTracker';

export const PAGE_SWIPE_ATTR = 'data-page-swipe';

export type PageSwipeOptions = {
  /** What follows the finger (the page inside `area`). */
  mover: HTMLElement;
  /** Swipe left (only while `canNext()`). */
  onNext: () => void;
  /** Swipe right (only while `canBack()`). */
  onBack: () => void;
  canNext: () => boolean;
  canBack: () => boolean;
  /** Tests: window size / OS setting by default. */
  viewport?: (() => { width: number; height: number }) | undefined;
  reducedMotion?: (() => boolean) | undefined;
};

/**
 * True while `el` is in a workout, or the touch at `x` starts in the edge zone of an installed
 * edge swipe that has a control to press (it owns that touch).
 */
export function notOurs(el: HTMLElement, x: number): boolean {
  if (typeof el.closest !== 'function') return false;
  if (el.closest('[data-in-workout]') !== null) return true;
  const doc = el.ownerDocument as Document | undefined;
  if (doc && typeof doc.querySelector === 'function' && doc.querySelector(NO_SWIPE_BACK) !== null)
    return true;
  const edgePx = SWIPE_RULES.edgeBack.edgePx ?? 24;
  if (x > edgePx) return false;
  const edgeRoot = el.closest('[data-edge-back]');
  return edgeRoot !== null && swipeBackTarget(edgeRoot) !== null;
}

/** Installs the page swipe on `area`. Returns uninstall. */
export function installPageSwipe(area: HTMLElement, o: PageSwipeOptions): () => void {
  const can = (dir: SwipeDirection) =>
    dir === 'left' ? o.canNext() : dir === 'right' ? o.canBack() : false;
  return installSwipe(area, {
    classify: pageSwipe,
    axis: 'x',
    marker: PAGE_SWIPE_ATTR,
    viewport: o.viewport,
    reducedMotion: o.reducedMotion,
    begin: (_e, start) => (notOurs(area, start.x) ? null : { mover: o.mover }),
    allow: can,
    commit: (dir) => {
      if (dir === 'left') o.onNext();
      else if (dir === 'right') o.onBack();
    },
  });
}
