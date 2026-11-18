import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PlanChange, PlannedExercise, Program, Proposal, TrainerState } from '../core/types';
import { programHash, seedPlan } from '../core/trainer/plan';
import { applyProposal, resetToProgram, undoLast } from '../core/trainer/changes';
import { GymDb } from './db';
import {
  commitChange,
  defaultProgramChanged,
  listChanges,
  loadTrainerState,
  saveChange,
  saveTrainerState,
} from './plan';

let db: GymDb;
let n = 0;

beforeEach(async () => {
  db = new GymDb(`plan-test-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const ex = (exerciseId: string, startWeightKg = 10): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg,
  tracking: 'manual',
});

// Made-up program; not anyone's real plan.
const PROGRAM: Program = {
  name: 'Test split',
  weightUnit: 'kg',
  days: [
    { id: 'a', name: 'Day A', exercises: [ex('Ex_One'), ex('Ex_Two')] },
    { id: 'b', name: 'Day B', exercises: [ex('Ex_Three')] },
  ],
};

/** The same program with a changed default weight (a new program.json). */
const PROGRAM_V2: Program = {
  ...PROGRAM,
  days: [
    { id: 'a', name: 'Day A', exercises: [ex('Ex_One', 12), ex('Ex_Two')] },
    { id: 'b', name: 'Day B', exercises: [ex('Ex_Three')] },
    { id: 'c', name: 'Day C', exercises: [ex('Ex_Four')] },
  ],
};

const NOW = Date.UTC(2030, 0, 10, 12);

/** A plan-scope proposal that drops Ex_Two from day A (edits the days). */
function dropProposal(state: TrainerState): Proposal {
  const next = structuredClone(state);
  const dayA = next.plan.days.find((d) => d.id === 'a');
  if (!dayA) throw new Error('no day a');
  dayA.exercises = dayA.exercises.filter((e) => e.exerciseId !== 'Ex_Two');
  return {
    action: 'swap',
    scope: 'plan',
    title: 'Drop Ex Two',
    lines: [{ before: 'Ex Two', after: '—' }],
    why: 'test',
    next,
    baseVersion: state.version,
  };
}

/** A today-scope proposal: rest on a date (doesn't edit the days). */
function restProposal(state: TrainerState, date: string): Proposal {
  const next = structuredClone(state);
  next.overrides.push({ date, rest: true });
  return {
    action: 'postpone',
    scope: 'today',
    title: 'Rest today',
    lines: [],
    why: 'test',
    next,
    baseVersion: state.version,
  };
}

function applied(
  state: TrainerState,
  p: Proposal,
  now = NOW,
): { state: TrainerState; change: PlanChange } {
  const r = applyProposal(state, p, now, 'chip');
  if (!r.ok) throw new Error(r.reason);
  return { state: r.state, change: r.change };
}

describe('loadTrainerState (M10)', () => {
  it('seeds from the program on first read and stores it', async () => {
    const state = await loadTrainerState(db, PROGRAM);
    expect(state).toEqual(seedPlan(PROGRAM));
    expect(state.plan.seededFrom).toBe(programHash(PROGRAM));
    expect(await db.trainer.get('current')).toEqual({ key: 'current', state });
  });

  it('returns the stored state on later reads', async () => {
    const first = await loadTrainerState(db, PROGRAM);
    const { state } = applied(first, restProposal(first, '2030-01-10'));
    await saveTrainerState(db, state);
    expect(await loadTrainerState(db, PROGRAM)).toEqual(state);
  });

  it('re-seeds when the program changed and the plan isn’t edited, keeping rest days and overrides', async () => {
    const first = await loadTrainerState(db, PROGRAM);
    const { state } = applied(first, restProposal(first, '2030-01-10'));
    state.schedule.restWeekdays = [0, 3];
    await saveTrainerState(db, state);

    const re = await loadTrainerState(db, PROGRAM_V2);
    const seed = seedPlan(PROGRAM_V2);
    expect(re.plan).toEqual(seed.plan);
    expect(re.schedule.rotation).toEqual(['a', 'b', 'c']);
    expect(re.schedule.restWeekdays).toEqual([0, 3]);
    expect(re.overrides).toEqual(state.overrides);
    // The version only ever rises, so proposals built on the old plan are stale.
    expect(re.version).toBe(state.version + 1);
    expect(await db.trainer.get('current')).toEqual({ key: 'current', state: re });
    expect(defaultProgramChanged(re, PROGRAM_V2)).toBe(false);
  });

  it('keeps the user plan when it was edited (M10-q11), and flags the new default', async () => {
    const first = await loadTrainerState(db, PROGRAM);
    const { state } = applied(first, dropProposal(first));
    expect(state.plan.edited).toBe(true);
    await saveTrainerState(db, state);

    const kept = await loadTrainerState(db, PROGRAM_V2);
    expect(kept).toEqual(state);
    expect(kept.plan.seededFrom).toBe(programHash(PROGRAM));
    expect(defaultProgramChanged(kept, PROGRAM_V2)).toBe(true);
    expect(defaultProgramChanged(kept, PROGRAM)).toBe(false);
  });

  it('never offers a new default program to a starter plan built from the intake', async () => {
    const first = await loadTrainerState(db, PROGRAM);
    const starter = { ...first, plan: { ...first.plan, edited: true, seededFrom: 'starter:abc' } };
    expect(defaultProgramChanged(starter, PROGRAM_V2)).toBe(false);
    expect(defaultProgramChanged(starter, PROGRAM)).toBe(false);
  });

  it('re-seeds a stored row that isn’t a trainer state', async () => {
    await db.trainer.put({ key: 'current', state: { junk: true } as unknown as TrainerState });
    expect(await loadTrainerState(db, PROGRAM)).toEqual(seedPlan(PROGRAM));
  });
});

describe('plan changes (M10)', () => {
  it('saveChange stores a change and returns its id', async () => {
    const s0 = await loadTrainerState(db, PROGRAM);
    const { change } = applied(s0, dropProposal(s0));
    const id = await saveChange(db, change);
    expect(typeof id).toBe('number');
    expect(await db.planChanges.get(id)).toEqual({ ...change, id });
  });

  it('listChanges returns the newest first, up to the limit', async () => {
    let state = await loadTrainerState(db, PROGRAM);
    const titles: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = restProposal(state, `2030-01-1${i}`);
      p.title = `change ${i}`;
      const r = applied(state, p, NOW + i * 1000);
      state = r.state;
      titles.push(p.title);
      await commitChange(db, state, r.change);
    }
    const all = await listChanges(db);
    expect(all.map((c) => c.title)).toEqual([...titles].reverse());
    expect(all.every((c) => typeof c.id === 'number')).toBe(true);
    const two = await listChanges(db, 2);
    expect(two.map((c) => c.title)).toEqual(['change 3', 'change 2']);
  });

  it('orders changes made in the same millisecond by insertion, newest first', async () => {
    const s0 = await loadTrainerState(db, PROGRAM);
    const a = applied(s0, restProposal(s0, '2030-01-10'));
    const b = applied(a.state, restProposal(a.state, '2030-01-11'));
    await saveChange(db, { ...a.change, title: 'first' });
    await saveChange(db, { ...b.change, title: 'second' });
    expect((await listChanges(db)).map((c) => c.title)).toEqual(['second', 'first']);
  });

  it('commitChange writes the state and the change together', async () => {
    const s0 = await loadTrainerState(db, PROGRAM);
    const { state, change } = applied(s0, dropProposal(s0));
    const id = await commitChange(db, state, change);
    expect(await loadTrainerState(db, PROGRAM)).toEqual(state);
    expect(await listChanges(db)).toEqual([{ ...change, id }]);
  });

  it('persists an undo: the restored state and the change’s undoneAt', async () => {
    const s0 = await loadTrainerState(db, PROGRAM);
    const a = applied(s0, dropProposal(s0));
    await commitChange(db, a.state, a.change);

    const stored = await listChanges(db);
    const u = undoLast(a.state, stored, NOW + 5000);
    if (!u.ok) throw new Error(u.reason);
    const id = await commitChange(db, u.state, u.change);

    expect(id).toBe(stored[0]?.id);
    expect(await db.planChanges.count()).toBe(1);
    const [after] = await listChanges(db);
    expect(after?.undoneAt).toBe(NOW + 5000);
    const reloaded = await loadTrainerState(db, PROGRAM);
    expect(reloaded).toEqual(u.state);
    expect(reloaded.plan.edited).toBe(false);
    // Nothing left to undo once it's stored.
    expect(undoLast(reloaded, await listChanges(db), NOW + 6000)).toEqual({
      ok: false,
      reason: 'nothingToUndo',
    });
  });

  it('stores a reset as a change', async () => {
    const s0 = await loadTrainerState(db, PROGRAM);
    const a = applied(s0, dropProposal(s0));
    await commitChange(db, a.state, a.change);
    const r = resetToProgram(a.state, PROGRAM, NOW + 1000);
    if (!r.ok) throw new Error(r.reason);
    await commitChange(db, r.state, r.change);
    const [newest] = await listChanges(db, 1);
    expect(newest?.action).toBe('reset');
    expect((await loadTrainerState(db, PROGRAM)).plan.edited).toBe(false);
  });
});
