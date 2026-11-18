import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../../testkit/trainerCatalog';
import programJson from '../../../data/program.json';
import { seedPlan } from '../plan';
import { brainInstructions } from './instructions';
import { toolContract } from '../tools';
import { BUDGET, CONTEXT_BUDGET_CHARS, serializeContext, type BrainInput } from './context';
import type { CoachContext } from '../coach';
import type { StallSession } from '../actions/stall';
import type {
  ChatMessage,
  Goal,
  NutritionTargets,
  Program,
  ReadinessCard,
  SetLog,
  TrainerState,
} from '../../types';

// Made-up data only (the repo is public).
const CATALOG = trainerCatalog();
const program = programJson as Program;
const TODAY = '2026-11-11'; // Wednesday
const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
const state = (): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 3, schedule: { ...s.schedule, restWeekdays: [0] } };
};

const TARGETS: NutritionTargets = {
  kcal: { value: 2500, estimate: true },
  proteinG: { value: 130, estimate: true },
  carbsG: { value: 300, estimate: true },
  fatG: { value: 70, estimate: true },
};

/** Four weeks, six sessions a week, every planned exercise, 4 working sets + a warm-up each. */
function heavyHistory(): { sessions: StallSession[]; sets: SetLog[] } {
  const sessions: StallSession[] = [];
  const sets: SetLog[] = [];
  const rotation = program.days;
  let n = 0;
  for (let back = 28; back >= 1; back--) {
    const d = new Date(2026, 10, 11 - back, 18);
    if (d.getDay() === 0) continue;
    const day = rotation[n % rotation.length];
    if (!day) continue;
    const sessionId = `h${n++}`;
    sessions.push({
      sessionId,
      dayId: day.id,
      startedAt: d.getTime(),
      endedAt: d.getTime() + 3.6e6,
    });
    for (const p of day.exercises) {
      for (let k = 0; k < 5; k++)
        sets.push({
          sessionId,
          exerciseId: p.exerciseId,
          setIndex: k,
          reps: 8 + (k % 3),
          weightKg: k === 0 ? 5 : 12.5 + (n % 4) * 2.5,
          restTakenSec: 90,
          startedAt: d.getTime() + k * 1e5,
          endedAt: d.getTime() + k * 1e5 + 3e4,
          ...(k === 0 ? { warmup: true as const } : {}),
        });
    }
  }
  return { sessions, sets };
}

function coach(over: Partial<CoachContext> = {}): CoachContext {
  const h = heavyHistory();
  return {
    phase: 'today',
    state: state(),
    sessions: h.sessions,
    sets: h.sets,
    today: TODAY,
    unit: 'kg',
    lastWeightKg: { Dumbbell_Bench_Press: 22.5 },
    logged: [],
    catalog: CATALOG,
    m7Available: true,
    fuel: {
      totals: { kcal: 1234, proteinG: 87, carbsG: 150, fatG: 40 },
      targets: TARGETS,
      favorites: [],
      foods: [],
      recipes: [],
      thaiDishes: [],
    },
    ...over,
  };
}

const turn = (i: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  createdAt: at(11, 11, 8) + i,
  role: i % 2 === 0 ? 'user' : 'coach',
  text: `${i % 2 === 0 ? 'Question' : 'Answer'} number ${i} about my training plan and how it went this week, with a fairly long sentence to fill space.`,
  source: i % 2 === 0 ? 'chip' : 'rules',
  phase: 'today',
  ...over,
});

const CARD: ReadinessCard = {
  date: TODAY,
  signals: ['sleepShort', 'restingHrHigh', 'feltLow', 'sore'],
  reasons: [
    'Sleep was about 1 h 47 min shorter than usual.',
    'Resting heart rate is about 9 bpm higher than usual.',
    'You said your energy is low today.',
    'You said your shoulders are sore.',
  ],
  offer: 'lighter',
};

const LIFT_GOAL: Goal = {
  id: 'g1',
  text: 'Dumbbell bench 30 kg for 5',
  target: { kind: 'lift', ref: 'Dumbbell_Bench_Press', value: 30, reps: 5 },
  due: '2027-02-01',
  createdAt: at(10, 20),
};
const WEIGHT_GOAL: Goal = {
  id: 'g2',
  text: 'Reach 69.37 kg',
  target: { kind: 'weight', value: 69.37 },
  due: '2027-02-01',
  createdAt: at(10, 20),
};
const WAIST_GOAL: Goal = {
  id: 'g3',
  text: 'Waist down to 77.13 cm',
  target: { kind: 'measurement', ref: 'waist', value: 77.13 },
  due: '2027-02-01',
  createdAt: at(10, 20),
};

function input(over: Partial<BrainInput> = {}): BrainInput {
  return {
    coach: coach(),
    turns: Array.from({ length: 12 }, (_, i) => turn(i)),
    lighterCard: CARD,
    goalText: 'Get stronger and keep training 5 days a week',
    goals: [LIFT_GOAL, WEIGHT_GOAL, WAIST_GOAL],
    ...over,
  };
}

/** The reply cap: GymBrainCore `SystemBrainModel.maximumResponseTokens` (350 since 1.15.0; replies
 * are ≤ 4 short sentences, `say` ≤ 12 words). Lowered from 600 to leave headroom for Apple's real
 * tokenizer. Must equal BUDGET.replyTokens. */
const REPLY_TOKENS = BUDGET.replyTokens;

describe('budget', () => {
  it('fits instructions + all tool schemas + context + a message + tool outputs + a 350-token reply into 4,096 tokens', () => {
    const toolChars = JSON.stringify(
      toolContract().tools.map(({ name, description, parameters }) => ({
        name,
        description,
        parameters,
      })),
    ).length;
    // The longest variant (since Checkpoint J the calm partner line is the longer one).
    const instr = Math.max(
      ...(['today', 'preview', 'workout'] as const).flatMap((phase) =>
        (['calm', 'drill'] as const).map((voice) => brainInstructions({ phase, voice }).length),
      ),
    );
    const chars =
      instr + toolChars + CONTEXT_BUDGET_CHARS + BUDGET.messageChars + BUDGET.toolOutputChars;
    const tokens = chars / BUDGET.charsPerToken + REPLY_TOKENS;
    expect(tokens).toBeLessThanOrEqual(BUDGET.windowTokens);
    expect(REPLY_TOKENS).toBe(350);
    expect(CONTEXT_BUDGET_CHARS).toBeLessThanOrEqual(6000);
  });

  it('a heavy made-up 4-week history stays within the budget and keeps the essentials', () => {
    const { text } = serializeContext(input(), { brain: 'apple' });
    expect(text.length).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS);
    expect(text).toContain('Today 2026-11-11');
    expect(text).toMatch(/Today's plan: /);
    expect(text).toMatch(/This week: /);
    expect(text).toMatch(/Fuel today: 1234 of 2500 kcal, 87 of 130 g protein/);
    expect(text).toMatch(/Top sets/);
  });

  it('keeps the newest turns (at most 8) when trimming', () => {
    const { text } = serializeContext(input(), { brain: 'apple' });
    expect(text).toContain('number 11');
    expect(text).not.toContain('number 3 ');
  });
});

describe('content', () => {
  const small = () =>
    input({
      coach: coach({
        sessions: [
          { sessionId: 's', dayId: 'legs-b', startedAt: at(11, 10), endedAt: at(11, 10, 19) },
        ],
        sets: [],
      }),
      turns: [turn(0), turn(1)],
    });

  it("lists today's plan with exercise ids, the next 7 days and the units", () => {
    const { text } = serializeContext(small(), { brain: 'apple' });
    expect(text).toMatch(
      /Today's plan: Push A: Dumbbell_Bench_Press 4x8 @22\.5; Incline_Dumbbell_Press 4x6-7 @15/,
    );
    expect(text).toMatch(/Next 7 days: Thu 12 Pull A; .*Sun 15 rest/);
    expect(text).toMatch(/Weights in kg/);
  });

  it('lists active overrides, the focus block and the go-easy list', () => {
    const base = small();
    const s = base.coach.state;
    const withAll: BrainInput = {
      ...base,
      coach: {
        ...base.coach,
        state: {
          ...s,
          easyOn: ['shoulders'],
          overrides: [{ date: '2026-11-13', rest: true }],
          blocks: [
            {
              id: 'b1',
              group: 'chest',
              startDate: '2026-11-09',
              weeks: 4,
              weekdays: [1, 3, 5],
              days: [],
              targetSetsPerWeek: 20,
              baseSetsPerWeek: 14,
            },
          ],
        },
      },
    };
    const { text } = serializeContext(withAll, { brain: 'apple' });
    expect(text).toMatch(/Changes: Fri 13 rest/);
    expect(text).toMatch(/Focus block: chest, 4 weeks from 2026-11-09/);
    expect(text).toMatch(/Go easy on: shoulders/);
  });

  it('top sets exclude warm-ups', () => {
    const { text } = serializeContext(input(), { brain: 'apple' });
    expect(text).not.toMatch(/ 5x8/);
  });

  it('includes goal text and lift-goal progress only', () => {
    const { text } = serializeContext(small(), { brain: 'apple' });
    expect(text).toContain('Get stronger and keep training 5 days a week');
    expect(text).toContain('Dumbbell bench 30 kg for 5');
    expect(text).not.toContain('69.37');
    expect(text).not.toContain('77.13');
  });
});

describe('Lighter today? reasons (M12-q1, coach.appleCardReasons)', () => {
  for (const appleCardReasons of [true, undefined]) {
    it(`present with appleCardReasons ${String(appleCardReasons)}, never with numbers`, () => {
      const r = serializeContext(input(), { brain: 'apple', appleCardReasons });
      expect(r.usedHealth).toBe(true);
      expect(r.text).toContain('Sleep was shorter than usual.');
      expect(r.text).toContain('Resting heart rate is higher than usual.');
      expect(r.text).toContain('You said your energy is low today.');
      expect(r.text).toContain('You said your shoulders are sore.');
      expect(r.text).not.toContain('47 min');
      expect(r.text).not.toContain('bpm');
    });
  }

  it('absent with appleCardReasons false (and usedHealth false)', () => {
    const r = serializeContext(input(), { brain: 'apple', appleCardReasons: false });
    expect(r.usedHealth).toBe(false);
    expect(r.text).not.toMatch(/Sleep was|heart rate|energy is low|are sore/);
  });

  it('absent for Claude, always', () => {
    const r = serializeContext(input(), { brain: 'claude', appleCardReasons: true });
    expect(r.usedHealth).toBe(false);
    expect(r.text).not.toMatch(/Sleep was|heart rate/);
  });

  it('drops earlier turns that used Health when reasons are off', () => {
    const turns = [
      turn(0),
      turn(1, { text: 'Sleep was shorter than usual, so lighter today?', usedHealth: true }),
    ];
    const off = serializeContext(input({ turns }), { brain: 'apple', appleCardReasons: false });
    expect(off.text).not.toContain('Sleep was shorter');
    const on = serializeContext(input({ turns }), { brain: 'apple' });
    expect(on.text).toContain('Sleep was shorter');
  });

  it('a kept usedHealth turn never carries numbers (number sentences are cut)', () => {
    const turns = [
      turn(0, { text: 'Why lighter today?' }),
      turn(1, {
        text: 'Sleep was about 1 h 47 min shorter than usual. Resting heart rate is nine bpm higher. HRV is 23% lower. Want a lighter day?',
        usedHealth: true,
      }),
      turn(2, { text: 'Bench 22.5 kg felt good.' }),
    ];
    const { text } = serializeContext(input({ turns }), { brain: 'apple' });
    for (const bad of ['47', '1 h', 'nine', 'bpm', '23%', 'HRV'])
      expect(text, bad).not.toContain(bad);
    expect(text).toContain('Coach: Want a lighter day?');
    // Turns without usedHealth keep their numbers (lift numbers are fine).
    expect(text).toContain('Bench 22.5 kg felt good.');
  });

  it('no card → no reasons and usedHealth false', () => {
    const r = serializeContext(input({ lighterCard: null }), { brain: 'apple' });
    expect(r.usedHealth).toBe(false);
  });
});

describe('never contains', () => {
  it('Health numbers, weekly load, cardio, body comp, measurements, weigh-ins, photos, check-ins, notes, dev log', () => {
    const base = input();
    const sessionsWithNotes = base.coach.sessions.map((s) => ({ ...s, note: 'ZZ-SESSION-NOTE' }));
    const setsWithNotes = (base.coach.sets ?? []).map((s) => ({ ...s, note: 'ZZ-SET-NOTE' }));
    const seeded = {
      ...base,
      coach: { ...base.coach, sessions: sessionsWithNotes, sets: setsWithNotes },
      turns: [
        turn(0),
        turn(1, {
          text: 'Check-in saved.',
          card: { kind: 'checkIn', weekStart: '2026-11-08', status: 'done' },
        }),
        turn(3, {
          text: 'Last week: 5 of 6 sessions. You rated energy 4, sleep 3, soreness 2. Nice work.',
          card: { kind: 'recap', period: 'week', from: '2026-11-02', to: '2026-11-08' },
          note: 'ZZ-MESSAGE-NOTE',
        }),
      ],
      // Everything below must be ignored even when a caller passes it along.
      healthDays: [
        {
          date: TODAY,
          sleepMin: 401.7,
          restingHr: 57.3,
          hrvMs: 61.9,
          activeKcal: 812.4,
          bodyFatPct: 17.37,
          leanMassKg: 61.83,
        },
      ],
      weeklyLoad: { minutes: 913, score: 4321 },
      cardioMinutes: 187.5,
      measurements: [{ date: TODAY, site: 'waist', cm: 81.77 }],
      weighIns: [{ date: TODAY, kg: 73.41 }],
      progressPhotos: [{ id: 'ZZ-PHOTO', date: TODAY, createdAt: 1, blob: 'ZZ-BLOB' }],
      checkIns: [{ weekStart: '2026-11-08', energy: 4, sleep: 3, soreness: 2, at: 1 }],
      notes: ['ZZ-FREE-NOTE'],
      devlog: [{ kind: 'ZZ-DEVLOG', text: 'ZZ-DEVLOG-TEXT' }],
    } as BrainInput;
    const { text } = serializeContext(seeded, { brain: 'apple', appleCardReasons: true });
    for (const bad of [
      '401.7',
      '57.3',
      '61.9',
      '812.4',
      '17.37',
      '61.83',
      '913',
      '4321',
      '187.5',
      '81.77',
      '73.41',
      '69.37',
      '77.13',
      'ZZ-',
      'rated energy',
      'sleep 3',
      'soreness 2',
      'bpm',
      'body fat',
      'waist',
    ])
      expect(text, bad).not.toContain(bad);
    expect(text).not.toContain('Check-in saved.');
    expect(text).toContain('Last week: 5 of 6 sessions.');
  });
});
