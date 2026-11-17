/**
 * M13 Story-size share (SPEC M13 goal 7, Decision "M13 Published look"): the month's positive
 * numbers and which one leads the image. Pure; `today` (ms) is passed in.
 *
 * - `sessionsDone`: finished sessions that started in the month (local time, not after `today`)
 *   with at least one working set. Rest-day extras count: it is a "what I did" number.
 * - `volumeKg`: Σ reps × kg of those sessions' working sets (warm-ups out, same sum as `stats.sessionVolume`).
 *   Shown only when picked as the lead; never per-lift weights.
 * - `streakWeeks`: `stats.weeklyStreak` as of the month's last moment, or `today` for the current
 *   month, so a past month's image keeps the streak it had then.
 * - Leads: sessions (default), volume, streak; a lead whose number is 0 is never offered.
 */
import { STREAK_MIN_PER_WEEK, isFinished, weeklyStreak } from '../stats';
import type { SetLog, ShareLead, ShareStats } from '../types';
import { toUnit, type Unit } from '../units';
import { isWarmup } from '../warmup';

/** `SessionRow` fits. */
export type ShareSession = {
  sessionId: string;
  dayId: string;
  startedAt: number;
  endedAt?: number;
};
export type ShareSet = Pick<SetLog, 'sessionId' | 'reps' | 'weightKg' | 'warmup'>;

/** In the order the preview offers them. */
export const SHARE_LEADS: readonly ShareLead[] = ['sessions', 'volume', 'streak'];

/** [first ms, last ms] of a local calendar month 'YYYY-MM'. */
function monthRange(month: string): [number, number] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  const y = Number(m?.[1]);
  const mo = Number(m?.[2]);
  if (!m || mo < 1 || mo > 12) throw new RangeError(`Month must be YYYY-MM, got "${month}"`);
  return [new Date(y, mo - 1, 1).getTime(), new Date(y, mo, 1).getTime() - 1];
}

export function shareStats(
  month: string,
  sessions: readonly ShareSession[],
  sets: readonly ShareSet[],
  today: number,
): ShareStats {
  const [from, to] = monthRange(month);
  const asOf = Math.min(today, to);
  const setsBySession = new Map<string, ShareSet[]>();
  for (const s of sets) {
    if (isWarmup(s)) continue;
    const list = setsBySession.get(s.sessionId);
    if (list) list.push(s);
    else setsBySession.set(s.sessionId, [s]);
  }
  let sessionsDone = 0;
  let volumeKg = 0;
  for (const s of sessions) {
    if (!isFinished(s) || s.startedAt < from || s.startedAt > asOf) continue;
    const working = setsBySession.get(s.sessionId);
    if (!working?.length) continue;
    sessionsDone++;
    for (const w of working) volumeKg += w.reps * w.weightKg;
  }
  const streakWeeks = asOf < from ? 0 : weeklyStreak(sessions, asOf, STREAK_MIN_PER_WEEK);
  return { sessionsDone, volumeKg, streakWeeks };
}

const numberOf = (lead: ShareLead, s: ShareStats): number =>
  lead === 'sessions' ? s.sessionsDone : lead === 'volume' ? s.volumeKg : s.streakWeeks;

/** The leads the preview may offer: those whose number is above 0, sessions first. */
export function leadOptions(stats: ShareStats): ShareLead[] {
  return SHARE_LEADS.filter((l) => numberOf(l, stats) > 0);
}

/**
 * The lead to show: `wanted` when it is offered, else sessions, else the first offered one;
 * null when every number is 0 (the image then leads with the month grid alone).
 */
export function pickLead(stats: ShareStats, wanted?: ShareLead): ShareLead | null {
  const offered = leadOptions(stats);
  if (wanted !== undefined && offered.includes(wanted)) return wanted;
  return offered[0] ?? null;
}

const whole = (n: number) => Math.round(n).toLocaleString('en-US');

/** The big number and the line under it, e.g. { value: '12', label: 'sessions done' }. */
export function shareLeadText(
  lead: ShareLead,
  stats: ShareStats,
  unit: Unit,
): { value: string; label: string } {
  if (lead === 'volume')
    return { value: whole(toUnit(stats.volumeKg, unit)), label: `${unit} lifted` };
  if (lead === 'streak') {
    const n = stats.streakWeeks;
    return { value: whole(n), label: n === 1 ? 'week in a row' : 'weeks in a row' };
  }
  const n = stats.sessionsDone;
  return { value: whole(n), label: n === 1 ? 'session done' : 'sessions done' };
}
