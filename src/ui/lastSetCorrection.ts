// M4c "Last set" correction for the Rest screen (task 8). Collapsed it is one line,
// "Last set: 9 reps · 1 partial  Fix"; Fix opens two big steppers (reps, partials) + Save.
// It only reports the new numbers through `onCorrect`; app.ts dispatches CORRECT_LAST_SET,
// updates the set row and the developer log.

import { h } from './dom';
import './devlog.css';

export const CORRECTION_MAX = 99;

export type LastSetCorrectionOptions = {
  reps: number;
  partials: number;
  /** Called on Save, only when a number changed. */
  onCorrect: (reps: number, partials: number) => void;
  /** Upper bound for both steppers; default 99. */
  max?: number;
};

export type LastSetCorrectionHandle = {
  el: HTMLElement;
  /** New values from outside (e.g. state re-render); closes the editor. */
  update: (reps: number, partials: number) => void;
};

// ---------- pure formatting ----------

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "9 reps · 1 partial"; partials are left out when 0 ("9 reps"). */
export function lastSetText(reps: number, partials: number): string {
  return partials > 0
    ? `${plural(reps, 'rep')} · ${plural(partials, 'partial')}`
    : plural(reps, 'rep');
}

export function clampCount(n: number, max = CORRECTION_MAX): number {
  return Math.max(0, Math.min(max, Math.round(n)));
}

// ---------- component ----------

export function createLastSetCorrection(opts: LastSetCorrectionOptions): LastSetCorrectionHandle {
  const max = opts.max ?? CORRECTION_MAX;
  let saved = { reps: clampCount(opts.reps, max), partials: clampCount(opts.partials, max) };
  let draft = { ...saved };
  let open = false;

  const summary = h('span', { class: 'lsc-summary', 'data-lsc': 'summary' });
  const fixBtn = h(
    'button',
    {
      class: 'lsc-fix',
      'aria-expanded': 'false',
      'aria-controls': 'lsc-editor',
      'data-lsc': 'fix',
      onclick: () => setOpen(!open),
    },
    'Fix',
  );

  function stepper(field: 'reps' | 'partials', label: string) {
    const value = h('output', {
      class: 'lsc-value',
      'aria-live': 'polite',
      'data-lsc': `${field}-value`,
    });
    const minus = h(
      'button',
      {
        class: 'lsc-step',
        'aria-label': `${label} minus`,
        'data-lsc': `${field}-minus`,
        onclick: () => bump(field, -1),
      },
      '−',
    );
    const plus = h(
      'button',
      {
        class: 'lsc-step',
        'aria-label': `${label} plus`,
        'data-lsc': `${field}-plus`,
        onclick: () => bump(field, 1),
      },
      '+',
    );
    const row = h(
      'div',
      { class: 'lsc-stepper', role: 'group', 'aria-label': label, 'data-lsc': field },
      h('span', { class: 'lsc-label' }, label),
      h('div', { class: 'lsc-row' }, minus, value, plus),
    );
    return { row, value, minus, plus };
  }

  const reps = stepper('reps', 'Reps');
  const partials = stepper('partials', 'Partials');
  const saveBtn = h(
    'button',
    { class: 'lsc-save', 'data-lsc': 'save', onclick: () => onSave() },
    'Save',
  );
  const cancelBtn = h(
    'button',
    { class: 'lsc-cancel', 'data-lsc': 'cancel', onclick: () => setOpen(false) },
    'Cancel',
  );
  const editor = h(
    'div',
    { class: 'lsc-editor', id: 'lsc-editor', hidden: true, 'data-lsc': 'editor' },
    h('div', { class: 'lsc-steppers' }, reps.row, partials.row),
    h('div', { class: 'lsc-buttons' }, cancelBtn, saveBtn),
  );
  const status = h('p', {
    class: 'lsc-status',
    role: 'status',
    'aria-atomic': 'true',
    'data-lsc': 'status',
  });

  const el = h(
    'section',
    { class: 'lsc', 'aria-label': 'Correct the last set', 'data-lsc': 'panel' },
    h(
      'div',
      { class: 'lsc-line' },
      h('span', { class: 'lsc-prefix' }, 'Last set:'),
      summary,
      fixBtn,
    ),
    editor,
    status,
  );

  function render(): void {
    summary.textContent = lastSetText(saved.reps, saved.partials);
    el.dataset.reps = String(saved.reps);
    el.dataset.partials = String(saved.partials);
    reps.value.textContent = String(draft.reps);
    partials.value.textContent = String(draft.partials);
    reps.minus.disabled = draft.reps <= 0;
    partials.minus.disabled = draft.partials <= 0;
    reps.plus.disabled = draft.reps >= max;
    partials.plus.disabled = draft.partials >= max;
    editor.hidden = !open;
    el.classList.toggle('open', open);
    fixBtn.textContent = open ? 'Close' : 'Fix';
    fixBtn.setAttribute('aria-expanded', String(open));
  }

  function setOpen(next: boolean): void {
    open = next;
    draft = { ...saved };
    if (next) status.textContent = '';
    render();
  }

  function bump(field: 'reps' | 'partials', delta: number): void {
    draft[field] = clampCount(draft[field] + delta, max);
    render();
  }

  function onSave(): void {
    const changed = draft.reps !== saved.reps || draft.partials !== saved.partials;
    if (changed) {
      saved = { ...draft };
      opts.onCorrect(saved.reps, saved.partials);
      status.textContent = `Saved: ${lastSetText(saved.reps, saved.partials)}`;
    }
    setOpen(false);
  }

  render();

  return {
    el,
    update: (r, p) => {
      saved = { reps: clampCount(r, max), partials: clampCount(p, max) };
      setOpen(false);
    },
  };
}
