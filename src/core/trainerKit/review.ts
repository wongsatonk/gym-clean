/**
 * M12 slice 1b (trainer kit item 3): the coach review every 4–6 weeks. Pure; `today` is passed in.
 *
 * Once per period: the first review is due `reviewWeeks` after the earliest goal (or `since`,
 * e.g. the intake) and each later one `reviewWeeks` after the last review was posted. The caller
 * posts it in the chat and stores the time as `lastReviewAt`. Missed periods are not backfilled.
 * The review recaps each goal, then offers one thing: a focus block when things are on track, a
 * goal edit when a goal is behind, reached, or missing. Nothing changes by itself.
 */
import { addDate, localDate } from '../trainer/plan';
import type { Goal } from '../types';
import { goalProgressText, type GoalProgress } from './goals';
import { REVIEW_WEEKS_DEFAULT, REVIEW_WEEKS_RANGE } from './goalRules';

export type ReviewOffer = 'focusBlock' | 'goalEdit';
export type ReviewChip = { id: ReviewOffer; label: string };

export type Review = {
  /** The local date the review became due. */
  dueSince: string;
  /** The period used (4–6). */
  weeks: number;
  /** Shown in the chat. */
  text: string;
  /** Spoken, ≤ 12 words. */
  say: string;
  /** One recap line per goal. */
  lines: string[];
  offer: ReviewOffer;
  /** The offer first, then the other one. */
  chips: ReviewChip[];
};

/** The trainer-kit `reviewWeeks`, kept within 4–6 (junk → 5). */
export function reviewWeeksOf(reviewWeeks: number): number {
  if (!Number.isFinite(reviewWeeks)) return REVIEW_WEEKS_DEFAULT;
  return Math.min(REVIEW_WEEKS_RANGE[1], Math.max(REVIEW_WEEKS_RANGE[0], Math.round(reviewWeeks)));
}

const FOCUS_CHIP: ReviewChip = { id: 'focusBlock', label: 'Plan a focus block' };

/**
 * The review, or null when none is due. `goals` = the current goals; `opts.progress` =
 * `goalProgress` of each (matched by id) for the recap; `opts.since` = when to count from with
 * no goal and no review yet (the intake time).
 */
export function reviewDue(
  goals: readonly Goal[],
  lastReviewAt: number | undefined,
  reviewWeeks: number,
  today: string,
  opts: { progress?: readonly GoalProgress[]; since?: number } = {},
): Review | null {
  const starts = [...goals.map((g) => g.createdAt), ...(opts.since === undefined ? [] : [opts.since])];
  const anchor = lastReviewAt ?? (starts.length ? Math.min(...starts) : undefined);
  if (anchor === undefined) return null;
  const weeks = reviewWeeksOf(reviewWeeks);
  const dueSince = addDate(localDate(anchor), weeks * 7);
  if (today < dueSince) return null;

  const head = `${weeks}-week review.`;
  const say = `Time for your ${weeks}-week review.`;
  if (goals.length === 0) {
    return {
      dueSince,
      weeks,
      text: `${head} You have no goal set. Want to set one?`,
      say,
      lines: [],
      offer: 'goalEdit',
      chips: [{ id: 'goalEdit', label: 'Set a goal' }, FOCUS_CHIP],
    };
  }

  const progressOf = (g: Goal) => opts.progress?.find((p) => p.goalId === g.id);
  const statuses = goals.map((g) => progressOf(g)?.status ?? (g.doneAt !== undefined ? 'done' : undefined));
  const lines = opts.progress
    ? goals.map((g) => {
        const p = progressOf(g);
        return `${g.text}: ${p ? goalProgressText(p) : g.doneAt !== undefined ? 'Reached.' : 'Nothing logged for it yet.'}`;
      })
    : [`Your ${goals.length === 1 ? 'goal' : 'goals'}: ${goals.map((g) => g.text).join('; ')}.`];

  let offer: ReviewOffer;
  let ask: string;
  let chips: ReviewChip[];
  if (statuses.includes('behind')) {
    offer = 'goalEdit';
    ask = 'Want to move the date or the target?';
    chips = [{ id: 'goalEdit', label: 'Change my goal' }, FOCUS_CHIP];
  } else if (statuses.every((s) => s === 'done')) {
    offer = 'goalEdit';
    ask = 'Want to set the next goal?';
    chips = [{ id: 'goalEdit', label: 'Set the next goal' }, FOCUS_CHIP];
  } else {
    offer = 'focusBlock';
    ask = 'Want a focus block for the next weeks?';
    chips = [FOCUS_CHIP, { id: 'goalEdit', label: 'Change my goal' }];
  }
  return { dueSince, weeks, text: [head, ...lines, ask].join(' '), say, lines, offer, chips };
}
