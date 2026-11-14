import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SetLog } from '../core/types';
import {
  GymDb,
  finishSession,
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
  setCoachTips,
  setCoachVoice,
  setHandsFree,
  setSpokenCount,
  setUnit,
  setsForSession,
  startSessionRow,
  updateSet,
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
      expect(up.verno).toBe(3);
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

describe('updateSet (M4c last-set correction)', () => {
  it('writes the corrected reps/partials to the logged row only', async () => {
    await saveSet(db, log({ setIndex: 0, reps: 10, partials: 1 }));
    await saveSet(db, log({ setIndex: 1, startedAt: 3000, endedAt: 4000 }));
    await saveSet(db, log({ sessionId: 'other', setIndex: 0 }));

    expect(
      await updateSet(
        db,
        { sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0 },
        { reps: 12, partials: 0 },
      ),
    ).toBe(1);
    const rows = await setsForSession(db, 's1');
    expect(rows[0]).toMatchObject({ setIndex: 0, reps: 12, weightKg: 20, startedAt: 1000 });
    expect(rows[0]).not.toHaveProperty('partials');
    expect(rows[1]).toMatchObject({ setIndex: 1, reps: 10 });
    expect((await setsForSession(db, 'other'))[0]).toMatchObject({ reps: 10 });

    await updateSet(
      db,
      { sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 1 },
      { reps: 8, partials: 2 },
    );
    expect((await setsForSession(db, 's1'))[1]).toMatchObject({ reps: 8, partials: 2 });
  });

  it('returns 0 and changes nothing when the row is missing', async () => {
    await saveSet(db, log());
    expect(
      await updateSet(
        db,
        { sessionId: 's1', exerciseId: 'Nope', setIndex: 0 },
        { reps: 1, partials: 0 },
      ),
    ).toBe(0);
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({ reps: 10 });
  });
});

describe('updateSet with a focus score (M5)', () => {
  const ref = { sessionId: 's1', exerciseId: 'Dumbbell_Bench_Press', setIndex: 0 };

  it('stores cue ids and a focus score with the set', async () => {
    await saveSet(db, log({ cues: ['rushedLowering', 'stalled'], focusScore: 85 }));
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({
      cues: ['rushedLowering', 'stalled'],
      focusScore: 85,
    });
  });

  it('writes the recomputed score with the corrected counts, leaving the cues alone', async () => {
    await saveSet(db, log({ partials: 1, cues: ['shrinkingRange'], focusScore: 85 }));
    expect(await updateSet(db, ref, { reps: 10, partials: 3, focusScore: 75 })).toBe(1);
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({
      reps: 10,
      partials: 3,
      cues: ['shrinkingRange'],
      focusScore: 75,
    });
  });

  it('removes the score when given null (a camera set corrected to 0 reps)', async () => {
    await saveSet(db, log({ cues: [], focusScore: 100 }));
    await updateSet(db, ref, { reps: 0, partials: 1, focusScore: null });
    const row = (await setsForSession(db, 's1'))[0];
    expect(row).not.toHaveProperty('focusScore');
    expect(row).toMatchObject({ reps: 0, partials: 1, cues: [] });
  });

  it('keeps the stored score when none is given (old callers, manual sets)', async () => {
    await saveSet(db, log({ focusScore: 90 }));
    await updateSet(db, ref, { reps: 8, partials: 0 });
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({ reps: 8, focusScore: 90 });
    await saveSet(db, log({ setIndex: 1, startedAt: 3000 }));
    await updateSet(db, { ...ref, setIndex: 1 }, { reps: 7, partials: 0 });
    expect((await setsForSession(db, 's1'))[1]).not.toHaveProperty('focusScore');
  });

  it('ignores a non-finite score and clamps to 0–100', async () => {
    await saveSet(db, log({ focusScore: 90 }));
    await updateSet(db, ref, { reps: 8, partials: 0, focusScore: Number.NaN });
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({ focusScore: 90 });
    await updateSet(db, ref, { reps: 8, partials: 0, focusScore: 140 });
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({ focusScore: 100 });
    await updateSet(db, ref, { reps: 8, partials: 0, focusScore: -5 });
    expect((await setsForSession(db, 's1'))[0]).toMatchObject({ focusScore: 0 });
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
