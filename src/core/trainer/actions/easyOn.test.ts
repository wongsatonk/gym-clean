import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { wordCount } from '../../advice';
import { todaysFeelOffers } from '../../health/readiness';
import { applyProposal, undoLast } from '../changes';
import { buildFocusBlock } from '../focusBlock';
import { addDate, effectiveDay, effectiveDays, seedPlan, type PlanSession } from '../plan';
import { checkCopy, proposalReply } from '../replies';
import { loadsArea, primaryInArea, type TrainerCatalog } from '../swapCandidates';
import { proposeAvoidArea } from './avoidArea';
import {
  easyCatalog,
  easyOnArea,
  easyOnTreatment,
  proposeEasyOn,
  type EasyOnContext,
} from './easyOn';
import { proposeFocusBlock } from './focusBlock';
import type { ActionContext } from './lighter';
import { proposeShortOnTime } from './shortOnTime';
import { proposeStallFix, type Stall } from './stall';
import { proposeSwap, proposeSwapOptions } from './swap';
import source from './easyOn.ts?raw';
import type {
  BodyArea,
  Exercise,
  PlannedExercise,
  Program,
  Proposal,
  TrainerState,
} from '../../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);
const byId = (id: string): Exercise => {
  const e = EXERCISES.find((x) => x.id === id);
  if (!e) throw new Error(`no exercise ${id}`);
  return e;
};
const areaOf = CATALOG.areaOf;
const primaryIn = (id: string, a: BodyArea) => primaryInArea(byId(id), a, areaOf);
const loads = (id: string, a: BodyArea) => loadsArea(byId(id), a, areaOf);

// 2026-11-11 is a Wednesday; no rest weekdays.
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (easyOn?: BodyArea[]): TrainerState => {
  const s = seedPlan(program);
  return {
    ...s,
    version: 2,
    schedule: { ...s.schedule, restWeekdays: [] },
    ...(easyOn ? { easyOn } : {}),
  };
};
const ctxFor = (dayId = 'push-a', over: Partial<ActionContext> = {}): ActionContext => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  const sessions: PlanSession[] =
    i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
  return { state: baseState(), sessions, today: TODAY, unit: 'kg', lastWeightKg: {}, ...over };
};
const EASY: EasyOnContext = { catalog: CATALOG, unit: 'kg', lastWeightKg: {} };
const treat = easyOnTreatment(EASY);
const proposal = (
  r: { ok: true; proposal: Proposal } | { ok: false; reason: string },
): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const copyOf = (p: Proposal) => [
  p.title,
  p.why,
  p.say ?? '',
  ...p.lines.flatMap((l) => [l.before, l.after]),
];
/** Two weeks of days as they will run, with the treatment. */
const fortnight = (s: TrainerState, sessions: readonly PlanSession[] = []) =>
  effectiveDays(s, sessions, TODAY, 14, { easyOn: treat });
const planRow = (id: string): PlannedExercise | undefined =>
  program.days.flatMap((d) => d.exercises).find((r) => r.exerciseId === id);

describe('proposeEasyOn', () => {
  it('adds an area: a plan-scope proposal that changes only the list', () => {
    const ctx = ctxFor();
    const p = proposal(proposeEasyOn(ctx, { add: ['shoulders'] }, CATALOG));
    expect(p).toMatchObject({ action: 'easyOn', scope: 'plan', baseVersion: 2 });
    expect(p.next.easyOn).toEqual(['shoulders']);
    expect(p.next.plan).toEqual(ctx.state.plan);
    expect(p.next.schedule).toEqual(ctx.state.schedule);
    expect(p.next.overrides).toEqual(ctx.state.overrides);
    expect(p.title).toBe('Go easy on shoulders from now on');
    expect(p.lines[0]).toEqual({ before: 'Shoulders', after: 'Go easy from now on' });
    // One line per plan day it changes, e.g. "Push A · as planned" → "2 swapped, 1 lighter".
    const dayLines = p.lines.slice(1);
    expect(dayLines.length).toBeGreaterThan(0);
    for (const l of dayLines) expect(l.before).toMatch(/ · as planned$/);
    for (const t of copyOf(p)) expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
    expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
    expect(proposalReply(p)).toMatchObject({ title: p.title, why: p.why, say: p.say });
  });

  it('removes an area: the list loses it, and an empty list is dropped', () => {
    const ctx = ctxFor('push-a', { state: baseState(['shoulders', 'arms']) });
    const p = proposal(proposeEasyOn(ctx, { remove: ['arms'] }, CATALOG));
    expect(p.next.easyOn).toEqual(['shoulders']);
    expect(p.title).toBe('Stop going easy on arms');
    expect(p.lines[0]).toEqual({ before: 'Arms', after: 'Back to your usual plan' });
    const all = proposal(proposeEasyOn(ctx, { remove: ['arms', 'shoulders'] }, CATALOG));
    expect('easyOn' in all.next).toBe(false);
    for (const t of copyOf(all)) expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
  });

  it('adds and removes at once (the intake answers); the list keeps a fixed order', () => {
    const ctx = ctxFor('push-a', { state: baseState(['legs']) });
    const p = proposal(proposeEasyOn(ctx, { add: ['core', 'arms'], remove: ['legs'] }, CATALOG));
    expect(p.next.easyOn).toEqual(['arms', 'core']);
    expect(p.title).toBe('Update your go-easy list');
  });

  it('refuses a change that changes nothing', () => {
    const ctx = ctxFor('push-a', { state: baseState(['legs']) });
    for (const change of [{ add: ['legs'] as BodyArea[] }, { remove: ['arms'] as BodyArea[] }, {}])
      expect(proposeEasyOn(ctx, change, CATALOG)).toMatchObject({
        ok: false,
        reason: 'nothingToChange',
      });
  });

  it('Apply → every future day is eased; Undo → the plan as written again', () => {
    const ctx = ctxFor();
    const applied = applyProposal(
      ctx.state,
      proposal(proposeEasyOn(ctx, { add: ['shoulders'] }, CATALOG)),
      NOW,
      'chip',
    );
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.change.action).toBe('easyOn');
    expect(applied.state.plan.edited).toBe(false);
    const days = fortnight(applied.state, ctx.sessions);
    let eased = 0;
    for (const e of days) {
      for (const r of e.day?.exercises ?? []) {
        if (primaryIn(r.exerciseId, 'shoulders')) {
          // Only on a day that is all shoulders (none here).
          throw new Error(`${e.date}: ${r.exerciseId} mainly works the shoulders`);
        }
        if (loads(r.exerciseId, 'shoulders')) {
          expect(r.adjusted, `${e.date} ${r.exerciseId}`).toBe('avoidArea');
          eased++;
        }
      }
    }
    expect(eased).toBeGreaterThan(0);
    expect(days.some((e) => e.easyOn?.includes('shoulders'))).toBe(true);
    const undone = undoLast(applied.state, [applied.change], NOW + 1000);
    if (!undone.ok) throw new Error(undone.reason);
    expect(fortnight(undone.state, ctx.sessions)).toEqual(
      effectiveDays(ctx.state, ctx.sessions, TODAY, 14),
    );
  });
});

describe('easyOnTreatment', () => {
  const day = (id: string) => {
    const d = program.days.find((x) => x.id === id);
    if (!d) throw new Error(`no day ${id}`);
    return d;
  };

  it('swaps or drops what mainly works the area, lightens where it helps', () => {
    const d = treat(day('push-a'), ['arms'], TODAY);
    const ids = d.exercises.map((r) => r.exerciseId);
    expect(ids).not.toContain('Standing_Dumbbell_Triceps_Extension');
    const bench = d.exercises.find((r) => r.exerciseId === 'Dumbbell_Bench_Press');
    expect(bench).toMatchObject({ adjusted: 'avoidArea' });
    expect(bench?.weightKgToday).toBeLessThan(planRow('Dumbbell_Bench_Press')?.startWeightKg ?? 0);
    expect(d.exercises.find((r) => r.exerciseId === 'Pushups')?.targetReps).toEqual([16, 16]);
    expect(d.exercises.find((r) => r.exerciseId === 'Side_Lateral_Raise')).toEqual(
      planRow('Side_Lateral_Raise'),
    );
  });

  it('a swap never loads another listed area', () => {
    const areas: BodyArea[] = ['arms', 'shoulders'];
    for (const id of ROTATION) {
      const d = treat(day(id), areas, TODAY);
      const planIds = day(id).exercises.map((r) => r.exerciseId);
      for (const r of d.exercises) {
        if (planIds.includes(r.exerciseId)) continue;
        for (const a of areas) expect(loads(r.exerciseId, a), `${id} ${r.exerciseId}`).toBe(false);
      }
      for (const r of d.exercises)
        for (const a of areas)
          expect(primaryIn(r.exerciseId, a), `${id} ${r.exerciseId}`).toBe(false);
    }
  });

  it('a day that is all the area runs every move lighter instead of being emptied', () => {
    const d = treat(day('legs-a'), ['legs'], TODAY);
    expect(d.exercises.map((r) => r.exerciseId)).toEqual(
      day('legs-a').exercises.map((r) => r.exerciseId),
    );
    for (const r of d.exercises) expect(r.adjusted).toBe('avoidArea');
  });

  it("never eases a row twice (today's go-easy on the same area, then the list)", () => {
    const ctx = ctxFor('push-a', { state: baseState(['arms']) });
    const today = proposal(proposeAvoidArea(ctx, 'arms', CATALOG));
    const once = effectiveDay(today.next, ctx.sessions, TODAY).day?.exercises ?? [];
    const both = effectiveDay(today.next, ctx.sessions, TODAY, { easyOn: treat }).day?.exercises;
    expect(both).toEqual(once);
  });

  it('is deterministic and pure', () => {
    const d = day('pull-b');
    const snapshot = structuredClone(d);
    expect(treat(d, ['arms'], TODAY)).toEqual(treat(d, ['arms'], TODAY));
    expect(d).toEqual(snapshot);
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});

describe('every action honours the list', () => {
  const listed = (areas: BodyArea[], dayId = 'push-a') =>
    ctxFor(dayId, { state: baseState(areas) });

  it('easyCatalog: kit the gym has and nothing that loads a listed area', () => {
    const cat = easyCatalog(CATALOG, ['shoulders']);
    expect(cat.canDo('Dumbbell_Flyes')).toBe(true);
    expect(cat.canDo('Dumbbell_Bench_Press')).toBe(false);
    expect(cat.canDo('Leg_Press')).toBe(CATALOG.canDo('Leg_Press'));
    expect(easyCatalog(CATALOG, [])).toBe(CATALOG);
    expect(easyOnArea('Dumbbell_Bench_Press', ['legs', 'shoulders'], CATALOG)).toBe('shoulders');
    expect(easyOnArea('Dumbbell_Bench_Press', ['legs'], CATALOG)).toBeUndefined();
  });

  it('swap: candidates never load a listed area, and such a target is refused', () => {
    const ctx = listed(['shoulders']);
    const r = proposeSwapOptions(ctx, 'Dumbbell_Bench_Press', CATALOG, 'today');
    if (!r.ok) throw new Error(r.reason);
    expect(r.options.length).toBeGreaterThan(0);
    for (const o of r.options) expect(loads(o.exerciseId, 'shoulders'), o.exerciseId).toBe(false);
    expect(
      proposeSwap(ctx, 'Dumbbell_Bench_Press', 'Cable_Chest_Press', CATALOG, 'today'),
    ).toMatchObject({ ok: false, reason: 'noCandidate' });
    // Without the list the same target is fine.
    expect(
      proposeSwap(ctxFor(), 'Dumbbell_Bench_Press', 'Cable_Chest_Press', CATALOG, 'today').ok,
    ).toBe(true);
  });

  it('go easy today: a swap-in never loads another listed area', () => {
    const ctx = listed(['arms']);
    const p = proposal(proposeAvoidArea(ctx, 'shoulders', CATALOG));
    const planIds = program.days[0]?.exercises.map((r) => r.exerciseId) ?? [];
    for (const r of effectiveDay(p.next, ctx.sessions, TODAY).day?.exercises ?? []) {
      if (!planIds.includes(r.exerciseId))
        expect(loads(r.exerciseId, 'arms'), r.exerciseId).toBe(false);
    }
  });

  it('focus block on a listed group: refused with the remove question', () => {
    const ctx = listed(['shoulders']);
    const r = proposeFocusBlock(
      ctx,
      { group: 'shoulders', weeks: 4, weekdays: [1, 3, 5], startDate: TODAY },
      CATALOG,
    );
    expect(r).toEqual({
      ok: false,
      reason: 'easyOn',
      reply: 'Remove shoulders from your go-easy list first?',
    });
  });

  it('focus block builder: added work never loads a listed area, its rows are never bumped', () => {
    const state = baseState(['shoulders']);
    const plain = buildFocusBlock(baseState(), CATALOG, {
      group: 'chest',
      weeks: 2,
      weekdays: [1, 3, 5],
      startDate: TODAY,
    });
    const b = buildFocusBlock(state, CATALOG, {
      group: 'chest',
      weeks: 2,
      weekdays: [1, 3, 5],
      startDate: TODAY,
    });
    const planIds = new Set(program.days.flatMap((d) => d.exercises.map((r) => r.exerciseId)));
    let added = 0;
    for (const d of b.days.slice(0, 7)) {
      if (!d.day) continue;
      const own = program.days.find((x) => x.id === d.day?.id)?.exercises ?? [];
      for (const r of d.day.exercises) {
        const mine = own.find((x) => x.exerciseId === r.exerciseId);
        if (!mine) {
          added++;
          expect(loads(r.exerciseId, 'shoulders'), r.exerciseId).toBe(false);
        } else if (loads(r.exerciseId, 'shoulders')) {
          expect(r.sets, r.exerciseId).toBeLessThanOrEqual(mine.sets);
        }
      }
    }
    // The block still builds chest with what is left (flyes and the like).
    expect(added + b.targetSetsPerWeek).toBeGreaterThan(0);
    expect(planIds.size).toBeGreaterThan(0);
    // Without the list the builder bumps the presses as before.
    const bumped = plain.days
      .slice(0, 7)
      .flatMap((d) => d.day?.exercises ?? [])
      .some(
        (r) => loads(r.exerciseId, 'shoulders') && r.sets > (planRow(r.exerciseId)?.sets ?? 99),
      );
    expect(bumped).toBe(true);
  });

  it('stall: no extra set on a lift that loads a listed area', () => {
    const stall: Stall = {
      exerciseId: 'Dumbbell_Bench_Press',
      sessions: 3,
      top: { weightKg: 15, reps: 8 } as Stall['top'],
      bodyweight: false,
      options: ['lighter', 'addSet'],
    };
    const opts = { unit: 'kg' as const, name: (id: string) => id, catalog: CATALOG };
    const state = baseState(['shoulders']);
    expect(proposeStallFix(state, [], TODAY, stall, 'addSet', opts)).toEqual({
      ok: false,
      reason: 'easyOn',
      reply: 'Shoulders are on your go-easy list, so no extra sets there. Try lighter instead.',
    });
    expect(proposeStallFix(state, [], TODAY, stall, 'lighter', opts).ok).toBe(true);
    expect(proposeStallFix(baseState(), [], TODAY, stall, 'addSet', opts).ok).toBe(true);
  });

  it('short on time and lighter only ever take work away', () => {
    const ctx = listed(['shoulders']);
    const p = proposal(proposeShortOnTime(ctx, 30, CATALOG));
    const rows = effectiveDay(p.next, ctx.sessions, TODAY).day?.exercises ?? [];
    for (const r of rows) expect(r.sets).toBeLessThanOrEqual(planRow(r.exerciseId)?.sets ?? 0);
  });

  it('feel-today soreness only offers today’s go-easy, never the standing list', () => {
    const offers = todaysFeelOffers([{ date: TODAY, sore: ['shoulders'] }], TODAY);
    expect(offers).toEqual([{ area: 'shoulders', text: 'Go easy on shoulders today?' }]);
    const ctx = ctxFor();
    const p = proposal(proposeAvoidArea(ctx, 'shoulders', CATALOG));
    expect(p.scope).toBe('today');
    expect(p.next.easyOn).toBeUndefined();
    expect(p.next.overrides.every((o) => o.date === TODAY)).toBe(true);
    expect(effectiveDay(p.next, ctx.sessions, addDate(TODAY, 1)).adjusted).toBeNull();
  });
});
