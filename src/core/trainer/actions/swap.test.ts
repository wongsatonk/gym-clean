import { describe, expect, it } from 'vitest';
import exercisesJson from '../../../data/exercises.json';
import bodyAreasJson from '../../../data/bodyAreas.json';
import equipmentJson from '../../../data/equipment.json';
import programJson from '../../../data/program.json';
import phrases from '../phrases.json';
import { ADVICE_BANNED_WORDS, wordCount } from '../../advice';
import { applyProposal } from '../changes';
import { effectiveDay, seedPlan, type PlanSession } from '../plan';
import type { TrainerCatalog } from '../swapCandidates';
import type { ActionContext, ActionResult } from './lighter';
import { proposeSwap, proposeSwapOptions } from './swap';
import type {
  BodyArea,
  Exercise,
  PlannedExercise,
  Program,
  Proposal,
  TrainerState,
} from '../../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
const exercises = exercisesJson as Exercise[];
const areaByMuscle = new Map<string, BodyArea>();
for (const [area, a] of Object.entries(bodyAreasJson.areas)) {
  for (const m of a.muscles) areaByMuscle.set(m, area as BodyArea);
}
const subs = equipmentJson.substitutes as Record<string, string>;
const CATALOG: TrainerCatalog = {
  exercises,
  areaOf: (m) => areaByMuscle.get(m),
  hasEquipment: (v) => v !== null && equipmentJson.available.includes(subs[v] ?? v),
};
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);
const byId = (id: string): Exercise => {
  const e = exercises.find((x) => x.id === id);
  if (!e) throw new Error(`no exercise ${id}`);
  return e;
};
const dayIds = (id: string) =>
  program.days.find((d) => d.id === id)?.exercises.map((p) => p.exerciseId) ?? [];

// 2026-11-11 is a Wednesday.
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (restWeekdays: number[] = []): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 2, schedule: { ...s.schedule, restWeekdays } };
};
const ctxFor = (dayId: string, over: Partial<ActionContext> = {}): ActionContext => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  const sessions: PlanSession[] =
    i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
  return { state: baseState(), sessions, today: TODAY, unit: 'kg', lastWeightKg: {}, ...over };
};
const proposal = (r: ActionResult): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const todayRows = (ctx: ActionContext, p: Proposal): PlannedExercise[] =>
  effectiveDay(p.next, ctx.sessions, ctx.today).day?.exercises ?? [];

const BANNED = [...ADVICE_BANNED_WORDS, ...phrases.diagnosisTerms.map((t) => t.replace('*', ''))];
const expectCleanCopy = (p: Proposal) => {
  for (const text of [
    p.title,
    p.why,
    p.say ?? '',
    ...p.lines.flatMap((l) => [l.before, l.after]),
  ]) {
    for (const w of BANNED) expect(text.toLowerCase(), text).not.toContain(w);
  }
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
};

describe('proposeSwapOptions', () => {
  it('today: the top 3 candidates, same primary muscle, kit he has, not already in the day', () => {
    const ctx = ctxFor('pull-a');
    const r = proposeSwapOptions(ctx, 'Dumbbell_Bicep_Curl', CATALOG, 'today');
    if (!r.ok) throw new Error(r.reason);
    expect(r.options).toHaveLength(3);
    for (const o of r.options) {
      expect(dayIds('pull-a')).not.toContain(o.exerciseId);
      expect(byId(o.exerciseId).primaryMuscles).toContain('biceps');
      expect(CATALOG.hasEquipment(byId(o.exerciseId).equipment)).toBe(true);
      expect(o.name).toBe(byId(o.exerciseId).name);
      expect(o.proposal).toMatchObject({ action: 'swap', scope: 'today', baseVersion: 2 });
      // Same slot, same sets/reps/rest; marked as a swap; today only.
      const rows = todayRows(ctx, o.proposal);
      expect(rows.map((x) => x.exerciseId)).toEqual(
        dayIds('pull-a').map((id) => (id === 'Dumbbell_Bicep_Curl' ? o.exerciseId : id)),
      );
      expect(rows[3]).toMatchObject({
        sets: 3,
        targetReps: [8, 12],
        restSec: 60,
        adjusted: 'swap',
        tracking: o.tracking,
      });
      expect(o.proposal.next.plan).toEqual(ctx.state.plan);
      expectCleanCopy(o.proposal);
    }
  });

  it('excludes exercises already in the day (Pull B has two curls)', () => {
    const r = proposeSwapOptions(ctxFor('pull-b'), 'Incline_Dumbbell_Curl', CATALOG, 'today');
    if (!r.ok) throw new Error(r.reason);
    const ids = r.options.map((o) => o.exerciseId);
    for (const id of dayIds('pull-b')) expect(ids).not.toContain(id);
  });

  it("plan: every day that has the exercise changes, and neither day's exercises are offered", () => {
    const ctx = ctxFor('pull-a');
    const r = proposeSwapOptions(ctx, 'Lying_Leg_Curls', CATALOG, 'plan');
    if (!r.ok) throw new Error(r.reason);
    expect(r.options.length).toBeGreaterThan(0);
    const legs = [...dayIds('legs-a'), ...dayIds('legs-b')];
    for (const o of r.options) {
      expect(legs).not.toContain(o.exerciseId);
      const p = o.proposal;
      expect(p.scope).toBe('plan');
      for (const id of ['legs-a', 'legs-b']) {
        const d = p.next.plan.days.find((x) => x.id === id);
        const ids = d?.exercises.map((x) => x.exerciseId);
        expect(ids).toContain(o.exerciseId);
        expect(ids).not.toContain('Lying_Leg_Curls');
        // A plan change, not a today badge.
        expect(d?.exercises.find((x) => x.exerciseId === o.exerciseId)?.adjusted).toBeUndefined();
      }
      // Other days untouched.
      expect(p.next.plan.days.find((x) => x.id === 'push-a')).toEqual(ctx.state.plan.days[0]);
      expect(p.lines).toHaveLength(2);
      expectCleanCopy(p);
      const applied = applyProposal(ctx.state, p, NOW, 'chip');
      expect(applied.ok && applied.state.plan.edited).toBe(true);
    }
  });

  it('plan: also swaps it in adjusted days from today on, not in older ones', () => {
    const ctx = ctxFor('pull-a');
    const legsA = structuredClone(program.days[2]?.exercises ?? []);
    ctx.state = {
      ...ctx.state,
      overrides: [
        { date: '2026-11-05', dayId: 'legs-a', adjust: { kind: 'lighter', exercises: legsA } },
        { date: '2026-11-12', dayId: 'legs-a', adjust: { kind: 'deload', exercises: legsA } },
      ],
    };
    const p = proposal(proposeSwap(ctx, 'Lying_Leg_Curls', 'Seated_Leg_Curl', CATALOG, 'plan'));
    const ids = (date: string) =>
      p.next.overrides.find((o) => o.date === date)?.adjust?.exercises.map((x) => x.exerciseId);
    expect(ids('2026-11-12')).toContain('Seated_Leg_Curl');
    expect(ids('2026-11-12')).not.toContain('Lying_Leg_Curls');
    expect(ids('2026-11-05')).toContain('Lying_Leg_Curls');
  });

  it('a swapped weight comes from history, else blank; bodyweight → 0', () => {
    const withHistory = ctxFor('pull-a', { lastWeightKg: { Seated_Dumbbell_Curl: 7.5 } });
    const a = todayRows(
      withHistory,
      proposal(
        proposeSwap(withHistory, 'Dumbbell_Bicep_Curl', 'Seated_Dumbbell_Curl', CATALOG, 'today'),
      ),
    );
    expect(a[3]?.startWeightKg).toBe(7.5);
    const ctx = ctxFor('pull-a');
    const p = proposal(
      proposeSwap(ctx, 'Dumbbell_Bicep_Curl', 'Seated_Dumbbell_Curl', CATALOG, 'today'),
    );
    expect(todayRows(ctx, p)[3]?.startWeightKg).toBeUndefined();
    expect(p.lines[0]?.after).toMatch(/pick your weight/);
    const push = ctxFor('push-a');
    const b = todayRows(
      push,
      proposal(proposeSwap(push, 'Pushups', 'Incline_Push-Up', CATALOG, 'today')),
    );
    expect(b[5]?.startWeightKg).toBe(0);
    expect(b[5]?.tracking).toBe('manual');
  });

  it('refuses: unknown exercise, not in the day/plan, already started, rest day, no candidates', () => {
    expect(proposeSwapOptions(ctxFor('pull-a'), 'Nope', CATALOG, 'today')).toMatchObject({
      ok: false,
      reason: 'unknownExercise',
    });
    expect(proposeSwapOptions(ctxFor('pull-a'), 'Leg_Press', CATALOG, 'today')).toMatchObject({
      ok: false,
      reason: 'notInDay',
    });
    expect(proposeSwapOptions(ctxFor('pull-a'), 'Seated_Leg_Curl', CATALOG, 'plan')).toMatchObject({
      ok: false,
      reason: 'notInPlan',
    });
    expect(
      proposeSwapOptions(
        ctxFor('pull-a', { started: ['Dumbbell_Bicep_Curl'] }),
        'Dumbbell_Bicep_Curl',
        CATALOG,
        'today',
      ),
    ).toMatchObject({ ok: false, reason: 'started' });
    const rest = ctxFor('pull-a', { state: baseState([3]) });
    expect(proposeSwapOptions(rest, 'Dumbbell_Bicep_Curl', CATALOG, 'today')).toMatchObject({
      ok: false,
      reason: 'restDay',
    });
    // A plan swap doesn't need a training day.
    expect(proposeSwapOptions(rest, 'Dumbbell_Bicep_Curl', CATALOG, 'plan').ok).toBe(true);
    const noKit: TrainerCatalog = { ...CATALOG, hasEquipment: () => false };
    expect(
      proposeSwapOptions(ctxFor('pull-a'), 'Dumbbell_Bicep_Curl', noKit, 'today'),
    ).toMatchObject({ ok: false, reason: 'noCandidate' });
  });

  it('proposeSwap validates the target (a model call can name anything)', () => {
    const ctx = ctxFor('pull-a');
    // Already in the day, a different muscle, unknown.
    expect(proposeSwap(ctx, 'Dumbbell_Bicep_Curl', 'Hammer_Curls', CATALOG, 'today')).toMatchObject(
      { ok: false, reason: 'noCandidate' },
    );
    expect(proposeSwap(ctx, 'Dumbbell_Bicep_Curl', 'Leg_Press', CATALOG, 'today')).toMatchObject({
      ok: false,
      reason: 'noCandidate',
    });
    expect(proposeSwap(ctx, 'Dumbbell_Bicep_Curl', 'Nope', CATALOG, 'today')).toMatchObject({
      ok: false,
      reason: 'noCandidate',
    });
  });

  it('a short spoken confirmation, ≤ 8 words even with long names', () => {
    const ctx = ctxFor('push-a');
    const r = proposeSwapOptions(ctx, 'Standing_Dumbbell_Triceps_Extension', CATALOG, 'today');
    if (!r.ok) throw new Error(r.reason);
    for (const o of r.options) expectCleanCopy(o.proposal);
    const short = proposal(
      proposeSwap(ctxFor('pull-a'), 'Hammer_Curls', 'Seated_Dumbbell_Curl', CATALOG, 'today'),
    );
    expect(short.say).toBe('Done. Hammer Curls swapped for Seated Dumbbell Curl.');
  });
});
