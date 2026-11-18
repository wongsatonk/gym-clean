import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { wordCount } from '../../advice';
import { applyProposal, undoLast } from '../changes';
import { estimateMinutes } from '../estimate';
import { estimateMinutes as dayMinutes } from '../../dayInfo';
import { effectiveDay, seedPlan, upNext, type PlanSession } from '../plan';
import { checkCopy, proposalReply } from '../replies';
import { buildStarterPlan, STARTER_TEMPLATES } from '../starterPlan';
import type { TrainerCatalog } from '../swapCandidates';
import { proposeFocusBlock } from './focusBlock';
import { proposeStarterPlan, type StarterPlanContext } from './starterPlan';
import source from './starterPlan.ts?raw';
import type { BodyArea, Intake, Program, Proposal, TrainerState } from '../../types';

// Made-up intake answers and history; the current plan is the repo's default program.
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;

// 2026-11-11 is a Wednesday.
const TODAY = '2026-11-11';
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (): TrainerState => ({ ...seedPlan(program), version: 4 });
const ctxFor = (over: Partial<StarterPlanContext> = {}): StarterPlanContext => ({
  state: baseState(),
  today: TODAY,
  catalog: CATALOG,
  ...over,
});
const intake = (over: Partial<Intake> = {}): Intake => ({
  goalKind: 'general',
  days: 3,
  sessionMin: 45,
  experience: 'new',
  easyOn: [],
  at: 1_800_000_000_000,
  ...over,
});
const proposal = (r: ReturnType<typeof proposeStarterPlan>): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const copyOf = (p: Proposal) => [
  p.title,
  p.why,
  p.say ?? '',
  ...p.lines.flatMap((l) => [l.before, l.after]),
];
const NO_SESSIONS: PlanSession[] = [];

describe('proposeStarterPlan', () => {
  it('is a plan-scope proposal holding the built plan and schedule; nothing changes yet', () => {
    const ctx = ctxFor();
    const snapshot = structuredClone(ctx.state);
    const i = intake();
    const p = proposal(proposeStarterPlan(ctx, i));
    const built = buildStarterPlan(i, CATALOG, CATALOG);
    expect(p).toMatchObject({ action: 'starterPlan', scope: 'plan', baseVersion: 4 });
    expect(p.next.plan.days).toEqual(built.plan.days);
    expect(p.next.schedule).toEqual(built.schedule);
    expect(p.next.version).toBe(4);
    // His current plan is never replaced without Apply.
    expect(ctx.state).toEqual(snapshot);
  });

  it('keeps the stored seed and marks the plan as his own, so a re-seed never overwrites it', () => {
    const ctx = ctxFor();
    const p = proposal(proposeStarterPlan(ctx, intake()));
    expect(p.next.plan.edited).toBe(true);
    expect(p.next.plan.seededFrom).toBe(ctx.state.plan.seededFrom);
  });

  it('copy comes from the template data and passes the copy check', () => {
    const copy = STARTER_TEMPLATES.copy;
    for (const goalKind of ['muscle', 'fat', 'strength', 'general'] as const) {
      for (const days of [2, 3, 4, 5, 6]) {
        const p = proposal(proposeStarterPlan(ctxFor(), intake({ goalKind, days })));
        expect(p.title).toBe(copy.title.replace('{days}', String(days)));
        expect(p.why).toContain(copy.goals[goalKind]);
        expect(p.why).toContain(`${days} days a week`);
        // The real length: the longest day, as Today shows it ("~N min"), when under 45.
        const real = Math.max(...p.next.plan.days.map((d) => dayMinutes(d)));
        expect(p.why).toContain(`about ${Math.min(real, 45)} min a session`);
        expect(p.why).toContain('until you tap Apply');
        expect(p.say).toBe(copy.say);
        expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
        for (const t of copyOf(p)) {
          expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
          expect(t).not.toMatch(/[{}]/);
        }
        expect(proposalReply(p)).toMatchObject({ title: p.title, why: p.why, say: p.say });
      }
    }
  });

  it('says the real length when the days come out shorter than chosen', () => {
    const i = intake({ goalKind: 'fat', days: 3, sessionMin: 75, experience: 'new' });
    const p = proposal(proposeStarterPlan(ctxFor(), i));
    const real = Math.max(...p.next.plan.days.map((d) => dayMinutes(d)));
    expect(real).toBeLessThan(75);
    expect(p.why).toContain(`about ${real} min a session`);
    expect(p.why).toContain('under the 75 min you picked');
    for (const t of copyOf(p)) expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
    // A plan that uses the time says the chosen length, and no extra sentence.
    const full = proposal(
      proposeStarterPlan(ctxFor(), intake({ days: 4, sessionMin: 45, experience: 'years' })),
    );
    expect(full.why).toContain('about 45 min a session');
    expect(full.why).not.toContain('you picked');
  });

  it('lines: the plan now → the new week, then one line per new day', () => {
    const p = proposal(proposeStarterPlan(ctxFor(), intake({ days: 3 })));
    const built = buildStarterPlan(intake({ days: 3 }), CATALOG, CATALOG);
    expect(p.lines).toHaveLength(1 + built.plan.days.length);
    expect(p.lines[0]).toEqual({
      before: `Now: ${program.days.map((d) => d.name).join(', ')}`,
      after: '3 days a week: Full body A, Full body B, Full body C',
    });
    for (const [n, d] of built.plan.days.entries()) {
      const line = p.lines[n + 1];
      expect(line?.before).toBe(d.name);
      expect(line?.after).toContain(`about ${estimateMinutes(d)} min`);
      for (const r of d.exercises) {
        const name = EXERCISES.find((e) => e.id === r.exerciseId)?.name ?? '';
        expect(line?.after).toContain(name);
      }
    }
  });

  it('Apply replaces the plan and the rotation; Undo brings the old plan back', () => {
    const ctx = ctxFor();
    const p = proposal(proposeStarterPlan(ctx, intake({ days: 3 })));
    const applied = applyProposal(ctx.state, p, NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.change).toMatchObject({ action: 'starterPlan', title: p.title });
    expect(applied.state.plan.days.map((d) => d.name)).toEqual([
      'Full body A',
      'Full body B',
      'Full body C',
    ]);
    expect(applied.state.plan.edited).toBe(true);
    // Wednesday trains (Mon / Wed / Fri): Start runs the first starter day.
    const today = effectiveDay(applied.state, NO_SESSIONS, TODAY);
    expect(today.rest).toBe(false);
    expect(today.day?.name).toBe('Full body A');
    expect(effectiveDay(applied.state, NO_SESSIONS, '2026-11-12').rest).toBe(true);
    // Nothing is finished yet, so the next training date (Friday) starts the rotation too; a
    // last session from the old plan (an id the new rotation doesn't have) restarts it as well.
    expect(upNext(applied.state, NO_SESSIONS, '2026-11-12')).toEqual({
      date: '2026-11-13',
      dayId: applied.state.plan.days[0]?.id,
    });
    const old: PlanSession[] = [
      { dayId: 'push-a', startedAt: NOW - 86_400_000, endedAt: NOW - 80_000_000 },
    ];
    expect(effectiveDay(applied.state, old, TODAY).day?.name).toBe('Full body A');
    const first = applied.state.plan.days[0]?.id ?? '';
    const done: PlanSession[] = [
      ...old,
      { dayId: first, startedAt: NOW, endedAt: NOW + 3_600_000 },
    ];
    expect(upNext(applied.state, done, '2026-11-12')).toEqual({
      date: '2026-11-13',
      dayId: applied.state.plan.days[1]?.id,
    });
    const undone = undoLast(applied.state, [applied.change], NOW + 1000);
    if (!undone.ok) throw new Error(undone.reason);
    expect(undone.state.plan).toEqual(ctx.state.plan);
    expect(undone.state.schedule).toEqual(ctx.state.schedule);
    expect(effectiveDay(undone.state, NO_SESSIONS, TODAY).day).toEqual(program.days[0]);
  });

  it('a proposal built before another change is stale', () => {
    const ctx = ctxFor();
    const p = proposal(proposeStarterPlan(ctx, intake()));
    const moved = { ...ctx.state, version: ctx.state.version + 1 };
    expect(applyProposal(moved, p, NOW, 'chip')).toEqual({ ok: false, reason: 'stale' });
  });

  it('drops dated changes from today on (they were for the old days); rest days and the past stay', () => {
    const old = program.days[0];
    if (!old) throw new Error('no day');
    const state: TrainerState = {
      ...baseState(),
      overrides: [
        {
          date: '2026-11-09',
          dayId: old.id,
          adjust: { kind: 'lighter', exercises: old.exercises },
        },
        { date: TODAY, dayId: old.id, adjust: { kind: 'lighter', exercises: old.exercises } },
        { date: '2026-11-13', dayId: old.id },
        { date: '2026-11-14', rest: true },
      ],
    };
    const p = proposal(proposeStarterPlan(ctxFor({ state }), intake()));
    expect(p.next.overrides.map((o) => o.date)).toEqual(['2026-11-09', '2026-11-14']);
    const ids = new Set(p.next.plan.days.map((d) => d.id));
    for (const o of p.next.overrides.filter((x) => x.date >= TODAY))
      expect(o.dayId === undefined || ids.has(o.dayId)).toBe(true);
  });

  it('ends a running focus block the day before, and drops one that has not started', () => {
    const base = { ...baseState(), schedule: { ...baseState().schedule, restWeekdays: [0] } };
    const withBlock = (startDate: string): TrainerState => {
      const r = proposeFocusBlock(
        { state: base, sessions: NO_SESSIONS, today: startDate, unit: 'kg', lastWeightKg: {} },
        { group: 'chest', weeks: 4, weekdays: [1, 2, 4, 5], startDate },
        CATALOG,
      );
      if (!r.ok) throw new Error(r.reason);
      return r.proposal.next;
    };
    const running = withBlock('2026-11-02');
    const p = proposal(proposeStarterPlan(ctxFor({ state: running }), intake()));
    expect(p.next.blocks).toHaveLength(1);
    expect(p.next.blocks?.[0]?.days.at(-1)?.date).toBe('2026-11-10');
    expect(effectiveDay(p.next, NO_SESSIONS, TODAY).blockId).toBeUndefined();
    expect(effectiveDay(p.next, NO_SESSIONS, TODAY).day?.name).toBe('Full body A');

    const future = withBlock('2026-11-16');
    const q = proposal(proposeStarterPlan(ctxFor({ state: future }), intake()));
    expect(q.next.blocks).toEqual([]);
    // No blocks before → still none.
    expect(proposal(proposeStarterPlan(ctxFor(), intake())).next.blocks).toBeUndefined();
  });

  it('honours the go-easy areas of the intake and the standing list', () => {
    const areaOf = CATALOG.areaOf;
    const primaryAreas = (p: Proposal) =>
      new Set(
        p.next.plan.days.flatMap((d) =>
          d.exercises.flatMap(
            (r) =>
              EXERCISES.find((e) => e.id === r.exerciseId)?.primaryMuscles.map((m) => areaOf(m)) ??
              [],
          ),
        ),
      );
    const fromIntake = proposal(proposeStarterPlan(ctxFor(), intake({ easyOn: ['shoulders'] })));
    expect(primaryAreas(fromIntake).has('shoulders')).toBe(false);
    expect(fromIntake.why).toContain('It goes easy on your shoulders.');
    const standing: BodyArea[] = ['arms'];
    const both = proposal(
      proposeStarterPlan(
        ctxFor({ state: { ...baseState(), easyOn: standing } }),
        intake({ easyOn: ['shoulders'] }),
      ),
    );
    expect(primaryAreas(both).has('shoulders')).toBe(false);
    expect(primaryAreas(both).has('arms')).toBe(false);
    expect(both.why).toContain('It goes easy on your shoulders and arms.');
    // The standing list itself only changes through its own proposal.
    expect(both.next.easyOn).toEqual(standing);
    expect(fromIntake.next.easyOn).toBeUndefined();
    const plain = proposal(proposeStarterPlan(ctxFor(), intake()));
    expect(plain.why).not.toContain('goes easy');
    expect(primaryAreas(plain).has('shoulders')).toBe(true);
  });

  it('refuses days outside 2–6 and a gym that can do nothing', () => {
    for (const days of [1, 7]) {
      expect(proposeStarterPlan(ctxFor(), intake({ days }))).toEqual({
        ok: false,
        reason: 'nothingToChange',
        reply: STARTER_TEMPLATES.copy.badDays,
      });
    }
    const none: TrainerCatalog = { ...CATALOG, canDo: () => false };
    expect(proposeStarterPlan(ctxFor({ catalog: none }), intake())).toEqual({
      ok: false,
      reason: 'noCandidate',
      reply: STARTER_TEMPLATES.copy.noKit,
    });
    for (const t of [STARTER_TEMPLATES.copy.badDays, STARTER_TEMPLATES.copy.noKit])
      expect(checkCopy(t).ok).toBe(true);
  });

  it('is deterministic, and nothing in it is written for one person', () => {
    const a = proposeStarterPlan(ctxFor(), intake({ days: 5, easyOn: ['legs'] }));
    const b = proposeStarterPlan(ctxFor(), intake({ days: 5, easyOn: ['legs'], at: 7 }));
    expect(a).toEqual(b);
    expect(source).not.toMatch(/wongsaton|kampusan|his wife|\bhusband\b/i);
    for (const e of EXERCISES) expect(source.includes(e.id), e.id).toBe(false);
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
