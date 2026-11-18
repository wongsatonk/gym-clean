import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SetLog } from '../core/types';
import {
  GymDb,
  finishSession,
  finishedHistorySince,
  getAccent,
  getCoachTips,
  getCoachVoice,
  getExerciseNote,
  getHandsFree,
  getSpokenCount,
  getUnit,
  lastSessionSets,
  lastWeights,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  sessionNotes,
  sessionsSince,
  setAccent,
  setCoachTips,
  setCoachVoice,
  setHandsFree,
  setSpokenCount,
  setUnit,
  setsForExercises,
  setsForSession,
  setsForSessions,
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

  it('skips warm-ups: a session with only warm-ups never hides the last working sets', async () => {
    await saveSet(
      db,
      log({ sessionId: 'work', startedAt: 100, endedAt: 101, weightKg: 20, reps: 8 }),
    );
    await saveSet(
      db,
      log({ sessionId: 'warm', startedAt: 200, endedAt: 201, weightKg: 10, reps: 8, warmup: true }),
    );
    const last = await lastSessionSets(db, ['Dumbbell_Bench_Press']);
    expect(last['Dumbbell_Bench_Press']?.map((r) => r.sessionId)).toEqual(['work']);
    expect(lastWeights(last)).toEqual({ Dumbbell_Bench_Press: 20 });
  });

  it('returns only the working sets of the last session (warm-ups reuse set indexes)', async () => {
    await saveSet(
      db,
      log({
        sessionId: 's',
        setIndex: 0,
        startedAt: 100,
        endedAt: 101,
        weightKg: 10,
        warmup: true,
      }),
    );
    await saveSet(
      db,
      log({
        sessionId: 's',
        setIndex: 1,
        startedAt: 200,
        endedAt: 201,
        weightKg: 14,
        warmup: true,
      }),
    );
    await saveSet(
      db,
      log({ sessionId: 's', setIndex: 0, startedAt: 300, endedAt: 301, weightKg: 20 }),
    );
    await saveSet(
      db,
      log({ sessionId: 's', setIndex: 1, startedAt: 400, endedAt: 401, weightKg: 20 }),
    );
    // A warm-up logged after the last working set (rare) doesn't become the last weight either.
    await saveSet(
      db,
      log({ sessionId: 's', setIndex: 2, startedAt: 500, endedAt: 501, weightKg: 8, warmup: true }),
    );
    const last = await lastSessionSets(db, ['Dumbbell_Bench_Press']);
    expect(last['Dumbbell_Bench_Press']?.map((r) => r.weightKg)).toEqual([20, 20]);
    expect(lastWeights(last)).toEqual({ Dumbbell_Bench_Press: 20 });
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

describe('GymDb v3 (M4c developer log)', () => {
  it('upgrades a v2 database without touching existing rows and adds the devlog tables', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M4c (versions 1 and 2).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'A', machineSetting: 'Seat 3', note: '' });
    await old.table('settings').put({ key: 'unit', value: 'lb' });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(3);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await getExerciseNote(up, 'A')).toMatchObject({ machineSetting: 'Seat 3' });
      expect(await getUnit(up)).toBe('lb');
      expect(await up.devlogSessions.count()).toBe(0);
      expect(await up.devlogSets.count()).toBe(0);
      expect(await up.devlogChunks.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });
});

describe('GymDb coach tips setting (M5b)', () => {
  it('shows coach tips by default, and remembers when turned off and on', async () => {
    expect(await getCoachTips(db)).toBe(true);
    await setCoachTips(db, false);
    expect(await getCoachTips(db)).toBe(false);
    await setCoachTips(db, true);
    expect(await getCoachTips(db)).toBe(true);
  });

  it('only an explicit false turns it off', async () => {
    await db.settings.put({ key: 'coachTips', value: 'off' });
    expect(await getCoachTips(db)).toBe(true);
    await db.settings.put({ key: 'coachTips', value: 0 });
    expect(await getCoachTips(db)).toBe(true);
  });

  it('is independent of the spoken-count and unit settings', async () => {
    await setCoachTips(db, false);
    expect(await getSpokenCount(db)).toBe(true);
    expect(await getUnit(db)).toBe('kg');
    await setSpokenCount(db, false);
    await setCoachTips(db, true);
    expect(await getSpokenCount(db)).toBe(false);
    expect(await getCoachTips(db)).toBe(true);
  });

  it('survives reopening the database', async () => {
    await setCoachTips(db, false);
    db.close();
    const again = new GymDb(db.name);
    await again.open();
    expect(await getCoachTips(again)).toBe(false);
    again.close();
  });
});

describe('GymDb hands-free sets setting (M5c)', () => {
  it('is on by default, and remembers when turned off and on', async () => {
    expect(await getHandsFree(db)).toBe(true);
    await setHandsFree(db, false);
    expect(await getHandsFree(db)).toBe(false);
    await setHandsFree(db, true);
    expect(await getHandsFree(db)).toBe(true);
  });

  it('only an explicit false turns it off', async () => {
    await db.settings.put({ key: 'handsFree', value: 'off' });
    expect(await getHandsFree(db)).toBe(true);
    await db.settings.put({ key: 'handsFree', value: 0 });
    expect(await getHandsFree(db)).toBe(true);
  });

  it('reads back after reopening the database', async () => {
    await setHandsFree(db, false);
    const name = db.name;
    db.close();
    db = new GymDb(name);
    expect(await getHandsFree(db)).toBe(false);
  });

  it('is independent of the coach-tips and spoken-count settings', async () => {
    await setHandsFree(db, false);
    expect(await getCoachTips(db)).toBe(true);
    expect(await getSpokenCount(db)).toBe(true);
    await setCoachTips(db, false);
    await setHandsFree(db, true);
    expect(await getCoachTips(db)).toBe(false);
    expect(await getHandsFree(db)).toBe(true);
  });
});

describe('GymDb coach voice setting (drill-sergeant design)', () => {
  it('defaults to the calm voice, Rude level, no chosen voice', async () => {
    expect(await getCoachVoice(db)).toEqual({ persona: 'calm', rudeness: 2, voiceName: null });
  });

  it('remembers persona, rudeness and voice name', async () => {
    await setCoachVoice(db, { persona: 'drill', rudeness: 3, voiceName: 'Daniel' });
    expect(await getCoachVoice(db)).toEqual({ persona: 'drill', rudeness: 3, voiceName: 'Daniel' });
    await setCoachVoice(db, { persona: 'calm', rudeness: 1, voiceName: null });
    expect(await getCoachVoice(db)).toEqual({ persona: 'calm', rudeness: 1, voiceName: null });
  });

  it('falls back field by field on a bad stored value', async () => {
    await db.settings.put({ key: 'coachVoice', value: 'drill' });
    expect(await getCoachVoice(db)).toEqual({ persona: 'calm', rudeness: 2, voiceName: null });
    await db.settings.put({
      key: 'coachVoice',
      value: { persona: 'drill', rudeness: 7, voiceName: 42 },
    });
    expect(await getCoachVoice(db)).toEqual({ persona: 'drill', rudeness: 2, voiceName: null });
    await db.settings.put({
      key: 'coachVoice',
      value: { persona: 'shouty', rudeness: 1, voiceName: 'Arthur' },
    });
    expect(await getCoachVoice(db)).toEqual({ persona: 'calm', rudeness: 1, voiceName: 'Arthur' });
  });

  it('stores a copy, not the caller object', async () => {
    const v = { persona: 'drill' as const, rudeness: 1 as const, voiceName: 'Fred' };
    await setCoachVoice(db, v);
    v.voiceName = 'Tom';
    expect((await getCoachVoice(db)).voiceName).toBe('Fred');
  });
});

describe('GymDb accent setting (M4e)', () => {
  it('defaults to orange', async () => {
    expect(await getAccent(db)).toBe('orange');
  });

  it('remembers each accent and reads it back after reopening', async () => {
    for (const a of ['volt', 'yellow', 'orange'] as const) {
      await setAccent(db, a);
      expect(await getAccent(db)).toBe(a);
    }
    await setAccent(db, 'volt');
    const name = db.name;
    db.close();
    db = new GymDb(name);
    await db.open();
    expect(await getAccent(db)).toBe('volt');
  });

  it('reads an unknown stored value as orange', async () => {
    await db.settings.put({ key: 'accent', value: 'pink' });
    expect(await getAccent(db)).toBe('orange');
    await db.settings.put({ key: 'accent', value: 3 });
    expect(await getAccent(db)).toBe('orange');
  });

  it('is independent of the unit setting', async () => {
    await setAccent(db, 'yellow');
    expect(await getUnit(db)).toBe('kg');
    await setUnit(db, 'lb');
    expect(await getAccent(db)).toBe('yellow');
  });
});

describe('GymDb history queries (M4e)', () => {
  it('sessionsSince returns sessions started at or after the time, oldest first', async () => {
    await startSessionRow(db, { sessionId: 'b', dayId: 'pull-a', startedAt: 3000, endedAt: 4000 });
    await startSessionRow(db, { sessionId: 'a', dayId: 'push-a', startedAt: 1000, endedAt: 2000 });
    await startSessionRow(db, { sessionId: 'c', dayId: 'legs', startedAt: 5000 });
    await startSessionRow(db, { sessionId: 'old', dayId: 'legs', startedAt: 999 });
    const rows = await sessionsSince(db, 1000);
    expect(rows.map((r) => r.sessionId)).toEqual(['a', 'b', 'c']);
    expect(rows[1]).toEqual({ sessionId: 'b', dayId: 'pull-a', startedAt: 3000, endedAt: 4000 });
    expect(await sessionsSince(db, 6000)).toEqual([]);
  });

  it('setsForSessions returns the sets of those sessions in start order', async () => {
    await saveSet(db, log({ sessionId: 's2', startedAt: 9000 }));
    await saveSet(db, log({ sessionId: 's1', setIndex: 1, startedAt: 5000 }));
    await saveSet(db, log({ sessionId: 's1', startedAt: 1000 }));
    await saveSet(db, log({ sessionId: 's3', startedAt: 3000 }));
    const rows = await setsForSessions(db, ['s1', 's2', 's1']);
    expect(rows.map((r) => [r.sessionId, r.startedAt])).toEqual([
      ['s1', 1000],
      ['s1', 5000],
      ['s2', 9000],
    ]);
    expect(await setsForSessions(db, [])).toEqual([]);
  });

  it('setsForExercises returns every set of those exercises in start order', async () => {
    await saveSet(db, log({ exerciseId: 'Pushups', weightKg: 0, startedAt: 7000 }));
    await saveSet(db, log({ sessionId: 's0', startedAt: 500 }));
    await saveSet(db, log({ startedAt: 2000 }));
    await saveSet(db, log({ exerciseId: 'Other', startedAt: 100 }));
    const rows = await setsForExercises(db, ['Dumbbell_Bench_Press', 'Pushups']);
    expect(rows.map((r) => [r.exerciseId, r.startedAt])).toEqual([
      ['Dumbbell_Bench_Press', 500],
      ['Dumbbell_Bench_Press', 2000],
      ['Pushups', 7000],
    ]);
    expect(await setsForExercises(db, [])).toEqual([]);
  });

  it('finishedHistorySince returns finished sessions since the time and only their sets', async () => {
    await startSessionRow(db, { sessionId: 'old', dayId: 'legs', startedAt: 500, endedAt: 900 });
    await startSessionRow(db, { sessionId: 'a', dayId: 'push-a', startedAt: 1000, endedAt: 2000 });
    await startSessionRow(db, { sessionId: 'open', dayId: 'pull-a', startedAt: 3000 });
    await startSessionRow(db, { sessionId: 'b', dayId: 'legs', startedAt: 4000, endedAt: 5000 });
    await saveSet(db, log({ sessionId: 'old', startedAt: 600 }));
    await saveSet(db, log({ sessionId: 'b', startedAt: 4100 }));
    await saveSet(db, log({ sessionId: 'open', startedAt: 3100 }));
    await saveSet(db, log({ sessionId: 'a', startedAt: 1100 }));
    const { sessions, sets } = await finishedHistorySince(db, 1000);
    expect(sessions.map((r) => r.sessionId)).toEqual(['a', 'b']);
    expect(sets.map((r) => [r.sessionId, r.startedAt])).toEqual([
      ['a', 1100],
      ['b', 4100],
    ]);
    expect(await finishedHistorySince(db, 6000)).toEqual({ sessions: [], sets: [] });
  });
});

describe('GymDb v4 (M10 trainer)', () => {
  it('upgrades a v3 database without touching existing rows and adds the trainer tables', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M10 (versions 1–3).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('settings').put({ key: 'unit', value: 'lb' });
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(4);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.trainer.count()).toBe(0);
      expect(await up.planChanges.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('stores a session’s adjust actions (lighter/deload sessions)', async () => {
    await startSessionRow(db, {
      sessionId: 's9',
      dayId: 'push-a',
      startedAt: 1000,
      adjust: ['lighter'],
    });
    await finishSession(db, 's9', 2000, { setsDone: 3 });
    expect(await db.sessions.get('s9')).toMatchObject({ adjust: ['lighter'], endedAt: 2000 });
  });
});

describe('GymDb v5 (M7 nutrition)', () => {
  it('upgrades a v4 database keeping every existing row and adds the empty nutrition tables', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M7 (versions 1–4).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').put({ key: 'unit', value: 'lb' });
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(5);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      for (const t of [
        up.foods,
        up.recipes,
        up.foodEntries,
        up.weighIns,
        up.favorites,
        up.weeklyChecks,
      ])
        expect(await t.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('indexes the nutrition tables as planned', () => {
    const idx = (t: string): string[] => {
      const s = db.table(t).schema;
      return [s.primKey.name, ...s.indexes.map((i) => i.name)];
    };
    expect(idx('foods')).toEqual(['id', 'name', 'barcode']);
    expect(idx('recipes')).toEqual(['id']);
    expect(idx('foodEntries')).toEqual(['id', 'date', 'time']);
    expect(idx('weighIns')).toEqual(['date']);
    expect(idx('favorites')).toEqual(['id', 'createdAt']);
    expect(idx('weeklyChecks')).toEqual(['weekStart']);
  });
});

describe('GymDb v6 (M7b food photos)', () => {
  it('upgrades a v5 database keeping every existing row and adds the empty photo tables', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M7b (versions 1–5).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').bulkPut([
      { key: 'unit', value: 'lb' },
      { key: 'nutrition', value: { mode: 'quick' } },
    ]);
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    await old.table('foods').put({ id: 'f1', name: 'Made-up food', barcode: '123' });
    await old.table('recipes').put({ id: 'r1' });
    await old.table('foodEntries').put({ id: 'fe1', date: '2026-11-15', time: 7 });
    await old.table('weighIns').put({ date: '2026-11-15', kg: 70 });
    await old.table('favorites').put({ id: 'fav1', createdAt: 8 });
    await old.table('weeklyChecks').put({ weekStart: '2026-11-09' });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(6);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.settings.get('nutrition')).toEqual({
        key: 'nutrition',
        value: { mode: 'quick' },
      });
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      expect(await up.foods.get('f1')).toMatchObject({ name: 'Made-up food' });
      expect(await up.recipes.count()).toBe(1);
      expect(await up.foodEntries.get('fe1')).toMatchObject({ date: '2026-11-15' });
      expect(await up.weighIns.get('2026-11-15')).toMatchObject({ kg: 70 });
      expect(await up.favorites.count()).toBe(1);
      expect(await up.weeklyChecks.count()).toBe(1);
      expect(await up.foodModels.count()).toBe(0);
      expect(await up.foodPhotos.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('indexes the photo tables as planned', () => {
    const idx = (t: string): string[] => {
      const s = db.table(t).schema;
      return [s.primKey.name, ...s.indexes.map((i) => i.name)];
    };
    expect(idx('foodModels')).toEqual(['id']);
    expect(idx('foodPhotos')).toEqual(['id', 'createdAt', 'dishId']);
  });
});

describe('GymDb v7 (M11 health)', () => {
  it('upgrades a v6 database keeping every existing row and adds an empty healthDays table', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M11 (versions 1–6).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    old.version(6).stores({
      foodModels: 'id',
      foodPhotos: 'id, createdAt, dishId',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').bulkPut([
      { key: 'unit', value: 'lb' },
      { key: 'nutrition', value: { mode: 'quick' } },
      { key: 'foodVision', value: { savePhotos: true } },
    ]);
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    await old.table('foods').put({ id: 'f1', name: 'Made-up food', barcode: '123' });
    await old.table('recipes').put({ id: 'r1' });
    await old.table('foodEntries').put({ id: 'fe1', date: '2026-11-15', time: 7 });
    await old.table('weighIns').put({ date: '2026-11-15', kg: 70 });
    await old.table('favorites').put({ id: 'fav1', createdAt: 8 });
    await old.table('weeklyChecks').put({ weekStart: '2026-11-09' });
    await old.table('foodModels').put({ id: 'food', name: 'm', sizeBytes: 1 });
    await old.table('foodPhotos').put({ id: 'p1', createdAt: 9, dishId: 'thai:x' });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(7);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.settings.count()).toBe(3);
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      expect(await up.foods.get('f1')).toMatchObject({ name: 'Made-up food' });
      expect(await up.recipes.count()).toBe(1);
      expect(await up.foodEntries.count()).toBe(1);
      // An old weigh-in has no source: it reads as typed by hand (manual).
      expect(await up.weighIns.get('2026-11-15')).toEqual({ date: '2026-11-15', kg: 70 });
      expect(await up.favorites.count()).toBe(1);
      expect(await up.weeklyChecks.count()).toBe(1);
      expect(await up.foodModels.count()).toBe(1);
      expect(await up.foodPhotos.count()).toBe(1);
      expect(await up.healthDays.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('keys healthDays by date', async () => {
    const s = db.table('healthDays').schema;
    expect([s.primKey.name, ...s.indexes.map((i) => i.name)]).toEqual(['date']);
    await db.healthDays.put({ date: '2030-01-07', sleepMin: 400 });
    await db.healthDays.put({ date: '2030-01-07', sleepMin: 410 });
    expect(await db.healthDays.toArray()).toEqual([{ date: '2030-01-07', sleepMin: 410 }]);
  });
});

describe('GymDb v8 (M12 chat)', () => {
  it('upgrades a v7 database keeping every existing row and adds an empty chatMessages table', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before M12 (versions 1–7).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    old.version(6).stores({
      foodModels: 'id',
      foodPhotos: 'id, createdAt, dishId',
    });
    old.version(7).stores({
      healthDays: 'date',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').bulkPut([
      { key: 'unit', value: 'lb' },
      { key: 'nutrition', value: { mode: 'quick' } },
      { key: 'health', value: { enabled: { sleep: true } } },
    ]);
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    await old.table('foods').put({ id: 'f1', name: 'Made-up food', barcode: '123' });
    await old.table('recipes').put({ id: 'r1' });
    await old.table('foodEntries').put({ id: 'fe1', date: '2026-11-15', time: 7 });
    await old.table('weighIns').put({ date: '2026-11-15', kg: 70, source: 'health' });
    await old.table('favorites').put({ id: 'fav1', createdAt: 8 });
    await old.table('weeklyChecks').put({ weekStart: '2026-11-09' });
    await old.table('foodModels').put({ id: 'food', name: 'm', sizeBytes: 1 });
    await old.table('foodPhotos').put({ id: 'p1', createdAt: 9, dishId: 'thai:x' });
    await old.table('healthDays').put({ date: '2026-11-15', sleepMin: 400 });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(8);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.settings.count()).toBe(3);
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      expect(await up.foods.get('f1')).toMatchObject({ name: 'Made-up food' });
      expect(await up.recipes.count()).toBe(1);
      expect(await up.foodEntries.count()).toBe(1);
      expect(await up.weighIns.get('2026-11-15')).toEqual({
        date: '2026-11-15',
        kg: 70,
        source: 'health',
      });
      expect(await up.favorites.count()).toBe(1);
      expect(await up.weeklyChecks.count()).toBe(1);
      expect(await up.foodModels.count()).toBe(1);
      expect(await up.foodPhotos.count()).toBe(1);
      expect(await up.healthDays.get('2026-11-15')).toEqual({ date: '2026-11-15', sleepMin: 400 });
      expect(await up.chatMessages.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('keys chatMessages by an auto id with a createdAt index', async () => {
    const s = db.table('chatMessages').schema;
    expect(s.primKey.name).toBe('id');
    expect(s.primKey.auto).toBe(true);
    expect(s.indexes.map((i) => i.name)).toEqual(['createdAt']);
  });
});

describe('GymDb v9 (M12 slice 1c to-dos)', () => {
  it('upgrades a v8 database keeping every existing row and adds an empty todoAnswers table', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before slice 1c (versions 1–8).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    old.version(6).stores({
      foodModels: 'id',
      foodPhotos: 'id, createdAt, dishId',
    });
    old.version(7).stores({
      healthDays: 'date',
    });
    old.version(8).stores({
      chatMessages: '++id, createdAt',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').bulkPut([
      { key: 'unit', value: 'lb' },
      { key: 'coach', value: { answeredMissed: ['2026-11-10'] } },
      { key: 'health', value: { enabled: { sleep: true } } },
    ]);
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    await old.table('foods').put({ id: 'f1', name: 'Made-up food', barcode: '123' });
    await old.table('recipes').put({ id: 'r1' });
    await old.table('foodEntries').put({ id: 'fe1', date: '2026-11-15', time: 7 });
    await old.table('weighIns').put({ date: '2026-11-15', kg: 70, source: 'health' });
    await old.table('favorites').put({ id: 'fav1', createdAt: 8 });
    await old.table('weeklyChecks').put({ weekStart: '2026-11-09' });
    await old.table('foodModels').put({ id: 'food', name: 'm', sizeBytes: 1 });
    await old.table('foodPhotos').put({ id: 'p1', createdAt: 9, dishId: 'thai:x' });
    await old.table('healthDays').put({ date: '2026-11-15', sleepMin: 400 });
    await old.table('chatMessages').bulkAdd([
      { createdAt: 10, role: 'user', text: 'made-up', source: 'chip', phase: 'today' },
      { createdAt: 11, role: 'coach', text: 'made-up reply', source: 'rules', phase: 'today' },
    ]);
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(9);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.settings.count()).toBe(3);
      expect((await up.settings.get('coach'))?.value).toEqual({ answeredMissed: ['2026-11-10'] });
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      expect(await up.foods.get('f1')).toMatchObject({ name: 'Made-up food' });
      expect(await up.recipes.count()).toBe(1);
      expect(await up.foodEntries.count()).toBe(1);
      expect(await up.weighIns.get('2026-11-15')).toEqual({
        date: '2026-11-15',
        kg: 70,
        source: 'health',
      });
      expect(await up.favorites.count()).toBe(1);
      expect(await up.weeklyChecks.count()).toBe(1);
      expect(await up.foodModels.count()).toBe(1);
      expect(await up.foodPhotos.count()).toBe(1);
      expect(await up.healthDays.get('2026-11-15')).toEqual({ date: '2026-11-15', sleepMin: 400 });
      expect((await up.chatMessages.toArray()).map((m) => m.text)).toEqual([
        'made-up',
        'made-up reply',
      ]);
      expect(await up.todoAnswers.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('keys todoAnswers by id with topicId, at and sentAt indexes', async () => {
    const s = db.table('todoAnswers').schema;
    expect(s.primKey.name).toBe('id');
    expect(s.primKey.auto).toBe(false);
    expect(s.indexes.map((i) => i.name)).toEqual(['topicId', 'at', 'sentAt']);
  });
});

describe('GymDb v10 (M12 slice 1b trainer kit)', () => {
  it('upgrades a v9 database keeping every existing row and adds the four empty tables', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before slice 1b (versions 1–9).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    old.version(6).stores({
      foodModels: 'id',
      foodPhotos: 'id, createdAt, dishId',
    });
    old.version(7).stores({
      healthDays: 'date',
    });
    old.version(8).stores({
      chatMessages: '++id, createdAt',
    });
    old.version(9).stores({
      todoAnswers: 'id, topicId, at, sentAt',
    });
    await old.open();
    await old.table('sessions').put({ sessionId: 's1', dayId: 'push-a', startedAt: 1000 });
    await old.table('sets').add(log());
    await old.table('exerciseNotes').put({ exerciseId: 'e1', machineSetting: 'seat 4', note: '' });
    await old
      .table('sessionNotes')
      .put({ sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 });
    await old.table('settings').bulkPut([
      { key: 'unit', value: 'lb' },
      { key: 'coach', value: { answeredMissed: ['2026-11-10'] } },
      { key: 'health', value: { enabled: { sleep: true } } },
      { key: 'trainerKit', value: { reviewWeeks: 6 } },
    ]);
    await old.table('devlogSessions').put({ id: 'd1', startedAt: 1000 });
    await old.table('devlogSets').put({ key: 'k1', sessionId: 'd1', seq: 0 });
    await old.table('devlogChunks').add({ sessionId: 'd1', setKey: 'k1', bytes: 3 });
    await old.table('trainer').put({ key: 'current', state: { made: 'up' } });
    await old.table('planChanges').add({ createdAt: 5, kind: 'made-up' });
    await old.table('foods').put({ id: 'f1', name: 'Made-up food', barcode: '123' });
    await old.table('recipes').put({ id: 'r1' });
    await old.table('foodEntries').put({ id: 'fe1', date: '2026-11-15', time: 7 });
    await old.table('weighIns').put({ date: '2026-11-15', kg: 70, source: 'health' });
    await old.table('favorites').put({ id: 'fav1', createdAt: 8 });
    await old.table('weeklyChecks').put({ weekStart: '2026-11-09' });
    await old.table('foodModels').put({ id: 'food', name: 'm', sizeBytes: 1 });
    await old.table('foodPhotos').put({ id: 'p1', createdAt: 9, dishId: 'thai:x' });
    await old.table('healthDays').put({ date: '2026-11-15', sleepMin: 400 });
    await old.table('chatMessages').bulkAdd([
      { createdAt: 10, role: 'user', text: 'made-up', source: 'chip', phase: 'today' },
      { createdAt: 11, role: 'coach', text: 'made-up reply', source: 'rules', phase: 'today' },
    ]);
    await old.table('todoAnswers').put({
      id: 'ask:t:s:1',
      topicId: 't',
      stepId: 's',
      kind: 'ask',
      optionIds: ['yes'],
      at: 12,
      release: '1.12.0',
    });
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(10);
      expect(await up.sessions.get('s1')).toMatchObject({ dayId: 'push-a' });
      expect(await setsForSession(up, 's1')).toHaveLength(1);
      expect(await up.exerciseNotes.get('e1')).toMatchObject({ machineSetting: 'seat 4' });
      expect(await up.sessionNotes.count()).toBe(1);
      expect(await getUnit(up)).toBe('lb');
      expect(await up.settings.count()).toBe(4);
      expect((await up.settings.get('trainerKit'))?.value).toEqual({ reviewWeeks: 6 });
      expect(await up.devlogSessions.count()).toBe(1);
      expect(await up.devlogSets.count()).toBe(1);
      expect(await up.devlogChunks.count()).toBe(1);
      expect(await up.trainer.get('current')).toMatchObject({ state: { made: 'up' } });
      expect(await up.planChanges.count()).toBe(1);
      expect(await up.foods.get('f1')).toMatchObject({ name: 'Made-up food' });
      expect(await up.recipes.count()).toBe(1);
      expect(await up.foodEntries.count()).toBe(1);
      expect(await up.weighIns.get('2026-11-15')).toEqual({
        date: '2026-11-15',
        kg: 70,
        source: 'health',
      });
      expect(await up.favorites.count()).toBe(1);
      expect(await up.weeklyChecks.count()).toBe(1);
      expect(await up.foodModels.count()).toBe(1);
      expect(await up.foodPhotos.count()).toBe(1);
      expect(await up.healthDays.get('2026-11-15')).toEqual({ date: '2026-11-15', sleepMin: 400 });
      expect((await up.chatMessages.toArray()).map((m) => m.text)).toEqual([
        'made-up',
        'made-up reply',
      ]);
      expect(await up.todoAnswers.get('ask:t:s:1')).toMatchObject({ topicId: 't', at: 12 });
      expect(await up.measurements.count()).toBe(0);
      expect(await up.goals.count()).toBe(0);
      expect(await up.dayFeels.count()).toBe(0);
      expect(await up.progressPhotos.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('indexes the trainer-kit tables as planned', () => {
    const m = db.table('measurements').schema;
    expect(m.primKey.keyPath).toEqual(['date', 'site']);
    expect(m.primKey.auto).toBe(false);
    expect(m.indexes.map((i) => i.name)).toEqual(['date']);
    const g = db.table('goals').schema;
    expect(g.primKey.name).toBe('id');
    expect(g.indexes.map((i) => i.name)).toEqual(['createdAt']);
    const f = db.table('dayFeels').schema;
    expect(f.primKey.name).toBe('date');
    expect(f.indexes).toEqual([]);
    const p = db.table('progressPhotos').schema;
    expect(p.primKey.name).toBe('id');
    expect(p.primKey.auto).toBe(false);
    expect(p.indexes.map((i) => i.name)).toEqual(['date', 'createdAt']);
  });

  it('round-trips a row of each new table, and effort / warm-up on a set (unindexed)', async () => {
    await db.measurements.put({ date: '2026-11-17', site: 'waist', cm: 80 });
    await db.measurements.put({ date: '2026-11-17', site: 'waist', cm: 79.5 });
    await db.measurements.put({ date: '2026-11-17', site: 'chest', cm: 95 });
    expect(await db.measurements.count()).toBe(2);
    expect(await db.measurements.get(['2026-11-17', 'waist'])).toEqual({
      date: '2026-11-17',
      site: 'waist',
      cm: 79.5,
    });
    const goal = {
      id: 'g1',
      text: 'Made-up goal',
      target: { kind: 'lift' as const, ref: 'e1', value: 40, reps: 8 },
      due: '2027-02-01',
      createdAt: 5,
    };
    await db.goals.put(goal);
    expect(await db.goals.get('g1')).toEqual(goal);
    await db.dayFeels.put({ date: '2026-11-17', energy: 2, sore: ['legs'] });
    expect(await db.dayFeels.get('2026-11-17')).toEqual({
      date: '2026-11-17',
      energy: 2,
      sore: ['legs'],
    });
    await db.progressPhotos.put({
      id: 'p1',
      date: '2026-11-17',
      createdAt: 6,
      blob: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }),
      pose: 'front',
    });
    expect(await db.progressPhotos.get('p1')).toMatchObject({ date: '2026-11-17', pose: 'front' });
    await saveSet(db, log({ effort: 'easy' }));
    await saveSet(db, log({ setIndex: 1, warmup: true, startedAt: 3000 }));
    const sets = await setsForSession(db, 's1');
    expect(sets.map((s) => [s.effort, s.warmup])).toEqual([
      ['easy', undefined],
      [undefined, true],
    ]);
  });
});

describe('GymDb v11 (M12 slice 2 weekly check-in)', () => {
  it('upgrades a v10 database keeping every existing row and adds an empty checkIns table', async () => {
    const name = `upgrade-${n++}`;
    // The schema exactly as shipped before slice 2 (versions 1–10).
    const old = new Dexie(name);
    old.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    old.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    old.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    old.version(4).stores({ trainer: 'key', planChanges: '++id, createdAt' });
    old.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    old.version(6).stores({ foodModels: 'id', foodPhotos: 'id, createdAt, dishId' });
    old.version(7).stores({ healthDays: 'date' });
    old.version(8).stores({ chatMessages: '++id, createdAt' });
    old.version(9).stores({ todoAnswers: 'id, topicId, at, sentAt' });
    old.version(10).stores({
      measurements: '[date+site], date',
      goals: 'id, createdAt',
      dayFeels: 'date',
      progressPhotos: 'id, date, createdAt',
    });
    await old.open();
    // One made-up row in every v10 table.
    const rows: [string, unknown][] = [
      ['sessions', { sessionId: 's1', dayId: 'push-a', startedAt: 1000 }],
      ['exerciseNotes', { exerciseId: 'e1', machineSetting: 'seat 4', note: '' }],
      ['sessionNotes', { sessionId: 's1', exerciseId: 'e1', note: 'n', updatedAt: 1 }],
      ['settings', { key: 'reminders', value: { session: { on: true, time: '07:00' } } }],
      ['devlogSessions', { id: 'd1', startedAt: 1000 }],
      ['devlogSets', { key: 'k1', sessionId: 'd1', seq: 0 }],
      ['devlogChunks', { sessionId: 'd1', setKey: 'k1', bytes: 3 }],
      ['trainer', { key: 'current', state: { made: 'up' } }],
      ['planChanges', { createdAt: 5, kind: 'made-up' }],
      ['foods', { id: 'f1', name: 'Made-up food', barcode: '123' }],
      ['recipes', { id: 'r1' }],
      ['foodEntries', { id: 'fe1', date: '2026-11-15', time: 7 }],
      ['weighIns', { date: '2026-11-15', kg: 70, source: 'health' }],
      ['favorites', { id: 'fav1', createdAt: 8 }],
      ['weeklyChecks', { weekStart: '2026-11-09' }],
      ['foodModels', { id: 'food', name: 'm', sizeBytes: 1 }],
      ['foodPhotos', { id: 'p1', createdAt: 9, dishId: 'thai:x' }],
      ['healthDays', { date: '2026-11-15', sleepMin: 400 }],
      [
        'chatMessages',
        { createdAt: 10, role: 'user', text: 'made-up', source: 'chip', phase: 'today' },
      ],
      [
        'todoAnswers',
        { id: 'ask:t:s:1', topicId: 't', stepId: 's', kind: 'ask', at: 12, release: '1.13.0' },
      ],
      ['measurements', { date: '2026-11-17', site: 'waist', cm: 80 }],
      ['goals', { id: 'g1', text: 'Made-up goal', createdAt: 5 }],
      ['dayFeels', { date: '2026-11-17', energy: 2 }],
      ['progressPhotos', { id: 'pp1', date: '2026-11-17', createdAt: 6, pose: 'front' }],
    ];
    for (const [table, value] of rows) await old.table(table).add(value);
    await old.table('sets').add(log());
    const before: Record<string, unknown[]> = {};
    for (const t of old.tables) before[t.name] = await t.toArray();
    old.close();

    const up = new GymDb(name);
    await up.open();
    try {
      expect(up.verno).toBeGreaterThanOrEqual(11);
      for (const [table, want] of Object.entries(before))
        expect(await up.table(table).toArray(), table).toEqual(want);
      expect(Object.values(before).every((r) => r.length === 1)).toBe(true);
      expect(await up.checkIns.count()).toBe(0);
    } finally {
      up.close();
      await up.delete();
    }
  });

  it('keys checkIns by weekStart, no other index', () => {
    const c = db.table('checkIns').schema;
    expect(c.primKey.name).toBe('weekStart');
    expect(c.primKey.auto).toBe(false);
    expect(c.indexes).toEqual([]);
  });

  it('round-trips a check-in row', async () => {
    const row = { weekStart: '2026-11-16', energy: 4 as const, sleep: 3 as const, at: 7 };
    await db.checkIns.put(row);
    expect(await db.checkIns.get('2026-11-16')).toEqual(row);
  });
});
