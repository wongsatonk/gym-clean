// M13d task 25 (SPEC M13d Goal 5c): swipe down to close a sheet that has a Close button. The
// swipe calls the sheet's own Close (pass `() => closeButton.click()` or the same function the
// button runs), so there is one code path and the button stays. The pure classifier is
// `sheetDown` in src/core/gestures.ts.
//
// - A scrolled sheet scrolls first: the scrollTop of every scroll box between the finger and the
//   sheet, read at touch start, goes to the classifier (> 0 → not a close; the browser scrolls).
// - The panel follows the finger downwards (transform only); a short drag springs back; past 30%
//   of the height or a quick flick closes. Reduce Motion: no follow, the same close.
// - Never during a set: nothing while a workout is on screen (`[data-in-workout]`, Exercise /
//   Rest / Summary, the workout camera sheet; the edge swipe's list). The Pause sheet does not
//   install it (SPEC: excluded).
// - Touches that start on a control that drags by itself (a 3D canvas, a slider, a text field)
//   or inside `[data-no-sheet-swipe]` are left alone, and so are touches that belong to another
//   swipe-down sheet nested inside this one (only the innermost acts).
//
// e2e hooks: `[data-sheet-swipe]` on the sheet while installed.
import { sheetDown } from '../../core/gestures';
import { workoutOnScreen } from './edgeBack';
import { installSwipe } from './swipeTracker';

export const SHEET_SWIPE_ATTR = 'data-sheet-swipe';

/** Touches starting inside these are never a swipe-down. */
export const NO_SHEET_SWIPE =
  'canvas, input, textarea, select, [contenteditable="true"], [data-no-sheet-swipe]';

export type SheetSwipeOptions = {
  /** The sheet's own Close. */
  close: () => void;
  /** What follows the finger (the panel); the sheet by default. */
  mover?: HTMLElement | undefined;
  /** More places to leave alone (e.g. the How-to sheet's 3D stage). */
  ignore?: string | undefined;
  /** Tests: window size / OS setting by default. */
  viewport?: (() => { width: number; height: number }) | undefined;
  reducedMotion?: (() => boolean) | undefined;
};

type Scrollish = { scrollTop?: number; parentElement?: Scrollish | null };

/** Sum of scrollTop from `from` up to and including `sheet` (any > 0 means "scrolled"). */
export function scrollAbove(from: unknown, sheet: HTMLElement): number {
  let sum = 0;
  let reached = false;
  let n = from as Scrollish | null | undefined;
  for (let i = 0; n && i < 64; i++) {
    sum += Math.max(0, n.scrollTop ?? 0);
    if (n === (sheet as unknown)) {
      reached = true;
      break;
    }
    n = n.parentElement;
  }
  if (!reached) sum += Math.max(0, sheet.scrollTop ?? 0);
  return sum;
}

function inWorkout(sheet: HTMLElement): boolean {
  if (typeof sheet.closest === 'function' && sheet.closest('[data-in-workout]') !== null)
    return true;
  return workoutOnScreen((sheet.ownerDocument ?? globalThis.document) as Document | undefined);
}

function startsOnIgnored(target: unknown, sheet: HTMLElement, extra?: string): boolean {
  const t = target as Partial<Element> | null;
  if (!t || typeof t.closest !== 'function') return false;
  const sel = extra ? `${NO_SHEET_SWIPE}, ${extra}` : NO_SHEET_SWIPE;
  const hit = t.closest(sel);
  if (hit && sheet.contains(hit)) return true;
  // A swipe-down sheet nested inside this one owns its own touches.
  const owner = t.closest(`[${SHEET_SWIPE_ATTR}]`);
  return owner !== null && owner !== sheet;
}

/** Installs swipe-down-to-close on `sheet`. Returns uninstall. */
export function installSheetSwipe(sheet: HTMLElement, o: SheetSwipeOptions): () => void {
  const mover = o.mover ?? sheet;
  return installSwipe(sheet, {
    classify: sheetDown,
    axis: 'y',
    marker: SHEET_SWIPE_ATTR,
    viewport: o.viewport,
    reducedMotion: o.reducedMotion,
    begin: (e) => {
      if (inWorkout(sheet)) return null;
      if (startsOnIgnored(e.target, sheet, o.ignore)) return null;
      return { mover, scrollTop: scrollAbove(e.target, sheet) };
    },
    commit: () => o.close(),
  });
}
