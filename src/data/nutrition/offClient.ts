/**
 * M7 barcode lookup (optional, off by default: M7-q5).
 *
 * The only network call in M7. It runs only when the stored setting is on, and the request
 * carries nothing but the barcode number in its URL: a plain GET, no query string, no headers,
 * no cookies, no referrer. My foods are checked first, and a found product is saved to My foods,
 * so the same barcode works offline next time.
 */
import type { Food } from '../../core/types';
import { isValidBarcode, normalizeBarcode, offProductToFood } from '../../core/nutrition/barcode';
import type { GymDb } from '../db';
import { foodByBarcode, getBarcodeLookup, saveFood } from './store';

export const OFF_ORIGIN = 'https://world.openfoodfacts.org';
export const OFF_TIMEOUT_MS = 10_000;

export function offProductUrl(code: string): string {
  return `${OFF_ORIGIN}/api/v2/product/${encodeURIComponent(code)}.json`;
}

export type BarcodeLookup =
  | { status: 'found'; food: Food; from: 'local' | 'online' }
  /** Not a valid EAN-13 / EAN-8 / UPC-A. */
  | { status: 'invalid' }
  /** Not in My foods, and the online lookup setting is off. */
  | { status: 'off' }
  /** Open Food Facts doesn't know it: offer "Add it to My foods". */
  | { status: 'notFound' }
  /** Known, but without kcal or protein: offer "Add it to My foods". */
  | { status: 'incomplete' }
  | { status: 'error'; reason: 'offline' | 'timeout' | 'http' };

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export async function lookupBarcode(
  db: GymDb,
  input: string,
  deps: { fetch?: FetchLike; timeoutMs?: number } = {},
): Promise<BarcodeLookup> {
  const code = normalizeBarcode(input);
  if (!isValidBarcode(code)) return { status: 'invalid' };

  const local = await foodByBarcode(db, code);
  if (local) return { status: 'found', food: local, from: 'local' };
  if (!(await getBarcodeLookup(db))) return { status: 'off' };

  const doFetch: FetchLike = deps.fetch ?? ((u, init) => globalThis.fetch(u, init));
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, deps.timeoutMs ?? OFF_TIMEOUT_MS);

  let json: unknown;
  try {
    let res: Response;
    try {
      res = await doFetch(offProductUrl(code), {
        method: 'GET',
        signal: ctrl.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      return { status: 'error', reason: timedOut ? 'timeout' : 'offline' };
    }
    if (res.status === 404) return { status: 'notFound' };
    if (!res.ok) return { status: 'error', reason: 'http' };
    try {
      json = await res.json();
    } catch {
      return { status: 'error', reason: timedOut ? 'timeout' : 'http' };
    }
  } finally {
    clearTimeout(timer);
  }

  const parsed = offProductToFood(json, code);
  if (!parsed.ok) return { status: parsed.reason };
  await saveFood(db, parsed.food);
  return { status: 'found', food: parsed.food, from: 'online' };
}
