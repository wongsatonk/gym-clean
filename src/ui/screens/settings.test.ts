import { describe, expect, it } from 'vitest';
import type { Accent } from '../../core/types';
import type { Unit } from '../../core/units';
import { ACCENT_OPTIONS, accentPicker } from '../accentPicker';
import { ACCENTS } from '../tokens';
import type { TabId } from '../tabBar';
import { settingsScreen, unitNote, type SettingsProps } from './settings';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

const slot = (attr: string) => {
  const el = new FakeEl('div');
  el.setAttribute(attr, '');
  return el as unknown as HTMLElement;
};

function props(over: Partial<SettingsProps> = {}): SettingsProps {
  return {
    accent: 'orange',
    spokenCount: true,
    coachTips: true,
    handsFree: false,
    unit: 'kg',
    coachVoice: slot('data-coach-voice'),
    speakerCheck: slot('data-voice-test'),
    audioTest: slot('data-audio-test'),
    devLog: slot('data-devlog'),
    ...over,
  };
}

function render(over: Partial<SettingsProps> = {}) {
  const calls = {
    accent: [] as Accent[],
    spoken: [] as boolean[],
    tips: [] as boolean[],
    handsFree: [] as boolean[],
    unit: [] as Unit[],
    camera: 0,
    tab: [] as TabId[],
  };
  const el = asFake(
    settingsScreen(props(over), {
      onAccent: (a) => calls.accent.push(a),
      onSpokenCount: (on) => calls.spoken.push(on),
      onCoachTips: (on) => calls.tips.push(on),
      onHandsFree: (on) => calls.handsFree.push(on),
      onUnit: (u) => calls.unit.push(u),
      onCameraTest: () => calls.camera++,
      onTab: (t) => calls.tab.push(t),
    }),
  );
  return { el, calls };
}

const one = (el: FakeEl, pred: (e: FakeEl) => boolean, what: string) => {
  const hit = el.find(pred)[0];
  if (!hit) throw new Error(`no ${what}`);
  return hit;
};
const bySetting = (el: FakeEl, key: string) =>
  one(el, (e) => e.getAttribute('data-setting') === key, `[data-setting=${key}]`);
const byAttr = (el: FakeEl, name: string, value: string) =>
  one(el, (e) => e.getAttribute(name) === value, `[${name}=${value}]`);

describe('accent picker', () => {
  it('offers Orange, Volt and Yellow in the tokens order, each a swatch and its name', () => {
    expect(ACCENT_OPTIONS.map((o) => o.accent)).toEqual([...ACCENTS]);
    const el = asFake(accentPicker('volt', () => undefined));
    expect(el.getAttribute('role')).toBe('group');
    expect(el.getAttribute('aria-label')).toBe('Accent colour');
    const btns = el.byTag('button');
    expect(btns.map((b) => b.textContent)).toEqual(['Orange', 'Volt', 'Yellow']);
    for (const b of btns) {
      const accent = b.getAttribute('data-accent-option') ?? '';
      expect(b.byClass(`accent-swatch-${accent}`)).toHaveLength(1);
      // Never the token selector itself: that would repaint the button's --cta.
      expect(b.hasAttribute('data-accent')).toBe(false);
    }
  });

  it('marks only the chosen accent: white-fill class, aria-pressed and a check (not colour alone)', () => {
    const el = asFake(accentPicker('yellow', () => undefined));
    const state = el
      .byTag('button')
      .map((b) => [
        b.getAttribute('data-accent-option'),
        b.getAttribute('aria-pressed'),
        b.classes.includes('on'),
        b.find((e) => e.getAttribute('data-icon') === 'check').length,
      ]);
    expect(state).toEqual([
      ['orange', 'false', false, 0],
      ['volt', 'false', false, 0],
      ['yellow', 'true', true, 1],
    ]);
  });

  it('calls onChange for another accent, nothing for the chosen one', () => {
    const got: Accent[] = [];
    const el = asFake(accentPicker('orange', (a) => got.push(a)));
    byAttr(el, 'data-accent-option', 'orange').click();
    byAttr(el, 'data-accent-option', 'volt').click();
    byAttr(el, 'data-accent-option', 'yellow').click();
    expect(got).toEqual(['volt', 'yellow']);
  });
});

describe('settings screen', () => {
  it('is a Pro screen with the title, the sections in the mock order and the tab bar last', () => {
    const { el } = render();
    expect(el.tag).toBe('main');
    expect(el.classes).toEqual(
      expect.arrayContaining(['screen', 'settings', 'has-tabbar', 'mood-pro']),
    );
    expect(el.getAttribute('data-screen')).toBe('settings');
    expect(el.byTag('h1')[0]?.textContent).toBe('Settings');
    expect(el.byClass('set-section').map((s) => s.getAttribute('data-section'))).toEqual([
      'accent',
      'voice',
      'camera',
      'unit',
      'devlog',
    ]);
    // Every section is named by its heading (icon + words).
    for (const s of el.byClass('set-section')) {
      const head = one(s, (e) => e.tag === 'h2', 'h2');
      expect(s.getAttribute('aria-labelledby')).toBe(head.getAttribute('id'));
      expect(head.byClass('ic')).toHaveLength(1);
    }
    const last = el.children.at(-1);
    expect(last?.getAttribute('data-tabbar')).toBe('');
    const settingsTab = byAttr(el, 'data-tab', 'settings');
    expect(settingsTab.getAttribute('aria-current')).toBe('page');
    expect(el.find((e) => e.textContent === '‹ Back')).toHaveLength(0);
  });

  it('keeps the slots in place: coach voice, speaker check right before audio test, dev log', () => {
    const { el } = render();
    const voice = byAttr(el, 'data-section', 'voice');
    const kids = voice.children.map(
      (c) =>
        ['data-coach-voice', 'data-voice-test', 'data-audio-test'].find((a) => c.hasAttribute(a)) ??
        c.getAttribute('data-setting') ??
        c.tag,
    );
    expect(kids).toEqual([
      'h2',
      'spoken-count',
      'coach-tips',
      'data-coach-voice',
      'data-voice-test',
      'data-audio-test',
    ]);
    expect(byAttr(el, 'data-section', 'devlog').children[1]?.hasAttribute('data-devlog')).toBe(
      true,
    );
  });

  it.each([
    ['spoken-count', 'Count reps out loud', 'spokenCount'],
    ['coach-tips', 'Coach tips after a set', 'coachTips'],
    ['hands-free', 'Hands-free sets', 'handsFree'],
  ] as const)('%s: a switch with its label and the state as a word', (key, label, prop) => {
    for (const on of [true, false]) {
      const { el } = render({ [prop]: on });
      const sw = bySetting(el, key);
      expect(sw.tag).toBe('button');
      expect(sw.getAttribute('role')).toBe('switch');
      expect(sw.getAttribute('aria-checked')).toBe(String(on));
      expect(sw.classes.includes('on')).toBe(on);
      expect(sw.oneByClass('switch-label').textContent).toBe(label);
      const word = sw.oneByClass('switch-state');
      expect(word.textContent).toBe(on ? 'On' : 'Off');
      expect(word.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('switches report the flipped value', () => {
    const { el, calls } = render({ spokenCount: true, coachTips: false, handsFree: false });
    bySetting(el, 'spoken-count').click();
    bySetting(el, 'coach-tips').click();
    bySetting(el, 'hands-free').click();
    expect(calls.spoken).toEqual([false]);
    expect(calls.tips).toEqual([true]);
    expect(calls.handsFree).toEqual([true]);
  });

  it('unit: kg / lb named exactly, chosen one pressed with a check, a tap on the other reports it', () => {
    const { el, calls } = render({ unit: 'lb' });
    const kg = byAttr(el, 'data-unit', 'kg');
    const lb = byAttr(el, 'data-unit', 'lb');
    expect([kg.textContent, lb.textContent]).toEqual(['kg', 'lb']);
    expect([kg.getAttribute('aria-pressed'), lb.getAttribute('aria-pressed')]).toEqual([
      'false',
      'true',
    ]);
    expect(lb.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(1);
    expect(kg.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(0);
    lb.click();
    kg.click();
    expect(calls.unit).toEqual(['kg']);
    expect(el.textContent).toContain(unitNote('lb'));
  });

  it('accent, Camera test and the Today tab call back', () => {
    const { el, calls } = render({ accent: 'orange' });
    byAttr(el, 'data-accent-option', 'volt').click();
    one(el, (e) => e.tag === 'button' && e.textContent === 'Camera test', 'Camera test').click();
    byAttr(el, 'data-tab', 'today').click();
    byAttr(el, 'data-tab', 'settings').click();
    expect(calls.accent).toEqual(['volt']);
    expect(calls.camera).toBe(1);
    expect(calls.tab).toEqual(['today']);
  });

  it('unitNote', () => {
    expect(unitNote('kg')).toBe('Weights step by 2.5 kg.');
    expect(unitNote('lb')).toMatch(/^Weights step by 5 lb\./);
  });
});
