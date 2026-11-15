/**
 * M10 action "Swap an exercise" (SPEC M10 goal 2). Pure.
 *
 * - Candidates: swapCandidates without an area (shares a primary muscle, kit the gym has),
 *   excluding the exercises already in the day (scope `today`) or in every plan day that has
 *   the exercise (scope `plan`). The top 3 are offered, each with its own Proposal.
 * - `today`: today's override (pinned to its day id) runs the candidate in the same slot with the
 *   same sets, reps and rest, marked `adjusted: 'swap'`. Refused on a rest/done day and for an
 *   exercise with logged sets (`started`).
 * - `plan`: every plan day with the exercise changes (no badge), and so do dated adjust
 *   overrides from today on that still list it. Older overrides are history and stay.
 * - The weight comes from the new exercise's history, else 0 for bodyweight, else blank.
 * - `proposeSwap` validates any target (a model's tool call can name anything): it must be one of
 *   the eligible candidates.
 */
import type { DayOverride, PlannedExercise, Proposal, TrainerState } from '../../types';
import { wordCount } from '../../advice';
import {
  swapCandidates,
  swappedRow,
  type SwapCandidate,
  type TrainerCatalog,
} from '../swapCandidates';
import {
  baseReplaced,
  baseRows,
  composeReplaced,
  refuse,
  rowText,
  todayDay,
  withDayAdjust,
  type ActionContext,
  type ActionResult,
} from './lighter';

export type SwapScope = 'today' | 'plan';

export type SwapOption = {
  exerciseId: string;
  name: string;
  tracking: PlannedExercise['tracking'];
  proposal: Proposal;
};

export type SwapOptionsResult =
  { ok: true; options: SwapOption[] } | Extract<ActionResult, { ok: false }>;

const SAY_MAX_WORDS = 8;
const FALLBACK_SAY = 'Done. Exercise swapped.';

type Prepared =
  | {
      ok: true;
      exclude: string[];
      build: (c: SwapCandidate) => Proposal;
      tracking: PlannedExercise['tracking'];
    }
  | Extract<ActionResult, { ok: false }>;

function say(from: string, to: string): string {
  const s = `Done. ${from} swapped for ${to}.`;
  return wordCount(s) <= SAY_MAX_WORDS ? s : FALLBACK_SAY;
}

function prepare(
  ctx: ActionContext,
  fromId: string,
  catalog: TrainerCatalog,
  scope: SwapScope,
): Prepared {
  const from = catalog.exercises.find((e) => e.id === fromId);
  if (!from) return refuse('unknownExercise', "I don't know that exercise.");
  const nameOf = (id: string) =>
    catalog.exercises.find((e) => e.id === id)?.name ?? id.replace(/_/g, ' ');

  if (scope === 'today') {
    const today = todayDay(ctx);
    if (!today.ok) return today;
    const rows = baseRows(ctx.state, today.day.id, today.override, []);
    const i = rows.findIndex((p) => p.exerciseId === fromId);
    const p = rows[i];
    if (!p) return refuse('notInDay', `${from.name} isn't in today's workout.`);
    if ((ctx.started ?? []).includes(fromId))
      return refuse('started', `${from.name} has sets logged already, so it stays.`);
    return {
      ok: true,
      exclude: rows.map((r) => r.exerciseId),
      tracking: p.tracking,
      build: (c) => {
        const q = swappedRow(p, c, ctx.lastWeightKg, 'swap');
        const out = rows.map((r, k) => (k === i ? q : r));
        return {
          action: 'swap',
          scope: 'today',
          title: `Swap ${from.name} today`,
          lines: [
            {
              before: `${from.name} · ${rowText(p, ctx)}`,
              after: `${c.exercise.name} · ${rowText(q, ctx)}`,
            },
          ],
          why: 'It works the same main muscles with kit your gym has. Just for today.',
          say: say(from.name, c.exercise.name),
          next: withDayAdjust(ctx.state, ctx.today, today.day.id, {
            kind: 'swap',
            exercises: out,
            replaced: composeReplaced(baseReplaced(today.override, []), [
              { fromId, toId: q.exerciseId },
            ]),
          }),
          baseVersion: ctx.state.version,
        };
      },
    };
  }

  const days = ctx.state.plan.days.filter((d) => d.exercises.some((p) => p.exerciseId === fromId));
  const first = days[0]?.exercises.find((p) => p.exerciseId === fromId);
  if (!first) return refuse('notInPlan', `${from.name} isn't in your plan.`);
  const live = (o: DayOverride) =>
    o.date >= ctx.today && o.adjust?.exercises.some((p) => p.exerciseId === fromId) === true;
  const exclude = [
    ...days.flatMap((d) => d.exercises.map((p) => p.exerciseId)),
    ...ctx.state.overrides
      .filter(live)
      .flatMap((o) => o.adjust?.exercises.map((p) => p.exerciseId) ?? []),
  ];
  return {
    ok: true,
    exclude,
    tracking: first.tracking,
    build: (c) => {
      const swapIn = (rows: PlannedExercise[], adjusted?: PlannedExercise['adjusted']) =>
        rows.map((p) =>
          p.exerciseId === fromId ? swappedRow(p, c, ctx.lastWeightKg, adjusted) : p,
        );
      const next: TrainerState = structuredClone(ctx.state);
      next.plan.days = next.plan.days.map((d) => ({ ...d, exercises: swapIn(d.exercises) }));
      next.overrides = next.overrides.map((o) =>
        live(o) && o.adjust
          ? {
              ...o,
              adjust: {
                ...o.adjust,
                exercises: swapIn(o.adjust.exercises, 'swap'),
                replaced: composeReplaced(o.adjust.replaced ?? [], [
                  { fromId, toId: c.exercise.id },
                ]),
              },
            }
          : o,
      );
      return {
        action: 'swap',
        scope: 'plan',
        title: `Swap ${from.name} from now on`,
        lines: days.map((d) => ({
          before: `${d.name} · ${from.name}`,
          after: `${d.name} · ${nameOf(c.exercise.id)}`,
        })),
        why: 'It works the same main muscles with kit your gym has. Every day with it changes from now on.',
        say: say(from.name, c.exercise.name),
        next,
        baseVersion: ctx.state.version,
      };
    },
  };
}

/** The top 3 swaps for `exerciseId`, each with its Proposal. */
export function proposeSwapOptions(
  ctx: ActionContext,
  exerciseId: string,
  catalog: TrainerCatalog,
  scope: SwapScope,
): SwapOptionsResult {
  const prep = prepare(ctx, exerciseId, catalog, scope);
  if (!prep.ok) return prep;
  const from = catalog.exercises.find((e) => e.id === exerciseId);
  if (!from) return refuse('unknownExercise', "I don't know that exercise.");
  const candidates = swapCandidates(from, catalog, {
    exclude: prep.exclude,
    tracking: prep.tracking,
  });
  if (candidates.length === 0)
    return refuse('noCandidate', `No good swap for ${from.name} with the kit your gym has.`);
  return {
    ok: true,
    options: candidates.map((c) => ({
      exerciseId: c.exercise.id,
      name: c.exercise.name,
      tracking: c.tracking,
      proposal: prep.build(c),
    })),
  };
}

/** One specific swap; `toId` must be an eligible candidate. */
export function proposeSwap(
  ctx: ActionContext,
  fromId: string,
  toId: string,
  catalog: TrainerCatalog,
  scope: SwapScope,
): ActionResult {
  const prep = prepare(ctx, fromId, catalog, scope);
  if (!prep.ok) return prep;
  const from = catalog.exercises.find((e) => e.id === fromId);
  if (!from) return refuse('unknownExercise', "I don't know that exercise.");
  const c = swapCandidates(from, catalog, {
    exclude: prep.exclude,
    limit: Number.POSITIVE_INFINITY,
  }).find((x) => x.exercise.id === toId);
  if (!c) return refuse('noCandidate', "That one isn't a good swap here.");
  return { ok: true, proposal: prep.build(c) };
}
