/**
 * M13c task 6c: when the chat shows the "Claude could help with this" explain card (Decision
 * "M13c answers", his words: "If coach does not have information enough and need to send data to
 * Claude Api, explain to user."). Pure: the caller passes the reply's outcome, the settings and
 * today's local date.
 *
 * Shown only when all hold:
 * - the phone's coach couldn't answer a typed message: the rules "I can help with:" fallback
 *   (`helpFallback`), the same after a model brain was skipped (`unavailable`), or Apple's
 *   "I couldn't make that change." (`couldntDo`);
 * - never after a red flag (that reply stays alone), never mid-workout;
 * - never when the to-do decision said no (`coach.claudeWanted === 'no'`);
 * - once a day (settings 'claudeOffer' `lastShownDate`; the caller saves `claudeOfferShown(today)`
 *   when the card shows, and on Not now).
 *
 * No request, client or key exists behind the card in 1.16.0: its only actions are "Tell me when
 * it's ready" (`coach.claudeWanted = 'yes'`) and Not now. imports.test.ts proves this module's
 * graph reaches no fetch, no native bridge and no brain request code.
 */
import { HELP_TEXT } from '../replies';
import type { CoachPhase, CoachResponse } from '../coach';
import type { BrainSource, ClaudeOffer, CoachDecisionSettings } from '../../types';

export type ClaudeOfferOutcome =
  /** A real answer, a proposal, food ideas, or a chip tap. */
  | 'answered'
  /** The rules "I can help with:" fallback to a typed message. */
  | 'helpFallback'
  /** The same fallback after a model brain was skipped (unavailable, error, timeout). */
  | 'unavailable'
  /** Apple's failed call: "I couldn't make that change." */
  | 'couldntDo'
  | 'redFlag';

export type ClaudeOfferInput = {
  outcome: ClaudeOfferOutcome;
  claudeWanted: CoachDecisionSettings['claudeWanted'];
  offer: ClaudeOffer | undefined;
  /** Local YYYY-MM-DD. */
  today: string;
  phase: CoachPhase;
};

export type ClaudeOfferSkip = 'answered' | 'redFlag' | 'midWorkout' | 'declined' | 'shownToday';

export type ClaudeOfferDecision = { show: true } | { show: false; why: ClaudeOfferSkip };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkDay(today: string): void {
  if (!DAY.test(today)) throw new RangeError(`today must be YYYY-MM-DD, got ${today}`);
}

export function claudeOfferFor(input: ClaudeOfferInput): ClaudeOfferDecision {
  checkDay(input.today);
  const { outcome } = input;
  if (outcome === 'redFlag') return { show: false, why: 'redFlag' };
  if (outcome === 'answered') return { show: false, why: 'answered' };
  if (input.phase === 'workout') return { show: false, why: 'midWorkout' };
  if (input.claudeWanted === 'no') return { show: false, why: 'declined' };
  const last = input.offer?.lastShownDate;
  // A later date (the clock moved back) counts as shown too: never twice in one day.
  if (last !== undefined && last >= input.today) return { show: false, why: 'shownToday' };
  return { show: true };
}

/** The settings 'claudeOffer' row to save when the card shows (or on Not now). */
export function claudeOfferShown(today: string): ClaudeOffer {
  checkDay(today);
  return { lastShownDate: today };
}

export type OfferReply = Pick<CoachResponse, 'reply' | 'safety'> &
  Partial<Pick<CoachResponse, 'proposal' | 'foods' | 'focusBlock'>> & {
    source: BrainSource;
    /** The router's "Answered by …" note: set when a model brain was skipped. */
    note?: string;
  };

/**
 * A coach reply's outcome for `claudeOfferFor`. `couldntDo` = the reply lines that mean a model's
 * call failed (main passes src/data/brain/apple.ts `COULDNT_DO`; core can't import it).
 */
export function claudeOutcomeOf(
  r: OfferReply,
  opts: { couldntDo?: readonly string[] } = {},
): ClaudeOfferOutcome {
  if (r.safety === 'redFlag') return 'redFlag';
  if (r.source === 'chip' || r.proposal || r.foods || r.focusBlock) return 'answered';
  const text = r.reply.trim();
  if ((opts.couldntDo ?? []).some((line) => line !== '' && text.startsWith(line)))
    return 'couldntDo';
  if (text.startsWith(HELP_TEXT)) return r.note ? 'unavailable' : 'helpFallback';
  return 'answered';
}

/** The explain card's copy (src/ui/coach/claudeOfferCard.ts renders it with the two lists). */
export const CLAUDE_OFFER = Object.freeze({
  title: 'Claude could help with this',
  why: "The coach on this phone can't answer that. Claude, an AI coach from Anthropic, could, using the items below. Nothing is sent unless you say yes.",
  sendsHead: 'What would be sent',
  neverHead: 'Never sent',
  keyNote: "Your key isn't set up yet.",
  wanted: "Tell me when it's ready",
  dismiss: 'Not now',
});
