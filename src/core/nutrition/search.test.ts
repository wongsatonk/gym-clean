import { describe, expect, it } from 'vitest';
import type { Food, FoodDbRow, Recipe } from '../types';
import { buildSearchIndex, normalizeName, searchFoods, type SearchResult } from './search';

// Made-up fixture rows: names only matter here, the numbers are placeholders.
const row = (id: string, name: string): FoodDbRow => ({
  id: `usda:${id}`,
  name,
  ds: 'sr',
  kcal: 100,
  proteinG: 10,
});
const food = (id: string, name: string, extra: Partial<Food> = {}): Food => ({
  id,
  name,
  source: 'custom',
  basis: { per100g: true },
  kcal: 100,
  proteinG: 10,
  ...extra,
});
const recipe = (id: string, name: string, nameTh?: string): Recipe => ({
  id,
  name,
  ...(nameTh ? { nameTh } : {}),
  ingredients: [],
  servings: 2,
  updatedAt: 0,
});

const usda: FoodDbRow[] = [
  row('1', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'),
  row('2', 'Rice, white, long-grain, cooked'),
  row('3', 'Egg, whole, cooked, fried'),
  row('4', 'Egg'),
  row('5', 'Eggplant, raw'),
  row('6', 'Fried rice'),
  row('7', 'Beef and egg noodles'),
];
const thai: Food[] = [
  food('thai:pad-kra-pao', 'Pad kra pao with rice + fried egg', {
    nameTh: 'ผัดกะเพราข้าวไข่ดาว',
    source: 'thai-estimate',
  }),
  food('thai:khao-pad', 'Khao pad (fried rice)', { nameTh: 'ข้าวผัด', source: 'thai-estimate' }),
  food('thai:khao-man-gai', 'Khao man gai', { nameTh: 'ข้าวมันไก่', source: 'thai-estimate' }),
];
const myFoods: Food[] = [food('my:eggs', 'Eggs from the market (boiled)')];
const recipes: Recipe[] = [recipe('r:kaprao', 'Home kra pao chicken', 'กะเพราไก่')];

const index = buildSearchIndex({ usda, thaiDishes: thai, myFoods, recipes });
const ids = (rs: SearchResult[]): string[] =>
  rs.map((r) => (r.kind === 'recipe' ? r.recipe.id : r.kind === 'usda' ? r.row.id : r.food.id));

describe('normalizeName', () => {
  it('lowercases, folds Latin accents and turns punctuation into single spaces', () => {
    expect(normalizeName('  Crème  Brûlée, (frozen)! ')).toBe('creme brulee frozen');
  });
  it('keeps Thai letters, vowels and tone marks', () => {
    expect(normalizeName('ผัดกะเพรา ไข่ดาว')).toBe('ผัดกะเพรา ไข่ดาว');
  });
});

describe('searchFoods', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchFoods(index, '')).toEqual([]);
    expect(searchFoods(index, '   ,  ')).toEqual([]);
  });

  it('puts my foods and recipes first, then exact, prefix, word and contains matches', () => {
    const rs = searchFoods(index, 'egg');
    expect(ids(rs)).toEqual([
      'my:eggs', // mine beats every database match
      'usda:4', // exact
      'usda:5', // prefix, shorter name first
      'usda:3', // prefix, longer
      'thai:pad-kra-pao', // a word starts with "egg"
      'usda:7', // a word starts with "egg"
    ]);
    expect(rs.map((r) => r.match)).toEqual(['prefix', 'exact', 'prefix', 'prefix', 'word', 'word']);
    expect(rs[0]?.mine).toBe(true);
    expect(rs[1]?.mine).toBe(false);
  });

  it('ranks Thai dishes ahead of USDA rows on the same match kind', () => {
    const rs = searchFoods(index, 'fried rice');
    // The USDA "Fried rice" is exact; both Thai dishes are word matches (shorter name first).
    expect(ids(rs)).toEqual(['usda:6', 'thai:khao-pad', 'thai:pad-kra-pao']);
    expect(rs.map((r) => r.match)).toEqual(['exact', 'word', 'word']);
  });

  it('needs every token, in any order', () => {
    expect(ids(searchFoods(index, 'cooked rice'))).toEqual(['usda:2']);
    expect(ids(searchFoods(index, 'rice cooked'))).toEqual(['usda:2']);
    expect(searchFoods(index, 'rice salmon')).toEqual([]);
  });

  it('matches inside words (contains) last', () => {
    const rs = searchFoods(index, 'plant');
    expect(ids(rs)).toEqual(['usda:5']);
    expect(rs[0]?.match).toBe('contains');
  });

  it('is case and accent insensitive', () => {
    expect(ids(searchFoods(index, 'EGGPLANT'))).toEqual(['usda:5']);
    expect(ids(searchFoods(index, 'Khâo man'))).toEqual(['thai:khao-man-gai']);
  });

  it('finds Thai names, including text inside a longer Thai word', () => {
    expect(ids(searchFoods(index, 'ข้าวผัด'))).toEqual(['thai:khao-pad']);
    // Thai is written without spaces, so "กะเพรา" sits inside both names.
    const rs = searchFoods(index, 'กะเพรา');
    expect(ids(rs)).toEqual(['r:kaprao', 'thai:pad-kra-pao']);
    expect(rs[0]?.kind).toBe('recipe');
    // "ข้าว" (rice) starts two Thai names (shorter first) and sits inside a third.
    expect(ids(searchFoods(index, 'ข้าว'))).toEqual([
      'thai:khao-pad',
      'thai:khao-man-gai',
      'thai:pad-kra-pao',
    ]);
  });

  it('reports which name matched for Thai-only hits', () => {
    const [hit] = searchFoods(index, 'ข้าวมันไก่');
    expect(hit).toMatchObject({ kind: 'thai', match: 'exact', matchedTh: true });
    const [en] = searchFoods(index, 'khao man gai');
    expect(en).toMatchObject({ match: 'exact', matchedTh: false });
  });

  it('caps results with the limit', () => {
    expect(searchFoods(index, 'e', { limit: 2 })).toHaveLength(2);
  });

  it('is deterministic for equal names (falls back to id order)', () => {
    const twin = buildSearchIndex({ usda: [row('9', 'Tofu'), row('8', 'Tofu')] });
    expect(ids(searchFoods(twin, 'tofu'))).toEqual(['usda:8', 'usda:9']);
  });

  it('searches 50k made-up rows in under 50 ms', () => {
    const words = ['chicken', 'rice', 'pork', 'egg', 'noodle', 'tofu', 'beef', 'basil', 'fish'];
    const big: FoodDbRow[] = [];
    for (let i = 0; i < 50_000; i++) {
      const a = words[i % words.length] ?? '';
      const b = words[(i * 7) % words.length] ?? '';
      big.push(row(String(i), `${a}, ${b}, item ${i}, cooked`));
    }
    const bigIndex = buildSearchIndex({ usda: big, thaiDishes: thai, myFoods, recipes });
    searchFoods(bigIndex, 'warm up'); // JIT warm-up
    for (const q of ['e', 'chicken', 'rice egg', 'ข้าว', 'item 4999']) {
      const t0 = performance.now();
      const rs = searchFoods(bigIndex, q);
      const ms = performance.now() - t0;
      expect(ms, `query "${q}" took ${ms.toFixed(1)} ms`).toBeLessThan(50);
      expect(rs.length).toBeGreaterThan(0);
    }
  });
});
