/**
 * M11 Health persistence (Dexie v7 `healthDays` + settings key 'health'). Everything stays in
 * IndexedDB on the phone: `healthDays` is not in backups (src/data/backup.ts
 * NOT_BACKED_UP_TABLES) and nothing here writes to the developer log. Only per-day summaries are
 * stored, never raw samples. Turning a type off deletes what the app kept of it.
 */
import { SIGNAL_ORDER } from '../../core/health/copy';
import { planWeighInImport, type BodyMassSample } from '../../core/health/weighIns';
import {
  HEALTH_TYPES,
  type HealthDay,
  type HealthSettings,
  type HealthType,
  type HealthWorkout,
  type ReadinessCard,
  type ReadinessSignal,
  type WeighIn,
} from '../../core/types';
import type { GymDb } from '../db';

export const HEALTH_SETTINGS_KEY = 'health';

/**
 * Version of the weigh-in import rule the stored `lastReadAt` was read under. Stored in the
 * 'health' settings row as `weighInRule` (storage only: not a HealthSettings field, not backed
 * up). A row without the current version hides its `lastReadAt`, so the first sync after a rule
 * change re-reads the full 35 days once. 2 = "Health wins" (2026-11-16): before it, a typed
 * weigh-in won and only morning samples were imported, so his recent Health weights need the
 * catch-up read to replace older typed ones.
 */
export const HEALTH_WEIGH_IN_RULE = 2;
const WEIGH_IN_RULE_FIELD = 'weighInRule';

/** Nothing is read until he turns a type on (Settings → Health → Connect). */
export const HEALTH_SETTINGS_DEFAULT: Readonly<HealthSettings> = Object.freeze({
  enabled: Object.freeze({
    bodyMass: false,
    workouts: false,
    activeEnergy: false,
    sleep: false,
    restingHr: false,
    hrv: false,
  }),
  route: 'apple',
  deletedHealthWeighIns: Object.freeze([]) as unknown as string[],
});

/** The `HealthDay` fields each type owns (bodyMass lives in `weighIns`, source 'health'). */
export const HEALTH_DAY_FIELDS: Record<HealthType, readonly (keyof HealthDay)[]> = {
  bodyMass: [],
  workouts: ['workouts'],
  activeEnergy: ['activeKcal'],
  sleep: ['sleepMin'],
  restingHr: ['restingHr'],
  hrv: ['hrvMs', 'hrvSource'],
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkDate(date: string): void {
  if (!DATE_RE.test(date)) throw new RangeError(`Bad local date "${date}" (want YYYY-MM-DD)`);
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A stored value as HealthSettings; each bad or missing field falls back to its default. */
export function parseHealthSettings(v: unknown): HealthSettings {
  const o = isObj(v) ? v : {};
  const en = isObj(o.enabled) ? o.enabled : {};
  const enabled = Object.fromEntries(HEALTH_TYPES.map((t) => [t, en[t] === true])) as Record<
    HealthType,
    boolean
  >;
  const out: HealthSettings = {
    enabled,
    route: o.route === 'whoop-api' ? 'whoop-api' : 'apple',
    deletedHealthWeighIns: Array.isArray(o.deletedHealthWeighIns)
      ? [...new Set(o.deletedHealthWeighIns.filter((d): d is string => typeof d === 'string' && DATE_RE.test(d)))]
      : [],
  };
  if (typeof o.lastReadAt === 'number' && Number.isFinite(o.lastReadAt)) out.lastReadAt = o.lastReadAt;
  const readiness = parseReadiness(o.readiness);
  if (readiness) out.readiness = readiness;
  return out;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);

/** A stored card, or undefined if any part of it is damaged (a half card is never shown). */
function parseCard(v: unknown): ReadinessCard | undefined {
  if (!isObj(v) || !isDate(v.date)) return undefined;
  const { signals, reasons, offer } = v;
  if (!Array.isArray(signals) || !Array.isArray(reasons)) return undefined;
  if (!signals.every((x) => (SIGNAL_ORDER as readonly unknown[]).includes(x))) return undefined;
  if (!reasons.every((x) => typeof x === 'string')) return undefined;
  if (offer !== 'lighter' && offer !== 'deload') return undefined;
  return { date: v.date, signals: [...signals] as ReadinessSignal[], reasons: [...reasons] as string[], offer };
}

/** The readiness history (core/health/readiness ReadinessHistory); bad fields are dropped. */
function parseReadiness(v: unknown): HealthSettings['readiness'] {
  if (!isObj(v)) return undefined;
  const out: NonNullable<HealthSettings['readiness']> = {};
  const lastCard = parseCard(v.lastCard);
  if (lastCard) out.lastCard = lastCard;
  if (isDate(v.answeredDate)) out.answeredDate = v.answeredDate;
  if (isDate(v.lastDeloadOfferDate)) out.lastDeloadOfferDate = v.lastDeloadOfferDate;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The stored settings; `lastReadAt` only if it was read under the current weigh-in rule. */
export async function getHealthSettings(db: GymDb): Promise<HealthSettings> {
  const raw: unknown = (await db.settings.get(HEALTH_SETTINGS_KEY))?.value;
  const s = parseHealthSettings(raw);
  if (!isObj(raw) || raw[WEIGH_IN_RULE_FIELD] !== HEALTH_WEIGH_IN_RULE) delete s.lastReadAt;
  return s;
}

/** Saves the settings with the current weigh-in rule marker (see HEALTH_WEIGH_IN_RULE). */
export async function saveHealthSettings(db: GymDb, s: HealthSettings): Promise<void> {
  await db.settings.put({
    key: HEALTH_SETTINGS_KEY,
    value: { ...parseHealthSettings(s), [WEIGH_IN_RULE_FIELD]: HEALTH_WEIGH_IN_RULE },
  });
}

/**
 * Turns one type on or off; off also deletes its stored values (`clearHealthType`). Turning a
 * type on forgets `lastReadAt`, so the next sync reads the full 35 days (the new type needs its
 * history for baselines; re-reading the others is harmless, merges are per field).
 */
export async function setHealthTypeEnabled(db: GymDb, type: HealthType, on: boolean): Promise<void> {
  await db.transaction('rw', [db.settings, db.healthDays, db.weighIns], async () => {
    const s = await getHealthSettings(db);
    const next: HealthSettings = { ...s, enabled: { ...s.enabled, [type]: on } };
    if (on && !s.enabled[type]) delete next.lastReadAt;
    await saveHealthSettings(db, next);
    if (!on) await clearHealthType(db, type);
  });
}

// ---------- healthDays ----------

/** Rows with `from <= date <= to` (both optional), in date order. */
export async function listHealthDays(db: GymDb, from?: string, to?: string): Promise<HealthDay[]> {
  if (from === undefined && to === undefined) return db.healthDays.orderBy('date').toArray();
  return db.healthDays
    .where('date')
    .between(from ?? '', to ?? '￿', true, true)
    .toArray();
}

const workoutId = (w: HealthWorkout): string => `${w.start}|${w.kind}|${w.source}`;

function mergeDay(old: HealthDay | undefined, next: HealthDay): HealthDay {
  const out: HealthDay = { ...old, date: next.date };
  for (const [k, v] of Object.entries(next) as [keyof HealthDay, unknown][]) {
    if (k === 'date' || k === 'workouts' || v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  if (next.workouts !== undefined) {
    const byId = new Map<string, HealthWorkout>();
    for (const w of [...(old?.workouts ?? []), ...next.workouts]) byId.set(workoutId(w), w);
    out.workouts = [...byId.values()].sort((a, b) => a.start - b.start);
  }
  return out;
}

/**
 * Merges summaries into the stored rows, per date: a field present in the new row replaces the
 * stored one, missing fields are kept, workouts are unioned (same start + kind + source = same).
 */
export async function mergeHealthDays(db: GymDb, days: readonly HealthDay[]): Promise<void> {
  for (const d of days) checkDate(d.date);
  await db.transaction('rw', db.healthDays, async () => {
    const rows = new Map<string, HealthDay>();
    for (const d of days) {
      const old = rows.get(d.date) ?? (await db.healthDays.get(d.date));
      rows.set(d.date, mergeDay(old, d));
    }
    if (rows.size > 0) await db.healthDays.bulkPut([...rows.values()]);
  });
}

const isEmptyDay = (d: HealthDay): boolean => Object.keys(d).every((k) => k === 'date');

/** Removes the given fields from every row; rows left with only a date are deleted. */
async function stripFields(db: GymDb, fields: readonly (keyof HealthDay)[]): Promise<void> {
  if (fields.length === 0) return;
  const rows = await db.healthDays.toArray();
  const put: HealthDay[] = [];
  const del: string[] = [];
  for (const r of rows) {
    if (!fields.some((f) => f in r)) continue;
    const next = Object.fromEntries(
      Object.entries(r).filter(([k]) => !(fields as readonly string[]).includes(k)),
    ) as HealthDay;
    if (isEmptyDay(next)) del.push(r.date);
    else put.push(next);
  }
  if (put.length > 0) await db.healthDays.bulkPut(put);
  if (del.length > 0) await db.healthDays.bulkDelete(del);
}

/**
 * Deletes everything the app kept of one type: its `healthDays` fields, and for bodyMass the
 * imported weigh-ins (typed ones stay). The deleted-imports list is left as it is.
 */
export async function clearHealthType(db: GymDb, type: HealthType): Promise<void> {
  await db.transaction('rw', [db.healthDays, db.weighIns], async () => {
    await stripFields(db, HEALTH_DAY_FIELDS[type]);
    if (type === 'bodyMass') {
      await db.weighIns.filter((w) => w.source === 'health').delete();
    }
  });
}

/**
 * Removes the `healthDays` values of every type that is off in the stored settings (used after a
 * backup restore brings in other switches). Weigh-ins are left alone: they are backed-up data.
 */
export async function clearDisabledHealthTypes(db: GymDb): Promise<void> {
  const s = await getHealthSettings(db);
  const fields = HEALTH_TYPES.filter((t) => !s.enabled[t]).flatMap((t) => HEALTH_DAY_FIELDS[t]);
  await stripFields(db, fields);
}

// ---------- weigh-in import ----------

/**
 * Imports Health's pick per date as weigh-ins (source 'health'; core/health/weighIns): Health
 * wins over a typed weigh-in on that date and updates an earlier import whose pick changed;
 * dates on the deleted-imports list are skipped. Returns the rows written.
 */
export async function importHealthWeighIns(
  db: GymDb,
  samples: readonly BodyMassSample[],
): Promise<WeighIn[]> {
  return db.transaction('rw', [db.settings, db.weighIns], async () => {
    const s = await getHealthSettings(db);
    const existing = await db.weighIns.toArray();
    const rows = planWeighInImport({
      samples,
      existing,
      deleted: s.deletedHealthWeighIns ?? [],
    });
    if (rows.length > 0) await db.weighIns.bulkPut(rows);
    return rows;
  });
}

/** Adds (`deleted` true) or removes a date on the deleted-imports list. */
export async function markHealthWeighInDeleted(
  db: GymDb,
  date: string,
  deleted: boolean,
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = await getHealthSettings(db);
    const list = new Set(s.deletedHealthWeighIns ?? []);
    if (deleted === list.has(date)) return;
    if (deleted) list.add(date);
    else list.delete(date);
    await saveHealthSettings(db, { ...s, deletedHealthWeighIns: [...list].sort() });
  });
}
