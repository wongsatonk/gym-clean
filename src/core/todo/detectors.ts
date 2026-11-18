/**
 * M12 slice 1c: auto-step detectors. Each one reads a counts-only `TodoFacts` snapshot (built by
 * src/data/todos/facts.ts) and the step's params (thresholds as data, e.g. `{ min: 3 }`), and says
 * whether the step is met, with `have` / `need` for "2 of 3" lines. Pure; no values, only counts.
 */
import type { DetectorResult, TodoDetectorId, TodoFacts, TodoStep } from '../types';
import { resignDaysLeft } from './whatsNew';

/** The counts a facts snapshot carries (all whole numbers ≥ 0). */
export const FACT_COUNTS = [
  /** Chat messages he sent. */
  'chatQuestions',
  /** Coach proposals applied (undone ones included); not "reset". */
  'proposalOutcomes',
  /** Applied Not today / Go easy / swap changes. */
  'coachChanges',
  /** Local days of the last 7 (today included) with any Health data. */
  'healthDays7',
  /** Finished sessions since the iPhone app first ran. */
  'nativeSessions',
  /** Workouts whose dev log shows a hands-free auto start or stop. */
  'handsFreeSessions',
  /** The most camera-counted sets in one session. */
  'maxCameraSetsInSession',
  /** Learning (M4f) exercises with at least one camera-counted set. */
  'learningCameraExercises',
  /** Days with a meal logged from a photo. */
  'photoMealDays',
  /** Legs B sessions logged without the leg press (the swap ran). */
  'legSwapSessions',
  // M12 slice 1b (trainer kit).
  /** Working sets (not warm-ups) logged with an Easy / Good / Hard tap. */
  'effortSets',
  /** Workouts with at least one warm-up set logged. */
  'warmupSessions',
  /** Tape measurements logged. */
  'measurements',
  /** Health days that carry a body fat or lean mass reading. */
  'bodyCompDays',
  // M12 slice 2 (Checkpoint J).
  /** Coach replies written by Apple's on-device model (`source: 'apple'`). */
  'appleReplies',
  /** His messages sent with the hold-to-talk mic (`viaMic`). */
  'micMessages',
  /** Weekly check-ins answered (skipped weeks don't count). */
  'checkInsDone',
  // M13b (Checkpoint K2).
  /** Working sets of a one-sided exercise logged on both sides (Next arm / Next leg used). */
  'oneSidedSets',
] as const;

/** The flags a facts snapshot carries. */
export const FACT_FLAGS = [
  /** Calendar opened on a day with a finished session (settings 'todoSignals'). */
  'calendarAfterSession',
  /** At least one Health type switched on. */
  'healthConnected',
  /** A food model imported. */
  'foodModel',
  /** The re-sign decision is "paid" (stops the reminder). */
  'signingPaid',
  /** The goal questions (intake) are answered. */
  'intakeDone',
  /** M12 slice 2: any reminder (session, missed day, Sunday recap) switched on. */
  'reminderOn',
] as const;

export type FactCount = (typeof FACT_COUNTS)[number];
export type FactFlag = (typeof FACT_FLAGS)[number];

export type Detector = (facts: TodoFacts, params: Record<string, number>) => DetectorResult;

const count = (facts: TodoFacts, key: FactCount): number => {
  const v = facts.counts[key];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

const need = (params: Record<string, number>, key: string, fallback: number): number => {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;
};

/** "have ≥ min" on one count; `have` is capped at the need for "7 of 7". */
function atLeast(key: FactCount, defaultMin: number, nativeOnly = false): Detector {
  return (facts, params) => {
    const n = need(params, 'min', defaultMin);
    const have = Math.min(n, count(facts, key));
    const onPlatform = !nativeOnly || facts.platform === 'native';
    return { done: onPlatform && have >= n, have, need: n };
  };
}

function flag(key: FactFlag, nativeOnly = false): Detector {
  return (facts) => ({
    done: (!nativeOnly || facts.platform === 'native') && facts.flags[key] === true,
  });
}

/** Done while at least `minDaysLeft` days are left on this build (or he has the paid account). */
const resign: Detector = (facts, params) => {
  const n = need(params, 'minDaysLeft', 3);
  if (facts.platform !== 'native') return { done: false, need: n };
  if (facts.flags.signingPaid === true) return { done: true, need: n };
  if (facts.buildFirstSeenAt === undefined) return { done: false, need: n };
  const have = resignDaysLeft(facts.buildFirstSeenAt, facts.now);
  return { done: have >= n, have, need: n };
};

export const detectors: Record<TodoDetectorId, Detector> = {
  chatAsked: atLeast('chatQuestions', 1),
  proposalOutcome: atLeast('proposalOutcomes', 1),
  calendarAfterSession: flag('calendarAfterSession'),
  healthConnected: flag('healthConnected', true),
  healthDays: atLeast('healthDays7', 7, true),
  nativeApp: (facts) => ({ done: facts.platform === 'native' }),
  nativeSessions: atLeast('nativeSessions', 3, true),
  coachChanges: atLeast('coachChanges', 2),
  legSwapSession: atLeast('legSwapSessions', 1),
  handsFreeSession: atLeast('handsFreeSessions', 1),
  cameraSession: atLeast('maxCameraSetsInSession', 6),
  learningCamera: atLeast('learningCameraExercises', 3),
  foodModel: flag('foodModel'),
  photoMealDays: atLeast('photoMealDays', 7),
  resignDaysLeft: resign,
  // M12 slice 1b (trainer kit). Body fat / lean mass come from Health: iPhone app only.
  effortSets: atLeast('effortSets', 6),
  warmupSession: atLeast('warmupSessions', 1),
  intakeDone: flag('intakeDone'),
  measurementLogged: atLeast('measurements', 1),
  bodyCompDays: atLeast('bodyCompDays', 1, true),
  // M12 slice 2 (Checkpoint J). Its topic is iPhone-only; the facts are 0 on the web anyway.
  appleAnswers: atLeast('appleReplies', 5),
  micUses: atLeast('micMessages', 3),
  reminderOn: flag('reminderOn'),
  checkInDone: atLeast('checkInsDone', 1),
  // M13b (Checkpoint K2): one set done right, then Next arm, then left.
  oneSidedSet: atLeast('oneSidedSets', 1),
};

export const DETECTOR_IDS = Object.keys(detectors) as TodoDetectorId[];

/** Runs an auto step's detector with its params. */
export function runDetector(
  step: Extract<TodoStep, { kind: 'auto' }>,
  facts: TodoFacts,
): DetectorResult {
  return detectors[step.detector](facts, step.params ?? {});
}
