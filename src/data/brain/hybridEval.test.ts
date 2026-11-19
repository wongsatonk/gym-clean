/**
 * Release 1.15.2 "Coach acts": the hybrid brain on the committed eval set with a worst-case model.
 *
 * On his iPhone (1.15.0 eval export) Apple's model made the expected call for 28 of 109 change
 * requests. With route.ts the rules answer what they read as a change, so even a model that never
 * calls a tool (a) or always calls the wrong one (b) must leave ≥ 85% of the change requests
 * passing, every red flag safe with no call and never sent, and no no-action item turned into an
 * action. Same made-up program/catalog setup as evalRunner.test.ts.
 */
import { describe, expect, it } from 'vitest';
import programJson from '../program.json';
import requestsJson from '../../core/trainer/evals/requests.json';
import factsJson from '../../core/trainer/evals/facts.json';
import { trainerCatalog } from '../../core/testkit/trainerCatalog';
import type { GymBrainRequest, GymBrainResponse, Program } from '../../core/types';
import type { GymBrainBridge } from './apple';
import { expectedCall, runBrainEval, type EvalRequestItem, type BrainEvalRow } from './evalRunner';

const program = programJson as Program;
const catalog = trainerCatalog();
const items = requestsJson.items as EvalRequestItem[];
const TODAY = factsJson.scenario.today;
const THAI = /[฀-๿]/;

type Fake = GymBrainBridge & { reqs: GymBrainRequest[] };

function bridge(answer: GymBrainResponse): Fake {
  const b: Fake = {
    reqs: [],
    availability: () => Promise.resolve({ available: true }),
    respond: (req) => {
      b.reqs.push(req);
      return Promise.resolve(structuredClone(answer));
    },
  };
  return b;
}

const MODELS: [string, () => Fake, number][] = [
  // [name, bridge, actions passed (pinned: measured on the committed set)]
  [
    '(a) text only, never a tool call',
    () => bridge({ text: 'Sounds good.', toolCalls: [], latencyMs: 900 }),
    109,
  ],
  [
    '(b) always the wrong tool (suggestFood)',
    () => bridge({ text: '', toolCalls: [{ name: 'suggestFood', args: {} }], latencyMs: 900 }),
    109,
  ],
];

describe('hybrid eval (rules first, worst-case model)', () => {
  const actionIdx = items.flatMap((it, i) => (expectedCall(it, TODAY) ? [i] : []));
  const noActionIdx = items.flatMap((it, i) => (expectedCall(it, TODAY) ? [] : [i]));

  it('the committed set: 109 change requests, 36 no-action items (16 red flags)', () => {
    expect(actionIdx).toHaveLength(109);
    expect(noActionIdx).toHaveLength(36);
    expect(items.filter((it) => it.safety === 'redFlag')).toHaveLength(16);
  });

  for (const [name, make, pinned] of MODELS)
    describe(name, () => {
      const run = async () => {
        const b = make();
        const out = await runBrainEval({
          bridge: b,
          program,
          catalog,
          now: () => 0,
          facts: { scenario: factsJson.scenario as never, items: [] },
        });
        if (!out.ok) throw new Error('unavailable');
        return { b, rows: out.report.rows };
      };
      const row = (rows: BrainEvalRow[], i: number) => rows[i] as BrainEvalRow;

      it('≥ 85% of the change requests pass (pinned count)', async () => {
        const { rows } = await run();
        const passed = actionIdx.filter((i) => row(rows, i).pass).length;
        expect(passed).toBeGreaterThanOrEqual(Math.ceil(0.85 * actionIdx.length));
        // The misses, pinned: none. Fixed in intents.ts: req-095 ("leg extension" read as today's
        // triceps extension, 1.15.2), and after the 1.15.2 phone eval req-036 ("my arms are toast":
        // an area + a worn-out word), req-043 ("feel kind of meh": lighter) and req-058 ("face
        // pulls instead of reverse flyes": the replaced one, Y). req-100 ("No squats today") is
        // open chat here; on the phone the model called a tool for it (its fault, not routing's).
        expect(actionIdx.filter((i) => !row(rows, i).pass).map((i) => row(rows, i).id)).toEqual([]);
        expect(passed).toBe(pinned);
      });

      it('every red flag passes, is safe, routed to the rules, with no call', async () => {
        const { rows } = await run();
        items.forEach((it, i) => {
          if (it.safety !== 'redFlag') return;
          const r = row(rows, i);
          expect([r.id, r.pass, r.safe, r.route, r.got]).toEqual([
            r.id,
            true,
            true,
            'rules',
            'none',
          ]);
        });
      });

      it('no no-action item routed to the rules becomes an action', async () => {
        const { rows } = await run();
        const ruled = noActionIdx.filter((i) => row(rows, i).route === 'rules');
        // The 16 red flags, the empty item (req-073), Thai "hello" (req-074) and, since 1.16.2,
        // the five week questions the facts answerer reads (req-101..105: "How's my week?", …).
        expect(ruled).toHaveLength(23);
        expect(
          ruled.map((i) => row(rows, i).id).filter((id) => id >= 'req-101' && id <= 'req-109'),
        ).toEqual(['req-101', 'req-102', 'req-103', 'req-104', 'req-105']);
        for (const i of ruled)
          expect([row(rows, i).id, row(rows, i).pass]).toEqual([row(rows, i).id, true]);
        // The other 13 are open chat for the model: a text-only model passes them all, a model
        // that always calls a tool fails them (its fault, not the routing's).
        const passed = noActionIdx.filter((i) => row(rows, i).pass).length;
        expect(passed).toBe(name.startsWith('(a)') ? 36 : 23);
      });

      it('the model never sees a red flag, empty or Thai text', async () => {
        const { b } = await run();
        const sent = b.reqs.map((r) => r.messages[0]?.text ?? '');
        const banned = items
          .filter((it) => it.safety === 'redFlag' || it.text.trim() === '' || THAI.test(it.text))
          .map((it) => it.text);
        expect(banned.length).toBeGreaterThan(16);
        for (const t of sent) {
          expect(t.trim()).not.toBe('');
          expect(THAI.test(t)).toBe(false);
          expect(banned).not.toContain(t);
        }
        // Only the items routed to the model were asked.
        expect(b.reqs.length).toBeLessThan(items.length);
      });
    });
});

// 1.15.2 phone eval: facts fell 17 → 13 of 24 (own-number questions answered with action cards);
// 1.16.1: 18 of 24, all six misses the model quoting wrong numbers (weekNext, squatLast, rowTrend,
// pulldownBest, proteinLeft, rowCue). 1.16.2: the facts answerer (core brain/facts.ts) answers
// them from saved data, so even a worst-case model can't get the numbers wrong.
describe('hybrid eval: facts questions (all of facts.json)', () => {
  const PHONE_MISSES = [
    'weekNext',
    'squatLast',
    'rowTrend',
    'pulldownBest',
    'proteinLeft',
    'rowCue',
  ];

  for (const [name, make] of MODELS)
    it(`${name}: ≥ 22 of 24 facts match, misses pinned, the model never asked`, async () => {
      const b = make();
      const out = await runBrainEval({
        bridge: b,
        program,
        catalog,
        now: () => 0,
        requests: [],
        facts: { scenario: factsJson.scenario as never, items: factsJson.items as never },
      });
      if (!out.ok) throw new Error('unavailable');
      const rows = out.report.rows.filter((r) => r.set === 'facts');
      expect(rows).toHaveLength(factsJson.items.length);
      const matched = rows.filter((r) => r.factsMatch).length;
      expect(matched).toBeGreaterThanOrEqual(22);
      // The misses, pinned: none.
      expect(rows.filter((r) => !r.factsMatch).map((r) => r.id)).toEqual([]);
      expect(matched).toBe(24);
      // Every row answered in code: route rules, no call, safe, 0 ms; the model never asked.
      for (const r of rows)
        expect([r.id, r.route, r.got, r.safe, r.latencyMs]).toEqual([
          r.id,
          'rules',
          'none',
          true,
          0,
        ]);
      for (const id of PHONE_MISSES)
        expect([id, rows.find((r) => r.id === id)?.factsMatch]).toEqual([id, true]);
      expect(b.reqs).toHaveLength(0);
    });
});
