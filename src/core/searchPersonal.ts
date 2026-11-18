// M13c task 3b: search over your own data on this phone (SPEC M13c goal 3, his q2 "Everything"):
// past workouts, coach chat and logged meals. Pure: no DOM, no Dexie; the rows come in from
// src/data/searchSources.ts, which reads them on demand and stores nothing.
//
// A query may hold a date phrase ("yesterday", "monday", "12 nov", "last week", Thai day names):
// it is taken out first and filters by `date`, then the other words match through task 3's
// `search` (same normalizing, synonyms, Thai substring rule). Results are newest first per kind
// (the match tier only breaks ties within a day), capped per kind with a "more" flag.
//
// Next to a date, kind words are not search words: "yesterday workout", "today's workout",
// "what did I eat yesterday", "เมื่อวานกินอะไร" keep only that kind (KIND_WORDS), and fillers
// ("on", "what", "did", "อะไร") drop out. Without a date every word is a search word.
// Words that are often ordinary words are no dates on their own: bare "may" (only with a day or
// a year), "sun" / "sat" / "wed" (only after "last" or right before an explicit date), and bare
// Thai day names (they are also planets; จันทร์ is the moon): "วันจันทร์" or "จันทร์ที่แล้ว".
import { buildSearchIndex, normalizeSearchText, search, type SearchEntry } from './search';
import { addDate, localDate, weekdayOf } from './trainer/plan';
import type { ChatMessage, DateQuery, FoodEntry, SearchHit, SetLog } from './types';

// ---------- date phrases (data) ----------

export type DateWord =
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | { weekday: number; last?: true };

/**
 * Thai day names without "วัน". On their own they are no date (เสาร์, ศุกร์, อังคาร, พุธ,
 * พฤหัส are also planets, and พระจันทร์ is the moon), so a day needs "วัน" ("วันจันทร์");
 * "<name>ที่แล้ว" (last <name>) is clear without it. "อาทิตย์" also means week, so
 * "อาทิตย์ที่แล้ว" stays last week.
 */
const THAI_DAY_NAMES: readonly (readonly [string, number])[] = [
  ['อาทิตย์', 0],
  ['จันทร์', 1],
  ['อังคาร', 2],
  ['พุธ', 3],
  ['พฤหัสบดี', 4],
  ['พฤหัส', 4],
  ['ศุกร์', 5],
  ['เสาร์', 6],
];
const THAI_WEEKDAYS: readonly (readonly [string, number])[] = THAI_DAY_NAMES.map(
  ([w, n]) => [`วัน${w}`, n] as const,
);

/**
 * Short English day names that are also ordinary words ("sun dried", "sat on", "wed"): a date
 * only after "last" ("last sat") or right before an explicit date ("sat 14 nov").
 */
const CONTEXT_WEEKDAYS: Readonly<Record<string, number>> = { sun: 0, wed: 3, sat: 6 };

/**
 * Date words → what they mean. A weekday is the last one on or before today ("monday" on a
 * Monday is today); `last` means strictly before today. Weeks run Monday to Sunday. Bare
 * "อาทิตย์" is left out (it means both Sunday and week); "วันอาทิตย์" is Sunday.
 */
export const DATE_WORDS: Readonly<Record<string, DateWord>> = {
  today: 'today',
  yesterday: 'yesterday',
  'this week': 'thisWeek',
  'last week': 'lastWeek',
  'this month': 'thisMonth',
  'last month': 'lastMonth',
  sunday: { weekday: 0 },
  monday: { weekday: 1 },
  mon: { weekday: 1 },
  tuesday: { weekday: 2 },
  tues: { weekday: 2 },
  tue: { weekday: 2 },
  wednesday: { weekday: 3 },
  weds: { weekday: 3 },
  thursday: { weekday: 4 },
  thurs: { weekday: 4 },
  thur: { weekday: 4 },
  thu: { weekday: 4 },
  friday: { weekday: 5 },
  fri: { weekday: 5 },
  saturday: { weekday: 6 },
  วันนี้: 'today',
  เมื่อวานนี้: 'yesterday',
  เมื่อวาน: 'yesterday',
  สัปดาห์นี้: 'thisWeek',
  อาทิตย์นี้: 'thisWeek',
  สัปดาห์ที่แล้ว: 'lastWeek',
  สัปดาห์ก่อน: 'lastWeek',
  อาทิตย์ที่แล้ว: 'lastWeek',
  อาทิตย์ก่อน: 'lastWeek',
  เดือนนี้: 'thisMonth',
  เดือนที่แล้ว: 'lastMonth',
  เดือนก่อน: 'lastMonth',
  ...Object.fromEntries(THAI_WEEKDAYS.map(([w, n]) => [w, { weekday: n }])),
  ...Object.fromEntries(
    [...THAI_WEEKDAYS, ...THAI_DAY_NAMES.filter(([, n]) => n !== 0)].map(([w, n]) => [
      `${w}ที่แล้ว`,
      { weekday: n, last: true },
    ]),
  ),
};

/** Month words (English and Thai, full and short) → 1–12. */
export const MONTH_WORDS: Readonly<Record<string, number>> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  มกราคม: 1,
  'ม.ค.': 1,
  กุมภาพันธ์: 2,
  'ก.พ.': 2,
  มีนาคม: 3,
  'มี.ค.': 3,
  เมษายน: 4,
  'เม.ย.': 4,
  พฤษภาคม: 5,
  'พ.ค.': 5,
  มิถุนายน: 6,
  'มิ.ย.': 6,
  กรกฎาคม: 7,
  'ก.ค.': 7,
  สิงหาคม: 8,
  'ส.ค.': 8,
  กันยายน: 9,
  'ก.ย.': 9,
  ตุลาคม: 10,
  'ต.ค.': 10,
  พฤศจิกายน: 11,
  'พ.ย.': 11,
  ธันวาคม: 12,
  'ธ.ค.': 12,
};

/**
 * Month names that mean the whole month on their own (short ones like "dec" are too often a word
 * prefix, and "may" too often a verb: "may 12" / "may 2025" still work).
 */
const MONTH_ALONE: readonly string[] = Object.keys(MONTH_WORDS)
  .filter((w) => w.length >= 5 || w === 'june' || w === 'july')
  .filter((w) => !w.includes('.') && w !== 'sept');

/** Words left over next to a date phrase that aren't search words ("bench on monday"). */
const DATE_FILLERS: ReadonlySet<string> = new Set([
  'on',
  'in',
  'at',
  'from',
  'of',
  'during',
  'the',
  'for',
  'my',
  'what',
  'did',
  'do',
  'i',
  'me',
  'show',
  'and',
  '&',
]);

export type PersonalKind = 'workout' | 'meal' | 'chat';

/**
 * Kind words next to a date: not search words, they keep only their kind ("yesterday workout"
 * lists yesterday's workouts, not meals or chat). Without a date they are ordinary words.
 */
const KIND_WORDS: Readonly<Record<string, PersonalKind>> = {
  workout: 'workout',
  workouts: 'workout',
  session: 'workout',
  sessions: 'workout',
  train: 'workout',
  trained: 'workout',
  training: 'workout',
  lifted: 'workout',
  gym: 'workout',
  meal: 'meal',
  meals: 'meal',
  food: 'meal',
  foods: 'meal',
  eat: 'meal',
  ate: 'meal',
  eaten: 'meal',
  breakfast: 'meal',
  lunch: 'meal',
  dinner: 'meal',
  snack: 'meal',
  snacks: 'meal',
  chat: 'chat',
  chats: 'chat',
  coach: 'chat',
  message: 'chat',
  messages: 'chat',
  say: 'chat',
  said: 'chat',
  ask: 'chat',
  asked: 'chat',
};

/**
 * Thai has no spaces, so these come out of a Thai word by substring (next to a date only):
 * a kind word, or a filler (null). Food words like ข้าว are search words and stay.
 */
const THAI_STRIP: readonly (readonly [string, PersonalKind | null])[] = (
  [
    ['ออกกำลังกาย', 'workout'],
    ['เล่น', 'workout'],
    ['อาหาร', 'meal'],
    ['มื้อ', 'meal'],
    ['กิน', 'meal'],
    ['แชท', 'chat'],
    ['โค้ช', 'chat'],
    ['คุย', 'chat'],
    ['อะไร', null],
    ['บ้าง', null],
    ['ฉัน', null],
    ['ผม', null],
  ] as const
)
  .slice()
  .sort((a, b) => b[0].length - a[0].length);

const THAI = /[฀-๿]/;
const B0 = '(?<![\\p{L}\\p{M}\\p{N}])';
const B1 = '(?![\\p{L}\\p{M}\\p{N}])';
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const longestFirst = (words: readonly string[]): string[] =>
  [...words].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));

/** Alternation of `words`: Latin words need word boundaries, Thai ones (no spaces) don't. */
function wordsPattern(words: readonly string[]): string {
  const latin = longestFirst(words.filter((w) => !THAI.test(w))).map(esc);
  const thai = longestFirst(words.filter((w) => THAI.test(w))).map(esc);
  const parts: string[] = [];
  if (latin.length > 0) parts.push(`${B0}(?:${latin.join('|')})${B1}`);
  if (thai.length > 0) parts.push(`(?:${thai.join('|')})`);
  return `(?:${parts.join('|')})`;
}

const MONTHS = `(${longestFirst(Object.keys(MONTH_WORDS)).map(esc).join('|')})`;
const ORD = '(?:st|nd|rd|th)?';
const WEEKDAY_LATIN = [
  ...Object.keys(DATE_WORDS).filter((w) => !THAI.test(w) && typeof DATE_WORDS[w] === 'object'),
  ...Object.keys(CONTEXT_WEEKDAYS),
];

/** An English day (any form) or a Thai "วัน…" day → 0–6. */
function weekdayWord(w: string): number | undefined {
  const d = DATE_WORDS[w];
  return typeof d === 'object' ? d.weekday : CONTEXT_WEEKDAYS[w];
}

/** A day name just before an explicit date ("sat 14 nov", "Sat, 14 Nov", "วันเสาร์ที่ 14 พ.ย."). */
const LEADING_DAY = new RegExp(
  `(?:${B0}(?:${longestFirst(WEEKDAY_LATIN).map(esc).join('|')})|${longestFirst(
    THAI_WEEKDAYS.map(([w]) => w),
  )
    .map(esc)
    .join('|')})(?:,|\\s?ที่)?\\s?$`,
  'u',
);

// ---------- date arithmetic (local YYYY-MM-DD strings) ----------

const pad = (v: number, w = 2): string => String(v).padStart(w, '0');
const ymd = (y: number, m: number, d: number): string => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const ymdParts = (date: string): [number, number, number] =>
  date.split('-').map(Number) as [number, number, number];
const daysIn = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();
const one = (date: string): DateQuery => ({ from: date, to: date });

function monthRange(y: number, m: number): DateQuery {
  return { from: ymd(y, m, 1), to: ymd(y, m, daysIn(y, m)) };
}

/** 2-digit years are 20xx; Buddhist-era years (Thai, > 2400) become CE. */
function fullYear(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const y = Number(raw);
  if (raw.length === 2) return 2000 + y;
  return y > 2400 ? y - 543 : y;
}

/** One day; without a year, the last such date on or before today (29 Feb walks back to a leap year). */
function dayOf(year: number | undefined, m: number, d: number, today: string): DateQuery {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (year !== undefined) return d <= daysIn(year, m) ? one(ymd(year, m, d)) : null;
  const [ty] = ymdParts(today);
  let y = ymd(ty, m, d) > today ? ty - 1 : ty;
  for (let k = 0; k < 8; k++, y--) if (d <= daysIn(y, m)) return one(ymd(y, m, d));
  return null;
}

/** A whole month; without a year, the last one that has started. */
function monthOf(year: number | undefined, m: number, today: string): DateQuery {
  const [ty, tm] = ymdParts(today);
  return monthRange(year ?? (m > tm ? ty - 1 : ty), m);
}

function wordRange(w: DateWord, today: string): DateQuery {
  if (typeof w === 'object') {
    let back = (weekdayOf(today) - w.weekday + 7) % 7;
    if (w.last === true && back === 0) back = 7;
    return one(addDate(today, -back));
  }
  const monday = addDate(today, -((weekdayOf(today) + 6) % 7));
  const [ty, tm] = ymdParts(today);
  switch (w) {
    case 'today':
      return one(today);
    case 'yesterday':
      return one(addDate(today, -1));
    case 'thisWeek':
      return { from: monday, to: addDate(monday, 6) };
    case 'lastWeek':
      return { from: addDate(monday, -7), to: addDate(monday, -1) };
    case 'thisMonth':
      return monthRange(ty, tm);
    case 'lastMonth':
      return tm === 1 ? monthRange(ty - 1, 12) : monthRange(ty, tm - 1);
  }
}

type Matcher = {
  re: RegExp;
  read: (m: RegExpExecArray, today: string) => DateQuery;
  /** A day + month (or month + year) pattern: a day name just before it belongs to it. */
  explicit?: true;
};

const month = (word: string | undefined): number => MONTH_WORDS[word ?? ''] ?? 0;
const re = (s: string): RegExp => new RegExp(s, 'u');

/** Tried in order; the first pattern found decides (an impossible date means no date). */
const MATCHERS: readonly Matcher[] = [
  // 2025-11-12
  {
    re: re(`${B0}(\\d{4})-(\\d{1,2})-(\\d{1,2})${B1}`),
    read: (m, t) => dayOf(Number(m[1]), Number(m[2]), Number(m[3]), t),
    explicit: true,
  },
  // 12/11, 12/11/2025, 12/11/25: day first; month first only when day first can't be a date
  {
    re: re(`${B0}(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{4}|\\d{2}))?${B1}`),
    read: (m, t) => {
      const [a, b, y] = [Number(m[1]), Number(m[2]), fullYear(m[3])];
      return dayOf(y, b, a, t) ?? dayOf(y, a, b, t);
    },
    explicit: true,
  },
  // 12 nov, 12th november 2025, 12 พ.ย. 2568
  {
    re: re(`${B0}(\\d{1,2})${ORD}\\s?${MONTHS}(?:\\s(\\d{4}))?${B1}`),
    read: (m, t) => dayOf(fullYear(m[3]), month(m[2]), Number(m[1]), t),
    explicit: true,
  },
  // nov 12, november 12th, 2025
  {
    re: re(`${B0}${MONTHS}\\s(\\d{1,2})${ORD}(?:,?\\s(\\d{4}))?${B1}`),
    read: (m, t) => dayOf(fullYear(m[3]), month(m[1]), Number(m[2]), t),
    explicit: true,
  },
  // nov 2025
  {
    re: re(`${B0}${MONTHS}\\s(\\d{4})${B1}`),
    read: (m, t) => monthOf(fullYear(m[2]), month(m[1]), t),
    explicit: true,
  },
  // last monday
  {
    re: re(`${B0}last\\s(${WEEKDAY_LATIN.map(esc).join('|')})${B1}`),
    read: (m, t) => {
      const w = weekdayWord(m[1] ?? '');
      return w === undefined ? null : wordRange({ weekday: w, last: true }, t);
    },
  },
  // today, last week, monday, วันจันทร์ …
  {
    re: re(wordsPattern(Object.keys(DATE_WORDS))),
    read: (m, t) => {
      const w = DATE_WORDS[m[0]];
      return w === undefined ? null : wordRange(w, t);
    },
  },
  // november, พฤศจิกายน
  {
    re: re(wordsPattern(MONTH_ALONE)),
    read: (m, t) => monthOf(undefined, month(m[0]), t),
  },
];

export type DateSplit = {
  /** The date phrase's inclusive range, or null when the query has none (or an impossible one). */
  range: DateQuery;
  /**
   * The rest of the query, lowercased, single-spaced (next to a date: fillers like "on" and kind
   * words like "workout" dropped, and the date's possessive "'s").
   */
  words: string;
  /** Next to a date only: the kinds its kind words named (PERSONAL_KINDS order); absent = all. */
  kinds?: PersonalKind[];
};

/** The words left next to a date: fillers and kind words out (Thai ones by substring). */
function wordsNextToDate(rest: string): { words: string; kinds: PersonalKind[] } {
  const kinds = new Set<PersonalKind>();
  const out: string[] = [];
  for (const tok of rest.split(' ')) {
    const kind = KIND_WORDS[tok];
    if (kind !== undefined) kinds.add(kind);
    else if (tok === '' || DATE_FILLERS.has(tok)) continue;
    else if (!THAI.test(tok)) out.push(tok);
    else {
      let t = tok;
      for (const [w, k] of THAI_STRIP) {
        if (!t.includes(w)) continue;
        t = t.split(w).join(' ');
        if (k !== null) kinds.add(k);
      }
      out.push(...t.split(' ').filter((x) => x !== ''));
    }
  }
  return { words: out.join(' '), kinds: PERSONAL_KINDS.filter((k) => kinds.has(k)) };
}

/** Finds a date phrase in `query` (today = local YYYY-MM-DD) and splits it from the other words. */
export function splitDateQuery(query: string, today: string): DateSplit {
  const s = query.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
  for (const { re: pattern, read, explicit } of MATCHERS) {
    const m = pattern.exec(s);
    if (m === null) continue;
    const range = read(m, today);
    if (range === null) return { range: null, words: s };
    const before = s.slice(0, m.index);
    const lead = explicit === true ? LEADING_DAY.exec(before) : null;
    const after = s.slice(m.index + m[0].length).replace(/^['’]s(?![\p{L}\p{M}\p{N}])/u, '');
    const { words, kinds } = wordsNextToDate(
      `${lead === null ? before : before.slice(0, lead.index)} ${after}`,
    );
    return kinds.length > 0 ? { range, words, kinds } : { range, words };
  }
  return { range: null, words: s };
}

/**
 * The date range named in `query` ("today", "yesterday", "monday" (the last one), "last week",
 * "this month", "12 nov", "nov 12", "12/11", "2025-11-12", "november", Thai "วันจันทร์",
 * "เมื่อวาน", "12 พ.ย. 2568"…), or null.
 */
export function parseDateQuery(query: string, today: string): DateQuery {
  return splitDateQuery(query, today).range;
}

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const SHORT_MONTH = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "Tue 12 Nov"; with `today` in another year, "Tue 30 Dec 2025". */
export function searchDateLabel(date: string, today?: string): string {
  const [y, m, d] = ymdParts(date);
  const base = `${SHORT_DAY[weekdayOf(date)] ?? ''} ${d} ${SHORT_MONTH[m - 1] ?? ''}`;
  return today !== undefined && ymdParts(today)[0] !== y ? `${base} ${y}` : base;
}

// ---------- item builders ----------

/** The session fields search needs (src/data SessionRow fits). */
export type PersonalSession = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
};

/** The set fields search needs (any SetLog fits). */
export type PersonalSet = Pick<SetLog, 'sessionId' | 'exerciseId' | 'startedAt'>;

/** Names in first-seen order, without repeats (case/accent-insensitive). */
function uniqNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((n) => {
    const k = normalizeSearchText(n);
    if (k === '' || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** "A, B, C +2 more". */
function shortList(names: readonly string[], max = 3): string {
  const head = names.slice(0, max).join(', ');
  return names.length > max ? `${head} +${names.length - max} more` : head;
}

export type WorkoutItemCtx = {
  /** The plan day's name ("Push A"); undefined → "Workout". */
  dayName: (dayId: string) => string | undefined;
  exerciseName: (exerciseId: string) => string;
  /** Local YYYY-MM-DD; adds the year to dates from another year. */
  today?: string;
};

/**
 * One item per finished session that has sets, newest first: title "Push A · Tue 12 Nov",
 * subtitle the exercises, keywords the day name + exercise names, `id` = sessionId.
 */
export function workoutSearchItems(
  sessions: readonly PersonalSession[],
  sets: readonly PersonalSet[],
  ctx: WorkoutItemCtx,
): SearchEntry[] {
  const bySession = new Map<string, PersonalSet[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId) ?? [];
    list.push(s);
    bySession.set(s.sessionId, list);
  }
  return sessions
    .filter((s) => s.endedAt !== undefined && (bySession.get(s.sessionId)?.length ?? 0) > 0)
    .sort((a, b) => b.startedAt - a.startedAt || (a.sessionId < b.sessionId ? -1 : 1))
    .map((s) => {
      const date = localDate(s.startedAt);
      const day = ctx.dayName(s.dayId) ?? 'Workout';
      const names = uniqNames(
        [...(bySession.get(s.sessionId) ?? [])]
          .sort((a, b) => a.startedAt - b.startedAt)
          .map((x) => ctx.exerciseName(x.exerciseId)),
      );
      return {
        kind: 'workout',
        id: s.sessionId,
        title: `${day} · ${searchDateLabel(date, ctx.today)}`,
        subtitle: shortList(names),
        keywords: uniqNames([day, ...names]),
        date,
      };
    });
}

const CHAT_TITLE_MAX = 80;

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).trimEnd()}…`;
}

/**
 * One item per stored message with text, newest first: title the start of the message (≤ ~80
 * characters), subtitle "You · Tue 12 Nov" / "Coach · …", keyword the whole text, `id` = the
 * message id as a string (for `revealMessage`).
 */
export function chatSearchItems(
  messages: readonly ChatMessage[],
  ctx: { today?: string } = {},
): SearchEntry[] {
  return messages
    .filter((m): m is ChatMessage & { id: number } => m.id !== undefined && m.text.trim() !== '')
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    .map((m) => {
      const text = m.text.replace(/\s+/g, ' ').trim();
      const date = localDate(m.createdAt);
      return {
        kind: 'chat',
        id: String(m.id),
        title: cut(text, CHAT_TITLE_MAX),
        subtitle: `${m.role === 'user' ? 'You' : 'Coach'} · ${searchDateLabel(date, ctx.today)}`,
        keywords: [text],
        date,
      };
    });
}

export type MealItemCtx = {
  /** Extra names for an entry (its saved food's / recipe's name, Thai name). */
  foodNames?: (entry: FoodEntry) => readonly string[];
  today?: string;
};

/**
 * One item per day with logged food, newest first: title "Meals · Tue 12 Nov", subtitle the
 * foods, keywords every food name that day, `id` = the date.
 */
export function mealSearchItems(
  entries: readonly FoodEntry[],
  ctx: MealItemCtx = {},
): SearchEntry[] {
  const byDate = new Map<string, FoodEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, list]) => {
      const ordered = [...list].sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : 1));
      const labels = uniqNames(ordered.map((e) => e.label));
      return {
        kind: 'meal',
        id: date,
        title: `Meals · ${searchDateLabel(date, ctx.today)}`,
        subtitle: shortList(labels),
        keywords: uniqNames(ordered.flatMap((e) => [e.label, ...(ctx.foodNames?.(e) ?? [])])),
        date,
      };
    });
}

// ---------- ranking ----------

/** Section order (SPEC M13c goal 3: Exercises, Workouts, Meals, Coach, …). */
export const PERSONAL_KINDS: readonly PersonalKind[] = ['workout', 'meal', 'chat'];

export const PERSONAL_PER_KIND = 10;

export type PersonalSection = {
  kind: PersonalKind;
  /** This page, newest first. */
  hits: SearchHit[];
  /** All matches of this kind. */
  total: number;
  /** Where this page starts. */
  offset: number;
  /** More after this page ("Show more" asks with offset + hits.length). */
  more: boolean;
};

export type PersonalResults = {
  range: DateQuery;
  words: string;
  /** One per asked kind, always in PERSONAL_KINDS order (empty sections included). */
  sections: PersonalSection[];
};

export type RankPersonalOptions = {
  /** Local YYYY-MM-DD. */
  today: string;
  /** Page size per kind (default 10). */
  perKind?: number;
  /** Page start: one number for every kind, or per kind (missing = 0). */
  offset?: number | Partial<Record<PersonalKind, number>>;
  /** Only these kinds (default all three). */
  kinds?: readonly PersonalKind[];
};

/** Whether a query is worth a look at the phone's data (a date, or 2+ characters of words). */
export function personalQueryUsable(query: string, today: string): boolean {
  const { range, words } = splitDateQuery(query, today);
  return range !== null || [...normalizeSearchText(words)].length >= 2;
}

export function sectionOffset(offset: RankPersonalOptions['offset'], kind: PersonalKind): number {
  const n = typeof offset === 'number' ? offset : (offset?.[kind] ?? 0);
  return Math.max(0, Math.floor(n));
}

export function personalKinds(kinds: readonly PersonalKind[] | undefined): PersonalKind[] {
  return PERSONAL_KINDS.filter((k) => kinds === undefined || kinds.includes(k));
}

/**
 * Ranks workout / chat / meal items for `query`: a date phrase filters by `date`, kind words next
 * to it keep only those kinds' sections (the others come back empty), the other
 * words must match (task 3 rules), then newest first (match tier, then input order, within a
 * day). Blank, or one letter without a date, finds nothing.
 */
export function rankPersonal(
  items: readonly SearchEntry[],
  query: string,
  opts: RankPersonalOptions,
): PersonalResults {
  const { range, words, kinds: named } = splitDateQuery(query, opts.today);
  const perKind = Math.max(1, Math.floor(opts.perKind ?? PERSONAL_PER_KIND));
  const usable = range !== null || [...normalizeSearchText(words)].length >= 2;
  const wordless = normalizeSearchText(words) === '';
  const sections = personalKinds(opts.kinds).map((kind): PersonalSection => {
    const offset = sectionOffset(opts.offset, kind);
    if (!usable || (named !== undefined && !named.includes(kind)))
      return { kind, hits: [], total: 0, offset, more: false };
    const pool = items.filter(
      (it) =>
        it.kind === kind &&
        (range === null || (it.date !== undefined && it.date >= range.from && it.date <= range.to)),
    );
    const order = new Map(pool.map((it, i) => [it.id, i]));
    const hits: SearchHit[] = wordless
      ? pool.map((it) => {
          const hit: SearchHit & { otherKeywords?: string[] } = { ...it, score: 0 };
          delete hit.otherKeywords;
          return hit;
        })
      : search(buildSearchIndex(pool), words, { limit: pool.length });
    hits.sort(
      (a, b) =>
        (b.date ?? '').localeCompare(a.date ?? '') ||
        b.score - a.score ||
        (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
    return {
      kind,
      hits: hits.slice(offset, offset + perKind),
      total: hits.length,
      offset,
      more: hits.length > offset + perKind,
    };
  });
  return { range, words, sections };
}
