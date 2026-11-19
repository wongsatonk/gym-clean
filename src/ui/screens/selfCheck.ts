// 1.15.0: Settings → Self-check (route 'settings/selfcheck', Pro mood). After an install he opens
// this before the gym to see the app is ready (a build once shipped without the pose engine and the
// camera failed at the gym). Props in / callbacks out: the checks are injected as
// `{ id, name, run }` (the real ones are src/ui/selfCheckRuns.ts), so this screen only runs them
// one at a time, shows each state as an icon AND a word (never colour alone), a one-line fix when
// not ok, and the summary in one atomic status region. Read at rest, so nothing is spoken.
// "Copy results" copies text only: check names, states, our own detail lines and the version.
//
// e2e hooks: `main[data-screen="selfcheck"]`, `[data-check="<id>"][data-state]`,
// `[data-check-fix]`, `[data-selfcheck-summary]`, `[data-selfcheck-again]`,
// `[data-selfcheck-copy]`, `[data-selfcheck-copied]`.
import { APP_NAME } from '../../core/brand';
import { backButton } from '../backButton';
import { h } from '../dom';
import { iconButton } from '../iconButton';
import { icon, type IconName } from '../icons';
import { moodClass } from '../tokens';
import './selfCheck.css';
import '../settingsButtons.css';

export type CheckState = 'waiting' | 'running' | 'ok' | 'info' | 'warn' | 'fail';
export type CheckOutcome = {
  state: 'ok' | 'info' | 'warn' | 'fail';
  detail?: string;
  fix?: string;
};

export type SelfCheck = {
  id: string;
  name: string;
  /** Info-only row (the app version): never counted in "All N ready". */
  info?: boolean;
  run: () => Promise<CheckOutcome>;
};

export type CheckRow = {
  id: string;
  name: string;
  state: CheckState;
  info?: boolean;
  detail?: string | undefined;
  fix?: string | undefined;
};

export const STATE_WORD: Record<CheckState, string> = {
  waiting: 'Waiting',
  running: 'Checking',
  ok: 'OK',
  info: 'Info',
  warn: 'Warning',
  fail: 'Failed',
};

const STATE_ICON: Record<CheckState, IconName> = {
  waiting: 'clock',
  running: 'timer',
  ok: 'check',
  info: 'help',
  warn: 'flag',
  fail: 'close',
};

export const SELF_CHECK_TITLE = 'Self-check';
export const SELF_CHECK_INTRO = 'Run this after you install an update, before the gym.';
export const RUN_AGAIN = 'Run again';
export const COPY_LABEL = 'Copy results';
export const COPIED = 'Copied. Paste it in a message to yourself.';
export const COPY_FAILED = "Couldn't copy on this phone.";
/** The screen's backstop when a check's own timeout didn't fire (selfCheckRuns has one each). */
export const DEFAULT_TIMEOUT_MS = 45_000;

const pending = (s: CheckState) => s === 'waiting' || s === 'running';

/** "All 8 ready" / "2 need attention" / "Checking… 3 of 9 done". Info rows are ready. */
export function summaryText(rows: readonly CheckRow[]): string {
  if (rows.some((r) => pending(r.state))) {
    const done = rows.filter((r) => !pending(r.state)).length;
    return `Checking… ${done} of ${rows.length} done`;
  }
  const bad = rows.filter((r) => r.state === 'warn' || r.state === 'fail').length;
  if (bad === 0) return `All ${rows.filter((r) => !r.info).length} ready`;
  return bad === 1 ? '1 needs attention' : `${bad} need attention`;
}

/** Plain text for "Copy results": names, states, our detail lines, the version. */
export function copyText(rows: readonly CheckRow[], version: string): string {
  return [
    `${APP_NAME} self-check`,
    version,
    summaryText(rows),
    ...rows.map((r) => {
      let line = `${r.name}: ${STATE_WORD[r.state]}`;
      if (r.detail) line += `. ${r.detail}`;
      if (r.fix) line += ` Fix: ${r.fix}`;
      return line;
    }),
  ].join('\n');
}

function errorText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return typeof e === 'string' && e ? e : 'Something went wrong';
}

function withBackstop(p: Promise<CheckOutcome>, ms: number): Promise<CheckOutcome> {
  return new Promise((resolve) => {
    const t = setTimeout(
      () =>
        resolve({
          state: 'fail',
          detail: `Didn't answer within ${Math.round(ms / 1000)} s.`,
          fix: 'Tap Run again.',
        }),
      ms,
    );
    p.then(
      (r) => (clearTimeout(t), resolve(r)),
      (e: unknown) => (clearTimeout(t), resolve({ state: 'fail', detail: errorText(e) })),
    );
  });
}

export type SelfCheckProps = {
  checks: readonly SelfCheck[];
  /** The version line shown under the title and copied (main passes the full one). */
  version: string;
  /** Clipboard write; default navigator.clipboard.writeText. */
  copy?: ((text: string) => Promise<void>) | undefined;
  /** Backstop per check (ms). */
  timeoutMs?: number | undefined;
  /** Start the checks on open (default true; only `selfCheckScreen` reads it). */
  autoRun?: boolean | undefined;
};

export type SelfCheckActions = {
  onBack: () => void;
};

export type SelfCheckView = { el: HTMLElement; run: () => Promise<void> };

function defaultCopy(text: string): Promise<void> {
  const clip = (globalThis as { navigator?: { clipboard?: Clipboard } }).navigator?.clipboard;
  return clip ? clip.writeText(text) : Promise.reject(new Error('no clipboard'));
}

function rowEl(r: CheckRow): HTMLElement {
  return h(
    'li',
    { class: `selfcheck-row is-${r.state}`, 'data-check': r.id, 'data-state': r.state },
    h(
      'span',
      { class: 'selfcheck-state' },
      icon(STATE_ICON[r.state], 'md'),
      h('span', { class: 'selfcheck-word' }, STATE_WORD[r.state]),
    ),
    h(
      'div',
      { class: 'selfcheck-text' },
      h('p', { class: 'selfcheck-name' }, r.name),
      r.detail ? h('p', { class: 'selfcheck-detail' }, r.detail) : null,
      r.fix && r.state !== 'ok'
        ? h('p', { class: 'selfcheck-fix', 'data-check-fix': true }, r.fix)
        : null,
    ),
  );
}

/** The screen plus `run()` (tests and `selfCheckScreen` call it). */
export function selfCheckView(p: SelfCheckProps, a: SelfCheckActions): SelfCheckView {
  const fresh = (): CheckRow[] =>
    p.checks.map((c) => ({ id: c.id, name: c.name, state: 'waiting', info: c.info === true }));
  let rows = fresh();
  let running = false;

  const summary = h('p', {
    class: 'selfcheck-summary',
    role: 'status',
    'aria-atomic': 'true',
    'data-selfcheck-summary': true,
  });
  const list = h('ul', { class: 'selfcheck-list', 'aria-label': 'Checks' });
  const copied = h('p', {
    class: 'selfcheck-copied',
    role: 'status',
    'data-selfcheck-copied': true,
  });
  // M13d task 40d (Goal 7): Run again is the page's main round button, Copy results a secondary
  // one; both pills (the whole row the tap area, as the bars they replace).
  const again = iconButton({
    icon: 'refresh',
    label: RUN_AGAIN,
    variant: 'main',
    wideHit: true,
    class: 'set-ib-pill',
    hooks: { 'data-selfcheck-again': true },
    onClick: () => void run(),
  });
  const copyBtn = iconButton({
    icon: 'list',
    label: COPY_LABEL,
    labelAt: 'beside',
    wideHit: true,
    class: 'set-ib-pill',
    hooks: { 'data-selfcheck-copy': true },
    onClick: () => {
      if (running) return;
      void (p.copy ?? defaultCopy)(copyText(rows, p.version)).then(
        () => (copied.textContent = COPIED),
        () => (copied.textContent = COPY_FAILED),
      );
    },
  });

  const paint = () => {
    summary.textContent = summaryText(rows);
    const bad = !running && rows.some((r) => r.state === 'warn' || r.state === 'fail');
    summary.setAttribute('data-tone', running ? 'running' : bad ? 'attention' : 'ready');
    list.replaceChildren(...rows.map(rowEl));
    if (running) {
      again.setAttribute('disabled', '');
      copyBtn.setAttribute('disabled', '');
    } else {
      again.removeAttribute('disabled');
      copyBtn.removeAttribute('disabled');
    }
  };

  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    rows = fresh();
    copied.textContent = '';
    paint();
    const ms = p.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    for (const [i, c] of p.checks.entries()) {
      const base: CheckRow = { id: c.id, name: c.name, state: 'running', info: c.info === true };
      rows[i] = base;
      paint();
      let out: CheckOutcome;
      try {
        out = await withBackstop(c.run(), ms);
      } catch (e) {
        out = { state: 'fail', detail: errorText(e) }; // run() threw synchronously
      }
      rows[i] = { ...base, state: out.state, detail: out.detail, fix: out.fix };
      paint();
    }
    running = false;
    paint();
  };

  paint();
  const el = h(
    'main',
    { class: `screen selfcheck settings ${moodClass('pro')}`, 'data-screen': 'selfcheck' },
    h('header', { class: 'top-bar' }, backButton(a.onBack, 'Settings')),
    h('h1', { class: 'page-title' }, SELF_CHECK_TITLE),
    h('p', { class: 'selfcheck-intro' }, SELF_CHECK_INTRO),
    h('p', { class: 'selfcheck-version' }, p.version),
    summary,
    list,
    h('div', { class: 'selfcheck-actions' }, again, copyBtn),
    copied,
  );
  return { el, run };
}

/** What main mounts: the screen, with the checks started on open (unless autoRun is false). */
export function selfCheckScreen(p: SelfCheckProps, a: SelfCheckActions): HTMLElement {
  const v = selfCheckView(p, a);
  if (p.autoRun !== false) void v.run();
  return v.el;
}
