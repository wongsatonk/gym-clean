// M10 confirmation after Apply: the change in words plus Undo (≥ 56px) for 10 s (SPEC M10
// "Coach chat"). A bar drains over the window; under prefers-reduced-motion the bar stays full
// and static (coach.css), but the window still ends. The toast is a polite status region so the
// confirmation is announced without moving focus. On expiry it calls onExpire once, unless it was
// undone or already removed from the document. Callers that remove it early can call dispose().
//
// e2e hooks: `data-undo-toast`, button "Undo".
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon } from '../icons';
import '../chromeButtons.css';
import './coach.css';

export const UNDO_MS = 10_000;

export type UndoToastProps = {
  /** "Done. Curls swapped for hammer curls." */
  text: string;
  /** Default UNDO_MS. */
  durationMs?: number | undefined;
};

export type UndoToastActions = {
  onUndo: () => void;
  /** The window ended without Undo. */
  onExpire?: (() => void) | undefined;
};

export type UndoToast = HTMLElement & { dispose: () => void };

/** The bar's inline style: the drain length as a custom property (no colour, no font size). */
export function undoBarStyle(durationMs: number): string {
  return `--undo-ms:${Math.max(0, Math.round(durationMs))}ms`;
}

export function undoToast(p: UndoToastProps, a: UndoToastActions): UndoToast {
  const ms = p.durationMs ?? UNDO_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  // M13d task 40a: Undo = a round button with the undo arrow. The word sits beside the circle so
  // the toast stays one 56px row tall (as in 1.16.2): with the word under it the toast grew ~36px
  // and covered the Pause sheet's Coach row above Set done.
  const undo = iconButton({
    icon: 'undo',
    label: 'Undo',
    labelAt: 'beside',
    class: 'undo-action',
    onClick: () => {
      dispose();
      a.onUndo();
    },
  });
  const el = h(
    'div',
    { class: 'undo-toast', role: 'status', 'aria-atomic': 'true', 'data-undo-toast': true },
    h(
      'div',
      { class: 'undo-row' },
      h(
        'p',
        { class: 'undo-text' },
        icon('check', 'md', { class: 'undo-icon' }),
        h('span', {}, p.text),
      ),
      undo,
    ),
    h(
      'div',
      { class: 'undo-track', 'aria-hidden': 'true' },
      h('div', { class: 'undo-bar', style: undoBarStyle(ms) }),
    ),
  );
  timer = setTimeout(() => {
    timer = undefined;
    if (el.isConnected) a.onExpire?.();
  }, ms);
  return Object.assign(el, { dispose });
}
