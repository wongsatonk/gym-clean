import { describe, expect, it } from 'vitest';
import {
  AUDIO_SESSION_TYPES,
  BEEP_TONES,
  beepLength,
  isAudioSessionType,
  statusText,
  typeHint,
  type Tone,
} from './audioTest';

describe('audio test helpers', () => {
  it('knows the five WebKit audio session types, auto first', () => {
    expect(AUDIO_SESSION_TYPES).toEqual([
      'auto',
      'ambient',
      'transient',
      'transient-solo',
      'playback',
    ]);
    expect(isAudioSessionType('ambient')).toBe(true);
    expect(isAudioSessionType('play-and-record')).toBe(false);
    expect(isAudioSessionType(undefined)).toBe(false);
  });

  it('has a short hint per type that names it and flags Silent mode for the mixing ones', () => {
    for (const t of AUDIO_SESSION_TYPES) {
      const hint = typeHint(t);
      expect(hint.startsWith(`${t}:`)).toBe(true);
      expect(hint.length).toBeLessThanOrEqual(70);
    }
    expect(typeHint('ambient')).toMatch(/mix.*Silent mode/);
    expect(typeHint('transient')).toMatch(/Silent mode/);
  });

  it('beep is two short rising tones, under half a second, not overlapping', () => {
    expect(BEEP_TONES).toHaveLength(2);
    const [a, b] = BEEP_TONES as [Tone, Tone];
    expect(b.freq).toBeGreaterThan(a.freq);
    expect(b.at).toBeGreaterThanOrEqual(a.at + a.dur);
    expect(beepLength()).toBeCloseTo(0.3, 5);
    expect(beepLength([])).toBe(0);
  });

  it('status line names session type, what played and the camera', () => {
    expect(statusText({ type: 'auto', last: null, camera: 'off' })).toBe(
      'Session: auto. Played: nothing yet. Camera: off.',
    );
    expect(statusText({ type: null, last: 'beep', camera: 'on' })).toBe(
      'Session: not supported. Played: beep. Camera: on.',
    );
  });
});
