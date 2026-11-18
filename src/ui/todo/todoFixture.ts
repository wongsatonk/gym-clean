// Made-up to-do topics, answers and report text for the render tests and the dev-only harness
// (todo.harness.html). Not the real topics (core's src/data/todos/topics.ts) and not used by the
// app. No real data: the repo is public.
import { APP_NAME } from '../../core/brand';
import type { DetectorResult, TodoAnswer, TodoTopic } from '../../core/types';
import type { TodoTopicStatus } from './todoList';

export const FIX_NOW = new Date(2026, 10, 16, 18, 0).getTime(); // Mon 16 Nov 2026, local

export const FIX_TOPICS: TodoTopic[] = [
  {
    id: 'coach-week',
    title: 'Coach tab + Calendar',
    checkpoint: 'Checkpoint I',
    since: '1.12.0',
    platform: 'any',
    steps: [
      {
        id: 'asked',
        title: 'Ask the coach one question',
        kind: 'auto',
        detector: 'chatAsked',
        tryIt: 'coach',
      },
      {
        id: 'sessions',
        title: 'Log 3 gym sessions',
        why: 'The coach needs a few sessions to see your week.',
        kind: 'auto',
        detector: 'nativeSessions',
        params: { need: 3 },
        tryIt: 'today',
      },
      {
        id: 'motion',
        title: 'How did the motion feel?',
        kind: 'ask',
        options: [
          { id: 'right', label: 'Just right' },
          { id: 'much', label: 'Too much' },
          { id: 'little', label: 'Too little' },
        ],
        note: 'optional',
      },
      {
        id: 'types',
        title: 'Which types does your band write?',
        kind: 'ask',
        multi: true,
        options: [
          { id: 'weight', label: 'Weight' },
          { id: 'workouts', label: 'Workouts' },
          { id: 'sleep', label: 'Sleep' },
        ],
        note: 'none',
      },
      {
        id: 'cards',
        title: 'May the on-device coach read the card reasons?',
        why: 'Only the reason sentences, never numbers.',
        kind: 'ask',
        options: [
          { id: 'yes', label: 'Yes' },
          { id: 'no', label: 'No' },
        ],
        note: 'none',
        setting: { key: 'coach', path: 'appleCardReasons', values: { yes: true, no: false } },
      },
    ],
  },
  {
    id: 'food',
    title: 'Food photos',
    checkpoint: 'Checkpoint D',
    since: '1.12.0',
    platform: 'any',
    steps: [{ id: 'model', title: 'Import the food model', kind: 'auto', detector: 'foodModel' }],
  },
  {
    id: 'phone-week',
    title: 'iPhone app week',
    checkpoint: 'Checkpoint G',
    since: '1.12.0',
    platform: 'native',
    steps: [{ id: 'native', title: 'Open the iPhone app', kind: 'auto', detector: 'nativeApp' }],
  },
  {
    id: 'kit',
    title: 'Trainer-kit defaults',
    checkpoint: 'Decision',
    since: '1.12.0',
    platform: 'any',
    steps: [
      {
        id: 'keep',
        title: 'Keep the defaults?',
        kind: 'ask',
        options: [
          { id: 'keep', label: 'Keep them' },
          { id: 'change', label: 'Change something' },
        ],
      },
    ],
  },
];

export const FIX_STATUS: Record<string, TodoTopicStatus> = {
  'coach-week': { done: false, skipped: false, stepsDone: 2, steps: 5, nextStepId: 'sessions' },
  food: { done: true, skipped: false, stepsDone: 1, steps: 1 },
  'phone-week': { done: false, skipped: false, stepsDone: 0, steps: 1 },
  kit: { done: false, skipped: true, stepsDone: 0, steps: 1 },
};

export const FIX_ANSWERS: TodoAnswer[] = [
  {
    id: 'a1',
    topicId: 'coach-week',
    stepId: 'asked',
    kind: 'auto',
    at: new Date(2026, 10, 14, 19).getTime(),
    release: '1.12.0',
  },
  {
    id: 'a2',
    topicId: 'coach-week',
    stepId: 'motion',
    kind: 'ask',
    optionIds: ['much'],
    note: 'The calendar slide felt slow on the first open.',
    at: new Date(2026, 10, 15, 9).getTime(),
    release: '1.12.0',
  },
];

export const FIX_RESULTS: Record<string, DetectorResult> = {
  asked: { done: true, have: 1, need: 1 },
  sessions: { done: false, have: 2, need: 3 },
};

export const FIX_REPORT = [
  `${APP_NAME} to-do report`,
  'Version 1.12.0 (build abc1234) · web app · Mon 16 Nov 2026',
  '',
  'Coach tab + Calendar (Checkpoint I)',
  '- Ask the coach one question: done (Sat 14 Nov)',
  '- Log 3 gym sessions: 2 of 3',
  '- How did the motion feel? Too much',
  '  Note: The calendar slide felt slow on the first open.',
  '',
  'Trainer-kit defaults (Decision)',
  '- Skipped',
].join('\n');
