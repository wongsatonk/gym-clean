import { describe, expect, it } from 'vitest';
import {
  detectStalls,
  proposeStallFix,
  stallLine,
  type Stall,
  type StallFixResult,
  type StallSession,
} from './stall';
import { applyProposal } from '../changes';
import { effectiveDay, seedPlan } from '../plan';
import { ADVICE_BANNED_WORDS, nextTimeAdvice, wordCount } from '../../advice';
import type { SessionState } from '../../session';
import type { PlannedExercise, Program, Proposal, SetLog, TrainerState } from '../../types';
import { fromUnit } from '../../units';

// Made-up program and history (the repo is public). 2026-11-09 is a Monday.
const pe = (exerciseId: string, over: Partial<PlannedExercise> = {}): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
  ...over,
});
const PROGRAM: Program = {
  name: 'Test plan',
  weightUnit: 'kg',
  days: [
    { id: 'a', name: 'Day A', exercises: [pe('bench'), pe('pushup', { startWeightKg: 0 })] },
    { id: 'b', name: 'Day B', exercises: [pe('row'), pe('curl')] },
    { id: 'c', name: 'Day C', exercises: [pe('squat'), pe('legcurl')] },
    {
      id: 'd',
      name: 'Day D',
      exercises: [pe('press', { sets: 5 }), pe('legcurl', { targetReps: [10, 12] })],
    },
  ],
};
const NAMES: Record<string, string> = {
  bench: 'Dumbbell Bench Press',
  pushup: 'Pushups',
  row: 'One-Arm Dumbbell Row',
  curl: 'Dumbbell Bicep Curl',
  squat: 'Goblet Squat',
  legcurl: 'Lying Leg Curls',
  press: 'Dumbbell Shoulder Press',
};
const name = (id: string) => NAMES[id] ?? id;

const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();

type Hist = { sessions: StallSession[]; sets: SetLog[] };
let sid = 0;
/** One session on (month, day) with `[kg, reps][]` sets of `exerciseId`. */
function add(
  h: Hist,
  dayId: string,
  when: number,
  exerciseId: string,
  sets: [number, number][],
  opts: { adjust?: StallSession['adjust']; finished?: boolean } = {},
): Hist {
  const sessionId = `s${sid++}`;
  const session: StallSession = {
    sessionId,
    dayId,
    startedAt: when,
    ...(opts.finished === false ? {} : { endedAt: when + 3_600_000 }),
    ...(opts.adjust ? { adjust: opts.adjust } : {}),
  };
  const logs = sets.map(([weightKg, reps], i): SetLog => ({
    sessionId,
    exerciseId,
    setIndex: i,
    reps,
    weightKg,
    restTakenSec: 90,
    startedAt: when + i * 120_000,
    endedAt: when + i * 120_000 + 40_000,
  }));
  return { sessions: [...h.sessions, session], sets: [...h.sets, ...logs] };
}
function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('missing');
  return v;
}
const empty = (): Hist => ({ sessions: [], sets: [] });
/** `tops.length` sessions of `exerciseId` on day `dayId`, a week apart from 2026-10-05. */
function series(exerciseId: string, dayId: string, tops: [number, number][]): Hist {
  return tops.reduce(
    (h, top, i) =>
      add(h, dayId, at(10, 5 + i * 7), exerciseId, [top, [top[0], Math.max(1, top[1] - 1)]]),
    empty(),
  );
}
const stalls = (h: Hist, opts?: Parameters<typeof detectStalls>[3]) =>
  detectStalls(h.sets, h.sessions, seedPlan(PROGRAM).plan, opts);

describe('detectStalls', () => {
  it('2 sessions without a gain → no stall', () => {
    expect(
      stalls(
        series('bench', 'a', [
          [20, 8],
          [20, 8],
        ]),
      ),
    ).toEqual([]);
  });

  it('3 sessions without a gain → stall', () => {
    const out = stalls(
      series('bench', 'a', [
        [20, 8],
        [20, 8],
        [20, 7],
      ]),
    );
    expect(out).toEqual([
      {
        exerciseId: 'bench',
        sessions: 3,
        top: { weightKg: 20, reps: 8 },
        bodyweight: false,
        options: ['lighter', 'addSet'],
      },
    ]);
  });

  it('a lighter or deload session in between is skipped', () => {
    let h = series('bench', 'a', [
      [20, 8],
      [20, 8],
    ]);
    h = add(h, 'a', at(10, 18), 'bench', [[17.5, 12]], { adjust: ['lighter'] });
    h = add(h, 'a', at(10, 25), 'bench', [[20, 8]]);
    expect(stalls(h).map((s) => s.sessions)).toEqual([3]);
    h = add(h, 'a', at(11, 1), 'bench', [[15, 12]], { adjust: ['deload'] });
    expect(stalls(h).map((s) => s.sessions)).toEqual([3]);
  });

  it('a gain resets it: more reps at the same weight, or more weight', () => {
    expect(
      stalls(
        series('bench', 'a', [
          [20, 8],
          [20, 9],
          [20, 9],
        ]),
      ),
    ).toEqual([]);
    expect(
      stalls(
        series('bench', 'a', [
          [20, 8],
          [20, 9],
          [20, 9],
          [20, 9],
        ]),
      ).map((s) => s.sessions),
    ).toEqual([3]);
    expect(
      stalls(
        series('bench', 'a', [
          [20, 8],
          [20, 8],
          [22.5, 6],
        ]),
      ),
    ).toEqual([]);
  });

  it('more reps at a lower weight is not a gain', () => {
    expect(
      stalls(
        series('bench', 'a', [
          [20, 8],
          [17.5, 12],
          [20, 8],
        ]),
      ).map((s) => s.sessions),
    ).toEqual([3]);
  });

  it('counts a longer run', () => {
    const out = stalls(
      series('bench', 'a', [
        [20, 8],
        [20, 8],
        [20, 8],
        [20, 8],
        [20, 8],
      ]),
    );
    expect(out[0]?.sessions).toBe(5);
  });

  it('lb weights stored as odd kg compare within the epsilon', () => {
    const w = fromUnit(35, 'lb');
    expect(
      stalls(
        series('bench', 'a', [
          [w, 8],
          [w + 0.001, 8],
          [w - 0.001, 8],
        ]),
      ),
    ).toHaveLength(1);
  });

  it('unfinished sessions and sets of unknown sessions are ignored', () => {
    let h = series('bench', 'a', [
      [20, 8],
      [20, 8],
    ]);
    h = add(h, 'a', at(10, 20), 'bench', [[20, 8]], { finished: false });
    expect(stalls(h)).toEqual([]);
    const orphan: SetLog = { ...must(h.sets[0]), sessionId: 'nope' };
    expect(stalls({ ...h, sets: [...h.sets, orphan] })).toEqual([]);
  });

  it('only exercises in the plan, in plan order', () => {
    let h = series('row', 'b', [
      [20, 8],
      [20, 8],
      [20, 8],
    ]);
    for (const t of [at(10, 6), at(10, 13), at(10, 20)]) h = add(h, 'a', t, 'bench', [[30, 5]]);
    h = add(h, 'a', at(10, 7), 'retired', [[30, 5]]);
    h = add(h, 'a', at(10, 14), 'retired', [[30, 5]]);
    h = add(h, 'a', at(10, 21), 'retired', [[30, 5]]);
    expect(stalls(h).map((s) => s.exerciseId)).toEqual(['bench', 'row']);
  });

  it('bodyweight exercises: reps only; no "lighter" option', () => {
    const out = stalls(
      series('pushup', 'a', [
        [0, 15],
        [0, 15],
        [0, 14],
      ]),
    );
    expect(out).toEqual([
      {
        exerciseId: 'pushup',
        sessions: 3,
        top: { weightKg: 0, reps: 15 },
        bodyweight: true,
        options: ['addSet'],
      },
    ]);
    expect(
      stalls(
        series('pushup', 'a', [
          [0, 15],
          [0, 16],
          [0, 16],
        ]),
      ),
    ).toEqual([]);
  });

  it('no "+1 set" option once the plan has 5 sets', () => {
    const out = stalls(
      series('press', 'd', [
        [15, 8],
        [15, 8],
        [15, 8],
      ]),
    );
    expect(out[0]?.options).toEqual(['lighter']);
  });

  it('`since` ignores that exercise’s sessions before a fix', () => {
    const h = series('bench', 'a', [
      [20, 8],
      [20, 8],
      [20, 8],
      [17.5, 12],
      [17.5, 12],
    ]);
    expect(stalls(h)[0]?.sessions).toBe(5);
    expect(stalls(h, { since: { bench: at(10, 20) } })).toEqual([]);
    expect(stalls(h, { since: { row: at(10, 20) } })).toHaveLength(1);
  });
});

describe('stallLine and the M5b N1 "drop" (one line each)', () => {
  it('both show for the same exercise, as separate lines', () => {
    // Below the rep range twice running at 20 kg → N1; three sessions without a gain → stall.
    const h = series('curl', 'b', [
      [20, 7],
      [20, 7],
      [20, 7],
    ]);
    const stall = stalls(h)[0];
    if (!stall) throw new Error('expected a stall');
    const lastSets = h.sets.filter((l) => l.sessionId === h.sessions[1]?.sessionId);
    const todaySets = h.sets.filter((l) => l.sessionId === h.sessions[2]?.sessionId);
    const day = must(PROGRAM.days[1]);
    const s: SessionState = {
      sessionId: must(h.sessions[2]).sessionId,
      day,
      startedAt: 0,
      endedAt: null,
      phase: 'rest',
      exIndex: 1,
      setIndex: 0,
      reps: 8,
      partials: 0,
      focusCues: null,
      weightKg: 0,
      setStartedAt: 0,
      lastRestTakenSec: 0,
      restTargetSec: 90,
      restAccumMs: 0,
      restRunningSince: 0,
      paused: false,
      logs: [...todaySets, { ...must(todaySets[1]), setIndex: 2 }],
      skipped: [],
      restOverruns: 0,
      unit: 'kg',
      lastWeightKg: {},
    };
    const n1 = nextTimeAdvice(s, 'curl', lastSets, name);
    expect(n1?.rule).toBe('N1');
    const line = stallLine(stall, name);
    expect(line).not.toBe(n1?.text);
    expect(line).toContain('Dumbbell Bicep Curl');
    expect(line.split('\n')).toHaveLength(1);
    expect(wordCount(line)).toBeLessThanOrEqual(12);
    expect(
      wordCount(stallLine(stall, () => 'Dumbbell Seated One-Leg Calf Raise')),
    ).toBeLessThanOrEqual(12);
  });
});

// ---------- proposeStallFix ----------

const MON = '2026-11-09';
const st = (): TrainerState => ({
  ...seedPlan(PROGRAM),
  version: 2,
  schedule: { rotation: ['a', 'b', 'c', 'd'], restWeekdays: [0] },
});
const stallOf = (exerciseId: string, weightKg: number, reps = 8): Stall => ({
  exerciseId,
  sessions: 3,
  top: { weightKg, reps },
  bodyweight: weightKg <= 0,
  options: weightKg <= 0 ? ['addSet'] : ['lighter', 'addSet'],
});
function ok(r: StallFixResult): Proposal {
  if (!r.ok) throw new Error(`expected a proposal, got ${r.reason}`);
  return r.proposal;
}
const BANNED = [...ADVICE_BANNED_WORDS, 'strain', 'sprain', 'tear', 'injury', 'doctor'];
function expectCleanCopy(p: Proposal) {
  const texts = [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])];
  for (const t of texts) for (const w of BANNED) expect(t.toLowerCase()).not.toContain(w);
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
}
const planEx = (s: TrainerState, dayId: string, exerciseId: string) =>
  s.plan.days.find((d) => d.id === dayId)?.exercises.find((e) => e.exerciseId === exerciseId);

describe('proposeStallFix: lighter', () => {
  it('−10% snapped down to the kg step, rep top +2, on every plan day with the exercise', () => {
    const state = st();
    const p = ok(
      proposeStallFix(state, [], MON, stallOf('legcurl', 20), 'lighter', { unit: 'kg', name }),
    );
    expect(p.action).toBe('stall');
    expect(p.scope).toBe('plan');
    expect(p.baseVersion).toBe(2);
    expect(planEx(p.next, 'c', 'legcurl')).toMatchObject({
      startWeightKg: 17.5,
      targetReps: [8, 14],
    });
    expect(planEx(p.next, 'd', 'legcurl')).toMatchObject({
      startWeightKg: 17.5,
      targetReps: [10, 14],
    });
    expect(planEx(p.next, 'c', 'squat')).toEqual(planEx(state, 'c', 'squat'));
    expect(p.lines.length).toBeGreaterThan(0);
    expect(p.lines[0]?.before).toContain('20 kg');
    expect(p.lines[0]?.after).toContain('17.5 kg');
    expect(p.why).toContain('3 sessions');
    expectCleanCopy(p);
  });

  it('the next session with it starts at the lighter weight (it beats last time)', () => {
    const state = st();
    const p = ok(
      proposeStallFix(state, [], MON, stallOf('legcurl', 20), 'lighter', { unit: 'kg', name }),
    );
    // Mon a, Tue b, Wed c: the first day with leg curls.
    expect(p.next.overrides).toHaveLength(1);
    const o = p.next.overrides[0];
    expect(o?.date).toBe('2026-11-11');
    expect(o?.dayId).toBe('c');
    const r = applyProposal(state, p, at(11, 9, 9), 'chip');
    if (!r.ok) throw new Error(r.reason);
    const eff = effectiveDay(r.state, [], '2026-11-11');
    const row = eff.day?.exercises.find((e) => e.exerciseId === 'legcurl');
    expect(row).toMatchObject({ weightKgToday: 17.5, targetReps: [8, 14], adjusted: 'lighter' });
    expect(eff.day?.exercises.find((e) => e.exerciseId === 'squat')?.weightKgToday).toBeUndefined();
    // The day after is plain again.
    expect(effectiveDay(r.state, [], '2026-11-12').adjusted).toBeNull();
  });

  it('lb: 35 lb → 30 lb (not 31.5)', () => {
    const p = ok(
      proposeStallFix(st(), [], MON, stallOf('bench', fromUnit(35, 'lb')), 'lighter', {
        unit: 'lb',
        name,
      }),
    );
    expect(planEx(p.next, 'a', 'bench')?.startWeightKg).toBeCloseTo(fromUnit(30, 'lb'), 9);
    expect(p.lines[0]?.after).toContain('30 lb');
  });

  it('kg: 12.5 → 10 (11.25 snapped down)', () => {
    const p = ok(
      proposeStallFix(st(), [], MON, stallOf('bench', 12.5), 'lighter', { unit: 'kg', name }),
    );
    expect(planEx(p.next, 'a', 'bench')?.startWeightKg).toBe(10);
  });

  it('already at the lightest step → no proposal', () => {
    const r = proposeStallFix(st(), [], MON, stallOf('bench', 2.5), 'lighter', {
      unit: 'kg',
      name,
    });
    expect(r).toMatchObject({ ok: false, reason: 'tooLight' });
  });

  it('bodyweight → no "lighter" proposal', () => {
    const r = proposeStallFix(st(), [], MON, stallOf('pushup', 0, 15), 'lighter', {
      unit: 'kg',
      name,
    });
    expect(r).toMatchObject({ ok: false, reason: 'bodyweight' });
  });

  it('an exercise not in the plan → no proposal', () => {
    const r = proposeStallFix(st(), [], MON, stallOf('nope', 20), 'lighter', { unit: 'kg', name });
    expect(r).toMatchObject({ ok: false, reason: 'notInPlan' });
  });

  it('keeps an adjust override already on that date and only lightens this exercise', () => {
    const state = st();
    state.overrides = [
      {
        date: '2026-11-11',
        adjust: { kind: 'avoidArea', area: 'arms', exercises: [pe('legcurl', { sets: 2 })] },
      },
    ];
    const p = ok(
      proposeStallFix(state, [], MON, stallOf('legcurl', 20), 'lighter', { unit: 'kg', name }),
    );
    expect(p.next.overrides).toHaveLength(1);
    expect(p.next.overrides[0]?.adjust).toMatchObject({
      kind: 'avoidArea',
      exercises: [{ exerciseId: 'legcurl', sets: 2, weightKgToday: 17.5 }],
    });
  });

  it('does not change the input state', () => {
    const state = st();
    const copy = structuredClone(state);
    proposeStallFix(state, [], MON, stallOf('legcurl', 20), 'lighter', { unit: 'kg', name });
    expect(state).toEqual(copy);
  });
});

describe('proposeStallFix: +1 set', () => {
  it('adds a set on every plan day with the exercise', () => {
    const p = ok(
      proposeStallFix(st(), [], MON, stallOf('legcurl', 20), 'addSet', { unit: 'kg', name }),
    );
    expect(planEx(p.next, 'c', 'legcurl')?.sets).toBe(4);
    expect(planEx(p.next, 'd', 'legcurl')?.sets).toBe(4);
    expect(p.next.overrides).toEqual([]);
    expect(p.lines[0]).toMatchObject({
      before: expect.stringContaining('3 sets'),
      after: expect.stringContaining('4 sets'),
    });
    expectCleanCopy(p);
  });

  it('bodyweight exercises can add a set', () => {
    const p = ok(
      proposeStallFix(st(), [], MON, stallOf('pushup', 0, 15), 'addSet', { unit: 'kg', name }),
    );
    expect(planEx(p.next, 'a', 'pushup')?.sets).toBe(4);
    expect(p.why).toContain('15 reps');
  });

  it('maximum 5 sets', () => {
    const r = proposeStallFix(st(), [], MON, stallOf('press', 15), 'addSet', { unit: 'kg', name });
    expect(r).toMatchObject({ ok: false, reason: 'maxSets' });
    if (!r.ok) expect(wordCount(r.reply)).toBeLessThanOrEqual(12);
  });
});

describe('warm-up sets are excluded (M12 1b)', () => {
  const warm = (h: Hist, sessionIndex: number, weightKg: number, reps: number): Hist => {
    const s = must(h.sessions[sessionIndex]);
    const set: SetLog = {
      sessionId: s.sessionId,
      exerciseId: 'bench',
      setIndex: 0,
      reps,
      weightKg,
      restTakenSec: 0,
      warmup: true,
      startedAt: s.startedAt - 60_000,
      endedAt: s.startedAt - 30_000,
    };
    return { ...h, sets: [...h.sets, set] };
  };

  it('a heavier warm-up is not a gain: the stall still shows, with the working top set', () => {
    const base = series('bench', 'a', [
      [20, 10],
      [20, 10],
      [20, 9],
    ]);
    expect(stalls(base)).toHaveLength(1);
    // A warm-up logged heavier than the working sets in the last session must not reset the run.
    const h = warm(base, 2, 25, 4);
    const [st] = stalls(h);
    expect(st?.sessions).toBe(3);
    expect(st?.top).toEqual({ weightKg: 20, reps: 10 });
  });

  it('a warm-up in the first session does not set a best that hides real gains', () => {
    const base = series('bench', 'a', [
      [20, 8],
      [20, 9],
      [20, 10],
    ]);
    expect(stalls(warm(base, 0, 30, 8))).toEqual([]);
  });
});
