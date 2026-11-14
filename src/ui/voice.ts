// Spoken prompts via the Web Speech API. Silently does nothing where unsupported.

import { createDrillSergeant } from '../core/personas';
import {
  DRILL_PITCH,
  DRILL_RATE,
  listMaleVoices,
  pickDrillVoice,
  type MaleVoice,
  type VoiceConfig,
} from './voiceNames';

export * from './voiceNames';

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

/** count = rep number word, hint = mid-set coaching hint, cue = anything else (rest, set-up). */
export type SpeechKind = 'count' | 'hint' | 'cue';

export type SpeakOptions = { kind?: SpeechKind; cancel?: boolean };

/** Variant picker for the persona: a random index in [0, n). */
const randomPick = (n: number): number => Math.floor(Math.random() * n);

let config: VoiceConfig = { persona: 'calm', rudeness: 2, voiceName: null };
let persona: ReturnType<typeof createDrillSergeant> | null = null;
/** undefined = not resolved yet (or invalidated by voiceschanged / configure). */
let drillVoice: SpeechSynthesisVoice | null | undefined;
let watchedSynth: SpeechSynthesis | null = null;
const voicesListeners = new Set<() => void>();

function getVoices(s: SpeechSynthesis): SpeechSynthesisVoice[] {
  return typeof s.getVoices === 'function' ? s.getVoices() : [];
}

/** iOS fills getVoices() late: re-resolve the drill voice whenever the list changes. */
function watchVoices(s: SpeechSynthesis): void {
  if (watchedSynth === s || typeof s.addEventListener !== 'function') return;
  watchedSynth = s;
  s.addEventListener('voiceschanged', () => {
    drillVoice = undefined;
    for (const cb of voicesListeners) cb();
  });
}

function resolveDrillVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (drillVoice === undefined) {
    const v = pickDrillVoice(getVoices(s), config.voiceName);
    // Voices not loaded yet: don't cache the miss, try again next time.
    if (!v) return null;
    drillVoice = v;
  }
  return drillVoice;
}

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
   * Queues `text` after anything already speaking. Returns the utterance (null if unsupported);
   * its `text` is the line actually spoken (the drill persona's rewrite), for the dev log.
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
    const drill = config.persona === 'drill';
    const kind = opts.kind ?? 'cue';
    let line = text;
    if (drill && kind !== 'count') {
      persona ??= createDrillSergeant();
      line = persona.line(text, kind, config.rudeness, randomPick);
    }
    const u = new SpeechSynthesisUtterance(line);
    u.lang = 'en-US';
    u.rate = 1;
    if (drill) {
      watchVoices(s);
      const v = resolveDrillVoice(s);
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.rate = DRILL_RATE;
      u.pitch = DRILL_PITCH;
    }
    hold(u);
    resume(s); // iOS/Chrome can leave the synth paused; harmless otherwise
    s.speak(u);
    return u;
  },

  /**
   * Coach persona and voice. 'calm' is the original voice (en-US, rate 1, browser default
   * voice). 'drill' rewrites every non-count line through the drill-sergeant script at
   * `rudeness`, and speaks in `voiceName` (or the default male voice) faster and lower.
   */
  configure(next: VoiceConfig): void {
    if (next.voiceName !== config.voiceName) drillVoice = undefined;
    config = { ...next };
    const s = synth();
    if (s && config.persona === 'drill') watchVoices(s);
  },

  /** The current coach persona settings (a copy). */
  get config(): VoiceConfig {
    return { ...config };
  },

  /** Installed male English voices from the known list, with an accent label, for the picker. */
  maleVoices(): MaleVoice[] {
    const s = synth();
    if (!s) return [];
    watchVoices(s);
    return listMaleVoices(getVoices(s));
  },

  /** Calls `cb` when the browser's voice list changes (iOS loads it late). Returns unsubscribe. */
  onVoicesChanged(cb: () => void): () => void {
    const s = synth();
    if (s) watchVoices(s);
    voicesListeners.add(cb);
    return () => voicesListeners.delete(cb);
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
