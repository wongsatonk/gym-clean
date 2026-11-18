/**
 * M13 owner mode persistence: the settings row 'ownerMode' (local, backed up with the other
 * settings; no Dexie change). The decision itself is pure (src/core/ownerMode.ts).
 *
 * - `resolveOwnerMode` runs once at app start, before anything reads owner mode: with no (valid)
 *   row it decides from this phone's sessions and to-do answers and writes the row; a stored row
 *   is returned as it is. After a restore the file's row is the stored row (it wins); a file from
 *   before 1.15.0 has none, so the next start decides from the restored data.
 * - `setOwnerMode` is the About screen's "Owner tools" switch (`by: 'user'`).
 * - Readers before `resolveOwnerMode` (no row) treat owner mode as off.
 *
 * Time is passed in (`now`, ms).
 */
import { decideOwnerMode, devLogRecording, parseOwnerMode } from '../core/ownerMode';
import type { OwnerMode } from '../core/types';
import type { GymDb } from './db';
import { getDevLogEnabled } from './devlog';

export const OWNER_MODE_KEY = 'ownerMode';

/** The stored row, or undefined when there is none (or it is malformed). */
export async function getOwnerMode(db: GymDb): Promise<OwnerMode | undefined> {
  return parseOwnerMode((await db.settings.get(OWNER_MODE_KEY))?.value);
}

/** The owner mode for this launch; decided and stored once when there is no row. */
export async function resolveOwnerMode(db: GymDb, now: number): Promise<OwnerMode> {
  return db.transaction('rw', db.settings, db.sessions, db.todoAnswers, async () => {
    const stored = parseOwnerMode((await db.settings.get(OWNER_MODE_KEY))?.value);
    if (stored) return stored;
    const [sessions, todoAnswers] = await Promise.all([
      db.sessions.count(),
      db.todoAnswers.count(),
    ]);
    const { mode } = decideOwnerMode({ row: undefined, sessions, todoAnswers, now });
    await db.settings.put({ key: OWNER_MODE_KEY, value: mode });
    return mode;
  });
}

/** The 7-tap "Owner tools" switch. */
export async function setOwnerMode(db: GymDb, on: boolean, now: number): Promise<OwnerMode> {
  const mode: OwnerMode = { on, setAt: now, by: 'user' };
  await db.settings.put({ key: OWNER_MODE_KEY, value: mode });
  return mode;
}

/** Whether the developer log records now: never while owner mode is off (or undecided). */
export async function isDevLogRecording(db: GymDb): Promise<boolean> {
  const [mode, saved] = await Promise.all([getOwnerMode(db), getDevLogEnabled(db)]);
  return devLogRecording(mode, saved);
}
