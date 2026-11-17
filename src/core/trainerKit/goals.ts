/**
 * M12 slice 1b (trainer kit item 3): the Goal card. Pure; `today` / `now` are passed in.
 *
 * - `suggestGoals`: 1–2 measurable targets + a date from the intake's goal kind, built from what
 *   is already logged (rules in goalRules.ts). A lift target is based on the estimated max; a
 *   measurement or body-weight target on the latest value. With nothing logged there is no
 *   honest number to suggest, so `needs` says what to log first.
 * - `goalProgress`: % of the way from the value when the goal was set to the target, and whether
 *   that keeps up with the calendar.
 *
 * Targets are plans, not promises; texts pass `checkCopy`.
 */
import { currentWeight, dedupeWeighIns } from '../nutrition/targets';
import { bestSetE1rm, e1rm, e1rmSeriesByLift, type E1rmFormula, type E1rmPoint, type E1rmSession } from '../progress/e1rm';
import { formatLength, lengthUnitFor, siteLabel } from '../progress/measurements';
import { addDate, localDate } from '../trainer/plan';
import { formatWeight, fromUnit, stepFor, toUnit, type Unit } from '../units';
import type { Goal, Intake, Measurement, SetLog, WeighIn } from '../types';
import {
  EXPERIENCE_GAIN,
  GOAL_BASELINE_DAYS,
  GOAL_RULES,
  GOAL_WEEKS,
  MAX_GOALS,
  ON_TRACK_SLACK_PCT,
  type GoalTemplate,
} from './goalRules';

export type GoalHistory = {
  /** Local YYYY-MM-DD. */
  today: string;
  /** ms; becomes `createdAt`. */
  now: number;
  sets: readonly SetLog[];
  /** `SessionRow` fits; only finished sessions count. */
  sessions: readonly E1rmSession[];
  measurements: readonly Measurement[];
  weighIns: readonly WeighIn[];
  /** Exercise id → name for the goal text (the catalog's names). */
  exerciseNames: Readonly<Record<string, string>>;
  unit: Unit;
  /** settings 'trainerKit' `measurementSites`. */
  sites: readonly string[];
  /** settings 'trainerKit' `e1rmFormula`. */
  formula?: E1rmFormula;
  /** Lifts to prefer, in order (e.g. the plan's main lifts); else the lift done in the most sessions. */
  preferLifts?: readonly string[];
};

/** What to log before a target of that kind can be suggested. */
export type GoalNeed = 'lift' | 'measurement' | 'weighIn';

export type GoalSuggestion = { goals: Goal[]; needs: GoalNeed[] };

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Lifts with a chart, preferred ones first, then most sessions, then id. */
function liftOrder(series: Map<string, E1rmPoint[]>, prefer: readonly string[]): string[] {
  const rank = (id: string) => {
    const i = prefer.indexOf(id);
    return i === -1 ? prefer.length : i;
  };
  return [...series.keys()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (series.get(b)?.length ?? 0) - (series.get(a)?.length ?? 0) ||
      (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** Best estimate of the normal (not lighter) sessions in the baseline window, else the latest point. */
function liftBaseline(points: readonly E1rmPoint[], today: string): number | null {
  const from = addDate(today, -GOAL_BASELINE_DAYS);
  let best: number | null = null;
  for (const p of points) {
    if (p.lighter || p.date < from || p.date > today) continue;
    if (best === null || p.e1rmKg > best) best = p.e1rmKg;
  }
  return best ?? points[points.length - 1]?.e1rmKg ?? null;
}

function liftGoal(
  exerciseId: string,
  baselineKg: number,
  t: Extract<GoalTemplate, { kind: 'lift' }>,
  intake: Intake,
  h: GoalHistory,
  due: string,
): Goal {
  const formula = h.formula ?? 'epley';
  const step = stepFor(h.unit);
  const perRep = e1rm(1, t.reps, formula) ?? 1; // estimate per kg lifted for `reps` reps
  const gain = 1 + (t.gainPct * EXPERIENCE_GAIN[intake.experience]) / 100;
  let steps = Math.max(1, Math.round(toUnit((baselineKg * gain) / perRep, h.unit) / step));
  // Snapping must not land at or under today's estimate.
  while ((e1rm(fromUnit(steps * step, h.unit), t.reps, formula) ?? 0) <= baselineKg) steps += 1;
  const kg = fromUnit(steps * step, h.unit);
  const name = h.exerciseNames[exerciseId] ?? exerciseId;
  return {
    id: `${h.now}-lift-${exerciseId}`,
    text: `${name} ${formatWeight(kg, h.unit)} ${h.unit} × ${t.reps} by ${due}`,
    target: { kind: 'lift', ref: exerciseId, value: kg, reps: t.reps },
    due,
    createdAt: h.now,
  };
}

function latestAt(measurements: readonly Measurement[], site: string, today: string): Measurement | null {
  let latest: Measurement | null = null;
  for (const m of measurements) {
    if (m.site !== site || m.date > today) continue;
    if (!latest || m.date >= latest.date) latest = m;
  }
  return latest;
}

/**
 * 1–2 targets for the intake's goal kind, due `GOAL_WEEKS` weeks from today. Deterministic.
 * Feed it sets of finished sessions; warm-ups and lighter/deload sessions never set a baseline.
 */
export function suggestGoals(intake: Intake, history: GoalHistory): GoalSuggestion {
  const h = history;
  const due = addDate(h.today, GOAL_WEEKS * 7);
  const series = e1rmSeriesByLift(h.sets, h.sessions, { formula: h.formula });
  const lifts = liftOrder(series, h.preferLifts ?? []);
  const goals: Goal[] = [];
  const needs: GoalNeed[] = [];
  const need = (n: GoalNeed) => {
    if (!needs.includes(n)) needs.push(n);
  };
  let liftsUsed = 0;

  for (const t of GOAL_RULES[intake.goalKind].targets) {
    if (goals.length >= MAX_GOALS) break;
    if (t.kind === 'lift') {
      const id = lifts[liftsUsed];
      const baseline = id === undefined ? null : liftBaseline(series.get(id) ?? [], h.today);
      if (id === undefined || baseline === null) {
        if (liftsUsed === 0) need('lift');
        continue;
      }
      liftsUsed += 1;
      goals.push(liftGoal(id, baseline, t, intake, h, due));
    } else if (t.kind === 'measurement') {
      const base = t.sites
        .filter((s) => h.sites.includes(s))
        .map((s) => latestAt(h.measurements, s, h.today))
        .find((m) => m !== null);
      if (!base) {
        need('measurement');
        continue;
      }
      goals.push({
        id: `${h.now}-measurement-${base.site}`,
        text: `${siteLabel(base.site)} ${formatLength(t.deltaCm, lengthUnitFor(h.unit), { signed: true })} by ${due}`,
        target: { kind: 'measurement', ref: base.site, value: round1(base.cm + t.deltaCm) },
        due,
        createdAt: h.now,
      });
    } else {
      const weight = currentWeight(h.weighIns, h.today);
      if (!weight) {
        need('weighIn');
        continue;
      }
      const shown = round1(toUnit(weight.kg * (1 + (t.pctPerWeek * GOAL_WEEKS) / 100), h.unit));
      goals.push({
        id: `${h.now}-weight-body`,
        text: `Body weight ${shown.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${h.unit} by ${due}`,
        target: { kind: 'weight', value: h.unit === 'kg' ? shown : fromUnit(shown, h.unit) },
        due,
        createdAt: h.now,
      });
    }
  }
  return { goals, needs };
}

// ---------- progress ----------

export type GoalStatus = 'done' | 'onTrack' | 'behind' | 'noData';

export type GoalProgress = {
  goalId: string;
  /** 0–100, whole; null with nothing logged for it. */
  pct: number | null;
  status: GoalStatus;
  /** Lift: estimated max in kg; measurement: cm; weight: kg. */
  startValue: number | null;
  currentValue: number | null;
  targetValue: number;
  /** Days until the due date; 0 on or after it. */
  daysLeft: number;
  /** Past the due date and not reached. */
  overdue: boolean;
};

function daysBetween(from: string, to: string): number {
  const ms = (d: string) => {
    const [y, m, day] = d.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

type Span = { start: number; current: number } | null;

function liftSpan(goal: Goal, sets: readonly SetLog[], today: string, formula: E1rmFormula): Span {
  const mine = sets.filter((s) => s.exerciseId === goal.target.ref && localDate(s.startedAt) <= today);
  const before = bestSetE1rm(mine.filter((s) => s.startedAt <= goal.createdAt), formula);
  const after = mine.filter((s) => s.startedAt > goal.createdAt);
  const bestAfter = bestSetE1rm(after, formula);
  if (before) return { start: before.e1rmKg, current: Math.max(before.e1rmKg, bestAfter?.e1rmKg ?? 0) };
  if (!bestAfter) return null;
  // Set before anything was logged: the first charted set after it is the start.
  const first = [...after].sort((a, b) => a.startedAt - b.startedAt).find((s) => !s.warmup && e1rm(s.weightKg, s.reps, formula) !== null);
  const start = first ? (e1rm(first.weightKg, first.reps, formula) ?? bestAfter.e1rmKg) : bestAfter.e1rmKg;
  return { start, current: bestAfter.e1rmKg };
}

function measurementSpan(goal: Goal, measurements: readonly Measurement[], today: string, created: string): Span {
  const mine = measurements
    .filter((m) => m.site === goal.target.ref && m.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const current = mine[mine.length - 1];
  if (!current) return null;
  const start = [...mine].reverse().find((m) => m.date <= created) ?? mine[0];
  return start ? { start: start.cm, current: current.cm } : null;
}

function weightSpan(weighIns: readonly WeighIn[], today: string, created: string): Span {
  const current = currentWeight(weighIns, today);
  if (!current) return null;
  const atStart = currentWeight(weighIns, created);
  if (atStart) return { start: atStart.kg, current: current.kg };
  const first = [...dedupeWeighIns(weighIns)].sort((a, b) => (a[0] < b[0] ? -1 : 1))[0];
  return first ? { start: first[1], current: current.kg } : null;
}

/**
 * How far a goal is. `sets` = sets of finished sessions. % = share of the way from the value when
 * the goal was set to the target (a step the wrong way is 0). On track = the % is no more than
 * `ON_TRACK_SLACK_PCT` points under the share of the time used.
 */
export function goalProgress(
  goal: Goal,
  sets: readonly SetLog[],
  measurements: readonly Measurement[],
  weighIns: readonly WeighIn[],
  today: string,
  opts: { formula?: E1rmFormula | undefined } = {},
): GoalProgress {
  const formula = opts.formula ?? 'epley';
  const created = localDate(goal.createdAt);
  const t = goal.target;
  const targetValue = t.kind === 'lift' ? (e1rm(t.value, t.reps ?? 1, formula) ?? t.value) : t.value;
  const span =
    t.kind === 'lift'
      ? liftSpan(goal, sets, today, formula)
      : t.kind === 'measurement'
        ? measurementSpan(goal, measurements, today, created)
        : weightSpan(weighIns, today, created);

  const daysLeft = Math.max(0, daysBetween(today, goal.due));
  const marked = goal.doneAt !== undefined;
  let pct: number | null = null;
  if (span) {
    const whole = targetValue - span.start;
    const raw = whole === 0 ? 100 : ((span.current - span.start) / whole) * 100;
    // Already at or past the target when it was set counts as reached.
    const reached = whole >= 0 ? span.current >= targetValue : span.current <= targetValue;
    pct = reached ? 100 : Math.round(Math.min(100, Math.max(0, raw)));
  }
  const done = marked || pct === 100;
  const overdue = !done && today > goal.due;
  const total = Math.max(1, daysBetween(created, goal.due));
  const expected = Math.min(100, Math.max(0, (daysBetween(created, today) / total) * 100));
  const status: GoalStatus = done
    ? 'done'
    : pct === null
      ? 'noData'
      : overdue || pct < expected - ON_TRACK_SLACK_PCT
        ? 'behind'
        : 'onTrack';
  return {
    goalId: goal.id,
    pct,
    status,
    startValue: span?.start ?? null,
    currentValue: span?.current ?? null,
    targetValue,
    daysLeft,
    overdue,
  };
}

/** One short sentence for the Goal card and the review. */
export function goalProgressText(p: GoalProgress): string {
  switch (p.status) {
    case 'done':
      return 'Reached.';
    case 'noData':
      return 'Nothing logged for it yet.';
    case 'onTrack':
      return `${p.pct ?? 0}% of the way, on track.`;
    case 'behind':
      return `${p.pct ?? 0}% of the way, ${p.overdue ? 'past the date' : 'behind the date'}.`;
  }
}
