// Spoken prompts via the Web Speech API. Silently does nothing where unsupported.

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/** count = rep number word, hint = mid-set coaching hint, cue = anything else (rest, set-up). */
export type SpeechKind = 'count' | 'hint' | 'cue';

export type SpeakOptions = { kind?: SpeechKind; cancel?: boolean };

/**
 * Utterances queued or speaking. Holding a strong reference matters on iOS/WebKit (and Chrome):
 * an utterance referenced only by its own listeners can be garbage-collected mid-speech and then
 * never fires `end`, which would stall the coach speech policy. Dropped on end/error and on cancel.
 */
const inFlight = new Set<SpeechSynthesisUtterance>();
/** Safety cap in case a browser never reports end/error for some utterances. */
const MAX_IN_FLIGHT = 16;

function hold(u: SpeechSynthesisUtterance): void {
  if (inFlight.size >= MAX_IN_FLIGHT) {
    const oldest = inFlight.values().next().value;
    if (oldest) inFlight.delete(oldest);
  }
  inFlight.add(u);
  const release = () => inFlight.delete(u);
  u.addEventListener('end', release);
  u.addEventListener('error', release);
}

/** Clears a stuck paused state. Guarded: test doubles may not implement it. */
function resume(s: SpeechSynthesis): void {
  if (typeof s.resume === 'function') s.resume();
}

export const voice = {
  /**
   * iOS only allows speech after a user gesture: call from a tap handler. WebKit can ignore an
   * empty utterance, so speak a real (silent) one; resume() clears a stuck paused state.
   */
  unlock(): void {
    const s = synth();
    if (!s) return;
    resume(s);
    const u = new SpeechSynthesisUtterance('.');
    u.volume = 0;
    hold(u);
    s.speak(u);
  },

  /**
   * Queues `text` after anything already speaking. Returns the utterance (null if unsupported).
   * `kind: 'count'` with `cancel: true` first drops whatever is speaking or queued (a count must
   * never lag behind). Only a count may cancel: hints and cues always queue.
   */
  speak(text: string, opts: SpeakOptions = {}): SpeechSynthesisUtterance | null {
    const s = synth();
    if (!s) return null;
    if (opts.kind === 'count' && opts.cancel) {
      s.cancel();
      inFlight.clear();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    hold(u);
    resume(s); // iOS/Chrome can leave the synth paused; harmless otherwise
    s.speak(u);
    return u;
  },

  /** Drops whatever is speaking or queued. */
  cancel(): void {
    synth()?.cancel();
    inFlight.clear();
  },

  /** For the Settings voice test: what this browser reports about speech. */
  status(): {
    supported: boolean;
    voices: number;
    english: number;
    speaking: boolean;
    paused: boolean;
  } {
    const s = synth();
    if (!s) return { supported: false, voices: 0, english: 0, speaking: false, paused: false };
    const voices = typeof s.getVoices === 'function' ? s.getVoices() : [];
    return {
      supported: true,
      voices: voices.length,
      english: voices.filter((v) => v.lang.toLowerCase().startsWith('en')).length,
      speaking: s.speaking,
      paused: s.paused,
    };
  },

  /** Utterances currently held (queued or speaking); for tests. */
  get inFlight(): number {
    return inFlight.size;
  },
};
