/**
 * M12 focus block builder (SPEC M12 goal 6, Decision "M12 plan"). Pure and deterministic: the
 * app writes the block from his plan, his gym kit and the rules in focusRules.ts; a brain only
 * picks the params. Same input → identical block (and id).
 *
 * - Dates: 7 × `weeks` consecutive dates from `startDate`; block week k = dates 7k … 7k + 6, so a
 *   mid-week start still has every weekday once per block week.
 * - Days: his rotation, from the day that would run next on `startDate`, cycled over the chosen
 *   weekdays; the other dates are rest (`day: null`).
 * - Focus group (an exercise counts when all its primary muscles are in the group): the weekly
 *   target is `round(base × 1.4)` kept inside ×1.3–1.5, where base = the group's sets over one
 *   rotation × weekdays / rotation length. Each block week is filled to the target:
 *   1. the group trains on ≥ 2 days (a focus exercise added to the lightest days without it);
 *   2. focus rows +1 set each, spread over the days (per-row and per-session caps);
 *   3. more focus exercises on the lightest days while short;
 *   4. trimmed back toward the band's top, only on rows it added or bumped and never below his
 *      own sets, so a week his own days already put over the band keeps his plan as is.
 *   Added exercises come from the catalog (group only, `canDo`, not already in the day), his
 *   plan's exercises first, ones not yet used that week first; sets / reps / rest are copied from
 *   that exercise's plan row, else the most similar focus row in his plan.
 * - Other groups' rows are never touched, so their weekly sets are unchanged.
 * - The last week is lighter: every row gets the M10 lighter set rule and `adjusted: 'lighter'`.
 * - M12 1b standing go-easy list (`state.easyOn`): added exercises (and swaps in revisions) never
 *   load a listed area, and rows that load one are never bumped.
 */
import { LIGHTER } from './actions/lighter';
import { easyCatalog, easyOnArea } from './actions/avoidArea';
import { FOCUS_RULES } from './focusRules';
import { addDate, blockLastDate, localDate, pendingAt, weekdayOf, type PlanSession } from './plan';
import {
  muscleOverlap,
  swapCandidates,
  swappedRow,
  trackingFor,
  type TrainerCatalog,
} from './swapCandidates';
import type {
  BodyArea,
  Exercise,
  FocusBlock,
  FocusBlockParams,
  FocusGroup,
  PlannedExercise,
  ProgramDay,
  TrainerState,
} from '../types';

export type FocusEdit =
  | { swap: { date?: string; weekday?: number; exerciseId: string; toId?: string } }
  | { daysPerWeek: number }
  | { weeks: number };

export type ReviseResult = { ok: true; block: FocusBlock } | { ok: false; reply: string };

type Cat = Pick<TrainerCatalog, 'exercises' | 'areaOf'>;

// ---------- counting ----------

function areasOf(exerciseId: string, catalog: Cat): Set<BodyArea> {
  const e = catalog.exercises.find((x) => x.id === exerciseId);
  const out = new Set<BodyArea>();
  for (const m of e?.primaryMuscles ?? []) {
    const a = catalog.areaOf(m);
    if (a) out.add(a);
  }
  return out;
}

/** Whether every primary muscle of the exercise is in the group (a focus exercise). */
export function isFocusExercise(exerciseId: string, group: FocusGroup, catalog: Cat): boolean {
  const e = catalog.exercises.find((x) => x.id === exerciseId);
  if (!e || e.primaryMuscles.length === 0) return false;
  return e.primaryMuscles.every((m) => catalog.areaOf(m) === group);
}

/** Sets of the rows that are focus exercises for the group. */
export function focusSetsOf(
  rows: readonly PlannedExercise[],
  group: FocusGroup,
  catalog: Cat,
): number {
  return rows.reduce((n, p) => n + (isFocusExercise(p.exerciseId, group, catalog) ? p.sets : 0), 0);
}

/** Sets of the rows with any primary muscle in the area. */
export function groupSetsOf(
  rows: readonly PlannedExercise[],
  area: BodyArea,
  catalog: Cat,
): number {
  return rows.reduce((n, p) => n + (areasOf(p.exerciseId, catalog).has(area) ? p.sets : 0), 0);
}

const totalSets = (rows: readonly PlannedExercise[]) => rows.reduce((n, p) => n + p.sets, 0);

// ---------- params ----------

/** The default training weekdays (0 = Sunday) for `n` days a week (3–6). */
export function weekdaysFor(n: number): number[] {
  const w = FOCUS_RULES.defaultWeekdays[n];
  if (!w) throw new RangeError(`No default weekdays for ${n} days`);
  return [...w];
}

const inRange = (n: number, r: { min: number; max: number }) =>
  Number.isInteger(n) && n >= r.min && n <= r.max;

export function validWeeks(n: number): boolean {
  return inRange(n, FOCUS_RULES.weeks);
}

export function validDaysPerWeek(n: number): boolean {
  return inRange(n, FOCUS_RULES.weekdays);
}

function validate(p: FocusBlockParams): void {
  if (!validWeeks(p.weeks)) throw new RangeError(`weeks must be 2–6, got ${p.weeks}`);
  const days = new Set(p.weekdays);
  if (
    days.size !== p.weekdays.length ||
    !p.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    !validDaysPerWeek(days.size)
  )
    throw new RangeError(`weekdays must be 3–6 distinct days, got ${p.weekdays.join(',')}`);
  addDate(p.startDate, 0); // throws on a bad date
}

/**
 * "Keep my days": the weekdays he trains now. His rest weekdays' complement when that is 3–6
 * days; else his most-trained weekdays over the last 4 weeks (count = sessions per week, 3–6);
 * else the 5-day default.
 */
export function keepMyWeekdays(
  state: TrainerState,
  sessions: readonly PlanSession[],
  today: string,
): number[] {
  const rest = new Set(state.schedule.restWeekdays);
  const open = [0, 1, 2, 3, 4, 5, 6].filter((d) => !rest.has(d));
  if (rest.size > 0 && validDaysPerWeek(open.length)) return open;
  const from = addDate(today, -FOCUS_RULES.historyDays);
  const counts = new Array<number>(7).fill(0);
  let total = 0;
  for (const s of sessions) {
    if (s.endedAt === undefined) continue;
    const date = localDate(s.startedAt);
    if (date < from || date >= today) continue;
    counts[weekdayOf(date)] = (counts[weekdayOf(date)] ?? 0) + 1;
    total++;
  }
  if (total === 0) return weekdaysFor(5);
  const weeks = FOCUS_RULES.historyDays / 7;
  const n = Math.min(
    FOCUS_RULES.weekdays.max,
    Math.max(FOCUS_RULES.weekdays.min, Math.round(total / weeks)),
  );
  const pref = weekdaysFor(n);
  // Monday first, Sunday last for ties.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const ranked = [...order].sort(
    (a, b) =>
      (counts[b] ?? 0) - (counts[a] ?? 0) ||
      Number(pref.includes(b)) - Number(pref.includes(a)) ||
      order.indexOf(a) - order.indexOf(b),
  );
  return ranked.slice(0, n).sort((a, b) => a - b);
}

/**
 * The block's last date: start + 7 × weeks − 1, or earlier when a newer block cut it short (its
 * `days` then end the day before the newer block; see `cutBlock`).
 */
export function blockEnd(
  b: Pick<FocusBlock, 'startDate' | 'weeks'> & { days?: FocusBlock['days'] },
): string {
  return blockLastDate(b);
}

/**
 * The block ending the day before `date` (id, params and past days kept, so its focus marks and
 * scores stay); null when it has no date before `date`.
 */
export function cutBlock(b: FocusBlock, date: string): FocusBlock | null {
  if (b.startDate >= date) return null;
  if (blockEnd(b) < date) return b;
  return { ...b, days: b.days.filter((d) => d.date < date) };
}

/** Blocks that don't overlap `from`…`to` (inclusive). */
export function blocksOutside(
  blocks: readonly FocusBlock[] | undefined,
  from: string,
  to: string,
): FocusBlock[] {
  return (blocks ?? []).filter((b) => blockEnd(b) < from || b.startDate > to);
}

// ---------- building ----------

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function withId(b: Omit<FocusBlock, 'id'>): FocusBlock {
  const key = JSON.stringify([b.group, b.startDate, b.weeks, b.weekdays, b.days]);
  return { id: `focus-${b.startDate}-${fnv(key)}`, ...b };
}

/** Lexicographic a > b. */
function greater(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

type Work = {
  date: string;
  day: ProgramDay;
  baseFocus: number;
  baseTotal: number;
  bumped: Set<number>;
  /** Rows the builder added or bumped → the fewest sets a trim may leave them. */
  floor: Map<number, number>;
};

export function buildFocusBlock(
  state: TrainerState,
  kit: TrainerCatalog,
  params: FocusBlockParams,
  sessions: readonly PlanSession[] = [],
): FocusBlock {
  validate(params);
  const easy = state.easyOn ?? [];
  const catalog = easyCatalog(kit, easy);
  const R = FOCUS_RULES;
  const { group, weeks, startDate } = params;
  const weekdays = [...new Set(params.weekdays)].sort((a, b) => a - b);
  const planDay = (id: string) => state.plan.days.find((d) => d.id === id);
  const rotation = state.schedule.rotation.filter((id) => planDay(id) !== undefined);
  if (rotation.length === 0) throw new RangeError('The rotation is empty');

  const end = addDate(startDate, weeks * 7 - 1);
  const free: TrainerState = { ...state, blocks: blocksOutside(state.blocks, startDate, end) };
  const pending = pendingAt(free, sessions, startDate);
  let ptr = Math.max(0, pending === null ? 0 : rotation.indexOf(pending));

  // The focus group's base weekly sets and the target band.
  const perRotation = rotation.reduce(
    (n, id) => n + focusSetsOf(planDay(id)?.exercises ?? [], group, catalog),
    0,
  );
  const base = (perRotation * weekdays.length) / rotation.length;
  const EPS = 1e-9;
  let target: number;
  let hi: number;
  if (base > 0) {
    const lo = Math.ceil(base * R.minFactor - EPS);
    hi = Math.max(lo, Math.floor(base * R.maxFactor + EPS));
    target = Math.min(hi, Math.max(lo, Math.round(base * R.setsFactor)));
  } else {
    target = R.emptyBaseSets;
    hi = R.emptyBaseSets + R.minAddedSets;
  }

  // Candidates for added work: his plan's focus exercises first (plan order), then the catalog.
  const planIds = [
    ...new Set(state.plan.days.flatMap((d) => d.exercises.map((p) => p.exerciseId))),
  ];
  const focusPlanRows = state.plan.days
    .flatMap((d) => d.exercises)
    .filter((p) => isFocusExercise(p.exerciseId, group, catalog));
  const pool = catalog.exercises
    .filter((e) => isFocusExercise(e.id, group, catalog) && catalog.canDo(e.id))
    .map((e, order) => ({ e, order, inPlan: planIds.indexOf(e.id) }))
    .sort((a, b) => {
      const pa = a.inPlan < 0 ? Infinity : a.inPlan;
      const pb = b.inPlan < 0 ? Infinity : b.inPlan;
      return pa - pb || a.order - b.order;
    })
    .map((x) => x.e);

  const templateFor = (e: Exercise): PlannedExercise => {
    const own = state.plan.days.flatMap((d) => d.exercises).find((p) => p.exerciseId === e.id);
    if (own) {
      const row = structuredClone(own);
      delete row.adjusted;
      delete row.weightKgToday;
      return row;
    }
    const byId = (id: string) => catalog.exercises.find((x) => x.id === id);
    let best: { p: PlannedExercise; keys: number[] } | null = null;
    for (const p of focusPlanRows) {
      const x = byId(p.exerciseId);
      if (!x) continue;
      const keys = [
        muscleOverlap(e.primaryMuscles, x.primaryMuscles),
        muscleOverlap(e.secondaryMuscles, x.secondaryMuscles),
        e.equipment === x.equipment ? 1 : 0,
      ];
      if (!best || greater(keys, best.keys)) best = { p, keys };
    }
    const d = R.defaultRow;
    const tpl: PlannedExercise = best
      ? best.p
      : {
          exerciseId: e.id,
          sets: d.sets,
          targetReps: [d.targetReps[0], d.targetReps[1]],
          restSec: d.restSec,
          tracking: 'manual',
        };
    return swappedRow(tpl, { exercise: e, tracking: trackingFor(e.id, catalog) }, {});
  };

  const days: FocusBlock['days'] = [];
  for (let w = 0; w < weeks; w++) {
    const work: Work[] = [];
    const weekDays: FocusBlock['days'] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDate(startDate, w * 7 + i);
      if (!weekdays.includes(weekdayOf(date))) {
        weekDays.push({ date, day: null });
        continue;
      }
      const src = planDay(rotation[ptr % rotation.length] ?? '');
      ptr = (ptr + 1) % rotation.length;
      if (!src) {
        weekDays.push({ date, day: null });
        continue;
      }
      const day = structuredClone(src);
      work.push({
        date,
        day,
        baseFocus: focusSetsOf(day.exercises, group, catalog),
        baseTotal: totalSets(day.exercises),
        bumped: new Set(),
        floor: new Map(),
      });
      weekDays.push({ date, day });
    }
    fillWeek(work);
    if (w === weeks - 1) {
      for (const x of work) {
        x.day.exercises = x.day.exercises.map((p) => ({
          ...p,
          sets: Math.max(Math.min(p.sets, LIGHTER.minSets), p.sets - LIGHTER.setsDrop),
          adjusted: 'lighter',
        }));
      }
    }
    days.push(...weekDays);
  }

  function fillWeek(work: Work[]): void {
    const focusOf = (x: Work) => focusSetsOf(x.day.exercises, group, catalog);
    const focusCap = (x: Work) => Math.max(x.baseFocus, R.maxFocusSetsPerSession);
    const totalCap = (x: Work) => Math.max(x.baseTotal, R.maxSetsPerSession);
    const room = (x: Work) =>
      Math.min(focusCap(x) - focusOf(x), totalCap(x) - totalSets(x.day.exercises));
    let s = work.reduce((n, x) => n + focusOf(x), 0);
    const used = new Set(work.flatMap((x) => x.day.exercises.map((p) => p.exerciseId)));

    const pick = (x: Work): Exercise | undefined => {
      const inDay = new Set(x.day.exercises.map((p) => p.exerciseId));
      const ok = pool.filter((e) => !inDay.has(e.id));
      return ok.find((e) => !used.has(e.id)) ?? ok[0];
    };
    const lightest = (ok: (x: Work) => boolean): Work | undefined =>
      work
        .filter((x) => ok(x) && room(x) >= R.minAddedSets && pick(x) !== undefined)
        .sort((a, b) => totalSets(a.day.exercises) - totalSets(b.day.exercises))[0];
    const add = (x: Work, need: number) => {
      const e = pick(x);
      if (!e) return;
      const row = templateFor(e);
      const max = Math.min(row.sets, room(x), R.maxSetsPerExercise);
      row.sets = Math.max(R.minAddedSets, Math.min(max, need));
      x.day.exercises.push(row);
      x.bumped.add(x.day.exercises.length - 1);
      x.floor.set(x.day.exercises.length - 1, R.minAddedSets);
      used.add(e.id);
      s += row.sets;
    };

    // 1. At least minFocusDays days with the group.
    for (;;) {
      const days = work.filter((x) => focusOf(x) > 0).length;
      if (days >= R.minFocusDays) break;
      const x = lightest((y) => focusOf(y) === 0);
      if (!x) break;
      add(x, Math.max(R.minAddedSets, target - s));
    }
    // 2. +1 set per focus row, one row per day per round.
    for (let changed = true; changed && s < target;) {
      changed = false;
      for (const x of work) {
        if (s >= target) break;
        const i = x.day.exercises.findIndex(
          (p, k) =>
            !x.bumped.has(k) &&
            p.sets < R.maxSetsPerExercise &&
            isFocusExercise(p.exerciseId, group, catalog) &&
            easyOnArea(p.exerciseId, easy, catalog) === undefined,
        );
        if (i < 0 || room(x) < 1) continue;
        const row = x.day.exercises[i];
        if (!row) continue;
        x.floor.set(i, row.sets);
        row.sets += 1;
        x.bumped.add(i);
        s += 1;
        changed = true;
      }
    }
    // 3. More focus exercises on the lightest days.
    while (s < target) {
      const x = lightest(() => true);
      if (!x) break;
      add(x, target - s);
    }
    // 4. Over the band's top: −1 set from the biggest row the builder added or bumped, never
    //    below his own sets (a bumped row) or minAddedSets (an added one). His own rows stay.
    while (s > hi) {
      let best: PlannedExercise | undefined;
      for (const x of work)
        for (const [i, floor] of x.floor) {
          const p = x.day.exercises[i];
          if (p && p.sets > floor && (!best || p.sets > best.sets)) best = p;
        }
      if (!best) break;
      best.sets -= 1;
      s -= 1;
    }
  }

  return withId({
    group,
    startDate,
    weeks,
    weekdays,
    days,
    targetSetsPerWeek: target,
    baseSetsPerWeek: Math.round(base),
  });
}

// ---------- revisions ----------

const paramsOf = (b: FocusBlock): FocusBlockParams => ({
  group: b.group,
  weeks: b.weeks,
  weekdays: [...b.weekdays],
  startDate: b.startDate,
});

function nameOf(catalog: Cat, id: string): string {
  return catalog.exercises.find((e) => e.id === id)?.name ?? id.replace(/_/g, ' ');
}

/**
 * A revised block: `{ weeks }` / `{ daysPerWeek }` rebuild it (same group and start; days on the
 * default weekdays for that count); `{ swap }` replaces an exercise on one date or on every
 * block date of a weekday, keeping its sets, reps and rest (`toId`, else the best swap the gym
 * can do).
 */
export function reviseFocusBlock(
  block: FocusBlock,
  edit: FocusEdit,
  state: TrainerState,
  catalog: TrainerCatalog,
  sessions: readonly PlanSession[] = [],
): ReviseResult {
  if ('weeks' in edit) {
    if (!validWeeks(edit.weeks)) return { ok: false, reply: 'A focus block runs 2 to 6 weeks.' };
    return {
      ok: true,
      block: buildFocusBlock(state, catalog, { ...paramsOf(block), weeks: edit.weeks }, sessions),
    };
  }
  if ('daysPerWeek' in edit) {
    if (!validDaysPerWeek(edit.daysPerWeek))
      return { ok: false, reply: 'A focus block trains 3 to 6 days a week.' };
    return {
      ok: true,
      block: buildFocusBlock(
        state,
        catalog,
        { ...paramsOf(block), weekdays: weekdaysFor(edit.daysPerWeek) },
        sessions,
      ),
    };
  }
  const { date, weekday, exerciseId, toId } = edit.swap;
  const hits = block.days.filter(
    (d) =>
      (date === undefined || d.date === date) &&
      (weekday === undefined || weekdayOf(d.date) === weekday) &&
      d.day?.exercises.some((p) => p.exerciseId === exerciseId),
  );
  if (hits.length === 0)
    return { ok: false, reply: `There's no ${nameOf(catalog, exerciseId)} on those days.` };
  const from = catalog.exercises.find((e) => e.id === exerciseId);
  const to = toId === undefined ? undefined : catalog.exercises.find((e) => e.id === toId);
  if (toId !== undefined && !to) return { ok: false, reply: "I don't know that exercise." };
  const days = structuredClone(block.days);
  for (const h of hits) {
    const d = days.find((x) => x.date === h.date)?.day;
    if (!d) continue;
    const i = d.exercises.findIndex((p) => p.exerciseId === exerciseId);
    const row = d.exercises[i];
    if (!row) continue;
    const exclude = d.exercises.map((p) => p.exerciseId);
    const cand = to
      ? { exercise: to, tracking: trackingFor(to.id, catalog) }
      : from
        ? swapCandidates(from, easyCatalog(catalog, state.easyOn ?? []), {
            exclude,
            tracking: row.tracking,
            limit: 1,
          })[0]
        : undefined;
    if (!cand || exclude.includes(cand.exercise.id))
      return { ok: false, reply: `No good swap for ${nameOf(catalog, exerciseId)} with your kit.` };
    const next = swappedRow(row, cand, {});
    if (row.adjusted) next.adjusted = row.adjusted;
    d.exercises[i] = next;
  }
  const { id: _old, ...rest } = block;
  void _old;
  return { ok: true, block: withId({ ...rest, days }) };
}
