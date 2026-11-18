import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NO_VOICE_HINT,
  VOICE_LIST_ID,
  RUDENESS_LEVELS,
  STRONG_LANGUAGE_NOTE,
  automaticLabel,
  createCoachVoiceSettings,
} from './coachVoiceSettings';
import { listEnglishVoices, type EnglishVoice, type VoiceConfig } from './voiceNames';

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
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  /** icon() sets its path markup; the stub keeps no text from it. */
  set innerHTML(_v: string) {}
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
  g.document = {
    createElement: (tag: string) => new FakeEl(tag),
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
  };
});
afterEach(() => {
  g.document = saved;
});

const VOICES: EnglishVoice[] = [
  { name: 'Daniel', base: 'Daniel', accent: 'UK', label: 'Daniel (UK)' },
  { name: 'Fred', base: 'Fred', accent: 'US', label: 'Fred (US)' },
];
const CALM: VoiceConfig = { persona: 'calm', rudeness: 2, voiceName: null };
const DRILL: VoiceConfig = { persona: 'drill', rudeness: 2, voiceName: null };

function mount(value: VoiceConfig, voices: EnglishVoice[] = VOICES) {
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

  it('with no English voice installed, shows the iOS hint instead of rows', () => {
    const { el } = mount(DRILL, []);
    expect(el.all('data-voice-name')).toHaveLength(0);
    expect(el.one('data-no-voice').textContent).toBe(NO_VOICE_HINT);
    expect(NO_VOICE_HINT).toContain('Accessibility → Spoken Content → Voices → English');
    expect(NO_VOICE_HINT).not.toMatch(/\bmale\b/i);
  });

  it('offers female and male voices alike (M13: anyone)', () => {
    const voices = listEnglishVoices([
      { name: 'Samantha', lang: 'en-US' },
      { name: 'Karen', lang: 'en-AU' },
      { name: 'Daniel', lang: 'en-GB' },
      { name: 'Fred', lang: 'en-US' },
    ]);
    const { el, onChange } = mount(DRILL, voices);
    expect(el.all('data-voice-name').map((r) => r.textContent)).toEqual([
      'Automatic: Daniel',
      'Daniel (UK)',
      'Fred (US)',
      'Samantha (US)',
      'Karen (Australia)',
    ]);
    el.one('data-voice-name', 'Karen').click();
    expect(onChange).toHaveBeenLastCalledWith({ ...DRILL, voiceName: 'Karen' });
    expect(el.textContent).not.toMatch(/\bmale\b/i);
  });

  it('a saved voice shows as chosen, not Automatic', () => {
    const { el } = mount({ ...DRILL, voiceName: 'Fred' });
    expect(pressed(el.one('data-voice-name', 'Fred'))).toBe(true);
    expect(pressed(el.one('data-voice-name', ''))).toBe(false);
  });

  it('Test voice hands over the current value', () => {
    const { el, onTest } = mount(DRILL);
    el.one('data-rudeness', '3').click();
    el.one('data-coach-voice-test').click();
    expect(onTest).toHaveBeenCalledWith({ ...DRILL, rudeness: 3 });
  });

  it('update() re-renders with new value and voices (late iOS voices)', () => {
    const { el, handle } = mount(DRILL, []);
    expect(el.all('data-no-voice')).toHaveLength(1);
    handle.update({ ...DRILL, voiceName: 'Daniel' }, VOICES);
    expect(el.all('data-no-voice')).toHaveLength(0);
    expect(pressed(el.one('data-voice-name', 'Daniel'))).toBe(true);
    handle.update(CALM, VOICES);
    expect(el.all('data-voice-name')).toHaveLength(0);
  });

  it('marks only the chosen options with a check icon (not the fill alone)', () => {
    const { el } = mount(DRILL);
    const checked = el
      .all('aria-pressed')
      .filter((b) => b.all('data-icon').some((i) => i.getAttribute('data-icon') === 'check'))
      .map((b) => b.textContent);
    expect(checked).toEqual(['Drill sergeant', 'Rude', automaticLabel(VOICES)]);
    for (const b of el.all('aria-pressed'))
      expect(b.all('data-icon').length).toBe(pressed(b) ? 1 : 0);
  });

  describe('voice picker disclosure (M13c task 10)', () => {
    const toggle = (el: FakeEl) => el.one('data-voice-toggle');
    const list = (el: FakeEl) => el.one('id', VOICE_LIST_ID);
    const isOpen = (el: FakeEl) => {
      const t = toggle(el).getAttribute('aria-expanded');
      // The button state and the list's visibility always agree.
      expect(list(el).hasAttribute('hidden')).toBe(t !== 'true');
      return t === 'true';
    };
    const summary = (el: FakeEl) => el.one('data-voice-summary').textContent;

    it('starts collapsed: a button that controls the list, list hidden', () => {
      const { el } = mount(DRILL);
      const t = toggle(el);
      expect(t.tag).toBe('button');
      expect(t.getAttribute('type')).toBe('button');
      expect(t.getAttribute('aria-controls')).toBe(VOICE_LIST_ID);
      expect(isOpen(el)).toBe(false);
      // The rows exist (aria-controls points at a real element) but are hidden.
      expect(el.all('data-voice-name')).toHaveLength(3);
      // A chevron, decorative.
      expect(t.all('data-icon')).toHaveLength(1);
    });

    it('reads "Voice" plus the automatic voice when none is picked', () => {
      const { el } = mount(DRILL);
      expect(toggle(el).textContent).toBe('Voice Automatic: Daniel');
      expect(summary(el)).toBe('Automatic: Daniel');
    });

    it('reads the picked voice label when one is saved', () => {
      const { el } = mount({ ...DRILL, voiceName: 'Fred' });
      expect(summary(el)).toBe('Fred (US)');
    });

    it('a saved voice that is no longer installed reads as Automatic', () => {
      const { el } = mount({ ...DRILL, voiceName: 'Gone' });
      expect(summary(el)).toBe('Automatic: Daniel');
    });

    it('tapping toggles open and closed in place', () => {
      const { el, onChange } = mount(DRILL);
      const t = toggle(el);
      t.click();
      expect(isOpen(el)).toBe(true);
      // Same button (focus stays on it), nothing saved.
      expect(toggle(el)).toBe(t);
      t.click();
      expect(isOpen(el)).toBe(false);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('picking a voice updates the summary and keeps the list open', () => {
      const { el, onChange } = mount(DRILL);
      toggle(el).click();
      el.one('data-voice-name', 'Fred').click();
      expect(onChange).toHaveBeenLastCalledWith({ ...DRILL, voiceName: 'Fred' });
      expect(isOpen(el)).toBe(true);
      expect(summary(el)).toBe('Fred (US)');
      el.one('data-voice-name', '').click();
      expect(isOpen(el)).toBe(true);
      expect(summary(el)).toBe('Automatic: Daniel');
    });

    it('rudeness changes and update() keep the open state', () => {
      const { el, handle } = mount(DRILL);
      toggle(el).click();
      el.one('data-rudeness', '3').click();
      expect(isOpen(el)).toBe(true);
      handle.update({ ...DRILL, voiceName: 'Daniel' }, VOICES);
      expect(isOpen(el)).toBe(true);
      expect(summary(el)).toBe('Daniel (UK)');
      toggle(el).click();
      handle.update(DRILL, VOICES);
      expect(isOpen(el)).toBe(false);
    });

    it('a new picker (Settings opened again) starts collapsed', () => {
      const first = mount(DRILL);
      toggle(first.el).click();
      expect(isOpen(first.el)).toBe(true);
      const again = mount(DRILL);
      expect(isOpen(again.el)).toBe(false);
    });

    it('no voices: the hint shows directly, no toggle', () => {
      const { el } = mount(DRILL, []);
      expect(el.all('data-voice-toggle')).toHaveLength(0);
      expect(el.one('data-no-voice').textContent).toBe(NO_VOICE_HINT);
    });

    it('Calm: no toggle; Test voice and Rudeness stay outside the collapse', () => {
      expect(mount(CALM).el.all('data-voice-toggle')).toHaveLength(0);
      const { el } = mount(DRILL);
      const l = list(el);
      expect(l.all('data-coach-voice-test')).toHaveLength(0);
      expect(l.all('data-rudeness')).toHaveLength(0);
      expect(el.all('data-coach-voice-test')).toHaveLength(1);
      expect(el.all('data-rudeness')).toHaveLength(3);
    });
  });

  it('automatic label names the first listed voice (what Automatic picks), or none', () => {
    expect(automaticLabel(VOICES)).toBe('Automatic: Daniel');
    expect(
      automaticLabel([{ name: 'Gordon', base: 'Gordon', accent: 'Australia', label: 'Gordon' }]),
    ).toBe('Automatic: Gordon');
    expect(automaticLabel([])).toBe('Automatic');
  });
});
