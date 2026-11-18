// M12 slice 1c task 11: the report preview + Copy (SPEC M12 "One report" goal 3).
//
// He sees the exact text first (scrollable, ≥ 20px), then taps Copy (≥ 56px). Copy goes through
// `copyText` (navigator.clipboard). On success: "Copied. Paste it where you want." and
// `onCopied()` (app.ts marks those answers sent). If the clipboard refuses, the sheet swaps the
// preview for a read-only text box with the whole report and "Select all and copy" (selects the
// text and tries the legacy copy); when that can't confirm a copy, the text stays selected for
// the system Copy and "I copied it" marks it sent.
// With nothing new since the last copy (`nothingNew`), it says so and offers "Copy all again"
// (`onCopyAll`: app.ts rebuilds the report with every answer and renders the sheet again).
//
// The app sends nothing: the text only reaches the clipboard, on his tap. Nothing here logs.
//
// e2e hooks: `[data-report-sheet]` (role="dialog"), `[data-report-text]` (the preview),
// `[data-report-copy]`, `[data-report-copied]`, `[data-report-empty]`, `[data-report-copy-all]`,
// `[data-report-fallback]` (the textarea), `[data-report-select]`, `[data-report-manual]`,
// `[data-report-close]`.
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { copyText as defaultCopy, selectAllAndCopy } from './clipboard';
import './todos.css';

export const COPIED_TEXT = 'Copied. Paste it where you want.';
export const EMPTY_TEXT = 'Nothing new since your last copy.';
export const FALLBACK_TEXT = "Copy didn't work here. Select all, then copy.";

export type ReportSheetProps = {
  /** The report from core `buildReport(...)`. */
  text: string;
  /** No unsent answers since the last copy: show the empty state instead of the preview. */
  nothingNew: boolean;
  /** Injected for tests; default `copyText` (navigator.clipboard). */
  copy?: ((text: string) => Promise<boolean>) | undefined;
  /** Injected for tests; default `selectAllAndCopy` (legacy copy command). */
  selectCopy?: ((box: HTMLTextAreaElement) => boolean) | undefined;
};

export type ReportSheetActions = {
  onClose: () => void;
  /** The text is on the clipboard (or he says he copied it): mark these answers sent. */
  onCopied: () => void;
  /** "Copy all again": rebuild with every answer. */
  onCopyAll: () => void;
};

export function reportSheet(props: ReportSheetProps, actions: ReportSheetActions): HTMLElement {
  const copy = props.copy ?? defaultCopy;
  const selectCopy = props.selectCopy ?? ((box: HTMLTextAreaElement) => selectAllAndCopy(box));
  let sent = false;
  const markSent = () => {
    if (sent) return;
    sent = true;
    actions.onCopied();
  };

  const status = h('p', { class: 'todo-report-status', role: 'status', 'aria-live': 'polite' });
  const showCopied = () => {
    status.setAttribute('data-report-copied', 'true');
    status.replaceChildren(icon('check', 'sm'), h('span', {}, COPIED_TEXT));
    markSent();
  };

  const body = h('div', { class: 'todo-report-body' });

  const showFallback = () => {
    const box = h('textarea', {
      class: 'todo-report-fallback',
      'data-report-fallback': true,
      readonly: true,
      rows: 12,
      'aria-label': 'Report text',
    });
    box.value = props.text;
    const manual = h(
      'button',
      {
        type: 'button',
        class: 'todo-copy-btn ghost',
        'data-report-manual': true,
        onclick: () => showCopied(),
      },
      h('span', {}, 'I copied it'),
    );
    const select = h(
      'button',
      {
        type: 'button',
        class: 'todo-copy-btn',
        'data-report-select': true,
        onclick: () => {
          if (selectCopy(box)) showCopied();
        },
      },
      h('span', {}, 'Select all and copy'),
    );
    body.replaceChildren(h('p', { class: 'set-note' }, FALLBACK_TEXT), box, select, manual);
    box.select?.();
  };

  if (props.nothingNew) {
    body.replaceChildren(
      h('p', { class: 'todo-report-empty', 'data-report-empty': true }, EMPTY_TEXT),
      h(
        'button',
        {
          type: 'button',
          class: 'todo-copy-btn',
          'data-report-copy-all': true,
          onclick: () => actions.onCopyAll(),
        },
        h('span', {}, 'Copy all again'),
      ),
    );
  } else {
    let busy = false;
    const copyBtn = h(
      'button',
      {
        type: 'button',
        class: 'todo-copy-btn',
        'data-report-copy': true,
        onclick: () => {
          if (busy) return;
          busy = true;
          void copy(props.text).then((ok) => {
            busy = false;
            if (ok) showCopied();
            else showFallback();
          });
        },
      },
      icon('list', 'md'),
      h('span', {}, 'Copy'),
    );
    body.replaceChildren(
      h('p', { class: 'muted set-note' }, 'This is the exact text that will be copied.'),
      h('pre', { class: 'todo-report-text', 'data-report-text': true, tabindex: 0 }, props.text),
      copyBtn,
    );
  }

  return h(
    'section',
    {
      class: `screen sheet todo-report ${moodClass('pro')}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'todo-report-title-h',
      'data-report-sheet': true,
    },
    h(
      'header',
      { class: 'top-bar' },
      h('h1', { class: 'page-title small-title', id: 'todo-report-title-h' }, 'Your report'),
      h(
        'button',
        {
          type: 'button',
          class: 'ghost-btn',
          'data-report-close': true,
          onclick: () => actions.onClose(),
        },
        'Close',
      ),
    ),
    body,
    status,
  );
}
