import { describe, expect, it } from 'vitest';
import {
  OVERRIDE_KEEP_DAYS,
  applyProposal,
  pruneOverrides,
  resetToProgram,
  undoLast,
  type TrainerChange,
} from './changes';
import { seedPlan } from './plan';
import type {
  DayOverride,
  FocusBlock,
  PlannedExercise,
  Program,
  Proposal,
  TrainerState,
} from '../types';

// Made-up program (the repo is public). 2026-11-14 is a Saturday.
const ex = (exerciseId: string, sets = 3): PlannedExercise => ({
  exerciseId,
  sets,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
});
const PROGRAM: Program = {
  name: 'Test',
  weightUnit: 'kg',
  days: [
    { id: 'a', name: 'A', exercises: [ex('a-x'), ex('a-y')] },
    { id: 'b', name: 'B', exercises: [ex('b-x')] },
  ],
};
const NOW = new Date(2026, 10, 14, 9, 0).getTime();
const LATER = NOW + 60_000;

/** A proposal whose `next` is `state` changed by `edit`. */
const propose = (
  state: TrainerState,
  edit: (s: TrainerState) => void,
  over: Partial<Proposal> = {},
): Proposal => {
  const next = structuredClone(state);
  edit(next);
  return {
    action: 'postpone',
    scope: 'dated',
    title: 'Not today',
    lines: [{ before: 'Sat: A', after: 'Sat: rest' }],
    why: 'Moved to tomorrow.',
    next,
    baseVersion: state.version,
    ...over,
  };
};
const restToday = (s: TrainerState) => {
  s.overrides.push({ date: '2026-11-14', rest: true });
};
const moreSets = (s: TrainerState) => {
  const e = s.plan.days[0]?.exercises[0];
  if (!e) throw new Error('no exercise');
  e.sets = 4;
};
/** Everything but the version. */
const content = (s: TrainerState) => ({
  plan: s.plan,
  schedule: s.schedule,
  overrides: s.overrides,
});

function ok<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

describe('applyProposal', () => {
  it('returns the proposal state with version + 1 and a change record', () => {
    const s0 = seedPlan(PROGRAM);
    const p = propose(s0, restToday);
    const r = ok(applyProposal(s0, p, NOW, 'chip'));
    expect(r.state.version).toBe(1);
    expect(content(r.state)).toEqual(content(p.next));
    expect(r.change).toEqual({
      createdAt: NOW,
      action: 'postpone',
      title: 'Not today',
      source: 'chip',
      before: s0,
      after: r.state,
    });
  });

  it('never mutates the inputs, and the change holds copies', () => {
    const s0 = seedPlan(PROGRAM);
    const snap = structuredClone(s0);
    const p = propose(s0, restToday);
    const pSnap = structuredClone(p);
    const r = ok(applyProposal(s0, p, NOW, 'rules'));
    expect(s0).toEqual(snap);
    expect(p).toEqual(pSnap);
    r.state.overrides.push({ date: '2026-11-20', rest: true });
    expect(r.change.after.overrides).toHaveLength(1);
    expect(r.change.before).not.toBe(s0);
  });

  it('rejects a stale baseVersion', () => {
    const s0 = seedPlan(PROGRAM);
    const p1 = propose(s0, restToday);
    const p2 = propose(s0, moreSets);
    const s1 = ok(applyProposal(s0, p1, NOW, 'chip')).state;
    expect(applyProposal(s1, p2, LATER, 'chip')).toEqual({ ok: false, reason: 'stale' });
  });

  it('marks the plan edited when plan days change, not for dated overrides', () => {
    const s0 = seedPlan(PROGRAM);
    expect(ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip')).state.plan.edited).toBe(
      false,
    );
    const edited = ok(
      applyProposal(s0, propose(s0, moreSets, { scope: 'plan' }), NOW, 'chip'),
    ).state;
    expect(edited.plan.edited).toBe(true);
    // Stays edited after a later override-only change.
    expect(
      ok(applyProposal(edited, propose(edited, restToday), LATER, 'chip')).state.plan.edited,
    ).toBe(true);
  });

  it(`prunes overrides older than ${OVERRIDE_KEEP_DAYS} days (local date of now)`, () => {
    const s0: TrainerState = {
      ...seedPlan(PROGRAM),
      overrides: [
        { date: '2026-10-30', rest: true }, // 15 days ago: pruned
        { date: '2026-10-31', rest: true }, // 14 days ago: kept
        { date: '2026-11-20', dayId: 'b' }, // future: kept
      ],
    };
    const r = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    expect(r.state.overrides.map((o) => o.date)).toEqual([
      '2026-10-31',
      '2026-11-20',
      '2026-11-14',
    ]);
    // `before` keeps what was there.
    expect(r.change.before.overrides).toHaveLength(3);
  });
});

describe('pruneOverrides', () => {
  it('keeps today − 14 and later, in order', () => {
    const o: DayOverride[] = [
      { date: '2026-11-01', rest: true },
      { date: '2026-10-01', rest: true },
      { date: '2026-11-14', dayId: 'a' },
    ];
    expect(pruneOverrides(o, '2026-11-15')).toEqual([o[0], o[2]]);
    expect(pruneOverrides(o, '2026-11-16')).toEqual([o[2]]);
  });
});

describe('undoLast', () => {
  it('a round trip restores the state exactly (version keeps rising)', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, moreSets, { scope: 'plan' }), NOW, 'chip'));
    const u = ok(undoLast(a.state, [a.change], LATER));
    expect(content(u.state)).toEqual(content(s0));
    expect(u.state.version).toBe(2);
    expect(u.change).toEqual({ ...a.change, undoneAt: LATER });
  });

  it('is LIFO: the newest change first, then the one before', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const b = ok(applyProposal(a.state, propose(a.state, moreSets), LATER, 'rules'));
    const changes: TrainerChange[] = [a.change, b.change];

    const u1 = ok(undoLast(b.state, changes, LATER + 1));
    expect(u1.change.createdAt).toBe(LATER);
    expect(content(u1.state)).toEqual(content(a.state));

    const u2 = ok(undoLast(u1.state, [a.change, u1.change], LATER + 2));
    expect(u2.change.createdAt).toBe(NOW);
    expect(content(u2.state)).toEqual(content(s0));

    expect(undoLast(u2.state, [u2.change, u1.change], LATER + 3)).toEqual({
      ok: false,
      reason: 'nothingToUndo',
    });
  });

  it('picks the newest by createdAt whatever the list order', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const b = ok(applyProposal(a.state, propose(a.state, moreSets), LATER, 'chip'));
    expect(ok(undoLast(b.state, [b.change, a.change], LATER + 1)).change.createdAt).toBe(LATER);
  });

  it('rejects undoing a change that is already undone', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const withId = { ...a.change, id: 7 };
    const u = ok(undoLast(a.state, [withId], LATER));
    expect(undoLast(u.state, [u.change], LATER + 1, 7)).toEqual({
      ok: false,
      reason: 'alreadyUndone',
    });
  });

  it('rejects undoing an older change while a newer one stands', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const b = ok(applyProposal(a.state, propose(a.state, moreSets), LATER, 'chip'));
    const changes = [
      { ...a.change, id: 1 },
      { ...b.change, id: 2 },
    ];
    expect(undoLast(b.state, changes, LATER + 1, 1)).toEqual({ ok: false, reason: 'notNewest' });
    expect(ok(undoLast(b.state, changes, LATER + 1, 2)).change.id).toBe(2);
  });

  it('rejects an empty list and a state that moved on without a change record', () => {
    const s0 = seedPlan(PROGRAM);
    expect(undoLast(s0, [], NOW)).toEqual({ ok: false, reason: 'nothingToUndo' });
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const moved = { ...a.state, overrides: [] };
    expect(undoLast(moved, [a.change], LATER)).toEqual({ ok: false, reason: 'conflict' });
  });

  it('a proposal made before an undo is stale after it', () => {
    const s0 = seedPlan(PROGRAM);
    const a = ok(applyProposal(s0, propose(s0, restToday), NOW, 'chip'));
    const pending = propose(a.state, moreSets);
    const u = ok(undoLast(a.state, [a.change], LATER));
    const c = ok(applyProposal(u.state, propose(u.state, restToday), LATER + 1, 'chip'));
    expect(applyProposal(c.state, pending, LATER + 2, 'chip')).toEqual({
      ok: false,
      reason: 'stale',
    });
  });
});

describe('resetToProgram', () => {
  it('is a change back to the program that keeps rest weekdays and overrides', () => {
    const s0 = seedPlan(PROGRAM);
    const edit = propose(
      s0,
      (s) => {
        moreSets(s);
        s.schedule = { rotation: ['b', 'a'], restWeekdays: [0, 3] };
        restToday(s);
      },
      { scope: 'plan' },
    );
    const e = ok(applyProposal(s0, edit, NOW, 'chip'));
    expect(e.state.plan.edited).toBe(true);

    const r = ok(resetToProgram(e.state, PROGRAM, LATER));
    expect(r.state.version).toBe(e.state.version + 1);
    expect(r.state.plan).toEqual(seedPlan(PROGRAM).plan);
    expect(r.state.schedule).toEqual({ rotation: ['a', 'b'], restWeekdays: [0, 3] });
    expect(r.state.overrides).toEqual(e.state.overrides);
    expect(r.change).toMatchObject({
      action: 'reset',
      source: 'chip',
      createdAt: LATER,
      before: e.state,
      after: r.state,
    });
    expect(r.change.title).toBe('Reset to default program');
  });

  it('can be undone', () => {
    const s0 = seedPlan(PROGRAM);
    const e = ok(applyProposal(s0, propose(s0, moreSets, { scope: 'plan' }), NOW, 'chip'));
    const r = ok(resetToProgram(e.state, PROGRAM, LATER));
    const u = ok(undoLast(r.state, [e.change, r.change], LATER + 1));
    expect(u.change.action).toBe('reset');
    expect(content(u.state)).toEqual(content(e.state));
    expect(u.state.plan.edited).toBe(true);
  });

  it('prunes old overrides like any change', () => {
    const s0: TrainerState = {
      ...seedPlan(PROGRAM),
      overrides: [{ date: '2026-10-01', rest: true }],
    };
    expect(ok(resetToProgram(s0, PROGRAM, NOW)).state.overrides).toEqual([]);
  });
});

describe('focus blocks (M12)', () => {
  const block: FocusBlock = {
    id: 'focus-x',
    group: 'chest',
    startDate: '2026-10-01',
    weeks: 2,
    weekdays: [1, 3, 5],
    days: [],
    targetSetsPerWeek: 10,
    baseSetsPerWeek: 7,
  };
  const addBlock = (s: TrainerState) => {
    s.blocks = [structuredClone(block)];
  };

  it('Apply keeps old blocks (never pruned), Undo restores none', () => {
    const s0 = seedPlan(PROGRAM);
    const r = ok(applyProposal(s0, propose(s0, addBlock, { action: 'focusBlock' }), NOW, 'rules'));
    expect(r.state.blocks).toEqual([block]);
    expect(r.change.action).toBe('focusBlock');
    const u = ok(undoLast(r.state, [{ ...r.change, id: 1 }], LATER));
    expect(u.state.blocks).toBeUndefined();
  });

  it('Undo is a conflict when the blocks changed without a record', () => {
    const s0 = seedPlan(PROGRAM);
    const r = ok(applyProposal(s0, propose(s0, addBlock, { action: 'focusBlock' }), NOW, 'rules'));
    const moved = { ...r.state, blocks: [] };
    expect(undoLast(moved, [{ ...r.change, id: 1 }], LATER)).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('Reset to the default program keeps dated blocks, like dated overrides', () => {
    const s0: TrainerState = { ...seedPlan(PROGRAM), blocks: [block] };
    expect(ok(resetToProgram(s0, PROGRAM, NOW)).state.blocks).toEqual([block]);
  });
});
