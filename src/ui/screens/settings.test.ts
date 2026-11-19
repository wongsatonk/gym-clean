import { describe, expect, it } from 'vitest';
import type { Accent, BodyArea, Intake, LengthUnit, TextSize } from '../../core/types';
import { TEXT_SIZES, textScale } from '../../core/textSize';
import { TEXT_SIZE_GROUP, TEXT_SIZE_NOTE } from '../textSizePicker';
import { checkCopy } from '../../core/trainer/replies';
import { PHOTOS_PRIVACY } from '../photos/progressPhotos';
import type { Unit } from '../../core/units';
import { ACCENT_OPTIONS, accentPicker } from '../accentPicker';
import { ACCENTS } from '../tokens';
import type { TabId } from '../tabBar';
import { CREDIT, versionLabel } from '../../core/version';
import {
  EASY_ON_EMPTY,
  EASY_ON_HEAD,
  EASY_ON_NOTE,
  GOAL_NOT_SET,
  GOAL_RERUN_LABEL,
  GOAL_SET_LABEL,
  LENGTH_UNIT_GROUP,
  WEIGHT_UNIT_GROUP,
  isShortNote,
  lengthNote,
  settingsScreen,
  settingsSectionId,
  unitNote,
  type SettingsActions,
  type SettingsProps,
} from './settings';
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
      'about',
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

  it('M13d Units: the section is titled Units; Weight keeps its group name and buttons', () => {
    const { el } = render({ unit: 'kg' });
    const sec = one(el, (e) => e.getAttribute('data-section') === 'unit', 'unit section');
    expect(sec.byTag('h2')[0]?.textContent).toBe('Units');
    const groups = sec.find((e) => e.getAttribute('role') === 'group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([WEIGHT_UNIT_GROUP]);
    expect(WEIGHT_UNIT_GROUP).toBe('Weight unit');
  });

  it('M13d Units: Height and body (cm / ft·in) shows with onLengthUnit, pressed + check, taps report', () => {
    const lengths: LengthUnit[] = [];
    const el = asFake(
      settingsScreen(props({ unit: 'kg', lengthUnit: 'in' }), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onLengthUnit: (u) => lengths.push(u),
        onCameraTest: () => {},
        onTab: () => {},
      }),
    );
    const sec = one(el, (e) => e.getAttribute('data-section') === 'unit', 'unit section');
    const groups = sec.find((e) => e.getAttribute('role') === 'group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      WEIGHT_UNIT_GROUP,
      LENGTH_UNIT_GROUP,
    ]);
    const cm = byAttr(el, 'data-length-unit', 'cm');
    const ftIn = byAttr(el, 'data-length-unit', 'in');
    expect([cm.textContent, ftIn.textContent]).toEqual(['cm', 'ft·in']);
    expect([cm.getAttribute('aria-pressed'), ftIn.getAttribute('aria-pressed')]).toEqual([
      'false',
      'true',
    ]);
    expect(ftIn.find((e) => e.getAttribute('data-icon') === 'check')).toHaveLength(1);
    ftIn.click();
    cm.click();
    expect(lengths).toEqual(['cm']);
    expect(sec.textContent).toContain(lengthNote('in'));
    // The visible words over each choice; the group names carry them for screen readers.
    const labels = sec.byClass('set-units-label');
    expect(labels.map((l) => l.textContent)).toEqual(['Weight', 'Height and body']);
    for (const l of labels) expect(l.getAttribute('aria-hidden')).toBe('true');
    // The weight buttons stay the only [data-unit] hooks (e2e looks them up by that).
    expect(
      el.find((e) => e.hasAttribute('data-unit')).map((e) => e.getAttribute('data-unit')),
    ).toEqual(['kg', 'lb']);
  });

  it('M13d Units: no lengthUnit row → follows the weight unit (lb → ft·in, kg → cm)', () => {
    for (const [unit, want] of [
      ['lb', 'in'],
      ['kg', 'cm'],
    ] as const) {
      const el = asFake(
        settingsScreen(props({ unit }), {
          onAccent: () => {},
          onSpokenCount: () => {},
          onCoachTips: () => {},
          onHandsFree: () => {},
          onUnit: () => {},
          onLengthUnit: () => {},
          onCameraTest: () => {},
          onTab: () => {},
        }),
      );
      expect(byAttr(el, 'data-length-unit', want).getAttribute('aria-pressed')).toBe('true');
    }
  });

  it('M13d Units: without onLengthUnit only the Weight choice shows', () => {
    const { el } = render({ unit: 'lb', lengthUnit: 'in' });
    expect(el.find((e) => e.hasAttribute('data-length-unit'))).toHaveLength(0);
  });

  it('lengthNote', () => {
    expect(lengthNote('cm')).toBe('Height and tape in cm.');
    expect(lengthNote('in')).toBe('Height in feet and inches, tape in inches.');
    for (const t of [lengthNote('cm'), lengthNote('in'), LENGTH_UNIT_GROUP, WEIGHT_UNIT_GROUP])
      expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
  });

  it('unitNote', () => {
    expect(unitNote('kg')).toBe('Weights step by 2.5 kg.');
    expect(unitNote('lb')).toMatch(/^Weights step by 5 lb\./);
  });
});

describe('settingsScreen M13d task 21 Display → Text size', () => {
  const withText = (textSize: TextSize | undefined, sizes: TextSize[]) =>
    asFake(
      settingsScreen(props(textSize ? { textSize } : {}), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onTextSize: (s) => sizes.push(s),
        onCameraTest: () => {},
        onTab: () => {},
      }),
    );

  it('without onTextSize there is no Display section', () => {
    const { el } = render();
    expect(el.find((e) => e.getAttribute('data-section') === 'display')).toHaveLength(0);
  });

  it('a "Display" section right after Your goal (before Accent colour), a jump target', () => {
    const el = withText(undefined, []);
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys.indexOf('display')).toBe(keys.indexOf('accent') - 1);
    const sec = one(el, (e) => e.getAttribute('data-section') === 'display', 'display');
    expect(sec.byTag('h2')[0]?.textContent).toBe('Display');
    expect(sec.getAttribute('id')).toBe(settingsSectionId('display'));
    expect(sec.byTag('h2')[0]?.find((e) => e.getAttribute('data-icon') === 'text')).toHaveLength(1);
  });

  it('Text size: Standard / Large / Larger in one named group; missing → Standard pressed + check', () => {
    const el = withText(undefined, []);
    const sec = one(el, (e) => e.getAttribute('data-section') === 'display', 'display');
    const group = one(sec, (e) => e.getAttribute('role') === 'group', 'group');
    const label = one(sec, (e) => e.getAttribute('id') === 'set-text-size-label', 'label');
    expect(label.textContent).toBe(TEXT_SIZE_GROUP);
    expect(group.getAttribute('aria-labelledby')).toBe('set-text-size-label');
    const btns = group.byTag('button');
    expect(btns.map((b) => b.textContent)).toEqual(['Standard', 'Large', 'Larger']);
    expect(btns.map((b) => b.getAttribute('data-text-size-option'))).toEqual([...TEXT_SIZES]);
    expect(btns.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(btns.map((b) => b.find((e) => e.getAttribute('data-icon') === 'check').length)).toEqual([
      1, 0, 0,
    ]);
    expect(btns[0]?.classes).toContain('active');
    // The short note stays shown (≤ 10 words, one sentence), no More.
    expect(isShortNote(TEXT_SIZE_NOTE)).toBe(true);
    expect(sec.textContent).toContain(TEXT_SIZE_NOTE);
    expect(sec.find((e) => e.getAttribute('data-more') === 'set-display')).toHaveLength(0);
  });

  it('each word previews its size (the core cue px); the stored size is pressed; taps report', () => {
    const sizes: TextSize[] = [];
    const el = withText('larger', sizes);
    const btn = (s: TextSize) => byAttr(el, 'data-text-size-option', s);
    for (const s of TEXT_SIZES) {
      const word = btn(s).byClass('text-size-word')[0];
      expect(word?.style['fontSize'], s).toBe(`${textScale(s).cue}px`);
      expect(btn(s).getAttribute('aria-pressed')).toBe(s === 'larger' ? 'true' : 'false');
    }
    btn('larger').click(); // already chosen: nothing
    btn('large').click();
    btn('standard').click();
    expect(sizes).toEqual(['large', 'standard']);
  });

  it('copy passes checkCopy', () => {
    for (const t of [TEXT_SIZE_GROUP, TEXT_SIZE_NOTE, 'Display', 'Standard', 'Large', 'Larger'])
      expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
  });
});

describe('settingsScreen M7 Nutrition slot', () => {
  it('no nutrition prop → no Nutrition section (unchanged)', () => {
    const { el } = render();
    expect(el.find((e) => e.getAttribute('data-section') === 'nutrition')).toHaveLength(0);
  });

  it('places the nutrition block in a "Nutrition" section after Units', () => {
    const { el } = render({ nutrition: slot('data-nutrition') });
    const sections = el.find((e) => e.tag === 'section').map((s) => s.getAttribute('data-section'));
    expect(sections.indexOf('nutrition')).toBe(sections.indexOf('unit') + 1);
    const sec = one(el, (e) => e.getAttribute('data-section') === 'nutrition', 'nutrition');
    expect(sec.textContent).toContain('Nutrition');
    expect(sec.find((e) => e.hasAttribute('data-nutrition'))).toHaveLength(1);
  });
});

describe('settingsScreen M10e Gym and M9 Backup sections', () => {
  const noop = () => undefined;
  const base = {
    onAccent: noop,
    onSpokenCount: noop,
    onCoachTips: noop,
    onHandsFree: noop,
    onUnit: noop,
    onCameraTest: noop,
    onTab: noop,
  };

  it('no onMyGym / backup → neither section (unchanged)', () => {
    const { el } = render();
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys).not.toContain('gym');
    expect(keys).not.toContain('backup');
  });

  it('Gym: a "My gym" row that opens the checklist; Backup sits right before the dev log', () => {
    let opened = 0;
    const el = asFake(
      settingsScreen(props({ backup: slot('data-backup') }), {
        ...base,
        onMyGym: () => opened++,
        onPlanChanges: noop,
      }),
    );
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys).toEqual([
      'accent',
      'voice',
      'camera',
      'unit',
      'gym',
      'plan',
      'backup',
      'devlog',
      'about',
    ]);
    const btn = one(el, (e) => e.hasAttribute('data-my-gym-open'), 'my gym');
    expect(btn.textContent).toBe('My gym');
    expect(btn.classes).toContain('set-action');
    btn.click();
    expect(opened).toBe(1);
    const sec = byAttr(el, 'data-section', 'backup');
    expect(sec.find((e) => e.hasAttribute('data-backup'))).toHaveLength(1);
  });
});

describe('settingsScreen M7b Food photos slot', () => {
  it('no foodPhotos prop → no Food photos section (unchanged)', () => {
    const { el } = render();
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys).toEqual(['accent', 'voice', 'camera', 'unit', 'devlog', 'about']);
  });

  it('places the food photos block in a "Food photos" section right after Nutrition', () => {
    const { el } = render({
      nutrition: slot('data-nutrition'),
      foodPhotos: slot('data-food-photos'),
    });
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys.indexOf('food-photos')).toBe(keys.indexOf('nutrition') + 1);
    const sec = byAttr(el, 'data-section', 'food-photos');
    expect(sec.textContent).toContain('Food photos');
    expect(sec.getAttribute('aria-labelledby')).toBe('set-food-photos');
    expect(sec.find((e) => e.hasAttribute('data-food-photos'))).toHaveLength(1);
  });
});

describe('settingsScreen M12 slice 1c About', () => {
  it('is the last section: "Gym Clean", the version label and the credit, no links', () => {
    const { el } = render({ version: 'Version 9.9.0 (build abc1234)' });
    const sections = el.byClass('set-section');
    const about = sections.at(-1);
    expect(about?.getAttribute('data-section')).toBe('about');
    expect(about?.byTag('h2')[0]?.textContent).toBe('About');
    const by = (k: string) =>
      one(about as FakeEl, (e) => e.getAttribute('data-about') === k, `[data-about=${k}]`);
    expect(by('name').textContent).toBe('Gym Clean');
    expect(by('version').textContent).toBe('Version 9.9.0 (build abc1234)');
    expect(by('credit').textContent).toBe('© 2026 Wongsaton Kampusan');
    expect(CREDIT).toBe('© 2026 Wongsaton Kampusan');
    expect(about?.byTag('a')).toHaveLength(0);
    expect(about?.byTag('button')).toHaveLength(0);
    // The tab bar still closes the screen, right after About.
    expect(el.children.at(-2)).toBe(about);
  });

  it('defaults the version line to versionLabel()', () => {
    const { el } = render();
    const v = one(el, (e) => e.getAttribute('data-about') === 'version', 'version');
    expect(v.textContent).toBe(versionLabel());
  });
});

describe('settingsScreen M12 slice 1b: Your goal, go-easy list, Progress photos', () => {
  const INTAKE: Intake = {
    goalKind: 'general',
    goalText: 'Keep up on long walks',
    days: 3,
    sessionMin: 45,
    experience: 'new',
    easyOn: [],
    at: 1,
  };
  function render1b(over: Partial<SettingsProps> = {}, act: Partial<SettingsActions> = {}) {
    const calls = { intake: 0, remove: [] as BodyArea[], photos: [] as boolean[], open: 0 };
    const el = asFake(
      settingsScreen(props(over), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onCameraTest: () => {},
        onTab: () => {},
        onIntake: () => calls.intake++,
        onEasyOnRemove: (a) => calls.remove.push(a),
        onProgressPhotos: (on) => calls.photos.push(on),
        onProgressPhotosOpen: () => calls.open++,
        ...act,
      }),
    );
    const sec = (key: string) => el.find((e) => e.getAttribute('data-section') === key)[0];
    const at = (attr: string, value?: string) =>
      el.find((e) =>
        value === undefined ? e.hasAttribute(attr) : e.getAttribute(attr) === value,
      )[0];
    return { el, calls, sec, at };
  }

  it('none of the callbacks → neither section (unchanged)', () => {
    const { el } = render();
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys).not.toContain('goal');
    expect(keys).not.toContain('progress-photos');
  });

  it('Your goal is the first section; no answers yet → "Not set yet." + Set your goal', () => {
    const { el, calls, sec, at } = render1b();
    expect(el.byClass('set-section')[0]?.getAttribute('data-section')).toBe('goal');
    expect(sec('goal')?.byTag('h2')[0]?.textContent).toBe('Your goal');
    expect(at('data-goal-summary')?.textContent).toBe(GOAL_NOT_SET);
    expect(at('data-intake-open')?.textContent).toBe(GOAL_SET_LABEL);
    at('data-intake-open')?.click();
    expect(calls.intake).toBe(1);
    expect(at('data-easy-empty')?.textContent).toBe(EASY_ON_EMPTY);
    expect(sec('goal')?.find((e) => e.hasAttribute('data-easy-remove'))).toHaveLength(0);
  });

  it('with answers: the one-line summary, own words, and a re-run row', () => {
    const { at } = render1b({ intake: INTAKE });
    expect(at('data-goal-summary')?.textContent).toBe('General fitness · 3 days a week · 45 min');
    expect(at('data-goal-words')?.textContent).toBe('Keep up on long walks');
    expect(at('data-intake-open')?.textContent).toBe(GOAL_RERUN_LABEL);
  });

  it('go-easy list: each area with a named Remove that only calls back (a proposal follows)', () => {
    const { el, calls, sec, at } = render1b({ intake: INTAKE, easyOn: ['legs', 'shoulders'] });
    const rows = el.find((e) => e.hasAttribute('data-easy-on'));
    // Fixed body order, not the stored order.
    expect(rows.map((r) => r.getAttribute('data-easy-on'))).toEqual(['shoulders', 'legs']);
    expect(rows.map((r) => r.oneByClass('set-easy-name').textContent)).toEqual([
      'Shoulders',
      'Legs',
    ]);
    const list = sec('goal')?.byTag('ul')[0];
    const head = el.find((e) => e.getAttribute('id') === list?.getAttribute('aria-labelledby'))[0];
    expect(head?.textContent).toBe(EASY_ON_HEAD);
    const btn = at('data-easy-remove', 'legs');
    expect(btn?.textContent).toBe('Remove');
    expect(btn?.getAttribute('aria-label')).toBe('Remove Legs from the go-easy list');
    btn?.click();
    expect(calls.remove).toEqual(['legs']);
    // Nothing is removed here: the row stays until the props change.
    expect(el.find((e) => e.hasAttribute('data-easy-on'))).toHaveLength(2);
    expect(sec('goal')?.textContent).toContain(EASY_ON_NOTE);
  });

  it('go-easy list without onEasyOnRemove is read-only', () => {
    const { el } = render1b({ easyOn: ['core'] }, { onEasyOnRemove: undefined });
    expect(el.find((e) => e.hasAttribute('data-easy-on'))).toHaveLength(1);
    expect(el.find((e) => e.hasAttribute('data-easy-remove'))).toHaveLength(0);
  });

  it('Progress photos: off by default, a switch, the privacy line, no Open row while off', () => {
    const { el, calls, sec, at } = render1b();
    const keys = el.byClass('set-section').map((s) => s.getAttribute('data-section'));
    expect(keys.indexOf('progress-photos')).toBe(keys.indexOf('devlog') - 1);
    const sw = at('data-setting', 'progress-photos');
    expect(sw?.getAttribute('role')).toBe('switch');
    expect(sw?.getAttribute('aria-checked')).toBe('false');
    expect(sw?.oneByClass('switch-label').textContent).toBe('Progress photos');
    expect(at('data-progress-photos-open')).toBeUndefined();
    expect(sec('progress-photos')?.textContent).toContain(PHOTOS_PRIVACY);
    expect(PHOTOS_PRIVACY).toBe('Stays on this phone. Not in backups.');
    sw?.click();
    expect(calls.photos).toEqual([true]);
  });

  it('Progress photos on: the switch reports off, and Open leads to the photos', () => {
    const { calls, at } = render1b({ progressPhotos: true });
    const sw = at('data-setting', 'progress-photos');
    expect(sw?.getAttribute('aria-checked')).toBe('true');
    at('data-progress-photos-open')?.click();
    expect(calls.open).toBe(1);
    sw?.click();
    expect(calls.photos).toEqual([false]);
  });

  it('new copy passes the coaching-words check', () => {
    for (const s of [
      GOAL_NOT_SET,
      GOAL_SET_LABEL,
      GOAL_RERUN_LABEL,
      EASY_ON_HEAD,
      EASY_ON_EMPTY,
      EASY_ON_NOTE,
    ])
      expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });
});

describe('settingsScreen M12 slice 2 rows: Coach, Reminders, Coach eval', () => {
  function render2(extra: Partial<SettingsActions>) {
    const log: string[] = [];
    const el = asFake(
      settingsScreen(props(), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onCameraTest: () => {},
        onTab: () => {},
        onHealth: () => {},
        onPlanChanges: () => {},
        ...extra,
      }),
    );
    return { el, log };
  }
  const keys = (el: FakeEl) => el.byClass('set-section').map((s) => s.getAttribute('data-section'));

  it('no callbacks → no rows (the PWA without them, older wiring)', () => {
    const { el } = render2({});
    expect(keys(el)).not.toContain('coach');
    expect(keys(el)).not.toContain('reminders');
    expect(el.find((e) => e.hasAttribute('data-brain-eval-open'))).toHaveLength(0);
  });

  it('Coach and Reminders sit after Health, before Plan; each opens its screen', () => {
    const log: string[] = [];
    const { el } = render2({
      onCoachSettings: () => log.push('coach'),
      onReminders: () => log.push('reminders'),
    });
    const k = keys(el);
    expect(k.indexOf('coach')).toBe(k.indexOf('health') + 1);
    expect(k.indexOf('reminders')).toBe(k.indexOf('coach') + 1);
    expect(k.indexOf('plan')).toBe(k.indexOf('reminders') + 1);
    one(el, (e) => e.hasAttribute('data-coach-settings-open'), 'coach open').click();
    one(el, (e) => e.hasAttribute('data-reminders-open'), 'reminders open').click();
    expect(log).toEqual(['coach', 'reminders']);
  });

  it('Coach eval is a row under the Developer log, after the log panel', () => {
    const log: string[] = [];
    const { el } = render2({ onBrainEval: () => log.push('eval') });
    const dev = byAttr(el, 'data-section', 'devlog');
    expect(dev.children[1]?.hasAttribute('data-devlog')).toBe(true);
    const row = dev.children[2];
    expect(row?.hasAttribute('data-brain-eval-open')).toBe(true);
    expect(row?.textContent).toBe('Coach eval');
    row?.click();
    expect(log).toEqual(['eval']);
  });
});

describe('settingsScreen M13 owner mode', () => {
  const all: Required<
    Pick<
      SettingsActions,
      | 'onPlanChanges'
      | 'onMyGym'
      | 'onHealth'
      | 'onTodos'
      | 'onWhatsNew'
      | 'onIntake'
      | 'onProgressPhotos'
      | 'onCoachSettings'
      | 'onReminders'
      | 'onBrainEval'
    >
  > = {
    onPlanChanges: () => {},
    onMyGym: () => {},
    onHealth: () => {},
    onTodos: () => {},
    onWhatsNew: () => {},
    onIntake: () => {},
    onProgressPhotos: () => {},
    onCoachSettings: () => {},
    onReminders: () => {},
    onBrainEval: () => {},
  };
  function renderM13(over: Partial<SettingsProps>, extra: Partial<SettingsActions> = {}) {
    return asFake(
      settingsScreen(props({ backup: slot('data-backup'), ...over }), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onCameraTest: () => {},
        onTab: () => {},
        ...all,
        ...extra,
      }),
    );
  }
  const keys = (el: FakeEl) => el.byClass('set-section').map((s) => s.getAttribute('data-section'));
  const has = (el: FakeEl, attr: string) => el.find((e) => e.hasAttribute(attr)).length > 0;
  /** Section keys + every element's hook attributes and text, to compare two renders. */
  const shape = (el: FakeEl) =>
    el.find(() => true).map((e) => `${e.tag}|${[...e.attrs.keys()].join(',')}|${e.text}`);

  const PRE_M13 = [
    'goal',
    'accent',
    'voice',
    'camera',
    'unit',
    'gym',
    'health',
    'coach',
    'reminders',
    'plan',
    'todos',
    'progress-photos',
    'backup',
    'devlog',
    'about',
  ];

  it('owner on: the same sections and rows as before M13', () => {
    const on = renderM13({ owner: true, version: 'Version 1.15.0 (build abc1234)' });
    expect(keys(on)).toEqual(PRE_M13);
    // Omitting owner (app.ts before task 30) is the same render.
    const unset = renderM13({ version: 'Version 1.15.0 (build abc1234)' });
    expect(shape(unset)).toEqual(shape(on));
    for (const hook of [
      'data-todos-open',
      'data-whats-new-open',
      'data-devlog',
      'data-brain-eval-open',
    ])
      expect(has(on, hook)).toBe(true);
    const about = byAttr(on, 'data-section', 'about');
    expect(about.byTag('button')).toHaveLength(0); // no onAbout → no row, exactly as before
    expect(
      one(about, (e) => e.getAttribute('data-about') === 'version', 'version').textContent,
    ).toBe('Version 1.15.0 (build abc1234)');
  });

  it("owner off: no To-dos, no Developer log, no Coach eval; What's new stays", () => {
    const log: string[] = [];
    const el = renderM13({ owner: false }, { onWhatsNew: () => log.push('tour') });
    expect(keys(el)).toEqual([
      'goal',
      'accent',
      'voice',
      'camera',
      'unit',
      'gym',
      'health',
      'coach',
      'reminders',
      'plan',
      'whats-new',
      'progress-photos',
      'backup',
    ]);
    expect(has(el, 'data-todos-open')).toBe(false);
    expect(has(el, 'data-devlog')).toBe(false);
    expect(has(el, 'data-brain-eval-open')).toBe(false);
    expect(el.textContent).not.toContain('To-dos');
    expect(el.textContent).not.toContain('Developer log');
    expect(el.textContent).not.toContain('Coach eval');
    const wn = byAttr(el, 'data-section', 'whats-new');
    expect(wn.byTag('h2')[0]?.textContent).toBe("What's new");
    one(wn, (e) => e.hasAttribute('data-whats-new-open'), 'whats new').click();
    expect(log).toEqual(['tour']);
  });

  it("owner off with no What's new callback → no section at all", () => {
    const el = renderM13({ owner: false }, { onWhatsNew: undefined });
    expect(keys(el)).not.toContain('whats-new');
    expect(keys(el)).not.toContain('todos');
  });

  it('owner off: About is one row (last section) that opens the About screen', () => {
    const log: string[] = [];
    const el = renderM13(
      { owner: false, version: 'Version 1.15.0 (build abc1234)' },
      { onAbout: () => log.push('about') },
    );
    const about = el.byClass('set-section').at(-1) as FakeEl;
    expect(about.getAttribute('data-section')).toBe('about');
    expect(el.children.at(-2)).toBe(about);
    expect(about.find((e) => e.hasAttribute('data-about'))).toHaveLength(0);
    const rows = about.byTag('button');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hasAttribute('data-about-open')).toBe(true);
    expect(rows[0]?.textContent).toBe('About Gym Clean');
    expect(rows[0]?.classes).toContain('set-action');
    // No build hash, version or credit on Settings itself.
    expect(el.textContent).not.toContain('build');
    expect(el.textContent).not.toContain(CREDIT);
    rows[0]?.click();
    expect(log).toEqual(['about']);
  });

  it('owner off without onAbout → no About section', () => {
    expect(keys(renderM13({ owner: false }))).not.toContain('about');
  });

  it("owner on with onAbout: today's About lines plus the row (owner tools stay reachable)", () => {
    const log: string[] = [];
    const el = renderM13({ owner: true }, { onAbout: () => log.push('about') });
    expect(keys(el)).toEqual(PRE_M13);
    const about = byAttr(el, 'data-section', 'about');
    expect(
      about.find((e) => e.hasAttribute('data-about')).map((e) => e.getAttribute('data-about')),
    ).toEqual(['name', 'version', 'credit']);
    one(about, (e) => e.hasAttribute('data-about-open'), 'about row').click();
    expect(log).toEqual(['about']);
  });

  it('"Show the welcome again" follows the About row, owner off or on, and calls back', () => {
    for (const owner of [false, true]) {
      const log: string[] = [];
      const el = renderM13(
        { owner },
        { onAbout: () => log.push('about'), onRerunWelcome: () => log.push('welcome') },
      );
      const about = byAttr(el, 'data-section', 'about');
      const rows = about.byTag('button');
      expect(rows.map((b) => b.textContent)).toEqual(['About Gym Clean', 'Show the welcome again']);
      expect(rows[1]?.hasAttribute('data-welcome-rerun')).toBe(true);
      expect(rows[1]?.classes).toContain('set-action');
      rows[1]?.click();
      expect(log).toEqual(['welcome']);
    }
  });

  it('Self-check row: shown owner on or off when onSelfCheck is set, and calls back', () => {
    for (const owner of [false, true]) {
      const log: string[] = [];
      const el = renderM13({ owner }, { onSelfCheck: () => log.push('check') });
      const sec = byAttr(el, 'data-section', 'selfcheck');
      const btn = one(sec, (e) => e.hasAttribute('data-selfcheck-open'), 'self-check row');
      expect(btn.textContent).toBe('Self-check');
      expect(btn.classes).toContain('set-action');
      btn.click();
      expect(log).toEqual(['check']);
    }
    expect(has(renderM13({ owner: true }, {}), 'data-selfcheck-open')).toBe(false);
  });

  it('without onRerunWelcome → no welcome row; with it alone, owner off still gets an About section', () => {
    expect(has(renderM13({ owner: false }, { onAbout: () => {} }), 'data-welcome-rerun')).toBe(
      false,
    );
    const el = renderM13({ owner: false }, { onRerunWelcome: () => {} });
    const about = byAttr(el, 'data-section', 'about');
    expect(about.byTag('button').map((b) => b.textContent)).toEqual(['Show the welcome again']);
  });

  it('new copy passes the coaching-words check', () => {
    for (const s of ['What changed in this version.', 'About Gym Clean', 'Show the welcome again'])
      expect(checkCopy(s).ok).toBe(true);
  });
});

describe('Settings: Search and jump targets (M13c)', () => {
  const noop = () => undefined;
  const base: SettingsActions = {
    onAccent: noop,
    onSpokenCount: noop,
    onCoachTips: noop,
    onHandsFree: noop,
    onUnit: noop,
    onCameraTest: noop,
    onTab: noop,
  };

  it('without onSearch: the bare title, no Search', () => {
    const { el } = render();
    expect(el.children[0]?.tag).toBe('h1');
    expect(el.find((e) => e.hasAttribute('data-search-open'))).toHaveLength(0);
  });

  it('with onSearch: "Settings" + Search in one row; a tap passes the button out', () => {
    const got: unknown[] = [];
    const el = asFake(settingsScreen(props(), { ...base, onSearch: (o) => got.push(o) }));
    const head = el.children[0];
    expect(head?.tag).toBe('header');
    expect(head?.byTag('h1')[0]?.textContent).toBe('Settings');
    const btn = one(el, (e) => e.hasAttribute('data-search-open'), 'Search');
    expect(btn.textContent).toBe('Search');
    btn.click();
    expect(got).toEqual([btn]);
  });

  it('every section is a jump target: id settings-<key>, tabindex -1, still labelled by its heading', () => {
    const { el } = render();
    const secs = el.byClass('set-section');
    expect(secs.length).toBeGreaterThan(0);
    for (const s of secs) {
      const key = s.getAttribute('data-section') ?? '';
      expect(s.getAttribute('id')).toBe(settingsSectionId(key));
      expect(s.getAttribute('id')).toBe(`settings-${key}`);
      expect(s.getAttribute('tabindex')).toBe('-1');
      expect(s.getAttribute('aria-labelledby')).toBe(`set-${key}`);
    }
  });
});

describe('settingsScreen M13d task 19: notes behind "More"', () => {
  function renderAll(over: Partial<SettingsProps> = {}) {
    return asFake(
      settingsScreen(props({ easyOn: ['legs'], ...over }), {
        onAccent: () => {},
        onSpokenCount: () => {},
        onCoachTips: () => {},
        onHandsFree: () => {},
        onUnit: () => {},
        onLengthUnit: () => {},
        onCameraTest: () => {},
        onTab: () => {},
        onIntake: () => {},
        onEasyOnRemove: () => {},
        onProgressPhotos: () => {},
        onMyGym: () => {},
        onHealth: () => {},
        onCoachSettings: () => {},
        onSelfCheck: () => {},
        onReminders: () => {},
        onTodos: () => {},
        onWhatsNew: () => {},
      }),
    );
  }
  it('only long notes fold: each such section has one closed More (a real button) holding them', () => {
    const el = renderAll();
    const mores = el.find((e) => e.hasAttribute('data-more'));
    // Multi-sentence (go-easy, Gym) or over 10 words (To-dos); the one-liners stay shown.
    expect(mores.map((m) => m.getAttribute('data-more'))).toEqual([
      'set-goal',
      'set-gym',
      'set-todos',
    ]);
    for (const m of mores) {
      const btn = m.find((e) => e.hasAttribute('data-more-btn'))[0];
      expect(btn?.tag).toBe('button');
      expect(btn?.getAttribute('aria-expanded')).toBe('false');
      const panel = m.find((e) => e.hasAttribute('data-more-panel'))[0];
      expect(panel?.hasAttribute('hidden')).toBe(true);
      expect(panel?.byClass('set-note').length).toBeGreaterThan(0);
    }
    expect(byAttr(el, 'data-more', 'set-goal').textContent).toContain(EASY_ON_NOTE);
  });

  it('one-line notes stay shown (not behind More)', () => {
    const el = renderAll();
    const inMore = (e: FakeEl) =>
      el.find((m) => m.hasAttribute('data-more-panel') && m.find((x) => x === e).length > 0)
        .length > 0;
    const shown = el.find((e) => e.hasAttribute('data-set-note'));
    expect(shown.map((e) => e.getAttribute('data-set-note'))).toEqual([
      'unit',
      'unit',
      'health',
      'coach',
      'selfcheck',
      'reminders',
    ]);
    for (const e of shown) {
      expect(inMore(e)).toBe(false);
      expect(e.classes).toContain('set-note');
      expect(isShortNote(e.textContent)).toBe(true);
    }
    expect(shown[0]?.textContent).toBe(unitNote('kg'));
    expect(shown[1]?.textContent).toBe(lengthNote('cm'));
  });

  it('a long Units note (lb: two sentences) folds while the short one stays shown', () => {
    const el = renderAll({ unit: 'lb', lengthUnit: 'cm' });
    const unit = byAttr(el, 'data-more', 'set-unit');
    expect(unit.textContent).toContain(unitNote('lb'));
    expect(unit.textContent).not.toContain(lengthNote('cm'));
    expect(
      el.find((e) => e.getAttribute('data-set-note') === 'unit').map((e) => e.textContent),
    ).toEqual([lengthNote('cm')]);
  });

  it('isShortNote: one sentence of at most 10 words', () => {
    expect(isShortNote('Weights step by 2.5 kg.')).toBe(true);
    expect(isShortNote('Off until you turn them on.')).toBe(true);
    expect(isShortNote('The kit your gym has. Swaps use only that.')).toBe(false);
    expect(isShortNote('Things to try and answer, and what changed in this version.')).toBe(false);
  });

  it('the privacy line and state lines stay shown (not behind More)', () => {
    const el = renderAll({ easyOn: [] });
    const notInMore = (e: FakeEl) =>
      el.find((m) => m.hasAttribute('data-more-panel') && m.find((x) => x === e).length > 0)
        .length === 0;
    const privacy = byAttr(el, 'data-progress-photos-privacy', '');
    expect(privacy.textContent).toContain(PHOTOS_PRIVACY);
    expect(notInMore(privacy)).toBe(true);
    const empty = byAttr(el, 'data-easy-empty', '');
    expect(notInMore(empty)).toBe(true);
    expect(notInMore(byAttr(el, 'data-goal-summary', ''))).toBe(true);
    // No go-easy areas → no go-easy note → no More in Your goal.
    expect(el.find((e) => e.getAttribute('data-more') === 'set-goal')).toHaveLength(0);
  });
});
