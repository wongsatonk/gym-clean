import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The persona script is core-engineer's; here only the wiring is tested.
const line = vi.fn(
  (text: string, kind: string, level: number, pick: (n: number) => number) =>
    `DRILL[${level}/${kind}${pick(1) === 0 ? '' : '?'}] ${text}`,
);
vi.mock('../core/personas', () => ({ createDrillSergeant: () => ({ line }) }));

import {
  DRILL_PITCH,
  DRILL_RATE,
  baseVoiceName,
  listMaleVoices,
  pickDrillVoice,
  voice,
} from './voice';

type V = { name: string; lang: string };
const v = (name: string, lang = 'en-US'): V => ({ name, lang });

class FakeUtterance {
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: V | null = null;
  constructor(public text: string) {}
  addEventListener() {}
}

class FakeSynth {
  voices: V[] = [];
  spoken: FakeUtterance[] = [];
  cancelled = 0;
  speaking = false;
  paused = false;
  private listeners: (() => void)[] = [];
  getVoices = () => this.voices;
  speak = (u: FakeUtterance) => this.spoken.push(u);
  cancel = () => {
    this.cancelled++;
  };
  resume = () => undefined;
  addEventListener = (type: string, cb: () => void) => {
    if (type === 'voiceschanged') this.listeners.push(cb);
  };
  loadVoices(list: V[]) {
    this.voices = list;
    for (const cb of this.listeners) cb();
  }
  get last(): FakeUtterance {
    const u = this.spoken.at(-1);
    if (!u) throw new Error('nothing spoken');
    return u;
  }
}

const g = globalThis as Record<string, unknown>;
let synth: FakeSynth;
let saved: { window: unknown; utt: unknown };

beforeEach(() => {
  saved = { window: g.window, utt: g.SpeechSynthesisUtterance };
  synth = new FakeSynth();
  g.window = { speechSynthesis: synth };
  g.SpeechSynthesisUtterance = FakeUtterance;
  line.mockClear();
  voice.configure({ persona: 'calm', rudeness: 2, voiceName: null });
});

afterEach(() => {
  voice.configure({ persona: 'calm', rudeness: 2, voiceName: null });
  g.window = saved.window;
  g.SpeechSynthesisUtterance = saved.utt;
});

describe('voice names', () => {
  it('strips the iOS suffixes to the base name', () => {
    expect(baseVoiceName('Daniel')).toBe('Daniel');
    expect(baseVoiceName('Daniel (Enhanced)')).toBe('Daniel');
    expect(baseVoiceName('Rocko (English (UK))')).toBe('Rocko');
  });

  it('lists only known male English voices, default order first, with an accent label', () => {
    const list = listMaleVoices([
      v('Samantha'),
      v('Fred'),
      v('Gordon', 'en-AU'),
      v('Rocko (English (UK))', 'en-GB'),
      v('Daniel', 'en-GB'),
      v('Rishi', 'en-IN'),
      v('Thomas', 'fr-FR'),
      v('Aaron'),
      v('Aaron'),
      v('Eddy (German (Germany))', 'de-DE'),
    ]);
    expect(list.map((m) => m.name)).toEqual([
      'Daniel',
      'Rocko (English (UK))',
      'Aaron',
      'Fred',
      'Gordon',
      'Rishi',
    ]);
    expect(list.map((m) => m.label)).toEqual([
      'Daniel (UK)',
      'Rocko (character, UK)',
      'Aaron (US)',
      'Fred (US)',
      'Gordon (Australia)',
      'Rishi (India)',
    ]);
  });

  it('picks the saved voice, then the same base name, then the default order, then any English', () => {
    const all = [v('Samantha'), v('Fred'), v('Arthur', 'en-GB'), v('Daniel (Enhanced)', 'en-GB')];
    expect(pickDrillVoice(all, 'Fred')?.name).toBe('Fred');
    expect(listMaleVoices(all).map((m) => m.label)).toEqual([
      'Daniel (UK, Enhanced)',
      'Arthur (UK)',
      'Fred (US)',
    ]);
    expect(pickDrillVoice(all, 'Daniel')?.name).toBe('Daniel (Enhanced)');
    expect(pickDrillVoice(all, 'Gone')?.name).toBe('Daniel (Enhanced)');
    expect(pickDrillVoice(all, null)?.name).toBe('Daniel (Enhanced)');
    expect(pickDrillVoice([v('Samantha'), v('Fred'), v('Arthur', 'en-GB')], null)?.name).toBe(
      'Arthur',
    );
    expect(pickDrillVoice([v('Amélie', 'fr-CA'), v('Samantha')], null)?.name).toBe('Samantha');
    expect(pickDrillVoice([v('Amélie', 'fr-CA')], null)).toBeNull();
    expect(pickDrillVoice([], 'Daniel')).toBeNull();
  });
});

describe('voice.speak with a persona', () => {
  it('calm speaks the text unchanged in en-US at rate 1 with the default voice', () => {
    synth.voices = [v('Daniel', 'en-GB')];
    voice.speak('Ten seconds.', { kind: 'cue' });
    const u = synth.last;
    expect(u.text).toBe('Ten seconds.');
    expect(u.lang).toBe('en-US');
    expect(u.rate).toBe(1);
    expect(u.pitch).toBe(1);
    expect(u.voice).toBeNull();
    expect(line).not.toHaveBeenCalled();
  });

  it('drill rewrites hints and cues at the chosen level, faster and lower, in the male voice', () => {
    synth.voices = [v('Samantha'), v('Daniel', 'en-GB')];
    voice.configure({ persona: 'drill', rudeness: 3, voiceName: null });
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.text).toBe('DRILL[3/cue] Go');
    expect(synth.last.voice?.name).toBe('Daniel');
    expect(synth.last.lang).toBe('en-GB');
    expect(synth.last.rate).toBe(DRILL_RATE);
    expect(synth.last.pitch).toBe(DRILL_PITCH);
    const u = voice.speak('Full range', { kind: 'hint' });
    expect(synth.last.text).toBe('DRILL[3/hint] Full range');
    // The returned utterance carries the line actually spoken (the dev log reads it).
    expect(u?.text).toBe('DRILL[3/hint] Full range');
    expect(typeof line.mock.calls[0]?.[3]).toBe('function');
    voice.speak('Ten seconds.'); // no kind = cue
    expect(synth.last.text).toBe('DRILL[3/cue] Ten seconds.');
  });

  it('drill never rewrites a count, and a count still cancels', () => {
    synth.voices = [v('Daniel', 'en-GB')];
    voice.configure({ persona: 'drill', rudeness: 2, voiceName: null });
    voice.speak('Seven', { kind: 'count', cancel: true });
    expect(synth.last.text).toBe('Seven');
    expect(synth.cancelled).toBe(1);
    expect(synth.last.voice?.name).toBe('Daniel');
    expect(line).not.toHaveBeenCalled();
  });

  it('uses the saved voice name', () => {
    synth.voices = [v('Daniel', 'en-GB'), v('Fred')];
    voice.configure({ persona: 'drill', rudeness: 1, voiceName: 'Fred' });
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.voice?.name).toBe('Fred');
    voice.configure({ persona: 'drill', rudeness: 1, voiceName: 'Daniel' });
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.voice?.name).toBe('Daniel');
  });

  it('re-resolves the voice when iOS loads voices late (voiceschanged)', () => {
    voice.configure({ persona: 'drill', rudeness: 2, voiceName: 'Arthur' });
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.voice).toBeNull();
    expect(synth.last.lang).toBe('en-US');
    expect(synth.last.rate).toBe(DRILL_RATE);

    synth.loadVoices([v('Samantha')]);
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.voice?.name).toBe('Samantha'); // any English while Arthur is missing

    synth.loadVoices([v('Samantha'), v('Arthur', 'en-GB')]);
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.voice?.name).toBe('Arthur');
  });

  it('switching back to calm restores the calm delivery', () => {
    synth.voices = [v('Daniel', 'en-GB')];
    voice.configure({ persona: 'drill', rudeness: 2, voiceName: null });
    voice.speak('Go', { kind: 'cue' });
    voice.configure({ persona: 'calm', rudeness: 2, voiceName: null });
    voice.speak('Go', { kind: 'cue' });
    expect(synth.last.text).toBe('Go');
    expect(synth.last.voice).toBeNull();
    expect(synth.last.rate).toBe(1);
    expect(synth.last.pitch).toBe(1);
  });
});

describe('voice.maleVoices and onVoicesChanged', () => {
  it('lists installed male voices and tells listeners when the list changes', () => {
    expect(voice.maleVoices()).toEqual([]);
    const cb = vi.fn();
    const off = voice.onVoicesChanged(cb);
    synth.loadVoices([v('Fred'), v('Samantha')]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(voice.maleVoices().map((m) => m.label)).toEqual(['Fred (US)']);
    off();
    synth.loadVoices([]);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('is empty where speech is unsupported', () => {
    g.window = {};
    expect(voice.maleVoices()).toEqual([]);
    expect(voice.speak('Go')).toBeNull();
  });
});
