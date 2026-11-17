import { describe, expect, it } from 'vitest';
import programJson from '../../data/program.json';
import { estimateMinutes as roughMinutes } from '../dayInfo';
import { estimateMinutes, estimateSeconds, fitToMinutes } from './estimate';
import { TIME_RULES } from './timeRules';
import source from './estimate.ts?raw';
import type { PlannedExercise, Program, ProgramDay } from '../types';

const program = programJson as Program;

const row = (
  exerciseId: string,
  sets: number,
  reps: [number, number] = [8, 12],
  restSec = 90,
  extra: Partial<PlannedExercise> = {},
): PlannedExercise => ({
  exerciseId,
  sets,
  targetReps: reps,
  restSec,
  tracking: 'manual',
  ...extra,
});
const day = (exercises: PlannedExercise[]): ProgramDay => ({ id: 'x', name: 'X', exercises });
const mins = (rows: PlannedExercise[]) => estimateMinutes(day(rows));
const find = (rows: PlannedExercise[], id: string) => rows.find((r) => r.exerciseId === id);

describe('time rules (data)', () => {
  it('has the per-rep time, the set-up per exercise and the 45 s pair rest', () => {
    expect(TIME_RULES.secPerRep).toBeGreaterThan(0);
    expect(TIME_RULES.setupSec).toBeGreaterThan(0);
    expect(TIME_RULES.pairRestSec).toBe(45);
  });
});

describe('estimateSeconds / estimateMinutes', () => {
  it('is set-up + reps at the top of the range + the rests between sets, per exercise', () => {
    const { setupSec, secPerRep } = TIME_RULES;
    const one = [row('a', 3, [8, 12], 90)];
    expect(estimateSeconds(day(one))).toBe(setupSec + 3 * 12 * secPerRep + 2 * 90);
    const two = [...one, row('b', 2, [10, 10], 60)];
    expect(estimateSeconds(day(two))).toBe(
      setupSec + 3 * 12 * secPerRep + 2 * 90 + setupSec + 2 * 10 * secPerRep + 60,
    );
  });

  it('rounds up to whole minutes; an empty day is 0', () => {
    expect(mins([])).toBe(0);
    const sec = estimateSeconds(day([row('a', 3)]));
    expect(mins([row('a', 3)])).toBe(Math.ceil(sec / 60));
    expect(sec % 60).not.toBe(0);
  });

  it('a paired row rests the pair rest (never longer than its own rest)', () => {
    const plain = estimateSeconds(day([row('a', 3, [10, 10], 90)]));
    const paired = estimateSeconds(day([row('a', 3, [10, 10], 90, { pairWith: 'b' })]));
    expect(plain - paired).toBe(2 * (90 - TIME_RULES.pairRestSec));
    const short = estimateSeconds(day([row('a', 3, [10, 10], 30, { pairWith: 'b' })]));
    expect(short).toBe(estimateSeconds(day([row('a', 3, [10, 10], 30)])));
  });

  it('takes other rules as data', () => {
    const rules = { secPerRep: 1, setupSec: 0, pairRestSec: 45 };
    expect(estimateSeconds(day([row('a', 2, [5, 5], 10)]), rules)).toBe(10 + 10);
  });

  it('stays close to the rough "~N min" shown on Today for every program day', () => {
    for (const d of program.days) {
      const m = estimateMinutes(d);
      expect(m, d.id).toBeGreaterThanOrEqual(25);
      expect(m, d.id).toBeLessThanOrEqual(60);
      expect(Math.abs(m - roughMinutes(d)), d.id).toBeLessThanOrEqual(8);
    }
  });
});

describe('fitToMinutes', () => {
  // Two main lifts (about 9 min each) and four accessories.
  const rows = (): PlannedExercise[] => [
    row('main1', 4, [8, 8], 120),
    row('main2', 4, [8, 8], 120),
    row('acc1', 3, [10, 12], 60),
    row('acc2', 3, [10, 12], 60),
    row('acc3', 3, [10, 12], 60),
    row('acc4', 3, [10, 12], 60),
  ];
  const MAIN = ['main1', 'main2'];
  const full = mins(rows());

  it('leaves a day that already fits untouched', () => {
    const r = fitToMinutes(rows(), { minutes: full, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(r.rows).toEqual(rows());
    expect(r.dropped).toEqual([]);
  });

  it('never changes its input', () => {
    const input = rows();
    fitToMinutes(input, { minutes: 15, main: MAIN, pair: true });
    expect(input).toEqual(rows());
  });

  it('pairs neighbouring accessories first, the last ones first, and stops once it fits', () => {
    const r = fitToMinutes(rows(), { minutes: full - 1, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(find(r.rows, 'acc3')).toMatchObject({ pairWith: 'acc4', restSec: 45, sets: 3 });
    expect(find(r.rows, 'acc4')).toMatchObject({ pairWith: 'acc3', restSec: 45, sets: 3 });
    expect(find(r.rows, 'acc1')?.pairWith).toBeUndefined();
    expect(find(r.rows, 'main1')).toEqual(rows()[0]);
    expect(r.rows).toHaveLength(6);
  });

  it('only pairs rows that are next to each other', () => {
    const split = [row('acc1', 3), row('main1', 4), row('acc2', 3), row('acc3', 3)];
    const one = fitToMinutes(split, { minutes: mins(split) - 1, main: ['main1'], pair: true });
    expect(find(one.rows, 'acc2')?.pairWith).toBe('acc3');
    expect(find(one.rows, 'acc1')?.pairWith).toBeUndefined();
  });

  it('then trims accessory sets one at a time from the last, never below 2', () => {
    const allPaired = mins(
      rows().map((p, i) => (i < 2 ? p : { ...p, restSec: 45, pairWith: 'x' })),
    );
    const r = fitToMinutes(rows(), { minutes: allPaired - 1, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(r.rows).toHaveLength(6);
    expect(find(r.rows, 'acc4')?.sets).toBe(2);
    expect(find(r.rows, 'acc1')?.sets).toBe(3);
    for (const p of r.rows) expect(p.sets).toBeGreaterThanOrEqual(2);
    expect(r.rows.slice(0, 2)).toEqual(rows().slice(0, 2));
  });

  it('then drops the last accessories, un-pairing the one left behind', () => {
    const r = fitToMinutes(rows(), { minutes: 27, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(mins(r.rows)).toBeLessThanOrEqual(27);
    expect(r.dropped.length).toBeGreaterThan(0);
    expect(r.dropped).toEqual(['acc4', 'acc3', 'acc2', 'acc1'].slice(0, r.dropped.length));
    expect(r.rows.slice(0, 2)).toEqual(rows().slice(0, 2));
    const ids = new Set(r.rows.map((p) => p.exerciseId));
    for (const p of r.rows) {
      if (p.pairWith !== undefined) expect(ids.has(p.pairWith), p.exerciseId).toBe(true);
      else if (!MAIN.includes(p.exerciseId)) expect(p.restSec).toBe(60);
    }
  });

  it('keeps the main lifts whole while they fit on their own', () => {
    const mainOnly = mins(rows().slice(0, 2));
    const r = fitToMinutes(rows(), { minutes: mainOnly, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(r.rows).toEqual(rows().slice(0, 2));
  });

  it('as a last resort trims and drops the later main lifts, then trims the first (min 2 sets)', () => {
    const r = fitToMinutes(rows(), { minutes: 12, main: MAIN, pair: true });
    expect(r.fits).toBe(true);
    expect(r.rows[0]?.exerciseId).toBe('main1');
    expect(mins(r.rows)).toBeLessThanOrEqual(12);
    const none = fitToMinutes(rows(), { minutes: 2, main: MAIN, pair: true });
    expect(none.fits).toBe(false);
    expect(none.rows).toEqual([{ ...rows()[0], sets: 2 }]);
  });

  it('without `pair` nothing is paired (starter plans)', () => {
    const r = fitToMinutes(rows(), { minutes: 30, main: MAIN });
    expect(r.fits).toBe(true);
    expect(r.rows.every((p) => p.pairWith === undefined)).toBe(true);
  });

  it('never touches `fixed` rows (exercises with logged sets)', () => {
    const r = fitToMinutes(rows(), { minutes: 20, main: MAIN, pair: true, fixed: ['acc4'] });
    expect(find(r.rows, 'acc4')).toEqual(rows()[5]);
  });

  it('is deterministic', () => {
    const a = fitToMinutes(rows(), { minutes: 30, main: MAIN, pair: true });
    const b = fitToMinutes(rows(), { minutes: 30, main: MAIN, pair: true });
    expect(a).toEqual(b);
  });
});

describe('purity', () => {
  it('uses no network, DOM or clock', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
