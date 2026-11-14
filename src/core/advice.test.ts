import { describe, expect, it } from 'vitest';
import {
  ADVICE_BANNED_WORDS,
  type Advice,
  adviceSpeakDue,
  afterSetAdvice,
  coachSummary,
  nextTimeAdvice,
  wordCount,
} from './advice';
import type { SessionState } from './session';
import type { ProgramDay, SetLog } from './types';
import { fromUnit, toUnit, type Unit } from './units';

// Made-up plan; numbers chosen to exercise the rules, not anyone's real training.
const day: ProgramDay = {
  id: 'test-day',
  name: 'Test day',
  exercises: [
    { exerciseId: 'bench', sets: 3, targetReps: [8, 8], restSec: 90, tracking: 'manual' },
    { exerciseId: 'curl', sets: 3, targetReps: [8, 12], restSec: 60, tracking: 'pose' },
    { exerciseId: 'pushup', sets: 2, targetReps: [10, 15], restSec: 60, tracking: 'manual' },
    { exerciseId: 'raise', sets: 3, targetReps: [12, 15], restSec: 45, tracking: 'pose' },
  ],
};

const NAMES: Record<string, string> = {
  bench: 'Dumbbell Bench Press',
  curl: 'Dumbbell Bicep Curl',
  pushup: 'Pushups',
  raise: 'Side Lateral Raise',
};
const name = (id: string) => NAMES[id] ?? id;
const LONGEST = 'Dumbbell Seated One-Leg Calf Raise';
const longName = () => LONGEST;

const lb = (v: number) => fromUnit(v, 'lb');

let t = 0;
function lg(
  exerciseId: string,
  reps: number,
  weightKg: number,
  opts: { partials?: number; rest?: number } = {},
): SetLog {
  t += 100_000;
  return {
    sessionId: 's1',
    exerciseId,
    setIndex: 0,
    reps,
    ...(opts.partials ? { partials: opts.partials } : {}),
    weightKg,
    restTakenSec: opts.rest ?? 60,
    startedAt: t,
    endedAt: t + 30_000,
  };
}

function state(logs: SetLog[], unit: Unit = 'kg'): SessionState {
  // setIndex per exercise, as the reducer would log it.
  const seen: Record<string, number> = {};
  const fixed = logs.map((l) => {
    const i = seen[l.exerciseId] ?? 0;
    seen[l.exerciseId] = i + 1;
    return { ...l, setIndex: i };
  });
  return {
    sessionId: 's1',
    day,
    startedAt: 0,
    endedAt: null,
    phase: 'rest',
    exIndex: 0,
    setIndex: 0,
    reps: 8,
    partials: 0,
    weightKg: 0,
    setStartedAt: 0,
    lastRestTakenSec: 0,
    restTargetSec: 90,
    restAccumMs: 0,
    restRunningSince: 0,
    paused: false,
    logs: fixed,
    skipped: [],
    restOverruns: 0,
    unit,
    lastWeightKg: {},
  };
}

const rule = (a: Advice | null) => a?.rule ?? null;

describe('afterSetAdvice: no data', () => {
  it('gives no advice with no logs', () => {
    expect(afterSetAdvice(state([]), name)).toBeNull();
  });

  it('gives no advice for an exercise not in the day', () => {
    expect(afterSetAdvice(state([lg('other', 8, 20)]), name)).toBeNull();
  });

  it('gives no advice for a plain set in range (otherwise)', () => {
    expect(afterSetAdvice(state([lg('curl', 10, 10)]), name)).toBeNull();
  });
});

describe('afterSetAdvice A1: partials ≥ 2 on this set', () => {
  it('fires with 2 partials', () => {
    const a = afterSetAdvice(state([lg('curl', 10, 10, { partials: 2 })]), name);
    expect(rule(a)).toBe('A1');
    expect(a?.text).toBe('Keep the weight. Focus on full range.');
    expect(a?.apply).toBeUndefined();
    expect(a?.exerciseId).toBe('curl');
  });

  it('does not fire with 1 partial', () => {
    expect(rule(afterSetAdvice(state([lg('curl', 10, 10, { partials: 1 })]), name))).toBeNull();
  });

  it('only looks at this set, not earlier sets', () => {
    const s = state([lg('curl', 10, 10, { partials: 3 }), lg('curl', 10, 10)]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('wins over A2 (below min with partials)', () => {
    expect(rule(afterSetAdvice(state([lg('curl', 6, 10, { partials: 2 })]), name))).toBe('A1');
  });

  it('bodyweight drops the weight wording', () => {
    const a = afterSetAdvice(state([lg('pushup', 12, 0, { partials: 2 })]), name);
    expect(rule(a)).toBe('A1');
    expect(a?.text).toBe('Focus on full range.');
  });
});

describe('afterSetAdvice A2: reps < min', () => {
  it('fires below min', () => {
    const a = afterSetAdvice(state([lg('curl', 7, 10)]), name);
    expect(rule(a)).toBe('A2');
    expect(a?.text).toBe('Keep the weight. Aim for 8 reps.');
    expect(a?.say).toBe('Keep the weight. Aim for 8 reps.');
  });

  it('does not fire at min', () => {
    expect(rule(afterSetAdvice(state([lg('curl', 8, 10)]), name))).toBeNull();
  });

  it('wins over A5', () => {
    const s = state([
      lg('curl', 10, 10),
      lg('curl', 10, 10, { rest: 200 }),
      lg('raise', 5, 4, { rest: 200 }),
    ]);
    expect(rule(afterSetAdvice(s, name))).toBe('A2');
  });

  it('bodyweight: reps only', () => {
    const a = afterSetAdvice(state([lg('pushup', 6, 0)]), name);
    expect(a?.text).toBe('Aim for 10 reps.');
  });
});

describe('afterSetAdvice A3: ≥ 2 clean sets at the top', () => {
  it('needs at least 2 sets (one is the plan, not over-performance)', () => {
    expect(rule(afterSetAdvice(state([lg('bench', 8, 20)]), name))).toBeNull();
  });

  it('fires on the second clean set at the top, kg step 2.5 with apply', () => {
    const a = afterSetAdvice(state([lg('bench', 8, 20), lg('bench', 8, 20)]), name);
    expect(rule(a)).toBe('A3');
    expect(a?.text).toBe('Strong set. Try +2.5 kg next set.');
    expect(a?.say).toBe('Strong set. Try plus 2.5 kilos next set.');
    expect(a?.apply?.weightKg).toBeCloseTo(22.5, 9);
    expect(a?.why).toContain('8, 8');
  });

  it('does not fire if any set was below max', () => {
    const s = state([lg('curl', 11, 10), lg('curl', 12, 10)]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('does not fire if any set had a partial', () => {
    const s = state([lg('bench', 8, 20, { partials: 1 }), lg('bench', 8, 20)]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('lb mode: 35 lb stored as odd kg → "+5 lb", apply is 40 lb exactly', () => {
    const s = state([lg('bench', 8, lb(35)), lg('bench', 8, lb(35))], 'lb');
    const a = afterSetAdvice(s, name);
    expect(rule(a)).toBe('A3');
    expect(a?.text).toBe('Strong set. Try +5 lb next set.');
    expect(a?.say).toBe('Strong set. Try plus 5 pounds next set.');
    expect(a?.apply?.weightKg).toBeCloseTo(lb(40), 9);
    expect(toUnit(a?.apply?.weightKg ?? 0, 'lb')).toBeCloseTo(40, 9);
  });

  it('snaps an off-grid weight to the display step', () => {
    const s = state([lg('bench', 8, 21), lg('bench', 8, 21)]);
    // 21 + 2.5 = 23.5 → nearest 2.5 step is 22.5
    expect(afterSetAdvice(s, name)?.apply?.weightKg).toBeCloseTo(22.5, 9);
  });

  it('25% guard: 5 lb on 15 lb is too big a jump → no A3', () => {
    const s = state([lg('raise', 15, lb(15)), lg('raise', 15, lb(15))], 'lb');
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('25% guard: 5 lb on 20 lb is exactly 25% → allowed', () => {
    const s = state([lg('raise', 15, lb(20)), lg('raise', 15, lb(20))], 'lb');
    const a = afterSetAdvice(s, name);
    expect(rule(a)).toBe('A3');
    expect(toUnit(a?.apply?.weightKg ?? 0, 'lb')).toBeCloseTo(25, 9);
  });

  it('25% guard in kg: 2.5 on 10 kg allowed, on 7.5 kg not', () => {
    expect(rule(afterSetAdvice(state([lg('raise', 15, 10), lg('raise', 15, 10)]), name))).toBe(
      'A3',
    );
    expect(
      rule(afterSetAdvice(state([lg('raise', 15, 7.5), lg('raise', 15, 7.5)]), name)),
    ).toBeNull();
  });

  it('wins over A5', () => {
    const s = state([
      lg('curl', 8, 10),
      lg('bench', 8, 20, { rest: 200 }),
      lg('bench', 8, 20, { rest: 200 }),
    ]);
    expect(rule(afterSetAdvice(s, name))).toBe('A3');
  });
});

describe('afterSetAdvice A4: bodyweight at the top', () => {
  it('suggests one more rep, never an apply', () => {
    // One set at the top is the plan, not over-performance.
    const s = state([lg('pushup', 15, 0)]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
    const a = afterSetAdvice(state([lg('raise', 15, 0), lg('raise', 16, 0)]), name);
    expect(rule(a)).toBe('A4');
    expect(a?.text).toBe('Strong set. Try 17 reps next set.');
    expect(a?.apply).toBeUndefined();
  });
});

describe('afterSetAdvice A5: rest ran long', () => {
  it('fires when this set and another overran (uses the previous log’s exercise restSec)', () => {
    // bench rest 90: 121 > 120 overran. curl after bench: rest compared to bench's 90.
    const s = state([
      lg('bench', 8, 20),
      lg('bench', 7, 20, { rest: 121 }),
      lg('bench', 8, 20),
      lg('curl', 10, 10, { rest: 121 }),
    ]);
    // bench set 2 is < min, but this set is curl; rule A2 not on this set.
    const a = afterSetAdvice(s, name);
    expect(rule(a)).toBe('A5');
    expect(a?.text).toBe('Rest ran long. Start when the timer says go.');
  });

  it('uses the previous log’s exercise restSec, not this exercise’s', () => {
    // raise restSec 45 → 91 would overrun against raise; previous log is bench (90) → 91 is fine.
    const s = state([
      lg('curl', 10, 10),
      lg('curl', 10, 10, { rest: 200 }),
      lg('bench', 8, 20),
      lg('raise', 13, 5, { rest: 91 }),
    ]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
    // …and 121 against bench's 90 does overrun.
    const s2 = state([
      lg('curl', 10, 10),
      lg('curl', 10, 10, { rest: 200 }),
      lg('bench', 8, 20),
      lg('raise', 13, 5, { rest: 121 }),
    ]);
    expect(rule(afterSetAdvice(s2, name))).toBe('A5');
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('exactly target + 30 is not an overrun', () => {
    const s = state([
      lg('curl', 10, 10),
      lg('curl', 10, 10, { rest: 200 }),
      lg('raise', 13, 5),
      lg('raise', 13, 5, { rest: 75 }),
    ]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('needs ≥ 2 overruns including this one', () => {
    const s = state([lg('curl', 10, 10), lg('curl', 10, 10, { rest: 200 })]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('does not fire when this set did not overrun', () => {
    const s = state([
      lg('curl', 10, 10),
      lg('curl', 10, 10, { rest: 200 }),
      lg('raise', 13, 5, { rest: 200 }),
      lg('raise', 13, 5),
    ]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });

  it('the first set of the workout never overran', () => {
    const s = state([lg('curl', 10, 10, { rest: 999 }), lg('curl', 10, 10, { rest: 200 })]);
    expect(rule(afterSetAdvice(s, name))).toBeNull();
  });
});

describe('afterSetAdvice: final set gives the next-time rule', () => {
  it('final planned set → N rule, not A3', () => {
    const s = state([lg('bench', 8, 20), lg('bench', 8, 20), lg('bench', 8, 20)]);
    const a = afterSetAdvice(s, name);
    expect(rule(a)).toBe('N3');
    expect(a?.text).toBe('Next time on Dumbbell Bench Press: +2.5 kg.');
    expect(a?.apply).toBeUndefined();
  });

  it('final set with partials → N rule, not A1', () => {
    const s = state([lg('pushup', 12, 0), lg('pushup', 12, 0, { partials: 2 })]);
    expect(rule(afterSetAdvice(s, name))).toBe('N4');
  });

  it('uses last session sets for N1 when given', () => {
    const s = state([lg('pushup', 12, 0), lg('pushup', 12, 0)]);
    expect(rule(afterSetAdvice(s, name, {}))).toBe('N5');
    const s2 = state([lg('curl', 10, 10), lg('curl', 10, 10), lg('curl', 7, 10)]);
    const last = { curl: [lg('curl', 6, 10)] };
    expect(rule(afterSetAdvice(s2, name, last))).toBe('N1');
  });
});

describe('nextTimeAdvice', () => {
  const nt = (
    logs: SetLog[],
    last: SetLog[] = [],
    unit: Unit = 'kg',
    id = logs[0]?.exerciseId ?? 'curl',
  ) => nextTimeAdvice(state(logs, unit), id, last, name);

  it('no sets today → null', () => {
    expect(nt([], [], 'kg', 'curl')).toBeNull();
  });

  it('N1: below min twice running at ≥ this weight → drop a step', () => {
    const a = nt([lg('curl', 10, 10), lg('curl', 7, 10)], [lg('curl', 6, 10)]);
    expect(rule(a)).toBe('N1');
    expect(a?.text).toBe('Next time on Dumbbell Bicep Curl: drop to 7.5 kg.');
    expect(a?.say).toBe('Next time on Dumbbell Bicep Curl: drop to 7.5 kilos.');
    expect(a?.apply).toBeUndefined();
  });

  it('N1 false edges: last was at a lower weight, or last was fine → N2', () => {
    expect(rule(nt([lg('curl', 7, 10)], [lg('curl', 6, 7.5)]))).toBe('N2');
    expect(rule(nt([lg('curl', 7, 10)], [lg('curl', 8, 10)]))).toBe('N2');
    expect(rule(nt([lg('curl', 7, 10)], []))).toBe('N2');
  });

  it('N1 false edge: w − step would be 0 → N2', () => {
    expect(rule(nt([lg('curl', 7, 2.5)], [lg('curl', 6, 2.5)]))).toBe('N2');
  });

  it('N1 compares in the display unit (lb weights stored as odd kg)', () => {
    const a = nt([lg('curl', 7, lb(25))], [lg('curl', 6, lb(25))], 'lb');
    expect(rule(a)).toBe('N1');
    expect(a?.text).toBe('Next time on Dumbbell Bicep Curl: drop to 20 lb.');
  });

  it('N1 never for bodyweight', () => {
    const a = nt([lg('pushup', 7, 0)], [lg('pushup', 6, 0)]);
    expect(rule(a)).toBe('N2');
    expect(a?.text).toBe('Next time on Pushups: aim for 10 reps.');
  });

  it('N2: some set below min → repeat the weight', () => {
    const a = nt([lg('curl', 12, 10), lg('curl', 7, 12.5)]);
    expect(rule(a)).toBe('N2');
    expect(a?.text).toBe('Next time on Dumbbell Bicep Curl: repeat 12.5 kg.');
    expect(a?.say).toBe('Next time on Dumbbell Bicep Curl: repeat 12.5 kilos.');
  });

  it('N2 wins over N4 (partials)', () => {
    expect(rule(nt([lg('curl', 7, 10, { partials: 3 })]))).toBe('N2');
  });

  it('N3: all planned sets at the top and clean → +step', () => {
    const a = nt([lg('bench', 8, 20), lg('bench', 8, 20), lg('bench', 8, 20)]);
    expect(rule(a)).toBe('N3');
    expect(a?.say).toBe('Next time on Dumbbell Bench Press: plus 2.5 kilos.');
  });

  it('N3 lb', () => {
    const a = nt(
      [lg('bench', 8, lb(35)), lg('bench', 8, lb(35)), lg('bench', 8, lb(35))],
      [],
      'lb',
    );
    expect(a?.text).toBe('Next time on Dumbbell Bench Press: +5 lb.');
    expect(a?.say).toBe('Next time on Dumbbell Bench Press: plus 5 pounds.');
  });

  it('N3 too big a jump → same weight, more reps', () => {
    const logs = [lg('raise', 15, lb(15)), lg('raise', 15, lb(15)), lg('raise', 15, lb(15))];
    const a = nt(logs, [], 'lb');
    expect(rule(a)).toBe('N3');
    expect(a?.text).toBe('Next time on Side Lateral Raise: 15 lb, more reps.');
    expect(a?.say).toBe('Next time on Side Lateral Raise: 15 pounds, more reps.');
  });

  it('N3 exactly 25% → +5 lb', () => {
    const logs = [lg('raise', 15, lb(20)), lg('raise', 15, lb(20)), lg('raise', 15, lb(20))];
    expect(nt(logs, [], 'lb')?.text).toBe('Next time on Side Lateral Raise: +5 lb.');
  });

  it('N3 bodyweight → +1 rep per set', () => {
    const a = nt([lg('pushup', 15, 0), lg('pushup', 15, 0)]);
    expect(rule(a)).toBe('N3');
    expect(a?.text).toBe('Next time on Pushups: +1 rep per set.');
    expect(a?.say).toBe('Next time, Pushups: plus one rep per set.');
    expect(a?.apply).toBeUndefined();
  });

  it('N3 false edge: one partial is not clean; < 2 partials skips N4 → N6', () => {
    const a = nt([lg('bench', 8, 20), lg('bench', 8, 20, { partials: 1 }), lg('bench', 8, 20)]);
    expect(rule(a)).toBe('N6');
  });

  it('N4: total partials ≥ 2 across sets', () => {
    const a = nt([lg('curl', 12, 10, { partials: 1 }), lg('curl', 12, 10, { partials: 1 })]);
    expect(rule(a)).toBe('N4');
    expect(a?.text).toBe('Next time on Dumbbell Bicep Curl: same weight, full range.');
  });

  it('N5: some set below max', () => {
    const a = nt([lg('curl', 12, 10), lg('curl', 10, 10), lg('curl', 9, 10)]);
    expect(rule(a)).toBe('N5');
    expect(a?.text).toBe('Next time on Dumbbell Bicep Curl: same weight, 12 reps.');
  });

  it('N6: all at the top but sets were skipped', () => {
    const a = nt([lg('bench', 8, 20), lg('bench', 8, 20)]);
    expect(rule(a)).toBe('N6');
    expect(a?.text).toBe('Next time on Dumbbell Bench Press: repeat 20 kg.');
  });

  it('uses the last set’s weight as w', () => {
    const a = nt([lg('bench', 8, 20), lg('bench', 8, 20), lg('bench', 8, 22.5)]);
    expect(a?.why).toContain('22.5');
  });

  it('bodyweight never has an apply in any rule', () => {
    const cases = [
      [lg('pushup', 6, 0)],
      [lg('pushup', 15, 0), lg('pushup', 15, 0)],
      [lg('pushup', 12, 0, { partials: 2 })],
      [lg('pushup', 12, 0)],
    ];
    for (const c of cases) {
      const a = nt(c);
      expect(a).not.toBeNull();
      expect(a?.apply).toBeUndefined();
      expect(a?.text).not.toMatch(/kg|lb/);
    }
  });
});

describe('coachSummary', () => {
  it('no logs → empty', () => {
    expect(coachSummary(state([]), {}, name)).toEqual([]);
  });

  it('one entry per exercise with ≥ 1 set, in day order', () => {
    const s = state([lg('curl', 10, 10), lg('bench', 8, 20), lg('curl', 10, 10)]);
    const out = coachSummary(s, {}, name);
    expect(out.map((e) => e.exerciseId)).toEqual(['bench', 'curl']);
    expect(out[0]?.next?.exerciseId).toBe('bench');
    expect(out.every((e) => e.progress === null)).toBe(true);
  });

  it('P1: heavier than last time', () => {
    const s = state([lg('bench', 8, 22.5), lg('bench', 8, 22.5)]);
    const [e] = coachSummary(s, { bench: [lg('bench', 8, 20)] }, name);
    expect(e?.progress).toBe('Dumbbell Bench Press: 22.5 kg, up from 20 kg.');
  });

  it('P1 in lb: 35 lb up from 30 lb', () => {
    const s = state([lg('bench', 8, lb(35))], 'lb');
    const [e] = coachSummary(s, { bench: [lg('bench', 8, lb(30))] }, name);
    expect(e?.progress).toBe('Dumbbell Bench Press: 35 lb, up from 30 lb.');
  });

  it('P1 needs ≥ half a step: tiny kg drift is not a gain', () => {
    const s = state([lg('bench', 8, 20.5)]);
    const [e] = coachSummary(s, { bench: [lg('bench', 8, 20)] }, name);
    expect(e?.progress).toBeNull();
  });

  it('P2: same weight, more total reps', () => {
    const s = state([lg('curl', 12, 10), lg('curl', 11, 10)]);
    const [e] = coachSummary(s, { curl: [lg('curl', 10, 10), lg('curl', 10, 10)] }, name);
    expect(e?.progress).toBe('Dumbbell Bicep Curl: +3 reps vs last time.');
  });

  it('P2 false edges: lighter today, or no more reps', () => {
    const lighter = state([lg('curl', 12, 7.5), lg('curl', 12, 7.5)]);
    expect(coachSummary(lighter, { curl: [lg('curl', 10, 10)] }, name)[0]?.progress).toBeNull();
    const same = state([lg('curl', 10, 10)]);
    expect(coachSummary(same, { curl: [lg('curl', 10, 10)] }, name)[0]?.progress).toBeNull();
  });

  it('P1 wins over P2', () => {
    const s = state([lg('curl', 12, 12.5), lg('curl', 12, 12.5)]);
    const [e] = coachSummary(s, { curl: [lg('curl', 8, 10)] }, name);
    expect(e?.progress).toBe('Dumbbell Bicep Curl: 12.5 kg, up from 10 kg.');
  });

  it('no last → no progress', () => {
    const s = state([lg('curl', 12, 12.5)]);
    expect(coachSummary(s, { curl: [] }, name)[0]?.progress).toBeNull();
  });
});

describe('wording', () => {
  const BANNED = /\b(pain|injur\w*|hurt\w*|damage\w*|safe\w*|risk\w*)\b/i;

  it('exports the banned list', () => {
    expect(ADVICE_BANNED_WORDS).toEqual(
      expect.arrayContaining(['pain', 'hurt', 'damage', 'safe', 'risk']),
    );
  });

  it('every text and say is ≤ 12 words with the longest name and has no banned word', () => {
    const all: { text: string; say: string; why: string }[] = [];
    const progress: string[] = [];
    for (const unit of ['kg', 'lb'] as Unit[]) {
      const w = unit === 'kg' ? 102.5 : lb(225);
      const tiny = unit === 'kg' ? 7.5 : lb(15);
      const scenarios: SetLog[][] = [
        [lg('curl', 6, w, { partials: 2 })],
        [lg('pushup', 6, 0, { partials: 2 })],
        [lg('curl', 6, w)],
        [lg('pushup', 6, 0)],
        [lg('raise', 115, w), lg('raise', 115, w)],
        [lg('raise', 115, 0), lg('raise', 115, 0)],
        [lg('curl', 10, w), lg('curl', 10, w, { rest: 200 }), lg('raise', 13, w, { rest: 200 })],
        [lg('curl', 10, w), lg('curl', 10, w), lg('curl', 7, w)],
        [lg('curl', 12, w), lg('curl', 12, w), lg('curl', 12, w)],
        [lg('curl', 12, tiny), lg('curl', 12, tiny), lg('curl', 12, tiny)],
        [lg('pushup', 15, 0), lg('pushup', 15, 0)],
        [lg('curl', 12, w, { partials: 2 }), lg('curl', 12, w), lg('curl', 12, w)],
        [lg('curl', 9, w), lg('curl', 9, w), lg('curl', 9, w)],
        [lg('pushup', 12, 0, { partials: 2 }), lg('pushup', 11, 0)],
        [lg('pushup', 11, 0), lg('pushup', 11, 0)],
        [lg('bench', 8, w), lg('bench', 8, w)],
      ];
      const last = {
        curl: [lg('curl', 5, w)],
        raise: [lg('raise', 5, 1)],
        bench: [lg('bench', 1, 1)],
      };
      const seen = new Set<string>();
      for (const logs of scenarios) {
        const s = state(logs, unit);
        const a = afterSetAdvice(s, longName, last);
        if (a) {
          all.push(a);
          seen.add(a.rule);
        }
        for (const e of coachSummary(s, last, longName)) {
          if (e.next) {
            all.push(e.next);
            seen.add(e.next.rule);
          }
          if (e.progress) progress.push(e.progress);
        }
      }
      // N6 via a skipped-set summary.
      const n6 = nextTimeAdvice(
        state([lg('bench', 8, w), lg('bench', 8, w)], unit),
        'bench',
        [],
        longName,
      );
      if (n6) {
        all.push(n6);
        seen.add(n6.rule);
      }
      expect([...seen].sort()).toEqual(
        ['A1', 'A2', 'A3', 'A4', 'A5', 'N1', 'N2', 'N3', 'N4', 'N5', 'N6'].sort(),
      );
    }
    expect(progress.length).toBeGreaterThan(0);
    for (const a of all) {
      expect(wordCount(a.text), a.text).toBeLessThanOrEqual(12);
      expect(wordCount(a.say), a.say).toBeLessThanOrEqual(12);
      expect(a.text).not.toMatch(BANNED);
      expect(a.say).not.toMatch(BANNED);
      expect(a.why).not.toMatch(BANNED);
      expect(a.why.length).toBeGreaterThan(0);
      expect(a.say).not.toMatch(/\b(kg|lb)\b|\+/);
    }
    for (const p of progress) {
      expect(wordCount(p), p).toBeLessThanOrEqual(12);
      expect(p).not.toMatch(BANNED);
    }
  });

  it('wordCount splits on whitespace (hyphenated names are one word)', () => {
    expect(wordCount(`Next time on ${LONGEST}: +5 lb.`)).toBe(10);
  });
});

describe('adviceSpeakDue', () => {
  it('fires when the rest clock crosses 2 s', () => {
    expect(adviceSpeakDue(1900, 2000, 90)).toBe(true);
    expect(adviceSpeakDue(0, 2500, 90)).toBe(true);
  });

  it('does not fire before 2 s or after it was already crossed', () => {
    expect(adviceSpeakDue(1000, 1999, 90)).toBe(false);
    expect(adviceSpeakDue(2000, 2250, 90)).toBe(false);
  });

  it('is skipped when the tab only notices after 6 s', () => {
    expect(adviceSpeakDue(1500, 6000, 90)).toBe(true);
    expect(adviceSpeakDue(1500, 6001, 90)).toBe(false);
  });

  it('is skipped when the rest target is < 17 s', () => {
    expect(adviceSpeakDue(1900, 2100, 17)).toBe(true);
    expect(adviceSpeakDue(1900, 2100, 16)).toBe(false);
  });
});
