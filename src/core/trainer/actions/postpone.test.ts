import { describe, expect, it } from 'vitest';
import { proposePostpone, type PostponeResult } from './postpone';
import { applyProposal } from '../changes';
import { calendar, seedPlan, upNext, type PlanSession } from '../plan';
import { ADVICE_BANNED_WORDS, wordCount } from '../../advice';
import type {
  DayOverride,
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

/** Seeded, Sunday rest (the M10-q1 default). */
const st = (overrides: DayOverride[] = [], restWeekdays = [0]): TrainerState => {
  const s = seedPlan(PROGRAM);
  return { ...s, version: 3, schedule: { ...s.schedule, restWeekdays }, overrides };
};
const ids = (state: TrainerState, sessions: PlanSession[], from: string, days = 7) =>
  calendar(state, sessions, from, days).map((e) => (e.rest ? '-' : e.dayId));

function ok(r: PostponeResult): Proposal {
  if (!r.ok) throw new Error(`expected a proposal, got ${r.reason}`);
  return r.proposal;
}
function refused(r: PostponeResult): { reason: string; reply: string } {
  if (r.ok) throw new Error('expected no proposal');
  return { reason: r.reason, reply: r.reply };
}

const BANNED = [...ADVICE_BANNED_WORDS, 'strain', 'sprain', 'tear', 'injury', 'doctor'];
function expectCleanCopy(p: Proposal) {
  const texts = [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])];
  for (const t of texts) {
    for (const w of BANNED) expect(t.toLowerCase()).not.toContain(w);
  }
  expect(p.title.length).toBeGreaterThan(0);
  expect(p.why.length).toBeGreaterThan(0);
  expect(p.say).toBeDefined();
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
}

const MON = '2026-11-09';
const TUE = '2026-11-10';
const SAT = '2026-11-14';
const SUN = '2026-11-15';

describe('proposePostpone: use the rest day', () => {
  it('today rests and this week’s rest day trains, so the week keeps every session', () => {
    const state = st();
    expect(ids(state, [], MON)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', '-']);
    const p = ok(proposePostpone(state, [], MON, { mode: 'useRestDay' }));
    expect(p.action).toBe('postpone');
    expect(p.scope).toBe('dated');
    expect(p.baseVersion).toBe(3);
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }, { date: SUN }]);
    expect(ids(p.next, [], MON)).toEqual(['-', 'a', 'b', 'c', 'd', 'e', 'f']);
    expectCleanCopy(p);
  });

  it('shows a 7-day before → after preview', () => {
    const p = ok(proposePostpone(st(), [], MON, { mode: 'useRestDay' }));
    expect(p.lines).toHaveLength(7);
    expect(p.lines[0]).toEqual({ before: 'Mon: A', after: 'Mon: Rest' });
    expect(p.lines[1]).toEqual({ before: 'Tue: B', after: 'Tue: A' });
    expect(p.lines[6]).toEqual({ before: 'Sun: Rest', after: 'Sun: F' });
    expect(p.why).toContain('Tuesday');
    expect(p.why).toContain('Sunday');
  });

  it('does not change the input state', () => {
    const state = st([{ date: '2026-11-20', rest: true }]);
    const copy = structuredClone(state);
    proposePostpone(state, [], MON, { mode: 'useRestDay' });
    expect(state).toEqual(copy);
  });

  it('applies and moves Up next to tomorrow', () => {
    const state = st();
    const p = ok(proposePostpone(state, [], MON, { mode: 'useRestDay' }));
    const r = applyProposal(state, p, at(11, 9, 9), 'chip');
    if (!r.ok) throw new Error(r.reason);
    expect(upNext(r.state, [], MON)).toEqual({ date: TUE, dayId: 'a' });
  });

  it('replaces an adjust override already on today', () => {
    const state = st([{ date: MON, adjust: { kind: 'lighter', exercises: [ex('a-x')] } }]);
    const p = ok(proposePostpone(state, [], MON, { mode: 'useRestDay' }));
    expect(p.next.overrides.filter((o) => o.date === MON)).toEqual([{ date: MON, rest: true }]);
  });

  it('with no rest weekdays it slides the week instead and says so', () => {
    const state = st([], []);
    const p = ok(proposePostpone(state, [], MON, { mode: 'useRestDay' }));
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }]);
    expect(p.why).toMatch(/no rest day/i);
  });
});

describe('proposePostpone: push the week', () => {
  it('today rests and everything slides a day; the last session spills into next week', () => {
    const p = ok(proposePostpone(st(), [], MON, { mode: 'pushWeek' }));
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }]);
    expect(ids(p.next, [], MON)).toEqual(['-', 'a', 'b', 'c', 'd', 'e', '-']);
    expect(p.why).toContain('F');
    expect(p.why).toMatch(/next week/);
    expect(p.lines[6]).toEqual({ before: 'Sun: Rest', after: 'Sun: Rest' });
    expectCleanCopy(p);
  });
});

describe('proposePostpone: the day before the rest day', () => {
  // Mon–Fri done (a–e), so Saturday is F and Sunday rests.
  const week = [
    done('a', at(11, 9)),
    done('b', at(11, 10)),
    done('c', at(11, 11)),
    done('d', at(11, 12)),
    done('e', at(11, 13)),
  ];

  it('useRestDay: Saturday rests, Sunday trains F', () => {
    expect(ids(st(), week, SAT)).toEqual(['f', '-', 'a', 'b', 'c', 'd', 'e']);
    const p = ok(proposePostpone(st(), week, SAT, { mode: 'useRestDay' }));
    expect(p.next.overrides).toEqual([{ date: SAT, rest: true }, { date: SUN }]);
    expect(ids(p.next, week, SAT)).toEqual(['-', 'f', 'a', 'b', 'c', 'd', 'e']);
    expect(p.why).toContain('Sunday');
  });

  it('pushWeek: Saturday and Sunday rest, F moves to Monday', () => {
    const p = ok(proposePostpone(st(), week, SAT, { mode: 'pushWeek' }));
    expect(ids(p.next, week, SAT)).toEqual(['-', '-', 'f', 'a', 'b', 'c', 'd']);
    expect(p.why).toContain('Monday');
  });
});

describe('proposePostpone: no proposal', () => {
  it('on a rest weekday: "today is already a rest day"', () => {
    const r = refused(proposePostpone(st(), [], SUN, { mode: 'useRestDay' }));
    expect(r.reason).toBe('restDay');
    expect(r.reply).toMatch(/already a rest day/i);
  });

  it('on a date that already has a rest override', () => {
    const r = refused(
      proposePostpone(st([{ date: MON, rest: true }]), [], MON, { mode: 'pushWeek' }),
    );
    expect(r.reason).toBe('restDay');
  });

  it('a session already started today: "finish or end today’s workout first"', () => {
    const r = refused(
      proposePostpone(st(), [started('a', at(11, 9, 8))], MON, { mode: 'useRestDay' }),
    );
    expect(r.reason).toBe('sessionStarted');
    expect(r.reply).toMatch(/finish or end today.s workout first/i);
  });

  it('a session finished today: nothing left to move', () => {
    const r = refused(proposePostpone(st(), [done('a', at(11, 9, 8))], MON, { mode: 'pushWeek' }));
    expect(r.reason).toBe('alreadyDone');
  });

  it('an unfinished session from yesterday does not block today', () => {
    const p = proposePostpone(st(), [started('a', at(11, 8, 8))], MON, { mode: 'pushWeek' });
    expect(p.ok).toBe(true);
  });

  it('an empty rotation has no day to move', () => {
    const s = st();
    const empty = { ...s, schedule: { ...s.schedule, rotation: [] } };
    expect(refused(proposePostpone(empty, [], MON, { mode: 'pushWeek' })).reason).toBe('noDay');
  });

  it('refusal replies are short coaching words', () => {
    const replies = [
      refused(proposePostpone(st(), [], SUN, { mode: 'useRestDay' })).reply,
      refused(proposePostpone(st(), [started('a', at(11, 9, 8))], MON, { mode: 'pushWeek' })).reply,
      refused(proposePostpone(st(), [done('a', at(11, 9, 8))], MON, { mode: 'pushWeek' })).reply,
      refused(proposePostpone(st(), [], MON, { mode: 'useRestDay', to: '2026-11-12' })).reply,
      refused(proposePostpone(st(), [], MON, { mode: 'useRestDay', to: MON })).reply,
    ];
    for (const r of replies) {
      expect(wordCount(r)).toBeLessThanOrEqual(12);
      for (const w of BANNED) expect(r.toLowerCase()).not.toContain(w);
    }
  });
});

describe('proposePostpone: twice in a row', () => {
  it('Monday then Tuesday: the rest day is used up, so the second one slides the week', () => {
    const s0 = st();
    const p1 = ok(proposePostpone(s0, [], MON, { mode: 'useRestDay' }));
    const r1 = applyProposal(s0, p1, at(11, 9, 9), 'chip');
    if (!r1.ok) throw new Error(r1.reason);
    expect(ids(r1.state, [], TUE)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'a']);

    const p2 = ok(proposePostpone(r1.state, [], TUE, { mode: 'useRestDay' }));
    expect(p2.baseVersion).toBe(r1.state.version);
    expect(p2.why).toMatch(/no rest day/i);
    expect(ids(p2.next, [], TUE)).toEqual(['-', 'a', 'b', 'c', 'd', 'e', 'f']);
    const r2 = applyProposal(r1.state, p2, at(11, 10, 9), 'chip');
    expect(r2.ok).toBe(true);
  });

  it('twice on the same day: the second one is already a rest day', () => {
    const s0 = st();
    const p1 = ok(proposePostpone(s0, [], MON, { mode: 'pushWeek' }));
    const r1 = applyProposal(s0, p1, at(11, 9, 9), 'chip');
    if (!r1.ok) throw new Error(r1.reason);
    expect(refused(proposePostpone(r1.state, [], MON, { mode: 'pushWeek' })).reason).toBe(
      'restDay',
    );
  });
});

describe('proposePostpone: move to a date', () => {
  it('onto a rest date: today rests and that date trains', () => {
    const p = ok(proposePostpone(st(), [], MON, { mode: 'pushWeek', to: SUN }));
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }, { date: SUN }]);
    expect(p.title).toContain('Sunday');
  });

  it('onto a date that already has a session: no proposal, names that day', () => {
    const r = refused(proposePostpone(st(), [], MON, { mode: 'useRestDay', to: '2026-11-12' }));
    expect(r.reason).toBe('dateTaken');
    expect(r.reply).toContain('Thursday');
    expect(r.reply).toContain('D');
  });

  it('today, the past or more than 6 days ahead: no proposal', () => {
    for (const to of [MON, '2026-11-08', '2026-11-16']) {
      expect(refused(proposePostpone(st(), [], MON, { mode: 'useRestDay', to })).reason).toBe(
        'badDate',
      );
    }
  });

  it('replaces a rest override on the target date', () => {
    const state = st([{ date: '2026-11-12', rest: true }]);
    const p = ok(proposePostpone(state, [], MON, { mode: 'useRestDay', to: '2026-11-12' }));
    expect(p.next.overrides).toEqual([{ date: MON, rest: true }, { date: '2026-11-12' }]);
  });
});
