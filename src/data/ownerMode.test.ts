import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OwnerMode } from '../core/types';
import { exportAll, importAll } from './backup';
import { GymDb } from './db';
import { setDevLogEnabled } from './devlog';
import {
  OWNER_MODE_KEY,
  getOwnerMode,
  isDevLogRecording,
  resolveOwnerMode,
  setOwnerMode,
} from './ownerMode';

// Made-up data only (public repo).
const T0 = 1_800_000_000_000;

const SESSION = { sessionId: 's1', dayId: 'd1', startedAt: T0 - 86_400_000 };
const ANSWER = {
  id: 'ask:t:s:1',
  topicId: 't',
  stepId: 's',
  kind: 'ask' as const,
  optionIds: ['yes'],
  at: T0 - 1000,
  release: '1.14.0',
};

let n = 0;
let a: GymDb;
let b: GymDb;
beforeEach(async () => {
  a = new GymDb(`owner-a-${n}`);
  b = new GymDb(`owner-b-${n++}`);
  await Promise.all([a.open(), b.open()]);
});
afterEach(async () => {
  a.close();
  b.close();
  await Promise.all([a.delete(), b.delete()]);
});

describe('resolveOwnerMode (first launch)', () => {
  it('a fresh install: off, by fresh, written once', async () => {
    expect(await getOwnerMode(a)).toBeUndefined();
    const mode = await resolveOwnerMode(a, T0);
    expect(mode).toEqual({ on: false, setAt: T0, by: 'fresh' });
    expect((await a.settings.get(OWNER_MODE_KEY))?.value).toEqual(mode);
    // A later launch with sessions keeps the stored row.
    await a.sessions.put(SESSION as never);
    expect(await resolveOwnerMode(a, T0 + 5000)).toEqual(mode);
  });

  it('an install with sessions (from before 1.15.0): on, by existing', async () => {
    await a.sessions.put(SESSION as never);
    expect(await resolveOwnerMode(a, T0)).toEqual({ on: true, setAt: T0, by: 'existing' });
    expect(await getOwnerMode(a)).toEqual({ on: true, setAt: T0, by: 'existing' });
  });

  it('an install with to-do answers only: on, by existing', async () => {
    await a.todoAnswers.put(ANSWER);
    expect(await resolveOwnerMode(a, T0)).toEqual({ on: true, setAt: T0, by: 'existing' });
  });

  it('an existing row is never re-decided', async () => {
    const row: OwnerMode = { on: false, setAt: 5, by: 'user' };
    await a.settings.put({ key: OWNER_MODE_KEY, value: row });
    await a.sessions.put(SESSION as never);
    await a.todoAnswers.put(ANSWER);
    expect(await resolveOwnerMode(a, T0)).toEqual(row);
    expect((await a.settings.get(OWNER_MODE_KEY))?.value).toEqual(row);
  });

  it('a malformed row is decided again and replaced', async () => {
    await a.settings.put({ key: OWNER_MODE_KEY, value: { on: 'yes' } });
    expect(await getOwnerMode(a)).toBeUndefined();
    expect(await resolveOwnerMode(a, T0)).toEqual({ on: false, setAt: T0, by: 'fresh' });
  });
});

describe('setOwnerMode (the 7-tap switch)', () => {
  it('stores the choice by user', async () => {
    await resolveOwnerMode(a, T0);
    expect(await setOwnerMode(a, true, T0 + 1)).toEqual({ on: true, setAt: T0 + 1, by: 'user' });
    expect(await getOwnerMode(a)).toEqual({ on: true, setAt: T0 + 1, by: 'user' });
    expect(await setOwnerMode(a, false, T0 + 2)).toEqual({ on: false, setAt: T0 + 2, by: 'user' });
    // A user's choice is a row like any other: never re-decided.
    await a.sessions.put(SESSION as never);
    expect(await resolveOwnerMode(a, T0 + 3)).toEqual({ on: false, setAt: T0 + 2, by: 'user' });
  });
});

describe('isDevLogRecording', () => {
  it('records nothing while owner mode is off and keeps the saved switch', async () => {
    await setDevLogEnabled(a, true);
    await setOwnerMode(a, false, T0);
    expect(await isDevLogRecording(a)).toBe(false);
    await setOwnerMode(a, true, T0 + 1);
    expect(await isDevLogRecording(a)).toBe(true);
    await setDevLogEnabled(a, false);
    expect(await isDevLogRecording(a)).toBe(false);
  });

  it('no row yet reads as off', async () => {
    await setDevLogEnabled(a, true);
    expect(await isDevLogRecording(a)).toBe(false);
  });
});

describe('backup (settings row ownerMode)', () => {
  it('round-trips through a backup file', async () => {
    await setOwnerMode(a, true, T0);
    const file = JSON.stringify(await exportAll(a, { appVersion: 't', now: T0 }));
    const row = JSON.parse(file).tables.settings.find(
      (r: { key: string }) => r.key === 'ownerMode',
    );
    expect(row.value).toEqual({ on: true, setAt: T0, by: 'user' });
    await importAll(b, file);
    expect(await getOwnerMode(b)).toEqual({ on: true, setAt: T0, by: 'user' });
  });

  it("a restored backup's row wins over this phone's row", async () => {
    await a.sessions.put(SESSION as never);
    await resolveOwnerMode(a, T0); // on, existing
    const file = JSON.stringify(await exportAll(a, { appVersion: 't', now: T0 }));
    await resolveOwnerMode(b, T0 + 9); // fresh phone: off
    expect((await getOwnerMode(b))?.on).toBe(false);
    await importAll(b, file);
    expect(await resolveOwnerMode(b, T0 + 10)).toEqual({ on: true, setAt: T0, by: 'existing' });
  });

  it('a backup from before 1.15.0 (no row) is decided on the next launch from its data', async () => {
    await a.sessions.put(SESSION as never);
    const file = JSON.stringify(await exportAll(a, { appVersion: 't', now: T0 }));
    await resolveOwnerMode(b, T0); // fresh: off
    await importAll(b, file);
    expect(await getOwnerMode(b)).toBeUndefined();
    expect(await resolveOwnerMode(b, T0 + 1)).toEqual({ on: true, setAt: T0 + 1, by: 'existing' });
  });
});
