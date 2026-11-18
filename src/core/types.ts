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
  /** M12 1b "short on time": exerciseId of the accessory done back to back with this one (shorter rest). */
  pairWith?: string;
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

export type SetEffort = 'easy' | 'good' | 'hard';

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
  /** M12 1b: one tap on the rest screen; feeds the M5b advice. */
  effort?: SetEffort;
  /** M12 1b: a warm-up set (left out of volume, bests, stalls, e1RM and completion). */
  warmup?: true;
  /**
   * M13b: a one-sided exercise's per-side counts (right first, then left). When both sides exist,
   * `reps` / `partials` are the lower side's, so totals, bests and stats stay one number per set.
   */
  sides?: Partial<Record<WorkSide, SideCount>>;
  startedAt: number;
  endedAt: number;
};

/** M13b: the side a one-sided exercise works this part of the set (right first, then left). */
export type WorkSide = 'right' | 'left';

/** M13b: one side's count within a one-sided set. */
export type SideCount = { reps: number; partials: number };

/** M13b: what a one-sided exercise works one at a time (labels "Next arm" / "Next leg"). */
export type OneSidedLimb = 'arm' | 'leg';

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
  kind: 'avoidArea' | 'lighter' | 'deload' | 'swap' | 'shortOnTime';
  area?: BodyArea;
  /** The day as it will run. */
  exercises: PlannedExercise[];
  /**
   * Row map: every exercise id that left the day (plan rows and earlier swap-ins) with the id
   * that runs in its place now (null = removed). Older overrides have none; consumers fall back
   * to pairing rows by likeness (src/core/trainer/rows.ts).
   */
  replaced?: { fromId: string; toId: string | null }[];
  /**
   * M12 1b: only on a 'shortOnTime' adjust — the change that was on the day before it was made
   * shorter (e.g. go easy on arms), so asking again rebuilds from it instead of the plan day.
   */
  base?: {
    kind: Exclude<DayAdjust['kind'], 'shortOnTime'>;
    area?: BodyArea;
    exercises: PlannedExercise[];
    replaced?: { fromId: string; toId: string | null }[];
  };
};

/** `date` is local YYYY-MM-DD. */
export type DayOverride = { date: string; rest?: true; dayId?: string; adjust?: DayAdjust };

export type TrainerState = {
  version: number;
  plan: UserPlan;
  schedule: Schedule;
  overrides: DayOverride[];
  /** M12 focus blocks (dated, built by the app); missing = none. */
  blocks?: FocusBlock[];
  /** M12 1b: the standing "go easy on" list, changed by Proposal, honoured by every proposal. */
  easyOn?: BodyArea[];
};

export type ProposalAction =
  | 'postpone'
  | 'avoidArea'
  | 'lighter'
  | 'deload'
  | 'swap'
  | 'stall'
  | 'food'
  | 'focusBlock'
  | 'shortOnTime'
  | 'starterPlan'
  | 'easyOn'
  /** Checkpoint J: run another plan day today (`{ date: today, dayId }`; move.ts proposeDoToday). */
  | 'doToday';

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

export type FoodSource =
  'usda' | 'thai-estimate' | 'custom' | 'openfoodfacts' | 'photo-local' | 'photo-ai';

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
  /** M12 1b: targets follow the goal (and sex); none = today's surplus behaviour. */
  goalKind?: GoalKind;
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

/** 'bodyFat' | 'leanMass' (M12 1b): off by default, each with its own switch (not part of Connect). */
export type HealthType =
  'bodyMass' | 'workouts' | 'activeEnergy' | 'sleep' | 'restingHr' | 'hrv' | 'bodyFat' | 'leanMass';

export const HEALTH_TYPES: readonly HealthType[] = [
  'bodyMass',
  'workouts',
  'activeEnergy',
  'sleep',
  'restingHr',
  'hrv',
  'bodyFat',
  'leanMass',
];

/** The types Connect turns on (SPEC M11 default list). Body fat / lean mass have their own switches. */
export const HEALTH_CONNECT_TYPES: readonly HealthType[] = [
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
  /** M12 1b: body fat in percent (0–100), the day's pick like weight. */
  bodyFatPct?: number;
  /** M12 1b: lean body mass in kg. */
  leanMassKg?: number;
};

export type ReadinessSignal =
  | 'sleepShort'
  | 'hrvLow'
  | 'restingHrHigh'
  | 'hardOutsideWorkout'
  | 'whoopLow'
  /** M12 1b "feel today": energy ≤ 2. */
  | 'feltLow'
  /** M12 1b "feel today": any sore area. */
  | 'sore';

export type ReadinessCard = {
  date: string;
  signals: ReadinessSignal[];
  /** Plain coaching reasons, each passing checkCopy + the M11 banned list. */
  reasons: string[];
  offer: 'lighter' | 'deload';
};

// ---- M12 Coach tab: chat, focus blocks, calendar (SPEC M12 "Data model") ----

export type FocusGroup = BodyArea;

export type FocusBlockParams = {
  group: FocusGroup;
  /** 2–6. */
  weeks: number;
  /** Training weekdays, 0 = Sun. */
  weekdays: number[];
  /** Local YYYY-MM-DD. */
  startDate: string;
};

/** A dated, deterministic block the app builds; a brain only picks the params. */
export type FocusBlock = {
  id: string;
  group: FocusGroup;
  startDate: string;
  weeks: number;
  weekdays: number[];
  /** Every date of the block; `day: null` = rest. */
  days: { date: string; day: ProgramDay | null }[];
  /** Focus group's weekly sets: target in the block vs his base plan (for the scores). */
  targetSetsPerWeek: number;
  baseSetsPerWeek: number;
};

export type ChatCardStatus = 'pending' | 'applied' | 'dismissed' | 'undone' | 'expired';

export type ChatCard =
  | {
      kind: 'proposal';
      title: string;
      lines: { before: string; after: string }[];
      why: string;
      status: ChatCardStatus;
      baseVersion: number;
      changeId?: number;
    }
  | { kind: 'focusBlock'; blockId: string; status: ChatCardStatus }
  | { kind: 'food'; suggestions: FoodSuggestion[]; logged: number[] }
  | { kind: 'redFlag' }
  | { kind: 'recap'; period: 'week' | 'block'; from: string; to: string }
  | { kind: 'checkIn'; weekStart: string; status: 'pending' | 'done' | 'skipped' };

/** Who answered: a chip (rules directly), the rule matcher, Apple's model or Claude. */
export type BrainSource = 'chip' | 'rules' | 'apple' | 'claude';

export type ChatMessage = {
  id?: number;
  createdAt: number;
  role: 'user' | 'coach';
  text: string;
  /** Short spoken line (≤ 12 words; ≤ 8 mid-workout). */
  say?: string;
  source: BrainSource;
  phase: 'today' | 'preview' | 'workout';
  card?: ChatCard;
  chips?: { id: string; label: string; args?: Record<string, unknown> }[];
  /** M12 1b: a learn card (by id) opened from this message. */
  learnId?: string;
  /** True when this turn's context included M11 card reasons: never sent to Claude. */
  usedHealth?: boolean;
  /** e.g. "Answered by quick replies: Apple Intelligence is off". */
  note?: string;
  /** M12 slice 2: the user's message was sent with the hold-to-talk mic. */
  viaMic?: true;
};

export type DayStatus = 'done' | 'partial' | 'missed' | 'rest' | 'planned' | 'extra';

export type DayCompletion = {
  date: string;
  status: DayStatus;
  dayId: string | null;
  blockId?: string;
  setsPlanned: number;
  setsDone: number;
  exercises: {
    exerciseId: string;
    setsPlanned: number;
    setsDone: number;
    repsTarget: [number, number];
    reps: number[];
    status: 'done' | 'partial' | 'missed';
  }[];
};

export type PeriodScore = {
  from: string;
  to: string;
  sessionsPlanned: number;
  sessionsDone: number;
  setsPlanned: number;
  setsDone: number;
  extra: number;
  focus?: { group: FocusGroup; sets: number; target: number };
};

/** What a brain sees: the M10 coach context plus the last turns (≤ 8). */
export type BrainContext = {
  coach: import('./trainer/coach').CoachContext;
  turns: readonly ChatMessage[];
};

/** A brain's answer: the M10 `handle()` result plus where it came from. */
export type BrainReply = import('./trainer/coach').CoachResponse & {
  source: BrainSource;
  note?: string;
  usedHealth?: boolean;
};

/** The seam slices 2/3 plug into (Apple, Claude); slice 1 has chip + rules. */
export type CoachBrain = {
  id: BrainSource;
  status(): Promise<{ available: boolean; reason?: string }>;
  ask(text: string, ctx: BrainContext): Promise<BrainReply>;
};

// ---- M12 slice 1c: What's New tour + To-do guides (SPEC M12 "slice 1c" data model) ----

/** Deep links for "Try it" (as data). */
export type AppRoute =
  | 'today'
  | 'fuel'
  | 'coach'
  | 'calendar'
  | 'settings'
  | 'settings/health'
  | 'settings/myGym'
  | 'settings/foodPhotos'
  | 'settings/devlog'
  | 'settings/goal'
  | 'settings/progressPhotos'
  | 'fuel/measurements'
  | 'settings/coach'
  | 'settings/reminders'
  | 'intake'
  | 'todos'
  | 'welcome'
  | 'settings/about'
  | 'settings/licenses'
  | 'settings/selfcheck';

/** native = iPhone app only. */
export type TodoPlatform = 'any' | 'native';

export type TodoDetectorId =
  | 'chatAsked'
  | 'proposalOutcome'
  | 'calendarAfterSession'
  | 'healthConnected'
  | 'healthDays'
  | 'nativeApp'
  | 'nativeSessions'
  | 'coachChanges'
  | 'legSwapSession'
  | 'handsFreeSession'
  | 'cameraSession'
  | 'learningCamera'
  | 'foodModel'
  | 'photoMealDays'
  | 'resignDaysLeft'
  | 'effortSets'
  | 'warmupSession'
  | 'intakeDone'
  | 'measurementLogged'
  | 'bodyCompDays'
  | 'appleAnswers'
  | 'micUses'
  | 'reminderOn'
  | 'checkInDone';

export type TodoOption = { id: string; label: string };

export type TodoStep = { id: string; title: string; why?: string; tryIt?: AppRoute } & (
  | { kind: 'auto'; detector: TodoDetectorId; params?: Record<string, number> }
  | {
      kind: 'ask';
      options: TodoOption[];
      multi?: boolean;
      note?: 'optional' | 'none';
      /** Decision steps: the chosen option sets this setting. */
      setting?: { key: string; path: string; values: Record<string, unknown> };
    }
);

export type TodoTopic = {
  id: string;
  title: string;
  checkpoint?: string;
  /** Release (semver) that added it. */
  since: string;
  platform: TodoPlatform;
  recurring?: boolean;
  steps: TodoStep[];
  /** M13: shown only in owner mode. */
  owner?: true;
};

export type TodoAnswer = {
  id: string;
  topicId: string;
  stepId: string;
  kind: 'ask' | 'auto' | 'skip';
  optionIds?: string[];
  note?: string;
  at: number;
  release: string;
  /** Set when included in a copied report. */
  sentAt?: number;
};

/** Counts and flags only, never values. */
export type TodoFacts = {
  platform: 'web' | 'native';
  now: number;
  counts: Record<string, number>;
  flags: Record<string, boolean>;
  buildFirstSeenAt?: number;
};

export type DetectorResult = { done: boolean; have?: number; need?: number };

export type WhatsNewPage = {
  release: string;
  id: string;
  title: string;
  what: string;
  why: string;
  tryIt?: AppRoute;
  icon?: string;
  /** M13: shown only in owner mode. */
  owner?: true;
};

/** settings 'whatsNew'. */
export type WhatsNewState = { seenRelease?: string; builds?: Record<string, number> };
/** settings 'todos'. */
export type TodoSettings = { lastCopiedAt?: number };
/** settings 'todoSignals'. */
export type TodoSignals = { calendarAfterSessionAt?: number };

/** Decision targets set by to-do decision steps (M12-q1, M12-q4, Claude, re-sign). */
export type CoachDecisionSettings = {
  appleCardReasons?: boolean;
  claudeWanted?: 'yes' | 'later' | 'no';
};

// ---- M12 slice 2: Apple on-device brain, mic, reminders, weekly check-in ----

/** Why Apple's on-device model can't answer (docs/ios-setup.md "Slice 2 API notes" §1). */
export type BrainUnavailableReason =
  | 'deviceNotEligible'
  | 'appleIntelligenceNotEnabled'
  | 'modelNotReady'
  | 'unsupported'
  | 'notNative';

/** A failed `respond` call, mapped from Apple's error families. */
export type BrainErrorCode = 'guardrail' | 'contextTooLong' | 'unsupportedLanguage' | 'timeout' | 'other';

/** A tool call the model made (recorded, never applied without a tap). */
export type ToolCall = { name: string; args: Record<string, unknown> };

/** Read-only tools: results are computed in the app and passed in before `respond`. */
export type ReadToolName = 'weekSummary' | 'progressSummary' | 'exerciseInfo' | 'foodIdeas';

export type GymBrainRequest = {
  instructions: string;
  context: string;
  messages: { role: 'user' | 'coach'; text: string }[];
  /** `exerciseInfo` results are keyed `exerciseInfo:<exerciseId>`. */
  toolResults: Partial<Record<ReadToolName, string>> & Record<string, string>;
};

export type GymBrainResponse = { text: string; toolCalls: ToolCall[]; latencyMs: number };

/** settings 'coach' (slice 2 fields; merged with CoachDecisionSettings in the same row). */
export type CoachSettings = CoachDecisionSettings & {
  /** Default 'mic': speak only replies to mic-sent messages. */
  speakReplies?: 'mic' | 'always' | 'off';
  /** When each plain "quick replies" note was shown (once per reason). */
  brainNotes?: Partial<Record<BrainUnavailableReason, number>>;
};

export type ReminderKind = 'session' | 'missedDay' | 'sundayRecap';

/** settings 'reminders'. Everything off by default. */
export type ReminderSettings = {
  session: { on: boolean; time: string /* HH:MM */ };
  missedDay: { on: boolean };
  sundayRecap: { on: boolean };
  askedPermission?: boolean;
};

/** Dexie `checkIns` (v11), keyed by weekStart (YYYY-MM-DD). Never in a brain context. */
export type CheckIn = {
  weekStart: string;
  energy?: 1 | 2 | 3 | 4 | 5;
  sleep?: 1 | 2 | 3 | 4 | 5;
  soreness?: 1 | 2 | 3 | 4 | 5;
  skipped?: true;
  at: number;
};

export type TrainerKitSettings = {
  measurementSites: string[];
  e1rmFormula: 'epley';
  warmups: 'firstHeavyLift' | 'everyCompound' | 'off';
  reviewWeeks: number;
};

export type SigningSettings = { signing?: 'free' | 'paid' };

// ---- M12 slice 1b: trainer kit (SPEC M12 "// Slice 1b" data model) ----

export type GoalKind = 'muscle' | 'fat' | 'strength' | 'general';

export type Goal = {
  id: string;
  text: string;
  target: { kind: 'lift' | 'measurement' | 'weight'; ref?: string; value: number; reps?: number };
  /** Local date YYYY-MM-DD. */
  due: string;
  createdAt: number;
  doneAt?: number;
};

/** The first-run questions (settings key 'intake'). */
export type Intake = {
  goalKind: GoalKind;
  goalText?: string;
  /** Training days a week, 2–6. */
  days: number;
  sessionMin: 30 | 45 | 60 | 75;
  experience: 'new' | 'some' | 'years';
  easyOn: BodyArea[];
  at: number;
};

/** One tape measurement; `site` is an id from settings 'trainerKit' (e.g. 'leftArm', 'waist'). */
export type Measurement = { date: string; site: string; cm: number };

/** Kept on this phone only (LOCAL_ONLY_TABLES): never backed up, logged, sent or shown to a coach. */
export type ProgressPhoto = {
  id: string;
  date: string;
  createdAt: number;
  blob: Blob;
  pose?: 'front' | 'side' | 'back';
};

export type DayFeel = { date: string; energy?: 1 | 2 | 3 | 4 | 5; sore?: BodyArea[] };

export type LearnCard = { id: string; title: string; body: string; why?: string };

/** "Share my gym": equipment ids only, no personal data. */
export type GymFile = { format: 'gym-clean-gym'; version: 1; equipment: string[] };

// ---- M13: Published look (SPEC M13 data model) ----

/** settings 'ownerMode'. Off on fresh installs; on for installs that already had his data. */
export type OwnerMode = { on: boolean; setAt: number; by: 'fresh' | 'existing' | 'user' };

/** Things only the owner sees (developer and checkpoint tools). */
export type OwnerSurface =
  | 'todos'
  | 'resign'
  | 'devlog'
  | 'buildHash'
  | 'tourTodos'
  | 'evalScreen'
  | 'copyReport';

/** settings 'onboarding'. */
export type Onboarding = { doneAt?: number; skippedAt?: number };

export type OnboardingStep =
  | { kind: 'welcome'; id: string }
  | { kind: 'intake' }
  | { kind: 'permission'; permission: 'camera' | 'health' | 'mic' | 'notifications' };

export type LicenseEntry = {
  name: string;
  version?: string;
  license: string;
  source: 'npm' | 'data' | 'model' | 'font';
  text?: string;
};

export type ShareLead = 'sessions' | 'volume' | 'streak';

/** Story-size share numbers; warm-ups excluded. */
export type ShareStats = { sessionsDone: number; volumeKg: number; streakWeeks: number };
