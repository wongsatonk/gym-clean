import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addDate } from '../trainer/plan';
import type { BodyArea, DayFeel, HealthDay, HealthWorkout, ReadinessCard } from '../types';
import { checkHealthCopy } from './copy';
import {
  feelOffers,
  feelSignals,
  firedDaysBefore,
  readinessCard,
  readinessSignals,
  todaysFeelOffers,
  type ReadinessInput,
} from './readiness';
import { HEALTH_RULES } from './rules';

/** Made-up numbers only (the repo is public). */
let tz: string | undefined;
beforeAll(() => {
  tz = process.env.TZ;
  process.env.TZ = 'Asia/Bangkok';
});
afterAll(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

const TODAY = '2026-06-30';
const NOW = Date.parse('2026-06-30T07:30:00+07:00');
const HOUR = 3_600_000;

/** 28 usual days before `date`: sleep 420, resting HR 55, HRV 60 (WHOOP), workouts 400 kcal. */
function usual(date = TODAY, n = 28): HealthDay[] {
  return Array.from({ length: n }, (_, k) => {
    const d = addDate(date, -(k + 1));
    return {
      date: d,
      sleepMin: 420,
      restingHr: 55,
      hrvMs: 60,
      hrvSource: 'WHOOP',
      workouts:
        k % 3 === 0
          ? [
              {
                start: Date.parse(`${d}T10:00:00Z`),
                minutes: 40,
                kind: 'running',
                kcal: 400,
                source: 'WHOOP',
              },
            ]
          : [],
    };
  });
}

const today = (over: Partial<HealthDay>): HealthDay => ({
  date: TODAY,
  sleepMin: 420,
  restingHr: 55,
  hrvMs: 60,
  hrvSource: 'WHOOP',
  ...over,
});

const sig = (days: HealthDay[], now = NOW) =>
  readinessSignals(days, TODAY, now).map((s) => s.signal);

const workout = (endsHoursAgo: number, minutes: number, kcal?: number): HealthWorkout => ({
  start: NOW - endsHoursAgo * HOUR - minutes * 60_000,
  minutes,
  kind: 'soccer',
  ...(kcal === undefined ? {} : { kcal }),
  source: 'WHOOP',
});

describe('readinessSignals: each signal at its edges', () => {
  it('a usual day has no signal', () => {
    expect(sig([...usual(), today({})])).toEqual([]);
  });

  it('sleep: 60 min under fires, 59 does not', () => {
    expect(sig([...usual(), today({ sleepMin: 360 })])).toEqual(['sleepShort']);
    expect(sig([...usual(), today({ sleepMin: 361 })])).toEqual([]);
  });

  it('HRV: 15% under fires, a bit less does not', () => {
    expect(sig([...usual(), today({ hrvMs: 51 })])).toEqual(['hrvLow']);
    expect(sig([...usual(), today({ hrvMs: 51.1 })])).toEqual([]);
  });

  it('HRV from another source than the baseline: no signal', () => {
    expect(sig([...usual(), today({ hrvMs: 30, hrvSource: 'Watch' })])).toEqual([]);
  });

  it('resting HR: 5 bpm over fires, 4 does not', () => {
    expect(sig([...usual(), today({ restingHr: 60 })])).toEqual(['restingHrHigh']);
    expect(sig([...usual(), today({ restingHr: 59 })])).toEqual([]);
  });

  it('outside workout: ≥ 60 min within 24 h fires', () => {
    const y = addDate(TODAY, -1);
    const days = (w: HealthWorkout) => [
      ...usual().filter((d) => d.date !== y),
      { date: y, sleepMin: 420, workouts: [w] },
      today({}),
    ];
    expect(sig(days(workout(23, 60)))).toEqual(['hardOutsideWorkout']);
    expect(sig(days(workout(23, 59)))).toEqual([]);
    expect(sig(days(workout(24.5, 90)))).toEqual([]);
  });

  it('outside workout: ≥ 1.5 × his median workout kcal fires', () => {
    const y = addDate(TODAY, -1);
    const days = (w: HealthWorkout) => [
      ...usual().filter((d) => d.date !== y),
      { date: y, workouts: [w] },
      today({}),
    ];
    expect(sig(days(workout(5, 40, 600)))).toEqual(['hardOutsideWorkout']);
    expect(sig(days(workout(5, 40, 599)))).toEqual([]);
  });

  it('a WHOOP log of his own Gym Clean session (overlapping in time) is no signal', () => {
    const y = addDate(TODAY, -1);
    const gymStart = Date.parse(`${y}T18:00:00+07:00`);
    const strength: HealthWorkout = {
      start: gymStart - 3 * 60_000,
      minutes: 70,
      kind: 'traditionalStrengthTraining',
      source: 'WHOOP',
    };
    const days = [
      ...usual().filter((d) => d.date !== y),
      { date: y, sleepMin: 420, workouts: [strength] },
      today({}),
    ];
    const gym = [
      { sessionId: 's', dayId: 'push-a', startedAt: gymStart, endedAt: gymStart + 65 * 60_000 },
    ];
    expect(sig(days)).toEqual(['hardOutsideWorkout']);
    expect(readinessSignals(days, TODAY, NOW, undefined, gym)).toEqual([]);
    // An unfinished session is not an interval: still a signal.
    expect(
      readinessSignals(days, TODAY, NOW, undefined, [
        { sessionId: 'o', dayId: 'x', startedAt: gymStart },
      ]).map((s) => s.signal),
    ).toEqual(['hardOutsideWorkout']);
    // readinessCard passes them on.
    const two = [...days.slice(0, -1), today({ sleepMin: 300 })];
    expect(readinessCard(input(two))?.signals).toEqual(['sleepShort', 'hardOutsideWorkout']);
    expect(readinessCard(input(two, { gymSessions: gym }))).toBeNull();
  });

  it('a workout later today than `now` does not count', () => {
    expect(sig([...usual(), today({ workouts: [workout(-3, 90)] })])).toEqual([]);
  });

  it('WHOOP recovery (route B) in the lowest band fires', () => {
    expect(sig([...usual(), today({ whoopRecoveryPct: 33 })])).toEqual(['whoopLow']);
    expect(sig([...usual(), today({ whoopRecoveryPct: 34 })])).toEqual([]);
  });

  it('fewer than 7 baseline days: no signal however big the change', () => {
    expect(sig([...usual(TODAY, 6), today({ sleepMin: 200, restingHr: 75, hrvMs: 20 })])).toEqual(
      [],
    );
  });

  it('missing today values: no signal', () => {
    expect(sig([...usual(), { date: TODAY }])).toEqual([]);
    expect(sig(usual())).toEqual([]);
  });

  it('details carry the change for the copy', () => {
    const d = readinessSignals(
      [...usual(), today({ sleepMin: 340, restingHr: 62, hrvMs: 45 })],
      TODAY,
      NOW,
    );
    expect(d).toEqual([
      { signal: 'sleepShort', shortByMin: 80 },
      { signal: 'hrvLow', lowerByPct: 25 },
      { signal: 'restingHrHigh', higherByBpm: 7 },
    ]);
  });
});

const input = (days: HealthDay[], over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  date: TODAY,
  now: NOW,
  days,
  trainingDay: true,
  ...over,
});

describe('readinessCard', () => {
  const two = [...usual(), today({ sleepMin: 340, restingHr: 62 })];

  it('one signal: no card', () => {
    expect(readinessCard(input([...usual(), today({ sleepMin: 300 })]))).toBeNull();
  });

  it('two signals: a Lighter card with the reasons as facts', () => {
    const card = readinessCard(input(two));
    expect(card).toEqual({
      date: TODAY,
      signals: ['sleepShort', 'restingHrHigh'],
      reasons: [
        'Sleep was about 1 h 20 m shorter than usual.',
        'Resting heart rate is about 7 bpm higher than usual.',
      ],
      offer: 'lighter',
    });
    for (const r of card?.reasons ?? []) expect(checkHealthCopy(r).ok).toBe(true);
  });

  it('rest day or mid-workout: no card', () => {
    expect(readinessCard(input(two, { trainingDay: false }))).toBeNull();
    expect(readinessCard(input(two, { inWorkout: true }))).toBeNull();
  });

  it('once per day: answered today → nothing; a card already made today is kept as is', () => {
    expect(readinessCard(input(two, { history: { answeredDate: TODAY } }))).toBeNull();
    expect(
      readinessCard(input(two, { history: { answeredDate: addDate(TODAY, -1) } })),
    ).not.toBeNull();
    const earlier: ReadinessCard = {
      date: TODAY,
      signals: ['sleepShort', 'hrvLow'],
      reasons: ['x', 'y'],
      offer: 'lighter',
    };
    // A later read today (now with other or fewer signals) doesn't change or hide it.
    expect(readinessCard(input([...usual(), today({})], { history: { lastCard: earlier } }))).toBe(
      earlier,
    );
    const old = { ...earlier, date: addDate(TODAY, -1) };
    expect(
      readinessCard(input([...usual(), today({})], { history: { lastCard: old } })),
    ).toBeNull();
  });
});

describe('deload nudge', () => {
  /** Usual history where the listed days-ago had short sleep + high resting HR. */
  function withFired(daysAgo: number[]): HealthDay[] {
    const base = usual(TODAY, 40);
    return base.map((d) => {
      const ago = (Date.parse(TODAY) - Date.parse(d.date)) / 86_400_000;
      return daysAgo.includes(ago) ? { ...d, sleepMin: 330, restingHr: 63 } : d;
    });
  }
  const todayTwo = today({ sleepMin: 340, restingHr: 62 });

  it('counts the days the 2-signal rule fired in the 7 days before today', () => {
    expect(firedDaysBefore(withFired([1, 3, 6]), TODAY)).toBe(3);
    expect(firedDaysBefore(withFired([1, 3, 8]), TODAY)).toBe(2);
  });

  it('fired on ≥ 3 of the last 7 days → Deload week instead of Lighter', () => {
    const card = readinessCard(input([...withFired([1, 3, 6]), todayTwo]));
    expect(card?.offer).toBe('deload');
    expect(card?.reasons.at(-1)).toBe('This came up on 3 of the last 7 days.');
    expect(readinessCard(input([...withFired([1, 3, 8]), todayTwo]))?.offer).toBe('lighter');
  });

  it('at most once per 14 days', () => {
    const days = [...withFired([1, 2, 3]), todayTwo];
    const at = (ago: number) =>
      readinessCard(input(days, { history: { lastDeloadOfferDate: addDate(TODAY, -ago) } }))?.offer;
    expect(at(13)).toBe('lighter');
    expect(at(14)).toBe('deload');
  });

  it('no card today means no deload either (the nudge rides on the card)', () => {
    expect(readinessCard(input([...withFired([1, 2, 3]), today({})]))).toBeNull();
  });
});

describe('M12 1b feel today → signals', () => {
  const feel = (over: Partial<DayFeel>): DayFeel => ({ date: TODAY, ...over });

  it('energy ≤ 2 is feltLow; any sore area is sore; nothing said is no signal', () => {
    expect(feelSignals(undefined)).toEqual([]);
    expect(feelSignals(feel({}))).toEqual([]);
    expect(feelSignals(feel({ energy: 3, sore: [] }))).toEqual([]);
    expect(feelSignals(feel({ energy: 2 }))).toEqual([{ signal: 'feltLow' }]);
    expect(feelSignals(feel({ energy: 1 }))).toEqual([{ signal: 'feltLow' }]);
    expect(feelSignals(feel({ energy: 5, sore: ['shoulders'] }))).toEqual([
      { signal: 'sore', areas: ['shoulders'] },
    ]);
  });

  it('sore areas are listed once each, in the fixed area order; unknown values are dropped', () => {
    const sore = ['legs', 'shoulders', 'legs', 'neck'] as BodyArea[];
    expect(feelSignals(feel({ sore }))).toEqual([{ signal: 'sore', areas: ['shoulders', 'legs'] }]);
    expect(feelSignals(feel({ sore: ['neck'] as unknown as BodyArea[] }))).toEqual([]);
  });

  it('the energy threshold is data', () => {
    expect(feelSignals(feel({ energy: 3 }), { ...HEALTH_RULES, feelLowEnergy: 3 })).toEqual([
      { signal: 'feltLow' },
    ]);
  });

  it("only the asked day's row counts", () => {
    const feels = [feel({ date: addDate(TODAY, -1), energy: 1, sore: ['legs'] })];
    expect(readinessCard(input([], { feels }))).toBeNull();
  });

  it('without Health: low energy + a sore area show the card; one alone does not', () => {
    const card = readinessCard(input([], { feels: [feel({ energy: 2, sore: ['shoulders'] })] }));
    expect(card).toEqual({
      date: TODAY,
      signals: ['feltLow', 'sore'],
      reasons: ['You said your energy is low today.', 'You said your shoulders are sore.'],
      offer: 'lighter',
    });
    expect(readinessCard(input([], { feels: [feel({ energy: 1 })] }))).toBeNull();
    expect(readinessCard(input([], { feels: [feel({ sore: ['legs', 'back'] })] }))).toBeNull();
    expect(readinessCard(input([], { feels: [feel({ energy: 4 })] }))).toBeNull();
  });

  it('with Health: one feel signal + one Health signal show the card, Health reasons first', () => {
    const one = [...usual(), today({ sleepMin: 340 })];
    expect(readinessCard(input(one))).toBeNull();
    expect(readinessCard(input(one, { feels: [feel({ energy: 4 })] }))).toBeNull();
    const low = readinessCard(input(one, { feels: [feel({ energy: 2 })] }));
    expect(low?.signals).toEqual(['sleepShort', 'feltLow']);
    expect(low?.reasons).toEqual([
      'Sleep was about 1 h 20 m shorter than usual.',
      'You said your energy is low today.',
    ]);
    const sore = readinessCard(input(one, { feels: [feel({ sore: ['legs'] })] }));
    expect(sore?.signals).toEqual(['sleepShort', 'sore']);
    expect(sore?.reasons.at(-1)).toBe('You said your legs are sore.');
  });

  it('with Health: two Health signals + both feel signals list all four', () => {
    const two = [...usual(), today({ sleepMin: 340, restingHr: 62 })];
    const card = readinessCard(input(two, { feels: [feel({ energy: 1, sore: ['core'] })] }));
    expect(card?.signals).toEqual(['sleepShort', 'restingHrHigh', 'feltLow', 'sore']);
    for (const r of card?.reasons ?? []) expect(checkHealthCopy(r).hits, r).toEqual([]);
  });

  it('rest day, mid-workout and an answered card still win', () => {
    const feels = [feel({ energy: 1, sore: ['arms'] })];
    expect(readinessCard(input([], { feels, trainingDay: false }))).toBeNull();
    expect(readinessCard(input([], { feels, inWorkout: true }))).toBeNull();
    expect(readinessCard(input([], { feels, history: { answeredDate: TODAY } }))).toBeNull();
  });

  it('feel days count toward the deload week like any other fired day', () => {
    const feels = [0, 1, 2, 5].map((ago) =>
      feel({ date: addDate(TODAY, -ago), energy: 2, sore: ['back'] }),
    );
    expect(firedDaysBefore([], TODAY, undefined, [], feels)).toBe(3);
    const card = readinessCard(input([], { feels }));
    expect(card?.offer).toBe('deload');
    expect(card?.reasons.at(-1)).toBe('This came up on 3 of the last 7 days.');
  });

  it('a sore area offers "go easy on" for today, also when there is no card', () => {
    expect(feelOffers(undefined)).toEqual([]);
    expect(feelOffers(feel({ energy: 1 }))).toEqual([]);
    expect(feelOffers(feel({ sore: ['legs', 'shoulders'] }))).toEqual([
      { area: 'shoulders', text: 'Go easy on shoulders today?' },
      { area: 'legs', text: 'Go easy on legs today?' },
    ]);
    expect(todaysFeelOffers([feel({ date: addDate(TODAY, -1), sore: ['legs'] })], TODAY)).toEqual(
      [],
    );
    expect(todaysFeelOffers([feel({ sore: ['chest'] })], TODAY)).toEqual([
      { area: 'chest', text: 'Go easy on chest today?' },
    ]);
  });
});
