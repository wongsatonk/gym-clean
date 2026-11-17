import { describe, expect, it } from 'vitest';
import { MOVE_HORIZON_DAYS, proposeDoToday, proposeMoveDay, type MoveResult } from './move';
import { applyProposal, undoLast } from '../changes';
import { addDate, calendar, effectiveDay, seedPlan, weekdayOf, type PlanSession } from '../plan';
import { checkCopy } from '../replies';
import { wordCount } from '../../advice';
import type {
  DayOverride,
  FocusBlock,
  PlannedExercise,
  Program,
  ProgramDay,
  Proposal,
  TrainerState,
} from '../../types';

// Made-up program and history (the repo is public). 2026-11-09 is a Monday, 2026-11-15 a Sunday.
const ex = (exerciseId: string): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
});
const day = (id: string): ProgramDay => ({
  id,
  name: id.toUpperCase(),
  exercises: [ex(`${id}-x`), ex(`${id}-y`)],
});
const PROGRAM: Program = {
  name: 'Test PPL',
  weightUnit: 'kg',
  days: ['a', 'b', 'c', 'd', 'e', 'f'].map(day),
};

const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
let n = 0;
const done = (dayId: string, startedAt: number): PlanSession => ({
  sessionId: `s${n++}`,
  dayId,
  startedAt,
  endedAt: startedAt + 3_600_000,
});
const started = (dayId: string, startedAt: number): PlanSession => ({
  sessionId: `s${n++}`,
  dayId,
  startedAt,
});

/** Seeded, Sunday rest. */
const st = (overrides: DayOverride[] = [], restWeekdays = [0]): TrainerState => {
  const s = seedPlan(PROGRAM);
  return { ...s, version: 3, schedule: { ...s.schedule, restWeekdays }, overrides };
};
const ids = (state: TrainerState, sessions: PlanSession[], from: string, days = 7) =>
  calendar(state, sessions, from, days).map((e) => (e.rest ? '-' : e.dayId));

/** A made-up 2-week block from Mon 2026-11-16: Mon/Wed/Fri train a, b, c, d, e, f. */
const BLOCK: FocusBlock = (() => {
  const start = '2026-11-16';
  const order = ['a', 'b', 'c', 'd', 'e', 'f'];
  let k = 0;
  const days = Array.from({ length: 14 }, (_, i) => {
    const date = addDate(start, i);
    const train = [1, 3, 5].includes(weekdayOf(date));
    const id = order[k % 6] ?? 'a';
    if (train) k++;
    return {
      date,
      day: train
        ? { id, name: id.toUpperCase(), exercises: [ex(`${id}-x`), ex(`focus-${date}`)] }
        : null,
    };
  });
  return {
    id: 'focus-test',
    group: 'chest',
    startDate: start,
    weeks: 2,
    weekdays: [1, 3, 5],
    days,
    targetSetsPerWeek: 14,
    baseSetsPerWeek: 10,
  };
})();
const withBlock = (s: TrainerState): TrainerState => ({ ...s, blocks: [BLOCK] });

function ok(r: MoveResult): Proposal {
  if (!r.ok) throw new Error(`expected a proposal, got ${r.reason}: ${r.reply}`);
  return r.proposal;
}
function refused(r: MoveResult): { reason: string; reply: string } {
  if (r.ok) throw new Error('expected no proposal');
  return { reason: r.reason, reply: r.reply };
}
function expectCleanCopy(p: Proposal) {
  const texts = [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])];
  for (const t of texts) expect(checkCopy(t).ok, t).toBe(true);
  expect(p.title.length).toBeGreaterThan(0);
  expect(p.why.length).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
}
function expectCleanReply(reply: string) {
  expect(checkCopy(reply).ok, reply).toBe(true);
  expect(wordCount(reply)).toBeLessThanOrEqual(12);
}

const MON = '2026-11-09';
const TUE = '2026-11-10';
const THU = '2026-11-12';
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

describe('proposeDoToday', () => {
  it('runs that plan day today as a dated override; the rotation carries on after it', () => {
    const state = st();
    expect(ids(state, [], MON)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', '-']);
    const p = ok(proposeDoToday(state, [], MON, 'c'));
    expect(p.action).toBe('postpone');
    expect(p.scope).toBe('dated');
    expect(p.baseVersion).toBe(3);
    expect(p.next.overrides).toEqual([{ date: MON, dayId: 'c' }]);
    expect(ids(p.next, [], MON)).toEqual(['c', 'd', 'e', 'f', 'a', 'b', '-']);
    expect(p.title).toBe('Do C today');
    expect(p.lines).toHaveLength(7);
    expect(p.lines[0]).toEqual({ before: 'Mon 9: A', after: 'Mon 9: C' });
    expectCleanCopy(p);
  });

  it('on a rest date, today becomes a training day', () => {
    const p = ok(proposeDoToday(st(), [], SUN, 'b'));
    expect(ids(p.next, [], SUN)[0]).toBe('b');
    expect(p.why).toMatch(/training day/i);
    expectCleanCopy(p);
  });

  it('replaces any override already on today (e.g. a Not today rest)', () => {
    const state = st([{ date: MON, rest: true }, { date: SUN }]);
    const p = ok(proposeDoToday(state, [], MON, 'a'));
    expect(p.next.overrides).toEqual([{ date: SUN }, { date: MON, dayId: 'a' }]);
  });

  it('does not change the input state', () => {
    const state = st([{ date: '2026-11-20', rest: true }]);
    const copy = structuredClone(state);
    proposeDoToday(state, [], MON, 'c');
    expect(state).toEqual(copy);
  });

  it('applies and undoes through changes.ts', () => {
    const state = st();
    const p = ok(proposeDoToday(state, [], MON, 'c'));
    const r = applyProposal(state, p, at(11, 9, 9), 'chip');
    if (!r.ok) throw new Error(r.reason);
    expect(effectiveDay(r.state, [], MON).day?.id).toBe('c');
    const u = undoLast(r.state, [{ ...r.change, id: 1 }], at(11, 9, 10));
    if (!u.ok) throw new Error(u.reason);
    expect(effectiveDay(u.state, [], MON).day?.id).toBe('a');
  });

  it('on a block date runs the block’s version of that day; the other block dates stay', () => {
    const state = withBlock(st());
    // Tue 17 is a block rest date: c is the block's Fri 20 version.
    const p = ok(proposeDoToday(state, [], '2026-11-17', 'c'));
    const eff = effectiveDay(p.next, [], '2026-11-17');
    expect(eff.day?.exercises.map((e) => e.exerciseId)).toContain('focus-2026-11-20');
    expect(ids(p.next, [], '2026-11-16', 6)).toEqual(['a', 'c', 'b', '-', 'c', '-']);
    expect(p.why).toMatch(/focus block/i);
    expectCleanCopy(p);
  });

  it('on a block training date it replaces that block day and says so', () => {
    const state = withBlock(st());
    const p = ok(proposeDoToday(state, [], '2026-11-16', 'b'));
    const eff = effectiveDay(p.next, [], '2026-11-16');
    expect(eff.day?.exercises.map((e) => e.exerciseId)).toContain('focus-2026-11-18');
    expect(p.why).toContain('instead of A');
  });

  describe('no proposal', () => {
    it('a session started today', () => {
      const r = refused(proposeDoToday(st(), [started('a', at(11, 9, 8))], MON, 'c'));
      expect(r.reason).toBe('sessionStarted');
      expectCleanReply(r.reply);
    });

    it('a session done today (whatever day it ran)', () => {
      for (const id of ['a', 'c']) {
        const r = refused(proposeDoToday(st(), [done(id, at(11, 9, 8))], MON, 'c'));
        expect(r.reason).toBe('alreadyDone');
        expectCleanReply(r.reply);
      }
    });

    it('a day that is not in the plan', () => {
      const r = refused(proposeDoToday(st(), [], MON, 'zz'));
      expect(r.reason).toBe('noDay');
      expectCleanReply(r.reply);
    });

    it('today already runs that day', () => {
      const r = refused(proposeDoToday(st(), [], MON, 'a'));
      expect(r.reason).toBe('alreadyToday');
      expect(r.reply).toContain('A');
      expectCleanReply(r.reply);
    });
  });
});

describe('proposeMoveDay: rotation dates', () => {
  it('onto a rest date: that day rests, the rest date trains, every session kept', () => {
    const state = st();
    const p = ok(proposeMoveDay(state, [], MON, THU, SUN));
    expect(p.action).toBe('postpone');
    expect(p.scope).toBe('dated');
    expect(p.next.overrides).toEqual([{ date: THU, rest: true }, { date: SUN }]);
    expect(ids(p.next, [], MON)).toEqual(['a', 'b', 'c', '-', 'd', 'e', 'f']);
    expect(p.title).toBe('Move D to Friday 13');
    expect(p.why).toContain('Thursday 12');
    expect(p.why).toContain('Sunday 15');
    expectCleanCopy(p);
  });

  it('onto the next training date: that day rests and the rest follow', () => {
    const p = ok(proposeMoveDay(st(), [], MON, THU, FRI));
    expect(p.next.overrides).toEqual([{ date: THU, rest: true }]);
    expect(ids(p.next, [], MON)).toEqual(['a', 'b', 'c', '-', 'd', 'e', '-']);
    expect(p.title).toBe('Move D to Friday 13');
    expectCleanCopy(p);
  });

  it('the preview covers from the moved date for a week, before → after', () => {
    const p = ok(proposeMoveDay(st(), [], MON, THU, SUN));
    expect(p.lines[0]).toEqual({ before: 'Thu 12: D', after: 'Thu 12: Rest' });
    expect(p.lines.at(-1)).toEqual({ before: 'Wed 18: C', after: 'Wed 18: C' });
  });

  it('from today works like Not today with a date', () => {
    const p = ok(proposeMoveDay(st(), [], MON, MON, TUE));
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }]);
    expect(ids(p.next, [], MON, 2)).toEqual(['-', 'a']);
  });

  it('onto a later training date that is not the next one: no proposal, names that day', () => {
    const r = refused(proposeMoveDay(st(), [], MON, THU, SAT));
    expect(r.reason).toBe('dateTaken');
    expect(r.reply).toContain('Saturday');
    expect(r.reply).toContain('F');
    expectCleanReply(r.reply);
  });

  it('earlier than the planned date: no proposal (the rotation keeps its order)', () => {
    const r = refused(proposeMoveDay(st(), [], MON, THU, TUE));
    expect(r.reason).toBe('badDate');
    expectCleanReply(r.reply);
  });

  it('onto a focus-block date from outside it: no proposal', () => {
    const r = refused(proposeMoveDay(withBlock(st()), [], MON, SAT, '2026-11-17'));
    expect(r.reason).toBe('outsideBlock');
    expectCleanReply(r.reply);
  });
});

describe('proposeMoveDay: focus-block dates', () => {
  const TODAY = '2026-11-16';

  it('moves the block day exactly; the other block dates stay', () => {
    const state = withBlock(st());
    const p = ok(proposeMoveDay(state, [], TODAY, '2026-11-18', '2026-11-19'));
    expect(p.next.overrides).toEqual([
      { date: '2026-11-18', rest: true },
      { date: '2026-11-19', dayId: 'b' },
    ]);
    const eff = effectiveDay(p.next, [], '2026-11-19');
    expect(eff.day?.exercises.map((e) => e.exerciseId)).toContain('focus-2026-11-18');
    expect(ids(p.next, [], TODAY, 5)).toEqual(['a', '-', '-', 'b', 'c']);
    expect(p.title).toBe('Move B to Thursday 19');
    expect(p.why).toMatch(/focus block/i);
    expectCleanCopy(p);
  });

  it('can move earlier inside the block', () => {
    const p = ok(proposeMoveDay(withBlock(st()), [], TODAY, '2026-11-20', '2026-11-17'));
    expect(ids(p.next, [], TODAY, 5)).toEqual(['a', 'c', 'b', '-', '-']);
  });

  it('keeps a lighter/swap adjust that was on the moved date', () => {
    const adjust = { kind: 'lighter' as const, exercises: [ex('b-x')] };
    const state = withBlock(st([{ date: '2026-11-18', adjust }]));
    const p = ok(proposeMoveDay(state, [], TODAY, '2026-11-18', '2026-11-19'));
    expect(p.next.overrides).toEqual([
      { date: '2026-11-18', rest: true },
      { date: '2026-11-19', dayId: 'b', adjust },
    ]);
  });

  it('onto a date with a block day: no proposal', () => {
    const r = refused(proposeMoveDay(withBlock(st()), [], TODAY, '2026-11-18', '2026-11-20'));
    expect(r.reason).toBe('dateTaken');
    expect(r.reply).toContain('Friday 20');
    expectCleanReply(r.reply);
  });

  it('out of the block: no proposal', () => {
    const r = refused(proposeMoveDay(withBlock(st()), [], TODAY, '2026-11-18', '2026-12-01'));
    expect(r.reason).toBe('outsideBlock');
    expectCleanReply(r.reply);
  });

  it('applies and undoes', () => {
    const state = withBlock(st());
    const p = ok(proposeMoveDay(state, [], TODAY, '2026-11-18', '2026-11-19'));
    const r = applyProposal(state, p, at(11, 16, 9), 'chip');
    if (!r.ok) throw new Error(r.reason);
    const u = undoLast(r.state, [{ ...r.change, id: 7 }], at(11, 16, 10));
    if (!u.ok) throw new Error(u.reason);
    expect(u.state.overrides).toEqual([]);
    expect(u.state.blocks).toEqual([BLOCK]);
  });
});

describe('proposeMoveDay: no proposal', () => {
  it('a rest date has nothing to move', () => {
    const r = refused(proposeMoveDay(st(), [], MON, SUN, '2026-11-16'));
    expect(r.reason).toBe('notPlanned');
    expect(r.reply).toContain('Sunday 15');
    expectCleanReply(r.reply);
  });

  it('the same date, the past, a bad string or past the horizon', () => {
    expect(refused(proposeMoveDay(st(), [], MON, THU, THU)).reason).toBe('sameDay');
    expect(refused(proposeMoveDay(st(), [], MON, '2026-11-08', THU)).reason).toBe('badDate');
    expect(refused(proposeMoveDay(st(), [], MON, THU, 'friday')).reason).toBe('badDate');
    const far = addDate(MON, MOVE_HORIZON_DAYS + 1);
    expect(refused(proposeMoveDay(st(), [], MON, THU, far)).reason).toBe('badDate');
  });

  it('today with a session started or done', () => {
    expect(refused(proposeMoveDay(st(), [started('a', at(11, 9, 8))], MON, MON, TUE)).reason).toBe(
      'sessionStarted',
    );
    expect(refused(proposeMoveDay(st(), [done('a', at(11, 9, 8))], MON, MON, TUE)).reason).toBe(
      'alreadyDone',
    );
  });

  it('does not change the input state', () => {
    const state = withBlock(st([{ date: '2026-11-20', rest: true }]));
    const copy = structuredClone(state);
    proposeMoveDay(state, [], MON, THU, SUN);
    proposeMoveDay(state, [], '2026-11-16', '2026-11-18', '2026-11-19');
    expect(state).toEqual(copy);
  });

  it('every refusal reply is short and clean', () => {
    const replies = [
      refused(proposeMoveDay(st(), [], MON, THU, THU)).reply,
      refused(proposeMoveDay(st(), [], MON, '2026-11-08', THU)).reply,
      refused(proposeMoveDay(st(), [], MON, THU, addDate(MON, 60))).reply,
      refused(proposeMoveDay(st(), [started('a', at(11, 9, 8))], MON, MON, TUE)).reply,
      refused(proposeMoveDay(st(), [done('a', at(11, 9, 8))], MON, MON, TUE)).reply,
    ];
    for (const r of replies) expectCleanReply(r);
  });
});
