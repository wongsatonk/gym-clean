import { describe, expect, it } from 'vitest';
import exercisesJson from '../../data/exercises.json';
import bodyAreasJson from '../../data/bodyAreas.json';
import equipmentJson from '../../data/equipment.json';
import programJson from '../../data/program.json';
import evals from './evals/requests.json';
import { wordCount } from '../advice';
import { applyProposal, type TrainerChange } from './changes';
import { effectiveDay, seedPlan } from './plan';
import type { StallSession } from './actions/stall';
import type { TrainerCatalog } from './swapCandidates';
import {
  AREA_CHIP_IDS,
  MID_SESSION_REPLY,
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
import type { BodyArea, Exercise, Program, SetLog, TrainerState } from '../types';

// Made-up history; the program is the repo's default program (public, no personal numbers).
const exercises = exercisesJson as Exercise[];
const areaByMuscle = new Map<string, BodyArea>();
for (const [area, a] of Object.entries(bodyAreasJson.areas)) {
  for (const m of a.muscles) areaByMuscle.set(m, area as BodyArea);
}
const subs = equipmentJson.substitutes as Record<string, string>;
const CATALOG: TrainerCatalog = {
  exercises,
  areaOf: (m) => areaByMuscle.get(m),
  hasEquipment: (v) => v !== null && equipmentJson.available.includes(subs[v] ?? v),
};
const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);

// 2026-11-11 is a Wednesday. Rest weekday: Sunday (2026-11-15).
const TODAY = '2026-11-11';
const at = (m: number, d: number, h = 18) => new Date(2026, m - 1, d, h, 0).getTime();
const baseState = (): TrainerState => ({ ...seedPlan(program), version: 5 });

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

const ids = (r: CoachResponse) => r.chips.map((c) => c.id);
const text = (t: string): CoachInput => ({ text: t });

function allCopy(r: CoachResponse): string[] {
  const p = r.proposal;
  return [
    r.reply,
    r.say ?? '',
    ...r.chips.map((c) => c.label),
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
    const r = handle({ chip: 'adjustPlan' }, { ...c, state: applied.state, changes });
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['deload', 'swap']);
    // An undone change doesn't count.
    const undone = [{ ...applied.change, undoneAt: at(11, 10, 21) }];
    expect(handle({ chip: 'adjustPlan' }, { ...c, changes: undone }).proposal?.action).toBe(
      'stall',
    );
  });

  it('no stalls → deload or a swap from now on', () => {
    const r = handle({ chip: 'adjustPlan' }, ctxFor('push-a'));
    expect(r.proposal).toBeUndefined();
    expect(ids(r)).toEqual(['deload', 'swap']);
    expect(r.chips[1]?.args?.scope).toBe('plan');
  });
});

describe('purity', () => {
  it('uses no network, DOM or clock', () => {
    expect(source).not.toMatch(
      /\b(fetch|XMLHttpRequest|WebSocket|navigator|window|document|localStorage|Date\.now)\b/,
    );
  });
});
