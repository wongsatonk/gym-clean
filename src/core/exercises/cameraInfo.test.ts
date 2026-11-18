// SPEC M13c goal 4 + Accept: "camera info for every rule (counts line ≤ 10 words, checkCopy),
// null for manual exercises". The Camera sheet (src/ui/cameraInfoSheet.ts) renders this as is.
import { describe, expect, it } from 'vitest';
import exercisesJson from '../../data/exercises.json';
import { checkCopy } from '../trainer/replies';
import { cameraInfo } from './cameraInfo';
import { RULES, oneSidedLimb, ruleFor, ruleStatus } from './index';
import { ELBOW, KNEE, SHOULDER } from './triplets';
import type { ExerciseRule } from './types';

const catalogIds = (exercisesJson as { id: string }[]).map((e) => e.id);
const manualIds = catalogIds.filter((id) => ruleFor(id) === undefined);

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

/** The joint the rule measures, from its triplet (the counts line must name it). */
function jointOf(rule: ExerciseRule): 'elbow' | 'knee' | 'shoulder' {
  if (rule.triplets === ELBOW) return 'elbow';
  if (rule.triplets === KNEE) return 'knee';
  if (rule.triplets === SHOULDER) return 'shoulder';
  throw new Error(`${rule.folder}: unknown triplet`);
}

const GENDERED = /\b(he|him|his|she|her|hers|man|men|guy|guys|bro|dude)\b/i;

describe('cameraInfo', () => {
  it('has camera info for every rule', () => {
    expect(RULES.length).toBeGreaterThan(0);
    for (const rule of RULES) {
      expect(cameraInfo(rule.exerciseId), rule.folder).not.toBeNull();
    }
  });

  it.each(RULES.map((r) => [r.folder, r] as const))(
    '%s: counts line is short, plain coaching copy naming the measured joint',
    (_folder, rule) => {
      const line = rule.countsLine;
      expect(words(line).length).toBeGreaterThan(0);
      expect(words(line).length).toBeLessThanOrEqual(10);
      expect(checkCopy(line)).toEqual({ ok: true, hits: [] });
      expect(line).toMatch(/^Counts each .+\.$/);
      expect(line).toContain(`your ${jointOf(rule)} angle`);
      expect(line).not.toMatch(GENDERED);
    },
  );

  it.each(RULES.map((r) => [r.folder, r] as const))(
    '%s: carries the rule placement, status and one-sided limb',
    (_folder, rule) => {
      const info = cameraInfo(rule.exerciseId);
      if (!info) throw new Error('missing');
      expect(info.counts).toBe(rule.countsLine);
      expect(info.lines).toEqual([...rule.placement.lines]);
      expect(info.view).toBe(rule.placement.view);
      expect(info.facing).toBe(rule.placement.facing);
      expect(info.distanceM).toEqual([...rule.placement.distanceM]);
      expect(info.heightHint).toBe(rule.placement.heightHint);
      expect(info.learning).toBe(ruleStatus(rule.exerciseId) === 'learning');
      expect(info.oneSided).toBe(oneSidedLimb(rule.exerciseId));
      if (info.oneSided === undefined) expect('oneSided' in info).toBe(false);
    },
  );

  it('marks the learning rules and only them', () => {
    const learning = RULES.filter((r) => cameraInfo(r.exerciseId)?.learning).map((r) => r.folder);
    expect(learning).toEqual(RULES.filter((r) => r.status === 'learning').map((r) => r.folder));
    expect(learning.length).toBeGreaterThan(0);
    expect(cameraInfo('Dumbbell_Bicep_Curl')?.learning).toBe(false);
  });

  it('flags one-sided exercises (M13b list)', () => {
    expect(cameraInfo('One-Arm_Dumbbell_Row')?.oneSided).toBe('arm');
    expect(cameraInfo('Concentration_Curls')?.oneSided).toBe('arm');
    expect(cameraInfo('Dumbbell_Bicep_Curl')?.oneSided).toBeUndefined();
  });

  it('gives a known example line', () => {
    expect(cameraInfo('Dumbbell_Bicep_Curl')?.counts).toBe(
      'Counts each curl from your elbow angle.',
    );
  });

  it('returns null for manual exercises and unknown ids', () => {
    expect(manualIds.length).toBeGreaterThan(0);
    for (const id of manualIds) expect(cameraInfo(id), id).toBeNull();
    expect(cameraInfo('')).toBeNull();
    expect(cameraInfo('Not_An_Exercise')).toBeNull();
    expect(cameraInfo('constructor')).toBeNull();
  });

  it('returns copies: changing the info never changes the rule', () => {
    const rule = ruleFor('Dumbbell_Bicep_Curl');
    const info = cameraInfo('Dumbbell_Bicep_Curl');
    if (!rule || !info) throw new Error('missing');
    const lines = [...rule.placement.lines];
    const distance = [...rule.placement.distanceM];
    info.lines.push('extra');
    (info.distanceM as [number, number])[0] = 99;
    expect([...rule.placement.lines]).toEqual(lines);
    expect([...rule.placement.distanceM]).toEqual(distance);
    expect(cameraInfo('Dumbbell_Bicep_Curl')?.lines).toEqual(lines);
  });
});
