/**
 * M11: raw Health read → one `HealthDay` per local date (SPEC M11 data model). Pure.
 *
 * Input: the GymHealth plugin result (`HealthReadResult` from `src/native/health.ts`, matched
 * structurally so core never imports native code): epoch ms times, app units (kg, bpm, ms,
 * kcal, minutes), the source on every sample, sleep as per-source sessions with asleep minutes
 * summed, active energy as de-duplicated daily totals, and Gym Clean's own workouts excluded.
 *
 * Local dates use the device time zone (`localDate`), like every other date in the app.
 * Sleep minutes come from the plugin's asleep sums, never from wall-clock differences, so a DST
 * change can't add or lose an hour.
 */
import { localDate } from '../trainer/plan';
import type { HealthDay, HealthWorkout } from '../types';
import { HEALTH_RULES, type HealthRules } from './rules';

/** One sample at an instant (epoch ms). */
type Point = { start: number; source: string; bundleId?: string };
export type HealthMassPoint = Point & { kg: number };
export type HealthRestingHrPoint = Point & { bpm: number };
export type HealthHrvPoint = Point & { ms: number };
/** Active energy of one local day (HealthKit's de-duplicated daily sum across sources). */
export type HealthEnergyDayRead = { date: string; start: number; kcal: number };
/** One sleep session from one source: asleep stages summed by the plugin. */
export type HealthSleepRead = {
  start: number;
  end: number;
  asleepMin: number;
  source: string;
  bundleId?: string;
};

/**
 * The plugin result as this module reads it. Structurally the same as `HealthReadResult` in
 * `src/native/health.ts` (minus `status`), so its result can be passed straight in.
 */
export type HealthRead = {
  bodyMass?: readonly HealthMassPoint[];
  workouts?: readonly HealthWorkout[];
  activeEnergy?: readonly HealthEnergyDayRead[];
  sleep?: readonly HealthSleepRead[];
  restingHr?: readonly HealthRestingHrPoint[];
  hrv?: readonly HealthHrvPoint[];
};

const MIN = 60_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ok = (n: number): boolean => Number.isFinite(n);
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Wake-up date → minutes asleep of that date's main night. Sessions of one source closer than
 * `sleepSessionGapMin` join into one night (a night split around waking up, or around a DST
 * jump); the night belongs to the local date it ends on. Sources are never added together and a
 * nap never replaces the night: the longest night per date wins.
 */
function sleepByDate(
  sessions: readonly HealthSleepRead[],
  rules: HealthRules,
): Map<string, number> {
  const bySource = new Map<string, HealthSleepRead[]>();
  const seen = new Set<string>();
  for (const s of sessions) {
    if (!ok(s.start) || !ok(s.end) || !ok(s.asleepMin) || s.end <= s.start || s.asleepMin <= 0)
      continue;
    const key = `${s.source}|${s.start}|${s.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bySource.set(s.source, [...(bySource.get(s.source) ?? []), s]);
  }
  const best = new Map<string, number>();
  const gap = rules.sleepSessionGapMin * MIN;
  for (const list of bySource.values()) {
    let night: { asleepMin: number; end: number } | null = null;
    const close = () => {
      if (!night) return;
      const date = localDate(night.end);
      const min = Math.round(night.asleepMin);
      if (min > (best.get(date) ?? 0)) best.set(date, min);
    };
    for (const s of [...list].sort((a, b) => a.start - b.start)) {
      if (night && s.start - night.end <= gap) {
        night.asleepMin += s.asleepMin;
        night.end = Math.max(night.end, s.end);
      } else {
        close();
        night = { asleepMin: s.asleepMin, end: s.end };
      }
    }
    close();
  }
  return best;
}

/** Date → the first valid value of that local date. */
function firstPerDate<T extends Point>(
  points: readonly T[],
  value: (p: T) => number,
): Map<string, { t: number; v: number }> {
  const out = new Map<string, { t: number; v: number }>();
  for (const p of points) {
    const v = value(p);
    if (!ok(p.start) || !ok(v)) continue;
    const date = localDate(p.start);
    const cur = out.get(date);
    if (!cur || p.start < cur.t) out.set(date, { t: p.start, v });
  }
  return out;
}

/** Plain code-unit order (not locale order): the last, deterministic tie-break. */
const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * HRV per date from one source only, so the baseline stays within one source. Order of
 * preference on a date where several wrote: `prefer` (the source already stored for his recent
 * days, so a short incremental read can't flip it), then the source with data on the most dates
 * in this read, then the one with the latest sample, then code-unit order of the name.
 */
function hrvByDate(
  points: readonly HealthHrvPoint[],
  prefer: string | undefined,
): Map<string, { ms: number; source: string }> {
  const grouped = new Map<string, HealthHrvPoint[]>();
  for (const p of points) grouped.set(p.source, [...(grouped.get(p.source) ?? []), p]);
  const bySource = [...grouped].map(([source, list]) => {
    const dates = firstPerDate(list, (p) => p.ms);
    const latest = Math.max(-Infinity, ...list.map((p) => p.start).filter(ok));
    return { source, dates, latest };
  });
  bySource.sort(
    (a, b) =>
      Number(b.source === prefer) - Number(a.source === prefer) ||
      b.dates.size - a.dates.size ||
      b.latest - a.latest ||
      byCode(a.source, b.source),
  );
  const out = new Map<string, { ms: number; source: string }>();
  for (const { source, dates } of bySource) {
    for (const [date, p] of dates) if (!out.has(date)) out.set(date, { ms: round1(p.v), source });
  }
  return out;
}

/**
 * The HRV source of his stored days: the one on the most dates, ties to the one on the latest
 * date (then code-unit order). Undefined when no stored day has HRV.
 */
export function preferredHrvSource(days: readonly HealthDay[]): string | undefined {
  const stats = new Map<string, { n: number; last: string }>();
  for (const d of days) {
    if (d.hrvSource === undefined || d.hrvMs === undefined) continue;
    const cur = stats.get(d.hrvSource) ?? { n: 0, last: '' };
    stats.set(d.hrvSource, { n: cur.n + 1, last: d.date > cur.last ? d.date : cur.last });
  }
  return [...stats]
    .sort(([sa, a], [sb, b]) => b.n - a.n || byCode(b.last, a.last) || byCode(sa, sb))
    .at(0)?.[0];
}

/** Date → kcal. The plugin already sends one de-duplicated total per day; a repeat keeps the larger. */
function energyByDate(days: readonly HealthEnergyDayRead[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of days) {
    if (!ok(d.kcal) || d.kcal < 0) continue;
    const date = ISO_DATE.test(d.date) ? d.date : ok(d.start) ? localDate(d.start) : undefined;
    if (date === undefined) continue;
    out.set(date, Math.max(out.get(date) ?? 0, Math.round(d.kcal)));
  }
  return out;
}

function workoutsByDate(list: readonly HealthWorkout[]): Map<string, HealthWorkout[]> {
  const out = new Map<string, HealthWorkout[]>();
  const seen = new Set<string>();
  for (const s of list) {
    if (!ok(s.start) || !ok(s.minutes) || s.minutes <= 0) continue;
    const key = `${s.start}|${s.kind}|${s.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w: HealthWorkout = {
      start: s.start,
      minutes: Math.round(s.minutes),
      kind: s.kind,
      source: s.source,
    };
    if (s.kcal !== undefined && ok(s.kcal)) w.kcal = Math.round(s.kcal);
    if (s.avgHr !== undefined && ok(s.avgHr)) w.avgHr = Math.round(s.avgHr);
    const date = localDate(s.start);
    out.set(date, [...(out.get(date) ?? []), w]);
  }
  for (const days of out.values()) days.sort((a, b) => a.start - b.start);
  return out;
}

/** What the stored rows tell this read (see `preferredHrvSource`). */
export type HealthDaysContext = { hrvSource?: string };

/** The read as one row per local date (only dates with data), sorted by date. Never throws. */
export function healthDays(
  read: HealthRead,
  rules: HealthRules = HEALTH_RULES,
  context: HealthDaysContext = {},
): HealthDay[] {
  const rows = new Map<string, HealthDay>();
  const row = (date: string): HealthDay => {
    const r = rows.get(date) ?? { date };
    rows.set(date, r);
    return r;
  };
  for (const [date, min] of sleepByDate(read.sleep ?? [], rules)) row(date).sleepMin = min;
  for (const [date, p] of firstPerDate(read.restingHr ?? [], (r) => r.bpm))
    row(date).restingHr = Math.round(p.v);
  for (const [date, h] of hrvByDate(read.hrv ?? [], context.hrvSource))
    Object.assign(row(date), { hrvMs: h.ms, hrvSource: h.source });
  for (const [date, kcal] of energyByDate(read.activeEnergy ?? [])) row(date).activeKcal = kcal;
  for (const [date, list] of workoutsByDate(read.workouts ?? [])) row(date).workouts = list;
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
}
