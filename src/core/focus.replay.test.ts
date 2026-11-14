// M5 task 7: replays every landmark fixture (the real Push A lateral raise, synthetic 01/02/03)
// through the REAL rep counter and focus tracker, frame by frame, the way the camera view feeds
// them (autoState 'set', hands-free config on, 30 fps). Decides the lateral-raise form flags
// against the criteria fixed before the replay (PROGRESS Decision "M5 rule enablement") and
// Wongsaton's answer (1) (raiseTooHigh at 120°, on if his 4 real clips give 0 fires).
// The numbers behind the Decision are in PROGRESS ("M5 task 7 replay").
import { describe, expect, it } from 'vitest';
import { AUTO_SET_DEFAULTS, personInFrame } from './autoSet';
import { focusFlagsFor, ruleForFolder, type ExerciseRule } from './exercises';
import {
  createFocusTracker,
  createHold,
  FOCUS_DEFAULTS,
  MID_REP,
  type FocusConfig,
  type FocusCue,
  type FocusRuleFlags,
  type FormMeasures,
} from './focus';
import { createRepCounter } from './repCounter';
import type { FocusCueId, LandmarkFrame, RepEvent } from './types';

const FIXTURES = import.meta.glob<LandmarkFrame[]>('../../fixtures/landmarks/**/*.json', {
  eager: true,
  import: 'default',
});

type FlawTruth = { flaw: string; flawReps: number[] };
const FLAW_FILES = import.meta.glob<Record<string, FlawTruth>>(
  '../../fixtures/synthetic/flaws.json',
  { eager: true, import: 'default' },
);
const FLAWS: Record<string, FlawTruth> = Object.values(FLAW_FILES)[0] ?? {};

type Clip = { key: string; folder: string; label: string; reps: number; frames: LandmarkFrame[] };

const CLIPS: Clip[] = Object.entries(FIXTURES)
  .map(([path, frames]) => {
    const key = path.replace(/^.*fixtures\/landmarks\//, '').replace(/\.json$/, '');
    const [folder = '', file = ''] = key.split('/');
    return {
      key,
      folder,
      label: file.replace(/__.*$/, ''),
      reps: Number(/__reps-(\d+)__/.exec(file)?.[1] ?? NaN),
      frames,
    };
  })
  .sort((a, b) => a.key.localeCompare(b.key));

const clipsWhere = (re: RegExp) => CLIPS.filter((c) => re.test(c.key));
const REAL = clipsWhere(/^lateral-raise\/real-2026-11-13-s1-/);
const CLEAN = clipsWhere(/\/synthetic-0[12]__/);
const FLAWED = clipsWhere(/\/synthetic-03-/);

/** One counted rep: its event, form measures and focus ratios against the set's baseline. */
type RepRow = {
  rep: number;
  ev: RepEvent;
  form: FormMeasures;
  /** eccentricMs / the baseline's; null for the baseline reps. */
  eccRatio: number | null;
  /** (max − min) / the baseline's; null for the baseline reps. */
  rangeRatio: number | null;
};

type Replay = { cues: FocusCue[]; rows: RepRow[]; reps: number; partials: number };

function ruleOf(folder: string): ExerciseRule {
  const r = ruleForFolder(folder);
  if (!r) throw new Error(`no rule for ${folder}`);
  return r;
}

function replay(c: Clip, flags: FocusRuleFlags, config?: Partial<FocusConfig>): Replay {
  const rule = ruleOf(c.folder);
  const counter = createRepCounter(rule);
  const tr = createFocusTracker(rule, {
    flags,
    targetReps: c.reps,
    autoSet: AUTO_SET_DEFAULTS,
    ...(config ? { config } : {}),
  });
  const cues: FocusCue[] = [];
  const rows: RepRow[] = [];
  const base: RepEvent[] = [];
  const n = FOCUS_DEFAULTS.baselineReps;
  const mean = (f: (e: RepEvent) => number) => base.reduce((s, e) => s + f(e), 0) / n;
  for (const frame of c.frames) {
    const events = counter.push(frame);
    cues.push(
      ...tr.push({
        t: frame.t,
        present: personInFrame(frame),
        tracking: counter.tracking,
        untracked: counter.untracked,
        phase: counter.phase,
        angle: counter.angle,
        sides: counter.sideAngles,
        frame,
        view: counter.rule.view,
        side: counter.side,
        events,
        fps: 30,
        autoState: 'set',
        paused: false,
      }),
    );
    for (const ev of events) {
      if (ev.type !== 'rep' || !tr.lastForm) continue;
      const full = base.length >= n;
      rows.push({
        rep: rows.length + 1,
        ev,
        form: tr.lastForm,
        eccRatio: full ? ev.eccentricMs / mean((e) => e.eccentricMs) : null,
        rangeRatio: full
          ? (ev.maxAngle - ev.minAngle) / mean((e) => e.maxAngle - e.minAngle)
          : null,
      });
      if (!full) base.push(ev);
    }
  }
  return { cues, rows, reps: counter.reps, partials: counter.partials };
}

const FOCUS_ON: FocusRuleFlags = {
  rushedLowering: true,
  shrinkingRange: true,
  stalled: true,
  outOfFrame: true,
  lowFps: true,
};

/** SPEC M5 form rules per exercise folder. */
const SPEC_FORM: Record<string, readonly FocusCueId[]> = {
  curl: ['elbowDrift', 'bodySwing'],
  row: ['bodySwing'],
  'push-up': ['hipSag'],
  'shoulder-press': ['armsOutOfSync'],
  'lateral-raise': ['armsOutOfSync', 'raiseTooHigh'],
  'goblet-squat': [],
};

/** Every focus rule plus the folder's SPEC form rules. */
const allOn = (folder: string): FocusRuleFlags => ({
  ...FOCUS_ON,
  ...Object.fromEntries((SPEC_FORM[folder] ?? []).map((id) => [id, true])),
});

type RepRuleId = 'rushedLowering' | 'shrinkingRange';
type JudgedId = RepRuleId | keyof FormMeasures;

/** The rep's value for a rule, and whether it crosses the rule's line (default config). */
function verdict(row: RepRow, id: JudgedId): { value: number | null; bad: boolean } {
  const c = FOCUS_DEFAULTS;
  if (id === 'rushedLowering')
    return { value: row.eccRatio, bad: row.eccRatio !== null && row.eccRatio < c.rushedRatio };
  if (id === 'shrinkingRange')
    return { value: row.rangeRatio, bad: row.rangeRatio !== null && row.rangeRatio < c.rangeRatio };
  const value = row.form[id];
  if (value === null) return { value, bad: false };
  const line: Record<keyof FormMeasures, (v: number) => boolean> = {
    armsOutOfSync: (v) => v > c.armsOutOfSyncDeg,
    raiseTooHigh: (v) => v > c.raiseTooHighDeg,
    elbowDrift: (v) => v > c.elbowDriftDeg,
    bodySwing: (v) => v > c.bodySwingDeg,
    hipSag: (v) => v < c.hipSagMinDeg,
  };
  return { value, bad: line[id](value) };
}

const firedAt = (cues: readonly FocusCue[], id?: FocusCueId) =>
  cues.filter((c) => id === undefined || c.id === id).map((c) => c.reps);

/**
 * The largest |left − right| held ≥ holdMs while mid-rep, over the frames before the clip's first
 * counted rep (the arms-out-of-sync measure, applied to the swing the tracker discards as a
 * partial). Uses the tracker's own hold and mid-rep phases; a frame that isn't mid-rep, tracked
 * and two-sided breaks the run, as in the tracker.
 */
function preSetSyncHeld(c: Clip, holdMs: number): number | null {
  const counter = createRepCounter(ruleOf(c.folder));
  const hold = createHold(holdMs);
  let best: number | null = null;
  for (const frame of c.frames) {
    counter.push(frame);
    if (counter.reps > 0) break;
    const l = counter.sideAngles?.left ?? null;
    const r = counter.sideAngles?.right ?? null;
    const ok = MID_REP.has(counter.phase) && counter.tracking && l !== null && r !== null;
    const held = hold.push(frame.t, ok && l !== null && r !== null ? Math.abs(l - r) : null);
    if (held !== null) best = best === null ? held : Math.max(best, held);
  }
  return best;
}

// ---------------------------------------------------------------------------------------------

describe('replay inventory', () => {
  it('has the 4 real lateral-raise clips, 12 clean synthetic clips and 6 flaw clips', () => {
    expect(REAL.map((c) => c.label)).toEqual([0, 1, 2, 3].map((i) => `real-2026-11-13-s1-${i}`));
    expect(CLEAN.length).toBe(12);
    expect(FLAWED.length).toBe(6);
  });

  it('every flaw clip has ground truth in fixtures/synthetic/flaws.json, and back', () => {
    expect(FLAWED.map((c) => c.key).sort()).toEqual(Object.keys(FLAWS).sort());
    for (const c of FLAWED) expect(FLAWS[c.key]?.flawReps, c.key).toEqual([5, 6, 7, 8]);
  });

  it('the lateral-raise flaw is two clips (out of sync; too high), not one', () => {
    expect(FLAWED.filter((c) => c.folder === 'lateral-raise').map((c) => c.label)).toEqual([
      'synthetic-03-arms-out-of-sync',
      'synthetic-03-raise-too-high',
    ]);
  });
});

describe('clean synthetic clips (01/02), every rule forced on: no cue', () => {
  for (const c of CLEAN) {
    it(c.key, () => {
      const res = replay(c, allOn(c.folder));
      expect(res.reps).toBe(c.reps);
      expect(res.cues.map((q) => `${q.id}@${q.reps}`)).toEqual([]);
    });
  }
});

/**
 * Each flaw clip's own rule(s), with only that flag on: the reps whose detection fires (2 in a
 * row, at most 2 per set, the streak restarting after a fire).
 */
const OWN_RULE: Record<string, { id: JudgedId & FocusCueId; firesAt: number[] }[]> = {
  // Rep 7's drift reads 24.4° (< 25) and breaks the streak, so only rep 6 fires.
  'curl/synthetic-03-elbow-swing': [
    { id: 'elbowDrift', firesAt: [6] },
    { id: 'bodySwing', firesAt: [6, 8] },
  ],
  'curl/synthetic-03-rushed-lowering': [{ id: 'rushedLowering', firesAt: [6, 8] }],
  // Reads 155.7 / 162.3 / 157.1 / 154.2° on reps 5–8: rep 6 breaks the streak, so rep 8 fires.
  'push-up/synthetic-03-hip-sag': [{ id: 'hipSag', firesAt: [8] }],
  'goblet-squat/synthetic-03-short-range': [{ id: 'shrinkingRange', firesAt: [6, 8] }],
  'lateral-raise/synthetic-03-arms-out-of-sync': [{ id: 'armsOutOfSync', firesAt: [6, 8] }],
  // Reps 5–8 read 131.8–132.5°, past the live 120° line (see the next block).
  'lateral-raise/synthetic-03-raise-too-high': [{ id: 'raiseTooHigh', firesAt: [6, 8] }],
};

describe('synthetic-03 flaw clips, only their own rule on', () => {
  for (const c of FLAWED) {
    const label = c.key.replace(/__.*$/, '');
    const truth = FLAWS[c.key];
    for (const own of OWN_RULE[label] ?? []) {
      it(`${label}: ${own.id} fires on reps ${own.firesAt.join(', ') || 'none'}, never on 1–4`, () => {
        const res = replay(c, { [own.id]: true });
        expect(res.reps).toBe(c.reps);
        expect(res.cues.map((q) => q.id)).toEqual(own.firesAt.map(() => own.id));
        expect(firedAt(res.cues)).toEqual(own.firesAt);
        for (const rep of own.firesAt) expect(truth?.flawReps).toContain(rep);
        // No clean rep crosses the line, so none can start a streak.
        for (const row of res.rows.slice(0, 4))
          expect(verdict(row, own.id), `rep ${row.rep}`).toMatchObject({ bad: false });
      });
    }
    it(`${label} has an own-rule entry`, () => {
      expect(OWN_RULE[label]?.length ?? 0).toBeGreaterThan(0);
    });
  }

  it('raise-too-high clip: the flawed reps read > 120° and fire at the live 120° threshold', () => {
    const c = FLAWED.find((f) => f.label === 'synthetic-03-raise-too-high');
    if (!c) throw new Error('missing clip');
    expect(FOCUS_DEFAULTS.raiseTooHighDeg).toBe(120);
    const res = replay(c, { raiseTooHigh: true });
    const peaks = res.rows.map((r) => r.form.raiseTooHigh ?? NaN);
    expect(Math.max(...peaks.slice(0, 4))).toBeLessThan(90);
    expect(Math.min(...peaks.slice(4))).toBeGreaterThan(FOCUS_DEFAULTS.raiseTooHighDeg);
    expect(firedAt(res.cues, 'raiseTooHigh')).toEqual([6, 8]);
  });
});

/** Every rule forced on: what each flaw clip fires (cross-talk between rules, pinned). */
const ALL_ON_FIRES: Record<string, string[]> = {
  'curl/synthetic-03-elbow-swing': ['elbowDrift@6', 'bodySwing@7', 'shrinkingRange@8'],
  'curl/synthetic-03-rushed-lowering': ['rushedLowering@6', 'rushedLowering@8'],
  'push-up/synthetic-03-hip-sag': ['hipSag@8'],
  'goblet-squat/synthetic-03-short-range': ['shrinkingRange@6', 'shrinkingRange@8'],
  'lateral-raise/synthetic-03-arms-out-of-sync': ['armsOutOfSync@6', 'armsOutOfSync@8'],
  'lateral-raise/synthetic-03-raise-too-high': ['raiseTooHigh@6', 'raiseTooHigh@8'],
};

describe('synthetic-03 flaw clips, every rule forced on', () => {
  for (const c of FLAWED) {
    const label = c.key.replace(/__.*$/, '');
    it(label, () => {
      const res = replay(c, allOn(c.folder));
      expect(res.cues.map((q) => `${q.id}@${q.reps}`)).toEqual(ALL_ON_FIRES[label]);
      // Nothing fires inside the clean reps 1–4.
      expect(Math.min(...firedAt(res.cues), Infinity)).toBeGreaterThanOrEqual(5);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Real lateral raise (Push A, 2026-11-13): the enable criteria.
// ---------------------------------------------------------------------------------------------

describe('real lateral raise, every lateral-raise rule forced on', () => {
  const runs = REAL.map((c) => ({ c, res: replay(c, allOn('lateral-raise')) }));
  const rows = runs.flatMap((r) => r.res.rows);
  const values = (id: JudgedId) =>
    rows.map((r) => verdict(r, id).value).filter((v): v is number => v !== null);

  for (const { c, res } of runs) {
    it(`${c.label}: 20 reps, no cue at all`, () => {
      expect(res.reps).toBe(20);
      expect(res.cues.map((q) => `${q.id}@${q.reps}`)).toEqual([]);
    });
  }

  it('every real rep has its measures (80 reps, both arms seen mid-rep)', () => {
    expect(rows.length).toBe(80);
    expect(values('armsOutOfSync').length).toBe(80);
    expect(values('raiseTooHigh').length).toBe(80);
  });

  it('arms out of sync: (1) 0 fires; (2) largest held |L − R| ≤ 15°; (3) the s1-0 swing > 20°', () => {
    expect(runs.flatMap((r) => firedAt(r.res.cues, 'armsOutOfSync'))).toEqual([]);
    expect(Math.max(...values('armsOutOfSync'))).toBeLessThanOrEqual(15);
    const s10 = REAL.find((c) => c.label.endsWith('s1-0'));
    if (!s10) throw new Error('missing s1-0');
    const swing = preSetSyncHeld(s10, FOCUS_DEFAULTS.armsOutOfSyncSec * 1000);
    expect(swing).not.toBeNull();
    expect(swing ?? 0).toBeGreaterThan(FOCUS_DEFAULTS.armsOutOfSyncDeg);
  });

  it('raise too high at 120°: 0 fires, every real peak ≤ 110° (≥ 10° margin)', () => {
    expect(FOCUS_DEFAULTS.raiseTooHighDeg).toBe(120);
    expect(runs.flatMap((r) => firedAt(r.res.cues, 'raiseTooHigh'))).toEqual([]);
    // Regression pin picked after seeing the data (peaks 91.5–109.2°), not an enable criterion.
    expect(Math.max(...values('raiseTooHigh'))).toBeLessThanOrEqual(110);
  });

  it('rushed lowering and shrinking range: ≤ 1 fire per clip (0 on every clip)', () => {
    for (const { c, res } of runs) {
      expect(firedAt(res.cues, 'rushedLowering').length, c.label).toBeLessThanOrEqual(1);
      expect(firedAt(res.cues, 'shrinkingRange').length, c.label).toBeLessThanOrEqual(1);
    }
    // Regression pins picked after seeing the data (lowest 0.77 / 0.90), not enable criteria.
    expect(Math.min(...values('rushedLowering'))).toBeGreaterThan(0.7);
    expect(Math.min(...values('shrinkingRange'))).toBeGreaterThan(0.88);
  });
});

describe('shipped flags (lateralRaise.ts) match the task 7 Decision', () => {
  const rule = ruleOf('lateral-raise');

  it('both lateral-raise form rules are on, with every focus rule', () => {
    expect(focusFlagsFor(rule, rule)).toEqual({
      ...FOCUS_ON,
      armsOutOfSync: true,
      raiseTooHigh: true,
    });
  });

  it('the shipped flags give no cue on the real clips or the clean lateral-raise clips', () => {
    for (const c of [...REAL, ...CLEAN.filter((k) => k.folder === 'lateral-raise')])
      expect(replay(c, focusFlagsFor(rule, rule)).cues, c.label).toEqual([]);
  });
});
