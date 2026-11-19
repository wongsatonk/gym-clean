import { describe, expect, it } from 'vitest';
import { isAppRoute } from '../../core/todo/routes';
import { checkCopy } from '../../core/trainer/replies';
import {
  addedTopics,
  compareReleases,
  replayPages,
  tourReleases,
  tourToShow,
  tourVersion,
} from '../../core/todo/whatsNew';
import type { WhatsNewPage } from '../../core/types';
import { TODO_TOPICS } from '../todos/topics';
import { WHATS_NEW_PAGES } from './pages';

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter((x) => x.trim() !== '');

describe('WHATS_NEW_PAGES', () => {
  const r112 = WHATS_NEW_PAGES.filter((p) => p.release === '1.12.0');

  it('has about six pages for 1.12.0 covering slice 1 and the to-dos', () => {
    expect(r112.map((p) => p.id)).toEqual([
      'coach-tab',
      'focus-block',
      'calendar',
      'missed-day',
      'motion',
      'todos',
    ]);
  });

  const r113 = WHATS_NEW_PAGES.filter((p) => p.release === '1.13.0');

  it('has eight pages for 1.13.0 covering the trainer kit (slice 1b)', () => {
    expect(r113.map((p) => p.id)).toEqual([
      'effort',
      'warm-ups',
      'goal',
      'short-on-time',
      'measurements',
      'feel-today',
      'progress-photos',
      'learn-cards',
    ]);
    expect(Object.fromEntries(r113.map((p) => [p.id, p.tryIt]))).toEqual({
      effort: 'today',
      'warm-ups': 'today',
      goal: 'settings/goal',
      'short-on-time': 'coach',
      measurements: 'fuel/measurements',
      'feel-today': 'today',
      'progress-photos': 'settings/progressPhotos',
      'learn-cards': 'coach',
    });
  });

  it('1.13.0 says what stays optional or off: effort, body fat / lean mass, photos', () => {
    const text = (id: string) => {
      const p = r113.find((x) => x.id === id);
      return `${p?.what} ${p?.why}`;
    };
    expect(text('effort')).toMatch(/optional/i);
    expect(text('measurements')).toMatch(/body fat/i);
    expect(text('measurements')).toMatch(/lean mass/i);
    expect(text('measurements')).toMatch(/iPhone app/);
    expect(text('progress-photos')).toMatch(/off until you turn them on/i);
  });

  const r114 = WHATS_NEW_PAGES.filter((p) => p.release === '1.14.0');

  it('has five pages for 1.14.0 covering slice 2 (Apple coach, mic, voice, reminders, check-in)', () => {
    expect(Object.fromEntries(r114.map((p) => [p.id, p.tryIt]))).toEqual({
      'chat-freely': 'coach',
      'hold-to-talk': 'coach',
      'speak-replies': 'settings/coach',
      reminders: 'settings/reminders',
      'check-in': 'coach',
    });
    expect(r114.map((p) => p.id)).toEqual([
      'chat-freely',
      'hold-to-talk',
      'speak-replies',
      'reminders',
      'check-in',
    ]);
  });

  it('1.14.0 says the model runs on the phone, reminders start off, and the rules fallback', () => {
    const text = (id: string) => {
      const p = r114.find((x) => x.id === id);
      return `${p?.title} ${p?.what} ${p?.why}`;
    };
    expect(text('chat-freely')).toMatch(/on this phone|on your phone|on-device/i);
    expect(text('chat-freely')).toMatch(/quick replies/i);
    expect(text('hold-to-talk')).toMatch(/hold/i);
    expect(text('speak-replies')).toMatch(/Speak replies/);
    expect(text('reminders')).toMatch(/off until you turn them on/i);
    expect(text('check-in')).toMatch(/energy/i);
    // No platform field: iPhone-only pages say so, like "Chat freely".
    for (const id of ['chat-freely', 'hold-to-talk', 'speak-replies', 'reminders'])
      expect(r114.find((x) => x.id === id)?.what, id).toMatch(/^In the iPhone app, /);
    // The session reminder comes at the time you pick on training days (not "before").
    expect(text('reminders')).toMatch(/time you pick on training days/i);
    expect(text('reminders')).not.toMatch(/before a training day/i);
  });

  const r115 = WHATS_NEW_PAGES.filter((p) => p.release === '1.15.0');

  it('has four pages for 1.15.0 (M13): new look, About + privacy, Story, owner tools (owner only)', () => {
    expect(r115.map((p) => [p.id, p.tryIt, p.owner])).toEqual([
      ['new-look', 'today', undefined],
      ['about', 'settings/about', undefined],
      ['story', 'calendar', undefined],
      ['owner-tools', 'settings/about', true],
    ]);
  });

  it('1.15.0 says what stays on the phone and how owner tools open', () => {
    const text = (id: string) => {
      const p = r115.find((x) => x.id === id);
      return `${p?.title} ${p?.what} ${p?.why}`;
    };
    expect(text('about')).toMatch(/stays on this phone/i);
    expect(text('about')).toMatch(/not medical advice/i);
    expect(text('story')).toMatch(/Story/);
    expect(text('story')).toMatch(/nothing is (uploaded|sent)/i);
    expect(text('owner-tools')).toMatch(/7 times/);
    expect(text('owner-tools')).toMatch(/version/i);
  });

  it('marks only the to-dos page (1.12.0) and owner tools (1.15.0) owner-only', () => {
    expect(WHATS_NEW_PAGES.filter((p) => p.owner).map((p) => `${p.release}/${p.id}`)).toEqual([
      '1.12.0/todos',
      '1.15.0/owner-tools',
    ]);
    for (const p of WHATS_NEW_PAGES) expect(p.owner === undefined || p.owner === true).toBe(true);
  });

  const r1151 = WHATS_NEW_PAGES.filter((p) => p.release === '1.15.1');

  it('has two pages for 1.15.1 (M13b): Next arm and the camera set-up card, for everyone', () => {
    expect(r1151.map((p) => [p.id, p.tryIt, p.owner])).toEqual([
      ['next-arm', 'today', undefined],
      ['setup-card', 'today', undefined],
    ]);
  });

  it('1.15.1 says right then left, the Next arm button, both counts and which one counts', () => {
    const text = (id: string) => {
      const p = r1151.find((x) => x.id === id);
      return `${p?.title} ${p?.what} ${p?.why}`;
    };
    expect(text('next-arm')).toMatch(/right/i);
    expect(text('next-arm')).toMatch(/left/i);
    expect(text('next-arm')).toMatch(/Next arm/);
    expect(text('next-arm')).toMatch(/lower/i);
    expect(text('next-arm')).toMatch(/leg/i);
    expect(text('setup-card')).toMatch(/Step into frame/);
    // Second user (M13): "you", never a gendered word.
    for (const p of r1151)
      expect(`${p.title} ${p.what} ${p.why}`).not.toMatch(/\b(he|she|his|her)\b/i);
  });

  it('1.15.1 is shown after 1.15.0, and an update from 1.14.0 shows both releases, newest first', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.0' }, '1.15.0', true)).toEqual([]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.0' }, '1.15.1', true)).toEqual(r1151);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.14.0' }, '1.15.1', true, false)).toEqual([
      ...r1151,
      ...r115.filter((p) => !p.owner),
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.15.1')).toEqual(r1151);
    expect(replayPages(WHATS_NEW_PAGES, '1.15.0')).toEqual(r115);
    expect(addedTopics(TODO_TOPICS, tourReleases(r1151), true).map((t) => t.id)).toEqual([
      'one-arm-sets',
    ]);
  });

  const r116 = WHATS_NEW_PAGES.filter((p) => p.release === '1.16.0');

  it('has seven pages for 1.16.0 (M13c), for everyone, each with its Try it and icon', () => {
    expect(r116.map((p) => [p.id, p.tryIt, p.icon, p.owner])).toEqual([
      ['moving-glow', 'settings', 'palette', undefined],
      ['search', 'today', 'list', undefined],
      ['tap-badge', 'today', 'play', undefined],
      ['abs', 'coach', 'dumbbell', undefined],
      ['coach-plan', 'coach', 'chat', undefined],
      ['food-photo-library', 'fuel', 'camera', undefined],
      ['voice-list', 'settings', 'speaker', undefined],
    ]);
  });

  it('1.16.0 describes what ships: glow + Plain, search scope, badges, abs by choice, plan, photo', () => {
    const text = (id: string) => {
      const p = r116.find((x) => x.id === id);
      return `${p?.title} ${p?.what} ${p?.why}`;
    };
    // Moving glow on the home screens, black workout screens, Plain in Settings, Reduce Motion.
    expect(text('moving-glow')).toMatch(/glow/i);
    expect(text('moving-glow')).toMatch(/workout screens stay black/i);
    expect(text('moving-glow')).toMatch(/\bPlain\b/);
    expect(text('moving-glow')).toMatch(/Settings/);
    expect(text('moving-glow')).toMatch(/Reduce Motion/);
    // Search everything (bundled + your own data on this phone) and the Library.
    for (const w of [
      /exercises/i,
      /settings/i,
      /learn cards/i,
      /foods/i,
      /workouts/i,
      /chats?/i,
      /meals/i,
    ])
      expect(text('search')).toMatch(w);
    expect(text('search')).toMatch(/Library/);
    expect(text('search')).toMatch(/on this phone/i);
    expect(text('search')).toMatch(/nothing is sent/i);
    // Badges: 3D demo, Camera with Practice, Learning, before a workout; nothing starts.
    for (const w of [
      /3D demo/,
      /Camera/,
      /Learning/,
      /Practice/,
      /before a workout/i,
      /saves nothing/i,
    ])
      expect(text('tap-badge')).toMatch(w);
    // Abs only by choice: Abs & core focus, "add abs" with another focus, the first questions.
    expect(text('abs')).toMatch(/Abs & core/);
    expect(text('abs')).toMatch(/another focus/i);
    expect(text('abs')).toMatch(/only when you choose/i);
    expect(text('abs')).toMatch(/first questions/i);
    // The coach knows the plan; the Claude card only explains, nothing is sent.
    expect(text('coach-plan')).toMatch(/your plan/i);
    expect(text('coach-plan')).toMatch(/weekly sets/i);
    expect(text('coach-plan')).toMatch(/when it plans/i);
    // M13c review: only one brain answers "what is my plan missing", so the page doesn't promise it.
    expect(text('coach-plan')).not.toMatch(/missing/i);
    expect(text('coach-plan')).toMatch(/Claude/);
    expect(text('coach-plan')).toMatch(/nothing is sent/i);
    // Photo from the library: both buttons, same recognition, on this phone.
    expect(text('food-photo-library')).toMatch(/Take photo/);
    expect(text('food-photo-library')).toMatch(/Choose from library/);
    expect(text('food-photo-library')).toMatch(/on this phone/i);
    // The voice list folds into one row.
    expect(text('voice-list')).toMatch(/one row/i);
    expect(text('voice-list')).toMatch(/Test voice/);
  });

  it('1.16.0 pages say "you", never he or she, and promise nothing medical', () => {
    for (const p of r116) {
      const all = `${p.title} ${p.what} ${p.why}`;
      expect(all, p.id).not.toMatch(/\b(he|she|his|her|him|hers|wife|husband)\b/i);
      expect(all, p.id).not.toMatch(/\b(cure|heal|prevent|guarantee|clinically)\b/i);
    }
  });

  it('1.16.0 is shown after 1.15.1; an update from 1.15.0 shows both, newest first, and the K3 to-do', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.1' }, '1.15.1', true)).toEqual([]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.1' }, '1.16.0', true)).toEqual(r116);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.0' }, '1.16.0', true)).toEqual([
      ...r116,
      ...r1151,
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.16.0')).toEqual(r116);
    expect(replayPages(WHATS_NEW_PAGES, '1.15.1')).toEqual(r1151);
    expect(addedTopics(TODO_TOPICS, tourReleases(r116), true).map((t) => t.id)).toEqual([
      'library-abs',
    ]);
    // Owner mode off: the same pages (none is owner-only), no to-do.
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.1' }, '1.16.0', true, false)).toEqual(
      r116,
    );
    expect(addedTopics(TODO_TOPICS, tourReleases(r116), false)).toEqual([]);
  });

  const r1161 = WHATS_NEW_PAGES.filter((p) => p.release === '1.16.1');

  // 1.16.1 (built as 1.15.2) "Coach acts": change requests go to the rules' Apply card straight
  // away (route.ts).
  it('has one page for 1.16.1: the coach acts faster, for everyone, Try it in Coach', () => {
    expect(r1161.map((p) => [p.id, p.tryIt, p.owner, p.title])).toEqual([
      ['coach-acts', 'coach', undefined, 'Coach acts faster'],
    ]);
    const text = `${r1161[0]?.what} ${r1161[0]?.why}`;
    expect(text).toMatch(/Apply/);
    expect(text).toMatch(/Apple Intelligence/);
    expect(text).not.toMatch(/\b(he|she|his|her)\b/i);
  });

  it('1.16.1 is shown after 1.16.0; from 1.15.1 both show, newest first; no new to-do topic', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.0' }, '1.16.0', true)).toEqual([]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.0' }, '1.16.1', true)).toEqual(r1161);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.15.1' }, '1.16.1', true, false)).toEqual([
      ...r1161,
      ...r116,
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.16.1')).toEqual(r1161);
    expect(addedTopics(TODO_TOPICS, tourReleases(r1161), true)).toEqual([]);
  });

  const r1162 = WHATS_NEW_PAGES.filter((p) => p.release === '1.16.2');

  // 1.16.2 "Coach facts": own-number questions answered from saved data in code (brain/facts.ts).
  it('has one page for 1.16.2: the coach gets your numbers right, for everyone, Try it in Coach', () => {
    expect(r1162.map((p) => [p.id, p.tryIt, p.owner, p.title])).toEqual([
      ['coach-facts', 'coach', undefined, 'Coach gets your numbers right'],
    ]);
    const text = `${r1162[0]?.what} ${r1162[0]?.why}`;
    expect(text).toMatch(/your own logs/);
    expect(text).toMatch(/on this phone/);
    expect(text).not.toMatch(/\b(he|she|his|her)\b/i);
  });

  it('1.16.2 is shown after 1.16.1; from 1.16.0 both show, newest first; no new to-do topic', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.1' }, '1.16.2', true)).toEqual(r1162);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.0' }, '1.16.2', true, false)).toEqual([
      ...r1162,
      ...r1161,
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.16.2')).toEqual(r1162);
    expect(addedTopics(TODO_TOPICS, tourReleases(r1162), true)).toEqual([]);
  });

  const r1163 = WHATS_NEW_PAGES.filter((p) => p.release === '1.16.3');

  // 1.16.3 M13d "Easier first run": units, easier reading, swipes, round buttons (SPEC M13d Goal 6).
  it('has four pages for 1.16.3 (M13d), for everyone, each with its Try it and icon', () => {
    expect(r1163.map((p) => [p.id, p.title, p.tryIt, p.icon, p.owner])).toEqual([
      ['units', 'Pick your units', 'settings', 'ruler', undefined],
      ['text-size', 'Bigger, clearer text', 'settings', 'text', undefined],
      ['swipe-back', 'Swipe back', 'settings/about', 'back', undefined],
      ['round-buttons', 'Rounder buttons', 'today', 'spark', undefined],
    ]);
  });

  it('1.16.3 describes what ships: units + the switch by the field, Text size, swipes, buttons', () => {
    const text = (id: string) => {
      const p = r1163.find((x) => x.id === id);
      return `${p?.title} ${p?.what} ${p?.why}`;
    };
    // Units: both choices as the Units page names them, Settings → Units, the switch by the field,
    // and history is never converted.
    for (const w of [/\bkg\b/, /\blb\b/, /\bcm\b/, /ft·in/, /Settings/, /\bUnits\b/])
      expect(text('units')).toMatch(w);
    expect(text('units')).toMatch(/switch them right where you type a number/);
    expect(text('units')).toMatch(/history stays/i);
    // Reading: the phone's own font, more space, Settings → Display → Text size (Large / Larger).
    expect(text('text-size')).toMatch(/own font/i);
    expect(text('text-size')).toMatch(/space/i);
    for (const w of [/Settings/, /Display/, /Text size/, /\bLarge\b/, /\bLarger\b/])
      expect(text('text-size')).toMatch(w);
    // Swipes: the edge swipe is iPhone-app wording; pages, sheets and the meal Delete too.
    expect(r1163.find((p) => p.id === 'swipe-back')?.what).toMatch(/^In the iPhone app, /);
    expect(text('swipe-back')).toMatch(/left edge/i);
    expect(text('swipe-back')).toMatch(/go back/i);
    expect(text('swipe-back')).toMatch(/sideways between these pages/i);
    expect(text('swipe-back')).toMatch(/down to close a sheet/i);
    expect(text('swipe-back')).toMatch(/left on a meal/i);
    expect(text('swipe-back')).toMatch(/Delete/);
    // Buttons: round, the word under the circle (beside it on the main one), a light tap in the
    // iPhone app on the main ones. The press dip is off in a workout and with Reduce Motion, so the
    // page never promises a dip; and most words sit under the circle, not "next to" every one.
    expect(text('round-buttons')).toMatch(/round/i);
    expect(text('round-buttons')).toMatch(/word under the circle/i);
    expect(text('round-buttons')).toMatch(/beside the main one/i);
    expect(text('round-buttons')).toMatch(/press/i);
    expect(text('round-buttons')).toMatch(/iPhone app/);
    expect(text('round-buttons')).toMatch(/main ones give a light tap/i);
    expect(text('round-buttons')).not.toMatch(/\bdips?\b|same word|next to each/i);
  });

  it('1.16.3 pages fit the M13d budget: one short sentence each for what and why, one idea', () => {
    const words = (s: string) => s.split(/\s+/).filter((w) => w !== '').length;
    for (const p of r1163) {
      for (const s of [p.what, p.why]) {
        expect(sentences(s), s).toHaveLength(1);
        expect(words(s), s).toBeLessThanOrEqual(18);
        expect(s.length, s).toBeLessThanOrEqual(100);
      }
      expect(p.title.length, p.id).toBeLessThanOrEqual(24);
      // Readability budget (SPEC M13d Accept: ≤ 70 words on a What's New page); kept far under.
      expect(words(`${p.title} ${p.what} ${p.why}`), p.id).toBeLessThanOrEqual(40);
    }
  });

  it('1.16.3 pages say "you", never he or she, and promise nothing medical', () => {
    const GENDERED =
      /\b(he|him|his|himself|she|her|hers|herself|man|men|guy|guys|wife|husband|boys?|girls?)\b/i;
    for (const p of r1163) {
      const all = `${p.title} ${p.what} ${p.why}`;
      expect(all, p.id).not.toMatch(GENDERED);
      expect(all, p.id).toMatch(/\byou(r)?\b/i);
      expect(all, p.id).not.toMatch(/\b(cure|heal|prevent|guarantee|clinically|injur\w*)\b/i);
      for (const s of [p.title, p.what, p.why])
        expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
    }
  });

  it('1.16.3 is shown after 1.16.2 and kept back before; from 1.16.1 both show, newest first', () => {
    // Still 1.16.2 (before main bumps APP_RELEASE): nothing new to show.
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.2' }, '1.16.2', true)).toEqual([]);
    expect(replayPages(WHATS_NEW_PAGES, '1.16.2')).toEqual(r1162);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.2' }, '1.16.3', true)).toEqual(r1163);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.1' }, '1.16.3', true, false)).toEqual([
      ...r1163,
      ...r1162,
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.16.3')).toEqual(r1163);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.16.3' }, '1.16.3', true)).toEqual([]);
    // A fresh install (the K4 reinstall) sees the first run, not this tour.
    expect(tourToShow(WHATS_NEW_PAGES, {}, '1.16.3', false)).toEqual({ markSeen: true });
    // Owner mode on: the tour adds the Checkpoint K4 to-do; off: no to-do.
    expect(addedTopics(TODO_TOPICS, tourReleases(r1163), true).map((t) => t.id)).toEqual([
      'easier-first-run',
    ]);
    expect(addedTopics(TODO_TOPICS, tourReleases(r1163), false)).toEqual([]);
  });

  it('holds only releases 1.12.0 to 1.16.3, every page in one of them', () => {
    expect(
      r112.length +
        r113.length +
        r114.length +
        r115.length +
        r1151.length +
        r116.length +
        r1161.length +
        r1162.length +
        r1163.length,
    ).toBe(WHATS_NEW_PAGES.length);
  });

  describe('owner mode (M13)', () => {
    const ids = (r: WhatsNewPage[] | { markSeen: true }) =>
      Array.isArray(r) ? r.map((p) => p.id) : r;

    it('owner on: the 1.15.0 tour has every page, the to-dos page and the full version', () => {
      const shown = tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.14.0' }, '1.15.0', true, true);
      expect(shown).toEqual(r115);
      const added = addedTopics(TODO_TOPICS, tourReleases(r115), true).map((t) => t.id);
      expect(added).toEqual(['published-look']);
      expect(tourVersion(true, '1.15.0', 'abc1234')).toBe('Version 1.15.0 (build abc1234)');
    });

    it('owner on: identical to the 1.14.0 behaviour for earlier releases', () => {
      for (const [seen, current] of [
        ['1.11.0', '1.14.0'],
        ['1.12.0', '1.14.0'],
        ['1.13.0', '1.14.0'],
        ['1.11.0', '1.12.0'],
      ] as const) {
        expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: seen }, current, true, true)).toEqual(
          tourToShow(WHATS_NEW_PAGES, { seenRelease: seen }, current, true),
        );
        expect(replayPages(WHATS_NEW_PAGES, current, true)).toEqual(
          replayPages(WHATS_NEW_PAGES, current),
        );
      }
      expect(ids(tourToShow(WHATS_NEW_PAGES, {}, '1.12.0', true, true))).toContain('todos');
    });

    it('owner off: no owner pages, no to-dos page, no build hash', () => {
      const shown = tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.11.0' }, '1.15.0', true, false);
      expect(Array.isArray(shown)).toBe(true);
      const list = shown as WhatsNewPage[];
      expect(list.some((p) => p.owner)).toBe(false);
      expect(ids(list)).not.toContain('todos');
      expect(ids(list)).not.toContain('owner-tools');
      expect(
        ids(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.14.0' }, '1.15.0', true, false)),
      ).toEqual(['new-look', 'about', 'story']);
      expect(replayPages(WHATS_NEW_PAGES, '1.15.0', false).map((p) => p.id)).toEqual([
        'new-look',
        'about',
        'story',
      ]);
      expect(addedTopics(TODO_TOPICS, tourReleases(list), false)).toEqual([]);
      expect(tourVersion(false, '1.15.0', 'abc1234')).toBe('Version 1.15');
      // A fresh install still sees no tour.
      expect(tourToShow(WHATS_NEW_PAGES, {}, '1.15.0', false, false)).toEqual({ markSeen: true });
    });
  });

  it('shows the 1.14.0 pages once the version is 1.14.0, and keeps them back before', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.13.0' }, '1.13.0', true)).toEqual([]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.13.0' }, '1.14.0', true)).toEqual(r114);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.12.0' }, '1.14.0', true)).toEqual([
      ...r114,
      ...r113,
    ]);
    expect(replayPages(WHATS_NEW_PAGES, '1.14.0')).toEqual(r114);
    expect(replayPages(WHATS_NEW_PAGES, '1.13.0')).toEqual(r113);
    expect(tourToShow(WHATS_NEW_PAGES, {}, '1.14.0', false)).toEqual({ markSeen: true });
  });

  it('has unique ids per release', () => {
    const keys = WHATS_NEW_PAGES.map((p) => `${p.release}/${p.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses valid semver releases', () => {
    for (const p of WHATS_NEW_PAGES) {
      expect(p.release).toMatch(/^\d+\.\d+\.\d+$/);
      // A release with pages is a new MINOR (patch 0); the exceptions are 1.15.1 (M13b, Decision
      // "One-arm sets": Next arm ships as a patch so M12 slice 3 keeps 1.16.0), 1.16.1 and 1.16.2
      // ("Coach acts", a fix on top of 1.16.0), and 1.16.3 (M13d, Decision "M13d answers" q1: a
      // patch before M14 1.17.0).
      if (!['1.15.1', '1.16.1', '1.16.2', '1.16.3'].includes(p.release))
        expect(p.release.endsWith('.0'), p.release).toBe(true);
      expect(compareReleases(p.release, '1.12.0')).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps what and why to at most 2 short sentences each, title short', () => {
    for (const p of WHATS_NEW_PAGES) {
      expect(p.title.length, p.id).toBeLessThanOrEqual(32);
      for (const s of [p.what, p.why]) {
        expect(s.trim(), p.id).not.toBe('');
        expect(sentences(s).length, s).toBeLessThanOrEqual(2);
        expect(s.length, s).toBeLessThanOrEqual(140);
      }
    }
  });

  it('every string passes checkCopy', () => {
    for (const p of WHATS_NEW_PAGES)
      for (const s of [p.title, p.what, p.why])
        expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
  });

  it('every page has a known Try it route', () => {
    for (const p of WHATS_NEW_PAGES) {
      expect(p.tryIt, p.id).toBeDefined();
      expect(isAppRoute(p.tryIt ?? ''), p.id).toBe(true);
    }
    expect(r112.find((p) => p.id === 'todos')?.tryIt).toBe('todos');
    expect(r112.find((p) => p.id === 'calendar')?.tryIt).toBe('calendar');
    expect(r112.find((p) => p.id === 'coach-tab')?.tryIt).toBe('coach');
  });

  it('is what an update from before 1.12.0 shows', () => {
    expect(tourToShow(WHATS_NEW_PAGES, {}, '1.12.0', true)).toEqual(r112);
  });

  it('keeps the 1.13.0 pages back while the app is still 1.12.0', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.12.0' }, '1.12.0', true)).toEqual([]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.11.0' }, '1.12.0', true)).toEqual(r112);
    expect(replayPages(WHATS_NEW_PAGES, '1.12.0')).toEqual(r112);
  });

  it('shows the 1.13.0 pages once the version is 1.13.0', () => {
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.12.0' }, '1.13.0', true)).toEqual(r113);
    // Skipped 1.12.0: one tour, newest release first.
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.11.0' }, '1.13.0', true)).toEqual([
      ...r113,
      ...r112,
    ]);
    expect(tourToShow(WHATS_NEW_PAGES, { seenRelease: '1.13.0' }, '1.13.0', true)).toEqual([]);
    expect(replayPages(WHATS_NEW_PAGES, '1.13.0')).toEqual(r113);
    // A fresh install sees no tour at all.
    expect(tourToShow(WHATS_NEW_PAGES, {}, '1.13.0', false)).toEqual({ markSeen: true });
  });
});
