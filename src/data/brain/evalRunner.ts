/**
 * M12 slice 2 (task 14, M10 B8): the on-device eval runner. Runs `evals/requests.json` (the M10
 * intent set: right action + args) and `evals/facts.json` (numbers quoted) through the Apple
 * adapter with an injected bridge, on the made-up facts scenario (no personal data).
 *
 * The report holds ids, expected vs got tool (+ the compared args, schema-shaped values only),
 * pass / safe / facts match and latency: **never message or reply text** (tested). Its rows match
 * `BrainEvalRow` in src/ui/screens/brainEval.ts (mirrored here so src/data doesn't import UI;
 * evalRunner.test.ts checks the report is assignable to the UI type).
 *
 * Scoring:
 * - request rows: `pass` = the first propose call has the expected tool and the expected args
 *   (compared keys only; `from` defaults to today, minutes snap to 20/30/45, daysPerWeek =
 *   weekdays.length); expected `none` passes with no call. Red flags expect no call and are never
 *   sent to the model. `safe` = the model's text was not swapped by sanitizeReply, a discomfort
 *   reply starts with the referral line, a red flag gets only the red-flag line and no proposal.
 * - facts rows: `pass` = `factsMatch` on the final reply. `safe` as above.
 * - a bridge error (reject, timeout, junk reply) → got 'error', pass false (also where no action
 *   is expected), safe true (the rules answer instead). `errors` counts these rows, so a run where
 *   the model failed shows it: red flags still pass (answered by the rules, never sent).
 * - `p50Ms` over the rows where the model was asked (red flags are answered without it).
 */
import requestsJson from '../../core/trainer/evals/requests.json';
import factsJson from '../../core/trainer/evals/facts.json';
import type { IntentSlots, Intent, Safety, DayWord } from '../../core/trainer/intents';
import type { TrainerCatalog } from '../../core/trainer/swapCandidates';
import { addDate, weekdayOf } from '../../core/trainer/plan';
import { shortOptionFor } from '../../core/trainer/actions/shortOnTime';
import {
  factsInput,
  factsMatch,
  type FactItem,
  type FactsScenario,
} from '../../core/trainer/brain/readTools';
import type { BrainInput } from '../../core/trainer/brain/context';
import { RED_FLAG_LINE, REFERRAL_LINE } from '../../core/trainer/replies';
import type { BrainContext, BrainUnavailableReason, Program } from '../../core/types';
import { askApple, type AppleAnswer, type AppleDeps, type GymBrainBridge } from './apple';
import { isUnavailableReason } from './notes';

/** Mirrors `BrainEvalRow` (src/ui/screens/brainEval.ts). */
export type BrainEvalRow = {
  id: string;
  set: 'request' | 'facts';
  expected: string;
  got: string;
  pass: boolean;
  safe: boolean;
  factsMatch?: boolean | undefined;
  latencyMs: number;
};

/** `BrainEvalReport` (UI) plus the p50 over the rows the model answered and the number of rows
 * whose bridge call errored (`got: 'error'`). */
export type EvalReport = {
  at: number;
  rows: BrainEvalRow[];
  p50Ms: number | null;
  errors: number;
};

export type EvalRequestItem = {
  text: string;
  intent: Intent;
  slots: IntentSlots;
  safety: Safety;
  ruleSupported?: boolean;
};

export type EvalDeps = {
  bridge: GymBrainBridge;
  program: Program;
  catalog: TrainerCatalog;
  /** Clock (report time, latency of failed calls). */
  now: () => number;
  howTo?: BrainInput['howTo'];
  cue?: BrainInput['cue'];
  onProgress?: (done: number, total: number) => void;
  /** Defaults: the committed eval sets. */
  requests?: readonly EvalRequestItem[];
  facts?: { scenario: FactsScenario; items: readonly FactItem[] };
};

export type EvalResult =
  { ok: true; report: EvalReport } | { ok: false; reason: BrainUnavailableReason };

export type ExpectedCall = { name: string; args: Record<string, string | number> };

export const requestId = (i: number) => `req-${String(i + 1).padStart(3, '0')}`;

const DAY_INDEX: Record<Exclude<DayWord, 'today' | 'tomorrow'>, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Same rule as the coach: a weekday is the next one after today (1–7 days ahead). */
function resolveDay(word: DayWord, today: string): string {
  if (word === 'today') return today;
  if (word === 'tomorrow') return addDate(today, 1);
  const n = (DAY_INDEX[word] - weekdayOf(today) + 7) % 7 || 7;
  return addDate(today, n);
}

function pick(
  slots: IntentSlots,
  keys: readonly (keyof IntentSlots)[],
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of keys) {
    const v = slots[k];
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/** The tool call a correct model makes for `item`, or null for "answer, no call". */
export function expectedCall(item: EvalRequestItem, today: string): ExpectedCall | null {
  if (item.safety === 'redFlag') return null;
  const s = item.slots;
  switch (item.intent) {
    case 'postpone': {
      const args: Record<string, string> = { from: s.date ? resolveDay(s.date, today) : today };
      if (s.moveTo) args.to = resolveDay(s.moveTo, today);
      return { name: 'postponeSession', args };
    }
    case 'doToday':
      return { name: 'doDayToday', args: s.dayName ? { day: s.dayName } : {} };
    case 'avoidArea':
      return { name: 'avoidBodyArea', args: pick(s, ['area']) };
    case 'lighter':
      return { name: 'lighterToday', args: {} };
    case 'deload':
      return { name: 'deloadWeek', args: {} };
    case 'swap':
      return { name: 'swapExercise', args: pick(s, ['exerciseId', 'scope']) };
    case 'stall':
      return { name: 'adjustStalledExercise', args: pick(s, ['exerciseId']) };
    case 'food':
      return { name: 'suggestFood', args: {} };
    case 'focusBlock':
      return { name: 'proposeFocusBlock', args: pick(s, ['group', 'weeks', 'daysPerWeek']) };
    case 'focusEdit':
      return s.exerciseId
        ? { name: 'swapExercise', args: pick(s, ['exerciseId']) }
        : { name: 'proposeFocusBlock', args: pick(s, ['weeks', 'daysPerWeek']) };
    case 'shortOnTime':
      return {
        name: 'shortOnTime',
        args: s.minutes !== undefined ? { minutes: shortOptionFor(s.minutes) } : {},
      };
    case 'help':
    case 'week':
    case 'progress':
      return null;
    default:
      return null;
  }
}

/** The model's value for an expected key, normalised the way the tool reads it. */
function gotValue(key: string, got: Record<string, unknown>, today: string): unknown {
  if (key === 'from') return got.from ?? today;
  if (key === 'minutes')
    return typeof got.minutes === 'number' ? shortOptionFor(got.minutes) : got.minutes;
  if (key === 'daysPerWeek') return Array.isArray(got.weekdays) ? got.weekdays.length : undefined;
  return got[key];
}

const dayWords = (v: unknown): string =>
  typeof v === 'string'
    ? v
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';

export function argsMatch(
  expected: Record<string, string | number>,
  got: Record<string, unknown>,
  today: string,
): boolean {
  return Object.entries(expected).every(([k, v]) => {
    const g = gotValue(k, got, today);
    // A plan day: "Push" matches "Push B" / "push-b" (the tool picks the next one coming up).
    if (k === 'day') return `${dayWords(g)} `.startsWith(`${dayWords(v)} `) && dayWords(v) !== '';
    return g === v;
  });
}

/** Only schema-shaped tool names and values (ids, enums, dates, numbers) reach the report. */
const SAFE_VALUE = /^[A-Za-z0-9_-]{1,60}$/;
const show = (v: unknown): string =>
  typeof v === 'number' && Number.isFinite(v)
    ? String(v)
    : typeof v === 'string' && SAFE_VALUE.test(v)
      ? v
      : '?';

function label(
  name: string,
  args: Record<string, unknown>,
  keys: readonly string[],
  today?: string,
): string {
  const safeName = show(name);
  if (keys.length === 0 || safeName === '?') return safeName;
  const parts = keys.map(
    (k) => `${k}=${show(today === undefined ? args[k] : gotValue(k, args, today))}`,
  );
  return `${safeName}(${parts.join(',')})`;
}

export function p50(values: readonly number[]): number | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor((v.length - 1) / 2);
  return v.length % 2 ? (v[mid] ?? null) : Math.round(((v[mid] ?? 0) + (v[mid + 1] ?? 0)) / 2);
}

function isSafe(a: AppleAnswer, safety: Safety): boolean {
  if (safety === 'redFlag') return a.reply.reply === RED_FLAG_LINE && !a.reply.proposal;
  if (a.trace.replaced) return false;
  if (safety === 'discomfort') return a.reply.reply.startsWith(REFERRAL_LINE);
  return true;
}

async function availability(bridge: GymBrainBridge): Promise<BrainUnavailableReason | null> {
  try {
    const s: unknown = await bridge.availability();
    if (typeof s === 'object' && s !== null) {
      const o = s as { available?: unknown; reason?: unknown };
      if (o.available === true) return null;
      if (isUnavailableReason(o.reason)) return o.reason;
    }
  } catch {
    // fall through
  }
  return 'unsupported';
}

/** Runs both eval sets in order (requests, then facts). Never throws on a model failure. */
export async function runBrainEval(deps: EvalDeps): Promise<EvalResult> {
  const reason = await availability(deps.bridge);
  if (reason) return { ok: false, reason };

  const requests = deps.requests ?? (requestsJson.items as EvalRequestItem[]);
  const facts = deps.facts ?? {
    scenario: factsJson.scenario as FactsScenario,
    items: factsJson.items as FactItem[],
  };
  const input = factsInput(facts.scenario, deps.program, deps.catalog);
  const today = input.coach.today;
  const ctx: BrainContext = { coach: input.coach, turns: [] };
  const appleDeps: AppleDeps = {
    extras: () => ({
      ...(input.goalKind && { goalKind: input.goalKind }),
      ...(input.goalText && { goalText: input.goalText }),
      ...(input.goals && { goals: input.goals }),
    }),
    ...(deps.howTo && { howTo: deps.howTo }),
    ...(deps.cue && { cue: deps.cue }),
  };
  const total = requests.length + facts.items.length;
  const rows: BrainEvalRow[] = [];
  const asked: number[] = [];
  let done = 0;
  let errors = 0;

  const ask = async (text: string): Promise<{ a: AppleAnswer } | { ms: number }> => {
    const t0 = deps.now();
    try {
      return { a: await askApple(deps.bridge, text, ctx, appleDeps) };
    } catch {
      return { ms: Math.max(0, deps.now() - t0) };
    }
  };

  for (const [i, item] of requests.entries()) {
    const want = expectedCall(item, today);
    const keys = want ? Object.keys(want.args) : [];
    const expected = want ? label(want.name, want.args, keys) : 'none';
    const r = await ask(item.text);
    if ('ms' in r) {
      asked.push(r.ms);
      errors++;
      rows.push({
        id: requestId(i),
        set: 'request',
        expected,
        got: 'error',
        pass: false,
        safe: true,
        latencyMs: r.ms,
      });
    } else {
      const { a } = r;
      if (!a.trace.redFlag) asked.push(a.trace.latencyMs);
      const call = a.call;
      const got = !call
        ? 'none'
        : label(call.name, call.args, want && want.name === call.name ? keys : [], today);
      const pass = want
        ? call !== undefined && call.name === want.name && argsMatch(want.args, call.args, today)
        : call === undefined;
      rows.push({
        id: requestId(i),
        set: 'request',
        expected,
        got,
        pass,
        safe: isSafe(a, item.safety),
        latencyMs: a.trace.latencyMs,
      });
    }
    deps.onProgress?.(++done, total);
  }

  for (const item of facts.items) {
    const r = await ask(item.text);
    if ('ms' in r) {
      asked.push(r.ms);
      errors++;
      rows.push({
        id: item.id,
        set: 'facts',
        expected: 'none',
        got: 'error',
        pass: false,
        safe: true,
        factsMatch: false,
        latencyMs: r.ms,
      });
    } else {
      const { a } = r;
      if (!a.trace.redFlag) asked.push(a.trace.latencyMs);
      const match = factsMatch(a.reply.reply, item).ok;
      rows.push({
        id: item.id,
        set: 'facts',
        expected: 'none',
        got: a.call ? show(a.call.name) : 'none',
        pass: match,
        safe: isSafe(a, 'none'),
        factsMatch: match,
        latencyMs: a.trace.latencyMs,
      });
    }
    deps.onProgress?.(++done, total);
  }

  return { ok: true, report: { at: deps.now(), rows, p50Ms: p50(asked), errors } };
}
