// M13c search over bundled items (SPEC M13c goal 3): exercises, Settings sections, Why? cards,
// and (task 3b) workouts, chat and meals. Pure: no DOM, no Dexie. The index takes any
// `SearchItem`, so every kind ranks by the same rules:
//   exact title > title prefix > title word > keyword > other keyword,
// then exercises you've done first, then title. Matching is case- and accent-insensitive on
// token prefixes; Thai (no spaces) also matches inside a longer Thai run. Synonyms ("abs",
// "six pack", "quads") and body words in English and Thai (bodyAreas.json `words`, the same
// table as `areaForWord`) widen a query to muscle names.
import bodyAreasJson from '../data/bodyAreas.json';
import { equipmentGroupLabel, type LibraryDay } from './library';
import type { BodyArea, Exercise, LearnCard, SearchHit, SearchItem } from './types';

/**
 * A search item plus optional weaker keywords (ranked below `keywords`), e.g. an exercise's
 * helper muscles or the words of a Why? card. Any plain `SearchItem` is a valid entry.
 */
export type SearchEntry = SearchItem & { otherKeywords?: string[] };

/** Score per match tier (higher first). */
export const SEARCH_SCORE = {
  exactTitle: 100,
  titlePrefix: 80,
  titleWord: 60,
  keyword: 40,
  otherKeyword: 20,
} as const;

/**
 * Words people type → the words the catalog uses (normalized, lowercase). A key here wins over
 * the body-area words (so "quads" means quadriceps, not every leg muscle). Prefixes need no
 * entry ("quad" already starts "quadriceps"); "lats" has one so it never widens to "lateral".
 */
export const SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  abs: ['abdominals'],
  'six pack': ['abdominals'],
  sixpack: ['abdominals'],
  core: ['abdominals', 'core'],
  quads: ['quadriceps'],
  quadricep: ['quadriceps'],
  lats: ['lats'],
  latissimus: ['lats'],
  traps: ['traps'],
  trapezius: ['traps'],
  glutes: ['glutes', 'glute'],
  butt: ['glutes', 'glute'],
  hams: ['hamstrings'],
  pec: ['chest'],
  pecs: ['chest'],
  delt: ['shoulders'],
  delts: ['shoulders'],
  machines: ['machine'],
  dumbbells: ['dumbbell'],
  db: ['dumbbell'],
  barbells: ['barbell'],
  cables: ['cable'],
  bodyweight: ['body only'],
  'body weight': ['body only'],
  'no equipment': ['body only'],
};

type AreasData = {
  areas: Record<BodyArea, { label: string; muscles: string[] }>;
  words: Record<string, BodyArea>;
};
const AREAS = bodyAreasJson as AreasData;

const THAI = /[฀-๿]/;

/** Lowercase, Latin accents off, apostrophes dropped, other punctuation → one space. */
export function normalizeSearchText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();
}

type Field = { norm: string; tokens: string[] };
type Indexed = {
  item: SearchEntry;
  title: Field;
  strong: Field[];
  other: Field[];
};

/** A prepared, read-only index. Build it once per item set; `search` it per keystroke. */
export type SearchIndex = { readonly entries: readonly Indexed[] };

function field(s: string): Field {
  const norm = normalizeSearchText(s);
  return { norm, tokens: norm === '' ? [] : norm.split(' ') };
}

export function buildSearchIndex(items: readonly SearchEntry[]): SearchIndex {
  return {
    entries: items.map((item) => ({
      item,
      title: field(item.title),
      strong: item.keywords.map(field).filter((f) => f.norm !== ''),
      other: (item.otherKeywords ?? []).map(field).filter((f) => f.norm !== ''),
    })),
  };
}

/** `alt` starts at a word boundary of the field (token-prefix, multi-word alts allowed). */
function atWord(f: Field, alt: string): boolean {
  if (f.norm.startsWith(alt) || f.norm.includes(` ${alt}`)) return true;
  // Thai has no spaces: a Thai word may sit inside a longer run.
  return alt.length >= 2 && THAI.test(alt) && f.norm.includes(alt);
}

/** A one-letter word inside a longer query must be a whole word ("push a" ≠ "Attachment"). */
function tokenIn(f: Field, alt: string): boolean {
  return alt.length === 1 ? f.tokens.includes(alt) : atWord(f, alt);
}

/** The literal text plus synonym / body-area widenings. */
function expand(text: string): string[] {
  if (Object.hasOwn(SEARCH_SYNONYMS, text)) return [text, ...(SEARCH_SYNONYMS[text] ?? [])];
  if (Object.hasOwn(AREAS.words, text)) {
    const area = AREAS.words[text] as BodyArea;
    const a = AREAS.areas[area];
    return [text, ...a.muscles, normalizeSearchText(a.label)];
  }
  return [text];
}

const TIER_SCORE = [
  0,
  SEARCH_SCORE.exactTitle,
  SEARCH_SCORE.titlePrefix,
  SEARCH_SCORE.titleWord,
  SEARCH_SCORE.keyword,
  SEARCH_SCORE.otherKeyword,
] as const;
const NONE = 6;

function phraseTier(e: Indexed, alts: readonly string[]): number {
  let best = NONE;
  for (const alt of alts) {
    if (e.title.norm === alt) return 1;
    if (e.title.norm.startsWith(alt)) best = Math.min(best, 2);
    else if (atWord(e.title, alt)) best = Math.min(best, 3);
    else if (e.strong.some((f) => atWord(f, alt))) best = Math.min(best, 4);
    else if (e.other.some((f) => atWord(f, alt))) best = Math.min(best, 5);
  }
  return best;
}

/** Every query word must match somewhere; the weakest field used sets the tier. */
function tokenTier(e: Indexed, tokenAlts: readonly (readonly string[])[]): number {
  let worst = 0;
  for (const alts of tokenAlts) {
    let best = NONE;
    for (const alt of alts) {
      if (tokenIn(e.title, alt)) best = Math.min(best, 3);
      else if (e.strong.some((f) => tokenIn(f, alt))) best = Math.min(best, 4);
      else if (e.other.some((f) => tokenIn(f, alt))) best = Math.min(best, 5);
    }
    if (best === NONE) return NONE;
    worst = Math.max(worst, best);
  }
  return worst;
}

export type SearchOptions = {
  /** Most hits returned (default 50). */
  limit?: number;
  /** Exercise ids with logged sets: first among equal matches. */
  doneIds?: ReadonlySet<string>;
};

/**
 * Ranked hits for a typed query. Blank → []. One character → only titles starting with it.
 * Ties: done exercises first, then title, kind and id (fully deterministic).
 */
export function search(index: SearchIndex, query: string, opts: SearchOptions = {}): SearchHit[] {
  const q = normalizeSearchText(query);
  if (q === '') return [];
  const oneLetter = [...q].length === 1;
  const tokens = q.split(' ');
  const phraseAlts = oneLetter
    ? [q]
    : [...new Set([...expand(q), ...(tokens.length > 1 ? [tokens.join('')] : [])])];
  const tokenAlts = tokens.length > 1 ? tokens.map(expand) : null;

  const scored: { e: Indexed; tier: number }[] = [];
  for (const e of index.entries) {
    let tier: number;
    if (oneLetter) tier = e.title.norm.startsWith(q) ? (e.title.norm === q ? 1 : 2) : NONE;
    else {
      tier = phraseTier(e, phraseAlts);
      if (tokenAlts !== null && tier > 3) tier = Math.min(tier, tokenTier(e, tokenAlts));
    }
    if (tier < NONE) scored.push({ e, tier });
  }

  const done = opts.doneIds;
  const isDone = (e: Indexed): number =>
    done !== undefined && e.item.kind === 'exercise' && done.has(e.item.id) ? 1 : 0;
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      isDone(b.e) - isDone(a.e) ||
      cmp(a.e.title.norm, b.e.title.norm) ||
      cmp(a.e.item.kind, b.e.item.kind) ||
      cmp(a.e.item.id, b.e.item.id),
  );
  return scored.slice(0, opts.limit ?? 50).map(({ e, tier }) => {
    const hit: SearchHit & { otherKeywords?: string[] } = {
      ...e.item,
      score: TIER_SCORE[tier] ?? 0,
    };
    delete hit.otherKeywords;
    return hit;
  });
}

// ---------- item builders ----------

export type ExerciseSearchCtx = {
  /** The effective plan's days (names become keywords: "Push A"). */
  planDays: readonly LibraryDay[];
  areaOf: (muscle: string) => BodyArea | undefined;
  /** "Core" for 'core' (`bodyAreaLabel`). */
  areaLabel: (area: BodyArea) => string;
  muscleLabel: (muscle: string) => string;
};

/** Keeps the first spelling of each normalized word, skipping any already in `seen`. */
function uniq(words: readonly string[], seen: Set<string>): string[] {
  const out: string[] = [];
  for (const w of words) {
    const n = normalizeSearchText(w);
    if (n === '' || seen.has(n)) continue;
    seen.add(n);
    out.push(w);
  }
  return out;
}

/**
 * One item per exercise. Keywords: main muscles, their body areas, the equipment (Library label
 * and the catalog word) and the plan days that have it. Other keywords: helper muscles and
 * their areas (so "abs" ranks abdominals-primary work above lifts that only use the abs).
 */
export function exerciseSearchItems(
  catalog: readonly Exercise[],
  ctx: ExerciseSearchCtx,
): SearchEntry[] {
  const daysOf = new Map<string, string[]>();
  for (const d of ctx.planDays) {
    for (const row of d.exercises) {
      const list = daysOf.get(row.exerciseId) ?? [];
      if (!list.includes(d.name)) list.push(d.name);
      daysOf.set(row.exerciseId, list);
    }
  }
  const areas = (muscles: readonly string[]): string[] =>
    muscles.flatMap((m) => {
      const a = ctx.areaOf(m);
      return a === undefined ? [] : [ctx.areaLabel(a)];
    });
  return catalog.map((e) => {
    const equipLabel = equipmentGroupLabel(e.equipment);
    const seen = new Set<string>();
    const keywords = uniq(
      [
        ...e.primaryMuscles,
        ...areas(e.primaryMuscles),
        equipLabel,
        ...(e.equipment !== null ? [e.equipment] : []),
        ...(daysOf.get(e.id) ?? []),
      ],
      seen,
    );
    const otherKeywords = uniq([...e.secondaryMuscles, ...areas(e.secondaryMuscles)], seen);
    const main = e.primaryMuscles[0];
    return {
      kind: 'exercise',
      id: e.id,
      title: e.name,
      subtitle: main !== undefined ? `${ctx.muscleLabel(main)} · ${equipLabel}` : equipLabel,
      keywords,
      ...(otherKeywords.length > 0 ? { otherKeywords } : {}),
    };
  });
}

/** One item per Why? card: found by its title, and (weaker) by any word of 3+ letters in it. */
export function learnSearchItems(
  cards: readonly Pick<LearnCard, 'id' | 'title' | 'body' | 'why'>[],
): SearchEntry[] {
  return cards.map((c) => {
    const words = normalizeSearchText(`${c.body} ${c.why ?? ''}`)
      .split(' ')
      .filter((w) => [...w].length >= 3);
    return {
      kind: 'learn',
      id: c.id,
      title: c.title,
      keywords: [],
      otherKeywords: [...new Set(words)],
    };
  });
}

/** The "Search foods for '…'" row (opens the Fuel log with the text); null when blank. */
export function foodSearchHit(query: string): SearchHit | null {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q === '') return null;
  return { kind: 'food', id: 'food', title: `Search foods for '${q}'`, keywords: [q], score: 0 };
}
