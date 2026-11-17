/**
 * M12 action "Focus block" (SPEC M12 goal 6). Pure: a dated Proposal whose `next` holds the
 * block, applied and undone through changes.ts like every other proposal.
 *
 * - Input: params (built here with focusBlock.ts) or an already built / revised block.
 * - A block overlapping the new one is replaced; the others stay. Overrides on the new block's
 *   dates are dropped except rest days he asked for (they were built for the old days); later
 *   overrides (Lighter, Not today, swaps) apply on block days as usual.
 * - Lines: one per block week, "Week 1: 7 days, chest 14 sets" → "5 days, chest 20 sets"
 *   (before = what the calendar runs on those dates now).
 * - The coach never offers it mid-workout (coach.ts).
 */
import {
  blocksOutside,
  blockEnd,
  buildFocusBlock,
  focusSetsOf,
  validDaysPerWeek,
  validWeeks,
} from '../focusBlock';
import { FOCUS_RULES } from '../focusRules';
import { addDate, effectiveDay } from '../plan';
import type { TrainerCatalog } from '../swapCandidates';
import { dateText, refuse, type ActionContext, type ActionResult } from './lighter';
import type { FocusBlock, FocusBlockParams, FocusGroup, Proposal, TrainerState } from '../../types';

const GROUP_LABEL: Record<FocusGroup, string> = {
  arms: 'Arms',
  shoulders: 'Shoulders',
  chest: 'Chest',
  back: 'Back',
  legs: 'Legs',
  core: 'Core',
};

export const groupLabel = (g: FocusGroup): string => GROUP_LABEL[g];

const isBlock = (x: FocusBlockParams | FocusBlock): x is FocusBlock => 'days' in x;

export function proposeFocusBlock(
  ctx: ActionContext,
  input: FocusBlockParams | FocusBlock,
  catalog: TrainerCatalog,
): ActionResult {
  if (!validWeeks(input.weeks))
    return refuse('nothingToChange', 'A focus block runs 2 to 6 weeks.');
  if (!validDaysPerWeek(new Set(input.weekdays).size) || input.weekdays.length > 6)
    return refuse('nothingToChange', 'A focus block trains 3 to 6 days a week.');
  if (ctx.state.schedule.rotation.length === 0)
    return refuse('noDay', "There's no plan to build the block from.");
  const group = input.group;
  const label = GROUP_LABEL[group];
  const block = isBlock(input) ? input : buildFocusBlock(ctx.state, catalog, input, ctx.sessions);
  const focusTotal = block.days.reduce(
    (n, d) => n + focusSetsOf(d.day?.exercises ?? [], group, catalog),
    0,
  );
  if (focusTotal === 0)
    return refuse(
      'noCandidate',
      `I don't have ${group} exercises your gym can do yet, so I can't build that block.`,
    );

  const end = blockEnd(block);
  const lines: Proposal['lines'] = [];
  for (let w = 0; w < block.weeks; w++) {
    let daysBefore = 0;
    let setsBefore = 0;
    for (let i = 0; i < 7; i++) {
      const e = effectiveDay(ctx.state, ctx.sessions, addDate(block.startDate, w * 7 + i));
      if (e.rest || !e.day) continue;
      daysBefore++;
      setsBefore += focusSetsOf(e.day.exercises, group, catalog);
    }
    const week = block.days.slice(w * 7, w * 7 + 7);
    const daysAfter = week.filter((d) => d.day !== null).length;
    const setsAfter = week.reduce(
      (n, d) => n + focusSetsOf(d.day?.exercises ?? [], group, catalog),
      0,
    );
    const light = w === block.weeks - 1 ? ', lighter week' : '';
    lines.push({
      before: `Week ${w + 1}: ${daysBefore} days, ${group} ${setsBefore} sets`,
      after: `${daysAfter} days, ${group} ${setsAfter} sets${light}`,
    });
  }

  const pct = Math.round((FOCUS_RULES.setsFactor - 1) * 100);
  const next: TrainerState = {
    ...structuredClone(ctx.state),
    overrides: structuredClone(ctx.state.overrides).filter(
      (o) => o.rest === true || o.date < block.startDate || o.date > end,
    ),
    blocks: [...blocksOutside(structuredClone(ctx.state.blocks), block.startDate, end), block],
  };
  return {
    ok: true,
    proposal: {
      action: 'focusBlock',
      scope: 'dated',
      title: `${label} focus: ${block.weeks} weeks`,
      lines,
      why:
        `${label} gets about ${pct}% more sets, on at least ${FOCUS_RULES.minFocusDays} days a week. ` +
        `Everything else stays as it is, and the last week is lighter. ` +
        `After ${dateText(end)} your usual plan comes back.`,
      say: `Done. ${label} focus block is on.`,
      next,
      baseVersion: ctx.state.version,
    },
  };
}
