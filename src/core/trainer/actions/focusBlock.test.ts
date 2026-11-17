import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { wordCount } from '../../advice';
import { applyProposal, undoLast } from '../changes';
import { buildFocusBlock, blockEnd, focusSetsOf } from '../focusBlock';
import { addDate, calendar, effectiveDay, seedPlan, upNext, type PlanSession } from '../plan';
import { checkCopy } from '../replies';
import { proposeFocusBlock } from './focusBlock';
import { proposeLighter, type ActionContext, type ActionResult } from './lighter';
import { proposePostpone } from './postpone';
import { proposeSwap } from './swap';
import type {
  FocusBlock,
  FocusBlockParams,
  PlanChange,
  Program,
  Proposal,
  TrainerState,
} from '../../types';

// Made-up history; the repo's default program. 2026-11-16 is a Monday.
const program = programJson as Program;
const CATALOG = trainerCatalog();
const TODAY = '2026-11-16';
const NOW = new Date(2026, 10, 16, 9, 0).getTime();
const at = (date: string, h = 18) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h).getTime();
};
const done = (dayId: string, date: string): PlanSession => ({
  dayId,
  startedAt: at(date),
  endedAt: at(date) + 3_600_000,
});
const state = (): TrainerState => ({ ...seedPlan(program), version: 5 });
const PARAMS: FocusBlockParams = {
  group: 'chest',
  weeks: 3,
  weekdays: [1, 2, 3, 4, 5],
  startDate: TODAY,
};
const ctxFor = (over: Partial<ActionContext> = {}): ActionContext => ({
  state: state(),
  sessions: [done('legs-b', '2026-11-14')],
  today: TODAY,
  unit: 'kg',
  lastWeightKg: {},
  ...over,
});
const ok = (r: ActionResult): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason} ${r.reply}`);
  return r.proposal;
};
const blockOf = (p: Proposal): FocusBlock => {
  const b = p.next.blocks?.at(-1);
  if (!b) throw new Error('no block');
  return b;
};
const apply = (s: TrainerState, p: Proposal, now = NOW) => {
  const r = applyProposal(s, p, now, 'rules');
  if (!r.ok) throw new Error(r.reason);
  return r;
};
const expectClean = (p: Proposal) => {
  for (const t of [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])])
    expect(checkCopy(t).ok, t).toBe(true);
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
};

describe('proposeFocusBlock', () => {
  it('a dated focusBlock proposal with one line per week and clean copy', () => {
    const ctx = ctxFor();
    const p = ok(proposeFocusBlock(ctx, PARAMS, CATALOG));
    expect(p.action).toBe('focusBlock');
    expect(p.scope).toBe('dated');
    expect(p.baseVersion).toBe(5);
    expect(p.title).toBe('Chest focus: 3 weeks');
    expect(p.lines).toHaveLength(3);
    const b = blockOf(p);
    expect(b).toEqual(buildFocusBlock(ctx.state, CATALOG, PARAMS, ctx.sessions));
    // Week 1: 5 days; before = the calendar's chest sets for those 7 days.
    const before = calendar(ctx.state, ctx.sessions, TODAY, 7)
      .filter((e) => !e.rest)
      .reduce(
        (n, e) =>
          n +
          focusSetsOf(
            effectiveDay(ctx.state, ctx.sessions, e.date).day?.exercises ?? [],
            'chest',
            CATALOG,
          ),
        0,
      );
    const after = b.days
      .slice(0, 7)
      .reduce((n, d) => n + focusSetsOf(d.day?.exercises ?? [], 'chest', CATALOG), 0);
    expect(p.lines[0]).toEqual({
      before: `Week 1: 7 days, chest ${before} sets`,
      after: `5 days, chest ${after} sets`,
    });
    expect(p.lines[2]?.after).toMatch(/lighter week$/);
    expectClean(p);
  });

  it('accepts a built (or revised) block as is', () => {
    const ctx = ctxFor();
    const b = buildFocusBlock(ctx.state, CATALOG, { ...PARAMS, group: 'back' }, ctx.sessions);
    expect(blockOf(ok(proposeFocusBlock(ctx, b, CATALOG)))).toEqual(b);
  });

  it('refuses params outside the rules, and a group with no exercises', () => {
    const ctx = ctxFor();
    for (const bad of [{ weeks: 8 }, { weekdays: [1, 2] }]) {
      const r = proposeFocusBlock(ctx, { ...PARAMS, ...bad }, CATALOG);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(checkCopy(r.reply).ok).toBe(true);
    }
    const r = proposeFocusBlock(ctx, { ...PARAMS, group: 'core' }, CATALOG);
    expect(r.ok).toBe(false);
  });

  it('replaces an overlapping block and keeps the others', () => {
    const ctx = ctxFor();
    const old = buildFocusBlock(ctx.state, CATALOG, {
      ...PARAMS,
      startDate: '2026-11-09',
      group: 'back',
    });
    const past = buildFocusBlock(ctx.state, CATALOG, {
      ...PARAMS,
      startDate: '2026-10-01',
      weeks: 2,
    });
    const later = buildFocusBlock(ctx.state, CATALOG, {
      ...PARAMS,
      startDate: '2026-11-23',
      group: 'legs',
    });
    const s = { ...ctx.state, blocks: [past, old, later] };
    const p = ok(proposeFocusBlock({ ...ctx, state: s }, PARAMS, CATALOG));
    // The running block (started before the new one) is cut, not erased; one starting inside
    // the new block is replaced; the others stay.
    expect(p.next.blocks?.map((b) => b.id)).toEqual([past.id, old.id, blockOf(p).id]);
  });

  it('a running block is cut to end the day before the new start: its past stays', () => {
    const ctx = ctxFor();
    const old = buildFocusBlock(ctx.state, CATALOG, {
      ...PARAMS,
      startDate: '2026-11-09',
      group: 'back',
    });
    const s = { ...ctx.state, blocks: [old] };
    const p = ok(proposeFocusBlock({ ...ctx, state: s }, PARAMS, CATALOG));
    const cut = p.next.blocks?.[0];
    if (!cut) throw new Error('old block gone');
    expect(cut.id).toBe(old.id);
    expect(blockEnd(cut)).toBe('2026-11-15');
    expect(cut.days).toEqual(old.days.filter((d) => d.date < TODAY));
    expect([cut.group, cut.startDate, cut.targetSetsPerWeek]).toEqual([
      old.group,
      old.startDate,
      old.targetSetsPerWeek,
    ]);
    // Its past dates still read as its block days; the new block runs from today.
    expect(effectiveDay(p.next, ctx.sessions, '2026-11-12').blockId).toBe(old.id);
    expect(effectiveDay(p.next, ctx.sessions, '2026-11-15').blockId).toBe(old.id);
    expect(effectiveDay(p.next, ctx.sessions, TODAY).blockId).toBe(blockOf(p).id);
    // A block starting the same day is replaced (it has no past).
    const same = buildFocusBlock(ctx.state, CATALOG, { ...PARAMS, group: 'back' });
    const q = ok(
      proposeFocusBlock({ ...ctx, state: { ...ctx.state, blocks: [same] } }, PARAMS, CATALOG),
    );
    expect(q.next.blocks?.map((b) => b.id)).toEqual([blockOf(q).id]);
  });

  it('drops old day changes on block dates but keeps rest days he asked for', () => {
    const ctx = ctxFor();
    const s: TrainerState = {
      ...ctx.state,
      overrides: [
        { date: '2026-11-15', rest: true },
        { date: '2026-11-17', rest: true },
        { date: '2026-11-18', dayId: 'push-a', adjust: { kind: 'lighter', exercises: [] } },
      ],
    };
    const p = ok(proposeFocusBlock({ ...ctx, state: s }, PARAMS, CATALOG));
    expect(p.next.overrides).toEqual([
      { date: '2026-11-15', rest: true },
      { date: '2026-11-17', rest: true },
    ]);
  });
});

describe('Apply → calendar → Undo', () => {
  it('the calendar, effective day and up next show block days; Undo (LIFO) restores', () => {
    const ctx = ctxFor();
    const s0 = ctx.state;
    const p = ok(proposeFocusBlock(ctx, PARAMS, CATALOG));
    const b = blockOf(p);
    const { state: s1, change } = apply(s0, p);
    const cal = calendar(s1, ctx.sessions, TODAY, 21);
    cal.forEach((e, i) => {
      const bd = b.days[i];
      expect(e.blockId).toBe(b.id);
      expect(e.rest).toBe(bd?.day === null);
      expect(e.dayId).toBe(bd?.day?.id ?? null);
    });
    expect(effectiveDay(s1, ctx.sessions, '2026-11-17').day).toEqual(b.days[1]?.day);
    expect(upNext(s1, ctx.sessions, '2026-11-21')).toEqual({
      date: '2026-11-23',
      dayId: b.days[7]?.day?.id,
    });

    // A later change, then Undo twice (LIFO).
    const lp = ok(proposeLighter({ ...ctx, state: s1 }));
    const r2 = apply(s1, lp, NOW + 1000);
    const changes: PlanChange[] = [
      { ...change, id: 1 },
      { ...r2.change, id: 2 },
    ];
    expect(undoLast(r2.state, changes, NOW + 2000, 1)).toEqual({ ok: false, reason: 'notNewest' });
    const u1 = undoLast(r2.state, changes, NOW + 2000);
    if (!u1.ok) throw new Error(u1.reason);
    const u2 = undoLast(u1.state, [changes[0] as PlanChange, u1.change], NOW + 3000);
    if (!u2.ok) throw new Error(u2.reason);
    expect(u2.state.blocks ?? []).toEqual([]);
    expect(calendar(u2.state, ctx.sessions, TODAY, 21)).toEqual(
      calendar(s0, ctx.sessions, TODAY, 21),
    );
  });

  it('undo refuses when the blocks changed without a record', () => {
    const ctx = ctxFor();
    const { state: s1, change } = apply(ctx.state, ok(proposeFocusBlock(ctx, PARAMS, CATALOG)));
    const moved = { ...s1, blocks: [] };
    expect(undoLast(moved, [{ ...change, id: 1 }], NOW + 1)).toEqual({
      ok: false,
      reason: 'conflict',
    });
  });

  it('after the block the rotation resumes from the last finished non-block session', () => {
    const ctx = ctxFor();
    const { state: s1 } = apply(ctx.state, ok(proposeFocusBlock(ctx, PARAMS, CATALOG)));
    const b = s1.blocks?.[0];
    if (!b) throw new Error('no block');
    const end = blockEnd(b);
    // He trained some block days; none of them move the rotation.
    const sessions = [
      ...ctx.sessions,
      done(b.days[0]?.day?.id ?? '', b.days[0]?.date ?? ''),
      done(b.days[1]?.day?.id ?? '', b.days[1]?.date ?? ''),
    ];
    const next = calendar(s1, sessions, addDate(end, 1), 2).map((e) => e.dayId);
    expect(next).toEqual(['push-a', 'pull-a']); // after legs-b on the 14th
  });

  it('a stale proposal is rejected', () => {
    const ctx = ctxFor();
    const p = ok(proposeFocusBlock(ctx, PARAMS, CATALOG));
    expect(applyProposal({ ...ctx.state, version: 6 }, p, NOW, 'rules')).toEqual({
      ok: false,
      reason: 'stale',
    });
  });

  it('a block starting today with today already done: today stays done, the block runs on', () => {
    const sessions = [done('legs-b', '2026-11-14'), done('push-a', TODAY)];
    const ctx = ctxFor({ sessions });
    const p = ok(proposeFocusBlock(ctx, PARAMS, CATALOG));
    const b = blockOf(p);
    // The block's first day is the day he'd have run today (the one he did).
    expect(b.days[0]?.day?.id).toBe('push-a');
    const { state: s1 } = apply(ctx.state, p);
    const [today, tomorrow] = calendar(s1, sessions, TODAY, 2);
    expect(today).toMatchObject({ done: true, dayId: 'push-a', blockId: b.id });
    expect(tomorrow).toMatchObject({ done: false, dayId: b.days[1]?.day?.id });
    expect(upNext(s1, sessions, TODAY)).toEqual({ date: '2026-11-17', dayId: 'pull-a' });
  });
});

describe('other actions on block days', () => {
  const applied = () => {
    const ctx = ctxFor();
    const p = ok(proposeFocusBlock(ctx, PARAMS, CATALOG));
    return { ctx: { ...ctx, state: apply(ctx.state, p).state }, block: blockOf(p) };
  };

  it('Lighter today lightens the block day, not the plan day', () => {
    const { ctx, block } = applied();
    const day = block.days[0]?.day;
    const p = ok(proposeLighter(ctx));
    const s2 = apply(ctx.state, p, NOW + 1).state;
    const rows = effectiveDay(s2, ctx.sessions, TODAY).day?.exercises ?? [];
    expect(rows.map((r) => r.exerciseId)).toEqual(day?.exercises.map((r) => r.exerciseId));
    rows.forEach((r, i) => {
      const was = day?.exercises[i]?.sets ?? 0;
      expect(r.sets).toBe(Math.max(Math.min(was, 2), was - 1));
    });
    expectClean(p);
  });

  it('Not today moves the block day to the next block rest date, block version and all', () => {
    const { ctx, block } = applied();
    const day = block.days[0]?.day;
    const r = proposePostpone(ctx.state, ctx.sessions, TODAY, { mode: 'useRestDay' });
    if (!r.ok) throw new Error(r.reply);
    expectClean(r.proposal);
    const s2 = apply(ctx.state, r.proposal, NOW + 1).state;
    const cal = calendar(s2, ctx.sessions, TODAY, 7);
    expect(cal[0]?.rest).toBe(true);
    // Saturday 21st is the first block rest date.
    const sat = effectiveDay(s2, ctx.sessions, '2026-11-21');
    expect(sat.rest).toBe(false);
    expect(sat.day).toEqual(day);
    // The other block days stay where they are.
    expect(cal.slice(1, 5).map((e) => e.dayId)).toEqual(
      block.days.slice(1, 5).map((d) => d.day?.id ?? null),
    );
    expect(r.proposal.why).toMatch(/Saturday/);
  });

  it('Push the week on a block day rests today and leaves the block dates alone', () => {
    const { ctx, block } = applied();
    const r = proposePostpone(ctx.state, ctx.sessions, TODAY, { mode: 'pushWeek' });
    if (!r.ok) throw new Error(r.reply);
    expectClean(r.proposal);
    const s2 = apply(ctx.state, r.proposal, NOW + 1).state;
    const cal = calendar(s2, ctx.sessions, TODAY, 7);
    expect(cal[0]?.rest).toBe(true);
    expect(cal.slice(1).map((e) => e.dayId)).toEqual(
      block.days.slice(1, 7).map((d) => d.day?.id ?? null),
    );
    expect(r.proposal.why).toMatch(/focus block/i);
  });

  it('a today swap on a block day swaps within the block day', () => {
    const { ctx, block } = applied();
    const day = block.days[0]?.day;
    const r = proposeSwap(ctx, 'Dumbbell_Bench_Press', 'Cable_Chest_Press', CATALOG, 'today');
    const p = ok(r);
    const rows = effectiveDay(apply(ctx.state, p, NOW + 1).state, ctx.sessions, TODAY).day
      ?.exercises;
    expect(rows?.length).toBe(day?.exercises.length);
    expect(rows?.[0]?.exerciseId).toBe('Cable_Chest_Press');
    expect(rows?.[0]?.sets).toBe(day?.exercises[0]?.sets);
  });
});
