/**
 * M10 mid-workout "Remove <exercise> today" (SPEC M10 goal 3: swap or remove exercises with no
 * logged sets). Pure. Today's override (kind 'swap', pinned to the day id) runs the day without
 * the row. Refused for an exercise with logged sets, one that isn't in today's day, or the last
 * row left (End workout is the way out then).
 */
import {
  baseRows,
  nameOf,
  refuse,
  rowText,
  todayDay,
  withDayAdjust,
  type ActionContext,
  type ActionResult,
} from './lighter';

export function proposeRemove(ctx: ActionContext, exerciseId: string): ActionResult {
  const today = todayDay(ctx);
  if (!today.ok) return today;
  const rows = baseRows(ctx.state, today.day.id, today.override, []);
  const p = rows.find((r) => r.exerciseId === exerciseId);
  const name = nameOf(ctx, exerciseId);
  if (!p) return refuse('notInDay', `${name} isn't in today's workout.`);
  if ((ctx.started ?? []).includes(exerciseId))
    return refuse('started', `${name} has sets logged already, so it stays.`);
  const out = rows.filter((r) => r !== p);
  if (out.length === 0)
    return refuse('wholeDay', "That's the last exercise. End the workout instead.");
  return {
    ok: true,
    proposal: {
      action: 'swap',
      scope: 'today',
      title: `Remove ${name} today`,
      lines: [{ before: `${name} · ${rowText(p, ctx)}`, after: 'Removed today' }],
      why: 'The rest of today stays as it is. Your plan is unchanged.',
      say: 'Done. Exercise removed.',
      next: withDayAdjust(ctx.state, ctx.today, today.day.id, { kind: 'swap', exercises: out }),
      baseVersion: ctx.state.version,
    },
  };
}
