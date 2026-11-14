// M4e Pause sheet (Pro mood). Resume is the action; Skip exercise and End workout moved here from
// the Exercise and Rest footers (SPEC M4e "Picked") so they can't be hit by accident mid-set.
// End keeps its two-tap confirmation: the first tap arms it ("Tap again to end", danger fill,
// flag icon + words), the second ends the workout; it disarms itself after `confirmMs`.
//
// e2e hooks: dialog named "Paused", buttons "Resume", "Skip exercise", "End workout" →
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
  btn.addEventListener('click', () => {
    if (btn.getAttribute('data-armed') !== null) {
      if (timer !== undefined) clearTimeout(timer);
      onEnd();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = END_ARMED_LABEL;
    timer = setTimeout(() => {
      btn.removeAttribute('data-armed');
      label.textContent = END_LABEL;
    }, confirmMs);
  });
  return btn;
}

export function pauseSheet(p: PauseSheetProps, a: PauseSheetActions): HTMLElement {
  return h(
    'div',
    {
      class: `overlay pause-sheet ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Paused',
      'data-pause-sheet': true,
    },
    h(
      'div',
      { class: 'pause-panel' },
      h('p', { class: 'overlay-title' }, icon('pause', 'lg'), 'Paused'),
      p.context ? h('p', { class: 'pause-context muted' }, p.context) : null,
      h(
        'button',
        {
          type: 'button',
          class: 'primary-btn cta-btn',
          'data-pause': 'resume',
          onclick: a.onResume,
        },
        icon('play', 'lg'),
        'Resume',
      ),
      p.canSkip === false
        ? null
        : h(
            'button',
            { type: 'button', class: 'pause-btn', 'data-pause': 'skip', onclick: a.onSkip },
            icon('skip', 'md'),
            h('span', {}, 'Skip exercise'),
          ),
      endButton(a.onEnd, p.confirmMs ?? END_CONFIRM_MS),
    ),
  );
}
