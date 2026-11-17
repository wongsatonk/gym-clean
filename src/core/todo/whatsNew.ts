/**
 * M12 slice 1c: which What's New pages to show, and the 7-day re-sign clock (SPEC M12 "What's New
 * tour + To-do guides"). Pure: the stored state, the running release and the time are passed in.
 *
 * - The tour key is the release (package.json `version`, semver). Pages are data per release.
 * - Fresh install (no data and no 'whatsNew' row): nothing changed for him, so the tour is marked
 *   seen without showing.
 * - Several unseen releases: one tour with all their pages, newest release first.
 */
import type { TodoTopic, WhatsNewPage, WhatsNewState } from '../types';

/** A free Apple ID build runs for 7 days after install. */
export const RESIGN_WINDOW_DAYS = 7;

const parts = (r: string): number[] =>
  r
    .trim()
    .split('.')
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });

/** Semver order of two releases (`1.12.0` > `1.9.0`); a missing part reads as 0. */
export function compareReleases(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Pages of the given releases: newest release first, data order within a release. */
function pagesOf(pages: readonly WhatsNewPage[], keep: (release: string) => boolean): WhatsNewPage[] {
  return pages
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => keep(p.release))
    .sort((a, b) => compareReleases(b.p.release, a.p.release) || a.i - b.i)
    .map(({ p }) => p);
}

/**
 * The tour to show on app open (on Today only; the caller checks that). Returns the unseen pages
 * (releases after `state.seenRelease` up to `current`, newest first; `[]` = nothing to show), or
 * `{ markSeen: true }` for a fresh install: store `current` as seen without showing anything.
 * `hasData` = any session logged on this phone.
 */
export function tourToShow(
  pages: readonly WhatsNewPage[],
  state: WhatsNewState,
  current: string,
  hasData: boolean,
): WhatsNewPage[] | { markSeen: true } {
  const seen = state.seenRelease;
  if (seen === undefined && !hasData) return { markSeen: true };
  return pagesOf(
    pages,
    (r) =>
      compareReleases(r, current) <= 0 && (seen === undefined || compareReleases(r, seen) > 0),
  );
}

/** The releases a tour covers, newest first, once each (for `addedTopics`). */
export function tourReleases(pages: readonly WhatsNewPage[]): string[] {
  const out: string[] = [];
  for (const p of pages) if (!out.includes(p.release)) out.push(p.release);
  return out.sort((a, b) => compareReleases(b, a));
}

/**
 * Settings → What's new: the running release's pages, or, for a release without pages (a fix-only
 * patch), the newest release up to it that has some.
 */
export function replayPages(pages: readonly WhatsNewPage[], current: string): WhatsNewPage[] {
  const latest = tourReleases(pages.filter((p) => compareReleases(p.release, current) <= 0))[0];
  return latest === undefined ? [] : pagesOf(pages, (r) => r === latest);
}

/** Topics added in these releases (the tour's last page, "Added to your to-dos"), data order. */
export function addedTopics(topics: readonly TodoTopic[], releases: readonly string[]): TodoTopic[] {
  return topics.filter((t) => releases.some((r) => compareReleases(r, t.since) === 0));
}

const DAY_MS = 86_400_000;

/** Local midnight of the day that holds `ms`. */
function dayStart(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Days left before a free-Apple-ID build needs re-signing: 7 minus the local calendar days since
 * the build was first seen (DST-safe: 23 h and 25 h days count as one), clamped to 0–7.
 */
export function resignDaysLeft(buildFirstSeenAt: number, now: number): number {
  const days = Math.round((dayStart(now) - dayStart(buildFirstSeenAt)) / DAY_MS);
  return Math.min(RESIGN_WINDOW_DAYS, Math.max(0, RESIGN_WINDOW_DAYS - days));
}
