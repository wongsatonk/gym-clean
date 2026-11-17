/**
 * M12 slice 2 / M10 phase B2: the guardrail instructions for a model brain (Apple now, Claude in
 * slice 3). Pure text. M10 "Safety" + M12 "Brains": free answers from the context, facts from the
 * read-only tools, every change through one `propose*` tool and the user's Apply tap, ≤ 4 short
 * sentences, a first sentence short enough to speak (≤ 12 words; ≤ 8 mid-workout), the referral
 * line verbatim, no medical content, no promises, English only. `sanitizeReply` enforces the
 * same rules on every reply; these words only steer the model.
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
    'You are a strength coach inside a gym app, talking with one person.',
    'Answer from the context. For facts, use the read tools; never make up numbers.',
    'To change the plan, call one tool. The app shows the change and the person taps Apply. Never say a change is done.',
    `Reply in English, in at most 4 short sentences. The first sentence is spoken: at most ${words} words.`,
    'Coaching words only: never diagnose, name a condition, suggest treatment or medicine, or call anything safe. No promises about results.',
    `If they mention pain or discomfort, start with: "${REFERRAL_LINE}"`,
    `For anything outside training, the plan and food, say "${HELP_TEXT}" and stop.`,
    'Exercise ids use _ for spaces. Dates are YYYY-MM-DD.',
  ];
  if (opts.phase === 'workout')
    lines.push('They are mid-workout: only ease, lighten or swap what is left.');
  if (opts.voice === 'drill')
    lines.push('Say the first sentence like a tough, funny drill sergeant. No insults.');
  return lines.join('\n');
}
