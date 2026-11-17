import { describe, expect, it } from 'vitest';
import { isAppRoute } from '../../core/todo/routes';
import { checkCopy } from '../../core/trainer/replies';
import { compareReleases, replayPages, tourToShow } from '../../core/todo/whatsNew';
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
  });

  it('holds only releases 1.12.0, 1.13.0 and 1.14.0, every page in one of them', () => {
    expect(r112.length + r113.length + r114.length).toBe(WHATS_NEW_PAGES.length);
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
      // A release with pages is a new MINOR (patch 0).
      expect(p.release.endsWith('.0')).toBe(true);
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
