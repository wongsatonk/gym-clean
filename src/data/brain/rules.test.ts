import { describe, expect, it } from 'vitest';
import programJson from '../../data/program.json';
import { trainerCatalog } from '../../core/testkit/trainerCatalog';
import { handle, type CoachContext } from '../../core/trainer/coach';
import { seedPlan } from '../../core/trainer/plan';
import type { BrainContext, Program } from '../../core/types';
import { answerChip, rulesBrain } from './rules';

// Made-up context: the repo's default program, no history, no personal numbers.
const coach: CoachContext = {
  phase: 'today',
  state: { ...seedPlan(programJson as Program), version: 1 },
  sessions: [],
  today: '2030-01-09',
  unit: 'kg',
  lastWeightKg: {},
  logged: [],
  catalog: trainerCatalog(),
  m7Available: false,
};
const ctx: BrainContext = { coach, turns: [] };

describe('rules brain (M12)', () => {
  it('is always available', async () => {
    expect(rulesBrain.id).toBe('rules');
    expect(await rulesBrain.status()).toEqual({ available: true });
  });

  it('answers free text with handle() and source "rules"', async () => {
    const reply = await rulesBrain.ask('lighter today please', ctx);
    expect(reply).toEqual({ ...handle({ text: 'lighter today please' }, coach), source: 'rules' });
    expect(reply.proposal?.action).toBe('lighter');
    expect(reply.usedHealth).toBeUndefined();
  });

  it('answers a chip with handle() and source "chip"', () => {
    const reply = answerChip({ chip: 'lighter' }, ctx);
    expect(reply).toEqual({ ...handle({ chip: 'lighter' }, coach), source: 'chip' });
  });
});
