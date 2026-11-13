import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SetLog } from '../core/types';
import { GymDb, finishSession, saveSet, setsForSession, startSessionRow } from './db';

let db: GymDb;
let n = 0;

beforeEach(async () => {
  db = new GymDb(`test-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const log = (over: Partial<SetLog> = {}): SetLog => ({
  sessionId: 's1',
  exerciseId: 'Dumbbell_Bench_Press',
  setIndex: 0,
  reps: 10,
  weightKg: 20,
  restTakenSec: 0,
  startedAt: 1000,
  endedAt: 2000,
  ...over,
});

describe('GymDb', () => {
  it('saves sets and reads them back for a session in start order', async () => {
    await saveSet(db, log({ setIndex: 1, startedAt: 5000, endedAt: 6000, restTakenSec: 90 }));
    await saveSet(db, log());
    await saveSet(db, log({ sessionId: 'other' }));
    const rows = await setsForSession(db, 's1');
    expect(rows.map((r) => r.setIndex)).toEqual([0, 1]);
    expect(rows[1]).toMatchObject({ reps: 10, weightKg: 20, restTakenSec: 90 });
  });

  it('records a session and its finish summary', async () => {
    await startSessionRow(db, { sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    expect(await db.sessions.get('s1')).toEqual({
      sessionId: 's1',
      dayId: 'push-a',
      startedAt: 1000,
    });
    await finishSession(db, 's1', 9000, { setsDone: 3, totalVolumeKg: 400, restOverruns: 1 });
    expect(await db.sessions.get('s1')).toMatchObject({
      endedAt: 9000,
      setsDone: 3,
      totalVolumeKg: 400,
      restOverruns: 1,
    });
  });
});
