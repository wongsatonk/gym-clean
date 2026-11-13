import Dexie, { type Table } from 'dexie';
import type { SetLog } from '../core/types';

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

export class GymDb extends Dexie {
  sessions!: Table<SessionRow, string>;
  sets!: Table<SetRow, number>;

  constructor(name = 'gym-clean') {
    super(name);
    this.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
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
