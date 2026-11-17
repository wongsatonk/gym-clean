/**
 * M10 coach copy (SPEC M10 "Safety" and "Voice"). Pure: fixed lines, the copy check, and the
 * text a Proposal or an adjusted day shows.
 *
 * - Coaching language only. `checkCopy` flags the M5b banned stems (anywhere in a word, as M5b
 *   tests do) and the diagnosis terms from phrases.json (whole words; a trailing `*` means any
 *   ending; Thai as substrings). The referral and red-flag lines are fixed and pass it.
 * - `say` (spoken after Apply mid-workout) is ≤ 8 words; any spoken line is ≤ 12.
 */
import { ADVICE_BANNED_WORDS, wordCount } from '../advice';
import { formatWeight, type Unit } from '../units';
import { normalizeText } from './intents';
import phrases from './phrases.json';
import type {
  DayOverride,
  MacroSet,
  PlannedExercise,
  ProgramDay,
  Proposal,
  ProposalAction,
} from '../types';

export const REFERRAL_LINE = "If something doesn't feel right, check with a doctor or physio.";
export const RED_FLAG_LINE = 'Stop the workout for today and get checked by a doctor.';
export const HELP_TEXT = 'I can help with:';
export const FOOD_LATER = 'Food tips come with Fuel.';
/** M7 on, but no targets yet. */
export const FOOD_SETUP = 'Set up your targets in Fuel first, then ask me again.';
/** M7: protein and kcal targets both reached today. */
export const FOOD_DONE = "You've hit today's targets.";
/** M7: nothing saved fits what's left. */
export const FOOD_NONE = "Nothing saved fits what's left. Try a quick estimate in Fuel.";

// ---------- M10e: the gym lacks the kit ----------

/** The reply above a missing-kit swap proposal. */
export function gymSwapReply(exerciseName: string): string {
  return `Your gym doesn't have the kit for ${exerciseName}. Here's a swap.`;
}

/**
 * The why line of a missing-kit swap: names the missing kit (equipment labels, as data), e.g.
 * "No leg press here. This works the same main muscles. Just for today."
 */
export function gymSwapWhy(missingLabels: readonly string[], scope: 'today' | 'plan'): string {
  const kit = missingLabels.map((l) => l.toLowerCase()).join(' or ');
  const head = kit === '' ? "Your gym doesn't have the kit for it." : `No ${kit} here.`;
  const tail = scope === 'plan' ? 'Every day with it changes from now on.' : 'Just for today.';
  return `${head} This works the same main muscles. ${tail}`;
}

/**
 * The reply above the food suggestions, e.g. "40 g protein and 900 kcal left today. Some ideas:".
 * Whole grams and whole kcal (shown and spoken); amounts that round to 0 are left out.
 */
export function foodIdeasReply(left: MacroSet): string {
  const p = Math.round(Math.max(0, left.proteinG));
  const k = Math.round(Math.max(0, left.kcal));
  const parts = [p > 0 ? `${p} g protein` : '', k > 0 ? `${k} kcal` : ''].filter(Boolean);
  return parts.length ? `${parts.join(' and ')} left today. Some ideas:` : 'Some ideas:';
}

/** A Proposal's `say` (spoken confirmation after Apply). */
export const SAY_MAX_WORDS = 8;
/** Any line the app speaks. */
export const SPOKEN_MAX_WORDS = 12;

// ---------- copy check ----------

const THAI = /[฀-๿]/;

type Term = { term: string; test: (normalized: string) => boolean };

const DIAGNOSIS: Term[] = phrases.diagnosisTerms.map((raw) => {
  const prefix = raw.endsWith('*');
  const term = normalizeText(prefix ? raw.slice(0, -1) : raw);
  if (THAI.test(term)) return { term, test: (t) => t.includes(term) };
  const body = term.replace(/ /g, '\\s+') + (prefix ? '[a-z0-9]*' : 's?');
  const re = new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
  return { term, test: (t) => re.test(t) };
});

export type CopyCheck = { ok: boolean; hits: string[] };

/** M5b banned words + diagnosis terms. Every reply text must pass. */
export function checkCopy(text: string): CopyCheck {
  const low = text.toLowerCase();
  const norm = normalizeText(text);
  const hits = [
    ...ADVICE_BANNED_WORDS.filter((w) => low.includes(w)),
    ...DIAGNOSIS.filter((d) => d.test(norm)).map((d) => d.term),
  ];
  return { ok: hits.length === 0, hits: [...new Set(hits)] };
}

const clean = (text: string | undefined, fallback: string): string =>
  text !== undefined && text.trim() !== '' && checkCopy(text).ok ? text : fallback;

// ---------- proposals ----------

const FALLBACK: Record<ProposalAction, { title: string; why: string; say: string }> = {
  postpone: {
    title: 'Not today',
    why: 'The rest of the week moves with it.',
    say: 'Done. Today is a rest day.',
  },
  avoidArea: {
    title: 'Go easy today',
    why: 'Some moves are dropped or lighter today.',
    say: 'Done. Today is easier.',
  },
  lighter: {
    title: 'Lighter today',
    why: 'One set fewer and about 10% lighter.',
    say: 'Done. Today is lighter.',
  },
  deload: {
    title: 'Deload week',
    why: 'Half the sets and about 10% lighter for 7 days.',
    say: 'Done. Deload week is on.',
  },
  swap: {
    title: 'Swap an exercise',
    why: 'It works the same main muscles.',
    say: 'Done. Exercise swapped.',
  },
  stall: {
    title: 'Adjust a stalled lift',
    why: 'A small change to get the lift moving again.',
    say: 'Done. Plan updated.',
  },
  food: {
    title: 'Food ideas',
    why: 'Ideas that fit what you have left today.',
    say: 'Done. Food logged.',
  },
  // M12 focus block (actions/focusBlock.ts writes the full title / why / say).
  focusBlock: {
    title: 'Focus block',
    why: 'More sets for one area, the rest kept as it is. The last week is lighter.',
    say: 'Done. Focus block is on.',
  },
};

export type ProposalText = {
  title: string;
  lines: Proposal['lines'];
  why: string;
  /** ≤ 8 words, always set. */
  say: string;
};

/** The text a Proposal card shows and speaks; anything that fails `checkCopy` is replaced. */
export function proposalReply(p: Omit<Proposal, 'say'> & { say?: string }): ProposalText {
  const f = FALLBACK[p.action];
  const say =
    p.say !== undefined && wordCount(p.say) <= SAY_MAX_WORDS ? clean(p.say, f.say) : f.say;
  return {
    title: clean(p.title, f.title),
    lines: p.lines.map((l) => ({
      before: clean(l.before, 'Planned'),
      after: clean(l.after, 'Changed'),
    })),
    why: clean(p.why, f.why),
    say,
  };
}

// ---------- adjusted days (Today / preview) ----------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Counts = {
  swaps: PlannedExercise[];
  swappedOut: PlannedExercise[];
  removed: number;
  lighter: number;
};

function countChanges(day: ProgramDay, rows: readonly PlannedExercise[]): Counts {
  const planIds = new Set(day.exercises.map((p) => p.exerciseId));
  const rowIds = new Set(rows.map((p) => p.exerciseId));
  const swaps = rows.filter((p) => !planIds.has(p.exerciseId));
  const gone = day.exercises.filter((p) => !rowIds.has(p.exerciseId));
  const removed = Math.max(0, gone.length - swaps.length);
  const lighter = rows.filter((p) => planIds.has(p.exerciseId) && p.adjusted !== undefined).length;
  return { swaps, swappedOut: gone, removed, lighter };
}

/**
 * One line for "Adjusted today: …", e.g. "Easy on arms · 1 swap, 1 removed". Pass the plan day
 * to get counts (without it, swaps and removals can't be told apart). null = nothing to show.
 */
export function adjustSummary(
  override: DayOverride,
  nameOf: (exerciseId: string) => string,
  planDay?: ProgramDay,
): string | null {
  if (override.rest) return 'Rest day (moved)';
  const adjust = override.adjust;
  if (!adjust) return 'Training day (moved)';
  if (adjust.kind === 'lighter') return 'Lighter today';
  if (adjust.kind === 'deload') return 'Deload week';

  const head = adjust.kind === 'avoidArea' && adjust.area ? `Easy on ${adjust.area}` : null;
  if (!planDay) return clean(head ?? 'Changed today', 'Changed today');
  const c = countChanges(planDay, adjust.exercises);
  const [from] = c.swappedOut;
  const [to] = c.swaps;
  if (!head && c.swaps.length === 1 && c.removed === 0 && c.lighter === 0 && from && to) {
    return clean(
      `${nameOf(from.exerciseId)} swapped for ${nameOf(to.exerciseId)}`,
      'Exercise swapped',
    );
  }
  const parts = [
    c.swaps.length > 0 ? plural(c.swaps.length, 'swap') : '',
    c.removed > 0 ? `${c.removed} removed` : '',
    c.lighter > 0 ? `${c.lighter} lighter` : '',
  ].filter(Boolean);
  const text = `${head ?? 'Changed today'}${parts.length > 0 ? ` · ${parts.join(', ')}` : ''}`;
  return clean(text, 'Changed today');
}

const repsText = ([a, b]: PlannedExercise['targetReps']) => (a === b ? `${a}` : `${a}–${b}`);

/** What the row's weight would default to (session defaultsFor), in kg; undefined = blank. */
function rowWeight(p: PlannedExercise, lastKg: number | undefined): number | undefined {
  return p.weightKgToday ?? lastKg ?? p.startWeightKg;
}

/**
 * A short note for one adjusted row in the preview: "Removed", "Swapped for X",
 * "−1 set · 10 kg (was 12.5)", "6–10 reps (was 8–12)". `lastKg` = last time's weight for the
 * `before` exercise (what it would have run). null = unchanged.
 */
export function rowAdjustNote(
  before: PlannedExercise | undefined,
  after: PlannedExercise | null,
  unit: Unit,
  nameOf: (exerciseId: string) => string,
  lastKg?: number,
): string | null {
  if (after === null) return before ? 'Removed' : null;
  if (!before) return 'Added';
  if (before.exerciseId !== after.exerciseId)
    return clean(`Swapped for ${nameOf(after.exerciseId)}`, 'Swapped');

  const parts: string[] = [];
  const dSets = after.sets - before.sets;
  if (dSets !== 0) parts.push(`${dSets < 0 ? '−' : '+'}${plural(Math.abs(dSets), 'set')}`);
  const was = rowWeight(before, lastKg);
  const now = rowWeight(after, lastKg);
  if (now !== undefined && now > 0 && was !== undefined && Math.abs(now - was) > 1e-6) {
    parts.push(`${formatWeight(now, unit)} ${unit} (was ${formatWeight(was, unit)})`);
  }
  if (
    after.targetReps[0] !== before.targetReps[0] ||
    after.targetReps[1] !== before.targetReps[1]
  ) {
    parts.push(`${repsText(after.targetReps)} reps (was ${repsText(before.targetReps)})`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
