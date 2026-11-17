import { describe, expect, it } from 'vitest';
import exercisesJson from '../data/exercises.json';
import programJson from '../data/program.json';
import setupCuesJson from '../data/setupCues.json';
import { wordCount } from './advice';
import { checkHealthCopy } from './health/copy';
import {
  SETUP_CUE_MAX_WORDS,
  setupCueLines,
  setupCuesFor,
  type SetupCueSession,
} from './setupCues';
import { checkCopy, SPOKEN_MAX_WORDS } from './trainer/replies';

// M12 1b task 18 (trainer-kit item 10): setup checks as data, said once per session.
const catalogIds = (exercisesJson as { id: string }[]).map((e) => e.id);
const programIds = [
  ...new Set(programJson.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
];
const data = setupCuesJson.cues as Record<string, string[]>;

const log = (exerciseId: string, warmup = false) => ({
  exerciseId,
  ...(warmup ? { warmup: true as const } : {}),
});
const session = (over: Partial<SetupCueSession> = {}): SetupCueSession => ({ logs: [], ...over });

describe('setup cue data', () => {
  it('every program exercise and every swap-pool exercise has 2–3 cues', () => {
    expect(programIds.length).toBeGreaterThanOrEqual(30);
    for (const id of [...programIds, ...catalogIds]) {
      const n = setupCueLines(id).length;
      expect(n, id).toBeGreaterThanOrEqual(2);
      expect(n, id).toBeLessThanOrEqual(3);
    }
  });

  it('has no cues for exercises the catalog does not know', () => {
    expect(Object.keys(data).filter((id) => !catalogIds.includes(id))).toEqual([]);
  });

  it('each cue is ≤ 8 words, one short sentence, and passes the copy checks', () => {
    expect(SETUP_CUE_MAX_WORDS).toBe(8);
    expect(SETUP_CUE_MAX_WORDS).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
    for (const [id, lines] of Object.entries(data)) {
      expect(new Set(lines).size, id).toBe(lines.length);
      for (const line of lines) {
        const at = `${id}: ${line}`;
        expect(wordCount(line), at).toBeGreaterThanOrEqual(2);
        expect(wordCount(line), at).toBeLessThanOrEqual(SETUP_CUE_MAX_WORDS);
        expect(line, at).toMatch(/^[A-Z][^.!?]*\.$/);
        expect(checkCopy(line).hits, at).toEqual([]);
        expect(checkHealthCopy(line).hits, at).toEqual([]);
        // Coaching hints only: nothing about what could go wrong.
        expect(line, at).not.toMatch(/\b(avoid|protect|prevent|careful|never|don't|do not)\b/i);
      }
    }
  });

  it('unknown ids and odd keys give no lines', () => {
    expect(setupCueLines('Nope_Not_A_Lift')).toEqual([]);
    expect(setupCueLines('toString')).toEqual([]);
    expect(setupCueLines('__proto__')).toEqual([]);
    expect(setupCueLines('')).toEqual([]);
  });
});

describe('setupCuesFor: once before the first working set', () => {
  const id = 'Dumbbell_Bench_Press';

  it('gives the lines at the start of the exercise', () => {
    expect(setupCuesFor(id, session())).toEqual([
      'Feet flat.',
      'Shoulder blades back.',
      'Wrists over elbows.',
    ]);
  });

  it('still gives them after the warm-up sets (they come before the first working set)', () => {
    expect(setupCuesFor(id, session({ logs: [log(id, true), log(id, true)] }))).toHaveLength(3);
  });

  it('gives nothing once a working set of the exercise is logged', () => {
    expect(setupCuesFor(id, session({ logs: [log(id, true), log(id)] }))).toEqual([]);
  });

  it('gives nothing when already said this session', () => {
    expect(setupCuesFor(id, session({ setupCuesSaid: [id] }))).toEqual([]);
    expect(setupCuesFor(id, session({ logs: [log(id, true)], setupCuesSaid: [id] }))).toEqual([]);
  });

  it('is per exercise: other lifts in the session do not silence it', () => {
    const other = session({ logs: [log('Pushups')], setupCuesSaid: ['Pushups'] });
    expect(setupCuesFor(id, other)).toHaveLength(3);
    expect(setupCuesFor('Pushups', other)).toEqual([]);
  });

  it('an exercise without data says nothing', () => {
    expect(setupCuesFor('Nope_Not_A_Lift', session())).toEqual([]);
  });

  it('returns a fresh array (the data cannot be changed through it)', () => {
    const a = setupCuesFor(id, session());
    a.push('x');
    expect(setupCuesFor(id, session())).toHaveLength(3);
  });

  it('takes the session state shape (logs with more fields)', () => {
    const state = {
      sessionId: 's1',
      logs: [
        {
          sessionId: 's1',
          exerciseId: id,
          setIndex: 0,
          reps: 8,
          weightKg: 10,
          warmup: true as const,
        },
      ],
    };
    expect(setupCuesFor(id, state)).toHaveLength(3);
  });
});
