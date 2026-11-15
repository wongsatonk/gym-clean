import { describe, expect, it } from 'vitest';
import { wordCount } from '../advice';
import { fromUnit } from '../units';
import {
  adjustSummary,
  checkCopy,
  FOOD_DONE,
  FOOD_LATER,
  FOOD_NONE,
  FOOD_SETUP,
  foodIdeasReply,
  HELP_TEXT,
  proposalReply,
  RED_FLAG_LINE,
  REFERRAL_LINE,
  rowAdjustNote,
  SAY_MAX_WORDS,
  SPOKEN_MAX_WORDS,
} from './replies';
import type { DayOverride, PlannedExercise, ProgramDay, Proposal, TrainerState } from '../types';

// Made-up rows and names (the repo is public).
const pe = (exerciseId: string, over: Partial<PlannedExercise> = {}): PlannedExercise => ({
  exerciseId,
  sets: 3,
  targetReps: [8, 12],
  restSec: 90,
  startWeightKg: 10,
  tracking: 'manual',
  ...over,
});
const NAMES: Record<string, string> = {
  curl: 'Dumbbell Bicep Curl',
  hammer: 'Hammer Curls',
  row: 'One-Arm Dumbbell Row',
  press: 'Dumbbell Shoulder Press',
  pushup: 'Pushups',
};
const nameOf = (id: string) => NAMES[id] ?? id;
const STATE: TrainerState = {
  version: 1,
  plan: { days: [], seededFrom: 'x', edited: false },
  schedule: { rotation: [], restWeekdays: [] },
  overrides: [],
};
const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  action: 'lighter',
  scope: 'today',
  title: 'Lighter today',
  lines: [{ before: 'Curl · 3 × 8–12 · 10 kg', after: '2 × 8–12 · 7.5 kg' }],
  why: 'One set fewer and about 10% lighter.',
  say: 'Done. Today is lighter.',
  next: STATE,
  baseVersion: 1,
  ...over,
});

describe('fixed lines', () => {
  it('has the SPEC referral and red-flag lines verbatim', () => {
    expect(REFERRAL_LINE).toBe("If something doesn't feel right, check with a doctor or physio.");
    expect(RED_FLAG_LINE).toBe('Stop the workout for today and get checked by a doctor.');
  });

  it('every fixed line passes checkCopy and may be spoken (≤ 12 words)', () => {
    for (const line of [
      REFERRAL_LINE,
      RED_FLAG_LINE,
      HELP_TEXT,
      FOOD_LATER,
      FOOD_SETUP,
      FOOD_DONE,
      FOOD_NONE,
    ]) {
      expect(checkCopy(line), line).toEqual({ ok: true, hits: [] });
      expect(wordCount(line)).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
    }
    expect(SPOKEN_MAX_WORDS).toBe(12);
    expect(SAY_MAX_WORDS).toBe(8);
  });

  it('help starts with "I can help with:" and food says it comes with Fuel', () => {
    expect(HELP_TEXT).toBe('I can help with:');
    expect(FOOD_LATER).toBe('Food tips come with Fuel.');
  });

  it('food (M7): targets hit, setup help, and the ideas line with what is left', () => {
    expect(FOOD_DONE).toBe("You've hit today's targets.");
    expect(FOOD_SETUP).toMatch(/Fuel/);
    expect(foodIdeasReply({ kcal: 900.4, proteinG: 40 })).toBe(
      '40 g protein and 900 kcal left today. Some ideas:',
    );
    expect(foodIdeasReply({ kcal: 900, proteinG: 0 })).toBe('900 kcal left today. Some ideas:');
    expect(foodIdeasReply({ kcal: 0, proteinG: 22.5 })).toBe(
      '23 g protein left today. Some ideas:',
    );
    // Whole grams only, shown or spoken.
    expect(foodIdeasReply({ kcal: 640.6, proteinG: 35.14 })).toBe(
      '35 g protein and 641 kcal left today. Some ideas:',
    );
    expect(foodIdeasReply({ kcal: 300, proteinG: 0.4 })).toBe('300 kcal left today. Some ideas:');
    expect(foodIdeasReply({ kcal: 0.3, proteinG: 0.2 })).toBe('Some ideas:');
    for (const m of [
      { kcal: 900, proteinG: 40 },
      { kcal: 0, proteinG: 10 },
    ]) {
      expect(checkCopy(foodIdeasReply(m)).ok).toBe(true);
    }
  });
});

describe('checkCopy', () => {
  it('flags the M5b banned stems anywhere in a word', () => {
    expect(checkCopy('No pain today').hits).toContain('pain');
    expect(checkCopy('That was an injury').ok).toBe(false);
    expect(checkCopy('It is safe to lift').hits).toContain('safe');
    expect(checkCopy('My arms HURT').ok).toBe(false);
  });

  it('flags diagnosis terms as words, prefixes and Thai substrings', () => {
    expect(checkCopy('Sounds like a strain').hits).toContain('strain');
    expect(checkCopy('maybe tendinitis').ok).toBe(false);
    expect(checkCopy('I diagnosed it').ok).toBe(false);
    expect(checkCopy('rotator cuff stuff').ok).toBe(false);
    expect(checkCopy('อาจจะอักเสบ').ok).toBe(false);
  });

  it('does not flag words that only contain a diagnosis term', () => {
    expect(checkCopy('Steady tempo, one more set.').ok).toBe(true);
    expect(checkCopy('Go easy on your arms today').ok).toBe(true);
  });
});

describe('proposalReply', () => {
  it('passes a clean proposal through', () => {
    const p = proposal();
    expect(proposalReply(p)).toEqual({
      title: p.title,
      lines: p.lines,
      why: p.why,
      say: 'Done. Today is lighter.',
    });
  });

  it('keeps say ≤ 8 words and falls back per action when it is missing or too long', () => {
    const long = proposalReply(
      proposal({ action: 'swap', say: 'Done. A very long sentence that goes on and on.' }),
    );
    expect(wordCount(long.say)).toBeLessThanOrEqual(SAY_MAX_WORDS);
    expect(long.say).toBe('Done. Exercise swapped.');
    const rest: Omit<Proposal, 'say'> & { say?: string } = proposal({ action: 'postpone' });
    delete rest.say;
    expect(proposalReply(rest).say).toBe('Done. Today is a rest day.');
  });

  it('replaces any text that fails checkCopy with a safe fallback', () => {
    const r = proposalReply(
      proposal({
        action: 'avoidArea',
        title: 'Rest that strain',
        why: 'Painful arms need care.',
        say: 'Done. No pain today.',
        lines: [{ before: 'Curl', after: 'Avoid the tear' }],
      }),
    );
    for (const t of [r.title, r.why, r.say, ...r.lines.flatMap((l) => [l.before, l.after])])
      expect(checkCopy(t).ok, t).toBe(true);
    expect(r.title).toBe('Go easy today');
  });

  it('every action has a clean fallback title, why and say', () => {
    for (const action of [
      'postpone',
      'avoidArea',
      'lighter',
      'deload',
      'swap',
      'stall',
      'food',
    ] as const) {
      const r = proposalReply(proposal({ action, title: 'pain', why: 'pain', say: 'pain' }));
      for (const t of [r.title, r.why, r.say])
        expect(checkCopy(t).ok, `${action}: ${t}`).toBe(true);
      expect(wordCount(r.say)).toBeLessThanOrEqual(SAY_MAX_WORDS);
    }
  });
});

describe('adjustSummary', () => {
  const day: ProgramDay = {
    id: 'pull',
    name: 'Pull',
    exercises: [pe('row'), pe('curl'), pe('press')],
  };
  const ov = (adjust: DayOverride['adjust']): DayOverride => ({
    date: '2026-11-11',
    dayId: 'pull',
    ...(adjust ? { adjust } : {}),
  });

  it('avoid area: the area plus swap / removed / lighter counts', () => {
    const o = ov({
      kind: 'avoidArea',
      area: 'arms',
      exercises: [
        pe('row', { adjusted: 'avoidArea', weightKgToday: 7.5 }),
        pe('hammer', { adjusted: 'avoidArea' }),
      ],
    });
    expect(adjustSummary(o, nameOf, day)).toBe('Easy on arms · 1 swap, 1 removed, 1 lighter');
    // Without the plan day the counts are unknown, so only the area is named.
    expect(adjustSummary(o, nameOf)).toBe('Easy on arms');
  });

  it('lighter and deload are named as such', () => {
    expect(adjustSummary(ov({ kind: 'lighter', exercises: [pe('row')] }), nameOf, day)).toBe(
      'Lighter today',
    );
    expect(adjustSummary(ov({ kind: 'deload', exercises: [pe('row')] }), nameOf, day)).toBe(
      'Deload week',
    );
  });

  it('one swap names both exercises; removals are counted', () => {
    const one = ov({
      kind: 'swap',
      exercises: [pe('row'), pe('hammer', { adjusted: 'swap' }), pe('press')],
    });
    expect(adjustSummary(one, nameOf, day)).toBe('Dumbbell Bicep Curl swapped for Hammer Curls');
    const removed = ov({ kind: 'swap', exercises: [pe('row'), pe('press')] });
    expect(adjustSummary(removed, nameOf, day)).toBe('Changed today · 1 removed');
  });

  it('a moved day and a rest override have short labels; nothing else is null', () => {
    expect(adjustSummary({ date: '2026-11-11', rest: true }, nameOf)).toBe('Rest day (moved)');
    expect(adjustSummary({ date: '2026-11-11' }, nameOf)).toBe('Training day (moved)');
    expect(adjustSummary({ date: '2026-11-11', dayId: 'pull' }, nameOf)).toBe(
      'Training day (moved)',
    );
  });

  it('every summary passes checkCopy', () => {
    for (const area of ['arms', 'shoulders', 'chest', 'back', 'legs', 'core'] as const) {
      const s = adjustSummary(ov({ kind: 'avoidArea', area, exercises: [] }), nameOf, day);
      expect(s && checkCopy(s).ok, s ?? '').toBe(true);
    }
  });
});

describe('rowAdjustNote', () => {
  it('removed and swapped rows', () => {
    expect(rowAdjustNote(pe('curl'), null, 'kg', nameOf)).toBe('Removed');
    expect(rowAdjustNote(pe('curl'), pe('hammer', { adjusted: 'swap' }), 'kg', nameOf)).toBe(
      'Swapped for Hammer Curls',
    );
    expect(rowAdjustNote(undefined, pe('hammer'), 'kg', nameOf)).toBe('Added');
  });

  it('sets, weight (was …) and reps in the display unit', () => {
    const before = pe('row', { sets: 4, startWeightKg: 12.5 });
    const after = pe('row', {
      sets: 3,
      startWeightKg: 12.5,
      weightKgToday: 10,
      adjusted: 'lighter',
    });
    expect(rowAdjustNote(before, after, 'kg', nameOf)).toBe('−1 set · 10 kg (was 12.5)');
    // Last time's weight is what the row would have run.
    expect(rowAdjustNote(before, after, 'kg', nameOf, 15)).toBe('−1 set · 10 kg (was 15)');
    const lb = pe('row', { weightKgToday: fromUnit(40, 'lb'), adjusted: 'lighter' });
    expect(rowAdjustNote(pe('row', { startWeightKg: fromUnit(45, 'lb') }), lb, 'lb', nameOf)).toBe(
      '40 lb (was 45)',
    );
    const bw = pe('pushup', { startWeightKg: 0, targetReps: [6, 10], sets: 2 });
    expect(rowAdjustNote(pe('pushup', { startWeightKg: 0, sets: 3 }), bw, 'kg', nameOf)).toBe(
      '−1 set · 6–10 reps (was 8–12)',
    );
    expect(rowAdjustNote(pe('row', { sets: 3 }), pe('row', { sets: 4 }), 'kg', nameOf)).toBe(
      '+1 set',
    );
    expect(rowAdjustNote(pe('row', { sets: 5 }), pe('row', { sets: 3 }), 'kg', nameOf)).toBe(
      '−2 sets',
    );
  });

  it('no change → null', () => {
    expect(rowAdjustNote(pe('row'), pe('row'), 'kg', nameOf)).toBeNull();
    expect(rowAdjustNote(undefined, null, 'kg', nameOf)).toBeNull();
  });

  it('every note passes checkCopy', () => {
    const notes = [
      rowAdjustNote(pe('curl'), null, 'kg', nameOf),
      rowAdjustNote(pe('curl'), pe('hammer'), 'kg', nameOf),
      rowAdjustNote(pe('row'), pe('row', { sets: 2, weightKgToday: 7.5 }), 'kg', nameOf),
    ];
    for (const n of notes) expect(n && checkCopy(n).ok, n ?? '').toBe(true);
  });
});
