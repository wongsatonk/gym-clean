/**
 * M12 rule brain: the M10 rule matcher (`handle()` in src/core/trainer/coach.ts) behind the
 * `CoachBrain` seam. Always available, on the phone, no network, no Health data. Chips skip the
 * router's model brains and come straight here (`answerChip`, source 'chip').
 */
import { handle, type CoachArgs, type CoachChipId } from '../../core/trainer/coach';
import type { BrainContext, BrainReply, CoachBrain } from '../../core/types';

export const rulesBrain: CoachBrain = {
  id: 'rules',
  status: () => Promise.resolve({ available: true }),
  ask: (text: string, ctx: BrainContext): Promise<BrainReply> =>
    Promise.resolve({ ...handle({ text }, ctx.coach), source: 'rules' }),
};

/** A quick chip / follow-up chip, answered by the rules directly. May throw (the router catches). */
export function answerChip(
  input: { chip: CoachChipId; args?: CoachArgs },
  ctx: BrainContext,
): BrainReply {
  return { ...handle(input, ctx.coach), source: 'chip' };
}
