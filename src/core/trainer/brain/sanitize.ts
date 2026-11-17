/**
 * M12 slice 2 / M10 phase B2: the output filter on every model reply (SPEC M10 "Safety"). Pure.
 *
 * - A red flag (from the user's message, intents.ts) → only the fixed red-flag line.
 * - Banned / diagnosis words (`checkCopy`), treatment advice and promises about results (as data
 *   below), or another script (English only) → the whole reply becomes `SAFE_LINE`.
 * - Discomfort → the referral line first (added once).
 * - At most 4 sentences in total (the referral line counts); exercise ids become names.
 * - `say` (spoken) ≤ 12 words, ≤ 8 mid-workout; dropped when it fails the check.
 */
import { wordCount } from '../../advice';
import type { CoachPhase } from '../coach';
import type { Safety } from '../intents';
import {
  checkCopy,
  RED_FLAG_LINE,
  REFERRAL_LINE,
  SAY_MAX_WORDS,
  SPOKEN_MAX_WORDS,
} from '../replies';

/** The fixed line that replaces a failing reply (passes `checkCopy`). */
export const SAFE_LINE = "I can't answer that one. Ask me about your plan, sessions or food.";

export const MAX_SENTENCES = 4;

/** Treatment advice and promises (SPEC M10 Safety), beyond the checkCopy lists. */
export const UNSAFE_PATTERNS: readonly { id: string; re: RegExp }[] = [
  { id: 'ice', re: /\b(ice it|ice pack|icing)\b/i },
  {
    id: 'restDays',
    re: /\brest (it )?(for )?(a|an|one|two|three|four|five|\d+) (days?|weeks?)\b/i,
  },
  { id: 'medicine', re: /\b(ibuprofen|paracetamol|aspirin|medicine|pills?)\b/i },
  { id: 'heal', re: /\b(heal|cure|recover from)\b/i },
  { id: 'guarantee', re: /\b(guarantee[ds]?|promise[ds]?|definitely)\b/i },
  { id: 'goAway', re: /\bwill go away\b/i },
];

/** Thai and any other non-Latin script (the chat is English only). */
const OTHER_SCRIPT = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

export type SanitizeOpts = { say?: string; phase?: CoachPhase };
export type Sanitized = {
  text: string;
  say?: string;
  /** True when the model's text was swapped for SAFE_LINE / the red-flag line. */
  replaced: boolean;
  /** What failed (ids and words, for the dev log / eval; never the text). */
  hits: string[];
};

function problems(text: string): string[] {
  const hits = [...checkCopy(text).hits];
  for (const p of UNSAFE_PATTERNS) if (p.re.test(text)) hits.push(p.id);
  if (OTHER_SCRIPT.test(text)) hits.push('script');
  return hits;
}

function splitSentences(text: string): string[] {
  // Split after . ! ? followed by whitespace, never inside "22.5".
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const idsToNames = (text: string) =>
  text.replace(/\b([A-Za-z]+(?:[_-][A-Za-z0-9]+)*_[A-Za-z0-9-]+)\b/g, (m) => m.replace(/_/g, ' '));

function capSay(say: string | undefined, phase: CoachPhase | undefined): string | undefined {
  if (say === undefined || say.trim() === '' || problems(say).length > 0) return undefined;
  const max = phase === 'workout' ? SAY_MAX_WORDS : SPOKEN_MAX_WORDS;
  const words = say.trim().split(/\s+/);
  return wordCount(say) <= max ? say.trim() : words.slice(0, max).join(' ');
}

export function sanitizeReply(text: string, safety: Safety, opts: SanitizeOpts = {}): Sanitized {
  if (safety === 'redFlag')
    return { text: RED_FLAG_LINE, replaced: text.trim() !== RED_FLAG_LINE, hits: ['redFlag'] };
  let body = idsToNames(text.trim());
  const hits = problems(body);
  const replaced = hits.length > 0;
  if (replaced) body = SAFE_LINE;
  let parts = splitSentences(body);
  if (safety === 'discomfort') {
    const referral = splitSentences(REFERRAL_LINE);
    if (body.startsWith(REFERRAL_LINE)) parts = parts.slice(referral.length);
    parts = [...referral, ...parts];
  }
  const out: Sanitized = { text: parts.slice(0, MAX_SENTENCES).join(' '), replaced, hits };
  const say = capSay(opts.say, opts.phase);
  if (say !== undefined) out.say = say;
  return out;
}
