import { describe, expect, it } from 'vitest';
import { isAppRoute } from '../../core/todo/routes';
import { checkCopy } from '../../core/trainer/replies';
import { compareReleases, tourToShow } from '../../core/todo/whatsNew';
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
});
