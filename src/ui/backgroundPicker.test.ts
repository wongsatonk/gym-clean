// M13c task 9: Settings → Accent colour → "Background: Moving glow / Plain" and the
// html[data-background] switch the stylesheet reads (Plain = the flat look, nothing animates).
import { describe, expect, it } from 'vitest';
import type { Accent, BackgroundStyle } from '../core/types';
import { checkCopy } from '../core/trainer/replies';
import {
  BACKGROUND_NOTE,
  BACKGROUND_OPTIONS,
  applyBackground,
  backgroundPicker,
  backgroundStyle,
} from './backgroundPicker';
import { settingsScreen, type SettingsProps } from './screens/settings';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';

useFakeDom();

const byOption = (el: FakeEl, v: string) => {
  const hit = el.find((e) => e.getAttribute('data-background-option') === v)[0];
  if (!hit) throw new Error(`no option ${v}`);
  return hit;
};

describe('backgroundPicker', () => {
  it('offers Moving glow then Plain, a labelled group of toggle buttons', () => {
    expect(BACKGROUND_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ['glow', 'Moving glow'],
      ['plain', 'Plain'],
    ]);
    const el = asFake(backgroundPicker('glow', () => undefined));
    expect(el.hasAttribute('data-background-picker')).toBe(true);
    const group = el.find((e) => e.getAttribute('role') === 'group')[0];
    expect(group?.getAttribute('aria-labelledby')).toBe('set-background-label');
    const label = el.find((e) => e.getAttribute('id') === 'set-background-label')[0];
    expect(label?.textContent).toBe('Background');
    const btns = el.byTag('button');
    expect(btns.map((b) => b.textContent)).toEqual(['Moving glow', 'Plain']);
    for (const b of btns) {
      expect(b.getAttribute('type')).toBe('button');
      // Never the html switch itself on a button.
      expect(b.hasAttribute('data-background')).toBe(false);
      // The Settings segmented look: >= 56px (--tap-bar) rows.
      expect(b.classes).toContain('seg-btn');
    }
  });

  it.each<BackgroundStyle>(['glow', 'plain'])(
    'marks only %s as chosen: aria-pressed, white fill and a check (not colour alone)',
    (value) => {
      const el = asFake(backgroundPicker(value, () => undefined));
      const state = el
        .byTag('button')
        .map((b) => [
          b.getAttribute('data-background-option'),
          b.getAttribute('aria-pressed'),
          b.classes.includes('active'),
          b.find((e) => e.getAttribute('data-icon') === 'check').length,
        ]);
      expect(state).toEqual([
        ['glow', String(value === 'glow'), value === 'glow', value === 'glow' ? 1 : 0],
        ['plain', String(value === 'plain'), value === 'plain', value === 'plain' ? 1 : 0],
      ]);
    },
  );

  it('calls onChange for the other choice only', () => {
    const got: BackgroundStyle[] = [];
    const el = asFake(backgroundPicker('glow', (v) => got.push(v)));
    byOption(el, 'glow').click();
    byOption(el, 'plain').click();
    expect(got).toEqual(['plain']);
  });

  it('has a short note that passes the copy rules and says "you"-neutral words only', () => {
    const el = asFake(backgroundPicker('glow', () => undefined));
    expect(el.byClass('set-note')[0]?.textContent).toBe(BACKGROUND_NOTE);
    expect(checkCopy(BACKGROUND_NOTE).ok).toBe(true);
    for (const o of BACKGROUND_OPTIONS) expect(checkCopy(o.label).ok).toBe(true);
    expect(BACKGROUND_NOTE).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });
});

describe('applyBackground / backgroundStyle', () => {
  it('sets html[data-background], unknown values fall back to the moving glow', () => {
    const html = new FakeEl('html');
    const root = html as unknown as HTMLElement;
    applyBackground('plain', root);
    expect(html.getAttribute('data-background')).toBe('plain');
    applyBackground('glow', root);
    expect(html.getAttribute('data-background')).toBe('glow');
    applyBackground('neon' as BackgroundStyle, root);
    expect(html.getAttribute('data-background')).toBe('glow');
  });

  it('reads a stored setting safely (default: the moving glow, his q1 answer)', () => {
    expect(backgroundStyle('plain')).toBe('plain');
    expect(backgroundStyle('glow')).toBe('glow');
    expect(backgroundStyle(undefined)).toBe('glow');
    expect(backgroundStyle(null)).toBe('glow');
    expect(backgroundStyle(3)).toBe('glow');
  });
});

describe('Settings → Accent colour → Background row', () => {
  const props = (over: Partial<SettingsProps> = {}): SettingsProps => {
    const slot = () => new FakeEl('div') as unknown as HTMLElement;
    return {
      accent: 'orange' as Accent,
      spokenCount: true,
      coachTips: true,
      handsFree: false,
      unit: 'kg',
      coachVoice: slot(),
      speakerCheck: slot(),
      audioTest: slot(),
      devLog: slot(),
      ...over,
    };
  };
  const noop = () => undefined;
  const actions = {
    onAccent: noop,
    onSpokenCount: noop,
    onCoachTips: noop,
    onHandsFree: noop,
    onUnit: noop,
    onCameraTest: noop,
    onTab: noop,
  };
  const accentSection = (el: FakeEl) => {
    const s = el.find((e) => e.getAttribute('data-section') === 'accent')[0];
    if (!s) throw new Error('no accent section');
    return s;
  };

  it('sits in the Accent colour section, after the swatches, when onBackground is wired', () => {
    const got: BackgroundStyle[] = [];
    const el = asFake(
      settingsScreen(props({ background: 'plain' }), {
        ...actions,
        onBackground: (v) => got.push(v),
      }),
    );
    const sec = accentSection(el);
    const kids = sec.children.map((c) =>
      c.hasAttribute('data-accent-picker')
        ? 'accent'
        : c.hasAttribute('data-background-picker')
          ? 'background'
          : c.tag,
    );
    expect(kids.indexOf('background')).toBeGreaterThan(kids.indexOf('accent'));
    expect(byOption(sec, 'plain').getAttribute('aria-pressed')).toBe('true');
    byOption(sec, 'glow').click();
    expect(got).toEqual(['glow']);
  });

  it('defaults to Moving glow when the prop is missing', () => {
    const el = asFake(settingsScreen(props(), { ...actions, onBackground: noop }));
    expect(byOption(accentSection(el), 'glow').getAttribute('aria-pressed')).toBe('true');
  });

  it('has no Background row until onBackground is wired (old callers render unchanged)', () => {
    const el = asFake(settingsScreen(props(), actions));
    expect(el.find((e) => e.hasAttribute('data-background-picker'))).toEqual([]);
  });
});
