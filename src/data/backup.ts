/**
 * M9 B1: full backup / restore of the on-device data (SPEC M9, PROGRESS M9-q7).
 *
 * A backup is one JSON file the user creates by tapping Back up and moves himself (Files /
 * AirDrop); nothing here touches the network. It holds every Dexie table except the developer log
 * (large, and only for tuning) and never an API key or other secret. Restore replaces all backed-up
 * data in one transaction: it either all lands or nothing changes. The developer log and any secret
 * already on this phone are left alone.
 */
import Dexie from 'dexie';
import type { GymDb } from './db';

export const BACKUP_FORMAT = 'gym-clean-backup';
/** The file layout's own version (bump when the header or table encoding changes). */
export const BACKUP_VERSION = 1;

/**
 * The tables a backup carries. Every new Dexie table must land here or in DEVLOG_TABLES (a test
 * checks), so a schema bump can't silently drop data from backups.
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
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

/** Left out on purpose (M9-q7): the developer log stays on the phone that recorded it. */
export const DEVLOG_TABLES = ['devlogSessions', 'devlogSets', 'devlogChunks'] as const;

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

/** Settings keys and property names that may hold a secret (e.g. a phase C coach API key). */
const SECRET_NAME = /api[-_]?key|secret|password|passphrase|token|credential/i;

/** Drops every property whose name looks like a secret, at any depth. Returns a copy. */
function stripSecrets(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripSecrets);
  if (v === null || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET_NAME.test(k)) out[k] = stripSecrets(x);
  return out;
}

const isSecretSetting = (row: unknown): boolean =>
  typeof row === 'object' &&
  row !== null &&
  typeof (row as { key?: unknown }).key === 'string' &&
  SECRET_NAME.test((row as { key: string }).key);

/** Backed-up rows of one table: secrets removed (whole settings rows, and nested fields). */
function cleanRows(name: BackupTable, rows: unknown[]): unknown[] {
  const kept = name === 'settings' ? rows.filter((r) => !isSecretSetting(r)) : rows;
  return kept.map(stripSecrets);
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

/** Checks a parsed backup against this app's schema. Throws BackupError; never writes. */
export function validateBackup(db: GymDb, input: unknown): BackupFile {
  const f = parse(input);
  if (!isObj(f)) return corrupt('The file is not a backup object.');
  if (f.format !== BACKUP_FORMAT) throw new BackupError('format', 'Not a Gym Clean backup.');
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
    return await db.transaction('rw', [...BACKUP_TABLES], async () => {
      const undo: BackupFile = { ...header(db, opts), tables: await readTables(db) };
      const localSecrets = (await db.settings.toArray()).filter(isSecretSetting);
      const counts = {} as Record<BackupTable, number>;
      for (const name of BACKUP_TABLES) {
        const table = db.table(name);
        await table.clear();
        const rows = cleanRows(name, file.tables[name] ?? []);
        if (rows.length > 0) await table.bulkAdd(rows);
        counts[name] = rows.length;
      }
      if (localSecrets.length > 0) await db.settings.bulkPut(localSecrets);
      return { counts, undo };
    });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    const why = e instanceof Dexie.DexieError || e instanceof Error ? e.message : String(e);
    throw new BackupError('write', `Restore failed, nothing changed: ${why}`);
  }
}
