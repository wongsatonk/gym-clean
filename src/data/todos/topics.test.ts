import { describe, expect, it } from 'vitest';
import type { TodoStep, TodoTopic } from '../../core/types';
import { DETECTOR_IDS, detectors } from '../../core/todo/detectors';
import { isAppRoute } from '../../core/todo/routes';
import { checkCopy } from '../../core/trainer/replies';
import { RULES } from '../../core/exercises';
import { TODO_TOPICS, TRAINER_KIT_DEFAULTS } from './topics';

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
  it('has the 12 topics of the SPEC table, in order, mapped to their checkpoints', () => {
    expect(TODO_TOPICS.map((t) => [t.id, t.checkpoint])).toEqual([
      ['coach-calendar', 'Checkpoint I'],
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

  it('all came with 1.12.0', () => {
    for (const t of TODO_TOPICS) expect(t.since).toBe('1.12.0');
  });

  it('marks the iPhone-only topics native and only the re-sign topic recurring', () => {
    expect(TODO_TOPICS.filter((t) => t.platform === 'native').map((t) => t.id)).toEqual([
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
  });

  it('has the auto steps of the SPEC table', () => {
    expect(
      Object.fromEntries(TODO_TOPICS.map((t) => [t.id, autos(t).map((s) => s.detector)])),
    ).toEqual({
      'coach-calendar': ['chatAsked', 'proposalOutcome', 'calendarAfterSession'],
      'health-week': ['healthConnected', 'healthDays'],
      'iphone-week': ['nativeApp', 'nativeSessions'],
      'coach-gym': ['coachChanges', 'legSwapSession'],
      'hands-free': ['handsFreeSession'],
      camera: ['cameraSession', 'learningCamera'],
      'food-photos': ['foodModel', 'photoMealDays'],
      vesync: [],
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
