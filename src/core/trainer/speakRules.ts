/**
 * M12 slice 2: when the coach speaks a chat reply and where the hold-to-talk mic may show.
 * Pure (SPEC M12 "Mic", Decision "M12 slices 1b + 2").
 *
 * - Speak replies: 'mic' (default; also any unknown stored value) speaks only replies to messages
 *   sent with the mic, 'always' speaks every reply, 'off' none. Never during a set.
 * - Mic: the iPhone app only, on the Coach tab or the Pause sheet; never during a set and never
 *   on the camera screen (the mic is chat-only; effort stays a tap).
 * - The spoken line: the reply's own `say` when it passes `checkCopy`, else the reply's first
 *   sentence; capped at 12 words (8 in a workout), cut cleanly (no trailing comma, dash or
 *   joining word) and ending with a full stop. Nothing to say → undefined.
 */
import { wordCount } from '../advice';
import { SAY_MAX_WORDS, SPOKEN_MAX_WORDS, checkCopy } from './replies';
import type { ChatMessage, CoachSettings } from '../types';

type Phase = ChatMessage['phase'];

export type SpeakInput = {
  speakReplies?: CoachSettings['speakReplies'] | undefined;
  /** The message this reply answers was sent with the mic (`ChatMessage.viaMic`). */
  viaMic?: boolean | undefined;
  phase: Phase;
  /** A set is running (counting / camera). */
  inSet: boolean;
};

export function shouldSpeak({ speakReplies, viaMic, inSet }: SpeakInput): boolean {
  if (inSet) return false;
  if (speakReplies === 'off') return false;
  if (speakReplies === 'always') return true;
  return viaMic === true;
}

/** Where the app is when the mic would show. */
export type MicScreen = 'coach' | 'pause' | 'camera' | 'other';

export function micAllowed({
  native,
  inSet,
  screen,
}: {
  native: boolean;
  inSet: boolean;
  screen: MicScreen;
}): boolean {
  return native && !inSet && (screen === 'coach' || screen === 'pause');
}

/** Words a capped line may not end on. */
const DANGLING = new Set([
  'and',
  'or',
  'but',
  'then',
  'so',
  'the',
  'a',
  'an',
  'to',
  'of',
  'with',
  'for',
  'in',
  'on',
  'at',
  'your',
]);
const TRAILING = /[\s,;:\-–—]+$/;
const HAS_WORD = /[\p{L}\p{N}]/u;

function firstSentence(text: string): string {
  const m = /^(.*?[.!?])(?:\s|$)/s.exec(text.trim());
  return m?.[1] ?? text.trim();
}

function capWords(line: string, max: number): string {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) return line.trim();
  let cut = words.slice(0, max);
  for (;;) {
    cut = cut.filter((w) => HAS_WORD.test(w));
    const last = cut.at(-1);
    if (last === undefined || !DANGLING.has(last.toLowerCase().replace(TRAILING, ''))) break;
    cut = cut.slice(0, -1);
  }
  return cut.join(' ');
}

function finish(line: string, max: number): string | undefined {
  let out = capWords(line, max).replace(TRAILING, '');
  if (!HAS_WORD.test(out)) return undefined;
  if (!/[.!?]$/.test(out)) out = `${out.replace(/[.!?…]+$/, '')}.`;
  return wordCount(out) > 0 && checkCopy(out).ok ? out : undefined;
}

/** The line to speak for a coach reply, or undefined. */
export function sayFor(
  r: { reply: string; say?: string | undefined },
  phase: Phase,
): string | undefined {
  const max = phase === 'workout' ? SAY_MAX_WORDS : SPOKEN_MAX_WORDS;
  if (r.say !== undefined && checkCopy(r.say).ok) {
    const own = finish(r.say, max);
    if (own !== undefined) return own;
  }
  return finish(firstSentence(r.reply), max);
}
