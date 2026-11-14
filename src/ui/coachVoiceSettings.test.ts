import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NO_MALE_VOICE_HINT,
  RUDENESS_LEVELS,
  STRONG_LANGUAGE_NOTE,
  automaticLabel,
  createCoachVoiceSettings,
} from './coachVoiceSettings';
import type { MaleVoice, VoiceConfig } from './voiceNames';

// ---------- tiny DOM stub (vitest runs in node) ----------

class FakeEl {
  children: FakeEl[] = [];
  attrs = new Map<string, string>();
  text = '';
  listeners = new Map<string, (() => void)[]>();
  constructor(public tag: string) {}
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  addEventListener(type: string, cb: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), cb]);
  }
  click() {
    for (const cb of this.listeners.get('click') ?? []) cb();
  }
  append(...nodes: (FakeEl | string)[]) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const t = new FakeEl('#text');
        t.text = n;
        this.children.push(t);
      } else this.children.push(n);
    }
  }
  replaceChildren(...nodes: (FakeEl | string)[]) {
    this.children = [];
    this.append(...nodes);
  }
  get textContent(): string {
    return this.tag === '#text' ? this.text : this.children.map((c) => c.textContent).join('');
  }
  all(attr: string): FakeEl[] {
    const out: FakeEl[] = [];
    for (const c of this.children) {
      if (c.attrs.has(attr)) out.push(c);
      out.push(...c.all(attr));
    }
    return out;
  }
  one(attr: string, value?: string): FakeEl {
    const hit = this.all(attr).find((e) => value === undefined || e.getAttribute(attr) === value);
    if (!hit) throw new Error(`no [${attr}${value === undefined ? '' : `=${value}`}]`);
    return hit;
  }
}

const g = globalThis as { document?: unknown };
let saved: unknown;
beforeEach(() => {
  saved = g.document;
  g.document = { createElement: (tag: string) => new FakeEl(tag) };
});
afterEach(() => {
  g.document = saved;
});

const VOICES: MaleVoice[] = [
  { name: 'Daniel', base: 'Daniel', accent: 'UK', label: 'Daniel (UK)' },
  { name: 'Fred', base: 'Fred', accent: 'US', label: 'Fred (US)' },
];
const CALM: VoiceConfig = { persona: 'calm', rudeness: 2, voiceName: null };
const DRILL: VoiceConfig = { persona: 'drill', rudeness: 2, voiceName: null };

function mount(value: VoiceConfig, voices: MaleVoice[] = VOICES) {
  const onChange = vi.fn<(v: VoiceConfig) => void>();
  const onTest = vi.fn<(v: VoiceConfig) => void>();
  const handle = createCoachVoiceSettings({ value, voices, onChange, onTest });
  return { handle, el: handle.el as unknown as FakeEl, onChange, onTest };
}

const pressed = (e: FakeEl) => e.getAttribute('aria-pressed') === 'true';

describe('coach voice settings', () => {
  it('has a Coach voice heading and the Calm / Drill sergeant choice', () => {
    const { el } = mount(CALM);
    expect(el.textContent).toContain('Coach voice');
    expect(pressed(el.one('data-coach-persona', 'calm'))).toBe(true);
    expect(pressed(el.one('data-coach-persona', 'drill'))).toBe(false);
    expect(el.one('data-coach-persona', 'drill').textContent).toBe('Drill sergeant');
  });

  it('calm hides rudeness and the voice picker', () => {
    const { el } = mount(CALM);
    expect(el.all('data-rudeness')).toHaveLength(0);
    expect(el.all('data-voice-name')).toHaveLength(0);
    expect(el.all('data-coach-voice-test')).toHaveLength(1);
  });

  it('picking Drill sergeant reports the change and shows rudeness + voices', () => {
    const { el, onChange } = mount(CALM);
    el.one('data-coach-persona', 'drill').click();
    expect(onChange).toHaveBeenLastCalledWith(DRILL);
    expect(el.all('data-rudeness').map((b) => b.textContent)).toEqual(['Tough', 'Rude', 'Savage']);
    expect(pressed(el.one('data-rudeness', '2'))).toBe(true);
    expect(el.textContent).toContain(STRONG_LANGUAGE_NOTE);
  });

  it('rudeness steps report the level; Savage lights the strong-language note', () => {
    const { el, onChange } = mount(DRILL);
    expect(el.one('data-strong-language').getAttribute('class')).not.toContain('cv-note-on');
    el.one('data-rudeness', '3').click();
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILL, rudeness: 3 });
    expect(pressed(el.one('data-rudeness', '3'))).toBe(true);
    expect(el.one('data-strong-language').getAttribute('class')).toContain('cv-note-on');
    el.one('data-rudeness', '1').click();
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILL, rudeness: 1 });
    expect(RUDENESS_LEVELS.map((r) => r.level)).toEqual([1, 2, 3]);
  });

  it('voice rows: Automatic first, then each voice with its accent label', () => {
    const { el, onChange } = mount(DRILL);
    const rows = el.all('data-voice-name');
    expect(rows.map((r) => r.textContent)).toEqual([
      'Automatic: Daniel',
      'Daniel (UK)',
      'Fred (US)',
    ]);
    expect(pressed(rows[0] as FakeEl)).toBe(true);
    el.one('data-voice-name', 'Fred').click();
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILL, voiceName: 'Fred' });
    expect(pressed(el.one('data-voice-name', 'Fred'))).toBe(true);
    el.one('data-voice-name', '').click();
    expect(onChange).toHaveBeenLastCalledWith(DRILL);
  });

  it('with no male voice installed, shows the iOS hint instead of rows', () => {
    const { el } = mount(DRILL, []);
    expect(el.all('data-voice-name')).toHaveLength(0);
    expect(el.one('data-no-male-voice').textContent).toBe(NO_MALE_VOICE_HINT);
    expect(NO_MALE_VOICE_HINT).toContain('Accessibility → Spoken Content → Voices → English');
  });

  it('Test voice hands over the current value', () => {
    const { el, onTest } = mount(DRILL);
    el.one('data-rudeness', '3').click();
    el.one('data-coach-voice-test').click();
    expect(onTest).toHaveBeenCalledWith({ ...DRILL, rudeness: 3 });
  });

  it('update() re-renders with new value and voices (late iOS voices)', () => {
    const { el, handle } = mount(DRILL, []);
    expect(el.all('data-no-male-voice')).toHaveLength(1);
    handle.update({ ...DRILL, voiceName: 'Daniel' }, VOICES);
    expect(el.all('data-no-male-voice')).toHaveLength(0);
    expect(pressed(el.one('data-voice-name', 'Daniel'))).toBe(true);
    handle.update(CALM, VOICES);
    expect(el.all('data-voice-name')).toHaveLength(0);
  });

  it('automatic label names the default-order voice, if any', () => {
    expect(automaticLabel(VOICES)).toBe('Automatic: Daniel');
    expect(
      automaticLabel([{ name: 'Gordon', base: 'Gordon', accent: 'Australia', label: 'Gordon' }]),
    ).toBe('Automatic');
  });
});
