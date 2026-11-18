import { describe, expect, it } from 'vitest';
import programJson from '../../data/program.json';
import equipmentJson from '../../data/equipment.json';
import { trainerCatalog } from '../testkit/trainerCatalog';
import { applyProposal } from './changes';
import { kitSatisfied, missingInPlan, missingItems, missingKit } from './equipment';
import { seedPlan, type PlanSession } from './plan';
import { proposeSwapOptions } from './actions/swap';
import type { Program, TrainerState } from '../types';

describe('kitSatisfied (M10e)', () => {
  it('is any-of over the lists, all-of within a list', () => {
    const needs = [['dumbbells'], ['kettlebell']];
    expect(kitSatisfied(needs, ['dumbbells'])).toBe(true);
    expect(kitSatisfied(needs, ['kettlebell'])).toBe(true);
    expect(kitSatisfied(needs, ['barbell'])).toBe(false);
    expect(kitSatisfied([['half-rack', 'barbell']], ['barbell'])).toBe(false);
    expect(kitSatisfied([['half-rack', 'barbell']], ['barbell', 'half-rack'])).toBe(true);
  });

  it('bodyweight ([[]]) always works; no lists never does', () => {
    expect(kitSatisfied([[]], [])).toBe(true);
    expect(kitSatisfied([], ['dumbbells'])).toBe(false);
  });
});

describe('missingItems (M10e)', () => {
  it('names the fewest missing items of any list, first list on a tie', () => {
    expect(missingItems([['leg-press']], ['dumbbells'])).toEqual(['leg-press']);
    expect(
      missingItems(
        [
          ['cable-pulley', 'cable-rope'],
          ['cable-pulley', 'cable-lat-bar'],
        ],
        [],
      ),
    ).toEqual(['cable-pulley', 'cable-rope']);
    expect(missingItems([['half-rack', 'barbell'], ['smith-machine']], ['barbell'])).toEqual([
      'half-rack',
    ]);
  });

  it('is empty when the kit is there', () => {
    expect(missingItems([['dumbbells']], ['dumbbells'])).toEqual([]);
    expect(missingItems([[]], [])).toEqual([]);
  });
});

// ---------- missingKit / missingInPlan (task 4) ----------

const program = programJson as Program;
const ROTATION = program.days.map((d) => d.id);
const TODAY = '2026-11-11'; // a Wednesday
const NOW = new Date(2026, 10, 11, 18, 0).getTime();
const baseState = (restWeekdays: number[] = []): TrainerState => {
  const s = seedPlan(program);
  return { ...s, version: 1, schedule: { ...s.schedule, restWeekdays } };
};
/** Sessions so that `dayId` is up next today. */
const sessionsFor = (dayId: string): PlanSession[] => {
  const i = ROTATION.indexOf(dayId);
  const prev = ROTATION[(i + ROTATION.length - 1) % ROTATION.length] ?? '';
  const startedAt = new Date(2026, 10, 10, 18, 0).getTime();
  return i === 0 ? [] : [{ dayId: prev, startedAt, endedAt: startedAt + 3_600_000 }];
};
const CATALOG = trainerCatalog();

describe('missingKit (M10e)', () => {
  it('finds Leg Press on Legs B with his gym', () => {
    expect(missingKit(baseState(), sessionsFor('legs-b'), CATALOG, TODAY, [])).toEqual([
      { dayId: 'legs-b', exerciseId: 'Leg_Press' },
    ]);
  });

  it('finds nothing on a day his gym can run (Push A)', () => {
    expect(missingKit(baseState(), sessionsFor('push-a'), CATALOG, TODAY, [])).toEqual([]);
  });

  it('skips a kept exercise', () => {
    expect(missingKit(baseState(), sessionsFor('legs-b'), CATALOG, TODAY, ['Leg_Press'])).toEqual(
      [],
    );
  });

  it('finds nothing on a rest day', () => {
    // 2026-11-11 is a Wednesday (weekday 3).
    expect(missingKit(baseState([3]), sessionsFor('legs-b'), CATALOG, TODAY, [])).toEqual([]);
  });

  it('finds nothing once the plan was swapped, and again after a today-only swap', () => {
    const state = baseState();
    const ctx = {
      state,
      sessions: sessionsFor('legs-b'),
      today: TODAY,
      unit: 'kg' as const,
      lastWeightKg: {},
    };
    for (const scope of ['plan', 'today'] as const) {
      const r = proposeSwapOptions(ctx, 'Leg_Press', CATALOG, scope);
      if (!r.ok) throw new Error(r.reply);
      const top = r.options[0];
      if (!top) throw new Error('no option');
      const applied = applyProposal(state, top.proposal, NOW, 'chip');
      if (!applied.ok) throw new Error(applied.reason);
      expect(missingKit(applied.state, ctx.sessions, CATALOG, TODAY, []), scope).toEqual([]);
    }
  });

  it('reads the day as it runs (overrides included): an exercise added by an override counts', () => {
    const state = baseState();
    const day = state.plan.days.find((d) => d.id === 'push-a');
    const first = day?.exercises[0];
    if (!day || !first) throw new Error('no push-a');
    state.overrides = [
      {
        date: TODAY,
        dayId: 'push-a',
        adjust: {
          kind: 'swap',
          exercises: [...day.exercises.slice(1), { ...first, exerciseId: 'Leg_Press' }],
        },
      },
    ];
    expect(missingKit(state, sessionsFor('push-a'), CATALOG, TODAY, [])).toEqual([
      { dayId: 'push-a', exerciseId: 'Leg_Press' },
    ]);
  });
});

describe('missingInPlan (M10e)', () => {
  it('lists every plan day with kit his gym lacks, in plan order', () => {
    expect(missingInPlan(baseState(), CATALOG, [])).toEqual([
      { dayId: 'legs-a', exerciseId: 'Standing_Calf_Raises' },
      { dayId: 'legs-b', exerciseId: 'Leg_Press' },
    ]);
    expect(missingInPlan(baseState(), CATALOG, ['Standing_Calf_Raises'])).toEqual([
      { dayId: 'legs-b', exerciseId: 'Leg_Press' },
    ]);
  });

  it('is empty for a gym with everything', () => {
    const all = trainerCatalog(equipmentJson.items.map((i) => i.id));
    expect(missingInPlan(baseState(), all, [])).toEqual([]);
  });
});
