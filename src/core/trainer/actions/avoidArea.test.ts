import { describe, expect, it } from 'vitest';
import exercisesJson from '../../../data/exercises.json';
import bodyAreasJson from '../../../data/bodyAreas.json';
import equipmentJson from '../../../data/equipment.json';
import programJson from '../../../data/program.json';
import phrases from '../phrases.json';
import { ADVICE_BANNED_WORDS, wordCount } from '../../advice';
import { fromUnit } from '../../units';
import { applyProposal } from '../changes';
import { effectiveDay, seedPlan, type PlanSession } from '../plan';
import type { TrainerCatalog } from '../swapCandidates';
import { proposeAvoidArea } from './avoidArea';
import type { ActionContext } from './lighter';
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

// 2026-11-11 is a Wednesday; no rest weekdays so any rotation day can be "today".
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 3, schedule: { ...s.schedule, restWeekdays: [] } };
};
/** A context where today runs `dayId` (the previous rotation day finished yesterday). */
const ctxFor = (dayId: string, over: Partial<ActionContext> = {}): ActionContext => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  const sessions: PlanSession[] =
    i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
  return { state: baseState(), sessions, today: TODAY, unit: 'kg', lastWeightKg: {}, ...over };
};
const proposal = (r: ReturnType<typeof proposeAvoidArea>): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const todayRows = (ctx: ActionContext, p: Proposal): PlannedExercise[] =>
  effectiveDay(p.next, ctx.sessions, ctx.today).day?.exercises ?? [];
const row = (rows: PlannedExercise[], id: string) => rows.find((r) => r.exerciseId === id);
const kg = (n: number) => expect.closeTo(n, 6) as unknown as number;

const BANNED = [...ADVICE_BANNED_WORDS, ...phrases.diagnosisTerms.map((t) => t.replace('*', ''))];
const copyOf = (p: Proposal) => [
  p.title,
  p.why,
  p.say ?? '',
  ...p.lines.flatMap((l) => [l.before, l.after]),
];
const expectCleanCopy = (p: Proposal) => {
  for (const text of copyOf(p)) {
    for (const w of BANNED) expect(text.toLowerCase(), text).not.toContain(w);
  }
  expect(wordCount(p.say ?? '')).toBeGreaterThan(0);
  expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
};

describe('proposeAvoidArea', () => {
  it('arms on Pull A: curls removed (no candidate), rows and pulldowns 10% lighter', () => {
    const ctx = ctxFor('pull-a');
    const p = proposal(proposeAvoidArea(ctx, 'arms', CATALOG));
    expect(p.action).toBe('avoidArea');
    expect(p.scope).toBe('today');
    expect(p.baseVersion).toBe(3);
    const rows = todayRows(ctx, p);
    expect(rows.map((r) => r.exerciseId)).toEqual([
      'One-Arm_Dumbbell_Row',
      'Wide-Grip_Lat_Pulldown',
      'Reverse_Flyes',
    ]);
    expect(row(rows, 'One-Arm_Dumbbell_Row')).toMatchObject({
      weightKgToday: kg(20),
      adjusted: 'avoidArea',
      sets: 4,
    });
    expect(row(rows, 'Wide-Grip_Lat_Pulldown')).toMatchObject({
      weightKgToday: kg(35),
      adjusted: 'avoidArea',
    });
    // Shoulders only: untouched.
    expect(row(rows, 'Reverse_Flyes')).toEqual(program.days[1]?.exercises[2]);
    expect(effectiveDay(p.next, ctx.sessions, TODAY).adjusted).toBe('avoidArea');
    // One line per changed row; removed rows say so.
    expect(p.lines).toHaveLength(4);
    expect(p.lines.find((l) => l.before.startsWith('Dumbbell Bicep Curl'))?.after).toMatch(
      /removed/i,
    );
    expectCleanCopy(p);
  });

  it('arms on Push A: triceps extension removed, presses lighter, push-ups fewer reps', () => {
    const ctx = ctxFor('push-a');
    const p = proposal(proposeAvoidArea(ctx, 'arms', CATALOG));
    const rows = todayRows(ctx, p);
    expect(row(rows, 'Standing_Dumbbell_Triceps_Extension')).toBeUndefined();
    expect(row(rows, 'Dumbbell_Bench_Press')?.weightKgToday).toBeCloseTo(12.5);
    expect(row(rows, 'Incline_Dumbbell_Press')?.weightKgToday).toBeCloseTo(12.5);
    expect(row(rows, 'Seated_Dumbbell_Press')?.weightKgToday).toBeCloseTo(10);
    expect(row(rows, 'Pushups')).toMatchObject({ targetReps: [16, 16], adjusted: 'avoidArea' });
    expect(row(rows, 'Pushups')?.weightKgToday).toBeUndefined();
    expect(row(rows, 'Side_Lateral_Raise')?.adjusted).toBeUndefined();
    expectCleanCopy(p);
  });

  it('arms on Push B: dips removed (its only primary muscle is the triceps)', () => {
    const ctx = ctxFor('push-b');
    const p = proposal(proposeAvoidArea(ctx, 'arms', CATALOG));
    const rows = todayRows(ctx, p);
    expect(row(rows, 'Bench_Dips')).toBeUndefined();
    expect(row(rows, 'Triceps_Pushdown')).toBeUndefined();
    // Nothing swapped in: every row is from the plan day.
    const planIds = program.days.find((d) => d.id === 'push-b')?.exercises.map((x) => x.exerciseId);
    for (const r of rows) expect(planIds).toContain(r.exerciseId);
    expect(p.lines.find((l) => l.before.startsWith('Bench Dips'))?.after).toMatch(/removed/i);
  });

  it('shoulders on Push A: the seated press is removed, never swapped for triceps work', () => {
    const ctx = ctxFor('push-a');
    const p = proposal(proposeAvoidArea(ctx, 'shoulders', CATALOG));
    const rows = todayRows(ctx, p);
    expect(row(rows, 'Seated_Dumbbell_Press')).toBeUndefined();
    expect(row(rows, 'Tricep_Dumbbell_Kickback')).toBeUndefined();
    expect(row(rows, 'Side_Lateral_Raise')).toBeUndefined();
    expect(p.lines.find((l) => l.before.startsWith('Seated Dumbbell Press'))?.after).toMatch(
      /removed/i,
    );
    // Presses where shoulders only help: lighter.
    expect(row(rows, 'Dumbbell_Bench_Press')?.adjusted).toBe('avoidArea');
  });

  // The real catalog has one primary muscle per exercise, so a swap needs a made-up one with a
  // second primary outside the area: dips as triceps + chest.
  const dipsTwoPrimaries: TrainerCatalog = {
    ...CATALOG,
    exercises: exercises.map((e) =>
      e.id === 'Bench_Dips'
        ? { ...e, primaryMuscles: ['triceps', 'chest'], secondaryMuscles: ['shoulders'] }
        : e,
    ),
  };

  it('a primary muscle outside the area: swapped in place for a move that shares it', () => {
    const ctx = ctxFor('push-b');
    const p = proposal(proposeAvoidArea(ctx, 'arms', dipsTwoPrimaries));
    const rows = todayRows(ctx, p);
    expect(row(rows, 'Bench_Dips')).toBeUndefined();
    const swapped = rows.filter((r) => r.adjusted === 'avoidArea' && r.weightKgToday === undefined);
    expect(swapped.map((r) => r.exerciseId)).toEqual(['Incline_Dumbbell_Flyes']);
    // In the dips' place (last), keeping its sets, reps and rest; no history → blank weight.
    expect(rows.at(-1)).toEqual({
      exerciseId: 'Incline_Dumbbell_Flyes',
      sets: 2,
      targetReps: [10, 15],
      restSec: 60,
      tracking: 'manual',
      adjusted: 'avoidArea',
    });
    expect(p.lines.find((l) => l.before.startsWith('Bench Dips'))?.after).toMatch(
      /pick your weight/i,
    );
  });

  it("swapped weights come from that exercise's history", () => {
    const ctx = ctxFor('push-b', { lastWeightKg: { Incline_Dumbbell_Flyes: 8 } });
    const rows = todayRows(ctx, proposal(proposeAvoidArea(ctx, 'arms', dipsTwoPrimaries)));
    expect(row(rows, 'Incline_Dumbbell_Flyes')?.startWeightKg).toBe(8);
  });

  it("lightens from last time's weight when there is one, snapped down in lb", () => {
    const ctx = ctxFor('pull-a', {
      unit: 'lb',
      lastWeightKg: { 'One-Arm_Dumbbell_Row': fromUnit(35, 'lb') },
    });
    const rows = todayRows(ctx, proposal(proposeAvoidArea(ctx, 'arms', CATALOG)));
    expect(row(rows, 'One-Arm_Dumbbell_Row')?.weightKgToday).toBeCloseTo(fromUnit(30, 'lb'), 6);
  });

  it('no candidate → removed (gym without the kit)', () => {
    const noKit: TrainerCatalog = { ...CATALOG, hasEquipment: () => false };
    const ctx = ctxFor('push-b');
    const rows = todayRows(ctx, proposal(proposeAvoidArea(ctx, 'arms', noKit)));
    expect(row(rows, 'Bench_Dips')).toBeUndefined();
    expect(
      rows.some(
        (r) =>
          r.adjusted === 'avoidArea' &&
          r.weightKgToday === undefined &&
          r.targetReps[0] === 10 &&
          r.sets === 2,
      ),
    ).toBe(false);
  });

  it('a swapped-in exercise never loads the avoided area, for every day and area', () => {
    const areas: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];
    for (const dayId of ROTATION) {
      for (const area of areas) {
        const ctx = ctxFor(dayId);
        const r = proposeAvoidArea(ctx, area, CATALOG);
        if (!r.ok) continue;
        const planIds = new Set(
          program.days.find((d) => d.id === dayId)?.exercises.map((x) => x.exerciseId),
        );
        const rows = todayRows(ctx, r.proposal);
        // No duplicates in the day.
        expect(new Set(rows.map((x) => x.exerciseId)).size, `${dayId}/${area}`).toBe(rows.length);
        for (const x of rows.filter((x) => !planIds.has(x.exerciseId))) {
          const e = byId(x.exerciseId);
          for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) {
            expect(CATALOG.areaOf(m), `${dayId}/${area}: ${x.exerciseId}`).not.toBe(area);
          }
        }
        expectCleanCopy(r.proposal);
      }
    }
  });

  it('legs on Legs A → no training proposal, suggests Not today instead', () => {
    const r = proposeAvoidArea(ctxFor('legs-a'), 'legs', CATALOG);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('wholeDay');
    expect(r.suggest).toBe('postpone');
    expect(r.reply).toMatch(/not today|different day/i);
  });

  it('nothing in the area → no proposal', () => {
    const r = proposeAvoidArea(ctxFor('pull-a'), 'core', CATALOG);
    expect(r).toMatchObject({ ok: false, reason: 'nothingInArea' });
  });

  it('a rest day or a finished day → no proposal', () => {
    const rest = ctxFor('push-a');
    rest.state = { ...rest.state, schedule: { ...rest.state.schedule, restWeekdays: [3] } };
    expect(proposeAvoidArea(rest, 'arms', CATALOG)).toMatchObject({ ok: false, reason: 'restDay' });
    const done = ctxFor('push-a');
    done.sessions = [{ dayId: 'push-a', startedAt: NOW - 7_200_000, endedAt: NOW - 3_600_000 }];
    expect(proposeAvoidArea(done, 'arms', CATALOG)).toMatchObject({
      ok: false,
      reason: 'doneToday',
    });
  });

  it('mid-workout: exercises with logged sets stay as they are', () => {
    const ctx = ctxFor('pull-a', { started: ['One-Arm_Dumbbell_Row'] });
    const rows = todayRows(ctx, proposal(proposeAvoidArea(ctx, 'arms', CATALOG)));
    expect(row(rows, 'One-Arm_Dumbbell_Row')).toEqual(program.days[1]?.exercises[0]);
  });

  it('applies through applyProposal and replaces an older override for today only', () => {
    const ctx = ctxFor('pull-a');
    ctx.state = {
      ...ctx.state,
      overrides: [
        { date: '2026-11-12', rest: true },
        {
          date: TODAY,
          dayId: 'pull-a',
          adjust: { kind: 'swap', exercises: structuredClone(program.days[1]?.exercises ?? []) },
        },
      ],
    };
    const p = proposal(proposeAvoidArea(ctx, 'arms', CATALOG));
    expect(p.next.overrides.filter((o) => o.date === TODAY)).toHaveLength(1);
    expect(p.next.overrides.find((o) => o.date === TODAY)?.adjust?.kind).toBe('avoidArea');
    expect(p.next.overrides).toContainEqual({ date: '2026-11-12', rest: true });
    expect(p.next.plan).toEqual(ctx.state.plan);
    const applied = applyProposal(ctx.state, p, NOW, 'chip');
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.state.plan.edited).toBe(false);
  });
});
