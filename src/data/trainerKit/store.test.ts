import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TRAINER_KIT_DEFAULTS } from '../../core/trainerKit/defaults';
import type { DayFeel, Goal, Intake, Measurement, TodoStep } from '../../core/types';
import { GymDb } from '../db';
import { exportAll as exportDevLog, startDevLogSession } from '../devlog';
import { applyDecision } from '../todos/store';
import { TODO_TOPICS } from '../todos/topics';
import {
  INTAKE_KEY,
  TRAINER_KIT_KEY,
  deleteDayFeel,
  deleteGoal,
  deleteMeasurement,
  getDayFeel,
  getIntake,
  getTrainerKit,
  listDayFeels,
  listGoals,
  listMeasurements,
  saveDayFeel,
  saveGoal,
  saveIntake,
  saveMeasurement,
} from './store';

// Made-up data only (public repo).
const T0 = new Date(2026, 10, 17, 9).getTime();

let n = 0;
let db: GymDb;
beforeEach(async () => {
  db = new GymDb(`trainer-kit-${n++}`);
  await db.open();
});
afterEach(async () => {
  db.close();
  await db.delete();
});

const reopen = async (): Promise<void> => {
  const name = db.name;
  db.close();
  db = new GymDb(name);
  await db.open();
};

describe('getTrainerKit', () => {
  it('returns the defaults without a row', async () => {
    expect(await getTrainerKit(db)).toEqual(TRAINER_KIT_DEFAULTS);
    expect(await db.settings.get(TRAINER_KIT_KEY)).toBeUndefined();
  });

  it('returns the stored values after the M12-q4 decision step writes the row', async () => {
    const step = TODO_TOPICS.flatMap((t) => t.steps).find(
      (s): s is Extract<TodoStep, { kind: 'ask' }> =>
        s.kind === 'ask' && s.setting?.key === TRAINER_KIT_KEY,
    );
    expect(step).toBeDefined();
    expect(await applyDecision(db, step as TodoStep, 'keep')).toBe(true);
    expect((await db.settings.get('trainerKit'))?.value).toEqual(TRAINER_KIT_DEFAULTS);
    expect(await getTrainerKit(db)).toEqual(TRAINER_KIT_DEFAULTS);
  });

  it('follows a later change to the row, merged with the defaults', async () => {
    await db.settings.put({
      key: 'trainerKit',
      value: { reviewWeeks: 6, warmups: 'off', measurementSites: ['waist', 'hips'] },
    });
    expect(await getTrainerKit(db)).toEqual({
      measurementSites: ['waist', 'hips'],
      e1rmFormula: 'epley',
      warmups: 'off',
      reviewWeeks: 6,
    });
    await reopen();
    expect((await getTrainerKit(db)).reviewWeeks).toBe(6);
  });

  it('reads a damaged row as the defaults and never writes', async () => {
    await db.settings.put({ key: 'trainerKit', value: 'broken' });
    expect(await getTrainerKit(db)).toEqual(TRAINER_KIT_DEFAULTS);
    expect((await db.settings.get('trainerKit'))?.value).toBe('broken');
  });
});

const intake = (over: Partial<Intake> = {}): Intake => ({
  goalKind: 'fat',
  goalText: 'Made-up goal words',
  days: 3,
  sessionMin: 45,
  experience: 'new',
  easyOn: ['shoulders'],
  at: T0,
  ...over,
});

describe('intake (settings key "intake")', () => {
  it('is undefined until saved, then round-trips and survives a reopen', async () => {
    expect(await getIntake(db)).toBeUndefined();
    await saveIntake(db, intake());
    expect(INTAKE_KEY).toBe('intake');
    expect((await db.settings.get('intake'))?.value).toEqual(intake());
    await reopen();
    expect(await getIntake(db)).toEqual(intake());
  });

  it('a re-run replaces the earlier answers and touches no other setting', async () => {
    await db.settings.put({ key: 'unit', value: 'lb' });
    await saveIntake(db, intake());
    await saveIntake(db, intake({ goalKind: 'muscle', days: 5, at: T0 + 1 }));
    expect(await getIntake(db)).toMatchObject({ goalKind: 'muscle', days: 5, at: T0 + 1 });
    expect((await db.settings.get('unit'))?.value).toBe('lb');
    expect(await db.settings.count()).toBe(2);
  });

  it('keeps the M13c abs answer (wantsCore) and drops a non-boolean one', async () => {
    await saveIntake(db, intake({ wantsCore: true }));
    expect(await getIntake(db)).toEqual(intake({ wantsCore: true }));
    await saveIntake(db, intake({ wantsCore: false }));
    expect((await getIntake(db))?.wantsCore).toBe(false);
    await db.settings.put({ key: 'intake', value: { ...intake(), wantsCore: 'yes' } });
    expect(await getIntake(db)).toEqual(intake());
  });

  it('trims the own-words goal, drops an empty one and repeated easy-on areas', async () => {
    await saveIntake(
      db,
      intake({ goalText: '  Made-up words  ', easyOn: ['legs', 'legs', 'core'] }),
    );
    expect(await getIntake(db)).toEqual(
      intake({ goalText: 'Made-up words', easyOn: ['legs', 'core'] }),
    );
    await saveIntake(db, intake({ goalText: '   ' }));
    const got = await getIntake(db);
    expect(got).toBeDefined();
    expect(got && 'goalText' in got).toBe(false);
  });

  it('refuses answers outside the choices and writes nothing', async () => {
    const bad: Partial<Record<keyof Intake, unknown>>[] = [
      { goalKind: 'bulk' },
      { days: 1 },
      { days: 7 },
      { days: 3.5 },
      { sessionMin: 50 },
      { experience: 'pro' },
      { easyOn: ['neck'] },
      { easyOn: 'legs' },
      { at: NaN },
      { goalText: 5 },
    ];
    for (const over of bad) {
      await expect(saveIntake(db, { ...intake(), ...over } as Intake)).rejects.toThrow(RangeError);
    }
    expect(await db.settings.get('intake')).toBeUndefined();
  });

  it('reads a damaged stored row as no intake', async () => {
    await db.settings.put({ key: 'intake', value: { goalKind: 'fat' } });
    expect(await getIntake(db)).toBeUndefined();
  });
});

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  text: 'Made-up press 40 kg x 8',
  target: { kind: 'lift', ref: 'Dumbbell_Bench_Press', value: 40, reps: 8 },
  due: '2027-02-01',
  createdAt: T0,
  ...over,
});

describe('goals', () => {
  it('saves, lists oldest first, replaces by id and survives a reopen', async () => {
    expect(await listGoals(db)).toEqual([]);
    await saveGoal(
      db,
      goal({ id: 'g2', createdAt: T0 + 5, target: { kind: 'weight', value: 62 } }),
    );
    await saveGoal(db, goal());
    expect((await listGoals(db)).map((g) => g.id)).toEqual(['g1', 'g2']);
    await saveGoal(db, goal({ doneAt: T0 + 9 }));
    await reopen();
    const all = await listGoals(db);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(goal({ doneAt: T0 + 9 }));
    expect(all[1]?.target).toEqual({ kind: 'weight', value: 62 });
  });

  it('deletes one and returns it for Undo', async () => {
    await saveGoal(db, goal());
    expect(await deleteGoal(db, 'nope')).toBeUndefined();
    const removed = await deleteGoal(db, 'g1');
    expect(removed).toEqual(goal());
    expect(await listGoals(db)).toEqual([]);
    await saveGoal(db, removed as Goal);
    expect(await listGoals(db)).toEqual([goal()]);
  });

  it('refuses a goal without an id, text, a real date or a measurable target', async () => {
    const bad: Partial<Record<keyof Goal, unknown>>[] = [
      { id: '' },
      { text: '  ' },
      { due: '01/02/2027' },
      { due: '2027-02-31' },
      { createdAt: NaN },
      { doneAt: 'x' },
      { target: { kind: 'mood', value: 1 } },
      { target: { kind: 'lift', value: 0 } },
      { target: { kind: 'lift', value: NaN } },
      { target: { kind: 'lift', value: 40, reps: 0 } },
      { target: { kind: 'measurement', value: 30, ref: 4 } },
      { target: undefined },
    ];
    for (const over of bad) {
      await expect(saveGoal(db, { ...goal(), ...over } as Goal)).rejects.toThrow(RangeError);
    }
    expect(await db.goals.count()).toBe(0);
  });
});

describe('measurements', () => {
  const m = (date: string, site: string, cm: number): Measurement => ({ date, site, cm });

  it('keeps one value per date and site, listed by date then site', async () => {
    await saveMeasurement(db, m('2026-11-17', 'waist', 80));
    await saveMeasurement(db, m('2026-10-17', 'waist', 81.5));
    await saveMeasurement(db, m('2026-11-17', 'chest', 95));
    await saveMeasurement(db, m('2026-11-17', 'waist', 79.5));
    await reopen();
    expect(await listMeasurements(db)).toEqual([
      m('2026-10-17', 'waist', 81.5),
      m('2026-11-17', 'chest', 95),
      m('2026-11-17', 'waist', 79.5),
    ]);
  });

  it('lists from a date on', async () => {
    await saveMeasurement(db, m('2026-10-17', 'waist', 81.5));
    await saveMeasurement(db, m('2026-11-17', 'waist', 80));
    expect(await listMeasurements(db, '2026-11-01')).toEqual([m('2026-11-17', 'waist', 80)]);
    expect(await listMeasurements(db, '2026-11-17')).toHaveLength(1);
    expect(await listMeasurements(db, '2026-11-18')).toEqual([]);
  });

  it('keeps a site that is no longer in the trainer-kit list (history stays)', async () => {
    await saveMeasurement(db, m('2026-11-17', 'neck', 38));
    expect(await listMeasurements(db)).toEqual([m('2026-11-17', 'neck', 38)]);
  });

  it('deletes one and returns it for Undo', async () => {
    await saveMeasurement(db, m('2026-11-17', 'waist', 80));
    await saveMeasurement(db, m('2026-11-17', 'chest', 95));
    expect(await deleteMeasurement(db, '2026-11-17', 'hips')).toBeUndefined();
    expect(await deleteMeasurement(db, '2026-11-17', 'waist')).toEqual(
      m('2026-11-17', 'waist', 80),
    );
    expect(await listMeasurements(db)).toEqual([m('2026-11-17', 'chest', 95)]);
  });

  it('refuses a bad date, an empty site or a size that is not a positive number', async () => {
    const bad: Measurement[] = [
      m('17-11-2026', 'waist', 80),
      m('2026-13-01', 'waist', 80),
      m('2026-11-17', '', 80),
      m('2026-11-17', 'waist', 0),
      m('2026-11-17', 'waist', -3),
      m('2026-11-17', 'waist', NaN),
      m('2026-11-17', 'waist', Infinity),
    ];
    for (const row of bad) await expect(saveMeasurement(db, row)).rejects.toThrow(RangeError);
    expect(await db.measurements.count()).toBe(0);
  });

  it('stores only the known fields', async () => {
    await saveMeasurement(db, { ...m('2026-11-17', 'waist', 80), extra: 'x' } as Measurement);
    expect(await db.measurements.toArray()).toEqual([m('2026-11-17', 'waist', 80)]);
  });
});

describe('day feels', () => {
  it('keeps one row per date and survives a reopen', async () => {
    expect(await getDayFeel(db, '2026-11-17')).toBeUndefined();
    await saveDayFeel(db, { date: '2026-11-17', energy: 2 });
    await saveDayFeel(db, { date: '2026-11-17', energy: 4, sore: ['legs', 'legs', 'back'] });
    await reopen();
    expect(await getDayFeel(db, '2026-11-17')).toEqual({
      date: '2026-11-17',
      energy: 4,
      sore: ['legs', 'back'],
    });
    expect(await db.dayFeels.count()).toBe(1);
  });

  it('stores energy alone or soreness alone, without empty fields', async () => {
    await saveDayFeel(db, { date: '2026-11-16', energy: 5, sore: [] });
    await saveDayFeel(db, { date: '2026-11-17', sore: ['arms'] });
    expect(await listDayFeels(db)).toEqual([
      { date: '2026-11-16', energy: 5 },
      { date: '2026-11-17', sore: ['arms'] },
    ]);
  });

  it('an answer with nothing in it removes the day', async () => {
    await saveDayFeel(db, { date: '2026-11-17', energy: 3 });
    await saveDayFeel(db, { date: '2026-11-17', sore: [] });
    expect(await getDayFeel(db, '2026-11-17')).toBeUndefined();
  });

  it('lists from a date on, oldest first', async () => {
    await saveDayFeel(db, { date: '2026-11-17', energy: 3 });
    await saveDayFeel(db, { date: '2026-11-10', energy: 1 });
    expect((await listDayFeels(db)).map((f) => f.date)).toEqual(['2026-11-10', '2026-11-17']);
    expect((await listDayFeels(db, '2026-11-11')).map((f) => f.date)).toEqual(['2026-11-17']);
  });

  it('deletes one and returns it for Undo', async () => {
    await saveDayFeel(db, { date: '2026-11-17', energy: 3 });
    expect(await deleteDayFeel(db, '2026-11-01')).toBeUndefined();
    expect(await deleteDayFeel(db, '2026-11-17')).toEqual({ date: '2026-11-17', energy: 3 });
    expect(await db.dayFeels.count()).toBe(0);
  });

  it('refuses a bad date, energy outside 1–5 or an unknown area', async () => {
    const bad = [
      { date: 'today', energy: 3 },
      { date: '2026-11-17', energy: 0 },
      { date: '2026-11-17', energy: 6 },
      { date: '2026-11-17', energy: 2.5 },
      { date: '2026-11-17', sore: ['neck'] },
      { date: '2026-11-17', sore: 'legs' },
    ];
    for (const row of bad) {
      await expect(saveDayFeel(db, row as unknown as DayFeel)).rejects.toThrow(RangeError);
    }
    expect(await db.dayFeels.count()).toBe(0);
  });
});

describe('developer log', () => {
  it('carries no goal, measurement, day feel or intake answer', async () => {
    const rec = await startDevLogSession(db, { dayId: 'push-a', settings: {} }, { now: () => T0 });
    await saveIntake(db, intake({ goalText: 'Made-up private words' }));
    await saveGoal(db, goal({ text: 'Made-up private goal' }));
    await saveMeasurement(db, { date: '2026-11-17', site: 'waist', cm: 80.25 });
    await saveDayFeel(db, { date: '2026-11-17', energy: 2, sore: ['legs'] });
    await rec.finish(T0 + 1);
    const text = JSON.stringify(await exportDevLog(db, T0 + 2));
    expect(text).not.toMatch(/Made-up private|waist|80\.25|energy|sore|goalKind|sessionMin/);
  });
});
