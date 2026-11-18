import { afterEach, describe, expect, it } from 'vitest';
import type { HealthDay, ReadinessSignal } from '../types';
import { checkHealthCopy } from './copy';
import { readinessCard, readinessSignals } from './readiness';

/** Every made-up week in ./fixtures must give exactly its expected signals and card. */
type Fixture = {
  note: string;
  date: string;
  now: string;
  timeZone: string;
  trainingDay: boolean;
  expect: { signals: ReadinessSignal[]; offer: 'lighter' | 'deload' | null };
  days: HealthDay[];
};

const files = import.meta.glob<Fixture>('./fixtures/*.json', { eager: true, import: 'default' });

const tz = process.env.TZ;
afterEach(() => {
  if (tz === undefined) delete process.env.TZ;
  else process.env.TZ = tz;
});

describe('readiness fixtures', () => {
  it('has the five SPEC weeks', () => {
    const names = Object.keys(files).map((f) => f.replace(/^.*\/|\.json$/g, ''));
    for (const n of [
      'normal-week',
      'short-sleep-high-rhr',
      'one-signal-only',
      'sparse-data',
      'mixed-hrv-sources',
    ]) {
      expect(names).toContain(n);
    }
  });

  it.each(Object.entries(files))('%s', (_, f) => {
    process.env.TZ = f.timeZone;
    const now = Date.parse(f.now);
    expect(readinessSignals(f.days, f.date, now).map((s) => s.signal)).toEqual(f.expect.signals);
    const card = readinessCard({ date: f.date, now, days: f.days, trainingDay: f.trainingDay });
    expect(card?.offer ?? null).toBe(f.expect.offer);
    for (const r of card?.reasons ?? []) expect(checkHealthCopy(r).hits).toEqual([]);
  });
});
