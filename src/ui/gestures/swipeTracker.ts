// M13d task 25: the touch plumbing shared by the page swipes (pageSwipe.ts) and the swipe-down
// sheets (sheetSwipe.ts). A pure classifier from src/core/gestures.ts decides; this feeds it the
// touch stream and acts:
//
// - `begin` (at touch start) says whether this touch may be the gesture and what follows the
//   finger; null leaves the touch to the browser.
// - Rejected by the classifier (a tap, a scroll, the wrong axis or direction): dropped, the
//   browser keeps the touch. preventDefault only once the swipe is ours (`tracking`).
// - Tracking: the mover follows the finger (transform only). A direction the screen can't go
//   (`allow` false, e.g. Next on the last page) stays put. Reduce Motion: no follow at all.
// - Release: `committed` in an allowed direction → call `commit` once, then clear the follow only
//   if the mover is still on the page (a sheet that closed is removed where the finger left it,
//   never snapped back first; a page that changed in place is reset). Anything else springs back
//   on the motion tokens. Reduce Motion: there is no follow, so nothing moves either way.
import type {
  SwipeDirection,
  SwipeOptions,
  SwipeResult,
  TouchPoint,
  Viewport,
} from '../../core/gestures';
import { DUR, EASE, reducedMotion as osReducedMotion } from '../motion';

export type SwipeClassifier = (
  points: readonly TouchPoint[],
  viewport: Viewport,
  opts?: SwipeOptions,
) => SwipeResult;

export type SwipeBegin = {
  /** What follows the finger. */
  mover: HTMLElement;
  /** Passed to the classifier (sheetDown: a scrolled sheet scrolls first). */
  scrollTop?: number | undefined;
};

export type SwipeTrackerOptions = {
  classify: SwipeClassifier;
  /** The follow's axis (matches the classifier's rule). */
  axis: 'x' | 'y';
  /** At touch start: null = not ours. */
  begin: (e: TouchEvent, start: TouchPoint) => SwipeBegin | null;
  /** May the gesture go this way now? Default: yes. */
  allow?: ((dir: SwipeDirection) => boolean) | undefined;
  /** Once per committed swipe. */
  commit: (dir: SwipeDirection) => void;
  /** Set on `el` while installed (e2e / test hook). */
  marker: string;
  /** Window size by default. */
  viewport?: (() => Viewport) | undefined;
  /** The OS setting by default. */
  reducedMotion?: (() => boolean) | undefined;
};

type Track = { points: TouchPoint[]; mover: HTMLElement; scrollTop: number; moved: boolean };

function pointOf(t: Touch | undefined, time: number): TouchPoint | null {
  return t ? { x: t.clientX, y: t.clientY, t: time } : null;
}

function windowViewport(): Viewport {
  const w = globalThis as { innerWidth?: number; innerHeight?: number };
  return { width: w.innerWidth ?? 390, height: w.innerHeight ?? 844 };
}

/** Installs the swipe on `el`. Returns uninstall (safe to call more than once). */
export function installSwipe(el: HTMLElement, o: SwipeTrackerOptions): () => void {
  const viewport = o.viewport ?? windowViewport;
  const reduced = o.reducedMotion ?? osReducedMotion;
  const allow = o.allow ?? (() => true);
  let track: Track | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const translate = (offset: number) =>
    o.axis === 'x'
      ? `translate3d(${Math.round(offset)}px, 0, 0)`
      : `translate3d(0, ${Math.round(offset)}px, 0)`;

  const clear = (mover: HTMLElement) => {
    mover.style.transform = '';
    mover.style.transition = '';
  };

  const follow = (mover: HTMLElement, offset: number) => {
    if (settle !== undefined) clearTimeout(settle);
    settle = undefined;
    mover.style.transition = 'none';
    mover.style.transform = translate(offset);
  };

  const springBack = (t: Track) => {
    if (!t.moved) return;
    const { mover } = t;
    if (reduced()) return clear(mover);
    mover.style.transition = `transform ${DUR.base}ms ${EASE.standard}`;
    mover.style.transform = '';
    settle = setTimeout(() => {
      settle = undefined;
      clear(mover);
    }, DUR.base + 40);
  };

  const classify = (t: Track, ended: boolean) =>
    o.classify(t.points, viewport(), { ended, scrollTop: t.scrollTop });

  const onStart = (e: TouchEvent) => {
    if (track) springBack(track);
    track = null;
    if (e.touches.length !== 1) return;
    const p = pointOf(e.touches[0], e.timeStamp);
    if (!p) return;
    const b = o.begin(e, p);
    if (!b) return;
    track = { points: [p], mover: b.mover, scrollTop: b.scrollTop ?? 0, moved: false };
  };

  const onMove = (e: TouchEvent) => {
    const t = track;
    if (!t) return;
    const p = pointOf(e.touches[0], e.timeStamp);
    if (e.touches.length !== 1 || !p) {
      springBack(t);
      track = null;
      return;
    }
    t.points.push(p);
    const r = classify(t, false);
    if (r.phase === 'rejected') {
      springBack(t);
      track = null;
      return;
    }
    if (r.phase !== 'tracking') return;
    if (e.cancelable) e.preventDefault();
    if (reduced()) return;
    t.moved = true;
    follow(t.mover, r.direction && allow(r.direction) ? r.offset : 0);
  };

  const onEnd = (e: TouchEvent) => {
    const t = track;
    track = null;
    if (!t) return;
    const p = pointOf(e.changedTouches[0], e.timeStamp);
    if (p) t.points.push(p);
    const r = classify(t, true);
    if (r.phase === 'committed' && r.direction && allow(r.direction)) {
      o.commit(r.direction);
      // Still on the page (a page changed in place, or a close that did not remove it): reset.
      if (t.mover.isConnected !== false) clear(t.mover);
    } else springBack(t);
  };

  const onCancel = () => {
    if (track) springBack(track);
    track = null;
  };

  el.addEventListener('touchstart', onStart as EventListener, { passive: true });
  el.addEventListener('touchmove', onMove as EventListener, { passive: false });
  el.addEventListener('touchend', onEnd as EventListener);
  el.addEventListener('touchcancel', onCancel);
  el.setAttribute(o.marker, '');

  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    onCancel();
    if (settle !== undefined) clearTimeout(settle);
    el.removeEventListener('touchstart', onStart as EventListener);
    el.removeEventListener('touchmove', onMove as EventListener);
    el.removeEventListener('touchend', onEnd as EventListener);
    el.removeEventListener('touchcancel', onCancel);
    el.removeAttribute(o.marker);
  };
}
