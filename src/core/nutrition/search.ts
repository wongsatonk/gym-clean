/**
 * M7 food search (pure). Ranks my foods, my recipes, the Thai dish list and the USDA subset
 * against a typed query, in English or Thai.
 *
 * Order: my items (foods + recipes) first, then by match kind
 * (exact → prefix → a word starts with every token → every token is somewhere inside),
 * then Thai dishes before USDA rows, then shorter names, then name and id (stable).
 *
 * Build the index once per data change (`buildSearchIndex`); `searchFoods` is a linear scan
 * over pre-normalised names, fast enough for 50k rows per keystroke.
 */
import type { Food, FoodDbRow, Recipe } from '../types';

export type MatchKind = 'exact' | 'prefix' | 'word' | 'contains';

export type SearchSources = {
  myFoods?: readonly Food[];
  recipes?: readonly Recipe[];
  thaiDishes?: readonly Food[];
  usda?: readonly FoodDbRow[];
};

type HitInfo = {
  match: MatchKind;
  /** My own food or recipe. */
  mine: boolean;
  /** The Thai name matched better than the English one. */
  matchedTh: boolean;
};

export type SearchResult =
  | ({ kind: 'myFood'; food: Food } & HitInfo)
  | ({ kind: 'recipe'; recipe: Recipe } & HitInfo)
  | ({ kind: 'thai'; food: Food } & HitInfo)
  | ({ kind: 'usda'; row: FoodDbRow } & HitInfo);

type Item =
  | { kind: 'myFood'; food: Food }
  | { kind: 'recipe'; recipe: Recipe }
  | { kind: 'thai'; food: Food }
  | { kind: 'usda'; row: FoodDbRow };

type Entry = {
  item: Item;
  id: string;
  en: string;
  th: string;
  /** 0 = mine, 1 = Thai dish, 2 = USDA. */
  group: 0 | 1 | 2;
};

export type SearchIndex = { readonly entries: readonly Entry[] };

const MATCHES: readonly MatchKind[] = ['exact', 'prefix', 'word', 'contains'];

/**
 * Lowercase, NFC, Latin accents folded, everything that isn't a letter/number/mark becomes a
 * single space. Thai vowels and tone marks (combining marks) are kept.
 */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
}

export function buildSearchIndex(src: SearchSources): SearchIndex {
  const entries: Entry[] = [];
  const add = (
    item: Item,
    id: string,
    name: string,
    nameTh: string | undefined,
    group: Entry['group'],
  ): void => {
    entries.push({
      item,
      id,
      en: normalizeName(name),
      th: nameTh ? normalizeName(nameTh) : '',
      group,
    });
  };
  for (const food of src.myFoods ?? [])
    add({ kind: 'myFood', food }, food.id, food.name, food.nameTh, 0);
  for (const recipe of src.recipes ?? [])
    add({ kind: 'recipe', recipe }, recipe.id, recipe.name, recipe.nameTh, 0);
  for (const food of src.thaiDishes ?? [])
    add({ kind: 'thai', food }, food.id, food.name, food.nameTh, 1);
  for (const row of src.usda ?? []) add({ kind: 'usda', row }, row.id, row.name, undefined, 2);
  return { entries };
}

/** 0 exact, 1 prefix, 2 word, 3 contains, -1 no match. */
function tier(name: string, q: string, tokens: readonly string[]): number {
  if (name === '') return -1;
  // Fast reject: the first token must be somewhere in the name.
  const first = tokens[0] ?? '';
  if (!name.includes(first)) return -1;
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  let allWords = true;
  for (const t of tokens) {
    if (!name.includes(t)) return -1;
    if (allWords && !(name.startsWith(t) || name.includes(' ' + t))) allWords = false;
  }
  return allWords ? 2 : 3;
}

const LEN_CAP = 9999;

export function searchFoods(
  index: SearchIndex,
  query: string,
  opts: { limit?: number } = {},
): SearchResult[] {
  const limit = Math.max(0, opts.limit ?? 50);
  const q = normalizeName(query);
  if (q === '' || limit === 0) return [];
  const tokens = q.split(' ');

  const { entries } = index;
  const hitIdx: number[] = [];
  const hitKey: number[] = [];
  const hitTh: boolean[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i] as Entry;
    const tEn = tier(e.en, q, tokens);
    const tTh = e.th === '' ? -1 : tier(e.th, q, tokens);
    if (tEn < 0 && tTh < 0) continue;
    const useTh = tTh >= 0 && (tEn < 0 || tTh < tEn);
    const t = useTh ? tTh : tEn;
    const len = Math.min((useTh ? e.th : e.en).length, LEN_CAP);
    const mineRank = e.group === 0 ? 0 : 1;
    // (mine, match kind, group, length) packed into one sortable integer.
    hitKey.push(((mineRank * 4 + t) * 3 + e.group) * (LEN_CAP + 1) + len);
    hitIdx.push(i);
    hitTh.push(useTh);
  }

  // Only fully sort the hits that can make the cut: find the limit-th smallest packed key.
  let cutoff = Infinity;
  if (hitKey.length > limit) {
    const sorted = Float64Array.from(hitKey).sort();
    cutoff = sorted[limit - 1] ?? Infinity;
  }
  const keep: number[] = [];
  for (let h = 0; h < hitKey.length; h++) if ((hitKey[h] as number) <= cutoff) keep.push(h);

  const nameOf = (h: number): string => {
    const e = entries[hitIdx[h] as number] as Entry;
    return hitTh[h] ? e.th : e.en;
  };
  keep.sort((a, b) => {
    const d = (hitKey[a] as number) - (hitKey[b] as number);
    if (d !== 0) return d;
    const na = nameOf(a);
    const nb = nameOf(b);
    if (na !== nb) return na < nb ? -1 : 1;
    const ia = (entries[hitIdx[a] as number] as Entry).id;
    const ib = (entries[hitIdx[b] as number] as Entry).id;
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });

  return keep.slice(0, limit).map((h) => {
    const e = entries[hitIdx[h] as number] as Entry;
    const key = hitKey[h] as number;
    const t = Math.floor(key / (LEN_CAP + 1) / 3) % 4;
    const info: HitInfo = {
      match: MATCHES[t] as MatchKind,
      mine: e.group === 0,
      matchedTh: hitTh[h] as boolean,
    };
    return { ...e.item, ...info };
  });
}
