import Dexie, { type Table } from 'dexie';
import type { SetLog } from '../core/types';
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

export class GymDb extends Dexie {
  sessions!: Table<SessionRow, string>;
  sets!: Table<SetRow, number>;
  exerciseNotes!: Table<ExerciseNoteRow, string>;
  sessionNotes!: Table<SessionNoteRow, [string, string]>;
  settings!: Table<SettingRow, string>;

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
