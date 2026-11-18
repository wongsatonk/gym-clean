/**
 * M12 slice 1b (trainer kit item 4): estimated one-rep max per lift. Pure; times are passed in
 * with the rows.
 *
 * - Formula from settings 'trainerKit' (`e1rmFormula`, passed in by the caller). Epley:
 *   `w × (1 + r/30)`, with one rep = the weight itself.
 * - Sets above `E1RM_MAX_REPS` reps are not charted (the estimate drifts at high reps); warm-up
 *   sets, 0-rep sets and bodyweight sets (0 kg) never count.
 * - A session's point is the best estimate among its sets (which can be a lighter set with more
 *   reps than the heaviest one). Sessions that ran lighter or as a deload are kept but marked,
 *   so the chart can dim them and a "best" can skip them.
 *
 * It is an estimate for trends, not a tested max.
 */
import { localDate } from '../trainer/plan';
import { formatWeight, type Unit } from '../units';
import type { ProposalAction, SetLog, TrainerKitSettings } from '../types';

export type E1rmFormula = TrainerKitSettings['e1rmFormula'];

/** Sets above this many reps are not charted. */
export const E1RM_MAX_REPS = 12;

/** One entry per formula id in the trainer-kit setting. */
export const E1RM_FORMULAS: Record<E1rmFormula, (weightKg: number, reps: number) => number> = {
  epley: (w, r) => (r === 1 ? w : w * (1 + r / 30)),
};

/** Session adjustments that mark a point as a lighter day. */
export const E1RM_LIGHTER_ACTIONS: readonly ProposalAction[] = ['lighter', 'deload'];

/** Estimated 1RM in kg, or null when the set is not charted (no reps, over 12 reps, no weight). */
export function e1rm(weightKg: number, reps: number, formula: E1rmFormula = 'epley'): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return null;
  return E1RM_FORMULAS[formula](weightKg, reps);
}

export type E1rmSet = { e1rmKg: number; weightKg: number; reps: number; startedAt: number };

/**
 * The set with the highest estimate among `sets` (warm-ups and uncharted sets left out); an equal
 * estimate keeps the earlier set. The caller filters by exercise.
 */
export function bestSetE1rm(sets: readonly SetLog[], formula: E1rmFormula = 'epley'): E1rmSet | null {
  let best: E1rmSet | null = null;
  for (const s of sets) {
    if (s.warmup) continue;
    const value = e1rm(s.weightKg, s.reps, formula);
    if (value === null) continue;
    if (
      !best ||
      value > best.e1rmKg ||
      (value === best.e1rmKg && s.startedAt < best.startedAt)
    ) {
      best = { e1rmKg: value, weightKg: s.weightKg, reps: s.reps, startedAt: s.startedAt };
    }
  }
  return best;
}

/** The session fields needed; `SessionRow` from src/data/db.ts fits. */
export type E1rmSession = {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  adjust?: readonly ProposalAction[];
};

export type E1rmPoint = {
  sessionId: string;
  /** Session start (ms). */
  at: number;
  /** Local YYYY-MM-DD of the session start. */
  date: string;
  e1rmKg: number;
  /** The set the estimate comes from. */
  weightKg: number;
  reps: number;
  /** The session ran lighter or as a deload. */
  lighter: boolean;
};

export type E1rmOptions = { formula?: E1rmFormula | undefined };

const finishedByStart = (sessions: readonly E1rmSession[]): E1rmSession[] =>
  sessions
    .filter((s) => s.endedAt !== undefined)
    .sort((a, b) => a.startedAt - b.startedAt || (a.sessionId < b.sessionId ? -1 : 1));

function pointFor(session: E1rmSession, sets: readonly SetLog[], formula: E1rmFormula): E1rmPoint | null {
  const best = bestSetE1rm(sets, formula);
  if (!best) return null;
  return {
    sessionId: session.sessionId,
    at: session.startedAt,
    date: localDate(session.startedAt),
    e1rmKg: best.e1rmKg,
    weightKg: best.weightKg,
    reps: best.reps,
    lighter: (session.adjust ?? []).some((a) => E1RM_LIGHTER_ACTIONS.includes(a)),
  };
}

/** One lift's chart: a point per finished session that has a charted set, oldest first. */
export function e1rmSeries(
  exerciseId: string,
  sets: readonly SetLog[],
  sessions: readonly E1rmSession[],
  opts: E1rmOptions = {},
): E1rmPoint[] {
  return e1rmSeriesByLift(
    sets.filter((s) => s.exerciseId === exerciseId),
    sessions,
    opts,
  ).get(exerciseId) ?? [];
}

/** Every lift's chart, keyed by exercise id in the order the lifts were first done. */
export function e1rmSeriesByLift(
  sets: readonly SetLog[],
  sessions: readonly E1rmSession[],
  opts: E1rmOptions = {},
): Map<string, E1rmPoint[]> {
  const formula = opts.formula ?? 'epley';
  const bySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    const list = bySession.get(s.sessionId);
    if (list) list.push(s);
    else bySession.set(s.sessionId, [s]);
  }
  const out = new Map<string, E1rmPoint[]>();
  for (const session of finishedByStart(sessions)) {
    const logs = [...(bySession.get(session.sessionId) ?? [])].sort((a, b) => a.startedAt - b.startedAt);
    const byLift = new Map<string, SetLog[]>();
    for (const l of logs) {
      const list = byLift.get(l.exerciseId);
      if (list) list.push(l);
      else byLift.set(l.exerciseId, [l]);
    }
    for (const [exerciseId, liftSets] of byLift) {
      const point = pointFor(session, liftSets, formula);
      if (!point) continue;
      const series = out.get(exerciseId);
      if (series) series.push(point);
      else out.set(exerciseId, [point]);
    }
  }
  return out;
}

/** The highest point; lighter/deload sessions are skipped unless asked. An equal later point keeps the earlier one. */
export function peakE1rm(points: readonly E1rmPoint[], opts: { includeLighter?: boolean } = {}): E1rmPoint | null {
  let peak: E1rmPoint | null = null;
  for (const p of points) {
    if (p.lighter && !opts.includeLighter) continue;
    if (!peak || p.e1rmKg > peak.e1rmKg) peak = p;
  }
  return peak;
}

/** "79.2 kg" / "174.5 lb" (stored in kg, shown in his unit). */
export function formatE1rm(kg: number, unit: Unit): string {
  return `${formatWeight(kg, unit)} ${unit}`;
}
