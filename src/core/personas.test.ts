import { describe, expect, it } from 'vitest';
import cuesJson from '../data/cues.json';
import programJson from '../data/program.json';
import exercisesJson from '../data/exercises.json';
import { ADVICE_BANNED_WORDS, afterSetAdvice, nextTimeAdvice, wordCount } from './advice';
import { RULES } from './exercises';
import { CUE_TEXT, cueText } from './focus';
import {
  DRILL_MAX_WORDS,
  RUDENESS_LEVELS,
  type Rudeness,
  createDrillSergeant,
  drillSergeantLine,
  drillTemplateFor,
  drillVariants,
} from './personas';
import { restCueText } from './restCues';
import type { SessionState } from './session';
import type { FocusCueId, ProgramDay, SetLog } from './types';
import type { Unit } from './units';

// ---------------------------------------------------------------------------------------------
// Every calm line the app speaks today, built from the real modules where they live in core/data.

const exercises = exercisesJson as { id: string; name: string }[];
const program = programJson as { days: { exercises: { exerciseId: string }[] }[] };
const programIds = [...new Set(program.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)))];
const programNames = programIds.map((id) => exercises.find((e) => e.id === id)?.name ?? id);
/** Longest real exercise name (by words): the worst case for word counts. */
const LONGEST = [...programNames].sort((a, b) => wordCount(b) - wordCount(a))[0] ?? '';

const hintLines = RULES.flatMap((r) => [r.hints.far, r.hints.start]);
const placementLines = RULES.map((r) => r.placement.spoken);
const focusLines = (Object.keys(CUE_TEXT) as FocusCueId[]).flatMap((id) =>
  id === 'stalled' ? [cueText(id, 1), cueText(id, 3), cueText(id, 12)] : [cueText(id, 0)],
);
const restLines = programNames.flatMap((name) =>
  (['tenSeconds', 'go', 'nudge'] as const).flatMap((k) => [
    restCueText(k, { name, setNumber: 1 }),
    restCueText(k, { name, setNumber: 4 }),
  ]),
);
/** Hands-free say() strings in src/ui/cameraView.ts (ui code: copied, it can't be imported here). */
const handsFreeLines = [1, 8, 12]
  .map((n) => `Set done. ${n} ${n === 1 ? 'rep' : 'reps'}.`)
  .concat(['Keep going.', 'Camera off.']);
/** Voice test in src/ui/app.ts and TEST_PHRASE in src/ui/audioTest.ts (ui code: copied). */
const voiceTestLines = ['Voice test. One, two, three.', 'Twelve. Slow the lowering.'];
const exerciseCueLines = Object.values(cuesJson as Record<string, string>);

// --- Advice: real afterSetAdvice / nextTimeAdvice output for every rule and form. Made-up plan.
const day: ProgramDay = {
  id: 'persona-test',
  name: 'Persona test',
  exercises: [
    { exerciseId: 'curl', sets: 3, targetReps: [8, 12], restSec: 60, tracking: 'pose' },
    { exerciseId: 'pushup', sets: 3, targetReps: [10, 15], restSec: 60, tracking: 'manual' },
  ],
};
let t = 0;
function lg(
  exerciseId: string,
  reps: number,
  weightKg: number,
  o: { partials?: number; rest?: number; cues?: FocusCueId[] } = {},
): SetLog {
  t += 100_000;
  return {
    sessionId: 's1',
    exerciseId,
    setIndex: 0,
    reps,
    ...(o.partials ? { partials: o.partials } : {}),
    weightKg,
    restTakenSec: o.rest ?? 60,
    ...(o.cues ? { cues: o.cues } : {}),
    startedAt: t,
    endedAt: t + 30_000,
  };
}
function state(logs: SetLog[], unit: Unit): SessionState {
  const seen: Record<string, number> = {};
  return {
    sessionId: 's1',
    day,
    startedAt: 0,
    endedAt: null,
    phase: 'rest',
    exIndex: 0,
    setIndex: 0,
    reps: 8,
    partials: 0,
    focusCues: null,
    weightKg: 0,
    setStartedAt: 0,
    lastRestTakenSec: 0,
    restTargetSec: 90,
    restAccumMs: 0,
    restRunningSince: 0,
    paused: false,
    logs: logs.map((l) => {
      const i = seen[l.exerciseId] ?? 0;
      seen[l.exerciseId] = i + 1;
      return { ...l, setIndex: i };
    }),
    skipped: [],
    restOverruns: 0,
    unit,
    lastWeightKg: {},
  };
}
const rushed: FocusCueId[] = ['rushedLowering'];
const kg = (v: number, unit: Unit) => (unit === 'kg' ? v : v * 0.45359237);
function adviceLines(unit: Unit, name: (id: string) => string) {
  const w = kg(unit === 'kg' ? 10 : 20, unit);
  const tiny = kg(unit === 'kg' ? 5 : 10, unit);
  const x3 = (id: string, reps: number, wt: number, o: Parameters<typeof lg>[3] = {}) => [
    lg(id, reps, wt, o),
    lg(id, reps, wt, o),
    lg(id, reps, wt, o),
  ];
  const after = (logs: SetLog[], last: Record<string, SetLog[]> = {}) =>
    afterSetAdvice(state(logs, unit), name, last);
  const cases = [
    after([lg('curl', 10, w, { partials: 2 })]), // A1
    after([lg('pushup', 12, 0, { partials: 2 })]), // A1 bodyweight
    after([lg('curl', 6, w)]), // A2
    after([lg('pushup', 5, 0)]), // A2 bodyweight
    after([lg('curl', 12, w), lg('curl', 12, w)]), // A3
    after([lg('pushup', 15, 0), lg('pushup', 15, 0)]), // A4
    after([
      lg('pushup', 12, 0),
      lg('curl', 10, w, { rest: 200 }),
      lg('curl', 10, w, { rest: 200 }),
    ]), // A5
    after(x3('curl', 6, w), { curl: [lg('curl', 6, w)] }), // N1
    after(x3('curl', 6, w)), // N2
    after(x3('pushup', 5, 0)), // N2 bodyweight
    after([
      lg('curl', 10, w, { cues: rushed }),
      lg('curl', 10, w, { cues: rushed }),
      lg('curl', 10, w),
    ]), // T1
    after(x3('pushup', 15, 0)), // N3 bodyweight
    after(x3('curl', 12, tiny)), // N3 too big a jump
    after(x3('curl', 12, w)), // N3
    after(x3('curl', 10, w, { partials: 1 })), // N4
    after(x3('pushup', 12, 0, { partials: 1 })), // N4 bodyweight
    after(x3('curl', 10, w)), // N5
    after(x3('pushup', 12, 0)), // N5 bodyweight
    after([lg('curl', 12, w, { partials: 1 }), lg('curl', 12, w), lg('curl', 12, w)]), // N6
    after([lg('pushup', 15, 0, { partials: 1 }), lg('pushup', 15, 0), lg('pushup', 15, 0)]), // N6 bw
    nextTimeAdvice(state(x3('curl', 12, w), unit), 'curl', [], name),
  ];
  return cases;
}
const allAdvice = (['kg', 'lb'] as const).flatMap((u) =>
  [() => LONGEST, () => 'Dumbbell Bicep Curl'].flatMap((n) => adviceLines(u, n)),
);
const adviceSayLines = allAdvice.map((a) => a?.say ?? '');

const CALM_GROUPS: Record<string, string[]> = {
  hints: hintLines,
  placement: placementLines,
  focus: focusLines,
  rest: restLines,
  handsFree: handsFreeLines,
  voiceTest: voiceTestLines,
  exerciseCues: exerciseCueLines,
  advice: adviceSayLines,
};
const ALL_CALM = Object.values(CALM_GROUPS).flat();

/** Every variant at a level, with the real variables filled in. */
const linesAt = (level: Rudeness) => ALL_CALM.flatMap((c) => drillVariants(c, 'cue', level));

// ---------------------------------------------------------------------------------------------
// Word lists

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z'-]+/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
/** Mild words (level 2+): damn, hell, ass, crap and their forms. */
const MILD = /^(damn|damned|dammit|hell|ass|assed|asses|crap|crappy)$/;
/** Full profanity (level 3 only). Matched as substrings so compounds are caught. */
const FULL_STEMS = ['shit', 'fuck', 'piss', 'cock', 'dick', 'bastard', 'goddam'];
/** Never, at any level: slurs and identity insults. */
const IDENTITY_STEMS = [
  'retard',
  'fag',
  'gay',
  'bitch',
  'cunt',
  'whore',
  'slut',
  'pussy',
  'sissy',
  'tranny',
  'homo',
];
const IDENTITY_WORDS = [
  'girl',
  'girls',
  'ladies',
  'lady',
  'princess',
  'woman',
  'women',
  'grandma',
  'old',
  'spastic',
  'midget',
  'queer',
];
/** Never: body, weight or looks jokes. */
const BODY_WORDS = [
  'fat',
  'fatty',
  'fatso',
  'skinny',
  'ugly',
  'chubby',
  'scrawny',
  'flabby',
  'pudgy',
  'obese',
  'tubby',
  'belly',
  'gut',
  'twig',
  'noodle',
  'noodles',
  'looks',
  'gross',
  'lard',
  'chunky',
  'beer',
];
/** Never: pain, injury or medical words (ADVICE_BANNED_WORDS stems + more). */
const MEDICAL_WORDS = [
  'ache',
  'sore',
  'burn',
  'burning',
  'puke',
  'vomit',
  'blood',
  'bleed',
  'die',
  'dying',
  'dead',
  'death',
  'kill',
  'broken',
  'tear',
  'torn',
  'sick',
  'doctor',
  'heart',
  'injury',
];

const fullProfane = (s: string) => FULL_STEMS.some((w) => s.toLowerCase().includes(w));
const mildProfane = (s: string) => tokens(s).some((w) => MILD.test(w));

// ---------------------------------------------------------------------------------------------

describe('drillSergeantLine: coverage of every calm line', () => {
  it('builds a non-trivial calm corpus from the real modules', () => {
    for (const [group, lines] of Object.entries(CALM_GROUPS)) {
      expect(lines.length, group).toBeGreaterThan(0);
      for (const l of lines) expect(l, group).not.toBe('');
    }
    const rules = new Set(allAdvice.map((a) => a?.rule));
    for (const r of ['A1', 'A2', 'A3', 'A4', 'A5', 'N1', 'N2', 'T1', 'N3', 'N4', 'N5', 'N6'])
      expect(rules, r).toContain(r);
  });

  for (const [group, lines] of Object.entries(CALM_GROUPS)) {
    it(`has a template for every ${group} line`, () => {
      const missing = [...new Set(lines)].filter((l) => drillTemplateFor(l) === null);
      expect(missing).toEqual([]);
    });
  }

  it('gives every template at least 2 variants per level', () => {
    for (const c of new Set(ALL_CALM)) {
      for (const level of RUDENESS_LEVELS) {
        const v = drillVariants(c, 'cue', level);
        expect(v.length, `${c} @${level}`).toBeGreaterThanOrEqual(2);
        expect(v.length, `${c} @${level}`).toBeLessThanOrEqual(4);
        expect(new Set(v).size, `${c} @${level}`).toBe(v.length);
        for (const line of v) expect(line).not.toBe(c);
      }
    }
  });
});

describe('drillSergeantLine: variables and fixes are kept', () => {
  const all = (c: string, level: Rudeness = 2) => drillVariants(c, 'cue', level);

  it('keeps the rep count of "Set done"', () => {
    for (const l of all('Set done. 8 reps.')) expect(l).toMatch(/\b8 reps\b/);
    for (const l of all('Set done. 1 rep.', 3)) expect(l).toMatch(/\b1 rep\b/);
  });

  it('keeps the next exercise and set number of rest cues', () => {
    const c = restCueText('tenSeconds', { name: 'Dumbbell Bicep Curl', setNumber: 2 });
    for (const level of RUDENESS_LEVELS)
      for (const l of all(c, level)) {
        expect(l).toContain('Dumbbell Bicep Curl, set 2');
        expect(l.toLowerCase()).toContain('ten');
      }
    const n = restCueText('nudge', { name: 'Pushups', setNumber: 3 });
    for (const l of all(n)) expect(l).toContain('Pushups, set 3');
  });

  it('keeps the weight, unit and reps of coach tips', () => {
    for (const l of all('Strong set. Try plus 2.5 kilos next set.', 1))
      expect(l).toContain('2.5 kilos');
    for (const l of all('Strong set. Try plus 5 pounds next set.', 3))
      expect(l).toContain('5 pounds');
    for (const l of all('Next time on Dumbbell Bicep Curl: drop to 7.5 kilos.'))
      expect(l).toContain('drop to 7.5 kilos');
    for (const l of all('Keep the weight. Aim for 8 reps.')) expect(l).toMatch(/\b8\b/);
  });

  it('keeps the reps to go of the stalled cue', () => {
    for (const level of RUDENESS_LEVELS)
      for (const l of all(cueText('stalled', 3), level)) expect(l).toMatch(/\b3\b/);
  });

  it('keeps the actual fix of partial hints and exercise cues', () => {
    const fix = (s: string) => s.replace(/[.!]$/, '');
    for (const h of hintLines)
      for (const level of RUDENESS_LEVELS)
        for (const l of all(h, level)) expect(l).toContain(fix(h));
    for (const c of exerciseCueLines) for (const l of all(c, 3)) expect(l).toContain(fix(c));
  });

  it('keeps the distance of placement lines', () => {
    for (const p of placementLines) {
      const dist = /(\d+(?:\.\d+)? to \d+ metres)/.exec(p)?.[1] ?? '';
      expect(dist).not.toBe('');
      for (const level of RUDENESS_LEVELS) for (const l of all(p, level)) expect(l).toContain(dist);
    }
  });

  it('keeps the fix words of focus cues', () => {
    const key: Record<FocusCueId, RegExp> = {
      rushedLowering: /slow the .*lowering/i,
      shrinkingRange: /full .*range/i,
      stalled: /\d+/,
      outOfFrame: /frame/i,
      lowFps: /closer to the light/i,
      armsOutOfSync: /both arms/i,
      raiseTooHigh: /shoulder height/i,
      elbowDrift: /elbow/i,
      bodySwing: /body still/i,
      hipSag: /body straight/i,
    };
    for (const id of Object.keys(CUE_TEXT) as FocusCueId[])
      for (const level of RUDENESS_LEVELS)
        for (const l of all(cueText(id, 2), level)) expect(l, id).toMatch(key[id]);
  });
});

describe('drillSergeantLine: behaviour', () => {
  const first = () => 0;

  it('returns counts unchanged at every level', () => {
    for (const level of RUDENESS_LEVELS) {
      expect(drillSergeantLine('Three', 'count', level, first)).toBe('Three');
      // Even if a count's text happens to match a template.
      expect(drillSergeantLine('Go.', 'count', level, first)).toBe('Go.');
    }
  });

  it('returns unknown text unchanged', () => {
    expect(drillSergeantLine('Something new.', 'cue', 2, first)).toBe('Something new.');
    expect(drillSergeantLine('', 'hint', 3, first)).toBe('');
  });

  it('rewrites known hints and cues', () => {
    expect(drillSergeantLine('Keep going.', 'cue', 1, first)).not.toBe('Keep going.');
    expect(drillSergeantLine('Curl higher.', 'hint', 2, first)).toContain('Curl higher');
  });

  it('uses pick to choose the variant', () => {
    const v = drillVariants('Keep going.', 'cue', 2);
    expect(drillSergeantLine('Keep going.', 'cue', 2, () => 1)).toBe(v[1]);
  });

  it('clamps a bad pick into range', () => {
    const v = drillVariants('Keep going.', 'cue', 2);
    expect(v).toContain(drillSergeantLine('Keep going.', 'cue', 2, () => 99));
    expect(v).toContain(drillSergeantLine('Keep going.', 'cue', 2, () => -3));
    expect(v).toContain(drillSergeantLine('Keep going.', 'cue', 2, () => Number.NaN));
  });

  it('never repeats the previous variant of the same template back to back', () => {
    const ds = createDrillSergeant();
    for (const level of RUDENESS_LEVELS) {
      let prev = '';
      for (let i = 0; i < 40; i++) {
        // A stuck pick (always 0) is the worst case for repeats.
        const line = ds.line('Keep going.', 'cue', level, () => 0);
        expect(line).not.toBe(prev);
        prev = line;
      }
    }
  });

  it('remembers per template even when other lines are spoken in between', () => {
    const ds = createDrillSergeant();
    const a = ds.line('Full range.', 'hint', 2, () => 0);
    ds.line('Keep going.', 'cue', 2, () => 0);
    const b = ds.line('Full range.', 'hint', 2, () => 0);
    expect(b).not.toBe(a);
  });

  it('treats the same template with different variables as one template', () => {
    const ds = createDrillSergeant();
    const a = ds.line('Set done. 8 reps.', 'cue', 1, () => 0);
    const b = ds.line('Set done. 9 reps.', 'cue', 1, () => 0);
    expect(b.replace('9', '8')).not.toBe(a);
  });

  it('reaches every variant with a random-like pick', () => {
    const ds = createDrillSergeant();
    const v = drillVariants('Keep going.', 'cue', 3);
    const seen = new Set<string>();
    let seed = 7; // deterministic LCG
    const pick = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return Math.floor((seed / 2 ** 31) * n);
    };
    for (let i = 0; i < 60; i++) seen.add(ds.line('Keep going.', 'cue', 3, pick));
    expect(seen.size).toBe(v.length);
  });

  it('works without memory (standalone call)', () => {
    expect(drillVariants('Go.', 'cue', 1)).toContain(
      drillSergeantLine('Go.', 'cue', 1, Math.floor),
    );
  });
});

describe('drillSergeantLine: level rules', () => {
  it('level 1 (Tough) has no profanity', () => {
    for (const l of linesAt(1)) {
      expect(mildProfane(l), l).toBe(false);
      expect(fullProfane(l), l).toBe(false);
    }
  });

  it('level 2 (Rude) allows only mild words', () => {
    for (const l of linesAt(2)) expect(fullProfane(l), l).toBe(false);
    expect(linesAt(2).some(mildProfane)).toBe(true);
  });

  it('level 3 (Savage) uses full profanity somewhere', () => {
    expect(linesAt(3).some(fullProfane)).toBe(true);
  });
});

describe('drillSergeantLine: hard limits at every level', () => {
  for (const level of RUDENESS_LEVELS) {
    it(`level ${level}: no identity, body or medical words`, () => {
      for (const l of linesAt(level)) {
        const low = l.toLowerCase();
        const words = tokens(l);
        for (const s of IDENTITY_STEMS) expect(low, l).not.toContain(s);
        for (const s of ADVICE_BANNED_WORDS) expect(low, l).not.toContain(s);
        for (const w of [...IDENTITY_WORDS, ...BODY_WORDS, ...MEDICAL_WORDS])
          expect(words, l).not.toContain(w);
      }
    });

    it(`level ${level}: every line is at most ${DRILL_MAX_WORDS} words`, () => {
      const long = linesAt(level).filter((l) => wordCount(l) > DRILL_MAX_WORDS);
      expect(long).toEqual([]);
    });
  }

  it('the word limit is 14', () => {
    expect(DRILL_MAX_WORDS).toBe(14);
  });
});
