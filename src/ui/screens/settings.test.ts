import { describe, expect, it } from 'vitest';
import type { Accent, BodyArea, Intake } from '../../core/types';
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
  settingsScreen,
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

  it('unitNote', () => {
    expect(unitNote('kg')).toBe('Weights step by 2.5 kg.');
    expect(unitNote('lb')).toMatch(/^Weights step by 5 lb\./);
  });
});

describe('settingsScreen M7 Nutrition slot', () => {
  it('no nutrition prop → no Nutrition section (unchanged)', () => {
    const { el } = render();
    expect(el.find((e) => e.getAttribute('data-section') === 'nutrition')).toHaveLength(0);
  });

  it('places the nutrition block in a "Nutrition" section after Weight unit', () => {
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
