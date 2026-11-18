import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkInDue } from '../../core/checkIn/checkIn';
import { GymDb } from '../db';
import { exportAll as exportDevLog, startDevLogSession } from '../devlog';
import { getCheckIn, listCheckIns, saveCheckIn, skipCheckIn } from './store';

// Made-up data only (public repo).
const T0 = new Date(2026, 10, 22, 9).getTime();
const MON = '2026-11-16';

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`check-in-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

describe('saveCheckIn', () => {
  it('stores the answers for the week, keyed by its Monday', async () => {
    const row = await saveCheckIn(db, { weekStart: MON, energy: 4, sleep: 3, soreness: 2 }, T0);
    expect(row).toEqual({ weekStart: MON, energy: 4, sleep: 3, soreness: 2, at: T0 });
    expect(await getCheckIn(db, MON)).toEqual(row);
    expect(checkInDue('2026-11-22', await listCheckIns(db))).toBeNull();
  });

  it('partial answers are kept as given', async () => {
    await saveCheckIn(db, { weekStart: MON, sleep: 5 }, T0);
    expect(await getCheckIn(db, MON)).toEqual({ weekStart: MON, sleep: 5, at: T0 });
  });

  it('no answers → a skipped row', async () => {
    expect(await saveCheckIn(db, { weekStart: MON }, T0)).toEqual({
      weekStart: MON,
      skipped: true,
      at: T0,
    });
  });

  it('an empty save over answers keeps the answers (it is a skip)', async () => {
    await saveCheckIn(db, { weekStart: MON, energy: 2 }, T0);
    expect(await saveCheckIn(db, { weekStart: MON }, T0 + 1)).toEqual({
      weekStart: MON,
      energy: 2,
      at: T0,
    });
  });

  it('a later save replaces earlier answers', async () => {
    await saveCheckIn(db, { weekStart: MON, energy: 2 }, T0);
    await saveCheckIn(db, { weekStart: MON, energy: 3, soreness: 1 }, T0 + 1);
    expect(await getCheckIn(db, MON)).toEqual({
      weekStart: MON,
      energy: 3,
      soreness: 1,
      at: T0 + 1,
    });
  });

  it('never overwrites a skipped week', async () => {
    await skipCheckIn(db, MON, T0);
    const row = await saveCheckIn(db, { weekStart: MON, energy: 5 }, T0 + 1);
    expect(row).toEqual({ weekStart: MON, skipped: true, at: T0 });
    expect(await getCheckIn(db, MON)).toEqual({ weekStart: MON, skipped: true, at: T0 });
  });

  it('refuses a week that is not a Monday or a value outside 1–5 (RangeError, nothing written)', async () => {
    const bad = [
      { weekStart: '2026-11-17', energy: 3 },
      { weekStart: '2026-11-22' },
      { weekStart: '16-11-2026', energy: 3 },
      { weekStart: MON, energy: 0 },
      { weekStart: MON, sleep: 6 },
      { weekStart: MON, soreness: 2.5 },
      { weekStart: MON, energy: '3' },
    ];
    for (const a of bad)
      await expect(saveCheckIn(db, a as never, T0), JSON.stringify(a)).rejects.toThrow(RangeError);
    expect(await db.checkIns.count()).toBe(0);
  });
});

describe('skipCheckIn', () => {
  it('marks the week skipped; it stays skipped for that week', async () => {
    expect(await skipCheckIn(db, MON, T0)).toEqual({ weekStart: MON, skipped: true, at: T0 });
    expect(await skipCheckIn(db, MON, T0 + 5)).toEqual({ weekStart: MON, skipped: true, at: T0 });
    for (const d of ['2026-11-22', '2026-11-25', '2026-11-28'])
      expect(checkInDue(d, await listCheckIns(db))).toBeNull();
    expect(checkInDue('2026-11-29', await listCheckIns(db))).toBe('2026-11-23');
  });

  it('never overwrites answers', async () => {
    await saveCheckIn(db, { weekStart: MON, energy: 4 }, T0);
    expect(await skipCheckIn(db, MON, T0 + 1)).toEqual({ weekStart: MON, energy: 4, at: T0 });
    expect(await getCheckIn(db, MON)).toEqual({ weekStart: MON, energy: 4, at: T0 });
  });

  it('refuses a week that is not a Monday', async () => {
    await expect(skipCheckIn(db, '2026-11-22', T0)).rejects.toThrow(RangeError);
  });
});

describe('listCheckIns', () => {
  it('oldest week first; getCheckIn of a missing week is undefined', async () => {
    await saveCheckIn(db, { weekStart: '2026-11-23', energy: 1 }, T0);
    await skipCheckIn(db, '2026-11-09', T0);
    await saveCheckIn(db, { weekStart: MON, sleep: 2 }, T0);
    expect((await listCheckIns(db)).map((c) => c.weekStart)).toEqual([
      '2026-11-09',
      MON,
      '2026-11-23',
    ]);
    expect(await getCheckIn(db, '2026-11-02')).toBeUndefined();
  });
});

describe('developer log', () => {
  it('carries no check-in', async () => {
    const rec = await startDevLogSession(db, { dayId: 'push-a', settings: {} }, { now: () => T0 });
    await saveCheckIn(db, { weekStart: MON, energy: 4, sleep: 3, soreness: 2 }, T0);
    await skipCheckIn(db, '2026-11-09', T0);
    await rec.finish(T0 + 1);
    const text = JSON.stringify(await exportDevLog(db, T0 + 2));
    expect(text).not.toMatch(/checkIn|energy|sleep|soreness|skipped|2026-11-16|2026-11-09/);
  });
});
