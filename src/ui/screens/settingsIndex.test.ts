import { describe, expect, it } from 'vitest';
import { buildSearchIndex, search } from '../../core/search';
import { checkCopy } from '../../core/trainer/replies';
import { settingsScreen, settingsSectionId, type SettingsActions } from './settings';
import {
  SETTINGS_SEARCH_ITEMS,
  sectionFor,
  settingsSearchItems,
  settingsSectionFor,
} from './settingsIndex';
import { FakeEl, asFake, useFakeDom } from './testDom';

useFakeDom();

const slot = (attr: string) => {
  const el = new FakeEl('div');
  el.setAttribute(attr, '');
  return el as unknown as HTMLElement;
};
const noop = () => undefined;

/** Settings with every optional section on (every callback and slot passed). */
function renderAll(owner: boolean): FakeEl {
  const actions: Required<SettingsActions> = {
    onAccent: noop,
    onBackground: noop,
    onSpokenCount: noop,
    onCoachTips: noop,
    onHandsFree: noop,
    onUnit: noop,
    onLengthUnit: noop,
    onTextSize: noop,
    onCameraTest: noop,
    onTab: noop,
    onPlanChanges: noop,
    onMyGym: noop,
    onHealth: noop,
    onTodos: noop,
    onWhatsNew: noop,
    onIntake: noop,
    onEasyOnRemove: noop,
    onProgressPhotos: noop,
    onProgressPhotosOpen: noop,
    onCoachSettings: noop,
    onReminders: noop,
    onBrainEval: noop,
    onAbout: noop,
    onRerunWelcome: noop,
    onSelfCheck: noop,
    onSearch: noop,
  };
  return asFake(
    settingsScreen(
      {
        accent: 'orange',
        background: 'glow',
        spokenCount: true,
        coachTips: true,
        handsFree: false,
        unit: 'kg',
        coachVoice: slot('data-coach-voice'),
        speakerCheck: slot('data-voice-test'),
        audioTest: slot('data-audio-test'),
        devLog: slot('data-devlog'),
        nutrition: slot('data-nutrition'),
        foodPhotos: slot('data-food-photos'),
        backup: slot('data-backup'),
        owner,
      },
      actions,
    ),
  );
}

const sectionKeys = (el: FakeEl) =>
  el.byClass('set-section').map((s) => s.getAttribute('data-section') ?? '');

describe('SETTINGS_SEARCH_ITEMS', () => {
  it('are setting items with unique ids, a title, a subtitle and keywords', () => {
    const ids = SETTINGS_SEARCH_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const it of SETTINGS_SEARCH_ITEMS) {
      expect(it.kind).toBe('setting');
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.subtitle?.length ?? 0).toBeGreaterThan(0);
      expect(it.keywords.length).toBeGreaterThan(0);
    }
  });

  it('cover the asked-for words: voice, camera, unit, accent/background, health, reminders, about, backup', () => {
    const index = buildSearchIndex(settingsSearchItems({ owner: true }));
    const first = (q: string) => search(index, q)[0]?.id;
    expect(first('voice')).toBe('voice');
    expect(first('speaker')).toBe('voice');
    expect(first('rudeness')).toBe('voice');
    expect(first('drill')).toBe('voice');
    expect(first('camera')).toBe('camera');
    expect(first('hands-free')).toBe('camera');
    expect(first('kg')).toBe('unit');
    expect(first('lb')).toBe('unit');
    // M13d task 12: Settings → Units also holds height and body (cm / ft·in).
    for (const q of ['feet', 'ft', 'inches', 'height', 'cm', 'units'])
      expect(first(q), q).toBe('unit');
    expect(first('accent')).toBe('accent');
    expect(first('colour')).toBe('accent');
    expect(first('background')).toBe('background');
    expect(first('glow')).toBe('background');
    expect(first('health')).toBe('health');
    expect(first('reminders')).toBe('reminders');
    expect(first('privacy')).toBe('about');
    expect(first('licenses')).toBe('about');
    expect(first('backup')).toBe('backup');
  });

  it('M13d task 21: text, font, size, bigger, larger find Display (Text size)', () => {
    const index = buildSearchIndex(settingsSearchItems({ owner: false }));
    const first = (q: string) => search(index, q)[0]?.id;
    for (const q of ['text', 'font', 'size', 'bigger', 'larger', 'text size', 'display'])
      expect(first(q), q).toBe('display');
    const item = SETTINGS_SEARCH_ITEMS.find((i) => i.id === 'display');
    expect(item?.title).toBe('Display');
    expect(checkCopy(`${item?.title}. ${item?.subtitle}`).ok).toBe(true);
  });

  it('every item, owner on and off, points at a section Settings renders, with its jump id', () => {
    for (const owner of [true, false]) {
      const el = renderAll(owner);
      const keys = sectionKeys(el);
      for (const it of settingsSearchItems({ owner })) {
        expect(keys, `${it.id} (owner ${owner})`).toContain(it.section);
        const sec = el
          .byClass('set-section')
          .find((s) => s.getAttribute('data-section') === it.section);
        expect(sec?.getAttribute('id')).toBe(settingsSectionId(it.section));
        expect(sec?.getAttribute('tabindex')).toBe('-1');
      }
    }
  });

  it('owner-only items sit in sections that only show with owner mode on, and are hidden when off', () => {
    const on = sectionKeys(renderAll(true));
    const off = sectionKeys(renderAll(false));
    const ownerOnly = SETTINGS_SEARCH_ITEMS.filter((i) => i.ownerOnly);
    expect(ownerOnly.map((i) => i.id).sort()).toEqual(['devlog', 'todos']);
    for (const it of ownerOnly) {
      expect(on).toContain(it.section);
      expect(off).not.toContain(it.section);
    }
    const offIds = settingsSearchItems({ owner: false }).map((i) => i.id);
    expect(offIds).not.toContain('todos');
    expect(offIds).not.toContain('devlog');
    expect(settingsSectionFor('devlog', false)).toBeNull();
    expect(settingsSectionFor('devlog', true)).toBe('devlog');
  });

  it("What's new: in To-dos with owner mode on, its own section with it off", () => {
    const wn = SETTINGS_SEARCH_ITEMS.find((i) => i.id === 'whats-new');
    if (!wn) throw new Error('no whats-new');
    expect(sectionFor(wn, true)).toBe('todos');
    expect(sectionFor(wn, false)).toBe('whats-new');
    expect(settingsSectionFor('whats-new', true)).toBe('todos');
    expect(settingsSectionFor('whats-new', false)).toBe('whats-new');
    expect(
      settingsSearchItems({ owner: true }).find((i) => i.id === 'whats-new'),
    ).not.toHaveProperty('ownerSection');
  });

  it('every Settings section is reachable from search (no section left out)', () => {
    for (const owner of [true, false]) {
      const covered = new Set(settingsSearchItems({ owner }).map((i) => i.section));
      expect(sectionKeys(renderAll(owner)).filter((k) => !covered.has(k))).toEqual([]);
    }
  });

  it('has(key) drops items whose section Settings will not render', () => {
    const items = settingsSearchItems({
      owner: true,
      has: (k) => k !== 'health' && k !== 'accent',
    });
    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('health');
    expect(ids).not.toContain('accent');
    expect(ids).not.toContain('background');
    expect(ids).toContain('voice');
  });

  it('unknown ids have no section', () => {
    expect(settingsSectionFor('nope', true)).toBeNull();
  });

  it('every title and subtitle passes checkCopy and says "you", never he/she', () => {
    for (const it of SETTINGS_SEARCH_ITEMS) {
      for (const s of [it.title, it.subtitle ?? '']) {
        expect(checkCopy(s).ok, s).toBe(true);
        expect(s, s).not.toMatch(/\b(he|she|his|her|him)\b/i);
      }
    }
  });
});
