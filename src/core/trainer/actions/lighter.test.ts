import { describe, expect, it } from 'vitest';
import programJson from '../../../data/program.json';
import exercisesJson from '../../../data/exercises.json';
import phrases from '../phrases.json';
import { ADVICE_BANNED_WORDS, wordCount } from '../../advice';
import { fromUnit } from '../../units';
import { applyProposal } from '../changes';
import { proposePostpone } from './postpone';
import { calendar, effectiveDay, seedPlan, type PlanSession } from '../plan';
import {
  DELOAD,
  LIGHTER,
  lighterWeightKg,
  proposeDeload,
  proposeLighter,
  type ActionContext,
  type ActionResult,
} from './lighter';
import type { Exercise, PlannedExercise, Program, Proposal, TrainerState } from '../../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
const program = programJson as Program;
const exercises = exercisesJson as Exercise[];
const names = (id: string) => exercises.find((e) => e.id === id)?.name ?? id;
const ROTATION = program.days.map((d) => d.id);
const planDay = (id: string) => {
  const d = program.days.find((x) => x.id === id);
  if (!d) throw new Error(id);
  return d;
};

// 2026-11-11 is a Wednesday.
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (restWeekdays: number[] = []): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 7, schedule: { ...s.schedule, restWeekdays } };
};
const ctxFor = (dayId: string, over: Partial<ActionContext> = {}): ActionContext => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  const sessions: PlanSession[] =
    i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
  return {
    state: baseState(),
    sessions,
    today: TODAY,
    unit: 'kg',
    lastWeightKg: {},
    exerciseName: names,
    ...over,
  };
};
const proposal = (r: ActionResult): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const rowsOn = (ctx: ActionContext, p: Proposal, date = TODAY): PlannedExercise[] =>
  effectiveDay(p.next, ctx.sessions, date).day?.exercises ?? [];
const row = (rows: PlannedExercise[], id: string) => rows.find((r) => r.exerciseId === id);

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

describe('lighterWeightKg (−10%, snapped down to the display-unit step)', () => {
  it('kg: steps of 2.5 kg, down', () => {
    expect(lighterWeightKg(15, 'kg')).toBeCloseTo(12.5);
    expect(lighterWeightKg(20, 'kg')).toBeCloseTo(17.5);
    expect(lighterWeightKg(22.5, 'kg')).toBeCloseTo(20);
    expect(lighterWeightKg(80, 'kg')).toBeCloseTo(70);
  });

  it('lb: 35 lb → 30 lb, not 31.5', () => {
    expect(lighterWeightKg(fromUnit(35, 'lb'), 'lb')).toBeCloseTo(fromUnit(30, 'lb'), 9);
    expect(lighterWeightKg(fromUnit(50, 'lb'), 'lb')).toBeCloseTo(fromUnit(45, 'lb'), 9);
  });

  it('never below one step, and never heavier than before', () => {
    expect(lighterWeightKg(2.5, 'kg')).toBeCloseTo(2.5);
    expect(lighterWeightKg(fromUnit(5, 'lb'), 'lb')).toBeCloseTo(fromUnit(5, 'lb'), 9);
    expect(lighterWeightKg(2, 'kg')).toBe(2);
    expect(lighterWeightKg(0, 'kg')).toBe(0);
  });

  it('uses the M10-q3 constants', () => {
    expect(LIGHTER).toEqual({
      setsDrop: 1,
      minSets: 2,
      weightFactor: 0.9,
      bodyweightRepsFactor: 0.8,
    });
    expect(DELOAD).toEqual({ days: 7, setsFactor: 0.5, weightFactor: 0.9 });
  });
});

describe('proposeLighter', () => {
  it('Push A in kg: one set fewer, 10% lighter, push-ups 20% fewer reps', () => {
    const ctx = ctxFor('push-a');
    const p = proposal(proposeLighter(ctx));
    expect(p).toMatchObject({ action: 'lighter', scope: 'today', baseVersion: 7 });
    const rows = rowsOn(ctx, p);
    expect(rows.map((r) => r.exerciseId)).toEqual(
      planDay('push-a').exercises.map((r) => r.exerciseId),
    );
    expect(row(rows, 'Dumbbell_Bench_Press')).toMatchObject({ sets: 3, adjusted: 'lighter' });
    expect(row(rows, 'Dumbbell_Bench_Press')?.weightKgToday).toBeCloseTo(12.5);
    // 2.5 kg is the minimum: the weight stays, one set fewer.
    expect(row(rows, 'Side_Lateral_Raise')).toMatchObject({ sets: 4, adjusted: 'lighter' });
    expect(row(rows, 'Side_Lateral_Raise')?.weightKgToday).toBeCloseTo(2.5);
    // Bodyweight: reps −20%, no weight.
    expect(row(rows, 'Pushups')).toMatchObject({ sets: 2, targetReps: [16, 16] });
    expect(row(rows, 'Pushups')?.weightKgToday).toBeUndefined();
    expect(effectiveDay(p.next, ctx.sessions, TODAY).adjusted).toBe('lighter');
    expect(p.lines).toHaveLength(6);
    expect(p.lines[0]).toEqual({
      before: 'Dumbbell Bench Press · 4 × 8 · 15 kg',
      after: '3 × 8 · 12.5 kg',
    });
    expect(p.lines.find((l) => l.before.startsWith('Pushups'))).toEqual({
      before: 'Pushups · 3 × 20 · bodyweight',
      after: '2 × 16 · bodyweight',
    });
    expectCleanCopy(p);
  });

  it('lb: a 35 lb default (last time) shows 30 lb', () => {
    const ctx = ctxFor('pull-a', {
      unit: 'lb',
      lastWeightKg: { 'One-Arm_Dumbbell_Row': fromUnit(35, 'lb') },
    });
    const p = proposal(proposeLighter(ctx));
    expect(row(rowsOn(ctx, p), 'One-Arm_Dumbbell_Row')?.weightKgToday).toBeCloseTo(
      fromUnit(30, 'lb'),
      9,
    );
    expect(p.lines[0]).toEqual({
      before: 'One-Arm Dumbbell Row · 4 × 8–12 · 35 lb',
      after: '3 × 8–12 · 30 lb',
    });
  });

  it('bodyweight with a rep range, and the 2-set minimum (Bench Dips 2 sets)', () => {
    const ctx = ctxFor('push-b');
    const rows = rowsOn(ctx, proposal(proposeLighter(ctx)));
    expect(row(rows, 'Bench_Dips')).toMatchObject({ sets: 2, targetReps: [8, 12] });
  });

  it('a 1-set exercise stays at 1 set', () => {
    const ctx = ctxFor('push-a');
    const s = structuredClone(ctx.state);
    const first = s.plan.days[0]?.exercises[0];
    if (first) first.sets = 1;
    ctx.state = s;
    const rows = rowsOn(ctx, proposal(proposeLighter(ctx)));
    expect(row(rows, 'Dumbbell_Bench_Press')?.sets).toBe(1);
  });

  it('a row with no weight yet (swapped in, no history) keeps a blank weight', () => {
    const ctx = ctxFor('push-a');
    const s = structuredClone(ctx.state);
    const first = s.plan.days[0]?.exercises[0];
    if (first) delete first.startWeightKg;
    ctx.state = s;
    const r = row(rowsOn(ctx, proposal(proposeLighter(ctx))), 'Dumbbell_Bench_Press');
    expect(r).toMatchObject({ sets: 3, targetReps: [8, 8] });
    expect(r?.weightKgToday).toBeUndefined();
  });

  it('stacks on today as it will run (an avoid-area override)', () => {
    const ctx = ctxFor('push-a');
    const adjusted = structuredClone(planDay('push-a').exercises).slice(0, 2);
    ctx.state = {
      ...ctx.state,
      overrides: [
        {
          date: TODAY,
          dayId: 'push-a',
          adjust: { kind: 'avoidArea', area: 'arms', exercises: adjusted },
        },
      ],
    };
    const p = proposal(proposeLighter(ctx));
    expect(rowsOn(ctx, p)).toHaveLength(2);
    expect(p.next.overrides).toHaveLength(1);
  });

  it('a rest day, a finished day → no proposal', () => {
    const rest = ctxFor('push-a', { state: baseState([3]) });
    expect(proposeLighter(rest)).toMatchObject({ ok: false, reason: 'restDay' });
    const done = ctxFor('push-a', {
      sessions: [{ dayId: 'push-a', startedAt: NOW - 7_200_000, endedAt: NOW - 3_600_000 }],
    });
    expect(proposeLighter(done)).toMatchObject({ ok: false, reason: 'doneToday' });
  });

  it('mid-workout: rows with logged sets stay', () => {
    const ctx = ctxFor('push-a', { started: ['Dumbbell_Bench_Press'] });
    const rows = rowsOn(ctx, proposal(proposeLighter(ctx)));
    expect(row(rows, 'Dumbbell_Bench_Press')).toEqual(planDay('push-a').exercises[0]);
  });

  it('applies and does not mark the plan edited', () => {
    const ctx = ctxFor('push-a');
    const r = applyProposal(ctx.state, proposal(proposeLighter(ctx)), NOW, 'chip');
    expect(r.ok && r.state.plan.edited).toBe(false);
  });
});

describe('proposeDeload', () => {
  // Sunday rest; today Wed 2026-11-11 runs pull-a (push-a finished yesterday).
  const ctxDeload = (over: Partial<ActionContext> = {}) =>
    ctxFor('pull-a', { state: baseState([0]), ...over });

  it('7 days of dated overrides: sets halved (rounded up), 10% lighter, the rest day skipped', () => {
    const ctx = ctxDeload();
    const p = proposal(proposeDeload(ctx));
    expect(p).toMatchObject({ action: 'deload', scope: 'dated', baseVersion: 7 });
    const before = calendar(ctx.state, ctx.sessions, TODAY, 7);
    const after = calendar(p.next, ctx.sessions, TODAY, 7);
    // Same days on the same dates (pinned), the Sunday stays rest.
    expect(after.map((e) => e.dayId)).toEqual(before.map((e) => e.dayId));
    expect(after.find((e) => e.date === '2026-11-15')?.rest).toBe(true);
    expect(p.next.overrides.map((o) => o.date)).toEqual([
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-16',
      '2026-11-17',
    ]);
    for (const o of p.next.overrides) {
      expect(o.adjust?.kind).toBe('deload');
      expect(o.dayId).toBeDefined();
    }
    const pullA = rowsOn(ctx, p);
    expect(row(pullA, 'One-Arm_Dumbbell_Row')).toMatchObject({ sets: 2, adjusted: 'deload' });
    expect(row(pullA, 'One-Arm_Dumbbell_Row')?.weightKgToday).toBeCloseTo(20);
    expect(row(pullA, 'Wide-Grip_Lat_Pulldown')?.sets).toBe(2);
    // Push A again on Tue 17th: lateral raise 5 sets → 3, Pushups bodyweight reps −20%.
    const pushA = rowsOn(ctx, p, '2026-11-17');
    expect(effectiveDay(p.next, ctx.sessions, '2026-11-17').day?.id).toBe('push-a');
    expect(row(pushA, 'Side_Lateral_Raise')?.sets).toBe(3);
    expect(row(pushA, 'Pushups')).toMatchObject({ sets: 2, targetReps: [16, 16] });
    // Day 8 is back to normal.
    expect(effectiveDay(p.next, ctx.sessions, '2026-11-18').adjusted).toBeNull();
    expect(p.lines).toHaveLength(6);
    expectCleanCopy(p);
  });

  it('pins each override to its day id: a later postpone keeps every deload row on its day', () => {
    const ctx = ctxDeload();
    const deload = proposal(proposeDeload(ctx));
    for (const o of deload.next.overrides) expect(o.dayId).toBeDefined();
    for (const mode of ['pushWeek', 'useRestDay'] as const) {
      const moved = proposePostpone(deload.next, ctx.sessions, TODAY, { mode });
      if (!moved.ok) throw new Error(moved.reason);
      for (const o of moved.proposal.next.overrides) {
        if (!o.adjust) continue;
        const e = effectiveDay(moved.proposal.next, ctx.sessions, o.date);
        expect(e.day?.id, `${mode} ${o.date}`).toBe(o.dayId);
        // The rows still belong to that day.
        expect(
          e.day?.exercises.map((r) => r.exerciseId),
          `${mode} ${o.date}`,
        ).toEqual(planDay(o.dayId ?? '').exercises.map((r) => r.exerciseId));
      }
    }
  });

  it('a 1-set exercise stays at 1; 2 sets → 1', () => {
    const ctx = ctxDeload();
    const s = structuredClone(ctx.state);
    const pushB = s.plan.days.find((d) => d.id === 'push-b');
    const first = pushB?.exercises[0];
    if (first) first.sets = 1;
    ctx.state = s;
    const rows = rowsOn(ctx, proposal(proposeDeload(ctx)), '2026-11-13'); // push-b
    expect(row(rows, 'Bench_Dips')?.sets).toBe(1);
    expect(row(rows, 'Incline_Dumbbell_Press')?.sets).toBe(1);
  });

  it('skips a day already done today and keeps a rest override in the window', () => {
    const doneToday: PlanSession = {
      dayId: 'pull-a',
      startedAt: NOW - 7_200_000,
      endedAt: NOW - 3_600_000,
    };
    const ctx = ctxDeload({ sessions: [...ctxDeload().sessions, doneToday] });
    ctx.state = { ...ctx.state, overrides: [{ date: '2026-11-13', rest: true }] };
    const p = proposal(proposeDeload(ctx));
    const dates = p.next.overrides.filter((o) => o.adjust).map((o) => o.date);
    expect(dates).not.toContain(TODAY);
    expect(dates).not.toContain('2026-11-13');
    expect(p.next.overrides).toContainEqual({ date: '2026-11-13', rest: true });
  });

  it('replaces an older lighter override instead of stacking on it', () => {
    const ctx = ctxDeload();
    const light = proposal(proposeLighter(ctx)).next;
    const p = proposal(proposeDeload({ ...ctx, state: light }));
    expect(p.next.overrides.filter((o) => o.date === TODAY)).toHaveLength(1);
    // From the plan's 4 sets: 2, not ceil(3 / 2).
    expect(row(rowsOn(ctx, p), 'One-Arm_Dumbbell_Row')?.sets).toBe(2);
    expect(row(rowsOn(ctx, p), 'One-Arm_Dumbbell_Row')?.weightKgToday).toBeCloseTo(20);
  });
});
