import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FACT_COUNTS, FACT_FLAGS } from '../../core/todo/detectors';
import type { SetLog, TrainerState } from '../../core/types';
import { GymDb } from '../db';
import { startDevLogSession } from '../devlog';
import { gatherFacts } from './facts';
import { saveIntake, saveMeasurement } from '../trainerKit/store';
import { saveCheckIn, skipCheckIn } from '../checkIn/store';
import { noteBuildSeen, noteSignal } from './store';

// Made-up data only (public repo). Values are distinctive so a leak would be found by text search.
const day = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const NOW = day(16, 20);

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`facts-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const STATE = {
  version: 1,
  plan: { days: [], seededFrom: 'x', edited: false },
  schedule: { rotation: [], restWeekdays: [] },
  overrides: [],
} as TrainerState;

function set(sessionId: string, exerciseId: string, i: number, camera: boolean): SetLog {
  return {
    sessionId,
    exerciseId,
    setIndex: i,
    reps: 9,
    weightKg: 23.75,
    restTakenSec: 97,
    ...(camera ? { cues: [], focusScore: 88 } : {}),
    startedAt: day(10) + i,
    endedAt: day(10) + i + 1,
  };
}

async function seed(): Promise<void> {
  // Chat: 2 questions from him, 1 coach reply.
  for (const [role, text] of [
    ['user', 'Made-up chat line one'],
    ['coach', 'Made-up coach reply'],
    ['user', 'Made-up chat line two'],
  ] as const)
    await db.chatMessages.add({ createdAt: day(12), role, text, source: 'rules', phase: 'today' });

  // Plan changes: postpone (later undone), swap, lighter, and a reset (not a coach proposal).
  for (const [action, undoneAt] of [
    ['postpone', day(13)],
    ['swap', undefined],
    ['lighter', undefined],
    ['reset', undefined],
  ] as const)
    await db.planChanges.add({
      createdAt: day(12),
      action,
      title: `Made-up change ${action}`,
      source: 'chip',
      before: STATE,
      after: STATE,
      ...(undoneAt ? { undoneAt } : {}),
    });

  // Health: on, 5 days with data in the last 7 + one empty row + one too old; a Health weigh-in.
  await db.settings.put({ key: 'health', value: { enabled: { sleep: true } } });
  for (const d of [10, 11, 12, 14, 16])
    await db.healthDays.put({ date: `2026-11-${d}`, sleepMin: 431, restingHr: 57 });
  await db.healthDays.put({ date: '2026-11-13' });
  await db.healthDays.put({ date: '2026-11-08', hrvMs: 63 });
  await db.weighIns.put({ date: '2026-11-15', kg: 72.4, source: 'health' });
  await db.weighIns.put({ date: '2026-11-09', kg: 72.6, source: 'health' }); // too old
  await db.weighIns.put({ date: '2026-11-13', kg: 72.5 }); // typed, not Health

  // Sessions: s1 camera-heavy (7 camera sets, 3 learning exercises), legs-b with the swap,
  // legs-b with the leg press, an unfinished one.
  await db.sessions.bulkPut([
    { sessionId: 's1', dayId: 'pull-a', startedAt: day(10), endedAt: day(10, 13) },
    { sessionId: 's2', dayId: 'legs-b', startedAt: day(14), endedAt: day(14, 13) },
    { sessionId: 's3', dayId: 'legs-b', startedAt: day(15), endedAt: day(15, 13) },
    { sessionId: 's4', dayId: 'push-a', startedAt: day(16) },
  ]);
  const ids = [
    'Hammer_Curls',
    'Hammer_Curls',
    'Concentration_Curls',
    'Bent_Over_Two-Dumbbell_Row',
    'Dumbbell_Bicep_Curl',
    'Dumbbell_Bicep_Curl',
    'Pushups',
  ];
  await db.sets.bulkAdd(ids.map((id, i) => set('s1', id, i, true)));
  await db.sets.add(set('s1', 'Leg_Extensions', 9, false));
  await db.sets.add(set('s2', 'Hack_Squat', 0, false));
  await db.sets.add(set('s2', 'Leg_Extensions', 1, false));
  await db.sets.add(set('s3', 'Leg_Press', 0, false));
  await db.sets.add(set('s4', 'Incline_Dumbbell_Curl', 0, true));

  // Food: the model, photo meals on 2 days (two on one), one typed meal.
  await db.foodModels.put({
    id: 'food',
    name: 'made-up.tflite',
    sizeBytes: 1,
    labels: ['a'],
    importedAt: day(9),
    blob: new Blob([new Uint8Array([1])]),
  });
  const entry = (id: string, date: string, source?: 'photo-local' | 'photo-ai') => ({
    id,
    date,
    time: day(12),
    slot: 'lunch' as const,
    label: `Made-up dish ${id}`,
    amount: { servings: 1 },
    estimate: true,
    kcal: 2150.5,
    proteinG: 41.3,
    ...(source ? { source } : {}),
  });
  await db.foodEntries.bulkPut([
    entry('f1', '2026-11-12', 'photo-local'),
    entry('f2', '2026-11-12', 'photo-ai'),
    entry('f3', '2026-11-14', 'photo-local'),
    entry('f4', '2026-11-15'),
  ]);

  // Signing + Calendar signal.
  await db.settings.put({ key: 'signing', value: { signing: 'paid' } });
  await noteSignal(db, 'calendarAfterSession', day(14, 20));

  // Dev log: one workout with an auto start (hands-free), one without.
  const hf = await startDevLogSession(db, { id: 'd1', dayId: 'pull-a', settings: {} }, { now: () => day(10) });
  hf.logEvent('autoSet', { action: 'start', reps: 2, partials: 0 });
  hf.logEvent('SET_DONE', { now: 1 });
  await hf.finish(day(10, 13));
  const manual = await startDevLogSession(db, { id: 'd2', dayId: 'legs-b', settings: {} }, { now: () => day(14) });
  manual.logEvent('SET_DONE', { now: 1 });
  await manual.finish(day(14, 13));
}

/** M12 slice 1b rows: effort taps, warm-up sets, the intake, tape measurements, body fat / lean mass. */
async function seedKit(): Promise<void> {
  // s1: 2 warm-up sets (one wrongly carrying an effort: not counted) + 3 working sets with effort.
  // s2: 1 warm-up set + 1 working set with effort. Sets without `cues` (no camera counts change).
  const kit = (sessionId: string, i: number, extra: Partial<SetLog>): SetLog => ({
    ...set(sessionId, sessionId === 's1' ? 'Leg_Extensions' : 'Hack_Squat', i, false),
    ...extra,
  });
  await db.sets.bulkAdd([
    kit('s1', 20, { warmup: true }),
    kit('s1', 21, { warmup: true, effort: 'easy' }),
    kit('s1', 22, { effort: 'easy' }),
    kit('s1', 23, { effort: 'good' }),
    kit('s1', 24, { effort: 'hard' }),
    kit('s2', 20, { warmup: true }),
    kit('s2', 21, { effort: 'good' }),
    kit('s2', 22, { effort: 'bogus' as unknown as 'good' }),
  ]);

  await saveIntake(db, {
    goalKind: 'strength',
    goalText: 'Made-up goal words',
    days: 4,
    sessionMin: 45,
    experience: 'some',
    easyOn: ['shoulders'],
    at: day(11),
  });

  await saveMeasurement(db, { date: '2026-11-01', site: 'waist', cm: 81.25 });
  await saveMeasurement(db, { date: '2026-11-01', site: 'chest', cm: 97.75 });
  await saveMeasurement(db, { date: '2026-10-01', site: 'waist', cm: 82.25 });

  // Body fat / lean mass days, all outside the 7-day Health window (healthDays7 stays as it was):
  // one with both, one with lean mass only, one with a bad value, one without either.
  await db.healthDays.put({ date: '2026-10-20', bodyFatPct: 18.6, leanMassKg: 59.3 });
  await db.healthDays.put({ date: '2026-10-21', leanMassKg: 59.4 });
  await db.healthDays.put({ date: '2026-10-22', bodyFatPct: Number.NaN });
  await db.healthDays.put({ date: '2026-10-23', sleepMin: 431 });
}

/** M12 slice 2: Apple replies, mic messages, reminders, check-ins (made-up). */
async function seedSlice2(): Promise<void> {
  const msg = (role: 'user' | 'coach', source: 'rules' | 'apple', viaMic = false) =>
    db.chatMessages.add({
      createdAt: day(15),
      role,
      text: `Made-up ${role} ${source}`,
      source,
      phase: 'today',
      ...(viaMic ? { viaMic: true as const } : {}),
    });
  // 3 Apple replies, 1 rules reply; 2 mic-sent messages, 1 typed.
  for (let i = 0; i < 3; i++) await msg('coach', 'apple');
  await msg('coach', 'rules');
  await msg('user', 'rules', true);
  await msg('user', 'rules', true);
  await msg('user', 'rules');
  // A coach message wrongly marked viaMic does not count as his mic use.
  await msg('coach', 'apple', true);
  await db.settings.put({
    key: 'reminders',
    value: { session: { on: false, time: '06:47' }, missedDay: { on: false }, sundayRecap: { on: true } },
  });
  // 2 answered weeks, 1 skipped.
  await saveCheckIn(db, { weekStart: '2026-11-02', energy: 4, sleep: 3 }, day(2));
  await saveCheckIn(db, { weekStart: '2026-11-09', soreness: 2 }, day(9));
  await skipCheckIn(db, '2026-11-16', day(16));
}

describe('gatherFacts', () => {
  it('counts what the detectors need from a made-up db', async () => {
    await seed();
    await seedKit();
    await noteBuildSeen(db, 'build-old', day(9));
    await noteBuildSeen(db, 'build-new', day(14, 8));
    const f = await gatherFacts(db, 'native', NOW);
    expect(f.platform).toBe('native');
    expect(f.now).toBe(NOW);
    expect(f.counts).toEqual({
      chatQuestions: 2,
      proposalOutcomes: 3,
      coachChanges: 2,
      healthDays7: 6,
      nativeSessions: 3,
      handsFreeSessions: 1,
      maxCameraSetsInSession: 7,
      learningCameraExercises: 4,
      photoMealDays: 2,
      legSwapSessions: 1,
      effortSets: 4,
      warmupSessions: 2,
      measurements: 3,
      bodyCompDays: 2,
      appleReplies: 0,
      micMessages: 0,
      checkInsDone: 0,
    });
    expect(f.flags).toEqual({
      calendarAfterSession: true,
      healthConnected: true,
      foodModel: true,
      signingPaid: true,
      intakeDone: true,
      reminderOn: false,
    });
    // Latest-noted build = the running one unless told otherwise.
    expect(f.buildFirstSeenAt).toBe(day(14, 8));
    expect((await gatherFacts(db, 'native', NOW, { buildId: 'build-old' })).buildFirstSeenAt).toBe(
      day(9),
    );
  });

  it('counts only sessions since the first iPhone-app launch', async () => {
    await seed();
    await noteBuildSeen(db, 'b', day(13));
    expect((await gatherFacts(db, 'native', NOW)).counts.nativeSessions).toBe(2);
  });

  it('trainer-kit facts are 0 / false without their rows (old data has no effort or warm-ups)', async () => {
    await seed();
    const f = await gatherFacts(db, 'native', NOW);
    expect(f.counts.effortSets).toBe(0);
    expect(f.counts.warmupSessions).toBe(0);
    expect(f.counts.measurements).toBe(0);
    expect(f.counts.bodyCompDays).toBe(0);
    expect(f.flags.intakeDone).toBe(false);
  });

  it('counts Apple replies, mic-sent messages, answered check-ins and any reminder on', async () => {
    await seedSlice2();
    const f = await gatherFacts(db, 'native', NOW);
    expect(f.counts.appleReplies).toBe(4); // coach role + source apple
    expect(f.counts.micMessages).toBe(2); // his messages only
    expect(f.counts.checkInsDone).toBe(2); // the skipped week doesn't count
    expect(f.counts.chatQuestions).toBe(3);
    expect(f.flags.reminderOn).toBe(true);
  });

  it.each([
    ['session', { session: { on: true, time: '18:00' } }],
    ['missed day', { missedDay: { on: true } }],
    ['Sunday recap', { sundayRecap: { on: true } }],
  ])('any reminder on sets reminderOn (%s)', async (_, value) => {
    await db.settings.put({ key: 'reminders', value });
    expect((await gatherFacts(db, 'native', NOW)).flags.reminderOn).toBe(true);
  });

  it('reminders off, asked-permission only, or a damaged row is not "on"', async () => {
    for (const value of [
      { session: { on: false, time: '18:00' }, missedDay: { on: false }, sundayRecap: { on: false } },
      { askedPermission: true },
      { session: 'on', missedDay: true, sundayRecap: { on: 'yes' } },
      'junk',
    ]) {
      await db.settings.put({ key: 'reminders', value });
      expect((await gatherFacts(db, 'native', NOW)).flags.reminderOn, JSON.stringify(value)).toBe(
        false,
      );
    }
  });

  it('a damaged intake row does not count as answered', async () => {
    await db.settings.put({ key: 'intake', value: { goalKind: 'made-up' } });
    expect((await gatherFacts(db, 'web', NOW)).flags.intakeDone).toBe(false);
  });

  it('is all zeros and false on an empty db (web: no builds, no first-seen time)', async () => {
    const f = await gatherFacts(db, 'web', NOW);
    expect(f).toEqual({
      platform: 'web',
      now: NOW,
      counts: Object.fromEntries(FACT_COUNTS.map((k) => [k, 0])),
      flags: Object.fromEntries(FACT_FLAGS.map((k) => [k, false])),
    });
  });

  it('returns no raw values: counts are whole numbers, flags booleans, no strings from rows', async () => {
    await seed();
    await seedKit();
    await seedSlice2();
    await noteBuildSeen(db, 'build-x', day(9));
    const f = await gatherFacts(db, 'native', NOW);
    expect(Object.keys(f).sort()).toEqual(['buildFirstSeenAt', 'counts', 'flags', 'now', 'platform']);
    expect(Object.keys(f.counts).sort()).toEqual([...FACT_COUNTS].sort());
    expect(Object.keys(f.flags).sort()).toEqual([...FACT_FLAGS].sort());
    for (const v of Object.values(f.counts)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    for (const v of Object.values(f.flags)) expect(typeof v).toBe('boolean');
    // `now` and `buildFirstSeenAt` are times (checked above); search the rest.
    const text = JSON.stringify({ platform: f.platform, counts: f.counts, flags: f.flags });
    for (const bad of [
      'Made-up',
      'made-up',
      'build-x',
      '431',
      '57',
      '63',
      '72.4',
      '2150',
      '41.3',
      '23.75',
      '88',
      'Hammer',
      'legs-b',
      'paid',
      '81.25',
      '97.75',
      '18.6',
      '59.3',
      'waist',
      'strength',
      'shoulders',
      'easy',
      'hard',
      '"apple"',
      '06:47',
      '2026-11',
      'sundayRecap',
    ])
      expect(text, bad).not.toContain(bad);
  });
});
