import { describe, expect, it } from 'vitest';
import { seedPlan } from '../plan';
import { proposeRemove } from './remove';
import type { ActionContext } from './lighter';
import type { PlannedExercise, Program } from '../../types';

// Made-up program (the repo is public). 2026-11-11 is a Wednesday; no rest weekdays.
const pe = (exerciseId: string): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
});
const PROGRAM: Program = {
  name: 'Test',
  weightUnit: 'kg',
  days: [
    { id: 'a', name: 'Day A', exercises: [pe('bench'), pe('fly')] },
    { id: 'b', name: 'Day B', exercises: [pe('row')] },
  ],
};
const ctx = (over: Partial<ActionContext> = {}): ActionContext => {
  const s = seedPlan(PROGRAM);
  return {
    state: { ...s, schedule: { ...s.schedule, restWeekdays: [] } },
    sessions: [],
    today: '2026-11-11',
    unit: 'kg',
    lastWeightKg: {},
    ...over,
  };
};

describe('proposeRemove', () => {
  it('drops one unstarted row today, plan unchanged', () => {
    const r = proposeRemove(ctx({ started: ['bench'] }), 'fly');
    if (!r.ok) throw new Error(r.reason);
    expect(r.proposal.next.overrides).toEqual([
      {
        date: '2026-11-11',
        dayId: 'a',
        adjust: {
          kind: 'swap',
          exercises: [pe('bench')],
          replaced: [{ fromId: 'fly', toId: null }],
        },
      },
    ]);
    expect(r.proposal.next.plan).toEqual(ctx().state.plan);
    expect(r.proposal.lines).toEqual([
      { before: 'fly · 3 × 8–12 · 10 kg', after: 'Removed today' },
    ]);
  });

  it('refuses a logged row, a row not in today and the last row', () => {
    expect(proposeRemove(ctx({ started: ['fly'] }), 'fly')).toMatchObject({
      ok: false,
      reason: 'started',
    });
    expect(proposeRemove(ctx(), 'row')).toMatchObject({ ok: false, reason: 'notInDay' });
    const one = ctx();
    const first = proposeRemove(one, 'fly');
    if (!first.ok) throw new Error(first.reason);
    expect(proposeRemove({ ...one, state: first.proposal.next }, 'bench')).toMatchObject({
      ok: false,
      reason: 'wholeDay',
    });
  });
});
