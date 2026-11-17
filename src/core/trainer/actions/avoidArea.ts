/**
 * M10 action "Go easy on a body area" (SPEC M10 goal 2), for today only. Pure.
 *
 * For each of today's exercises (as the day will run; a previous avoid-area override is rebuilt
 * from the plan day):
 * - a primary muscle in the area → swapped for the best catalog candidate that shares one of its
 *   primary muscles outside the area and doesn't load the area at all (see swapCandidates), or
 *   removed when none fits (always, for an exercise whose only primary muscle is in the area);
 * - the area only in secondary muscles → lightened: weight −10% snapped down, bodyweight reps
 *   −20%, sets unchanged (M10-q2 default);
 * - otherwise unchanged. Rows in `started` (logged sets mid-workout) are never touched.
 * The adjust records its row map (`replaced`), stacked on the base override's map.
 * When every exercise of the day works the area (e.g. legs on a Legs day), or nothing would be
 * left, there's no training proposal: the reply suggests "Not today" or a different day.
 */
import type { BodyArea, PlannedExercise, Proposal } from '../../types';
import {
  loadsArea,
  primaryInArea,
  swapCandidates,
  swappedRow,
  type TrainerCatalog,
} from '../swapCandidates';
import {
  baseReplaced,
  baseRows,
  composeReplaced,
  lightenRow,
  nameOf,
  refuse,
  rowText,
  todayDay,
  withDayAdjust,
  type ActionContext,
  type ActionResult,
} from './lighter';

export function proposeAvoidArea(
  ctx: ActionContext,
  area: BodyArea,
  catalog: TrainerCatalog,
): ActionResult {
  const today = todayDay(ctx);
  if (!today.ok) return today;
  const byId = new Map(catalog.exercises.map((e) => [e.id, e]));
  const named: ActionContext = {
    ...ctx,
    exerciseName: (id) => byId.get(id)?.name ?? nameOf(ctx, id),
  };
  const rows = baseRows(ctx.state, today.day.id, today.override, ['avoidArea'], ctx.today);
  const worksArea = (p: PlannedExercise) => {
    const e = byId.get(p.exerciseId);
    return e !== undefined && primaryInArea(e, area, catalog.areaOf);
  };
  const wholeDay = refuse(
    'wholeDay',
    `Today's workout is all ${area}. Try Not today, or train a different day.`,
    'postpone',
  );
  if (rows.length > 0 && rows.every(worksArea)) return wholeDay;

  const started = new Set(ctx.started ?? []);
  const taken = new Set(rows.map((p) => p.exerciseId));
  const lines: Proposal['lines'] = [];
  const out: PlannedExercise[] = [];
  const replaced: { fromId: string; toId: string | null }[] = [];
  for (const p of rows) {
    const e = byId.get(p.exerciseId);
    const before = `${nameOf(named, p.exerciseId)} · ${rowText(p, ctx)}`;
    if (started.has(p.exerciseId) || !e) {
      out.push(p);
    } else if (primaryInArea(e, area, catalog.areaOf)) {
      const [best] = swapCandidates(e, catalog, {
        avoid: area,
        exclude: [...taken],
        tracking: p.tracking,
        limit: 1,
      });
      if (best) {
        const q = swappedRow(p, best, ctx.lastWeightKg, 'avoidArea');
        taken.add(q.exerciseId);
        out.push(q);
        replaced.push({ fromId: p.exerciseId, toId: q.exerciseId });
        lines.push({ before, after: `${best.exercise.name} · ${rowText(q, ctx)}` });
      } else {
        replaced.push({ fromId: p.exerciseId, toId: null });
        lines.push({ before, after: 'Removed today' });
      }
    } else if (loadsArea(e, area, catalog.areaOf)) {
      const q = lightenRow(p, ctx, 'avoidArea');
      out.push(q);
      if (q !== p) lines.push({ before, after: rowText(q, ctx) });
    } else {
      out.push(p);
    }
  }
  if (out.length === 0) return wholeDay;
  if (lines.length === 0) {
    return refuse(
      'nothingInArea',
      `Today's workout doesn't load your ${area}. It can stay as planned.`,
    );
  }
  return {
    ok: true,
    proposal: {
      action: 'avoidArea',
      scope: 'today',
      title: `Go easy on your ${area} today`,
      lines,
      why: `Moves that mainly work your ${area} are swapped or dropped, and moves where they help are about 10% lighter.`,
      say: `Done. Easy on your ${area} today.`,
      next: withDayAdjust(ctx.state, ctx.today, today.day.id, {
        kind: 'avoidArea',
        area,
        exercises: out,
        replaced: composeReplaced(baseReplaced(today.override, ['avoidArea']), replaced),
      }),
      baseVersion: ctx.state.version,
    },
  };
}
