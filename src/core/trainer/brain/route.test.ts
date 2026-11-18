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
    for (const t of ['What am I training today?', 'how is my week', 'tell me a joke']) {
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
