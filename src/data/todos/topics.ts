/**
 * M12 slice 1c: the to-do topics (SPEC M12 "Initial topics", release 1.12.0). Data only: a future
 * release adds topics here (with its `since`) and no new screen. Thresholds are step params read
 * by src/core/todo/detectors.ts; decision steps map an option to a setting
 * (`{ key, path, values }`, written by src/data/todos/store.ts `applyDecision`; `path: ''` = the
 * whole settings value). Every string passes `checkCopy` (topics.test.ts).
 *
 * Hands-free (topic 5): its auto step reads the developer log, where every hands-free auto start
 * or stop is an `autoSet` event (src/ui/cameraView.ts `logAuto`). The dev log is on by default; a
 * workout with it off can't tick the step, and he can still finish the topic with Skip.
 */
import { RULES } from '../../core/exercises';
import type { TodoOption, TodoTopic, TrainerKitSettings } from '../../core/types';
import { exerciseName } from '../catalog';

/** M12-q4 defaults (confirmed by the trainer-kit decision step; read by slice 1b). */
export const TRAINER_KIT_DEFAULTS: TrainerKitSettings = {
  measurementSites: ['leftArm', 'rightArm', 'chest', 'waist', 'hips', 'leftThigh', 'rightThigh'],
  e1rmFormula: 'epley',
  warmups: 'firstHeavyLift',
  reviewWeeks: 5,
};

const YES_MOSTLY_NO: TodoOption[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'mostly', label: 'Mostly' },
  { id: 'no', label: 'No' },
];
const YES_NO: TodoOption[] = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];
const WRONG_COUNT: TodoOption[] = [
  { id: 'none', label: 'None' },
  { id: 'few', label: '1 to 2' },
  { id: 'many', label: '3 or more' },
];

/** The M4f learning exercises (from the rule data), for "which ones miscounted". */
const LEARNING_OPTIONS: TodoOption[] = [
  ...RULES.filter((r) => r.status === 'learning').map((r) => ({
    id: r.exerciseId,
    label: exerciseName(r.exerciseId),
  })),
  { id: 'none', label: 'None of them' },
];

const R = '1.12.0';

export const TODO_TOPICS: readonly TodoTopic[] = [
  {
    id: 'coach-calendar',
    title: 'Coach tab and Calendar',
    checkpoint: 'Checkpoint I',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'asked',
        title: 'Ask the coach a question',
        why: 'Type anything, like "How is my week?"',
        tryIt: 'coach',
        kind: 'auto',
        detector: 'chatAsked',
        params: { min: 1 },
      },
      {
        id: 'proposal',
        title: 'Apply or undo one coach change',
        tryIt: 'coach',
        kind: 'auto',
        detector: 'proposalOutcome',
        params: { min: 1 },
      },
      {
        id: 'calendar',
        title: 'Open the Calendar after a training day',
        tryIt: 'calendar',
        kind: 'auto',
        detector: 'calendarAfterSession',
      },
      {
        id: 'felt-off',
        title: 'Did anything feel off in the Coach tab or Calendar?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'nothing', label: 'Nothing' },
          { id: 'something', label: 'Something, see my note' },
        ],
      },
      {
        id: 'motion',
        title: 'How did the motion feel?',
        why: 'Screens slide and cards settle when they change.',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'right', label: 'Just right' },
          { id: 'much', label: 'Too much' },
          { id: 'little', label: 'Too little' },
        ],
      },
      {
        id: 'old-days',
        title: 'Old Calendar days: what should they show?',
        why: 'Days before a plan change can show your plan as it is now, or as it was then.',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'keep', label: 'Keep as now' },
          { id: 'then', label: 'Show what was planned then' },
        ],
      },
      {
        id: 'block-size',
        title: 'How did the focus block size feel?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'right', label: 'Right' },
          { id: 'much', label: 'Too much' },
          { id: 'little', label: 'Too little' },
          { id: 'untried', label: "Didn't try it" },
        ],
      },
      {
        id: 'week-scope',
        title: '"How is my week?" counts gym workouts only. Is that OK?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'gym', label: 'Gym only is fine' },
          { id: 'outside', label: 'Add outside workouts' },
        ],
      },
    ],
  },
  {
    id: 'health-week',
    title: 'Apple Health week',
    checkpoint: 'Checkpoint H',
    since: R,
    platform: 'native',
    steps: [
      {
        id: 'connected',
        title: 'Connect Apple Health',
        tryIt: 'settings/health',
        kind: 'auto',
        detector: 'healthConnected',
      },
      {
        id: 'seven-days',
        title: 'Health data on 7 of the last 7 days',
        why: 'Wear your watch or ring and open the app each day.',
        kind: 'auto',
        detector: 'healthDays',
        params: { min: 7 },
      },
      {
        id: 'right-days',
        title: 'Did the "Lighter today?" card show on the right days?',
        kind: 'ask',
        note: 'optional',
        options: YES_MOSTLY_NO,
      },
      {
        id: 'reasons',
        title: 'Did its reasons match how you felt?',
        kind: 'ask',
        note: 'optional',
        options: YES_MOSTLY_NO,
      },
      {
        id: 'weigh-in',
        title: 'Any wrong weigh-in from Health?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'no', label: 'No' },
          { id: 'yes', label: 'Yes, see my note' },
        ],
      },
      {
        id: 'whoop-types',
        title: 'Which types does WHOOP write to Health?',
        why: 'Check in Health, under each type, which apps write data.',
        kind: 'ask',
        multi: true,
        note: 'optional',
        options: [
          { id: 'weight', label: 'Weight' },
          { id: 'workouts', label: 'Workouts' },
          { id: 'activeCalories', label: 'Active calories' },
          { id: 'sleep', label: 'Sleep' },
          { id: 'restingHr', label: 'Resting heart rate' },
          { id: 'hrv', label: 'HRV' },
        ],
      },
    ],
  },
  {
    id: 'iphone-week',
    title: 'iPhone app week',
    checkpoint: 'Checkpoint G',
    since: R,
    platform: 'native',
    steps: [
      {
        id: 'running',
        title: 'Train with the iPhone app',
        kind: 'auto',
        detector: 'nativeApp',
      },
      {
        id: 'sessions',
        title: 'Log 3 gym sessions in the iPhone app',
        tryIt: 'today',
        kind: 'auto',
        detector: 'nativeSessions',
        params: { min: 3 },
      },
      {
        id: 'ducking',
        title: 'Did the voice lower your music and bring it back?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'sometimes', label: 'Sometimes' },
          { id: 'no', label: 'No' },
        ],
      },
      {
        id: 'screen-on',
        title: 'Did the screen stay on during sets?',
        kind: 'ask',
        note: 'optional',
        options: YES_NO,
      },
      {
        id: 'camera',
        title: 'Did the camera work?',
        kind: 'ask',
        note: 'optional',
        options: YES_MOSTLY_NO,
      },
      {
        id: 'different',
        title: 'Anything different from the web app?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'nothing', label: 'Nothing' },
          { id: 'something', label: 'Something, see my note' },
        ],
      },
    ],
  },
  {
    id: 'coach-gym',
    title: 'Coach at the gym',
    checkpoint: 'Checkpoint E',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'changes',
        title: 'Apply 2 coach changes: Not today, Go easy or a swap',
        tryIt: 'coach',
        kind: 'auto',
        detector: 'coachChanges',
        params: { min: 2 },
      },
      {
        id: 'leg-swap',
        title: 'Log a Legs B session with the leg press swapped',
        why: 'Tell the coach your gym has no leg press, or untick it in My gym.',
        tryIt: 'settings/myGym',
        kind: 'auto',
        detector: 'legSwapSession',
      },
      {
        id: 'swap-weight',
        title: 'What weight did you use on the replacement?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'noted', label: 'In my note' },
          { id: 'skipped', label: "Didn't do it" },
        ],
      },
      {
        id: 'prompt',
        title: 'Did the gym prompt feel right?',
        kind: 'ask',
        note: 'optional',
        options: YES_MOSTLY_NO,
      },
      {
        id: 'helpful',
        title: 'Were the coach answers helpful?',
        kind: 'ask',
        note: 'optional',
        options: YES_MOSTLY_NO,
      },
    ],
  },
  {
    id: 'hands-free',
    title: 'Hands-free sets',
    checkpoint: 'Checkpoint B3',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'session',
        title: 'Train one day with hands-free on',
        why: 'Ticks after a camera set starts or stops by itself, with the developer log on.',
        tryIt: 'today',
        kind: 'auto',
        detector: 'handsFreeSession',
        params: { min: 1 },
      },
      {
        id: 'wrong-starts',
        title: 'Wrong auto starts?',
        kind: 'ask',
        note: 'optional',
        options: WRONG_COUNT,
      },
      {
        id: 'wrong-stops',
        title: 'Wrong auto stops?',
        kind: 'ask',
        note: 'optional',
        options: WRONG_COUNT,
      },
      {
        id: 'still-stop',
        title: 'The stop after 6 seconds still felt:',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'right', label: 'Right' },
          { id: 'quick', label: 'Too quick' },
          { id: 'slow', label: 'Too slow' },
        ],
      },
      {
        id: 'undo',
        title: 'Were 5 seconds enough to tap Undo?',
        kind: 'ask',
        note: 'optional',
        options: YES_NO,
      },
      {
        id: 'push-up-hold',
        title: 'Did the push-up hold and tap feel right?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
          { id: 'untried', label: "Didn't try it" },
        ],
      },
      {
        id: 'devlog',
        title: 'Did you export the developer log?',
        tryIt: 'settings/devlog',
        kind: 'ask',
        note: 'none',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'notYet', label: 'Not yet' },
        ],
      },
    ],
  },
  {
    id: 'camera',
    title: 'Camera counting, form cues, learning exercises',
    checkpoint: 'Checkpoints C + F1',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'full-session',
        title: 'One workout with 6 sets counted by the camera',
        tryIt: 'today',
        kind: 'auto',
        detector: 'cameraSession',
        params: { min: 6 },
      },
      {
        id: 'learning',
        title: 'Camera sets on 3 learning exercises',
        why: 'Learning exercises are the newer camera moves, still being tuned.',
        tryIt: 'today',
        kind: 'auto',
        detector: 'learningCamera',
        params: { min: 3 },
      },
      {
        id: 'counts',
        title: 'Were the counts right?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'all', label: 'All right' },
          { id: 'off', label: 'Off by 1 to 2' },
          { id: 'often', label: 'Often wrong, see my note' },
        ],
      },
      {
        id: 'cues',
        title: 'Were the form cues helpful?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'sometimes', label: 'Sometimes' },
          { id: 'no', label: 'No' },
        ],
      },
      {
        id: 'miscounted',
        title: 'Which learning exercises miscounted?',
        kind: 'ask',
        multi: true,
        note: 'optional',
        options: LEARNING_OPTIONS,
      },
      {
        id: 'commit-landmarks',
        title: 'OK to keep the pose points of the sets you OK for tuning?',
        why: 'Only numbers for body points are kept, never video.',
        kind: 'ask',
        note: 'optional',
        options: YES_NO,
      },
    ],
  },
  {
    id: 'food-photos',
    title: 'Food photos',
    checkpoint: 'Checkpoint D',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'model',
        title: 'Import the food model',
        tryIt: 'settings/foodPhotos',
        kind: 'auto',
        detector: 'foodModel',
      },
      {
        id: 'days',
        title: 'Log meals from a photo on 7 days',
        tryIt: 'fuel',
        kind: 'auto',
        detector: 'photoMealDays',
        params: { min: 7 },
      },
      {
        id: 'top-guess',
        title: 'Was the top guess right?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'mostly', label: 'Mostly' },
          { id: 'half', label: 'About half' },
          { id: 'rarely', label: 'Rarely' },
        ],
      },
      {
        id: 'fast',
        title: 'Was it fast enough?',
        kind: 'ask',
        note: 'optional',
        options: YES_NO,
      },
      {
        id: 'never-gets',
        title: 'Any dish it never gets?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'no', label: 'No' },
          { id: 'yes', label: 'Yes, see my note' },
        ],
      },
    ],
  },
  {
    id: 'vesync',
    title: 'VeSync scale types',
    checkpoint: 'VeSync check',
    since: R,
    platform: 'native',
    steps: [
      {
        id: 'types',
        title: 'In Health, Body Measurements: does VeSync write Body Fat % and Lean Body Mass?',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'both', label: 'Both' },
          { id: 'bodyFat', label: 'Body fat only' },
          { id: 'neither', label: 'Neither' },
          { id: 'notSure', label: 'Not sure' },
        ],
      },
    ],
  },
  {
    id: 'apple-card',
    title: "Apple's coach and the Health card",
    checkpoint: 'Decision M12-q1',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'reasons',
        title: "May Apple's on-device coach read the card's reason sentences?",
        why: 'Only the sentences, never numbers, and never sent to Claude.',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        setting: { key: 'coach', path: 'appleCardReasons', values: { yes: true, no: false } },
      },
    ],
  },
  {
    id: 'trainer-kit',
    title: 'Trainer kit defaults',
    checkpoint: 'Decision M12-q4',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'defaults',
        title: 'Keep the trainer kit defaults?',
        why: 'Tape sites: arms, chest, waist, hips, thighs. Warm-ups before the first heavy lift. A review every 5 weeks.',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'keep', label: 'Keep the defaults' },
          { id: 'change', label: 'Change something, see my note' },
        ],
        setting: { key: 'trainerKit', path: '', values: { keep: TRAINER_KIT_DEFAULTS } },
      },
    ],
  },
  {
    id: 'claude',
    title: 'Claude coach and your key',
    checkpoint: 'Decision: Claude brain',
    since: R,
    platform: 'any',
    steps: [
      {
        id: 'wanted',
        title: 'Do you want the Claude coach later?',
        why: 'Your key gets its own screen in Settings later. It is never asked for here.',
        kind: 'ask',
        note: 'none',
        options: [
          { id: 'yes', label: "Yes, I'll add my key in Settings" },
          { id: 'later', label: 'Not now' },
          { id: 'no', label: 'No' },
        ],
        setting: {
          key: 'coach',
          path: 'claudeWanted',
          values: { yes: 'yes', later: 'later', no: 'no' },
        },
      },
    ],
  },
  {
    id: 'resign',
    title: '7-day re-sign',
    checkpoint: 'Re-sign (M9-q1)',
    since: R,
    platform: 'native',
    recurring: true,
    steps: [
      {
        id: 'days-left',
        title: 'At least 3 days left before the app needs re-signing',
        why: 'A free Apple ID build runs for 7 days. Re-sign it from your Mac.',
        kind: 'auto',
        detector: 'resignDaysLeft',
        params: { minDaysLeft: 3 },
      },
      {
        id: 'account',
        title: 'Keep the free weekly re-sign or switch to the paid account?',
        why: 'The paid account stops this reminder.',
        kind: 'ask',
        note: 'optional',
        options: [
          { id: 'free', label: 'Keep the free re-sign' },
          { id: 'paid', label: 'Switch to the paid account' },
        ],
        setting: { key: 'signing', path: 'signing', values: { free: 'free', paid: 'paid' } },
      },
    ],
  },
];
