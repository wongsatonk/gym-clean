import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SetLog } from '../core/types';
import {
  GymDb,
  finishSession,
  getExerciseNote,
  getSpokenCount,
  getUnit,
  lastSessionSets,
  lastWeights,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  sessionNotes,
  setSpokenCount,
  setUnit,
  setsForSession,
  startSessionRow,
} from './db';

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

describe('GymDb v2 (M1b)', () => {
  it('stores a lasting machine setting and note per exercise', async () => {
    expect(await getExerciseNote(db, 'Leg_Press')).toEqual({
      exerciseId: 'Leg_Press',
      machineSetting: '',
      note: '',
    });
    await saveExerciseNote(db, {
      exerciseId: 'Leg_Press',
      machineSetting: 'Seat 4',
      note: 'Feet high',
    });
    expect(await getExerciseNote(db, 'Leg_Press')).toMatchObject({
      machineSetting: 'Seat 4',
      note: 'Feet high',
    });
  });

  it('stores today’s note per session and exercise', async () => {
    await saveSessionNote(db, 's1', 'A', 'felt heavy');
    await saveSessionNote(db, 's1', 'B', 'easy');
    await saveSessionNote(db, 's2', 'A', 'other day');
    await saveSessionNote(db, 's1', 'B', 'actually hard');
    expect(await sessionNotes(db, 's1')).toEqual({ A: 'felt heavy', B: 'actually hard' });
  });

  it('remembers the weight unit, defaulting to kg', async () => {
    expect(await getUnit(db)).toBe('kg');
    await setUnit(db, 'lb');
    expect(await getUnit(db)).toBe('lb');
  });

  it('returns the most recent previous session’s sets per exercise', async () => {
    await saveSet(db, log({ sessionId: 'old', startedAt: 100, endedAt: 101, reps: 6 }));
    await saveSet(db, log({ sessionId: 'mid', startedAt: 200, endedAt: 201, reps: 8 }));
    await saveSet(
      db,
      log({ sessionId: 'mid', setIndex: 1, startedAt: 300, endedAt: 301, reps: 7, weightKg: 22.5 }),
    );
    await saveSet(db, log({ sessionId: 'now', startedAt: 400, endedAt: 401, reps: 9 }));
    await saveSet(db, log({ sessionId: 'mid', exerciseId: 'Other', startedAt: 250, endedAt: 251 }));

    const last = await lastSessionSets(db, ['Dumbbell_Bench_Press', 'Other', 'Never'], 'now');
    expect(last['Dumbbell_Bench_Press']?.map((r) => r.reps)).toEqual([8, 7]);
    expect(last['Other']).toHaveLength(1);
    expect(last['Never']).toBeUndefined();
    expect(lastWeights(last)).toEqual({ Dumbbell_Bench_Press: 22.5, Other: 20 });
  });
});

describe('GymDb settings (M4)', () => {
  it('counts reps out loud by default, and remembers when turned off and on', async () => {
    expect(await getSpokenCount(db)).toBe(true);
    await setSpokenCount(db, false);
    expect(await getSpokenCount(db)).toBe(false);
    await setSpokenCount(db, true);
    expect(await getSpokenCount(db)).toBe(true);
  });

  it('keeps the spoken-count setting separate from the unit', async () => {
    await setSpokenCount(db, false);
    await setUnit(db, 'lb');
    expect(await getSpokenCount(db)).toBe(false);
    expect(await getUnit(db)).toBe('lb');
  });

  it('survives reopening the database', async () => {
    await setSpokenCount(db, false);
    db.close();
    const again = new GymDb(db.name);
    await again.open();
    expect(await getSpokenCount(again)).toBe(false);
    again.close();
  });
});
