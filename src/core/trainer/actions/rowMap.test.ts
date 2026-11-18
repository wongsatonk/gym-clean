// M10: every day-level action records its row map (DayAdjust.replaced) so the preview and the
// running session pair rows exactly (src/core/trainer/rows.ts).
import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { effectiveDay, seedPlan, type PlanSession } from '../plan';
import { alignRows } from '../rows';
import type { TrainerCatalog } from '../swapCandidates';
import { proposeAvoidArea } from './avoidArea';
import {
  composeReplaced,
  proposeDeload,
  proposeLighter,
  type ActionContext,
  type ActionResult,
} from './lighter';
import { proposeRemove } from './remove';
import { proposeSwap, proposeSwapOptions } from './swap';
import type { DayAdjust, Program, Proposal, TrainerState } from '../../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
// The catalog with his gym's default kit (M10e), wired like src/ui/app.ts.
const exercises = EXERCISES;
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);

const TODAY = '2026-11-11';
const baseState = (): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 1, schedule: { ...s.schedule, restWeekdays: [] } };
};
const ctxFor = (dayId: string, state: TrainerState = baseState()): ActionContext => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  const sessions: PlanSession[] =
    i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
  return { state, sessions, today: TODAY, unit: 'kg', lastWeightKg: {} };
};
const proposal = (r: ActionResult): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const adjustOn = (p: Proposal, date = TODAY): DayAdjust | undefined =>
  p.next.overrides.find((o) => o.date === date)?.adjust;
const CURL = 'Dumbbell_Bicep_Curl';
/** Today's swap of the curl on Pull A for its first candidate. */
const swapCurl = (ctx: ActionContext) => {
  const r = proposeSwapOptions(ctx, CURL, CATALOG, 'today');
  if (!r.ok) throw new Error(r.reason);
  const first = r.options[0];
  if (!first) throw new Error('no candidate');
  return { toId: first.exerciseId, p: first.proposal };
};

describe('DayAdjust.replaced (row map)', () => {
  it('swap today: the swapped row maps to its replacement', () => {
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    expect(adjustOn(p)?.replaced).toEqual([{ fromId: CURL, toId }]);
  });

  it('remove: the row maps to null', () => {
    const p = proposal(proposeRemove(ctxFor('pull-a'), 'Hammer_Curls'));
    expect(adjustOn(p)?.replaced).toEqual([{ fromId: 'Hammer_Curls', toId: null }]);
  });

  it('remove after a swap: the chain ends in null from either side', () => {
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    const r = proposal(proposeRemove(ctxFor('pull-a', p.next), toId));
    expect(adjustOn(r)?.replaced).toEqual([
      { fromId: CURL, toId: null },
      { fromId: toId, toId: null },
    ]);
  });

  it('lighter: nothing replaced; stacking on a swap carries its map', () => {
    expect(adjustOn(proposal(proposeLighter(ctxFor('pull-a'))))?.replaced).toEqual([]);
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    const l = proposal(proposeLighter(ctxFor('pull-a', p.next)));
    expect(adjustOn(l)?.replaced).toEqual([{ fromId: CURL, toId }]);
  });

  it('avoid area twice rebuilds from the plan: only the new map', () => {
    const shoulders = proposal(proposeAvoidArea(ctxFor('push-a'), 'shoulders', CATALOG));
    const arms = proposal(proposeAvoidArea(ctxFor('push-a', shoulders.next), 'arms', CATALOG));
    expect(adjustOn(arms)?.replaced).toEqual([
      { fromId: 'Standing_Dumbbell_Triceps_Extension', toId: null },
    ]);
  });

  it("deload: today's swap map is carried, other dates start empty", () => {
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    const d = proposal(proposeDeload(ctxFor('pull-a', p.next)));
    expect(adjustOn(d)?.replaced).toEqual([{ fromId: CURL, toId }]);
    const later = d.next.overrides.filter((o) => o.date > TODAY && o.adjust);
    expect(later.length).toBeGreaterThan(0);
    for (const o of later) expect(o.adjust?.replaced).toEqual([]);
  });

  it('avoid area: removed rows map to null (shoulders on Push A)', () => {
    const p = proposal(proposeAvoidArea(ctxFor('push-a'), 'shoulders', CATALOG));
    expect(adjustOn(p)?.replaced).toEqual([
      { fromId: 'Seated_Dumbbell_Press', toId: null },
      { fromId: 'Side_Lateral_Raise', toId: null },
    ]);
  });

  it('avoid area: a swap maps to its replacement', () => {
    const twoPrimaries: TrainerCatalog = {
      ...CATALOG,
      exercises: exercises.map((e) =>
        e.id === 'Bench_Dips'
          ? { ...e, primaryMuscles: ['triceps', 'chest'], secondaryMuscles: ['shoulders'] }
          : e,
      ),
    };
    const p = proposal(proposeAvoidArea(ctxFor('push-b'), 'arms', twoPrimaries));
    expect(adjustOn(p)?.replaced).toEqual([
      { fromId: 'Triceps_Pushdown', toId: null },
      { fromId: 'Bench_Dips', toId: 'Incline_Dumbbell_Flyes' },
    ]);
  });

  it('avoid area on top of a swap: the swapped-in curl is removed, chain to null', () => {
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    const a = proposal(proposeAvoidArea(ctxFor('pull-a', p.next), 'arms', CATALOG));
    const map = adjustOn(a)?.replaced ?? [];
    expect(map).toContainEqual({ fromId: CURL, toId: null });
    expect(map).toContainEqual({ fromId: toId, toId: null });
    expect(new Set(map.map((m) => m.fromId)).size).toBe(map.length);
  });

  it('swap from now on: dated adjust overrides from today on get the entry', () => {
    const legsA = structuredClone(program.days.find((d) => d.id === 'legs-a')?.exercises ?? []);
    const state: TrainerState = {
      ...baseState(),
      overrides: [
        { date: '2026-11-05', dayId: 'legs-a', adjust: { kind: 'lighter', exercises: legsA } },
        { date: '2026-11-12', dayId: 'legs-a', adjust: { kind: 'deload', exercises: legsA } },
      ],
    };
    const p = proposal(
      proposeSwap(ctxFor('pull-a', state), 'Lying_Leg_Curls', 'Seated_Leg_Curl', CATALOG, 'plan'),
    );
    expect(adjustOn(p, '2026-11-12')?.replaced).toEqual([
      { fromId: 'Lying_Leg_Curls', toId: 'Seated_Leg_Curl' },
    ]);
    expect(adjustOn(p, '2026-11-05')?.replaced).toBeUndefined();
  });

  it('alignRows with the map pairs the plan day and the session day exactly', () => {
    const { toId, p } = swapCurl(ctxFor('pull-a'));
    const r = proposal(proposeRemove(ctxFor('pull-a', p.next), 'Hammer_Curls'));
    const plan = program.days.find((d) => d.id === 'pull-a')?.exercises ?? [];
    const swapped = effectiveDay(p.next, ctxFor('pull-a').sessions, TODAY).day?.exercises ?? [];
    const now = effectiveDay(r.next, ctxFor('pull-a').sessions, TODAY).day?.exercises ?? [];
    const pairs = (from: typeof plan) =>
      alignRows(from, now, adjustOn(r)?.replaced).map(
        (x) => `${x.from.exerciseId}>${x.to?.exerciseId ?? '-'}`,
      );
    expect(pairs(plan)).toContain(`${CURL}>${toId}`);
    expect(pairs(plan)).toContain('Hammer_Curls>-');
    // The running session (already on the swapped day): only the removal changes.
    expect(pairs(swapped)).toContain(`${toId}>${toId}`);
    expect(pairs(swapped)).toContain('Hammer_Curls>-');
  });

  it('composeReplaced follows chains, keeps one entry per id, drops a swap back', () => {
    expect(composeReplaced([{ fromId: 'a', toId: 'x' }], [{ fromId: 'x', toId: 'y' }])).toEqual([
      { fromId: 'a', toId: 'y' },
      { fromId: 'x', toId: 'y' },
    ]);
    expect(composeReplaced([{ fromId: 'a', toId: null }], [{ fromId: 'b', toId: null }])).toEqual([
      { fromId: 'a', toId: null },
      { fromId: 'b', toId: null },
    ]);
    // Swapped back to the original: a is in the day again, x left for a.
    expect(composeReplaced([{ fromId: 'a', toId: 'x' }], [{ fromId: 'x', toId: 'a' }])).toEqual([
      { fromId: 'x', toId: 'a' },
    ]);
  });
});
