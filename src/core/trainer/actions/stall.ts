/**
 * M10 action "Stalled → adjust" (SPEC M10 goal 2, builds on M5b). Pure: dates and times are
 * passed in.
 *
 * Detection: per plan exercise, its finished sessions oldest first, skipping sessions with an
 * `adjust` (lighter/deload/… days don't count either way). Each session's top set (stats.ts
 * `topSet`: heaviest, then most reps at that weight) is a **gain** when it's heavier than the best
 * so far, or has more reps at the same weight. The run counts the sessions since (and including)
 * the one that set the current best — the first session sets it too — so a run of 3 is "the best
 * set and 2 sessions that didn't beat it". A gain starts a new run at 1. A run of ≥ 3 is a stall.
 *
 * Fixes (scope `plan`, on every plan day with the exercise):
 * - `lighter`: the top set's weight −10%, snapped **down** to the display unit's step, and the rep
 *   range top +2. The plan's start weight drops, and because last time's weight beats the plan
 *   (session.ts defaultsFor), the next date that runs the exercise also gets a dated override
 *   with `weightKgToday`. After that session, last time's (lighter) weight carries on.
 * - `addSet`: +1 set, at most 5.
 *
 * After a fix, pass its time in `since` so the old run doesn't show again straight away.
 *
 * M12 1b: with `opts.catalog`, `addSet` is refused on a lift that loads an area on the standing
 * go-easy list (`state.easyOn`); `lighter` stays.
 */
import { stepFor, formatWeight, fromUnit, toUnit, type Unit } from '../../units';
import { topSet, WEIGHT_EPS_KG, type Top } from '../../stats';
import { isWarmup } from '../../warmup';
import { calendar, type PlanSession } from '../plan';
import type { TrainerCatalog } from '../swapCandidates';
import { easyOnArea } from './avoidArea';
import type {
  DayOverride,
  PlannedExercise,
  ProgramDay,
  Proposal,
  ProposalAction,
  SetLog,
  TrainerState,
} from '../../types';

/** Sessions in a row without a gain that make a stall (M10-q4, provisional). */
export const STALL_SESSIONS = 3;
/** `lighter`: weight × this, then snapped down to the unit step. */
export const STALL_LIGHTER_FACTOR = 0.9;
/** `lighter`: added to the top of the rep range. */
export const STALL_REP_TOP_BUMP = 2;
/** `addSet` never goes past this many sets. */
export const STALL_MAX_SETS = 5;
/** How far ahead the `lighter` fix looks for the next date with the exercise. */
const LOOKAHEAD_DAYS = 28;

export type StallOption = 'lighter' | 'addSet';

/** `SessionRow` (with its M10 `adjust`) fits. */
export type StallSession = PlanSession & {
  sessionId: string;
  adjust?: readonly ProposalAction[];
};

export type Stall = {
  exerciseId: string;
  /** Sessions since (and including) the one that set the unbeaten best (≥ 3). */
  sessions: number;
  /** The best top set so far (what hasn't been beaten). */
  top: Top;
  /** Top weight 0: reps only, and no `lighter` option. */
  bodyweight: boolean;
  /** The fixes that apply: no `lighter` for bodyweight, no `addSet` at 5 sets. */
  options: StallOption[];
};

export type StallFixRefusal = 'notInPlan' | 'bodyweight' | 'tooLight' | 'maxSets' | 'easyOn';

/** M12 1b: "Shoulders are" / "Chest is" in the go-easy refusal. */
const AREA_IS: Record<string, string> = {
  arms: 'Arms are',
  shoulders: 'Shoulders are',
  chest: 'Chest is',
  back: 'Back is',
  legs: 'Legs are',
  core: 'Core is',
};

export type StallFixResult =
  { ok: true; proposal: Proposal } | { ok: false; reason: StallFixRefusal; reply: string };

const isBodyweight = (t: Top): boolean => t.weightKg <= WEIGHT_EPS_KG;

function beats(t: Top, best: Top): boolean {
  return (
    t.weightKg > best.weightKg + WEIGHT_EPS_KG ||
    (Math.abs(t.weightKg - best.weightKg) <= WEIGHT_EPS_KG && t.reps > best.reps)
  );
}

/** Plan exercise ids in plan order (first appearance), each with its occurrences. */
function planRows(days: readonly ProgramDay[]): Map<string, PlannedExercise[]> {
  const out = new Map<string, PlannedExercise[]>();
  for (const d of days)
    for (const p of d.exercises) {
      const list = out.get(p.exerciseId);
      if (list) list.push(p);
      else out.set(p.exerciseId, [p]);
    }
  return out;
}

/** Exercises in the plan that have gone ≥ 3 counted sessions in a row without a top-set gain. */
export function detectStalls(
  sets: readonly SetLog[],
  sessions: readonly StallSession[],
  plan: { days: readonly ProgramDay[] },
  opts: { since?: Readonly<Record<string, number>> } = {},
): Stall[] {
  const counted = new Map<string, StallSession>();
  for (const s of sessions) {
    if (s.endedAt === undefined || (s.adjust && s.adjust.length > 0)) continue;
    counted.set(s.sessionId, s);
  }
  // exerciseId → sessionId → logs
  const byEx = new Map<string, Map<string, SetLog[]>>();
  for (const l of sets) {
    // M12 1b: a warm-up set is never a top set, a gain or a session of the exercise.
    if (!counted.has(l.sessionId) || isWarmup(l)) continue;
    let m = byEx.get(l.exerciseId);
    if (!m) byEx.set(l.exerciseId, (m = new Map()));
    const list = m.get(l.sessionId);
    if (list) list.push(l);
    else m.set(l.sessionId, [l]);
  }

  const out: Stall[] = [];
  for (const [exerciseId, rows] of planRows(plan.days)) {
    const m = byEx.get(exerciseId);
    if (!m) continue;
    const since = opts.since?.[exerciseId] ?? -Infinity;
    const tops: { at: number; top: Top }[] = [];
    for (const [sessionId, logs] of m) {
      const s = counted.get(sessionId);
      const top = topSet(logs);
      if (!s || !top || s.startedAt < since) continue;
      tops.push({ at: s.startedAt, top });
    }
    tops.sort((a, b) => a.at - b.at);

    let best: Top | null = null;
    let run = 0;
    for (const { top } of tops) {
      if (!best || beats(top, best)) {
        best = top;
        run = 1;
      } else {
        run++;
      }
    }
    if (!best || run < STALL_SESSIONS) continue;
    const bodyweight = isBodyweight(best);
    const options: StallOption[] = [];
    if (!bodyweight) options.push('lighter');
    if (rows.some((p) => p.sets < STALL_MAX_SETS)) options.push('addSet');
    out.push({ exerciseId, sessions: run, top: { ...best }, bodyweight, options });
  }
  return out;
}

/** One coaching line for Summary / the chat, under the M5b next-time line (≤ 12 words). */
export function stallLine(stall: Stall, name: (id: string) => string): string {
  return `${name(stall.exerciseId)}: same best set for ${stall.sessions} sessions.`;
}

const topWords = (t: Top, unit: Unit): string =>
  isBodyweight(t) ? `${t.reps} reps` : `${formatWeight(t.weightKg, unit)} ${unit} × ${t.reps}`;

/** −10%, snapped down to the step in the display unit (kg). 0 when that's below one step. */
export function stallLighterKg(kg: number, unit: Unit): number {
  const step = stepFor(unit);
  const steps = Math.floor(toUnit(kg * STALL_LIGHTER_FACTOR, unit) / step + 1e-9);
  return steps <= 0 ? 0 : fromUnit(steps * step, unit);
}

function refuse(reason: StallFixRefusal, reply: string): StallFixResult {
  return { ok: false, reason, reply };
}

/**
 * The Proposal for one stall fix. `sessions` and `today` (local `YYYY-MM-DD`) find the next date
 * that runs the exercise, for the `lighter` override. `name` comes from the catalog (the caller's).
 */
export function proposeStallFix(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
  stall: Stall,
  option: StallOption,
  opts: {
    unit: Unit;
    name: (id: string) => string;
    /** M12 1b: for the go-easy list check. */
    catalog?: Pick<TrainerCatalog, 'exercises' | 'areaOf'>;
  },
): StallFixResult {
  const { unit } = opts;
  const id = stall.exerciseId;
  const exName = opts.name(id);
  const has = (d: ProgramDay) => d.exercises.some((p) => p.exerciseId === id);
  const planDays = state.plan.days.filter(has);
  if (planDays.length === 0) return refuse('notInPlan', `${exName} isn't in your plan.`);
  const multi = planDays.length > 1;
  const lineName = (d: ProgramDay) => (multi ? `${exName} (${d.name})` : exName);
  const run = `Your best ${exName} set has stayed at ${topWords(stall.top, unit)} for ${stall.sessions} sessions.`;
  const next: TrainerState = structuredClone(state);
  const lines: Proposal['lines'] = [];

  if (option === 'lighter') {
    if (isBodyweight(stall.top))
      return refuse('bodyweight', 'No weight to drop. Try one more set.');
    const kg = stallLighterKg(stall.top.weightKg, unit);
    if (kg <= 0) return refuse('tooLight', "That's already the lightest step.");
    const w = (v: number) => `${formatWeight(v, unit)} ${unit}`;
    const lighten = (p: PlannedExercise): PlannedExercise => ({
      ...p,
      startWeightKg: kg,
      targetReps: [p.targetReps[0], p.targetReps[1] + STALL_REP_TOP_BUMP],
    });
    for (const d of next.plan.days) {
      if (!has(d)) continue;
      d.exercises = d.exercises.map((p) => {
        if (p.exerciseId !== id) return p;
        const q = lighten(p);
        lines.push({
          before: `${lineName(d)}: ${w(stall.top.weightKg)}, ${p.targetReps[0]}–${p.targetReps[1]} reps`,
          after: `${lineName(d)}: ${w(kg)}, ${q.targetReps[0]}–${q.targetReps[1]} reps`,
        });
        return q;
      });
    }
    // The next date that runs it gets the lighter weight as today's weight.
    const hit = calendar(next, sessions, today, LOOKAHEAD_DAYS).find((e) => {
      if (e.rest || e.done || e.dayId === null) return false;
      const d = next.plan.days.find((x) => x.id === e.dayId);
      const rows = e.override?.adjust?.exercises ?? d?.exercises ?? [];
      return rows.some((p) => p.exerciseId === id);
    });
    if (hit?.dayId) {
      const day = next.plan.days.find((x) => x.id === hit.dayId);
      const mark = (p: PlannedExercise): PlannedExercise =>
        p.exerciseId === id ? { ...p, weightKgToday: kg, adjusted: 'lighter' } : p;
      const old = hit.override;
      const override: DayOverride = old?.adjust
        ? { ...old, adjust: { ...old.adjust, exercises: old.adjust.exercises.map(mark) } }
        : {
            ...(old ?? {}),
            date: hit.date,
            dayId: hit.dayId,
            adjust: { kind: 'lighter', exercises: (day?.exercises ?? []).map(mark) },
          };
      const i = next.overrides.map((o) => o.date).lastIndexOf(hit.date);
      if (i >= 0) next.overrides[i] = override;
      else next.overrides.push(override);
    }
    return {
      ok: true,
      proposal: {
        action: 'stall',
        scope: 'plan',
        title: `Lighter and build back up: ${exName}`,
        lines,
        why: `${run} Drop the weight, add reps, then build back up.`,
        say: 'Done. Lighter weight, more reps next time.',
        next,
        baseVersion: state.version,
      },
    };
  }

  const easy = opts.catalog ? easyOnArea(id, state.easyOn ?? [], opts.catalog) : undefined;
  if (easy)
    return refuse(
      'easyOn',
      `${AREA_IS[easy] ?? 'That area is'} on your go-easy list, so no extra sets there. Try lighter instead.`,
    );
  if (
    planDays.every((d) => d.exercises.every((p) => p.exerciseId !== id || p.sets >= STALL_MAX_SETS))
  )
    return refuse('maxSets', `Already at ${STALL_MAX_SETS} sets. Try lighter instead.`);
  for (const d of next.plan.days) {
    if (!has(d)) continue;
    d.exercises = d.exercises.map((p) => {
      if (p.exerciseId !== id || p.sets >= STALL_MAX_SETS) return p;
      lines.push({
        before: `${lineName(d)}: ${p.sets} sets`,
        after: `${lineName(d)}: ${p.sets + 1} sets`,
      });
      return { ...p, sets: p.sets + 1 };
    });
  }
  return {
    ok: true,
    proposal: {
      action: 'stall',
      scope: 'plan',
      title: `One more set: ${exName}`,
      lines,
      why: `${run} One more set adds work at the same weight.`,
      say: 'Done. One more set from now on.',
      next,
      baseVersion: state.version,
    },
  };
}
