import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import howtoJson from '../../../data/howto.json';
import cuesJson from '../../../data/cues.json';
import facts from '../evals/facts.json';
import { matchContext } from '../coach';
import { checkCopy } from '../replies';
import type { Program } from '../../types';
import type { BrainInput } from './context';
import { factsInput, factsMatch, type FactItem, type FactsScenario } from './readTools';
import { answerFact, classifyFact, factsAnswer, type FactKind } from './facts';
import source from './facts.ts?raw';

// Made-up scenario (evals/facts.json): the default program, no personal data. Today is
// Wednesday 2026-11-11, Push A is up today, rest on Sundays.
const SCENARIO = facts.scenario as FactsScenario;
const program = programJson as Program;
const catalog = trainerCatalog();
const withData = (i: BrainInput): BrainInput => ({
  ...i,
  howTo: (id) => (howtoJson as Record<string, { lines: string[] }>)[id],
  cue: (id) => (cuesJson as Record<string, string>)[id],
});
const input = withData(factsInput(SCENARIO, program, catalog));
const mctx = matchContext(input.coach);
const kindOf = (text: string) => classifyFact(text, mctx)?.kind ?? null;
const answer = (text: string, inp: BrainInput = input) => factsAnswer(text, inp)?.text ?? null;

/** The scenario with a change (still made up). */
const variant = (patch: Partial<FactsScenario>) =>
  withData(factsInput({ ...SCENARIO, ...patch }, program, catalog));

const KIND_OF_ITEM: Record<string, FactKind> = {
  weekSessions: 'week',
  weekSets: 'week',
  weekNext: 'nextSession',
  monthSessions: 'month',
  streak: 'streak',
  todayDay: 'dayPlan',
  todayBenchWeight: 'planned',
  todayBenchSets: 'planned',
  tomorrow: 'dayPlan',
  restDay: 'restDay',
  benchBest: 'bestSet',
  squatLast: 'lastSet',
  rowTrend: 'trend',
  pulldownBest: 'bestSet',
  stepUpsLast: 'lastSet',
  kcalEaten: 'kcalEaten',
  proteinTarget: 'proteinTarget',
  kcalLeft: 'kcalLeft',
  proteinLeft: 'proteinLeft',
  goalProgress: 'goalProgress',
  goalTarget: 'goalTarget',
  benchMuscles: 'muscles',
  gobletMuscles: 'muscles',
  rowCue: 'cue',
};

describe('classifyFact: the facts.json questions', () => {
  for (const item of facts.items as FactItem[])
    it(`${item.id} → ${KIND_OF_ITEM[item.id]}`, () => {
      expect(kindOf(item.text)).toBe(KIND_OF_ITEM[item.id]);
    });
});

describe('factsAnswer: the facts.json questions quote the right numbers', () => {
  for (const item of facts.items as FactItem[])
    it(item.id, () => {
      const text = answer(item.text);
      expect(text, item.id).not.toBeNull();
      expect(factsMatch(text ?? '', item)).toEqual({ ok: true, missing: [] });
    });
});

describe('answers per kind', () => {
  it('nextSession / dayPlan / restDay', () => {
    expect(answer("What's my next workout?")).toBe('Your next workout is Push A, today.');
    expect(answer('What am I training today?')).toMatch(/^Today is Push A: Dumbbell Bench Press, /);
    expect(answer("What's on tomorrow?")).toMatch(/^Tomorrow is Pull A: /);
    expect(answer('What am I training on Sunday?')).toBe('Sunday is a rest day.');
    expect(answer('Which day is my rest day this week?')).toBe(
      'Your rest day this week is Sunday 15 Nov.',
    );
    expect(answer('Is Friday a rest day?')).toBe('Friday is not a rest day: Legs A.');
  });

  it('week / month / streak', () => {
    expect(answer('How many sessions have I done this week?')).toBe(
      'This week you have done 2 of 6 sessions, 87% of planned sets so far. Next: Push A today.',
    );
    expect(answer("How's my month going?")).toBe(
      'This month you have done 7 of 25 sessions, 85% of planned sets.',
    );
    expect(answer('How long is my streak?')).toBe('Your streak is 3 weeks in a row.');
  });

  it('lastSet / bestSet / trend', () => {
    expect(answer('What did I goblet squat last time?')).toBe(
      'Last time (Fri 6 Nov) you did Goblet Squat at 24 kg for 12 reps, 4 sets.',
    );
    expect(answer("What's my best lat pulldown this month?")).toBe(
      'Your best Wide-Grip Lat Pulldown set this month is 45 kg for 12 reps (Wed 4 Nov).',
    );
    expect(answer('What was my best bench press set lately?')).toBe(
      'Your best Dumbbell Bench Press set in the last 4 weeks is 22.5 kg for 8 reps (Tue 3 Nov).',
    );
    expect(answer('Has my seated cable row gone up?')).toBe(
      'Seated Cable Rows went up from 35 kg for 12 reps to 40 kg for 12 reps over the last 4 weeks.',
    );
    // Held steady: the same top set.
    expect(answer('Has my seated dumbbell press gone up?')).toBe(
      'Seated Dumbbell Press held at 12 kg for 8 reps over the last 4 weeks.',
    );
  });

  it('planned: today, or the next day it is planned', () => {
    expect(answer('What weight should I use on the bench press today?')).toBe(
      'Today: Dumbbell Bench Press, 4 sets of 8 at 22.5 kg.',
    );
    expect(answer('How many sets of goblet squat?')).toBe(
      "Goblet Squat isn't in today's plan. Next: Fri 13 Nov, 4 sets of 8-12 at 24 kg.",
    );
  });

  it('fuel: eaten, left, target', () => {
    expect(answer('How many calories have I eaten today?')).toBe(
      'You have had 1450 kcal today, of your 2400 kcal target.',
    );
    expect(answer('How many calories do I have left today?')).toBe(
      'You have 950 kcal left today (1450 of 2400 kcal).',
    );
    expect(answer('How much protein do I still need today?')).toBe(
      'You still need 48 g protein today (92 of 140 g).',
    );
    expect(answer("What's my protein target today?")).toBe(
      'Your protein target today is 140 g. You have had 92 g so far.',
    );
    expect(answer("What's my calorie target?")).toBe(
      'Your calorie target today is 2400 kcal. You have had 1450 kcal so far.',
    );
    expect(answer('How much protein have I had today?')).toBe(
      'You have had 92 g protein today, of your 140 g target.',
    );
    // Over the target: never a negative number.
    const over = variant({
      fuel: { ...SCENARIO.fuel, totals: { ...SCENARIO.fuel.totals, proteinG: 150 } },
    });
    expect(answer('How much protein do I still need today?', over)).toBe(
      'You have reached today’s 140 g protein target (150 g so far).',
    );
  });

  it('goals', () => {
    expect(answer('How close am I to my bench goal?')).toBe(
      'Dumbbell bench 30 kg for 5: 33% of the way, on track.',
    );
    expect(answer("What's my bench goal?")).toBe(
      'Your goal: Dumbbell Bench Press, 30 kg for 5 reps by 31 Jan 2027.',
    );
    // No lift goal named: the only one, then the intake goal.
    expect(answer("What's my goal?")).toBe(
      'Your goal: Dumbbell Bench Press, 30 kg for 5 reps by 31 Jan 2027.',
    );
    expect(answer("What's my goal?", variant({ liftGoals: [] }))).toBe(
      'Your goal: get stronger: Press heavier dumbbells by spring.',
    );
  });

  it('muscles and cue', () => {
    expect(answer('What does the dumbbell bench press work?')).toBe(
      'Dumbbell Bench Press works your chest, with help from your shoulders and triceps.',
    );
    expect(answer('Any tip for the one-arm dumbbell row?')).toBe(
      'One-Arm Dumbbell Row: Elbow to hip, squeeze your back.',
    );
  });

  it('PR / personal record / personal best means all-time', () => {
    expect(classifyFact("what's my bench PR?", mctx)).toMatchObject({
      kind: 'bestSet',
      span: 'all',
    });
    expect(answer("what's my bench personal record?")).toBe(
      'Your best Dumbbell Bench Press set so far is 22.5 kg for 8 reps (Tue 3 Nov).',
    );
  });

  it('weights follow the unit (lb)', () => {
    const lb = variant({ unit: 'lb' });
    expect(answer('What did I goblet squat last time?', lb)).toMatch(/at 52\.9 lb for 12 reps/);
  });
});

describe('no data → null (the model answers as before)', () => {
  const empty = variant({ sessions: [] });

  it('history kinds with nothing logged for the exercise', () => {
    for (const t of [
      'What did I goblet squat last time?',
      "What's my best lat pulldown this month?",
      'Has my seated cable row gone up?',
      'How long is my streak?',
    ])
      expect([t, answer(t, empty)]).toEqual([t, null]);
    // Logged, but not this month (scenario moved a month on).
    expect(
      answer("What's my best lat pulldown this month?", variant({ today: '2026-12-20' })),
    ).toBe(null);
  });

  it('fuel without Fuel, without a day, without targets', () => {
    const noM7 = { ...input, coach: { ...input.coach, m7Available: false } };
    const noFuel = { ...input, coach: { ...input.coach } };
    delete noFuel.coach.fuel;
    const fuel = input.coach.fuel;
    if (!fuel) throw new Error('the scenario has Fuel');
    const noTargets = { ...input, coach: { ...input.coach, fuel: { ...fuel, targets: null } } };
    for (const inp of [noM7, noFuel])
      for (const t of ['How many calories have I eaten today?', 'How much protein left?'])
        expect([t, answer(t, inp)]).toEqual([t, null]);
    expect(answer('How many calories do I have left today?', noTargets)).toBeNull();
    expect(answer("What's my protein target today?", noTargets)).toBeNull();
    expect(answer('How many calories have I eaten today?', noTargets)).toBe(
      'You have had 1450 kcal today.',
    );
  });

  it('plan kinds with an empty rotation', () => {
    const noPlan: BrainInput = {
      ...input,
      coach: {
        ...input.coach,
        sessions: [],
        sets: [],
        state: {
          ...input.coach.state,
          schedule: { ...input.coach.state.schedule, rotation: [] },
        },
      },
    };
    for (const t of [
      "What's my next workout?",
      'What am I training today?',
      'How many sessions have I done this week?',
      "How's my month going?",
      'What weight should I use on the bench press today?',
    ])
      expect([t, answer(t, noPlan)]).toEqual([t, null]);
  });

  it('goals: none set', () => {
    const none = { ...input, goals: [] } as BrainInput;
    delete none.goalText;
    delete none.goalKind;
    expect(answer("What's my goal?", none)).toBeNull();
    expect(answer('How close am I to my bench goal?', none)).toBeNull();
  });

  it('cue: no cue or how-to for the exercise', () => {
    const bare = { ...input } as BrainInput;
    delete bare.cue;
    delete bare.howTo;
    expect(answer('Any tip for the one-arm dumbbell row?', bare)).toBeNull();
  });

  it('planned: an exercise not in the plan', () => {
    expect(answer('How many sets of barbell squat today?')).toBeNull();
  });

  it('nextSession mid-workout: "next" means the next exercise there → null', () => {
    const mid = { ...input, coach: { ...input.coach, phase: 'workout' as const } };
    expect(answer("What's my next workout?", mid)).toBeNull();
  });

  it('a 0 kg set on an exercise that needs weight is "not entered": null, never "bodyweight"', () => {
    // The scenario logs Dumbbell Bicep Curl with no weight (0 kg).
    expect(answer('what did I curl last time?')).toBeNull();
    // A bodyweight exercise is fine.
    expect(answer('what did I do on pushups last time?')).toBe(
      'Last time (Tue 3 Nov) you did Pushups at bodyweight for 20 reps, 3 sets.',
    );
  });

  it('goalProgress with nothing logged for the goal → null', () => {
    const g = {
      ...SCENARIO,
      liftGoals: SCENARIO.liftGoals.map((g) => ({ ...g, exerciseId: 'Barbell_Squat' })),
    };
    expect(answer('How close am I to my squat goal?', variant(g))).toBeNull();
  });

  it('answerFact never throws on an unknown exercise id', () => {
    expect(answerFact({ kind: 'lastSet', exerciseIds: ['Nope'] }, input)).toBeNull();
    expect(answerFact({ kind: 'muscles', exerciseIds: [] }, input)).toBeNull();
  });
});

/**
 * Paraphrases NOT tuned on facts.json wording (written before the code ran against them):
 * [text, kind, strings the answer must contain].
 */
const REGRESSION: readonly [string, FactKind, string[]][] = [
  ["when's my next workout", 'nextSession', ['Push A']],
  ['what is up next for me?', 'nextSession', ['Push A']],
  ['what am I doing tomorrow?', 'dayPlan', ['Pull A']],
  ['what is the plan for friday?', 'dayPlan', ['Legs A']],
  ['is sunday a rest day?', 'restDay', ['Sunday is a rest day']],
  ['when is my day off', 'restDay', ['Sunday']],
  ["how's my week looking", 'week', ['2 of 6', '87%']],
  ['how many workouts have I done this month?', 'month', ['7 of 25']],
  ["what's my current streak", 'streak', ['3']],
  ['what did I lift on goblet squats last time', 'lastSet', ['24', '12']],
  ['how much did I deadlift last session?', 'lastSet', ['20', '12']],
  ['what is my heaviest incline press', 'bestSet', ['16']],
  ['is my row going up', 'trend', ['35', '40', '22', '24']],
  ['are my step ups going up?', 'trend', ['10', '12']],
  ['how many sets of seated press today?', 'planned', ['3 sets', '12']],
  ['how many reps for lateral raises today', 'planned', ['5 sets', '20']],
  ['how much protein left', 'proteinLeft', ['48']],
  ['calories remaining?', 'kcalLeft', ['950']],
  ['how many kcal have I had so far', 'kcalEaten', ['1450']],
  ['what is my daily protein goal', 'proteinTarget', ['140']],
  ['how far am I from my bench press goal?', 'goalProgress', ['33%']],
  // Reviewer: fine as facts.
  ['Next session?', 'nextSession', ['Push A']],
  ['How is my week going?', 'week', ['2 of 6']],
  ['Plan for tomorrow', 'dayPlan', ['Pull A']],
  ['what muscles do lunges hit?', 'muscles', ['quadriceps']],
  ['tip for the dumbbell row', 'cue', ['elbow']],
  ['any form cues for goblet squats?', 'cue', ['Chest up']],
];

describe('regression paraphrases (not tuned on facts.json)', () => {
  for (const [text, kind, must] of REGRESSION)
    it(text, () => {
      expect(kindOf(text)).toBe(kind);
      const got = answer(text) ?? '';
      expect(factsMatch(got, { facts: must })).toEqual({ ok: true, missing: [] });
    });
});

describe('not a fact question → null', () => {
  it('open chat and how-to questions', () => {
    for (const t of [
      "what's the weather",
      'why do I need protein',
      'how do I do a goblet squat?',
      'tell me a joke',
      'How am I doing?',
      'What can you do?',
      'Did I hit my protein yesterday?',
      'How many sessions did I skip this month?',
      'Did I drop below my calorie target?',
      'When did I last do legs?',
      'I had a big lunch',
      '',
      ...ADVICE_NOT_FACTS,
    ])
      expect([t, kindOf(t)]).toEqual([t, null]);
  });
});

// Coach decision (1.16.2 review): advice and judgement questions and "plan my / plan for" requests
// go to the model (with the plan line in context); facts answers only pure lookups.
export const ADVICE_NOT_FACTS: readonly string[] = [
  // Coordinator (ui-engineer's e2e findings)
  'Should I train hard today?',
  'Any thoughts on how today should go?',
  'Plan my week again',
  'Is it OK to train legs two days in a row?',
  'Do you think I should deload?',
  'How hard should I go today?',
  'What should I focus on today?',
  // Reviewer probes
  'Am I ready to train today?',
  'Should I go to the gym today?',
  'My bench is stuck, what should I do?',
  'What can I do to improve my bench?',
  'Is my form ok on the goblet squat?',
  "What's the max weight I should use on bench today?",
  'Should I record my bench set?',
  'Is 22.5 kg too heavy for bench press?',
  'How heavy should I go on squats if my back is tight?',
  'What does progressive overload mean for my squat?',
  "What's the weather on Friday?",
  'Is the gym open on Sunday?',
  'What is a good calorie target for fat loss?',
  'how much protein is in an egg I still have?',
  'What weight did my wife use on bench?',
  'what should I do this week?',
  'what do you think of my week?',
  'any thoughts on my protein today?',
  // Ours
  'should I skip my rest day?',
  'do you think my bench is going up fast enough?',
  'plan out my next workout',
  'How much protein has my partner had today?',
  'what did they lift on goblet squats last time',
  // Someone else as the subject of an auxiliary (structural rule; no pronoun list in data).
  'What did she lift on goblet squats last time?',
  'how much protein has he had today?',
  'what does she bench?',
  'what did Sam squat last week?',
  'is it worth adding a set of bench today?',
];

describe('advice / judgement questions are not facts', () => {
  for (const t of ADVICE_NOT_FACTS)
    it(t, () => {
      expect(kindOf(t)).toBeNull();
    });

  it('Thai is never classified (it stays on the thai rules path)', () => {
    for (const t of ['วันนี้ควรเล่นหนักไหม', 'ควรพักไหม', 'โปรตีนเหลือเท่าไหร่'])
      expect([t, kindOf(t)]).toEqual([t, null]);
  });

  it('an auxiliary followed by I / you / my / me, a thing, a day or a number stays a lookup', () => {
    for (const [t, kind] of [
      ['What did I goblet squat last time?', 'lastSet'],
      ['How many sessions have I done this week?', 'week'],
      ['is my row going up', 'trend'],
      ['has my bench gone up?', 'trend'],
      ['what is my protein target', 'proteinTarget'],
      ['Is Friday a rest day?', 'restDay'],
      ['What does the dumbbell bench press work?', 'muscles'],
      ['what is up next for me?', 'nextSession'],
    ] as const)
      expect([t, kindOf(t)]).toEqual([t, kind]);
  });

  it('lookups that say "should" are still facts (planned weight / sets)', () => {
    expect(kindOf('What weight should I use on the bench press today?')).toBe('planned');
    expect(kindOf('How many sets should I do of bench today?')).toBe('planned');
  });
});

describe('answers are coaching copy', () => {
  it('second person, no he/she, pass checkCopy', () => {
    const texts = [
      ...(facts.items as FactItem[]).map((i) => i.text),
      ...REGRESSION.map(([t]) => t),
    ];
    for (const t of texts) {
      const a = answer(t) ?? '';
      expect(a, t).not.toBe('');
      expect([t, /\b(he|she|his|her|him)\b/i.test(a)]).toEqual([t, false]);
      expect([t, checkCopy(a).ok]).toEqual([t, true]);
    }
  });
});

describe('purity', () => {
  it('no DOM, clock or network', () => {
    expect(source).not.toMatch(/\b(window|document|Date\.now|new Date\(\)|fetch|localStorage)\b/);
  });
});
