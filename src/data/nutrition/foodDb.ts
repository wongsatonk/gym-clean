/**
 * M7 lazy loader for the USDA food subset (built by scripts/build-foods.mjs).
 *
 * The JSON is imported with `?url`, so it's a hashed asset (assets/usda-foods-*.json, which the
 * PWA precaches) and neither tsc nor the main bundle parse it. It's fetched on the first search,
 * never at startup, and kept in memory afterwards. Same-origin only; nothing leaves the device.
 */
import usdaFoodsUrl from './usda-foods.json?url';
import type { FoodDbRow } from '../../core/types';

export const FOOD_DB_URL: string = usdaFoodsUrl;

export type FoodDbState = 'idle' | 'loading' | 'ready' | 'error';

export type FoodDbErrorKind = 'offline' | 'http' | 'format';

export class FoodDbError extends Error {
  constructor(
    readonly kind: FoodDbErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'FoodDbError';
  }
}

export type FoodDbLoader = {
  /** Fetches once (concurrent calls share it); after an error the next call retries. */
  load(): Promise<FoodDbRow[]>;
  state(): FoodDbState;
  /** The rows once loaded, else null. */
  rows(): FoodDbRow[] | null;
  /** Called on every state change; returns an unsubscribe function. */
  onChange(fn: (s: FoodDbState) => void): () => void;
};

type FetchLike = (url: string) => Promise<Response>;

const FORMAT = 'gym-clean-usda-foods';

function parse(data: unknown): FoodDbRow[] {
  const d = data as { format?: unknown; foods?: unknown } | null;
  if (!d || d.format !== FORMAT || !Array.isArray(d.foods))
    throw new FoodDbError('format', 'Food list has an unknown format.');
  return d.foods as FoodDbRow[];
}

export function createFoodDbLoader(opts: { url?: string; fetch?: FetchLike } = {}): FoodDbLoader {
  const url = opts.url ?? FOOD_DB_URL;
  const doFetch: FetchLike = opts.fetch ?? ((u) => globalThis.fetch(u));
  let state: FoodDbState = 'idle';
  let rows: FoodDbRow[] | null = null;
  let pending: Promise<FoodDbRow[]> | null = null;
  const listeners = new Set<(s: FoodDbState) => void>();
  const set = (s: FoodDbState): void => {
    state = s;
    for (const fn of listeners) fn(s);
  };

  async function fetchRows(): Promise<FoodDbRow[]> {
    let res: Response;
    try {
      res = await doFetch(url);
    } catch {
      throw new FoodDbError('offline', 'Food list needs a connection the first time (offline).');
    }
    if (!res.ok) throw new FoodDbError('http', `Food list failed to load (HTTP ${res.status}).`);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new FoodDbError('format', 'Food list has an unknown format.');
    }
    return parse(data);
  }

  return {
    load() {
      if (rows) return Promise.resolve(rows);
      if (pending) return pending;
      set('loading');
      pending = fetchRows().then(
        (r) => {
          rows = r;
          pending = null;
          set('ready');
          return r;
        },
        (err: unknown) => {
          pending = null;
          set('error');
          throw err;
        },
      );
      return pending;
    },
    state: () => state,
    rows: () => rows,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The app-wide loader (fetches the precached asset on first use). */
export const foodDb: FoodDbLoader = createFoodDbLoader();
