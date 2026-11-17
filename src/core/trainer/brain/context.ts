/**
 * M12 slice 2 / M10 phase B2: the compact context block a model brain reads (SPEC M12 "Brains").
 * Pure: `serializeContext(input, opts)` → `{ text, usedHealth }`.
 *
 * Holds: today's plan (exercise ids, sets x reps, weight), the next 7 days, active overrides, the
 * focus block, the go-easy list, week/month scores + streak (the rule answer's own text), today's
 * Fuel totals vs targets, the goal text + lift-goal progress, 4 weeks of top sets (warm-ups
 * excluded), and the last ≤ 8 chat turns. For Apple only, and only while
 * `appleCardReasons !== false` (M12-q1, read at runtime), the "Lighter today?" card's reasons as
 * number-free sentences; then `usedHealth` is true.
 *
 * Never: Health numbers, weekly load, cardio minutes, body fat / lean mass, measurements,
 * weigh-ins (weight and measurement goals are left out too), progress photos, check-in answers
 * (check-in turns dropped, "You rated …" sentences cut), notes, the dev log. Every value is
 * picked field by field, so anything else a caller passes along is ignored (tested). Earlier
 * turns marked `usedHealth` are dropped when reasons are off; when kept, every sentence with a
 * digit, a number word or a Health unit (bpm, HRV, %, …) is cut, so no Health number rides
 * along in chat history (tested).
 *
 * Budget: Apple's on-device model has 4,096 tokens per session for the instructions, all 15 tool
 * schemas, the context, the message, tool outputs and the reply (docs/ios-setup.md "Slice 2 API
 * notes"). At a conservative 3 characters per token (Apple: 3–4 for English), with ~600 tokens
 * kept for the reply, ~1,000 characters of instructions, ~4,900 of tool schemas (tools.contract.json,
 * compact), a 400-character message and two read-tool outputs (2 × 600), about 2,960 characters
 * are left: CONTEXT_BUDGET_CHARS = 2,900 (context.test.ts recomputes this from the real texts).
 * It was 3,200 until Checkpoint J (1.15.0) added the doDayToday tool and the partner voice.
 * Over budget, older top sets go first, then older turns, then a hard cut.
 */
import type { ChatMessage, Goal, GoalKind, ReadinessSignal, SetLog } from '../../types';
import { handle, type CoachContext } from '../coach';
import { addDate, effectiveDays, localDate, weekdayOf } from '../plan';
import { blockEnd } from '../focusBlock';
import { formatWeight } from '../../units';
import { goalProgress, goalProgressText } from '../../trainerKit/goals';

/** The token arithmetic behind CONTEXT_BUDGET_CHARS (checked in context.test.ts). */
export const BUDGET = {
  windowTokens: 4096,
  charsPerToken: 3,
  replyTokens: 350, // = GymBrainCore SystemBrainModel.maximumResponseTokens (600 before 1.15.0)
  /** The new user message (the app caps what it sends). */
  messageChars: 400,
  /** Read-tool outputs in one session: two results of ≤ 600 chars (readTools.ts). */
  toolOutputChars: 1200,
} as const;

export const CONTEXT_BUDGET_CHARS = 2900;

export const MAX_TURNS = 8;
/** One chat turn in the context is cut to this many characters. */
export const TURN_MAX_CHARS = 140;
const TOP_SET_DAYS = 28;
const MAX_TOP_PER_EXERCISE = 4;

export type BrainInput = {
  coach: CoachContext;
  /** The chat thread, oldest first; the last ≤ 8 are used. */
  turns: readonly ChatMessage[];
  /** Today's "Lighter today?" card, if it shows (the app's card fits this shape). */
  lighterCard?: LighterCard | null;
  /** The intake's goal kind and own words (settings 'intake'). */
  goalKind?: GoalKind;
  goalText?: string;
  /** Goals (Dexie `goals`); only lift goals reach the context. */
  goals?: readonly Goal[];
  /** For `exerciseInfo` (src/data `howToFor`, `cueFor`); readTools.ts. */
  howTo?: (exerciseId: string) => { lines: readonly string[]; focus?: string } | undefined;
  cue?: (exerciseId: string) => string | undefined;
};

/** The "Lighter today?" card as a brain may see it: signal ids and reason sentences only. */
export type LighterCard = { signals: readonly ReadinessSignal[]; reasons: readonly string[] };

export type ContextOpts = { brain: 'apple' | 'claude'; appleCardReasons?: boolean | undefined };

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const dayText = (date: string) =>
  `${SHORT_DAY[weekdayOf(date)] ?? ''} ${Number(date.slice(8, 10))}`;
const GOAL_KIND: Record<GoalKind, string> = {
  muscle: 'build muscle',
  fat: 'lose fat',
  strength: 'get stronger',
  general: 'general fitness',
};

/** Number-free versions of the M11 reasons (M12-q1: reason sentences, never numbers). */
const REASON: Record<ReadinessSignal, string> = {
  sleepShort: 'Sleep was shorter than usual.',
  hrvLow: 'Heart rate variability is lower than usual.',
  restingHrHigh: 'Resting heart rate is higher than usual.',
  hardOutsideWorkout: 'There was hard activity outside the gym in the last day.',
  whoopLow: 'The WHOOP score today is in its lowest band.',
  feltLow: 'You said your energy is low today.',
  sore: 'You said some areas are sore.',
};

/** "You rated energy 4, sleep 3, soreness 2." (the check-in recap line) and the like. */
const CHECK_IN_SENTENCE =
  /[^.!?]*\b(rated|rating)\b[^.!?]*\b(energy|sleep|soreness)\b[^.!?]*[.!?]?\s*/gi;

function reasonLines(card: LighterCard): string[] {
  const out: string[] = [];
  for (const s of card.signals) {
    if (s === 'sore') {
      const own = card.reasons.find((r) => /\bsore\.$/.test(r) && !/\d/.test(r));
      out.push(own ?? REASON.sore);
    } else out.push(REASON[s]);
  }
  return [...new Set(out)];
}

function weight(kg: number | undefined, ctx: CoachContext): string {
  return kg === undefined || kg <= 0 ? '' : ` @${formatWeight(kg, ctx.unit)}`;
}

const repsText = ([lo, hi]: readonly [number, number]) => (lo === hi ? `${lo}` : `${lo}-${hi}`);

function planLines(ctx: CoachContext): string[] {
  const days = effectiveDays(ctx.state, ctx.sessions, ctx.today, 8);
  const [today, ...next] = days;
  const lines: string[] = [];
  if (!today || today.rest || !today.day) lines.push("Today's plan: rest day.");
  else {
    const rows = today.day.exercises
      .map(
        (p) =>
          `${p.exerciseId} ${p.sets}x${repsText(p.targetReps)}${weight(p.weightKgToday ?? ctx.lastWeightKg[p.exerciseId] ?? p.startWeightKg, ctx)}`,
      )
      .join('; ');
    const tags = [today.done ? 'done' : '', today.adjusted ? `adjusted: ${today.adjusted}` : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`Today's plan: ${today.day.name}${tags ? ` (${tags})` : ''}: ${rows}.`);
  }
  if (ctx.phase === 'workout')
    lines.push(`Mid-workout. Sets logged for: ${ctx.logged.join(', ') || 'none yet'}.`);
  lines.push(
    `Next 7 days: ${next
      .map((e) => `${dayText(e.date)} ${e.rest || !e.day ? 'rest' : e.day.name}`)
      .join('; ')}.`,
  );
  return lines;
}

function stateLines(ctx: CoachContext): string[] {
  const lines: string[] = [];
  const changes = ctx.state.overrides
    .filter((o) => o.date >= ctx.today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((o) => {
      const what = o.rest
        ? 'rest'
        : (o.adjust?.kind ??
          (o.dayId
            ? (ctx.state.plan.days.find((d) => d.id === o.dayId)?.name ?? o.dayId)
            : 'changed'));
      return `${dayText(o.date)} ${what}`;
    });
  if (changes.length > 0) lines.push(`Changes: ${changes.join('; ')}.`);
  for (const b of ctx.state.blocks ?? []) {
    const end = blockEnd(b);
    if (end >= ctx.today)
      lines.push(`Focus block: ${b.group}, ${b.weeks} weeks from ${b.startDate} to ${end}.`);
  }
  const easy = ctx.state.easyOn ?? [];
  if (easy.length > 0) lines.push(`Go easy on: ${easy.join(', ')}.`);
  return lines;
}

/** The rule brain's own "How am I doing?" answer: week + month scores, streak, block. */
function scoreLine(ctx: CoachContext): string {
  return handle({ chip: 'progress' }, { ...ctx, phase: 'today' }).reply;
}

function fuelLine(ctx: CoachContext): string | null {
  const f = ctx.fuel;
  if (!ctx.m7Available || !f) return null;
  const k = Math.round(f.totals.kcal);
  const p = Math.round(f.totals.proteinG);
  if (!f.targets) return `Fuel today: ${k} kcal, ${p} g protein (no targets set).`;
  return `Fuel today: ${k} of ${Math.round(f.targets.kcal.value)} kcal, ${p} of ${Math.round(f.targets.proteinG.value)} g protein.`;
}

function finishedSets(ctx: CoachContext): SetLog[] {
  const done = new Set(ctx.sessions.filter((s) => s.endedAt !== undefined).map((s) => s.sessionId));
  return (ctx.sets ?? []).filter((s) => done.has(s.sessionId) && s.warmup !== true);
}

function goalLines(input: BrainInput): string[] {
  const lines: string[] = [];
  const own = input.goalText?.trim();
  const kind = input.goalKind ? GOAL_KIND[input.goalKind] : '';
  if (own || kind) lines.push(`Goal: ${[kind, own].filter(Boolean).join(': ')}.`);
  const ctx = input.coach;
  const lifts = (input.goals ?? []).filter((g) => g.target.kind === 'lift');
  if (lifts.length > 0) {
    const sets = finishedSets(ctx);
    lines.push(
      `Lift goals: ${lifts
        .map(
          (g) =>
            `${g.text} by ${g.due}: ${goalProgressText(goalProgress(g, sets, [], [], ctx.today))}`,
        )
        .join('; ')}`,
    );
  }
  return lines;
}

/** Per exercise, each session's top set (heaviest, then most reps), oldest first. */
function topSets(ctx: CoachContext): Map<string, string[]> {
  const from = addDate(ctx.today, -TOP_SET_DAYS);
  const sessions = new Map(
    ctx.sessions.filter((s) => s.endedAt !== undefined).map((s) => [s.sessionId, s] as const),
  );
  const best = new Map<string, { at: number; kg: number; reps: number }>();
  for (const set of finishedSets(ctx)) {
    const s = sessions.get(set.sessionId);
    if (!s) continue;
    const date = localDate(s.startedAt);
    if (date < from || date > ctx.today) continue;
    const key = `${set.exerciseId}|${set.sessionId}`;
    const kg = set.weightKg ?? 0;
    const cur = best.get(key);
    if (!cur || kg > cur.kg || (kg === cur.kg && set.reps > cur.reps))
      best.set(key, { at: s.startedAt, kg, reps: set.reps });
  }
  const out = new Map<string, { at: number; text: string }[]>();
  for (const [key, b] of best) {
    const id = key.slice(0, key.indexOf('|'));
    const d = localDate(b.at);
    const text = `${d.slice(5)} ${b.kg > 0 ? formatWeight(b.kg, ctx.unit) : 'BW'}x${b.reps}`;
    const list = out.get(id) ?? [];
    list.push({ at: b.at, text });
    out.set(id, list);
  }
  return new Map(
    [...out].map(([id, list]) => [id, list.sort((a, b) => a.at - b.at).map((x) => x.text)]),
  );
}

function topLine(tops: Map<string, string[]>, perExercise: number): string | null {
  if (perExercise <= 0 || tops.size === 0) return null;
  const parts = [...tops].map(([id, list]) => `${id} ${list.slice(-perExercise).join(', ')}`);
  return `Top sets (4 weeks, ${perExercise === 1 ? 'latest' : 'oldest first'}): ${parts.join('; ')}.`;
}

/** A digit, a number word or a Health unit: such a sentence in a usedHealth turn is cut. */
const NUMBER_SENTENCE =
  /\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|half|dozen|bpm|hrv|ms|percent)\b/i;

/** Keeps only the number-free sentences of a turn whose context had card reasons. */
function numberFree(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => !NUMBER_SENTENCE.test(s))
    .join(' ');
}

function turnLines(turns: readonly ChatMessage[], healthOk: boolean, n: number): string[] {
  const kept = turns.filter(
    (t) => t.card?.kind !== 'checkIn' && (healthOk || t.usedHealth !== true),
  );
  return kept.slice(-n).flatMap((t) => {
    const raw = t.usedHealth === true ? numberFree(t.text) : t.text;
    const text = raw.replace(CHECK_IN_SENTENCE, '').replace(/\s+/g, ' ').trim();
    if (text === '') return [];
    const cut = text.length > TURN_MAX_CHARS ? `${text.slice(0, TURN_MAX_CHARS - 1)}…` : text;
    return [`${t.role === 'user' ? 'User' : 'Coach'}: ${cut}`];
  });
}

export function serializeContext(
  input: BrainInput,
  opts: ContextOpts,
): { text: string; usedHealth: boolean } {
  const ctx = input.coach;
  const healthOk = opts.brain === 'apple' && opts.appleCardReasons !== false;
  const reasons = healthOk && input.lighterCard ? reasonLines(input.lighterCard) : [];
  const fixed = [
    `Today ${ctx.today} ${SHORT_DAY[weekdayOf(ctx.today)] ?? ''}. Weights in ${ctx.unit}.`,
    ...planLines(ctx),
    ...stateLines(ctx),
    scoreLine(ctx),
    fuelLine(ctx),
    ...goalLines(input),
    reasons.length > 0 ? `Lighter today? card: ${reasons.join(' ')}` : null,
  ].filter((l): l is string => l !== null && l !== '');
  const tops = topSets(ctx);

  const build = (perExercise: number, turns: number) => {
    const chat = turnLines(input.turns, healthOk, turns);
    return [
      ...fixed,
      topLine(tops, perExercise),
      ...(chat.length > 0 ? ['Chat so far:', ...chat] : []),
    ]
      .filter((l): l is string => l !== null)
      .join('\n');
  };

  const tries: [number, number][] = [];
  for (let k = MAX_TOP_PER_EXERCISE; k >= 2; k--) tries.push([k, MAX_TURNS]);
  for (let t = MAX_TURNS - 2; t >= 2; t -= 2) tries.push([2, t]);
  tries.push([1, 2], [1, 0], [0, 0]);
  let text = '';
  for (const [k, t] of tries) {
    text = build(k, t);
    if (text.length <= CONTEXT_BUDGET_CHARS) break;
  }
  if (text.length > CONTEXT_BUDGET_CHARS) {
    const cut = text.slice(0, CONTEXT_BUDGET_CHARS);
    text = cut.slice(0, Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('; '), 0)) || cut;
  }
  return { text, usedHealth: reasons.length > 0 && text.includes('Lighter today? card:') };
}
