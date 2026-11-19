// M13d task 26 (SPEC M13d Goal 5): swipe left on a logged meal row to show Delete. The pure
// classifier (`rowReveal` in src/core/gestures.ts: left, 72 px or a flick) decides; this file
// feeds it touches and acts, the same way as gestures/edgeBack.ts:
//
// - While the finger is down the row follows it (transform only, past the Delete width it drags
//   with resistance); on a commit it settles open with Delete showing, else springs back, on the
//   motion tokens. Reduce Motion: no follow, the row just opens on release.
// - Delete is the round danger button (iconButton: trash icon + the word, 56 px circle, the whole
//   button ≥ 56 px). It is built on the first swipe (an untouched row is still one button) and
//   hidden again when the row closes. A tap on it calls `onDelete` (the Fuel controller's existing
//   delete + 10 s Undo toast).
// - A tap anywhere else closes it: on the row itself it only closes (the sheet does not open),
//   elsewhere the tap goes on as usual. One row open at a time.
// - A tap on a closed row still opens the sheet (the row's own click; the button path is kept).
//   Anything the classifier rejects (a vertical scroll, a right swipe) is left to the browser:
//   preventDefault only once the swipe is ours.
//
// e2e hooks: `[data-swipe-row]` on the row, `[data-swipe-open]` while open, the Delete button is
// `[data-entry-delete=<id>]` inside `[data-entry-swipe]`.
import { rowReveal, type TouchPoint, type Viewport } from '../../core/gestures';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { DUR, EASE, reducedMotion as osReducedMotion } from '../motion';
import './mealSwipe.css';

/** Width of the Delete area the row slides aside for (px; mealSwipe.css uses the same). */
export const REVEAL_PX = 104;
/** Past the Delete width the row follows at this share of the finger (resistance). */
const OVERDRAG = 1 / 3;
/** A click this soon after a swipe is the swipe's own, never a tap on the row. */
const SWALLOW_MS = 400;

export type MealSwipeOptions = {
  /** The entry id (the Delete button's `data-entry-delete`). */
  id: string;
  /** The meal's name: Delete's accessible name is "Delete <label>". */
  label: string;
  onDelete: () => void;
  /** Window size by default. */
  viewport?: (() => Viewport) | undefined;
  /** The OS setting by default. */
  reducedMotion?: (() => boolean) | undefined;
};

type Opened = { close: () => void };
/** The one open row on screen (opening another closes it). */
let openRow: Opened | null = null;

type Target = { closest?: (sel: string) => Element | null } | null;

function inPanel(t: EventTarget | null): boolean {
  return ((t as Target)?.closest?.('[data-entry-swipe]') ?? null) !== null;
}

function pointOf(t: Touch | undefined, time: number): TouchPoint | null {
  return t ? { x: t.clientX, y: t.clientY, t: time } : null;
}

/**
 * Makes `row` swipeable: `slider` (the row's own button) moves aside to show Delete. Returns the
 * row (for chaining in a render).
 */
export function mealSwipe<T extends HTMLElement>(
  row: T,
  slider: HTMLElement,
  opts: MealSwipeOptions,
): T {
  const win = globalThis as { innerWidth?: number; innerHeight?: number };
  // rowReveal commits by px, so the size only matters to the classifier's shape.
  const viewport =
    opts.viewport ?? (() => ({ width: win.innerWidth ?? 0, height: win.innerHeight ?? 0 }));
  const reduced = opts.reducedMotion ?? osReducedMotion;
  let panel: HTMLElement | null = null;
  let open = false;
  let points: TouchPoint[] | null = null;
  let tracked = false;
  /** Set for a moment after a swipe ends: its click (if the browser sends one) is not a tap. */
  let swallow = false;
  let outside: ((e: Event) => void) | null = null;
  let settle: ReturnType<typeof setTimeout> | undefined;

  const ensurePanel = (): HTMLElement => {
    if (panel) return panel;
    panel = h(
      'div',
      { class: 'fuel-entry-swipe', 'data-entry-swipe': true, hidden: true },
      iconButton({
        icon: 'trash',
        label: 'Delete',
        ariaLabel: `Delete ${opts.label}`,
        variant: 'danger',
        hooks: { 'data-entry-delete': opts.id },
        onClick: () => {
          if (openRow === self) openRow = null;
          opts.onDelete();
        },
      }),
    );
    row.prepend(panel);
    return panel;
  };

  const place = (px: number, animate: boolean) => {
    if (settle !== undefined) clearTimeout(settle);
    settle = undefined;
    slider.style.transition =
      animate && !reduced() ? `transform ${DUR.base}ms ${EASE.standard}` : 'none';
    slider.style.transform = px === 0 ? '' : `translate3d(${Math.round(px)}px, 0, 0)`;
  };

  /** Shows the Delete area behind the row (before any follow). */
  const uncover = () => {
    ensurePanel().removeAttribute('hidden');
    row.setAttribute('data-swiping', '');
  };

  const close = () => {
    const wasOpen = open;
    open = false;
    if (openRow === self) openRow = null;
    row.removeAttribute('data-swipe-open');
    if (!panel) return;
    const p = panel;
    const done = () => {
      settle = undefined;
      if (open) return;
      p.setAttribute('hidden', '');
      row.removeAttribute('data-swiping');
      slider.style.transition = '';
    };
    place(0, wasOpen || tracked);
    if (reduced()) done();
    else settle = setTimeout(done, DUR.base + 40);
  };

  const self: Opened = { close };

  const openUp = () => {
    if (openRow && openRow !== self) openRow.close();
    openRow = self;
    open = true;
    uncover();
    row.setAttribute('data-swipe-open', '');
    place(-REVEAL_PX, true);
    listenOutside();
  };

  /** A press anywhere off this row closes it (the press itself goes on as usual). */
  const listenOutside = () => {
    if (outside) return;
    const doc = row.ownerDocument ?? document;
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (open && row.isConnected && t && row.contains?.(t)) return;
      doc.removeEventListener('pointerdown', onDown, true);
      outside = null;
      if (open) close();
    };
    outside = onDown;
    doc.addEventListener('pointerdown', onDown, true);
  };

  const follow = (offset: number) => {
    if (reduced()) return;
    const past = Math.min(0, offset + REVEAL_PX);
    const px = past < 0 ? -REVEAL_PX + past * OVERDRAG : offset;
    place(px, false);
  };

  const onStart = (e: TouchEvent) => {
    points = null;
    tracked = false;
    if (open || e.touches.length !== 1 || inPanel(e.target)) return;
    const p = pointOf(e.touches[0], e.timeStamp);
    if (p) points = [p];
  };

  const onMove = (e: TouchEvent) => {
    if (!points) return;
    const p = pointOf(e.touches[0], e.timeStamp);
    if (e.touches.length !== 1 || !p) return cancel();
    points.push(p);
    const r = rowReveal(points, viewport());
    if (r.phase === 'rejected') return cancel();
    if (r.phase !== 'tracking') return;
    if (e.cancelable) e.preventDefault();
    if (!tracked) {
      tracked = true;
      uncover();
    }
    follow(r.offset);
  };

  const onEnd = (e: TouchEvent) => {
    const pts = points;
    points = null;
    if (!pts) return;
    const p = pointOf(e.changedTouches[0], e.timeStamp);
    if (p) pts.push(p);
    const r = rowReveal(pts, viewport(), { ended: true });
    if (tracked) {
      swallow = true;
      setTimeout(() => (swallow = false), SWALLOW_MS);
    }
    if (r.phase === 'committed') openUp();
    else if (tracked) close();
    tracked = false;
  };

  const cancel = () => {
    points = null;
    if (tracked) close();
    tracked = false;
  };

  // Capture: runs before the row button's own click, so it can keep the sheet shut.
  const onClick = (e: Event) => {
    const swipeClick = swallow && !inPanel(e.target);
    if (!swipeClick && (!open || inPanel(e.target))) return;
    e.preventDefault();
    e.stopPropagation();
    if (open && !inPanel(e.target)) close();
  };

  row.setAttribute('data-swipe-row', '');
  row.addEventListener('touchstart', onStart as (e: Event) => void, { passive: true });
  row.addEventListener('touchmove', onMove as (e: Event) => void, { passive: false });
  row.addEventListener('touchend', onEnd as (e: Event) => void);
  row.addEventListener('touchcancel', cancel);
  row.addEventListener('click', onClick, true);
  return row;
}
