// M5c follow-up B4: the "on hold" panel shown over the camera view when autoSet holds a set
// (a break inside the set: sat down, bent over, or walked out of frame). Nothing is saved yet.
// "On hold · 6 reps", a break clock since the last rep (≥ 64px), then two full-width ≥ 72px
// buttons: Continue set (primary) and Start next set, or Save set on the exercise's last set.
//
// The panel owns no timer: the camera view calls `setClock(sinceLastRepMs)` from its frame/tick
// loop (autoSet's endedAt). It doesn't speak either: the camera view says "Set on hold. Tap to
// continue." once, and the reminders.
//
// a11y: one atomic status sentence ("Set on hold, 6 reps. ...") in a polite region; the big
// title is aria-hidden so it's read once, and the ticking clock is role="timer" with
// aria-live="off" so a bare number isn't announced every second. Each button fires once; after a
// tap both are disabled until the camera view disposes the panel.
// Reduced motion: no animation is used.
// M13d task 40g (styling only): both buttons are full-width secondary round-button pills, ≥ 80px
// as before (Set done below stays the one main action).

import { h } from './dom';
import { midPill } from './midsetButtons';
import './handsfree.css';

/** Why autoSet held the set (B1's `hold` action reason). */
export type HoldReason = 'posture' | 'bodyLine' | 'away';

export type HoldPanelOptions = {
  reps: number;
  partials: number;
  /** The exercise's last set: the second button reads "Save set" instead of "Start next set". */
  lastSet: boolean;
  /** Continue counting in the same set. Called at most once. */
  onContinue: () => void;
  /** Save the held set (backdated) and, unless `lastSet`, start the next one. Called at most once. */
  onNext: () => void;
  /** Exposed as data-reason for e2e and the dev log. */
  reason?: HoldReason;
  /** Where focus goes if the panel is disposed while a control inside it has focus. */
  focusAfter?: () => HTMLElement | null | undefined;
};

export type HoldPanelHandle = {
  readonly el: HTMLElement;
  /** Time since the end of the last counted rep; updates the break clock. */
  setClock(sinceLastRepMs: number): void;
  /** Remove now (Continue/next handled, sheet closed). Safe to call twice. */
  dispose(): void;
};

// ---------- pure helpers ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const pad = (n: number) => String(n).padStart(2, '0');

/** Break clock text, counting up in whole seconds: 0:00, 0:16, 1:05, 12:00. Never negative. */
export function holdClockText(sinceLastRepMs: number): string {
  const ms = Number.isFinite(sinceLastRepMs) && sinceLastRepMs > 0 ? sinceLastRepMs : 0;
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** "On hold · 6 reps" (the visible title). */
export function holdTitle(reps: number): string {
  return `On hold · ${plural(reps, 'rep')}`;
}

/** "+ 1 partial" under the title, or '' when there are none. */
export function holdPartialsLine(partials: number): string {
  return partials > 0 ? `+ ${plural(partials, 'partial')}` : '';
}

/** The second button's label. */
export function holdNextLabel(lastSet: boolean): string {
  return lastSet ? 'Save set' : 'Start next set';
}

/** One sentence for the status region. */
export function holdStatusText(reps: number, partials: number, lastSet: boolean): string {
  const p = partials > 0 ? `, ${plural(partials, 'partial')}` : '';
  return `Set on hold, ${plural(reps, 'rep')}${p}. Tap Continue set or ${holdNextLabel(lastSet)}.`;
}

// ---------- component ----------

export function createHoldPanel(opts: HoldPanelOptions): HoldPanelHandle {
  let state: 'open' | 'chosen' | 'gone' = 'open';

  const clock = h(
    'p',
    {
      class: 'hold-clock',
      'data-hold-clock': '',
      role: 'timer',
      'aria-live': 'off',
      'aria-label': 'Break time',
    },
    holdClockText(0),
  );

  const choose = (cb: () => void) => () => {
    if (state !== 'open') return;
    state = 'chosen';
    continueBtn.disabled = true;
    nextBtn.disabled = true;
    cb();
  };

  const continueBtn = midPill({
    icon: 'play',
    label: 'Continue set',
    wide: true,
    class: 'hold-pill',
    hooks: { 'data-hold-action': 'continue' },
    onClick: choose(opts.onContinue),
  });
  const nextBtn = midPill({
    icon: opts.lastSet ? 'check' : 'skip',
    label: holdNextLabel(opts.lastSet),
    wide: true,
    class: 'hold-pill',
    hooks: { 'data-hold-action': opts.lastSet ? 'save' : 'next' },
    onClick: choose(opts.onNext),
  });

  const partialText = holdPartialsLine(opts.partials);
  const status = h(
    'div',
    { class: 'hold-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    h('span', { class: 'hf-sr-only' }, holdStatusText(opts.reps, opts.partials, opts.lastSet)),
    h(
      'p',
      { class: 'hold-title', 'data-hold-title': '', 'aria-hidden': 'true' },
      holdTitle(opts.reps),
    ),
    partialText ? h('p', { class: 'hold-partials', 'aria-hidden': 'true' }, partialText) : null,
  );

  const card = h(
    'div',
    { class: 'hold-card' },
    status,
    h('p', { class: 'hold-label', 'aria-hidden': 'true' }, 'Break'),
    clock,
    h('div', { class: 'hold-actions' }, continueBtn, nextBtn),
  );

  const el = h(
    'section',
    {
      class: 'hold-panel',
      'data-hold': '',
      'data-reason': opts.reason,
      'data-last-set': opts.lastSet ? 'true' : 'false',
      'aria-label': 'Set on hold',
    },
    card,
  );

  function setClock(sinceLastRepMs: number): void {
    const text = holdClockText(sinceLastRepMs);
    if (clock.textContent !== text) clock.textContent = text;
  }

  function dispose(): void {
    if (state === 'gone') return;
    state = 'gone';
    const hadFocus = typeof document !== 'undefined' && el.contains(document.activeElement);
    el.remove();
    if (hadFocus) {
      const target = opts.focusAfter?.();
      if (target && target.isConnected) target.focus();
    }
  }

  return { el, setClock, dispose };
}
