/**
 * M12 recaps (SPEC M12 goal 8): a short coach message after each finished Mon–Sun week and after
 * each finished focus block. Pure; the caller posts it in the chat and stores what it posted in
 * settings 'coach' (`RecapMemory`), so each recap comes once.
 *
 * - Week: last week (the Mon–Sun week before today's), when it had anything planned or done and
 *   `last.week` is older than its Monday. Only the latest week; missed recaps aren't backfilled.
 * - Block: the newest block whose last date is before today and at most 7 days back, unless
 *   `last.block` is its id. M12 1b: it offers the next block, for the same group or the next one
 *   in the order, from the day after the block (two `nextBlock` chips whose args are
 *   trainer/nextBlock.ts `NextBlockArgs`; `proposeNextBlock` turns them into a Proposal). No
 *   extra lighter week: the block's own last week was lighter. "Keep going" (chip `focusBlock`
 *   with the same params) stays.
 * - Numbers come from completion.ts `periodScore`; every text passes `checkCopy`, `say` ≤ 12 words.
 */
import { addDate } from '../trainer/plan';
import { blockEnd } from '../trainer/focusBlock';
import { groupLabel } from '../trainer/actions/focusBlock';
import { nextBlockOffers } from '../trainer/nextBlock';
import { periodScore, weekStart, type CompletionInput } from './completion';
import type { PeriodScore } from '../types';

export type RecapMemory = {
  /** Monday (YYYY-MM-DD) of the last week recapped. */
  week?: string;
  /** Id of the last block recapped. */
  block?: string;
};

export type RecapChip = { id: string; label: string; args?: Record<string, unknown> };

export type Recap = {
  period: 'week' | 'block';
  from: string;
  to: string;
  blockId?: string;
  score: PeriodScore;
  /** Shown in the chat. */
  text: string;
  /** Spoken, ≤ 12 words. */
  say: string;
  chips: RecapChip[];
};

/** Chip id of a "next block" offer (args: `NextBlockArgs`). */
export const NEXT_BLOCK_CHIP = 'nextBlock';

/** How long after a block's last date its recap is still offered. */
export const BLOCK_RECAP_DAYS = 7;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const pctOf = (s: Pick<PeriodScore, 'setsPlanned' | 'setsDone'>): number | null =>
  s.setsPlanned > 0 ? Math.round((s.setsDone / s.setsPlanned) * 100) : null;

/** "3 of 4 sessions, 67% of planned sets" (null when nothing was planned). */
export function scoreLine(s: PeriodScore): string | null {
  if (s.sessionsPlanned === 0) return null;
  const pct = pctOf(s);
  const sessions = `${s.sessionsDone} of ${plural(s.sessionsPlanned, 'session')}`;
  return pct === null ? sessions : `${sessions}, ${pct}% of planned sets`;
}

export function weekRecapText(s: PeriodScore): { text: string; say: string } {
  const line = scoreLine(s);
  if (line === null) {
    const extra = plural(s.extra, 'extra session');
    return { text: `Last week: ${extra}. Nice work.`, say: `Last week: ${extra}.` };
  }
  const pct = pctOf(s) ?? 0;
  const extra = s.extra > 0 ? ` Plus ${plural(s.extra, 'extra session')}.` : '';
  const close =
    s.sessionsDone === s.sessionsPlanned && pct >= 100
      ? 'Every session done. Great week.'
      : pct >= 80
        ? 'Solid week. Keep it going.'
        : 'New week, fresh start.';
  return {
    text: `Last week: ${line}.${extra} ${close}`,
    say: `Last week: ${s.sessionsDone} of ${plural(s.sessionsPlanned, 'session')}.`,
  };
}

function blockRecapText(label: string, s: PeriodScore): { text: string; say: string } {
  const line = scoreLine(s) ?? plural(s.extra, 'extra session');
  const focus = s.focus ? ` ${label} sets: ${s.focus.sets} of ${s.focus.target}.` : '';
  return {
    text: `${label} block done: ${line}.${focus} Ready for the next block?`,
    say: `${label} block done. Ready for the next block?`,
  };
}

/** The recaps to post now (week first), each once. */
export function recapDue(input: CompletionInput, last: RecapMemory): Recap[] {
  const out: Recap[] = [];
  const from = addDate(weekStart(input.today), -7);
  if ((last.week ?? '') < from) {
    const to = addDate(from, 6);
    const score = periodScore(input, from, to);
    if (score.sessionsPlanned + score.extra > 0) {
      out.push({ period: 'week', from, to, score, ...weekRecapText(score), chips: [] });
    }
  }
  const oldest = addDate(input.today, -BLOCK_RECAP_DAYS);
  const ended = (input.state.blocks ?? [])
    .filter((b) => blockEnd(b) < input.today && blockEnd(b) >= oldest)
    .sort((a, b) => (blockEnd(a) < blockEnd(b) ? -1 : blockEnd(a) > blockEnd(b) ? 1 : 0));
  const block = ended.at(-1);
  if (block && block.id !== last.block) {
    const to = blockEnd(block);
    const score = periodScore(input, block.startDate, to);
    const label = groupLabel(block.group);
    out.push({
      period: 'block',
      from: block.startDate,
      to,
      blockId: block.id,
      score,
      ...blockRecapText(label, score),
      chips: [
        ...nextBlockOffers(block).map((o) => ({
          id: NEXT_BLOCK_CHIP,
          label: o.label,
          args: { ...o.args },
        })),
        {
          id: 'focusBlock',
          label: 'Keep going',
          args: { group: block.group, weeks: block.weeks, weekdays: [...block.weekdays] },
        },
      ],
    });
  }
  return out;
}
