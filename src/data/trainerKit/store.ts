/**
 * M12 slice 1b trainer-kit persistence (Decision "M12 slices 1b + 2"):
 * - settings key 'trainerKit' (M12-q4; read merged with the defaults) and 'intake' (the first-run
 *   answers), both in the existing `settings` table;
 * - Dexie v10 tables `goals`, `measurements` and `dayFeels`.
 * All of it is backed up (src/data/backup.ts) and none of it is ever written to the developer log.
 * Progress photos live apart in src/data/progressPhotos/store.ts (this phone only).
 *
 * Saves check their input and throw RangeError on a bad value (nothing is written). Deletes
 * return the removed row so the UI's Undo can save it back.
 */
import { mergeTrainerKit } from '../../core/trainerKit/defaults';
import type {
  BodyArea,
  DayFeel,
  Goal,
  GoalKind,
  Intake,
  Measurement,
  TrainerKitSettings,
} from '../../core/types';
import type { GymDb } from '../db';

export const TRAINER_KIT_KEY = 'trainerKit';
export const INTAKE_KEY = 'intake';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A real local calendar date, YYYY-MM-DD. */
function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

// Keyed by the union so a new member fails the typecheck here until it is listed.
const AREAS: Record<BodyArea, true> = {
  arms: true,
  shoulders: true,
  chest: true,
  back: true,
  legs: true,
  core: true,
};
const GOAL_KINDS: Record<GoalKind, true> = {
  muscle: true,
  fat: true,
  strength: true,
  general: true,
};
const SESSION_MIN: readonly Intake['sessionMin'][] = [30, 45, 60, 75];
const EXPERIENCE: readonly Intake['experience'][] = ['new', 'some', 'years'];
const ENERGY: readonly NonNullable<DayFeel['energy']>[] = [1, 2, 3, 4, 5];
const TARGET_KINDS: readonly Goal['target']['kind'][] = ['lift', 'measurement', 'weight'];

const isArea = (v: unknown): v is BodyArea => typeof v === 'string' && Object.hasOwn(AREAS, v);

/** The listed areas without repeats, or null when the value isn't a list of known areas. */
function cleanAreas(v: unknown): BodyArea[] | null {
  if (!Array.isArray(v) || !v.every(isArea)) return null;
  return [...new Set(v)];
}

// ---------- trainer-kit setting ----------

/**
 * The trainer-kit setting every slice 1b feature reads: the stored 'trainerKit' row merged over
 * `TRAINER_KIT_DEFAULTS` (no row or a damaged one = the defaults). Never writes.
 */
export async function getTrainerKit(db: GymDb): Promise<TrainerKitSettings> {
  return mergeTrainerKit((await db.settings.get(TRAINER_KIT_KEY))?.value);
}

// ---------- intake ----------

/** A clean copy of the intake answers, or null when a field is outside its choices. */
function parseIntake(v: unknown): Intake | null {
  if (!isObj(v)) return null;
  if (typeof v.goalKind !== 'string' || !Object.hasOwn(GOAL_KINDS, v.goalKind)) return null;
  if (v.goalText !== undefined && typeof v.goalText !== 'string') return null;
  const days = v.days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 2 || days > 6) return null;
  const sessionMin = SESSION_MIN.find((m) => m === v.sessionMin);
  const experience = EXPERIENCE.find((e) => e === v.experience);
  const easyOn = cleanAreas(v.easyOn);
  if (sessionMin === undefined || experience === undefined || easyOn === null) return null;
  if (!isNum(v.at)) return null;
  const goalText = v.goalText?.trim();
  return {
    goalKind: v.goalKind as GoalKind,
    ...(goalText ? { goalText } : {}),
    days,
    sessionMin,
    experience,
    easyOn,
    at: v.at,
  };
}

/** The saved intake answers; undefined when never answered (or skipped) or the row is damaged. */
export async function getIntake(db: GymDb): Promise<Intake | undefined> {
  return parseIntake((await db.settings.get(INTAKE_KEY))?.value) ?? undefined;
}

/**
 * Saves the intake answers (a re-run replaces the earlier ones). Stores answers only: the starter
 * plan, the easy-on list and the fuel targets change through their own Proposals.
 */
export async function saveIntake(db: GymDb, intake: Intake): Promise<void> {
  const value = parseIntake(intake);
  if (value === null) throw new RangeError('Intake answers are outside the choices');
  await db.settings.put({ key: INTAKE_KEY, value });
}

// ---------- goals ----------

function parseTarget(v: unknown): Goal['target'] | null {
  if (!isObj(v)) return null;
  const kind = TARGET_KINDS.find((k) => k === v.kind);
  if (kind === undefined || !isNum(v.value) || v.value <= 0) return null;
  if (v.ref !== undefined && (typeof v.ref !== 'string' || v.ref === '')) return null;
  const reps = v.reps;
  if (reps !== undefined && !(typeof reps === 'number' && Number.isInteger(reps) && reps >= 1))
    return null;
  return {
    kind,
    ...(v.ref !== undefined ? { ref: v.ref } : {}),
    value: v.value,
    ...(reps !== undefined ? { reps } : {}),
  };
}

function cleanGoal(g: Goal): Goal {
  const v: unknown = g;
  const bad = (what: string): never => {
    throw new RangeError(`Goal needs ${what}`);
  };
  if (!isObj(v)) return bad('to be an object');
  if (typeof v.id !== 'string' || v.id === '') return bad('an id');
  const text = typeof v.text === 'string' ? v.text.trim() : '';
  if (text === '') return bad('a text');
  const target = parseTarget(v.target);
  if (target === null) return bad('a measurable target');
  if (!isDate(v.due)) return bad('a due date (YYYY-MM-DD)');
  if (!isNum(v.createdAt)) return bad('a created time');
  if (v.doneAt !== undefined && !isNum(v.doneAt)) return bad('a valid done time');
  return {
    id: v.id,
    text,
    target,
    due: v.due,
    createdAt: v.createdAt,
    ...(v.doneAt !== undefined ? { doneAt: v.doneAt } : {}),
  };
}

/** Adds the goal or replaces the one with the same id (e.g. to set or clear `doneAt`). */
export async function saveGoal(db: GymDb, goal: Goal): Promise<void> {
  await db.goals.put(cleanGoal(goal));
}

/** Every goal, oldest first (done ones included; the caller filters on `doneAt`). */
export async function listGoals(db: GymDb): Promise<Goal[]> {
  return db.goals.orderBy('createdAt').toArray();
}

/** Removes the goal and returns it (for Undo: `saveGoal`); undefined when there is none. */
export async function deleteGoal(db: GymDb, id: string): Promise<Goal | undefined> {
  return db.transaction('rw', db.goals, async () => {
    const row = await db.goals.get(id);
    if (row) await db.goals.delete(id);
    return row;
  });
}

// ---------- measurements ----------

/**
 * Saves one tape measurement in cm; the same date and site again replaces it. `site` is an id
 * from the trainer-kit setting, but any non-empty id is kept, so history survives a changed list.
 */
export async function saveMeasurement(db: GymDb, m: Measurement): Promise<void> {
  if (!isDate(m.date)) throw new RangeError('Measurement needs a date (YYYY-MM-DD)');
  if (typeof m.site !== 'string' || m.site === '') throw new RangeError('Measurement needs a site');
  if (!isNum(m.cm) || m.cm <= 0) throw new RangeError('Measurement needs a size above 0 cm');
  await db.measurements.put({ date: m.date, site: m.site, cm: m.cm });
}

/** Measurements by date, then site; from `sinceDate` on (inclusive) when given. */
export async function listMeasurements(db: GymDb, sinceDate?: string): Promise<Measurement[]> {
  // The primary key is [date+site], so key order is already date, then site.
  const rows = await db.measurements.toArray();
  return sinceDate === undefined ? rows : rows.filter((r) => r.date >= sinceDate);
}

/** Removes one measurement and returns it (for Undo: `saveMeasurement`). */
export async function deleteMeasurement(
  db: GymDb,
  date: string,
  site: string,
): Promise<Measurement | undefined> {
  return db.transaction('rw', db.measurements, async () => {
    const row = await db.measurements.get([date, site]);
    if (row) await db.measurements.delete([date, site]);
    return row;
  });
}

// ---------- day feels ----------

/**
 * Saves how a day feels (one row per date; saving again replaces it). An answer with neither an
 * energy level nor a sore area removes the day's row.
 */
export async function saveDayFeel(db: GymDb, feel: DayFeel): Promise<void> {
  if (!isDate(feel.date)) throw new RangeError('Day feel needs a date (YYYY-MM-DD)');
  const given: unknown = feel.energy;
  const energy = ENERGY.find((e) => e === given);
  if (given !== undefined && energy === undefined) throw new RangeError('Energy is 1 to 5');
  const sore = feel.sore === undefined ? [] : cleanAreas(feel.sore);
  if (sore === null) throw new RangeError('Sore areas must be known body areas');
  if (energy === undefined && sore.length === 0) {
    await db.dayFeels.delete(feel.date);
    return;
  }
  const row: DayFeel = { date: feel.date };
  if (energy !== undefined) row.energy = energy;
  if (sore.length > 0) row.sore = sore;
  await db.dayFeels.put(row);
}

export async function getDayFeel(db: GymDb, date: string): Promise<DayFeel | undefined> {
  return db.dayFeels.get(date);
}

/** Day feels oldest first; from `sinceDate` on (inclusive) when given. */
export async function listDayFeels(db: GymDb, sinceDate?: string): Promise<DayFeel[]> {
  return sinceDate === undefined
    ? db.dayFeels.toArray()
    : db.dayFeels.where('date').aboveOrEqual(sinceDate).toArray();
}

/** Removes one day's feel and returns it (for Undo: `saveDayFeel`). */
export async function deleteDayFeel(db: GymDb, date: string): Promise<DayFeel | undefined> {
  return db.transaction('rw', db.dayFeels, async () => {
    const row = await db.dayFeels.get(date);
    if (row) await db.dayFeels.delete(date);
    return row;
  });
}
