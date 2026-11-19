import { describe, expect, it } from 'vitest';
import { checkCopy } from '../trainer/replies';
import type { GoalKind, Intake } from '../types';
import { INTAKE_OPTIONS, intakeToChanges, normalizeIntake, type IntakeCurrent } from './intake';

const intake = (extra: Partial<Intake> = {}): Intake => ({
  goalKind: 'muscle',
  days: 3,
  sessionMin: 60,
  experience: 'some',
  easyOn: [],
  at: 1_780_000_000_000,
  ...extra,
});

const fresh: IntakeCurrent = { hasHistory: false, planEdited: false, easyOn: [], fuel: null };
const existing: IntakeCurrent = { hasHistory: true, planEdited: true, easyOn: [], fuel: {} };

describe('intake options (data)', () => {
  it('goal kinds, days 2–6, session lengths and experience', () => {
    expect(INTAKE_OPTIONS.goalKinds.map((o) => o.id)).toEqual(['muscle', 'fat', 'strength', 'general']);
    expect(INTAKE_OPTIONS.goalKinds.map((o) => o.label)).toEqual(['Build muscle', 'Lose fat', 'Get stronger', 'General fitness']);
    expect(INTAKE_OPTIONS.days).toEqual([2, 3, 4, 5, 6]);
    expect(INTAKE_OPTIONS.sessionMin).toEqual([30, 45, 60, 75]);
    expect(INTAKE_OPTIONS.experience.map((o) => o.id)).toEqual(['new', 'some', 'years']);
    expect(INTAKE_OPTIONS.areas.map((o) => o.id)).toEqual(['arms', 'shoulders', 'chest', 'back', 'legs', 'core']);
  });
});

describe('M13c: "Add abs to your plan?" (data)', () => {
  it('one question after the go-easy step (the intake has no gym-kit step), No by default', () => {
    expect(INTAKE_OPTIONS.wantsCore).toEqual({
      id: 'wantsCore',
      after: 'easyOn',
      question: 'Add abs to your plan?',
      hint: 'A few abs sets on 3 days a week.',
      options: [
        { id: 'no', value: false, label: 'No' },
        { id: 'yes', value: true, label: 'Yes, add abs' },
      ],
      default: false,
      learnId: 'coreTraining',
    });
    const copy = [
      INTAKE_OPTIONS.wantsCore.question,
      INTAKE_OPTIONS.wantsCore.hint,
      ...INTAKE_OPTIONS.wantsCore.options.map((o) => o.label),
    ];
    for (const t of copy) {
      expect(checkCopy(t), t).toEqual({ ok: true, hits: [] });
      // Anyone-scan: the app talks to "you", never about he/she.
      expect(t, t).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
  });

  it('M13d copy budget: the hint is one sentence of ≤ 12 words, and question + hint fit the 20-word screen', () => {
    const words = (s: string) => s.trim().split(/\s+/).length;
    const { question, hint } = INTAKE_OPTIONS.wantsCore;
    expect(hint.split(/(?<=[.!?])\s+/).filter(Boolean)).toHaveLength(1);
    expect(words(hint)).toBeLessThanOrEqual(12);
    // The screen also shows "Question 6 of 6" (4 words); the readability budget is 20 besides the
    // options, so the data side keeps question + hint ≤ 16.
    expect(words(question) + words(hint)).toBeLessThanOrEqual(16);
  });

  it('normalizeIntake keeps a Yes / No answer and leaves it out when absent (= No)', () => {
    expect(normalizeIntake(intake({ wantsCore: true })).wantsCore).toBe(true);
    expect(normalizeIntake(intake({ wantsCore: false })).wantsCore).toBe(false);
    expect('wantsCore' in normalizeIntake(intake())).toBe(false);
    expect(normalizeIntake(intake({ wantsCore: 'yes' as never })).wantsCore).toBeUndefined();
  });
});

describe('normalizeIntake', () => {
  it('keeps a valid answer set as is', () => {
    const i = intake({ easyOn: ['shoulders'], goalText: 'Stronger for hiking' });
    expect(normalizeIntake(i)).toEqual(i);
  });

  it('clamps days to 2–6, falls back on junk, dedupes areas, trims own words', () => {
    expect(normalizeIntake(intake({ days: 9 })).days).toBe(6);
    expect(normalizeIntake(intake({ days: 1 })).days).toBe(2);
    expect(normalizeIntake(intake({ days: Number.NaN })).days).toBe(3);
    expect(normalizeIntake(intake({ sessionMin: 50 as Intake['sessionMin'] })).sessionMin).toBe(45);
    expect(normalizeIntake(intake({ easyOn: ['legs', 'legs', 'nose' as never, 'arms'] })).easyOn).toEqual(['legs', 'arms']);
    expect(normalizeIntake(intake({ goalText: '   ' })).goalText).toBeUndefined();
    expect(normalizeIntake(intake({ goalText: '  Run a 10k too  ' })).goalText).toBe('Run a 10k too');
    expect(normalizeIntake(intake({ goalKind: 'bulk' as GoalKind })).goalKind).toBe('general');
  });
});

describe('intakeToChanges', () => {
  it('fresh install: the starter plan first, then Fuel set-up for the goal', () => {
    const offers = intakeToChanges(intake(), fresh);
    expect(offers).toEqual([
      { kind: 'starterPlan', label: 'Build my starter plan', primary: true },
      { kind: 'fuelGoal', goalKind: 'muscle', needsSetup: true, label: 'Set up Fuel for this goal', primary: false },
    ]);
  });

  it('existing plan: a new plan is only an offer, never the primary one', () => {
    const offers = intakeToChanges(intake(), existing);
    expect(offers[0]).toEqual({ kind: 'starterPlan', label: 'Build a new plan from my answers', primary: false });
  });

  it('a plan he edited counts as existing even without a session', () => {
    const offers = intakeToChanges(intake(), { ...fresh, planEdited: true });
    expect(offers[0]).toMatchObject({ kind: 'starterPlan', label: 'Build a new plan from my answers', primary: false });
  });

  it('easy-on: offered only when the list would change, with what is added and removed', () => {
    expect(intakeToChanges(intake({ easyOn: ['shoulders'] }), existing).find((o) => o.kind === 'easyOn')).toEqual({
      kind: 'easyOn',
      areas: ['shoulders'],
      add: ['shoulders'],
      remove: [],
      label: 'Go easy on shoulders',
      primary: false,
    });
    expect(
      intakeToChanges(intake({ easyOn: ['legs', 'core'] }), { ...existing, easyOn: ['shoulders', 'legs'] }).find((o) => o.kind === 'easyOn'),
    ).toMatchObject({ areas: ['legs', 'core'], add: ['core'], remove: ['shoulders'], label: 'Update your go-easy list' });
    expect(intakeToChanges(intake({ easyOn: ['legs'] }), { ...existing, easyOn: ['legs'] }).some((o) => o.kind === 'easyOn')).toBe(false);
    expect(intakeToChanges(intake({ easyOn: [] }), existing).some((o) => o.kind === 'easyOn')).toBe(false);
    expect(intakeToChanges(intake({ easyOn: [] }), { ...existing, easyOn: ['back'] }).find((o) => o.kind === 'easyOn')).toMatchObject({
      areas: [],
      remove: ['back'],
      label: 'Clear your go-easy list',
    });
  });

  it('Fuel: offered when Fuel is set up and the goal differs; not when it already matches', () => {
    for (const kind of ['muscle', 'fat', 'strength', 'general'] as const) {
      expect(intakeToChanges(intake({ goalKind: kind }), existing).find((o) => o.kind === 'fuelGoal')).toEqual({
        kind: 'fuelGoal',
        goalKind: kind,
        needsSetup: false,
        label: 'Update Fuel targets',
        primary: false,
      });
    }
    const same = intakeToChanges(intake({ goalKind: 'fat' }), { ...existing, fuel: { goalKind: 'fat' } });
    expect(same.some((o) => o.kind === 'fuelGoal')).toBe(false);
  });

  it('order is fixed: plan, go-easy list, Fuel; exactly one primary at most', () => {
    const offers = intakeToChanges(intake({ goalKind: 'fat', easyOn: ['back'] }), fresh);
    expect(offers.map((o) => o.kind)).toEqual(['starterPlan', 'easyOn', 'fuelGoal']);
    expect(offers.filter((o) => o.primary)).toHaveLength(1);
  });

  it('every label passes the copy check', () => {
    const all = [
      ...intakeToChanges(intake({ easyOn: ['back'] }), fresh),
      ...intakeToChanges(intake({ easyOn: ['legs', 'core'] }), { ...existing, easyOn: ['arms'] }),
      ...intakeToChanges(intake({ easyOn: [] }), { ...existing, easyOn: ['arms'] }),
      ...INTAKE_OPTIONS.goalKinds,
      ...INTAKE_OPTIONS.experience,
      ...INTAKE_OPTIONS.areas,
    ];
    for (const o of all) expect(checkCopy(o.label)).toEqual({ ok: true, hits: [] });
  });
});
