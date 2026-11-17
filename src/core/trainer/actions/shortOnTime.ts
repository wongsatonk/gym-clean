/**
 * M12 1b action "Short on time" (SPEC M12 trainer kit item 5), for today only. Pure.
 *
 * `minutes` is what he has (a chip's 20 / 30 / 45, or a typed "I have 25 min"):
 * - today already takes that long or less → "Your day already fits." (checked as typed);
 * - else the day is fitted into the nearest lower option (25 → 20; below the shortest → the
 *   shortest) by `fitToMinutes`: the main lifts (the day's first compound exercises, at most
 *   `SHORT_ON_TIME.mainLifts`; the first row when there is none) stay as planned; neighbouring
 *   accessories are paired back to back (`pairWith` on both rows + the pair rest; true alternating
 *   supersets wait, Decision "M12 slices 1b + 2"); then accessory sets are trimmed (min 2); then
 *   the last accessories are dropped. Only when the main lifts alone are too long are they
 *   trimmed too.
 * - The day is changed as it will run (stacking on an earlier avoid-area, lighter or swap
 *   override, whose row map is kept). Rows in `started` (logged sets) are never touched.
 * - Written as today's override of kind 'shortOnTime'; dropped rows are in its row map. Trimmed
 *   rows are marked `adjusted: 'lighter'` unless they already carry a mark.
 * - Asked again while a shorter version is in place, it rebuilds from the planned day (the
 *   block's version on a block date), so more time gives a longer day and less time a shorter
 *   one; the same length again → "Today is already set for N min."; a length the whole planned
 *   day fits in → "Back to the full day" (the override is removed, or reduced to its day pin
 *   when it pinned another day than the rotation's). A shorter version stacked on another
 *   change (e.g. go easy on arms) loses that change when rebuilt: there is no record of it.
 */
import type { PlannedExercise, Proposal } from '../../types';
import { estimateMinutes, fitToMinutes } from '../estimate';
import { effectiveDay } from '../plan';
import type { TrainerCatalog } from '../swapCandidates';
import { SHORT_ON_TIME, TIME_RULES } from '../timeRules';
import {
  baseReplaced,
  baseRows,
  composeReplaced,
  nameOf,
  refuse,
  rowLine,
  rowText,
  todayDay,
  withDayAdjust,
  type ActionContext,
  type ActionResult,
} from './lighter';

export const ALREADY_FITS = 'Your day already fits.';
/** The title of the proposal that brings the whole planned day back. */
export const FULL_DAY_TITLE = 'Back to the full day';

/** The option a typed length is built for: the nearest lower one, else the shortest. */
export function shortOptionFor(minutes: number): number {
  const options = [...SHORT_ON_TIME.options].sort((a, b) => a - b);
  let pick = options[0] ?? minutes;
  for (const o of options) if (o <= minutes) pick = o;
  return pick;
}

/** The rows kept whole: the first compound exercises (data), else the first row. */
export function mainLiftIds(
  rows: readonly PlannedExercise[],
  catalog: Pick<TrainerCatalog, 'exercises'>,
): string[] {
  const mechanic = new Map(catalog.exercises.map((e) => [e.id, e.mechanic]));
  const main = rows
    .filter((p) => mechanic.get(p.exerciseId) === SHORT_ON_TIME.mainMechanic)
    .slice(0, SHORT_ON_TIME.mainLifts)
    .map((p) => p.exerciseId);
  const first = rows[0];
  return main.length > 0 || !first ? main : [first.exerciseId];
}

export function proposeShortOnTime(
  ctx: ActionContext,
  minutes: number,
  catalog: Pick<TrainerCatalog, 'exercises'>,
): ActionResult {
  const today = todayDay(ctx);
  if (!today.ok) return today;
  const names = new Map(catalog.exercises.map((e) => [e.id, e.name]));
  const named: ActionContext = {
    ...ctx,
    exerciseName: (id) => names.get(id) ?? nameOf(ctx, id),
  };
  const current = baseRows(ctx.state, today.day.id, today.override, [], ctx.today);
  const shorter = today.override?.adjust?.kind === 'shortOnTime';
  const rows = shorter
    ? baseRows(ctx.state, today.day.id, today.override, ['shortOnTime'], ctx.today)
    : current;
  const now = estimateMinutes({ exercises: rows });
  if (now <= minutes) {
    if (!shorter) return refuse('nothingToChange', ALREADY_FITS);
    return fullDayBack(ctx, today.day.id, current, now);
  }

  const limit = shortOptionFor(minutes);
  const fit = fitToMinutes(rows, {
    minutes: limit,
    main: mainLiftIds(rows, catalog),
    pair: true,
    fixed: ctx.started ?? [],
  });
  if (now <= limit)
    return refuse(
      'nothingToChange',
      `Today is already about ${now} min. That's as short as I plan it.`,
    );
  if (!fit.fits)
    return refuse(
      'nothingToChange',
      `Today can't get down to ${limit} min. Try Not today instead.`,
    );

  const before = new Map(rows.map((p) => [p.exerciseId, p]));
  const out = fit.rows.map((q) => {
    const p = before.get(q.exerciseId);
    return p && q.sets < p.sets && q.adjusted === undefined
      ? { ...q, adjusted: 'lighter' as const }
      : q;
  });
  if (shorter && JSON.stringify(out) === JSON.stringify(current))
    return refuse('nothingToChange', `Today is already set for ${limit} min.`);
  const after = new Map(out.map((q) => [q.exerciseId, q]));

  const pairs: Proposal['lines'] = [];
  const trims: Proposal['lines'] = [];
  const drops: Proposal['lines'] = [];
  for (const p of rows) {
    const q = after.get(p.exerciseId);
    if (!q) {
      drops.push({
        before: `${nameOf(named, p.exerciseId)} · ${rowText(p, ctx)}`,
        after: 'Removed today',
      });
      continue;
    }
    if (q.sets !== p.sets) trims.push(rowLine(p, q, named));
    // A new pair, named once (at its first row).
    const partner = q.pairWith === undefined ? undefined : after.get(q.pairWith);
    if (partner && p.pairWith === undefined && out.indexOf(q) < out.indexOf(partner)) {
      pairs.push({
        before: `${nameOf(named, q.exerciseId)} + ${nameOf(named, partner.exerciseId)}`,
        after: `Back to back, ${TIME_RULES.pairRestSec} s rest`,
      });
    }
  }

  return {
    ok: true,
    proposal: {
      action: 'shortOnTime',
      scope: 'today',
      title: `Short on time: ${limit} min`,
      lines: [...pairs, ...trims, ...drops],
      why:
        `Your main lifts stay. The smaller moves are paired, trimmed or left out, ` +
        `so today takes about ${fit.minutes} min instead of ${now}. Just for today.`,
      say: 'Done. Today is shorter.',
      next: withDayAdjust(ctx.state, ctx.today, today.day.id, {
        kind: 'shortOnTime',
        exercises: out,
        replaced: composeReplaced(
          baseReplaced(today.override, ['shortOnTime']),
          fit.dropped.map((fromId) => ({ fromId, toId: null })),
        ),
      }),
      baseVersion: ctx.state.version,
    },
  };
}

/** The shorter version undone as a proposal: today runs the whole planned day again. */
function fullDayBack(
  ctx: ActionContext,
  dayId: string,
  current: readonly PlannedExercise[],
  full: number,
): ActionResult {
  const others = ctx.state.overrides.filter((o) => o.date !== ctx.today);
  const without = { ...ctx.state, overrides: others };
  const rotationDay = effectiveDay(without, ctx.sessions, ctx.today).day?.id;
  const overrides = rotationDay === dayId ? others : [...others, { date: ctx.today, dayId }];
  return {
    ok: true,
    proposal: {
      action: 'shortOnTime',
      scope: 'today',
      title: FULL_DAY_TITLE,
      lines: [
        {
          before: `Shorter day · about ${estimateMinutes({ exercises: current })} min`,
          after: `Full day · about ${full} min`,
        },
      ],
      why: `You have time for the whole planned day today, about ${full} min.`,
      say: 'Done. The full day is back.',
      next: { ...ctx.state, overrides },
      baseVersion: ctx.state.version,
    },
  };
}
