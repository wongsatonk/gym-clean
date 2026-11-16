// M9 B2: Settings → Backup. Pure render: the restore step in, element out. No DB access and no
// file handling beyond the picker: app.ts writes the file (a Blob download, nothing uploaded),
// reads the picked file, validates it (src/data/backup `validateBackup`) and restores it.
//
// Restore is two steps, both taps ≥ 56px: pick a file → "Replace all data on this phone?" with
// a two-tap Replace (the first tap arms "Tap again to replace", danger fill + words, like Reset
// to default program), or Cancel. Errors are plain words (`backupErrorText`).
//
// e2e hooks: `[data-backup-export]`, `[data-backup-restore]`, the hidden file input
// `input[data-backup-file]`, `[data-backup-confirm]` (the question), `[data-backup-replace]`
// (`data-armed` while armed), `[data-backup-cancel]`, `[data-backup-status]`.
import type { BackupErrorCode } from '../../data/backup';
import { h } from '../dom';
import { icon } from '../icons';

export const REPLACE_CONFIRM_MS = 3000;
export const REPLACE_QUESTION = 'Replace all data on this phone?';
export const BACKUP_NOTE =
  'Saves your workouts, plan and settings to a file on this phone. Nothing is uploaded.';
/** M7b: the food photos and the food model stay out of the backup (src/data/backup.ts). */
export const BACKUP_PHOTOS_NOTE =
  'Food photos and the food model aren’t in the backup. Export the photos in Food photos.';

/** Where the restore is. `summary` names what's in the picked file, e.g. "12 workouts". */
export type RestoreStep =
  | { kind: 'idle' }
  | { kind: 'confirm'; fileName: string; summary: string }
  | { kind: 'busy' }
  | { kind: 'message'; text: string; error: boolean };

export type BackupPanelProps = {
  restore: RestoreStep;
  confirmMs?: number | undefined;
};

export type BackupPanelActions = {
  onExport: () => void;
  /** A file was picked (validated by app.ts). */
  onPickFile: (file: File) => void;
  /** Second tap on Replace. */
  onConfirmRestore: () => void;
  onCancelRestore: () => void;
};

/** BackupError codes as plain words. */
export function backupErrorText(code: BackupErrorCode): string {
  switch (code) {
    case 'newer':
      return 'This backup is from a newer version. Update the app first.';
    case 'corrupt':
    case 'format':
      return "This file isn't a Gym Clean backup. Nothing changed.";
    case 'write':
      return "Couldn't restore. Nothing changed.";
  }
}

/** "gym-clean-2026-11-15.gymclean-backup.json" for a local date. */
export function backupFileName(ms: number): string {
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `gym-clean-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.gymclean-backup.json`;
}

const REPLACE_LABEL = 'Replace';
const REPLACE_ARMED_LABEL = 'Tap again to replace';

function replaceButton(onConfirm: () => void, confirmMs: number): HTMLElement {
  const label = h('span', {}, REPLACE_LABEL);
  const btn = h(
    'button',
    { type: 'button', class: 'plan-reset backup-replace', 'data-backup-replace': true },
    icon('flag', 'md'),
    label,
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    btn.removeAttribute('data-armed');
    label.textContent = REPLACE_LABEL;
  };
  btn.addEventListener('click', () => {
    if (btn.getAttribute('data-armed') !== null) {
      disarm();
      onConfirm();
      return;
    }
    btn.setAttribute('data-armed', 'true');
    label.textContent = REPLACE_ARMED_LABEL;
    timer = setTimeout(disarm, confirmMs);
  });
  return btn;
}

export function backupPanel(props: BackupPanelProps, actions: BackupPanelActions): HTMLElement {
  const input = h('input', {
    type: 'file',
    accept: '.json,application/json',
    class: 'backup-file',
    'data-backup-file': true,
    'aria-hidden': 'true',
    tabindex: '-1',
  });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.value = '';
    if (file) actions.onPickFile(file);
  });
  const r = props.restore;
  const busy = r.kind === 'busy';
  const status =
    r.kind === 'message'
      ? h(
          'p',
          {
            class: r.error ? 'set-note backup-status error' : 'set-note backup-status',
            role: 'status',
            'data-backup-status': r.error ? 'error' : 'ok',
          },
          r.text,
        )
      : null;
  const confirm =
    r.kind === 'confirm'
      ? h(
          'div',
          { class: 'backup-confirm', role: 'group', 'aria-labelledby': 'backup-q' },
          h(
            'p',
            { class: 'backup-q', id: 'backup-q', 'data-backup-confirm': true },
            REPLACE_QUESTION,
          ),
          h('p', { class: 'set-note muted' }, `${r.fileName}: ${r.summary}.`),
          replaceButton(actions.onConfirmRestore, props.confirmMs ?? REPLACE_CONFIRM_MS),
          h(
            'button',
            {
              type: 'button',
              class: 'set-action',
              'data-backup-cancel': true,
              onclick: () => actions.onCancelRestore(),
            },
            'Cancel',
          ),
        )
      : null;
  return h(
    'div',
    { class: 'backup-panel', 'data-backup': true },
    h('p', { class: 'set-note muted' }, BACKUP_NOTE),
    h('p', { class: 'set-note muted', 'data-backup-photos-note': true }, BACKUP_PHOTOS_NOTE),
    h(
      'button',
      {
        type: 'button',
        class: 'set-action',
        'data-backup-export': true,
        disabled: busy,
        onclick: () => actions.onExport(),
      },
      'Back up',
    ),
    confirm ??
      h(
        'button',
        {
          type: 'button',
          class: 'set-action',
          'data-backup-restore': true,
          disabled: busy,
          onclick: () => input.click(),
        },
        busy ? 'Restoring…' : 'Restore from a file',
      ),
    input,
    status,
  );
}
