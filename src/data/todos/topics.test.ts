import { describe, expect, it } from 'vitest';
import type { TodoStep, TodoTopic } from '../../core/types';
import { DETECTOR_IDS, detectors } from '../../core/todo/detectors';
import { isAppRoute } from '../../core/todo/routes';
import { checkCopy } from '../../core/trainer/replies';
import { RULES } from '../../core/exercises';
import { TODO_TOPICS, TRAINER_KIT_DEFAULTS, topicsForRelease } from './topics';

type AskStep = Extract<TodoStep, { kind: 'ask' }>;
type AutoStep = Extract<TodoStep, { kind: 'auto' }>;
const asks = (t: TodoTopic) => t.steps.filter((s): s is AskStep => s.kind === 'ask');
const autos = (t: TodoTopic) => t.steps.filter((s): s is AutoStep => s.kind === 'auto');
const byId = (id: string): TodoTopic => {
  const t = TODO_TOPICS.find((x) => x.id === id);
  if (!t) throw new Error(`no topic ${id}`);
  return t;
};

function strings(t: TodoTopic): string[] {
  return [
    t.title,
    t.checkpoint ?? '',
    ...t.steps.flatMap((s) => [
      s.title,
      s.why ?? '',
      ...(s.kind === 'ask' ? s.options.map((o) => o.label) : []),
    ]),
  ].filter((x) => x !== '');
}

describe('TODO_TOPICS', () => {
  it('has the 12 topics of the SPEC table plus the 1.13.0, 1.14.0 and 1.15.0 ones, in order, with their checkpoints', () => {
    expect(TODO_TOPICS.map((t) => [t.id, t.checkpoint])).toEqual([
      ['one-arm-sets', 'Checkpoint K2'],
      ['coach-calendar', 'Checkpoint I'],
      ['coach-iphone', 'Checkpoint J'],
      ['trainer-kit-gym', 'Checkpoint J'],
      ['published-look', 'Checkpoint K'],
      ['health-week', 'Checkpoint H'],
      ['iphone-week', 'Checkpoint G'],
      ['coach-gym', 'Checkpoint E'],
      ['hands-free', 'Checkpoint B3'],
      ['camera', 'Checkpoints C + F1'],
      ['food-photos', 'Checkpoint D'],
      ['vesync', 'VeSync check'],
      ['apple-card', 'Decision M12-q1'],
      ['trainer-kit', 'Decision M12-q4'],
      ['claude', 'Decision: Claude brain'],
      ['resign', 'Re-sign (M9-q1)'],
    ]);
  });

  it('all came with 1.12.0, except the trainer-kit gym topic (1.13.0), the iPhone coach (1.14.0) and the published look (1.15.0)', () => {
    const since: Record<string, string> = {
      'trainer-kit-gym': '1.13.0',
      'coach-iphone': '1.14.0',
      'published-look': '1.15.0',
      'one-arm-sets': '1.15.1',
    };
    for (const t of TODO_TOPICS) expect(t.since, t.id).toBe(since[t.id] ?? '1.12.0');
  });

  it('topicsForRelease keeps a topic back until the app reaches its release', () => {
    const ids = (release: string) => topicsForRelease(release).map((t) => t.id);
    expect(ids('1.12.0')).toHaveLength(12);
    expect(ids('1.12.0')).not.toContain('trainer-kit-gym');
    expect(ids('1.12.3')).toEqual(ids('1.12.0'));
    const after114 = ['coach-iphone', 'published-look', 'one-arm-sets'];
    expect(ids('1.13.0')).toEqual(TODO_TOPICS.map((t) => t.id).filter((id) => !after114.includes(id)));
    expect(ids('1.13.4')).toEqual(ids('1.13.0'));
    expect(ids('1.14.0')).toEqual(
      TODO_TOPICS.map((t) => t.id).filter((id) => id !== 'published-look' && id !== 'one-arm-sets'),
    );
    expect(ids('1.15.0')).toEqual(TODO_TOPICS.map((t) => t.id).filter((id) => id !== 'one-arm-sets'));
    expect(ids('1.15.1')).toEqual(TODO_TOPICS.map((t) => t.id));
    expect(ids('1.16.0')).toEqual(TODO_TOPICS.map((t) => t.id));
    expect(ids('1.11.0')).toEqual([]);
    // Data order is kept, and another list can be passed in.
    expect(topicsForRelease('1.12.0', [byId('trainer-kit-gym'), byId('resign')])).toEqual([
      byId('resign'),
    ]);
  });

  it('marks the iPhone-only topics native and only the re-sign topic recurring', () => {
    expect(TODO_TOPICS.filter((t) => t.platform === 'native').map((t) => t.id)).toEqual([
      'coach-iphone',
      'health-week',
      'iphone-week',
      'vesync',
      'resign',
    ]);
    expect(TODO_TOPICS.filter((t) => t.recurring).map((t) => t.id)).toEqual(['resign']);
  });

  it('has unique topic ids, unique step ids per topic and unique option ids per step', () => {
    const ids = TODO_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TODO_TOPICS) {
      const steps = t.steps.map((s) => s.id);
      expect(new Set(steps).size, t.id).toBe(steps.length);
      expect(steps, t.id).not.toContain(''); // '' is the skip answer's step id
      for (const s of asks(t)) {
        const opts = s.options.map((o) => o.id);
        expect(opts.length, `${t.id}/${s.id}`).toBeGreaterThan(0);
        expect(new Set(opts).size, `${t.id}/${s.id}`).toBe(opts.length);
      }
    }
  });

  it('uses only registered detectors', () => {
    for (const t of TODO_TOPICS)
      for (const s of autos(t)) {
        expect(DETECTOR_IDS).toContain(s.detector);
        expect(typeof detectors[s.detector]).toBe('function');
      }
  });

  it('every Try it is a known route', () => {
    for (const t of TODO_TOPICS)
      for (const s of t.steps) if (s.tryIt !== undefined) expect(isAppRoute(s.tryIt), s.id).toBe(true);
  });

  it('every string passes checkCopy and is short', () => {
    for (const t of TODO_TOPICS)
      for (const s of strings(t)) {
        expect(checkCopy(s), s).toEqual({ ok: true, hits: [] });
        expect(s.length, s).toBeLessThanOrEqual(160);
      }
  });

  it('holds the thresholds as data', () => {
    const p = (topic: string, step: string) =>
      autos(byId(topic)).find((s) => s.id === step)?.params;
    expect(p('iphone-week', 'sessions')).toEqual({ min: 3 });
    expect(p('health-week', 'seven-days')).toEqual({ min: 7 });
    expect(p('coach-gym', 'changes')).toEqual({ min: 2 });
    expect(p('camera', 'full-session')).toEqual({ min: 6 });
    expect(p('camera', 'learning')).toEqual({ min: 3 });
    expect(p('food-photos', 'days')).toEqual({ min: 7 });
    expect(p('resign', 'days-left')).toEqual({ minDaysLeft: 3 });
    expect(p('trainer-kit-gym', 'effort')).toEqual({ min: 6 });
    expect(p('trainer-kit-gym', 'warm-ups')).toEqual({ min: 1 });
    expect(p('trainer-kit-gym', 'measurement')).toEqual({ min: 1 });
    expect(p('vesync', 'body-comp')).toEqual({ min: 1 });
    expect(p('coach-iphone', 'apple-answers')).toEqual({ min: 5 });
    expect(p('coach-iphone', 'mic')).toEqual({ min: 3 });
    expect(p('coach-iphone', 'check-in')).toEqual({ min: 1 });
    expect(p('one-arm-sets', 'one-arm-set')).toEqual({ min: 1 });
  });

  it('has the auto steps of the SPEC table', () => {
    expect(
      Object.fromEntries(TODO_TOPICS.map((t) => [t.id, autos(t).map((s) => s.detector)])),
    ).toEqual({
      'one-arm-sets': ['oneSidedSet'],
      'coach-calendar': ['chatAsked', 'proposalOutcome', 'calendarAfterSession'],
      'coach-iphone': ['appleAnswers', 'micUses', 'reminderOn', 'checkInDone'],
      'trainer-kit-gym': ['effortSets', 'warmupSession', 'intakeDone', 'measurementLogged'],
      'published-look': [],
      'health-week': ['healthConnected', 'healthDays'],
      'iphone-week': ['nativeApp', 'nativeSessions'],
      'coach-gym': ['coachChanges', 'legSwapSession'],
      'hands-free': ['handsFreeSession'],
      camera: ['cameraSession', 'learningCamera'],
      'food-photos': ['foodModel', 'photoMealDays'],
      vesync: ['bodyCompDays'],
      'apple-card': [],
      'trainer-kit': [],
      claude: [],
      resign: ['resignDaysLeft'],
    });
  });

  it('asks the questions folded into topics (M12-q2, M12-q3, week scope, WHOOP, M4f-q8)', () => {
    expect(asks(byId('coach-calendar')).map((s) => s.id)).toEqual([
      'felt-off',
      'motion',
      'old-days',
      'block-size',
      'week-scope',
    ]);
    const whoop = asks(byId('health-week')).find((s) => s.id === 'whoop-types');
    expect(whoop?.multi).toBe(true);
    expect(whoop?.options.map((o) => o.id)).toEqual([
      'weight',
      'workouts',
      'activeCalories',
      'sleep',
      'restingHr',
      'hrv',
    ]);
    expect(asks(byId('camera')).map((s) => s.id)).toContain('commit-landmarks');
  });

  describe('one-arm sets (1.15.1, Checkpoint K2)', () => {
    const topic = byId('one-arm-sets');

    it('is for both apps, titled as in the plan, not recurring, no decision steps', () => {
      expect(topic.title).toBe('One-arm sets');
      expect(topic.platform).toBe('any');
      expect(topic.recurring).toBeUndefined();
      expect(topic.owner).toBeUndefined();
      for (const s of asks(topic)) expect(s.setting, s.id).toBeUndefined();
    });

    it('auto step first: a set finished on both sides, with a Try it', () => {
      expect(topic.steps.slice(0, 1).map((s) => [s.id, s.kind, s.tryIt])).toEqual([
        ['one-arm-set', 'auto', 'today'],
      ]);
    });

    it('asks the Checkpoint K2 questions and folds in M13b-q1 and q2', () => {
      expect(asks(topic).map((s) => [s.id, s.options.map((o) => o.id), s.note])).toEqual([
        ['in-view', ['yes', 'mostly', 'no'], 'optional'],
        ['arm-counts', ['none', 'few', 'many'], 'optional'],
        ['next-arm-easy', ['yes', 'mostly', 'no'], 'optional'],
        ['setup-card', ['yes', 'mostly', 'no'], 'optional'],
        ['one-leg', ['fine', 'oneTotal', 'untried'], 'optional'],
        ['set-number', ['lower', 'higher'], 'optional'],
      ]);
    });
  });

  describe('trainer kit at the gym (1.13.0, feeds Checkpoint J)', () => {
    const topic = byId('trainer-kit-gym');

    it('is for both the web app and the iPhone app, titled as in the plan', () => {
      expect(topic.title).toBe('Trainer kit at the gym');
      expect(topic.platform).toBe('any');
      expect(topic.recurring).toBeUndefined();
    });

    it('auto steps first, each with a Try it', () => {
      expect(topic.steps.slice(0, 4).map((s) => [s.id, s.kind, s.tryIt])).toEqual([
        ['effort', 'auto', 'today'],
        ['warm-ups', 'auto', 'today'],
        ['intake', 'auto', 'intake'],
        ['measurement', 'auto', 'fuel/measurements'],
      ]);
    });

    it('asks about warm-up weights, effort, short on time, setup cues and anything off', () => {
      expect(asks(topic).map((s) => [s.id, s.options.map((o) => o.id)])).toEqual([
        ['warmup-weights', ['right', 'light', 'heavy']],
        ['effort-helped', ['yes', 'mostly', 'no']],
        ['short-on-time', ['fit', 'over', 'untried']],
        ['setup-cues', ['helpful', 'many', 'notNeeded']],
        ['anything-off', ['nothing', 'something']],
      ]);
      for (const s of asks(topic)) {
        expect(s.note, s.id).toBe('optional');
        expect(s.multi, s.id).toBeUndefined();
        expect(s.setting, s.id).toBeUndefined();
      }
    });
  });

  describe('coach on your iPhone (1.14.0, Checkpoint J)', () => {
    const topic = byId('coach-iphone');

    it('is iPhone-only, titled as in the plan, not recurring, no decision steps', () => {
      expect(topic.title).toBe('Coach on your iPhone');
      expect(topic.checkpoint).toBe('Checkpoint J');
      expect(topic.platform).toBe('native');
      expect(topic.recurring).toBeUndefined();
      for (const s of asks(topic)) expect(s.setting, s.id).toBeUndefined();
    });

    it('auto steps first, each with a Try it (reminders to its own screen)', () => {
      expect(topic.steps.slice(0, 4).map((s) => [s.id, s.kind, s.tryIt])).toEqual([
        ['apple-answers', 'auto', 'coach'],
        ['mic', 'auto', 'coach'],
        ['reminder', 'auto', 'settings/reminders'],
        ['check-in', 'auto', 'coach'],
      ]);
    });

    it('asks about wrong answers, a wrong action, the voice, the mic and the trainer kit', () => {
      expect(asks(topic).map((s) => [s.id, s.options.map((o) => o.id), s.note])).toEqual([
        ['wrong-answers', ['none', 'few', 'many'], 'optional'],
        ['wrong-action', ['no', 'yes'], 'optional'],
        ['voice', ['right', 'much', 'little'], 'optional'],
        ['mic-heard', ['mostly', 'half', 'rarely'], 'optional'],
        ['kit-off', ['nothing', 'something'], 'optional'],
      ]);
      expect(asks(topic).find((s) => s.id === 'voice')?.tryIt).toBe('settings/coach');
      for (const s of asks(topic)) expect(s.multi, s.id).toBeUndefined();
    });
  });

  describe('published look (1.15.0, Checkpoint K)', () => {
    const topic = byId('published-look');

    it('is for both apps, titled as in the plan, ask steps only, no decision steps', () => {
      expect(topic.title).toBe('Published look');
      expect(topic.checkpoint).toBe('Checkpoint K');
      expect(topic.platform).toBe('any');
      expect(topic.recurring).toBeUndefined();
      expect(topic.owner).toBeUndefined();
      expect(autos(topic)).toEqual([]);
    });

    it('asks what still looks home-made, what assumed you, the first launch and the second install', () => {
      expect(asks(topic).map((s) => [s.id, s.options.map((o) => o.id), s.note])).toEqual([
        ['home-made', ['nothing', 'something'], 'optional'],
        ['assumed-you', ['no', 'yes'], 'optional'],
        ['first-launch', ['fine', 'much'], 'optional'],
        ['second-install', ['iphone', 'pwa', 'notYet'], 'optional'],
      ]);
      for (const s of asks(topic)) {
        expect(s.multi, s.id).toBeUndefined();
        expect(s.setting, s.id).toBeUndefined();
      }
      expect(asks(topic).find((s) => s.id === 'first-launch')?.tryIt).toBe('welcome');
    });

    it('says nothing about who the second person is', () => {
      const text = strings(topic).join(' ');
      expect(text).not.toMatch(/\b(he|his|him|she|her|hers|wife|husband)\b/i);
    });
  });

  it('the VeSync topic gains an iPhone-only body fat / lean mass auto step, after its question', () => {
    const t = byId('vesync');
    expect(t.platform).toBe('native');
    expect(t.steps.map((s) => [s.id, s.kind])).toEqual([
      ['types', 'ask'],
      ['body-comp', 'auto'],
    ]);
    expect(t.steps[1]?.tryIt).toBe('settings/health');
  });

  it('offers every learning exercise (from the rule data) in the miscount question', () => {
    const step = asks(byId('camera')).find((s) => s.id === 'miscounted');
    expect(step?.multi).toBe(true);
    const learning = RULES.filter((r) => r.status === 'learning').map((r) => r.exerciseId);
    expect(learning.length).toBeGreaterThan(0);
    expect(step?.options.map((o) => o.id)).toEqual([...learning, 'none']);
    for (const o of step?.options ?? []) expect(o.label).not.toMatch(/_/);
  });

  describe('decision steps', () => {
    const decisions = TODO_TOPICS.flatMap((t) =>
      asks(t)
        .filter((s) => s.setting !== undefined)
        .map((s) => ({ topic: t.id, step: s })),
    );

    it('only the four decision topics set a setting, each its own key', () => {
      expect(decisions.map((d) => [d.topic, d.step.setting?.key, d.step.setting?.path])).toEqual([
        ['apple-card', 'coach', 'appleCardReasons'],
        ['trainer-kit', 'trainerKit', ''],
        ['claude', 'coach', 'claudeWanted'],
        ['resign', 'signing', 'signing'],
      ]);
    });

    it('map only their own options; an unmapped option leaves the setting alone', () => {
      for (const { step } of decisions) {
        const opts = step.options.map((o) => o.id);
        for (const k of Object.keys(step.setting?.values ?? {})) expect(opts).toContain(k);
      }
      const values = (topic: string) => decisions.find((d) => d.topic === topic)?.step.setting?.values;
      expect(values('apple-card')).toEqual({ yes: true, no: false });
      expect(values('trainer-kit')).toEqual({ keep: TRAINER_KIT_DEFAULTS });
      expect(values('claude')).toEqual({ yes: 'yes', later: 'later', no: 'no' });
      expect(values('resign')).toEqual({ free: 'free', paid: 'paid' });
    });

    it('never asks for the Claude key: no note on the Claude decision', () => {
      const step = asks(byId('claude'))[0];
      expect(step?.note).toBe('none');
      expect(strings(byId('claude')).join(' ')).not.toMatch(/paste|type your key|api key:/i);
    });
  });

  it('trainer-kit defaults are the M12-q4 defaults', () => {
    expect(TRAINER_KIT_DEFAULTS).toEqual({
      measurementSites: ['leftArm', 'rightArm', 'chest', 'waist', 'hips', 'leftThigh', 'rightThigh'],
      e1rmFormula: 'epley',
      warmups: 'firstHeavyLift',
      reviewWeeks: 5,
    });
  });
});
