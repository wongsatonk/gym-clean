import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../testkit/trainerCatalog';
import programJson from '../../data/program.json';
import { seedPlan } from './plan';
import { buildFocusBlock } from './focusBlock';
import { FOCUS_RULES } from './focusRules';
import { SHORT_ON_TIME } from './timeRules';
import type { CoachContext } from './coach';
import type { StallSession } from './actions/stall';
import {
  PROPOSAL_ACTIONS,
  TOOL_EXCEPTIONS,
  TRAINER_TOOLS,
  readToolNames,
  runToolCall,
  toolContract,
  toolContractJson,
  type ToolSchema,
} from './tools';
import type { BodyArea, Program, ProposalAction, SetLog, TrainerState } from '../types';

// Made-up history on the repo's default program (public, no personal numbers).
const CATALOG = trainerCatalog();
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);
const TODAY = '2026-11-11'; // a Wednesday
const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
const baseState = (): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 5, schedule: { ...s.schedule, restWeekdays: [0] } };
};

function ctxFor(dayId: string, over: Partial<CoachContext> = {}): CoachContext {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const sessions: StallSession[] = [
    { sessionId: 'p1', dayId: prev, startedAt: at(11, 10), endedAt: at(11, 10, 19) },
  ];
  return {
    phase: 'today',
    state: baseState(),
    sessions,
    sets: [],
    today: TODAY,
    unit: 'kg',
    lastWeightKg: {},
    logged: [],
    catalog: CATALOG,
    m7Available: false,
    ...over,
  };
}

const tool = (name: string) => {
  const t = TRAINER_TOOLS.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

describe('tool list', () => {
  it('has one propose tool per ProposalAction, minus the tested exception list', () => {
    const actions = TRAINER_TOOLS.flatMap((t) => (t.readOnly ? [] : [t.action]));
    expect(new Set(actions).size).toBe(actions.length);
    const expected = PROPOSAL_ACTIONS.filter((a) => !(a in TOOL_EXCEPTIONS));
    expect([...actions].sort()).toEqual([...expected].sort());
  });

  it('keeps the exception list to starterPlan (intake only)', () => {
    expect(TOOL_EXCEPTIONS).toEqual({ starterPlan: expect.stringContaining('intake') as string });
  });

  it('lists every ProposalAction (compile-time exhaustive list)', () => {
    // The type-level check lives in tools.ts; here the runtime list has no duplicates.
    expect(new Set(PROPOSAL_ACTIONS).size).toBe(PROPOSAL_ACTIONS.length);
    const sample: ProposalAction = 'easyOn';
    expect(PROPOSAL_ACTIONS).toContain(sample);
  });

  it('names the planned tools', () => {
    expect(TRAINER_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        'adjustStalledExercise',
        'avoidBodyArea',
        'deloadWeek',
        'doDayToday',
        'exerciseInfo',
        'foodIdeas',
        'lighterToday',
        'postponeSession',
        'progressSummary',
        'proposeFocusBlock',
        'setEasyOn',
        'shortOnTime',
        'suggestFood',
        'swapExercise',
        'weekSummary',
      ].sort(),
    );
  });

  it('flags the four read-only tools; only exerciseInfo takes an argument', () => {
    expect(readToolNames()).toEqual([
      'weekSummary',
      'progressSummary',
      'exerciseInfo',
      'foodIdeas',
    ]);
    for (const name of readToolNames()) {
      const t = tool(name);
      expect(t.readOnly).toBe(true);
      const keys = Object.keys(t.parameters.properties);
      expect(keys).toEqual(name === 'exerciseInfo' ? ['exerciseId'] : []);
    }
  });

  it('uses only @Generable-expressible schemas (enums, patterned strings, ranged ints, arrays of those)', () => {
    const ok = (s: ToolSchema): boolean => {
      if (s.type === 'string') return s.enum !== undefined || s.pattern !== undefined;
      if (s.type === 'integer') return Number.isInteger(s.minimum) && Number.isInteger(s.maximum);
      return s.maxItems !== undefined && ok(s.items);
    };
    for (const t of TRAINER_TOOLS) {
      expect(t.parameters.type).toBe('object');
      expect(t.parameters.additionalProperties).toBe(false);
      for (const r of t.parameters.required) expect(t.parameters.properties).toHaveProperty(r);
      for (const s of Object.values(t.parameters.properties)) {
        expect(ok(s)).toBe(true);
        expect(s.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps names and descriptions short (they go into a 4,096-token session)', () => {
    for (const t of TRAINER_TOOLS) {
      expect(t.description.length).toBeLessThanOrEqual(90);
      for (const s of Object.values(t.parameters.properties))
        expect(s.description.length).toBeLessThanOrEqual(60);
    }
  });

  it('takes area and group enums from the body areas', () => {
    const areas: BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];
    const area = tool('avoidBodyArea').parameters.properties.area;
    expect(area?.type === 'string' && area.enum).toEqual(areas);
    const group = tool('proposeFocusBlock').parameters.properties.group;
    expect(group?.type === 'string' && group.enum).toEqual(areas);
  });

  it('proposeFocusBlock takes params only (group, weeks, weekdays), never days', () => {
    const p = tool('proposeFocusBlock').parameters;
    expect(Object.keys(p.properties).sort()).toEqual(['group', 'weekdays', 'weeks']);
    expect(p.properties.weeks).toMatchObject({
      type: 'integer',
      minimum: FOCUS_RULES.weeks.min,
      maximum: FOCUS_RULES.weeks.max,
    });
  });

  it('shortOnTime takes minutes in the offered range', () => {
    const m = tool('shortOnTime').parameters.properties.minutes;
    expect(m).toMatchObject({
      type: 'integer',
      minimum: Math.min(...SHORT_ON_TIME.options),
      maximum: Math.max(...SHORT_ON_TIME.options),
    });
  });
});

describe('contract file', () => {
  const path = new URL('./tools.contract.json', import.meta.url);

  it('tools.contract.json equals the generated contract (UPDATE_CONTRACT=1 rewrites it)', () => {
    const generated = toolContractJson();
    if (process.env.UPDATE_CONTRACT === '1') writeFileSync(path, generated);
    expect(readFileSync(path, 'utf8')).toBe(generated);
  });

  it('carries no functions and every tool once', () => {
    const c = toolContract();
    expect(c.tools.map((t) => t.name)).toEqual(TRAINER_TOOLS.map((t) => t.name));
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });
});

describe('runToolCall: validation', () => {
  const ctx = ctxFor('push-a');

  it('rejects an unknown tool and a read-only tool with a short reason', () => {
    const a = runToolCall({ name: 'deleteEverything', args: {} }, ctx);
    expect(a).toEqual({ ok: false, kind: 'unknownTool', reason: expect.any(String) as string });
    const b = runToolCall({ name: 'weekSummary', args: {} }, ctx);
    expect(b.ok).toBe(false);
  });

  it('rejects unknown and missing arguments', () => {
    const extra = runToolCall({ name: 'lighterToday', args: { sets: 1 } }, ctx);
    expect(extra.ok).toBe(false);
    const missing = runToolCall({ name: 'avoidBodyArea', args: {} }, ctx);
    expect(missing.ok).toBe(false);
  });

  it('rejects an unknown exercise', () => {
    const r = runToolCall({ name: 'swapExercise', args: { exerciseId: 'Moon_Press' } }, ctx);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reason).toMatch(/exercise/i);
  });

  it('rejects a past date and a date that does not exist', () => {
    const past = runToolCall(
      { name: 'postponeSession', args: { from: '2026-11-09', to: '2026-11-12' } },
      ctx,
    );
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.reason).toMatch(/past/i);
    const fake = runToolCall({ name: 'postponeSession', args: { to: '2026-02-30' } }, ctx);
    expect(fake.ok).toBe(false);
    const badFormat = runToolCall({ name: 'postponeSession', args: { to: 'Friday' } }, ctx);
    expect(badFormat.ok).toBe(false);
  });

  it('rejects a bad group and weeks out of 2–6', () => {
    const group = runToolCall(
      { name: 'proposeFocusBlock', args: { group: 'glutes', weeks: 4, weekdays: [1, 3, 5] } },
      ctx,
    );
    expect(group.ok).toBe(false);
    for (const weeks of [1, 7, 3.5]) {
      const r = runToolCall(
        { name: 'proposeFocusBlock', args: { group: 'chest', weeks, weekdays: [1, 3, 5] } },
        ctx,
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/weeks/);
    }
  });

  it('rejects focus-block days sent by the model and bad weekdays', () => {
    const days = runToolCall(
      {
        name: 'proposeFocusBlock',
        args: { group: 'chest', weeks: 4, weekdays: [1, 3, 5], days: [] },
      },
      ctx,
    );
    expect(days.ok).toBe(false);
    for (const weekdays of [
      [1, 3],
      [1, 1, 3],
      [1, 3, 9],
      [0, 1, 2, 3, 4, 5, 6],
    ]) {
      const r = runToolCall(
        { name: 'proposeFocusBlock', args: { group: 'chest', weeks: 4, weekdays } },
        ctx,
      );
      expect(r.ok).toBe(false);
    }
  });

  it('rejects wrong types', () => {
    expect(runToolCall({ name: 'shortOnTime', args: { minutes: '30' } }, ctx).ok).toBe(false);
    expect(runToolCall({ name: 'shortOnTime', args: { minutes: 90 } }, ctx).ok).toBe(false);
    expect(runToolCall({ name: 'setEasyOn', args: { add: 'arms' } }, ctx).ok).toBe(false);
    expect(runToolCall({ name: 'setEasyOn', args: {} }, ctx).ok).toBe(false);
  });

  it('every reason is short', () => {
    const bad = [
      { name: 'nope', args: {} },
      { name: 'swapExercise', args: { exerciseId: 'Moon_Press' } },
      { name: 'postponeSession', args: { from: '2026-01-01', to: '2026-01-02' } },
      { name: 'proposeFocusBlock', args: { group: 'chest', weeks: 9, weekdays: [1, 3, 5] } },
    ];
    for (const call of bad) {
      const r = runToolCall(call, ctx);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.split(/\s+/).length).toBeLessThanOrEqual(12);
    }
  });

  it('refuses every change after a red flag', () => {
    const r = runToolCall({ name: 'lighterToday', args: {} }, ctx, { safety: 'redFlag' });
    expect(r.ok).toBe(false);
  });

  it('mid-workout allows only go easy, lighter and swap', () => {
    const w: CoachContext = {
      ...ctx,
      phase: 'workout',
      sessions: [...ctx.sessions, { sessionId: 'now', dayId: 'push-a', startedAt: at(11, 11) }],
    };
    expect(runToolCall({ name: 'deloadWeek', args: {} }, w).ok).toBe(false);
    expect(runToolCall({ name: 'suggestFood', args: {} }, w).ok).toBe(false);
    expect(runToolCall({ name: 'lighterToday', args: {} }, w).ok).toBe(true);
    expect(runToolCall({ name: 'avoidBodyArea', args: { area: 'shoulders' } }, w).ok).toBe(true);
  });
});

describe('runToolCall: a call returns a Proposal, never a state', () => {
  const calls = [
    { name: 'postponeSession', args: {} },
    { name: 'postponeSession', args: { mode: 'pushWeek' } },
    { name: 'postponeSession', args: { from: '2026-11-12', to: '2026-11-13' } },
    { name: 'avoidBodyArea', args: { area: 'shoulders' } },
    { name: 'lighterToday', args: {} },
    { name: 'deloadWeek', args: {} },
    { name: 'swapExercise', args: { exerciseId: 'Dumbbell_Bench_Press' } },
    { name: 'swapExercise', args: { exerciseId: 'Dumbbell_Bench_Press', scope: 'plan' } },
    { name: 'proposeFocusBlock', args: { group: 'chest', weeks: 4, weekdays: [1, 3, 5] } },
    { name: 'shortOnTime', args: { minutes: 30 } },
    { name: 'setEasyOn', args: { add: ['shoulders'] } },
    { name: 'doDayToday', args: { day: 'Pull B' } },
  ];

  for (const call of calls) {
    it(`${call.name} ${JSON.stringify(call.args)}`, () => {
      const ctx = ctxFor('push-a');
      const before = structuredClone(ctx.state);
      const r = runToolCall(call, ctx);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.proposal).toBeDefined();
      expect(r.proposal?.action).toBe(
        tool(call.name).readOnly ? undefined : (tool(call.name) as { action: string }).action,
      );
      expect(r.proposal?.baseVersion).toBe(5);
      // Nothing applied: the context's state is untouched and the result is not a state.
      expect(ctx.state).toEqual(before);
      expect(r).not.toHaveProperty('plan');
      expect(r).not.toHaveProperty('version');
      expect(r.proposal?.say?.split(/\s+/).length ?? 0).toBeLessThanOrEqual(8);
    });
  }

  it('swapExercise with toId proposes that swap', () => {
    const ctx = ctxFor('push-a');
    const first = runToolCall(
      { name: 'swapExercise', args: { exerciseId: 'Dumbbell_Bench_Press' } },
      ctx,
    );
    expect(first.ok).toBe(true);
    const ex = first.ok ? first.proposal?.next.overrides[0]?.adjust?.exercises : undefined;
    expect(ex).toBeDefined();
    const bad = runToolCall(
      { name: 'swapExercise', args: { exerciseId: 'Dumbbell_Bench_Press', toId: 'Barbell_Squat' } },
      ctx,
    );
    expect(bad.ok).toBe(false);
  });

  it('proposeFocusBlock goes through buildFocusBlock (the model never sends days)', () => {
    const ctx = ctxFor('push-a');
    const r = runToolCall(
      { name: 'proposeFocusBlock', args: { group: 'chest', weeks: 4, weekdays: [1, 3, 5] } },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const built = buildFocusBlock(
      ctx.state,
      CATALOG,
      { group: 'chest', weeks: 4, weekdays: [1, 3, 5], startDate: TODAY },
      ctx.sessions,
    );
    expect(r.focusBlock).toEqual(built);
    expect(r.proposal?.next.blocks?.at(-1)).toEqual(built);
  });

  it('a focus block starts tomorrow when today already has a session', () => {
    const ctx = ctxFor('push-a');
    const busy = {
      ...ctx,
      sessions: [
        ...ctx.sessions,
        { sessionId: 't', dayId: 'push-a', startedAt: at(11, 11, 7), endedAt: at(11, 11, 8) },
      ],
    };
    const r = runToolCall(
      { name: 'proposeFocusBlock', args: { group: 'chest', weeks: 2, weekdays: [1, 3, 5] } },
      busy,
    );
    expect(r.ok && r.focusBlock?.startDate).toBe('2026-11-12');
  });

  it('shortOnTime snaps a length to the nearest lower option, like typed text', () => {
    const r = runToolCall({ name: 'shortOnTime', args: { minutes: 35 } }, ctxFor('push-a'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.reply).toMatch(/30-minute/);
  });

  it('an action refusal comes back as a short reason', () => {
    const ctx = ctxFor('push-a');
    const r = runToolCall({ name: 'setEasyOn', args: { remove: ['legs'] } }, ctx);
    expect(r).toEqual({
      ok: false,
      kind: 'refused',
      reason: 'Your go-easy list already says that.',
    });
  });

  it('adjustStalledExercise finds no stall without history, and proposes a fix with one', () => {
    const none = runToolCall({ name: 'adjustStalledExercise', args: {} }, ctxFor('push-a'));
    // M13: shown wording is "plateau", never "stalled".
    expect(none).toEqual({ ok: false, kind: 'refused', reason: 'No plateaus right now.' });
    // Three finished sessions of Push A with the same top set: a stall on the bench press.
    const sessions: StallSession[] = [];
    const sets: SetLog[] = [];
    [3, 6, 9].forEach((d, i) => {
      const sessionId = `b${i}`;
      sessions.push({ sessionId, dayId: 'push-a', startedAt: at(11, d), endedAt: at(11, d, 19) });
      for (let k = 0; k < 3; k++)
        sets.push({
          sessionId,
          exerciseId: 'Dumbbell_Bench_Press',
          setIndex: k,
          reps: 8,
          weightKg: 20,
          restTakenSec: 90,
          startedAt: at(11, d) + k * 100_000,
          endedAt: at(11, d) + k * 100_000 + 30_000,
        });
    });
    const ctx = ctxFor('push-a', {
      sessions: [
        ...sessions,
        { sessionId: 'p1', dayId: 'legs-b', startedAt: at(11, 10), endedAt: at(11, 10, 19) },
      ],
      sets,
    });
    const r = runToolCall(
      {
        name: 'adjustStalledExercise',
        args: { exerciseId: 'Dumbbell_Bench_Press', option: 'addSet' },
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.proposal?.action).toBe('stall');
  });

  it('suggestFood needs Fuel; without it the reason is the rule line', () => {
    const r = runToolCall({ name: 'suggestFood', args: {} }, ctxFor('push-a'));
    expect(r).toEqual({ ok: false, kind: 'refused', reason: 'Food tips come with Fuel.' });
  });
});

// Checkpoint J: "Adjust plan to be push for today" → "Yes go ahead" → "I couldn't do that. Bad to."
// (the model sent postponeSession { to: 'today' }). The dedicated tool runs a plan day today; the
// shapes a model plausibly sends to postponeSession for it are resolved here too.
describe('doDayToday and "do day X today" through postponeSession', () => {
  // Wed 2026-11-11 runs Pull A; Thu Legs A, Fri Push B, Sat Pull B, Sun rest, Mon Legs B, Tue Push A.
  const ctx = () => ctxFor('pull-a');
  const doesPushB = (r: ReturnType<typeof runToolCall>) => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.proposal).toMatchObject({ action: 'doToday', scope: 'dated', title: 'Do Push B today' });
    expect(r.proposal?.next.overrides).toContainEqual({ date: TODAY, dayId: 'push-b' });
    expect(r.proposal?.lines[0]).toEqual({ before: 'Wed 11: Pull A', after: 'Wed 11: Push B' });
  };

  it('takes a day id, a day name in any case, or "Push B day"', () => {
    for (const day of ['push-b', 'Push B', 'push b', 'PUSH_B', 'Push B day'])
      doesPushB(runToolCall({ name: 'doDayToday', args: { day } }, ctx()));
  });

  it('a bare "push" picks the next push day coming up (not today\'s own day)', () => {
    doesPushB(runToolCall({ name: 'doDayToday', args: { day: 'push' } }, ctx()));
    doesPushB(runToolCall({ name: 'doDayToday', args: { day: 'Push day' } }, ctx()));
    // Today is Push A: "push" means the other one.
    const r = runToolCall({ name: 'doDayToday', args: { day: 'push' } }, ctxFor('push-a'));
    expect(r.ok && r.proposal?.title).toBe('Do Push B today');
  });

  it('refuses a day not in the plan, today\'s own day, and a busy today, in plain words', () => {
    expect(runToolCall({ name: 'doDayToday', args: { day: 'Arms' } }, ctx())).toEqual({
      ok: false,
      kind: 'refused',
      reason: "That day isn't in your plan.",
    });
    expect(runToolCall({ name: 'doDayToday', args: { day: 'Pull A' } }, ctx())).toMatchObject({
      ok: false,
      kind: 'refused',
      reason: "Pull A is already today's workout.",
    });
    const c = ctx();
    const done = {
      ...c,
      sessions: [
        ...c.sessions,
        { sessionId: 't', dayId: 'pull-a', startedAt: at(11, 11, 7), endedAt: at(11, 11, 8) },
      ],
    };
    expect(runToolCall({ name: 'doDayToday', args: { day: 'Push B' } }, done)).toMatchObject({
      ok: false,
      kind: 'refused',
      reason: "Today's workout is already done.",
    });
  });

  it('is not offered mid-workout and needs a day', () => {
    const c = ctx();
    const w: CoachContext = {
      ...c,
      phase: 'workout',
      sessions: [...c.sessions, { sessionId: 'now', dayId: 'pull-a', startedAt: at(11, 11) }],
    };
    expect(runToolCall({ name: 'doDayToday', args: { day: 'Push B' } }, w)).toMatchObject({
      ok: false,
      kind: 'midWorkout',
    });
    expect(runToolCall({ name: 'doDayToday', args: {} }, ctx())).toMatchObject({
      ok: false,
      kind: 'invalidArgs',
      arg: 'day',
    });
  });

  it('postponeSession with to = today (word or date) and a later from (date, name or id) runs that day today', () => {
    for (const args of [
      { from: '2026-11-13', to: 'today' },
      { from: '2026-11-13', to: TODAY },
      { from: 'Push B', to: 'today' },
      { from: 'push-b', to: TODAY },
      { from: 'push', to: 'Today' },
    ])
      doesPushB(runToolCall({ name: 'postponeSession', args }, ctx()));
  });

  it('postponeSession: "tomorrow" is read as a date; junk stays invalid with the arg named', () => {
    const tomorrow = runToolCall({ name: 'postponeSession', args: { to: 'tomorrow' } }, ctx());
    // Thursday already has Legs A: a plain refusal, not a validation error.
    expect(tomorrow).toMatchObject({ ok: false, kind: 'refused' });
    expect(runToolCall({ name: 'postponeSession', args: { to: 'banana' } }, ctx())).toMatchObject({
      ok: false,
      kind: 'invalidArgs',
      arg: 'to',
    });
    // Moving today onto today is not a change.
    expect(runToolCall({ name: 'postponeSession', args: { to: 'today' } }, ctx())).toMatchObject({
      ok: false,
    });
    // A rest date has nothing to bring forward.
    expect(
      runToolCall({ name: 'postponeSession', args: { from: '2026-11-15', to: 'today' } }, ctx()),
    ).toMatchObject({ ok: false, kind: 'refused' });
  });

  it('every failure has a kind', () => {
    const c = ctx();
    expect(runToolCall({ name: 'weekSummary', args: {} }, c)).toMatchObject({ kind: 'readOnly' });
    expect(runToolCall({ name: 'lighterToday', args: {} }, c, { safety: 'redFlag' })).toMatchObject(
      { kind: 'redFlag' },
    );
    expect(runToolCall({ name: 'lighterToday', args: { sets: 1 } }, c)).toMatchObject({
      kind: 'invalidArgs',
      arg: 'sets',
    });
  });
});
