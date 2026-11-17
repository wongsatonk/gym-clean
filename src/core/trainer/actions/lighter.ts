/**
 * M10 actions "Lighter today" and "Deload week" (SPEC M10 goal 2), plus the helpers the other
 * day-level actions (avoid area, swap) share. Pure: dates, history and the unit are passed in.
 *
 * - Lighter today: every exercise −1 set (minimum 2; a 1-set exercise stays 1), weight −10%
 *   snapped **down** to the display-unit step (never below one step, never heavier), and a
 *   bodyweight exercise (weight 0) gets its rep target −20% instead. Written as today's override.
 * - Deload week: the 7 days from today; each training date that isn't done gets a dated override
 *   pinned to its day id, with sets halved (rounded up) and the same −10% / −20% rule.
 *   Rest dates are skipped. The constants are provisional (M10-q3).
 * - Weights are lightened from what the set would default to (session `defaultsFor`):
 *   `weightKgToday`, else last time, else the plan's start weight. A row with no weight at all
 *   (swapped in, no history) keeps its blank weight. The result is stored as `weightKgToday`,
 *   already on the unit step (the session uses it as given).
 * - The day is changed as it will run (stacking on an avoid-area or swap override), except that
 *   an override of the same kind (or lighter under a deload) is rebuilt from the plan day, so
 *   asking twice doesn't halve twice.
 * - Mid-workout, rows in `started` (exercises with logged sets) are left as they are.
 */
import { formatWeight, fromUnit, snapToStep, stepFor, toUnit, type Unit } from '../../units';
import { baseDay, calendar, effectiveDay, type PlanSession } from '../plan';
import type { RowReplacement } from '../rows';
import type {
  DayAdjust,
  DayOverride,
  PlannedExercise,
  ProgramDay,
  Proposal,
  TrainerState,
} from '../../types';

/** M10-q3 defaults (provisional). */
export const LIGHTER = {
  setsDrop: 1,
  minSets: 2,
  weightFactor: 0.9,
  bodyweightRepsFactor: 0.8,
} as const;
export const DELOAD = { days: 7, setsFactor: 0.5, weightFactor: 0.9 } as const;

export type ActionContext = {
  state: TrainerState;
  /** Sessions for the calendar (`SessionRow` fits). */
  sessions: readonly PlanSession[];
  /** Local YYYY-MM-DD. */
  today: string;
  /** Display unit: weights snap down to its step. */
  unit: Unit;
  /** Last logged weight per exercise id (kg), as the session's `lastWeightKg`. */
  lastWeightKg: Readonly<Record<string, number>>;
  /** Exercise ids with logged sets in today's running session: left unchanged. */
  started?: readonly string[];
  /** Display names; defaults to the id with spaces. */
  exerciseName?: (exerciseId: string) => string;
};

export type ActionRefusal =
  | 'restDay'
  | 'doneToday'
  | 'noDay'
  | 'nothingToChange'
  | 'nothingInArea'
  | 'wholeDay'
  | 'unknownExercise'
  | 'notInDay'
  | 'notInPlan'
  | 'started'
  | 'noCandidate';

export type ActionResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; reason: ActionRefusal; reply: string; suggest?: 'postpone' };

export const REPLIES = {
  restDay: "Today is a rest day, so there's nothing to change.",
  doneToday: "Today's workout is already done.",
  noDay: "There's no workout planned for today.",
} as const;

export function refuse(
  reason: ActionRefusal,
  reply: string,
  suggest?: 'postpone',
): Extract<ActionResult, { ok: false }> {
  return suggest ? { ok: false, reason, reply, suggest } : { ok: false, reason, reply };
}

// ---------- weights and rows ----------

const EPS = 1e-9;

/** −10% (or `factor`), snapped down to the unit step; at least one step; never heavier. */
export function lighterWeightKg(
  kg: number,
  unit: Unit,
  factor: number = LIGHTER.weightFactor,
): number {
  if (!(kg > 0)) return kg;
  const step = stepFor(unit);
  const shown = toUnit(kg, unit);
  const down = Math.max(Math.floor((shown * factor) / step + EPS) * step, step);
  return down >= shown - EPS ? kg : fromUnit(down, unit);
}

/** What the next set would default to (session `defaultsFor`): null = no weight yet. */
export function baseWeightKg(
  p: PlannedExercise,
  ctx: Pick<ActionContext, 'lastWeightKg' | 'unit'>,
): number | null {
  if (p.weightKgToday !== undefined && Number.isFinite(p.weightKgToday) && p.weightKgToday >= 0)
    return p.weightKgToday;
  const last = ctx.lastWeightKg[p.exerciseId];
  if (last !== undefined) return last;
  return p.startWeightKg === undefined ? null : snapToStep(p.startWeightKg, ctx.unit);
}

/**
 * The row with sets mapped, weight −10% (as `weightKgToday`) or bodyweight reps −20%, marked
 * `adjusted` when anything changed.
 */
export function lightenRow(
  p: PlannedExercise,
  ctx: Pick<ActionContext, 'lastWeightKg' | 'unit'>,
  kind: NonNullable<PlannedExercise['adjusted']>,
  sets: (n: number) => number = (n) => n,
  factor: number = LIGHTER.weightFactor,
): PlannedExercise {
  const out: PlannedExercise = { ...p, sets: sets(p.sets) };
  const base = baseWeightKg(p, ctx);
  if (base === 0) {
    const r = (n: number) => Math.max(1, Math.round(n * LIGHTER.bodyweightRepsFactor));
    out.targetReps = [r(p.targetReps[0]), r(p.targetReps[1])];
  } else if (base !== null) {
    out.weightKgToday = lighterWeightKg(base, ctx.unit, factor);
  }
  const changed =
    out.sets !== p.sets ||
    out.targetReps[0] !== p.targetReps[0] ||
    out.targetReps[1] !== p.targetReps[1] ||
    (base !== null &&
      base > 0 &&
      out.weightKgToday !== undefined &&
      out.weightKgToday < base - EPS);
  if (!changed) return p;
  out.adjusted = kind;
  return out;
}

const lighterSets = (n: number) => Math.max(Math.min(n, LIGHTER.minSets), n - LIGHTER.setsDrop);
const deloadSets = (n: number) => Math.max(1, Math.ceil(n * DELOAD.setsFactor));

// ---------- copy ----------

export function nameOf(ctx: Pick<ActionContext, 'exerciseName'>, id: string): string {
  return ctx.exerciseName ? ctx.exerciseName(id) : id.replace(/_/g, ' ');
}

const repsText = ([a, b]: PlannedExercise['targetReps']) => (a === b ? `${a}` : `${a}–${b}`);

/** "15 kg", "bodyweight" or "pick your weight". */
export function weightText(kg: number | null, unit: Unit): string {
  if (kg === null) return 'pick your weight';
  if (kg === 0) return 'bodyweight';
  return `${formatWeight(kg, unit)} ${unit}`;
}

/** "3 × 8–12 · 15 kg" as the row would run. */
export function rowText(
  p: PlannedExercise,
  ctx: Pick<ActionContext, 'lastWeightKg' | 'unit'>,
): string {
  return `${p.sets} × ${repsText(p.targetReps)} · ${weightText(baseWeightKg(p, ctx), ctx.unit)}`;
}

/** before "Name · 4 × 8 · 15 kg", after "3 × 8 · 12.5 kg". */
export function rowLine(
  before: PlannedExercise,
  after: PlannedExercise,
  ctx: Pick<ActionContext, 'lastWeightKg' | 'unit' | 'exerciseName'>,
): Proposal['lines'][number] {
  return {
    before: `${nameOf(ctx, before.exerciseId)} · ${rowText(before, ctx)}`,
    after: rowText(after, ctx),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Wed 11 Nov" for a local YYYY-MM-DD. */
export function dateText(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[wd] ?? ''} ${d} ${MONTHS[m - 1] ?? ''}`;
}

// ---------- days and overrides ----------

export type TodayDay = { ok: true; day: ProgramDay; override?: DayOverride };

/** Today's day as it will run, or why there's nothing to change. */
export function todayDay(ctx: ActionContext): TodayDay | Extract<ActionResult, { ok: false }> {
  const e = effectiveDay(ctx.state, ctx.sessions, ctx.today);
  if (e.done) return refuse('doneToday', REPLIES.doneToday);
  if (e.rest) return refuse('restDay', REPLIES.restDay);
  if (!e.day) return refuse('noDay', REPLIES.noDay);
  return e.override ? { ok: true, day: e.day, override: e.override } : { ok: true, day: e.day };
}

/**
 * The rows to change: the day as it will run, or the planned day when the date's adjust is one
 * of `rebuild` (so the same action twice doesn't compound). With `date`, the planned day is the
 * focus block's version on a block date (M12); without it, the plan day.
 */
export function baseRows(
  state: TrainerState,
  dayId: string,
  override: DayOverride | undefined,
  rebuild: readonly DayAdjust['kind'][],
  date?: string,
): PlannedExercise[] {
  const adjust = override?.adjust;
  if (adjust && !rebuild.includes(adjust.kind)) return structuredClone(adjust.exercises);
  const day =
    date === undefined ? state.plan.days.find((d) => d.id === dayId) : baseDay(state, date, dayId);
  return structuredClone(day?.exercises ?? []);
}

/**
 * The row map (DayAdjust.replaced) that goes with `baseRows`: the override's own when its rows
 * are the base, else empty (rebuilt from the plan day).
 */
export function baseReplaced(
  override: DayOverride | undefined,
  rebuild: readonly DayAdjust['kind'][],
): RowReplacement[] {
  const adjust = override?.adjust;
  if (adjust && !rebuild.includes(adjust.kind)) return structuredClone(adjust.replaced ?? []);
  return [];
}

/**
 * `prev` (the base rows' map) followed by this change's own replacements `local` (base row id →
 * new id or null). A chain is followed: plan a → x earlier and x → y now gives a → y and x → y.
 * One entry per `fromId`, the latest wins; a row swapped back to itself is dropped.
 */
export function composeReplaced(
  prev: readonly RowReplacement[],
  local: readonly RowReplacement[],
): RowReplacement[] {
  const now = new Map(local.map((r) => [r.fromId, r.toId]));
  const out = new Map<string, string | null>();
  for (const r of prev) {
    const toId = r.toId !== null && now.has(r.toId) ? (now.get(r.toId) ?? null) : r.toId;
    out.set(r.fromId, toId);
  }
  for (const r of local) {
    out.delete(r.fromId);
    out.set(r.fromId, r.toId);
  }
  // A row swapped back to its original is in the day again: not a replacement.
  return [...out]
    .filter(([fromId, toId]) => fromId !== toId)
    .map(([fromId, toId]) => ({ fromId, toId }));
}

/** The state with `date`'s overrides replaced by one running `dayId` with `adjust`. */
export function withDayAdjust(
  state: TrainerState,
  date: string,
  dayId: string,
  adjust: DayAdjust,
): TrainerState {
  return {
    ...state,
    overrides: [...state.overrides.filter((o) => o.date !== date), { date, dayId, adjust }],
  };
}

const isStarted = (ctx: ActionContext, p: PlannedExercise) =>
  (ctx.started ?? []).includes(p.exerciseId);

// ---------- actions ----------

export function proposeLighter(ctx: ActionContext): ActionResult {
  const today = todayDay(ctx);
  if (!today.ok) return today;
  const rows = baseRows(ctx.state, today.day.id, today.override, ['lighter'], ctx.today);
  const lines: Proposal['lines'] = [];
  const out = rows.map((p) => {
    if (isStarted(ctx, p)) return p;
    const q = lightenRow(p, ctx, 'lighter', lighterSets);
    if (q !== p) lines.push(rowLine(p, q, ctx));
    return q;
  });
  if (lines.length === 0) return refuse('nothingToChange', 'Today is already as light as it goes.');
  return {
    ok: true,
    proposal: {
      action: 'lighter',
      scope: 'today',
      title: 'Lighter today',
      lines,
      why: 'One set fewer and about 10% lighter, so you still train but keep some energy in the tank.',
      say: 'Done. Today is lighter.',
      next: withDayAdjust(ctx.state, ctx.today, today.day.id, {
        kind: 'lighter',
        exercises: out,
        replaced: baseReplaced(today.override, ['lighter']),
      }),
      baseVersion: ctx.state.version,
    },
  };
}

const totalSets = (rows: readonly PlannedExercise[]) => rows.reduce((n, r) => n + r.sets, 0);

export function proposeDeload(ctx: ActionContext): ActionResult {
  let next = ctx.state;
  const lines: Proposal['lines'] = [];
  for (const e of calendar(ctx.state, ctx.sessions, ctx.today, DELOAD.days)) {
    if (e.rest || e.done || e.dayId === null) continue;
    const day = baseDay(ctx.state, e.date, e.dayId);
    if (!day) continue;
    const rows = baseRows(ctx.state, e.dayId, e.override, ['lighter', 'deload'], e.date);
    const isToday = e.date === ctx.today;
    const out = rows.map((p) =>
      isToday && isStarted(ctx, p)
        ? p
        : lightenRow(p, ctx, 'deload', deloadSets, DELOAD.weightFactor),
    );
    next = withDayAdjust(next, e.date, e.dayId, {
      kind: 'deload',
      exercises: out,
      replaced: baseReplaced(e.override, ['lighter', 'deload']),
    });
    lines.push({
      before: `${dateText(e.date)} · ${day.name} · ${totalSets(rows)} sets`,
      after: `${totalSets(out)} sets · about 10% lighter`,
    });
  }
  if (lines.length === 0)
    return refuse('nothingToChange', 'No workouts in the next 7 days to make lighter.');
  return {
    ok: true,
    proposal: {
      action: 'deload',
      scope: 'dated',
      title: 'Deload week',
      lines,
      why: 'For 7 days: half the sets and about 10% lighter. Then the plan picks up where it was.',
      say: 'Done. Deload week is on.',
      next,
      baseVersion: ctx.state.version,
    },
  };
}
