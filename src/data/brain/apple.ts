/**
 * M12 slice 2 (task 8, M10 B5): the Apple on-device brain behind the `CoachBrain` seam.
 *
 * - `status()` maps the bridge's `availability()` to `{ available, reason, reasonId }`; the
 *   router shows the plain note for `reasonId` once (notes.ts). A junk answer has no `reasonId`
 *   (a failed check must not store a note forever); a throw/hang is the router's generic note.
 * - `ask()` builds one request: the guardrail instructions, the context text (the last 8 turns
 *   live inside it), **only the new message** (≤ MESSAGE_MAX_CHARS) and the read-only tool
 *   results; then `sanitizeReply` on every reply. The first valid `propose*` call becomes the
 *   Proposal (via core `runToolCall`, so Apply stays his tap); a failed one → our own reason
 *   (refusals) or COULDNT_DO (malformed calls), then TRY_THESE + the closest chips + quick chips;
 *   a second valid one → a chip. Read-only calls are ignored (their text
 *   was passed in).
 * - Red flags never reach the model: the rules answer (only the red-flag line).
 * - 1.15.2 "Coach acts" (core brain/route.ts): a message the rules read as a change, an empty
 *   one or Thai is answered by `handle()` (the chips' proposals: clarifying questions, kit-aware
 *   swaps, the mid-workout block), sanitized, `source: 'rules'`, no model call. The 1.15.0 phone
 *   eval: the model made the right call for 28 of 109 change requests, the rules for 103.
 * - 1.16.2 "Coach facts" (core brain/facts.ts): a question about the user's own saved numbers
 *   (route `why: 'facts'`) is answered in code from the same BrainInput the model would get,
 *   sanitized, `source: 'rules'`, latency 0, no tool call; the trace has route/why only, never the
 *   text. No data for it (the answerer returns null) → the model, as before. His 1.16.1 phone
 *   eval: all six facts misses were the model quoting wrong numbers from a correct context.
 * - Errors: rejects with `BrainError(code)`; the router falls back to the rules with a note.
 *
 * The bridge is injected (task 7's src/native/gymBrain.ts fits `GymBrainBridge`). Its
 * convention: `respond` rejects with an Error/object carrying `code: BrainErrorCode`; anything
 * else is treated as `'other'`. No network: Apple's model runs on the phone.
 */
import { handle, QUICK_CHIPS, type CoachChip } from '../../core/trainer/coach';
import type { Intent, Safety } from '../../core/trainer/intents';
import { routeMessage, type RouteWhy } from '../../core/trainer/brain/route';
import {
  runToolCall,
  TRAINER_TOOLS,
  type ToolFailKind,
  type ToolOutcome,
} from '../../core/trainer/tools';
import { shortOptionFor } from '../../core/trainer/actions/shortOnTime';
import { brainInstructions } from '../../core/trainer/brain/instructions';
import {
  BUDGET,
  serializeContext,
  type BrainInput,
  type LighterCard,
} from '../../core/trainer/brain/context';
import { sanitizeReply } from '../../core/trainer/brain/sanitize';
import { readToolResults } from '../../core/trainer/brain/readTools';
import { answerFact } from '../../core/trainer/brain/facts';
import { normalizeText } from '../../core/trainer/intents';
import { sayFor } from '../../core/trainer/speakRules';
import type {
  BodyArea,
  BrainContext,
  BrainReply,
  BrainUnavailableReason,
  ChatMessage,
  CoachBrain,
  Goal,
  GoalKind,
  GymBrainRequest,
  GymBrainResponse,
  ProposalAction,
  ToolCall,
} from '../../core/types';
import { cueFor, exerciseName, howToFor } from '../catalog';
import { BrainError, UNAVAILABLE_COPY, brainErrorCode, isUnavailableReason } from './notes';

/** The minimal native bridge this adapter needs (task 7 implements it). */
export type GymBrainBridge = {
  /**
   * Rejects when the check itself fails (plugin error, junk reply, timeout); the router then shows
   * a generic one-off note and stores nothing. Only a real native answer resolves a reason.
   */
  availability(): Promise<
    { available: true } | { available: false; reason: BrainUnavailableReason }
  >;
  /** Rejects with `{ code: BrainErrorCode }` (an Error with a `code` field) on failure. */
  respond(req: GymBrainRequest): Promise<GymBrainResponse>;
};

/** `reasonId` only when the bridge gave a real reason (a failed/junk check has none). */
export type AppleStatus =
  { available: true } | { available: false; reason: string; reasonId?: BrainUnavailableReason };

export interface AppleBrain extends CoachBrain {
  id: 'apple';
  status(): Promise<AppleStatus>;
}

/** What the app knows beyond the BrainContext; read on every ask (settings can change). */
export type AppleExtras = {
  /** Today's "Lighter today?" card, if it shows. */
  lighterCard?: LighterCard | null;
  goalKind?: GoalKind;
  goalText?: string;
  goals?: readonly Goal[];
  /** settings 'coach'.appleCardReasons (M12-q1); undefined = true. */
  appleCardReasons?: boolean;
  /** The coach voice (Settings); default calm. */
  voice?: 'calm' | 'drill';
};

export type AppleDeps = {
  extras?: (ctx: BrainContext) => AppleExtras | Promise<AppleExtras>;
  /** Defaults: src/data/catalog howToFor / cueFor. */
  howTo?: BrainInput['howTo'];
  cue?: BrainInput['cue'];
  /** Clock for latency when the bridge reports none. */
  now?: () => number;
  /** The model's context window in tokens (GymBrain `measure().contextSize`); read on every ask. */
  windowTokens?: () => number | undefined;
};

/** The new message's cap (context.ts BUDGET counts 400 characters for it). */
export const MESSAGE_MAX_CHARS = BUDGET.messageChars;
/**
 * The reply when the model's call doesn't fit the schema (or names no tool): the validation
 * reason is never shown (Checkpoint J showed "Bad to." garbled); the trace keeps its kind + arg.
 */
export const COULDNT_DO = "I couldn't make that change.";
/** Ends every failed-call reply; the chips follow. */
export const TRY_THESE = 'Try one of these:';
/** Shown copy per failure kind: our own reason text, or COULDNT_DO for a malformed call. */
const SHOWS_REASON: ReadonlySet<ToolFailKind> = new Set(['refused', 'midWorkout', 'redFlag']);
/** Most extra tool calls turned into chips. */
const MAX_CALL_CHIPS = 2;

export function capMessage(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= MESSAGE_MAX_CHARS) return t;
  const cut = t.slice(0, MESSAGE_MAX_CHARS - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > MESSAGE_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const ACTION_INTENT: Record<ProposalAction, Intent> = {
  postpone: 'postpone',
  avoidArea: 'avoidArea',
  lighter: 'lighter',
  deload: 'deload',
  swap: 'swap',
  stall: 'stall',
  food: 'food',
  focusBlock: 'focusBlock',
  shortOnTime: 'shortOnTime',
  starterPlan: 'help',
  easyOn: 'avoidArea',
  doToday: 'doToday',
};

const PROPOSE_TOOLS = new Map(
  TRAINER_TOOLS.flatMap((t) => (t.readOnly ? [] : [[t.name, t] as const])),
);

const WORKOUT_CHIPS = new Set(['easyOn', 'lighter', 'swap']);

function quickChips(workout: boolean): CoachChip[] {
  return QUICK_CHIPS.filter((c) => !workout || WORKOUT_CHIPS.has(c.id)).map((c) => ({ ...c }));
}

/** After a failed call to a tool: the closest options first (data), then the quick chips. */
const CLOSEST_CHIPS: Record<string, readonly CoachChip[]> = {
  postponeSession: [
    { id: 'doToday', label: 'Do another day today' },
    { id: 'notToday', label: 'Not today' },
  ],
  doDayToday: [{ id: 'doToday', label: 'Do another day today' }],
};

function failChips(toolName: string, workout: boolean): CoachChip[] {
  const out: CoachChip[] = [];
  for (const c of [...(workout ? [] : (CLOSEST_CHIPS[toolName] ?? [])), ...quickChips(workout)])
    if (!out.some((x) => x.id === c.id)) out.push({ ...c });
  return out;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** A validated extra tool call as a follow-up chip (labels as data). */
const CALL_CHIP: Record<string, (a: Record<string, unknown>) => CoachChip | null> = {
  postponeSession: (a) => {
    const from = str(a.from);
    const to = str(a.to);
    if (from !== undefined || to !== undefined)
      return {
        id: 'moveDay',
        label: 'Move that day',
        args: { ...(from && { from }), ...(to && { to }) },
      };
    const mode = a.mode === 'pushWeek' ? 'pushWeek' : 'useRestDay';
    return {
      id: 'postponeMode',
      label: mode === 'pushWeek' ? 'Push the week' : 'Use the rest day',
      args: { mode },
    };
  },
  avoidBodyArea: (a) => {
    const area = str(a.area) as BodyArea | undefined;
    return area ? { id: area, label: `Go easy on ${area}` } : null;
  },
  lighterToday: () => ({ id: 'lighter', label: 'Lighter today' }),
  deloadWeek: () => ({ id: 'deload', label: 'Lighter week' }),
  swapExercise: (a) => {
    const exerciseId = str(a.exerciseId);
    if (!exerciseId) return null;
    const toId = str(a.toId);
    const scope = a.scope === 'plan' || a.scope === 'today' ? a.scope : undefined;
    const label = `Swap ${exerciseName(exerciseId)}`;
    return toId
      ? { id: 'swapTo', label, args: { exerciseId, toId, ...(scope && { scope }) } }
      : { id: 'pickExercise', label, args: { exerciseId, ...(scope && { scope }) } };
  },
  adjustStalledExercise: (a) => {
    const exerciseId = str(a.exerciseId);
    const option = a.option === 'lighter' || a.option === 'addSet' ? a.option : undefined;
    return exerciseId && option
      ? { id: 'stallFix', label: 'Get past this plateau', args: { exerciseId, option } }
      : { id: 'adjustPlan', label: 'Get past a plateau' };
  },
  suggestFood: () => ({ id: 'food', label: 'Food ideas' }),
  proposeFocusBlock: (a) => {
    const group = str(a.group) as BodyArea | undefined;
    if (!group || typeof a.weeks !== 'number' || !Array.isArray(a.weekdays)) return null;
    return {
      id: 'focusBlock',
      label: `Build a ${group} block`,
      args: { group, weeks: a.weeks, weekdays: (a.weekdays as number[]).slice() },
    };
  },
  shortOnTime: (a) => {
    if (typeof a.minutes !== 'number') return null;
    const minutes = shortOptionFor(a.minutes);
    return { id: 'shortOnTime', label: `${minutes}-minute version`, args: { minutes } };
  },
  setEasyOn: () => ({ id: 'easyOn', label: 'Go easy on…' }),
  doDayToday: () => ({ id: 'doToday', label: 'Do another day today' }),
};

/** Dev log / eval trace: ids and numbers only, never text. */
export type AppleTrace = {
  latencyMs: number;
  /** The tool name of the proposal shown, or 'none'. */
  action: string;
  /**
   * Every propose call the model made, in order, and whether it validated; a failed one has its
   * kind and, for invalidArgs, the arg name (an id or '?'), never the reason text.
   */
  calls: { name: string; ok: boolean; fail?: ToolFailKind; arg?: string }[];
  /** sanitizeReply swapped the model's text. */
  replaced: boolean;
  hits: string[];
  usedHealth: boolean;
  /** Answered by the rules without asking the model because of a red flag. */
  redFlag: boolean;
  /** 1.15.2: who answered (route.ts); `why` only for the rules. */
  route: 'rules' | 'model';
  why?: RouteWhy;
};

export type AppleAnswer = {
  reply: BrainReply;
  trace: AppleTrace;
  /** The first propose call (name + schema-checked args), for the eval's args check. */
  call?: ToolCall;
};

function withoutEcho(turns: readonly ChatMessage[], text: string): readonly ChatMessage[] {
  const last = turns.at(-1);
  return last && last.role === 'user' && last.text.trim() === text.trim()
    ? turns.slice(0, -1)
    : turns;
}

function goodResponse(r: unknown): { text: string; calls: ToolCall[] } {
  if (typeof r !== 'object' || r === null) throw new BrainError('other');
  const o = r as Partial<GymBrainResponse>;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  const calls = Array.isArray(o.toolCalls)
    ? o.toolCalls.filter(
        (c): c is ToolCall =>
          typeof c === 'object' &&
          c !== null &&
          typeof c.name === 'string' &&
          typeof c.args === 'object' &&
          c.args !== null &&
          !Array.isArray(c.args),
      )
    : [];
  if (text === '' && calls.length === 0) throw new BrainError('other');
  return { text, calls };
}

/** The BrainInput both the model request and the facts answerer read. */
async function inputFor(
  text: string,
  ctx: BrainContext,
  deps: AppleDeps,
): Promise<{ input: BrainInput; extras: AppleExtras }> {
  const extras = (await deps.extras?.(ctx)) ?? {};
  const input: BrainInput = {
    coach: ctx.coach,
    turns: withoutEcho(ctx.turns, text),
    howTo: deps.howTo ?? howToFor,
    cue: deps.cue ?? cueFor,
    ...(extras.lighterCard ? { lighterCard: extras.lighterCard } : {}),
    ...(extras.goalKind ? { goalKind: extras.goalKind } : {}),
    ...(extras.goalText ? { goalText: extras.goalText } : {}),
    ...(extras.goals ? { goals: extras.goals } : {}),
  };
  return { input, extras };
}

/** Builds the request for `text` (exported for the eval runner and main's tests). */
export async function buildAppleRequest(
  text: string,
  ctx: BrainContext,
  deps: AppleDeps = {},
  built?: { input: BrainInput; extras: AppleExtras },
): Promise<{ request: GymBrainRequest; usedHealth: boolean; input: BrainInput }> {
  const { input, extras } = built ?? (await inputFor(text, ctx, deps));
  const context = serializeContext(input, {
    brain: 'apple',
    appleCardReasons: extras.appleCardReasons,
    windowTokens: deps.windowTokens?.(),
  });
  return {
    request: {
      instructions: brainInstructions({ phase: ctx.coach.phase, voice: extras.voice ?? 'calm' }),
      context: context.text,
      messages: [{ role: 'user', text: capMessage(text) }],
      toolResults: readToolResults(input),
    },
    usedHealth: context.usedHealth,
    input,
  };
}

/** One Apple turn with its trace. Rejects with BrainError on a bridge failure. */
export async function askApple(
  bridge: GymBrainBridge,
  text: string,
  ctx: BrainContext,
  deps: AppleDeps = {},
): Promise<AppleAnswer> {
  const coach = ctx.coach;
  const phase = coach.phase;
  const route = routeMessage(text, coach);
  const match = route.match;
  const safety: Safety = match.safety;

  if (route.to === 'rules' && route.why === 'redFlag') {
    const rules = handle({ text }, coach);
    const clean = sanitizeReply(rules.reply, 'redFlag', { phase });
    // Never a proposal, food ideas or a block after a red flag (the rules give none anyway).
    const reply: BrainReply = { ...rules, reply: clean.text, safety: 'redFlag', source: 'apple' };
    delete reply.proposal;
    delete reply.foods;
    delete reply.focusBlock;
    return {
      reply,
      trace: {
        latencyMs: 0,
        action: 'none',
        calls: [],
        replaced: false,
        hits: clean.hits,
        usedHealth: false,
        redFlag: true,
        route: 'rules',
        why: 'redFlag',
      },
    };
  }

  let built: { input: BrainInput; extras: AppleExtras } | undefined;
  if (route.to === 'rules' && route.why === 'facts') {
    built = await inputFor(text, ctx, deps);
    const answer = answerFact(route.fact, built.input, normalizeText(text));
    if (answer !== null) {
      const clean = sanitizeReply(answer, safety, { phase });
      const reply: BrainReply = {
        reply: clean.text,
        chips: [],
        safety,
        intent: match.intent,
        source: 'rules',
      };
      const say = sayFor({ reply: clean.text }, phase);
      if (say !== undefined) reply.say = say;
      return {
        reply,
        trace: {
          latencyMs: 0,
          action: 'none',
          calls: [],
          replaced: clean.replaced,
          hits: clean.hits,
          usedHealth: false,
          redFlag: false,
          route: 'rules',
          why: 'facts',
        },
      };
    }
    // No saved data behind the answer: the model answers, as before.
  }

  if (route.to === 'rules' && route.why !== 'facts') {
    const rules = handle({ text }, coach);
    const clean = sanitizeReply(rules.reply, safety, { phase });
    const reply: BrainReply = { ...rules, reply: clean.text, source: 'rules' };
    delete reply.say;
    const say = sayFor({ reply: clean.text, say: rules.say }, phase);
    if (say !== undefined) reply.say = say;
    return {
      reply,
      trace: {
        latencyMs: 0,
        action: route.call?.name ?? 'none',
        calls: [],
        replaced: clean.replaced,
        hits: clean.hits,
        usedHealth: false,
        redFlag: false,
        route: 'rules',
        why: route.why,
      },
      ...(route.call ? { call: { name: route.call.name, args: { ...route.call.args } } } : {}),
    };
  }

  const { request, usedHealth } = await buildAppleRequest(text, ctx, deps, built);
  const now = deps.now ?? Date.now;
  const started = now();
  let raw: unknown;
  try {
    raw = await bridge.respond(request);
  } catch (err) {
    throw new BrainError(brainErrorCode(err) ?? 'other');
  }
  const { text: modelText, calls: allCalls } = goodResponse(raw);
  const reported = (raw as Partial<GymBrainResponse>).latencyMs;
  const latencyMs =
    typeof reported === 'number' && Number.isFinite(reported) && reported >= 0
      ? Math.round(reported)
      : Math.max(0, now() - started);

  const proposeCalls = allCalls.filter(
    (c) => !TRAINER_TOOLS.some((t) => t.readOnly && t.name === c.name),
  );
  const outcomes: { call: ToolCall; out: ToolOutcome }[] = proposeCalls.map((call) => ({
    call,
    out: runToolCall(call, coach, { safety }),
  }));

  const first = outcomes[0];
  let body = modelText;
  let intent: Intent = match.intent;
  let chips: CoachChip[] = [];
  const extra: Pick<BrainReply, 'proposal' | 'foods' | 'focusBlock'> = {};
  let action = 'none';

  if (first && !first.out.ok) {
    const out = first.out;
    body = `${SHOWS_REASON.has(out.kind) ? out.reason : COULDNT_DO} ${TRY_THESE}`;
    intent = 'help';
    chips = failChips(first.call.name, phase === 'workout');
  } else if (first?.out.ok) {
    const out = first.out;
    if (body === '') body = out.reply;
    const tool = PROPOSE_TOOLS.get(first.call.name);
    // The proposal's own action wins: postponeSession { to: today } proposes a doToday.
    const act = out.proposal?.action ?? (tool && !tool.readOnly ? tool.action : undefined);
    if (act) intent = ACTION_INTENT[act];
    if (out.proposal) extra.proposal = out.proposal;
    if (out.foods) extra.foods = out.foods;
    if (out.focusBlock) extra.focusBlock = out.focusBlock;
    action = first.call.name;
    for (const o of outcomes.slice(1)) {
      if (chips.length >= MAX_CALL_CHIPS) break;
      if (!o.out.ok) continue;
      const chip = CALL_CHIP[o.call.name]?.(o.call.args);
      if (chip && !chips.some((c) => c.id === chip.id)) chips.push(chip);
    }
  }

  const clean = sanitizeReply(body, safety, { phase });
  const reply: BrainReply = {
    reply: clean.text,
    chips,
    safety,
    intent,
    source: 'apple',
    ...extra,
  };
  const say = sayFor({ reply: clean.text }, phase);
  if (say !== undefined) reply.say = say;
  if (usedHealth) reply.usedHealth = true;

  return {
    reply,
    trace: {
      latencyMs,
      action,
      calls: outcomes.map((o) =>
        o.out.ok
          ? { name: o.call.name, ok: true }
          : {
              name: o.call.name,
              ok: false,
              fail: o.out.kind,
              ...(o.out.arg !== undefined ? { arg: o.out.arg } : {}),
            },
      ),
      replaced: clean.replaced && first?.out.ok !== false,
      hits: clean.hits,
      usedHealth,
      redFlag: false,
      route: 'model',
    },
    ...(first ? { call: { name: first.call.name, args: { ...first.call.args } } } : {}),
  };
}

/** The Apple brain for the router (register it in the native build only). */
export function appleBrain(bridge: GymBrainBridge, deps: AppleDeps = {}): AppleBrain {
  return {
    id: 'apple',
    async status() {
      const s: unknown = await bridge.availability();
      if (typeof s === 'object' && s !== null) {
        const o = s as { available?: unknown; reason?: unknown };
        if (o.available === true) return { available: true };
        if (o.available === false && isUnavailableReason(o.reason))
          return {
            available: false,
            reason: UNAVAILABLE_COPY[o.reason].status,
            reasonId: o.reason,
          };
      }
      // A junk answer is a failed check, not a reason: no reasonId, so the router shows a
      // one-off generic note and remembers nothing (a later real reason is still noted).
      return { available: false, reason: "Apple Intelligence isn't available" };
    },
    async ask(text, ctx) {
      return (await askApple(bridge, text, ctx, deps)).reply;
    },
  };
}
