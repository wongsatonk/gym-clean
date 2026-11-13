// M4c developer log panel for Settings → "Developer log" (task 8).
// On/off switch, size + session count, Export last / Export all (iOS share sheet when the
// browser can share files, else a download), and Clear with a two-tap confirm.
// Privacy: the log is pose numbers only and leaves the phone only through these buttons.

import type { GymDb } from '../data/db';
import {
  clearDevLog,
  devLogStats,
  exportBlob,
  getDevLogEnabled,
  setDevLogEnabled,
  type DevLogFile,
} from '../data/devlog';
import { h } from './dom';
import './devlog.css';

export const DEVLOG_CLEAR_CONFIRM_MS = 3000;
export const DEVLOG_PRIVACY_NOTE =
  'Body-pose numbers only. No video. Stays on this phone until you export it.';

/** The data calls the panel makes; injectable for the harness and e2e mocks. */
export type DevLogPanelApi = {
  getEnabled: () => Promise<boolean>;
  setEnabled: (on: boolean) => Promise<void>;
  stats: () => Promise<{ bytes: number; sessions: number }>;
  exportFile: (scope: 'last' | 'all') => Promise<DevLogFile>;
  clear: () => Promise<void>;
};

export type DevLogPanelOptions = {
  db: GymDb;
  /** Called after the switch is saved, so app.ts can start/skip the recorder. */
  onEnabledChange?: (on: boolean) => void;
  /** Overrides for tests/harness; defaults call src/data/devlog.ts with `db`. */
  api?: Partial<DevLogPanelApi>;
  /** Overrides how a file leaves the phone; default `deliverFile`. */
  deliver?: (file: File, secondTry: boolean) => Promise<DeliverResult>;
};

export type DevLogPanelHandle = {
  el: HTMLElement;
  /** Re-reads size/sessions (e.g. after a workout ends). */
  refresh: () => Promise<void>;
  /** Clears timers; call when Settings unmounts. */
  destroy: () => void;
};

export type DeliverResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

// ---------- pure formatting ----------

/** "0 kB", "820 kB", "6.4 MB", "142 MB" (binary units, matching the 150 MB cap). */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}

/** "6.4 MB · 3 sessions", "1 session", "Empty". */
export function devLogSummary(stats: { bytes: number; sessions: number }): string {
  if (stats.sessions === 0) return 'Empty';
  const s = stats.sessions === 1 ? 'session' : 'sessions';
  return `${formatBytes(stats.bytes)} · ${stats.sessions} ${s}`;
}

// ---------- delivery ----------

/**
 * Share sheet when the browser can share this file (iOS), else a download.
 * Safari may refuse `share()` after a long await (lost user activation): that returns
 * 'needs-tap' and the caller asks for one more tap that shares synchronously. On that
 * second try (`secondTry`), a repeated refusal downloads instead.
 */
export async function deliverFile(
  file: File,
  opts: {
    nav?: Navigator;
    download?: (file: File) => void;
    secondTry?: boolean;
  } = {},
): Promise<DeliverResult> {
  const nav = opts.nav ?? navigator;
  const download = opts.download ?? downloadFile;
  const data: ShareData = { files: [file], title: file.name };
  if (typeof nav.canShare === 'function' && typeof nav.share === 'function' && nav.canShare(data)) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError' && !opts.secondTry) return 'needs-tap';
      // Any other share failure (or a second refusal): fall back to a download.
    }
  }
  download(file);
  return 'downloaded';
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: file.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before the URL dies.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- component ----------

export function createDevLogPanel(opts: DevLogPanelOptions): DevLogPanelHandle {
  const { db } = opts;
  const api: DevLogPanelApi = {
    getEnabled: () => getDevLogEnabled(db),
    setEnabled: (on) => setDevLogEnabled(db, on),
    stats: () => devLogStats(db),
    exportFile: (scope) => exportBlob(db, { scope }),
    clear: () => clearDevLog(db),
    ...opts.api,
  };
  const deliver =
    opts.deliver ?? ((file: File, secondTry: boolean) => deliverFile(file, { secondTry }));

  let enabled = true;
  let busy = false;
  let saving = false;
  let clearTimer: number | undefined;
  /** A prepared file waiting for the "Tap to share" tap. */
  let pending: { file: File; scope: 'last' | 'all' } | undefined;

  const switchState = h('span', { class: 'switch-state', 'aria-hidden': 'true' }, 'On');
  const toggle = h(
    'button',
    {
      class: 'switch-btn on',
      role: 'switch',
      'aria-checked': 'true',
      'data-devlog': 'toggle',
      onclick: () => void onToggle(),
    },
    h('span', { class: 'switch-label' }, 'Record developer log'),
    switchState,
  );
  const summary = h('p', { class: 'devlog-summary', 'data-devlog': 'summary' }, '…');
  const exportLast = h(
    'button',
    { class: 'devlog-btn', 'data-devlog': 'export-last', onclick: () => void onExport('last') },
    'Export last session',
  );
  const exportAll = h(
    'button',
    { class: 'devlog-btn', 'data-devlog': 'export-all', onclick: () => void onExport('all') },
    'Export all',
  );
  const clearBtn = h(
    'button',
    { class: 'devlog-btn danger', 'data-devlog': 'clear', onclick: () => void onClear() },
    'Clear',
  );
  const status = h('p', {
    class: 'devlog-status',
    role: 'status',
    'aria-atomic': 'true',
    'data-devlog': 'status',
  });

  const el = h(
    'section',
    { class: 'devlog-panel', 'aria-label': 'Developer log', 'data-devlog': 'panel' },
    toggle,
    summary,
    h('div', { class: 'devlog-actions' }, exportLast, exportAll, clearBtn),
    status,
    h('p', { class: 'devlog-privacy', 'data-devlog': 'privacy' }, DEVLOG_PRIVACY_NOTE),
  );

  function setStatus(text: string): void {
    status.textContent = text;
  }

  function renderToggle(): void {
    toggle.classList.toggle('on', enabled);
    toggle.setAttribute('aria-checked', String(enabled));
    switchState.textContent = enabled ? 'On' : 'Off';
  }

  function resetExportLabels(): void {
    exportLast.textContent = 'Export last session';
    exportAll.textContent = 'Export all';
    delete exportLast.dataset.ready;
    delete exportAll.dataset.ready;
  }

  function disarmClear(): void {
    window.clearTimeout(clearTimer);
    clearTimer = undefined;
    delete clearBtn.dataset.armed;
    clearBtn.textContent = 'Clear';
  }

  async function refresh(): Promise<void> {
    try {
      const [on, stats] = await Promise.all([api.getEnabled(), api.stats()]);
      enabled = on;
      renderToggle();
      summary.textContent = devLogSummary(stats);
      el.dataset.sessions = String(stats.sessions);
      const empty = stats.sessions === 0;
      for (const b of [exportLast, exportAll, clearBtn]) b.disabled = empty || busy;
      if (empty) {
        pending = undefined;
        resetExportLabels();
        disarmClear();
      }
    } catch (err) {
      console.error('[devlog] stats failed', err);
      summary.textContent = 'Could not read the log';
    }
  }

  async function onToggle(): Promise<void> {
    if (saving) return; // a second tap while saving would race the rollback
    saving = true;
    const next = !enabled;
    enabled = next;
    renderToggle();
    try {
      await api.setEnabled(next);
      opts.onEnabledChange?.(next);
      setStatus(next ? 'Logging on. Starts with your next workout.' : 'Logging off.');
    } catch (err) {
      console.error('[devlog] toggle failed', err);
      enabled = !next;
      renderToggle();
      setStatus('Could not save. Try again.');
    } finally {
      saving = false;
    }
  }

  function report(result: DeliverResult, file: File, scope: 'last' | 'all'): void {
    if (result === 'needs-tap') {
      pending = { file, scope };
      const btn = scope === 'last' ? exportLast : exportAll;
      btn.textContent = 'Tap to share';
      btn.dataset.ready = 'true';
      setStatus('File ready. Tap again to share it.');
      return;
    }
    pending = undefined;
    resetExportLabels();
    if (result === 'shared') setStatus('Shared.');
    else if (result === 'downloaded') setStatus(`Saved ${file.name}`);
    else setStatus('Export cancelled.');
  }

  async function onExport(scope: 'last' | 'all'): Promise<void> {
    if (busy) return;
    disarmClear();
    // Second tap after Safari refused the share: share right away, inside the tap.
    if (pending && pending.scope === scope) {
      const { file } = pending;
      report(await deliver(file, true), file, scope);
      return;
    }
    pending = undefined;
    resetExportLabels();
    busy = true;
    const btn = scope === 'last' ? exportLast : exportAll;
    btn.textContent = 'Preparing…';
    for (const b of [exportLast, exportAll, clearBtn]) b.disabled = true;
    setStatus('Preparing the file…');
    try {
      const { blob, filename } = await api.exportFile(scope);
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      report(await deliver(file, false), file, scope);
    } catch (err) {
      console.error('[devlog] export failed', err);
      resetExportLabels();
      // The data layer throws readable messages (e.g. a plain-JSON export that is too big).
      const why = err instanceof Error && err.message ? ` ${err.message}` : ' Try again.';
      setStatus(`Export failed.${why}`);
    } finally {
      busy = false;
      if (!exportLast.dataset.ready && !exportAll.dataset.ready) resetExportLabels();
      await refresh();
    }
  }

  async function onClear(): Promise<void> {
    if (busy) return;
    if (!clearBtn.dataset.armed) {
      clearBtn.dataset.armed = 'true';
      clearBtn.textContent = 'Tap again to clear';
      clearTimer = window.setTimeout(disarmClear, DEVLOG_CLEAR_CONFIRM_MS);
      return;
    }
    disarmClear();
    try {
      await api.clear();
      setStatus('Developer log cleared.');
    } catch (err) {
      console.error('[devlog] clear failed', err);
      setStatus('Could not clear. Try again.');
    }
    await refresh();
  }

  void refresh();

  return {
    el,
    refresh,
    destroy: () => {
      disarmClear();
      pending = undefined; // let the prepared File be garbage-collected
    },
  };
}
