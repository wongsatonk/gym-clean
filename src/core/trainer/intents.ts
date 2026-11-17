/**
 * M10 phase A rule-based intent matcher (SPEC M10 "Coach chat", PROGRESS M10 task 10).
 *
 * Pure: text + context in, `{ intent, slots, safety }` out. No network, no DOM, no clock. All words
 * live in `phrases.json` (English + Thai, M10-q5). The matcher only names an intent; the coach turns it
 * into a Proposal through the same `propose*` functions the chips use, and nothing changes without a tap.
 *
 * Order of rules (first hit wins):
 *  1. red flag → `help`, no slots, `safety: 'redFlag'` (never a training proposal);
 *  2. deload, 3. swap;
 *  3b. M12 doToday: a "do" word right before one of the coach's plan day names ("do Push A
 *     today", "let's do pull a"), when no other day than today is named and it isn't a skip;
 *  3c. M12 1b shortOnTime: a short-on-time phrase, or a session length ("I have 30 min", "half
 *     an hour", 5–180 minutes) unless a food phrase matched; never with a discomfort word (those
 *     go on to rules 5 / 9);
 *  4. postpone (incl. "skip leg day" / "skip <plan day name>", and M12 "move Thursday to
 *     Friday": a move word with both a day and a target day);
 *  4b. missing kit (M10e): a named exercise with "has no" / "there's no" / "ไม่มีเครื่อง" (or a
 *     bare "no" when no stall/lighter/food phrase and no "no more" / "today" word matched), no
 *     discomfort → swap that exercise;
 *  5. an area word with a discomfort or "avoid" word → avoidArea;
 *  6. stall;
 *  M12: 6a. progress ("how am I doing"); 6b. focusBlock ("build my chest"); 6c. focusEdit (a
 *     days-a-week / weeks count on its own, "only 4 days a week", or a focusEdit phrase);
 *  7. lighter, 8. food;
 *  8a. M12 week ("how's my week");
 *  9. discomfort with no area → avoidArea without an area (the coach asks which area);
 * 10. anything else → help.
 * A swap with a weekday ("swap Thursday's flyes") is a focusEdit (a change to a focus block's
 * days; the coach falls back to the swap flow when no block is being proposed).
 *
 * Slots: `dayName` only for doToday (the plan day name as passed in `dayNames`; its `date` is
 * 'today' when a today word is there, as "today" or "today instead"), `area` only for avoidArea, `exerciseId` only for swap/stall/focusEdit, `group` only for
 * focusBlock, `weeks` / `daysPerWeek` only for focusBlock/focusEdit ("this month" = 4 weeks,
 * "N months" = 4N), `minutes` only for shortOnTime (the length as typed; absent when none was
 * given), `date` / `moveTo` / `scope` for any non-help intent. `date` is the day the request is about (e.g. the day to skip); `moveTo` is the
 * target day of a move ("to Friday", "Saturday instead"). Both are day words; the coach resolves them
 * against its own `today`.
 */
import phrasesJson from './phrases.json';
import exercisesJson from '../../data/exercises.json';
import type { BodyArea } from '../types';
import { SHORT_ON_TIME } from './timeRules';

export type Intent =
  | 'postpone'
  | 'avoidArea'
  | 'lighter'
  | 'deload'
  | 'swap'
  | 'stall'
  | 'food'
  | 'help'
  | 'week'
  | 'progress'
  | 'focusBlock'
  | 'focusEdit'
  | 'doToday'
  | 'shortOnTime';
export type DayWord = 'today' | 'tomorrow' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Safety = 'none' | 'discomfort' | 'redFlag';

export type IntentSlots = {
  area?: BodyArea;
  date?: DayWord;
  moveTo?: DayWord;
  exerciseId?: string;
  scope?: 'today' | 'plan';
  /** M12 focusBlock: the area to build. */
  group?: BodyArea;
  /** M12 focusBlock / focusEdit: block length. */
  weeks?: number;
  /** M12 focusBlock / focusEdit: training days a week. */
  daysPerWeek?: number;
  /** M12 doToday: the plan day to run today, as written in `MatchContext.dayNames`. */
  dayName?: string;
  /** M12 1b shortOnTime: the session length he typed, in minutes. */
  minutes?: number;
};

export type IntentMatch = { intent: Intent; slots: IntentSlots; safety: Safety };

export type MatchContext = {
  /** Exercises the user can name (id + display name). Defaults to `src/data/exercises.json`. */
  exercises?: readonly { id: string; name: string }[];
  /** Today's exercise ids: a generic word ("curls", "rows") prefers one of these. */
  todayExerciseIds?: readonly string[];
  /** The plan's day names ("Push A"): "skip <day name>" is a postpone, "do <day name>" doToday. */
  dayNames?: readonly string[];
};

type Span = { start: number; end: number };
type Matcher = (text: string) => Span[];

const THAI = /[฀-๿]/;

/** Lowercase, drop apostrophes, punctuation/hyphens → spaces, collapse whitespace. Keeps Thai. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’‘`´]/g, '')
    .replace(/[^a-z0-9฀-๿]+/g, ' ')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePhrase(raw: string): Matcher {
  const phrase = raw.endsWith('*') ? normalizeText(raw.slice(0, -1)) : normalizeText(raw);
  if (phrase === '') return () => [];
  if (THAI.test(phrase)) {
    return (text) => {
      const out: Span[] = [];
      let i = text.indexOf(phrase);
      while (i >= 0) {
        out.push({ start: i, end: i + phrase.length });
        i = text.indexOf(phrase, i + 1);
      }
      return out;
    };
  }
  const body = escapeRegex(phrase).replace(/ /g, '\\s+') + (raw.endsWith('*') ? '[a-z0-9]*' : 's?');
  const re = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'g');
  return (text) =>
    [...text.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

function compileList(list: readonly string[]): Matcher {
  const matchers = list.map(compilePhrase);
  return (text) => matchers.flatMap((m) => m(text));
}

function has(m: Matcher, text: string): boolean {
  return m(text).length > 0;
}

/** Longest-first, non-overlapping. */
function dedupe<T extends Span>(spans: T[]): T[] {
  const sorted = [...spans].sort(
    (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
  );
  const kept: T[] = [];
  for (const s of sorted) {
    if (kept.every((k) => s.end <= k.start || s.start >= k.end)) kept.push(s);
  }
  return kept.sort((a, b) => a.start - b.start);
}

// ---- compiled data ----

const P = phrasesJson;
const INTENTS = {
  deload: compileList(P.intents.deload),
  swap: compileList(P.intents.swap),
  postpone: compileList(P.intents.postpone),
  stall: compileList(P.intents.stall),
  lighter: compileList(P.intents.lighter),
  food: compileList(P.intents.food),
};
const M12 = {
  week: compileList(P.m12.week),
  progress: compileList(P.m12.progress),
  focusBlock: compileList(P.m12.focusBlock),
  focusEdit: compileList(P.m12.focusEdit),
  month: compileList(P.m12.month),
};
const DO_WORDS = compileList(P.m12.doToday.do);
const SWITCH_WORDS = compileList(P.m12.doToday.switchTo);
const PARTIAL_FOLLOWERS = P.m12.doToday.partialFollowers.map((w) => normalizeText(w));
const DO_FILLERS = P.m12.doToday.fillers.map((w) => normalizeText(w));
const MOVE_WORDS = compileList(P.m12.moveDay.move);
const NUMBER_WORDS: Record<string, number> = P.m12.numbers;
const NUM = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
const DAYS_COUNT = new RegExp(`(?<![a-z0-9])${NUM}\\s+(?:days?|times)(?![a-z0-9])`);
const WEEKS_COUNT = new RegExp(`(?<![a-z0-9])${NUM}\\s+weeks?(?![a-z0-9])`);
const MONTHS_COUNT = new RegExp(`(?<![a-z0-9])${NUM}\\s+months?(?![a-z0-9])`);
const SHORT = {
  phrases: compileList(P.shortOnTime.phrases),
  halfHour: compileList(P.shortOnTime.halfHour),
};
const SHORT_NUMBERS: Record<string, number> = { ...NUMBER_WORDS, ...P.shortOnTime.numbers };
/** Alternation of the words as typed (normalized), longest first; spaces match any whitespace. */
const wordsRe = (words: readonly string[]): string =>
  words
    .map((w) => normalizeText(w))
    .filter((w) => w !== '')
    .sort((a, b) => b.length - a.length)
    .map((w) => escapeRegex(w).replace(/ /g, '\\s+'))
    .join('|');
const MINUTES_COUNT = new RegExp(
  `(?<![a-z0-9])(\\d{1,3}|${wordsRe(Object.keys(SHORT_NUMBERS))})\\s*(?:${wordsRe(P.shortOnTime.minuteWords)})(?![a-z0-9])`,
);
const HOURS_COUNT = new RegExp(
  `(?<![a-z0-9])(\\d{1,2}|${wordsRe([...Object.keys(SHORT_NUMBERS), ...P.shortOnTime.hourArticles])})\\s*(?:${wordsRe(P.shortOnTime.hourWords)})(?![a-z0-9])`,
);
const HOUR_ARTICLES = new Set(P.shortOnTime.hourArticles.map((w) => normalizeText(w)));
const AVOID_ANYWHERE = compileList(P.avoidArea.anywhere);
const AVOID_BEFORE = P.avoidArea.before.map((w) => normalizeText(w));
const AREA_FILLERS = ['on my', 'on the', 'for my', 'my', 'the', 'on'];
const AREA_IGNORE = P.areaIgnore.phrases.map((p) => ({
  raw: normalizeText(p),
  m: compilePhrase(p),
}));
const AREAS = (Object.keys(P.areas) as BodyArea[]).map((area) => ({
  area,
  m: compileList(P.areas[area]),
}));
const DAYS = (Object.keys(P.days) as DayWord[]).map((day) => ({
  day,
  m: compileList(P.days[day]),
}));
const MOVE_BEFORE = P.moveTo.before.map((w) => normalizeText(w));
const MOVE_AFTER = P.moveTo.after.map((w) => normalizeText(w));
const DAY_FILLERS = ['next', 'this', 'on', 'the', 'วัน'];
const SKIP_WORDS = compileList(P.skipDay.skip);
const SKIP_FILLERS = P.skipDay.fillers.map((w) => normalizeText(w));
const SKIP_DAYS = P.skipDay.days.map((w) => normalizeText(w));
const SKIP_BARE = P.skipDay.bare.map((w) => normalizeText(w));
const SKIP_BARE_FOLLOWERS = compileList(P.skipDay.bareFollowers);
const MISSING_KIT = compileList(P.missingKit.phrases);
const MISSING_KIT_BARE = compileList(P.missingKit.bare);
const MISSING_KIT_BARE_NOT = compileList(P.missingKit.bareNot);
const SCOPE_PLAN = compileList(P.scope.plan);
const SCOPE_TODAY = compileList(P.scope.today);
const DISCOMFORT = compileList(P.safety.discomfort);
const RED_FLAG = compileList(P.safety.redFlag);
const COMBO_A = compileList(P.safety.redFlagCombos.a);
const COMBO_B = compileList(P.safety.redFlagCombos.b);
const STOPWORDS = new Set(P.exerciseStopwords.map((w) => normalizeText(w)));
const ALIASES = Object.entries(P.exerciseAliases)
  .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
  .flatMap(([id, list]) =>
    list.map((a) => ({
      id,
      m: compilePhrase(a),
      score: THAI.test(a) ? 1 : normalizeText(a).split(' ').length,
    })),
  );
const DEFAULT_EXERCISES = (exercisesJson as { id: string; name: string }[]).map(({ id, name }) => ({
  id,
  name,
}));

// ---- slot readers ----

function safetyOf(text: string): Safety {
  if (has(RED_FLAG, text) || (has(COMBO_A, text) && has(COMBO_B, text))) return 'redFlag';
  if (has(DISCOMFORT, text)) return 'discomfort';
  return 'none';
}

/** Ends with `word` as a whole word (English) or as a suffix (Thai). */
function endsWithWord(prefix: string, word: string): boolean {
  if (!prefix.endsWith(word)) return false;
  if (THAI.test(word)) return true;
  const before = prefix.charAt(prefix.length - word.length - 1);
  return before === '' || !/[a-z0-9]/.test(before);
}

function startsWithWord(rest: string, word: string): boolean {
  if (!rest.startsWith(word)) return false;
  if (THAI.test(word)) return true;
  const after = rest.charAt(word.length);
  return after === '' || !/[a-z0-9]/.test(after);
}

function stripFillers(prefix: string, fillers: readonly string[]): string {
  let p = prefix.trimEnd();
  for (let changed = true; changed;) {
    changed = false;
    for (const f of fillers) {
      if (endsWithWord(p, f)) {
        p = p.slice(0, p.length - f.length).trimEnd();
        changed = true;
      }
    }
  }
  return p;
}

function areaOf(text: string): { area: BodyArea; viaAvoidBefore: boolean } | undefined {
  let t = text;
  for (const ig of AREA_IGNORE) {
    for (const s of ig.m(t).reverse())
      t = t.slice(0, s.start) + ' '.repeat(s.end - s.start) + t.slice(s.end);
  }
  const hits = dedupe(AREAS.flatMap(({ area, m }) => m(t).map((s) => ({ ...s, area }))));
  const first = hits[0];
  if (!first) return undefined;
  const viaAvoidBefore = hits.some((h) => {
    const prefix = stripFillers(t.slice(0, h.start), AREA_FILLERS);
    return AVOID_BEFORE.some((w) => endsWithWord(prefix, w));
  });
  return { area: first.area, viaAvoidBefore };
}

function daysOf(text: string): { date?: DayWord; moveTo?: DayWord } {
  const hits = dedupe(DAYS.flatMap(({ day, m }) => m(text).map((s) => ({ ...s, day }))));
  const out: { date?: DayWord; moveTo?: DayWord } = {};
  for (const h of hits) {
    const prefix = stripFillers(text.slice(0, h.start), DAY_FILLERS);
    const rest = text.slice(h.end).trimStart();
    const isTarget =
      MOVE_BEFORE.some((w) => endsWithWord(prefix, w)) ||
      MOVE_AFTER.some((w) => startsWithWord(rest, w));
    if (isTarget) out.moveTo ??= h.day;
    else out.date ??= h.day;
  }
  return out;
}

function stripLeading(rest: string, fillers: readonly string[]): string {
  let r = rest.trimStart();
  for (let changed = true; changed;) {
    changed = false;
    for (const f of fillers) {
      if (startsWithWord(r, f)) {
        r = r.slice(f.length).trimStart();
        changed = true;
      }
    }
  }
  return r;
}

/** "skip leg day", "skip push", "skip <plan day name>": a skip word, then a training-day name. */
function skipsDay(text: string, ctx: MatchContext): boolean {
  const named = (ctx.dayNames ?? []).map(normalizeText).filter((n) => n !== '');
  const days = [...SKIP_DAYS, ...named].sort((a, b) => b.length - a.length);
  return SKIP_WORDS(text).some((s) => {
    const rest = stripLeading(text.slice(s.end), SKIP_FILLERS);
    if (days.some((d) => startsWithWord(rest, d))) return true;
    const bare = SKIP_BARE.find((d) => startsWithWord(rest, d));
    if (bare === undefined) return false;
    const after = rest.slice(bare.length).trimStart();
    if (after === '') return true;
    const span = [...SKIP_BARE_FOLLOWERS(after), ...DAYS.flatMap(({ m }) => m(after))];
    return span.some((x) => x.start === 0);
  });
}

/**
 * The leading word(s) shared by day names, as written in the first such name: "Push A", "Push B"
 * → "Push" (one entry per distinct prefix, never a whole name).
 */
function namePrefixes(names: readonly string[]): { raw: string; norm: string }[] {
  const out = new Map<string, string>();
  for (const name of names) {
    const words = name.trim().split(/\s+/);
    for (let k = 1; k < words.length; k++) {
      const raw = words.slice(0, k).join(' ');
      const norm = normalizeText(raw);
      if (norm !== '' && !out.has(norm)) out.set(norm, raw);
    }
  }
  return [...out].map(([norm, raw]) => ({ raw, norm }));
}

/**
 * M12: "do <plan day name>" → that name as passed in (longest name first). Checkpoint J: also
 * after a switch word ("swap to push"), and a bare first word of names ("push") when the text
 * ends there or a follower word comes next ("do push today", never "do push ups"); then the slot
 * is that word as written in the names ("Push"). `viaSwitch` marks a switch-word hit.
 */
function doDayOf(
  text: string,
  ctx: MatchContext,
): { name: string; viaSwitch: boolean } | undefined {
  const all = (ctx.dayNames ?? []).filter((n) => normalizeText(n) !== '');
  if (all.length === 0) return undefined;
  const names = all
    .map((raw) => ({ raw, norm: normalizeText(raw) }))
    .sort((a, b) => b.norm.length - a.norm.length);
  const fullNames = new Set(names.map((n) => n.norm));
  const prefixes = namePrefixes(all)
    .filter((p) => !fullNames.has(p.norm))
    .sort((a, b) => b.norm.length - a.norm.length);
  const find = (spans: Span[], viaSwitch: boolean) => {
    for (const s of spans) {
      const rest = stripLeading(text.slice(s.end), DO_FILLERS);
      const hit = names.find((n) => startsWithWord(rest, n.norm));
      if (hit) return { name: hit.raw, viaSwitch };
      const part = prefixes.find((p) => {
        if (!startsWithWord(rest, p.norm)) return false;
        const after = rest.slice(p.norm.length).trimStart();
        return after === '' || PARTIAL_FOLLOWERS.some((f) => startsWithWord(after, f));
      });
      if (part) return { name: part.raw, viaSwitch };
    }
    return undefined;
  };
  return find(SWITCH_WORDS(text), true) ?? find(DO_WORDS(text), false);
}

const numberOf = (w: string): number => NUMBER_WORDS[w] ?? Number(w);

/** M12: "4 days a week" / "3 times a week", "6 weeks", "this month" (= 4), "2 months" (= 8). */
function countsOf(text: string): { weeks?: number; daysPerWeek?: number } {
  const out: { weeks?: number; daysPerWeek?: number } = {};
  const d = DAYS_COUNT.exec(text);
  if (d?.[1]) out.daysPerWeek = numberOf(d[1]);
  const w = WEEKS_COUNT.exec(text);
  const mo = MONTHS_COUNT.exec(text);
  if (w?.[1]) out.weeks = numberOf(w[1]);
  else if (mo?.[1]) out.weeks = numberOf(mo[1]) * 4;
  else if (has(M12.month, text)) out.weeks = 4;
  return out;
}

/**
 * M12 1b: the session length in minutes: "30 min", "forty-five minutes", "half an hour" (30),
 * "an hour" (60). Lengths outside `SHORT_ON_TIME.typedMinutes` aren't session lengths.
 */
function minutesOf(text: string): number | undefined {
  const words = (w: string) => w.replace(/\s+/g, ' ');
  let n: number | undefined;
  const m = MINUTES_COUNT.exec(text);
  const h = HOURS_COUNT.exec(text);
  if (m?.[1]) n = SHORT_NUMBERS[words(m[1])] ?? Number(m[1]);
  else if (has(SHORT.halfHour, text)) n = 30;
  else if (h?.[1])
    n = (HOUR_ARTICLES.has(h[1]) ? 1 : (SHORT_NUMBERS[words(h[1])] ?? Number(h[1]))) * 60;
  const { min, max } = SHORT_ON_TIME.typedMinutes;
  return n !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function scopeOf(text: string): 'today' | 'plan' | undefined {
  if (has(SCOPE_PLAN, text)) return 'plan';
  if (has(SCOPE_TODAY, text)) return 'today';
  return undefined;
}

function singular(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

function nameTokens(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((w) => w !== '' && !STOPWORDS.has(w))
    .map(singular);
}

function exerciseOf(text: string, ctx: MatchContext): string | undefined {
  const catalog = ctx.exercises ?? DEFAULT_EXERCISES;
  const ids = new Set(catalog.map((e) => e.id));
  const today = new Set(ctx.todayExerciseIds ?? []);
  const words = new Set(text.split(' ').map(singular));
  const named = catalog.map((e) => ({ id: e.id, tokens: nameTokens(e.name) }));

  const candidates: { id: string; score: number }[] = [];
  for (const { id, tokens } of named) {
    if (tokens.length > 0 && tokens.every((t) => words.has(t)))
      candidates.push({ id, score: tokens.length });
  }
  for (const a of ALIASES) {
    if (ids.has(a.id) && has(a.m, text)) candidates.push({ id: a.id, score: a.score });
  }

  const pick = (list: string[]): string | undefined => {
    const unique = [...new Set(list)];
    if (unique.length === 1) return unique[0];
    const inToday = unique.filter((id) => today.has(id));
    return inToday.length === 1 ? inToday[0] : undefined;
  };

  const top = Math.max(0, ...candidates.map((c) => c.score));
  const best = pick(candidates.filter((c) => c.score === top).map((c) => c.id));
  if (best !== undefined && (today.size === 0 || today.has(best))) return best;

  // A generic word ("curls", "rows"): the exercise whose last name word was typed, preferring today's.
  const heads = named.filter(
    (n) => n.tokens.length > 0 && words.has(n.tokens[n.tokens.length - 1] ?? ''),
  );
  const todayHeads = [...new Set(heads.filter((n) => today.has(n.id)).map((n) => n.id))];
  if (todayHeads.length === 1) return todayHeads[0];
  if (best !== undefined) return best;
  return pick(heads.map((n) => n.id));
}

/**
 * "my gym has no …", "there's no …", or a bare "no" that isn't about progress, energy or food, nor
 * a wish about today / from now on ("no more squats", "no squats today": not a fact about the gym).
 */
function missingKit(text: string): boolean {
  if (has(MISSING_KIT, text)) return true;
  return (
    has(MISSING_KIT_BARE, text) &&
    !has(MISSING_KIT_BARE_NOT, text) &&
    !has(INTENTS.stall, text) &&
    !has(INTENTS.lighter, text) &&
    !has(INTENTS.food, text)
  );
}

// ---- main ----

export function matchIntent(text: string, ctx: MatchContext = {}): IntentMatch {
  const t = normalizeText(text);
  const safety = safetyOf(t);
  if (t === '' || safety === 'redFlag') return { intent: 'help', slots: {}, safety };

  const area = areaOf(t);
  const counts = countsOf(t);
  const { date, moveTo } = daysOf(t);
  const onlyToday = (date ?? 'today') === 'today' && (moveTo ?? 'today') === 'today';
  const doDay = onlyToday && !skipsDay(t, ctx) ? doDayOf(t, ctx) : undefined;
  const dayName = doDay?.name;
  const minutes = minutesOf(t);
  let intent: Intent;
  if (has(INTENTS.deload, t)) intent = 'deload';
  else if (doDay?.viaSwitch) intent = 'doToday';
  else if (has(INTENTS.swap, t)) intent = 'swap';
  else if (dayName !== undefined) intent = 'doToday';
  else if (
    safety === 'none' &&
    (has(SHORT.phrases, t) || (minutes !== undefined && !has(INTENTS.food, t)))
  )
    intent = 'shortOnTime';
  else if (
    has(INTENTS.postpone, t) ||
    skipsDay(t, ctx) ||
    (has(MOVE_WORDS, t) && date !== undefined && moveTo !== undefined)
  )
    intent = 'postpone';
  else if (safety === 'none' && missingKit(t) && exerciseOf(t, ctx) !== undefined) intent = 'swap';
  else if (area && (safety === 'discomfort' || area.viaAvoidBefore || has(AVOID_ANYWHERE, t)))
    intent = 'avoidArea';
  else if (has(INTENTS.stall, t)) intent = 'stall';
  else if (has(M12.progress, t)) intent = 'progress';
  else if (has(M12.focusBlock, t)) intent = 'focusBlock';
  else if (Object.keys(counts).length > 0 || has(M12.focusEdit, t)) intent = 'focusEdit';
  else if (has(INTENTS.lighter, t)) intent = 'lighter';
  else if (has(INTENTS.food, t)) intent = 'food';
  else if (has(M12.week, t)) intent = 'week';
  else if (safety === 'discomfort') intent = 'avoidArea';
  else return { intent: 'help', slots: {}, safety };

  if (intent === 'doToday') {
    const slots: IntentSlots = { dayName: dayName ?? '' };
    if (date ?? moveTo) slots.date = 'today';
    const scope = scopeOf(t);
    if (scope) slots.scope = scope;
    return { intent, slots, safety };
  }
  // "swap Thursday's flyes": a change to a focus block's weekday.
  const weekday = date !== undefined && date !== 'today' && date !== 'tomorrow';
  if (intent === 'swap' && weekday && moveTo === undefined) intent = 'focusEdit';

  const slots: IntentSlots = {};
  if (intent === 'avoidArea' && area) slots.area = area.area;
  if (intent === 'swap' || intent === 'stall' || intent === 'focusEdit') {
    const exerciseId = exerciseOf(t, ctx);
    if (exerciseId !== undefined) slots.exerciseId = exerciseId;
  }
  if (intent === 'focusBlock' && area) slots.group = area.area;
  if (intent === 'focusBlock' || intent === 'focusEdit') Object.assign(slots, counts);
  if (intent === 'shortOnTime' && minutes !== undefined) slots.minutes = minutes;
  if (date) slots.date = date;
  if (moveTo) slots.moveTo = moveTo;
  const scope = scopeOf(t);
  if (scope) slots.scope = scope;
  return { intent, slots, safety };
}
