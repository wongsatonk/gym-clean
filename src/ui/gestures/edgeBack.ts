// M13d task 24 (SPEC M13d Goal 5a): iOS-style swipe back from the left edge. The pure classifier
// (`edgeBack` in src/core/gestures.ts) decides; this file feeds it touches and acts:
//
// - It works only where the current screen has exactly one opt-in Back control,
//   `[data-swipe-back]` (backButton() marks itself; the intake / to-do guide mark their step Back
//   instead of their close). With a sheet open (`[aria-modal="true"]`) only the top sheet counts,
//   so a sheet with no swipe-back control blocks the screen under it. Nothing marked: nothing.
// - Never in a workout: `[data-in-workout]` on the root (app.ts, task 27) or any of the Exercise /
//   Rest / Summary screens or the camera sheet inside it.
// - While the finger is down the screen follows it (transform only; a cancel springs back on the
//   motion tokens). Reduce Motion: no follow, the same action on release.
// - On a commit it calls `.click()` on that control (its own handler does the Back, so there is
//   one code path) and then the injected `feel()` (task 27 passes the light haptic in the iPhone
//   app; nothing native is imported here).
// - Anything the classifier rejects (a vertical scroll, a touch away from the edge, a tap) is left
//   to the browser: preventDefault only once the swipe is ours.
//
// main installs it once on #app (task 27): `installEdgeBack(root, { feel })` → uninstall().
// e2e hooks: `[data-edge-back]` on the root while installed.
import { edgeBack, SWIPE_RULES, type TouchPoint, type Viewport } from '../../core/gestures';
import { DUR, EASE, reducedMotion as osReducedMotion } from '../motion';
import './edgeBack.css';

/** The one Back control a screen offers to the edge swipe. */
export const SWIPE_BACK = '[data-swipe-back]';

/** No edge swipe while any of these is on screen (SPEC: nothing new during a set). */
export const NO_SWIPE_BACK =
  '[data-in-workout], [data-screen="exercise"], [data-screen="rest"], [data-screen="summary"], .camera-sheet';

/**
 * True while a workout is on screen (anything in NO_SWIPE_BACK). Sheets opened then show their
 * "More" already open, so nothing new has to be tapped mid-set (M13d review decision).
 */
export function workoutOnScreen(
  doc: Pick<Document, 'querySelector'> | null | undefined = globalThis.document,
): boolean {
  return (
    !!doc && typeof doc.querySelector === 'function' && doc.querySelector(NO_SWIPE_BACK) !== null
  );
}

/**
 * Marks a sheet or toast that mounts outside the screen tree (on document.body) `data-motion="off"`
 * when a workout is on screen as it opens, so nothing new moves mid-set: its round buttons keep
 * the colour change without the press scale and glow (iconButton.css), and the motion.ts helpers
 * leave it still (MOTION_OFF). Off a workout it is left alone. Returns `el`.
 */
export function motionOffInWorkout<T extends Pick<Element, 'setAttribute'>>(
  el: T,
  doc: Pick<Document, 'querySelector'> | null | undefined = globalThis.document,
): T {
  if (workoutOnScreen(doc)) el.setAttribute('data-motion', 'off');
  return el;
}

const MODAL = '[aria-modal="true"]';
/** On the screen while it follows the finger (its leading edge; edgeBack.css). */
export const MOVING_CLASS = 'edge-back-moving';

export type EdgeBackOptions = {
  /** Called once per committed swipe, after the click (the light haptic in the iPhone app). */
  feel?: (() => void) | undefined;
  /** Window size by default. */
  viewport?: (() => Viewport) | undefined;
  /** The OS setting by default. */
  reducedMotion?: (() => boolean) | undefined;
};

function shown(el: Element): boolean {
  return el.closest('[hidden], [inert]') === null;
}

function enabled(el: Element): boolean {
  return !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true';
}

/**
 * The control an edge swipe would press right now, or null (in a workout, a tab root, a sheet
 * without one, or more than one marked: never guess).
 */
export function swipeBackTarget(root: Element): HTMLElement | null {
  if (root.closest('[data-in-workout]') !== null) return null;
  if (root.querySelector(NO_SWIPE_BACK) !== null) return null;
  const doc = root.ownerDocument;
  const modals = [...doc.querySelectorAll(MODAL)].filter(shown);
  const scope = modals[modals.length - 1] ?? root;
  const found = [...scope.querySelectorAll<HTMLElement>(SWIPE_BACK)].filter(
    (el) => shown(el) && enabled(el),
  );
  return found.length === 1 ? (found[0] ?? null) : null;
}

/** What follows the finger: the sheet or screen holding the control. */
function moverFor(target: HTMLElement, root: HTMLElement): HTMLElement {
  return (
    target.closest<HTMLElement>(MODAL) ??
    target.closest<HTMLElement>('.screen') ??
    (root.firstElementChild as HTMLElement | null) ??
    root
  );
}

type Track = {
  points: TouchPoint[];
  target: HTMLElement;
  mover: HTMLElement;
  moved: boolean;
};

function pointOf(t: Touch | undefined, time: number): TouchPoint | null {
  return t ? { x: t.clientX, y: t.clientY, t: time } : null;
}

/** Installs the edge swipe on `root`. Returns uninstall (safe to call more than once). */
export function installEdgeBack(root: HTMLElement, opts: EdgeBackOptions = {}): () => void {
  const viewport =
    opts.viewport ?? (() => ({ width: window.innerWidth, height: window.innerHeight }));
  const reduced = opts.reducedMotion ?? osReducedMotion;
  const edgePx = SWIPE_RULES.edgeBack.edgePx ?? 24;
  let track: Track | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const follow = (mover: HTMLElement, offset: number) => {
    if (settle !== undefined) clearTimeout(settle);
    mover.classList.add(MOVING_CLASS);
    mover.style.transition = 'none';
    mover.style.transform = `translate3d(${Math.round(offset)}px, 0, 0)`;
  };

  const clear = (mover: HTMLElement) => {
    mover.classList.remove(MOVING_CLASS);
    mover.style.transform = '';
    mover.style.transition = '';
  };

  /** Spring back to place (cancel), on the motion tokens. */
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

  const commit = (t: Track) => {
    clear(t.mover);
    if (!t.target.isConnected) return;
    t.target.click();
    try {
      opts.feel?.();
    } catch {
      // A haptic that fails never blocks Back.
    }
  };

  const onStart = (e: TouchEvent) => {
    if (track) springBack(track);
    track = null;
    if (e.touches.length !== 1) return;
    const p = pointOf(e.touches[0], e.timeStamp);
    if (!p || p.x > edgePx) return;
    const target = swipeBackTarget(root);
    if (!target) return;
    track = { points: [p], target, mover: moverFor(target, root), moved: false };
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
    const r = edgeBack(t.points, viewport());
    if (r.phase === 'rejected') {
      springBack(t);
      track = null;
      return;
    }
    if (r.phase !== 'tracking') return;
    if (e.cancelable) e.preventDefault();
    if (reduced()) return;
    t.moved = true;
    follow(t.mover, r.offset);
  };

  const onEnd = (e: TouchEvent) => {
    const t = track;
    track = null;
    if (!t) return;
    const p = pointOf(e.changedTouches[0], e.timeStamp);
    if (p) t.points.push(p);
    const r = edgeBack(t.points, viewport(), { ended: true });
    if (r.phase === 'committed') commit(t);
    else springBack(t);
  };

  const onCancel = () => {
    if (track) springBack(track);
    track = null;
  };

  root.addEventListener('touchstart', onStart, { passive: true });
  root.addEventListener('touchmove', onMove, { passive: false });
  root.addEventListener('touchend', onEnd);
  root.addEventListener('touchcancel', onCancel);
  root.setAttribute('data-edge-back', '');

  let installed = true;
  return () => {
    if (!installed) return;
    installed = false;
    onCancel();
    if (settle !== undefined) clearTimeout(settle);
    root.removeEventListener('touchstart', onStart);
    root.removeEventListener('touchmove', onMove);
    root.removeEventListener('touchend', onEnd);
    root.removeEventListener('touchcancel', onCancel);
    root.removeAttribute('data-edge-back');
  };
}
