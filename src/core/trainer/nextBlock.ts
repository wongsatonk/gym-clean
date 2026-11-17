/**
 * M12 1b "Plan beyond a month" (trainer-kit item 7). Pure; dates are passed in. Proposals only:
 * nothing here changes the plan, it only builds what Apply would do.
 *
 * - Next block: when a focus block ends, the recap (progress/recap.ts) offers a lighter week
 *   (7 days, the M10 deload rule) followed by another block, for the same group or the next one
 *   in `NEXT_BLOCK_RULES.groupOrder`. `proposeNextBlock` builds both as ONE Proposal, so one
 *   Apply puts them in and one Undo takes them out: the deload overrides sit on today … day 7 and
 *   the block starts on day 8.
 * - Deload suggestion: `deloadSuggested` says when to offer a Deload week: after
 *   `hardWeeks` full Mon–Sun weeks in a row (every planned session done, no lighter / deload
 *   day, not a block's lighter last week), or when `stalledExercises` plan exercises are stalled
 *   at once (M10 stall rule, actions/stall.ts). Offered once, then not again for
 *   `offerSpacingDays`. The offer is the existing `deload` chip (actions/lighter.ts
 *   `proposeDeload`), applied and undone like every other proposal.
 */
import { periodScore, weekStart } from '../progress/completion';
import type {
  FocusBlock,
  FocusBlockParams,
  FocusGroup,
  ProposalAction,
  SetLog,
  TrainerState,
} from '../types';
import { groupLabel, proposeFocusBlock } from './actions/focusBlock';
import { DELOAD, proposeDeload, type ActionContext, type ActionResult } from './actions/lighter';
import { detectStalls } from './actions/stall';
import { blockEnd } from './focusBlock';
import { addDate, localDate, type PlanSession } from './plan';
import type { TrainerCatalog } from './swapCandidates';

/** Rules as data (defaults; tuned with his gym feedback at Checkpoint J). */
export const NEXT_BLOCK_RULES = {
  /** "The next group" after a block: the one after it here, wrapping around. */
  groupOrder: ['chest', 'back', 'legs', 'shoulders', 'arms', 'core'] as readonly FocusGroup[],
  /** Full weeks in a row before a deload is suggested. */
  hardWeeks: 6,
  /** Plan exercises stalled at the same time before a deload is suggested. */
  stalledExercises: 2,
  /** After an offer, no new one for this many days (4 weeks). */
  offerSpacingDays: 28,
  /** How far back the run of full weeks is counted. */
  maxWeeksBack: 26,
} as const;

/** The group after `group` in `groupOrder` (wraps; an unknown group gives the first). */
export function nextGroup(group: FocusGroup): FocusGroup {
  const order = NEXT_BLOCK_RULES.groupOrder;
  return order[(order.indexOf(group) + 1) % order.length] ?? group;
}

/** What a "next block" chip carries (`CoachArgs`-shaped, plus `lighterWeek`). */
export type NextBlockArgs = {
  group: FocusGroup;
  /** 2–6. */
  weeks: number;
  /** Training weekdays, 0 = Sun. */
  weekdays: number[];
  /** Put a 7-day lighter week (the deload rule) before the block. */
  lighterWeek?: boolean;
};

export type NextBlockOffer = { label: string; args: NextBlockArgs };

/**
 * The two offers after `block`: a lighter week, then the same group again or the next group in
 * the order, with the block's length and weekdays.
 */
export function nextBlockOffers(
  block: Pick<FocusBlock, 'group' | 'weeks'> & { weekdays: readonly number[] },
): NextBlockOffer[] {
  return [block.group, nextGroup(block.group)].map((group) => ({
    label: `Lighter week, then ${groupLabel(group)}`,
    args: { group, weeks: block.weeks, weekdays: [...block.weekdays], lighterWeek: true },
  }));
}

/**
 * The Proposal for a next block. With `lighterWeek`: the M10 deload on the workouts of the next
 * 7 days, then the block from day 8, as one change. Without: the block alone, from today (or
 * tomorrow when today already has a session). When the next 7 days have no workout to make
 * lighter, the block still starts on day 8 and the proposal is the block alone.
 */
export function proposeNextBlock(
  ctx: ActionContext,
  args: NextBlockArgs,
  catalog: TrainerCatalog,
): ActionResult {
  const params = (startDate: string): FocusBlockParams => ({
    group: args.group,
    weeks: args.weeks,
    weekdays: [...args.weekdays],
    startDate,
  });
  if (args.lighterWeek !== true) {
    const busy = ctx.sessions.some((s) => localDate(s.startedAt) === ctx.today);
    return proposeFocusBlock(ctx, params(busy ? addDate(ctx.today, 1) : ctx.today), catalog);
  }

  const start = addDate(ctx.today, DELOAD.days);
  const light = proposeDeload(ctx);
  if (!light.ok) return proposeFocusBlock(ctx, params(start), catalog);
  // The block is built on the state the lighter week leaves; it starts after those dates, so it
  // keeps their overrides.
  const block = proposeFocusBlock({ ...ctx, state: light.proposal.next }, params(start), catalog);
  if (!block.ok) return block;
  const label = groupLabel(args.group);
  return {
    ok: true,
    proposal: {
      action: 'focusBlock',
      scope: 'dated',
      title: `Lighter week, then ${block.proposal.title}`,
      lines: [...light.proposal.lines, ...block.proposal.lines],
      why:
        `First ${DELOAD.days} days: half the sets and about 10% lighter. ` +
        `Then ${block.proposal.why}`,
      say: `Done. Lighter week, then ${label} focus.`,
      next: block.proposal.next,
      baseVersion: ctx.state.version,
    },
  };
}

// ---------- deload suggestion ----------

/** A session as the suggestion needs it; `SessionRow` (with its M10 `adjust`) fits. */
export type DeloadSession = PlanSession & {
  sessionId: string;
  adjust?: readonly ProposalAction[];
};

export type DeloadSuggestion = {
  reason: 'hardWeeks' | 'stalls';
  /** Full weeks in a row up to last week. */
  hardWeeks: number;
  /** Stalled plan exercise ids, in plan order. */
  stalled: string[];
  /** Shown in the chat. */
  text: string;
  /** Spoken, ≤ 12 words. */
  say: string;
  /** The offer: the coach's `deload` chip → `proposeDeload` → Apply / Undo. */
  chips: { id: 'deload'; label: string }[];
};

export type DeloadSuggestOptions = {
  /** His logged sets (`SetLog` rows). Without them nothing can be judged, so nothing is offered. */
  sets?: readonly SetLog[];
  /** Per exercise: the time of its last stall fix (stall.ts `since`). */
  stallSince?: Readonly<Record<string, number>>;
  /** Display names; defaults to the id with spaces. */
  name?: (exerciseId: string) => string;
};

const LIGHT: readonly string[] = ['lighter', 'deload'];
const DELOAD_CHIP = { id: 'deload', label: 'Deload week' } as const;

/** "A" / "A and B" / "A, B and C". */
const listText = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** True when the Mon–Sun week from `monday` had a lighter / deload day or a block's lighter week. */
function lightWeek(
  sessions: readonly DeloadSession[],
  state: TrainerState,
  monday: string,
): boolean {
  const sunday = addDate(monday, 6);
  const inWeek = (d: string) => d >= monday && d <= sunday;
  if (
    sessions.some(
      (s) => inWeek(localDate(s.startedAt)) && (s.adjust ?? []).some((a) => LIGHT.includes(a)),
    )
  )
    return true;
  if (state.overrides.some((o) => inWeek(o.date) && LIGHT.includes(o.adjust?.kind ?? ''))) {
    return true;
  }
  // A focus block's last 7 days are its lighter week.
  return (state.blocks ?? []).some((b) => {
    const end = blockEnd(b);
    return addDate(end, -6) <= sunday && end >= monday;
  });
}

/** Full weeks in a row, counted back from the week before today's. */
export function hardWeeksInARow(
  sessions: readonly DeloadSession[],
  state: TrainerState,
  today: string,
  sets: readonly SetLog[],
): number {
  const input = { state, sessions, sets, today };
  const thisMonday = weekStart(today);
  let n = 0;
  while (n < NEXT_BLOCK_RULES.maxWeeksBack) {
    const monday = addDate(thisMonday, -7 * (n + 1));
    const score = periodScore(input, monday, addDate(monday, 6));
    const full = score.sessionsPlanned > 0 && score.sessionsDone >= score.sessionsPlanned;
    if (!full || lightWeek(sessions, state, monday)) break;
    n++;
  }
  return n;
}

/**
 * Whether to offer a Deload week now, and why. `today` and `lastOfferAt` are local YYYY-MM-DD
 * (`lastOfferAt`: the last time any deload was offered, by this or by the "Lighter today?"
 * card; the caller stores today's date when it shows the suggestion). Null when there is
 * nothing to offer, an offer was made in the last `offerSpacingDays`, or a deload day is
 * already on from today.
 */
export function deloadSuggested(
  sessions: readonly DeloadSession[],
  state: TrainerState,
  today: string,
  lastOfferAt: string | undefined,
  opts: DeloadSuggestOptions = {},
): DeloadSuggestion | null {
  const rules = NEXT_BLOCK_RULES;
  if (lastOfferAt !== undefined && addDate(lastOfferAt, rules.offerSpacingDays) > today) {
    return null;
  }
  if (state.overrides.some((o) => o.date >= today && o.adjust?.kind === 'deload')) return null;
  const sets = opts.sets ?? [];
  if (sets.length === 0) return null;

  const hardWeeks = hardWeeksInARow(sessions, state, today, sets);
  const stalled = detectStalls(
    sets,
    sessions,
    state.plan,
    opts.stallSince ? { since: opts.stallSince } : {},
  ).map((s) => s.exerciseId);
  const chips = [{ ...DELOAD_CHIP }];

  if (hardWeeks >= rules.hardWeeks) {
    return {
      reason: 'hardWeeks',
      hardWeeks,
      stalled: stalled.length >= rules.stalledExercises ? stalled : [],
      text: `You've done every planned session for ${hardWeeks} weeks in a row. Want a lighter week?`,
      say: `${hardWeeks} full weeks in a row. Lighter week?`,
      chips,
    };
  }
  if (stalled.length >= rules.stalledExercises) {
    const name = opts.name ?? ((id: string) => id.replace(/_/g, ' '));
    return {
      reason: 'stalls',
      hardWeeks,
      stalled,
      text: `${listText(stalled.map(name))} have had the same best set for a while. Want a lighter week?`,
      say: `${stalled.length} lifts have stopped moving up. Lighter week?`,
      chips,
    };
  }
  return null;
}
