// M13b task 14: the "Set up your phone" card gets out of the way (gym videos 2026-11-17: the card
// kept re-opening over the lower half every time tracking lost him bent over a bench).
//
// - The full card shows only before the set's first rep (and when "Phone position" is tapped).
// - It closes after 1.5 s of stable tracking, the first rep, "Got it", or 10 s at most.
// - It never re-opens by itself. A loss of ≥ 1 s shows a one-line "Step into frame" strip at the
//   top of the stage instead; mid-set (after the first rep) that loss is spoken once, unless the
//   focus outOfFrame cue ("Step back into frame.", at 2 s) was already spoken (a cue the 6 s hint
//   gap dropped doesn't count: the strip then says it).
import { h } from './dom';

/** Card closes once tracking has held this long. */
export const SETUP_STABLE_MS = 1500;
/** Card closes by itself after this long open, whatever the camera sees. */
export const SETUP_MAX_MS = 10_000;
/** "Phone position" tapped: keep the card up at least this long even while tracking. */
export const SETUP_MANUAL_MS = 8000;
/** The strip shows after he has been out of frame this long (tracking flickers stay quiet). */
export const STRIP_LOST_MS = 1000;
/** The strip's spoken line waits past the focus outOfFrame cue (2 s) so the two never double. */
export const STRIP_SPEAK_MS = 2500;
/** The strip's words (shown). The spoken line is the focus cue's, CUE_TEXT.outOfFrame. */
export const STRIP_TEXT = 'Step into frame';

export type SetupTick = {
  /** Monotonic ms (performance.now). */
  t: number;
  /** He is tracked (the rep panel's in-frame state). */
  inFrame: boolean;
  /** This set has at least one counted rep. */
  counted: boolean;
  /** A set is live (not rest, not the hands-free Undo window or hold): the strip may show. */
  live: boolean;
  /** Speaking is right now (false when a hands-free auto stop follows his leaving). */
  speakable: boolean;
};

export type SetupView = { card: boolean; strip: boolean; speak: boolean };

export type SetupControl = {
  readonly card: boolean;
  /** One camera tick. `speak` is true on the one tick the strip's line should be said. */
  tick(input: SetupTick): SetupView;
  /** "Got it". */
  dismiss(): void;
  /** "Phone position": open the card, held ≥ SETUP_MANUAL_MS. */
  openManual(t: number): void;
  /** The focus outOfFrame cue was spoken (not rate-dropped): this loss is already said. */
  heardOutOfFrame(): void;
};

export function createSetupControl(open: boolean): SetupControl {
  let card = open;
  // Set on the first tick after (re)opening, so the 10 s count from the camera running.
  let openedAt: number | null = null;
  let holdUntil = 0;
  let stableSince: number | null = null;
  let lostSince: number | null = null;
  let spokenThisLoss = false;

  const close = () => {
    card = false;
    openedAt = null;
    holdUntil = 0;
  };

  return {
    get card() {
      return card;
    },
    tick({ t, inFrame, counted, live, speakable }) {
      if (inFrame) {
        stableSince ??= t;
        lostSince = null;
        spokenThisLoss = false;
      } else {
        stableSince = null;
        lostSince ??= t;
      }
      if (card) {
        openedAt ??= t;
        const manual = holdUntil > 0;
        if (
          t - openedAt >= SETUP_MAX_MS ||
          (counted && !manual) ||
          (stableSince !== null && t - stableSince >= SETUP_STABLE_MS && t >= holdUntil)
        )
          close();
      }
      const lostFor = lostSince === null ? 0 : t - lostSince;
      const strip = !card && live && lostSince !== null && lostFor >= STRIP_LOST_MS;
      let speak = false;
      if (strip && counted && speakable && !spokenThisLoss && lostFor >= STRIP_SPEAK_MS) {
        speak = true;
        spokenThisLoss = true;
      }
      return { card, strip, speak };
    },
    dismiss() {
      close();
    },
    openManual(t) {
      card = true;
      openedAt = t;
      holdUntil = t + SETUP_MANUAL_MS;
    },
    heardOutOfFrame() {
      if (lostSince !== null) spokenThisLoss = true;
    },
  };
}

export type FrameStrip = { readonly el: HTMLElement; show(on: boolean): void };

/** The one-line "Step into frame" strip (top of the stage, under the count). */
export function createFrameStrip(): FrameStrip {
  const el = h(
    'p',
    { class: 'cam-frame-strip', role: 'status', hidden: true, 'data-frame-strip': 'hidden' },
    STRIP_TEXT,
  );
  let shown = false;
  return {
    el,
    show(on) {
      if (on === shown) return;
      shown = on;
      if (on) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
      el.setAttribute('data-frame-strip', on ? 'shown' : 'hidden');
    },
  };
}
