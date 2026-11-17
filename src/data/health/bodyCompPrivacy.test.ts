/**
 * M12 1b privacy rule: body fat % and lean mass stay in `healthDays` on this phone (and in Fuel's
 * trend). They are never in a backup, never in the developer log, never in `weighIns`, and no
 * coach / brain module reads them.
 */
import 'fake-indexeddb/auto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportAll, BACKUP_TABLES, LOCAL_ONLY_TABLES } from '../backup';
import { GymDb } from '../db';
import { exportAll as exportDevLog, startDevLogSession } from '../devlog';
import { saveWeighIn } from '../nutrition/store';
import { HEALTH_SETTINGS_DEFAULT, mergeHealthDays, saveHealthSettings } from './store';

// Made-up numbers only (the repo is public).
let db: GymDb;
let n = 0;
beforeEach(async () => {
  db = new GymDb(`body-comp-privacy-${n++}`);
  await db.open();
  await saveHealthSettings(db, {
    ...HEALTH_SETTINGS_DEFAULT,
    enabled: { ...HEALTH_SETTINGS_DEFAULT.enabled, bodyMass: true, bodyFat: true, leanMass: true },
  });
  await mergeHealthDays(db, [
    { date: '2030-01-07', bodyFatPct: 22.37, leanMassKg: 53.91 },
    { date: '2030-01-08', bodyFatPct: 22.29, leanMassKg: 53.97 },
  ]);
  await saveWeighIn(db, { date: '2030-01-07', kg: 70.1, source: 'health' });
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const VALUE_NAMES = /bodyFatPct|leanMassKg/;
const VALUES = /22\.37|22\.29|53\.91|53\.97/;

describe('body fat + lean mass never leave healthDays', () => {
  it('a backup carries neither the values nor a new field (healthDays is local-only)', async () => {
    expect(LOCAL_ONLY_TABLES).toContain('healthDays');
    expect(BACKUP_TABLES as readonly string[]).not.toContain('healthDays');
    const file = await exportAll(db, { now: 1 });
    const json = JSON.stringify(file);
    expect(Object.keys(file.tables)).not.toContain('healthDays');
    expect(json).not.toMatch(VALUE_NAMES);
    expect(json).not.toMatch(VALUES);
    // Only the two switches travel (so a restored phone can read the values from Health again).
    const health = (file.tables.settings as { key: string; value: { enabled: unknown } }[]).find(
      (r) => r.key === 'health',
    );
    expect(health?.value.enabled).toMatchObject({ bodyFat: true, leanMass: true });
  });

  it('weigh-ins hold weight only', async () => {
    const rows = await db.weighIns.toArray();
    expect(rows).toEqual([{ date: '2030-01-07', kg: 70.1, source: 'health' }]);
  });

  it('the developer log drops them from the settings snapshot and never exports them', async () => {
    const r = await startDevLogSession(
      db,
      {
        dayId: 'push-a',
        startedAt: 1_900_000_000_000,
        settings: {
          unit: 'kg',
          bodyFatPct: 22.37,
          leanMassKg: 53.91,
          bodyComp: { bodyFat: { latest: { date: '2030-01-08', value: 22.29 } } },
          healthDays: [{ date: '2030-01-07', bodyFatPct: 22.37 }],
        },
      },
      { now: () => 1_900_000_000_000 },
    );
    expect((await db.devlogSessions.get(r.sessionId))?.settings).toEqual({ unit: 'kg' });
    await r.finish();
    const json = JSON.stringify(await exportDevLog(db, 1_900_000_000_001));
    expect(json).not.toMatch(VALUE_NAMES);
    expect(json).not.toMatch(/bodyComp|healthDays/);
    expect(json).not.toMatch(VALUES);
  });
});

describe('no coach / brain / log / backup module reads body fat or lean mass (source scan)', () => {
  const SRC = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? files(join(dir, e.name))
        : /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)
          ? [join(dir, e.name)]
          : [],
    );
  /** The value fields, the trend module, and the raw read keys used as properties. */
  const FORBIDDEN = /bodyFatPct|leanMassKg|bodyComp\b|health\/bodyComp|\.bodyFat\b|\.leanMass\b/;
  const scanned = [
    ...files('core/trainer'),
    ...files('data/brain'),
    'core/devlogCodec.ts', // data/devlog.ts only names them in its drop list (tested above)
    'data/backup.ts',
    'data/nutrition/store.ts',
  ];

  it('scans a real set of files', () => {
    expect(scanned.length).toBeGreaterThan(10);
    expect(scanned).toContain(join('core/trainer', 'coach.ts'));
    expect(scanned.some((f) => f.startsWith(join('data', 'brain')))).toBe(true);
  });

  it.each(scanned)('%s', (file) => {
    expect(readFileSync(join(SRC, file), 'utf8')).not.toMatch(FORBIDDEN);
  });
});
