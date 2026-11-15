/**
 * M10 phase A coach controller (SPEC M10 "Coach chat", "Mid-workout", "Safety"). Pure:
 * `handle(input, ctx)` → `{ reply, proposal?, chips[] }`. Text goes through the rule-based
 * intent matcher; chips call the actions directly. Every training change is a Proposal from the
 * same `propose*` functions, applied only on a tap (by the caller, through changes.ts).
 *
 * Rules:
 * - Red flag → only the fixed red-flag line; chips: End workout (mid-workout, also spoken) or
 *   Not today. No training proposal.
 * - Discomfort → the fixed referral line first, then the proposal (go easy on the named area), or
 *   "Which area…?" with the area chips.
 * - Mid-workout (`phase: 'workout'`) → only go easy / lighter / swap / remove, and only on
 *   exercises without logged sets (`logged`); swaps are today only. Lighter is allowed per SPEC
 *   goal 3 ("only affects sets that haven't started").
 * - Food → "Food tips come with Fuel." while `m7Available` is false. With M7: up to 3
 *   `foods` suggestions (actions/food.ts) that fit what's left today; "You've hit today's
 *   targets." when nothing is left; the Fuel setup pointer without targets. Never mid-workout.
 * - Anything else → "I can help with:" plus the quick chips; never a guess.
 * - Proposal text is passed through `proposalReply` (copy check, `say` ≤ 8 words).
 * Chip ids: the 6 quick actions (UI COACH_CHIPS), the 6 BodyArea values, and the follow-ups
 * below (`args` say what they act on). 'endWorkout' is handled by the UI, not here.
 */
import type {
  BodyArea,
  FoodSuggestion,
  MacroSet,
  NutritionTargets,
  Proposal,
  SetLog,
  TrainerState,
} from '../types';
import type { Unit } from '../units';
import { matchIntent, type DayWord, type Intent, type IntentSlots, type Safety } from './intents';
import { addDate, effectiveDay, weekdayOf } from './plan';
import type { TrainerChange } from './changes';
import type { TrainerCatalog } from './swapCandidates';
import {
  proposeDeload,
  proposeLighter,
  todayDay,
  type ActionContext,
  type ActionResult,
} from './actions/lighter';
import { proposeAvoidArea } from './actions/avoidArea';
import { proposePostpone, type PostponeMode } from './actions/postpone';
import { proposeSwap, proposeSwapOptions, type SwapScope } from './actions/swap';
import { proposeRemove } from './actions/remove';
import {
  detectStalls,
  proposeStallFix,
  stallLine,
  type Stall,
  type StallOption,
  type StallSession,
} from './actions/stall';
import { suggestFood, type FoodCandidates } from './actions/food';
import { leftMacros, remaining } from '../nutrition/day';
import {
  FOOD_DONE,
  FOOD_LATER,
  FOOD_NONE,
  FOOD_SETUP,
  foodIdeasReply,
  HELP_TEXT,
  proposalReply,
  RED_FLAG_LINE,
  REFERRAL_LINE,
} from './replies';

export type CoachPhase = 'today' | 'preview' | 'workout';
export type QuickChipId = 'notToday' | 'easyOn' | 'lighter' | 'swap' | 'adjustPlan' | 'food';
export type CoachChipId =
  | QuickChipId
  | BodyArea
  /** UI-only: ends the running workout (red flag mid-workout). */
  | 'endWorkout'
  /** args.exerciseId (+ scope): show swaps for it. */
  | 'pickExercise'
  /** args.exerciseId, toId, scope: that swap. */
  | 'swapTo'
  /** args.exerciseId: remove it today (mid-workout). */
  | 'remove'
  /** args.mode: Not today with that mode. */
  | 'postponeMode'
  /** args.exerciseId, option: that stall fix. */
  | 'stallFix'
  | 'deload';

export type CoachArgs = {
  exerciseId?: string;
  toId?: string;
  scope?: SwapScope;
  mode?: PostponeMode;
  option?: StallOption;
};

export type CoachChip = { id: CoachChipId; label: string; args?: CoachArgs };

export type CoachInput = { text: string } | { chip: CoachChipId; args?: CoachArgs };

export type CoachContext = {
  /** Where the sheet is open: Today, the day preview, or the Pause sheet mid-workout. */
  phase: CoachPhase;
  state: TrainerState;
  /** Sessions (SessionRow fits): the calendar, and stall detection with `sets`. */
  sessions: readonly StallSession[];
  /** Logged sets for stall detection; none → no stalls. */
  sets?: readonly SetLog[];
  /** Applied plan changes: a newer 'stall' change hides the run it fixed. */
  changes?: readonly TrainerChange[];
  /** Local YYYY-MM-DD. */
  today: string;
  unit: Unit;
  lastWeightKg: Readonly<Record<string, number>>;
  /** Exercise ids with logged sets in the running session. */
  logged: readonly string[];
  catalog: TrainerCatalog;
  /** M7 Fuel is built (food suggestions). */
  m7Available: boolean;
  /** M7 data for food suggestions; absent → the Fuel setup pointer. */
  fuel?: CoachFuel;
};

/** Today's food log totals, the targets (null = not set up) and what can be suggested. */
export type CoachFuel = FoodCandidates & {
  totals: MacroSet;
  targets: NutritionTargets | null;
};

export type CoachResponse = {
  reply: string;
  proposal?: Proposal;
  chips: CoachChip[];
  safety: Safety;
  /** What was handled (ids only, for the dev log). */
  intent: Intent;
  /** A line to speak now (only the red-flag line mid-workout), ≤ 12 words. */
  say?: string;
  /** M7: food ideas, each with a Log payload (logged only on a tap). */
  foods?: FoodSuggestion[];
};

export const QUICK_CHIPS: readonly CoachChip[] = [
  { id: 'notToday', label: 'Not today' },
  { id: 'easyOn', label: 'Go easy on…' },
  { id: 'lighter', label: 'Lighter today' },
  { id: 'swap', label: 'Swap an exercise' },
  { id: 'adjustPlan', label: 'Adjust my plan' },
  { id: 'food', label: 'What should I eat?' },
];
const WORKOUT_CHIPS: readonly QuickChipId[] = ['easyOn', 'lighter', 'swap'];

export const AREA_CHIP_IDS: readonly BodyArea[] = [
  'arms',
  'shoulders',
  'chest',
  'back',
  'legs',
  'core',
];
const AREA_LABEL: Record<BodyArea, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

export const MID_SESSION_REPLY = "Mid-workout I can swap, remove or lighten what's left.";
export const PROPOSAL_REPLY = "Here's what I'd change.";
export const ASK_AREA = 'Which area should I go easy on?';
export const ASK_EXERCISE = 'Which exercise?';
export const ONLY_TODAY = "I can only move today's workout. Ask me on the day.";
export const NO_STALLS = 'No stalled lifts right now. A deload week or a swap from now on?';

const MODE_LABEL: Record<PostponeMode, string> = {
  useRestDay: 'Use the rest day instead',
  pushWeek: 'Push the week instead',
};
const OPTION_LABEL: Record<StallOption, string> = {
  lighter: 'Lighter, build back up',
  addSet: 'One more set',
};
const OTHER_MODE: Record<PostponeMode, PostponeMode> = {
  useRestDay: 'pushWeek',
  pushWeek: 'useRestDay',
};
const DAY_INDEX: Record<Exclude<DayWord, 'today' | 'tomorrow'>, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

type Body = {
  reply: string;
  proposal?: Proposal;
  chips?: CoachChip[];
  say?: string;
  foods?: FoodSuggestion[];
};

const isArea = (id: string): id is BodyArea => (AREA_CHIP_IDS as readonly string[]).includes(id);
const isWorkout = (ctx: CoachContext) => ctx.phase === 'workout';

function quickChips(ctx: CoachContext): CoachChip[] {
  return isWorkout(ctx)
    ? QUICK_CHIPS.filter((c) => WORKOUT_CHIPS.includes(c.id as QuickChipId))
    : [...QUICK_CHIPS];
}
const areaChips = (): CoachChip[] => AREA_CHIP_IDS.map((a) => ({ id: a, label: AREA_LABEL[a] }));

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

function finish(ctx: CoachContext, safety: Safety, intent: Intent, body: Body): CoachResponse {
  const reply = safety === 'discomfort' ? `${REFERRAL_LINE} ${body.reply}` : body.reply;
  const out: CoachResponse = { reply, chips: body.chips ?? quickChips(ctx), safety, intent };
  if (body.proposal) out.proposal = { ...body.proposal, ...proposalReply(body.proposal) };
  if (body.say) out.say = body.say;
  if (body.foods && body.foods.length > 0) out.foods = body.foods;
  return out;
}

function fromResult(ctx: CoachContext, r: ActionResult, alternatives: CoachChip[] = []): Body {
  if (r.ok) {
    return {
      reply: PROPOSAL_REPLY,
      proposal: r.proposal,
      chips: alternatives.length > 0 ? alternatives : quickChips(ctx),
    };
  }
  if (r.suggest === 'postpone' && !isWorkout(ctx)) {
    return { reply: r.reply, chips: [{ id: 'notToday', label: 'Not today' }, ...areaChips()] };
  }
  return { reply: r.reply };
}

// ---------- actions ----------

function resolveDay(word: DayWord, today: string): string {
  if (word === 'today') return today;
  if (word === 'tomorrow') return addDate(today, 1);
  const n = (DAY_INDEX[word] - weekdayOf(today) + 7) % 7 || 7;
  return addDate(today, n);
}

function postpone(ctx: CoachContext, mode: PostponeMode, slots: IntentSlots = {}): Body {
  if (slots.date && resolveDay(slots.date, ctx.today) !== ctx.today) return { reply: ONLY_TODAY };
  const to = slots.moveTo ? resolveDay(slots.moveTo, ctx.today) : undefined;
  const r = proposePostpone(ctx.state, ctx.sessions, ctx.today, to ? { mode, to } : { mode });
  if (!r.ok) return { reply: r.reply };
  const other = OTHER_MODE[mode];
  const chips: CoachChip[] = to
    ? []
    : [{ id: 'postponeMode', label: MODE_LABEL[other], args: { mode: other } }];
  return fromResult(ctx, r, chips);
}

function avoid(ctx: CoachContext, area: BodyArea | undefined): Body {
  if (!area) return { reply: ASK_AREA, chips: areaChips() };
  return fromResult(ctx, proposeAvoidArea(actionCtx(ctx), area, ctx.catalog));
}

/** Today's rows (as they will run) that can still change. */
function todayRows(ctx: CoachContext): string[] {
  const day = effectiveDay(ctx.state, ctx.sessions, ctx.today).day;
  return (day?.exercises ?? []).map((p) => p.exerciseId);
}

function askExercise(ctx: CoachContext, scope: SwapScope | undefined): Body {
  const plan = scope === 'plan' && !isWorkout(ctx);
  let list: string[];
  if (plan) {
    list = [...new Set(ctx.state.plan.days.flatMap((d) => d.exercises.map((p) => p.exerciseId)))];
  } else {
    const t = todayDay(actionCtx(ctx));
    if (!t.ok) return { reply: t.reply };
    list = todayRows(ctx).filter((id) => !ctx.logged.includes(id));
  }
  if (list.length === 0) return { reply: 'Nothing left to swap today.' };
  return {
    reply: ASK_EXERCISE,
    chips: list.map((id) => ({
      id: 'pickExercise',
      label: nameOf(ctx, id),
      args: plan ? { exerciseId: id, scope: 'plan' } : { exerciseId: id },
    })),
  };
}

function removeChip(ctx: CoachContext, id: string): CoachChip {
  return { id: 'remove', label: `Remove ${nameOf(ctx, id)} today`, args: { exerciseId: id } };
}

function swapFlow(ctx: CoachContext, exerciseId: string, explicit?: SwapScope): Body {
  const workout = isWorkout(ctx);
  const scope: SwapScope = workout ? 'today' : (explicit ?? 'today');
  const actx = actionCtx(ctx);
  let r = proposeSwapOptions(actx, exerciseId, ctx.catalog, scope);
  if (!r.ok && r.reason === 'notInDay' && explicit === undefined && !workout)
    r = proposeSwapOptions(actx, exerciseId, ctx.catalog, 'plan');
  const canRemove =
    workout && !ctx.logged.includes(exerciseId) && todayRows(ctx).includes(exerciseId);
  if (!r.ok)
    return canRemove
      ? { reply: r.reply, chips: [removeChip(ctx, exerciseId)] }
      : { reply: r.reply };
  const [first, ...rest] = r.options;
  if (!first) return { reply: 'No good swap with the kit your gym has.' };
  const chips: CoachChip[] = rest.map((o) => ({
    id: 'swapTo',
    label: `Try ${o.name}`,
    args: {
      exerciseId,
      toId: o.exerciseId,
      scope: first.proposal.scope === 'plan' ? 'plan' : 'today',
    },
  }));
  if (canRemove) chips.push(removeChip(ctx, exerciseId));
  return fromResult(ctx, { ok: true, proposal: first.proposal }, chips);
}

/** For each exercise, the time of the newest applied (not undone) stall change that touched it. */
export function stallSince(changes: readonly TrainerChange[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  const rowsById = (s: TrainerState) => {
    const m = new Map<string, string>();
    for (const d of s.plan.days)
      for (const p of d.exercises)
        m.set(p.exerciseId, (m.get(p.exerciseId) ?? '') + JSON.stringify(p));
    return m;
  };
  for (const c of changes) {
    if (c.action !== 'stall' || c.undoneAt !== undefined) continue;
    const before = rowsById(c.before);
    const after = rowsById(c.after);
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      if (before.get(id) === after.get(id)) continue;
      out[id] = Math.max(out[id] ?? -Infinity, c.createdAt);
    }
  }
  return out;
}

function stalls(ctx: CoachContext): Stall[] {
  if (!ctx.sets) return [];
  return detectStalls(ctx.sets, ctx.sessions, ctx.state.plan, { since: stallSince(ctx.changes) });
}

const noStalls = (): Body => ({
  reply: NO_STALLS,
  chips: [
    { id: 'deload', label: 'Deload week' },
    { id: 'swap', label: 'Swap from now on', args: { scope: 'plan' } },
  ],
});

function stallFlow(ctx: CoachContext, exerciseId?: string, option?: StallOption): Body {
  const all = stalls(ctx);
  const stall = exerciseId ? all.find((s) => s.exerciseId === exerciseId) : all[0];
  if (!stall) {
    if (exerciseId)
      return { reply: `${nameOf(ctx, exerciseId)} is still moving. No change needed.` };
    return noStalls();
  }
  const pick = option && stall.options.includes(option) ? option : stall.options[0];
  if (!pick) return { reply: stallLine(stall, (id) => nameOf(ctx, id)) };
  const r = proposeStallFix(ctx.state, ctx.sessions, ctx.today, stall, pick, {
    unit: ctx.unit,
    name: (id) => nameOf(ctx, id),
  });
  const line = stallLine(stall, (id) => nameOf(ctx, id));
  if (!r.ok) return { reply: `${line} ${r.reply}` };
  const chips: CoachChip[] = [
    ...stall.options
      .filter((o) => o !== pick)
      .map((o) => ({
        id: 'stallFix' as const,
        label: OPTION_LABEL[o],
        args: { exerciseId: stall.exerciseId, option: o },
      })),
    ...all
      .filter((s) => s !== stall && s.options[0] !== undefined)
      .map((s) => ({
        id: 'stallFix' as const,
        label: `${nameOf(ctx, s.exerciseId)}: ${OPTION_LABEL[s.options[0] ?? 'addSet']}`,
        args: { exerciseId: s.exerciseId, option: s.options[0] ?? 'addSet' },
      })),
  ];
  return { ...fromResult(ctx, r, chips), reply: line };
}

function food(ctx: CoachContext): Body {
  if (!ctx.m7Available) return { reply: FOOD_LATER };
  const fuel = ctx.fuel;
  if (!fuel?.targets) return { reply: FOOD_SETUP };
  const left = leftMacros(remaining(fuel.totals, fuel.targets));
  if (left.kcal <= 0 && left.proteinG <= 0) return { reply: FOOD_DONE };
  const foods = suggestFood(left, fuel);
  if (foods.length === 0) return { reply: FOOD_NONE };
  return { reply: foodIdeasReply(left), foods };
}

// ---------- main ----------

const BLOCKED_MID_SESSION = new Set<string>([
  'postpone',
  'deload',
  'stall',
  'food',
  'notToday',
  'adjustPlan',
  'postponeMode',
  'stallFix',
]);

function redFlag(ctx: CoachContext): CoachResponse {
  return isWorkout(ctx)
    ? {
        reply: RED_FLAG_LINE,
        chips: [{ id: 'endWorkout', label: 'End workout' }],
        safety: 'redFlag',
        intent: 'help',
        say: RED_FLAG_LINE,
      }
    : {
        reply: RED_FLAG_LINE,
        chips: [{ id: 'notToday', label: 'Not today' }],
        safety: 'redFlag',
        intent: 'help',
      };
}

function handleText(text: string, ctx: CoachContext): CoachResponse {
  const m = matchIntent(text, {
    exercises: ctx.catalog.exercises.map(({ id, name }) => ({ id, name })),
    todayExerciseIds: todayRows(ctx),
    dayNames: ctx.state.plan.days.map((d) => d.name),
  });
  if (m.safety === 'redFlag') return redFlag(ctx);
  const done = (body: Body) => finish(ctx, m.safety, m.intent, body);
  if (isWorkout(ctx) && BLOCKED_MID_SESSION.has(m.intent))
    return done({ reply: MID_SESSION_REPLY });
  const s = m.slots;
  switch (m.intent) {
    case 'postpone':
      return done(postpone(ctx, 'useRestDay', s));
    case 'avoidArea':
      return done(avoid(ctx, s.area));
    case 'lighter':
      return done(fromResult(ctx, proposeLighter(actionCtx(ctx))));
    case 'deload':
      return done(fromResult(ctx, proposeDeload(actionCtx(ctx))));
    case 'swap':
      return done(s.exerciseId ? swapFlow(ctx, s.exerciseId, s.scope) : askExercise(ctx, s.scope));
    case 'stall':
      return done(stallFlow(ctx, s.exerciseId));
    case 'food':
      return done(food(ctx));
    case 'help':
      return done({ reply: HELP_TEXT });
  }
}

const CHIP_INTENT: Partial<Record<CoachChipId, Intent>> = {
  notToday: 'postpone',
  postponeMode: 'postpone',
  easyOn: 'avoidArea',
  lighter: 'lighter',
  deload: 'deload',
  swap: 'swap',
  pickExercise: 'swap',
  swapTo: 'swap',
  remove: 'swap',
  adjustPlan: 'stall',
  stallFix: 'stall',
  food: 'food',
};

function handleChip(id: CoachChipId, args: CoachArgs, ctx: CoachContext): CoachResponse {
  const intent: Intent = isArea(id) ? 'avoidArea' : (CHIP_INTENT[id] ?? 'help');
  const done = (body: Body) => finish(ctx, 'none', intent, body);
  if (isWorkout(ctx) && BLOCKED_MID_SESSION.has(id)) return done({ reply: MID_SESSION_REPLY });
  if (isArea(id)) return done(avoid(ctx, id));
  const ex = args.exerciseId;
  switch (id) {
    case 'notToday':
      return done(postpone(ctx, 'useRestDay'));
    case 'postponeMode':
      return done(postpone(ctx, args.mode ?? 'useRestDay'));
    case 'easyOn':
      return done(avoid(ctx, undefined));
    case 'lighter':
      return done(fromResult(ctx, proposeLighter(actionCtx(ctx))));
    case 'deload':
      return done(fromResult(ctx, proposeDeload(actionCtx(ctx))));
    case 'swap':
      return done(ex ? swapFlow(ctx, ex, args.scope) : askExercise(ctx, args.scope));
    case 'pickExercise':
      return done(ex ? swapFlow(ctx, ex, args.scope) : askExercise(ctx, args.scope));
    case 'swapTo': {
      if (!ex || !args.toId) return done({ reply: HELP_TEXT });
      const scope: SwapScope = isWorkout(ctx) ? 'today' : (args.scope ?? 'today');
      return done(fromResult(ctx, proposeSwap(actionCtx(ctx), ex, args.toId, ctx.catalog, scope)));
    }
    case 'remove':
      if (!ex) return done(askExercise(ctx, 'today'));
      return done(fromResult(ctx, proposeRemove(actionCtx(ctx), ex)));
    case 'adjustPlan':
      return done(stallFlow(ctx));
    case 'stallFix':
      return done(stallFlow(ctx, ex, args.option));
    case 'food':
      return done(food(ctx));
    default:
      return done({ reply: HELP_TEXT });
  }
}

/** One coach turn. Nothing is applied here: a returned Proposal waits for Apply. */
export function handle(input: CoachInput, ctx: CoachContext): CoachResponse {
  return 'text' in input
    ? handleText(input.text, ctx)
    : handleChip(input.chip, input.args ?? {}, ctx);
}
