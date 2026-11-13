// M4c developer log (SPEC M4c, §4): pose numbers, counter events, speech and set data, kept
// in IndexedDB on this phone only. Never images or video, never uploaded; it leaves the device
// only when the user taps Export.
//
// Writes are batched: the recorder keeps everything in memory and flushes every 10 s, at set
// end, when the page is hidden, and at finish. A killed tab loses at most the last 10 s.

import Dexie from 'dexie';
import { FrameEncoder, decodeFrames, type DevLogFrame } from '../core/devlogCodec';
import type { LandmarkFrame, RepEvent } from '../core/types';
import type {
  DevLogCameraMeta,
  DevLogChunkRow,
  DevLogCount,
  DevLogEvent,
  DevLogSessionRow,
  DevLogSetRow,
  DevLogSpeech,
  GymDb,
} from './db';

export type { DevLogCameraMeta, DevLogCount, DevLogEvent, DevLogSpeech, DevLogFrame };

export const DEVLOG_FLUSH_MS = 10_000;
export const DEVLOG_CAP_BYTES = 150 * 1024 * 1024;
const SETTING_KEY = 'devLog';

// ---------- export shape (SPEC §4 DevLog types, frames decoded) ----------

export type DevLogSetExport = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  targetReps: [number, number];
  counted?: DevLogCount;
  /** Ground truth after any correction. Missing if the set never ended (tab killed). */
  logged?: DevLogCount;
  weightKg: number;
  startedAt: number;
  endedAt?: number;
  restTakenSec?: number;
  camera?: DevLogCameraMeta & {
    fps: { t: number; fps: number }[];
    repEvents: RepEvent[];
    speech: DevLogSpeech[];
    angles: { t: number; angle: number | null }[];
    /** Decoded, 4 decimals. A frame with no person is `{ t, landmarks: null }`. */
    frames: DevLogFrame[];
  };
};

export type DevLogSessionExport = {
  id: string;
  startedAt: number;
  endedAt?: number;
  appVersion: string;
  userAgent: string;
  settings: Record<string, unknown>;
  dayId: string;
  events: DevLogEvent[];
  sets: DevLogSetExport[];
};

export type DevLogExport = {
  format: 'gym-clean-devlog';
  version: 1;
  exportedAt: number;
  sessions: DevLogSessionExport[];
};

// ---------- setting ----------

/** On by default (Wongsaton's request); only an explicit false turns it off. */
export async function getDevLogEnabled(db: GymDb): Promise<boolean> {
  const row = await db.settings.get(SETTING_KEY);
  return row?.value !== false;
}

export async function setDevLogEnabled(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: SETTING_KEY, value: on });
}

// ---------- recorder ----------

export type DevLogSessionMeta = {
  dayId: string;
  settings: Record<string, unknown>;
  /** Defaults to a generated id; pass the workout's sessionId to line the two up. */
  id?: string;
  startedAt?: number;
};

export type DevLogOptions = {
  /** Wall clock for default time stamps (ms). Default `Date.now`. */
  now?: () => number;
  flushMs?: number;
  capBytes?: number;
  /** Default `__APP_VERSION__` (git sha + build time). */
  appVersion?: string;
  /** Default `navigator.userAgent`. */
  userAgent?: string;
  /** Same as the meta id; handy in tests. */
  id?: string;
};

export type DevLogSetStart = {
  exerciseId: string;
  setIndex: number;
  targetReps: [number, number];
  weightKg: number;
  /** Wall clock ms; default now. */
  startedAt?: number;
};

export type DevLogSetEnd = {
  /** What the camera counted (camera sets only). */
  counted?: DevLogCount;
  /** What was logged (= ground truth unless corrected later). */
  logged: DevLogCount;
  weightKg: number;
  /** Wall clock ms; default now. */
  endedAt?: number;
  restTakenSec?: number;
};

/**
 * Records one workout. Data methods are synchronous and cheap (safe at 30 fps); the async
 * ones resolve once their data is in IndexedDB. Camera-data calls while no set is open are
 * ignored. A disabled log gives a recorder with `active: false` whose methods do nothing.
 */
export interface DevLogRecorder {
  readonly active: boolean;
  /** '' when inactive. */
  readonly sessionId: string;
  /** A session event (set done, start set, skip, jump, pause, adjust…). `t` default now. */
  logEvent(type: string, data?: unknown, t?: number): void;
  /** Opens a set (ends nothing: call endSet first). Returns the set's key ('' if inactive). */
  beginSet(info: DevLogSetStart): string;
  /** Camera details for the open set; merged, so call again when e.g. the side changes. */
  camera(meta: Partial<DevLogCameraMeta>): void;
  /** One pose frame, or `null` with its time when no person was found. `t` = frame clock. */
  frame(frame: LandmarkFrame | null, t: number): void;
  /** Smoothed joint angle per frame (`null` when gated). */
  angle(t: number, angle: number | null): void;
  repEvent(ev: RepEvent): void;
  speech(s: DevLogSpeech): void;
  fps(t: number, fps: number): void;
  /** Closes the open set and flushes it. */
  endSet(result: DevLogSetEnd): Promise<void>;
  /** Corrects the last ended set's logged numbers (clamped ≥ 0) and logs a 'correction' event. */
  correctSet(logged: DevLogCount, t?: number): Promise<void>;
  /** Writes everything buffered so far. */
  flush(): Promise<void>;
  /** Resolves when every write queued so far is done. */
  settled(): Promise<void>;
  /** Flushes, stamps the session's end, stops the timer. The recorder is inactive afterwards. */
  finish(endedAt?: number): Promise<void>;
  /**
   * Flushes what's buffered and stops recording without stamping an end (workout abandoned,
   * or a new session replaces this one). Idempotent; `finish()` afterwards does nothing.
   */
  dispose(): Promise<void>;
}

const NOOP: DevLogRecorder = {
  active: false,
  sessionId: '',
  logEvent: () => {},
  beginSet: () => '',
  camera: () => {},
  frame: () => {},
  angle: () => {},
  repEvent: () => {},
  speech: () => {},
  fps: () => {},
  endSet: async () => {},
  correctSet: async () => {},
  flush: async () => {},
  settled: async () => {},
  finish: async () => {},
  dispose: async () => {},
};

/** Storage full (DOMException name, or Dexie's wrapper with the DOMException as `inner`). */
function isQuotaError(err: unknown): boolean {
  const e = err as { name?: unknown; inner?: { name?: unknown } } | null;
  return e?.name === 'QuotaExceededError' || e?.inner?.name === 'QuotaExceededError';
}

type OpenSet = {
  row: DevLogSetRow;
  dirty: boolean;
  enc: FrameEncoder;
  angles: { t: number; angle: number | null }[];
  repEvents: RepEvent[];
  speech: DevLogSpeech[];
  fps: { t: number; fps: number }[];
};

const sessionKey = (sessionId: string) => `${sessionId}#session`;

class Recorder implements DevLogRecorder {
  active = true;
  private queue: Promise<void> = Promise.resolve();
  private events: DevLogEvent[] = [];
  private open: OpenSet | null = null;
  private lastEnded: DevLogSetRow | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** A quota error has already triggered the one-off cleanup of older sessions. */
  private quotaCleaned = false;
  private readonly onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void this.flush();
  };
  /** pagehide flushes regardless of visibility (bfcache / iOS may skip a hidden state). */
  private readonly onPageHide = () => void this.flush();

  constructor(
    private readonly db: GymDb,
    readonly sessionId: string,
    private seq: number,
    private readonly now: () => number,
    private readonly capBytes: number,
    flushMs: number,
  ) {
    this.timer = setInterval(() => void this.flush(), flushMs);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  /** Stops recording: no timer, no listeners, every method a no-op. Idempotent. */
  private halt(): void {
    if (!this.active) return;
    this.active = false;
    clearInterval(this.timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('pagehide', this.onPageHide);
    }
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(op).catch((err: unknown) => {
      // Logging must never break the workout.
      console.warn('devlog write failed', err);
    });
    return this.queue;
  }

  logEvent(type: string, data?: unknown, t?: number): void {
    if (!this.active) return;
    const ev: DevLogEvent = { t: t ?? this.now(), type };
    if (data !== undefined) ev.data = data;
    this.events.push(ev);
  }

  beginSet(info: DevLogSetStart): string {
    if (!this.active) return '';
    if (this.open) void this.flush(); // leaves the previous set open-ended in the log
    const seq = this.seq++;
    const row: DevLogSetRow = {
      key: `${this.sessionId}#${seq}`,
      sessionId: this.sessionId,
      seq,
      exerciseId: info.exerciseId,
      setIndex: info.setIndex,
      targetReps: [info.targetReps[0], info.targetReps[1]],
      weightKg: info.weightKg,
      startedAt: info.startedAt ?? this.now(),
    };
    this.open = {
      row,
      dirty: true,
      enc: new FrameEncoder(),
      angles: [],
      repEvents: [],
      speech: [],
      fps: [],
    };
    return row.key;
  }

  camera(meta: Partial<DevLogCameraMeta>): void {
    const o = this.active ? this.open : null;
    if (!o) return;
    o.row.camera = { folder: '', delegate: '', side: null, ...o.row.camera, ...meta };
    o.dirty = true;
  }

  frame(frame: LandmarkFrame | null, t: number): void {
    if (this.active) this.open?.enc.push(frame ?? { t, landmarks: null });
  }

  angle(t: number, angle: number | null): void {
    if (this.active) this.open?.angles.push({ t, angle });
  }

  repEvent(ev: RepEvent): void {
    if (this.active) this.open?.repEvents.push({ ...ev });
  }

  speech(s: DevLogSpeech): void {
    if (this.active) this.open?.speech.push({ ...s });
  }

  fps(t: number, fps: number): void {
    if (this.active) this.open?.fps.push({ t, fps });
  }

  endSet(result: DevLogSetEnd): Promise<void> {
    const o = this.active ? this.open : null;
    if (!o) return this.settled();
    const row = o.row;
    if (result.counted) row.counted = { ...result.counted };
    row.logged = { ...result.logged };
    row.weightKg = result.weightKg;
    row.endedAt = result.endedAt ?? this.now();
    if (result.restTakenSec !== undefined) row.restTakenSec = result.restTakenSec;
    o.dirty = true;
    const done = this.flush();
    this.open = null;
    this.lastEnded = row;
    return done;
  }

  correctSet(logged: DevLogCount, t?: number): Promise<void> {
    const row = this.active ? this.lastEnded : null;
    if (!row) return this.settled();
    const to = {
      reps: Math.max(0, Math.round(logged.reps)),
      partials: Math.max(0, Math.round(logged.partials)),
    };
    const from = row.logged ? { ...row.logged } : undefined;
    row.logged = to;
    this.logEvent(
      'correction',
      { exerciseId: row.exerciseId, setIndex: row.setIndex, from, to },
      t,
    );
    const key = row.key;
    this.enqueue(async () => {
      await this.db.devlogSets.update(key, { logged: to });
    });
    return this.flush();
  }

  /** Snapshots the buffers synchronously, then queues one transaction for them. */
  flush(): Promise<void> {
    if (!this.active) return this.settled();
    const chunks: DevLogChunkRow[] = [];
    let setRow: DevLogSetRow | null = null;
    if (this.events.length) {
      chunks.push(
        chunk({
          sessionId: this.sessionId,
          setKey: sessionKey(this.sessionId),
          events: this.events,
        }),
      );
      this.events = [];
    }
    const o = this.open;
    if (o) {
      if (o.dirty) {
        setRow = structuredClone(o.row);
        o.dirty = false;
      }
      const frames = o.enc.take();
      if (frames || o.angles.length || o.repEvents.length || o.speech.length || o.fps.length) {
        const c: Omit<DevLogChunkRow, 'bytes'> = { sessionId: this.sessionId, setKey: o.row.key };
        if (frames) c.frames = frames;
        if (o.angles.length) c.angles = o.angles;
        if (o.repEvents.length) c.repEvents = o.repEvents;
        if (o.speech.length) c.speech = o.speech;
        if (o.fps.length) c.fps = o.fps;
        chunks.push(chunk(c));
        o.angles = [];
        o.repEvents = [];
        o.speech = [];
        o.fps = [];
      }
    }
    if (!chunks.length && !setRow) return this.settled();
    const { db, sessionId, capBytes } = this;
    const write = () =>
      db.transaction('rw', db.devlogSessions, db.devlogSets, db.devlogChunks, async () => {
        if (setRow) await db.devlogSets.put(setRow);
        if (chunks.length) await db.devlogChunks.bulkAdd(chunks);
        const added = chunks.reduce((sum, c) => sum + c.bytes, 0);
        await db.devlogSessions
          .where('id')
          .equals(sessionId)
          .modify((s) => {
            s.bytes += added;
          });
      });
    return this.enqueue(async () => {
      try {
        await write();
      } catch (err) {
        if (!isQuotaError(err)) throw err;
        // Storage full: free space once by dropping older sessions, then retry this write.
        // If it still doesn't fit (or it happens again later), stop logging for this session
        // instead of failing and warning every 10 s.
        let retried = false;
        if (!this.quotaCleaned) {
          this.quotaCleaned = true;
          await dropOldestSessions(db, sessionId);
          try {
            await write();
            retried = true;
          } catch (err2) {
            if (!isQuotaError(err2)) throw err2;
          }
        }
        if (!retried) {
          console.warn('devlog: storage is full, developer log stopped for this workout', err);
          this.halt();
          return;
        }
      }
      await enforceDevLogCap(db, capBytes, sessionId);
    });
  }

  settled(): Promise<void> {
    return this.queue;
  }

  async finish(endedAt?: number): Promise<void> {
    if (!this.active) return this.settled();
    const end = endedAt ?? this.now();
    await this.flush();
    if (!this.active) return; // stopped by a quota error during that flush
    this.halt();
    const { db, sessionId } = this;
    await this.enqueue(async () => {
      await db.devlogSessions.update(sessionId, { endedAt: end });
    });
  }

  async dispose(): Promise<void> {
    if (!this.active) return this.settled();
    await this.flush();
    this.halt();
    await this.settled();
  }
}

/** A chunk row with its approximate stored size. */
function chunk(c: Omit<DevLogChunkRow, 'bytes'>): DevLogChunkRow {
  const { frames, ...rest } = c;
  return { ...c, bytes: (frames?.byteLength ?? 0) + JSON.stringify(rest).length };
}

/**
 * Starts the log for one workout, or returns an inactive recorder when the log is disabled.
 * Reusing an existing id (e.g. after a reload) continues that session. Never rejects: any
 * storage failure (quota, Safari eviction "UnknownError", …) gives an inactive recorder.
 */
export async function startDevLogSession(
  db: GymDb,
  meta: DevLogSessionMeta,
  opts: DevLogOptions = {},
): Promise<DevLogRecorder> {
  try {
    return await openSession(db, meta, opts);
  } catch (err) {
    console.warn('devlog: could not start, logging is off for this workout', err);
    return NOOP;
  }
}

async function openSession(
  db: GymDb,
  meta: DevLogSessionMeta,
  opts: DevLogOptions,
): Promise<DevLogRecorder> {
  if (!(await getDevLogEnabled(db))) return NOOP;
  const now = opts.now ?? Date.now;
  const startedAt = meta.startedAt ?? now();
  const id = meta.id ?? opts.id ?? `dl-${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
  const capBytes = opts.capBytes ?? DEVLOG_CAP_BYTES;
  let seq = 0;
  const existing = await db.devlogSessions.get(id);
  if (existing) {
    const last = await db.devlogSets
      .where('[sessionId+seq]')
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .last();
    seq = last ? last.seq + 1 : 0;
  } else {
    await db.devlogSessions.put({
      id,
      startedAt,
      appVersion: opts.appVersion ?? __APP_VERSION__,
      userAgent: opts.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      settings: { ...meta.settings },
      dayId: meta.dayId,
      bytes: 0,
    });
  }
  await enforceDevLogCap(db, capBytes, id);
  return new Recorder(db, id, seq, now, capBytes, opts.flushMs ?? DEVLOG_FLUSH_MS);
}

// ---------- size, rotation, clear ----------

/** Approximate stored size (bytes) and number of logged sessions. */
export async function devLogStats(db: GymDb): Promise<{ bytes: number; sessions: number }> {
  const rows = await db.devlogSessions.toArray();
  return { bytes: rows.reduce((sum, r) => sum + r.bytes, 0), sessions: rows.length };
}

async function deleteSessions(db: GymDb, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db.transaction('rw', db.devlogSessions, db.devlogSets, db.devlogChunks, async () => {
    await db.devlogChunks.where('sessionId').anyOf(ids).delete();
    await db.devlogSets.where('sessionId').anyOf(ids).delete();
    await db.devlogSessions.bulkDelete(ids);
  });
}

/** Quota recovery: deletes the oldest half (at least one) of the sessions other than `keepId`. */
async function dropOldestSessions(db: GymDb, keepId: string): Promise<void> {
  const others = (await db.devlogSessions.orderBy('startedAt').toArray()).filter(
    (r) => r.id !== keepId,
  );
  await deleteSessions(
    db,
    others.slice(0, Math.max(1, Math.ceil(others.length / 2))).map((r) => r.id),
  );
}

/** Deletes the oldest sessions until the log fits `capBytes`; never deletes `keepId`. */
export async function enforceDevLogCap(
  db: GymDb,
  capBytes: number,
  keepId?: string,
): Promise<void> {
  const rows = await db.devlogSessions.orderBy('startedAt').toArray();
  let total = rows.reduce((sum, r) => sum + r.bytes, 0);
  const drop: string[] = [];
  for (const r of rows) {
    if (total <= capBytes) break;
    if (r.id === keepId) continue;
    drop.push(r.id);
    total -= r.bytes;
  }
  await deleteSessions(db, drop);
}

export async function clearDevLog(db: GymDb): Promise<void> {
  await db.transaction('rw', db.devlogSessions, db.devlogSets, db.devlogChunks, async () => {
    await db.devlogChunks.clear();
    await db.devlogSets.clear();
    await db.devlogSessions.clear();
  });
}

export async function lastDevLogSessionId(db: GymDb): Promise<string | undefined> {
  return (await db.devlogSessions.orderBy('startedAt').last())?.id;
}

// ---------- export ----------

function sessionRowsFor(db: GymDb, scope: ExportScope): Promise<DevLogSessionRow[]> {
  if (scope === 'all') return db.devlogSessions.orderBy('startedAt').toArray();
  return (async () => {
    const id = scope === 'last' ? await lastDevLogSessionId(db) : scope.sessionId;
    const row = id === undefined ? undefined : await db.devlogSessions.get(id);
    return row ? [row] : [];
  })();
}

async function sessionHead(
  db: GymDb,
  row: DevLogSessionRow,
): Promise<Omit<DevLogSessionExport, 'sets'>> {
  const chunks = await db.devlogChunks.where('setKey').equals(sessionKey(row.id)).toArray();
  const out: Omit<DevLogSessionExport, 'sets'> = {
    id: row.id,
    startedAt: row.startedAt,
    appVersion: row.appVersion,
    userAgent: row.userAgent,
    settings: row.settings,
    dayId: row.dayId,
    events: chunks.flatMap((c) => c.events ?? []),
  };
  if (row.endedAt !== undefined) out.endedAt = row.endedAt;
  return out;
}

function setRowsFor(db: GymDb, sessionId: string): Promise<DevLogSetRow[]> {
  return db.devlogSets
    .where('[sessionId+seq]')
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .toArray();
}

async function setExport(db: GymDb, row: DevLogSetRow): Promise<DevLogSetExport> {
  const { key, camera, ...rest } = row;
  const out: DevLogSetExport = { ...rest };
  delete (out as Partial<DevLogSetRow>).seq;
  const chunks = await db.devlogChunks.where('setKey').equals(key).toArray();
  if (camera || chunks.length) {
    const frames: DevLogFrame[] = [];
    for (const c of chunks) if (c.frames) frames.push(...decodeFrames(c.frames));
    out.camera = {
      folder: camera?.folder ?? '',
      delegate: camera?.delegate ?? '',
      side: camera?.side ?? null,
      fps: chunks.flatMap((c) => c.fps ?? []),
      repEvents: chunks.flatMap((c) => c.repEvents ?? []),
      speech: chunks.flatMap((c) => c.speech ?? []),
      angles: chunks.flatMap((c) => c.angles ?? []),
      frames,
    };
  }
  return out;
}

async function buildExport(
  db: GymDb,
  scope: ExportScope,
  exportedAt: number,
): Promise<DevLogExport> {
  const sessions: DevLogSessionExport[] = [];
  for (const row of await sessionRowsFor(db, scope)) {
    const sets: DevLogSetExport[] = [];
    for (const s of await setRowsFor(db, row.id)) sets.push(await setExport(db, s));
    sessions.push({ ...(await sessionHead(db, row)), sets });
  }
  return { format: 'gym-clean-devlog', version: 1, exportedAt, sessions };
}

/** One session as plain JSON data (empty `sessions` if the id is unknown). */
export function exportSession(
  db: GymDb,
  id: string,
  exportedAt = Date.now(),
): Promise<DevLogExport> {
  return buildExport(db, { sessionId: id }, exportedAt);
}

/** Every stored session, oldest first. */
export function exportAll(db: GymDb, exportedAt = Date.now()): Promise<DevLogExport> {
  return buildExport(db, 'all', exportedAt);
}

export type ExportScope = 'all' | 'last' | { sessionId: string };

export type DevLogFile = { blob: Blob; filename: string; gzip: boolean };

const pad = (n: number) => String(n).padStart(2, '0');

/** Stored-size limit for the uncompressed fallback (≈ 6× larger as JSON, all in memory). */
export const DEVLOG_PLAIN_EXPORT_MAX_BYTES = 20 * 1024 * 1024;

/** Thrown by `exportBlob` when a plain-JSON export would be too large; `message` is UI-ready. */
export class DevLogExportTooLargeError extends Error {
  override readonly name = 'DevLogExportTooLarge';
}

/** The export JSON text, piece by piece (one set per piece), so it never exists as a whole. */
async function* exportPieces(
  db: GymDb,
  rows: DevLogSessionRow[],
  exportedAt: number,
): AsyncGenerator<string> {
  const head = { format: 'gym-clean-devlog', version: 1, exportedAt };
  yield JSON.stringify(head).slice(0, -1) + ',"sessions":[';
  for (const [i, row] of rows.entries()) {
    const s = JSON.stringify(await sessionHead(db, row));
    yield (i ? ',' : '') + s.slice(0, -1) + ',"sets":[';
    for (const [j, setRow] of (await setRowsFor(db, row.id)).entries()) {
      yield (j ? ',' : '') + JSON.stringify(await setExport(db, setRow));
    }
    yield ']}';
  }
  yield ']}';
}

/**
 * The export as a file: gzip JSON when `CompressionStream` exists (iOS 16.4+), else plain
 * JSON. The gzip path pulls the JSON set by set through `CompressionStream`, so only the
 * compressed output is held in memory. The plain fallback is built in memory and refused with
 * a `DevLogExportTooLargeError` above `plainMaxBytes` of stored log (default
 * `DEVLOG_PLAIN_EXPORT_MAX_BYTES`). Share with `navigator.share({ files: [new File([blob], filename)] })`.
 */
export async function exportBlob(
  db: GymDb,
  opts: { scope: ExportScope; compress?: boolean; now?: number; plainMaxBytes?: number },
): Promise<DevLogFile> {
  const exportedAt = opts.now ?? Date.now();
  const rows = await sessionRowsFor(db, opts.scope);

  const d = new Date(exportedAt);
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const scopeName = opts.scope === 'all' ? 'all' : opts.scope === 'last' ? 'last' : 'session';
  const base = `gym-clean-devlog-${stamp}-${scopeName}.json`;

  const gzip = (opts.compress ?? true) && typeof CompressionStream === 'function';
  if (!gzip) {
    const limit = opts.plainMaxBytes ?? DEVLOG_PLAIN_EXPORT_MAX_BYTES;
    const stored = rows.reduce((sum, r) => sum + r.bytes, 0);
    if (stored > limit) {
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
      throw new DevLogExportTooLargeError(
        `The developer log is too large to export without compression (${mb(stored)} MB, ` +
          `limit ${mb(limit)} MB). Export the last session instead.`,
      );
    }
    const parts: Blob[] = [];
    for await (const piece of exportPieces(db, rows, exportedAt)) parts.push(new Blob([piece]));
    return { blob: new Blob(parts, { type: 'application/json' }), filename: base, gzip: false };
  }

  const pieces = exportPieces(db, rows, exportedAt);
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    async pull(controller) {
      const next = await pieces.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
    async cancel() {
      await pieces.return(undefined);
    },
  });
  const gz = await new Response(source.pipeThrough(new CompressionStream('gzip'))).blob();
  return { blob: new Blob([gz], { type: 'application/gzip' }), filename: `${base}.gz`, gzip: true };
}
