import { describe, expect, it } from 'vitest';
import program from '../../data/program.json';
import { LANDMARK, LANDMARK_COUNT } from '../poseTopology';
import type { LandmarkFrame } from '../types';
import { AUTO_SET_DEFAULTS } from '../autoSet';
import { CUE_TEXT } from '../focus';
import type { FocusCueId } from '../types';
import {
  autoSetConfigFor,
  extendedGatePasses,
  FOCUS_RULE_IDS,
  focusFlagsFor,
  FORM_RULE_EXERCISES,
  FORM_RULE_IDS,
  formRulesWithoutRealFixtures,
  RULES,
  ruleFor,
  ruleForFolder,
} from './index';
import type { ExerciseRule } from './types';

const L = LANDMARK;

const poseIds = [
  ...new Set(
    program.days.flatMap((d) =>
      d.exercises.filter((e) => e.tracking === 'pose').map((e) => e.exerciseId),
    ),
  ),
];

describe('rule coverage', () => {
  it('program has the six pose-tracked exercises', () => {
    expect(poseIds.sort()).toEqual(
      [
        'Dumbbell_Bicep_Curl',
        'Goblet_Squat',
        'One-Arm_Dumbbell_Row',
        'Pushups',
        'Seated_Dumbbell_Press',
        'Side_Lateral_Raise',
      ].sort(),
    );
  });

  it('every pose exercise has exactly one rule', () => {
    for (const id of poseIds) {
      expect(
        RULES.filter((r) => r.exerciseId === id),
        id,
      ).toHaveLength(1);
      expect(ruleFor(id)?.exerciseId).toBe(id);
    }
  });

  it("every rule's exerciseId is a pose exercise", () => {
    for (const r of RULES) expect(poseIds).toContain(r.exerciseId);
  });

  it('folder names are unique and match the fixture folders', () => {
    const folders = RULES.map((r) => r.folder);
    expect(new Set(folders).size).toBe(folders.length);
    expect([...folders].sort()).toEqual(
      ['curl', 'goblet-squat', 'lateral-raise', 'push-up', 'row', 'shoulder-press'].sort(),
    );
    for (const r of RULES) expect(ruleForFolder(r.folder)).toBe(r);
  });

  it('unknown ids and folders return undefined', () => {
    expect(ruleFor('Dumbbell_Bench_Press')).toBeUndefined();
    expect(ruleFor('')).toBeUndefined();
    expect(ruleForFolder('bench')).toBeUndefined();
  });
});

describe.each(RULES.map((r) => [r.folder, r] as const))('rule %s', (_folder, r: ExerciseRule) => {
  it('thresholds are ordered for its direction, with room for hysteresis', () => {
    if (r.direction === 'decreasing') {
      expect(r.contracted + r.hysteresisDeg).toBeLessThan(r.extended - r.hysteresisDeg);
    } else {
      expect(r.contracted - r.hysteresisDeg).toBeGreaterThan(r.extended + r.hysteresisDeg);
    }
    for (const v of [r.extended, r.contracted]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(180);
    }
  });

  it('a partial (start threshold ± minPartialDepth) is past the hysteresis and short of the far threshold', () => {
    expect(r.minPartialDepthDeg).toBeGreaterThan(r.hysteresisDeg);
    const span = Math.abs(r.extended - r.contracted);
    expect(r.minPartialDepthDeg).toBeLessThan(span);
  });

  it('triplets are valid landmark indices, distinct per side, mirrored left/right', () => {
    for (const side of ['left', 'right'] as const) {
      const t = r.triplets[side];
      expect(new Set(t).size).toBe(3);
      for (const i of t) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(LANDMARK_COUNT);
      }
    }
    // BlazePose: every left landmark (≥ 11) is odd, its right twin is +1.
    r.triplets.left.forEach((i, k) => {
      expect(r.triplets.right[k]).toBe(i + 1);
    });
  });

  it('counter tuning values are sane', () => {
    expect(r.emaAlpha).toBeGreaterThan(0);
    expect(r.emaAlpha).toBeLessThanOrEqual(1);
    expect(r.minPhaseMs).toBeGreaterThan(0);
    expect(r.minVisibility).toBeGreaterThan(0);
    expect(r.minVisibility).toBeLessThan(1);
  });
});

// SPEC §2 M4 table as tuned on the fixtures in M4 task 7 (see the 2026-11-13 Decision).
describe('per-exercise data (SPEC §2 M4 table)', () => {
  const get = (folder: string): ExerciseRule => {
    const r = ruleForFolder(folder);
    if (!r) throw new Error(folder);
    return r;
  };

  it.each([
    ['curl', 'Dumbbell_Bicep_Curl', 'side', 150, 70],
    ['push-up', 'Pushups', 'side', 150, 95],
    ['shoulder-press', 'Seated_Dumbbell_Press', 'front', 143, 80],
    ['row', 'One-Arm_Dumbbell_Row', 'side', 145, 90],
    ['goblet-squat', 'Goblet_Squat', 'side', 160, 100],
    ['lateral-raise', 'Side_Lateral_Raise', 'front', 25, 75],
  ] as const)('%s → %s, %s view, extended %d, contracted %d', (folder, id, view, ext, con) => {
    const r = get(folder);
    expect(r.exerciseId).toBe(id);
    expect(r.view).toBe(view);
    expect(r.extended).toBe(ext);
    expect(r.contracted).toBe(con);
  });

  it('joint triplets: elbow for arms, knee for squat, shoulder for lateral raise', () => {
    const elbow = {
      left: [L.LEFT_SHOULDER, L.LEFT_ELBOW, L.LEFT_WRIST],
      right: [L.RIGHT_SHOULDER, L.RIGHT_ELBOW, L.RIGHT_WRIST],
    };
    for (const f of ['curl', 'push-up', 'shoulder-press', 'row'])
      expect(get(f).triplets).toEqual(elbow);
    expect(get('goblet-squat').triplets).toEqual({
      left: [L.LEFT_HIP, L.LEFT_KNEE, L.LEFT_ANKLE],
      right: [L.RIGHT_HIP, L.RIGHT_KNEE, L.RIGHT_ANKLE],
    });
    expect(get('lateral-raise').triplets).toEqual({
      left: [L.LEFT_HIP, L.LEFT_SHOULDER, L.LEFT_ELBOW],
      right: [L.RIGHT_HIP, L.RIGHT_SHOULDER, L.RIGHT_ELBOW],
    });
  });

  it('lateral raise is the only inverted (increasing) rule', () => {
    for (const r of RULES) {
      expect(r.direction).toBe(r.folder === 'lateral-raise' ? 'increasing' : 'decreasing');
    }
  });

  it('shoulder press starts contracted, the rest start extended', () => {
    for (const r of RULES) {
      expect(r.start).toBe(r.folder === 'shoulder-press' ? 'contracted' : 'extended');
    }
  });

  it('eccentric (lowering) phase: toward extended for curl/row/raise, toward contracted for push-up/squat/press', () => {
    expect(get('curl').eccentric).toBe('toExtended');
    expect(get('row').eccentric).toBe('toExtended');
    expect(get('lateral-raise').eccentric).toBe('toExtended');
    expect(get('push-up').eccentric).toBe('toContracted');
    expect(get('goblet-squat').eccentric).toBe('toContracted');
    expect(get('shoulder-press').eccentric).toBe('toContracted');
  });

  it('side views use the best-visible side, front views use both', () => {
    for (const r of RULES) expect(r.sideMode).toBe(r.view === 'side' ? 'best' : 'both');
  });

  it('limb label: leg for squat, arm otherwise', () => {
    for (const r of RULES) expect(r.limb).toBe(r.folder === 'goblet-squat' ? 'leg' : 'arm');
  });

  it('only the shoulder press has an extended gate (wrist above shoulder)', () => {
    for (const r of RULES) {
      if (r.folder === 'shoulder-press') {
        expect(r.extendedGate).toEqual({
          upper: { left: L.LEFT_WRIST, right: L.RIGHT_WRIST },
          lower: { left: L.LEFT_SHOULDER, right: L.RIGHT_SHOULDER },
        });
      } else {
        expect(r.extendedGate).toBeUndefined();
      }
    }
  });

  it('SPEC §3 counter defaults: EMA 0.4, 10° hysteresis, 250 ms phase, visibility 0.5', () => {
    for (const r of RULES) {
      expect(r.emaAlpha).toBe(0.4);
      expect(r.hysteresisDeg).toBe(10);
      expect(r.minPhaseMs).toBe(250);
      expect(r.minVisibility).toBe(0.5);
    }
  });
});

describe('extendedGatePasses', () => {
  const press = ruleForFolder('shoulder-press');
  const curl = ruleForFolder('curl');
  if (!press || !curl) throw new Error('rules missing');

  /** Image y grows downward. */
  function frameWith(wristY: number, shoulderY: number): LandmarkFrame {
    const landmarks = Array.from({ length: LANDMARK_COUNT }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));
    for (const [w, s] of [
      [L.LEFT_WRIST, L.LEFT_SHOULDER],
      [L.RIGHT_WRIST, L.RIGHT_SHOULDER],
    ] as const) {
      landmarks[w] = { x: 0.5, y: wristY, z: 0, visibility: 0.9 };
      landmarks[s] = { x: 0.5, y: shoulderY, z: 0, visibility: 0.9 };
    }
    return { t: 0, landmarks };
  }

  it('passes when the wrist is above the shoulder (smaller image y)', () => {
    expect(extendedGatePasses(press, frameWith(0.1, 0.3), 'right')).toBe(true);
    expect(extendedGatePasses(press, frameWith(0.1, 0.3), 'left')).toBe(true);
  });

  it('fails with arms hanging at the sides (wrist below shoulder)', () => {
    expect(extendedGatePasses(press, frameWith(0.6, 0.3), 'right')).toBe(false);
  });

  it('fails when the gate landmarks are missing', () => {
    expect(extendedGatePasses(press, { t: 0, landmarks: [] }, 'right')).toBe(false);
  });

  it('always passes for rules without a gate', () => {
    expect(extendedGatePasses(curl, frameWith(0.6, 0.3), 'right')).toBe(true);
    expect(extendedGatePasses(curl, { t: 0, landmarks: [] }, 'left')).toBe(true);
  });
});

// M4c: coaching hints and phone placement are data on each rule (SPEC §1 coaching principle).
const BANNED = /\b(pain\w*|injur\w*|hurt\w*|damage\w*|safe\w*|risk\w*|strain\w*|tear\w*)\b/i;
const words = (s: string) => s.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));

describe.each(RULES.map((r) => [r.folder, r] as const))('rule %s coaching data', (_f, r) => {
  it('has a hint for both partial reasons: ≤ 6 words, a sentence, coaching language only', () => {
    for (const reason of ['far', 'start'] as const) {
      const hint = r.hints[reason];
      expect(hint, reason).toMatch(/^[A-Z].*\.$/);
      expect(words(hint).length, hint).toBeGreaterThan(0);
      expect(words(hint).length, hint).toBeLessThanOrEqual(6);
      expect(hint).not.toMatch(BANNED);
    }
    expect(r.hints.far).not.toBe(r.hints.start);
  });

  it('has phone placement matching its view: 1–3 lines ≤ 8 words, one spoken sentence', () => {
    const p = r.placement;
    expect(p.view).toBe(r.view);
    expect(p.lines.length).toBeGreaterThanOrEqual(1);
    expect(p.lines.length).toBeLessThanOrEqual(3);
    for (const line of p.lines) {
      expect(words(line).length, line).toBeGreaterThan(0);
      expect(words(line).length, line).toBeLessThanOrEqual(8);
      expect(line).not.toMatch(BANNED);
    }
    const [near, far] = p.distanceM;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThanOrEqual(near);
    expect(far).toBeLessThanOrEqual(4);
    expect(p.heightHint.length).toBeGreaterThan(0);
    expect(p.facing.length).toBeGreaterThan(0);
    // One sentence: capitalised, a single full stop at the end, short enough to say in ~5 s.
    expect(p.spoken).toMatch(/^[A-Z](?:[^.!?]|\.\d)*\.$/); // decimals like 2.5 allowed
    expect(words(p.spoken).length).toBeLessThanOrEqual(20);
    expect(p.spoken).not.toMatch(BANNED);
  });
});

describe('coaching data per exercise', () => {
  const get = (folder: string): ExerciseRule => {
    const r = ruleForFolder(folder);
    if (!r) throw new Error(folder);
    return r;
  };

  it.each([
    ['curl', 'Curl higher.', 'Straighten your arm at the bottom.'],
    ['push-up', 'Go lower.', 'Push all the way up.'],
    ['shoulder-press', 'Press all the way up.', 'Lower the weights to your shoulders.'],
    ['lateral-raise', 'Raise to shoulder height.', 'Lower your arms fully.'],
    ['row', 'Pull your elbow higher.', 'Let the arm hang straight.'],
    ['goblet-squat', 'Sit deeper.', 'Stand all the way up.'],
  ] as const)('%s: far "%s", start "%s"', (folder, far, start) => {
    expect(get(folder).hints).toEqual({ far, start });
  });

  it('push-up placement puts the phone on the floor, 2.5–3 m away (a lying body fits a portrait frame)', () => {
    const p = get('push-up').placement;
    expect(p.heightHint).toMatch(/floor/i);
    expect(p.distanceM).toEqual([2.5, 3]);
    expect(p.lines.join(' ')).toContain('2.5–3 m');
    expect(p.spoken).toContain('2.5 to 3 metres');
  });

  it('every spoken placement says the distance range', () => {
    for (const r of RULES) {
      const [near, far] = r.placement.distanceM;
      expect(r.placement.spoken, r.folder).toContain(`${String(near)} to ${String(far)} metres`);
    }
  });

  it('front views ask for both arms in frame', () => {
    for (const r of RULES.filter((x) => x.view === 'front'))
      expect(r.placement.lines.join(' ')).toMatch(/both arms/i);
  });
});

describe('autoSetConfigFor (M5c per-exercise hands-free override)', () => {
  const curl = ruleForFolder('curl');
  if (!curl) throw new Error('curl rule missing');

  it('is the defaults (a fresh copy, including stillMoveDeg) for a rule without an override', () => {
    const c = autoSetConfigFor({ ...curl });
    expect(c).toEqual(AUTO_SET_DEFAULTS);
    expect(c).not.toBe(AUTO_SET_DEFAULTS);
    expect(c.stillMoveDeg).toBe(AUTO_SET_DEFAULTS.stillMoveDeg);
  });

  it('merges the rule override over the defaults', () => {
    const c = autoSetConfigFor({ ...curl, autoSet: { stillSec: 9, stillMoveDeg: 20 } });
    expect(c.stillSec).toBe(9);
    expect(c.stillMoveDeg).toBe(20);
    expect(c.undoSec).toBe(AUTO_SET_DEFAULTS.undoSec);
  });

  it.each(RULES.map((r) => [r.folder, r] as const))(
    '%s: every override key is a known config key with a finite value > 0',
    (_folder, r) => {
      for (const [k, v] of Object.entries(r.autoSet ?? {})) {
        expect(Object.keys(AUTO_SET_DEFAULTS), k).toContain(k);
        expect(Number.isFinite(v) && (v as number) > 0, `${k}=${String(v)}`).toBe(true);
      }
    },
  );
});

// M5 task 6: which focus/form rules are on is data on each rule (PROGRESS Decision "M5 rule
// enablement", SPEC M5 "Plan decisions").
describe('focus rule flags (M5)', () => {
  const get = (folder: string): ExerciseRule => {
    const r = ruleForFolder(folder);
    if (!r) throw new Error(folder);
    return r;
  };
  const KNOWN = Object.keys(CUE_TEXT) as FocusCueId[];

  /** Folders with real fixtures on disk (`fixtures/landmarks/<folder>/real-*.json`). */
  const REAL = import.meta.glob('../../../fixtures/landmarks/*/real-*.json');
  const realFolders = new Set(
    Object.keys(REAL).map((p) => /fixtures\/landmarks\/([^/]+)\//.exec(p)?.[1] ?? ''),
  );

  /** Every flag set a rule declares: its own and its other-view variant's. */
  const flagSets = (r: ExerciseRule) =>
    [
      ['rule', r.focus],
      ['otherView', r.otherView?.focus],
    ] as const;

  it('FOCUS_RULE_IDS + FORM_RULE_IDS are exactly the known cue ids, disjoint', () => {
    expect([...FOCUS_RULE_IDS, ...FORM_RULE_IDS].sort()).toEqual([...KNOWN].sort());
    for (const id of FORM_RULE_IDS) expect(FOCUS_RULE_IDS).not.toContain(id);
  });

  it.each(RULES.map((r) => [r.folder, r] as const))(
    '%s: declares flags, every key a known cue id with a boolean value',
    (_f, r) => {
      expect(r.focus, 'rule.focus').toBeDefined();
      for (const [where, flags] of flagSets(r)) {
        for (const [k, v] of Object.entries(flags ?? {})) {
          expect(KNOWN, `${where}.${k}`).toContain(k);
          expect(typeof v, `${where}.${k}`).toBe('boolean');
        }
      }
    },
  );

  it('each form rule is only set on the exercises SPEC M5 lists for it', () => {
    for (const r of RULES) {
      for (const [where, flags] of flagSets(r)) {
        for (const id of Object.keys(flags ?? {}) as FocusCueId[]) {
          if (!FORM_RULE_IDS.includes(id)) continue;
          expect(FORM_RULE_EXERCISES[id], `${r.folder} ${where}.${id}`).toContain(r.folder);
        }
      }
    }
    expect(FORM_RULE_EXERCISES).toEqual({
      armsOutOfSync: ['shoulder-press', 'lateral-raise'],
      raiseTooHigh: ['lateral-raise'],
      elbowDrift: ['curl'],
      bodySwing: ['curl', 'row'],
      hipSag: ['push-up'],
    });
  });

  it("arms out of sync is only declared on 'both'-arm rules", () => {
    for (const r of RULES) {
      if (r.focus?.armsOutOfSync !== undefined) expect(r.sideMode, r.folder).toBe('both');
    }
  });

  it('a form rule is on only where real fixtures exist (fixtures/landmarks/<folder>/real-*)', () => {
    expect(formRulesWithoutRealFixtures(RULES, realFolders)).toEqual([]);
  });

  it('the real-fixture guard catches a form rule switched on without real fixtures', () => {
    const curl = get('curl');
    const on = { ...curl, focus: { ...curl.focus, elbowDrift: true } };
    expect(formRulesWithoutRealFixtures([on], realFolders)).toEqual(['curl: elbowDrift']);
    const pu = get('push-up');
    if (!pu.otherView) throw new Error('push-up otherView missing');
    const variantOn: ExerciseRule = {
      ...pu,
      otherView: { ...pu.otherView, focus: { ...pu.otherView.focus, hipSag: true } },
    };
    expect(formRulesWithoutRealFixtures([variantOn], new Set())).toEqual([
      'push-up (otherView): hipSag',
    ]);
    // With real fixtures for the folder, a form rule may be on.
    expect(formRulesWithoutRealFixtures([on], new Set(['curl']))).toEqual([]);
    // Focus rules (not form rules) never need real fixtures.
    expect(
      formRulesWithoutRealFixtures([{ ...curl, focus: { rushedLowering: true } }], new Set()),
    ).toEqual([]);
  });

  it('lateral raise has real fixtures; task 7 turned both geometry flags on', () => {
    expect(realFolders.has('lateral-raise')).toBe(true);
    expect(get('lateral-raise').focus).toMatchObject({
      armsOutOfSync: true,
      raiseTooHigh: true,
    });
  });

  // The Decision table "M5 rule enablement" (starting flags), plus the task 7 Decision for the
  // lateral raise (src/core/focus.replay.test.ts).
  const ALL_FOCUS = { rushedLowering: true, stalled: true, outOfFrame: true, lowFps: true };
  it.each([
    ['curl', { ...ALL_FOCUS, shrinkingRange: true, elbowDrift: false, bodySwing: false }],
    ['push-up', { ...ALL_FOCUS, shrinkingRange: true, hipSag: false }],
    ['shoulder-press', { ...ALL_FOCUS, shrinkingRange: false, armsOutOfSync: false }],
    ['row', { ...ALL_FOCUS, shrinkingRange: true, bodySwing: false }],
    ['goblet-squat', { ...ALL_FOCUS, shrinkingRange: true }],
    [
      'lateral-raise',
      { ...ALL_FOCUS, shrinkingRange: true, armsOutOfSync: true, raiseTooHigh: true },
    ],
  ] as const)('%s flags', (folder, flags) => {
    expect(get(folder).focus).toEqual(flags);
  });

  it('push-up front variant: shrinking range off, no hips sag', () => {
    const v = get('push-up').otherView?.focus;
    expect(v).toEqual({ shrinkingRange: false });
    expect(v).not.toHaveProperty('hipSag');
  });

  it('only the push-up has variant flags', () => {
    for (const r of RULES) {
      if (r.folder !== 'push-up') expect(r.otherView?.focus, r.folder).toBeUndefined();
    }
  });
});

describe('focusFlagsFor', () => {
  const pu = ruleForFolder('push-up');
  const curl = ruleForFolder('curl');
  if (!pu || !curl) throw new Error('rules missing');

  it("is the rule's own flags (a copy) without an active view, or in the rule's view", () => {
    expect(focusFlagsFor(pu)).toEqual(pu.focus);
    expect(focusFlagsFor(pu)).not.toBe(pu.focus);
    expect(focusFlagsFor(pu, pu)).toEqual(pu.focus);
    expect(focusFlagsFor(pu, 'side')).toEqual(pu.focus);
  });

  it("in the other view, the variant's flags override the rule's, key by key", () => {
    const front = focusFlagsFor(pu, 'front');
    expect(front.shrinkingRange).toBe(false);
    expect(front.rushedLowering).toBe(true);
    expect(front.stalled).toBe(true);
  });

  it("takes the counter's active rule (the rule merged with otherView) as the active view", () => {
    // repCounter's `rule` getter: { ...rule, ...rule.otherView } once the other view is seen.
    const active = { ...pu, ...pu.otherView } as ExerciseRule;
    expect(focusFlagsFor(pu, active)).toEqual(focusFlagsFor(pu, 'front'));
  });

  it('hips sag is never on in a front view, even if a flag says so', () => {
    const r = { ...pu, focus: { ...pu.focus, hipSag: true } };
    expect(focusFlagsFor(r, 'side').hipSag).toBe(true);
    expect(focusFlagsFor(r, 'front').hipSag).not.toBe(true);
  });

  it('a rule without flags or without a variant gives what it has', () => {
    const bare: ExerciseRule = { ...curl };
    delete bare.focus;
    expect(focusFlagsFor(bare)).toEqual({});
    // No otherView: an unexpected view keeps the rule's own flags.
    expect(focusFlagsFor(curl, 'front')).toEqual(curl.focus);
  });
});
