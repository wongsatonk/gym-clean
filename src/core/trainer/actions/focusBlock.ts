/**
 * M12 action "Focus block" (SPEC M12 goal 6). Pure: a dated Proposal whose `next` holds the
 * block, applied and undone through changes.ts like every other proposal.
 *
 * - Input: params (built here with focusBlock.ts) or an already built / revised block.
 * - A block running into the new one is cut to end the day before the new start (its past days,
 *   focus marks and scores stay); one starting inside the new block's dates is replaced; the
 *   others stay. Overrides on the new block's
 *   dates are dropped except rest days he asked for (they were built for the old days); later
 *   overrides (Lighter, Not today, swaps) apply on block days as usual.
 * - Lines: one per block week, "Week 1: 7 days, chest 14 sets" → "5 days, chest 20 sets"
 *   (before = what the calendar runs on those dates now).
 * - The coach never offers it mid-workout (coach.ts).
 * - M12 1b: a block on a group on the standing go-easy list is refused ("Remove shoulders from
 *   your go-easy list first?"; the coach offers that proposal); the builder adds no load there.
 * - M13c: `core` reads "Abs & core" (title) / "abs" (lines); a gym with no abs exercise is
 *   refused like any group without exercises. An `alsoCore` block (abs rows added) says so in
 *   the title ("Chest focus + abs"), adds ", abs N sets" to each week line and one sentence to
 *   the why (the abs end with the block).
 */
import {
  blocksOutside,
  blockEnd,
  buildFocusBlock,
  cutBlock,
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
  core: 'Abs & core',
};

/** The group in a line or a sentence: "chest 14 sets", "abs 6 sets". */
const GROUP_WORD: Record<FocusGroup, string> = {
  arms: 'arms',
  shoulders: 'shoulders',
  chest: 'chest',
  back: 'back',
  legs: 'legs',
  core: 'abs',
};

export const groupLabel = (g: FocusGroup): string => GROUP_LABEL[g];
export const groupWord = (g: FocusGroup): string => GROUP_WORD[g];

/** The existing blocks once the new one (`start`…`end`) is in: overlapping ones cut or dropped. */
function keptBlocks(blocks: readonly FocusBlock[], start: string, end: string): FocusBlock[] {
  const outside = new Set(blocksOutside(blocks, start, end));
  return blocks.flatMap((b) => {
    if (outside.has(b)) return [b];
    const cut = cutBlock(b, start);
    return cut ? [cut] : [];
  });
}

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
  if ((ctx.state.easyOn ?? []).includes(input.group))
    return refuse('easyOn', `Remove ${input.group} from your go-easy list first?`);
  if (ctx.state.schedule.rotation.length === 0)
    return refuse('noDay', "There's no plan to build the block from.");
  const group = input.group;
  const label = GROUP_LABEL[group];
  const word = GROUP_WORD[group];
  const block = isBlock(input) ? input : buildFocusBlock(ctx.state, catalog, input, ctx.sessions);
  const focusTotal = block.days.reduce(
    (n, d) => n + focusSetsOf(d.day?.exercises ?? [], group, catalog),
    0,
  );
  if (focusTotal === 0)
    return refuse(
      'noCandidate',
      `I don't have ${word} exercises your gym can do yet, so I can't build that block.`,
    );
  const CORE = FOCUS_RULES.alsoCore.group;
  const withCore = block.alsoCore === true && group !== CORE;

  const end = blockEnd(block);
  const lines: Proposal['lines'] = [];
  for (let w = 0; w < block.weeks; w++) {
    let daysBefore = 0;
    let setsBefore = 0;
    let coreBefore = 0;
    for (let i = 0; i < 7; i++) {
      const e = effectiveDay(ctx.state, ctx.sessions, addDate(block.startDate, w * 7 + i));
      if (e.rest || !e.day) continue;
      daysBefore++;
      setsBefore += focusSetsOf(e.day.exercises, group, catalog);
      coreBefore += focusSetsOf(e.day.exercises, CORE, catalog);
    }
    const week = block.days.slice(w * 7, w * 7 + 7);
    const daysAfter = week.filter((d) => d.day !== null).length;
    const setsOf = (g: FocusGroup) =>
      week.reduce((n, d) => n + focusSetsOf(d.day?.exercises ?? [], g, catalog), 0);
    const light = w === block.weeks - 1 ? ', lighter week' : '';
    const abs = (n: number) => (withCore ? `, ${GROUP_WORD[CORE]} ${n} sets` : '');
    lines.push({
      before: `Week ${w + 1}: ${daysBefore} days, ${word} ${setsBefore} sets${abs(coreBefore)}`,
      after: `${daysAfter} days, ${word} ${setsOf(group)} sets${abs(setsOf(CORE))}${light}`,
    });
  }
  const firstWeek = block.days.slice(0, 7);
  const coreWeek = firstWeek.reduce(
    (n, d) => n + focusSetsOf(d.day?.exercises ?? [], CORE, catalog),
    0,
  );
  const coreDays = firstWeek.filter(
    (d) => focusSetsOf(d.day?.exercises ?? [], CORE, catalog) > 0,
  ).length;

  const pct = Math.round((FOCUS_RULES.setsFactor - 1) * 100);
  const next: TrainerState = {
    ...structuredClone(ctx.state),
    overrides: structuredClone(ctx.state.overrides).filter(
      (o) => o.rest === true || o.date < block.startDate || o.date > end,
    ),
    blocks: [...keptBlocks(structuredClone(ctx.state.blocks) ?? [], block.startDate, end), block],
  };
  return {
    ok: true,
    proposal: {
      action: 'focusBlock',
      scope: 'dated',
      title: `${label} focus${withCore ? ' + abs' : ''}: ${block.weeks} weeks`,
      lines,
      why:
        `${label} gets about ${pct}% more sets, on at least ${FOCUS_RULES.minFocusDays} days a week. ` +
        `Everything else stays as it is, and the last week is lighter. ` +
        `After ${dateText(end)} your usual plan comes back.` +
        (withCore
          ? ` Abs get ${coreWeek} sets a week on ${coreDays} days, and they end with the block.`
          : ''),
      say: `Done. ${label} focus block is on.`,
      next,
      baseVersion: ctx.state.version,
    },
  };
}
