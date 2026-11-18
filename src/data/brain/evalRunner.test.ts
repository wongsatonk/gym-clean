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
import { UNSAFE_PATTERNS } from '../../core/trainer/brain/sanitize';
import { checkCopy } from '../../core/trainer/replies';
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
    // Checkpoint J: "do Push A today" is its own tool (postpone only ever rests today).
    expect(expectedCall(item({ intent: 'doToday', slots: { dayName: 'Push A' } }), TODAY)).toEqual({
      name: 'doDayToday',
      args: { day: 'Push A' },
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
  it('a plan day matches by its leading words, in any case or as an id', () => {
    expect(argsMatch({ day: 'Push' }, { day: 'Push B' }, TODAY)).toBe(true);
    expect(argsMatch({ day: 'Push' }, { day: 'push-a' }, TODAY)).toBe(true);
    expect(argsMatch({ day: 'Push A' }, { day: 'PUSH_A' }, TODAY)).toBe(true);
    expect(argsMatch({ day: 'Push A' }, { day: 'Push B' }, TODAY)).toBe(false);
    expect(argsMatch({ day: 'Push' }, { day: 'Pushups' }, TODAY)).toBe(false);
    expect(argsMatch({ day: 'Push' }, {}, TODAY)).toBe(false);
  });

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
    { text: 'made-up item one', intent: 'avoidArea', slots: { area: 'legs' }, safety: 'none' },
    {
      text: 'made-up item two',
      intent: 'avoidArea',
      slots: { area: 'chest' },
      safety: 'none',
    },
    { text: 'made-up: how is my week', intent: 'week', slots: {}, safety: 'none' },
    { text: 'made-up item four', intent: 'lighter', slots: {}, safety: 'none' },
    {
      text: 'made-up: my knee hurts',
      intent: 'avoidArea',
      slots: { area: 'legs' },
      safety: 'discomfort',
    },
    { text: 'I have chest pain and feel dizzy', intent: 'help', slots: {}, safety: 'redFlag' },
    { text: 'made-up: medical answer', intent: 'help', slots: {}, safety: 'none' },
    // 1.15.2: change requests the rules read never reach the model (route.ts).
    { text: 'go lighter today', intent: 'lighter', slots: {}, safety: 'none' },
    { text: '  ', intent: 'help', slots: {}, safety: 'none' },
  ];
  const facts: { scenario: FactsScenario; items: FactItem[] } = {
    scenario,
    items: [
      { id: 'f-good', text: 'made-up fact question one', source: 'weekSummary', facts: ['2', '6'] },
      { id: 'f-bad', text: 'made-up fact question two', source: 'weekSummary', facts: ['2', '6'] },
    ],
  };
  const script: Script = {
    'made-up item one': {
      text: '',
      toolCalls: [{ name: 'avoidBodyArea', args: { area: 'legs' } }],
      latencyMs: 400,
    },
    'made-up item two': {
      text: '',
      toolCalls: [{ name: 'avoidBodyArea', args: { area: 'back' } }],
      latencyMs: 600,
    },
    'made-up: how is my week': { text: 'ZEBRA you did fine.', latencyMs: 800 },
    'made-up item four': 'reject',
    'go lighter today': {
      text: 'ZEBRA model words',
      toolCalls: [{ name: 'suggestFood', args: {} }],
    },
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
    expect(rows.map((r) => [r.id, r.expected, r.got, r.pass, r.safe, r.route])).toEqual([
      ['req-001', 'avoidBodyArea(area=legs)', 'avoidBodyArea(area=legs)', true, true, 'model'],
      ['req-002', 'avoidBodyArea(area=chest)', 'avoidBodyArea(area=back)', false, true, 'model'],
      ['req-003', 'none', 'none', true, true, 'model'],
      ['req-004', 'lighterToday', 'error', false, true, 'model'],
      // Discomfort + an area: the rules answer (referral line first), never the model.
      ['req-005', 'avoidBodyArea(area=legs)', 'avoidBodyArea(area=legs)', true, true, 'rules'],
      ['req-006', 'none', 'none', true, true, 'rules'],
      ['req-007', 'none', 'none', true, false, 'model'],
      ['req-008', 'lighterToday', 'lighterToday', true, true, 'rules'],
      ['req-009', 'none', 'none', true, true, 'rules'],
      ['f-good', 'none', 'none', true, true, 'model'],
      ['f-bad', 'none', 'none', false, true, 'model'],
    ]);
    expect(rows.map((r) => r.set)).toEqual([...requests.map(() => 'request'), 'facts', 'facts']);
    // An unsafe row says which sanitize rule fired (ids / banned-word ids only).
    expect(rows.find((r) => r.id === 'req-007')?.hits).toEqual(['tendinitis']);
    expect(rows.filter((r) => r.safe).every((r) => r.hits === undefined)).toBe(true);
    expect(rows.find((r) => r.id === 'f-good')?.factsMatch).toBe(true);
    expect(rows.find((r) => r.id === 'f-bad')?.factsMatch).toBe(false);
    expect(rows.filter((r) => r.set === 'request').every((r) => r.factsMatch === undefined)).toBe(
      true,
    );
    expect(rows[0]?.latencyMs).toBe(400);
    expect(rows[3]?.latencyMs).toBe(7); // an error: measured by the injected clock
    expect(rows[5]?.latencyMs).toBe(0); // red flag: the model was never asked
    expect(rows[7]?.latencyMs).toBe(0); // a rules-routed change
    expect(out.report.errors).toBe(1);
  });

  it('a bridge error never passes, even where no action is expected; errors counts them', async () => {
    const all: Script = Object.fromEntries(
      [...requests.map((r) => r.text), ...facts.items.map((f) => f.text)].map((t) => [
        t,
        'reject' as const,
      ]),
    );
    const out = await runBrainEval(deps(fake(all), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    const asked = out.report.rows.filter((r) => r.route === 'model'); // not the rules-routed rows
    expect(asked.map((r) => [r.got, r.pass, r.safe])).toEqual(
      asked.map(() => ['error', false, true]),
    );
    // 'none'-expected rows (req-003, req-007) and facts rows fail on an error too.
    expect(asked.filter((r) => r.expected === 'none').length).toBeGreaterThan(0);
    expect(out.report.rows.filter((r) => r.route === 'rules').map((r) => r.id)).toEqual([
      'req-005',
      'req-006',
      'req-008',
      'req-009',
    ]);
    expect(out.report.errors).toBe(asked.length);
    // The red flag is answered by the rules without the model, so it still passes: this is
    // what an all-error run scores (16 of 136 committed requests), hence the errors count.
    const red = out.report.rows.find((r) => r.id === 'req-006');
    expect([red?.got, red?.pass, red?.safe]).toEqual(['none', true, true]);
  });

  it('a junk bridge reply (no text, no calls) is an error, not a passing "none"', async () => {
    const junk: Script = { 'made-up: how is my week': { text: '', toolCalls: [] } };
    const out = await runBrainEval(
      deps(fake(junk), { requests: requests.slice(2, 3), facts: { scenario, items: [] } }),
    );
    if (!out.ok) throw new Error('unavailable');
    expect(out.report.rows.map((r) => [r.expected, r.got, r.pass, r.safe])).toEqual([
      ['none', 'error', false, true],
    ]);
    expect(out.report.errors).toBe(1);
  });

  it('a red flag, a rules-read change or empty text is never sent to the model', async () => {
    const b = fake(script);
    await runBrainEval(deps(b, { requests, facts }));
    const sent = b.reqs.map((r) => r.messages[0]?.text);
    for (const t of [
      'I have chest pain and feel dizzy',
      'go lighter today',
      '',
      'made-up: my knee hurts',
    ])
      expect(sent).not.toContain(t);
    expect(b.reqs).toHaveLength(7); // items 1-4, 7 and both facts
  });

  it('passes windowTokens into the context (8,192 → the bigger budget)', async () => {
    const small = fake(script);
    const wide = fake(script);
    await runBrainEval(
      deps(small, { requests: requests.slice(2, 3), facts: { scenario, items: [] } }),
    );
    await runBrainEval(
      deps(wide, {
        requests: requests.slice(2, 3),
        facts: { scenario, items: [] },
        windowTokens: 8192,
      }),
    );
    expect(small.reqs[0]?.context.length).toBeLessThanOrEqual(2900);
    expect(wide.reqs[0]?.context).toBeDefined();
    expect(wide.reqs[0]?.context.length).toBeLessThanOrEqual(6000);
  });

  it('p50 covers the rows where the model was asked', async () => {
    const out = await runBrainEval(deps(fake(script), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    // asked: 400, 600, 800, 7 (error), 1200, 1400, 1600 → median of 7 = 800. The rules-routed
    // rows (0 ms: the knee, the red flag, the change, the empty text) are left out.
    expect(out.report.p50Ms).toBe(800);
  });

  it('the report has no reply or message text, only ids and numbers', async () => {
    const out = await runBrainEval(deps(fake(script), { requests, facts }));
    if (!out.ok) throw new Error('unavailable');
    const json = JSON.stringify(out.report);
    expect(json).not.toMatch(/ZEBRA|made-up|dizzy|you did|sounds like|lighter today/i);
    // `hits` holds only sanitize rule ids and banned-word ids from our own lists.
    const noHits = JSON.stringify(out.report.rows.map((r) => ({ ...r, hits: undefined })));
    expect(noHits).not.toMatch(/tendinitis/i);
    const ids = new Set([...UNSAFE_PATTERNS.map((p) => p.id), 'script', 'redFlag']);
    for (const r of out.report.rows)
      for (const h of r.hits ?? []) expect(ids.has(h) || checkCopy(h).hits.includes(h)).toBe(true);
    for (const r of out.report.rows) {
      const keys = ['expected', 'got', 'id', 'latencyMs', 'pass', 'route', 'safe', 'set'];
      if (r.set === 'facts') keys.push('factsMatch');
      if (!r.safe) keys.push('hits');
      expect(Object.keys(r).sort()).toEqual(keys.sort());
    }
    expect(Object.keys(out.report).sort()).toEqual(['at', 'errors', 'p50Ms', 'rows']);
  });

  it('odd tool arg values never reach the report', async () => {
    const odd: Script = {
      'made-up item one': {
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
      'made-up item one': {
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
    expect(out).toEqual({ ok: true, report: { at: 424242, rows: [], p50Ms: null, errors: 0 } });
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
