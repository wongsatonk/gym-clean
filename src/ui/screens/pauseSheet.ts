// M4e Pause sheet (Pro mood). Resume is the action; Skip exercise and End workout moved here from
// the Exercise and Rest footers (SPEC M4e "Picked") so they can't be hit by accident mid-set.
// End keeps its two-tap confirmation: the first tap arms it ("Tap again to end", danger fill,
// flag icon + words), the second ends the workout; it disarms itself after `confirmMs`.
// M10 (task 15): an optional "Coach" row under Resume opens the coach sheet (app.ts passes
// `onCoach`, and opens it with typing allowed: the set isn't running while paused). Left out when
// `onCoach` is absent. The Exercise/camera screens themselves never show a Coach entry.
// Escape resumes. Tab / Shift+Tab cycle Resume → Coach → Skip → End inside the sheet (a focus trap; the
// page behind is made inert by the app). If the sheet leaves the document while End is armed,
// the disarm timer is cleared: a MutationObserver runs only during that armed window, so the
// caller needs no dispose call.
//
// e2e hooks: dialog named "Paused", buttons "Resume", "Coach" (`data-pause="coach"`), "Skip exercise", "End workout" →
// "Tap again to end" (`data-armed` while armed).
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';

export const END_CONFIRM_MS = 3000;

export type PauseSheetProps = {
  /** "Bench Press · set 2 of 4": what Resume returns to. */
  context?: string | undefined;
  /** Hide Skip (e.g. nothing left to skip to). Default true. */
  canSkip?: boolean | undefined;
  /** How long End stays armed. Default END_CONFIRM_MS. */
  confirmMs?: number | undefined;
};

export type PauseSheetActions = {
  onResume: () => void;
  onSkip: () => void;
  onEnd: () => void;
  /** M10: open the coach sheet. Omitted → no Coach row. */
  onCoach?: (() => void) | undefined;
};

const END_LABEL = 'End workout';
const END_ARMED_LABEL = 'Tap again to end';

function endButton(onEnd: () => void, confirmMs: number): HTMLElement {
  const label = h('span', {}, END_LABEL);
  const btn = h(
    'button',
    { type: 'button', class: 'pause-btn pause-end', 'data-pause': 'end' },
    icon('flag', 'md'),
    label,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  let watch: MutationObserver | undefined;
  const stopArmedWindow = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    watch?.disconnect();
    watch = undefined;
  };
  btn.addEventListener('click', () => {
    if (btn.getAttribute('data-armed') !== null) {
      stopArmedWindow();
      onEnd();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = END_ARMED_LABEL;
    timer = setTimeout(() => {
      stopArmedWindow();
      btn.removeAttribute('data-armed');
      label.textContent = END_LABEL;
    }, confirmMs);
    // Sheet removed (Resume, re-render) while armed → drop the pending timer with it.
    watch = new MutationObserver(() => {
      if (!btn.isConnected) stopArmedWindow();
    });
    watch.observe(document, { childList: true, subtree: true });
  });
  return btn;
}

export function pauseSheet(p: PauseSheetProps, a: PauseSheetActions): HTMLElement {
  const resume = h(
    'button',
    {
      type: 'button',
      class: 'primary-btn cta-btn',
      'data-pause': 'resume',
      onclick: a.onResume,
    },
    icon('play', 'lg'),
    'Resume',
  );
  const skip =
    p.canSkip === false
      ? null
      : h(
          'button',
          { type: 'button', class: 'pause-btn', 'data-pause': 'skip', onclick: a.onSkip },
          icon('skip', 'md'),
          h('span', {}, 'Skip exercise'),
        );
  const coach = a.onCoach
    ? h(
        'button',
        {
          type: 'button',
          class: 'pause-btn pause-coach',
          'data-pause': 'coach',
          onclick: a.onCoach,
        },
        icon('chat', 'md'),
        h('span', {}, 'Coach'),
      )
    : null;
  const end = endButton(a.onEnd, p.confirmMs ?? END_CONFIRM_MS);
  const cycle = [resume, coach, skip, end].filter((b): b is HTMLElement => b !== null);

  const sheet = h(
    'div',
    {
      class: `overlay pause-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Paused',
      // Focusable (not tabbable) so a tap on the panel keeps focus, and keys, inside the sheet.
      tabindex: '-1',
      'data-pause-sheet': true,
    },
    h(
      'div',
      { class: 'pause-panel' },
      h('p', { class: 'overlay-title' }, icon('pause', 'lg'), 'Paused'),
      p.context ? h('p', { class: 'pause-context muted' }, p.context) : null,
      resume,
      coach,
      skip,
      end,
    ),
  );
  sheet.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      a.onResume();
      return;
    }
    if (ev.key !== 'Tab') return;
    ev.preventDefault();
    const at = cycle.indexOf(document.activeElement as HTMLElement);
    const n = cycle.length;
    // From the sheet itself (or anywhere else), Tab enters at Resume and Shift+Tab at End.
    const next = at < 0 ? (ev.shiftKey ? n - 1 : 0) : (at + (ev.shiftKey ? n - 1 : 1)) % n;
    cycle[next]?.focus();
  });
  return sheet;
}
