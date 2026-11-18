import { describe, expect, it } from 'vitest';
import programJson from '../../../data/program.json';
import facts from '../evals/facts.json';
import requests from '../evals/requests.json';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import type { Program } from '../../types';
import type { IntentMatch } from '../intents';
import { factsInput, type FactsScenario } from './readTools';
import { RULES_ACTION_INTENTS, routeMessage, toolCallFor } from './route';
import source from './route.ts?raw';

// Made-up scenario (evals/facts.json): the default program, no personal data.
const coach = factsInput(
  facts.scenario as FactsScenario,
  programJson as Program,
  trainerCatalog(),
).coach;
const TODAY = coach.today; // 2026-11-11, a Wednesday (made up)
const m = (o: Partial<IntentMatch>): IntentMatch => ({
  intent: 'help',
  slots: {},
  safety: 'none',
  ...o,
});

describe('RULES_ACTION_INTENTS', () => {
  it('every intent except help, week and progress', () => {
    expect([...RULES_ACTION_INTENTS].sort()).toEqual(
      [
        'postpone',
        'avoidArea',
        'lighter',
        'deload',
        'swap',
        'stall',
        'food',
        'focusBlock',
        'focusEdit',
        'doToday',
        'shortOnTime',
      ].sort(),
    );
  });
});

describe('routeMessage', () => {
  it('a change request goes to the rules with the call a correct model would make', () => {
    const r = routeMessage('go lighter today', coach);
    expect(r).toMatchObject({ to: 'rules', why: 'action', call: { name: 'lighterToday' } });
    const d = routeMessage('do push b today', coach);
    expect(d).toMatchObject({
      to: 'rules',
      why: 'action',
      call: { name: 'doDayToday', args: { day: 'Push B' } },
    });
  });

  it('open chat goes to the model', () => {
    for (const t of [
      "what's the weather",
      'tell me a joke',
      'How am I doing?',
      'how do I brace for squats?',
    ]) {
      const r = routeMessage(t, coach);
      expect([t, r.to]).toEqual([t, 'model']);
      expect(r).not.toHaveProperty('call');
    }
  });

  it('a red flag goes to the rules with no call, even when it also asks for a change', () => {
    for (const t of ['I have chest pain', 'tingling down my arm, skip arms today', 'เจ็บหน้าอก']) {
      const r = routeMessage(t, coach);
      expect(r).toMatchObject({ to: 'rules', why: 'redFlag' });
      expect(r).not.toHaveProperty('call');
    }
  });

  // Phone eval (1.15.0): req-073 " " reached the model and failed in the bridge.
  it('empty or whitespace text never reaches the model', () => {
    for (const t of ['', ' ', '\n\t ']) {
      const r = routeMessage(t, coach);
      expect(r).toMatchObject({ to: 'rules', why: 'empty' });
      expect(r).not.toHaveProperty('call');
    }
  });

  // Apple's model has no Thai: req-013 was swapped by sanitize, req-034 a bridge error.
  it('Thai text goes to the rules, with the call when the rules read an action', () => {
    expect(routeMessage('งดวันนี้นะ', coach)).toMatchObject({
      to: 'rules',
      why: 'thai',
      call: { name: 'postponeSession', args: { from: TODAY } },
    });
    const hi = routeMessage('สวัสดี', coach);
    expect(hi).toMatchObject({ to: 'rules', why: 'thai' });
    expect(hi).not.toHaveProperty('call');
  });

  // 1.15.2 phone eval: facts dropped 17 → 13 of 24 because these six questions got action cards;
  // 1.16.1: the model then quoted wrong numbers. 1.16.2: they take the facts route (no call).
  it('a question about the user’s own numbers takes the facts route, with the match', () => {
    for (const [id, want, kind] of [
      ['monthSessions', 'focusEdit', 'month'],
      ['pulldownBest', 'focusEdit', 'bestSet'],
      ['kcalEaten', 'food', 'kcalEaten'],
      ['proteinTarget', 'food', 'proteinTarget'],
      ['kcalLeft', 'food', 'kcalLeft'],
      ['proteinLeft', 'food', 'proteinLeft'],
    ] as const) {
      const text = facts.items.find((f) => f.id === id)?.text ?? '';
      expect(text).not.toBe('');
      const r = routeMessage(text, coach);
      expect([id, r]).toMatchObject([id, { to: 'rules', why: 'facts', fact: { kind } }]);
      expect(r).not.toHaveProperty('call');
      expect([id, r.match.intent]).toEqual([id, want]);
    }
  });

  it('every facts question takes the facts route, with no call', () => {
    for (const f of facts.items) {
      const r = routeMessage(f.text, coach);
      expect([f.id, r.to, r.to === 'rules' ? r.why : undefined]).toEqual([f.id, 'rules', 'facts']);
      expect(r).not.toHaveProperty('call');
    }
  });

  it('red flags, empty text and Thai win over the facts route', () => {
    expect(routeMessage('how much protein is left? I have chest pain', coach)).toMatchObject({
      to: 'rules',
      why: 'redFlag',
    });
    expect(routeMessage('โปรตีนเหลือเท่าไหร่', coach)).toMatchObject({ to: 'rules', why: 'thai' });
    expect(routeMessage('  ', coach)).toMatchObject({ to: 'rules', why: 'empty' });
  });

  it('change requests phrased as questions keep their rules action, never facts', () => {
    for (const [text, name] of [
      ['How much lighter should I go today?', 'lighterToday'],
      ['What should I do with 20 minutes left?', 'shortOnTime'],
      ['how much protein is left for dinner', 'suggestFood'],
      ['How much weight should I drop on bench, it stalled', 'adjustStalledExercise'],
      ['Can I do lunges instead of the goblet squat?', 'swapExercise'],
      ['how many fewer sets today', 'lighterToday'],
    ] as const)
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', why: 'action', call: { name } },
      ]);
  });

  it('"why" questions are never facts ("why do I need protein" is a rules food answer)', () => {
    const r = routeMessage('why do I need protein', coach);
    expect(r).toMatchObject({ to: 'rules', why: 'action', match: { intent: 'food' } });
    expect(routeMessage('why is my bench going up so slowly?', coach).to).toBe('model');
  });

  // Coach decision (1.16.2 review): advice / judgement / "plan my…" go to the model, never facts.
  it('advice and judgement questions never take the facts route; open ones go to the model', () => {
    for (const text of [
      'Should I train hard today?',
      'Any thoughts on how today should go?',
      'Plan my week again',
      'How hard should I go today?',
      'what should I do this week?',
      'Am I ready to train today?',
      'Should I go to the gym today?',
      'What weight did my wife use on bench?',
    ]) {
      const r = routeMessage(text, coach);
      expect([text, r.to]).toEqual([text, 'model']);
    }
    // A rules action is fine, just never facts: deload; "two days" reads as a focusEdit; "focus"
    // reads as a focusBlock (pre-existing rules routing, unchanged here).
    for (const text of [
      'Do you think I should deload?',
      'Is it OK to train legs two days in a row?',
      'What should I focus on today?',
    ]) {
      const r = routeMessage(text, coach);
      expect([text, r.to === 'rules' && r.why === 'facts']).toEqual([text, false]);
    }
    for (const text of ['วันนี้ควรเล่นหนักไหม', 'ควรพักไหม']) {
      const r = routeMessage(text, coach);
      expect([text, r.to, r.to === 'rules' ? r.why : undefined]).toEqual([text, 'rules', 'thai']);
    }
  });

  it('"Plan for tomorrow" and "Next session?" are lookups: facts', () => {
    for (const text of ['Plan for tomorrow', 'Next session?', 'How is my week going?'])
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', why: 'facts' },
      ]);
  });

  it('a discomfort word never takes the facts route', () => {
    const r = routeMessage('my knee hurts, how heavy is the goblet squat today?', coach);
    expect(r.to === 'rules' && r.why === 'facts').toBe(false);
  });

  it('the own-numbers guard stays narrow: change requests still go to the rules', () => {
    for (const [text, name] of [
      ['how much protein is left for dinner', 'suggestFood'], // req-066: a meal word asks for ideas
      ['What should I eat?', 'suggestFood'],
      ['Can you move my session to Friday?', 'postponeSession'],
      ['The leg press is taken, what else can I do?', 'swapExercise'],
    ] as const)
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', why: 'action', call: { name } },
      ]);
  });

  it('red flags, empty and Thai win over the own-numbers guard', () => {
    expect(routeMessage('How much chest pain is normal?', coach)).toMatchObject({
      to: 'rules',
      why: 'redFlag',
    });
    expect(routeMessage('   ', coach)).toMatchObject({ to: 'rules', why: 'empty' });
    expect(routeMessage('how many กินอะไรดี', coach)).toMatchObject({ to: 'rules', why: 'thai' });
  });

  // Reviewer (1.15.2 follow-up): change requests phrased as questions keep their rules card.
  it('advice questions and questions with a command word keep their rules action', () => {
    for (const [text, name, exerciseId] of [
      ['What should I do with 20 minutes left?', 'shortOnTime'],
      ['How much lighter should I go today?', 'lighterToday'],
      ['How many sets should I cut today, I am tired', 'lighterToday'],
      ['How many reps left in my plan? go lighter', 'lighterToday'],
      ['how much should I deload', 'deloadWeek'],
      ['How much protein should I eat?', 'suggestFood'],
      ['How many calories should I eat today?', 'suggestFood'],
      ['What can I eat with 40g protein left?', 'suggestFood'],
      ["What's the best swap for the bench press?", 'swapExercise', 'Dumbbell_Bench_Press'],
      [
        'How much weight should I drop on bench, it stalled',
        'adjustStalledExercise',
        'Dumbbell_Bench_Press',
      ],
      ['Did I stall on bench? swap it', 'swapExercise', 'Dumbbell_Bench_Press'],
    ] as const) {
      const r = routeMessage(text, coach);
      expect([text, r.to, 'call' in r ? r.call?.name : undefined]).toEqual([text, 'rules', name]);
      if (exerciseId) expect([text, r.match.slots.exerciseId]).toEqual([text, exerciseId]);
    }
  });

  it('history questions with a command word (did I skip / cut / drop) go to the model', () => {
    for (const text of [
      'How many sessions did I skip this month?',
      'How many calories did I cut this week?',
      'Did I drop below my calorie target?',
    ]) {
      const r = routeMessage(text, coach);
      expect([text, r.to]).toEqual([text, 'model']);
      expect(r).not.toHaveProperty('call');
    }
  });

  it('fewer / less / easier questions stay a rules lighter', () => {
    for (const text of [
      'how many fewer sets today',
      'how much easier today please',
      'how much less weight today, feeling flat',
    ])
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', call: { name: 'lighterToday' } },
      ]);
  });

  it('a session length wins over the guard: rules shortOnTime', () => {
    for (const [text, minutes] of [
      ['how much do I have left, I only have 30 min', 30],
      ['how much time left? 15 minutes', 20],
      ['how many minutes do I have, only 20 min today', 20],
    ] as const)
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', call: { name: 'shortOnTime', args: { minutes } } },
      ]);
  });

  // 1.16.0 M13c: asking for abs/core is a core focus block; questions about it are the model's.
  it('an abs / core request is a rules core block; a question about it goes to the model', () => {
    for (const [text, why] of [
      ['add abs', 'action'],
      ['six pack', 'action'],
      ['ท้อง', 'thai'],
    ] as const)
      expect([text, routeMessage(text, coach)]).toMatchObject([
        text,
        { to: 'rules', why, call: { name: 'proposeFocusBlock', args: { group: 'core' } } },
      ]);
    for (const text of ["what's my core focus", 'how many abs exercises are there?']) {
      const r = routeMessage(text, coach);
      expect([text, r.to]).toEqual([text, 'model']);
      expect(r).not.toHaveProperty('call');
    }
  });

  it('"crunches instead of sit-ups" is a rules swap of Crunches, never Step Ups', () => {
    expect(routeMessage('do crunches instead of sit-ups', coach)).toMatchObject({
      to: 'rules',
      call: { name: 'swapExercise', args: { exerciseId: 'Crunches' } },
    });
  });

  it('"X instead of Y" with an unclear Y never swaps X; it goes to the model', () => {
    const r = routeMessage('Can I do the leg press instead of rows?', coach);
    expect(r.match.slots.exerciseId).not.toBe('Leg_Press');
    if (r.match.slots.exerciseId === undefined) expect(r.to).toBe('model');
  });

  it('every action request in the eval set the rules read as an action goes to the rules', () => {
    for (const it of requests.items) {
      if (it.safety === 'redFlag' || !RULES_ACTION_INTENTS.has(it.intent as never)) continue;
      expect([it.text, routeMessage(it.text, coach).to]).toEqual([it.text, 'rules']);
    }
  });

  // req-058: "instead of" names two exercises; the rules now read the replaced one.
  it('"X instead of Y" is a rules swap of Y', () => {
    expect(routeMessage('Can I do face pulls instead of reverse flyes?', coach)).toMatchObject({
      to: 'rules',
      why: 'action',
      call: { name: 'swapExercise', args: { exerciseId: 'Reverse_Flyes' } },
    });
  });

  it('a swap or stall naming an exercise the rules cannot pin down goes to the model', () => {
    for (const text of [
      'swap face pulls or reverse flyes',
      'reverse flyes and face pulls have stalled',
    ]) {
      const r = routeMessage(text, coach);
      expect([text, r.to]).toEqual([text, 'model']);
      expect(['swap', 'stall']).toContain(r.match.intent);
      expect(r.match.slots.exerciseId).toBeUndefined();
    }
    // Naming none: the rules ask which one (a picker, not an empty card).
    expect(routeMessage('Swap an exercise', coach)).toMatchObject({
      to: 'rules',
      call: { name: 'swapExercise', args: {} },
    });
    expect(routeMessage('Adjust my plan', coach)).toMatchObject({
      to: 'rules',
      call: { name: 'adjustStalledExercise', args: {} },
    });
  });

  it('carries the same match handle() acts on', () => {
    const r = routeMessage('swap the leg press', coach);
    expect(r.match).toMatchObject({ intent: 'swap', slots: { exerciseId: 'Leg_Press' } });
  });

  it('routes every committed eval item without throwing; red flags never go to the model', () => {
    for (const it of requests.items) {
      const r = routeMessage(it.text, coach);
      if (it.safety === 'redFlag') expect([it.text, r.to]).toEqual([it.text, 'rules']);
    }
  });
});

/**
 * Regression paraphrases (1.15.2 follow-up): written after the 109/109 fit and reviewed, so they
 * are not truly held out. Grow this list from his real phone eval exports (made-up wording, no
 * personal data). [text, route, intent the match must have].
 */
const REGRESSION_PARAPHRASES: readonly [string, 'rules' | 'model' | 'facts', string][] = [
  // Questions about the user's own numbers → the facts answerer (1.16.2; the model before).
  ['How many workouts have I done this month?', 'facts', 'focusEdit'],
  ["What's my calorie target?", 'facts', 'food'],
  ['How much protein have I had today?', 'facts', 'food'],
  ['How many calories are left for me today?', 'facts', 'food'],
  // ... and the ones it has no answer for (history it can't compute) → the model.
  ['When did I last do legs?', 'model', 'doToday'],
  ['Did I hit my protein yesterday?', 'model', 'food'],
  // Change requests → the rules.
  ['What should I do with 20 minutes left?', 'rules', 'shortOnTime'],
  ['Only have 25 minutes left today', 'rules', 'shortOnTime'],
  ['How much lighter should I go today?', 'rules', 'lighter'],
  ['feeling a bit flat today, go easy', 'rules', 'lighter'],
  ['Everything feels meh today', 'rules', 'lighter'],
  ['how much should I deload', 'rules', 'deload'],
  ['I need a deload', 'rules', 'deload'],
  ['How much protein should I eat?', 'rules', 'food'],
  ['What can I snack on?', 'rules', 'food'],
  ['any dinner ideas with the protein I have left?', 'rules', 'food'],
  ["What's the best swap for the bench press?", 'rules', 'swap'],
  ['Swap the goblet squat please', 'rules', 'swap'],
  ['Use the cable row instead of the lat pulldown', 'rules', 'swap'],
  ['Can I do lunges instead of the goblet squat?', 'rules', 'swap'],
  ['Did I stall on bench? swap it', 'rules', 'swap'],
  ['How much weight should I drop on bench, it stalled', 'rules', 'stall'],
  ["I'm stuck on the shoulder press", 'rules', 'stall'],
  ['my legs are wrecked', 'rules', 'avoidArea'],
  ['do crunches instead of sit-ups', 'rules', 'swap'],
  // Known rules gap (pinned, not tuned): "push today's session" isn't a postpone phrase; the model
  // gets it.
  ["Could you push today's session to Saturday?", 'model', 'help'],
  // Re-review: history questions with a command word → the model.
  ['How many sessions did I skip this month?', 'model', 'focusEdit'],
  ['How many calories did I cut this week?', 'model', 'food'],
  ['Did I drop below my calorie target?', 'model', 'food'],
  // Re-review: lighter and session-length questions → the rules.
  ['how many fewer sets today', 'rules', 'lighter'],
  ['how much easier today please', 'rules', 'lighter'],
  ['how much less weight today, feeling flat', 'rules', 'lighter'],
  ['how much do I have left, I only have 30 min', 'rules', 'shortOnTime'],
  ['how much time left? 15 minutes', 'rules', 'shortOnTime'],
  ['how many minutes do I have, only 20 min today', 'rules', 'shortOnTime'],
];

describe('regression paraphrases', () => {
  it('route as pinned', () => {
    const got = REGRESSION_PARAPHRASES.map(([text]) => {
      const r = routeMessage(text, coach);
      return [text, r.to === 'rules' && r.why === 'facts' ? 'facts' : r.to, r.match.intent];
    });
    expect(got).toEqual(REGRESSION_PARAPHRASES.map((h) => [...h]));
  });
});

describe('toolCallFor', () => {
  it('postpone: from = the resolved day (default today), to when a move day is named', () => {
    expect(toolCallFor(m({ intent: 'postpone' }), TODAY)).toEqual({
      name: 'postponeSession',
      args: { from: TODAY },
    });
    expect(
      toolCallFor(m({ intent: 'postpone', slots: { date: 'tomorrow', moveTo: 'fri' } }), TODAY),
    ).toEqual({ name: 'postponeSession', args: { from: '2026-11-12', to: '2026-11-13' } });
    // A weekday is the next one, 1-7 days ahead (today is a Wednesday).
    expect(toolCallFor(m({ intent: 'postpone', slots: { date: 'wed' } }), TODAY)?.args).toEqual({
      from: '2026-11-18',
    });
  });

  it('doToday, avoidArea, lighter, deload, food', () => {
    expect(toolCallFor(m({ intent: 'doToday', slots: { dayName: 'Legs A' } }), TODAY)).toEqual({
      name: 'doDayToday',
      args: { day: 'Legs A' },
    });
    expect(toolCallFor(m({ intent: 'doToday' }), TODAY)).toEqual({
      name: 'doDayToday',
      args: {},
    });
    expect(toolCallFor(m({ intent: 'avoidArea', slots: { area: 'legs' } }), TODAY)).toEqual({
      name: 'avoidBodyArea',
      args: { area: 'legs' },
    });
    expect(toolCallFor(m({ intent: 'avoidArea' }), TODAY)).toEqual({
      name: 'avoidBodyArea',
      args: {},
    });
    expect(toolCallFor(m({ intent: 'lighter' }), TODAY)).toEqual({
      name: 'lighterToday',
      args: {},
    });
    expect(toolCallFor(m({ intent: 'deload' }), TODAY)).toEqual({ name: 'deloadWeek', args: {} });
    expect(toolCallFor(m({ intent: 'food' }), TODAY)).toEqual({ name: 'suggestFood', args: {} });
  });

  it('swap and stall carry the exercise (and scope)', () => {
    expect(
      toolCallFor(
        m({ intent: 'swap', slots: { exerciseId: 'Leg_Press', scope: 'plan', area: 'legs' } }),
        TODAY,
      ),
    ).toEqual({ name: 'swapExercise', args: { exerciseId: 'Leg_Press', scope: 'plan' } });
    expect(toolCallFor(m({ intent: 'swap' }), TODAY)).toEqual({ name: 'swapExercise', args: {} });
    expect(
      toolCallFor(m({ intent: 'stall', slots: { exerciseId: 'Dumbbell_Bench_Press' } }), TODAY),
    ).toEqual({ name: 'adjustStalledExercise', args: { exerciseId: 'Dumbbell_Bench_Press' } });
  });

  it('focusBlock: group, weeks and the default weekdays for the days a week', () => {
    expect(
      toolCallFor(
        m({ intent: 'focusBlock', slots: { group: 'chest', weeks: 4, daysPerWeek: 3 } }),
        TODAY,
      ),
    ).toEqual({
      name: 'proposeFocusBlock',
      args: { group: 'chest', weeks: 4, weekdays: [1, 3, 5] },
    });
    expect(toolCallFor(m({ intent: 'focusBlock' }), TODAY)).toEqual({
      name: 'proposeFocusBlock',
      args: {},
    });
    // Days a week outside 3-6 have no default weekdays: left out, never a throw.
    expect(
      toolCallFor(m({ intent: 'focusBlock', slots: { daysPerWeek: 9 } }), TODAY)?.args,
    ).toEqual({});
  });

  it('focusEdit: an exercise is a swap, otherwise a block edit', () => {
    expect(
      toolCallFor(m({ intent: 'focusEdit', slots: { exerciseId: 'Push_Up', weeks: 3 } }), TODAY),
    ).toEqual({ name: 'swapExercise', args: { exerciseId: 'Push_Up' } });
    expect(
      toolCallFor(m({ intent: 'focusEdit', slots: { weeks: 6, daysPerWeek: 4 } }), TODAY),
    ).toEqual({ name: 'proposeFocusBlock', args: { weeks: 6, weekdays: [1, 2, 4, 5] } });
  });

  it('shortOnTime snaps the minutes to an option', () => {
    expect(toolCallFor(m({ intent: 'shortOnTime', slots: { minutes: 35 } }), TODAY)).toEqual({
      name: 'shortOnTime',
      args: { minutes: 30 },
    });
    expect(toolCallFor(m({ intent: 'shortOnTime' }), TODAY)).toEqual({
      name: 'shortOnTime',
      args: {},
    });
  });

  it('help, week and progress: no call', () => {
    for (const intent of ['help', 'week', 'progress'] as const)
      expect(toolCallFor(m({ intent }), TODAY)).toBeNull();
  });
});

describe('purity', () => {
  it('no DOM, clock or network', () => {
    expect(source).not.toMatch(/\b(window|document|Date\.now|fetch|localStorage)\b/);
  });
});
