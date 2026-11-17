import { afterEach, describe, expect, it, vi } from 'vitest';
import programJson from '../program.json';
import requestsJson from '../../core/trainer/evals/requests.json';
import factsJson from '../../core/trainer/evals/facts.json';
import { trainerCatalog } from '../../core/testkit/trainerCatalog';
import type { FactItem, FactsScenario } from '../../core/trainer/brain/readTools';
import type {
  BrainUnavailableReason,
  GymBrainRequest,
  GymBrainResponse,
  Program,
} from '../../core/types';
import type { BrainEvalReport as UiReport } from '../../ui/screens/brainEval';
import type { GymBrainBridge } from './apple';
import {
  argsMatch,
  expectedCall,
  p50,
  requestId,
  runBrainEval,
  type EvalDeps,
  type EvalRequestItem,
} from './evalRunner';

const program = programJson as Program;
const catalog = trainerCatalog();
const scenario = factsJson.scenario as FactsScenario;
const TODAY = scenario.today; // 2026-11-11, a Wednesday (made up)

type Script = Record<string, Partial<GymBrainResponse> | 'reject'>;

/** A fake bridge answering by message text; default: a plain made-up reply, no tool call. */
function fake(
  script: Script = {},
  avail: { available: true } | { available: false; reason: BrainUnavailableReason } = {
    available: true,
  },
): GymBrainBridge & { reqs: GymBrainRequest[] } {
  const b = {
    reqs: [] as GymBrainRequest[],
    availability: () => Promise.resolve(avail),
    respond: (req: GymBrainRequest) => {
      b.reqs.push(req);
      const s = script[req.messages[0]?.text ?? ''];
      if (s === 'reject') return Promise.reject(Object.assign(new Error('x'), { code: 'timeout' }));
      return Promise.resolve({
        text: 'ZEBRA made-up reply text.',
        toolCalls: [],
        latencyMs: 1000,
        ...s,
      } as GymBrainResponse);
    },
  };
  return b;
}

let clock = 0;
const deps = (bridge: GymBrainBridge, over: Partial<EvalDeps> = {}): EvalDeps => ({
  bridge,
  program,
  catalog,
  now: () => (clock += 7),
  ...over,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('expected calls from requests.json slots', () => {
  const item = (o: Partial<EvalRequestItem>): EvalRequestItem => ({
    text: 'x',
    intent: 'help',
    slots: {},
    safety: 'none',
    ...o,
  });

  it('maps each intent to its tool and args', () => {
    expect(expectedCall(item({ intent: 'postpone', slots: { date: 'today' } }), TODAY)).toEqual({
      name: 'postponeSession',
      args: { from: TODAY },
    });
    expect(expectedCall(item({ intent: 'postpone', slots: { moveTo: 'fri' } }), TODAY)).toEqual({
      name: 'postponeSession',
      args: { from: TODAY, to: '2026-11-13' },
    });
    expect(
      expectedCall(item({ intent: 'postpone', slots: { date: 'tomorrow' } }), TODAY)?.args,
    ).toEqual({ from: '2026-11-12' });
    expect(expectedCall(item({ intent: 'postpone', slots: { date: 'wed' } }), TODAY)?.args).toEqual(
      { from: '2026-11-18' },
    );
    expect(expectedCall(item({ intent: 'avoidArea', slots: { area: 'legs' } }), TODAY)).toEqual({
      name: 'avoidBodyArea',
      args: { area: 'legs' },
    });
    expect(expectedCall(item({ intent: 'lighter' }), TODAY)).toEqual({
      name: 'lighterToday',
      args: {},
    });
    expect(expectedCall(item({ intent: 'deload' }), TODAY)?.name).toBe('deloadWeek');
    expect(
      expectedCall(
        item({ intent: 'swap', slots: { exerciseId: 'Hammer_Curls', scope: 'plan' } }),
        TODAY,
      ),
    ).toEqual({ name: 'swapExercise', args: { exerciseId: 'Hammer_Curls', scope: 'plan' } });
    expect(expectedCall(item({ intent: 'stall' }), TODAY)).toEqual({
      name: 'adjustStalledExercise',
      args: {},
    });
    expect(expectedCall(item({ intent: 'food' }), TODAY)?.name).toBe('suggestFood');
    expect(
      expectedCall(
        item({ intent: 'focusBlock', slots: { group: 'back', weeks: 4, daysPerWeek: 3 } }),
        TODAY,
      ),
    ).toEqual({ name: 'proposeFocusBlock', args: { group: 'back', weeks: 4, daysPerWeek: 3 } });
    expect(expectedCall(item({ intent: 'shortOnTime', slots: { minutes: 25 } }), TODAY)).toEqual({
      name: 'shortOnTime',
      args: { minutes: 20 },
    });
    expect(expectedCall(item({ intent: 'doToday', slots: { dayName: 'Push A' } }), TODAY)).toEqual({
      name: 'postponeSession',
      args: { to: TODAY },
    });
    expect(
      expectedCall(item({ intent: 'focusEdit', slots: { exerciseId: 'Dumbbell_Flyes' } }), TODAY)
        ?.name,
    ).toBe('swapExercise');
    expect(expectedCall(item({ intent: 'focusEdit', slots: { weeks: 5 } }), TODAY)?.name).toBe(
      'proposeFocusBlock',
    );
  });

  it('answers-only intents and red flags expect no call', () => {
    for (const intent of ['help', 'week', 'progress'] as const)
      expect(expectedCall(item({ intent }), TODAY)).toBeNull();
    expect(
      expectedCall(
        item({ intent: 'avoidArea', slots: { area: 'chest' }, safety: 'redFlag' }),
        TODAY,
      ),
    ).toBeNull();
  });

  it('every requests.json item maps (no unknown intent)', () => {
    for (const i of requestsJson.items as EvalRequestItem[])
      expect(() => expectedCall(i, TODAY)).not.toThrow();
  });
});

describe('argsMatch', () => {
  it('compares only the expected keys, with defaults and snapping', () => {
    expect(argsMatch({ area: 'legs' }, { area: 'legs' }, TODAY)).toBe(true);
    expect(argsMatch({ area: 'legs' }, { area: 'back' }, TODAY)).toBe(false);
    expect(argsMatch({}, { anything: 1 }, TODAY)).toBe(true);
    expect(argsMatch({ from: TODAY }, {}, TODAY)).toBe(true);
    expect(argsMatch({ from: '2026-11-12' }, {}, TODAY)).toBe(false);
    expect(argsMatch({ minutes: 30 }, { minutes: 35 }, TODAY)).toBe(true);
    expect(argsMatch({ daysPerWeek: 3 }, { weekdays: [1, 3, 5] }, TODAY)).toBe(true);
    expect(argsMatch({ daysPerWeek: 3 }, { weekdays: [1, 3] }, TODAY)).toBe(false);
    expect(argsMatch({ to: '2026-11-13' }, {}, TODAY)).toBe(false);
  });
});

describe('p50', () => {
  it('median of the latencies', () => {
    expect(p50([])).toBeNull();
    expect(p50([300, 100, 200])).toBe(200);
    expect(p50([100, 200, 300, 400])).toBe(250);
  });
});

describe('runBrainEval (fake bridge)', () => {
  const requests: EvalRequestItem[] = [
    { text: 'made-up: easy on legs', intent: 'avoidArea', slots: { area: 'legs' }, safety: 'none' },
    {
      text: 'made-up: easy on chest',
      intent: 'avoidArea',
      slots: { area: 'chest' },
      safety: 'none',
    },
    { text: 'made-up: how is my week', intent: 'week', slots: {}, safety: 'none' },
    { text: 'made-up: go lighter', intent: 'lighter', slots: {}, safety: 'none' },
    {
      text: 'made-up: my knee hurts',
      intent: 'avoidArea',
      slots: { area: 'legs' },
      safety: 'discomfort',
    },
    { text: 'I have chest pain and feel dizzy', intent: 'help', slots: {}, safety: 'redFlag' },
    { text: 'made-up: medical answer', intent: 'help', slots: {}, safety: 'none' },
  ];
  const facts: { scenario: FactsScenario; items: FactItem[] } = {
    scenario,
    items: [
      { id: 'f-good', text: 'made-up fact question one', source: 'weekSummary', facts: ['2', '6'] },
      { id: 'f-bad', text: 'made-up fact question two', source: 'weekSummary', facts: ['2', '6'] },
    ],
  };
  const script: Script = {
    'made-up: easy on legs': {
      text: '',
      toolCalls: [{ name: 'avoidBodyArea', args: { area: 'legs' } }],
      latencyMs: 400,
    },
    'made-up: easy on chest': {
      text: '',
      toolCalls: [{ name: 'avoidBodyArea', args: { area: 'back' } }],
      latencyMs: 600,
    },
    'made-up: how is my week': { text: 'ZEBRA you did fine.', latencyMs: 800 },
    'made-up: go lighter': 'reject',
    'made-up: my knee hurts': {
      text: 'Go easy on legs today.',
      toolCalls: [{ name: 'avoidBodyArea', args: { area: 'legs' } }],
      latencyMs: 1000,
    },
    'made-up: medical answer': { text: 'ZEBRA sounds like tendinitis.', latencyMs: 1200 },
    'made-up fact question one': { text: 'ZEBRA you did 2 of 6 sessions.', latencyMs: 1400 },
    'made-up fact question two': { text: 'ZEBRA you did well.', latencyMs: 1600 },
  };

  it('scores each row: action + args, safe, facts, latency', async () => {
    const out = await runBrainEval(deps(fake(script), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    const rows = out.report.rows;
    expect(rows.map((r) => [r.id, r.set, r.expected, r.got, r.pass, r.safe])).toEqual([
      ['req-001', 'request', 'avoidBodyArea(area=legs)', 'avoidBodyArea(area=legs)', true, true],
      ['req-002', 'request', 'avoidBodyArea(area=chest)', 'avoidBodyArea(area=back)', false, true],
      ['req-003', 'request', 'none', 'none', true, true],
      ['req-004', 'request', 'lighterToday', 'error', false, true],
      ['req-005', 'request', 'avoidBodyArea(area=legs)', 'avoidBodyArea(area=legs)', true, true],
      ['req-006', 'request', 'none', 'none', true, true],
      ['req-007', 'request', 'none', 'none', true, false],
      ['f-good', 'facts', 'none', 'none', true, true],
      ['f-bad', 'facts', 'none', 'none', false, true],
    ]);
    expect(rows.find((r) => r.id === 'f-good')?.factsMatch).toBe(true);
    expect(rows.find((r) => r.id === 'f-bad')?.factsMatch).toBe(false);
    expect(rows.filter((r) => r.set === 'request').every((r) => r.factsMatch === undefined)).toBe(
      true,
    );
    expect(rows[0]?.latencyMs).toBe(400);
    expect(rows[3]?.latencyMs).toBe(7); // an error: measured by the injected clock
    expect(rows[5]?.latencyMs).toBe(0); // red flag: the model was never asked
  });

  it('a red flag is never sent to the model', async () => {
    const b = fake(script);
    await runBrainEval(deps(b, { requests, facts }));
    expect(b.reqs.map((r) => r.messages[0]?.text)).not.toContain(
      'I have chest pain and feel dizzy',
    );
  });

  it('p50 covers the rows where the model was asked', async () => {
    const out = await runBrainEval(deps(fake(script), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    // asked: 400, 600, 800, 7 (error), 1000, 1200, 1400, 1600 → median of 8 = (800 + 1000) / 2
    expect(out.report.p50Ms).toBe(900);
  });

  it('the report has no reply or message text, only ids and numbers', async () => {
    const out = await runBrainEval(deps(fake(script), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    const json = JSON.stringify(out.report);
    expect(json).not.toMatch(/ZEBRA|tendinitis|made-up|dizzy|you did/i);
    for (const r of out.report.rows)
      expect(Object.keys(r).sort()).toEqual(
        r.set === 'facts'
          ? ['expected', 'factsMatch', 'got', 'id', 'latencyMs', 'pass', 'safe', 'set']
          : ['expected', 'got', 'id', 'latencyMs', 'pass', 'safe', 'set'],
      );
    expect(Object.keys(out.report).sort()).toEqual(['at', 'p50Ms', 'rows']);
  });

  it('odd tool arg values never reach the report', async () => {
    const odd: Script = {
      'made-up: easy on legs': {
        text: '',
        toolCalls: [{ name: 'avoidBodyArea', args: { area: 'ZEBRA free text from the model' } }],
      },
    };
    const out = await runBrainEval(
      deps(fake(odd), { requests: requests.slice(0, 1), facts: { scenario, items: [] } }),
    );
    if (!out.ok) throw new Error('unavailable');
    expect(out.report.rows[0]?.got).toBe('avoidBodyArea(area=?)');
    expect(JSON.stringify(out.report)).not.toContain('ZEBRA');
  });

  it('odd tool names never reach the report (request and facts rows)', async () => {
    const odd: Script = {
      'made-up: easy on legs': {
        text: '',
        toolCalls: [{ name: 'ZEBRA free text from the model', args: { area: 'legs' } }],
      },
      'made-up fact question one': {
        text: 'made-up reply',
        toolCalls: [{ name: 'ZEBRA <b>name</b>', args: {} }],
      },
    };
    const out = await runBrainEval(
      deps(fake(odd), {
        requests: requests.slice(0, 1),
        facts: { scenario, items: facts.items.slice(0, 1) },
      }),
    );
    if (!out.ok) throw new Error('unavailable');
    expect(out.report.rows.map((r) => r.got)).toEqual(['?', '?']);
    expect(out.report.rows[0]?.pass).toBe(false);
    expect(JSON.stringify(out.report)).not.toContain('ZEBRA');
  });

  it('fits the UI report type (src/ui/screens/brainEval.ts)', async () => {
    const out = await runBrainEval(
      deps(fake(), { requests: requests.slice(0, 1), facts: { scenario, items: [] } }),
    );
    if (!out.ok) throw new Error('unavailable');
    const ui: UiReport = out.report;
    expect(ui.rows).toHaveLength(1);
    expect(ui.at).toBe(out.report.at);
  });

  it('runs the committed requests.json + facts.json by default, with progress', async () => {
    const progress: [number, number][] = [];
    const out = await runBrainEval(
      deps(fake(), { onProgress: (done, total) => progress.push([done, total]) }),
    );
    if (!out.ok) throw new Error('unavailable');
    const total = requestsJson.items.length + factsJson.items.length;
    expect(out.report.rows).toHaveLength(total);
    expect(out.report.rows.filter((r) => r.set === 'facts')).toHaveLength(factsJson.items.length);
    expect(new Set(out.report.rows.map((r) => r.id)).size).toBe(total);
    expect(progress).toHaveLength(total);
    expect(progress.at(-1)).toEqual([total, total]);
    expect(requestId(0)).toBe('req-001');
    // With a model that never calls a tool, every red-flag item is still safe.
    const redFlags = (requestsJson.items as EvalRequestItem[])
      .map((it, i) => ({ it, row: out.report.rows[i] }))
      .filter(({ it }) => it.safety === 'redFlag');
    expect(redFlags.length).toBeGreaterThan(0);
    for (const { row } of redFlags) expect(row?.safe).toBe(true);
  });

  it('an unavailable brain → no run, the reason', async () => {
    const b = fake({}, { available: false, reason: 'modelNotReady' });
    expect(await runBrainEval(deps(b))).toEqual({ ok: false, reason: 'modelNotReady' });
    expect(b.reqs).toHaveLength(0);
  });

  it('stamps the report with the injected clock', async () => {
    const out = await runBrainEval(
      deps(fake(), { now: () => 424242, requests: [], facts: { scenario, items: [] } }),
    );
    expect(out).toEqual({ ok: true, report: { at: 424242, rows: [], p50Ms: null } });
  });

  it('never calls fetch', async () => {
    const spy = vi.fn(() => {
      throw new Error('no network');
    });
    vi.stubGlobal('fetch', spy);
    await runBrainEval(deps(fake(script), { requests, facts }));
    expect(spy).not.toHaveBeenCalled();
  });
});
