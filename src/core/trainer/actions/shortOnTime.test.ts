import { describe, expect, it } from 'vitest';
import { EXERCISES, trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { wordCount } from '../../advice';
import { applyProposal, undoLast } from '../changes';
import { estimateMinutes } from '../estimate';
import { effectiveDay, seedPlan, type PlanSession } from '../plan';
import { checkCopy, proposalReply } from '../replies';
import type { TrainerCatalog } from '../swapCandidates';
import { SHORT_ON_TIME, TIME_RULES } from '../timeRules';
import { proposeAvoidArea } from './avoidArea';
import { proposeLighter } from './lighter';
import type { ActionContext } from './lighter';
import { ALREADY_FITS, mainLiftIds, proposeShortOnTime, shortOptionFor } from './shortOnTime';
import source from './shortOnTime.ts?raw';
import type { PlannedExercise, Program, Proposal, TrainerState } from '../../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);
const planDay = (id: string) => {
  const d = program.days.find((x) => x.id === id);
  if (!d) throw new Error(`no day ${id}`);
  return d;
};
const mechanic = (id: string) => EXERCISES.find((e) => e.id === id)?.mechanic;

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
const proposal = (r: ReturnType<typeof proposeShortOnTime>): Proposal => {
  if (!r.ok) throw new Error(`no proposal: ${r.reason}`);
  return r.proposal;
};
const todayRows = (ctx: ActionContext, p: Proposal): PlannedExercise[] =>
  effectiveDay(p.next, ctx.sessions, ctx.today).day?.exercises ?? [];
const copyOf = (p: Proposal) => [
  p.title,
  p.why,
  p.say ?? '',
  ...p.lines.flatMap((l) => [l.before, l.after]),
];

describe('shortOptionFor', () => {
  it('offers 20 / 30 / 45 (data)', () => {
    expect(SHORT_ON_TIME.options).toEqual([20, 30, 45]);
  });

  it('snaps a typed length to the nearest lower option', () => {
    expect(shortOptionFor(20)).toBe(20);
    expect(shortOptionFor(25)).toBe(20);
    expect(shortOptionFor(30)).toBe(30);
    expect(shortOptionFor(44)).toBe(30);
    expect(shortOptionFor(45)).toBe(45);
    expect(shortOptionFor(90)).toBe(45);
  });

  it('below the shortest option it is the shortest one', () => {
    expect(shortOptionFor(10)).toBe(20);
  });
});

describe('mainLiftIds', () => {
  it("is the day's first two compound exercises", () => {
    expect(mainLiftIds(planDay('push-a').exercises, CATALOG)).toEqual([
      'Dumbbell_Bench_Press',
      'Incline_Dumbbell_Press',
    ]);
    // Push B: an isolation move sits between the two.
    expect(mainLiftIds(planDay('push-b').exercises, CATALOG)).toEqual([
      'Incline_Dumbbell_Press',
      'Dumbbell_Shoulder_Press',
    ]);
  });

  it('is the first row when the day has no compound exercise', () => {
    const rows = planDay('pull-a').exercises.filter((p) => mechanic(p.exerciseId) !== 'compound');
    expect(rows.length).toBeGreaterThan(1);
    expect(mainLiftIds(rows, CATALOG)).toEqual([rows[0]?.exerciseId]);
  });
});

describe('proposeShortOnTime', () => {
  for (const dayId of ROTATION) {
    for (const minutes of SHORT_ON_TIME.options) {
      it(`${dayId} in ${minutes} min: fits, main lifts kept as planned`, () => {
        const ctx = ctxFor(dayId);
        const planned = planDay(dayId);
        const r = proposeShortOnTime(ctx, minutes, CATALOG);
        if (estimateMinutes(planned) <= minutes) {
          expect(r).toMatchObject({ ok: false, reason: 'nothingToChange', reply: ALREADY_FITS });
          return;
        }
        const p = proposal(r);
        expect(p).toMatchObject({ action: 'shortOnTime', scope: 'today', baseVersion: 3 });
        const rows = todayRows(ctx, p);
        expect(estimateMinutes({ exercises: rows })).toBeLessThanOrEqual(minutes);
        for (const id of mainLiftIds(planned.exercises, CATALOG)) {
          expect(
            rows.find((x) => x.exerciseId === id),
            id,
          ).toEqual(planned.exercises.find((x) => x.exerciseId === id));
        }
        // Day order kept; nothing added; trimmed rows keep at least 2 sets.
        const order = planned.exercises.map((x) => x.exerciseId);
        const ids = rows.map((x) => x.exerciseId);
        expect(ids).toEqual(order.filter((id) => ids.includes(id)));
        for (const row of rows) {
          const before = planned.exercises.find((x) => x.exerciseId === row.exerciseId);
          expect(row.sets).toBeLessThanOrEqual(before?.sets ?? 0);
          expect(row.sets).toBeGreaterThanOrEqual(Math.min(2, before?.sets ?? 0));
          // Pairs point at each other, sit next to each other and rest the pair rest.
          if (row.pairWith === undefined) continue;
          const partner = rows.find((x) => x.exerciseId === row.pairWith);
          expect(partner?.pairWith).toBe(row.exerciseId);
          expect(Math.abs(ids.indexOf(row.exerciseId) - ids.indexOf(row.pairWith))).toBe(1);
          expect(row.restSec).toBeLessThanOrEqual(TIME_RULES.pairRestSec);
        }
        // The plan itself is untouched: today only.
        expect(p.next.plan).toEqual(ctx.state.plan);
        expect(p.next.overrides).toHaveLength(1);
        expect(p.next.overrides[0]).toMatchObject({ date: TODAY, dayId });
        expect(p.next.overrides[0]?.adjust?.kind).toBe('shortOnTime');
        // Copy.
        expect(p.title).toBe(`Short on time: ${minutes} min`);
        expect(p.lines.length).toBeGreaterThan(0);
        for (const t of copyOf(p)) expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
        expect(wordCount(p.say ?? '')).toBeLessThanOrEqual(8);
        expect(proposalReply(p)).toMatchObject({ title: p.title, why: p.why, say: p.say });
      });
    }
  }

  it('a day that is already short enough → "Your day already fits."', () => {
    expect(ALREADY_FITS).toBe('Your day already fits.');
    const r = proposeShortOnTime(ctxFor('pull-b'), 45, CATALOG);
    expect(r).toEqual({ ok: false, reason: 'nothingToChange', reply: 'Your day already fits.' });
    // A typed length above the options is checked as typed, not snapped down first.
    expect(estimateMinutes(planDay('push-a'))).toBeGreaterThan(45);
    expect(proposeShortOnTime(ctxFor('push-a'), 60, CATALOG)).toMatchObject({
      ok: false,
      reply: ALREADY_FITS,
    });
  });

  it('"I have 25 min" builds the 20-minute version', () => {
    const ctx = ctxFor('push-a');
    const p = proposal(proposeShortOnTime(ctx, 25, CATALOG));
    expect(p.title).toBe('Short on time: 20 min');
    expect(estimateMinutes({ exercises: todayRows(ctx, p) })).toBeLessThanOrEqual(20);
    expect(p.next).toEqual(proposal(proposeShortOnTime(ctx, 20, CATALOG)).next);
  });

  it('pairs before it trims, trims before it drops', () => {
    // Push A is a few minutes over 45: pairing its last two accessories is enough.
    const ctx = ctxFor('push-a');
    const planned = planDay('push-a').exercises;
    const p = proposal(proposeShortOnTime(ctx, 45, CATALOG));
    const rows = todayRows(ctx, p);
    expect(rows).toHaveLength(planned.length);
    expect(rows.map((x) => x.sets)).toEqual(planned.map((x) => x.sets));
    expect(rows.filter((x) => x.pairWith !== undefined).map((x) => x.exerciseId)).toEqual([
      'Standing_Dumbbell_Triceps_Extension',
      'Pushups',
    ]);
    expect(rows.every((x) => x.adjusted === undefined)).toBe(true);
    expect(p.lines).toEqual([
      {
        before: 'Standing Dumbbell Triceps Extension + Pushups',
        after: 'Back to back, 45 s rest',
      },
    ]);
    expect(p.next.overrides[0]?.adjust?.replaced).toEqual([]);
    // 30 min needs trims too, and they are marked for the "Adjusted" badge.
    const tighter = todayRows(ctx, proposal(proposeShortOnTime(ctx, 30, CATALOG)));
    const trimmed = tighter.filter(
      (r) => r.sets < (planned.find((x) => x.exerciseId === r.exerciseId)?.sets ?? 0),
    );
    expect(trimmed.length).toBeGreaterThan(0);
    for (const r of trimmed) expect(r.adjusted).toBe('lighter');
  });

  it('lines name what is paired, trimmed and removed', () => {
    const ctx = ctxFor('push-a');
    const p = proposal(proposeShortOnTime(ctx, 30, CATALOG));
    const rows = todayRows(ctx, p);
    const planned = planDay('push-a').exercises;
    const gone = planned.filter((x) => !rows.some((r) => r.exerciseId === x.exerciseId));
    expect(p.lines.filter((l) => l.after === 'Removed today')).toHaveLength(gone.length);
    const trimmed = rows.filter(
      (r) => r.sets < (planned.find((x) => x.exerciseId === r.exerciseId)?.sets ?? 0),
    );
    for (const r of trimmed)
      expect(p.lines.some((l) => l.after.startsWith(`${r.sets} × `))).toBe(true);
    const pairs = rows.filter((r) => r.pairWith !== undefined).length / 2;
    expect(p.lines.filter((l) => l.after.startsWith('Back to back'))).toHaveLength(pairs);
    expect(p.why).toContain(`${estimateMinutes({ exercises: rows })} min`);
    // The row map records what left the day.
    expect(p.next.overrides[0]?.adjust?.replaced).toEqual(
      gone.map((x) => ({ fromId: x.exerciseId, toId: null })),
    );
  });

  it('Apply / Undo round trip', () => {
    const ctx = ctxFor('legs-a');
    const p = proposal(proposeShortOnTime(ctx, 20, CATALOG));
    const applied = applyProposal(ctx.state, p, NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.change.action).toBe('shortOnTime');
    expect(applied.state.plan.edited).toBe(false);
    const after = effectiveDay(applied.state, ctx.sessions, TODAY);
    expect(estimateMinutes({ exercises: after.day?.exercises ?? [] })).toBeLessThanOrEqual(20);
    // Tomorrow is the next rotation day, as planned.
    expect(effectiveDay(applied.state, ctx.sessions, '2026-11-12').adjusted).toBeNull();
    const undone = undoLast(applied.state, [applied.change], NOW + 1000);
    if (!undone.ok) throw new Error(undone.reason);
    expect(effectiveDay(undone.state, ctx.sessions, TODAY).day).toEqual(planDay('legs-a'));
    expect(undone.state.overrides).toEqual([]);
  });

  it('asking again rebuilds from the planned day: less time shortens, more time lengthens', () => {
    const ctx = ctxFor('push-a');
    const apply = (state: TrainerState, minutes: number) => {
      const r = applyProposal(
        state,
        proposal(proposeShortOnTime({ ...ctx, state }, minutes, CATALOG)),
        NOW,
        'chip',
      );
      if (!r.ok) throw new Error(r.reason);
      return r.state;
    };
    const fresh = (minutes: number) =>
      todayRows(ctx, proposal(proposeShortOnTime(ctx, minutes, CATALOG)));
    const at20 = apply(ctx.state, 20);
    const twenty = estimateMinutes({ exercises: todayRows(ctx, { next: at20 } as Proposal) });
    // More time: built from the plan day, exactly as if asked first.
    const more = proposal(proposeShortOnTime({ ...ctx, state: at20 }, 30, CATALOG));
    const rows = todayRows(ctx, more);
    expect(rows).toEqual(fresh(30));
    expect(estimateMinutes({ exercises: rows })).toBeGreaterThan(twenty);
    expect(estimateMinutes({ exercises: rows })).toBeLessThanOrEqual(30);
    expect(more.next.overrides).toHaveLength(1);
    expect(more.next.overrides[0]?.adjust?.replaced).toEqual(
      proposal(proposeShortOnTime(ctx, 30, CATALOG)).next.overrides[0]?.adjust?.replaced,
    );
    // Less time from the 30-minute version: also from the plan day.
    const at30 = apply(ctx.state, 30);
    expect(
      todayRows(ctx, proposal(proposeShortOnTime({ ...ctx, state: at30 }, 20, CATALOG))),
    ).toEqual(fresh(20));
    // The same length again: nothing to change.
    expect(proposeShortOnTime({ ...ctx, state: at30 }, 30, CATALOG)).toEqual({
      ok: false,
      reason: 'nothingToChange',
      reply: 'Today is already set for 30 min.',
    });
  });

  it('when the whole planned day fits again, it offers the full day back', () => {
    const ctx = ctxFor('push-a');
    const full = estimateMinutes(planDay('push-a'));
    const short = applyProposal(
      ctx.state,
      proposal(proposeShortOnTime(ctx, 30, CATALOG)),
      NOW,
      'chip',
    );
    if (!short.ok) throw new Error(short.reason);
    const back = proposal(proposeShortOnTime({ ...ctx, state: short.state }, full + 5, CATALOG));
    expect(back).toMatchObject({
      action: 'shortOnTime',
      scope: 'today',
      title: 'Back to the full day',
    });
    expect(back.next.overrides).toEqual([]);
    expect(effectiveDay(back.next, ctx.sessions, TODAY).day).toEqual(planDay('push-a'));
    expect(back.lines).toHaveLength(1);
    expect(back.lines[0]?.after).toBe(`Full day · about ${full} min`);
    for (const t of copyOf(back)) expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
    expect(wordCount(back.say ?? '')).toBeLessThanOrEqual(8);
    // Without a shorter version in place, a day that fits is simply left alone.
    expect(proposeShortOnTime(ctx, full + 5, CATALOG)).toMatchObject({ reply: ALREADY_FITS });
  });

  it('other changes later today stack on the shorter day and keep it', () => {
    const ctx = ctxFor('push-a');
    const short = applyProposal(
      ctx.state,
      proposal(proposeShortOnTime(ctx, 30, CATALOG)),
      NOW,
      'chip',
    );
    if (!short.ok) throw new Error(short.reason);
    const shortRows = effectiveDay(short.state, ctx.sessions, TODAY).day?.exercises ?? [];
    const lighter = proposeLighter({ ...ctx, state: short.state });
    if (!lighter.ok) throw new Error(lighter.reason);
    const rows = todayRows(ctx, lighter.proposal);
    expect(rows.map((r) => r.exerciseId)).toEqual(shortRows.map((r) => r.exerciseId));
  });

  it('stacks on an earlier change today (go easy on an area)', () => {
    const ctx = ctxFor('push-a');
    const easy = proposeAvoidArea(ctx, 'arms', CATALOG);
    if (!easy.ok) throw new Error(easy.reason);
    const applied = applyProposal(ctx.state, easy.proposal, NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    const before = effectiveDay(applied.state, ctx.sessions, TODAY).day?.exercises ?? [];
    const next = { ...ctx, state: applied.state };
    const p = proposal(proposeShortOnTime(next, 30, CATALOG));
    const rows = todayRows(next, p);
    expect(estimateMinutes({ exercises: rows })).toBeLessThanOrEqual(30);
    // Rows are the eased day's rows, never the plan's: the lighter weights stay.
    for (const r of rows) {
      const b = before.find((x) => x.exerciseId === r.exerciseId);
      expect(b, r.exerciseId).toBeDefined();
      expect(r.weightKgToday).toBe(b?.weightKgToday);
    }
    // The earlier row map is kept (what the avoid-area change removed or swapped).
    const earlier = applied.state.overrides[0]?.adjust?.replaced ?? [];
    for (const e of earlier)
      expect(p.next.overrides[0]?.adjust?.replaced?.some((x) => x.fromId === e.fromId)).toBe(true);
  });

  it('leaves exercises with logged sets alone', () => {
    const started = ['Pushups'];
    const ctx = ctxFor('push-a', { started });
    const p = proposal(proposeShortOnTime(ctx, 30, CATALOG));
    const rows = todayRows(ctx, p);
    expect(rows.find((r) => r.exerciseId === 'Pushups')).toEqual(
      planDay('push-a').exercises.find((r) => r.exerciseId === 'Pushups'),
    );
  });

  it('refuses on a rest day and on a day already done', () => {
    const rest = ctxFor('push-a');
    rest.state.schedule.restWeekdays = [3];
    expect(proposeShortOnTime(rest, 30, CATALOG)).toMatchObject({ ok: false, reason: 'restDay' });
    const done = ctxFor('pull-a');
    const startedAt = new Date(2026, 10, 11, 8, 0).getTime();
    const sessions = [...done.sessions, { dayId: 'pull-a', startedAt, endedAt: startedAt + 1 }];
    expect(proposeShortOnTime({ ...done, sessions }, 30, CATALOG)).toMatchObject({
      ok: false,
      reason: 'doneToday',
    });
  });

  it('says so when today is already at its shortest', () => {
    const ctx = ctxFor('pull-b');
    const r = proposeShortOnTime(ctx, 5, CATALOG);
    // 5 min snaps up to the 20-minute version, which is a real change for Pull B.
    expect(proposal(r).title).toBe('Short on time: 20 min');
    const applied = applyProposal(ctx.state, proposal(r), NOW, 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    const again = proposeShortOnTime({ ...ctx, state: applied.state }, 5, CATALOG);
    expect(again).toEqual({
      ok: false,
      reason: 'nothingToChange',
      reply: 'Today is already set for 20 min.',
    });
    // A day that is shorter than the shortest option as planned.
    const tiny = ctxFor('pull-b');
    const first = tiny.state.plan.days.find((d) => d.id === 'pull-b');
    if (!first) throw new Error('no day');
    first.exercises = first.exercises.slice(0, 2);
    const t = proposeShortOnTime(tiny, 5, CATALOG);
    expect(t.ok).toBe(false);
    if (!t.ok) {
      expect(t.reply).toMatch(/^Today is already about \d+ min\./);
      expect(checkCopy(t.reply).ok).toBe(true);
    }
  });

  it('is pure and deterministic', () => {
    const ctx = ctxFor('push-a');
    const snapshot = structuredClone(ctx.state);
    const a = proposeShortOnTime(ctx, 30, CATALOG);
    const b = proposeShortOnTime(ctx, 30, CATALOG);
    expect(a).toEqual(b);
    expect(ctx.state).toEqual(snapshot);
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
