// Shared domain types (SPEC §4). Pure data — no DOM or library imports.

export type LandmarkFrame = {
  t: number;
  landmarks: { x: number; y: number; z: number; visibility: number }[];
  world?: { x: number; y: number; z: number }[];
};

export type PlannedExercise = {
  exerciseId: string;
  sets: number;
  targetReps: [min: number, max: number];
  restSec: number;
  startWeightKg?: number;
  tracking: 'pose' | 'manual';
  /** M10: a lighter/deload default that wins over last time's weight. */
  weightKgToday?: number;
  /** M10: why this row differs from the plan (shown as an "Adjusted" badge). */
  adjusted?: 'lighter' | 'deload' | 'swap' | 'avoidArea';
};

export type ProgramDay = { id: string; name: string; exercises: PlannedExercise[] };

export type Program = { name: string; weightUnit: 'kg'; days: ProgramDay[] };

export type Exercise = {
  id: string;
  name: string;
  force: string | null;
  level: string;
  mechanic: string | null;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

/** M5 live-trainer cues (SPEC M5): ids only; the spoken/shown text lives in the UI. */
export type FocusCueId =
  | 'rushedLowering'
  | 'shrinkingRange'
  | 'stalled'
  | 'outOfFrame'
  | 'lowFps'
  | 'armsOutOfSync'
  | 'raiseTooHigh'
  | 'elbowDrift'
  | 'bodySwing'
  | 'hipSag';

export type SetLog = {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number;
  partials?: number;
  weightKg: number;
  restTakenSec: number;
  /** The rest target that applied before this set (plan + any +30 s), for overrun advice. */
  restTargetSec?: number;
  focusScore?: number;
  /** M5: one entry per focus/form detection in the set (ids, never text). */
  cues?: FocusCueId[];
  startedAt: number;
  endedAt: number;
};

/** Emitted by the rep counter (SPEC §3). Angles in degrees, times in ms (frame clock). */
export type RepEvent = {
  type: 'rep' | 'partial';
  /** 1-based count within its type (rep 1, 2, … / partial 1, 2, …). */
  index: number;
  eccentricMs: number;
  concentricMs: number;
  minAngle: number;
  maxAngle: number;
  /**
   * Partials only: which end was missed. 'far' = turned around before the far threshold
   * (not deep / high enough); 'start' = went to the far end but didn't return to the start.
   */
  reason?: 'far' | 'start';
  /** Partials only: degrees short of the missed threshold (≥ 0). */
  shortByDeg?: number;
  /** Frame time when the event fired. */
  t: number;
};

/** M4e accent theme (Settings); the mix README defines each colour. */
export type Accent = 'orange' | 'volt' | 'yellow';

// ---- M10 AI trainer (SPEC M10 data model) ----

/**
 * M10e: the equipment his gym has, as item ids from src/data/equipment.json, plus the exercises he
 * chose to keep in his plan despite missing kit ("Keep it"). Stored in the settings table, key 'gym'.
 */
export interface GymProfile {
  equipment: string[];
  /** Exercise ids he chose to keep despite missing kit. */
  kept: string[];
  updatedAt: number;
}

export type BodyArea = 'arms' | 'shoulders' | 'chest' | 'back' | 'legs' | 'core';

/** The user's own copy of the program; `seededFrom` is the program.json hash. */
export type UserPlan = { days: ProgramDay[]; seededFrom: string; edited: boolean };

/** `rotation` = day ids in order; `restWeekdays` uses 0 = Sunday. */
export type Schedule = { rotation: string[]; restWeekdays: number[] };

export type DayAdjust = {
  kind: 'avoidArea' | 'lighter' | 'deload' | 'swap';
  area?: BodyArea;
  /** The day as it will run. */
  exercises: PlannedExercise[];
  /**
   * Row map: every exercise id that left the day (plan rows and earlier swap-ins) with the id
   * that runs in its place now (null = removed). Older overrides have none; consumers fall back
   * to pairing rows by likeness (src/core/trainer/rows.ts).
   */
  replaced?: { fromId: string; toId: string | null }[];
};

/** `date` is local YYYY-MM-DD. */
export type DayOverride = { date: string; rest?: true; dayId?: string; adjust?: DayAdjust };

export type TrainerState = {
  version: number;
  plan: UserPlan;
  schedule: Schedule;
  overrides: DayOverride[];
};

export type ProposalAction =
  'postpone' | 'avoidArea' | 'lighter' | 'deload' | 'swap' | 'stall' | 'food';

export type Proposal = {
  action: ProposalAction;
  scope: 'today' | 'dated' | 'plan';
  title: string;
  lines: { before: string; after: string }[];
  why: string;
  say?: string;
  /** The state after Apply (validated, pure). */
  next: TrainerState;
  /** Stale if the state's version changed since. */
  baseVersion: number;
};

export type PlanChange = {
  id?: number;
  createdAt: number;
  /** 'reset' = "Reset to default program", itself undoable. */
  action: ProposalAction | 'reset';
  title: string;
  source: 'chip' | 'rules' | 'apple' | 'claude';
  before: TrainerState;
  after: TrainerState;
  undoneAt?: number;
};

// ---- M7 Fuel: nutrition (SPEC §4 M7; all stored on device only) ----

export type MacroSet = { kcal: number; proteinG: number; carbsG?: number; fatG?: number };

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'post-workout';

export type NutritionMode = 'quick' | 'full';

export type FoodSource = 'usda' | 'thai-estimate' | 'custom' | 'openfoodfacts' | 'photo-local' | 'photo-ai';

export type Food = MacroSet & {
  id: string;
  name: string;
  nameTh?: string;
  source: FoodSource;
  basis: { per100g: true } | { servingLabel: string; servingG?: number };
  /** e.g. Small 0.75 / Regular 1 / Large 1.4 */
  portions?: { label: string; factor: number }[];
  note?: string;
  /** EAN/UPC digits for a scanned or typed packaged food. */
  barcode?: string;
  /** True for quick-estimate foods (numbers are rough). */
  estimate?: boolean;
};

export type Recipe = {
  id: string;
  name: string;
  nameTh?: string;
  ingredients: { foodId: string; grams: number }[];
  servings: number;
  updatedAt: number;
};

export type FoodAmount = { servings: number } | { grams: number };

export type FoodEntry = MacroSet & {
  id: string;
  /** Local YYYY-MM-DD. */
  date: string;
  time: number;
  slot: MealSlot;
  label: string;
  ref?: { foodId?: string; recipeId?: string };
  amount: FoodAmount;
  /** Quick estimates / photo guesses. */
  estimate: boolean;
  /** M7b: set on entries logged from a photo. */
  source?: 'photo-local' | 'photo-ai';
  /** M7b: confidence of the accepted photo guess (only when the logged dish was offered). */
  photoConfidence?: number;
  /**
   * The amount and macros as first logged, set by `rescaleEntry` on the first amount edit.
   * Later edits scale from it, so repeated edits never compound rounding. Absent = never edited.
   */
  logged?: { amount: FoodAmount; macros: MacroSet };
};

/** `source` (M11): 'health' = imported from Apple Health; missing = typed by hand ('manual'). */
export type WeighIn = { date: string; kg: number; source?: 'manual' | 'health' };

export type NutritionSettings = {
  mode: NutritionMode;
  heightCm: number;
  birthYear: number;
  sex: 'male' | 'female';
  activity: 'sedentary' | 'light' | 'moderate' | 'very';
  surplusKcal: number;
  proteinGPerKg: number;
  fatPct: number;
  gainPctPerWeek: [min: number, max: number];
  overrides?: Partial<MacroSet>;
  barcodeLookup: boolean;
};

export type Favorite = {
  id: string;
  ref: { foodId: string } | { recipeId: string };
  amount: FoodAmount;
  createdAt: number;
};

/** M7b: a saved, labelled meal photo (only when "Save photos" is on; stays on the phone). */
export type FoodPhoto = {
  id: string;
  /** The `thai:*` dish id he confirmed. */
  dishId: string;
  createdAt: number;
  w: number;
  h: number;
  /** JPEG. */
  blob: Blob;
};

/** M7b: the imported food classifier (.tflite), stored in IndexedDB. One record. */
export type FoodModelRecord = {
  id: 'food';
  name: string;
  sizeBytes: number;
  labels: string[];
  importedAt: number;
  blob: Blob;
};

/** M7b: settings key 'foodVision'. Default `{ savePhotos: false }`. */
export type FoodVisionSettings = { savePhotos: boolean };

export type WeeklyCheck = {
  /** Local YYYY-MM-DD of the week's Monday. */
  weekStart: string;
  avgKg: number | null;
  prevAvgKg: number | null;
  ratePct: number | null;
  kind: 'up' | 'down' | 'onTrack' | 'needData';
  deltaKcal: number;
  outcome: 'pending' | 'accepted' | 'dismissed';
  decidedAt?: number;
};

/** A daily target value, flagged when it is an estimate (e.g. no weigh-in yet). */
export type TargetValue = { value: number; estimate: boolean };

export type NutritionTargets = {
  kcal: TargetValue;
  proteinG: TargetValue;
  carbsG: TargetValue;
  fatG: TargetValue;
};

/** Compact USDA FoodData Central row (src/data/nutrition/usda-foods.json); values per 100 g. */
export type FoodDbRow = {
  /** 'usda:<fdcId>' */
  id: string;
  name: string;
  ds: 'foundation' | 'sr' | 'fndds';
  kcal: number;
  proteinG: number;
  carbsG?: number;
  fatG?: number;
  /** At most 3 household measures. */
  portions?: { label: string; g: number }[];
};

/** A coach food suggestion (M10 F1/F2): what to eat to fit what's left today. */
export type FoodSuggestion = {
  label: string;
  ref: { foodId?: string; recipeId?: string };
  amount: FoodAmount;
  macros: MacroSet;
  /** Short plain reason, e.g. "Fits your 40 g protein left". */
  why: string;
};

// ---- M11 Health data (Apple Health, read-only; SPEC M11) ----

export type HealthType = 'bodyMass' | 'workouts' | 'activeEnergy' | 'sleep' | 'restingHr' | 'hrv';

export const HEALTH_TYPES: readonly HealthType[] = [
  'bodyMass',
  'workouts',
  'activeEnergy',
  'sleep',
  'restingHr',
  'hrv',
];

export type HealthSettings = {
  enabled: Record<HealthType, boolean>;
  /** Epoch ms of the last successful read. */
  lastReadAt?: number;
  route: 'apple' | 'whoop-api';
  /** Dates (YYYY-MM-DD) of imported weigh-ins he deleted; never re-imported. */
  deletedHealthWeighIns?: string[];
  /** Readiness card history (once per day, deload spacing); see core/health/readiness ReadinessHistory. */
  readiness?: {
    lastCard?: ReadinessCard;
    answeredDate?: string;
    lastDeloadOfferDate?: string;
  };
};

/** One workout logged by another app (e.g. WHOOP). Gym Clean's own bundle id is excluded. */
export type HealthWorkout = {
  /** Epoch ms. */
  start: number;
  minutes: number;
  /** HealthKit activity type name, e.g. 'running'. */
  kind: string;
  kcal?: number;
  avgHr?: number;
  /** Source app name or bundle id. */
  source: string;
};

/** One row per local date. Derived summaries only, never raw samples. */
export type HealthDay = {
  /** Local date YYYY-MM-DD (sleep is assigned to the wake-up date). */
  date: string;
  sleepMin?: number;
  restingHr?: number;
  /** HRV SDNN in ms. */
  hrvMs?: number;
  hrvSource?: string;
  activeKcal?: number;
  workouts?: HealthWorkout[];
  /** Route B only. */
  whoopRecoveryPct?: number;
};

export type ReadinessSignal = 'sleepShort' | 'hrvLow' | 'restingHrHigh' | 'hardOutsideWorkout' | 'whoopLow';

export type ReadinessCard = {
  date: string;
  signals: ReadinessSignal[];
  /** Plain coaching reasons, each passing checkCopy + the M11 banned list. */
  reasons: string[];
  offer: 'lighter' | 'deload';
};
