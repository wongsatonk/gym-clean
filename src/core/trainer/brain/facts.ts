/**
 * Release 1.16.2 "Coach facts": questions about the user's own saved numbers are answered in code,
 * not by the on-device model's arithmetic. Pure.
 *
 * His 1.16.1 phone eval: facts 18 of 24, and all six misses were the model quoting wrong numbers
 * (weekNext, squatLast, rowTrend, pulldownBest, proteinLeft, rowCue) although the right ones were in
 * its context. So:
 * - `classifyFact(text, matchContext)` names the kind of question (phrase data in factPhrases.json,
 *   first matching kind wins) and the exercise(s) it names (intents.ts `exercisesNamed`, the same
 *   resolution the rules use) or the day (phrases.json `days`);
 * - `answerFact(query, input)` builds a short English answer, in the second person, from the same
 *   data the model sees (BrainInput: plan, sessions, sets, Fuel, goals, catalog, cues), with every
 *   number computed here.
 *
 * Unknown kind, or no data behind the answer → null, and the question goes to the model as before.
 * We return null rather than "No logged sets for X yet" on purpose: the facts route only speaks when
 * it can quote a saved number, and a wrongly resolved exercise (a generic word, a typo) must not get
 * a confident "nothing logged"; the model, which sees the whole context, gets those.
 * A name that fits several exercises ("row") answers each one with data, up to MAX_EXERCISES; more
 * than that → null. Never a guess between them.
 */
import type { Goal, SetLog } from '../../types';
import { formatWeight } from '../../units';
import { goalProgress, goalProgressText } from '../../trainerKit/goals';
import { monthScore, weekScore } from '../../progress/completion';
import { pctOf } from '../../progress/recap';
import { weeklyStreak } from '../../stats';
import { matchContext, resolveDay, type CoachContext } from '../coach';
import {
  exercisesNamed,
  normalizeText,
  phraseMatcher,
  type DayWord,
  type MatchContext,
} from '../intents';
import { addDate, baseDay, effectiveDays, localDate, upNext, weekdayOf } from '../plan';
import phrasesJson from '../phrases.json';
import factPhrases from './factPhrases.json';
import type { BrainInput } from './context';

export type FactKind =
  | 'cue'
  | 'muscles'
  | 'goalProgress'
  | 'goalTarget'
  | 'trend'
  | 'bestSet'
  | 'lastSet'
  | 'planned'
  | 'kcalLeft'
  | 'proteinLeft'
  | 'kcalTarget'
  | 'proteinTarget'
  | 'kcalEaten'
  | 'proteinEaten'
  | 'nextSession'
  | 'restDay'
  | 'streak'
  | 'month'
  | 'week'
  | 'dayPlan';

export type FactQuery = {
  kind: FactKind;
  /** The exercise(s) named, best first (empty when none). */
  exerciseIds: string[];
  /** The day named, if any (today, tomorrow, a weekday). */
  day?: DayWord;
  /** bestSet: this calendar month, all time, or (default) the last 4 weeks. */
  span?: 'month' | 'all' | 'recent';
};

/** Most exercises one answer covers when a name fits several ("is my row going up"). */
export const MAX_EXERCISES = 3;
/** "Lately" / trend span: the same 4 weeks of top sets the context shows. */
export const RECENT_DAYS = 28;

type Rule = {
  kind: FactKind;
  exercise: 'required' | 'none' | 'any';
  day: 'required' | 'any';
  all: ((t: string) => boolean)[];
  none: (t: string) => boolean;
};

const RULES: readonly Rule[] = factPhrases.kinds.map((k) => ({
  kind: k.kind as FactKind,
  exercise: k.exercise as Rule['exercise'],
  day: 'day' in k && k.day === 'required' ? 'required' : 'any',
  all: k.all.map((g) => phraseMatcher(g)),
  none: phraseMatcher('none' in k ? k.none : []),
}));
const STATEMENT = factPhrases.statementStarts.map((w) => normalizeText(w));
const BLOCK = phraseMatcher(factPhrases.block);
const ADVICE_STARTS = factPhrases.adviceStarts.map((w) => normalizeText(w));
const ADVICE = phraseMatcher(factPhrases.advice);
const OTHER_PEOPLE = phraseMatcher(factPhrases.otherPeople);
const THAI = /[฀-๿]/;
const AUXILIARIES = new Set(factPhrases.auxiliaries.map((w) => normalizeText(w)));
const NOT_SUBJECT = phraseMatcher(factPhrases.notSubjects);
/** The user as the subject: "did I", "have you", "is my", "has me". */
const SELF_SUBJECTS = new Set(['i', 'you', 'my', 'me']);

/**
 * Someone else's numbers: an auxiliary followed by a subject that isn't the user ("What did she
 * lift…", "how much has he eaten", "did Sam squat"). Things, days, numbers and exercise names
 * after it are not a person ("is Friday a rest day", "does the goblet squat work", "has bench").
 */
function otherSubject(t: string, ctx: MatchContext): boolean {
  const words = t.split(' ');
  return words.some((w, i) => {
    const next = words[i + 1];
    if (!AUXILIARIES.has(w) || next === undefined || SELF_SUBJECTS.has(next)) return false;
    if (/^\d/.test(next) || NOT_SUBJECT(next) || dayOf(next) !== undefined) return false;
    return exercisesNamed(next, ctx).length === 0;
  });
}
const WINDOW_MONTH = phraseMatcher(factPhrases.windows.month);
const WINDOW_ALL = phraseMatcher(factPhrases.windows.all);
const DAYS = (Object.keys(phrasesJson.days) as DayWord[]).map((day) => ({
  day,
  m: phraseMatcher(phrasesJson.days[day]),
}));

function startsWithWord(t: string, w: string): boolean {
  return t === w || t.startsWith(`${w} `);
}

function dayOf(text: string): DayWord | undefined {
  return DAYS.find((d) => d.m(text))?.day;
}

/** The kind of own-numbers question `text` is, or null (the model answers). */
export function classifyFact(text: string, ctx: MatchContext = {}): FactQuery | null {
  const t = normalizeText(text);
  if (t === '') return null;
  if (!text.includes('?') && STATEMENT.some((w) => startsWithWord(t, w))) return null;
  // Thai stays on the rules' thai path (route.ts decides it first); never classified here.
  if (THAI.test(t)) return null;
  // Advice / judgement ("Should I train hard today?") and someone else's numbers → the model.
  if (ADVICE_STARTS.some((w) => startsWithWord(t, w))) return null;
  if (BLOCK(t) || ADVICE(t) || OTHER_PEOPLE(t) || otherSubject(t, ctx)) return null;
  const ids = exercisesNamed(t, ctx);
  const day = dayOf(t);
  for (const r of RULES) {
    if (r.exercise === 'required' && ids.length === 0) continue;
    if (r.exercise === 'none' && ids.length > 0) continue;
    if (r.day === 'required' && day === undefined) continue;
    if (!r.all.every((m) => m(t)) || r.none(t)) continue;
    const q: FactQuery = { kind: r.kind, exerciseIds: ids };
    if (day !== undefined) q.day = day;
    if (r.kind === 'bestSet') q.span = WINDOW_MONTH(t) ? 'month' : WINDOW_ALL(t) ? 'all' : 'recent';
    return q;
  }
  return null;
}

// ---------- answers ----------

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const LONG_DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Fri 6 Nov". */
const shortDate = (d: string) =>
  `${SHORT_DAY[weekdayOf(d)] ?? ''} ${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1] ?? ''}`;
/** "Sunday 15 Nov". */
const longDate = (d: string) =>
  `${LONG_DAY[weekdayOf(d)] ?? ''} ${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1] ?? ''}`;
/** "31 Jan 2027". */
const fullDate = (d: string) =>
  `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1] ?? ''} ${d.slice(0, 4)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const repsText = ([lo, hi]: readonly [number, number]) => (lo === hi ? `${lo}` : `${lo}-${hi}`);
const round = (n: number) => Math.round(n);

function kgText(kg: number, ctx: CoachContext): string {
  return kg > 0 ? `${formatWeight(kg, ctx.unit)} ${ctx.unit}` : 'bodyweight';
}

const nameOf = (id: string, ctx: CoachContext) =>
  ctx.catalog.exercises.find((e) => e.id === id)?.name;

/** Today's planned day (with its plan word) for a day word: what Start would run that date. */
function dayLabel(date: string, ctx: CoachContext): string {
  if (date === ctx.today) return 'Today';
  if (date === addDate(ctx.today, 1)) return 'Tomorrow';
  return LONG_DAY[weekdayOf(date)] ?? date;
}

function hasPlan(ctx: CoachContext): boolean {
  return ctx.state.schedule.rotation.some((id) => ctx.state.plan.days.some((d) => d.id === id));
}

function days(ctx: CoachContext, n: number) {
  return effectiveDays(ctx.state, ctx.sessions, ctx.today, n);
}

function dayAt(ctx: CoachContext, word: DayWord) {
  const date = resolveDay(word, ctx.today);
  let n = 0;
  for (let d = ctx.today; d < date; d = addDate(d, 1)) n++;
  return days(ctx, n + 1)[n];
}

function nextSession(ctx: CoachContext): string | null {
  if (!hasPlan(ctx)) return null;
  const up = upNext(ctx.state, ctx.sessions, ctx.today);
  if (!up) return null;
  const name = baseDay(ctx.state, up.date, up.dayId)?.name ?? up.dayId;
  const when =
    up.date === ctx.today
      ? 'today'
      : up.date === addDate(ctx.today, 1)
        ? 'tomorrow'
        : `on ${longDate(up.date)}`;
  return `Your next workout is ${name}, ${when}.`;
}

function dayPlan(ctx: CoachContext, word: DayWord): string | null {
  if (!hasPlan(ctx)) return null;
  const e = dayAt(ctx, word);
  if (!e) return null;
  const label = dayLabel(e.date, ctx);
  if (e.rest) return `${label} is a rest day.`;
  if (!e.day) return null;
  const names = e.day.exercises.map((p) => nameOf(p.exerciseId, ctx) ?? p.exerciseId).join(', ');
  return `${label} is ${e.day.name}${e.done ? ' (done)' : ''}: ${names}.`;
}

function restDay(ctx: CoachContext, word: DayWord | undefined): string | null {
  if (!hasPlan(ctx)) return null;
  if (word !== undefined) {
    const e = dayAt(ctx, word);
    if (!e) return null;
    const label = dayLabel(e.date, ctx);
    if (e.rest) return `${label} is a rest day.`;
    return e.day ? `${label} is not a rest day: ${e.day.name}.` : null;
  }
  const rest = days(ctx, 7).filter((e) => e.rest);
  const [only, ...more] = rest;
  if (!only) return 'You have no rest day in the next 7 days.';
  if (more.length === 0) return `Your rest day this week is ${longDate(only.date)}.`;
  return `Your rest days this week: ${rest.map((e) => longDate(e.date)).join(', ')}.`;
}

function completion(ctx: CoachContext) {
  return {
    state: ctx.state,
    sessions: ctx.sessions,
    sets: ctx.sets ?? [],
    today: ctx.today,
    catalog: ctx.catalog,
  };
}

function week(ctx: CoachContext): string | null {
  if (!hasPlan(ctx)) return null;
  const w = weekScore(completion(ctx), ctx.today);
  const next = nextSession(ctx);
  const nextLine = next
    ? ` Next: ${next.replace(/^Your next workout is /, '').replace(', ', ' ')}`
    : '';
  if (w.sessionsPlanned === 0) return `You have no sessions planned this week.${nextLine}`;
  const pct = pctOf(w);
  const sets = pct === null ? '' : `, ${pct}% of planned sets so far`;
  return `This week you have done ${w.sessionsDone} of ${plural(w.sessionsPlanned, 'session')}${sets}.${nextLine}`;
}

function month(ctx: CoachContext): string | null {
  if (!hasPlan(ctx)) return null;
  const m = monthScore(completion(ctx), ctx.today.slice(0, 7));
  if (m.sessionsPlanned === 0) return 'You have no sessions planned this month.';
  const pct = pctOf(m);
  const sets = pct === null ? '' : `, ${pct}% of planned sets`;
  return `This month you have done ${m.sessionsDone} of ${plural(m.sessionsPlanned, 'session')}${sets}.`;
}

function noonOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12).getTime();
}

function streak(ctx: CoachContext): string | null {
  if (!ctx.sessions.some((s) => s.endedAt !== undefined)) return null;
  const n = weeklyStreak(ctx.sessions, noonOf(ctx.today));
  return n > 0
    ? `Your streak is ${plural(n, 'week')} in a row.`
    : 'You have no weekly streak running right now.';
}

// ---- history (finished sessions, warm-ups excluded; the same sets the context shows) ----

type Top = { date: string; at: number; kg: number; reps: number; sets: number };

/** Per session, the exercise's top set (heaviest, then most reps), oldest first, up to today. */
/** Only "body only" exercises have a real 0 kg; elsewhere 0 means the weight wasn't entered. */
function bodyweight(id: string, ctx: CoachContext): boolean {
  return ctx.catalog.exercises.find((e) => e.id === id)?.equipment === 'body only';
}

function topSets(ctx: CoachContext, id: string): Top[] {
  const bw = bodyweight(id, ctx);
  const sessions = new Map(
    ctx.sessions.filter((s) => s.endedAt !== undefined).map((s) => [s.sessionId, s] as const),
  );
  const by = new Map<string, Top>();
  for (const set of ctx.sets ?? []) {
    if (set.exerciseId !== id || set.warmup === true) continue;
    const s = sessions.get(set.sessionId);
    if (!s) continue;
    const date = localDate(s.startedAt);
    if (date > ctx.today) continue;
    const kg = set.weightKg ?? 0;
    // A 0 kg set on a weighted exercise: weight not entered, never "bodyweight".
    if (kg <= 0 && !bw) continue;
    const cur = by.get(set.sessionId);
    if (!cur) by.set(set.sessionId, { date, at: s.startedAt, kg, reps: set.reps, sets: 1 });
    else {
      cur.sets++;
      if (kg > cur.kg || (kg === cur.kg && set.reps > cur.reps)) {
        cur.kg = kg;
        cur.reps = set.reps;
      }
    }
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** Read out loud: "22.5 kg for 8 reps". */
const setText = (t: Pick<Top, 'kg' | 'reps'>, ctx: CoachContext) =>
  `${kgText(t.kg, ctx)} for ${plural(t.reps, 'rep')}`;

const better = (a: Top, b: Top) => a.kg > b.kg || (a.kg === b.kg && a.reps > b.reps);

/** The ids to answer for: in the plan first, then the most name words typed; ≤ MAX_EXERCISES. */
function narrow(ids: readonly string[], ctx: CoachContext, words: string): string[] {
  const known = ids.filter((id) => nameOf(id, ctx) !== undefined);
  const inPlan = new Set(ctx.state.plan.days.flatMap((d) => d.exercises.map((p) => p.exerciseId)));
  const planned = known.filter((id) => inPlan.has(id));
  const pool = planned.length > 0 ? planned : known;
  if (pool.length <= 1) return pool;
  const typed = new Set(words.split(' '));
  const score = (id: string) =>
    normalizeText(nameOf(id, ctx) ?? '')
      .split(' ')
      .filter((w) => typed.has(w) || typed.has(`${w}s`) || typed.has(w.replace(/s$/, ''))).length;
  const top = Math.max(...pool.map(score));
  return pool.filter((id) => score(id) === top);
}

function perExercise(
  q: FactQuery,
  ctx: CoachContext,
  words: string,
  one: (id: string, name: string) => string | null,
): string | null {
  const ids = narrow(q.exerciseIds, ctx, words);
  const lines = ids.map((id) => one(id, nameOf(id, ctx) ?? id)).filter((l): l is string => !!l);
  if (lines.length === 0 || lines.length > MAX_EXERCISES) return null;
  return lines.join(' ');
}

function lastSet(id: string, name: string, ctx: CoachContext): string | null {
  const last = topSets(ctx, id).at(-1);
  if (!last) return null;
  return `Last time (${shortDate(last.date)}) you did ${name} at ${setText(last, ctx)}, ${plural(last.sets, 'set')}.`;
}

function bestSet(
  id: string,
  name: string,
  ctx: CoachContext,
  span: FactQuery['span'],
): string | null {
  const from =
    span === 'month'
      ? `${ctx.today.slice(0, 7)}-01`
      : span === 'all'
        ? ''
        : addDate(ctx.today, -RECENT_DAYS);
  const tops = topSets(ctx, id).filter((t) => t.date >= from);
  let best: Top | undefined;
  // Ties: the latest.
  for (const t of tops) if (!best || !better(best, t)) best = t;
  if (!best) return null;
  const when = span === 'month' ? 'this month' : span === 'all' ? 'so far' : 'in the last 4 weeks';
  return `Your best ${name} set ${when} is ${setText(best, ctx)} (${shortDate(best.date)}).`;
}

function trend(id: string, name: string, ctx: CoachContext): string | null {
  const from = addDate(ctx.today, -RECENT_DAYS);
  const tops = topSets(ctx, id).filter((t) => t.date >= from);
  const first = tops[0];
  const last = tops.at(-1);
  if (!first || !last) return null;
  if (tops.length === 1)
    return `${name}: one session in the last 4 weeks, ${setText(last, ctx)} (${shortDate(last.date)}).`;
  if (better(last, first))
    return `${name} went up from ${setText(first, ctx)} to ${setText(last, ctx)} over the last 4 weeks.`;
  if (better(first, last))
    return `${name} went from ${setText(first, ctx)} to ${setText(last, ctx)} over the last 4 weeks.`;
  return `${name} held at ${setText(last, ctx)} over the last 4 weeks.`;
}

function planned(id: string, name: string, ctx: CoachContext): string | null {
  if (!hasPlan(ctx)) return null;
  const all = days(ctx, 8);
  const row = (e: (typeof all)[number]) =>
    e.rest || !e.day ? undefined : e.day.exercises.find((p) => p.exerciseId === id);
  const text = (p: NonNullable<ReturnType<typeof row>>) => {
    const kg = p.weightKgToday ?? ctx.lastWeightKg[id] ?? p.startWeightKg ?? 0;
    const at = kg > 0 ? ` at ${kgText(kg, ctx)}` : '';
    return `${plural(p.sets, 'set')} of ${repsText(p.targetReps)}${at}`;
  };
  const today = all[0];
  const now = today ? row(today) : undefined;
  if (now) return `Today: ${name}, ${text(now)}.`;
  for (const e of all.slice(1)) {
    const p = row(e);
    if (p) return `${name} isn't in today's plan. Next: ${shortDate(e.date)}, ${text(p)}.`;
  }
  return null;
}

// ---- Fuel ----

function fuel(kind: FactKind, ctx: CoachContext): string | null {
  const f = ctx.fuel;
  if (!ctx.m7Available || !f) return null;
  const protein = kind.startsWith('protein');
  const had = round(protein ? f.totals.proteinG : f.totals.kcal);
  const unit = protein ? 'g' : 'kcal';
  const what = protein ? ' protein' : '';
  const target = f.targets
    ? round(protein ? f.targets.proteinG.value : f.targets.kcal.value)
    : null;
  if (kind === 'kcalEaten' || kind === 'proteinEaten')
    return target === null
      ? `You have had ${had} ${unit}${what} today.`
      : `You have had ${had} ${unit}${what} today, of your ${target} ${unit} target.`;
  if (target === null) return null;
  if (kind === 'kcalTarget' || kind === 'proteinTarget')
    return `Your ${protein ? 'protein' : 'calorie'} target today is ${target} ${unit}. You have had ${had} ${unit} so far.`;
  const left = target - had;
  if (left <= 0)
    return `You have reached today’s ${target} ${unit}${what} target (${had} ${unit} so far).`;
  return protein
    ? `You still need ${left} g protein today (${had} of ${target} g).`
    : `You have ${left} kcal left today (${had} of ${target} kcal).`;
}

// ---- goals ----

function finishedSets(ctx: CoachContext): SetLog[] {
  const done = new Set(ctx.sessions.filter((s) => s.endedAt !== undefined).map((s) => s.sessionId));
  return (ctx.sets ?? []).filter((s) => done.has(s.sessionId) && s.warmup !== true);
}

function liftGoals(q: FactQuery, input: BrainInput): Goal[] {
  const lifts = (input.goals ?? []).filter((g) => g.target.kind === 'lift');
  if (q.exerciseIds.length === 0) return lifts;
  return lifts.filter((g) => g.target.ref !== undefined && q.exerciseIds.includes(g.target.ref));
}

function goalTargetText(g: Goal, ctx: CoachContext): string {
  const name = (g.target.ref && nameOf(g.target.ref, ctx)) ?? g.text;
  const reps = g.target.reps !== undefined ? ` for ${plural(g.target.reps, 'rep')}` : '';
  return `${name}, ${kgText(g.target.value, ctx)}${reps} by ${fullDate(g.due)}`;
}

function goals(q: FactQuery, input: BrainInput): string | null {
  const ctx = input.coach;
  const lifts = liftGoals(q, input).slice(0, MAX_EXERCISES);
  if (q.kind === 'goalProgress') {
    if (lifts.length === 0) return null;
    const sets = finishedSets(ctx);
    const lines = lifts.flatMap((g) => {
      const p = goalProgress(g, sets, [], [], ctx.today);
      // Nothing logged for it: no number to quote → null (the model answers).
      return p.status === 'noData' ? [] : [`${g.text}: ${goalProgressText(p)}`];
    });
    return lines.length > 0 ? lines.join(' ') : null;
  }
  if (lifts.length > 0)
    return `Your goal${lifts.length > 1 ? 's' : ''}: ${lifts.map((g) => goalTargetText(g, ctx)).join('; ')}.`;
  if (q.exerciseIds.length > 0) return null;
  const own = input.goalText?.trim();
  const KIND = {
    muscle: 'build muscle',
    fat: 'lose fat',
    strength: 'get stronger',
    general: 'general fitness',
  };
  const kind = input.goalKind ? KIND[input.goalKind] : '';
  const text = [kind, own].filter(Boolean).join(': ');
  if (text === '') return null;
  return `Your goal: ${text.replace(/[.!]$/, '')}.`;
}

// ---- exercise info ----

function muscles(id: string, name: string, ctx: CoachContext): string | null {
  const ex = ctx.catalog.exercises.find((e) => e.id === id);
  if (!ex || ex.primaryMuscles.length === 0) return null;
  const help =
    ex.secondaryMuscles.length > 0 ? `, with help from your ${joinAnd(ex.secondaryMuscles)}` : '';
  return `${name} works your ${joinAnd(ex.primaryMuscles)}${help}.`;
}

function joinAnd(list: readonly string[]): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1) ?? ''}`;
}

function cue(id: string, name: string, input: BrainInput): string | null {
  const own = input.cue?.(id)?.trim() || input.howTo?.(id)?.focus?.trim();
  if (!own) return null;
  return `${name}: ${/[.!?]$/.test(own) ? own : `${own}.`}`;
}

/**
 * The answer to `q` from the saved data in `input`, or null (no data, or too many exercises).
 * `words` is the normalized question (it breaks ties between exercises a generic name fits).
 */
export function answerFact(q: FactQuery, input: BrainInput, words = ''): string | null {
  const ctx = input.coach;
  switch (q.kind) {
    case 'nextSession':
      // Mid-workout "what's next?" asks for the next exercise; the model has the logged list.
      return ctx.phase === 'workout' ? null : nextSession(ctx);
    case 'dayPlan':
      return dayPlan(ctx, q.day ?? 'today');
    case 'restDay':
      return restDay(ctx, q.day);
    case 'week':
      return week(ctx);
    case 'month':
      return month(ctx);
    case 'streak':
      return streak(ctx);
    case 'lastSet':
      return perExercise(q, ctx, words, (id, n) => lastSet(id, n, ctx));
    case 'bestSet':
      return perExercise(q, ctx, words, (id, n) => bestSet(id, n, ctx, q.span));
    case 'trend':
      return perExercise(q, ctx, words, (id, n) => trend(id, n, ctx));
    case 'planned':
      return perExercise(q, ctx, words, (id, n) => planned(id, n, ctx));
    case 'muscles':
      return perExercise(q, ctx, words, (id, n) => muscles(id, n, ctx));
    case 'cue':
      return perExercise(q, ctx, words, (id, n) => cue(id, n, input));
    case 'goalProgress':
    case 'goalTarget':
      return goals(q, input);
    case 'kcalLeft':
    case 'proteinLeft':
    case 'kcalTarget':
    case 'proteinTarget':
    case 'kcalEaten':
    case 'proteinEaten':
      return fuel(q.kind, ctx);
  }
}

/** Classify + answer in one go (the coach's own match context); null → ask the model. */
export function factsAnswer(
  text: string,
  input: BrainInput,
  ctx?: MatchContext,
): { kind: FactKind; text: string } | null {
  const c = input.coach;
  const q = classifyFact(text, ctx ?? matchContext(c));
  if (!q) return null;
  const answer = answerFact(q, input, normalizeText(text));
  return answer === null ? null : { kind: q.kind, text: answer };
}
