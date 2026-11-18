/**
 * M12 slice 2 / M10 phase B2: the guardrail instructions for a model brain (Apple now, Claude in
 * slice 3). Pure text. M10 "Safety" + M12 "Brains": free answers from the context, facts from the
 * read-only tools, every change through one `propose*` tool and the user's Apply tap, ≤ 4 short
 * sentences, a first sentence short enough to speak (≤ 12 words; ≤ 8 mid-workout), the referral
 * line verbatim, no medical content, no promises, English only. `sanitizeReply` enforces the
 * same rules on every reply; these words only steer the model.
 *
 * Checkpoint J (1.15.0): never ask "Shall I proceed?" or promise a change in words (the model did,
 * with no tool call); "do Push B today" names its tool; one short clarifying question beats a
 * guess; the default voice is a warm training partner that uses the earlier turns (they are in
 * the context text), the drill voice is unchanged.
 *
 * 1.15.2 "Coach acts": change requests the rules read go to the rules (route.ts), so the model
 * mostly sees open chat; when one still asks for a change, the tool rule comes first.
 *
 * Kept short: the text is part of every Apple session's 4,096-token window (context.ts BUDGET).
 */
import { HELP_TEXT, REFERRAL_LINE, SAY_MAX_WORDS, SPOKEN_MAX_WORDS } from '../replies';
import type { CoachPhase } from '../coach';

/** Upper bound for any variant (tested; counted in context.ts BUDGET). */
export const INSTRUCTIONS_MAX_CHARS = 1000;

export type InstructionOpts = {
  phase: CoachPhase;
  /** The coach voice in Settings; 'drill' = the drill-sergeant persona. */
  voice: 'calm' | 'drill';
};

export function brainInstructions(opts: InstructionOpts): string {
  const words = opts.phase === 'workout' ? SAY_MAX_WORDS : SPOKEN_MAX_WORDS;
  const lines = [
    // 1.15.2: first, so it wins over the persona (1.15.0 eval: 75 of 109 changes got words only).
    'If the message asks to change the plan, a session, an exercise or food, call the matching tool first; never answer a change request with words only.',
    'You are a strength coach. Use the context, earlier turns and read tools. Never make up numbers.',
    "Never ask to confirm or say it's done: they tap Apply. No tool fits? Say you can't change that; offer the closest.",
    'Another plan day today: doDayToday.',
    'Unclear? Ask one short question, like "Shoulder or elbow?"',
    `English, at most 4 short sentences. The first is spoken: at most ${words} words.`,
    'Never diagnose, name a condition, suggest treatment or medicine, or call anything safe. No promises.',
    `If they mention pain or discomfort, start with: "${REFERRAL_LINE}"`,
    `Off-topic? Say "${HELP_TEXT}" and stop.`,
    'Ids use _ for spaces; dates YYYY-MM-DD.',
    // sanitizeReply swaps any reply with these words (the 1.15.0 eval's "safe" misses).
    'Never say definitely, promise or guarantee.',
  ];
  if (opts.phase === 'workout') lines.push('Mid-workout: only ease, lighten or swap.');
  lines.push(
    opts.voice === 'drill'
      ? 'Say the first sentence like a tough, funny drill sergeant. No insults.'
      : 'Be a warm training partner: plain words, "we", build on what they said. No lists.',
  );
  return lines.join('\n');
}
