// M12 task 8: app-wide motion helpers (design "Motion"). The CSS side lives in src/styles.css:
// the tokens `--dur-fast/base/slow` and `--ease-standard/spring` on :root, the press feedback on
// buttons/chips, sheet and Undo toast entrances, and the ONE global
// `@media (prefers-reduced-motion: reduce)` rule. These helpers are the JS side for motion that
// a class can't express (direction of travel, stagger, number count-up, icon swap, ring arc).
//
// Rules every helper keeps:
// - Transform / opacity only (ringFill animates an SVG stroke offset: paint only, no layout).
// - Under prefers-reduced-motion, or inside a motion-off screen (MOTION_OFF: Exercise, camera;
//   readability mid-set comes first), a helper does nothing or sets the final value at once.
// - Nothing depends on an animation finishing: the element's real (final) state is set first and
//   the Web Animation only plays toward it, so cancelling, or a missing `animate()`, leaves the
//   right result. Every helper returns a stop function (safe to call any time, more than once).

/** Mirrors `--dur-fast`, `--dur-base`, `--dur-slow` (ms). motion.test.ts checks they match. */
export const DUR = { fast: 120, base: 220, slow: 320 } as const;

/** Mirrors `--ease-standard` (decelerate into place) and `--ease-spring` (a small overshoot). */
export const EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  spring: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
} as const;

/** Delay between items in staggerIn. */
export const STAGGER_MS = 40;
/** staggerIn stops adding delay after this many items, so a long list still lands quickly. */
const STAGGER_MAX_STEPS = 5;
/** Slide distance for screen and item entrances (design: 8px). */
const SLIDE_PX = 8;
/** countUp length: "briefly" — two slow beats. */
const COUNT_MS = 2 * DUR.slow;
const FRAME_MS = 16;

export type Stop = () => void;
const noop: Stop = () => {};

/** Direction of travel: 'next' enters from the right, 'prev' from the left, 'up' from below. */
export type EnterDir = 'next' | 'prev' | 'up';

/** True when the user asked the OS for reduced motion. False without a DOM. */
export function reducedMotion(): boolean {
  try {
    const mm = (globalThis as { matchMedia?: (q: string) => MediaQueryList }).matchMedia;
    return typeof mm === 'function' && mm('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Screens that get no new motion: anything marked `data-motion="off"`, plus the Exercise screen
 * and the camera sheet by their existing hooks. styles.css uses the same list.
 */
export const MOTION_OFF = '[data-motion="off"], [data-screen="exercise"], .camera-sheet';

/** True when `el` is inside a motion-off screen. */
function motionOffScreen(el: Element): boolean {
  return typeof el.closest === 'function' && el.closest(MOTION_OFF) !== null;
}

/** May `el` animate? No under reduced motion, on a motion-off screen, or without `animate()`. */
export function motionAllowed(el: Element): boolean {
  return (
    typeof (el as Partial<Element>).animate === 'function' &&
    !reducedMotion() &&
    !motionOffScreen(el)
  );
}

function play(el: Element, keyframes: Keyframe[], opts: KeyframeAnimationOptions): Stop {
  if (!motionAllowed(el)) return noop;
  const anim = el.animate(keyframes, opts);
  return () => anim.cancel();
}

function from(dir: EnterDir): string {
  if (dir === 'next') return `translateX(${SLIDE_PX}px)`;
  if (dir === 'prev') return `translateX(-${SLIDE_PX}px)`;
  return `translateY(${SLIDE_PX}px)`;
}

/**
 * A screen or tab panel arriving: fade + 8px slide in the direction of travel. `elapsed` (ms)
 * starts it that far along (screenEntrance: a re-render mid-entrance picks the slide up).
 */
export function enterScreen(el: HTMLElement, dir: EnterDir, elapsed = 0): Stop {
  return play(
    el,
    [
      { opacity: 0, transform: from(dir) },
      { opacity: 1, transform: 'none' },
    ],
    { duration: DUR.base, easing: EASE.standard, delay: -elapsed },
  );
}

/** The animation clock (document timeline), so a faked Date/performance clock can't stall it. */
function timelineNow(): number {
  const t = (globalThis as { document?: Document }).document?.timeline?.currentTime;
  return typeof t === 'number' ? t : performance.now();
}

export type ScreenEntrance = {
  /**
   * Call on every render with the new screen's parts (not the fixed tab bar), the screen's key,
   * and the direction when this render is a tab switch (null otherwise).
   */
  apply(parts: readonly HTMLElement[], key: string, start: EnterDir | null): void;
};

/**
 * A tab's entrance that survives the re-renders landing while it plays. The app rebuilds the
 * whole screen when data arrives (Calendar's grid replacing its Loading line, Today's cards
 * filling in), which on a slow phone happens mid-slide; without this the new parts pop in and
 * the slide is cut. A re-render of the same screen within DUR.base continues the slide from where
 * it was (negative delay), so it reads as one movement. Any other screen ends it.
 */
export function screenEntrance(clock: () => number = timelineNow): ScreenEntrance {
  let cur: { key: string; dir: EnterDir; t0: number } | null = null;
  return {
    apply(parts, key, start) {
      const t = clock();
      if (start) cur = { key, dir: start, t0: t };
      else if (cur && (cur.key !== key || t - cur.t0 >= DUR.base)) cur = null;
      if (!cur) return;
      const elapsed = t - cur.t0;
      for (const p of parts) enterScreen(p, cur.dir, elapsed);
    },
  };
}

/** Cards / list items rising in one after another (first load of Today, a new chat bubble). */
export function staggerIn(els: readonly HTMLElement[]): Stop {
  const stops = els.map((el, i) =>
    play(
      el,
      [
        { opacity: 0, transform: from('up') },
        { opacity: 1, transform: 'none' },
      ],
      {
        duration: DUR.base,
        easing: EASE.standard,
        delay: Math.min(i, STAGGER_MAX_STEPS) * STAGGER_MS,
        // Hidden at the start state while waiting its turn, not flashing in at full opacity.
        fill: 'backwards',
      },
    ),
  );
  return () => stops.forEach((s) => s());
}

export type CountUpOptions = {
  /** Start value (default 0). */
  from?: number;
  /** Text for a value (default: the integer as is). */
  format?: (n: number) => string;
};

const counting = new WeakMap<object, Stop>();

/**
 * A number counting up to `to` (streak, kcal, scores) on first show. The text always ends
 * on `format(to)`; under reduced motion or on a motion-off screen it is set at once. Integers
 * only (values are rounded). A new countUp on the same element replaces the running one.
 */
export function countUp(el: HTMLElement, to: number, opts: CountUpOptions = {}): Stop {
  const format = opts.format ?? ((n: number) => String(n));
  const start = Math.round(opts.from ?? 0);
  const end = Math.round(to);
  counting.get(el)?.();
  const finish = () => {
    el.textContent = format(end);
  };
  if (reducedMotion() || motionOffScreen(el) || start === end) {
    finish();
    return noop;
  }
  const steps = Math.max(1, Math.ceil(COUNT_MS / FRAME_MS));
  let i = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop: Stop = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    counting.delete(el);
    finish();
  };
  const tick = () => {
    i += 1;
    if (i >= steps) {
      timer = undefined;
      counting.delete(el);
      finish();
      return;
    }
    const t = i / steps;
    const eased = 1 - (1 - t) ** 3; // ease-out: fast start, settles on the value
    el.textContent = format(Math.round(start + (end - start) * eased));
    timer = setTimeout(tick, FRAME_MS);
  };
  el.textContent = format(start);
  timer = setTimeout(tick, FRAME_MS);
  counting.set(el, stop);
  return stop;
}

/**
 * Apply → done: swaps the button's `.ic` icon (or prepends one) for `check`, which pops in with
 * the spring ease. The caller updates the button's words and state itself.
 */
export function checkMorph(btn: HTMLElement, check: Element): Stop {
  const old = typeof btn.querySelector === 'function' ? btn.querySelector('.ic') : null;
  if (old) old.replaceWith(check);
  else btn.prepend(check);
  return play(
    check,
    [
      { opacity: 0, transform: 'scale(0.6)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: DUR.base, easing: EASE.spring },
  );
}

/**
 * Fills an SVG ring arc to `pct` (0–100). The element must have `pathLength="100"`. The final
 * arc is set as its style; the stroke plays from the previous arc (empty if none) to it.
 */
export function ringFill(el: SVGElement | HTMLElement, pct: number): Stop {
  const p = Math.min(100, Math.max(0, pct));
  const prev = el.style.strokeDashoffset || '100';
  const next = String(100 - p);
  el.style.strokeDasharray = '100 100';
  el.style.strokeDashoffset = next;
  return play(el, [{ strokeDashoffset: prev }, { strokeDashoffset: next }], {
    duration: DUR.slow,
    easing: EASE.standard,
  });
}
