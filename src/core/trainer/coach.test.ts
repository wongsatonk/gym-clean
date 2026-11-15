import { describe, expect, it } from 'vitest';
import { trainerCatalog } from '../testkit/trainerCatalog';
import equipmentJson from '../../data/equipment.json';
import programJson from '../../data/program.json';
import evals from './evals/requests.json';
import { wordCount } from '../advice';
import { applyProposal, undoLast, type TrainerChange } from './changes';
import { effectiveDay, seedPlan } from './plan';
import type { StallSession } from './actions/stall';
import type { TrainerCatalog } from './swapCandidates';
import {
  AREA_CHIP_IDS,
  MID_SESSION_REPLY,
  PROPOSAL_REPLY,
  QUICK_CHIPS,
  handle,
  type CoachContext,
  type CoachInput,
  type CoachResponse,
} from './coach';
import {
  checkCopy,
  FOOD_LATER,
  HELP_TEXT,
  RED_FLAG_LINE,
  REFERRAL_LINE,
  SAY_MAX_WORDS,
  SPOKEN_MAX_WORDS,
} from './replies';
import source from './coach.ts?raw';
import type { Food, NutritionTargets, Program, Recipe, SetLog, TrainerState } from '../types';
import type { CoachFuel } from './coach';
import { FOOD_DONE, FOOD_NONE, FOOD_SETUP } from './replies';

// Made-up history; the program is the repo's default program (public, no personal numbers).
// The catalog with his gym's default kit (M10e), wired like src/ui/app.ts.
const CATALOG: TrainerCatalog = trainerCatalog();
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);

// 2026-11-11 is a Wednesday. The default has no rest weekdays (M10-q1); these tests set Sunday
// (2026-11-15) explicitly so the rest-day paths stay covered.
const TODAY = '2026-11-11';
const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
const baseState = (): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 5, schedule: { ...s.schedule, restWeekdays: [0] } };
};

type Hist = { sessions: StallSession[]; sets: SetLog[] };
let sid = 0;
function addSession(
  h: Hist,
  dayId: string,
  when: number,
  logs: { exerciseId: string; sets: [number, number][] }[] = [],
  finished = true,
): Hist {
  const sessionId = `s${sid++}`;
  const session: StallSession = {
    sessionId,
    dayId,
    startedAt: when,
    ...(finished ? { endedAt: when + 3_600_000 } : {}),
  };
  const sets = logs.flatMap(({ exerciseId, sets: list }) =>
    list.map(([weightKg, reps], i): SetLog => ({
      sessionId,
      exerciseId,
      setIndex: i,
      reps,
      weightKg,
      restTakenSec: 90,
      startedAt: when + i * 120_000,
      endedAt: when + i * 120_000 + 40_000,
    })),
  );
  return { sessions: [...h.sessions, session], sets: [...h.sets, ...sets] };
}

/** Today runs `dayId`: the rotation day before it finished yesterday. */
function ctxFor(dayId: string, over: Partial<CoachContext> = {}, hist?: Hist): CoachContext {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  let h: Hist = hist ?? { sessions: [], sets: [] };
  h = addSession(h, prev, at(11, 10));
  return {
    phase: 'today',
    state: baseState(),
    sessions: h.sessions,
    sets: h.sets,
    today: TODAY,
    unit: 'kg',
    lastWeightKg: {},
    logged: [],
    catalog: CATALOG,
    m7Available: false,
    ...over,
  };
}
/** Mid-workout: today's `dayId` session is running with `logged` exercises done. */
function workoutCtx(dayId: string, logged: string[]): CoachContext {
  const c = ctxFor(dayId);
  const h = addSession(
    { sessions: [...c.sessions], sets: [...(c.sets ?? [])] },
    dayId,
    at(11, 11),
    [],
    false,
  );
  return { ...c, phase: 'workout', sessions: h.sessions, logged };
}

// M7 Fuel data for the food path (made-up numbers).
const TARGETS: NutritionTargets = {
  kcal: { value: 2600, estimate: true },
  proteinG: { value: 140, estimate: true },
  carbsG: { value: 320, estimate: true },
  fatG: { value: 75, estimate: true },
};
const per100 = (id: string, name: string, kcal: number, proteinG: number): Food => ({
  id,
  name,
  source: 'custom',
  basis: { per100g: true },
  kcal,
  proteinG,
});
const plate = (id: string, name: string, kcal: number, proteinG: number): Food => ({
  id,
  name,
  source: 'thai-estimate',
  basis: { servingLabel: '1 plate' },
  portions: [
    { label: 'Small', factor: 0.75 },
    { label: 'Regular', factor: 1 },
    { label: 'Large', factor: 1.4 },
  ],
  kcal,
  proteinG,
  note: 'Made-up test values',
});
const SHAKE: Food = {
  id: 'seed-shake',
  name: 'Protein shake',
  source: 'custom',
  basis: { servingLabel: '1 scoop' },
  kcal: 120,
  proteinG: 24,
};
const DISHES = [
  plate('thai-pad-thai', 'Pad thai', 600, 20),
  plate('thai-kapao', 'Pad kra pao with rice and egg', 700, 32),
];
const CHICKEN_RICE: Recipe = {
  id: 'r1',
  name: 'Chicken and rice',
  ingredients: [
    { foodId: 'f-chicken', grams: 400 },
    { foodId: 'f-rice', grams: 600 },
  ],
  servings: 4,
  updatedAt: 1,
};
const FUEL: CoachFuel = {
  totals: { kcal: 1400, proteinG: 80 },
  targets: TARGETS,
  favorites: [{ id: 'fav', ref: { foodId: 'seed-shake' }, amount: { servings: 1 }, createdAt: 1 }],
  foods: [
    SHAKE,
    per100('f-chicken', 'Chicken breast', 165, 31),
    per100('f-rice', 'Rice', 130, 2.7),
    ...DISHES,
  ],
  recipes: [CHICKEN_RICE],
  thaiDishes: DISHES,
};

const ids = (r: CoachResponse) => r.chips.map((c) => c.id);
/** A gym with every equipment item (no missing-kit chips). */
const FULL_KIT = trainerCatalog(equipmentJson.items.map((i) => i.id));
const text = (t: string): CoachInput => ({ text: t });

function allCopy(r: CoachResponse): string[] {
  const p = r.proposal;
  return [
    r.reply,
    r.say ?? '',
    ...r.chips.map((c) => c.label),
    ...(r.foods ?? []).flatMap((f) => [f.label, f.why]),
    ...(p ? [p.title, p.why, p.say ?? '', ...p.lines.flatMap((l) => [l.before, l.after])] : []),
  ].filter((s) => s !== '');
}
function expectClean(r: CoachResponse, label: string) {
  for (const t of allCopy(r))
    expect(checkCopy(t), `${label}: ${t}`).toEqual({ ok: true, hits: [] });
  if (r.say) expect(wordCount(r.say), r.say).toBeLessThanOrEqual(SPOKEN_MAX_WORDS);
  if (r.proposal) {
    expect(r.proposal.say).toBeDefined();
    expect(wordCount(r.proposal.say ?? '')).toBeLessThanOrEqual(SAY_MAX_WORDS);
  }
}

describe('help', () => {
  it('unknown text → "I can help with:" and the quick chips, never a guess', () => {
    const r = handle(text('tell me a joke'), ctxFor('pull-a'));
    expect(r.reply).toBe(HELP_TEXT);
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(QUICK_CHIPS.map((c) => c.id));
    expect(ids(r)).toEqual(['notToday', 'easyOn', 'lighter', 'swap', 'adjustPlan', 'food']);
  });

  it('mid-workout help offers only the chips that apply', () => {
    expect(ids(handle(text('hello'), workoutCtx('pull-a', [])))).toEqual([
      'easyOn',
      'lighter',
      'swap',
    ]);
  });
});

describe('copy (SPEC M10 Safety)', () => {
  it('every reply to every eval item, chip and area passes checkCopy, in both phases', () => {
    const inputs: CoachInput[] = [
      ...evals.items.map((i) => text(i.text)),
      ...QUICK_CHIPS.map((c) => ({ chip: c.id })),
      ...AREA_CHIP_IDS.map((a) => ({ chip: a })),
    ];
    for (const dayId of ROTATION) {
      for (const c of [
        ctxFor(dayId),
        ctxFor(dayId, { m7Available: true }),
        ctxFor(dayId, { m7Available: true, fuel: FUEL }),
        workoutCtx(dayId, []),
      ]) {
        for (const input of inputs) {
          const r = handle(input, c);
          expectClean(r, `${dayId}/${c.phase}/${JSON.stringify(input)}`);
        }
      }
    }
  });
});

describe('discomfort', () => {
  it('with an area → the referral line, then an avoid-area proposal', () => {
    const r = handle(text('my arms hurt'), ctxFor('pull-a'));
    expect(r.safety).toBe('discomfort');
    expect(r.reply.startsWith(REFERRAL_LINE)).toBe(true);
    expect(r.proposal?.action).toBe('avoidArea');
    expect(r.proposal?.title).toContain('arms');
  });

  it('without an area → the referral line and the area chips', () => {
    const r = handle(text("I'm sore today"), ctxFor('pull-a'));
    expect(r.reply.startsWith(REFERRAL_LINE)).toBe(true);
    expect(r.reply).toContain('Which area');
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['arms', 'shoulders', 'chest', 'back', 'legs', 'core']);
  });

  it('an area chip proposes going easy on it', () => {
    const r = handle({ chip: 'arms' }, ctxFor('pull-a'));
    expect(r.proposal?.action).toBe('avoidArea');
    expect(r.reply).not.toContain(REFERRAL_LINE);
  });

  it('a whole day in the area → referral line and Not today, no training proposal', () => {
    const r = handle(text('my legs hurt'), ctxFor('legs-a'));
    expect(r.reply.startsWith(REFERRAL_LINE)).toBe(true);
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toContain('notToday');
  });

  it('every discomfort eval item gets the referral line', () => {
    for (const item of evals.items.filter((i) => i.safety === 'discomfort')) {
      const r = handle(text(item.text), ctxFor('push-a'));
      expect(r.reply, item.text).toContain(REFERRAL_LINE);
    }
  });
});

describe('red flag', () => {
  it('only the fixed line and the Not today chip; no proposal', () => {
    const r = handle(text('I feel dizzy, swap the curls'), ctxFor('pull-a'));
    expect(r).toMatchObject({ reply: RED_FLAG_LINE, safety: 'redFlag' });
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['notToday']);
  });

  it('mid-workout: End workout only, and the line is spoken', () => {
    const r = handle(text('chest pain'), workoutCtx('pull-a', []));
    expect(r.reply).toBe(RED_FLAG_LINE);
    expect(ids(r)).toEqual(['endWorkout']);
    expect(r.say).toBe(RED_FLAG_LINE);
  });

  it('every red-flag eval item: no proposal, only End workout / Not today', () => {
    for (const item of evals.items.filter((i) => i.safety === 'redFlag')) {
      for (const c of [ctxFor('push-a'), workoutCtx('push-a', [])]) {
        const r = handle(text(item.text), c);
        expect(r.proposal, item.text).toBeUndefined();
        expect(r.reply).toBe(RED_FLAG_LINE);
        for (const id of ids(r)) expect(['endWorkout', 'notToday']).toContain(id);
      }
    }
  });
});

describe('mid-session', () => {
  const logged = ['One-Arm_Dumbbell_Row', 'Wide-Grip_Lat_Pulldown'];

  it('postpone, deload, plan changes and food are not offered', () => {
    const c = workoutCtx('pull-a', logged);
    for (const input of [
      text('not today'),
      text('deload week'),
      text('my curls are stalled'),
      { chip: 'notToday' as const },
      { chip: 'adjustPlan' as const },
      { chip: 'food' as const },
    ]) {
      const r = handle(input, c);
      expect(r.proposal, JSON.stringify(input)).toBeUndefined();
      expect(r.reply).toBe(MID_SESSION_REPLY);
      expect(ids(r)).toEqual(['easyOn', 'lighter', 'swap']);
    }
  });

  it('the swap chip lists only exercises without logged sets', () => {
    const r = handle({ chip: 'swap' }, workoutCtx('pull-a', logged));
    expect(r.chips.every((c) => c.id === 'pickExercise')).toBe(true);
    expect(r.chips.map((c) => c.args?.exerciseId)).toEqual([
      'Reverse_Flyes',
      'Dumbbell_Bicep_Curl',
      'Hammer_Curls',
    ]);
  });

  it('a swap is today only, with alternatives and a Remove chip', () => {
    const c = workoutCtx('pull-a', logged);
    const r = handle(text('swap the bicep curls from now on'), c);
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'today' });
    expect(ids(r)).toContain('remove');
    for (const chip of r.chips.filter((x) => x.id === 'swapTo'))
      expect(chip.args?.scope).toBe('today');
  });

  it('a logged exercise is never swapped or removed', () => {
    const c = workoutCtx('pull-a', logged);
    expect(handle(text('swap the lat pulldown'), c).proposal).toBeUndefined();
    const r = handle({ chip: 'remove', args: { exerciseId: 'One-Arm_Dumbbell_Row' } }, c);
    expect(r.proposal).toBeUndefined();
    expect(r.reply).toContain('logged');
  });

  it('Remove drops one unstarted exercise from today and keeps logged rows as they were', () => {
    const c = workoutCtx('pull-a', logged);
    const r = handle({ chip: 'remove', args: { exerciseId: 'Hammer_Curls' } }, c);
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'today' });
    const p = r.proposal;
    if (!p) throw new Error('no proposal');
    expect(p.lines).toEqual([
      { before: expect.stringContaining('Hammer Curls') as string, after: 'Removed today' },
    ]);
    const before = effectiveDay(c.state, c.sessions, TODAY).day?.exercises ?? [];
    const after = effectiveDay(p.next, c.sessions, TODAY).day?.exercises ?? [];
    expect(after.map((x) => x.exerciseId)).toEqual(
      before.map((x) => x.exerciseId).filter((x) => x !== 'Hammer_Curls'),
    );
  });

  it('lighter and go-easy proposals leave logged rows untouched', () => {
    const c = workoutCtx('pull-a', logged);
    const before = effectiveDay(c.state, c.sessions, TODAY).day?.exercises ?? [];
    for (const input of [{ chip: 'lighter' as const }, { chip: 'arms' as const }]) {
      const p = handle(input, c).proposal;
      expect(p, JSON.stringify(input)).toBeDefined();
      const after = effectiveDay(p?.next ?? c.state, c.sessions, TODAY).day?.exercises ?? [];
      for (const id of logged)
        expect(after.find((x) => x.exerciseId === id)).toEqual(
          before.find((x) => x.exerciseId === id),
        );
    }
  });
});

describe('food', () => {
  it('before M7: "Food tips come with Fuel."', () => {
    expect(handle({ chip: 'food' }, ctxFor('push-a')).reply).toBe(FOOD_LATER);
    const r = handle(text('what should I eat after training?'), ctxFor('push-a'));
    expect(r.reply).toBe(FOOD_LATER);
    expect(r.proposal).toBeUndefined();
    expect(r.foods).toBeUndefined();
    // M7 data alone doesn't switch it on: m7Available decides.
    expect(handle({ chip: 'food' }, ctxFor('push-a', { fuel: FUEL })).reply).toBe(FOOD_LATER);
  });

  it('M7 on: the chip and the text intent return up to 3 suggestions, protein first', () => {
    for (const input of [{ chip: 'food' as const }, text('what should I eat after training?')]) {
      const r = handle(input, ctxFor('push-a', { m7Available: true, fuel: FUEL }));
      expect(r.intent).toBe('food');
      expect(r.reply).toBe('60 g protein and 1200 kcal left today. Some ideas:');
      expect(r.foods?.map((f) => f.label)).toEqual([
        'Chicken and rice',
        'Pad kra pao with rice and egg',
        'Protein shake',
      ]);
      expect(r.proposal).toBeUndefined();
      expect(ids(r)).toEqual(QUICK_CHIPS.map((c) => c.id));
    }
  });

  it('nothing left → "You\'ve hit today\'s targets."', () => {
    const fuel: CoachFuel = { ...FUEL, totals: { kcal: 2700, proteinG: 150 } };
    const r = handle({ chip: 'food' }, ctxFor('push-a', { m7Available: true, fuel }));
    expect(r.reply).toBe(FOOD_DONE);
    expect(r.foods).toBeUndefined();
  });

  it('no targets or no Fuel data → the help reply pointing to Fuel setup', () => {
    const noTargets: CoachFuel = { ...FUEL, targets: null };
    for (const c of [
      ctxFor('push-a', { m7Available: true }),
      ctxFor('push-a', { m7Available: true, fuel: noTargets }),
    ]) {
      const r = handle({ chip: 'food' }, c);
      expect(r.reply).toBe(FOOD_SETUP);
      expect(r.foods).toBeUndefined();
    }
  });

  it('nothing saved fits → a pointer to a quick estimate', () => {
    const fuel: CoachFuel = { ...FUEL, favorites: [], recipes: [], thaiDishes: [] };
    const r = handle({ chip: 'food' }, ctxFor('push-a', { m7Available: true, fuel }));
    expect(r.reply).toBe(FOOD_NONE);
    expect(r.foods).toBeUndefined();
  });

  it('mid-workout it is still not offered', () => {
    const c = { ...workoutCtx('push-a', []), m7Available: true, fuel: FUEL };
    const r = handle({ chip: 'food' }, c);
    expect(r.reply).toBe(MID_SESSION_REPLY);
    expect(r.foods).toBeUndefined();
    expect(handle(text('what should I eat'), c).foods).toBeUndefined();
  });
});

describe('postpone', () => {
  it('Not today → a postpone proposal (use the rest day) with a Push the week chip', () => {
    const c = ctxFor('pull-a');
    const r = handle({ chip: 'notToday' }, c);
    expect(r.proposal?.action).toBe('postpone');
    const push = r.chips.find((x) => x.id === 'postponeMode');
    expect(push?.args?.mode).toBe('pushWeek');
    const r2 = handle({ chip: 'postponeMode', args: { mode: 'pushWeek' } }, c);
    expect(r2.proposal?.action).toBe('postpone');
    expect(r2.proposal?.why).not.toEqual(r.proposal?.why);
    expect(r2.chips.find((x) => x.id === 'postponeMode')?.args?.mode).toBe('useRestDay');
  });

  it('the seeded default (no rest weekdays): Not today slides the week and says so', () => {
    const s = seedPlan(program);
    const c = { ...ctxFor('pull-a'), state: { ...s, version: 5 } };
    expect(c.state.schedule.restWeekdays).toEqual([]);
    const r = handle({ chip: 'notToday' }, c);
    expect(r.proposal?.action).toBe('postpone');
    expect(r.proposal?.why).toMatch(/no rest day/i);
    // Sunday is a training day too, so it is never "already a rest day".
    const sun = handle({ chip: 'notToday' }, { ...c, today: '2026-11-15' });
    expect(sun.proposal?.action).toBe('postpone');
  });

  it('"skip leg day" postpones', () => {
    expect(handle(text('skip leg day'), ctxFor('legs-a')).proposal?.action).toBe('postpone');
  });

  it('"move my session to Sunday" trains on the rest day', () => {
    const r = handle(text('move my session to sunday'), ctxFor('pull-a'));
    expect(r.proposal?.title).toBe('Not today: train Sunday instead');
  });

  it('another day than today → only today can move', () => {
    const r = handle(text("postpone tomorrow's workout"), ctxFor('pull-a'));
    expect(r.proposal).toBeUndefined();
    expect(r.reply).toContain('today');
  });

  it('a refusal (rest day) comes back as a reply with the chips', () => {
    // Sunday is a rest day.
    const c = { ...ctxFor('pull-a'), today: '2026-11-15' };
    const r = handle({ chip: 'notToday' }, c);
    expect(r.proposal).toBeUndefined();
    expect(r.reply).toBe('Today is already a rest day.');
    expect(r.chips.length).toBeGreaterThan(0);
  });
});

describe('swap', () => {
  it('the swap chip asks which exercise', () => {
    const r = handle({ chip: 'swap' }, ctxFor('pull-a'));
    expect(r.reply).toBe('Which exercise?');
    expect(r.chips.map((c) => c.args?.exerciseId)).toEqual(
      program.days[1]?.exercises.map((e) => e.exerciseId),
    );
  });

  it('a named exercise → the top swap as the proposal and the others as chips', () => {
    const c = ctxFor('pull-a');
    const r = handle(text('swap the hammer curls'), c);
    expect(r.proposal?.action).toBe('swap');
    const alt = r.chips.find((x) => x.id === 'swapTo');
    expect(alt).toBeDefined();
    const r2 = handle({ chip: 'swapTo', args: alt?.args ?? {} }, c);
    expect(r2.proposal?.action).toBe('swap');
    expect(r2.proposal?.lines).not.toEqual(r.proposal?.lines);
  });

  it('an exercise not in today falls back to the plan', () => {
    const r = handle(text('swap goblet squat'), ctxFor('pull-a'));
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'plan' });
  });
});

describe('lighter and deload', () => {
  it('Lighter today and deload week propose their actions', () => {
    expect(handle({ chip: 'lighter' }, ctxFor('push-a')).proposal?.action).toBe('lighter');
    expect(handle(text('can we do a deload week'), ctxFor('push-a')).proposal?.action).toBe(
      'deload',
    );
  });
});

describe('adjust my plan / stalls', () => {
  const stalled = (): Hist => {
    let h: Hist = { sessions: [], sets: [] };
    for (let w = 0; w < 3; w++) {
      h = addSession(h, 'pull-a', at(10, 14 + w * 7), [
        {
          exerciseId: 'Dumbbell_Bicep_Curl',
          sets: [
            [10, 10],
            [10, 9],
          ],
        },
      ]);
    }
    return h;
  };

  it('a stalled lift → a stall proposal with the other option as a chip', () => {
    const c = ctxFor('push-a', {}, stalled());
    const r = handle({ chip: 'adjustPlan' }, c);
    expect(r.proposal?.action).toBe('stall');
    expect(r.reply).toContain('same best set for 3 sessions');
    expect(r.chips.some((x) => x.id === 'stallFix' && x.args?.option === 'addSet')).toBe(true);
    const r2 = handle(
      { chip: 'stallFix', args: { exerciseId: 'Dumbbell_Bicep_Curl', option: 'addSet' } },
      c,
    );
    expect(r2.proposal?.title).toContain('One more set');
  });

  it('a newer applied stall change hides the old run (since)', () => {
    const c = ctxFor('push-a', {}, stalled());
    const p = handle({ chip: 'adjustPlan' }, c).proposal;
    if (!p) throw new Error('no proposal');
    const applied = applyProposal(c.state, p, at(11, 10, 20), 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    const changes: TrainerChange[] = [applied.change];
    const r = handle(
      { chip: 'adjustPlan' },
      { ...c, state: applied.state, changes, catalog: FULL_KIT },
    );
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['deload', 'swap']);
    // An undone change doesn't count.
    const undone = [{ ...applied.change, undoneAt: at(11, 10, 21) }];
    expect(handle({ chip: 'adjustPlan' }, { ...c, changes: undone }).proposal?.action).toBe(
      'stall',
    );
  });

  it('no stalls → deload or a swap from now on', () => {
    const r = handle({ chip: 'adjustPlan' }, ctxFor('push-a', { catalog: FULL_KIT }));
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['deload', 'swap']);
    expect(r.chips[1]?.args?.scope).toBe('plan');
  });
});

// M10e: the coach offers a plan swap for kit his gym lacks; nothing changes until Apply.
describe('missing kit (M10e)', () => {
  const LEGS_B = program.days.find((d) => d.id === 'legs-b');
  const GYM_REPLY = "Your gym doesn't have the kit for Leg Press. Here's a swap.";
  const keepChip = {
    id: 'keepExercise',
    label: 'Keep Leg Press',
    args: { exerciseId: 'Leg_Press' },
  };

  it('gymSwap → the plan-scope swap to Smith Machine Squat, the others, Just today and Keep', () => {
    const c = ctxFor('legs-b');
    const r = handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, c);
    expect(r.reply).toBe(GYM_REPLY);
    expect(r.intent).toBe('swap');
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'plan' });
    expect(r.proposal?.lines).toEqual([
      { before: 'Legs B · Leg Press', after: 'Legs B · Smith Machine Squat' },
    ]);
    expect(r.proposal?.why).toBe(
      'No leg press here. This works the same main muscles. Every day with it changes from now on.',
    );
    expect(r.chips).toEqual([
      {
        id: 'swapTo',
        label: 'Try Barbell Squat',
        args: { exerciseId: 'Leg_Press', toId: 'Barbell_Squat', scope: 'plan' },
      },
      {
        id: 'swapTo',
        label: 'Try Split Squat with Dumbbells',
        args: { exerciseId: 'Leg_Press', toId: 'Split_Squat_with_Dumbbells', scope: 'plan' },
      },
      {
        id: 'swapTo',
        label: 'Just today',
        args: { exerciseId: 'Leg_Press', toId: 'Smith_Machine_Squat', scope: 'today' },
      },
      keepChip,
    ]);
    expectClean(r, 'gymSwap');
  });

  it('a candidate chip keeps the missing-kit reply, Just today and Keep', () => {
    const c = ctxFor('legs-b');
    const r = handle(
      {
        chip: 'swapTo',
        args: { exerciseId: 'Leg_Press', toId: 'Barbell_Squat', scope: 'plan' },
      },
      c,
    );
    expect(r.reply).toBe(GYM_REPLY);
    expect(r.proposal?.lines[0]?.after).toBe('Legs B · Barbell Squat');
    expect(r.chips.map((x) => x.args?.toId ?? x.id)).toEqual([
      'Smith_Machine_Squat',
      'Split_Squat_with_Dumbbells',
      'Barbell_Squat',
      'keepExercise',
    ]);
    expect(r.chips[2]).toMatchObject({ label: 'Just today', args: { scope: 'today' } });
    expectClean(r, 'swapTo plan');
  });

  it('Just today → a today swap with a From now on chip', () => {
    const c = ctxFor('legs-b');
    const r = handle(
      {
        chip: 'swapTo',
        args: { exerciseId: 'Leg_Press', toId: 'Smith_Machine_Squat', scope: 'today' },
      },
      c,
    );
    expect(r.reply).toBe(GYM_REPLY);
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'today' });
    expect(r.proposal?.why).toBe(
      'No leg press here. This works the same main muscles. Just for today.',
    );
    expect(r.chips).toContainEqual({
      id: 'swapTo',
      label: 'From now on',
      args: { exerciseId: 'Leg_Press', toId: 'Smith_Machine_Squat', scope: 'plan' },
    });
    expect(r.chips.at(-1)).toEqual(keepChip);
    expectClean(r, 'just today');
  });

  it('on another day (preview of Legs B): the plan swap, no Just today', () => {
    const r = handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, ctxFor('push-a'));
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'plan' });
    expect(r.chips.some((x) => x.label === 'Just today')).toBe(false);
    expect(r.chips.at(-1)).toEqual(keepChip);
  });

  it('Apply then Undo restores Leg Press exactly', () => {
    const c = ctxFor('legs-b');
    const p = handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, c).proposal;
    if (!p) throw new Error('no proposal');
    const applied = applyProposal(c.state, p, at(11, 11, 9), 'chip');
    if (!applied.ok) throw new Error(applied.reason);
    const day = (st: TrainerState) => effectiveDay(st, c.sessions, TODAY).day?.exercises;
    expect(day(applied.state)?.[0]?.exerciseId).toBe('Smith_Machine_Squat');
    const undone = undoLast(applied.state, [applied.change], at(11, 11, 10));
    if (!undone.ok) throw new Error(undone.reason);
    expect(undone.state.plan.days).toEqual(c.state.plan.days);
    expect(undone.state.overrides).toEqual(c.state.overrides);
    expect(day(undone.state)).toEqual(LEGS_B?.exercises);
  });

  it('no candidate → the No good swap reply and Keep', () => {
    const c = ctxFor('legs-b', { catalog: trainerCatalog(['leg-curl']) });
    const r = handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, c);
    expect(r.proposal).toBeUndefined();
    expect(r.reply).toMatch(/^No good swap for Leg Press/);
    expect(r.chips).toEqual([keepChip]);
    expectClean(r, 'no candidate');
  });

  it('works without missing-kit labels (generic why line)', () => {
    const bare: TrainerCatalog = { ...CATALOG };
    delete bare.missingKitLabels;
    const r = handle(
      { chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } },
      ctxFor('legs-b', { catalog: bare }),
    );
    expect(r.proposal?.why).toMatch(/^Your gym doesn't have the kit for it\./);
    expectClean(r, 'no labels');
  });

  it('free text "my gym has no leg press" reaches the same proposal', () => {
    const c = ctxFor('legs-b');
    const chip = handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, c);
    for (const t of ['my gym has no leg press', 'ไม่มีเครื่อง leg press', 'no leg press machine']) {
      const r = handle(text(t), c);
      expect(r.reply, t).toBe(GYM_REPLY);
      expect(r.proposal, t).toEqual(chip.proposal);
      expect(r.chips, t).toEqual(chip.chips);
    }
    // Also from another day.
    expect(handle(text('my gym has no leg press'), ctxFor('pull-a')).reply).toBe(GYM_REPLY);
  });

  it('kit the gym has → the usual swap, not the missing-kit flow', () => {
    const r = handle(text("there's no hammer curls today"), ctxFor('pull-a'));
    expect(r.reply).toBe(PROPOSAL_REPLY);
    expect(r.chips.some((x) => x.id === 'keepExercise')).toBe(false);
  });

  it('a gymSwap chip for kit the gym has → the usual plan swap', () => {
    const r = handle({ chip: 'gymSwap', args: { exerciseId: 'Hammer_Curls' } }, ctxFor('pull-a'));
    expect(r.reply).toBe(PROPOSAL_REPLY);
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'plan' });
  });

  it('mid-workout: never offered; typed text gets the usual today swap', () => {
    const w = workoutCtx('legs-b', []);
    expect(handle({ chip: 'gymSwap', args: { exerciseId: 'Leg_Press' } }, w).reply).toBe(
      MID_SESSION_REPLY,
    );
    const r = handle(text('my gym has no leg press'), w);
    expect(r.reply).not.toBe(GYM_REPLY);
    expect(r.proposal).toMatchObject({ action: 'swap', scope: 'today' });
    expect(r.chips.some((x) => x.id === 'keepExercise')).toBe(false);
    for (const input of [text('hello'), { chip: 'swap' as const }, { chip: 'lighter' as const }])
      expect(handle(input, w).chips.some((x) => x.id === 'gymSwap')).toBe(false);
  });

  it('Adjust my plan lists missing-kit exercises first, skipping kept ones', () => {
    const r = handle({ chip: 'adjustPlan' }, ctxFor('push-a'));
    expect(r.chips.slice(0, 2)).toEqual([
      {
        id: 'gymSwap',
        label: 'Swap Standing Calf Raises (no kit)',
        args: { exerciseId: 'Standing_Calf_Raises' },
      },
      { id: 'gymSwap', label: 'Swap Leg Press (no kit)', args: { exerciseId: 'Leg_Press' } },
    ]);
    expect(ids(r).slice(2)).toEqual(['deload', 'swap']);
    const kept = handle({ chip: 'adjustPlan' }, ctxFor('push-a', { gymKept: ['Leg_Press'] }));
    expect(kept.chips.filter((x) => x.id === 'gymSwap').map((x) => x.args?.exerciseId)).toEqual([
      'Standing_Calf_Raises',
    ]);
    expectClean(r, 'adjustPlan');
  });

  it('every missing-kit reply passes checkCopy on every day (default gym and a dumbbell gym)', () => {
    for (const catalog of [CATALOG, trainerCatalog(['dumbbells', 'adjustable-bench'])]) {
      for (const dayId of ROTATION) {
        const c = ctxFor(dayId, { catalog });
        for (const d of program.days)
          for (const p of d.exercises) {
            const r = handle({ chip: 'gymSwap', args: { exerciseId: p.exerciseId } }, c);
            expectClean(r, `${dayId}: ${p.exerciseId}`);
          }
      }
    }
  });
});

describe('purity', () => {
  it('uses no network, DOM or clock', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
