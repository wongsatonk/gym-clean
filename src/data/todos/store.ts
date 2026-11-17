/**
 * M12 slice 1c to-do + What's New persistence (Dexie v9 `todoAnswers` + settings rows).
 *
 * - `todoAnswers` holds his ask answers (option ids + an optional note), auto ticks (with their
 *   time; they stay ticked) and topic skips. It is backed up (his own words, no Health values) and
 *   nothing here writes to the developer log. Notes are cleaned on save (`redactNote`: key-like
 *   strings and photo data removed, ≤ 500 characters).
 * - An ask answer can be changed until it is copied in a report; after that a change is a new row.
 * - Settings rows: 'whatsNew' (`seenRelease`, `builds` = build id → first seen, for the 7-day
 *   re-sign clock; `builds` stays on this phone, see backup.ts), 'todos' (`lastCopiedAt`),
 *   'todoSignals' (`calendarAfterSessionAt`). Decision steps write their own mapped key only.
 *
 * Time is passed in (`now`, ms).
 */
import { redactNote } from '../../core/todo/report';
import { compareReleases } from '../../core/todo/whatsNew';
import type {
  TodoAnswer,
  TodoSettings,
  TodoSignals,
  TodoStep,
  WhatsNewState,
} from '../../core/types';
import type { GymDb } from '../db';

export const WHATS_NEW_KEY = 'whatsNew';
export const TODO_SETTINGS_KEY = 'todos';
export const TODO_SIGNALS_KEY = 'todoSignals';
/** Build ids kept for the re-sign clock: the first one ever (the iPhone app's first launch) + the latest. */
export const BUILDS_KEPT = 10;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const byTime = (a: TodoAnswer, b: TodoAnswer) => a.at - b.at || a.id.localeCompare(b.id);

// ---------- answers ----------

export type AnswerInput = { topicId: string; stepId: string; optionIds: string[]; note?: string };

/** Every stored answer, oldest first. */
export async function listAnswers(db: GymDb): Promise<TodoAnswer[]> {
  return (await db.todoAnswers.toArray()).sort(byTime);
}

/**
 * Saves an ask answer. An unsent answer for the same step is changed in place (same id); once it
 * was copied, a change is a new answer (reported next time). An empty note is dropped.
 *
 * Clearing: a blank answer (no options and no note left after cleaning) stores nothing, deletes
 * the step's unsent answer (sent ones stay: they were reported) and returns null. The step is then
 * not done, unless a sent answer for it remains (`currentAnswer` then shows that one).
 */
export async function saveAnswer(
  db: GymDb,
  input: AnswerInput,
  now: number,
  release: string,
): Promise<TodoAnswer | null> {
  const note = input.note === undefined ? '' : redactNote(input.note);
  return db.transaction('rw', db.todoAnswers, async () => {
    const open = (await db.todoAnswers.where('topicId').equals(input.topicId).toArray()).find(
      (a) => a.stepId === input.stepId && a.kind === 'ask' && a.sentAt === undefined,
    );
    if (input.optionIds.length === 0 && note === '') {
      if (open) await db.todoAnswers.delete(open.id);
      return null;
    }
    const row: TodoAnswer = {
      id: open?.id ?? `ask:${input.topicId}:${input.stepId}:${now}`,
      topicId: input.topicId,
      stepId: input.stepId,
      kind: 'ask',
      optionIds: [...input.optionIds],
      at: now,
      release,
    };
    if (note !== '') row.note = note;
    await db.todoAnswers.put(row);
    return row;
  });
}

/** Stores auto ticks not stored yet (one per step); returns how many were added. */
export async function recordAutoTicks(
  db: GymDb,
  ticks: readonly { topicId: string; stepId: string }[],
  now: number,
  release: string,
): Promise<number> {
  if (ticks.length === 0) return 0;
  return db.transaction('rw', db.todoAnswers, async () => {
    const have = new Set(
      (await db.todoAnswers.toArray())
        .filter((a) => a.kind === 'auto')
        .map((a) => `${a.topicId}\u0000${a.stepId}`),
    );
    const rows: TodoAnswer[] = [];
    for (const t of ticks) {
      const k = `${t.topicId}\u0000${t.stepId}`;
      if (have.has(k)) continue;
      have.add(k);
      rows.push({
        id: `auto:${t.topicId}:${t.stepId}`,
        topicId: t.topicId,
        stepId: t.stepId,
        kind: 'auto',
        at: now,
        release,
      });
    }
    if (rows.length) await db.todoAnswers.bulkPut(rows);
    return rows.length;
  });
}

/** "Skip this topic" (reported as skipped). A second skip of the same topic is ignored. */
export async function skipTopic(
  db: GymDb,
  topicId: string,
  now: number,
  release: string,
): Promise<TodoAnswer> {
  return db.transaction('rw', db.todoAnswers, async () => {
    const prev = (await db.todoAnswers.where('topicId').equals(topicId).toArray()).find(
      (a) => a.kind === 'skip',
    );
    if (prev) return prev;
    const row: TodoAnswer = {
      id: `skip:${topicId}:${now}`,
      topicId,
      stepId: '',
      kind: 'skip',
      at: now,
      release,
    };
    await db.todoAnswers.put(row);
    return row;
  });
}

/** After a successful copy: marks these answers sent and remembers when (settings 'todos'). */
export async function markSent(db: GymDb, ids: readonly string[], at: number): Promise<void> {
  await db.transaction('rw', db.todoAnswers, db.settings, async () => {
    for (const id of ids) await db.todoAnswers.update(id, { sentAt: at });
    const value: TodoSettings = { lastCopiedAt: at };
    await db.settings.put({ key: TODO_SETTINGS_KEY, value });
  });
}

export async function getTodoSettings(db: GymDb): Promise<TodoSettings> {
  const v = (await db.settings.get(TODO_SETTINGS_KEY))?.value;
  return isObj(v) && isTime(v.lastCopiedAt) ? { lastCopiedAt: v.lastCopiedAt } : {};
}

// ---------- decisions ----------

/** `obj` with `value` at the dot `path` (objects created / replaced along the way); a copy. */
function setPath(obj: unknown, path: string[], value: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  const base = isObj(obj) ? obj : {};
  return { ...base, [head]: setPath(base[head], rest, value) };
}

/**
 * A decision step's answer sets its setting directly: the step's `setting.values[optionId]` is
 * written at `setting.path` inside the `setting.key` row (`path: ''` = the whole value; other
 * fields in the row are kept). Nothing else is touched. Returns false (no write) when the step
 * has no setting or the option isn't mapped (e.g. "Change something": the planner decides).
 */
export async function applyDecision(db: GymDb, step: TodoStep, optionId: string): Promise<boolean> {
  if (step.kind !== 'ask' || !step.setting) return false;
  const { key, path, values } = step.setting;
  if (!Object.prototype.hasOwnProperty.call(values, optionId)) return false;
  const value = structuredClone(values[optionId]);
  const parts = path.split('.').filter((p) => p !== '');
  await db.transaction('rw', db.settings, async () => {
    const prev = (await db.settings.get(key))?.value;
    await db.settings.put({ key, value: setPath(prev, parts, value) });
  });
  return true;
}

// ---------- What's New ----------

function parseWhatsNew(v: unknown): WhatsNewState {
  if (!isObj(v)) return {};
  const out: WhatsNewState = {};
  if (typeof v.seenRelease === 'string' && v.seenRelease !== '') out.seenRelease = v.seenRelease;
  if (isObj(v.builds)) {
    const builds = Object.fromEntries(
      Object.entries(v.builds).filter(([, t]) => isTime(t)),
    ) as Record<string, number>;
    if (Object.keys(builds).length) out.builds = builds;
  }
  return out;
}

export async function getWhatsNew(db: GymDb): Promise<WhatsNewState> {
  return parseWhatsNew((await db.settings.get(WHATS_NEW_KEY))?.value);
}

/** The tour of `release` was finished or skipped (or a fresh install). Never moves backwards. */
export async function markSeen(db: GymDb, release: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const s = parseWhatsNew((await db.settings.get(WHATS_NEW_KEY))?.value);
    if (s.seenRelease !== undefined && compareReleases(s.seenRelease, release) >= 0) return;
    await db.settings.put({ key: WHATS_NEW_KEY, value: { ...s, seenRelease: release } });
  });
}

/**
 * The first time this build id runs, remember when (the 7-day re-sign clock; main calls it with
 * `__APP_VERSION__` in the iPhone app). Returns the build's first-seen time. Keeps the oldest
 * build (the app's first launch) and the newest ones, `BUILDS_KEPT` in all.
 */
export async function noteBuildSeen(db: GymDb, buildId: string, now: number): Promise<number> {
  return db.transaction('rw', db.settings, async () => {
    const s = parseWhatsNew((await db.settings.get(WHATS_NEW_KEY))?.value);
    const builds = { ...(s.builds ?? {}) };
    const known = builds[buildId];
    if (known !== undefined) return known;
    builds[buildId] = now;
    const sorted = Object.entries(builds).sort((a, b) => a[1] - b[1]);
    const kept =
      sorted.length > BUILDS_KEPT ? [sorted[0], ...sorted.slice(-(BUILDS_KEPT - 1))] : sorted;
    await db.settings.put({
      key: WHATS_NEW_KEY,
      value: { ...s, builds: Object.fromEntries(kept.filter((e) => e !== undefined)) },
    });
    return now;
  });
}

// ---------- signals ----------

export async function getTodoSignals(db: GymDb): Promise<TodoSignals> {
  const v = (await db.settings.get(TODO_SIGNALS_KEY))?.value;
  return isObj(v) && isTime(v.calendarAfterSessionAt)
    ? { calendarAfterSessionAt: v.calendarAfterSessionAt }
    : {};
}

/** Local midnight of the day that holds `ms`, and the next one. */
function localDay(ms: number): [number, number] {
  const d = new Date(ms);
  return [
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(),
  ];
}

/**
 * Main calls this when the Calendar opens: it is recorded (first time only) when a finished
 * session started that local day. Returns whether the signal is recorded now.
 */
export async function noteSignal(
  db: GymDb,
  signal: 'calendarAfterSession',
  now: number,
): Promise<boolean> {
  const field = `${signal}At` as const;
  return db.transaction('rw', db.settings, db.sessions, async () => {
    const prev = await getTodoSignals(db);
    if (prev[field] !== undefined) return true;
    const [from, to] = localDay(now);
    const trained =
      (await db.sessions
        .where('startedAt')
        .between(from, to, true, false)
        .filter((s) => s.endedAt !== undefined)
        .count()) > 0;
    if (!trained) return false;
    await db.settings.put({ key: TODO_SIGNALS_KEY, value: { ...prev, [field]: now } });
    return true;
  });
}
