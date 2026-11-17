import Dexie, { type Table } from 'dexie';
import type {
  Accent,
  ChatMessage,
  CheckIn,
  DayFeel,
  Favorite,
  Food,
  FoodEntry,
  FoodModelRecord,
  FoodPhoto,
  Goal,
  HealthDay,
  Measurement,
  PlanChange,
  ProgressPhoto,
  ProposalAction,
  RepEvent,
  Recipe,
  SetLog,
  TodoAnswer,
  TrainerState,
  WeeklyCheck,
  WeighIn,
} from '../core/types';
import type { RuleStatus } from '../core/exercises/types';
import type { Rudeness } from '../core/personas';
import type { Unit } from '../core/units';
import { workingSets } from '../core/warmup';

export type SessionRow = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
  setsDone?: number;
  totalVolumeKg?: number;
  restOverruns?: number;
  /** M10: the adjustments this session ran with (lighter/deload sessions skip stall/bests). Not indexed. */
  adjust?: ProposalAction[];
};

export type SetRow = SetLog & { id?: number };

/** Lasting per-exercise info, shown every time the exercise comes up. */
export type ExerciseNoteRow = {
  exerciseId: string;
  machineSetting: string;
  note: string;
  updatedAt?: number;
};

/** "Today's note" for one exercise in one workout. */
export type SessionNoteRow = {
  sessionId: string;
  exerciseId: string;
  note: string;
  updatedAt: number;
};

export type SettingRow = { key: string; value: unknown };

// ---------- M4c: developer log (on device only; numbers, never images) ----------

export type DevLogCount = { reps: number; partials: number };
export type DevLogEvent = { t: number; type: string; data?: unknown };
/** `dropped` = why the speech policy skipped a hint (see src/core/coachSpeech.ts DropReason). */
export type DevLogSpeech = {
  t: number;
  text: string;
  /** 'cue' = hands-free confirmations ("Set done. 8 reps.", "Keep going.", "Camera off."). */
  kind: 'count' | 'hint' | 'placement' | 'cue';
  dropped?: 'rate' | 'stale' | 'superseded' | 'interrupted';
};
/** `wallT0` = Date.now() when the camera's frame clock started, to line frames up with events. */
export type DevLogCameraMeta = {
  folder: string;
  delegate: string;
  side: string | null;
  wallT0?: number;
};

/** One logged workout session. `bytes` is the approximate stored size of its log. */
export type DevLogSessionRow = {
  id: string;
  startedAt: number;
  endedAt?: number;
  appVersion: string;
  userAgent: string;
  settings: Record<string, unknown>;
  dayId: string;
  bytes: number;
};

/** One set (manual or camera). `logged`/`endedAt` are missing while the set is open. */
export type DevLogSetRow = {
  key: string;
  sessionId: string;
  seq: number;
  exerciseId: string;
  setIndex: number;
  targetReps: [number, number];
  counted?: DevLogCount;
  logged?: DevLogCount;
  weightKg: number;
  startedAt: number;
  endedAt?: number;
  restTakenSec?: number;
  camera?: DevLogCameraMeta;
  /**
   * M4f: the camera rule's status when the set started. Exported in the set's `camera` block.
   * Not indexed, so no schema version bump; rows from before M4f simply lack it.
   */
  ruleStatus?: RuleStatus;
};

/**
 * What one flush appended, for one set (`setKey` = the set's key) or for the session's own
 * events (`setKey` = `<sessionId>#session`). Frames are devlogCodec bytes.
 */
export type DevLogChunkRow = {
  id?: number;
  sessionId: string;
  setKey: string;
  events?: DevLogEvent[];
  frames?: Uint8Array;
  angles?: { t: number; angle: number | null }[];
  repEvents?: RepEvent[];
  speech?: DevLogSpeech[];
  fps?: { t: number; fps: number }[];
  bytes: number;
};

/** M10: the one trainer state row (`key` is always `'current'`). See src/data/plan.ts. */
export type TrainerRow = { key: 'current'; state: TrainerState };

export class GymDb extends Dexie {
  sessions!: Table<SessionRow, string>;
  sets!: Table<SetRow, number>;
  exerciseNotes!: Table<ExerciseNoteRow, string>;
  sessionNotes!: Table<SessionNoteRow, [string, string]>;
  settings!: Table<SettingRow, string>;
  devlogSessions!: Table<DevLogSessionRow, string>;
  devlogSets!: Table<DevLogSetRow, string>;
  devlogChunks!: Table<DevLogChunkRow, number>;
  trainer!: Table<TrainerRow, string>;
  planChanges!: Table<PlanChange, number>;
  // M7 nutrition (on device only; see src/data/nutrition/store.ts)
  foods!: Table<Food, string>;
  recipes!: Table<Recipe, string>;
  foodEntries!: Table<FoodEntry, string>;
  /** One row per local date; saving the same date again replaces it (M7-q10). */
  weighIns!: Table<WeighIn, string>;
  favorites!: Table<Favorite, string>;
  weeklyChecks!: Table<WeeklyCheck, string>;
  // M7b food photos (on device only; see src/data/nutrition/photoStore.ts). Not in backups.
  /** The one imported food classifier (`id` is always 'food'). */
  foodModels!: Table<FoodModelRecord, string>;
  /** Labelled meal photos, saved only when "Save photos" is on. */
  foodPhotos!: Table<FoodPhoto, string>;
  // M11 Health (on device only; see src/data/health/store.ts). Not in backups, never in the dev log.
  /** One derived summary per local date (never raw samples). */
  healthDays!: Table<HealthDay, string>;
  // M12 chat (on device only; see src/data/chat/store.ts). Not in backups, never in the dev log.
  /** The coach thread, last 30 days (pruned by `pruneChat`). */
  chatMessages!: Table<ChatMessage, number>;
  // M12 slice 1c to-dos (see src/data/todos/store.ts). Backed up (his own answers and notes, no
  // Health values); never in the dev log. Tour / to-do state lives in `settings` keys 'whatsNew',
  // 'todos' and 'todoSignals'.
  todoAnswers!: Table<TodoAnswer, string>;
  // M12 slice 1b trainer kit (see src/data/trainerKit/store.ts). Backed up; never in the dev log.
  // The intake answers and the trainer-kit setting live in `settings` keys 'intake' / 'trainerKit'.
  /** One tape measurement per local date and site; saving the same pair again replaces it. */
  measurements!: Table<Measurement, [string, string]>;
  goals!: Table<Goal, string>;
  /** One "how I feel today" answer per local date. */
  dayFeels!: Table<DayFeel, string>;
  // M12 slice 1b progress photos (see src/data/progressPhotos/store.ts). This phone only: not in
  // backups, never in the dev log, never sent or shown to a coach.
  progressPhotos!: Table<ProgressPhoto, string>;
  // M12 slice 2 weekly check-in (see src/data/checkIn/store.ts), one row per Mon–Sun week. Backed
  // up; never in the dev log or any brain context. Reminder settings live in `settings`
  // key 'reminders'.
  checkIns!: Table<CheckIn, string>;

  constructor(name = 'gym-clean') {
    super(name);
    this.version(1).stores({
      sessions: 'sessionId, dayId, startedAt',
      sets: '++id, sessionId, exerciseId, startedAt, [exerciseId+startedAt]',
    });
    this.version(2).stores({
      exerciseNotes: 'exerciseId',
      sessionNotes: '[sessionId+exerciseId], sessionId',
      settings: 'key',
    });
    // M4c: developer log. New tables only; existing data is untouched.
    this.version(3).stores({
      devlogSessions: 'id, startedAt',
      devlogSets: 'key, sessionId, [sessionId+seq]',
      devlogChunks: '++id, sessionId, setKey',
    });
    // M10: trainer state + plan change log. New tables only (SessionRow.adjust isn't indexed).
    this.version(4).stores({
      trainer: 'key',
      planChanges: '++id, createdAt',
    });
    // M7 nutrition. New tables only; existing data is untouched. Nutrition settings live in the
    // existing `settings` table under key 'nutrition'.
    this.version(5).stores({
      foods: 'id, name, barcode',
      recipes: 'id',
      foodEntries: 'id, date, time',
      weighIns: 'date',
      favorites: 'id, createdAt',
      weeklyChecks: 'weekStart',
    });
    // M7b food photos. New tables only, no upgrade function; existing data is untouched. The
    // food-vision settings live in the existing `settings` table under key 'foodVision'.
    this.version(6).stores({
      foodModels: 'id',
      foodPhotos: 'id, createdAt, dishId',
    });
    // M11 Health. New table only, no upgrade function; existing data is untouched. Weigh-ins gain
    // an optional, unindexed `source` (old rows have none and read as typed by hand). The health
    // settings live in the existing `settings` table under key 'health'.
    this.version(7).stores({
      healthDays: 'date',
    });
    // M12 chat. New table only, no upgrade function; existing data is untouched. Coach UI state
    // (missed-day answers, last recaps) lives in the existing `settings` table under key 'coach'.
    this.version(8).stores({
      chatMessages: '++id, createdAt',
    });
    // M12 slice 1c to-do answers. New table only, no upgrade function; existing data is untouched.
    this.version(9).stores({
      todoAnswers: 'id, topicId, at, sentAt',
    });
    // M12 slice 1b trainer kit. New tables only, no upgrade function; existing data is untouched.
    // `SetLog.effort` / `warmup` are optional and unindexed (old rows have neither).
    this.version(10).stores({
      measurements: '[date+site], date',
      goals: 'id, createdAt',
      dayFeels: 'date',
      progressPhotos: 'id, date, createdAt',
    });
    // M12 slice 2 weekly check-in. New table only, no upgrade function; existing data is untouched.
    this.version(11).stores({
      checkIns: 'weekStart',
    });
  }
}

export async function startSessionRow(db: GymDb, row: SessionRow): Promise<void> {
  await db.sessions.put(row);
}

export async function finishSession(
  db: GymDb,
  sessionId: string,
  endedAt: number,
  summary: Pick<SessionRow, 'setsDone' | 'totalVolumeKg' | 'restOverruns'>,
): Promise<void> {
  await db.sessions.update(sessionId, { endedAt, ...summary });
}

export async function saveSet(db: GymDb, log: SetLog): Promise<number> {
  return db.sets.add({ ...log });
}

export async function setsForSession(db: GymDb, sessionId: string): Promise<SetRow[]> {
  return db.sets.where('sessionId').equals(sessionId).sortBy('startedAt');
}

// ---------- M1b: notes, settings, last time ----------

export async function getExerciseNote(db: GymDb, exerciseId: string): Promise<ExerciseNoteRow> {
  return (await db.exerciseNotes.get(exerciseId)) ?? { exerciseId, machineSetting: '', note: '' };
}

export async function saveExerciseNote(
  db: GymDb,
  row: Pick<ExerciseNoteRow, 'exerciseId' | 'machineSetting' | 'note'>,
): Promise<void> {
  await db.exerciseNotes.put({ ...row, updatedAt: Date.now() });
}

export async function saveSessionNote(
  db: GymDb,
  sessionId: string,
  exerciseId: string,
  note: string,
): Promise<void> {
  await db.sessionNotes.put({ sessionId, exerciseId, note, updatedAt: Date.now() });
}

export async function sessionNotes(db: GymDb, sessionId: string): Promise<Record<string, string>> {
  const rows = await db.sessionNotes.where('sessionId').equals(sessionId).toArray();
  return Object.fromEntries(rows.filter((r) => r.note).map((r) => [r.exerciseId, r.note]));
}

export async function getUnit(db: GymDb): Promise<Unit> {
  const row = await db.settings.get('unit');
  return row?.value === 'lb' ? 'lb' : 'kg';
}

export async function setUnit(db: GymDb, unit: Unit): Promise<void> {
  await db.settings.put({ key: 'unit', value: unit });
}

/** M4: speak each counted rep ("One", "Two"…). Default on; only an explicit false turns it off. */
export async function getSpokenCount(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('spokenCount');
  return row?.value !== false;
}

export async function setSpokenCount(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'spokenCount', value: on });
}

/** M5b: show (and speak) the after-set coach tip on Rest. Default on; only an explicit false turns it off. */
export async function getCoachTips(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('coachTips');
  return row?.value !== false;
}

export async function setCoachTips(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'coachTips', value: on });
}

/** M5c "Hands-free sets" (auto start/stop on camera exercises). On unless explicitly false. */
export async function getHandsFree(db: GymDb): Promise<boolean> {
  const row = await db.settings.get('handsFree');
  return row?.value !== false;
}

export async function setHandsFree(db: GymDb, on: boolean): Promise<void> {
  await db.settings.put({ key: 'handsFree', value: on });
}

const ACCENTS: readonly Accent[] = ['orange', 'volt', 'yellow'];

/** M4e accent theme. Default orange; an unknown stored value reads as orange. */
export async function getAccent(db: GymDb): Promise<Accent> {
  const v = (await db.settings.get('accent'))?.value;
  return ACCENTS.find((a) => a === v) ?? 'orange';
}

export async function setAccent(db: GymDb, accent: Accent): Promise<void> {
  await db.settings.put({ key: 'accent', value: accent });
}

/** Coach voice (drill-sergeant design 2026-11-13): persona, its rudeness level, chosen voice. */
export type CoachVoice = {
  persona: 'calm' | 'drill';
  rudeness: Rudeness;
  /** SpeechSynthesisVoice.name picked in Settings; null = the default order. */
  voiceName: string | null;
};

export const COACH_VOICE_DEFAULT: Readonly<CoachVoice> = Object.freeze({
  persona: 'calm',
  rudeness: 2,
  voiceName: null,
});

/** Stored coach voice; each bad or missing field falls back to its default. */
export async function getCoachVoice(db: GymDb): Promise<CoachVoice> {
  const row = await db.settings.get('coachVoice');
  const v: Record<string, unknown> =
    typeof row?.value === 'object' && row.value !== null
      ? (row.value as Record<string, unknown>)
      : {};
  const d = COACH_VOICE_DEFAULT;
  return {
    persona: v.persona === 'drill' || v.persona === 'calm' ? v.persona : d.persona,
    rudeness: v.rudeness === 1 || v.rudeness === 2 || v.rudeness === 3 ? v.rudeness : d.rudeness,
    voiceName: typeof v.voiceName === 'string' ? v.voiceName : d.voiceName,
  };
}

export async function setCoachVoice(db: GymDb, v: CoachVoice): Promise<void> {
  const value: CoachVoice = { persona: v.persona, rudeness: v.rudeness, voiceName: v.voiceName };
  await db.settings.put({ key: 'coachVoice', value });
}

/**
 * For each exercise, the working sets from the most recent session other than `excludeSessionId`
 * that has any. Warm-ups (`warmup: true`, M12 1b) are ignored both when choosing the session and
 * in the result, so a warm-up-only session never hides the real last time.
 */
export async function lastSessionSets(
  db: GymDb,
  exerciseIds: string[],
  excludeSessionId?: string,
): Promise<Record<string, SetRow[]>> {
  const out: Record<string, SetRow[]> = {};
  for (const id of new Set(exerciseIds)) {
    const rows = await db.sets
      .where('[exerciseId+startedAt]')
      .between([id, Dexie.minKey], [id, Dexie.maxKey])
      .reverse()
      .toArray();
    const working = workingSets(rows);
    const latest = working.find((r) => r.sessionId !== excludeSessionId);
    if (!latest) continue;
    out[id] = working.filter((r) => r.sessionId === latest.sessionId).reverse();
  }
  return out;
}

/** Weight of the final set per exercise, for session defaults. */
export function lastWeights(last: Record<string, SetRow[]>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, rows] of Object.entries(last)) {
    const final = rows.at(-1);
    if (final) out[id] = final.weightKg;
  }
  return out;
}

// ---------- M4e: history for the Today / Summary selectors (src/core/stats.ts) ----------

/** Sessions started at or after `sinceMs` (finished or not), oldest first. */
export async function sessionsSince(db: GymDb, sinceMs: number): Promise<SessionRow[]> {
  return db.sessions.where('startedAt').aboveOrEqual(sinceMs).sortBy('startedAt');
}

/** All sets of the given sessions, in start order. */
export async function setsForSessions(db: GymDb, sessionIds: string[]): Promise<SetRow[]> {
  if (sessionIds.length === 0) return [];
  return db.sets
    .where('sessionId')
    .anyOf([...new Set(sessionIds)])
    .sortBy('startedAt');
}

/** Every logged set of the given exercises (all sessions), in start order; for `newBests`. */
export async function setsForExercises(db: GymDb, exerciseIds: string[]): Promise<SetRow[]> {
  if (exerciseIds.length === 0) return [];
  return db.sets
    .where('exerciseId')
    .anyOf([...new Set(exerciseIds)])
    .sortBy('startedAt');
}

// ---------- M6: History (src/core/history.ts) ----------

/**
 * Finished sessions started at or after `sinceMs` (oldest first) and only their sets (start
 * order). Feed `sinceMs` from `historyWindowStart` / `lastDaysStart` in src/core/history.ts.
 */
export async function finishedHistorySince(
  db: GymDb,
  sinceMs: number,
): Promise<{ sessions: SessionRow[]; sets: SetRow[] }> {
  const sessions = (await sessionsSince(db, sinceMs)).filter((s) => s.endedAt !== undefined);
  const sets = await setsForSessions(
    db,
    sessions.map((s) => s.sessionId),
  );
  return { sessions, sets };
}
