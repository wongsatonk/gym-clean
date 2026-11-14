// M5c task 7: the hands-free "Set done" proposal shown over the camera view during the Undo
// window. "Set done · 8 reps" (count ≥ 64px), a full-width Undo (≥ 72px tall) with a countdown
// ring and the seconds left. The banner never owns a timer for the window itself: the camera
// view drives it with `tick(remainingMs)` from autoSet's `pendingUntil`, and decides when the
// window ends (commit → dispose). After Undo (or a rep, via `keepGoing()`) it shows "Keep going."
// briefly and then removes itself.
//
// a11y: role="status" (polite), not "alert": the app already speaks "Set done. 8 reps." and an
// assertive region would talk over it. The ticking seconds are aria-hidden so screen readers
// don't announce a bare number every second; the Undo button keeps the static name "Undo" and a
// non-live description ("Saving in 4 seconds") read on focus. "Keep going." is spoken by the app,
// so the status region doesn't announce it a second time.
// Reduced motion: the ring is hidden and only the number counts down (handsfree.css).

import { h } from './dom';
import './handsfree.css';

export type AutoStopReason = 'still' | 'away' | 'stalled';

export type AutoStopBannerOptions = {
  reps: number;
  partials: number;
  /** Length of the Undo window in seconds (AutoSetConfig.undoSec, 5 by default). */
  seconds: number;
  /** Called once when Undo is tapped. The banner then shows "Keep going." and removes itself. */
  onUndo: () => void;
  /** Why autoSet proposed the stop; exposed as data-reason for e2e and the dev log. */
  reason?: AutoStopReason;
  /** How long "Keep going." stays before the banner removes itself (ms, default 1500). */
  keepGoingMs?: number;
  /** Called after "Keep going." has been shown and the banner removed itself. */
  onGone?: () => void;
  /**
   * Where focus goes when the banner removes a control that had focus (Undo after a tap,
   * dispose). Only used when focus was inside the banner.
   */
  focusAfter?: () => HTMLElement | null | undefined;
};

export type AutoStopBannerHandle = {
  readonly el: HTMLElement;
  /** Time left in the Undo window; updates the ring and the seconds. */
  tick(remainingMs: number): void;
  /** Cancelled without a tap (a rep inside the window): show "Keep going." and go. */
  keepGoing(): void;
  /** Remove now and clear timers (window committed, sheet closed). Safe to call twice. */
  dispose(): void;
};

// ---------- pure helpers ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Whole seconds shown on the countdown: 5 → 1, then 0 at the end. Never negative. */
export function undoSecondsLeft(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

/** Share of the window still left, 0..1 (drives the ring). */
export function undoFraction(remainingMs: number, seconds: number): number {
  if (!(seconds > 0) || !Number.isFinite(remainingMs)) return 0;
  return Math.min(1, Math.max(0, remainingMs / (seconds * 1000)));
}

/** "reps" / "rep" for the word next to the big number. */
export function repWord(reps: number): string {
  return reps === 1 ? 'rep' : 'reps';
}

/** "+ 1 partial" under the count, or '' when there are none. */
export function partialsLine(partials: number): string {
  return partials > 0 ? `+ ${plural(partials, 'partial')}` : '';
}

/** One meaningful sentence for the status region: "Set done, 8 reps, 1 partial." */
export function autoStopStatusText(reps: number, partials: number): string {
  const p = partials > 0 ? `, ${plural(partials, 'partial')}` : '';
  return `Set done, ${plural(reps, 'rep')}${p}.`;
}

/**
 * The Undo button's description (aria-describedby) with the seconds left. The button's name stays
 * a static "Undo" so it isn't re-announced every second.
 */
export function undoDescription(secondsLeft: number): string {
  return secondsLeft > 0 ? `Saving in ${plural(secondsLeft, 'second')}` : 'Saving now';
}

// ---------- icons (original, decorative) ----------

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** Curved arrow turning back to the left. */
function undoIcon(): SVGSVGElement {
  const svg = svgEl('svg', {
    viewBox: '0 0 24 24',
    width: '36',
    height: '36',
    'aria-hidden': 'true',
    focusable: 'false',
    class: 'auto-stop-undo-icon',
  });
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
  svg.append(
    svgEl('path', { d: 'M8.5 5 4 9.5 8.5 14', ...common }),
    svgEl('path', { d: 'M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3', ...common }),
  );
  return svg;
}

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

// ---------- component ----------

let instances = 0;

export function createAutoStopBanner(opts: AutoStopBannerOptions): AutoStopBannerHandle {
  const seconds = opts.seconds > 0 ? opts.seconds : 5;
  const keepGoingMs = opts.keepGoingMs ?? 1500;
  let state: 'pending' | 'undone' | 'gone' = 'pending';
  let goneTimer: ReturnType<typeof setTimeout> | undefined;
  const descId = `auto-stop-desc-${++instances}`;
  const desc = h('span', { class: 'hf-sr-only', id: descId }, undoDescription(seconds));

  const ringFg = svgEl('circle', {
    class: 'auto-stop-ring-fg',
    cx: '28',
    cy: '28',
    r: String(RING_R),
    'stroke-dasharray': RING_C.toFixed(2),
    'stroke-dashoffset': '0',
    transform: 'rotate(-90 28 28)',
  });
  const ring = svgEl('svg', {
    class: 'auto-stop-ring',
    viewBox: '0 0 56 56',
    width: '56',
    height: '56',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  ring.append(
    svgEl('circle', { class: 'auto-stop-ring-bg', cx: '28', cy: '28', r: String(RING_R) }),
    ringFg,
  );
  const secs = h('span', { class: 'auto-stop-secs', 'data-auto-stop': 'seconds' }, seconds);
  const countdown = h('span', { class: 'auto-stop-countdown', 'aria-hidden': 'true' }, ring, secs);

  const undoBtn = h(
    'button',
    {
      type: 'button',
      class: 'auto-stop-undo',
      'data-auto-stop': 'undo',
      'aria-describedby': descId,
      onclick: () => {
        if (state !== 'pending') return;
        showKeepGoing();
        opts.onUndo();
      },
    },
    undoIcon(),
    h('span', { class: 'auto-stop-undo-text' }, 'Undo'),
    countdown,
    desc,
  );

  const repsNum = h('span', { class: 'auto-stop-num', 'data-auto-stop': 'reps' }, opts.reps);
  const title = h(
    'p',
    { class: 'auto-stop-title', 'aria-hidden': 'true' },
    h('span', { class: 'auto-stop-done' }, 'Set done'),
    h(
      'span',
      { class: 'auto-stop-count' },
      repsNum,
      h('span', { class: 'auto-stop-unit' }, repWord(opts.reps)),
    ),
  );
  const holdLine = h(
    'p',
    { class: 'auto-stop-hold', 'data-auto-stop': 'hold', 'aria-hidden': 'true', hidden: true },
    'Finishing rep…',
  );
  const partialText = partialsLine(opts.partials);
  const partials = partialText
    ? h('p', { class: 'auto-stop-partials', 'aria-hidden': 'true' }, partialText)
    : null;
  // Screen-reader sentence; the big visual pieces above are aria-hidden so it's read once.
  const srText = h('span', { class: 'hf-sr-only' }, autoStopStatusText(opts.reps, opts.partials));
  const status = h(
    'div',
    { class: 'auto-stop-status', role: 'status', 'aria-atomic': 'true' },
    srText,
    title,
    partials,
  );

  const el = h(
    'section',
    {
      class: 'auto-stop',
      'data-auto-stop': 'pending',
      'data-reason': opts.reason,
      'aria-label': 'Set done',
    },
    status,
    holdLine,
    undoBtn,
  );

  function showKeepGoing(): void {
    if (state !== 'pending') return;
    state = 'undone';
    el.dataset.autoStop = 'undone';
    el.classList.add('undone');
    const hadFocus = focusInside();
    undoBtn.remove();
    title.replaceChildren(h('span', { class: 'auto-stop-keep' }, 'Keep going.'));
    partials?.remove();
    holdLine.remove();
    // Spoken by the app: emptying the region announces nothing (no double "Keep going.").
    srText.textContent = '';
    if (hadFocus) restoreFocus();
    goneTimer = setTimeout(() => {
      dispose();
      opts.onGone?.();
    }, keepGoingMs);
  }

  function tick(remainingMs: number): void {
    if (state !== 'pending') return;
    const left = undoSecondsLeft(remainingMs);
    // The window is over but autoSet holds the save while a rep attempt is in progress: say so
    // instead of a stuck "0". Undo stays usable until the commit (or a rep) arrives.
    const holding = left === 0;
    if (holding !== el.classList.contains('holding')) {
      el.classList.toggle('holding', holding);
      el.dataset.autoStop = holding ? 'holding' : 'pending';
      holdLine.hidden = !holding;
    }
    const text = holding ? '' : String(left);
    if (secs.textContent !== text) {
      secs.textContent = text;
      desc.textContent = holding ? 'Saving when this rep ends' : undoDescription(left);
    }
    const offset = RING_C * (1 - undoFraction(remainingMs, seconds));
    ringFg.setAttribute('stroke-dashoffset', offset.toFixed(2));
  }

  function focusInside(): boolean {
    return typeof document !== 'undefined' && el.contains(document.activeElement);
  }

  function restoreFocus(): void {
    const target = opts.focusAfter?.();
    if (target && target.isConnected) target.focus();
  }

  function dispose(): void {
    if (goneTimer !== undefined) clearTimeout(goneTimer);
    goneTimer = undefined;
    if (state === 'gone') return;
    state = 'gone';
    const hadFocus = focusInside();
    el.remove();
    if (hadFocus) restoreFocus();
  }

  return { el, tick, keepGoing: showKeepGoing, dispose };
}
