/**
 * M13 task 34: a demo profile for the store-style screenshots (SPEC M13 goal 7; Decision "M13
 * Published look": "Store screenshots use a made-up demo profile (a generated backup restored by
 * the script), never his data").
 *
 * `buildDemoBackup(now)` returns a backup file (src/data/backup.ts, passes `validateBackup`) for a
 * fictional person with no name: about 6 weeks of 3-day full-body training from the 1.13 starter
 * plan, a lift goal, a focus block running now, the intake answers, Fuel targets, a week of food
 * days, weigh-ins, tape measurements and weekly check-ins, with owner mode off and first launch
 * done. Every number is made up and built from `now` (no clock read, no randomness), so the same
 * moment always gives the same file. The coach chat is not in backups; the screenshot script sends
 * chips for that screen.
 *
 * Not imported by the app (a test checks): only `scripts/screenshots.mjs --store` uses it.
 */
import type { BackupFile, BackupTable } from '../backup';
import { BACKUP_FORMAT, BACKUP_VERSION } from '../backup';
import {
  bodyAreaOf,
  catalogExercises,
  defaultGymProfile,
  exerciseName,
  gymCanDo,
} from '../catalog';
import { GymDb, type SessionRow } from '../db';
import { NUTRITION_DEFAULTS } from '../../core/nutrition/targets';
import { buildFocusBlock } from '../../core/trainer/focusBlock';
import { addDate, localDate, weekdayOf, type PlanSession } from '../../core/trainer/plan';
import { buildStarterPlan } from '../../core/trainer/starterPlan';
import type { TrainerCatalog } from '../../core/trainer/swapCandidates';
import type {
  CheckIn,
  DayFeel,
  FoodEntry,
  Goal,
  Intake,
  Measurement,
  NutritionSettings,
  Onboarding,
  OwnerMode,
  PlannedExercise,
  SetLog,
  TrainerState,
  WeighIn,
} from '../../core/types';

const DAY_MS = 86_400_000;
/** How far back the training history goes. */
const WEEKS = 6;

export type DemoOptions = {
  /** Written as the tour's seen release, so a restore shows no tour over the screenshots. */
  release?: string;
  /** `db.verno` of the app the file is for (default: this build's schema). */
  dexieVersion?: number;
};

/** Local time `hh:mm` on a YYYY-MM-DD date, as ms. */
function at(date: string, hh: number, mm = 0): number {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

/** Monday of the week that holds `date` (the check-in week key). */
function mondayOf(date: string): string {
  return addDate(date, -((weekdayOf(date) + 6) % 7));
}

// ---------- the made-up person ----------

/** What the fictional person answered at first launch (no goal text: nothing personal). */
const INTAKE: Omit<Intake, 'at'> = {
  goalKind: 'muscle',
  days: 3,
  sessionMin: 45,
  experience: 'some',
  easyOn: [],
};

/**
 * Made-up body numbers for Fuel targets: deliberately round placeholder values (170 cm, born 1990,
 * 70 kg) so they read as demo data and match no one, not a profile of anyone close to home.
 */
const BODY: Pick<NutritionSettings, 'heightCm' | 'birthYear' | 'sex' | 'activity'> = {
  heightCm: 170,
  birthYear: 1990,
  sex: 'male',
  activity: 'moderate',
};
/** Weigh-ins drift up slowly from here over the 6 weeks (kg). */
const START_KG = 70;

/** First-week working weight by equipment (kg; per dumbbell for dumbbells), and its step. */
const LOAD: Record<string, { kg: number; step: number }> = {
  dumbbell: { kg: 8, step: 1 },
  kettlebells: { kg: 12, step: 2 },
  barbell: { kg: 30, step: 2.5 },
  cable: { kg: 20, step: 2.5 },
  machine: { kg: 25, step: 5 },
};

/** A week of meals, by slot (quick estimates; one is skipped on some days). */
const MEALS: readonly {
  slot: FoodEntry['slot'];
  hh: number;
  label: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}[] = [
  {
    slot: 'breakfast',
    hh: 8,
    label: 'Oats with banana and milk',
    kcal: 420,
    proteinG: 16,
    carbsG: 68,
    fatG: 9,
  },
  { slot: 'lunch', hh: 12, label: 'Chicken rice', kcal: 610, proteinG: 32, carbsG: 74, fatG: 19 },
  {
    slot: 'snack',
    hh: 16,
    label: 'Greek yogurt and berries',
    kcal: 190,
    proteinG: 17,
    carbsG: 22,
    fatG: 3,
  },
  {
    slot: 'dinner',
    hh: 19,
    label: 'Stir-fried pork with basil, rice',
    kcal: 650,
    proteinG: 30,
    carbsG: 70,
    fatG: 26,
  },
];

// ---------- builder ----------

/** The app's catalog wired as a TrainerCatalog for the default gym (as src/ui/app.ts does). */
function demoCatalog(): TrainerCatalog {
  const gym = defaultGymProfile();
  return {
    exercises: catalogExercises(),
    areaOf: bodyAreaOf,
    canDo: (id) => gymCanDo(id, gym),
  };
}

const equipmentOf = (catalog: TrainerCatalog, id: string): string =>
  catalog.exercises.find((e) => e.id === id)?.equipment ?? 'body only';

/** The working weight of `p` in week `w` (0 = the first week): a step up every 2 weeks. */
function weightFor(catalog: TrainerCatalog, p: PlannedExercise, w: number): number {
  if (p.startWeightKg === 0) return 0;
  const load = LOAD[equipmentOf(catalog, p.exerciseId)];
  return load ? load.kg + load.step * Math.floor(w / 2) : 0;
}

export function buildDemoBackup(now: number, opts: DemoOptions = {}): BackupFile {
  const catalog = demoCatalog();
  const today = localDate(now);
  const first = addDate(today, -(WEEKS * 7 - 1));
  const startAt = at(first, 7) - DAY_MS;

  // Plan: the starter plan for the intake answers, with a starting weight on every row (the
  // starter plan leaves weights to the person; these are the demo's latest working weights).
  const intake: Intake = { ...INTAKE, at: startAt };
  const starter = buildStarterPlan(intake, catalog, catalog);
  const rest = new Set(starter.schedule.restWeekdays);
  const rotation = starter.schedule.rotation;
  const dayOf = (id: string) => starter.plan.days.find((d) => d.id === id);

  // Sessions: every training weekday of the last 6 weeks before today, in rotation, with one
  // missed day in week 3 (real weeks aren't perfect).
  const sessions: SessionRow[] = [];
  const sets: SetLog[] = [];
  let next = 0;
  let trainingDays = 0;
  for (let date = first; date < today; date = addDate(date, 1)) {
    if (rest.has(weekdayOf(date))) continue;
    trainingDays++;
    if (trainingDays === 8) continue;
    const dayId = rotation[next % rotation.length];
    const day = dayId === undefined ? undefined : dayOf(dayId);
    if (!dayId || !day) continue;
    next++;
    const w = Math.floor((at(date, 12) - at(first, 12)) / (7 * DAY_MS));
    const sessionId = `demo-${date}`;
    let t = at(date, 18, 10);
    const startedAt = t;
    let volume = 0;
    let count = 0;
    for (const p of day.exercises) {
      const kg = weightFor(catalog, p, w);
      const [lo, hi] = p.targetReps;
      for (let i = 0; i < p.sets; i++) {
        const reps = Math.min(hi, lo + ((w + i) % (hi - lo + 1)));
        const rest = i === 0 ? 120 : p.restSec;
        t += rest * 1000;
        sets.push({
          sessionId,
          exerciseId: p.exerciseId,
          setIndex: i,
          reps,
          weightKg: kg,
          restTakenSec: rest,
          restTargetSec: p.restSec,
          startedAt: t,
          endedAt: t + 40_000,
          ...(i === p.sets - 1 && { effort: w % 2 === 0 ? ('hard' as const) : ('good' as const) }),
        });
        t += 40_000;
        volume += reps * kg;
        count++;
      }
    }
    sessions.push({
      sessionId,
      dayId,
      startedAt,
      endedAt: t + 60_000,
      setsDone: count,
      totalVolumeKg: Math.round(volume * 10) / 10,
      restOverruns: 0,
    });
  }

  // The plan carries the latest working weights.
  const lastWeek = WEEKS - 1;
  const days = starter.plan.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((p) => ({ ...p, startWeightKg: weightFor(catalog, p, lastWeek) })),
  }));
  const base: TrainerState = {
    version: 4,
    plan: { ...starter.plan, days, edited: true },
    schedule: starter.schedule,
    overrides: [],
    easyOn: [],
  };

  // A 4-week back focus block that started last week.
  const weekdays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !rest.has(d));
  const planSessions: PlanSession[] = sessions.map((s) => ({
    sessionId: s.sessionId,
    dayId: s.dayId,
    startedAt: s.startedAt,
    ...(s.endedAt !== undefined && { endedAt: s.endedAt }),
  }));
  const block = buildFocusBlock(
    base,
    catalog,
    { group: 'back', weeks: 4, weekdays, startDate: mondayOf(addDate(today, -7)) },
    planSessions,
  );
  const state: TrainerState = { ...base, blocks: [block] };

  // A lift goal on the first main lift: two steps above today's weight, due in 8 weeks.
  const main = days[0]?.exercises.find((p) => (p.startWeightKg ?? 0) > 0);
  const goals: Goal[] = [];
  if (main) {
    const load = LOAD[equipmentOf(catalog, main.exerciseId)];
    const value = (main.startWeightKg ?? 0) + 2 * (load?.step ?? 1);
    goals.push({
      id: 'demo-goal-1',
      text: `${exerciseName(main.exerciseId)}: ${value} kg for 8`,
      target: { kind: 'lift', ref: main.exerciseId, value, reps: 8 },
      due: addDate(today, 56),
      createdAt: startAt,
    });
  }

  // Fuel: targets, the last 7 days of food (today so far), weigh-ins every 3–4 days.
  const nutrition: NutritionSettings = {
    ...NUTRITION_DEFAULTS,
    gainPctPerWeek: [...NUTRITION_DEFAULTS.gainPctPerWeek],
    ...BODY,
    mode: 'full',
    goalKind: INTAKE.goalKind,
  };
  const foodEntries: FoodEntry[] = [];
  for (let k = 6; k >= 0; k--) {
    const date = addDate(today, -k);
    MEALS.forEach((m, i) => {
      if (k % 3 === 1 && m.slot === 'snack') return;
      const time = at(date, m.hh, 15);
      if (time > now) return;
      foodEntries.push({
        id: `demo-food-${date}-${i}`,
        date,
        time,
        slot: m.slot,
        label: m.label,
        amount: { servings: 1 },
        estimate: true,
        kcal: m.kcal,
        proteinG: m.proteinG,
        carbsG: m.carbsG,
        fatG: m.fatG,
      });
    });
  }
  const weighIns: WeighIn[] = [];
  for (let k = 0, date = first; date <= today; k++, date = addDate(date, k % 2 === 0 ? 3 : 4)) {
    weighIns.push({ date, kg: Math.round((START_KG + 0.06 * k) * 10) / 10 });
  }
  const measurements: Measurement[] = [];
  for (let wk = 0; wk < WEEKS; wk += 2) {
    const date = addDate(first, wk * 7);
    measurements.push({ date, site: 'waist', cm: 80 - wk * 0.1 });
    measurements.push({ date, site: 'hips', cm: 95 + wk * 0.2 });
  }
  const checkIns: CheckIn[] = [1, 2, 3].map((n) => {
    const weekStart = mondayOf(addDate(today, -7 * n));
    return {
      weekStart,
      energy: n === 2 ? 3 : 4,
      sleep: 4,
      soreness: n === 1 ? 3 : 2,
      at: at(addDate(weekStart, 6), 20),
    };
  });
  const dayFeels: DayFeel[] = [{ date: today, energy: 4 }];

  const ownerMode: OwnerMode = { on: false, setAt: startAt, by: 'user' };
  const onboarding: Onboarding = { doneAt: startAt };
  const settings = [
    { key: 'unit', value: 'kg' },
    { key: 'ownerMode', value: ownerMode },
    { key: 'onboarding', value: onboarding },
    { key: 'intake', value: intake },
    { key: 'nutrition', value: nutrition },
    ...(opts.release ? [{ key: 'whatsNew', value: { seenRelease: opts.release } }] : []),
  ];

  const tables: Partial<Record<BackupTable, unknown[]>> = {
    sessions,
    sets,
    settings,
    trainer: [{ key: 'current', state }],
    goals,
    foodEntries,
    weighIns,
    measurements,
    checkIns,
    dayFeels,
  };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    dexieVersion: opts.dexieVersion ?? new GymDb('gym-clean-demo-schema').verno,
    appVersion: 'demo',
    createdAt: now,
    tables,
  };
}
