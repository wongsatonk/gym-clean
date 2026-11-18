/**
 * M12 1b starter plan from templates (SPEC M12 trainer kit item 3, Decision "Second user").
 * Pure and deterministic: the same intake, catalog and gym always give the same plan. Nothing
 * here knows a person or an exercise: the split, the slots, sets / reps / rest and every word
 * come from src/data/templates/starterTemplates.json; the picks come from the catalog.
 *
 * - Split by training days a week (`byDays`): its rotation of day templates; the other weekdays
 *   are rest weekdays (`trainWeekdays`).
 * - Each day template is a list of slots (movement patterns). A slot is filled with a catalog
 *   exercise the gym can do (`gym.canDo`) that isn't in the day yet, has a primary muscle of the
 *   slot and matches its mechanic / force when given. Order: one of the slot's `prefer` ids not
 *   used elsewhere in the plan, then a `prefer` id already used, then any other fit not used yet,
 *   then catalog order. A slot nothing fits falls back to its `orElse` slot, else it is left out.
 * - Rows: sets by experience, reps and rest by goal, 'pose' tracking only where a rule exists,
 *   weight 0 for a bodyweight move and blank otherwise (each person picks their own weight).
 * - Go-easy areas (`intake.easyOn`), like the avoid-area action: an exercise with a primary
 *   muscle in a listed area is never picked (a slot or a whole day can drop out); one that
 *   doesn't load the area at all is preferred; one where the area only helps runs lighter
 *   (one set fewer, or fewer reps for a bodyweight move; `easyOn` in the data).
 * - A day has at most the experience's `maxExercises` (the template slots in order first).
 * - Each day is then fitted to the session length (`fill` in the data), never over it and at most
 *   `fill.bandMin` minutes short unless it already is as big as the experience allows (every
 *   exercise slot used, every row at its most sets), so a beginner's long session can end
 *   shorter: a short day gets the day's `extras` slots, then one more set per row in turn (main
 *   lifts first, up to the experience's `max`; a row where a go-easy area helps stays
 *   `easyOn.setsDrop` below it); each step only when the day still fits. A day that is too long
 *   is trimmed (`fitToMinutes`, no pairing): accessory sets, then the last accessories, the main
 *   lifts last.
 * - Out-of-range answers, or a gym that can do nothing, give an empty plan (the action refuses).
 * - M13c abs: only with `intake.wantsCore` ("Add abs to your plan?" Yes), the `wantsCore` slot
 *   joins the split's listed days right after their main lifts (data: `wantsCore`). No other
 *   path adds abs: no other slot lists the abdominals.
 */
import templatesJson from '../../data/templates/starterTemplates.json';
import type {
  BodyArea,
  Exercise,
  GoalKind,
  Intake,
  PlannedExercise,
  ProgramDay,
  Schedule,
  UserPlan,
} from '../types';
import { estimateMinutes, fitToMinutes } from './estimate';
import { programHash } from './plan';
import { loadsArea, primaryInArea, trackingFor, type TrainerCatalog } from './swapCandidates';

type SlotKind = 'main' | 'accessory';
type SlotDef = {
  muscles: string[];
  mechanic?: string;
  force?: string;
  prefer?: string[];
  orElse?: string;
};
type DayDef = {
  id: string;
  name: string;
  slots: { slot: string; main?: boolean }[];
  extras?: { slot: string }[];
};

/** The shape `buildStarterPlan` reads (the JSON file fits). */
export type StarterTemplates = {
  byDays: Record<string, { split: string; rotation: string[] }>;
  trainWeekdays: Record<string, number[]>;
  days: Record<string, DayDef>;
  slots: Record<string, SlotDef>;
  prescription: Record<GoalKind, Record<SlotKind, { reps: number[]; restSec: number }>>;
  sets: Record<Intake['experience'], Record<SlotKind | 'max' | 'maxExercises', number>>;
  fill: { bandMin: number };
  /** M13c: the abs slot and the days of each split it joins when the intake said Yes. */
  wantsCore?: { slot: string; days: Record<string, string[]> };
  easyOn: { setsDrop: number; minSets: number; bodyweightRepsFactor: number };
  bodyweightEquipment: string;
};

/** The vendored templates, with the copy the starter-plan proposal shows. */
export const STARTER_TEMPLATES = templatesJson;

export type StarterCatalog = Pick<TrainerCatalog, 'exercises' | 'areaOf' | 'hasRule'>;
export type StarterGym = Pick<TrainerCatalog, 'canDo'>;

export type StarterPlan = {
  plan: UserPlan;
  schedule: Schedule;
  /** The template split used ('fullBody', 'upperLower', 'pushPullLegs'); '' when none. */
  split: string;
};

const EMPTY = (): StarterPlan => ({
  plan: { days: [], seededFrom: 'starter:none', edited: true },
  schedule: { rotation: [], restWeekdays: [] },
  split: '',
});

export function buildStarterPlan(
  intake: Intake,
  catalog: StarterCatalog,
  gym: StarterGym,
  templates: StarterTemplates = STARTER_TEMPLATES,
): StarterPlan {
  const split = Number.isInteger(intake.days) ? templates.byDays[String(intake.days)] : undefined;
  const train = templates.trainWeekdays[String(intake.days)];
  if (!split || !train) return EMPTY();

  const easy: readonly BodyArea[] = [...new Set(intake.easyOn)];
  const rx = templates.prescription[intake.goalKind];
  const sets = templates.sets[intake.experience];
  const doable = catalog.exercises.filter((e) => gym.canDo(e.id));
  const worksEasy = (e: Exercise) => easy.some((a) => primaryInArea(e, a, catalog.areaOf));
  const helpsEasy = (e: Exercise) => easy.some((a) => loadsArea(e, a, catalog.areaOf));
  /** Exercise ids picked on earlier days of the plan. */
  const used = new Set<string>();

  const fits = (e: Exercise, def: SlotDef): boolean =>
    e.primaryMuscles.some((m) => def.muscles.includes(m)) &&
    (def.mechanic === undefined || e.mechanic === def.mechanic) &&
    (def.force === undefined || e.force === def.force);

  const pick = (slot: string, inDay: ReadonlySet<string>): Exercise | undefined => {
    const seen = new Set<string>();
    for (let name: string | undefined = slot; name !== undefined && !seen.has(name);) {
      seen.add(name);
      const def: SlotDef | undefined = templates.slots[name];
      if (!def) return undefined;
      const prefer = def.prefer ?? [];
      const scored = doable
        .filter((e) => !inDay.has(e.id) && fits(e, def) && !worksEasy(e))
        .map((e, order) => {
          const listed = prefer.includes(e.id);
          const fresh = !used.has(e.id);
          return {
            e,
            order,
            keys: [
              helpsEasy(e) ? 0 : 1,
              listed && fresh ? 1 : 0,
              listed ? 1 : 0,
              fresh ? 1 : 0,
              listed ? prefer.length - prefer.indexOf(e.id) : 0,
            ],
          };
        });
      scored.sort((a, b) => {
        for (let i = 0; i < a.keys.length; i++) {
          const d = (b.keys[i] ?? 0) - (a.keys[i] ?? 0);
          if (d !== 0) return d;
        }
        return a.order - b.order;
      });
      const best = scored[0];
      if (best) return best.e;
      name = def.orElse;
    }
    return undefined;
  };

  const rowFor = (e: Exercise, kind: SlotKind): PlannedExercise => {
    const [lo = 0, hi = lo] = rx[kind].reps;
    const row: PlannedExercise = {
      exerciseId: e.id,
      sets: sets[kind],
      targetReps: [lo, hi],
      restSec: rx[kind].restSec,
      tracking: trackingFor(e.id, catalog),
    };
    const bodyweight = e.equipment === templates.bodyweightEquipment;
    if (bodyweight) row.startWeightKg = 0;
    if (helpsEasy(e)) {
      const rule = templates.easyOn;
      if (bodyweight) {
        const r = (n: number) => Math.max(1, Math.round(n * rule.bodyweightRepsFactor));
        row.targetReps = [r(lo), r(hi)];
      } else {
        row.sets = Math.max(Math.min(row.sets, rule.minSets), row.sets - rule.setsDrop);
      }
    }
    return row;
  };

  /** The most sets a row may get when a long session is filled. */
  const capOf = (e: Exercise): number =>
    helpsEasy(e) && e.equipment !== templates.bodyweightEquipment
      ? Math.max(templates.easyOn.minSets, sets.max - templates.easyOn.setsDrop)
      : sets.max;
  const fitsIn = (rows: readonly PlannedExercise[]) =>
    estimateMinutes({ exercises: rows }) <= intake.sessionMin;

  type Built = {
    def: DayDef;
    rows: PlannedExercise[];
    caps: Map<PlannedExercise, number>;
    main: string[];
    /** M13c: the abs row asked for; trimmed like a main lift, not dropped as an accessory. */
    kept: string[];
    inDay: Set<string>;
  };
  const addTo = (
    b: Built,
    slot: string,
    kind: SlotKind,
    onlyIfFits: boolean,
    keep = false,
  ): boolean => {
    const e = pick(slot, b.inDay);
    if (!e) return false;
    const row = rowFor(e, kind);
    if (onlyIfFits && !fitsIn([...b.rows, row])) return false;
    b.inDay.add(e.id);
    used.add(e.id);
    b.rows.push(row);
    b.caps.set(row, capOf(e));
    if (kind === 'main') b.main.push(e.id);
    if (keep) b.kept.push(e.id);
    return true;
  };

  // 1. Every day's template slots first, so the picks don't depend on the session length.
  const built: Built[] = [];
  const core = intake.wantsCore === true ? templates.wantsCore : undefined;
  const coreDays = new Set(core?.days[split.split] ?? []);
  for (const key of split.rotation) {
    const def = templates.days[key];
    if (!def) continue;
    const b: Built = { def, rows: [], caps: new Map(), main: [], kept: [], inDay: new Set() };
    let slots: { slot: string; main?: boolean; keep?: boolean }[] = def.slots;
    if (core && coreDays.has(key)) {
      const at = slots.reduce((n, s, i) => (s.main ? i + 1 : n), 0);
      slots = [...slots.slice(0, at), { slot: core.slot, keep: true }, ...slots.slice(at)];
    }
    for (const s of slots) {
      if (b.rows.length >= sets.maxExercises) break;
      addTo(b, s.slot, s.main ? 'main' : 'accessory', false, s.keep === true);
    }
    if (b.rows.length > 0) built.push(b);
  }

  // 2. Fit each day: fill a short one (extras, then sets, then the other extras, then sets
  //    again), trim a long one.
  const days: ProgramDay[] = [];
  for (const b of built) {
    const { rows } = b;
    const extras = [...(b.def.extras ?? [])];
    const addExtras = (upTo: number) => {
      while (extras.length > 0 && rows.length < upTo) {
        const x = extras.shift();
        if (x) addTo(b, x.slot, 'accessory', true);
      }
    };
    const addSets = () => {
      for (let grew = true; grew;) {
        grew = false;
        for (const r of rows) {
          if (r.sets >= (b.caps.get(r) ?? sets.max)) continue;
          r.sets += 1;
          if (fitsIn(rows)) grew = true;
          else r.sets -= 1;
        }
      }
    };
    if (fitsIn(rows)) {
      addExtras(sets.maxExercises);
      addSets();
      // A set that didn't fit may leave room for one more exercise below the cap, and the
      // other way round.
      addExtras(sets.maxExercises);
      addSets();
    }
    const first = rows[0]?.exerciseId ?? '';
    const fit = fitToMinutes(rows, {
      minutes: intake.sessionMin,
      main: [...(b.main.length > 0 ? b.main : [first]), ...b.kept],
      minSets: templates.easyOn.minSets,
    });
    days.push({ id: b.def.id, name: b.def.name, exercises: fit.rows });
  }
  if (days.length === 0) return { ...EMPTY(), split: split.split };

  const seed = programHash({ name: split.split, weightUnit: 'kg', days });
  return {
    plan: { days, seededFrom: `starter:${seed}`, edited: true },
    schedule: {
      rotation: days.map((d) => d.id),
      restWeekdays: [0, 1, 2, 3, 4, 5, 6].filter((d) => !train.includes(d)),
    },
    split: split.split,
  };
}
