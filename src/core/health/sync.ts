/**
 * M11 task 8: one Health sync (SPEC M11 "Reads happen when the app opens or comes to the
 * foreground"). Pure orchestration: the plugin and the store are injected, time is passed in.
 * The Dexie glue is `healthSyncStore(db)` in src/data/health/sync.ts; the native plugin is
 * `src/native/health.ts` (`Health`), matched structurally so core imports no native code.
 *
 * One sync:
 * 1. Plugin missing / unavailable (PWA) or no type on → quiet no-op (nothing written, no card).
 * 2. Read only the enabled types from local midnight of the window's first day (`since`): 35 days
 *    back on the first read, else the day before `lastReadAt`. Merges are per field (a new value
 *    replaces the stored one), so only whole days may be merged:
 *    - dates from `localDate(since)` on are whole: their totals, first-of-day resting HR / HRV
 *      and weigh-ins start at that midnight, and the night that woke on that first day is whole
 *      because the plugin looks back 18 h before `since` for sleep;
 *    - anything the read returns for an EARLIER date is cut off by the window (above all the
 *      tail of an older night from that sleep look-back) and is dropped, never merged, so it
 *      can't replace the full value stored by an earlier read;
 *    - today is still in progress; the next read re-reads it (and the day before) whole.
 *    The HRV source already stored for his recent days is kept (see `preferredHrvSource`).
 * 3. Re-check the switches after the read: a type turned off while it ran is dropped, never stored.
 * 4. Merge per-day summaries, import weigh-ins (Health wins, see weighIns.ts), save `lastReadAt`
 *    (only after an 'ok' read; a locked phone or failed read is skipped quietly and retried
 *    next time).
 * 5. Today's `ReadinessCard` from the stored days and `settings.readiness`; a new card is saved as
 *    `lastCard` (+ `lastDeloadOfferDate` when it offers a deload), so it shows once per day.
 * Never throws: any error ends as status 'failed' with no card.
 */
import { addDate, localDate } from '../trainer/plan';
import {
  HEALTH_TYPES,
  type HealthDay,
  type HealthSettings,
  type HealthType,
  type ReadinessCard,
  type WeighIn,
} from '../types';
import { healthDays, preferredHrvSource, type HealthRead } from './days';
import { readinessCard, type ReadinessHistory } from './readiness';
import { HEALTH_RULES, type HealthRules } from './rules';
import type { LoadSession } from './weeklyLoad';
import type { BodyMassSample } from './weighIns';

/** Days read on the first connect (and the furthest back any read goes). */
export const FIRST_READ_DAYS = 35;

/** The plugin's read API (`Health` in src/native/health.ts has this shape). */
export interface HealthSyncSource {
  isAvailable(): Promise<boolean>;
  read(options: {
    types: readonly HealthType[];
    since: number;
    until?: number;
  }): Promise<HealthRead & { status?: string }>;
}

/** The only settings fields a sync writes; the switches are never written here. */
export type SettingsPatch = Partial<Pick<HealthSettings, 'lastReadAt' | 'readiness'>>;

/** Storage a sync needs (src/data/health/sync.ts `healthSyncStore(db)`). */
export interface HealthSyncStore {
  getSettings(): Promise<HealthSettings>;
  /** Reads the current settings and writes `update`'s fields on top, atomically. */
  patchSettings(update: (current: HealthSettings) => SettingsPatch): Promise<void>;
  mergeDays(days: readonly HealthDay[]): Promise<void>;
  /** Rows with from <= date <= to, date order. */
  listDays(from?: string, to?: string): Promise<HealthDay[]>;
  /** Weigh-in import (Health wins over typed, deleted stays deleted); returns rows written. */
  importWeighIns(samples: readonly BodyMassSample[]): Promise<WeighIn[]>;
}

export type HealthSyncInput = {
  /** null on the web / when the plugin isn't there. */
  health: HealthSyncSource | null;
  store: HealthSyncStore;
  /** Epoch ms. */
  now: number;
  /** Local YYYY-MM-DD of `now`. */
  today: string;
  /** Today is a training day in his plan; unknown (undefined) → no card. */
  trainingDay?: boolean;
  /** A workout is running → no card. */
  inWorkout?: boolean;
  /**
   * His Gym Clean sessions: a Health workout overlapping a finished one is that session (e.g.
   * WHOOP logging the same lifting), never a "hard outside workout" signal.
   */
  gymSessions?: readonly LoadSession[];
  rules?: HealthRules;
};

export type HealthSyncStatus = 'ok' | 'off' | 'unavailable' | 'locked' | 'failed';

export type HealthSyncResult = {
  status: HealthSyncStatus;
  /** Day rows merged by this sync. */
  daysMerged: number;
  /** Weigh-ins imported by this sync. */
  weighIns: WeighIn[];
  /** Today's card, or null. */
  card: ReadinessCard | null;
};

/** Local midnight of `date` (device time zone). */
function midnightOf(date: string): number {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Start of the next read (epoch ms): local midnight `FIRST_READ_DAYS` before today on the first
 * read; else local midnight of the day before the last read, clamped to that same first-read
 * floor and to at most yesterday's midnight (a clock set back can't stop reads).
 */
export function healthReadSince(
  lastReadAt: number | undefined,
  today: string,
  now: number,
): number {
  const floor = midnightOf(addDate(today, -FIRST_READ_DAYS));
  if (lastReadAt === undefined || !Number.isFinite(lastReadAt)) return floor;
  const last = Math.min(lastReadAt, now);
  return Math.max(floor, midnightOf(addDate(localDate(last), -1)));
}

const enabledTypes = (s: HealthSettings): HealthType[] => HEALTH_TYPES.filter((t) => s.enabled[t]);

/** The read with only `types` kept. */
function only(read: HealthRead, types: readonly HealthType[]): HealthRead {
  const out: HealthRead = {};
  for (const t of types) if (read[t] !== undefined) (out as Record<string, unknown>)[t] = read[t];
  return out;
}

const EMPTY = (status: HealthSyncStatus): HealthSyncResult => ({
  status,
  daysMerged: 0,
  weighIns: [],
  card: null,
});

/** One sync. Never throws. */
export async function syncHealth(input: HealthSyncInput): Promise<HealthSyncResult> {
  const { health, store, now, today, rules = HEALTH_RULES } = input;
  try {
    if (!health || !(await health.isAvailable())) return EMPTY('unavailable');
    const before = await store.getSettings();
    const asked = enabledTypes(before);
    if (asked.length === 0) return EMPTY('off');

    const since = healthReadSince(before.lastReadAt, today, now);
    const firstFullDay = localDate(since);
    const read = await health.read({ types: asked, since, until: now });
    const status: HealthSyncStatus =
      (read.status ?? 'ok') === 'ok' ? 'ok' : read.status === 'locked' ? 'locked' : 'failed';

    let daysMerged = 0;
    let weighIns: WeighIn[] = [];
    if (status === 'ok') {
      // He may have turned a type off while the read ran: keep only what is still on.
      const after = await store.getSettings();
      const keep = asked.filter((t) => after.enabled[t]);
      const kept = only(read, keep);
      // Keep the HRV source his recent stored days already use (a short read can't flip it).
      const hrvSource = keep.includes('hrv')
        ? preferredHrvSource(
            await store.listDays(addDate(firstFullDay, -rules.baselineDays), today),
          )
        : undefined;
      // Only whole days (see 2.): an earlier date is cut off by the read window.
      const days = healthDays(kept, rules, hrvSource === undefined ? {} : { hrvSource }).filter(
        (d) => d.date >= firstFullDay,
      );
      if (days.length > 0) await store.mergeDays(days);
      daysMerged = days.length;
      if (keep.includes('bodyMass')) {
        const samples = (kept.bodyMass ?? [])
          .filter((p) => p.start >= since)
          .map((p) => ({ time: p.start, kg: p.kg }));
        if (samples.length > 0) weighIns = await store.importWeighIns(samples);
      }
      await store.patchSettings(() => ({ lastReadAt: now }));
    }

    const card = await todaysCard(input, rules);
    return { status, daysMerged, weighIns, card };
  } catch {
    return EMPTY('failed');
  }
}

/** Today's card from the stored days; a newly made card is saved in `readiness`. */
async function todaysCard(
  input: HealthSyncInput,
  rules: HealthRules,
): Promise<ReadinessCard | null> {
  const { store, today, now } = input;
  if (input.trainingDay !== true || input.inWorkout === true) return null;
  const history: ReadinessHistory = (await store.getSettings()).readiness ?? {};
  // Enough days for the 28-day baselines of each of the 7 days the deload nudge looks back on,
  // plus the 2 days the outside-workout check looks up by time.
  const from = addDate(today, -(rules.baselineDays + rules.deloadWindowDays + 2));
  const days = await store.listDays(from, today);
  const card = readinessCard({
    date: today,
    now,
    days,
    trainingDay: true,
    history,
    rules,
    ...(input.gymSessions ? { gymSessions: input.gymSessions } : {}),
  });
  if (card && history.lastCard !== card) {
    await store.patchSettings((s) => ({
      readiness: {
        ...s.readiness,
        lastCard: card,
        ...(card.offer === 'deload' ? { lastDeloadOfferDate: today } : {}),
      },
    }));
  }
  return card;
}

/**
 * He answered today's card (any of its three buttons): no card again on `date`.
 * Returns false if it couldn't be saved; never throws.
 */
export async function answerCard(store: HealthSyncStore, date: string): Promise<boolean> {
  try {
    await store.patchSettings((s) => ({ readiness: { ...s.readiness, answeredDate: date } }));
    return true;
  } catch {
    return false;
  }
}
