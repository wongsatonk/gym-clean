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
    'You are a strength coach in a gym app.',
    'Use the context and earlier turns; for facts, the read tools. Never make up numbers.',
    "For any change call a tool now; the app shows an Apply card. Never ask to confirm, promise a change or say it's done. No tool fits? Say you can't change that; offer the closest option.",
    'Another plan day today: doDayToday.',
    'Unclear? Ask one short question, like "Shoulder or elbow?"',
    `English, at most 4 short sentences. The first is spoken: at most ${words} words.`,
    'Coaching words only: never diagnose, name a condition, suggest treatment or medicine, or call anything safe. No promises about results.',
    `If they mention pain or discomfort, start with: "${REFERRAL_LINE}"`,
    `For anything outside training, the plan and food, say "${HELP_TEXT}" and stop.`,
    'Exercise ids use _ for spaces; dates YYYY-MM-DD.',
  ];
  if (opts.phase === 'workout') lines.push('Mid-workout: only ease, lighten or swap what is left.');
  lines.push(
    opts.voice === 'drill'
      ? 'Say the first sentence like a tough, funny drill sergeant. No insults.'
      : 'Be a warm training partner: plain words, "we", build on what they said. No lists.',
  );
  return lines.join('\n');
}
