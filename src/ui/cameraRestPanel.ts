// M5c task 7: the camera sheet's rest mode. A panel over the dimmed video (the video stays
// visible above it): "Rest" label, the rest clock (≥ 64px, amber "+0:12" once over target),
// the next-set line, slots for the M5b coach tip and the "Last set" Fix (app.ts passes in the
// same instances the Rest screen uses), then Start set (≥ 56px) and Close.
//
// The clock carries data-cam-rest-clock, NOT data-rest-clock: app.ts's tick queries the latter
// for the Rest screen, and this panel is fed through `update()` instead.
//
// M13d task 40g (styling only): Start set is the main round-button pill and Close a secondary
// round button with its word under it, in the same two columns, each at least its 1.16.2 box.

import { formatRest } from '../core/format';
import { h } from './dom';
import { iconButton } from './iconButton';
import { midPill } from './midsetButtons';
import './handsfree.css';

export type CameraRestPanelOptions = {
  onStartSet: () => void;
  onClose: () => void;
};

export type CameraRestUpdate = {
  /** Time left to the rest target in ms; negative once over (shown as "+0:12"). */
  restMs?: number;
  /** Override for the amber state; default `restMs < 0`. */
  overtime?: boolean;
  /** "Next: Set 3 of 4 · 12 reps × 15 lb". */
  nextLine?: string;
  /** Coach tip element (createCoachTip().el); null empties the slot, undefined leaves it. */
  coachTipEl?: HTMLElement | null;
  /** "Last set" Fix element (createLastSetCorrection().el); null empties, undefined leaves. */
  fixEl?: HTMLElement | null;
};

export type CameraRestPanelHandle = {
  readonly el: HTMLElement;
  update(u: CameraRestUpdate): void;
  /** Detach from the DOM. The slotted elements are released (moved out), not destroyed. */
  dispose(): void;
};

// ---------- pure helpers ----------

/** Clock text + amber flag for a remaining time. */
export function camRestClock(
  restMs: number,
  overtime?: boolean,
): { text: string; overtime: boolean } {
  const ms = Number.isFinite(restMs) ? restMs : 0;
  return { text: formatRest(ms), overtime: overtime ?? ms < 0 };
}

// ---------- component ----------

export function createCameraRestPanel(opts: CameraRestPanelOptions): CameraRestPanelHandle {
  const clock = h(
    'p',
    { class: 'cam-rest-clock', 'data-cam-rest-clock': '', role: 'timer', 'aria-live': 'off' },
    '0:00',
  );
  const next = h('p', { class: 'cam-rest-next', 'data-cam-rest': 'next' });
  const tipSlot = h('div', { class: 'cam-rest-slot', 'data-cam-rest': 'coach', hidden: true });
  const fixSlot = h('div', { class: 'cam-rest-slot', 'data-cam-rest': 'fix', hidden: true });

  const startBtn = midPill({
    icon: 'play',
    label: 'Start set',
    variant: 'main',
    class: 'cam-rest-start-pill',
    hooks: { 'data-cam-rest': 'start' },
    onClick: () => opts.onStartSet(),
  });
  const closeBtn = iconButton({
    icon: 'close',
    label: 'Close',
    class: 'cam-rest-close-btn',
    hooks: { 'data-cam-rest': 'close' },
    onClick: () => opts.onClose(),
  });

  const card = h(
    'div',
    { class: 'cam-rest-card' },
    h('p', { class: 'cam-rest-label' }, 'Rest'),
    clock,
    next,
    tipSlot,
    fixSlot,
    h('div', { class: 'cam-rest-actions' }, startBtn, closeBtn),
  );
  const el = h(
    'section',
    { class: 'cam-rest', 'data-cam-rest': 'panel', 'aria-label': 'Rest' },
    card,
  );

  function fill(slot: HTMLElement, child: HTMLElement | null | undefined): void {
    if (child === undefined) return;
    if (child === null) {
      slot.replaceChildren();
      slot.hidden = true;
      return;
    }
    // Same instance already here: leave it, so focus and an open Fix editor survive ticks.
    if (slot.firstElementChild !== child || slot.childElementCount !== 1)
      slot.replaceChildren(child);
    slot.hidden = false;
  }

  function update(u: CameraRestUpdate): void {
    if (u.restMs !== undefined) {
      const c = camRestClock(u.restMs, u.overtime);
      if (clock.textContent !== c.text) clock.textContent = c.text;
      clock.classList.toggle('overtime', c.overtime);
    } else if (u.overtime !== undefined) {
      clock.classList.toggle('overtime', u.overtime);
    }
    if (u.nextLine !== undefined && next.textContent !== u.nextLine) next.textContent = u.nextLine;
    fill(tipSlot, u.coachTipEl);
    fill(fixSlot, u.fixEl);
  }

  function dispose(): void {
    tipSlot.replaceChildren();
    fixSlot.replaceChildren();
    el.remove();
  }

  return { el, update, dispose };
}
