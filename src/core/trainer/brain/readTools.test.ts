import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import howtoJson from '../../../data/howto.json';
import cuesJson from '../../../data/cues.json';
import { effectiveDays } from '../plan';
import { handle } from '../coach';
import { monthScore, weekScore } from '../../progress/completion';
import {
  factsInput,
  factsMatch,
  NOT_IN_PLAN,
  READ_RESULT_MAX_CHARS,
  readToolResults,
  type FactsScenario,
} from './readTools';
import facts from '../evals/facts.json';
import type { BrainInput } from './context';
import type { Food, Program } from '../../types';

const CATALOG = trainerCatalog();
const program = programJson as Program;
const howto = howtoJson as Record<string, { lines: string[]; focus?: string }>;
const cues = cuesJson as Record<string, string>;
const scenario = facts.scenario as FactsScenario;

function input(over: Partial<BrainInput> = {}): BrainInput {
  return {
    ...factsInput(scenario, program, CATALOG),
    howTo: (id) => howto[id],
    cue: (id) => cues[id],
    ...over,
  };
}

describe('readToolResults', () => {
  it('weekSummary and progressSummary are the rule answers, with periodScore numbers', () => {
    const i = input();
    const r = readToolResults(i);
    const ctx = { ...i.coach, phase: 'today' as const };
    expect(r.weekSummary).toBe(handle({ chip: 'week' }, ctx).reply);
    expect(r.progressSummary).toBe(handle({ chip: 'progress' }, ctx).reply);
    const cin = {
      state: ctx.state,
      sessions: ctx.sessions,
      sets: ctx.sets ?? [],
      today: ctx.today,
      catalog: ctx.catalog,
    };
    const w = weekScore(cin, ctx.today);
    const m = monthScore(cin, ctx.today.slice(0, 7));
    expect(r.weekSummary).toContain(`${w.sessionsDone} of ${w.sessionsPlanned} sessions`);
    expect(r.progressSummary).toContain(
      `This month: ${m.sessionsDone} of ${m.sessionsPlanned} sessions`,
    );
  });

  it('the same numbers mid-workout (read tools never refuse)', () => {
    const i = input();
    const mid = readToolResults({ ...i, coach: { ...i.coach, phase: 'workout' } });
    expect(mid.weekSummary).toBe(readToolResults(i).weekSummary);
  });

  it("has exerciseInfo for every exercise today and in the next 7 days, from the catalog's how-to, cue and muscles", () => {
    const i = input();
    const r = readToolResults(i);
    const ids = new Set(
      effectiveDays(i.coach.state, i.coach.sessions, i.coach.today, 8).flatMap((e) =>
        e.rest || !e.day ? [] : e.day.exercises.map((p) => p.exerciseId),
      ),
    );
    expect(ids.size).toBeGreaterThan(5);
    for (const id of ids) {
      const text = r[`exerciseInfo:${id}`];
      expect(text, id).toBeDefined();
      const ex = CATALOG.exercises.find((e) => e.id === id);
      expect(text).toContain(ex?.name ?? id);
      expect(text).toContain(ex?.primaryMuscles[0] ?? '');
      if (howto[id]) expect(text).toContain(howto[id].lines[0]);
      if (cues[id]) expect(text).toContain(cues[id]);
    }
    expect(r.exerciseInfo).toBe(NOT_IN_PLAN);
  });

  it('falls back to the catalog instructions without a how-to', () => {
    const i = input({ howTo: () => undefined, cue: () => undefined });
    const r = readToolResults(i);
    const text = r['exerciseInfo:Dumbbell_Bench_Press'] ?? '';
    const ex = CATALOG.exercises.find((e) => e.id === 'Dumbbell_Bench_Press');
    expect(text).toContain((ex?.instructions[0] ?? '').slice(0, 30));
  });

  it("foodIdeas says what's left and lists ideas from the M10 food suggestion", () => {
    const egg: Food = {
      id: 'egg',
      name: 'Boiled egg',
      source: 'custom',
      basis: { servingLabel: '1 egg', servingG: 50 },
      kcal: 78,
      proteinG: 6,
    };
    const i = input();
    const withFood: BrainInput = {
      ...i,
      coach: {
        ...i.coach,
        fuel: {
          ...(i.coach.fuel ?? { totals: { kcal: 0, proteinG: 0 }, targets: null }),
          favorites: [{ id: 'f1', ref: { foodId: 'egg' }, amount: { servings: 2 }, createdAt: 1 }],
          foods: [egg],
          recipes: [],
          thaiDishes: [],
        },
      },
    };
    const r = readToolResults(withFood);
    expect(r.foodIdeas).toMatch(/g protein and \d+ kcal left today/);
    expect(r.foodIdeas).toMatch(/Boiled egg/);
    expect(r.foodIdeas).toMatch(/156 kcal, 12 g protein/);
  });

  it('foodIdeas without Fuel gives the rule line', () => {
    const i = input();
    const r = readToolResults({ ...i, coach: { ...i.coach, m7Available: false } });
    expect(r.foodIdeas).toBe('Food tips come with Fuel.');
  });

  it(`every result is at most ${READ_RESULT_MAX_CHARS} characters`, () => {
    for (const [k, v] of Object.entries(readToolResults(input())))
      expect(v.length, k).toBeLessThanOrEqual(READ_RESULT_MAX_CHARS);
  });

  it('never contains Health, body, check-in, note or dev-log data', () => {
    const base = input();
    const seeded = {
      ...base,
      coach: {
        ...base.coach,
        sessions: base.coach.sessions.map((s) => ({ ...s, note: 'ZZ-SESSION-NOTE' })),
      },
      lighterCard: {
        date: scenario.today,
        signals: ['sleepShort'],
        reasons: ['Sleep was about 1 h 47 min shorter than usual.'],
        offer: 'lighter',
      },
      healthDays: [
        {
          date: scenario.today,
          sleepMin: 401.7,
          restingHr: 57.3,
          bodyFatPct: 17.37,
          leanMassKg: 61.83,
        },
      ],
      weeklyLoad: 4321,
      cardioMinutes: 187.5,
      measurements: [{ date: scenario.today, site: 'waist', cm: 81.77 }],
      weighIns: [{ date: scenario.today, kg: 73.41 }],
      progressPhotos: [{ id: 'ZZ-PHOTO' }],
      checkIns: [{ weekStart: '2026-11-08', energy: 4, sleep: 3, soreness: 2, at: 1 }],
      notes: ['ZZ-FREE-NOTE'],
      devlog: ['ZZ-DEVLOG'],
    } as BrainInput;
    const all = Object.values(readToolResults(seeded)).join('\n');
    for (const bad of [
      '401.7',
      '57.3',
      '17.37',
      '61.83',
      '4321',
      '187.5',
      '81.77',
      '73.41',
      'ZZ-',
      'Sleep',
      'rated energy',
      'waist',
    ])
      expect(all, bad).not.toContain(bad);
  });
});

describe('factsMatch', () => {
  const item = { id: 'x', text: 'q', source: 'weekSummary', facts: ['2', '5', '80%'] };

  it('needs every fact, as whole numbers', () => {
    expect(factsMatch('You did 2 of 5 sessions, 80% of sets.', item)).toEqual({
      ok: true,
      missing: [],
    });
    expect(factsMatch('You did 2 of 5 sessions.', item)).toEqual({ ok: false, missing: ['80%'] });
    expect(factsMatch('You did 12 of 25 sessions, 80% of sets.', item)).toEqual({
      ok: false,
      missing: ['2', '5'],
    });
  });

  it('ignores case and thousands separators for numbers; 22.5 is not 2 or 5', () => {
    expect(factsMatch('BENCH 22.5 kg', { ...item, facts: ['bench', '22.5'] }).ok).toBe(true);
    expect(factsMatch('Bench 22.5 kg', { ...item, facts: ['2'] }).ok).toBe(false);
    expect(factsMatch('1,234 kcal', { ...item, facts: ['1234'] }).ok).toBe(true);
  });
});
