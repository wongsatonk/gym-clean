import { describe, expect, it, vi } from 'vitest';
import { FOOD_DB_URL, createFoodDbLoader } from './foodDb';

// Made-up rows in the shape scripts/build-foods.mjs writes.
const payload = {
  format: 'gym-clean-usda-foods',
  version: 1,
  count: 2,
  foods: [
    { id: 'usda:1', name: 'Made-up grain, cooked', ds: 'sr', kcal: 120, proteinG: 3.1, carbsG: 25 },
    {
      id: 'usda:2',
      name: 'Made-up fish, raw',
      ds: 'foundation',
      kcal: 90,
      proteinG: 19.5,
      fatG: 1.2,
      portions: [{ label: '1 fillet', g: 150 }],
    },
  ],
};

const okFetch = () =>
  vi.fn<(url: string) => Promise<Response>>(
    async () => new Response(JSON.stringify(payload), { status: 200 }),
  );

describe('FOOD_DB_URL', () => {
  it('is the hashed usda-foods asset URL (the PWA precache glob matches this name)', () => {
    expect(FOOD_DB_URL).toMatch(/usda-foods.*\.json/);
  });
});

describe('createFoodDbLoader', () => {
  it('does nothing until the first load (not at startup)', () => {
    const fetch = okFetch();
    const db = createFoodDbLoader({ url: '/x.json', fetch });
    expect(db.state()).toBe('idle');
    expect(db.rows()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fetches the asset once and caches the rows in memory', async () => {
    const fetch = okFetch();
    const db = createFoodDbLoader({ url: '/x.json', fetch });
    const [a, b] = await Promise.all([db.load(), db.load()]);
    const c = await db.load();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('/x.json');
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(a.map((r) => r.id)).toEqual(['usda:1', 'usda:2']);
    expect(db.state()).toBe('ready');
    expect(db.rows()).toBe(a);
  });

  it('shows an error state when offline before the first load, then retries on the next load', async () => {
    const fetch = vi
      .fn<(url: string) => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    const db = createFoodDbLoader({ url: '/x.json', fetch });
    await expect(db.load()).rejects.toThrow(/offline|connection/i);
    expect(db.state()).toBe('error');
    expect(db.rows()).toBeNull();
    const rows = await db.load();
    expect(rows).toHaveLength(2);
    expect(db.state()).toBe('ready');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('treats an HTTP error or a wrong file as an error', async () => {
    const http = createFoodDbLoader({
      url: '/x.json',
      fetch: async () => new Response('nope', { status: 404 }),
    });
    await expect(http.load()).rejects.toThrow();
    expect(http.state()).toBe('error');

    const wrong = createFoodDbLoader({
      url: '/x.json',
      fetch: async () => new Response(JSON.stringify({ format: 'other', foods: [] })),
    });
    await expect(wrong.load()).rejects.toThrow(/format/i);
    expect(wrong.state()).toBe('error');
  });

  it('reports the state change to a listener', async () => {
    const seen: string[] = [];
    const db = createFoodDbLoader({ url: '/x.json', fetch: okFetch() });
    db.onChange((s) => seen.push(s));
    await db.load();
    expect(seen).toEqual(['loading', 'ready']);
  });
});
