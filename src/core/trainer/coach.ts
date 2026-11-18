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
 * - Missing kit (M10e): `gymSwap` (Today/preview prompt, "Adjust my plan", or typed "my gym has
 *   no leg press") → "Your gym doesn't have the kit for X." + the plan-scope swap to the closest
 *   replacement, the other candidates, Just today and Keep X (`keepExercise`, UI-only). Never
 *   offered mid-workout; there a typed request gets the usual today swap.
 * - Proposal text is passed through `proposalReply` (copy check, `say` ≤ 8 words).
 * - M12 (gym sessions only; no Health value ever reaches these answers, M11 Decision 8):
 *   "How's my week?" → this week's sessions done / planned, % of planned sets so far and the next
 *   training day; "How am I doing?" → week + month scores, the weekly streak and, during a focus
 *   block, its focus sets so far (numbers from progress/completion.ts). A focus block asks only
 *   what's missing (group → weeks 2–6 → "Keep my days" / 3–6 days) with chips, then proposes it
 *   (actions/focusBlock.ts); edits ("only 4 days a week", "make it 3 weeks", "swap Thursday's
 *   flyes") revise `focusDraft` (the block proposed last). Without a draft a count starts the
 *   flow and a weekday swap is a plain swap. None of these mid-workout.
 * - M13c abs (Decision "M13c answers", q3): abs join a plan only through a choice. The group
 *   chips list "Abs & core" once the gym can do an abs exercise. After another group's weeks and
 *   days, one more step when the plan has no abs, core isn't on the go-easy list and the gym can
 *   do abs: "Also add abs?" (`ASK_ALSO_CORE`) with Yes / No chips (`args.alsoCore`) and the
 *   `coreTraining` card as its Why?; Yes builds the block with `alsoCore`. Edits keep the answer.
 *   "add abs" / "six pack" / "หน้าท้อง" arrive as a focusBlock intent with group core.
 * - M12 Do it today / Move (Calendar day, Today's missed-day "Move it"; actions/move.ts):
 *   `doToday` {dayId} → run that plan day today (a dated override; the block's version on a block
 *   date); without a day it asks "Which day?" with one chip per other plan day. `moveDay`
 *   {from, to} → move that planned date; with only `from` it asks "Move X to which day?" with up
 *   to 3 dates that work. Typed: "do Push A today" → doToday; "move Thursday to Friday" (a day
 *   other than today plus a target) → moveDay; another day without a target → the "which day"
 *   question. Refusals are plain replies. None of these mid-workout.
 * - M12 1b Short on time (actions/shortOnTime.ts): `shortOnTime` {minutes} (chip, or typed "I
 *   have 30 min") → today's proposal fitted into the nearest lower of 20 / 30 / 45 min, with the
 *   other lengths as chips; without a length it asks "How much time do you have?". A day that
 *   already fits gets "Your day already fits.". Not mid-workout. `SHORT_ON_TIME_CHIP` is the
 *   quick chip for the UI to register (it isn't in `QUICK_CHIPS` yet: the UI keeps an icon per
 *   quick chip).
 * Chip ids: the 7 quick actions (UI COACH_CHIPS + M12 focusBlock), the 6 BodyArea values, the M12
 * `week` / `progress` chips, and the follow-ups below (`args` say what they act on). 'endWorkout' and 'keepExercise' are handled by the UI, not
 * here.
 */
import type {
  BodyArea,
  FocusBlock,
  FoodSuggestion,
  MacroSet,
  NutritionTargets,
  Proposal,
  SetLog,
  TrainerState,
} from '../types';
import type { Unit } from '../units';
import {
  matchIntent,
  type DayWord,
  type Intent,
  type IntentSlots,
  type Safety,
} from './intents';
import {
  addDate,
  baseDay,
  effectiveDay,
  effectiveDays,
  localDate,
  upNext,
  weekdayOf,
} from './plan';
import {
  blockEnd,
  groupSetsOf,
  isFocusExercise,
  keepMyWeekdays,
  reviseFocusBlock,
  validDaysPerWeek,
  validWeeks,
  weekdaysFor,
  type FocusEdit,
} from './focusBlock';
import { FOCUS_RULES } from './focusRules';
import { proposeNextBlock } from './nextBlock';
import { groupLabel, groupWord, proposeFocusBlock } from './actions/focusBlock';
import { monthScore, periodScore, weekScore, type CompletionInput } from '../progress/completion';
import { pctOf } from '../progress/recap';
import { weeklyStreak } from '../stats';
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
import { easyOnArea, proposeEasyOn } from './actions/easyOn';
import { proposePostpone, type PostponeMode } from './actions/postpone';
import { findPlanDay, longDate, proposeDoToday, proposeMoveDay } from './actions/move';
import { proposeSwap, proposeSwapOptions, type SwapScope } from './actions/swap';
import { proposeRemove } from './actions/remove';
import { FULL_DAY_TITLE, proposeShortOnTime, shortOptionFor } from './actions/shortOnTime';
import { SHORT_ON_TIME } from './timeRules';
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
import { missingInPlan } from './equipment';
import {
  FOOD_DONE,
  FOOD_LATER,
  FOOD_NONE,
  FOOD_SETUP,
  foodIdeasReply,
  gymSwapReply,
  gymSwapWhy,
  HELP_TEXT,
  LEARN_FOR_INTENT,
  proposalReply,
  RED_FLAG_LINE,
  REFERRAL_LINE,
} from './replies';

export type CoachPhase = 'today' | 'preview' | 'workout';
export type QuickChipId =
  'notToday' | 'easyOn' | 'lighter' | 'swap' | 'adjustPlan' | 'food' | 'focusBlock';
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
  /** args.exerciseId: the swap for an exercise the gym lacks the kit for (M10e). */
  | 'gymSwap'
  /** UI-only: args.exerciseId, keep it despite the missing kit (M10e, stored in the profile). */
  | 'keepExercise'
  /** args.mode: Not today with that mode. */
  | 'postponeMode'
  /** args.exerciseId, option: that stall fix. */
  | 'stallFix'
  | 'deload'
  /** M12: this week's numbers. */
  | 'week'
  /** M12: week + month scores, streak, focus block. */
  | 'progress'
  /** M12: args.dayId: run that plan day today (no dayId: asks which). */
  | 'doToday'
  /** M12: args.from, to (local YYYY-MM-DD): move that planned date (no `to`: asks where). */
  | 'moveDay'
  /** M12 1b: args.minutes: fit today into that long (no minutes: asks how long). */
  | 'shortOnTime'
  /**
   * M12 1b (block recap): args.group, weeks, weekdays (+ lighterWeek, startDate): the next focus
   * block (nextBlock.ts); missing params fall back to the focus-block questions.
   */
  | 'nextBlock';

export type CoachArgs = {
  exerciseId?: string;
  toId?: string;
  scope?: SwapScope;
  mode?: PostponeMode;
  option?: StallOption;
  /** M12 focusBlock: the params gathered so far (`keepDays` = "Keep my days"). */
  group?: BodyArea;
  weeks?: number;
  days?: number;
  keepDays?: boolean;
  /** M12 focusBlock ("Keep going" from a block recap): the exact weekdays. */
  weekdays?: number[];
  /** M12 doToday: the plan day id to run today. */
  dayId?: string;
  /** M12 moveDay: the planned date to move and the date to move it to (local YYYY-MM-DD). */
  from?: string;
  to?: string;
  /** M12 1b shortOnTime: the time he has, in minutes. */
  minutes?: number;
  /** M12 1b nextBlock: a 7-day lighter week before the block. */
  lighterWeek?: boolean;
  /** M12 1b nextBlock: the earliest start (local YYYY-MM-DD). */
  startDate?: string;
  /** M13c focusBlock / nextBlock: "Also add abs?" answered (true = Yes, false = No). */
  alsoCore?: boolean;
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
  /** M10e: exercises he chose to keep despite missing kit (GymProfile.kept). */
  gymKept?: readonly string[];
  /** M12: the focus block proposed last and still pending (edits revise it). */
  focusDraft?: FocusBlock;
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
  /** M12: the block in a focusBlock proposal (for the week-by-week card). */
  focusBlock?: FocusBlock;
  /** M12 1b: a learn card ("Why?") that fits this answer (src/data/learnCards.ts id). */
  learnId?: string;
};

export const QUICK_CHIPS: readonly CoachChip[] = [
  { id: 'notToday', label: 'Not today' },
  { id: 'easyOn', label: 'Go easy on…' },
  { id: 'lighter', label: 'Lighter today' },
  { id: 'swap', label: 'Swap an exercise' },
  { id: 'adjustPlan', label: 'Adjust my plan' },
  { id: 'food', label: 'What should I eat?' },
  { id: 'focusBlock', label: 'Build a focus block' },
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
export const ASK_DAY = 'Which day?';
/** How many target dates the "Move X to which day?" question offers. */
const MOVE_CHIPS = 3;
export const NO_STALLS = 'No plateaus right now. What would you like to change?';
export const ASK_GROUP = 'Which area should the block build?';
export const ASK_WEEKS = 'For how many weeks?';
export const ASK_DAYS = 'How many days a week?';
export const ASK_MINUTES = 'How much time do you have?';
/** M13c: the "Also add abs?" step after another focus group (its Why? is `ALSO_CORE_LEARN_ID`). */
export const ASK_ALSO_CORE =
  `Also add abs? About ${FOCUS_RULES.emptyBaseSets} sets a week on ` +
  `${FOCUS_RULES.alsoCore.minDays} days, just for this block.`;
/** M13c: the learn card (src/data/learnCards.ts) the "Also add abs?" step links as its Why?. */
export const ALSO_CORE_LEARN_ID = 'coreTraining';
/** M12 1b: more time than the whole planned day takes, after a shorter version. */
export const FULL_DAY_REPLY = 'Your whole day fits. Here it is.';
/** M12 1b: the "Short on time" quick chip (asks how long, then proposes). */
export const SHORT_ON_TIME_CHIP: CoachChip = { id: 'shortOnTime', label: 'Short on time' };

/** M12: the starters on an empty thread (the swap one names today's first exercise when it can). */
export const STARTER_CHIPS: readonly CoachChip[] = [
  { id: 'week', label: "How's my week?" },
  { id: 'swap', label: 'Swap an exercise' },
  { id: 'food', label: 'What should I eat tonight?' },
  { id: 'shoulders', label: 'Go easy on shoulders' },
];

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
  focusBlock?: FocusBlock;
  /** A learn card for this answer, over the intent's default. */
  learnId?: string;
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
  if (body.focusBlock) out.focusBlock = body.focusBlock;
  const learnId = body.learnId ?? LEARN_FOR_INTENT[intent];
  if (learnId && safety === 'none' && !isWorkout(ctx)) out.learnId = learnId;
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
  const from = slots.date ? resolveDay(slots.date, ctx.today) : ctx.today;
  if (from !== ctx.today)
    return moveDay(ctx, from, slots.moveTo ? resolveDay(slots.moveTo, ctx.today) : undefined);
  const to = slots.moveTo ? resolveDay(slots.moveTo, ctx.today) : undefined;
  const r = proposePostpone(ctx.state, ctx.sessions, ctx.today, to ? { mode, to } : { mode });
  if (!r.ok) return { reply: r.reply };
  const other = OTHER_MODE[mode];
  const chips: CoachChip[] = to
    ? []
    : [{ id: 'postponeMode', label: MODE_LABEL[other], args: { mode: other } }];
  return fromResult(ctx, r, chips);
}

// ---------- M12 1b: short on time ----------

/** One chip per session length (data), minus the one already proposed. */
const timeChips = (except?: number): CoachChip[] =>
  SHORT_ON_TIME.options
    .filter((m) => m !== except)
    .map((m) => ({ id: 'shortOnTime', label: `${m} min`, args: { minutes: m } }));

function shortOnTime(ctx: CoachContext, minutes: number | undefined): Body {
  if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) {
    const t = todayDay(actionCtx(ctx));
    return t.ok ? { reply: ASK_MINUTES, chips: timeChips() } : { reply: t.reply };
  }
  const r = proposeShortOnTime(actionCtx(ctx), minutes, ctx.catalog);
  if (!r.ok) return { reply: r.reply };
  if (r.proposal.title === FULL_DAY_TITLE)
    return { reply: FULL_DAY_REPLY, proposal: r.proposal, chips: timeChips() };
  const limit = shortOptionFor(minutes);
  const lead = minutes < limit ? `The shortest plan I build is ${limit} min. ` : '';
  return {
    reply: `${lead}Here's a ${limit}-minute version of today.`,
    proposal: r.proposal,
    chips: timeChips(limit),
  };
}

// ---------- M12: do it today / move a day ----------

function doToday(ctx: CoachContext, dayId: string | undefined): Body {
  if (dayId === undefined) {
    const today = effectiveDay(ctx.state, ctx.sessions, ctx.today);
    const current = today.rest ? undefined : today.day?.id;
    return {
      reply: ASK_DAY,
      chips: ctx.state.plan.days
        .filter((d) => d.id !== current)
        .map((d) => ({ id: 'doToday', label: d.name, args: { dayId: d.id } })),
    };
  }
  const r = proposeDoToday(ctx.state, ctx.sessions, ctx.today, dayId);
  return r.ok ? fromResult(ctx, r) : { reply: r.reply };
}

function moveDay(ctx: CoachContext, from: string | undefined, to: string | undefined): Body {
  if (from === undefined) return { reply: HELP_TEXT };
  if (to !== undefined) {
    const r = proposeMoveDay(ctx.state, ctx.sessions, ctx.today, from, to);
    return r.ok ? fromResult(ctx, r) : { reply: r.reply };
  }
  // Only `from`: offer the next dates (up to a week on) that the move accepts.
  const chips: CoachChip[] = [];
  let first: ReturnType<typeof proposeMoveDay> | undefined;
  for (let i = 1; i <= 6 && chips.length < MOVE_CHIPS; i++) {
    const date = addDate(from, i);
    const r = proposeMoveDay(ctx.state, ctx.sessions, ctx.today, from, date);
    first ??= r;
    if (r.ok) chips.push({ id: 'moveDay', label: longDate(date), args: { from, to: date } });
  }
  if (
    first &&
    !first.ok &&
    ['notPlanned', 'sessionStarted', 'alreadyDone', 'badDate'].includes(first.reason) &&
    chips.length === 0
  )
    return { reply: first.reply };
  const dayId = calendarDayId(ctx, from);
  const name = (dayId && baseDay(ctx.state, from, dayId)?.name) ?? 'it';
  if (chips.length === 0) return { reply: `No free day for ${name} in the week after.` };
  return { reply: `Move ${name} to which day?`, chips };
}

/** The day planned on `date` (null on a rest date). */
function calendarDayId(ctx: CoachContext, date: string): string | null {
  const days = effectiveDays(ctx.state, ctx.sessions, ctx.today, daysFrom(ctx.today, date) + 1);
  const e = days.at(-1);
  return e && !e.rest ? (e.day?.id ?? null) : null;
}

function avoid(ctx: CoachContext, area: BodyArea | undefined, scope?: 'today' | 'plan'): Body {
  if (!area) return { reply: ASK_AREA, chips: areaChips() };
  // M12 1b: "from now on" (outside a workout) changes the standing go-easy list.
  if (scope === 'plan' && !isWorkout(ctx))
    return fromResult(ctx, proposeEasyOn(actionCtx(ctx), { add: [area] }, ctx.catalog));
  return fromResult(ctx, proposeAvoidArea(actionCtx(ctx), area, ctx.catalog));
}

/** M12 1b: a block on a listed group → "Remove X from your go-easy list first?" + that change. */
function easyFirst(ctx: CoachContext, group: BodyArea | undefined): Body | undefined {
  if (!group || !(ctx.state.easyOn ?? []).includes(group)) return undefined;
  const r = proposeEasyOn(actionCtx(ctx), { remove: [group] }, ctx.catalog);
  const reply = `Remove ${group} from your go-easy list first?`;
  return r.ok ? { reply, proposal: r.proposal } : { reply };
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

// ---------- M10e: missing kit ----------

const lacksKit = (ctx: CoachContext, id: string) => !ctx.catalog.canDo(id);

/**
 * The swap for an exercise the gym lacks the kit for: `toId` (default the closest replacement)
 * in `scope` (default the plan), the other candidates, Just today / From now on, and Keep.
 */
function gymSwapFlow(
  ctx: CoachContext,
  exerciseId: string,
  scope: SwapScope = 'plan',
  toId?: string,
): Body {
  const name = nameOf(ctx, exerciseId);
  const keep: CoachChip = { id: 'keepExercise', label: `Keep ${name}`, args: { exerciseId } };
  const actx = actionCtx(ctx);
  const opts = proposeSwapOptions(actx, exerciseId, ctx.catalog, 'plan');
  if (!opts.ok)
    return opts.reason === 'noCandidate'
      ? { reply: opts.reply, chips: [keep] }
      : { reply: opts.reply };
  const target = toId ?? opts.options[0]?.exerciseId;
  if (target === undefined)
    return { reply: 'No good swap with the kit your gym has.', chips: [keep] };
  const r = proposeSwap(actx, exerciseId, target, ctx.catalog, scope);
  if (!r.ok) return { reply: r.reply, chips: [keep] };
  const why = gymSwapWhy(ctx.catalog.missingKitLabels?.(exerciseId) ?? [], scope);
  const chips: CoachChip[] = opts.options
    .filter((o) => o.exerciseId !== target)
    .map((o) => ({
      id: 'swapTo',
      label: `Try ${o.name}`,
      args: { exerciseId, toId: o.exerciseId, scope: 'plan' },
    }));
  const other: SwapScope = scope === 'plan' ? 'today' : 'plan';
  if (proposeSwap(actx, exerciseId, target, ctx.catalog, other).ok)
    chips.push({
      id: 'swapTo',
      label: other === 'today' ? 'Just today' : 'From now on',
      args: { exerciseId, toId: target, scope: other },
    });
  chips.push(keep);
  return { reply: gymSwapReply(name), proposal: { ...r.proposal, why }, chips };
}

/** One chip per plan exercise the gym lacks the kit for (not kept), for "Adjust my plan". */
function gymChips(ctx: CoachContext): CoachChip[] {
  if (isWorkout(ctx)) return [];
  const ids = [
    ...new Set(missingInPlan(ctx.state, ctx.catalog, ctx.gymKept ?? []).map((m) => m.exerciseId)),
  ];
  return ids.map((id) => ({
    id: 'gymSwap',
    label: `Swap ${nameOf(ctx, id)} (no kit)`,
    args: { exerciseId: id },
  }));
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

/**
 * Checkpoint J: "Adjust my plan" with no plateau is a menu of every plan change, minus the ones
 * today can't take (a session started or done today: nothing for today; a rest day: only "do
 * another day today").
 */
function noStalls(ctx: CoachContext, gym: CoachChip[]): Body {
  const busy = ctx.sessions.some((s) => localDate(s.startedAt) === ctx.today);
  const rest = effectiveDay(ctx.state, ctx.sessions, ctx.today).rest;
  const todayChips: CoachChip[] = busy
    ? []
    : [
        { id: 'doToday', label: 'Do another day today' },
        ...(rest
          ? []
          : [
              { id: 'notToday' as const, label: 'Not today' },
              { id: 'lighter' as const, label: 'Lighter today' },
              { ...SHORT_ON_TIME_CHIP },
            ]),
      ];
  return {
    reply: NO_STALLS,
    chips: [
      ...gym,
      ...todayChips,
      { id: 'deload', label: 'Deload week' },
      { id: 'swap', label: 'Swap an exercise', args: { scope: 'plan' } },
    ],
  };
}

/** A stall's fixes, without one more set on a lift that loads a go-easy area (M12 1b). */
function optionsOf(ctx: CoachContext, stall: Stall): StallOption[] {
  const easy = easyOnArea(stall.exerciseId, ctx.state.easyOn ?? [], ctx.catalog);
  return easy ? stall.options.filter((o) => o !== 'addSet') : [...stall.options];
}

function stallFlow(ctx: CoachContext, exerciseId?: string, option?: StallOption): Body {
  const all = stalls(ctx);
  const stall = exerciseId ? all.find((s) => s.exerciseId === exerciseId) : all[0];
  // "Adjust my plan": exercises the gym lacks the kit for come first (M10e).
  const gym = exerciseId ? [] : gymChips(ctx);
  if (!stall) {
    if (exerciseId)
      return { reply: `${nameOf(ctx, exerciseId)} is still moving. No change needed.` };
    return noStalls(ctx, gym);
  }
  const options = optionsOf(ctx, stall);
  const pick = option && stall.options.includes(option) ? option : options[0];
  if (!pick) return { reply: stallLine(stall, (id) => nameOf(ctx, id)) };
  const r = proposeStallFix(ctx.state, ctx.sessions, ctx.today, stall, pick, {
    unit: ctx.unit,
    name: (id) => nameOf(ctx, id),
    catalog: ctx.catalog,
  });
  const line = stallLine(stall, (id) => nameOf(ctx, id));
  if (!r.ok) return { reply: `${line} ${r.reply}` };
  const chips: CoachChip[] = [
    ...gym,
    ...options
      .filter((o) => o !== pick)
      .map((o) => ({
        id: 'stallFix' as const,
        label: OPTION_LABEL[o],
        args: { exerciseId: stall.exerciseId, option: o },
      })),
    ...all.flatMap((s) => {
      const first = optionsOf(ctx, s)[0];
      return s === stall || first === undefined
        ? []
        : [
            {
              id: 'stallFix' as const,
              label: `${nameOf(ctx, s.exerciseId)}: ${OPTION_LABEL[first]}`,
              args: { exerciseId: s.exerciseId, option: first },
            },
          ];
    }),
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

// ---------- M12: week, progress, focus blocks ----------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const LONG_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function completionInput(ctx: CoachContext): CompletionInput {
  return {
    state: ctx.state,
    sessions: ctx.sessions,
    sets: ctx.sets ?? [],
    today: ctx.today,
    catalog: ctx.catalog,
  };
}

/** "2 of 5 sessions, 92% of planned sets" (the % only once sets were due). */
function scoreText(
  s: { sessionsDone: number; sessionsPlanned: number; setsDone: number; setsPlanned: number },
  done = '',
): string {
  const pct = pctOf(s);
  const head = `${s.sessionsDone} of ${plural(s.sessionsPlanned, 'session')}${done}`;
  return pct === null ? head : `${head}, ${pct}% of planned sets`;
}

function nextLine(ctx: CoachContext): string {
  const up = upNext(ctx.state, ctx.sessions, ctx.today);
  if (!up) return '';
  const name = baseDay(ctx.state, up.date, up.dayId)?.name ?? up.dayId;
  const when =
    up.date === ctx.today
      ? 'today'
      : up.date === addDate(ctx.today, 1)
        ? 'tomorrow'
        : `on ${LONG_DAY[weekdayOf(up.date)] ?? up.date}`;
  return ` Next: ${name} ${when}.`;
}

function weekAnswer(ctx: CoachContext): Body {
  const w = weekScore(completionInput(ctx), ctx.today);
  const extra = w.extra > 0 ? ` Plus ${plural(w.extra, 'extra session')}.` : '';
  if (w.sessionsPlanned === 0)
    return { reply: `No sessions planned this week.${extra}${nextLine(ctx)}` };
  const pct = pctOf(w);
  const sets = pct === null ? '' : `, ${pct}% of planned sets so far`;
  return {
    reply: `This week: ${w.sessionsDone} of ${plural(w.sessionsPlanned, 'session')} done${sets}.${extra}${nextLine(ctx)}`,
  };
}

function todayMs(today: string): number {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).getTime();
}

function progressAnswer(ctx: CoachContext): Body {
  const input = completionInput(ctx);
  const w = weekScore(input, ctx.today);
  const m = monthScore(input, ctx.today.slice(0, 7));
  const line = (label: string, s: typeof w) =>
    s.sessionsPlanned === 0 ? `${label}: nothing planned yet.` : `${label}: ${scoreText(s)}.`;
  const streak = weeklyStreak(ctx.sessions, todayMs(ctx.today));
  const parts = [line('This week', w), line('This month', m), `Streak: ${plural(streak, 'week')}.`];
  const block = [...(ctx.state.blocks ?? [])]
    .reverse()
    .find((b) => b.startDate <= ctx.today && blockEnd(b) >= ctx.today);
  if (block) {
    const focus = periodScore(input, block.startDate, blockEnd(block)).focus;
    const week = Math.floor(daysFrom(block.startDate, ctx.today) / 7) + 1;
    if (focus)
      parts.push(
        `${groupLabel(block.group)} block: week ${week} of ${block.weeks}, ${focus.sets} of ${focus.target} ${groupWord(block.group)} sets so far.`,
      );
  }
  return { reply: parts.join(' ') };
}

function daysFrom(from: string, to: string): number {
  let n = 0;
  for (let d = from; d < to; d = addDate(d, 1)) n++;
  return n;
}

/** Areas the gym can build (a doable focus exercise exists). */
function focusGroups(ctx: CoachContext): BodyArea[] {
  return AREA_CHIP_IDS.filter((a) =>
    ctx.catalog.exercises.some(
      (e) => isFocusExercise(e.id, a, ctx.catalog) && ctx.catalog.canDo(e.id),
    ),
  );
}

const focusChip = (label: string, args: CoachArgs): CoachChip => ({
  id: 'focusBlock',
  label,
  args,
});

const weekChips = (args: CoachArgs): CoachChip[] =>
  [2, 3, 4, 5, 6].map((n) =>
    focusChip(n === FOCUS_RULES.monthWeeks ? `${n} weeks (a month)` : `${n} weeks`, {
      ...args,
      weeks: n,
    }),
  );

/** The date a new block starts: today, or tomorrow when today already has a session. */
function blockStart(ctx: CoachContext): string {
  const busy = ctx.sessions.some((s) => localDate(s.startedAt) === ctx.today);
  return busy ? addDate(ctx.today, 1) : ctx.today;
}

function blockBody(r: ReturnType<typeof proposeFocusBlock>, reply: string): Body {
  if (!r.ok) return { reply: r.reply };
  const block = r.proposal.next.blocks?.at(-1);
  return { reply, proposal: r.proposal, ...(block ? { focusBlock: block } : {}) };
}

/**
 * M13c: whether to ask "Also add abs?" for a block on `group`: another group, the plan has no
 * abs sets, core isn't on the go-easy list and the gym can do an abs exercise.
 */
function offersAlsoCore(ctx: CoachContext, group: BodyArea): boolean {
  const core = FOCUS_RULES.alsoCore.group;
  if (group === core || (ctx.state.easyOn ?? []).includes(core)) return false;
  if (!focusGroups(ctx).includes(core)) return false;
  return ctx.state.plan.days.every((d) => groupSetsOf(d.exercises, core, ctx.catalog) === 0);
}

function focusFlow(ctx: CoachContext, args: CoachArgs): Body {
  const { group } = args;
  const first = easyFirst(ctx, group);
  if (first) return first;
  const known: CoachArgs = {};
  if (group) known.group = group;
  if (args.weeks !== undefined && validWeeks(args.weeks)) known.weeks = args.weeks;
  if (args.days !== undefined && validDaysPerWeek(args.days)) known.days = args.days;
  if (args.keepDays) known.keepDays = true;
  if (args.weekdays) known.weekdays = [...args.weekdays];
  if (args.alsoCore !== undefined) known.alsoCore = args.alsoCore;
  let lead = '';
  if (args.weeks !== undefined && !validWeeks(args.weeks))
    lead = 'A focus block runs 2 to 6 weeks. ';
  else if (args.days !== undefined && !validDaysPerWeek(args.days))
    lead = 'A focus block trains 3 to 6 days a week. ';
  const groups = focusGroups(ctx);
  const groupChips = () => {
    const { group: _g, ...rest } = known;
    void _g;
    return groups.map((a) => focusChip(groupLabel(a), { ...rest, group: a }));
  };

  if (!group) return { reply: `${lead}${ASK_GROUP}`, chips: groupChips() };
  if (!groups.includes(group))
    return {
      reply: `I don't have ${groupWord(group)} exercises your gym can do yet. ${ASK_GROUP}`,
      chips: groupChips(),
    };
  if (known.weeks === undefined) return { reply: `${lead}${ASK_WEEKS}`, chips: weekChips(known) };
  const hasDays = known.days !== undefined || known.keepDays || known.weekdays !== undefined;
  if (!hasDays)
    return {
      reply: `${lead}${ASK_DAYS}`,
      chips: [
        focusChip('Keep my days', { ...known, keepDays: true }),
        ...[3, 4, 5, 6].map((n) => focusChip(`${n} days`, { ...known, days: n })),
      ],
    };
  if (known.alsoCore === undefined && offersAlsoCore(ctx, group))
    return {
      reply: ASK_ALSO_CORE,
      chips: [
        focusChip('Yes', { ...known, alsoCore: true }),
        focusChip('No', { ...known, alsoCore: false }),
      ],
      learnId: ALSO_CORE_LEARN_ID,
    };
  const weekdays =
    known.weekdays ??
    (known.days !== undefined
      ? weekdaysFor(known.days)
      : keepMyWeekdays(ctx.state, ctx.sessions, ctx.today));
  const alsoCore = known.alsoCore === true && offersAlsoCore(ctx, group);
  const r = proposeFocusBlock(
    actionCtx(ctx),
    {
      group,
      weeks: known.weeks,
      weekdays,
      startDate: blockStart(ctx),
      ...(alsoCore ? { alsoCore: true as const } : {}),
    },
    ctx.catalog,
  );
  const block = r.ok ? r.proposal.next.blocks?.at(-1) : undefined;
  const withAbs = block?.alsoCore ? ', with abs' : '';
  return blockBody(r, `Here's a ${known.weeks}-week ${groupWord(group)} block${withAbs}.`);
}

function focusEdit(ctx: CoachContext, s: IntentSlots): Body {
  const draft = ctx.focusDraft;
  if (!draft) {
    if (s.exerciseId !== undefined && s.weeks === undefined && s.daysPerWeek === undefined)
      return swapFlow(ctx, s.exerciseId, s.scope);
    const args: CoachArgs = {};
    if (s.weeks !== undefined) args.weeks = s.weeks;
    if (s.daysPerWeek !== undefined) args.days = s.daysPerWeek;
    return focusFlow(ctx, args);
  }
  let edit: FocusEdit | undefined;
  if (s.daysPerWeek !== undefined) edit = { daysPerWeek: s.daysPerWeek };
  else if (s.weeks !== undefined) edit = { weeks: s.weeks };
  else if (s.exerciseId !== undefined) {
    const weekday =
      s.date && s.date !== 'today' && s.date !== 'tomorrow' ? DAY_INDEX[s.date] : undefined;
    edit = {
      swap:
        weekday === undefined
          ? { exerciseId: s.exerciseId }
          : { weekday, exerciseId: s.exerciseId },
    };
  }
  if (!edit)
    return {
      reply: ASK_DAYS,
      chips: [3, 4, 5, 6].map((n) =>
        focusChip(`${n} days`, {
          group: draft.group,
          weeks: draft.weeks,
          days: n,
          alsoCore: draft.alsoCore === true,
        }),
      ),
    };
  const r = reviseFocusBlock(draft, edit, ctx.state, ctx.catalog, ctx.sessions);
  if (!r.ok) return { reply: r.reply };
  return blockBody(
    proposeFocusBlock(actionCtx(ctx), r.block, ctx.catalog),
    "Here's the updated block.",
  );
}

/** M12 1b: the next block from a block recap chip (with its lighter week when asked). */
function nextBlock(ctx: CoachContext, args: CoachArgs): Body {
  const { group, weeks, weekdays } = args;
  if (!group || weeks === undefined || !weekdays) return focusFlow(ctx, args);
  const first = easyFirst(ctx, group);
  if (first) return first;
  const r = proposeNextBlock(
    actionCtx(ctx),
    {
      group,
      weeks,
      weekdays: [...weekdays],
      ...(args.lighterWeek !== undefined ? { lighterWeek: args.lighterWeek } : {}),
      ...(args.startDate !== undefined ? { startDate: args.startDate } : {}),
      ...(args.alsoCore === true ? { alsoCore: true as const } : {}),
    },
    ctx.catalog,
  );
  const block = r.ok ? r.proposal.next.blocks?.at(-1) : undefined;
  const withAbs = block?.alsoCore ? ', with abs' : '';
  return blockBody(r, `Here's the next ${weeks}-week ${groupWord(group)} block${withAbs}.`);
}

/** M12: the starters, the swap one naming today's first exercise that can still change. */
export function starterChips(ctx: CoachContext): CoachChip[] {
  const first = todayDay(actionCtx(ctx));
  const id = first.ok ? first.day.exercises[0]?.exerciseId : undefined;
  return STARTER_CHIPS.map((c) =>
    c.id === 'swap' && id !== undefined
      ? { id: 'swap', label: `Swap today's ${nameOf(ctx, id)}`, args: { exerciseId: id } }
      : { ...c },
  );
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
  'gymSwap',
  'week',
  'progress',
  'focusBlock',
  'focusEdit',
  'doToday',
  'moveDay',
  'shortOnTime',
  'nextBlock',
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
      return done(avoid(ctx, s.area, s.scope));
    case 'lighter':
      return done(fromResult(ctx, proposeLighter(actionCtx(ctx))));
    case 'deload':
      return done(fromResult(ctx, proposeDeload(actionCtx(ctx))));
    case 'swap':
      if (s.exerciseId && !isWorkout(ctx) && lacksKit(ctx, s.exerciseId))
        return done(gymSwapFlow(ctx, s.exerciseId, s.scope));
      return done(s.exerciseId ? swapFlow(ctx, s.exerciseId, s.scope) : askExercise(ctx, s.scope));
    case 'stall':
      return done(stallFlow(ctx, s.exerciseId));
    case 'food':
      return done(food(ctx));
    case 'week':
      return done(weekAnswer(ctx));
    case 'progress':
      return done(progressAnswer(ctx));
    case 'focusBlock': {
      const args: CoachArgs = {};
      if (s.group) args.group = s.group;
      if (s.weeks !== undefined) args.weeks = s.weeks;
      if (s.daysPerWeek !== undefined) args.days = s.daysPerWeek;
      return done(focusFlow(ctx, args));
    }
    case 'focusEdit':
      return done(focusEdit(ctx, s));
    case 'doToday': {
      // A full name ("Push A") or the first word(s) of names ("push": the next one coming up).
      const day =
        s.dayName === undefined
          ? undefined
          : findPlanDay(ctx.state, ctx.sessions, ctx.today, s.dayName);
      return done(doToday(ctx, day?.id));
    }
    case 'shortOnTime':
      return done(shortOnTime(ctx, s.minutes));
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
  gymSwap: 'swap',
  remove: 'swap',
  adjustPlan: 'stall',
  stallFix: 'stall',
  food: 'food',
  week: 'week',
  progress: 'progress',
  focusBlock: 'focusBlock',
  doToday: 'doToday',
  moveDay: 'postpone',
  shortOnTime: 'shortOnTime',
  nextBlock: 'focusBlock',
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
    case 'gymSwap':
      if (!ex) return done(askExercise(ctx, 'plan'));
      return done(lacksKit(ctx, ex) ? gymSwapFlow(ctx, ex) : swapFlow(ctx, ex, 'plan'));
    case 'swapTo': {
      if (!ex || !args.toId) return done({ reply: HELP_TEXT });
      const scope: SwapScope = isWorkout(ctx) ? 'today' : (args.scope ?? 'today');
      if (!isWorkout(ctx) && lacksKit(ctx, ex)) return done(gymSwapFlow(ctx, ex, scope, args.toId));
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
    case 'week':
      return done(weekAnswer(ctx));
    case 'progress':
      return done(progressAnswer(ctx));
    case 'focusBlock':
      return done(focusFlow(ctx, args));
    case 'doToday':
      return done(doToday(ctx, args.dayId));
    case 'moveDay':
      return done(moveDay(ctx, args.from, args.to));
    case 'shortOnTime':
      return done(shortOnTime(ctx, args.minutes));
    case 'nextBlock':
      return done(nextBlock(ctx, args));
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
