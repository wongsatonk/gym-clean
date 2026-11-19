/**
 * M13d Goal 5: pure swipe classifiers (edge swipe back, page swipes, swipe-down sheets, meal-row
 * reveal). They read a touch stream — `{ x, y, t }` points in px / ms, first point = touch start,
 * last point = the latest move (or the release point when `ended`) — plus the viewport size, and
 * say what the UI should do. No DOM: `src/ui/gestures/*` feeds pointer events in and acts on the
 * result. Every gesture also has a button that does the same thing; these only decide intent.
 *
 * Shared logic: a gesture **locks** at the first point ≥ `lockPx` from the start. It must then be
 * along its axis (|along| > `axisRatio` · |across|) and in its direction, else it is `rejected`
 * for good (the browser keeps the touch, e.g. a vertical scroll). Once locked it is `tracking`
 * (follow the finger with `offset`); on release it is `committed` past the commit distance or
 * with a flick of ≥ `flickPxPerMs` in its direction (a flick back the other way cancels), else
 * `cancelled` (spring back). Thresholds are data in `SWIPE_RULES`.
 */

export type TouchPoint = { x: number; y: number; t: number };
export type Viewport = { width: number; height: number };

export type SwipeRule = {
  axis: 'x' | 'y';
  /** +1 = right / down, −1 = left / up, 0 = either way along the axis. */
  dir: 1 | -1 | 0;
  /** Movement (px from the start) at which the direction is decided. */
  lockPx: number;
  /** Locked only when |along| > axisRatio · |across| at the lock point. */
  axisRatio: number;
  /** Release velocity along the gesture (px/ms, over the last VELOCITY_WINDOW_MS) that commits. */
  flickPxPerMs: number;
  /** Commit distance as a share of the viewport along the axis… */
  commitFraction?: number;
  /** …or in px (wins over commitFraction). */
  commitPx?: number;
  /** The touch must start within this many px of the left edge. */
  edgePx?: number;
  /** Only when the scrollable content is at its top (`scrollTop` ≤ 0). */
  atTopOnly?: boolean;
};

export type SwipeKind = 'edgeBack' | 'pageSwipe' | 'sheetDown' | 'rowReveal';

export const SWIPE_RULES: Readonly<Record<SwipeKind, SwipeRule>> = {
  /** iOS-style back: from the left 24 px, past ⅓ of the width or a flick. */
  edgeBack: { axis: 'x', dir: 1, lockPx: 10, axisRatio: 1.5, flickPxPerMs: 0.5, commitFraction: 1 / 3, edgePx: 24 },
  /** First run / What's New pages: left = Next, right = Back, past 25% of the width or a flick. */
  pageSwipe: { axis: 'x', dir: 0, lockPx: 10, axisRatio: 1.5, flickPxPerMs: 0.5, commitFraction: 0.25 },
  /** Sheets: down = Close, only when scrolled to the top, past 30% of the height or a flick. */
  sheetDown: { axis: 'y', dir: 1, lockPx: 10, axisRatio: 1.5, flickPxPerMs: 0.5, commitFraction: 0.3, atTopOnly: true },
  /** Logged meal row: left ≥ 72 px (or a flick) shows Delete. */
  rowReveal: { axis: 'x', dir: -1, lockPx: 10, axisRatio: 1.5, flickPxPerMs: 0.5, commitPx: 72 },
};

/** Release velocity is measured over this last stretch of the stream. */
export const VELOCITY_WINDOW_MS = 100;

export type SwipePhase = 'pending' | 'tracking' | 'rejected' | 'committed' | 'cancelled';
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export type SwipeResult = {
  /**
   * pending: not moved `lockPx` yet · tracking: ours, follow the finger · rejected: not this
   * gesture (incl. a tap), leave the touch alone · committed: do the action · cancelled: spring back.
   */
  phase: SwipePhase;
  /** px along the axis to move the follower (clamped to the gesture's direction; signed for dir 0). */
  offset: number;
  /** |offset| / commit distance, 0–1 (for follow-the-finger feedback). */
  progress: number;
  direction: SwipeDirection | null;
};

export type SwipeOptions = {
  /** True when the last point is the release (touchend / pointerup). */
  ended?: boolean;
  /** The sheet's scrollTop at touch start (sheetDown); missing = at the top. */
  scrollTop?: number;
};

const EPS = 1e-9;

function none(phase: SwipePhase): SwipeResult {
  return { phase, offset: 0, progress: 0, direction: null };
}

function directionOf(axis: 'x' | 'y', sign: number): SwipeDirection | null {
  if (sign === 0) return null;
  if (axis === 'x') return sign > 0 ? 'right' : 'left';
  return sign > 0 ? 'down' : 'up';
}

/** Velocity along the axis over the last VELOCITY_WINDOW_MS (px/ms); 0 without elapsed time. */
function releaseVelocity(points: readonly TouchPoint[], axis: 'x' | 'y'): number {
  const lastIndex = points.length - 1;
  const last = points[lastIndex];
  if (!last) return 0;
  let refIndex = points.findIndex((p) => p.t >= last.t - VELOCITY_WINDOW_MS);
  if (refIndex === lastIndex) refIndex = lastIndex - 1;
  const ref = points[refIndex];
  if (!ref) return 0;
  const dt = last.t - ref.t;
  return dt > 0 ? (last[axis] - ref[axis]) / dt : 0;
}

/** Classifies a touch stream against one rule (the named classifiers below use SWIPE_RULES). */
export function classifySwipe(
  points: readonly TouchPoint[],
  viewport: Viewport,
  rule: SwipeRule,
  opts: SwipeOptions = {},
): SwipeResult {
  const ended = opts.ended === true;
  const start = points[0];
  if (!start) return none(ended ? 'rejected' : 'pending');
  if (rule.edgePx !== undefined && start.x > rule.edgePx) return none('rejected');
  if (rule.atTopOnly && (opts.scrollTop ?? 0) > 0) return none('rejected');

  const across = rule.axis === 'x' ? 'y' : 'x';
  const lock = points.find((p) => Math.hypot(p.x - start.x, p.y - start.y) >= rule.lockPx);
  if (!lock) return none(ended ? 'rejected' : 'pending');
  const lockAlong = lock[rule.axis] - start[rule.axis];
  const lockAcross = lock[across] - start[across];
  if (Math.abs(lockAlong) <= rule.axisRatio * Math.abs(lockAcross)) return none('rejected');
  if (rule.dir !== 0 && Math.sign(lockAlong) !== rule.dir) return none('rejected');

  const last = points[points.length - 1] ?? start;
  const raw = last[rule.axis] - start[rule.axis];
  const offset = rule.dir === 0 ? raw : rule.dir > 0 ? Math.max(0, raw) : Math.min(0, raw);
  const size = rule.axis === 'x' ? viewport.width : viewport.height;
  const commitDistance = rule.commitPx ?? (rule.commitFraction ?? 0) * size;
  const progress = commitDistance > 0 ? Math.min(1, Math.abs(offset) / commitDistance) : 1;
  const sign = rule.dir !== 0 ? rule.dir : Math.sign(raw);
  const direction = directionOf(rule.axis, sign);
  if (!ended) return { phase: 'tracking', offset, progress, direction };

  const v = releaseVelocity(points, rule.axis) * sign;
  const far = sign !== 0 && Math.abs(offset) >= commitDistance - EPS;
  const flick = sign !== 0 && v >= rule.flickPxPerMs;
  const commit = flick || (far && v > -rule.flickPxPerMs);
  return { phase: commit ? 'committed' : 'cancelled', offset, progress, direction };
}

export function edgeBack(points: readonly TouchPoint[], viewport: Viewport, opts?: SwipeOptions): SwipeResult {
  return classifySwipe(points, viewport, SWIPE_RULES.edgeBack, opts);
}

export function pageSwipe(points: readonly TouchPoint[], viewport: Viewport, opts?: SwipeOptions): SwipeResult {
  return classifySwipe(points, viewport, SWIPE_RULES.pageSwipe, opts);
}

export function sheetDown(points: readonly TouchPoint[], viewport: Viewport, opts?: SwipeOptions): SwipeResult {
  return classifySwipe(points, viewport, SWIPE_RULES.sheetDown, opts);
}

export function rowReveal(points: readonly TouchPoint[], viewport: Viewport, opts?: SwipeOptions): SwipeResult {
  return classifySwipe(points, viewport, SWIPE_RULES.rowReveal, opts);
}
