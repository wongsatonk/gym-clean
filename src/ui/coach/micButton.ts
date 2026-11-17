// M12 slice 2 task 16: the coach chat's hold-to-talk mic. Props in, callbacks out: main owns
// GymSpeech (src/native/speech.ts) and decides where the mic may show (core speakRules
// `micAllowed`: iPhone app only, Coach tab / Pause sheet, never in a set or on the camera).
//
// States:
// - 'hidden': nothing (the PWA, during a set).
// - 'unavailable': no hold button, a short plain line why (typing still works). For
//   `modelNotInstalled` (and `installFailed`, a UI-only reason main passes when `installModel()`
//   came back false) with a `micInstall` callback: a full-width "Download speech for the mic"
//   button (≥ 56px) and a one-line note that the iPhone downloads Apple's English speech model
//   once and no audio is sent. Tap → `micInstall` (main: GymSpeech.installModel()).
// - 'downloading': the download main started is running: one status line, typing still works.
//   (`modelDownloading` is iOS fetching on its own: it keeps its unavailable line.)
// - 'idle': "Talk" next to Send. Press and hold (pointer) or hold Space (keyboard) → `micDown`.
// - 'listening': the button is filled (aria-pressed) and keeps its width (the text box next to it
//   shows the live words), a level ring grows with loudness (transform + opacity; static under
//   reduced motion), the hint "Listening… Let go to send. Slide off to cancel."
//
// Release → `micUp` (main sends the final text with `viaMic`). Releasing with the pointer off the
// button, a pointercancel, Escape, or the window losing focus mid-hold → `micCancel`.
//
// Release is listened for on `window` from the moment of the press, so a chat re-render during
// the hold (new partial text from main) never loses the release. Only one hold at a time.
//
// e2e hooks: `[data-mic]` (+ `data-mic-state`), `[data-mic-hold]` (the button, named "Hold to
// talk"), `[data-mic-ring]`, `[data-mic-hint]`, `[data-mic-unavailable]` (+ the reason),
// `[data-mic-install]` (the download button), `[data-mic-install-note]`, `[data-mic-downloading]`.
import { APP_NAME } from '../../core/brand';
import { h } from '../dom';
import { reducedMotion } from '../motion';

export type MicState = 'hidden' | 'unavailable' | 'downloading' | 'idle' | 'listening';

export type MicProps = {
  state: MicState;
  /** What the phone heard so far (listening only); main also passes it to the text box. */
  partial?: string | undefined;
  /** Loudness 0–1 for the level ring. */
  level?: number | undefined;
  /**
   * Why the mic can't be used, for 'unavailable': a GymSpeech `SpeechUnavailableReason`, or
   * 'installFailed' (UI-only: main's `installModel()` came back false).
   */
  reason?: string | undefined;
};

export type MicActions = {
  micDown: () => void;
  micUp: () => void;
  micCancel: () => void;
  /** "Download speech for the mic" (modelNotInstalled / installFailed). Omit → no button. */
  micInstall?: (() => void) | undefined;
};

export const MIC_LABEL = 'Talk';
export const MIC_A11Y_NAME = 'Hold to talk';
export const MIC_HINT = 'Listening… Let go to send. Slide off to cancel.';

/** One short plain line per GymSpeech unavailable reason. */
export const MIC_UNAVAILABLE_LINES: Readonly<Record<string, string>> = {
  unsupported: "This iPhone can't do speech to text on the phone. Type instead.",
  modelNotInstalled: "Speech for the mic isn't on this iPhone yet. Type for now.",
  modelDownloading: 'Speech for the mic is still downloading. Type for now.',
  permissionDenied: `The mic is off for ${APP_NAME}. Turn it on in iPhone Settings.`,
  notNative: 'The mic works in the iPhone app.',
  installFailed: "Speech didn't finish downloading. Try again.",
};
/** Reasons that show the Download button (with a `micInstall` callback). */
export const MIC_INSTALL_REASONS: readonly string[] = ['modelNotInstalled', 'installFailed'];
export const MIC_INSTALL_LABEL = 'Download speech for the mic';
export const MIC_INSTALL_NOTE =
  "iPhone downloads Apple's English speech model once. No audio is sent.";
export const MIC_DOWNLOADING = 'Downloading speech… you can keep typing.';
export const MIC_UNAVAILABLE_FALLBACK = "The mic isn't available right now. Type instead.";

export function micUnavailableLine(reason: string | undefined): string {
  return (reason && MIC_UNAVAILABLE_LINES[reason]) || MIC_UNAVAILABLE_FALLBACK;
}

/** Ring scale for a loudness 0–1 (clamped). Reduced motion: no growth (1). */
export function ringScale(level: number | undefined, reduced: boolean): number {
  if (reduced) return 1;
  const l = Math.min(1, Math.max(0, Number.isFinite(level) ? (level as number) : 0));
  return Math.round((1 + l * 0.2) * 100) / 100;
}

/** Ring opacity for a loudness 0–1. Reduced motion: a fixed, visible ring. */
export function ringOpacity(level: number | undefined, reduced: boolean): number {
  if (reduced) return 0.6;
  const l = Math.min(1, Math.max(0, Number.isFinite(level) ? (level as number) : 0));
  return Math.round((0.35 + l * 0.65) * 100) / 100;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The mic glyph, drawn like ../icons.ts (24 grid, 2.25 stroke, decorative). */
function micGlyph(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  const attrs: Record<string, string> = {
    class: 'ic ic-md',
    viewBox: '0 0 24 24',
    width: '28',
    height: '28',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.25',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
    'data-icon': 'mic',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  // Compile-time constant markup (never user input).
  svg.innerHTML =
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>';
  return svg;
}

// ---------- the one hold in progress ----------

type Hold = { end: (send: boolean) => void };
let current: Hold | null = null;

/** Test-only: forget a hold left over from a previous test. */
export function resetMicHold(): void {
  current = null;
}

type Win = {
  addEventListener: (t: string, cb: (ev: Event) => void) => void;
  removeEventListener: (t: string, cb: (ev: Event) => void) => void;
};
const win = (): Win | null => {
  const w = (globalThis as { window?: Partial<Win> }).window;
  return w && typeof w.addEventListener === 'function' ? (w as Win) : null;
};

/** Is the pointer still over a hold button? Unknown (no elementFromPoint) → yes. */
function overButton(ev: Event): boolean {
  const d = (globalThis as { document?: { elementFromPoint?: (x: number, y: number) => unknown } })
    .document;
  const pe = ev as PointerEvent;
  if (typeof d?.elementFromPoint !== 'function' || typeof pe.clientX !== 'number') return true;
  const hit = d.elementFromPoint(pe.clientX, pe.clientY) as Element | null;
  return !!hit && typeof hit.closest === 'function' && hit.closest('[data-mic-hold]') !== null;
}

function startHold(a: MicActions, via: 'pointer' | 'key'): void {
  if (current) return;
  const w = win();
  const listeners: [string, (ev: Event) => void][] = [];
  const hold: Hold = {
    end: (send) => {
      if (current !== hold) return;
      current = null;
      for (const [t, cb] of listeners) w?.removeEventListener(t, cb);
      if (send) a.micUp();
      else a.micCancel();
    },
  };
  current = hold;
  if (via === 'pointer') {
    listeners.push(
      ['pointerup', (ev) => hold.end(overButton(ev))],
      ['pointercancel', () => hold.end(false)],
    );
  } else {
    listeners.push([
      'keyup',
      (ev) => {
        if ((ev as KeyboardEvent).key === ' ') hold.end(true);
      },
    ]);
  }
  listeners.push([
    'keydown',
    (ev) => {
      if ((ev as KeyboardEvent).key === 'Escape') hold.end(false);
    },
  ]);
  // The app going to the background mid-hold: nothing is sent.
  listeners.push(['blur', () => hold.end(false)]);
  for (const [t, cb] of listeners) w?.addEventListener(t, cb);
  a.micDown();
}

// ---------- the component ----------

export type MicView = {
  /** The button + ring (idle / listening), the line (unavailable) or null (hidden). */
  el: HTMLElement | null;
  /** The hold button itself (idle / listening), for focus order; null otherwise. */
  button: HTMLElement | null;
  /** The hint shown while listening (placed under the text row by the chat); null otherwise. */
  hint: HTMLElement | null;
  /** Patch level / state in place without a re-render (10 level events a second). */
  update: (p: MicProps) => void;
};

export function micButton(p: MicProps, a: MicActions): MicView {
  if (p.state === 'hidden') return { el: null, button: null, hint: null, update: () => {} };
  if (p.state === 'downloading') {
    const line = h(
      'p',
      { class: 'mic-unavailable', 'data-mic-downloading': true, role: 'status' },
      MIC_DOWNLOADING,
    );
    return { el: line, button: null, hint: null, update: () => {} };
  }
  if (p.state === 'unavailable' && a.micInstall && MIC_INSTALL_REASONS.includes(p.reason ?? '')) {
    const onInstall = a.micInstall;
    const install = h(
      'button',
      { type: 'button', class: 'cs-btn mic-install', 'data-mic-install': true, onclick: onInstall },
      MIC_INSTALL_LABEL,
    );
    const wrap = h(
      'div',
      { class: 'mic-install-box', 'data-mic-unavailable': p.reason ?? 'unknown' },
      p.reason === 'installFailed'
        ? h('p', { class: 'mic-unavailable', role: 'status' }, micUnavailableLine(p.reason))
        : null,
      install,
      h('p', { class: 'mic-unavailable', 'data-mic-install-note': true }, MIC_INSTALL_NOTE),
    );
    return { el: wrap, button: null, hint: null, update: () => {} };
  }
  if (p.state === 'unavailable') {
    const line = h(
      'p',
      { class: 'mic-unavailable', 'data-mic-unavailable': p.reason ?? 'unknown', role: 'note' },
      micUnavailableLine(p.reason),
    );
    return { el: line, button: null, hint: null, update: () => {} };
  }

  const ring = h('span', { class: 'mic-ring', 'data-mic-ring': true, 'aria-hidden': 'true' });
  const label = h('span', { class: 'mic-label' }, MIC_LABEL);
  const btn = h(
    'button',
    {
      type: 'button',
      class: 'cs-btn mic-btn',
      'data-mic-hold': true,
      'aria-label': MIC_A11Y_NAME,
      oncontextmenu: (ev: Event) => ev.preventDefault(),
      onpointerdown: (ev: Event) => {
        ev.preventDefault();
        const pe = ev as PointerEvent;
        if (typeof pe.button === 'number' && pe.button !== 0) return;
        startHold(a, 'pointer');
      },
      onkeydown: (ev: Event) => {
        const k = ev as KeyboardEvent;
        if (k.key !== ' ' && k.key !== 'Enter') return;
        // Space is held to talk; Enter would click: neither should click.
        k.preventDefault();
        if (k.key === ' ' && !k.repeat) startHold(a, 'key');
      },
    },
    ring,
    micGlyph(),
    label,
  );
  const hint = h('p', { class: 'mic-hint', 'data-mic-hint': true, role: 'status' });
  const wrap = h('span', { class: 'mic' }, btn);

  const update = (n: MicProps) => {
    const listening = n.state === 'listening';
    wrap.setAttribute('data-mic', '');
    wrap.setAttribute('data-mic-state', n.state);
    btn.setAttribute('aria-pressed', listening ? 'true' : 'false');
    hint.textContent = listening ? MIC_HINT : '';
    if (listening) hint.removeAttribute('hidden');
    else hint.setAttribute('hidden', '');
    const reduced = reducedMotion();
    ring.style.transform = listening ? `scale(${ringScale(n.level, reduced)})` : 'scale(1)';
    ring.style.opacity = listening ? String(ringOpacity(n.level, reduced)) : '0';
  };
  update(p);
  return { el: wrap, button: btn, hint, update };
}
