import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TrainerState } from '../core/types';
import { GymDb } from './db';
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  DEVLOG_TABLES,
  LOCAL_ONLY_TABLES,
  NOT_BACKED_UP_TABLES,
  BACKUP_VERSION,
  BackupError,
  exportAll,
  importAll,
  validateBackup,
  type BackupFile,
} from './backup';

// Made-up data only (public repo).
const T0 = 1_700_000_000_000;

const SET_ROW = {
  sessionId: 's1',
  exerciseId: 'curl',
  setIndex: 0,
  reps: 10,
  weightKg: 12.5,
  restTakenSec: 90,
  startedAt: T0,
  endedAt: T0 + 1,
};
const FOOD_ROW = {
  id: 'f9',
  name: 'Made-up food',
  source: 'custom',
  basis: { per100g: true },
  kcal: 130,
  proteinG: 3,
};
const ENTRY_ROW = {
  id: 'e9',
  date: '2026-01-05',
  time: T0,
  slot: 'lunch',
  label: 'Bowl',
  amount: { servings: 1 },
  estimate: false,
  kcal: 260,
  proteinG: 5,
};
const CHECK_ROW = {
  weekStart: '2026-01-05',
  avgKg: 70.1,
  prevAvgKg: null,
  ratePct: null,
  kind: 'needData',
  deltaKcal: 0,
  outcome: 'pending',
};

const state = (version: number): TrainerState => ({
  version,
  plan: { days: [], seededFrom: 'hash-x', edited: false },
  schedule: { rotation: ['push', 'pull'], restWeekdays: [0] },
  overrides: [{ date: '2026-01-05', rest: true }],
});

async function seed(db: GymDb): Promise<void> {
  await db.sessions.bulkPut([
    { sessionId: 's1', dayId: 'push', startedAt: T0, endedAt: T0 + 3_600_000, setsDone: 2 },
    { sessionId: 's2', dayId: 'pull', startedAt: T0 + 86_400_000, adjust: ['lighter'] },
  ]);
  await db.sets.bulkAdd([
    {
      sessionId: 's1',
      exerciseId: 'curl',
      setIndex: 0,
      reps: 10,
      partials: 1,
      weightKg: 12.5,
      restTakenSec: 90,
      focusScore: 88,
      cues: ['rushedLowering'],
      startedAt: T0 + 1000,
      endedAt: T0 + 40_000,
    },
    {
      sessionId: 's1',
      exerciseId: 'curl',
      setIndex: 1,
      reps: 8,
      weightKg: 12.5,
      restTakenSec: 95,
      startedAt: T0 + 140_000,
      endedAt: T0 + 180_000,
    },
  ]);
  await db.exerciseNotes.put({
    exerciseId: 'curl',
    machineSetting: 'pin 4',
    note: 'slow',
    updatedAt: T0,
  });
  await db.sessionNotes.put({
    sessionId: 's1',
    exerciseId: 'curl',
    note: 'felt good',
    updatedAt: T0,
  });
  await db.settings.bulkPut([
    { key: 'unit', value: 'kg' },
    { key: 'coachVoice', value: { persona: 'drill', rudeness: 3, voiceName: null } },
    { key: 'nutrition', value: { mode: 'quick', heightCm: 170, birthYear: 1990, sex: 'male' } },
  ]);
  await db.trainer.put({ key: 'current', state: state(3) });
  await db.planChanges.add({
    createdAt: T0,
    action: 'lighter',
    title: 'Lighter today',
    source: 'chip',
    before: state(2),
    after: state(3),
  });
  await db.foods.put({
    id: 'f1',
    name: 'Rice, cooked',
    source: 'usda',
    basis: { per100g: true },
    kcal: 130,
    proteinG: 2.7,
    carbsG: 28,
    fatG: 0.3,
    note: 'made-up test row',
  });
  await db.recipes.put({
    id: 'r1',
    name: 'Bowl',
    ingredients: [{ foodId: 'f1', grams: 200 }],
    servings: 1,
    updatedAt: T0,
  });
  await db.foodEntries.put({
    id: 'e1',
    date: '2026-01-05',
    time: T0,
    slot: 'lunch',
    label: 'Bowl',
    ref: { recipeId: 'r1' },
    amount: { servings: 1 },
    estimate: false,
    kcal: 260,
    proteinG: 5.4,
  });
  await db.weighIns.put({ date: '2026-01-05', kg: 70.2 });
  await db.favorites.put({
    id: 'fav1',
    ref: { foodId: 'f1' },
    amount: { grams: 150 },
    createdAt: T0,
  });
  await db.weeklyChecks.put({
    weekStart: '2026-01-05',
    avgKg: 70.1,
    prevAvgKg: null,
    ratePct: null,
    kind: 'needData',
    deltaKcal: 0,
    outcome: 'pending',
  });
  // Developer log: never in a backup.
  await db.devlogSessions.put({
    id: 'dl1',
    startedAt: T0,
    appVersion: 'test',
    userAgent: 'test',
    settings: {},
    dayId: 'push',
    bytes: 10,
  });
  await db.devlogSets.put({
    key: 'dl1#0',
    sessionId: 'dl1',
    seq: 0,
    exerciseId: 'curl',
    setIndex: 0,
    targetReps: [8, 12],
    weightKg: 12.5,
    startedAt: T0,
  });
  await db.devlogChunks.add({
    sessionId: 'dl1',
    setKey: 'dl1#0',
    frames: new Uint8Array([1, 2]),
    bytes: 2,
  });
}

/** Every backed-up table's rows, sorted by primary key, for comparing two dbs. */
async function dump(db: GymDb): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const name of BACKUP_TABLES) out[name] = await db.table(name).toArray();
  return out;
}

/** What a file looks like after it went through the share sheet and back. */
const viaFile = (b: BackupFile): string => JSON.stringify(b);

let n = 0;
let a: GymDb;
let b: GymDb;

beforeEach(async () => {
  a = new GymDb(`backup-a-${n}`);
  b = new GymDb(`backup-b-${n++}`);
  await a.open();
  await b.open();
});

afterEach(async () => {
  a.close();
  b.close();
  await a.delete();
  await b.delete();
});

describe('exportAll', () => {
  it('writes the header and every table except the developer log', async () => {
    await seed(a);
    const file = await exportAll(a, { appVersion: 'abc123', now: T0 + 5 });
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.format).toBe('gym-clean-backup');
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.dexieVersion).toBe(a.verno);
    expect(file.dexieVersion).toBe(7);
    expect(file.appVersion).toBe('abc123');
    expect(file.createdAt).toBe(T0 + 5);
    expect(Object.keys(file.tables).sort()).toEqual(
      [
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
      ].sort(),
    );
    expect(file.tables.sets).toHaveLength(2);
    expect(file.tables.foods).toHaveLength(1);
    expect(JSON.stringify(file)).not.toMatch(/devlog|dl1/);
  });

  it('covers every Dexie table: each one is either backed up or deliberately left out', async () => {
    const all = a.tables.map((t) => t.name).sort();
    const left = [
      'devlogChunks',
      'devlogSessions',
      'devlogSets',
      'foodModels',
      'foodPhotos',
      'healthDays',
    ];
    expect([...BACKUP_TABLES, ...left].sort()).toEqual(all);
    expect([...DEVLOG_TABLES, ...LOCAL_ONLY_TABLES].sort()).toEqual(left);
    expect([...NOT_BACKED_UP_TABLES].sort()).toEqual(left);
    for (const t of NOT_BACKED_UP_TABLES) expect(BACKUP_TABLES).not.toContain(t);
  });

  it('leaves saved food photos and the food model out of the file (M7b)', async () => {
    await seed(a);
    await a.foodPhotos.put({
      id: 'ph1',
      dishId: 'thai:made-up',
      createdAt: T0,
      w: 2,
      h: 2,
      blob: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }),
    });
    await a.foodModels.put({
      id: 'food',
      name: 'made-up.tflite',
      sizeBytes: 2,
      labels: ['a', 'b'],
      importedAt: T0,
      blob: new Blob([new Uint8Array([3, 4])]),
    });
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    expect(Object.keys(file.tables)).not.toContain('foodPhotos');
    expect(Object.keys(file.tables)).not.toContain('foodModels');
    expect(JSON.stringify(file)).not.toMatch(/ph1|made-up\.tflite/);
  });

  it('a restore leaves the photos and model already on this phone alone (M7b)', async () => {
    await seed(a);
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await b.foodPhotos.put({
      id: 'ph1',
      dishId: 'thai:made-up',
      createdAt: T0,
      w: 2,
      h: 2,
      blob: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }),
    });
    await b.foodModels.put({
      id: 'food',
      name: 'm',
      sizeBytes: 2,
      labels: ['a', 'b'],
      importedAt: T0,
      blob: new Blob([new Uint8Array([3, 4])]),
    });
    await importAll(b, file);
    expect(await b.foodPhotos.count()).toBe(1);
    expect(await b.foodModels.count()).toBe(1);
  });

  it('never writes an API key or other secret, even if one is stored', async () => {
    await seed(a);
    await a.settings.bulkPut([
      { key: 'claudeApiKey', value: 'sk-ant-made-up' },
      { key: 'coach', value: { brain: 'claude', apiKey: 'sk-ant-made-up-2', model: 'x' } },
    ]);
    const text = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    expect(text).not.toMatch(/sk-ant/);
    expect(text).not.toMatch(/api[-_]?key/i);
    const coach = JSON.parse(text).tables.settings.find((r: { key: string }) => r.key === 'coach');
    expect(coach.value).toEqual({ brain: 'claude', model: 'x' });
  });
});

describe('importAll', () => {
  it('round-trips every table through a JSON file into an empty db', async () => {
    await seed(a);
    const text = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await importAll(b, text);
    expect(await dump(b)).toEqual(await dump(a));
    // Auto-increment ids are kept, and new rows continue after them.
    const ids = (await b.sets.toArray()).map((r) => r.id);
    const next = await b.sets.add({
      sessionId: 's3',
      exerciseId: 'curl',
      setIndex: 0,
      reps: 5,
      weightKg: 10,
      restTakenSec: 60,
      startedAt: T0,
      endedAt: T0,
    });
    expect(next).toBeGreaterThan(Math.max(...(ids as number[])));
  });

  it('accepts the parsed object as well as the text', async () => {
    await seed(a);
    const file = JSON.parse(viaFile(await exportAll(a, { appVersion: 't', now: T0 })));
    await importAll(b, file);
    expect(await dump(b)).toEqual(await dump(a));
  });

  it('replaces existing data (rows not in the file are gone) and returns an undo snapshot', async () => {
    await seed(a);
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await b.sessions.put({ sessionId: 'old', dayId: 'legs', startedAt: 1 });
    await b.weighIns.put({ date: '2025-12-01', kg: 99 });
    await b.settings.put({ key: 'unit', value: 'lb' });
    const before = await dump(b);

    const res = await importAll(b, file, { now: T0 + 9 });
    expect(await b.sessions.get('old')).toBeUndefined();
    expect(await b.weighIns.get('2025-12-01')).toBeUndefined();
    expect((await b.settings.get('unit'))?.value).toBe('kg');
    expect(res.counts.sessions).toBe(2);
    expect(res.counts.sets).toBe(2);

    // Undo: importing the snapshot restores exactly what was there.
    expect(res.undo.format).toBe(BACKUP_FORMAT);
    await importAll(b, res.undo);
    expect(await dump(b)).toEqual(before);
  });

  it('leaves the developer log and stored secrets on this phone alone', async () => {
    await seed(a);
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await seed(b);
    await b.settings.put({ key: 'claudeApiKey', value: 'sk-ant-local' });
    await importAll(b, file);
    expect(await b.devlogSessions.count()).toBe(1);
    expect(await b.devlogChunks.count()).toBe(1);
    expect((await b.settings.get('claudeApiKey'))?.value).toBe('sk-ant-local');
  });

  it('ignores a secret smuggled into a file', async () => {
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    file.tables.settings = [
      { key: 'unit', value: 'lb' },
      { key: 'claudeApiKey', value: 'sk-ant-evil' },
    ];
    await importAll(b, viaFile(file));
    expect((await b.settings.get('unit'))?.value).toBe('lb');
    expect(await b.settings.get('claudeApiKey')).toBeUndefined();
  });

  it('accepts a file from an older schema; tables it lacks end up empty', async () => {
    await seed(a);
    const file = await exportAll(a, { appVersion: 'old', now: T0 });
    const old = {
      ...file,
      dexieVersion: 2,
      tables: {
        sessions: file.tables.sessions,
        sets: file.tables.sets,
        exerciseNotes: file.tables.exerciseNotes,
        sessionNotes: file.tables.sessionNotes,
        settings: file.tables.settings,
      },
    };
    await seed(b);
    await importAll(b, JSON.stringify(old));
    expect(await b.sessions.count()).toBe(2);
    expect(await b.foods.count()).toBe(0);
    expect(await b.trainer.count()).toBe(0);
  });

  describe('refuses without touching existing data', () => {
    const cases: [string, (f: BackupFile) => unknown, BackupError['code']][] = [
      ['not JSON', () => '{"format": "gym-clean-backup", ', 'corrupt'],
      ['not an object', () => '[1,2,3]', 'corrupt'],
      ['another format', (f) => ({ ...f, format: 'something-else' }), 'format'],
      ['a newer backup version', (f) => ({ ...f, version: BACKUP_VERSION + 1 }), 'newer'],
      ['a newer Dexie schema', (f) => ({ ...f, dexieVersion: f.dexieVersion + 1 }), 'newer'],
      ['a bad dexieVersion', (f) => ({ ...f, dexieVersion: 'five' }), 'corrupt'],
      ['no tables', (f) => ({ ...f, tables: undefined }), 'corrupt'],
      ['an unknown table', (f) => ({ ...f, tables: { ...f.tables, devlogChunks: [] } }), 'corrupt'],
      [
        'a table that is not a list',
        (f) => ({ ...f, tables: { ...f.tables, sets: {} } }),
        'corrupt',
      ],
      [
        'a row that is not an object',
        (f) => ({ ...f, tables: { ...f.tables, foods: [42] } }),
        'corrupt',
      ],
      [
        'a row without its key',
        (f) => ({ ...f, tables: { ...f.tables, sessions: [{ dayId: 'x', startedAt: 1 }] } }),
        'corrupt',
      ],
      [
        'a row with a bad compound key',
        (f) => ({ ...f, tables: { ...f.tables, sessionNotes: [{ sessionId: 's1', note: 'x' }] } }),
        'corrupt',
      ],
      [
        'duplicate keys',
        (f) => ({
          ...f,
          tables: {
            ...f.tables,
            weighIns: [
              { date: '2026-01-01', kg: 1 },
              { date: '2026-01-01', kg: 2 },
            ],
          },
        }),
        'corrupt',
      ],
      // Row shapes per table (reviewer note on M9 B1): checked before the confirm step.
      ...(
        [
          ['sessions', [{ sessionId: 'x', startedAt: 1 }]],
          ['sessions', [{ sessionId: 'x', dayId: 'push', startedAt: 1, endedAt: 'later' }]],
          ['sets', [{ ...SET_ROW, reps: '10' }]],
          ['sets', [{ ...SET_ROW, endedAt: undefined }]],
          ['sets', [{ ...SET_ROW, cues: 'rushedLowering' }]],
          ['exerciseNotes', [{ exerciseId: 'curl', machineSetting: 'pin 4', note: 5 }]],
          ['sessionNotes', [{ sessionId: 's1', exerciseId: 'curl', note: 'x' }]],
          ['settings', [{ key: 'unit' }]],
          ['trainer', [{ key: 'current', state: 'v3' }]],
          ['trainer', [{ key: 'current', state: { version: 3, plan: {}, schedule: {} } }]],
          ['planChanges', [{ createdAt: 1, action: 'lighter', title: 't', source: 'chip' }]],
          ['foods', [{ ...FOOD_ROW, kcal: '130' }]],
          ['foods', [{ ...FOOD_ROW, basis: undefined }]],
          ['foods', [{ ...FOOD_ROW, estimate: 'yes' }]],
          ['recipes', [{ id: 'r', name: 'n', ingredients: {}, servings: 1, updatedAt: 1 }]],
          ['foodEntries', [{ ...ENTRY_ROW, estimate: undefined }]],
          ['foodEntries', [{ ...ENTRY_ROW, amount: 2 }]],
          ['weighIns', [{ date: '2026-01-01', kg: '70' }]],
          ['favorites', [{ id: 'f', amount: { grams: 1 }, createdAt: 1 }]],
          ['weeklyChecks', [{ ...CHECK_ROW, avgKg: 'x' }]],
          ['weeklyChecks', [{ ...CHECK_ROW, deltaKcal: null }]],
        ] as [string, unknown[]][]
      ).map(([table, rows], i): [string, (f: BackupFile) => unknown, BackupError['code']] => [
        `a bad "${table}" row (#${i})`,
        (f) => ({ ...f, tables: { ...f.tables, [table]: JSON.parse(JSON.stringify(rows)) } }),
        'corrupt',
      ]),
    ];

    it.each(cases)('%s', async (_name, mutate, code) => {
      await seed(a);
      const good = await exportAll(a, { appVersion: 't', now: T0 });
      const bad = mutate(JSON.parse(JSON.stringify(good)) as BackupFile);
      await seed(b);
      const before = await dump(b);
      const err = await importAll(b, bad as string).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(BackupError);
      expect((err as BackupError).code).toBe(code);
      expect(await dump(b)).toEqual(before);
    });
  });

  it('is atomic: a write that fails midway rolls everything back', async () => {
    await seed(a);
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await seed(b);
    await b.sessions.put({ sessionId: 'keep-me', dayId: 'legs', startedAt: 2 });
    const before = await dump(b);
    // A valid file, but the last table's write fails after the others were cleared and filled.
    const fail = (): void => {
      throw new Error('disk full (simulated)');
    };
    b.weeklyChecks.hook('creating', fail);
    const err = await importAll(b, file).then(
      () => null,
      (e: unknown) => e,
    );
    b.weeklyChecks.hook('creating').unsubscribe(fail);
    expect(err).toBeInstanceOf(BackupError);
    expect((err as BackupError).code).toBe('write');
    expect(await dump(b)).toEqual(before);
  });
});

describe('validateBackup row shapes', () => {
  it('accepts every row the app itself writes (seeded db, nulls where allowed)', async () => {
    await seed(a);
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    expect(() => validateBackup(b, viaFile(file))).not.toThrow();
  });

  it('refuses a bad row with code corrupt and names the table, without writing', async () => {
    await seed(b);
    const before = await dump(b);
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    file.tables.weighIns = [{ date: '2026-01-01', kg: 'heavy' }];
    let err: unknown = null;
    try {
      validateBackup(b, viaFile(file));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BackupError);
    expect((err as BackupError).code).toBe('corrupt');
    expect((err as BackupError).message).toMatch(/weighIns/);
    expect(await dump(b)).toEqual(before);
  });

  it('accepts unknown extra fields (a newer app may add some)', async () => {
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    file.tables.foods = [{ ...FOOD_ROW, someLaterField: [1] }];
    file.tables.sets = [{ ...SET_ROW, id: 7, futureFlag: true }];
    await importAll(b, viaFile(file));
    expect(await b.foods.count()).toBe(1);
    expect(await b.sets.count()).toBe(1);
  });
});

describe('secret stripping is narrow (settings only, explicit names)', () => {
  it('keeps secret-sounding fields outside settings, e.g. a future tokenCount', async () => {
    await a.foodEntries.put({ ...ENTRY_ROW, tokenCount: 42 } as never);
    await a.planChanges.add({
      createdAt: T0,
      action: 'lighter',
      title: 'Lighter today',
      source: 'claude',
      before: state(1),
      after: state(2),
      passwordHint: 'kept',
    } as never);
    const text = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    const tables = JSON.parse(text).tables;
    expect(tables.foodEntries[0].tokenCount).toBe(42);
    expect(tables.planChanges[0].passwordHint).toBe('kept');
    await importAll(b, text);
    expect(((await b.foodEntries.get('e9')) as unknown as { tokenCount: number }).tokenCount).toBe(
      42,
    );
  });

  it('keeps settings fields that only contain a secret word (tokenCount), drops listed ones', async () => {
    await a.settings.bulkPut([
      { key: 'coach', value: { apiKey: 'sk-ant-made-up', tokenCount: 1500, model: 'x' } },
      { key: 'coachTokens', value: { tokenCount: 3 } },
      { key: 'claudeApiKey', value: 'sk-ant-made-up-2' },
    ]);
    const text = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    expect(text).not.toMatch(/sk-ant/);
    const rows = JSON.parse(text).tables.settings as { key: string; value: unknown }[];
    expect(rows.map((r) => r.key).sort()).toEqual(['coach', 'coachTokens']);
    expect(rows.find((r) => r.key === 'coach')?.value).toEqual({ tokenCount: 1500, model: 'x' });
  });
});

describe('M11 health data in backups', () => {
  const healthRow = {
    key: 'health',
    value: {
      enabled: {
        bodyMass: true,
        workouts: true,
        activeEnergy: false,
        sleep: true,
        restingHr: true,
        hrv: true,
      },
      route: 'apple',
      lastReadAt: T0,
      deletedHealthWeighIns: ['2026-01-03'],
    },
  };

  it('leaves healthDays out (M11-q7) and keeps imported weigh-ins like any weigh-in', async () => {
    await seed(a);
    await a.healthDays.put({ date: '2026-01-05', sleepMin: 401, restingHr: 57, hrvMs: 49 });
    await a.weighIns.put({ date: '2026-01-06', kg: 70.3, source: 'health' });
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    expect(Object.keys(file.tables)).not.toContain('healthDays');
    expect(JSON.stringify(file)).not.toMatch(/sleepMin|restingHr|hrvMs/);
    expect(file.tables.weighIns).toContainEqual({ date: '2026-01-06', kg: 70.3, source: 'health' });

    await importAll(b, viaFile(file));
    expect(await b.weighIns.get('2026-01-06')).toEqual({
      date: '2026-01-06',
      kg: 70.3,
      source: 'health',
    });
    expect(await b.healthDays.count()).toBe(0);
  });

  it('backs up the health switches and deleted-import dates but not lastReadAt', async () => {
    await seed(a);
    await a.settings.put(healthRow);
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    const row = (file.tables.settings as { key: string; value: unknown }[]).find(
      (r) => r.key === 'health',
    );
    expect(row?.value).toEqual({
      enabled: healthRow.value.enabled,
      route: 'apple',
      deletedHealthWeighIns: ['2026-01-03'],
    });
  });

  it('leaves the readiness history out of the file; a restore keeps this phone’s', async () => {
    const readiness = {
      lastCard: {
        date: '2026-01-07',
        signals: ['sleepShort', 'hrvLow'],
        reasons: ['Sleep was about 1 h shorter than usual.', 'HRV is lower than usual.'],
        offer: 'lighter',
      },
      answeredDate: '2026-01-07',
      lastDeloadOfferDate: '2026-01-01',
    };
    await seed(a);
    await a.settings.put({ key: 'health', value: { ...healthRow.value, readiness } });
    const file = await exportAll(a, { appVersion: 't', now: T0 });
    expect(JSON.stringify(file)).not.toMatch(/readiness|answeredDate|lastDeloadOfferDate|lastCard/);

    const mine = { lastDeloadOfferDate: '2026-01-05' };
    await b.settings.put({ key: 'health', value: { ...healthRow.value, readiness: mine } });
    await importAll(b, viaFile(file));
    const row = (await b.settings.get('health'))?.value as Record<string, unknown>;
    expect(row.readiness).toEqual(mine);
    expect(row.lastReadAt).toBeUndefined();
    expect(row.deletedHealthWeighIns).toEqual(['2026-01-03']);

    // A file that somehow carries one (hand-edited) can't bring it in either.
    const edited = await exportAll(a, { appVersion: 't', now: T0 });
    const hrow = (edited.tables.settings as { key: string; value: Record<string, unknown> }[]).find(
      (r) => r.key === 'health',
    );
    if (hrow) hrow.value.readiness = readiness;
    await b.settings.delete('health');
    await importAll(b, viaFile(edited));
    expect(((await b.settings.get('health'))?.value as Record<string, unknown>).readiness).toBeUndefined();
  });

  it('a restore leaves this phone’s healthDays alone, except types the restored switches turn off', async () => {
    await seed(a);
    await a.settings.put(healthRow); // activeEnergy off
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await b.healthDays.bulkPut([
      { date: '2026-01-05', sleepMin: 401, activeKcal: 480 },
      { date: '2026-01-06', activeKcal: 300 },
    ]);
    await importAll(b, file);
    expect(await b.healthDays.toArray()).toEqual([{ date: '2026-01-05', sleepMin: 401 }]);
  });

  it('a file without a health row keeps this phone’s health settings and data', async () => {
    await seed(a);
    const file = viaFile(await exportAll(a, { appVersion: 't', now: T0 }));
    await b.settings.put(healthRow);
    await b.healthDays.put({ date: '2026-01-05', sleepMin: 401, activeKcal: 480 });
    await importAll(b, file);
    expect(await b.settings.get('health')).toEqual(healthRow);
    expect(await b.healthDays.get('2026-01-05')).toEqual({ date: '2026-01-05', sleepMin: 401 });
  });

  it('refuses a weigh-in with a non-string source', async () => {
    await seed(a);
    const f = await exportAll(a, { appVersion: 't', now: T0 });
    f.tables.weighIns = [{ date: '2026-01-07', kg: 70, source: 3 }];
    expect(() => validateBackup(b, f)).toThrow(BackupError);
  });
});
