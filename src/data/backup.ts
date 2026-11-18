/**
 * M9 B1: full backup / restore of the on-device data (SPEC M9, PROGRESS M9-q7).
 *
 * A backup is one JSON file the user creates by tapping Back up and moves himself (Files /
 * AirDrop); nothing here touches the network. It holds every Dexie table except the developer log
 * (large, and only for tuning), the saved food photos and the food model (large binaries; photos
 * leave the phone as their own zip export, the model is re-imported), the Health day summaries
 * (M11-q7: they stay on the phone and are read from Health again) and never an API key or other
 * secret (settings only, see SECRET_NAMES). Every row is checked against its table's shape before
 * the user is asked to confirm. Restore replaces all backed-up data in one transaction: it either
 * all lands or nothing changes. The developer log, the food photos / model, the Health day
 * summaries and any secret already on this phone are left alone (Health values of a type the
 * restored switches turn off are deleted, as turning it off in Settings would).
 *
 * Health (M11): imported weigh-ins are weigh-ins and travel like any other. The settings row
 * 'health' (per-type switches, route, deleted-import dates) is backed up without `lastReadAt`,
 * `weighInRule` and `readiness`, so the restored phone does a fresh first read and keeps its own
 * card history.
 * A file without that row keeps this phone's.
 *
 * What's New (M12 slice 1c): the settings row 'whatsNew' is backed up without `builds` (build id →
 * first seen on this phone, the 7-day re-sign clock); a restore keeps this phone's `builds` and the
 * later of this phone's and the file's `seenRelease` (an old backup doesn't replay the tour), and a
 * file without the row keeps this phone's row.
 *
 * Trainer kit (M12 slice 1b): goals, tape measurements and day feels are backed up, and so are the
 * settings rows 'trainerKit' and 'intake'. Progress photos never are (LOCAL_ONLY_TABLES): a file
 * can't carry them and a restore leaves this phone's alone.
 *
 * Weekly check-in (M12 slice 2): `checkIns` is backed up (ratings 1–5 checked); the settings row
 * 'reminders' rides along with `settings`. A v10 file has no `checkIns`: the restore empties it.
 *
 * Permission catch-up (M13): the settings row 'permissionCatchUp' is phone-only (never backed up,
 * a restore keeps this phone's row); the 'onboarding' row rides along.
 */
import Dexie from 'dexie';
import type { GymDb } from './db';
import { APP_NAME } from '../core/brand';
import { HEALTH_SETTINGS_KEY, clearDisabledHealthTypes } from './health/store';
import { compareReleases } from '../core/todo/whatsNew';
import { WHATS_NEW_KEY } from './todos/store';
import { PERMISSION_CATCH_UP_KEY } from './onboarding';

export const BACKUP_FORMAT = 'gym-clean-backup';
/** The file layout's own version (bump when the header or table encoding changes). */
export const BACKUP_VERSION = 1;

/**
 * The tables a backup carries. Every new Dexie table must land here, in DEVLOG_TABLES or in
 * LOCAL_ONLY_TABLES (a test checks), so a schema bump can't silently drop data from backups.
 */
export const BACKUP_TABLES = [
  'sessions',
  'sets',
  'exerciseNotes',
  'sessionNotes',
  'settings',
  'trainer',
  'planChanges',
  'foods',
  'recipes',
  'foodEntries',
  'weighIns',
  'favorites',
  'weeklyChecks',
  // M12 slice 1c: his to-do answers and notes (no Health values; key-like strings removed on save).
  'todoAnswers',
  // M12 slice 1b: tape measurements, goals and "how I feel today" answers (his own entries).
  'measurements',
  'goals',
  'dayFeels',
  // M12 slice 2: weekly check-in answers (his own 1–5 ratings; never in a brain context).
  'checkIns',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Left out on purpose (M9-q7): the developer log stays on the phone that recorded it. */
export const DEVLOG_TABLES = ['devlogSessions', 'devlogSets', 'devlogChunks'] as const;

/**
 * Left out on purpose, data that stays on this phone:
 * - M7b: saved meal photos and the imported food model are large Blobs that don't fit a JSON
 *   backup. Photos leave the phone through their own zip export
 *   (src/core/nutrition/photoExport.ts); the model is imported again in Settings.
 * - M11 (M11-q7): `healthDays`, the per-day Health summaries. They are read from Health again on
 *   the restored phone. Imported weigh-ins are in `weighIns` and are backed up.
 * - M12: `chatMessages`, the coach chat thread (private text, kept 30 days). The coach UI state
 *   in `settings` key 'coach' holds no message text and is backed up.
 * - M12 slice 1b: `progressPhotos`, his progress photos (private image Blobs). They never leave
 *   this phone in any file.
 */
export const LOCAL_ONLY_TABLES = [
  'foodPhotos',
  'foodModels',
  'healthDays',
  'chatMessages',
  'progressPhotos',
] as const;

/** Every table a backup never carries (a restore leaves them alone). */
export const NOT_BACKED_UP_TABLES = [...DEVLOG_TABLES, ...LOCAL_ONLY_TABLES] as const;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: number;
  /** `db.verno` of the phone that wrote it. A newer one than this app knows is refused. */
  dexieVersion: number;
  appVersion: string;
  /** ms since epoch. */
  createdAt: number;
  /** Rows as stored. Tables missing from an older file restore as empty. */
  tables: Partial<Record<BackupTable, unknown[]>>;
};

export type BackupErrorCode =
  /** Not JSON, wrong shape, unknown table, a row without a valid or unique key. */
  | 'corrupt'
  /** Not a Gym Clean backup. */
  | 'format'
  /** Written by a newer app (file layout or database schema). Update the app first. */
  | 'newer'
  /** The database refused the write; the transaction rolled back, nothing changed. */
  | 'write';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export type ImportResult = {
  /** Rows written per table. */
  counts: Record<BackupTable, number>;
  /** What was there before, as a backup: `importAll(db, undo)` puts it back (kept in memory only). */
  undo: BackupFile;
};

/**
 * Secrets live only in the `settings` table (e.g. a phase C coach API key). These exact names,
 * compared case-insensitively with `-`/`_` removed, are never backed up: a settings row with such
 * a key is dropped, and such a property is removed at any depth inside a settings value. Other
 * tables and other names (e.g. a future `tokenCount`) are kept as they are. Add a name here when a
 * new secret setting is introduced.
 */
export const SECRET_NAMES: readonly string[] = [
  'apiKey',
  'claudeApiKey',
  'anthropicApiKey',
  'openaiApiKey',
  'secret',
  'clientSecret',
  'password',
  'passphrase',
  'token',
  'accessToken',
  'refreshToken',
  'authToken',
  'bearerToken',
  'credential',
  'credentials',
];

const norm = (k: string): string => k.replace(/[-_]/g, '').toLowerCase();
const SECRET_SET = new Set(SECRET_NAMES.map(norm));
const isSecretName = (k: string): boolean => SECRET_SET.has(norm(k));

/** Drops every property whose name is a listed secret, at any depth. Returns a copy. */
function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets);
  if (v === null || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (!isSecretName(k)) out[k] = stripSecrets(x);
  return out;
}

const isSecretSetting = (row: unknown): boolean =>
  typeof row === 'object' &&
  row !== null &&
  typeof (row as { key?: unknown }).key === 'string' &&
  isSecretName((row as { key: string }).key);

/**
 * Health settings fields that only make sense on the phone that read them (M11): the last read
 * time and the weigh-in rule it was read under (`weighInRule`, src/data/health/store.ts), and the
 * readiness-card history (today's card, answered date, deload spacing) that comes from this
 * phone's Health data.
 */
const HEALTH_LOCAL_FIELDS: readonly string[] = ['lastReadAt', 'weighInRule', 'readiness'];

const isHealthSetting = (row: unknown): row is { key: string; value: unknown } =>
  isObj(row) && row.key === HEALTH_SETTINGS_KEY;

function stripHealthLocal(row: unknown): unknown {
  if (!isHealthSetting(row) || !isObj(row.value)) return row;
  const value = Object.fromEntries(
    Object.entries(row.value).filter(([k]) => !HEALTH_LOCAL_FIELDS.includes(k)),
  );
  return { ...row, value };
}

/** This phone's readiness history (kept across a restore that brings its own health row). */
function localHealthReadiness(rows: readonly unknown[]): unknown {
  const row = rows.find(isHealthSetting);
  return row && isObj(row.value) ? row.value.readiness : undefined;
}

const isWhatsNewSetting = (row: unknown): row is { key: string; value: unknown } =>
  isObj(row) && row.key === WHATS_NEW_KEY;

/** The 'whatsNew' row without `builds` (the re-sign clock belongs to the phone that ran them). */
/** The later of two seen releases (either may be missing or damaged). */
function laterRelease(a: unknown, b: unknown): string | undefined {
  const ok = (v: unknown): v is string => typeof v === 'string' && v !== '';
  if (!ok(a)) return ok(b) ? b : undefined;
  if (!ok(b)) return a;
  return compareReleases(a, b) >= 0 ? a : b;
}

function stripWhatsNewLocal(row: unknown): unknown {
  if (!isWhatsNewSetting(row) || !isObj(row.value)) return row;
  const value = Object.fromEntries(Object.entries(row.value).filter(([k]) => k !== 'builds'));
  return { ...row, value };
}

/**
 * Whole settings rows that belong to this phone (M13 permission catch-up: the release it last
 * asked this phone's permissions in). Never backed up; a restore keeps this phone's row.
 */
const PHONE_ONLY_SETTINGS: readonly string[] = [PERMISSION_CATCH_UP_KEY];

const isPhoneOnlySetting = (row: unknown): boolean =>
  isObj(row) && typeof row.key === 'string' && PHONE_ONLY_SETTINGS.includes(row.key);

/**
 * Backed-up rows of one table: only settings rows are touched (secret and phone-only rows and
 * secret fields removed, the health and whatsNew rows lose their phone-only fields).
 */
function cleanRows(name: BackupTable, rows: unknown[]): unknown[] {
  if (name !== 'settings') return rows;
  return rows
    .filter((r) => !isSecretSetting(r) && !isPhoneOnlySetting(r))
    .map(stripSecrets)
    .map(stripHealthLocal)
    .map(stripWhatsNewLocal);
}

async function readTables(db: GymDb): Promise<Record<BackupTable, unknown[]>> {
  const out = {} as Record<BackupTable, unknown[]>;
  for (const name of BACKUP_TABLES) out[name] = cleanRows(name, await db.table(name).toArray());
  return out;
}

declare const __APP_VERSION__: string | undefined;
const defaultAppVersion = (): string =>
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

function header(db: GymDb, opts: { appVersion?: string; now?: number }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    dexieVersion: db.verno,
    appVersion: opts.appVersion ?? defaultAppVersion(),
    createdAt: opts.now ?? Date.now(),
  } as const;
}

/**
 * Everything worth moving to another phone, as a plain JSON-safe object (`JSON.stringify` it to
 * save). Read in one transaction, so the tables are consistent with each other.
 */
export async function exportAll(
  db: GymDb,
  opts: { appVersion?: string; now?: number } = {},
): Promise<BackupFile> {
  const tables = await db.transaction('r', [...BACKUP_TABLES], () => readTables(db));
  return { ...header(db, opts), tables };
}

// ---------- validation ----------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A key IndexedDB can store, as JSON can carry it: finite number, string, or array of those. */
function isValidKey(k: unknown): boolean {
  if (typeof k === 'number') return Number.isFinite(k);
  if (typeof k === 'string') return true;
  if (Array.isArray(k)) return k.length > 0 && k.every(isValidKey);
  return false;
}

const keyOf = (row: Record<string, unknown>, path: string | string[]): unknown =>
  Array.isArray(path) ? path.map((p) => row[p]) : row[path];

function corrupt(msg: string): never {
  throw new BackupError('corrupt', msg);
}

function parse(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return corrupt('The file is not valid JSON.');
  }
}

function isPosInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

// Row shapes per table: required fields and the types of optional ones (a trailing `?`). Extra
// fields are allowed (a newer app at the same schema may add some). Checked before the user is
// asked to confirm, so a damaged file is refused with 'corrupt' and the db is never touched.

type Check = (v: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const obj: Check = (v) => isObj(v);
const arr: Check = (v) => Array.isArray(v);
const any: Check = () => true;
const numOrNull: Check = (v) => v === null || num(v);
const trainerState: Check = (v) =>
  isObj(v) && num(v.version) && isObj(v.plan) && isObj(v.schedule) && Array.isArray(v.overrides);
const rating: Check = (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
const goalTarget: Check = (v) => isObj(v) && str(v.kind) && num(v.value);

const MACROS = { kcal: num, proteinG: num, 'carbsG?': num, 'fatG?': num };

const ROW_SHAPES: Record<BackupTable, Record<string, Check>> = {
  sessions: {
    sessionId: str,
    dayId: str,
    startedAt: num,
    'endedAt?': num,
    'setsDone?': num,
    'totalVolumeKg?': num,
    'restOverruns?': num,
    'adjust?': arr,
  },
  sets: {
    sessionId: str,
    exerciseId: str,
    setIndex: num,
    reps: num,
    'partials?': num,
    weightKg: num,
    restTakenSec: num,
    'restTargetSec?': num,
    'focusScore?': num,
    'cues?': arr,
    'effort?': str,
    'warmup?': bool,
    startedAt: num,
    endedAt: num,
  },
  exerciseNotes: { exerciseId: str, machineSetting: str, note: str, 'updatedAt?': num },
  sessionNotes: { sessionId: str, exerciseId: str, note: str, updatedAt: num },
  settings: { key: str, value: any },
  trainer: { key: str, state: trainerState },
  planChanges: {
    createdAt: num,
    action: str,
    title: str,
    source: str,
    before: trainerState,
    after: trainerState,
    'undoneAt?': num,
  },
  foods: {
    id: str,
    name: str,
    'nameTh?': str,
    source: str,
    basis: obj,
    ...MACROS,
    'portions?': arr,
    'note?': str,
    'barcode?': str,
    'estimate?': bool,
  },
  recipes: {
    id: str,
    name: str,
    'nameTh?': str,
    ingredients: arr,
    servings: num,
    updatedAt: num,
  },
  foodEntries: {
    id: str,
    date: str,
    time: num,
    slot: str,
    label: str,
    'ref?': obj,
    amount: obj,
    estimate: bool,
    ...MACROS,
    'source?': str,
    'photoConfidence?': num,
    'logged?': obj,
  },
  weighIns: { date: str, kg: num, 'source?': str },
  todoAnswers: {
    id: str,
    topicId: str,
    stepId: str,
    kind: str,
    'optionIds?': arr,
    'note?': str,
    at: num,
    release: str,
    'sentAt?': num,
  },
  measurements: { date: str, site: str, cm: num },
  goals: { id: str, text: str, target: goalTarget, due: str, createdAt: num, 'doneAt?': num },
  dayFeels: { date: str, 'energy?': num, 'sore?': arr },
  checkIns: {
    weekStart: str,
    'energy?': rating,
    'sleep?': rating,
    'soreness?': rating,
    'skipped?': bool,
    at: num,
  },
  favorites: { id: str, ref: obj, amount: obj, createdAt: num },
  weeklyChecks: {
    weekStart: str,
    avgKg: numOrNull,
    prevAvgKg: numOrNull,
    ratePct: numOrNull,
    kind: str,
    deltaKcal: num,
    outcome: str,
    'decidedAt?': num,
  },
};

/** The first field of `row` that doesn't fit its table's shape, or null. */
function badField(name: BackupTable, row: Record<string, unknown>): string | null {
  for (const [field, check] of Object.entries(ROW_SHAPES[name])) {
    const optional = field.endsWith('?');
    const key = optional ? field.slice(0, -1) : field;
    if (!(key in row)) {
      if (optional) continue;
      return key;
    }
    if (!check(row[key])) return key;
  }
  return null;
}

/** Checks a parsed backup against this app's schema. Throws BackupError; never writes. */
export function validateBackup(db: GymDb, input: unknown): BackupFile {
  const f = parse(input);
  if (!isObj(f)) return corrupt('The file is not a backup object.');
  if (f.format !== BACKUP_FORMAT) throw new BackupError('format', `Not a ${APP_NAME} backup.`);
  if (!isPosInt(f.version)) return corrupt('The backup version is missing.');
  if (f.version > BACKUP_VERSION)
    throw new BackupError('newer', 'This backup comes from a newer app. Update the app first.');
  if (!isPosInt(f.dexieVersion)) return corrupt('The database version is missing.');
  if (f.dexieVersion > db.verno)
    throw new BackupError('newer', 'This backup comes from a newer app. Update the app first.');
  if (typeof f.appVersion !== 'string') return corrupt('The app version is missing.');
  if (typeof f.createdAt !== 'number' || !Number.isFinite(f.createdAt))
    return corrupt('The backup date is missing.');
  if (!isObj(f.tables)) return corrupt('The backup has no tables.');

  const known = new Set<string>(BACKUP_TABLES);
  for (const name of Object.keys(f.tables))
    if (!known.has(name)) corrupt(`Unknown table "${name}".`);

  const tables: Partial<Record<BackupTable, unknown[]>> = {};
  for (const name of BACKUP_TABLES) {
    const rows = f.tables[name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return corrupt(`Table "${name}" is not a list.`);
    const pk = db.table(name).schema.primKey;
    const path = pk.keyPath;
    if (path === null || path === undefined || path === '')
      return corrupt(`Table "${name}" has no key.`);
    const seen = new Set<string>();
    rows.forEach((row: unknown, i) => {
      if (!isObj(row)) corrupt(`Row ${i} of "${name}" is not an object.`);
      const bad = badField(name, row);
      if (bad !== null) corrupt(`Row ${i} of "${name}" has a missing or wrong "${bad}".`);
      const k = keyOf(row, path);
      if (pk.auto && k === undefined) return; // gets a new id
      if (!isValidKey(k) || (pk.auto && !(typeof k === 'number' && k >= 1)))
        corrupt(`Row ${i} of "${name}" has no valid key.`);
      const id = JSON.stringify(k);
      if (seen.has(id)) corrupt(`Row ${i} of "${name}" repeats a key.`);
      seen.add(id);
    });
    tables[name] = rows;
  }
  return {
    format: BACKUP_FORMAT,
    version: f.version,
    dexieVersion: f.dexieVersion,
    appVersion: f.appVersion,
    createdAt: f.createdAt,
    tables,
  };
}

// ---------- restore ----------

/**
 * Replaces all backed-up data with the file's (text or parsed object), in one transaction.
 * The caller confirms with the user first ("Replace all data on this phone?"). Kept as they are:
 * the developer log, and any secret settings row on this phone (secrets in a file are ignored).
 * Throws BackupError ('corrupt' | 'format' | 'newer' before writing, 'write' after a rollback);
 * on any error the db is unchanged. Returns per-table counts and an in-memory Undo snapshot.
 */
export async function importAll(
  db: GymDb,
  input: unknown,
  opts: { appVersion?: string; now?: number } = {},
): Promise<ImportResult> {
  const file = validateBackup(db, input);
  try {
    return await db.transaction('rw', [...BACKUP_TABLES, 'healthDays'], async () => {
      const undo: BackupFile = { ...header(db, opts), tables: await readTables(db) };
      const localRows = await db.settings.toArray();
      const localSecrets = localRows.filter(isSecretSetting);
      const localPhoneOnly = localRows.filter(isPhoneOnlySetting);
      const fileRows = file.tables.settings ?? [];
      const fileHasHealth = fileRows.some(isHealthSetting);
      const localHealth = fileHasHealth ? [] : localRows.filter(isHealthSetting);
      const localReadiness = fileHasHealth ? localHealthReadiness(localRows) : undefined;
      const localWhatsNew = localRows.find(isWhatsNewSetting);
      const fileHasWhatsNew = fileRows.some(isWhatsNewSetting);
      const counts = {} as Record<BackupTable, number>;
      for (const name of BACKUP_TABLES) {
        const table = db.table(name);
        await table.clear();
        const rows = cleanRows(name, file.tables[name] ?? []);
        if (rows.length > 0) await table.bulkAdd(rows);
        counts[name] = rows.length;
      }
      if (localSecrets.length > 0) await db.settings.bulkPut(localSecrets);
      if (localPhoneOnly.length > 0) await db.settings.bulkPut(localPhoneOnly);
      if (localHealth.length > 0) await db.settings.bulkPut(localHealth);
      if (localReadiness !== undefined) {
        const row = await db.settings.get(HEALTH_SETTINGS_KEY);
        if (row && isObj(row.value)) {
          await db.settings.put({ ...row, value: { ...row.value, readiness: localReadiness } });
        }
      }
      if (localWhatsNew) {
        const restored = await db.settings.get(WHATS_NEW_KEY);
        if (!fileHasWhatsNew || !restored) await db.settings.put(localWhatsNew);
        else {
          const local = isObj(localWhatsNew.value) ? localWhatsNew.value : {};
          const value: Record<string, unknown> = isObj(restored.value) ? { ...restored.value } : {};
          if (local.builds !== undefined) value.builds = local.builds;
          const seen = laterRelease(local.seenRelease, value.seenRelease);
          if (seen !== undefined) value.seenRelease = seen;
          await db.settings.put({ key: WHATS_NEW_KEY, value });
        }
      }
      await clearDisabledHealthTypes(db);
      return { counts, undo };
    });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    const why = e instanceof Dexie.DexieError || e instanceof Error ? e.message : String(e);
    throw new BackupError('write', `Restore failed, nothing changed: ${why}`);
  }
}
