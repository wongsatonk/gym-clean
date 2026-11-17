/**
 * M12 slice 2 / M10 phase B: the read-only tool results, computed in the app before each
 * `respond` and passed in as `toolResults` (no JS round trip; docs/ios-setup.md "Slice 2 API
 * notes" item 4). Pure.
 *
 * - `weekSummary` / `progressSummary`: the rule brain's own "How's my week?" / "How am I doing?"
 *   answers (slice 1 scores from progress/completion.ts), so both brains quote the same numbers.
 * - `exerciseInfo:<id>` for every exercise today and in the next 7 days: name, muscles, how-to
 *   lines (src/data howto.json, else the catalog's instructions) and the cue. The bare
 *   `exerciseInfo` key holds the fallback for any other id ("Not in your plan this week.").
 * - `foodIdeas`: what's left of today's targets plus up to 3 ideas from the M10 food suggestion
 *   (actions/food.ts), or the rule line (no Fuel, no targets, all hit, nothing fits).
 * - Same never-contains rules as context.ts: values are picked field by field; no Health, body,
 *   check-in, note or dev-log data. Each result ≤ READ_RESULT_MAX_CHARS (context.ts BUDGET).
 *
 * Also the M12 "facts" eval: `factsInput` builds the made-up scenario in evals/facts.json and
 * `factsMatch` checks a reply quotes the numbers a correct answer must (used by the eval runner).
 */
import type {
  BodyArea,
  Goal,
  GoalKind,
  MacroSet,
  Program,
  ReadToolName,
  SetLog,
} from '../../types';
import { handle, type CoachContext } from '../coach';
import { effectiveDays, seedPlan } from '../plan';
import type { StallSession } from '../actions/stall';
import type { TrainerCatalog } from '../swapCandidates';
import { suggestFood } from '../actions/food';
import { leftMacros, remaining } from '../../nutrition/day';
import { FOOD_DONE, FOOD_LATER, FOOD_NONE, FOOD_SETUP, foodIdeasReply } from '../replies';
import type { BrainInput } from './context';

export const READ_RESULT_MAX_CHARS = 600;
export const NOT_IN_PLAN = 'Not in your plan this week.';
const HOW_TO_LINES = 3;

export type ReadToolResults = Record<ReadToolName, string> & Record<string, string>;

const cap = (s: string) =>
  s.length <= READ_RESULT_MAX_CHARS ? s : `${s.slice(0, READ_RESULT_MAX_CHARS - 1)}…`;

const outsideWorkout = (ctx: CoachContext): CoachContext => ({ ...ctx, phase: 'today' });

function exerciseInfo(input: BrainInput, id: string): string {
  const ex = input.coach.catalog.exercises.find((e) => e.id === id);
  if (!ex) return NOT_IN_PLAN;
  const how = input.howTo?.(id);
  const steps = (how?.lines ?? ex.instructions).slice(0, HOW_TO_LINES).join(' ');
  const helps = ex.secondaryMuscles.length > 0 ? ` Helps: ${ex.secondaryMuscles.join(', ')}.` : '';
  const cue = input.cue?.(id);
  return cap(
    `${ex.name} (${id}). Works: ${ex.primaryMuscles.join(', ')}.${helps} How: ${steps}${cue ? ` Cue: ${cue}` : ''}`,
  );
}

function foodIdeas(ctx: CoachContext): string {
  if (!ctx.m7Available) return FOOD_LATER;
  const fuel = ctx.fuel;
  if (!fuel?.targets) return FOOD_SETUP;
  const left = leftMacros(remaining(fuel.totals, fuel.targets));
  if (left.kcal <= 0 && left.proteinG <= 0) return FOOD_DONE;
  const foods = suggestFood(left, fuel);
  const head = foodIdeasReply(left);
  if (foods.length === 0) return cap(`${head.replace(/ Some ideas:$/, '')} ${FOOD_NONE}`);
  const list = foods
    .map(
      (f) =>
        `${f.label}: ${Math.round(f.macros.kcal)} kcal, ${Math.round(f.macros.proteinG)} g protein`,
    )
    .join('; ');
  return cap(`${head} ${list}.`);
}

export function readToolResults(input: BrainInput): ReadToolResults {
  const ctx = outsideWorkout(input.coach);
  const out: ReadToolResults = {
    weekSummary: cap(handle({ chip: 'week' }, ctx).reply),
    progressSummary: cap(handle({ chip: 'progress' }, ctx).reply),
    exerciseInfo: NOT_IN_PLAN,
    foodIdeas: foodIdeas(ctx),
  };
  for (const e of effectiveDays(ctx.state, ctx.sessions, ctx.today, 8)) {
    if (e.rest || !e.day) continue;
    for (const p of e.day.exercises) {
      const key = `exerciseInfo:${p.exerciseId}`;
      if (!(key in out)) out[key] = exerciseInfo(input, p.exerciseId);
    }
  }
  return out;
}

// ---------- the facts eval (evals/facts.json) ----------

/** A made-up scenario, as data the on-device eval runner can rebuild without test helpers. */
export type FactsScenario = {
  today: string;
  unit: 'kg' | 'lb';
  restWeekdays: number[];
  easyOn?: BodyArea[];
  /** Finished sessions on the default program; every planned set is logged unless skipped. */
  sessions: {
    id: string;
    dayId: string;
    /** Local YYYY-MM-DD; starts 18:00, lasts an hour. */
    date: string;
    /** Working weight per exercise (kg); default 0 (bodyweight). */
    weights?: Record<string, number>;
    /** Reps per set per exercise; default the top of the planned range. */
    reps?: Record<string, number>;
    /** Exercises not done. */
    skip?: string[];
  }[];
  fuel: {
    totals: MacroSet;
    targets: { kcal: number; proteinG: number; carbsG: number; fatG: number };
  };
  goal: { kind: GoalKind; text: string };
  liftGoals: {
    id: string;
    text: string;
    exerciseId: string;
    kg: number;
    reps: number;
    due: string;
    created: string;
  }[];
};

export type FactItem = {
  id: string;
  /** The made-up question. */
  text: string;
  /** Where a correct answer finds the facts: the context, or a read tool. */
  source: string;
  /** Strings a correct reply must contain (numbers compared as whole numbers). */
  facts: string[];
};

const at = (date: string, h: number): number => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, h).getTime();
};

/** The BrainInput for a facts scenario (no Fuel candidates: foodIdeas lists none). */
export function factsInput(
  s: FactsScenario,
  program: Program,
  catalog: TrainerCatalog,
): BrainInput {
  const seeded = seedPlan(program);
  const state = {
    ...seeded,
    schedule: { ...seeded.schedule, restWeekdays: [...s.restWeekdays] },
    ...(s.easyOn ? { easyOn: [...s.easyOn] } : {}),
  };
  const sessions: StallSession[] = [];
  const sets: SetLog[] = [];
  const lastWeightKg: Record<string, number> = {};
  for (const row of [...s.sessions].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const [id, kg] of Object.entries(row.weights ?? {})) if (kg > 0) lastWeightKg[id] = kg;
    const start = at(row.date, 18);
    sessions.push({
      sessionId: row.id,
      dayId: row.dayId,
      startedAt: start,
      endedAt: start + 3_600_000,
    });
    const day = state.plan.days.find((d) => d.id === row.dayId);
    let t = start;
    for (const p of day?.exercises ?? []) {
      if (row.skip?.includes(p.exerciseId)) continue;
      for (let i = 0; i < p.sets; i++) {
        t += 120_000;
        sets.push({
          sessionId: row.id,
          exerciseId: p.exerciseId,
          setIndex: i,
          reps: row.reps?.[p.exerciseId] ?? p.targetReps[1],
          weightKg: row.weights?.[p.exerciseId] ?? 0,
          restTakenSec: 90,
          startedAt: t,
          endedAt: t + 40_000,
        });
      }
    }
  }
  const t = s.fuel.targets;
  const goals: Goal[] = s.liftGoals.map((g) => ({
    id: g.id,
    text: g.text,
    target: { kind: 'lift', ref: g.exerciseId, value: g.kg, reps: g.reps },
    due: g.due,
    createdAt: at(g.created, 12),
  }));
  return {
    coach: {
      phase: 'today',
      state,
      sessions,
      sets,
      today: s.today,
      unit: s.unit,
      lastWeightKg,
      logged: [],
      catalog,
      m7Available: true,
      fuel: {
        totals: { ...s.fuel.totals },
        targets: {
          kcal: { value: t.kcal, estimate: true },
          proteinG: { value: t.proteinG, estimate: true },
          carbsG: { value: t.carbsG, estimate: true },
          fatG: { value: t.fatG, estimate: true },
        },
        favorites: [],
        foods: [],
        recipes: [],
        thaiDishes: [],
      },
    },
    turns: [],
    goalKind: s.goal.kind,
    goalText: s.goal.text,
    goals,
  };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every fact in the reply: numbers as whole numbers (22.5 is not 2 or 5; 1,234 = 1234). */
export function factsMatch(
  reply: string,
  item: Pick<FactItem, 'facts'>,
): { ok: boolean; missing: string[] } {
  const text = reply.replace(/(\d),(\d{3})\b/g, '$1$2').toLowerCase();
  const missing = item.facts.filter((f) => {
    const re = new RegExp(`(?<![\\d.])${escape(f.toLowerCase())}(?![\\d]|\\.\\d)`);
    return !re.test(text);
  });
  return { ok: missing.length === 0, missing };
}
