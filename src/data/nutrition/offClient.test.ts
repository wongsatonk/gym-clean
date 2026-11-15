import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GymDb } from '../db';
import { OFF_TIMEOUT_MS, lookupBarcode, offProductUrl } from './offClient';
import { foodByBarcode, saveFood, setBarcodeLookup } from './store';

const CODE = '4006381333931';
// A made-up Open Food Facts response.
const found = {
  code: CODE,
  status: 1,
  product: {
    product_name: 'Made-up oat drink',
    nutriments: {
      'energy-kcal_100g': 46,
      proteins_100g: 1.1,
      carbohydrates_100g: 6.6,
      fat_100g: 1.5,
    },
  },
};

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
const respond = (body: unknown, status = 200) =>
  vi.fn<FetchFn>(async () => new Response(JSON.stringify(body), { status }));

let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`off-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('offProductUrl', () => {
  it('holds only the barcode: no query string, no other data', () => {
    expect(offProductUrl(CODE)).toBe(`https://world.openfoodfacts.org/api/v2/product/${CODE}.json`);
  });
});

describe('lookupBarcode', () => {
  it('never calls the network while the setting is off (the default)', async () => {
    const fetch = respond(found);
    expect(await lookupBarcode(db, CODE, { fetch })).toEqual({ status: 'off' });
    await setBarcodeLookup(db, true);
    await setBarcodeLookup(db, false);
    expect(await lookupBarcode(db, CODE, { fetch })).toEqual({ status: 'off' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a bad checksum without any call', async () => {
    await setBarcodeLookup(db, true);
    const fetch = respond(found);
    expect(await lookupBarcode(db, '4006381333932', { fetch })).toEqual({ status: 'invalid' });
    expect(await lookupBarcode(db, '12', { fetch })).toEqual({ status: 'invalid' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends a plain GET with only the barcode in the URL: no headers, cookies or referrer', async () => {
    await setBarcodeLookup(db, true);
    const fetch = respond(found);
    await lookupBarcode(db, ' 400-6381-333931 ', { fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`https://world.openfoodfacts.org/api/v2/product/${CODE}.json`);
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeUndefined();
    expect(init?.method ?? 'GET').toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('saves a found product to My foods so the next lookup is local (no call, works with the setting off)', async () => {
    await setBarcodeLookup(db, true);
    const fetch = respond(found);
    const first = await lookupBarcode(db, CODE, { fetch });
    expect(first).toMatchObject({
      status: 'found',
      from: 'online',
      food: { id: `off:${CODE}`, source: 'openfoodfacts', kcal: 46, proteinG: 1.1, barcode: CODE },
    });
    expect(await foodByBarcode(db, CODE)).toMatchObject({ id: `off:${CODE}` });

    const second = await lookupBarcode(db, CODE, { fetch });
    expect(second).toMatchObject({ status: 'found', from: 'local' });
    await setBarcodeLookup(db, false);
    expect(await lookupBarcode(db, CODE, { fetch })).toMatchObject({
      status: 'found',
      from: 'local',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('finds my own food with that barcode first, without a call', async () => {
    await saveFood(db, {
      id: 'my:label',
      name: 'From the label',
      source: 'custom',
      basis: { per100g: true },
      kcal: 80,
      proteinG: 4,
      barcode: CODE,
    });
    await setBarcodeLookup(db, true);
    const fetch = respond(found);
    expect(await lookupBarcode(db, CODE, { fetch })).toMatchObject({
      status: 'found',
      from: 'local',
      food: { id: 'my:label' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports not found (404 or status 0) and incomplete products, saving nothing', async () => {
    await setBarcodeLookup(db, true);
    expect(
      await lookupBarcode(db, CODE, {
        fetch: respond({ status: 0, status_verbose: 'product not found' }, 404),
      }),
    ).toEqual({ status: 'notFound' });
    expect(await lookupBarcode(db, CODE, { fetch: respond({ status: 0 }) })).toEqual({
      status: 'notFound',
    });
    const noProtein = {
      status: 1,
      product: { product_name: 'X', nutriments: { 'energy-kcal_100g': 10 } },
    };
    expect(await lookupBarcode(db, CODE, { fetch: respond(noProtein) })).toEqual({
      status: 'incomplete',
    });
    expect(await foodByBarcode(db, CODE)).toBeUndefined();
  });

  it('reports offline, HTTP errors and a bad body as errors', async () => {
    await setBarcodeLookup(db, true);
    const offline = vi.fn<FetchFn>(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await lookupBarcode(db, CODE, { fetch: offline })).toEqual({
      status: 'error',
      reason: 'offline',
    });
    expect(await lookupBarcode(db, CODE, { fetch: respond({}, 503) })).toEqual({
      status: 'error',
      reason: 'http',
    });
    const garbage = vi.fn<FetchFn>(async () => new Response('<html>', { status: 200 }));
    expect(await lookupBarcode(db, CODE, { fetch: garbage })).toEqual({
      status: 'error',
      reason: 'http',
    });
  });

  it('gives up after the timeout (10 s by default) and aborts the request', async () => {
    expect(OFF_TIMEOUT_MS).toBe(10_000);
    await setBarcodeLookup(db, true);
    let signal: AbortSignal | undefined;
    const hang = vi.fn<FetchFn>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined;
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    expect(await lookupBarcode(db, CODE, { fetch: hang, timeoutMs: 20 })).toEqual({
      status: 'error',
      reason: 'timeout',
    });
    expect(signal?.aborted).toBe(true);
  });
});
