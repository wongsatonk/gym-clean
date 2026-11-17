/**
 * M12 slice 2 / M10 phase B1: the trainer tools, the single source for the Apple brain (and later
 * Claude). Pure. `scripts/gen-trainer-tools.mjs` turns `tools.contract.json` (written from
 * `toolContract()`, checked by tools.test.ts) into Swift `@Generable` structs.
 *
 * - One `propose*` tool per `ProposalAction`, except `TOOL_EXCEPTIONS` (starterPlan: intake only).
 *   A model's call is only recorded on the phone; `runToolCall` validates its args and turns it
 *   into a Proposal through the same phase A `propose*` functions the chips use. It never returns
 *   or applies a state: Apply stays his tap (changes.ts).
 * - Four read-only tools (`weekSummary`, `progressSummary`, `exerciseInfo { exerciseId }`,
 *   `foodIdeas`): their text is computed by the app before `respond` (brain/readTools.ts).
 * - Args are @Generable-expressible: string enums, patterned strings, ranged ints, arrays of those,
 *   optional fields; no free-form objects. Exercise ids are patterned strings checked against the
 *   catalog here, not enums: 60 catalog ids in 4 fields would cost ~1,500 of the session's 4,096
 *   tokens (docs/ios-setup.md "Slice 2 API notes").
 * - Mid-workout only go easy / lighter / swap (coach.ts rule); after a red flag nothing.
 * - Descriptions stay short: they are part of every Apple session's 4,096-token window.
 */
import type {
  BodyArea,
  FocusBlock,
  FoodSuggestion,
  Proposal,
  ProposalAction,
  ReadToolName,
  ToolCall,
} from '../types';
import { stallSince, type CoachContext } from './coach';
import type { Safety } from './intents';
import { addDate, localDate } from './plan';
import { FOCUS_RULES } from './focusRules';
import { SHORT_ON_TIME } from './timeRules';
import {
  FOOD_DONE,
  FOOD_LATER,
  FOOD_NONE,
  FOOD_SETUP,
  foodIdeasReply,
  proposalReply,
} from './replies';
import {
  proposeDeload,
  proposeLighter,
  type ActionContext,
  type ActionResult,
} from './actions/lighter';
import { proposeAvoidArea } from './actions/avoidArea';
import { easyOnArea, proposeEasyOn } from './actions/easyOn';
import { proposePostpone, type PostponeMode } from './actions/postpone';
import { proposeMoveDay } from './actions/move';
import { proposeSwap, proposeSwapOptions, type SwapScope } from './actions/swap';
import { proposeFocusBlock } from './actions/focusBlock';
import { proposeShortOnTime, shortOptionFor } from './actions/shortOnTime';
import { detectStalls, proposeStallFix, type StallOption } from './actions/stall';
import { suggestFood } from './actions/food';
import { leftMacros, remaining } from '../nutrition/day';

// ---------- the action list ----------

/** Every ProposalAction at runtime; the type below fails to compile when one is missing. */
export const PROPOSAL_ACTIONS = [
  'postpone',
  'avoidArea',
  'lighter',
  'deload',
  'swap',
  'stall',
  'food',
  'focusBlock',
  'shortOnTime',
  'starterPlan',
  'easyOn',
] as const satisfies readonly ProposalAction[];
type MissingAction = Exclude<ProposalAction, (typeof PROPOSAL_ACTIONS)[number]>;
const allActionsListed: [MissingAction] extends [never] ? true : MissingAction = true;
void allActionsListed;

/** Actions with no model tool, and why (tested). */
export const TOOL_EXCEPTIONS: Partial<Record<ProposalAction, string>> = {
  starterPlan: 'Built from the intake answers only, never from chat.',
};

// ---------- schemas ----------

export type StringSchema = {
  type: 'string';
  description: string;
  enum?: readonly string[];
  pattern?: string;
};
export type IntegerSchema = {
  type: 'integer';
  description: string;
  minimum: number;
  maximum: number;
};
export type ArraySchema = {
  type: 'array';
  description: string;
  items: StringSchema | IntegerSchema;
  minItems?: number;
  maxItems: number;
  uniqueItems?: true;
};
export type ToolSchema = StringSchema | IntegerSchema | ArraySchema;
export type ToolParams = {
  type: 'object';
  properties: Record<string, ToolSchema>;
  required: string[];
  additionalProperties: false;
};

/** What a propose tool gives the app: a Proposal (or food ideas), never a state. */
export type ToolOutcome =
  | {
      ok: true;
      reply: string;
      proposal?: Proposal;
      focusBlock?: FocusBlock;
      foods?: FoodSuggestion[];
    }
  | { ok: false; reason: string };

type Args = Record<string, unknown>;

type Base = { name: string; description: string; parameters: ToolParams };
export type ProposeTool = Base & {
  readOnly: false;
  action: ProposalAction;
  /** Allowed from the Pause sheet mid-workout. */
  midWorkout: boolean;
  /** Args are already schema-checked. */
  toProposal(args: Args, ctx: CoachContext): ToolOutcome;
};
export type ReadTool = Base & { readOnly: true; name: ReadToolName };
export type TrainerTool = ProposeTool | ReadTool;

const AREAS: readonly BodyArea[] = ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'];
const DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const ID_PATTERN = '^[A-Za-z0-9_-]{1,60}$';

const area = (description: string): StringSchema => ({ type: 'string', description, enum: AREAS });
const date = (description: string): StringSchema => ({
  type: 'string',
  description,
  pattern: DATE_PATTERN,
});
const exerciseId = (description: string): StringSchema => ({
  type: 'string',
  description,
  pattern: ID_PATTERN,
});
const params = (
  properties: Record<string, ToolSchema> = {},
  required: string[] = [],
): ToolParams => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

// ---------- helpers ----------

export const PROPOSAL_TOOL_REPLY = "Here's what I'd change.";
export const MID_WORKOUT_REASON = "Mid-workout I can only swap, ease or lighten what's left.";
export const RED_FLAG_REASON = 'No training changes after that. Please get checked first.';

const fail = (reason: string): ToolOutcome => ({ ok: false, reason });

function nameOf(ctx: CoachContext, id: string): string {
  return ctx.catalog.exercises.find((e) => e.id === id)?.name ?? id.replace(/_/g, ' ');
}

function actionCtx(ctx: CoachContext): ActionContext {
  return {
    state: ctx.state,
    sessions: ctx.sessions,
    today: ctx.today,
    unit: ctx.unit,
    lastWeightKg: ctx.lastWeightKg,
    started: ctx.logged,
    exerciseName: (id) => nameOf(ctx, id),
  };
}

function fromResult(
  r: ActionResult | { ok: true; proposal: Proposal } | { ok: false; reply: string },
  reply = PROPOSAL_TOOL_REPLY,
): ToolOutcome {
  if (!r.ok) return fail(r.reply);
  const proposal = { ...r.proposal, ...proposalReply(r.proposal) };
  return { ok: true, reply, proposal };
}

const knownExercise = (ctx: CoachContext, id: string) =>
  ctx.catalog.exercises.some((e) => e.id === id);
const UNKNOWN_EXERCISE = "I don't know that exercise.";

/** Today, or tomorrow once today already has a session (coach.ts `blockStart`). */
function blockStart(ctx: CoachContext): string {
  const busy = ctx.sessions.some((s) => localDate(s.startedAt) === ctx.today);
  return busy ? addDate(ctx.today, 1) : ctx.today;
}

// ---------- the tools ----------

const postponeSession: ProposeTool = {
  name: 'postponeSession',
  description: "Move a planned session. Default: today's, to this week's rest day.",
  parameters: params({
    mode: {
      type: 'string',
      description: 'useRestDay: train on a rest day; pushWeek: slide the week',
      enum: ['useRestDay', 'pushWeek'],
    },
    from: date('Planned date to move, YYYY-MM-DD; default today'),
    to: date('Date to move it to, YYYY-MM-DD'),
  }),
  readOnly: false,
  action: 'postpone',
  midWorkout: false,
  toProposal(args, ctx) {
    const mode = (args.mode as PostponeMode | undefined) ?? 'useRestDay';
    const from = (args.from as string | undefined) ?? ctx.today;
    const to = args.to as string | undefined;
    if (from !== ctx.today) {
      if (to === undefined) return fail('Pick a day to move it to.');
      return fromResult(proposeMoveDay(ctx.state, ctx.sessions, ctx.today, from, to));
    }
    return fromResult(
      proposePostpone(ctx.state, ctx.sessions, ctx.today, to ? { mode, to } : { mode }),
    );
  },
};

const avoidBodyArea: ProposeTool = {
  name: 'avoidBodyArea',
  description: 'Go easy on a body area today: swap or remove what loads it.',
  parameters: params({ area: area('Body area') }, ['area']),
  readOnly: false,
  action: 'avoidArea',
  midWorkout: true,
  toProposal: (args, ctx) =>
    fromResult(proposeAvoidArea(actionCtx(ctx), args.area as BodyArea, ctx.catalog)),
};

const lighterToday: ProposeTool = {
  name: 'lighterToday',
  description: "Make today's workout lighter: fewer sets, less weight.",
  parameters: params(),
  readOnly: false,
  action: 'lighter',
  midWorkout: true,
  toProposal: (_args, ctx) => fromResult(proposeLighter(actionCtx(ctx))),
};

const deloadWeek: ProposeTool = {
  name: 'deloadWeek',
  description: 'A lighter week from today: half the sets, less weight.',
  parameters: params(),
  readOnly: false,
  action: 'deload',
  midWorkout: false,
  toProposal: (_args, ctx) => fromResult(proposeDeload(actionCtx(ctx))),
};

const swapExercise: ProposeTool = {
  name: 'swapExercise',
  description: 'Swap an exercise for one that works the same muscles.',
  parameters: params(
    {
      exerciseId: exerciseId('Exercise id to swap out'),
      toId: exerciseId('Exercise id to swap in; omit for the best'),
      scope: {
        type: 'string',
        description: 'today, or plan for from now on',
        enum: ['today', 'plan'],
      },
    },
    ['exerciseId'],
  ),
  readOnly: false,
  action: 'swap',
  midWorkout: true,
  toProposal(args, ctx) {
    const id = args.exerciseId as string;
    const toId = args.toId as string | undefined;
    if (!knownExercise(ctx, id) || (toId !== undefined && !knownExercise(ctx, toId)))
      return fail(UNKNOWN_EXERCISE);
    const workout = ctx.phase === 'workout';
    const explicit = args.scope as SwapScope | undefined;
    const scope: SwapScope = workout
      ? 'today'
      : (explicit ?? (ctx.catalog.canDo(id) ? 'today' : 'plan'));
    const actx = actionCtx(ctx);
    if (toId !== undefined) return fromResult(proposeSwap(actx, id, toId, ctx.catalog, scope));
    let r = proposeSwapOptions(actx, id, ctx.catalog, scope);
    if (!r.ok && r.reason === 'notInDay' && explicit === undefined && !workout)
      r = proposeSwapOptions(actx, id, ctx.catalog, 'plan');
    if (!r.ok) return fail(r.reply);
    const first = r.options[0];
    return first ? fromResult({ ok: true, proposal: first.proposal }) : fail('No good swap here.');
  },
};

const adjustStalledExercise: ProposeTool = {
  name: 'adjustStalledExercise',
  description: 'Fix a lift that stopped improving: lighter and build up, or one more set.',
  parameters: params({
    exerciseId: exerciseId('Stalled exercise id; omit for the first'),
    option: {
      type: 'string',
      description: 'lighter: -10% and build up; addSet: one more set',
      enum: ['lighter', 'addSet'],
    },
  }),
  readOnly: false,
  action: 'stall',
  midWorkout: false,
  toProposal(args, ctx) {
    const id = args.exerciseId as string | undefined;
    if (id !== undefined && !knownExercise(ctx, id)) return fail(UNKNOWN_EXERCISE);
    const all = ctx.sets
      ? detectStalls(ctx.sets, ctx.sessions, ctx.state.plan, { since: stallSince(ctx.changes) })
      : [];
    const stall = id === undefined ? all[0] : all.find((s) => s.exerciseId === id);
    if (!stall)
      return fail(
        id === undefined ? 'No plateaus right now.' : `${nameOf(ctx, id)} is still moving.`,
      );
    const easy = easyOnArea(stall.exerciseId, ctx.state.easyOn ?? [], ctx.catalog);
    const options = easy ? stall.options.filter((o) => o !== 'addSet') : [...stall.options];
    const want = args.option as StallOption | undefined;
    const pick = want ?? options[0];
    if (pick === undefined || !options.includes(pick))
      return fail("That fix doesn't fit this lift.");
    return fromResult(
      proposeStallFix(ctx.state, ctx.sessions, ctx.today, stall, pick, {
        unit: ctx.unit,
        name: (x) => nameOf(ctx, x),
        catalog: ctx.catalog,
      }),
    );
  },
};

const suggestFoodTool: ProposeTool = {
  name: 'suggestFood',
  description: "Show food ideas that fit what's left of today's targets, each with Log.",
  parameters: params(),
  readOnly: false,
  action: 'food',
  midWorkout: false,
  toProposal(_args, ctx) {
    if (!ctx.m7Available) return fail(FOOD_LATER);
    const fuel = ctx.fuel;
    if (!fuel?.targets) return fail(FOOD_SETUP);
    const left = leftMacros(remaining(fuel.totals, fuel.targets));
    if (left.kcal <= 0 && left.proteinG <= 0) return fail(FOOD_DONE);
    const foods = suggestFood(left, fuel);
    if (foods.length === 0) return fail(FOOD_NONE);
    return { ok: true, reply: foodIdeasReply(left), foods };
  },
};

const proposeFocusBlockTool: ProposeTool = {
  name: 'proposeFocusBlock',
  description: 'Plan 2-6 weeks that build one area. The app builds the days.',
  parameters: params(
    {
      group: area('Area to build'),
      weeks: {
        type: 'integer',
        description: 'Weeks, 2 to 6 (a month is 4)',
        minimum: FOCUS_RULES.weeks.min,
        maximum: FOCUS_RULES.weeks.max,
      },
      weekdays: {
        type: 'array',
        description: 'Training weekdays, 0 = Sunday',
        items: { type: 'integer', description: 'Weekday 0-6', minimum: 0, maximum: 6 },
        minItems: FOCUS_RULES.weekdays.min,
        maxItems: FOCUS_RULES.weekdays.max,
        uniqueItems: true,
      },
    },
    ['group', 'weeks', 'weekdays'],
  ),
  readOnly: false,
  action: 'focusBlock',
  midWorkout: false,
  toProposal(args, ctx) {
    const group = args.group as BodyArea;
    const weeks = args.weeks as number;
    const weekdays = [...(args.weekdays as number[])].sort((a, b) => a - b);
    const r = proposeFocusBlock(
      actionCtx(ctx),
      { group, weeks, weekdays, startDate: blockStart(ctx) },
      ctx.catalog,
    );
    const out = fromResult(r, `Here's a ${weeks}-week ${group} block.`);
    const block = r.ok ? r.proposal.next.blocks?.at(-1) : undefined;
    return out.ok && block ? { ...out, focusBlock: block } : out;
  },
};

const shortOnTime: ProposeTool = {
  name: 'shortOnTime',
  description: "Fit today's workout into less time.",
  parameters: params(
    {
      minutes: {
        type: 'integer',
        description: `Minutes available: ${SHORT_ON_TIME.options.join(', ')}`,
        minimum: Math.min(...SHORT_ON_TIME.options),
        maximum: Math.max(...SHORT_ON_TIME.options),
      },
    },
    ['minutes'],
  ),
  readOnly: false,
  action: 'shortOnTime',
  midWorkout: false,
  toProposal(args, ctx) {
    const minutes = shortOptionFor(args.minutes as number);
    return fromResult(
      proposeShortOnTime(actionCtx(ctx), minutes, ctx.catalog),
      `Here's a ${minutes}-minute version of today.`,
    );
  },
};

const areaList = (description: string): ArraySchema => ({
  type: 'array',
  description,
  items: area('Body area'),
  maxItems: AREAS.length,
  uniqueItems: true,
});

const setEasyOn: ProposeTool = {
  name: 'setEasyOn',
  description: 'Change the standing go-easy list: areas every plan goes lighter on.',
  parameters: params({ add: areaList('Areas to add'), remove: areaList('Areas to remove') }),
  readOnly: false,
  action: 'easyOn',
  midWorkout: false,
  toProposal(args, ctx) {
    const add = (args.add as BodyArea[] | undefined) ?? [];
    const remove = (args.remove as BodyArea[] | undefined) ?? [];
    if (add.length === 0 && remove.length === 0) return fail('Name an area to add or remove.');
    return fromResult(proposeEasyOn(actionCtx(ctx), { add, remove }, ctx.catalog));
  },
};

const read = (name: ReadToolName, description: string, p: ToolParams = params()): ReadTool => ({
  name,
  description,
  parameters: p,
  readOnly: true,
});

/** Every tool, in contract order. */
export const TRAINER_TOOLS: readonly TrainerTool[] = [
  postponeSession,
  avoidBodyArea,
  lighterToday,
  deloadWeek,
  swapExercise,
  adjustStalledExercise,
  suggestFoodTool,
  proposeFocusBlockTool,
  shortOnTime,
  setEasyOn,
  read('weekSummary', "This week's sessions and sets, done vs planned."),
  read('progressSummary', 'Week and month scores, streak and focus block progress.'),
  read(
    'exerciseInfo',
    'How to do an exercise: steps, cue, muscles.',
    params({ exerciseId: exerciseId('Exercise id from the context') }, ['exerciseId']),
  ),
  read('foodIdeas', "What's left of today's food targets, and ideas that fit."),
];

export function readToolNames(): ReadToolName[] {
  return TRAINER_TOOLS.flatMap((t) => (t.readOnly ? [t.name] : []));
}

// ---------- validation ----------

function realDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function checkValue(key: string, s: ToolSchema, v: unknown, today: string): string | null {
  switch (s.type) {
    case 'string': {
      if (typeof v !== 'string') return `${key} must be text.`;
      if (s.enum && !s.enum.includes(v)) return `Unknown ${key} "${v.slice(0, 20)}".`;
      if (s.pattern && !new RegExp(s.pattern).test(v)) return `Bad ${key}.`;
      if (s.pattern === DATE_PATTERN) {
        if (!realDate(v)) return `${v} is not a real date.`;
        if (v < today) return `${v} is in the past.`;
      }
      return null;
    }
    case 'integer':
      if (typeof v !== 'number' || !Number.isInteger(v)) return `${key} must be a whole number.`;
      if (v < s.minimum || v > s.maximum) return `${key} must be ${s.minimum} to ${s.maximum}.`;
      return null;
    case 'array': {
      if (!Array.isArray(v)) return `${key} must be a list.`;
      if (v.length > s.maxItems || v.length < (s.minItems ?? 0))
        return `${key} needs ${s.minItems ?? 0} to ${s.maxItems} items.`;
      if (s.uniqueItems && new Set(v).size !== v.length) return `${key} has repeats.`;
      for (const item of v) {
        const e = checkValue(key, s.items, item, today);
        if (e) return e;
      }
      return null;
    }
  }
}

/** Schema check: unknown keys, missing required, types, enums, ranges, real future dates. */
export function validateArgs(tool: TrainerTool, args: unknown, today: string): string | null {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return 'Bad arguments.';
  const a = args as Args;
  const props = tool.parameters.properties;
  for (const key of Object.keys(a))
    if (!(key in props)) return `Unknown argument ${key.slice(0, 20)}.`;
  for (const key of tool.parameters.required) if (a[key] === undefined) return `Missing ${key}.`;
  for (const [key, s] of Object.entries(props)) {
    if (a[key] === undefined) continue;
    const e = checkValue(key, s, a[key], today);
    if (e) return e;
  }
  return null;
}

/**
 * Turns one recorded model call into what the chat shows: a Proposal (or food ideas) waiting for
 * his tap, or a short reason. Read-only tools have no call here (their text is passed in).
 */
export function runToolCall(
  call: ToolCall,
  ctx: CoachContext,
  opts: { safety?: Safety } = {},
): ToolOutcome {
  const tool = TRAINER_TOOLS.find((t) => t.name === call.name);
  if (!tool) return fail("I can't do that.");
  if (tool.readOnly) return fail('That tool only reads.');
  if (opts.safety === 'redFlag') return fail(RED_FLAG_REASON);
  if (ctx.phase === 'workout' && !tool.midWorkout) return fail(MID_WORKOUT_REASON);
  const bad = validateArgs(tool, call.args, ctx.today);
  if (bad) return fail(bad);
  return tool.toProposal(call.args, ctx);
}

// ---------- the contract ----------

export type ToolContract = {
  note: string;
  exceptions: Partial<Record<ProposalAction, string>>;
  tools: {
    name: string;
    description: string;
    readOnly: boolean;
    action?: ProposalAction;
    midWorkout?: boolean;
    parameters: ToolParams;
  }[];
};

export function toolContract(): ToolContract {
  return {
    note: 'Generated from src/core/trainer/tools.ts by tools.test.ts (UPDATE_CONTRACT=1). Do not edit. scripts/gen-trainer-tools.mjs builds the Swift tools from it.',
    exceptions: { ...TOOL_EXCEPTIONS },
    tools: TRAINER_TOOLS.map((t) =>
      t.readOnly
        ? { name: t.name, description: t.description, readOnly: true, parameters: t.parameters }
        : {
            name: t.name,
            description: t.description,
            readOnly: false,
            action: t.action,
            midWorkout: t.midWorkout,
            parameters: t.parameters,
          },
    ),
  };
}

/** The committed file's exact text. */
export function toolContractJson(): string {
  return `${JSON.stringify(toolContract(), null, 2)}\n`;
}
