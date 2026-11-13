// Speech policy for mid-set coaching (SPEC M4c, Decisions 2026-11-13). Pure: the caller passes
// the time and reports when an utterance ends; this decides what to speak, cancel or drop.
//  - A count word always speaks at once. It cancels whatever is speaking (an older count, or a
//    hint, which is then reported as interrupted).
//  - At most one hint every `hintGapMs` (6 s), measured from when the last hint started.
//  - A hint never starts over a count: it waits for the current utterance to end, and is dropped
//    as stale if it would start more than `maxHintDelayMs` (1.5 s) after it was requested.
//  - Only one hint waits at a time; a newer one supersedes it.
// Every drop is returned as a decision so the developer log can record it.
import type { ExerciseRule } from './exercises';
import type { RepEvent } from './types';

export type SpeechKind = 'count' | 'hint';

export type DropReason = 'rate' | 'stale' | 'superseded' | 'interrupted';

export type SpeechDecision =
  /** Speak `text` now. `cancel`: stop the current utterance first. Report its end with `id`. */
  | { action: 'speak'; id: number; text: string; kind: SpeechKind; cancel: boolean }
  /** This hint is not (or no longer) spoken. */
  | { action: 'drop'; text: string; kind: 'hint'; reason: DropReason };

export type CoachSpeechOptions = {
  /** Minimum time between hint starts (ms). Default 6000. */
  hintGapMs?: number;
  /** A waiting hint is dropped if it would start later than this after its request (ms). Default 1500. */
  maxHintDelayMs?: number;
  /** An utterance with no end report for this long is treated as ended (ms). Default 5000. */
  stuckMs?: number;
};

export type CoachSpeech = {
  /** A count word ("Three"). Always spoken. */
  count(text: string, now: number): SpeechDecision[];
  /** A coaching hint requested at `now` (the time of the event). */
  hint(text: string, now: number): SpeechDecision[];
  /** The utterance `id` ended or errored. Older (cancelled) ids are ignored. */
  ended(id: number, now: number): SpeechDecision[];
  /** Call periodically (e.g. per frame): drops a stale waiting hint, releases a stuck utterance. */
  tick(now: number): SpeechDecision[];
  /** What is speaking now, per this policy. */
  readonly speaking: SpeechKind | null;
  /** Text of the hint waiting for the current count to end, if any. */
  readonly pending: string | null;
  /** Forget everything (new set). */
  reset(): void;
};

/** The rule's coaching hint for a partial with a reason; null for reps and reason-less events. */
export function hintFor(rule: ExerciseRule, ev: RepEvent): string | null {
  if (ev.type !== 'partial' || ev.reason === undefined) return null;
  return rule.hints[ev.reason];
}

export function createCoachSpeech(opts: CoachSpeechOptions = {}): CoachSpeech {
  const hintGapMs = opts.hintGapMs ?? 6000;
  const maxHintDelayMs = opts.maxHintDelayMs ?? 1500;
  const stuckMs = opts.stuckMs ?? 5000;

  let nextId = 1;
  let current: { id: number; kind: SpeechKind; text: string; since: number } | null = null;
  let waiting: { text: string; at: number } | null = null;
  let lastHintStart = -Infinity;

  function start(text: string, kind: SpeechKind, now: number): SpeechDecision {
    const cancel = current !== null;
    const id = nextId++;
    current = { id, kind, text, since: now };
    if (kind === 'hint') lastHintStart = now;
    return { action: 'speak', id, text, kind, cancel };
  }

  const drop = (text: string, reason: DropReason): SpeechDecision => ({
    action: 'drop',
    text,
    kind: 'hint',
    reason,
  });

  /** Nothing is speaking: start the waiting hint if it's still fresh. */
  function release(now: number): SpeechDecision[] {
    if (waiting === null) return [];
    const w = waiting;
    waiting = null;
    if (now - w.at > maxHintDelayMs) return [drop(w.text, 'stale')];
    if (now - lastHintStart < hintGapMs) return [drop(w.text, 'rate')];
    return [start(w.text, 'hint', now)];
  }

  function count(text: string, now: number): SpeechDecision[] {
    const out: SpeechDecision[] = [];
    if (current?.kind === 'hint') out.push(drop(current.text, 'interrupted'));
    out.push(start(text, 'count', now));
    return out;
  }

  function hint(text: string, now: number): SpeechDecision[] {
    if (now - lastHintStart < hintGapMs) return [drop(text, 'rate')];
    if (current === null) return [start(text, 'hint', now)];
    const out: SpeechDecision[] = [];
    if (waiting !== null) out.push(drop(waiting.text, 'superseded'));
    waiting = { text, at: now };
    return out;
  }

  function ended(id: number, now: number): SpeechDecision[] {
    if (current?.id !== id) return [];
    current = null;
    return release(now);
  }

  function tick(now: number): SpeechDecision[] {
    if (current !== null && now - current.since >= stuckMs) {
      current = null;
      return release(now);
    }
    if (waiting !== null && now - waiting.at > maxHintDelayMs) {
      const w = waiting;
      waiting = null;
      return [drop(w.text, 'stale')];
    }
    return [];
  }

  return {
    count,
    hint,
    ended,
    tick,
    get speaking() {
      return current?.kind ?? null;
    },
    get pending() {
      return waiting?.text ?? null;
    },
    reset() {
      current = null;
      waiting = null;
      lastHintStart = -Infinity;
    },
  };
}
