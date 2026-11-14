// After-set coach (SPEC M5b round 1 rule table). Pure: reads logged sets, returns advice.
// One recommendation per exercise per moment; rules are checked in table order, first match wins.
// Nothing here changes state: `apply` is only a payload the UI may offer behind a button.
import type { SessionState } from './session';
import type { PlannedExercise, SetLog } from './types';
import { formatWeight, fromUnit, snapToStep, stepFor, toUnit, type Unit } from './units';

export type AdviceRule = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6';

export type Advice = {
  exerciseId: string;
  rule: AdviceRule;
  /** Shown text (≤ 12 words). */
  text: string;
  /** Spoken form: units spelled out ("kilos", "pounds", "plus"). */
  say: string;
  /** The numbers behind it; shown under the text, never spoken. */
  why: string;
  /** A3 only: the next set's weight, already snapped to the display unit's step. */
  apply?: { weightKg: number };
};

export type CoachSummaryEntry = {
  exerciseId: string;
  next: Advice | null;
  progress: string | null;
};

/** Coaching language only (CLAUDE.md): advice never uses these stems. */
export const ADVICE_BANNED_WORDS = ['pain', 'injur', 'hurt', 'damage', 'safe', 'risk'] as const;

/** Rest may run this long past the previous exercise's target before it counts as overrun (M1). */
const OVERRUN_GRACE_SEC = 30;
/** No weight increase when one step is more than this share of the weight (display unit). */
const MAX_JUMP_SHARE = 0.25;
/** Speak the Rest advice when the rest clock crosses this… */
const SPEAK_AT_MS = 2000;
/** …but only if noticed by then (a throttled tab skips it)… */
const SPEAK_LATEST_MS = 6000;
/** …and only if it can finish before the "Ten seconds" cue. */
const SPEAK_MIN_REST_SEC = 17;

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** True once per rest, when the clock crosses 2 s (see SPEC M5b speaking). */
export function adviceSpeakDue(prevMs: number, currMs: number, restTargetSec: number): boolean {
  return (
    restTargetSec >= SPEAK_MIN_REST_SEC &&
    prevMs < SPEAK_AT_MS &&
    currMs >= SPEAK_AT_MS &&
    currMs <= SPEAK_LATEST_MS
  );
}

// ---------------------------------------------------------------------------------------------
// Helpers

/** Weight in the display unit, rounded so stored-as-kg lb values compare exactly (35 lb, not 34.99…). */
const disp = (kg: number, unit: Unit) => Math.round(toUnit(kg, unit) * 1000) / 1000;
const unitWord = (unit: Unit) => (unit === 'kg' ? 'kilos' : 'pounds');
const fmtStep = (unit: Unit) => formatWeight(fromUnit(stepFor(unit), unit), unit);
const shown = (kg: number, unit: Unit) => `${formatWeight(kg, unit)} ${unit}`;
const spoken = (kg: number, unit: Unit) => `${formatWeight(kg, unit)} ${unitWord(unit)}`;

const isBodyweight = (w: number) => w === 0;
const tooBigJump = (w: number, unit: Unit) => stepFor(unit) > MAX_JUMP_SHARE * disp(w, unit) + 1e-9;
const partialsOf = (l: SetLog) => l.partials ?? 0;
const isClean = (l: SetLog) => partialsOf(l) === 0;

/** w ± one step, computed in the display unit and snapped (stored as kg). */
function stepped(w: number, unit: Unit, dir: 1 | -1): number {
  return snapToStep(fromUnit(disp(w, unit) + dir * stepFor(unit), unit), unit);
}

function plannedFor(s: SessionState, exerciseId: string): PlannedExercise | undefined {
  return s.day.exercises.find((p) => p.exerciseId === exerciseId);
}

/** Did log `i` of the workout overrun its rest? Compared with the previous log's exercise restSec. */
function overran(s: SessionState, i: number): boolean {
  const log = s.logs[i];
  const prev = s.logs[i - 1];
  if (!log || !prev) return false; // the workout's first set never overran
  const p = plannedFor(s, prev.exerciseId);
  if (!p) return false;
  return log.restTakenSec > p.restSec + OVERRUN_GRACE_SEC;
}

function setsWhy(L: readonly SetLog[], unit: Unit): string {
  const reps = L.map((l) => l.reps).join(', ');
  const last = L.at(-1);
  const total = L.reduce((n, l) => n + partialsOf(l), 0);
  const parts = [`Sets: ${reps}`];
  if (last && !isBodyweight(last.weightKg)) parts.push(shown(last.weightKg, unit));
  parts.push(total === 0 ? 'no partials' : `${total} partial${total === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

const targetWhy = (p: PlannedExercise) =>
  p.targetReps[0] === p.targetReps[1]
    ? `target ${p.targetReps[0]}`
    : `target ${p.targetReps[0]}–${p.targetReps[1]}`;

function advice(
  exerciseId: string,
  rule: AdviceRule,
  text: string,
  why: string,
  say: string = text,
  apply?: { weightKg: number },
): Advice {
  return { exerciseId, rule, text, say, why, ...(apply ? { apply } : {}) };
}

// ---------------------------------------------------------------------------------------------
// (a) After a set, while sets of the same exercise remain

function duringExerciseAdvice(
  s: SessionState,
  p: PlannedExercise,
  L: readonly SetLog[],
): Advice | null {
  const id = p.exerciseId;
  const [min, max] = p.targetReps;
  const unit = s.unit;
  const set = L.at(-1);
  if (!set) return null;
  const w = set.weightKg;
  const bw = isBodyweight(w);
  const why = `${setsWhy(L, unit)} · ${targetWhy(p)}`;

  if (partialsOf(set) >= 2) {
    return advice(
      id,
      'A1',
      bw ? 'Focus on full range.' : 'Keep the weight. Focus on full range.',
      why,
    );
  }
  if (set.reps < min) {
    const aim = `Aim for ${min} reps.`;
    return advice(id, 'A2', bw ? aim : `Keep the weight. ${aim}`, why);
  }
  const allTop = L.length >= 2 && L.every((l) => l.reps >= max && isClean(l));
  if (allTop && !bw && !tooBigJump(w, unit)) {
    // Name the real jump to the snapped Apply weight, so text and Apply never disagree
    // (16 kg → 17.5 kg says "+1.5 kg", not "+2.5 kg").
    const next = stepped(w, unit, 1);
    const jump = formatWeight(fromUnit(disp(next, unit) - disp(w, unit), unit), unit);
    return advice(
      id,
      'A3',
      `Strong set. Try +${jump} ${unit} next set.`,
      why,
      `Strong set. Try plus ${jump} ${unitWord(unit)} next set.`,
      { weightKg: next },
    );
  }
  if (allTop && bw) {
    return advice(id, 'A4', `Strong set. Try ${set.reps + 1} reps next set.`, why);
  }
  const i = s.logs.length - 1;
  if (s.logs[i] === set && overran(s, i)) {
    const count = s.logs.filter((_, k) => overran(s, k)).length;
    if (count >= 2) {
      const prev = s.logs[i - 1];
      const target = prev ? (plannedFor(s, prev.exerciseId)?.restSec ?? 0) : 0;
      return advice(
        id,
        'A5',
        'Rest ran long. Start when the timer says go.',
        `Rest: ${set.restTakenSec} s vs ${target} s target · ${count} long rests`,
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// (b) Next time

/** Next-time advice for one exercise (N1–N6); null when it has no sets today or isn't planned. */
export function nextTimeAdvice(
  s: SessionState,
  exerciseId: string,
  last: readonly SetLog[],
  name: (id: string) => string,
): Advice | null {
  const p = plannedFor(s, exerciseId);
  const L = s.logs.filter((l) => l.exerciseId === exerciseId);
  const lastSet = L.at(-1);
  if (!p || !lastSet) return null;
  const [min, max] = p.targetReps;
  const unit = s.unit;
  const w = lastSet.weightKg;
  const bw = isBodyweight(w);
  const head = `Next time on ${name(exerciseId)}:`;
  const why = `${setsWhy(L, unit)} · ${targetWhy(p)}`;
  const mk = (rule: AdviceRule, shownTail: string, sayTail: string = shownTail, w2 = why) =>
    advice(exerciseId, rule, `${head} ${shownTail}`, w2, `${head} ${sayTail}`);

  const belowMin = L.some((l) => l.reps < min);
  if (belowMin && !bw) {
    const wU = disp(w, unit);
    const lastBelow = last.find((l) => l.reps < min && disp(l.weightKg, unit) >= wU - 1e-9);
    const lower = stepped(w, unit, -1);
    if (lastBelow && disp(lower, unit) > 0) {
      const w2 = `${why} · last time ${lastBelow.reps} at ${shown(lastBelow.weightKg, unit)}`;
      return mk('N1', `drop to ${shown(lower, unit)}.`, `drop to ${spoken(lower, unit)}.`, w2);
    }
  }
  if (belowMin) {
    return bw
      ? mk('N2', `aim for ${min} reps.`)
      : mk('N2', `repeat ${shown(w, unit)}.`, `repeat ${spoken(w, unit)}.`);
  }
  const allTop = L.every((l) => l.reps >= max);
  if (L.length >= p.sets && allTop && L.every(isClean)) {
    if (bw) {
      // Spoken without "on" so it stays ≤ 12 words with the longest name.
      const say = `Next time, ${name(exerciseId)}: plus one rep per set.`;
      return advice(exerciseId, 'N3', `${head} +1 rep per set.`, why, say);
    }
    if (tooBigJump(w, unit)) {
      return mk('N3', `${shown(w, unit)}, more reps.`, `${spoken(w, unit)}, more reps.`);
    }
    const step = fmtStep(unit);
    return mk('N3', `+${step} ${unit}.`, `plus ${step} ${unitWord(unit)}.`);
  }
  if (L.reduce((n, l) => n + partialsOf(l), 0) >= 2) {
    return mk('N4', bw ? 'full range, every rep.' : 'same weight, full range.');
  }
  if (!allTop) {
    return mk('N5', bw ? `aim for ${max} reps.` : `same weight, ${max} reps.`);
  }
  return bw
    ? mk('N6', `${max} reps every set.`)
    : mk('N6', `repeat ${shown(w, unit)}.`, `repeat ${spoken(w, unit)}.`);
}

// ---------------------------------------------------------------------------------------------
// Public entry points

/**
 * Advice for the set just logged (the last log): moment (a) while sets of its exercise remain,
 * else that exercise's next-time advice. `last` = last session's sets per exerciseId (for N1).
 */
export function afterSetAdvice(
  s: SessionState,
  name: (id: string) => string,
  last: Readonly<Record<string, readonly SetLog[]>> = {},
): Advice | null {
  const set = s.logs.at(-1);
  if (!set) return null;
  const p = plannedFor(s, set.exerciseId);
  if (!p) return null;
  const L = s.logs.filter((l) => l.exerciseId === set.exerciseId);
  if (L.length >= p.sets)
    return nextTimeAdvice(s, set.exerciseId, last[set.exerciseId] ?? [], name);
  return duringExerciseAdvice(s, p, L);
}

/** Progress vs last time (P1/P2), positive only; null with no `last` or no gain. */
export function progressLine(
  s: SessionState,
  exerciseId: string,
  last: readonly SetLog[],
  name: (id: string) => string,
): string | null {
  const L = s.logs.filter((l) => l.exerciseId === exerciseId);
  if (L.length === 0 || last.length === 0) return null;
  const unit = s.unit;
  const half = stepFor(unit) / 2;
  const maxKg = (ls: readonly SetLog[]) => Math.max(...ls.map((l) => l.weightKg));
  const today = maxKg(L);
  const prev = maxKg(last);
  const diff = disp(today, unit) - disp(prev, unit);
  if (diff >= half - 1e-9) {
    return `${name(exerciseId)}: ${shown(today, unit)}, up from ${shown(prev, unit)}.`;
  }
  const reps = (ls: readonly SetLog[]) => ls.reduce((n, l) => n + l.reps, 0);
  const gained = reps(L) - reps(last);
  if (diff > -half + 1e-9 && gained > 0) {
    return `${name(exerciseId)}: +${gained} ${gained === 1 ? 'rep' : 'reps'} vs last time.`;
  }
  return null;
}

/** Summary Coach section: one entry per exercise with ≥ 1 set today, in day order. */
export function coachSummary(
  s: SessionState,
  last: Readonly<Record<string, readonly SetLog[]>>,
  name: (id: string) => string,
): CoachSummaryEntry[] {
  const out: CoachSummaryEntry[] = [];
  const seen = new Set<string>();
  for (const p of s.day.exercises) {
    const id = p.exerciseId;
    if (seen.has(id) || !s.logs.some((l) => l.exerciseId === id)) continue;
    seen.add(id);
    const prev = last[id] ?? [];
    out.push({
      exerciseId: id,
      next: nextTimeAdvice(s, id, prev, name),
      progress: progressLine(s, id, prev, name),
    });
  }
  return out;
}
