/**
 * M12 slice 1c: the counts-only snapshot the to-do detectors read (`TodoFacts`). Every value is a
 * count of rows or days, or a yes/no; no Health value, food or body number, chat text, name or id
 * from a row leaves this function (facts.test.ts searches the output).
 *
 * Sources: `chatMessages` (his messages), `planChanges` (applied proposals by action),
 * `settings` 'health' + `healthDays` + Health weigh-ins (days with data in the last 7),
 * `sessions` + `sets` (camera sets = sets logged with focus `cues`, which only camera sets have;
 * learning exercises by the M4f rule status; Legs B without the leg press), `foodModels`,
 * `foodEntries.source` (photo meals), `settings` 'signing' / 'todoSignals' / 'whatsNew', and the
 * developer log's session events: a hands-free auto start or stop is an `autoSet` event
 * (src/ui/cameraView.ts `logAuto`), the only stored hands-free marker.
 *
 * M12 slice 1b (trainer kit): `sets.effort` on working sets, sessions with a `sets.warmup` row,
 * `settings` 'intake' (answered or not), `measurements` (row count) and `healthDays` rows with a
 * body fat or lean mass reading (day count). The readings, sizes and answers themselves stay put.
 *
 * M12 slice 2 (Checkpoint J): coach messages with `source: 'apple'`, his messages with `viaMic`,
 * `settings` 'reminders' (via `mergeReminders`: any of session / missed day / Sunday recap on) and
 * `checkIns` answered (not skipped, `checkInStatus`). Times and check-in answers stay put.
 */
import { checkInStatus } from '../../core/checkIn/checkIn';
import { ruleStatus } from '../../core/exercises';
import { mergeReminders } from '../../core/reminders/schedule';
import { FACT_COUNTS, FACT_FLAGS, type FactCount, type FactFlag } from '../../core/todo/detectors';
import type { ProposalAction, TodoFacts } from '../../core/types';
import { listCheckIns } from '../checkIn/store';
import type { GymDb } from '../db';
import { HEALTH_SETTINGS_KEY } from '../health/store';
import { getIntake } from '../trainerKit/store';
import { getTodoSignals, getWhatsNew } from './store';

/**
 * Which logged changes count as "coach changes at the gym" (Not today / Go easy / a swap; Do it
 * today was a 'postpone' until Checkpoint J gave it its own action).
 */
const COACH_CHANGE_ACTIONS: readonly ProposalAction[] = [
  'postpone',
  'doToday',
  'avoidArea',
  'swap',
];
/** The M10e swap check: a Legs B session logged without its leg press. */
const LEG_SWAP = { dayId: 'legs-b', fromExerciseId: 'Leg_Press' } as const;
/** Dev-log auto-set actions that only happen with hands-free on. */
const HANDS_FREE_ACTIONS: readonly string[] = ['start', 'stopPending', 'commit', 'hold'];
const HEALTH_DAYS_WINDOW = 7;
/** The effort taps a set can carry (anything else in the field is not counted). */
const EFFORTS: readonly string[] = ['easy', 'good', 'hard'];
const isReading = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The last `n` local dates up to and including today's, as YYYY-MM-DD. */
function lastDates(now: number, n: number): Set<string> {
  const d = new Date(now);
  const out = new Set<string>();
  for (let i = 0; i < n; i++)
    out.add(localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)));
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** A Health day row with any data in it (not just its date). */
function hasHealthData(row: Record<string, unknown>): boolean {
  return Object.entries(row).some(
    ([k, v]) => k !== 'date' && k !== 'hrvSource' && v !== undefined && (!Array.isArray(v) || v.length > 0),
  );
}

async function handsFreeSessions(db: GymDb): Promise<number> {
  const ids = await db.devlogSessions.toCollection().primaryKeys();
  if (ids.length === 0) return 0;
  const chunks = await db.devlogChunks
    .where('setKey')
    .anyOf(ids.map((id) => `${id}#session`))
    .toArray();
  const hit = new Set<string>();
  for (const c of chunks)
    for (const e of c.events ?? [])
      if (
        e.type === 'autoSet' &&
        isObj(e.data) &&
        typeof e.data.action === 'string' &&
        HANDS_FREE_ACTIONS.includes(e.data.action)
      )
        hit.add(c.sessionId);
  return hit.size;
}

export async function gatherFacts(
  db: GymDb,
  platform: TodoFacts['platform'],
  now: number,
  opts: { buildId?: string } = {},
): Promise<TodoFacts> {
  const counts = Object.fromEntries(FACT_COUNTS.map((k) => [k, 0])) as Record<FactCount, number>;
  const flags = Object.fromEntries(FACT_FLAGS.map((k) => [k, false])) as Record<FactFlag, boolean>;

  counts.chatQuestions = await db.chatMessages.filter((m) => m.role === 'user').count();
  // M12 slice 2: Apple's replies and his mic-sent messages.
  counts.appleReplies = await db.chatMessages
    .filter((m) => m.role === 'coach' && m.source === 'apple')
    .count();
  counts.micMessages = await db.chatMessages
    .filter((m) => m.role === 'user' && m.viaMic === true)
    .count();
  const reminders = mergeReminders((await db.settings.get('reminders'))?.value);
  flags.reminderOn =
    reminders.session.on || reminders.missedDay.on || reminders.sundayRecap.on;
  counts.checkInsDone = (await listCheckIns(db)).filter(
    (c) => checkInStatus(c) === 'answered',
  ).length;

  const changes = await db.planChanges.toArray();
  counts.proposalOutcomes = changes.filter((c) => c.action !== 'reset').length;
  counts.coachChanges = changes.filter((c) =>
    (COACH_CHANGE_ACTIONS as readonly string[]).includes(c.action),
  ).length;

  // Health: switched on + local days of the last 7 with any data.
  const health = (await db.settings.get(HEALTH_SETTINGS_KEY))?.value;
  flags.healthConnected =
    isObj(health) && isObj(health.enabled) && Object.values(health.enabled).some((v) => v === true);
  const window = lastDates(now, HEALTH_DAYS_WINDOW);
  const healthDates = new Set<string>();
  for (const d of await db.healthDays.where('date').anyOf([...window]).toArray())
    if (hasHealthData(d as unknown as Record<string, unknown>)) healthDates.add(d.date);
  for (const w of await db.weighIns.where('date').anyOf([...window]).toArray())
    if (w.source === 'health') healthDates.add(w.date);
  counts.healthDays7 = healthDates.size;

  // Builds: the first one ever = the iPhone app's first launch (only it notes builds).
  const builds = Object.entries((await getWhatsNew(db)).builds ?? {});
  const firstLaunch = builds.length ? Math.min(...builds.map(([, t]) => t)) : undefined;
  const sessions = await db.sessions.toArray();
  if (firstLaunch !== undefined)
    counts.nativeSessions = sessions.filter(
      (s) => s.endedAt !== undefined && s.startedAt >= firstLaunch,
    ).length;

  // Sets: camera sets per session, learning exercises on camera, the Legs B swap.
  const sets = await db.sets.toArray();
  const cameraPerSession = new Map<string, number>();
  const learning = new Set<string>();
  const exercisesBySession = new Map<string, Set<string>>();
  const warmupSessions = new Set<string>();
  for (const s of sets) {
    // Trainer kit: warm-up sets mark their workout; effort counts on working sets only.
    if (s.warmup === true) warmupSessions.add(s.sessionId);
    else if (typeof s.effort === 'string' && EFFORTS.includes(s.effort)) counts.effortSets++;
    let ex = exercisesBySession.get(s.sessionId);
    if (!ex) exercisesBySession.set(s.sessionId, (ex = new Set()));
    ex.add(s.exerciseId);
    if (!Array.isArray(s.cues)) continue;
    cameraPerSession.set(s.sessionId, (cameraPerSession.get(s.sessionId) ?? 0) + 1);
    if (ruleStatus(s.exerciseId) === 'learning') learning.add(s.exerciseId);
  }
  counts.maxCameraSetsInSession = Math.max(0, ...cameraPerSession.values());
  counts.learningCameraExercises = learning.size;
  counts.legSwapSessions = sessions.filter((s) => {
    const ex = exercisesBySession.get(s.sessionId);
    return (
      s.dayId === LEG_SWAP.dayId &&
      s.endedAt !== undefined &&
      ex !== undefined &&
      !ex.has(LEG_SWAP.fromExerciseId)
    );
  }).length;

  counts.warmupSessions = warmupSessions.size;
  counts.measurements = await db.measurements.count();
  counts.bodyCompDays = await db.healthDays
    .filter((d) => isReading(d.bodyFatPct) || isReading(d.leanMassKg))
    .count();
  flags.intakeDone = (await getIntake(db)) !== undefined;

  counts.handsFreeSessions = await handsFreeSessions(db);

  flags.foodModel = (await db.foodModels.count()) > 0;
  const photoDays = new Set<string>();
  await db.foodEntries.each((e) => {
    if (e.source === 'photo-local' || e.source === 'photo-ai') photoDays.add(e.date);
  });
  counts.photoMealDays = photoDays.size;

  const signing = (await db.settings.get('signing'))?.value;
  flags.signingPaid = isObj(signing) && signing.signing === 'paid';
  flags.calendarAfterSession = (await getTodoSignals(db)).calendarAfterSessionAt !== undefined;

  const facts: TodoFacts = { platform, now, counts, flags };
  const map = Object.fromEntries(builds);
  const firstSeen =
    opts.buildId !== undefined
      ? map[opts.buildId]
      : builds.length
        ? Math.max(...builds.map(([, t]) => t))
        : undefined;
  if (firstSeen !== undefined) facts.buildFirstSeenAt = firstSeen;
  return facts;
}
