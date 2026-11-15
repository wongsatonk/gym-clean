import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKUP_NOTE,
  REPLACE_QUESTION,
  backupErrorText,
  backupFileName,
  backupPanel,
  type RestoreStep,
} from './backupPanel';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

function render(restore: RestoreStep = { kind: 'idle' }) {
  const calls = { export: 0, picked: [] as unknown[], confirm: 0, cancel: 0 };
  const el = asFake(
    backupPanel(
      { restore, confirmMs: 3000 },
      {
        onExport: () => calls.export++,
        onPickFile: (f) => calls.picked.push(f),
        onConfirmRestore: () => calls.confirm++,
        onCancelRestore: () => calls.cancel++,
      },
    ),
  );
  return { el, calls };
}

const attr = (el: FakeEl, name: string) => {
  const hit = el.find((e) => e.hasAttribute(name))[0];
  if (!hit) throw new Error(`no [${name}]`);
  return hit;
};

describe('backup panel', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('idle: the note (nothing uploaded), Back up and Restore, a hidden JSON file input', () => {
    const { el, calls } = render();
    expect(el.textContent).toContain(BACKUP_NOTE);
    expect(BACKUP_NOTE).toMatch(/Nothing is uploaded/);
    attr(el, 'data-backup-export').click();
    expect(calls.export).toBe(1);
    expect(attr(el, 'data-backup-restore').textContent).toBe('Restore from a file');
    const input = attr(el, 'data-backup-file');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('accept')).toContain('.json');
    expect(el.find((e) => e.hasAttribute('data-backup-confirm'))).toHaveLength(0);
  });

  it('a picked file is passed on and the input is cleared (the same file can be picked again)', () => {
    const { el, calls } = render();
    const input = attr(el, 'data-backup-file') as FakeEl & { files?: unknown[]; value?: string };
    const file = { name: 'x.json' };
    input.files = [file];
    input.value = 'C:\\fakepath\\x.json';
    input.dispatch('change', {});
    expect(calls.picked).toEqual([file]);
    expect(input.value).toBe('');
  });

  it('confirm: asks "Replace all data on this phone?", Replace takes two taps, Cancel backs out', () => {
    const { el, calls } = render({ kind: 'confirm', fileName: 'b.json', summary: '3 workouts' });
    expect(attr(el, 'data-backup-confirm').textContent).toBe(REPLACE_QUESTION);
    expect(el.textContent).toContain('b.json: 3 workouts.');
    // The question replaces the Restore button.
    expect(el.find((e) => e.hasAttribute('data-backup-restore'))).toHaveLength(0);
    const replace = attr(el, 'data-backup-replace');
    replace.click();
    expect(calls.confirm).toBe(0);
    expect(replace.getAttribute('data-armed')).toBe('true');
    expect(replace.textContent).toBe('Tap again to replace');
    replace.click();
    expect(calls.confirm).toBe(1);
    attr(el, 'data-backup-cancel').click();
    expect(calls.cancel).toBe(1);
  });

  it('an armed Replace disarms after the confirm window', () => {
    const { el, calls } = render({ kind: 'confirm', fileName: 'b.json', summary: '1 workout' });
    const replace = attr(el, 'data-backup-replace');
    replace.click();
    vi.advanceTimersByTime(3000);
    expect(replace.hasAttribute('data-armed')).toBe(false);
    expect(replace.textContent).toBe('Replace');
    replace.click();
    expect(calls.confirm).toBe(0);
  });

  it('busy disables both actions; a message shows as a status line', () => {
    const busy = render({ kind: 'busy' }).el;
    expect(attr(busy, 'data-backup-export').hasAttribute('disabled')).toBe(true);
    expect(attr(busy, 'data-backup-restore').textContent).toBe('Restoring…');
    const msg = render({ kind: 'message', text: backupErrorText('newer'), error: true }).el;
    const st = attr(msg, 'data-backup-status');
    expect(st.getAttribute('role')).toBe('status');
    expect(st.getAttribute('data-backup-status')).toBe('error');
    expect(st.textContent).toMatch(/Update the app first/);
  });

  it('error codes read as plain words; nothing says "error" or a code', () => {
    expect(backupErrorText('newer')).toMatch(/Update the app first/);
    expect(backupErrorText('corrupt')).toMatch(/isn't a Gym Clean backup/);
    expect(backupErrorText('format')).toBe(backupErrorText('corrupt'));
    expect(backupErrorText('write')).toMatch(/Nothing changed/);
    for (const c of ['newer', 'corrupt', 'format', 'write'] as const)
      expect(backupErrorText(c)).not.toMatch(/error|corrupt|format/i);
  });

  it('file name: gym-clean-YYYY-MM-DD.gymclean-backup.json (local date)', () => {
    expect(backupFileName(new Date(2026, 10, 5, 23, 30).getTime())).toBe(
      'gym-clean-2026-11-05.gymclean-backup.json',
    );
  });
});
