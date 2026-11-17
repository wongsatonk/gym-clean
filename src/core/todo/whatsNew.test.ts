import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TodoTopic, WhatsNewPage } from '../types';
import {
  RESIGN_WINDOW_DAYS,
  addedTopics,
  compareReleases,
  replayPages,
  resignDaysLeft,
  tourReleases,
  tourToShow,
} from './whatsNew';

// Made-up pages and topics only (public repo).
const page = (release: string, id: string): WhatsNewPage => ({
  release,
  id,
  title: `Title ${id}`,
  what: 'What changed.',
  why: 'Why it helps.',
});

const PAGES: WhatsNewPage[] = [
  page('1.12.0', 'a'),
  page('1.12.0', 'b'),
  page('1.13.0', 'c'),
  page('1.14.0', 'd'),
  page('1.14.0', 'e'),
];

const topic = (id: string, since: string): TodoTopic => ({
  id,
  title: id,
  since,
  platform: 'any',
  steps: [],
});

describe('compareReleases', () => {
  it('compares semver parts as numbers', () => {
    expect(compareReleases('1.12.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareReleases('1.12.0', '1.12.0')).toBe(0);
    expect(compareReleases('1.12.0', '1.12.1')).toBeLessThan(0);
    expect(compareReleases('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('reads a missing part as 0', () => {
    expect(compareReleases('1.12', '1.12.0')).toBe(0);
  });
});

describe('tourToShow', () => {
  it('shows the current release pages when it is unseen', () => {
    const out = tourToShow(PAGES, { seenRelease: '1.11.0' }, '1.12.0', true);
    expect(out).toEqual([PAGES[0], PAGES[1]]);
  });

  it('shows nothing when the current release was seen', () => {
    expect(tourToShow(PAGES, { seenRelease: '1.12.0' }, '1.12.0', true)).toEqual([]);
  });

  it('shows nothing for a patch after a seen minor (no pages of its own)', () => {
    expect(tourToShow(PAGES, { seenRelease: '1.12.0' }, '1.12.1', true)).toEqual([]);
  });

  it('marks a fresh install seen without showing anything', () => {
    expect(tourToShow(PAGES, {}, '1.12.0', false)).toEqual({ markSeen: true });
  });

  it('shows the tour to a user with data but no whatsNew row yet (updating from before 1.12.0)', () => {
    expect(tourToShow(PAGES, {}, '1.12.0', true)).toEqual([PAGES[0], PAGES[1]]);
  });

  it('a seen row without data is not a fresh install: unseen pages still show', () => {
    expect(tourToShow(PAGES, { seenRelease: '1.12.0' }, '1.13.0', false)).toEqual([PAGES[2]]);
  });

  it('puts every unseen release in one tour, newest first, page order kept within a release', () => {
    const out = tourToShow(PAGES, { seenRelease: '1.12.0' }, '1.14.0', true);
    expect(out).toEqual([PAGES[3], PAGES[4], PAGES[2]]);
  });

  it('never shows pages from a release newer than the running one', () => {
    expect(tourToShow(PAGES, { seenRelease: '1.11.0' }, '1.13.0', true)).toEqual([
      PAGES[2],
      PAGES[0],
      PAGES[1],
    ]);
  });

  it('a release without pages shows nothing', () => {
    expect(tourToShow(PAGES, { seenRelease: '1.14.0' }, '1.15.0', true)).toEqual([]);
    expect(tourToShow([], {}, '1.12.0', true)).toEqual([]);
  });
});

describe('tourReleases', () => {
  it('lists the releases a tour covers, newest first, once each', () => {
    expect(tourReleases([PAGES[3], PAGES[4], PAGES[2]] as WhatsNewPage[])).toEqual(['1.14.0', '1.13.0']);
    expect(tourReleases([])).toEqual([]);
  });
});

describe('replayPages', () => {
  it('replays the running release', () => {
    expect(replayPages(PAGES, '1.13.0')).toEqual([PAGES[2]]);
  });

  it('falls back to the newest release with pages up to the running one (a patch)', () => {
    expect(replayPages(PAGES, '1.14.2')).toEqual([PAGES[3], PAGES[4]]);
    expect(replayPages(PAGES, '1.12.9')).toEqual([PAGES[0], PAGES[1]]);
  });

  it('is empty when no release up to the running one has pages', () => {
    expect(replayPages(PAGES, '1.11.0')).toEqual([]);
  });
});

describe('addedTopics', () => {
  it('lists the topics added in the given releases, in data order', () => {
    const topics = [topic('x', '1.12.0'), topic('y', '1.13.0'), topic('z', '1.12.0')];
    expect(addedTopics(topics, ['1.12.0']).map((t) => t.id)).toEqual(['x', 'z']);
    expect(addedTopics(topics, ['1.13.0', '1.12.0']).map((t) => t.id)).toEqual(['x', 'y', 'z']);
    expect(addedTopics(topics, ['1.14.0'])).toEqual([]);
  });
});

describe('resignDaysLeft', () => {
  const at = (y: number, mo: number, d: number, h = 12, mi = 0) =>
    new Date(y, mo - 1, d, h, mi).getTime();

  it('has a 7-day window', () => {
    expect(RESIGN_WINDOW_DAYS).toBe(7);
  });

  it('counts local calendar days since the build was first seen', () => {
    const first = at(2026, 11, 16, 9);
    expect(resignDaysLeft(first, at(2026, 11, 16, 23))).toBe(7);
    expect(resignDaysLeft(first, at(2026, 11, 17, 0, 5))).toBe(6);
    expect(resignDaysLeft(first, at(2026, 11, 20))).toBe(3);
    expect(resignDaysLeft(first, at(2026, 11, 21))).toBe(2);
    expect(resignDaysLeft(first, at(2026, 11, 23))).toBe(0);
  });

  it('never goes below 0 and clamps a clock that went backwards to the full window', () => {
    const first = at(2026, 11, 16);
    expect(resignDaysLeft(first, at(2026, 12, 30))).toBe(0);
    expect(resignDaysLeft(first, at(2026, 11, 10))).toBe(7);
  });

  describe('across a DST change', () => {
    let tz: string | undefined;
    beforeAll(() => {
      tz = process.env.TZ;
      process.env.TZ = 'America/New_York'; // DST starts 2026-03-08, ends 2026-11-01
    });
    afterAll(() => {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    });

    it('spring forward: 3 local days is 3, though only 2 days 11.5 h passed', () => {
      const first = at(2026, 3, 7, 12);
      const now = at(2026, 3, 10, 0, 30);
      expect(now - first).toBeLessThan(3 * 86_400_000);
      expect(resignDaysLeft(first, now)).toBe(4);
      // The warning boundary: 3 left on day 4, 2 left on day 5.
      expect(resignDaysLeft(first, at(2026, 3, 11, 0, 30))).toBe(3);
      expect(resignDaysLeft(first, at(2026, 3, 12, 0, 30))).toBe(2);
    });

    it('fall back: a 25-hour day still counts as one day', () => {
      const first = at(2026, 10, 31, 23, 30);
      const now = at(2026, 11, 1, 23, 45);
      expect(now - first).toBeGreaterThan(86_400_000);
      expect(resignDaysLeft(first, now)).toBe(6);
      expect(resignDaysLeft(first, at(2026, 11, 4, 23, 59))).toBe(3);
      expect(resignDaysLeft(first, at(2026, 11, 5, 0, 1))).toBe(2);
    });
  });
});
