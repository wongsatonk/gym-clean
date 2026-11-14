import { h } from './dom';
import './silentHint.css';

/**
 * One-line "turn Silent mode off" reminder for the day preview (above "Start workout").
 * iOS/iPadOS Safari mutes web speech while the ring/silent switch is on, and a page can't detect
 * that switch, so on Apple touch devices we remind instead. "Got it" hides it for 30 days.
 */

export const SILENT_HINT_KEY = 'gc.silentHint.dismissedAt';
export const SILENT_HINT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

/** iPhone/iPod, or an iPad (iPadOS 13+ reports a desktop Mac UA but has touch points). */
export function isAppleTouchDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(SILENT_HINT_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(t: number): void {
  try {
    localStorage.setItem(SILENT_HINT_KEY, String(t));
  } catch {
    // No storage (private mode, blocked): the hint just comes back next time.
  }
}

/** Original speaker icon with two sound waves (decorative: the text says the same). */
function speakerIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '32');
  svg.setAttribute('height', '32');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('silent-hint-icon');
  const path = (d: string, fill: boolean) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', fill ? 'currentColor' : 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    return p;
  };
  // Speaker body + cone, then two sound waves.
  svg.append(
    path('M4 9.5h3.5L12 5.5v13l-4.5-4H4z', true),
    path('M15.5 9a4 4 0 0 1 0 6', false),
    path('M18.5 6.5a7.5 7.5 0 0 1 0 11', false),
  );
  return svg;
}

export type SilentHintOptions = {
  /** Defaults to navigator.userAgent / navigator.maxTouchPoints. */
  userAgent?: string;
  maxTouchPoints?: number;
  /** ms clock; default Date.now. */
  now?: () => number;
  /** Whether any spoken setting is on (all speech is on today). */
  speechRelevant?: boolean;
};

/** The reminder element, or null when it doesn't apply (not iOS, no speech, snoozed). */
export function silentHint(opts: SilentHintOptions = {}): HTMLElement | null {
  const ua = opts.userAgent ?? navigator.userAgent;
  const touch = opts.maxTouchPoints ?? navigator.maxTouchPoints ?? 0;
  const now = opts.now ?? Date.now;
  if (opts.speechRelevant === false) return null;
  if (!isAppleTouchDevice(ua, touch)) return null;
  const dismissedAt = readDismissedAt();
  if (dismissedAt !== null && now() - dismissedAt < SILENT_HINT_SNOOZE_MS) return null;

  const el = h(
    'div',
    { class: 'silent-hint', role: 'note', 'data-silent-hint': '' },
    speakerIcon(),
    h('p', { class: 'silent-hint-text' }, 'Spoken cues: turn Silent mode off.'),
    h(
      'button',
      {
        type: 'button',
        class: 'silent-hint-ok',
        onclick: () => {
          writeDismissedAt(now());
          // Hand focus on to what comes next (Start workout) so it isn't lost with the button.
          const next = el.nextElementSibling;
          if (next instanceof HTMLElement) next.focus();
          el.remove();
        },
      },
      'Got it',
    ),
  );
  return el;
}
