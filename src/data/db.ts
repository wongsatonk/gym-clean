import Dexie, { type Table } from 'dexie';
import type { RepEvent, SetLog } from '../core/types';
import type { Unit } from '../core/units';

export type SessionRow = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
  setsDone?: number;
  totalVolumeKg?: number;
  restOverruns?: number;
};

export type SetRow = SetLog & { id?: number };

/** Lasting per-exercise info, shown every time the exercise comes up. */
export type ExerciseNoteRow = {
  exerciseId: string;
  machineSetting: string;
  note: string;
  updatedAt?: number;
};

/** "Today's note" for one exercise in one workout. */
export type SessionNoteRow = {
  sessionId: string;
  exerciseId: string;
  note: string;
  updatedAt: number;
};

export type SettingRow = { key: string; value: unknown };

// ---------- M4c: developer log (on device only; numbers, never images) ----------

export type DevLogCount = { reps: number; partials: number };
export type DevLogEvent = { t: number; type: string; data?: unknown };
/** `dropped` = why the speech policy skipped a hint (see src/core/coachSpeech.ts DropReason). */
export type DevLogSpeech = {
  t: number;
  text: string;
  kind: 'count' | 'hint' | 'placement';
  dropped?: 'rate' | 'stale' | 'superseded' | 'interrupted';
};
/** `wallT0` = Date.now() when the camera's frame clock started, to line frames up with events. */
export type DevLogCameraMeta = {
  folder: string;
  delegate: string;
  side: string | null;
  wallT0?: number;
};

/** One logged workout session. `bytes` is the approximate stored size of its log. */
export type DevLogSessionRow = {
  id: string;
  startedAt: number;
  endedAt?: number;
  appVersion: string;
  userAgent: string;
  settings: Record<string, unknown>;
  dayId: string;
  bytes: number;
};

/** One set (manual or camera). `logged`/`endedAt` are missing while the set is open. */
export type DevLogSetRow = {
  key: string;
  sessionId: string;
  seq: number;
  exerciseId: string;
  setIndex: number;
  targetReps: [number, number];
  counted?: DevLogCount;
  logged?: DevLogCount;
  weightKg: number;
  startedAt: number;
  endedAt?: number;
  restTakenSec?: number;
  camera?: DevLogCameraMeta;
};

/**
 * What one flush appended, for one set (`setKey` = the set's key) or for the session's own
 * events (`setKey` = `<sessionId>#session`). Frames are devlogCodec bytes.
 */
export type DevLogChunkRow = {
  id?: number;
  sessionId: string;
  setKey: string;
  events?: DevLogEvent[];
  frames?: Uint8Array;
  angles?: { t: number; angle: number | null }[];
  repEvents?: RepEvent[];
  speech?: DevLogSpeech[];
  fps?: { t: number; fps: number }[];
  bytes: number;
};

export class GymDb extends Dexie {
  sessions!: Table<SessionRow, string>;
  sets!: Table<SetRow, number>;
  exerciseNotes!: Table<ExerciseNoteRow, string>;
  sessionNotes!: Table<SessionNoteRow, [string, string]>;
  settings!: Table<SettingRow, string>;
  devlogSessions!: Table<DevLogSessionRow, string>;
  devlogSets!: Table<DevLogSetRow, string>;
  devlogChunks!: Table<DevLogChunkRow, number>;

  constructor(name = 'gym-clean') {
    super(name);
    this.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    this.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    // M4c: developer log. New tables only; existing data is untouched.
    this.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
  }
}

export async function startSessionRow(db: GymDb, row: SessionRow): Promise<void> {
  await db.sessions.put(row);
}

export async function finishSession(
  db: GymDb,
  sessionId: string,
  endedAt: number,
  summary: Pick<SessionRow, 'setsDone' | 'totalVolumeKg' | 'restOverruns'>,
): Promise<void> {
  await db.sessions.update(sessionId, { endedAt, ...summary });
}

export async function saveSet(db: GymDb, log: SetLog): Promise<number> {
  return db.sets.add({ ...log });
}

/** Identifies one logged set (a session logs each exercise's set index once). */
export type SetRef = Pick<SetLog, 'sessionId' | 'exerciseId' | 'setIndex'>;

/**
 * M4c last-set correction: writes the corrected reps/partials to the logged row (partials 0 →
 * field removed, like a fresh log). Returns the number of rows changed (0 if none matched).
 */
export async function updateSet(
  db: GymDb,
  ref: SetRef,
  counts: { reps: number; partials: number },
): Promise<number> {
  const reps = Math.max(0, Math.round(counts.reps));
  const partials = Math.max(0, Math.round(counts.partials));
  return db.sets
    .where('sessionId')
    .equals(ref.sessionId)
    .filter((r) => r.exerciseId === ref.exerciseId && r.setIndex === ref.setIndex)
    .modify((r) => {
      r.reps = reps;
      if (partials > 0) r.partials = partials;
      else delete r.partials;
    });
}

export async function setsForSession(db: GymDb, sessionId: string): Promise<SetRow[]> {
  return db.sets.where('sessionId').equals(sessionId).sortBy('startedAt');
}

// ---------- M1b: notes, settings, last time ----------

export async function getExerciseNote(db: GymDb, exerciseId: string): Promise<ExerciseNoteRow> {
  return (await db.exerciseNotes.get(exerciseId)) ?? { exerciseId, machineSetting: '', note: '' };
}

export async function saveExerciseNote(
  db: GymDb,
  row: Pick<ExerciseNoteRow, 'exerciseId' | 'machineSetting' | 'note'>,
): Promise<void> {
  await db.exerciseNotes.put({ ...row, updatedAt: Date.now() });
}

export async function saveSessionNote(
  db: GymDb,
  sessionId: string,
  exerciseId: string,
  note: string,
): Promise<void> {
  await db.sessionNotes.put({ sessionId, exerciseId, note, updatedAt: Date.now() });
}

export async function sessionNotes(db: GymDb, sessionId: string): Promise<Record<string, string>> {
  const rows = await db.sessionNotes.where('sessionId').equals(sessionId).toArray();
  return Object.fromEntries(rows.filter((r) => r.note).map((r) => [r.exerciseId, r.note]));
}

export async function getUnit(db: GymDb): Promise<Unit> {
  const row = await db.settings.get('unit');
  return row?.value === 'lb' ? 'lb' : 'kg';
}

export async function setUnit(db: GymDb, unit: Unit): Promise<void> {
  await db.settings.put({ key: 'unit', value: unit });
}

/** M4: speak each counted rep ("One", "Two"…). Default on; only an explicit false turns it off. */
export async function getSpokenCount(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('spokenCount');
  return row?.value !== false;
}

export async function setSpokenCount(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'spokenCount', value: on });
}

/** M5b: show (and speak) the after-set coach tip on Rest. Default on; only an explicit false turns it off. */
export async function getCoachTips(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('coachTips');
  return row?.value !== false;
}

export async function setCoachTips(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'coachTips', value: on });
}

/** M5c "Hands-free sets" (auto start/stop on camera exercises). On unless explicitly false. */
export async function getHandsFree(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('handsFree');
  return row?.value !== false;
}

export async function setHandsFree(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'handsFree', value: on });
}

/** For each exercise, the sets from the most recent session other than `excludeSessionId`. */
export async function lastSessionSets(
  db: GymDb,
  exerciseIds: string[],
  excludeSessionId?: string,
): Promise<Record<string, SetRow[]>> {
  const out: Record<string, SetRow[]> = {};
  for (const id of new Set(exerciseIds)) {
    const rows = await db.sets
      .where('[exerciseId+startedAt]')
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .reverse()
      .toArray();
    const latest = rows.find((r) => r.sessionId !== excludeSessionId);
    if (!latest) continue;
    out[id] = rows.filter((r) => r.sessionId === latest.sessionId).reverse();
  }
  return out;
}

/** Weight of the final set per exercise, for session defaults. */
export function lastWeights(last: Record<string, SetRow[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, rows] of Object.entries(last)) {
    const final = rows.at(-1);
    if (final) out[id] = final.weightKg;
  }
  return out;
}
