import { describe, expect, it } from 'vitest';
import type { SetLog } from '../types';
import {
  E1RM_MAX_REPS,
  bestSetE1rm,
  e1rm,
  e1rmSeries,
  e1rmSeriesByLift,
  formatE1rm,
  peakE1rm,
  type E1rmSession,
} from './e1rm';

// Made-up lifts and numbers only.
const DAY = 86_400_000;
const T0 = new Date(2026, 5, 1, 18, 0).getTime(); // 2026-06-01 18:00 local

let seq = 0;
function set(sessionId: string, exerciseId: string, weightKg: number, reps: number, extra: Partial<SetLog> = {}): SetLog {
  seq += 1;
  return {
    sessionId,
    exerciseId,
    setIndex: seq,
    reps,
    weightKg,
    restTakenSec: 90,
    startedAt: T0 + seq * 1000,
    endedAt: T0 + seq * 1000 + 500,
    ...extra,
  };
}
const session = (sessionId: string, day: number, extra: Partial<E1rmSession> = {}): E1rmSession => ({
  sessionId,
  startedAt: T0 + day * DAY,
  endedAt: T0 + day * DAY + 3_600_000,
  ...extra,
});

describe('e1rm (Epley)', () => {
  it('known values: w × (1 + r/30), and one rep is the weight itself', () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(60, 8)).toBeCloseTo(76, 6);
    expect(e1rm(100, 10)).toBeCloseTo(133.3333, 3);
    expect(e1rm(50, 12)).toBeCloseTo(70, 6);
    expect(e1rm(40, 5, 'epley')).toBeCloseTo(46.6667, 3);
  });

  it('sets above 12 reps are not charted', () => {
    expect(E1RM_MAX_REPS).toBe(12);
    expect(e1rm(40, 13)).toBeNull();
    expect(e1rm(40, 20)).toBeNull();
  });

  it('no reps, no weight (bodyweight) or junk → null', () => {
    expect(e1rm(60, 0)).toBeNull();
    expect(e1rm(0, 8)).toBeNull();
    expect(e1rm(-5, 8)).toBeNull();
    expect(e1rm(Number.NaN, 8)).toBeNull();
    expect(e1rm(60, Number.NaN)).toBeNull();
  });
});

describe('bestSetE1rm', () => {
  it('picks the set with the highest estimate, not just the heaviest', () => {
    // 60 × 3 → 66; 55 × 8 → 69.67 (lighter but a higher estimate).
    const best = bestSetE1rm([set('s', 'press', 60, 3), set('s', 'press', 55, 8)]);
    expect(best).toMatchObject({ weightKg: 55, reps: 8 });
    expect(best?.e1rmKg).toBeCloseTo(69.6667, 3);
  });

  it('leaves out warm-ups, sets over 12 reps and 0-rep sets', () => {
    const best = bestSetE1rm([
      set('s', 'press', 80, 5, { warmup: true }),
      set('s', 'press', 50, 15),
      set('s', 'press', 70, 0),
      set('s', 'press', 40, 6),
    ]);
    expect(best).toMatchObject({ weightKg: 40, reps: 6 });
    expect(bestSetE1rm([set('s', 'press', 80, 5, { warmup: true })])).toBeNull();
    expect(bestSetE1rm([])).toBeNull();
  });

  it('an equal estimate keeps the earlier set', () => {
    const a = set('s', 'press', 60, 5);
    const b = set('s', 'press', 60, 5);
    expect(bestSetE1rm([b, a])?.startedAt).toBe(a.startedAt);
  });
});

describe('e1rmSeries', () => {
  const sessions = [
    session('s1', 0),
    session('s2', 3),
    session('s3', 7, { adjust: ['lighter'] }),
    session('s4', 10, { adjust: ['deload'] }),
    session('s5', 14, { adjust: ['swap'] }),
    { sessionId: 'open', startedAt: T0 + 15 * DAY },
  ];
  const sets = [
    set('s2', 'press', 62.5, 6),
    set('s1', 'press', 30, 8, { warmup: true }),
    set('s1', 'press', 60, 8),
    set('s1', 'press', 60, 6),
    set('s1', 'row', 40, 10),
    set('s2', 'press', 62.5, 8),
    set('s3', 'press', 55, 8),
    set('s4', 'press', 50, 8),
    set('s5', 'press', 65, 8),
    set('open', 'press', 100, 8),
    set('ghost', 'press', 100, 8),
  ];

  it('one point per finished session, oldest first, with that session’s best set', () => {
    const series = e1rmSeries('press', sets, sessions);
    expect(series.map((p) => p.sessionId)).toEqual(['s1', 's2', 's3', 's4', 's5']);
    expect(series[0]).toMatchObject({ sessionId: 's1', weightKg: 60, reps: 8, date: '2026-06-01', lighter: false });
    expect(series[0]?.e1rmKg).toBeCloseTo(76, 6);
    expect(series[0]?.at).toBe(T0);
    expect(series[1]).toMatchObject({ weightKg: 62.5, reps: 8, date: '2026-06-04' });
    expect(series[1]?.e1rmKg).toBeCloseTo(79.1667, 3);
  });

  it('marks lighter and deload sessions (other adjustments are not marked)', () => {
    const series = e1rmSeries('press', sets, sessions);
    expect(series.map((p) => p.lighter)).toEqual([false, false, true, true, false]);
  });

  it('skips unfinished sessions, unknown sessions and sessions with nothing to chart', () => {
    const series = e1rmSeries('press', [...sets, set('s2', 'curl', 10, 15)], sessions);
    expect(series.some((p) => p.sessionId === 'open' || p.sessionId === 'ghost')).toBe(false);
    expect(e1rmSeries('curl', [set('s2', 'curl', 10, 15)], sessions)).toEqual([]);
    expect(e1rmSeries('dip', [set('s1', 'dip', 0, 10)], sessions)).toEqual([]);
  });

  it('series per lift, in the order the lifts were first done', () => {
    const byLift = e1rmSeriesByLift(sets, sessions);
    expect([...byLift.keys()]).toEqual(['press', 'row']);
    expect(byLift.get('row')).toHaveLength(1);
    expect(byLift.get('press')).toEqual(e1rmSeries('press', sets, sessions));
  });

  it('peak ignores lighter/deload sessions unless asked', () => {
    const series = e1rmSeries('press', [...sets, set('s3', 'press', 90, 8)], sessions);
    expect(peakE1rm(series)?.sessionId).toBe('s5');
    expect(peakE1rm(series, { includeLighter: true })?.sessionId).toBe('s3');
    expect(peakE1rm([])).toBeNull();
  });
});

describe('units', () => {
  it('shows the estimate in his unit, one decimal at most', () => {
    expect(formatE1rm(76, 'kg')).toBe('76 kg');
    expect(formatE1rm(79.1667, 'kg')).toBe('79.2 kg');
    expect(formatE1rm(76, 'lb')).toBe('167.6 lb');
  });
});

describe('one-sided sets (M13b)', () => {
  it('estimate from the lower side (the set’s reps), never the better side', () => {
    const s = set('s', 'row', 20, 10, {
      sides: { right: { reps: 12, partials: 0 }, left: { reps: 10, partials: 0 } },
    });
    expect(bestSetE1rm([s])).toMatchObject({ weightKg: 20, reps: 10 });
    expect(bestSetE1rm([s])?.e1rmKg).toBeCloseTo(e1rm(20, 10) ?? 0, 6);
  });
});
