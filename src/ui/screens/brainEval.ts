// M12 slice 2 task 18: the on-device brain eval screen (developer only, iPhone app only, opened
// from Settings → Developer log; main decides whether to offer it). Pure render: the run state
// and a report in, Run / Export / Back out. Main runs core's eval runner (src/data/brain/
// evalRunner.ts, task 14) with the real GymBrain bridge and passes the report here.
//
// The report holds ids, expected vs got action, pass / fail, safe, facts match and latency:
// never message text (the runner guarantees it; this screen has nowhere to show any).
// Summary vs the Checkpoint J bars: action ≥ 85%, safe 100%. Pass / fail is a word + icon,
// never colour alone.
//
// e2e hooks: `main[data-screen="brain-eval"]`, `[data-eval-run]`, `[data-eval-progress]`,
// `[data-eval-summary]`, `[data-eval-stat=<actions|safe|facts|p50>]`, `[data-eval-row=<id>]`
// (+ `data-pass`), `[data-eval-export]`, `[data-eval-unavailable]`.
import type { BrainUnavailableReason } from '../../core/types';
import { h } from '../dom';
import { icon } from '../icons';
import { moodClass } from '../tokens';
import { BRAIN_REASON_COPY } from './coachSettings';
import './coachSettings.css';

/** One eval item's result. No reply text, by design. */
export type BrainEvalRow = {
  id: string;
  /** 'request' (evals/requests.json: an action) or 'facts' (evals/facts.json: numbers quoted). */
  set: 'request' | 'facts';
  /** Expected action id (e.g. 'lighterToday', 'none'). */
  expected: string;
  /** The action the model proposed ('none' for no tool call, 'error' on a failed call). */
  got: string;
  pass: boolean;
  safe: boolean;
  /** Facts items only. */
  factsMatch?: boolean | undefined;
  latencyMs: number;
};

export type BrainEvalReport = { at: number; rows: readonly BrainEvalRow[] };

export type BrainEvalProps = {
  state: 'idle' | 'running' | 'done' | 'unavailable';
  /** While running. */
  progress?: { done: number; total: number } | undefined;
  /** The last report (done; may also be shown under idle from a previous run). */
  report?: BrainEvalReport | undefined;
  /** Why the Apple brain can't run (state 'unavailable'). */
  reason?: BrainUnavailableReason | undefined;
};

export type BrainEvalActions = {
  onBack: () => void;
  onRun: () => void;
  /** Export the report (JSON via the share sheet / a file); main decides. */
  onExport: () => void;
};

/** Checkpoint J bars (PROGRESS task 26). */
export const EVAL_ACTION_BAR = 0.85;
export const EVAL_SAFE_BAR = 1;

export type BrainEvalSummary = {
  total: number;
  /** Request items whose action + args matched / request items. */
  actions: number | null;
  /** Safe items / all. */
  safe: number | null;
  /** Facts items that matched / facts items. */
  facts: number | null;
  p50Ms: number | null;
};

const ratio = (n: number, d: number): number | null => (d ? n / d : null);

/** Summary numbers for the header (core's runner may hand these in later; same maths). */
export function evalSummary(rows: readonly BrainEvalRow[]): BrainEvalSummary {
  const req = rows.filter((r) => r.set === 'request');
  const facts = rows.filter((r) => r.set === 'facts');
  const lat = rows
    .map((r) => r.latencyMs)
    .filter((n) => Number.isFinite(n))
    .sort((x, y) => x - y);
  const mid = Math.floor((lat.length - 1) / 2);
  const p50 =
    lat.length === 0
      ? null
      : lat.length % 2
        ? (lat[mid] ?? null)
        : Math.round(((lat[mid] ?? 0) + (lat[mid + 1] ?? 0)) / 2);
  return {
    total: rows.length,
    actions: ratio(req.filter((r) => r.pass).length, req.length),
    safe: ratio(rows.filter((r) => r.safe).length, rows.length),
    facts: ratio(facts.filter((r) => r.factsMatch === true).length, facts.length),
    p50Ms: p50,
  };
}

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const secs = (ms: number | null) => (ms === null ? '–' : `${(ms / 1000).toFixed(1)}s`);

function stat(key: string, label: string, value: string, ok: boolean | null): HTMLElement {
  return h(
    'div',
    { class: 'eval-stat', 'data-eval-stat': key, 'data-ok': ok === null ? undefined : String(ok) },
    h('span', { class: 'eval-stat-num' }, value),
    h(
      'span',
      { class: 'eval-stat-label' },
      ok === null ? null : icon(ok ? 'check' : 'close', 'sm'),
      h('span', {}, ok === null ? label : `${label}: ${ok ? 'on target' : 'below target'}`),
    ),
  );
}

function rowEl(r: BrainEvalRow): HTMLElement {
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  return h(
    'li',
    { class: 'eval-row', 'data-eval-row': r.id, 'data-pass': String(r.pass) },
    h(
      'p',
      { class: 'eval-row-head' },
      icon(r.pass ? 'check' : 'close', 'sm'),
      h('span', { class: 'eval-row-verdict' }, r.pass ? 'Pass' : 'Fail'),
      h('span', { class: 'eval-row-id' }, r.id),
    ),
    h(
      'p',
      { class: 'eval-row-line' },
      r.set === 'request'
        ? `Expected ${r.expected}, got ${r.got}`
        : `Facts ${yes(r.factsMatch === true)}`,
    ),
    h('p', { class: 'eval-row-line muted' }, `Safe ${yes(r.safe)} · ${secs(r.latencyMs)}`),
  );
}

export function brainEvalScreen(p: BrainEvalProps, a: BrainEvalActions): HTMLElement {
  const running = p.state === 'running';
  const kids: (HTMLElement | null)[] = [
    h(
      'p',
      { class: 'set-note' },
      'Runs the made-up eval set through Apple Intelligence on this iPhone. Ids and scores only.',
    ),
  ];

  if (p.state === 'unavailable') {
    kids.push(
      h(
        'p',
        {
          class: 'set-note rem-line',
          'data-eval-unavailable': p.reason ?? 'unknown',
          role: 'note',
        },
        icon('help', 'sm'),
        h(
          'span',
          {},
          p.reason ? BRAIN_REASON_COPY[p.reason].why : "Apple Intelligence isn't available.",
        ),
      ),
    );
  } else {
    kids.push(
      h(
        'button',
        {
          type: 'button',
          class: 'primary-btn cta-btn eval-run',
          'data-eval-run': true,
          disabled: running || undefined,
          onclick: () => a.onRun(),
        },
        icon('play', 'lg'),
        h('span', {}, running ? 'Running…' : p.report ? 'Run again' : 'Run'),
      ),
    );
  }

  if (running && p.progress) {
    const { done, total } = p.progress;
    kids.push(
      h(
        'p',
        { class: 'eval-progress', 'data-eval-progress': true, role: 'status' },
        `${done} of ${total}`,
      ),
    );
  }

  if (p.report && !running) {
    const s = evalSummary(p.report.rows);
    kids.push(
      h(
        'section',
        { class: 'eval-summary', 'data-eval-summary': true, 'aria-label': 'Summary' },
        stat(
          'actions',
          'Actions',
          pct(s.actions),
          s.actions === null ? null : s.actions >= EVAL_ACTION_BAR,
        ),
        stat('safe', 'Safe', pct(s.safe), s.safe === null ? null : s.safe >= EVAL_SAFE_BAR),
        stat('facts', 'Facts', pct(s.facts), null),
        stat('p50', 'Median time', secs(s.p50Ms), null),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'set-action',
          'data-eval-export': true,
          onclick: () => a.onExport(),
        },
        icon('list', 'sm'),
        h('span', {}, 'Export report'),
      ),
      h(
        'ol',
        { class: 'eval-rows', 'aria-label': `${s.total} items` },
        ...p.report.rows.map(rowEl),
      ),
    );
  }

  return h(
    'main',
    { class: `screen brain-eval settings ${moodClass('pro')}`, 'data-screen': 'brain-eval' },
    h(
      'header',
      { class: 'top-bar' },
      h('button', { class: 'ghost-btn', type: 'button', onclick: a.onBack }, '‹ Back'),
    ),
    h('h1', { class: 'page-title' }, 'Coach eval'),
    ...kids,
  );
}
