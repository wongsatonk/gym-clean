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
 * - Each day is then trimmed to the session length (`fitToMinutes`, no pairing): accessory sets,
 *   then the last accessories; the main lifts last.
 * - Out-of-range answers, or a gym that can do nothing, give an empty plan (the action refuses).
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
import { fitToMinutes } from './estimate';
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
type DayDef = { id: string; name: string; slots: { slot: string; main?: boolean }[] };

/** The shape `buildStarterPlan` reads (the JSON file fits). */
export type StarterTemplates = {
  byDays: Record<string, { split: string; rotation: string[] }>;
  trainWeekdays: Record<string, number[]>;
  days: Record<string, DayDef>;
  slots: Record<string, SlotDef>;
  prescription: Record<GoalKind, Record<SlotKind, { reps: number[]; restSec: number }>>;
  sets: Record<Intake['experience'], Record<SlotKind, number>>;
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

  const days: ProgramDay[] = [];
  for (const key of split.rotation) {
    const def = templates.days[key];
    if (!def) continue;
    const rows: PlannedExercise[] = [];
    const main: string[] = [];
    const inDay = new Set<string>();
    for (const s of def.slots) {
      const e = pick(s.slot, inDay);
      if (!e) continue;
      inDay.add(e.id);
      rows.push(rowFor(e, s.main ? 'main' : 'accessory'));
      if (s.main) main.push(e.id);
    }
    const first = rows[0];
    if (!first) continue;
    const fit = fitToMinutes(rows, {
      minutes: intake.sessionMin,
      main: main.length > 0 ? main : [first.exerciseId],
      minSets: templates.easyOn.minSets,
    });
    for (const r of fit.rows) used.add(r.exerciseId);
    days.push({ id: def.id, name: def.name, exercises: fit.rows });
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
