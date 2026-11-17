// M10 Settings → Plan changes (Pro mood, like Settings). Pure render: the change log and
// callbacks in, element out. No DB access: app.ts loads the PlanChange rows and runs core
// `undoLast` / reset.
//
// - Newest first (sorted here by createdAt, whatever order the rows arrive in).
// - Undo only on the newest change that is still applied (LIFO, like core `undoLast`). Undone
//   rows stay in the list, marked "Undone".
// - "Reset to default program" is two-tap, like End workout: the first tap arms it ("Tap again
//   to reset", danger fill + icon + words), the second resets; it disarms after `confirmMs`.
//   If the screen leaves the document while armed, the timer is dropped (MutationObserver only
//   during the armed window, as in the Pause sheet).
//
// e2e hooks: `main[data-screen="plan-changes"]`, `li.plan-change[data-change]` (the change id,
// or its index when unsaved) with `data-undone` when undone, Undo `[data-undo-change]`, Reset
// `[data-reset-plan]` (`data-armed` while armed), empty state `[data-plan-changes="empty"]`.
import type { PlanChange } from '../../core/types';
import { backButton } from '../backButton';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { dateLabel } from './today';

export const RESET_CONFIRM_MS = 3000;

export type PlanChangesProps = {
  changes: readonly PlanChange[];
  /** How long Reset stays armed. Default RESET_CONFIRM_MS. */
  confirmMs?: number | undefined;
};

export type PlanChangesActions = {
  onBack: () => void;
  /** Undo the newest applied change (the only one with an Undo button). */
  onUndo: (change: PlanChange) => void;
  /** Second tap on Reset to default program. */
  onReset: () => void;
};

const RESET_LABEL = 'Reset to default program';
const RESET_ARMED_LABEL = 'Tap again to reset';

/** "Sat 14 Nov · 18:05". */
export function changeWhen(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${dateLabel(ms)} · ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Newest first; ties keep their given order. */
export function newestFirst(changes: readonly PlanChange[]): PlanChange[] {
  return changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.createdAt - a.c.createdAt || a.i - b.i)
    .map(({ c }) => c);
}

function resetButton(onReset: () => void, confirmMs: number): HTMLElement {
  const label = h('span', {}, RESET_LABEL);
  const btn = h(
    'button',
    { type: 'button', class: 'plan-reset', 'data-reset-plan': true },
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
      btn.removeAttribute('data-armed');
      label.textContent = RESET_LABEL;
      onReset();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = RESET_ARMED_LABEL;
    timer = setTimeout(() => {
      stopArmedWindow();
      btn.removeAttribute('data-armed');
      label.textContent = RESET_LABEL;
    }, confirmMs);
    if (typeof MutationObserver === 'function') {
      watch = new MutationObserver(() => {
        if (!btn.isConnected) stopArmedWindow();
      });
      watch.observe(document, { childList: true, subtree: true });
    }
  });
  return btn;
}

function changeRow(
  c: PlanChange,
  key: string,
  undoable: boolean,
  actions: PlanChangesActions,
): HTMLElement {
  const undone = c.undoneAt !== undefined;
  return h(
    'li',
    {
      class: undone ? 'plan-change undone' : 'plan-change',
      'data-change': key,
      'data-undone': undone,
    },
    h(
      'div',
      { class: 'plan-change-txt' },
      h('strong', { class: 'plan-change-title' }, c.title),
      h(
        'span',
        { class: 'plan-change-when' },
        undone ? `${changeWhen(c.createdAt)} · Undone` : changeWhen(c.createdAt),
      ),
    ),
    undoable
      ? h(
          'button',
          {
            type: 'button',
            class: 'plan-undo',
            'data-undo-change': key,
            'aria-label': `Undo: ${c.title}`,
            onclick: () => actions.onUndo(c),
          },
          'Undo',
        )
      : null,
  );
}

export function planChangesScreen(
  props: PlanChangesProps,
  actions: PlanChangesActions,
): HTMLElement {
  const sorted = newestFirst(props.changes);
  const newestApplied = sorted.find((c) => c.undoneAt === undefined);
  const keyOf = (c: PlanChange) => String(c.id ?? props.changes.indexOf(c));
  return h(
    'main',
    { class: `screen plan-changes ${moodClass('pro')}`, 'data-screen': 'plan-changes' },
    h('header', { class: 'top-bar' }, backButton(actions.onBack)),
    h('h1', { class: 'page-title' }, 'Plan changes'),
    sorted.length
      ? h(
          'ol',
          { class: 'plan-change-list', 'aria-label': 'Plan changes, newest first' },
          ...sorted.map((c) => changeRow(c, keyOf(c), c === newestApplied, actions)),
        )
      : h(
          'p',
          { class: 'plan-empty', 'data-plan-changes': 'empty' },
          'No changes yet. Changes you apply from the Coach show up here.',
        ),
    h(
      'section',
      { class: 'plan-reset-box', 'aria-labelledby': 'plan-reset-title' },
      h('h2', { class: 'set-head', id: 'plan-reset-title' }, 'Start over'),
      h(
        'p',
        { class: 'set-note muted' },
        'Puts back the default program and schedule. You can undo it here.',
      ),
      resetButton(actions.onReset, props.confirmMs ?? RESET_CONFIRM_MS),
    ),
  );
}
