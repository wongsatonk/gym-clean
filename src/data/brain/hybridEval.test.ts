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
    106,
  ],
  [
    '(b) always the wrong tool (suggestFood)',
    () => bridge({ text: '', toolCalls: [{ name: 'suggestFood', args: {} }], latencyMs: 900 }),
    106,
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
        // The misses, pinned: two the rules don't read as changes (the model gets them) and one
        // swap naming two exercises (req-058). req-095 ("leg extension" read as today's triceps
        // extension) is fixed in intents.ts since 1.15.2.
        expect(actionIdx.filter((i) => !row(rows, i).pass).map((i) => row(rows, i).id)).toEqual([
          'req-036',
          'req-043',
          'req-058',
        ]);
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
        // The 16 red flags, the empty item (req-073) and Thai "hello" (req-074).
        expect(ruled).toHaveLength(18);
        for (const i of ruled)
          expect([row(rows, i).id, row(rows, i).pass]).toEqual([row(rows, i).id, true]);
        // The other 18 are open chat for the model: a text-only model passes them all, a model
        // that always calls a tool fails them (its fault, not the routing's).
        const passed = noActionIdx.filter((i) => row(rows, i).pass).length;
        expect(passed).toBe(name.startsWith('(a)') ? 36 : 18);
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
