import { describe, expect, it } from 'vitest';
import programJson from '../../data/program.json';
import { wordCount } from '../advice';
import { FIXTURE_PROGRAM, fixtureState } from '../testkit/progressFixture';
import { trainerCatalog } from '../testkit/trainerCatalog';
import type {
  DayOverride,
  FocusBlock,
  PlanChange,
  Program,
  Proposal,
  ProposalAction,
  SetLog,
  TrainerState,
} from '../types';
import { DELOAD, proposeDeload, type ActionContext, type ActionResult } from './actions/lighter';
import { applyProposal, undoLast } from './changes';
import { blockEnd } from './focusBlock';
import {
  deloadSuggested,
  hardWeeksInARow,
  NEXT_BLOCK_RULES,
  nextBlockOffers,
  nextGroup,
  proposeNextBlock,
  type DeloadSession,
  type NextBlockArgs,
} from './nextBlock';
import { addDate, effectiveDay, localDate, seedPlan, type PlanSession } from './plan';
import { checkCopy, SPOKEN_MAX_WORDS } from './replies';

// Made-up history only (the repo is public). 2026-11-16 is a Monday.
const TODAY = '2026-11-16';
const NOW = new Date(2026, 10, 16, 9, 0).getTime();
const at = (date: string, h = 18): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h).getTime();
};
const ok = (r: ActionResult): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason} ${r.reply}`);
  return r.proposal;
};
const expectClean = (p: Proposal) => {
  for (const t of [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])])
    expect(checkCopy(t).hits, t).toEqual([]);
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
};

describe('next group order (data)', () => {
  it('every body area is in the order once, and the order wraps', () => {
    expect([...NEXT_BLOCK_RULES.groupOrder].sort()).toEqual(
      ['arms', 'back', 'chest', 'core', 'legs', 'shoulders'].sort(),
    );
    const order = NEXT_BLOCK_RULES.groupOrder;
    order.forEach((g, i) => expect(nextGroup(g)).toBe(order[(i + 1) % order.length]));
    expect(nextGroup('chest')).toBe('back');
  });

  it('the block after one: the same group, or the next in the order, after a lighter week', () => {
    const block = { group: 'chest' as const, weeks: 3, weekdays: [1, 3, 5] };
    expect(nextBlockOffers(block)).toEqual([
      {
        label: 'Lighter week, then Chest',
        args: { group: 'chest', weeks: 3, weekdays: [1, 3, 5], lighterWeek: true },
      },
      {
        label: 'Lighter week, then Back',
        args: { group: 'back', weeks: 3, weekdays: [1, 3, 5], lighterWeek: true },
      },
    ]);
    // The args are copies: changing them doesn't change the block.
    const weekdays = [1, 3, 5];
    const [first] = nextBlockOffers({ group: 'legs', weeks: 2, weekdays });
    first?.args.weekdays.push(6);
    expect(weekdays).toEqual([1, 3, 5]);
  });
});

describe('proposeNextBlock', () => {
  const program = programJson as Program;
  const CATALOG = trainerCatalog();
  const state = (over: Partial<TrainerState> = {}): TrainerState => ({
    ...seedPlan(program),
    version: 5,
    ...over,
  });
  const done = (dayId: string, date: string): PlanSession => ({
    dayId,
    startedAt: at(date),
    endedAt: at(date) + 3_600_000,
  });
  const ctxFor = (over: Partial<ActionContext> = {}): ActionContext => ({
    state: state(),
    sessions: [done('legs-b', '2026-11-14')],
    today: TODAY,
    unit: 'kg',
    lastWeightKg: {},
    ...over,
  });
  const ARGS: NextBlockArgs = {
    group: 'chest',
    weeks: 3,
    weekdays: [1, 2, 3, 4, 5],
    lighterWeek: true,
  };
  const blockOf = (p: Proposal): FocusBlock => {
    const b = p.next.blocks?.at(-1);
    if (!b) throw new Error('no block');
    return b;
  };
  const kindOn = (s: TrainerState, date: string): string | undefined =>
    s.overrides.find((o) => o.date === date)?.adjust?.kind;

  it('one proposal: 7 lighter days by the deload rule, then the block from day 8', () => {
    const ctx = ctxFor();
    const p = ok(proposeNextBlock(ctx, ARGS, CATALOG));
    expect(p.action).toBe('focusBlock');
    expect(p.scope).toBe('dated');
    expect(p.baseVersion).toBe(5);
    expect(p.title).toBe('Lighter week, then Chest focus: 3 weeks');
    expect(p.say).toBe('Done. Lighter week, then Chest focus.');
    expectClean(p);

    // The lighter week is exactly what "Deload week" would do today.
    const deload = ok(proposeDeload(ctx));
    expect(DELOAD.days).toBe(7);
    expect(p.lines.slice(0, deload.lines.length)).toEqual(deload.lines);
    expect(p.lines).toHaveLength(deload.lines.length + 3);
    expect(p.lines.at(-1)?.after).toMatch(/lighter week$/);
    for (let i = 0; i < 7; i++) {
      const d = addDate(TODAY, i);
      expect(kindOn(p.next, d), d).toBe(kindOn(deload.next, d));
      expect(effectiveDay(p.next, ctx.sessions, d).blockId, d).toBeUndefined();
    }
    expect(deload.lines.length).toBeGreaterThan(0);
    expect(p.why).toMatch(/^First 7 days: half the sets and about 10% lighter\. Then /);

    // The block starts the day after the lighter week and keeps the asked shape.
    const b = blockOf(p);
    expect(b.startDate).toBe(addDate(TODAY, 7));
    expect(b).toMatchObject({ group: 'chest', weeks: 3, weekdays: [1, 2, 3, 4, 5] });
    expect(blockEnd(b)).toBe(addDate(TODAY, 7 + 21 - 1));
    expect(effectiveDay(p.next, ctx.sessions, addDate(TODAY, 7)).blockId).toBe(b.id);
    // Nothing is changed until Apply.
    expect(ctx.state.overrides).toEqual([]);
    expect(ctx.state.blocks ?? []).toEqual([]);
  });

  it('the next group in the order works the same way', () => {
    const p = ok(proposeNextBlock(ctxFor(), { ...ARGS, group: nextGroup('chest') }, CATALOG));
    expect(p.title).toBe('Lighter week, then Back focus: 3 weeks');
    expect(blockOf(p).group).toBe('back');
    expectClean(p);
  });

  it('Apply puts both in; Undo takes both out', () => {
    const ctx = ctxFor();
    const p = ok(proposeNextBlock(ctx, ARGS, CATALOG));
    const applied = applyProposal(ctx.state, p, NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.state.version).toBe(6);
    expect(applied.state.blocks).toHaveLength(1);
    expect(applied.state.overrides.some((o) => o.adjust?.kind === 'deload')).toBe(true);
    expect(applied.change).toMatchObject({ action: 'focusBlock', title: p.title, source: 'chip' });

    const changes: PlanChange[] = [{ ...applied.change, id: 1 }];
    const undone = undoLast(applied.state, changes, NOW + 1000, 1);
    if (!undone.ok) throw new Error(undone.reason);
    expect(undone.state.overrides).toEqual([]);
    expect(undone.state.blocks ?? []).toEqual([]);
    expect(undone.state.plan).toEqual(ctx.state.plan);
    expect(undone.state.version).toBe(7);
    // A proposal built before another change is stale.
    expect(applyProposal(applied.state, p, NOW + 2000, 'chip')).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('without the lighter week: the block alone, from today (tomorrow when today is trained)', () => {
    const args = { ...ARGS, lighterWeek: false };
    const p = ok(proposeNextBlock(ctxFor(), args, CATALOG));
    expect(p.title).toBe('Chest focus: 3 weeks');
    expect(blockOf(p).startDate).toBe(TODAY);
    expect(p.next.overrides.some((o) => o.adjust?.kind === 'deload')).toBe(false);
    const busy = ctxFor({ sessions: [done('push-a', TODAY)] });
    expect(blockOf(ok(proposeNextBlock(busy, args, CATALOG))).startDate).toBe(addDate(TODAY, 1));
  });

  it('no workouts in the next 7 days: no lighter week to offer, the block still starts on day 8', () => {
    const rest: DayOverride[] = Array.from({ length: 7 }, (_, i) => ({
      date: addDate(TODAY, i),
      rest: true as const,
    }));
    const ctx = ctxFor({ state: state({ overrides: rest }) });
    expect(proposeDeload(ctx).ok).toBe(false);
    const p = ok(proposeNextBlock(ctx, ARGS, CATALOG));
    expect(p.title).toBe('Chest focus: 3 weeks');
    expect(p.lines).toHaveLength(3);
    expect(blockOf(p).startDate).toBe(addDate(TODAY, 7));
    expectClean(p);
  });

  it('passes a refusal through (a block the builder cannot make)', () => {
    const r = proposeNextBlock(ctxFor(), { ...ARGS, weeks: 9 }, CATALOG);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reply).toBe('A focus block runs 2 to 6 weeks.');
  });
});

describe('deloadSuggested', () => {
  // Fixture program: days a, b, c (2 exercises × 3 sets); rest on Sun, Tue, Thu, so every week
  // plans Mon, Wed, Fri, Sat.
  const TRAIN_OFFSETS = [0, 2, 4, 5];
  const ROWS: Record<string, string[]> = Object.fromEntries(
    FIXTURE_PROGRAM.days.map((d) => [d.id, d.exercises.map((e) => e.exerciseId)]),
  );
  const DAY_IDS = FIXTURE_PROGRAM.days.map((d) => d.id);

  type Hist = { sessions: DeloadSession[]; sets: SetLog[] };
  type Tweak = {
    /** Dates (YYYY-MM-DD) with no session. */
    skip?: string[];
    /** Session adjust per date. */
    adjust?: Record<string, ProposalAction[]>;
    /** Same top set every session for these exercises (a stall). */
    flat?: string[];
  };

  /** `weeks` full weeks of sessions ending the Sunday before TODAY, every set logged. */
  function history(weeks: number, tweak: Tweak = {}): Hist {
    const h: Hist = { sessions: [], sets: [] };
    const firstMonday = addDate(TODAY, -7 * weeks);
    let n = 0;
    for (let w = 0; w < weeks; w++) {
      for (const off of TRAIN_OFFSETS) {
        const date = addDate(firstMonday, w * 7 + off);
        if (tweak.skip?.includes(date)) continue;
        const dayId = DAY_IDS[n % DAY_IDS.length] ?? 'a';
        const sessionId = `s${n}`;
        const startedAt = at(date);
        const adjust = tweak.adjust?.[date];
        h.sessions.push({
          sessionId,
          dayId,
          startedAt,
          endedAt: startedAt + 3_600_000,
          ...(adjust ? { adjust } : {}),
        });
        for (const exerciseId of ROWS[dayId] ?? []) {
          for (let setIndex = 0; setIndex < 3; setIndex++) {
            h.sets.push({
              sessionId,
              exerciseId,
              setIndex,
              reps: 10,
              // A little heavier every session, unless the exercise is kept flat.
              weightKg: tweak.flat?.includes(exerciseId) ? 20 : 20 + n * 0.5,
              restTakenSec: 90,
              startedAt: startedAt + setIndex * 180_000,
              endedAt: startedAt + setIndex * 180_000 + 60_000,
            });
          }
        }
        n++;
      }
    }
    return h;
  }
  const suggest = (h: Hist, over: { state?: TrainerState; today?: string; last?: string } = {}) =>
    deloadSuggested(h.sessions, over.state ?? fixtureState(), over.today ?? TODAY, over.last, {
      sets: h.sets,
    });

  it('six hard weeks in a row → one suggestion that offers the deload proposal', () => {
    const s = suggest(history(6));
    expect(s).toEqual({
      reason: 'hardWeeks',
      hardWeeks: 6,
      stalled: [],
      text: "You've done every planned session for 6 weeks in a row. Want a lighter week?",
      say: '6 full weeks in a row. Lighter week?',
      chips: [{ id: 'deload', label: 'Deload week' }],
    });
    expect(NEXT_BLOCK_RULES.hardWeeks).toBe(6);
  });

  it('five hard weeks: nothing yet; more than six: still one suggestion', () => {
    expect(suggest(history(5))).toBeNull();
    expect(suggest(history(8))?.hardWeeks).toBe(8);
  });

  it('the week in progress does not count either way', () => {
    // Thursday of this week, with Monday and Wednesday missed so far.
    expect(suggest(history(6), { today: addDate(TODAY, 3) })?.hardWeeks).toBe(6);
  });

  it('a missed planned session breaks the run', () => {
    const missed = addDate(TODAY, -7 * 3 + 2); // a Wednesday three weeks back
    expect(suggest(history(6, { skip: [missed] }))).toBeNull();
    // Missed (a Wednesday) in the oldest of 7 weeks: the newest 6 are still full.
    expect(suggest(history(7, { skip: [addDate(TODAY, -47)] }))?.hardWeeks).toBe(6);
  });

  it('a lighter or deload day breaks the run; other adjustments do not', () => {
    const day = addDate(TODAY, -7 * 2 + 4); // a Friday two weeks back
    expect(suggest(history(6, { adjust: { [day]: ['lighter'] } }))).toBeNull();
    expect(suggest(history(6, { adjust: { [day]: ['deload'] } }))).toBeNull();
    expect(suggest(history(6, { adjust: { [day]: ['swap'] } }))?.hardWeeks).toBe(6);
  });

  it("a focus block's lighter last week breaks the run; its other weeks count", () => {
    // A 2-week block on the plan's own training days (Mon, Wed, Fri, Sat).
    const blockFrom = (start: string): FocusBlock => ({
      id: `focus-${start}`,
      group: 'chest',
      startDate: start,
      weeks: 2,
      weekdays: [1, 3, 5, 6],
      days: Array.from({ length: 14 }, (_, i) => ({
        date: addDate(start, i),
        day: TRAIN_OFFSETS.includes(i % 7) ? (FIXTURE_PROGRAM.days[0] ?? null) : null,
      })),
      targetSetsPerWeek: 7,
      baseSetsPerWeek: 5,
    });
    const h = history(8);
    const run = (start: string) =>
      hardWeeksInARow(h.sessions, fixtureState({ blocks: [blockFrom(start)] }), TODAY, h.sets);
    expect(hardWeeksInARow(h.sessions, fixtureState(), TODAY, h.sets)).toBe(8);
    // Block weeks 4 and 3 back: its last week (3 back) is lighter, so the run is 2 weeks.
    expect(run(addDate(TODAY, -28))).toBe(2);
    expect(
      suggest(h, { state: fixtureState({ blocks: [blockFrom(addDate(TODAY, -28))] }) }),
    ).toBeNull();
    // Block weeks 8 and 7 back: 6 full weeks since its lighter week.
    expect(run(addDate(TODAY, -56))).toBe(6);
    // Block weeks 6 and 5 back: the first block week is not reached, the run stops at its last.
    expect(run(addDate(TODAY, -42))).toBe(4);
  });

  it('once: not again for 4 weeks after the last offer (data)', () => {
    const h = history(6);
    expect(NEXT_BLOCK_RULES.offerSpacingDays).toBe(28);
    expect(suggest(h, { last: TODAY })).toBeNull();
    expect(suggest(h, { last: addDate(TODAY, -27) })).toBeNull();
    expect(suggest(h, { last: addDate(TODAY, -28) })?.reason).toBe('hardWeeks');
  });

  it('not while a deload week is already on', () => {
    const on = fixtureState({
      overrides: [{ date: addDate(TODAY, 2), adjust: { kind: 'deload', exercises: [] } }],
    });
    expect(suggest(history(6), { state: on })).toBeNull();
    expect(suggest(history(3, { flat: ['press', 'row'] }), { state: on })).toBeNull();
  });

  it('two exercises stalled at once (M10 stall rule) → a suggestion naming them', () => {
    // Three weeks: each exercise has 4 sessions; press and row never beat their first top set.
    const s = deloadSuggested(
      history(3, { flat: ['press', 'row'] }).sessions,
      fixtureState(),
      TODAY,
      undefined,
      {
        sets: history(3, { flat: ['press', 'row'] }).sets,
        name: (id) => ({ press: 'Bench Press', row: 'Cable Row' })[id] ?? id,
      },
    );
    expect(s).toEqual({
      reason: 'stalls',
      hardWeeks: 3,
      stalled: ['press', 'row'],
      text: 'Bench Press and Cable Row have had the same best set for a while. Want a lighter week?',
      say: '2 lifts have stopped moving up. Lighter week?',
      chips: [{ id: 'deload', label: 'Deload week' }],
    });
    expect(NEXT_BLOCK_RULES.stalledExercises).toBe(2);
  });

  it('one stalled exercise is not enough; three are named in plan order', () => {
    expect(suggest(history(3, { flat: ['press'] }))).toBeNull();
    const s = suggest(history(3, { flat: ['lunge', 'press', 'curl'] }));
    expect(s?.stalled).toEqual(['press', 'curl', 'lunge']);
    expect(s?.text).toBe(
      'press, curl and lunge have had the same best set for a while. Want a lighter week?',
    );
  });

  it('stalls are also offered once, then not for 4 weeks', () => {
    const h = history(3, { flat: ['press', 'row'] });
    expect(suggest(h, { last: addDate(TODAY, -10) })).toBeNull();
    expect(suggest(h, { last: addDate(TODAY, -28) })?.reason).toBe('stalls');
  });

  it('a fix applied since (stall `since`) clears that exercise', () => {
    const h = history(3, { flat: ['press', 'row'] });
    const s = deloadSuggested(h.sessions, fixtureState(), TODAY, undefined, {
      sets: h.sets,
      stallSince: { press: at(addDate(TODAY, -3)) },
    });
    expect(s).toBeNull();
  });

  it('no history, or no sets passed: nothing', () => {
    expect(deloadSuggested([], fixtureState(), TODAY, undefined, { sets: [] })).toBeNull();
    expect(deloadSuggested(history(6).sessions, fixtureState(), TODAY, undefined)).toBeNull();
  });

  it('every text passes the copy check; say is short enough to speak', () => {
    const all = [
      suggest(history(6)),
      suggest(history(12)),
      suggest(history(3, { flat: ['press', 'row'] })),
      suggest(history(3, { flat: ['press', 'row', 'curl', 'fly'] })),
    ];
    for (const s of all) {
      if (!s) throw new Error('expected a suggestion');
      expect(checkCopy(s.text).hits, s.text).toEqual([]);
      expect(checkCopy(s.say).hits, s.say).toEqual([]);
      expect(wordCount(s.say)).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
      expect(`${s.text} ${s.say}`).not.toMatch(/overtrain|fatigue|recover|burn ?out|must|need to/i);
    }
  });

  it('the offer is a proposal: Apply makes the next 7 days lighter, Undo restores them', () => {
    const h = history(6);
    const s = suggest(h);
    expect(s?.chips[0]?.id).toBe('deload');
    const state = { ...fixtureState(), version: 3 };
    const ctx: ActionContext = {
      state,
      sessions: h.sessions,
      today: TODAY,
      unit: 'kg',
      lastWeightKg: {},
    };
    const p = ok(proposeDeload(ctx));
    expect(p.action).toBe('deload');
    expect(state.overrides).toEqual([]);
    const applied = applyProposal(state, p, NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    const dates = applied.state.overrides.map((o) => o.date);
    expect(dates.length).toBeGreaterThan(0);
    for (const d of dates) {
      expect(d >= TODAY && d < addDate(TODAY, 7), d).toBe(true);
    }
    // With the deload on, it isn't suggested again.
    expect(suggest(h, { state: applied.state })).toBeNull();
    const undone = undoLast(applied.state, [{ ...applied.change, id: 1 }], NOW + 1000, 1);
    if (!undone.ok) throw new Error(undone.reason);
    expect(undone.state.overrides).toEqual([]);
    expect(localDate(NOW)).toBe(TODAY);
  });
});
