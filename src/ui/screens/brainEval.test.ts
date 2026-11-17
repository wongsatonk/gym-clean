import { describe, expect, it } from 'vitest';
import { brainEvalScreen, evalSummary, type BrainEvalProps, type BrainEvalRow } from './brainEval';
import { asFake, useFakeDom, type FakeEl } from './testDom';

useFakeDom();

// Made-up results: ids and scores only.
const ROWS: BrainEvalRow[] = [
  {
    id: 'req-01',
    set: 'request',
    expected: 'lighterToday',
    got: 'lighterToday',
    pass: true,
    safe: true,
    latencyMs: 900,
  },
  {
    id: 'req-02',
    set: 'request',
    expected: 'postponeSession',
    got: 'none',
    pass: false,
    safe: true,
    latencyMs: 1500,
  },
  {
    id: 'req-03',
    set: 'request',
    expected: 'swapExercise',
    got: 'swapExercise',
    pass: true,
    safe: true,
    latencyMs: 1100,
  },
  {
    id: 'facts-01',
    set: 'facts',
    expected: 'none',
    got: 'none',
    pass: true,
    safe: true,
    factsMatch: true,
    latencyMs: 700,
  },
];

function render(p: Partial<BrainEvalProps> = {}) {
  const log: string[] = [];
  const el = asFake(
    brainEvalScreen(
      { state: 'idle', ...p },
      {
        onBack: () => log.push('back'),
        onRun: () => log.push('run'),
        onExport: () => log.push('export'),
      },
    ),
  );
  return { el, log };
}
const at = (el: FakeEl, name: string, value?: string) =>
  el.find(
    (e) => e.hasAttribute(name) && (value === undefined || e.getAttribute(name) === value),
  )[0];

describe('evalSummary', () => {
  it('action rate over request items, safe over all, facts over facts items, p50', () => {
    const s = evalSummary(ROWS);
    expect(s.total).toBe(4);
    expect(s.actions).toBeCloseTo(2 / 3);
    expect(s.safe).toBe(1);
    expect(s.facts).toBe(1);
    expect(s.p50Ms).toBe(1000);
    expect(evalSummary(ROWS.slice(0, 3)).p50Ms).toBe(1100);
  });

  it('p50 skips red-flag rows (answered without the model: got none at 0 ms), like the runner', () => {
    const redFlag: BrainEvalRow = {
      id: 'req-09',
      set: 'request',
      expected: 'none',
      got: 'none',
      pass: true,
      safe: true,
      latencyMs: 0,
    };
    // Without the skip the median of [0, 0, 900, 1100, 1500] would be 900.
    const rows = [...ROWS.slice(0, 3), redFlag, { ...redFlag, id: 'req-10' }];
    expect(evalSummary(rows).p50Ms).toBe(1100);
    // A failed call (got 'error') is still counted, even at 0 ms (the runner counts it).
    expect(evalSummary([{ ...redFlag, got: 'error', pass: false }]).p50Ms).toBe(0);
    expect(evalSummary([redFlag]).p50Ms).toBeNull();
  });

  it('empty → nulls', () => {
    expect(evalSummary([])).toEqual({
      total: 0,
      actions: null,
      safe: null,
      facts: null,
      p50Ms: null,
    });
  });
});

describe('brainEvalScreen', () => {
  it('idle: Run; Back works', () => {
    const { el, log } = render();
    expect(el.getAttribute('data-screen')).toBe('brain-eval');
    at(el, 'data-eval-run')?.click();
    el.byTag('button')[0]?.click();
    expect(log).toEqual(['run', 'back']);
    expect(at(el, 'data-eval-summary')).toBeUndefined();
  });

  it('running: Run disabled ("Running…") and the progress', () => {
    const { el } = render({ state: 'running', progress: { done: 7, total: 32 } });
    expect(at(el, 'data-eval-run')?.hasAttribute('disabled')).toBe(true);
    expect(at(el, 'data-eval-run')?.textContent).toBe('Running…');
    expect(at(el, 'data-eval-progress')?.textContent).toBe('7 of 32');
  });

  it('done: summary vs the bars in words, Export, one row per item with pass / fail in words', () => {
    const { el, log } = render({ state: 'done', report: { at: 1, rows: ROWS } });
    expect(at(el, 'data-eval-run')?.textContent).toBe('Run again');
    const actions = at(el, 'data-eval-stat', 'actions');
    expect(actions?.textContent).toBe('67%Actions: below target');
    expect(actions?.getAttribute('data-ok')).toBe('false');
    expect(at(el, 'data-eval-stat', 'safe')?.textContent).toBe('100%Safe: on target');
    expect(at(el, 'data-eval-stat', 'facts')?.textContent).toBe('100%Facts');
    expect(at(el, 'data-eval-stat', 'p50')?.textContent).toBe('1.0sMedian time');
    const rows = el.find((e) => e.hasAttribute('data-eval-row'));
    expect(rows.map((r) => r.getAttribute('data-eval-row'))).toEqual(ROWS.map((r) => r.id));
    expect(rows[1]?.textContent).toBe(
      'Failreq-02Expected postponeSession, got noneSafe yes · 1.5s',
    );
    expect(rows[3]?.textContent).toBe('Passfacts-01Facts yesSafe yes · 0.7s');
    // The runner's own p50 wins when the report carries it; null shows a dash.
    const withP50 = render({ state: 'done', report: { at: 1, rows: ROWS, p50Ms: 2400 } });
    expect(at(withP50.el, 'data-eval-stat', 'p50')?.textContent).toBe('2.4sMedian time');
    const noneAsked = render({ state: 'done', report: { at: 1, rows: ROWS, p50Ms: null } });
    expect(at(noneAsked.el, 'data-eval-stat', 'p50')?.textContent).toBe('–Median time');
    at(el, 'data-eval-export')?.click();
    expect(log).toEqual(['export']);
  });

  it('unavailable: the plain reason, no Run', () => {
    const { el } = render({ state: 'unavailable', reason: 'appleIntelligenceNotEnabled' });
    expect(at(el, 'data-eval-run')).toBeUndefined();
    expect(at(el, 'data-eval-unavailable')?.textContent).toBe('Apple Intelligence is off.');
  });
});
